-- Enterprise User Directory — Core Schema
-- Feature 1 of 5 · Increment 1.
-- Source of truth for user profiles + authorization (Clerk remains the auth surface).
-- IDs: org_id / user_id are TEXT (Clerk IDs); internal PKs are UUID.
--
-- NOTE: The design doc used `NULLS NOT DISTINCT` on several partial-unique
-- constraints. That is incorrect — it would forbid multiple NULLs (e.g. only one
-- user per org could omit employee_id, only one custom role per org). The default
-- (NULLS DISTINCT) allows multiple NULLs while keeping non-null values unique,
-- which is what we want, so plain UNIQUE is used throughout.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Shared trigger: keep updated_at fresh ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── scim_tokens (no FK deps — created first; referenced by user_profiles/groups) ─
CREATE TABLE IF NOT EXISTS scim_tokens (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  token_hash           TEXT        NOT NULL,
  token_prefix         VARCHAR(8)  NOT NULL,
  provider             TEXT,
  scim_endpoint_url    TEXT,
  last_used_at         TIMESTAMPTZ,
  last_sync_at         TIMESTAMPTZ,
  sync_stats           JSONB       DEFAULT '{}',
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at           TIMESTAMPTZ,
  revoked_by           TEXT,
  CONSTRAINT uq_scim_token_name UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS idx_scim_tokens_org_id ON scim_tokens(org_id, is_active);

-- ── org_roles (no FK deps) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_roles (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT         NOT NULL,
  name                 TEXT         NOT NULL,
  description          TEXT,
  is_builtin           BOOLEAN      NOT NULL DEFAULT FALSE,
  builtin_key          TEXT,
  default_permissions  JSONB        NOT NULL DEFAULT '{}',
  seat_weight          NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  color                VARCHAR(16),
  created_by           TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_role_name_per_org   UNIQUE (org_id, name),
  CONSTRAINT uq_builtin_key_per_org UNIQUE (org_id, builtin_key)
);
CREATE INDEX IF NOT EXISTS idx_org_roles_org_id  ON org_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_org_roles_builtin ON org_roles(org_id, is_builtin);

CREATE TRIGGER trg_org_roles_updated_at
  BEFORE UPDATE ON org_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── departments (self-referential hierarchy) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  description          TEXT,
  parent_department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
  head_user_id         TEXT,
  depth                INT         NOT NULL DEFAULT 0,
  path                 TEXT[],
  color                VARCHAR(16),
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order           INT         NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dept_name_per_parent UNIQUE (org_id, parent_department_id, name),
  CONSTRAINT no_self_parent CHECK (id != parent_department_id)
);
CREATE INDEX IF NOT EXISTS idx_departments_org_id ON departments(org_id);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_department_id);
CREATE INDEX IF NOT EXISTS idx_departments_path   ON departments USING GIN (path);
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(org_id, is_active)
  WHERE is_active = TRUE;

-- Compute cached path[] + depth on insert / re-parent (doc defined the trigger name
-- but not the function — implemented here).
CREATE OR REPLACE FUNCTION compute_department_path_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  parent_path  TEXT[];
  parent_depth INT;
BEGIN
  IF NEW.parent_department_id IS NULL THEN
    NEW.path  := ARRAY[NEW.id::TEXT];
    NEW.depth := 0;
  ELSE
    SELECT path, depth INTO parent_path, parent_depth
      FROM departments WHERE id = NEW.parent_department_id;
    NEW.path  := COALESCE(parent_path, '{}') || NEW.id::TEXT;
    NEW.depth := COALESCE(parent_depth, 0) + 1;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_departments_path
  BEFORE INSERT OR UPDATE OF parent_department_id ON departments
  FOR EACH ROW EXECUTE FUNCTION compute_department_path_trigger();

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── user_profiles (central table; FKs departments / org_roles / scim_tokens) ─────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id              TEXT        PRIMARY KEY,
  org_id               TEXT        NOT NULL,
  email                TEXT        NOT NULL,
  first_name           TEXT,
  last_name            TEXT,
  display_name         TEXT,
  avatar_url           TEXT,
  phone                TEXT,
  employee_id          TEXT,
  job_title            TEXT,
  department_id        UUID        REFERENCES departments(id) ON DELETE SET NULL,
  manager_user_id      TEXT,
  cost_center          TEXT,
  location             TEXT,
  timezone             VARCHAR(64) NOT NULL DEFAULT 'UTC',
  locale               VARCHAR(16) NOT NULL DEFAULT 'en',
  role_id              UUID        REFERENCES org_roles(id) ON DELETE SET NULL,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  last_seen_at         TIMESTAMPTZ,
  custom_attributes    JSONB       NOT NULL DEFAULT '{}',
  survey_segments      TEXT[]      NOT NULL DEFAULT '{}',
  provisioned_by       TEXT        CHECK (provisioned_by IN ('scim','invite','sso','manual','import')),
  scim_external_id     TEXT,
  scim_provisioner_id  UUID        REFERENCES scim_tokens(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprovisioned_at     TIMESTAMPTZ,
  CONSTRAINT uq_org_email            UNIQUE (org_id, email),
  CONSTRAINT uq_org_employee_id      UNIQUE (org_id, employee_id),
  CONSTRAINT uq_org_scim_external_id UNIQUE (org_id, scim_external_id)
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id     ON user_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_org_active ON user_profiles(org_id, is_active)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON user_profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role_id    ON user_profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_scim_external ON user_profiles(org_id, scim_external_id)
  WHERE scim_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_custom_attrs ON user_profiles USING GIN (custom_attributes);
CREATE INDEX IF NOT EXISTS idx_user_profiles_segments     ON user_profiles USING GIN (survey_segments);
CREATE INDEX IF NOT EXISTS idx_user_profiles_search       ON user_profiles
  USING GIN (to_tsvector('english', COALESCE(display_name,'') || ' ' || email));

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── user_resource_permissions (Layer 2 overrides) ───────────────────────────────
CREATE TABLE IF NOT EXISTS user_resource_permissions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  user_id              TEXT        NOT NULL,
  resource_type        TEXT        NOT NULL,
  resource_id          TEXT        NOT NULL,
  action               TEXT        NOT NULL,
  effect               TEXT        NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  granted_by           TEXT,
  granted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ,
  CONSTRAINT uq_user_resource_permission
    UNIQUE (org_id, user_id, resource_type, resource_id, action)
);
CREATE INDEX IF NOT EXISTS idx_urp_user_id  ON user_resource_permissions(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_urp_resource ON user_resource_permissions(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_urp_expires  ON user_resource_permissions(expires_at)
  WHERE expires_at IS NOT NULL;

-- ── user_groups + members ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_groups (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  description          TEXT,
  group_type           TEXT        NOT NULL DEFAULT 'static'
                       CHECK (group_type IN ('static','dynamic','scim_synced')),
  dynamic_rules        JSONB,
  scim_external_id     TEXT,
  scim_provisioner_id  UUID        REFERENCES scim_tokens(id) ON DELETE SET NULL,
  member_count         INT         NOT NULL DEFAULT 0,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_group_name_per_org UNIQUE (org_id, name),
  CONSTRAINT uq_scim_group_per_org UNIQUE (org_id, scim_external_id)
);
CREATE INDEX IF NOT EXISTS idx_user_groups_org_id ON user_groups(org_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_type   ON user_groups(org_id, group_type);
CREATE INDEX IF NOT EXISTS idx_user_groups_scim   ON user_groups(org_id, scim_external_id)
  WHERE scim_external_id IS NOT NULL;

CREATE TRIGGER trg_user_groups_updated_at
  BEFORE UPDATE ON user_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS user_group_members (
  group_id             UUID        NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id              TEXT        NOT NULL,
  org_id               TEXT        NOT NULL,
  added_by             TEXT,
  added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ugm_user_id  ON user_group_members(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_ugm_group_id ON user_group_members(group_id);

CREATE OR REPLACE FUNCTION update_group_member_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_groups SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_ugm_count_insert AFTER INSERT ON user_group_members
  FOR EACH ROW EXECUTE FUNCTION update_group_member_count();
CREATE TRIGGER trg_ugm_count_delete AFTER DELETE ON user_group_members
  FOR EACH ROW EXECUTE FUNCTION update_group_member_count();

-- ── org_custom_fields ─────────────────────────────────────────────────────────--
CREATE TABLE IF NOT EXISTS org_custom_fields (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  field_key            TEXT        NOT NULL,
  display_name         TEXT        NOT NULL,
  field_type           TEXT        NOT NULL DEFAULT 'text'
                       CHECK (field_type IN ('text','number','boolean','select','date')),
  options              JSONB,
  is_required          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_scim_mapped       BOOLEAN     NOT NULL DEFAULT FALSE,
  scim_attribute_name  TEXT,
  is_searchable        BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order           INT         NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_custom_field_key UNIQUE (org_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_ocf_org_id ON org_custom_fields(org_id);

-- ── user_audit_log (append-only — enforce REVOKE UPDATE,DELETE in production) ────
CREATE TABLE IF NOT EXISTS user_audit_log (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  actor_user_id        TEXT,
  actor_type           TEXT        NOT NULL DEFAULT 'user'
                       CHECK (actor_type IN ('user','scim','system','clerk_webhook')),
  target_user_id       TEXT,
  target_resource_type TEXT,
  target_resource_id   TEXT,
  event_type           TEXT        NOT NULL,
  before_state         JSONB,
  after_state          JSONB,
  ip_address           INET,
  user_agent           TEXT,
  request_id           TEXT,
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_future_events CHECK (occurred_at <= NOW() + INTERVAL '1 minute')
);
CREATE INDEX IF NOT EXISTS idx_ual_org_id      ON user_audit_log(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_actor       ON user_audit_log(actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_target_user ON user_audit_log(target_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_event_type  ON user_audit_log(org_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ual_resource    ON user_audit_log(target_resource_type, target_resource_id);

-- ── seat_usage ───────────────────────────────────────────────────────────────--
CREATE TABLE IF NOT EXISTS seat_usage (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT         NOT NULL,
  user_id              TEXT         NOT NULL,
  role_id              UUID         REFERENCES org_roles(id) ON DELETE SET NULL,
  seat_weight          NUMERIC(3,1) NOT NULL,
  period_start         DATE         NOT NULL,
  period_end           DATE,
  is_current           BOOLEAN      NOT NULL DEFAULT TRUE,
  snapshot_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_seat_current UNIQUE (org_id, user_id, is_current)
);
CREATE INDEX IF NOT EXISTS idx_seat_usage_org_id ON seat_usage(org_id, is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_seat_usage_period ON seat_usage(org_id, period_start);

-- ── Seed the 7 built-in roles for every existing org (+ dev-org) ─────────────────
INSERT INTO org_roles (org_id, name, description, is_builtin, builtin_key, default_permissions, seat_weight)
SELECT
  o.org_id, r.name, r.description, TRUE, r.builtin_key, r.default_permissions::JSONB, r.seat_weight
FROM (SELECT org_id FROM org_profiles UNION SELECT 'dev-org') o
CROSS JOIN (VALUES
  ('Super Admin', 'Full platform control', 'org:super_admin',
   '{"survey:read":"ALL","survey:write":"ALL","survey:distribute":"ALL","survey:insights:read":"ALL","survey:insights:generate":"ALL","survey:responses:export":"ALL","survey:delete":"ALL","dashboard:read":"ALL","alerts:manage":"ALL","workflows:manage":"ALL","users:manage":"ALL","billing:manage":"ALL"}', 1.0),
  ('Admin', 'Manage users and all surveys', 'org:admin',
   '{"survey:read":"ALL","survey:write":"ALL","survey:distribute":"ALL","survey:insights:read":"ALL","survey:insights:generate":"ALL","survey:responses:export":"ALL","survey:delete":"ALL","dashboard:read":"ALL","alerts:manage":"ALL","workflows:manage":"ALL","users:manage":"ALL","billing:manage":"NONE"}', 1.0),
  ('Program Admin', 'Manage own survey programs', 'org:program_admin',
   '{"survey:read":"OWNED","survey:write":"OWNED","survey:distribute":"OWNED","survey:insights:read":"OWNED","survey:insights:generate":"OWNED","survey:responses:export":"OWNED","survey:delete":"OWNED","dashboard:read":"ALL","alerts:manage":"OWNED","workflows:manage":"ALL","users:manage":"NONE","billing:manage":"NONE"}', 1.0),
  ('Analyst', 'Read all surveys and insights', 'org:analyst',
   '{"survey:read":"ALL","survey:write":"NONE","survey:distribute":"NONE","survey:insights:read":"ALL","survey:insights:generate":"ALL","survey:responses:export":"ALL","survey:delete":"NONE","dashboard:read":"ALL","alerts:manage":"NONE","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}', 1.0),
  ('Survey Creator', 'Create and manage own surveys', 'org:survey_creator',
   '{"survey:read":"OWNED","survey:write":"OWNED","survey:distribute":"OWNED","survey:insights:read":"OWNED","survey:insights:generate":"OWNED","survey:responses:export":"NONE","survey:delete":"OWNED","dashboard:read":"OWNED","alerts:manage":"OWNED","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}', 1.0),
  ('Report Viewer', 'View shared dashboards', 'org:report_viewer',
   '{"survey:read":"SHARED","survey:write":"NONE","survey:distribute":"NONE","survey:insights:read":"SHARED","survey:insights:generate":"NONE","survey:responses:export":"NONE","survey:delete":"NONE","dashboard:read":"SHARED","alerts:manage":"NONE","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}', 0.5),
  ('Member', 'Survey respondents only', 'org:member',
   '{"survey:read":"NONE","survey:write":"NONE","survey:distribute":"NONE","survey:insights:read":"NONE","survey:insights:generate":"NONE","survey:responses:export":"NONE","survey:delete":"NONE","dashboard:read":"NONE","alerts:manage":"NONE","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}', 0.0)
) AS r(name, description, builtin_key, default_permissions, seat_weight)
ON CONFLICT (org_id, builtin_key) DO NOTHING;

-- ── Seed sample user profiles for the dev org (local SKIP_AUTH testing) ──────────
INSERT INTO user_profiles (user_id, org_id, email, first_name, last_name, display_name, job_title, role_id, provisioned_by, is_active)
SELECT v.user_id, 'dev-org', v.email, v.first_name, v.last_name,
       v.first_name || ' ' || v.last_name, v.job_title,
       (SELECT id FROM org_roles WHERE org_id = 'dev-org' AND builtin_key = v.builtin_key),
       'manual', TRUE
FROM (VALUES
  ('dev-user',     'dev@experient.local',   'Dev',    'User',    'Platform Owner',     'org:super_admin'),
  ('user_sample01','alice@experient.local', 'Alice',  'Nguyen',  'Head of Research',   'org:admin'),
  ('user_sample02','ben@experient.local',   'Ben',    'Okafor',  'Insights Analyst',   'org:analyst'),
  ('user_sample03','carla@experient.local', 'Carla',  'Mendes',  'Survey Author',      'org:survey_creator'),
  ('user_sample04','dan@experient.local',   'Dan',    'Petrov',  'Stakeholder',        'org:report_viewer')
) AS v(user_id, email, first_name, last_name, job_title, builtin_key)
ON CONFLICT (user_id) DO NOTHING;
