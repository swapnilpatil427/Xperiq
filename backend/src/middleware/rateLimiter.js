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
  client.connect().catch((err) => console.error('[rateLimiter] Redis connect error:', err));

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
  console.warn('[rateLimiter] REDIS_URL not set — using in-memory store. Not suitable for multi-instance deployments.');
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

// General API: 200 requests per IP per 15 min (authenticated endpoints).
const apiLimiter = makeRateLimiter({
  max: 200,
  keyFn: (req) => `api:${req.ip}`,
});

// AI endpoints: 20 requests per IP per 15 min (LLM calls are expensive).
const aiLimiter = makeRateLimiter({
  max: 20,
  keyFn: (req) => `ai:${req.ip}`,
});

module.exports = { makeRateLimiter, responseSubmitLimiter, apiLimiter, aiLimiter };
