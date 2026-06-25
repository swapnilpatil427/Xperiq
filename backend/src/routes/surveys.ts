import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { createSurveySchema, updateSurveySchema } from '../schemas/surveys';
import { generateTokensSchema } from '../schemas/contacts';
import { query, pool } from '../lib/db';
import { surveysCreated } from '../lib/metrics';
import logger from '../lib/logger';
import * as agentsClient from '../lib/agentsClient';
import { serverError, clientError } from '../lib/httpError';
import { publishResponseEvent } from '../lib/redisStream';
import { maybeAutoAnalyze } from '../triggers/autoAnalyze';

const router = express.Router();

// ── Password helpers (uses Node crypto — no external dep) ─────────────────────
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  try {
    const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

// Migrate: add only what is intrinsic to a survey run.
// Template-derived fields (tags, estimated_minutes, intelligence, metrics) live on the template.
// Audit trail columns cover the full lifecycle of each survey.
async function ensureColumns(): Promise<void> {
  const cols = [
    // Run context
    'ADD COLUMN IF NOT EXISTS template_id TEXT',
    'ADD COLUMN IF NOT EXISTS intent TEXT',
    'ADD COLUMN IF NOT EXISTS thank_you_message TEXT',
    // Audit trail
    'ADD COLUMN IF NOT EXISTS updated_by TEXT',
    'ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS insight_schedule_enabled BOOLEAN NOT NULL DEFAULT TRUE',
    // Launch settings
    'ADD COLUMN IF NOT EXISTS max_responses INT',
    'ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS allow_multiple_responses BOOLEAN NOT NULL DEFAULT TRUE',
    // Password protection
    'ADD COLUMN IF NOT EXISTS password_protected BOOLEAN NOT NULL DEFAULT FALSE',
    'ADD COLUMN IF NOT EXISTS password_hash TEXT',
    // Per-survey context for AI specialist routing
    `ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
  ];
  for (const col of cols) {
    await query(`ALTER TABLE surveys ${col}`).catch(() => {});
  }

  // Expand status CHECK constraint to include 'closed'.
  // Drop the old constraint (name varies), then add the new one idempotently.
  await query(`
    DO $$
    BEGIN
      ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_status_check;
      ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_status_check1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `).catch(() => {});
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'surveys'::regclass
          AND conname = 'surveys_status_valid'
      ) THEN
        ALTER TABLE surveys
          ADD CONSTRAINT surveys_status_valid
          CHECK (status IN ('draft','active','paused','closed'));
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;
  `).catch(() => {});
}
ensureColumns().catch(err => logger.error({ err: (err as Error).message }, 'surveys:ensureColumns failed'));

// ── helpers ───────────────────────────────────────────────────────────────────

// Status → lifecycle timestamp mapping
const STATUS_TIMESTAMPS: Record<string, string | null> = {
  active: null,        // published_at is set on the /publish route, not here
  paused: 'paused_at',
  closed: 'closed_at',
};

// ── LIST — with server-side search, filter, sort, pagination ─────────────────
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      q, status, survey_type_id,
      sort_by = 'updated_at', sort_order = 'desc',
      page = '1', limit = '20',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page,  10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitNum;

    // tag_ids filter: comma-separated list of tag UUIDs
    const tagIdsRaw = req.query.tag_ids as string | undefined;
    const tagIds = tagIdsRaw ? tagIdsRaw.split(',').filter(Boolean) : [];

    const where = ['s.org_id = $1', 's.deleted_at IS NULL'];
    const vals: unknown[]  = [req.orgId];
    let i = 2;

    if (q && q.trim().length >= 2) {
      where.push(`(s.title ILIKE $${i} OR s.description ILIKE $${i})`);
      vals.push(`%${q.trim()}%`);
      i++;
    }

    const statusList = status ? status.split(',').filter(Boolean) : [];
    if (statusList.length > 0) {
      where.push(`s.status = ANY($${i}::text[])`);
      vals.push(statusList);
      i++;
    }

    const typeList = survey_type_id ? survey_type_id.split(',').filter(Boolean) : [];
    if (typeList.length > 0) {
      where.push(`s.survey_type_id = ANY($${i}::text[])`);
      vals.push(typeList);
      i++;
    }

    // Filter by tag_ids: only include surveys tagged with at least one of the given tags
    if (tagIds.length > 0) {
      where.push(
        `s.id IN (
           SELECT DISTINCT survey_id FROM survey_tag_mappings
           WHERE tag_id = ANY($${i}::uuid[]) AND org_id = $1
         )`
      );
      vals.push(tagIds);
      i++;
    }

    const ALLOWED_SORT: Record<string, string> = { updated_at: 's.updated_at', created_at: 's.created_at', title: 's.title', response_count: 'response_count' };
    const sortExpr = ALLOWED_SORT[sort_by as string] || 's.updated_at';
    const sortDir  = sort_order === 'asc' ? 'ASC' : 'DESC';
    const whereSQL = `WHERE ${where.join(' AND ')}`;

    const [statsRes, countRes, rowsRes] = await Promise.all([
      // Org-wide KPI stats (always unfiltered)
      query(
        `SELECT
           COUNT(s.id)::int                                          AS total_surveys,
           COUNT(s.id) FILTER (WHERE s.status = 'active')::int      AS active_surveys,
           COALESCE(SUM(rc.cnt), 0)::int                            AS total_responses,
           ROUND(AVG(s.nps_score)::numeric, 1)                      AS avg_nps
         FROM surveys s
         LEFT JOIN (SELECT survey_id, COUNT(*) AS cnt FROM responses GROUP BY survey_id) rc
               ON rc.survey_id = s.id
         WHERE s.org_id = $1 AND s.deleted_at IS NULL`,
        [req.orgId]
      ),
      // Filtered total count for pagination
      query(`SELECT COUNT(s.id)::int AS total FROM surveys s ${whereSQL}`, vals),
      // Filtered paginated results — includes 7-day response sparkline
      query(
        `SELECT s.*,
                COUNT(r.id)::int                                       AS response_count,
                COALESCE((
                  SELECT json_agg(d.cnt ORDER BY d.day)
                  FROM (
                    SELECT DATE_TRUNC('day', r2.submitted_at)          AS day,
                           COUNT(r2.id)::int                           AS cnt
                    FROM   responses r2
                    WHERE  r2.survey_id = s.id
                      AND  r2.submitted_at >= NOW() - INTERVAL '7 days'
                    GROUP BY day
                  ) d
                ), '[]'::json)                                          AS sparkline
         FROM surveys s
         LEFT JOIN responses r ON r.survey_id = s.id
         ${whereSQL}
         GROUP BY s.id
         ORDER BY ${sortExpr} ${sortDir}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limitNum, offset]
      ),
    ]);

    const surveys = rowsRes.rows;
    const total   = (countRes.rows[0] as { total: number }).total;

    // Attach tags to each survey in the list
    if (surveys.length > 0) {
      const surveyIdList = surveys.map((s: Record<string, unknown>) => s.id);
      const { rows: tagRows } = await query(
        `SELECT m.survey_id, t.id, t.name, t.slug, t.color
         FROM survey_tag_mappings m
         JOIN survey_tags t ON t.id = m.tag_id
         WHERE m.survey_id = ANY($1::uuid[]) AND m.org_id = $2
         ORDER BY t.name`,
        [surveyIdList, req.orgId]
      ).catch(() => ({ rows: [] }));

      const tagsBySurvey: Record<string, unknown[]> = {};
      for (const row of tagRows as Record<string, unknown>[]) {
        const sid = row.survey_id as string;
        if (!tagsBySurvey[sid]) tagsBySurvey[sid] = [];
        tagsBySurvey[sid].push({ id: row.id, name: row.name, slug: row.slug, color: row.color });
      }
      for (const survey of surveys as Record<string, unknown>[]) {
        const sid = survey.id as string;
        survey.tags = tagsBySurvey[sid] || [];
      }
    }

    res.json({
      surveys,
      total,
      page:     pageNum,
      limit:    limitNum,
      hasMore:  offset + surveys.length < total,
      stats:    statsRes.rows[0],
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET ONE ───────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT s.*, COUNT(r.id)::int AS response_count
       FROM surveys s
       LEFT JOIN responses r ON r.survey_id = s.id
       WHERE s.id = $1 AND s.org_id = $2 AND s.deleted_at IS NULL
       GROUP BY s.id`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Survey not found' }); return; }

    const survey = rows[0] as Record<string, unknown>;

    // Attach tags
    const { rows: tagRows } = await query(
      `SELECT t.id, t.name, t.slug, t.color
       FROM survey_tag_mappings m
       JOIN survey_tags t ON t.id = m.tag_id
       WHERE m.survey_id = $1 AND m.org_id = $2
       ORDER BY t.name`,
      [survey.id, req.orgId]
    ).catch(() => ({ rows: [] }));
    survey.tags = (tagRows as Record<string, unknown>[]).map(t => ({ id: t.id, name: t.name, slug: t.slug, color: t.color }));

    res.json({ survey });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── CREATE ────────────────────────────────────────────────────────────────────
// Only survey-run fields are accepted; template-level data stays on the template.
router.post('/', requireAuth, requireRole('analyst'), validate(createSurveySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      questions = [],
      survey_type_id,
      template_id,
      intent,
      thank_you_message,
      metadata,
    } = req.body as Record<string, unknown>;

    const { rows } = await query(
      `INSERT INTO surveys
         (org_id, title, description, status, questions, created_by,
          survey_type_id, template_id, intent, thank_you_message, metadata)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.orgId,
        title,
        description || null,
        JSON.stringify(questions),
        req.userId,
        survey_type_id || null,
        template_id || null,
        intent || null,
        thank_you_message || null,
        JSON.stringify(metadata || {}),
      ]
    );
    surveysCreated.inc({ type: (survey_type_id as string) || 'untyped' });
    res.status(201).json({ survey: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
// Handles field updates and lifecycle status transitions.
router.put('/:id', requireAuth, requireRole('analyst'), validate(updateSurveySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      status,
      questions,
      survey_type_id,
      template_id,
      intent,
      thank_you_message,
      metadata,
    } = req.body as Record<string, unknown>;

    const sets = ['updated_at = NOW()', `updated_by = $${1}`];
    const vals: unknown[] = [req.userId];
    let i = 2;

    if (title             !== undefined) { sets.push(`title = $${i++}`);             vals.push(title); }
    if (description       !== undefined) { sets.push(`description = $${i++}`);       vals.push(description); }
    if (questions         !== undefined) { sets.push(`questions = $${i++}`);         vals.push(JSON.stringify(questions)); }
    if (survey_type_id    !== undefined) { sets.push(`survey_type_id = $${i++}`);    vals.push(survey_type_id); }
    if (template_id       !== undefined) { sets.push(`template_id = $${i++}`);       vals.push(template_id); }
    if (intent            !== undefined) { sets.push(`intent = $${i++}`);            vals.push(intent); }
    if (thank_you_message !== undefined) { sets.push(`thank_you_message = $${i++}`); vals.push(thank_you_message); }
    if (metadata          !== undefined) { sets.push(`metadata = $${i++}`);          vals.push(JSON.stringify(metadata)); }

    // Status transition — track lifecycle timestamps
    if (status !== undefined) {
      sets.push(`status = $${i++}`);
      vals.push(status);
      const tsCol = STATUS_TIMESTAMPS[status as string];
      if (tsCol) sets.push(`${tsCol} = NOW()`);
    }

    vals.push(req.params.id, req.orgId);
    const { rowCount } = await query(
      `UPDATE surveys SET ${sets.join(', ')}
       WHERE id = $${i++} AND org_id = $${i} AND deleted_at IS NULL`,
      vals
    );
    if (!rowCount) { res.status(404).json({ error: 'Survey not found' }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── SOFT DELETE ───────────────────────────────────────────────────────────────
// Marks as deleted; data is retained for audit / accidental-delete recovery.
router.delete('/:id', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rowCount } = await query(
      `UPDATE surveys SET deleted_at = NOW(), updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.orgId, req.userId]
    );
    if (!rowCount) { res.status(404).json({ error: 'Survey not found' }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── PUBLISH ───────────────────────────────────────────────────────────────────
// Sets published_at only on first publish (COALESCE preserves original timestamp on re-publish).
// Accepts optional launch settings: maxResponses, autoCloseAt, allowMultipleResponses.
router.post('/:id/publish', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  try {
    // Guard: must have at least one question before going live.
    const { rows: [check] } = await query(
      `SELECT jsonb_array_length(questions) AS qcount
       FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.orgId]
    );
    if (!check) { res.status(404).json({ error: 'Survey not found' }); return; }
    const checkRow = check as { qcount: number };
    if (checkRow.qcount === 0) {
      res.status(400).json({ error: 'Cannot publish a survey with no questions. Add at least one question first.' });
      return;
    }

    const { maxResponses, autoCloseAt, allowMultipleResponses, passwordProtected, password } = req.body as Record<string, unknown>;

    // Validate maxResponses: must be a positive integer or null/undefined
    if (maxResponses !== undefined && maxResponses !== null) {
      const parsed = parseInt(maxResponses as string, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'maxResponses must be a positive integer.' });
        return;
      }
    }

    // Validate autoCloseAt: must be a future ISO date string or null/undefined
    if (autoCloseAt !== undefined && autoCloseAt !== null) {
      const closeDate = new Date(autoCloseAt as string);
      if (isNaN(closeDate.getTime())) {
        res.status(400).json({ error: 'autoCloseAt must be a valid ISO date string.' });
        return;
      }
      if (closeDate <= new Date()) {
        res.status(400).json({ error: 'autoCloseAt must be a future date.' });
        return;
      }
    }

    // Validate password protection
    if (passwordProtected && (!password || (password as string).length < 4)) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    const newPasswordHash = passwordProtected && password ? hashPassword(password as string) : null;

    const { rows } = await query(
      `UPDATE surveys
       SET status = 'active',
           updated_at = NOW(),
           updated_by = $3,
           published_at = COALESCE(published_at, NOW()),
           max_responses = COALESCE($4, max_responses),
           auto_close_at = COALESCE($5, auto_close_at),
           allow_multiple_responses = COALESCE($6, allow_multiple_responses),
           password_protected = COALESCE($7, password_protected),
           password_hash = CASE WHEN $7 = TRUE THEN COALESCE($8, password_hash)
                                WHEN $7 = FALSE THEN NULL
                                ELSE password_hash END
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
       RETURNING publish_token, published_at, max_responses, auto_close_at, allow_multiple_responses, password_protected`,
      [
        req.params.id,
        req.orgId,
        req.userId,
        maxResponses != null ? parseInt(maxResponses as string, 10) : null,
        autoCloseAt != null ? autoCloseAt : null,
        allowMultipleResponses != null ? allowMultipleResponses : null,
        passwordProtected != null ? Boolean(passwordProtected) : null,
        newPasswordHash,
      ]
    );
    if (!rows.length) { res.status(404).json({ error: 'Survey not found' }); return; }
    const row = rows[0] as Record<string, unknown>;
    res.json({
      publishToken:           row.publish_token,
      publishedAt:            row.published_at,
      maxResponses:           row.max_responses,
      autoCloseAt:            row.auto_close_at,
      allowMultipleResponses: row.allow_multiple_responses,
      passwordProtected:      row.password_protected,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── LAUNCH SETTINGS ───────────────────────────────────────────────────────────
// Updates launch settings on an existing survey (any status).
router.patch('/:id/launch-settings', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { maxResponses, autoCloseAt, allowMultipleResponses, passwordProtected, password } = req.body as Record<string, unknown>;

    // Validate maxResponses: must be a positive integer or null/undefined
    if (maxResponses !== undefined && maxResponses !== null) {
      const parsed = parseInt(maxResponses as string, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'maxResponses must be a positive integer.' });
        return;
      }
    }

    // Validate autoCloseAt: must be a valid ISO date string or null/undefined
    if (autoCloseAt !== undefined && autoCloseAt !== null) {
      const closeDate = new Date(autoCloseAt as string);
      if (isNaN(closeDate.getTime())) {
        res.status(400).json({ error: 'autoCloseAt must be a valid ISO date string.' });
        return;
      }
    }

    if (passwordProtected && (!password || (password as string).length < 4)) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    const newPasswordHash2 = passwordProtected && password ? hashPassword(password as string) : null;

    const { rows } = await query(
      `UPDATE surveys
       SET updated_at = NOW(),
           updated_by = $3,
           max_responses = $4,
           auto_close_at = $5,
           allow_multiple_responses = COALESCE($6, allow_multiple_responses),
           password_protected = COALESCE($7, password_protected),
           password_hash = CASE WHEN $7 = TRUE THEN COALESCE($8, password_hash)
                                WHEN $7 = FALSE THEN NULL
                                ELSE password_hash END
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
       RETURNING id, max_responses, auto_close_at, allow_multiple_responses, password_protected`,
      [
        req.params.id,
        req.orgId,
        req.userId,
        maxResponses != null ? parseInt(maxResponses as string, 10) : null,
        autoCloseAt != null ? autoCloseAt : null,
        allowMultipleResponses != null ? allowMultipleResponses : null,
        passwordProtected != null ? Boolean(passwordProtected) : null,
        newPasswordHash2,
      ]
    );
    if (!rows.length) { res.status(404).json({ error: 'Survey not found' }); return; }
    const row = rows[0] as Record<string, unknown>;
    res.json({
      maxResponses:           row.max_responses,
      autoCloseAt:            row.auto_close_at,
      allowMultipleResponses: row.allow_multiple_responses,
      passwordProtected:      row.password_protected,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Generate sample responses via AI agent ────────────────────────────────────
// POST /api/surveys/:id/generate-sample-responses
router.post('/:id/generate-sample-responses', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: surveyId } = req.params;
    const { count = 20, personaMix = 'realistic' } = req.body as { count?: number | string; personaMix?: string };

    // Validate inputs
    const parsedCount = Math.min(100, Math.max(1, parseInt(String(count), 10) || 20));
    const validMixes  = ['realistic', 'critical', 'positive', 'mixed'];
    const mix         = validMixes.includes(personaMix) ? personaMix : 'realistic';

    // Verify survey belongs to this org
    const { rows: [survey] } = await query(
      `SELECT id, title, intent, questions FROM surveys
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [surveyId, req.orgId]
    );
    if (!survey) { res.status(404).json({ error: 'Survey not found' }); return; }

    const surveyRow = survey as Record<string, unknown>;
    const questions = Array.isArray(surveyRow.questions) ? surveyRow.questions : [];
    if (questions.length === 0) {
      res.status(400).json({ error: 'Survey has no questions to generate responses for' });
      return;
    }

    // Call agents service — synchronous; may take 10-60s for large counts
    let generated: { responses?: Record<string, unknown>[] };
    try {
      generated = await agentsClient.generateSampleResponses({
        surveyId,
        orgId:        req.orgId,
        surveyTitle:  surveyRow.title as string,
        surveyIntent: (surveyRow.intent as string) || null,
        questions,
        count:        parsedCount,
        personaMix:   mix,
      }) as { responses?: Record<string, unknown>[] };
    } catch (agentErr: unknown) {
      logger.error({ err: (agentErr as Error).message, surveyId }, 'generate_sample_responses:agents_error');
      res.status(502).json({ error: 'AI service failed to generate responses. Please try again.' });
      return;
    }

    const responseRows = generated.responses || [];
    if (responseRows.length === 0) {
      res.status(502).json({ error: 'AI service returned no responses. Please try again.' });
      return;
    }

    // Bulk-insert generated responses
    let inserted = 0;
    const insertedIds: string[] = [];
    for (const resp of responseRows) {
      const answers  = Array.isArray(resp.answers) ? resp.answers : [];
      const npsScore = resp.nps_score != null ? parseInt(String(resp.nps_score), 10) : null;
      try {
        const { rows: [row] } = await query(
          `INSERT INTO responses (survey_id, org_id, answers, nps_score)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [surveyId, req.orgId, JSON.stringify(answers), Number.isFinite(npsScore) ? npsScore : null]
        );
        insertedIds.push((row as { id: string }).id);
        inserted++;
      } catch (insertErr: unknown) {
        logger.warn({ err: (insertErr as Error).message, surveyId }, 'generate_sample_responses:insert_warn');
      }
    }

    // Diagnostic: count answer types across all generated responses
    const answerTypeCounts: Record<string, number> = {};
    const openTextCount = { total: 0, nonEmpty: 0 };
    for (const resp of responseRows) {
      for (const ans of ((resp.answers || []) as Record<string, unknown>[])) {
        const t = ans.type as string;
        answerTypeCounts[t] = (answerTypeCounts[t] || 0) + 1;
        if (t === 'open_text' || t === 'short_text') {
          openTextCount.total++;
          if (ans.value && typeof ans.value === 'string' && ans.value.trim().length > 5) {
            openTextCount.nonEmpty++;
          }
        }
      }
    }
    logger.info(
      { surveyId, orgId: req.orgId, requested: parsedCount, inserted,
        answerTypeCounts, openTextCount },
      'sample_responses_generated',
    );

    if (openTextCount.total > 0 && openTextCount.nonEmpty < openTextCount.total) {
      logger.warn(
        { surveyId, emptyOpenText: openTextCount.total - openTextCount.nonEmpty },
        'sample_responses:open_text_answers_empty_or_null — topics/sentiment may be skipped',
      );
    }

    // Publish to stream so the consumer triggers insight generation automatically
    if (inserted > 0) {
      if (process.env.REDIS_URL) {
        for (const responseId of insertedIds) {
          publishResponseEvent({ surveyId, orgId: req.orgId, responseId }).catch(() => {});
        }
      } else {
        maybeAutoAnalyze(surveyId, req.orgId).catch(() => {});
      }
    }
    res.json({ count: inserted, message: `Generated ${inserted} sample responses for "${surveyRow.title}".` });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, 'generate_sample_responses:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/:id/analytics', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    // Verify survey ownership
    const { rows: [survey] } = await query(
      'SELECT id, title FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [id, req.orgId],
    );
    if (!survey) { res.status(404).json({ error: 'Survey not found' }); return; }

    // Aggregate stats + NPS distribution + real completion rate
    const { rows: [agg] } = await query(
      `SELECT
         COUNT(*)::int                                          AS total_responses,
         ROUND(AVG(nps_score)::numeric, 1)                     AS avg_nps,
         COUNT(CASE WHEN nps_score >= 9 THEN 1 END)::int       AS promoters,
         COUNT(CASE WHEN nps_score BETWEEN 7 AND 8 THEN 1 END)::int AS passives,
         COUNT(CASE WHEN nps_score <= 6 AND nps_score IS NOT NULL THEN 1 END)::int AS detractors,
         COUNT(CASE WHEN EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(answers, '[]'::jsonb)) AS a
           WHERE a->>'value' IS NOT NULL
             AND a->>'value' NOT IN ('', 'null', '[]')
         ) THEN 1 END)::int AS completed_responses
       FROM responses
       WHERE survey_id = $1 AND org_id = $2`,
      [id, req.orgId],
    );

    // Responses per day — last 30 days
    const { rows: dailySeries } = await query(
      `SELECT
         TO_CHAR(DATE_TRUNC('day', submitted_at), 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS count
       FROM responses
       WHERE survey_id = $1 AND org_id = $2
         AND submitted_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE_TRUNC('day', submitted_at)
       ORDER BY DATE_TRUNC('day', submitted_at)`,
      [id, req.orgId],
    );

    const aggRow = agg as Record<string, unknown>;
    const total = (aggRow.total_responses as number) || 0;
    const nps   = aggRow.avg_nps != null ? parseFloat(String(aggRow.avg_nps)) : null;

    const completionRate = total > 0
      ? Math.round(((aggRow.completed_responses as number) || 0) / total * 100)
      : 0;

    res.json({
      total_responses:  total,
      avg_nps:          nps,
      completion_rate:  completionRate,
      nps_distribution: {
        promoters:  (aggRow.promoters as number)  || 0,
        passives:   (aggRow.passives as number)   || 0,
        detractors: (aggRow.detractors as number) || 0,
      },
      responses_by_day: dailySeries,
    });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, surveyId: id }, 'analytics:survey:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Survey-Tag Mappings ───────────────────────────────────────────────────────
// POST /api/surveys/:surveyId/tags  — add tags to a survey
// DELETE /api/surveys/:surveyId/tags/:tagId — remove a tag from a survey

router.post('/:surveyId/tags', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyId } = req.params;
    const body = req.body as Record<string, unknown>;
    const rawTagIds = body.tag_ids || body.tagIds;

    if (!Array.isArray(rawTagIds) || rawTagIds.length === 0) {
      res.status(400).json({ error: 'tag_ids must be a non-empty array' });
      return;
    }
    const tag_ids = rawTagIds.map(String);

    const { rows: [survey] } = await query(
      'SELECT id FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [surveyId, req.orgId]
    );
    if (!survey) { res.status(404).json({ error: 'Survey not found' }); return; }

    const { rows: validTags } = await query(
      'SELECT id FROM survey_tags WHERE id = ANY($1::uuid[]) AND org_id = $2',
      [tag_ids, req.orgId]
    );
    if (validTags.length !== tag_ids.length) {
      res.status(400).json({ error: 'One or more tag IDs are invalid' });
      return;
    }

    for (const tagId of tag_ids) {
      await query(
        `INSERT INTO survey_tag_mappings (survey_id, tag_id, org_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (survey_id, tag_id) DO NOTHING`,
        [surveyId, tagId, req.orgId]
      );
    }

    logger.info({ orgId: req.orgId, surveyId, tag_ids }, 'surveys:tags_added');
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'P0001' || (e.message && e.message.includes('5 tags'))) {
      res.status(400).json({ error: 'A survey cannot have more than 5 tags' });
      return;
    }
    logger.error({ err: (err as Error).message, orgId: req.orgId }, 'surveys:tags_add:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

router.delete('/:surveyId/tags/:tagId', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyId, tagId } = req.params;
    const { rowCount } = await query(
      'DELETE FROM survey_tag_mappings WHERE survey_id = $1 AND tag_id = $2 AND org_id = $3',
      [surveyId, tagId, req.orgId]
    );
    if (!rowCount) { res.status(404).json({ error: 'Tag mapping not found' }); return; }

    logger.info({ orgId: req.orgId, surveyId, tagId }, 'surveys:tag_removed');
    res.json({ success: true });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, orgId: req.orgId }, 'surveys:tag_remove:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/surveys/:surveyId/distribution-tokens ───────────────────────────

router.post('/:surveyId/distribution-tokens', requireAuth, requirePermission('outreach:transactional'), validate(generateTokensSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyId } = req.params;
    const { contact_ids, channel } = req.body as { contact_ids: string[]; channel: string };

    const { rows: surveys } = await query<{ id: string }>(
      'SELECT id FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [surveyId, req.orgId]
    );
    if (!surveys[0]) {
      clientError(res, 404, 'Survey not found');
      return;
    }

    const { rows: contactRows } = await query<{ id: string }>(
      `SELECT id FROM contacts
       WHERE id = ANY($1::uuid[]) AND org_id = $2 AND anonymized_at IS NULL`,
      [contact_ids, req.orgId]
    );
    if (contactRows.length !== contact_ids.length) {
      clientError(res, 400, 'One or more contact IDs are invalid or not accessible');
      return;
    }

    const baseUrl = process.env.FRONTEND_URL ?? 'https://app.experient.ai';
    const tokens: Array<{ contact_id: string; token: string; url: string }> = [];

    for (const contactId of contact_ids) {
      const token = crypto.randomBytes(24).toString('base64url').slice(0, 32);

      await query(
        `INSERT INTO survey_distribution_tokens
           (survey_id, contact_id, token, channel)
         VALUES ($1, $2, $3, $4)`,
        [surveyId, contactId, token, channel]
      );

      tokens.push({
        contact_id: contactId,
        token,
        url: `${baseUrl}/s/${surveyId}?t=${token}`,
      });
    }

    res.status(201).json({ tokens });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
