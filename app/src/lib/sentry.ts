import * as Sentry from '@sentry/react';

// Initialise Sentry. No-ops automatically when VITE_SENTRY_DSN is not set,
// so this is safe to call unconditionally in all environments.
export function initSentry() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    enabled: !!import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    // Capture 10% of transactions for performance monitoring
    tracesSampleRate: 0.1,
    // Record full sessions only when an error occurs
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
  });
}

export { Sentry };
