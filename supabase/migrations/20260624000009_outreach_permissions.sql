-- Tier 3 Phase I: Outreach Permissions — cx_manager role + new permission actions
-- This migration adds the cx_manager builtin role and registers new permission
-- action strings so the DB schema matches rbac.ts BUILTIN_ROLES.

-- Insert cx_manager builtin role (idempotent — skip if already seeded by runtime)
INSERT INTO org_roles (
    id, org_id, builtin_key, name, description, seat_weight, default_permissions,
    is_builtin, created_at, updated_at
)
VALUES (
    gen_random_uuid(),
    '__builtin__',
    'org:cx_manager',
    'CX Manager',
    'Manage contact outreach and close-the-loop campaigns',
    0.75,
    '{
        "survey:read":"ALL","survey:write":"NONE","survey:distribute":"ALL",
        "survey:insights:read":"ALL","survey:insights:generate":"ALL",
        "survey:responses:export":"ALL","survey:delete":"NONE","dashboard:read":"ALL",
        "alerts:manage":"NONE","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE",
        "contacts:read":"ALL","contacts:pii:read":"ALL","contacts:write":"ALL",
        "contacts:import":"ALL","contacts:export":"ALL","contacts:anonymize":"NONE",
        "contacts:segment:manage":"ALL",
        "outreach:transactional":"ALL","outreach:broadcast":"ALL","outreach:approve":"NONE",
        "outreach:suppress":"ALL","outreach:configure":"NONE","outreach:logs:read":"ALL",
        "crystal:propose_outreach":"ALL","crystal:converse":"ALL","crystal:auto_trigger":"NONE"
    }'::jsonb,
    TRUE, NOW(), NOW()
)
ON CONFLICT (org_id, builtin_key) DO UPDATE
    SET default_permissions = EXCLUDED.default_permissions,
        updated_at = NOW();

-- Update existing builtin roles to include the new permission action strings
-- (so role lookups don't return null for these new actions in older seeded rows)
UPDATE org_roles
SET default_permissions = default_permissions || '{
    "contacts:read":"ALL","contacts:pii:read":"ALL","contacts:write":"ALL",
    "contacts:import":"ALL","contacts:export":"ALL","contacts:anonymize":"ALL",
    "contacts:segment:manage":"ALL",
    "outreach:transactional":"ALL","outreach:broadcast":"ALL","outreach:approve":"ALL",
    "outreach:suppress":"ALL","outreach:configure":"ALL","outreach:logs:read":"ALL",
    "crystal:propose_outreach":"ALL","crystal:converse":"ALL","crystal:auto_trigger":"ALL"
}'::jsonb,
    updated_at = NOW()
WHERE builtin_key = 'org:super_admin' AND org_id = '__builtin__';

UPDATE org_roles
SET default_permissions = default_permissions || '{
    "contacts:read":"ALL","contacts:pii:read":"ALL","contacts:write":"ALL",
    "contacts:import":"ALL","contacts:export":"ALL","contacts:anonymize":"NONE",
    "contacts:segment:manage":"ALL",
    "outreach:transactional":"ALL","outreach:broadcast":"ALL","outreach:approve":"NONE",
    "outreach:suppress":"ALL","outreach:configure":"ALL","outreach:logs:read":"ALL",
    "crystal:propose_outreach":"ALL","crystal:converse":"ALL","crystal:auto_trigger":"NONE"
}'::jsonb,
    updated_at = NOW()
WHERE builtin_key = 'org:admin' AND org_id = '__builtin__';

UPDATE org_roles
SET default_permissions = default_permissions || '{
    "contacts:read":"OWNED","contacts:pii:read":"OWNED","contacts:write":"OWNED",
    "contacts:import":"NONE","contacts:export":"NONE","contacts:anonymize":"NONE",
    "contacts:segment:manage":"OWNED",
    "outreach:transactional":"OWNED","outreach:broadcast":"NONE","outreach:approve":"NONE",
    "outreach:suppress":"NONE","outreach:configure":"NONE","outreach:logs:read":"OWNED",
    "crystal:propose_outreach":"ALL","crystal:converse":"OWNED","crystal:auto_trigger":"NONE"
}'::jsonb,
    updated_at = NOW()
WHERE builtin_key = 'org:program_admin' AND org_id = '__builtin__';

UPDATE org_roles
SET default_permissions = default_permissions || '{
    "contacts:read":"ALL","contacts:pii:read":"NONE","contacts:write":"NONE",
    "contacts:import":"NONE","contacts:export":"NONE","contacts:anonymize":"NONE",
    "contacts:segment:manage":"NONE",
    "outreach:transactional":"NONE","outreach:broadcast":"NONE","outreach:approve":"NONE",
    "outreach:suppress":"NONE","outreach:configure":"NONE","outreach:logs:read":"ALL",
    "crystal:propose_outreach":"ALL","crystal:converse":"NONE","crystal:auto_trigger":"NONE"
}'::jsonb,
    updated_at = NOW()
WHERE builtin_key = 'org:analyst' AND org_id = '__builtin__';

UPDATE org_roles
SET default_permissions = default_permissions || '{
    "contacts:read":"OWNED","contacts:pii:read":"NONE","contacts:write":"NONE",
    "contacts:import":"NONE","contacts:export":"NONE","contacts:anonymize":"NONE",
    "contacts:segment:manage":"NONE",
    "outreach:transactional":"OWNED","outreach:broadcast":"NONE","outreach:approve":"NONE",
    "outreach:suppress":"NONE","outreach:configure":"NONE","outreach:logs:read":"OWNED",
    "crystal:propose_outreach":"ALL","crystal:converse":"NONE","crystal:auto_trigger":"NONE"
}'::jsonb,
    updated_at = NOW()
WHERE builtin_key = 'org:survey_creator' AND org_id = '__builtin__';

-- report_viewer and member get NONE for all new actions (handled by jsonb merge default)
UPDATE org_roles
SET default_permissions = default_permissions || '{
    "contacts:read":"NONE","contacts:pii:read":"NONE","contacts:write":"NONE",
    "contacts:import":"NONE","contacts:export":"NONE","contacts:anonymize":"NONE",
    "contacts:segment:manage":"NONE",
    "outreach:transactional":"NONE","outreach:broadcast":"NONE","outreach:approve":"NONE",
    "outreach:suppress":"NONE","outreach:configure":"NONE","outreach:logs:read":"NONE",
    "crystal:propose_outreach":"NONE","crystal:converse":"NONE","crystal:auto_trigger":"NONE"
}'::jsonb,
    updated_at = NOW()
WHERE builtin_key IN ('org:report_viewer', 'org:member') AND org_id = '__builtin__';

COMMENT ON TABLE org_roles IS 'Org-scoped roles. builtin_key roles are seeded/updated by migrations. See rbac.ts BUILTIN_ROLES for the authoritative permission catalog.';
