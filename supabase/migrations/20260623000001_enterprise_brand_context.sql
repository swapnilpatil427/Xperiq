-- Enterprise Brand Context: multi-tenant identity for CrystalOS
-- Brands are enterprise customers who license Crystal through Experient.
-- Each brand has its own persona, feature gating, data region, and support config.

CREATE TABLE brands (
    brand_id            TEXT PRIMARY KEY,
    brand_name          TEXT NOT NULL,
    brand_persona       TEXT,                -- "Marriott Insights" — how Crystal self-identifies
    data_region         TEXT NOT NULL DEFAULT 'us'
                            CHECK (data_region IN ('us', 'eu', 'apac', 'ca')),
    plan_tier           TEXT NOT NULL DEFAULT 'starter'
                            CHECK (plan_tier IN ('starter', 'growth', 'enterprise', 'enterprise_plus')),
    permitted_features  TEXT[] DEFAULT '{}', -- explicit feature allowlist (empty = use role defaults)
    restricted_features TEXT[] DEFAULT '{}', -- explicit feature blocklist (always excluded)
    custom_instructions TEXT,                -- brand-specific Crystal behavior addendum
    support_ticket_url  TEXT,                -- brand's own support system URL for bug routing
    feature_request_url TEXT,                -- brand's own roadmap/feedback URL
    max_tool_turns      INT NOT NULL DEFAULT 10,
    thread_ttl_days     INT NOT NULL DEFAULT 7,
    progressive_tiers   INT[] DEFAULT '{10,40,100,250}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatically update updated_at on any row change
CREATE OR REPLACE FUNCTION brands_update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER brands_updated_at
    BEFORE UPDATE ON brands
    FOR EACH ROW EXECUTE FUNCTION brands_update_timestamp();

-- Maps brand ↔ org memberships (one brand can have many orgs, one org belongs to one brand)
CREATE TABLE brand_org_memberships (
    brand_id    TEXT NOT NULL REFERENCES brands(brand_id) ON DELETE CASCADE,
    org_id      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (brand_id, org_id)
);

CREATE INDEX ON brand_org_memberships (org_id);

COMMENT ON TABLE brands IS 'Enterprise tenant identity for CrystalOS multi-brand deployment';
COMMENT ON TABLE brand_org_memberships IS 'Maps Experient orgs to their brand tenant';
COMMENT ON COLUMN brands.permitted_features IS 'Empty array means no explicit allowlist; role permissions apply directly';
COMMENT ON COLUMN brands.restricted_features IS 'Always excluded from effective_perms regardless of role';
