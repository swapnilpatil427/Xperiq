# What To Build Next — Prioritized Task Queue

> Pull from the top. Each task is independently shippable and unblocks the next.
> Cross-org isolation is the prerequisite for everything — it must be done first.

---

## BLOCKING — Do Before Writing Any Feature Code

**TASK-001: Shared org-isolation middleware**
Write `backend/src/middleware/requireOrgResource.ts` — a generic helper that takes `(table, idParam)` and validates that the row's `org_id` matches `req.orgId` before the route handler runs. Every route that touches a resource by ID must use this. This is the root fix for the cross-org injection finding across all 4 features.

**TASK-002: Fix MCP skill org_id validation**
The CrystalOS MCP skills currently accept `org_id` as a caller-supplied parameter. Change `crystalos/skills/` so org_id is always sourced from the authenticated session context, never from the skill input payload. This closes the broken-access-control finding in the Intelligence Groups security review.

**TASK-003: Webhook SSRF blocklist (Xperiq Actions)**
Before any workflow webhook action can fire, validate the target URL against a blocklist: private IP ranges (10.x, 172.16–31.x, 192.168.x), link-local (169.254.x.x), and localhost. Add this to `backend/src/lib/` as `validateWebhookUrl.ts`. Blocks the direct path to AWS metadata endpoint.

**TASK-004: LLM output sanitization for email**
Add a `sanitizeCrystalOutput(html: string): string` utility (DOMPurify server-side) in `backend/src/lib/` that strips all tags except a safe allowlist (p, strong, em, ul, li, a[href]). Every Intelligence Briefing email generation step must pass Crystal narrative through this before inserting into email HTML. Closes the XSS Critical.

---

## Priority 1 — Intelligence Groups (Tags)

**TASK-005: DB migration — tags core**
Write `supabase/migrations/20260701_tags_core.sql`: create `tags`, `survey_tags`, `tag_proposals`, `tag_hierarchies` tables with all indexes. Include the `tag_namespaces` table (required by ISSUES_AND_FIXES — the original design had namespaces as a column, not a table, which breaks the lock enforcement model).

**TASK-006: Backend — tags CRUD routes**
Create `backend/src/routes/tags.ts` with: `GET /api/tags`, `POST /api/tags`, `PUT /api/tags/:id`, `DELETE /api/tags/:id` (soft-delete). All routes scoped to `req.orgId`. Include `backend/src/lib/tagCache.ts` for Redis cache with 5-minute TTL. Use TASK-001 middleware for PUT/DELETE.

**TASK-007: Backend — survey-tags routes**
Add `POST /api/surveys/:id/tags` and `DELETE /api/surveys/:id/tags/:tagId`. Validate that both the survey and the tag belong to `req.orgId` (this was the Critical finding — currently no ownership check). Stub `GET /api/tag-insights/:tagSlug` returning 501.

**TASK-008: Frontend — TagPill + TagPicker components**
Build `app/src/components/tags/TagPill.tsx` (glassmorphism, `color-mix()` formula from DESIGN.md) and `app/src/components/tags/TagPicker.tsx` (Radix UI Popover, 150ms debounce, T keyboard shortcut, inline create mode with 14-color picker). All strings via `t('key')` in `locales/en.ts`.

**TASK-009: Frontend — TagFilterBar + survey list integration**
Build `app/src/components/tags/TagFilterBar.tsx` with OR/AND toggle and URL state via `useSearchParams`. Integrate into survey list page with "Group by tag" swim-lane view toggle. Add tag pills (max 3 visible) to survey cards.

**TASK-010: Frontend — /settings/tags management page**
Build `app/src/pages/settings/TagsSettingsPage.tsx`: full table (tag, survey count, NPS sparkline, created by), merge flow, namespace lock toggle. Wire into router and nav.

**TASK-011: DB migration — tag_insights materialized view**
Write `supabase/migrations/20260715_tag_insights.sql`: create `tag_insight_trend` table and `tag_insights` materialized view. Add `REFRESH MATERIALIZED VIEW CONCURRENTLY` function. Add pg_cron schedule at 15-minute cadence. Add distributed lock key in Redis to prevent double-refresh race (P0 from OPS_REVIEW).

**TASK-012: CrystalOS — tag_insight_pipeline skill**
Write `crystalos/skills/tag_insight_pipeline/skill.py` with the 7-node LangGraph graph: fetch_tag_surveys → fetch_responses → compute_metrics → detect_anomalies → generate_narrative → store_brief → emit_telemetry. Include `SKILL.md` and `EVALS.md` with ≥10 eval cases. Target ≥90% eval pass rate before shipping.

**TASK-013: Frontend — Tag Intelligence View page**
Build `app/src/pages/TagInsightPage.tsx`: page header with tag color gradient wash, KPI row (4 cards with sparklines), Recharts area chart (30/60/90 day toggle), topic heatmap grid, survey breakdown table, Crystal narrative panel. Route: `/tag-insights/:slug`.

**TASK-014: CrystalOS — auto_tag skill**
Write `crystalos/skills/auto_tag/skill.py`: embedding similarity against existing tag descriptions + LLM refinement to produce ranked proposals. Include `SKILL.md` and `EVALS.md`. Must hit ≥60% accept rate on held-out test set before Phase 3 ships.

**TASK-015: Frontend — auto-tag proposal confirm-card**
Build `app/src/components/tags/AutoTagProposalCard.tsx`. Shows on survey creation flow. Framer Motion `layoutId` fly-to animation when accepting (pill shrinks in proposal row, flies to survey tag row). Outcomes recorded to `tag_proposals` table.

**TASK-016: Tag Universe force-directed graph**
Build `app/src/components/tags/TagUniverseGraph.tsx` (D3 force simulation, node radius = sqrt(survey_count), NPS color overlay, edge thickness = shared_survey_count). Route `/tag-insights/universe` gated to Enterprise plan. Side panel slides in on node click.

---

## Priority 2 — Xperiq Actions (Workflows)

**TASK-017: DB migration — workflows core**
Write `supabase/migrations/20260801_workflows_core.sql`: create `workflows`, `workflow_conditions`, `workflow_actions`, `workflow_runs`, `workflow_run_steps` tables. Add `workflow_versions` table (do NOT use JSONB array for version history — this was an ADR correction from ISSUES_AND_FIXES). All indexes as specified in ARCHITECTURE.md.

**TASK-018: BullMQ queue setup + workflow executor**
Create `backend/src/lib/workflowQueue.ts`: BullMQ queue with max 20 concurrent workers, dead-letter queue, and idempotency key enforcement. Create `backend/src/workers/workflowExecutor.ts`: processes queued workflow runs, executes action steps sequentially, records step outcomes. Add AES-256-GCM encryption with per-record IVs for credential storage (Critical finding from SECURITY_REVIEW).

**TASK-019: Workflow trigger engine**
Create `backend/src/lib/workflowTriggerEvaluator.ts`: evaluates trigger conditions (response_count, nps_threshold, response_rate_drop) against incoming data. Use BullMQ repeatable jobs for schedule triggers (not polling — ADR correction from ISSUES_AND_FIXES). Add Redis distributed lock so horizontal scaling doesn't double-enqueue.

**TASK-020: Backend — workflow CRUD routes**
Create `backend/src/routes/workflows.ts`: all 12 REST endpoints from ARCHITECTURE.md. Workflow actions with action type `webhook` must call `validateWebhookUrl` (TASK-003) before saving. All routes scoped to `req.orgId`.

**TASK-021: Frontend — workflow list + visual builder**
Build `app/src/pages/WorkflowsPage.tsx` (card grid, status pills, run stats) and `app/src/components/workflows/WorkflowBuilder.tsx` (3-panel layout: trigger selector / canvas with animated bezier SVG connectors / config panel). Framer Motion spring animations on connector lines.

**TASK-022: CrystalOS — nl_to_workflow skill**
Write `crystalos/skills/nl_to_workflow/skill.py`: LangGraph subgraph that parses natural language into a structured workflow definition (trigger + conditions + actions). Add system prompt hardening to prevent prompt injection (Critical from SECURITY_REVIEW). Include `EVALS.md` with 15 cases.

**TASK-023: Frontend — Crystal NL workflow builder**
Add "Build with Crystal" panel to the workflow builder. Text input → Crystal generates workflow → staggered card fill animation showing trigger/conditions/actions populating. User reviews and confirms before saving.

**TASK-024: AI trigger types — Crystal Signals**
Wire up the 3 AI trigger types: `sentiment_spike`, `new_theme_detected`, `anomaly_detected`. These fire from the insight pipeline emitting events to the workflow trigger evaluator via Redis pub/sub. Add cooldown UI so users can set minimum time between firings (Must Fix from CUSTOMER_REVIEW).

**TASK-025: Workflow run history + test mode**
Build `app/src/components/workflows/RunHistoryTimeline.tsx` (expandable step payloads, re-run button) and test mode dry-run panel that runs a workflow with a sample payload without executing real actions.

---

## Priority 3 — Intelligence Briefings (Scheduled Reports)

**TASK-026: DB migration — reports core**
Write `supabase/migrations/20260901_reports_core.sql`: create `report_templates`, `scheduled_reports`, `report_runs`, `report_artifacts`, `report_recipients` tables. Add the 7 new tables identified in ISSUES_AND_FIXES (approval queue, artifact encryption metadata, recipient domain allowlist, etc.). Switch artifact storage to reference-based quotes (no verbatim PII inline — Critical GDPR fix).

**TASK-027: Report generation queue**
Create `backend/src/lib/reportGenerationQueue.ts`: BullMQ queue with max 50 concurrent workers. This is the P0 ops fix — without a queue, 5,000 orgs generate simultaneously on Monday 9 AM. Add Redis SET NX scheduler lock (one schedule evaluation per window).

**TASK-028: CrystalOS — report_generation_graph skill**
Write `crystalos/skills/report_generation/skill.py`: 11-node LangGraph DAG from ARCHITECTURE.md. Output must be sanitized before HTML insertion (TASK-004). Never pass verbatim quotes directly — reference response IDs only.

**TASK-029: Email delivery system**
Create `backend/src/lib/reportEmailer.ts`: SendGrid integration with recipient domain allowlist validation (Critical fix — no external recipients outside verified org domain without explicit allowlist). Add GDPR-safe quote rendering that fetches fresh from `responses` table at send time.

**TASK-030: PDF artifact generation**
Spin up a separate Playwright render service (`backend/src/services/reportRenderer.ts`) — do NOT run Playwright in-process with the LLM graph (P0 ops fix). Async render queue, 500MB memory cap per instance.

**TASK-031: Frontend — report builder wizard**
Build 3-step wizard: template picker → scope/schedule → recipients. Live preview panel with viewport toggle (email vs PDF). Recipient domain validation UI (shows warning if recipient is outside org domain).

**TASK-032: Frontend — reports landing page + archive**
Build `app/src/pages/ReportsPage.tsx`: list of scheduled reports with last-run status, next-run time, open rate. Report archive view (Must Fix from CUSTOMER_REVIEW — currently no way to find past reports). Report approval gate UI before first delivery.

---

## Priority 4 — Command Center (Org Dashboard)

**TASK-033: DB migration — org metrics core**
Write `supabase/migrations/20261001_org_dashboard_core.sql`: create `org_metrics_daily` (partitioned by month — prerequisite before 10k orgs, from OPS_REVIEW cost model), `org_metrics_weekly`, `org_topic_trends`, `org_health_score`, `tag_group_metrics`, `survey_health_summary`, `org_crystal_briefs`. All pg_cron schedules.

**TASK-034: Fix pg.Client LISTEN reconnect (P0)**
Create `backend/src/services/orgRealtime.service.ts` with auto-reconnect logic on the pg LISTEN connection — exponential backoff, max 10 retries, Prometheus alert on failure. This is P0 from OPS_REVIEW — silent failure on Postgres failover leaves all WebSocket clients frozen.

**TASK-035: WebSocket real-time server**
Implement Socket.io room-per-org in `backend/src/services/orgRealtime.service.ts`. JWT re-validation on every message (not just on connect — SECURITY_REVIEW finding). Redis pub/sub → WebSocket fan-out with debounce to prevent pg_notify overflow at 1,000+ inserts/min.

**TASK-036: CrystalOS — org_brief_graph**
Write `crystalos/skills/org_brief_graph/skill.py`: 6-node LangGraph DAG. Add context-window budget guard to `synthesize_narrative` (P0 ops fix — large orgs silently produce no brief today). Cap `critical_surveys` list to top 10 by severity before passing to LLM.

**TASK-037: Org Health Score computation**
Implement `compute_all_org_health_scores()` in a dedicated pg function. Must be a single bulk UPDATE, not a row-by-row loop (P1 ops fix). Add composite scoring weights documented in ARCHITECTURE.md. Schedule via pg_cron daily.

**TASK-038: Frontend — Command Center page**
Build `app/src/pages/CommandCenterPage.tsx`: fixed top nav Health Bar (Org Health Score animated count-up on load), Crystal Brief card, KPI row (4 tiles), dual-axis Recharts NPS/volume chart, Programs Overview table with health pills sorted by urgency (Must Fix from CUSTOMER_REVIEW), Emerging Topics chip scroll, Anomaly Alerts sidebar.

**TASK-039: Frontend — War Room mode**
Build War Room dark-theme fullscreen view (`/command-center/war-room`). TV-optimized layout, no sidebar, auto-rotating program cards. WebSocket reconnect with jittered exponential backoff (P1 ops fix — fixed-delay causes reconnect storm on deploy).

**TASK-040: Executive Share Links**
Implement signed, read-only share links for Command Center (top expansion request from CUSTOMER_REVIEW). `org_share_links` table, token-authenticated route, scoped data only (no drill-down to raw responses). Expiry configurable by admin.

**TASK-045: Flip CrystalOS output model — InsightReport is primary, email is a rendering**
Change `crystalos/skills/report_generation/skill.py` so the graph always produces `state.insight_report = { title, summary, findings[], data_status, data_note }` as its canonical output. The `render_email` node converts `state.insight_report` into HTML. Add a three-case insufficient-data handler at the start of `backend/src/workers/reportGenerationQueue.ts`: (A) enough data → generate fresh report; (B) not enough data + prior report exists → clone prior report with today's timestamp, write new trail checkpoint, deduct credit — no banner, no indicator, delivered identically to a fresh report; (C) no data and no prior report → generate a transparent "nothing yet" InsightReport, still write trail checkpoint and deduct credit — never skip a scheduled run. All three cases write a trail checkpoint and deliver to recipients. Case B adds an amber "prior data" banner to email/Slack. Case C replaces the Crystal Summary card with a "Crystal is watching" informational section. Add `triggerScheduled` + `viewFullReport` locale keys to `surveyInsights.trail`.

**TASK-046: Org/tag scope skeleton in the builder — no generation backend**
In the Automation Hub builder (`BriefingConfigPanel`), the Scope field (Field 4) already shows three options: Specific survey / Tag group / Entire org. No change needed there. In `backend/src/workers/reportGenerationQueue.ts`, add a guard: if `scope !== 'survey'`, complete the run with `status: 'pending_feature'` and do not invoke CrystalOS. In the frontend automation card, detect `run.status === 'pending_feature'` and show an amber pill: `"Org-scope report — coming soon"`. Add locale key `orgScopeComingSoon`. This keeps the builder honest about what's supported without silently failing or blocking the survey-scoped work. No `BriefingsArchivePage` needed — org/tag reports will live in Command Center when that feature ships.

---

## Cross-Feature Integrations (After All 4 Features Ship)

**TASK-041: Workflow trigger — tag_nps_threshold**
Wire Intelligence Groups NPS into Xperiq Actions: when `tag_insights.aggregate_nps` crosses a configured threshold, emit event to workflow trigger evaluator. Hysteresis: must recover before re-firing.

**TASK-042: Report scope — tag_filter parameter**
Add `tag_filter: string[]` to Intelligence Briefings report scope. Routes report generation through `tag_insights` materialized view aggregates. Required for Tag Group Weekly briefing template.

**TASK-043: Command Center drill-down to tag groups**
Wire Command Center → Intelligence Groups: clicking a tag group row in the comparison grid navigates to `/tag-insights/:slug`. Org Health Score drill-down path: Org → Tag Group → Survey Detail → Crystal Chat.

**TASK-044: MCP skills — publish all 4 native skills**
Publish to MCP: `get_tag_insights(tag_slug, org_id)`, `run_workflow(workflow_id)`, `get_report(report_id)`, `get_org_health()`. Each needs `SKILL.md`, `EVALS.md`, and passing eval suite before publishing.

---

*When you ask "what to build next" — I'll give you the next uncompleted task from the top of this list.*
