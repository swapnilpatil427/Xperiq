# Experient — Project Root

## What this is
Experient is an AI-powered experience intelligence platform. It lets organizations create surveys, collect responses, and generate AI-powered insights. Think of it as a modern enterprise XM platform challenger with dimensional intelligence built in.

## Monorepo layout
- `app/` — React frontend (Vite + Tailwind v4)
- `backend/` — Node.js backend (Express API + Cloud Functions); also holds Firebase config
- `supabase/` — SQL migrations for local Postgres
- `docker/` — Local Postgres, Redis, Prometheus, Grafana, Loki containers
- `docs/` — Product docs: `TRACKER.md` (task tracker), `PRODUCT_PLAN.md` (roadmap), `SURVEY_DATA_MODEL.md` (schema reference), `README_SETUP.md` (setup guide)

## Tech stack
- **Frontend**: React 18, React Router v6, Tailwind v4, Framer Motion, shadcn/UI, Clerk auth
- **Backend**: Node.js (Express), Postgres (pg), Redis (ioredis), OpenRouter AI
- **Local dev**: Docker Compose (Postgres + Redis + monitoring), Firebase emulators optional
- **Deploy**: Fly.io (backend), Firebase hosting (app)

## Key rules
- All user-visible strings → `locales/en.js`, accessed via `t('key')` — NEVER hardcode in JSX
- `SKIP_AUTH=true` is local dev only, never production
- Never commit `.env` or `.env.*` files
- Soft-delete surveys (`deleted_at` timestamp), never hard-delete
- All API writes go through Cloud Functions; reads can use Firestore subscriptions or REST
- Always check `docs/TRACKER.md` before suggesting next steps

## Local dev
```
docker-compose up -d          # Start Postgres + Redis + monitoring
cd backend && npm start        # Start API on :3001
cd app && npm run dev          # Start Vite dev server on :5173
```

## Firebase deploy
```
cd backend && firebase deploy  # Deploys hosting + functions + firestore rules
```
