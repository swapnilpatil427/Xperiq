-- Tier 3 Phase B: Ownership Routing Rules
-- Maps segment/account/touchpoint/driver → real owner identity.
-- Crystal uses this to resolve "CSM" (free text) into a real Clerk user_id
-- before proposing case creation. The card shows "Assign to Sarah Chen" not "assign to CSM".
-- See docs/agent-framework/TIER3_XO_LEGENDARY_DESIGN.md §System 4

CREATE TABLE IF NOT EXISTS ownership_routes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              TEXT        NOT NULL,

    -- What dimension this rule matches on
    dimension           TEXT        NOT NULL
                            CHECK (dimension IN ('segment', 'account', 'touchpoint', 'driver', 'survey', 'category')),

    -- The value to match
    match_value         TEXT        NOT NULL,
    match_type          TEXT        NOT NULL DEFAULT 'exact'
                            CHECK (match_type IN ('exact', 'prefix', 'contains', 'regex')),

    -- Primary owner (resolved from Clerk at rule creation time, cached here)
    owner_user_id       TEXT        NOT NULL,    -- Clerk user_id
    owner_label         TEXT,                   -- display name (e.g. "Sarah Chen")
    owner_email         TEXT,                   -- email (cached for Slack/email notifications)

    -- Escalation owner (used when SLA breach occurs on tier 0 → tier 1)
    escalation_user_id  TEXT,                   -- Clerk user_id of escalation target
    escalation_label    TEXT,                   -- display name

    -- Priority (lower = higher priority; first matching rule wins when multiple match)
    priority            INT         NOT NULL DEFAULT 0,

    -- Optional: role label for display (e.g. "Enterprise CSM", "HR BP")
    role_label          TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT        NOT NULL DEFAULT 'system',

    UNIQUE (org_id, dimension, match_value)
);

-- Query indexes
CREATE INDEX IF NOT EXISTS ownership_routes_org_dim_idx ON ownership_routes (org_id, dimension, priority ASC);
CREATE INDEX IF NOT EXISTS ownership_routes_owner_idx ON ownership_routes (org_id, owner_user_id);

COMMENT ON TABLE  ownership_routes             IS 'Routes CX cases to real owners based on segment/account/touchpoint/driver dimensions.';
COMMENT ON COLUMN ownership_routes.match_type  IS 'exact: exact string match. prefix: value.startsWith(match_value). contains: value includes. regex: RE2 pattern.';
COMMENT ON COLUMN ownership_routes.priority    IS 'When multiple rules match, the rule with the lowest priority number wins.';
COMMENT ON COLUMN ownership_routes.owner_label IS 'Cached Clerk display name — updated when rule is written. Stale if user renamed in Clerk.';
