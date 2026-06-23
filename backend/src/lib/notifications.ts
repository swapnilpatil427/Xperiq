// Notification creation helper — the single entry point for emitting a notification.
//
// Applies: (1) optional deduplication within a time window, (2) per-user in-app
// preference gating, then (3) inserts into `notifications` and publishes to the
// per-user live channel (consumed by the WebSocket gateway in a later increment).
import { query } from './db';
import { getRedisClient } from './redis';
import { shouldSuppress } from './notificationRelevance';

export const PRIORITIES = ['critical', 'warning', 'info', 'success', 'digest'] as const;
export type Priority = typeof PRIORITIES[number];

// Default per-type priority (used when a caller doesn't pass one). Mirrors the
// taxonomy in docs/notifications §2.
export const TYPE_PRIORITY: Record<string, string> = {
  'survey.published': 'info', 'survey.closed': 'info', 'survey.milestone': 'success',
  'survey.response_rate_low': 'warning', 'survey.expiring_critical': 'critical',
  'survey.quota_reached': 'success',
  'score.nps_drop': 'critical', 'score.nps_rise': 'success', 'score.csat_drop': 'warning',
  'crystal.insight_ready': 'info', 'crystal.anomaly_detected': 'warning',
  'crystal.prediction_alert': 'warning', 'crystal.digest_ready': 'digest',
  'system.pipeline_error': 'critical', 'system.credits_low': 'warning',
  'alert.fired': 'warning', 'alert.resolved': 'success',
};

export interface CreateNotificationParams {
  orgId: string;
  userId: string;
  type: string;
  priority?: string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  runId?: string | null;
  dedupWindowMs?: number | null;
}

export interface NotificationRow {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  run_id: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface SerializedNotification {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  runId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/**
 * Create a notification for a single recipient.
 * @returns the row, or null if suppressed (dedup/preference).
 */
export async function createNotification({
  orgId, userId, type, priority, title, body = null,
  actionUrl = null, entityType = null, entityId = null,
  payload = {}, runId = null, dedupWindowMs = null,
}: CreateNotificationParams): Promise<NotificationRow | null> {
  if (!orgId || !userId || !type || !title) {
    throw new Error('createNotification requires orgId, userId, type, title');
  }
  const prio = (PRIORITIES as readonly string[]).includes(priority ?? '') ? priority! : (TYPE_PRIORITY[type] || 'info');

  // (1) Deduplicate within a window keyed on (org, type, entity).
  if (dedupWindowMs && entityId) {
    const bucket = Math.floor(Date.now() / dedupWindowMs) * dedupWindowMs;
    const windowStart = new Date(bucket);
    const expiresAt = new Date(bucket + dedupWindowMs);
    const { rowCount } = await query(
      `INSERT INTO notification_dedup (org_id, event_type, entity_id, window_start, expires_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (org_id, event_type, entity_id, window_start) DO NOTHING`,
      [orgId, type, entityId, windowStart, expiresAt]
    );
    if (rowCount === 0) return null; // already notified this window
  }

  // (2) Respect the user's in-app preference for this type (default on).
  const { rows: prefs } = await query(
    `SELECT in_app_enabled FROM notification_type_preferences
      WHERE org_id = $1 AND user_id = $2 AND notification_type = $3`,
    [orgId, userId, type]
  );
  if (prefs[0] && prefs[0].in_app_enabled === false) return null;

  // (2b) Smart suppression — drop low-relevance noise (never critical). Routes
  // would go to the digest; here we simply suppress the in-app row.
  if (prio !== 'critical') {
    let unreadSameEntityInfo = 0;
    if (prio === 'info' && entityId) {
      const { rows: cnt } = await query(
        `SELECT COUNT(*)::int AS n FROM notifications
          WHERE org_id = $1 AND user_id = $2 AND entity_id = $3
            AND priority = 'info' AND read = FALSE AND dismissed_at IS NULL`,
        [orgId, userId, entityId]
      );
      unreadSameEntityInfo = (cnt[0] as { n: number } | undefined)?.n || 0;
    }
    const { suppress } = shouldSuppress({
      priority: prio,
      magnitude: typeof payload.magnitude === 'number' ? payload.magnitude : 0.5,
      recencyHours: 0,
      unreadSameEntityInfo,
    });
    if (suppress) return null;
  }

  // (3) Persist.
  const { rows: [row] } = await query(
    `INSERT INTO notifications
       (org_id, user_id, type, priority, title, body, action_url, entity_type, entity_id, payload, run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING *`,
    [orgId, userId, type, prio, title, body, actionUrl, entityType, entityId, JSON.stringify(payload), runId]
  );

  publishLive(userId, row as NotificationRow).catch(() => {});
  return row as NotificationRow;
}

/** Emit to the per-user live channel for WebSocket fanout (no-op without Redis). */
export async function publishLive(userId: string, row: NotificationRow): Promise<void> {
  const redis = getRedisClient();
  if (!redis || redis.status !== 'ready') return;
  await redis.publish(`notifications:live:${userId}`, JSON.stringify(serialize(row)));
}

// Shape a DB row into the API/client contract (camelCase).
export function serialize(row: NotificationRow): SerializedNotification {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority || 'info',
    title: row.title,
    body: row.body,
    actionUrl: (row.action_url as string | null) || null,
    entityType: (row.entity_type as string | null) || null,
    entityId: (row.entity_id as string | null) || null,
    payload: (row.payload as Record<string, unknown>) || {},
    runId: (row.run_id as string | null) || null,
    read: !!row.read,
    readAt: (row.read_at as string | null) || null,
    createdAt: row.created_at,
  };
}
