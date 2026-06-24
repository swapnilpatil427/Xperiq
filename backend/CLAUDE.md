# Experient — Backend (Cloud Functions / Express API)

## What this is
Node.js Express API run locally and deployed to production.
Handles all write operations, AI calls, and business logic.
All data is Postgres-backed (no Firestore).

## Stack
- Node.js + Express
- Postgres via `pg` (db.js) — primary datastore
- Redis via ioredis — sliding-window rate limiter (falls back to in-memory if no REDIS_URL)
- OpenRouter — AI model gateway (GPT-4o, Claude, etc.)

## Directory structure
```
src/
  index.js          # Express app entry; mounts all routers
  routes/           # All Postgres-backed routes (no subdirectory)
    surveys.js      # Survey CRUD + publish/pause/close
    responses.js    # Response submission and retrieval
    insights.js     # Insight pipeline trigger, list, feedback, topics
    ai.js           # AI endpoints (generate-survey, refine-survey)
    copilot.js      # Crystal AI Q&A chat
    templates.js    # Template library
    workflows.js    # Workflow automation
    orgProfile.js   # Org profile CRUD
    orgs.js         # Org management
    members.js      # Team member management
    runs.js         # Agent run status/events
    public.js       # Public survey fill endpoint (no auth)
  lib/
    db.js           # Postgres pool singleton
    agentsClient.js # HTTP client for the Python agents service
    openrouter.js   # AI API client (OpenRouter)
    httpError.js    # clientError() / serverError() helpers
    metrics.js      # Prometheus counters
    logger.js       # Structured logging
  middleware/
    auth.js         # requireAuth middleware — verifies Bearer token
    rateLimiter.js  # Sliding-window rate limiter (Redis or in-memory)
    httpLogger.js   # Request logging
  data/             # Seed data / reference JSON
```

## Key patterns
- All routes use `requireAuth` middleware — extracts `req.orgId` and `req.userId`
- `trust proxy: 1` set in index.js (needed behind GCP/Cloud Run load balancers for correct req.ip)
- Soft-delete on surveys: `deleted_at` timestamp, all queries filter `AND deleted_at IS NULL`
- SQL injection prevention: Always use parameterized queries (`$1`, `$2`, etc.) — never string interpolation
- Rate limiting: `REDIS_URL` env var enables Redis store; otherwise in-memory (not suitable for multi-instance)

## Environment variables
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string (optional, in-memory fallback)
- `OPENROUTER_API_KEY` — AI API key
- `AGENTS_INTERNAL_KEY` — Shared secret with the Python agents service (must match). Default `dev-internal-key-change-in-prod` is rejected in production by startup validation in `index.js`.
- `CLERK_SECRET_KEY` — Clerk JWT verification key
- `ALLOWED_ORIGIN` — CORS allowed origin (frontend URL)
- `SKIP_AUTH=true` — Bypasses auth for LOCAL DEV ONLY

## Crystal Intelligence (AI) routes
`routes/insights.js` exposes the Crystal/AI endpoints:
- `POST /api/insights/:surveyId/generate` — trigger insight pipeline via `agentsClient.js`
- `GET  /api/insights/:surveyId/crystal` — Crystal SSE stream (streamed ReAct loop response)
- `GET  /api/insights/:surveyId/topics` — flat topic list with sort/window params
- `GET  /api/insights/:surveyId/topics/hierarchy` — topic hierarchy grouped by theme
- `GET  /api/insights/:surveyId/crystal/history` — Crystal conversation history
- `DELETE /api/insights/:surveyId/crystal/history` — clear Crystal history

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

## Testing

Every code change requires a corresponding test change:
- **New function or route** → add unit/integration tests in `src/__tests__/`
- **Modified behavior** → update existing tests to match new behavior; delete tests for removed behavior
- **Bug fix** → add a regression test that would have caught the bug (e.g. the `created_at` vs `generated_at` column name bug needs a test that asserts the query contains `generated_at`)

Test files mirror `src/` structure. Use `.js` (not `.ts`) — they run via the `setup.cjs` hook.

Run tests:
```bash
nvm use 22 && npx vitest run          # all tests
nvm use 22 && npx vitest run src/__tests__/visual.test.js  # single file
```

Mock patterns:
- DB: inject into `require.cache[DB_PATH]` via `fakeMod()`
- Auth middleware: inject `requireAuth` that sets `req.orgId = 'o1'`
- HTTP: use `light-my-request` `inject()` against an Express app
- External libs (pdfmake, pptxgenjs): use `deps.load` injection pattern in exporters
