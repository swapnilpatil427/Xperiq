// SSO attribute mapping config. Mounted at /api/sso-mappings. Clerk-authed (admins).
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { validate } = require('../lib/validate');
const { serverError } = require('../lib/httpError');
const { auditLog } = require('../lib/auditLog');
const { z } = require('zod');

const router = express.Router();

const putSchema = z.object({
  // { "<saml_attr>": "<experient_field>" }
  mappings: z.record(z.string(), z.string().max(200)),
});

router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT mappings FROM sso_attribute_mappings WHERE org_id = $1', [req.orgId]
    );
    res.json({ mappings: rows[0]?.mappings || {} });
  } catch (err) { serverError(res, err); }
});

router.put('/', requireAuth, requirePermission('users:manage'), validate(putSchema), async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      `INSERT INTO sso_attribute_mappings (org_id, mappings) VALUES ($1, $2::jsonb)
       ON CONFLICT (org_id) DO UPDATE SET mappings = EXCLUDED.mappings, updated_at = NOW()
       RETURNING mappings`,
      [req.orgId, JSON.stringify(req.body.mappings)]
    );
    auditLog({ orgId: req.orgId, actorUserId: req.userId, eventType: 'sso_mapping.updated',
      targetResourceType: 'org', targetResourceId: req.orgId,
      ipAddress: req.ip, userAgent: req.headers['user-agent'], requestId: req.id });
    res.json({ mappings: row.mappings });
  } catch (err) { serverError(res, err); }
});

module.exports = router;
