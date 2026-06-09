// Enterprise User Directory — role management API.
// Mounted at /api/roles. Built-in roles are read-only; custom roles are an
// enterprise-tier feature. All routes require requireAuth + users:manage.
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { validate } = require('../lib/validate');
const { serverError, clientError } = require('../lib/httpError');
const { auditLog } = require('../lib/auditLog');
const { createRoleSchema, updateRoleSchema } = require('../schemas/roles');
const { ensureBuiltinRoles } = require('../lib/userProfiles');

const router = express.Router();

async function isEnterpriseOrg(orgId) {
  const { rows } = await db.query('SELECT plan_tier FROM org_profiles WHERE org_id = $1', [orgId]);
  return rows[0]?.plan_tier === 'enterprise';
}

// GET /api/roles — built-in + custom roles, with current assignment counts
router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    // Lazily seed built-ins for orgs created after the core migration.
    const { rows: existing } = await db.query(
      'SELECT 1 FROM org_roles WHERE org_id = $1 LIMIT 1', [req.orgId]
    );
    if (existing.length === 0) await ensureBuiltinRoles(req.orgId);

    const { rows } = await db.query(
      `SELECT r.*, COUNT(up.user_id)::int AS assigned_count
         FROM org_roles r
         LEFT JOIN user_profiles up ON up.role_id = r.id AND up.org_id = r.org_id
        WHERE r.org_id = $1
        GROUP BY r.id
        ORDER BY r.is_builtin DESC, r.seat_weight DESC, r.name ASC`,
      [req.orgId]
    );
    res.json({ roles: rows.map(serializeRole) });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/roles — create a custom role (enterprise only)
router.post('/', requireAuth, requirePermission('users:manage'), validate(createRoleSchema), async (req, res) => {
  try {
    if (!(await isEnterpriseOrg(req.orgId))) {
      return clientError(res, 403, 'Custom roles require the Enterprise plan');
    }
    const { name, description, permissions, seatWeight, color } = req.body;

    const { rows } = await db.query(
      `INSERT INTO org_roles (org_id, name, description, is_builtin, default_permissions, seat_weight, color, created_by)
       VALUES ($1,$2,$3,FALSE,$4::jsonb,$5,$6,$7)
       RETURNING *`,
      [req.orgId, name, description || null, JSON.stringify(permissions),
       seatWeight != null ? seatWeight : 1.0, color || null, req.userId]
    ).catch((err) => {
      if (err.code === '23505') return null; // unique_violation on (org_id, name)
      throw err;
    });
    if (!rows) return clientError(res, 409, 'A role with that name already exists');

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType: 'role.created',
      targetResourceType: 'role', targetResourceId: rows[0].id,
      afterState: { name, permissions }, ipAddress: req.ip,
      userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.status(201).json({ role: serializeRole(rows[0]) });
  } catch (err) {
    serverError(res, err);
  }
});

// PATCH /api/roles/:id — update a custom role (built-ins are immutable)
router.patch('/:id', requireAuth, requirePermission('users:manage'), validate(updateRoleSchema), async (req, res) => {
  try {
    const { rows: [role] } = await db.query(
      'SELECT * FROM org_roles WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!role) return clientError(res, 404, 'Role not found');
    if (role.is_builtin) return clientError(res, 403, 'Built-in roles cannot be modified');

    const map = { name: 'name', description: 'description', seatWeight: 'seat_weight', color: 'color' };
    const sets = [];
    const params = [];
    let p = 1;
    for (const [key, col] of Object.entries(map)) {
      if (key in req.body) { sets.push(`${col} = $${p++}`); params.push(req.body[key]); }
    }
    if ('permissions' in req.body) {
      sets.push(`default_permissions = $${p++}::jsonb`);
      params.push(JSON.stringify(req.body.permissions));
    }
    if (sets.length === 0) return clientError(res, 400, 'No fields to update');

    params.push(req.params.id, req.orgId);
    const { rows: [updated] } = await db.query(
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
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /api/roles/:id — delete a custom role (built-ins are protected)
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows: [role] } = await db.query(
      'SELECT * FROM org_roles WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!role) return clientError(res, 404, 'Role not found');
    if (role.is_builtin) return clientError(res, 403, 'Built-in roles cannot be deleted');

    const { rows: [{ count }] } = await db.query(
      'SELECT COUNT(*)::int AS count FROM user_profiles WHERE role_id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );
    if (count > 0) {
      return clientError(res, 409, `Role is assigned to ${count} user(s). Reassign them first.`);
    }

    await db.query('DELETE FROM org_roles WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);

    auditLog({
      orgId: req.orgId, actorUserId: req.userId, eventType: 'role.deleted',
      targetResourceType: 'role', targetResourceId: req.params.id,
      beforeState: { name: role.name }, ipAddress: req.ip,
      userAgent: req.headers['user-agent'], requestId: req.id,
    });

    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

function serializeRole(row) {
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

module.exports = router;
