/**
 * Prism — one-click OAuth2 connect: `/api/prism/oauth/:platform/*`.
 *
 *   POST /api/prism/oauth/:platform/start    (authed)  → { authorizeUrl }
 *   GET  /api/prism/oauth/:platform/callback (PUBLIC)  → 302 to the FE connect page
 *
 * The closed loop (root CLAUDE.md "three layers"): the FE calls `start` (authed), we mint a
 * random `state`, stash the org-scoped intent keyed by that state (Redis, 10-min TTL; a
 * `prism_oauth_state` row when Redis is absent), and hand back the provider authorizeUrl.
 * The provider redirects the browser to `callback` (PUBLIC — it carries no Clerk token), where
 * `state` is the ONLY trust anchor: it resolves back to the org/mode/window we stored, so the
 * org is NEVER taken from the request. We exchange `code`→tokens host-locked to the provider's
 * token host (SSRF posture), store the token JSON in Secret Manager, create the connection via
 * the engine, then 302 to the FE.
 *
 * Security:
 *  - org_id resolved ONLY via the server-stored state (callback is unauthenticated).
 *  - `state` = 32 random bytes (crypto), single-use (consumed on callback).
 *  - token exchange uses `helpers.guardedFetch` host-locked to the provider token host.
 *  - tokens are class `secret` → Secret Manager only, never Postgres/logs/client.
 *
 * `requireAuth` is applied INSIDE this router on `start` (sibling style). `callback` is public.
 */
import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { query } from '../lib/db';
import { getRedisClient } from '../lib/redis';
import logger from '../lib/logger';
import { serverError, clientError } from '../lib/httpError';
import { helpers } from '../lib/prism/helpers';
import { secretManager } from '../lib/prism/secretManager';
import { getOAuthConfig, getClientCredentials, tokenHost, type PrismOAuthConfig } from '../lib/prism/oauthConfig';
import * as engine from '../lib/prism/engine';
import type { CreateConnectionRequest, PrismMode } from '../types/prism';

const router = express.Router();

const STATE_TTL_SECONDS = 600; // 10 min
const STATE_NS = 'prism:oauth:state';

/** The org-scoped intent we persist against a `state` between start and callback. */
interface OAuthStateRecord {
  org_id: string;
  user_id: string;
  platform: string;
  mode: PrismMode;
  history_window: number;
  returnUrl: string | null;
}

// ── State store (Redis primary; Postgres fallback) ──────────────────────────

async function putState(state: string, rec: OAuthStateRecord): Promise<void> {
  const redis = getRedisClient();
  const payload = JSON.stringify(rec);
  if (redis) {
    try {
      await redis.set(`${STATE_NS}:${state}`, payload, 'EX', STATE_TTL_SECONDS);
      return;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'prism:oauth:redis_state_put_failed → postgres fallback');
    }
  }
  // Fallback: a short-lived row. TODO(verify): ensure a `prism_oauth_state` table exists
  // (state TEXT PK, org_id, payload JSONB, expires_at TIMESTAMPTZ) in a migration.
  await query(
    `INSERT INTO prism_oauth_state (state, org_id, payload, expires_at)
     VALUES ($1, $2, $3::jsonb, now() + ($4 || ' seconds')::interval)
     ON CONFLICT (state) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
    [state, rec.org_id, payload, String(STATE_TTL_SECONDS)],
  );
}

/** Resolve + CONSUME (single-use) the state record. Returns null if missing/expired. */
async function takeState(state: string): Promise<OAuthStateRecord | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`${STATE_NS}:${state}`);
      if (raw) {
        await redis.del(`${STATE_NS}:${state}`).catch(() => {});
        return JSON.parse(raw) as OAuthStateRecord;
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'prism:oauth:redis_state_get_failed → postgres fallback');
    }
  }
  const { rows } = await query<{ payload: OAuthStateRecord }>(
    `DELETE FROM prism_oauth_state
      WHERE state = $1 AND expires_at > now()
      RETURNING payload`,
    [state],
  ).catch(() => ({ rows: [] as { payload: OAuthStateRecord }[] }));
  return rows[0]?.payload ?? null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function publicApiUrl(): string {
  return (process.env.PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}
function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '');
}
function redirectUri(platform: string): string {
  return `${publicApiUrl()}/api/prism/oauth/${encodeURIComponent(platform)}/callback`;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/prism/oauth/:platform/start — mint state, return the authorizeUrl.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:platform/start', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  const platform = req.params.platform;
  try {
    const cfg = getOAuthConfig(platform);
    if (!cfg) { clientError(res, 400, `OAuth is not supported for platform: ${platform}`); return; }

    const creds = getClientCredentials(cfg);
    if (!creds) {
      clientError(res, 400, `OAuth app credentials are not configured for ${platform} (set ${cfg.clientIdEnv}/${cfg.clientSecretEnv}).`);
      return;
    }

    const body = (req.body ?? {}) as { mode?: string; history_window?: number; returnUrl?: string };
    const mode = (body.mode as PrismMode | undefined) ?? 'ingest';
    const historyWindow = Number.isFinite(body.history_window) ? Number(body.history_window) : 3;

    const state = crypto.randomBytes(32).toString('base64url');
    await putState(state, {
      org_id: orgId,
      user_id: req.userId ?? 'unknown',
      platform,                              // preserve the request alias (e.g. google_forms)
      mode,
      history_window: historyWindow,
      returnUrl: body.returnUrl ?? null,
    });

    const authorizeUrl = new URL(cfg.authorizeUrl);
    authorizeUrl.searchParams.set('client_id', creds.clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri(platform));
    authorizeUrl.searchParams.set('response_type', 'code');
    if (cfg.scopes.length) authorizeUrl.searchParams.set('scope', cfg.scopes.join(' '));
    authorizeUrl.searchParams.set('state', state);
    for (const [k, v] of Object.entries(cfg.extraAuthorizeParams ?? {})) {
      authorizeUrl.searchParams.set(k, v);
    }

    res.json({ authorizeUrl: authorizeUrl.toString() });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, platform, route: 'prism:oauth_start' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/prism/oauth/:platform/callback — PUBLIC. `state` is the trust anchor.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:platform/callback', async (req: Request, res: Response): Promise<void> => {
  const platform = req.params.platform;
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const provErr = req.query.error as string | undefined;

  // FE error page for callback failures (no Clerk context here — redirect, don't 500).
  const failRedirect = (reason: string): void => {
    const url = `${frontendUrl()}/app/prism/connect/${encodeURIComponent(platform)}?error=${encodeURIComponent(reason)}`;
    res.redirect(302, url);
  };

  try {
    if (provErr) { logger.warn({ platform, provErr }, 'prism:oauth:provider_error'); failRedirect(provErr); return; }
    if (!code || !state) { failRedirect('missing_code_or_state'); return; }

    const cfg = getOAuthConfig(platform);
    if (!cfg) { failRedirect('unsupported_platform'); return; }

    // Resolve + consume state → org/mode/window. The ONLY source of org_id.
    const rec = await takeState(state);
    if (!rec) { failRedirect('invalid_or_expired_state'); return; }
    const orgId = rec.org_id;

    const creds = getClientCredentials(cfg);
    if (!creds) { failRedirect('oauth_not_configured'); return; }

    // ── Exchange code → tokens (host-locked to the provider token host) ──────
    let tokenJson: Record<string, unknown>;
    try {
      tokenJson = await exchangeCode(cfg, code, redirectUri(platform), creds);
    } catch (xErr) {
      logger.error({ platform, orgId, err: (xErr as Error).message }, 'prism:oauth:token_exchange_failed');
      failRedirect('token_exchange_failed');
      return;
    }

    // ── Create the connection (engine façade) ────────────────────────────────
    // The engine signature is authenticateConnection(orgId, userId, CreateConnectionRequest)
    // → { connectionId }. We pass a placeholder credential ref in `extra`, then store the
    // real token JSON in Secret Manager keyed by the new connectionId and update the row.
    let connectionId: string;
    try {
      const connReq: CreateConnectionRequest = {
        platform,
        authKind: 'oauth2',
        mode: rec.mode,
        history_window: rec.history_window,
        credentials: { extra: { oauth: true } },
      };
      const result = await engine.authenticateConnection(orgId, rec.user_id, connReq);
      connectionId = result.connectionId;
    } catch (connErr) {
      logger.error({ platform, orgId, err: (connErr as Error).message }, 'prism:oauth:connection_create_failed');
      failRedirect('connection_create_failed');
      return;
    }

    // Store the token JSON as the connection secret (class `secret` → SM only) and bind
    // credential_ref + status on the row.
    try {
      const credentialRef = await secretManager.putSecret({
        orgId,
        connectionId,
        secret: JSON.stringify(tokenJson),
      });
      await query(
        `UPDATE prism_connections
            SET credential_ref = $3, status = 'active', updated_at = now()
          WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
        [connectionId, orgId, credentialRef],
      );
    } catch (secErr) {
      logger.error({ platform, orgId, connectionId, err: (secErr as Error).message }, 'prism:oauth:secret_store_failed');
      await query(
        `UPDATE prism_connections SET status = 'error', updated_at = now()
          WHERE id = $1 AND org_id = $2`,
        [connectionId, orgId],
      ).catch(() => {});
      failRedirect('credential_store_failed');
      return;
    }

    logger.info({ platform, orgId, connectionId }, 'prism:oauth:connected');
    const target = `${frontendUrl()}/app/prism/connect/${encodeURIComponent(platform)}?connected=${encodeURIComponent(connectionId)}`;
    res.redirect(302, target);
  } catch (err: unknown) {
    // Public endpoint — never leak details; log + redirect to the FE error page.
    logger.error({ platform, err: (err as Error).message }, 'prism:oauth:callback_error');
    failRedirect('callback_error');
  }
});

/**
 * Exchange an OAuth authorization code for tokens at the provider token endpoint.
 * Host-locked via `helpers.guardedFetch` to the provider's token host only (SSRF posture).
 *
 * TODO(verify): provider-specific token-exchange specifics — request encoding
 * (form vs JSON), client auth (body params vs HTTP Basic), and response field names
 * (access_token / refresh_token / expires_in). Below uses the standard RFC-6749
 * form-encoded body with client_id/client_secret in the body, which most providers accept.
 */
async function exchangeCode(
  cfg: PrismOAuthConfig,
  code: string,
  redirect: string,
  creds: { clientId: string; clientSecret: string },
): Promise<Record<string, unknown>> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  const res = await helpers.guardedFetch(
    cfg.tokenUrl,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: form.toString(),
    },
    [tokenHost(cfg)], // host-locked allowlist — provider token host ONLY
  );

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`token endpoint ${res.status}: ${text.slice(0, 300)}`);
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Some providers (legacy) return form-encoded token bodies.
    parsed = Object.fromEntries(new URLSearchParams(text).entries());
  }
  // TODO(verify): assert the expected token field per provider (access_token vs token).
  if (!parsed.access_token && !parsed.token) {
    throw new Error('token endpoint returned no access_token');
  }
  return parsed;
}

export default router;
