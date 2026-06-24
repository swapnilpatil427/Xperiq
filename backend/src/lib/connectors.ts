// Workflow integration connectors. Real HTTP integrations (Jira REST, generic
// webhook) via built-in fetch — no new dependency. Credentials come from env (or,
// later, the per-org workflow_connector_credentials table). Each connector
// degrades to a graceful "not_configured" no-op so dev/tests work without keys.
//
// Crystal actions are deterministic here (templated) so they're offline-capable;
// an LLM upgrade can replace the body behind the same return shape.

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, obj: Record<string, unknown>, msg: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./logger') as Record<string, (obj: unknown, msg: string) => void>)[level](obj, msg);
  } catch { console.log(`[connectors] ${msg}`, obj); }
}

export interface ConnectorContext {
  orgId: string;
  workflowId?: string;
  event: Record<string, unknown>;
  vars: Record<string, unknown>;
}

export interface ConnectorResult {
  status: 'completed' | 'failed' | 'skipped';
  output: Record<string, unknown>;
  error?: string;
  vars?: Record<string, unknown>;
}

// ── Jira ────────────────────────────────────────────────────────────────────
export async function jiraCreateIssue(config: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorResult> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const projectKey = (config.projectKey as string | undefined) || process.env.JIRA_PROJECT_KEY;
  if (!baseUrl || !email || !token || !projectKey) {
    return { status: 'skipped', output: { connector: 'jira', reason: 'not_configured' } };
  }
  try {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/3/issue`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: config.summary || ctx.event.title || 'Experient workflow',
          description: config.description || ctx.event.body || '',
          issuetype: { name: config.issueType || 'Task' },
        },
      }),
    });
    const ok = res.ok;
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!ok) log('warn', { event: 'jira_create_failed', status: res.status }, 'Jira create failed');
    return { status: ok ? 'completed' : 'failed', output: { connector: 'jira', key: body.key, status: res.status } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', { event: 'jira_create_error', err: msg }, 'Jira create error');
    return { status: 'failed', output: { connector: 'jira' }, error: msg };
  }
}

// ── Salesforce ────────────────────────────────────────────────────────────────
export async function salesforceUpdateContact(config: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorResult> {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const token = process.env.SF_ACCESS_TOKEN;
  const contactId = render(config.contactId as string | undefined, ctx) || (ctx.event.contactId as string | undefined);
  if (!instanceUrl || !token || !contactId) {
    return { status: 'skipped', output: { connector: 'salesforce', reason: 'not_configured' } };
  }
  try {
    const fields = renderFields((config.fields as Record<string, string> | undefined) || { Description: '{{title}}' }, ctx);
    const res = await fetch(`${instanceUrl.replace(/\/$/, '')}/services/data/v59.0/sobjects/Contact/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const ok = res.ok; // Salesforce PATCH returns 204 No Content on success
    if (!ok) log('warn', { event: 'salesforce_update_failed', status: res.status }, 'Salesforce update failed');
    return { status: ok ? 'completed' : 'failed', output: { connector: 'salesforce', contactId, status: res.status } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', { event: 'salesforce_update_error', err: msg }, 'Salesforce update error');
    return { status: 'failed', output: { connector: 'salesforce' }, error: msg };
  }
}

// ── ServiceNow ────────────────────────────────────────────────────────────────
export async function servicenowCreateIncident(config: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorResult> {
  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL;
  const user = process.env.SERVICENOW_USER;
  const password = process.env.SERVICENOW_PASSWORD;
  if (!instanceUrl || !user || !password) {
    return { status: 'skipped', output: { connector: 'servicenow', reason: 'not_configured' } };
  }
  try {
    const auth = Buffer.from(`${user}:${password}`).toString('base64');
    const res = await fetch(`${instanceUrl.replace(/\/$/, '')}/api/now/table/incident`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        short_description: render(config.shortDescription as string | undefined || (ctx.event.title as string | undefined) || 'Experient alert', ctx),
        description: render(config.description as string | undefined || (ctx.event.body as string | undefined) || '', ctx),
        urgency: config.urgency || (ctx.event.severity === 'critical' ? '1' : '3'),
        impact: config.impact || '2',
      }),
    });
    const ok = res.ok;
    const body = await res.json().catch(() => ({})) as { result?: { sys_id?: string } };
    if (!ok) log('warn', { event: 'servicenow_create_failed', status: res.status }, 'ServiceNow create failed');
    return { status: ok ? 'completed' : 'failed', output: { connector: 'servicenow', sysId: body?.result?.sys_id, status: res.status } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', { event: 'servicenow_create_error', err: msg }, 'ServiceNow create error');
    return { status: 'failed', output: { connector: 'servicenow' }, error: msg };
  }
}

// Minimal {{var}} templating shared by connectors (mirrors workflowEngine.render).
export function render(tpl: string | null | undefined, ctx: ConnectorContext): string {
  if (tpl == null) return '';
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = key.split('.').reduce((o: unknown, k: string) => (o == null ? o : (o as Record<string, unknown>)[k]), { ...ctx.event, ...ctx.vars });
    return v == null ? '' : String(v);
  });
}

// Render every value in a flat field map.
function renderFields(fields: Record<string, string>, ctx: ConnectorContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = render(v, ctx);
  return out;
}

// ── Crystal (deterministic; LLM upgrade later) ────────────────────────────────
export function crystalSummarize(ctx: ConnectorContext): ConnectorResult {
  const e = ctx.event || {};
  const bits: string[] = [];
  if (e.title) bits.push(String(e.title));
  if (e.nps != null) bits.push(`NPS ${e.nps}`);
  if (e.sentiment) bits.push(`${e.sentiment} sentiment`);
  const summary = bits.length ? `Crystal summary: ${bits.join(' · ')}.` : 'Crystal summary: event received.';
  return { status: 'completed', output: { summary }, vars: { crystalSummary: summary } };
}

export function crystalClassify(ctx: ConnectorContext): ConnectorResult {
  const e = ctx.event || {};
  let severity = 'low';
  if (e.severity) severity = String(e.severity);
  else if (e.nps != null) severity = Number(e.nps) <= 3 ? 'critical' : Number(e.nps) <= 6 ? 'high' : 'low';
  return { status: 'completed', output: { severity }, vars: { crystalSeverity: severity } };
}
