# Experient — Backend (Express API, TypeScript)

## What this is
Express API written in **TypeScript**, run directly via `tsx` (no build step) under
PM2. Handles all write operations, AI calls, and business logic. All data is
Postgres-backed (no Firestore). For authoring conventions see `backend/SKILLS.md`.

## Stack
- Node.js 20+ · Express · **TypeScript (strict) via `tsx`** (no compile step; `npm run build` = `tsc` typecheck only)
- Postgres via `pg` (`src/lib/db.ts`) — primary datastore
- Redis via ioredis (`src/lib/redis.ts`) — sliding-window rate limiter (in-memory fallback)
- OpenRouter (`src/lib/openrouter.ts`) — AI model gateway
- Zod (request validation) · Pino (logging) · prom-client (metrics) · Clerk (JWT auth) · Sentry

## Directory structure
```
src/
  index.ts          # Express app entry; mounts all routers (see "Routers" below)
  routes/           # ~31 route files (.ts), plus routes/webhooks/clerk.ts (raw-body, mounted before express.json())
  lib/              # ~38 infra modules (.ts) — db, agentsClient, openrouter, httpError, metrics, logger,
                    #   redis, rbac, alertEngine, workflowEngine, exporters, connectors, … (dir is authoritative)
  middleware/       # auth, requireRole, requirePermission, rateLimiter, httpLogger, requestId, scimAuth
  schemas/          # Zod request schemas (alerts, …)
  test/setup.cjs    # registers the tsx CJS hook so .test.js files can require() .ts source
  data/             # Seed data / reference JSON
```

## Routers (mounted in `src/index.ts`)
`/api/public`, `/api/surveys` (surveys + responses + insights), `/api/insights`,
`/api/templates`, `/api/ai` (aiLimiter), `/api/workflows`, `/api/org-profile`,
`/api/orgs`, `/api/orgs/me`, `/api/users`, `/api/roles`, `/api/departments`,
`/api/groups`, `/api/survey-tags`, `/api/group-insights`, `/api/scim-tokens`,
`/api/sso-mappings`, `/api/seats`, `/api/audit-logs`, `/api/alerts`,
`/api/dashboard`, `/api/dashboard-configs`, `/api/visual`,
`/api/notification-channels`, `/scim/v2` (bearer-token auth, **no** apiLimiter),
`/api/copilot`, `/api/runs`, `/api/experience`, `/api/notifications`,
`/api/admin` (proxy → CrystalOS, see below). Plus `/webhooks/clerk`, `/api/health`, `/api/metrics`.

## Two outbound paths to CrystalOS (port 8001)
- **`lib/agentsClient.ts`** — typed client for orchestration/insights/Crystal calls.
- **`/api/admin` proxy** (`routes/admin.ts`) — forwards `/api/admin/*` to `AGENTS_URL`,
  gated by Clerk `requireAuth` then injects `X-Internal-Key: AGENTS_INTERNAL_KEY`
  before forwarding (15s timeout → 504). Powers the Crystal admin UI.

## Key patterns
- All routes use `requireAuth` middleware — extracts `req.orgId` and `req.userId`
- `trust proxy: 1` set in index.js (needed behind GCP/Cloud Run load balancers for correct req.ip)
- Soft-delete on surveys: `deleted_at` timestamp, all queries filter `AND deleted_at IS NULL`
- SQL injection prevention: Always use parameterized queries (`$1`, `$2`, etc.) — never string interpolation
- Rate limiting: `REDIS_URL` env var enables Redis store; otherwise in-memory (not suitable for multi-instance)

## Environment variables
> **Full list:** `docs/ENV_VARS.md` (canonical). **Adding a `process.env.X`? Add it there AND to the matching `.env.example` in the same PR.** Key ones below.
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string (optional, in-memory fallback)
- `OPENROUTER_API_KEY` — AI API key
- `AGENTS_INTERNAL_KEY` — Shared secret with the Python agents service (must match). Default `dev-internal-key-change-in-prod` is rejected in production by startup validation in `index.js`.
- `CLERK_SECRET_KEY` — Clerk JWT verification key. When absent, backend runs in dev mode (all requests authenticated as dev-user/dev-org). No SKIP_AUTH env var needed.
- `ALLOWED_ORIGIN` — CORS allowed origin (frontend URL)

## Crystal Intelligence (AI) routes
`routes/insights.ts` exposes the Crystal/AI endpoints:
- `POST /api/insights/:surveyId/generate` — trigger insight pipeline via `agentsClient.ts`
- `POST /api/insights/:surveyId/crystal` — Crystal SSE stream (proxied to CrystalOS skill-first path)
- `GET  /api/insights/:surveyId/topics` (+ `/topics/hierarchy`) — topic list / hierarchy
- `GET|DELETE /api/insights/:surveyId/crystal/history` — Crystal conversation history
- `POST|GET /api/insights/:surveyId/crystal/proposals` — **action-proposal outcome tracking**.
  POST upserts on `(org_id, proposal_key)` with `status ∈ {emitted,accepted,dismissed,succeeded,failed}`
  (idempotent); GET lists recent proposals for analytics. Backed by `crystal_action_proposals`.

## Postgres schema highlights
See docs/SURVEY_DATA_MODEL.md for full schema.
Key tables: surveys, responses, templates, workflows, orgs, insights, survey_topics, crystal_threads, agent_runs
- `surveys.questions`: JSONB array of question objects
- `surveys.status`: CHECK constraint — 'draft' | 'active' | 'paused' | 'closed'
- `insights`: per-survey agentic insight records (layer/category/headline/trust_score)
- `survey_topics`: canonical topic registry per survey per run
- `crystal_threads`: Crystal AI conversation threads (7-day TTL via `last_active_at`)
- `agent_runs`: pipeline run tracking with `status`, `heartbeat_at`, `stream_events`
- `notification_preferences` + `notification_events`: notification infrastructure (channels: in_app/email/push)
- `crystal_action_proposals`: outcome funnel for Crystal action proposals (emitted→accepted→succeeded/failed/dismissed)

## Testing

Every code change requires a corresponding test change:
- **New function or route** → add unit/integration tests in `src/__tests__/`
- **Modified behavior** → update existing tests to match new behavior; delete tests for removed behavior
- **Bug fix** → add a regression test that would have caught the bug (e.g. the `created_at` vs `generated_at` column name bug needs a test that asserts the query contains `generated_at`)

Test files mirror `src/` structure. Tests are `.js` (not `.ts`) — they `require()`
`.ts` source via the tsx CJS hook registered in `src/test/setup.cjs`.

Run tests (Node 22):
```bash
nvm use 22 && npm test                          # all tests (vitest run)
nvm use 22 && npx vitest run src/__tests__/x.test.js  # single file
```

Mock patterns:
- DB: inject into `require.cache[DB_PATH]` via `fakeMod()`
- Auth middleware: inject `requireAuth` that sets `req.orgId = 'o1'`
- HTTP: use `light-my-request` `inject()` against an Express app
- External libs (pdfmake, pptxgenjs): use `deps.load` injection pattern in exporters

## Keeping these docs in sync
- New router → register in `src/index.ts` AND add to the "Routers" list (note any non-standard limiter/auth).
- New Crystal-facing endpoint → list it under "Crystal Intelligence routes"; new tables → "Postgres schema highlights".
- New outbound call to CrystalOS → goes through `lib/agentsClient.ts` (typed) or the `/api/admin` proxy (`X-Internal-Key`); document which.
- All source is `.ts` via `tsx` (no build step); tests are `.js` via the tsx hook. Any doc referencing a `.js` source file is stale.
