require('./instrument'); // Sentry — must be the very first require
require('dotenv').config();

const Sentry  = require('@sentry/node');
const express = require('express');
const cors    = require('cors');
const logger  = require('./lib/logger');
const { register } = require('./lib/metrics');
const requestId  = require('./middleware/requestId');
const httpLogger = require('./middleware/httpLogger');
const { apiLimiter, aiLimiter } = require('./middleware/rateLimiter');

const BACKEND = process.env.BACKEND || 'firebase';
const isLocal = BACKEND === 'local';
const dir     = isLocal ? './routes/local' : './routes';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true }));
app.use(express.json());
app.use(requestId);  // attach req.id before logging
app.use(httpLogger); // structured request logging + Prometheus HTTP metrics

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/public',      require(`${dir}/public`));
app.use('/api/surveys',     apiLimiter, require(`${dir}/surveys`));
app.use('/api/surveys',     apiLimiter, require(`${dir}/responses`));
app.use('/api/surveys',     apiLimiter, require(`${dir}/insights`));
app.use('/api/templates',   apiLimiter, require(`${dir}/templates`));
app.use('/api/ai',          apiLimiter, aiLimiter, require(`${dir}/ai`));
app.use('/api/workflows',   apiLimiter, require(`${dir}/workflows`));
app.use('/api/org-profile', apiLimiter, require(`${dir}/orgProfile`));

// ── Observability endpoints ───────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', version: '2.0.0', backend: BACKEND })
);

app.get('/api/metrics', async (req, res) => {
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
if (isLocal) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    logger.info(`API  → http://localhost:${PORT}  (backend: local/postgres)`);
    logger.info(`Auth → ${process.env.SKIP_AUTH === 'true' ? 'SKIP_AUTH (dev-user/dev-org)' : 'Clerk JWT'}`);
    logger.info(`Metrics → http://localhost:${PORT}/api/metrics`);
  });
} else {
  const functions = require('firebase-functions/v2');
  exports.api           = functions.https.onRequest({ region: 'us-central1', memory: '256MiB' }, app);
  exports.onNewResponse = require('./triggers/onNewResponse').onNewResponse;
}
