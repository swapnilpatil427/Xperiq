// Workflow registry — the catalog of triggers, condition operators, and actions
// the no-code builder exposes and the engine understands. A representative,
// extensible subset of the full taxonomy (docs/workflows §3–5).

const TRIGGERS = [
  { type: 'survey.response_received', category: 'Survey', label: 'Response received' },
  { type: 'survey.response_filtered', category: 'Survey', label: 'Filtered response (power trigger)' },
  { type: 'survey.milestone_reached', category: 'Survey', label: 'Milestone reached' },
  { type: 'score.nps_drop', category: 'Score', label: 'NPS dropped' },
  { type: 'score.nps_rise', category: 'Score', label: 'NPS rose' },
  { type: 'crystal.insight_ready', category: 'Crystal', label: 'Insight ready' },
  { type: 'crystal.anomaly_detected', category: 'Crystal', label: 'Anomaly detected' },
  { type: 'crystal.verbatim_escalation', category: 'Crystal', label: 'Verbatim escalation' },
  { type: 'alert.fired', category: 'Alerts', label: 'Alert fired' },
  { type: 'time.schedule', category: 'Time', label: 'On a schedule (cron)' },
  { type: 'external.webhook', category: 'External', label: 'Inbound webhook' },
];

// Condition operators understood by evaluateConditions.
const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'between', 'contains', 'not_contains', 'in', 'not_in'];

// Fields that can be referenced in conditions (resolved from the trigger context).
const CONDITION_FIELDS = [
  { field: 'nps', label: 'NPS score', kind: 'number' },
  { field: 'csat', label: 'CSAT score', kind: 'number' },
  { field: 'sentiment', label: 'Crystal sentiment', kind: 'string' },
  { field: 'text', label: 'Response text', kind: 'string' },
  { field: 'topic', label: 'Crystal topic', kind: 'string' },
  { field: 'severity', label: 'Alert/Crystal severity', kind: 'string' },
  { field: 'completion_time', label: 'Completion time (s)', kind: 'number' },
  { field: 'channel', label: 'Channel', kind: 'string' },
];

// Actions the engine can execute. `live:true` = wired now; others are stubs/roadmap.
const ACTIONS = [
  { action: 'notify.in_app', category: 'Notify', label: 'In-app notification', live: true },
  { action: 'notify.slack', category: 'Notify', label: 'Slack message', live: true },
  { action: 'notify.email', category: 'Notify', label: 'Email', live: true },
  { action: 'notify.webhook', category: 'Notify', label: 'Webhook', live: true },
  { action: 'data.tag_responses', category: 'Data', label: 'Tag responses', live: true },
  { action: 'crystal.summarize', category: 'Crystal', label: 'Crystal summary', live: 'stub' },
  { action: 'crystal.classify', category: 'Crystal', label: 'Crystal classify', live: 'stub' },
  { action: 'crystal.write', category: 'Crystal', label: 'Crystal writes content', live: 'stub' },
  { action: 'jira.create_issue', category: 'Integration', label: 'Create Jira issue', live: 'env' },
  { action: 'salesforce.update_contact', category: 'Integration', label: 'Update Salesforce contact', live: 'env' },
  { action: 'servicenow.create_incident', category: 'Integration', label: 'Create ServiceNow incident', live: 'env' },
  { action: 'flow.approval', category: 'Flow', label: 'Require approval', live: true },
  { action: 'flow.stop', category: 'Flow', label: 'Stop workflow', live: true },
];

const ACTION_SET = new Set(ACTIONS.map((a) => a.action));

function registry() {
  return { triggers: TRIGGERS, conditionFields: CONDITION_FIELDS, conditionOperators: CONDITION_OPERATORS, actions: ACTIONS };
}

module.exports = { TRIGGERS, CONDITION_OPERATORS, CONDITION_FIELDS, ACTIONS, ACTION_SET, registry };
