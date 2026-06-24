// User groups API. Mounted at /api/groups.
// Static groups: manual membership. Dynamic groups: rule-based, materialized
// into user_group_members. SCIM-synced groups are managed by the SCIM endpoint.
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { serverError, clientError } from '../lib/httpError';
import { auditLog } from '../lib/auditLog';
import { createGroupSchema, updateGroupSchema, addMemberSchema } from '../schemas/groups';
import { evaluateDynamicGroup } from '../lib/dynamicGroups';

const router = express.Router();

interface PgError extends Error {
  code?: string;
}

// GET /api/groups — list with member counts
router.get('/', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT * FROM user_groups WHERE org_id = $1 AND is_active = TRUE
       ORDER BY name ASC`,
      [req.orgId]
    );
    res.json({ groups: rows.map(serializeGroup) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/groups
router.post('/', requireAuth, requirePermission('users:manage'), validate(createGroupSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, groupType, dynamicRules } = req.body;

    let group: Record<string, unknown> | undefined;
    try {
      const { rows: [g] } = await query(
        `INSERT INTO user_groups (org_id, name, description, group_type, dynamic_rules, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.orgId, name, description || null, groupType, dynamicRules ? JSON.stringify(dynamicRules) : null, req.userId]
      );
      group = g;
    } catch (insertErr: unknown) {
      const pgErr = insertErr as PgError;
      if (pgErr.code === '23505') { group = undefined; }
      else throw insertErr;
    }
    if (!group) { clientError(res, 409, 'A group with that name already exists'); return; }

    // Materialize dynamic membership immediately.
    if (groupType === 'dynamic') {
      await evaluateDynamicGroup(group.id as string, req.orgId);
    }

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.created',
      targetResourceType: 'group', targetResourceId: group.id as string, afterState: { name, groupType },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.status(201).json({ group: serializeGroup(await refetch(group.id as string, req.orgId)) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// GET /api/groups/:id/members
router.get('/:id/members', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT ugm.user_id, ugm.added_at, up.display_name, up.email, up.avatar_url, up.job_title
       FROM user_group_members ugm
       LEFT JOIN user_profiles up ON up.user_id = ugm.user_id AND up.org_id = $2
       WHERE ugm.group_id = $1 AND ugm.org_id = $2
       ORDER BY up.display_name ASC NULLS LAST`,
      [req.params.id, req.orgId]
    );
    res.json({ members: rows.map((r: Record<string, unknown>) => ({
      userId: r.user_id, displayName: r.display_name, email: r.email,
      avatarUrl: r.avatar_url, jobTitle: r.job_title, addedAt: r.added_at,
    })) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/groups/:id/members — add a member (static groups only)
router.post('/:id/members', requireAuth, requirePermission('users:manage'), validate(addMemberSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [group] } = await query(
      'SELECT group_type FROM user_groups WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!group) { clientError(res, 404, 'Group not found'); return; }
    if (group.group_type !== 'static') {
      clientError(res, 400, 'Members of dynamic/SCIM groups are managed automatically');
      return;
    }
    await query(
      `INSERT INTO user_group_members (group_id, user_id, org_id, added_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [req.params.id, req.body.userId, req.orgId, req.userId]
    );
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.member_added',
      targetUserId: req.body.userId, targetResourceType: 'group', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// DELETE /api/groups/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [group] } = await query(
      'SELECT group_type FROM user_groups WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!group) { clientError(res, 404, 'Group not found'); return; }
    if (group.group_type !== 'static') {
      clientError(res, 400, 'Members of dynamic/SCIM groups are managed automatically');
      return;
    }
    await query(
      'DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2 AND org_id = $3',
      [req.params.id, req.params.userId, req.orgId]
    );
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.member_removed',
      targetUserId: req.params.userId, targetResourceType: 'group', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PATCH /api/groups/:id
router.patch('/:id', requireAuth, requirePermission('users:manage'), validate(updateGroupSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [group] } = await query(
      'SELECT * FROM user_groups WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!group) { clientError(res, 404, 'Group not found'); return; }

    const map: Record<string, string> = { name: 'name', description: 'description', isActive: 'is_active' };
    const sets: string[] = []; const params: unknown[] = []; let p = 1;
    for (const [key, col] of Object.entries(map)) {
      if (key in req.body) { sets.push(`${col} = $${p++}`); params.push(req.body[key]); }
    }
    if ('dynamicRules' in req.body) {
      sets.push(`dynamic_rules = $${p++}`); params.push(JSON.stringify(req.body.dynamicRules));
    }
    params.push(req.params.id, req.orgId);
    await query(
      `UPDATE user_groups SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${p++} AND org_id = $${p}`,
      params
    );

    // Re-materialize if rules changed on a dynamic group.
    if ('dynamicRules' in req.body && group.group_type === 'dynamic') {
      await evaluateDynamicGroup(req.params.id, req.orgId);
    }

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.updated',
      targetResourceType: 'group', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.json({ group: serializeGroup(await refetch(req.params.id, req.orgId)) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// DELETE /api/groups/:id — soft delete
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [updated] } = await query(
      `UPDATE user_groups SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING id`,
      [req.params.id, req.orgId]
    );
    if (!updated) { clientError(res, 404, 'Group not found'); return; }
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.deleted',
      targetResourceType: 'group', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

async function refetch(id: string, orgId: string) {
  const { rows } = await query('SELECT * FROM user_groups WHERE id = $1 AND org_id = $2', [id, orgId]);
  return rows[0];
}

function serializeGroup(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    groupType: row.group_type,
    dynamicRules: row.dynamic_rules,
    scimExternalId: row.scim_external_id,
    memberCount: row.member_count != null ? Number(row.member_count) : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
