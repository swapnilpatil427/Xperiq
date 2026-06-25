/**
 * Copilot orchestration routes.
 *
 * Survey creation:
 *   POST /api/copilot/orchestrate                              — Start a survey creation run
 *   GET  /api/copilot/runs/:runId/status                       — Poll run status
 *
 * Copilot chat editing (full survey lifecycle):
 *   POST /api/copilot/runs/:runId/refine                       — Natural-language edit via Copilot agent
 *   POST /api/copilot/runs/:runId/skip-logic                   — Add conditional branching
 *   POST /api/copilot/runs/:runId/questions                    — Add a question
 *   DELETE /api/copilot/runs/:runId/questions/:qId             — Remove a question
 *   PATCH /api/copilot/runs/:runId/questions/:qId              — Update question fields
 *   POST /api/copilot/runs/:runId/reorder                      — Reorder questions
 *   POST /api/copilot/runs/:runId/apply-recommendation/:action — Execute a recommendation
 *
 * Discovery + notifications:
 *   GET  /api/copilot/agents/registry                          — List agent capabilities
 *   GET  /api/copilot/notifications                            — Notifications for current user
 *   POST /api/copilot/notifications/:id/read                   — Mark as read
 *   POST /api/copilot/notifications/read-all                   — Mark all as read
 *   GET  /api/copilot/notifications/unread-count               — Unread badge count
 *
 * All routes require auth (Clerk JWT or dev mode when CLERK_SECRET_KEY is absent).
 * org_id is extracted from the verified token — never from request body.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth, DEV_MODE } from '../middleware/auth';
import * as agentsClient from '../lib/agentsClient';
import { query } from '../lib/db';
import logger from '../lib/logger';
import { serverError } from '../lib/httpError';

const router = express.Router();
router.use(requireAuth);


// ── Ownership guard ───────────────────────────────────────────────────────────
// Verifies the run belongs to the requesting user AND org before any mutation.
// Returns false and writes a 403 response if access is denied.
async function _requireRunOwnership(req: Request, res: Response): Promise<boolean> {
  if (DEV_MODE) return true;
  const { runId } = req.params;
  try {
    const { rows } = await query(
      'SELECT id FROM agent_runs WHERE id = $1 AND org_id = $2 AND user_id = $3',
      [runId, req.orgId, req.userId],
    );
    if (rows.length === 0) {
      res.status(403).json({ error: 'Run not found or access denied' });
      return false;
    }
    return true;
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message, runId }, 'copilot:ownership:error');
    res.status(500).json({ error: 'Failed to verify run access' });
    return false;
  }
}


// ── Orchestration ──────────────────────────────────────────────────────────────

router.post('/orchestrate', async (req: Request, res: Response): Promise<void> => {
  const { intent, surveyTypeId, sessionId, orgContext } = req.body as Record<string, unknown>;

  if (!intent || typeof intent !== 'string' || (intent as string).trim().length === 0) {
    res.status(400).json({ error: 'intent is required' });
    return;
  }

  try {
    const result = await agentsClient.startOrchestration({
      orgId:        req.orgId,
      userId:       req.userId,
      intent:       (intent as string).trim(),
      surveyTypeId: (surveyTypeId as string) || null,
      sessionId:    (sessionId as string)    || null,
      orgContext:   (orgContext as Record<string, unknown>)    || {},
    });

    res.status(202).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    logger.error({ err: e.message, orgId: req.orgId }, 'copilot:orchestrate:error');
    if (e.status === 401) { res.status(502).json({ error: 'Agents service auth failure' }); return; }
    res.status(502).json({ error: 'Agents service unavailable. Please try again.' });
  }
});


router.get('/runs/:runId/status', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId } = req.params;
  try {
    const status = await agentsClient.getRunStatus(runId, req.orgId);
    res.json(status);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Run not found' }); return; }
    logger.error({ err: e.message, runId }, 'copilot:status:error');
    res.status(502).json({ error: 'Failed to fetch run status' });
  }
});


router.post('/runs/:runId/cancel', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId } = req.params;
  try {
    const result = await agentsClient.cancelOrchestration(runId, req.orgId);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Run not found' }); return; }
    logger.error({ err: e.message, runId }, 'copilot:cancel:error');
    res.status(502).json({ error: 'Failed to cancel run' });
  }
});


// ── Copilot chat: natural-language edits ──────────────────────────────────────

router.post('/runs/:runId/refine', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId } = req.params;
  const { message, questions, orgContext, surveyTypeId, intent, conversationHistory } = req.body as Record<string, unknown>;

  if (!message || typeof message !== 'string' || !(message as string).trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const result = await agentsClient.refineRun(runId, {
      orgId:               req.orgId,
      message:             (message as string).trim(),
      questions:           Array.isArray(questions) ? questions : undefined,
      orgContext:          (orgContext as Record<string, unknown>)    || {},
      surveyTypeId:        (surveyTypeId as string) || null,
      intent:              (intent as string)       || '',
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
    });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Run not found' }); return; }
    if (e.status === 422) { res.status(422).json({ error: e.message }); return; }
    logger.error({ err: e.message, runId }, 'copilot:refine:error');
    res.status(502).json({ error: 'Copilot agent unavailable. Please try again.' });
  }
});


// ── Skip logic ─────────────────────────────────────────────────────────────────

router.post('/runs/:runId/skip-logic', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId } = req.params;
  const { request, orgContext } = req.body as Record<string, unknown>;

  if (!request || typeof request !== 'string' || !(request as string).trim()) {
    res.status(400).json({ error: 'request is required' });
    return;
  }

  try {
    const result = await agentsClient.addSkipLogic(runId, {
      orgId:      req.orgId,
      request:    (request as string).trim(),
      orgContext: (orgContext as Record<string, unknown>) || {},
    });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Run not found' }); return; }
    logger.error({ err: e.message, runId }, 'copilot:skipLogic:error');
    res.status(502).json({ error: 'Skip logic agent unavailable. Please try again.' });
  }
});


// ── Question CRUD ──────────────────────────────────────────────────────────────

router.post('/runs/:runId/questions', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId } = req.params;
  const { type, afterId } = req.body as Record<string, unknown>;

  try {
    const result = await agentsClient.addQuestion(runId, {
      orgId:   req.orgId,
      type:    (type as string)    || 'open_text',
      afterId: (afterId as string) || null,
    });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Run not found' }); return; }
    logger.error({ err: e.message, runId }, 'copilot:addQuestion:error');
    res.status(502).json({ error: 'Failed to add question' });
  }
});

router.delete('/runs/:runId/questions/:qId', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId, qId } = req.params;
  try {
    const result = await agentsClient.removeQuestion(runId, qId, req.orgId);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Not found' }); return; }
    logger.error({ err: e.message, runId, qId }, 'copilot:removeQuestion:error');
    res.status(502).json({ error: 'Failed to remove question' });
  }
});

router.patch('/runs/:runId/questions/:qId', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId, qId } = req.params;
  const { fields } = req.body as { fields?: unknown };

  if (!fields || typeof fields !== 'object') {
    res.status(400).json({ error: 'fields object required' });
    return;
  }

  try {
    const result = await agentsClient.patchQuestion(runId, qId, { orgId: req.orgId, fields: fields as Record<string, unknown> });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Not found' }); return; }
    if (e.status === 422) { res.status(422).json({ error: e.message }); return; }
    logger.error({ err: e.message, runId, qId }, 'copilot:patchQuestion:error');
    res.status(502).json({ error: 'Failed to update question' });
  }
});

router.post('/runs/:runId/reorder', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId } = req.params;
  const { order } = req.body as { order?: unknown };

  if (!Array.isArray(order) || order.length === 0) {
    res.status(400).json({ error: 'order array required' });
    return;
  }

  try {
    const result = await agentsClient.reorderQuestions(runId, { orgId: req.orgId, order: order as string[] });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Run not found' }); return; }
    if (e.status === 422) { res.status(422).json({ error: e.message }); return; }
    logger.error({ err: e.message, runId }, 'copilot:reorder:error');
    res.status(502).json({ error: 'Failed to reorder questions' });
  }
});


// ── Recommendation dispatcher ──────────────────────────────────────────────────

router.post('/runs/:runId/apply-recommendation/:actionId', async (req: Request, res: Response): Promise<void> => {
  if (!await _requireRunOwnership(req, res)) return;
  const { runId, actionId } = req.params;
  const { parameters, orgContext, surveyTypeId, intent } = req.body as Record<string, unknown>;

  try {
    const result = await agentsClient.applyRecommendation(runId, actionId, {
      orgId:        req.orgId,
      parameters:   (parameters as Record<string, unknown>)   || {},
      orgContext:   (orgContext as Record<string, unknown>)    || {},
      surveyTypeId: (surveyTypeId as string) || null,
      intent:       (intent as string)       || '',
    });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { res.status(404).json({ error: 'Run not found' }); return; }
    if (e.status === 400) { res.status(400).json({ error: e.message }); return; }
    logger.error({ err: e.message, runId, actionId }, 'copilot:applyRecommendation:error');
    res.status(502).json({ error: 'Failed to apply recommendation' });
  }
});


// ── Agent registry ─────────────────────────────────────────────────────────────

router.get('/agents/registry', async (_req: Request, res: Response): Promise<void> => {
  try {
    const registry = await agentsClient.getAgentRegistry();
    res.json(registry);
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, 'copilot:registry:error');
    res.status(502).json({ error: 'Failed to fetch agent registry' });
  }
});


// ── Notifications ──────────────────────────────────────────────────────────────
// All routes return safe empty responses when the table hasn't been migrated yet.

async function _notifQuery(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }> {
  try {
    return await query(sql, params) as unknown as { rows: Record<string, unknown>[]; rowCount?: number };
  } catch (err: unknown) {
    // Gracefully handle missing table (old Postgres volume, migration not yet run).
    if ((err as { code?: string }).code === '42P01') return { rows: [], rowCount: 0 }; // undefined_table
    throw err;
  }
}

router.get('/notifications', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await _notifQuery(
      `SELECT id, type, title, body, payload, run_id, read, created_at
         FROM notifications
        WHERE org_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [req.orgId, req.userId],
    );
    res.json(rows);
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, 'notifications:list:error');
    res.json([]);
  }
});

router.get('/notifications/unread-count', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await _notifQuery(
      `SELECT COUNT(*) AS count
         FROM notifications
        WHERE org_id = $1 AND user_id = $2 AND read = FALSE`,
      [req.orgId, req.userId],
    );
    res.json({ count: parseInt(String(rows[0]?.count ?? 0), 10) });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, 'notifications:unread-count:error');
    res.json({ count: 0 });
  }
});

router.post('/notifications/:id/read', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const { rowCount } = await _notifQuery(
      `UPDATE notifications
          SET read = TRUE
        WHERE id = $1 AND org_id = $2 AND user_id = $3`,
      [id, req.orgId, req.userId],
    );
    if (rowCount === 0) { res.status(404).json({ error: 'Notification not found' }); return; }
    res.json({ ok: true });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, 'notifications:read:error');
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/notifications/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    await _notifQuery(
      `UPDATE notifications SET read = TRUE WHERE org_id = $1 AND user_id = $2 AND read = FALSE`,
      [req.orgId, req.userId],
    );
    res.json({ ok: true });
  } catch (err: unknown) {
    logger.error({ err: (err as Error).message }, 'notifications:read-all:error');
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});


export default router;
