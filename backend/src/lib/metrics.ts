import * as client from 'prom-client';

const register = new client.Registry();

// Default Node.js process metrics (memory, CPU, event loop lag, etc.)
client.collectDefaultMetrics({ register, prefix: 'node_' });

// ── HTTP ─────────────────────────────────────────────────────────────────────
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

const httpTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

// ── AI ────────────────────────────────────────────────────────────────────────
const aiDuration = new client.Histogram({
  name: 'ai_request_duration_seconds',
  help: 'OpenRouter request duration in seconds',
  labelNames: ['model', 'operation'],
  buckets: [0.5, 1, 2, 5, 10, 20, 45],
  registers: [register],
});

const aiTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total AI requests',
  labelNames: ['model', 'operation', 'status'], // status: success | error
  registers: [register],
});

const aiTokensTotal = new client.Counter({
  name: 'ai_tokens_total',
  help: 'Total tokens used (input + output)',
  labelNames: ['model', 'direction'], // direction: input | output
  registers: [register],
});

// ── Database (local / postgres mode only) ────────────────────────────────────
const dbDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Postgres query duration in seconds',
  labelNames: ['operation'], // select | insert | update | delete
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// ── Business events ───────────────────────────────────────────────────────────
const surveysCreated = new client.Counter({
  name: 'surveys_created_total',
  help: 'Total surveys created',
  labelNames: ['type'],
  registers: [register],
});

const responsesSubmitted = new client.Counter({
  name: 'responses_submitted_total',
  help: 'Total survey responses submitted',
  registers: [register],
});

const insightsGenerated = new client.Counter({
  name: 'insights_generated_total',
  help: 'Total insight analyses generated',
  labelNames: ['trigger'], // manual | auto
  registers: [register],
});

// ── Credit system ─────────────────────────────────────────────────────────────
const creditConsumed = new client.Counter({
  name: 'credit_consumed_total',
  help: 'Credits debited for metered actions',
  labelNames: ['action', 'source'], // action: insight_run|crystal_turn|… ; source: allowance|pack|overage
  registers: [register],
});

const creditGranted = new client.Counter({
  name: 'credit_granted_total',
  help: 'Credits granted (top-ups, plan resets, free grants)',
  labelNames: ['source'], // grant | allowance | pack
  registers: [register],
});

const creditDecisions = new client.Counter({
  name: 'credit_decisions_total',
  help: 'Affordability-gate decisions for metered actions',
  labelNames: ['action', 'result'], // result: allowed | denied
  registers: [register],
});

const creditWebhookTotal = new client.Counter({
  name: 'credit_webhook_total',
  help: 'Stripe webhook outcomes',
  labelNames: ['result'], // fulfilled | duplicate | unconfigured | error
  registers: [register],
});

// ── Scheduler / background jobs ─────────────────────────────────────────────
// schedulerHeartbeat is emitted by every scheduler process (the in-process Event Engine,
// the standalone scheduler service, and — via crystalos/lib/metrics — the CrystalOS scheduler).
// A stale heartbeat → the `SchedulerHeartbeatStale` alert fires, so a forgotten/dead scheduler
// pages us instead of silently rotting.
const schedulerHeartbeat = new client.Gauge({
  name: 'scheduler_heartbeat_timestamp',
  help: 'Unix timestamp (seconds) of the last scheduler tick, per component',
  labelNames: ['component'], // event_engine | scheduler | crystalos_scheduler
  registers: [register],
});

const schedulerJobRuns = new client.Counter({
  name: 'scheduler_job_runs_total',
  help: 'Scheduler job executions',
  labelNames: ['job', 'result'], // result: success | failure
  registers: [register],
});

const schedulerJobDuration = new client.Histogram({
  name: 'scheduler_job_duration_seconds',
  help: 'Scheduler job execution duration in seconds',
  labelNames: ['job'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60],
  registers: [register],
});

const schedulerJobLastSuccess = new client.Gauge({
  name: 'scheduler_job_last_success_timestamp',
  help: 'Unix timestamp (seconds) of the last successful run, per job',
  labelNames: ['job'],
  registers: [register],
});

// 1 on the scheduler replica that holds the leader lock, 0 on standbys. Drives SchedulerNoLeader.
const schedulerIsLeader = new client.Gauge({
  name: 'scheduler_is_leader',
  help: 'Whether this scheduler instance currently holds the leader lock (1) or is standby (0)',
  registers: [register],
});

// Credit ledger integrity violations found by the reconciliation job (should always be 0).
const creditInvariantViolations = new client.Gauge({
  name: 'credit_invariant_violations',
  help: 'Count of credit_accounts rows violating balance invariants (negative / over-allowance)',
  registers: [register],
});

// Trailing COGS per credit (USD) — the Cost-Down Dividend feed.
const cogsPerCredit = new client.Gauge({
  name: 'credit_cogs_per_credit_usd',
  help: 'Trailing 30-day true AI cost (USD) per consumed credit',
  registers: [register],
});

// ── Credential health (key validity / expiry monitoring) ────────────────────
// 1 = the configured integration's key authenticates; 0 = invalid/revoked/expired/unreachable.
const credentialValid = new client.Gauge({
  name: 'credential_valid',
  help: 'Whether a configured integration credential is currently valid (1) or not (0)',
  labelNames: ['integration'], // openrouter | stripe | clerk | novu | ...
  registers: [register],
});

const credentialLastCheck = new client.Gauge({
  name: 'credential_last_check_timestamp',
  help: 'Unix timestamp (seconds) of the last credential health check, per integration',
  labelNames: ['integration'],
  registers: [register],
});

// Days until the credential expires, when the provider exposes an expiry (else not set).
const credentialDaysToExpiry = new client.Gauge({
  name: 'credential_days_to_expiry',
  help: 'Days until a credential expires (only set when the provider reports an expiry)',
  labelNames: ['integration'],
  registers: [register],
});

/** Convenience: stamp the heartbeat for a scheduler component with the current time. */
function touchHeartbeat(component: string): void {
  schedulerHeartbeat.set({ component }, Date.now() / 1000);
}

const supportDocsAutoApprovedTotal = new client.Counter({
  name: 'support_docs_auto_approved_total',
  help: 'Number of docs auto-approved by the optimistic window scheduler',
  registers: [register],
});

const supportDocsPipelineTransitionsTotal = new client.Counter({
  name: 'support_docs_pipeline_transitions_total',
  help: 'Total pipeline state transitions',
  labelNames: ['from_status', 'to_status', 'actor_type'] as const,
  registers: [register],
});

const supportCrystalResolutionsTotal = new client.Counter({
  name: 'support_crystal_resolutions_total',
  help: 'Crystal support resolutions by outcome',
  labelNames: ['outcome'] as const,
  registers: [register],
});

export {
  register,
  httpDuration,
  httpTotal,
  aiDuration,
  aiTotal,
  aiTokensTotal,
  dbDuration,
  surveysCreated,
  responsesSubmitted,
  insightsGenerated,
  creditConsumed,
  creditGranted,
  creditDecisions,
  creditWebhookTotal,
  schedulerHeartbeat,
  schedulerJobRuns,
  schedulerJobDuration,
  schedulerJobLastSuccess,
  schedulerIsLeader,
  creditInvariantViolations,
  cogsPerCredit,
  credentialValid,
  credentialLastCheck,
  credentialDaysToExpiry,
  touchHeartbeat,
  supportDocsAutoApprovedTotal,
  supportDocsPipelineTransitionsTotal,
  supportCrystalResolutionsTotal,
};
