// Redis singleton for the backend service.
// Returns null when REDIS_URL is not set (graceful degradation).
import Redis from 'ioredis';

// Connection errors that are safe to silence — they mean Redis is just not up yet.
const SILENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET']);

let _client: Redis | null     = null;
let _lastErrMsg: string | null = null;   // deduplicate repeated connection errors

// Eagerly connect at module-load time when REDIS_URL is configured.
//
// The lazy pattern (create on first getRedisClient() call) causes a startup race:
// multiple requests arriving before the first 'ready' event all fail with
// "Stream isn't writeable" because enableOfflineQueue:false rejects commands
// sent before the connection is established. Eager init gives the client time
// to connect during server startup before the first request arrives.
//
// dotenv is loaded in index.js before any route modules are required, so
// REDIS_URL is available here at require time.
if (process.env.REDIS_URL) {
  _client = new Redis(process.env.REDIS_URL, {
    enableOfflineQueue:   false,   // fail-fast; callers guard with client.status check
    maxRetriesPerRequest: 1,
    retryStrategy:        (times) => Math.min(times * 500, 5000),
  });
  _client.on('error', (err: NodeJS.ErrnoException) => {
    const msg  = err?.message ?? err?.code ?? String(err);
    const code = err?.code    ?? '';
    // Suppress noisy but harmless reconnect errors
    if (SILENT_CODES.has(code) || msg.includes('ECONNREFUSED')) return;
    // Deduplicate — don't flood the console with the same message
    if (msg !== _lastErrMsg) {
      console.warn('[redis] error:', msg);
      _lastErrMsg = msg;
    }
  });
  _client.on('ready',  () => { _lastErrMsg = null; console.info('[redis] connected'); });
  _client.on('reconnecting', () => console.info('[redis] reconnecting…'));
}

function getRedisClient(): Redis | null {
  return _client;  // null when REDIS_URL not set
}

export { getRedisClient };
