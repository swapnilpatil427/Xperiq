# Experient Enterprise User Directory Service
## Production-Grade Design Document

**Version:** 1.0  
**Date:** 2026-06-03  
**Authors:** Priya Nair, James Whitfield, Dr. Aisha Kamara, Chen Wei, Kenji Nakamura, Patricia Holloway, Marcus Thompson, Raj Patel, Emma Thompson, Linda Zhang  
**Status:** Design-Complete — Ready for Sprint Planning  
**Target:** Enterprise plan feature tier (Phase 1 baseline available to Growth)

---

## Table of Contents

1. [Executive Summary & Clerk Boundary Decision](#1-executive-summary--clerk-boundary-decision)
2. [Enterprise Role & Permission System](#2-enterprise-role--permission-system)
3. [Extended User Profile Schema](#3-extended-user-profile-schema)
4. [SCIM 2.0 Provisioning Endpoint](#4-scim-20-provisioning-endpoint)
5. [Department & Team Hierarchy](#5-department--team-hierarchy)
6. [User Groups for Survey Targeting](#6-user-groups-for-survey-targeting)
7. [Admin Console UI](#7-admin-console-ui)
8. [Seat Licensing & Enforcement](#8-seat-licensing--enforcement)
9. [Compliance Audit Log](#9-compliance-audit-log)
10. [Crystal User Context Integration](#10-crystal-user-context-integration)
11. [Backend API Design](#11-backend-api-design)
12. [hasPermission Middleware](#12-haspermission-middleware)
13. [SSO Attribute Mapping](#13-sso-attribute-mapping)
14. [Migration Plan from Current State](#14-migration-plan-from-current-state)
15. [Patricia's Enterprise Validation](#15-patricias-enterprise-validation)
16. [Implementation Roadmap](#16-implementation-roadmap)

---

## 1. Executive Summary & Clerk Boundary Decision

**Emma Thompson + Priya Nair**

### The Core Architecture Decision

Experient uses Clerk as its identity surface — the layer that handles authentication, sessions, and the fundamental user-to-organization relationship. Clerk is a best-in-class auth platform and we do not attempt to replicate what it does well. However, Clerk is not designed to be an enterprise identity data store. It has no SCIM endpoint, no resource-level permissions, no department hierarchies, and no compliance audit log suitable for SOC 2.

The architecture is:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IDENTITY SURFACE (Clerk)                          │
│  - Authentication sessions + JWT tokens                                     │
│  - MFA (TOTP, SMS, backup codes)                                            │
│  - Social OAuth (Google, GitHub, Microsoft)                                 │
│  - SAML SSO login flow (Enterprise plan)                                    │
│  - Password reset and email verification                                    │
│  - User invite-to-org flow (email delivery)                                 │
│  - Two base roles: org:admin, org:member                                    │
│  - Basic member list (Clerk Admin API)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                               Clerk webhooks
                               Clerk Admin API
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IDENTITY DATA STORE (Experient User Directory)           │
│  - Extended user profiles (all attributes beyond Clerk's publicMetadata)    │
│  - Custom role definitions (Survey Owner, Analyst, Report Viewer, etc.)     │
│  - Resource-level permissions (this user can see THESE surveys)             │
│  - Department and team hierarchies (org chart with unlimited depth)         │
│  - User groups (static, dynamic, SCIM-synced — for survey distribution)    │
│  - SCIM 2.0 endpoint (Okta, Azure AD, Google Workspace push users in)      │
│  - Seat licensing enforcement (count active seats, enforce plan limits)     │
│  - Approval workflows for provisioning                                      │
│  - Compliance audit log (immutable, SOC 2 ready)                            │
│  - Crystal user context (segment users by attributes for targeting)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Clerk is the source of truth for authentication.**  
**Experient User Directory is the source of truth for authorization and user attributes.**

When a user logs in via SAML SSO, Clerk processes the SAML assertion and issues a JWT. Experient's backend reads `req.userId` and `req.orgId` from that JWT (as it does today in `middleware/auth.js`). All authorization decisions — what the user can do, what resources they can see — are then evaluated against Experient's User Directory tables in Postgres, not Clerk.

### What Clerk Handles (Permanent — Do Not Move)

| Responsibility | Clerk Mechanism |
|---|---|
| Authentication sessions | Clerk session tokens, JWT |
| MFA enforcement | TOTP, SMS via Clerk dashboard |
| Social OAuth | Google, GitHub, Microsoft OAuth apps |
| SAML SSO login | Clerk Enterprise SAML connections |
| Password reset, email verification | Clerk email templates |
| Invite email delivery | `clerk.organizations.createOrganizationInvitation()` |
| Base role: admin/member | Clerk org membership roles |
| Basic member list | `clerk.organizations.getOrganizationMembershipList()` |

### What Experient Builds (The User Directory)

| Responsibility | Experient Mechanism |
|---|---|
| Extended user profiles | `user_profiles` Postgres table |
| Custom role definitions | `org_roles` table + RBAC engine |
| Resource-level permissions | `user_resource_permissions` table |
| Department hierarchies | `departments` adjacency-list table |
| User groups | `user_groups` + `user_group_members` tables |
| SCIM 2.0 endpoint | Express routes at `/scim/v2/` |
| Seat licensing enforcement | `seat_usage` table + middleware |
| Approval workflows | `provisioning_requests` table |
| Compliance audit log | `user_audit_log` append-only table |
| Crystal user context | New Crystal tools reading user_profiles |

### Patricia's SCIM Question — Direct Answer

> "We use Okta to manage 50,000 employees. When someone joins or leaves, Okta automatically provisions/deprovisions their access. Does Experient support SCIM?"

**Yes.** Experient implements SCIM 2.0 (RFC 7644) at `/scim/v2/`. You configure Okta with Experient's SCIM base URL and a Bearer token generated from the Admin Console. From that point:

- When an employee joins your company, Okta sends `POST /scim/v2/Users` to Experient. Experient creates a `user_profiles` row, calls the Clerk Admin API to add the user to your Clerk org, and the user can immediately log in with their SSO credentials.
- When an employee leaves, Okta sends `PATCH /scim/v2/Users/:id` with `active: false`. Experient sets `deprovisioned_at` on their profile, removes them from the Clerk org, and revokes all active sessions. This happens within the next Okta sync cycle — typically within 5 minutes of the deprovision event in Okta.
- Okta group membership syncs to Experient user groups, enabling survey distribution to "Engineering" or "Q4 Pilot Customers" groups automatically.

Complete SCIM implementation is in Section 4.

---

## 2. Enterprise Role & Permission System

**Dr. Aisha Kamara + Priya Nair**

### Two-Layer RBAC Architecture

Enterprise authorization requires two distinct layers: who you are in the organization (org-level role), and what specific resources you can access (resource-level permissions). A flat role system cannot express "Analyst who can only see the APAC surveys."

```
Layer 1: Org-Level Role
  └── Defines the baseline: what you can do across the whole org
      Example: org:analyst can read all surveys, cannot create surveys

Layer 2: Resource-Level Permissions
  └── Overrides the baseline for specific resources
      Example: user X has survey:insights:read on survey-abc even though
               their org role is org:member
      Example: user Y has survey:responses:export denied on survey-xyz
               even though their org role is org:analyst (restriction override)
```

### Layer 1 — Org-Level Roles

Clerk provides two base roles (`org:admin`, `org:member`). Experient maps these and extends with five additional roles stored in `org_roles`:

| Role ID | Display Name | Clerk Mapping | Description |
|---------|-------------|---------------|-------------|
| `org:super_admin` | Super Admin | n/a (Experient-only) | Full control: user management, billing, all surveys, all settings. Cannot be removed from org by admins — only by another super admin or billing owner. |
| `org:admin` | Admin | `org:admin` | Manage users, invite members, manage all surveys, configure integrations. Cannot modify billing. |
| `org:program_admin` | Program Admin | `org:member` (elevated) | Manage survey programs they own or are assigned to. View org-level analytics for their programs. Cannot manage other users. |
| `org:analyst` | Analyst | `org:member` (elevated) | Read all surveys and insights within their scope. Export response data. Cannot create or edit surveys. Cannot manage users. |
| `org:survey_creator` | Survey Creator | `org:member` (elevated) | Create and edit their own surveys. View responses and insights for surveys they own. Cannot access other users' surveys unless explicitly shared. |
| `org:report_viewer` | Report Viewer | `org:member` (elevated) | Read-only access to dashboards and reports they have been explicitly shared with. Cannot see responses or raw data. |
| `org:member` | Member | `org:member` | Fill out surveys they are distributed to. View their own responses. No access to org surveys or insights. |

**Role hierarchy (for `requireRole` compatibility):**

```javascript
const ROLE_RANK = {
  'org:super_admin':   7,
  'org:admin':         6,
  'org:program_admin': 5,
  'org:analyst':       4,
  'org:survey_creator':3,
  'org:report_viewer': 2,
  'org:member':        1,
};
```

**Built-in role default permissions matrix:**

| Permission | super_admin | admin | program_admin | analyst | survey_creator | report_viewer | member |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `survey:read` | ALL | ALL | OWNED | ALL | OWNED | SHARED | NONE |
| `survey:write` | ALL | ALL | OWNED | NONE | OWNED | NONE | NONE |
| `survey:distribute` | ALL | ALL | OWNED | NONE | OWNED | NONE | NONE |
| `survey:insights:read` | ALL | ALL | OWNED | ALL | OWNED | SHARED | NONE |
| `survey:insights:generate` | ALL | ALL | OWNED | ALL | OWNED | NONE | NONE |
| `survey:responses:export` | ALL | ALL | OWNED | ALL | NONE | NONE | NONE |
| `survey:delete` | ALL | ALL | OWNED | NONE | OWNED | NONE | NONE |
| `dashboard:read` | ALL | ALL | ALL | ALL | OWN | SHARED | NONE |
| `alerts:manage` | ALL | ALL | OWNED | NONE | OWNED | NONE | NONE |
| `workflows:manage` | ALL | ALL | ALL | NONE | NONE | NONE | NONE |
| `users:manage` | ALL | ALL | NONE | NONE | NONE | NONE | NONE |
| `billing:manage` | ALL | NONE | NONE | NONE | NONE | NONE | NONE |

Key:
- `ALL` = access to all resources of this type in the org
- `OWNED` = access only to resources this user created or is assigned as owner
- `SHARED` = access only when explicitly shared with this user or their group
- `OWN` = access to their own data only
- `NONE` = no access (403)

### Layer 2 — Resource-Level Permissions

Resource-level permissions override the org-role defaults for specific resources. Stored in `user_resource_permissions`.

**Permission action catalog:**

```javascript
const PERMISSIONS = {
  // Survey-level
  'survey:read':                'View survey questions, settings, and response summary',
  'survey:write':               'Edit survey questions, title, and settings',
  'survey:distribute':          'Send surveys to respondents, manage distribution lists',
  'survey:insights:read':       'View Crystal AI insights and analysis',
  'survey:insights:generate':   'Trigger Crystal insight generation pipeline',
  'survey:responses:export':    'Download raw response data as CSV/JSON',
  'survey:delete':              'Archive or permanently delete a survey',
  // Dashboard & reporting
  'dashboard:read':             'View dashboards and saved reports',
  // Workflow automation
  'alerts:manage':              'Create and configure alert rules',
  'workflows:manage':           'Create and edit automation workflows',
  // Administration
  'users:manage':               'Invite, remove, and manage org members',
  'billing:manage':             'View billing, manage subscription, upgrade plan',
};
```

**Resource types:**

```javascript
const RESOURCE_TYPES = ['survey', 'dashboard', 'workflow', 'org'];
```

### Permission Evaluation Algorithm

The `hasPermission(userId, orgId, resourceType, resourceId, action)` function evaluates in strict priority order:

```
Step 1: Is user org:super_admin?
        → YES: ALLOW (unconditional bypass)
        → NO: continue

Step 2: Is user's is_active = false or deprovisioned_at IS NOT NULL?
        → YES: DENY (deprovisioned users have zero access)
        → NO: continue

Step 3: Load user's org-level role from user_profiles.role_id → org_roles
        Check: does this role's default_permissions JSONB contain an ALLOW for
               (resourceType, action)?
        Scope check: ALL → allow; OWNED → only if resource.created_by = userId;
                     SHARED → only if resource-level grant exists; NONE → DENY

Step 4: Load resource-level overrides from user_resource_permissions
        WHERE user_id = userId AND resource_type = resourceType
              AND resource_id = resourceId AND action = action
        If explicit ALLOW override exists → ALLOW
        If explicit DENY override exists → DENY (deny overrides role default)

Step 5: Load groups the user belongs to (user_group_members)
        For each group, check group_resource_permissions for this resource + action
        If any group has ALLOW → ALLOW
        If any group has DENY → DENY

Step 6: No explicit allow found → DENY (default-deny)
```

**Redis caching:** Permission decisions are cached at key `perm:{userId}:{resourceType}:{resourceId}:{action}` with a 5-minute TTL. Cache is invalidated on any role change, permission grant/revoke, or group membership change for this user.

### Custom Role Creation (Enterprise Feature)

Enterprise plan orgs can create custom roles with exactly the permissions they need. Example: "HR Team Lead" = `survey:create + survey:read + insights:read` but NOT `survey:responses:export`.

**Custom role schema** (stored in `org_roles` with `is_builtin = false`):

```json
{
  "id": "uuid",
  "org_id": "org_xyz",
  "name": "HR Team Lead",
  "description": "HR team members who run engagement surveys",
  "is_builtin": false,
  "default_permissions": {
    "survey:read": "ALL",
    "survey:write": "OWNED",
    "survey:distribute": "OWNED",
    "survey:insights:read": "OWNED",
    "survey:insights:generate": "OWNED",
    "survey:responses:export": "NONE",
    "survey:delete": "OWNED",
    "dashboard:read": "OWNED",
    "alerts:manage": "NONE",
    "workflows:manage": "NONE",
    "users:manage": "NONE",
    "billing:manage": "NONE"
  },
  "seat_weight": 1.0,
  "created_by": "user_abc",
  "created_at": "2026-06-03T00:00:00Z"
}
```

Custom roles inherit from `org:member` at the Clerk level (so SSO and session tokens remain valid) and Experient's RBAC engine applies the custom permissions.

---

## 3. Extended User Profile Schema

**James Whitfield + Chen Wei**

### The Core Problem

Clerk's `publicMetadata` is a free-form JSON blob with an 8KB limit, no indexing, no foreign-key relationships, and no searchability. It is adequate for storing a handful of flags per user. It is completely inadequate for an enterprise organization that needs to:

- Search users by department
- Filter the member directory by manager
- Run Crystal analysis segmented by cost center
- Sync 50,000 users from Okta with structured attribute mapping
- Query "all users in the West Coast region whose role is Analyst"

All enterprise user attributes live in Postgres. Clerk remains the source of truth for identity (authentication); Postgres is the source of truth for profile data and authorization.

### Core Tables

#### `user_profiles` — The Central Table

```sql
-- Migration: 20260603000010_user_directory_core.sql

CREATE TABLE user_profiles (
  -- Identity (Clerk IDs — TEXT, matching existing pattern in surveys, responses, etc.)
  user_id              TEXT        PRIMARY KEY,   -- Clerk user ID (e.g., user_2abc...)
  org_id               TEXT        NOT NULL,      -- Clerk org ID (e.g., org_2xyz...)

  -- Basic profile (our source for rich queries — mirrored from Clerk on sync)
  email                TEXT        NOT NULL,
  first_name           TEXT,
  last_name            TEXT,
  display_name         TEXT,        -- computed: first_name || ' ' || last_name, or override
  avatar_url           TEXT,
  phone                TEXT,        -- optional, for SMS survey distribution

  -- Enterprise identity attributes
  employee_id          TEXT,        -- HR system employee ID (SCIM externalId in HR context)
  job_title            TEXT,
  department_id        UUID        REFERENCES departments(id) ON DELETE SET NULL,
  manager_user_id      TEXT,        -- Clerk user ID of direct manager (self-ref via TEXT)
  cost_center          TEXT,        -- e.g., "CC-1234" or "Engineering-West"
  location             TEXT,        -- "New York, NY" or office code "NYC-HQ"
  timezone             VARCHAR(64)  NOT NULL DEFAULT 'UTC',
  locale               VARCHAR(16)  NOT NULL DEFAULT 'en',

  -- Experient-specific authorization
  role_id              UUID        REFERENCES org_roles(id) ON DELETE SET NULL,
  -- NULL role_id = falls back to org:member default permissions

  -- Status
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  last_seen_at         TIMESTAMPTZ,

  -- XM-specific context (used by Crystal for survey targeting and segmentation)
  custom_attributes    JSONB       NOT NULL DEFAULT '{}',  -- org-defined custom fields
  survey_segments      TEXT[]      NOT NULL DEFAULT '{}',  -- segment tags for Crystal targeting

  -- Provisioning metadata
  provisioned_by       TEXT        CHECK (provisioned_by IN ('scim','invite','sso','manual','import')),
  scim_external_id     TEXT,        -- Okta/Azure AD's stable ID for this user
  scim_provisioner_id  UUID        REFERENCES scim_tokens(id) ON DELETE SET NULL,

  -- Timestamps
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprovisioned_at     TIMESTAMPTZ,  -- set on SCIM deprovision or manual removal

  -- Constraints
  CONSTRAINT uq_org_email            UNIQUE (org_id, email),
  CONSTRAINT uq_org_employee_id      UNIQUE (org_id, employee_id)
             NULLS NOT DISTINCT        -- partial unique: allows multiple NULLs
             DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT uq_org_scim_external_id UNIQUE (org_id, scim_external_id)
             NULLS NOT DISTINCT
             DEFERRABLE INITIALLY DEFERRED
);

-- Indexes for common query patterns
CREATE INDEX idx_user_profiles_org_id          ON user_profiles(org_id);
CREATE INDEX idx_user_profiles_org_active       ON user_profiles(org_id, is_active)
             WHERE is_active = TRUE;
CREATE INDEX idx_user_profiles_department       ON user_profiles(department_id);
CREATE INDEX idx_user_profiles_role_id          ON user_profiles(role_id);
CREATE INDEX idx_user_profiles_scim_external    ON user_profiles(org_id, scim_external_id)
             WHERE scim_external_id IS NOT NULL;
CREATE INDEX idx_user_profiles_custom_attrs     ON user_profiles USING GIN (custom_attributes);
CREATE INDEX idx_user_profiles_segments         ON user_profiles USING GIN (survey_segments);
CREATE INDEX idx_user_profiles_search           ON user_profiles
             USING GIN (to_tsvector('english', COALESCE(display_name,'') || ' ' || email));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### `departments` — Org Hierarchy

```sql
CREATE TABLE departments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  description          TEXT,
  parent_department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
  head_user_id         TEXT,        -- Clerk user ID of department head
  depth                INT         NOT NULL DEFAULT 0,  -- cached depth from root (0 = root)
  path                 TEXT[],     -- cached path array for efficient subtree queries
                                   -- e.g., ['engineering', 'platform', 'backend']
  color                VARCHAR(16), -- UI color for org chart display
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order           INT         NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_dept_name_per_parent UNIQUE (org_id, parent_department_id, name),
  CONSTRAINT no_self_parent CHECK (id != parent_department_id)
);

CREATE INDEX idx_departments_org_id       ON departments(org_id);
CREATE INDEX idx_departments_parent       ON departments(parent_department_id);
CREATE INDEX idx_departments_path         ON departments USING GIN (path);
CREATE INDEX idx_departments_active       ON departments(org_id, is_active)
             WHERE is_active = TRUE;

-- Function to compute path[] when a department is inserted/moved
CREATE OR REPLACE FUNCTION compute_department_path(dept_id UUID)
RETURNS TEXT[] LANGUAGE plpgsql AS $$
DECLARE
  result TEXT[] := '{}';
  curr_id UUID := dept_id;
  curr_name TEXT;
  parent_id UUID;
BEGIN
  LOOP
    SELECT name, parent_department_id INTO curr_name, parent_id
    FROM departments WHERE id = curr_id;
    IF NOT FOUND THEN EXIT; END IF;
    result := array_prepend(curr_id::TEXT, result);
    EXIT WHEN parent_id IS NULL;
    curr_id := parent_id;
  END LOOP;
  RETURN result;
END; $$;

CREATE TRIGGER trg_departments_path
  BEFORE INSERT OR UPDATE OF parent_department_id ON departments
  FOR EACH ROW EXECUTE FUNCTION compute_department_path_trigger();
```

#### `org_roles` — Custom Role Definitions

```sql
CREATE TABLE org_roles (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  description          TEXT,
  is_builtin           BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Built-in roles: super_admin, admin, program_admin, analyst, survey_creator,
  --                 report_viewer, member
  builtin_key          TEXT,       -- e.g., 'org:analyst' for builtin roles
  default_permissions  JSONB       NOT NULL DEFAULT '{}',
  -- Format: { "survey:read": "ALL", "survey:write": "OWNED", ... }
  seat_weight          NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  -- 0=free (member/respondent), 0.5=viewer, 1.0=full seat
  color                VARCHAR(16), -- badge color in UI
  created_by           TEXT,       -- Clerk user ID
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_role_name_per_org  UNIQUE (org_id, name),
  CONSTRAINT uq_builtin_key_per_org UNIQUE (org_id, builtin_key)
             NULLS NOT DISTINCT
);

CREATE INDEX idx_org_roles_org_id    ON org_roles(org_id);
CREATE INDEX idx_org_roles_builtin   ON org_roles(org_id, is_builtin);

-- Seed built-in roles for each org on creation (done via application code,
-- not a migration, since org_id is dynamic)
```

#### `user_resource_permissions` — Resource-Level Overrides

```sql
CREATE TABLE user_resource_permissions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  user_id              TEXT        NOT NULL,   -- Clerk user ID
  resource_type        TEXT        NOT NULL,   -- 'survey', 'dashboard', 'workflow'
  resource_id          TEXT        NOT NULL,   -- UUID of the resource (as TEXT for flexibility)
  action               TEXT        NOT NULL,   -- 'survey:read', 'survey:insights:read', etc.
  effect               TEXT        NOT NULL DEFAULT 'allow'
                       CHECK (effect IN ('allow', 'deny')),
  granted_by           TEXT,                   -- Clerk user ID of granter
  granted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ,            -- optional expiry for time-limited access

  CONSTRAINT uq_user_resource_permission
    UNIQUE (org_id, user_id, resource_type, resource_id, action)
);

CREATE INDEX idx_urp_user_id        ON user_resource_permissions(user_id, org_id);
CREATE INDEX idx_urp_resource       ON user_resource_permissions(resource_type, resource_id);
CREATE INDEX idx_urp_expires        ON user_resource_permissions(expires_at)
             WHERE expires_at IS NOT NULL;
```

#### `user_groups` — Groups for Survey Targeting

```sql
CREATE TABLE user_groups (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  description          TEXT,
  group_type           TEXT        NOT NULL DEFAULT 'static'
                       CHECK (group_type IN ('static', 'dynamic', 'scim_synced')),
  -- For dynamic groups: rule set stored as JSONB
  -- Example: {"operator":"AND","rules":[{"field":"department","op":"eq","value":"Engineering"},
  --           {"field":"location","op":"eq","value":"San Francisco"}]}
  dynamic_rules        JSONB,
  -- For SCIM-synced groups: external group ID from IdP
  scim_external_id     TEXT,
  scim_provisioner_id  UUID        REFERENCES scim_tokens(id) ON DELETE SET NULL,
  -- Member count (denormalized cache, updated by trigger)
  member_count         INT         NOT NULL DEFAULT 0,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_group_name_per_org  UNIQUE (org_id, name),
  CONSTRAINT uq_scim_group_per_org  UNIQUE (org_id, scim_external_id)
             NULLS NOT DISTINCT
);

CREATE INDEX idx_user_groups_org_id    ON user_groups(org_id);
CREATE INDEX idx_user_groups_type      ON user_groups(org_id, group_type);
CREATE INDEX idx_user_groups_scim      ON user_groups(org_id, scim_external_id)
             WHERE scim_external_id IS NOT NULL;
```

#### `user_group_members` — Junction Table

```sql
CREATE TABLE user_group_members (
  group_id             UUID        NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id              TEXT        NOT NULL,   -- Clerk user ID
  org_id               TEXT        NOT NULL,
  added_by             TEXT,                   -- Clerk user ID of who added (NULL for SCIM)
  added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_ugm_user_id   ON user_group_members(user_id, org_id);
CREATE INDEX idx_ugm_group_id  ON user_group_members(group_id);

-- Maintain member_count
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
```

#### `org_custom_fields` — Org-Defined Custom Attributes

```sql
CREATE TABLE org_custom_fields (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  field_key            TEXT        NOT NULL,   -- e.g., 'business_unit', 'region'
  display_name         TEXT        NOT NULL,   -- e.g., 'Business Unit', 'Region'
  field_type           TEXT        NOT NULL DEFAULT 'text'
                       CHECK (field_type IN ('text','number','boolean','select','date')),
  options              JSONB,                  -- for 'select' type: ["APAC","EMEA","AMER"]
  is_required          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_scim_mapped       BOOLEAN     NOT NULL DEFAULT FALSE,
  scim_attribute_name  TEXT,                   -- e.g., 'urn:ietf:params:scim:...costCenter'
  is_searchable        BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order           INT         NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_custom_field_key UNIQUE (org_id, field_key)
);

CREATE INDEX idx_ocf_org_id ON org_custom_fields(org_id);
```

#### `user_audit_log` — Immutable Audit Trail

```sql
-- Append-only. No UPDATE or DELETE. Revoke UPDATE/DELETE at DB user level for compliance.
CREATE TABLE user_audit_log (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,

  -- Who performed the action
  actor_user_id        TEXT,        -- NULL for system/SCIM actions
  actor_type           TEXT        NOT NULL DEFAULT 'user'
                       CHECK (actor_type IN ('user','scim','system','clerk_webhook')),

  -- Who/what was affected
  target_user_id       TEXT,
  target_resource_type TEXT,        -- 'user','role','survey','group','scim_token'
  target_resource_id   TEXT,

  -- What happened
  event_type           TEXT        NOT NULL,
  -- Enum: user.created, user.invited, user.role_changed, user.deprovisioned,
  --       user.reactivated, user.login, user.login_failed, user.session_revoked,
  --       survey.response_exported, survey.accessed,
  --       scim.user_provisioned, scim.user_deprovisioned, scim.user_updated,
  --       scim.group_synced, role.created, role.updated, role.deleted,
  --       permission.granted, permission.revoked, group.created, group.member_added,
  --       group.member_removed, scim_token.created, scim_token.revoked

  -- State diff (for compliance review)
  before_state         JSONB,
  after_state          JSONB,

  -- Request context
  ip_address           INET,
  user_agent           TEXT,
  request_id           TEXT,        -- correlation ID for log linking

  -- Immutable timestamp
  occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- No updated_at — this table is append-only
  CONSTRAINT no_future_events CHECK (occurred_at <= NOW() + INTERVAL '1 minute')
);

-- Revoke UPDATE/DELETE on this table from application DB user:
-- REVOKE UPDATE, DELETE ON user_audit_log FROM experient_app;

CREATE INDEX idx_ual_org_id         ON user_audit_log(org_id, occurred_at DESC);
CREATE INDEX idx_ual_actor          ON user_audit_log(actor_user_id, occurred_at DESC);
CREATE INDEX idx_ual_target_user    ON user_audit_log(target_user_id, occurred_at DESC);
CREATE INDEX idx_ual_event_type     ON user_audit_log(org_id, event_type, occurred_at DESC);
CREATE INDEX idx_ual_resource       ON user_audit_log(target_resource_type, target_resource_id);

-- Retention: implement as a pg_cron job or scheduled Lambda
-- Starter: 30-day retention (DELETE WHERE occurred_at < NOW() - INTERVAL '30 days')
-- Growth: 90-day retention
-- Enterprise: 1-year retention (NEVER delete, archive to cold storage after 1 year)
```

#### `scim_tokens` — SCIM Provisioner Credentials

```sql
CREATE TABLE scim_tokens (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  name                 TEXT        NOT NULL,   -- e.g., 'Okta Production', 'Azure AD Sync'
  token_hash           TEXT        NOT NULL,   -- bcrypt hash (never store plaintext)
  token_prefix         VARCHAR(8)  NOT NULL,   -- first 8 chars for identification (e.g., 'esc_abc1')
  provider             TEXT,                   -- 'okta', 'azure_ad', 'google_workspace', 'onelogin', 'other'
  scim_endpoint_url    TEXT,                   -- the URL we gave to this provisioner (for reference)
  last_used_at         TIMESTAMPTZ,
  last_sync_at         TIMESTAMPTZ,
  sync_stats           JSONB       DEFAULT '{}',
  -- {"users_created":150,"users_updated":23,"users_deprovisioned":5,"errors":0}
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by           TEXT,                   -- Clerk user ID of admin who created it
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at           TIMESTAMPTZ,
  revoked_by           TEXT,

  CONSTRAINT uq_scim_token_name UNIQUE (org_id, name)
);

CREATE INDEX idx_scim_tokens_org_id ON scim_tokens(org_id, is_active);
```

#### `seat_usage` — Billable Seat Tracking

```sql
CREATE TABLE seat_usage (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  user_id              TEXT        NOT NULL,
  role_id              UUID        REFERENCES org_roles(id) ON DELETE SET NULL,
  seat_weight          NUMERIC(3,1) NOT NULL,  -- matches org_roles.seat_weight
  period_start         DATE        NOT NULL,   -- billing period start
  period_end           DATE,                   -- NULL = current period
  is_current           BOOLEAN     NOT NULL DEFAULT TRUE,
  snapshot_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_seat_current UNIQUE (org_id, user_id, is_current)
             NULLS NOT DISTINCT
);

CREATE INDEX idx_seat_usage_org_id  ON seat_usage(org_id, is_current) WHERE is_current = TRUE;
CREATE INDEX idx_seat_usage_period  ON seat_usage(org_id, period_start);
```

---

## 4. SCIM 2.0 Provisioning Endpoint

**James Whitfield + Priya Nair**

### Why SCIM is a Deal-Blocker

Patricia Holloway represents every enterprise IT Director. When procurement asks "do you support SCIM?", the answer cannot be "no." SCIM (System for Cross-domain Identity Management, RFC 7644) is the industry standard for automatic user lifecycle management. Without it:

- IT teams manually provision and deprovision users in every tool
- When an employee is terminated, their access persists until someone remembers to remove it
- SOC 2 auditors flag manual deprovisioning as a control gap
- Enterprise deals stall in security review

### SCIM Endpoint Architecture

SCIM uses separate authentication from the rest of the API. The SCIM endpoint uses Bearer tokens from `scim_tokens`, NOT Clerk JWTs. This is because SCIM requests come from Okta/Azure AD server processes, not from user browsers.

```
Okta/Azure AD                    Experient Backend
     │                                │
     │  Bearer esc_abc123...          │
     ├──POST /scim/v2/Users──────────►│  scimAuth middleware
     │                                │  ├── hash Bearer token
     │                                │  ├── lookup in scim_tokens
     │                                │  └── extract org_id, provisioner_id
     │                                │
     │                                │  scimUsersRouter
     │                                │  ├── validate SCIM payload
     │                                │  ├── upsert user_profiles
     │                                │  ├── call Clerk Admin API
     │                                │  └── emit audit log event
     │                                │
     │  201 Created + SCIM User       │
     │◄───────────────────────────────┤
```

### Endpoint Catalog

Mounted in `backend/src/routes/scim.js`, registered at `/scim/v2` in `src/index.js` (separate from `/api`).

```
# Discovery
GET    /scim/v2/ServiceProviderConfig    -- capabilities doc (Okta reads on setup)
GET    /scim/v2/Schemas                  -- attribute schema we support

# Users
GET    /scim/v2/Users                    -- list users (paginated, filterable)
POST   /scim/v2/Users                    -- provision new user
GET    /scim/v2/Users/:scimId            -- get user by Experient SCIM ID
PUT    /scim/v2/Users/:scimId            -- full replace
PATCH  /scim/v2/Users/:scimId           -- partial update (most common)
DELETE /scim/v2/Users/:scimId            -- deprovision (rarely used; Okta prefers PATCH active=false)

# Groups
GET    /scim/v2/Groups                   -- list groups
POST   /scim/v2/Groups                   -- create group
GET    /scim/v2/Groups/:id               -- get group
PUT    /scim/v2/Groups/:id               -- full group update (add/remove members)
DELETE /scim/v2/Groups/:id               -- delete group
```

### SCIM Attribute Mapping

| SCIM Attribute | Experient Field | Notes |
|---|---|---|
| `id` | `user_profiles.user_id` | Our Clerk user ID is the SCIM id |
| `externalId` | `user_profiles.scim_external_id` | Okta's stable ID for this user |
| `userName` | `user_profiles.email` | Used as login identifier |
| `name.givenName` | `user_profiles.first_name` | |
| `name.familyName` | `user_profiles.last_name` | |
| `displayName` | `user_profiles.display_name` | |
| `active` | `user_profiles.is_active` | false triggers deprovision flow |
| `title` | `user_profiles.job_title` | |
| `department` | resolved to `user_profiles.department_id` | Looks up or creates department |
| `costCenter` | `user_profiles.cost_center` | |
| `userType` | mapped to `user_profiles.role_id` | Configurable in attribute mapping UI |
| `locale` | `user_profiles.locale` | |
| `timezone` | `user_profiles.timezone` | |
| `emails[0].value` | `user_profiles.email` | Primary email |
| `phoneNumbers[0].value` | `user_profiles.phone` | |
| `photos[0].value` | `user_profiles.avatar_url` | |
| Custom extension | `user_profiles.custom_attributes` | See below |

**Custom SCIM Extension Schema:**

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:extension:experient:2.0:User"],
  "urn:ietf:params:scim:schemas:extension:experient:2.0:User": {
    "employeeId": "EMP-12345",
    "costCenter": "CC-9876",
    "businessUnit": "Enterprise Sales",
    "region": "APAC",
    "managerId": "EMP-56789"
  }
}
```

### ServiceProviderConfig Response

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
  "documentationUri": "https://docs.experient.ai/scim",
  "patch": { "supported": true },
  "bulk": { "supported": false, "maxOperations": 0, "maxPayloadSize": 0 },
  "filter": { "supported": true, "maxResults": 200 },
  "changePassword": { "supported": false },
  "sort": { "supported": true },
  "etag": { "supported": false },
  "authenticationSchemes": [{
    "type": "oauthbearertoken",
    "name": "Bearer Token",
    "description": "Bearer token generated in Experient Admin Console"
  }]
}
```

### SCIM Authentication Middleware

```javascript
// middleware/scimAuth.js
const bcrypt = require('bcrypt');
const db = require('../lib/db');

async function scimAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Missing or invalid authorization header',
    });
  }

  const token = authHeader.slice(7);
  if (!token || token.length < 20) {
    return res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid token format',
    });
  }

  // Token prefix is first 8 chars — used to find the right row without
  // scanning all token hashes
  const tokenPrefix = token.slice(0, 8);

  try {
    const { rows } = await db.query(
      `SELECT id, org_id, token_hash, is_active
       FROM scim_tokens
       WHERE token_prefix = $1 AND is_active = TRUE`,
      [tokenPrefix]
    );

    if (!rows.length) {
      return res.status(401).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '401',
        detail: 'Token not found or revoked',
      });
    }

    const tokenRow = rows[0];
    const valid = await bcrypt.compare(token, tokenRow.token_hash);
    if (!valid) {
      return res.status(401).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '401',
        detail: 'Invalid token',
      });
    }

    // Attach SCIM context to request
    req.scimOrgId = tokenRow.org_id;
    req.scimTokenId = tokenRow.id;

    // Update last_used_at asynchronously (don't block the request)
    db.query('UPDATE scim_tokens SET last_used_at = NOW() WHERE id = $1', [tokenRow.id])
      .catch(() => {});

    next();
  } catch (err) {
    console.error('SCIM auth error:', err.message);
    res.status(500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Internal server error',
    });
  }
}

module.exports = { scimAuth };
```

### POST /scim/v2/Users — Provision New User

```javascript
// routes/scim.js (partial — Users router)

const { createClerkClient } = require('@clerk/backend');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../lib/db');
const { auditLog } = require('../lib/auditLog');

// Helper: map SCIM user payload → user_profiles columns
function scimToProfile(scimUser, orgId, scimTokenId) {
  const primaryEmail = (scimUser.emails || []).find(e => e.primary)?.value
    || scimUser.userName;

  return {
    email:            primaryEmail,
    first_name:       scimUser.name?.givenName || null,
    last_name:        scimUser.name?.familyName || null,
    display_name:     scimUser.displayName
                        || [scimUser.name?.givenName, scimUser.name?.familyName]
                           .filter(Boolean).join(' ')
                        || primaryEmail,
    avatar_url:       (scimUser.photos || []).find(p => p.primary)?.value || null,
    phone:            (scimUser.phoneNumbers || []).find(p => p.primary)?.value || null,
    job_title:        scimUser.title || null,
    cost_center:      scimUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']
                        ?.costCenter || null,
    locale:           scimUser.locale || 'en',
    timezone:         scimUser.timezone || 'UTC',
    is_active:        scimUser.active !== false,  // default to true if not specified
    provisioned_by:   'scim',
    scim_external_id: scimUser.externalId || null,
    scim_provisioner_id: scimTokenId,
    custom_attributes: extractCustomAttributes(scimUser),
  };
}

function extractCustomAttributes(scimUser) {
  const ext = scimUser['urn:ietf:params:scim:schemas:extension:experient:2.0:User'] || {};
  return Object.keys(ext).length ? ext : {};
}

// POST /scim/v2/Users
router.post('/Users', scimAuth, async (req, res) => {
  const scimUser = req.body;
  const orgId = req.scimOrgId;
  const tokenId = req.scimTokenId;

  // Validate required fields
  if (!scimUser.userName) {
    return res.status(400).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '400',
      scimType: 'invalidValue',
      detail: 'userName is required',
    });
  }

  const client = db.pool.connect ? await db.pool.connect() : null;

  try {
    // Begin transaction
    await db.query('BEGIN');

    const profile = scimToProfile(scimUser, orgId, tokenId);

    // 1. Check seat limit before provisioning
    const seatCheck = await checkSeatLimit(orgId);
    if (!seatCheck.allowed) {
      await db.query('ROLLBACK');
      return res.status(409).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '409',
        scimType: 'uniqueness',
        detail: `Seat limit reached. Plan allows ${seatCheck.limit} seats. ` +
                `Current usage: ${seatCheck.current}. ` +
                'Upgrade your plan or contact billing@experient.ai',
      });
    }

    // 2. Check if user already exists (idempotent provisioning)
    const { rows: existing } = await db.query(
      'SELECT user_id FROM user_profiles WHERE org_id = $1 AND email = $2',
      [orgId, profile.email]
    );

    let clerkUserId;

    if (existing.length > 0) {
      // Idempotent: update and return existing
      clerkUserId = existing[0].user_id;
    } else {
      // 3. Create user in Clerk
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

      let clerkUser;
      try {
        // Try to find existing Clerk user by email first
        const clerkUsers = await clerk.users.getUserList({ emailAddress: [profile.email] });
        if (clerkUsers.data.length > 0) {
          clerkUser = clerkUsers.data[0];
        } else {
          // Create new Clerk user
          clerkUser = await clerk.users.createUser({
            emailAddress: [profile.email],
            firstName: profile.first_name || undefined,
            lastName: profile.last_name || undefined,
            // SCIM-provisioned users get a random password they cannot use directly
            // (they must SSO). This prevents password login for SCIM-managed users.
            password: crypto.randomBytes(32).toString('hex'),
            skipPasswordChecks: true,
          });
        }
      } catch (clerkErr) {
        await db.query('ROLLBACK');
        return res.status(500).json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: '500',
          detail: `Failed to create Clerk user: ${clerkErr.message}`,
        });
      }

      clerkUserId = clerkUser.id;

      // 4. Add Clerk user to org
      try {
        await clerk.organizations.createOrganizationMembership({
          organizationId: orgId,
          userId: clerkUserId,
          role: 'org:member',  // SCIM provisions at base role; Experient RBAC handles elevation
        });
      } catch (memberErr) {
        // Non-fatal if already a member
        if (!memberErr.message?.includes('already')) {
          await db.query('ROLLBACK');
          return res.status(500).json({
            schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
            status: '500',
            detail: `Failed to add user to org: ${memberErr.message}`,
          });
        }
      }
    }

    // 5. Resolve department if provided
    let departmentId = null;
    if (scimUser.department) {
      departmentId = await resolveOrCreateDepartment(orgId, scimUser.department);
    }

    // 6. Resolve role if userType is mapped
    const roleId = await resolveScimRole(orgId, scimUser.userType);

    // 7. Upsert user_profiles row
    const { rows: [profileRow] } = await db.query(
      `INSERT INTO user_profiles (
         user_id, org_id, email, first_name, last_name, display_name, avatar_url,
         phone, job_title, department_id, cost_center, locale, timezone,
         is_active, provisioned_by, scim_external_id, scim_provisioner_id,
         role_id, custom_attributes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (org_id, email) DO UPDATE SET
         first_name        = EXCLUDED.first_name,
         last_name         = EXCLUDED.last_name,
         display_name      = EXCLUDED.display_name,
         job_title         = EXCLUDED.job_title,
         department_id     = EXCLUDED.department_id,
         cost_center       = EXCLUDED.cost_center,
         locale            = EXCLUDED.locale,
         timezone          = EXCLUDED.timezone,
         is_active         = EXCLUDED.is_active,
         scim_external_id  = EXCLUDED.scim_external_id,
         custom_attributes = EXCLUDED.custom_attributes,
         updated_at        = NOW()
       RETURNING *`,
      [
        clerkUserId, orgId,
        profile.email, profile.first_name, profile.last_name, profile.display_name,
        profile.avatar_url, profile.phone, profile.job_title, departmentId,
        profile.cost_center, profile.locale, profile.timezone, profile.is_active,
        profile.provisioned_by, profile.scim_external_id, tokenId, roleId,
        JSON.stringify(profile.custom_attributes),
      ]
    );

    // 8. Audit log
    await auditLog({
      orgId,
      actorType: 'scim',
      targetUserId: clerkUserId,
      targetResourceType: 'user',
      targetResourceId: clerkUserId,
      eventType: 'scim.user_provisioned',
      afterState: { email: profile.email, role_id: roleId, department_id: departmentId },
      ipAddress: req.ip,
    });

    await db.query('COMMIT');

    // 9. Return SCIM User response
    res.status(201).json(buildScimUserResponse(profileRow, req));

  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('SCIM POST /Users error:', err);
    res.status(500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Internal server error during user provisioning',
    });
  }
});
```

### PATCH /scim/v2/Users/:id — Partial Update

```javascript
// PATCH /scim/v2/Users/:id
// Most common SCIM operation: Okta sends this for every attribute change
// and for deprovisioning (active: false)
router.patch('/Users/:id', scimAuth, async (req, res) => {
  const { id: scimId } = req.params;
  const orgId = req.scimOrgId;
  const operations = req.body.Operations || [];

  if (!Array.isArray(operations) || operations.length === 0) {
    return res.status(400).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '400',
      detail: 'Operations array is required for PATCH',
    });
  }

  try {
    // Look up user by SCIM ID (which is our Clerk user_id)
    const { rows } = await db.query(
      `SELECT up.*, or2.builtin_key as role_key
       FROM user_profiles up
       LEFT JOIN org_roles or2 ON or2.id = up.role_id
       WHERE up.user_id = $1 AND up.org_id = $2`,
      [scimId, orgId]
    );

    if (!rows.length) {
      return res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: `User ${scimId} not found`,
      });
    }

    const currentProfile = rows[0];
    const updates = {};
    const beforeState = { ...currentProfile };
    let isDeprovisioning = false;

    // Process each SCIM PATCH operation
    for (const op of operations) {
      const operation = op.op?.toLowerCase();
      const path = op.path;
      const value = op.value;

      if (operation === 'replace' || operation === 'add') {
        if (path === 'active' || (typeof value === 'object' && 'active' in value)) {
          const activeValue = path === 'active' ? value : value.active;
          updates.is_active = activeValue === true || activeValue === 'true';
          if (!updates.is_active) isDeprovisioning = true;
        }
        if (path === 'name.givenName') updates.first_name = value;
        if (path === 'name.familyName') updates.last_name = value;
        if (path === 'title') updates.job_title = value;
        if (path === 'locale') updates.locale = value;
        if (path === 'timezone') updates.timezone = value;
        if (path === 'department') {
          updates.department_id = await resolveOrCreateDepartment(orgId, value);
        }
        if (path === 'costCenter' || path === 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:costCenter') {
          updates.cost_center = value;
        }
        // Handle object-form operations (when path is null, value is an object)
        if (!path && typeof value === 'object') {
          if (value['name.givenName'] !== undefined) updates.first_name = value['name.givenName'];
          if (value['name.familyName'] !== undefined) updates.last_name = value['name.familyName'];
          if (value.title !== undefined) updates.job_title = value.title;
          if (value.active !== undefined) {
            updates.is_active = value.active === true || value.active === 'true';
            if (!updates.is_active) isDeprovisioning = true;
          }
          if (value.locale !== undefined) updates.locale = value.locale;
          if (value.timezone !== undefined) updates.timezone = value.timezone;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      // No changes to apply — return current state (idempotent)
      return res.json(buildScimUserResponse(currentProfile, req));
    }

    // Recompute display_name if name changed
    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      const fn = updates.first_name ?? currentProfile.first_name;
      const ln = updates.last_name ?? currentProfile.last_name;
      updates.display_name = [fn, ln].filter(Boolean).join(' ') || currentProfile.email;
    }

    await db.query('BEGIN');

    // Build SET clause dynamically (safe parameterized query)
    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`${col} = $${paramIdx++}`);
      values.push(val);
    }

    // Handle deprovision-specific fields
    if (isDeprovisioning) {
      setClauses.push(`deprovisioned_at = $${paramIdx++}`);
      values.push(new Date().toISOString());
    }

    values.push(scimId, orgId);
    const { rows: [updated] } = await db.query(
      `UPDATE user_profiles
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE user_id = $${paramIdx++} AND org_id = $${paramIdx}
       RETURNING *`,
      values
    );

    if (isDeprovisioning) {
      // Remove from Clerk org + revoke sessions
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

      try {
        // Revoke all active sessions
        const sessions = await clerk.sessions.getSessionList({ userId: scimId });
        await Promise.all(
          sessions.data.map(s => clerk.sessions.revokeSession(s.id))
        );

        // Remove from Clerk org membership
        await clerk.organizations.deleteOrganizationMembership({
          organizationId: orgId,
          userId: scimId,
        });
      } catch (clerkErr) {
        // Log but don't fail — user is deprovisioned in our DB regardless
        console.error('SCIM deprovision Clerk cleanup error:', clerkErr.message);
      }

      await auditLog({
        orgId,
        actorType: 'scim',
        targetUserId: scimId,
        targetResourceType: 'user',
        targetResourceId: scimId,
        eventType: 'scim.user_deprovisioned',
        beforeState,
        afterState: { ...beforeState, ...updates },
        ipAddress: req.ip,
      });
    } else {
      await auditLog({
        orgId,
        actorType: 'scim',
        targetUserId: scimId,
        targetResourceType: 'user',
        targetResourceId: scimId,
        eventType: 'scim.user_updated',
        beforeState,
        afterState: { ...beforeState, ...updates },
        ipAddress: req.ip,
      });
    }

    await db.query('COMMIT');

    res.json(buildScimUserResponse(updated, req));

  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('SCIM PATCH /Users error:', err);
    res.status(500).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Internal server error during user update',
    });
  }
});

// Helper: build SCIM User response object
function buildScimUserResponse(profile, req) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: profile.user_id,
    externalId: profile.scim_external_id,
    userName: profile.email,
    name: {
      givenName: profile.first_name,
      familyName: profile.last_name,
      formatted: profile.display_name,
    },
    displayName: profile.display_name,
    title: profile.job_title,
    locale: profile.locale,
    timezone: profile.timezone,
    active: profile.is_active && !profile.deprovisioned_at,
    emails: [{ value: profile.email, primary: true, type: 'work' }],
    meta: {
      resourceType: 'User',
      created: profile.created_at,
      lastModified: profile.updated_at,
      location: `${baseUrl}/scim/v2/Users/${profile.user_id}`,
    },
  };
}

// Helper: check seat limit
async function checkSeatLimit(orgId) {
  // Get plan limit from org_profiles (we'll add plan_tier + seat_limit columns)
  const { rows: [plan] } = await db.query(
    `SELECT plan_tier, seat_limit FROM org_profiles WHERE org_id = $1`,
    [orgId]
  );

  if (!plan || plan.plan_tier === 'enterprise') {
    return { allowed: true, limit: Infinity, current: 0 };
  }

  const { rows: [usage] } = await db.query(
    `SELECT COALESCE(SUM(or2.seat_weight), 0) as used_seats
     FROM user_profiles up
     JOIN org_roles or2 ON or2.id = up.role_id
     WHERE up.org_id = $1 AND up.is_active = TRUE AND up.deprovisioned_at IS NULL`,
    [orgId]
  );

  const current = parseFloat(usage?.used_seats || 0);
  const limit = plan.seat_limit;
  const gracePeriodLimit = limit * 1.10;  // 10% grace period

  return { allowed: current < gracePeriodLimit, limit, current };
}

// Helper: resolve or create department by name
async function resolveOrCreateDepartment(orgId, departmentName) {
  if (!departmentName) return null;

  const { rows } = await db.query(
    'SELECT id FROM departments WHERE org_id = $1 AND name ILIKE $2 AND is_active = TRUE',
    [orgId, departmentName.trim()]
  );

  if (rows.length > 0) return rows[0].id;

  // Create the department if it doesn't exist (SCIM may send departments not yet in Experient)
  const { rows: [created] } = await db.query(
    `INSERT INTO departments (org_id, name) VALUES ($1, $2)
     ON CONFLICT (org_id, parent_department_id, name) DO UPDATE SET is_active = TRUE
     RETURNING id`,
    [orgId, departmentName.trim()]
  );
  return created.id;
}

// Helper: resolve SCIM userType to Experient role
async function resolveScimRole(orgId, userType) {
  if (!userType) return null;

  // Check org's SCIM attribute mapping config
  const { rows } = await db.query(
    `SELECT r.id FROM org_roles r
     JOIN org_custom_fields ocf ON ocf.org_id = r.org_id
     WHERE r.org_id = $1 AND r.name ILIKE $2`,
    [orgId, userType]
  );

  return rows[0]?.id || null;
}
```

### SCIM Provisioning Flow (End-to-End)

```
Step 1:  IT Admin opens Experient → Settings → Users → Provisioning
Step 2:  Clicks "Connect Identity Provider" → selects "Okta"
Step 3:  Clicks "Generate Token"
         Backend: creates scim_tokens row, returns plaintext token ONCE
         Frontend: shows "Copy this token now — it will not be shown again"
Step 4:  IT Admin pastes SCIM URL + token into Okta SCIM provisioning settings
Step 5:  Okta sends GET /scim/v2/Users?count=1 to test connection
Step 6:  Okta runs initial import: GET /scim/v2/Users?startIndex=1&count=100
         Experient returns existing user_profiles as SCIM Users
Step 7:  For each Okta user not in Experient: Okta sends POST /scim/v2/Users
         Experient creates user_profiles + Clerk user + org membership
Step 8:  Daily sync: Okta sends PATCH for any changed attributes
Step 9:  On employee termination: Okta sends PATCH active=false
         Experient: deprovisioned_at = NOW(), removes Clerk membership, revokes sessions
         SLA: within 5 minutes of Okta deprovision event
```

---

## 5. Department & Team Hierarchy

**James Whitfield**

### Data Model

The `departments` table uses an adjacency list with a cached `path` array for efficient subtree queries. This supports unlimited hierarchy depth without recursive CTEs on every query.

```sql
-- Example org structure stored in departments:
-- id   | name              | parent_id | depth | path
-- d001 | Engineering       | NULL      | 0     | [d001]
-- d002 | Platform Team     | d001      | 1     | [d001,d002]
-- d003 | Backend Crew      | d002      | 2     | [d001,d002,d003]
-- d004 | Frontend Crew     | d002      | 2     | [d001,d002,d004]
-- d005 | Mobile Team       | d001      | 1     | [d001,d005]
-- d006 | Customer Success  | NULL      | 0     | [d006]
-- d007 | Enterprise CS     | d006      | 1     | [d006,d007]
```

### API: Get Full Tree

```javascript
// GET /api/departments — returns full tree with user counts
async function getDepartmentTree(orgId) {
  // Single query: all departments + user counts
  const { rows } = await db.query(
    `WITH dept_user_counts AS (
       SELECT department_id, COUNT(*) as direct_count
       FROM user_profiles
       WHERE org_id = $1 AND is_active = TRUE AND deprovisioned_at IS NULL
       GROUP BY department_id
     )
     SELECT
       d.id, d.name, d.description, d.parent_department_id,
       d.head_user_id, d.depth, d.path, d.color, d.sort_order,
       COALESCE(duc.direct_count, 0)::int as direct_member_count,
       up.display_name as head_display_name,
       up.avatar_url as head_avatar_url
     FROM departments d
     LEFT JOIN dept_user_counts duc ON duc.department_id = d.id
     LEFT JOIN user_profiles up ON up.user_id = d.head_user_id AND up.org_id = $1
     WHERE d.org_id = $1 AND d.is_active = TRUE
     ORDER BY d.depth, d.sort_order, d.name`,
    [orgId]
  );

  // Build tree in memory (O(n) — much faster than recursive DB queries)
  const nodeMap = new Map(rows.map(r => [r.id, { ...r, children: [], total_member_count: r.direct_member_count }]));
  const roots = [];

  for (const row of rows) {
    if (row.parent_department_id) {
      const parent = nodeMap.get(row.parent_department_id);
      if (parent) {
        parent.children.push(nodeMap.get(row.id));
      }
    } else {
      roots.push(nodeMap.get(row.id));
    }
  }

  // Compute total_member_count (includes all descendants) bottom-up
  function computeTotals(node) {
    for (const child of node.children) {
      computeTotals(child);
      node.total_member_count += child.total_member_count;
    }
  }
  roots.forEach(computeTotals);

  return roots;
}
```

### Survey Distribution via Department

When distributing a survey to a department, the query includes all users in that department AND all sub-departments:

```sql
-- "Send to Engineering division" (department id = 'd001', path includes 'd001')
SELECT user_id, email, display_name
FROM user_profiles
WHERE org_id = $1
  AND is_active = TRUE
  AND deprovisioned_at IS NULL
  AND department_id IN (
    SELECT id FROM departments
    WHERE org_id = $1 AND path @> ARRAY[$2]::TEXT[]
    -- path @> checks if the path array CONTAINS our department id
    -- This matches Engineering (d001) AND all children (d002, d003, d004, d005)
  );
```

### Crystal Department Context

Crystal uses department hierarchy for automatic segmentation:

```
User asks: "How does Engineering compare to Customer Success?"

Crystal:
1. Calls get_user_directory_context(org_id) → gets department tree
2. Identifies "Engineering" (dept d001) and "Customer Success" (dept d006)
3. Calls segment_users_by_attribute({dept_path: 'd001'}) → [user_ids in Engineering]
4. Calls segment_users_by_attribute({dept_path: 'd006'}) → [user_ids in CS]
5. Queries responses WHERE respondent_id IN (engineering_user_ids)
6. Queries responses WHERE respondent_id IN (cs_user_ids)
7. Generates comparative insight: "Engineering NPS: 42 vs CS NPS: 67 — 25-point gap"
```

---

## 6. User Groups for Survey Targeting

**Raj Patel + Marcus Thompson**

### Group Types

**Static Groups** — Manually curated by admins. IT Admin creates "Q4 Pilot Customers" and adds 200 specific users. Changes require manual admin action. Best for: named cohorts, beta programs, executive surveys.

**Dynamic Groups** — Rule-based, automatically recalculated. When a user's profile changes (department, location, job title), their group membership updates automatically. Best for: "All Sales Engineers in APAC", "All employees hired in Q3 2026".

Dynamic group rule syntax:
```json
{
  "operator": "AND",
  "rules": [
    { "field": "department_name", "op": "contains", "value": "Sales" },
    { "field": "custom_attributes.region", "op": "eq", "value": "APAC" },
    { "field": "is_active", "op": "eq", "value": true }
  ]
}
```

Supported operators: `eq`, `neq`, `contains`, `starts_with`, `gt`, `lt`, `in`, `not_in`

**SCIM-Synced Groups** — Pushed from Okta/Azure AD. When IT creates "Okta Group: Enterprise Survey Participants", Okta sends `POST /scim/v2/Groups` and keeps it in sync. Members are added/removed as employees join or leave the Okta group. Best for: department-based targeting, geographic segments that are already modeled in the IdP.

### Dynamic Group Evaluation

Dynamic groups are materialized asynchronously — the `user_group_members` table is the materialized state. Recalculation runs:
- On user profile update (PATCH /api/users/:id triggers re-evaluation)
- On SCIM PATCH (after processing, re-evaluate all dynamic groups)
- On a 15-minute cron job (catch any missed updates)

```javascript
// lib/dynamicGroups.js
async function evaluateDynamicGroup(groupId, orgId) {
  const { rows: [group] } = await db.query(
    'SELECT dynamic_rules FROM user_groups WHERE id = $1 AND org_id = $2',
    [groupId, orgId]
  );

  if (!group?.dynamic_rules) return;

  // Build parameterized SQL from rules
  const { sql, params } = buildDynamicGroupSQL(group.dynamic_rules, orgId);

  const { rows: matchingUsers } = await db.query(sql, params);
  const matchingUserIds = new Set(matchingUsers.map(u => u.user_id));

  // Get current members
  const { rows: currentMembers } = await db.query(
    'SELECT user_id FROM user_group_members WHERE group_id = $1',
    [groupId]
  );
  const currentUserIds = new Set(currentMembers.map(m => m.user_id));

  // Compute diff
  const toAdd = [...matchingUserIds].filter(id => !currentUserIds.has(id));
  const toRemove = [...currentUserIds].filter(id => !matchingUserIds.has(id));

  // Apply diff in a transaction
  await db.query('BEGIN');
  if (toAdd.length > 0) {
    const insertValues = toAdd.map((uid, i) =>
      `($1, $${i * 2 + 2}, $${i * 2 + 3})`
    ).join(',');
    await db.query(
      `INSERT INTO user_group_members (group_id, user_id, org_id)
       VALUES ${insertValues} ON CONFLICT DO NOTHING`,
      [groupId, ...toAdd.flatMap(uid => [uid, orgId])]
    );
  }
  if (toRemove.length > 0) {
    await db.query(
      'DELETE FROM user_group_members WHERE group_id = $1 AND user_id = ANY($2)',
      [groupId, toRemove]
    );
  }
  await db.query('COMMIT');
}
```

### Crystal Group Integration

Groups are a first-class Crystal intelligence primitive:

```
Survey distributed to "Q4 Pilot Customers" group (200 users)

Crystal insights:
- "87% response rate among Q4 Pilot group — significantly higher than org average 43%"
- "Q4 Pilot group NPS: 71 vs non-pilot org members NPS: 48 — 23-point gap"
- "Three users in the Q4 Pilot group left strongly negative verbatim responses"
- "Comparing Q4 Pilot group across months: NPS improved from 58 → 71 (+13 since August)"

Crystal alerts (configured by admin):
- "Alert me when any user group's CSAT drops below 50"
- "Alert me when Q4 Pilot group response rate drops below 70%"
```

---

## 7. Admin Console UI

**Kenji Nakamura + Patricia Holloway**

All pages follow Experient's design system:
- Icons: `<Icon name="..." />` (Material Symbols Outlined)
- Colors: `var(--color-primary)`, `var(--color-secondary)`, etc.
- Buttons: shadcn variants (default, outline, ghost, gradient, destructive)
- Animations: Framer Motion with `[0.22, 1, 0.36, 1]` spring easing
- Page wrapper: `max-w-7xl mx-auto w-full`
- Page setup: `useSetPageTitle()` + `<PageHeader crumbs={...} title="..." />`
- Font headlines: `font-headline` (Manrope)
- Route prefix: `/app/settings/users`

New routes to add to `ROUTES` constant:
```typescript
SETTINGS_USERS:        '/app/settings/users',
SETTINGS_ROLES:        '/app/settings/users/roles',
SETTINGS_DEPARTMENTS:  '/app/settings/users/departments',
SETTINGS_GROUPS:       '/app/settings/users/groups',
SETTINGS_PROVISIONING: '/app/settings/users/provisioning',
SETTINGS_SEATS:        '/app/settings/users/seats',
```

---

### 7a. User Directory Page (`/app/settings/users`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Users                                          [+ Invite User]   │
│                                                                             │
│ User Directory                                   [SCIM Connected] badge     │
│ Manage your organization's 1,247 members                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search by name or email...    ]  [Role ▾] [Dept ▾] [Status ▾] [Export] │
├───┬──────────────────────┬────────────────┬──────────────────┬──────────────┤
│ □ │ Name / Email         │ Role           │ Department       │ Last Active  │
├───┼──────────────────────┼────────────────┼──────────────────┼──────────────┤
│ □ │ [A] Alice Zhang      │ [Admin]        │ Engineering      │ 2h ago       │
│   │ alice@acme.com       │                │                  │ [Active ●]   │
├───┼──────────────────────┼────────────────┼──────────────────┼──────────────┤
│ □ │ [B] Bob Martinez     │ [Analyst]      │ Customer Success │ 1d ago       │
│   │ bob.m@acme.com       │                │                  │ [Active ●]   │
├───┼──────────────────────┼────────────────┼──────────────────┼──────────────┤
│ □ │ [C] Carol Singh      │ [Report Viewer]│ Marketing        │ 3d ago       │
│   │ carol@acme.com       │                │                  │ [Active ●]   │
├───┼──────────────────────┼────────────────┼──────────────────┼──────────────┤
│ □ │ [D] Dan Lee          │ [Member]       │ —                │ 14d ago      │
│   │ dan@acme.com         │                │                  │ [Deprovisioned ○]│
├─────────────────────────────────────────────────────────────────────────────┤
│ Showing 1-50 of 1,247 members          [< Prev]  Page 1 of 25  [Next >]    │
└─────────────────────────────────────────────────────────────────────────────┘

Bulk action bar (appears when rows are checked):
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3 users selected  [Change Role ▾] [Add to Group ▾] [Deactivate] [Remove]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Component file:** `app/src/pages/UserDirectoryPage.tsx`

**Key interactions:**
- Real-time search debounced at 300ms, hits `GET /api/users?q={query}`
- Role filter chips: click to toggle, multi-select
- Department filter: searchable dropdown with tree structure
- Row click: opens UserDetailDrawer (Sheet from shadcn, 560px wide)
- "Invite User" button: opens InviteUserModal (Dialog)
- Pagination: 50 per page, cursor-based

---

### 7b. User Detail Drawer (Sheet Component)

```
                               ┌──────────────────────────────────────────┐
                               │                               [×]         │
                               │  [Avatar 64px]                           │
                               │  Alice Zhang             [Active ●]      │
                               │  alice@acme.com                          │
                               │  [Admin badge]  [Edit role ▾]            │
                               │                                          │
                               │  ─── Profile ──────────────────────     │
                               │  Job Title    [Senior Engineer      ]    │
                               │  Department   [Engineering ▾        ]    │
                               │  Manager      [Bob Martinez ▾       ]    │
                               │  Location     [San Francisco, CA    ]    │
                               │  Timezone     [America/Los_Angeles ▾]    │
                               │                                          │
                               │  ─── Custom Fields ──────────────────   │
                               │  Business Unit  [Platform            ]   │
                               │  Region         [AMER                ]   │
                               │  Cost Center    [CC-1234             ]   │
                               │                                          │
                               │  ─── Group Memberships ──────────────   │
                               │  [Q4 Pilot] [Engineering Leads] [+ Add]  │
                               │                                          │
                               │  ─── Activity ───────────────────────   │
                               │  Last login: 2 hours ago                 │
                               │  Surveys responded to: 12               │
                               │  Surveys created: 4                     │
                               │  Provisioned via: SCIM (Okta)           │
                               │                                          │
                               │  ─── Recent Audit Events ─────────────  │
                               │  Role changed: admin → analyst (3d ago) │
                               │  Login: 2h ago from 192.168.1.1         │
                               │  Password reset: 14d ago                │
                               │                                          │
                               │  ─── Actions ────────────────────────   │
                               │  [Reset Password] [Revoke Sessions]      │
                               │  [Deactivate User] [Remove from Org]     │
                               │                                          │
                               │                       [Save Changes]     │
                               └──────────────────────────────────────────┘
```

---

### 7c. Roles & Permissions Page (`/app/settings/users/roles`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Users > Roles                             [+ Create Custom Role] │
│                                                                             │
│ Roles & Permissions                              [Enterprise feature badge] │
│ Define what each role can do across your organization                       │
├──────────────┬──────────────────────────────────────────────────────────────┤
│ Roles        │  Permission Matrix                                           │
│              │                                                              │
│ BUILT-IN     │                    Super  Admin  Prog   Analyst Creator View │
│ ● Super Admin│  survey:read        ALL    ALL    OWN    ALL    OWN    SHR  │
│ ● Admin      │  survey:write       ALL    ALL    OWN    ✗      OWN    ✗    │
│ ● Prog Admin │  survey:distribute  ALL    ALL    OWN    ✗      OWN    ✗    │
│ ● Analyst    │  survey:insights    ALL    ALL    OWN    ALL    OWN    SHR  │
│ ● Creator    │  survey:export      ALL    ALL    OWN    ALL    ✗      ✗    │
│ ● Viewer     │  survey:delete      ALL    ALL    OWN    ✗      OWN    ✗    │
│ ● Member     │  dashboard:read     ALL    ALL    ALL    ALL    OWN    SHR  │
│              │  alerts:manage      ALL    ALL    OWN    ✗      OWN    ✗    │
│ CUSTOM       │  workflows:manage   ALL    ALL    ALL    ✗      ✗      ✗    │
│ ○ HR Lead    │  users:manage       ALL    ALL    ✗      ✗      ✗      ✗    │
│   [Edit][Del]│  billing:manage     ALL    ✗      ✗      ✗      ✗      ✗    │
│              │                                                              │
│              │  Legend: ALL=all resources, OWN=owned only, SHR=shared only │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

**Create Custom Role Modal:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Create Custom Role                                                    [×]   │
│                                                                             │
│ Role Name:     [HR Team Lead                                       ]        │
│ Description:   [HR team members who run engagement surveys         ]        │
│ Start from:    [Analyst ▾]  (copy permissions from built-in role)          │
│                                                                             │
│ Permissions:                                                                │
│ ┌─────────────────────────┬──────────────────────────────────────────────┐ │
│ │ survey:read             │ ( ) None  (●) Owned only  ( ) All            │ │
│ │ survey:write            │ ( ) None  (●) Owned only  ( ) All            │ │
│ │ survey:insights:read    │ ( ) None  (●) Owned only  ( ) All            │ │
│ │ survey:responses:export │ (●) None  ( ) Owned only  ( ) All            │ │
│ │ dashboard:read          │ ( ) None  (●) Owned only  ( ) All            │ │
│ │ users:manage            │ (●) None  ( ) Owned only  ( ) All            │ │
│ └─────────────────────────┴──────────────────────────────────────────────┘ │
│                                                                             │
│ Seat weight:  [1.0 full seat ▾]                                             │
│ Badge color:  [● #8329c8 ▾]                                                 │
│                                                                             │
│                                           [Cancel]  [Create Role]          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 7d. Department Management (`/app/settings/users/departments`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Users > Departments                          [+ Add Department]  │
│                                                                             │
│ Department Hierarchy                                                        │
│ Manage your organization's structure (1,247 total members)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ▼ Engineering                                             412 members [⋯]  │
│    ▼ Platform Team                                         187 members [⋯]  │
│      ▶ Backend Crew                                         94 members [⋯]  │
│      ▶ Frontend Crew                                        93 members [⋯]  │
│    ▶ Mobile Team                                           225 members [⋯]  │
│  ▼ Customer Success                                        318 members [⋯]  │
│    ▶ Enterprise CS                                         201 members [⋯]  │
│    ▶ SMB CS                                                117 members [⋯]  │
│  ▶ Marketing                                               215 members [⋯]  │
│  ▶ Finance                                                  89 members [⋯]  │
│  ▶ HR                                                       43 members [⋯]  │
│                                                                             │
│ [Drag & drop to reorganize]              [⋯] = Edit / Move / Delete        │
└─────────────────────────────────────────────────────────────────────────────┘
```

Department context menu `[⋯]`:
```
[Edit department]
[Set department head]
[Add sub-department]
[Move to...]
[View members]
[Send survey to this department]
[──────────────]
[Delete department] (reassigns members to parent)
```

---

### 7e. Groups Page (`/app/settings/users/groups`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Users > Groups                                  [+ Create Group] │
│                                                                             │
│ User Groups                                                                 │
│ Groups are used for survey distribution and Crystal segmentation            │
├─────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search groups...]                     [Static] [Dynamic] [SCIM-synced]  │
├─────────────────────────────────────────┬──────────┬──────────┬────────────┤
│ Name                                    │ Type     │ Members  │ Actions    │
├─────────────────────────────────────────┼──────────┼──────────┼────────────┤
│ Q4 Pilot Customers                      │ [Static] │ 200      │ [Edit][⋯]  │
│ All San Francisco Employees             │[Dynamic] │ 1,247    │ [Edit][⋯]  │
│ Enterprise Survey Participants (Okta)   │[SCIM ⟲] │ 5,234    │ [Sync][⋯]  │
│ Engineering Leadership                  │ [Static] │ 14       │ [Edit][⋯]  │
└─────────────────────────────────────────┴──────────┴──────────┴────────────┘
```

**Create Group Wizard:**

```
Step 1/3: Group Details
  Name: [Q4 Pilot Customers            ]
  Description: [Users enrolled in Q4 pilot program]
  Type: (●) Static  ( ) Dynamic

Step 2/3: Add Members (Static)
  [🔍 Search users to add...]
  ┌─────────────────────────────────────┐
  │ Selected (3):                       │
  │ [Alice Zhang ×] [Bob M ×] [Carol ×] │
  └─────────────────────────────────────┘

  [+ Import from department: Engineering ▾]
  [+ Import from CSV]

Step 3/3: Review
  Group: "Q4 Pilot Customers"
  Type: Static | Members: 200
  [Create Group]
```

**Dynamic Group Rule Builder:**

```
Step 2/3: Define Rules (Dynamic)
  Match: (●) ALL rules  ( ) ANY rule

  ┌──────────────────────────────────────────────────────────────────┐
  │ [Department ▾] [contains ▾] [Sales          ] [×]              │
  │ [Region ▾    ] [equals ▾  ] [APAC            ] [×]              │
  │ [Is Active ▾ ] [is ▾      ] [True            ] [×]              │
  │ [+ Add Rule]                                                     │
  └──────────────────────────────────────────────────────────────────┘

  Preview: This rule matches 347 users
  [See matching users ▾]
```

---

### 7f. SCIM Setup Page (`/app/settings/users/provisioning`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Users > Provisioning                                             │
│                                                                             │
│ Identity Provider Provisioning                                              │
│ Connect your IdP to automatically sync users with SCIM 2.0                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Connected: Okta Production                                    [●] Active    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ─── SCIM Configuration ───────────────────────────────────────────────    │
│                                                                             │
│ SCIM Base URL:                                                              │
│ ┌───────────────────────────────────────────────────────┬──────────┐       │
│ │ https://api.experient.ai/scim/v2                      │ [Copy]   │       │
│ └───────────────────────────────────────────────────────┴──────────┘       │
│                                                                             │
│ Tokens:                                                                     │
│ ┌──────────────────────┬─────────────────┬──────────────┬──────────┐       │
│ │ Name                 │ Created         │ Last Used    │          │       │
│ ├──────────────────────┼─────────────────┼──────────────┼──────────┤       │
│ │ Okta Production      │ Jun 1, 2026     │ 2 hours ago  │ [Revoke] │       │
│ └──────────────────────┴─────────────────┴──────────────┴──────────┘       │
│ [+ Generate New Token]                                                      │
│                                                                             │
│ ─── Attribute Mapping ─────────────────────────────────────────────────   │
│ ┌──────────────────────────┬──────────────────────────────────────────┐    │
│ │ SCIM Attribute           │ Experient Field                          │    │
│ ├──────────────────────────┼──────────────────────────────────────────┤    │
│ │ userName                 │ email (fixed)                            │    │
│ │ name.givenName           │ first_name (fixed)                       │    │
│ │ name.familyName          │ last_name (fixed)                        │    │
│ │ title                    │ job_title [Edit ▾]                       │    │
│ │ department               │ department [Edit ▾]                      │    │
│ │ costCenter               │ cost_center [Edit ▾]                     │    │
│ │ userType                 │ role [Edit ▾]                            │    │
│ │ extension.employeeId     │ employee_id [Edit ▾]                     │    │
│ │ extension.businessUnit   │ custom_attributes.business_unit [Edit ▾] │    │
│ │ extension.region         │ custom_attributes.region [Edit ▾]        │    │
│ └──────────────────────────┴──────────────────────────────────────────┘    │
│ [+ Add Custom Mapping]                                                      │
│                                                                             │
│ ─── Sync Status ───────────────────────────────────────────────────────   │
│ Last sync: 2 hours ago (scheduled: every 4 hours)                          │
│ Users synced: 5,234  |  Updated: 12  |  Errors: 0                         │
│ [Test Connection]  [Force Sync Now]                                         │
│                                                                             │
│ ─── Sync Log (last 50 events) ─────────────────────────────────────────   │
│ 2h ago  PATCH alice@acme.com → department updated                          │
│ 2h ago  POST  john@acme.com → user provisioned                             │
│ 1d ago  PATCH ACTIVE=false → jane@acme.com deprovisioned                   │
│ [Load more]                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**"Connect Identity Provider" flow (first-time setup):**

```
Step 1: Select Provider
  [Okta]  [Azure AD]  [Google Workspace]  [OneLogin]  [Other/Generic]

Step 2: Configure
  SCIM Base URL (auto-generated, copy to your IdP):
  https://api.experient.ai/scim/v2

  [Generate Token]
  → Token generated! Copy this now — it cannot be shown again:
    ┌─────────────────────────────────────────────────────┬───────┐
    │ esc_abc123xyz456...                                 │ Copy  │
    └─────────────────────────────────────────────────────┴───────┘

Step 3: Test & Verify
  [Test Connection] → "✓ Connection successful. Okta can reach your SCIM endpoint."
  [Save & Activate]
```

---

### 7g. Seat Licensing Page (`/app/settings/users/seats`)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Users > Seats                                                    │
│                                                                             │
│ Seat Usage                                                                  │
│ Enterprise Plan — Unlimited seats                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Billable Seats: 847 / Unlimited                                    │   │
│  │  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 847  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─── By Role ────────────────────────────────────────────────────────     │
│  ┌─────────────────────┬────────────┬──────────────┬─────────────────┐    │
│  │ Role                │ Users      │ Seat Weight  │ Billable Seats  │    │
│  ├─────────────────────┼────────────┼──────────────┼─────────────────┤    │
│  │ Super Admin         │ 2          │ 1.0          │ 2.0             │    │
│  │ Admin               │ 15         │ 1.0          │ 15.0            │    │
│  │ Program Admin       │ 48         │ 1.0          │ 48.0            │    │
│  │ Analyst             │ 312        │ 1.0          │ 312.0           │    │
│  │ Survey Creator      │ 201        │ 1.0          │ 201.0           │    │
│  │ Report Viewer       │ 538        │ 0.5          │ 269.0           │    │
│  │ Member              │ 4,251      │ 0.0          │ 0.0             │    │
│  │ (Deprovisioned)     │ 89         │ 0.0          │ 0.0             │    │
│  ├─────────────────────┼────────────┼──────────────┼─────────────────┤    │
│  │ Total               │ 5,456      │ —            │ 847.0           │    │
│  └─────────────────────┴────────────┴──────────────┴─────────────────┘    │
│                                                                             │
│  ─── Seat History (Last 90 Days) ───────────────────────────────────────  │
│  [Line chart: Billable seats over time — shows growth trend]               │
│                                                                             │
│  [Download Seat Report CSV]                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Seat Licensing & Enforcement

**Marcus Thompson + Linda Zhang**

### Seat Counting Logic

Seat billing is based on role weight at the time of each monthly billing snapshot. Seat weight is stored on `org_roles` so custom roles can have custom weights negotiated with enterprise customers.

| Role | Seat Weight | Rationale |
|---|---|---|
| `org:super_admin` | 1.0 | Full platform user |
| `org:admin` | 1.0 | Full platform user |
| `org:program_admin` | 1.0 | Full platform user |
| `org:analyst` | 1.0 | Full platform user |
| `org:survey_creator` | 1.0 | Full platform user |
| `org:report_viewer` | 0.5 | View-only; typically half-price in enterprise contracts |
| `org:member` | 0.0 | Survey respondents; never billed |
| Deprovisioned | 0.0 | No seat charged after deprovisioning |

**Current seat count query:**

```sql
SELECT
  COALESCE(SUM(or2.seat_weight), 0)::NUMERIC(10,1) AS billable_seats,
  COUNT(*) FILTER (WHERE up.is_active AND up.deprovisioned_at IS NULL) AS active_users,
  COUNT(*) FILTER (WHERE up.deprovisioned_at IS NOT NULL) AS deprovisioned_users
FROM user_profiles up
LEFT JOIN org_roles or2 ON or2.id = up.role_id
WHERE up.org_id = $1;
```

### Enforcement Points

**1. On user invite (POST /api/orgs/me/invitations):**
```javascript
// Before creating invitation, check seat availability
const seatCheck = await checkSeatLimit(orgId, roleWeight);
if (!seatCheck.allowed && !seatCheck.inGracePeriod) {
  return res.status(402).json({
    error: 'seat_limit_exceeded',
    message: `Your plan allows ${seatCheck.limit} seats. You're using ${seatCheck.current}.`,
    upgradeUrl: '/app/settings/billing',
  });
}
if (seatCheck.inGracePeriod) {
  // Allow but send warning email to billing contact
  emitGracePeriodWarning(orgId, seatCheck);
}
```

**2. On SCIM provisioning (POST /scim/v2/Users):**
- Check seat limit before creating user
- If at limit: queue provisioning request, notify billing admin via email
- SCIM response: 409 Conflict with explanation (Okta will retry)
- Grace period: 10% overage allowed for 7 days

**3. Grace period logic:**
```javascript
async function checkSeatLimit(orgId, additionalWeight = 1.0) {
  const { rows: [plan] } = await db.query(
    'SELECT plan_tier, seat_limit, grace_period_end FROM org_profiles WHERE org_id = $1',
    [orgId]
  );

  if (!plan || plan.plan_tier === 'enterprise') return { allowed: true };

  const { rows: [usage] } = await db.query(
    `SELECT COALESCE(SUM(or2.seat_weight), 0) as current
     FROM user_profiles up
     JOIN org_roles or2 ON or2.id = up.role_id
     WHERE up.org_id = $1 AND up.is_active = TRUE AND up.deprovisioned_at IS NULL`,
    [orgId]
  );

  const current = parseFloat(usage.current);
  const projected = current + additionalWeight;
  const limit = plan.seat_limit;
  const gracePeriodLimit = limit * 1.10;

  if (projected <= limit) return { allowed: true, current, limit };

  // In grace period?
  const now = new Date();
  const gracePeriodEnd = plan.grace_period_end ? new Date(plan.grace_period_end) : null;

  if (gracePeriodEnd && now < gracePeriodEnd && projected <= gracePeriodLimit) {
    return { allowed: true, inGracePeriod: true, current, limit, gracePeriodEnd };
  }

  // Set grace period if not already set
  if (!gracePeriodEnd && projected <= gracePeriodLimit) {
    const newGraceEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      'UPDATE org_profiles SET grace_period_end = $1 WHERE org_id = $2',
      [newGraceEnd, orgId]
    );
    return { allowed: true, inGracePeriod: true, current, limit, gracePeriodEnd: newGraceEnd };
  }

  return { allowed: false, current, limit };
}
```

### Plan Tiers

| Feature | Starter | Growth | Enterprise |
|---|---|---|---|
| Max seats | 5 | 25 | Unlimited |
| Custom roles | No | No | Yes |
| SCIM provisioning | No | No | Yes |
| Department hierarchy | No | Flat (depth 1) | Unlimited depth |
| SAML SSO | No | No | Yes |
| User groups | 1 | 5 | Unlimited |
| Resource-level permissions | No | No | Yes |
| Compliance audit log | No | 30 days | 1 year |
| Dynamic groups | No | No | Yes |
| Crystal user segmentation | No | Basic | Full |

---

## 9. Compliance Audit Log

**Dr. Aisha Kamara**

### Design Principles

1. **Immutable**: The `user_audit_log` table has `UPDATE` and `DELETE` privileges revoked at the DB level from the application user. Events can only be INSERTed, never modified.
2. **Complete**: Every user-affecting action is logged — not just admin actions, but also user logins, data exports, and Crystal access to sensitive insights.
3. **Searchable**: Indexed by actor, target, event type, and timestamp. The UI supports filtering by all four.
4. **Exportable**: CSV export for SOC 2 auditors, ISO 27001 reviews, and compliance team requests.
5. **Retained**: Configurable per plan (30d/90d/1yr), with cold-storage archival for Enterprise.

### Audit Log Helper

```javascript
// lib/auditLog.js
const db = require('./db');

async function auditLog({
  orgId,
  actorUserId = null,
  actorType = 'user',
  targetUserId = null,
  targetResourceType = null,
  targetResourceId = null,
  eventType,
  beforeState = null,
  afterState = null,
  ipAddress = null,
  userAgent = null,
  requestId = null,
}) {
  // Truncate user_agent to 500 chars to prevent log injection
  const safeUserAgent = userAgent ? userAgent.slice(0, 500) : null;

  await db.query(
    `INSERT INTO user_audit_log (
       org_id, actor_user_id, actor_type, target_user_id,
       target_resource_type, target_resource_id, event_type,
       before_state, after_state, ip_address, user_agent, request_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      orgId, actorUserId, actorType, targetUserId,
      targetResourceType, targetResourceId, eventType,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
      ipAddress, safeUserAgent, requestId,
    ]
  ).catch(err => {
    // Audit log failure must never crash the main request
    // But we do want to alert on persistent failures
    console.error('AUDIT LOG WRITE FAILED:', err.message, { eventType, orgId });
  });
}

module.exports = { auditLog };
```

### Audit Log API

```javascript
// GET /api/audit-logs
router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  const {
    page = 1,
    limit = 50,
    event_type,
    actor_user_id,
    target_user_id,
    start_date,
    end_date,
    format,  // 'csv' for export
  } = req.query;

  const conditions = ['org_id = $1'];
  const params = [req.orgId];
  let p = 2;

  if (event_type)      { conditions.push(`event_type = $${p++}`); params.push(event_type); }
  if (actor_user_id)   { conditions.push(`actor_user_id = $${p++}`); params.push(actor_user_id); }
  if (target_user_id)  { conditions.push(`target_user_id = $${p++}`); params.push(target_user_id); }
  if (start_date)      { conditions.push(`occurred_at >= $${p++}`); params.push(start_date); }
  if (end_date)        { conditions.push(`occurred_at <= $${p++}`); params.push(end_date); }

  const whereClause = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [{ rows: events }, { rows: [{ count }] }] = await Promise.all([
    db.query(
      `SELECT ual.*,
              up_actor.display_name as actor_name, up_actor.email as actor_email,
              up_target.display_name as target_name, up_target.email as target_email
       FROM user_audit_log ual
       LEFT JOIN user_profiles up_actor ON up_actor.user_id = ual.actor_user_id
                                       AND up_actor.org_id = $1
       LEFT JOIN user_profiles up_target ON up_target.user_id = ual.target_user_id
                                        AND up_target.org_id = $1
       WHERE ${whereClause}
       ORDER BY ual.occurred_at DESC
       LIMIT $${p++} OFFSET $${p}`,
      [...params, parseInt(limit), offset]
    ),
    db.query(
      `SELECT COUNT(*) FROM user_audit_log WHERE ${whereClause}`,
      params.slice(0, p - 2)
    ),
  ]);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
    // Stream CSV
    const header = 'timestamp,actor,actor_email,event_type,target,target_email,ip_address\n';
    const rows = events.map(e =>
      `${e.occurred_at},${e.actor_name || 'system'},${e.actor_email || ''},` +
      `${e.event_type},${e.target_name || ''},${e.target_email || ''},${e.ip_address || ''}`
    ).join('\n');
    return res.send(header + rows);
  }

  res.json({
    events,
    total: parseInt(count),
    page: parseInt(page),
    limit: parseInt(limit),
    pages: Math.ceil(parseInt(count) / parseInt(limit)),
  });
});
```

### Audit Log UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings > Audit Log                                        [Export CSV]    │
│                                                                             │
│ Compliance Audit Log                                                        │
│ Immutable record of all user and access events (1 year retention)           │
├─────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search...]  [Event Type ▾] [Actor ▾] [Date Range ▾] [Apply Filters]    │
├────────────────┬─────────────────────┬───────────────────┬──────────────────┤
│ Timestamp      │ Actor               │ Event             │ Target           │
├────────────────┼─────────────────────┼───────────────────┼──────────────────┤
│ 2026-06-03     │ Alice Zhang         │ user.role_changed │ Bob Martinez     │
│ 14:32:11       │ alice@acme.com      │                   │ analyst → admin  │
├────────────────┼─────────────────────┼───────────────────┼──────────────────┤
│ 2026-06-03     │ Okta SCIM           │ scim.user_        │ jane@acme.com    │
│ 14:28:55       │ (provisioner)       │ deprovisioned     │ Jane Smith       │
├────────────────┼─────────────────────┼───────────────────┼──────────────────┤
│ 2026-06-03     │ Carol Singh         │ survey.response_  │ Q3 NPS Survey    │
│ 13:15:02       │ carol@acme.com      │ exported          │ 1,234 responses  │
└────────────────┴─────────────────────┴───────────────────┴──────────────────┘
```

---

## 10. Crystal User Context Integration

**Raj Patel**

### Crystal Needs User Context For:

1. **Segmentation** — "Break down NPS by department"
2. **Targeting** — "Send this survey to users in the West Coast region"
3. **Comparison** — "How does Engineering compare to Sales?"
4. **Tracking** — "Has Engineering's sentiment improved since the last survey?"
5. **Anomaly detection** — "One department has significantly lower CSAT — flag it"

### New Crystal Tools

These are added to `crystalos/crystal/registry.py` as registered tools:

```python
# crystalos/crystal/tools/user_directory.py

import httpx
from typing import Optional

BACKEND_URL = os.getenv("BACKEND_INTERNAL_URL", "http://localhost:3001")
AGENTS_KEY = os.getenv("AGENTS_INTERNAL_KEY", "dev-internal-key-change-in-prod")


async def get_user_directory_context(org_id: str) -> dict:
    """
    Returns the org's user directory structure:
    - Department tree (id, name, parent_id, member_count)
    - Custom field definitions (org_custom_fields)
    - Group list (id, name, type, member_count)

    Crystal calls this before any user-segmented analysis to understand
    the org's structure. Results are cached for 10 minutes per org.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/internal/user-directory/context",
            headers={"X-Agents-Key": AGENTS_KEY, "X-Org-Id": org_id},
            timeout=10.0
        )
        resp.raise_for_status()
        return resp.json()


async def segment_users_by_attribute(
    org_id: str,
    field: str,
    operator: str,
    value: str,
    department_id: Optional[str] = None,
) -> list[str]:
    """
    Returns user_ids matching a profile attribute filter.
    Used by Crystal to filter survey responses to a specific user segment.

    Examples:
      segment_users_by_attribute(org_id, "department_name", "eq", "Engineering")
      → ["user_abc", "user_xyz", ...]

      segment_users_by_attribute(org_id, "custom_attributes.region", "eq", "APAC")
      → ["user_def", ...]

    The backend resolves the field path, handles custom_attributes JSONB traversal,
    and applies the department hierarchy (sub-departments included when filtering by dept).
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BACKEND_URL}/api/internal/user-directory/segment",
            json={"field": field, "operator": operator, "value": value,
                  "department_id": department_id},
            headers={"X-Agents-Key": AGENTS_KEY, "X-Org-Id": org_id},
            timeout=15.0
        )
        resp.raise_for_status()
        return resp.json()["user_ids"]


async def get_group_members(org_id: str, group_id: str) -> list[str]:
    """
    Returns user_ids for all members of a user group.
    Handles static, dynamic, and SCIM-synced groups.

    Crystal uses this to filter responses to a specific distribution group:
      "Show me insights only for the Q4 Pilot Customers group"
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/internal/user-directory/groups/{group_id}/members",
            headers={"X-Agents-Key": AGENTS_KEY, "X-Org-Id": org_id},
            timeout=10.0
        )
        resp.raise_for_status()
        return resp.json()["user_ids"]


async def get_respondent_profile(org_id: str, respondent_id: str) -> Optional[dict]:
    """
    Returns user profile for a survey respondent (by Clerk user ID).
    Crystal uses this to enrich individual response analysis with user context:
    department, job_title, custom_attributes, group memberships.

    Returns None if respondent is not a known org member
    (e.g., external/anonymous respondent).
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BACKEND_URL}/api/internal/user-directory/users/{respondent_id}",
            headers={"X-Agents-Key": AGENTS_KEY, "X-Org-Id": org_id},
            timeout=5.0
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


# Tool registry entries (added to crystalos/crystal/registry.py)
USER_DIRECTORY_TOOLS = [
    {
        "name": "get_user_directory_context",
        "description": (
            "Get the org's user directory structure: department hierarchy, "
            "custom field definitions, and user groups. Call this before any "
            "user-segmented analysis to understand available segments."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        },
        "function": get_user_directory_context,
    },
    {
        "name": "segment_users_by_attribute",
        "description": (
            "Find user IDs matching a profile attribute filter. Use this to "
            "segment survey responses by department, region, job title, or "
            "any custom field. Returns a list of matching user IDs."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "field": {
                    "type": "string",
                    "description": "Field to filter on. Examples: 'department_name', "
                                   "'job_title', 'location', 'custom_attributes.region', "
                                   "'custom_attributes.business_unit'"
                },
                "operator": {
                    "type": "string",
                    "enum": ["eq", "neq", "contains", "starts_with", "in"],
                    "description": "Comparison operator"
                },
                "value": {
                    "type": "string",
                    "description": "Value to compare against"
                },
                "department_id": {
                    "type": "string",
                    "description": "Optional: restrict to users in this department subtree"
                }
            },
            "required": ["field", "operator", "value"]
        },
        "function": segment_users_by_attribute,
    },
    {
        "name": "get_group_members",
        "description": (
            "Get all user IDs in a user group. Use this when analyzing responses "
            "from a specific distribution group (e.g., 'Q4 Pilot Customers', "
            "'Enterprise Survey Participants')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "group_id": {
                    "type": "string",
                    "description": "UUID of the user group"
                }
            },
            "required": ["group_id"]
        },
        "function": get_group_members,
    },
]
```

### Internal Backend Routes for Crystal

```javascript
// routes/internal/userDirectory.js
// Mounted at /api/internal/user-directory — only accessible with AGENTS_INTERNAL_KEY

// GET /api/internal/user-directory/context
router.get('/context', internalAuth, async (req, res) => {
  const orgId = req.headers['x-org-id'];

  const [deptTree, customFields, groups] = await Promise.all([
    getDepartmentTree(orgId),
    db.query('SELECT * FROM org_custom_fields WHERE org_id = $1 ORDER BY sort_order', [orgId]),
    db.query(
      'SELECT id, name, group_type, member_count FROM user_groups WHERE org_id = $1 AND is_active = TRUE',
      [orgId]
    ),
  ]);

  res.json({
    departments: deptTree,
    custom_fields: customFields.rows,
    groups: groups.rows,
  });
});

// POST /api/internal/user-directory/segment
router.post('/segment', internalAuth, async (req, res) => {
  const orgId = req.headers['x-org-id'];
  const { field, operator, value, department_id } = req.body;

  let sql, params;

  if (field === 'department_name') {
    // Special handling: resolve department name to IDs including sub-departments
    sql = `
      SELECT up.user_id FROM user_profiles up
      JOIN departments d ON d.id = up.department_id
      WHERE up.org_id = $1
        AND up.is_active = TRUE
        AND up.deprovisioned_at IS NULL
        AND d.name ${operator === 'eq' ? 'ILIKE' : 'NOT ILIKE'} $2`;
    params = [orgId, value];
  } else if (field.startsWith('custom_attributes.')) {
    const attrKey = field.replace('custom_attributes.', '');
    sql = `
      SELECT user_id FROM user_profiles
      WHERE org_id = $1
        AND is_active = TRUE
        AND deprovisioned_at IS NULL
        AND custom_attributes->>'${attrKey.replace(/[^a-z0-9_]/gi, '')}' ${operator === 'eq' ? '=' : '!='} $2`;
    params = [orgId, value];
  } else {
    // Standard column field
    const allowedFields = ['job_title', 'location', 'cost_center', 'locale', 'timezone'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: `Field '${field}' is not allowed for segmentation` });
    }
    sql = `
      SELECT user_id FROM user_profiles
      WHERE org_id = $1
        AND is_active = TRUE
        AND deprovisioned_at IS NULL
        AND ${field} ${operator === 'eq' ? 'ILIKE' : 'NOT ILIKE'} $2`;
    params = [orgId, value];
  }

  // Optional department_id subtree filter
  if (department_id) {
    sql += ` AND department_id IN (
      SELECT id FROM departments WHERE org_id = $${params.length + 1} AND path @> ARRAY[$${params.length + 2}]::TEXT[]
    )`;
    params.push(orgId, department_id);
  }

  const { rows } = await db.query(sql, params);
  res.json({ user_ids: rows.map(r => r.user_id) });
});
```

### Survey Distribution Integration

In the survey builder and distribution panel, users can now select distribution targets from the User Directory:

```
Distribution Target:
  (○) All org members
  (○) Specific users    → multi-select from user directory
  (●) Department        → [Engineering ▾] (includes sub-departments)
  (○) User group        → [Q4 Pilot Customers ▾]
  (○) Import CSV        → upload email list

Crystal then knows the distribution group and can segment insights accordingly:
  "87% response rate among Q4 Pilot group vs 43% org average"
  "Engineering (N=412) NPS: 42 vs Marketing (N=215) NPS: 67"
```

---

## 11. Backend API Design

**Chen Wei**

### Route File Structure

```
backend/src/routes/
  users.js              -- User directory CRUD
  roles.js              -- Role management
  departments.js        -- Department hierarchy
  groups.js             -- User groups
  scim.js               -- SCIM 2.0 endpoints (separate auth)
  auditLogs.js          -- Audit log query
  seats.js              -- Seat usage/licensing
  internal/
    userDirectory.js    -- Internal Crystal routes
```

### GET /api/users — Full Implementation

```javascript
// GET /api/users — list org users with filter, sort, pagination
router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  const {
    q,           // search query (name or email)
    role_id,     // filter by role UUID
    department_id, // filter by department (includes sub-departments)
    status,      // 'active', 'deprovisioned', 'all'
    provisioned_by, // 'scim', 'invite', 'sso', 'manual'
    sort = 'display_name',
    order = 'asc',
    page = 1,
    limit = 50,
  } = req.query;

  const allowedSortCols = ['display_name', 'email', 'last_seen_at', 'created_at', 'job_title'];
  const safeSort = allowedSortCols.includes(sort) ? sort : 'display_name';
  const safeOrder = order === 'desc' ? 'DESC' : 'ASC';

  const conditions = ['up.org_id = $1'];
  const params = [req.orgId];
  let p = 2;

  if (q) {
    conditions.push(
      `(up.display_name ILIKE $${p} OR up.email ILIKE $${p} OR up.job_title ILIKE $${p})`
    );
    params.push(`%${q}%`);
    p++;
  }

  if (role_id) {
    conditions.push(`up.role_id = $${p++}`);
    params.push(role_id);
  }

  if (department_id) {
    // Include sub-departments using path array
    conditions.push(`up.department_id IN (
      SELECT id FROM departments
      WHERE org_id = $1 AND path @> ARRAY[$${p++}]::TEXT[]
    )`);
    params.push(department_id);
  }

  if (status === 'active') {
    conditions.push('up.is_active = TRUE AND up.deprovisioned_at IS NULL');
  } else if (status === 'deprovisioned') {
    conditions.push('up.deprovisioned_at IS NOT NULL');
  }
  // status = 'all' → no filter (default shows all)

  if (provisioned_by) {
    conditions.push(`up.provisioned_by = $${p++}`);
    params.push(provisioned_by);
  }

  const whereClause = conditions.join(' AND ');
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [{ rows: users }, { rows: [{ count }] }] = await Promise.all([
    db.query(
      `SELECT
         up.user_id, up.email, up.first_name, up.last_name, up.display_name,
         up.avatar_url, up.job_title, up.location, up.is_active,
         up.last_seen_at, up.created_at, up.provisioned_by, up.deprovisioned_at,
         up.scim_external_id,
         d.name as department_name, d.id as department_id,
         or2.name as role_name, or2.id as role_id,
         or2.color as role_color, or2.builtin_key as role_builtin_key
       FROM user_profiles up
       LEFT JOIN departments d ON d.id = up.department_id
       LEFT JOIN org_roles or2 ON or2.id = up.role_id
       WHERE ${whereClause}
       ORDER BY up.${safeSort} ${safeOrder} NULLS LAST
       LIMIT $${p++} OFFSET $${p}`,
      [...params, parseInt(limit), offset]
    ),
    db.query(
      `SELECT COUNT(*) FROM user_profiles up WHERE ${whereClause}`,
      params.slice(0, p - 2)
    ),
  ]);

  res.json({
    users,
    total: parseInt(count),
    page: parseInt(page),
    limit: parseInt(limit),
    pages: Math.ceil(parseInt(count) / parseInt(limit)),
  });
});
```

### GET /api/seats/breakdown

```javascript
router.get('/breakdown', requireAuth, requirePermission('billing:manage'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       or2.id as role_id,
       or2.name as role_name,
       or2.builtin_key,
       or2.seat_weight,
       COUNT(up.user_id)::int as user_count,
       COALESCE(SUM(or2.seat_weight), 0)::NUMERIC(10,1) as total_seat_weight
     FROM user_profiles up
     JOIN org_roles or2 ON or2.id = up.role_id
     WHERE up.org_id = $1
       AND up.is_active = TRUE
       AND up.deprovisioned_at IS NULL
     GROUP BY or2.id, or2.name, or2.builtin_key, or2.seat_weight
     ORDER BY or2.seat_weight DESC, user_count DESC`,
    [req.orgId]
  );

  const { rows: [totals] } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE is_active AND deprovisioned_at IS NULL)::int as active_users,
       COUNT(*) FILTER (WHERE deprovisioned_at IS NOT NULL)::int as deprovisioned_users,
       COALESCE(SUM(or2.seat_weight) FILTER (WHERE up.is_active AND up.deprovisioned_at IS NULL), 0) as total_seats
     FROM user_profiles up
     LEFT JOIN org_roles or2 ON or2.id = up.role_id
     WHERE up.org_id = $1`,
    [req.orgId]
  );

  // Get plan limit
  const { rows: [plan] } = await db.query(
    'SELECT plan_tier, seat_limit FROM org_profiles WHERE org_id = $1',
    [req.orgId]
  );

  res.json({
    by_role: rows,
    totals: {
      active_users: totals.active_users,
      deprovisioned_users: totals.deprovisioned_users,
      billable_seats: parseFloat(totals.total_seats),
    },
    plan: {
      tier: plan?.plan_tier || 'starter',
      seat_limit: plan?.seat_limit || 5,
    },
  });
});
```

### Full Route Registration in index.js

```javascript
// backend/src/index.js additions

const usersRouter       = require('./routes/users');
const rolesRouter       = require('./routes/roles');
const departmentsRouter = require('./routes/departments');
const groupsRouter      = require('./routes/groups');
const scimRouter        = require('./routes/scim');
const auditLogsRouter   = require('./routes/auditLogs');
const seatsRouter       = require('./routes/seats');
const internalUserDir   = require('./routes/internal/userDirectory');

// Standard API routes (Clerk JWT auth)
app.use('/api/users',       usersRouter);
app.use('/api/roles',       rolesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/groups',      groupsRouter);
app.use('/api/audit-logs',  auditLogsRouter);
app.use('/api/seats',       seatsRouter);

// SCIM routes (separate Bearer token auth — NOT Clerk JWT)
app.use('/scim/v2', scimRouter);

// Internal routes (agents service only)
app.use('/api/internal/user-directory', internalUserDir);
```

---

## 12. hasPermission Middleware

**Dr. Aisha Kamara + Chen Wei**

This middleware is the enforcement point for all authorization decisions. It must be fast (Redis cached), correct (strict deny by default), and observable (audit logged on deny for security monitoring).

```javascript
// middleware/requirePermission.js

const db = require('../lib/db');
const { getRedisClient } = require('../lib/redis');
const { auditLog } = require('../lib/auditLog');

const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * requirePermission(action, getResourceId?)
 *
 * Usage:
 *   // No resource (org-wide action):
 *   router.get('/api/users', requireAuth, requirePermission('users:manage'), handler)
 *
 *   // With specific resource:
 *   router.get('/api/surveys/:id/insights', requireAuth,
 *     requirePermission('survey:insights:read', (req) => req.params.id), handler)
 *
 * @param {string} action - Permission action to check (e.g., 'survey:insights:read')
 * @param {Function} [getResourceId] - Optional fn(req) => resourceId for resource-specific check
 */
function requirePermission(action, getResourceId = null) {
  const resourceType = action.split(':')[0];  // 'survey', 'dashboard', 'users', etc.

  return async function permissionMiddleware(req, res, next) {
    if (process.env.SKIP_AUTH === 'true') return next();

    const { userId, orgId } = req;
    if (!userId || !orgId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const resourceId = getResourceId ? getResourceId(req) : 'org';

    try {
      const allowed = await evaluatePermission(userId, orgId, resourceType, resourceId, action, req);

      if (!allowed) {
        // Audit denied access attempts for security monitoring
        auditLog({
          orgId,
          actorUserId: userId,
          actorType: 'user',
          eventType: 'permission.denied',
          targetResourceType: resourceType,
          targetResourceId: resourceId,
          afterState: { action, result: 'denied' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }).catch(() => {});

        return res.status(403).json({
          error: 'Insufficient permissions',
          required: action,
          resource: resourceId !== 'org' ? `${resourceType}:${resourceId}` : resourceType,
        });
      }

      // Attach permission context for downstream handlers
      req.permissionAction = action;
      req.permissionResourceId = resourceId;
      next();
    } catch (err) {
      console.error('requirePermission error:', err.message);
      // Fail closed — deny on error (never fail open)
      res.status(403).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Core permission evaluation — the algorithm from Section 2.
 * Returns true (allow) or false (deny).
 *
 * Evaluation order (stops at first definitive result):
 * 1. User inactive/deprovisioned → DENY
 * 2. User is super_admin → ALLOW
 * 3. Explicit resource-level DENY override → DENY
 * 4. Explicit resource-level ALLOW override → ALLOW
 * 5. Group-level permission for this resource → ALLOW/DENY
 * 6. Org-role default permission + scope check → ALLOW/DENY
 * 7. Default → DENY
 */
async function evaluatePermission(userId, orgId, resourceType, resourceId, action, req = null) {
  // Check cache first
  const redis = getRedisClient();
  const cacheKey = `perm:${userId}:${resourceType}:${resourceId}:${action}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        return cached === '1';
      }
    } catch { /* redis miss is non-fatal */ }
  }

  const result = await _evaluatePermissionUncached(userId, orgId, resourceType, resourceId, action, req);

  // Cache the result
  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, result ? '1' : '0');
    } catch { /* cache write failure is non-fatal */ }
  }

  return result;
}

async function _evaluatePermissionUncached(userId, orgId, resourceType, resourceId, action, req) {

  // STEP 1: Load user profile (single query — get everything we need)
  const { rows: [profile] } = await db.query(
    `SELECT
       up.is_active, up.deprovisioned_at, up.role_id,
       or2.builtin_key as role_key, or2.default_permissions
     FROM user_profiles up
     LEFT JOIN org_roles or2 ON or2.id = up.role_id
     WHERE up.user_id = $1 AND up.org_id = $2`,
    [userId, orgId]
  );

  // If no profile exists, deny (user not in this org's directory)
  if (!profile) return false;

  // STEP 1a: Deprovisioned or inactive users have zero access
  if (!profile.is_active || profile.deprovisioned_at) return false;

  // STEP 2: super_admin unconditional allow
  if (profile.role_key === 'org:super_admin') return true;

  // STEP 3 & 4: Resource-level overrides (explicit DENY beats explicit ALLOW)
  if (resourceId !== 'org') {
    const { rows: overrides } = await db.query(
      `SELECT effect FROM user_resource_permissions
       WHERE user_id = $1 AND org_id = $2
         AND resource_type = $3 AND resource_id = $4
         AND action = $5
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, orgId, resourceType, resourceId, action]
    );

    const deny = overrides.find(o => o.effect === 'deny');
    if (deny) return false;

    const allow = overrides.find(o => o.effect === 'allow');
    if (allow) return true;
  }

  // STEP 5: Group-level permissions for this resource
  if (resourceId !== 'org') {
    const { rows: groupPerms } = await db.query(
      `SELECT grp_perm.effect
       FROM user_group_members ugm
       JOIN user_group_resource_permissions grp_perm
         ON grp_perm.group_id = ugm.group_id
       WHERE ugm.user_id = $1 AND ugm.org_id = $2
         AND grp_perm.resource_type = $3
         AND grp_perm.resource_id = $4
         AND grp_perm.action = $5`,
      [userId, orgId, resourceType, resourceId, action]
    );

    const groupDeny = groupPerms.find(p => p.effect === 'deny');
    if (groupDeny) return false;

    const groupAllow = groupPerms.find(p => p.effect === 'allow');
    if (groupAllow) return true;
  }

  // STEP 6: Org-role default permissions + scope check
  if (!profile.default_permissions) return false;

  const actionScope = profile.default_permissions[action];
  if (!actionScope || actionScope === 'NONE') return false;
  if (actionScope === 'ALL') return true;

  if (actionScope === 'OWNED') {
    // Check if the resource is owned by this user
    return await checkResourceOwnership(userId, orgId, resourceType, resourceId);
  }

  if (actionScope === 'SHARED') {
    // Check if resource is explicitly shared with this user or their groups
    if (resourceId !== 'org') {
      const { rows: sharedPerms } = await db.query(
        `SELECT 1 FROM user_resource_permissions
         WHERE user_id = $1 AND org_id = $2
           AND resource_type = $3 AND resource_id = $4
           AND effect = 'allow'
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId, orgId, resourceType, resourceId]
      );
      if (sharedPerms.length > 0) return true;
    }
    return false;
  }

  // STEP 7: Default deny
  return false;
}

async function checkResourceOwnership(userId, orgId, resourceType, resourceId) {
  const tableMap = {
    survey: 'surveys',
    dashboard: 'dashboards',
    workflow: 'workflows',
  };
  const table = tableMap[resourceType];
  if (!table) return false;

  const { rows } = await db.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2 AND created_by = $3`,
    [resourceId, orgId, userId]
  );
  return rows.length > 0;
}

/**
 * Invalidate permission cache for a user (call after role/permission changes)
 */
async function invalidatePermissionCache(userId, specificKey = null) {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    if (specificKey) {
      await redis.del(specificKey);
    } else {
      // Invalidate all cached permissions for this user
      const keys = await redis.keys(`perm:${userId}:*`);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    }
  } catch (err) {
    console.error('Permission cache invalidation error:', err.message);
  }
}

module.exports = { requirePermission, evaluatePermission, invalidatePermissionCache };
```

### Integration with Existing Routes

```javascript
// Existing surveys route — add permission check
// backend/src/routes/surveys.js
const { requirePermission } = require('../middleware/requirePermission');

// Read a survey — check survey:read permission for this specific survey
router.get('/:id', requireAuth, requirePermission('survey:read', req => req.params.id), async (req, res) => {
  // ... existing handler
});

// View insights — check survey:insights:read
router.get('/:id/insights', requireAuth,
  requirePermission('survey:insights:read', req => req.params.id),
  async (req, res) => { /* ... */ }
);

// Export responses — check survey:responses:export
router.get('/:id/responses/export', requireAuth,
  requirePermission('survey:responses:export', req => req.params.id),
  async (req, res) => { /* ... */ }
);

// Manage users — org-wide check (no resource ID)
router.get('/api/users', requireAuth, requirePermission('users:manage'), async (req, res) => {
  // ... user list handler
});
```

---

## 13. SSO Attribute Mapping

**Priya Nair**

### Flow Overview

When a user authenticates via SAML SSO, Clerk handles the SAML assertion and issues a JWT. Clerk also fires a `user.created` or `session.created` webhook to Experient's webhook endpoint. Experient reads the SAML attributes from Clerk's `publicMetadata` and maps them to the `user_profiles` row.

```
User → Okta SSO → SAML Assertion → Clerk (processes SAML) → Issues JWT
                                        │
                                        ├─ user.created webhook (first login)
                                        └─ session.created webhook (subsequent)
                                             │
                                             ▼
                                    Experient webhook handler
                                    ├── Read SAML attrs from publicMetadata
                                    ├── Load org's attribute mapping config
                                    ├── Map attrs → user_profiles fields
                                    └── Upsert user_profiles row
```

### Attribute Mapping Configuration

Stored in a new `sso_attribute_mappings` table (or as JSONB in `org_profiles`):

```sql
CREATE TABLE sso_attribute_mappings (
  id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT  NOT NULL UNIQUE,
  mappings       JSONB NOT NULL DEFAULT '{}',
  -- Format: { "saml_attr_name": "experient_field", ... }
  -- Example: {
  --   "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/title": "job_title",
  --   "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department": "department_name",
  --   "costCenter": "cost_center",
  --   "managerEmail": "custom_attributes.manager_email",
  --   "businessUnit": "custom_attributes.business_unit",
  --   "employeeId": "employee_id"
  -- }
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Clerk Webhook Handler

```javascript
// routes/webhooks/clerk.js

const { Webhook } = require('svix');
const db = require('../../lib/db');
const { auditLog } = require('../../lib/auditLog');

router.post('/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verify Clerk webhook signature
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
  let event;

  try {
    event = wh.verify(req.body, {
      'svix-id':        req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const { type, data } = event;

  switch (type) {
    case 'user.created':
    case 'organizationMembership.created':
      await handleUserCreatedOrJoined(data);
      break;

    case 'user.updated':
      await handleUserUpdated(data);
      break;

    case 'organizationMembership.deleted':
      await handleMemberRemoved(data);
      break;

    case 'session.created':
      await handleSessionCreated(data);
      break;

    default:
      // Ignore unhandled event types
      break;
  }

  res.json({ received: true });
});

async function handleUserCreatedOrJoined(data) {
  // data.organization_id is set when this is org membership creation
  const orgId = data.organization?.id || data.organization_id;
  if (!orgId) return;  // Not an org event

  const userId = data.public_user_data?.user_id || data.user_id || data.id;
  if (!userId) return;

  // Load org's SAML attribute mapping
  const { rows: [mapping] } = await db.query(
    'SELECT mappings FROM sso_attribute_mappings WHERE org_id = $1',
    [orgId]
  );

  // Clerk stores SAML attributes in publicMetadata.samlAttributes
  const clerkMetadata = data.public_user_data?.public_metadata
    || data.unsafe_metadata
    || {};
  const samlAttrs = clerkMetadata.samlAttributes || {};

  // Apply mapping
  const profileUpdate = {
    user_id: userId,
    org_id: orgId,
    email: data.email_addresses?.[0]?.email_address || data.public_user_data?.identifier,
    first_name: data.first_name || data.public_user_data?.first_name,
    last_name: data.last_name || data.public_user_data?.last_name,
    provisioned_by: samlAttrs && Object.keys(samlAttrs).length ? 'sso' : 'invite',
  };

  if (mapping?.mappings) {
    await applySamlMapping(profileUpdate, samlAttrs, mapping.mappings, orgId);
  }

  // Recompute display_name
  profileUpdate.display_name = [profileUpdate.first_name, profileUpdate.last_name]
    .filter(Boolean).join(' ') || profileUpdate.email;

  // Resolve department_name → department_id if mapped
  if (profileUpdate._department_name) {
    profileUpdate.department_id = await resolveOrCreateDepartment(
      orgId, profileUpdate._department_name
    );
    delete profileUpdate._department_name;
  }

  // Upsert user_profiles
  await db.query(
    `INSERT INTO user_profiles (user_id, org_id, email, first_name, last_name, display_name,
       job_title, department_id, cost_center, employee_id, timezone, locale,
       custom_attributes, provisioned_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id) DO UPDATE SET
       email         = EXCLUDED.email,
       first_name    = EXCLUDED.first_name,
       last_name     = EXCLUDED.last_name,
       display_name  = EXCLUDED.display_name,
       job_title     = COALESCE(EXCLUDED.job_title, user_profiles.job_title),
       department_id = COALESCE(EXCLUDED.department_id, user_profiles.department_id),
       cost_center   = COALESCE(EXCLUDED.cost_center, user_profiles.cost_center),
       employee_id   = COALESCE(EXCLUDED.employee_id, user_profiles.employee_id),
       custom_attributes = user_profiles.custom_attributes || EXCLUDED.custom_attributes,
       updated_at    = NOW()`,
    [
      profileUpdate.user_id, profileUpdate.org_id, profileUpdate.email,
      profileUpdate.first_name, profileUpdate.last_name, profileUpdate.display_name,
      profileUpdate.job_title || null, profileUpdate.department_id || null,
      profileUpdate.cost_center || null, profileUpdate.employee_id || null,
      profileUpdate.timezone || 'UTC', profileUpdate.locale || 'en',
      JSON.stringify(profileUpdate.custom_attributes || {}),
      profileUpdate.provisioned_by,
    ]
  );

  await auditLog({
    orgId,
    actorType: 'clerk_webhook',
    targetUserId: userId,
    targetResourceType: 'user',
    targetResourceId: userId,
    eventType: 'user.created',
    afterState: { email: profileUpdate.email, provisioned_by: profileUpdate.provisioned_by },
  });
}

async function applySamlMapping(profileUpdate, samlAttrs, mappings, orgId) {
  for (const [samlAttr, experientField] of Object.entries(mappings)) {
    const value = samlAttrs[samlAttr];
    if (value === undefined || value === null) continue;

    if (experientField.startsWith('custom_attributes.')) {
      const key = experientField.replace('custom_attributes.', '');
      if (!profileUpdate.custom_attributes) profileUpdate.custom_attributes = {};
      profileUpdate.custom_attributes[key] = value;
    } else if (experientField === 'department_name') {
      // Store temporarily; resolved to department_id after this function
      profileUpdate._department_name = value;
    } else {
      profileUpdate[experientField] = value;
    }
  }
}

async function handleSessionCreated(data) {
  // Update last_seen_at for the user
  const userId = data.user_id;
  if (!userId) return;

  await db.query(
    'UPDATE user_profiles SET last_seen_at = NOW() WHERE user_id = $1',
    [userId]
  ).catch(() => {});  // Non-fatal

  // Audit login
  const orgId = data.active_organization_id;
  if (orgId) {
    await auditLog({
      orgId,
      actorUserId: userId,
      actorType: 'user',
      eventType: 'user.login',
      targetUserId: userId,
      targetResourceType: 'user',
      targetResourceId: userId,
      ipAddress: data.client?.ip_address || null,
    });
  }
}
```

### UI: Attribute Mapping Configuration

On the SCIM/Provisioning page (Section 7f), there's an additional section for SAML Attribute Mapping:

```
─── SAML Attribute Mapping ─────────────────────────────────────────────────

These attributes are sent by your Identity Provider during SSO login.
Map each attribute to an Experient user profile field.

Common Okta SAML attributes your IdP may send:
┌──────────────────────────────────────────────┬──────────────────────────┐
│ SAML Attribute Name                          │ Map to Experient Field   │
├──────────────────────────────────────────────┼──────────────────────────┤
│ title                                        │ [Job Title ▾]            │
│ department                                   │ [Department ▾]           │
│ costCenter                                   │ [Cost Center ▾]          │
│ managerEmail                                 │ [Custom: manager_email ▾]│
│ employeeId                                   │ [Employee ID ▾]          │
│ businessUnit                                 │ [Custom: business_unit ▾]│
│ [+ Add custom mapping]                       │                          │
└──────────────────────────────────────────────┴──────────────────────────┘

[Save Mapping]

Note: Attributes mapped here are applied on each SSO login.
SCIM attributes (from Section above) are applied during provisioning sync.
```

---

## 14. Migration Plan from Current State

**Emma Thompson + Chen Wei**

### Current State Assessment

The existing system:
- **Auth**: Clerk-only, JWT verified in `middleware/auth.js`
- **Roles**: `requireRole` middleware checks `org:admin` or `org:analyst` from Clerk JWT (3 hardcoded roles)
- **Member management**: `routes/members.js` calls Clerk Admin API directly
- **No user_profiles table**: All user data in Clerk
- **No audit log**: No compliance trail
- **No SCIM**: Manual user management only

All existing routes use `requireRole('admin')` or `requireRole('analyst')`. The new system must be backward-compatible — existing routes keep working while new routes use the full permission system.

### Migration Steps

#### Step 1: Database Migrations (Week 1)

**Migration file: `supabase/migrations/20260603000010_user_directory_core.sql`**

```sql
-- Part 1: Core tables
-- (Full SQL from Section 3 above)

-- Seed built-in roles for all existing orgs
-- This inserts the 7 built-in roles into org_roles for every org_id found in org_profiles
INSERT INTO org_roles (org_id, name, description, is_builtin, builtin_key, default_permissions, seat_weight)
SELECT
  op.org_id,
  r.name,
  r.description,
  TRUE,
  r.builtin_key,
  r.default_permissions::JSONB,
  r.seat_weight
FROM org_profiles op
CROSS JOIN (VALUES
  ('Super Admin', 'Full platform control', 'org:super_admin',
   '{"survey:read":"ALL","survey:write":"ALL","survey:distribute":"ALL","survey:insights:read":"ALL","survey:insights:generate":"ALL","survey:responses:export":"ALL","survey:delete":"ALL","dashboard:read":"ALL","alerts:manage":"ALL","workflows:manage":"ALL","users:manage":"ALL","billing:manage":"ALL"}',
   1.0),
  ('Admin', 'Manage users and all surveys', 'org:admin',
   '{"survey:read":"ALL","survey:write":"ALL","survey:distribute":"ALL","survey:insights:read":"ALL","survey:insights:generate":"ALL","survey:responses:export":"ALL","survey:delete":"ALL","dashboard:read":"ALL","alerts:manage":"ALL","workflows:manage":"ALL","users:manage":"ALL","billing:manage":"NONE"}',
   1.0),
  ('Program Admin', 'Manage own survey programs', 'org:program_admin',
   '{"survey:read":"OWNED","survey:write":"OWNED","survey:distribute":"OWNED","survey:insights:read":"OWNED","survey:insights:generate":"OWNED","survey:responses:export":"OWNED","survey:delete":"OWNED","dashboard:read":"ALL","alerts:manage":"OWNED","workflows:manage":"ALL","users:manage":"NONE","billing:manage":"NONE"}',
   1.0),
  ('Analyst', 'Read all surveys and insights', 'org:analyst',
   '{"survey:read":"ALL","survey:write":"NONE","survey:distribute":"NONE","survey:insights:read":"ALL","survey:insights:generate":"ALL","survey:responses:export":"ALL","survey:delete":"NONE","dashboard:read":"ALL","alerts:manage":"NONE","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}',
   1.0),
  ('Survey Creator', 'Create and manage own surveys', 'org:survey_creator',
   '{"survey:read":"OWNED","survey:write":"OWNED","survey:distribute":"OWNED","survey:insights:read":"OWNED","survey:insights:generate":"OWNED","survey:responses:export":"NONE","survey:delete":"OWNED","dashboard:read":"OWNED","alerts:manage":"OWNED","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}',
   1.0),
  ('Report Viewer', 'View shared dashboards', 'org:report_viewer',
   '{"survey:read":"SHARED","survey:write":"NONE","survey:distribute":"NONE","survey:insights:read":"SHARED","survey:insights:generate":"NONE","survey:responses:export":"NONE","survey:delete":"NONE","dashboard:read":"SHARED","alerts:manage":"NONE","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}',
   0.5),
  ('Member', 'Survey respondents only', 'org:member',
   '{"survey:read":"NONE","survey:write":"NONE","survey:distribute":"NONE","survey:insights:read":"NONE","survey:insights:generate":"NONE","survey:responses:export":"NONE","survey:delete":"NONE","dashboard:read":"NONE","alerts:manage":"NONE","workflows:manage":"NONE","users:manage":"NONE","billing:manage":"NONE"}',
   0.0)
) AS r(name, description, builtin_key, default_permissions, seat_weight)
ON CONFLICT (org_id, builtin_key) DO NOTHING;
```

#### Step 2: Add plan fields to org_profiles

**Migration: `supabase/migrations/20260603000011_org_plan_tier.sql`**

```sql
ALTER TABLE org_profiles
  ADD COLUMN IF NOT EXISTS plan_tier    TEXT NOT NULL DEFAULT 'starter'
                                        CHECK (plan_tier IN ('starter','growth','enterprise')),
  ADD COLUMN IF NOT EXISTS seat_limit   INT  NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ;
```

#### Step 3: Backfill user_profiles from Clerk

**One-time script: `backend/scripts/backfillUserProfiles.js`**

```javascript
// Run once to populate user_profiles from existing Clerk members
// Usage: node scripts/backfillUserProfiles.js

const { createClerkClient } = require('@clerk/backend');
const db = require('../src/lib/db');
require('dotenv').config();

async function backfill() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  // Get all orgs from org_profiles
  const { rows: orgs } = await db.query('SELECT org_id FROM org_profiles');
  console.log(`Backfilling ${orgs.length} orgs...`);

  for (const { org_id: orgId } of orgs) {
    console.log(`Processing org: ${orgId}`);

    // Fetch all members from Clerk
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const list = await clerk.organizations.getOrganizationMembershipList({
        organizationId: orgId,
        limit,
        offset,
      });

      for (const membership of list.data) {
        const userData = membership.publicUserData;
        const userId = userData?.userId;
        if (!userId) continue;

        // Determine initial role based on Clerk role
        let roleBuiltinKey = 'org:member';
        if (membership.role === 'org:admin') roleBuiltinKey = 'org:admin';
        else if (membership.role === 'org:analyst') roleBuiltinKey = 'org:analyst';

        const { rows: [role] } = await db.query(
          'SELECT id FROM org_roles WHERE org_id = $1 AND builtin_key = $2',
          [orgId, roleBuiltinKey]
        );

        await db.query(
          `INSERT INTO user_profiles (user_id, org_id, email, first_name, last_name, display_name, role_id, provisioned_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'invite')
           ON CONFLICT (user_id) DO NOTHING`,
          [
            userId, orgId,
            userData.identifier || '',
            userData.firstName || null,
            userData.lastName || null,
            [userData.firstName, userData.lastName].filter(Boolean).join(' ') || userData.identifier || '',
            role?.id || null,
          ]
        );
      }

      hasMore = list.data.length === limit;
      offset += limit;
    }

    console.log(`  Done: ${orgId}`);
  }

  console.log('Backfill complete.');
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
```

#### Step 4: Add requirePermission alongside requireRole

The existing `requireRole` middleware continues to work. New routes use `requirePermission`. Existing routes are migrated progressively over Phase 2 (Weeks 3-4).

**Backward compatibility adapter:**

```javascript
// middleware/requireRole.js — update to also check user_profiles
// Keep existing Clerk-based check for backward compat,
// but also update req.orgRole from our extended role system

function requireRole(minRole) {
  const minRoleKey = `org:${minRole}`;
  const minRank = ROLE_RANK[minRoleKey] ?? 0;

  return async function (req, res, next) {
    if (process.env.SKIP_AUTH === 'true') return next();

    // Existing Clerk-based check (unchanged)
    try {
      const token = req.headers.authorization?.slice(7);
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const payload = await clerk.verifyToken(token);
      const orgRole = payload.org_role ?? null;
      const rank = orgRole ? (ROLE_RANK[orgRole] ?? 0) : 0;

      if (rank < minRank) {
        // Fall through to new permission system check
        // (existing admin may now have org:program_admin in our system)
        const { rows: [profile] } = await db.query(
          `SELECT or2.builtin_key
           FROM user_profiles up
           JOIN org_roles or2 ON or2.id = up.role_id
           WHERE up.user_id = $1 AND up.org_id = $2`,
          [payload.sub, payload.org_id]
        );

        const extendedRole = profile?.builtin_key;
        const extendedRank = extendedRole ? (ROLE_RANK[extendedRole] ?? 0) : 0;

        if (extendedRank < minRank) {
          return res.status(403).json({
            error: 'Insufficient role',
            required: minRoleKey,
            current: extendedRole || orgRole,
          });
        }
      }

      req.orgRole = orgRole;
      next();
    } catch (err) {
      console.error('requireRole error:', err.message);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
```

#### Step 5: Deploy SCIM Endpoint

SCIM routes mount at `/scim/v2` — completely separate namespace from `/api`. No breaking changes. IT admins can begin SCIM configuration immediately after deployment.

#### Step 6: Launch Admin Console

Settings section `/app/settings/users` added to the SideNav as a sub-menu under the existing Settings icon. No existing routes are changed.

---

## 15. Patricia's Enterprise Validation

**Patricia Holloway, IT Director, Fortune 500 Insurance Company**

> "I've evaluated Qualtrics, Medallia, InMoment, and Confirmit. Here's what I need before I can get this through procurement."

---

**Question 1:** "Can I provision 5,000 users from Okta without touching Experient manually?"

**Answer:** Yes, completely automated. Configure Okta with Experient's SCIM endpoint URL and a Bearer token (both available in Settings → Users → Provisioning). Okta's initial sync provisions all 5,000 users automatically. Ongoing adds/updates/removes happen within Okta's sync cycle (typically every 4 hours, or immediately on push provisioning). You never touch Experient manually for standard user lifecycle management.

---

**Question 2:** "When Jane leaves the company, will her Okta deprovision remove her access within 5 minutes?"

**Answer:** Yes. When you deprovision Jane in Okta (or she's removed from the synced user set), Okta sends a PATCH request to `/scim/v2/Users/:janeId` with `active: false`. Within the SCIM request handler (< 500ms), Experient: sets `deprovisioned_at = NOW()`, removes Jane from the Clerk org, and revokes all active Clerk sessions via the Clerk Admin API. Jane cannot log in or access any Experient resource the moment the SCIM request is processed. The 5-minute SLA assumes Okta's push provisioning is enabled (not schedule-based sync). If Okta is configured for push provisioning, deprovisioning is effectively immediate (< 30 seconds end-to-end from Okta trigger to access revocation).

---

**Question 3:** "Can I give the VP of CX access to all surveys, but restrict the analyst to only see surveys from their division?"

**Answer:** Yes — this is exactly what resource-level permissions are designed for. The VP of CX gets role `org:analyst` which grants `survey:read: ALL`. The analyst also gets `org:analyst` but with resource-level overrides:

```
For analyst Jane Smith:
- Default role: org:analyst (survey:read: ALL)
- Resource override: survey:read DENIED on all surveys EXCEPT APAC division surveys
```

Or more elegantly using user groups:
- Create "APAC Surveys" group → add all APAC surveys as a group with `survey:read: ALLOWED` group permission
- Assign analyst to "APAC Surveys" group only
- Crystal automatically segments her insights to APAC survey data

---

**Question 4:** "Do you have a SOC 2 audit log I can give my security team?"

**Answer:** Yes. Every user action is recorded in an immutable audit log (no updates or deletes are possible at the DB level). Events include: user login, role changes, data exports, SCIM provisioning/deprovisioning, session revocations, and admin actions. Enterprise plan retains 1 year of audit data. The audit log is exportable as CSV from Settings → Audit Log. The event types covered satisfy SOC 2 Type II controls CC6.1 (Logical Access), CC6.2 (Provisioning), and CC6.3 (Deprovisioning).

---

**Question 5:** "Can we send the quarterly NPS survey only to employees in the 'Enterprise Customers' Okta group?"

**Answer:** Yes. When you configure SCIM, Okta group sync is included. The "Enterprise Customers" Okta group syncs to an Experient SCIM-synced user group automatically. When creating your NPS survey distribution, select "User Group" and pick "Enterprise Customers" from the dropdown. The survey is distributed only to those users. Crystal will segment insights specifically for this group: response rate, NPS score, and trend over time — with automatic comparison against other groups.

---

**Question 6:** "Our SAML attributes include 'costCenter' and 'managerEmail' — can you map those?"

**Answer:** Yes. In Settings → Users → Provisioning, the SAML Attribute Mapping section lets you map any SAML attribute your IdP sends to any Experient user profile field. Map `costCenter` → Cost Center field, and `managerEmail` → Custom Attribute "manager_email". These values are applied automatically on every SSO login — no manual data entry. For `managerEmail`, Crystal can use this for manager-subordinate relationship analysis ("manager coaching recommendations" from survey feedback).

---

**Question 7:** "We have 500 users on Starter plan today, we need to know exactly how seat counting works."

**Answer:** On Starter plan (5-seat limit), your 500 users would need a plan upgrade. Here's exactly how seats are counted:

- Any user with role `org:admin`, `org:analyst`, `org:survey_creator`, or `org:program_admin` = 1.0 billable seat
- Any user with role `org:report_viewer` = 0.5 billable seat
- Survey respondents with role `org:member` = 0 seats (free)
- Deprovisioned users = 0 seats

A typical enterprise deployment with 500 users might have: 5 admins (5 seats) + 50 analysts (50 seats) + 200 creators (200 seats) + 245 viewers (122.5 seats) = 377.5 billable seats. Members who only fill out surveys: unlimited, free. Growth plan covers 25 seats; Enterprise is unlimited. We provide a seat usage dashboard with role-by-role breakdown and history chart.

---

## 16. Implementation Roadmap

**Sprint-by-Sprint Plan**

### Phase 1: Core Foundation (Weeks 1-2)

**Goal:** user_profiles table live, basic Admin Console user list

**Week 1 — Backend:**
- [ ] Migration: `20260603000010_user_directory_core.sql` (user_profiles, org_roles, departments, user_groups, user_group_members, org_custom_fields, scim_tokens, seat_usage, user_audit_log)
- [ ] Migration: `20260603000011_org_plan_tier.sql` (plan_tier, seat_limit)
- [ ] Backfill script: `scripts/backfillUserProfiles.js`
- [ ] Seed built-in roles for all existing orgs
- [ ] `auditLog` helper library
- [ ] `GET /api/users` with full filter/pagination
- [ ] `GET /api/users/:id` user profile detail
- [ ] `PUT /api/users/:id` update profile (admin only)
- [ ] `POST /api/users/:id/deactivate` soft-deactivate
- [ ] Clerk webhook handler (`user.created`, `session.created`)

**Week 2 — Frontend:**
- [ ] `UserDirectoryPage.tsx` — full member table with search/filter
- [ ] `UserDetailDrawer.tsx` — right-side Sheet component
- [ ] `InviteUserModal.tsx` — invite flow
- [ ] Add `/app/settings/users` to ROUTES and SideNav (Settings submenu)
- [ ] `useUsers` hook for API integration

**Deliverable:** IT admins can view, search, and edit all org users from Admin Console.

---

### Phase 2: Custom Roles & Permission System (Weeks 3-4)

**Goal:** `hasPermission` middleware live, roles UI

**Week 3 — Backend:**
- [ ] `requirePermission` middleware (full implementation from Section 12)
- [ ] `GET /api/roles`, `POST /api/roles`, `PUT /api/roles/:id`, `DELETE /api/roles/:id`
- [ ] `PUT /api/users/:id/role` — change org-level role + invalidate permission cache
- [ ] `POST /api/users/:id/permissions` — grant resource-level permission
- [ ] `DELETE /api/users/:id/permissions/:id` — revoke resource-level permission
- [ ] Redis permission cache integration
- [ ] Apply `requirePermission` to survey, insights, and export routes

**Week 4 — Frontend:**
- [ ] `RolesPage.tsx` — permission matrix + built-in role view
- [ ] `CreateCustomRoleModal.tsx` — role builder wizard
- [ ] `ResourcePermissionsSection.tsx` — in UserDetailDrawer
- [ ] `PermissionGate` updated to use extended role system

**Deliverable:** Full RBAC live — existing tests still pass, new permission system active.

---

### Phase 3: Departments, Groups & SCIM Core (Weeks 5-6)

**Goal:** SCIM endpoint accepting Okta/Azure AD provisioning

**Week 5 — Backend:**
- [ ] `GET /api/departments`, `POST /api/departments`, `PUT`, `DELETE`
- [ ] Department tree API with user counts
- [ ] `GET /api/groups`, `POST /api/groups`, `GET /api/groups/:id`, `PUT`, `DELETE`
- [ ] Static group member management
- [ ] SCIM auth middleware (`scimAuth.js`)
- [ ] `POST /scim/v2/Users` — provision user
- [ ] `PATCH /scim/v2/Users/:id` — update + deprovision
- [ ] `GET /scim/v2/Users` — list users (Okta initial sync)
- [ ] `GET /scim/v2/ServiceProviderConfig`
- [ ] `POST /api/scim/tokens` — generate token

**Week 6 — Frontend:**
- [ ] `DepartmentsPage.tsx` — collapsible tree with user counts
- [ ] `GroupsPage.tsx` — group list + create group wizard
- [ ] `ProvisioningPage.tsx` (basic) — generate token, SCIM URL

**Deliverable:** Okta/Azure AD can provision users end-to-end. Patricia's team can test SCIM.

---

### Phase 4: Full SCIM + SSO Attribute Mapping (Weeks 7-8)

**Goal:** Complete SCIM implementation + SAML attribute mapping

**Week 7 — Backend:**
- [ ] SCIM Groups endpoints (`POST/GET/PUT/DELETE /scim/v2/Groups`)
- [ ] SCIM sync log (`GET /api/scim/sync-log`)
- [ ] SSO attribute mapping (`sso_attribute_mappings` table + Clerk webhook handler)
- [ ] Dynamic group rule evaluation engine
- [ ] Dynamic group materialization (15-min cron + on-demand)

**Week 8 — Frontend:**
- [ ] `ProvisioningPage.tsx` — complete (attribute mapping UI, sync status, sync log)
- [ ] SAML attribute mapping configuration UI
- [ ] Group detail view (member list + targeted surveys + Crystal segments)
- [ ] Dynamic group rule builder UI

**Deliverable:** Full SCIM 2.0 compliance. SAML attribute sync live. Patricia can configure Okta groups.

---

### Phase 5: Seat Licensing + Audit Log (Weeks 9-10)

**Goal:** Compliance-grade audit log, seat enforcement

**Week 9 — Backend:**
- [ ] `GET /api/seats`, `GET /api/seats/breakdown`
- [ ] Seat limit enforcement on invite + SCIM provision
- [ ] Grace period logic
- [ ] `GET /api/audit-logs` with full filter/export
- [ ] CSV export for audit log

**Week 10 — Frontend:**
- [ ] `SeatsPage.tsx` — usage meter, by-role breakdown, history chart
- [ ] Audit Log page (`/app/settings/audit-log`)
- [ ] Upgrade prompt components (seat limit reached)
- [ ] Plan tier gating for Enterprise features (feature flags)

**Deliverable:** SOC 2 audit trail live. Seat usage dashboard. Enterprise feature gates active.

---

### Phase 6: Crystal Integration + Dynamic Groups (Weeks 11-12)

**Goal:** Crystal can segment insights by user attributes and groups

**Week 11 — Crystal (crystalos):**
- [ ] `crystalos/crystal/tools/user_directory.py` — three new Crystal tools
- [ ] Register tools in `crystalos/crystal/registry.py`
- [ ] `backend/src/routes/internal/userDirectory.js` — internal Crystal routes
- [ ] Crystal system prompt update: describe available user segmentation capabilities

**Week 12 — Integration:**
- [ ] Survey distribution UI updated to support department + group targeting
- [ ] Crystal insights UI: show segment labels on charts ("Engineering vs Marketing")
- [ ] Crystal alert configuration: "alert when group sentiment drops below threshold"
- [ ] End-to-end testing: full SCIM → Crystal segmentation flow

**Deliverable:** Crystal can answer "How does Engineering compare to CS?" using real user directory data. Survey distribution targets groups and departments.

---

## Appendix: Complete Migration SQL Files

### Migration 1: Core User Directory Tables

File: `supabase/migrations/20260603000010_user_directory_core.sql`

Includes (in dependency order):
1. `org_roles` table
2. `departments` table
3. `user_profiles` table (references departments, org_roles)
4. `user_resource_permissions` table
5. `user_groups` table
6. `user_group_members` table (with member_count triggers)
7. `org_custom_fields` table
8. `scim_tokens` table
9. `seat_usage` table
10. `user_audit_log` table
11. `sso_attribute_mappings` table
12. All indexes
13. Seed built-in roles for existing orgs

### Migration 2: Org Plan Fields

File: `supabase/migrations/20260603000011_org_plan_tier.sql`

Adds `plan_tier`, `seat_limit`, `grace_period_end` to `org_profiles`.

### Migration 3: User Group Resource Permissions

File: `supabase/migrations/20260603000012_user_group_permissions.sql`

```sql
CREATE TABLE user_group_resource_permissions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  group_id             UUID        NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  resource_type        TEXT        NOT NULL,
  resource_id          TEXT        NOT NULL,
  action               TEXT        NOT NULL,
  effect               TEXT        NOT NULL DEFAULT 'allow'
                       CHECK (effect IN ('allow', 'deny')),
  granted_by           TEXT,
  granted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_group_resource_permission
    UNIQUE (org_id, group_id, resource_type, resource_id, action)
);

CREATE INDEX idx_grp_perm_group     ON user_group_resource_permissions(group_id);
CREATE INDEX idx_grp_perm_resource  ON user_group_resource_permissions(resource_type, resource_id);
```

---

*Document version 1.0 — Design-complete. Ready for sprint planning.*  
*Next review: After Phase 2 delivery (end of Week 4).*
