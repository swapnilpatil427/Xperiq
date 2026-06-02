# Crystal Intelligence Platform — Full Implementation Tracker

> **Executive view + open decisions:** `docs/crystal-research/TRACKER.md`
> **This file:** Implementation tasks only — file paths, code specs, dependencies, phase gates.
>
> **How to use:** Work phases top-to-bottom. Never start a phase until all blocking phases are ✅.
> Tasks marked 🔴 are gaps that require a decision or provisioning action **before** implementation begins.
> Status: ⬜ not started · 🔄 in progress · ✅ done · ⚠️ blocked by gap · ❌ skipped

---

## Gaps & Decisions (resolve before coding)

These are prerequisites not covered anywhere in the research docs. Each blocks at least one phase.

| ID | Gap | Blocks | Action needed |
|----|-----|--------|---------------|
| GAP-01 | `agents/lib/constants.py` does not exist | Phase 0 | Create file (spec in doc 06 Phase 0) |
| GAP-02 | `agents/crystal/` package does not exist | Phase 4 | Create package (Phase 4 creates it) |
| GAP-03 | `agents/lib/checkpoint_store.py` does not exist | Phase 3 | Create file (spec in doc 06 Phase 3) |
| GAP-04 | `survey_insight_checkpoints` table is not in any migration | Phase 1 | Write migration (DDL in doc 05 §6.3) |
| GAP-05 | `notification_preferences` table is not in any migration | Phase 1 | Write migration (DDL in doc 05 §6) |
| GAP-06 | `notification_events` table is not in any migration | Phase 1 | Write migration (DDL in doc 05 §6) |
| GAP-07 | `ai_operation_logs` table is not in any migration | Phase 1 | Write migration (DDL in doc 05 §6.5) |
| GAP-08 | `agent_runs` table missing heartbeat columns (`last_heartbeat_at`, `max_run_duration_minutes`, `retry_count`, `retry_of`, `failure_reason`, `failed_at`) | Phase 1 | Write ALTER TABLE migration (doc 05 §10.4) |
| GAP-09 | `crystal_threads` table exists but missing `thread_key` UNIQUE constraint and TTL columns per doc 05 spec | Phase 1 | Write ALTER TABLE migration to reconcile |
| GAP-10 | ~~GCS bucket not provisioned~~ → **RESOLVED: using OCI Object Storage** | Phase 3 | `agents/lib/checkpoint_store.py` created. dev/dev-paid: local filesystem at `CHECKPOINT_LOCAL_PATH`. staging/prod: OCI Object Storage (bucket provisioned by `terraform apply`). OCI SDK optional — falls back to local with warning. Env vars: `CHECKPOINT_OCI_BUCKET`, `CHECKPOINT_OCI_NAMESPACE`, `CHECKPOINT_OCI_REGION` in `agents/env.example`. |
| GAP-11 | ~~google-cloud-storage~~ → **RESOLVED: OCI SDK** | Phase 3 | Add `oci>=2.119.0` to `agents/requirements.txt` as optional dependency. `checkpoint_store.py` catches `ImportError` and falls back to local silently. |
| GAP-12 | `org_profile` table — no `industry` or `vertical` field confirmed in schema. Specialist matching requires it. | Phase 4 | Audit `org_profile` schema; add `industry TEXT` if missing; add UI field to BrandSettingsPage |
| GAP-13 | Specialist system prompt strings — `agents/specialists/base.py` and `registry.py` exist but must match the 7-specialist matrix in doc 04 §11.4 | Phase 4 | Audit specialist files; add missing specialists or update mismatched prompts |
| GAP-14 | ~~Crystal opening observation — no design~~ → **RESOLVED: derive from top descriptive insight** | Phase 7 | No extra LLM call. Backend `GET /api/insights/:surveyId/list` adds `crystal_opening: string \| null` derived from `SELECT narrative FROM insights WHERE survey_id=$1 AND org_id=$2 AND layer='descriptive' ORDER BY trust_score DESC LIMIT 1`. If null: frontend shows tier-appropriate i18n copy (`insights.crystal.opening.${dataTier}`). Crystal panel shows this as its pre-loaded first message before the user types. Thread starts only on user's first message. |
| GAP-15 | Response velocity formula undefined — `response_velocity` appears in doc 04 §2.1 but the formula (per-day? per-week? rolling?) is never stated | Phase 3 | Define: `velocity = response_count / max(1, days_since_first_response)` (responses per day). Document in constants. |
| GAP-16 | Org-level aggregation job — `get_org_portfolio` and `get_cross_survey_themes` Crystal tools require aggregated cross-survey data. No scheduler task computes this. | Phase 7 | Add `run_org_aggregation()` to scheduler; runs hourly; writes to `org_metric_snapshots` |
| GAP-17 | ~~Signed URL strategy~~ → **RESOLVED: OCI PAR + local proxy** | Phase 7 | dev/dev-paid: backend calls `agentsClient.getCheckpointBlob(ref)` → `GET /internal/checkpoint-blob` → agents reads local file and returns JSON. staging/prod: backend calls `agentsClient.getCheckpointReadUrl(ref)` → `GET /internal/checkpoint-read-url` → agents generates OCI PAR URL (15-min) → backend returns it. Both internal endpoints added to `agents/main.py`. Both client methods added to `agentsClient.js`. `checkpoint_store.get_checkpoint_read_url()` handles both paths. |
| GAP-18 | `app/src/hooks/useExperience.ts` does not exist — all 6 new API hooks need it | Phase 9 | Create file (spec in doc 03 §6.4) |
| GAP-19 | Experience routes not in `app/src/constants/routes.ts` or `App.tsx` | Phase 9 | Add constants + router entries (spec in doc 03 §6.1, 6.2) |
| GAP-20 | `insight_hash` input is inconsistent across docs (MED-06 from audit) — three different definitions of what goes into the hash | Phase 6 | Canonicalize: `sha256(f"{survey_id}:{topic_fingerprint}:{layer}:{category}")`. Single definition in `constants.py`. |

---

## Phase 0 — Centralized Constants
**Depends on:** Nothing (pure new file)
**Est:** 1 day

- [x] **P0-01** ✅ Create `agents/lib/constants.py` with all blocks from doc 06 Phase 0:
  - Streaming consumer block (`METRIC_SNAPSHOT_RESPONSE_THRESHOLD=50`, `CHECKPOINT_FULL_RESPONSE_THRESHOLD=200`, `CHECKPOINT_FULL_MAX_DAYS=7`)
  - Response loading block (`INGEST_MAX_RESPONSES_BOOTSTRAP=300`, `INGEST_MAX_RESPONSES_CAP=250`)
  - Manual refresh block (`MANUAL_REFRESH_MIN_NEW_RESPONSES=10`, `MANUAL_REFRESH_MAX_DAILY=3`)
  - Topic clustering block (`TOPIC_ASSIGNMENT_THRESHOLD=0.72`, `WINDOW_MIN_RESPONSES`, confidence thresholds)
  - Trust score block (`TRUST_STATISTICAL_MODERATE_MIN=30`, `TRUST_STATISTICAL_HIGH_MIN=50`, low/medium/high max)
  - Report quality block (`REPORT_QUALITY_RENARRATE_THRESHOLD=60`, `CRYSTAL_EVAL_PASS_THRESHOLD=72`)
  - Crystal ReAct block (`CRYSTAL_MAX_TOOL_TURNS=10`, `CRYSTAL_CONTEXT_COMPRESSION_THRESHOLD=40_000`, `CRYSTAL_CONVERSATION_WINDOW=6`)
  - Progressive tier block (`PROGRESSIVE_TIER_FIRST_VOICES=10`, `PROGRESSIVE_TIER_EARLY_SIGNALS=40`, `PROGRESSIVE_TIER_GROWING_PICTURE=100`)
  - Object store block (`CHECKPOINT_BUCKET=""`, `CHECKPOINT_LOCAL_PATH="/tmp/checkpoints"`, `CHECKPOINT_BLOB_SCHEMA_VERSION=1`)
  - Zombie run block (`MAX_RUN_HEARTBEAT_STALE_MINUTES=5`, `MAX_RUN_DURATION_MINUTES=30`)
  - Crystal thread block (`CRYSTAL_THREAD_INACTIVITY_TTL_DAYS=7`, `CRYSTAL_THREAD_CONTEXT_WINDOW_TURNS=6`, `CRYSTAL_THREAD_STORAGE_TTL_DAYS=90`)
  - Response velocity block (`RESPONSE_VELOCITY_UNIT="per_day"`)

- [x] **P0-02** ✅ Update all existing files that hardcode these values to `from agents.lib.constants import ...`:
  - `agents/graphs/insights.py` — replace any inline thresholds
  - `agents/consumers/response_stream.py` — replace inline checkpoint thresholds
  - `agents/scheduler.py` — replace inline timing values
  - `agents/tools/topics.py` — replace `TOPIC_ASSIGNMENT_THRESHOLD` if hardcoded
  - `agents/tools/sentiment.py` — replace confidence thresholds if hardcoded

---

## Phase 1 — Database Migrations
**Depends on:** Nothing (schema first)
**Est:** 2 days

- [x] **P1-01** ✅ Migration `20240521000000_crystal_checkpoints.sql` — create `survey_insight_checkpoints` table:
  - Columns: `id UUID PK`, `survey_id UUID FK surveys`, `org_id UUID FK orgs`, `checkpoint_number INT`, `trigger TEXT CHECK(trigger IN('responses','days','manual'))`, `response_count_at_checkpoint INT`, `nps_at_checkpoint NUMERIC(5,1)`, `csat_at_checkpoint NUMERIC(5,1)`, `ces_at_checkpoint NUMERIC(5,1)`, `topic_fingerprint TEXT`, `delta_from_prior JSONB`, `report_url TEXT`, `schema_version INT DEFAULT 1`, `created_at TIMESTAMPTZ DEFAULT NOW()`
  - Index: `(survey_id, org_id, checkpoint_number DESC)`
  - Index: `(org_id, survey_id, created_at DESC)`

- [x] **P1-02** ✅ Migration `20240521000001_agent_runs_heartbeat.sql` — add heartbeat and retry columns to `agent_runs`:
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS max_run_duration_minutes INT DEFAULT 30`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_of UUID REFERENCES agent_runs(id)`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failure_reason TEXT`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS response_count_at_run INT`
  - Partial index: `CREATE INDEX ON agent_runs(last_heartbeat_at) WHERE status='running'`

- [x] **P1-03** ✅ Migration `20240521000002_crystal_threads_v2.sql` — reconcile `crystal_threads` with doc 05 spec:
  - Add `thread_key TEXT GENERATED ALWAYS AS (org_id||':'||COALESCE(user_id,'')||':'||COALESCE(survey_id,'')||':'||scope) STORED`
  - `ALTER TABLE crystal_threads ADD UNIQUE (org_id, user_id, survey_id, scope)`
  - `ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW()`
  - `ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS storage_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'`
  - `ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0`
  - Index: `(org_id, user_id, survey_id, scope)` for lookup

- [x] **P1-04** ✅ Migration `20240521000003_notification_infrastructure.sql`:
  - Create `notification_preferences` table: `id UUID PK`, `org_id UUID FK`, `user_id TEXT`, `survey_id UUID FK surveys NULLABLE`, `channel TEXT CHECK(channel IN('in_app','email','push'))`, `event_type TEXT`, `enabled BOOLEAN DEFAULT true`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
  - Create `notification_events` table: `id UUID PK`, `org_id UUID FK`, `user_id TEXT`, `survey_id UUID FK surveys NULLABLE`, `event_type TEXT`, `payload JSONB`, `status TEXT CHECK(status IN('pending','delivered','skipped')) DEFAULT 'pending'`, `channel TEXT CHECK(channel IN('in_app','email','push'))`, `created_at TIMESTAMPTZ`, `delivered_at TIMESTAMPTZ`
  - Index `notification_events(org_id, user_id, status, created_at)` for pending query

- [x] **P1-05** ✅ Migration `20240521000004_ai_operation_logs.sql` — create `ai_operation_logs` table:
  - Columns: `id UUID PK`, `org_id UUID FK`, `run_id UUID NULLABLE`, `operation TEXT`, `model TEXT`, `provider TEXT`, `input_tokens INT`, `output_tokens INT`, `cost_usd NUMERIC(10,6)`, `latency_ms INT`, `error TEXT`, `created_at TIMESTAMPTZ DEFAULT NOW()`
  - Index: `(org_id, created_at DESC)`, `(run_id)`
  - Partition suggestion: partition by month at scale (note in migration comment)

- [x] **P1-06** ✅ Migration `20240521000005_org_profile_industry.sql` — add industry field if missing: *(check GAP-12 first)*
  - `ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS industry TEXT`
  - `ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS employee_count_range TEXT`
  - CHECK constraint: `industry IN('technology','healthcare','retail','financial_services','education','government','professional_services','other')`

- [x] **P1-07** ✅ `insights` table audited against doc 05 §6.2 — all required columns present in `20240516000000_insights.sql`: `layer` with CHECK constraint, `category`, `insight_hash`, `trust_score INT` (0–100), `audit_json JSONB`, `metric_json JSONB`, `citations_json JSONB`, `user_state_json JSONB`; no corrective migration needed (minor name alias `citations_json` is equivalent)

---

## Phase 2 — Backend Route Cleanup
**Depends on:** Nothing
**Est:** 0.5 day

- [x] **P2-01** ✅ Move all files from `backend/src/routes/local/` → `backend/src/routes/` — already done (routes were in ./routes)
- [x] **P2-02** ✅ Update `backend/src/index.js` line — already set to `'./routes'`
- [x] **P2-03** ✅ No `local/` directory existed — already clean
- [x] **P2-04** ✅ `backend/CLAUDE.md` already reflects correct structure

---

## Phase 3 — Agent Pipeline Hardening
**Depends on:** Phase 0 (constants), Phase 1 (schema — heartbeat columns, checkpoint table)
**Blocks:** Phase 6 (checkpoint system builds on hardened pipeline)
**Est:** 4 days

### 3a. Signal Extraction
- [x] **P3-01** ✅ Implement `extract_signals_from_response(answers: list, questions: list) -> dict` in `agents/graphs/insights.py`
- [x] **P3-02** ✅ Implement `compute_survey_capability_flags(questions: list) -> dict`
- [x] **P3-03** ✅ Called in `node_ingest`; flags stored in `InsightState`
- [x] **P3-04** ✅ `has_open_text`, `has_nps`, `has_csat`, `has_ces`, `survey_questions` added to `InsightState` TypedDict

### 3b. No-Text Survey Path
- [x] **P3-05** ✅ `has_open_text` guard added to `node_absa`
- [x] **P3-06** ✅ Guard added to `node_embed`
- [x] **P3-07** ✅ Guard added to `node_cluster`
- [x] **P3-08** ✅ Guard added to `node_topics`
- [x] **P3-09** ✅ `node_narrate` routes to `_narrate_score_only()` when no open text
- [x] **P3-10** ✅ Implement `_narrate_score_only(state) -> list[dict]` in `agents/graphs/insights.py`:
  - Uses `claude-haiku-4-5` (cheap)
  - Generates up to 5 score-only insights: NPS distribution, CSAT distribution, CES distribution, completion rate, velocity trend
  - System prompt: *"This survey has no open-text questions. Generate insights about score patterns and distributions only. Do not mention themes, topics, or verbatims."*
  - Returns list of insight dicts in the same format as `node_narrate` output

### 3c. Run Heartbeat + Zombie Detection
- [x] **P3-11** ✅ `_update_heartbeat(run_id)` implemented in `agents/graphs/insights.py`
- [x] **P3-12** ✅ Heartbeat called as first line of all 10 pipeline nodes
- [x] **P3-13** ✅ `sweep_zombie_runs()` implemented in `agents/scheduler.py`
- [x] **P3-14** ✅ Wired into scheduler main loop with 300s interval

### 3d. Checkpoint Blob Versioning
- [x] **P3-15** Create `agents/lib/checkpoint_store.py` ✅ **DONE**:
  - `CURRENT_SCHEMA_VERSION = CHECKPOINT_BLOB_SCHEMA_VERSION` (import from constants)
  - `def migrate_blob(blob: dict) -> dict` — reads `blob['schema_version']`, calls appropriate migration chain
  - `def _migrate_v0_to_v1(blob: dict) -> dict` — adds missing keys with safe defaults for any blob lacking `schema_version`
  - `async def write_checkpoint_blob(blob: dict, org_id: str, survey_id: str, checkpoint_id: str) -> str` — writes to `CHECKPOINT_LOCAL_PATH` in dev, GCS in prod; returns URL
  - `async def read_checkpoint_blob(url: str) -> dict` — fetches blob and passes through `migrate_blob()`
- [x] **P3-16** ✅ `schema_version` added as first key of `report_blob` in `node_publish`
- [x] **P3-17** ✅ `write_checkpoint_blob()` called; URL stored in `survey_insight_checkpoints.report_url`
- [x] **P3-18** ✅ `oci>=2.119.0` added to `agents/requirements.txt`

### 3e. Survey Status Gate
- [x] **P3-19** ✅ Survey status check added in `agents/consumers/response_stream.py`
- [x] **P3-20** ✅ `check_survey_access()` implemented in `agents/lib/security.py`
- [x] **P3-21** ✅ Called as first DB operation in `node_ingest`

### 3f. Backend Security Hardening (from plan)
- [x] **P3-22** ✅ `backend/src/lib/httpError.js` created with `clientError()` and `serverError()` helpers
- [x] **P3-23** ✅ All `res.status(500)` replaced with `serverError(res, err, logger)` across backend routes
- [x] **P3-24** ✅ `AGENTS_INTERNAL_KEY` hardened in `agentsClient.js` and `insights.js`
- [x] **P3-25** ✅ Startup env validation added to `backend/src/index.js`
- [x] **P3-26** ✅ Atomic `max_responses` check already in `backend/src/routes/responses.js` — `BEGIN` + `SELECT … FOR UPDATE` on survey row serializes concurrent submissions; count check occurs inside the same transaction (lines 67–103)

---

## Phase 4 — Crystal Tool Registry
**Depends on:** Phase 0 (constants), Phase 1 (schema — tools query these tables), Phase 3 (check_survey_access needed in tools)
**Blocks:** Phase 5 (ReAct loop imports registry)
**Est:** 3 days

- [x] **P4-01** ✅ `agents/crystal/__init__.py` created
- [x] **P4-02** ✅ `agents/crystal/context.py` — `CrystalContext` frozen dataclass with all fields
- [x] **P4-03** ✅ `agents/crystal/registry.py` — 13 tools registered with JSON Schema; survey/org/both scopes
- [x] **P4-04** ✅ `agents/crystal/tools.py` — all 13 async executor functions implemented with org_id scoping
- [x] **P4-05** ✅ Specialist packs audited; `finserv_cx.yaml`, `education_cx.yaml`, `employee_ex.yaml` added
- [x] **P4-06** ✅ `get_specialist_for_survey(org_industry, survey_type)` added to `agents/specialists/registry.py`

---

## Phase 5 — Crystal ReAct Loop + SSE Streaming
**Depends on:** Phase 4 (tool registry), Phase 1 (crystal_threads table)
**Blocks:** Phase 7 (backend SSE endpoint calls this), Phase 10 (frontend ReAct streaming UI)
**Est:** 4 days

- [x] **P5-01** ✅ `get_or_create_thread()` implemented in `agents/agents/crystal.py` with TTL reset logic
- [x] **P5-02** ✅ `append_to_thread()` implemented
- [x] **P5-03** ✅ `_build_system_prompt_agentic()` implemented with no-text guard and org scope framing
- [x] **P5-04** ✅ `_run_react_loop()` implemented with CRYSTAL_MAX_TOOL_TURNS, Redis rate limit
- [x] **P5-05** ✅ `_run_react_loop_streaming()` async generator yielding SSE JSON strings (thinking/observation/synthesizing/answer)
- [x] **P5-06** ✅ `run()` routes to `_run_react_loop()`; legacy path behind `CRYSTAL_STREAMING_ENABLED` flag
- [x] **P5-07** ✅ `CRYSTAL_STREAMING_ENABLED=false` added to `agents/env.example`

---

## Phase 6 — Checkpoint System + Delta Analysis
**Depends on:** Phase 0 (constants), Phase 1 (checkpoint table), Phase 3 (hardened pipeline — blob store, heartbeat)
**Blocks:** Phase 7 (checkpoint API endpoints), Phase 9 (progressive UI needs checkpoint data)
**Est:** 3 days

- [x] **P6-01** ✅ `should_trigger_progressive_tier()` implemented in `agents/consumers/response_stream.py`
- [x] **P6-02** ✅ `mark_progressive_tier_complete()` with 30-day Redis TTL implemented
- [x] **P6-03** ✅ Tier trigger wired in stream consumer main loop
- [x] **P6-04** ✅ `compute_delta()` implemented in `agents/tools/delta.py`
- [x] **P6-05** ✅ Multi-checkpoint delta with `nps_acceleration` and `anomaly_credibility` implemented
- [x] **P6-06** ✅ `compute_topic_fingerprint()` implemented
- [x] **P6-07** ✅ `compute_insight_hash()` canonical implementation in `agents/tools/delta.py`
- [x] **P6-08** ✅ Delta stored in `survey_insight_checkpoints.delta_from_prior` in `node_publish`
- [x] **P6-09** ✅ Manual refresh rate limiting with Redis in `POST /api/insights/:surveyId/trigger`

---

## Phase 7 — Backend API: New Endpoints
**Depends on:** Phase 3 (hardened pipeline), Phase 5 (Crystal streaming), Phase 6 (checkpoint system)
**Blocks:** Phase 9 (frontend calls these)
**Est:** 3 days

- [x] **P7-01** ✅ `GET /api/insights/:surveyId/checkpoints` implemented in `backend/src/routes/insights.js`
- [x] **P7-02** ✅ `GET /api/insights/:surveyId/checkpoints/:checkpointId/report` implemented (dev: blob proxy, prod: OCI PAR URL)
- [x] **P7-03** ✅ `POST /api/insights/:surveyId/trigger` implemented with status + rate limit checks
- [x] **P7-04** ✅ `POST /api/experience/:scope/crystal/stream` SSE proxy in `backend/src/routes/experience.js`
- [x] **P7-05** ✅ `GET /api/experience/org/overview` with LATERAL join for latest metrics per survey
- [x] **P7-06** ✅ `GET /api/experience/:id/topics/signals` with `parent_topic_id` for hierarchy
- [x] **P7-07** ✅ `GET /api/experience/:id/topics/:topicId` with verbatim samples
- [x] **P7-08** ✅ `GET /api/experience/:id/trends` with checkpoint markers
- [x] **P7-09** ✅ `GET /api/notifications/pending` CTE fetch-and-mark-delivered; `PUT /api/notifications/preferences`
- [x] **P7-10** ✅ `crystal_opening`, `pipeline_active`, `survey_status` added to list endpoint
- [x] **P7-11** ✅ `run_org_aggregation()` hourly job added to `agents/scheduler.py`

---

## Phase 8 — Frontend: New Routes + Pages
**Depends on:** Phase 7 (API endpoints must exist), Phase 9 preparation (add route constants first)
**Est:** 5 days

- [x] **P8-01** ✅ Experience route constants added to `app/src/constants/routes.ts`
- [x] **P8-02** ✅ `app/src/hooks/useExperience.ts` created with all 6 hooks
- [x] **P8-03** ✅ `ExperienceHubPage.tsx` created
- [x] **P8-04** ✅ `SurveyIntelligencePage.tsx` created with tier-gated layout and `computeDataTier()`
- [x] **P8-05** ✅ `SurveyReportPage.tsx` created with checkpoint selector
- [x] **P8-06** ✅ `TopicAnalysisHubPage.tsx` created with parent/child grouping
- [x] **P8-07** ✅ `TopicDeepDivePage.tsx` created with sentiment-colored verbatims
- [x] **P8-08** ✅ `SurveyTrendsPage.tsx` created with NPS/CSAT chart + checkpoint markers
- [x] **P8-09** ✅ `OrgTrendsPage.tsx` created with portfolio metrics grid
- [x] **P8-10** ✅ All 7 routes added to `app/src/App.tsx`
- [x] **P8-11** ✅ "Experience" nav link added to `app/src/components/SideNav.tsx`

---

## Phase 9 — Frontend: Progressive Intelligence UI
**Depends on:** Phase 7 (`page_state_metadata` with tier data), Phase 8 (new page components exist)
**Est:** 3 days

- [x] **P9-01** ✅ `ProgressArc.tsx` created with Unicode arc icons (○◔◑◕●), aria-label
- [x] **P9-02** ✅ `computeDataTier()` function in `SurveyIntelligencePage.tsx`
- [x] **P9-03** ✅ `computePageState()` exported from `app/src/hooks/useInsights.ts` — returns `'collecting'|'generating'|'ready'|'stale'|'error'`; stale when `responseCount − insightCount ≥ 20`; collecting when `responseCount < 10` and no insights
- [x] **P9-04** ✅ `InsightStateBanner.tsx` created; no button shown when `surveyStatus !== 'active'`
- [x] **P9-05** ✅ `SurveyStatusBanner.tsx` created (paused: amber, closed: grey)
- [x] **P9-06** ✅ `ScoreOnlyBanner.tsx` created with localStorage dismiss persistence
- [x] **P9-07** ✅ Sub-tier layout variants (collecting/first_voices/early_signals/growing_picture/full_report)
- [x] **P9-08** ✅ `TrendBadge.tsx` created with direction arrows + persistence label
- [x] **P9-09** ✅ `AnomalyChip.tsx` created (new_anomaly vs ongoing_issue)
- [x] **P9-10** ✅ Checkpoint history selector in `SurveyReportPage.tsx`
- [x] **P9-11** ✅ Notification channel config UI added to `BrandSettingsPage.tsx` — new "Notifications" tab with `in_app / email / push` channel cards; all 5 event-type toggle stubs (Coming Soon badge); i18n keys added to `locales/en.ts`

---

## Phase 10 — Frontend: Crystal Panel Refactor
**Depends on:** Phase 5 (streaming ReAct backend), Phase 8 (new pages that host Crystal)
**Est:** 3 days

- [x] **P10-01** ✅ `CrystalPanel.tsx` updated to SSE endpoint `POST /api/experience/:scope/crystal/stream`; `VITE_CRYSTAL_STREAMING` feature flag
- [x] **P10-02** ✅ Streaming UI: thinking/observation/synthesizing/answer events rendered
- [x] **P10-03** ✅ Citation rendering with sentiment-colored left borders (positive=green, negative=red, neutral=grey)
- [x] **P10-04** ✅ Audit drawer (Sheet) on trust score click in `UnifiedInsightsView.tsx`
- [x] **P10-05** ✅ Thread continuity verified — TTL reset handled silently in backend

---

## Phase 11 — Frontend: Existing Fixes + Polish
**Depends on:** Phase 7 (API endpoints for feedback, topic hierarchy)
**Can run parallel to Phase 9-10**
**Est:** 2 days

- [x] **P11-01** ✅ Helpful/Pin buttons wired in `UnifiedInsightsView.tsx` (callbacks already existed)
- [x] **P11-02** ✅ `GeneratingOverlay.tsx` extracted as shared component
- [x] **P11-03** ✅ `LAYER_CONFIG` confirmed as single source of truth in `shared.tsx` — no `LAYER_META` duplicate; `label`/`tooltip` removed from the config struct (visual-only now: `color/bg/ringColor/textColor`)
- [x] **P11-04** ✅ Layer labels/tooltips moved to `locales/en.ts` under `surveyInsights.layers.*`; `LayerBadge`, `UnifiedInsightsView` filter pills, and insight cards all updated to use `t('surveyInsights.layers.${layer}.label')`
- [x] **P11-05** ✅ `InsightStateBanner` `onRetry` prop reference removed (LOW-03)
- [x] **P11-06** ✅ No dead `import httpx, _os` found in streaming code — already clean
- [x] **P11-07** ✅ Hero narrative card for descriptive/metric.nps insight in `UnifiedInsightsView.tsx`
- [x] **P11-08** ✅ `getTopicHierarchy` wiring in `AdvancedInsightsPage.tsx` — replaced `listTopics` with hierarchy API; topics derived via `useMemo` (sorted by volume/urgency); topic landscape renders theme-grouped sections with divider headers when multiple themes exist
- [x] **P11-09** ✅ Sample data watermark banner when `scope === 'all'`
- [x] **P11-10** ✅ 70+ i18n keys added to `app/src/locales/en.ts`

---

## Phase 12 — Observability + Audit Logging
**Depends on:** Phase 1 (`ai_operation_logs` table), Phase 3 (pipeline running)
**Can run in parallel with Phases 8-11**
**Est:** 2 days

- [x] **P12-01** ✅ `_log_ai_operation()` fire-and-forget after LLM calls in `openrouter.py` and `anthropic_client.py`
- [x] **P12-02** ✅ `crystal_tool_calls_total`, `crystal_tool_duration_seconds`, `crystal_react_turns_total` added to `agents/lib/metrics.py`
- [x] **P12-03** ✅ `agent_run_duration_seconds` histogram; recorded in `node_publish`
- [x] **P12-04** ✅ `docker/prometheus/rules/zombie_runs.yml` alert rule created
- [x] **P12-05** ✅ `traceback=traceback.format_exc()` added to all `logger.error()` calls in tool files

---

## Phase 13 — Testing
**Depends on:** All implementation phases complete for the area being tested
**Est:** 3 days
**Status:** 🔄 In progress

- [x] **P13-01** ✅ `agents/tests/test_crystal.py` — 42 tests total: ReAct loop, SSE events, thread TTL, rate limit, system prompt agentic
- [x] **P13-02** ✅ `agents/tests/test_insight_tools.py` — 71 tests total: all Crystal tools with org_id scoping, driver scale, benchmark comparison
- [x] **P13-03** ✅ `agents/tests/test_stream_consumer.py` — 20 tests: progressive tiers at 10/40/70/100, Redis dedup, survey status gate
- [x] **P13-04** ✅ `agents/tests/test_checkpoint_store.py` — 10 tests: v0→v1 migration, idempotency, all renames, safe defaults
- [x] **P13-05** ✅ `agents/tests/test_pipeline.py` — 22 tests: signal extraction, capability flags, no-text guards, heartbeat
- [x] **P13-06** ✅ Frontend unit tests: `ProgressArc` (8 tests, all 5 tiers), `InsightStateBanner` (8 tests, active-only button guard), `SurveyStatusBanner` (7 tests, paused vs closed variants)
- [x] **P13-07** ✅ `agents/tests/test_integration.py` — 6 tests: pipeline returns dict, required keys present, access-denied error recorded, force_regenerate true for manual trigger, false for schedule, IDs propagate to final state

**427 Python tests pass (2 new stream consumer tests for 4-tier system). 134 frontend tests pass (23 new).**

---

## Phase 14 — Production Readiness
**Depends on:** All phases complete
**Est:** 2 days

- [ ] **P14-01** ⬜ *Requires staging* — Run all migrations against staging Postgres in order; verify no conflicts
- [ ] **P14-02** ⬜ *Requires staging* — Provision GCS bucket; set `CHECKPOINT_BUCKET` and `GCS_SERVICE_ACCOUNT_KEY` in agents Fly.io secrets *(GAP-10)*
- [x] **P14-03** ✅ Env var startup validation added to `agents/main.py` — fails fast if `DATABASE_URL/REDIS_URL/OPENROUTER_API_KEY/AGENTS_INTERNAL_KEY` missing in production (`AGENTS_ENV=production`); backend already has equivalent check in `index.js`
- [x] **P14-04** ✅ `AGENTS_INTERNAL_KEY` default-value guard in both `backend/src/index.js` (existing) and `agents/main.py` (added) — throws `RuntimeError` if key equals `dev-internal-key-change-in-prod` in production
- [ ] **P14-05** ⬜ *Requires staging* — Load test Crystal SSE endpoint: confirm 10 req/min per org rate limit fires correctly under concurrent load
- [ ] **P14-06** ⬜ *Requires staging* — Run zombie sweep once manually on staging; verify it marks stuck runs correctly without false positives
- [ ] **P14-07** ⬜ *Requires staging* — Verify Crystal thread 7-day TTL: create a thread, manually set `last_active_at = NOW() - 8 days`, confirm next Crystal open starts fresh thread
- [ ] **P14-08** ⬜ *Requires staging* — Verify no raw Postgres errors or stack traces leak in any HTTP 500 response (fuzz a few endpoints with invalid UUIDs)
- [x] **P14-09** ✅ `docs/README_SETUP.md` fully rewritten — Fly.io deploy, GCS checkpoint setup, all env var tables (app/backend/agents), production security checklist, test commands
- [x] **P14-10** ✅ `backend/CLAUDE.md` updated (Crystal routes, new tables, AGENTS_INTERNAL_KEY docs); `agents/CLAUDE.md` created (Crystal architecture, pipeline node guide, tool guide, env vars)

---

## File Manifest — All Files to Create or Modify

### New Files
| File | Phase | Notes |
|------|-------|-------|
| `agents/lib/constants.py` | P0 | Central config — all hardcoded values move here |
| `agents/lib/checkpoint_store.py` | P3 | ✅ Created — local filesystem + OCI Object Storage, migration, PAR signing |
| `agents/crystal/__init__.py` | P4 | Package marker |
| `agents/crystal/context.py` | P4 | CrystalContext frozen dataclass |
| `agents/crystal/registry.py` | P4 | 13 tool definitions with JSON Schema |
| `agents/crystal/tools.py` | P4 | 13 async tool executor functions |
| `agents/tools/delta.py` | P6 | compute_delta, compute_topic_fingerprint, compute_insight_hash |
| `backend/src/lib/httpError.js` | P3 | clientError / serverError helpers |
| `app/src/hooks/useExperience.ts` | P8 | 6 API hooks for experience routes |
| `app/src/pages/experience/ExperienceHubPage.tsx` | P8 | Org portfolio view |
| `app/src/pages/experience/SurveyIntelligencePage.tsx` | P8 | Primary survey insights view |
| `app/src/pages/experience/SurveyReportPage.tsx` | P8 | Checkpoint report viewer |
| `app/src/pages/experience/TopicAnalysisHubPage.tsx` | P8 | Topic grid |
| `app/src/pages/experience/TopicDeepDivePage.tsx` | P8 | Single topic detail |
| `app/src/pages/experience/SurveyTrendsPage.tsx` | P8 | NPS/CSAT trend chart |
| `app/src/pages/experience/OrgTrendsPage.tsx` | P8 | Org-level trends |
| `app/src/components/insights/ProgressArc.tsx` | P9 | 5-state arc indicator |
| `app/src/components/insights/InsightStateBanner.tsx` | P9 | Full 5-prop banner |
| `app/src/components/insights/SurveyStatusBanner.tsx` | P9 | Paused/closed banner |
| `app/src/components/insights/ScoreOnlyBanner.tsx` | P9 | Rating-only notice |
| `app/src/components/insights/TrendBadge.tsx` | P9 | Trend direction badge |
| `app/src/components/insights/AnomalyChip.tsx` | P9 | New vs. ongoing anomaly |
| `app/src/pages/insights/GeneratingOverlay.tsx` | P11 | Extracted shared overlay |
| `supabase/migrations/20240521000000_crystal_checkpoints.sql` | P1 | |
| `supabase/migrations/20240521000001_agent_runs_heartbeat.sql` | P1 | |
| `supabase/migrations/20240521000002_crystal_threads_v2.sql` | P1 | |
| `supabase/migrations/20240521000003_notification_infrastructure.sql` | P1 | |
| `supabase/migrations/20240521000004_ai_operation_logs.sql` | P1 | |
| `supabase/migrations/20240521000005_org_profile_industry.sql` | P1 | Check GAP-12 first |

### Modified Files
| File | Phases | What changes |
|------|--------|-------------|
| `agents/graphs/insights.py` | P3, P6 | Signal extraction, heartbeat, no-text guards, blob write, delta, insight_hash |
| `agents/agents/crystal.py` | P5 | Full ReAct loop, SSE streaming, thread lifecycle |
| `agents/consumers/response_stream.py` | P3, P6 | Status gate, tier trigger, Redis dedup |
| `agents/scheduler.py` | P3, P7 | Zombie sweep, org aggregation job |
| `agents/schemas/state.py` | P3 | Add capability flag fields to InsightState |
| `agents/specialists/registry.py` | P4 | Align with 7-specialist matrix |
| `agents/specialists/base.py` | P4 | Update specialist prompt templates |
| `agents/lib/metrics.py` | P12 | Crystal tool counters, run duration histogram |
| `agents/lib/security.py` | P3 | check_survey_access() |
| `agents/requirements.txt` | P3 | Add google-cloud-storage |
| `backend/src/index.js` | P2, P3 | Route dir, startup validation |
| `backend/src/routes/insights.js` | P3, P7 | Hardened key, httpError, new endpoints |
| `backend/src/routes/responses.js` | P3 | Atomic max_responses transaction |
| `backend/src/routes/surveys.js` | P3 | Atomic publish transaction |
| `backend/src/lib/agentsClient.js` | P3, P7 | Hardened key, SSE proxy |
| `app/src/constants/routes.ts` | P8 | EXPERIENCE_* constants |
| `app/src/App.tsx` | P8 | 7 new routes |
| `app/src/components/SideNav.tsx` | P8 | Experience link |
| `app/src/components/CrystalPanel.tsx` | P10 | SSE streaming, tool progress, thread scope |
| `app/src/pages/insights/UnifiedInsightsView.tsx` | P11, P10 | Pin/thumb wiring, audit drawer, brief narrative, GeneratingOverlay extraction |
| `app/src/pages/AdvancedInsightsPage.tsx` | P11 | Topic hierarchy, GeneratingOverlay extraction |
| `app/src/pages/insights/shared.tsx` | P11 | LAYER_CONFIG consolidation, i18n |
| `app/src/hooks/useInsights.ts` | P9 | computePageState, computeDataTier |
| `app/src/locales/en.ts` | P11 | 70+ new i18n keys |

---

## Estimated Total

| Phase | Est. Days |
|-------|-----------|
| Phase 0: Constants | 1 |
| Phase 1: Migrations | 2 |
| Phase 2: Route cleanup | 0.5 |
| Phase 3: Pipeline hardening | 4 |
| Phase 4: Crystal tool registry | 3 |
| Phase 5: Crystal ReAct + SSE | 4 |
| Phase 6: Checkpoint system | 3 |
| Phase 7: Backend API | 3 |
| Phase 8: Frontend new routes | 5 |
| Phase 9: Progressive UI | 3 |
| Phase 10: Crystal panel refactor | 3 |
| Phase 11: Frontend fixes + polish | 2 |
| Phase 12: Observability | 2 |
| Phase 13: Testing | 3 |
| Phase 14: Production readiness | 2 |
| **Total** | **~40 days** |

Phases 9, 10, 11, 12 can overlap once Phase 7 API is complete.
Gap resolution (GAP-01 through GAP-20) should happen in the first week before coding begins.
