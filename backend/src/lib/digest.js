// Notification digest builder — aggregates a user's recent notifications into a
// summary (counts by priority + type, plus the top items). Used by the digest
// endpoint now; the scheduled email send is a later sprint (no email provider yet).
const db = require('./db');
const { serialize } = require('./notifications');

const PERIOD_INTERVAL = { day: '1 day', week: '7 days' };

/**
 * @param {string} orgId
 * @param {string} userId
 * @param {'day'|'week'} period
 */
async function buildDigest(orgId, userId, period = 'day') {
  const interval = PERIOD_INTERVAL[period] || PERIOD_INTERVAL.day;

  const { rows: counts } = await db.query(
    `SELECT priority, COUNT(*)::int AS n
       FROM notifications
      WHERE org_id = $1 AND user_id = $2 AND dismissed_at IS NULL
        AND created_at >= NOW() - $3::interval
      GROUP BY priority`,
    [orgId, userId, interval]
  );
  const { rows: byType } = await db.query(
    `SELECT type, COUNT(*)::int AS n
       FROM notifications
      WHERE org_id = $1 AND user_id = $2 AND dismissed_at IS NULL
        AND created_at >= NOW() - $3::interval
      GROUP BY type ORDER BY n DESC LIMIT 10`,
    [orgId, userId, interval]
  );
  // Top items: criticals/warnings first, then most recent.
  const { rows: top } = await db.query(
    `SELECT * FROM notifications
      WHERE org_id = $1 AND user_id = $2 AND dismissed_at IS NULL
        AND created_at >= NOW() - $3::interval
      ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'warning' THEN 1
                             WHEN 'success' THEN 2 WHEN 'info' THEN 3 ELSE 4 END,
               created_at DESC
      LIMIT 5`,
    [orgId, userId, interval]
  );

  const byPriority = Object.fromEntries(counts.map((c) => [c.priority, c.n]));
  const total = counts.reduce((s, c) => s + c.n, 0);

  return {
    period,
    total,
    byPriority,
    byType: byType.map((t) => ({ type: t.type, count: t.n })),
    topItems: top.map(serialize),
  };
}

module.exports = { buildDigest };
