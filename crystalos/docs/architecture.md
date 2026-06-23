# CrystalOS Architecture

**Status:** Design  
**Last updated:** 2026-05-21

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL CALLERS                                  │
│   Node.js backend (agentsClient.js)  ·  Redis stream consumer               │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │  HTTP / SSE
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI (main.py)                                   │
│  /api/insights/:id/generate   /api/insights/:id/crystal   /metrics          │
└────────────┬────────────────────────────────────┬───────────────────────────┘
             │                                    │
             ▼                                    ▼
┌────────────────────────┐            ┌───────────────────────────┐
│   LangGraph Pipeline   │            │   Crystal ReAct Loop      │
│   (graphs/insights.py) │            │   (agents/crystal.py)     │
│                        │            │                           │
│  12-node DAG:          │            │  ReAct loop:              │
│  ingest → context →    │            │  think → call tool →      │
│  route_specialists →   │            │  observe → think → ...    │
│  embed → metrics →     │            │                           │
│  extract_texts → absa  │            │  13 registered tools      │
│  → cluster → topics →  │            │  (crystal/registry.py)    │
│  narrate → verify →    │            │                           │
│  evaluate → publish    │            │  SSE stream to client     │
└────────────┬───────────┘            └───────────────┬───────────┘
             │                                        │
             └──────────────────┬─────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SKILL RUNTIME  (target state)                      │
│                                                                             │
│   skill_registry.execute("skill-name", input, ctx)                         │
│                                                                             │
│   ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────────┐ │
│   │  Skill Registry │    │  Skill Runtime   │    │  Tool Dispatcher      │ │
│   │                 │    │                  │    │                       │ │
│   │  Cosine search  │───▶│  Read SKILL.md   │───▶│  Internal: importlib  │ │
│   │  over embedded  │    │  Load references │    │  dispatch to Python   │ │
│   │  descriptions   │    │  Inject examples │    │  function             │ │
│   │  Sub-5ms query  │    │  Call LLM        │    │                       │ │
│   │                 │    │  Run EVALS.md    │    │  External: MCP server │ │
│   └─────────────────┘    │  Write examples  │    │  (Jira, Slack, etc.)  │ │
│                          └──────────────────┘    └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
             │                                        │
             ▼                                        ▼
┌────────────────────────┐            ┌───────────────────────────┐
│   Memory Layer         │            │   Observability Layer     │
│   (memory.md)          │            │   (observability.md)      │
│                        │            │                           │
│   L1: Semantic cache   │            │   Langfuse traces         │
│   L2: Thread compress  │            │   Hallucination scorer    │
│   L3: Survey facts     │            │   PII scrubber            │
│   L4: Org memory       │            │   Prometheus + structlog  │
└────────────────────────┘            └───────────────────────────┘
             │                                        │
             └──────────────────┬─────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                          │
│                                                                             │
│   Postgres (psycopg3)         Redis                     pgvector            │
│   ─────────────────────       ──────────────────        ─────────────────── │
│   agent_runs                  semantic_cache:{hash}     crystal_org_memory  │
│   ai_operation_logs           survey_facts:{id}         (embeddings col)    │
│   crystal_threads             thread_compress:{id}                          │
│   insight_topics              rate_limit:{org}                              │
│   insight_records             tier:{id}:{tier}                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Layer Breakdown

### Layer 1: API Gateway (FastAPI)

**File:** `crystalos/main.py`

What it does:
- Authenticates requests (`AGENTS_INTERNAL_KEY`)
- Routes to pipeline or Crystal
- Manages DB pool + Redis connections in lifespan
- Exposes `/metrics` for Prometheus scraping

What it does NOT do:
- No business logic
- No LLM calls
- No direct DB reads for insight data (delegated to pipeline/Crystal)

**Target change:** Add Langfuse flush to lifespan shutdown.

---

### Layer 2: Orchestrators (LangGraph + Crystal ReAct)

**Files:** `crystalos/graphs/insights.py`, `crystalos/agents/crystal.py`

These are the two fixed orchestrators. In the target state they call `skill_registry.execute()` instead of calling agent logic inline. The DAG topology and ReAct loop stay unchanged.

**LangGraph pipeline** — 12-node stateful DAG. Each node is `async def node_<name>(state: dict) -> dict`. LangGraph handles checkpointing and edge routing. The graph is compiled once at startup and reused.

**Crystal ReAct loop** — Runs in `_run_crystal()` with up to 3 retries. Each iteration: build messages → call LLM → parse tool calls → dispatch tools → collect observations → repeat. SSE emits each step to the browser.

**Target change:** Both orchestrators call `skill_registry.execute(skill_name, input, ctx)`. Internal structure is preserved; only the dispatch point changes.

---

### Layer 3: Skill Runtime (target state)

**Planned files:** `crystalos/lib/skill_registry.py`, `crystalos/lib/skill_runtime.py`

The skill runtime is a thin loader. It:

1. Reads `SKILL.md` for the named skill
2. Loads any `references/` files listed in the skill
3. Injects the top-3 most similar EXAMPLES.md entries as few-shot context
4. Calls the LLM via `openrouter.call_agent()` with the assembled prompt
5. Post-execution: runs EVALS.md criteria check
6. If eval passes (score ≥ 75): appends this execution to EXAMPLES.md
7. If eval fails: retries once with failure context injected

The skill registry handles discovery. Skills embed their `description` field at registration time. Queries use cosine similarity to find the best matching skill. For hard-coded calls (orchestrators know the skill name), discovery is bypassed.

---

### Layer 4: Tool Dispatcher

**Planned file:** `crystalos/lib/tool_dispatcher.py`

Two dispatch paths:

**Internal tools** (all current Python functions):
```
plugin.json "tools" section → maps name to Python path
dispatcher → importlib.import_module + getattr → call async function directly
```
No subprocess. No JSON-RPC. Sub-millisecond overhead.

**External MCP tools** (Jira, Slack, Salesforce — future):
```
plugin.json "mcp_servers" section → declares server name + command
dispatcher → MCP JSON-RPC over stdio
```
MCP is ONLY for systems we don't own. Internal tools never go through MCP.

---

### Layer 5: Memory (Redis + Postgres)

See [memory.md](./memory.md) for full design.

Four layers, cheapest first:
- **L1** — Semantic response cache (Redis, 24h TTL)
- **L2** — Thread compression (structured JSON in `crystal_threads`)
- **L3** — Survey facts cache (Redis, warm at publish time)
- **L4** — Org memory (pgvector in `crystal_org_memory`)

---

### Layer 6: Observability (Langfuse + Prometheus)

See [observability.md](./observability.md) for full design.

Three fixes over current state:
- Langfuse distributed traces (optional, no-op without `LANGFUSE_PUBLIC_KEY`)
- Gemini Flash hallucination scorer replacing LLM-asks-LLM `_verify()`
- PII scrubber on trace inputs (regex, ~0.1ms, reuses `_PII_PATTERNS`)

---

## Component Responsibilities

| Component | File(s) | Owns |
|-----------|---------|------|
| API routing | `main.py` | Auth, routing, lifespan |
| Pipeline orchestration | `graphs/insights.py` | 12-node DAG, state machine |
| Crystal orchestration | `agents/crystal.py` | ReAct loop, thread management |
| Skill registry | `lib/skill_registry.py` (planned) | Skill discovery, embedding index |
| Skill runtime | `lib/skill_runtime.py` (planned) | SKILL.md loading, LLM dispatch, eval |
| Tool dispatcher | `lib/tool_dispatcher.py` (planned) | Python function dispatch, MCP proxy |
| Memory | `lib/memory.py` (planned) | Cache reads/writes across all 4 layers |
| Tracer | `lib/tracer.py` (planned) | Langfuse span creation, PII scrub |
| Hallucination scorer | `lib/hallucination_scorer.py` (planned) | Gemini Flash judge |
| LLM client | `lib/openrouter.py` | HTTP to OpenRouter, retry, circuit breaker |
| DB pool | `lib/db.py` | Postgres connection pool, helpers |

---

## Model Fallback Design (Gap G7)

Current: one model call, hard fails if OpenRouter is down.

Target fallback chain:
```
Primary: claude-3-5-sonnet  (configured per skill in SKILL.md)
    ↓ (on 429 / 503 / timeout)
Secondary: gpt-4o           (same task, same prompt)
    ↓ (on failure)
Tertiary: claude-3-haiku    (degraded — simpler output expected)
```

The circuit breaker in `openrouter.py` already tracks per-model failure counts. The fallback chain reads from `constants.py` (`MODEL_FALLBACK_CHAIN`). No skill needs to know about fallbacks — the LLM client handles it transparently.

---

## Per-Org Rate Limiting (Gap G11)

Current: circuit breaker is global — one org's abuse trips it for everyone.

**Important clarification:** The proposed Redis sliding window in FastAPI middleware fixes *request rate* per org but does NOT fix the circuit breaker. The circuit breaker in `lib/openrouter.py` is a module-level singleton that trips on LLM failures from any org. A retry storm from one org's pipeline run (e.g., a survey with malformed data triggering validation retries) still opens the circuit for all orgs.

**Full fix requires two changes:**
1. Redis sliding window middleware per org (rate limiting) — as described
2. Per-model circuit breakers: `openrouter_breakers: dict[str, CircuitBreaker]` keyed by model name, not a single global. This way a failed `gpt-4o` call doesn't trip the `claude-3-haiku` breaker.

```python
# In openrouter.py — replace global singleton:
_breakers: dict[str, CircuitBreaker] = {}

def _get_breaker(model: str) -> CircuitBreaker:
    if model not in _breakers:
        _breakers[model] = CircuitBreaker(model, ...)
    return _breakers[model]
```

---

## Partial Pipeline Publish (Gap G12)

Current: publish is all-or-nothing. A failure in `node_verify` leaves users with stale data.

Target: publish in tiers. Each tier is independently publishable.

```
Tier 1 (topics + metrics) — publish after node_topics
Tier 2 (full narrative)   — publish after node_narrate
Tier 3 (verified output)  — publish after node_verify
```

The `insight_records` table gains a `tier` column. The frontend shows the highest complete tier while later tiers are still running.

---

## Pipeline Idempotency Lock (Gap G25)

Current: `run_insight_generation` can be called concurrently for the same survey. Two concurrent manual refreshes produce undefined state — the last writer wins and earlier partial writes are orphaned.

**Fix:** Postgres advisory lock at the start of `node_ingest`. The lock is per-survey and released when the run completes (success or failure).

```sql
-- In node_ingest, before any writes:
SELECT pg_try_advisory_xact_lock(hashtext('insight_gen:' || survey_id))
-- Returns false if another session holds the lock
-- If false: check for a running agent_run, return its run_id instead of starting a new run
```

Cost: ~0.1ms. The lock is transaction-scoped — released automatically if the pipeline crashes.

---

## Crystal Client Disconnect Detection (Gap G20)

Current: when a browser tab closes mid-Crystal session, `_run_react_loop_streaming` keeps calling tools and making LLM calls. The server doesn't know the client is gone. TCP drops after 30–120 seconds. Cost: $0.10–0.50 per orphaned session in tokens.

**Fix:** Poll `request.is_disconnected()` at each tool call boundary in the streaming generator:

```python
async def _run_react_loop_streaming(inp: CrystalInput, request=None):
    for tool_def in tools_to_run:
        if request and await request.is_disconnected():
            logger.info("crystal_stream_disconnected", survey_id=inp.survey_id)
            return  # Generator exits, no more tool calls or LLM calls
        # ... existing dispatch
```

The FastAPI endpoint passes `request: Request` as a parameter to `_run_react_loop_streaming`.

---

## Audit Trail for AI Decisions (Gap G26)

Enterprise and regulated customers need to answer: "Why did Crystal say X?" and "What data supported this insight?"

**Schema addition:** `reasoning_trace` JSONB column on `insight_records`:

```json
{
  "reasoning_trace": {
    "supporting_tool_results": ["get_survey_overview:...", "get_topic_details:onboarding:..."],
    "hallucination_score": 0.91,
    "eval_score": 0.87,
    "eval_issues": [],
    "model": "claude-3-5-sonnet",
    "schema_version": 1
  }
}
```

This is NOT the full LangGraph state (too large). It's the 3–5 decision-relevant fields per insight. The `node_publish` step writes these fields from the pipeline state at the time of publish.

Crystal sessions similarly write the top tool results and eval scores to `crystal_threads.reasoning_trace` at the end of each turn.
