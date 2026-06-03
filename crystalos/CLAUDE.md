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

---

## CrystalOS Skill Framework (Sprint 1 — 2026-06-03)

### Adding a new AI capability (recommended — no Python required)

1. Create `crystalos/skills/<skill-name>/`
2. Write `SKILL.md` with frontmatter + prompt body (see format below)
3. Write `EVALS.md` with quality criteria
4. Create `EXAMPLES.md` stub (one line comment)
5. Add skill path to `crystalos/skills/plugin.json`

See the [10-minute quick start](../docs/agent-framework/QUICKSTART.md) for details and a working example.

### SKILL.md frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | kebab-case, max 64 chars, globally unique |
| `version` | yes | semver — bump minor for prompt changes |
| `shared` | yes | true = platform skill, false = internal |
| `description` | yes | LLM-readable, include input/output shape |
| `allowed-tools` | no | space-delimited tool names from plugin.json |
| `max_output_tokens` | no | Default: model max |
| `max_retries` | no | Default: 1 (retry on eval failure) |
| `timeout_seconds` | no | Default: 60 |

### Enabling the skill runtime

```bash
USE_SKILL_RUNTIME=true uvicorn agents.main:app
```

Default: `false` — existing agents still work without the flag.

### New library files (Sprint 1)

| File | Purpose |
|------|---------|
| `lib/skill_registry.py` | Discovers SKILL.md files, indexes metadata, dispatches execution |
| `lib/skill_runtime.py` | Loads skills, calls LLM, runs evals, retries on failure |
| `lib/tool_dispatcher.py` | Routes tool calls to Python functions via plugin.json |
| `lib/memory.py` | 4-layer memory (L0: tool cache, L1: semantic cache, L2: thread compression, L3: survey facts, L4: org memory) |
| `lib/tracer.py` | Langfuse distributed tracing (no-op without LANGFUSE_PUBLIC_KEY) |
| `lib/hallucination_scorer.py` | Deterministic + LLM hybrid hallucination scoring |
| `lib/pii_scrubber.py` | Regex PII scrubbing for trace inputs |

### New DB tables (Sprint 1 migrations)

| Migration | Table | Purpose |
|-----------|-------|---------|
| `20260603000001_skill_examples.sql` | `skill_examples` | Few-shot example bank for skills (replaces flat EXAMPLES.md) |
| `20260603000002_crystal_org_memory.sql` | `crystal_org_memory` | L4 org/user-scoped memory with pgvector |
| `20260603000003_crystal_threads_context_state.sql` | `crystal_threads` | L2 compression: context_state, turn_count, last_active_at columns |
| `20260603000004_insights_reasoning_trace.sql` | `insights` | G26 audit trail: reasoning_trace JSONB column |

### Running framework tests

```bash
cd agents
.venv/bin/pytest tests/test_skill_registry.py tests/test_skill_runtime.py \
                 tests/test_tool_dispatcher.py tests/test_memory.py \
                 tests/test_pii_scrubber.py tests/test_hallucination_scorer.py -v
```

Full suite (580+ tests, all passing):
```bash
.venv/bin/pytest
```

## Documentation

All CrystalOS documentation lives in `crystalos/docs/`:

| File | What it covers |
|------|---------------|
| [README.md](./docs/README.md) | Architecture overview, system diagram, layer breakdown |
| [QUICKSTART.md](./docs/QUICKSTART.md) | Add a new skill in 10 minutes |
| [SKILLS_CATALOG.md](./docs/SKILLS_CATALOG.md) | All 26 skills with purpose and ownership |
| [TESTING.md](./docs/TESTING.md) | Running tests, writing skill tests, CI |
| [GAPS_STATUS.md](./docs/GAPS_STATUS.md) | Gap tracking (G1-G29), implementation status |
| [architecture.md](./docs/architecture.md) | Full system diagram, component responsibilities |
| [skills.md](./docs/skills.md) | SKILL.md format spec, EVALS.md, EXAMPLES.md |
| [memory.md](./docs/memory.md) | 4-layer memory system design |
| [observability.md](./docs/observability.md) | Langfuse, hallucination gate, PII scrubbing |
| [migration.md](./docs/migration.md) | Agent → skill migration plan |
| [a2a.md](./docs/a2a.md) | A2A protocol integration design |
