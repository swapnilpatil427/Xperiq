import { query } from '../../lib/db';
import logger from '../../lib/logger';

/**
 * Keeps `credit_ledger` partitions provisioned ahead and applies retention.
 *
 * - Ensures the current + next two months' partitions exist (so inserts always land in a
 *   monthly partition, not the DEFAULT catch-all).
 * - Drops partitions older than `CREDIT_LEDGER_RETENTION_MONTHS` (default 18) in O(1).
 *
 * No-ops safely if `credit_ledger` isn't partitioned (the DB functions guard for that).
 */
const RETENTION_MONTHS = (() => {
  const n = Number(process.env.CREDIT_LEDGER_RETENTION_MONTHS);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 18;
})();

export async function creditLedgerMaintenance(): Promise<{ affected: number; note: string }> {
  // Provision ahead (idempotent).
  await query(`SELECT create_credit_ledger_partition(CURRENT_DATE)`);
  await query(`SELECT create_credit_ledger_partition((CURRENT_DATE + INTERVAL '1 month')::date)`);
  await query(`SELECT create_credit_ledger_partition((CURRENT_DATE + INTERVAL '2 months')::date)`);

  // Retention.
  const { rows } = await query<{ dropped: number }>(
    `SELECT drop_old_credit_ledger_partitions($1) AS dropped`,
    [RETENTION_MONTHS],
  );
  const dropped = Number(rows[0]?.dropped ?? 0);
  if (dropped > 0) {
    logger.info({ dropped, keep_months: RETENTION_MONTHS }, 'credit-ledger-maintenance: dropped old partitions');
  }
  return { affected: dropped, note: `provisioned ahead; kept ${RETENTION_MONTHS} months` };
}
