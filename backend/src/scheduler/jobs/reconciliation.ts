import { query } from '../../lib/db';
import logger from '../../lib/logger';
import { creditInvariantViolations } from '../../lib/metrics';

/**
 * Credit-ledger integrity reconciliation (read-only, safe to run anywhere).
 *
 * Checks balance invariants that must always hold — any violation means a debit/grant bug.
 * Emits `credit_invariant_violations` so the `CreditInvariantViolation` alert fires. At scale
 * this is the early-warning system that catches a metering regression before it costs money.
 *
 * (Stripe-payment reconciliation is added here once live Stripe data exists; the structure is ready.)
 */
export async function reconciliation(): Promise<{ affected: number; note: string }> {
  const { rows } = await query<{
    neg_allowance: string; neg_pack: string; over_allowance: string; neg_overage: string; total: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE allowance_remaining < 0)                AS neg_allowance,
      COUNT(*) FILTER (WHERE pack_balance < 0)                       AS neg_pack,
      COUNT(*) FILTER (WHERE allowance_remaining > monthly_allowance) AS over_allowance,
      COUNT(*) FILTER (WHERE overage_used < 0)                       AS neg_overage,
      COUNT(*)                                                       AS total
    FROM credit_accounts
  `);
  const r = rows[0] ?? { neg_allowance: '0', neg_pack: '0', over_allowance: '0', neg_overage: '0', total: '0' };
  const violations =
    Number(r.neg_allowance) + Number(r.neg_pack) + Number(r.over_allowance) + Number(r.neg_overage);

  creditInvariantViolations.set(violations);

  if (violations > 0) {
    logger.error(
      { neg_allowance: r.neg_allowance, neg_pack: r.neg_pack, over_allowance: r.over_allowance, neg_overage: r.neg_overage },
      'reconciliation: credit invariant violations detected',
    );
  } else {
    logger.info({ accounts: r.total }, 'reconciliation: credit invariants OK');
  }
  return { affected: violations, note: `accounts=${r.total} violations=${violations}` };
}
