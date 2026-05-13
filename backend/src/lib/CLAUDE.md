# Backend Libraries

## db.js
Postgres connection pool singleton. Import and call `db.query(sql, params)`.
```js
const db = require('./db');
const { rows } = await db.query('SELECT * FROM surveys WHERE id = $1', [id]);
```
Connection string from `DATABASE_URL` env var.

## openrouter.js
AI API client wrapping OpenRouter (multi-model gateway).
Default model: GPT-4o (configurable via env).
Usage: `await openrouter.chat(messages, options)`

## metrics.js
Prometheus counters for observability.
Key counters: surveysCreated, responsesSubmitted, aiCallsTotal.
Import and call `.inc({ label: value })`.

## logger.js
Structured JSON logger. Use instead of console.log for production logging.
```js
const log = require('./logger');
log.info({ event: 'survey_created', surveyId: id });
log.error({ event: 'db_error', error: err.message });
```

## rateLimiter.js
Express middleware for rate limiting.
- Uses Redis sorted-set sliding window when `REDIS_URL` is set
- Falls back to in-memory Map when no Redis (dev-only, not suitable for multi-instance)
- Sets `Retry-After` and `X-RateLimit-*` headers on 429 responses
- Import: `const rateLimiter = require('./middleware/rateLimiter')`
