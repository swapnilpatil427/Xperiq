/**
 * Prism continuous-sync — cursor poll (fallback capture) + trust-but-verify
 * reconciling backstop.
 *
 * Scheduled incremental pulls on the source's modified/created cursor
 * (continuationToken / since-until / timestamp). Two roles
 * (architecture-ingestion.md §5):
 *
 *   1. Primary capture for poll-only sources.
 *   2. A reconciling BACKSTOP under push: a webhook can be dropped, delayed, or
 *      replayed, so poll re-reads a recent window to catch gaps. EXTRACT-level
 *      dedupe (raw unique key + hash no-op) collapses webhook/poll overlap.
 *
 * Cursor advances on OBSERVATION, not delivery: only after the page's records
 * are durably appended (so a crash between fetch and append re-polls safely).
 */
import type { RawRecord, Cursor, RecordType, PrismSyncState } from '../../../types/prism';
import { query } from '../../db';
import logger from '../../logger';
import { appendRawRecords } from '../extract';
import { acquire, bucketFor } from '../ratelimit';
import type { ConnectorMeta } from '../../../types/prism';

export interface PollContext {
  orgId: string;
  connectionId: string;
  jobId: string;
  platform: string;
  recordType: RecordType;
  meta: ConnectorMeta;
  /**
   * Fetch one incremental page from the cursor. Returns the records (as RawRecord
   * shape minus job/connection ids, which we stamp) + the next cursor.
   */
  fetchPage: (cursor: Cursor | null) => Promise<{
    records: { sourceRecordId: string; payload: unknown; observedAt?: string | null }[];
    nextCursor: Cursor | null;
  }>;
}

/** Read the per-(connection, record_type) sync cursor. */
export async function readSyncState(
  orgId: string,
  connectionId: string,
  recordType: RecordType,
): Promise<PrismSyncState | null> {
  const { rows } = await query<PrismSyncState>(
    `SELECT connection_id, record_type, org_id, capture_mode, cursor,
            last_event_at, last_synced_at, lag_seconds, freshness_slo_s,
            poll_cadence_s, consecutive_fail, webhook_secret_ref, paused
       FROM prism_sync_state
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3`,
    [orgId, connectionId, recordType],
  );
  return rows[0] ?? null;
}

/** Persist cursor + freshness after a successful page append (observation-time advance). */
async function advanceCursor(
  ctx: PollContext,
  cursor: Cursor | null,
  newestObservedAt: string | null,
): Promise<void> {
  await query(
    `UPDATE prism_sync_state
        SET cursor = $4::jsonb,
            last_synced_at = now(),
            last_event_at = COALESCE($5, last_event_at),
            lag_seconds = CASE WHEN $5 IS NOT NULL
                               THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - $5::timestamptz))::int)
                               ELSE lag_seconds END,
            consecutive_fail = 0,
            updated_at = now()
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3`,
    [ctx.orgId, ctx.connectionId, ctx.recordType, cursor ? JSON.stringify(cursor) : null, newestObservedAt],
  );
}

async function recordFailure(ctx: PollContext): Promise<void> {
  await query(
    `UPDATE prism_sync_state
        SET consecutive_fail = consecutive_fail + 1, updated_at = now()
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3`,
    [ctx.orgId, ctx.connectionId, ctx.recordType],
  ).catch(() => {});
}

/**
 * Run one poll cycle from the stored cursor: page through new/changed records,
 * append each page to raw (idempotent), advance the cursor only after a durable
 * append. Honors the per-connection rate-limit bucket. Returns counts.
 */
export async function pollOnce(ctx: PollContext): Promise<{ appended: number; pages: number }> {
  const state = await readSyncState(ctx.orgId, ctx.connectionId, ctx.recordType);
  if (state?.paused) {
    logger.info({ ...idCtx(ctx) }, 'prism:poll paused — skipping cycle');
    return { appended: 0, pages: 0 };
  }

  const bucket = bucketFor(ctx.meta);
  let cursor: Cursor | null = state?.cursor ?? null;
  let appended = 0;
  let pages = 0;

  try {
    for (;;) {
      await acquire(ctx.connectionId, bucket); // pace within the source rate budget
      const page = await ctx.fetchPage(cursor);
      pages++;

      const records: RawRecord[] = page.records.map((r) => ({
        org_id: ctx.orgId,
        job_id: ctx.jobId,
        connection_id: ctx.connectionId,
        source_platform: ctx.platform,
        record_type: ctx.recordType,
        source_record_id: r.sourceRecordId,
        payload: r.payload,
        payload_hash: '', // appendRawRecords recomputes defensively
        ingress: 'poll',
        poison: false,
        source_observed_at: r.observedAt ?? null,
      }));

      // Durable append BEFORE advancing the cursor (observation-time advance).
      const res = await appendRawRecords(records);
      appended += res.inserted + res.updated;

      const newestObserved = records
        .map((r) => r.source_observed_at)
        .filter((t): t is string => !!t)
        .sort()
        .pop() ?? null;

      await advanceCursor(ctx, page.nextCursor, newestObserved);
      cursor = page.nextCursor;

      if (!page.nextCursor || page.records.length === 0) break;
    }
  } catch (err) {
    await recordFailure(ctx);
    logger.error({ ...idCtx(ctx), err: (err as Error).message }, 'prism:poll cycle failed — cursor retained');
    throw err;
  }

  logger.info({ ...idCtx(ctx), appended, pages }, 'prism:poll cycle complete');
  return { appended, pages };
}

/**
 * Trust-but-verify backstop: re-poll a recent overlap window under push, to catch
 * dropped/delayed webhooks. The overlap re-reads the last `overlapSeconds` of
 * source-modified time; EXTRACT dedupe makes the overlap a no-op when nothing was
 * missed (architecture §5 race rule #1-3).
 */
export async function reconcilingBackstop(
  ctx: PollContext,
  overlapSeconds = 3600,
): Promise<{ appended: number; pages: number }> {
  const state = await readSyncState(ctx.orgId, ctx.connectionId, ctx.recordType);
  // Rewind the cursor's time marker by the overlap window if present.
  const baseCursor = (state?.cursor ?? {}) as Cursor & { since?: string };
  let rewound: Cursor | null = baseCursor;
  if (baseCursor.since) {
    const sinceMs = Date.parse(String(baseCursor.since));
    if (!Number.isNaN(sinceMs)) {
      rewound = { ...baseCursor, since: new Date(sinceMs - overlapSeconds * 1000).toISOString() };
    }
  }
  return pollOnce({ ...ctx, fetchPage: (c) => ctx.fetchPage(c ?? rewound) });
}

function idCtx(ctx: PollContext): Record<string, unknown> {
  return { orgId: ctx.orgId, connectionId: ctx.connectionId, recordType: ctx.recordType, jobId: ctx.jobId };
}
