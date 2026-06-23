// Notification event bus (Redis Streams).
//
// Producers call publishNotificationEvent() to enqueue an event; the Event Engine
// processor (src/eventEngine/) consumes the stream, resolves recipients, applies
// dedup/preferences (via lib/notifications.createNotification), persists, and
// publishes to the per-user live channel for SSE fanout.
//
// Single stream + one consumer group (matches the existing redisStream.js pattern).
// Degrades gracefully when Redis is not configured.
import { getRedisClient } from './redis';

export const STREAM_KEY = 'notifications:events';
export const GROUP = 'notification-processor';
const MAXLEN = 50000;

export interface NotificationEvent {
  type: string;
  orgId: string;
  targetUserIds?: string[];
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  priority?: string;
  payload?: Record<string, unknown>;
  title?: string | null;
  body?: string | null;
  actionUrl?: string | null;
  dedupWindowMs?: number | null;
}

export interface ParsedNotificationEvent {
  type: string;
  orgId: string;
  targetUserIds: string[];
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  priority: string | undefined;
  title: string | null;
  body: string | null;
  actionUrl: string | null;
  dedupWindowMs: number | null;
  payload: Record<string, unknown>;
}

/**
 * Enqueue a notification event.
 * @returns stream message id, or null if Redis unavailable
 */
export async function publishNotificationEvent(e: NotificationEvent): Promise<string | null> {
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
export function parseEventFields(fields: string[]): ParsedNotificationEvent {
  const m: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) m[fields[i]] = fields[i + 1];
  return {
    type: m.type,
    orgId: m.org_id,
    targetUserIds: safeJson<string[]>(m.target_user_ids, []),
    actorId: m.actor_id || null,
    entityType: m.entity_type || null,
    entityId: m.entity_id || null,
    priority: m.priority || undefined,
    title: m.title || null,
    body: m.body || null,
    actionUrl: m.action_url || null,
    dedupWindowMs: m.dedup_window_ms ? Number(m.dedup_window_ms) : null,
    payload: safeJson<Record<string, unknown>>(m.payload, {}),
  };
}

function safeJson<T>(s: string, fallback: T): T {
  try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; }
}
