/**
 * Prism — import → Survey materialization.
 *
 * A Prism import has no pre-existing Survey, but `responses.survey_id` is NOT NULL:
 * every response must hang off a survey. So an import MATERIALIZES a survey — one
 * canonical `surveys` row per import job — and the LOAD stage attaches the imported
 * responses to it. This is the platform-correct shape: the imported corpus shows up
 * in the normal Surveys list and "See insights" works on it exactly like a
 * natively-authored survey (root CLAUDE.md "the app executes; the backend persists").
 *
 * Idempotent: the resulting survey_id is stored on the job cursor (`cursor.survey_id`),
 * so a resumed/retried job reuses the same survey instead of creating duplicates. The
 * worker's `targetSurveyId(job, conn)` already reads `cursor.survey_id`, so once this
 * helper has run, LOAD/ENRICH/PUBLISH all resolve the same materialized survey.
 *
 * Survey shape:
 *   - For survey/XM connectors that imported a `survey_def` raw record, the survey is
 *     built FROM that definition (title + questions) when present.
 *   - Otherwise the survey is SYNTHESIZED from the confirmed field mappings: one
 *     question per mapped field that targets a real Xperiq QuestionType; fields mapped
 *     to embedded_data / preserve / display_text become embedded-data definitions
 *     (carried in `metadata.prism.embedded_data`), never questions.
 *
 * Boundary: this is engine-layer persistence only. It never calls CrystalOS and never
 * mutates anything outside the new `surveys` row + the job cursor.
 */
import type { PoolClient } from 'pg';
import type { FieldMapping, PrismJob } from '../../types/prism';
import { pool, query } from '../db';
import logger from '../logger';

/** Field targets that are NOT survey questions — they become embedded data. */
const NON_QUESTION_TARGETS = new Set(['embedded_data', 'preserve', 'display_text']);

/** A question object as stored in `surveys.questions` (JSONB; same shape the app authors). */
interface ImportQuestion {
  id: string;
  type: string;                 // the mapped Xperiq QuestionType (verbatim target)
  question: string;             // human label (source field label / id)
  required: boolean;
  metric?: 'nps' | 'csat' | 'ces' | null;
  source_field: string;         // provenance: the source field this came from
  origin: 'prism_import';
}

/** An embedded-data field definition (preserved, lossless — not a question). */
interface ImportEmbeddedField {
  id: string;
  label: string;
  source_field: string;
  action: string;               // embedded_data | preserve | display_text
}

/** A minimal connection view (what the engine has in hand at confirm time). */
export interface ImportConnectionInfo {
  id: string;
  platform: string;
  label?: string | null;
  config?: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Title derivation
// ─────────────────────────────────────────────────────────────────────────────

/** Strip the upload uuid/scheme from a `prism-upload://{org}/{uuid}/{safeName}` ref → safeName. */
function filenameFromFileRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith('prism-upload://')) return null;
  const parts = ref.slice('prism-upload://'.length).split('/');
  const name = parts[parts.length - 1];
  return name && name.trim() ? name : null;
}

/** First file ref carried on the connection config (config.files[] or config.fileRef). */
function firstFileRef(config: Record<string, unknown> | null | undefined): string | null {
  const cfg = config ?? {};
  if (Array.isArray(cfg.files)) {
    for (const entry of cfg.files) {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') {
        const fr = (entry as Record<string, unknown>).fileRef;
        if (typeof fr === 'string') return fr;
      }
    }
  }
  if (typeof cfg.fileRef === 'string') return cfg.fileRef;
  return null;
}

/**
 * A sensible survey title: source survey-def name → uploaded filename → connection
 * label → platform. Falls back to "Imported data" so the title is never empty.
 */
function deriveTitle(
  conn: ImportConnectionInfo,
  surveyDefName: string | null,
): string {
  if (surveyDefName && surveyDefName.trim()) return surveyDefName.trim();
  const fileName = filenameFromFileRef(firstFileRef(conn.config));
  if (fileName) return `Imported — ${fileName}`;
  if (conn.label && conn.label.trim() && conn.label.trim() !== conn.platform) {
    return `Imported — ${conn.label.trim()}`;
  }
  if (conn.platform && conn.platform.trim()) return `Imported from ${conn.platform.trim()}`;
  return 'Imported data';
}

// ─────────────────────────────────────────────────────────────────────────────
// Question/embedded derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort survey-def shape: `{ name?, title?, questions?: { <qid>: { questionText? } } }`
 * (Qualtrics survey-definition shape — generic enough for other XM defs). Returns the
 * name + a question list when the payload looks like a definition, else null.
 */
function fromSurveyDef(payload: unknown): { name: string | null; questions: ImportQuestion[] } | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name : typeof obj.title === 'string' ? obj.title : null;
  const rawQuestions = obj.questions;
  if (!rawQuestions || typeof rawQuestions !== 'object' || Array.isArray(rawQuestions)) {
    // No question map — only usable for the title.
    return name ? { name, questions: [] } : null;
  }
  const questions: ImportQuestion[] = [];
  for (const [qid, q] of Object.entries(rawQuestions as Record<string, unknown>)) {
    const qq = (q ?? {}) as Record<string, unknown>;
    const qType = qq.questionType as Record<string, unknown> | undefined;
    const type = typeof qType?.type === 'string' ? (qType.type as string) : 'open_text';
    const text = typeof qq.questionText === 'string' ? (qq.questionText as string) : qid;
    questions.push({
      id: qid,
      type,
      question: text,
      required: false,
      metric: null,
      source_field: qid,
      origin: 'prism_import',
    });
  }
  return { name, questions };
}

/** Split confirmed mappings into survey questions + embedded-data definitions. */
function fromMappings(mappings: FieldMapping[]): {
  questions: ImportQuestion[];
  embedded: ImportEmbeddedField[];
} {
  const questions: ImportQuestion[] = [];
  const embedded: ImportEmbeddedField[] = [];
  for (const m of mappings) {
    const label = m.source_field;
    if (NON_QUESTION_TARGETS.has(m.target)) {
      embedded.push({
        id: m.source_field,
        label,
        source_field: m.source_field,
        action: m.target,
      });
      continue;
    }
    questions.push({
      id: m.source_field,
      type: m.target,                 // the mapped Xperiq QuestionType
      question: label,
      required: false,
      metric: m.metric ?? null,
      source_field: m.source_field,
      origin: 'prism_import',
    });
  }
  return { questions, embedded };
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureImportSurvey
// ─────────────────────────────────────────────────────────────────────────────

export interface EnsureImportSurveyArgs {
  orgId: string;
  job: PrismJob;
  connection: ImportConnectionInfo;
  mappings: FieldMapping[];
  /** Optional source survey-definition payload (survey/XM imports); built-from when present. */
  surveyDef?: unknown;
}

/**
 * Idempotently materialize the survey for an import job and return its id.
 *
 * If `cursor.survey_id` is already set (and still resolves to a live, org-scoped
 * survey), it is reused — so resumes/retries never create duplicates. Otherwise a new
 * `surveys` row (status 'active') is created from the survey-def (preferred) or the
 * confirmed mappings, and its id is persisted onto the job cursor.
 *
 * The whole materialize-then-persist runs in one transaction so a crash can't leave a
 * survey row without the cursor pointer that makes the job reuse it.
 */
export async function ensureImportSurvey(args: EnsureImportSurveyArgs): Promise<string> {
  const { orgId, job, connection, mappings } = args;

  // ── Idempotency: reuse a previously-materialized survey for this job ──────────
  const cursor = (job.cursor ?? {}) as Record<string, unknown>;
  const existing = typeof cursor.survey_id === 'string' ? (cursor.survey_id as string) : null;
  if (existing) {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [existing, orgId],
    );
    if (rows[0]) return rows[0].id;
    // Cursor pointed at a missing/deleted survey → fall through and re-materialize.
  }

  // ── Build the survey shape: prefer the source survey-def, else the mappings ──
  const def = fromSurveyDef(args.surveyDef);
  const { questions: mappedQuestions, embedded } = fromMappings(mappings);
  const questions = def && def.questions.length > 0 ? def.questions : mappedQuestions;
  const title = deriveTitle(connection, def?.name ?? null);

  const metadata = {
    prism: {
      imported: true,
      source_platform: connection.platform,
      connection_id: connection.id,
      job_id: job.id,
      embedded_data: embedded,
    },
  };

  // ── Create the row + persist the pointer atomically ──────────────────────────
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO surveys
         (org_id, title, description, status, questions, created_by, metadata)
       VALUES ($1, $2, $3, 'active', $4::jsonb, $5, $6::jsonb)
       RETURNING id`,
      [
        orgId,
        title,
        null,
        JSON.stringify(questions),
        job.created_by,
        JSON.stringify(metadata),
      ],
    );
    const surveyId = rows[0].id;
    // Stamp the survey id on the job cursor so re-runs reuse it (the worker's
    // targetSurveyId reads cursor.survey_id for LOAD/ENRICH/PUBLISH).
    await client.query(
      `UPDATE prism_jobs
          SET cursor = COALESCE(cursor, '{}'::jsonb) || $3::jsonb, updated_at = now()
        WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [job.id, orgId, JSON.stringify({ survey_id: surveyId })],
    );
    await client.query('COMMIT');
    logger.info(
      { orgId, jobId: job.id, surveyId, questions: questions.length, embedded: embedded.length, fromDef: !!(def && def.questions.length) },
      'prism:survey materialized import survey',
    );
    return surveyId;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error(
      { orgId, jobId: job.id, err: (err as Error).message },
      'prism:survey ensureImportSurvey failed',
    );
    throw err;
  } finally {
    client.release();
  }
}
