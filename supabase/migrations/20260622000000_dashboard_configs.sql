CREATE TABLE IF NOT EXISTS dashboard_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'My Dashboard',
  widgets jsonb NOT NULL DEFAULT '[]',
  filters jsonb NOT NULL DEFAULT '{"dateRange":"90d","surveyId":null,"tagId":null}',
  created_by text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dashboard_configs_org_idx ON dashboard_configs(org_id);
