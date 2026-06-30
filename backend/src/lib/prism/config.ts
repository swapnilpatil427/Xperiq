/**
 * Prism — per-environment configuration + production-readiness validation.
 *
 * Single source of truth for how Prism (data ingestion / migration engine) is wired in
 * each deployment tier. Two pure functions, NO side effects:
 *
 *   getPrismConfig()                 — reads APP_ENV (falls back to NODE_ENV, default
 *                                      `development`) and returns a fully-resolved, typed
 *                                      config. Env-specific DEFAULTS are baked in here: dev
 *                                      runs cheap-and-local (filesystem upload, local secrets,
 *                                      worker+sync on, Redis optional); staging/production
 *                                      default to object storage (s3) + a managed secret store
 *                                      (gcp) and treat Redis + the public OAuth URLs as required.
 *
 *   validatePrismProductionConfig()  — when APP_ENV is staging/production, returns the list of
 *                                      FATAL misconfigurations that must block boot (mirrors the
 *                                      AGENTS_INTERNAL_KEY prod-validation precedent in
 *                                      lib/validateEnv.ts). Empty list ⇒ safe to start.
 *
 * The caller (src/index.ts) decides what to do with the result — these functions never log,
 * never throw, never read clocks/files. That keeps them trivially unit-testable.
 *
 * NOTE: s3 storage requires `@aws-sdk/client-s3` to be installed (owned by the storage agent);
 * this module only validates the *intent* (PRISM_UPLOAD_BACKEND), not the dependency.
 */

export type AppEnv = 'development' | 'staging' | 'production';
export type UploadBackend = 'local' | 's3';
export type SecretsBackend = 'local' | 'gcp';
export type RawRetention = 'keep' | 'purge_after_reconcile';

/** The default AGENTS_INTERNAL_KEY shipped in .env.example — must never reach staging/prod. */
export const DEV_AGENTS_INTERNAL_KEY = 'dev-internal-key-change-in-prod';

export interface PrismUploadConfig {
  backend: UploadBackend;
  /** Local backend: root dir for org-namespaced upload subdirs. */
  dir?: string;
  /** Max upload size (MB) for POST /api/prism/uploads (also the express.raw limit). */
  maxMb: number;
  /** s3 backend only. */
  s3?: {
    bucket?: string;
    region?: string;
    endpoint?: string;
    forcePathStyle: boolean;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
}

export interface PrismWorkerConfig {
  /** EXTRACT/LOAD engine worker loop. */
  enabled: boolean;
  /** Global EXTRACT worker concurrency cap. */
  maxConcurrentExtract: number;
  /** Continuous-sync (CDC) scheduler. */
  syncEnabled: boolean;
  /** Poll cadence (s) for the sync scheduler's trust-but-verify poll loop. */
  syncPollIntervalS: number;
}

export interface PrismConfig {
  appEnv: AppEnv;
  /** true for staging/production — the "must be hardened" tiers. */
  isProdLike: boolean;
  upload: PrismUploadConfig;
  secretsBackend: SecretsBackend;
  rawRetention: RawRetention;
  worker: PrismWorkerConfig;
  /** Redis is required in staging/prod (shared rate-limit/queue/run-registry state). */
  redisRequired: boolean;
  /** Publicly-reachable backend base — builds the OAuth redirect_uri. Required prod-like. */
  publicApiUrl?: string;
  /** Frontend base — OAuth callback redirects. Required prod-like. */
  frontendUrl?: string;
}

// ── env helpers (pure) ────────────────────────────────────────────────────────

function readAppEnv(): AppEnv {
  const raw = (process.env.APP_ENV ?? '').trim().toLowerCase();
  if (raw === 'development' || raw === 'staging' || raw === 'production') return raw;
  // Fall back to NODE_ENV: `production` ⇒ production, anything else ⇒ development.
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

function str(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

function bool(key: string, fallback: boolean): boolean {
  const v = str(key);
  if (v === undefined) return fallback;
  return v === 'true' || v === '1' || v.toLowerCase() === 'yes';
}

function int(key: string, fallback: number): number {
  const v = str(key);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve the full Prism config for the current environment, applying env-specific defaults.
 * Pure: reads process.env only, returns a value, no side effects.
 */
export function getPrismConfig(): PrismConfig {
  const appEnv = readAppEnv();
  const isProdLike = appEnv === 'staging' || appEnv === 'production';

  // Storage: dev defaults to local filesystem; staging/prod default to s3 (object storage),
  // because Fly.io instance disks are ephemeral & non-shared — local would silently lose files.
  const uploadBackend = (str('PRISM_UPLOAD_BACKEND') as UploadBackend | undefined)
    ?? (isProdLike ? 's3' : 'local');

  // Secrets: dev defaults to local (envelope-encrypted file/in-mem); staging/prod default to gcp.
  const secretsBackend = (() => {
    const raw = str('PRISM_SECRETS_BACKEND');
    if (raw === 'gcp' || raw === 'gcp_secret_manager') return 'gcp';
    if (raw === 'local') return 'local';
    return isProdLike ? 'gcp' : 'local';
  })() as SecretsBackend;

  const upload: PrismUploadConfig = {
    backend: uploadBackend,
    dir: str('PRISM_UPLOAD_DIR'),
    maxMb: int('PRISM_UPLOAD_MAX_MB', 60),
    s3: uploadBackend === 's3'
      ? {
          bucket: str('PRISM_UPLOAD_S3_BUCKET'),
          region: str('PRISM_UPLOAD_S3_REGION'),
          endpoint: str('PRISM_UPLOAD_S3_ENDPOINT'),
          forcePathStyle: bool('PRISM_UPLOAD_S3_FORCE_PATH_STYLE', false),
          accessKeyId: str('PRISM_UPLOAD_S3_ACCESS_KEY_ID'),
          secretAccessKey: str('PRISM_UPLOAD_S3_SECRET_ACCESS_KEY'),
        }
      : undefined,
  };

  const worker: PrismWorkerConfig = {
    // Worker + sync default ON everywhere (in-process for dev, dedicated process group for
    // prod). Operators can disable per tier with the explicit flags.
    enabled: bool('PRISM_WORKER_ENABLED', true),
    maxConcurrentExtract: int('PRISM_MAX_CONCURRENT_EXTRACT', isProdLike ? 8 : 4),
    syncEnabled: bool('PRISM_SYNC_ENABLED', true),
    syncPollIntervalS: int('PRISM_SYNC_POLL_INTERVAL_S', isProdLike ? 3600 : 300),
  };

  const rawRetention = (str('PRISM_RAW_RETENTION') as RawRetention | undefined)
    ?? 'purge_after_reconcile';

  return {
    appEnv,
    isProdLike,
    upload,
    secretsBackend,
    rawRetention,
    worker,
    redisRequired: isProdLike,
    publicApiUrl: str('PUBLIC_API_URL'),
    frontendUrl: str('FRONTEND_URL'),
  };
}

/**
 * Production-readiness gate. In staging/production, returns a list of FATAL misconfigs that
 * must refuse boot. In development, returns [] (never blocks dev). Pure — no side effects.
 *
 * Each item is a complete, operator-actionable sentence (matches the validateEnv.ts style).
 */
export function validatePrismProductionConfig(cfg: PrismConfig = getPrismConfig()): string[] {
  if (!cfg.isProdLike) return [];

  const fatal: string[] = [];
  const tier = cfg.appEnv; // 'staging' | 'production'

  // Redis is shared state (rate-limit token buckets, job queues, run-registry) — without it
  // multi-instance Prism is incorrect, not merely slower.
  if (!str('REDIS_URL')) {
    fatal.push(`REDIS_URL is required in ${tier} — Prism queues/rate-limits/run-registry need shared Redis`);
  }

  // Object storage — Fly.io instance disks are ephemeral & non-shared; local uploads vanish
  // on redeploy and are invisible to the worker process group.
  if (cfg.upload.backend === 'local') {
    fatal.push(`PRISM_UPLOAD_BACKEND must be \`s3\` in ${tier} — local filesystem is ephemeral/non-shared on Fly.io (uploads would be lost). Install @aws-sdk/client-s3.`);
  } else if (cfg.upload.backend === 's3' && (!cfg.upload.s3?.bucket || !cfg.upload.s3?.region)) {
    fatal.push(`PRISM_UPLOAD_S3_BUCKET and PRISM_UPLOAD_S3_REGION are required when PRISM_UPLOAD_BACKEND=s3 in ${tier}`);
  }

  // Managed secret store — credentials must never live in a local file in prod.
  if (cfg.secretsBackend === 'local') {
    fatal.push(`PRISM_SECRETS_BACKEND must be \`gcp\` in ${tier} — local credential store is dev-only (use GCP Secret Manager + KMS)`);
  }

  // Service-to-service shared secret — reuse the canonical default check (see validateEnv.ts).
  if (!str('AGENTS_INTERNAL_KEY') || process.env.AGENTS_INTERNAL_KEY === DEV_AGENTS_INTERNAL_KEY) {
    fatal.push(`AGENTS_INTERNAL_KEY must be set to a non-default value in ${tier} (the dev default is rejected)`);
  }

  // OAuth would break silently without externally-resolvable URLs — the redirect_uri (built
  // from PUBLIC_API_URL) and the post-callback FE redirect (FRONTEND_URL) must be real origins.
  if (!cfg.publicApiUrl) {
    fatal.push(`PUBLIC_API_URL must be set in ${tier} — it builds the Prism OAuth redirect_uri; OAuth connect flows break without it`);
  }
  if (!cfg.frontendUrl) {
    fatal.push(`FRONTEND_URL must be set in ${tier} — it builds the post-OAuth callback redirect back to the app`);
  }

  return fatal;
}
