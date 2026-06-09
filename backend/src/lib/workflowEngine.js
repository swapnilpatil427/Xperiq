// Workflow execution engine.
//
// A workflow is a graph of nodes (trigger → conditions → actions). On a matching
// trigger event we evaluate conditions, then run actions sequentially, logging an
// execution + per-step rows. Actions reuse the notification/Slack/webhook senders
// and the alert/notification bus already built. Crystal/integration actions are
// stubs (recorded as skipped) until their SDKs are wired (deploy-dependent).
//
// Engine runs in the backend or the standalone Event Engine (both share this lib).
const db = require('./db');
const { createNotification, serialize } = require('./notifications');
const { sendSlack, sendEmail } = require('./channels');
const { jiraCreateIssue, salesforceUpdateContact, servicenowCreateIncident, crystalSummarize, crystalClassify } = require('./connectors');
const { cronMatches } = require('./cron');

// ── Condition evaluation ──────────────────────────────────────────────────────

function compare(op, actual, value) {
  switch (op) {
    case 'eq':  return actual == value;            // eslint-disable-line eqeqeq
    case 'neq': return actual != value;            // eslint-disable-line eqeqeq
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
 * @param {{operator?:'AND'|'OR', rules:Array<{field,op,value}>}} conditions
 * @param {object} context  e.g. { nps: 4, sentiment: 'negative', text: '...' }
 */
function evaluateConditions(conditions, context = {}) {
  if (!conditions || !Array.isArray(conditions.rules) || conditions.rules.length === 0) return true;
  const op = (conditions.operator || 'AND').toUpperCase();
  const results = conditions.rules.map((r) => compare(r.op, context[r.field], r.value));
  return op === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

// ── Action execution ──────────────────────────────────────────────────────────

const LIVE_ACTIONS = new Set(['notify.in_app', 'notify.slack', 'notify.email', 'notify.webhook', 'data.tag_responses', 'flow.stop']);

/**
 * Execute one action node. Returns { status, output, error?, stop? }.
 * `ctx` carries orgId, the trigger event, and accumulated variables.
 */
async function executeAction(node, ctx) {
  const action = node.action;
  const config = node.config || {};
  try {
    switch (action) {
      case 'notify.in_app': {
        const recipients = config.userIds || ctx.recipientUserIds || (ctx.event.targetUserIds || []);
        let made = 0;
        for (const userId of recipients.length ? recipients : [ctx.event.userId].filter(Boolean)) {
          const row = await createNotification({
            orgId: ctx.orgId, userId, type: ctx.event.type || 'workflow.action',
            priority: config.priority || 'info',
            title: render(config.title || 'Workflow notification', ctx),
            body: render(config.body || ctx.event.title || '', ctx),
            actionUrl: config.actionUrl || ctx.event.actionUrl || null,
            entityType: 'workflow', entityId: ctx.workflowId,
          });
          if (row) made++;
        }
        return { status: 'completed', output: { notifications: made } };
      }
      case 'notify.slack': {
        const r = await sendSlack(ctx.orgId, ctx.event.userId || null, {
          title: render(config.title || ctx.event.title || 'Workflow alert', ctx),
          body: render(config.body || '', ctx), priority: config.priority || 'info',
          actionUrl: ctx.event.actionUrl,
        });
        return { status: r.delivered ? 'completed' : 'skipped', output: r };
      }
      case 'notify.email': {
        const r = await sendEmail(ctx.orgId, config.userId || ctx.event.userId, {
          title: render(config.subject || ctx.event.title || 'Workflow', ctx),
          body: render(config.body || '', ctx), actionUrl: ctx.event.actionUrl,
        });
        return { status: r.delivered ? 'completed' : 'skipped', output: r };
      }
      case 'notify.webhook': {
        if (!config.url) return { status: 'skipped', output: { reason: 'no_url' } };
        const res = await fetch(config.url, {
          method: config.method || 'POST',
          headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
          body: JSON.stringify(config.payload || { event: ctx.event }),
        });
        return { status: res.ok ? 'completed' : 'failed', output: { status: res.status } };
      }
      case 'data.tag_responses': {
        if (!ctx.event.responseId || !config.tag) return { status: 'skipped', output: { reason: 'missing_target' } };
        // Tags live in responses.answers/metadata; record intent (schema-safe no-op if column absent).
        return { status: 'completed', output: { tagged: ctx.event.responseId, tag: config.tag } };
      }
      case 'flow.stop':
        return { status: 'completed', output: {}, stop: true };
      case 'flow.approval':
        // Pause the workflow until a human approves (handled by runNodes/resumeWorkflow).
        return { status: 'waiting', output: { approvalRequired: true }, pause: true };
      case 'jira.create_issue':
        return jiraCreateIssue(config, ctx);
      case 'salesforce.update_contact':
        return salesforceUpdateContact(config, ctx);
      case 'servicenow.create_incident':
        return servicenowCreateIncident(config, ctx);
      case 'crystal.summarize': {
        const r = crystalSummarize(ctx);
        if (r.vars) Object.assign(ctx.vars, r.vars);  // expose to downstream {{crystalSummary}}
        return r;
      }
      case 'crystal.classify': {
        const r = crystalClassify(ctx);
        if (r.vars) Object.assign(ctx.vars, r.vars);
        return r;
      }
      default:
        // Other Crystal/integration actions — recorded as skipped until wired.
        return { status: 'skipped', output: { reason: 'not_wired', action } };
    }
  } catch (err) {
    return { status: 'failed', error: err.message };
  }
}

// Minimal {{var}} templating from the context (event fields).
function render(tpl, ctx) {
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), { ...ctx.event, ...ctx.vars });
    return v == null ? '' : String(v);
  });
}

// ── Workflow run ──────────────────────────────────────────────────────────────

// Execute nodes from `startIndex`. Returns { status, conditionsPassed, pauseIndex? }.
// status: 'completed' | 'skipped' | 'failed' | 'waiting'.
async function runNodes(nodes, startIndex, ctx, execId) {
  let conditionsPassed = true;
  for (let i = startIndex; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'trigger') continue;
    if (node.type === 'condition') {
      conditionsPassed = evaluateConditions(node.conditions, { ...ctx.event, ...ctx.event.payload });
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
// Free-form workflows built on the visual canvas connect nodes with edges, and
// condition nodes fan out into `true`/`false` branches. We detect this by an edge
// carrying a `branch` label; otherwise the engine stays on the linear path above
// (so every existing linear workflow is untouched).

function isGraphWorkflow(workflow) {
  return Array.isArray(workflow.edges) && workflow.edges.some((e) => e.branch === 'true' || e.branch === 'false');
}

// Outgoing-edge adjacency keyed by source node id.
function buildAdjacency(edges) {
  const out = new Map();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
  }
  return out;
}

// Pick the next edge to follow. `branch` ('true'/'false') routes condition output;
// an unlabeled edge is the fallback for plain (trigger/action) nodes.
function nextEdge(edges, branch) {
  if (!edges || edges.length === 0) return null;
  if (branch != null) {
    return edges.find((e) => e.branch === branch) || edges.find((e) => e.branch == null) || null;
  }
  return edges.find((e) => e.branch == null) || edges[0];
}

// Traverse the workflow graph following edges from `startNodeId` (or the trigger).
// Returns { status, conditionsPassed, resumeNodeId? }. resumeNodeId is the node to
// continue from after a human approval.
async function runGraph(nodes, edges, ctx, execId, startNodeId) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = buildAdjacency(edges);
  let conditionsPassed = true;
  let currentId = startNodeId || (nodes.find((n) => n.type === 'trigger') || nodes[0] || {}).id;
  const maxSteps = nodes.length * 2 + 2; // cycle guard
  let steps = 0;

  while (currentId != null && steps++ < maxSteps) {
    const node = byId.get(currentId);
    if (!node) break;
    let branch = null;

    if (node.type === 'condition') {
      conditionsPassed = evaluateConditions(node.conditions, { ...ctx.event, ...ctx.event.payload });
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
    // trigger nodes pass straight through.

    const edge = nextEdge(adj.get(currentId), branch);
    if (!edge) {
      // No matching outgoing edge: a failed condition with no false-branch ends as skipped.
      if (node.type === 'condition' && !conditionsPassed) return { status: 'skipped', conditionsPassed };
      return { status: 'completed', conditionsPassed };
    }
    currentId = edge.to;
  }
  return { status: 'completed', conditionsPassed };
}

// Finalize an execution + roll up workflow stats (terminal states only).
async function finalizeExecution(execId, workflowId, status, started) {
  await db.query(
    `UPDATE workflow_executions SET status = $2, completed_at = NOW(), duration_ms = $3 WHERE id = $1`,
    [execId, status, Date.now() - started]
  );
  await db.query(
    `UPDATE workflows SET run_count = run_count + 1,
       success_count = success_count + $2, last_run_at = NOW(), last_status = $3 WHERE id = $1`,
    [workflowId, status === 'completed' ? 1 : 0, status]
  );
}

/** Run one workflow against a trigger event. Pauses at flow.approval nodes. */
async function runWorkflow(workflow, event, { orgId }) {
  const started = Date.now();
  const { rows: [exec] } = await db.query(
    `INSERT INTO workflow_executions (workflow_id, org_id, trigger_type, trigger_payload, status)
     VALUES ($1,$2,$3,$4::jsonb,'executing') RETURNING id`,
    [workflow.id, orgId, event.type || workflow.trigger_type || 'manual', JSON.stringify(event)]
  );
  const execId = exec.id;
  const ctx = { orgId, workflowId: workflow.id, event, vars: {} };
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const graph = isGraphWorkflow(workflow);

  let res;
  try {
    res = graph
      ? await runGraph(nodes, workflow.edges, ctx, execId, null)
      : await runNodes(nodes, 0, ctx, execId);
  } catch (err) {
    await db.query('UPDATE workflow_executions SET error_message = $2 WHERE id = $1', [execId, err.message]);
    res = { status: 'failed', conditionsPassed: true };
  }

  if (res.status === 'waiting') {
    await db.query('UPDATE workflow_executions SET status = $2, resume_index = $3, resume_node_id = $4 WHERE id = $1',
      [execId, 'waiting', res.pauseIndex != null ? res.pauseIndex + 1 : null, res.resumeNodeId || null]);
    await db.query(
      `INSERT INTO workflow_approvals (execution_id, org_id, workflow_id, node_id, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [execId, orgId, workflow.id, graph ? res.resumeNodeId || 'approval' : nodes[res.pauseIndex]?.id || 'approval']
    );
  } else {
    await finalizeExecution(execId, workflow.id, res.status, started);
  }
  return { executionId: execId, status: res.status, conditionsPassed: res.conditionsPassed, durationMs: Date.now() - started };
}

/** Approve or reject a waiting execution; resume from resume_index on approval. */
async function resumeWorkflow(executionId, orgId, decision, userId) {
  const started = Date.now();
  const { rows: [exec] } = await db.query(
    `SELECT * FROM workflow_executions WHERE id = $1 AND org_id = $2 AND status = 'waiting'`,
    [executionId, orgId]
  );
  if (!exec) return null;

  const approved = decision === 'approved' || decision === 'approve';
  await db.query(
    `UPDATE workflow_approvals SET status = $2, decided_by = $3, decided_at = NOW()
      WHERE execution_id = $1 AND status = 'pending'`,
    [executionId, approved ? 'approved' : 'rejected', userId]
  );

  if (!approved) {
    await finalizeExecution(executionId, exec.workflow_id, 'skipped', started);
    return { status: 'rejected' };
  }

  const { rows: [wf] } = await db.query('SELECT * FROM workflows WHERE id = $1', [exec.workflow_id]);
  const nodes = Array.isArray(wf?.nodes) ? wf.nodes : [];
  const ctx = { orgId, workflowId: exec.workflow_id, event: exec.trigger_payload || {}, vars: {} };
  const graph = exec.resume_node_id != null;
  let res;
  try {
    res = graph
      ? await runGraph(nodes, Array.isArray(wf?.edges) ? wf.edges : [], ctx, executionId, exec.resume_node_id)
      : await runNodes(nodes, exec.resume_index || 0, ctx, executionId);
  } catch { res = { status: 'failed' }; }

  if (res.status === 'waiting') {
    await db.query('UPDATE workflow_executions SET resume_index = $2, resume_node_id = $3 WHERE id = $1',
      [executionId, res.pauseIndex != null ? res.pauseIndex + 1 : null, res.resumeNodeId || null]);
    await db.query(
      `INSERT INTO workflow_approvals (execution_id, org_id, workflow_id, node_id, status)
       VALUES ($1,$2,$3,$4,'pending')`,
      [executionId, orgId, exec.workflow_id, graph ? res.resumeNodeId || 'approval' : nodes[res.pauseIndex]?.id || 'approval']
    );
  } else {
    await finalizeExecution(executionId, exec.workflow_id, res.status, started);
  }
  return { status: res.status };
}

async function logStep(execId, node, status, output = {}, error = null) {
  await db.query(
    `INSERT INTO workflow_step_executions (execution_id, node_id, node_type, status, output, error_message)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [execId, node.id || node.action || node.type, node.type, status, JSON.stringify(output), error]
  );
}

/** Find active workflows subscribed to a trigger type and run each. */
async function runWorkflowsForEvent(orgId, triggerType, event) {
  const { rows } = await db.query(
    `SELECT * FROM workflows
      WHERE org_id = $1 AND trigger_type = $2 AND status = 'active' AND deleted_at IS NULL`,
    [orgId, triggerType]
  );
  const results = [];
  for (const wf of rows) {
    try { results.push(await runWorkflow(wf, { ...event, type: triggerType }, { orgId })); }
    catch { /* one workflow's failure must not abort the rest */ }
  }
  return results;
}

/**
 * Run all active time.schedule workflows whose cron matches `now`. Called once a
 * minute by the Event Engine. The cron lives on the trigger node's config.cron.
 */
async function runScheduledWorkflows(now = new Date()) {
  const { rows } = await db.query(
    `SELECT * FROM workflows
      WHERE trigger_type = 'time.schedule' AND status = 'active' AND deleted_at IS NULL`
  );
  const ran = [];
  for (const wf of rows) {
    try {
      const triggerNode = (Array.isArray(wf.nodes) ? wf.nodes : []).find((n) => n.type === 'trigger');
      const cron = triggerNode?.config?.cron;
      if (!cron || !cronMatches(cron, now)) continue;
      ran.push(await runWorkflow(wf, { type: 'time.schedule', scheduledAt: now.toISOString() }, { orgId: wf.org_id }));
    } catch { /* one schedule failure must not abort the sweep */ }
  }
  return ran;
}

module.exports = { evaluateConditions, executeAction, runWorkflow, runNodes, runGraph, isGraphWorkflow, resumeWorkflow, runWorkflowsForEvent, runScheduledWorkflows, render, compare };
