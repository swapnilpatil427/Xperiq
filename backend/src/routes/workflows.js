const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { createWorkflowSchema, updateWorkflowSchema } = require('../schemas/workflows');
const db = require('../lib/db');
const { serverError, clientError } = require('../lib/httpError');
const { registry } = require('../lib/workflowRegistry');
const { runWorkflow, resumeWorkflow } = require('../lib/workflowEngine');
const router = express.Router();

// GET /api/workflows/approvals — pending approvals for the org
router.get('/approvals', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.execution_id, a.workflow_id, a.node_id, a.requested_at, w.name AS workflow_name
         FROM workflow_approvals a
         JOIN workflows w ON w.id = a.workflow_id
        WHERE a.org_id = $1 AND a.status = 'pending'
        ORDER BY a.requested_at DESC LIMIT 50`,
      [req.orgId]
    );
    res.json({ approvals: rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ approvals: [] });
    serverError(res, err);
  }
});

// POST /api/workflows/approvals/:executionId — approve/reject → resume/abort
router.post('/approvals/:executionId', requireAuth, async (req, res) => {
  try {
    const decision = req.body?.decision === 'reject' || req.body?.decision === 'rejected' ? 'rejected' : 'approved';
    const result = await resumeWorkflow(req.params.executionId, req.orgId, decision, req.userId);
    if (!result) return clientError(res, 404, 'No pending approval for that execution');
    res.json({ result });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/workflows/registry — triggers / condition fields+operators / actions catalog
router.get('/registry', requireAuth, (req, res) => {
  res.json(registry());
});

// GET /api/workflows/templates — pre-built workflow templates
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT slug, name, description, category, trigger_type, nodes, edges, is_featured FROM workflow_templates ORDER BY is_featured DESC, name'
    );
    res.json({ templates: rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ templates: [] });
    serverError(res, err);
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM workflows WHERE org_id = $1 ORDER BY created_at DESC',
      [req.orgId]
    );
    res.json({ workflows: rows });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/', requireAuth, validate(createWorkflowSchema), async (req, res) => {
  try {
    const { name, condition, action, description, triggerType, nodes, edges, status } = req.body;
    const { rows } = await db.query(
      `INSERT INTO workflows (org_id, name, condition, action, created_by, description, trigger_type, nodes, edges, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) RETURNING *`,
      [req.orgId, name, JSON.stringify(condition || {}), JSON.stringify(action || {}), req.userId,
       description || null, triggerType || null,
       JSON.stringify(nodes || []), JSON.stringify(edges || []), status || 'draft']
    );
    res.status(201).json({ workflow: rows[0] });
  } catch (err) {
    serverError(res, err);
  }
});

router.put('/:id', requireAuth, validate(updateWorkflowSchema), async (req, res) => {
  try {
    const { name, condition, action, status } = req.body;
    const sets = ['updated_at = NOW()'];
    const vals = [];
    let i = 1;
    if (name      !== undefined) { sets.push(`name = $${i++}`);      vals.push(name); }
    if (condition !== undefined) { sets.push(`condition = $${i++}`); vals.push(JSON.stringify(condition)); }
    if (action    !== undefined) { sets.push(`action = $${i++}`);    vals.push(JSON.stringify(action)); }
    if (status    !== undefined) { sets.push(`status = $${i++}`);    vals.push(status); }

    vals.push(req.params.id, req.orgId);
    await db.query(
      `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${i++} AND org_id = $${i}`,
      vals
    );
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM workflows WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

router.post('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE workflows
       SET status = CASE WHEN status = 'active' THEN 'paused' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING status`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ status: rows[0].status });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/workflows/:id/test — run the workflow against a sample/provided event
router.post('/:id/test', requireAuth, async (req, res) => {
  try {
    const { rows: [wf] } = await db.query(
      'SELECT * FROM workflows WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!wf) return clientError(res, 404, 'Workflow not found');
    const event = req.body?.event || { type: wf.trigger_type || 'manual', userId: req.userId, nps: 4, sentiment: 'negative', text: 'sample' };
    const result = await runWorkflow(wf, event, { orgId: req.orgId });
    res.json({ result });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/workflows/executions/:execId/retry — re-run a failed execution (DLQ)
router.post('/executions/:execId/retry', requireAuth, async (req, res) => {
  try {
    const { rows: [exec] } = await db.query(
      'SELECT * FROM workflow_executions WHERE id = $1 AND org_id = $2', [req.params.execId, req.orgId]
    );
    if (!exec) return clientError(res, 404, 'Execution not found');
    if (exec.status !== 'failed') return clientError(res, 409, 'Only failed executions can be retried');
    const { rows: [wf] } = await db.query(
      'SELECT * FROM workflows WHERE id = $1 AND org_id = $2', [exec.workflow_id, req.orgId]
    );
    if (!wf) return clientError(res, 404, 'Workflow not found');
    const result = await runWorkflow(wf, exec.trigger_payload || {}, { orgId: req.orgId });
    res.json({ result });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/workflows/:id/executions — recent run history with step counts
router.get('/:id/executions', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.trigger_type, e.status, e.triggered_at, e.completed_at, e.duration_ms, e.error_message,
              (SELECT COUNT(*)::int FROM workflow_step_executions s WHERE s.execution_id = e.id) AS step_count
         FROM workflow_executions e
        WHERE e.workflow_id = $1 AND e.org_id = $2
        ORDER BY e.triggered_at DESC LIMIT 25`,
      [req.params.id, req.orgId]
    );
    res.json({ executions: rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ executions: [] });
    serverError(res, err);
  }
});

module.exports = router;
