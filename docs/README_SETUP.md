# Experient — Production Setup Guide

## Architecture

- **Frontend**: React + Vite + Tailwind (`app/`) — served via Firebase Hosting
- **Backend**: Node.js Express API (`backend/`) — deployed to Fly.io
- **Agents Service**: Python FastAPI (`agents/`) — AI pipeline + Crystal Intelligence — deployed to Fly.io
- **Auth**: Clerk (JWT-verified in backend, ClerkProvider in frontend)
- **Database**: Postgres (primary datastore for all services)
- **Cache / Streams**: Redis (rate limiting, Crystal SSE, response stream consumer)
- **AI**: OpenRouter (server-side only — key never exposed to browser)
- **Checkpoints**: Local filesystem in dev; GCS bucket in production (set `CHECKPOINT_BUCKET`)
- **Monitoring**: Prometheus + Grafana + Loki (local Docker Compose)

---

## Prerequisites

- Node.js 22+ (backend + app)
- Python 3.11+ (agents service)
- Docker + Docker Compose (local Postgres + Redis + monitoring)
- Fly.io CLI: `brew install flyctl`
- Firebase CLI (hosting only): `npm install -g firebase-tools`

---

## Step 1 — Clone and Install

```bash
git clone <repo-url>
cd Experient

# Frontend
cd app && npm install && cd ..

# Backend
cd backend && npm install && cd ..

# Agents
cd agents && python -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
```

---

## Step 2 — Create Clerk Application

1. Go to https://clerk.com → sign up (free tier is sufficient)
2. Create a new application → name it "Experient"
3. Enable Email/Password and any social providers you want
4. In Clerk Dashboard → API Keys:
   - Copy **Publishable Key** (`pk_live_...`)
   - Copy **Secret Key** (`sk_live_...`)

---

## Step 3 — Get OpenRouter API Key

1. Go to https://openrouter.ai → sign up
2. Dashboard → API Keys → Create key
3. Free tier includes `meta-llama/llama-3.1-8b-instruct:free`

---

## Step 4 — Start Local Infrastructure

```bash
docker-compose up -d   # Postgres on :5432, Redis on :6379, Grafana on :3000, Prometheus on :9090
```

Run the Postgres migrations:

```bash
# Applies all migrations in supabase/migrations/ in order
for f in supabase/migrations/*.sql; do
  echo "Applying $f..."
  psql "$DATABASE_URL" -f "$f"
done
```

---

## Step 5 — Configure Environment Variables

### Root `.env` (shared secrets — loaded by both backend and agents)

```env
# Postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/experient

# Redis
REDIS_URL=redis://localhost:6379

# AI
OPENROUTER_API_KEY=sk-or-v1-...

# Internal service-to-service auth (CHANGE THIS IN PRODUCTION)
AGENTS_INTERNAL_KEY=dev-internal-key-change-in-prod

# Clerk
CLERK_SECRET_KEY=sk_live_...
```

### `app/.env`

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=http://localhost:3001
```

### `backend/.env` (if separate from root)

```env
NODE_ENV=development
ALLOWED_ORIGIN=http://localhost:5173
SKIP_AUTH=true   # LOCAL DEV ONLY — never set in production
```

### `agents/.env` (if separate from root)

```env
AGENTS_ENV=development   # set to 'production' for Fly.io deploy
DATABASE_URL=postgres://postgres:postgres@localhost:5432/experient
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=sk-or-v1-...
AGENTS_INTERNAL_KEY=dev-internal-key-change-in-prod

# Checkpoint blob storage (local dev uses /tmp/checkpoints)
# In production, set GCS_BUCKET and GCS_SERVICE_ACCOUNT_KEY:
# CHECKPOINT_BUCKET=gs://your-bucket/checkpoints
# GCS_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

---

## Step 6 — Run Locally

Open three terminals:

```bash
# Terminal 1 — Backend API
cd backend && npm start          # Listens on :3001

# Terminal 2 — Agents service
cd agents && .venv/bin/python -m uvicorn main:app --reload --port 8000

# Terminal 3 — Frontend
cd app && npm run dev            # Listens on :5173
```

---

## Step 7 — Deploy to Fly.io (Backend + Agents)

### Backend

```bash
cd backend
fly launch                     # First time only
fly secrets set DATABASE_URL=... REDIS_URL=... CLERK_SECRET_KEY=... \
  OPENROUTER_API_KEY=... AGENTS_INTERNAL_KEY=<strong-random-secret>
fly deploy
```

### Agents Service

```bash
cd agents
fly launch                     # First time only
fly secrets set DATABASE_URL=... REDIS_URL=... OPENROUTER_API_KEY=... \
  AGENTS_INTERNAL_KEY=<same-key-as-backend> \
  CHECKPOINT_BUCKET=gs://your-bucket/checkpoints \
  GCS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
fly secrets set AGENTS_ENV=production
fly deploy
```

### Frontend

```bash
cd app
VITE_API_URL=https://your-backend.fly.dev npm run build
firebase deploy --only hosting
```

---

## Step 8 — GCS Checkpoint Bucket Setup (Production)

Crystal Intelligence checkpoints are written to GCS in production.

1. Create a GCS bucket: `gs://your-org-experient-checkpoints`
2. Create a service account with `Storage Object Admin` on the bucket
3. Download the JSON key
4. Set the env vars on the agents Fly.io deployment:
   ```bash
   fly secrets set CHECKPOINT_BUCKET=gs://your-org-experient-checkpoints/checkpoints
   fly secrets set GCS_SERVICE_ACCOUNT_KEY="$(cat service-account-key.json)"
   ```

---

## Environment Variable Summary

### `app/.env`

| Variable | Required | Description |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `VITE_API_URL` | Yes | Backend API base URL |

### Backend (Fly.io secrets or `.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key for JWT verification |
| `AGENTS_INTERNAL_KEY` | Yes | Shared secret with agents service — **change from default!** |
| `ALLOWED_ORIGIN` | Yes | CORS allowed origin (frontend URL) |
| `REDIS_URL` | Recommended | Redis for rate limiting |
| `OPENROUTER_API_KEY` | Yes | OpenRouter for AI generation |
| `SKIP_AUTH` | No | `true` for local dev only — never in production |
| `NODE_ENV` | No | Set to `production` on Fly.io |

### Agents Service (Fly.io secrets or `.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `REDIS_URL` | Yes | Redis for SSE streaming and response consumer |
| `OPENROUTER_API_KEY` | Yes | OpenRouter for Crystal AI and insight LLMs |
| `AGENTS_INTERNAL_KEY` | Yes | Must match backend value — **change from default!** |
| `AGENTS_ENV` | Yes | Set to `production` on Fly.io |
| `CHECKPOINT_BUCKET` | Production | GCS bucket URI for Crystal checkpoints |
| `GCS_SERVICE_ACCOUNT_KEY` | Production | JSON service account key for GCS access |

---

## Production Security Checklist

- [ ] `AGENTS_INTERNAL_KEY` is a strong random secret (not `dev-internal-key-change-in-prod`)
- [ ] `SKIP_AUTH` is NOT set (or explicitly `false`) on any production service
- [ ] `DATABASE_URL` uses SSL (`?sslmode=require` for managed Postgres)
- [ ] GCS bucket has restrictive IAM (only the agents service account has write access)
- [ ] Clerk JWT signing key is rotated after any suspected compromise
- [ ] Redis is not publicly accessible (use private networking on Fly.io)

---

## Local Monitoring

- **Grafana**: http://localhost:3000 (admin/admin) — dashboards for request rates, error rates, AI latency
- **Prometheus**: http://localhost:9090 — raw metrics scrape
- **Loki**: structured logs from backend + agents (via Grafana Explore)

---

## Running Tests

```bash
# Frontend
cd app && PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run

# Python (agents)
cd agents && .venv/bin/pytest
```
