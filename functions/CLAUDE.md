# Experient — Backend (Cloud Functions / Express API)

## What this is
Node.js Express API deployed as Cloud Functions (GCP) or run locally.
Handles all write operations, AI calls, and business logic.
Frontend reads go direct to Firestore; writes come here.

## Stack
- Node.js + Express
- Postgres via `pg` (db.js) — primary datastore for local/prod surveys, responses
- Firebase Firestore — real-time subscriptions for the frontend
- Redis via ioredis — sliding-window rate limiter (falls back to in-memory if no REDIS_URL)
- OpenRouter — AI model gateway (GPT-4o, Claude, etc.)

## Directory structure
```
src/
  index.js          # Express app entry; mounts all routers
  routes/
    local/          # Postgres-backed CRUD routes (surveys, responses, templates, etc.)
    ai.js           # AI endpoints (generate-survey, refine-survey, analyze-insights)
    insights.js     # Insights aggregation
    public.js       # Public survey fill endpoint (no auth)
    responses.js    # Response submission and retrieval
    surveys.js      # Survey management
    templates.js    # Template library
    workflows.js    # Workflow automation
    admin.js        # Admin utilities
  lib/
    db.js           # Postgres pool singleton
    openrouter.js   # AI API client (OpenRouter)
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
- `SKIP_AUTH=true` — Bypasses auth for LOCAL DEV ONLY

## Postgres schema highlights
See SURVEY_DATA_MODEL.md at project root for full schema.
Key tables: surveys, responses, templates, workflows, orgs
surveys.questions: JSONB column storing array of question objects
surveys.status: CHECK constraint — 'draft' | 'active' | 'paused' | 'closed'
