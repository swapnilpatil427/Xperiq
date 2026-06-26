/**
 * docAutoApprove — optimistic-window auto-approve job.
 *
 * Finds support docs in `pending_review` whose `auto_approve_deadline` has
 * passed and transitions them publishing -> live. Uses FOR UPDATE SKIP LOCKED
 * so multiple concurrent scheduler replicas never double-approve the same doc.
 *
 * Export contract:
 *   runDocAutoApproveJob()         -> Promise<number>   (count approved)
 *   startDocAutoApproveScheduler() -> NodeJS.Timeout    (5-min setInterval)
 */

import { query, pool as defaultPool } from '../lib/db';
import { transitionDoc } from '../lib/pipelineStateMachine';
import { supportDocsAutoApprovedTotal } from '../lib/metrics';
import logger from '../lib/logger';

const JOB_NAME  = 'doc-auto-approve';
const BATCH_MAX = 10;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Run one pass of the auto-approve job.
 * Accepts an optional pool override for testability.
 * Returns the number of docs approved this pass.
 */
async function runDocAutoApproveJob(pool?: typeof defaultPool): Promise<number> {
  const activePool = pool ?? defaultPool;
  // Acquire a client so FOR UPDATE SKIP LOCKED is held within a single
  // connection; release before returning to avoid pool exhaustion.
  const client = await activePool.connect();
  let approved = 0;

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM support_docs
        WHERE pipeline_status     = 'pending_review'
          AND auto_approve_deadline <= NOW()
          AND deleted_at IS NULL
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [BATCH_MAX],
    );

    await client.query('COMMIT');

    if (rows.length === 0) return 0;

    for (const { id: docId } of rows) {
      try {
        // pending_review -> publishing -> live
        await transitionDoc(docId, 'publishing', {
          actorType: 'system',
          metadata:  { reason: 'optimistic_window_expired' },
        });
        await transitionDoc(docId, 'live', {
          actorType: 'system',
          metadata:  { published_at: new Date().toISOString() },
        });

        supportDocsAutoApprovedTotal.inc();
        approved += 1;

        logger.info({ docId }, `${JOB_NAME}: auto-approved doc`);
      } catch (err) {
        // Per-doc error isolation: one failure must not kill the batch
        logger.error(
          { docId, err: err instanceof Error ? err.message : String(err) },
          `${JOB_NAME}: failed to auto-approve doc`,
        );
      }
    }
  } catch (err) {
    // If the SELECT/BEGIN/COMMIT itself fails, roll back and surface the count
    try { await client.query('ROLLBACK'); } catch { /* ignore secondary error */ }
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      `${JOB_NAME}: batch query failed`,
    );
  } finally {
    client.release();
  }

  return approved;
}

/**
 * Start the 5-minute recurring scheduler.
 */
function startDocAutoApproveScheduler(): NodeJS.Timeout {
  logger.info({ interval_ms: INTERVAL_MS }, `${JOB_NAME}: scheduler started`);

  // Fire immediately on startup, then every 5 minutes
  void runDocAutoApproveJob().catch((err) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, `${JOB_NAME}: initial run failed`);
  });

  return setInterval(() => {
    void runDocAutoApproveJob().catch((err) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, `${JOB_NAME}: scheduled run failed`);
    });
  }, INTERVAL_MS);
}

export { runDocAutoApproveJob, startDocAutoApproveScheduler };
