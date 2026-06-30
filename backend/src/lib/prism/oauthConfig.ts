/**
 * Prism — per-platform OAuth2 app config (one-click connect).
 *
 * Each entry pins the provider's authorize + token endpoints, the scopes Prism requests,
 * and the env names that hold the per-DEPLOY client id/secret (the OAuth APP credentials —
 * NOT per-org tokens, which live in Secret Manager keyed by `credential_ref`). The env
 * names match docs/ENV_VARS.md ("Prism" section).
 *
 * Google Forms and Google Business Profile share one Google OAuth app (GOOGLE_OAUTH_*),
 * so both `google_forms` and `google_business` resolve to the same `google` entry; the
 * platform alias is preserved on the connection so the connector knows which surface to pull.
 *
 * The token host is exported per-platform so the callback can host-LOCK `guardedFetch`
 * to exactly the provider's token host (SSRF posture — no wildcard egress).
 *
 * TODO(verify): authorize/token URLs, scope strings, and PKCE/extra-param requirements
 * are best-effort from public provider docs and MUST be verified against each provider's
 * live OAuth app settings before production use.
 */

export interface PrismOAuthConfig {
  /** Canonical platform key recorded on the connection. */
  platform: string;
  /** Provider authorization endpoint (user is redirected here). */
  authorizeUrl: string;
  /** Provider token endpoint (server-side code→token exchange). */
  tokenUrl: string;
  /** OAuth scopes requested (space-joined into the authorize URL). */
  scopes: string[];
  /** Env var holding the OAuth app client id (per-deploy). */
  clientIdEnv: string;
  /** Env var holding the OAuth app client secret (per-deploy). */
  clientSecretEnv: string;
  /** Extra static params merged into the authorize URL (e.g. Google offline access). */
  extraAuthorizeParams?: Record<string, string>;
}

// ── Provider table ──────────────────────────────────────────────────────────
// TODO(verify): every URL / scope below against the provider's live OAuth app.
const CONFIGS: Record<string, PrismOAuthConfig> = {
  typeform: {
    platform: 'typeform',
    authorizeUrl: 'https://api.typeform.com/oauth/authorize',
    tokenUrl: 'https://api.typeform.com/oauth/token',
    scopes: ['forms:read', 'responses:read', 'offline'],
    clientIdEnv: 'TYPEFORM_OAUTH_CLIENT_ID',
    clientSecretEnv: 'TYPEFORM_OAUTH_CLIENT_SECRET',
  },
  surveymonkey: {
    platform: 'surveymonkey',
    authorizeUrl: 'https://api.surveymonkey.com/oauth/authorize',
    tokenUrl: 'https://api.surveymonkey.com/oauth/token',
    // SurveyMonkey uses space-delimited scope strings like 'surveys_read responses_read'.
    scopes: ['surveys_read', 'responses_read'],
    clientIdEnv: 'SURVEYMONKEY_OAUTH_CLIENT_ID',
    clientSecretEnv: 'SURVEYMONKEY_OAUTH_CLIENT_SECRET',
  },
  // Google Forms + Google Business Profile share ONE Google OAuth app.
  google: {
    platform: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/forms.responses.readonly',
      'https://www.googleapis.com/auth/business.manage',
    ],
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    // Refresh-token issuance + re-consent (so we always get a refresh_token).
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
  },
  trustpilot: {
    platform: 'trustpilot',
    authorizeUrl: 'https://authenticate.trustpilot.com',
    tokenUrl: 'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken',
    scopes: [],
    clientIdEnv: 'TRUSTPILOT_OAUTH_CLIENT_ID',
    clientSecretEnv: 'TRUSTPILOT_OAUTH_CLIENT_SECRET',
  },
};

/** Platform aliases that resolve to a shared OAuth app entry. */
const ALIASES: Record<string, string> = {
  google_forms: 'google',
  google_business: 'google',
  gbp: 'google',
  forms: 'google',
};

/** Resolve a request platform (incl. aliases) to its OAuth config, or null if unsupported. */
export function getOAuthConfig(platform: string): PrismOAuthConfig | null {
  const key = ALIASES[platform] ?? platform;
  return CONFIGS[key] ?? null;
}

/** The exact provider token host — used to host-lock guardedFetch on the exchange. */
export function tokenHost(cfg: PrismOAuthConfig): string {
  return new URL(cfg.tokenUrl).hostname;
}

/** Read the per-deploy client id/secret for a platform; null if not configured. */
export function getClientCredentials(cfg: PrismOAuthConfig): { clientId: string; clientSecret: string } | null {
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
