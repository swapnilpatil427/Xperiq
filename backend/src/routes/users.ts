// Enterprise User Directory — user management API.
// Mounted at /api/users. All routes require requireAuth + users:manage permission.
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { requirePermission, invalidatePermissionCache } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { serverError, clientError } from '../lib/httpError';
import { auditLog } from '../lib/auditLog';
import { inviteUserSchema, updateUserSchema } from '../schemas/users';
import { getRoleIdByBuiltinKey, upsertProfileFromClerk } from '../lib/userProfiles';
import { evaluateDynamicGroupsForOrg } from '../lib/dynamicGroups';
import { checkSeatLimit } from '../lib/seats';

const router = express.Router();

// Columns safe to expose on the directory (joined with role display info).
const SELECT_PROFILE = `
  up.user_id, up.org_id, up.email, up.first_name, up.last_name, up.display_name,
  up.avatar_url, up.phone, up.employee_id, up.job_title, up.department_id,
  up.manager_user_id, up.cost_center, up.location, up.timezone, up.locale,
  up.role_id, up.is_active, up.last_seen_at, up.custom_attributes, up.survey_segments,
  up.provisioned_by, up.created_at, up.updated_at, up.deprovisioned_at,
  r.builtin_key AS role_key, r.name AS role_name, r.seat_weight,
  d.name AS department_name`;

const PROFILE_JOINS = `
  FROM user_profiles up
  LEFT JOIN org_roles  r ON r.id = up.role_id
  LEFT JOIN departments d ON d.id = up.department_id`;

// Map camelCase update payload → (column, value) pairs.
const UPDATE_COLUMN_MAP: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name', displayName: 'display_name',
  jobTitle: 'job_title', employeeId: 'employee_id', phone: 'phone',
  costCenter: 'cost_center', location: 'location', timezone: 'timezone',
  locale: 'locale', departmentId: 'department_id', managerUserId: 'manager_user_id',
  roleId: 'role_id', isActive: 'is_active', customAttributes: 'custom_attributes',
  surveySegments: 'survey_segments',
};

// GET /api/users — paginated, searchable directory
router.get('/', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(parseInt(String(req.query.limit ?? ''), 10) || 25, 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? ''), 10) || 0, 0);

    const conditions = ['up.org_id = $1'];
    const params: unknown[] = [req.orgId];
    let p = 2;

    if (req.query.search) {
      conditions.push(`(up.display_name ILIKE $${p} OR up.email ILIKE $${p})`);
      params.push(`%${req.query.search}%`);
      p++;
    }
    if (req.query.roleId) { conditions.push(`up.role_id = $${p++}`); params.push(req.query.roleId); }
    if (req.query.roleKey) { conditions.push(`r.builtin_key = $${p++}`); params.push(req.query.roleKey); }
    if (req.query.departmentId) { conditions.push(`up.department_id = $${p++}`); params.push(req.query.departmentId); }
    if (req.query.status === 'active')   conditions.push('up.is_active = TRUE AND up.deprovisioned_at IS NULL');
    if (req.query.status === 'inactive') conditions.push('(up.is_active = FALSE OR up.deprovisioned_at IS NOT NULL)');

    const where = conditions.join(' AND ');

    const [{ rows }, { rows: [{ count }] }] = await Promise.all([
      query(
        `SELECT ${SELECT_PROFILE} ${PROFILE_JOINS}
         WHERE ${where}
         ORDER BY up.display_name ASC NULLS LAST, up.email ASC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS count FROM user_profiles up
                LEFT JOIN org_roles r ON r.id = up.role_id WHERE ${where}`, params),
    ]);

    res.json({
      users: rows.map(serializeUser),
      total: count,
      limit,
      offset,
      hasMore: offset + rows.length < count,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// GET /api/users/:id
router.get('/:id', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT ${SELECT_PROFILE} ${PROFILE_JOINS} WHERE up.org_id = $1 AND up.user_id = $2`,
      [req.orgId, req.params.id]
    );
    if (!rows[0]) { clientError(res, 404, 'User not found'); return; }
    res.json({ user: serializeUser(rows[0]) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/users/invite — create (or re-activate) a directory profile + Clerk invite
router.post('/invite', requireAuth, requirePermission('users:manage'), validate(inviteUserSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, roleId, jobTitle, departmentId } = req.body;

    // Resolve target role: explicit roleId or the org's default member role.
    let resolvedRoleId = roleId || null;
    let roleWeight = 1.0;
    if (resolvedRoleId) {
      const { rows } = await query(
        'SELECT id, seat_weight FROM org_roles WHERE id = $1 AND org_id = $2', [resolvedRoleId, req.orgId]
      );
      if (!rows[0]) { clientError(res, 400, 'Role not found in this org'); return; }
      roleWeight = Number(rows[0].seat_weight);
    } else {
      resolvedRoleId = await getRoleIdByBuiltinKey(req.orgId, 'org:member');
      roleWeight = 0.0; // member
    }

    // Seat enforcement (skipped for zero-weight respondents).
    if (roleWeight > 0) {
      const seat = await checkSeatLimit(req.orgId, roleWeight);
      if (!seat.allowed) {
        res.status(402).json({
          error: 'seat_limit_exceeded',
          message: `Your plan allows ${seat.limit} seats and ${seat.current} are in use.`,
          current: seat.current, limit: seat.limit,
        });
        return;
      }
    }

    // Send the Clerk invitation (skipped in dev-bypass mode).
    let invitedUserId: string | null = null;
    if (process.env.SKIP_AUTH !== 'true' && process.env.CLERK_SECRET_KEY) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createClerkClient } = require('@clerk/backend');
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const invitation = await clerk.organizations.createOrganizationInvitation({
        organizationId: req.orgId,
        emailAddress: email,
        role: 'org:member', // Clerk base role; our role lives in user_profiles
        inviterUserId: req.userId,
        redirectUrl: process.env.APP_URL ?? 'http://localhost:5173',
      });
      invitedUserId = invitation.id; // placeholder id until the user accepts & a webhook syncs
    }

    // Create a pending profile keyed by a stable id. Until the user accepts and we
    // get their Clerk user id (via webhook, Increment 3), we key by email-derived id.
    const pendingUserId = invitedUserId ? `invite:${invitedUserId}` : `invite:${email}`;
    const profile = await upsertProfileFromClerk({
      userId: pendingUserId,
      orgId: req.orgId,
      email,
      roleId: resolvedRoleId,
      provisionedBy: 'invite',
    });

    if (jobTitle || departmentId) {
      await query(
        `UPDATE user_profiles SET job_title = COALESCE($3, job_title),
           department_id = COALESCE($4, department_id), updated_at = NOW()
         WHERE user_id = $1 AND org_id = $2`,
        [pendingUserId, req.orgId, jobTitle || null, departmentId || null]
      );
    }

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType: 'user.invited',
      targetUserId: pendingUserId, targetResourceType: 'user', targetResourceId: pendingUserId,
      afterState: { email, roleId: resolvedRoleId }, ipAddress: req.ip,
      userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.status(201).json({ success: true, user: serializeUser(profile) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PATCH /api/users/:id — update profile / role
router.patch('/:id', requireAuth, requirePermission('users:manage'), validate(updateUserSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;

    const { rows: [before] } = await query(
      'SELECT * FROM user_profiles WHERE user_id = $1 AND org_id = $2', [userId, req.orgId]
    );
    if (!before) { clientError(res, 404, 'User not found'); return; }

    // If changing role, validate the target role belongs to this org.
    if (req.body.roleId) {
      const { rows } = await query(
        'SELECT id FROM org_roles WHERE id = $1 AND org_id = $2', [req.body.roleId, req.orgId]
      );
      if (!rows[0]) { clientError(res, 400, 'Role not found in this org'); return; }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const [key, col] of Object.entries(UPDATE_COLUMN_MAP)) {
      if (key in req.body) {
        const val = key === 'customAttributes' ? JSON.stringify(req.body[key]) : req.body[key];
        sets.push(`${col} = $${p++}`);
        params.push(val);
      }
    }
    if (sets.length === 0) { clientError(res, 400, 'No fields to update'); return; }

    // Deactivation also stamps deprovisioned_at; reactivation clears it.
    if ('isActive' in req.body) {
      sets.push(req.body.isActive ? 'deprovisioned_at = NULL' : 'deprovisioned_at = NOW()');
    }

    params.push(userId, req.orgId);
    const { rows: [updated] } = await query(
      `UPDATE user_profiles SET ${sets.join(', ')}, updated_at = NOW()
       WHERE user_id = $${p++} AND org_id = $${p}
       RETURNING *`,
      params
    );

    // Role / status change affects permissions — flush the cache for this user.
    if ('roleId' in req.body || 'isActive' in req.body) {
      await invalidatePermissionCache(userId);
    }

    // Profile attributes can change dynamic-group membership — re-materialize
    // (fire-and-forget; never block or fail the response on this).
    evaluateDynamicGroupsForOrg(req.orgId).catch(() => {});

    const eventType = 'roleId' in req.body && req.body.roleId !== before.role_id
      ? 'user.role_changed'
      : ('isActive' in req.body && !req.body.isActive ? 'user.deprovisioned' : 'user.updated');

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType,
      targetUserId: userId, targetResourceType: 'user', targetResourceId: userId,
      beforeState: { role_id: before.role_id, is_active: before.is_active },
      afterState: { role_id: updated.role_id, is_active: updated.is_active },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.json({ user: serializeUser(await fetchEnriched(userId, req.orgId)) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// DELETE /api/users/:id — soft deprovision
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.params.id;
    if (userId === req.userId) { clientError(res, 400, 'You cannot deprovision yourself'); return; }

    const { rows: [updated] } = await query(
      `UPDATE user_profiles SET is_active = FALSE, deprovisioned_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND org_id = $2 RETURNING user_id`,
      [userId, req.orgId]
    );
    if (!updated) { clientError(res, 404, 'User not found'); return; }

    await invalidatePermissionCache(userId);

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType: 'user.deprovisioned',
      targetUserId: userId, targetResourceType: 'user', targetResourceId: userId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

async function fetchEnriched(userId: string, orgId: string) {
  const { rows } = await query(
    `SELECT ${SELECT_PROFILE} ${PROFILE_JOINS} WHERE up.user_id = $1 AND up.org_id = $2`,
    [userId, orgId]
  );
  return rows[0];
}

// Shape a DB row into the API contract (camelCase, no internal-only fields).
function serializeUser(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    userId: row.user_id,
    orgId: row.org_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    employeeId: row.employee_id,
    jobTitle: row.job_title,
    departmentId: row.department_id,
    departmentName: row.department_name,
    managerUserId: row.manager_user_id,
    costCenter: row.cost_center,
    location: row.location,
    timezone: row.timezone,
    locale: row.locale,
    roleId: row.role_id,
    roleKey: row.role_key,
    roleName: row.role_name,
    seatWeight: row.seat_weight != null ? Number(row.seat_weight) : null,
    isActive: row.is_active,
    status: row.deprovisioned_at ? 'deactivated'
      : (String(row.user_id).startsWith('invite:') ? 'pending' : 'active'),
    lastSeenAt: row.last_seen_at,
    customAttributes: row.custom_attributes,
    surveySegments: row.survey_segments,
    provisionedBy: row.provisioned_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deprovisionedAt: row.deprovisioned_at,
  };
}

export default router;
