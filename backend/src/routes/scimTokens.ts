// Admin management of SCIM provisioning tokens. Mounted at /api/scim-tokens.
// Clerk-authed (admins). The plaintext token is returned exactly once on create.
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { serverError, clientError } from '../lib/httpError';
import { auditLog } from '../lib/auditLog';
import { generateToken, hashToken } from '../lib/scimToken';
import { z } from 'zod';

const router = express.Router();

interface PgError extends Error {
  code?: string;
}

const createTokenSchema = z.object({
  name:     z.string().min(1).max(200),
  provider: z.enum(['okta', 'azure_ad', 'google_workspace', 'onelogin', 'other']).optional(),
});

// GET /api/scim-tokens — list (never returns the hash or plaintext)
router.get('/', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, name, token_prefix, provider, last_used_at, last_sync_at, sync_stats,
              is_active, created_at, revoked_at
       FROM scim_tokens WHERE org_id = $1 ORDER BY created_at DESC`,
      [req.orgId]
    );
    const scimBaseUrl = `${req.protocol}://${req.get('host')}/scim/v2`;
    res.json({ tokens: rows.map(serializeToken), scimBaseUrl });
  } catch (err: unknown) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /api/scim-tokens — issue a new token (plaintext shown once)
router.post('/', requireAuth, requirePermission('users:manage'), validate(createTokenSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, prefix } = generateToken();

    let row: Record<string, unknown> | undefined;
    try {
      const { rows: [r] } = await query(
        `INSERT INTO scim_tokens (org_id, name, token_hash, token_prefix, provider, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.orgId, req.body.name, hashToken(token), prefix, req.body.provider || 'other', req.userId]
      );
      row = r;
    } catch (insertErr: unknown) {
      const pgErr = insertErr as PgError;
      if (pgErr.code === '23505') { row = undefined; }
      else throw insertErr;
    }
    if (!row) { clientError(res, 409, 'A token with that name already exists'); return; }

    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'scim_token.created',
      targetResourceType: 'scim_token', targetResourceId: row.id as string, afterState: { name: req.body.name },
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });

    // token is returned ONCE — never retrievable again.
    res.status(201).json({ token, ...serializeToken(row) });
  } catch (err: unknown) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// DELETE /api/scim-tokens/:id — revoke
router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [row] } = await query(
      `UPDATE scim_tokens SET is_active=FALSE, revoked_at=NOW(), revoked_by=$3
       WHERE id=$1 AND org_id=$2 RETURNING id`,
      [req.params.id, req.orgId, req.userId]
    );
    if (!row) { clientError(res, 404, 'Token not found'); return; }
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'scim_token.revoked',
      targetResourceType: 'scim_token', targetResourceId: req.params.id,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ success: true });
  } catch (err: unknown) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

function serializeToken(row: Record<string, unknown>) {
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

export default router;
