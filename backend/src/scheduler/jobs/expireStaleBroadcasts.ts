import { query } from '../../lib/db';

/**
 * Expire broadcasts stuck in `pending_approval` past their 72h window.
 * Calls the idempotent DB function `expire_stale_broadcasts()` (which also writes audit rows).
 * Previously orphaned — no process called it; now owned by the scheduler service.
 */
export async function expireStaleBroadcasts(): Promise<{ affected: number }> {
  const { rows } = await query<{ expire_stale_broadcasts: number }>(
    'SELECT expire_stale_broadcasts() AS expire_stale_broadcasts'
  );
  return { affected: Number(rows[0]?.expire_stale_broadcasts ?? 0) };
}
