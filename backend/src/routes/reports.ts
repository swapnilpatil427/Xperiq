/**
 * Custom Analysis report routes (Insight Pipeline v2 — Phase 6).
 *
 *   POST /api/reports/custom          — trigger a Custom Analysis run (credit-metered, daily-limited)
 *   POST /api/reports/custom/preview  — cost / corpus preview (no debit)
 *   GET  /api/reports/custom          — list Custom Analysis reports for the org (optional ?survey_id=)
 *   GET  /api/reports/custom/:reportId — single report + its isolated insight rows (+ blob document)
 *
 * Custom Analysis is architecturally separate from the main insight pipeline. Results are
 * written to custom_reports / custom_report_insights and NEVER to the `insights` table
 * (02_ARCHITECTURE.md §6/§7, 03_DATA_MODEL.md §10/§11, 05_CONFIGURATION.md §D). It has its
 * own run queue in CrystalOS and its own credit-cost scaling (25–75 by corpus size).
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth, DEV_MODE } from '../middleware/auth';
import { query } from '../lib/db';
import logger from '../lib/logger';
import { serverError } from '../lib/httpError';
import * as agentsClient from '../lib/agentsClient';
import { checkCredits, debitCredits } from '../lib/creditLedger';
import { resolveCustomCost } from '../lib/creditPlans';
import { validate } from '../lib/validate';
import { customReportSchema, customReportPreviewSchema } from '../schemas/customReports';
import {
  INSIGHT_SETTING_DEFAULTS,
  INSIGHT_SETTING_KEYS,
  type InsightSettingKey,
} from '../lib/insightConfig';

// Custom-analysis settings whose pg NUMERIC values arrive as strings → coerce to number.
const NUMERIC_SETTING_KEYS = new Set<InsightSettingKey>([
  'meaningful_delta_nps_points',
  'meaningful_delta_topic_pct',
]);

function coerceSettingValue(key: InsightSettingKey, value: unknown): unknown {
  if (value == null) return null;
  if (NUMERIC_SETTING_KEYS.has(key)) return parseFloat(String(value));
  return value;
}

const SETTINGS_COLUMNS = INSIGHT_SETTING_KEYS.join(',\n         ');

const router = express.Router();
router.use(requireAuth);

// ── Helper: verify survey belongs to org (mirrors insights.ts getSurvey) ─────────
async function getSurvey(surveyId: string, orgId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await query(
    `SELECT id, title, org_id, status, created_by
     FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [surveyId, orgId],
  ).catch(() => ({ rows: [] }));
  if (rows[0]) return rows[0] as Record<string, unknown>;

  // Dev mode: accept the survey regardless of org_id mismatch (matches insights.ts).
  if (DEV_MODE) {
    const { rows: bare } = await query(
      'SELECT id, title, org_id, status, created_by FROM surveys WHERE id = $1 AND deleted_at IS NULL',
      [surveyId],
    ).catch(() => ({ rows: [] }));
    if (bare[0]) {
      logger.warn({ surveyId, req_org: orgId }, 'reports:getSurvey:dev_mode_fallback');
      return bare[0] as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Resolve the effective insight settings for a survey via the 3-level COALESCE merge
 * (survey_insight_settings → org_insight_defaults → platform constant). Tolerates the v2
 * tables not being migrated yet (each layer wrapped in try/catch → platform default).
 */
async function resolveEffectiveSettings(surveyId: string, orgId: string): Promise<Record<string, unknown>> {
  let surveyLayer: Record<string, unknown> = {};
  try {
    const { rows } = await query(
      `SELECT ${SETTINGS_COLUMNS}
       FROM survey_insight_settings WHERE survey_id = $1 AND org_id = $2`,
      [surveyId, orgId],
    );
    surveyLayer = (rows[0] as Record<string, unknown>) ?? {};
  } catch (e: unknown) {
    logger.warn({ err: (e as Error).message, surveyId }, 'reports:resolveSettings:survey_layer_unavailable');
  }

  let orgLayer: Record<string, unknown> = {};
  try {
    const { rows } = await query(`SELECT * FROM org_insight_defaults WHERE org_id = $1`, [orgId]);
    orgLayer = (rows[0] as Record<string, unknown>) ?? {};
  } catch (e: unknown) {
    logger.warn({ err: (e as Error).message, orgId }, 'reports:resolveSettings:org_layer_unavailable');
  }

  const effective: Record<string, unknown> = {};
  for (const key of INSIGHT_SETTING_KEYS) {
    const sv = coerceSettingValue(key, surveyLayer[key]);
    const ov = coerceSettingValue(key, orgLayer[key]);
    effective[key] = sv != null ? sv : (ov != null ? ov : INSIGHT_SETTING_DEFAULTS[key]);
  }
  return effective;
}

/** Slugify a report name into a URL-safe permalink fragment, suffixed for uniqueness. */
function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'custom-report';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

interface FilterSpec {
  date_from?: string;
  date_to?: string;
  segments?: Array<{ field: string; op: string; value: unknown }>;
  topics?: string[];
  metric_types?: string[];
  narrative_depth?: string;
}

/**
 * Count the corpus size for a custom analysis filter spec — responses by submitted_at
 * within the date range, optionally narrowed to any of the requested topics. Segment
 * filters are resolved by CrystalOS at run time (it owns the response schema), so the
 * backend's preflight count uses date + topic predicates only (a safe upper bound).
 * Bounded by custom_analysis_max_corpus.
 */
async function countCorpus(
  surveyId: string,
  orgId: string,
  spec: FilterSpec,
  maxCorpus: number,
): Promise<number> {
  const params: unknown[] = [surveyId, orgId];
  const clauses: string[] = ['survey_id = $1', 'org_id = $2'];

  if (spec.date_from) {
    params.push(spec.date_from);
    clauses.push(`submitted_at >= $${params.length}::timestamptz`);
  }
  if (spec.date_to) {
    params.push(spec.date_to);
    clauses.push(`submitted_at <= $${params.length}::timestamptz`);
  }
  if (Array.isArray(spec.topics) && spec.topics.length > 0) {
    // Match responses tagged with ANY of the requested topics. `?|` takes a text[] of keys
    // and uses the responses.ai_topics GIN index (created in insights.ts ensureTopicsTables).
    params.push(spec.topics);
    clauses.push(`ai_topics ?| $${params.length}::text[]`);
  }

  const { rows } = await query<{ corpus_size: number }>(
    `SELECT COUNT(*)::int AS corpus_size FROM responses WHERE ${clauses.join(' AND ')}`,
    params,
  ).catch((e: unknown) => {
    logger.warn({ err: (e as Error).message, surveyId }, 'reports:countCorpus:fallback');
    return { rows: [{ corpus_size: 0 }] };
  });
  const corpus = rows[0]?.corpus_size ?? 0;
  return Math.min(corpus, maxCorpus);
}

// ── POST /api/reports/custom — trigger a Custom Analysis run ───────────────────

router.post(
  '/custom',
  validate(customReportSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { survey_id, name, filter_spec } = req.body as {
      survey_id: string; name: string; filter_spec: FilterSpec;
    };

    try {
      const survey = await getSurvey(survey_id, req.orgId);
      if (!survey) { res.status(404).json({ error: 'Survey not found' }); return; }

      const settings = await resolveEffectiveSettings(survey_id, req.orgId);
      const maxCorpus = Number(settings.custom_analysis_max_corpus) || 5000;

      // Corpus size → credit cost (25–75 by tier).
      const corpusSize = await countCorpus(survey_id, req.orgId, filter_spec, maxCorpus);
      const cost = resolveCustomCost(corpusSize);

      // Daily-limit gate (per survey) — count today's custom_reports (UTC midnight window).
      const dailyLimit = Number(settings.custom_analysis_daily_limit) || 3;
      const todayUtcMidnight = `${new Date().toISOString().split('T')[0]}T00:00:00Z`;
      const { rows: [{ run_count }] } = await query<{ run_count: number }>(
        `SELECT COUNT(*)::int AS run_count FROM custom_reports
         WHERE survey_id = $1 AND org_id = $2 AND created_at >= $3::timestamptz`,
        [survey_id, req.orgId, todayUtcMidnight],
      ).catch(() => ({ rows: [{ run_count: 0 }] }));
      if (run_count >= dailyLimit) {
        res.status(429).json({
          error: 'Daily Custom Analysis limit reached for this survey.',
          code:  'RATE_LIMITED',
          limit: dailyLimit,
        });
        return;
      }

      // Credit pre-flight → 402 when insufficient (02_ARCHITECTURE.md §6 — custom queue debits or 402).
      const check = await checkCredits(req.orgId, cost, 'custom_analysis');
      if (!check.ok) {
        res.status(402).json({
          error:     'Not enough credits to run this Custom Analysis.',
          code:      'INSUFFICIENT_CREDITS',
          required:  check.required,
          available: check.available,
        });
        return;
      }

      // Create the agent_runs row first so the run is traceable.
      const { rows: runRows } = await query(
        `INSERT INTO agent_runs
           (org_id, user_id, thread_id, run_type, status, intent, survey_id)
         VALUES ($1, $2, $3, 'insight_generation', 'running', 'custom_analysis', $4)
         RETURNING id`,
        [req.orgId, req.userId, `custom_analysis:${req.orgId}:${survey_id}:${Date.now()}`, survey_id],
      );
      const runId = (runRows[0] as { id: string }).id;

      // Insert the custom_reports row (status 'pending').
      const slug = makeSlug(name);
      const { rows: reportRows } = await query(
        `INSERT INTO custom_reports
           (org_id, survey_id, created_by, name, filter_spec, status, run_id, credit_cost, slug)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', $6, $7, $8)
         RETURNING id, slug, status`,
        [
          req.orgId, survey_id, `user:${req.userId}`, name,
          JSON.stringify(filter_spec), runId, cost, slug,
        ],
      );
      const report = reportRows[0] as { id: string; slug: string; status: string };

      // Debit after the rows are committed (mirrors /generate + /runs). Pre-checked above.
      try {
        await debitCredits(req.orgId, {
          actionType: 'custom_analysis',
          credits:    cost,
          userId:     req.userId,
          actionRef:  report.id,
          note:       `Custom Analysis (${corpusSize} responses)`,
        });
      } catch (err) {
        logger.warn({ err: (err as Error).message, survey_id, runId, reportId: report.id }, 'reports:custom:debit_failed');
      }

      // Fire-and-forget to CrystalOS. Tolerate the endpoint not existing yet (built in parallel):
      // on failure mark both the run and the report failed so the UI doesn't poll forever.
      agentsClient.triggerCustomAnalysis({
        surveyId:   survey_id,
        orgId:      req.orgId,
        runId,
        reportId:   report.id,
        filterSpec: filter_spec as Record<string, unknown>,
        actor:      `user:${req.userId}`,
      }).catch(err => {
        logger.error({ err: (err as Error).message, survey_id, runId, reportId: report.id }, 'reports:custom:agents_error');
        query("UPDATE agent_runs SET status='failed', completed_at=NOW() WHERE id=$1", [runId]).catch(() => {});
        query("UPDATE custom_reports SET status='failed' WHERE id=$1", [report.id]).catch(() => {});
      });

      logger.info({ survey_id, orgId: req.orgId, runId, reportId: report.id, cost, corpusSize }, 'reports:custom:started');
      res.status(202).json({
        report_id: report.id,
        run_id:    runId,
        status:    'pending',
        slug:      report.slug,
      });
    } catch (err: unknown) {
      logger.error({ err: (err as Error).message }, 'reports:custom:error');
      serverError(res, err instanceof Error ? err : new Error(String(err)));
    }
  },
);

// ── POST /api/reports/custom/preview — cost / corpus preview (no debit) ─────────

router.post(
  '/custom/preview',
  validate(customReportPreviewSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { survey_id, filter_spec } = req.body as { survey_id: string; filter_spec: FilterSpec };

    try {
      const survey = await getSurvey(survey_id, req.orgId);
      if (!survey) { res.status(404).json({ error: 'Survey not found' }); return; }

      const settings = await resolveEffectiveSettings(survey_id, req.orgId);
      const maxCorpus = Number(settings.custom_analysis_max_corpus) || 5000;
      const minNForNps = Number(settings.custom_analysis_min_n_for_nps) || 30;

      const corpusSize = await countCorpus(survey_id, req.orgId, filter_spec, maxCorpus);
      const estimatedCost = resolveCustomCost(corpusSize);
      // sample_size: custom analysis uses the full matched corpus (capped at max_corpus).
      const sampleSize = corpusSize;

      res.json({
        estimated_cost:  estimatedCost,
        corpus_size:     corpusSize,
        sample_size:     sampleSize,
        low_confidence:  corpusSize < minNForNps,
        min_n_for_nps:   minNForNps,
        max_corpus:      maxCorpus,
      });
    } catch (err: unknown) {
      logger.error({ err: (err as Error).message }, 'reports:custom:preview:error');
      serverError(res, err instanceof Error ? err : new Error(String(err)));
    }
  },
);

// ── GET /api/reports/custom — list Custom Analysis reports for the org ──────────

router.get('/custom', async (req: Request, res: Response): Promise<void> => {
  const surveyId = typeof req.query.survey_id === 'string' ? req.query.survey_id : null;
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);

  try {
    const params: unknown[] = [req.orgId];
    let sql = `SELECT id, org_id, survey_id, created_by, name, filter_spec, status,
                      run_id, slug, output_url, credit_cost, corpus_coverage_pct,
                      sample_size, trust_score_avg, created_at, completed_at, expires_at
               FROM custom_reports
               WHERE org_id = $1`;
    if (surveyId) {
      params.push(surveyId);
      sql += ` AND survey_id = $${params.length}`;
    }
    params.push(limit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const { rows } = await query(sql, params).catch((e: unknown) => {
      logger.warn({ err: (e as Error).message, orgId: req.orgId }, 'reports:custom:list:table_unavailable');
      return { rows: [] };
    });

    const reports = (rows as Record<string, unknown>[]).map(r => ({
      ...r,
      trust_score_avg:     r.trust_score_avg != null ? parseFloat(String(r.trust_score_avg)) : null,
      corpus_coverage_pct: r.corpus_coverage_pct != null ? parseFloat(String(r.corpus_coverage_pct)) : null,
    }));

    res.json({ reports });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, orgId: req.orgId }, 'reports:custom:list:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/reports/custom/:reportId — report + isolated insight rows + blob ──

router.get('/custom/:reportId', async (req: Request, res: Response): Promise<void> => {
  const { reportId } = req.params;
  try {
    const { rows } = await query(
      `SELECT id, org_id, survey_id, created_by, name, filter_spec, status,
              run_id, blob_ref, output_url, slug, credit_cost, corpus_coverage_pct,
              sample_size, trust_score_avg, created_at, completed_at, expires_at
       FROM custom_reports
       WHERE id = $1 AND org_id = $2`,
      [reportId, req.orgId],
    ).catch((e: unknown) => {
      logger.warn({ err: (e as Error).message, reportId }, 'reports:custom:detail:table_unavailable');
      return { rows: [] };
    });

    if (!rows.length) { res.status(404).json({ error: 'Report not found' }); return; }
    const report = rows[0] as Record<string, unknown>;
    if (report.trust_score_avg != null) report.trust_score_avg = parseFloat(String(report.trust_score_avg));
    if (report.corpus_coverage_pct != null) report.corpus_coverage_pct = parseFloat(String(report.corpus_coverage_pct));

    // Isolated insight rows — scoped to this custom_report_id ONLY (never the insights table).
    const { rows: insightRows } = await query(
      `SELECT id, custom_report_id, org_id, survey_id, layer, category, headline,
              narrative, metric_json, citations_json, trust_score, trust_json,
              priority, filter_label, created_at
       FROM custom_report_insights
       WHERE custom_report_id = $1 AND org_id = $2
       ORDER BY priority DESC NULLS LAST, created_at ASC`,
      [reportId, req.orgId],
    ).catch((e: unknown) => {
      logger.warn({ err: (e as Error).message, reportId }, 'reports:custom:detail:insights_unavailable');
      return { rows: [] };
    });

    const insights = (insightRows as Record<string, unknown>[]).map(r => ({
      ...r,
      priority: r.priority != null ? parseFloat(String(r.priority)) : null,
    }));

    // Load the report blob document when a ref is present (mirror the manual-report pattern:
    // signed read URL in prod, inline blob otherwise). Best-effort — fall back to blob_url.
    let document: unknown = undefined;
    let blobUrl: string | null = null;
    const blobRef = report.blob_ref as string | null;
    if (blobRef) {
      const isProduction = process.env.NODE_ENV === 'production' || process.env.AGENTS_ENV === 'staging';
      try {
        if (isProduction) {
          blobUrl = await agentsClient.getCheckpointReadUrl(blobRef);
        } else {
          document = await agentsClient.getCheckpointBlob(blobRef);
        }
      } catch (e: unknown) {
        logger.warn({ err: (e as Error).message, reportId, blobRef }, 'reports:custom:detail:blob_load_failed');
        blobUrl = blobRef;
      }
    }

    res.json({ report, insights, document, blob_url: blobUrl });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, reportId }, 'reports:custom:detail:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
