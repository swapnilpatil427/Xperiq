-- Ensure org_profiles exists (table is also created on-demand by orgProfile.js ensureTable(),
-- but migrations run before any API request so we must own the DDL here).
CREATE TABLE IF NOT EXISTS org_profiles (
  id                SERIAL PRIMARY KEY,
  org_id            TEXT UNIQUE NOT NULL,
  industry          TEXT,
  company_size      TEXT,
  use_case          TEXT,
  target_audience   TEXT,
  website           TEXT,
  brand_description TEXT,
  brand_name        TEXT,
  logo_url          TEXT,
  brand_colors      JSONB DEFAULT '{}',
  brand_fonts       JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Additive columns (idempotent — safe whether table was just created or pre-existed)
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS sub_vertical       TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS region             TEXT DEFAULT 'global';
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS product_name       TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS primary_use_case   TEXT;
ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS employee_count_range TEXT;

-- Industry CHECK constraint (skip if already present)
DO $$
BEGIN
  ALTER TABLE org_profiles
    ADD CONSTRAINT org_profiles_industry_check
    CHECK (industry IN (
      'technology', 'healthcare', 'retail', 'financial_services',
      'education', 'government', 'professional_services', 'other'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
