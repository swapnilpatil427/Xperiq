# Experient — Backend (Express API)

## What this is
Node.js Express API (strict TypeScript). Handles all write operations, AI calls, and business logic. All data is Postgres-backed.

## Stack
- Node.js + Express + **TypeScript** (`strict: true`, compiled with `tsx` — no build step in dev)
- Postgres via `pg` (`db.ts`) — primary datastore
- Redis via ioredis — sliding-window rate limiter (falls back to in-memory if no REDIS_URL)
- OpenRouter — AI model gateway (GPT-4o, Claude, etc.)

## TypeScript setup
- `tsconfig.json` — `strict: true`, `module: commonjs`, `esModuleInterop: true`
- `tsx` replaces `node` — no compile step; `npm run dev` runs `tsx watch src/index.ts`
- `npm run typecheck` — runs `tsc --noEmit` to check for type errors (no output)
- `npm run build` — compiles to `dist/` (for production deploys)
- All domain types in `src/types/index.ts`; Express Request augmentation there too

## Directory structure
```
src/
  index.ts          # Express app entry; all imports at top (env.ts loaded third)
  env.ts            # dotenv loader — imported as side-effect BEFORE any module reads process.env
  instrument.ts     # Sentry init
  polyfill-fetch.ts # global fetch polyfill for Node < 18
  types/
    index.ts        # All domain types + Express Request augmentation (req.orgId, req.userId, etc.)
  routes/           # All route files (.ts); each exports `default router`
    surveys.ts      # Survey CRUD + publish/pause/close
    responses.ts    # Response submission and retrieval
    insights.ts     # Insight pipeline trigger, list, feedback, topics
    ai.ts           # AI endpoints (generate-survey, refine-survey)
    copilot.ts      # Crystal AI Q&A chat
    templates.ts    # Template library
    workflows.ts    # Workflow automation
    tags.ts         # Survey tag CRUD + survey-tag mappings
    survey-groups.ts # Group insight generation + SSE + group Crystal
    ... (29 route files total + webhooks/clerk.ts)
  lib/
    db.ts           # Postgres pool singleton — query<T>()
    agentsClient.ts # HTTP client for the Python agents service
    openrouter.ts   # AI API client (OpenRouter)
    httpError.ts    # clientError() / serverError() helpers
    metrics.ts      # Prometheus counters
    logger.ts       # Pino structured logging
    redis.ts        # ioredis client singleton
    ... (35 lib files total)
  middleware/
    auth.ts         # requireAuth — extracts req.orgId + req.userId from Clerk JWT
    requireRole.ts  # Role-based access (admin/analyst/viewer)
    requirePermission.ts # Fine-grained permission checks
    rateLimiter.ts  # Sliding-window rate limiter
    httpLogger.ts   # Request logging + Prometheus HTTP metrics
    requestId.ts    # req.id UUID injection
    scimAuth.ts     # SCIM 2.0 bearer-token auth
  schemas/          # Zod validation schemas (13 files); each exports named schema + inferred type
  data/
    systemTemplates.ts  # Built-in survey template definitions
  eventEngine/
    index.ts        # Event engine entry point
    processor.ts    # Stream event processor
  triggers/
    autoAnalyze.ts
    onNewResponse.ts
  __tests__/        # Vitest tests (still .js — excluded from tsconfig)
```

## Key patterns
- All routes use `requireAuth` middleware — extracts `req.orgId` and `req.userId`
- `trust proxy: 1` set in index.ts (needed behind load balancers for correct req.ip)
- Soft-delete on surveys: `deleted_at` timestamp, all queries filter `AND deleted_at IS NULL`
- SQL injection prevention: Always parameterized queries (`$1`, `$2`, etc.) — never string interpolation
- Route handlers must explicitly type their return: `async (req: Request, res: Response): Promise<void>`
- Catch blocks: `catch (err: unknown)` — use `err instanceof Error ? err : new Error(String(err))`
- Rate limiting: `REDIS_URL` env var enables Redis store; otherwise in-memory (not suitable for multi-instance)

## Environment variables
- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string (optional, in-memory fallback)
- `OPENROUTER_API_KEY` — AI API key
- `AGENTS_INTERNAL_KEY` — Shared secret with the Python agents service. Default `dev-internal-key-change-in-prod` is rejected in production.
- `CLERK_SECRET_KEY` — Clerk JWT verification key
- `ALLOWED_ORIGIN` — CORS allowed origin (frontend URL)
- `SKIP_AUTH=true` — Bypasses auth for LOCAL DEV ONLY

## Crystal Intelligence (AI) routes
`routes/insights.ts` exposes the Crystal/AI endpoints:
- `POST /api/insights/:surveyId/generate` — trigger insight pipeline via `agentsClient.ts`
- `GET  /api/insights/:surveyId/crystal` — Crystal SSE stream (streamed ReAct loop response)
- `GET  /api/insights/:surveyId/topics` — flat topic list with sort/window params
- `GET  /api/insights/:surveyId/topics/hierarchy` — topic hierarchy grouped by theme
- `GET  /api/insights/:surveyId/crystal/history` — Crystal conversation history
- `DELETE /api/insights/:surveyId/crystal/history` — clear Crystal history

## Postgres schema highlights
See docs/SURVEY_DATA_MODEL.md for full schema.
Key tables: surveys, responses, templates, workflows, orgs, insights, survey_topics, crystal_threads, agent_runs, survey_tags, survey_tag_mappings, group_insight_runs, group_insights
- `surveys.questions`: JSONB array of question objects
- `surveys.status`: CHECK constraint — 'draft' | 'active' | 'paused' | 'closed'
- `insights`: per-survey agentic insight records (layer/category/headline/trust_score)
- `survey_topics`: canonical topic registry per survey per run
- `crystal_threads`: Crystal AI conversation threads (7-day TTL via `last_active_at`)
- `agent_runs`: pipeline run tracking with `status`, `heartbeat_at`, `stream_events`
- `survey_tags` + `survey_tag_mappings`: tag-based survey grouping (max 5 tags per survey)
- `group_insight_runs` + `group_insights`: cross-survey group insight pipeline
