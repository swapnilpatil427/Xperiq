// Redis singleton for the backend service.
// Returns null when REDIS_URL is not set (graceful degradation).
const Redis = require('ioredis');

let _client     = null;
let _lastErrMsg = null;   // deduplicate repeated connection errors

// Connection errors that are safe to silence — they mean Redis is just not up yet.
const SILENT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET']);

function getRedisClient() {
  if (!process.env.REDIS_URL) return null;
  if (!_client) {
    _client = new Redis(process.env.REDIS_URL, {
      enableOfflineQueue:   false,   // fail-fast; callers must catch
      maxRetriesPerRequest: 1,
      retryStrategy:        (times) => Math.min(times * 500, 5000),
    });
    _client.on('error', (err) => {
      const msg  = err?.message || err?.code || String(err);
      const code = err?.code    || '';
      // Suppress noisy but harmless reconnect errors
      if (SILENT_CODES.has(code) || msg.includes('ECONNREFUSED')) return;
      // Deduplicate — don't flood the console with the same message
      if (msg !== _lastErrMsg) {
        console.warn('[redis] error:', msg);
        _lastErrMsg = msg;
      }
    });
    _client.on('ready', () => { _lastErrMsg = null; });
  }
  return _client;
}

module.exports = { getRedisClient };
