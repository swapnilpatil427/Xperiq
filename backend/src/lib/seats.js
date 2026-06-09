// Seat licensing: billable-seat counting, plan limits, and a 7-day / 10% grace
// period. Billable weight comes from org_roles.seat_weight (members = 0).
const db = require('./db');

const GRACE_DAYS = 7;
const GRACE_MULTIPLIER = 1.10;

/**
 * Check whether adding `additionalWeight` of seat usage is allowed.
 * Enterprise orgs are unlimited. Returns { allowed, current, limit, inGracePeriod?, gracePeriodEnd? }.
 */
async function checkSeatLimit(orgId, additionalWeight = 1.0) {
  const { rows: [plan] } = await db.query(
    'SELECT plan_tier, seat_limit, grace_period_end FROM org_profiles WHERE org_id = $1', [orgId]
  );
  if (!plan || plan.plan_tier === 'enterprise') return { allowed: true, unlimited: true };

  const current = await currentBillableSeats(orgId);
  const projected = current + additionalWeight;
  const limit = plan.seat_limit;
  const graceLimit = limit * GRACE_MULTIPLIER;

  if (projected <= limit) return { allowed: true, current, limit };

  const now = new Date();
  const graceEnd = plan.grace_period_end ? new Date(plan.grace_period_end) : null;

  if (graceEnd && now < graceEnd && projected <= graceLimit) {
    return { allowed: true, inGracePeriod: true, current, limit, gracePeriodEnd: graceEnd };
  }
  if (!graceEnd && projected <= graceLimit) {
    const newGraceEnd = new Date(now.getTime() + GRACE_DAYS * 86400000);
    await db.query('UPDATE org_profiles SET grace_period_end = $1 WHERE org_id = $2', [newGraceEnd, orgId]);
    return { allowed: true, inGracePeriod: true, current, limit, gracePeriodEnd: newGraceEnd };
  }
  return { allowed: false, current, limit };
}

async function currentBillableSeats(orgId) {
  const { rows: [usage] } = await db.query(
    `SELECT COALESCE(SUM(r.seat_weight), 0) AS current
       FROM user_profiles up
       JOIN org_roles r ON r.id = up.role_id
      WHERE up.org_id = $1 AND up.is_active = TRUE AND up.deprovisioned_at IS NULL`,
    [orgId]
  );
  return parseFloat(usage.current) || 0;
}

/** Full breakdown for the Seats admin page. */
async function seatBreakdown(orgId) {
  const { rows: [plan] } = await db.query(
    'SELECT plan_tier, seat_limit, grace_period_end FROM org_profiles WHERE org_id = $1', [orgId]
  );
  const { rows: byRole } = await db.query(
    `SELECT r.name AS role_name, r.builtin_key, r.seat_weight,
            COUNT(up.user_id) FILTER (WHERE up.is_active AND up.deprovisioned_at IS NULL)::int AS active_users,
            (r.seat_weight * COUNT(up.user_id) FILTER (WHERE up.is_active AND up.deprovisioned_at IS NULL))::numeric(10,1) AS billable
       FROM org_roles r
       LEFT JOIN user_profiles up ON up.role_id = r.id AND up.org_id = r.org_id
      WHERE r.org_id = $1
      GROUP BY r.id
      ORDER BY r.seat_weight DESC, r.name`,
    [orgId]
  );
  const billableSeats = await currentBillableSeats(orgId);
  const tier = plan?.plan_tier || 'starter';
  const limit = plan?.seat_limit ?? 5;
  return {
    planTier: tier,
    seatLimit: tier === 'enterprise' ? null : limit,
    billableSeats,
    available: tier === 'enterprise' ? null : Math.max(0, limit - billableSeats),
    gracePeriodEnd: plan?.grace_period_end || null,
    byRole: byRole.map((r) => ({
      roleName: r.role_name, builtinKey: r.builtin_key,
      seatWeight: Number(r.seat_weight), activeUsers: r.active_users,
      billable: Number(r.billable) || 0,
    })),
  };
}

module.exports = { checkSeatLimit, currentBillableSeats, seatBreakdown, GRACE_DAYS, GRACE_MULTIPLIER };
