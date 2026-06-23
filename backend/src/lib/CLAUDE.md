# Backend Libraries (TypeScript)

All files are `.ts`. Import using ES module syntax — compiled to CommonJS by tsconfig.

## db.ts
Postgres pool singleton. Generic typed query.
```ts
import { query } from './lib/db';
const { rows } = await query<{ id: string }>('SELECT id FROM surveys WHERE id = $1', [id]);
```

## openrouter.ts
AI API client wrapping OpenRouter (multi-model gateway).
Default model: GPT-4o (configurable via env).
Usage: `await openrouter.chat(messages, options)`

## metrics.ts
Prometheus counters. Import named counters and call `.inc({ label })` or `.observe({ label }, value)`.

## logger.ts
Pino structured logger. Use instead of console.log.
```ts
import logger from './lib/logger';
logger.info({ surveyId }, 'survey created');
logger.error({ err: err.message }, 'db error');
```

## redis.ts
ioredis client singleton. Import `{ redis }`.

## agentsClient.ts
HTTP client for the Python agents service (CrystalOS). Exports typed functions:
`startOrchestration`, `refineRun`, `generateGroupInsights`, `crystalStream`, etc.

## httpError.ts
`clientError(res, message, status?)` — 4xx responses
`serverError(res, err, message?)` — 500 responses with logging
