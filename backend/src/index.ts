// Side-effect bootstrap — order matters:
import './polyfill-fetch'; // global fetch polyfill for Node < 18 (before Clerk)
import './instrument';     // Sentry tracing — must be second (before app code)
import './env';            // dotenv — must run before any module reads process.env

// ── All static imports below — env vars are now loaded ───────────────────────
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import logger from './lib/logger';
import { register } from './lib/metrics';
import { query as dbQuery } from './lib/db';
import requestId from './middleware/requestId';
import httpLogger from './middleware/httpLogger';
import { apiLimiter, aiLimiter } from './middleware/rateLimiter';

// Webhooks (raw body — must mount before express.json())
import clerkWebhookRouter from './routes/webhooks/clerk';

// Novu Framework workflows — served to Novu Cloud for orchestration
import { serve } from '@novu/framework/express';
import { allWorkflows } from './lib/novu/workflows';
import { createHmac } from 'crypto';

// Routes
import publicRouter from './routes/public';
import surveysRouter from './routes/surveys';
import responsesRouter from './routes/responses';
import insightsRouter from './routes/insights';
import templatesRouter from './routes/templates';
import aiRouter from './routes/ai';
import workflowsRouter from './routes/workflows';
import orgProfileRouter from './routes/orgProfile';
import orgsRouter from './routes/orgs';
import membersRouter from './routes/members';
import usersRouter from './routes/users';
import rolesRouter from './routes/roles';
import departmentsRouter from './routes/departments';
import groupsRouter from './routes/groups';
import tagsRouter from './routes/tags';
import surveyGroupsRouter from './routes/survey-groups';
import scimTokensRouter from './routes/scimTokens';
import ssoMappingsRouter from './routes/ssoMappings';
import seatsRouter from './routes/seats';
import auditLogsRouter from './routes/auditLogs';
import alertsRouter from './routes/alerts';
import dashboardRouter from './routes/dashboard';
import dashboardConfigsRouter from './routes/dashboard-configs';
import visualRouter from './routes/visual';
import notificationChannelsRouter from './routes/notificationChannels';
import scimRouter from './routes/scim';
import copilotRouter from './routes/copilot';
import runsRouter from './routes/runs';
import experienceRouter from './routes/experience';
import notificationsRouter from './routes/notifications';
import adminRouter from './routes/admin';
import crystalNovuRouter from './routes/crystal-novu';
import contactSegmentsRouter from './routes/contact-segments';
import contactSyncRouter from './routes/contact-sync';
import contactsRouter from './routes/contacts';
import cxCasesRouter from './routes/cx-cases';
import ownershipRouter from './routes/ownership';
import ontologyRouter from './routes/ontology';
import outreachRouter from './routes/outreach';
import outreachAnalyticsRouter, { frequencyCapsRouter } from './routes/outreach-analytics';
import suppressionRouter from './routes/suppression';

// ── Production validation — fail fast before starting the server ──────────────
if (process.env.NODE_ENV === 'production') {
  const missing = ['DATABASE_URL', 'CLERK_SECRET_KEY', 'AGENTS_INTERNAL_KEY', 'ALLOWED_ORIGIN']
    .filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  if (process.env.AGENTS_INTERNAL_KEY === 'dev-internal-key-change-in-prod') {
    throw new Error('AGENTS_INTERNAL_KEY must be changed from the default in production');
  }
}

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);

// Production: restrict CORS to the configured frontend origin.
// Dev: allow all (origin: true reflects the request Origin header).
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGIN || false)
  : true;
app.use(cors({ origin: corsOrigin, credentials: true, exposedHeaders: ['X-Export-Fallback'] }));

// Clerk webhook needs the RAW body for Svix signature verification — mount it
// BEFORE express.json() so the JSON parser doesn't consume the stream.
app.use('/webhooks/clerk', express.raw({ type: '*/*' }), clerkWebhookRouter);

// Novu Framework Bridge — serves workflow definitions to Novu Cloud.
// Must be mounted before express.json() as it handles its own body parsing.
// When NOVU_API_KEY is absent (dev mode), this is a no-op.
const novuHandler = process.env.NOVU_API_KEY
  ? serve({ workflows: allWorkflows })
  : null;

if (novuHandler) {
  app.use('/api/novu', novuHandler);
}

// Novu event webhooks (delivery, open, click) — raw body for HMAC verification
app.post('/webhooks/novu', express.raw({ type: '*/*' }), async (req, res) => {
  const secret = process.env.NOVU_SECRET_KEY;
  if (secret) {
    const sig = req.headers['novu-signature'] as string | undefined;
    const hash = createHmac('sha256', secret).update(req.body as Buffer).digest('hex');
    if (sig !== `sha256=${hash}`) { res.status(401).end(); return; }
  }
  try {
    const event = JSON.parse((req.body as Buffer).toString()) as Record<string, unknown>;
    const eventType = (event.type || event.status) as string | undefined;
    const workflowId = (event.workflowIdentifier || event.transactionId) as string | undefined;
    const subscriberId = (event.subscriber as Record<string, unknown> | undefined)?.subscriberId as string | undefined;
    const channel = event.channel as string | undefined;

    logger.info({ novuEvent: eventType, workflowId, subscriberId }, 'novu:webhook');

    // Persist delivery event for analytics
    if (eventType && subscriberId) {
      const VALID_EVENTS = new Set(['sent','delivered','opened','clicked','bounced','failed','unsubscribed']);
      const normalizedType = VALID_EVENTS.has(eventType) ? eventType : 'sent';
      await dbQuery(
        `INSERT INTO notification_delivery_events
           (novu_message_id, workflow_id, subscriber_id, channel, event_type, metadata)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          event.messageId as string ?? null,
          workflowId ?? null,
          subscriberId,
          channel ?? null,
          normalizedType,
          JSON.stringify({ raw: event }),
        ]
      ).catch((err: unknown) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'novu:webhook:persist_failed');
      });

      // On bounce: auto-suppress the email address
      if (normalizedType === 'bounced') {
        const email = (event.subscriber as Record<string, unknown> | undefined)?.email as string | undefined;
        if (email) {
          // Lazy import to avoid circular deps
          import('./lib/suppressionList').then(({ addSuppression }) => {
            addSuppression(
              'global', // org_id: need to resolve from subscriber_id; for now use a lookup
              'email',
              'bounce',
              'system',
              { email }
            ).catch(() => {});
          }).catch(() => {});
        }
      }

      // On unsubscribe: add to suppression list
      if (normalizedType === 'unsubscribed') {
        const email = (event.subscriber as Record<string, unknown> | undefined)?.email as string | undefined;
        if (email) {
          import('./lib/suppressionList').then(({ addSuppression }) => {
            addSuppression('global', 'email', 'unsubscribe', 'system', { email }).catch(() => {});
          }).catch(() => {});
        }
      }
    }

    res.status(200).json({ received: true });
  } catch {
    res.status(400).json({ error: 'Invalid payload' });
  }
});

app.use(express.json());
app.use(requestId);  // attach req.id before logging
app.use(httpLogger); // structured request logging + Prometheus HTTP metrics

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/public',      publicRouter);
app.use('/api/surveys',     apiLimiter, surveysRouter);
app.use('/api/surveys',     apiLimiter, responsesRouter);
app.use('/api/surveys',     apiLimiter, insightsRouter);
app.use('/api/insights',    apiLimiter, insightsRouter);
app.use('/api/templates',   apiLimiter, templatesRouter);
app.use('/api/ai',          apiLimiter, aiLimiter, aiRouter);
app.use('/api/workflows',   apiLimiter, workflowsRouter);
app.use('/api/org-profile', apiLimiter, orgProfileRouter);
app.use('/api/orgs',        apiLimiter, orgsRouter);
app.use('/api/orgs/me',     apiLimiter, membersRouter);
app.use('/api/users',       apiLimiter, usersRouter);
app.use('/api/roles',       apiLimiter, rolesRouter);
app.use('/api/departments', apiLimiter, departmentsRouter);
app.use('/api/groups',      apiLimiter, groupsRouter);
app.use('/api/survey-tags', apiLimiter, tagsRouter);
app.use('/api/group-insights', apiLimiter, surveyGroupsRouter);
app.use('/api/scim-tokens', apiLimiter, scimTokensRouter);
app.use('/api/sso-mappings', apiLimiter, ssoMappingsRouter);
app.use('/api/seats',       apiLimiter, seatsRouter);
app.use('/api/audit-logs',  apiLimiter, auditLogsRouter);
app.use('/api/alerts',      apiLimiter, alertsRouter);
app.use('/api/dashboard',   apiLimiter, dashboardRouter);
app.use('/api/dashboard-configs', apiLimiter, dashboardConfigsRouter);
app.use('/api/visual',      apiLimiter, visualRouter);
app.use('/api/notification-channels', apiLimiter, notificationChannelsRouter);
// SCIM 2.0 — separate namespace, bearer-token auth (NOT Clerk JWT), no apiLimiter.
app.use('/scim/v2',         scimRouter);
app.use('/api/copilot',     apiLimiter, copilotRouter);
app.use('/api/runs',        apiLimiter, runsRouter);
app.use('/api/experience',  apiLimiter, experienceRouter);
app.use('/api/notifications', apiLimiter, notificationsRouter);
app.use('/api/admin',        apiLimiter, adminRouter);
app.use('/api/crystal-novu', apiLimiter, crystalNovuRouter);
// Tier 3: Contacts, Segments, Sync, CX Cases, Ownership, Ontology
// NOTE: /api/contacts/segments and /api/contacts/sync must be mounted BEFORE
// /api/contacts so Express matches the more-specific paths first.
app.use('/api/contacts/segments', apiLimiter, contactSegmentsRouter);
app.use('/api/contacts/sync',     apiLimiter, contactSyncRouter);
app.use('/api/contacts',          apiLimiter, contactsRouter);
app.use('/api/cases',             apiLimiter, cxCasesRouter);
app.use('/api/ownership-routes',  apiLimiter, ownershipRouter);
app.use('/api/ontology',          apiLimiter, ontologyRouter);
// NOTE: more-specific /api/outreach/* paths must be mounted BEFORE /api/outreach (more specific first)
app.use('/api/outreach/suppression',    apiLimiter, suppressionRouter);
app.use('/api/outreach/analytics',      apiLimiter, outreachAnalyticsRouter);
app.use('/api/outreach/frequency-caps', apiLimiter, frequencyCapsRouter);
app.use('/api/outreach',                apiLimiter, outreachRouter);

// ── Observability ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const health: Record<string, string> = { status: 'ok', version: '2.0.0', backend: 'local' };
  try {
    await dbQuery('SELECT 1');
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
    const ip = req.ip ?? req.socket?.remoteAddress ?? '';
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err: err.message, stack: err.stack, route: req.path, requestId: req.id }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3001;
const server = app.listen(PORT, () => {
  const _devMode = !process.env.CLERK_SECRET_KEY;
  logger.info(`API  → http://localhost:${PORT}  (backend: local/postgres)`);
  logger.info(`Auth → ${_devMode ? 'DEV MODE (no CLERK_SECRET_KEY — all requests as dev-user/dev-org)' : 'Clerk JWT'}`);
  if (_devMode) logger.warn('Running in DEV MODE — set CLERK_SECRET_KEY to enable real authentication');
  logger.info(`CORS → ${corsOrigin === true ? 'all origins (dev)' : (corsOrigin || 'BLOCKED — set ALLOWED_ORIGIN')}`);
  logger.info(`Agents env → AGENTS_ENV=${process.env.AGENTS_ENV ?? 'dev (default)'}`);
  logger.info(`Metrics → http://localhost:${PORT}/api/metrics`);

  // Dev convenience: run the notification Event Engine in-process. In production
  // it runs as the separate `event-engine` service (npm run start:event-engine).
  if (process.env.ENABLE_EVENT_ENGINE === 'true') {
    import('./eventEngine/processor')
      .then((mod) => mod.start({ consumer: `inproc-${process.pid}` }))
      .then(() => logger.info('Event Engine → running in-process (ENABLE_EVENT_ENGINE=true)'))
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error({ err: error.message }, 'Event Engine failed to start');
      });
  }
});

// Graceful shutdown — PM2 sends SIGTERM on `pm2 reload`, SIGINT on Ctrl+C
const shutdown = (sig: string): void => {
  logger.info({ sig }, 'shutdown signal received');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => { logger.error('shutdown timeout — forcing exit'); process.exit(1); }, 30_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
