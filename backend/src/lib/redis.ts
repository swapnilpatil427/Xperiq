// Redis connections for the backend service.
//
// Two dedicated connections to the same REDIS_URL — standard practice when mixing
// sub-millisecond cache ops with long-blocking commands (XREADGROUP, SUBSCRIBE):
//
//   getRedisClient()         — permission cache, rate limits, XADD/PUBLISH/INCR
//   getRedisBlockingClient() — Event Engine stream consumer, notification SSE subs
//
// Returns null for both when REDIS_URL is not set (graceful degradation).

import Redis, { type RedisOptions } from 'ioredis';

const SILENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET']);

let _cacheClient: Redis | null    = null;
let _blockingClient: Redis | null = null;
let _lastErrMsg: string | null    = null;

const RETRY_STRATEGY = (times: number) => Math.min(times * 500, 5000);

const BASE_OPTS: RedisOptions = {
  enableOfflineQueue:   false,
  connectTimeout:       2_000,
  retryStrategy:        RETRY_STRATEGY,
};

function attachListeners(client: Redis, role: 'cache' | 'blocking'): void {
  client.on('error', (err: NodeJS.ErrnoException) => {
    const msg  = err?.message ?? err?.code ?? String(err);
    const code = err?.code    ?? '';
    if (SILENT_CODES.has(code) || msg.includes('ECONNREFUSED')) return;
    const line = `[redis:${role}] error: ${msg}`;
    if (line !== _lastErrMsg) {
      console.warn(line);
      _lastErrMsg = line;
    }
  });
  client.on('ready', () => {
    _lastErrMsg = null;
    console.info(`[redis:${role}] connected`);
  });
  client.on('reconnecting', () => console.info(`[redis:${role}] reconnecting…`));
}

// Eager connect at module load (dotenv runs in index.ts before routes import this).
if (process.env.REDIS_URL) {
  const url = process.env.REDIS_URL;

  _cacheClient = new Redis(url, {
    ...BASE_OPTS,
    connectionName:       'experient-cache',
    maxRetriesPerRequest: 1,
    commandTimeout:       250, // fail fast → permission checks fall through to Postgres
  });
  attachListeners(_cacheClient, 'cache');

  _blockingClient = new Redis(url, {
    ...BASE_OPTS,
    connectionName:       'experient-blocking',
    maxRetriesPerRequest: null, // required for XREADGROUP BLOCK / SUBSCRIBE
    // No commandTimeout or socketTimeout — BLOCK 5000 must be allowed to idle.
  });
  attachListeners(_blockingClient, 'blocking');
}

function getRedisClient(): Redis | null {
  return _cacheClient;
}

function getRedisBlockingClient(): Redis | null {
  return _blockingClient;
}

export { getRedisClient, getRedisBlockingClient };
