// Seat licensing: billable-seat counting, plan limits, and a 7-day / 10% grace
// period. Billable weight comes from org_roles.seat_weight (members = 0).
import { query } from './db';

export const GRACE_DAYS = 7;
export const GRACE_MULTIPLIER = 1.10;

export interface SeatLimitResult {
  allowed: boolean;
  unlimited?: boolean;
  current?: number;
  limit?: number;
  inGracePeriod?: boolean;
  gracePeriodEnd?: Date;
}

/**
 * Check whether adding `additionalWeight` of seat usage is allowed.
 * Enterprise orgs are unlimited. Returns { allowed, current, limit, inGracePeriod?, gracePeriodEnd? }.
 */
export async function checkSeatLimit(orgId: string, additionalWeight: number = 1.0): Promise<SeatLimitResult> {
  const { rows: [plan] } = await query(
    'SELECT plan_tier, seat_limit, grace_period_end FROM org_profiles WHERE org_id = $1', [orgId]
  );
  if (!plan || (plan as { plan_tier: string }).plan_tier === 'enterprise') return { allowed: true, unlimited: true };

  const planRow = plan as { plan_tier: string; seat_limit: number; grace_period_end: string | null };
  const current = await currentBillableSeats(orgId);
  const projected = current + additionalWeight;
  const limit = planRow.seat_limit;
  const graceLimit = limit * GRACE_MULTIPLIER;

  if (projected <= limit) return { allowed: true, current, limit };

  const now = new Date();
  const graceEnd = planRow.grace_period_end ? new Date(planRow.grace_period_end) : null;

  if (graceEnd && now < graceEnd && projected <= graceLimit) {
    return { allowed: true, inGracePeriod: true, current, limit, gracePeriodEnd: graceEnd };
  }
  if (!graceEnd && projected <= graceLimit) {
    const newGraceEnd = new Date(now.getTime() + GRACE_DAYS * 86400000);
    await query('UPDATE org_profiles SET grace_period_end = $1 WHERE org_id = $2', [newGraceEnd, orgId]);
    return { allowed: true, inGracePeriod: true, current, limit, gracePeriodEnd: newGraceEnd };
  }
  return { allowed: false, current, limit };
}

export async function currentBillableSeats(orgId: string): Promise<number> {
  const { rows: [usage] } = await query(
    `SELECT COALESCE(SUM(r.seat_weight), 0) AS current
       FROM user_profiles up
       JOIN org_roles r ON r.id = up.role_id
      WHERE up.org_id = $1 AND up.is_active = TRUE AND up.deprovisioned_at IS NULL`,
    [orgId]
  );
  return parseFloat((usage as { current: string }).current) || 0;
}

export interface RoleBreakdown {
  roleName: string;
  builtinKey: string | null;
  seatWeight: number;
  activeUsers: number;
  billable: number;
}

export interface SeatBreakdown {
  planTier: string;
  seatLimit: number | null;
  billableSeats: number;
  available: number | null;
  gracePeriodEnd: string | null;
  byRole: RoleBreakdown[];
}

/** Full breakdown for the Seats admin page. */
export async function seatBreakdown(orgId: string): Promise<SeatBreakdown> {
  const { rows: [plan] } = await query(
    'SELECT plan_tier, seat_limit, grace_period_end FROM org_profiles WHERE org_id = $1', [orgId]
  );
  const { rows: byRole } = await query(
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
  const planRow = plan as { plan_tier?: string; seat_limit?: number; grace_period_end?: string | null } | undefined;
  const tier = planRow?.plan_tier || 'starter';
  const limit = planRow?.seat_limit ?? 5;
  return {
    planTier: tier,
    seatLimit: tier === 'enterprise' ? null : limit,
    billableSeats,
    available: tier === 'enterprise' ? null : Math.max(0, limit - billableSeats),
    gracePeriodEnd: planRow?.grace_period_end || null,
    byRole: (byRole as Array<{
      role_name: string;
      builtin_key: string | null;
      seat_weight: string;
      active_users: number;
      billable: string;
    }>).map((r) => ({
      roleName: r.role_name, builtinKey: r.builtin_key,
      seatWeight: Number(r.seat_weight), activeUsers: r.active_users,
      billable: Number(r.billable) || 0,
    })),
  };
}
