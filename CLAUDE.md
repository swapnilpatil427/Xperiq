# Experient — Project Root

## What this is
Experient is an AI-powered experience intelligence platform. It lets organizations create surveys, collect responses, and generate AI-powered insights. Think of it as a modern enterprise XM platform challenger with dimensional intelligence built in.

## Monorepo layout
- `app/` — React frontend (Vite + Tailwind v4)
- `functions/` — Node.js backend (Express API + Cloud Functions)
- `supabase/` — SQL migrations for local Postgres
- `docker/` — Local Postgres and Redis containers
- `TRACKER.md` — Live task tracker (always check before suggesting next steps)
- `PRODUCT_PLAN.md` — 20-sprint roadmap
- `SURVEY_DATA_MODEL.md` — Full Postgres schema reference

## Tech stack
- **Frontend**: React 18, React Router v6, Tailwind v4, Framer Motion, shadcn/UI, Clerk auth
- **Backend**: Node.js (Express), Postgres (pg), Redis (ioredis), OpenRouter AI
- **Local dev**: Docker Compose (Postgres + Redis), Firebase emulators optional
- **Deploy**: Fly.io (functions), Firebase hosting (app)

## Key rules
- All user-visible strings → `locales/en.js`, accessed via `t('key')` — NEVER hardcode in JSX
- `SKIP_AUTH=true` is local dev only, never production
- Never commit `.env` or `.env.*` files
- Soft-delete surveys (`deleted_at` timestamp), never hard-delete
- All API writes go through Cloud Functions; reads can use Firestore subscriptions or REST

## Local dev
```
docker-compose up -d          # Start Postgres + Redis
cd functions && npm start      # Start API on :5001
cd app && npm run dev          # Start Vite dev server on :5173
```
