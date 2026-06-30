/**
 * Prism engine — the pipeline orchestrator (the spine).
 *
 * Every import is a pipeline of discrete, independently-retryable, checkpointed
 * stages. A stage reads from Postgres, writes to Postgres, and advances the
 * `prism_jobs` state machine (architecture-ingestion.md §3):
 *
 *   CONNECT → DISCOVER → EXTRACT → PROFILE → MAP → TRANSFORM → DRY-RUN
 *           → LOAD → RECONCILE → ENRICH → PUBLISH
 *
 * Background stages (3–10) run on Redis-backed per-connection queues; interactive
 * stages (CONNECT, MAP confirm, DRY-RUN approve) park the job `awaiting_input`.
 * Redis holds only ephemeral queue work — durable truth is the `prism_jobs` row,
 * so a Redis loss re-derives running jobs from Postgres (in-memory fallback when
 * REDIS_URL is unset, single-instance only).
 *
 * Boundary: this engine NEVER calls CrystalOS to write canonical data. CrystalOS
 * proposes (mapping/parity via the resolver); the backend loads; the frontend
 * confirms (root CLAUDE.md "How the three layers collaborate").
 *
 * Exposes `runStage(jobId, stage)` and `advance(jobId)`.
 */
import type {
  PrismStage,
  PrismJob,
  PrismJobStatus,
  PrismCounts,
  CreateConnectionRequest,
  CreateJobRequest,
  ApproveRequest,
  DiscoveredResource,
  FieldMapping,
  DryRunReport,
  ReconReport,
  PrismSyncState,
  RawRecord,
  RecordType,
  PrismMode,
} from '../../types/prism';
import { query } from '../db';
import { getRedisClient } from '../redis';
import logger from '../logger';
import { evaluate as evaluateBackpressure } from './backpressure';
import { saveConfirmedMapping, schemaShapeHash } from './mapping/resolver';
import { appendRawRecords } from './extract';
import { getConnector } from './connectors';
import { secretManager } from './secretManager';
import { ensureImportSurvey, type ImportConnectionInfo } from './survey';
import {
  ensureSyncState,
  negotiateCaptureMode,
  setPaused as setSyncPaused,
  ensureLiveSyncJob,
  triggerIngest,
  trimAugmentBuffer,
} from './sync/engine';

// Stage order (the spine). `advance` walks this list.
export const STAGE_ORDER: PrismStage[] = [
  'connect', 'discover', 'extract', 'profile', 'map',
  'transform', 'dryrun', 'load', 'reconcile', 'enrich', 'publish',
];

// Stages that park the job for human input rather than auto-advancing.
const INTERACTIVE_STAGES: Set<PrismStage> = new Set(['map', 'dryrun']);

const QUEUE_NS = 'prism:q';

/**
 * Lazily ensure the background worker loop is running. Called when a job is created so
 * a job enqueued via the API begins processing (queued → running) without a separate
 * boot step. Uses a runtime require (not a static import) to break the import cycle
 * (worker.ts imports engine.ts). Idempotent: startPrismWorker() is a no-op if already
 * armed and respects PRISM_WORKER_ENABLED. Best-effort — never throws into the caller.
 *
 * For production the worker SHOULD also be started explicitly at server boot (see the
 * TODO(verify) in worker.ts about wiring startPrismWorker() into index.ts); this lazy
 * kick guarantees progress even when that boot wiring is absent.
 */
function kickWorker(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const worker = require('./worker') as { startPrismWorker?: () => void };
    worker.startPrismWorker?.();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'prism:engine kickWorker failed (job will start on next boot)');
  }
}

// ── In-memory queue fallback (no Redis) ────────────────────────────────────────
const memQueues = new Map<string, { jobId: string; stage: PrismStage }[]>();

// ─────────────────────────────────────────────────────────────────────────────
// Job state machine helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function getJob(orgId: string, jobId: string): Promise<PrismJob | null> {
  const { rows } = await query<PrismJob>(
    `SELECT id, org_id, connection_id, kind, stage, status, cursor, counts, error,
            triggered_by, created_by, created_at, updated_at, deleted_at
       FROM prism_jobs
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [jobId, orgId],
  );
  return rows[0] ?? null;
}

/** Look up org_id for a job id (engine entry points take only jobId). */
async function orgForJob(jobId: string): Promise<string | null> {
  const { rows } = await query<{ org_id: string }>(
    `SELECT org_id FROM prism_jobs WHERE id = $1 AND deleted_at IS NULL`,
    [jobId],
  );
  return rows[0]?.org_id ?? null;
}

async function setJobState(
  orgId: string,
  jobId: string,
  patch: { stage?: PrismStage; status?: PrismJobStatus; error?: PrismJob['error'] },
): Promise<void> {
  await query(
    `UPDATE prism_jobs
        SET stage  = COALESCE($3, stage),
            status = COALESCE($4, status),
            error  = $5::jsonb,
            updated_at = now()
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [jobId, orgId, patch.stage ?? null, patch.status ?? null, patch.error ? JSON.stringify(patch.error) : null],
  );
}

/** Merge counts into prism_jobs.counts (additive; the conservation funnel). */
export async function bumpCounts(orgId: string, jobId: string, delta: Partial<PrismCounts>): Promise<void> {
  await query(
    `UPDATE prism_jobs
        SET counts = counts || $3::jsonb, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [jobId, orgId, JSON.stringify(delta)],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage queueing (Redis list per connection; in-memory fallback)
// ─────────────────────────────────────────────────────────────────────────────

/** Enqueue stage work onto the per-connection queue. */
export async function enqueueStage(connectionId: string, jobId: string, stage: PrismStage): Promise<void> {
  const key = `${QUEUE_NS}:${connectionId}`;
  const payload = JSON.stringify({ jobId, stage });
  const redis = getRedisClient();
  if (!redis) {
    const q = memQueues.get(key) ?? [];
    q.push({ jobId, stage });
    memQueues.set(key, q);
    return;
  }
  try {
    await redis.rpush(key, payload);
  } catch (err) {
    logger.warn({ connectionId, jobId, stage, err: (err as Error).message }, 'prism:engine enqueue fail → in-memory');
    const q = memQueues.get(key) ?? [];
    q.push({ jobId, stage });
    memQueues.set(key, q);
  }
}

/** Pop the next queued stage for a connection (worker dispatch helper). */
export async function dequeueStage(connectionId: string): Promise<{ jobId: string; stage: PrismStage } | null> {
  const key = `${QUEUE_NS}:${connectionId}`;
  const redis = getRedisClient();
  if (!redis) {
    const q = memQueues.get(key);
    return q && q.length ? q.shift()! : null;
  }
  try {
    const raw = await redis.lpop(key);
    return raw ? (JSON.parse(raw) as { jobId: string; stage: PrismStage }) : null;
  } catch {
    const q = memQueues.get(key);
    return q && q.length ? q.shift()! : null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage handlers are intentionally thin here: heavy lifting lives in the
 * dedicated modules (extract.ts / transform.ts / load.ts / reconcile.ts /
 * dryrun.ts) which the orchestrator drives from a route or worker with the
 * concrete connector + mapping in hand. The engine owns ONLY the state machine,
 * queueing, and backpressure — keeping stage logic testable in isolation and the
 * orchestrator source-agnostic.
 *
 * `runStage` marks the job running on the stage, evaluates backpressure for
 * EXTRACT, and (for non-interactive stages) signals the caller to perform the
 * stage work then call `advance`. For interactive stages it parks the job.
 */
export async function runStage(jobId: string, stage: PrismStage): Promise<{ status: PrismJobStatus }> {
  const orgId = await orgForJob(jobId);
  if (!orgId) throw new Error(`prism:engine runStage — unknown job ${jobId}`);

  const job = await getJob(orgId, jobId);
  if (!job) throw new Error(`prism:engine runStage — job ${jobId} not found`);

  logger.info({ orgId, jobId, stage, connectionId: job.connection_id }, 'prism:engine stage transition');

  // Interactive stages wait for the human (confirm mapping / approve dry-run).
  if (INTERACTIVE_STAGES.has(stage)) {
    await setJobState(orgId, jobId, { stage, status: 'awaiting_input', error: null });
    return { status: 'awaiting_input' };
  }

  await setJobState(orgId, jobId, { stage, status: 'running', error: null });

  // EXTRACT honors backpressure: if unloaded depth is high, pause this job's
  // EXTRACT (yields workers to other tenants) until LOAD drains below the low mark.
  if (stage === 'extract') {
    const decision = await evaluateBackpressure(orgId, jobId, job.counts);
    if (decision === 'pause') {
      await setJobState(orgId, jobId, { stage, status: 'paused', error: null });
      return { status: 'paused' };
    }
  }

  // The actual stage work (connector pulls, transform, load, …) is performed by
  // the caller/worker against the concrete connector + confirmed mapping, then it
  // calls advance(jobId). The engine enqueues the work so a worker picks it up.
  await enqueueStage(job.connection_id, jobId, stage);
  return { status: 'running' };
}

/**
 * Advance the job to the next stage in the spine. Called after a stage's work
 * completes successfully. PUBLISH (the terminal stage) marks the job complete —
 * or `partial` when poison records were quarantined (never a silent `complete`
 * over lost records). Interactive stages are dispatched as `awaiting_input`.
 */
export async function advance(jobId: string): Promise<{ stage: PrismStage; status: PrismJobStatus }> {
  const orgId = await orgForJob(jobId);
  if (!orgId) throw new Error(`prism:engine advance — unknown job ${jobId}`);

  const job = await getJob(orgId, jobId);
  if (!job) throw new Error(`prism:engine advance — job ${jobId} not found`);

  const idx = STAGE_ORDER.indexOf(job.stage);
  if (idx === -1) throw new Error(`prism:engine advance — unknown stage ${job.stage}`);

  // Terminal stage → resolve final status from the conservation counts.
  if (job.stage === 'publish') {
    const poison = job.counts.poison ?? 0;
    const failed = job.counts.failed ?? 0;
    const finalStatus: PrismJobStatus = poison > 0 || failed > 0 ? 'partial' : 'complete';
    await setJobState(orgId, jobId, { status: finalStatus, error: null });
    logger.info({ orgId, jobId, finalStatus, counts: job.counts }, 'prism:engine job terminal');
    return { stage: 'publish', status: finalStatus };
  }

  const nextStage = STAGE_ORDER[idx + 1];
  const { status } = await runStage(jobId, nextStage);
  return { stage: nextStage, status };
}

/**
 * Mark a job failed with a structured, retryable-classified error. A job never
 * silently stalls — it advances, retries with backoff, or moves to a recorded
 * terminal/actionable state (operations-runbook.md §3 invariant 3).
 */
export async function failJob(
  jobId: string,
  stage: PrismStage,
  message: string,
  retryable: boolean,
): Promise<void> {
  const orgId = await orgForJob(jobId);
  if (!orgId) return;
  const status: PrismJobStatus = retryable ? 'queued' : 'failed';
  await setJobState(orgId, jobId, { stage, status, error: { stage, message, retryable } });
  logger.error({ orgId, jobId, stage, retryable }, `prism:engine job ${status}: ${message}`);
}

/** Resume an awaiting_input job after a human confirm/approve (MAP/DRY-RUN). */
export async function resume(jobId: string): Promise<{ stage: PrismStage; status: PrismJobStatus }> {
  const orgId = await orgForJob(jobId);
  if (!orgId) throw new Error(`prism:engine resume — unknown job ${jobId}`);
  const job = await getJob(orgId, jobId);
  if (!job) throw new Error(`prism:engine resume — job ${jobId} not found`);
  if (job.status !== 'awaiting_input' && job.status !== 'paused') {
    logger.warn({ orgId, jobId, status: job.status }, 'prism:engine resume — job not parked, no-op');
    return { stage: job.stage, status: job.status };
  }
  // The interactive step is satisfied → advance to the next stage.
  return advance(jobId);
}

// ─────────────────────────────────────────────────────────────────────────────
// API façade — org-scoped entry points the route layer (routes/prism.ts) calls.
//
// These are thin orchestration wrappers over the engine primitives + stage
// modules above. They keep the route layer free of SQL and pipeline mechanics.
// Every function is org-scoped and throws on a missing/cross-org row (the route
// maps the throw to 404/403). Heavy connector I/O (the actual EXTRACT pull loop)
// is performed by background workers; these façade calls advance the state
// machine and enqueue work.
// ─────────────────────────────────────────────────────────────────────────────

function notFound(what: string): never {
  const err = Object.assign(new Error(`prism: ${what} not found`), { status: 404 });
  throw err;
}

/**
 * CONNECT — persist a connection and its credential reference, return the id.
 *
 * Flow (matches security-compliance.md): create the row first (so we have a
 * connection_id for the org-namespaced secret path + AAD binding), call the
 * connector's `authenticate` to validate/exchange credentials and obtain the raw
 * secret material, store the secret via the Secret Manager (NEVER in Postgres), and
 * persist only the opaque `credential_ref`. For file uploads the connector returns the
 * fileRef as the opaque ref and there is NO secret to store.
 *
 * NOTE: routes/prism.ts inlines this same flow today; this façade is the equivalent
 * source-agnostic entry point (used by non-route callers / future kick-offs).
 */
export async function authenticateConnection(
  orgId: string,
  userId: string,
  req: CreateConnectionRequest,
): Promise<{ connectionId: string }> {
  const connector = getConnector(req.platform); // validates the platform — throws if unregistered

  // 1. Create the connection row (pending_auth) → gives us the connection_id the secret
  //    path (prism/{org}/conn/{connection_id}) + AAD binding need.
  const { rows } = await query<{ id: string }>(
    `INSERT INTO prism_connections
       (org_id, platform, label, auth_kind, status, mode, history_window,
        config, stats, created_by)
     VALUES ($1, $2, $3, $4, 'pending_auth', $5, $6, '{}'::jsonb, '{}'::jsonb, $7)
     RETURNING id`,
    [
      orgId,
      req.platform,
      req.platform,
      req.authKind,
      req.mode,
      req.history_window ?? 3,
      userId,
    ],
  );
  const connectionId = rows[0].id;

  // 2. Authenticate via the connector. For a file_upload connector this echoes the
  //    fileRef back as the opaque ref (no source secret). For API connectors it returns
  //    the raw secret material to store.
  let secretToStore: string | null = null;
  try {
    secretToStore = await connector.authenticate({
      orgId,
      authKind: req.authKind,
      apiKey: req.credentials?.apiKey,
      serviceAccountJson: req.credentials?.serviceAccountJson,
      oauthCode: req.oauthCode,
      fileRef: req.fileRef,
      extra: req.credentials?.extra,
    });
  } catch (err) {
    await query(
      `UPDATE prism_connections SET status = 'error', updated_at = now() WHERE id = $1 AND org_id = $2`,
      [connectionId, orgId],
    ).catch(() => {});
    throw err;
  }

  // 3. Store the secret in the Secret Manager (NEVER in Postgres) and persist only the
  //    opaque credential_ref. File uploads carry no source secret → the fileRef itself
  //    is the opaque ref; nothing is sent to the secret manager (no secret exists).
  let credentialRef: string | null = null;
  if (secretToStore) {
    if (req.authKind === 'file_upload') {
      // The "secret" is just the upload storage ref — store it verbatim as the ref.
      credentialRef = secretToStore;
    } else {
      credentialRef = await secretManager.putSecret({ orgId, connectionId, secret: secretToStore });
    }
  }

  await query(
    `UPDATE prism_connections
        SET credential_ref = $3, status = $4, updated_at = now()
      WHERE id = $1 AND org_id = $2`,
    [connectionId, orgId, credentialRef, credentialRef ? 'active' : 'pending_auth'],
  );

  logger.info({ orgId, connectionId, platform: req.platform }, 'prism:connect created');
  return { connectionId };
}

/** DISCOVER — enumerate resources at the source. Delegates to the connector. */
export async function discoverResources(
  orgId: string,
  connectionId: string,
): Promise<DiscoveredResource[]> {
  const { rows } = await query<{ platform: string; credential_ref: string | null; config: Record<string, unknown> }>(
    `SELECT platform, credential_ref, config FROM prism_connections
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [connectionId, orgId],
  );
  const conn = rows[0];
  if (!conn) notFound(`connection ${connectionId}`);
  const connector = getConnector(conn.platform);
  const out: DiscoveredResource[] = [];
  for await (const r of connector.discover({
    id: connectionId,
    orgId,
    credentialRef: conn.credential_ref,
    config: conn.config ?? {},
  })) {
    out.push(r);
  }
  return out;
}

/** Soft-cancel all non-terminal jobs for a connection (e.g. on disconnect). */
export async function cancelConnectionJobs(orgId: string, connectionId: string): Promise<void> {
  await query(
    `UPDATE prism_jobs SET status = 'failed',
        error = jsonb_build_object('stage', stage, 'message', 'connection cancelled', 'retryable', false),
        updated_at = now()
      WHERE org_id = $1 AND connection_id = $2 AND deleted_at IS NULL
        AND status IN ('queued','running','awaiting_input','paused')`,
    [orgId, connectionId],
  );
  logger.info({ orgId, connectionId }, 'prism:engine cancelled connection jobs');
}

/** Create a job row and kick the pipeline at CONNECT (idempotent kick-off). */
export async function enqueueJob(
  orgId: string,
  userId: string,
  req: CreateJobRequest,
): Promise<{ jobId: string }> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO prism_jobs
       (org_id, connection_id, kind, stage, status, cursor, counts, triggered_by, created_by)
     VALUES ($1, $2, $3, 'connect', 'queued', $4::jsonb, '{}'::jsonb, 'user', $5)
     RETURNING id`,
    [orgId, req.connectionId, req.kind, JSON.stringify({ resources: req.resources, options: req.options ?? {} }), userId],
  );
  const jobId = rows[0].id;
  await runStage(jobId, 'connect');
  // Ensure the worker loop is running so this freshly-queued job actually advances
  // (queued → running) instead of sitting at `connect`. Idempotent + best-effort.
  kickWorker();
  logger.info({ orgId, jobId, connectionId: req.connectionId, kind: req.kind }, 'prism:engine job enqueued');
  return { jobId };
}

/** Pause / resume / cancel a job (operations-runbook §1: first move is pause+resume). */
export async function controlJob(
  orgId: string,
  jobId: string,
  action: 'pause' | 'resume' | 'cancel',
): Promise<void> {
  const job = await getJob(orgId, jobId);
  if (!job) notFound(`job ${jobId}`);
  if (action === 'pause') {
    await setJobState(orgId, jobId, { status: 'paused', error: null });
  } else if (action === 'resume') {
    await resume(jobId);
  } else {
    await setJobState(orgId, jobId, {
      status: 'failed',
      error: { stage: job.stage, message: 'cancelled by user', retryable: false },
    });
  }
  logger.info({ orgId, jobId, action }, 'prism:engine controlJob');
}

/** Register continuous sync for a connection's record types (capability negotiation). */
export async function registerSync(
  orgId: string,
  connectionId: string,
  body: { recordTypes?: RecordType[]; webhookSecretRef?: string | null },
): Promise<void> {
  const { rows } = await query<{ platform: string }>(
    `SELECT platform FROM prism_connections WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [connectionId, orgId],
  );
  if (!rows[0]) notFound(`connection ${connectionId}`);
  const connector = getConnector(rows[0].platform);
  const recordTypes = body.recordTypes ?? (['response'] as RecordType[]);
  for (const rt of recordTypes) {
    const mode = negotiateCaptureMode(connector.meta, rt);
    await ensureSyncState(orgId, connectionId, rt, mode, body.webhookSecretRef ?? null);
  }
  logger.info({ orgId, connectionId, recordTypes }, 'prism:engine registerSync');
}

/** Read the per-(connection, record_type) sync-state rows for a connection. */
export async function getSync(orgId: string, connectionId: string): Promise<PrismSyncState[]> {
  const { rows } = await query<PrismSyncState>(
    `SELECT connection_id, record_type, org_id, capture_mode, cursor,
            last_event_at, last_synced_at, lag_seconds, freshness_slo_s,
            poll_cadence_s, consecutive_fail, webhook_secret_ref, paused
       FROM prism_sync_state
      WHERE org_id = $1 AND connection_id = $2`,
    [orgId, connectionId],
  );
  return rows;
}

/** MAP — return the latest proposed/confirmed mapping for a job's connection. */
export async function getMappingSuggestions(
  orgId: string,
  jobId: string,
): Promise<{ suggestions: FieldMapping[] }> {
  const job = await getJob(orgId, jobId);
  if (!job) notFound(`job ${jobId}`);
  const { rows } = await query<{ mappings: FieldMapping[] }>(
    `SELECT mappings FROM prism_mappings
      WHERE org_id = $1 AND connection_id = $2
      ORDER BY mapping_version DESC LIMIT 1`,
    [orgId, job.connection_id],
  );
  return { suggestions: rows[0]?.mappings ?? [] };
}

/** Confirm a mapping (persist versioned) and advance the parked job past MAP. */
export async function confirmMapping(
  orgId: string,
  jobId: string,
  mappings: FieldMapping[],
): Promise<void> {
  const job = await getJob(orgId, jobId);
  if (!job) notFound(`job ${jobId}`);
  // Derive the shape hash from the confirmed field set (stable source ids).
  const shapeHash = schemaShapeHash({
    fields: mappings.map((m) => ({ name: m.source_field, type: m.source_type ?? '' })),
    shapeHash: '',
  });
  await saveConfirmedMapping(orgId, job.connection_id, shapeHash, mappings);

  // MAP is confirmed → the survey shape is now known. Materialize the import's
  // target survey (idempotent: reused on resume) BEFORE TRANSFORM/LOAD so
  // `responses.survey_id` (NOT NULL) is always satisfiable. ensureImportSurvey
  // stamps `cursor.survey_id`, which the worker's targetSurveyId/TRANSFORM read.
  // Re-fetch the job after the cursor write so resume() carries the survey_id.
  await materializeImportSurvey(orgId, job, mappings);

  const fresh = (await getJob(orgId, jobId)) ?? job;
  if (fresh.status === 'awaiting_input' && fresh.stage === 'map') {
    await resume(jobId);
  }
}

/** Load the connection info (platform/label/config) the survey materializer needs. */
async function importConnectionInfo(orgId: string, connectionId: string): Promise<ImportConnectionInfo | null> {
  const { rows } = await query<{ id: string; platform: string; label: string | null; config: Record<string, unknown> }>(
    `SELECT id, platform, label, config FROM prism_connections
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [connectionId, orgId],
  );
  const c = rows[0];
  return c ? { id: c.id, platform: c.platform, label: c.label, config: c.config ?? {} } : null;
}

/**
 * The most recent `survey_def` raw record payload for a job, if any. Survey/XM
 * connectors import a definition; the survey is built FROM it (title + questions)
 * when present, else synthesized from the confirmed mappings.
 */
async function surveyDefPayload(orgId: string, jobId: string): Promise<unknown> {
  const { rows } = await query<{ payload: unknown }>(
    `SELECT payload FROM prism_raw_records
      WHERE org_id = $1 AND job_id = $2 AND record_type = 'survey_def' AND NOT poison
      ORDER BY extracted_at DESC LIMIT 1`,
    [orgId, jobId],
  );
  return rows[0]?.payload ?? undefined;
}

/**
 * Materialize (or reuse) the import's target survey for a job and stamp its id on
 * the job cursor. Idempotent per job/connection (ensureImportSurvey reuses an
 * existing `cursor.survey_id`). Best-effort connection lookup; throws only if the
 * survey row cannot be written (a hard precondition for LOAD).
 */
async function materializeImportSurvey(orgId: string, job: PrismJob, mappings: FieldMapping[]): Promise<void> {
  const connection = await importConnectionInfo(orgId, job.connection_id);
  if (!connection) {
    logger.warn({ orgId, jobId: job.id, connectionId: job.connection_id }, 'prism:engine confirmMapping — connection gone, skipping survey materialize');
    return;
  }
  const surveyDef = await surveyDefPayload(orgId, job.id);
  await ensureImportSurvey({ orgId, job, connection, mappings, surveyDef });
}

/** DRY-RUN — fetch the computed diff persisted for a job. */
export async function getDryRunReport(orgId: string, jobId: string): Promise<DryRunReport> {
  const job = await getJob(orgId, jobId);
  if (!job) notFound(`job ${jobId}`);
  const { rows } = await query<{ report: DryRunReport }>(
    `SELECT report FROM prism_dryrun_report
      WHERE org_id = $1 AND job_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [orgId, jobId],
  );
  if (!rows[0]) notFound(`dry-run report for job ${jobId}`);
  return rows[0].report;
}

/** APPROVE — record conflict resolutions / metric methods and advance past DRY-RUN to LOAD. */
export async function approveAndLoad(
  orgId: string,
  jobId: string,
  body: ApproveRequest,
): Promise<void> {
  const job = await getJob(orgId, jobId);
  if (!job) notFound(`job ${jobId}`);
  // Persist the approval decisions onto the job cursor for the LOAD worker to honor.
  await query(
    `UPDATE prism_jobs
        SET cursor = COALESCE(cursor, '{}'::jsonb) || $3::jsonb, updated_at = now()
      WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [jobId, orgId, JSON.stringify({ approval: body })],
  );
  if (job.status === 'awaiting_input' && job.stage === 'dryrun') {
    await resume(jobId);
  }
}

/** RECONCILE — fetch the persisted reconciliation report for a job. */
export async function getReconReport(orgId: string, jobId: string): Promise<ReconReport> {
  const job = await getJob(orgId, jobId);
  if (!job) notFound(`job ${jobId}`);
  const { rows } = await query<{ report: ReconReport }>(
    `SELECT report FROM prism_recon_report
      WHERE org_id = $1 AND job_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [orgId, jobId],
  );
  if (!rows[0]) notFound(`recon report for job ${jobId}`);
  return rows[0].report;
}

/**
 * Signed reconciliation report PDF (the white-glove trust deliverable).
 *
 * TODO(verify): render via the existing exporters (pdfmake is already a dep) —
 * out of engine scope. Returns the JSON report bytes as a placeholder so the
 * route resolves; swap for a rendered PDF when the exporter is wired.
 */
export async function getReconReportPdf(orgId: string, jobId: string): Promise<Buffer> {
  const report = await getReconReport(orgId, jobId);
  return Buffer.from(JSON.stringify(report, null, 2), 'utf8');
}

/**
 * Continuous-sync webhook intake (PUSH capture). The ROUTE verifies HMAC over the raw
 * body and parses the payload into RawRecords; this façade resolves the connection's
 * live sync job, appends the records idempotently to the lossless raw log, and triggers
 * the SAME downstream pipeline a poll/bulk uses (TRANSFORM → LOAD → ENRICH) — so a
 * verified webhook actually ingests new responses, not enqueues into the void.
 *
 * Push and poll are indistinguishable downstream (ADR-022): both append to
 * `prism_raw_records` (natural-key dedupe collapses a webhook+poll overlap) and both
 * enter the engine at TRANSFORM on the connection's live sync job. Idempotent: a
 * duplicate webhook re-observing the same source record is a hash-aware no-op, and the
 * TRANSFORM trigger over already-seen rows is a no-op diff.
 */
export async function handleWebhook(
  orgId: string,
  connectionId: string,
  records: RawRecord[],
): Promise<void> {
  if (!records.length) return;

  // A real job_id is required: prism_raw_records.job_id is NOT NULL → prism_jobs(id).
  // The streaming connection has ONE long-lived kind='sync' job; webhook + poll both
  // stamp it (so the conservation funnel + stage queue are anchored to one job).
  const jobId = await ensureLiveSyncJob(orgId, connectionId, 'webhook');

  // Stamp org/connection/job server-side (never trust the payload) and append.
  const stamped = records.map((r) => ({
    ...r,
    org_id: orgId,
    connection_id: connectionId,
    job_id: jobId,
  }));
  const res = await appendRawRecords(stamped);

  // New (or changed) rows → drive them through TRANSFORM→LOAD→ENRICH. A pure-replay
  // webhook (all rows hash-equal no-ops) skips the trigger — nothing changed.
  if (res.inserted + res.updated > 0) {
    await triggerIngest(connectionId, jobId);
  }

  // Augment connections keep only a rolling window; trim per record_type seen here.
  const recordTypes = new Set(stamped.map((r) => r.record_type));
  const mode = await connectionMode(orgId, connectionId);
  if (mode === 'augment') {
    for (const rt of recordTypes) await trimAugmentBuffer(orgId, connectionId, rt, mode);
  }

  logger.info(
    { orgId, connectionId, jobId, count: records.length, inserted: res.inserted, updated: res.updated },
    'prism:engine handleWebhook ingested',
  );
}

/** Look up a connection's operating mode (augment|ingest|migrate) for retention policy. */
async function connectionMode(orgId: string, connectionId: string): Promise<PrismMode | null> {
  const { rows } = await query<{ mode: PrismMode }>(
    `SELECT mode FROM prism_connections WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [connectionId, orgId],
  );
  return rows[0]?.mode ?? null;
}

// Re-export the HMAC verifier so the route imports it from one place if desired.
export { verifyHmacSha256 } from './sync/webhook';
export { setSyncPaused };
