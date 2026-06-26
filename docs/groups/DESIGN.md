# Survey Groups — Technical Design

**Version:** 1.0
**Date:** 2026-06-22
**Status:** Design — Ready for Implementation
**Migration:** `supabase/migrations/20260622000001_survey_groups.sql`

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Data Model](#2-data-model)
3. [API Contracts](#3-api-contracts)
4. [Crystal Group Intelligence](#4-crystal-group-intelligence)
5. [Gap Detection Algorithm](#5-gap-detection-algorithm)
6. [Streaming Architecture](#6-streaming-architecture)
7. [Limits and Constraints](#7-limits-and-constraints)
8. [Frontend UX Design](#8-frontend-ux-design)

---

## 1. Feature Overview

### 1.1 The Grouping Primitive: Tags

A **tag** is the grouping primitive for Survey Groups. A tag is an org-scoped label with a name, optional color, optional description, and an optional `program_config` blob. Surveys are assigned to groups by tagging them. A survey tagged "Customer Experience Program" belongs to that group. A survey tagged both "CX Program" and "Q1 2026 Review" belongs to both groups simultaneously.

The tag IS the group. There is no separate "Group" entity. This eliminates a layer of indirection and keeps the mental model simple: create a tag, apply it to surveys, and the group exists.

### 1.2 Hybrid Approach: Tags and the Optional Program Upgrade

Plain tags are the default. A tag can optionally be upgraded to a **Program** by populating its `program_config` JSONB field. A Program tag carries additional configuration: the expected cadence, a list of expected touchpoints or survey types, and program-level metadata like the program owner and review schedule.

The upgrade path is additive — a plain tag can be promoted to a Program without disrupting any existing mappings. This enables the bottom-up workflow: start by tagging existing surveys, verify the grouping makes sense, then optionally formalize it as a Program with expected coverage and cadence enforcement.

```typescript
interface ProgramConfig {
  program_type: 'employee_experience' | 'customer_experience' | 'custom';
  expected_survey_types: SurveyType[];       // e.g. ['pulse', 'engagement', 'exit_interview']
  cadence: 'monthly' | 'quarterly' | 'biannual' | 'annual';
  review_cycle_months: number;               // How often to generate a group report
  owner_user_id?: string;
  program_description?: string;
  touchpoints?: Array<{                      // For CX programs
    name: string;
    expected_types: SurveyType[];
    required: boolean;
  }>;
}
```

### 1.3 AI-Suggested Tags

Crystal can suggest tags for surveys it analyzes. When Crystal's insight pipeline runs on a survey that is not yet tagged, Crystal evaluates whether any existing org tags are a semantic match and surfaces suggestions in the insight report. In Phase 4, Crystal proactively sends tag recommendations via the proactive-insights skill.

### 1.4 Group Insight Reports via Streaming Pipeline

Generating a group insight report is an asynchronous operation. The user triggers it via `POST /api/survey-groups/insights/generate` with one or more tag IDs. The backend creates a `group_insight_runs` record and fires-and-forgets to the CrystalOS agents service. The agents service runs the group insight LangGraph pipeline, writing stream events to `group_insight_runs.stream_events` as it progresses. The frontend polls via SSE (`GET /api/survey-groups/insights/:runId/stream`) and renders progress in real time.

This mirrors the existing `agent_runs` + SSE pattern used by single-survey insights.

### 1.5 Gap Detection Algorithm

The gap detection algorithm is the highest-value capability of the feature. It runs as part of every group insight report generation and produces structured `data_gap_signals` stored in the `group_insights` table. Gap signals have a `type`, `description`, `severity` (low/medium/high/critical), and `affected_surveys` array. For each gap, the algorithm also generates a `suggested_survey_json` — a concrete, actionable survey proposal that the user can create with one click.

---

## 2. Data Model

### 2.1 `survey_tags` Table

```sql
CREATE TABLE survey_tags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  name            TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  slug            TEXT        NOT NULL,                          -- URL-safe, auto-generated from name
  color           TEXT        NOT NULL DEFAULT '#6366f1',        -- Hex color for badge display
  description     TEXT        CHECK (description IS NULL OR char_length(description) <= 200),
  program_config  JSONB,                                         -- NULL = plain tag; non-NULL = Program
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, slug)
);

CREATE INDEX idx_survey_tags_org ON survey_tags (org_id);
```

**Notes:**
- `slug` is derived from `name` by `nameToSlug()` in `backend/src/routes/tags.js`. Guaranteed unique within an org by the UNIQUE constraint. Collision resolved by appending `-2`, `-3`, etc.
- `color` stores a hex string (e.g., `#6366f1`). The frontend TagBadge component uses this for the badge background.
- `program_config` being NULL is the sentinel for "plain tag." When non-NULL, the Program upgrade path applies.

### 2.2 `survey_tag_mappings` Table

```sql
CREATE TABLE survey_tag_mappings (
  survey_id  UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  tag_id     UUID        NOT NULL REFERENCES survey_tags(id) ON DELETE CASCADE,
  org_id     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (survey_id, tag_id)
);

CREATE INDEX idx_stm_tag    ON survey_tag_mappings (tag_id, org_id);
CREATE INDEX idx_stm_survey ON survey_tag_mappings (survey_id);
```

**5-tag limit trigger** (DB-enforced):

```sql
CREATE OR REPLACE FUNCTION enforce_survey_tag_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM survey_tag_mappings WHERE survey_id = NEW.survey_id
  ) >= 5 THEN
    RAISE EXCEPTION 'A survey cannot have more than 5 tags (org_id=%, survey_id=%)',
      NEW.org_id, NEW.survey_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_survey_tag_limit
  BEFORE INSERT ON survey_tag_mappings
  FOR EACH ROW EXECUTE FUNCTION enforce_survey_tag_limit();
```

The trigger fires on every INSERT. The backend catches error code `P0001` or the exception message containing "5 tags" and returns HTTP 400 with a human-readable message.

### 2.3 `group_insight_runs` Table

```sql
CREATE TABLE group_insight_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL,
  tag_ids       UUID[]      NOT NULL,               -- Array of tag IDs that defined this run
  survey_ids    UUID[]      NOT NULL,               -- Surveys included in this run (snapshot)
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','failed','cancelled')),
  stream_events JSONB       NOT NULL DEFAULT '[]',  -- Ordered array of SSE event objects
  error_log     JSONB       NOT NULL DEFAULT '[]',  -- Array of error objects
  result_json   JSONB,                              -- Optional: raw pipeline output for debugging
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  heartbeat_at  TIMESTAMPTZ                         -- Updated every 30s by the agents pipeline
);

CREATE INDEX idx_gir_org_created ON group_insight_runs (org_id, created_at DESC);
CREATE INDEX idx_gir_tag_ids     ON group_insight_runs USING GIN (tag_ids);
```

**Notes:**
- `survey_ids` is a snapshot of the surveys included at the time of run creation. If surveys are added or removed from a tag later, the run reflects the state at generation time.
- `stream_events` is a JSONB array that the agents service appends to via `UPDATE group_insight_runs SET stream_events = stream_events || $1::jsonb`. This is the same pattern used by `agent_runs.stream_events`.
- `heartbeat_at` is updated every 30 seconds by the pipeline. The zombie sweep job (scheduler.py) reaps runs where `heartbeat_at < NOW() - INTERVAL '15 minutes'` and status is 'running'.

### 2.4 `group_insights` Table

```sql
CREATE TABLE group_insights (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 TEXT         NOT NULL,
  run_id                 UUID         REFERENCES group_insight_runs(id) ON DELETE SET NULL,
  tag_ids                UUID[]       NOT NULL,
  survey_ids             UUID[]       NOT NULL,
  layer                  TEXT         NOT NULL
                         CHECK (layer IN ('descriptive','diagnostic','predictive','prescriptive')),
  category               TEXT         NOT NULL,
  -- Values: group.metric | group.theme | group.gap | group.suggest
  headline               TEXT         NOT NULL,
  narrative              TEXT         NOT NULL,
  metric_json            JSONB,                    -- { value, trend, delta, surveys_contributing }
  citations_json         JSONB,                    -- [{ survey_id, response_id, text }]
  trust_score            NUMERIC(5,4),             -- 0.0–1.0 hallucination gate score
  priority               INT,                      -- Display order (higher = more important)

  -- Gap intelligence fields
  data_gap_signals       JSONB,
  -- Shape: [{ type: 'temporal'|'type_coverage'|'topic_semantic'|'segment'|'metric_dimension',
  --           description: string, severity: 'low'|'medium'|'high'|'critical',
  --           affected_surveys: uuid[], suggested_cadence?: string }]

  suggested_survey_types TEXT[],                   -- e.g. ['pulse', 'exit_interview']
  suggested_survey_json  JSONB,
  -- Shape: { title: string, type: SurveyType, survey_category: string,
  --           questions_hint: string[], tags: string[], rationale: string }

  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  superseded_at          TIMESTAMPTZ              -- Set when a newer run completes for same tags
);

CREATE INDEX idx_gi_org_run  ON group_insights (org_id, run_id);
CREATE INDEX idx_gi_tag_ids  ON group_insights USING GIN (tag_ids);
CREATE INDEX idx_gi_active   ON group_insights (org_id, created_at DESC)
  WHERE superseded_at IS NULL;
```

**Category values and their semantics:**

| Category | Layer | Description |
|---|---|---|
| `group.metric` | descriptive / diagnostic | Cross-survey metric aggregation: NPS trend across all surveys in group |
| `group.theme` | descriptive | Common themes appearing across multiple surveys in the group |
| `group.gap` | prescriptive | Identified measurement gap with severity and suggested survey |
| `group.suggest` | prescriptive | Crystal-suggested program enhancement or coverage expansion |

### 2.5 `surveys_with_tags` View

```sql
CREATE OR REPLACE VIEW surveys_with_tags AS
  SELECT
    s.id, s.org_id, s.title, s.status, s.survey_type_id, s.created_at, s.updated_at,
    COALESCE(
      json_agg(
        json_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'color', t.color)
        ORDER BY t.name
      ) FILTER (WHERE t.id IS NOT NULL),
      '[]'
    ) AS tags
  FROM surveys s
  LEFT JOIN survey_tag_mappings m ON m.survey_id = s.id
  LEFT JOIN survey_tags         t ON t.id = m.tag_id
  WHERE s.deleted_at IS NULL
  GROUP BY s.id;
```

This view is the primary read path for the surveys list page. It returns each survey with its full tag array, eliminating N+1 queries in the frontend.

---

## 3. API Contracts

All endpoints require Bearer auth (Clerk JWT). The `requireAuth` middleware extracts `req.orgId` and `req.userId`.

### 3.1 `GET /api/tags`

List all org tags with survey counts.

**Response 200:**
```json
{
  "tags": [
    {
      "id": "uuid",
      "name": "Customer Experience Program",
      "slug": "customer-experience-program",
      "color": "#6366f1",
      "description": "All CX touchpoint surveys",
      "program_config": null,
      "created_at": "2026-01-15T10:00:00Z",
      "survey_count": 4
    }
  ]
}
```

### 3.2 `POST /api/tags`

Create a new tag. Requires `analyst` role.

**Request body:**
```json
{
  "name": "Employee Experience",
  "color": "#10b981",
  "description": "Annual + pulse EX program surveys"
}
```

**Response 201:**
```json
{
  "tag": {
    "id": "uuid",
    "name": "Employee Experience",
    "slug": "employee-experience",
    "color": "#10b981",
    "description": "Annual + pulse EX program surveys",
    "program_config": null,
    "created_at": "...",
    "survey_count": 0
  }
}
```

**Error cases:**
- `400` — name missing, name empty after trim, or org tag limit reached (50 for Free tier)
- `409` — tag with that name already exists in the org

### 3.3 `POST /api/surveys/:id/tags`

Apply one or more tags to a survey. Requires `analyst` role.

**Request body:**
```json
{
  "tag_ids": ["uuid1", "uuid2"]
}
```

**Response 201:**
```json
{ "success": true }
```

**Error cases:**
- `400` — `tag_ids` not an array, or DB trigger fires because survey already has 5 tags
- `404` — survey not found or does not belong to org
- `400` — one or more tag IDs are invalid

### 3.4 `DELETE /api/surveys/:id/tags/:tagId`

Remove a tag from a survey. Requires `analyst` role.

**Response 200:**
```json
{ "success": true }
```

**Error cases:**
- `404` — tag mapping not found

### 3.5 `POST /api/survey-groups/insights/generate`

Start a group insight run for one or more tags. Fire-and-forget to agents service.

**Request body:**
```json
{
  "tag_ids": ["uuid1"],
  "survey_ids": ["uuid-a", "uuid-b"]  // optional override; defaults to all surveys with any of tag_ids
}
```

**Response 202:**
```json
{ "run_id": "uuid" }
```

**Error cases:**
- `400` — tag_ids missing/empty, or any tag ID not found in org
- `400` — no surveys found for the specified tags

### 3.6 `GET /api/survey-groups/insights/:runId/stream` — SSE

Stream events from a group insight run. Returns `text/event-stream`.

**Event format:**

Each event is `data: <JSON>\n\n`. The JSON shapes:

```
// Progress events (emitted by agents pipeline)
{ "event": "progress", "step": "loading_surveys", "message": "Loading 4 surveys..." }
{ "event": "progress", "step": "running_gap_analysis", "message": "Detecting measurement gaps..." }
{ "event": "thinking", "content": "Analyzing temporal patterns..." }

// Completion event
{ "event": "complete", "data": { "insights": [...], "status": "completed" } }

// Error event
{ "event": "error", "message": "Pipeline failed: ..." }

// Timeout (after MAX_POLLS × 3 seconds = 120s)
{ "event": "timeout" }
```

The SSE handler polls `group_insight_runs.stream_events` every 3 seconds. It tracks `lastEventCount` to avoid re-sending events. On `status === 'completed'` or `'failed'`, it fetches `group_insights` for the run and emits the `complete` event.

---

## 4. Crystal Group Intelligence

### 4.1 Overview

Crystal's existing tool architecture is survey-scoped: every tool in `crystalos/crystal/registry.py` operates on a single `survey_id`. Group intelligence adds a parallel set of tools that operate on a `tag_ids` array + resolved `survey_ids`. The group scope is passed through the `CrystalContext` when a group query is initiated.

### 4.2 Six New Crystal Tools

Each tool follows the existing pattern: JSON Schema definition in `registry.py`, async executor in `tools.py`, dispatch case in `dispatch_tool()`.

**Tool 1: `get_group_surveys`**

```python
{
    "name": "get_group_surveys",
    "description": "Get all surveys belonging to a group (defined by tag IDs), including their metadata, response counts, and last insight dates.",
    "scope": "group",
    "input_schema": {
        "type": "object",
        "properties": {
            "tag_ids": {"type": "array", "items": {"type": "string"}, "description": "UUIDs of the tags defining this group"},
            "include_archived": {"type": "boolean", "default": False}
        },
        "required": ["tag_ids"]
    }
}
```

Executes:
```sql
SELECT s.id, s.title, s.status, s.survey_type_id, s.created_at,
       COUNT(r.id) AS response_count,
       MAX(i.created_at) AS last_insight_at
FROM survey_tag_mappings m
JOIN surveys s ON s.id = m.survey_id
LEFT JOIN responses r ON r.survey_id = s.id
LEFT JOIN insights i ON i.survey_id = s.id
WHERE m.tag_id = ANY($1::uuid[]) AND m.org_id = $2
  AND s.deleted_at IS NULL
GROUP BY s.id
ORDER BY s.created_at DESC;
```

**Tool 2: `get_group_metrics`**

```python
{
    "name": "get_group_metrics",
    "description": "Get aggregated metrics (NPS, CSAT, CES, response counts) across all surveys in a group, optionally broken down by survey.",
    "scope": "group",
    "input_schema": {
        "type": "object",
        "properties": {
            "survey_ids": {"type": "array", "items": {"type": "string"}},
            "metric": {"type": "string", "enum": ["nps", "csat", "ces", "all"], "default": "all"},
            "days": {"type": "integer", "default": 90}
        },
        "required": ["survey_ids"]
    }
}
```

Returns per-survey and aggregated metrics. For NPS, computes the aggregate NPS from the pooled promoter/detractor counts across all group surveys (not a simple average of survey NPS scores).

**Tool 3: `get_group_topics`**

```python
{
    "name": "get_group_topics",
    "description": "Get the most frequent topics across all surveys in a group, showing which surveys mention each topic and cross-survey topic sentiment.",
    "scope": "group",
    "input_schema": {
        "type": "object",
        "properties": {
            "survey_ids": {"type": "array", "items": {"type": "string"}},
            "limit": {"type": "integer", "default": 20},
            "min_frequency": {"type": "integer", "default": 3, "description": "Minimum mentions across the group to include a topic"}
        },
        "required": ["survey_ids"]
    }
}
```

Joins `survey_topics` across all group surveys. Groups by normalized topic name (using existing topic centroid matching from `lib/topic_registry.py`). Returns cross-survey topic frequency and sentiment breakdown.

**Tool 4: `analyze_group_coverage`**

```python
{
    "name": "analyze_group_coverage",
    "description": "Analyze what types of surveys exist in the group and whether the group covers the key dimensions of the implied XM program (CX, EX, or mixed).",
    "scope": "group",
    "input_schema": {
        "type": "object",
        "properties": {
            "survey_ids": {"type": "array", "items": {"type": "string"}},
            "program_type": {"type": "string", "enum": ["employee_experience", "customer_experience", "education", "auto"], "default": "auto"}
        },
        "required": ["survey_ids"]
    }
}
```

Returns a coverage matrix: which expected survey types are present, which are absent, and a coverage score (0–100). The `auto` detection infers program type from the predominant survey categories in the group.

**Tool 5: `detect_data_gaps`**

```python
{
    "name": "detect_data_gaps",
    "description": "Run the 5-pass gap detection algorithm on a group of surveys. Returns structured gap signals with severity and affected surveys.",
    "scope": "group",
    "input_schema": {
        "type": "object",
        "properties": {
            "survey_ids": {"type": "array", "items": {"type": "string"}},
            "tag_ids": {"type": "array", "items": {"type": "string"}},
            "program_type": {"type": "string", "enum": ["employee_experience", "customer_experience", "education", "auto"], "default": "auto"}
        },
        "required": ["survey_ids"]
    }
}
```

This is the primary gap analysis tool. Runs all 5 detection passes and returns the union of identified gaps. See Section 5 for the detailed algorithm.

**Tool 6: `suggest_new_survey`**

```python
{
    "name": "suggest_new_survey",
    "description": "Generate a concrete survey proposal to fill an identified gap in a group's measurement coverage. Returns a full survey spec ready for creation.",
    "scope": "group",
    "input_schema": {
        "type": "object",
        "properties": {
            "gap_description": {"type": "string", "description": "Description of the gap to fill"},
            "gap_type": {"type": "string", "enum": ["temporal", "type_coverage", "topic_semantic", "segment", "metric_dimension"]},
            "existing_survey_ids": {"type": "array", "items": {"type": "string"}},
            "tag_ids": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["gap_description", "gap_type"]
    }
}
```

Returns `suggested_survey_json`: `{ title, type, survey_category, questions_hint: string[], tags: string[], rationale: string }`. This proposal is stored in `group_insights.suggested_survey_json` and surfaced in the GroupReportPage as an actionable card.

### 4.3 Gap Analyst Skill

The gap analyst logic is encapsulated in a CrystalOS skill at `crystalos/skills/gap-analyst/`. The skill's `SKILL.md` configures it to use `detect_data_gaps` and `suggest_new_survey` tools, and produces structured gap report sections for the GroupReportPage.

The skill operates after the core group insights are generated and adds the `group.gap` and `group.suggest` category insights to the run.

### 4.4 Group Scope in Crystal Context

When a Crystal chat request comes in with a `tag_ids` array (via `POST /api/survey-groups/crystal`), the CrystalContext is built with group scope:

```python
@dataclass(frozen=True)
class CrystalContext:
    survey_id:  str | None    # None when in group scope
    org_id:     str
    user_id:    str
    scope:      Literal['survey', 'group']
    group_tag_ids:   list[str] | None  # Set when scope == 'group'
    group_survey_ids: list[str] | None # Resolved on context creation
```

Group-scoped tool calls route to the six group tools. Survey-scoped tool calls are disabled in group scope (calling `get_survey_overview` without a specific survey_id is nonsensical).

### 4.5 Thread Key for Group Conversations

Crystal threads for group conversations use the thread key format:

```
group:{sorted_tag_ids_joined_with_dash}:{org_id}
```

Example: `group:4a1b...-7c2e...:org_abc123`

The tag IDs are sorted before joining to ensure that `group:[tag-A,tag-B]` and `group:[tag-B,tag-A]` map to the same thread. Thread TTL is 7 days, same as survey threads.

---

## 5. Gap Detection Algorithm

The gap detection algorithm runs five sequential passes. Each pass produces zero or more `DataGapSignal` objects. Signals from all passes are merged, deduplicated, and stored in `group_insights.data_gap_signals`.

```typescript
interface DataGapSignal {
  type: 'temporal' | 'type_coverage' | 'topic_semantic' | 'segment' | 'metric_dimension';
  description: string;          // Human-readable description of the gap
  severity: 'low' | 'medium' | 'high' | 'critical';
  affected_surveys: string[];   // UUIDs of surveys this gap pertains to (empty = whole group)
  suggested_cadence?: string;   // For temporal gaps: inferred expected cadence
  missing_types?: string[];     // For type_coverage gaps: survey types that are absent
  missing_topics?: string[];    // For topic_semantic gaps: topics absent from some surveys
  missing_segments?: string[];  // For segment gaps: segments not represented
  missing_metrics?: string[];   // For metric_dimension gaps: metrics not captured
}
```

### 5.1 Pass 1: Temporal Gap Detection

**Goal:** Identify surveys (or missing surveys) where data collection has lapsed based on an inferred expected cadence.

**Algorithm:**

```python
def detect_temporal_gaps(surveys: list[SurveyRecord]) -> list[DataGapSignal]:
    signals = []
    for survey in surveys:
        # Infer cadence from survey type
        expected_cadence = CADENCE_MAP.get(survey.survey_type_id)
        if not expected_cadence:
            continue

        # Get the most recent response timestamp
        last_response_at = survey.last_response_at

        if last_response_at is None:
            # Survey exists but has never received a response
            signals.append(DataGapSignal(
                type='temporal',
                description=f'"{survey.title}" has no responses. Consider distributing it.',
                severity='medium',
                affected_surveys=[survey.id]
            ))
            continue

        days_since_last = (now - last_response_at).days
        lag_threshold = expected_cadence.lag_days  # e.g. 45 for monthly, 100 for quarterly

        if days_since_last > lag_threshold:
            severity = 'high' if days_since_last > lag_threshold * 2 else 'medium'
            signals.append(DataGapSignal(
                type='temporal',
                description=f'"{survey.title}" last received responses {days_since_last} days ago. '
                            f'Expected cadence: {expected_cadence.label}.',
                severity=severity,
                affected_surveys=[survey.id],
                suggested_cadence=expected_cadence.label
            ))
    return signals
```

**Cadence map (from `lib/constants.py`):**

```python
CADENCE_MAP = {
    'pulse':              CadenceConfig(label='monthly',     lag_days=45),
    'engagement':         CadenceConfig(label='annual',      lag_days=400),
    'enps':               CadenceConfig(label='quarterly',   lag_days=100),
    'exit_interview':     CadenceConfig(label='continuous',  lag_days=None),  # skip
    'nps':                CadenceConfig(label='transactional', lag_days=None), # skip
    'nps_relational':     CadenceConfig(label='quarterly',   lag_days=100),
    'csat':               CadenceConfig(label='transactional', lag_days=None),
    'onboarding_feedback': CadenceConfig(label='per_cohort', lag_days=None),
}
```

**SQL sketch for last_response_at:**
```sql
SELECT survey_id, MAX(created_at) AS last_response_at
FROM responses
WHERE survey_id = ANY($1::uuid[])
  AND status = 'complete'
GROUP BY survey_id;
```

### 5.2 Pass 2: Survey Type Coverage Matrix

**Goal:** Identify survey types that are expected for the inferred program type but are absent from the group.

**Algorithm:**

```python
EXPECTED_TYPES_BY_PROGRAM = {
    'employee_experience': {
        'required': ['engagement', 'pulse'],
        'recommended': ['exit_interview', 'onboarding_feedback', 'manager_effectiveness', 'enps'],
        'optional': ['dei_climate', 'wellbeing', '360_feedback']
    },
    'customer_experience': {
        'required': ['nps_relational'],
        'recommended': ['nps', 'csat', 'ces', 'voc'],
        'optional': ['concept_test', 'usability']
    }
}

def detect_type_coverage_gaps(surveys, program_type) -> list[DataGapSignal]:
    present_types = {s.survey_type_id for s in surveys}
    expected = EXPECTED_TYPES_BY_PROGRAM.get(program_type, {})

    signals = []
    missing_required = set(expected.get('required', [])) - present_types
    missing_recommended = set(expected.get('recommended', [])) - present_types

    if missing_required:
        signals.append(DataGapSignal(
            type='type_coverage',
            severity='critical',
            description=f'Your {program_type} program is missing required survey types: '
                       f'{", ".join(missing_required)}.',
            missing_types=list(missing_required),
            affected_surveys=[]
        ))

    if missing_recommended:
        signals.append(DataGapSignal(
            type='type_coverage',
            severity='medium',
            description=f'Consider adding these survey types for fuller coverage: '
                       f'{", ".join(missing_recommended)}.',
            missing_types=list(missing_recommended),
            affected_surveys=[]
        ))

    return signals
```

### 5.3 Pass 3: Topic Semantic Gaps

**Goal:** Identify dimensions of the experience (topics) that appear in some surveys in the group but are absent from others where they would be expected.

This pass uses the existing `survey_topics` table and topic centroid embeddings from `lib/topic_registry.py`.

**Algorithm:**

```python
def detect_topic_semantic_gaps(surveys, survey_topics_by_survey) -> list[DataGapSignal]:
    # Build a topic universe: all topics mentioned across any survey in the group
    all_topics = set()
    survey_topic_map = {}
    for survey in surveys:
        topics = {t.normalized_name for t in survey_topics_by_survey.get(survey.id, [])}
        survey_topic_map[survey.id] = topics
        all_topics |= topics

    signals = []
    for topic in all_topics:
        # Find surveys that discuss this topic
        covering_surveys = [sid for sid, topics in survey_topic_map.items() if topic in topics]
        missing_surveys = [sid for sid, topics in survey_topic_map.items() if topic not in topics]

        # If a topic is covered by 60%+ of surveys but absent from some, flag the missing ones
        coverage_ratio = len(covering_surveys) / len(surveys)
        if coverage_ratio >= 0.6 and missing_surveys:
            severity = 'medium' if coverage_ratio < 0.8 else 'high'
            signals.append(DataGapSignal(
                type='topic_semantic',
                severity=severity,
                description=f'Topic "{topic}" appears in {len(covering_surveys)} of {len(surveys)} '
                           f'group surveys but is absent from {len(missing_surveys)} surveys.',
                missing_topics=[topic],
                affected_surveys=missing_surveys
            ))

    return signals
```

**SQL sketch:**
```sql
SELECT st.survey_id, st.name AS topic_name, st.normalized_name, st.frequency
FROM survey_topics st
WHERE st.survey_id = ANY($1::uuid[])
  AND st.frequency >= 3
ORDER BY st.survey_id, st.frequency DESC;
```

### 5.4 Pass 4: Segment Coverage Gaps

**Goal:** Identify respondent segments (department, region, customer tier, tenure band) that appear in some surveys' response embedded data but not in others.

**Algorithm:**

```python
def detect_segment_gaps(surveys, embedded_data_samples) -> list[DataGapSignal]:
    # embedded_data_samples: dict[survey_id -> list of sampled embedded_data dicts]
    # Identify common segmentation dimensions across the group
    segment_dimensions = {}  # dimension_name -> set of surveys that use it

    for survey in surveys:
        samples = embedded_data_samples.get(survey.id, [])
        for sample in samples:
            for key in sample.keys():
                if key in KNOWN_SEGMENT_DIMENSIONS:  # e.g. 'department', 'region', 'customer_tier'
                    segment_dimensions.setdefault(key, set()).add(survey.id)

    signals = []
    for dim, covering_surveys in segment_dimensions.items():
        all_survey_ids = {s.id for s in surveys}
        missing = all_survey_ids - covering_surveys
        coverage_ratio = len(covering_surveys) / len(surveys)

        if coverage_ratio >= 0.5 and missing:
            signals.append(DataGapSignal(
                type='segment',
                severity='low',
                description=f'Segment dimension "{dim}" is captured in {len(covering_surveys)} surveys '
                           f'but not in {len(missing)} others. Cross-survey segment comparison '
                           f'requires consistent segmentation.',
                missing_segments=[dim],
                affected_surveys=list(missing)
            ))

    return signals
```

**SQL sketch:**
```sql
SELECT survey_id, embedded_data
FROM responses
WHERE survey_id = ANY($1::uuid[])
  AND status = 'complete'
ORDER BY created_at DESC
LIMIT 50;  -- sample 50 per survey
```

### 5.5 Pass 5: Metric Dimension Gaps

**Goal:** Identify key XM metrics (NPS, CSAT, CES, eNPS) that the program should be capturing based on its type but are absent from the group's surveys.

**Algorithm:**

```python
METRICS_BY_PROGRAM = {
    'employee_experience': ['enps', 'engagement_score', 'wellbeing_index'],
    'customer_experience': ['nps', 'csat', 'ces'],
}

def detect_metric_dimension_gaps(surveys, program_type) -> list[DataGapSignal]:
    # Determine which metrics are currently captured
    captured_metrics = set()
    for survey in surveys:
        if survey.survey_type_id in ('nps', 'nps_relational'):
            captured_metrics.add('nps')
        elif survey.survey_type_id == 'csat':
            captured_metrics.add('csat')
        elif survey.survey_type_id == 'ces':
            captured_metrics.add('ces')
        elif survey.survey_type_id == 'enps':
            captured_metrics.add('enps')
        elif survey.survey_type_id == 'engagement':
            captured_metrics.add('engagement_score')

    expected_metrics = set(METRICS_BY_PROGRAM.get(program_type, []))
    missing_metrics = expected_metrics - captured_metrics

    signals = []
    if missing_metrics:
        signals.append(DataGapSignal(
            type='metric_dimension',
            severity='high' if len(missing_metrics) > 1 else 'medium',
            description=f'Your {program_type} program is not capturing these key metrics: '
                       f'{", ".join(missing_metrics)}. Add surveys that measure these dimensions.',
            missing_metrics=list(missing_metrics),
            affected_surveys=[]
        ))

    return signals
```

---

## 6. Streaming Architecture

### 6.1 How `group_insight_runs.stream_events` Works

The `stream_events` JSONB column is the append-only event log for a group insight run. The agents service writes to it via:

```sql
UPDATE group_insight_runs
SET stream_events = stream_events || $1::jsonb,
    heartbeat_at  = NOW()
WHERE id = $2;
```

Each element in the array is a structured event object. Events are written as the pipeline progresses — not batched at the end. This enables the SSE polling pattern to show real-time progress.

### 6.2 SSE Polling Pattern

The SSE handler (`GET /api/survey-groups/insights/:runId/stream`) polls the database every 3 seconds. It maintains `lastEventCount` to avoid re-sending already-delivered events:

```javascript
const poll = async () => {
  const { rows } = await db.query(
    'SELECT status, stream_events FROM group_insight_runs WHERE id = $1 AND org_id = $2',
    [runId, req.orgId]
  );
  const events = rows[0].stream_events;

  // Send only new events
  for (const ev of events.slice(lastEventCount)) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
    lastEventCount++;
  }

  if (rows[0].status === 'completed' || rows[0].status === 'failed') {
    // Fetch final insights and send complete event
    const { rows: insights } = await db.query(
      'SELECT * FROM group_insights WHERE run_id = $1 ORDER BY priority DESC NULLS LAST',
      [runId]
    );
    res.write(`data: ${JSON.stringify({ event: 'complete', data: { insights } })}\n\n`);
    clearInterval(interval);
    res.end();
  }
};
const interval = setInterval(poll, 3000);
```

**MAX_POLLS = 40** (40 × 3s = 120 second timeout). Group insight runs are expected to complete within 60–90 seconds for typical groups (4–8 surveys, up to 2000 sampled responses).

### 6.3 Event Types and Shapes

```typescript
// Progress events — emitted at each pipeline node entry
{ event: 'progress', step: 'loading_surveys',        message: 'Loading 4 surveys...' }
{ event: 'progress', step: 'sampling_responses',      message: 'Sampling responses across surveys...' }
{ event: 'progress', step: 'running_gap_analysis',    message: 'Running gap detection...' }
{ event: 'progress', step: 'generating_themes',       message: 'Identifying cross-survey themes...' }
{ event: 'progress', step: 'computing_metrics',       message: 'Aggregating metrics...' }
{ event: 'progress', step: 'narrating',               message: 'Generating report narrative...' }
{ event: 'progress', step: 'writing_insights',        message: 'Finalizing insights...' }

// Thinking events — LLM chain-of-thought tokens (streamed)
{ event: 'thinking', content: '...' }

// Completion event — emitted once, terminates the stream
{ event: 'complete', data: { insights: GroupInsight[], status: 'completed' } }

// Error event — emitted if pipeline fails
{ event: 'error', message: 'Pipeline failed: ...', step: 'running_gap_analysis' }

// Timeout — emitted by the SSE handler, not the pipeline
{ event: 'timeout' }
```

---

## 7. Limits and Constraints

| Constraint | Free | Pro | Enterprise | Enforcement |
|---|---|---|---|---|
| Tags per org | 5 | 25 | 200 | Backend (ORG_TAG_LIMIT constant) |
| Tags per survey | 5 | 5 | 5 | DB trigger |
| Tag name length | 40 chars | 40 chars | 40 chars | DB CHECK constraint |
| Tag description length | 200 chars | 200 chars | 200 chars | DB CHECK constraint |
| Max sampled responses per group run | 2000 | 2000 | 2000 | Pipeline constant |
| Crystal group thread TTL | 7 days | 7 days | 7 days | Same as survey threads |
| Max concurrent group insight runs per org | 2 | 5 | 20 | Backend pre-check |
| SSE stream timeout | 120s | 120s | 120s | MAX_POLLS × 3s |

**Notes:**
- The 5-tag-per-survey limit is enforced at the DB trigger level, not just the application layer. It fires on every INSERT into `survey_tag_mappings`, regardless of the caller.
- The 2000-response sample cap prevents group runs from timing out. The pipeline samples evenly across surveys: if there are 4 surveys, each contributes up to 500 responses. If a survey has fewer than 500, the remainder is not redistributed to other surveys (to avoid over-representing well-sampled surveys).
- Org tag limits (Free=5, Pro=25, Enterprise=200) are not yet wired to Stripe. For the initial implementation, all orgs get the Pro limit (25). Tier enforcement is Phase 5 work.

---

## 8. Frontend UX Design

### 8.1 `TagBadge` Component

```tsx
// app/src/components/TagBadge.tsx
interface TagBadgeProps {
  tag: { id: string; name: string; color: string; slug: string };
  removable?: boolean;
  onRemove?: (tagId: string) => void;
  size?: 'sm' | 'md';
}
```

Renders as a pill with a colored left border (not background fill, to avoid clashing with survey status colors). The `removable` prop adds an `×` button. Color is applied as `borderLeftColor` and a 10% opacity background tint derived from the hex color.

```tsx
// Visual spec:
// [●] Customer Experience Program  ×
// border-l-4, border-color: tag.color
// bg: hexToRgba(tag.color, 0.1)
// text-xs font-medium px-2 py-0.5 rounded-full
```

### 8.2 `TagSelector` Combobox

```tsx
// app/src/components/TagSelector.tsx
interface TagSelectorProps {
  surveyId: string;
  currentTags: Tag[];
  allOrgTags: Tag[];
  onTagAdd: (tagId: string) => Promise<void>;
  onTagRemove: (tagId: string) => Promise<void>;
  onTagCreate: (name: string) => Promise<Tag>;
  maxTags?: number;  // Default: 5
}
```

A combobox that:
1. Shows existing tags as removable badges
2. Filters the tag list by typed input
3. Shows "Create tag: [typed name]" at the bottom of the list when no exact match exists
4. Disables further tag addition when `currentTags.length >= maxTags`

The combobox is triggered by clicking inside the tags area on the survey card or survey settings panel.

### 8.3 Generate Group Report Button

The "Generate Group Report" button appears in the `SurveysListPage` when a tag filter is active. It is positioned in the filter bar, right of the active tag chip:

```
[All Tags ▾]  [Customer Experience ×]  [+ Add Tag]  |  [Generate Group Report →]
```

The button is disabled if the filtered tag has fewer than 2 surveys. On click, it posts to `/api/survey-groups/insights/generate` and navigates to `GroupReportPage` with the `run_id`.

### 8.4 `GroupReportPage` — `/groups/:tagId/report`

The report page has four sections rendered in order:

**Section 1: Executive Summary**
- Group name (tag name), number of surveys, total responses in group, date range
- 2–3 sentence AI-generated summary (`group.theme` category insight with highest priority)
- Metric snapshot: overall NPS/CSAT/eNPS as applicable, with trend indicators

**Section 2: Cross-Survey Themes**
- Cards for each `group.theme` insight, ordered by priority
- Each card: headline, narrative, contributing surveys listed as mini-badges, verbatim quotes (citations_json)

**Section 3: Measurement Gaps**
- Cards for each `group.gap` insight, ordered by severity (critical first)
- Each card: gap type badge, description, severity indicator, affected surveys
- "Create Survey" CTA button that pre-populates the survey creator with `suggested_survey_json`

**Section 4: Suggested Enhancements**
- Cards for each `group.suggest` insight
- Lower priority, positioned last

### 8.5 Streaming Progress View

While a group insight run is in progress, the `GroupReportPage` renders a progress skeleton:

```
Generating group report for "Customer Experience Program"...

[████████░░░░░░░░░░░░] 45%   Running gap detection...

  ✓ Loaded 4 surveys (1,247 responses)
  ✓ Sampled responses
  ✓ Computed cross-survey metrics
  ▸ Running gap detection...
```

Each `progress` event advances the step indicator. `thinking` events are shown in a collapsible "Crystal is thinking..." drawer (same pattern as single-survey Crystal chat).

### 8.6 Tags Settings Page — `/settings/tags`

Accessible from the org Settings navigation. Lists all org tags with survey counts, color picker, description editor. Provides:
- Create tag form (name, color, optional description)
- Delete tag (with warning: deleting a tag removes it from all surveys)
- Promote tag to Program (opens program config drawer — Phase 4)

---

*See ROADMAP.md for the phased delivery plan and RESEARCH.md for the market research foundation.*
