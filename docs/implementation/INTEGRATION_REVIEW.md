# Experient Platform — Integration Review
**5-Feature Sprint: Notifications, Alerts, Dashboard, Visual AI, Workflows**

Date: 2026-06-03
Facilitator: Emma Thompson (Platform Expert)
Attendees: Emma Thompson, Aria Chen, Marcus Williams, Jorge Santos, Priya Sharma, David Kim, Patricia Holloway

---

## Section 1: Integration Kickoff

**Emma:** Alright, I've spent the last two days reading both the 5 design docs and the full existing codebase. Let me tell you what we're actually working with before anyone gets excited about anything.

**Here's what already exists:**

**Notification infrastructure** (migration `20240521000003_notification_infrastructure.sql`):
- `notification_events` table: `id, org_id, user_id, survey_id, event_type, payload (JSONB), status (pending/delivered/skipped), channel (in_app/email/push), created_at, delivered_at`
- `notification_preferences` table: `id, org_id, user_id, survey_id, channel, event_type, enabled, created_at, updated_at`
- Partial index on `notification_events` for pending in-app lookups
- Three live API endpoints in `notifications.js`: `GET /pending`, `GET /preferences`, `PUT /preferences`
- The pending endpoint does a `WITH pending AS ... UPDATE ... RETURNING` — a clean CTE pattern I actually like

**Workflow infrastructure:**
- `workflows` table: `id, org_id, name, condition (JSONB), action (JSONB), status (active/paused), trigger_count, created_by, created_at, updated_at`
- Five endpoints in `workflows.js`: list, create, update, delete, toggle
- Three seeded workflows in dev: "Critical Detractor Alert", "Feature Request Tagger", "Retention Watch"
- `WorkflowsPage.tsx` is a list view with a simple create modal — it knows about `condition` and `action` fields but nothing about graph nodes or edges

**Redis infrastructure:**
- `ioredis` is in `package.json`. Redis used by the rate limiter (`rateLimiter.js`) with a sliding window pattern — sorted sets, not streams. That's it on the Node.js side.
- CrystalOS uses `redis.asyncio` for: rate limiting, the `insight_events` Redis stream consumer (`response_stream.py`), progressive tier dedup keys, event publishing (`event_publisher.py` writes to `agent_run_events` stream)
- There are TWO separate Redis usages and they use different stream keys and different connection patterns

**Crystal tools (from `crystal/registry.py`):**
- 13 tools total, all read-only data tools: `get_survey_overview`, `get_topic_details`, `get_metric_history`, `get_insights_list`, `get_verbatims`, `get_segment_breakdown`, `get_response_samples`, `get_top_phrases`, `get_survey_comparison`, `get_trend_data`, `get_org_portfolio`, plus a couple of proposal tools
- No image analysis tools. No chart generation tools. No narration-specific tools. No workflow action endpoint.

**The biggest integration risks I see:**

1. **Schema collision**: The design doc's `notifications` table is a NEW table with a different name and UUID foreign keys referencing `organizations(id)` and `users(id)`. The existing `notification_events` table uses TEXT for org_id/user_id (Clerk IDs). These are fundamentally different schemas. We cannot just ALTER the existing table to match the design — the FK types conflict.

2. **No Socket.IO**: `grep -r "socket.io" backend/src` returns nothing. The design docs assume Socket.IO is running. It isn't.

3. **No Bull/BullMQ**: `package.json` has no Bull. The workflow engine and the notification digest scheduler both require it. Neither is installed.

4. **The `workflows` table's `condition/action` columns are singular JSONB blobs**, not a graph. The design doc wants `nodes (JSONB)` and `edges (JSONB)` arrays. The existing `WorkflowsPage.tsx` and all 5 existing workflow API routes assume the old schema. This needs careful migration.

5. **Crystal has no visual AI, narration, or workflow action capabilities** — those are 100% new endpoints and new tools that need to be built from scratch.

6. **The design docs reference `organizations(id)` and `users(id)` as FK targets** — these tables do NOT exist in the current schema. The current schema uses TEXT columns with Clerk IDs. We need to decide: do we keep TEXT IDs (Clerk pattern) or introduce organizations/users tables?

That last one worries me the most. Let me flag it right now.

**Aria:** That's a blocker. The design docs were written assuming a traditional relational schema with organizations and users as first-class tables. But we use Clerk for user management and just store `org_id` and `user_id` as TEXT. If we try to add FK constraints to `organizations(id)`, we need to create that table and keep it in sync with Clerk. That's a whole separate project.

**Emma:** Exactly. My recommendation: all new tables use TEXT for `org_id` and `user_id`, consistent with the existing pattern. Drop the FK constraints to `organizations(id)` and `users(id)` from the design docs. We can add them later if we introduce a user directory table.

**Marcus:** Agreed. Text IDs are fine. Clerk is the source of truth. Moving on.

---

## Section 2: Notifications Integration Review

**Emma:** Let's start with notifications since everything else feeds into it. The core question is whether we extend `notification_events` or create a new `notifications` table as the design doc specifies.

The existing `notification_events` has: `org_id, user_id, survey_id, event_type, payload, status, channel, created_at, delivered_at`. The design doc's `notifications` table adds: `type, priority, title, body, icon_type, action_url, metadata, entity_type, entity_id, read_at, dismissed_at, delivered_channels`. These are materially different shapes.

**Marcus:** The existing table doesn't have `title`, `body`, or `read_at`. The current API just reads `event_type` and `payload`. If we ALTER the existing table, we have to migrate every existing consumer of that table. The `GET /pending` query returns `id, event_type, payload, created_at` — those callers would need updating. If we create a new `notifications` table alongside `notification_events`, we have two tables doing similar things indefinitely.

My vote: create the new `notifications` table as specified in the design doc, using TEXT for org_id/user_id. Deprecate `notification_events` over the next 2 sprints. The existing `/api/notifications/pending` route can read from the new table immediately.

**Aria:** I agree. But we need to reconcile the design doc's `status` field. The new design has `read_at` and `dismissed_at` timestamps instead of the old `status: pending/delivered/skipped` enum. The existing code does `SET status = 'delivered'` in the pending endpoint. New pattern would be `SET read_at = NOW()`. That's a clean improvement — delivered is implicit when `read_at IS NOT NULL`.

**Emma:** Decision: new `notifications` table, not ALTER of `notification_events`. Keep `notification_events` alive for a 2-sprint deprecation period. New routes read from `notifications`. What about the Redis Streams architecture?

**Aria:** The design says Redis Streams at `notifications:events:{orgId}`. CrystalOS already uses Redis Streams for `agent_run_events` (in `event_publisher.py`) and the insight stream consumer reads `insight_events`. So the pattern is already there in CrystalOS. But on the Node.js side, the only Redis usage is the rate limiter using sorted sets. We'd need to add a streams consumer to Node.js.

**Marcus:** And we need ioredis to support streams. It does — `ioredis` has `xadd`, `xread`, `xreadgroup`. We can add a notification processor worker that runs alongside the Express server, or as a separate process. I prefer alongside in v1 — same process, `setInterval`-based poll on the consumer group, dead simple to deploy.

**David:** Hold on. If the notification processor runs in the same Node.js process as the Express server and the process dies or restarts, you lose in-flight processing. Bull Queue would handle this more gracefully since jobs persist in Redis.

**Marcus:** Fair. But in v1, before we add Bull, we can use Redis Streams consumer groups — that's what they're designed for. XPENDING + XCLAIM handles crashes. We don't need Bull for v1 notification delivery.

**Jorge:** Crystal narration on notifications — I need to understand the latency requirement. The design says Crystal enriches notifications with a `crystalSummary` field. Crystal's ReAct loop currently takes 10-20 seconds. If we block notification delivery waiting for Crystal narration, a "NPS dropped" notification could take 20 seconds to appear. That's not a real-time notification service.

**Emma:** Good catch. The Crystal narration can't be synchronous in the delivery path. Two options: (1) Fire-and-forget narration — deliver the notification immediately without narration, then update the `metadata` field when Crystal returns, push an update via WebSocket. (2) Narrate before inserting — only for high-priority notifications where you can afford a 10-second delay.

**Jorge:** I'd go with option 1. For `critical` priority alerts, the basic facts ("NPS dropped 8 points") are more urgent than the narration. Crystal enrichment can arrive 15-30 seconds later and update the notification in-place. We'd need a `GET /api/notifications/:id` endpoint that returns the latest metadata, and the frontend polling or listening for a WebSocket update.

**Priya:** The existing `TopBar.tsx` — I checked the code. There's no notification bell in the current AppShell. The design shows it at the far right of the TopBar next to the user avatar. Looking at the AppShell structure in the CLAUDE.md, TopBar is a separate component. We need to add the bell there. It's not a restructuring — it's a new element. The CrystalPanel already opens from the TopBar area, so the pattern for slide-in panels exists.

**David:** On the connection pool question — if we add a notification processor worker to the backend, it shares the existing `db.js` pool (max 10 connections). If notifications have bursts of writes (batch fan-out for org-wide notifications), we could exhaust the pool. But for v1 at our scale, 10 connections is fine. PgBouncer comes when we hit 50+ concurrent connections.

**Decisions from Section 2:**
- Create new `notifications` table (TEXT ids, no FK to organizations/users)
- Keep `notification_events` for 2-sprint deprecation window
- Notification processor runs inside backend process using Redis Streams consumer groups (no Bull in v1)
- Crystal narration is fire-and-forget — notifications delivered immediately, narration added async via metadata update + WebSocket push
- Notification bell added to existing `TopBar.tsx` — no AppShell restructuring needed

---

## Section 3: Alerts Integration Review

**Emma:** The existing code has zero alert infrastructure. No `alert_rules` table, no `alert_events` table, nothing. This is genuinely greenfield. The only coupling point is the notification pipeline — alerts produce notifications. So the question is: does the alert system write directly to `notifications`, or does it go through the Redis Streams event bus?

**Aria:** It should go through the event bus. If alerts write directly to `notifications`, we bypass the deduplication, preference checking, and Crystal narration that the Notification Processor handles. The right flow is: alert fires → writes `alert_events` row → publishes to `notifications:events:{orgId}` stream → Notification Processor picks it up → applies dedup/prefs/narration → writes to `notifications` → delivers via WebSocket.

**Emma:** That's clean. The alert becomes just another event producer. The Notification Processor is the single insertion point for `notifications`.

**Marcus:** The Alert Evaluator needs to query `responses` and `survey_topics` every 15 minutes. The `responses` table could be enormous — a popular survey could have hundreds of thousands of rows. The design just says "query responses" but it doesn't say how.

We need to think carefully. The NPS drop alert (S-01) needs to compare NPS in the last 7 days vs the 7 days before that. If we do a naive `SELECT AVG(nps_score) FROM responses WHERE survey_id = $1 AND submitted_at > NOW() - INTERVAL '7 days'` on 100K responses, that's a full table scan. But we already have `survey_metric_snapshots` from the scheduler — it writes periodic metric aggregates. For most scheduled alerts, we should query `survey_metric_snapshots` first, not raw `responses`. Raw `responses` only for real-time verbatim analysis (T-04, T-07).

**David:** The existing `responses` table has an index on `(survey_id, submitted_at DESC)` — that's good, it makes the 7-day window query an index range scan, not a full scan. But still, for 1,000 orgs each with 10 active surveys, that's 10,000 evaluations every 15 minutes. We need to stagger them.

The scheduler already does this. Look at `scheduler.py` — it adds `asyncio.sleep(2)` between survey triggers. The Alert Evaluator should do the same. Batch by org, sleep 100ms between orgs, 50ms between surveys within an org. 1,000 orgs × 100ms = 100 seconds to evaluate all orgs, well within the 15-minute window.

**Jorge:** Crystal narration for alerts is different from notification narration. For an alert, we want Crystal to analyze WHY the threshold was crossed — that requires actual data context (verbatims, topic breakdown, NPS history). It's more like a targeted Crystal ReAct query than a simple narration.

The simplest implementation: a new CrystalOS endpoint `POST /api/crystal/narrate-alert` that takes the alert context (alert type, metric values, survey_id) and runs a focused, one-shot Crystal analysis (not the full ReAct loop — more like a structured output call). We constrain it: no tool calls, just a prompt with pre-loaded context, max 500 tokens output, 10 second timeout.

Actually, thinking about this more — this is exactly what the Skill Runtime is designed for. We could write a `narrate-alert.skill.md` that takes structured input and produces structured narration. That's cleaner than a raw endpoint.

**Aria:** The alert-to-notification flow I want to confirm: `alert_events` is written → notification published to Redis stream → Notification Processor creates `notifications` row with `entity_type: 'alert'` and `entity_id: alert_event.id`. So the notification links back to the alert. When the user clicks the notification, they navigate to the Alert Center. That's the clean separation.

**Emma:** But there's a workflow trigger coupling too. The design says workflows can trigger on `alert.fired`. If the alert writes to `alert_events` and the workflow trigger listener observes `alert_events`, we need the listener to poll `alert_events` or have the alert processor publish a separate event to a `workflow_trigger_events` stream. The latter is cleaner.

**Marcus:** Two Redis stream writes per alert then: one to `notifications:events:{orgId}` and one to `workflow_events` (or whatever we call the workflow trigger stream). That's fine — Redis xadd is cheap.

**Patricia:** Can someone just walk me through what happens when NPS drops? Practically.

**David:** Every 15 minutes, the Alert Evaluator wakes up. It queries `survey_metric_snapshots` for NPS values in the last 7 days vs prior 7 days. If the drop exceeds the threshold configured in `alert_rules`, it checks `alert_events` for a recent dedup entry (last 6 hours for warning, 24 hours for critical). If no dedup: writes a new `alert_events` row, publishes to the notification event bus and workflow event bus. The Notification Processor picks it up within seconds, invokes Crystal narration (async, fire-and-forget), writes to `notifications`, pushes via WebSocket. Your browser shows the notification. Crystal narration appears 10-30 seconds later as a metadata update. Total time from NPS change to notification: depends on when the evaluator last ran — worst case 15 minutes, best case 30 seconds.

**Patricia:** 15 minutes is too slow for "critical." When my NPS tanks I need to know within 5 minutes.

**David:** For critical threshold breaches, we add a real-time evaluator path: the response stream consumer already fires on every ingested response. We hook into that — when a response lands that changes the NPS significantly, trigger an immediate critical alert evaluation. This is the "real-time evaluator" path in the design doc's architecture diagram. So critical alerts fire in seconds (real-time path), warning/info alerts fire every 15 minutes (batch path).

**Patricia:** Okay. That works.

---

## Section 4: Dashboard Integration Review

**Emma:** The dashboard needs analytics endpoints — `GET /api/analytics/kpis`, `/api/analytics/nps-trend`, `/api/analytics/topics/matrix`, etc. These are all new. None of them exist. They query the existing `responses`, `survey_topics`, `survey_metric_snapshots` tables.

The responses table could be slow on naive queries. The `responses` table has indexes on `(survey_id)`, `(org_id)`, and `(survey_id, submitted_at DESC)`. For the NPS trend endpoint that needs NPS by day over 90 days, we'd aggregate: `SELECT date_trunc('day', submitted_at), AVG(nps_score) FROM responses WHERE org_id = $1 AND submitted_at > NOW() - INTERVAL '90 days' GROUP BY 1 ORDER BY 1`. With the existing composite index, this is an index scan on the date range per survey, then an aggregation. For 100K responses over 90 days, this is probably 50-100ms — acceptable for a dashboard that loads once. But we should add a covering index: `CREATE INDEX idx_responses_org_date_nps ON responses(org_id, submitted_at DESC, nps_score)` — that makes the NPS trend query index-only.

**Marcus:** The design proposes a `nps_daily_agg` materialized view. We should have it, but who refreshes it? Not a Postgres scheduled job (we don't have pg_cron configured). The scheduler in CrystalOS already runs hourly — it could call a backend endpoint to `REFRESH MATERIALIZED VIEW nps_daily_agg CONCURRENTLY`. Or the Alert Evaluator could refresh it after each evaluation cycle.

My preference: the CrystalOS scheduler calls a new backend endpoint `POST /api/internal/refresh-analytics-views` at the end of each tick. Backend refreshes the materialized view. It's already the heartbeat process. Zero new infrastructure.

**Aria:** Or we skip the materialized view in v1 and just use `survey_metric_snapshots` for trend data. The scheduler already writes metric snapshots — those are pre-aggregated. The dashboard NPS trend query becomes `SELECT * FROM survey_metric_snapshots WHERE org_id = $1 ORDER BY captured_at DESC LIMIT 90`. That's a point lookup, trivially fast.

**Emma:** That's pragmatic. v1 uses `survey_metric_snapshots`. v2 adds the materialized view when we need sub-second queries. Agreed?

**Marcus:** Agreed.

**Jorge:** Crystal's Dashboard Narrator skill — the design says Crystal takes KPI data + topic data + trend data and generates a narrative. I need to think about payload size. If we send the full topic list (could be 50+ topics), all KPI values for 90 days, verbatim samples... that's potentially 50K tokens of context. Crystal's context window handles it, but the cost per narrative generation would be significant.

We need to pre-filter before sending to Crystal. Summarize at the API layer: top 10 topics by volume, last 30 days of KPIs (not 90), 5 representative verbatims per topic, not 50. The dashboard API endpoint would have a `GET /api/analytics/crystal-context` that returns a pre-summarized payload specifically sized for Crystal. Target: under 8,000 tokens.

**Emma:** That's the right call. The Dashboard Narrator skill takes the summary, not raw data.

**Priya:** The existing `InsightsDashboardPage.tsx` and `ResponseDashboardPage.tsx` — is `/dashboard` a new route or do we repurpose one of those?

I looked at the pages. `InsightsDashboardPage.tsx` is the Crystal insights view — it shows the agentic insight cards. `ResponseDashboardPage.tsx` shows individual survey responses. Neither is the executive dashboard described in the design doc.

I think `/app/dashboard` should be a completely new page. Keep the existing pages — they serve different purposes. The new dashboard is the org-level executive view. Route it as `ROUTES.DASHBOARD` alongside the existing routes.

**Aria:** Real-time WebSocket for dashboard — if 100 users are all on the dashboard, do we send 100 WebSocket messages for every response? No. We use Socket.IO rooms. When a user loads the dashboard, they join room `dashboard:${orgId}`. When a new response lands, we emit once to that room. Socket.IO broadcasts to all members. One Redis Pub/Sub message → one Socket.IO broadcast to the room → N connected clients receive it. That's how you do this at scale.

**David:** The Topic Bubble Chart — D3 force simulation in React. I want to flag this now because it's a footgun. D3 mutates the DOM directly. React also mutates the DOM. They fight.

The right pattern: use D3 only for data computation (force simulation, layout calculation), use React for rendering. So D3 computes `{x, y}` positions for each bubble, React renders the SVGs at those positions. The `useD3` hook pattern — a ref-based approach where D3 layout runs in `useEffect` and writes positions to state, React re-renders with the new positions. This is well-established. The existing Recharts usage in the app shows we already have charts working. For the bubble chart specifically, the D3 force simulation should run in a `useEffect`, output positions as state, and a `<svg>` in React renders circles at those positions.

**Aria:** Confirmed pattern. D3 for layout data only, React for rendering.

---

## Section 5: Visual AI Integration Review

**Emma:** Image upload — the design says Firebase Storage. But look at the existing `backend/package.json`: `firebase-admin` is there. Firebase Admin SDK supports Firebase Storage via `getStorage()`. So we have the client available.

But the question is who signs the upload URL. There are two patterns: (1) Backend generates a signed upload URL via Firebase Admin, client uploads directly to Firebase Storage — backend never touches the image bytes. (2) Client POSTs to backend, backend proxies to Firebase Storage. Pattern 1 is clearly better: no unnecessary data transfer through our backend, cleaner, and Firebase Storage handles CDN/auth. The backend just generates the signed URL and stores the metadata.

The storage rules for Firebase Storage need to be updated — current rules are for survey data. We'd add a path for `survey-media/{orgId}/{surveyId}/{responseId}/{fileName}`.

**Jorge:** The VisualAnalystAgent described in the design doc is a full LangGraph agent. Do we need that? Looking at what the use cases actually require: image analysis (one-shot Claude vision call), chart generation (one-shot LLM prompt for Vega-Lite spec), insight card generation (one-shot prompt). None of these need a multi-step ReAct loop.

My proposal: add 3 new Crystal tools to `registry.py` — `analyze_image(url, analysis_type)`, `generate_chart(data, description)`, `generate_visual_insight_card(insight)` — and 1 new skill (`visual-analyst.skill.md`). The skill handles orchestration without needing a whole new agent class. This is much simpler to build and test than a new LangGraph agent.

We also need 2 new FastAPI endpoints in `main.py`: `POST /visual/analyze` (async job) and `GET /visual/analyze/{job_id}/status` (poll). Or we can use SSE streaming like we do for Crystal responses.

**Marcus:** The async job pattern — user uploads, backend kicks off a CrystalOS job, frontend polls for result. The design says the frontend could poll or use WebSocket notification. Let's be specific: backend receives the analyze request, creates a row in a new `visual_analysis_jobs` table (status: pending), publishes job to CrystalOS, returns the job ID. CrystalOS processes it (10-30 seconds for vision model), writes result back to the table via an internal callback. When complete, the backend WebSocket pushes a `visual:analysis_complete` event to the user's room. Frontend receives it and re-fetches the result. No polling needed.

**Priya:** The Image Upload question in `SurveyFillPage.tsx`. I need to check how question types are rendered. Looking at the CLAUDE.md for pages — it mentions `SurveyFillPage.tsx` is the public survey respondent view. In the existing code, survey questions are rendered based on `question.type`. The existing types are things like `nps`, `text`, `rating`, `multiple_choice`, etc.

Adding `image_upload` as a new question type requires: a new case in the question renderer switch, a new `<ImageUploadQuestion>` component, and handling in the response submission to include image URLs in the `answers` JSONB. The answers JSONB for an image upload question would look like: `{ "questionId": "...", "imageUrls": ["https://..."], "uploadedAt": "..." }`.

The key risk: the existing submission handler in `public.js` needs to handle the new answer format without breaking existing 20+ question types. Since answers are JSONB, adding a new type doesn't break existing ones. The frontend change is surgical — one new component, one new case in the renderer.

**David:** Firebase Storage in dev — this is a hard problem. When running `docker-compose up`, Firebase isn't running. The dev environment has no Firebase emulator configured.

Options: A) Local filesystem adapter — the image goes to `/tmp/uploads/{orgId}/{surveyId}/` in dev, signed URLs become local file paths. B) MinIO in docker-compose — MinIO is S3-compatible, acts as Firebase Storage mock. C) Skip image upload in dev — respond with a mock `imageUrl` from a placeholder service.

I vote for B — MinIO. It's the most realistic simulation. Add `minio:` service to `docker-compose.yml`, configure a `STORAGE_ADAPTER=minio` env var in dev, `STORAGE_ADAPTER=firebase` in prod. The backend storage library checks `STORAGE_ADAPTER` and routes accordingly. This is a standard pattern.

**Aria:** The Vega-Lite chart rendering — `react-vega` adds ~150KB to the bundle. The app's CLAUDE.md shows Recharts is the current chart library (`vendor-charts` chunk). Adding `react-vega` is a second chart library.

Alternative: use `vega-embed` (lighter than `react-vega`, ~100KB). Or pre-render SVG on the backend. Crystal generates the Vega-Lite spec, the backend renders it to SVG using `vega` (Node.js) or `vega` (Python), stores as static asset. Frontend just loads an `<img src>`.

I lean toward pre-rendering to SVG for AI-generated charts. The user can't interact with a pre-rendered SVG, but Crystal-generated charts are static outputs — users don't need to hover over them the same way they hover over live dashboard charts. Reserve `react-vega` only for the interactive dashboard charts. That way the heavy dependency stays lazy-loaded and only loaded when needed.

**Marcus:** I like that. Two categories: (1) Crystal-generated charts → SVG pre-render by backend, lightweight. (2) Live dashboard charts → Recharts (already loaded). Only if we need features Recharts can't handle (force simulation, complex custom specs) do we load vega-embed. Keep the bundle sane.

---

## Section 6: Workflow System Integration Review

**Emma:** The existing `workflows` table schema is: `id, org_id, name, condition (JSONB), action (JSONB), status (active/paused), trigger_count, created_by, created_at, updated_at`. The design doc wants `nodes (JSONB)`, `edges (JSONB)`, and an extended status enum (`draft|active|paused|archived|error`).

Migration path: `ALTER TABLE workflows ADD COLUMN nodes JSONB DEFAULT '[]', ADD COLUMN edges JSONB DEFAULT '[]'`. Leave `condition` and `action` in place — they're still valid for the 3 seeded simple workflows. New workflows use `nodes` and `edges`. Eventually we migrate old workflows to the new format or let them coexist. The API routes need to handle both: if `nodes` is empty/null, use `condition`/`action` (legacy path). If `nodes` is non-empty, use the graph (new path).

The existing `WorkflowsPage.tsx` renders the workflow list and a simple create modal. We need two things: (1) Keep the list page working with both legacy and new-style workflows. (2) Add a new builder route `/app/workflows/:id/builder` for the canvas builder. The list page continues to work — the "Edit" button on new-style workflows opens the canvas builder, on old-style workflows opens the existing modal.

**Marcus:** Bull Queue — it's not in `package.json`. We'd add `bullmq`. The workflow execution engine needs it for: delayed jobs (wait 24 hours), scheduled triggers (cron), retry with backoff, and dead-letter queue. The notification digest scheduler also needs it.

Where does it run? The design says "Event Engine" as a separate process. I think we should run it in the same Node.js process in v1 — same pattern as the notification processor. In production, if we need to scale out, we separate it. For now: one process, multiple Bull Queue workers, shared Redis.

The existing backend already has ioredis, so Bull can use the same Redis connection string. BullMQ uses ioredis under the hood and accepts the same connection config.

**David:** Delayed workflow jobs — "wait 24 hours then send follow-up." Bull Queue with `delayed` jobs stores the job in Redis with a `delayMs`. If the process restarts during the 24-hour wait, the job persists in Redis (it's in the sorted set) and runs when the process comes back up. The redis docker-compose config in the design doc specifies `--appendonly yes` — that makes Redis AOF-persistent. Delayed jobs survive restarts. Confirmed.

**Jorge:** Crystal as a workflow step — when the workflow executor hits a Crystal action node, it calls CrystalOS. The design proposes `POST /api/crystal/workflow-action`. I want to be specific about what this does.

It should NOT run the full ReAct loop. The full loop takes 10-30 seconds and the workflow step has a 120-second timeout. Instead, this endpoint takes: `{ task, context, output_schema }` where task is one of `analyze|summarize|classify|write|decide`. It runs a single structured LLM call with the context pre-loaded. No tool calls, no ReAct. Just: system prompt + pre-loaded data context + task instruction → JSON output. Fast (3-8 seconds), predictable, cheap.

For the `crystal.analyze` task that needs real data (like summarizing why NPS dropped), we load the relevant `survey_metric_snapshots` and top verbatims inside the endpoint before calling the LLM — same as how Crystal tools work, but hardcoded for the workflow context rather than letting the LLM decide which tools to call.

The Skill Runtime is actually perfect for this. We'd write `workflow-analyze.skill.md`, `workflow-summarize.skill.md`, etc. Each skill gets the workflow context as input and returns structured output.

**Aria:** Circular workflow chains — Workflow A triggers Workflow B which triggers Workflow A. Infinite loop. How do we detect this?

Two approaches: (1) Static validation at save time — when a workflow is activated, we traverse the graph and check for any `flow.trigger_workflow` nodes. For each one, we look up the target workflow's trigger graph and detect cycles. If a cycle exists, reject activation with an error. (2) Runtime depth counter — each workflow execution carries a `chain_depth` counter. When `flow.trigger_workflow` fires, it passes `chain_depth + 1`. If `chain_depth > 5`, stop and log an error.

Both together: static validation prevents obvious cycles at config time, runtime depth limit catches dynamic cycles (e.g., a cycle that only forms under certain conditions).

**Priya:** React Flow for the workflow canvas — it's the right choice. 35KB gzipped, actively maintained, used by Zapier, n8n, and half the no-code tools in the industry. Custom SVG canvas would take 6 weeks to build even 80% of what React Flow gives us. Add it as a dependency, lazy-load on the workflow builder route so it doesn't inflate the main bundle.

The canvas builder is a separate route `/app/workflows/:id/builder`. Like `SurveyBuilderPage`, it should use "builder mode" in AppShell — full viewport, no gutters. AppShell already detects `isBuilder` by regex — we'd extend that regex to match `/workflows/:id/builder` too.

**Patricia:** Let me test the end-to-end: I create an NPS Recovery workflow on Tuesday. NPS drops at 2pm. By 2:05pm I need a Slack message AND a Jira ticket. Walk me through every hop.

**Marcus:** 2:00:00pm — NPS drop response submitted. Backend `public.js` saves to `responses` table, publishes event to `insight_events` Redis stream.

**David:** 2:00:05pm — The CrystalOS response stream consumer picks it up within 5 seconds. If the real-time alert evaluator is hooked into this stream (which it needs to be for critical alerts), it runs an immediate NPS delta check.

2:00:15pm — Alert evaluator computes the NPS delta, detects threshold breach, writes to `alert_events`, publishes to `notifications:events:{orgId}` and `workflow_events:{orgId}` Redis streams simultaneously.

**Marcus:** 2:00:20pm — Notification Processor picks up from `notifications:events` stream, dedup check passes, writes to `notifications` table, WebSocket pushes `notification:new` to your browser. You see the in-app notification.

2:00:25pm — Workflow Trigger Listener picks up from `workflow_events` stream, matches against active workflows with `alert.fired` trigger. Your "NPS Recovery" workflow matches.

**Jorge:** 2:00:30pm — Workflow executor creates a `workflow_executions` row, enqueues the first node (Crystal action) as a BullMQ job. BullMQ picks it up immediately (no delay). Calls CrystalOS `POST /api/crystal/workflow-action` with task `analyze`. CrystalOS loads NPS snapshot data and top verbatims, runs structured LLM call. Returns Crystal summary in ~5 seconds.

**Marcus:** 2:00:38pm — Crystal summary returns. Workflow executor writes the result as step output variables: `{{crystal.summary}}`, `{{crystal.top_causes}}`. Enqueues next nodes: Slack action and Jira action (parallel).

2:00:40pm — Slack executor calls Slack Block Kit API with the templated message including `{{crystal.summary}}`. Jira executor creates a Jira issue with Crystal's writeup as description.

2:00:44pm — Both complete. You have a Slack message AND a Jira ticket.

**Patricia:** That's under 45 seconds. I wanted 5 minutes as a ceiling. This is well within it.

---

## Section 7: Cross-Feature Integration Review

**Emma:** Let me raise the coupling question directly. Alerts fire → Notifications deliver → Workflows react. All three features share a Redis event bus. All three need WebSocket delivery. All three call Crystal. This is either elegantly unified or dangerously coupled. Let me state the event topology explicitly.

The complete event topology:

```
PRODUCERS → REDIS STREAMS → CONSUMERS

backend/responses.js:
  response_submitted → insight_events:{orgId} → CrystalOS response_stream consumer (existing)
  response_submitted → notifications:events:{orgId} → Notification Processor [NEW]
  response_submitted → workflow_events:{orgId} → Workflow Trigger Listener [NEW]

Alert Evaluator (Node.js, scheduled):
  alert_fired → alert_events (Postgres write)
  alert_fired → notifications:events:{orgId} → Notification Processor [NEW]
  alert_fired → workflow_events:{orgId} → Workflow Trigger Listener [NEW]

CrystalOS pipeline complete:
  crystal.insight_ready → notifications:events:{orgId} (via notification_bridge.py) [NEW]
  crystal.insight_ready → workflow_events:{orgId} [NEW]
  crystal.anomaly_detected → notifications:events:{orgId} [NEW]
  crystal.anomaly_detected → workflow_events:{orgId} [NEW]
  crystal.topic_emerged → notifications:events:{orgId} [NEW]
  crystal.topic_emerged → workflow_events:{orgId} [NEW]

Notification Processor:
  notification_persisted → notifications:live:{userId} (Redis Pub/Sub) → WebSocket gateway [NEW]

Workflow Executor:
  step_result → workflow_events:{orgId} (for chained triggers)
```

**Aria:** That's the right picture. Two stream families: `notifications:events` for notification pipeline, `workflow_events` for workflow pipeline. Events that should trigger both get published to both. The Notification Processor and Workflow Trigger Listener are independent consumers — they don't know about each other.

**Marcus:** WebSocket — we need ONE Socket.IO server, multiple namespaces or rooms. Not two Socket.IO servers. Namespace `/notifications` for notification delivery. Namespace `/dashboard` for live dashboard updates. Both run on the same Express server, share the same Socket.IO instance. Single connection per client browser.

For multi-instance deployment on Fly.io: `socket.io-redis` adapter (or `@socket.io/redis-adapter` in the modern package) broadcasts Socket.IO events across instances using Redis Pub/Sub. This is required for production. Add it to the Socket.IO setup from the start. Not a "we'll add it later" — if we launch without it and add a second Fly.io instance, WebSocket breaks.

**David:** Confirmed. `@socket.io/redis-adapter` from day one. The Redis connection it needs is the same `REDIS_URL` we already use.

**Jorge:** Crystal called from 5 places: Notification narration, Alert narration, Dashboard narrative, Visual AI analysis/chart generation, Workflow action steps. Are we going to overwhelm CrystalOS?

Current rate limit in CrystalOS: 10 Crystal requests per org per minute (Redis sliding window). All 5 callers share this limit per org. Under normal conditions: notifications fire occasionally (1-5 per hour per org), alerts fire infrequently (1-10 per day), dashboard narrator runs on page load and refresh (maybe 10 per hour per org), visual AI is on-demand (depends on usage), workflow Crystal steps run when workflows fire.

The rate limit might need to be differentiated by caller type. Notifications and alerts are urgent — they shouldn't be throttled. Dashboard narration is deferrable. Visual AI is on-demand. Workflow steps are background.

Proposed: priority queue by caller type. Urgent (alert/notification narration) → bypass rate limit. High (workflow step) → 5/min per org. Normal (dashboard narrator) → 3/min per org. Low (visual AI background analysis) → 2/min per org. Total crystal capacity per org: ~10/min unchanged, but with priority ordering.

**David:** In production on Fly.io, the backend runs multiple instances. Socket.IO needs the Redis adapter (handled above). The Node.js process pool for the backend is independent of CrystalOS. CrystalOS runs as a separate Fly.io app. The only cross-process call is the `AGENTS_URL` HTTP call. This is already the pattern — see `insights.js` calling `AGENTS_URL`.

One gap: the workflow executor calling CrystalOS `POST /api/crystal/workflow-action` needs the same `AGENTS_INTERNAL_KEY` auth. The key is already in env vars. No new secrets needed.

---

## Section 8: Decisions Log

```
DECISION 001: Create new notifications table (not ALTER existing notification_events)
Context: notification_events table uses TEXT ids and lacks title/body/read_at/entity_type fields.
         Design doc's notifications table is materially different. FK types conflict.
Decision: CREATE TABLE notifications (...) with TEXT org_id/user_id (no FK to organizations/users).
          Deprecate notification_events over 2 sprints. New routes read from notifications.
Rationale: Clean slate is safer than a complex migration of an in-use table.
Owners: Marcus (migration), Emma (deprecation plan)

DECISION 002: Drop organizations/users FK constraints from all design doc schemas
Context: Design docs reference organizations(id) and users(id) as FK targets.
         These tables do not exist. Clerk manages user/org identity. All existing tables use TEXT.
Decision: All new tables use TEXT for org_id and user_id, consistent with existing pattern.
          FK constraints to organizations/users tables omitted. Add if user directory table added later.
Rationale: Consistency with existing schema. Avoids a Clerk-sync infrastructure project.
Owners: Marcus (all new migrations), Aria (schema review)

DECISION 003: Notification processor runs inside backend process (no separate service)
Context: Design mentions "Event Engine" as potentially separate. Bull not yet installed.
Decision: v1 — notification processor runs as an async background worker in backend/src/index.js.
          Uses Redis Streams consumer groups (ioredis xreadgroup). No Bull required for v1.
          v2 — extract to separate service if throughput warrants.
Rationale: Simpler deployment for v1. Redis Streams consumer groups provide at-least-once delivery.
Owners: Marcus (implementation)

DECISION 004: Crystal narration is fire-and-forget in notification delivery path
Context: Crystal ReAct loop takes 10-30s. Blocking delivery on narration defeats real-time notifications.
Decision: Notifications are persisted and delivered immediately without narration.
          CrystalOS narration call is async — when complete, updates notifications.metadata via
          PATCH /api/notifications/:id/metadata (internal endpoint) and pushes metadata:updated
          WebSocket event to the user.
Rationale: P95 <2s notification delivery SLO requires asynchronous Crystal enrichment.
Owners: Jorge (CrystalOS narration endpoint), Marcus (internal PATCH endpoint)

DECISION 005: Alert Evaluator uses survey_metric_snapshots for trend-based alerts
Context: Naive responses table queries on 100K rows would be slow (even with indexes).
Decision: All trend-based scheduled alerts (NPS drop, CSAT drop, score anomaly) query
          survey_metric_snapshots for pre-aggregated data.
          Real-time verbatim alerts (T-04, T-07, C-01) query responses table directly
          (triggered per-response, not batch — smaller data set per call).
Rationale: survey_metric_snapshots is maintained by the scheduler already. Avoids re-aggregating.
Owners: Marcus (Alert Evaluator), David (index review)

DECISION 006: Add covering index for responses table analytics queries
Context: Dashboard analytics endpoints need efficient NPS/sentiment aggregates by date range.
Decision: CREATE INDEX idx_responses_org_date_nps ON responses(org_id, submitted_at DESC, nps_score);
          CREATE INDEX idx_responses_survey_date_nps ON responses(survey_id, submitted_at DESC, nps_score);
Rationale: Makes NPS trend and segmentation queries index-only, avoiding heap fetches.
Owners: Marcus (migration)

DECISION 007: Dashboard v1 uses survey_metric_snapshots, not materialized view
Context: Design proposes nps_daily_agg materialized view. pg_cron not configured.
Decision: v1 dashboard trend queries use survey_metric_snapshots directly (already maintained).
          v2 adds nps_daily_agg materialized view if sub-second queries become required.
          Refresh mechanism if needed: CrystalOS scheduler calls POST /api/internal/refresh-analytics-views.
Rationale: No new infrastructure for v1. survey_metric_snapshots already serves this purpose.
Owners: Emma (decision), Marcus (implement if v2 needed)

DECISION 008: /dashboard is a new page route, not a repurposing of existing pages
Context: InsightsDashboardPage and ResponseDashboardPage serve different purposes.
Decision: Create new /app/dashboard route (DashboardPage.tsx). Add ROUTES.DASHBOARD to routes config.
          Existing InsightsDashboardPage (/app/insights) and ResponseDashboardPage unchanged.
Rationale: Clean separation of concerns. Existing pages remain functional.
Owners: Priya (UX), frontend team (implementation)

DECISION 009: Dashboard WebSocket uses Socket.IO rooms by orgId
Context: 100 users on same org's dashboard should receive one broadcast, not 100 individual messages.
Decision: Users join room dashboard:${orgId} on connecting to /dashboard namespace.
          Backend emits to room when response/NPS update event arrives.
          Socket.IO @socket.io/redis-adapter installed from day one for multi-instance support.
Rationale: Prevents N×M message explosion. Required for Fly.io multi-instance.
Owners: Marcus (Socket.IO setup + Redis adapter), Aria (architecture review)

DECISION 010: Single Socket.IO server, multiple namespaces (/notifications, /dashboard)
Context: Both notifications and dashboard need WebSocket delivery. Two separate Socket.IO instances
         would require two connections per browser tab.
Decision: One Socket.IO server on the Express app. Two namespaces: /notifications and /dashboard.
          Single client connection per browser handles both.
Rationale: Simpler for client, fewer connections, shared auth middleware.
Owners: Marcus (implementation)

DECISION 011: Visual AI backend generates signed Firebase Storage upload URLs (not proxy uploads)
Context: Two options: backend proxies image bytes vs client uploads directly via signed URL.
Decision: Backend generates signed upload URL via Firebase Admin getStorage().
          Client uploads directly to Firebase Storage. Backend stores metadata only.
          Storage path: survey-media/{orgId}/{surveyId}/{responseId}/{fileName}
Rationale: No unnecessary data transfer through backend. Firebase CDN handles delivery.
Owners: Marcus (signed URL endpoint), Emma (storage rules update)

DECISION 012: Use MinIO in docker-compose for local image storage (not Firebase emulator)
Context: Firebase Storage not available in local docker-compose environment.
Decision: Add MinIO service to docker-compose.yml. STORAGE_ADAPTER env var: 'minio' (dev), 'firebase' (prod).
          Backend storage library checks STORAGE_ADAPTER and routes accordingly.
Rationale: Most realistic local simulation of Firebase Storage. S3-compatible API.
Owners: David (docker-compose), Marcus (storage adapter implementation)

DECISION 013: Visual AI uses new Crystal tools + skill, not a new LangGraph agent
Context: Design doc specifies VisualAnalystAgent with full LangGraph pipeline.
Decision: Add 3 new Crystal tools to registry.py: analyze_image, generate_chart, generate_visual_insight_card.
          Add 1 new skill: visual-analyst.skill.md. Skill handles orchestration.
          Add 2 new FastAPI endpoints to main.py: POST /visual/analyze, GET /visual/analyze/{job_id}/status.
Rationale: One-shot structured LLM calls don't need multi-step ReAct. Simpler, faster, easier to test.
Owners: Jorge (tools + skill + endpoints)

DECISION 014: AI-generated charts pre-rendered to SVG by backend; live dashboard charts use Recharts
Context: Adding react-vega (~150KB) as second chart library increases bundle size.
Decision: Crystal-generated Vega-Lite specs are rendered to SVG by backend (using vega Node.js package).
          Frontend receives SVG as static output. For dashboard interactive charts, Recharts is used
          (already in vendor-charts chunk). Vega-embed loaded lazily only if truly needed.
Rationale: Keep bundle manageable. Crystal charts are static outputs — no interaction needed.
Owners: Aria (architecture), Marcus (SVG render endpoint), Priya (frontend integration)

DECISION 015: Add nodes/edges columns to workflows table, keep condition/action for legacy
Context: Existing workflows table has condition/action JSONB. Design needs nodes/edges for graph.
Decision: ALTER TABLE workflows ADD COLUMN nodes JSONB DEFAULT '[]', ADD COLUMN edges JSONB DEFAULT '[]'.
          Add status values: 'draft', 'archived', 'error' to the status CHECK constraint.
          API handles both: nodes empty → legacy condition/action path. nodes non-empty → graph path.
          WorkflowsPage.tsx list view continues to work. New builder route: /app/workflows/:id/builder.
Rationale: Non-breaking migration. Backward compatibility maintained.
Owners: Marcus (migration + API dual-path), Priya (builder route)

DECISION 016: Add BullMQ to backend for workflow execution and notification digest scheduling
Context: Neither Bull nor BullMQ is currently in package.json.
Decision: npm install bullmq. BullMQ workers run in the backend process (v1).
          Queues: workflow-execution, notification-digest. Redis connection reuses REDIS_URL.
          v2: extract to dedicated worker process if scale requires.
Rationale: Bull Queue provides delayed jobs, retry, dead-letter — required for workflow reliability.
Owners: Marcus (BullMQ setup), David (Redis persistence verification)

DECISION 017: Workflow circular chain prevention: static validation + runtime depth limit
Context: flow.trigger_workflow action could create infinite loops.
Decision: (1) At workflow activation: traverse graph, detect cycles in trigger_workflow edges. Reject if cycle.
          (2) Runtime: each execution carries chain_depth. If chain_depth > 5, halt + log + write dead-letter.
Rationale: Defense in depth. Static validation for obvious cycles, runtime limit for dynamic ones.
Owners: Marcus (static validation), Jorge (runtime depth tracking)

DECISION 018: Crystal workflow action uses Skill Runtime structured output, not ReAct loop
Context: Workflow Crystal steps need to be fast (3-8s) and predictable.
Decision: New CrystalOS endpoint POST /api/crystal/workflow-action. Uses skill runtime structured call.
          Pre-loaded context (snapshots, verbatims) + task instruction → JSON output. No tool calls.
          Tasks: analyze, summarize, classify, write, decide — each a separate skill file.
          Timeout: 120 seconds (as per design doc). Typical: 3-8 seconds.
Rationale: ReAct loop is too slow and unpredictable for synchronous workflow steps.
Owners: Jorge (endpoint + skills)

DECISION 019: Alert evaluator publishes to BOTH notifications:events AND workflow_events streams
Context: An alert.fired event needs to trigger both the notification pipeline and the workflow engine.
Decision: Alert Evaluator: on alert confirmed, publish to notifications:events:{orgId} AND workflow_events:{orgId}.
          These are independent consumers. No coupling between notification and workflow engines.
Rationale: Events are cheap. Two stream writes per alert event is negligible.
Owners: Marcus (Alert Evaluator publisher)

DECISION 020: Crystal priority queuing across 5 feature callers
Context: Crystal called from: notifications, alerts, dashboard, visual AI, workflows.
Decision: Crystal priority queue by caller:
            URGENT (alert/notification narration): bypass org rate limit
            HIGH (workflow step crystal.analyze/write): 5/min per org
            NORMAL (dashboard narrator): 3/min per org
            LOW (visual AI background analysis): 2/min per org
          Implemented via separate Redis rate limit keys per caller type in CrystalOS.
Rationale: Ensures urgent alert narration never waits behind a dashboard refresh.
Owners: Jorge (CrystalOS rate limit implementation)

DECISION 021: React Flow for workflow canvas builder (lazy-loaded)
Context: Canvas workflow builder needs drag-drop graph editing. Custom SVG canvas too complex.
Decision: npm install @xyflow/react (React Flow v12). Lazy-loaded on /app/workflows/:id/builder route.
          Builder route uses AppShell isBuilder mode (extend isBuilder regex to include /workflows/:id/builder).
Rationale: Industry-standard library for flow editors. 35KB gzipped. Proven at scale.
Owners: Priya (React Flow integration), Diana (canvas implementation)

DECISION 022: Alert narration endpoint as a CrystalOS skill (narrate-alert.skill.md)
Context: Alert narration is a focused one-shot LLM call, not a full ReAct loop.
Decision: New skill narrate-alert.skill.md in crystalos/skills/. Takes structured alert context as input.
          200-word max output. Follows Crystal narration standards from design doc (3-citation minimum,
          active voice, recommended action). Exposed via POST /api/crystal/narrate-alert endpoint.
Rationale: Skill runtime is purpose-built for this. Reuses existing infrastructure.
Owners: Jorge (skill authoring + endpoint)

DECISION 023: add_image_upload question type to SurveyFillPage renderer
Context: Image upload is a new survey question type requiring new frontend component.
Decision: Add case 'image_upload' to question renderer in SurveyFillPage.tsx.
          New <ImageUploadQuestion> component. Answer format: { questionId, imageUrls[], uploadedAt }.
          Stored in responses.answers JSONB. No schema change to responses table needed.
          Firebase/MinIO signed URL requested from backend before upload.
Rationale: JSONB answers array is already type-agnostic. Non-breaking addition.
Owners: Priya (component + renderer), Marcus (signed URL endpoint)

DECISION 024: visual_analysis_jobs table for async image analysis tracking
Context: Image analysis is async (10-30s). Need to track job status.
Decision: CREATE TABLE visual_analysis_jobs (id UUID, org_id TEXT, survey_id UUID, response_id UUID,
          image_url TEXT, status TEXT (pending/processing/complete/failed), result JSONB,
          error TEXT, created_at TIMESTAMPTZ, completed_at TIMESTAMPTZ).
          Frontend receives job_id on POST /api/visual/analyze.
          When complete, backend pushes visual:analysis_complete via WebSocket.
          Frontend shows inline progress, updates when event received.
Rationale: Clean async job pattern. WebSocket push eliminates polling.
Owners: Marcus (table + endpoints), Jorge (CrystalOS result callback)
```

---

## Section 9: Open Questions & Risks

```
OPEN QUESTION 001: Firebase Storage in dev environment
Question: How do image uploads work in docker-compose dev environment where Firebase isn't running?
Decision: MinIO in docker-compose (Decision 012). But MinIO setup needs to be designed.
Options:
  A) MinIO with automatic bucket creation on startup (preferred)
  B) Local filesystem adapter (simpler but less realistic)
  C) Skip image upload in dev (acceptable for v1 if MinIO proves complex)
Assigned to: David Kim
Deadline: Before Sprint 3 (Visual AI phase begins)

OPEN QUESTION 002: Socket.IO Redis adapter in docker-compose
Question: The @socket.io/redis-adapter requires Redis configured correctly.
         Does the existing docker-compose Redis config (if present) support this?
Status: Need to verify if docker/docker-compose.yml already has Redis with appendonly.
Assigned to: David Kim
Deadline: Before Sprint 1 (Notifications phase)

OPEN QUESTION 003: Crystal context window for Dashboard Narrator
Question: What's the right summary payload size for the Dashboard Narrator?
         Target is under 8,000 tokens but this needs empirical testing.
Status: Jorge will build GET /api/analytics/crystal-context and measure token usage.
Assigned to: Jorge Santos
Deadline: Before Sprint 2 (Dashboard phase)

OPEN QUESTION 004: Fly.io multi-instance Socket.IO validation
Question: Has socket.io-redis-adapter been validated in Fly.io multi-region deployment?
         Fly.io proxy behavior with WebSocket upgrade headers needs verification.
Assigned to: David Kim
Deadline: Before production deployment of notifications feature

OPEN QUESTION 005: Alert Evaluator ownership — Node.js or CrystalOS scheduler?
Question: The Alert Evaluator runs every 15 minutes. Should it live in the CrystalOS scheduler.py
         (which already has timed jobs) or in a new Node.js scheduled process?
Status: Current lean: Node.js process (closer to Postgres, simpler HTTP calls to Notification API).
         But CrystalOS scheduler already has the pattern. Either works.
Assigned to: Marcus Williams + Jorge Santos to decide
Deadline: Sprint 1 planning

OPEN QUESTION 006: BullMQ Redis key namespace collision
Question: BullMQ, the rate limiter, the notification processor, and the workflow trigger listener
         all use the same Redis instance. Do their keys conflict?
Status: BullMQ uses prefix bull: by default. Rate limiter uses rl: prefix. Notification dedup uses
        notif: prefix. Response stream uses insight_events. Need to audit all key prefixes.
Assigned to: Marcus Williams
Deadline: Before implementing BullMQ

OPEN QUESTION 007: Vega-lite SVG rendering on Node.js
Question: The vega Node.js package requires a canvas polyfill (node-canvas) for SVG rendering.
         node-canvas has native dependencies that may not compile cleanly in all environments.
Status: Need to test in the existing Node.js backend environment and in Docker.
Options:
  A) vega + node-canvas (official approach, has native deps)
  B) Generate Vega-Lite spec in CrystalOS and render with Python vega-altair (pip install altair)
  C) Return JSON spec to frontend and render with vega-embed client-side (requires loading vega-embed)
Assigned to: Marcus Williams + Jorge Santos
Deadline: Before Sprint 3 (Visual AI)

OPEN QUESTION 008: Organization-level notification fan-out at scale
Question: For org-wide notifications (NPS drop affects all 50 users in org), we create
         50 rows in notifications table. At 10K users per org, this is 10K INSERTs per notification.
         The design notes "switch to fan-out table at 10K+ users." When does this trigger?
Status: For v1, single row per recipient is fine. Define the scale trigger explicitly.
Assigned to: Aria Chen + Marcus Williams
Deadline: Before v2 planning

OPEN QUESTION 009: Crystal tool access for image analysis
Question: analyze_image tool in registry.py needs to call an external vision API (Claude Vision,
         Google Vision, Azure). These require additional API keys (GOOGLE_VISION_API_KEY, etc.)
         not currently in the env var set.
Status: Need to decide primary vision model. Simplest: Claude claude-sonnet-4-6 Vision (already have
         Anthropic SDK in CrystalOS via requirements.txt). Avoids new API keys.
Assigned to: Jorge Santos
Deadline: Sprint 3 planning

OPEN QUESTION 010: notification_preferences dual-table ambiguity
Question: notification_preferences table exists already (migration 20240521000003).
         Design doc's new preferences table has a different schema (in_app_enabled, email_enabled,
         slack_enabled columns vs the existing channel/event_type/enabled pattern).
         The existing /api/notifications/preferences routes use the old schema.
Options:
  A) ALTER existing table to add the new columns, keep backward compat
  B) CREATE new notification_preferences_v2 table, migrate routes
  C) Reconcile the two schemas (old is per-channel per-type, new is per-type with 3 channel booleans)
         — these are logically equivalent, different representation
Assigned to: Marcus Williams + Aria Chen
Deadline: Sprint 1 schema design

RISK 001: Redis Streams key proliferation
Description: Per-org stream keys (notifications:events:{orgId}, workflow_events:{orgId}) means
             1,000 orgs = 2,000+ Redis stream keys. Each stream has retention (24h for notifications).
             Need to verify Redis memory limits under this load.
Mitigation: Set MAXLEN on all xadd calls (already done for agent_run_events: maxlen=50,000).
            Set notification stream maxlen=10,000. Monitor total Redis memory in Prometheus.
Severity: Medium
Owner: David Kim

RISK 002: Crystal rate limits under load
Description: 5 features now call Crystal. Org-level rate limit of 10/min could be saturated
             by notification narrations alone during high-event periods (e.g., survey milestone
             reached + alert fired + dashboard load all happen in 60 seconds).
Mitigation: Decision 020 (priority queuing). Monitor Crystal call rates per org in Langfuse.
Severity: High
Owner: Jorge Santos

RISK 003: BullMQ delayed job duration and Redis persistence
Description: Workflow delays of up to 24 hours rely on Redis AOF persistence.
             If Redis is restarted without appendonly:yes configured, all delayed jobs are lost.
Mitigation: Verify docker-compose Redis config has --appendonly yes (Decision 012 flag).
            In production Fly.io: use Redis persistent volume. Add job recovery on startup.
Severity: High
Owner: David Kim

RISK 004: Workflow infinite loops in production
Description: Despite static validation + runtime depth limit (Decision 017), edge cases remain.
             External webhook triggers could fire from a workflow action (Workflow A posts webhook
             → triggers itself via external.webhook trigger).
Mitigation: Add execution_source tracking. If execution_source == workflow_chain and chain_depth > 3,
            terminate with clear error. Monitor workflow_dead_letters table for patterns.
Severity: Medium
Owner: Marcus Williams

RISK 005: Firebase Storage signed URL expiry during large file uploads
Description: Signed URLs expire (typically 15 minutes). Large image uploads on slow connections
             could hit the expiry window.
Mitigation: Set URL TTL to 30 minutes in Firebase Admin signedURL config.
            Frontend shows progress and alerts user if URL expires (fallback: re-request URL).
Severity: Low
Owner: Marcus Williams
```

---

## Section 10: Patricia's End-to-End Validation

### Scenario 1: NPS Drop → Slack Alert (< 5 minutes)

**Patricia:** I'm SVP of CX at a large insurance company. It's Tuesday at 2:00pm. One of my underwriters submits a terrible NPS response (score: 2) — we've been hemorrhaging detractor responses all morning. I need to know about it by 2:05pm.

**Step-by-step trace:**

**T+0:00** — Customer submits NPS response. `POST /api/public/surveys/{token}/respond`. Backend's `public.js` handler: validates payload, inserts into `responses` table (`nps_score: 2`). Returns 200 to the respondent.

**T+0:01** — Backend publishes to `insight_events:{orgId}` Redis stream (existing flow, unchanged). Also publishes to `notifications:events:{orgId}` and `workflow_events:{orgId}` streams. These are fire-and-forget — 3 stream writes, non-blocking.

**T+0:02** — The Real-Time Alert Evaluator (hooked into the insight_events consumer) wakes up. Checks: has the cumulative NPS delta for this survey crossed the critical threshold? Queries `survey_metric_snapshots` for today's NPS vs the 7-day baseline. Delta: -8 points. Threshold: -5 points. Critical alert fires.

Alert Evaluator writes `alert_events` row: `{ alert_type: 'S-01', severity: 'critical', metric_value: 34, metric_baseline: 42, metric_change: -8 }`. Checks Redis dedup key — `alert:dedup:{orgId}:S-01:{surveyId}:2026-06-03` — not set. Sets it with 24h TTL.

**T+0:03** — Alert Evaluator publishes to `notifications:events:{orgId}` and `workflow_events:{orgId}` simultaneously.

Notification Processor picks up from `notifications:events` within 1-2 seconds. Resolves recipients from `notification_preferences` (all CX leaders and admins for `score.nps_drop:critical`). Dedup check passes. Writes to `notifications` table for each recipient. Pushes `notification:new` via Socket.IO to each recipient's room.

**T+0:05** — Your browser tab (you're on the dashboard) receives Socket.IO event `notification:new`. Toast appears top-right: "NPS Alert — Critical. NPS dropped 8 points." Bell icon turns red with count badge. You click the notification. Navigates to `/app/alerts/{alert_event_id}`.

**T+0:06** — In the background (started at T+0:03): Crystal narration job was queued (LOW priority, but alerts bump to URGENT). CrystalOS receives `POST /api/crystal/narrate-alert`. Skill `narrate-alert.skill.md` runs: loads verbatim samples for the last 24 hours, loads topic breakdown, constructs narration. LLM call completes in ~5 seconds.

**T+0:10** — Crystal narration lands: "This week's NPS decline from 42 to 34 is driven by a surge in verbatims mentioning 'claim processing delays' — rising from 6% to 22% of all responses. The sharpest drop correlates with the new digital claims portal rollout on June 1." Backend calls `PATCH /api/notifications/{id}/metadata` with narration. Pushes `notification:metadata_updated` via WebSocket.

**T+0:10** — Your alert detail page refreshes with Crystal's narration displayed in the Crystal Analysis panel.

**T+0:15** — Workflow Trigger Listener (started at T+0:03) matched your "NPS Recovery" workflow against the `alert.fired` event. BullMQ job enqueued. Executor starts.

**T+0:20** — BullMQ picks up job. Evaluates condition node: `IF NPS < 30` — current NPS is 34, doesn't match critical branch. Matches `IF NPS 30-40` warning branch. Enqueues: Crystal analyze step.

**T+0:25** — Crystal `POST /api/crystal/workflow-action` with task `analyze`. Skill loads snapshots + verbatims. Returns structured output: `{ summary: "...", top_causes: [...], severity: "warning" }`.

**T+0:30** — Workflow executor has Crystal output. Enqueues parallel: Slack action + Jira action.

**T+0:35** — Slack executor calls Block Kit API. Message lands in `#cx-alerts`: "NPS Alert — {survey name}. NPS dropped from 42 to 34 (-8 pts). Crystal: '{Crystal summary}'. → View dashboard link."

**T+0:40** — Jira executor creates issue: Priority P2, description includes Crystal's full analysis, labels: `cx-alert, nps-drop`.

**Total elapsed: ~40 seconds from response submission to Slack message and Jira ticket.**

Patricia's goal was 5 minutes. We're delivering in under 1 minute.

**Patricia:** That's better than I expected. What if the alert evaluator is in its batch cycle (not real-time)? Worst case?

**David:** Worst case: alert evaluator just ran its batch 14 minutes ago. The real-time evaluator hook fires on the insight_events stream — but if we haven't built the real-time hook for critical alerts yet (it's a Sprint 2 item), we fall back to the next batch cycle. Worst case: 14 minutes + 40 seconds. Still under 15 minutes. For v1, that's acceptable for warnings. Real-time path for critical alerts is a Sprint 2 requirement.

---

### Scenario 2: Crystal Chart on Dashboard

**Patricia:** I'm looking at the NPS Trend chart on my dashboard. I can see it dipped at the end of May. I click "Ask Crystal" on the chart.

**Step-by-step trace:**

**T+0:00** — Frontend sends POST `/api/insights/{surveyId}/ask` (existing endpoint) or new POST `/api/analytics/crystal-explain`. The request body includes: the chart data points (pre-summarized NPS trend for 90 days), Patricia's question ("Why did NPS dip at the end of May?"), and the current dashboard filter context (date range, survey, segment).

**T+0:01** — Backend receives request. Fetches Crystal context summary via `GET /api/analytics/crystal-context` — top 10 topics, KPIs for last 30 days, 3 verbatims per negative topic, total context under 6,000 tokens. Forwards to CrystalOS `POST /insights/{surveyId}/crystal/explain-chart` with: chart_data + question + crystal_context.

**T+0:02** — CrystalOS receives the request. Runs a structured one-shot analysis (not the full ReAct loop). The existing Crystal architecture in `crystal/tools.py` has the data access layer. For this call: Crystal system prompt includes the chart data and pre-loaded context. Question: "Explain the NPS dip at end of May." Crystal LLM generates response.

**T+0:08** — Since this is a streaming response (SSE), tokens start arriving at the frontend within 2 seconds. The chart panel updates in real-time as Crystal explains: "The NPS decline in late May correlates with a surge in 'claims processing delay' mentions..."

**T+0:15** — Full response received. Crystal panel shows complete analysis. Response tokens render as they arrive via SSE — same streaming pattern as the existing Crystal Q&A in `InsightsDashboardPage.tsx`.

**T+0:15** — If Crystal detects an anomaly worth charting, it returns a Vega-Lite spec alongside the narrative. Backend renders to SVG via the vega renderer. Frontend displays the SVG inline in the Crystal panel: "Here's the correlation between response volume and NPS score over May."

**Total: 15 seconds end-to-end including streaming.** Crystal panel is interactive during this — user sees words appearing as Crystal reasons through the data.

**Aria:** Note that the "explain chart" endpoint is distinct from the existing Crystal Q&A. The existing `POST /api/insights/:surveyId/ask` is for general Crystal questions about a survey. The chart explanation endpoint is more constrained — it pre-loads the chart data and asks for a focused explanation. We should route this as a new endpoint rather than overloading the existing one.

---

### Scenario 3: Image Upload Survey

**Patricia:** My company runs store inspection surveys. One of my field managers takes a photo of a dirty food prep area on their phone during a site inspection survey.

**Step-by-step trace:**

**T+0:00** — Manager opens the survey on mobile browser (`/s/{publish_token}`). `SurveyFillPage.tsx` loads. Survey has an Image Upload question: "Upload a photo of today's inspection area." Renderer matches case `'image_upload'` and renders `<ImageUploadQuestion>` component.

**T+0:05** — Manager taps "Camera" button. Browser requests camera permission. Takes photo (HEIC format on iOS). `<ImageUploadQuestion>` validates: size < 10MB (yes, 2.3MB), format (HEIC → needs conversion), count (1 of max 5). Component shows thumbnail preview and "Uploading..." indicator.

**T+0:06** — Frontend requests a signed upload URL: `POST /api/visual/upload-url` with `{ orgId, surveyId, fileName: 'inspection_photo.heic', contentType: 'image/heic' }`. Backend uses Firebase Admin `getStorage().bucket().file().getSignedUrl()`. Returns signed URL + destination path.

**T+0:07** — Frontend uploads directly to Firebase Storage (MinIO in dev) using the signed URL. Progress bar updates. 2.3MB upload on mobile 4G: ~3 seconds.

**T+0:10** — Upload complete. Firebase Storage path: `survey-media/{orgId}/{surveyId}/{responseId}/inspection_photo.heic`. Frontend now has the permanent `imageUrl`.

**T+0:11** — Manager completes survey, taps Submit. `POST /api/public/surveys/{token}/respond`. Answers JSONB includes: `{ questionId: "...", imageUrls: ["https://firebase-storage-url/inspection_photo.heic"] }`. Backend saves to `responses` table.

Simultaneously: backend calls `POST /api/visual/analyze` with `{ imageUrl, orgId, surveyId, responseId, analysisType: 'quality_assessment' }`. CrystalOS creates a `visual_analysis_jobs` row (status: pending) and returns `{ jobId }` immediately.

**T+0:12** — CrystalOS kicks off async visual analysis job. Calls Claude claude-sonnet-4-6 Vision API with the image URL. Preprocessing: HEIC → JPEG conversion via Python Pillow, EXIF strip, safety screening.

**T+0:40** — Claude Vision analysis complete. Results: `{ objectsDetected: ["food prep surface", "cutting board", "residue"], sentimentFromVisual: "negative", qualityAssessment: "cleanliness_issue", crystalLabel: "Food prep area cleanliness concern detected" }`. CrystalOS writes result to `visual_analysis_jobs.result` (status: complete). Calls backend callback `POST /api/internal/visual-analysis-complete` with job result. Backend pushes `visual:analysis_complete` via WebSocket to org admin's connected sessions.

**T+0:40** — If a CX analyst has the image gallery open for this survey, their browser receives the WebSocket event. The image appears in the gallery with a red dot indicator and Crystal label: "Cleanliness issue detected."

**T+24:00** (aggregate) — By the next day, Crystal has analyzed all 47 store inspection photos submitted. The gallery shows: 62% clean environments (green), 23% cleanliness concerns (red), 15% signage issues (yellow). Crystal aggregate summary: "8 of 47 photos show food prep area concerns. Concentrated in southeast region locations. Recommend immediate inspection of stores 14, 22, and 31."

**Patricia:** That's the workflow I need. The one thing I want confirmed: what if the Vision API call fails? Does the survey response still get saved?

**Marcus:** Yes. The visual analysis job is fire-and-forget from the response submission path. `POST /api/public/surveys/{token}/respond` completes and returns success regardless of whether the visual analysis job was created. If CrystalOS is down, the job creation fails silently (logged to Loki). The image URL is still saved in `responses.answers`. We can replay the analysis jobs later via a reconciliation job that checks for images without completed visual analysis.

**Patricia:** Good. The response is the source of truth, not the analysis.

---

*Integration Review concluded. 24 decisions logged. 10 open questions and 5 risks identified. Document prepared by the Experient Platform cross-functional team, 2026-06-03.*

*Next steps: Marcus Williams to own schema migrations (Decisions 001-024 sequencing). Jorge Santos to own CrystalOS endpoint additions. David Kim to validate docker-compose and Socket.IO Redis adapter. Priya Sharma to lead WorkflowsPage update and builder route. All open questions assigned with deadlines above.*
