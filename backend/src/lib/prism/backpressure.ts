/**
 * Prism backpressure — staging-depth watermarks with hysteresis.
 *
 * The raw staging table is the shock absorber. EXTRACT may outrun LOAD; without
 * a bound, unloaded raw depth blows the per-tenant ~150 GB headroom. So EXTRACT
 * throttles on "unloaded depth" = extracted − loaded − skipped, per job
 * (operations-runbook.md §2.5):
 *
 *   - High watermark 2M unloaded raw  → pause EXTRACT for this job (yield workers).
 *   - Low  watermark 500k unloaded    → resume EXTRACT (hysteresis prevents flapping).
 *
 * Depth is derived from `prism_jobs.counts` (the durable source of truth) so a
 * Redis loss never loses the backpressure decision. A tiny Redis flag caches the
 * paused/running state across workers; in-memory fallback when no Redis.
 */
import type { PrismCounts } from '../../types/prism';
import { query } from '../db';
import { getRedisClient } from '../redis';
import logger from '../logger';

export const HIGH_WATERMARK = 2_000_000;
export const LOW_WATERMARK = 500_000;

const NS = 'prism:bp';

// In-memory fallback flag set (jobIds currently paused by backpressure).
const memPaused = new Set<string>();

/** Unloaded raw depth from a counts object: extracted − loaded − skipped. */
export function unloadedDepth(counts: PrismCounts): number {
  const extracted = counts.extracted ?? 0;
  const loaded = counts.loaded ?? 0;
  const skipped = counts.skipped ?? 0;
  return Math.max(0, extracted - loaded - skipped);
}

async function readCounts(orgId: string, jobId: string): Promise<PrismCounts> {
  const { rows } = await query<{ counts: PrismCounts }>(
    `SELECT counts FROM prism_jobs WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [jobId, orgId],
  );
  return rows[0]?.counts ?? {};
}

async function setPausedFlag(jobId: string, paused: boolean): Promise<void> {
  const redis = getRedisClient();
  const key = `${NS}:${jobId}`;
  if (!redis) {
    if (paused) memPaused.add(jobId); else memPaused.delete(jobId);
    return;
  }
  try {
    if (paused) await redis.set(key, '1', 'EX', 3600);
    else await redis.del(key);
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'prism:backpressure flag fail');
    if (paused) memPaused.add(jobId); else memPaused.delete(jobId);
  }
}

/** Whether EXTRACT for this job is currently paused by backpressure. */
export async function isPaused(jobId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return memPaused.has(jobId);
  try {
    return (await redis.get(`${NS}:${jobId}`)) === '1';
  } catch {
    return memPaused.has(jobId);
  }
}

/**
 * Evaluate backpressure for a job and update the paused flag with hysteresis.
 * Returns the new decision: 'pause' | 'resume' | 'hold' (no change).
 *
 * Hysteresis: cross HIGH → pause; only resume once depth falls below LOW. In the
 * band between LOW and HIGH the prior decision holds (prevents flapping).
 */
export async function evaluate(
  orgId: string,
  jobId: string,
  counts?: PrismCounts,
): Promise<'pause' | 'resume' | 'hold'> {
  const c = counts ?? (await readCounts(orgId, jobId));
  const depth = unloadedDepth(c);
  const wasPaused = await isPaused(jobId);

  if (!wasPaused && depth >= HIGH_WATERMARK) {
    await setPausedFlag(jobId, true);
    logger.warn({ orgId, jobId, depth }, 'prism:backpressure pause EXTRACT (high watermark)');
    return 'pause';
  }
  if (wasPaused && depth <= LOW_WATERMARK) {
    await setPausedFlag(jobId, false);
    logger.info({ orgId, jobId, depth }, 'prism:backpressure resume EXTRACT (low watermark)');
    return 'resume';
  }
  return 'hold';
}

/**
 * Gate an EXTRACT loop: returns true if EXTRACT may proceed, false if it should
 * yield. Callers re-check between pages.
 */
export async function mayExtract(orgId: string, jobId: string, counts?: PrismCounts): Promise<boolean> {
  await evaluate(orgId, jobId, counts);
  return !(await isPaused(jobId));
}
