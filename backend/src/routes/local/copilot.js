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
 * All routes require auth (Clerk JWT or SKIP_AUTH=true in dev).
 * org_id is extracted from the verified token — never from request body.
 */
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const agentsClient    = require('../../lib/agentsClient');
const db              = require('../../lib/db');
const logger          = require('../../lib/logger');

const router = express.Router();
router.use(requireAuth);


// ── Orchestration ──────────────────────────────────────────────────────────────

router.post('/orchestrate', async (req, res) => {
  const { intent, surveyTypeId, sessionId, orgContext } = req.body;

  if (!intent || typeof intent !== 'string' || intent.trim().length === 0) {
    return res.status(400).json({ error: 'intent is required' });
  }

  try {
    const result = await agentsClient.startOrchestration({
      orgId:        req.orgId,
      userId:       req.userId,
      intent:       intent.trim(),
      surveyTypeId: surveyTypeId || null,
      sessionId:    sessionId    || null,
      orgContext:   orgContext    || {},
    });

    res.status(202).json(result);
  } catch (err) {
    logger.error({ err: err.message, orgId: req.orgId }, 'copilot:orchestrate:error');
    if (err.status === 401) return res.status(502).json({ error: 'Agents service auth failure' });
    res.status(502).json({ error: 'Agents service unavailable. Please try again.' });
  }
});


router.get('/runs/:runId/status', async (req, res) => {
  const { runId } = req.params;
  try {
    const status = await agentsClient.getRunStatus(runId, req.orgId);
    res.json(status);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Run not found' });
    logger.error({ err: err.message, runId }, 'copilot:status:error');
    res.status(502).json({ error: 'Failed to fetch run status' });
  }
});


// ── Copilot chat: natural-language edits ──────────────────────────────────────

router.post('/runs/:runId/refine', async (req, res) => {
  const { runId } = req.params;
  const { message, questions, orgContext, surveyTypeId, intent, conversationHistory } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const result = await agentsClient.refineRun(runId, {
      orgId:               req.orgId,
      message:             message.trim(),
      questions:           Array.isArray(questions) ? questions : undefined,
      orgContext:          orgContext    || {},
      surveyTypeId:        surveyTypeId || null,
      intent:              intent       || '',
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
    });
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Run not found' });
    if (err.status === 422) return res.status(422).json({ error: err.message });
    logger.error({ err: err.message, runId }, 'copilot:refine:error');
    res.status(502).json({ error: 'Copilot agent unavailable. Please try again.' });
  }
});


// ── Skip logic ─────────────────────────────────────────────────────────────────

router.post('/runs/:runId/skip-logic', async (req, res) => {
  const { runId } = req.params;
  const { request, orgContext } = req.body;

  if (!request || typeof request !== 'string' || !request.trim()) {
    return res.status(400).json({ error: 'request is required' });
  }

  try {
    const result = await agentsClient.addSkipLogic(runId, {
      orgId:      req.orgId,
      request:    request.trim(),
      orgContext: orgContext || {},
    });
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Run not found' });
    logger.error({ err: err.message, runId }, 'copilot:skipLogic:error');
    res.status(502).json({ error: 'Skip logic agent unavailable. Please try again.' });
  }
});


// ── Question CRUD ──────────────────────────────────────────────────────────────

router.post('/runs/:runId/questions', async (req, res) => {
  const { runId } = req.params;
  const { type, afterId } = req.body;

  try {
    const result = await agentsClient.addQuestion(runId, {
      orgId:   req.orgId,
      type:    type    || 'open_text',
      afterId: afterId || null,
    });
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Run not found' });
    logger.error({ err: err.message, runId }, 'copilot:addQuestion:error');
    res.status(502).json({ error: 'Failed to add question' });
  }
});

router.delete('/runs/:runId/questions/:qId', async (req, res) => {
  const { runId, qId } = req.params;
  try {
    const result = await agentsClient.removeQuestion(runId, qId, req.orgId);
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Not found' });
    logger.error({ err: err.message, runId, qId }, 'copilot:removeQuestion:error');
    res.status(502).json({ error: 'Failed to remove question' });
  }
});

router.patch('/runs/:runId/questions/:qId', async (req, res) => {
  const { runId, qId } = req.params;
  const { fields } = req.body;

  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'fields object required' });
  }

  try {
    const result = await agentsClient.patchQuestion(runId, qId, { orgId: req.orgId, fields });
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Not found' });
    if (err.status === 422) return res.status(422).json({ error: err.message });
    logger.error({ err: err.message, runId, qId }, 'copilot:patchQuestion:error');
    res.status(502).json({ error: 'Failed to update question' });
  }
});

router.post('/runs/:runId/reorder', async (req, res) => {
  const { runId } = req.params;
  const { order } = req.body;

  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: 'order array required' });
  }

  try {
    const result = await agentsClient.reorderQuestions(runId, { orgId: req.orgId, order });
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Run not found' });
    if (err.status === 422) return res.status(422).json({ error: err.message });
    logger.error({ err: err.message, runId }, 'copilot:reorder:error');
    res.status(502).json({ error: 'Failed to reorder questions' });
  }
});


// ── Recommendation dispatcher ──────────────────────────────────────────────────

router.post('/runs/:runId/apply-recommendation/:actionId', async (req, res) => {
  const { runId, actionId } = req.params;
  const { parameters, orgContext, surveyTypeId, intent } = req.body;

  try {
    const result = await agentsClient.applyRecommendation(runId, actionId, {
      orgId:        req.orgId,
      parameters:   parameters   || {},
      orgContext:   orgContext    || {},
      surveyTypeId: surveyTypeId || null,
      intent:       intent       || '',
    });
    res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: 'Run not found' });
    if (err.status === 400) return res.status(400).json({ error: err.message });
    logger.error({ err: err.message, runId, actionId }, 'copilot:applyRecommendation:error');
    res.status(502).json({ error: 'Failed to apply recommendation' });
  }
});


// ── Agent registry ─────────────────────────────────────────────────────────────

router.get('/agents/registry', async (_req, res) => {
  try {
    const registry = await agentsClient.getAgentRegistry();
    res.json(registry);
  } catch (err) {
    logger.error({ err: err.message }, 'copilot:registry:error');
    res.status(502).json({ error: 'Failed to fetch agent registry' });
  }
});


// ── Notifications ──────────────────────────────────────────────────────────────
// All routes return safe empty responses when the table hasn't been migrated yet.

async function _notifQuery(sql, params) {
  try {
    return await db.query(sql, params);
  } catch (err) {
    // Gracefully handle missing table (old Postgres volume, migration not yet run).
    if (err.code === '42P01') return { rows: [], rowCount: 0 }; // undefined_table
    throw err;
  }
}

router.get('/notifications', async (req, res) => {
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
  } catch (err) {
    logger.error({ err: err.message }, 'notifications:list:error');
    res.json([]);
  }
});

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const { rows } = await _notifQuery(
      `SELECT COUNT(*) AS count
         FROM notifications
        WHERE org_id = $1 AND user_id = $2 AND read = FALSE`,
      [req.orgId, req.userId],
    );
    res.json({ count: parseInt(rows[0]?.count ?? 0, 10) });
  } catch (err) {
    logger.error({ err: err.message }, 'notifications:unread-count:error');
    res.json({ count: 0 });
  }
});

router.post('/notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await _notifQuery(
      `UPDATE notifications
          SET read = TRUE
        WHERE id = $1 AND org_id = $2 AND user_id = $3`,
      [id, req.orgId, req.userId],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: err.message }, 'notifications:read:error');
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.post('/notifications/read-all', async (req, res) => {
  try {
    await _notifQuery(
      `UPDATE notifications SET read = TRUE WHERE org_id = $1 AND user_id = $2 AND read = FALSE`,
      [req.orgId, req.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err: err.message }, 'notifications:read-all:error');
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});


module.exports = router;
