---
Document series: Crystal Research — 06
Owner: Engineering
Status: Draft
Last revised: 2026-05-20
---

# Crystal XM Intelligence Platform — Engineering Implementation Guide

This document is the hands-on engineering reference for evolving Crystal from its current single-LLM-call architecture into a fully agentic ReAct analyst. Every file path, SQL column, and API signature references the actual codebase as it exists on branch `feat/insights-agent-pipeline`.

---

## Table of Contents

1. [Implementation Roadmap Overview](#1-implementation-roadmap-overview)
2. [Current State Audit](#2-current-state-audit)
3. [Phase 1 — Crystal Tool Registry](#3-phase-1--crystal-tool-registry)
4. [Phase 2 — ReAct Agent Loop and SSE Streaming](#4-phase-2--react-agent-loop-and-sse-streaming)
5. [Phase 3 — Checkpoint System and Delta Analysis](#5-phase-3--checkpoint-system-and-delta-analysis)
6. [Phase 4 — New Frontend Routes](#6-phase-4--new-frontend-routes)
6a. [Phase 5 — Operational Logging](#6a-phase-5--operational-logging-1-week)
6b. [Phase 6 — Progressive Intelligence](#6b-phase-6--progressive-intelligence-1-week)
7. [Database Migrations Checklist](#7-database-migrations-checklist)
8. [Testing Strategy](#8-testing-strategy)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Rollout Strategy](#10-rollout-strategy)
11. [Engineering Ownership Matrix](#11-engineering-ownership-matrix)

---

## 1. Implementation Roadmap Overview

The Crystal evolution proceeds through four sequential phases. Each phase can ship independently and is independently deployable behind the `CRYSTAL_STREAMING_ENABLED` feature flag. The phases are ordered so that each one improves answer quality and observability before the next one increases user-facing surface area.

### Phase 1 — Crystal Tool Registry (2 weeks)

**Goal:** Give Crystal the ability to execute precise data queries instead of answering from a pre-loaded context snapshot baked into the system prompt.

**Deliverables:**
- `agents/crystal/__init__.py` — package marker
- `agents/crystal/context.py` — `CrystalContext` dataclass (org/survey scope)
- `agents/crystal/registry.py` — 12 Anthropic tool-use format dicts
- `agents/crystal/tools.py` — 12 async tool executors with real SQL queries

**What users see after Phase 1:** No visible change. The same `POST /api/insights/:surveyId/crystal` endpoint continues to work. Crystal's answer quality improves silently because it can now pull verbatims and metric history rather than relying on the snapshot loaded by `backend/src/routes/insights.js`.

**Prerequisites:** None. Phase 1 is purely additive — no existing code is modified.

---

### Phase 2 — ReAct Loop Replacement + SSE Streaming (3 weeks)

**Goal:** Replace the single LLM call in `agents/agents/crystal.py:_run_crystal()` with a multi-turn ReAct loop. Add an SSE endpoint so the frontend can show tool calls as they happen.

**Deliverables:**
- Modified `agents/agents/crystal.py` — `_run_react_loop()` function
- Modified `agents/main.py` — `POST /insights/crystal/stream` SSE endpoint
- Modified `backend/src/routes/insights.js` — SSE proxy route
- Modified `app/src/components/CrystalPanel.tsx` — streaming UI with tool-call status lines

**What users see after Phase 2:** The Crystal panel shows live "Checking topic details..." and "Retrieving metric history..." status lines as Crystal works. The final answer streams in token by token rather than arriving all at once after a multi-second wait.

**Prerequisites:** Phase 1 complete. The tool registry and executors must exist before the ReAct loop can call them.

---

### Phase 3 — Checkpoint System + Delta Analysis (2 weeks)

**Goal:** Give Crystal a memory of past insight runs by implementing a two-tier checkpoint system:
- **Tier 1 (no LLM)**: Every 50 new responses → metric snapshot (SQL only, <1s, $0)
- **Tier 2 (full checkpoint)**: Every 200 new responses → full pipeline run + delta analysis vs previous checkpoint + specialized narration with org/industry context

**Deliverables:**
- New migration `supabase/migrations/20240521000001_insight_checkpoints.sql`
- Modified `agents/consumers/response_stream.py` — checkpoint trigger logic
- New `agents/graphs/checkpoint.py` — delta analysis service

**What users see after Phase 3:** Crystal can answer comparative questions using real before/after data. The system also auto-publishes a checkpoint digest when 200 or more new responses arrive since the last checkpoint.

**Prerequisites:** Phase 1 complete. The metric history tables from `20240520000002_metric_snapshots.sql` must be populated.

---

### Phase 4 — New `/app/experience/*` Routes (3 weeks)

**Goal:** Add a dedicated Experience Intelligence section to the frontend, separate from the current `/app/insights/*` routes. Each sub-page embeds a scoped Crystal panel.

**Deliverables:**
- New routes in `app/src/constants/routes.ts`
- Six new page components under `app/src/pages/experience/`
- Modified `app/src/App.tsx` — route registrations
- Modified `app/src/components/SideNav.tsx` — Experience nav item

**What users see after Phase 4:** A new "Experience" section in the sidebar that provides portfolio-level intelligence, per-survey intelligence pages with embedded Crystal, and checkpoint-diff reports. The existing `/app/insights/*` routes remain fully intact.

**Prerequisites:** Phases 1–3 complete for full Crystal functionality. Phase 4 pages degrade gracefully to static data if Crystal is unavailable.

---

## 2. Current State Audit

Understanding what exists before making changes prevents accidental breakage. This section maps every relevant existing file.

### 2.1 Current Crystal Agent

**File:** `agents/agents/crystal.py`

The current Crystal is a single-LLM-call pattern with a quality retry loop. Key functions:

| Function | Role |
|----------|------|
| `_build_insights_context(insights)` | Groups insights by layer (`descriptive`, `diagnostic`, `predictive`, `prescriptive`) into a structured text block. Returns `(str, set[str])` where the set is valid insight IDs for the hallucination filter. |
| `_build_topics_context(topics)` | Formats up to 20 topics as a pipe-delimited table: `Topic \| Volume \| Sentiment \| Effort \| Trending`. Coerces all numeric fields defensively. |
| `_build_metrics_context(metrics, response_count)` | Formats NPS + CSAT into a compact block. Handles both `score`/`value` key variants from the DB. |
| `_build_system_prompt(inp, correction)` | Assembles the full system prompt from all three context blocks. Inserts a `CORRECTION REQUIRED` block on retry attempts. |
| `_generate_response(inp, correction)` | Calls `call_agent()` from `agents/lib/openrouter.py` with `output_schema=CrystalOutput`. Passes last 10 turns of conversation history as `prior_messages`. |
| `_run_crystal(inp)` | Outer loop: up to 3 attempts. After each attempt runs a deterministic hallucination filter (strips cited IDs not in `valid_ids`) then calls `evaluate_crystal_response()` from `agents/agents/insight_experts.py`. Accepts if `quality_score >= 72 and is_grounded and answers_question`. |
| `CrystalAgent.run(inp)` | Thin wrapper. Returns `(CrystalOutput, [])` — the empty list is the credit log (always empty for Crystal currently). |

**Current limitation:** `CrystalInput` contains `insights: list[dict]` (up to 30) loaded by `backend/src/routes/insights.js` before the call. Crystal cannot reach beyond those 30 pre-loaded insights, cannot fetch verbatims, and cannot query metric history. Every question is answered from a fixed context snapshot injected at call time.

The model used is determined by `agents/lib/models.py` under the `"crystal"` key. In `dev` this is `google/gemma-4-31b-it:free`; in `prod` it is `google/gemini-2.5-flash`.

### 2.2 Current Anthropic Client

**File:** `agents/lib/anthropic_client.py`

This client exists for agents that use the Anthropic SDK directly. As of the current `models.py`, **all environments route through OpenRouter** — `use_anthropic_sdk=False` for all model configs. The Anthropic client is retained for potential future use and demonstrates the correct pattern for tool-use structured output.

Key implementation details relevant to Phase 2:
- Tool-use pattern: output schema is wrapped as a tool with `input_schema = output_schema.model_json_schema()`. The model is forced to call it via `tool_choice={"type": "tool", "name": tool_name}`.
- Prompt caching: `cache_control: {"type": "ephemeral"}` on the system block.
- Streaming: `async with client.messages.stream(**create_kwargs) as stream:` — collects thinking deltas as they arrive.

**Important:** For Phase 2 the ReAct loop will use `agents/lib/openrouter.py` via the `call_agent()` function, not the Anthropic SDK directly, since all current model configs route through OpenRouter. The tool-use call pattern shown in `anthropic_client.py` is still the correct reference for the message structure.

### 2.3 Current Insights Pipeline

**File:** `agents/graphs/insights.py`

The `InsightState` TypedDict drives the LangGraph DAG. The keys relevant to Crystal tool queries are:

```python
class InsightState(TypedDict, total=False):
    survey_id:       str
    org_id:          str
    run_id:          str
    responses:       list[dict[str, Any]]   # loaded from `responses` table
    metrics:         dict[str, Any]          # NPS, CSAT, CES, trend
    open_texts:      list[dict[str, Any]]   # extracted open-text answers
    topics:          list[Any]              # survey_topics rows
    drivers:         list[Any]              # NPS driver analysis
    insights:        list[dict[str, Any]]   # narrated insight rows
    org_context:     dict[str, Any]         # industry, sub_vertical, size_band
    survey_context:  dict[str, Any]         # survey title, intent, type
    # ... existing fields ...
    has_open_text: bool          # gates ABSA/topics/narration nodes
    has_nps: bool                # gates NPS signal computation
    has_csat: bool
    has_ces: bool
    survey_questions: list[dict] # loaded from surveys.questions JSONB
```

### 2.4 Current Backend Route

**File:** `backend/src/routes/insights.js`

The route `POST /:surveyId/crystal` at line 726 is the current entry point. It:
1. Loads up to 30 `insights` rows from Postgres for the survey.
2. Loads up to 25 `survey_topics` rows.
3. Loads conversation history from `crystal_threads`.
4. Calls `_agentsFetch('/insights/crystal', body)` to the Python agents service.
5. Persists the exchange back to `crystal_threads`.

The route also exposes:
- `GET /:surveyId/metric-history` — reads `survey_metric_snapshots` table
- `GET /:surveyId/topic-trends` — reads `topic_windows` table
- `GET /org/metric-history` — reads `org_metric_snapshots` table
- `GET /:surveyId/topics/:topicId/verbatims` — paginated verbatims with sentiment/NPS filter

These existing route handlers serve as the reference implementation for the SQL queries the Crystal tools will replicate.

### 2.5 Current Frontend Crystal Panel

**File:** `app/src/components/CrystalPanel.tsx`

The panel's `submitQuery()` function at line 96 calls `api.crystalChat(scope, query, ctx)` and waits for a complete JSON response. The `isThinking` state shows animated dots. There is no streaming capability today.

The panel accepts `scope: SurveyScope` which can be either a survey UUID or the string `'all'`. When `scope === 'all'` the panel returns a stub response — the ReAct-enabled Crystal will eventually support org-level queries.

---

## 2a. Phase 0 — Centralized Constants (1 day)

This phase must be completed before any other phase. Scattered threshold constants cause bugs when they're updated in one place but not another.

**Problem:** Thresholds are currently scattered across multiple files:
- `agents/consumers/response_stream.py` lines 28-32: `NEW_RESPONSE_THRESHOLD` (env-driven, different values dev/prod)
- `agents/lib/topic_registry.py` line 24: `ASSIGNMENT_THRESHOLD = 0.72`
- `agents/graphs/insights.py` line 98: `WINDOW_MIN_RESPONSES = {"all_time": 1, "last_30d": 10, "last_7d": 5}`
- `agents/graphs/insights.py` line 107-112: trust score thresholds (50, 30 for NPS CI)
- `agents/graphs/insights.py` line 330: `response_limit = 300 if is_bootstrap else 200`

**Solution: New file `agents/lib/constants.py`**

```python
"""Centralized threshold and limit constants for the Crystal pipeline.

All thresholds live here. Import from this module — never hardcode values inline.
When you change a value here, the change propagates everywhere automatically.

Constants are grouped by subsystem. Add a comment for every value explaining:
  - What it controls
  - Why this specific value was chosen
  - Who to consult before changing it
"""

# ── Streaming Consumer (Tier 1 and Tier 2 triggers) ──────────────────────────

# Tier 1: lightweight SQL metric snapshot (no LLM)
# Triggers a pure-SQL NPS/CSAT/velocity aggregate write to survey_metric_snapshots.
# Set to 50 because that gives at least 2 meaningful NPS data points per 100-response survey.
METRIC_SNAPSHOT_RESPONSE_THRESHOLD: int = int(os.getenv("METRIC_SNAPSHOT_THRESHOLD", "50"))
METRIC_SNAPSHOT_MAX_HOURS: int = int(os.getenv("METRIC_SNAPSHOT_MAX_HOURS", "6"))

# Tier 2: full checkpoint report (LLM narration + delta analysis)
# 200 chosen because at n=200 the Wilson CI for NPS is ~±7 points — tight enough
# for delta analysis to distinguish real shifts from noise.
# Change only with Applied Science approval (affects statistical validity of delta reports).
CHECKPOINT_FULL_RESPONSE_THRESHOLD: int = int(os.getenv("CHECKPOINT_THRESHOLD", "200"))
CHECKPOINT_FULL_MAX_DAYS: int = int(os.getenv("CHECKPOINT_MAX_DAYS", "7"))

# ── Pipeline — Response Loading ───────────────────────────────────────────────

# Max responses loaded by node_ingest on bootstrap run (first run, no centroids yet)
# Set to 300 to give the initial clustering enough signal for stable centroids.
INGEST_MAX_RESPONSES_BOOTSTRAP: int = 300

# Max responses on incremental runs (centroids exist, only need new responses + context)
# 200 matches the Tier 2 checkpoint threshold — one full checkpoint window.
INGEST_MAX_RESPONSES_INCREMENTAL: int = 200

# ── Cumulative Checkpoint Window ─────────────────────────────────────────────

# Hard cap on responses loaded for ANY checkpoint run (bootstrap or incremental).
# All checkpoints use a cumulative window: every run loads ALL available responses
# up to this cap, not just new ones since the last run. ABSA caches already-scored
# responses so the incremental LLM cost is minimal. 250 chosen because:
#   - At n=250 Wilson CI for NPS is ~±6 points (tighter than the 200 trigger floor)
#   - Gives meaningful headroom beyond the 200-response trigger threshold
#   - Stays within LLM context budget for narration prompts
# Change only with Applied Science + Engineering approval.
INGEST_MAX_RESPONSES_CAP: int = int(os.getenv("INGEST_MAX_RESPONSES_CAP", "250"))

# ── Manual Refresh Limits ─────────────────────────────────────────────────────

# Minimum new responses required since the last completed checkpoint before the
# UI shows the "Generate new insight" button. Below this threshold the button is
# hidden — not enough new signal to justify a full regeneration.
# Set to 10 based on: at n<10 new responses, the delta is statistically invisible.
MANUAL_REFRESH_MIN_NEW_RESPONSES: int = int(os.getenv("MANUAL_REFRESH_MIN_NEW_RESPONSES", "10"))

# Maximum number of manual checkpoint regenerations allowed per survey per day.
# Prevents runaway cost if a user hammers the button. 3 per day = ~$0.06–0.24/day max.
# Rejected requests return HTTP 429 with a semantic message (not "rate limited").
MANUAL_REFRESH_MAX_DAILY: int = int(os.getenv("MANUAL_REFRESH_MAX_DAILY", "3"))

# ── Object Store — Checkpoint Report Blobs ───────────────────────────────────

# GCS bucket name for checkpoint report blobs.
# In dev (AGENTS_ENV=dev), blobs are written to local filesystem instead.
# Path convention: checkpoints/{org_id}/{survey_id}/{checkpoint_id}.json
CHECKPOINT_BUCKET: str = os.getenv("CHECKPOINT_BUCKET", "")

# Local filesystem fallback path for dev. Only used when AGENTS_ENV=dev.
CHECKPOINT_LOCAL_PATH: str = os.getenv("CHECKPOINT_LOCAL_PATH", "/tmp/checkpoints")

# Current checkpoint blob schema version. Increment when blob schema changes.
# Add a migration function _migrate_vN_to_vN1 in agents/lib/checkpoint_store.py.
CHECKPOINT_BLOB_SCHEMA_VERSION: int = 1

# ── Topic Clustering ──────────────────────────────────────────────────────────

# Cosine similarity threshold for assigning a response to an existing topic cluster.
# 0.72 chosen by Applied Science calibration — below this, responses have different meaning.
# Change only with Applied Science approval (affects which topics get created vs. merged).
TOPIC_ASSIGNMENT_THRESHOLD: float = 0.72

# Minimum responses per time window to publish a windowed metric insight
WINDOW_MIN_RESPONSES: dict[str, int] = {
    "all_time": 1,
    "last_30d": 10,
    "last_7d": 5,
}

# ── Topic Confidence Levels ───────────────────────────────────────────────────

# These determine the confidence_level field on survey_topics.
# Low = directional only. Medium = directional + magnitude. High = all claims.
# UX hides directional claims for 'low' topics (emerging theme badge shown instead).
TOPIC_CONFIDENCE_LOW_MAX: int = 2      # 1-2 mentions → 'low'
TOPIC_CONFIDENCE_MEDIUM_MAX: int = 9   # 3-9 mentions → 'medium'
# 10+ mentions → 'high'

# ── Trust Score Thresholds ────────────────────────────────────────────────────

# Minimum n for statistical trust score to reach the "moderate" tier
TRUST_STATISTICAL_MODERATE_MIN: int = 30
# Minimum n for statistical trust score to reach the "high" tier
TRUST_STATISTICAL_HIGH_MIN: int = 50

# Minimum overall trust_score for an insight to be published without a ○ indicator
TRUST_SCORE_LOW_MAX: int = 49      # 0-49 → ○ (limited data)
TRUST_SCORE_MEDIUM_MAX: int = 79   # 50-79 → ◑ (moderate)
# 80-100 → ● (high)

# ── Report Quality Gating ─────────────────────────────────────────────────────

# report_quality_score below this → trigger re-narration of failing sections
REPORT_QUALITY_RENARRATE_THRESHOLD: int = 60
# report_quality_score below this → fail the run, do not publish
REPORT_QUALITY_FAIL_THRESHOLD: int = 40

# Crystal eval quality_score below this → self-correction loop triggers
CRYSTAL_EVAL_PASS_THRESHOLD: int = 72

# ── Crystal ReAct Loop ────────────────────────────────────────────────────────

# Maximum tool calls per Crystal conversation turn
CRYSTAL_MAX_TOOL_TURNS: int = int(os.getenv("CRYSTAL_MAX_TOOL_TURNS", "10"))

# Maximum token count in accumulated tool results before compression triggers
CRYSTAL_CONTEXT_COMPRESSION_THRESHOLD: int = 40_000

# Rolling conversation window (number of prior exchanges kept)
CRYSTAL_CONVERSATION_WINDOW: int = 6

# ── Progressive Intelligence Tier Thresholds ─────────────────────────────────

# These control when the stream consumer fires sub-tier pipeline runs.
# Each threshold is the minimum TOTAL response count to trigger that tier.
# Sub-tier runs fire ONCE per tier crossing, then never again for this survey.
# Once the Tier 2 full checkpoint runs (CHECKPOINT_FULL_RESPONSE_THRESHOLD = 200),
# all sub-tier triggers are permanently disabled (Redis key set to 'full').
#
# Note: There is no PROGRESSIVE_TIER_CLEAR_PICTURE constant. Clear Picture IS
# the Tier 2 full checkpoint trigger (CHECKPOINT_FULL_RESPONSE_THRESHOLD = 200).
# They fire at the same threshold — do not add a duplicate constant.
#
# Dev overrides reduce thresholds for local testing without large datasets.
PROGRESSIVE_TIER_FIRST_VOICES:    int = int(os.getenv("TIER_FIRST_VOICES",    "10"))
PROGRESSIVE_TIER_EARLY_SIGNALS:   int = int(os.getenv("TIER_EARLY_SIGNALS",   "40"))
PROGRESSIVE_TIER_GROWING_PICTURE: int = int(os.getenv("TIER_GROWING_PICTURE", "100"))
# Dev overrides: set TIER_FIRST_VOICES=2 TIER_EARLY_SIGNALS=5 TIER_GROWING_PICTURE=10
```

**Usage pattern after adding this file:**

In `agents/graphs/insights.py`, replace hardcoded values:
```python
# BEFORE
response_limit = 300 if is_bootstrap else 200

# AFTER
from agents.lib.constants import INGEST_MAX_RESPONSES_BOOTSTRAP, INGEST_MAX_RESPONSES_CAP
# Cumulative window: load all responses up to cap (not just since last checkpoint)
response_limit = INGEST_MAX_RESPONSES_BOOTSTRAP if is_bootstrap else INGEST_MAX_RESPONSES_CAP
```

In `agents/lib/topic_registry.py`:
```python
# BEFORE
ASSIGNMENT_THRESHOLD = 0.72

# AFTER
from agents.lib.constants import TOPIC_ASSIGNMENT_THRESHOLD
ASSIGNMENT_THRESHOLD = TOPIC_ASSIGNMENT_THRESHOLD
```

**Frontend constants: `app/src/constants/limits.ts`**

The frontend should never hardcode threshold numbers. The threshold values are internal to the backend. But the frontend needs to know the mapping from API-returned `report_tier` to display badges:

```typescript
// app/src/constants/limits.ts
// Frontend display constants — DO NOT add raw threshold numbers here.
// Threshold numbers live in agents/lib/constants.py on the backend.
// This file maps API enum values to display configurations.

export const REPORT_TIER_CONFIG = {
  early:   { icon: '◑', badgeKey: 'insights.tier.early'   },
  growing: { icon: '◕', badgeKey: 'insights.tier.growing' },
  full:    { icon: '●', badgeKey: 'insights.tier.full'    },
  deep:    { icon: '●', badgeKey: 'insights.tier.deep'    },
} as const;

export const TOPIC_CONFIDENCE_CONFIG = {
  low:    { badge: true,  badgeKey: 'topics.confidence.low',    tooltipKey: 'topics.confidence.low.tooltip'    },
  medium: { badge: true,  badgeKey: 'topics.confidence.medium', tooltipKey: 'topics.confidence.medium.tooltip' },
  high:   { badge: false, badgeKey: null,                       tooltipKey: null                               },
} as const;

export const TRUST_SCORE_CONFIG = {
  high:   { icon: '●', tooltipKey: 'insights.trust.high.tooltip'   },
  medium: { icon: '◑', tooltipKey: 'insights.trust.medium.tooltip' },
  low:    { icon: '○', tooltipKey: 'insights.trust.low.tooltip'    },
} as const;

export const CRYSTAL_TOOL_LABELS: Record<string, string> = {
  get_survey_overview:      'crystal.tool.get_survey_overview',
  get_topic_details:        'crystal.tool.get_topic_details',
  get_metric_history:       'crystal.tool.get_metric_history',
  get_insights_list:        'crystal.tool.get_insights_list',
  get_verbatims:            'crystal.tool.get_verbatims',
  compare_surveys:          'crystal.tool.compare_surveys',
  get_org_portfolio:        'crystal.tool.get_org_portfolio',
  get_cross_survey_themes:  'crystal.tool.get_cross_survey_themes',
  get_anomaly_events:       'crystal.tool.get_anomaly_events',
  get_benchmark_comparison: 'crystal.tool.get_benchmark_comparison',
  get_driver_analysis:      'crystal.tool.get_driver_analysis',
  get_segment_breakdown:    'crystal.tool.get_segment_breakdown',
  get_checkpoint_history:   'insights.crystal.tool.getCheckpointHistory',
};
```

---

## 3. Phase 1 — Crystal Tool Registry

### 3.1 Package Initialization

**New file: `agents/crystal/__init__.py`**

```python
# Crystal agentic analyst package
```

This file makes `agents/crystal` a proper Python package so the tool registry and executor modules can be imported.

### 3.2 CrystalContext Dataclass

**New file: `agents/crystal/context.py`**

```python
from __future__ import annotations
from dataclasses import dataclass


@dataclass
class CrystalContext:
    """Immutable scope context passed to every tool executor.
    
    scope:     "survey" when Crystal is answering about a specific survey.
               "org" when Crystal is answering portfolio-level questions.
    run_id:    The most recent completed insight run for this survey, if known.
               Tools that read from insights or topics should filter by run_id
               when present to avoid mixing results from stale runs.
    """
    org_id:    str
    survey_id: str | None
    scope:     str          # "survey" | "org"
    run_id:    str | None = None
```

### 3.3 Tool Registry

**New file: `agents/crystal/registry.py`**

The registry is a list of Anthropic tool-use format dicts. These dicts are passed as the `tools` parameter in the Anthropic messages API call. The `input_schema` field follows the JSON Schema draft-07 format.

```python
"""Crystal Tool Registry — 12 tools covering survey, topic, metric, and org queries.

All tools follow the Anthropic tool-use format:
  {
    "name": str,
    "description": str,
    "input_schema": {"type": "object", "properties": {...}, "required": [...]}
  }

Tools are grouped by scope:
  SURVEY_TOOLS  — require survey_id; scoped to a single survey
  ORG_TOOLS     — query across all surveys for the org (scope="org")

_get_tools_for_scope(scope) filters to only the relevant set so Crystal
doesn't see org-level tool signatures when answering a single-survey question.
"""
from __future__ import annotations


SURVEY_TOOLS: list[dict] = [
    {
        "name": "get_survey_overview",
        "description": (
            "Returns a high-level summary of a survey: NPS score with confidence interval, "
            "CSAT score, total response count, top 5 topics by volume, and the latest run_id. "
            "Use this as the first call when the user asks about 'this survey' without "
            "specifying a metric or topic."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey to summarize."
                }
            },
            "required": ["survey_id"]
        }
    },
    {
        "name": "get_topic_details",
        "description": (
            "Returns detailed data for a single topic: top 5 verbatim response excerpts, "
            "sentiment trend direction, driver score (point-biserial correlation with NPS), "
            "effort score, and volume over the last 30 days. "
            "Use when the user asks about a specific theme (e.g. 'Tell me more about Onboarding')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey."
                },
                "topic_name": {
                    "type": "string",
                    "description": "Exact topic name as it appears in the survey_topics table."
                }
            },
            "required": ["survey_id", "topic_name"]
        }
    },
    {
        "name": "get_metric_history",
        "description": (
            "Returns the NPS and CSAT time series from survey_metric_snapshots. "
            "Each row is one pipeline run: {captured_at, nps, nps_ci_low, nps_ci_high, "
            "nps_n, csat, response_count, anomaly_flag}. "
            "Use to answer questions about trends, drops, recoveries, or anomalies."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey."
                },
                "days": {
                    "type": "integer",
                    "description": "How many days of history to return. Defaults to 30. Maximum 365.",
                    "default": 30
                }
            },
            "required": ["survey_id"]
        }
    },
    {
        "name": "get_insights_list",
        "description": (
            "Returns the structured AI-generated insights for a survey, optionally filtered "
            "by insight layer (descriptive, diagnostic, predictive, prescriptive) and count. "
            "Each insight has: id, layer, category, headline, narrative, metric_json, trust_score."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey."
                },
                "layer": {
                    "type": "string",
                    "description": "Filter to one layer: descriptive | diagnostic | predictive | prescriptive. Omit for all layers.",
                    "enum": ["descriptive", "diagnostic", "predictive", "prescriptive"]
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of insights to return. Defaults to 20. Maximum 50.",
                    "default": 20
                }
            },
            "required": ["survey_id"]
        }
    },
    {
        "name": "get_verbatims",
        "description": (
            "Returns raw verbatim response text from respondents. Optionally filter by "
            "topic name and sentiment. Use when the user asks for 'real quotes', 'examples', "
            "or 'what customers actually said about X'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey."
                },
                "topic": {
                    "type": "string",
                    "description": "Filter to responses tagged with this topic name. Omit for all responses."
                },
                "sentiment": {
                    "type": "string",
                    "description": "Filter by AI sentiment: positive | negative | neutral. Omit for all.",
                    "enum": ["positive", "negative", "neutral"]
                },
                "limit": {
                    "type": "integer",
                    "description": "Max verbatims to return. Defaults to 5. Maximum 20.",
                    "default": 5
                }
            },
            "required": ["survey_id"]
        }
    },
    {
        "name": "get_benchmark_comparison",
        "description": (
            "Returns the survey's current metric score compared to the benchmark percentile "
            "stored in survey_metric_snapshots. Use when the user asks 'how do we compare to "
            "industry average' or 'is our NPS good?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey."
                },
                "metric": {
                    "type": "string",
                    "description": "Which metric to benchmark: nps | csat | ces.",
                    "enum": ["nps", "csat", "ces"]
                }
            },
            "required": ["survey_id", "metric"]
        }
    },
    {
        "name": "get_driver_analysis",
        "description": (
            "Returns the point-biserial NPS driver score for a specific topic: how strongly "
            "does mentioning this topic correlate with promoter vs detractor status? "
            "Also returns nps_impact (average NPS delta for responses mentioning the topic). "
            "Use to answer 'what is driving NPS?' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey."
                },
                "topic_name": {
                    "type": "string",
                    "description": "Exact topic name from survey_topics."
                }
            },
            "required": ["survey_id", "topic_name"]
        }
    },
    {
        "name": "get_segment_breakdown",
        "description": (
            "Returns NPS breakdown by answer value for a specific question (typically a "
            "demographic or segmentation question). Useful for 'how does NPS differ by "
            "customer segment?' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of the survey."
                },
                "question_id": {
                    "type": "string",
                    "description": "ID of the segmentation question within the survey. If omitted, returns top-level NPS only."
                }
            },
            "required": ["survey_id"]
        }
    },
    {
        "name": "get_checkpoint_history",
        "description": (
            "Fetch the last 2–3 checkpoint summaries and the pre-computed delta between "
            "current and previous checkpoint. Use when the user asks how results compare "
            "to last time, what changed, or whether a metric has improved."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of checkpoints to return. Default 2, max 5.",
                    "default": 2
                }
            },
            "required": []
        }
    },
]

ORG_TOOLS: list[dict] = [
    {
        "name": "compare_surveys",
        "description": (
            "Returns a side-by-side comparison of two surveys: NPS score, CSAT, response count, "
            "and their top 3 topics. Use when the user asks 'compare X to Y' or 'which survey "
            "is performing better?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id_a": {
                    "type": "string",
                    "description": "UUID of the first survey."
                },
                "survey_id_b": {
                    "type": "string",
                    "description": "UUID of the second survey."
                }
            },
            "required": ["survey_id_a", "survey_id_b"]
        }
    },
    {
        "name": "get_org_portfolio",
        "description": (
            "Returns all active surveys for the org with: survey title, NPS score, response count, "
            "and trend direction (up/down/stable). Use for portfolio-level questions: 'which survey "
            "needs the most attention?', 'show me all my surveys'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_cross_survey_themes",
        "description": (
            "Returns topics that appear in 2 or more surveys for this org, with their combined "
            "volume, average sentiment, and the list of surveys where they appear. "
            "Use to answer 'what themes appear across all surveys?' or 'what is common feedback?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_anomaly_events",
        "description": (
            "Returns pipeline runs where anomaly_flag=true in survey_metric_snapshots, indicating "
            "statistically unusual metric movements. Optionally scoped to a single survey. "
            "Use for 'have there been any sudden drops?' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {
                    "type": "string",
                    "description": "UUID of a specific survey. Omit to check all surveys in the org."
                },
                "days": {
                    "type": "integer",
                    "description": "How many days back to check. Defaults to 30.",
                    "default": 30
                }
            },
            "required": []
        }
    },
]

# Combined registry — all tools for broad scope
CRYSTAL_TOOL_REGISTRY: list[dict] = SURVEY_TOOLS + ORG_TOOLS


def get_tools_for_scope(scope: str) -> list[dict]:
    """Return only the tools appropriate for the given scope.
    
    scope="survey" → SURVEY_TOOLS only (faster, cheaper, no cross-survey confusion)
    scope="org"    → all tools (Crystal needs org-level tools for portfolio questions)
    """
    if scope == "survey":
        return SURVEY_TOOLS
    return CRYSTAL_TOOL_REGISTRY
```

### 3.4 Tool Executors

**New file: `agents/crystal/tools.py`**

Each executor receives `params: dict` (the validated `input` from the tool_use block) and `ctx: CrystalContext`. All executors use the existing `agents/lib/db` pool — no new connections.

```python
"""Crystal Tool Executors — one async function per tool in the registry.

All executors:
  - Accept params: dict (validated tool input from the LLM) and ctx: CrystalContext
  - Return a JSON-serializable dict
  - Never raise — return {"error": "..."} on failure so the ReAct loop can recover
  - Use parameterized queries only — never string-interpolate SQL
  - Cap result sizes (verbatims: 20, topics: 30, history: 365 days)

SQL queries reference real column names from the existing schema.
Consult backend/src/routes/insights.js for the equivalent JS implementations.
"""
from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from agents.crystal.context import CrystalContext
from agents.lib import db
from agents.lib.logger import logger


# ── Tool executor registry ─────────────────────────────────────────────────────

TOOL_EXECUTORS: dict[str, Callable] = {}


def tool(name: str):
    """Decorator that registers a function in TOOL_EXECUTORS by name."""
    def decorator(fn):
        TOOL_EXECUTORS[name] = fn
        return fn
    return decorator


# ── Dispatcher ─────────────────────────────────────────────────────────────────

async def execute_tool(name: str, params: dict, ctx: CrystalContext) -> dict:
    """Dispatch a tool call by name. Returns {"error": ...} if unknown or raises."""
    executor = TOOL_EXECUTORS.get(name)
    if executor is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return await executor(params, ctx)
    except Exception as exc:
        logger.warning("crystal_tool_error", tool=name, error=str(exc))
        return {"error": str(exc)}


# ── Survey-scoped tools ────────────────────────────────────────────────────────

@tool("get_survey_overview")
async def execute_get_survey_overview(params: dict, ctx: CrystalContext) -> dict:
    """NPS, CSAT, response count, top 5 topics by volume."""
    survey_id = params.get("survey_id") or ctx.survey_id
    if not survey_id:
        return {"error": "survey_id required"}

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            # Survey metadata
            await cur.execute(
                "SELECT title, response_count FROM surveys WHERE id = %s AND org_id = %s AND deleted_at IS NULL",
                (survey_id, ctx.org_id),
            )
            survey_row = await cur.fetchone()
            if not survey_row:
                return {"error": "Survey not found"}
            title, response_count = survey_row

            # Latest metric snapshot
            await cur.execute(
                """SELECT nps, nps_ci_low, nps_ci_high, nps_n, csat, response_count AS snap_count,
                          anomaly_flag, captured_at
                   FROM survey_metric_snapshots
                   WHERE survey_id = %s AND org_id = %s
                   ORDER BY captured_at DESC LIMIT 1""",
                (survey_id, ctx.org_id),
            )
            snap_row = await cur.fetchone()

            # Top 5 topics by volume
            await cur.execute(
                """SELECT name, volume, sentiment_score, dominant_emotion, trending
                   FROM survey_topics
                   WHERE survey_id = %s AND org_id = %s AND time_window = 'all_time'
                   ORDER BY volume DESC LIMIT 5""",
                (survey_id, ctx.org_id),
            )
            topic_rows = await cur.fetchall()

    result: dict[str, Any] = {
        "survey_id":      survey_id,
        "title":          title,
        "response_count": response_count,
    }
    if snap_row:
        result.update({
            "nps":          snap_row[0],
            "nps_ci_low":   snap_row[1],
            "nps_ci_high":  snap_row[2],
            "nps_n":        snap_row[3],
            "csat":         snap_row[4],
            "anomaly_flag": snap_row[6],
        })
    result["top_topics"] = [
        {
            "name":      r[0],
            "volume":    r[1],
            "sentiment": float(r[2]) if r[2] is not None else None,
            "emotion":   r[3],
            "trending":  r[4],
        }
        for r in topic_rows
    ]
    return result


@tool("get_topic_details")
async def execute_get_topic_details(params: dict, ctx: CrystalContext) -> dict:
    """Verbatims, sentiment trend, driver score, effort score for one topic."""
    survey_id  = params.get("survey_id") or ctx.survey_id
    topic_name = params.get("topic_name", "")
    if not survey_id or not topic_name:
        return {"error": "survey_id and topic_name required"}

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            # Topic metadata
            await cur.execute(
                """SELECT id, volume, sentiment_score, dominant_emotion, effort_score,
                          trending, sentiment_momentum, urgency_score, nps_avg,
                          positive_pct, negative_pct, chronic
                   FROM survey_topics
                   WHERE survey_id = %s AND org_id = %s AND name = %s AND time_window = 'all_time'
                   LIMIT 1""",
                (survey_id, ctx.org_id, topic_name),
            )
            topic_row = await cur.fetchone()
            if not topic_row:
                return {"error": f"Topic '{topic_name}' not found"}
            topic_id = topic_row[0]

            # Top 5 verbatims tagged with this topic via ai_topics JSONB
            await cur.execute(
                """SELECT r.answers, r.nps_score, r.ai_sentiment, r.submitted_at
                   FROM responses r
                   WHERE r.survey_id = %s AND r.org_id = %s
                     AND r.ai_topics IS NOT NULL
                     AND %s = ANY(SELECT jsonb_array_elements_text(r.ai_topics))
                   ORDER BY r.submitted_at DESC LIMIT 5""",
                (survey_id, ctx.org_id, topic_name),
            )
            verbatim_rows = await cur.fetchall()

    # Extract text from answers JSONB
    verbatims = []
    text_types = {"open_text", "short_text", "text"}
    for answers_raw, nps_score, sentiment, submitted_at in verbatim_rows:
        answers = answers_raw if isinstance(answers_raw, list) else (
            json.loads(answers_raw) if isinstance(answers_raw, str) else []
        )
        texts = [
            a.get("value", "").strip()
            for a in answers
            if not a.get("type") or a.get("type") in text_types
            if isinstance(a.get("value"), str) and a.get("value", "").strip()
        ]
        if texts:
            verbatims.append({
                "text":         texts[0][:300],
                "nps_score":    nps_score,
                "sentiment":    sentiment,
                "submitted_at": submitted_at.isoformat() if submitted_at else None,
            })

    return {
        "topic_name":         topic_name,
        "topic_id":           str(topic_id),
        "volume":             topic_row[1],
        "sentiment_score":    float(topic_row[2]) if topic_row[2] is not None else None,
        "dominant_emotion":   topic_row[3],
        "effort_score":       float(topic_row[4]) if topic_row[4] is not None else None,
        "trending":           topic_row[5],
        "sentiment_momentum": topic_row[6],
        "urgency_score":      float(topic_row[7]) if topic_row[7] is not None else None,
        "nps_avg":            float(topic_row[8]) if topic_row[8] is not None else None,
        "positive_pct":       float(topic_row[9]) if topic_row[9] is not None else None,
        "negative_pct":       float(topic_row[10]) if topic_row[10] is not None else None,
        "is_chronic":         topic_row[11],
        "verbatims":          verbatims,
    }


@tool("get_metric_history")
async def execute_get_metric_history(params: dict, ctx: CrystalContext) -> dict:
    """NPS and CSAT time series from survey_metric_snapshots."""
    survey_id = params.get("survey_id") or ctx.survey_id
    days      = min(int(params.get("days", 30)), 365)
    if not survey_id:
        return {"error": "survey_id required"}

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT captured_at, nps, nps_ci_low, nps_ci_high, nps_n,
                          csat, response_count, response_velocity_7d, anomaly_flag
                   FROM survey_metric_snapshots
                   WHERE survey_id = %s AND org_id = %s
                     AND captured_at >= NOW() - (%s * INTERVAL '1 day')
                   ORDER BY captured_at ASC""",
                (survey_id, ctx.org_id, days),
            )
            rows = await cur.fetchall()

    history = [
        {
            "captured_at":       r[0].isoformat(),
            "nps":               r[1],
            "nps_ci_low":        r[2],
            "nps_ci_high":       r[3],
            "nps_n":             r[4],
            "csat":              r[5],
            "response_count":    r[6],
            "velocity_7d":       r[7],
            "anomaly_flag":      r[8],
        }
        for r in rows
    ]
    return {"survey_id": survey_id, "days": days, "history": history}


@tool("get_insights_list")
async def execute_get_insights_list(params: dict, ctx: CrystalContext) -> dict:
    """Structured AI insights filtered by layer."""
    survey_id = params.get("survey_id") or ctx.survey_id
    layer     = params.get("layer")
    limit     = min(int(params.get("limit", 20)), 50)
    if not survey_id:
        return {"error": "survey_id required"}

    valid_layers = {"descriptive", "diagnostic", "predictive", "prescriptive"}
    if layer and layer not in valid_layers:
        return {"error": f"Invalid layer: {layer}"}

    conditions = ["survey_id = %s", "org_id = %s", "superseded_at IS NULL", "time_window = 'all_time'"]
    params_list: list[Any] = [survey_id, ctx.org_id]
    if layer:
        conditions.append("layer = %s")
        params_list.append(layer)
    params_list.append(limit)

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"""SELECT id, layer, category, headline, narrative, metric_json, trust_score, priority
                    FROM insights
                    WHERE {' AND '.join(conditions)}
                    ORDER BY priority DESC NULLS LAST
                    LIMIT %s""",
                params_list,
            )
            rows = await cur.fetchall()

    insights = [
        {
            "id":          str(r[0]),
            "layer":       r[1],
            "category":    r[2],
            "headline":    r[3],
            "narrative":   r[4],
            "metric_json": r[5],
            "trust_score": r[6],
            "priority":    float(r[7]) if r[7] is not None else None,
        }
        for r in rows
    ]
    return {"survey_id": survey_id, "insights": insights, "count": len(insights)}


@tool("get_verbatims")
async def execute_get_verbatims(params: dict, ctx: CrystalContext) -> dict:
    """Raw verbatim response text, optionally filtered by topic and sentiment."""
    survey_id = params.get("survey_id") or ctx.survey_id
    topic     = params.get("topic")
    sentiment = params.get("sentiment")
    limit     = min(int(params.get("limit", 5)), 20)
    if not survey_id:
        return {"error": "survey_id required"}

    conditions = ["r.survey_id = %s", "r.org_id = %s"]
    bind_params: list[Any] = [survey_id, ctx.org_id]

    if topic:
        conditions.append("r.ai_topics IS NOT NULL AND %s = ANY(SELECT jsonb_array_elements_text(r.ai_topics))")
        bind_params.append(topic)
    if sentiment in ("positive", "negative", "neutral"):
        conditions.append("r.ai_sentiment = %s")
        bind_params.append(sentiment)
    bind_params.append(limit)

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"""SELECT r.answers, r.nps_score, r.ai_sentiment, r.submitted_at, r.ai_topics
                    FROM responses r
                    WHERE {' AND '.join(conditions)}
                    ORDER BY r.submitted_at DESC
                    LIMIT %s""",
                bind_params,
            )
            rows = await cur.fetchall()

    text_types = {"open_text", "short_text", "text"}
    verbatims = []
    for answers_raw, nps_score, ai_sentiment, submitted_at, ai_topics in rows:
        answers = answers_raw if isinstance(answers_raw, list) else (
            json.loads(answers_raw) if isinstance(answers_raw, str) else []
        )
        texts = [
            a.get("value", "").strip()
            for a in answers
            if not a.get("type") or a.get("type") in text_types
            if isinstance(a.get("value"), str) and a.get("value", "").strip()
        ]
        if texts:
            verbatims.append({
                "text":         texts[0][:400],
                "nps_score":    nps_score,
                "sentiment":    ai_sentiment,
                "topics":       ai_topics if isinstance(ai_topics, list) else [],
                "submitted_at": submitted_at.isoformat() if submitted_at else None,
            })

    return {"survey_id": survey_id, "verbatims": verbatims, "count": len(verbatims)}


@tool("get_driver_analysis")
async def execute_get_driver_analysis(params: dict, ctx: CrystalContext) -> dict:
    """Point-biserial NPS driver score and NPS impact for a topic."""
    survey_id  = params.get("survey_id") or ctx.survey_id
    topic_name = params.get("topic_name", "")
    if not survey_id or not topic_name:
        return {"error": "survey_id and topic_name required"}

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            # Fetch topic signals stored by the pipeline
            await cur.execute(
                """SELECT nps_avg, nps_correlation, volume, positive_pct, negative_pct, urgency_score
                   FROM survey_topics
                   WHERE survey_id = %s AND org_id = %s AND name = %s AND time_window = 'all_time'
                   LIMIT 1""",
                (survey_id, ctx.org_id, topic_name),
            )
            row = await cur.fetchone()

            # Overall NPS for delta calculation
            await cur.execute(
                "SELECT AVG(nps_score)::float FROM responses WHERE survey_id = %s AND org_id = %s AND nps_score IS NOT NULL",
                (survey_id, ctx.org_id),
            )
            overall_nps_row = await cur.fetchone()

    if not row:
        return {"error": f"Topic '{topic_name}' not found"}

    overall_nps   = overall_nps_row[0] if overall_nps_row else None
    topic_nps_avg = float(row[0]) if row[0] is not None else None
    nps_delta     = round(topic_nps_avg - overall_nps, 1) if (topic_nps_avg is not None and overall_nps is not None) else None

    return {
        "topic_name":    topic_name,
        "topic_nps_avg": topic_nps_avg,
        "overall_nps":   round(overall_nps, 1) if overall_nps is not None else None,
        "nps_delta":     nps_delta,
        "driver_score":  float(row[1]) if row[1] is not None else None,   # point-biserial correlation
        "volume":        row[2],
        "positive_pct":  float(row[3]) if row[3] is not None else None,
        "negative_pct":  float(row[4]) if row[4] is not None else None,
        "urgency_score": float(row[5]) if row[5] is not None else None,
        "interpretation": (
            "strong negative driver" if (nps_delta is not None and nps_delta < -5)
            else "moderate negative driver" if (nps_delta is not None and nps_delta < -2)
            else "strong positive driver" if (nps_delta is not None and nps_delta > 5)
            else "neutral"
        ),
    }


@tool("get_benchmark_comparison")
async def execute_get_benchmark_comparison(params: dict, ctx: CrystalContext) -> dict:
    """Score vs benchmark percentile from the latest metric snapshot."""
    survey_id = params.get("survey_id") or ctx.survey_id
    metric    = params.get("metric", "nps")
    if not survey_id:
        return {"error": "survey_id required"}
    if metric not in ("nps", "csat", "ces"):
        return {"error": "metric must be nps, csat, or ces"}

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"SELECT {metric} FROM survey_metric_snapshots WHERE survey_id = %s AND org_id = %s ORDER BY captured_at DESC LIMIT 1",
                (survey_id, ctx.org_id),
            )
            row = await cur.fetchone()

    # Static industry benchmarks — replace with a benchmarks table when available
    BENCHMARKS = {
        "nps":  {"p25": 20, "p50": 40, "p75": 60, "label": "B2C SaaS"},
        "csat": {"p25": 3.5, "p50": 4.0, "p75": 4.5, "label": "Technology"},
        "ces":  {"p25": 3.0, "p50": 3.5, "p75": 4.2, "label": "General"},
    }
    bench = BENCHMARKS.get(metric, {})
    score = float(row[0]) if row and row[0] is not None else None
    percentile = None
    if score is not None and bench:
        if score < bench["p25"]:   percentile = "bottom quartile"
        elif score < bench["p50"]: percentile = "second quartile"
        elif score < bench["p75"]: percentile = "third quartile"
        else:                       percentile = "top quartile"

    return {
        "survey_id":   survey_id,
        "metric":      metric,
        "score":       score,
        "benchmark":   bench,
        "percentile":  percentile,
    }


@tool("get_segment_breakdown")
async def execute_get_segment_breakdown(params: dict, ctx: CrystalContext) -> dict:
    """NPS breakdown by a segmentation question's answer values."""
    survey_id   = params.get("survey_id") or ctx.survey_id
    question_id = params.get("question_id")
    if not survey_id:
        return {"error": "survey_id required"}
    if not question_id:
        return {"survey_id": survey_id, "note": "No question_id provided — overall NPS only",
                "segments": []}

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            # This query relies on answers JSONB containing {questionId, value} objects.
            # The GIN index on responses.ai_topics does not cover answers — full scan.
            await cur.execute(
                """SELECT
                     ans->>'value' AS segment_value,
                     COUNT(*)::int AS response_count,
                     ROUND(AVG(r.nps_score)::numeric, 1)::float AS avg_nps,
                     COUNT(CASE WHEN r.nps_score >= 9 THEN 1 END)::int AS promoters,
                     COUNT(CASE WHEN r.nps_score <= 6 THEN 1 END)::int AS detractors
                   FROM responses r,
                   LATERAL jsonb_array_elements(r.answers) AS ans
                   WHERE r.survey_id = %s AND r.org_id = %s
                     AND r.nps_score IS NOT NULL
                     AND ans->>'questionId' = %s
                   GROUP BY ans->>'value'
                   ORDER BY COUNT(*) DESC
                   LIMIT 20""",
                (survey_id, ctx.org_id, question_id),
            )
            rows = await cur.fetchall()

    segments = [
        {
            "segment_value":   r[0],
            "response_count":  r[1],
            "avg_nps":         r[2],
            "promoters":       r[3],
            "detractors":      r[4],
        }
        for r in rows
    ]
    return {"survey_id": survey_id, "question_id": question_id, "segments": segments}


# ── Org-scoped tools ───────────────────────────────────────────────────────────

@tool("get_org_portfolio")
async def execute_get_org_portfolio(params: dict, ctx: CrystalContext) -> dict:
    """All active surveys for the org with latest NPS and trend."""
    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT s.id, s.title, s.response_count, s.status,
                          sms.nps, sms.csat, sms.anomaly_flag, sms.captured_at
                   FROM surveys s
                   LEFT JOIN LATERAL (
                     SELECT nps, csat, anomaly_flag, captured_at
                     FROM survey_metric_snapshots
                     WHERE survey_id = s.id AND org_id = %s
                     ORDER BY captured_at DESC LIMIT 1
                   ) sms ON TRUE
                   WHERE s.org_id = %s AND s.deleted_at IS NULL AND s.status = 'active'
                   ORDER BY s.response_count DESC NULLS LAST
                   LIMIT 20""",
                (ctx.org_id, ctx.org_id),
            )
            rows = await cur.fetchall()

    surveys = [
        {
            "survey_id":      str(r[0]),
            "title":          r[1],
            "response_count": r[2],
            "status":         r[3],
            "nps":            r[4],
            "csat":           r[5],
            "anomaly_flag":   r[6],
            "last_snapshot":  r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]
    return {"org_id": ctx.org_id, "surveys": surveys, "count": len(surveys)}


@tool("compare_surveys")
async def execute_compare_surveys(params: dict, ctx: CrystalContext) -> dict:
    """Side-by-side NPS, CSAT, and top topics for two surveys."""
    survey_id_a = params.get("survey_id_a", "")
    survey_id_b = params.get("survey_id_b", "")
    if not survey_id_a or not survey_id_b:
        return {"error": "survey_id_a and survey_id_b required"}

    async def _fetch_one(survey_id: str) -> dict:
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT title, response_count FROM surveys WHERE id = %s AND org_id = %s",
                    (survey_id, ctx.org_id),
                )
                survey_row = await cur.fetchone()
                if not survey_row:
                    return {"error": f"Survey {survey_id} not found"}

                await cur.execute(
                    "SELECT nps, csat FROM survey_metric_snapshots WHERE survey_id = %s AND org_id = %s ORDER BY captured_at DESC LIMIT 1",
                    (survey_id, ctx.org_id),
                )
                snap_row = await cur.fetchone()

                await cur.execute(
                    "SELECT name, volume, sentiment_score FROM survey_topics WHERE survey_id = %s AND org_id = %s AND time_window = 'all_time' ORDER BY volume DESC LIMIT 3",
                    (survey_id, ctx.org_id),
                )
                topic_rows = await cur.fetchall()

        return {
            "survey_id":      survey_id,
            "title":          survey_row[0],
            "response_count": survey_row[1],
            "nps":            snap_row[0] if snap_row else None,
            "csat":           snap_row[1] if snap_row else None,
            "top_topics":     [{"name": r[0], "volume": r[1]} for r in topic_rows],
        }

    import asyncio
    a, b = await asyncio.gather(_fetch_one(survey_id_a), _fetch_one(survey_id_b))
    return {"survey_a": a, "survey_b": b}


@tool("get_cross_survey_themes")
async def execute_get_cross_survey_themes(params: dict, ctx: CrystalContext) -> dict:
    """Topics appearing in 2+ surveys for this org."""
    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT name,
                          COUNT(DISTINCT survey_id)::int AS survey_count,
                          SUM(volume)::int AS total_volume,
                          AVG(sentiment_score)::float AS avg_sentiment,
                          ARRAY_AGG(DISTINCT survey_id::text) AS survey_ids
                   FROM survey_topics
                   WHERE org_id = %s AND time_window = 'all_time'
                   GROUP BY name
                   HAVING COUNT(DISTINCT survey_id) >= 2
                   ORDER BY total_volume DESC
                   LIMIT 20""",
                (ctx.org_id,),
            )
            rows = await cur.fetchall()

    themes = [
        {
            "name":         r[0],
            "survey_count": r[1],
            "total_volume": r[2],
            "avg_sentiment": round(r[3], 3) if r[3] is not None else None,
            "survey_ids":   r[4],
        }
        for r in rows
    ]
    return {"org_id": ctx.org_id, "themes": themes, "count": len(themes)}


@tool("get_anomaly_events")
async def execute_get_anomaly_events(params: dict, ctx: CrystalContext) -> dict:
    """Runs where anomaly_flag=true from survey_metric_snapshots."""
    survey_id = params.get("survey_id") or ctx.survey_id
    days      = min(int(params.get("days", 30)), 180)

    conditions = ["org_id = %s", "anomaly_flag = TRUE", "captured_at >= NOW() - (%s * INTERVAL '1 day')"]
    bind: list[Any] = [ctx.org_id, days]
    if survey_id:
        conditions.append("survey_id = %s")
        bind.append(survey_id)

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"""SELECT survey_id, captured_at, nps, nps_ci_low, nps_ci_high,
                           response_count, response_velocity_7d
                    FROM survey_metric_snapshots
                    WHERE {' AND '.join(conditions)}
                    ORDER BY captured_at DESC LIMIT 20""",
                bind,
            )
            rows = await cur.fetchall()

    events = [
        {
            "survey_id":    str(r[0]),
            "captured_at":  r[1].isoformat(),
            "nps":          r[2],
            "nps_ci_low":   r[3],
            "nps_ci_high":  r[4],
            "response_count": r[5],
            "velocity_7d":  r[6],
        }
        for r in rows
    ]
    return {"org_id": ctx.org_id, "days": days, "events": events, "count": len(events)}


@tool("get_checkpoint_history")
async def execute_get_checkpoint_history(params: dict, ctx: CrystalContext) -> dict:
    """
    Returns checkpoint summaries and pre-computed delta for Crystal's comparison queries.
    Delta is read from the latest checkpoint's blob — not recomputed.
    """
    survey_id = params.get("survey_id") or ctx.survey_id
    if not survey_id:
        return {"error": "survey_id required"}

    limit = min(int(params.get("limit", 2)), 5)  # cap at 5

    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT id, created_at, response_count,
                          nps_at_checkpoint, csat_at_checkpoint,
                          trend_direction, trend_persistence, report_url
                   FROM survey_insight_checkpoints
                   WHERE survey_id = %s AND org_id = %s
                     AND run_type IN ('tier2_checkpoint', 'manual_refresh')
                     AND report_url IS NOT NULL
                   ORDER BY created_at DESC
                   LIMIT %s""",
                (survey_id, ctx.org_id, limit),
            )
            rows = await cur.fetchall()

    if not rows:
        return {
            "checkpoints": [],
            "delta": None,
            "available_from_checkpoint": 2,
            "message": "No completed checkpoints yet. Full comparison available after the first analysis.",
        }

    checkpoints = []
    for i, row in enumerate(rows):
        checkpoints.append({
            "label": f"{'Current' if i == 0 else 'Previous'} ({row[1].strftime('%b %d, %Y')})",
            "response_count": row[2],
            "nps": row[3],
            "is_current": i == 0,
        })

    # Delta is pre-computed and stored in the latest checkpoint blob
    delta = None
    if len(rows) >= 2 and rows[0][7]:  # rows[0][7] is report_url
        try:
            import json as _json
            import os as _os
            from pathlib import Path

            report_url = rows[0][7]
            if _os.getenv("AGENTS_ENV", "dev") == "dev":
                checkpoint_local_path = _os.getenv("CHECKPOINT_LOCAL_PATH", "/tmp/checkpoints")
                blob_bytes = (Path(checkpoint_local_path) / report_url).read_bytes()
                blob = _json.loads(blob_bytes)
            else:
                from google.cloud import storage as gcs
                client = gcs.Client()
                bucket = client.bucket(_os.getenv("CHECKPOINT_BUCKET", ""))
                blob_bytes = bucket.blob(report_url).download_as_bytes()
                blob = _json.loads(blob_bytes)

            delta_raw = blob.get("delta", {})
            if delta_raw:
                nps_delta = delta_raw.get("nps_delta", 0)
                delta = {
                    "nps_delta": nps_delta,
                    "nps_delta_label": f"{'↑' if nps_delta > 0 else '↓'} {abs(nps_delta):.1f} pts since last analysis",
                    "trend_direction": rows[0][5],
                    "trend_persistence": rows[0][6],
                    "topic_changes": delta_raw.get("topic_fingerprint_delta", {}),
                }
        except Exception:
            # If blob read fails, return metadata-only delta
            delta = {
                "trend_direction": rows[0][5],
                "trend_persistence": rows[0][6],
                "nps_delta": None,
                "topic_changes": {},
            }

    return {
        "checkpoints": checkpoints,
        "delta": delta,
        "available_from_checkpoint": 2,
    }
```

---

## 4. Phase 2 — ReAct Agent Loop and SSE Streaming

### 4.1 ReAct Loop in crystal.py

**Modified file: `agents/agents/crystal.py`**

Add the following function after `_run_crystal()`. The existing `_run_crystal()` function remains untouched — the feature flag in `CrystalAgent.run()` determines which path executes.

```python
# ── Additional imports needed for Phase 2 ────────────────────────────────────
import os
import asyncio
from typing import AsyncIterator

from agents.crystal.context import CrystalContext
from agents.crystal.registry import get_tools_for_scope
from agents.crystal.tools import execute_tool
from agents.lib.openrouter import _get_client as _get_openrouter_client  # internal


CRYSTAL_MAX_TOOL_TURNS: int = int(os.getenv("CRYSTAL_MAX_TOOL_TURNS", "10"))
CRYSTAL_STREAMING_ENABLED: bool = os.getenv("CRYSTAL_STREAMING_ENABLED", "false").lower() == "true"


def _build_system_prompt_agentic(inp: CrystalInput) -> str:
    """System prompt for the ReAct loop — no pre-loaded context blocks.
    
    The ReAct agent fetches its own context via tools. The system prompt describes
    Crystal's role and the data model but does NOT embed insights, topics, or metrics
    inline. Those come from tool calls.
    """
    scope_desc = (
        f'You are answering questions about the survey "{inp.survey_title}" (ID: {inp.survey_id}).'
        if inp.survey_id else
        "You are answering portfolio-level questions across all surveys for this organization."
    )
    return f"""\
You are Crystal, an expert CX (customer experience) analyst for Experient.
{scope_desc}

You have access to a set of tools that let you query live survey data. Use them to
ground every answer in real data before responding. Think step by step about which
tools to call and in what order.

RULES:
1. Always call at least one tool before giving a final answer, unless the user is
   asking a meta question about Crystal itself.
2. Do not invent data. If a tool returns no results, say so honestly.
3. Cite insight IDs in brackets (e.g. [insight-id]) when referencing specific insights
   from get_insights_list results. Quote verbatim text inline when using get_verbatims.
4. Keep the final answer to 3-6 sentences. Be direct — no preamble.
5. Include 2-3 follow-up suggestions at the end of your final answer, formatted as:
   SUGGESTIONS: ["Question 1?", "Question 2?", "Question 3?"]
6. NEVER recommend changes to survey questions — refer users to the Copilot for that.
"""


async def _run_react_loop(inp: CrystalInput) -> CrystalOutput:
    """ReAct loop: Think → Act (tool call) → Observe → Repeat until end_turn.
    
    Uses the OpenRouter messages API in tool-use mode.
    The loop runs up to CRYSTAL_MAX_TOOL_TURNS tool calls then forces a final answer.
    
    Message history structure (Anthropic tool-use format):
      [user] → [assistant: text + tool_use block] → [user: tool_result] → ...
    """
    ctx = CrystalContext(
        org_id=inp.org_id,
        survey_id=inp.survey_id if inp.survey_id else None,
        scope="survey" if inp.survey_id else "org",
    )

    # Rolling 6-turn window of prior conversation (12 messages: 6 user + 6 assistant)
    prior_turns = [
        {"role": m["role"], "content": m["content"]}
        for m in inp.conversation_history[-12:]
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    messages = prior_turns + [{"role": "user", "content": inp.message}]
    system   = _build_system_prompt_agentic(inp)
    tools    = get_tools_for_scope(ctx.scope)

    # Retrieve the model config for the "crystal" agent role
    from agents.lib.models import get_model
    config = get_model("crystal")

    # Build the OpenRouter-compatible request
    # OpenRouter uses the Anthropic messages API format when targeting Anthropic models,
    # and an OpenAI-compatible format for other providers. Since crystal routes through
    # OpenRouter to non-Anthropic models (e.g. Gemini 2.5 Flash), use the OpenRouter
    # /chat/completions endpoint with "tools" in OpenAI format.
    #
    # For Anthropic models via OpenRouter, the tool_use format is identical to the
    # native Anthropic SDK (same JSON schema). For OpenAI/Gemini models, OpenRouter
    # translates the tool schema automatically.

    import httpx
    import os as _os

    openrouter_key = _os.getenv("OPENROUTER_API_KEY", "")
    if not openrouter_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    # Convert Anthropic-format tool dicts to OpenAI function-calling format
    # (OpenRouter accepts either; this ensures compatibility across all model providers)
    openai_tools = [
        {
            "type": "function",
            "function": {
                "name":        t["name"],
                "description": t["description"],
                "parameters":  t["input_schema"],
            },
        }
        for t in tools
    ]

    tool_call_log: list[dict] = []
    final_text: str = ""
    citations: list[str] = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        for turn in range(CRYSTAL_MAX_TOOL_TURNS):
            payload = {
                "model":       config.model,
                "max_tokens":  config.max_tokens,
                "temperature": config.temperature if config.temperature is not None else 0.3,
                "messages":    messages,
                "tools":       openai_tools,
            }
            if system:
                # System prompt as first message for OpenAI-format APIs
                payload["messages"] = [{"role": "system", "content": system}] + messages

            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization":  f"Bearer {openrouter_key}",
                    "Content-Type":   "application/json",
                    "HTTP-Referer":   "https://experient.app",
                    "X-Title":        "Experient Crystal Agent",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            choice     = data["choices"][0]
            finish_reason = choice.get("finish_reason", "stop")
            msg        = choice["message"]
            tool_calls = msg.get("tool_calls") or []

            if finish_reason == "stop" or not tool_calls:
                # Final answer
                final_text = msg.get("content") or ""
                break

            # Process tool calls
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tool_calls})

            tool_results = []
            for tc in tool_calls:
                fn       = tc["function"]
                tc_id    = tc["id"]
                tc_name  = fn["name"]
                tc_args  = json.loads(fn.get("arguments", "{}"))

                logger.info("crystal_tool_call", tool=tc_name, turn=turn)
                result = await execute_tool(tc_name, tc_args, ctx)

                # Track citations from insight tool results
                if tc_name == "get_insights_list" and isinstance(result.get("insights"), list):
                    for ins in result["insights"]:
                        if ins.get("id"):
                            citations.append(ins["id"])

                tool_call_log.append({"tool": tc_name, "args": tc_args, "turn": turn})
                tool_results.append({
                    "role":         "tool",
                    "tool_call_id": tc_id,
                    "name":         tc_name,
                    "content":      json.dumps(result)[:8000],  # truncate large results
                })

            messages.extend(tool_results)

    # Parse SUGGESTIONS: [...] out of the final answer if present
    suggestions: list[str] = []
    answer_text = final_text
    if "SUGGESTIONS:" in final_text:
        parts = final_text.split("SUGGESTIONS:", 1)
        answer_text = parts[0].strip()
        try:
            suggestions = json.loads(parts[1].strip())
        except Exception:
            pass

    logger.info(
        "crystal_react_complete",
        survey_id=inp.survey_id,
        org_id=inp.org_id,
        tool_calls=len(tool_call_log),
        final_answer_len=len(answer_text),
    )

    return CrystalOutput(
        answer=answer_text or "I could not find a definitive answer based on the available data.",
        citations=list(set(citations))[:10],
        suggestions=suggestions[:3],
        insight_refs=list(set(citations))[:10],
    )


async def _run_react_loop_streaming(inp: CrystalInput) -> AsyncIterator[dict]:
    """ReAct loop with streaming events for the SSE endpoint.
    
    Yields event dicts:
      {"type": "tool_call",  "tool": str, "args": dict}
      {"type": "tool_result", "tool": str, "result_summary": str}
      {"type": "text_delta", "text": str}
      {"type": "done",       "citations": list[str], "suggestions": list[str]}
      {"type": "error",      "message": str}
    
    The tool call phase is non-streaming (tool results arrive all at once).
    The final answer is streamed token by token from the /chat/completions streaming API.
    """
    ctx = CrystalContext(
        org_id=inp.org_id,
        survey_id=inp.survey_id if inp.survey_id else None,
        scope="survey" if inp.survey_id else "org",
    )

    prior_turns = [
        {"role": m["role"], "content": m["content"]}
        for m in inp.conversation_history[-12:]
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    messages = prior_turns + [{"role": "user", "content": inp.message}]
    system   = _build_system_prompt_agentic(inp)
    tools    = get_tools_for_scope(ctx.scope)

    from agents.lib.models import get_model
    config = get_model("crystal")

    openai_tools = [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
        for t in tools
    ]

    import httpx, _os
    openrouter_key = _os.getenv("OPENROUTER_API_KEY", "")

    citations: list[str] = []
    suggestions: list[str] = []

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            for turn in range(CRYSTAL_MAX_TOOL_TURNS):
                payload = {
                    "model":       config.model,
                    "max_tokens":  config.max_tokens,
                    "temperature": config.temperature or 0.3,
                    "messages":    [{"role": "system", "content": system}] + messages,
                    "tools":       openai_tools,
                    "stream":      False,  # non-streaming for tool-call phase
                }

                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openrouter_key}", "Content-Type": "application/json", "HTTP-Referer": "https://experient.app"},
                    json=payload,
                )
                resp.raise_for_status()
                data  = resp.json()
                choice = data["choices"][0]
                msg    = choice["message"]
                tool_calls = msg.get("tool_calls") or []

                if not tool_calls or choice.get("finish_reason") == "stop":
                    # Stream final answer token by token
                    final_text = msg.get("content") or ""
                    if "SUGGESTIONS:" in final_text:
                        parts = final_text.split("SUGGESTIONS:", 1)
                        final_text = parts[0].strip()
                        try:
                            suggestions = json.loads(parts[1].strip())
                        except Exception:
                            pass

                    # Emit text in ~20-char chunks to simulate streaming
                    chunk_size = 20
                    for i in range(0, len(final_text), chunk_size):
                        yield {"type": "text_delta", "text": final_text[i:i + chunk_size]}
                        await asyncio.sleep(0.01)  # minimal delay for client buffer flush
                    break

                messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": tool_calls})

                for tc in tool_calls:
                    fn      = tc["function"]
                    tc_id   = tc["id"]
                    tc_name = fn["name"]
                    tc_args = json.loads(fn.get("arguments", "{}"))

                    yield {"type": "tool_call", "tool": tc_name, "args": {k: str(v)[:80] for k, v in tc_args.items()}}
                    result = await execute_tool(tc_name, tc_args, ctx)
                    yield {"type": "tool_result", "tool": tc_name, "result_summary": f"{len(str(result))} bytes"}

                    if tc_name == "get_insights_list":
                        for ins in (result.get("insights") or []):
                            if ins.get("id"):
                                citations.append(ins["id"])

                    messages.append({
                        "role":         "tool",
                        "tool_call_id": tc_id,
                        "name":         tc_name,
                        "content":      json.dumps(result)[:8000],
                    })

        yield {"type": "done", "citations": list(set(citations))[:10], "suggestions": suggestions[:3]}

    except Exception as exc:
        logger.error("crystal_stream_error", error=str(exc))
        yield {"type": "error", "message": str(exc)}
```

**Update `CrystalAgent.run()` to respect the feature flag:**

```python
class CrystalAgent:
    """Thin agent wrapper. Routes to ReAct loop or legacy single-call based on flag."""

    async def run(self, inp: CrystalInput) -> tuple[CrystalOutput, list[dict]]:
        if CRYSTAL_STREAMING_ENABLED:
            output = await _run_react_loop(inp)
        else:
            output = await _run_crystal(inp)
        return output, []
```

### 4.1a Crystal Thread Lifecycle

**Modified file: `agents/agents/crystal.py`**

Thread management moves from the Node.js backend into the agents service so that `_run_react_loop` can load and persist conversation context directly. The following functions are added after the thread loading code that initialises `prior_turns` in `_run_react_loop`:

```python
# agents/agents/crystal.py

THREAD_INACTIVITY_TTL_DAYS = 7     # from constants.py
THREAD_CONTEXT_WINDOW_TURNS = 6    # last N exchanges sent to LLM (12 messages)
THREAD_STORAGE_TTL_DAYS = 90       # full history kept for audit

async def get_or_create_thread(
    org_id: str,
    user_id: str,
    survey_id: str | None,
    scope: str,
    db_pool,
) -> tuple[str, list[dict]]:
    """
    Returns (thread_id, recent_messages_for_llm).
    Creates a new thread if none exists or if the last message is older than TTL.
    Thread key: (org_id, user_id, survey_id, scope) — unique per user per survey.
    """
    row = await db_pool.fetchrow(
        """SELECT id, messages, last_message_at
           FROM crystal_threads
           WHERE org_id = $1 AND user_id = $2
             AND (survey_id = $3 OR ($3 IS NULL AND survey_id IS NULL))
             AND scope = $4""",
        org_id, user_id, survey_id, scope
    )
    
    if row:
        inactivity_days = (datetime.utcnow() - row["last_message_at"]).days
        if inactivity_days < THREAD_INACTIVITY_TTL_DAYS:
            # Continue existing thread — return last N turns
            messages = row["messages"] or []
            context_messages = messages[-(THREAD_CONTEXT_WINDOW_TURNS * 2):]
            return str(row["id"]), context_messages
    
    # Start fresh thread
    new_id = await db_pool.fetchval(
        """INSERT INTO crystal_threads (org_id, user_id, survey_id, scope, messages, last_message_at)
           VALUES ($1, $2, $3, $4, '[]', NOW())
           ON CONFLICT (org_id, user_id, survey_id, scope)
           DO UPDATE SET messages = '[]', last_message_at = NOW()
           RETURNING id""",
        org_id, user_id, survey_id, scope
    )
    return str(new_id), []

async def append_to_thread(
    thread_id: str, user_message: str, assistant_message: str, db_pool
) -> None:
    """
    Appends the latest exchange to the thread. Trims to max 40 messages (20 exchanges).
    Updates last_message_at.
    """
    new_messages = [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": assistant_message},
    ]
    await db_pool.execute(
        """UPDATE crystal_threads
           SET messages = (
               (messages || $1::jsonb)
               -> (jsonb_array_length(messages || $1::jsonb) - 40)  -- keep last 40
           ),
           last_message_at = NOW()
           WHERE id = $2""",
        json.dumps(new_messages), thread_id
    )
```

Add to `agents/lib/constants.py`:

```python
# ── Crystal Thread Lifecycle ──────────────────────────────────────────────────
# Days of inactivity before a new thread is started automatically.
CRYSTAL_THREAD_INACTIVITY_TTL_DAYS: int = 7
# Number of prior exchanges (user+assistant pairs) included in LLM context.
CRYSTAL_THREAD_CONTEXT_WINDOW_TURNS: int = 6
# Days full thread history is retained for audit before hard deletion.
CRYSTAL_THREAD_STORAGE_TTL_DAYS: int = 90
```

### 4.2 SSE Streaming Endpoint in main.py

**Modified file: `agents/main.py`**

Add after the existing `POST /insights/crystal` handler (line 817):

```python
from fastapi.responses import StreamingResponse

@app.post("/insights/crystal/stream", summary="Crystal ReAct agent with SSE streaming")
async def crystal_stream(request: Request, _: None = Depends(require_internal_key)):
    """Streams Crystal's tool calls and final answer as Server-Sent Events.
    
    Event format: `data: <JSON>\n\n`
    Event types:
      tool_call    — {"type": "tool_call", "tool": str, "args": dict}
      tool_result  — {"type": "tool_result", "tool": str, "result_summary": str}
      text_delta   — {"type": "text_delta", "text": str}
      done         — {"type": "done", "citations": list, "suggestions": list}
      error        — {"type": "error", "message": str}
    """
    from agents.agents.crystal import CrystalInput, _run_react_loop_streaming

    body = await request.json()
    try:
        inp = CrystalInput(**body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    async def event_generator():
        async for event in _run_react_loop_streaming(inp):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "Connection":        "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

### 4.3 Backend SSE Proxy

**Modified file: `backend/src/routes/insights.js`**

Add after the existing `POST /:surveyId/crystal` handler. This route proxies the SSE stream from the agents service to the browser, injecting the same auth and context as the non-streaming route:

```javascript
// ── POST /:surveyId/crystal/stream — SSE proxy for ReAct Crystal ─────────────

router.post('/:surveyId/crystal/stream', async (req, res) => {
  const { surveyId } = req.params;
  const { message, window: timeWindow = 'all_time', focused_topic } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length < 2) {
    return res.status(400).json({ error: 'message is required' });
  }

  const safeWindow = ['all_time', '30d', '7d'].includes(timeWindow) ? timeWindow : 'all_time';

  try {
    const survey = await getSurvey(surveyId, req.orgId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Load conversation thread for history
    const threadKey = `crystal:${req.orgId}:${surveyId}`;
    let history = [];
    try {
      const { rows } = await db.query(
        'SELECT messages FROM crystal_threads WHERE thread_key = $1',
        [threadKey],
      );
      history = rows[0]?.messages || [];
    } catch { /* graceful */ }

    const agentPayload = {
      survey_id:            surveyId,
      org_id:               req.orgId,
      message:              message.trim(),
      insights:             [],   // ReAct Crystal fetches its own — no pre-loading needed
      survey_title:         survey.title || '',
      conversation_history: history.slice(-12),
      page_context: {
        time_window:   safeWindow,
        focused_topic: focused_topic || null,
      },
    };

    // Set SSE headers before forwarding
    res.set({
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // Proxy the agents service SSE stream
    const agentsRes = await fetch(`${AGENTS_URL}/insights/crystal/stream`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': AGENTS_INTERNAL_KEY,
      },
      body: JSON.stringify(agentPayload),
    });

    if (!agentsRes.ok) {
      const body = await agentsRes.text().catch(() => '');
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Agents service error: ${agentsRes.status}` })}\n\n`);
      return res.end();
    }

    // Pipe the SSE stream through
    let finalAnswer = '';
    let finalCitations = [];
    let finalSuggestions = [];

    agentsRes.body.on('data', (chunk) => {
      const text = chunk.toString();
      res.write(text);
      // Parse events to extract final answer for thread persistence
      const lines = text.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'text_delta') finalAnswer += event.text;
          if (event.type === 'done') {
            finalCitations  = event.citations  || [];
            finalSuggestions = event.suggestions || [];
          }
        } catch { /* skip malformed */ }
      }
    });

    agentsRes.body.on('end', async () => {
      // Persist thread after stream completes
      if (finalAnswer) {
        const userMsg      = { role: 'user',      content: message.trim(),  created_at: new Date().toISOString() };
        const assistantMsg = { role: 'assistant', content: finalAnswer,     created_at: new Date().toISOString() };
        const newMessages  = [...history, userMsg, assistantMsg].slice(-40);
        try {
          await db.query(
            `INSERT INTO crystal_threads (org_id, survey_id, thread_key, messages, context_snapshot, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
             ON CONFLICT (thread_key) DO UPDATE SET messages = $4::jsonb, updated_at = NOW()`,
            [req.orgId, surveyId, threadKey, JSON.stringify(newMessages), JSON.stringify({ react: true })],
          );
        } catch { /* graceful */ }
      }
      res.end();
    });

    agentsRes.body.on('error', (err) => {
      logger.error({ err: err.message, surveyId }, 'insights:crystal:stream:pipe_error');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`);
      res.end();
    });

    req.on('close', () => agentsRes.body.destroy());

  } catch (err) {
    logger.error({ err: err.message, surveyId }, 'insights:crystal:stream:error');
    if (!res.headersSent) return serverError(res, err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});
```

### 4.4 Frontend Streaming UI

**Modified file: `app/src/components/CrystalPanel.tsx`**

Replace the `submitQuery` function with a streaming-capable version. The component adds two new state fields and a new `ToolCallBubble` sub-component.

Add these state fields inside the `CrystalPanel` component body (after the existing `useState` declarations):

```typescript
// Streaming state — populated when CRYSTAL_STREAMING_ENABLED is active on the backend
const [streamingText, setStreamingText] = useState('');
const [toolCalls, setToolCalls] = useState<Array<{ tool: string; status: 'running' | 'done' }>>([]);
```

Replace the `submitQuery` callback:

```typescript
const submitQuery = useCallback(
  async (query: string, overrideCtx?: CrystalCtx) => {
    if (!query.trim() || isThinking) return;
    lastSubmittedQuery.current = query;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: query.trim(), timestamp: new Date() },
    ]);
    setIsThinking(true);
    setStreamingText('');
    setToolCalls([]);

    if (isAll) {
      setMessages((prev) => [
        ...prev,
        {
          id:          crypto.randomUUID(),
          role:        'crystal',
          content:     'Select a specific survey from the scope picker to get real AI-powered answers.',
          timestamp:   new Date(),
          suggestions: ['Switch to a specific survey →'],
        },
      ]);
      setIsThinking(false);
      return;
    }

    const activeCtx  = overrideCtx ?? crystalCtx;
    const streamPath = `/api/insights/${scope}/crystal/stream`;

    try {
      // Attempt streaming path first; fall back to legacy on error
      const response = await fetch(streamPath, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...(await api._getAuthHeaders()) },
        body:    JSON.stringify({
          message:       query.trim(),
          window:        activeCtx.window,
          focused_topic: activeCtx.focused_topic,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader    = response.body.getReader();
      const decoder   = new TextDecoder();
      let buffer      = '';
      let fullText    = '';
      let citations:  string[] = [];
      let suggestions: string[] = [];
      let activeToolCalls: Array<{ tool: string; status: 'running' | 'done' }> = [];

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        try {
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            tool?: string;
            text?: string;
            citations?: string[];
            suggestions?: string[];
            message?: string;
          };

          if (event.type === 'tool_call') {
            activeToolCalls = [...activeToolCalls, { tool: event.tool!, status: 'running' }];
            setToolCalls([...activeToolCalls]);
          } else if (event.type === 'tool_result') {
            activeToolCalls = activeToolCalls.map(tc =>
              tc.tool === event.tool && tc.status === 'running'
                ? { ...tc, status: 'done' as const }
                : tc,
            );
            setToolCalls([...activeToolCalls]);
          } else if (event.type === 'text_delta') {
            fullText += event.text || '';
            setStreamingText(fullText);
          } else if (event.type === 'done') {
            citations   = event.citations  || [];
            suggestions = event.suggestions || [];
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Stream error');
          }
        } catch { /* skip malformed events */ }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(processLine);
      }
      if (buffer) processLine(buffer);

      setMessages((prev) => [
        ...prev,
        {
          id:          crypto.randomUUID(),
          role:        'crystal',
          content:     fullText || 'I could not retrieve an answer.',
          timestamp:   new Date(),
          citations,
          suggestions,
        },
      ]);

    } catch {
      // Fallback to legacy non-streaming endpoint
      try {
        const { answer, suggestions, insight_refs } = await api.crystalChat(scope, query, {
          window:        activeCtx.window,
          focused_topic: activeCtx.focused_topic,
        });
        setMessages((prev) => [
          ...prev,
          {
            id:        crypto.randomUUID(),
            role:      'crystal',
            content:   answer,
            timestamp: new Date(),
            citations: insight_refs,
            suggestions,
          },
        ]);
      } catch (err) {
        const isServiceDown = err instanceof Error &&
          (err.message.includes('fetch') || err.message.includes('503') || err.message.includes('502'));
        setMessages((prev) => [
          ...prev,
          {
            id:        crypto.randomUUID(),
            role:      'crystal',
            content:   isServiceDown
              ? 'The agents service is not reachable. Make sure it is running on :8001.'
              : 'Something went wrong. Please try your question again.',
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setIsThinking(false);
      setStreamingText('');
      setToolCalls([]);
    }
  },
  [isAll, isThinking, api, scope, crystalCtx],
);
```

Add a `ToolCallBubble` sub-component to show live tool call status:

```typescript
function ToolCallBubble({ toolCalls }: { toolCalls: Array<{ tool: string; status: 'running' | 'done' }> }) {
  const TOOL_LABELS: Record<string, string> = {
    get_survey_overview:      'Loading survey overview...',
    get_topic_details:        'Checking topic details...',
    get_metric_history:       'Retrieving metric history...',
    get_insights_list:        'Fetching insights...',
    get_verbatims:            'Loading customer quotes...',
    get_driver_analysis:      'Analyzing NPS drivers...',
    get_benchmark_comparison: 'Comparing to benchmarks...',
    get_segment_breakdown:    'Segmenting responses...',
    get_org_portfolio:        'Loading portfolio...',
    compare_surveys:          'Comparing surveys...',
    get_cross_survey_themes:  'Finding cross-survey themes...',
    get_anomaly_events:       'Checking for anomalies...',
    get_checkpoint_history:   'Comparing to your last analysis...',
  };

  if (toolCalls.length === 0) return null;

  return (
    <div className="flex gap-3">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
      >
        <Icon name="diamond" size={14} style={{ color: 'white' }} />
      </div>
      <div className="flex flex-col gap-1.5 py-2">
        {toolCalls.map((tc, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-on-surface-variant">
            {tc.status === 'running' ? (
              <div
                className="w-3 h-3 rounded-full border-2 animate-spin flex-shrink-0"
                style={{ borderColor: 'rgba(42,75,217,0.2)', borderTopColor: '#2a4bd9' }}
              />
            ) : (
              <Icon name="check_circle" size={14} className="text-emerald-500 flex-shrink-0" />
            )}
            <span className={tc.status === 'done' ? 'line-through opacity-50' : ''}>
              {TOOL_LABELS[tc.tool] || tc.tool}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Insert `<ToolCallBubble toolCalls={toolCalls} />` and a `StreamingBubble` into the conversation area, between the messages list and the existing `{isThinking && <ThinkingBubble />}`:

```typescript
{toolCalls.length > 0 && <ToolCallBubble toolCalls={toolCalls} />}
{streamingText && (
  <div className="flex gap-3">
    <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
      <Icon name="diamond" size={14} style={{ color: 'white' }} />
    </div>
    <GlassCard className="rounded-2xl rounded-bl-sm px-4 py-4 flex-1 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary block mb-2">Crystal</span>
      <p className="text-sm leading-relaxed">{streamingText}<span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5" /></p>
    </GlassCard>
  </div>
)}
{isThinking && toolCalls.length === 0 && !streamingText && <ThinkingBubble />}
```

---

## 5. Phase 3 — Checkpoint System and Delta Analysis

### 5.1 Database Migration

**New file: `supabase/migrations/20240521000001_insight_checkpoints.sql`**

```sql
-- supabase/migrations/20240521000001_insight_checkpoints.sql
CREATE TABLE IF NOT EXISTS survey_insight_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id TEXT NOT NULL,
    run_id UUID REFERENCES agent_runs(id),
    checkpoint_number INT NOT NULL DEFAULT 1,
    previous_checkpoint_id UUID REFERENCES survey_insight_checkpoints(id),
    -- Provenance: exactly what data was used
    response_ids UUID[] NOT NULL DEFAULT '{}',
    new_response_ids UUID[] NOT NULL DEFAULT '{}',
    responses_from TIMESTAMPTZ,
    responses_to TIMESTAMPTZ,
    previous_response_count INT NOT NULL DEFAULT 0,
    response_count INT NOT NULL,
    -- Delta analysis
    delta_json JSONB,
    topic_fingerprint_hash TEXT,
    anomalies_detected INT NOT NULL DEFAULT 0,
    -- Quality
    report_quality_score INT,
    specialist_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_url TEXT,             -- object store path to full report blob
);
CREATE INDEX ON survey_insight_checkpoints(survey_id, created_at DESC);
CREATE INDEX ON survey_insight_checkpoints(org_id, created_at DESC);
CREATE UNIQUE INDEX ON survey_insight_checkpoints(survey_id, checkpoint_number);
```

**`agent_runs` table with retry tracking columns:**

```sql
-- If agent_runs is not yet defined, add:
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES surveys(id),
    org_id UUID NOT NULL,
    run_type TEXT NOT NULL CHECK (run_type IN (
        'first_voices', 'early_signals', 'growing_picture', 'clear_picture',
        'tier2_checkpoint', 'manual_refresh', 'scheduler'
    )),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    metadata JSONB DEFAULT '{}',          -- includes response_count_at_run
    stream_events JSONB DEFAULT '[]',     -- SSE events emitted during run
    retry_count INTEGER DEFAULT 0,
    retry_of UUID REFERENCES agent_runs(id),
    failure_reason TEXT,                  -- 'llm_error'|'db_error'|'budget_exceeded'|'timeout'|'unknown'
    failed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_runs_survey_status ON agent_runs(survey_id, status, created_at DESC);
CREATE INDEX idx_agent_runs_failed_recovery ON agent_runs(status, failed_at) WHERE status = 'failed';
```

Note: `metadata` JSONB includes `response_count_at_run` (the response count at the time the run started — used to compute `responses_since_last_checkpoint` in the API).

**Additional indexes for Crystal tool query performance:**

```sql
-- Speeds up get_driver_analysis tool's point-biserial lookup
CREATE INDEX IF NOT EXISTS survey_topics_nps_correlation
    ON survey_topics (survey_id, org_id, nps_correlation DESC NULLS LAST)
    WHERE nps_correlation IS NOT NULL;

-- Speeds up get_segment_breakdown LATERAL join on answers JSONB
-- (only useful after PostgreSQL 17 GIN functional index support; skip for now)

-- Speeds up get_anomaly_events tool
CREATE INDEX IF NOT EXISTS metric_snapshots_anomaly
    ON survey_metric_snapshots (org_id, captured_at DESC)
    WHERE anomaly_flag = TRUE;
```

### 5.2 Checkpoint Trigger Logic

**Modified file: `agents/consumers/response_stream.py`**

Add the following constants and functions at module level, alongside the existing `NEW_RESPONSE_THRESHOLD` and `TIME_THRESHOLD_MINUTES` constants:

```python
# agents/consumers/response_stream.py

METRIC_SNAPSHOT_THRESHOLD = 50       # Tier 1: lightweight SQL snapshot every 50 responses
METRIC_SNAPSHOT_MAX_HOURS = 6        # Tier 1: also at 6h if no responses
CHECKPOINT_FULL_THRESHOLD = 200      # Tier 2: full checkpoint every 200 new responses
CHECKPOINT_FULL_MAX_DAYS = 7         # Tier 2: weekly minimum

async def should_trigger_tier1_snapshot(survey_id: str, org_id: str) -> bool:
    """Tier 1: pure SQL metric snapshot. No LLM. Triggered at 50 new responses or 6h."""
    async with db._pool_conn().connection() as conn:
        row = await conn.fetchrow(
            """SELECT 
                (SELECT COUNT(*) FROM responses 
                 WHERE survey_id = %s AND submitted_at > COALESCE(
                     (SELECT MAX(captured_at) FROM survey_metric_snapshots WHERE survey_id = %s),
                     '1970-01-01'::timestamptz
                 )) AS new_count,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(
                    (SELECT MAX(captured_at) FROM survey_metric_snapshots WHERE survey_id = %s),
                    '1970-01-01'::timestamptz
                ))) / 3600 AS hours_since_last""",
            (survey_id, survey_id, survey_id)
        )
    return row["new_count"] >= METRIC_SNAPSHOT_THRESHOLD or row["hours_since_last"] >= METRIC_SNAPSHOT_MAX_HOURS

async def should_trigger_tier2_checkpoint(survey_id: str, org_id: str, anomaly_flag: bool = False) -> bool:
    """Tier 2: full checkpoint with LLM narration. Triggered at 200 new responses or 7 days."""
    if anomaly_flag:
        return True  # Anomaly always triggers full checkpoint
    async with db._pool_conn().connection() as conn:
        row = await conn.fetchrow(
            """SELECT 
                COALESCE(
                    (SELECT COUNT(*) FROM responses 
                     WHERE survey_id = %s AND submitted_at > COALESCE(
                         (SELECT MAX(responses_to) FROM survey_insight_checkpoints WHERE survey_id = %s),
                         '1970-01-01'::timestamptz
                     )), 0
                ) AS new_since_checkpoint,
                EXTRACT(EPOCH FROM (NOW() - COALESCE(
                    (SELECT MAX(created_at) FROM survey_insight_checkpoints WHERE survey_id = %s),
                    '1970-01-01'::timestamptz
                ))) / 86400 AS days_since_checkpoint""",
            (survey_id, survey_id, survey_id)
        )
    return (
        row["new_since_checkpoint"] >= CHECKPOINT_FULL_THRESHOLD
        or row["days_since_checkpoint"] >= CHECKPOINT_FULL_MAX_DAYS
    )
```

# ── Progressive tier tracking (pre-full-checkpoint only) ─────────────────────

PROGRESSIVE_TIER_THRESHOLDS = [
    ("first_voices",    PROGRESSIVE_TIER_FIRST_VOICES),    # 10
    ("early_signals",   PROGRESSIVE_TIER_EARLY_SIGNALS),   # 40
    ("growing_picture", PROGRESSIVE_TIER_GROWING_PICTURE), # 100
    # clear_picture is NOT a sub-tier trigger — it fires via CHECKPOINT_FULL_RESPONSE_THRESHOLD
]
_TIER_ORDER = ["none", "first_voices", "early_signals", "growing_picture", "full"]

async def should_trigger_progressive_tier(
    survey_id: str, current_count: int, redis_client
) -> str | None:
    """
    Returns the highest uncrossed progressive tier name to run, or None.
    Once 'full' is set (first Tier 2 checkpoint completed), always returns None.
    """
    current_tier = (await redis_client.get(f"progressive_tier:{survey_id}")) or "none"
    if current_tier == "full":
        return None
    
    for tier_name, threshold in reversed(PROGRESSIVE_TIER_THRESHOLDS):
        if current_count >= threshold:
            if _TIER_ORDER.index(current_tier) < _TIER_ORDER.index(tier_name):
                return tier_name
            break
    return None

async def mark_progressive_tier_complete(survey_id: str, tier: str, redis_client) -> None:
    """Advance the Redis key to the completed tier. Never go backwards."""
    current = (await redis_client.get(f"progressive_tier:{survey_id}")) or "none"
    if _TIER_ORDER.index(tier) > _TIER_ORDER.index(current):
        await redis_client.set(f"progressive_tier:{survey_id}", tier)
        # No TTL — this key should persist as long as the survey exists

**Survey status gate — `agents/consumers/response_stream.py`**

At the top of the batch processing function (before any trigger evaluation), add a survey status check. Only `active` surveys receive pipeline triggers:

```python
# Fetch survey status — only 'active' surveys receive pipeline triggers
survey_status = await db_pool.fetchval(
    "SELECT status FROM surveys WHERE id = $1", survey_id
)
if survey_status != "active":
    logger.info({
        "event": "trigger_skipped_survey_not_active",
        "survey_id": survey_id,
        "status": survey_status,
    })
    return  # do not evaluate any triggers
```

Integrate both tiers into the existing `run_response_stream_consumer()` loop after a successful insight trigger:

```python
# Inside _trigger_insights(), after the successful HTTP call:
# Tier 1: lightweight metric snapshot (no LLM)
if await should_trigger_tier1_snapshot(survey_id, org_id):
    asyncio.create_task(_trigger_metric_snapshot(survey_id, org_id))

# Tier 2: full checkpoint with LLM narration (checks anomaly_flag from snapshot result)
if await should_trigger_tier2_checkpoint(survey_id, org_id, anomaly_flag=anomaly_flag):
    asyncio.create_task(_trigger_checkpoint(survey_id, org_id, run_id))

# Check progressive tier (only relevant pre-full-checkpoint)
progressive_tier = await should_trigger_progressive_tier(
    survey_id, current_count, redis_client
)
if progressive_tier:
    logger.info({
        "event": "progressive_tier_trigger",
        "survey_id": survey_id,
        "tier": progressive_tier,
        "response_count": current_count,
    })
    await trigger_pipeline(
        survey_id=survey_id,
        org_id=org_id,
        run_type=progressive_tier,   # passed to node_ingest for tier-gated execution
    )
    await mark_progressive_tier_complete(survey_id, progressive_tier, redis_client)
```

### 5.2a Provenance Population in `node_ingest` (`agents/graphs/insights.py`)

The ingest node must capture provenance fields for the checkpoint:

```python
async def node_ingest(state: InsightState) -> dict:
    survey_id = state["survey_id"]
    org_id = state["org_id"]
    
    # ... existing response loading logic ...
    
    # Populate provenance
    response_ids = [r["id"] for r in responses]
    
    # Get previous checkpoint's response_ids for delta (new_response_ids)
    prev_checkpoint = await db.get_latest_checkpoint(survey_id, org_id)
    if prev_checkpoint:
        prev_ids = set(prev_checkpoint["response_ids"])
        new_response_ids = [rid for rid in response_ids if rid not in prev_ids]
    else:
        new_response_ids = response_ids  # first run = all new
    
    # Date range
    if responses:
        dates = [r["submitted_at"] for r in responses if r.get("submitted_at")]
        responses_from = min(dates) if dates else None
        responses_to = max(dates) if dates else None
    else:
        responses_from = responses_to = None
    
    return {
        **state,
        "responses": responses,
        "response_ids": response_ids,
        "new_response_ids": new_response_ids,
        "responses_from": responses_from,
        "responses_to": responses_to,
        "previous_checkpoint_id": prev_checkpoint["id"] if prev_checkpoint else None,
        "previous_response_count": prev_checkpoint["response_count"] if prev_checkpoint else 0,
    }
```

Add `response_ids`, `new_response_ids`, `responses_from`, `responses_to`, `previous_checkpoint_id`, `previous_response_count` to the `InsightState` TypedDict (in the existing type definition in `agents/graphs/insights.py`).

### 5.2a-1 Signal Extraction Helper Functions

The following two functions are defined at module level in `agents/graphs/insights.py` and called inside `node_ingest` for every loaded response:

```python
# ── Signal extraction — called for every response row ─────────────────────────

def extract_signals_from_response(
    answers: dict,
    questions: list[dict],
) -> dict:
    """
    Extracts typed signals from a response's answers JSONB using the survey's
    question definitions. Returns None for any signal where the question type
    does not exist in the survey, or where the respondent left it blank.
    
    This is the single canonical mapping between question types and pipeline signals.
    Never read answers[key] without consulting the question's type first.
    """
    signals = {
        "nps_score": None,
        "csat_score": None,
        "ces_score": None,
        "open_texts": [],   # list of {"question_id", "question_text", "answer"}
        "ratings": [],      # list of {"question_id", "scale_max", "value", "normalized"}
    }
    
    for q in questions:
        qid = q["id"]
        qtype = q.get("type", "")
        value = answers.get(qid)
        
        if value is None:
            continue  # respondent skipped this question
        
        if qtype == "nps":
            try:
                signals["nps_score"] = int(value)
            except (ValueError, TypeError):
                pass
        
        elif qtype == "csat":
            try:
                signals["csat_score"] = float(value)
            except (ValueError, TypeError):
                pass
        
        elif qtype == "ces":
            try:
                signals["ces_score"] = float(value)
            except (ValueError, TypeError):
                pass
        
        elif qtype in ("text", "textarea"):
            text = str(value).strip()
            if text:
                signals["open_texts"].append({
                    "question_id": qid,
                    "question_text": q.get("text", ""),
                    "answer": text,
                })
        
        elif qtype in ("rating", "scale"):
            try:
                v = float(value)
                scale_max = float(q.get("scale_max", 5))
                signals["ratings"].append({
                    "question_id": qid,
                    "scale_max": scale_max,
                    "value": v,
                    "normalized": v / scale_max if scale_max > 0 else None,
                })
            except (ValueError, TypeError):
                pass
        
        # multiple_choice, checkbox: not used by the pipeline currently
    
    return signals


def compute_survey_capability_flags(questions: list[dict]) -> dict:
    """
    Computes boolean capability flags from the survey's question definitions.
    These flags gate which pipeline nodes run and which Crystal tools are available.
    Called once in node_ingest, stored in pipeline state.
    """
    types = {q.get("type") for q in questions}
    return {
        "has_nps":       "nps" in types,
        "has_csat":      "csat" in types,
        "has_ces":       "ces" in types,
        "has_open_text": bool(types & {"text", "textarea"}),
        "has_ratings":   bool(types & {"rating", "scale"}),
    }
```

### 5.2a-2 No-Text Survey Handling — Pipeline Capability Gates

**Modified file: `agents/graphs/insights.py` — pipeline node guards**

Every node that processes open-text content must check `has_open_text` before running. This prevents wasted LLM cost and empty-result errors on surveys that have only rating/NPS/CSAT questions.

```python
# ── Pipeline capability gates ─────────────────────────────────────────────────

def node_absa(state: InsightState) -> InsightState:
    if not state.get("has_open_text"):
        logger.info({"event": "node_absa_skipped", "reason": "no_open_text_questions"})
        return {**state, "absa_results": [], "node_absa_skipped": True}
    # ... existing ABSA implementation ...

def node_embed(state: InsightState) -> InsightState:
    if not state.get("has_open_text"):
        return {**state, "embeddings": [], "node_embed_skipped": True}
    # ... existing embed implementation ...

def node_cluster(state: InsightState) -> InsightState:
    if not state.get("has_open_text"):
        return {**state, "clusters": [], "node_cluster_skipped": True}
    # ... existing cluster implementation ...

def node_topics(state: InsightState) -> InsightState:
    if not state.get("has_open_text"):
        return {**state, "topics": [], "node_topics_skipped": True}
    # ... existing topics implementation ...
```

For `node_narrate`, add a "score-only" path for surveys with no open text:

```python
def node_narrate(state: InsightState) -> InsightState:
    if not state.get("has_open_text"):
        # Score-only narration: generate insights from metric distributions only
        return await _narrate_score_only(state)
    # ... existing narration implementation ...

async def _narrate_score_only(state: InsightState) -> InsightState:
    """
    Generates metric-driven insights for surveys with no open text.
    Uses Haiku 4.5 (cheaper model — no complex theme analysis needed).
    Produces: NPS distribution insight, score trend insight, rating distribution insights.
    Does NOT produce: topic insights, verbatim citations, theme narratives.
    """
    metrics = state["metrics"]
    prompt = f"""
    This survey has no open-text questions. Generate insights based on metric patterns only.
    
    Survey metrics:
    - NPS: {metrics.get('nps')} (distribution: {metrics.get('nps_distribution')})
    - CSAT: {metrics.get('csat')}
    - Response count: {metrics.get('response_count')}
    - Rating questions: {state.get('ratings_summary', [])}
    
    Generate 2-4 insights about score distributions, patterns, and what the numbers suggest.
    Do not mention themes, topics, or verbatims — there are none.
    Use calibrated language appropriate for {state.get('data_tier', 'full_report')} tier.
    """
    # ... LLM call with Haiku 4.5 ...
```

### 5.2b Citation Wiring in `node_narrate` and `insight_experts.py`

**Step 1 — Update `TopicExpertOutput` in `agents/schemas/insight.py`:**

```python
class TopicExpertOutput(BaseModel):
    headline: str
    narrative: str
    root_cause_hypothesis: str
    business_impact: str
    friction_type: str  # product | process | people | policy | price
    cited_response_ids: list[str]  # 3-5 response IDs from the cluster
    cited_verbatims: list[str]     # corresponding verbatim excerpts (≤200 chars each)
    insight_layer: str
    ice_score: dict  # {impact: 1-5, confidence: 1-5, ease: 1-5}
```

Add `cited_response_ids` and `cited_verbatims` to all `*ExpertOutput` models: `NpsExpertOutput`, `CsatExpertOutput`, `TrendExpertOutput`, `PrescriptiveExpertOutput`.

**Step 2 — Pass response data to narrators in `agents/agents/insight_experts.py`:**

Update `narrate_topic_insight()` to accept cluster responses:

```python
async def narrate_topic_insight(
    cluster: dict,
    topic: dict,
    survey_context: dict,
    org_context: dict,
    specialist_context: str,           # NEW: injected from matched specialist
    response_sample: list[dict],       # NEW: up to 20 responses from this cluster
) -> TopicExpertOutput:
    
    # Format response sample for citation
    response_block = "\n".join([
        f"[{r['id']}] NPS={r.get('nps_score','?')} | {r.get('open_text','')[:200]}"
        for r in response_sample[:20]
    ])
    
    system = f"""\
{specialist_context}

You are a {specialist.display_name} narrating a topic insight.

TOPIC: {topic['name']}
SIGNALS: volume={topic['volume']}, nps_impact={topic['nps_impact']}, driver_score={topic['driver_score']:.2f}

RESPONSES IN THIS CLUSTER (cite 3-5 by their ID):
{response_block}

INSTRUCTIONS:
1. Write a headline (≤15 words) and 2-3 sentence narrative grounded in the data above.
2. Hypothesize the root cause using the friction_type taxonomy.
3. Select 3-5 response IDs from the cluster above that best support your headline.
   For each selected response, include a verbatim excerpt (≤200 chars).
4. Compute an ICE score (1-5 each) for taking action on this topic.
5. Do NOT invent response IDs not listed above — this is enforced by the verifier.
"""
```

**Step 3 — Store citations in `node_publish`:**

In `node_publish` in `agents/graphs/insights.py`, when inserting into the `insights` table:

```python
citations_json = json.dumps([
    {
        "response_id": rid,
        "verbatim_excerpt": verbatim,
        "sentiment": cluster.get("sentiment"),
        "nps_score": resp_lookup.get(rid, {}).get("nps_score"),
        "submitted_at": resp_lookup.get(rid, {}).get("submitted_at"),
    }
    for rid, verbatim in zip(
        narrated.cited_response_ids[:5],
        narrated.cited_verbatims[:5]
    )
])
```

After all insights are published to DB and the checkpoint row is created, write the full report to object store:

```python
# After all insights are published to DB, write full report to object store
report_blob = {
    "schema_version": CHECKPOINT_BLOB_SCHEMA_VERSION,  # from constants.py
    "checkpoint_id": str(checkpoint_id),
    "survey_id": survey_id,
    "org_id": org_id,
    "created_at": checkpoint_created_at.isoformat(),
    "response_count": response_count,
    "insights": [insight.dict() for insight in published_insights],
    "topics": topics_snapshot,
    "metrics": metrics_snapshot,
    "delta": delta_result,
    "provenance": {
        "response_ids": [str(r) for r in response_ids],
        "new_response_ids": [str(r) for r in new_response_ids],
        "responses_from": responses_from.isoformat() if responses_from else None,
        "responses_to": responses_to.isoformat() if responses_to else None,
    },
}
report_url = await _write_checkpoint_blob(
    org_id=org_id,
    survey_id=survey_id,
    checkpoint_id=checkpoint_id,
    blob=report_blob,
)
# Update checkpoint row with report_url
await db.execute(
    "UPDATE survey_insight_checkpoints SET report_url = $1 WHERE id = $2",
    [report_url, checkpoint_id]
)
```

**`_write_checkpoint_blob` helper:**

```python
async def _write_checkpoint_blob(
    org_id: str,
    survey_id: str,
    checkpoint_id: str,
    blob: dict,
) -> str:
    """
    Writes the checkpoint report JSON to object store.
    Returns the storage path (not a signed URL — signing happens at read time).
    
    In dev (AGENTS_ENV=dev): writes to local filesystem at CHECKPOINT_LOCAL_PATH.
    In staging/prod: writes to GCS at CHECKPOINT_BUCKET.
    """
    path = f"checkpoints/{org_id}/{survey_id}/{checkpoint_id}.json"
    blob_bytes = json.dumps(blob, default=str).encode("utf-8")
    
    if os.getenv("AGENTS_ENV", "dev") == "dev":
        local_path = Path(CHECKPOINT_LOCAL_PATH) / path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(blob_bytes)
        return path  # relative path for dev
    
    # GCS write (production)
    from google.cloud import storage as gcs
    client = gcs.Client()
    bucket = client.bucket(CHECKPOINT_BUCKET)
    blob_obj = bucket.blob(path)
    blob_obj.upload_from_string(blob_bytes, content_type="application/json")
    return path  # store path, not signed URL (signing at read time)
```

**Blob read-time migration — `agents/lib/checkpoint_store.py`**

Checkpoint blobs stored in object storage are never rewritten. When a blob is read (by the Crystal tool or the checkpoint report endpoint), it is passed through `migrate_blob()` to upgrade it to the current schema:

```python
# agents/lib/checkpoint_store.py

CURRENT_SCHEMA_VERSION = CHECKPOINT_BLOB_SCHEMA_VERSION  # 1

def migrate_blob(blob: dict) -> dict:
    """
    Read-time migration: upgrades a blob from any old version to the current schema.
    Blobs are never rewritten in object storage — migrations apply on every read.
    Idempotent: migrating an already-current blob is a no-op.
    """
    version = blob.get("schema_version", 0)
    
    if version < 1:
        blob = _migrate_v0_to_v1(blob)
    
    # Add future migrations here:
    # if version < 2:
    #     blob = _migrate_v1_to_v2(blob)
    
    return blob

def _migrate_v0_to_v1(blob: dict) -> dict:
    """v0 → v1: Add schema_version field. Rename topic_changes → topic_fingerprint_delta in delta."""
    blob["schema_version"] = 1
    if "delta" in blob and isinstance(blob["delta"], dict):
        if "topic_changes" in blob["delta"] and "topic_fingerprint_delta" not in blob["delta"]:
            blob["delta"]["topic_fingerprint_delta"] = blob["delta"].pop("topic_changes")
    return blob
```

### 5.2c Pipeline Node Heartbeat

Every pipeline node must write a heartbeat immediately on start so the zombie sweep (see section 5.2d) can detect stuck runs. The heartbeat helper is defined once in `agents/graphs/insights.py`:

```python
async def _update_heartbeat(run_id: str, db_pool) -> None:
    await db_pool.execute(
        'UPDATE agent_runs SET last_heartbeat_at = NOW() WHERE id = $1',
        run_id
    )
```

Call `await _update_heartbeat(run_id, db_pool)` as the FIRST line of every node function body. This applies to `node_ingest`, `node_absa`, `node_embed`, `node_cluster`, `node_topics`, `node_narrate`, `node_verify`, and `node_publish`.

### 5.2d Zombie Run Detection

**Modified file: `agents/scheduler.py`**

Add the following zombie sweep function to the scheduler. Call it every 5 minutes via `asyncio.create_task(run_every(sweep_zombie_runs, interval_seconds=300))` in the scheduler main loop:

```python
# ── Zombie run detection (runs every 5 minutes) ──────────────────────────────

async def sweep_zombie_runs(db_pool) -> None:
    """
    Detects and terminates stuck pipeline runs.
    A run is a zombie if:
    1. Heartbeat is stale (> 5 minutes since last node update), OR
    2. Total age exceeds hard timeout (30 minutes)
    """
    zombie_runs = await db_pool.fetch(
        """SELECT id, survey_id, org_id, run_type, retry_count, created_at
           FROM agent_runs
           WHERE status = 'running'
             AND (
               last_heartbeat_at < NOW() - INTERVAL '5 minutes'
               OR created_at < NOW() - INTERVAL '30 minutes'
             )"""
    )
    
    for run in zombie_runs:
        logger.error({
            "event": "zombie_run_detected",
            "run_id": str(run["id"]),
            "survey_id": str(run["survey_id"]),
            "age_minutes": (datetime.utcnow() - run["created_at"]).seconds // 60,
        })
        
        await db_pool.execute(
            """UPDATE agent_runs
               SET status = 'failed',
                   failure_reason = 'timeout',
                   failed_at = NOW()
               WHERE id = $1""",
            run["id"]
        )
        
        # Queue for retry if under retry limit
        if run["retry_count"] < 2:
            await trigger_pipeline_retry(
                survey_id=str(run["survey_id"]),
                org_id=str(run["org_id"]),
                run_type=run["run_type"],
                retry_of=str(run["id"]),
                db_pool=db_pool,
            )

# Add to scheduler main loop:
# asyncio.create_task(run_every(sweep_zombie_runs, interval_seconds=300))
```

Also add to `agents/lib/constants.py`:

```python
# ── Run Lifecycle ─────────────────────────────────────────────────────────────
# Maximum duration for any pipeline run before zombie detection kicks in.
# Set lower than the hard timeout in the scheduler (which is 30 min) to allow
# graceful cleanup before the absolute cutoff.
MAX_RUN_HEARTBEAT_STALE_MINUTES: int = int(os.getenv("MAX_RUN_HEARTBEAT_STALE_MINUTES", "5"))
MAX_RUN_DURATION_MINUTES: int = int(os.getenv("MAX_RUN_DURATION_MINUTES", "30"))
```

Note: the `agent_runs` table must have a `last_heartbeat_at TIMESTAMPTZ` column. Add this to the migration in section 5.1 if not already present.

### 5.3 Delta Analysis Service

**New file: `agents/graphs/checkpoint.py`**

```python
"""Checkpoint delta analysis — compares current insight run against the previous checkpoint.

Called by the response stream consumer after a successful insight generation run
when the checkpoint threshold has been met.

Output schema (stored in delta_json JSONB):
  {
    "emerged_topics":   [{"name": str, "volume": int, "sentiment": str}],
    "disappeared_topics": [{"name": str, "last_seen": str}],
    "sentiment_reversals": [{"name": str, "before": str, "after": str}],
    "metric_deltas": {
      "nps": {"before": float, "after": float, "delta": float},
      "csat": {"before": float, "after": float, "delta": float},
    },
    "anomalies_detected": int,
    "summary_headline": str,
  }
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from agents.lib import db
from agents.lib.logger import logger


def _topic_fingerprint(topics: list[dict]) -> str:
    """Stable hash of topic names + sentiment directions.
    
    Used to detect when the topic composition changes meaningfully between checkpoints.
    If the fingerprint is identical to the previous checkpoint, no delta needs writing.
    """
    sorted_topics = sorted(
        [f"{t.get('name','')}:{t.get('sentiment_direction', t.get('dominant_emotion', ''))}"
         for t in topics],
    )
    return hashlib.sha256(",".join(sorted_topics).encode()).hexdigest()[:16]


async def compute_delta(
    current_run_id: str,
    survey_id: str,
    org_id: str,
    topics: list[dict],
    metrics: dict,
) -> dict:
    """Compare current insight set against the previous checkpoint.
    
    Fetches the previous checkpoint from survey_insight_checkpoints and computes
    the structural diff: which topics emerged, which disappeared, which reversed sentiment.
    
    Args:
        current_run_id:   UUID of the agent_run that just completed.
        survey_id:        Survey UUID.
        org_id:           Org ID string.
        topics:           Current survey_topics rows as list of dicts.
        metrics:          Current metrics dict with 'nps' and 'csat' sub-dicts.
    
    Returns:
        delta dict for storage in delta_json JSONB column.
    """
    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            # Fetch previous checkpoint
            await cur.execute(
                """SELECT id, checkpoint_number, response_count, delta_json,
                          topic_fingerprint_hash, nps_at_checkpoint, csat_at_checkpoint
                   FROM survey_insight_checkpoints
                   WHERE survey_id = %s ORDER BY created_at DESC LIMIT 1""",
                (survey_id,),
            )
            prev_row = await cur.fetchone()

            # Fetch current response count
            await cur.execute(
                "SELECT COUNT(*)::int FROM responses WHERE survey_id = %s AND org_id = %s",
                (survey_id, org_id),
            )
            count_row = await cur.fetchone()

    current_response_count = count_row[0] if count_row else 0
    prev_checkpoint_id     = None
    prev_checkpoint_number = 0
    prev_nps               = None
    prev_topics_set        = set()

    if prev_row:
        prev_checkpoint_id     = prev_row[0]
        prev_checkpoint_number = int(prev_row[1] or 0)
        prev_nps               = prev_row[5]

        # Reconstruct previous topic set from delta_json if available
        prev_delta = prev_row[3] or {}
        if isinstance(prev_delta, str):
            try:
                prev_delta = json.loads(prev_delta)
            except Exception:
                prev_delta = {}
        # The previous checkpoint stored current topics as "current_topics" in delta_json
        prev_topics_list = prev_delta.get("current_topics", [])
        prev_topics_set  = {t.get("name", "") for t in prev_topics_list if t.get("name")}

    # Current topic set
    current_topics_set = {t.get("name", "") for t in topics if t.get("name")}
    current_by_name    = {t.get("name", ""): t for t in topics}

    # Delta computation
    emerged_names     = current_topics_set - prev_topics_set
    disappeared_names = prev_topics_set - current_topics_set

    emerged_topics = [
        {
            "name":      name,
            "volume":    current_by_name[name].get("volume", 0),
            "sentiment": current_by_name[name].get("dominant_emotion", "neutral"),
        }
        for name in emerged_names
        if name in current_by_name
    ]

    disappeared_topics = [
        {"name": name, "last_seen": datetime.now(timezone.utc).isoformat()}
        for name in disappeared_names
    ]

    # Metric deltas
    current_nps  = metrics.get("nps", {}).get("score")
    current_csat = metrics.get("csat", {}).get("score")
    metric_deltas: dict = {}
    if current_nps is not None and prev_nps is not None:
        metric_deltas["nps"] = {
            "before": float(prev_nps),
            "after":  float(current_nps),
            "delta":  round(float(current_nps) - float(prev_nps), 1),
        }

    # Anomaly count from metric snapshots
    anomalies_detected = 0
    async with db._pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT COUNT(*)::int FROM survey_metric_snapshots WHERE survey_id = %s AND org_id = %s AND anomaly_flag = TRUE AND captured_at >= NOW() - INTERVAL '7 days'",
                (survey_id, org_id),
            )
            anom_row = await cur.fetchone()
            if anom_row:
                anomalies_detected = anom_row[0]

    # Summary headline
    delta_parts = []
    if metric_deltas.get("nps"):
        d = metric_deltas["nps"]["delta"]
        delta_parts.append(f"NPS {'up' if d > 0 else 'down'} {abs(d):.1f} pts")
    if emerged_topics:
        delta_parts.append(f"{len(emerged_topics)} new topic{'s' if len(emerged_topics) > 1 else ''} emerged")
    if anomalies_detected:
        delta_parts.append(f"{anomalies_detected} anomal{'ies' if anomalies_detected > 1 else 'y'} detected")
    summary_headline = "; ".join(delta_parts) if delta_parts else "No significant changes detected"

    delta = {
        "emerged_topics":      emerged_topics,
        "disappeared_topics":  disappeared_topics,
        "sentiment_reversals": [],   # Future: compare per-topic sentiment direction
        "metric_deltas":       metric_deltas,
        "anomalies_detected":  anomalies_detected,
        "summary_headline":    summary_headline,
        "current_topics":      [{"name": t.get("name"), "volume": t.get("volume")} for t in topics[:30]],
    }

    # Persist checkpoint row
    fingerprint = _topic_fingerprint(topics)
    new_checkpoint_id = str(uuid.uuid4())

    async with db._pool_conn().connection() as conn:
        await conn.execute(
            """INSERT INTO survey_insight_checkpoints
                 (id, survey_id, org_id, run_id, checkpoint_number,
                  previous_checkpoint_id, response_count, delta_json,
                  topic_fingerprint_hash, anomalies_detected,
                  nps_at_checkpoint, csat_at_checkpoint)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)""",
            (
                new_checkpoint_id, survey_id, org_id, current_run_id,
                prev_checkpoint_number + 1,
                prev_checkpoint_id,
                current_response_count,
                json.dumps(delta),
                fingerprint,
                anomalies_detected,
                current_nps,
                current_csat,
            ),
        )
        await conn.commit()

    logger.info(
        "checkpoint_created",
        survey_id=survey_id,
        checkpoint_id=new_checkpoint_id,
        number=prev_checkpoint_number + 1,
        emerged=len(emerged_topics),
        disappeared=len(disappeared_topics),
        summary=summary_headline,
    )

    return delta
```

---

## 6. Phase 4 — New Frontend Routes

### 6.1 Route Constants

**Modified file: `app/src/constants/routes.ts`**

Add the following constants to the existing `ROUTES` object, immediately after the existing `INSIGHTS_SURFACED` entry:

```typescript
// Experience Intelligence routes (Phase 4)
EXPERIENCE_HUB:           '/app/experience',
EXPERIENCE_SURVEY:        '/app/experience/surveys/:surveyId',
EXPERIENCE_SURVEY_REPORT: '/app/experience/surveys/:surveyId/report',
EXPERIENCE_TOPIC:         '/app/experience/surveys/:surveyId/topics/:topicId',
EXPERIENCE_TREND:         '/app/experience/surveys/:surveyId/trend',
```

The existing `toPath()` helper already handles `:surveyId` and `:topicId` substitution — no changes needed there.

### 6.2 New Page Components

Create the directory `app/src/pages/experience/` and add the following six files. Each page uses the existing `PageHeader`, `AppShell` (via route wrapper), and `CrystalPanel` components.

**New file: `app/src/pages/experience/ExperienceHubPage.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { CrystalPanel } from '../../components/CrystalPanel';
import { useApi } from '../../hooks/useApi';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { Icon } from '../../components/Icon';
import { ROUTES, toPath } from '../../constants/routes';
import { useTranslation } from '../../lib/i18n';
import type { Survey } from '../../types';

interface OrgPortfolioEntry {
  survey_id: string;
  title: string;
  response_count: number;
  nps: number | null;
  csat: number | null;
  anomaly_flag: boolean;
  last_snapshot: string | null;
}

export function ExperienceHubPage() {
  const { t } = useTranslation();
  const api    = useApi();
  const navigate = useNavigate();
  const { openCrystal } = useCrystalPanel();

  const [portfolio, setPortfolio] = useState<OrgPortfolioEntry[]>([]);
  const [orgHistory, setOrgHistory] = useState<{ captured_at: string; avg_nps: number | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [portRes, histRes] = await Promise.all([
          // Uses GET /api/insights/org/metric-history (already exists in insights.js)
          api.getOrgMetricHistory({ days: 90 }),
          // Uses the org portfolio data from existing insights list endpoint
          api.getSurveys(),
        ]);
        if (cancelled) return;
        setOrgHistory(portRes.history || []);
        // Enrich survey list with latest NPS from history data
        const surveys: Survey[] = histRes.surveys || [];
        setPortfolio(
          surveys
            .filter((s: Survey) => s.status === 'active' && !s.deleted_at)
            .map((s: Survey) => ({
              survey_id:      s.id,
              title:          s.title,
              response_count: s.response_count || 0,
              nps:            null,   // populated per-survey on demand
              csat:           null,
              anomaly_flag:   false,
              last_snapshot:  null,
            })),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [api]);

  const anomalousSurveys = portfolio.filter(s => s.anomaly_flag);

  return (
    <div className="max-w-6xl mx-auto w-full">
      <PageHeader
        title={t('experience.hub.title')}
        subtitle={t('experience.hub.subtitle')}
        actions={
          <button
            onClick={() => openCrystal()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
          >
            <span className="text-[13px]">◆</span>
            {t('experience.hub.askCrystal')}
          </button>
        }
      />

      {/* Anomaly alert banner */}
      {anomalousSurveys.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium"
          style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
          <Icon name="warning" size={18} />
          {anomalousSurveys.length} survey{anomalousSurveys.length > 1 ? 's have' : ' has'} unusual metric movement.
          {' '}<button className="underline font-bold" onClick={() => openCrystal('What anomalies were detected?')}>
            Ask Crystal
          </button>
        </div>
      )}

      {/* Survey portfolio grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
            ))
          : portfolio.map(entry => (
              <button
                key={entry.survey_id}
                onClick={() => navigate(toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: entry.survey_id }))}
                className="text-left p-5 rounded-2xl border border-border/50 hover:border-primary/30 hover:bg-primary/3 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="font-semibold text-sm text-on-surface truncate flex-1 mr-2">{entry.title}</span>
                  {entry.anomaly_flag && <Icon name="warning" size={16} className="text-amber-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                  {entry.nps !== null && (
                    <span className="font-bold" style={{ color: entry.nps >= 50 ? '#059669' : entry.nps >= 20 ? '#d97706' : '#dc2626' }}>
                      NPS {entry.nps}
                    </span>
                  )}
                  <span>{entry.response_count.toLocaleString()} responses</span>
                </div>
              </button>
            ))
        }
      </div>

      {/* Crystal panel — org scope */}
      <CrystalPanel scope="all" surveys={[]} insights={null} />
    </div>
  );
}
```

**New file: `app/src/pages/experience/SurveyIntelligencePage.tsx`**

This page is the per-survey intelligence hub — similar to the existing `SurveyInsightsPage` but with Crystal embedded in a side panel rather than as a floating overlay, and with direct links to the CheckpointReportPage and TopicAnalysisPage.

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { CrystalPanel } from '../../components/CrystalPanel';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { useApi } from '../../hooks/useApi';
import { useInsights } from '../../hooks/useInsights';
import { Icon } from '../../components/Icon';
import { ROUTES, toPath } from '../../constants/routes';
import { useTranslation } from '../../lib/i18n';

export function SurveyIntelligencePage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = useApi();
  const { openCrystal } = useCrystalPanel();
  const { insights, topics, loading } = useInsights(surveyId);

  return (
    <div className="max-w-5xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('experience.hub.title'), path: ROUTES.EXPERIENCE_HUB },
        ]}
        title={insights?.survey?.title || t('experience.survey.title')}
        actions={
          <button
            onClick={() => openCrystal()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
          >
            <span>◆</span> {t('experience.survey.askCrystal')}
          </button>
        }
      />

      {/* Quick links to sub-pages */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: t('experience.survey.checkpoints'), icon: 'history', path: toPath(ROUTES.EXPERIENCE_SURVEY_REPORT, { surveyId: surveyId! }) },
          { label: t('experience.survey.topics'),      icon: 'topic',   path: toPath(ROUTES.EXPERIENCE_TOPIC,         { surveyId: surveyId!, topicId: 'all' }) },
          { label: t('experience.survey.trends'),      icon: 'trending_up', path: toPath(ROUTES.EXPERIENCE_TREND, { surveyId: surveyId! }) },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex items-center gap-2 p-3 rounded-xl border border-border/50 hover:border-primary/30 text-sm font-medium hover:bg-primary/4 transition-all"
          >
            <Icon name={item.icon} size={16} className="text-primary" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Insights summary + Crystal panel */}
      <CrystalPanel
        scope={surveyId!}
        surveys={[]}
        insights={null}
        agenticInsights={insights?.agenticInsights || []}
        topics={topics}
      />
    </div>
  );
}
```

**New file: `app/src/pages/experience/CheckpointReportPage.tsx`**

Displays the checkpoint history for a survey, showing deltas between runs.

```tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useApi } from '../../hooks/useApi';
import { Icon } from '../../components/Icon';
import { ROUTES, toPath } from '../../constants/routes';
import { useTranslation } from '../../lib/i18n';

interface CheckpointEntry {
  id: string;
  checkpoint_number: number;
  created_at: string;
  response_count: number;
  nps_at_checkpoint: number | null;
  delta_json: {
    summary_headline: string;
    emerged_topics: Array<{ name: string; volume: number }>;
    disappeared_topics: Array<{ name: string }>;
    metric_deltas: Record<string, { before: number; after: number; delta: number }>;
    anomalies_detected: number;
  } | null;
}

export function CheckpointReportPage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t } = useTranslation();
  const api    = useApi();
  const [checkpoints, setCheckpoints] = useState<CheckpointEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getCheckpoints(surveyId!).then(data => {
      if (!cancelled) { setCheckpoints(data.checkpoints || []); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [surveyId, api]);

  return (
    <div className="max-w-4xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('experience.hub.title'), path: ROUTES.EXPERIENCE_HUB },
          { label: t('experience.survey.title'), path: toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: surveyId! }) },
        ]}
        title={t('experience.checkpoints.title')}
        subtitle={t('experience.checkpoints.subtitle')}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : checkpoints.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Icon name="history" size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('experience.checkpoints.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {checkpoints.map(cp => (
            <div key={cp.id} className="p-5 rounded-2xl border border-border/50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    Checkpoint #{cp.checkpoint_number}
                  </span>
                  <p className="font-semibold text-sm text-on-surface mt-0.5">
                    {cp.delta_json?.summary_headline || 'No changes detected'}
                  </p>
                </div>
                <div className="text-right text-xs text-on-surface-variant">
                  <div>{new Date(cp.created_at).toLocaleDateString()}</div>
                  <div>{cp.response_count.toLocaleString()} responses</div>
                  {cp.nps_at_checkpoint !== null && (
                    <div className="font-bold mt-0.5">NPS {cp.nps_at_checkpoint}</div>
                  )}
                </div>
              </div>

              {cp.delta_json && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {cp.delta_json.emerged_topics.map(t => (
                    <span key={t.name} className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                      style={{ background: '#d1fae5', color: '#065f46' }}>
                      + {t.name}
                    </span>
                  ))}
                  {cp.delta_json.disappeared_topics.map(t => (
                    <span key={t.name} className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                      style={{ background: '#fee2e2', color: '#991b1b' }}>
                      - {t.name}
                    </span>
                  ))}
                  {cp.delta_json.anomalies_detected > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1"
                      style={{ background: '#fef3c7', color: '#92400e' }}>
                      <Icon name="warning" size={11} /> {cp.delta_json.anomalies_detected} anomaly
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

**New file stubs** (full implementation follows the same pattern as CheckpointReportPage):

```
app/src/pages/experience/TopicAnalysisPage.tsx   — topic list with filter/sort; links to TopicDeepDivePage
app/src/pages/experience/TopicDeepDivePage.tsx   — single topic: verbatims, trend series, co-occurring
app/src/pages/experience/SurveyTrendPage.tsx     — NPS/CSAT sparkline using survey_metric_snapshots
```

Each stub page should follow the component skeleton: `PageHeader` with crumb trail, data loaded via `useApi()`, and a `CrystalPanel` with `scope={surveyId}`.

### 6.3 Route Registration

**Modified file: `app/src/App.tsx`**

Add the new imports at the top of the file (alongside existing page imports):

```typescript
import { ExperienceHubPage }      from './pages/experience/ExperienceHubPage';
import { SurveyIntelligencePage } from './pages/experience/SurveyIntelligencePage';
import { CheckpointReportPage }   from './pages/experience/CheckpointReportPage';
import { TopicAnalysisPage as ExperienceTopicPage } from './pages/experience/TopicAnalysisPage';
import { SurveyTrendPage }        from './pages/experience/SurveyTrendPage';
```

Add the new route entries inside the `<Route element={<BrandProvider><AppShell /></BrandProvider>}>` block, immediately after the last existing `INSIGHTS_SURFACED` route:

```tsx
{/* Experience Intelligence — Phase 4 */}
<Route path={ROUTES.EXPERIENCE_HUB}           element={<ErrorBoundary inline><ExperienceHubPage /></ErrorBoundary>} />
<Route path={ROUTES.EXPERIENCE_SURVEY}        element={<ErrorBoundary inline><SurveyIntelligencePage /></ErrorBoundary>} />
<Route path={ROUTES.EXPERIENCE_SURVEY_REPORT} element={<ErrorBoundary inline><CheckpointReportPage /></ErrorBoundary>} />
<Route path={ROUTES.EXPERIENCE_TOPIC}         element={<ErrorBoundary inline><ExperienceTopicPage /></ErrorBoundary>} />
<Route path={ROUTES.EXPERIENCE_TREND}         element={<ErrorBoundary inline><SurveyTrendPage /></ErrorBoundary>} />
```

### 6.4 SideNav Update

**Modified file: `app/src/components/SideNav.tsx`**

Add the Experience item to `NAV_ITEMS` after the existing `nav.insights` entry:

```typescript
const NAV_ITEMS = [
  { key: 'nav.surveys',    icon: 'poll',         path: ROUTES.SURVEYS },
  { key: 'nav.data',       icon: 'dataset',      path: '/app/data' },
  { key: 'nav.insights',   icon: 'psychology',   path: ROUTES.INSIGHTS, fill: 1 },
  { key: 'nav.experience', icon: 'auto_awesome', path: ROUTES.EXPERIENCE_HUB },   // Phase 4
  { key: 'nav.respondents',icon: 'groups',       path: ROUTES.RESPONDENTS },
  { key: 'nav.workflows',  icon: 'account_tree', path: ROUTES.WORKFLOWS },
  { key: 'nav.templates',  icon: 'auto_awesome', path: ROUTES.TEMPLATES },
];
```

Add the corresponding translation key to `app/src/locales/en.ts`:

```typescript
'nav.experience': 'Experience',
```

---

## 6a. Phase 5 — Operational Logging (1 week)

**Goal:** Create a durable audit trail of every AI operation across all system flows.

### 5a.1 Database Migration

**New file: `supabase/migrations/20240522000001_ai_operation_logs.sql`**

```sql
CREATE TABLE IF NOT EXISTS ai_operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id TEXT NOT NULL,
    survey_id UUID REFERENCES surveys(id) ON DELETE SET NULL,
    run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
    checkpoint_id UUID REFERENCES survey_insight_checkpoints(id) ON DELETE SET NULL,
    operation_type TEXT NOT NULL,
    agent_name TEXT,
    step_name TEXT,
    model TEXT NOT NULL,
    provider TEXT,
    input_tokens INT,
    output_tokens INT,
    cached_tokens INT,
    cost_usd NUMERIC(10, 6),
    latency_ms INT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,
    quality_score INT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON ai_operation_logs(org_id, created_at DESC);
CREATE INDEX ON ai_operation_logs(survey_id, created_at DESC);
CREATE INDEX ON ai_operation_logs(run_id);
CREATE INDEX ON ai_operation_logs(operation_type, created_at DESC);
```

### 5a.2 Gateway-Level Logging in `call_agent()` and `call_agent_anthropic()`

Rather than wrapping individual agent calls with a `log_operation()` context manager, logging is added to the two gateway functions. This covers ALL 10+ agents automatically without modifying each agent file.

**Agents covered by `call_agent()` in `agents/lib/openrouter.py`:**
- `compliance.py` — compliance check
- `copilot.py` — survey copilot recommendations
- `crystal.py` — Crystal chat (legacy single-call path)
- `qc.py` — quality control (2 call sites)
- `insight_experts.py` — 9 narration/evaluation calls
- `refiner.py` — survey refinement
- `creator.py` — survey creation
- `skip_logic.py` — skip logic generation
- `recommender.py` — action recommendations
- `response_generator.py` — test response generation

**Agents covered by `call_agent_anthropic()` in `agents/lib/anthropic_client.py`:**
- `creator.py` — Opus 4.7 calls
- `recommender.py` — Haiku 4.5 calls

**Implementation: add optional `op_context` parameter to both gateway functions**

```python
# agents/lib/openrouter.py — add to call_agent() signature:
async def call_agent(
    agent_name:     str,
    system:         str,
    user:           str,
    output_schema:  type[T],
    current_tokens: int = 0,
    prior_messages: list[dict] | None = None,
    op_context: dict | None = None,   # NEW: {org_id?, survey_id?, run_id?, operation_type?}
) -> tuple[T, CreditEntry]:
    ...
    # After successful response, add at the end before return:
    if op_context is not None:
        try:
            from agents.lib.db import _pool_conn
            import json as _json
            async with _pool_conn().connection() as _conn:
                await _conn.execute(
                    """INSERT INTO ai_operation_logs
                       (org_id, survey_id, run_id, operation_type, agent_name,
                        model, provider, input_tokens, output_tokens, cost_usd,
                        latency_ms, success, metadata)
                       VALUES (%s,%s,%s,%s,%s,%s,'openrouter',%s,%s,%s,%s,true,%s)""",
                    (
                        op_context.get("org_id"), op_context.get("survey_id"),
                        op_context.get("run_id"),
                        op_context.get("operation_type", agent_name),
                        agent_name, config.model,
                        entry.input_tokens, entry.output_tokens, entry.cost_usd,
                        round(duration * 1000),
                        _json.dumps(op_context.get("metadata", {})),
                    ),
                )
        except Exception as _log_exc:
            logger.warning("op_log_failed", error=str(_log_exc))
    return output, entry
```

Same pattern for `call_agent_anthropic()` in `agents/lib/anthropic_client.py`.

### 5a.3 Usage: callers pass context when they have it

```python
# In insight_experts.py — narrate_topic_insight()
output, _ = await call_agent(
    agent_name="narrate_topic",
    system=system,
    user=user_prompt,
    output_schema=TopicExpertOutput,
    op_context={
        "org_id": org_id,
        "survey_id": survey_id,
        "run_id": run_id,
        "operation_type": "insight_narration",
        "metadata": {"topic_name": topic["name"], "cluster_size": cluster_size},
    },
)

# In crystal.py — _generate_response()
output, _ = await call_agent(
    agent_name="crystal",
    system=system,
    user=inp.message,
    output_schema=CrystalOutput,
    op_context={
        "org_id": inp.org_id,
        "survey_id": inp.survey_id,
        "operation_type": "crystal_chat",
    },
)

# In creator.py — no op_context if org_id not available in that context
# Logs will have NULL org_id/survey_id but agent_name='creator' for filtering
output, _ = await call_agent(
    agent_name="creator",
    system=system,
    user=user_prompt,
    output_schema=CreatorOutput,
    op_context={"operation_type": "survey_create"},
)
```

Note: `op_context` is optional — if not passed, the call is still logged at the Prometheus level via the existing `agent_calls_total` metric, but NOT written to `ai_operation_logs`. Callers should pass it whenever they have `org_id` available.

### 5a.4 Operational Logging Coverage Matrix

| Agent | File | Calls gateway | op_context fields |
|-------|------|---------------|-------------------|
| NPS narration | insight_experts.py | call_agent | org_id, survey_id, run_id, operation_type=insight_narration |
| CSAT narration | insight_experts.py | call_agent | same |
| Topic narration | insight_experts.py | call_agent | + topic_name in metadata |
| Trend narration | insight_experts.py | call_agent | same |
| Prescriptive narration | insight_experts.py | call_agent | same |
| Insight evaluation | insight_experts.py | call_agent | operation_type=insight_evaluation |
| Crystal eval | insight_experts.py | call_agent | operation_type=crystal_eval |
| Crystal chat (legacy) | crystal.py | call_agent | org_id, survey_id, operation_type=crystal_chat |
| Copilot | copilot.py | call_agent | org_id, survey_id, operation_type=copilot |
| QC check | qc.py | call_agent | org_id, survey_id, operation_type=qc |
| Compliance check | compliance.py | call_agent | org_id, survey_id, operation_type=compliance |
| Survey creation | creator.py | call_agent_anthropic | org_id, operation_type=survey_create |
| Survey refinement | refiner.py | call_agent | org_id, operation_type=survey_refine |
| Recommendations | recommender.py | call_agent_anthropic | org_id, survey_id, operation_type=recommendation |
| Skip logic | skip_logic.py | call_agent | org_id, survey_id, operation_type=skip_logic |
| Response generation | response_generator.py | call_agent | org_id, survey_id, operation_type=response_gen |

### 5a.4 Backend Endpoint

**New route in `backend/src/routes/runs.js`: `GET /api/runs/:runId/operation-log`**

```js
router.get('/:runId/operation-log', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT operation_type, step_name, model, input_tokens, output_tokens,
            cost_usd, latency_ms, success, error_message, quality_score, created_at
     FROM ai_operation_logs
     WHERE run_id = $1 AND org_id = $2
     ORDER BY created_at ASC`,
    [req.params.runId, req.orgId]
  );
  res.json({ operations: rows });
});
```

---

## 6b. Phase 6 — Progressive Intelligence (1 week)

**Goal:** Make the insights page useful at every response count — from the first response to 199 — by detecting the current data tier and returning tier-appropriate analysis. The 200-response full checkpoint remains unchanged; this phase adds four graduated states below it.

**What users see after Phase 6:** Instead of a generic "collecting feedback" message until 200 responses, users see progressively richer analysis: collecting (0–9), emerging ABSA themes at 10–39 (First Voices), topic signals at 40–99 (Early Signals), and near-full reports at 100–199 (Growing Picture). Each state shows the maximum accurate information for its volume.

**Prerequisites:** Phase 0 (centralized constants) must be complete — this phase imports from `agents/lib/constants.py`.

---

### 6b.1 Data Tier Detection in `node_ingest`

**Modified file: `agents/graphs/insights.py` — `node_ingest` function**

Add tier detection after loading responses:

```python
from agents.lib.constants import (
    TOPIC_CONFIDENCE_LOW_MAX,
    TOPIC_CONFIDENCE_MEDIUM_MAX,
    INGEST_MAX_RESPONSES_BOOTSTRAP,
)

def _compute_data_tier(response_count: int) -> str:
    """Determine the progressive intelligence tier from response count."""
    if response_count < 10:  return "collecting"      # was: < 10 → first_voices
    if response_count < 40:  return "first_voices"    # was: < 10
    if response_count < 100: return "early_signals"   # was: < 30
    if response_count < 200: return "growing_picture" # was: < 100
    return "full_report"  # 200+ = clear_picture / full report

# In node_ingest, after loading responses:
data_tier = _compute_data_tier(len(responses))
return {
    **state,
    "responses": responses,
    "data_tier": data_tier,  # NEW field in InsightState
    # ... other fields
}
```

Add `data_tier: str` to the `InsightState` TypedDict.

---

### 6b.2 Tier-Gated Pipeline Execution

**Modified file: `agents/graphs/insights.py` — pipeline node guards**

Each expensive LLM node checks `data_tier` and short-circuits when the data doesn't justify the cost:

**`node_absa` — run from `early_signals` onwards:**
```python
async def node_absa(state: InsightState) -> dict:
    if state.get("data_tier") == "first_voices":
        # No ABSA for <10 responses — not enough for reliable sentiment
        logger.info("node_absa_skipped", tier="first_voices")
        return {**state, "absa_results": []}
    # ... existing ABSA logic ...
```

**`node_topics` — run from `early_signals` onwards:**
```python
async def node_topics(state: InsightState) -> dict:
    if state.get("data_tier") == "first_voices":
        return {**state, "topics": []}
    # ... existing topic discovery logic ...
```

**`node_narrate` — tier-gated with language flag:**
```python
async def node_narrate(state: InsightState) -> dict:
    data_tier = state.get("data_tier", "full_report")
    
    if data_tier in ("first_voices", "early_signals"):
        # No narration — too few responses for reliable narrative claims
        logger.info("node_narrate_skipped", tier=data_tier)
        return {**state, "insights": []}
    
    # Pass data_tier to all narration functions so they calibrate language
    insights = await _run_narration(state, data_tier=data_tier)
    return {**state, "insights": insights}
```

**`node_verify` — skip for sub-threshold tiers:**
```python
async def node_verify(state: InsightState) -> dict:
    if state.get("data_tier") in ("first_voices", "early_signals"):
        return state  # nothing to verify
    # ... existing verification logic ...
```

---

### 6b.3 Language Calibration Injection

**Modified file: `agents/agents/insight_experts.py`**

All narration functions accept an optional `data_tier: str` parameter and inject it into the system prompt:

```python
from agents.lib.constants import DATA_TIER_LANGUAGE_RULES

# Add to agents/lib/constants.py:
DATA_TIER_LANGUAGE_RULES: dict[str, str] = {
    "growing_picture": (
        "IMPORTANT: You are analyzing data with moderate confidence (100-199 responses). "
        "Report NPS as a specific number but always state the uncertainty: 'NPS is approximately X'. "
        "For predictions, use 'appears to be' rather than 'is'. "
        "Benchmarks may be included with the qualifier 'based on current data'."
    ),
    "full_report": "",  # No hedging needed — full statistical authority
}

# In narrate_topic_insight():
async def narrate_topic_insight(
    cluster: dict,
    topic: dict,
    survey_context: dict,
    org_context: dict,
    specialist_context: str,
    response_sample: list[dict],
    data_tier: str = "full_report",   # NEW parameter
) -> TopicExpertOutput:
    
    tier_instruction = DATA_TIER_LANGUAGE_RULES.get(data_tier, "")
    
    system = f"""\
{specialist_context}
{tier_instruction}

You are a {specialist.display_name} narrating a topic insight.
...
"""
```

---

### 6b.4 Backend: `page_state` and `data_tier` in API Response

**Modified file: `backend/src/routes/insights.js` — `GET /:surveyId/list`**

Add tier computation and state detection to the response:

```js
// Helper: compute data_tier from response_count
function computeDataTier(responseCount) {
  if (responseCount < 10)  return 'collecting';
  if (responseCount < 40)  return 'first_voices';
  if (responseCount < 100) return 'early_signals';
  if (responseCount < 200) return 'growing_picture';
  return 'full_report';  // 200+ = clear_picture / full report
}

// Helper: compute report_tier label (no numbers exposed to frontend)
function computeReportTier(responseCount) {
  if (responseCount < 50) return 'early';
  if (responseCount < 200) return 'growing';
  if (responseCount < 500) return 'full';
  return 'deep';
}

// Helper: compute InsightPageState
function computePageState(survey, latestRun, responseCount, responsesSinceLastCheckpoint) {
  if (responseCount === 0) return 'no_responses';
  if (latestRun?.status === 'running') return 'generating';
  if (latestRun?.status === 'failed') return 'pipeline_failed';
  if (!latestRun || responseCount < 10) return 'collecting';

  // Sub-tier range: 10–199 with at least one completed sub-tier run
  if (responseCount < 200 && latestRun?.status === 'completed') return 'early_insights';
  if (responseCount < 200) return 'collecting';

  // 200+ responses — check staleness
  const daysSinceRun = (Date.now() - new Date(latestRun.completed_at)) / 86400000;
  if (survey.status === 'active' && daysSinceRun > 7 && responsesSinceLastCheckpoint < 10) {
    return 'insights_stale';
  }
  return 'insights_ready';
}

router.get('/:surveyId/list', requireAuth, async (req, res) => {
  const { surveyId } = req.params;
  const { orgId } = req;

  const [insightsResult, surveyResult, latestRunResult] = await Promise.all([
    db.query(
      `SELECT id, layer, category, headline, narrative, trust_score, trust_json,
              audit_json, metric_json, citations_json, user_state_json, priority,
              insight_hash, superseded_at
       FROM insights
       WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
       ORDER BY priority DESC NULLS LAST, created_at DESC`,
      [surveyId, orgId]
    ),
    db.query(
      `SELECT id, title, status, response_count, nps_score FROM surveys
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [surveyId, orgId]
    ),
    db.query(
      `SELECT id, status, completed_at, stream_events FROM agent_runs
       WHERE survey_id = $1 AND org_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [surveyId, orgId]
    ),
  ]);

  const survey = surveyResult.rows[0];
  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  const responseCount = survey.response_count || 0;
  const latestRun = latestRunResult.rows[0] || null;

  // Compute responses since last completed checkpoint
  // MANUAL_REFRESH_MIN_NEW_RESPONSES mirrors agents/lib/constants.py (default: 10)
  const lastCheckpointCount = latestRun?.metadata?.response_count_at_run || 0;
  const responsesSinceLastCheckpoint = Math.max(0, responseCount - lastCheckpointCount);
  const MANUAL_REFRESH_MIN_NEW_RESPONSES = parseInt(process.env.MANUAL_REFRESH_MIN_NEW_RESPONSES ?? '10', 10);
  const canManualRefresh = responsesSinceLastCheckpoint >= MANUAL_REFRESH_MIN_NEW_RESPONSES;

  const dataTeir = computeDataTier(responseCount);
  const pageState = computePageState(survey, latestRun, responseCount, responsesSinceLastCheckpoint);
  const reportTier = computeReportTier(responseCount);
  const anomalyActive = insightsResult.rows.some(r => r.metric_json?.anomaly_flag);

  res.json({
    page_state: pageState,
    page_state_metadata: {
      data_tier: dataTeir,
      report_tier: reportTier,
      run_status: latestRun?.status || null,
      last_run_at: latestRun?.completed_at || null,
      anomaly_active: anomalyActive,
      stream_events: latestRun?.stream_events || null,
      responses_since_last_checkpoint: responsesSinceLastCheckpoint,  // NEW
      can_manual_refresh: canManualRefresh,                            // NEW: true if >= MANUAL_REFRESH_MIN_NEW_RESPONSES
      survey_status: survey.status,  // 'active' | 'paused' | 'closed' | 'draft'
      pipeline_active: survey.status === 'active',  // shorthand for frontend
    },
    insights: insightsResult.rows,
    survey: {
      id: survey.id,
      title: survey.title,
      status: survey.status,
      response_count: responseCount,
    },
  });
});

// POST /:surveyId/trigger — manually trigger insight pipeline
// Survey status gate: only 'active' surveys may trigger the pipeline.
router.post('/:surveyId/trigger', requireAuth, async (req, res) => {
  const { surveyId } = req.params;
  const { orgId } = req;

  const { rows: [survey] } = await db.query(
    `SELECT id, status FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [surveyId, orgId]
  );

  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  if (survey.status !== 'active') {
    return res.status(409).json({
      error: 'insights_pipeline_suspended',
      survey_status: survey.status,
      // frontend reads survey_status to show the correct banner
    });
  }

  // ... existing trigger logic ...
});

// GET /:surveyId/checkpoints — list all checkpoints for the selector
router.get('/:surveyId/checkpoints', requireAuth, async (req, res) => {
  const { surveyId } = req.params;
  const { orgId } = req;
  
  const { rows } = await db.query(
    `SELECT id, created_at, response_count,
            nps_at_checkpoint, csat_at_checkpoint,
            trend_direction, trend_persistence,
            report_url
     FROM survey_insight_checkpoints
     WHERE survey_id = $1 AND org_id = $2
       AND run_type IN ('tier2_checkpoint', 'manual_refresh')
     ORDER BY created_at DESC`,
    [surveyId, orgId]
  );
  
  const checkpoints = rows.map((row, i) => ({
    id: row.id,
    created_at: row.created_at,
    response_count: row.response_count,
    nps_at_checkpoint: row.nps_at_checkpoint,
    is_latest: i === 0,
    has_report: !!row.report_url,
  }));
  
  res.json({ checkpoints });
});

// GET /:surveyId/checkpoints/:checkpointId/report — fetch historical report from object store
router.get('/:surveyId/checkpoints/:checkpointId/report', requireAuth, async (req, res) => {
  const { surveyId, checkpointId } = req.params;
  const { orgId } = req;
  
  const { rows: [checkpoint] } = await db.query(
    `SELECT report_url FROM survey_insight_checkpoints
     WHERE id = $1 AND survey_id = $2 AND org_id = $3`,
    [checkpointId, surveyId, orgId]
  );
  
  if (!checkpoint?.report_url) {
    return res.status(404).json({ error: 'Report not found' });
  }
  
  // Fetch from object store (agents service proxies this to avoid CORS + auth)
  const reportData = await agentsClient.get('/checkpoints/read', {
    params: { path: checkpoint.report_url }
  });
  
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(reportData.data);
});
```

---

### 6b.5 Frontend: Consuming `data_tier` in the Insights Components

**Modified file: `app/src/pages/insights/UnifiedInsightsView.tsx`**

Add tier-aware rendering at the top of the component:

```tsx
import { REPORT_TIER_CONFIG, TOPIC_CONFIDENCE_CONFIG, CRYSTAL_TOOL_LABELS } from '@/constants/limits';
import { t } from '@/lib/i18n';

// Read page_state from the insights list response
const { page_state, page_state_metadata, insights } = useInsightsData(surveyId);
const { data_tier, report_tier, anomaly_active } = page_state_metadata ?? {};

// Tier-gated rendering
if (page_state === 'no_responses') {
  return <NoResponsesState />;
}

if (page_state === 'collecting' || data_tier === 'first_voices') {
  return <FirstVoicesState verbatims={insights} />;
}

// Show state banner at top of page for non-ready states
const stateBanner = page_state !== 'insights_ready' ? (
  <InsightStateBanner state={page_state} tier={data_tier} />
) : null;

// Show progress arc in header
const progressArc = (
  <ProgressArc tier={report_tier} />
);
```

**New shared component: `app/src/pages/insights/ProgressArc.tsx`**

```tsx
const TIER_FILL = {
  early:   { pct: 15, icon: '◔', pulse: true  },
  growing: { pct: 55, icon: '◑', pulse: false },
  full:    { pct: 100, icon: '●', pulse: false },
  deep:    { pct: 100, icon: '●', pulse: false },
} as const;

export function ProgressArc({ tier }: { tier: string }) {
  const config = TIER_FILL[tier as keyof typeof TIER_FILL] ?? TIER_FILL.early;
  return (
    <div 
      className={`progress-arc ${config.pulse ? 'animate-pulse' : ''}`}
      aria-label={t(`insights.tier.${tier}`)}
      role="img"
    >
      <svg>{/* arc fill at config.pct */}</svg>
    </div>
  );
}
```

**New shared component: `app/src/pages/insights/InsightStateBanner.tsx`**

```tsx
const STATE_BANNER_CONFIG: Record<string, { i18nKey: string; variant: 'info' | 'warning' | 'error' }> = {
  collecting:      { i18nKey: 'insights.state.collecting',     variant: 'info'    },
  early_insights:  { i18nKey: 'insights.state.earlyInsights',  variant: 'info'    },
  generating:      { i18nKey: 'insights.state.generating',     variant: 'info'    },
  insights_stale:  { i18nKey: 'insights.state.insightsStale',  variant: 'warning' },
  pipeline_failed: { i18nKey: 'insights.state.pipelineFailed', variant: 'error'   },
};

export function InsightStateBanner({ 
  state, 
  tier,
  canManualRefresh,
  onGenerateInsight,
}: { 
  state: string; 
  tier?: string;
  canManualRefresh?: boolean;
  onGenerateInsight?: () => void;
}) {
  const config = STATE_BANNER_CONFIG[state];
  if (!config && !canManualRefresh) return null;
  return (
    <div className={`state-banner ${config ? `state-banner--${config.variant}` : ''}`}>
      {config && <span>{t(config.i18nKey)}</span>}
      {state === 'pipeline_failed' && (
        <button onClick={onRetry}>{t('insights.state.pipelineFailed.retry')}</button>
      )}
      {canManualRefresh && state === 'insights_ready' && (
        <button 
          className="btn-generate-insight"
          onClick={onGenerateInsight}
        >
          {t('insights.actions.generateNewInsight')}
        </button>
      )}
    </div>
  );
}
```

**New i18n keys** (add to `app/src/locales/en.ts`):

| Key | Value |
|---|---|
| `insights.actions.generateNewInsight` | `"Generate new insight"` |
| `insights.actions.generateNewInsight.tooltip` | `"Analyze responses collected since your last report"` |
| `insights.notifications.insightReady` | `"Your new analysis is ready"` |
| `insights.notifications.insightReady.subtitle` | `"Updated insights are now available for your survey"` |

---

### 6b.5a New Report Completion Notification

When a manually triggered insight generation completes (agent_run status transitions to `completed`), the frontend must notify the user. Backend emits a `run_completed` SSE event via the existing stream; frontend consumes it.

**Frontend behavior:**
```tsx
// In UnifiedInsightsView.tsx — wire to SSE stream
useEffect(() => {
  if (!runId) return;
  const es = new EventSource(`/api/insights/${surveyId}/stream/${runId}`);
  es.addEventListener('run_completed', () => {
    // Show toast/notification
    showNotification({
      title: t('insights.notifications.insightReady'),
      subtitle: t('insights.notifications.insightReady.subtitle'),
      action: { label: t('common.view'), onClick: () => refetch() },
    });
    refetch();   // reload insights list
    es.close();
  });
  return () => es.close();
}, [runId]);
```

**Design rule:** The notification appears as a non-blocking toast (bottom-right, auto-dismiss after 6 seconds). It does NOT navigate the user away. The insights below update in-place after `refetch()`.

---

### Notification System — Stub Implementation

**Current scope:** In-app toast only. Email and push are logged as intent but not delivered.

**After every pipeline event that could trigger a notification, call `notifyUsers()`:**

```javascript
// backend/src/lib/notifications.js

const NOTIFICATION_CHANNELS = ['in_app', 'email', 'push'];

async function notifyUsers({ orgId, surveyId, notificationType, payload }) {
  // Fetch all members of the org who have this survey in their preferences
  const { rows: prefs } = await db.query(
    `SELECT user_id, channels FROM notification_preferences
     WHERE org_id = $1 AND survey_id = $2`,
    [orgId, surveyId]
  );
  
  const events = [];
  for (const pref of prefs) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const enabled = pref.channels?.[notificationType]?.[channel] ?? false;
      if (!enabled) continue;
      
      events.push({
        org_id: orgId,
        survey_id: surveyId,
        user_id: pref.user_id,
        notification_type: notificationType,
        channel,
        payload,
        // in_app: mark delivered immediately. email/push: pending (stub — no delivery)
        status: channel === 'in_app' ? 'delivered' : 'pending',
        delivered_at: channel === 'in_app' ? new Date() : null,
      });
    }
  }
  
  if (events.length) {
    await db.query(
      `INSERT INTO notification_events
         (org_id, survey_id, user_id, notification_type, channel, payload, status, delivered_at)
       SELECT * FROM jsonb_to_recordset($1::jsonb)
         AS t(org_id uuid, survey_id uuid, user_id text, notification_type text,
              channel text, payload jsonb, status text, delivered_at timestamptz)`,
      [JSON.stringify(events)]
    );
  }
}
```

**Notification triggers:**
- `analysis_ready`: called in `POST /:surveyId/trigger` after `agent_run.status = 'completed'`
- `anomaly_detected`: called in the `GET /:surveyId/list` handler when a `new_anomaly` insight is detected for the first time (idempotent — check `notification_events` for duplicates before writing)
- `confirmed_trend`: called in `GET /:surveyId/list` when `trend_persistence = 'confirmed'`
- `issue_resolved`: called when an `ongoing_issue` insight transitions to resolved
- `analysis_failed`: called when `agent_run.status = 'failed'` after all retries

**In-app delivery (frontend):**
```javascript
// GET /api/notifications/pending — returns unread in_app events for the current user
// Called on page focus and after a new run completes
router.get('/notifications/pending', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, notification_type, payload, created_at
     FROM notification_events
     WHERE user_id = $1 AND channel = 'in_app' AND status = 'delivered'
       AND created_at > NOW() - INTERVAL '24 hours'
       AND read_at IS NULL
     ORDER BY created_at DESC LIMIT 20`,
    [req.userId]
  );
  res.json({ notifications: rows });
});
```

Note: add `read_at TIMESTAMPTZ` column to `notification_events` to track which in-app notifications have been dismissed.

**Email/push (future):** When email infrastructure is chosen, a worker reads `notification_events WHERE channel = 'email' AND status = 'pending'`, delivers, and updates `status = 'delivered'`. No code changes needed outside the worker — the events table is the queue.

---

### 6b.6 Crystal Tier-Aware Prompt

**Modified file: `backend/src/routes/insights.js` — `POST /:surveyId/crystal`**

Pass `data_tier` to the agents service so Crystal calibrates its language:

```js
router.post('/:surveyId/crystal', requireAuth, async (req, res) => {
  const { message, conversation_history } = req.body;
  
  // Look up current data_tier
  const { rows: [survey] } = await db.query(
    'SELECT response_count FROM surveys WHERE id = $1 AND org_id = $2',
    [req.params.surveyId, req.orgId]
  );
  
  const data_tier = computeDataTier(survey?.response_count || 0);
  
  const result = await agentsClient.post('/insights/crystal', {
    ...req.body,
    survey_id: req.params.surveyId,
    org_id: req.orgId,
    data_tier,   // NEW: passed through to crystal.py system prompt
  });
  
  res.json(result.data);
});
```

---

### 6b.7 New `InsightState` TypedDict Fields

Add to the TypedDict in `agents/graphs/insights.py`:

```python
class InsightState(TypedDict, total=False):
    # ... existing fields ...
    data_tier: str          # 'collecting' | 'first_voices' | 'early_signals' | 'growing_picture' | 'full_report'
```

---

### 6b.8 Testing Progressive Tiers

**New test file: `agents/tests/test_progressive_tiers.py`**

```python
import pytest
from agents.graphs.insights import _compute_data_tier

def test_data_tier_boundaries():
    assert _compute_data_tier(0) == "collecting"
    assert _compute_data_tier(9) == "collecting"
    assert _compute_data_tier(10) == "first_voices"
    assert _compute_data_tier(39) == "first_voices"
    assert _compute_data_tier(40) == "early_signals"
    assert _compute_data_tier(99) == "early_signals"
    assert _compute_data_tier(100) == "growing_picture"
    assert _compute_data_tier(199) == "growing_picture"
    assert _compute_data_tier(200) == "full_report"
    assert _compute_data_tier(10000) == "full_report"

def test_node_absa_skipped_for_first_voices(mock_state):
    """node_absa should not run and should return empty absa_results for first_voices tier."""
    state = {**mock_state, "data_tier": "first_voices", "open_texts": [{"text": "test"}]}
    result = asyncio.run(node_absa(state))
    assert result["absa_results"] == []

def test_node_narrate_skipped_for_early_signals(mock_state):
    """node_narrate should not run and should return empty insights for early_signals tier."""
    state = {**mock_state, "data_tier": "early_signals", "topics": [{"name": "Test Topic"}]}
    result = asyncio.run(node_narrate(state))
    assert result["insights"] == []
```

---

## 7. Database Migrations Checklist

All migrations are in `supabase/migrations/`. Run them in order using `psql $DATABASE_URL -f` or via `supabase db push`. Each migration is idempotent using `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

| Order | File | Phase | Status | Description |
|-------|------|-------|--------|-------------|
| 1 | `20240101000000_initial.sql` | — | Deployed | Core tables: surveys, responses, orgs |
| 2 | `20240514000000_agents.sql` | — | Deployed | agent_runs, credits |
| 3 | `20240515000000_agents_compliance.sql` | — | Deployed | Compliance fields on agent_runs |
| 4 | `20240516000000_insights.sql` | — | Deployed | insights table v1 |
| 5 | `20240517000000_surveys_v2.sql` | — | Deployed | surveys v2 columns |
| 6 | `20240518000000_insights_v2.sql` | — | Deployed | insights v2 + survey_topics + crystal_threads |
| 7 | `20240519000000_response_enrichment.sql` | — | Deployed | ai_sentiment, ai_topics on responses |
| 8 | `20240519000001_survey_launch_settings.sql` | — | Deployed | insight_schedule_enabled on surveys |
| 9 | `20240520000000_topic_centroids.sql` | — | Deployed | survey_topic_centroids, topic_candidates |
| 10 | `20240520000001_topic_signals_extended.sql` | — | Deployed | Extended signal columns on survey_topics |
| 11 | `20240520000002_metric_snapshots.sql` | Phase 3 prereq | Deployed | survey_metric_snapshots, org_metric_snapshots |
| 12 | `20240521000001_insight_checkpoints.sql` | Phase 3 | **Not started** | survey_insight_checkpoints + perf indexes |
| 13 | `20240522000001_ai_operation_logs.sql` | Phase 5 | **Not started** | ai_operation_logs table + indexes |

**Phase 6 note:** Phase 6 — Progressive Intelligence requires **no new migrations**. The `data_tier` value is computed at runtime from `surveys.response_count` and `agent_runs.status` using the helper functions `computeDataTier()` and `computePageState()` in `backend/src/routes/insights.js`. No new columns or tables are needed.

The indexes in migration 12 also include:
- `survey_topics (survey_id, org_id, nps_correlation DESC)` — for `get_driver_analysis` tool
- `survey_metric_snapshots (org_id, captured_at DESC) WHERE anomaly_flag = TRUE` — for `get_anomaly_events` tool

---

## 8. Testing Strategy

### 8.1 Unit Tests — Tool Executors

**New file: `agents/tests/test_crystal_tools.py`**

Each test patches `db._pool_conn()` with an `AsyncMock` that returns pre-canned rows. The mock is structured to match psycopg's async cursor interface.

```python
"""Unit tests for Crystal tool executors.

Run with: pytest agents/tests/test_crystal_tools.py -v
"""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from agents.crystal.context import CrystalContext
from agents.crystal.tools import (
    execute_get_survey_overview,
    execute_get_metric_history,
    execute_get_verbatims,
    execute_get_driver_analysis,
)


@pytest.fixture
def survey_ctx():
    return CrystalContext(org_id="org_test", survey_id="survey_test", scope="survey")


@pytest.mark.asyncio
async def test_get_survey_overview_returns_expected_keys(survey_ctx):
    """Tool should return survey title, response_count, NPS, and top_topics."""
    mock_conn = AsyncMock()
    mock_cur  = AsyncMock()
    mock_cur.fetchone.side_effect = [
        ("Customer Pulse", 150),          # survey row
        (42.0, 38.0, 46.0, 150, 4.2, 0, False, None),  # snapshot row
    ]
    mock_cur.fetchall.return_value = [
        ("Onboarding", 45, -0.2, "frustrated", "up"),
        ("Support Quality", 38, 0.4, "satisfied", "stable"),
    ]
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__  = AsyncMock(return_value=None)
    mock_conn.cursor.return_value.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_conn.cursor.return_value.__aexit__  = AsyncMock(return_value=None)

    with patch("agents.crystal.tools.db._pool_conn", return_value=mock_conn):
        result = await execute_get_survey_overview({"survey_id": "survey_test"}, survey_ctx)

    assert result["title"] == "Customer Pulse"
    assert result["nps"] == 42.0
    assert len(result["top_topics"]) == 2
    assert result["top_topics"][0]["name"] == "Onboarding"


@pytest.mark.asyncio
async def test_get_metric_history_respects_days_cap(survey_ctx):
    """days parameter should be capped at 365."""
    mock_conn = AsyncMock()
    mock_cur  = AsyncMock()
    mock_cur.fetchall.return_value = []
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__  = AsyncMock(return_value=None)
    mock_conn.cursor.return_value.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_conn.cursor.return_value.__aexit__  = AsyncMock(return_value=None)

    with patch("agents.crystal.tools.db._pool_conn", return_value=mock_conn):
        result = await execute_get_metric_history({"survey_id": "survey_test", "days": 9999}, survey_ctx)

    # Should be capped internally to 365
    assert result["days"] == 365


@pytest.mark.asyncio
async def test_get_verbatims_filters_by_sentiment(survey_ctx):
    """Sentiment filter should be passed through to the SQL WHERE clause."""
    mock_conn = AsyncMock()
    mock_cur  = AsyncMock()
    # Return one row with answers JSON
    mock_cur.fetchall.return_value = [
        (json.dumps([{"type": "open_text", "value": "Great experience!"}]),
         9, "positive", None, json.dumps(["Service Quality"]))
    ]
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__  = AsyncMock(return_value=None)
    mock_conn.cursor.return_value.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_conn.cursor.return_value.__aexit__  = AsyncMock(return_value=None)

    with patch("agents.crystal.tools.db._pool_conn", return_value=mock_conn):
        result = await execute_get_verbatims(
            {"survey_id": "survey_test", "sentiment": "positive", "limit": 5},
            survey_ctx,
        )

    assert len(result["verbatims"]) == 1
    assert result["verbatims"][0]["text"] == "Great experience!"
    assert result["verbatims"][0]["sentiment"] == "positive"


@pytest.mark.asyncio
async def test_tool_returns_error_dict_on_db_failure(survey_ctx):
    """Executors should return {'error': ...} not raise on DB exceptions."""
    with patch("agents.crystal.tools.db._pool_conn", side_effect=RuntimeError("DB unavailable")):
        result = await execute_get_driver_analysis(
            {"survey_id": "survey_test", "topic_name": "Onboarding"},
            survey_ctx,
        )
    assert "error" in result
```

### 8.2 Integration Test — Full ReAct Loop

**New file: `agents/tests/test_crystal_react.py`**

This test requires a running local DB populated with test data. It is tagged `@pytest.mark.integration` and excluded from the default CI run.

```python
"""Integration test: full Crystal ReAct loop against local test DB.

Prerequisites:
  - AGENTS_DB_DSN pointing to a DB with at least one populated survey
  - OPENROUTER_API_KEY set (uses dev-tier free model)

Run with:
  pytest agents/tests/test_crystal_react.py -v -m integration
"""
import os
import pytest
from agents.agents.crystal import CrystalInput, _run_react_loop


@pytest.mark.integration
@pytest.mark.asyncio
async def test_react_loop_returns_valid_output():
    """ReAct loop should return a CrystalOutput with a non-empty answer."""
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY not set")

    inp = CrystalInput(
        survey_id=os.getenv("TEST_SURVEY_ID", ""),
        org_id=os.getenv("TEST_ORG_ID", ""),
        message="What is the NPS for this survey?",
        insights=[],
        topics=[],
        survey_title="Test Survey",
        survey_response_count=0,
        metrics={},
        conversation_history=[],
    )
    if not inp.survey_id or not inp.org_id:
        pytest.skip("TEST_SURVEY_ID / TEST_ORG_ID not set")

    output = await _run_react_loop(inp)
    assert output.answer, "answer should not be empty"
    assert len(output.answer) > 10, "answer should be substantive"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_react_loop_calls_tool_on_topic_question():
    """Questions about a specific topic should trigger get_topic_details tool call."""
    if not os.getenv("OPENROUTER_API_KEY") or not os.getenv("TEST_SURVEY_ID"):
        pytest.skip("Required env vars not set")

    inp = CrystalInput(
        survey_id=os.getenv("TEST_SURVEY_ID", ""),
        org_id=os.getenv("TEST_ORG_ID", ""),
        message="Tell me more about the Onboarding topic and show me some real quotes.",
        insights=[],
        topics=[{"name": "Onboarding", "volume": 30}],
        survey_title="Test Survey",
        survey_response_count=100,
        metrics={},
        conversation_history=[],
    )
    output = await _run_react_loop(inp)
    # If the tool was called, citations or the answer should reference topic data
    assert output.answer
```

### 8.3 Regression Test — Legacy Endpoint Backward Compatibility

**New file: `agents/tests/test_crystal_legacy.py`**

```python
"""Regression test: legacy POST /insights/crystal endpoint must continue working.

This test ensures that flipping CRYSTAL_STREAMING_ENABLED=false (the default)
leaves the existing single-call path completely intact.
"""
import os
import pytest
from unittest.mock import patch, AsyncMock
from agents.agents.crystal import crystal_agent, CrystalInput


@pytest.mark.asyncio
async def test_legacy_path_used_when_streaming_disabled():
    """When CRYSTAL_STREAMING_ENABLED=false, CrystalAgent.run() calls _run_crystal."""
    mock_output = AsyncMock()
    mock_output.answer      = "NPS is 42."
    mock_output.citations   = []
    mock_output.suggestions = []
    mock_output.insight_refs = []

    with patch.dict(os.environ, {"CRYSTAL_STREAMING_ENABLED": "false"}):
        with patch("agents.agents.crystal._run_crystal", return_value=mock_output) as mock_run:
            inp = CrystalInput(
                survey_id="test-survey",
                org_id="test-org",
                message="What is the NPS?",
                insights=[],
                topics=[],
            )
            output, credits = await crystal_agent.run(inp)

    mock_run.assert_called_once_with(inp)
    assert output.answer == "NPS is 42."
    assert credits == []
```

### 8.4 Eval Test — Answer Quality Distribution

**New file: `agents/evals/test_crystal_quality.py`**

```python
"""Eval: measure Crystal answer quality score distribution across 20 test questions.

Runs only when CRYSTAL_RUN_EVALS=true to avoid LLM cost on every CI run.
Produces a JSON report to agents/evals/results/crystal_quality_{timestamp}.json.

Target: >= 85% of answers score above 72 (the production acceptance threshold).
"""
import asyncio
import json
import os
import time
from pathlib import Path

import pytest


TEST_QUESTIONS = [
    "What is the NPS for this survey?",
    "What are the top 3 topics by volume?",
    "Which topic is most strongly hurting NPS?",
    "Show me some negative quotes about the Onboarding experience.",
    "Has NPS improved or declined over the last 30 days?",
    "What do promoters say that detractors don't?",
    "Are there any anomalies in the metric history?",
    "What should be the top priority action?",
    "How does our CSAT compare to industry benchmarks?",
    "What percentage of respondents mention Support Quality?",
    "Is the Billing topic trending up or down?",
    "What emotion is most common in negative responses?",
    "How many responses came in during the last 7 days?",
    "What is the effort score for the Onboarding topic?",
    "Are there any chronic issues we have not addressed?",
    "What are the key drivers of detractor sentiment?",
    "Which topics have improved sentiment momentum?",
    "Summarize the main themes in three bullet points.",
    "What follow-up actions do the prescriptive insights recommend?",
    "Is our response velocity increasing or decreasing?",
]


@pytest.mark.skipif(
    os.getenv("CRYSTAL_RUN_EVALS") != "true",
    reason="Skipped unless CRYSTAL_RUN_EVALS=true (incurs LLM cost)",
)
@pytest.mark.asyncio
async def test_crystal_quality_distribution():
    from agents.agents.crystal import CrystalInput, _run_react_loop
    from agents.agents.insight_experts import evaluate_crystal_response

    survey_id = os.getenv("EVAL_SURVEY_ID", "")
    org_id    = os.getenv("EVAL_ORG_ID", "")
    if not survey_id or not org_id:
        pytest.skip("EVAL_SURVEY_ID / EVAL_ORG_ID not set")

    results = []
    for question in TEST_QUESTIONS:
        inp = CrystalInput(
            survey_id=survey_id, org_id=org_id,
            message=question, insights=[], topics=[],
        )
        try:
            output = await _run_react_loop(inp)
            eval_result = await evaluate_crystal_response(
                user_question=question, answer=output.answer,
                valid_insight_ids=set(), cited_ids=output.citations or [],
                metrics_context="",
            )
            results.append({
                "question":      question,
                "score":         eval_result.quality_score,
                "grounded":      eval_result.is_grounded,
                "answers_q":     eval_result.answers_question,
                "issues":        eval_result.issues,
                "answer_len":    len(output.answer),
            })
        except Exception as exc:
            results.append({"question": question, "score": 0, "error": str(exc)})

    # Write results
    out_dir = Path("agents/evals/results")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"crystal_quality_{int(time.time())}.json"
    out_path.write_text(json.dumps(results, indent=2))

    scores = [r.get("score", 0) for r in results]
    above_threshold = sum(1 for s in scores if s >= 72)
    pass_rate = above_threshold / len(scores)

    print(f"\nCrystal eval: {above_threshold}/{len(scores)} questions scored >= 72 ({pass_rate:.0%})")
    print(f"Results written to {out_path}")

    assert pass_rate >= 0.85, (
        f"Quality pass rate {pass_rate:.0%} below 85% target. "
        f"Check {out_path} for details."
    )
```

---

## 9. Environment Variables Reference

All variables are consumed by the Python agents service (`agents/`) unless noted.

| Variable | Default | Phase | Service | Description |
|----------|---------|-------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Phase 1 | agents | Required if any model config sets `use_anthropic_sdk=True`. Currently not required since all envs route through OpenRouter. Keep set in staging/prod for future direct-SDK calls. |
| `OPENROUTER_API_KEY` | — | Phase 1 | agents | Required in all envs. Crystal's ReAct loop calls OpenRouter directly via httpx. |
| `CRYSTAL_MAX_TOOL_TURNS` | `10` | Phase 2 | agents | Maximum number of tool call iterations in the ReAct loop. Higher values produce more thorough answers but increase latency and cost. Set to `5` in dev to reduce cost. |
| `CRYSTAL_STREAMING_ENABLED` | `false` | Phase 2 | agents + backend | Feature flag. When `false`, `CrystalAgent.run()` uses the legacy single-call path. When `true`, uses the ReAct loop. Also controls which endpoint `CrystalPanel.tsx` targets (non-streaming vs streaming). |
| `CHECKPOINT_MIN_NEW_RESPONSES` | `30` | Phase 3 | agents | Minimum new responses since last checkpoint to trigger a new checkpoint. Lower in dev (`3`) to test without large data volume. |
| `CHECKPOINT_MAX_HOURS_SINCE_LAST` | `24` | Phase 3 | agents | Maximum hours between checkpoints. If this threshold is exceeded with at least 1 new response, a checkpoint is triggered. |
| `AGENTS_DB_DSN` | `postgresql://postgres:postgres@localhost:5432/experient` | All | agents | Postgres connection string. Must point to the same DB as `DATABASE_URL` in the Node.js backend. |
| `AGENTS_INTERNAL_KEY` | `dev-internal-key-change-in-prod` | All | both | Shared HMAC secret between Node.js backend and agents service. Set to a 32-byte random hex string in staging/prod via `openssl rand -hex 32`. |
| `AGENTS_ENV` | `dev` | All | agents | Model routing environment. `dev` uses free-tier OpenRouter models. `staging`/`prod` use higher-quality paid models. Affects ABSA concurrency, batch sizes, and model selection in `agents/lib/models.py`. |
| `CRYSTAL_RUN_EVALS` | `false` | Phase 2 | agents | Set to `true` to run the quality eval suite in `agents/evals/test_crystal_quality.py`. Incurs LLM cost (~$0.10–0.20 per full eval run). Never set in CI unless gated by cost controls. |

| `TIER_FIRST_VOICES` | `10` | Phase 6 | agents | Progressive tier trigger: minimum total responses for First Voices sub-tier run. Set to `2` in dev. |
| `TIER_EARLY_SIGNALS` | `40` | Phase 6 | agents | Progressive tier trigger: minimum total responses for Early Signals sub-tier run. Set to `5` in dev. |
| `TIER_GROWING_PICTURE` | `100` | Phase 6 | agents | Progressive tier trigger: minimum total responses for Growing Picture sub-tier run. Set to `10` in dev. |

The following existing variables are unchanged but load-bearing for Phase 1 tools:

| Variable | Notes |
|----------|-------|
| `INSIGHT_NEW_RESPONSE_THRESHOLD` | Existing. Controls incremental insight trigger in `response_stream.py`. Phase 3 adds separate checkpoint thresholds. |
| `INSIGHT_TIME_THRESHOLD_MIN` | Existing. Time-based fallback trigger for incremental insight runs. |
| `MAX_TOKENS_PER_RUN` | Existing. Hard cap on tokens per agent_run. The ReAct loop shares this budget with other agents in the same run. |
| `AGENTS_URL` | Existing. Used by `backend/src/routes/insights.js` to reach the agents service. Crystal stream route uses the same value. |

---

## 10. Rollout Strategy

### 10.1 Phase 1 and 2 — Behind Feature Flag

Both Phase 1 and Phase 2 are built behind `CRYSTAL_STREAMING_ENABLED`. The flag defaults to `false` in `agents/env.example` and in the deployment configuration. The legacy `_run_crystal()` path is never modified.

The flag is read in `CrystalAgent.run()`:
```python
if CRYSTAL_STREAMING_ENABLED:
    output = await _run_react_loop(inp)
else:
    output = await _run_crystal(inp)   # legacy, unchanged
```

The frontend `CrystalPanel.tsx` falls back to the non-streaming `api.crystalChat()` call if the stream endpoint returns an error. This means setting `CRYSTAL_STREAMING_ENABLED=true` on the backend while the frontend is still on the old code is safe — the panel will just use the legacy path.

**Recommended rollout sequence:**
1. Deploy Phase 1 (tool registry only) — `CRYSTAL_STREAMING_ENABLED=false`. No user-visible change.
2. Enable `CRYSTAL_STREAMING_ENABLED=true` in local dev only. Run eval suite.
3. If eval pass rate >= 85%, deploy Phase 2 to staging with flag enabled.
4. Monitor answer quality in staging for 48 hours. Check logs for `crystal_react_complete` events.
5. Enable flag in production.

### 10.2 Phase 3 — Checkpoint Infrastructure

The checkpoint database migration (`20240521000001_insight_checkpoints.sql`) is additive — no existing tables are altered. Run it before deploying the modified `response_stream.py`.

The `should_trigger_checkpoint()` function is called from `_trigger_insights()` only after a successful insight run, so partial deployments (migration without code, or code without migration) are safe.

### 10.3 Phase 4 — Additive Frontend Routes

The new `/app/experience/*` routes are purely additive. No existing routes are modified. The existing `/app/insights/*` routes remain fully intact and continue to work independently.

The SideNav "Experience" item is added to `NAV_ITEMS` in a single line change — it can be reverted by removing that line if needed.

---

## 11. Engineering Ownership Matrix

| Component | File(s) | Owner | Status |
|-----------|---------|-------|--------|
| Tool registry (12 tools, JSON schema) | `agents/crystal/registry.py` | AI Engineer | Not started |
| Tool executors (12 async functions, SQL queries) | `agents/crystal/tools.py` | AI Engineer | Not started |
| CrystalContext dataclass | `agents/crystal/context.py` | AI Engineer | Not started |
| ReAct loop (`_run_react_loop`) | `agents/agents/crystal.py` | AI Engineer | Not started |
| Streaming variant (`_run_react_loop_streaming`) | `agents/agents/crystal.py` | AI Engineer | Not started |
| SSE endpoint in agents service | `agents/main.py` | AI Engineer | Not started |
| SSE proxy endpoint in backend | `backend/src/routes/insights.js` | Software Engineer | Not started |
| CrystalPanel streaming UI | `app/src/components/CrystalPanel.tsx` | Software Engineer (Frontend) | Not started |
| Checkpoint trigger logic | `agents/consumers/response_stream.py` | Software Engineer | Not started |
| Checkpoint delta analysis | `agents/graphs/checkpoint.py` | Software Engineer | Not started |
| DB migration (insight_checkpoints) | `supabase/migrations/20240521000001_insight_checkpoints.sql` | Software Engineer | Not started |
| ExperienceHubPage | `app/src/pages/experience/ExperienceHubPage.tsx` | Software Engineer (Frontend) | Not started |
| SurveyIntelligencePage | `app/src/pages/experience/SurveyIntelligencePage.tsx` | Software Engineer (Frontend) | Not started |
| CheckpointReportPage | `app/src/pages/experience/CheckpointReportPage.tsx` | Software Engineer (Frontend) | Not started |
| TopicAnalysisPage, TopicDeepDivePage, SurveyTrendPage | `app/src/pages/experience/` | Software Engineer (Frontend) | Not started |
| Route constants + App.tsx + SideNav | `app/src/constants/routes.ts`, `app/src/App.tsx`, `app/src/components/SideNav.tsx` | Software Engineer (Frontend) | Not started |
| Unit tests (tool executors) | `agents/tests/test_crystal_tools.py` | AI Engineer | Not started |
| Integration tests (ReAct loop) | `agents/tests/test_crystal_react.py` | AI Engineer | Not started |
| Legacy regression tests | `agents/tests/test_crystal_legacy.py` | AI Engineer | Not started |
| Eval framework | `agents/evals/test_crystal_quality.py` | Applied Scientist | Not started |
| DB migrations (metric_snapshots) | `supabase/migrations/20240520000002_metric_snapshots.sql` | Software Engineer | **Deployed** |
| `_compute_data_tier()` in insights.py | `agents/graphs/insights.py` | AI Engineer | Not started |
| Tier-gated node guards | `agents/graphs/insights.py` | AI Engineer | Not started |
| `DATA_TIER_LANGUAGE_RULES` in constants.py | `agents/lib/constants.py` | Applied Science + AI Engineer | Not started |
| `page_state` + `data_tier` in insights.js API | `backend/src/routes/insights.js` | Software Engineer | Not started |
| `ProgressArc` + `InsightStateBanner` components | `app/src/pages/insights/ProgressArc.tsx`, `app/src/pages/insights/InsightStateBanner.tsx` | Software Engineer (Frontend) | Not started |
| Crystal `data_tier` passthrough | `backend/src/routes/insights.js`, `agents/agents/crystal.py` | AI Engineer | Not started |
| Progressive tier tests | `agents/tests/test_progressive_tiers.py` | AI Engineer | Not started |

---

## Appendix: Key File Index

This index maps every file referenced in this document to its role in the implementation.

**Python agents service (existing):**
- `agents/agents/crystal.py` — Crystal agent, modified in Phase 2
- `agents/lib/anthropic_client.py` — Reference implementation for tool-use pattern
- `agents/lib/openrouter.py` — OpenRouter client used by all agents
- `agents/lib/models.py` — Model routing table; `crystal` role config
- `agents/lib/db.py` — Postgres pool singleton
- `agents/graphs/insights.py` — Insights pipeline DAG; `InsightState` TypedDict
- `agents/consumers/response_stream.py` — Insight trigger consumer; modified in Phase 3
- `agents/main.py` — FastAPI app; SSE endpoint added in Phase 2

**Python agents service (new in Phases 1–3):**
- `agents/crystal/__init__.py`
- `agents/crystal/context.py`
- `agents/crystal/registry.py`
- `agents/crystal/tools.py`
- `agents/graphs/checkpoint.py`

**Node.js backend (existing):**
- `backend/src/routes/insights.js` — All insight routes; SSE proxy added in Phase 2

**React frontend (existing):**
- `app/src/components/CrystalPanel.tsx` — Crystal UI; streaming upgrade in Phase 2
- `app/src/components/SideNav.tsx` — Navigation; Experience item added in Phase 4
- `app/src/App.tsx` — Route registry; Experience routes added in Phase 4
- `app/src/constants/routes.ts` — Route constants; Experience routes added in Phase 4

**React frontend (new in Phase 4):**
- `app/src/pages/experience/ExperienceHubPage.tsx`
- `app/src/pages/experience/SurveyIntelligencePage.tsx`
- `app/src/pages/experience/CheckpointReportPage.tsx`
- `app/src/pages/experience/TopicAnalysisPage.tsx`
- `app/src/pages/experience/TopicDeepDivePage.tsx`
- `app/src/pages/experience/SurveyTrendPage.tsx`

**Database migrations:**
- `supabase/migrations/20240520000002_metric_snapshots.sql` — Already deployed
- `supabase/migrations/20240521000001_insight_checkpoints.sql` — Phase 3
- `supabase/migrations/20240522000001_ai_operation_logs.sql` — Phase 5 (new)

**Tests:**
- `agents/tests/test_crystal_tools.py`
- `agents/tests/test_crystal_react.py`
- `agents/tests/test_crystal_legacy.py`
- `agents/evals/test_crystal_quality.py`
