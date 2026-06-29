-- ── Migration: base runtime tables ─────────────────────────────────────────────
-- Brings Supabase migrations in line with tables that were previously created at
-- runtime (CrystalOS / backend) so a freshly-reset DB has them. Idempotent.
--
-- Conventions: org_id is TEXT with NO foreign key (there is no orgs table with an
-- id column). gen_random_uuid() from pgcrypto. IF NOT EXISTS everywhere.

-- ── org_profiles ────────────────────────────────────────────────────────────────
-- Per-org brand/profile data. Keyed by org_id. Created at runtime today; defined
-- here so fresh DBs and the v2 insight pipeline can rely on it.
CREATE TABLE IF NOT EXISTS org_profiles (
  org_id            TEXT        PRIMARY KEY,
  brand_name        TEXT,
  logo_url          TEXT,
  industry          TEXT,
  company_size      TEXT,
  use_case          TEXT,
  target_audience   TEXT,
  website           TEXT,
  brand_description TEXT,
  brand_colors      JSONB,
  brand_fonts       JSONB,
  plan_tier         TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── credit_accounts ──────────────────────────────────────────────────────────────
-- One row per org. Mirrors backend/src/lib/creditLedger.ts usage.
CREATE TABLE IF NOT EXISTS credit_accounts (
  org_id              TEXT        PRIMARY KEY,
  plan_tier           TEXT        NOT NULL,
  monthly_allowance   INT         NOT NULL DEFAULT 0,
  allowance_remaining INT         NOT NULL DEFAULT 0,
  pack_balance        INT         NOT NULL DEFAULT 0,
  period_start        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overage_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  overage_ceiling     INT,
  overage_used        INT         NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── credit_ledger ────────────────────────────────────────────────────────────────
-- Append-only ledger of credit grants/debits. Mirrors creditLedger.ts INSERTs.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT          NOT NULL,
  user_id       TEXT,
  action_type   TEXT          NOT NULL,
  credits       INT           NOT NULL,
  source        TEXT          NOT NULL,
  action_ref    TEXT,
  balance_after INT           NOT NULL,
  unit_cost_usd NUMERIC(10,6),
  note          TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_org
  ON credit_ledger (org_id, created_at DESC);
