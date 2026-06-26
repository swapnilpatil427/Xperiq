import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const NOTIF_PATH = _require.resolve(resolve(__dirname, '../lib/notifications'));
const CH_PATH    = _require.resolve(resolve(__dirname, '../lib/channels'));
const MOD_PATH   = _require.resolve(resolve(__dirname, '../lib/workflowEngine'));

let dbQuery, createNotificationMock, sendSlackMock, sendEmailMock;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function load() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[NOTIF_PATH] = fakeMod(NOTIF_PATH, { createNotification: createNotificationMock, serialize: (r) => r });
  _require.cache[CH_PATH] = fakeMod(CH_PATH, { sendSlack: sendSlackMock, sendEmail: sendEmailMock });
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

beforeEach(() => {
  dbQuery = vi.fn(async (text) => {
    if (text.startsWith('INSERT INTO workflow_executions')) return { rows: [{ id: 'exec-1' }] };
    return { rows: [] };
  });
  createNotificationMock = vi.fn(async () => ({ id: 'n1' }));
  sendSlackMock = vi.fn(async () => ({ channel: 'slack', delivered: true }));
  sendEmailMock = vi.fn(async () => ({ channel: 'email', delivered: true }));
});

describe('evaluateConditions', () => {
  it('AND requires all rules to pass', () => {
    const { evaluateConditions } = load();
    const conds = { operator: 'AND', rules: [{ field: 'nps', op: 'lte', value: 6 }, { field: 'sentiment', op: 'eq', value: 'negative' }] };
    expect(evaluateConditions(conds, { nps: 4, sentiment: 'negative' })).toBe(true);
    expect(evaluateConditions(conds, { nps: 9, sentiment: 'negative' })).toBe(false);
  });
  it('OR requires any rule', () => {
    const { evaluateConditions } = load();
    const conds = { operator: 'OR', rules: [{ field: 'nps', op: 'lte', value: 6 }, { field: 'text', op: 'contains', value: 'cancel' }] };
    expect(evaluateConditions(conds, { nps: 9, text: 'I want to cancel' })).toBe(true);
    expect(evaluateConditions(conds, { nps: 9, text: 'all good' })).toBe(false);
  });
  it('empty conditions pass', () => {
    const { evaluateConditions } = load();
    expect(evaluateConditions(null, {})).toBe(true);
    expect(evaluateConditions({ rules: [] }, {})).toBe(true);
  });
  it('supports between/in operators', () => {
    const { evaluateConditions } = load();
    expect(evaluateConditions({ rules: [{ field: 'nps', op: 'between', value: [0, 6] }] }, { nps: 3 })).toBe(true);
    expect(evaluateConditions({ rules: [{ field: 'channel', op: 'in', value: ['email', 'qr'] }] }, { channel: 'email' })).toBe(true);
  });
});

describe('executeAction', () => {
  it('notify.in_app creates a notification', async () => {
    const { executeAction } = load();
    const r = await executeAction(
      { type: 'action', action: 'notify.in_app', config: { priority: 'warning', title: 'Hi {{nps}}' } },
      { orgId: 'o1', workflowId: 'w1', event: { userId: 'u1', nps: 4 }, vars: {} }
    );
    expect(r.status).toBe('completed');
    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'o1', userId: 'u1', priority: 'warning', title: 'Hi 4' }));
  });
  it('notify.slack delegates to the slack sender', async () => {
    const { executeAction } = load();
    const r = await executeAction({ type: 'action', action: 'notify.slack', config: {} }, { orgId: 'o1', event: { title: 'X' }, vars: {} });
    expect(r.status).toBe('completed');
    expect(sendSlackMock).toHaveBeenCalled();
  });
  it('flow.stop signals termination', async () => {
    const { executeAction } = load();
    const r = await executeAction({ type: 'action', action: 'flow.stop' }, { orgId: 'o1', event: {}, vars: {} });
    expect(r.stop).toBe(true);
  });
  it('jira.create_issue is skipped (graceful) when unconfigured', async () => {
    delete process.env.JIRA_BASE_URL;
    const { executeAction } = load();
    const r = await executeAction({ type: 'action', action: 'jira.create_issue', config: {} }, { orgId: 'o1', event: {}, vars: {} });
    expect(r.status).toBe('skipped');
    expect(r.output.reason).toBe('not_configured');
  });

  it('crystal.summarize produces a summary and exposes it to downstream vars', async () => {
    const { executeAction } = load();
    const ctx = { orgId: 'o1', event: { title: 'NPS drop', nps: 3, sentiment: 'negative' }, vars: {} };
    const r = await executeAction({ type: 'action', action: 'crystal.summarize' }, ctx);
    expect(r.status).toBe('completed');
    expect(r.output.summary).toMatch(/Crystal summary/);
    expect(ctx.vars.crystalSummary).toBeTruthy();
  });

  it('crystal.classify derives severity from NPS', async () => {
    const { executeAction } = load();
    const ctx = { orgId: 'o1', event: { nps: 2 }, vars: {} };
    const r = await executeAction({ type: 'action', action: 'crystal.classify' }, ctx);
    expect(r.output.severity).toBe('critical');
    expect(ctx.vars.crystalSeverity).toBe('critical');
  });

  it('salesforce.update_contact is skipped (graceful) when unconfigured', async () => {
    delete process.env.SF_INSTANCE_URL; delete process.env.SF_ACCESS_TOKEN;
    const { executeAction } = load();
    const r = await executeAction({ type: 'action', action: 'salesforce.update_contact', config: {} }, { orgId: 'o1', event: { contactId: 'c1' }, vars: {} });
    expect(r.status).toBe('skipped');
    expect(r.output.connector).toBe('salesforce');
  });

  it('servicenow.create_incident is skipped (graceful) when unconfigured', async () => {
    delete process.env.SERVICENOW_INSTANCE_URL;
    const { executeAction } = load();
    const r = await executeAction({ type: 'action', action: 'servicenow.create_incident', config: {} }, { orgId: 'o1', event: {}, vars: {} });
    expect(r.status).toBe('skipped');
    expect(r.output.connector).toBe('servicenow');
  });

  it('truly-unwired actions are skipped, not failed', async () => {
    const { executeAction } = load();
    const r = await executeAction({ type: 'action', action: 'integration.unknown' }, { orgId: 'o1', event: {}, vars: {} });
    expect(r.status).toBe('skipped');
  });
});

describe('runGraph (branching)', () => {
  // Condition fans out into true/false branches; only the matching branch runs.
  const branchWf = {
    id: 'w1', org_id: 'o1',
    nodes: [
      { id: 't', type: 'trigger' },
      { id: 'c', type: 'condition', conditions: { rules: [{ field: 'nps', op: 'lte', value: 6 }] } },
      { id: 'detractor', type: 'action', action: 'notify.in_app', config: { title: 'Detractor', userIds: ['u1'] } },
      { id: 'promoter', type: 'action', action: 'notify.slack', config: {} },
    ],
    edges: [
      { from: 't', to: 'c' },
      { from: 'c', to: 'detractor', branch: 'true' },
      { from: 'c', to: 'promoter', branch: 'false' },
    ],
  };

  it('follows the true branch when the condition passes', async () => {
    const { runWorkflow } = load();
    const r = await runWorkflow(branchWf, { userId: 'u1', nps: 3 }, { orgId: 'o1' });
    expect(r.status).toBe('completed');
    expect(createNotificationMock).toHaveBeenCalled();   // in_app (true branch) ran
    expect(sendSlackMock).not.toHaveBeenCalled();          // slack (false branch) skipped
  });

  it('follows the false branch when the condition fails', async () => {
    const { runWorkflow } = load();
    const r = await runWorkflow(branchWf, { userId: 'u1', nps: 9 }, { orgId: 'o1' });
    expect(r.status).toBe('completed');
    expect(sendSlackMock).toHaveBeenCalled();              // slack (false branch) ran
    expect(createNotificationMock).not.toHaveBeenCalled(); // in_app (true branch) skipped
  });

  it('isGraphWorkflow detects branch edges', () => {
    const { isGraphWorkflow } = load();
    expect(isGraphWorkflow(branchWf)).toBe(true);
    expect(isGraphWorkflow({ edges: [{ from: 'a', to: 'b' }] })).toBe(false);
    expect(isGraphWorkflow({ nodes: [] })).toBe(false);
  });

  it('pauses a branching workflow at an approval node and resumes from the next node', async () => {
    const approvalGraph = {
      id: 'w2', org_id: 'o1',
      nodes: [
        { id: 't', type: 'trigger' },
        { id: 'appr', type: 'action', action: 'flow.approval' },
        { id: 'after', type: 'action', action: 'notify.in_app', config: { title: 'Go', userIds: ['u1'] } },
      ],
      edges: [
        { from: 't', to: 'appr' },
        { from: 'appr', to: 'after' },
        { from: 't', to: 'appr', branch: 'true' }, // marks graph mode
      ],
    };
    let resumeNode = null;
    dbQuery = vi.fn(async (text, params) => {
      if (text.startsWith('INSERT INTO workflow_executions')) return { rows: [{ id: 'exec-2' }] };
      if (text.startsWith('UPDATE workflow_executions SET status') && /resume_node_id/.test(text)) { resumeNode = params[3]; return { rows: [] }; }
      return { rows: [] };
    });
    const { runWorkflow } = load();
    const r = await runWorkflow(approvalGraph, { userId: 'u1' }, { orgId: 'o1' });
    expect(r.status).toBe('waiting');
    expect(resumeNode).toBe('after');                 // resumes at the post-approval node
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});

describe('approval state machine', () => {
  const approvalWf = {
    id: 'w1', org_id: 'o1', nodes: [
      { id: 't', type: 'trigger' },
      { id: 'appr', type: 'action', action: 'flow.approval' },
      { id: 'a1', type: 'action', action: 'notify.in_app', config: { title: 'Approved!', userIds: ['u1'] } },
    ],
  };

  it('pauses at a flow.approval node and records a pending approval', async () => {
    const inserts = [];
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO workflow_executions')) return { rows: [{ id: 'exec-1' }] };
      if (text.startsWith('INSERT INTO workflow_approvals')) { inserts.push('approval'); return { rows: [] }; }
      return { rows: [] };
    });
    const { runWorkflow } = load();
    const r = await runWorkflow(approvalWf, { userId: 'u1' }, { orgId: 'o1' });
    expect(r.status).toBe('waiting');
    expect(inserts).toContain('approval');         // pending approval created
    expect(createNotificationMock).not.toHaveBeenCalled(); // post-approval action not yet run
  });

  it('resumes and runs remaining actions on approval', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM workflow_executions')) return { rows: [{ id: 'exec-1', workflow_id: 'w1', resume_index: 2, trigger_payload: { userId: 'u1' } }] };
      if (text.includes('FROM workflows')) return { rows: [approvalWf] };
      return { rows: [] };
    });
    const { resumeWorkflow } = load();
    const r = await resumeWorkflow('exec-1', 'o1', 'approved', 'admin');
    expect(r.status).toBe('completed');
    expect(createNotificationMock).toHaveBeenCalled(); // the post-approval notify ran
  });

  it('aborts (skipped) on rejection without running remaining actions', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM workflow_executions')) return { rows: [{ id: 'exec-1', workflow_id: 'w1', resume_index: 2, trigger_payload: {} }] };
      return { rows: [] };
    });
    const { resumeWorkflow } = load();
    const r = await resumeWorkflow('exec-1', 'o1', 'rejected', 'admin');
    expect(r.status).toBe('rejected');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('returns null when there is no waiting execution', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { resumeWorkflow } = load();
    expect(await resumeWorkflow('missing', 'o1', 'approved', 'admin')).toBeNull();
  });
});

describe('runScheduledWorkflows', () => {
  it('runs time.schedule workflows whose cron matches now', async () => {
    const wf = {
      id: 'w1', org_id: 'o1', trigger_type: 'time.schedule',
      nodes: [
        { id: 't', type: 'trigger', trigger: 'time.schedule', config: { cron: '* * * * *' } },
        { id: 'a1', type: 'action', action: 'notify.in_app', config: { title: 'Digest', userIds: ['u1'] } },
      ],
    };
    dbQuery = vi.fn(async (text) => {
      if (text.includes("trigger_type = 'time.schedule'")) return { rows: [wf] };
      if (text.startsWith('INSERT INTO workflow_executions')) return { rows: [{ id: 'exec-1' }] };
      return { rows: [] };
    });
    const { runScheduledWorkflows } = load();
    const ran = await runScheduledWorkflows(new Date());
    expect(ran).toHaveLength(1);
    expect(createNotificationMock).toHaveBeenCalled();
  });

  it('skips workflows whose cron does not match', async () => {
    const wf = {
      id: 'w1', org_id: 'o1', trigger_type: 'time.schedule',
      nodes: [{ id: 't', type: 'trigger', config: { cron: '0 0 1 1 *' } }], // midnight Jan 1
    };
    dbQuery = vi.fn(async (text) => {
      if (text.includes("trigger_type = 'time.schedule'")) return { rows: [wf] };
      return { rows: [] };
    });
    const { runScheduledWorkflows } = load();
    const ran = await runScheduledWorkflows(new Date(2026, 5, 8, 8, 0)); // Jun 8 08:00 — no match
    expect(ran).toHaveLength(0);
  });
});

describe('runWorkflow', () => {
  it('runs trigger→condition→actions and completes', async () => {
    const { runWorkflow } = load();
    const wf = {
      id: 'w1', trigger_type: 'survey.response_filtered',
      nodes: [
        { id: 't', type: 'trigger' },
        { id: 'c', type: 'condition', conditions: { operator: 'AND', rules: [{ field: 'nps', op: 'lte', value: 6 }] } },
        { id: 'a1', type: 'action', action: 'notify.in_app', config: { title: 'Detractor' } },
      ],
    };
    const r = await runWorkflow(wf, { userId: 'u1', nps: 3 }, { orgId: 'o1' });
    expect(r.status).toBe('completed');
    expect(r.conditionsPassed).toBe(true);
    expect(createNotificationMock).toHaveBeenCalled();
  });

  it('skips actions when conditions fail', async () => {
    const { runWorkflow } = load();
    const wf = {
      id: 'w1', nodes: [
        { id: 'c', type: 'condition', conditions: { rules: [{ field: 'nps', op: 'lte', value: 6 }] } },
        { id: 'a1', type: 'action', action: 'notify.in_app', config: {} },
      ],
    };
    const r = await runWorkflow(wf, { userId: 'u1', nps: 9 }, { orgId: 'o1' });
    expect(r.status).toBe('skipped');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});
