// Department hierarchy API. Mounted at /api/departments.
// Adjacency list + cached path[] (maintained by the DB trigger from migration 10).
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { validate } = require('../lib/validate');
const { serverError, clientError } = require('../lib/httpError');
const { auditLog } = require('../lib/auditLog');
const { createDepartmentSchema, updateDepartmentSchema } = require('../schemas/departments');

const router = express.Router();

// GET /api/departments — full tree with direct + total (subtree) member counts
router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `WITH dept_user_counts AS (
         SELECT department_id, COUNT(*)::int AS direct_count
         FROM user_profiles
         WHERE org_id = $1 AND is_active = TRUE AND deprovisioned_at IS NULL
         GROUP BY department_id
       )
       SELECT d.id, d.name, d.description, d.parent_department_id, d.head_user_id,
              d.depth, d.path, d.color, d.sort_order,
              COALESCE(duc.direct_count, 0) AS direct_member_count,
              up.display_name AS head_display_name, up.avatar_url AS head_avatar_url
       FROM departments d
       LEFT JOIN dept_user_counts duc ON duc.department_id = d.id
       LEFT JOIN user_profiles up ON up.user_id = d.head_user_id AND up.org_id = $1
       WHERE d.org_id = $1 AND d.is_active = TRUE
       ORDER BY d.depth, d.sort_order, d.name`,
      [req.orgId]
    );
    res.json({ tree: buildTree(rows), flat: rows.map(serializeDept) });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/departments
router.post('/', requireAuth, requirePermission('users:manage'), validate(createDepartmentSchema), async (req, res) => {
  try {
    const { name, description, parentDepartmentId, headUserId, color, sortOrder } = req.body;
    if (parentDepartmentId) {
      const { rows } = await db.query(
        'SELECT id FROM departments WHERE id = $1 AND org_id = $2', [parentDepartmentId, req.orgId]
      );
      if (!rows[0]) return clientError(res, 400, 'Parent department not found');
    }
    const { rows: [dept] } = await db.query(
      `INSERT INTO departments (org_id, name, description, parent_department_id, head_user_id, color, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.orgId, name, description || null, parentDepartmentId || null, headUserId || null, color || null, sortOrder ?? 0]
    ).catch((err) => { if (err.code === '23505') return { rows: [] }; throw err; });
    if (!dept) return clientError(res, 409, 'A department with that name already exists under this parent');

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'department.created',
      targetResourceType: 'department', targetResourceId: dept.id, afterState: { name },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.status(201).json({ department: serializeDept(dept) });
  } catch (err) {
    serverError(res, err);
  }
});

// PATCH /api/departments/:id
router.patch('/:id', requireAuth, requirePermission('users:manage'), validate(updateDepartmentSchema), async (req, res) => {
  try {
    const { rows: [existing] } = await db.query(
      'SELECT * FROM departments WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!existing) return clientError(res, 404, 'Department not found');

    // Guard against cycles: a department cannot be re-parented under its own subtree.
    if (req.body.parentDepartmentId) {
      if (req.body.parentDepartmentId === req.params.id) {
        return clientError(res, 400, 'A department cannot be its own parent');
      }
      const { rows } = await db.query(
        'SELECT 1 FROM departments WHERE id = $1 AND org_id = $2 AND path @> ARRAY[$3]::text[]',
        [req.body.parentDepartmentId, req.orgId, req.params.id]
      );
      if (rows[0]) return clientError(res, 400, 'Cannot move a department under its own descendant');
    }

    const map = {
      name: 'name', description: 'description', parentDepartmentId: 'parent_department_id',
      headUserId: 'head_user_id', color: 'color', sortOrder: 'sort_order', isActive: 'is_active',
    };
    const sets = []; const params = []; let p = 1;
    for (const [key, col] of Object.entries(map)) {
      if (key in req.body) { sets.push(`${col} = $${p++}`); params.push(req.body[key]); }
    }
    params.push(req.params.id, req.orgId);
    const { rows: [updated] } = await db.query(
      `UPDATE departments SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${p++} AND org_id = $${p} RETURNING *`,
      params
    );

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'department.updated',
      targetResourceType: 'department', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.json({ department: serializeDept(updated) });
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /api/departments/:id — soft delete (is_active=false); reparents children to NULL via FK
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows: [updated] } = await db.query(
      `UPDATE departments SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING id`,
      [req.params.id, req.orgId]
    );
    if (!updated) return clientError(res, 404, 'Department not found');

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'department.deleted',
      targetResourceType: 'department', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

// Build a nested tree + roll up subtree member counts (O(n)).
function buildTree(rows) {
  const nodeMap = new Map(
    rows.map((r) => [r.id, { ...serializeDept(r), children: [], totalMemberCount: r.direct_member_count }])
  );
  const roots = [];
  for (const row of rows) {
    const node = nodeMap.get(row.id);
    if (row.parent_department_id && nodeMap.has(row.parent_department_id)) {
      nodeMap.get(row.parent_department_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const rollUp = (node) => {
    for (const child of node.children) { rollUp(child); node.totalMemberCount += child.totalMemberCount; }
  };
  roots.forEach(rollUp);
  return roots;
}

function serializeDept(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parentDepartmentId: row.parent_department_id,
    headUserId: row.head_user_id,
    headDisplayName: row.head_display_name,
    headAvatarUrl: row.head_avatar_url,
    depth: row.depth,
    path: row.path,
    color: row.color,
    sortOrder: row.sort_order,
    directMemberCount: row.direct_member_count != null ? Number(row.direct_member_count) : 0,
  };
}

module.exports = router;
