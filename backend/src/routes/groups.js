// User groups API. Mounted at /api/groups.
// Static groups: manual membership. Dynamic groups: rule-based, materialized
// into user_group_members. SCIM-synced groups are managed by the SCIM endpoint.
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { validate } = require('../lib/validate');
const { serverError, clientError } = require('../lib/httpError');
const { auditLog } = require('../lib/auditLog');
const { createGroupSchema, updateGroupSchema, addMemberSchema } = require('../schemas/groups');
const { evaluateDynamicGroup } = require('../lib/dynamicGroups');

const router = express.Router();

// GET /api/groups — list with member counts
router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM user_groups WHERE org_id = $1 AND is_active = TRUE
       ORDER BY name ASC`,
      [req.orgId]
    );
    res.json({ groups: rows.map(serializeGroup) });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/groups
router.post('/', requireAuth, requirePermission('users:manage'), validate(createGroupSchema), async (req, res) => {
  try {
    const { name, description, groupType, dynamicRules } = req.body;
    const { rows: [group] } = await db.query(
      `INSERT INTO user_groups (org_id, name, description, group_type, dynamic_rules, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.orgId, name, description || null, groupType, dynamicRules ? JSON.stringify(dynamicRules) : null, req.userId]
    ).catch((err) => { if (err.code === '23505') return { rows: [] }; throw err; });
    if (!group) return clientError(res, 409, 'A group with that name already exists');

    // Materialize dynamic membership immediately.
    if (groupType === 'dynamic') {
      await evaluateDynamicGroup(group.id, req.orgId);
    }

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.created',
      targetResourceType: 'group', targetResourceId: group.id, afterState: { name, groupType },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    res.status(201).json({ group: serializeGroup(await refetch(group.id, req.orgId)) });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /api/groups/:id/members
router.get('/:id/members', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ugm.user_id, ugm.added_at, up.display_name, up.email, up.avatar_url, up.job_title
       FROM user_group_members ugm
       LEFT JOIN user_profiles up ON up.user_id = ugm.user_id AND up.org_id = $2
       WHERE ugm.group_id = $1 AND ugm.org_id = $2
       ORDER BY up.display_name ASC NULLS LAST`,
      [req.params.id, req.orgId]
    );
    res.json({ members: rows.map((r) => ({
      userId: r.user_id, displayName: r.display_name, email: r.email,
      avatarUrl: r.avatar_url, jobTitle: r.job_title, addedAt: r.added_at,
    })) });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/groups/:id/members — add a member (static groups only)
router.post('/:id/members', requireAuth, requirePermission('users:manage'), validate(addMemberSchema), async (req, res) => {
  try {
    const { rows: [group] } = await db.query(
      'SELECT group_type FROM user_groups WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!group) return clientError(res, 404, 'Group not found');
    if (group.group_type !== 'static') {
      return clientError(res, 400, 'Members of dynamic/SCIM groups are managed automatically');
    }
    await db.query(
      `INSERT INTO user_group_members (group_id, user_id, org_id, added_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [req.params.id, req.body.userId, req.orgId, req.userId]
    );
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.member_added',
      targetUserId: req.body.userId, targetResourceType: 'group', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.status(201).json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /api/groups/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows: [group] } = await db.query(
      'SELECT group_type FROM user_groups WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!group) return clientError(res, 404, 'Group not found');
    if (group.group_type !== 'static') {
      return clientError(res, 400, 'Members of dynamic/SCIM groups are managed automatically');
    }
    await db.query(
      'DELETE FROM user_group_members WHERE group_id = $1 AND user_id = $2 AND org_id = $3',
      [req.params.id, req.params.userId, req.orgId]
    );
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.member_removed',
      targetUserId: req.params.userId, targetResourceType: 'group', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

// PATCH /api/groups/:id
router.patch('/:id', requireAuth, requirePermission('users:manage'), validate(updateGroupSchema), async (req, res) => {
  try {
    const { rows: [group] } = await db.query(
      'SELECT * FROM user_groups WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]
    );
    if (!group) return clientError(res, 404, 'Group not found');

    const map = { name: 'name', description: 'description', isActive: 'is_active' };
    const sets = []; const params = []; let p = 1;
    for (const [key, col] of Object.entries(map)) {
      if (key in req.body) { sets.push(`${col} = $${p++}`); params.push(req.body[key]); }
    }
    if ('dynamicRules' in req.body) {
      sets.push(`dynamic_rules = $${p++}`); params.push(JSON.stringify(req.body.dynamicRules));
    }
    params.push(req.params.id, req.orgId);
    await db.query(
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
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /api/groups/:id — soft delete
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows: [updated] } = await db.query(
      `UPDATE user_groups SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING id`,
      [req.params.id, req.orgId]
    );
    if (!updated) return clientError(res, 404, 'Group not found');
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'group.deleted',
      targetResourceType: 'group', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

async function refetch(id, orgId) {
  const { rows } = await db.query('SELECT * FROM user_groups WHERE id = $1 AND org_id = $2', [id, orgId]);
  return rows[0];
}

function serializeGroup(row) {
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

module.exports = router;
