-- ============================================================================
-- Prism — Core ingestion engine tables (W1)
-- ----------------------------------------------------------------------------
-- Canonical DDL: docs/otherplatforms/migration/architecture-ingestion.md §3–§5, §11
-- Prism brings any organization's experience data into Xperiq. This migration
-- creates the system-of-record tables for the ingestion pipeline:
--   prism_connections → prism_jobs → prism_raw_records → prism_mappings
--   prism_dryrun_report / prism_recon_report / prism_record_errors
--
-- Conventions:
--   * org_id TEXT NOT NULL on every row (multi-tenant isolation; never trusted
--     from client input — set server-side from the Clerk org claim).
--   * created_at/updated_at timestamptz default now(); deleted_at soft-delete on
--     mutable entities (platform rule: never hard-delete).
--   * gen_random_uuid() for PKs (pgcrypto).
--   * Idempotent: IF NOT EXISTS everywhere so re-running is a no-op.
--   * No Firestore — Postgres only. Redis is used for queues/locks/rate-buckets.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto on PG <13; ships in-core on 13+. Enabling
-- the extension is harmless where the function is already built in.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- prism_connections — one row per authenticated source per org.
-- Holds only a credential_ref (opaque Secret Manager pointer) — NEVER secrets.
-- mode: augment | ingest | migrate (the operating-mode spectrum).
-- history_window: 1–12 months — how much EXISTING history is also checkpointed
--   (new data is always checkpointed live, in every mode — that is not a knob).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT NOT NULL,
  platform            TEXT NOT NULL,              -- 'qualtrics' | 'typeform' | 'gbp' | ...
  label               TEXT,                       -- human-readable name
  auth_kind           TEXT NOT NULL,              -- 'oauth2' | 'api_key' | 'service_account' | 'file_upload'
  status              TEXT NOT NULL DEFAULT 'pending',
                      -- 'pending' | 'connected' | 'needs_reauth' | 'disabled' | 'error'
  credential_ref      TEXT,                       -- opaque Secret Manager ref (never the secret itself)
  mode                TEXT NOT NULL DEFAULT 'ingest',
  history_window      INTEGER NOT NULL DEFAULT 3, -- months of existing history to also checkpoint
  config              JSONB NOT NULL DEFAULT '{}'::jsonb,
  stats               JSONB NOT NULL DEFAULT '{}'::jsonb,
  license_attestation JSONB,                      -- who/when/license-ref for requiresLicenseFlag sources (governance §5.7)
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,                -- soft-delete
  CONSTRAINT prism_connections_mode_chk
    CHECK (mode IN ('augment', 'ingest', 'migrate')),
  CONSTRAINT prism_connections_history_window_chk
    CHECK (history_window BETWEEN 1 AND 12)
);

CREATE INDEX IF NOT EXISTS prism_connections_org_idx
  ON prism_connections (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS prism_connections_org_platform_idx
  ON prism_connections (org_id, platform) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- prism_jobs — the pipeline state machine (§3).
--   queued → running ⇄ awaiting_input → ... → complete | partial | failed
-- cursor makes EXTRACT resumable; counts/error are content-free progress.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  connection_id UUID NOT NULL REFERENCES prism_connections (id),
  kind          TEXT NOT NULL,                -- 'migration' | 'sync' | 'backfill'
  stage         TEXT NOT NULL DEFAULT 'queued', -- current pipeline stage (CONNECT..PUBLISH)
  status        TEXT NOT NULL DEFAULT 'queued',
                -- queued | running | awaiting_input | paused | complete | partial | failed
  cursor        JSONB,                        -- resumable extraction cursor / page token
  counts        JSONB NOT NULL DEFAULT '{}'::jsonb,
                -- {discovered,extracted,transformed,loaded,skipped,failed,poison}
  error         JSONB,                        -- last error {stage, message, retryable}
  triggered_by  TEXT NOT NULL DEFAULT 'user', -- 'user' | 'schedule' | 'webhook'
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ                   -- soft-delete
);

CREATE INDEX IF NOT EXISTS prism_jobs_org_idx
  ON prism_jobs (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS prism_jobs_connection_idx
  ON prism_jobs (connection_id);
-- worker scheduling: "find runnable jobs for an org" without scanning all rows
CREATE INDEX IF NOT EXISTS prism_jobs_org_status_idx
  ON prism_jobs (org_id, status) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- prism_raw_records — lossless append-only raw staging (ADR-022, §3, §4).
-- EXTRACT's first act is to append the untouched source record + provenance,
-- BEFORE any transform. One append-only log; bulk + continuous-sync are the
-- same consumer at different offsets.
--
-- UNIQUE(org_id, connection_id, record_type, source_record_id) makes EXTRACT
-- idempotent across both ingress paths — a webhook and a poll that observe the
-- same source record collapse to one row (hash-aware writer makes a stable
-- re-observation a no-op).
--
-- poison = quarantined (excluded from TRANSFORM); the partial DLQ index gives a
-- cheap dead-letter scan. source_observed_at drives §4 source-time monotonicity.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_raw_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  job_id            UUID NOT NULL REFERENCES prism_jobs (id),
  connection_id     UUID NOT NULL REFERENCES prism_connections (id),
  source_platform   TEXT NOT NULL,            -- 'qualtrics' | 'medallia' | 'yelp' | ...
  record_type       TEXT NOT NULL,            -- 'survey_def' | 'response' | 'contact' | 'review' | ...
  source_record_id  TEXT NOT NULL,            -- the source's own id (idempotency natural key)
  payload           JSONB NOT NULL,           -- raw record, verbatim
  payload_hash      TEXT NOT NULL,            -- sha256(payload) for change detection
  ingress           TEXT NOT NULL DEFAULT 'poll', -- 'poll' | 'webhook' | 'backfill' (provenance only)
  poison            BOOLEAN NOT NULL DEFAULT false, -- quarantined; excluded from TRANSFORM (§4)
  source_observed_at TIMESTAMPTZ,             -- source timestamp (continuity + §4 monotonicity)
  extracted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prism_raw_records_natkey_uq
    UNIQUE (org_id, connection_id, record_type, source_record_id)
);

-- consumer reads by job; org-prefixed for tenant isolation
CREATE INDEX IF NOT EXISTS prism_raw_records_org_job_idx
  ON prism_raw_records (org_id, job_id);
-- DLQ scans: only the poison rows (small, partial index)
CREATE INDEX IF NOT EXISTS prism_raw_records_poison_idx
  ON prism_raw_records (org_id, connection_id) WHERE poison;

-- ----------------------------------------------------------------------------
-- prism_mappings — confirmed source→Xperiq field/value/taxonomy mappings (§6).
-- Append-only and versioned: a remap creates mapping_version N+1; prior versions
-- are never overwritten (replay reproduces any row from raw + mapping_version).
-- Keyed on stable source ids via the schema_shape_hash so structurally similar
-- surveys auto-apply a confirmed mapping (org mapping-memory, layer 2).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_mappings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  connection_id     UUID NOT NULL REFERENCES prism_connections (id),
  schema_shape_hash TEXT NOT NULL,            -- fast pre-filter for structurally-similar schemas
  mapping_version   INTEGER NOT NULL DEFAULT 1,
  mappings          JSONB NOT NULL,           -- {source_field → target, type, value_rules, metric, class, ...}
  field_class       JSONB,                    -- per-field data classification (governance §1)
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- append-only versioning: never overwrite a confirmed version (governance §5.5)
  CONSTRAINT prism_mappings_version_uq
    UNIQUE (org_id, connection_id, mapping_version)
);

-- mapping-memory lookup by schema shape
CREATE INDEX IF NOT EXISTS prism_mappings_shape_idx
  ON prism_mappings (org_id, connection_id, schema_shape_hash);

-- ----------------------------------------------------------------------------
-- prism_dryrun_report — computed diff + two-tier metric parity for approval (§5).
-- prism_recon_report — post-load reconciliation (counts + checksums vs source).
-- Both are content-free aggregates retained for audit / reproducibility.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_dryrun_report (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  job_id      UUID NOT NULL REFERENCES prism_jobs (id),
  report      JSONB NOT NULL,                 -- {summary, metric_parity, unmapped_fields, conflicts, ...}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prism_dryrun_report_org_job_idx
  ON prism_dryrun_report (org_id, job_id);

CREATE TABLE IF NOT EXISTS prism_recon_report (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  job_id      UUID NOT NULL REFERENCES prism_jobs (id),
  report      JSONB NOT NULL,                 -- {counts, checksums, metric_parity, signed, ...}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prism_recon_report_org_job_idx
  ON prism_recon_report (org_id, job_id);

-- ----------------------------------------------------------------------------
-- prism_record_errors — per-record error trail (poison / transient failures, §4).
-- Distinct from job.error (last error only): this keeps the full dead-letter set
-- so failures are isolated, counted, alerted and replayable.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_record_errors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  job_id            UUID NOT NULL REFERENCES prism_jobs (id),
  source_record_id  TEXT,                     -- the source's own id (may be null pre-extract)
  stage             TEXT NOT NULL,            -- pipeline stage that failed
  message           TEXT NOT NULL,
  retryable         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prism_record_errors_org_job_idx
  ON prism_record_errors (org_id, job_id);
