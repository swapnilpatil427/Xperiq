/**
 * Notification routes
 *
 *   GET  /api/notifications/pending  — Fetch and mark delivered pending in-app notifications
 *   GET  /api/notifications/preferences — Get notification preferences
 *   PUT  /api/notifications/preferences — Update notification preferences
 */
const express       = require('express');
const { requireAuth } = require('../middleware/auth');
const db            = require('../lib/db');
const { serverError } = require('../lib/httpError');

const router = express.Router();

// GET /api/notifications/pending
router.get('/pending', requireAuth, async (req, res) => {
  const { orgId, userId } = req;
  try {
    // Fetch and mark as delivered in a single transaction
    const { rows } = await db.query(
      `WITH pending AS (
         SELECT id, event_type, payload, created_at
         FROM notification_events
         WHERE org_id = $1 AND user_id = $2 AND status = 'pending' AND channel = 'in_app'
         ORDER BY created_at DESC
         LIMIT 20
       )
       UPDATE notification_events
       SET status = 'delivered', delivered_at = NOW()
       WHERE id IN (SELECT id FROM pending)
       RETURNING id, event_type, payload, created_at`,
      [orgId, userId]
    );
    res.json({ notifications: rows, count: rows.length });
  } catch (err) {
    // Table may not exist yet in dev
    if (err.code === '42P01') return res.json({ notifications: [], count: 0 });
    serverError(res, err, { endpoint: 'notifications_pending' });
  }
});

// GET /api/notifications/preferences
router.get('/preferences', requireAuth, async (req, res) => {
  const { orgId, userId } = req;
  try {
    const { rows } = await db.query(
      `SELECT channel, event_type, enabled FROM notification_preferences
       WHERE org_id = $1 AND user_id = $2`,
      [orgId, userId]
    );
    res.json({ preferences: rows });
  } catch (err) {
    if (err.code === '42P01') return res.json({ preferences: [] });
    serverError(res, err, { endpoint: 'notification_preferences_get' });
  }
});

// PUT /api/notifications/preferences
// NOTE: notification_preferences requires a UNIQUE constraint on (org_id, user_id, channel, event_type)
// for the ON CONFLICT clause to work. Add via migration if not present:
//   ALTER TABLE notification_preferences
//     ADD CONSTRAINT notification_preferences_unique
//     UNIQUE (org_id, user_id, channel, event_type);
router.put('/preferences', requireAuth, async (req, res) => {
  const { orgId, userId } = req;
  const { channel, event_type, enabled } = req.body;
  if (!channel || !event_type) {
    return res.status(400).json({ error: 'channel and event_type required' });
  }
  try {
    await db.query(
      `INSERT INTO notification_preferences (org_id, user_id, channel, event_type, enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (org_id, user_id, channel, event_type)
       DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
      [orgId, userId, channel, event_type, enabled !== false]
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === '42P01') return res.json({ success: true }); // table not migrated yet
    serverError(res, err, { endpoint: 'notification_preferences_put' });
  }
});

module.exports = router;
