# Backend Developer Skills Guide

Reference for writing new backend code. All patterns here reflect the actual codebase — no guessing required.

---

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5.x (strict mode)
- **Framework**: Express 4
- **Database**: PostgreSQL via `pg` library
- **Cache / Streams**: Redis via `ioredis`
- **Validation**: Zod v4
- **TypeScript execution**: `tsx` — TypeScript runs directly, no compile step in dev or prod
- **Logging**: Pino (structured JSON) via `lib/logger.ts`
- **Metrics**: `prom-client` via `lib/metrics.ts`
- **Auth**: Clerk (JWT verification via `@clerk/backend`)

---

## Project Structure

```
src/
  types/index.ts       — ALL domain types + Express Request augmentation
  lib/                 — Infrastructure
    db.ts              — Postgres pool + typed query()
    logger.ts          — Pino structured logger
    httpError.ts       — clientError() / serverError() helpers
    validate.ts        — Zod validation middleware factory
    agentsClient.ts    — HTTP client for the Python agents service (only place that calls it)
    metrics.ts         — Prometheus counters + histograms
    redis.ts           — Redis client
    rbac.ts            — RBAC permission check helpers
  middleware/          — Express middleware
    auth.ts            — requireAuth (Clerk JWT → req.orgId, req.userId)
    requireRole.ts     — requireRole('analyst') role-gated access
    rateLimiter.ts     — Sliding-window rate limiter (Redis or in-memory)
    httpLogger.ts      — Request logging middleware
    requestId.ts       — Injects req.id (unique request ID)
  routes/              — Express route handlers (one file per domain)
  schemas/             — Zod schemas (shared across routes)
  eventEngine/         — Background event processor
  triggers/            — Event trigger handlers
  index.ts             — Express app entry point: pool setup, middleware mount, router mount
```

---

## How to Add a New Route File

Full working example with all TypeScript patterns:

```typescript
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { clientError, serverError } from '../lib/httpError';
import { query } from '../lib/db';
import { validate } from '../lib/validate';
import logger from '../lib/logger';
import { toError } from '../types';
import { z } from 'zod';

const router = express.Router();

// GET — list items scoped to the authenticated org
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query<{ id: string; name: string }>(
      'SELECT id, name FROM my_table WHERE org_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [req.orgId]
    );
    res.json({ items: rows });
  } catch (err: unknown) {
    serverError(res, toError(err));
  }
});

// POST — create with Zod validation
const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

router.post('/', requireAuth, requireRole('analyst'), validate(createSchema), async (req: Request, res: Response): Promise<void> => {
  const { name, description } = req.body as z.infer<typeof createSchema>;
  try {
    const { rows: [created] } = await query<{ id: string }>(
      'INSERT INTO my_table (org_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [req.orgId, name, description ?? null]
    );
    logger.info({ orgId: req.orgId, id: created.id }, 'my_table:created');
    res.status(201).json({ id: created.id });
  } catch (err: unknown) {
    serverError(res, toError(err));
  }
});

// DELETE — soft delete by ID
router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const { rowCount } = await query(
      'UPDATE my_table SET deleted_at = NOW() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [id, req.orgId]
    );
    if (!rowCount) return clientError(res, 404, 'Not found');
    res.json({ ok: true });
  } catch (err: unknown) {
    serverError(res, toError(err));
  }
});

export default router;
```

### Register the router in `src/index.ts`

```typescript
import myFeatureRouter from './routes/myFeature';
// ...
app.use('/api/my-feature', apiLimiter, myFeatureRouter);
```

---

## Express Request Properties (Custom)

Available on ALL requests **after `requireAuth`**:

```typescript
req.orgId   // string — Clerk org ID (always present after requireAuth)
req.userId  // string — Clerk user ID (always present after requireAuth)
req.id      // string | undefined — unique request ID (set by requestId middleware)
req.orgRole // string | null | undefined — Clerk org role (only after requireRole)

// SCIM routes only:
req.scimOrgId     // string | undefined
req.scimTokenId   // string | undefined
```

All augmentations are declared in `src/types/index.ts` — do not redeclare locally.

---

## Error Handling Patterns

```typescript
import { clientError, serverError } from '../lib/httpError';
import { toError } from '../types';

// Client errors (4xx) — message is shown to the API caller:
return clientError(res, 400, 'Name is required');
return clientError(res, 404, 'Survey not found');
return clientError(res, 409, 'Name already in use');
return clientError(res, 403, 'Insufficient role');

// Server errors (5xx) — logs full error internally, returns safe generic message:
serverError(res, toError(err));

// With extra context logged:
serverError(res, toError(err), { orgId: req.orgId, surveyId: id });

// Postgres-specific error codes:
interface PgError extends Error { code?: string; }
try {
  await query(/* ... */);
} catch (err: unknown) {
  if ((err as PgError).code === '23505') return clientError(res, 409, 'Already exists');
  if ((err as PgError).code === 'P0001') return clientError(res, 400, (err as Error).message); // DB trigger
  serverError(res, toError(err));
}
```

`serverError` never leaks stack traces or DB messages to the caller — always safe to use on any unhandled error.

---

## Database Patterns

Import: `import { query } from '../lib/db';`

The `query<T>` function is generically typed. `T` is the shape of a single result row.

```typescript
// List query — typed rows
const { rows } = await query<{ id: string; title: string }>(
  'SELECT id, title FROM surveys WHERE org_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
  [req.orgId]
);
// rows: Array<{ id: string; title: string }>

// Single row — destructure immediately
const { rows: [survey] } = await query<Survey>(
  'SELECT * FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
  [id, req.orgId]
);
if (!survey) return clientError(res, 404, 'Survey not found');

// Insert with RETURNING
const { rows: [created] } = await query<{ id: string }>(
  'INSERT INTO my_table (org_id, title) VALUES ($1, $2) RETURNING id',
  [req.orgId, title]
);

// Update — check rowCount to detect "not found"
const { rowCount } = await query(
  'UPDATE surveys SET title = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3',
  [title, id, req.orgId]
);
if (!rowCount) return clientError(res, 404, 'Survey not found');

// Soft delete — NEVER hard-delete surveys
await query(
  'UPDATE surveys SET deleted_at = NOW() WHERE id = $1 AND org_id = $2',
  [id, req.orgId]
);

// Queries always auto-record duration metrics (> 500ms triggers a slow-query warning).
```

**Always use `$1`, `$2`, ... placeholders. Never string interpolation or template literals in SQL.**

---

## Zod Validation Middleware

```typescript
import { validate } from '../lib/validate';
import { z } from 'zod';

const createSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  count:       z.number().int().min(1).max(100).default(20),
});

router.post('/', requireAuth, validate(createSchema), async (req: Request, res: Response): Promise<void> => {
  // req.body is now typed as z.infer<typeof createSchema> and has been parsed/coerced
  const { title, description, count } = req.body as z.infer<typeof createSchema>;
});
```

On validation failure `validate()` returns `400` with `{ error: "<first message>", errors: ["<all messages>"] }` automatically — no extra code needed.

---

## Middleware Usage

```typescript
// Authentication — required on all protected routes:
router.get('/', requireAuth, handler);

// Role-based access — always runs AFTER requireAuth:
// Hierarchy: 'viewer' (rank 1) < 'analyst' (rank 2) < 'admin' (rank 3)
router.post('/',   requireAuth, requireRole('analyst'), handler); // analyst or admin
router.delete('/', requireAuth, requireRole('admin'),   handler); // admin only

// Rate limiters are applied at the app mount level in index.ts — do NOT add per-route.
// apiLimiter — standard limit for all /api/* routes
// aiLimiter  — stricter limit for LLM-heavy endpoints (insights, copilot, ai routes)
```

---

## Logging

Import: `import logger from '../lib/logger';`

```typescript
// Info — normal operations
logger.info({ orgId: req.orgId, surveyId: id }, 'survey:created');

// Warn — unexpected but non-fatal conditions
logger.warn({ orgId: req.orgId, ms: elapsed }, 'slow:operation');

// Error — caught exceptions (use serverError() for HTTP handlers; logger directly for background tasks)
logger.error({ err: err.message, orgId: req.orgId }, 'operation:failed');
```

Rules:
- Always include `orgId` for traceability.
- Use structured key-value objects — never format strings (`'Created survey ' + id` is wrong).
- Never log sensitive data: passwords, tokens, raw PII, full SQL query results.

---

## Agents Client (Crystal / AI service calls)

Import: `import * as agentsClient from '../lib/agentsClient';`

This is the **only** place in the Node.js backend that communicates with the Python agents service. Never call the agents URL directly from a route.

```typescript
// Survey creation orchestration
const run = await agentsClient.startOrchestration({ orgId, userId, intent, surveyTypeId });

// Poll orchestration status
const status = await agentsClient.getRunStatus(runId, orgId);

// Cancel an orchestration
await agentsClient.cancelOrchestration(runId, orgId);

// Trigger insight pipeline (fire-and-forget — do not await full pipeline)
await agentsClient.triggerInsightGeneration({ surveyId, orgId, runId, trigger: 'manual' });

// Cross-survey group insights
await agentsClient.generateGroupInsights(runId, tagIds, surveyIds, orgId);

// Generate synthetic sample responses
const { responses } = await agentsClient.generateSampleResponses({
  surveyId, orgId, surveyTitle, questions, count: 20, personaMix: 'realistic',
});

// Copilot question edits
const result = await agentsClient.refineRun(runId, { orgId, message, questions });

// Add skip logic
await agentsClient.addSkipLogic(runId, { orgId, request: 'if NPS < 7 ask why' });
```

All methods are typed. Timeouts are pre-configured (12s default, 90s for LLM calls).

---

## Type Conventions

All domain types live in `src/types/index.ts`. Import from there:

```typescript
import type { Survey, Insight, AgentRun, SurveyTag, RunStatus } from '../types';
import { toError } from '../types';
```

Key types: `Survey`, `Question`, `SurveyResponse`, `Insight`, `AgentRun`, `GroupInsight`, `SurveyTag`, `Workflow`, `Notification`, `Alert`, `Org`, `OrgMember`, `Seat`.

Conventions:
- Use `Record<string, unknown>` for JSONB object columns.
- Use `unknown[]` for JSONB array columns (e.g. `citations_json`).
- Use `string | null` for nullable text columns.
- Use `toError(err)` from `../types` to safely convert `unknown` catches to `Error`.
- Prefer explicit return types on exported functions and route handlers (`: Promise<void>`).
- Do not redeclare Request augmentation locally — it is global via `types/index.ts`.

---

## Security Rules — Never Violate

1. **Parameterized queries only**: `query('WHERE id = $1', [id])` — never string interpolation or template literals in SQL.
2. **Soft-delete surveys**: `UPDATE surveys SET deleted_at = NOW()` — never `DELETE FROM surveys`.
3. **`SKIP_AUTH=true` is local dev only**: validated and rejected in production in `index.ts`.
4. **`AGENTS_INTERNAL_KEY` default rejected in production**: validated at startup in `index.ts`.
5. **Org scoping on every query**: always include `AND org_id = $N` — never return cross-org data.
6. **Never log sensitive data**: no passwords, tokens, PII, or raw API keys.
7. **All write operations through `requireAuth`**: no unauthenticated writes.

---

## Common Postgres Error Codes

| Code    | Meaning                        | Correct response       |
|---------|--------------------------------|------------------------|
| `23505` | Unique constraint violation    | 409 Conflict           |
| `23503` | Foreign key violation          | 400 Bad Request        |
| `P0001` | Raised exception (DB trigger)  | 400 with `err.message` |
| `42P01` | Table not found (schema drift) | 500 (bug)              |

---

## Available Domain Types Quick Reference

```typescript
// Status enums
type SurveyStatus   = 'draft' | 'active' | 'paused' | 'closed';
type RunStatus      = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
type InsightLayer   = 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';
type WorkflowStatus = 'active' | 'paused' | 'draft';

// Permission actions (for RBAC)
type PermissionAction = 'survey:read' | 'survey:write' | 'survey:delete'
  | 'survey:insights:read' | 'survey:insights:generate' | 'dashboard:read'
  | 'alerts:manage' | 'workflows:manage' | 'users:manage' | 'billing:manage';
```
