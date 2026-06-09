-- Enterprise User Directory — Org plan tier + seat fields
-- Adds billing/plan context to org_profiles used by seat enforcement and the
-- custom-role (enterprise-only) gate.

ALTER TABLE org_profiles
  ADD COLUMN IF NOT EXISTS plan_tier        TEXT NOT NULL DEFAULT 'starter'
                                            CHECK (plan_tier IN ('starter','growth','enterprise')),
  ADD COLUMN IF NOT EXISTS seat_limit       INT  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ;

-- Ensure the dev org exists and is on the enterprise tier so local testing can
-- exercise enterprise-gated features (custom roles, SCIM, etc.).
INSERT INTO org_profiles (org_id, plan_tier, seat_limit)
VALUES ('dev-org', 'enterprise', 100)
ON CONFLICT (org_id) DO UPDATE
  SET plan_tier = 'enterprise', seat_limit = 100;
