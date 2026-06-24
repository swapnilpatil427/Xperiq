// Enterprise User Directory — role management API.
// Mounted at /api/roles. Built-in roles are read-only; custom roles are an
// enterprise-tier feature. All routes require requireAuth + users:manage.
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { serverError, clientError } from '../lib/httpError';
import { auditLog } from '../lib/auditLog';
import { createRoleSchema, updateRoleSchema } from '../schemas/roles';
import { ensureBuiltinRoles } from '../lib/userProfiles';

const router = express.Router();

interface PgError extends Error {
  code?: string;
}

async function isEnterpriseOrg(orgId: string): Promise<boolean> {
  const { rows } = await query('SELECT plan_tier FROM org_profiles WHERE org_id = $1', [orgId]);
  return rows[0]?.plan_tier === 'enterprise';
}

// GET /api/roles — built-in + custom roles, with current assignment counts
router.get('/', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    // Lazily seed built-ins for orgs created after the core migration.
    const { rows: existing } = await query(
      'SELECT 1 FROM org_roles WHERE org_id = $1 LIMIT 1', [req.orgId]
    );
    if (existing.length === 0) await ensureBuiltinRoles(req.orgId);

    const { rows } = await query(
      `SELECT r.*, COUNT(up.user_id)::int AS assigned_count
         FROM org_roles r
         LEFT JOIN user_profiles up ON up.role_id = r.id AND up.org_id = r.org_id
        WHERE r.org_id = $1
        GROUP BY r.id
        ORDER BY r.is_builtin DESC, r.seat_weight DESC, r.name ASC`,
      [req.orgId]
    );
    res.json({ roles: rows.map(serializeRole) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/roles — create a custom role (enterprise only)
router.post('/', requireAuth, requirePermission('users:manage'), validate(createRoleSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!(await isEnterpriseOrg(req.orgId))) {
      clientError(res, 403, 'Custom roles require the Enterprise plan');
      return;
    }
    const { name, description, permissions, seatWeight, color } = req.body;

    let queryResult: { rows: Record<string, unknown>[] } | null = null;
    try {
      queryResult = await query(
        `INSERT INTO org_roles (org_id, name, description, is_builtin, default_permissions, seat_weight, color, created_by)
         VALUES ($1,$2,$3,FALSE,$4::jsonb,$5,$6,$7)
         RETURNING *`,
        [req.orgId, name, description || null, JSON.stringify(permissions),
         seatWeight != null ? seatWeight : 1.0, color || null, req.userId]
      );
    } catch (insertErr: unknown) {
      const pgErr = insertErr as PgError;
      if (pgErr.code === '23505') { queryResult = null; }
      else throw insertErr;
    }
    if (!queryResult) { clientError(res, 409, 'A role with that name already exists'); return; }

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType: 'role.created',
      targetResourceType: 'role', targetResourceId: queryResult.rows[0].id as string,
      afterState: { name, permissions }, ipAddress: req.ip,
      userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.status(201).json({ role: serializeRole(queryResult.rows[0]) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PATCH /api/roles/:id — update a custom role (built-ins are immutable)
router.patch('/:id', requireAuth, requirePermission('users:manage'), validate(updateRoleSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [role] } = await query(
      'SELECT * FROM org_roles WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!role) { clientError(res, 404, 'Role not found'); return; }
    if (role.is_builtin) { clientError(res, 403, 'Built-in roles cannot be modified'); return; }

    const map: Record<string, string> = { name: 'name', description: 'description', seatWeight: 'seat_weight', color: 'color' };
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const [key, col] of Object.entries(map)) {
      if (key in req.body) { sets.push(`${col} = $${p++}`); params.push(req.body[key]); }
    }
    if ('permissions' in req.body) {
      sets.push(`default_permissions = $${p++}::jsonb`);
      params.push(JSON.stringify(req.body.permissions));
    }
    if (sets.length === 0) { clientError(res, 400, 'No fields to update'); return; }

    params.push(req.params.id, req.orgId);
    const { rows: [updated] } = await query(
      `UPDATE org_roles SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${p++} AND org_id = $${p} RETURNING *`,
      params
    );

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType: 'role.updated',
      targetResourceType: 'role', targetResourceId: req.params.id,
      beforeState: { permissions: role.default_permissions },
      afterState: { permissions: updated.default_permissions },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.json({ role: serializeRole(updated) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// DELETE /api/roles/:id — delete a custom role (built-ins are protected)
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [role] } = await query(
      'SELECT * FROM org_roles WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!role) { clientError(res, 404, 'Role not found'); return; }
    if (role.is_builtin) { clientError(res, 403, 'Built-in roles cannot be deleted'); return; }

    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*)::int AS count FROM user_profiles WHERE role_id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );
    if (count > 0) {
      clientError(res, 409, `Role is assigned to ${count} user(s). Reassign them first.`);
      return;
    }

    await query('DELETE FROM org_roles WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType: 'role.deleted',
      targetResourceType: 'role', targetResourceId: req.params.id,
      beforeState: { name: role.name }, ipAddress: req.ip,
      userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

function serializeRole(row: Record<string, unknown>) {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    isBuiltin: row.is_builtin,
    builtinKey: row.builtin_key,
    permissions: row.default_permissions,
    seatWeight: row.seat_weight != null ? Number(row.seat_weight) : null,
    color: row.color,
    assignedCount: row.assigned_count != null ? Number(row.assigned_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
