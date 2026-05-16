// Sliding-window rate limiter.
// Key: <ip>:<surveyId> — limits submissions per respondent IP per survey.
//
// Store selection (env-driven):
//   REDIS_URL set → Redis sorted-set sliding window (works across all cloud instances)
//   REDIS_URL absent → in-memory Map (local dev only — does NOT share state across pods)

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_HITS  = 5;

// ── Redis store ───────────────────────────────────────────────────────────────

function makeRedisStore(redisUrl) {
  const Redis = require('ioredis');
  const client = new Redis(redisUrl, { lazyConnect: true, enableOfflineQueue: false });

  // Register error listener to prevent Node.js "Unhandled error event" process crash.
  // Log only once — ioredis retries on a backoff schedule and floods the console otherwise.
  let _warned = false;
  client.on('error', (err) => {
    if (!_warned) {
      console.warn(`[rateLimiter] Redis unavailable (${err.message}) — falling back to in-memory rate limiting (not shared across processes)`);
      _warned = true;
    }
  });

  client.connect().catch(() => {}); // errors surfaced via 'error' listener above

  return {
    async increment(key, windowMs) {
      const now    = Date.now();
      const cutoff = now - windowMs;
      const pipe   = client.pipeline();
      pipe.zremrangebyscore(key, '-inf', cutoff);
      pipe.zadd(key, now, `${now}-${Math.random()}`);
      pipe.zcard(key);
      pipe.pexpire(key, windowMs);
      const results = await pipe.exec();
      const count   = results[2][1]; // zcard result
      const resetAt = now + windowMs;
      return { count, resetAt };
    },
  };
}

// ── In-memory store ───────────────────────────────────────────────────────────

function makeMemoryStore() {
  const map = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of map) { if (v.resetAt < now) map.delete(k); }
  }, 30 * 60 * 1000).unref();

  return {
    async increment(key, windowMs) {
      const now = Date.now();
      let entry = map.get(key);
      if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + windowMs };
        map.set(key, entry);
      }
      entry.count += 1;
      return { count: entry.count, resetAt: entry.resetAt };
    },
  };
}

const store = process.env.REDIS_URL
  ? makeRedisStore(process.env.REDIS_URL)
  : makeMemoryStore();

if (!process.env.REDIS_URL) {
  console.warn('[rateLimiter] REDIS_URL not set — using in-memory store (run `npm run infra` or `npm start` to start Redis)');
}

// ── Middleware factory ────────────────────────────────────────────────────────

function makeRateLimiter({ windowMs = WINDOW_MS, max = MAX_HITS, keyFn } = {}) {
  return async function rateLimiter(req, res, next) {
    const key = keyFn ? keyFn(req) : req.ip;
    try {
      const { count, resetAt } = await store.increment(key, windowMs);

      res.set('X-RateLimit-Limit',     String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
      res.set('X-RateLimit-Reset',     String(Math.ceil(resetAt / 1000)));

      if (count > max) {
        const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
          error: 'rate_limited',
          message: 'Too many submissions. Please wait before trying again.',
          retryAfter,
        });
      }

      next();
    } catch (err) {
      // Store error (e.g. Redis down) — fail open to avoid blocking legitimate respondents.
      console.error('[rateLimiter] store error, failing open:', err.message);
      next();
    }
  };
}

// Response submission: 5 per IP per survey per 15 min (public endpoint).
const responseSubmitLimiter = makeRateLimiter({
  keyFn: (req) => `submit:${req.ip}:${req.params.surveyId}`,
});

// ── Dev bypass ────────────────────────────────────────────────────────────────
// When SKIP_AUTH=true the whole app is running behind a single dev identity.
// All requests share one IP (127.0.0.1) so any meaningful rate limit would be
// exhausted almost immediately during active development.
// Rate limiting is a production concern — skip it entirely in local dev.
const _skipRateLimit = process.env.SKIP_AUTH === 'true';

function _noopMiddleware(_req, _res, next) { next(); }

// General API: 500 requests per org per 15 min (authenticated endpoints).
// Key includes orgId (from auth) rather than raw IP so multi-tenant prod
// instances don't share a pool, and dev is keyed to the dev-org identity.
const apiLimiter = _skipRateLimit
  ? _noopMiddleware
  : makeRateLimiter({
      max: 500,
      keyFn: (req) => `api:${req.orgId || req.ip}`,
    });

// AI endpoints: 30 requests per org per 15 min (LLM calls are expensive).
const aiLimiter = _skipRateLimit
  ? _noopMiddleware
  : makeRateLimiter({
      max: 30,
      keyFn: (req) => `ai:${req.orgId || req.ip}`,
    });

module.exports = { makeRateLimiter, responseSubmitLimiter, apiLimiter, aiLimiter };
