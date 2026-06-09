// Notification event bus (Redis Streams).
//
// Producers call publishNotificationEvent() to enqueue an event; the Event Engine
// processor (src/eventEngine/) consumes the stream, resolves recipients, applies
// dedup/preferences (via lib/notifications.createNotification), persists, and
// publishes to the per-user live channel for SSE fanout.
//
// Single stream + one consumer group (matches the existing redisStream.js pattern).
// Degrades gracefully when Redis is not configured.
const { getRedisClient } = require('./redis');

const STREAM_KEY = 'notifications:events';
const GROUP = 'notification-processor';
const MAXLEN = 50000;

/**
 * Enqueue a notification event.
 * @param {object} e
 * @param {string}   e.type            taxonomy type (e.g. 'survey.milestone')
 * @param {string}   e.orgId
 * @param {string[]} [e.targetUserIds] explicit recipients (resolved by processor if omitted)
 * @param {string}   [e.actorId]
 * @param {string}   [e.entityType]
 * @param {string}   [e.entityId]
 * @param {string}   [e.priority]
 * @param {object}   [e.payload]
 * @param {string}   [e.title]         optional pre-rendered title
 * @param {string}   [e.body]
 * @param {string}   [e.actionUrl]
 * @param {number}   [e.dedupWindowMs]
 * @returns {Promise<string|null>} stream message id, or null if Redis unavailable
 */
async function publishNotificationEvent(e) {
  const redis = getRedisClient();
  if (!redis || redis.status !== 'ready') return null;
  if (!e.type || !e.orgId) throw new Error('publishNotificationEvent requires type + orgId');

  return redis.xadd(
    STREAM_KEY, 'MAXLEN', '~', String(MAXLEN), '*',
    'type', e.type,
    'org_id', e.orgId,
    'target_user_ids', JSON.stringify(e.targetUserIds || []),
    'actor_id', e.actorId || '',
    'entity_type', e.entityType || '',
    'entity_id', e.entityId || '',
    'priority', e.priority || '',
    'title', e.title || '',
    'body', e.body || '',
    'action_url', e.actionUrl || '',
    'dedup_window_ms', e.dedupWindowMs ? String(e.dedupWindowMs) : '',
    'payload', JSON.stringify(e.payload || {}),
    'ts', String(Date.now()),
  );
}

// Parse a Redis stream entry's flat [k,v,k,v,...] field array into an event object.
function parseEventFields(fields) {
  const m = {};
  for (let i = 0; i < fields.length; i += 2) m[fields[i]] = fields[i + 1];
  return {
    type: m.type,
    orgId: m.org_id,
    targetUserIds: safeJson(m.target_user_ids, []),
    actorId: m.actor_id || null,
    entityType: m.entity_type || null,
    entityId: m.entity_id || null,
    priority: m.priority || undefined,
    title: m.title || null,
    body: m.body || null,
    actionUrl: m.action_url || null,
    dedupWindowMs: m.dedup_window_ms ? Number(m.dedup_window_ms) : null,
    payload: safeJson(m.payload, {}),
  };
}

function safeJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

module.exports = { publishNotificationEvent, parseEventFields, STREAM_KEY, GROUP };
