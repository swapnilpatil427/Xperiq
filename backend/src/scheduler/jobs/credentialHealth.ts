import logger from '../../lib/logger';
import { resolveClerkSecretKey } from '../../lib/clerkKeys';
import { isStripeConfigured } from '../../lib/payments';
import { credentialValid, credentialLastCheck, credentialDaysToExpiry } from '../../lib/metrics';

/**
 * Credential health — periodically probe each CONFIGURED integration key and report whether it
 * still authenticates. Startup validation checks keys once at boot; this catches keys that are
 * revoked / rotated / expired **while running**. Both expiry and revocation surface as `invalid`.
 *
 * Reports per-integration via `credential_valid{integration}` (+ last-check timestamp, and
 * `credential_days_to_expiry` when a provider exposes an expiry). Alerts: `CredentialInvalid`,
 * `CredentialExpiringSoon`.
 *
 * Only configured integrations are probed (no key → skipped). Probes are injectable for tests.
 */
const PROBE_TIMEOUT_MS = 8000;
const EXPIRY_WARN_DAYS = (() => {
  const n = Number(process.env.CREDENTIAL_EXPIRY_WARN_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 14;
})();

export type ProbeStatus = 'ok' | 'invalid' | 'error';
export interface ProbeResult { status: ProbeStatus; detail?: string; expiresAt?: Date }
export interface CredentialProbe {
  integration: string;
  configured: () => boolean;
  check: () => Promise<ProbeResult>;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref()),
  ]);
}

async function probeHttp(url: string, headers: Record<string, string>): Promise<{ status: number }> {
  const res = await withTimeout(fetch(url, { headers }), PROBE_TIMEOUT_MS, url);
  return { status: res.status };
}

/** Real probes — cheap authenticated calls. A 401/403 means the key is invalid/revoked/expired. */
export const DEFAULT_PROBES: CredentialProbe[] = [
  {
    integration: 'openrouter',
    configured: () => !!process.env.OPENROUTER_API_KEY,
    check: async () => {
      const { status } = await probeHttp('https://openrouter.ai/api/v1/key', {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      });
      if (status === 401 || status === 403) return { status: 'invalid', detail: `HTTP ${status}` };
      if (status !== 200) return { status: 'error', detail: `HTTP ${status}` };
      return { status: 'ok' };
    },
  },
  {
    integration: 'stripe',
    // Key alone is not enough — the `stripe` SDK must be installed (see lib/payments.ts).
    // Probing when only STRIPE_SECRET_KEY is set (common in local .env) spams errors for
    // an integration that is not actually active.
    configured: () => isStripeConfigured(),
    check: async () => {
      const { status } = await probeHttp('https://api.stripe.com/v1/balance', {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      });
      if (status === 401) return { status: 'invalid', detail: 'unauthorized (revoked/expired key)' };
      if (status !== 200) return { status: 'error', detail: `HTTP ${status}` };
      return { status: 'ok' };
    },
  },
  {
    integration: 'clerk',
    configured: () => !!resolveClerkSecretKey(),
    check: async () => {
      const clerkKey = resolveClerkSecretKey()!;
      const { status } = await probeHttp('https://api.clerk.com/v1/jwks', {
        Authorization: `Bearer ${clerkKey}`,
      });
      if (status === 401) return { status: 'invalid', detail: 'unauthorized' };
      if (status !== 200) return { status: 'error', detail: `HTTP ${status}` };
      return { status: 'ok' };
    },
  },
];

export async function credentialHealth(probes: CredentialProbe[] = DEFAULT_PROBES): Promise<{ affected: number; note: string }> {
  const configured = probes.filter((p) => p.configured());
  if (configured.length === 0) {
    return { affected: 0, note: 'no configured integrations to probe' };
  }

  let invalid = 0;
  for (const p of configured) {
    try {
      const r = await p.check();
      credentialLastCheck.set({ integration: p.integration }, Date.now() / 1000);
      credentialValid.set({ integration: p.integration }, r.status === 'ok' ? 1 : 0);

      if (r.expiresAt) {
        const days = (r.expiresAt.getTime() - Date.now()) / 86_400_000;
        credentialDaysToExpiry.set({ integration: p.integration }, days);
        if (days < EXPIRY_WARN_DAYS) {
          logger.warn({ integration: p.integration, days: Math.round(days) }, 'credential expiring soon');
        }
      }

      if (r.status !== 'ok') {
        invalid++;
        logger.error({ integration: p.integration, status: r.status, detail: r.detail }, 'credential check failed');
      }
    } catch (e) {
      // Network error etc. — mark unknown as invalid so it's visible; the probe will recover next run.
      credentialValid.set({ integration: p.integration }, 0);
      credentialLastCheck.set({ integration: p.integration }, Date.now() / 1000);
      invalid++;
      logger.error({ integration: p.integration, err: (e as Error).message }, 'credential probe error');
    }
  }

  return { affected: invalid, note: `probed ${configured.length} integration(s), ${invalid} invalid` };
}
