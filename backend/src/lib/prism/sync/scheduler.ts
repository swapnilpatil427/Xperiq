/**
 * Prism continuous-sync SCHEDULER — the loop that makes Prism receive NEW data.
 *
 * Per ADR-022, bulk and continuous sync share TRANSFORM/LOAD/ENRICH; continuous sync
 * adds SCHEDULING + CAPTURE (architecture-ingestion.md §5). This module is the
 * SCHEDULING half: a single resilient interval loop that, every
 * `PRISM_SYNC_POLL_INTERVAL_S`, finds the `prism_sync_state` streams that are DUE and
 * pulls their new records via the connector (cursor-based incremental EXTRACT), then
 * hands them to the shared engine pipeline (TRANSFORM → LOAD → ENRICH).
 *
 * What it processes each tick:
 *   - `capture_mode = 'poll'`           → primary capture (poll-only sources).
 *   - `capture_mode = 'push_verified'`  → a LOW-cadence reconciling backstop poll
 *     (trust-but-verify: webhooks can drop/delay/replay; the overlap re-read catches
 *     gaps, EXTRACT dedupe makes it a no-op when nothing was missed).
 *
 * Per-stream, per tick (only when DUE = now ≥ last_synced_at + poll_cadence_s, and not
 * paused), under a claim so two schedulers never double-poll the same stream:
 *   1. resolve the connector + credentials, build a `fetchPage(cursor)` over
 *      connector.extract() (one page),
 *   2. `pollOnce` / `reconcilingBackstop`: append new raw records idempotently
 *      (natural-key dedupe) and advance the cursor only after a durable append,
 *   3. when new rows landed → `triggerIngest` (enqueue TRANSFORM on the live sync job),
 *   4. adapt cadence (engine.tick), trim the Augment rolling buffer, and on sustained
 *      failure trip the circuit (auto-pause).
 *
 * Resilience: the loop never throws out — every stream is wrapped so one bad source
 * can't wedge the tick; failures increment `consecutive_fail` (poll.ts) which feeds
 * exponential backoff (cadence relaxes toward the ceiling on idle/failure) and the
 * circuit breaker. Horizontal-safe via a per-stream Redis lock (in-memory fallback
 * single-instance) so N backend instances cooperate instead of stampeding a source.
 */
import type {
  PrismMode,
  RecordType,
  Cursor,
  ResourceRef,
  PrismConnector,
  Connection,
} from '../../../types/prism';
import { query } from '../../db';
import { getRedisClient } from '../../redis';
import logger from '../../logger';
import { getConnector } from '../connectors';
import { secretManager } from '../secretManager';
import { getPrismConfig } from '../config';
import {
  tick,
  ensureLiveSyncJob,
  triggerIngest,
  trimAugmentBuffer,
  applyCircuitBreaker,
} from './engine';
import type { PollContext } from './poll';

// ── Config (shared production contract) ────────────────────────────────────────
// Read from the central per-environment Prism config so the env-var NAMES
// (PRISM_SYNC_ENABLED default true · PRISM_SYNC_POLL_INTERVAL_S) stay the single
// source of truth and don't diverge from the worker/storage settings.
const { syncEnabled: SYNC_ENABLED, syncPollIntervalS: rawInterval } = getPrismConfig().worker;
const POLL_INTERVAL_S = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 60;

/** push_verified streams get a relaxed reconciling backstop, not a tight primary poll. */
const PUSH_VERIFIED_BACKSTOP_CADENCE_S = 900; // 15 min trust-but-verify sweep

/** Per-stream claim TTL (a tick should finish well within this). */
const CLAIM_TTL_S = Math.max(30, POLL_INTERVAL_S * 5);
const CLAIM_NS = 'prism:sync:lock';

let timer: NodeJS.Timeout | null = null;
let running = false; // guards against overlapping ticks within one instance

// In-memory claim fallback (single instance, no Redis): lockKey → expiry ms.
const memClaims = new Map<string, number>();

interface DueStream {
  org_id: string;
  connection_id: string;
  record_type: RecordType;
  capture_mode: 'poll' | 'push_verified';
  poll_cadence_s: number | null;
  platform: string;
  mode: PrismMode;
  credential_ref: string | null;
  config: Record<string, unknown>;
}

/**
 * Load active streams that are DUE for a pull. A stream is due when it is not paused,
 * its capture_mode needs a poll, and `now ≥ last_synced_at + cadence` (NULL
 * last_synced_at = never synced = due immediately). `push_verified` uses the relaxed
 * backstop cadence; `poll` uses its own adaptive `poll_cadence_s`.
 *
 * `FOR UPDATE SKIP LOCKED` on the joined sync rows means a second scheduler scanning
 * concurrently skips rows this one is mid-claim on — defense-in-depth alongside the
 * per-stream Redis lock (no double-poll across instances).
 */
async function loadDueStreams(limit = 200): Promise<DueStream[]> {
  const { rows } = await query<DueStream>(
    `SELECT s.org_id, s.connection_id, s.record_type, s.capture_mode, s.poll_cadence_s,
            c.platform, c.mode, c.credential_ref, c.config
       FROM prism_sync_state s
       JOIN prism_connections c
         ON c.id = s.connection_id AND c.org_id = s.org_id
      WHERE NOT s.paused
        AND c.deleted_at IS NULL
        AND c.status = 'active'
        AND s.capture_mode IN ('poll', 'push_verified')
        AND (
          s.last_synced_at IS NULL
          OR now() >= s.last_synced_at + make_interval(secs =>
               CASE WHEN s.capture_mode = 'push_verified' THEN $1
                    ELSE COALESCE(s.poll_cadence_s, $2) END)
        )
      ORDER BY s.last_synced_at ASC NULLS FIRST
      LIMIT $3
      FOR UPDATE OF s SKIP LOCKED`,
    [PUSH_VERIFIED_BACKSTOP_CADENCE_S, POLL_INTERVAL_S, limit],
  );
  return rows;
}

/**
 * Try to claim a stream for this tick so two schedulers don't both poll it. Redis
 * `SET NX EX` is the cross-instance lock; in-memory map is the single-instance
 * fallback. Returns true if the claim was acquired.
 */
async function claimStream(key: string): Promise<boolean> {
  const lockKey = `${CLAIM_NS}:${key}`;
  const redis = getRedisClient();
  if (!redis) {
    const now = Date.now();
    for (const [k, exp] of memClaims) if (exp < now) memClaims.delete(k);
    if (memClaims.has(lockKey)) return false;
    memClaims.set(lockKey, now + CLAIM_TTL_S * 1000);
    return true;
  }
  try {
    const set = await redis.set(lockKey, '1', 'EX', CLAIM_TTL_S, 'NX');
    return set !== null;
  } catch (err) {
    logger.warn({ key, err: (err as Error).message }, 'prism:sync claim-lock fail → in-memory');
    const now = Date.now();
    if ((memClaims.get(lockKey) ?? 0) > now) return false;
    memClaims.set(lockKey, now + CLAIM_TTL_S * 1000);
    return true;
  }
}

async function releaseStream(key: string): Promise<void> {
  const lockKey = `${CLAIM_NS}:${key}`;
  memClaims.delete(lockKey);
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(lockKey);
  } catch {
    /* lock expires by TTL anyway */
  }
}

/**
 * Build a single-page `fetchPage(cursor)` over a connector's `extract()` async
 * iterable. The connector yields `{ records, nextCursor }` pages; `pollOnce` drives the
 * paging loop, so each `fetchPage` call advances the iterator exactly one page. We
 * resolve a fresh iterator per call seeded with the requested cursor (connectors key
 * the incremental window off the cursor — `since`/`after`/`continuationToken`), and
 * return the page's records (stripped to the poll's shape) + the next cursor.
 */
function makeFetchPage(
  connector: PrismConnector,
  conn: Connection,
  resource: ResourceRef,
): PollContext['fetchPage'] {
  return async (cursor: Cursor | null) => {
    const iter = connector.extract(conn, resource, cursor ?? undefined);
    const { value, done } = await iter[Symbol.asyncIterator]().next();
    if (done || !value) return { records: [], nextCursor: null };
    const records = (value.records ?? []).map((r) => ({
      sourceRecordId: r.source_record_id,
      payload: r.payload,
      observedAt: r.source_observed_at ?? null,
    }));
    return { records, nextCursor: value.nextCursor ?? null };
  };
}

/**
 * Resolve the connector + a Connection with credentials hydrated onto `config`.
 * Connectors read the access token from `conn.config` (the SDK/oauthFlow injects it);
 * we resolve `credential_ref` → secret via the Secret Manager (org-scoped) and pass it
 * as `config.accessToken` so a poll can authenticate. Never logs the secret.
 */
async function resolveConnector(
  s: DueStream,
): Promise<{ connector: PrismConnector; conn: Connection } | null> {
  let connector: PrismConnector;
  try {
    connector = getConnector(s.platform);
  } catch (err) {
    logger.warn(
      { orgId: s.org_id, connectionId: s.connection_id, platform: s.platform, err: (err as Error).message },
      'prism:sync no connector — skipping stream',
    );
    return null;
  }

  const config: Record<string, unknown> = { ...(s.config ?? {}) };
  if (s.credential_ref) {
    try {
      const secret = await secretManager.getSecret(s.org_id, s.credential_ref);
      if (config.accessToken === undefined) config.accessToken = secret;
      config.credentialSecret = secret; // generic slot for connectors that read it
    } catch (err) {
      logger.warn(
        { orgId: s.org_id, connectionId: s.connection_id, err: (err as Error).message },
        'prism:sync credential resolve failed — skipping stream',
      );
      return null;
    }
  }

  return {
    connector,
    conn: { id: s.connection_id, orgId: s.org_id, credentialRef: s.credential_ref, config },
  };
}

/** Process one due stream end-to-end. Never throws — failures are logged + circuited. */
async function processStream(s: DueStream): Promise<void> {
  const claimKey = `${s.connection_id}:${s.record_type}`;
  if (!(await claimStream(claimKey))) return; // another scheduler owns this tick

  try {
    const resolved = await resolveConnector(s);
    if (!resolved) return;
    const { connector, conn } = resolved;

    // The live sync job anchors raw rows (FK) + the downstream stage queue.
    const jobId = await ensureLiveSyncJob(s.org_id, s.connection_id, 'schedule');

    // The resource to tail. TODO(verify): a connection may expose MULTIPLE source
    // resources (e.g. several Typeform forms); the synced resource id(s) should live on
    // the connection config (set at DISCOVER/sync-register). Until that wiring lands we
    // pass the connection id as the resource id and rely on the connector to interpret
    // it (file/single-resource connectors) or fall back to its account-wide feed.
    const resource: ResourceRef =
      typeof s.config?.sync_resource_id === 'string'
        ? { kind: s.record_type, id: s.config.sync_resource_id }
        : { kind: s.record_type, id: s.connection_id };
    const ctx: PollContext = {
      orgId: s.org_id,
      connectionId: s.connection_id,
      jobId,
      platform: s.platform,
      recordType: s.record_type,
      meta: connector.meta,
      fetchPage: makeFetchPage(connector, conn, resource),
    };

    // tick() runs pollOnce (poll) or reconcilingBackstop (push_verified), adapts
    // cadence, and updates cursor/lag/consecutive_fail via poll.ts.
    let appended = 0;
    try {
      const result = await tick(ctx, s.capture_mode);
      appended = result.appended;
    } catch (err) {
      // poll.ts already recorded the failure + retained the cursor; trip the circuit
      // if this stream has now failed too many times in a row.
      logger.warn(
        { orgId: s.org_id, connectionId: s.connection_id, recordType: s.record_type, err: (err as Error).message },
        'prism:sync stream tick failed',
      );
      await applyCircuitBreaker(s.org_id, s.connection_id, s.record_type);
      return;
    }

    // New responses → push them into the shared engine pipeline (TRANSFORM → LOAD →
    // ENRICH). This is how continuously-synced data reaches the canonical tables.
    if (appended > 0) {
      await triggerIngest(s.connection_id, jobId);
    }

    // Augment keeps only a rolling window — trim anything older than the buffer.
    await trimAugmentBuffer(s.org_id, s.connection_id, s.record_type, s.mode);
  } catch (err) {
    logger.error(
      { orgId: s.org_id, connectionId: s.connection_id, recordType: s.record_type, err: (err as Error).message },
      'prism:sync processStream unexpected error',
    );
  } finally {
    await releaseStream(claimKey);
  }
}

/** One scheduler tick: load due streams and process them (bounded concurrency). */
async function runTick(): Promise<void> {
  if (running) return; // skip if the previous tick is still going (slow sources)
  running = true;
  try {
    const due = await loadDueStreams();
    if (due.length === 0) return;
    logger.debug({ count: due.length }, 'prism:sync tick — due streams');
    // Bounded parallelism: a small pool so one tick can't open hundreds of source
    // connections at once. Per-connection rate limits still apply inside pollOnce.
    const POOL = 8;
    for (let i = 0; i < due.length; i += POOL) {
      await Promise.all(due.slice(i, i + POOL).map((s) => processStream(s)));
    }
  } catch (err) {
    // A failure loading streams must not kill the loop — log and wait for next tick.
    logger.error({ err: (err as Error).message }, 'prism:sync tick failed');
  } finally {
    running = false;
  }
}

/**
 * Start the continuous-sync scheduler. Idempotent (a second call is a no-op). Gated by
 * `PRISM_SYNC_ENABLED` (default true). The first tick runs after one interval so boot
 * isn't blocked. Call once at startup (index.ts), like the Event Engine.
 */
export function startPrismSyncScheduler(): void {
  if (!SYNC_ENABLED) {
    logger.info('prism:sync scheduler disabled (PRISM_SYNC_ENABLED=false)');
    return;
  }
  if (timer) return; // already started
  timer = setInterval(() => {
    void runTick();
  }, POLL_INTERVAL_S * 1000);
  // Don't keep the event loop alive solely for the scheduler (clean shutdown).
  if (typeof timer.unref === 'function') timer.unref();
  logger.info({ intervalS: POLL_INTERVAL_S }, 'prism:sync scheduler started');
}

/** Stop the scheduler (tests / graceful shutdown). */
export function stopPrismSyncScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('prism:sync scheduler stopped');
  }
}
