// Event Engine — notification stream processor.
//
// Consumes `notifications:events` (consumer group), resolves recipients, and
// persists each via createNotification (which applies dedup + preference gating
// and publishes to the per-user live channel for SSE fanout). At-least-once:
// messages are XACK'd only after handling; stale pending messages are reclaimed
// via XAUTOCLAIM so a crashed consumer's work is retried.
//
// Runs either standalone (src/eventEngine/index.js — the deployable event-engine
// service) or in-process in the backend when ENABLE_EVENT_ENGINE=true (dev).
const db = require('../lib/db');
const { getRedisClient } = require('../lib/redis');
const { createNotification, serialize } = require('../lib/notifications');
const { dispatchExternalChannels } = require('../lib/channels');
const { parseEventFields, STREAM_KEY, GROUP } = require('../lib/notificationEvents');

let _running = false;
let _stop = false;

function log(level, obj, msg) {
  try { require('../lib/logger')[level](obj, msg); } catch { console.log(`[event-engine] ${msg}`, obj); }
}

// Resolve which users should receive an event. Explicit targetUserIds win;
// otherwise fall back to org admins (users:manage) for org-wide events.
async function resolveRecipients(event) {
  if (event.targetUserIds && event.targetUserIds.length) return event.targetUserIds;
  try {
    const { rows } = await db.query(
      `SELECT up.user_id
         FROM user_profiles up
         JOIN org_roles r ON r.id = up.role_id
        WHERE up.org_id = $1 AND up.is_active = TRUE AND up.deprovisioned_at IS NULL
          AND (r.default_permissions->>'users:manage') = 'ALL'`,
      [event.orgId]
    );
    return rows.map((r) => r.user_id);
  } catch {
    return [];
  }
}

async function handleEvent(event) {
  const recipients = await resolveRecipients(event);
  const title = event.title || defaultTitle(event);
  for (const userId of recipients) {
    const row = await createNotification({
      orgId: event.orgId, userId, type: event.type, priority: event.priority,
      title, body: event.body, actionUrl: event.actionUrl,
      entityType: event.entityType, entityId: event.entityId,
      payload: event.payload, dedupWindowMs: event.dedupWindowMs,
    });
    // Persisted (not suppressed) → fan out to the user's external channels.
    if (row) await dispatchExternalChannels(event.orgId, userId, serialize(row));
  }

  // The same event can drive workflows subscribed to this trigger type
  // (e.g. alert.fired → "NPS Recovery"). Best-effort; never blocks delivery.
  try {
    await require('../lib/workflowEngine').runWorkflowsForEvent(event.orgId, event.type, event);
  } catch (err) {
    log('warn', { event: 'workflow_trigger_failed', type: event.type, err: err.message }, 'workflow trigger failed');
  }
}

function defaultTitle(event) {
  return event.type.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function ensureGroup(redis) {
  try {
    await redis.xgroup('CREATE', STREAM_KEY, GROUP, '$', 'MKSTREAM');
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) throw err; // group already exists
  }
}

// Process one batch. Exported for unit testing without the infinite loop.
async function processBatch(redis, consumer, { block = 5000, count = 20 } = {}) {
  const res = await redis.xreadgroup(
    'GROUP', GROUP, consumer, 'COUNT', count, 'BLOCK', block, 'STREAMS', STREAM_KEY, '>'
  );
  if (!res) return 0;
  let handled = 0;
  for (const [, entries] of res) {
    for (const [id, fields] of entries) {
      try {
        await handleEvent(parseEventFields(fields));
      } catch (err) {
        log('error', { event: 'notif_event_failed', id, err: err.message }, 'event handler failed');
      } finally {
        await redis.xack(STREAM_KEY, GROUP, id); // ack to avoid poison-message loops
        handled++;
      }
    }
  }
  return handled;
}

// Reclaim messages pending > idleMs from dead consumers (crash recovery).
async function reclaimStale(redis, consumer, idleMs = 30000) {
  try {
    const res = await redis.xautoclaim(STREAM_KEY, GROUP, consumer, idleMs, '0', 'COUNT', 50);
    const entries = res?.[1] || [];
    for (const [id, fields] of entries) {
      try { await handleEvent(parseEventFields(fields)); }
      catch (err) { log('error', { id, err: err.message }, 'reclaim handler failed'); }
      finally { await redis.xack(STREAM_KEY, GROUP, id); }
    }
    return entries.length;
  } catch { return 0; }
}

async function start({ consumer = `c-${process.pid}` } = {}) {
  const redis = getRedisClient();
  if (!redis) { log('warn', {}, 'Event Engine: no REDIS_URL — processor disabled'); return; }
  if (_running) return;
  _running = true; _stop = false;
  // Wait for connection readiness before group creation.
  if (redis.status !== 'ready') await new Promise((r) => redis.once('ready', r));
  await ensureGroup(redis);
  log('info', { consumer }, 'Event Engine: notification processor started');

  // Scheduled alert evaluation (every 15 min) — deterministic rule sweep.
  const alertSweep = setInterval(() => {
    require('../lib/alertEngine').runScheduledEvaluation()
      .then((n) => { if (n) log('info', { fired: n }, 'scheduled alert sweep'); })
      .catch((err) => log('warn', { err: err.message }, 'alert sweep failed'));
  }, 15 * 60 * 1000);

  // Cron tick (every minute) — runs due time.schedule workflows.
  const cronTick = setInterval(() => {
    require('../lib/workflowEngine').runScheduledWorkflows()
      .then((ran) => { if (ran.length) log('info', { ran: ran.length }, 'scheduled workflows ran'); })
      .catch((err) => log('warn', { err: err.message }, 'cron tick failed'));
  }, 60 * 1000);

  let ticks = 0;
  while (!_stop) {
    try {
      await processBatch(redis, consumer);
      if (++ticks % 6 === 0) await reclaimStale(redis, consumer);
    } catch (err) {
      log('error', { err: err.message }, 'processor loop error');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  clearInterval(alertSweep);
  clearInterval(cronTick);
  _running = false;
}

function stop() { _stop = true; }

module.exports = { start, stop, processBatch, reclaimStale, handleEvent, resolveRecipients, ensureGroup };
