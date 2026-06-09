// Notification creation helper — the single entry point for emitting a notification.
//
// Applies: (1) optional deduplication within a time window, (2) per-user in-app
// preference gating, then (3) inserts into `notifications` and publishes to the
// per-user live channel (consumed by the WebSocket gateway in a later increment).
const db = require('./db');
const { getRedisClient } = require('./redis');

const PRIORITIES = ['critical', 'warning', 'info', 'success', 'digest'];

// Default per-type priority (used when a caller doesn't pass one). Mirrors the
// taxonomy in docs/notifications §2.
const TYPE_PRIORITY = {
  'survey.published': 'info', 'survey.closed': 'info', 'survey.milestone': 'success',
  'survey.response_rate_low': 'warning', 'survey.expiring_critical': 'critical',
  'survey.quota_reached': 'success',
  'score.nps_drop': 'critical', 'score.nps_rise': 'success', 'score.csat_drop': 'warning',
  'crystal.insight_ready': 'info', 'crystal.anomaly_detected': 'warning',
  'crystal.prediction_alert': 'warning', 'crystal.digest_ready': 'digest',
  'system.pipeline_error': 'critical', 'system.credits_low': 'warning',
  'alert.fired': 'warning', 'alert.resolved': 'success',
};

/**
 * Create a notification for a single recipient.
 * @returns {Promise<object|null>} the row, or null if suppressed (dedup/preference).
 */
async function createNotification({
  orgId, userId, type, priority, title, body = null,
  actionUrl = null, entityType = null, entityId = null,
  payload = {}, runId = null, dedupWindowMs = null,
}) {
  if (!orgId || !userId || !type || !title) {
    throw new Error('createNotification requires orgId, userId, type, title');
  }
  const prio = PRIORITIES.includes(priority) ? priority : (TYPE_PRIORITY[type] || 'info');

  // (1) Deduplicate within a window keyed on (org, type, entity).
  if (dedupWindowMs && entityId) {
    const bucket = Math.floor(Date.now() / dedupWindowMs) * dedupWindowMs;
    const windowStart = new Date(bucket);
    const expiresAt = new Date(bucket + dedupWindowMs);
    const { rowCount } = await db.query(
      `INSERT INTO notification_dedup (org_id, event_type, entity_id, window_start, expires_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org_id, event_type, entity_id, window_start) DO NOTHING`,
      [orgId, type, entityId, windowStart, expiresAt]
    );
    if (rowCount === 0) return null; // already notified this window
  }

  // (2) Respect the user's in-app preference for this type (default on).
  const { rows: prefs } = await db.query(
    `SELECT in_app_enabled FROM notification_type_preferences
      WHERE org_id = $1 AND user_id = $2 AND notification_type = $3`,
    [orgId, userId, type]
  );
  if (prefs[0] && prefs[0].in_app_enabled === false) return null;

  // (3) Persist.
  const { rows: [row] } = await db.query(
    `INSERT INTO notifications
       (org_id, user_id, type, priority, title, body, action_url, entity_type, entity_id, payload, run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING *`,
    [orgId, userId, type, prio, title, body, actionUrl, entityType, entityId, JSON.stringify(payload), runId]
  );

  publishLive(userId, row).catch(() => {});
  return row;
}

/** Emit to the per-user live channel for WebSocket fanout (no-op without Redis). */
async function publishLive(userId, row) {
  const redis = getRedisClient();
  if (!redis || redis.status !== 'ready') return;
  await redis.publish(`notifications:live:${userId}`, JSON.stringify(serialize(row)));
}

// Shape a DB row into the API/client contract (camelCase).
function serialize(row) {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority || 'info',
    title: row.title,
    body: row.body,
    actionUrl: row.action_url || null,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    payload: row.payload || {},
    runId: row.run_id || null,
    read: !!row.read,
    readAt: row.read_at || null,
    createdAt: row.created_at,
  };
}

module.exports = { createNotification, serialize, publishLive, PRIORITIES, TYPE_PRIORITY };
