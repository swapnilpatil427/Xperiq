import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../lib/validate';
import { createWorkflowSchema, updateWorkflowSchema } from '../schemas/workflows';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';
import { registry } from '../lib/workflowRegistry';
import { runWorkflow, resumeWorkflow } from '../lib/workflowEngine';

const router = express.Router();

interface PgError extends Error {
  code?: string;
}

// GET /api/workflows/approvals — pending approvals for the org
router.get('/approvals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.execution_id, a.workflow_id, a.node_id, a.requested_at, w.name AS workflow_name
         FROM workflow_approvals a
         JOIN workflows w ON w.id = a.workflow_id
        WHERE a.org_id = $1 AND a.status = 'pending'
        ORDER BY a.requested_at DESC LIMIT 50`,
      [req.orgId]
    );
    res.json({ approvals: rows });
  } catch (err: unknown) {
    const pgErr = err as PgError;
    if (pgErr.code === '42P01') { res.json({ approvals: [] }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/workflows/approvals/:executionId — approve/reject → resume/abort
router.post('/approvals/:executionId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const decision = req.body?.decision === 'reject' || req.body?.decision === 'rejected' ? 'rejected' : 'approved';
    const result = await resumeWorkflow(req.params.executionId, req.orgId, decision, req.userId);
    if (!result) { clientError(res, 404, 'No pending approval for that execution'); return; }
    res.json({ result });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// GET /api/workflows/registry — triggers / condition fields+operators / actions catalog
router.get('/registry', requireAuth, (req: Request, res: Response): void => {
  res.json(registry());
});

// GET /api/workflows/templates — pre-built workflow templates
router.get('/templates', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      'SELECT slug, name, description, category, trigger_type, nodes, edges, is_featured FROM workflow_templates ORDER BY is_featured DESC, name'
    );
    res.json({ templates: rows });
  } catch (err: unknown) {
    const pgErr = err as PgError;
    if (pgErr.code === '42P01') { res.json({ templates: [] }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      'SELECT * FROM workflows WHERE org_id = $1 ORDER BY created_at DESC',
      [req.orgId]
    );
    res.json({ workflows: rows });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

router.post('/', requireAuth, validate(createWorkflowSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, condition, action, description, triggerType, nodes, edges, status } = req.body;
    const { rows } = await query(
      `INSERT INTO workflows (org_id, name, condition, action, created_by, description, trigger_type, nodes, edges, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) RETURNING *`,
      [req.orgId, name, JSON.stringify(condition || {}), JSON.stringify(action || {}), req.userId,
       description || null, triggerType || null,
       JSON.stringify(nodes || []), JSON.stringify(edges || []), status || 'draft']
    );
    res.status(201).json({ workflow: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

router.put('/:id', requireAuth, validate(updateWorkflowSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, condition, action, status } = req.body;
    const sets = ['updated_at = NOW()'];
    const vals: unknown[] = [];
    let i = 1;
    if (name      !== undefined) { sets.push(`name = $${i++}`);      vals.push(name); }
    if (condition !== undefined) { sets.push(`condition = $${i++}`); vals.push(JSON.stringify(condition)); }
    if (action    !== undefined) { sets.push(`action = $${i++}`);    vals.push(JSON.stringify(action)); }
    if (status    !== undefined) { sets.push(`status = $${i++}`);    vals.push(status); }

    vals.push(req.params.id, req.orgId);
    await query(
      `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${i++} AND org_id = $${i}`,
      vals
    );
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await query('DELETE FROM workflows WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

router.post('/:id/toggle', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `UPDATE workflows
       SET status = CASE WHEN status = 'active' THEN 'paused' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING status`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Workflow not found' }); return; }
    res.json({ status: rows[0].status });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/workflows/:id/test — run the workflow against a sample/provided event
router.post('/:id/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [wf] } = await query(
      'SELECT * FROM workflows WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!wf) { clientError(res, 404, 'Workflow not found'); return; }
    const event = req.body?.event || { type: wf.trigger_type || 'manual', userId: req.userId, nps: 4, sentiment: 'negative', text: 'sample' };
    const result = await runWorkflow(wf, event, { orgId: req.orgId });
    res.json({ result });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/workflows/executions/:execId/retry — re-run a failed execution (DLQ)
router.post('/executions/:execId/retry', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [exec] } = await query(
      'SELECT * FROM workflow_executions WHERE id = $1 AND org_id = $2', [req.params.execId, req.orgId]
    );
    if (!exec) { clientError(res, 404, 'Execution not found'); return; }
    if (exec.status !== 'failed') { clientError(res, 409, 'Only failed executions can be retried'); return; }
    const { rows: [wf] } = await query(
      'SELECT * FROM workflows WHERE id = $1 AND org_id = $2', [exec.workflow_id, req.orgId]
    );
    if (!wf) { clientError(res, 404, 'Workflow not found'); return; }
    const result = await runWorkflow(wf, exec.trigger_payload || {}, { orgId: req.orgId });
    res.json({ result });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// GET /api/workflows/:id/executions — recent run history with step counts
router.get('/:id/executions', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT e.id, e.trigger_type, e.status, e.triggered_at, e.completed_at, e.duration_ms, e.error_message,
              (SELECT COUNT(*)::int FROM workflow_step_executions s WHERE s.execution_id = e.id) AS step_count
         FROM workflow_executions e
        WHERE e.workflow_id = $1 AND e.org_id = $2
        ORDER BY e.triggered_at DESC LIMIT 25`,
      [req.params.id, req.orgId]
    );
    res.json({ executions: rows });
  } catch (err: unknown) {
    const pgErr = err as PgError;
    if (pgErr.code === '42P01') { res.json({ executions: [] }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
