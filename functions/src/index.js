require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const logger  = require('./lib/logger');
const { register } = require('./lib/metrics');
const httpLogger   = require('./middleware/httpLogger');

const BACKEND = process.env.BACKEND || 'firebase';
const isLocal = BACKEND === 'local';
const dir     = isLocal ? './routes/local' : './routes';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(httpLogger); // structured request logging + Prometheus HTTP metrics

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/public',    require(`${dir}/public`));
app.use('/api/surveys',   require(`${dir}/surveys`));
app.use('/api/surveys',   require(`${dir}/responses`));
app.use('/api/surveys',   require(`${dir}/insights`));
app.use('/api/ai',        require(`${dir}/ai`));
app.use('/api/workflows', require(`${dir}/workflows`));

// ── Observability endpoints ───────────────────────────────────────────────────
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', version: '2.0.0', backend: BACKEND })
);

// Prometheus scrape endpoint — used by local Prometheus + Grafana Cloud agent
app.get('/api/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error({ err: err.message, stack: err.stack, route: req.path }, 'Unhandled error');
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
  exports.api         = functions.https.onRequest({ region: 'us-central1', memory: '256MiB' }, app);
  exports.onNewResponse = require('./triggers/onNewResponse').onNewResponse;
}
