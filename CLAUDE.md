# Experient — Project Root

## What this is
Experient is an AI-powered experience intelligence platform. It lets organizations create surveys, collect responses, and generate AI-powered insights. Think of it as a modern enterprise XM platform challenger with dimensional intelligence built in.

## Monorepo layout
- `app/` — React frontend (Vite + Tailwind v4)
- `backend/` — Node.js backend (Express API + Cloud Functions); also holds Firebase config
- `crystalos/` — **CrystalOS** — Python agents service (FastAPI + LangGraph + skill runtime). Powers Crystal AI, insight pipeline, all LLM capabilities. See `crystalos/CLAUDE.md`.
- `supabase/` — SQL migrations for local Postgres
- `docker/` — Local Postgres, Redis, Prometheus, Grafana, Loki containers
- `docs/` — Product docs: `TRACKER.md` (task tracker), `PRODUCT_PLAN.md` (roadmap), `SURVEY_DATA_MODEL.md` (schema reference), `README_SETUP.md` (setup guide); `docs/agent-framework/` — CrystalOS design docs

## Tech stack
- **Frontend**: React 19, React Router v7, TypeScript (strict), Tailwind v4, Framer Motion, shadcn/UI, Clerk auth
- **Backend**: Express + TypeScript (run via `tsx`), Postgres (pg), Redis (ioredis), OpenRouter AI
- **CrystalOS**: Python FastAPI + LangGraph + skill runtime (skills as SKILL.md + EVALS.md)
- **Local dev**: Docker Compose (Postgres + Redis + monitoring)
- **Deploy**: Fly.io (backend + CrystalOS), Firebase hosting (app)

## Key rules
- All user-visible strings → `locales/en.ts`, accessed via `t('key')` — NEVER hardcode in JSX
- When `CLERK_SECRET_KEY` is absent the backend runs in dev mode (dev-user/dev-org) — no `SKIP_AUTH` env var needed
- Never commit `.env` or `.env.*` files
- **New env var → update `.env.example` + `docs/ENV_VARS.md` in the same PR.** Any new
  `process.env.X` (backend), `import.meta.env.VITE_X` (app), or `os.getenv("X")` (CrystalOS)
  must be added to the matching `.env.example` (root / `app/` / `backend/`) and to the canonical
  list in `docs/ENV_VARS.md`. `docs/ENV_VARS.md` is the source of truth for every key.
- Soft-delete surveys (`deleted_at` timestamp), never hard-delete
- All writes go through the Express API; reads are REST. **No Firestore** — Postgres-only
- Always check `docs/TRACKER.md` before suggesting next steps

## How the three layers collaborate (architecture pattern)
The platform is three layers joined by stable contracts; AI capability advances by
extending all three **in lockstep** along the same seam. Keep each layer's
`CLAUDE.md`/`SKILLS.md` in sync when you touch a seam.

```
Frontend (app)  ⇄  Backend (Express)  ⇄  CrystalOS (skill runtime)
   renders /          proxies /              reasons /
   executes           persists               proposes
```

- **CrystalOS proposes, the app executes.** CrystalOS never mutates app state. It
  emits structured outputs (answers + normalized `action_proposals`). The frontend
  renders proposals as confirm-cards and only mutates on explicit user confirm.
- **The backend is the bridge + system of record.** Frontend↔CrystalOS never talk
  directly: calls go through Express (typed `agentsClient` or the `/api/admin`
  `X-Internal-Key` proxy), and the backend persists results (incl. the proposal
  outcome funnel).
- **The closed loop is the unlock.** propose (CrystalOS) → confirm + execute
  (frontend → backend API) → record outcome (backend) → feed outcomes back into
  skill quality/examples (CrystalOS). Each turn also emits telemetry the next tier
  learns from.
- **State stays consistent via explicit invalidation.** There is no shared cache;
  after a Crystal-driven mutation the frontend invalidates the affected resource
  (DataBus) so open views refetch — never leave the UI unaware of a mutation.

**Extension pattern — to add an AI capability, move along one seam end-to-end:**
1. a **skill** (CrystalOS) that decides/produces the structured output,
2. a **contract** (proposal type / endpoint) the backend exposes and persists,
3. a **handler** (frontend) that previews → confirms → executes → invalidates,
4. an **outcome record** that loops back to skill quality.
Skipping any step breaks the loop (silent mutation, stale UI, or unmeasured AI).

## Local dev
```
docker-compose up -d          # Start Postgres + Redis + monitoring
cd backend && npm start        # Start API on :3001
cd app && npm run dev          # Start Vite dev server on :5173
cd crystalos && make run-dev  # Start CrystalOS agents service on :8001
```

## Firebase deploy
```
cd backend && firebase deploy  # Deploys hosting + functions + firestore rules
```
