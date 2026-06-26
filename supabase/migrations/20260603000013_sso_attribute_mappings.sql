-- Enterprise User Directory — SSO attribute mapping
-- Maps IdP SAML/OIDC attribute names to Experient profile fields. Consumed by
-- the Clerk webhook handler when a user logs in via SSO for the first time.

CREATE TABLE IF NOT EXISTS sso_attribute_mappings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL UNIQUE,
  mappings    JSONB       NOT NULL DEFAULT '{}',
  -- { "<saml_attr_name>": "<experient_field>", ... }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_sso_attribute_mappings_updated_at
  BEFORE UPDATE ON sso_attribute_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
