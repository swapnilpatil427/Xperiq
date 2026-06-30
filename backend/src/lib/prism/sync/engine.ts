/**
 * Prism continuous-sync (CDC) engine.
 *
 * Per ADR-022, bulk and continuous sync share TRANSFORM/LOAD/ENRICH; continuous
 * sync adds SCHEDULING + CAPTURE on top of the existing engine
 * (architecture-ingestion.md §5). Responsibilities:
 *
 *   - Capability negotiation: pick push vs poll per (connection, record_type)
 *     from the connector manifest's `captureModes`; default to poll when a source
 *     exposes no webhook.
 *   - Read/write `prism_sync_state` (the per-connection cursor/lag/freshness row).
 *   - Freshness SLO: push < 300s; poll < cadence + 1 interval. Breach → lag alert.
 *   - Adaptive cadence: tighten when fresh data flows, relax when idle, always
 *     inside the rate budget (§7).
 *   - Augment rolling-buffer note: Augment has no full-history store — it tails the
 *     live feed and that feed BECOMES history over time (it is NOT stateless).
 */
import type {
  RecordType,
  CaptureMode,
  ConnectorMeta,
  PrismSyncState,
  PrismMode,
} from '../../../types/prism';
import { query } from '../../db';
import logger from '../../logger';
import { pollOnce, reconcilingBackstop, readSyncState, type PollContext } from './poll';

// Freshness SLOs (seconds).
const PUSH_FRESHNESS_SLO_S = 300;
const POLL_MIN_CADENCE_S = 30;
const POLL_MAX_CADENCE_S = 3600;

/**
 * Circuit breaker: after this many consecutive failures a stream is auto-paused
 * (operations-runbook.md §10 — "a job never silently stalls"). An operator (or a
 * successful manual poll) clears `paused` to resume.
 */
export const CIRCUIT_FAIL_THRESHOLD = 6;

/**
 * Augment rolling-buffer window (seconds). Augment keeps no full history — it tails
 * the live feed and that feed BECOMES history. We retain a bounded recent window of
 * raw records per (connection, record_type) so an Augment connection never
 * accumulates unbounded (architecture-ingestion.md §5 "Augment storage: a rolling
 * buffer"). Default 90 days ≈ the largest `history_window` (12 mo would be Ingest).
 */
export const AUGMENT_BUFFER_S = 90 * 24 * 3600;

/**
 * Capability negotiation: choose the capture mode for a (connection, record_type).
 * Push is preferred when the connector declares it; poll is the universal fallback
 * and ALSO runs as a reconciling backstop under push (§5).
 */
export function negotiateCaptureMode(meta: ConnectorMeta, recordType: RecordType): CaptureMode {
  const declared = meta.captureModes?.[recordType];
  if (declared === 'push') return 'push_verified'; // push always carries a poll backstop
  if (declared === 'push_verified') return 'push_verified';
  return 'poll';
}

/** Upsert the per-(connection, record_type) sync-state row, initializing SLO/cadence. */
export async function ensureSyncState(
  orgId: string,
  connectionId: string,
  recordType: RecordType,
  captureMode: CaptureMode,
  webhookSecretRef: string | null,
): Promise<PrismSyncState> {
  const freshnessSlo = captureMode === 'poll' ? POLL_MIN_CADENCE_S * 2 : PUSH_FRESHNESS_SLO_S;
  const cadence = captureMode === 'poll' ? POLL_MIN_CADENCE_S * 2 : null;
  const { rows } = await query<PrismSyncState>(
    `INSERT INTO prism_sync_state
       (org_id, connection_id, record_type, capture_mode, cursor, freshness_slo_s,
        poll_cadence_s, consecutive_fail, webhook_secret_ref, paused)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, 0, $7, false)
     ON CONFLICT (connection_id, record_type)
     DO UPDATE SET capture_mode = EXCLUDED.capture_mode,
                   webhook_secret_ref = COALESCE(EXCLUDED.webhook_secret_ref, prism_sync_state.webhook_secret_ref),
                   updated_at = now()
     RETURNING connection_id, record_type, org_id, capture_mode, cursor,
               last_event_at, last_synced_at, lag_seconds, freshness_slo_s,
               poll_cadence_s, consecutive_fail, webhook_secret_ref, paused`,
    [orgId, connectionId, recordType, captureMode, freshnessSlo, cadence, webhookSecretRef],
  );
  return rows[0];
}

/**
 * Get-or-create the single persistent "live sync job" for a connection.
 *
 * Continuous-sync ingress (webhook + poll) needs a real `prism_jobs` row because
 * `prism_raw_records.job_id` is `NOT NULL REFERENCES prism_jobs(id)`. Bulk imports
 * create one job per run; a streaming connection instead has ONE long-lived
 * `kind='sync'` job that every new record (push or poll) is stamped against — the
 * stable anchor for the conservation funnel + downstream stage queue. Idempotent:
 * reuses the existing live job if one is present; otherwise inserts it.
 *
 * Returns the job id. org-scoped + parameterized.
 */
export async function ensureLiveSyncJob(
  orgId: string,
  connectionId: string,
  triggeredBy: 'webhook' | 'schedule' = 'schedule',
): Promise<string> {
  // Reuse the PARKED ANCHOR job only — a paused sync job still at `extract` that has
  // not yet been handed to the pipeline. New raw rows stamped to it will be picked up
  // by `stageTransform`'s `loadAllRaw(job_id)` when `triggerIngest` flips it to
  // transform. We deliberately do NOT reuse a job already advanced past extract (it is
  // mid-pipeline; its TRANSFORM corpus is fixed) — those new rows get a fresh anchor so
  // they are never orphaned (transformed-by-job_id is exact).
  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM prism_jobs
      WHERE org_id = $1 AND connection_id = $2 AND kind = 'sync' AND deleted_at IS NULL
        AND status = 'paused' AND stage = 'extract'
      ORDER BY created_at ASC
      LIMIT 1`,
    [orgId, connectionId],
  );
  if (existing[0]) return existing[0].id;

  // Create the live sync job PARKED (paused, at extract) so the bulk worker does NOT
  // pick it up and run it through the interactive DISCOVER/MAP/DRY-RUN gates — those
  // are for bulk imports. The webhook/poll path appends raw rows under this job and
  // then `triggerIngest` flips it to TRANSFORM/running, sending the NEW rows straight
  // through the shared TRANSFORM→LOAD→ENRICH spine (no per-batch human confirm).
  const { rows } = await query<{ id: string }>(
    `INSERT INTO prism_jobs
       (org_id, connection_id, kind, stage, status, cursor, counts, triggered_by, created_by)
     VALUES ($1, $2, 'sync', 'extract', 'paused', '{}'::jsonb, '{}'::jsonb, $3, 'system')
     RETURNING id`,
    [orgId, connectionId, triggeredBy],
  );
  logger.info({ orgId, connectionId, jobId: rows[0].id, triggeredBy }, 'prism:sync live sync job created');
  return rows[0].id;
}

/**
 * Trigger the downstream LOAD+ENRICH path for freshly-appended raw records.
 *
 * New responses reach the canonical tables the SAME way a bulk import does: through
 * the shared engine spine TRANSFORM → LOAD → RECONCILE → ENRICH → PUBLISH (ADR-022 —
 * bulk and continuous sync are one consumer; downstream is identical). The Prism
 * WORKER (lib/prism/worker.ts) drives a job purely from its `prism_jobs.stage/status`
 * row, so to hand the appended raw rows to the pipeline we advance the live sync job
 * straight to TRANSFORM/running (skipping the interactive MAP/DRY-RUN gates — a
 * streaming connection reuses its already-confirmed mapping via mapping-memory; new
 * data is never re-confirmed per the architecture's "new data always checkpointed, no
 * setting"). We ALSO enqueue the TRANSFORM stage on the per-connection Redis queue
 * (the engine's dispatch hint) so any queue-driven dispatcher sees it too.
 *
 * Idempotent + cheap: TRANSFORM/LOAD are idempotent (hash-aware raw dedupe +
 * natural-key monotonic upsert), so re-running over already-seen rows is a no-op diff.
 * Only advances a job that is at/before TRANSFORM and not parked — never disturbs a
 * job a worker is mid-stage on.
 *
 * Imported lazily to avoid a static cycle (engine ↔ sync/engine).
 *
 * TODO(verify): the worker's stageTransform requires a confirmed `prism_mappings` row
 * for the connection (from the initial bulk/migration setup). A push_verified/poll
 * connection with NO confirmed mapping yet will park at MAP on its first ingest —
 * which is the intended one-time confirm; subsequent batches reuse mapping-memory.
 */
export async function triggerIngest(connectionId: string, jobId: string): Promise<void> {
  if (!jobId) return;
  // Advance the live sync job to TRANSFORM so the worker carries the new raw rows
  // forward. Guard: only when the job is still at/before TRANSFORM and running/queued
  // (don't yank a job a worker has already moved into dryrun/load/etc.).
  await query(
    `UPDATE prism_jobs
        SET stage = 'transform', status = 'running', updated_at = now()
      WHERE id = $1 AND connection_id = $2 AND deleted_at IS NULL
        AND kind = 'sync'
        AND status IN ('queued', 'running', 'paused')
        AND stage IN ('connect', 'discover', 'extract', 'profile')`,
    [jobId, connectionId],
  ).catch(() => {});
  const { enqueueStage } = await import('../engine');
  await enqueueStage(connectionId, jobId, 'transform');
}

/**
 * Augment rolling-buffer retention trim. Augment connections keep only a bounded
 * recent window of raw records — they tail the live feed, they do not accumulate
 * full history. Deletes raw rows older than `AUGMENT_BUFFER_S` for an Augment
 * connection (no-op for ingest/migrate, which retain history per `PRISM_RAW_RETENTION`).
 * Keyed on `source_observed_at` (the source's own time), falling back to
 * `extracted_at` when the source exposed no timestamp. Returns rows trimmed.
 */
export async function trimAugmentBuffer(
  orgId: string,
  connectionId: string,
  recordType: RecordType,
  mode: PrismMode,
  bufferSeconds = AUGMENT_BUFFER_S,
): Promise<number> {
  if (mode !== 'augment') return 0;
  const res = await query(
    `DELETE FROM prism_raw_records
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3
        AND COALESCE(source_observed_at, extracted_at) < now() - make_interval(secs => $4)`,
    [orgId, connectionId, recordType, bufferSeconds],
  ).catch((err: unknown) => {
    logger.warn(
      { orgId, connectionId, recordType, err: (err as Error).message },
      'prism:sync augment buffer trim failed',
    );
    return { rowCount: 0 };
  });
  const trimmed = res.rowCount ?? 0;
  if (trimmed > 0) {
    logger.info({ orgId, connectionId, recordType, trimmed, bufferSeconds }, 'prism:sync augment buffer trimmed');
  }
  return trimmed;
}

/** Current lag (seconds) for a stream and whether it breaches the freshness SLO. */
export async function checkFreshness(
  orgId: string,
  connectionId: string,
  recordType: RecordType,
): Promise<{ lagSeconds: number | null; sloS: number; breached: boolean }> {
  const state = await readSyncState(orgId, connectionId, recordType);
  if (!state) return { lagSeconds: null, sloS: 0, breached: false };
  const lag = state.lag_seconds;
  const breached = lag != null && lag > state.freshness_slo_s;
  if (breached) {
    logger.warn(
      { orgId, connectionId, recordType, lag, slo: state.freshness_slo_s },
      'prism:sync freshness SLO breach',
    );
  }
  return { lagSeconds: lag, sloS: state.freshness_slo_s, breached };
}

/**
 * Adaptive cadence: tighten cadence toward the floor when the last cycle found new
 * data (the stream is active), relax toward the ceiling when idle — always within
 * the rate budget. Returns the new cadence seconds.
 */
export function nextCadence(current: number, foundNew: boolean): number {
  const next = foundNew ? Math.floor(current / 2) : Math.floor(current * 1.5);
  return Math.min(POLL_MAX_CADENCE_S, Math.max(POLL_MIN_CADENCE_S, next));
}

async function persistCadence(
  orgId: string,
  connectionId: string,
  recordType: RecordType,
  cadence: number,
): Promise<void> {
  await query(
    `UPDATE prism_sync_state SET poll_cadence_s = $4, updated_at = now()
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3`,
    [orgId, connectionId, recordType, cadence],
  ).catch(() => {});
}

/**
 * Run one scheduler tick for a stream: poll (or backstop-poll under push), then
 * adapt cadence based on whether new data flowed. The caller's scheduler invokes
 * this every `poll_cadence_s`. Returns whether new data was appended.
 */
export async function tick(
  ctx: PollContext,
  captureMode: CaptureMode,
): Promise<{ appended: number; cadenceS: number }> {
  const state = await readSyncState(ctx.orgId, ctx.connectionId, ctx.recordType);
  const result =
    captureMode === 'poll'
      ? await pollOnce(ctx)
      : await reconcilingBackstop(ctx); // push streams use poll only to catch gaps

  await checkFreshness(ctx.orgId, ctx.connectionId, ctx.recordType);

  const cadenceS = nextCadence(state?.poll_cadence_s ?? POLL_MIN_CADENCE_S * 2, result.appended > 0);
  if (captureMode === 'poll') {
    await persistCadence(ctx.orgId, ctx.connectionId, ctx.recordType, cadenceS);
  }
  return { appended: result.appended, cadenceS };
}

/**
 * Circuit breaker: pause a stream once `consecutive_fail` crosses the threshold so a
 * persistently-failing source stops being polled (and surfaces as a paused/alerting
 * stream) instead of looping forever (operations-runbook.md §10). Reads the current
 * fail count from the row and pauses if it is at/over the threshold. Returns whether
 * the stream was tripped (newly paused). A later successful poll resets
 * `consecutive_fail` to 0 (poll.advanceCursor) but leaves `paused` for an operator to
 * clear — explicit, not silent, recovery.
 */
export async function applyCircuitBreaker(
  orgId: string,
  connectionId: string,
  recordType: RecordType,
): Promise<boolean> {
  const { rows } = await query<{ consecutive_fail: number; paused: boolean }>(
    `SELECT consecutive_fail, paused FROM prism_sync_state
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3`,
    [orgId, connectionId, recordType],
  );
  const row = rows[0];
  if (!row || row.paused) return false;
  if (Number(row.consecutive_fail) < CIRCUIT_FAIL_THRESHOLD) return false;
  await setPaused(orgId, connectionId, recordType, true);
  logger.error(
    { orgId, connectionId, recordType, consecutiveFail: row.consecutive_fail },
    'prism:sync circuit-break — stream paused after sustained failures',
  );
  return true;
}

/**
 * Pause / resume a stream (operational control; also used by backpressure and the
 * circuit-breaker on sustained source failures).
 */
export async function setPaused(
  orgId: string,
  connectionId: string,
  recordType: RecordType,
  paused: boolean,
): Promise<void> {
  await query(
    `UPDATE prism_sync_state SET paused = $4, updated_at = now()
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3`,
    [orgId, connectionId, recordType, paused],
  );
  logger.info({ orgId, connectionId, recordType, paused }, 'prism:sync setPaused');
}
