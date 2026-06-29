# Environment Variables — canonical reference

The single source of truth for every env var Xperiq reads. **Rule:** when you add a
`process.env.X` / `import.meta.env.VITE_X` / `os.getenv("X")`, add it here **and** to the matching
`.env.example` in the same PR. (See the "Keeping this in sync" rule in the root `CLAUDE.md`.)

Files: `./.env.example` (root — backend + CrystalOS + docker-compose all read the **root** `.env`),
`app/.env.example` (Vite frontend), `backend/.env.example` (backend-local overrides). CrystalOS
reads the root `.env` (and optional `crystalos/.env`).

Legend: **[req]** required to run · **[opt]** optional (feature/integration) · **[def]** has a safe default.

---

## Core (backend + CrystalOS) — root `.env`
| Var | Status | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | [req] | `postgresql://postgres:postgres@localhost:5432/xperiq` | Postgres connection |
| `REDIS_URL` | [req prod / opt dev] | `redis://localhost:6379` | Rate limits, caches, streams, credit balance cache |
| `OPENROUTER_API_KEY` | [req] | — | LLM gateway |
| `AGENTS_INTERNAL_KEY` | [req] | `dev-internal-key-change-in-prod` | Shared secret: backend ↔ CrystalOS ↔ internal metering API. **Change in prod.** |
| `AGENTS_URL` | [def] | `http://localhost:8001` | Where the backend reaches CrystalOS |
| `AGENTS_ENV` | [def] | `dev` | `dev` \| `dev-paid` \| `production` |
| `NODE_ENV` | [def] | — | `production` gates startup validation + `/api/metrics` IP allow |
| `PORT` | [def] | `3001` | Backend port |
| `LOG_LEVEL` / `LOG_PRETTY` | [opt] | — | Log verbosity / pretty output |
| `ALLOWED_ORIGIN` / `FRONTEND_URL` | [opt] | — | CORS origin |

## Auth (Clerk) — optional; absent ⇒ dev mode (dev-user/dev-org)
| Var | Status | File | Purpose |
|---|---|---|---|
| `CLERK_SECRET_KEY` | [opt] | root | Backend JWT verification; absent ⇒ DEV_MODE |
| `CLERK_WEBHOOK_SECRET` | [opt] | root | Clerk webhook signature |
| `VITE_CLERK_PUBLISHABLE_KEY` | [opt] | app | Frontend Clerk; absent ⇒ demo mode |

> `SKIP_AUTH` is **deprecated** — the dev bypass now keys on the absence of `CLERK_SECRET_KEY` (DEV_MODE). Do not add it.

## Billing / Stripe — optional (manual grants work without it). Backend only.
| Var | Status | Value | Purpose |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | [opt] | `sk_test_…` / `sk_live_…` | Stripe API (hosted Checkout). Also `cd backend && npm i stripe`. |
| `STRIPE_WEBHOOK_SECRET` | [opt] | `whsec_…` | Webhook signature (`/webhooks/stripe`) |
| `APP_URL` | [def] | request origin → `http://localhost:5173` | Checkout success/cancel redirects |

(No publishable key — Checkout is hosted. See `docs/test-plan/credit-system-and-stripe.md`.)

## Credit system — all optional, defaults in `backend/src/lib/creditPlans.ts`
| Var | Default | Purpose |
|---|---|---|
| `CREDIT_DEFAULT_PLAN` | `free` | Plan for new orgs w/o a profile (set `enterprise` in dev to skip the free cap) |
| `CREDIT_ALLOWANCE_{FREE,STARTER,GROWTH,ENTERPRISE,PLATFORM}` | 0/1500/12000/80000/500000 | Monthly credit allowance per plan |
| `CREDIT_COST_{INSIGHT_RUN,CRYSTAL_TURN,XO_FUSION,BROADCAST_EMAIL,BROADCAST_SMS}` | 50/15/200/2/8 | Per-action credit cost |
| `CREDIT_COST_{REFRESH,MANUAL_QUICK,MANUAL_EXPERT,CUSTOM_BASE}` | 8/15/40/25 | Insight Pipeline v2 per-run costs (platform fallback; survey/org settings may override). `CUSTOM_BASE` is the Custom Analysis base; cost scales by corpus tier via `resolveCustomCost()` — ≤500 resp = base, ≤2000 = base×2, >2000 = base×3 (25/50/75 at the default base) |
| `CREDIT_COST_{AUTOMATED_CHECKPOINT,AUTOMATED_REPORT}` | 5/15 | Insight Pipeline v2 automated run costs — checkpoint-only vs +tiered report (CrystalOS `credit_preflight`; survey/org settings may override) |
| `REFRESH_DAILY_LIMIT` | 5 | Max "Refresh" button presses per survey per day (backend; evaluated at startup) |
| `MANUAL_DAILY_RUN_LIMIT` | 10 | Max Expert + Quick manual insight runs per survey per day (backend; evaluated at startup) |
| `CREDIT_PRICE_{STARTER,GROWTH,ENTERPRISE,PLATFORM}` | 49/299/1499/0 | Plan list price (USD) |
| `CREDIT_FREE_LIFETIME_GRANT` | 225 | One-time free-tier grant |
| `CREDIT_PERIOD_DAYS` | 30 | Allowance period length |
| `CREDIT_BALANCE_CACHE_TTL` | 10 | Redis balance-cache TTL (0 = disable) |
| `CREDIT_LEDGER_RETENTION_MONTHS` | 18 | Partition retention |
| `COST_DOWN_DRY_RUN` | true | Cost-Down Dividend apply is dry-run unless `false` |

## Scheduler / workers — optional, defaults
| Var | Default | Purpose |
|---|---|---|
| `ENABLE_EVENT_ENGINE` | `false` (true in dev script) | Backend event/cron/notification processor |
| `ENABLE_SCHEDULER` | `false` | CrystalOS in-process scheduler |
| `ENABLE_STREAM_CONSUMER` | on when `REDIS_URL` set | CrystalOS progressive-tier consumer |
| `SCHEDULER_PORT` | 8090 | Scheduler service HTTP (`/health`,`/metrics`) |
| `SCHEDULER_TICK_SEC` | 30 | Scheduler tick |
| `SCHEDULER_LEADER_ELECTION` | true | HA leader election (false = single instance) |
| `SCHEDULER_LOCK_KEY` | 728190421 | Advisory-lock key |
| `SCHEDULER_POLL_SEC` | 300 dev / 3600 prod | CrystalOS scheduler poll |
| `INSIGHT_INTERVAL_FREE_MIN` / `INSIGHT_INTERVAL_PAID_MIN` | 120 / 15 | Auto insight cadence |
| `JOB_{EXPIRE_BROADCASTS,RECONCILIATION,COST_DOWN_DIVIDEND,CREDIT_LEDGER_MAINTENANCE,CREDENTIAL_HEALTH}` (+ `_SEC`) | enabled / per-job | Scheduler job toggles + intervals (`JOB_CREDENTIAL_HEALTH_SEC` default 21600 = 6h) |
| `CREDENTIAL_EXPIRY_WARN_DAYS` | 14 | `credential-health` warns + alerts when a key's days-to-expiry drops below this |

## Integrations — optional
| Var(s) | Purpose |
|---|---|
| `NOVU_API_KEY`, `NOVU_SECRET_KEY`, `NOVU_APP_ID`, `VITE_NOVU_APP_ID` | Novu notifications (`VITE_NOVU_APP_ID` is app) |
| `SENDGRID_API_KEY`, `NOTIFICATION_FROM_EMAIL` | Email delivery |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Alternate LLM providers |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` | Jira ticket sync |
| `SERVICENOW_INSTANCE_URL`, `SERVICENOW_USER`, `SERVICENOW_PASSWORD` | ServiceNow connector |
| `SF_INSTANCE_URL`, `SF_ACCESS_TOKEN` | Salesforce connector |

## Observability — optional
| Var(s) | Purpose |
|---|---|
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | Error tracking (backend / app) |
| `LOKI_URL`, `LOKI_USER`, `LOKI_PASSWORD` | Log shipping |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | CrystalOS LLM tracing |
| `ALERTMANAGER_WEBHOOK_URL` | Alertmanager receiver (docker-compose) |

## CrystalOS storage / vision (prod) — optional
`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, `CHECKPOINT_OCI_{BUCKET,NAMESPACE,REGION}`,
`CHECKPOINT_LOCAL_PATH`, `GOOGLE_VISION_KEY`, `VISION_PROVIDER`, `EVENT_BUS`, `PUBSUB_TOPIC`, `WORKER_ID`.

## Frontend — `app/.env.example`
`VITE_API_URL` [req], `VITE_CLERK_PUBLISHABLE_KEY` [opt], `VITE_NOVU_APP_ID` [opt], `VITE_SENTRY_DSN` [opt], `VITE_SUPPORT_URL` [opt — defaults to `https://support.xperiq.ai`; set to `http://localhost:3002` in local dev to link to the local support site], `VITE_INSIGHTS_TRAJECTORY_V1` [opt — defaults `true`; set `false` to hide the Phase 0.5 Insight Pipeline v2 investigation trajectory UI (Enhanced Header Band + Investigation Drawer + Topic Change Bar)].

## CrystalOS advanced tunables — defaults in `crystalos/lib/constants.py`
`INGEST_*`, `SKILL_*`, `THREAD_*`, `REPORT_*`, `HALLUCINATION_*`, `SEMANTIC_CACHE_*`, `MAX_TOKENS_PER_RUN`,
`MAX_DAILY_SPEND_USD`, `ORG_MEMORY_*`, `PRIOR_INSIGHT_*`, `USE_SKILL_RUNTIME`, `AGENTS_HOST`/`AGENTS_PORT`,
`NODE_TIMEOUT_S`. Insight Pipeline v2 (Phase 2/3): `DEFAULT_PRIOR_CHECKPOINT_LOOKBACK`,
`DEFAULT_PRIOR_CHECKPOINT_MAX_AGE_DAYS`, `DEFAULT_STREAM_THRESHOLD`, `DEFAULT_REPORT_REGEN_THRESHOLD`,
`DEFAULT_FULL_CHECKPOINT_THRESHOLD`, `DEFAULT_MEANINGFUL_DELTA_NPS_POINTS`, `DEFAULT_MEANINGFUL_DELTA_TOPIC_PCT`,
`DEFAULT_MANUAL_EXPERT_SNAPSHOTS`, `DEFAULT_MANUAL_QUICK_SAMPLE`, `DEFAULT_MANUAL_QUICK_SNAPSHOTS`,
`DEFAULT_MANUAL_QUICK_WINDOW_DAYS`, `DEFAULT_MANUAL_EXPERT_CHECKPOINT_LOOKBACK`, `DEFAULT_MANUAL_EXPERT_MAX_CORPUS`,
`DEFAULT_MANUAL_EXPERT_FULL_CORPUS_CAP`, `DEFAULT_REFRESH_LOOKBACK_DAYS`, `DEFAULT_REFRESH_MIN_RESPONSE_COUNT`
(platform-constant fallbacks for the survey/org settings COALESCE merge), and `INSIGHT_CHECKPOINTS_V2_ENABLED`
(default `true` — dual-write `insight_checkpoints_v2` alongside the legacy `survey_insight_checkpoints` table during migration).
Insight Pipeline v2 (Phase 6/7): `CREDIT_COST_CUSTOM_BASE` (default `25` — base credit cost for a Custom Analysis run),
`ENABLE_RETENTION_JOB` (default `false` — gate the nightly automated-checkpoint retention/compaction job in `scheduler.py`;
dev no-op unless set to `true`), `RETENTION_BLOB_DROP_DAYS` (default `30` — grace days before a collapsed low-delta
automated checkpoint's `report_blob_ref` is dropped).
All have safe defaults — only set to tune; they don't belong in `.env.example`.

---

## Paste-ready `.env.example` templates

### `./.env.example` (root)
```dotenv
# ── Core ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xperiq
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=
AGENTS_INTERNAL_KEY=dev-internal-key-change-in-prod
AGENTS_URL=http://localhost:8001
AGENTS_ENV=dev
# NODE_ENV=production
# PORT=3001
# LOG_LEVEL=info

# ── Auth (Clerk) — leave blank for dev mode (dev-user/dev-org) ─────────────
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# ── Alternate LLMs (optional) ──────────────────────────────────────────────
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=

# ── Billing / Stripe (optional; manual grants work without) ────────────────
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:5173

# ── Credit system (optional — defaults in creditPlans.ts) ──────────────────
# CREDIT_DEFAULT_PLAN=free          # set 'enterprise' locally to skip the free cap
# COST_DOWN_DRY_RUN=true
# CREDIT_LEDGER_RETENTION_MONTHS=18
# CREDIT_BALANCE_CACHE_TTL=10

# ── Workers / scheduler (optional) ─────────────────────────────────────────
ENABLE_EVENT_ENGINE=true
ENABLE_SCHEDULER=true
ENABLE_STREAM_CONSUMER=true
# SCHEDULER_PORT=8090
# SCHEDULER_LEADER_ELECTION=true
# SCHEDULER_POLL_SEC=3600
# JOB_CREDENTIAL_HEALTH_SEC=21600   # probe integration keys every 6h
# CREDENTIAL_EXPIRY_WARN_DAYS=14    # warn/alert when a key is <14d from expiry
# INSIGHT_INTERVAL_FREE_MIN=120
# INSIGHT_INTERVAL_PAID_MIN=15

# ── Notifications / Novu (optional) ────────────────────────────────────────
# NOVU_API_KEY=
# NOVU_SECRET_KEY=
# NOVU_APP_ID=
# SENDGRID_API_KEY=
# NOTIFICATION_FROM_EMAIL=

# ── CRM / ticketing connectors (optional) ─────────────────────────────────
# JIRA_BASE_URL=
# JIRA_EMAIL=
# JIRA_API_TOKEN=
# JIRA_PROJECT_KEY=
# SERVICENOW_INSTANCE_URL=
# SERVICENOW_USER=
# SERVICENOW_PASSWORD=
# SF_INSTANCE_URL=
# SF_ACCESS_TOKEN=

# ── Observability (optional) ───────────────────────────────────────────────
# SENTRY_DSN=
# LOKI_URL=
# LOKI_USER=
# LOKI_PASSWORD=
# LANGFUSE_PUBLIC_KEY=
# LANGFUSE_SECRET_KEY=
# LANGFUSE_HOST=

# ── CrystalOS storage / vision (prod, optional) ───────────────────────────
# GOOGLE_APPLICATION_CREDENTIALS=
# GOOGLE_CLOUD_PROJECT=
# CHECKPOINT_OCI_BUCKET=
# CHECKPOINT_OCI_NAMESPACE=
# CHECKPOINT_OCI_REGION=
# VISION_PROVIDER=
# GOOGLE_VISION_KEY=
```

### `app/.env.example`
```dotenv
VITE_API_URL=http://localhost:3001
# VITE_CLERK_PUBLISHABLE_KEY=
# VITE_NOVU_APP_ID=
# VITE_SENTRY_DSN=
# VITE_INSIGHTS_TRAJECTORY_V1=true   # set false to disable Phase 0.5 trajectory UI
```

### `backend/.env.example`
Backend reads the **root** `.env`; a backend-local file only needs overrides. At minimum mirror
`DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `AGENTS_INTERNAL_KEY`, and (if testing payments)
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`.

---

## Support Site (`support/`) — `support/.env.example`

| Var | Status | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | [req] | `http://localhost:3001` | Xperiq backend API base URL |
| `NEXT_PUBLIC_SITE_URL` | [req prod] | `https://support.xperiq.ai` | Canonical site URL (used in sitemap, OG tags, IndexNow) |
| `NEXT_PUBLIC_CRYSTAL_ENABLED` | [opt] | `true` | Enable Crystal AI search panel |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | [opt] | — | Same Clerk app as the main frontend. When absent, "My Tickets" auth is disabled. |
| `CLERK_SECRET_KEY` | [opt] | — | Clerk secret for server-side token verification. Required for `/my-tickets`. |
| `REVALIDATE_SECRET` | [req prod] | — | Shared secret for ISR revalidation webhook (`x-revalidate-secret` header). Also used as `Authorization: Bearer` for IndexNow endpoint. **Change in prod.** |
| `INDEXNOW_KEY` | [opt] | — | IndexNow key for Google/Bing instant indexing pings on doc publish |

**GitHub Actions secrets** (also needed in CI):
- `FLY_API_TOKEN_SUPPORT` — Fly.io API token scoped to the `xperiq-support` app
- `REVALIDATE_SECRET` — same value as above
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — same key as used in the main app CI
