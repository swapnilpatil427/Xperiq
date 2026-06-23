// SSO attribute mapping config. Mounted at /api/sso-mappings. Clerk-authed (admins).
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { serverError } from '../lib/httpError';
import { auditLog } from '../lib/auditLog';
import { z } from 'zod';

const router = express.Router();

const putSchema = z.object({
  // { "<saml_attr>": "<experient_field>" }
  mappings: z.record(z.string(), z.string().max(200)),
});

router.get('/', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      'SELECT mappings FROM sso_attribute_mappings WHERE org_id = $1', [req.orgId]
    );
    res.json({ mappings: rows[0]?.mappings || {} });
  } catch (err: unknown) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

router.put('/', requireAuth, requirePermission('users:manage'), validate(putSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [row] } = await query(
      `INSERT INTO sso_attribute_mappings (org_id, mappings) VALUES ($1, $2::jsonb)
       ON CONFLICT (org_id) DO UPDATE SET mappings = EXCLUDED.mappings, updated_at = NOW()
       RETURNING mappings`,
      [req.orgId, JSON.stringify(req.body.mappings)]
    );
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'sso_mapping.updated',
      targetResourceType: 'org', targetResourceId: req.orgId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ mappings: row.mappings });
  } catch (err: unknown) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

export default router;
