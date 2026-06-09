// Admin management of SCIM provisioning tokens. Mounted at /api/scim-tokens.
// Clerk-authed (admins). The plaintext token is returned exactly once on create.
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { validate } = require('../lib/validate');
const { serverError, clientError } = require('../lib/httpError');
const { auditLog } = require('../lib/auditLog');
const { generateToken, hashToken } = require('../lib/scimToken');
const { z } = require('zod');

const router = express.Router();

const createTokenSchema = z.object({
  name:     z.string().min(1).max(200),
  provider: z.enum(['okta', 'azure_ad', 'google_workspace', 'onelogin', 'other']).optional(),
});

// GET /api/scim-tokens — list (never returns the hash or plaintext)
router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, token_prefix, provider, last_used_at, last_sync_at, sync_stats,
              is_active, created_at, revoked_at
       FROM scim_tokens WHERE org_id = $1 ORDER BY created_at DESC`,
      [req.orgId]
    );
    const scimBaseUrl = `${req.protocol}://${req.get('host')}/scim/v2`;
    res.json({ tokens: rows.map(serializeToken), scimBaseUrl });
  } catch (err) { serverError(res, err); }
});

// POST /api/scim-tokens — issue a new token (plaintext shown once)
router.post('/', requireAuth, requirePermission('users:manage'), validate(createTokenSchema), async (req, res) => {
  try {
    const { token, prefix } = generateToken();
    const { rows: [row] } = await db.query(
      `INSERT INTO scim_tokens (org_id, name, token_hash, token_prefix, provider, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.orgId, req.body.name, hashToken(token), prefix, req.body.provider || 'other', req.userId]
    ).catch((err) => { if (err.code === '23505') return { rows: [] }; throw err; });
    if (!row) return clientError(res, 409, 'A token with that name already exists');

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'scim_token.created',
      targetResourceType: 'scim_token', targetResourceId: row.id, afterState: { name: req.body.name },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    // token is returned ONCE — never retrievable again.
    res.status(201).json({ token, ...serializeToken(row) });
  } catch (err) { serverError(res, err); }
});

// DELETE /api/scim-tokens/:id — revoke
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      `UPDATE scim_tokens SET is_active=FALSE, revoked_at=NOW(), revoked_by=$3
       WHERE id=$1 AND org_id=$2 RETURNING id`,
      [req.params.id, req.orgId, req.userId]
    );
    if (!row) return clientError(res, 404, 'Token not found');
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'scim_token.revoked',
      targetResourceType: 'scim_token', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ success: true });
  } catch (err) { serverError(res, err); }
});

function serializeToken(row) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    provider: row.provider,
    lastUsedAt: row.last_used_at,
    lastSyncAt: row.last_sync_at,
    syncStats: row.sync_stats,
    isActive: row.is_active,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

module.exports = router;
