require('./polyfill-fetch'); // global fetch for Node < 18 — before Clerk/Sentry
require('./instrument'); // Sentry — must be the very first require

// Load root .env first (shared secrets: AGENTS_INTERNAL_KEY, AI keys, DB, etc.)
// then backend/.env for any backend-only overrides. First-loaded value wins unless
// override:true, so root sets the authoritative shared values.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // backend/.env (CWD = backend/ when run via npm start)

// Fail fast in production if required env vars are missing or insecure
if (process.env.NODE_ENV === 'production') {
  const missing = ['DATABASE_URL', 'CLERK_SECRET_KEY', 'AGENTS_INTERNAL_KEY', 'ALLOWED_ORIGIN']
    .filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  if (process.env.AGENTS_INTERNAL_KEY === 'dev-internal-key-change-in-prod') {
    throw new Error('AGENTS_INTERNAL_KEY must be changed from the default in production');
  }
}

const Sentry  = require('@sentry/node');
const express = require('express');
const cors    = require('cors');
const logger  = require('./lib/logger');
const { register } = require('./lib/metrics');
const requestId  = require('./middleware/requestId');
const httpLogger = require('./middleware/httpLogger');
const { apiLimiter, aiLimiter } = require('./middleware/rateLimiter');

const dir = './routes';

const app = express();
app.set('trust proxy', 1);

// Production: restrict CORS to the configured frontend origin.
// Dev: allow all (origin: true reflects the request Origin header).
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGIN || false)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(requestId);  // attach req.id before logging
app.use(httpLogger); // structured request logging + Prometheus HTTP metrics

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/public',      require(`${dir}/public`));
app.use('/api/surveys',     apiLimiter, require(`${dir}/surveys`));
app.use('/api/surveys',     apiLimiter, require(`${dir}/responses`));
app.use('/api/surveys',     apiLimiter, require(`${dir}/insights`));
app.use('/api/insights',    apiLimiter, require(`${dir}/insights`));
app.use('/api/templates',   apiLimiter, require(`${dir}/templates`));
app.use('/api/ai',          apiLimiter, aiLimiter, require(`${dir}/ai`));
app.use('/api/workflows',   apiLimiter, require(`${dir}/workflows`));
app.use('/api/org-profile', apiLimiter, require(`${dir}/orgProfile`));
app.use('/api/orgs',       apiLimiter, require(`${dir}/orgs`));
app.use('/api/orgs/me',    apiLimiter, require(`${dir}/members`));
app.use('/api/copilot',        apiLimiter, require(`${dir}/copilot`));
app.use('/api/runs',           apiLimiter, require(`${dir}/runs`));
app.use('/api/experience',     apiLimiter, require(`${dir}/experience`));
app.use('/api/notifications',  apiLimiter, require(`${dir}/notifications`));

// ── Observability endpoints ───────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const health = { status: 'ok', version: '2.0.0', backend: 'local' };
  try {
    await require('./lib/db').query('SELECT 1');
    health.db = 'ok';
  } catch {
    health.db = 'error';
    health.status = 'degraded';
  }
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

app.get('/api/metrics', async (req, res) => {
  // Prometheus scrapes from localhost only — block external access in production
  if (process.env.NODE_ENV === 'production') {
    const ip = req.ip || req.socket?.remoteAddress || '';
    if (!ip.includes('127.0.0.1') && !ip.includes('::1') && !ip.includes('::ffff:127.')) {
      return res.status(403).end();
    }
  }
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── Error handlers ────────────────────────────────────────────────────────────
// Sentry must come before the generic handler; no-ops when DSN is not set
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error({ err: err.message, stack: err.stack, route: req.path, requestId: req.id }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logger.info(`API  → http://localhost:${PORT}  (backend: local/postgres)`);
  logger.info(`Auth → ${process.env.SKIP_AUTH === 'true' ? 'SKIP_AUTH (dev-user/dev-org)' : 'Clerk JWT'}`);
  logger.info(`CORS → ${corsOrigin === true ? 'all origins (dev)' : (corsOrigin || 'BLOCKED — set ALLOWED_ORIGIN')}`);
  logger.info(`Agents env → AGENTS_ENV=${process.env.AGENTS_ENV || 'dev (default)'}`);
  logger.info(`Metrics → http://localhost:${PORT}/api/metrics`);
});

// Graceful shutdown — PM2 sends SIGTERM on `pm2 reload`, SIGINT on Ctrl+C
const shutdown = (sig) => {
  logger.info({ sig }, 'shutdown signal received');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => { logger.error('shutdown timeout — forcing exit'); process.exit(1); }, 30_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
