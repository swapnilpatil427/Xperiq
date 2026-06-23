// Department hierarchy API. Mounted at /api/departments.
// Adjacency list + cached path[] (maintained by the DB trigger from migration 10).
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { serverError, clientError } from '../lib/httpError';
import { auditLog } from '../lib/auditLog';
import { createDepartmentSchema, updateDepartmentSchema } from '../schemas/departments';

const router = express.Router();

interface PgError extends Error {
  code?: string;
}

// GET /api/departments — full tree with direct + total (subtree) member counts
router.get('/', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
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
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/departments
router.post('/', requireAuth, requirePermission('users:manage'), validate(createDepartmentSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, parentDepartmentId, headUserId, color, sortOrder } = req.body;
    if (parentDepartmentId) {
      const { rows } = await query(
        'SELECT id FROM departments WHERE id = $1 AND org_id = $2', [parentDepartmentId, req.orgId]
      );
      if (!rows[0]) { clientError(res, 400, 'Parent department not found'); return; }
    }

    let dept: Record<string, unknown> | undefined;
    try {
      const { rows: [d] } = await query(
        `INSERT INTO departments (org_id, name, description, parent_department_id, head_user_id, color, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.orgId, name, description || null, parentDepartmentId || null, headUserId || null, color || null, sortOrder ?? 0]
      );
      dept = d;
    } catch (insertErr: unknown) {
      const pgErr = insertErr as PgError;
      if (pgErr.code === '23505') { dept = undefined; }
      else throw insertErr;
    }
    if (!dept) { clientError(res, 409, 'A department with that name already exists under this parent'); return; }

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'department.created',
      targetResourceType: 'department', targetResourceId: dept.id as string, afterState: { name },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.status(201).json({ department: serializeDept(dept) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PATCH /api/departments/:id
router.patch('/:id', requireAuth, requirePermission('users:manage'), validate(updateDepartmentSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [existing] } = await query(
      'SELECT * FROM departments WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!existing) { clientError(res, 404, 'Department not found'); return; }

    // Guard against cycles: a department cannot be re-parented under its own subtree.
    if (req.body.parentDepartmentId) {
      if (req.body.parentDepartmentId === req.params.id) {
        clientError(res, 400, 'A department cannot be its own parent');
        return;
      }
      const { rows } = await query(
        'SELECT 1 FROM departments WHERE id = $1 AND org_id = $2 AND path @> ARRAY[$3]::text[]',
        [req.body.parentDepartmentId, req.orgId, req.params.id]
      );
      if (rows[0]) { clientError(res, 400, 'Cannot move a department under its own descendant'); return; }
    }

    const map: Record<string, string> = {
      name: 'name', description: 'description', parentDepartmentId: 'parent_department_id',
      headUserId: 'head_user_id', color: 'color', sortOrder: 'sort_order', isActive: 'is_active',
    };
    const sets: string[] = []; const params: unknown[] = []; let p = 1;
    for (const [key, col] of Object.entries(map)) {
      if (key in req.body) { sets.push(`${col} = $${p++}`); params.push(req.body[key]); }
    }
    params.push(req.params.id, req.orgId);
    const { rows: [updated] } = await query(
      `UPDATE departments SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${p++} AND org_id = $${p} RETURNING *`,
      params
    );

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'department.updated',
      targetResourceType: 'department', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.json({ department: serializeDept(updated) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// DELETE /api/departments/:id — soft delete (is_active=false); reparents children to NULL via FK
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [updated] } = await query(
      `UPDATE departments SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING id`,
      [req.params.id, req.orgId]
    );
    if (!updated) { clientError(res, 404, 'Department not found'); return; }

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'department.deleted',
      targetResourceType: 'department', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// Build a nested tree + roll up subtree member counts (O(n)).
interface DeptNode extends ReturnType<typeof serializeDept> {
  children: DeptNode[];
  totalMemberCount: number;
}

function buildTree(rows: Record<string, unknown>[]): DeptNode[] {
  const nodeMap = new Map<string, DeptNode>(
    rows.map((r) => [r.id as string, { ...serializeDept(r), children: [], totalMemberCount: r.direct_member_count as number }])
  );
  const roots: DeptNode[] = [];
  for (const row of rows) {
    const node = nodeMap.get(row.id as string)!;
    if (row.parent_department_id && nodeMap.has(row.parent_department_id as string)) {
      nodeMap.get(row.parent_department_id as string)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const rollUp = (node: DeptNode) => {
    for (const child of node.children) { rollUp(child); node.totalMemberCount += child.totalMemberCount; }
  };
  roots.forEach(rollUp);
  return roots;
}

function serializeDept(row: Record<string, unknown>) {
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

export default router;
