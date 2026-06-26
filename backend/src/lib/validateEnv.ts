/**
 * Startup configuration validation — fail fast before the server accepts traffic.
 *
 * Three layers:
 *   1. Presence  — required env vars are set (stricter in production).
 *   2. Format    — configured keys look right (e.g. Stripe sk_/whsec_) and are internally
 *                  consistent (e.g. a Stripe secret without a webhook secret).
 *   3. Liveness  — the critical infra actually answers: Postgres `SELECT 1`, Redis `PING`.
 *
 * Hard problems throw (caller exits non-zero). Soft problems log a warning and continue.
 * This is the single place that answers "are all the keys working before we start?".
 */
import { query } from './db';
import { getRedisClient } from './redis';
import logger from './logger';

const isProd = (): boolean => process.env.NODE_ENV === 'production';

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref()),
  ]);
}

export interface ValidateOptions {
  /** Run live connectivity checks (Postgres/Redis). Default false (presence/format only). */
  connectivity?: boolean;
}

export async function validateStartupConfig(opts: ValidateOptions = {}): Promise<void> {
  const errors: string[] = [];
  const warns:  string[] = [];

  const requirePresent = (key: string, prodOnly = false): void => {
    if (prodOnly && !isProd()) return;
    if (!process.env[key]) errors.push(`${key} is required${prodOnly ? ' in production' : ''}`);
  };

  // ── 1. Presence ─────────────────────────────────────────────────────────────
  requirePresent('DATABASE_URL');
  requirePresent('OPENROUTER_API_KEY');
  requirePresent('AGENTS_INTERNAL_KEY');
  requirePresent('REDIS_URL', true);        // required in prod; optional in dev (in-memory fallback)
  requirePresent('CLERK_SECRET_KEY', true); // required in prod; absent in dev ⇒ dev mode
  requirePresent('ALLOWED_ORIGIN', true);   // required in prod for CORS

  // ── 2. Hard prod constraints + format/consistency ───────────────────────────
  if (isProd() && process.env.AGENTS_INTERNAL_KEY === 'dev-internal-key-change-in-prod') {
    errors.push('AGENTS_INTERNAL_KEY must be changed from the default in production');
  }
  if (!isProd() && !process.env.CLERK_SECRET_KEY) {
    warns.push('CLERK_SECRET_KEY not set — running in DEV MODE (all requests as dev-user/dev-org)');
  }

  // Stripe (optional integration) — validate only when configured.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey) {
    if (!/^sk_(test|live)_/.test(stripeKey)) {
      errors.push('STRIPE_SECRET_KEY must start with sk_test_ or sk_live_');
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      warns.push('STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing — purchase fulfilment (webhook) is disabled');
    }
    if (isProd() && stripeKey.startsWith('sk_test_')) {
      warns.push('STRIPE_SECRET_KEY is a TEST key in production');
    }
  }
  if (process.env.STRIPE_WEBHOOK_SECRET && !/^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET)) {
    errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_');
  }

  // Novu (optional) — secret needed for inbound webhook HMAC verification.
  if (process.env.NOVU_API_KEY && !process.env.NOVU_SECRET_KEY) {
    warns.push('NOVU_API_KEY is set but NOVU_SECRET_KEY is missing — inbound webhook verification is disabled');
  }

  // Presence/format failures: stop here (no point probing infra we can't reach).
  emit(warns, []);
  if (errors.length) fail(errors);

  // ── 3. Liveness (connectivity) ───────────────────────────────────────────────
  if (opts.connectivity) {
    const liveErrors: string[] = [];
    const liveWarns:  string[] = [];

    // Postgres — a hard dependency.
    try {
      await withTimeout(query('SELECT 1'), 5000, 'Postgres connectivity');
    } catch (e) {
      liveErrors.push(`DATABASE_URL is set but Postgres is unreachable (${(e as Error).message}). Is it running? \`docker-compose up -d\``);
    }

    // Redis — hard in prod, soft in dev (the app fails open without it).
    if (process.env.REDIS_URL) {
      try {
        const r = getRedisClient();
        if (!r) throw new Error('client unavailable');
        await withTimeout(r.ping().then(() => undefined), 5000, 'Redis connectivity');
      } catch (e) {
        (isProd() ? liveErrors : liveWarns).push(`REDIS_URL is set but Redis is unreachable (${(e as Error).message})`);
      }
    }

    emit(liveWarns, []);
    if (liveErrors.length) fail(liveErrors);
  }

  logger.info({ connectivity: !!opts.connectivity }, 'config: startup validation passed');
}

function emit(warns: string[], _errors: string[]): void {
  for (const w of warns) logger.warn({}, `config: ${w}`);
}

function fail(errors: string[]): never {
  for (const e of errors) logger.error({}, `config: ${e}`);
  throw new Error(`Startup config validation failed:\n  - ${errors.join('\n  - ')}`);
}
