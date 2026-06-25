/**
 * Suppression list management.
 *
 * Before any outreach to a contact, call isSuppressed() to check if they've
 * unsubscribed, bounced, or filed a GDPR request. Suppression is permanent
 * unless expires_at is set.
 *
 * This is checked BEFORE frequency caps — a suppressed contact is never sent to,
 * regardless of cap state.
 */
import { query } from './db';
import { getRedisClient } from './redis';
import logger from './logger';

export type SuppressionReason = 'unsubscribe' | 'bounce' | 'spam_complaint' | 'gdpr_request' | 'admin' | 'invalid';

export interface Suppression {
  id: string;
  email?: string;
  contact_id?: string;
  channel: string;
  reason: SuppressionReason;
  suppressed_by: string;
  notes?: string;
  expires_at?: string;
  created_at: string;
}

/**
 * Check if a contact or email is suppressed for a given channel.
 * Cached in Redis for 10 minutes. Fails open on error.
 *
 * Uses separate cache keys for contactId vs email lookups to prevent
 * key collision when both are provided simultaneously.
 */
export async function isSuppressed(
  orgId: string,
  channel: string,
  opts: { email?: string; contactId?: string }
): Promise<boolean> {
  if (!opts.email && !opts.contactId) return false;

  const redis = getRedisClient();

  // Check separate cache keys for contactId and email to avoid collision
  if (redis?.status === 'ready') {
    if (opts.contactId) {
      const contactKey = `supp:${orgId}:${channel}:contact:${opts.contactId}`;
      const cached = await redis.get(contactKey).catch(() => null);
      if (cached === '1') return true;
    }
    if (opts.email) {
      const emailKey = `supp:${orgId}:${channel}:email:${opts.email.toLowerCase()}`;
      const cached = await redis.get(emailKey).catch(() => null);
      if (cached === '1') return true;
    }
    // If both keys were checked and neither was '1', check if both were cached as '0'
    // (meaning we have definitive negative results for both)
    let bothCached = true;
    if (opts.contactId) {
      const contactKey = `supp:${orgId}:${channel}:contact:${opts.contactId}`;
      const cached = await redis.get(contactKey).catch(() => null);
      if (cached === null) bothCached = false;
    }
    if (opts.email) {
      const emailKey = `supp:${orgId}:${channel}:email:${opts.email.toLowerCase()}`;
      const cached = await redis.get(emailKey).catch(() => null);
      if (cached === null) bothCached = false;
    }
    if (bothCached) return false;
  }

  try {
    const conditions: string[] = [
      `org_id = $1`,
      `(channel = $2 OR channel = 'all')`,
      `(expires_at IS NULL OR expires_at > NOW())`,
    ];
    const params: unknown[] = [orgId, channel];
    let p = 3;

    const emailOrContactConditions: string[] = [];
    if (opts.email) {
      emailOrContactConditions.push(`email = $${p++}`);
      params.push(opts.email.toLowerCase());
    }
    if (opts.contactId) {
      emailOrContactConditions.push(`contact_id = $${p++}`);
      params.push(opts.contactId);
    }
    if (emailOrContactConditions.length) {
      conditions.push(`(${emailOrContactConditions.join(' OR ')})`);
    }

    const { rows } = await query(
      `SELECT 1 FROM notification_suppressions WHERE ${conditions.join(' AND ')} LIMIT 1`,
      params
    );

    const suppressed = rows.length > 0;

    // Cache with separate keys for contactId and email
    if (redis?.status === 'ready') {
      if (opts.contactId) {
        const contactKey = `supp:${orgId}:${channel}:contact:${opts.contactId}`;
        await redis.setex(contactKey, 600, suppressed ? '1' : '0').catch(() => {});
      }
      if (opts.email) {
        const emailKey = `supp:${orgId}:${channel}:email:${opts.email.toLowerCase()}`;
        await redis.setex(emailKey, 600, suppressed ? '1' : '0').catch(() => {});
      }
    }
    return suppressed;
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), orgId, channel }, 'suppression:check:fail_open');
    return false; // fail open
  }
}

/** Add a suppression record. Invalidates Redis cache. */
export async function addSuppression(
  orgId: string,
  channel: string,
  reason: SuppressionReason,
  suppressedBy: string,
  opts: { email?: string; contactId?: string; notes?: string; expiresAt?: Date }
): Promise<void> {
  if (!opts.email && !opts.contactId) return;

  // Use separate statements for email-based and contact-based suppressions
  // (PostgreSQL does not allow multiple ON CONFLICT clauses in a single INSERT)
  if (opts.email) {
    await query(
      `INSERT INTO notification_suppressions
         (org_id, email, channel, reason, suppressed_by, notes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (org_id, email, channel) WHERE email IS NOT NULL
       DO UPDATE SET reason = EXCLUDED.reason, notes = EXCLUDED.notes`,
      [orgId, opts.email.toLowerCase(), channel, reason, suppressedBy, opts.notes ?? null, opts.expiresAt ?? null]
    );
  }
  if (opts.contactId) {
    await query(
      `INSERT INTO notification_suppressions
         (org_id, contact_id, channel, reason, suppressed_by, notes, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (org_id, contact_id, channel) WHERE contact_id IS NOT NULL
       DO UPDATE SET reason = EXCLUDED.reason, notes = EXCLUDED.notes`,
      [orgId, opts.contactId, channel, reason, suppressedBy, opts.notes ?? null, opts.expiresAt ?? null]
    );
  }

  // Invalidate cache with separate keys for contactId and email
  const redis = getRedisClient();
  if (redis?.status === 'ready') {
    const keys: string[] = [];
    if (opts.email)     keys.push(`supp:${orgId}:${channel}:email:${opts.email.toLowerCase()}`);
    if (opts.contactId) keys.push(`supp:${orgId}:${channel}:contact:${opts.contactId}`);
    if (keys.length) await redis.del(...keys).catch(() => {});
  }

  // If unsubscribing, revoke consent on the contact record
  if (opts.contactId && reason === 'unsubscribe') {
    await query(
      `UPDATE contacts SET consent_given = FALSE WHERE id = $1`,
      [opts.contactId]
    ).catch(() => {});
  }
}

/** Remove a suppression (admin action). */
export async function removeSuppression(orgId: string, suppressionId: string): Promise<void> {
  const { rows: [sup] } = await query<{ email?: string; contact_id?: string; channel: string }>(
    `DELETE FROM notification_suppressions WHERE id = $1 AND org_id = $2 RETURNING email, contact_id, channel`,
    [suppressionId, orgId]
  );
  if (sup) {
    const redis = getRedisClient();
    if (redis?.status === 'ready') {
      const keys: string[] = [];
      if (sup.contact_id) keys.push(`supp:${orgId}:${sup.channel}:contact:${sup.contact_id}`);
      if (sup.email)      keys.push(`supp:${orgId}:${sup.channel}:email:${sup.email}`);
      if (keys.length) await redis.del(...keys).catch(() => {});
    }
  }
}

/** List suppressions for an org (paginated). */
export async function listSuppressions(
  orgId: string,
  opts: { channel?: string; reason?: string; page?: number; limit?: number }
): Promise<{ suppressions: Suppression[]; total: number }> {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions = ['org_id = $1'];
  const params: unknown[] = [orgId];
  let p = 2;
  if (opts.channel) { conditions.push(`channel = $${p++}`); params.push(opts.channel); }
  if (opts.reason)  { conditions.push(`reason = $${p++}`); params.push(opts.reason); }
  const where = conditions.join(' AND ');

  const [{ rows }, { rows: [{ count }] }] = await Promise.all([
    query<Suppression>(`SELECT * FROM notification_suppressions WHERE ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`, [...params, limit, offset]),
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM notification_suppressions WHERE ${where}`, params),
  ]);

  return { suppressions: rows, total: parseInt(count, 10) };
}
