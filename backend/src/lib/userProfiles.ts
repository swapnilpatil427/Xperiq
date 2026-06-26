// Helpers for reading/writing user_profiles and seeding built-in roles.
// Used by the users/roles routes, the Clerk-backfill script, and (later) the
// invite + SCIM flows.
import { query } from './db';
import { BUILTIN_ROLES } from './rbac';

/**
 * Idempotently seed the 7 built-in roles for an org. Safe to call repeatedly
 * (ON CONFLICT DO NOTHING). New orgs created after the core migration need this
 * since the migration only seeds orgs that existed at migrate time.
 */
export async function ensureBuiltinRoles(orgId: string): Promise<void> {
  for (const r of BUILTIN_ROLES) {
    await query(
      `INSERT INTO org_roles (org_id, name, description, is_builtin, builtin_key, default_permissions, seat_weight)
       VALUES ($1,$2,$3,TRUE,$4,$5::jsonb,$6)
       ON CONFLICT (org_id, builtin_key) DO NOTHING`,
      [orgId, r.name, r.description, r.builtinKey, JSON.stringify(r.permissions), r.seatWeight]
    );
  }
}

/** Look up a role id by built-in key for an org (seeding roles first if absent). */
export async function getRoleIdByBuiltinKey(orgId: string, builtinKey: string): Promise<string | null> {
  let { rows } = await query(
    'SELECT id FROM org_roles WHERE org_id = $1 AND builtin_key = $2',
    [orgId, builtinKey]
  );
  if (rows.length === 0) {
    await ensureBuiltinRoles(orgId);
    ({ rows } = await query(
      'SELECT id FROM org_roles WHERE org_id = $1 AND builtin_key = $2',
      [orgId, builtinKey]
    ));
  }
  return (rows[0] as { id?: string } | undefined)?.id || null;
}

/** Fetch a single profile (or null). */
export async function getProfile(userId: string, orgId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await query(
    `SELECT up.*, r.builtin_key AS role_key, r.name AS role_name,
            r.default_permissions, r.seat_weight
       FROM user_profiles up
       LEFT JOIN org_roles r ON r.id = up.role_id
      WHERE up.user_id = $1 AND up.org_id = $2`,
    [userId, orgId]
  );
  return (rows[0] as Record<string, unknown> | undefined) || null;
}

/**
 * Insert or update a profile from Clerk-sourced identity data.
 * Does not touch role_id on update unless roleId is explicitly provided.
 */
export async function upsertProfileFromClerk({
  userId, orgId, email, firstName = null, lastName = null,
  avatarUrl = null, roleId = null, provisionedBy = 'invite',
}: {
  userId: string;
  orgId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  roleId?: string | null;
  provisionedBy?: string;
}): Promise<Record<string, unknown>> {
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || email || userId;

  const { rows } = await query(
    `INSERT INTO user_profiles
       (user_id, org_id, email, first_name, last_name, display_name, avatar_url, role_id, provisioned_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id) DO UPDATE SET
       email        = EXCLUDED.email,
       first_name   = COALESCE(EXCLUDED.first_name, user_profiles.first_name),
       last_name    = COALESCE(EXCLUDED.last_name, user_profiles.last_name),
       display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
       avatar_url   = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
       role_id      = COALESCE(EXCLUDED.role_id, user_profiles.role_id),
       updated_at   = NOW()
     RETURNING *`,
    [userId, orgId, email, firstName, lastName, displayName, avatarUrl, roleId, provisionedBy]
  );
  return rows[0] as Record<string, unknown>;
}
