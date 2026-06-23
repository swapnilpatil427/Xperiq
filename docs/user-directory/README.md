# Experient User Directory Service — Documentation Index

**Status:** Design-Complete  
**Version:** 1.0  
**Date:** 2026-06-03

---

## Primary Document

[USER_DIRECTORY_SERVICE.md](./USER_DIRECTORY_SERVICE.md) — Full design document (production-grade, implementation-ready)

---

## Section Index

| Section | Topic | Key Output |
|---|---|---|
| 1 | [Executive Summary & Clerk Boundary](./USER_DIRECTORY_SERVICE.md#1-executive-summary--clerk-boundary-decision) | Architecture diagram, Clerk vs Experient responsibility table, SCIM answer for enterprise IT |
| 2 | [Role & Permission System](./USER_DIRECTORY_SERVICE.md#2-enterprise-role--permission-system) | 7 built-in roles, permission matrix, evaluation algorithm, custom role schema |
| 3 | [Extended User Profile Schema](./USER_DIRECTORY_SERVICE.md#3-extended-user-profile-schema) | Full SQL for 11 tables: user_profiles, departments, org_roles, user_resource_permissions, user_groups, user_group_members, org_custom_fields, user_audit_log, scim_tokens, seat_usage, sso_attribute_mappings |
| 4 | [SCIM 2.0 Provisioning](./USER_DIRECTORY_SERVICE.md#4-scim-20-provisioning-endpoint) | Full SCIM endpoint catalog, scimAuth middleware, POST /scim/v2/Users implementation, PATCH deprovision implementation |
| 5 | [Department Hierarchy](./USER_DIRECTORY_SERVICE.md#5-department--team-hierarchy) | Adjacency list schema, tree API, survey distribution SQL, Crystal integration |
| 6 | [User Groups](./USER_DIRECTORY_SERVICE.md#6-user-groups-for-survey-targeting) | Static/Dynamic/SCIM-synced groups, rule engine, dynamic group evaluation code |
| 7 | [Admin Console UI](./USER_DIRECTORY_SERVICE.md#7-admin-console-ui) | ASCII wireframes for 7 pages: User Directory, User Drawer, Roles, Departments, Groups, SCIM Setup, Seats |
| 8 | [Seat Licensing](./USER_DIRECTORY_SERVICE.md#8-seat-licensing--enforcement) | Seat weight table, enforcement logic, grace period, plan tier feature matrix |
| 9 | [Compliance Audit Log](./USER_DIRECTORY_SERVICE.md#9-compliance-audit-log) | Immutable audit log schema, auditLog helper, audit log API, UI wireframe |
| 10 | [Crystal Integration](./USER_DIRECTORY_SERVICE.md#10-crystal-user-context-integration) | 4 new Crystal tools (Python), internal backend routes, survey distribution integration |
| 11 | [Backend API Design](./USER_DIRECTORY_SERVICE.md#11-backend-api-design) | Complete route catalog (40+ endpoints), GET /api/users implementation, seats breakdown implementation |
| 12 | [hasPermission Middleware](./USER_DIRECTORY_SERVICE.md#12-haspermission-middleware) | Full production implementation with Redis cache, 6-step evaluation algorithm |
| 13 | [SSO Attribute Mapping](./USER_DIRECTORY_SERVICE.md#13-sso-attribute-mapping) | Clerk webhook handler, SAML attribute mapping config, sso_attribute_mappings table |
| 14 | [Migration Plan](./USER_DIRECTORY_SERVICE.md#14-migration-plan-from-current-state) | SQL migrations, backfill script, backward-compatibility adapter for requireRole |
| 15 | [Patricia's Enterprise Validation](./USER_DIRECTORY_SERVICE.md#15-patricias-enterprise-validation) | 7 enterprise procurement questions answered directly from the design |
| 16 | [Implementation Roadmap](./USER_DIRECTORY_SERVICE.md#16-implementation-roadmap) | 12-week sprint plan, 6 phases, deliverables per phase |

---

## Key Design Decisions

**1. Clerk = auth surface only.** Clerk handles sessions and SAML SSO login. Experient Postgres is the source of truth for all user attributes and authorization. Clerk's publicMetadata is not used for enterprise attributes.

**2. Two-layer RBAC.** Org-level roles (7 built-in + custom) set defaults. Resource-level permissions (user_resource_permissions) override per-resource. Group permissions apply to all group members. Evaluation is strict deny-by-default.

**3. SCIM uses separate Bearer token auth.** SCIM provisioners (Okta, Azure AD) are server processes — they do not have Clerk JWTs. SCIM endpoints at /scim/v2/ use scim_tokens table for auth, completely separate from /api/ routes.

**4. Audit log is append-only at DB level.** UPDATE and DELETE on user_audit_log are revoked from the application DB user. This is a hard compliance requirement for SOC 2.

**5. Permission cache in Redis.** All permission evaluations are cached for 5 minutes per (userId, resourceType, resourceId, action). Cache is invalidated on role change, permission grant/revoke, or group membership change.

**6. Department path[] array for efficient subtree queries.** The departments table maintains a path TEXT[] column caching the full ancestry path. This enables single-query subtree traversal without recursive CTEs — critical for survey distribution to "Engineering division" (includes all 4 sub-teams).

**7. Dynamic groups are materialized.** Group membership is stored in user_group_members even for dynamic groups. Materialization runs on profile update + 15-min cron. This keeps permission lookups O(1) instead of re-evaluating rules on every request.

---

## Files to Create (Implementation)

### Backend
- `backend/src/routes/users.js`
- `backend/src/routes/roles.js`
- `backend/src/routes/departments.js`
- `backend/src/routes/groups.js`
- `backend/src/routes/scim.js`
- `backend/src/routes/auditLogs.js`
- `backend/src/routes/seats.js`
- `backend/src/routes/internal/userDirectory.js`
- `backend/src/middleware/requirePermission.js`
- `backend/src/middleware/scimAuth.js`
- `backend/src/lib/auditLog.js`
- `backend/src/lib/dynamicGroups.js`
- `backend/scripts/backfillUserProfiles.js`
- `backend/src/routes/webhooks/clerk.js`

### Frontend
- `app/src/pages/UserDirectoryPage.tsx`
- `app/src/pages/RolesPage.tsx`
- `app/src/pages/DepartmentsPage.tsx`
- `app/src/pages/GroupsPage.tsx`
- `app/src/pages/ProvisioningPage.tsx`
- `app/src/pages/SeatsPage.tsx`
- `app/src/components/UserDetailDrawer.tsx`
- `app/src/components/InviteUserModal.tsx`
- `app/src/components/CreateCustomRoleModal.tsx`
- `app/src/hooks/useUsers.ts`
- `app/src/hooks/useDepartments.ts`
- `app/src/hooks/useGroups.ts`

### Database Migrations
- `supabase/migrations/20260603000010_user_directory_core.sql`
- `supabase/migrations/20260603000011_org_plan_tier.sql`
- `supabase/migrations/20260603000012_user_group_permissions.sql`

### CrystalOS
- `crystalos/crystal/tools/user_directory.py`
- Update `crystalos/crystal/registry.py` to register USER_DIRECTORY_TOOLS
