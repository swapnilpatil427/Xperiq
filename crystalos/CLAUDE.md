# Experient — Agents Service

## What this is
Python FastAPI service that powers all AI pipelines and Crystal Intelligence.
Runs alongside the Node.js backend (deployed separately to Fly.io).
The backend calls this service via `agentsClient.js` using `AGENTS_INTERNAL_KEY` for auth.

## Stack
- Python 3.11+ + FastAPI + uvicorn
- LangGraph — stateful multi-node AI pipelines
- asyncpg / psycopg — Postgres async driver
- ioredis (Python: `redis.asyncio`) — Redis streams + rate limiting
- OpenRouter — LLM gateway (GPT-4o, Claude, Llama)
- Prometheus client — metrics at `/metrics`

## Directory structure
```
agents/         # Package root
  agents/       # Individual AI agents (creator, copilot, refiner, etc.)
  consumers/    # Redis stream consumer (response_stream.py) — progressive tier triggers
  crystal/      # Crystal Intelligence platform
    context.py    # CrystalContext frozen dataclass
    registry.py   # 13 tool definitions with JSON Schema
    tools.py      # 13 async tool executor functions
  graphs/       # LangGraph pipelines
    insights.py   # Main insight generation pipeline (12 nodes)
    nodes/        # Shared node logic (context, route_specialists)
  lib/          # Shared utilities
    db.py         # Postgres pool + helper functions
    constants.py  # Central config (all tunable values live here)
    checkpoint_store.py  # Crystal checkpoint blobs (local FS or GCS)
    topic_signals.py     # Full topic signal computation
    topic_registry.py    # Survey topic centroid registry
    security.py          # check_survey_access, require_internal_key
    openrouter.py        # LLM API client with retry
    metrics.py           # Prometheus counters + histograms
    event_publisher.py   # SSE run event publisher
    trace_context.py     # Async trace context (run_id/org_id per request)
  schemas/      # Pydantic models (InsightState, InsightRecord, etc.)
  specialists/  # 7 domain specialist agents (NPS, CES, CSAT, etc.)
  tools/        # ML utilities (embeddings, clustering, sentiment, delta)
main.py         # FastAPI app entry — mounts all routers
scheduler.py    # Background jobs: zombie sweep + org aggregation
```

## Key architectural patterns

### Crystal vs Copilot — roles & the action-proposal boundary (standing convention)

Two distinct AI assistants, two phases of the workflow. They share the same
skill-framework engine (SKILL.md + EVALS + SkillRuntime + legacy fallback) but
play opposite roles:

| | **Crystal** | **Copilot** |
|---|---|---|
| Role | Understand & **recommend** | **Act & edit** |
| Phase | After data is collected (analysis) | Authoring / editing the survey |
| Operates on | insights, topics, metrics, verbatims | survey questions |
| State | **read-only** — never mutates | writes (validated, eval-gated) |
| Entry | `POST /api/insights/:surveyId/crystal` → `_run_skill_stream` | `POST /orchestrate/{run_id}/refine` → `copilot_agent` (`copilot-analyst` skill) |

**The boundary that keeps this safe:**

> **Crystal proposes, Copilot / endpoints execute.** Crystal never mutates state
> directly. Anything that changes data is surfaced as an *action proposal* that
> the user explicitly confirms; the frontend then calls the right endpoint.

**Action proposals** (`ActionProposal` in `agents/crystal.py`, dispatched in
`app/src/components/CrystalPanel.tsx` ~line 501). Crystal may recommend any of
these; confirming the card executes it:

| Recommendation | `type` | Executes via | Wired? |
|---|---|---|---|
| Add a survey | `create_survey` | `api.startRun()` | ✅ |
| Add / edit questions | `edit_survey` / `edit_survey_questions` | `api.copilotRefine()` (→ **Copilot**) | ✅ |
| Add a workflow | `create_workflow` | `api.createWorkflow()` | ✅ |
| Distribute | `distribute` | distribution tab | ✅ |
| Re-run insights | `schedule_rerun` | `api.triggerInsightGeneration()` | ✅ |
| Add an alert | `create_alert` | `api.createAlertRule()` (tool: `propose_alert`) | ✅ |

**Two sources emit proposals**, both normalised to the same shape:
1. **Default (skill) path** — the `crystal-analyst` SKILL.md output schema includes
   an optional `action_proposals[]`; the skill emits them when the data justifies a
   next step. Surfaced via `_normalize_skill_output()`.
2. **Legacy/agentic path** — the `propose_*` action tools (`crystal/tools.py`,
   registered in `ACTION_TOOL_NAMES`). Surfaced via `_extract_action_proposals()`.

Tool/skill proposals (which may carry `proposal_type` and omit `id`) are normalised
to the frontend `ActionProposal` shape — `type` + slug `id` + defaults — by
`_normalize_proposal()` in `agents/crystal.py`. Add the alias there if a tool's
`proposal_type` differs from the frontend handler name (e.g. `workflow` →
`create_workflow`, `alert` → `create_alert`).

Going forward: new "act/edit" capabilities (workflow editing, distribution,
alerts, settings) belong to **Copilot** and should each be a **separate skill**
with its own EVALS gate, routed the same way. New "explain/recommend" capability
belongs to **Crystal** and emits an action proposal rather than executing.

### Survey skills are skill-first with legacy fallback
`survey-creator` and `copilot-analyst` run via `registry.execute()` inside
`agents/creator.py` / `agents/copilot.py`. On skill failure (not registered,
eval fail, or output-mapping error) they fall back to the legacy `call_agent`
path — output is identical downstream (all ID-fix / bias / logic guards still
run). The skill↔`Question`-schema mapping lives in `lib/skill_survey_adapter.py`.
`survey-qc` remains on the legacy `quality_control_agent` (coupled to the
creation graph's revision loop).

### Crystal Intelligence (ReAct loop)
- Entry: `POST /api/insights/:surveyId/crystal` (via `insights.js` → `agentsClient.js`)
- Crystal agent in `agents/crystal.py` runs a ReAct loop calling 13 tools
- SSE stream: each tool call + thinking step emits a `data:` event to the client
- Thread continuity: `get_or_create_thread()` looks up `crystal_threads` by `(survey_id, org_id)`, reuses if TTL active, starts fresh otherwise (7-day TTL)
- Rate limit: 10 Crystal requests per org per minute (Redis sliding window)

### Insight Pipeline (LangGraph)
- Entry: `run_insight_generation(survey_id, org_id, run_id, trigger)` in `graphs/insights.py`
- 12 nodes: ingest → context → route_specialists → embed → metrics → extract_texts → absa → cluster → topics → narrate → verify → evaluate → publish
- `force_regenerate=True` for `trigger='manual'`, `False` for schedule/stream
- Heartbeat updates `agent_runs.heartbeat_at` every 30s; zombie sweep reaps runs stale > 15 min
- Checkpoint blob written to `checkpoint_store` at publish; schema_version=1

### Progressive Tier System (response_stream.py)
- Redis stream consumer listens for new response events
- `should_trigger_progressive_tier()` checks response count vs thresholds (10/40/100/250)
- Redis dedup key `tier:{survey_id}:{tier}` with 30-day TTL prevents duplicate triggers
- On threshold hit: calls backend `/api/insights/:id/generate` with `trigger='stream'`

## Environment variables
- `DATABASE_URL` — Postgres connection string (required)
- `REDIS_URL` — Redis (required in production; optional in dev)
- `OPENROUTER_API_KEY` — LLM API key (required)
- `AGENTS_INTERNAL_KEY` — Shared secret with Node.js backend (required; must change from default)
- `AGENTS_ENV` — `'production'` triggers startup validation; default `'dev'`
- `CHECKPOINT_BUCKET` — GCS bucket URI for Crystal checkpoint blobs (production only)
- `GCS_SERVICE_ACCOUNT_KEY` — JSON service account key for GCS writes (production only)

## Running tests
```bash
cd agents
.venv/bin/pytest              # all 425 tests
.venv/bin/pytest tests/test_crystal.py   # Crystal-specific
.venv/bin/pytest tests/test_integration.py  # end-to-end pipeline smoke tests
```

## Testing rules

Every code change requires a corresponding test change:
- **New function or class** → add tests in `tests/test_<module>.py`
- **Modified function signature** (e.g. new parameter) → add a test that exercises the new parameter and a test that verifies the old behavior is preserved when the parameter is omitted
- **Bug fix** → add a regression test named `test_<what_was_broken>`

Mock patterns:
- Async functions: `unittest.mock.AsyncMock`
- `call_agent()`: patch as `"crystalos.lib.openrouter.call_agent"` (not the local import)
- `get_skill_model()`: patch as `"crystalos.lib.skill_runtime.get_skill_model"`
- Never make real LLM calls in tests

Run tests:
```bash
cd crystalos
.venv/bin/pytest tests/test_skill_runtime.py -v    # single file
.venv/bin/pytest                                    # all 580+ tests
```

## Adding a new Crystal tool
1. Add the JSON Schema tool definition to `crystal/registry.py` (in `TOOL_DEFINITIONS`)
2. Add an `execute_<tool_name>()` async function to `crystal/tools.py`
3. Add the dispatch case to `dispatch_tool()` in `crystal/tools.py`
4. Add a unit test in `tests/test_insight_tools.py`

## Adding a new pipeline node
1. Implement `async def node_<name>(state: dict) -> dict` in `graphs/insights.py`
2. Register it: `g.add_node("<name>", node_<name>)`
3. Wire edges: `g.add_edge("prior_node", "<name>")` and `g.add_edge("<name>", "next_node")`
4. Add unit tests in `tests/test_pipeline.py`
