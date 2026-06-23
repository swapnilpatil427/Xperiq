/**
 * Survey Groups API. Mounted at /api/survey-groups.
 *
 * Cross-survey insight generation, SSE streaming, and group Crystal chat.
 * Groups are defined by survey tags — a "group" = all surveys sharing a tag.
 *
 *   POST /api/group-insights/generate           — start group insight run
 *   GET  /api/group-insights/:runId/status     — get run status + stream_events
 *   GET  /api/group-insights/:runId/stream     — SSE stream of events
 *   GET  /api/group-insights/:runId            — get completed run + insights
 *   POST /api/group-insights/crystal           — Crystal chat with group scope
 *
 *   (Latest report for a tag lives at GET /api/survey-tags/:id/latest-report in tags.ts)
 */
import express from 'express';
import type { Request, Response } from 'express';
import fetch from 'node-fetch';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { serverError } from '../lib/httpError';
import logger from '../lib/logger';
import * as agentsClient from '../lib/agentsClient';

const router = express.Router();

const AGENTS_URL = process.env.AGENTS_URL ?? 'http://localhost:8001';
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY
  ?? (process.env.NODE_ENV !== 'production'
    ? 'dev-internal-key-change-in-prod'
    : (() => { throw new Error('AGENTS_INTERNAL_KEY must be set in production'); })());

// ── POST /api/survey-groups/insights/generate ─────────────────────────────────

router.post('/generate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tag_ids, survey_ids: providedSurveyIds } = req.body as Record<string, unknown>;

    if (!Array.isArray(tag_ids) || (tag_ids as unknown[]).length === 0) {
      res.status(400).json({ error: 'tag_ids must be a non-empty array' });
      return;
    }

    // Validate all tag_ids exist and belong to this org
    const { rows: validTags } = await query(
      'SELECT id FROM survey_tags WHERE id = ANY($1::uuid[]) AND org_id = $2',
      [tag_ids, req.orgId]
    );
    if (validTags.length !== (tag_ids as unknown[]).length) {
      res.status(400).json({ error: 'One or more tag IDs are invalid or do not belong to your org' });
      return;
    }

    // Collect survey_ids from tag mappings if not explicitly provided
    let surveyIds: string[] = Array.isArray(providedSurveyIds) && (providedSurveyIds as unknown[]).length > 0
      ? (providedSurveyIds as string[])
      : [];

    if (surveyIds.length === 0) {
      const { rows: mappings } = await query(
        `SELECT DISTINCT m.survey_id
         FROM survey_tag_mappings m
         JOIN surveys s ON s.id = m.survey_id
         WHERE m.tag_id = ANY($1::uuid[]) AND m.org_id = $2
           AND s.deleted_at IS NULL`,
        [tag_ids, req.orgId]
      );
      surveyIds = (mappings as { survey_id: string }[]).map(r => r.survey_id);
    }

    if (surveyIds.length === 0) {
      res.status(400).json({ error: 'No surveys found for the specified tags' });
      return;
    }

    // Create group_insight_runs record
    const { rows: [run] } = await query(
      `INSERT INTO group_insight_runs
         (org_id, created_by, tag_ids, survey_ids, status, stream_events)
       VALUES ($1, $2, $3::uuid[], $4::uuid[], 'pending', '[]'::jsonb)
       RETURNING id`,
      [req.orgId, req.userId, tag_ids, surveyIds]
    );
    const runId = (run as { id: string }).id;

    logger.info({ orgId: req.orgId, runId, tagCount: (tag_ids as unknown[]).length, surveyCount: surveyIds.length }, 'survey_groups:generate:started');

    // Fire-and-forget to agents service
    agentsClient.generateGroupInsights(runId, tag_ids as string[], surveyIds, req.orgId)
      .catch((err: unknown) => {
        logger.error({ err: (err as Error).message, runId }, 'survey_groups:generate:agents_error');
        query(
          "UPDATE group_insight_runs SET status = 'failed', completed_at = NOW() WHERE id = $1",
          [runId]
        ).catch(() => {});
      });

    res.status(202).json({ run_id: runId });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, orgId: req.orgId }, 'survey_groups:generate:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/survey-groups/insights/:runId/status ─────────────────────────────

router.get('/:runId/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, status, tag_ids, survey_ids, stream_events, error_log, created_at, completed_at,
              EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - created_at))::int AS duration_seconds
       FROM group_insight_runs
       WHERE id = $1 AND org_id = $2`,
      [req.params.runId, req.orgId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Run not found' }); return; }

    const run = rows[0] as Record<string, unknown>;
    const errorLog = Array.isArray(run.error_log) ? (run.error_log as unknown[]) : [];
    res.json({
      run_id:           run.id,
      status:           run.status,
      tag_ids:          run.tag_ids,
      survey_ids:       run.survey_ids,
      stream_events:    Array.isArray(run.stream_events) ? run.stream_events : [],
      error:            errorLog.length ? errorLog[errorLog.length - 1] : null,
      error_log:        errorLog,
      duration_seconds: run.duration_seconds != null ? parseInt(String(run.duration_seconds)) : null,
      created_at:       run.created_at,
      completed_at:     run.completed_at || null,
    });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, runId: req.params.runId }, 'survey_groups:status:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/survey-groups/insights/:runId/stream (SSE) ───────────────────────

router.get('/:runId/stream', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { runId } = req.params;

  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let lastEventCount = 0;
  let pollCount = 0;
  const MAX_POLLS = 40;

  const send = (data: unknown): void => { res.write(`data: ${JSON.stringify(data)}\n\n`); };

  const poll = async (): Promise<void> => {
    if (pollCount++ >= MAX_POLLS) {
      send({ event: 'timeout' });
      res.end();
      return;
    }
    try {
      const { rows } = await query(
        `SELECT id, status, stream_events
         FROM group_insight_runs
         WHERE id = $1 AND org_id = $2`,
        [runId, req.orgId]
      );
      if (!rows.length) return;

      const run = rows[0] as Record<string, unknown>;
      const events = Array.isArray(run.stream_events) ? (run.stream_events as unknown[]) : [];

      // Send any new events since last poll
      for (const ev of events.slice(lastEventCount)) {
        send(ev);
        lastEventCount++;
      }

      if (run.status === 'completed' || run.status === 'failed') {
        // Fetch the group insights for this run
        const { rows: insights } = await query(
          `SELECT * FROM group_insights WHERE run_id = $1 AND org_id = $2
           ORDER BY priority DESC NULLS LAST`,
          [runId, req.orgId]
        ).catch(() => ({ rows: [] }));

        send({ event: 'complete', data: { insights, status: run.status } });
        clearInterval(interval);
        res.end();
      }
    } catch (err: unknown) {
      logger.warn({ err: (err as Error).message, runId }, 'survey_groups:stream:poll_error');
    }
  };

  const interval = setInterval(poll, 3000);
  await poll();
  req.on('close', () => clearInterval(interval));
});

// ── GET /api/survey-groups/insights/:runId — get completed run + insights ─────

router.get('/:runId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, status, tag_ids, survey_ids, stream_events, error_log, created_at, completed_at
       FROM group_insight_runs
       WHERE id = $1 AND org_id = $2`,
      [req.params.runId, req.orgId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Run not found' }); return; }

    const run = rows[0];

    const { rows: insights } = await query(
      `SELECT * FROM group_insights WHERE run_id = $1 AND org_id = $2
       ORDER BY priority DESC NULLS LAST`,
      [req.params.runId, req.orgId]
    ).catch(() => ({ rows: [] }));

    res.json({ run, insights });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, runId: req.params.runId }, 'survey_groups:get_run:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/group-insights/crystal — Crystal chat with group scope ──────────

router.post('/crystal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { tag_ids, message, conversation_history } = req.body as Record<string, unknown>;

    if (!Array.isArray(tag_ids) || (tag_ids as unknown[]).length === 0) {
      res.status(400).json({ error: 'tag_ids must be a non-empty array' });
      return;
    }
    if (!message || typeof message !== 'string' || (message as string).trim().length < 2) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    // Validate tags belong to this org
    const { rows: validTags } = await query(
      'SELECT id, name FROM survey_tags WHERE id = ANY($1::uuid[]) AND org_id = $2',
      [tag_ids, req.orgId]
    );
    if (validTags.length !== (tag_ids as unknown[]).length) {
      res.status(400).json({ error: 'One or more tag IDs are invalid' });
      return;
    }

    const payload = {
      tag_ids,
      org_id:               req.orgId,
      user_id:              req.userId,
      message:              (message as string).trim(),
      conversation_history: Array.isArray(conversation_history) ? conversation_history : [],
    };

    logger.info({ orgId: req.orgId, tagCount: (tag_ids as unknown[]).length }, 'survey_groups:crystal:request');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    let fetchRes;
    try {
      fetchRes = await fetch(`${AGENTS_URL}/groups/crystal`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type':   'application/json',
          'X-Internal-Key': AGENTS_INTERNAL_KEY,
        },
        body: JSON.stringify(payload),
      });
      clearTimeout(timer);
    } catch (fetchErr: unknown) {
      clearTimeout(timer);
      throw fetchErr;
    }

    if (!fetchRes.ok) {
      const body = await fetchRes.text().catch(() => '');
      logger.error({ status: fetchRes.status, body, orgId: req.orgId }, 'survey_groups:crystal:agents_error');
      res.status(502).json({ error: 'AI service unavailable. Please try again.' });
      return;
    }

    const response = await fetchRes.json() as Record<string, unknown>;
    res.json({
      answer:       response.answer,
      suggestions:  response.suggestions  || [],
      insight_refs: response.insight_refs || [],
      citations:    response.citations    || [],
    });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, orgId: req.orgId }, 'survey_groups:crystal:error');
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
