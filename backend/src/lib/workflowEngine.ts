// Workflow execution engine.
//
// A workflow is a graph of nodes (trigger → conditions → actions). On a matching
// trigger event we evaluate conditions, then run actions sequentially, logging an
// execution + per-step rows. Actions reuse the notification/Slack/webhook senders
// and the alert/notification bus already built. Crystal/integration actions are
// stubs (recorded as skipped) until their SDKs are wired (deploy-dependent).
//
// Engine runs in the backend or the standalone Event Engine (both share this lib).
import { query } from './db';
import { createNotification, serialize } from './notifications';
import { sendSlack, sendEmail } from './channels';
import { jiraCreateIssue, salesforceUpdateContact, servicenowCreateIncident, crystalSummarize, crystalClassify } from './connectors';
import { cronMatches } from './cron';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowNode {
  id?: string;
  type: 'trigger' | 'condition' | 'action';
  action?: string;
  config?: Record<string, unknown>;
  conditions?: ConditionSet;
  [key: string]: unknown;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  branch?: 'true' | 'false' | null;
}

export interface WorkflowRecord {
  id: string;
  org_id: string;
  trigger_type?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  status?: string;
  [key: string]: unknown;
}

export interface TriggerEvent {
  type?: string;
  userId?: string | null;
  targetUserIds?: string[];
  title?: string | null;
  body?: string | null;
  actionUrl?: string | null;
  responseId?: string | null;
  contactId?: string | null;
  severity?: string;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
  [key: string]: unknown;
}

interface ExecutionContext {
  orgId: string;
  workflowId: string;
  event: TriggerEvent;
  vars: Record<string, unknown>;
  recipientUserIds?: string[];
}

interface ConditionRule {
  field: string;
  op: string;
  value: unknown;
}

interface ConditionSet {
  operator?: 'AND' | 'OR';
  rules?: ConditionRule[];
}

interface ActionResult {
  status: 'completed' | 'failed' | 'skipped' | 'waiting';
  output?: Record<string, unknown>;
  error?: string;
  stop?: boolean;
  pause?: boolean;
  vars?: Record<string, unknown>;
}

interface RunResult {
  status: 'completed' | 'failed' | 'skipped' | 'waiting';
  conditionsPassed: boolean;
  pauseIndex?: number;
  resumeNodeId?: string | null;
}

// ── Condition evaluation ──────────────────────────────────────────────────────

export function compare(op: string, actual: unknown, value: unknown): boolean {
  switch (op) {
    case 'eq':  return actual == value;             // eslint-disable-line eqeqeq
    case 'neq': return actual != value;             // eslint-disable-line eqeqeq
    case 'gt':  return Number(actual) > Number(value);
    case 'lt':  return Number(actual) < Number(value);
    case 'gte': return Number(actual) >= Number(value);
    case 'lte': return Number(actual) <= Number(value);
    case 'between': return Array.isArray(value) && Number(actual) >= Number(value[0]) && Number(actual) <= Number(value[1]);
    case 'contains':     return String(actual ?? '').toLowerCase().includes(String(value).toLowerCase());
    case 'not_contains': return !String(actual ?? '').toLowerCase().includes(String(value).toLowerCase());
    case 'in':     return Array.isArray(value) && value.includes(actual);
    case 'not_in': return Array.isArray(value) && !value.includes(actual);
    default: return false;
  }
}

/**
 * Evaluate a condition set against a flat context object.
 * @param conditions  { operator?: 'AND'|'OR', rules: Array<{field, op, value}> }
 * @param context     e.g. { nps: 4, sentiment: 'negative', text: '...' }
 */
export function evaluateConditions(conditions: ConditionSet | null | undefined, context: Record<string, unknown> = {}): boolean {
  if (!conditions || !Array.isArray(conditions.rules) || conditions.rules.length === 0) return true;
  const op = (conditions.operator || 'AND').toUpperCase();
  const results = conditions.rules.map((r) => compare(r.op, context[r.field], r.value));
  return op === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

// ── Action execution ──────────────────────────────────────────────────────────

export const LIVE_ACTIONS = new Set(['notify.in_app', 'notify.slack', 'notify.email', 'notify.webhook', 'data.tag_responses', 'flow.stop']);

/**
 * Execute one action node. Returns { status, output, error?, stop? }.
 * `ctx` carries orgId, the trigger event, and accumulated variables.
 */
export async function executeAction(node: WorkflowNode, ctx: ExecutionContext): Promise<ActionResult> {
  const action = node.action ?? '';
  const config = (node.config || {}) as Record<string, unknown>;
  try {
    switch (action) {
      case 'notify.in_app': {
        const recipients = (config.userIds as string[] | undefined) || ctx.recipientUserIds || (ctx.event.targetUserIds || []);
        const userList = (recipients as string[]).length ? recipients as string[] : [ctx.event.userId].filter(Boolean) as string[];
        let made = 0;
        for (const userId of userList) {
          const row = await createNotification({
            orgId: ctx.orgId, userId, type: ctx.event.type || 'workflow.action',
            priority: config.priority as string | undefined || 'info',
            title: render(config.title as string | undefined || 'Workflow notification', ctx),
            body: render(config.body as string | undefined || ctx.event.title || '', ctx),
            actionUrl: config.actionUrl as string | undefined || ctx.event.actionUrl as string | undefined || null,
            entityType: 'workflow', entityId: ctx.workflowId,
          });
          if (row) made++;
        }
        return { status: 'completed', output: { notifications: made } };
      }
      case 'notify.slack': {
        const r = await sendSlack(ctx.orgId, ctx.event.userId || null, {
          id: ctx.workflowId,
          type: ctx.event.type || 'workflow.action',
          title: render(config.title as string | undefined || ctx.event.title || 'Workflow alert', ctx),
          body: render(config.body as string | undefined || '', ctx),
          priority: config.priority as string | undefined || 'info',
          actionUrl: ctx.event.actionUrl as string | undefined || null,
        });
        return { status: r.delivered ? 'completed' : 'skipped', output: r as unknown as Record<string, unknown> };
      }
      case 'notify.email': {
        const r = await sendEmail(ctx.orgId, (config.userId as string | undefined) || ctx.event.userId || '', {
          id: ctx.workflowId,
          type: ctx.event.type || 'workflow.action',
          title: render(config.subject as string | undefined || ctx.event.title || 'Workflow', ctx),
          body: render(config.body as string | undefined || '', ctx),
          actionUrl: ctx.event.actionUrl as string | undefined || null,
        });
        return { status: r.delivered ? 'completed' : 'skipped', output: r as unknown as Record<string, unknown> };
      }
      case 'notify.webhook': {
        if (!config.url) return { status: 'skipped', output: { reason: 'no_url' } };
        const res = await fetch(config.url as string, {
          method: config.method as string || 'POST',
          headers: { 'Content-Type': 'application/json', ...(config.headers as Record<string, string> || {}) },
          body: JSON.stringify(config.payload || { event: ctx.event }),
        });
        return { status: res.ok ? 'completed' : 'failed', output: { status: res.status } };
      }
      case 'data.tag_responses': {
        if (!ctx.event.responseId || !config.tag) return { status: 'skipped', output: { reason: 'missing_target' } };
        return { status: 'completed', output: { tagged: ctx.event.responseId, tag: config.tag } };
      }
      case 'flow.stop':
        return { status: 'completed', output: {}, stop: true };
      case 'flow.approval':
        return { status: 'waiting', output: { approvalRequired: true }, pause: true };
      case 'jira.create_issue':
        return jiraCreateIssue(config, { orgId: ctx.orgId, event: ctx.event as Record<string, unknown>, vars: ctx.vars });
      case 'salesforce.update_contact':
        return salesforceUpdateContact(config, { orgId: ctx.orgId, event: ctx.event as Record<string, unknown>, vars: ctx.vars });
      case 'servicenow.create_incident':
        return servicenowCreateIncident(config, { orgId: ctx.orgId, event: ctx.event as Record<string, unknown>, vars: ctx.vars });
      case 'crystal.summarize': {
        const r = crystalSummarize({ orgId: ctx.orgId, event: ctx.event as Record<string, unknown>, vars: ctx.vars });
        if (r.vars) Object.assign(ctx.vars, r.vars);
        return r;
      }
      case 'crystal.classify': {
        const r = crystalClassify({ orgId: ctx.orgId, event: ctx.event as Record<string, unknown>, vars: ctx.vars });
        if (r.vars) Object.assign(ctx.vars, r.vars);
        return r;
      }
      default:
        return { status: 'skipped', output: { reason: 'not_wired', action } };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', error: msg };
  }
}

// Minimal {{var}} templating from the context (event fields).
export function render(tpl: string, ctx: ExecutionContext): string {
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = key.split('.').reduce(
      (o: unknown, k: string) => (o == null ? o : (o as Record<string, unknown>)[k]),
      { ...ctx.event, ...ctx.vars }
    );
    return v == null ? '' : String(v);
  });
}

// ── Workflow run ──────────────────────────────────────────────────────────────

// Execute nodes from `startIndex`. Returns { status, conditionsPassed, pauseIndex? }.
export async function runNodes(nodes: WorkflowNode[], startIndex: number, ctx: ExecutionContext, execId: string): Promise<RunResult> {
  let conditionsPassed = true;
  for (let i = startIndex; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'trigger') continue;
    if (node.type === 'condition') {
      conditionsPassed = evaluateConditions(node.conditions, { ...ctx.event, ...(ctx.event.payload || {}) });
      await logStep(execId, node, conditionsPassed ? 'completed' : 'skipped', { passed: conditionsPassed });
      if (!conditionsPassed) return { status: 'skipped', conditionsPassed };
      continue;
    }
    if (node.type === 'action') {
      const result = await executeAction(node, ctx);
      await logStep(execId, node, result.status, result.output, result.error);
      if (result.status === 'failed') return { status: 'failed', conditionsPassed };
      if (result.pause) return { status: 'waiting', conditionsPassed, pauseIndex: i };
      if (result.stop) return { status: 'completed', conditionsPassed };
    }
  }
  return { status: 'completed', conditionsPassed };
}

// ── Graph (branching) execution ────────────────────────────────────────────────

export function isGraphWorkflow(workflow: WorkflowRecord): boolean {
  return Array.isArray(workflow.edges) && (workflow.edges as WorkflowEdge[]).some((e) => e.branch === 'true' || e.branch === 'false');
}

// Outgoing-edge adjacency keyed by source node id.
function buildAdjacency(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const out = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
  }
  return out;
}

function nextEdge(edges: WorkflowEdge[] | undefined, branch: string | null): WorkflowEdge | null {
  if (!edges || edges.length === 0) return null;
  if (branch != null) {
    return edges.find((e) => e.branch === branch) || edges.find((e) => e.branch == null) || null;
  }
  return edges.find((e) => e.branch == null) || edges[0];
}

export async function runGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  ctx: ExecutionContext,
  execId: string,
  startNodeId: string | null
): Promise<RunResult> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = buildAdjacency(edges);
  let conditionsPassed = true;
  let currentId: string | null | undefined = startNodeId || (nodes.find((n) => n.type === 'trigger') || nodes[0] || {}).id;
  const maxSteps = nodes.length * 2 + 2; // cycle guard
  let steps = 0;

  while (currentId != null && steps++ < maxSteps) {
    const node = byId.get(currentId);
    if (!node) break;
    let branch: string | null = null;

    if (node.type === 'condition') {
      conditionsPassed = evaluateConditions(node.conditions, { ...ctx.event, ...(ctx.event.payload || {}) });
      await logStep(execId, node, conditionsPassed ? 'completed' : 'skipped', { passed: conditionsPassed });
      branch = conditionsPassed ? 'true' : 'false';
    } else if (node.type === 'action') {
      const result = await executeAction(node, ctx);
      await logStep(execId, node, result.status, result.output, result.error);
      if (result.status === 'failed') return { status: 'failed', conditionsPassed };
      if (result.pause) {
        const succ = nextEdge(adj.get(currentId), null);
        return { status: 'waiting', conditionsPassed, resumeNodeId: succ ? succ.to : null };
      }
      if (result.stop) return { status: 'completed', conditionsPassed };
    }

    const edge = nextEdge(adj.get(currentId), branch);
    if (!edge) {
      if (node.type === 'condition' && !conditionsPassed) return { status: 'skipped', conditionsPassed };
      return { status: 'completed', conditionsPassed };
    }
    currentId = edge.to;
  }
  return { status: 'completed', conditionsPassed };
}

// Finalize an execution + roll up workflow stats (terminal states only).
async function finalizeExecution(execId: string, workflowId: string, status: string, started: number): Promise<void> {
  await query(
    `UPDATE workflow_executions SET status = $2, completed_at = NOW(), duration_ms = $3 WHERE id = $1`,
    [execId, status, Date.now() - started]
  );
  await query(
    `UPDATE workflows SET run_count = run_count + 1,
       success_count = success_count + $2, last_run_at = NOW(), last_status = $3 WHERE id = $1`,
    [workflowId, status === 'completed' ? 1 : 0, status]
  );
}

export interface WorkflowRunResult {
  executionId: string;
  status: string;
  conditionsPassed: boolean;
  durationMs: number;
}

/** Run one workflow against a trigger event. Pauses at flow.approval nodes. */
export async function runWorkflow(workflow: WorkflowRecord, event: TriggerEvent, { orgId }: { orgId: string }): Promise<WorkflowRunResult> {
  const started = Date.now();
  const { rows: [exec] } = await query(
    `INSERT INTO workflow_executions (workflow_id, org_id, trigger_type, trigger_payload, status)
     VALUES ($1,$2,$3,$4::jsonb,'executing') RETURNING id`,
    [workflow.id, orgId, event.type || workflow.trigger_type || 'manual', JSON.stringify(event)]
  );
  const execId = (exec as { id: string }).id;
  const ctx: ExecutionContext = { orgId, workflowId: workflow.id, event, vars: {} };
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const graph = isGraphWorkflow(workflow);

  let res: RunResult;
  try {
    res = graph
      ? await runGraph(nodes, workflow.edges || [], ctx, execId, null)
      : await runNodes(nodes, 0, ctx, execId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await query('UPDATE workflow_executions SET error_message = $2 WHERE id = $1', [execId, msg]);
    res = { status: 'failed', conditionsPassed: true };
  }

  if (res.status === 'waiting') {
    await query('UPDATE workflow_executions SET status = $2, resume_index = $3, resume_node_id = $4 WHERE id = $1',
      [execId, 'waiting', res.pauseIndex != null ? res.pauseIndex + 1 : null, res.resumeNodeId || null]);
    const approvalNodeId = graph
      ? res.resumeNodeId || 'approval'
      : (nodes[res.pauseIndex ?? 0]?.id || 'approval');
    await query(
      `INSERT INTO workflow_approvals (execution_id, org_id, workflow_id, node_id, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [execId, orgId, workflow.id, approvalNodeId]
    );
  } else {
    await finalizeExecution(execId, workflow.id, res.status, started);
  }
  return { executionId: execId, status: res.status, conditionsPassed: res.conditionsPassed, durationMs: Date.now() - started };
}

/** Approve or reject a waiting execution; resume from resume_index on approval. */
export async function resumeWorkflow(
  executionId: string,
  orgId: string,
  decision: string,
  userId: string
): Promise<{ status: string } | null> {
  const started = Date.now();
  const { rows: [exec] } = await query(
    `SELECT * FROM workflow_executions WHERE id = $1 AND org_id = $2 AND status = 'waiting'`,
    [executionId, orgId]
  );
  if (!exec) return null;

  const execRow = exec as Record<string, unknown>;
  const approved = decision === 'approved' || decision === 'approve';
  await query(
    `UPDATE workflow_approvals SET status = $2, decided_by = $3, decided_at = NOW()
      WHERE execution_id = $1 AND status = 'pending'`,
    [executionId, approved ? 'approved' : 'rejected', userId]
  );

  if (!approved) {
    await finalizeExecution(executionId, execRow.workflow_id as string, 'skipped', started);
    return { status: 'rejected' };
  }

  const { rows: [wf] } = await query('SELECT * FROM workflows WHERE id = $1', [execRow.workflow_id]);
  const wfRow = wf as WorkflowRecord | undefined;
  const nodes = Array.isArray(wfRow?.nodes) ? wfRow.nodes : [];
  const ctx: ExecutionContext = { orgId, workflowId: execRow.workflow_id as string, event: (execRow.trigger_payload as TriggerEvent) || {}, vars: {} };
  const graph = execRow.resume_node_id != null;
  let res: RunResult;
  try {
    res = graph
      ? await runGraph(nodes, Array.isArray(wfRow?.edges) ? wfRow.edges : [], ctx, executionId, execRow.resume_node_id as string)
      : await runNodes(nodes, (execRow.resume_index as number) || 0, ctx, executionId);
  } catch { res = { status: 'failed', conditionsPassed: true }; }

  if (res.status === 'waiting') {
    await query('UPDATE workflow_executions SET resume_index = $2, resume_node_id = $3 WHERE id = $1',
      [executionId, res.pauseIndex != null ? res.pauseIndex + 1 : null, res.resumeNodeId || null]);
    const approvalNodeId = graph
      ? res.resumeNodeId || 'approval'
      : (nodes[res.pauseIndex ?? 0]?.id || 'approval');
    await query(
      `INSERT INTO workflow_approvals (execution_id, org_id, workflow_id, node_id, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [executionId, orgId, execRow.workflow_id, approvalNodeId]
    );
  } else {
    await finalizeExecution(executionId, execRow.workflow_id as string, res.status, started);
  }
  return { status: res.status };
}

async function logStep(execId: string, node: WorkflowNode, status: string, output: Record<string, unknown> = {}, error: string | null = null): Promise<void> {
  await query(
    `INSERT INTO workflow_step_executions (execution_id, node_id, node_type, status, output, error_message)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [execId, node.id || node.action || node.type, node.type, status, JSON.stringify(output), error]
  );
}

/** Find active workflows subscribed to a trigger type and run each. */
export async function runWorkflowsForEvent(orgId: string, triggerType: string, event: TriggerEvent): Promise<WorkflowRunResult[]> {
  const { rows } = await query(
    `SELECT * FROM workflows
      WHERE org_id = $1 AND trigger_type = $2 AND status = 'active' AND deleted_at IS NULL`,
    [orgId, triggerType]
  );
  const results: WorkflowRunResult[] = [];
  for (const wf of rows as WorkflowRecord[]) {
    try { results.push(await runWorkflow(wf, { ...event, type: triggerType }, { orgId })); }
    catch { /* one workflow's failure must not abort the rest */ }
  }
  return results;
}

/**
 * Run all active time.schedule workflows whose cron matches `now`. Called once a
 * minute by the Event Engine. The cron lives on the trigger node's config.cron.
 */
export async function runScheduledWorkflows(now: Date = new Date()): Promise<WorkflowRunResult[]> {
  const { rows } = await query(
    `SELECT * FROM workflows
      WHERE trigger_type = 'time.schedule' AND status = 'active' AND deleted_at IS NULL`
  );
  const ran: WorkflowRunResult[] = [];
  for (const wf of rows as WorkflowRecord[]) {
    try {
      const triggerNode = (Array.isArray(wf.nodes) ? wf.nodes : []).find((n) => n.type === 'trigger');
      const cron = (triggerNode?.config as { cron?: string } | undefined)?.cron;
      if (!cron || !cronMatches(cron, now)) continue;
      ran.push(await runWorkflow(wf, { type: 'time.schedule', scheduledAt: now.toISOString() }, { orgId: wf.org_id }));
    } catch { /* one schedule failure must not abort the sweep */ }
  }
  return ran;
}
