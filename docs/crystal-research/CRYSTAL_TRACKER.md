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

- [ ] **P0-01** Create `agents/lib/constants.py` with all blocks from doc 06 Phase 0:
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

- [ ] **P0-02** Update all existing files that hardcode these values to `from agents.lib.constants import ...`:
  - `agents/graphs/insights.py` — replace any inline thresholds
  - `agents/consumers/response_stream.py` — replace inline checkpoint thresholds
  - `agents/scheduler.py` — replace inline timing values
  - `agents/tools/topics.py` — replace `TOPIC_ASSIGNMENT_THRESHOLD` if hardcoded
  - `agents/tools/sentiment.py` — replace confidence thresholds if hardcoded

---

## Phase 1 — Database Migrations
**Depends on:** Nothing (schema first)
**Est:** 2 days

- [ ] **P1-01** Migration `20240521000000_crystal_checkpoints.sql` — create `survey_insight_checkpoints` table:
  - Columns: `id UUID PK`, `survey_id UUID FK surveys`, `org_id UUID FK orgs`, `checkpoint_number INT`, `trigger TEXT CHECK(trigger IN('responses','days','manual'))`, `response_count_at_checkpoint INT`, `nps_at_checkpoint NUMERIC(5,1)`, `csat_at_checkpoint NUMERIC(5,1)`, `ces_at_checkpoint NUMERIC(5,1)`, `topic_fingerprint TEXT`, `delta_from_prior JSONB`, `report_url TEXT`, `schema_version INT DEFAULT 1`, `created_at TIMESTAMPTZ DEFAULT NOW()`
  - Index: `(survey_id, org_id, checkpoint_number DESC)`
  - Index: `(org_id, survey_id, created_at DESC)`

- [ ] **P1-02** Migration `20240521000001_agent_runs_heartbeat.sql` — add heartbeat and retry columns to `agent_runs`:
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS max_run_duration_minutes INT DEFAULT 30`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_of UUID REFERENCES agent_runs(id)`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failure_reason TEXT`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ`
  - `ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS response_count_at_run INT`
  - Partial index: `CREATE INDEX ON agent_runs(last_heartbeat_at) WHERE status='running'`

- [ ] **P1-03** Migration `20240521000002_crystal_threads_v2.sql` — reconcile `crystal_threads` with doc 05 spec:
  - Add `thread_key TEXT GENERATED ALWAYS AS (org_id||':'||COALESCE(user_id,'')||':'||COALESCE(survey_id,'')||':'||scope) STORED`
  - `ALTER TABLE crystal_threads ADD UNIQUE (org_id, user_id, survey_id, scope)`
  - `ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW()`
  - `ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS storage_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days'`
  - `ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0`
  - Index: `(org_id, user_id, survey_id, scope)` for lookup

- [ ] **P1-04** Migration `20240521000003_notification_infrastructure.sql`:
  - Create `notification_preferences` table: `id UUID PK`, `org_id UUID FK`, `user_id TEXT`, `survey_id UUID FK surveys NULLABLE`, `channel TEXT CHECK(channel IN('in_app','email','push'))`, `event_type TEXT`, `enabled BOOLEAN DEFAULT true`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`
  - Create `notification_events` table: `id UUID PK`, `org_id UUID FK`, `user_id TEXT`, `survey_id UUID FK surveys NULLABLE`, `event_type TEXT`, `payload JSONB`, `status TEXT CHECK(status IN('pending','delivered','skipped')) DEFAULT 'pending'`, `channel TEXT CHECK(channel IN('in_app','email','push'))`, `created_at TIMESTAMPTZ`, `delivered_at TIMESTAMPTZ`
  - Index `notification_events(org_id, user_id, status, created_at)` for pending query

- [ ] **P1-05** Migration `20240521000004_ai_operation_logs.sql` — create `ai_operation_logs` table:
  - Columns: `id UUID PK`, `org_id UUID FK`, `run_id UUID NULLABLE`, `operation TEXT`, `model TEXT`, `provider TEXT`, `input_tokens INT`, `output_tokens INT`, `cost_usd NUMERIC(10,6)`, `latency_ms INT`, `error TEXT`, `created_at TIMESTAMPTZ DEFAULT NOW()`
  - Index: `(org_id, created_at DESC)`, `(run_id)`
  - Partition suggestion: partition by month at scale (note in migration comment)

- [ ] **P1-06** Migration `20240521000005_org_profile_industry.sql` — add industry field if missing: *(check GAP-12 first)*
  - `ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS industry TEXT`
  - `ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS employee_count_range TEXT`
  - CHECK constraint: `industry IN('technology','healthcare','retail','financial_services','education','government','professional_services','other')`

- [ ] **P1-07** Audit `insights` table schema against doc 05 §6.2. Specifically confirm presence of:
  - `layer TEXT CHECK(layer IN('descriptive','diagnostic','predictive','prescriptive'))`
  - `category TEXT`, `insight_hash TEXT`, `trust_score NUMERIC(3,0)`, `audit_json JSONB`, `metric_json JSONB`, `citations JSONB`, `user_state_json JSONB`
  - Write a corrective migration if any column is missing

---

## Phase 2 — Backend Route Cleanup
**Depends on:** Nothing
**Est:** 0.5 day

- [ ] **P2-01** Move all files from `backend/src/routes/local/` → `backend/src/routes/`:
  - `copilot.js`, `insights.js`, `orgProfile.js`, `orgs.js`, `public.js`, `responses.js`, `surveys.js` + any others
- [ ] **P2-02** Update `backend/src/index.js` line that sets `const dir = './routes/local'` → `'./routes'`
- [ ] **P2-03** Delete `backend/src/routes/local/` directory and the stale Firestore-era files in old `backend/src/routes/` (ai.js, templates.js, workflows.js etc.) if they exist
- [ ] **P2-04** Update `backend/CLAUDE.md` directory guide to reflect new structure

---

## Phase 3 — Agent Pipeline Hardening
**Depends on:** Phase 0 (constants), Phase 1 (schema — heartbeat columns, checkpoint table)
**Blocks:** Phase 6 (checkpoint system builds on hardened pipeline)
**Est:** 4 days

### 3a. Signal Extraction
- [ ] **P3-01** Implement `extract_signals_from_response(answers: list, questions: list) -> dict` in `agents/graphs/insights.py` (or extract to `agents/tools/metrics.py`):
  - Maps question type → signal: `nps`→`nps_score`, `csat`→`csat_score`, `ces`→`ces_score`, `rating`→`rating_value`, `text`/`textarea`→`open_text`, `boolean`→`boolean_value`, `multiple_choice`→`selected_option`, `ranking`→`rank_order`
  - Returns dict with extracted values keyed by signal type
- [ ] **P3-02** Implement `compute_survey_capability_flags(questions: list) -> dict` in same location:
  - Returns `{has_nps, has_csat, has_ces, has_open_text, has_ratings}` booleans
  - `has_open_text = True` if any question is type `text` or `textarea`
- [ ] **P3-03** Call both functions in `node_ingest`; store flags in `InsightState` (`has_open_text`, `has_nps`, `has_csat`, `has_ces`)
- [ ] **P3-04** Add `has_open_text`, `has_nps`, `has_csat`, `has_ces`, `survey_questions` fields to `InsightState` TypedDict in `agents/schemas/state.py`

### 3b. No-Text Survey Path
- [ ] **P3-05** Add `if not state['has_open_text']: return state` guard at top of `node_absa`
- [ ] **P3-06** Add same guard at top of `node_embed`
- [ ] **P3-07** Add same guard at top of `node_cluster`
- [ ] **P3-08** Add same guard at top of `node_topics`
- [ ] **P3-09** Update `node_narrate` to call `_narrate_score_only(state)` when `not state['has_open_text']`
- [ ] **P3-10** Implement `_narrate_score_only(state) -> list[dict]` in `agents/graphs/insights.py`:
  - Uses `claude-haiku-4-5` (cheap)
  - Generates up to 5 score-only insights: NPS distribution, CSAT distribution, CES distribution, completion rate, velocity trend
  - System prompt: *"This survey has no open-text questions. Generate insights about score patterns and distributions only. Do not mention themes, topics, or verbatims."*
  - Returns list of insight dicts in the same format as `node_narrate` output

### 3c. Run Heartbeat + Zombie Detection
- [ ] **P3-11** Implement `async def _update_heartbeat(run_id: str, db_pool) -> None` in `agents/graphs/insights.py`:
  - `UPDATE agent_runs SET last_heartbeat_at=NOW() WHERE id=$1`
  - Log at DEBUG level, never raise
- [ ] **P3-12** Call `await _update_heartbeat(run_id, db_pool)` as the **first line** of every node: `node_ingest`, `node_absa`, `node_embed`, `node_cluster`, `node_topics`, `node_narrate`, `node_verify`, `node_publish`
- [ ] **P3-13** Implement `async def sweep_zombie_runs(db_pool) -> None` in `agents/scheduler.py`:
  - Query: `SELECT id FROM agent_runs WHERE status='running' AND (last_heartbeat_at < NOW() - INTERVAL '5 minutes' OR created_at < NOW() - INTERVAL '30 minutes')`
  - For each zombie: `UPDATE agent_runs SET status='failed', failure_reason='zombie_timeout', failed_at=NOW() WHERE id=$1`
  - Log each zombie killed with `run_id`, `survey_id`, `age_minutes`
  - Enqueue retry for `retry_count < 2`: set new run with `retry_of=zombie_id, retry_count=zombie.retry_count+1`
- [ ] **P3-14** Wire `sweep_zombie_runs` into scheduler main loop: `asyncio.create_task(run_every(sweep_zombie_runs, interval_seconds=300))`

### 3d. Checkpoint Blob Versioning
- [x] **P3-15** Create `agents/lib/checkpoint_store.py` ✅ **DONE**:
  - `CURRENT_SCHEMA_VERSION = CHECKPOINT_BLOB_SCHEMA_VERSION` (import from constants)
  - `def migrate_blob(blob: dict) -> dict` — reads `blob['schema_version']`, calls appropriate migration chain
  - `def _migrate_v0_to_v1(blob: dict) -> dict` — adds missing keys with safe defaults for any blob lacking `schema_version`
  - `async def write_checkpoint_blob(blob: dict, org_id: str, survey_id: str, checkpoint_id: str) -> str` — writes to `CHECKPOINT_LOCAL_PATH` in dev, GCS in prod; returns URL
  - `async def read_checkpoint_blob(url: str) -> dict` — fetches blob and passes through `migrate_blob()`
- [ ] **P3-16** In `node_publish`, add `"schema_version": CHECKPOINT_BLOB_SCHEMA_VERSION` as **first key** of `report_blob` dict
- [ ] **P3-17** In `node_publish`, call `write_checkpoint_blob()` and store returned URL in `survey_insight_checkpoints.report_url`
- [ ] **P3-18** Add `oci>=2.119.0` to `agents/requirements.txt` as optional *(GAP-10/11 resolved — `checkpoint_store.py` catches ImportError and falls back silently)*

### 3e. Survey Status Gate
- [ ] **P3-19** In `agents/consumers/response_stream.py`, add survey status check before any tier evaluation:
  ```python
  if survey['status'] not in ('active',):
      logger.info("pipeline_skipped_survey_not_active", survey_id=survey_id, status=survey['status'])
      continue
  ```
- [ ] **P3-20** Implement `check_survey_access(survey_id: str, org_id: str, db_pool) -> dict` in `agents/lib/security.py`:
  - Returns survey row if `survey_id` belongs to `org_id`; raises `PermissionError` otherwise
  - Dev exception: skip if `AGENTS_ENV=dev` and `org_id='dev_org'`
- [ ] **P3-21** Call `check_survey_access()` as the first DB operation in `node_ingest`

### 3f. Backend Security Hardening (from plan)
- [ ] **P3-22** Create `backend/src/lib/httpError.js` with `clientError()` and `serverError()` helpers (never expose `err.message` in 500s)
- [ ] **P3-23** Replace all `res.status(500).json({ error: err.message })` across all backend route files with `serverError(res, err, logger)`
- [ ] **P3-24** Harden `AGENTS_INTERNAL_KEY` fallback in `agentsClient.js` and `insights.js` — throw in production if using default
- [ ] **P3-25** Add startup env validation to `backend/src/index.js` — fail fast in production if `DATABASE_URL`, `CLERK_SECRET_KEY`, `AGENTS_INTERNAL_KEY`, `ALLOWED_ORIGIN` are missing
- [ ] **P3-26** Atomic `max_responses` check in `backend/src/routes/responses.js` — wrap SELECT count + INSERT in `BEGIN/SELECT FOR UPDATE/COMMIT` transaction

---

## Phase 4 — Crystal Tool Registry
**Depends on:** Phase 0 (constants), Phase 1 (schema — tools query these tables), Phase 3 (check_survey_access needed in tools)
**Blocks:** Phase 5 (ReAct loop imports registry)
**Est:** 3 days

- [ ] **P4-01** Create `agents/crystal/__init__.py` (package marker, export `CrystalContext`, `TOOL_REGISTRY`)
- [ ] **P4-02** Create `agents/crystal/context.py` — `CrystalContext` frozen dataclass:
  - Fields: `org_id: str`, `user_id: str`, `survey_id: str | None`, `scope: Literal["survey","org"]`, `run_id: str | None = None`, `has_open_text: bool = True`
- [ ] **P4-03** Create `agents/crystal/registry.py` — register all 13 tools with JSON Schema input specs:
  - Survey-scoped: `get_survey_overview`, `get_topic_details`, `get_metric_history`, `get_insights_list`, `get_verbatims`, `get_benchmark_comparison`, `get_driver_analysis`, `get_segment_breakdown`, `get_checkpoint_history`
  - Org-scoped: `compare_surveys`, `get_org_portfolio`, `get_cross_survey_themes`, `get_anomaly_events`
  - Each tool: `name`, `description`, `input_schema` (JSON Schema), `scope: 'survey'|'org'|'both'`
- [ ] **P4-04** Create `agents/crystal/tools.py` — implement all 13 executor async functions:
  - **`execute_get_survey_overview`**: query `surveys`, `survey_metric_snapshots`, `survey_topics` latest; return overview dict
  - **`execute_get_topic_details`**: query `survey_topics` by name + `responses` for verbatims; return topic detail dict
  - **`execute_get_metric_history`**: query `survey_metric_snapshots` ordered by captured_at; return time series
  - **`execute_get_insights_list`**: query `insights` by survey + layer + time_window; return insight list
  - **`execute_get_verbatims`**: query `responses` by survey + JSONB topic filter + sentiment; return verbatim list
  - **`execute_compare_surveys`**: query both surveys and delta; return comparison dict
  - **`execute_get_org_portfolio`**: query `org_metric_snapshots` + active surveys; return portfolio summary
  - **`execute_get_cross_survey_themes`**: query `survey_topics` aggregated across surveys; return theme frequency list
  - **`execute_get_anomaly_events`**: query `survey_metric_snapshots` where anomaly_flag=true; return anomaly list
  - **`execute_get_benchmark_comparison`**: look up static benchmark table by industry+metric; return comparison
  - **`execute_get_driver_analysis`**: query `survey_topics` for driver_score + nps_impact; compute delta (on -100 to +100 scale, **not 0-10** — see audit issue MED-11); return driver dict
  - **`execute_get_segment_breakdown`**: query `responses` grouped by specific question answer; return segment array
  - **`execute_get_checkpoint_history`**: query `survey_insight_checkpoints` + read `delta_from_prior` from blob; return checkpoint list with delta
  - Every executor: enforce `org_id` scoping on ALL SQL joins. Parameterized queries only. Return `{"error": "..."}` on tool-level failures (never raise).
- [ ] **P4-05** Audit `agents/specialists/registry.py` and `base.py` against doc 04 §11.4 specialist matrix — add or update any of the 7 specialists (`saas_cx`, `healthcare_cx`, `retail_cx`, `finserv_cx`, `education_cx`, `employee_ex`, `research_generic`) *(see GAP-13)*
- [ ] **P4-06** Add industry → specialist matching logic in `agents/specialists/registry.py`: `get_specialist_for_survey(org_industry, survey_type) -> str`

---

## Phase 5 — Crystal ReAct Loop + SSE Streaming
**Depends on:** Phase 4 (tool registry), Phase 1 (crystal_threads table)
**Blocks:** Phase 7 (backend SSE endpoint calls this), Phase 10 (frontend ReAct streaming UI)
**Est:** 4 days

- [ ] **P5-01** Implement `get_or_create_thread(ctx: CrystalContext, db_pool) -> dict` in `agents/agents/crystal.py`:
  - UPSERT into `crystal_threads` on `(org_id, user_id, survey_id, scope)` unique key
  - If existing thread's `last_active_at` < `NOW() - INTERVAL '7 days'`: start fresh thread (new `id`, reset `messages`)
  - If fresh: return new empty thread row
  - If continued: return existing row with messages JSONB
  - `UPDATE crystal_threads SET last_active_at=NOW(), message_count=message_count+1`
- [ ] **P5-02** Implement `append_to_thread(thread_id: str, role: str, content: str, db_pool) -> None`:
  - `UPDATE crystal_threads SET messages = messages || $1::jsonb, last_active_at=NOW() WHERE id=$2`
  - `$1` = JSON array element `{"role": role, "content": content, "ts": NOW()}`
- [ ] **P5-03** Implement `_build_system_prompt_agentic(ctx: CrystalContext, specialist_context: str) -> str`:
  - Base ReAct prompt with tool call instructions
  - Inject specialist context block (from doc 04 §11.2)
  - If `ctx.has_open_text == False`: append no-text constraint: *"This survey has no open-text questions. Never discuss themes, topics, or verbatims."*
  - If scope is `'org'`: adjust scope framing to portfolio-level
- [ ] **P5-04** Implement `_run_react_loop(inp: CrystalInput, db_pool) -> CrystalOutput`:
  - Max `CRYSTAL_MAX_TOOL_TURNS` iterations
  - Tool dispatch: call matching executor from `agents/crystal/tools.py`
  - On finish: compile citations from all tool results, generate final answer
  - Write final exchange to thread via `append_to_thread()`
  - Enforce 10 req/min rate limit (Redis `INCR crystal:{org_id}:rpm` with 60s TTL)
- [ ] **P5-05** Implement `_run_react_loop_streaming(inp: CrystalInput, db_pool) -> AsyncGenerator[str, None]`:
  - Yield SSE events as JSON strings:
    - `{"type":"thinking","tool":"tool_name","message":"Checking NPS history..."}` before each tool call
    - `{"type":"observation","tool":"tool_name","summary":"Found 12 metric snapshots."}` after each tool result
    - `{"type":"synthesizing","message":"Putting it all together..."}` before final answer
    - `{"type":"answer","answer":"...","citations":[...],"suggestions":[...]}` as last event
  - Write exchange to thread after streaming completes
- [ ] **P5-06** Replace single-call pattern in `agents/agents/crystal.py` `run()` method with `_run_react_loop()`; keep old path behind `CRYSTAL_STREAMING_ENABLED=false` feature flag for safe rollout
- [ ] **P5-07** Add `CRYSTAL_STREAMING_ENABLED` to `agents/env.example` and `backend/env.example`

---

## Phase 6 — Checkpoint System + Delta Analysis
**Depends on:** Phase 0 (constants), Phase 1 (checkpoint table), Phase 3 (hardened pipeline — blob store, heartbeat)
**Blocks:** Phase 7 (checkpoint API endpoints), Phase 9 (progressive UI needs checkpoint data)
**Est:** 3 days

- [ ] **P6-01** Implement `should_trigger_progressive_tier(response_count: int, survey_id: str, redis_client) -> str | None` in `agents/consumers/response_stream.py`:
  - Returns `'first_voices'`, `'early_signals'`, `'growing_picture'`, or `None`
  - Checks Redis key `progressive:{survey_id}:{tier}:triggered` before returning
  - Thresholds from `constants.py`: 10, 40, 100
- [ ] **P6-02** Implement `mark_progressive_tier_complete(survey_id: str, tier: str, redis_client) -> None`:
  - `SET progressive:{survey_id}:{tier}:triggered 1 EX 2592000` (30-day TTL)
- [ ] **P6-03** Wire tier trigger in stream consumer: after response count check, call `should_trigger_progressive_tier()` and dispatch pipeline run for matching tier
- [ ] **P6-04** Implement `compute_delta(checkpoint_n: dict, checkpoint_n1: dict) -> dict` in `agents/graphs/insights.py` or new file `agents/tools/delta.py`:
  - Returns: `nps_delta`, `csat_delta`, `ces_delta`, `response_count_delta`, `topic_changes` (emerged/resolved/persisted), `sentiment_delta`, `trend_direction`, `trend_persistence`
  - `trend_persistence`: `'first_occurrence'` (N=1), `'second_occurrence'` (N=2 with N-1 but no N-2), `'confirmed'` (same direction twice in a row), `'reversal'` (direction changed)
- [ ] **P6-05** Implement multi-checkpoint delta (N vs N-1 vs N-2) in `compute_delta()`:
  - Accept optional `checkpoint_n2: dict | None`
  - Compute `delta_latest` (N vs N-1) and `delta_prior` (N-1 vs N-2)
  - Derive `nps_acceleration = delta_latest.nps_delta - delta_prior.nps_delta`
  - Derive `anomaly_credibility`: `'new_anomaly'` if N-2 was normal, `'ongoing_issue'` if N-2 also flagged
- [ ] **P6-06** Implement `compute_topic_fingerprint(topics: list) -> str` — canonical hash:
  - `sha256(sorted_topic_names_joined)` — use `sorted(t['name'] for t in topics)` joined with `|`
  - Import `CHECKPOINT_BLOB_SCHEMA_VERSION` from constants for version tagging
- [ ] **P6-07** Implement canonical `compute_insight_hash(survey_id, topic_fingerprint, layer, category) -> str`:
  - `sha256(f"{survey_id}:{topic_fingerprint}:{layer}:{category}")` — single definition in `agents/tools/delta.py`
  - Fix MED-20: ensure all callers use this function, not their own hash logic
- [ ] **P6-08** In `node_publish`, store delta in `survey_insight_checkpoints.delta_from_prior` JSONB column
- [ ] **P6-09** Implement manual refresh rate limiting in backend `POST /api/insights/:surveyId/trigger`:
  - Redis key `manual_refresh:{org_id}:{survey_id}:{today}` — `INCR` with 86400s TTL
  - Return 429 with `reason: 'daily_limit_reached'` if count >= `MANUAL_REFRESH_MAX_DAILY=3`
  - Return 400 with `reason: 'min_responses_not_met'` if `new_responses_since_last_run < MANUAL_REFRESH_MIN_NEW_RESPONSES=10`

---

## Phase 7 — Backend API: New Endpoints
**Depends on:** Phase 3 (hardened pipeline), Phase 5 (Crystal streaming), Phase 6 (checkpoint system)
**Blocks:** Phase 9 (frontend calls these)
**Est:** 3 days

- [ ] **P7-01** `GET /api/insights/:surveyId/checkpoints` — list checkpoint history:
  - Query `survey_insight_checkpoints` for survey, ordered by `checkpoint_number DESC`
  - Return array: `{id, checkpoint_number, response_count_at_checkpoint, nps_at_checkpoint, topic_fingerprint, created_at, has_report: !!report_url}`
  - Auth: `requireAuth`, scope to `org_id`

- [ ] **P7-02** `GET /api/insights/:surveyId/checkpoints/:checkpointId/report` — fetch checkpoint report blob:
  - Load row from `survey_insight_checkpoints`, confirm `org_id` match
  - If `report_url` is null: return 404 `report_not_ready`
  - **dev/dev-paid**: call `agentsClient.getCheckpointBlob(report_url)` → returns parsed blob JSON → respond directly
  - **staging/prod**: call `agentsClient.getCheckpointReadUrl(report_url)` → get OCI PAR URL → respond with `{url, expires_at}` so client fetches directly from OCI (avoids proxying large blobs through Node)
  - Detect environment via `process.env.NODE_ENV === 'production'` or `process.env.AGENTS_ENV`

- [ ] **P7-03** `POST /api/insights/:surveyId/trigger` — manual refresh trigger:
  - Validate survey belongs to org, status is `'active'` (return 409 with `insights_pipeline_suspended` if not)
  - Rate limit check (P6-09)
  - Call `agentsClient.triggerRun(surveyId, orgId, { force_regenerate: true })`
  - Return `{run_id, status: 'triggered'}`

- [ ] **P7-04** `POST /api/experience/:scope/crystal/stream` — Crystal SSE endpoint:
  - Scope: `survey` or `org`; extract `surveyId` from body if scope=survey
  - Call `_run_react_loop_streaming()` via agentsClient SSE proxy
  - Set `Content-Type: text/event-stream`, stream each event as `data: <json>\n\n`
  - Rate limit: 10 req/min per org (Redis)

- [ ] **P7-05** `GET /api/experience/org/overview` — org portfolio summary:
  - Query `org_metric_snapshots` latest + active surveys list + biggest movers
  - Return portfolio object (defined by `get_org_portfolio` tool schema)

- [ ] **P7-06** `GET /api/experience/:id/topics/signals` — topic analysis hub data:
  - Query `survey_topics` with all signal columns
  - Include `parent_topic_id` for hierarchy *(wires AdvancedInsightsPage topic hierarchy fix)*

- [ ] **P7-07** `GET /api/experience/:id/topics/:topicId` — topic deep dive:
  - Query `survey_topics` by id + `responses` for verbatims + `topic_windows` for trend
  - Return full topic detail object

- [ ] **P7-08** `GET /api/experience/:id/trends` — survey trend analysis:
  - Query `survey_metric_snapshots` over `?days=` window
  - Include `survey_insight_checkpoints` for checkpoint markers on the timeline

- [ ] **P7-09** `GET /api/notifications/pending` — in-app pending notifications:
  - Query `notification_events WHERE org_id=$1 AND user_id=$2 AND status='pending' AND channel='in_app'`
  - Mark returned events as `'delivered'` in the same transaction
  - Return array of notification objects

- [ ] **P7-10** Add `survey_status`, `pipeline_active`, and `crystal_opening` to `GET /api/insights/:surveyId/list` response *(GAP-14 resolved)*:
  - `crystal_opening`: derive with `SELECT narrative FROM insights WHERE survey_id=$1 AND org_id=$2 AND layer='descriptive' ORDER BY trust_score DESC LIMIT 1` — return null if no rows
  - Frontend: display as Crystal's pre-loaded first message; if null, use `t('insights.crystal.opening.'+dataTier)`
  - Thread starts only when user sends their first message (crystal_opening is display-only, not a LLM call)
  - `survey_status: survey.status`
  - `pipeline_active: !!(running_run)`
  - `can_manual_refresh: bool`, `manual_refresh_limit_reached: bool` (separate flags per audit issue CRIT-04)

- [ ] **P7-11** Add org aggregation scheduler job — `run_org_aggregation()` in `agents/scheduler.py` *(see GAP-16)*:
  - Runs hourly via `asyncio.create_task(run_every(run_org_aggregation, interval_seconds=3600))`
  - Aggregates NPS/CSAT across all active surveys per org; writes to `org_metric_snapshots`

---

## Phase 8 — Frontend: New Routes + Pages
**Depends on:** Phase 7 (API endpoints must exist), Phase 9 preparation (add route constants first)
**Est:** 5 days

- [ ] **P8-01** Add experience route constants to `app/src/constants/routes.ts`:
  ```ts
  EXPERIENCE = '/app/experience'
  EXPERIENCE_ORG_TRENDS = '/app/experience/org/trends'
  EXPERIENCE_SURVEY = '/app/experience/survey/:surveyId'
  EXPERIENCE_SURVEY_REPORT = '/app/experience/survey/:surveyId/report'
  EXPERIENCE_SURVEY_TOPICS = '/app/experience/survey/:surveyId/topics'
  EXPERIENCE_SURVEY_TOPIC = '/app/experience/survey/:surveyId/topics/:topicId'
  EXPERIENCE_SURVEY_TRENDS = '/app/experience/survey/:surveyId/trends'
  ```

- [ ] **P8-02** Create `app/src/hooks/useExperience.ts` with all 6 hooks:
  - `useOrgOverview()` → `GET /api/experience/org/overview`
  - `useSurveyIntelligence(surveyId)` → `GET /api/experience/:id` (may reuse `useInsights`)
  - `useSurveyReport(surveyId, checkpointId?)` → `GET /api/insights/:id/checkpoints/:checkpointId/report`
  - `useTopicAnalysis(surveyId)` → `GET /api/experience/:id/topics/signals`
  - `useTopicDeepDive(surveyId, topicId)` → `GET /api/experience/:id/topics/:topicId`
  - `useSurveyTrends(surveyId, days)` → `GET /api/experience/:id/trends`

- [ ] **P8-03** Create `app/src/pages/experience/ExperienceHubPage.tsx`:
  - Shows org-level portfolio: active surveys grid, portfolio NPS trend, biggest movers
  - Links to each survey intelligence page
  - Uses `useOrgOverview()`

- [ ] **P8-04** Create `app/src/pages/experience/SurveyIntelligencePage.tsx`:
  - The new primary survey insights view (replaces direct use of UnifiedInsightsView for this route)
  - Shows: ProgressArc, InsightStateBanner, metric tiles, insight cards, Crystal panel
  - Wires progressive sub-tier layouts based on `data_tier` from API

- [ ] **P8-05** Create `app/src/pages/experience/SurveyReportPage.tsx`:
  - Checkpoint report viewer — shows historical checkpoint data
  - Checkpoint selector (dropdown or timeline component)
  - Calls `useSurveyReport(surveyId, checkpointId)`

- [ ] **P8-06** Create `app/src/pages/experience/TopicAnalysisHubPage.tsx`:
  - Topic grid with hierarchy support (`parent_topic_id` grouping)
  - Calls `useTopicAnalysis(surveyId)`
  - Link to TopicDeepDive per topic

- [ ] **P8-07** Create `app/src/pages/experience/TopicDeepDivePage.tsx`:
  - Single topic detail: verbatims, sentiment breakdown, trend, driver score
  - Calls `useTopicDeepDive(surveyId, topicId)`

- [ ] **P8-08** Create `app/src/pages/experience/SurveyTrendsPage.tsx`:
  - NPS/CSAT trend chart with checkpoint markers
  - Anomaly event annotations
  - Calls `useSurveyTrends(surveyId, days)`

- [ ] **P8-09** Create `app/src/pages/experience/OrgTrendsPage.tsx`:
  - Org-level trend chart
  - Cross-survey theme frequency table
  - Uses `useOrgOverview()` with trend data

- [ ] **P8-10** Add all 7 routes to `app/src/App.tsx` router under the authenticated shell

- [ ] **P8-11** Add "Experience" link to `app/src/components/SideNav.tsx` pointing to `ROUTES.EXPERIENCE`

---

## Phase 9 — Frontend: Progressive Intelligence UI
**Depends on:** Phase 7 (`page_state_metadata` with tier data), Phase 8 (new page components exist)
**Est:** 3 days

- [ ] **P9-01** Create `app/src/components/insights/ProgressArc.tsx`:
  - Props: `tier: 'collecting' | 'first_voices' | 'early_signals' | 'growing_picture' | 'full_report'`
  - Renders: ○ → ◔ → ◑ → ◕ → ●
  - Accessible: aria-label with tier name and response count

- [ ] **P9-02** Update `computeDataTier(responseCount: number): DataTier` helper in shared frontend logic:
  - `<10` → `'collecting'`, `10-39` → `'first_voices'`, `40-99` → `'early_signals'`, `100-199` → `'growing_picture'`, `>=200` → `'full_report'`

- [ ] **P9-03** Implement `computePageState()` function in `app/src/hooks/useInsights.ts`:
  - Returns `InsightPageState` based on: `survey_status`, `response_count`, `run status`, `last checkpoint age`
  - Correct ordering: check survey_status first → check response_count tier → check run status → check staleness
  - Returns `can_manual_refresh` and `manual_refresh_limit_reached` as separate booleans (not a single flag)
  - Returns `early_insights` when `10 <= response_count < 200` with a completed run

- [ ] **P9-04** Create `app/src/components/insights/InsightStateBanner.tsx` (4-prop version):
  - Props: `pageState: InsightPageState`, `surveyStatus: SurveyStatus`, `canManualRefresh: boolean`, `onGenerateInsight: () => void`, `manualRefreshLimitReached: boolean`
  - No "Generate new insight" button if `surveyStatus !== 'active'`

- [ ] **P9-05** Create `app/src/components/insights/SurveyStatusBanner.tsx`:
  - Props: `status: 'paused' | 'closed'`, `responseCount: number`, `onResume?: () => void`
  - Paused: amber, non-dismissible, "Resume survey" link (owner only)
  - Closed: grey, permanent, shows final response count

- [ ] **P9-06** Create `app/src/components/insights/ScoreOnlyBanner.tsx`:
  - Dismissible info banner for no-text surveys
  - Persists dismissal in localStorage per survey ID

- [ ] **P9-07** Implement sub-tier layout variants in `SurveyIntelligencePage.tsx`:
  - **Collecting (0-9)**: Banner only — "Collecting first responses" — no metrics, no Crystal panel
  - **First Voices (10-39)**: ProgressArc + 2 metric tiles (NPS/CSAT if available) + 1 key insight card + Crystal (limited)
  - **Early Signals (40-99)**: ProgressArc + metrics row + topic list (top 3) + insight cards + Crystal
  - **Growing Picture (100-199)**: ProgressArc + full metrics + topic grid + insight cards + Crystal
  - **Clear Picture (200+)**: Full layout — no ProgressArc (or ● filled), all sections

- [ ] **P9-08** Implement trend display in insight cards (section 8.10):
  - `TrendBadge` component: `↑ Confirmed`, `↑ Emerging`, `↓ Reversing`, `→ Stable`
  - Badge color: confirmed trend = stronger color, first_occurrence = softer color
  - Include `trend_persistence` label from delta data

- [ ] **P9-09** Implement anomaly indicator on insight cards:
  - `AnomalyChip` component: `🔴 New anomaly` vs `⚠️ Ongoing issue` based on `anomaly_credibility`
  - Tooltip showing delta from prior checkpoint

- [ ] **P9-10** Implement checkpoint history navigation in `SurveyReportPage.tsx`:
  - Checkpoint selector: dropdown or step-through navigation
  - Shows `checkpoint_number`, `response_count_at_checkpoint`, `nps_at_checkpoint`, `created_at`
  - Calls `GET /api/insights/:surveyId/checkpoints` for list, then `GET .../checkpoints/:id/report` for content

- [ ] **P9-11** Add notification channel config UI to settings/profile page (stubs):
  - Toggles for in-app / email / push per event type
  - Email/push show "(coming soon)" badge
  - Calls `GET/PUT /api/notifications/preferences`

---

## Phase 10 — Frontend: Crystal Panel Refactor
**Depends on:** Phase 5 (streaming ReAct backend), Phase 8 (new pages that host Crystal)
**Est:** 3 days

- [ ] **P10-01** Update `app/src/components/CrystalPanel.tsx` to call the new SSE endpoint `POST /api/experience/:scope/crystal/stream`:
  - Use `EventSource` or `fetch` with `ReadableStream` for SSE
  - Scope: pass `survey` when on survey pages, `org` when on org pages
  - Pass `surveyId` from context

- [ ] **P10-02** Implement streaming UI in CrystalPanel:
  - On `type:'thinking'` event: show animated "thinking" state with tool name label (use CRYSTAL_TOOL_LABELS i18n map)
  - On `type:'observation'` event: show tool result summary (collapse after 2s)
  - On `type:'synthesizing'`: show "Putting it together…" spinner
  - On `type:'answer'`: render final answer with citations + suggestion chips

- [ ] **P10-03** Implement citation rendering in CrystalPanel answer:
  - Each citation: source label (topic name or metric name), verbatim text if applicable
  - Citation sentiment coloring: positive=green left border, negative=red, neutral=grey *(fixes plan item 5b)*

- [ ] **P10-04** Implement audit drawer on trust score click in `UnifiedInsightsView.tsx`:
  - Click on trust indicator (●/◑/○) opens Popover/Sheet
  - Shows: model, verifier_notes, coverage%, consistency%, prompt_hash from `audit_json`

- [ ] **P10-05** Thread continuity: no UI change needed — silently continues or resets based on TTL. Verify that Crystal's opening observation refreshes on new checkpoint publish. (GAP-14 resolution needed first)

---

## Phase 11 — Frontend: Existing Fixes + Polish
**Depends on:** Phase 7 (API endpoints for feedback, topic hierarchy)
**Can run parallel to Phase 9-10**
**Est:** 2 days

- [ ] **P11-01** Wire "Helpful" / "Pin" buttons in `UnifiedInsightsView.tsx`:
  - Add `onClick` to thumbs-up/thumbs-down buttons → `api.updateInsightFeedback(insight.id, { thumbs })`
  - Add `onClick` to pin button → `api.updateInsightFeedback(insight.id, { pinned: !pinned })`
  - Optimistic local state update; confirm backend persists to `insights.user_state_json`

- [ ] **P11-02** Extract `GeneratingOverlay.tsx` as shared component (used by both `UnifiedInsightsView.tsx` and `AdvancedInsightsPage.tsx`):
  - Props: `nodes: string[]`, `nodesDone: string[]`, `genError?: string`
  - Delete duplicate inline definition in both files

- [ ] **P11-03** Move `LAYER_CONFIG` / `LAYER_META` to `app/src/pages/insights/shared.tsx` as single source of truth; update all imports

- [ ] **P11-04** Move hardcoded strings from `shared.tsx` (confidence labels, layer labels, `"CONF {value}"`) to `app/src/locales/en.ts`

- [ ] **P11-05** Fix `InsightStateBanner` — remove `onRetry` prop reference that is not in the props interface (audit issue LOW-03)

- [ ] **P11-06** Fix streaming function — remove dead `import httpx, _os` in Python streaming code (audit issue LOW-05)

- [ ] **P11-07** Brief narrative section in `UnifiedInsightsView.tsx`:
  - Find first `layer === 'descriptive'` insight with `category === 'metric.nps'`
  - Render as hero card above filter pills with `headline + narrative + metric_json` value

- [ ] **P11-08** Wire `getTopicHierarchy` in `AdvancedInsightsPage.tsx`:
  - Call `api.getTopicHierarchy(surveyId)` (or `useTopicAnalysis`)
  - Render topic grid with parent/child grouping using `parent_topic_id`

- [ ] **P11-09** Sample data watermark in all-surveys mode:
  - When `scope === 'all'` in `UnifiedInsightsView.tsx`: show persistent top banner `t('insights.sampleDataBanner')`
  - Add key to `app/src/locales/en.ts`

- [ ] **P11-10** Add all 70+ i18n keys from the research doc catalogs to `app/src/locales/en.ts`:
  - `insights.state.*` keys
  - `insights.tier.*` keys
  - `insights.trust.*` keys
  - `insights.progressive.*` keys
  - `crystal.tool.*` labels (CRYSTAL_TOOL_LABELS map)
  - `trends.anomaly.*` keys
  - `trends.checkpoint.*` keys
  - `notifications.settings.*` keys
  - `insights.state.scoreOnlySurvey.*` keys
  - `insights.state.surveySuspended.*` keys

---

## Phase 12 — Observability + Audit Logging
**Depends on:** Phase 1 (`ai_operation_logs` table), Phase 3 (pipeline running)
**Can run in parallel with Phases 8-11**
**Est:** 2 days

- [ ] **P12-01** Wire `ai_operation_logs` INSERT after every LLM call:
  - In `agents/lib/openrouter.py` completion handler
  - In `agents/lib/anthropic_client.py` completion handler
  - Log: `org_id`, `run_id`, `operation` (node name), `model`, `provider`, `input_tokens`, `output_tokens`, `cost_usd`, `latency_ms`, error if any

- [ ] **P12-02** Add Prometheus counters for Crystal tool calls in `agents/lib/metrics.py`:
  - `crystal_tool_calls_total{tool, org_id}` counter
  - `crystal_tool_duration_seconds{tool}` histogram
  - `crystal_react_turns_total{org_id}` counter

- [ ] **P12-03** Add `agent_run_duration_seconds` histogram to metrics; record on run completion/failure in scheduler

- [ ] **P12-04** Add Prometheus alert rule for zombie runs: alert if `agent_runs WHERE status='running' AND last_heartbeat_at < NOW()-5m > 0` for more than 10 minutes (doc 05 §10.4)

- [ ] **P12-05** Ensure all `logger.error()` calls include `traceback=traceback.format_exc()` across `agents/graphs/insights.py` and all tool files (audit issue from Phase 4g)

---

## Phase 13 — Testing
**Depends on:** All implementation phases complete for the area being tested
**Est:** 3 days

- [ ] **P13-01** `agents/tests/test_crystal.py` — update for ReAct loop:
  - Test `get_or_create_thread()` continuation vs. TTL reset
  - Test `_run_react_loop()` with mock tool executors
  - Test SSE event sequence from `_run_react_loop_streaming()`
  - Test rate limit enforcement (10 req/min)

- [ ] **P13-02** `agents/tests/test_insight_tools.py` — test all 13 Crystal tool executors:
  - Each tool: happy path + org_id scoping enforcement (wrong org_id returns empty/error, not another org's data)
  - `execute_get_driver_analysis`: verify delta is on -100 to +100 NPS scale
  - `execute_get_checkpoint_history`: verify pre-computed delta is returned without recomputation

- [ ] **P13-03** `agents/tests/test_stream_consumer.py` — test checkpoint + progressive tier system:
  - `should_trigger_progressive_tier()` fires at 10, 40, 100
  - Does NOT fire twice for same tier (Redis dedup)
  - Survey status gate: paused/closed surveys do not trigger

- [ ] **P13-04** Create `agents/tests/test_checkpoint_store.py`:
  - `migrate_blob()` upgrades a v0 blob to v1 with correct defaults
  - `migrate_blob()` is idempotent on a v1 blob

- [ ] **P13-05** `agents/tests/test_pipeline.py` (new or extend existing):
  - `extract_signals_from_response()` correctly maps each question type
  - `compute_survey_capability_flags()` sets `has_open_text=False` for rating-only surveys
  - No-text path: `node_absa`, `node_embed`, `node_cluster`, `node_topics` are all skipped
  - Heartbeat is called as first action of each node

- [ ] **P13-06** Frontend: add unit tests for `ProgressArc` (all 5 tier states render correct symbol), `InsightStateBanner` (no generate button when survey is not active), `SurveyStatusBanner` (paused vs. closed variants)

- [ ] **P13-07** Integration test: full end-to-end pipeline run against a test survey → verify checkpoint row created, blob written, delta computed, `notification_events` row inserted

---

## Phase 14 — Production Readiness
**Depends on:** All phases complete
**Est:** 2 days

- [ ] **P14-01** Run all migrations against staging Postgres in order; verify no conflicts
- [ ] **P14-02** Provision GCS bucket; set `CHECKPOINT_BUCKET` and `GCS_SERVICE_ACCOUNT_KEY` in agents service env *(GAP-10)*
- [ ] **P14-03** Verify all required env vars are set across all three services (backend, agents, app) — use startup validation from P3-25
- [ ] **P14-04** Verify `AGENTS_INTERNAL_KEY` is changed from default in staging and production
- [ ] **P14-05** Load test Crystal SSE endpoint: confirm 10 req/min per org rate limit fires correctly under concurrent load
- [ ] **P14-06** Run zombie sweep once manually on staging; verify it marks stuck runs correctly without false positives
- [ ] **P14-07** Verify Crystal thread 7-day TTL: create a thread, manually set `last_active_at = NOW() - 8 days`, confirm next Crystal open starts fresh thread
- [ ] **P14-08** Verify no raw Postgres errors or stack traces leak in any HTTP 500 response (fuzz a few endpoints with invalid UUIDs)
- [ ] **P14-09** Update `docs/README_SETUP.md` with new env vars and GCS setup steps
- [ ] **P14-10** Update `backend/CLAUDE.md` and `agents/CLAUDE.md` with new packages, new files, and Crystal architecture

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
