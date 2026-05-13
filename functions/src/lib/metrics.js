const client = require('prom-client');

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

module.exports = {
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
};
