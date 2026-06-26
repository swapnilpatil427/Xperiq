// Must be required BEFORE any other module — Sentry patches require() to trace deps.
// No-ops automatically when SENTRY_DSN is not set.
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
