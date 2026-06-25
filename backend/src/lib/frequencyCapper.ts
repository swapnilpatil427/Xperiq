/**
 * Frequency capper — prevents over-contacting contacts across all channels.
 *
 * The check works in two layers:
 *  1. Redis: fast sliding-window counter (sub-millisecond, in-memory)
 *  2. Postgres: source of truth (fallback when Redis unavailable)
 *
 * Called from channels.ts before every send. Always fails open (allow) if
 * DB/Redis errors occur — frequency enforcement must never block delivery silently.
 */
import { query } from './db';
import { getRedisClient } from './redis';
import logger from './logger';

export interface FrequencyCapRule {
  channel: string;
  maxCount: number;
  windowHours: number;
}

/**
 * Load frequency cap rules for an org. Cached in Redis for 5 minutes.
 */
async function getCapRules(orgId: string): Promise<FrequencyCapRule[]> {
  const redis = getRedisClient();
  const cacheKey = `freq_rules:${orgId}`;

  if (redis?.status === 'ready') {
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached) as FrequencyCapRule[]; } catch { /* miss */ }
    }
  }

  const { rows } = await query<{ channel: string; max_count: number; window_hours: number }>(
    `SELECT channel, max_count, window_hours FROM notification_frequency_caps
     WHERE org_id = $1 AND is_active = TRUE`,
    [orgId]
  );

  const rules: FrequencyCapRule[] = rows.map((r) => ({
    channel: r.channel,
    maxCount: r.max_count,
    windowHours: r.window_hours,
  }));

  if (redis?.status === 'ready') {
    await redis.setex(cacheKey, 300, JSON.stringify(rules)).catch(() => {});
  }

  return rules;
}

/**
 * Check if sending is allowed for a contact on a given channel.
 * Records the send if allowed. Always returns true (allow) on error.
 *
 * @param contactId - UUID of the contact being notified
 * @param orgId - Org context for rule lookup
 * @param channel - 'email' | 'sms' | 'push' | 'in_app' | 'slack'
 * @param workflowId - Novu workflow ID (for analytics)
 */
export async function isAllowed(
  contactId: string | null,
  orgId: string,
  channel: string,
  workflowId?: string
): Promise<boolean> {
  try {
    const rules = await getCapRules(orgId);
    if (rules.length === 0) return true; // no caps configured → allow

    // Find the most restrictive matching rule (specific channel > 'all')
    const channelRule = rules.find((r) => r.channel === channel);
    const globalRule = rules.find((r) => r.channel === 'all');
    const applicableRules = [channelRule, globalRule].filter(Boolean) as FrequencyCapRule[];
    if (applicableRules.length === 0) return true;

    for (const rule of applicableRules) {
      const windowStart = new Date(Date.now() - rule.windowHours * 3600 * 1000);

      let sendCount = 0;

      // Fast path: Redis sliding window
      const redis = getRedisClient();
      if (redis?.status === 'ready' && contactId) {
        const redisKey = `freq:${orgId}:${contactId}:${rule.channel}`;
        const now = Date.now();
        const windowMs = rule.windowHours * 3600 * 1000;
        // Remove old entries, count remaining
        await redis.zremrangebyscore(redisKey, '-inf', now - windowMs).catch(() => {});
        const count = await redis.zcard(redisKey).catch(() => -1);
        if (count >= 0) { sendCount = count; }
      } else if (contactId) {
        // Fallback: Postgres count
        const { rows: [{ cnt }] } = await query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM contact_send_log
           WHERE org_id = $1 AND contact_id = $2 AND channel IN ($3, 'all') AND sent_at > $4`,
          [orgId, contactId, rule.channel, windowStart]
        );
        sendCount = parseInt(cnt, 10);
      }

      if (sendCount >= rule.maxCount) {
        logger.info(
          { orgId, contactId, channel, rule, sendCount },
          'frequency_cap:blocked'
        );
        return false;
      }
    }

    // All rules passed — record the send
    if (contactId) {
      await recordSend(contactId, orgId, channel, workflowId);
    }
    return true;

  } catch (err: unknown) {
    // Fail open — never silently block delivery due to a cap check error
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), orgId, contactId, channel },
      'frequency_cap:error:fail_open'
    );
    return true;
  }
}

/**
 * Record a send in Redis (sliding window) and Postgres (source of truth).
 */
async function recordSend(
  contactId: string,
  orgId: string,
  channel: string,
  workflowId?: string
): Promise<void> {
  const now = Date.now();

  // Redis sliding window (TTL = max possible window = 30 days)
  const redis = getRedisClient();
  if (redis?.status === 'ready') {
    const redisKey = `freq:${orgId}:${contactId}:${channel}`;
    await redis.zadd(redisKey, now, `${now}-${Math.random().toString(36).slice(2)}`).catch(() => {});
    await redis.expire(redisKey, 30 * 24 * 3600).catch(() => {}); // 30-day TTL
  }

  // Postgres (async, non-blocking)
  query(
    `INSERT INTO contact_send_log (org_id, contact_id, channel, workflow_id) VALUES ($1,$2,$3,$4)`,
    [orgId, contactId, channel, workflowId ?? null]
  ).catch((err: unknown) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'frequency_cap:record_send:failed');
  });
}

/**
 * Get frequency cap rules for an org (for display in settings UI).
 */
export async function getOrgCapRules(orgId: string): Promise<FrequencyCapRule[]> {
  return getCapRules(orgId);
}

/**
 * Upsert a frequency cap rule for an org.
 */
export async function upsertCapRule(
  orgId: string,
  channel: string,
  maxCount: number,
  windowHours: number,
  createdBy: string
): Promise<void> {
  await query(
    `INSERT INTO notification_frequency_caps (org_id, channel, max_count, window_hours, created_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (org_id, channel) DO UPDATE
     SET max_count = EXCLUDED.max_count, window_hours = EXCLUDED.window_hours, updated_at = NOW()`,
    [orgId, channel, maxCount, windowHours, createdBy]
  );
  // Invalidate Redis cache
  const redis = getRedisClient();
  if (redis?.status === 'ready') {
    await redis.del(`freq_rules:${orgId}`).catch(() => {});
  }
}
