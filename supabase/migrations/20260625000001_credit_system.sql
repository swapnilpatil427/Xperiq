-- ============================================================================
-- Credit System — the financial backbone of Experient
-- ----------------------------------------------------------------------------
-- One account row per org holds the live balance; an append-only ledger records
-- every grant and debit for audit/diagnosis. Only the expensive analytical AI is
-- metered (insight runs, Crystal turns, XO-Fusion); core usage is bundled.
--
-- Balance model (consumed in this order on debit):
--   1. allowance_remaining  — resets each monthly period to monthly_allowance
--   2. pack_balance         — purchased / granted credits, roll over, never reset
--   3. overage              — only if overage_enabled and under overage_ceiling
--
-- 1 credit = $0.01. See docs/pricing/CREDIT_SYSTEM.md and METERING_AND_USAGE.md.
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_accounts (
    org_id              TEXT        PRIMARY KEY,
    plan_tier           TEXT        NOT NULL DEFAULT 'free'
                            CHECK (plan_tier IN ('free', 'starter', 'growth', 'enterprise', 'platform')),

    -- Monthly allowance (bundled AI). Reset to monthly_allowance each period.
    monthly_allowance   INT         NOT NULL DEFAULT 0,
    allowance_remaining INT         NOT NULL DEFAULT 0,
    period_start        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Purchased / granted credits — consumed after allowance, never auto-reset.
    pack_balance        INT         NOT NULL DEFAULT 0,

    -- Overage: opt-in, with an optional ceiling (credits) per period. Spend cap is
    -- "on by default" == overage_enabled = false (AI pauses at allowance exhaustion).
    overage_enabled     BOOL        NOT NULL DEFAULT FALSE,
    overage_ceiling     INT,                                   -- NULL = unlimited when enabled
    overage_used        INT         NOT NULL DEFAULT 0,        -- resets each period

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        TEXT        NOT NULL,
    user_id       TEXT,                                        -- actor (NULL for system)
    action_type   TEXT        NOT NULL,                        -- insight_run|crystal_turn|xo_fusion|broadcast_email|broadcast_sms|grant|allowance_reset|plan_change|adjustment
    credits       INT         NOT NULL,                        -- negative = debit, positive = credit
    source        TEXT        NOT NULL DEFAULT 'system'        -- allowance|pack|overage|grant|system
                      CHECK (source IN ('allowance', 'pack', 'overage', 'grant', 'system')),
    action_ref    TEXT,                                        -- run_id / message id / broadcast id, etc.
    balance_after INT         NOT NULL DEFAULT 0,              -- allowance_remaining + pack_balance after this entry
    unit_cost_usd NUMERIC(12, 6),                              -- true compute cost we incurred (for COGS / Cost-Down Dividend)
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_ledger_org_time_idx   ON credit_ledger (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS credit_ledger_org_action_idx ON credit_ledger (org_id, action_type, created_at DESC);

-- updated_at trigger (idempotent)
CREATE OR REPLACE FUNCTION touch_credit_accounts_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_accounts_updated_at ON credit_accounts;
CREATE TRIGGER trg_credit_accounts_updated_at
    BEFORE UPDATE ON credit_accounts
    FOR EACH ROW EXECUTE FUNCTION touch_credit_accounts_updated_at();
