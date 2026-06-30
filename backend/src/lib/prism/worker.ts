/**
 * Prism worker — the loop that actually RUNS jobs end-to-end.
 *
 * The engine (engine.ts) owns the state machine, queues, and backpressure but is
 * intentionally passive: it advances `prism_jobs.stage`/`status` and enqueues work.
 * Nothing dequeues that work, so a created job sits at `connect` forever. THIS
 * module is the missing motor: a resilient loop that claims queued jobs, runs the
 * next stage's real work, advances the spine, and reschedules — with no human
 * babysitting except the three intended interactive pauses (architecture-ingestion.md
 * §3 state machine + §10 concurrency/observability).
 *
 * Design (the contract):
 *   - CLAIM. Two-tier so a single instance is fast and N instances stay correct:
 *       1. Redis per-connection queue (engine.dequeueStage) is the fast dispatch hint.
 *       2. A Postgres `FOR UPDATE SKIP LOCKED` claim is the safety net + horizontal-
 *          scale guard: it atomically flips a runnable `queued` job to `running` so
 *          two workers never grab the same job. Redis is only a hint — the durable
 *          truth (and the resume point) is always the `prism_jobs` row + cursor.
 *   - RESUME / CRASH-SAFE. The worker derives the next action SOLELY from the row
 *       (stage + status + cursor). A crashed worker (or a Redis flush) re-derives
 *       running jobs from Postgres on the next tick — exactly the engine's stated
 *       "Redis loss re-derives running jobs from Postgres" property.
 *   - ADVANCE. After a stage's work succeeds, the worker moves the job to the next
 *       stage and keeps it `running` so the next tick runs that stage's work. The two
 *       interactive stages (map, dryrun) do their PROPOSAL/diff work first, then park
 *       `awaiting_input` themselves — so the human always sees a real proposal, never an
 *       empty pause. The worker STOPS at a parked job until the API's confirm/approve
 *       resumes it (engine.resume → engine.advance flips it back to `running` on the next
 *       stage, re-entering this loop). PUBLISH resolves the job terminal via engine.advance.
 *   - STOP CONDITIONS. The worker only processes `running` jobs. It never touches
 *       `awaiting_input` / `paused` / terminal (`complete`/`partial`/`failed`).
 *   - FAIRNESS. Jobs are claimed oldest-first but de-duplicated per org per tick so one
 *       large migration can't monopolize a tick (best-effort weighted fairness, §10).
 *   - CONCURRENCY. EXTRACT is the IO/rate-bound stage; a semaphore bounds concurrent
 *       EXTRACTs to PRISM_MAX_CONCURRENT_EXTRACT (the rest of the spine is DB-bound and
 *       fast, so it isn't separately gated).
 *   - RESILIENCE. Every stage runs in try/catch → structured logs + Prometheus metrics
 *       (lib/prism/metrics). Transient errors back the job off (`queued` + retryable
 *       error, picked up on a later tick); non-retryable errors fail it; a partial set
 *       of poison records ends the job `partial` — never a silent stall (§10 SLO).
 *
 * Touch-scope note: this file + engine.ts are the only changes. The worker auto-starts
 * lazily from `engine.enqueueJob` (so a job created via the API begins processing the
 * moment the worker is enabled) and is also safe to start explicitly from the server
 * boot. TODO(verify): wire `startPrismWorker()` into `backend/src/index.ts` `start()`
 * (next to the Event Engine kick-off) for a guaranteed-running worker in production;
 * left out here to honor the "touch only worker.ts + engine.ts" constraint.
 */
import type { PoolClient } from 'pg';
import type {
  PrismStage,
  PrismJob,
  ResourceRef,
  RawRecord,
  RecordType,
  PrismMapping,
  SourceSchemaProfile,
} from '../../types/prism';
import { query, pool } from '../db';
import logger from '../logger';
import * as agentsClient from '../agentsClient';
import {
  prismRecordsTotal,
  prismStageDurationSeconds,
  prismReconMismatchTotal,
} from './metrics';

import * as engine from './engine';
import { getConnector } from './connectors';
import { appendRawRecords } from './extract';
import { transform, type StagedRow } from './transform';
import { dryRun } from './dryrun';
import { load } from './load';
import { reconcile } from './reconcile';
import { resolve as resolveMapping, schemaShapeHash, saveConfirmedMapping } from './mapping/resolver';
import { deleteUpload } from './uploads';

// ── Tunables (SHARED PRODUCTION CONTRACT — exact env names) ────────────────────
function workerEnabled(): boolean {
  // Default true (the contract). Only an explicit 'false' disables it.
  return (process.env.PRISM_WORKER_ENABLED ?? 'true').toLowerCase() !== 'false';
}
function maxConcurrentExtract(): number {
  const n = Number(process.env.PRISM_MAX_CONCURRENT_EXTRACT);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4;
}
type RawRetention = 'keep' | 'purge_after_reconcile';
function rawRetention(): RawRetention {
  return process.env.PRISM_RAW_RETENTION === 'keep' ? 'keep' : 'purge_after_reconcile';
}

// Tick cadence + transient backoff (kept small; the loop is the heartbeat).
const TICK_INTERVAL_MS = 1_000;
const MAX_JOBS_PER_TICK = 25;

// Stages whose work the worker performs (interactive + terminal stages are excluded).
// `connect`/`publish` advance with light bookkeeping; the rest do real work.
const WORKER_STAGES: Set<PrismStage> = new Set([
  'connect', 'discover', 'extract', 'profile', 'map',
  'transform', 'dryrun', 'load', 'reconcile', 'enrich', 'publish',
]);

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT concurrency semaphore (the one IO/rate-bound stage; §10).
// ─────────────────────────────────────────────────────────────────────────────
let extractInFlight = 0;
function tryAcquireExtractSlot(): boolean {
  if (extractInFlight >= maxConcurrentExtract()) return false;
  extractInFlight++;
  return true;
}
function releaseExtractSlot(): void {
  if (extractInFlight > 0) extractInFlight--;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loop lifecycle
// ─────────────────────────────────────────────────────────────────────────────
let started = false;
let ticking = false;
let timer: NodeJS.Timeout | null = null;
// Per-tick set of jobs currently being processed (prevents a long stage from being
// re-claimed by the same instance before it advances).
const inFlight = new Set<string>();

/**
 * Start the resilient worker loop. Idempotent — safe to call from server boot AND
 * lazily from `enqueueJob`; the second call is a no-op. Disabled when
 * PRISM_WORKER_ENABLED=false (the loop never arms).
 */
export function startPrismWorker(): void {
  if (started) return;
  if (!workerEnabled()) {
    logger.info('prism:worker disabled (PRISM_WORKER_ENABLED=false)');
    return;
  }
  started = true;
  logger.info(
    { maxConcurrentExtract: maxConcurrentExtract(), rawRetention: rawRetention() },
    'prism:worker started',
  );
  // setInterval, not a tight while-loop: each tick is bounded and self-reschedules,
  // so a slow stage can't starve the event loop. `.unref()` so the loop never holds
  // the process open on its own (mirrors the scheduler heartbeat pattern).
  timer = setInterval(() => { void tick(); }, TICK_INTERVAL_MS);
  timer.unref?.();
  // Kick an immediate tick so a job created milliseconds before is picked up fast.
  void tick();
}

/** Stop the loop (tests / graceful shutdown). */
export function stopPrismWorker(): void {
  if (timer) { clearInterval(timer); timer = null; }
  started = false;
}

/** True if the loop is armed (used by enqueueJob's lazy auto-start guard). */
export function isPrismWorkerRunning(): boolean {
  return started;
}

// ─────────────────────────────────────────────────────────────────────────────
// One tick: claim a fair batch of runnable jobs and process them.
// ─────────────────────────────────────────────────────────────────────────────
async function tick(): Promise<void> {
  if (ticking) return; // never overlap ticks on one instance
  ticking = true;
  try {
    const jobs = await claimRunnableJobs(MAX_JOBS_PER_TICK);
    if (jobs.length === 0) return;
    // Process claimed jobs concurrently; each is independently bounded. EXTRACT is the
    // only stage gated by the semaphore (inside processJob).
    await Promise.all(jobs.map((j) => guardedProcessJob(j)));
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'prism:worker tick failed');
  } finally {
    ticking = false;
  }
}

/**
 * Atomically claim runnable jobs with `FOR UPDATE SKIP LOCKED`, flipping `queued`
 * (kick-off / retryable backoff) to `running`. Already-`running` jobs are re-claimed
 * so a crashed worker resumes them (the row IS the durable state). Per-org de-dupe in
 * JS gives best-effort fairness: at most one job per org per tick.
 *
 * Horizontal scale & exactly-once: `FOR UPDATE SKIP LOCKED` guarantees two workers never
 * grab the same row WITHIN this short claim transaction, so the queued→running flip is
 * race-free. We COMMIT immediately (we do NOT hold the row lock while a stage runs), so
 * a `running` job could in principle be re-claimed by a second instance mid-stage. That
 * is SAFE, not corrupting, because every stage is idempotent / exactly-once-by-effect:
 * EXTRACT upserts on the raw natural key, LOAD upserts under the per-key advisory lock +
 * source-time monotonicity guard (load.ts), TRANSFORM/DRY-RUN are pure functions of
 * (raw + mapping) stashed on the cursor, and advance/park are idempotent UPDATEs. Worst
 * case is duplicated WORK, never duplicated DATA.
 * TODO(verify): for zero wasted work at high replica counts, add a lease column
 * (worker_id + claimed_at heartbeat) to prism_jobs and claim on `claimed_at < now()-ttl`
 * — out of scope here (needs a migration; touch-scope is worker.ts + engine.ts only).
 */
async function claimRunnableJobs(limit: number): Promise<PrismJob[]> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    // Order by org then oldest-first; the JS loop below keeps at most one job per org
    // per tick (fairness) so one big migration can't monopolize the batch (§10).
    const { rows } = await client.query<PrismJob>(
      `SELECT * FROM prism_jobs
        WHERE deleted_at IS NULL
          AND status IN ('queued', 'running')
        ORDER BY org_id, updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [Math.max(1, limit) * 4], // over-fetch; we de-dupe per org + cap below in JS
    );
    // Per-org de-dupe + skip rows already in flight on THIS instance, then cap.
    const claimed: PrismJob[] = [];
    const orgSeen = new Set<string>();
    for (const job of rows) {
      if (claimed.length >= limit) break;
      if (inFlight.has(job.id)) continue;
      if (orgSeen.has(job.org_id)) continue;
      orgSeen.add(job.org_id);
      claimed.push(job);
    }
    // Flip queued → running inside the same txn so the claim is durable (a crash after
    // COMMIT leaves the job `running`, which the next tick resumes idempotently).
    const queuedIds = claimed.filter((j) => j.status === 'queued').map((j) => j.id);
    if (queuedIds.length) {
      await client.query(
        `UPDATE prism_jobs SET status = 'running', updated_at = now()
          WHERE id = ANY($1::uuid[])`,
        [queuedIds],
      );
    }
    await client.query('COMMIT');
    // Mark in-flight AFTER commit (so they're released even if processing throws).
    for (const j of claimed) inFlight.add(j.id);
    return claimed.map((j) => (j.status === 'queued' ? { ...j, status: 'running' } : j));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err: (err as Error).message }, 'prism:worker claim failed');
    return [];
  } finally {
    client.release();
  }
}

async function guardedProcessJob(job: PrismJob): Promise<void> {
  try {
    await processJob(job);
  } catch (err) {
    // Last-resort guard: a stage handler should classify + fail the job itself, but if
    // it throws raw, treat it as transient (retryable) so the job is never wedged.
    logger.error(
      { orgId: job.org_id, jobId: job.id, stage: job.stage, err: (err as Error).message },
      'prism:worker processJob uncaught — backing off (retryable)',
    );
    await engine.failJob(job.id, job.stage, (err as Error).message, true).catch(() => {});
  } finally {
    inFlight.delete(job.id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Process ONE running job: run the current stage's work, then advance the spine.
// ─────────────────────────────────────────────────────────────────────────────
async function processJob(job: PrismJob): Promise<void> {
  // Re-read the freshest row (status may have changed between claim and here, e.g. a
  // user pause). Only proceed if it is still `running`.
  const fresh = await engine.getJob(job.org_id, job.id);
  if (!fresh || fresh.status !== 'running') return;
  if (!WORKER_STAGES.has(fresh.stage)) return;

  const stage = fresh.stage;
  const stopTimer = startStageTimer(stage, fresh);

  try {
    const outcome = await runStageWork(fresh);
    stopTimer();

    if (outcome === 'parked' || outcome === 'retry') {
      // 'parked'  → stage set the job awaiting_input (map/dryrun). STOP until resumed.
      // 'retry'   → stage yielded (e.g. EXTRACT at capacity); status stays `running`
      //             so a later tick re-claims and resumes idempotently. STOP for now.
      return;
    }
    if (outcome === 'terminal') {
      // PUBLISH resolved the job to complete/partial inside engine.advance. STOP.
      return;
    }
    // The stage's work succeeded → move to the NEXT stage, keeping status `running` so
    // the next tick re-claims this job and runs the next stage's work. We deliberately
    // do NOT call engine.advance here: advance() parks interactive stages (map/dryrun)
    // immediately, which would skip running their PROPOSAL work. Instead the interactive
    // stage handlers (stageMap / stageDryRun) do their proposal/diff work and THEN park
    // themselves — so the human always sees a real proposal, never an empty pause.
    await advanceToNextRunning(fresh);
  } catch (err) {
    stopTimer();
    throw err; // guardedProcessJob classifies + records
  }
}

type StageOutcome = 'advance' | 'parked' | 'retry' | 'terminal';

/**
 * Dispatch the current stage to its real work. Returns:
 *   'advance'  → work done, caller advances the spine.
 *   'parked'   → job is awaiting_input (map / dryrun); caller stops.
 *   'retry'    → stage yielded without finishing (EXTRACT at capacity); status stays
 *                `running` so a later tick resumes it; caller stops.
 *   'terminal' → job resolved (publish → complete/partial); caller stops.
 */
async function runStageWork(job: PrismJob): Promise<StageOutcome> {
  switch (job.stage) {
    case 'connect':   return stageConnect(job);
    case 'discover':  return stageDiscover(job);
    case 'extract':   return stageExtract(job);
    case 'profile':   return stageProfile(job);
    case 'map':       return stageMap(job);
    case 'transform': return stageTransform(job);
    case 'dryrun':    return stageDryRun(job);
    case 'load':      return stageLoad(job);
    case 'reconcile': return stageReconcile(job);
    case 'enrich':    return stageEnrich(job);
    case 'publish':   return stagePublish(job);
    default:          return 'advance';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage helpers — connection / cursor accessors
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectionRow {
  id: string;
  org_id: string;
  platform: string;
  credential_ref: string | null;
  config: Record<string, unknown>;
}

async function loadConnection(orgId: string, connectionId: string): Promise<ConnectionRow> {
  const { rows } = await query<ConnectionRow>(
    `SELECT id, org_id, platform, credential_ref, config
       FROM prism_connections
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [connectionId, orgId],
  );
  const conn = rows[0];
  if (!conn) throw nonRetryable(`connection ${connectionId} not found`);
  return conn;
}

/** Merge a patch into prism_jobs.cursor (the resumable scratch space). */
async function patchCursor(orgId: string, jobId: string, patch: Record<string, unknown>): Promise<void> {
  await query(
    `UPDATE prism_jobs
        SET cursor = COALESCE(cursor, '{}'::jsonb) || $3::jsonb, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [jobId, orgId, JSON.stringify(patch)],
  );
}

function cursorObj(job: PrismJob): Record<string, unknown> {
  return (job.cursor ?? {}) as Record<string, unknown>;
}

/** The job's selected resources: from the cursor (set at create) — one ResourceRef per file. */
function jobResources(job: PrismJob): ResourceRef[] {
  const c = cursorObj(job);
  const r = c.resources;
  return Array.isArray(r) ? (r as ResourceRef[]) : [];
}

/** Connection platform keys that all resolve to the format-agnostic file connector. */
const FILE_PLATFORM_ALIASES = new Set(['file', 'file_auto', 'csv', 'spss', 'json', 'qsf']);

/**
 * The L1 type-map key to resolve a job's mapping against. The connection platform for the
 * global file importer is `file_auto` (the connector is aliased under file/csv/spss/json/qsf),
 * NONE of which has a deterministic type-map — resolving against them sends every field to
 * preserve-as-embedded. File imports profile to the INFERRED-type vocabulary (parsing/profile.ts),
 * which only the `csv` type-map is keyed on, so route every file platform to `csv`. The detected
 * source platform (resource.extra.platform, e.g. qualtrics) drives the parse dialect, NOT the
 * inferred-type → target mapping, so `csv` is correct for every file format. API connectors keep
 * their own platform (qualtrics/typeform/...) which have native-question-type maps.
 */
function mappingPlatformFor(platform: string, _job: PrismJob): string {
  return FILE_PLATFORM_ALIASES.has(platform) ? 'csv' : platform;
}

/** Build the connector-facing Connection from a connection row. */
function toConnection(conn: ConnectionRow) {
  return {
    id: conn.id,
    orgId: conn.org_id,
    credentialRef: conn.credential_ref,
    config: conn.config ?? {},
  };
}

// Typed error markers so failJob classifies correctly.
function nonRetryable(msg: string): Error & { retryable: false } {
  return Object.assign(new Error(msg), { retryable: false as const });
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1 — CONNECT (file_upload: connector.authenticate records the connection; no
// secret). For a file the connector echoes the fileRef as the opaque ref; for API
// connectors the secret is already stored by the route at connection-create time.
// ─────────────────────────────────────────────────────────────────────────────
async function stageConnect(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  // The route already authenticated + stored the secret on connection-create; CONNECT
  // at job time is a checkpoint that the connection is usable. Validate the connector
  // is registered (throws non-retryably for display-only/unknown platforms).
  getConnector(conn.platform);
  logger.info({ orgId: job.org_id, jobId: job.id, platform: conn.platform }, 'prism:worker connect ok');
  return 'advance';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 — DISCOVER. File: yield one resource per uploaded file from the connection
// config OR (when files arrive only on the job) from the job's resources. API: delegate
// to connector.discover (export-poll/paginate connectors enumerate at source).
// Persists the selected resources onto the cursor for EXTRACT to iterate.
// Interactive pause AFTER discover (select) only when the job did not pre-select
// resources at create time; the file happy-path pre-selects, so it flows through.
// ─────────────────────────────────────────────────────────────────────────────
async function stageDiscover(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const connector = getConnector(conn.platform);

  // Already have resources chosen at create time → no need to re-discover; flow on.
  let resources = jobResources(job);

  if (resources.length === 0) {
    // No pre-selected resources → enumerate at source (file: from config.files; API:
    // export/paginate discovery). Generic: works for both file + API connectors.
    const discovered: ResourceRef[] = [];
    try {
      for await (const r of connector.discover(toConnection(conn))) {
        discovered.push(r.resourceRef);
      }
    } catch (err) {
      // Discovery is network for API connectors → transient by default.
      throw err;
    }
    resources = discovered;
    await patchCursor(job.org_id, job.id, { resources });
  }

  await engine.bumpCounts(job.org_id, job.id, { discovered: resources.length });
  prismRecordsTotal.inc({ stage: 'discover', source: conn.platform, org: job.org_id }, resources.length);

  if (resources.length === 0) {
    // Nothing to ingest — not an error, but there is no data: end the job partial-free
    // complete by short-circuiting. The conservation gate at reconcile handles 0 rows.
    logger.warn({ orgId: job.org_id, jobId: job.id }, 'prism:worker discover found no resources');
  }

  // Interactive "select" pause AFTER discover: only when the job had to enumerate (no
  // pre-selection). The file happy-path pre-selects on create, so it does NOT pause.
  const preSelected = (cursorObj(job).resources as unknown[] | undefined)?.length ?? 0;
  const enumeratedNew = preSelected === 0 && resources.length > 0
    && job.kind !== 'sync'; // sync jobs auto-proceed
  if (enumeratedNew) {
    // Park for the user to confirm the resource selection (architecture §3 "after
    // discover (select)"). The API's resume re-enters at extract.
    await parkAwaitingInput(job, 'discover');
    return 'parked';
  }
  return 'advance';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 — EXTRACT. For each resource: connector.extract → append RawRecords to the
// lossless landing zone (idempotent on the raw natural key). The connector leaves
// job_id blank; the worker stamps the active job id. Resumable: the per-resource
// cursor is checkpointed; already-extracted resources are skipped on resume.
//
// Gated by PRISM_MAX_CONCURRENT_EXTRACT (the IO/rate-bound stage). When raw retention
// is purge_after_reconcile, the uploaded file is deleted after its records are appended
// (file connectors only; reading is one-shot here). See §3 of the prompt.
// ─────────────────────────────────────────────────────────────────────────────
async function stageExtract(job: PrismJob): Promise<StageOutcome> {
  if (!tryAcquireExtractSlot()) {
    // At capacity → leave the job `running`; a later tick re-claims and resumes. No
    // state change (idempotent). This yields EXTRACT slots to in-flight tenants (§10).
    return 'retry';
  }
  try {
    const conn = await loadConnection(job.org_id, job.connection_id);
    const connector = getConnector(conn.platform);
    const connection = toConnection(conn);
    const resources = jobResources(job);

    const cursor = cursorObj(job);
    const doneRefs = new Set<string>(Array.isArray(cursor.extractedRefs) ? (cursor.extractedRefs as string[]) : []);

    let extractedThisRun = 0;
    for (const resource of resources) {
      if (doneRefs.has(resource.id)) continue; // resume: skip already-extracted files

      let appendedForRef = 0;
      try {
        for await (const { records } of connector.extract(connection, resource)) {
          if (!records.length) continue;
          // Stamp the active job id (connector leaves it blank) + org/connection.
          const stamped: RawRecord[] = records.map((r) => ({
            ...r,
            org_id: job.org_id,
            job_id: job.id,
            connection_id: conn.id,
          }));
          const res = await appendRawRecords(stamped);
          appendedForRef += res.inserted + res.updated;
          extractedThisRun += res.inserted + res.updated;
        }
      } catch (err) {
        // A parse error on a file is non-retryable (the bytes won't change); a network
        // error on an API connector is retryable. The connector's own withRetry already
        // exhausted transient API retries, so classify the surviving throw here: transient
        // → rethrow (retryable backoff); else mark non-retryable so the job fails cleanly.
        if (isLikelyTransient(err)) throw err;
        throw nonRetryable((err as Error).message);
      }

      doneRefs.add(resource.id);
      await patchCursor(job.org_id, job.id, { extractedRefs: Array.from(doneRefs) });
      await engine.bumpCounts(job.org_id, job.id, { extracted: appendedForRef });
      prismRecordsTotal.inc({ stage: 'extract', source: conn.platform, org: job.org_id }, appendedForRef);

      // Data-minimization: purge the uploaded blob right after its records land in the
      // lossless raw log (file connectors only; the raw log IS the durable source now).
      // PRISM_RAW_RETENTION=purge_after_reconcile → purge here (records are safe in raw).
      if (rawRetention() === 'purge_after_reconcile' && isFileRef(resource.id)) {
        await deleteUpload(resource.id, job.org_id).catch((err: unknown) => {
          logger.warn(
            { orgId: job.org_id, jobId: job.id, fileRef: resource.id, err: (err as Error).message },
            'prism:worker upload purge failed (best-effort)',
          );
        });
      }
    }

    logger.info(
      { orgId: job.org_id, jobId: job.id, extractedThisRun, resources: resources.length },
      'prism:worker extract complete',
    );
    return 'advance';
  } finally {
    releaseExtractSlot();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4 — PROFILE. Build a SourceSchemaProfile from the job's raw records (the
// connector's profile() hints), persist the shape hash on the cursor for MAP.
// ─────────────────────────────────────────────────────────────────────────────
async function stageProfile(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const connector = getConnector(conn.platform);

  // Sample non-poison raw records for this job (bounded — profiling needs a sample, not
  // the whole corpus; the connector's profile() samples per-column internally too).
  const raw = await loadRawSample(job.org_id, job.id, 2000);
  const profile: SourceSchemaProfile = connector.profile(raw);
  const shapeHash = profile.shapeHash || schemaShapeHash(profile);

  await patchCursor(job.org_id, job.id, {
    schema_shape_hash: shapeHash,
    profile_fields: profile.fields.length,
  });
  logger.info(
    { orgId: job.org_id, jobId: job.id, fields: profile.fields.length, shapeHash },
    'prism:worker profile complete',
  );
  return 'advance';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 5 — MAP (interactive). Run the deterministic-first resolver to PROPOSE
// mappings, persist the suggestions, and PARK awaiting_input. CrystalOS proposes; the
// human confirms via PUT /jobs/:id/mapping (engine.confirmMapping → resume → transform).
//
// L2 auto-apply short-circuit: when org mapping-memory fully covers the shape, the
// resolver returns fromMemory=true — we still park for a quick confirm (the trust
// surface), matching the architecture's "after profile (map)" interactive pause.
// ─────────────────────────────────────────────────────────────────────────────
async function stageMap(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const connector = getConnector(conn.platform);

  const raw = await loadRawSample(job.org_id, job.id, 2000);
  const profile: SourceSchemaProfile = connector.profile(raw);

  // Resolve the L1 type-map key. The connection platform for the global file importer is
  // `file_auto` (and the connector is aliased under file/csv/spss/json/qsf) — none of which
  // has a type-map, so resolving against it would send EVERY field to preserve-as-embedded.
  // File imports profile to the INFERRED-type vocabulary (parsing/profile.ts), which the
  // `csv` type-map is keyed on, so route file platforms there. The detected source platform
  // (resource.extra.platform, e.g. qualtrics) only affects the parse dialect, not the
  // inferred-type → target mapping, so `csv` is correct for every file format.
  const mappingPlatform = mappingPlatformFor(conn.platform, job);

  // PROPOSE (deterministic L1 + memory L2 + LLM-residual L3). Never writes canonical data.
  const result = await resolveMapping(job.org_id, job.connection_id, mappingPlatform, profile);

  // Persist the proposed mapping as the latest version so GET /jobs/:id/mapping returns
  // it. saveConfirmedMapping is the versioned writer; the user's PUT later re-saves the
  // confirmed (possibly edited) set, advancing past MAP.
  await saveConfirmedMapping(job.org_id, job.connection_id, result.shapeHash, result.mappings);

  prismRecordsTotal.inc({ stage: 'map', source: conn.platform, org: job.org_id }, result.mappings.length);
  logger.info(
    { orgId: job.org_id, jobId: job.id, mappings: result.mappings.length, fromMemory: result.fromMemory, drift: result.driftFields.length },
    'prism:worker map proposed — awaiting confirm',
  );

  // engine.runStage already parks interactive stages, but the worker calls stage work
  // directly, so we park here explicitly. STOP — the API resume re-enters at transform.
  await parkAwaitingInput(job, 'map');
  return 'parked';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 6 — TRANSFORM. Apply the confirmed mapping to raw records → canonical staging
// rows (held on the cursor for DRY-RUN + LOAD). Pure function of (raw + mapping); never
// touches canonical tables. Poison records are skipped (transform excludes them).
// ─────────────────────────────────────────────────────────────────────────────
async function stageTransform(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const mapping = await loadConfirmedMapping(job.org_id, job.connection_id);
  if (!mapping) throw nonRetryable('transform: no confirmed mapping for connection');

  const raw = await loadAllRaw(job.org_id, job.id); // non-poison rows only
  const importBatchId = `batch_${job.id}_${Date.now()}`;
  const { rows, unmapped } = transform(raw, mapping, {
    importBatchId,
    mappingVersion: mapping.mapping_version,
  });

  // Stash the staged rows + unmapped notes + batch id on the cursor for DRY-RUN/LOAD.
  // (Staging is ephemeral scratch; the durable source is always raw + mapping_version,
  // so a re-run reproduces it deterministically — replay-safe.)
  await patchCursor(job.org_id, job.id, {
    import_batch_id: importBatchId,
    staged_rows: rows,
    unmapped,
  });
  await engine.bumpCounts(job.org_id, job.id, { transformed: rows.length });
  prismRecordsTotal.inc({ stage: 'transform', source: conn.platform, org: job.org_id }, rows.length);
  logger.info({ orgId: job.org_id, jobId: job.id, staged: rows.length, unmapped: unmapped.length }, 'prism:worker transform complete');
  return 'advance';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 7 — DRY-RUN (interactive). Compute the diff vs canonical `responses`, persist
// the report, PARK awaiting_input. The user approves via POST /jobs/:id/approve
// (engine.approveAndLoad → resume → load).
// ─────────────────────────────────────────────────────────────────────────────
async function stageDryRun(job: PrismJob): Promise<StageOutcome> {
  const staged = stagedRowsFromCursor(job);
  const unmapped = unmappedFromCursor(job);

  const report = await dryRun({ orgId: job.org_id, rows: staged, unmapped });

  // Persist for GET /jobs/:id/dryrun. NB: the migration column is `created_at`
  // (default now()); the report blob carries its own `generated_at`. We insert only the
  // columns that exist in the migration (org_id, job_id, report).
  // TODO(verify): engine.getDryRunReport selects `generated_at` — see engine.ts note;
  // the report blob carries generated_at so the API can read it from the JSON.
  await query(
    `INSERT INTO prism_dryrun_report (org_id, job_id, report)
     VALUES ($1, $2, $3::jsonb)`,
    [job.org_id, job.id, JSON.stringify({ ...report, generated_at: new Date().toISOString() })],
  );

  logger.info({ orgId: job.org_id, jobId: job.id, summary: report.summary }, 'prism:worker dryrun computed — awaiting approval');
  await parkAwaitingInput(job, 'dryrun');
  return 'parked';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 8 — LOAD. Natural-key upsert of the staged rows into responses/signals
// (exactly-once: advisory lock + source-time monotonicity + hash no-op in load.ts).
// surveyId comes from the connection/job config when present (file imports target a
// survey); signals pass null.
// ─────────────────────────────────────────────────────────────────────────────
async function stageLoad(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const staged = stagedRowsFromCursor(job);
  const surveyId = targetSurveyId(job, conn);

  const result = await load(staged as StagedRow[], surveyId);
  await engine.bumpCounts(job.org_id, job.id, {
    loaded: result.loaded,
    skipped: result.skipped,
    failed: result.failed,
  });
  prismRecordsTotal.inc({ stage: 'load', source: conn.platform, org: job.org_id }, result.loaded);
  logger.info({ orgId: job.org_id, jobId: job.id, ...result, surveyId }, 'prism:worker load complete');
  return 'advance';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 9 — RECONCILE. Conservation gate (Tier-1 fidelity). Compares loaded counts +
// checksums vs the source's discovered count. Writes prism_recon_report. A mismatch is
// recorded + metered; the job still proceeds (publish resolves complete vs partial).
// ─────────────────────────────────────────────────────────────────────────────
async function stageReconcile(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const counts = (await engine.getJob(job.org_id, job.id))?.counts ?? {};
  // The "source count" for conservation is the number of RECORDS observed at source =
  // the records we appended to the lossless raw log (reconcile derives loaded/poison
  // from prism_raw_records, so this balances exactly for a file import). `discovered`
  // is a RESOURCE count (e.g. # of files), not a record count — do NOT use it here.
  const sourceCount = counts.extracted ?? 0;

  const report = await reconcile({
    orgId: job.org_id,
    jobId: job.id,
    connectionId: job.connection_id,
    sourceCount,
    // Rows the user resolved as skip in the dry-run count toward conservation.
    dryRunSkipped: counts.skipped ?? 0,
  });

  if (!report.tier1_pass) {
    prismReconMismatchTotal.inc({ source: conn.platform, org: job.org_id });
    logger.warn({ orgId: job.org_id, jobId: job.id, report: report.counts }, 'prism:worker reconcile mismatch');
  } else {
    logger.info({ orgId: job.org_id, jobId: job.id }, 'prism:worker reconcile tier1 pass');
  }
  return 'advance';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 10 — ENRICH (best-effort, DEFERRABLE). Trigger CrystalOS re-enrichment +
// insight pipeline on the imported survey via agentsClient (fire-and-forget). A
// failure here NEVER fails the import — it logs and proceeds to publish (architecture
// §8 "Deferrable: import now, enrich overnight").
// ─────────────────────────────────────────────────────────────────────────────
async function stageEnrich(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const surveyId = targetSurveyId(job, conn);
  if (!surveyId) {
    logger.info({ orgId: job.org_id, jobId: job.id }, 'prism:worker enrich skipped — no target survey');
    return 'advance';
  }
  try {
    // Best-effort kick-off only (do not await the full pipeline). The backend remains
    // the single credit-ledger writer; CrystalOS proposes/enriches, never mutates.
    await agentsClient.triggerInsightGeneration({
      surveyId,
      orgId: job.org_id,
      trigger: 'prism_import',
    });
    logger.info({ orgId: job.org_id, jobId: job.id, surveyId }, 'prism:worker enrich triggered (best-effort)');
  } catch (err) {
    // Deferrable: swallow — enrichment can run later; the import is already durable.
    logger.warn(
      { orgId: job.org_id, jobId: job.id, surveyId, err: (err as Error).message },
      'prism:worker enrich trigger failed (deferred — import already durable)',
    );
  }
  return 'advance';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 11 — PUBLISH (terminal). Mark the survey active; DataBus invalidation is the
// API's job (root CLAUDE.md). engine.advance on stage 'publish' resolves the final
// status (complete / partial from the conservation counts) — so we call advance and
// report 'terminal'.
// ─────────────────────────────────────────────────────────────────────────────
async function stagePublish(job: PrismJob): Promise<StageOutcome> {
  const conn = await loadConnection(job.org_id, job.connection_id);
  const surveyId = targetSurveyId(job, conn);
  if (surveyId) {
    await query(
      `UPDATE surveys SET status = 'active', updated_at = now()
        WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL AND status = 'draft'`,
      [surveyId, job.org_id],
    ).catch((err: unknown) => {
      logger.warn({ orgId: job.org_id, jobId: job.id, surveyId, err: (err as Error).message }, 'prism:worker publish survey-activate failed (best-effort)');
    });
  }
  prismRecordsTotal.inc({ stage: 'publish', source: conn.platform, org: job.org_id });
  // advance() on PUBLISH resolves complete/partial from counts (poison/failed).
  await engine.advance(job.id);
  logger.info({ orgId: job.org_id, jobId: job.id }, 'prism:worker publish — job terminal');
  return 'terminal';
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw / mapping / cursor accessors
// ─────────────────────────────────────────────────────────────────────────────

async function loadRawSample(orgId: string, jobId: string, limit: number): Promise<RawRecord[]> {
  const { rows } = await query<RawRecordRow>(
    `SELECT org_id, job_id, connection_id, source_platform, record_type,
            source_record_id, payload, payload_hash, ingress, poison, source_observed_at
       FROM prism_raw_records
      WHERE org_id = $1 AND job_id = $2 AND NOT poison
      ORDER BY extracted_at ASC
      LIMIT $3`,
    [orgId, jobId, limit],
  );
  return rows.map(toRawRecord);
}

async function loadAllRaw(orgId: string, jobId: string): Promise<RawRecord[]> {
  const { rows } = await query<RawRecordRow>(
    `SELECT org_id, job_id, connection_id, source_platform, record_type,
            source_record_id, payload, payload_hash, ingress, poison, source_observed_at
       FROM prism_raw_records
      WHERE org_id = $1 AND job_id = $2 AND NOT poison
      ORDER BY extracted_at ASC`,
    [orgId, jobId],
  );
  return rows.map(toRawRecord);
}

interface RawRecordRow {
  org_id: string;
  job_id: string;
  connection_id: string;
  source_platform: string;
  record_type: string;
  source_record_id: string;
  payload: unknown;
  payload_hash: string;
  ingress: string;
  poison: boolean;
  source_observed_at: string | null;
}

function toRawRecord(r: RawRecordRow): RawRecord {
  return {
    org_id: r.org_id,
    job_id: r.job_id,
    connection_id: r.connection_id,
    source_platform: r.source_platform,
    record_type: r.record_type as RecordType,
    source_record_id: r.source_record_id,
    payload: r.payload,
    payload_hash: r.payload_hash,
    ingress: r.ingress as RawRecord['ingress'],
    poison: r.poison,
    source_observed_at: r.source_observed_at,
  };
}

async function loadConfirmedMapping(orgId: string, connectionId: string): Promise<PrismMapping | null> {
  const { rows } = await query<PrismMapping>(
    `SELECT id, org_id, connection_id, schema_shape_hash, mapping_version, mappings, created_at
       FROM prism_mappings
      WHERE org_id = $1 AND connection_id = $2
      ORDER BY mapping_version DESC LIMIT 1`,
    [orgId, connectionId],
  );
  return rows[0] ?? null;
}

function stagedRowsFromCursor(job: PrismJob): StagedRow[] {
  const c = cursorObj(job);
  return Array.isArray(c.staged_rows) ? (c.staged_rows as StagedRow[]) : [];
}

function unmappedFromCursor(job: PrismJob): { source_field: string; action: string }[] {
  const c = cursorObj(job);
  return Array.isArray(c.unmapped) ? (c.unmapped as { source_field: string; action: string }[]) : [];
}

/**
 * Target survey id for LOAD/ENRICH/PUBLISH. File imports of responses target a survey;
 * the id lives on the connection config or the job options/cursor. Null for signal-only
 * imports (LOAD passes null and stores the source ref in metadata).
 */
function targetSurveyId(job: PrismJob, conn: ConnectionRow): string | null {
  const c = cursorObj(job);
  const opts = (c.options ?? {}) as Record<string, unknown>;
  const fromOpts = typeof opts.survey_id === 'string' ? opts.survey_id : undefined;
  const fromCursor = typeof c.survey_id === 'string' ? (c.survey_id as string) : undefined;
  const cfg = conn.config ?? {};
  const fromConn = typeof cfg.survey_id === 'string' ? (cfg.survey_id as string) : undefined;
  return fromOpts ?? fromCursor ?? fromConn ?? null;
}

function isFileRef(id: string): boolean {
  return typeof id === 'string' && id.startsWith('prism-upload://');
}

function isLikelyTransient(err: unknown): boolean {
  const e = err as { status?: number; code?: string };
  if (typeof e?.status === 'number') return e.status === 429 || (e.status >= 500 && e.status <= 599);
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(e?.code ?? '');
}

/**
 * Move the job to the NEXT stage in the spine and keep it `running` so the worker
 * picks it up and runs that stage's work on the next tick. This is the worker's
 * advance (distinct from engine.advance, which parks interactive stages on entry).
 * The interactive stages (map/dryrun) run their proposal work then park themselves.
 */
async function advanceToNextRunning(job: PrismJob): Promise<void> {
  const order = engine.STAGE_ORDER;
  const idx = order.indexOf(job.stage);
  if (idx === -1 || idx >= order.length - 1) return; // unknown or terminal — nothing to do
  const next = order[idx + 1];
  await query(
    `UPDATE prism_jobs
        SET stage = $3, status = 'running', error = NULL, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [job.id, job.org_id, next],
  );
}

/** Park a job awaiting_input on a stage (the worker's direct equivalent of engine's interactive park). */
async function parkAwaitingInput(job: PrismJob, stage: PrismStage): Promise<void> {
  await query(
    `UPDATE prism_jobs
        SET stage = $3, status = 'awaiting_input', error = NULL, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [job.id, job.org_id, stage],
  );
}

// ── Metrics timer ───────────────────────────────────────────────────────────
function startStageTimer(stage: PrismStage, job: PrismJob): () => void {
  const end = prismStageDurationSeconds.startTimer({ stage, source: job.connection_id });
  return () => { try { end(); } catch { /* metric best-effort */ } };
}

export default startPrismWorker;
