// Workflow integration connectors. Real HTTP integrations (Jira REST, generic
// webhook) via built-in fetch — no new dependency. Credentials come from env (or,
// later, the per-org workflow_connector_credentials table). Each connector
// degrades to a graceful "not_configured" no-op so dev/tests work without keys.
//
// Crystal actions are deterministic here (templated) so they're offline-capable;
// an LLM upgrade can replace the body behind the same return shape.

function log(level, obj, msg) {
  try { require('./logger')[level](obj, msg); } catch { console.log(`[connectors] ${msg}`, obj); }
}

// ── Jira ────────────────────────────────────────────────────────────────────
async function jiraCreateIssue(config, ctx) {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const projectKey = config.projectKey || process.env.JIRA_PROJECT_KEY;
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
    const body = await res.json().catch(() => ({}));
    if (!ok) log('warn', { event: 'jira_create_failed', status: res.status }, 'Jira create failed');
    return { status: ok ? 'completed' : 'failed', output: { connector: 'jira', key: body.key, status: res.status } };
  } catch (err) {
    log('warn', { event: 'jira_create_error', err: err.message }, 'Jira create error');
    return { status: 'failed', output: { connector: 'jira' }, error: err.message };
  }
}

// ── Salesforce ────────────────────────────────────────────────────────────────
// Updates (or upserts) a Contact via the REST API. Credentials from env:
// SF_INSTANCE_URL + SF_ACCESS_TOKEN (an OAuth bearer the deploy provisions).
// Graceful no-op when unconfigured so dev/tests work without a Salesforce org.
async function salesforceUpdateContact(config, ctx) {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const token = process.env.SF_ACCESS_TOKEN;
  const contactId = render(config.contactId, ctx) || ctx.event.contactId;
  if (!instanceUrl || !token || !contactId) {
    return { status: 'skipped', output: { connector: 'salesforce', reason: 'not_configured' } };
  }
  try {
    const fields = renderFields(config.fields || { Description: '{{title}}' }, ctx);
    const res = await fetch(`${instanceUrl.replace(/\/$/, '')}/services/data/v59.0/sobjects/Contact/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const ok = res.ok; // Salesforce PATCH returns 204 No Content on success
    if (!ok) log('warn', { event: 'salesforce_update_failed', status: res.status }, 'Salesforce update failed');
    return { status: ok ? 'completed' : 'failed', output: { connector: 'salesforce', contactId, status: res.status } };
  } catch (err) {
    log('warn', { event: 'salesforce_update_error', err: err.message }, 'Salesforce update error');
    return { status: 'failed', output: { connector: 'salesforce' }, error: err.message };
  }
}

// ── ServiceNow ────────────────────────────────────────────────────────────────
// Creates an incident via the Table API. Credentials from env:
// SERVICENOW_INSTANCE_URL + SERVICENOW_USER + SERVICENOW_PASSWORD (Basic auth).
async function servicenowCreateIncident(config, ctx) {
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
        short_description: render(config.shortDescription || ctx.event.title || 'Experient alert', ctx),
        description: render(config.description || ctx.event.body || '', ctx),
        urgency: config.urgency || (ctx.event.severity === 'critical' ? '1' : '3'),
        impact: config.impact || '2',
      }),
    });
    const ok = res.ok;
    const body = await res.json().catch(() => ({}));
    if (!ok) log('warn', { event: 'servicenow_create_failed', status: res.status }, 'ServiceNow create failed');
    return { status: ok ? 'completed' : 'failed', output: { connector: 'servicenow', sysId: body?.result?.sys_id, status: res.status } };
  } catch (err) {
    log('warn', { event: 'servicenow_create_error', err: err.message }, 'ServiceNow create error');
    return { status: 'failed', output: { connector: 'servicenow' }, error: err.message };
  }
}

// Minimal {{var}} templating shared by connectors (mirrors workflowEngine.render).
function render(tpl, ctx) {
  if (tpl == null) return '';
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), { ...ctx.event, ...ctx.vars });
    return v == null ? '' : String(v);
  });
}

// Render every value in a flat field map.
function renderFields(fields, ctx) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = render(v, ctx);
  return out;
}

// ── Crystal (deterministic; LLM upgrade later) ────────────────────────────────
function crystalSummarize(ctx) {
  const e = ctx.event || {};
  const bits = [];
  if (e.title) bits.push(e.title);
  if (e.nps != null) bits.push(`NPS ${e.nps}`);
  if (e.sentiment) bits.push(`${e.sentiment} sentiment`);
  const summary = bits.length ? `Crystal summary: ${bits.join(' · ')}.` : 'Crystal summary: event received.';
  return { status: 'completed', output: { summary }, vars: { crystalSummary: summary } };
}

function crystalClassify(ctx) {
  const e = ctx.event || {};
  let severity = 'low';
  if (e.severity) severity = e.severity;
  else if (e.nps != null) severity = e.nps <= 3 ? 'critical' : e.nps <= 6 ? 'high' : 'low';
  return { status: 'completed', output: { severity }, vars: { crystalSeverity: severity } };
}

module.exports = { jiraCreateIssue, salesforceUpdateContact, servicenowCreateIncident, crystalSummarize, crystalClassify };
