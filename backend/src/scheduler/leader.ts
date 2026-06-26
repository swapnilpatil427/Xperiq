/**
 * Leader election via a Postgres session-level advisory lock.
 *
 * Run as many scheduler replicas as you like for HA: exactly one acquires the lock and runs
 * jobs; the rest stand by. If the leader's process/connection dies, Postgres releases the
 * advisory lock automatically and a standby picks it up on its next tick — no split-brain,
 * no double-running. This is what makes the scheduler safe to scale horizontally.
 *
 * Disable (single-instance mode) with SCHEDULER_LEADER_ELECTION=false.
 */
import type { PoolClient } from 'pg';
import { pool } from '../lib/db';
import logger from '../lib/logger';
import { schedulerIsLeader } from '../lib/metrics';

const LOCK_KEY = Number(process.env.SCHEDULER_LOCK_KEY) || 728_190_421; // arbitrary constant, stable across replicas
const ENABLED = process.env.SCHEDULER_LEADER_ELECTION !== 'false';

let leaderClient: PoolClient | null = null;
let isLeader = false;

export function leaderEnabled(): boolean { return ENABLED; }
export function currentlyLeader(): boolean { return !ENABLED || isLeader; }

/**
 * Ensure this instance is (or becomes) the leader. Returns true if it may run jobs.
 * Verifies the held connection each call so a dropped connection demotes cleanly.
 */
export async function ensureLeadership(): Promise<boolean> {
  if (!ENABLED) { isLeader = true; schedulerIsLeader.set(1); return true; }

  // Already leader → verify the lock-holding connection is still alive.
  if (isLeader && leaderClient) {
    try {
      await leaderClient.query('SELECT 1');
      schedulerIsLeader.set(1);
      return true;
    } catch {
      logger.warn({}, 'scheduler: leader connection lost — demoting');
      try { leaderClient.release(); } catch { /* already gone */ }
      leaderClient = null;
      isLeader = false;
    }
  }

  // Try to acquire the lock on a fresh connection we will hold for as long as we lead.
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    isLeader = false;
    schedulerIsLeader.set(0);
    logger.warn({ err: (err as Error).message }, 'scheduler: leadership acquisition failed');
    return false;
  }
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [LOCK_KEY],
    );
    if (rows[0]?.locked) {
      leaderClient = client;          // keep the connection open to hold the lock
      isLeader = true;
      schedulerIsLeader.set(1);
      logger.info({ lockKey: LOCK_KEY }, 'scheduler: acquired leadership');
      return true;
    }
    client.release();                 // someone else leads — release immediately
    isLeader = false;
    schedulerIsLeader.set(0);
    return false;
  } catch (err) {
    try { client.release(); } catch { /* noop */ }
    isLeader = false;
    schedulerIsLeader.set(0);
    logger.warn({ err: (err as Error).message }, 'scheduler: leadership acquisition failed');
    return false;
  }
}

/** Release the lock on graceful shutdown so a standby can take over immediately. */
export async function releaseLeadership(): Promise<void> {
  if (!leaderClient) return;
  try { await leaderClient.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]); } catch { /* noop */ }
  try { leaderClient.release(); } catch { /* noop */ }
  leaderClient = null;
  isLeader = false;
  schedulerIsLeader.set(0);
}
