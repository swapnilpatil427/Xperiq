/**
 * Prism rate limiting — Redis token bucket per connection_id.
 *
 * EXTRACT is source-throttled; each connector declares its limits in
 * `ConnectorMeta.rateLimit` and workers on one connection share ONE bucket
 * keyed by `connection_id` (the source credential), NOT org_id
 * (operations-runbook.md §2.4). An atomic Lua TAKE refills lazily by elapsed
 * time and only succeeds if a token is available, so retries draw from the same
 * bucket — a retry storm can never exceed the source's published limit.
 *
 * Graceful degradation: when REDIS_URL is unset we fall back to an in-memory
 * bucket (single-instance only, same semantics) so local dev still paces.
 */
import type { ConnectorMeta } from '../../types/prism';
import { getRedisClient } from '../redis';
import logger from '../logger';

const NS = 'prism:rl';

// Atomic refill + take. KEYS[1]=bucket hash. ARGV: capacity, refillPerSec, now(ms), cost.
// Returns { allowed(0|1), waitMs }. Stored fields: tokens, ts (ms).
const TAKE_LUA = `
local key   = KEYS[1]
local cap   = tonumber(ARGV[1])
local rate  = tonumber(ARGV[2])
local now   = tonumber(ARGV[3])
local cost  = tonumber(ARGV[4])

local data   = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then tokens = cap; ts = now end

-- Lazy refill by elapsed time.
local elapsed = math.max(0, now - ts) / 1000.0
tokens = math.min(cap, tokens + elapsed * rate)
ts = now

local allowed = 0
local waitMs = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  local deficit = cost - tokens
  waitMs = math.ceil((deficit / rate) * 1000)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', ts)
-- Expire idle buckets so they rebuild cold after Redis loss (DR §3.2).
redis.call('PEXPIRE', key, 600000)
return { allowed, waitMs }
`;

interface BucketSpec {
  capacity: number;
  refillPerSec: number;
}

/** Derive a token bucket from a connector's declared rate limit. Conservative defaults. */
export function bucketFor(meta: ConnectorMeta): BucketSpec {
  const rl = meta.rateLimit ?? {};
  // perSecond is the primary signal; perDay is converted to a steady drip if that's all we have.
  const perSecond = rl.perSecond ?? (rl.perDay ? rl.perDay / 86_400 : 5);
  const refillPerSec = Math.max(0.01, perSecond);
  // Capacity = ~1s of burst, but at least 1 token so a slow daily-budget source can still move.
  const capacity = Math.max(1, Math.ceil(refillPerSec));
  return { capacity, refillPerSec };
}

// ── In-memory fallback (single instance) ──────────────────────────────────────
const memBuckets = new Map<string, { tokens: number; ts: number }>();

function takeInMemory(key: string, spec: BucketSpec, cost: number): { allowed: boolean; waitMs: number } {
  const now = Date.now();
  const b = memBuckets.get(key) ?? { tokens: spec.capacity, ts: now };
  const elapsed = Math.max(0, now - b.ts) / 1000;
  b.tokens = Math.min(spec.capacity, b.tokens + elapsed * spec.refillPerSec);
  b.ts = now;
  if (b.tokens >= cost) {
    b.tokens -= cost;
    memBuckets.set(key, b);
    return { allowed: true, waitMs: 0 };
  }
  const waitMs = Math.ceil(((cost - b.tokens) / spec.refillPerSec) * 1000);
  memBuckets.set(key, b);
  return { allowed: false, waitMs };
}

/**
 * Attempt to take `cost` tokens from the connection's bucket.
 * Returns whether allowed + how long to wait before a token is available.
 */
export async function take(
  connectionId: string,
  spec: BucketSpec,
  cost = 1,
): Promise<{ allowed: boolean; waitMs: number }> {
  const key = `${NS}:${connectionId}`;
  const redis = getRedisClient();
  if (!redis) return takeInMemory(key, spec, cost);

  try {
    const res = (await redis.eval(
      TAKE_LUA,
      1,
      key,
      String(spec.capacity),
      String(spec.refillPerSec),
      String(Date.now()),
      String(cost),
    )) as [number, number];
    return { allowed: res[0] === 1, waitMs: res[1] };
  } catch (err) {
    logger.warn({ connectionId, err: (err as Error).message }, 'prism:ratelimit redis fail → allow');
    // Fail-open in degraded mode is acceptable: the connector's own withRetry +
    // source 429 handling is the backstop, and we prefer progress over a wedged job.
    return { allowed: true, waitMs: 0 };
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Block until a token is available, then consume it (paces an EXTRACT loop). */
export async function acquire(connectionId: string, spec: BucketSpec, cost = 1): Promise<void> {
  for (;;) {
    const { allowed, waitMs } = await take(connectionId, spec, cost);
    if (allowed) return;
    await sleep(Math.min(waitMs || 50, 5_000));
  }
}

/**
 * Drain the bucket on a source 429/503 — treat a throttle as proof the bucket
 * was too generous (operations-runbook.md §2.4). Best-effort.
 */
export async function drain(connectionId: string): Promise<void> {
  const key = `${NS}:${connectionId}`;
  const redis = getRedisClient();
  if (!redis) { memBuckets.set(key, { tokens: 0, ts: Date.now() }); return; }
  try {
    await redis.hset(key, 'tokens', '0', 'ts', String(Date.now()));
  } catch (err) {
    logger.warn({ connectionId, err: (err as Error).message }, 'prism:ratelimit drain fail');
  }
}
