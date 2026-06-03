# Experient — Scalable Implementation Plan

**Prepared by:** Aria Chen (Principal Architect), Marcus Williams (Senior Backend), Jorge Santos (CrystalOS Lead), David Kim (SRE), Emma Thompson (Platform Expert)  
**Date:** 2026-06-03  
**Scope:** Notifications, Alerts, Dashboard, Visual AI, Workflow System  
**Status:** Final Architecture Document — Engineering Execution Reference

---

## Table of Contents

1. [Current Architecture Assessment](#1-current-architecture-assessment)
2. [Service Decomposition Decision](#2-service-decomposition-decision)
3. [Final Service Map](#3-final-service-map)
4. [Database Migration Plan](#4-database-migration-plan)
5. [Feature-by-Feature Implementation Guide](#5-feature-by-feature-implementation-guide)
6. [Event Engine Design](#6-event-engine-design)
7. [Scaling Strategy](#7-scaling-strategy)
8. [Local Development Setup](#8-local-development-setup)
9. [Team Integration Review](#9-team-integration-review)
10. [Implementation Sprint Plan](#10-implementation-sprint-plan)

---

## 1. Current Architecture Assessment

### 1.1 What Already Exists — Notification Infrastructure

**Tables (migration `20240521000003_notification_infrastructure.sql`):**
- `notification_preferences` — per-user/org/survey/channel preferences with `enabled` boolean. Columns: `id`, `org_id`, `user_id`, `survey_id`, `channel` (`in_app`/`email`/`push`), `event_type`, `enabled`, `created_at`, `updated_at`. Has index on `(org_id, user_id)`.
- `notification_events` — delivery event records. Columns: `id`, `org_id`, `user_id`, `survey_id`, `event_type`, `payload` (JSONB), `status` (`pending`/`delivered`/`skipped`), `channel`, `created_at`, `delivered_at`. Has partial index for pending in-app events.

**Routes (`backend/src/routes/notifications.js`):**
- `GET /api/notifications/pending` — fetches and marks 20 pending in-app events as delivered in a single CTE transaction. Note: this marks them delivered on read, which makes it unsuitable as a foundation for a persistent notification inbox.
- `GET /api/notifications/preferences` — returns all preferences for user/org.
- `PUT /api/notifications/preferences` — upserts via `ON CONFLICT` (requires UNIQUE constraint on `(org_id, user_id, channel, event_type)` — commented note in code says this constraint may not exist yet).

**Critical Gap:** The existing `notification_events` table represents *delivery log entries* rather than persistent inbox items. It has no `read_at` timestamp, no `title`/`body`/`action_url` fields, no `priority` level, and no soft-delete. The route marks events as delivered on first fetch, meaning there is no persistent inbox for users to revisit. The 5 features require a full notification inbox — a new `notifications` table must be created alongside the existing ones.

**No Redis Stream consumers for notifications exist yet in the backend.** Redis is wired to the backend for rate limiting only (sliding window in `middleware/rateLimiter.js`). The `ioredis` client is available but no stream publishing/consuming code exists in Node.js.

### 1.2 What Already Exists — Workflow Infrastructure

**Table (`20240101000000_initial.sql`):**
- `workflows` — flat JSONB schema: `id`, `org_id`, `name`, `condition` (JSONB), `action` (JSONB), `status` (`active`/`paused`), `trigger_count`, `created_by`, `created_at`, `updated_at`.

**Routes (`backend/src/routes/workflows.js`):**
- Full CRUD: `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/toggle`
- The `condition` and `action` fields are flat JSONB blobs — no graph structure (nodes/edges), no execution history, no step tracking.

**Critical Gap:** The existing `workflows` table has zero execution infrastructure. There is no queue, no step engine, no execution log. The existing `condition`/`action` JSONB columns represent a primitive "if-this-then-that" model, not a visual workflow graph. The design documents require a full execution engine with Bull Queue, per-step logging, and Crystal AI nodes.

### 1.3 What Already Exists — Redis Infrastructure

**In backend (Node.js):**
- `ioredis` installed, singleton pattern likely in `middleware/rateLimiter.js`
- Used exclusively for sliding-window rate limiting (in-memory fallback available)
- No stream consumers, no pub/sub, no Bull Queue

**In CrystalOS (Python):**
- `redis.asyncio` used in `consumers/event_bus.py` and `consumers/response_stream.py`
- Redis Streams consumer group with `XREADGROUP` for the `insight_events` stream
- The `response_stream.py` consumer listens on a single stream, batches events by `survey_id`, triggers insight generation at thresholds
- Deduplication keys: `progressive:{survey_id}:{tier}:triggered` (30-day TTL)
- Rate limiting: separate 10-req/min sliding window per org for Crystal requests

**Redis already running in docker-compose.yml** as `redis:7-alpine` with healthcheck, persistence volume, port 6379.

### 1.4 What the CrystalOS Pipeline Already Does

From `crystalos/graphs/insights.py` and `crystalos/scheduler.py`:

- **9-node LangGraph pipeline**: ingest → embed → [metrics + extract_texts] → absa → cluster → topics → narrate → verify → publish
- **Progressive tier system**: thresholds at 10/40/70/100 responses trigger incremental runs
- **scheduler.py**: Runs every 300s (dev) or 3600s (prod). Handles zombie sweep, auto-close surveys, org aggregation into `org_metric_snapshots` and `survey_metric_snapshots` tables.
- **Crystal ReAct loop**: 13 tools in `crystal/registry.py`, SSE streaming, per-org 10 req/min rate limit, 7-day thread TTL
- **Skill Runtime** (Sprint 1): `USE_SKILL_RUNTIME=true` enables SKILL.md-based skills. 26 skills in `crystalos/skills/` directory including `copilot-analyst`, `insight-narrator`, `nps-action-advisor`, `survey-creator`, etc.
- **Memory system**: 4-layer (L0: tool cache, L1: semantic cache, L2: thread compression, L3: survey facts, L4: org memory via `crystal_org_memory` table)

**What CrystalOS does NOT yet do:**
- Publish events to a `notifications:events:*` Redis Stream
- Call an Alert Engine API
- Run anomaly detection as a standalone service
- Generate Vega-Lite chart specifications
- Analyze images via multimodal APIs
- Execute workflow steps

### 1.5 Existing Postgres Tables Relevant to the 5 Features

| Table | Migration | Relevant Fields |
|-------|-----------|----------------|
| `surveys` | initial | `org_id`, `nps_score`, `questions` JSONB, `status`, `deleted_at` |
| `responses` | initial | `survey_id`, `org_id`, `answers` JSONB, `nps_score`, `submitted_at` |
| `insights` | 20240516 | `org_id`, `survey_id`, `layer`, `category`, `headline`, `trust_score`, `priority`, `superseded_at` |
| `survey_topics` | (exists per CLAUDE.md) | per-survey topic registry |
| `agent_runs` | (exists) | `survey_id`, `org_id`, `status`, `run_type`, `heartbeat_at` |
| `crystal_threads` | (exists) | `survey_id`, `org_id`, `last_active_at` |
| `workflows` | initial | flat `condition`/`action` JSONB, no graph |
| `notification_events` | 20240521000003 | delivery log only, no persistent inbox |
| `notification_preferences` | 20240521000003 | per-channel per-event-type opt-in |
| `org_metric_snapshots` | (referenced in scheduler.py) | `avg_nps`, `avg_csat`, `total_responses` |
| `survey_metric_snapshots` | (referenced in scheduler.py) | per-survey metric timeseries |
| `insight_jobs` | 20240516 | job queue fallback for Redis |
| `response_embeddings` | 20240516 | pgvector 1536-dim embeddings |

### 1.6 Gap Analysis — What the 5 Features Require

| Feature | Gap |
|---------|-----|
| Notifications | No persistent inbox table (`notifications`). No `read_at`, `title`, `body`, `action_url`, `priority`. No Socket.IO. No notification processor worker. No Redis Stream publisher in backend. No dedup table. |
| Alerts | Entirely new: `alert_rules`, `alert_events`, `alert_subscriptions`, `alert_history`, `alert_snooze`, `alert_thresholds`. No evaluator (scheduled or real-time). No Crystal narration endpoint for alerts. |
| Dashboard | No analytics API layer. No materialized views. No `nps_daily_agg`. WebSocket events not implemented. No Crystal narrative endpoint for dashboard context. |
| Visual AI | No `survey_media`, `media_analysis`, `visual_insights`, `generated_charts` tables. No image upload endpoint. No Vega-Lite chart generation tool in CrystalOS. No `visual_analyst` skill/agent. |
| Workflows | `workflows` table lacks graph columns (`nodes`, `edges`), status enum extension, execution tables. No Bull Queue worker. No connector credentials vault. No Crystal workflow-action endpoint in CrystalOS. |

---

## 2. Service Decomposition Decision

### Option A: Monolith Extension

Add all 5 features to the existing `backend/` (Node.js Express) and `crystalos/` (FastAPI).

**Pros:**
- Zero new infrastructure to deploy
- No cross-service HTTP calls for event routing
- Shared codebase, single deploy

**Cons:**
- Backend becomes responsible for: REST API, WebSocket gateway, notification processor, alert evaluator, workflow executor, and metric aggregation — all in one process
- A long-running workflow execution blocks Node.js event loop if not carefully isolated
- Cannot independently scale the event-processing workload from the API workload
- A runaway alert evaluation loop that crashes the process takes down the entire API
- Single point of failure: one process serves API requests AND runs background processing AND manages WebSocket connections

**Viable for:** Notification preferences REST API, basic analytics API endpoints, simple notification delivery (polling model only). Not viable for real-time delivery, workflow execution engine, or scheduled alert evaluation at scale.

### Option B: Event Engine Service (Recommended)

Extract a dedicated `event-engine/` Node.js service that:
- Consumes Redis Streams for notification events and alert triggers
- Runs Bull Queue workers for workflow execution
- Delivers notifications via WebSocket pub/sub (publishes to `notifications:live:{userId}` Redis channel; the backend Socket.IO gateway subscribes)
- Runs scheduled alert evaluation (cron jobs)

The Event Engine shares the same `DATABASE_URL` and `REDIS_URL` as the backend. It does NOT expose a public API — it is a pure background processing service.

**Pros:**
- API latency unaffected by background processing (separate process)
- Independent scaling: can run 1–N Event Engine pods based on queue depth
- Crash isolation: Event Engine failure does not take down the REST API
- Clear separation of concerns: backend owns REST API, Event Engine owns processing
- Bull Queue handles retry, dead-letter, delayed jobs natively
- Adding a new trigger type or action type does not require touching the API server

**Cons:**
- New service to build, deploy, and maintain
- Shared Postgres coupling (mitigated by Postgres connection pooling per service)
- Cross-service call for Crystal AI steps in workflows (Event Engine → CrystalOS HTTP)
- Development complexity: 3 services to run locally (backend + event-engine + crystalos)

**Viable for:** All 5 features. This is the recommended path.

### Option C: Extend CrystalOS

Add event processing to CrystalOS scheduler — use `scheduler.py` as the host for alert evaluation, workflow triggering, and notification processing.

**Pros:**
- Leverages existing Python async infrastructure
- Existing Redis consumer pattern is proven
- Single additional container already exists in docker-compose (`agents` profile)

**Cons:**
- Mixes operational concerns (alert evaluation, workflow execution) with AI/ML concerns (embedding, NLP, LLM calls)
- Python's async is well-suited for I/O-bound LLM calls but the workflow engine requires Bull-like semantics with persistent job queues — reinventing Bull in Python adds risk
- CrystalOS already has a well-defined responsibility boundary (AI pipeline). Adding workflow execution crosses that boundary
- Node.js ecosystem (Bull Queue, Socket.IO, ioredis) is significantly more mature for the task at hand
- Connector integrations (Slack, Jira, SendGrid) have better Node.js SDKs

**Viable for:** Crystal-specific notification publishing (notify when insight pipeline completes) and anomaly detection. NOT viable as the primary workflow execution host.

### Final Architecture Recommendation

**Adopt Option B (Event Engine Service) with the following service responsibility matrix:**

| Responsibility | Service |
|---------------|---------|
| REST API for all 5 features | Backend (Node.js Express) |
| Socket.IO WebSocket gateway | Backend (adds socket.io to existing Express app) |
| Notification event publishing | Backend (when processing requests) + CrystalOS (when insight pipeline completes) |
| Notification processor (Redis Stream → Postgres → WebSocket) | Event Engine |
| Alert rule evaluation (scheduled + real-time) | Event Engine |
| Crystal narration for alerts | Event Engine → CrystalOS HTTP call |
| Workflow execution engine (Bull Queue) | Event Engine |
| Crystal AI workflow actions | CrystalOS (new `/api/crystal/workflow-action` endpoint) |
| Dashboard analytics queries | Backend (new `/api/analytics/*` routes) |
| Dashboard materialized view refresh | Event Engine (scheduled job) |
| Crystal dashboard narrative | CrystalOS (new skill: `dashboard-narrator`) |
| Image upload + preprocessing | Backend |
| Image analysis (multimodal AI) | CrystalOS (new skill: `visual-analyst`) |
| Chart generation (Vega-Lite) | CrystalOS (new skill: `chart-generator`) |
| Crystal anomaly detection | CrystalOS (new skill: `anomaly-detector`) |
| Integration connectors (Slack, Jira, email, webhook) | Event Engine |

**Justification for Node.js Event Engine (not Python):**
- Shares the same language and idioms as the backend (code reuse for `db.js`, `rateLimiter`, auth middleware)
- Bull Queue (now BullMQ) is the Node.js gold standard for durable job queues — mature, battle-tested, Redis-native
- Socket.IO pub/sub integration is native — the Event Engine publishes to Redis pub/sub, backend's Socket.IO subscribes — both in the same ecosystem
- Connector SDKs for Slack, Jira, and SendGrid are excellent in Node.js

---

## 3. Final Service Map

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                          │
│   React App (Vite, port 5173)                                                │
│   • Axios REST calls → Backend                                               │
│   • Socket.IO WebSocket → Backend                                            │
│   • SSE stream → Backend → CrystalOS proxy                                  │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │ HTTPS / WebSocket
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js Express, port 3001)                 │
│                                                                              │
│  REST Routes:                    Socket.IO Gateway:                          │
│  • /api/notifications/*          • room: user:{userId}                       │
│  • /api/alerts/*                 • subscribes: notifications:live:{userId}   │
│  • /api/analytics/*              • emits: notification:new, notification:count│
│  • /api/workflows/*              • emits: dashboard:nps_updated              │
│  • /api/visual/*                 • emits: dashboard:alert_fired              │
│  • /api/surveys/* (existing)                                                 │
│  • /api/insights/* (existing)    Internal:                                   │
│                                  • Publishes to notifications:events:{orgId} │
│                                    (Redis Stream) on response submit,        │
│                                    survey milestones, etc.                   │
└──────────────────┬──────────────────────┬────────────────────────────────────┘
                   │ HTTP (internal key)   │ Redis pub/sub subscribe
                   │                      │
                   ▼                      ▼
┌──────────────────────────┐   ┌──────────────────────────────────────────────┐
│  CRYSTALOS (FastAPI,     │   │          REDIS (port 6379)                   │
│  port 8001)              │   │                                              │
│                          │◄──┤  Streams:                                    │
│  Existing:               │   │  • notifications:events:{orgId}  ← producers │
│  • /insights/generate    │   │  • insight_events                ← response  │
│  • /insights/crystal/*   │   │                                    consumer  │
│  • Skills runtime        │   │  Pub/Sub Channels:                           │
│                          │   │  • notifications:live:{userId}   → Socket.IO │
│  NEW endpoints:          │   │                                              │
│  • POST /api/crystal/    │   │  Keys:                                       │
│    workflow-action       │   │  • alert:dedup:{orgId}:{ruleId}:*           │
│  • POST /api/crystal/    │   │  • notif:dedup:{orgId}:{type}:{entityId}    │
│    dashboard-narrative   │   │  • progressive:{surveyId}:{tier}:triggered  │
│  • POST /api/crystal/    │   │  • rate:{orgId}:*                            │
│    alert-narration       │   │                                              │
│  • POST /api/visual/     │   │  BullMQ Queues (Redis-backed):               │
│    analyze               │   │  • wf:execution          (workflow jobs)     │
│  • POST /api/visual/     │   │  • notif:delivery        (notification jobs) │
│    generate-chart        │   │  • alert:evaluate        (alert batch jobs)  │
│                          │   │  • email:delivery        (email send jobs)   │
│  NEW Skills:             │   └──────────────────────────────────────────────┘
│  • visual-analyst        │                         │
│  • chart-generator       │                         │ Redis
│  • dashboard-narrator    │                         │
│  • alert-narrator        │                         ▼
│  • anomaly-detector      │   ┌──────────────────────────────────────────────┐
└──────────────────────────┘   │    EVENT ENGINE (Node.js, port 3002)         │
         │ HTTP                │                                              │
         │ (internal key)      │  Notification Worker:                        │
         │                     │  • Consumes notifications:events:{orgId}     │
         │                     │  • Dedup check → Postgres insert             │
         │                     │  • Publishes notifications:live:{userId}     │
         │                     │                                              │
         │                     │  Alert Evaluator:                            │
         │                     │  • Scheduled (cron every 15min): S-01, V-01 │
         │                     │  • Real-time (stream consumer): V-03, T-07   │
         │                     │  • Calls CrystalOS for narration             │
         │                     │  • Writes alert_events → publishes notif     │
         │                     │                                              │
         │                     │  Workflow Executor (BullMQ):                 │
         │                     │  • Consumes wf:execution queue               │
         │                     │  • Evaluates conditions                      │
         │                     │  • Dispatches actions:                       │
         │                     │    - Crystal: POST CrystalOS/workflow-action │
         │                     │    - Slack: Slack Web API                    │
         │                     │    - Email: SendGrid                         │
         │                     │    - Jira: Jira REST API                     │
         │                     │    - Webhook: HTTP POST                      │
         │                     │    - Notification: Postgres write + pub/sub  │
         │                     │  • Writes workflow_step_executions           │
         │                     │  • Bull delayed jobs for Delay nodes         │
         │                     │                                              │
         │                     │  Scheduler (node-cron):                     │
         │                     │  • Every 15min: alert batch evaluation       │
         │                     │  • Every 5min:  nps_daily_agg REFRESH        │
         │                     │  • Hourly: snooze expiry check               │
         └─────────────────────┤                                              │
                               │  Workflow Trigger Listener:                  │
                               │  • Redis Stream consumer for data events     │
                               │  • Bull cron for scheduled triggers          │
                               │  • HTTP receiver for webhook triggers        │
                               └──────────────────────────────────────────────┘
                                                    │
                                                    │ Postgres
                                                    ▼
                               ┌──────────────────────────────────────────────┐
                               │     POSTGRES (port 5432, "experient" DB)     │
                               │                                              │
                               │  Existing: surveys, responses, insights,     │
                               │  survey_topics, agent_runs, crystal_threads, │
                               │  workflows, notification_events,             │
                               │  notification_preferences, response_embeddings│
                               │                                              │
                               │  NEW (this plan):                            │
                               │  • notifications        (persistent inbox)   │
                               │  • notification_dedup                        │
                               │  • notification_digests                      │
                               │  • notification_channels                     │
                               │  • alert_rules                               │
                               │  • alert_events                              │
                               │  • alert_subscriptions                       │
                               │  • alert_history                             │
                               │  • alert_snooze                              │
                               │  • alert_thresholds                          │
                               │  • workflow_triggers                         │
                               │  • workflow_executions                       │
                               │  • workflow_step_executions                  │
                               │  • workflow_templates                        │
                               │  • workflow_connector_credentials            │
                               │  • survey_media                              │
                               │  • media_analysis                            │
                               │  • visual_insights                           │
                               │  • generated_charts                          │
                               │  MATERIALIZED VIEW: nps_daily_agg            │
                               └──────────────────────────────────────────────┘
```

---

## 4. Database Migration Plan

All migrations go into `supabase/migrations/`. Files are ordered by timestamp prefix. The existing migrations must not be modified — only new migrations are added.

### 4.1 Migration: Notifications Inbox

**File:** `20260603000010_notifications_inbox.sql`

```sql
-- Persistent notification inbox (replaces ephemeral notification_events delivery log pattern)
-- notification_events still exists for delivery audit; this table is the user-facing inbox
CREATE TABLE IF NOT EXISTS notifications (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT        NOT NULL,
  user_id             TEXT        NOT NULL,

  -- Classification
  type                TEXT        NOT NULL,  -- e.g. 'crystal.insight_ready', 'score.nps_drop'
  priority            TEXT        NOT NULL DEFAULT 'info'
                                  CHECK (priority IN ('critical', 'warning', 'info', 'success', 'digest')),

  -- Display content
  title               TEXT        NOT NULL,
  body                TEXT,
  icon_type           TEXT,                  -- maps to frontend icon set
  action_url          TEXT,                  -- deep link to relevant page

  -- Entity reference
  entity_type         TEXT,                  -- 'survey', 'insight', 'alert', 'workflow'
  entity_id           TEXT,

  -- Rich payload (Crystal narration, data, etc.)
  metadata            JSONB       NOT NULL DEFAULT '{}',

  -- State
  read_at             TIMESTAMPTZ,
  dismissed_at        TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,

  -- Delivery tracking
  delivered_channels  TEXT[]      NOT NULL DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(org_id, user_id, created_at DESC)
  WHERE read_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_all
  ON notifications(org_id, user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_org_type
  ON notifications(org_id, type, created_at DESC)
  WHERE deleted_at IS NULL;


-- Deduplication (prevents same event firing same notification twice)
CREATE TABLE IF NOT EXISTS notification_dedup (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  event_type      TEXT        NOT NULL,
  entity_id       TEXT        NOT NULL,
  window_start    TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,

  CONSTRAINT notification_dedup_unique UNIQUE (org_id, event_type, entity_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_notification_dedup_expiry
  ON notification_dedup(expires_at);


-- Digest queue (for daily/weekly email digests)
CREATE TABLE IF NOT EXISTS notification_digests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  notification_id UUID        REFERENCES notifications(id) ON DELETE CASCADE,
  digest_type     TEXT        NOT NULL DEFAULT 'daily'
                              CHECK (digest_type IN ('daily', 'weekly')),
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_digests_pending
  ON notification_digests(scheduled_for)
  WHERE sent_at IS NULL;


-- Org-level channel configs (Slack webhook URL, email settings)
CREATE TABLE IF NOT EXISTS notification_channels (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  channel_type    TEXT        NOT NULL   CHECK (channel_type IN ('slack', 'email', 'teams', 'webhook')),
  channel_name    TEXT,
  config          JSONB       NOT NULL DEFAULT '{}',  -- encrypted at rest in production
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_org
  ON notification_channels(org_id, channel_type)
  WHERE deleted_at IS NULL;


-- Extend notification_preferences: add quiet hours, threshold config
-- The existing table has: id, org_id, user_id, survey_id, channel, event_type, enabled
-- We add: quiet hours, threshold config
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS threshold_config  JSONB        DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME,
  ADD COLUMN IF NOT EXISTS quiet_hours_end   TIME,
  ADD COLUMN IF NOT EXISTS timezone          TEXT         DEFAULT 'UTC';

-- Ensure the unique constraint exists (required by the PUT route's ON CONFLICT)
ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_unique;
ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_preferences_unique
  UNIQUE (org_id, user_id, channel, event_type);
```

### 4.2 Migration: Alert System

**File:** `20260603000011_alert_system.sql`

```sql
-- Alert rule configurations (user-defined + system/Crystal-defined)
CREATE TABLE IF NOT EXISTS alert_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT        NOT NULL,
  survey_id         UUID        REFERENCES surveys(id) ON DELETE CASCADE,  -- NULL = org-wide
  alert_type        TEXT        NOT NULL,   -- 'S-01', 'T-02', 'AI-03', etc.
  name              TEXT        NOT NULL,
  description       TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  is_system         BOOLEAN     NOT NULL DEFAULT FALSE,  -- Crystal-managed rules
  threshold_config  JSONB       NOT NULL DEFAULT '{}',
  severity          TEXT        NOT NULL DEFAULT 'warning'
                                CHECK (severity IN ('critical', 'warning', 'info', 'success')),
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_org_active
  ON alert_rules(org_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alert_rules_survey
  ON alert_rules(survey_id)
  WHERE survey_id IS NOT NULL AND deleted_at IS NULL;


-- Triggered alert instances (one per firing event)
CREATE TABLE IF NOT EXISTS alert_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT        NOT NULL,
  rule_id             UUID        NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  survey_id           UUID        REFERENCES surveys(id) ON DELETE SET NULL,
  alert_type          TEXT        NOT NULL,
  severity            TEXT        NOT NULL
                                  CHECK (severity IN ('critical', 'warning', 'info', 'success')),

  -- Content
  title               TEXT        NOT NULL,
  description         TEXT        NOT NULL,
  crystal_narration   TEXT,       -- Crystal's AI-generated explanation (≤ 200 words)
  crystal_action      TEXT,       -- Crystal's recommended next action

  -- Metric deltas
  metric_value        NUMERIC(12,4),
  metric_baseline     NUMERIC(12,4),
  metric_change       NUMERIC(12,4),
  evidence            JSONB       NOT NULL DEFAULT '{}',  -- verbatims, chart data

  -- State machine
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'acknowledged', 'snoozed', 'resolved')),

  -- Lifecycle
  triggered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at     TIMESTAMPTZ,
  acknowledged_by     TEXT,
  resolved_at         TIMESTAMPTZ,
  resolved_by         TEXT,
  snoozed_until       TIMESTAMPTZ,
  snoozed_by          TEXT,

  metadata            JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_alert_events_org_active
  ON alert_events(org_id, triggered_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_alert_events_rule
  ON alert_events(rule_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_survey
  ON alert_events(survey_id, triggered_at DESC)
  WHERE survey_id IS NOT NULL;


-- Who receives which alert types
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  user_id         TEXT,
  role            TEXT,
  rule_id         UUID        REFERENCES alert_rules(id) ON DELETE CASCADE,
  alert_type      TEXT,
  in_app_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  email_enabled   BOOLEAN     NOT NULL DEFAULT FALSE,
  slack_enabled   BOOLEAN     NOT NULL DEFAULT FALSE,

  CONSTRAINT alert_subscriptions_unique UNIQUE (org_id, user_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_org
  ON alert_subscriptions(org_id, alert_type);


-- Org-level threshold overrides (admins can override system defaults)
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  alert_type      TEXT        NOT NULL,
  threshold_key   TEXT        NOT NULL,
  threshold_value JSONB       NOT NULL,

  CONSTRAINT alert_thresholds_unique UNIQUE (org_id, alert_type, threshold_key)
);


-- Snooze records (separate from alert_events.snoozed_until for history)
CREATE TABLE IF NOT EXISTS alert_snooze (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_event_id  UUID        NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  user_id         TEXT        NOT NULL,
  snoozed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snoozed_until   TIMESTAMPTZ NOT NULL,
  reason          TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_snooze_expiry
  ON alert_snooze(snoozed_until)
  WHERE snoozed_until > NOW();


-- Immutable audit trail of all alert state transitions
CREATE TABLE IF NOT EXISTS alert_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_event_id  UUID        NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  user_id         TEXT,       -- NULL = system action
  action          TEXT        NOT NULL,  -- 'triggered','acknowledged','snoozed','resolved'
  from_status     TEXT,
  to_status       TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_event
  ON alert_history(alert_event_id, created_at);
```

### 4.3 Migration: Dashboard Analytics

**File:** `20260603000012_dashboard_analytics.sql`

```sql
-- Materialized view for NPS daily aggregation (refreshed every 5min by Event Engine)
-- Used by /api/analytics/nps-trend; avoids full table scans on responses
CREATE MATERIALIZED VIEW IF NOT EXISTS nps_daily_agg AS
SELECT
  org_id,
  survey_id,
  DATE_TRUNC('day', submitted_at) AS day,
  COUNT(*)                        AS response_count,
  AVG(nps_score)                  AS avg_nps,
  -- NPS formula: (promoters - detractors) / total * 100
  ROUND(
    100.0 * SUM(CASE WHEN nps_score >= 9 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) -
    100.0 * SUM(CASE WHEN nps_score <= 6 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)
  , 1)                            AS nps
FROM responses
WHERE nps_score IS NOT NULL
GROUP BY org_id, survey_id, DATE_TRUNC('day', submitted_at);

CREATE UNIQUE INDEX IF NOT EXISTS nps_daily_agg_idx
  ON nps_daily_agg(org_id, survey_id, day);


-- Saved dashboard layouts (per user, per org)
CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  layout_json     JSONB       NOT NULL DEFAULT '{}',  -- widget positions and configs
  is_default      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_shared       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user
  ON dashboard_layouts(org_id, user_id);
```

### 4.4 Migration: Visual AI Tables

**File:** `20260603000013_visual_ai.sql`

```sql
-- Survey media submissions (images uploaded by respondents)
CREATE TABLE IF NOT EXISTS survey_media (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT        NOT NULL,
  survey_id           UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  response_id         UUID        REFERENCES responses(id) ON DELETE SET NULL,
  question_id         TEXT        NOT NULL,

  media_type          TEXT        NOT NULL DEFAULT 'image'
                                  CHECK (media_type IN ('image', 'video', 'audio')),
  original_url        TEXT        NOT NULL,   -- Firebase Storage URL
  processed_url       TEXT,                   -- URL after face blur / EXIF strip

  file_size_bytes     BIGINT,
  mime_type           TEXT,
  width_px            INTEGER,
  height_px           INTEGER,

  -- Privacy flags
  faces_blurred       BOOLEAN     NOT NULL DEFAULT TRUE,
  pii_detected        BOOLEAN     NOT NULL DEFAULT FALSE,
  safety_flagged      BOOLEAN     NOT NULL DEFAULT FALSE,
  consent_given       BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_survey_media_survey
  ON survey_media(survey_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_survey_media_response
  ON survey_media(response_id)
  WHERE response_id IS NOT NULL;


-- Per-image Crystal analysis results
CREATE TABLE IF NOT EXISTS media_analysis (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id            UUID        NOT NULL REFERENCES survey_media(id) ON DELETE CASCADE,
  analysis_type       TEXT        NOT NULL   CHECK (analysis_type IN ('sentiment', 'objects', 'text', 'face', 'full')),

  overall_sentiment   TEXT                   CHECK (overall_sentiment IN ('positive', 'neutral', 'negative')),
  sentiment_score     NUMERIC(4,3),          -- -1.000 to 1.000
  detected_objects    TEXT[],
  extracted_text      TEXT,
  quality_indicators  JSONB       NOT NULL DEFAULT '{}',
  concerns            TEXT[],
  raw_result          JSONB       NOT NULL DEFAULT '{}',

  confidence          NUMERIC(4,3),
  model_used          TEXT,

  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_analysis_media
  ON media_analysis(media_id);

CREATE INDEX IF NOT EXISTS idx_media_analysis_pending
  ON media_analysis(status, created_at)
  WHERE status IN ('pending', 'running');


-- Crystal aggregate analysis across all images for a survey/question
CREATE TABLE IF NOT EXISTS visual_insights (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              TEXT        NOT NULL,
  survey_id           UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id         TEXT,

  image_count         INTEGER     NOT NULL DEFAULT 0,
  sentiment_breakdown JSONB       NOT NULL DEFAULT '{}',
  top_objects         TEXT[],
  quality_summary     JSONB       NOT NULL DEFAULT '{}',
  emerging_themes     TEXT[],
  crystal_narrative   TEXT,

  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT visual_insights_survey_question UNIQUE (survey_id, question_id)
);


-- Crystal-generated chart specifications (stored for reuse)
CREATE TABLE IF NOT EXISTS generated_charts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  query           TEXT,                       -- original natural language query
  vega_lite_spec  JSONB       NOT NULL,        -- Vega-Lite v5 JSON
  headline        TEXT,
  explanation     TEXT,
  png_url         TEXT,
  svg_url         TEXT,
  data_snapshot   JSONB,                       -- data used (for reproducibility)
  filter_state    JSONB,                       -- filter context when generated
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_charts_org
  ON generated_charts(org_id, created_at DESC);
```

### 4.5 Migration: Workflow System Expansion

**File:** `20260603000014_workflow_expansion.sql`

```sql
-- Extend existing workflows table with graph columns and richer status
-- The existing condition/action columns are preserved for backwards compatibility
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS nodes          JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS edges          JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS run_count      INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status    TEXT,
  ADD COLUMN IF NOT EXISTS template_id    UUID,
  ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ;

-- Extend status check to include 'draft' and 'archived' and 'error'
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;
ALTER TABLE workflows ADD CONSTRAINT workflows_status_check
  CHECK (status IN ('active', 'paused', 'draft', 'archived', 'error'));


-- Trigger subscriptions (what events activate each workflow)
CREATE TABLE IF NOT EXISTS workflow_triggers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type    TEXT        NOT NULL,
  trigger_config  JSONB       NOT NULL DEFAULT '{}',
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  cron_expression TEXT,
  timezone        TEXT        DEFAULT 'UTC',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type
  ON workflow_triggers(trigger_type, is_active)
  WHERE is_active = TRUE;


-- Per-execution records (one row per workflow run)
CREATE TABLE IF NOT EXISTS workflow_executions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id           UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id                TEXT        NOT NULL,
  trigger_type          TEXT        NOT NULL,
  trigger_payload       JSONB       NOT NULL DEFAULT '{}',
  status                TEXT        NOT NULL DEFAULT 'triggered'
                                    CHECK (status IN ('triggered','evaluating','executing','waiting','completed','failed','timed_out')),
  triggered_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  duration_ms           INTEGER,
  error_message         TEXT,
  output                JSONB       NOT NULL DEFAULT '{}',
  retry_count           INTEGER     NOT NULL DEFAULT 0,
  parent_execution_id   UUID        REFERENCES workflow_executions(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow
  ON workflow_executions(workflow_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_active
  ON workflow_executions(status, triggered_at)
  WHERE status IN ('triggered', 'evaluating', 'executing', 'waiting');

CREATE INDEX IF NOT EXISTS idx_workflow_executions_org
  ON workflow_executions(org_id, triggered_at DESC);


-- Per-step execution results (audit trail)
CREATE TABLE IF NOT EXISTS workflow_step_executions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    UUID        NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id     UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id         TEXT        NOT NULL,
  node_type       TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','running','completed','failed','skipped')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  input           JSONB       NOT NULL DEFAULT '{}',
  output          JSONB       NOT NULL DEFAULT '{}',
  error_message   TEXT,
  attempt_count   INTEGER     NOT NULL DEFAULT 1,
  idempotency_key TEXT,

  CONSTRAINT wf_step_exec_unique UNIQUE (execution_id, node_id, attempt_count)
);

CREATE INDEX IF NOT EXISTS idx_wf_step_executions_exec
  ON workflow_step_executions(execution_id, started_at);


-- Pre-built workflow templates
CREATE TABLE IF NOT EXISTS workflow_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  category        TEXT,
  industry        TEXT        DEFAULT 'all',
  nodes           JSONB       NOT NULL DEFAULT '[]',
  edges           JSONB       NOT NULL DEFAULT '[]',
  preview_image   TEXT,
  use_count       INTEGER     NOT NULL DEFAULT 0,
  is_featured     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Integration credential vault (org-level, encrypted)
CREATE TABLE IF NOT EXISTS workflow_connector_credentials (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  connector_type  TEXT        NOT NULL   CHECK (connector_type IN ('slack','jira','email','webhook','pagerduty','salesforce','hubspot')),
  name            TEXT,
  credentials     JSONB       NOT NULL DEFAULT '{}',  -- encrypted in application layer
  oauth_state     JSONB       NOT NULL DEFAULT '{}',
  is_valid        BOOLEAN     NOT NULL DEFAULT TRUE,
  last_verified   TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT wf_connector_org_type_name UNIQUE (org_id, connector_type, name)
);

CREATE INDEX IF NOT EXISTS idx_wf_connector_org
  ON workflow_connector_credentials(org_id, connector_type)
  WHERE deleted_at IS NULL;
```

---

## 5. Feature-by-Feature Implementation Guide

### 5.1 Notifications — Build on Existing Infrastructure

#### What the existing tables need (see Migration 20260603000010):
- `notification_events` stays as the delivery audit log (its purpose was always to track channel delivery, not to serve a UI inbox)
- New `notifications` table serves the persistent inbox
- `notification_preferences` gets `threshold_config`, `quiet_hours_start`, `quiet_hours_end`, `timezone` columns added
- UNIQUE constraint on `notification_preferences(org_id, user_id, channel, event_type)` enforced

#### New backend routes (`backend/src/routes/notifications.js` — extended):

```javascript
// GET /api/notifications — persistent inbox with pagination
router.get('/', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, unread, priority, type } = req.query;
  const offset = (page - 1) * Math.min(limit, 100);
  const conditions = ['org_id = $1', 'user_id = $2', 'deleted_at IS NULL'];
  const vals = [req.orgId, req.userId];
  let i = 3;
  if (unread === 'true') { conditions.push('read_at IS NULL'); }
  if (priority) { conditions.push(`priority = $${i++}`); vals.push(priority); }
  if (type) { conditions.push(`type = $${i++}`); vals.push(type); }
  const { rows } = await db.query(
    `SELECT * FROM notifications WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
    [...vals, limit, offset]
  );
  const { rows: [{count}] } = await db.query(
    `SELECT COUNT(*) FROM notifications WHERE ${conditions.join(' AND ')}`,
    vals
  );
  res.json({ notifications: rows, pagination: { page, limit, total: Number(count), hasMore: offset + rows.length < count } });
});

// GET /api/notifications/count — lightweight for badge
router.get('/count', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE read_at IS NULL) AS unread,
       COUNT(*) FILTER (WHERE read_at IS NULL AND priority = 'critical') AS critical
     FROM notifications
     WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [req.orgId, req.userId]
  );
  res.json({ unread: Number(rows[0].unread), critical: Number(rows[0].critical) });
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE id = $1 AND org_id = $2 AND user_id = $3 AND read_at IS NULL
     RETURNING read_at`,
    [req.params.id, req.orgId, req.userId]
  );
  res.json({ success: true, readAt: rows[0]?.read_at || null });
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, async (req, res) => {
  const before = req.body.before ? new Date(req.body.before) : new Date();
  const { rowCount } = await db.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE org_id = $1 AND user_id = $2 AND read_at IS NULL AND created_at <= $3`,
    [req.orgId, req.userId, before]
  );
  res.json({ updated: rowCount });
});

// DELETE /api/notifications/:id (soft delete)
router.delete('/:id', requireAuth, async (req, res) => {
  await db.query(
    'UPDATE notifications SET deleted_at = NOW() WHERE id = $1 AND org_id = $2 AND user_id = $3',
    [req.params.id, req.orgId, req.userId]
  );
  res.json({ success: true });
});
```

#### Socket.IO setup in existing Express server (`backend/src/index.js`):

```javascript
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.ALLOWED_ORIGIN }
});

// Redis subscriber for live notification fanout
const subClient = createClient({ url: process.env.REDIS_URL });
await subClient.connect();

io.use(async (socket, next) => {
  // Verify Clerk token from socket handshake auth
  const token = socket.handshake.auth.token;
  const { orgId, userId } = await verifyToken(token);
  socket.orgId = orgId;
  socket.userId = userId;
  next();
});

io.on('connection', (socket) => {
  const room = `user:${socket.userId}`;
  socket.join(room);
  
  // Subscribe to this user's live notification channel
  subClient.subscribe(`notifications:live:${socket.userId}`, (message) => {
    const notification = JSON.parse(message);
    socket.emit('notification:new', notification);
    // Also update unread count
    socket.emit('notification:count', { unread: notification._unreadCount });
  });

  socket.on('notification:read', async ({ notificationId }) => {
    await db.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2',
      [notificationId, socket.userId]
    );
  });

  socket.on('disconnect', () => {
    subClient.unsubscribe(`notifications:live:${socket.userId}`);
  });
});

httpServer.listen(process.env.PORT || 3001);
```

#### Event Engine notification worker (`event-engine/src/notification-worker.js`):

The worker:
1. Reads from `notifications:events:{orgId}` Redis Stream (consumer group `notification-processor`)
2. Looks up subscribers in `notification_preferences`
3. Checks `notification_dedup` (upsert with TTL-based windowing)
4. Inserts into `notifications` table
5. Publishes to `notifications:live:{userId}` Redis pub/sub
6. For Crystal-type events: calls `POST /api/crystal/alert-narration` to get `crystalSummary`, embeds in `metadata`
7. XACK the stream message

#### Redis Stream channel naming:
- `notifications:events:{orgId}` — event ingestion (Redis Streams, consumer group `notification-processor`)
- `notifications:live:{userId}` — delivery to WebSocket gateway (Redis pub/sub)
- `notif:dedup:{orgId}:{type}:{entityId}` — dedup TTL keys

#### Integration with Progressive Tier System:
When CrystalOS's `response_stream.py` triggers insight generation and the pipeline completes, the `node_publish` step in `graphs/insights.py` should call `notify_insight_complete()`. Add a new file `crystalos/lib/notification_bridge.py`:

```python
import json, os
import redis.asyncio as aioredis

_redis: aioredis.Redis | None = None

async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)
    return _redis

async def notify_insight_complete(org_id: str, survey_id: str, insight_count: int, summary: str) -> None:
    r = await _get_redis()
    await r.xadd(
        f"notifications:events:{org_id}",
        {
            "type": "crystal.insight_ready",
            "orgId": org_id,
            "entityType": "survey",
            "entityId": survey_id,
            "priority": "info",
            "payload": json.dumps({"insightCount": insight_count, "crystalSummary": summary}),
            "timestamp": str(int(__import__('time').time() * 1000))
        }
    )

async def notify_anomaly_detected(org_id: str, survey_id: str, anomaly: dict) -> None:
    r = await _get_redis()
    await r.xadd(
        f"notifications:events:{org_id}",
        {
            "type": "crystal.anomaly_detected",
            "orgId": org_id,
            "entityType": "survey",
            "entityId": survey_id,
            "priority": "warning",
            "payload": json.dumps(anomaly),
            "timestamp": str(int(__import__('time').time() * 1000))
        }
    )
```

---

### 5.2 Alerts System — New on Top of Notification Pipeline

#### Key design decision: Alerts are NOT a separate delivery system. When an alert fires, it creates an `alert_events` row AND publishes a `alert.fired` event to the `notifications:events:{orgId}` stream. The Notification Worker handles delivery. No duplicate notification plumbing.

#### New backend routes (`backend/src/routes/alerts.js` — new file):

```javascript
// GET /api/alerts — active alert list
router.get('/', requireAuth, async (req, res) => {
  const { status = 'active', page = 1, limit = 20, severity } = req.query;
  // ... pagination query against alert_events with JOIN on alert_rules
});

// GET /api/alerts/history — historical alerts
router.get('/history', requireAuth, async (req, res) => { ... });

// POST /api/alerts/:id/acknowledge
router.post('/:id/acknowledge', requireAuth, async (req, res) => {
  await db.query(
    `UPDATE alert_events SET status='acknowledged', acknowledged_at=NOW(), acknowledged_by=$1
     WHERE id=$2 AND org_id=$3`,
    [req.userId, req.params.id, req.orgId]
  );
  await db.query(
    `INSERT INTO alert_history (alert_event_id, user_id, action, from_status, to_status)
     VALUES ($1, $2, 'acknowledged', 'active', 'acknowledged')`,
    [req.params.id, req.userId]
  );
  res.json({ success: true });
});

// POST /api/alerts/:id/snooze
router.post('/:id/snooze', requireAuth, async (req, res) => {
  const { duration, reason } = req.body;
  const snoozedUntil = parseDuration(duration); // e.g. '4h' → Date
  await db.query('UPDATE alert_events SET status=$1, snoozed_until=$2 WHERE id=$3 AND org_id=$4',
    ['snoozed', snoozedUntil, req.params.id, req.orgId]);
  await db.query('INSERT INTO alert_snooze(alert_event_id, user_id, snoozed_until, reason) VALUES($1,$2,$3,$4)',
    [req.params.id, req.userId, snoozedUntil, reason]);
  res.json({ snoozedUntil });
});

// CRUD for /api/alerts/rules
// GET/POST/PUT/DELETE /api/alerts/rules (and /:id)
// POST /api/alerts/rules/:id/test — runs evaluator against current data, dry-run
```

Mount in `backend/src/index.js`:
```javascript
const alertsRouter = require('./routes/alerts');
app.use('/api/alerts', alertsRouter);
```

#### Alert Evaluator (Event Engine `src/alert-evaluator.js`):

**Scheduled evaluator (runs every 15 minutes via node-cron):**
```javascript
// For each org with active alert rules:
// 1. Query current metric values from Postgres
// 2. Compare against alert_rules.threshold_config
// 3. Check dedup key in Redis (alert:dedup:{orgId}:{ruleId}:{entityId}:{window})
// 4. If alert should fire:
//    a. Request Crystal narration: POST crystalos /api/crystal/alert-narration
//    b. Insert into alert_events
//    c. Publish 'alert.fired' to notifications:events:{orgId} stream
//    d. Set Redis dedup key with TTL (critical: 86400s, warning: 21600s, info: 3600s)
```

**S-01 (NPS Drop) evaluation example:**
```javascript
async function evaluateNpsDrop(orgId, rule) {
  const { minDrop = 5, windowDays = 7 } = rule.threshold_config;
  const { rows } = await db.query(`
    SELECT
      survey_id,
      AVG(CASE WHEN submitted_at > NOW() - INTERVAL '${windowDays} days' THEN nps_score END) AS current_nps,
      AVG(CASE WHEN submitted_at BETWEEN NOW() - INTERVAL '${windowDays * 2} days' AND NOW() - INTERVAL '${windowDays} days' THEN nps_score END) AS prior_nps
    FROM responses
    WHERE org_id = $1 AND nps_score IS NOT NULL
    GROUP BY survey_id
    HAVING COUNT(*) FILTER (WHERE submitted_at > NOW() - INTERVAL '${windowDays} days') >= 5
  `, [orgId]);

  for (const row of rows) {
    const drop = row.prior_nps - row.current_nps;
    if (drop >= minDrop) {
      const dedupKey = `alert:dedup:${orgId}:${rule.id}:${row.survey_id}:${windowDays}d`;
      const alreadyFired = await redis.get(dedupKey);
      if (alreadyFired) continue;
      
      // Get Crystal narration (async, with 10s timeout)
      const narration = await getCrystalNarration(orgId, row.survey_id, {
        alertType: 'S-01', drop, current: row.current_nps, prior: row.prior_nps
      });
      
      // Insert alert_event
      const alertId = await insertAlertEvent({ orgId, rule, surveyId: row.survey_id,
        title: `NPS dropped ${Math.round(drop)} points`,
        description: `NPS fell from ${Math.round(row.prior_nps)} to ${Math.round(row.current_nps)}`,
        crystalNarration: narration.text, crystalAction: narration.action,
        metricValue: row.current_nps, metricBaseline: row.prior_nps, metricChange: -drop
      });
      
      // Publish to notification stream
      await publishAlertNotification(orgId, alertId, rule.severity);
      
      // Set dedup
      const ttl = rule.severity === 'critical' ? 86400 : rule.severity === 'warning' ? 21600 : 3600;
      await redis.set(dedupKey, '1', 'EX', ttl);
    }
  }
}
```

#### Crystal narration for alerts (new CrystalOS endpoint):

New route in `crystalos/main.py`:
```python
@router.post("/api/crystal/alert-narration")
async def alert_narration(request: AlertNarrationRequest, _: None = Depends(require_internal_key)):
    """Generate Crystal narration for a fired alert. Returns text + action within 10s."""
    # Use the alert-narrator skill
    result = await skill_registry.execute("alert-narrator", {
        "alert_type": request.alert_type,
        "survey_id": request.survey_id,
        "org_id": request.org_id,
        "metric_value": request.metric_value,
        "metric_baseline": request.metric_baseline,
        "evidence": request.evidence,
    })
    return {"text": result.text, "action": result.action}
```

New skill: `crystalos/skills/alert-narrator/SKILL.md` — prompts Crystal to produce a 200-word narration following the template: {WHAT changed} — {MAGNITUDE} {DIRECTION} {TIME WINDOW}. {WHY}: {top factor}. {WHERE}. RECOMMENDED ACTION: {step}.

---

### 5.3 Dashboard — Analytics API Layer

#### New backend routes (`backend/src/routes/analytics.js` — new file):

```javascript
// GET /api/analytics/kpis — KPI tiles
router.get('/kpis', requireAuth, async (req, res) => {
  const { dateFrom, dateTo, surveyIds } = parseAnalyticsFilter(req.query);
  
  // Use nps_daily_agg materialized view for the current period
  const { rows: current } = await db.query(`
    SELECT
      ROUND(AVG(nps), 1)            AS nps,
      SUM(response_count)           AS response_count,
      COUNT(DISTINCT survey_id)     AS survey_count
    FROM nps_daily_agg
    WHERE org_id = $1
      AND day >= $2 AND day <= $3
      ${surveyIds ? 'AND survey_id = ANY($4)' : ''}
  `, surveyIds ? [req.orgId, dateFrom, dateTo, surveyIds] : [req.orgId, dateFrom, dateTo]);
  
  // Prior period (same window length, shifted back)
  const priorFrom = shiftDate(dateFrom, -(dateTo - dateFrom));
  const { rows: prior } = await db.query(`...same query with priorFrom/dateFrom...`);
  
  // Insight count from live insights table
  const { rows: insights } = await db.query(`
    SELECT COUNT(*) AS count FROM insights
    WHERE org_id = $1 AND generated_at >= $2 AND superseded_at IS NULL
  `, [req.orgId, dateFrom]);
  
  res.json({
    nps: { current: Number(current[0].nps), prior: Number(prior[0].nps),
            change: Number(current[0].nps) - Number(prior[0].nps) },
    responseCount: { current: Number(current[0].response_count),
                     prior: Number(prior[0].response_count) },
    crystalInsightCount: Number(insights[0].count)
  });
});

// GET /api/analytics/nps-trend — time series for chart
router.get('/nps-trend', requireAuth, async (req, res) => {
  const { dateFrom, dateTo, surveyIds } = parseAnalyticsFilter(req.query);
  
  // Main series from materialized view (fast)
  const { rows: series } = await db.query(`
    SELECT day AS date, ROUND(nps, 1) AS nps, response_count
    FROM nps_daily_agg
    WHERE org_id = $1 AND day >= $2 AND day <= $3
    ORDER BY day ASC
  `, [req.orgId, dateFrom, dateTo]);
  
  // Crystal anomaly annotations from insights table
  const { rows: anomalies } = await db.query(`
    SELECT DATE_TRUNC('day', generated_at) AS day, headline, category
    FROM insights
    WHERE org_id = $1 AND category LIKE 'anomaly%' AND superseded_at IS NULL
      AND generated_at >= $2
    ORDER BY priority DESC LIMIT 10
  `, [req.orgId, dateFrom]);
  
  // Merge anomaly markers into series
  // ...
  
  res.json({ series, prediction: [] }); // prediction populated by Crystal skill
});

// GET /api/analytics/surveys/health
router.get('/surveys/health', requireAuth, async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      s.id, s.title, s.status,
      COUNT(r.id)                                           AS response_count,
      MAX(r.submitted_at)                                   AS last_response_at,
      ar.status                                             AS crystal_status,
      ROUND(AVG(r.nps_score), 1)                           AS nps
    FROM surveys s
    LEFT JOIN responses r ON r.survey_id = s.id
    LEFT JOIN LATERAL (
      SELECT status FROM agent_runs
      WHERE survey_id = s.id AND run_type = 'insight_generation'
      ORDER BY created_at DESC LIMIT 1
    ) ar ON TRUE
    WHERE s.org_id = $1 AND s.deleted_at IS NULL AND s.status != 'closed'
    GROUP BY s.id, s.title, s.status, ar.status
    ORDER BY response_count DESC
  `, [req.orgId]);
  res.json({ surveys: rows });
});

// POST /api/analytics/crystal/narrative — triggers CrystalOS narrative generation
router.post('/crystal/narrative', requireAuth, async (req, res) => {
  const { filterState } = req.body;
  // Call CrystalOS dashboard-narrator skill
  const result = await agentsClient.post('/api/crystal/dashboard-narrative', {
    orgId: req.orgId, filterState
  });
  res.json(result.data);
});
```

#### nps_daily_agg refresh (Event Engine scheduler):

```javascript
// In event-engine/src/scheduler.js
cron.schedule('*/5 * * * *', async () => {
  // REFRESH MATERIALIZED VIEW CONCURRENTLY is non-blocking — uses the unique index
  await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY nps_daily_agg');
});
```

#### WebSocket events for live dashboard:

When a response is submitted (`backend/src/routes/responses.js`), after inserting:
```javascript
// Publish to dashboard channel for real-time tile updates
await redis.publish(`dashboard:live:${orgId}`, JSON.stringify({
  event: 'response_received',
  surveyId: survey.id,
  count: newCount
}));
```

Backend Socket.IO subscribes to `dashboard:live:{orgId}` and emits `dashboard:response_received` to all sockets in `org:{orgId}` room.

#### New Crystal skill: `crystalos/skills/dashboard-narrator/`
Generates 3-paragraph executive brief from KPI + trend + topic data. Called via `POST /api/crystal/dashboard-narrative`. Cached 15 minutes per filter state in Redis (`dashboard:narrative:{orgId}:{filterHash}`).

---

### 5.4 Visual AI — Extend CrystalOS + New Survey Question Types

#### New survey question types (no schema change needed):

The `surveys.questions` column is already `JSONB NOT NULL DEFAULT '[]'`. Adding new question types is purely additive — the array accepts any type string. New types to support:

```json
{ "id": "q4", "type": "image_upload", "text": "Take a photo of your experience",
  "config": { "maxImages": 5, "maxSizeMB": 10, "acceptedFormats": ["jpeg","png","heic","webp"],
               "optional": true, "blurFaces": true } }

{ "id": "q2", "type": "image_choice",
  "options": [{ "label": "Excellent", "imageUrl": "..." }, { "label": "Good", "imageUrl": "..." }] }

{ "id": "q5", "type": "image_annotation",
  "config": { "baseImageUrl": "https://storage.../screenshot.jpg" } }

{ "id": "q3", "type": "emoji_rating", "scale": 5,
  "emojis": ["😠","😞","😐","😊","😄"] }
```

The insight pipeline's `extract_signals_from_response()` in `graphs/insights.py` already uses `qtype` to route signals. Add new cases:
- `image_upload` → store media reference in signals, trigger async analysis
- `image_annotation` → store click coordinates, aggregate as heatmap data
- `emoji_rating` → treat as numeric rating (1-5)

#### Image upload endpoint (`backend/src/routes/visual.js` — new file):

```javascript
// POST /api/visual/upload — multipart form upload
// Uses multer for parsing, uploads to Firebase Storage
router.post('/upload', requireAuth, upload.array('images', 5), async (req, res) => {
  const { surveyId, questionId, responseId } = req.body;
  const results = [];
  
  for (const file of req.files) {
    // 1. Safety check (size, MIME type)
    // 2. Upload to Firebase Storage: gs://org/{orgId}/surveys/{surveyId}/responses/{responseId}/{uuid}.jpg
    const storageUrl = await uploadToFirebaseStorage(file, req.orgId, surveyId);
    
    // 3. Insert into survey_media
    const { rows } = await db.query(
      `INSERT INTO survey_media (org_id, survey_id, response_id, question_id, media_type, original_url, mime_type, file_size_bytes)
       VALUES ($1,$2,$3,$4,'image',$5,$6,$7) RETURNING id`,
      [req.orgId, surveyId, responseId, questionId, storageUrl, file.mimetype, file.size]
    );
    
    // 4. Queue async analysis (CrystalOS)
    await redis.xadd('visual:analysis:queue', '*',
      'mediaId', rows[0].id, 'orgId', req.orgId, 'surveyId', surveyId);
    
    results.push({ mediaId: rows[0].id, url: storageUrl, status: 'queued' });
  }
  res.json({ results });
});

// POST /api/visual/generate-chart — Crystal chart generation
router.post('/generate-chart', requireAuth, async (req, res) => {
  const { description, data, style = 'default' } = req.body;
  const result = await agentsClient.post('/api/visual/generate-chart', {
    description, data, style, orgId: req.orgId
  });
  
  // Store in generated_charts for reuse
  const { rows } = await db.query(
    `INSERT INTO generated_charts (org_id, query, vega_lite_spec, headline, explanation, data_snapshot, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [req.orgId, description, result.data.chartSpec, result.data.headline, result.data.explanation,
     JSON.stringify(data), req.userId]
  );
  
  res.json({ ...result.data, chartId: rows[0].id });
});
```

#### New CrystalOS skills:

**`crystalos/skills/visual-analyst/`** — image analysis skill:
- Input: `image_url`, `analysis_type`, `context` (survey context)
- Calls Claude claude-sonnet-4-6 Vision API with `IMAGE_SENTIMENT_PROMPT`
- Output: structured JSON with `overall_sentiment`, `sentiment_score`, `detected_objects`, `extracted_text`, `quality_indicators`, `concerns`, `confidence`
- Privacy: always instructs model to ignore/not describe identifiable faces unless consent_given=true

**`crystalos/skills/chart-generator/`** — Vega-Lite chart generation skill:
- Input: `description` (natural language), `data_schema`, `data_sample`
- Uses `CHART_GENERATION_SYSTEM_PROMPT` from design doc
- Output: validated Vega-Lite v5 JSON + headline + explanation
- Validation: parses JSON output, rejects if not valid Vega-Lite structure (max 2 retries)
- Exposed via `POST /api/visual/generate-chart` endpoint in CrystalOS

New Crystal tools (add to `crystal/registry.py` and `crystal/tools.py`):

```python
# In TOOL_REGISTRY (crystal/registry.py):
{
    "name": "generate_chart",
    "description": "Generate a Vega-Lite chart specification from data and a natural language description. Returns chartSpec JSON + headline + explanation.",
    "scope": "survey",
    "input_schema": {
        "type": "object",
        "properties": {
            "description": {"type": "string"},
            "data": {"type": "object"},
            "chart_type": {"type": "string", "description": "Optional hint: bar|line|area|donut|scatter|heatmap"}
        },
        "required": ["description", "data"]
    }
},
{
    "name": "analyze_image",
    "description": "Analyze an image URL and return sentiment, detected objects, extracted text, and quality indicators.",
    "scope": "survey",
    "input_schema": {
        "type": "object",
        "properties": {
            "image_url": {"type": "string"},
            "analysis_type": {"type": "string", "enum": ["sentiment", "objects", "text", "full"]}
        },
        "required": ["image_url"]
    }
}
```

#### Storage: Firebase Storage already used by surveys (the existing survey question images). Image uploads follow the same pattern:
- Path: `gs://{FIREBASE_STORAGE_BUCKET}/orgs/{orgId}/surveys/{surveyId}/responses/{responseId}/{uuid}.{ext}`
- Backend uses Firebase Admin SDK (already available if Firebase is wired for auth/hosting)
- Signed URLs (time-limited) for Crystal's multimodal API calls — images never exposed publicly

---

### 5.5 Workflow System — Expand Existing Backend + Event Engine

#### Existing `workflows.js` gaps and what changes:

The existing `workflows.js` routes work correctly for the flat model. They continue to work — existing `condition`/`action` JSONB columns are preserved. New graph workflows use the new `nodes`/`edges` columns.

**Extend existing routes:**
```javascript
// PUT /:id — now also accepts nodes/edges
if (nodes !== undefined) { sets.push(`nodes = $${i++}`); vals.push(JSON.stringify(nodes)); }
if (edges !== undefined) { sets.push(`edges = $${i++}`); vals.push(JSON.stringify(edges)); }
```

**New routes to add to `workflows.js`:**
```javascript
// POST /:id/activate — sets status='active', validates graph has at least one trigger and one action
router.post('/:id/activate', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM workflows WHERE id=$1 AND org_id=$2', [req.params.id, req.orgId]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const workflow = rows[0];
  // Validate graph structure
  const nodes = workflow.nodes;
  const hasTrigger = nodes.some(n => n.type === 'trigger');
  const hasAction = nodes.some(n => ['slack','email','crystal','jira','webhook','notify'].includes(n.type));
  if (!hasTrigger || !hasAction) return res.status(400).json({ error: 'Workflow must have at least one trigger and one action node' });
  
  await db.query(`UPDATE workflows SET status='active', updated_at=NOW() WHERE id=$1 AND org_id=$2`, [req.params.id, req.orgId]);
  
  // Register trigger subscriptions in workflow_triggers
  for (const node of nodes.filter(n => n.type === 'trigger')) {
    await db.query(
      `INSERT INTO workflow_triggers (workflow_id, trigger_type, trigger_config, cron_expression)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [req.params.id, node.config.triggerType, JSON.stringify(node.config), node.config.cronExpression]
    );
  }
  res.json({ success: true });
});

// GET /:id/executions — execution history
// GET /:id/executions/:eid — execution detail with steps
// POST /:id/executions/:eid/retry

// GET /templates — list workflow_templates
// POST /templates/:id/use — clone template into a new workflow

// GET /connectors — list workflow_connector_credentials for org
// POST /connectors — connect integration (store encrypted credentials)
```

#### Workflow Execution Engine (Event Engine `src/workflow-executor.js`):

Uses BullMQ (successor to Bull, same Redis-backed semantics):

```javascript
import { Queue, Worker } from 'bullmq';

const workflowQueue = new Queue('wf:execution', { connection: redisConfig });

// Trigger Listener: when an event fires (from Redis Stream or cron)
async function onTriggerEvent(event) {
  // Find all active workflows that subscribe to this trigger type
  const { rows: triggers } = await db.query(
    `SELECT wt.workflow_id, w.org_id, w.nodes, w.edges
     FROM workflow_triggers wt
     JOIN workflows w ON w.id = wt.workflow_id
     WHERE wt.trigger_type = $1 AND wt.is_active = TRUE AND w.status = 'active'
       AND w.org_id = $2 AND w.deleted_at IS NULL`,
    [event.type, event.orgId]
  );
  
  for (const trigger of triggers) {
    // Create execution record
    const { rows } = await db.query(
      `INSERT INTO workflow_executions (workflow_id, org_id, trigger_type, trigger_payload)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [trigger.workflow_id, trigger.org_id, event.type, JSON.stringify(event.payload)]
    );
    
    // Enqueue execution job
    await workflowQueue.add('execute', {
      executionId: rows[0].id,
      workflowId: trigger.workflow_id,
      orgId: trigger.org_id,
      nodes: trigger.nodes,
      edges: trigger.edges,
      triggerPayload: event.payload
    });
  }
}

// Execution Worker
const worker = new Worker('wf:execution', async (job) => {
  const { executionId, workflowId, orgId, nodes, edges, triggerPayload } = job.data;
  
  await db.query(`UPDATE workflow_executions SET status='executing', started_at=NOW() WHERE id=$1`, [executionId]);
  
  // Execute graph step by step (topological sort from trigger node)
  const executor = new WorkflowGraphExecutor({ nodes, edges, executionId, orgId, triggerPayload });
  await executor.run();
  
  await db.query(`UPDATE workflow_executions SET status='completed', completed_at=NOW() WHERE id=$1`, [executionId]);
  await db.query(`UPDATE workflows SET run_count = run_count+1, success_count=success_count+1, last_run_at=NOW(), last_status='completed' WHERE id=$1`, [workflowId]);
}, { connection: redisConfig, concurrency: 10 });
```

#### Crystal workflow-action endpoint (new in CrystalOS):

```python
# In crystalos/main.py
@router.post("/api/crystal/workflow-action")
async def workflow_action(request: WorkflowActionRequest, _=Depends(require_internal_key)):
    """Execute a Crystal AI step in a workflow. Returns structured JSON output."""
    task = request.task  # 'analyze' | 'summarize' | 'classify' | 'write' | 'decide'
    
    if task == 'analyze':
        return await run_crystal_analysis(request.context)
    elif task == 'summarize':
        return await run_summary_skill(request.context, request.output_schema)
    elif task == 'classify':
        return await run_classification(request.context, request.output_schema)
    elif task == 'write':
        return await run_write_task(request.context, request.instructions, request.format)
    elif task == 'decide':
        return await run_decision(request.context, request.options)
```

No circular dependency risk: Event Engine calls CrystalOS HTTP endpoint. CrystalOS does not call Event Engine. The dependency graph is: `Backend` → `CrystalOS` and `Event Engine` → `CrystalOS`. CrystalOS has no outbound HTTP calls to other services.

#### Integration connectors (`event-engine/src/connectors/`):

- **`slack.js`** — Uses `@slack/web-api`. Auth via stored OAuth token from `workflow_connector_credentials`. Sends Block Kit messages. Idempotency via `X-Slack-No-Retry` header + idempotency key in metadata.
- **`email.js`** — Uses `@sendgrid/mail`. Auth via SendGrid API key stored per org. Supports HTML templates + Crystal-generated body.
- **`jira.js`** — Uses `jira-client` npm package. Auth via API token (stored per org). Creates issues with Crystal-written description in Jira's Atlassian Document Format.
- **`webhook.js`** — Plain `node-fetch` with HMAC-SHA256 signature on payload (`X-Experient-Signature` header). 3 retries with exponential backoff.

---

## 6. Event Engine Design

### 6.1 Technology Choice: Node.js

**Justified because:**
1. Same language as backend — `db.js`, `rateLimiter`, and `httpError` patterns are directly shareable
2. BullMQ is the Node.js gold standard for durable queues (mature, tested at billions of jobs/day at major companies)
3. Socket.IO pub/sub integration is seamless — same ecosystem as the backend's Socket.IO server
4. Connector SDKs (Slack, SendGrid, Jira) are first-class Node.js
5. `node-cron` provides reliable cron scheduling identical to Python's APScheduler but with better Bull integration

### 6.2 Directory Structure

```
event-engine/
  src/
    index.js                  -- entry point, starts all workers + scheduler
    db.js                     -- pg Pool (copy of backend's db.js)
    redis.js                  -- ioredis singleton + BullMQ connection config
    notification-worker.js    -- reads notifications:events:* streams, writes notifications table
    alert-evaluator.js        -- scheduled + real-time alert rule evaluation
    workflow-executor.js      -- BullMQ worker for workflow execution
    workflow-trigger.js       -- Redis Stream + cron listener that enqueues execution jobs
    scheduler.js              -- node-cron jobs (nps_daily_agg refresh, snooze expiry)
    connectors/
      slack.js
      email.js
      jira.js
      webhook.js
      pagerduty.js
    lib/
      crystalos-client.js     -- HTTP client for CrystalOS (mirrors agentsClient.js in backend)
      notification-publisher.js -- helper to write to notifications:events:* stream
      alert-processor.js      -- shared alert firing logic (dedup, insert, notify)
  package.json
  Dockerfile
```

### 6.3 Entry Point (`src/index.js`):

```javascript
import { startNotificationWorker } from './notification-worker.js';
import { startAlertEvaluator } from './alert-evaluator.js';
import { startWorkflowExecutor } from './workflow-executor.js';
import { startWorkflowTriggerListener } from './workflow-trigger.js';
import { startScheduler } from './scheduler.js';
import { initPool } from './db.js';
import { initRedis } from './redis.js';

async function main() {
  await initPool();
  await initRedis();
  
  await startNotificationWorker();
  await startAlertEvaluator();
  await startWorkflowExecutor();
  await startWorkflowTriggerListener();
  startScheduler();
  
  console.log('[event-engine] All workers started');
}

main().catch(err => { console.error(err); process.exit(1); });
```

### 6.4 Notification Worker — Critical Implementation Detail

The notification worker uses Redis Streams consumer groups for at-least-once delivery. When the worker crashes mid-processing, XPENDING will show unacknowledged messages, and the redelivery timeout (30s) will re-deliver them. The worker must be idempotent — checking `notification_dedup` before inserting ensures no duplicate notifications even on redelivery.

```javascript
export async function startNotificationWorker() {
  const GROUP = 'notification-processor';
  const CONSUMER = `notif-worker-${process.env.HOSTNAME || 'local'}`;
  
  // Create consumer group if not exists
  for (const stream of ['notifications:events:*']) {
    try {
      await redis.xgroupCreate(stream, GROUP, '0', { MKSTREAM: true });
    } catch (e) { /* group exists */ }
  }
  
  // Main loop
  while (true) {
    // Read from all org streams (using pattern-based discovery: scan for notifications:events:* keys)
    const orgIds = await getActiveOrgIds(); // SELECT DISTINCT org_id FROM surveys WHERE status='active'
    
    for (const orgId of orgIds) {
      const streamKey = `notifications:events:${orgId}`;
      const messages = await redis.xreadgroup(GROUP, CONSUMER, streamKey, '>', { COUNT: 50, BLOCK: 1000 });
      
      for (const [id, fields] of messages || []) {
        await processNotificationEvent(fields, orgId);
        await redis.xack(streamKey, GROUP, id);
      }
    }
  }
}

async function processNotificationEvent(fields, orgId) {
  const { type, entityType, entityId, priority, payload } = fields;
  
  // Dedup check
  const dedupKey = `${orgId}:${type}:${entityId}`;
  const windowStart = new Date(Math.floor(Date.now() / 3600000) * 3600000); // 1h window
  const ttlSec = priority === 'critical' ? 86400 : priority === 'warning' ? 21600 : 3600;
  const expires_at = new Date(Date.now() + ttlSec * 1000);
  
  try {
    await db.query(
      `INSERT INTO notification_dedup (org_id, event_type, entity_id, window_start, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [orgId, type, entityId || '', windowStart, expires_at]
    );
  } catch (e) {
    if (e.code === '23505') return; // duplicate — skip
    throw e;
  }
  
  // Find recipients from notification_preferences
  const recipients = await getRecipients(orgId, type);
  
  // Get Crystal narration if this is a Crystal-eligible event type
  let crystalSummary = null;
  if (CRYSTAL_NARRATED_EVENTS.includes(type)) {
    crystalSummary = await getCrystalNarration(orgId, entityId, type, payload);
  }
  
  // Insert one row per recipient
  for (const recipient of recipients) {
    const { rows } = await db.query(
      `INSERT INTO notifications (org_id, user_id, type, priority, title, body, action_url, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [orgId, recipient.user_id, type, priority,
       buildTitle(type, payload), buildBody(type, payload),
       buildActionUrl(type, entityType, entityId),
       entityType, entityId,
       JSON.stringify({ ...JSON.parse(payload || '{}'), crystalSummary })]
    );
    
    // Get unread count for badge update
    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) FROM notifications WHERE org_id=$1 AND user_id=$2 AND read_at IS NULL AND deleted_at IS NULL',
      [orgId, recipient.user_id]
    );
    
    // Push to WebSocket gateway via Redis pub/sub
    await redis.publish(`notifications:live:${recipient.user_id}`, JSON.stringify({
      ...rows[0],
      _unreadCount: Number(countRows[0].count)
    }));
  }
}
```

### 6.5 Docker Compose Addition

```yaml
  event-engine:
    <<: *built-platform
    profiles: ["agents", "prod"]
    build:
      context: .
      dockerfile: event-engine/Dockerfile
    image: experient-event-engine:local
    container_name: experient-event-engine
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/experient
      REDIS_URL: redis://redis:6379
      CRYSTALOS_URL: http://agents:8001
      CRYSTALOS_INTERNAL_KEY: ${AGENTS_INTERNAL_KEY:-dev-internal-key-change-in-prod}
      NODE_ENV: ${NODE_ENV:-development}
      SENDGRID_API_KEY: ${SENDGRID_API_KEY:-}
      SLACK_CLIENT_ID: ${SLACK_CLIENT_ID:-}
      SLACK_CLIENT_SECRET: ${SLACK_CLIENT_SECRET:-}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      agents:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3002/health', r => process.exit(r.statusCode === 200 ? 0 : 1))\""]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
```

---

## 7. Scaling Strategy

### 7.1 Backend API (Node.js Express)

**Now:** Single process, single Fly.io machine  
**At 1K concurrent orgs:** Deploy 2–3 machines behind Fly.io's built-in load balancer. Socket.IO requires sticky sessions OR use Redis adapter (`socket.io-redis`) to share WebSocket state across instances. Add `@socket.io/redis-adapter` and configure in `index.js`.  
**At 10K orgs:** Enable Fly.io autoscaling based on CPU/memory metrics. PgBouncer connection pooling (port 5433) to prevent Postgres connection exhaustion. Redis rate limiter already cluster-aware via ioredis.

### 7.2 Event Engine

**Now:** Single process handles all workers  
**At 1K concurrent orgs:** Add `concurrency: N` to BullMQ workers. Bull handles coordination — multiple worker instances compete for jobs from the same queue, Redis handles locking. No code changes needed; just run multiple containers.  
**At 10K orgs:** Separate the notification worker, alert evaluator, and workflow executor into separate containers. Each scales independently based on queue depth (Prometheus metric: `bull_queue_size`).  
**At 100K orgs:** Per-org Redis Streams become impractical (too many streams). Consolidate to `notifications:events:all` with `orgId` in the message body. Shard by orgId mod N across N consumer groups.

### 7.3 CrystalOS (Python FastAPI)

**Now:** Single Fly.io app, separate from backend  
**At 1K orgs:** Already independently scaled. Add replica count to `fly.toml`. CrystalOS's own rate limiting (Redis sliding window) prevents overload from a single org.  
**At 10K orgs:** LLM cost dominates. Add semantic caching (already in L1 memory layer) to avoid re-running identical Crystal queries. Cache hit rate target: >40% for common patterns.

### 7.4 Postgres

**Now:** Single Postgres instance (Docker or managed)  
**At 10K responses/day:** Add read replica for analytics queries. Route `GET /api/analytics/*` to read replica via `DATABASE_REPLICA_URL` env var. Writes (response submission, notification insert) stay on primary.  
**At 100K responses/day:** Partition `responses` table by `org_id` hash (Postgres native partitioning) to keep analytics queries on a per-org slice. Materialized view refresh window increases to 15 minutes. Consider TimescaleDB extension for `nps_daily_agg` hypertable (automatic time-based partitioning).

**PgBouncer:** Add to docker-compose when running > 10 concurrent backend instances. Configuration: transaction-mode pooling, max 20 connections per service.

### 7.5 Redis

**Now:** Single Redis 7 instance  
**At 100K events/day:** Increase `maxmemory` to 2GB. Enable AOF persistence for stream durability. Consider `XAUTOCLAIM` for efficient stale message recovery.  
**At 1M events/day:** Redis Cluster (3 shards × 2 replicas). Shard notification streams by orgId hash. BullMQ supports Redis Cluster natively.  
**Kafka replacement:** When per-org stream fan-out overwhelms Redis (> 50K orgs active simultaneously), replace `notifications:events:*` streams with Apache Kafka (single topic with orgId partition key). The notification worker interface stays the same — swap the consumer implementation.

### 7.6 Scale Thresholds Summary

| Scale | Trigger | Action |
|-------|---------|--------|
| 1K concurrent orgs | CPU > 70% on backend/event-engine | Add Fly.io replicas, add Socket.IO Redis adapter |
| 10K responses/day | Postgres query latency > 100ms | Add read replica for analytics routes |
| 100K events/day | Redis memory > 1GB | Increase Redis instance, configure maxmemory-policy allkeys-lru |
| 10K active workflows | BullMQ queue depth > 1K | Add workflow-executor containers, separate from notif/alert workers |
| 1M events/day | Redis Streams throughput limit | Migrate to Kafka, keep Event Engine worker interface identical |

---

## 8. Local Development Setup

### 8.1 Updated docker-compose.yml

Add the `event-engine` service to the existing `docker-compose.yml`. The file already has `postgres`, `redis`, `prometheus`, `loki`, `grafana`, and `agents`. Add:

```yaml
  event-engine:
    <<: *built-platform
    profiles: ["agents", "prod"]
    build:
      context: .
      dockerfile: event-engine/Dockerfile
    image: experient-event-engine:local
    container_name: experient-event-engine
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/experient
      REDIS_URL: redis://redis:6379
      CRYSTALOS_URL: http://agents:8001
      CRYSTALOS_INTERNAL_KEY: ${AGENTS_INTERNAL_KEY:-dev-internal-key-change-in-prod}
      NODE_ENV: development
      LOG_LEVEL: debug
      NOTIFICATION_STREAM_MAXLEN: "10000"
      NOTIFICATION_WORKER_CONCURRENCY: "3"
      ALERT_EVAL_INTERVAL_MIN: "15"
      WORKFLOW_EXECUTOR_CONCURRENCY: "5"
    ports:
      - "3002:3002"   # health endpoint
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
```

### 8.2 Environment Variables — Complete List

**Backend (`backend/.env`):**
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/experient
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=<key>
AGENTS_INTERNAL_KEY=dev-internal-key-change-in-prod
CLERK_SECRET_KEY=<key>
ALLOWED_ORIGIN=http://localhost:5173
SKIP_AUTH=true  # local dev only
CRYSTALOS_URL=http://localhost:8001
SENDGRID_API_KEY=  # leave empty in dev — email actions are no-ops
```

**Event Engine (`event-engine/.env`):**
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/experient
REDIS_URL=redis://localhost:6379
CRYSTALOS_URL=http://localhost:8001
CRYSTALOS_INTERNAL_KEY=dev-internal-key-change-in-prod
NODE_ENV=development
NOTIFICATION_STREAM_MAXLEN=10000
ALERT_EVAL_INTERVAL_MIN=15
WORKFLOW_EXECUTOR_CONCURRENCY=5
SENDGRID_API_KEY=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

**CrystalOS (`crystalos/.env`):**
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/experient
AGENTS_DB_DSN=postgresql://postgres:postgres@localhost:5432/experient
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=<key>
ANTHROPIC_API_KEY=<key>  # for Claude Vision in visual-analyst skill
AGENTS_INTERNAL_KEY=dev-internal-key-change-in-prod
AGENTS_ENV=dev
USE_SKILL_RUNTIME=true
ENABLE_STREAM_CONSUMER=true
ENABLE_SCHEDULER=true
```

### 8.3 Startup Order

```bash
# Step 1: Infrastructure
docker-compose up -d postgres redis

# Step 2: Run migrations (first time only or after new migration files)
cd supabase && npx supabase db reset  # OR: psql -f migrations/*.sql

# Step 3: Start backend
cd backend && npm start   # port 3001

# Step 4: Start CrystalOS (optional for AI features)
cd crystalos && make run-dev  # port 8001

# Step 5: Start Event Engine (optional for notifications/alerts/workflows)
cd event-engine && npm run dev  # port 3002

# Step 6: Start frontend
cd app && npm run dev   # port 5173
```

### 8.4 Health Checks

| Service | Health endpoint | Expected |
|---------|----------------|---------|
| Backend | `GET http://localhost:3001/health` | `{"status":"ok"}` |
| CrystalOS | `GET http://localhost:8001/health` | `{"status":"ok"}` |
| Event Engine | `GET http://localhost:3002/health` | `{"status":"ok","queues":{"wf:execution":0}}` |
| Redis | `redis-cli ping` | `PONG` |
| Postgres | `pg_isready -U postgres -d experient` | exit 0 |

---

## 9. Team Integration Review

This section documents the design decisions and integration points discussed by the architecture team.

---

**Emma (Platform Expert):** "The existing `workflows` table has `condition` and `action` as flat JSONB — it can't represent a graph of nodes and edges. We need to either add `nodes` and `edges` JSONB columns or create a new `workflows_v2` table. The existing `WorkflowsPage.tsx` fetches from `/api/workflows` and renders the list. I don't want to break that."

**Marcus (Backend):** "I'd add columns to the existing `workflows` table with a migration. `workflows_v2` creates confusion — two tables with overlapping responsibilities, both in the API. The existing `GET /` route just does `SELECT * FROM workflows WHERE org_id = $1` — it already returns whatever columns exist. Adding `nodes` and `edges` columns is backward-safe: existing rows will have empty arrays `[]` for those columns."

**Aria (Architect):** "Agreed. `ALTER TABLE workflows ADD COLUMN nodes JSONB NOT NULL DEFAULT '[]', ADD COLUMN edges JSONB NOT NULL DEFAULT '[]'`. The old `condition`/`action` columns stay. We also need to extend the status CHECK to include `'draft'` and `'archived'` — the existing constraint only allows `'active'` and `'paused'`. Migration 20260603000014 handles all of this."

**Jorge (CrystalOS):** "For the Crystal workflow action endpoint — I want to be very explicit that Crystal never executes write operations directly. The `crystal.decide` output is structured JSON that the workflow executor interprets. Crystal returns `{decision: 'escalate', reason: '...'}` and the If/Else branch in the executor routes accordingly. Crystal doesn't know about Slack or Jira."

**Marcus:** "Right. And the Crystal workflow endpoint in CrystalOS needs to be fast — the workflow executor has a 120s timeout for Crystal steps, but users will see the workflow 'running' for that long. We should stream the Crystal response? Or just accept the latency?"

**Jorge:** "For workflow Crystal steps, synchronous is correct. We don't want streaming in a workflow context — the downstream steps need Crystal's full output to proceed. The 120s timeout is generous; most `analyze` calls complete in 8-15s. The `write` task (Crystal writing a Slack message) should be < 5s."

**Aria:** "Confirmed. Synchronous POST with 120s timeout for Crystal workflow steps."

---

**Emma:** "On the notifications integration — I see that Crystal publishes `crystal.insight_ready` when the insight pipeline completes. But the pipeline runs asynchronously and the publish happens in `node_publish` in `graphs/insights.py`. We need to make sure the `notification_bridge.py` call doesn't fail silently and lose the notification."

**Jorge:** "The notification bridge publish is a Redis XADD — it's O(1) and almost never fails. If Redis is down, we catch the exception and log it. We should NOT retry the entire insight pipeline because the Redis notification failed. The notification is best-effort; the insight was already persisted to Postgres. Users can always see new insights by loading the page — the notification is just a convenience."

**David (SRE):** "Agreed on best-effort for notification publish. But I want a Prometheus counter for `notification_bridge_publish_failed` so we can alert on Redis connectivity issues separately from pipeline failures."

**Jorge:** "Done. Adding to `crystalos/lib/metrics.py`."

---

**Emma:** "The alert evaluator runs every 15 minutes in the Event Engine. It queries `responses` to compute rolling NPS. At 10K+ surveys, that's a lot of full table scans — 15 minutes might not be enough buffer."

**Marcus:** "That's why `nps_daily_agg` matters so much. The alert evaluator for S-01 (NPS drop) should query `nps_daily_agg` for the last 14 days rather than scanning `responses`. For orgs on the free tier (no paid compute), we can use a coarser window — 1-day granularity is fine for trend-based alerts."

**Aria:** "Alert evaluator architecture: use `nps_daily_agg` for all trend-based alerts (S-01, S-02, S-04). Use `responses` directly only for real-time alerts (V-03 volume spike — needs the last hour of data). Add a `created_at` partial index on `responses` for the last-hour queries: `CREATE INDEX responses_recent ON responses(org_id, submitted_at DESC) WHERE submitted_at > NOW() - INTERVAL '2 hours'` — but partial indexes with NOW() don't persist, so just ensure the `(org_id, submitted_at)` composite index exists."

---

**Emma:** "On the dashboard analytics API — when a user applies a segment filter (e.g., 'mobile users only'), the `nps_daily_agg` materialized view doesn't have segment columns. We'd have to fall back to querying `responses` directly."

**Marcus:** "Correct. The materialized view is for the unfiltered, aggregate case (what most users see most of the time). When a segment filter is applied, we fall back to a direct `responses` query with the segment condition in the `answers` JSONB. This is fine for interactive queries — just add a note in the API that segment-filtered queries may be slower."

**Aria:** "Future: if segment-filtered queries become a performance issue, we can add a `responses_materialized_segments` view that pre-computes common segment splits (mobile/desktop, high/low NPS). But that's premature optimization — defer to Sprint 6."

---

**Emma:** "How does the Visual AI image upload integrate with the existing Firebase Storage that surveys already use? The survey builder already uploads images for logo and branding."

**Marcus:** "Firebase Storage is already configured in the project (used for survey branding assets). The image upload endpoint uses the same Firebase Admin SDK. Path convention: `orgs/{orgId}/surveys/{surveyId}/responses/{responseId}/{uuid}.jpg`. We add `FIREBASE_STORAGE_BUCKET` to the backend's env vars. For the respondent-facing survey (served via `public.js`), we also need to accept uploads — the public route currently doesn't require auth. We handle this via the `publish_token` — image uploads to `/api/public/{surveyToken}/upload` validate the survey token and write to the correct path."

**Aria:** "Add a public upload endpoint: `POST /api/public/:token/media/upload`. Rate-limited more aggressively than authenticated routes (5 uploads per IP per hour via in-memory limiter). The media ID is stored alongside the response answer in `answers.imageUploadIds: [uuid, ...]`. The `survey_media` row is created at upload time, linked to `response_id = NULL` (filled in when the response is submitted)."

---

**Emma:** "For the workflow system's Crystal step — Patricia Holloway's NPS Recovery workflow has Crystal analyze, then the output goes to Slack and Jira in parallel. The Execution Engine runs parallel branches. If Slack succeeds but Jira fails on the first try, does the retry re-run both Slack and Jira or just Jira?"

**Marcus:** "Each step has its own `idempotency_key` stored in `workflow_step_executions`. On retry, we check if a step with `status='completed'` exists for that `(execution_id, node_id)`. If yes, skip it and return the stored output. If no, run it. So Slack (already completed) would be skipped; Jira would be retried. This requires idempotency on the Slack side too — we send the same `X-Idempotency-Key` header, and Slack deduplicates on their end for 30 minutes."

**Aria:** "Correct implementation. The `workflow_step_executions` table's UNIQUE constraint on `(execution_id, node_id, attempt_count)` is the source of truth. The executor checks for a `completed` row before executing any step — this is the core idempotency mechanism."

---

**David (SRE):** "I want to make sure the Event Engine's health endpoint reports on queue depth so we can alert when workflows are backlogged. Also, the BullMQ dashboard (Bull Board) should be mounted for local dev visibility."

**Aria:** "Add to `event-engine/src/index.js`:"

```javascript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

// Health + monitoring
app.get('/health', async (req, res) => {
  const queueDepth = await workflowQueue.count();
  const notifDepth = await notifQueue.count();
  res.json({ status: 'ok', queues: { 'wf:execution': queueDepth, 'notif:delivery': notifDepth } });
});

// Bull Board (local dev only)
if (process.env.NODE_ENV === 'development') {
  const serverAdapter = new ExpressAdapter();
  createBullBoard({ queues: [new BullMQAdapter(workflowQueue), new BullMQAdapter(notifQueue)], serverAdapter });
  serverAdapter.setBasePath('/bull-board');
  app.use('/bull-board', serverAdapter.getRouter());
}
```

**David:** "And add a Prometheus scrape target for the event engine in `docker/prometheus/prometheus.yml`:"

```yaml
  - job_name: 'event-engine'
    static_configs:
      - targets: ['host.docker.internal:3002']
    metrics_path: '/metrics'
```

---

## 10. Implementation Sprint Plan

### Sprint 1 (Week 1-2): Foundation

**Goal:** Real-time notification delivery working end-to-end.

**Backend:**
- Add `socket.io` to `backend/package.json`; wire Socket.IO to existing Express server in `src/index.js`
- Create `backend/src/routes/notifications.js` new endpoints: `GET /`, `GET /count`, `POST /:id/read`, `POST /read-all`
- Add `backend/src/lib/notification-publisher.js`: `publishNotificationEvent()` helper that writes to `notifications:events:{orgId}` Redis Stream
- Instrument `backend/src/routes/responses.js`: on new response submit, call `publishNotificationEvent({ type: 'survey.response_received', ... })`

**Event Engine (new service):**
- Scaffold `event-engine/` directory: `package.json`, `src/index.js`, `src/db.js`, `src/redis.js`, `Dockerfile`
- Implement `src/notification-worker.js`: reads `notifications:events:*` streams, writes `notifications` table, publishes to `notifications:live:{userId}` pub/sub
- Implement basic `src/scheduler.js` with nps_daily_agg REFRESH every 5 minutes

**Database:**
- Apply migration `20260603000010_notifications_inbox.sql`
- Apply migration `20260603000012_dashboard_analytics.sql` (just the materialized view + dashboard_layouts table)

**Frontend (React):**
- Add `socket.io-client` to `app/package.json`
- Create `src/hooks/useNotifications.ts`: connects to Socket.IO, subscribes to `notification:new` and `notification:count`
- Create `src/components/NotificationBell.tsx`: badge with count, click opens panel
- Create `src/components/NotificationPanel.tsx`: scrollable list, infinite load, date grouping (Today/Yesterday/Older), mark read on click
- Add `NotificationBell` to `TopBar.tsx` (already has the navbar area)
- Add notification routes to `src/locales/en.ts` under `notifications` namespace
- **No hardcoded strings in JSX** — all strings via `t('notifications.bell.ariaLabel')` etc.

**Deliverable:** Users receive in-app notifications when Crystal completes insight generation. Bell badge updates in real time via WebSocket. Panel shows notification history.

---

### Sprint 2 (Week 3-4): Alerts Foundation + Dashboard Core

**Goal:** Alert rules firing + dashboard KPI tiles.

**Backend:**
- Create `backend/src/routes/alerts.js`: `GET /api/alerts`, `POST /api/alerts/:id/acknowledge`, `POST /api/alerts/:id/snooze`, `POST /api/alerts/:id/resolve`, CRUD for `/api/alerts/rules`
- Create `backend/src/routes/analytics.js`: `GET /api/analytics/kpis`, `GET /api/analytics/nps-trend`, `GET /api/analytics/surveys/health`
- Mount both routers in `src/index.js`

**Event Engine:**
- Implement `src/alert-evaluator.js`: scheduled evaluation every 15 minutes. Implement S-01 (NPS drop), V-01 (response rate), V-05 (milestone), V-06 (expiry warning) evaluators
- Alert processor: dedup → insert `alert_events` → publish `alert.fired` to notification stream

**Database:**
- Apply migration `20260603000011_alert_system.sql`

**Frontend:**
- Create `src/pages/DashboardPage.tsx` (new page)
- KPI tiles: NPS, CSAT, Response Count, Response Rate, Insights (each as a standalone component, motion-animated on mount)
- NPS trend chart using Recharts `LineChart`
- `GET /api/analytics/kpis` + `GET /api/analytics/nps-trend` wired up
- Alert banner component: shows count of active critical alerts, links to Alerts page
- Create `src/pages/AlertsPage.tsx`: alert list, severity tabs, basic `GET /api/alerts` call
- Add Dashboard and Alerts to routes in `src/constants/routes.ts`
- Add nav items to `SideNav.tsx`

**Deliverable:** Basic dashboard with live KPI tiles. NPS drop alerts fire and appear in the notification panel and alert center.

---

### Sprint 3 (Week 5-6): Crystal Integration

**Goal:** Crystal narration in notifications and alerts. Crystal dashboard narrative card.

**CrystalOS:**
- Create `crystalos/skills/alert-narrator/SKILL.md` — narration skill for alert events
- Create `crystalos/skills/dashboard-narrator/SKILL.md` — executive brief skill
- Add `POST /api/crystal/alert-narration` endpoint to `crystalos/main.py`
- Add `POST /api/crystal/dashboard-narrative` endpoint
- Create `crystalos/lib/notification_bridge.py` with `notify_insight_complete()` and `notify_anomaly_detected()`
- Wire `notification_bridge.notify_insight_complete()` into `graphs/insights.py` `node_publish` step

**Event Engine:**
- Update `alert-evaluator.js`: after computing alert conditions, call CrystalOS `/api/crystal/alert-narration` with 10s timeout. If timeout, proceed without narration (narration is enhancement, not blocker).
- Update `notification-worker.js`: for `crystal.*` event types, call `/api/crystal/alert-narration` to get `crystalSummary` and embed in `notifications.metadata`

**Frontend:**
- Crystal narrative card on DashboardPage: calls `POST /api/analytics/crystal/narrative`, shows 3-paragraph brief with skeleton loading state
- Alert detail drawer: shows `crystal_narration` and `crystal_action` fields with Crystal avatar icon
- Notification panel items: if `metadata.crystalSummary` exists, show it as a blue italic block below the body text
- "Regenerate" button on Crystal narrative card (re-calls with `force: true`)

**Deliverable:** Every NPS drop alert includes Crystal's narration of why it fired. Crystal writes a Monday morning executive brief for the dashboard. Notification panel shows Crystal's explanation inline.

---

### Sprint 4 (Week 7-8): Dashboard Complete + Visual Charts

**Goal:** Full dashboard widget library. Crystal chart generation.

**Backend:**
- `GET /api/analytics/score-distribution` — NPS detractor/passive/promoter breakdown
- `GET /api/analytics/topics` — topic list with sentiment from `survey_topics` and `insights`
- `GET /api/analytics/verbatims` — paginated verbatims with sentiment filter
- `GET /api/analytics/volume-heatmap` — day×hour response grid
- `POST /api/visual/generate-chart` — proxies to CrystalOS
- `POST /api/visual/explain-chart` — proxies to CrystalOS `chart-generator` skill

**CrystalOS:**
- Create `crystalos/skills/chart-generator/SKILL.md` — Vega-Lite chart generation
- Add `POST /api/visual/generate-chart` endpoint
- Add `POST /api/visual/explain-chart` endpoint (chart Q&A)
- Add `generate_chart` tool to `crystal/registry.py` and `crystal/tools.py`

**Frontend:**
- NPS distribution bar (Recharts BarChart, stacked)
- Topic sentiment list widget
- Recent verbatims stream (virtualized list for > 100 items)
- Response volume heatmap (D3 SVG grid)
- Crystal action board widget (3 recommended actions)
- `<VisualInsightCard>` component: renders Vega-Lite spec via `vega-embed`
- `<CrystalChartQuery>` component: natural language input → calls `/api/visual/generate-chart` → renders `VisualInsightCard`
- "Ask Crystal about this chart" button on NPS trend chart
- Add `react-vega` to `app/package.json` for Vega-Lite rendering

**Deliverable:** Full dashboard with all core widgets. Crystal can generate any chart from natural language. Users can ask Crystal questions about any chart.

---

### Sprint 5 (Week 9-10): Workflow Engine

**Goal:** Workflow execution engine running. Visual canvas builder.

**Backend:**
- Extend `backend/src/routes/workflows.js` with new endpoints: `POST /:id/activate`, `POST /:id/deactivate`, `GET /:id/executions`, `GET /templates`, `POST /templates/:id/use`, `GET /connectors`, `POST /connectors`
- Apply migration `20260603000014_workflow_expansion.sql`

**Event Engine:**
- Implement `src/workflow-executor.js` with BullMQ worker
- Implement `src/workflow-trigger.js` (Redis Stream consumer + cron trigger listener)
- Implement `src/connectors/slack.js`, `email.js`, `webhook.js`
- Implement `WorkflowGraphExecutor` class: topological sort, condition evaluation, variable substitution (`{{trigger.survey.name}}`)

**CrystalOS:**
- Add `POST /api/crystal/workflow-action` endpoint: handles `analyze`, `summarize`, `classify`, `write`, `decide` tasks
- Structure output as typed JSON matching `output_schema` from request

**Frontend:**
- Visual workflow canvas builder using React Flow (`reactflow` npm package)
- Node palette sidebar (trigger, condition, action, flow control nodes)
- Node configuration panel (right-side drawer for each node type)
- Variable picker UI
- Workflow list page (extend existing `WorkflowsPage.tsx`)
- Execution history view per workflow
- 3 initial templates seeded into `workflow_templates` table

**Deliverable:** Users can build NPS Recovery, Weekly Digest, and Verbatim Escalation workflows using the visual canvas. Crystal AI steps work in workflows. Slack and email delivery functional.

---

### Sprint 6 (Week 11-12): Visual AI Image Analysis + Polish

**Goal:** Image upload survey question. Image analysis pipeline. Performance and polish.

**Backend:**
- `POST /api/visual/upload` — multipart image upload, Firebase Storage, queues analysis
- `GET /api/surveys/:id/images` — image gallery for analyst view
- `GET /api/surveys/:id/images/analysis` — Crystal aggregate analysis
- Apply migration `20260603000013_visual_ai.sql`

**CrystalOS:**
- Create `crystalos/skills/visual-analyst/SKILL.md` — multimodal image analysis skill
- Add `POST /api/visual/analyze` endpoint (async, returns immediately with job ID)
- Create a Redis Stream consumer for `visual:analysis:queue` in CrystalOS (similar to `response_stream.py` pattern)
- Implement safety screening (call Google Vision SafeSearch API before storing)
- Implement face blurring (Google Vision face detection → apply blur via Pillow before storing processed_url)

**Frontend:**
- `<ImageUploadQuestion>` survey component (for survey builder and respondent view)
- `<ImageGallery>` analyst view component with Crystal summary header
- Privacy disclosure modal (shown once per session before first image question)
- Emoji rating question type
- Toast notification component for real-time notifications (when panel is closed)

**Performance:**
- Add `REFRESH MATERIALIZED VIEW CONCURRENTLY nps_daily_agg` concurrency (unique index required)
- React Query stale times: analytics data 5min, notifications 30s, alerts 60s
- Virtualize verbatims list (React Virtual)
- Lazy-load `vega-embed` and `reactflow` (heavy deps, only needed on specific pages)
- Load test: 100 concurrent users generating workflows + notifications (k6 script)

**Deliverable:** Survey respondents can upload images. Crystal analyzes images and generates aggregate summaries. Notification system fully tested under load. All 5 features integrated and functional.

---

### Post-Sprint 6: Ongoing

- Alert wizard UI (4-step setup flow from design doc)
- Workflow template gallery with 15 pre-built templates
- Predictive chart overlays (Crystal 14-day NPS prediction dashed line)
- Email digest connector (SendGrid, daily/weekly)
- Jira connector
- PDF export (`puppeteer` on backend, `POST /api/analytics/export/pdf`)
- PagerDuty escalation connector
- Role-based dashboard layout defaults
- External read-only sharing links (token-based, expiry date)
- Video response question type (Phase 5+ of Visual AI)

---

*Document prepared by the Experient Architecture Team — June 2026*  
*Next review: Sprint 3 kick-off (Week 5) to validate Crystal integration points*
