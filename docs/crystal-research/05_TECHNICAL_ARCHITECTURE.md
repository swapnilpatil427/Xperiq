---
document_series: "Crystal Research — 05"
owner: Staff Engineering
status: Draft
last_revised: 2026-05-20
---

# Crystal XM Intelligence Platform — Technical Architecture

**Document series:** Crystal Research — 05
**Owner:** Staff Engineering
**Status:** Draft
**Last revised:** 2026-05-20

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Crystal ReAct Agent Architecture](#2-crystal-react-agent-architecture)
3. [Tool Registry Design](#3-tool-registry-design)
4. [Insight Pipeline Architecture](#4-insight-pipeline-architecture)
5. [Streaming Checkpoint System](#5-streaming-checkpoint-system)
6. [Database Schema Design](#6-database-schema-design)
7. [API Contract Design](#7-api-contract-design)
8. [Model Selection and Routing](#8-model-selection-and-routing)
9. [Multi-Tenancy and Security](#9-multi-tenancy-and-security)
10. [Observability](#10-observability)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Scalability Considerations](#12-scalability-considerations)

---

## 1. Architecture Overview

### 1.1 System Topology

```
                              ┌──────────────────────────────────────────────┐
                              │              BROWSER CLIENT                  │
                              │  React 18 + Vite + Tailwind v4               │
                              │  app/src/pages/insights/UnifiedInsightsView  │
                              │  app/src/components/CrystalPanel             │
                              └─────────────────────┬────────────────────────┘
                                                    │ HTTPS + SSE
                                                    │
                              ┌─────────────────────▼────────────────────────┐
                              │               CDN / EDGE                     │
                              │  Firebase Hosting (static app)               │
                              │  Cloudflare or GCP LB (API routing)          │
                              └─────────────────────┬────────────────────────┘
                                                    │ HTTPS
                                                    │
                 ┌──────────────────────────────────▼───────────────────────────────────────┐
                 │                         BACKEND (Fly.io — Node.js)                       │
                 │  backend/src/index.js                                                    │
                 │  Routes: /api/insights, /api/experience, /api/surveys,                  │
                 │          /api/responses, /api/orgs, /api/copilot                         │
                 │  Auth middleware (Clerk JWT)  |  Rate limiter (Redis-backed)             │
                 │  agentsClient.js → HTTP calls to agents service                         │
                 └───────────────────────┬───────────────────────┬────────────────────────┘
                                         │ HTTP (internal)       │ pg (pool)
                                         │                       │
          ┌──────────────────────────────▼──┐           ┌────────▼────────────────────────┐
          │   AGENTS SERVICE (Fly.io)        │           │         POSTGRES                │
          │   Python FastAPI + LangGraph     │           │  Supabase or Fly Postgres       │
          │   agents/main.py                 │           │  Core tables: surveys,           │
          │                                 │           │  responses, insights,            │
          │   Three subsystems:             │◄──────────│  survey_topics, topic_windows,  │
          │   1. Insight Pipeline           │  psycopg3  │  agent_runs, crystal_threads,   │
          │      agents/graphs/insights.py  │  async     │  survey_metric_snapshots,        │
          │   2. Crystal ReAct Agent        │           │  org_metric_snapshots,           │
          │      agents/agents/crystal.py   │           │  survey_topic_centroids,         │
          │   3. Stream Consumer            │           │  topic_candidates,               │
          │      agents/consumers/          │           │  response_embeddings             │
          │      response_stream.py         │           └─────────────────────────────────┘
          │                                 │
          │   Background processes:         │           ┌─────────────────────────────────┐
          │   - agents/scheduler.py         │           │         REDIS                   │
          │   - event bus consumer          │◄──────────│  Upstash or Fly Redis           │
          └─────────────────────────────────┘  ioredis  │  insight_events stream (XADD)  │
                                                        │  Rate limiter buckets           │
                                                        │  Session cache (future)         │
                                                        └─────────────────────────────────┘
```

### 1.2 Three Major Subsystems

**Subsystem 1: Insight Pipeline**

The LangGraph DAG in `agents/graphs/insights.py` (2400+ lines). Accepts a `(survey_id, org_id, run_id)` tuple from three trigger sources: the Redis stream consumer, the scheduler, and the backend API. Produces structured insight records, topic signals, and metric snapshots. Writes exclusively to Postgres. No user-facing streaming from this subsystem — frontend polls `agent_runs.stream_events` via the SSE endpoint at `GET /api/insights/:surveyId/stream`.

**Subsystem 2: Crystal Agent**

The conversational analyst. Currently (`agents/agents/crystal.py`) a single-call LLM with hallucination filter and self-correction loop. Target architecture is a ReAct tool-use loop (Section 2). Reads from Postgres via tool executors. Writes only to `crystal_threads` (conversation history). Tenant isolation enforced by `CrystalContext` passed to every tool.

**Subsystem 3: Streaming Infrastructure**

Redis event stream (`insight_events`) and the long-running consumer in `agents/consumers/response_stream.py`. Every submitted response publishes a `{survey_id, org_id, response_id}` event. The consumer batches these events per survey and decides when to trigger the insight pipeline. The scheduler (`agents/scheduler.py`) provides time-based triggers as a fallback when the stream consumer has not yet accumulated enough events.

### 1.3 Data Flow Narrative

A survey response travels from submission to published insight through the following path:

1. **Submission**: Browser POSTs to `POST /api/surveys/:id/responses`. The backend validates, saves the response row (with `answers` as JSONB), and publishes `{survey_id, org_id, response_id}` to the Redis `insight_events` stream via `XADD`.

2. **Stream event**: The consumer (`response_stream.py`) reads the event in a batch of up to 50. It increments `_batches[survey_id].count`. The consumer evaluates two tiers: if the count reaches `TIER1_RESPONSE_THRESHOLD` (50 in prod, 1 in dev) or 6 hours have elapsed, a Tier 1 metric snapshot (no LLM) is triggered. If the count reaches `TIER2_RESPONSE_THRESHOLD` (200 in prod, 5 in dev), 7 days have elapsed, or a Tier 1 anomaly was detected, a Tier 2 full checkpoint run with LLM narration is triggered. See Section 5.2 for the full trigger logic.

3. **Run creation**: `_trigger_insights()` creates an `agent_runs` row (status `running`) then POSTs to `POST {AGENTS_URL}/insights/generate` with `{survey_id, org_id, run_id}`.

4. **Pipeline execution**: The FastAPI endpoint dispatches to the LangGraph DAG. The graph executes `node_ingest → node_embed → [node_metrics || node_extract_texts] → node_absa → node_cluster → node_topics → node_context → node_route_specialists → node_narrate → node_verify → node_publish`.

5. **Publishing**: `node_publish` atomically upserts insight rows (superseding prior insights via `superseded_at`), writes a `survey_metric_snapshots` row, and marks the `agent_runs` row as `completed`.

6. **Frontend polling**: The frontend polls `GET /api/insights/:surveyId/run-status` every few seconds, or holds open the SSE endpoint `GET /api/insights/:surveyId/stream` which polls the `agent_runs.stream_events` JSONB column and pushes node completion events in real time. When `status = completed`, the frontend fetches `GET /api/insights/:surveyId/list` to refresh the UI.

### 1.4 Tenant Isolation Model

Every piece of data in the system is scoped to an `org_id`. This is enforced at multiple layers:

- **Database layer**: Every table that holds survey or response data has an `org_id` column. All application-layer queries include `AND org_id = $N` as a parameterized clause. There is no cross-org join in any query.
- **API layer**: The `requireAuth` middleware extracts `orgId` from the Clerk JWT and attaches it to `req.orgId`. No route handler can derive `orgId` from the request body or URL — it always comes from the validated token.
- **Agents layer**: Every pipeline run receives `org_id` as an explicit parameter (in the `InsightState` TypedDict). The survey access check in `node_ingest` calls `db.check_survey_access(survey_id, user_id, org_id)` before loading any data.
- **Crystal agent**: The `CrystalContext` object (a frozen dataclass) carries `org_id`. It is constructed from the authenticated `req.orgId` and passed immutably through the entire tool-use chain. Tool executors cannot query data for any other org.

---

## 2. Crystal ReAct Agent Architecture

### 2.1 Current State: `agents/agents/crystal.py`

Crystal today is a **single-call LLM per user message** with a three-layer quality loop. The backend (`backend/src/routes/insights.js`, route `POST /api/insights/:surveyId/crystal`) loads context from Postgres — up to 30 insights, 25 topics, NPS/CSAT from insight rows, and up to 10 conversation history messages — packages it into a `CrystalInput` Pydantic model, and calls the agents service.

The agents service builds a large system prompt (insights grouped by layer, topics as a tabular block, key metrics, and instructions). It calls the LLM via `call_agent()` from `agents/lib/openrouter.py`, which routes to the appropriate model based on `AGENTS_ENV` (Gemma 4 31B in dev, Gemini 2.5 Flash in prod).

**Self-correction loop (current implementation):**

```
Attempt 0:
  LLM call → CrystalOutput
  Hallucination filter → strip cited IDs not in valid_ids set
  LLM evaluator (crystal_eval agent) → EvalResult {quality_score, is_grounded, answers_question, issues}
  If quality_score >= 72 AND is_grounded AND answers_question → return output (PASS)
  Else → build correction string from eval issues + hallucinated IDs

Attempt 1 (if attempt 0 failed):
  Inject correction block into system prompt
  LLM call → CrystalOutput
  Hallucination filter + eval
  Track best_output by quality_score

Attempt 2 (if attempt 1 failed):
  Repeat with second correction

Return best_output across all attempts.
```

The correction block is injected at the top of the system prompt as a visually distinct section (`━━━━━━━━━━━━━━ CORRECTION REQUIRED ━━━━━━━━━━━━━━`), including specific issues from the evaluator and any hallucinated IDs.

**Current limitations:**

1. Crystal cannot query data not already loaded in the fixed context window. If a user asks about a specific topic's trend over time, Crystal cannot retrieve `topic_windows` rows — it only has the current snapshot.
2. Crystal cannot compare surveys. There is no mechanism to load data for a second survey.
3. Context is a snapshot from the moment the request was received. If a new pipeline run completes during a long conversation, Crystal's context does not update.
4. No streaming — the full LLM call + eval loop completes before the client receives anything. Average latency in prod is 3-6 seconds.
5. The context window is a fixed-size dump. For orgs with 50+ topics, the topics table truncates at 20 rows. There is no way to ask Crystal to dig deeper into a topic that was truncated.

**Current strengths (preserved in target architecture):**

- Deterministic hallucination filter: checks `cited_ids` against `valid_ids` (the set of insight IDs in the context). This is synchronous and never wrong.
- LLM self-correction loop: the correction injection pattern is effective and low-cost.
- Structured output: `CrystalOutput` (answer, citations, suggestions, insight_refs) is well-typed and passes through unchanged.
- Conversation thread management: `crystal_threads` table with `ON CONFLICT (thread_key) DO UPDATE` is correct and handles concurrent requests.

### 2.2 Target State: ReAct Agent Loop

The target Crystal architecture replaces the single-call pattern with a **ReAct (Reasoning + Acting) loop**. Each step in the loop is an LLM call that either selects a tool to call or decides to synthesize a final answer.

**Loop structure:**

```
User message
    │
    ▼
Scope resolution: survey-scoped or org-scoped?
    │
    ▼
Build initial reasoning prompt:
  - System prompt (Crystal persona, scope-appropriate instructions)
  - Tool definitions (from tool registry, filtered by scope)
  - Conversation history (rolling 6-turn window, compressed if needed)
  - Initial context (brief survey metadata, no full insight dump yet)
    │
    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  ReAct Loop (max 8 steps)                                                 │
│                                                                           │
│  Step N:                                                                  │
│    Reasoning call (fast model — Gemini 2.5 Flash or Gemma 4 31B in dev)  │
│    LLM receives: message + history + tool results so far                  │
│    LLM outputs: {action: "tool_call" | "synthesize", tool_name, input}   │
│                                                                           │
│    If action = "tool_call":                                               │
│      → emit SSE: {type: "thinking", tool: tool_name}                     │
│      → execute tool (async, 30s timeout)                                  │
│      → emit SSE: {type: "observation", summary: result.summary}          │
│      → append observation to messages list                                │
│      → N += 1, continue loop                                              │
│                                                                           │
│    If action = "synthesize" OR N >= MAX_STEPS:                            │
│      → break loop                                                         │
└───────────────────────────────────────────────────────────────────────────┘
    │
    ▼
Synthesis call (quality model — Gemini 2.5 Flash)
  → Build synthesis prompt with all observations compressed
  → Generate CrystalOutput (answer, citations, suggestions, insight_refs)
    │
    ▼
Hallucination filter (deterministic — same as current)
    │
    ▼
Evaluator (fast model — Gemini 2.0 Flash or Nemotron Nano in dev)
  → Score quality, grounding, completeness
  → Self-correct up to 2 times if score < 72
    │
    ▼
Emit SSE: {type: "answer", answer, citations, suggestions}
    │
    ▼
Persist to crystal_threads
```

### 2.3 Tool Registry Pattern

The tool registry is a dict mapping tool names to `{schema, executor, version}` dicts. It is loaded once at FastAPI startup by scanning `agents/crystal/tools/`.

```python
# agents/crystal/__init__.py (new file)
CRYSTAL_TOOL_REGISTRY: dict[str, dict] = {}

def load_registry() -> None:
    """Auto-discover tools in agents/crystal/tools/ by scanning for SCHEMA + executor."""
    for module in pkgutil.iter_modules(["agents/crystal/tools"]):
        mod = importlib.import_module(f"agents.crystal.tools.{module.name}")
        schema = getattr(mod, "SCHEMA", None)
        executor = getattr(mod, "executor", None)
        if schema and executor:
            CRYSTAL_TOOL_REGISTRY[schema["name"]] = {
                "schema":   schema,
                "executor": executor,
                "version":  schema.get("version", "1.0.0"),
            }
```

### 2.4 Tool Executor Pattern

Each tool file in `agents/crystal/tools/` exports two module-level objects:

- `SCHEMA: dict` — the tool definition sent to the LLM (name, description, input_schema, output_schema)
- `executor: async def (params: dict, ctx: CrystalContext) -> ToolResult` — the implementation

```python
# Pattern: agents/crystal/tools/get_topic_details.py
from agents.crystal.context import CrystalContext
from agents.crystal.result import ToolResult
from agents.lib import db

SCHEMA = {
    "name": "get_topic_details",
    "version": "1.0.0",
    "description": (
        "Deep dive into a single topic: verbatim quotes, sentiment trend over time, "
        "driver score, NPS impact, effort score, and co-occurring topics. "
        "Use when the user asks about a specific topic by name."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "topic_name": {"type": "string", "description": "Exact topic name to look up"},
            "time_window": {"type": "string", "enum": ["all_time", "last_30d", "last_7d"],
                           "default": "all_time"},
            "include_verbatims": {"type": "boolean", "default": True},
        },
        "required": ["topic_name"],
    },
}

async def executor(params: dict, ctx: CrystalContext) -> ToolResult:
    # org_id from CrystalContext — immutable, never from params
    topic_name = params["topic_name"]
    time_window = params.get("time_window", "all_time")

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT name, volume, sentiment_score, net_sentiment, nps_impact,
                          driver_score, urgency_score, effort_score, dominant_emotion,
                          promoter_pct, detractor_pct, velocity_pct, health_label
                   FROM survey_topics
                   WHERE survey_id = %s AND org_id = %s
                     AND name ILIKE %s AND time_window = %s
                   LIMIT 1""",
                (ctx.survey_id, ctx.org_id, topic_name, time_window),
            )
            row = await cur.fetchone()

    if row is None:
        return ToolResult(error=f"Topic '{topic_name}' not found")

    cols = [d[0] for d in cur.description]
    data = dict(zip(cols, row))
    summary = (
        f"Topic '{data['name']}': volume={data['volume']}, "
        f"nps_impact={data['nps_impact']}, sentiment={data['sentiment_score']:.2f}, "
        f"health={data['health_label']}"
    )
    return ToolResult(data=data, summary=summary)
```

### 2.5 CrystalContext Object

```python
# agents/crystal/context.py (new file)
from dataclasses import dataclass
from typing import Literal

@dataclass(frozen=True)
class CrystalContext:
    """Immutable tenant scope object. Passed to every tool executor.

    Constructed from authenticated req.orgId at the backend.
    The org_id field can never be overridden by user input.
    """
    org_id:     str
    survey_id:  str | None   # None for org-scoped queries
    user_id:    str
    scope:      Literal["survey", "org"]
    session_id: str          # UUID for session-level logging and cache
```

### 2.6 Conversation Context Management

**Rolling window:** Conversation history is capped at the last 6 exchanges (12 messages: 6 user + 6 assistant). This is a reduction from the current 10-message window to account for the additional tokens used by tool results in the ReAct loop.

**Progressive compression:** When the total estimated token count of the conversation history + tool observations exceeds 40% of the model's context window, the oldest tool observations are compressed: the full `result.data` dict is replaced with `result.summary` string, reducing them from ~500 tokens to ~30 tokens each.

**Scope-appropriate tool filtering:** The set of tools available to the LLM changes based on `ctx.scope`:

- `scope="survey"`: All single-survey tools available (`get_survey_overview`, `get_topic_details`, `get_metric_history`, `get_insights_list`, `get_verbatims`, `get_driver_analysis`, `get_segment_breakdown`, `get_anomaly_events`, `get_benchmark_comparison`)
- `scope="org"`: Cross-survey tools available (`get_org_portfolio`, `get_cross_survey_themes`, `compare_surveys`). Single-survey tools available with `survey_id` parameter required.

### Crystal Thread Lifecycle

**Thread identity:** A thread is uniquely identified by `(org_id, user_id, survey_id, scope)`.
- `org_id`: the organization — ensures complete tenant isolation
- `user_id`: the Clerk user ID — each user has their own conversation history
- `survey_id`: `NULL` for org-scope Crystal, the survey UUID for survey-scope Crystal
- `scope`: `'survey'` | `'org'` — matches the page Crystal is on

One active thread per identity tuple at a time.

**Thread continuation rule:**
- If the last message in the thread is within **7 days**: continue the thread — Crystal remembers prior context
- If the last message is older than 7 days: start a new thread automatically — prior context is too stale to be useful
- Thread continuation is transparent to the user — no "starting new conversation" message

**Context window sent to LLM:** Last 6 exchanges (12 messages: 6 user + 6 assistant). Older messages are stored in `crystal_threads` but not sent to the LLM.

**Thread storage TTL:** Full message history kept for **90 days** after the last message, then hard-deleted. This is for audit and debugging only — the LLM never sees messages older than 6 exchanges.

**New checkpoint publication:** Does NOT reset the thread. Crystal continues the same conversation. On the next message, the Crystal context loader refreshes the pre-computed survey context (new insights, updated metrics) so Crystal has current data without requiring a new thread.

**`crystal_threads` table columns required:**
```sql
CREATE TABLE crystal_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    user_id TEXT NOT NULL,          -- Clerk user ID
    survey_id UUID REFERENCES surveys(id),  -- NULL for org scope
    scope TEXT NOT NULL DEFAULT 'survey' CHECK (scope IN ('survey', 'org')),
    messages JSONB NOT NULL DEFAULT '[]',   -- full history, max 40 messages stored
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id, survey_id, scope)
);

CREATE INDEX idx_crystal_threads_lookup ON crystal_threads(org_id, user_id, survey_id, scope);
CREATE INDEX idx_crystal_threads_ttl ON crystal_threads(last_message_at);
-- Scheduler deletes rows WHERE last_message_at < NOW() - INTERVAL '90 days'
```

---

## 3. Tool Registry Design

### 3.1 Tool Definitions

The following 12 tools form the initial Crystal tool registry. Each tool reads exclusively from Postgres via parameterized queries with `org_id` and `survey_id` scoping.

---

**Tool 1: `get_survey_overview`**

Returns a high-level summary of a survey suitable for an opening context snapshot.

```
input_schema:
  survey_id:    string (required for org-scope; uses ctx.survey_id for survey-scope)
  time_window:  enum["all_time", "last_30d", "last_7d"] (default: "all_time")

returns:
  title:              string
  status:             string
  response_count:     int
  nps:                {score, n, ci_low, ci_high, promoter_pct, detractor_pct, passive_pct}
  csat:               {score, n}
  top_topics:         [{name, volume, sentiment_score, health_label}] (top 5 by volume)
  run_status:         string   -- latest agent_runs.status
  last_generated_at:  datetime
  anomaly_flag:       boolean

source tables: survey_metric_snapshots, survey_topics, agent_runs, surveys
```

---

**Tool 2: `get_topic_details`**

Deep-dives into a single topic: all XM signals, sentiment trend over time, sample verbatims, co-occurring topics.

```
input_schema:
  topic_name:         string (required)
  time_window:        enum["all_time", "last_30d", "last_7d"] (default: "all_time")
  include_verbatims:  boolean (default: true)

returns:
  topic:        {name, volume, sentiment_score, net_sentiment, nps_impact, driver_score,
                 urgency_score, effort_score, dominant_emotion, promoter_pct, detractor_pct,
                 passive_pct, velocity_pct, health_label, trend_windows[]}
  verbatims:    [{text, nps_score, sentiment, submitted_at}] (up to 5)
  co_occurring: [{name, co_count}] (top 3 co-occurring topics)

source tables: survey_topics, topic_windows, responses (ai_topics GIN index)
```

---

**Tool 3: `get_metric_history`**

NPS, CSAT, response velocity, and anomaly flag time series for a survey. Reads `survey_metric_snapshots` — one row per pipeline run.

```
input_schema:
  days:   int (default: 30, max: 365)
  metric: enum["nps", "csat", "all"] (default: "all")

returns:
  history: [{captured_at, nps, nps_ci_low, nps_ci_high, csat, response_count,
             response_velocity_7d, anomaly_flag}]
  summary: {nps_change_30d, csat_change_30d, anomaly_count_30d}

source tables: survey_metric_snapshots
```

---

**Tool 4: `get_insights_list`**

Returns the current active insights for a survey, optionally filtered by layer or category.

```
input_schema:
  layer:       enum["descriptive", "diagnostic", "predictive", "prescriptive", "all"]
               (default: "all")
  time_window: enum["all_time", "last_30d", "last_7d"] (default: "all_time")
  limit:       int (default: 20, max: 50)

returns:
  insights: [{id, layer, category, headline, narrative, trust_score, metric_json,
              citations_json, priority}]
  layers_present: string[]   -- which layers have at least one insight

source tables: insights
```

---

**Tool 5: `get_verbatims`**

Returns raw open-text responses, filtered by topic, sentiment, NPS bucket, and date.

```
input_schema:
  topic_name:  string (optional — if omitted, returns from all topics)
  sentiment:   enum["all", "positive", "negative", "neutral"] (default: "all")
  nps_bucket:  enum["all", "promoter", "passive", "detractor"] (default: "all")
  time_window: enum["all_time", "last_30d", "last_7d"] (default: "all_time")
  limit:       int (default: 10, max: 30)

returns:
  verbatims: [{response_id, text, nps_score, sentiment, submitted_at, topics}]
  total:     int

source tables: responses (ai_topics GIN index, ai_sentiment column)
```

---

**Tool 6: `compare_surveys`**

Compares two surveys' NPS scores, response counts, top topics, and sentiment distributions. Requires org-scope or explicit survey_id_b parameter.

```
input_schema:
  survey_id_a:  string (required — first survey)
  survey_id_b:  string (required — second survey)
  time_window:  enum["all_time", "last_30d", "last_7d"] (default: "all_time")

returns:
  survey_a: {title, nps, csat, response_count, top_topics[]}
  survey_b: {title, nps, csat, response_count, top_topics[]}
  delta:    {nps_diff, csat_diff, shared_topics[], topics_only_a[], topics_only_b[]}

source tables: survey_metric_snapshots, survey_topics, surveys
security: both survey_id_a and survey_id_b are checked against ctx.org_id
```

---

**Tool 7: `get_org_portfolio`**

Org-level view of all active surveys. Aggregate NPS, biggest movers, cross-survey theme coverage. Requires org-scope.

```
input_schema:
  days:  int (default: 30, max: 90)

returns:
  portfolio_nps:   float
  portfolio_csat:  float
  active_surveys:  [{survey_id, title, nps, response_count, top_urgent_topic, anomaly_flag}]
  biggest_movers:  [{survey_id, title, nps_change_30d, direction}] (top 3)
  themes:          [{theme_name, survey_count, avg_sentiment}]

source tables: survey_metric_snapshots, org_metric_snapshots, surveys, survey_topics
```

---

**Tool 8: `get_cross_survey_themes`**

Returns topics that appear (by similar name) across multiple surveys in the org. Quantifies prevalence and sentiment consistency.

```
input_schema:
  min_survey_count: int (default: 2 — only themes in 2+ surveys)
  time_window:      enum["all_time", "last_30d"] (default: "all_time")

returns:
  themes: [{
    theme_name: string,
    survey_count: int,
    surveys: [{survey_id, title, topic_name, volume, nps_impact}],
    avg_sentiment: float,
    sentiment_consistent: boolean  -- True if all surveys agree on pos/neg direction
  }]

source tables: survey_topics, surveys (GROUP BY normalized topic name, org_id)
```

---

**Tool 9: `get_anomaly_events`**

Returns anomaly-flagged metric snapshots for a survey, indicating time periods where scores moved significantly or response volume spiked.

```
input_schema:
  days:   int (default: 90, max: 365)
  type:   enum["all", "score", "volume"] (default: "all")

returns:
  anomalies: [{
    captured_at: datetime,
    nps: float,
    nps_delta: float,         -- change from prior snapshot
    response_count: int,
    velocity_delta: float,    -- response velocity change
    anomaly_flag: boolean
  }]

source tables: survey_metric_snapshots (WHERE anomaly_flag = TRUE)
```

---

**Tool 10: `get_benchmark_comparison`**

Compares a survey's NPS and CSAT against industry benchmark percentiles stored in a reference table or hardcoded in the tool.

```
input_schema:
  metric:   enum["nps", "csat", "both"] (default: "both")
  industry: string (optional — overrides org_profile.industry if provided)

returns:
  nps: {
    score:      float,
    percentile: int,          -- 0-100
    industry:   string,
    benchmark:  {p25, p50, p75}
  }
  csat: {
    score:      float,
    percentile: int,
    benchmark:  {p25, p50, p75}
  }

source tables: survey_metric_snapshots (latest), org_profiles, in-memory benchmark table
```

---

**Tool 11: `get_driver_analysis`**

Returns point-biserial correlation driver scores for all topics in a survey. Shows which topics most strongly correlate with NPS promoters vs. detractors.

```
input_schema:
  sort_by:     enum["driver_score", "nps_impact", "urgency_score"] (default: "driver_score")
  limit:       int (default: 10, max: 20)
  time_window: enum["all_time", "last_30d"] (default: "all_time")

returns:
  drivers: [{
    name:           string,
    volume:         int,
    driver_score:   float,    -- point-biserial correlation coefficient
    nps_impact:     float,    -- avg NPS of responses mentioning this topic - overall NPS
    impact_score:   float,    -- abs(nps_impact) * sqrt(volume)
    direction:      enum["positive", "negative", "neutral"]
  }]
  overall_nps: float

source tables: survey_topics, responses (nps_score, ai_topics)
```

---

**Tool 12: `get_segment_breakdown`**

Breaks down NPS, CSAT, or sentiment scores by a demographic or question answer segment.

```
input_schema:
  segment_question_id: string (required — which question to use as segment dimension)
  metric:              enum["nps", "csat", "sentiment"] (default: "nps")
  time_window:         enum["all_time", "last_30d", "last_7d"] (default: "all_time")

returns:
  segments: [{
    answer_value:    string,    -- the answer option (e.g. "18-24", "Enterprise")
    response_count:  int,
    metric_value:    float,
    metric_delta:    float      -- delta from overall metric
  }]
  overall_metric: float

source tables: responses (answers JSONB, nps_score, csat_score, ai_sentiment)
```

---

**Tool 13: `get_checkpoint_history`**

Fetches the last 2–3 completed checkpoint summaries for the survey. Returns NPS, top topics, and pre-computed delta between N and N-1. Used when Crystal compares the current report to the previous one.

```
input_schema:
  survey_id: string (required for org-scope; uses ctx.survey_id for survey-scope)
  limit:     int (default: 2, max: 5 — number of checkpoints to return)

returns:
  checkpoints: [{
    label:          string,   -- e.g. "Current (May 20, 2026)"
    response_count: int,
    nps:            float,
    nps_ci_low:     float,
    nps_ci_high:    float,
    top_topics:     string[],
    is_current:     boolean
  }]
  delta: {
    nps_delta:       float,
    nps_delta_label: string,   -- e.g. "↓ 4 pts since last analysis"
    trend_direction: string,
    trend_persistence: string,
    topic_changes: {
      emerged:     string[],
      worsened:    string[],
      improved:    string[],
      disappeared: string[]
    }
  } | null
  available_from_checkpoint: int   -- always 2; delta is null when only 1 checkpoint exists

source tables: survey_insight_checkpoints (metadata), object storage (delta blob via report_url)
```

### Tool: `get_checkpoint_history`

**Purpose:** Enables Crystal to answer "how does this compare to last time?" questions by fetching pre-computed checkpoint comparison data. The delta is already computed at pipeline time — this tool is a read-only fetch, not a computation.

**Input:**
```json
{
  "survey_id": "uuid",
  "limit": 3
}
```

**Query:** Reads from `survey_insight_checkpoints` (DB) for metadata, then fetches the pre-computed delta from the latest checkpoint's blob in object storage.

```sql
SELECT id, created_at, response_count,
       nps_at_checkpoint, csat_at_checkpoint,
       trend_direction, trend_persistence,
       report_url
FROM survey_insight_checkpoints
WHERE survey_id = $1 AND org_id = $2
  AND run_type IN ('tier2_checkpoint', 'manual_refresh')
  AND report_url IS NOT NULL
ORDER BY created_at DESC
LIMIT $3
```

**Output shape:**
```json
{
  "checkpoints": [
    {
      "label": "Current (May 20, 2026)",
      "response_count": 250,
      "nps": 38,
      "nps_ci_low": 31,
      "nps_ci_high": 45,
      "top_topics": ["Checkout Pain", "Product Quality", "Support Speed"],
      "is_current": true
    },
    {
      "label": "Previous (Apr 12, 2026)",
      "response_count": 212,
      "nps": 42,
      "top_topics": ["Checkout Pain", "Product Quality", "Pricing"],
      "is_current": false
    }
  ],
  "delta": {
    "nps_delta": -4.0,
    "nps_delta_label": "↓ 4 pts since last analysis",
    "trend_direction": "declining",
    "trend_persistence": "confirmed",
    "topic_changes": {
      "emerged": ["Support Speed"],
      "worsened": ["Checkout Pain"],
      "improved": ["Product Quality"],
      "disappeared": ["Pricing"]
    }
  },
  "available_from_checkpoint": 2
}
```

**`available_from_checkpoint`**: The minimum checkpoint number before comparison data is available. Value is always 2 (need at least N and N-1). When only 1 checkpoint exists, `delta` is `null` and Crystal acknowledges the limitation.

**When Crystal calls this tool:**
- User asks "how does this compare to last time?" or "what changed since my last report?" or "has NPS improved?"
- Crystal's opening observation includes `trend_direction` when `trend_persistence = 'confirmed'` — but if the user asks for specifics, Crystal calls this tool for the full delta
- Crystal does NOT call this tool proactively on page load (data is already in `page_state_metadata.trend_direction`)

**Crystal response patterns:**

| User question | Crystal action |
|---|---|
| "How does this compare to last analysis?" | Call tool, narrate full delta: NPS change, topic changes, trend direction |
| "Has NPS improved?" | Call tool, answer specifically with the nps_delta and trend_persistence |
| "What topics are new since last time?" | Call tool, return `topic_changes.emerged` list with verbatims |
| "Is Checkout Pain getting worse?" | Call tool, check if topic is in `topic_changes.worsened` |
| "Compare to the report from April" | Call tool with `limit=5`, find the April checkpoint, compare to current |

---

## 4. Insight Pipeline Architecture

### 4.1 LangGraph DAG Overview

The pipeline is a directed acyclic graph defined in `agents/graphs/insights.py` using LangGraph's `StateGraph`. It is stateless across runs: each invocation creates a fresh `InsightState` TypedDict with no shared mutable state. The graph takes `{survey_id, org_id, run_id, trigger, force_regenerate}` as input and writes all outputs directly to Postgres during node execution.

```
node_ingest
    │
    ▼
node_embed
    │
    ├────────────────────┐
    ▼                    ▼
node_metrics      node_extract_texts    (parallel fan-out)
    │                    │
    └──────┬─────────────┘
           ▼
        node_absa
           │
           ▼
        node_cluster
           │
           ▼
        node_topics
           │
           ▼
        node_context
           │
           ▼
        node_route_specialists
           │
           ▼
        node_narrate
           │
           ▼
        node_verify
           │
           ▼
        node_publish
```

### 4.2 Node Responsibilities

**node_ingest** — Load survey definition and responses from Postgres. Perform bootstrap detection: checks `survey_topic_centroids` for existing centroids; if none exist, marks `is_bootstrap=True`. Caps response loading at `INGEST_MAX_RESPONSES_BOOTSTRAP` (300) for bootstrap, or `INGEST_MAX_RESPONSES_CAP` (250) for all checkpoint runs. Uses a cumulative window: loads ALL available responses up to the cap (not just new ones since the last run). ABSA cache reuse keeps incremental cost low. Identifies `new_response_ids`: responses not yet AI-enriched (no `ai_enriched_at`) or enriched but missing `ai_topics`. Loads `org_profiles` for specialist routing. Emits `run_started` event. Enforces survey ownership via `db.check_survey_access()`. For progressive sub-tier runs (`run_type` in `['first_voices', 'early_signals', 'growing_picture']`), `node_ingest` loads ALL available responses (no cap needed — sub-tier surveys have fewer than 200 responses by definition). `is_bootstrap` is always `True` for sub-tier runs since no cluster centroids exist yet.

**node_embed** — Embeds all open-text responses using `get_or_create_embeddings()` from `agents/tools/embeddings.py`. Calls OpenAI `text-embedding-3-small` (1536 dimensions). Falls back to BoW heuristic if OpenAI API is unavailable. Caches results in `response_embeddings` table: `(survey_id, org_id, response_id, question_id, text, embedding vector(1536))`.

**node_metrics (parallel)** — Pure computation, no LLM. Calls `compute_nps_ci()` (Wilson confidence intervals), `compute_csat()`, `compute_ces()`, `compute_completion_rate()`, `compute_response_trend_analysis()`, `compute_effort_score()` from `agents/tools/metrics.py`. Populates `state["metrics"]`.

**node_extract_texts (parallel)** — Extracts open-text answer strings from the `responses.answers` JSONB. Matches `answer.questionId` to `question.id` in the survey definition. Reuses texts already extracted by `node_embed` when available. Populates `state["open_texts"]`.

**node_absa** — Aspect-Based Sentiment Analysis. Checks the enrichment cache: responses that already have `ai_enriched_at`, `ai_sentiment`, and `ai_emotion` are reconstructed from stored DB fields without LLM calls. Only truly new responses are sent to the LLM. Uses the `insight_narrate` model for ABSA (configured per-environment in `agents/lib/models.py` via `absa_concurrency`, `absa_batch_size`, `absa_cap` fields). Runs LLM calls in parallel batches bounded by a semaphore. Writes `ai_sentiment`, `ai_sentiment_score`, `ai_emotion`, `ai_effort_score`, `ai_enriched_at` back to the `responses` table. Wraps LLM calls in `_retry_loop()` (not the circuit breaker) to avoid tripping the shared OpenRouter circuit on ABSA batch failures.

**node_cluster** — Assigns responses to topic clusters. Two modes:

- **Bootstrap mode** (no centroids exist): O(n²) greedy cosine clustering at threshold 0.72 using embeddings. Responses that don't form a cluster of ≥2 are grouped by ABSA aspect into fallback clusters. Computes centroid vectors per cluster, stored in `state["bootstrap_centroids"]` for `node_topics` to insert after naming.

- **Incremental mode** (centroids exist): For each new response embedding, runs a pgvector ANN query against `survey_topic_centroids` (IVFFlat index, cosine ops). Matches above 0.72 are assigned to the nearest existing topic; `node_topics` updates the centroid via Welford running-mean. Non-matching responses go to the `topic_candidates` buffer. When the buffer reaches `max(5, 3% of total_responses)`, mini-clustering runs on candidates only. Falls back to bootstrap clustering on pgvector failures.

**node_topics** — LLM-based canonical topic naming. In bootstrap mode, calls `discover_topics()` for all clusters. In incremental mode, calls `discover_topics()` only for newly emerged clusters (those flushed from the candidate buffer); existing clusters with known centroid names are assigned a `TopicItem` locally with no LLM call. After naming, calls `compute_full_topic_signals()` from `agents/lib/topic_signals.py` for each cluster, then upserts `survey_topics` with the full signal fingerprint, seeds/links the centroid registry, writes `ai_topics` back to new responses, and upserts `topic_windows`.

**node_context** — Loads `OrgContextModel` and `SurveyContextModel`. Populated from the `org_context` dict injected into the survey dict by `node_ingest`. Used by `node_route_specialists`.

**node_route_specialists** — Selects domain specialist agents from `agents/specialists/registry.py`. The registry uses a YAML-defined scoring matrix (industry × use_case × survey_type) to rank specialist IDs. The top-ranked specialist's `canonical_topics()` are injected into `node_topics` as seed hints, and its `prompt_overlays.narrate_system` is passed to `node_narrate`.

**node_narrate** — Generates headlines and narratives using five parallel expert agents from `agents/agents/insight_experts.py`:

| Expert Function | Insight Layer | Model Role | Output Type |
|-----------------|---------------|------------|-------------|
| `narrate_nps_insight()` | descriptive | insight_expert | `NpsExpertOutput` |
| `narrate_csat_insight()` | descriptive | insight_expert | `CsatExpertOutput` |
| `narrate_topic_insight()` × top 5 clusters | diagnostic | insight_expert | `TopicExpertOutput` |
| `narrate_trend_insight()` | predictive | insight_expert | `TrendExpertOutput` |
| `narrate_prescriptive_insight()` | prescriptive | insight_expert | `PrescriptiveExpertOutput` |

All tasks run via `asyncio.gather()` with a `Semaphore(3)` limit. Includes a deduplication guard: if there are zero new responses and `force_regenerate=False`, loads cached insights from the DB instead of re-running all LLM calls.

**node_verify** — Runs `evaluate_insight_set()` — the `InsightSetEvaluatorOutput` agent that reviews the full set of generated insights for coverage, balance, redundancy, and actionability. Prunes duplicate or low-value insights.

**node_publish** — Atomically writes insights to Postgres. Supersedes prior insights by setting `superseded_at = NOW()` on existing rows before inserting new ones. Uses `ON CONFLICT (survey_id, insight_hash, time_window) DO UPDATE` for idempotency. Writes a `survey_metric_snapshots` row. Marks `agent_runs.status = 'completed'`.

### 4.3 InsightState TypedDict

```python
class InsightState(TypedDict, total=False):
    # Input context
    survey_id:            str
    org_id:               str
    run_id:               str
    trigger:              str             # "stream" | "schedule" | "regenerate"
    force_regenerate:     bool

    # Bootstrap mode signals
    is_bootstrap:         bool
    bootstrap_centroids:  list[list[float] | None]

    # Loaded data
    survey:               dict[str, Any]  # full survey row + org_context injected
    responses:            list[dict[str, Any]]
    new_response_ids:     set[str]        # IDs needing ABSA enrichment

    # Pipeline outputs
    metrics:              dict[str, Any]  # NPS CI, CSAT, CES, trend analysis
    open_texts:           list[dict[str, Any]]    # {response_id, question_id, text}
    embedded_texts:       list[dict[str, Any]]    # open_texts + embedding vectors
    absa_results:         list[dict[str, Any]]    # {response_id, aspect, sentiment, score, emotion}
    clusters:             list[dict[str, Any]]    # {id, aspect, canonical_name, texts, size, ...}
    topics:               list[Any]               # TopicItem.model_dump() list
    drivers:              list[Any]               # driver signals
    stream_events:        list[Any]               # emitted via _emit_event()
    insights:             list[dict[str, Any]]    # final insight records

    # Flags
    insights_from_cache:  bool

    # Context + specialist routing
    org_context:          dict[str, Any]
    survey_context:       dict[str, Any]
    selected_specialists: list[str]

    # Error accumulation
    errors:               list[str]
```

### 4.4 Trust Score Decomposition

Trust scores are computed deterministically in `_build_trust()` — no LLM involvement. Each insight has a `trust_score` (0–100 integer) and a `trust_json` dict explaining the components.

```
trust_score = round(
    statistical  × 0.35 +
    coverage     × 0.25 +
    consistency  × 0.25 +
    grounding    × 0.15
)

Where:
  statistical:  n >= 100 → 90; n >= 50 → 80; n >= 30 → 70; linear 10..70 for n < 30
  coverage:     max(20, min(100, round(mentions/total * 100 + 30)))
  consistency:  max(50, min(95, round(50 + (dominant_sentiment_fraction) * 45)))
  grounding:    100 if verifier_pass else 60
```

---

## 5. Streaming Checkpoint System

### 5.1 Redis Stream Architecture

The `insight_events` Redis stream is the event bus between the backend (response writer) and the agents service (pipeline trigger).

```
backend/src/routes/responses.js:
  client.xadd("insight_events", "*", "survey_id", surveyId, "org_id", orgId, "response_id", id)

agents/consumers/event_bus.py:
  async def consume_events(batch_size=50, block_ms=5000):
      """XREADGROUP with consumer group 'insight_consumers', consumer 'worker_1'."""
      # Uses XREADGROUP > to read pending messages
      # Acks messages after batch processing

agents/consumers/response_stream.py:
  async def run_response_stream_consumer():
      async for events in consume_events(batch_size=50, block_ms=5000):
          for event in events:
              _batches[event["survey_id"]]["count"] += 1
              if await _should_trigger(survey_id):
                  asyncio.create_task(_trigger_insights(survey_id, org_id))
```

The `_pending_triggers` set prevents concurrent triggers for the same survey during a single consumer batch cycle.

### 5.2 Trigger Conditions

The checkpoint system operates on a two-tier model to separate cheap SQL aggregation from expensive LLM narration:

**Tier 1 — Metric Snapshot** (no LLM): triggered every **50 new responses** OR **6 hours**. Pure SQL aggregation, writes to `survey_metric_snapshots`. Zero LLM cost.

**Tier 2 — Full Checkpoint Report** (with LLM narration): triggered every **200 new responses** OR **7 days** OR a Tier 1 `anomaly_flag` detected. The 200-response threshold ensures NPS confidence intervals are ±7 points or tighter before delta analysis is attempted — below this threshold, the CI is too wide (±30 at n=30) to distinguish real shifts from noise.

```python
async def _should_trigger(survey_id: str, tier: int = 1) -> bool:
    batch = _batches[survey_id]

    if tier == 1:
        # Tier 1: metric snapshot (no LLM) — 50 responses OR 6 hours
        if batch["count"] >= TIER1_RESPONSE_THRESHOLD:   # prod: 50, dev: 1
            return True
        if batch["last_tier1_trigger"] is not None:
            elapsed_hours = (datetime.now(utc) - batch["last_tier1_trigger"]).total_seconds() / 3600
            return elapsed_hours >= TIER1_TIME_HOURS and batch["count"] > 0  # prod: 6h, dev: 0.1h
        return False

    if tier == 2:
        # Tier 2: full checkpoint with LLM narration — 200 responses OR 7 days OR anomaly
        if batch["count"] >= TIER2_RESPONSE_THRESHOLD:   # prod: 200, dev: 5
            return True
        if batch.get("anomaly_flag"):                    # set by Tier 1 when Z-score > 2.5
            return True
        if batch["last_tier2_trigger"] is not None:
            elapsed_days = (datetime.now(utc) - batch["last_tier2_trigger"]).total_seconds() / 86400
            return elapsed_days >= TIER2_TIME_DAYS and batch["count"] > 0  # prod: 7d, dev: 1d
        return False

    return False
```

A Z-score > 2.5 on response velocity detected during Tier 1 sets `anomaly_flag=True` in the batch state, causing an immediate Tier 2 full checkpoint trigger on the next consumer cycle, regardless of response count or elapsed time.

### Progressive Tier Triggers (Sub-Tiers 0–3)

The stream consumer also drives the four progressive sub-tier runs that provide incremental value before the first full checkpoint. These fire based on **total response count** (not new-since-last-run), ensuring each tier runs at most once per tier crossing.

| Trigger | Response count threshold | Pipeline type | New constants |
|---------|--------------------------|---------------|---------------|
| First Voices | `>= 10` | ABSA + light topic discovery, no narration | `PROGRESSIVE_TIER_FIRST_VOICES = 10` |
| Early Signals | `>= 40` | ABSA + topics + partial narration (topics n≥15) | `PROGRESSIVE_TIER_EARLY_SIGNALS = 40` |
| Growing Picture | `>= 100` | Full pipeline minus delta analysis | `PROGRESSIVE_TIER_GROWING_PICTURE = 100` |

**Clear Picture (200+ responses)** is NOT a separate progressive tier trigger. It is the Tier 2 full checkpoint trigger (`CHECKPOINT_FULL_RESPONSE_THRESHOLD = 200`). When the Tier 2 run completes successfully, the stream consumer sets `progressive_tier:{survey_id} = full` and sub-tier triggers are permanently disabled for this survey.

These constants belong in `agents/lib/constants.py` under a new `# ── Progressive Tier Thresholds ──` group.

**Trigger rule:** Each sub-tier fires **once** when the response count first crosses the threshold. The consumer tracks which tier has been run per survey using a Redis key `progressive_tier:{survey_id}` (a string value: `none`, `first_voices`, `early_signals`, `growing_picture`, `full`). When a new response arrives, the consumer reads this key and checks whether the current response count has crossed the next tier's threshold. If yes, trigger the sub-tier pipeline run and advance the Redis key.

**Important:** Sub-tier triggers are disabled once `full` has been written to the Redis key (i.e., after the first Tier 2 checkpoint). From that point, only Tier 2 triggers (manual or auto) apply.

```python
PROGRESSIVE_TIER_THRESHOLDS = [
    ("first_voices",    PROGRESSIVE_TIER_FIRST_VOICES),    # 10
    ("early_signals",   PROGRESSIVE_TIER_EARLY_SIGNALS),   # 40
    ("growing_picture", PROGRESSIVE_TIER_GROWING_PICTURE), # 100
    # Note: clear_picture is NOT here — it is triggered by CHECKPOINT_FULL_RESPONSE_THRESHOLD (200)
    # When Tier 2 completes, mark_progressive_tier_complete sets the key to 'full'
]

def should_trigger_progressive_tier(survey_id: str, current_count: int, redis) -> str | None:
    """Returns the tier name to run, or None if no new tier has been crossed."""
    current_tier = redis.get(f"progressive_tier:{survey_id}") or "none"
    if current_tier == "full":
        return None  # already have a full report — progressive tiers no longer apply
    
    # Walk thresholds in order, find the highest uncrossed threshold
    for tier_name, threshold in reversed(PROGRESSIVE_TIER_THRESHOLDS):
        if current_count >= threshold:
            # Check if this tier has already run
            tier_order = ["none", "first_voices", "early_signals", "growing_picture", "full"]
            if tier_order.index(current_tier) < tier_order.index(tier_name):
                return tier_name  # trigger this tier
            break  # highest applicable tier already ran
    return None
```

**Dev override:** In dev (`AGENTS_ENV=dev`), all progressive thresholds are reduced: Dev overrides: TIER_FIRST_VOICES=2, TIER_EARLY_SIGNALS=5, TIER_GROWING_PICTURE=10 — allowing easy local testing without large datasets.

### Survey Status Gate

The stream consumer and all pipeline trigger paths check survey status before firing any pipeline run. Only `status = 'active'` surveys receive pipeline triggers.

```python
# In response_stream.py — checked before any trigger evaluation
async def get_survey_status(survey_id: str, db_pool) -> str:
    row = await db_pool.fetchrow(
        "SELECT status FROM surveys WHERE id = $1", survey_id
    )
    return row["status"] if row else "unknown"

# In the main consumer loop:
status = await get_survey_status(survey_id, db_pool)
if status != "active":
    logger.info({
        "event": "trigger_skipped_survey_not_active",
        "survey_id": survey_id,
        "status": status,
    })
    return  # do not trigger any pipeline run
```

**Status behavior table:**

| Survey status | Accepts new responses | Shows insights | Auto-trigger fires | Manual refresh allowed |
|---|---|---|---|---|
| `draft` | No | No | No | No |
| `active` | Yes | Yes | Yes | Yes |
| `paused` | Yes | Yes (existing) | No | No |
| `closed` | No | Yes (final) | No | No |

**`paused` surveys:** Still accept responses (respondents with existing share links can still submit). Existing insights remain fully visible. Pipeline is suspended — no auto-trigger, no manual refresh. The `can_manual_refresh` flag in the API is always `false` for paused surveys regardless of new response count.

**`closed` surveys:** No new responses accepted. Shows the final checkpoint report. No pipeline activity.

**API enforcement (manual refresh endpoint):**
```javascript
// POST /api/insights/:surveyId/trigger
if (survey.status !== 'active') {
  return res.status(409).json({
    error: 'insights_pipeline_suspended',
    survey_status: survey.status,
  });
}
```

### 5.3 Checkpoint Table Design

```sql
CREATE TABLE IF NOT EXISTS survey_insight_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id TEXT NOT NULL,
    run_id UUID REFERENCES agent_runs(id),
    checkpoint_number INT NOT NULL DEFAULT 1,
    previous_checkpoint_id UUID REFERENCES survey_insight_checkpoints(id),
    -- Provenance fields (what data was used)
    response_ids UUID[] NOT NULL DEFAULT '{}',      -- ALL response IDs in this run
    new_response_ids UUID[] NOT NULL DEFAULT '{}',  -- IDs new since previous checkpoint
    responses_from TIMESTAMPTZ,                     -- earliest submitted_at in batch
    responses_to TIMESTAMPTZ,                       -- latest submitted_at in batch
    previous_response_count INT NOT NULL DEFAULT 0,
    response_count INT NOT NULL,
    -- Delta analysis fields
    delta_json JSONB,                               -- computed deltas vs previous checkpoint
    topic_fingerprint_hash TEXT,
    anomalies_detected INT NOT NULL DEFAULT 0,
    -- Report quality
    report_quality_score INT,                       -- 0-100 from evaluator
    specialist_id TEXT,                             -- which specialist was used
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_url TEXT,  -- object store path: checkpoints/{org_id}/{survey_id}/{id}.json
);
CREATE INDEX ON survey_insight_checkpoints(survey_id, created_at DESC);
CREATE INDEX ON survey_insight_checkpoints(org_id, created_at DESC);
CREATE UNIQUE INDEX ON survey_insight_checkpoints(survey_id, checkpoint_number);
```

**Storage split:** Lightweight metadata (NPS, CSAT, response counts, trend fields, provenance) lives in this table for fast delta computation and checkpoint selector queries. The full report payload (all insights with narrative text, citations, topic snapshots, delta analysis) is stored in object storage at `report_url`. This keeps the DB row under 2KB regardless of report size.

### 5.4 Delta Analysis

**Topic fingerprinting:** At each checkpoint, a SHA-256 hash is computed from the sorted list of `(topic_name, health_label)` tuples. If the hash changes between checkpoints, `structural_change = True`, meaning a new topic appeared, one disappeared, or a topic's health classification changed.

**Emergence detection:** `topics_emerged` is the set of topic names present in the current checkpoint's `topic_snapshot` but absent from the previous checkpoint's. Emergence is determined by name, not by similarity — a topic renamed by the LLM may appear as both a disappearance and an emergence.

**Disappearance detection:** `topics_disappeared` is the set of names in the previous checkpoint but not in the current. A topic "disappears" when it has had zero new responses in the last two consecutive pipeline runs.

**Sentiment reversal:** `topics_reversed` lists topic names where the sign of `net_sentiment` flipped between checkpoints (positive → negative or vice versa). This is the most actionable signal: a topic that was trending positive but reversed is a leading indicator of a customer experience problem.

### 5.5 Org-Level Aggregation

The scheduler (`agents/scheduler.py`) runs `_snapshot_org_metrics()` on every tick:

```python
async def _snapshot_org_metrics(org_id: str) -> None:
    async with _pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            # Aggregate across all active surveys for this org
            await cur.execute(
                """INSERT INTO org_metric_snapshots
                     (org_id, captured_at, active_survey_count, total_responses,
                      avg_nps, avg_csat, avg_completion_rate,
                      top_urgent_topic, top_driver_topic)
                   SELECT
                     %s, NOW(),
                     COUNT(DISTINCT s.id),
                     SUM(sms.response_count),
                     AVG(sms.nps),
                     AVG(sms.csat),
                     AVG(sms.completion_rate),
                     (SELECT name FROM survey_topics st
                      WHERE st.org_id = %s ORDER BY urgency_score DESC NULLS LAST LIMIT 1),
                     (SELECT name FROM survey_topics st
                      WHERE st.org_id = %s ORDER BY ABS(nps_impact) DESC NULLS LAST LIMIT 1)
                   FROM surveys s
                   JOIN LATERAL (
                     SELECT * FROM survey_metric_snapshots sms2
                     WHERE sms2.survey_id = s.id AND sms2.org_id = %s
                     ORDER BY captured_at DESC LIMIT 1
                   ) sms ON TRUE
                   WHERE s.org_id = %s AND s.status IN ('active', 'paused')
                     AND s.deleted_at IS NULL""",
                (org_id, org_id, org_id, org_id, org_id),
            )
            await conn.commit()
```

---

## 6. Database Schema Design

### Question Type Schema — `surveys.questions` JSONB

The `surveys.questions` column stores an ordered array of question objects. Every question has a canonical `type` field. The pipeline uses this to know what signal to extract from `responses.answers`.

**Canonical question types:**

| Type | Signal extracted | Value shape | Maps to |
|------|-----------------|-------------|---------|
| `nps` | NPS score | Integer 0–10 | `responses.nps_score`, used in all NPS signals |
| `csat` | CSAT score | Numeric on survey-defined scale | `responses.csat_score` |
| `ces` | Customer Effort Score | Integer 1–7 (lower = less effort) | `responses.ces_score` |
| `rating` | Generic rating | Numeric, scale in question `scale_max` field | `responses.effort_score` (normalized) |
| `text` | Open text for ABSA | String | Added to ABSA input texts |
| `textarea` | Open text for ABSA | String | Added to ABSA input texts |
| `multiple_choice` | Selected option label | String or array | Not currently used in pipeline |
| `checkbox` | Selected option labels | Array of strings | Not currently used in pipeline |
| `scale` | Likert scale value | Integer | Treated as `rating` |

**Question object schema:**
```json
{
  "id": "q1",
  "type": "nps",
  "text": "How likely are you to recommend us?",
  "required": true,
  "scale_min": 0,
  "scale_max": 10,
  "scale_labels": {"0": "Not at all likely", "10": "Extremely likely"}
}
```

**`responses.answers` shape:**
```json
{
  "q1": 8,
  "q2": 4,
  "q3": "The checkout process was really confusing and I gave up twice.",
  "q4": 3
}
```

**Signal extraction rule:** `node_ingest` calls `extract_signals_from_response(answers, questions)` for every response row. This function iterates `questions`, finds each question's type, reads `answers[question.id]`, and returns a structured signal dict. If a question type is missing from `answers` (respondent skipped), the signal value is `None`. If no question of a given type exists in the survey, the signal is `None` for all responses.

**Survey capability flags (computed by `node_ingest`, stored in pipeline state):**
```python
has_nps:       bool  # at least one question with type='nps'
has_csat:      bool  # at least one question with type='csat'
has_ces:       bool  # at least one question with type='ces'
has_open_text: bool  # at least one question with type in ('text', 'textarea')
has_ratings:   bool  # at least one question with type in ('rating', 'scale')
```

These flags gate which pipeline nodes run and which Crystal tools are available.

### 6.1 `insights` Table

```
id              UUID        PRIMARY KEY
survey_id       UUID        NOT NULL, FK surveys(id) ON DELETE CASCADE
org_id          TEXT        NOT NULL
run_id          UUID        FK agent_runs(id) ON DELETE SET NULL
layer           TEXT        NOT NULL  -- 'descriptive'|'diagnostic'|'predictive'|'prescriptive'
category        TEXT        NOT NULL  -- 'metric.nps'|'metric.csat'|'voice.topic'|'trend.volume'|'action.prescriptive'
headline        TEXT        NOT NULL
narrative       TEXT        NOT NULL
metric_json     JSONB                 -- {name, value, ci_low, ci_high, unit, benchmark_context, ...}
trust_score     INT                   -- 0–100, computed by _build_trust()
trust_json      JSONB                 -- {statistical, coverage, consistency, grounding, sample_size, ...}
audit_json      JSONB                 -- {run_id, node_versions, model_used, eval_score}
insight_hash    TEXT                  -- sha256(survey_id+layer+category+headline) for dedup
user_state_json JSONB       DEFAULT '{}'  -- {thumbs, pinned, dismissed}
citations_json  JSONB       DEFAULT '[]'  -- [{response_id, quote, sentiment, relevance}]
priority        NUMERIC(3,2)          -- 0.0–1.0, set by node_narrate
time_window     TEXT        NOT NULL DEFAULT 'all_time'  -- 'all_time'|'last_30d'|'last_7d'
superseded_at   TIMESTAMPTZ           -- set when a newer run produces a replacement insight
generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()

UNIQUE INDEX insights_hash_window_unique ON insights(survey_id, insight_hash, time_window)
```

### 6.2 `survey_metric_snapshots` Table

```
id                   UUID        PRIMARY KEY
survey_id            UUID        NOT NULL, FK surveys(id) ON DELETE CASCADE
org_id               TEXT        NOT NULL
run_id               UUID        FK agent_runs(id) ON DELETE SET NULL
captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
response_count       INT
nps                  FLOAT
nps_ci_low           FLOAT
nps_ci_high          FLOAT
nps_n                INT
promoter_pct         FLOAT
detractor_pct        FLOAT
passive_pct          FLOAT
csat                 FLOAT
completion_rate      FLOAT
effort_score         FLOAT
response_velocity_7d FLOAT       -- responses submitted in last 7 days
anomaly_flag         BOOLEAN     NOT NULL DEFAULT FALSE

INDEX survey_metric_snapshots_survey_time ON (survey_id, captured_at DESC)
INDEX survey_metric_snapshots_org ON (org_id, captured_at DESC)
```

### 6.3 `survey_insight_checkpoints` Table

See Section 5.3 for the full DDL. This table tracks incremental state between pipeline runs, enabling the checkpoint system to detect what changed without running the full LangGraph DAG.

### Object Store — Checkpoint Report Blobs

**Purpose:** Store full checkpoint report payloads cheaply. Each blob is 100–500KB of JSON — too large to keep efficiently in Postgres across many surveys and many historical checkpoints.

**Provider:** GCS (`CHECKPOINT_BUCKET` env var) in production. Local filesystem (`/tmp/checkpoints/`) in dev (`AGENTS_ENV=dev`).

**Path convention:**
```
checkpoints/{org_id}/{survey_id}/{checkpoint_id}.json
```

**Blob schema (JSON):**
```json
{
  "schema_version": 1,
  "checkpoint_id": "uuid",
  "survey_id": "uuid",
  "org_id": "uuid",
  "created_at": "ISO8601",
  "response_count": 250,
  "insights": [
    {
      "id": "uuid",
      "layer": "descriptive",
      "category": "metric.nps",
      "headline": "...",
      "narrative": "...",
      "trust_score": 87,
      "trust_json": {},
      "audit_json": {},
      "metric_json": {},
      "citations_json": [],
      "priority": 100
    }
  ],
  "topics": [],
  "metrics": {
    "nps": 38, "nps_ci_low": 31, "nps_ci_high": 45,
    "csat": 4.1, "response_count": 250
  },
  "delta": {
    "nps_delta": -4.0,
    "prior_nps_delta": -6.0,
    "trend_direction": "declining",
    "trend_persistence": "confirmed",
    "nps_acceleration": 2.0,
    "topic_fingerprint_delta": {}
  },
  "provenance": {
    "response_ids": ["uuid"],
    "new_response_ids": ["uuid"],
    "responses_from": "ISO8601",
    "responses_to": "ISO8601"
  }
}
```

**Schema versioning:** Every blob includes `schema_version: int`. The current version is **1**. When the blob schema changes (new fields added, fields renamed, data shapes changed), the version is incremented and a migration function is added to the blob reader.

**Read-time migration pattern:** Blobs are never rewritten in object storage after creation. When a blob is fetched, `migrate_blob(blob)` upgrades it to the current version before the data is returned. This means old blobs work correctly with new code — the migration function adds defaults for new fields and handles renamed fields transparently.

**Version history:**
| Version | Changes | Date |
|---------|---------|------|
| 1 | Initial schema | 2026-05-20 |

When adding version 2+: add a row to this table, implement `_migrate_v1_to_v2(blob)` in the blob reader, and increment `CHECKPOINT_BLOB_SCHEMA_VERSION` in `constants.py`.

**Retention policy:** All checkpoint blobs are kept indefinitely. No lifecycle deletion policy. Storage cost at scale: ~200KB avg × 5 checkpoints/survey × 1000 surveys = ~1GB/year — negligible at any cloud provider's object storage pricing. If a survey is hard-deleted (admin operation), blobs are scheduled for deletion after 90 days via a tagged lifecycle rule.

**Access pattern:** The `insights` DB table serves CURRENT insights for the main page (fast). Historical checkpoint views fetch the full blob from object store via a signed URL generated by the backend. Signed URLs expire after 15 minutes.

**Env vars:**
- `CHECKPOINT_BUCKET` — GCS bucket name. Required in staging/prod. In dev (`AGENTS_ENV=dev`), blobs are written to local filesystem at `CHECKPOINT_LOCAL_PATH` (default `/tmp/checkpoints/`).
- `CHECKPOINT_LOCAL_PATH` — Local dev fallback path. Default `/tmp/checkpoints/`.
- `GCS_SERVICE_ACCOUNT_KEY` — Path to GCS service account JSON. Required in prod only.

### 6.4 `crystal_threads` Table

```
id               UUID        PRIMARY KEY
org_id           TEXT        NOT NULL
survey_id        TEXT
thread_key       TEXT        NOT NULL UNIQUE  -- "crystal:{org_id}:{survey_id}"
messages         JSONB       NOT NULL DEFAULT '[]'
                             -- [{role, content, created_at}], kept to last 40 messages (20 exchanges)
context_snapshot JSONB       NOT NULL DEFAULT '{}'
                             -- {insight_count, generated_at} — snapshot metadata at last update
created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()

INDEX crystal_threads_org ON (org_id)
```

### 6.5 `ai_operation_logs` Table — AI Operation Audit Trail

Every AI model call across all system flows (insight narration, Crystal chat, survey creation, evaluators, topic discovery) writes one row to this table. This enables:
- Per-org cost attribution and reporting
- Per-model latency monitoring
- Pipeline failure investigation (which step failed, why)
- Token budget tracking

```sql
CREATE TABLE IF NOT EXISTS ai_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id TEXT NOT NULL,
    survey_id UUID REFERENCES surveys(id) ON DELETE SET NULL,
    run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    checkpoint_id UUID REFERENCES survey_insight_checkpoints(id) ON DELETE SET NULL,

    -- What operation
    operation_type TEXT NOT NULL,
    -- Values: 'insight_narration' | 'insight_verification' | 'insight_evaluation'
    --         | 'topic_discovery' | 'absa' | 'crystal_chat' | 'survey_create'
    --         | 'metric_snapshot' | 'checkpoint_report' | 'report_evaluation'
    agent_name TEXT,               -- e.g. 'narrate_topic', 'crystal', 'creator'
    step_name TEXT,                -- pipeline node name: 'node_narrate', 'node_verify', etc.

    -- Which model
    model TEXT NOT NULL,
    provider TEXT,                 -- 'anthropic' | 'openrouter' | 'openai'

    -- Token accounting
    input_tokens INT,
    output_tokens INT,
    cached_tokens INT,             -- prompt cache hits (Anthropic cache_control)
    cost_usd NUMERIC(10, 6),

    -- Performance
    latency_ms INT,

    -- Outcome
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    quality_score INT,             -- for narration/evaluation steps: 0-100

    -- Context
    metadata JSONB,
    -- Varies by operation_type:
    -- insight_narration: {topic_name, cluster_size, layer, insight_id}
    -- crystal_chat: {session_id, turn_number, tool_calls_made}
    -- survey_create: {question_count, survey_type}
    -- absa: {texts_processed, cache_hits}

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON ai_operation_logs(org_id, created_at DESC);
CREATE INDEX ON ai_operation_logs(survey_id, created_at DESC);
CREATE INDEX ON ai_operation_logs(run_id);
CREATE INDEX ON ai_operation_logs(operation_type, created_at DESC);
CREATE INDEX ON ai_operation_logs(model, created_at DESC);
```

**Key query patterns:**
```sql
-- Cost per org this month
SELECT org_id, SUM(cost_usd) AS monthly_cost
FROM ai_operation_logs
WHERE created_at >= date_trunc('month', NOW())
GROUP BY org_id ORDER BY monthly_cost DESC;

-- Average latency by pipeline step
SELECT step_name, AVG(latency_ms), COUNT(*) AS call_count
FROM ai_operation_logs
WHERE operation_type = 'insight_narration'
GROUP BY step_name ORDER BY AVG(latency_ms) DESC;

-- Failure rate by model
SELECT model, COUNT(*) FILTER(WHERE NOT success) * 100.0 / COUNT(*) AS failure_pct
FROM ai_operation_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model;
```

### `notification_preferences` — Per-user, per-survey notification channel settings

```sql
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    survey_id UUID NOT NULL REFERENCES surveys(id),
    user_id TEXT NOT NULL,  -- Clerk user ID
    channels JSONB NOT NULL DEFAULT '{
        "analysis_ready":    {"in_app": true,  "email": true,  "push": false},
        "anomaly_detected":  {"in_app": true,  "email": true,  "push": false},
        "confirmed_trend":   {"in_app": true,  "email": false, "push": false},
        "issue_resolved":    {"in_app": true,  "email": false, "push": false},
        "analysis_failed":   {"in_app": true,  "email": true,  "push": false}
    }',
    push_interest BOOLEAN DEFAULT FALSE,  -- user clicked "notify me when push available"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, survey_id, user_id)
);

CREATE INDEX idx_notification_prefs_survey ON notification_preferences(survey_id, org_id);
```

**Implementation status: STUB**

Notification delivery is not implemented. The current implementation:
1. Stores user preferences in `notification_preferences`
2. Computes whether a notification should fire after each pipeline event
3. Writes the intent to `notification_events` (see below) — but does NOT deliver

Email and push delivery are wired up when infrastructure is selected. The `notification_events` table serves as the replay queue — no events are lost.

**Channel rules:**
- `in_app` cannot be set to `false` — it is enforced server-side and ignored if false is submitted
- `push` column stores the user's preference but delivery is a no-op until push infrastructure ships (`PUSH_NOTIFICATIONS_ENABLED=false` env flag)
- `push_interest = true` means the user clicked "Notify me when push is available" — used for push launch comms

**API endpoints:**
- `GET /api/surveys/:surveyId/notification-preferences` — returns current preferences for the authenticated user
- `PUT /api/surveys/:surveyId/notification-preferences` — updates preferences (partial update, JSONB merge)
- `POST /api/surveys/:surveyId/notification-preferences/push-interest` — sets `push_interest = true`

### `notification_events` — Notification intent log (delivery queue)

```sql
CREATE TABLE notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    survey_id UUID NOT NULL REFERENCES surveys(id),
    user_id TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'analysis_ready', 'anomaly_detected', 'confirmed_trend',
        'issue_resolved', 'analysis_failed'
    )),
    channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
    payload JSONB NOT NULL DEFAULT '{}',  -- title, subtitle, action_url, etc.
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'skipped', 'failed')),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_events_user ON notification_events(user_id, status, created_at DESC);
CREATE INDEX idx_notification_events_survey ON notification_events(survey_id, notification_type, created_at DESC);
```

**How it works:**
- After every pipeline event that could trigger a notification, the backend writes one row per `(user, channel)` pair where the user's preference is enabled
- `in_app` rows: status set to `delivered` immediately (frontend polls or reads via SSE)
- `email` rows: status stays `pending` until email infrastructure is wired; then a worker reads pending rows and delivers
- `push` rows: same pattern as email
- `skipped`: user preference was off for this channel at time of event

**In-app delivery:** The frontend polls `GET /api/notifications/pending` (or receives via SSE) to pick up unread `in_app` events. After display, calls `POST /api/notifications/:id/read` to mark delivered.

### 6.6 Query Patterns and Index Design

| Query | Table | Index | Purpose |
|-------|-------|-------|---------|
| Latest insights for a survey | `insights` | `(survey_id, insight_hash, time_window)` (UNIQUE) | Dedup + filter |
| Active insights for a survey | `insights` | `(survey_id, org_id, superseded_at)` | Null superseded_at filter |
| Metric history for a survey | `survey_metric_snapshots` | `(survey_id, captured_at DESC)` | Time-series read |
| Org-level metric history | `org_metric_snapshots` | `(org_id, captured_at DESC)` | Time-series read |
| Topics by survey | `survey_topics` | `(survey_id, org_id)` | Standard filter |
| Topics by urgency | `survey_topics` | `(survey_id, org_id, urgency_score DESC)` | Sorted queries |
| Verbatims by topic | `responses` | GIN `(ai_topics) WHERE ai_topics IS NOT NULL` | JSONB array search |
| Verbatims by sentiment | `responses` | `(survey_id, org_id, ai_sentiment)` | Equality filter |
| ANN topic assignment | `survey_topic_centroids` | IVFFlat `(centroid vector_cosine_ops)` lists=10 | pgvector ANN |
| Crystal thread lookup | `crystal_threads` | `UNIQUE (thread_key)` | ON CONFLICT upsert |

---

## 7. API Contract Design

### 7.1 Existing Endpoints (Implemented)

All routes in `backend/src/routes/insights.js`, mounted at `/api/insights`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/insights/org/metric-history?days=90` | Org-level KPI trend from `org_metric_snapshots` |
| `GET` | `/api/insights/:surveyId/list?layer=&time_window=&limit=` | Active insights for a survey |
| `POST` | `/api/insights/:surveyId/generate` | Trigger pipeline run (202 Accepted, fire-and-forget) |
| `GET` | `/api/insights/:surveyId/run-status` | Latest run status + stream_events array |
| `GET` | `/api/insights/:surveyId/stream` | SSE stream, polls run status every 3s |
| `POST` | `/api/insights/:id/feedback` | Update user_state_json (thumbs, pin, dismiss) |
| `GET` | `/api/insights/:surveyId/topics?sort=volume|urgency&window=` | Topics list with signals |
| `GET` | `/api/insights/:surveyId/drivers?window=` | NPS driver analysis |
| `GET` | `/api/insights/:surveyId/topics/:topicId/quotes` | Up to 20 verbatim quotes for a topic |
| `GET` | `/api/insights/:surveyId/topics/:topicId/detail?window=` | Trend series, co-occurring, subtopics |
| `GET` | `/api/insights/:surveyId/topics/:topicId/verbatims` | Paginated filtered verbatims |
| `PATCH` | `/api/insights/:surveyId/topics/:topicId` | Rename topic |
| `POST` | `/api/insights/:surveyId/crystal` | Stateful Crystal chat (single-call) |
| `GET` | `/api/insights/:surveyId/crystal/history` | Load conversation history |
| `DELETE` | `/api/insights/:surveyId/crystal/history` | Clear thread history |
| `POST` | `/api/insights/:surveyId/schedule` | Toggle scheduled generation |
| `GET` | `/api/insights/:surveyId/topics/hierarchy?window=` | Topics grouped by theme, with subtopics |
| `GET` | `/api/insights/:surveyId/metric-history?days=` | Per-survey KPI trend from snapshots |
| `GET` | `/api/insights/:surveyId/topic-trends?weeks=&topicId=` | Weekly topic health windows |
| `GET` | `/api/insights/:surveyId/insights` | Legacy compatibility endpoint |

### Checkpoint History API

**`GET /api/insights/:surveyId/checkpoints`**

Returns a list of completed full checkpoints for the survey. Used to populate the checkpoint history selector in the UI.

Response:
```json
{
  "checkpoints": [
    {
      "id": "uuid",
      "created_at": "2026-05-20T14:30:00Z",
      "response_count": 250,
      "nps_at_checkpoint": 38.0,
      "is_latest": true
    },
    {
      "id": "uuid",
      "created_at": "2026-04-12T09:15:00Z",
      "response_count": 212,
      "nps_at_checkpoint": 42.0,
      "is_latest": false
    }
  ]
}
```

Only returns rows from `survey_insight_checkpoints` where `run_type IN ('tier2_checkpoint', 'manual_refresh')` — not sub-tier runs.

**Retention:** All checkpoints are kept indefinitely. No automated deletion. The checkpoint selector shows every checkpoint for the survey, oldest first, with date and response count.

**`GET /api/insights/:surveyId/checkpoints/:checkpointId/report`**

Fetches the full checkpoint report blob from object storage and returns it. The backend:
1. Verifies the caller owns the survey (`org_id` check)
2. Looks up `report_url` from `survey_insight_checkpoints`
3. Generates a signed URL (GCS) or reads from local filesystem (dev)
4. Streams the blob JSON to the client

Response shape matches the blob schema defined in the Object Store section above.

**Caching:** The backend sets `Cache-Control: private, max-age=3600` on this response. Historical checkpoints are immutable — once written they never change.

**`GET /api/insights/:surveyId/list?checkpoint_id=:checkpointId`**

Existing endpoint extended with an optional `checkpoint_id` query parameter. When provided:
- Fetches insights from `insights` table WHERE `checkpoint_id = :checkpointId` (requires adding `checkpoint_id` FK to `insights` table — see migration note below)
- Returns the same shape as the base endpoint
- `page_state` is always `'insights_ready'` for historical checkpoints (no stale/generating states)
- `page_state_metadata.is_historical = true` is added so the frontend can show the historical banner

**Migration note:** Add `checkpoint_id UUID REFERENCES survey_insight_checkpoints(id)` to the `insights` table. Backfill by matching `insights.created_at` to the nearest `survey_insight_checkpoints.created_at` within a 1-hour window. New pipeline runs always write `checkpoint_id` on INSERT.

### 7.2 New Endpoints (Crystal ReAct Architecture)

New routes in `backend/src/routes/experience.js`, mounted at `/api/experience`.

---

**`POST /api/experience/:scope/crystal/stream`**

Server-Sent Events endpoint for Crystal ReAct loop. Shows tool calls live as Crystal works.

`:scope` is `survey/:surveyId` or `org`.

Request body:
```json
{
  "message": "What's driving my NPS down this week?",
  "time_window": "last_7d",
  "stream": true
}
```

Response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
```

SSE event sequence:
```
data: {"type":"thinking","step":0,"tool":"get_survey_overview","message":"Looking up survey overview..."}

data: {"type":"observation","step":0,"tool":"get_survey_overview","summary":"NPS 41, 156 responses, 3 anomalies"}

data: {"type":"thinking","step":1,"tool":"get_driver_analysis","message":"Analyzing NPS drivers..."}

data: {"type":"observation","step":1,"tool":"get_driver_analysis","summary":"Top pain: Billing (-19 NPS impact), Support Process (-12)"}

data: {"type":"synthesizing","message":"Generating answer..."}

data: {"type":"answer","answer":"Your NPS dropped 6 points this week...","citations":[],"suggestions":["What changed in the Billing topic this week?","Which customer segment saw the biggest NPS drop?"]}
```

---

**`GET /api/experience/org/overview`**

Org portfolio overview from `org_metric_snapshots` and `survey_topics` aggregated by `org_id`.

Response:
```json
{
  "portfolio_nps": 41,
  "portfolio_csat": 4.1,
  "active_surveys": 7,
  "total_responses": 1842,
  "top_urgent_topic": "Billing Process",
  "top_urgent_survey_id": "uuid",
  "top_driver_topic": "Support Response Time",
  "cross_survey_themes": {
    "Billing": {"survey_count": 4, "avg_sentiment": -0.42},
    "Onboarding": {"survey_count": 3, "avg_sentiment": 0.31}
  },
  "nps_trend": "improving",
  "has_unreviewed_anomaly": false,
  "last_checkpoint_at": "2026-05-20T14:23:00Z"
}
```

---

**`GET /api/experience/surveys/:surveyId/checkpoint-report?checkpoint_id=`**

Latest checkpoint report for a survey (or a specific checkpoint if `checkpoint_id` is provided). Returns all fields from `survey_insight_checkpoints` plus the full `topic_snapshot` JSON.

---

**`POST /api/experience/surveys/:surveyId/checkpoint`**

Manually trigger a checkpoint computation for a survey. Does not require a full pipeline run — computes checkpoint fields from current `survey_metric_snapshots` and `survey_topics` state. Returns the new `checkpoint_id`.

---

### 7.3 API Security Headers

All routes under `/api/insights` and `/api/experience` enforce:

- `requireAuth` middleware: validates Clerk JWT, sets `req.orgId` and `req.userId`
- Rate limiter (`backend/src/middleware/rateLimiter.js`): sliding-window per `req.orgId` using Redis (in-memory fallback for single-instance dev)
- Backend → agents service communication: `X-Internal-Key` header, value from `AGENTS_INTERNAL_KEY` env var. This key is never exposed to browser clients.

---

## 8. Model Selection and Routing

### 8.1 Model Routing Table

Model selection is managed in `agents/lib/models.py` via the `_ROUTING` dict. The `get_model(agent_name)` function returns the `ModelConfig` for the current `AGENTS_ENV`.

The table below specifies the explicit model assignment per operation, provider, rationale, and expected cost at production volume:

| Operation | Model | Provider | Rationale | Typical Cost |
|-----------|-------|----------|-----------|-------------|
| **Tier 1 Metric Snapshot** | No LLM | — | Pure SQL aggregation | $0 |
| **ABSA (sentiment per response)** | `google/gemma-3-27b-it` (dev) / `google/gemini-2.5-flash` (prod) | OpenRouter | Fast, cheap, sufficient for ABSA | ~$0.0001/text |
| **Topic Discovery** | `google/gemini-2.5-flash` | OpenRouter | Context window needed for 200 texts | ~$0.002/run |
| **NPS/CSAT Narration** | `claude-sonnet-4-6` | Anthropic | Structured output + prompt caching on system prompt | ~$0.005/insight |
| **Topic Narration (diagnostic/prescriptive)** | `claude-sonnet-4-6` | Anthropic | Specialist context block requires instruction-following | ~$0.008/insight |
| **Insight Verification** | `claude-haiku-4-5` | Anthropic | Fast claim-checking, not creative | ~$0.001/insight |
| **Report Evaluation (accuracy check)** | `claude-haiku-4-5` | Anthropic | Structured checklist, not creative | ~$0.002/report |
| **Checkpoint Delta Report (deep)** | `claude-sonnet-4-6` | Anthropic | Full delta synthesis, comparison writing | ~$0.015/report |
| **Checkpoint Report (anomaly path)** | `claude-opus-4-7` + thinking | Anthropic | Complex investigation, extended reasoning | ~$0.05/report |
| **Crystal Chat (survey scope)** | `google/gemini-2.5-flash` (dev) / `claude-sonnet-4-6` (prod) | OpenRouter/Anthropic | Balance of speed and quality | ~$0.003/turn |
| **Crystal Chat (org scope deep)** | `claude-opus-4-7` | Anthropic | Complex cross-survey reasoning | ~$0.01/turn |
| **Survey Creation** | `claude-opus-4-7` + thinking | Anthropic | Creative + structured, high quality demanded | ~$0.02/survey |

**Cross-vendor QC rule:** In staging and prod, the `qc` agent always uses a different provider from the `creator` agent. Creator uses DeepSeek (Chinese model), so QC uses Gemini (Google). This prevents self-confirmation bias — a model reviewing its own vendor's output rates it more favorably.

### 8.2 Cost Guard: `agents/lib/credits.py`

Per-run token budget enforced via `check_budget()`, called before every LLM invocation in `call_agent()`. The budget accumulates input + output tokens across all LLM calls within a single pipeline run.

```
MAX_TOKENS_PER_RUN = 120,000  (env: MAX_TOKENS_PER_RUN, default 120000)
```

This cap is set high enough for a full 50-response pipeline run:
- `insight_topics` call: up to 8,000 output tokens
- 5 × `insight_expert` narration calls: 5 × 2,000 = 10,000 tokens
- `insight_evaluate`: 2,500 tokens
- ABSA batches (30 texts × 10 per batch = 3 batches × ~1,000 tokens): 3,000 tokens
- Total estimate: ~24,000 output tokens + ~40,000 input tokens = ~64,000 total

When `MAX_TOKENS_PER_RUN` is exceeded, `BudgetExceededError` is raised. The pipeline catches this in `node_publish` and writes whatever insights were generated before the budget was hit, rather than failing the entire run.

### 8.3 Prompt Caching

All Anthropic calls use `cache_control: ephemeral` on the system prompt block via `agents/lib/anthropic_client.py`. For narration, where the same specialist context block is reused across 5-8 insights per survey run, this produces ~90% token savings on subsequent calls in the same run.

OpenRouter routes retain their own caching layer independent of the Anthropic SDK. The Crystal system prompt (the static portion including instructions and tool definitions) is a strong candidate for OpenRouter prompt caching — it accounts for approximately 2,000 tokens per Crystal call.

### 8.4 Extended Thinking

The `ModelConfig` dataclass in `agents/lib/models.py` includes a `use_thinking: bool` field, defaulting to `False`. This field is reserved for scenarios where Crystal needs to work through a complex multi-step analytical problem — for example, generating a full executive report across a portfolio of 10+ surveys. Extended thinking is not enabled in any current production route but is available as a model flag for future `Opus`-class models if they are added to the routing table.

---

## 9. Multi-Tenancy and Security

### 9.1 Defense in Depth

Tenant isolation is enforced at four independent layers. Failure of any one layer does not cause cross-tenant data leakage.

**Layer 1 — Authentication** (`backend/src/middleware/auth.js`):
All `/api/insights/*` and `/api/experience/*` routes pass through `requireAuth`. In production, the middleware validates the Clerk JWT and extracts `orgId` from the `org_id` claim. In `SKIP_AUTH=true` mode (local dev only), a hardcoded fallback org ID is used. No user input can override `req.orgId`.

**Layer 2 — Survey ownership check** (`getSurvey()` in `insights.js`):
Every route that operates on a specific survey calls `getSurvey(surveyId, req.orgId)`:
```sql
SELECT id, title, questions, org_id
FROM surveys
WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
```
Returns null (and the route returns 404) if the survey does not belong to the requesting org.

**Layer 3 — CrystalContext tenant scope** (`agents/crystal/context.py`):
The `CrystalContext` frozen dataclass carries `org_id` from the authenticated request. It is constructed in the backend route handler and passed immutably through the entire tool-use chain. No user input affects `org_id` after construction.

**Layer 4 — SQL-level scoping in every tool executor**:
Every SQL query in every tool executor includes `AND org_id = $ctx.org_id` and `AND survey_id = $ctx.survey_id`. This is enforced via code review policy: any new tool executor PR without org_id scoping is rejected.

### 9.2 Internal Service Authentication

Backend to agents service communication is authenticated via the `X-Internal-Key` header:

```javascript
// backend/src/routes/insights.js
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY
  || (process.env.NODE_ENV !== 'production'
    ? 'dev-internal-key-change-in-prod'
    : (() => { throw new Error('AGENTS_INTERNAL_KEY must be set in production'); })());
```

The agents service FastAPI app validates this key on all routes that accept external input. The key is a shared secret stored in environment variables — it is never committed to the codebase.

### 9.3 Rate Limiting

Rate limiting uses `backend/src/middleware/rateLimiter.js`, a sliding-window counter keyed on `orgId`. Configuration:

- **Redis-backed (production)**: Uses `REDIS_URL` env var + ioredis. Survives instance restarts. Works correctly across multiple backend instances.
- **In-memory fallback (dev/single-instance)**: Used when `REDIS_URL` is not set. Does not share state across processes.

Per-org limits (configurable, defaults):
- API reads (GET): 120 requests per minute
- API writes (POST, PATCH, DELETE): 30 requests per minute
- Crystal conversations: 10 requests per minute per org

### 9.4 Parameterized SQL Policy

All SQL queries throughout the codebase use parameterized values (`$1`, `$2` in Node.js pg; `%s` in Python psycopg3). String interpolation into SQL is explicitly prohibited by the project's `CLAUDE.md` and `backend/CLAUDE.md`. This prevents SQL injection regardless of user input content.

---

## 9.5 Centralized Configuration Constants

All threshold values, limit constants, and behavioral parameters that affect system behavior are declared in `agents/lib/constants.py`. This is a **mandatory rule**: no threshold constant may be hardcoded inline in pipeline, consumer, or agent code.

**Why this matters:**
- A constant in two places diverges when one is updated
- Environment-specific overrides (dev vs. prod) must be managed in one place
- The UX team and Applied Science need a single reference to understand what the system will and won't do at any data volume

**Constant categories and their owners:**

| Category | Constants | Owner | Change requires |
|---|---|---|---|
| Tier 1/2 trigger thresholds | `METRIC_SNAPSHOT_RESPONSE_THRESHOLD`, `CHECKPOINT_FULL_RESPONSE_THRESHOLD` | Engineering + Applied Science | Applied Science approval |
| Topic clustering | `TOPIC_ASSIGNMENT_THRESHOLD` | Applied Science | Applied Science approval + eval regression test |
| Confidence levels | `TOPIC_CONFIDENCE_LOW_MAX`, `TOPIC_CONFIDENCE_MEDIUM_MAX` | Applied Science | Applied Science approval |
| Trust score tiers | `TRUST_SCORE_LOW_MAX`, `TRUST_SCORE_MEDIUM_MAX` | Applied Science | Applied Science approval |
| Report quality gating | `REPORT_QUALITY_RENARRATE_THRESHOLD`, `REPORT_QUALITY_FAIL_THRESHOLD` | Applied Science | Applied Science approval |
| Crystal eval quality | `CRYSTAL_EVAL_PASS_THRESHOLD` | Applied Science | Applied Science approval |
| Crystal loop limits | `CRYSTAL_MAX_TOOL_TURNS`, `CRYSTAL_CONTEXT_COMPRESSION_THRESHOLD` | Engineering | Engineering review |
| Response loading | `INGEST_MAX_RESPONSES_BOOTSTRAP`, `INGEST_MAX_RESPONSES_INCREMENTAL`, `INGEST_MAX_RESPONSES_CAP` | Engineering | Engineering review |
| Manual refresh limits | `MANUAL_REFRESH_MIN_NEW_RESPONSES`, `MANUAL_REFRESH_MAX_DAILY` | Engineering | PM + Engineering review |
| Progressive sub-tier triggers | Progressive sub-tier triggers: 10 (First Voices), 40 (Early Signals), 100 (Growing Picture). Clear Picture = `CHECKPOINT_FULL_RESPONSE_THRESHOLD` (200). | Applied Science | Applied Science approval |

**UX contract**: The frontend never receives raw threshold numbers. Instead, the backend API returns semantic state values:
- `report_tier: 'early' | 'growing' | 'full' | 'deep'` (not response counts)
- `confidence_level: 'low' | 'medium' | 'high'` (not n values)
- `trust_indicator: 'low' | 'medium' | 'high'` (not scores 0-100)
- `page_state: InsightPageState` (not pipeline status codes)

The thresholds that determine these bucketed values live in `agents/lib/constants.py` and are never sent to the client. This decouples UX from science decisions: Applied Science can change `TOPIC_CONFIDENCE_LOW_MAX` from 2 to 3 without any frontend code change.

**Cumulative window rule:** `INGEST_MAX_RESPONSES_CAP` (default: 250) replaces `INGEST_MAX_RESPONSES_INCREMENTAL` (200) for all checkpoint runs. Every checkpoint loads ALL available responses up to the cap — this is a cumulative window, not a sliding window. The pipeline uses cached ABSA results for previously-scored responses, so repeat processing cost is minimal.

**Manual refresh gate:** The `GET /:surveyId/list` endpoint computes `can_manual_refresh: boolean` by comparing current `response_count` against the `response_count_at_run` stored on the last completed `agent_run`. If the difference exceeds `MANUAL_REFRESH_MIN_NEW_RESPONSES`, the flag is `true` and the frontend shows the "Generate new insight" button. Daily limit enforcement (`MANUAL_REFRESH_MAX_DAILY`) is tracked per `(survey_id, org_id, calendar_date)` in Redis with a 24-hour TTL key.

**Frontend constants**: `app/src/constants/limits.ts` maps API enum values to display configuration (badge text, icon, i18n key) but contains NO numeric thresholds. It imports from `app/src/locales/en.ts` for all user-visible strings.

## 9.6 Multi-Tenant Security Guarantee

**Rule: Every database query that touches user data MUST include `org_id` in the WHERE clause. No exceptions in production.**

This is the single most important security invariant in the system. Every table that holds org-specific data has an `org_id` column. A query that omits the `org_id` check will return or modify data from any org — this is a data leak or privilege escalation.

**Enforcement:**
- Backend (`backend/src/`): `requireAuth` middleware sets `req.orgId` from the verified Clerk token. Any route handler that queries user data must use `req.orgId`. Routes without auth use `SKIP_AUTH=true` (dev-only) which falls back to `'dev_org'`.
- Agents service (`agents/`): Every pipeline function receives `org_id` as a required parameter. `db.check_survey_access(survey_id, org_id)` is called at the start of `node_ingest` before any data is loaded — if the survey does not belong to the org, the run is aborted.
- Crystal tools: Every tool executor receives `ctx.org_id` and includes it in every query. The `execute_*` functions are not callable without a valid org context.

**Dev exception:** When `SKIP_AUTH=true` AND `AGENTS_ENV=dev`, the system accepts requests without a valid token and uses `org_id = 'dev_org'` as the default. This exception is only available when BOTH flags are set. It is never available in staging or production — both environments enforce `SKIP_AUTH=false` at startup.

```python
# agents/lib/db.py
async def check_survey_access(survey_id: str, org_id: str, conn) -> dict:
    """
    Verifies the survey belongs to the org. Raises PermissionError if not.
    Called at the start of every pipeline run — before any data is loaded.
    Dev exception: org_id='dev_org' bypasses the check when AGENTS_ENV=dev.
    """
    if os.getenv("AGENTS_ENV", "dev") == "dev" and org_id == "dev_org":
        row = await conn.fetchrow("SELECT id, org_id FROM surveys WHERE id = $1", survey_id)
    else:
        row = await conn.fetchrow(
            "SELECT id, org_id FROM surveys WHERE id = $1 AND org_id = $2",
            survey_id, org_id
        )
    if not row:
        raise PermissionError(f"Survey {survey_id} not found for org {org_id}")
    return dict(row)
```

**Code review checklist:** Before merging any PR that adds a new route or DB query:
- [ ] Does the query include `AND org_id = $N`?
- [ ] Is `org_id` sourced from `req.orgId` (verified token), not from the request body or URL params?
- [ ] Does any new pipeline function receive and use `org_id`?

---

## 10. Observability

### 10.1 Prometheus Metrics

Defined in `agents/lib/metrics.py`, exposed at `/metrics` on the agents service. Scraped by the Prometheus instance in `docker-compose.yml`.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `agent_calls_total` | Counter | `agent`, `model`, `status` | Total LLM invocations (status: success/error/timeout/budget_exceeded) |
| `agent_duration_seconds` | Histogram | `agent`, `model` | Per-call latency (buckets: 0.5, 1, 2, 5, 10, 20, 30, 60s) |
| `agent_tokens_total` | Counter | `agent`, `model`, `direction` | Token consumption (direction: input/output) |
| `agent_cost_usd_total` | Counter | `agent`, `model` | Cumulative estimated USD cost |
| `orchestration_runs_total` | Counter | `run_type`, `status` | Pipeline and orchestration runs |
| `orchestration_revision_count` | Histogram | `run_type` | Creator→QC revision loop depth |
| `orchestration_qc_score` | Histogram | `run_type` | QC score distribution (0–10) |
| `circuit_breaker_state` | Gauge | `name` | CB state: 0=closed, 1=open, 2=half-open |

### 10.2 Structured Logging

`agents/lib/logger.py` configures structlog with JSON output. Every log line includes `run_id` and `org_id` injected via `set_trace_context()` at the start of each pipeline run. This allows filtering all logs for a single pipeline run by `run_id` in Loki/Grafana.

Key log events emitted by the pipeline:
- `node_complete:ingest`: `response_count`, `new_response_count`, `is_bootstrap`, `industry`
- `node_complete:embed`: `embedded_count`, `has_embeddings`
- `node_complete:absa`: `analyzed_count`, `cached_count`
- `node_complete:cluster`: `cluster_count`, `mode` (bootstrap/incremental/fallback)
- `node_complete:topics`: `topic_count`, `new_topics`, `llm_calls_made`, `llm_calls_skipped`
- `node_complete:narrate`: `insight_count`, `cache_hit`
- `crystal_response`: `survey_id`, `org_id`, `insight_count`, `final_score`
- `crystal_eval`: `attempt`, `score`, `grounded`, `answers_question`, `passes`
- `crystal_hallucinated_ids_stripped`: `hallucinated` (stripped IDs)

### 10.3 Circuit Breakers

`agents/lib/circuit_breaker.py` implements an async context-manager circuit breaker.

States: `CLOSED` (normal) → `OPEN` (failing fast) → `HALF_OPEN` (testing recovery) → `CLOSED`.

Default configuration:
- Failure threshold: 3 (staging/prod: 5)
- Recovery timeout: 30s (staging/prod: 60s)
- Success threshold in HALF_OPEN: 1

**Two breakers in use:**

1. `openrouter_breaker` (in `agents/lib/openrouter.py`): Wraps all `call_agent()` and `_call_with_backoff()` calls. HTTP 429 (rate limit) does not count as a failure — only real errors (5xx, timeout, parse failure) do.

2. ABSA calls in `node_absa` intentionally bypass `_call_with_backoff()` and use `_retry_loop()` directly. This prevents ABSA batch failures from tripping the shared circuit breaker and blocking narrate/verify calls for the whole pipeline run. ABSA failures fall back to heuristics gracefully.

Circuit breaker state is published to Prometheus via `circuit_breaker_state` gauge, enabling Grafana alerts when the circuit is open.

### 10.4 Tier 2 Checkpoint Failure Monitoring

The Tier 2 full checkpoint run (the most expensive and consequential pipeline operation) requires dedicated failure monitoring beyond the generic circuit breaker. A failed Tier 2 run means users never see their full analysis — this must be detectable and recoverable.

**Failure definition:** An `agent_runs` row with `status = 'failed'` AND `run_type = 'tier2_checkpoint'` (or `'manual_refresh'`).

**Prometheus alert metric:**
```
checkpoint_runs_failed_total — Counter, labels: org_id, survey_id, run_type, failure_reason
```
This counter already exists in the `orchestration_runs_total` metric family (Section 10.1) but should have a dedicated alert rule:

```yaml
# Grafana / Prometheus alert rule
- alert: CheckpointRunFailed
  expr: increase(checkpoint_runs_failed_total[10m]) > 0
  for: 0m
  labels:
    severity: warning
  annotations:
    summary: "Tier 2 checkpoint failed for survey {{ $labels.survey_id }}"
    description: "A full insight pipeline run failed. User-facing state: pipeline_failed. Check agent logs with run_id for root cause."
```

**Retry policy:** The stream consumer does NOT auto-retry a failed Tier 2 run immediately (to avoid hammering a failing LLM or DB). Retry is user-driven (via the "Retry" button in `pipeline_failed` UI state). However, the **scheduler** picks up failed runs older than 1 hour and retries them automatically up to 2 times:

```python
# In agents/scheduler.py — failed run recovery
failed_runs = await db.fetch_failed_runs_older_than(hours=1)
for run in failed_runs:
    if run["retry_count"] < 2:
        await trigger_insight_pipeline(
            survey_id=run["survey_id"],
            org_id=run["org_id"],
            run_type=run["run_type"],
            retry_of=run["id"],
        )
```

**`agent_runs` columns required for retry tracking:**
- `retry_count INTEGER DEFAULT 0` — incremented each retry attempt
- `retry_of UUID REFERENCES agent_runs(id)` — links retry to the original failed run
- `failure_reason TEXT` — top-level error category: `llm_error`, `db_error`, `budget_exceeded`, `timeout`, `unknown`
- `failed_at TIMESTAMPTZ` — when the run transitioned to `failed`
- `last_heartbeat_at TIMESTAMPTZ` — updated after each pipeline node completes
- `max_run_duration_minutes INT DEFAULT 30` — hard timeout before zombie detection

```sql
CREATE INDEX idx_agent_runs_zombie ON agent_runs(status, last_heartbeat_at, created_at)
    WHERE status = 'running';
```

**Zombie run detection:** The scheduler runs a zombie sweep every 5 minutes. A run is classified as a zombie when ANY of these conditions are true:
1. `status = 'running'` AND `last_heartbeat_at < NOW() - INTERVAL '5 minutes'` (heartbeat stale)
2. `status = 'running'` AND `created_at < NOW() - INTERVAL '30 minutes'` (absolute hard timeout)

Zombie runs are marked `status = 'failed'`, `failure_reason = 'timeout'`, and added to the retry queue (up to 2 retries, same as other failures). A `run_id` is emitted to the structured log with event `zombie_run_detected`.

**Heartbeat update:** `node_ingest` → `node_absa` → `node_embed` → `node_cluster` → `node_topics` → `node_narrate` → `node_verify` → `node_evaluate_delta` → `node_publish` each write `last_heartbeat_at = NOW()` to the `agent_runs` row immediately on node start. This gives a per-node resolution of ~2–10 minutes between heartbeats for normal runs.

**Log event on failure:**
```python
logger.error({
    "event": "checkpoint_run_failed",
    "run_id": run_id,
    "survey_id": survey_id,
    "org_id": org_id,
    "run_type": run_type,
    "failure_reason": failure_reason,
    "retry_count": retry_count,
    "traceback": traceback.format_exc(),
})
```

**UI contract:** The `pipeline_failed` page state (defined in doc 03) shows the existing report and a "Retry" button. The button calls `POST /api/insights/:surveyId/trigger` with `{ force: true }`. This creates a new `agent_runs` row (not a retry of the old one — a fresh run). The frontend does not need to know about `retry_count` or `retry_of`.

### 10.5 Grafana Dashboard Recommendations

Three dashboard panels to monitor Crystal and the pipeline:

**Panel 1: Pipeline Latency Breakdown**
- X axis: time (1h buckets)
- Y axis: duration_seconds P95
- Series: one line per node (ingest, embed, absa, cluster, topics, narrate, verify, publish)
- Alert: any node P95 > 30s for 5 consecutive minutes

**Panel 2: Cost Per Run**
- X axis: time (1h buckets)
- Y axis: agent_cost_usd_total rate
- Series: one line per agent (crystal, insight_topics, insight_narrate, insight_expert, insight_verify)
- Alert: daily cost per org > MAX_DAILY_SPEND_USD

**Panel 3: Crystal Response Quality Score**
- X axis: time (1h buckets)
- Y axis: crystal_run_complete.quality_score (P50, P25)
- Alert: P25 < 65 for 1 hour (model quality regression)

### 10.6 Operational Audit Log (`ai_operation_logs`)

Beyond Prometheus metrics (which are ephemeral), the `ai_operation_logs` table provides durable operational history across restarts and redeployments. See Section 6.5 for the full DDL.

- **Grafana dashboard — Cost by org**: `SELECT org_id, DATE_TRUNC('day', created_at), SUM(cost_usd)` → stacked bar chart for spend attribution
- **Grafana dashboard — Pipeline latency**: `SELECT step_name, PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)` → P95 latency per step
- **Grafana dashboard — Quality trend**: `SELECT DATE_TRUNC('day', created_at), AVG(quality_score) WHERE operation_type = 'insight_narration'` → quality over time
- **Alert — Failure spike**: `COUNT(*) WHERE success=FALSE AND created_at > NOW()-INTERVAL '15min' > 10` → PagerDuty alert

All insight pipeline nodes emit to `ai_operation_logs` by wrapping their LLM calls in a `@log_operation(operation_type='...')` decorator defined in `agents/lib/logger.py`.

**Gateway-level coverage — all agents automatically logged**

The `ai_operation_logs` write is implemented at the two gateway functions — not in each agent. This ensures 100% coverage without per-agent maintenance:

1. `call_agent()` in `agents/lib/openrouter.py` — add optional `op_context: dict | None` parameter. When provided, writes one row to `ai_operation_logs` after every successful or failed LLM call.

2. `call_agent_anthropic()` in `agents/lib/anthropic_client.py` — same optional `op_context` parameter.

**Agents covered automatically:**

| Subsystem | Agent file | operation_type values |
|---|---|---|
| Insight pipeline | `insight_experts.py` (9 calls) | `insight_narration`, `insight_verification`, `insight_evaluation`, `crystal_eval` |
| Conversational | `crystal.py` | `crystal_chat` |
| Conversational | `copilot.py` | `copilot` |
| Survey creation | `creator.py` | `survey_create` |
| Survey quality | `qc.py` | `qc` |
| Survey compliance | `compliance.py` | `compliance` |
| Survey refinement | `refiner.py` | `survey_refine` |
| Recommendations | `recommender.py` | `recommendation` |
| Skip logic | `skip_logic.py` | `skip_logic` |
| Test data | `response_generator.py` | `response_gen` |

Total: 10 agent files, 19+ call sites — all covered by two gateway changes.

**Callers that don't have `org_id` available** (e.g., creator.py early in the flow) can pass `op_context={"operation_type": "survey_create"}` — the row is still written with NULL org_id/survey_id, queryable by `agent_name` or `operation_type`.

**Coverage gap note**: Topic signal computation (`compute_full_topic_signals()` in `agents/lib/topic_signals.py`) is a pure-Python function with no LLM calls — it does not need `ai_operation_logs`. Its execution time is tracked via the `agent_duration_seconds` Prometheus metric on the pipeline run as a whole.

---

## 11. Deployment Architecture

### 11.1 Three Services

```
┌────────────────────────────────────────────────────────────────────┐
│  app/               → Firebase Hosting                             │
│  React + Vite static build                                         │
│  Deploy: firebase deploy (from backend/)                           │
│  CDN: Firebase CDN (GCP)                                           │
│  Auth: Clerk.js (browser-side JWT)                                 │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  backend/           → Fly.io (Node.js)                             │
│  Express API on :3001                                              │
│  Config: backend/Dockerfile, fly.toml                              │
│  Secrets: DATABASE_URL, REDIS_URL, AGENTS_URL,                     │
│           AGENTS_INTERNAL_KEY, OPENROUTER_API_KEY                  │
│  Scaling: stateless — horizontal scale with Fly machines           │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  agents/            → Fly.io (Python FastAPI)                      │
│  FastAPI on :8001                                                  │
│  Background tasks: response_stream_consumer, scheduler             │
│  Secrets: AGENTS_DB_DSN, OPENROUTER_API_KEY, AGENTS_INTERNAL_KEY  │
│  Scaling: consumer group — multiple instances can share the        │
│           Redis stream consumer group                              │
└────────────────────────────────────────────────────────────────────┘
```

### 11.2 Redis

- **Local dev**: Redis via Docker Compose (`docker/docker-compose.yml`), port 6379
- **Production**: Upstash (serverless, billed per command) or Fly Redis (persistent, low latency to Fly agents service)

Usage patterns:
- `insight_events` stream: low-volume writes (one XADD per response submission), moderate reads (consumer batch of 50 every 5s)
- Rate limiter: moderate-volume reads/writes (one ZRANGEBYSCORE + ZADD per request)
- Future: Crystal session cache (key-value, 5min TTL on tool results)

### 11.3 Postgres

- **Local dev**: Docker Compose Postgres (`docker/docker-compose.yml`), port 5432
- **Production**: Supabase (managed, daily backups, pgvector extension pre-installed) or Fly Postgres

The `ensure_schema()` function in `agents/lib/db.py` and `ensureTopicsTables()` in `backend/src/routes/insights.js` run idempotent DDL guards at startup, ensuring the schema is always current even if migrations haven't been run. This is a development convenience — production uses the SQL migrations in `supabase/migrations/`.

### 11.4 Agent Run Lifecycle

```
submitted (agent_runs.status = 'running')
    │
    ▼
Pipeline nodes execute sequentially
    │
    ├── node fails with exception → status = 'failed', error_log = traceback
    ├── budget exceeded → status = 'completed' (partial), warning logged
    └── all nodes succeed → status = 'completed'
                                │
                                ▼
                       Frontend polls GET /run-status
                       or holds SSE connection open
```

Stale run recovery: The scheduler calls `_recover_stale_runs()` on every tick, marking any `agent_runs` row that has been in `running` status for > 10 minutes as `cancelled`. The backend `POST /generate` endpoint also marks stale runs before checking for an active run, so a crashed run never permanently blocks re-triggering.

---

## 12. Scalability Considerations

### 12.1 What Scales Horizontally

**Backend (Node.js)**: Stateless Express service. Rate limiter uses Redis as shared store, so multiple instances share rate limit counters correctly. No in-process caching of user-specific data. Scales horizontally by adding Fly machines.

**Agents service (Python FastAPI)**: The FastAPI server itself is stateless — each HTTP request creates its own execution context. The `InsightState` TypedDict is never shared between requests. Multiple instances can serve Crystal conversations and pipeline requests independently.

**Redis stream consumer**: Multiple agents service instances can participate in the same Redis consumer group. Each consumer reads a different partition of the stream. The `_pending_triggers` set (currently in-process memory) needs to be moved to Redis (a Redis SET with short TTL) when running multiple consumer instances to prevent duplicate triggers.

### 12.2 What Does Not Scale Horizontally Without Changes

**In-memory rate limiter**: The `rateLimiter.js` in-memory fallback is a single-process counter. It does not share state across multiple backend instances. This is acceptable for single-instance deployments (dev, small prod) but requires `REDIS_URL` in production multi-instance deployments.

**Circuit breaker state**: `agents/lib/circuit_breaker.py` maintains circuit state as instance-level Python attributes. Two agents service instances have independent circuit breaker states. If OpenRouter is failing, one instance may have an OPEN circuit while another is still CLOSED and hammering the failing API. Mitigation: store circuit breaker state in Redis for shared state across instances (planned but not yet implemented).

**`_batches` dict in stream consumer**: The in-memory batch accumulator in `response_stream.py` is per-process. If two consumer instances are running, each accumulates half the events and neither may reach the threshold. Resolution: use Redis INCR/EXPIRE to implement the batch counter as a shared Redis key.

### 12.3 Postgres at Scale

The current schema handles well up to approximately:

- 1M responses (estimated): The `responses.ai_topics` GIN index supports JSONB array searches efficiently. Query times under 100ms for verbatim lookups.
- 100K insights: The `insights` table with `(survey_id, insight_hash, time_window)` unique index handles dedup queries efficiently.
- 10M `survey_metric_snapshots` rows: The `(survey_id, captured_at DESC)` index keeps time-series queries fast. At this scale, consider TimescaleDB hypertables for automatic partitioning by time.

**When to add read replicas**: Add a read replica when the `survey_metric_snapshots` and `survey_topics` queries (the most read-heavy endpoints) exceed 50ms P95 latency. Route all Crystal tool read queries to the replica; write queries (pipeline outputs) go to the primary.

**When to add TimescaleDB**: When `survey_metric_snapshots` exceeds 10M rows (~200 orgs × 7 active surveys × 365 days × 2 runs/day = 1M rows/year), convert to a TimescaleDB hypertable with `captured_at` as the partitioning column. This provides automatic chunk pruning and continuous aggregates for trend queries.

### 12.4 LangGraph: Stateless Graph Design

Each pipeline run instantiates a fresh `InsightState` TypedDict. LangGraph's `StateGraph` compiles to a set of Python async functions. There is no persistent graph state between runs — no global variables, no shared queues. This means:

- Multiple pipeline runs for different surveys can execute concurrently on the same agents service instance (bounded by the asyncio event loop and the `asyncio.Semaphore(3)` in `node_narrate`)
- Pipeline runs do not interfere with each other
- Horizontal scaling is additive: N instances can handle N × max_concurrent_runs simultaneously

The primary concurrency constraint is the OpenRouter rate limit, managed by the circuit breaker and per-env `_MAX_HTTP_ATTEMPTS` configuration in `agents/lib/openrouter.py`.

---

*Crystal Technical Architecture — Experient Internal*
*Document series: Crystal Research — 05 of 7*
*Questions: Staff Engineering*
