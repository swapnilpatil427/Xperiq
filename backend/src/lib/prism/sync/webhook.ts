/**
 * Prism continuous-sync — webhook receiver (push capture).
 *
 * Native source webhooks → HMAC-verified → replay-deduped → returns parsed
 * RawRecords for the engine to append (architecture-ingestion.md §5; runbook
 * connector-cert gate). The receiver MUST run against the RAW request body
 * (before express.json()), since HMAC is computed over the exact bytes.
 *
 * Guarantees:
 *   - verifyHmacSha256(rawBody, perTenantKey) — timing-safe compare.
 *   - ±300s timestamp tolerance — rejects stale/forged-future timestamps.
 *   - Redis replay-cache keyed by event-id — a replayed webhook never reaches
 *     EXTRACT twice with effect (in-memory fallback when no Redis).
 *   - SERVER-SIDE tenant resolution — org_id is resolved from the connection bound
 *     to the webhook secret, NEVER trusted from the payload (tenant binding).
 */
import crypto from 'crypto';
import type { RawRecord, RecordType } from '../../../types/prism';
import { query } from '../../db';
import { getRedisClient } from '../../redis';
import logger from '../../logger';
import { toRawRecord } from '../helpers';

const REPLAY_NS = 'prism:wh:seen';
const REPLAY_TTL_S = 600;       // > the 300s tolerance window
const TIMESTAMP_TOLERANCE_S = 300;

// In-memory replay cache fallback (single instance): eventId → expiry ms.
const memSeen = new Map<string, number>();

/** Timing-safe HMAC-SHA256 verification over the raw request body. */
export function verifyHmacSha256(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Normalize common "sha256=" prefixes.
  const provided = signature.replace(/^sha256=/i, '').trim();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Reject timestamps outside ±300s (replay / clock-skew / forgery guard). */
export function timestampWithinTolerance(timestampS: number, nowS = Math.floor(Date.now() / 1000)): boolean {
  return Math.abs(nowS - timestampS) <= TIMESTAMP_TOLERANCE_S;
}

/** Has this event-id been seen inside the replay window? Marks it seen if not. */
async function isReplay(connectionId: string, eventId: string): Promise<boolean> {
  const key = `${REPLAY_NS}:${connectionId}:${eventId}`;
  const redis = getRedisClient();
  if (!redis) {
    const now = Date.now();
    // GC expired entries opportunistically.
    for (const [k, exp] of memSeen) if (exp < now) memSeen.delete(k);
    if (memSeen.has(key)) return true;
    memSeen.set(key, now + REPLAY_TTL_S * 1000);
    return false;
  }
  try {
    // SET NX EX → returns null if the key already existed (= replay).
    const set = await redis.set(key, '1', 'EX', REPLAY_TTL_S, 'NX');
    return set === null;
  } catch (err) {
    logger.warn({ connectionId, err: (err as Error).message }, 'prism:webhook replay-cache fail');
    return false; // fail-open on cache error; EXTRACT dedupe is the backstop
  }
}

/**
 * Resolve the tenant + connection from the webhook secret reference SERVER-SIDE.
 * The webhook secret is bound to exactly one connection; we never trust org_id
 * from the payload. Returns null when no active connection owns this secret.
 */
async function resolveTenant(
  secretRef: string,
): Promise<{ orgId: string; connectionId: string; platform: string } | null> {
  const { rows } = await query<{ org_id: string; connection_id: string; platform: string }>(
    `SELECT c.org_id, c.id AS connection_id, c.platform
       FROM prism_connections c
       JOIN prism_sync_state s ON s.connection_id = c.id AND s.org_id = c.org_id
      WHERE s.webhook_secret_ref = $1
        AND c.deleted_at IS NULL
        AND c.status = 'active'
      LIMIT 1`,
    [secretRef],
  ).catch(() => ({ rows: [] as { org_id: string; connection_id: string; platform: string }[] }));
  const r = rows[0];
  return r ? { orgId: r.org_id, connectionId: r.connection_id, platform: r.platform } : null;
}

export interface WebhookInput {
  rawBody: Buffer;
  signature: string;
  /** Per-tenant HMAC secret (resolved from Secret Manager by the caller). */
  secret: string;
  /** Secret Manager ref used to resolve the owning connection server-side. */
  secretRef: string;
  /** Source's event timestamp (epoch seconds) — for the ±300s tolerance check. */
  timestampS: number;
  /** Unique event id from the source — the replay-cache key. */
  eventId: string;
  /** record_type the webhook carries (e.g. 'response' | 'review'). */
  recordType: RecordType;
  /** Extracts source records from the parsed body. Returns [{ sourceRecordId, payload, observedAt }]. */
  parse: (body: unknown) => { sourceRecordId: string; payload: unknown; observedAt?: string | null }[];
}

export interface WebhookOutcome {
  ok: boolean;
  reason?: 'bad_signature' | 'stale_timestamp' | 'replay' | 'unknown_tenant';
  orgId?: string;
  connectionId?: string;
  records?: RawRecord[];
}

/**
 * Verify, dedupe, and parse a webhook into RawRecords ready for EXTRACT append.
 * Returns the records (ingress: 'webhook'); the engine appends them onto the same
 * per-connection extract queue a poll uses (push/poll are indistinguishable
 * downstream). Does NOT itself write — the engine owns the append.
 */
export async function receiveWebhook(input: WebhookInput): Promise<WebhookOutcome> {
  if (!verifyHmacSha256(input.rawBody, input.signature, input.secret)) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (!timestampWithinTolerance(input.timestampS)) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const tenant = await resolveTenant(input.secretRef);
  if (!tenant) return { ok: false, reason: 'unknown_tenant' };

  if (await isReplay(tenant.connectionId, input.eventId)) {
    return { ok: true, reason: 'replay', orgId: tenant.orgId, connectionId: tenant.connectionId, records: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    parsed = input.rawBody.toString('utf8');
  }

  const records: RawRecord[] = input.parse(parsed).map((r) =>
    toRawRecord({
      org_id: tenant.orgId,
      job_id: '',                       // sync ingress: engine assigns the live sync job id
      connection_id: tenant.connectionId,
      source_platform: tenant.platform,
      record_type: input.recordType,
      source_record_id: r.sourceRecordId,
      payload: r.payload,
      ingress: 'webhook',
      poison: false,
      source_observed_at: r.observedAt ?? null,
    }),
  );

  logger.info(
    { orgId: tenant.orgId, connectionId: tenant.connectionId, eventId: input.eventId, count: records.length },
    'prism:webhook verified',
  );
  return { ok: true, orgId: tenant.orgId, connectionId: tenant.connectionId, records };
}
