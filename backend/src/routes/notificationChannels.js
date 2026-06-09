// Org notification channel config (Slack webhook, email from-address, …).
// Mounted at /api/notification-channels. Admin-gated. Secrets are write-only:
// reads return a redacted view, never the raw config.
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { validate } = require('../lib/validate');
const { serverError, clientError } = require('../lib/httpError');
const { z } = require('zod');

const router = express.Router();

const upsertSchema = z.object({
  channelType: z.enum(['slack', 'teams', 'email', 'webhook']),
  channelName: z.string().max(128).optional(),
  config: z.record(z.string(), z.any()),  // e.g. { webhook_url } for slack
});

function redact(config) {
  if (!config || typeof config !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = typeof v === 'string' && v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-4)}` : '••••';
  }
  return out;
}

router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, channel_type, channel_name, config, is_active, created_at
         FROM notification_channels WHERE org_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [req.orgId]
    );
    res.json({ channels: rows.map((r) => ({
      id: r.id, channelType: r.channel_type, channelName: r.channel_name,
      configPreview: redact(r.config), isActive: r.is_active, createdAt: r.created_at,
    })) });
  } catch (err) {
    if (err.code === '42P01') return res.json({ channels: [] });
    serverError(res, err);
  }
});

// PUT — upsert one channel of a given type (latest wins; one active per type kept simple).
router.put('/', requireAuth, requirePermission('users:manage'), validate(upsertSchema), async (req, res) => {
  try {
    const { channelType, channelName, config } = req.body;
    // Deactivate any prior of this type, then insert the new active one.
    await db.query(
      `UPDATE notification_channels SET is_active = FALSE, updated_at = NOW()
        WHERE org_id = $1 AND channel_type = $2 AND deleted_at IS NULL`,
      [req.orgId, channelType]
    );
    const { rows: [row] } = await db.query(
      `INSERT INTO notification_channels (org_id, channel_type, channel_name, config, is_active)
       VALUES ($1,$2,$3,$4::jsonb,TRUE) RETURNING id, channel_type`,
      [req.orgId, channelType, channelName || channelType, JSON.stringify(config)]
    );
    res.status(201).json({ id: row.id, channelType: row.channel_type });
  } catch (err) {
    serverError(res, err);
  }
});

router.delete('/:id', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE notification_channels SET deleted_at = NOW(), is_active = FALSE
        WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.orgId]
    );
    if (rowCount === 0) return clientError(res, 404, 'Channel not found');
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
