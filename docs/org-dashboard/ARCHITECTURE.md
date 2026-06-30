# Org Intelligence Dashboard — Architecture

> **Document owner:** Dariusz Kowalski (Backend Architect)  
> **Last updated:** 2026-06-29  
> **Status:** Authoritative design — all implementation must follow this document. Changes require architecture review sign-off.

---

## System Overview

The Org Intelligence Dashboard aggregates data from every survey in an organization into a single coherent view. The data flow has three stages:

**Stage 1 — Source Layer (existing Xperiq tables)**  
Survey responses land in `survey_responses` with an NPS score, sentiment score, and verbatim text. These tables are the system of record. The org-dashboard never reads them directly for aggregated views — that path is too slow at scale.

**Stage 2 — Aggregation Layer (materialized views + computed tables)**  
A set of materialized views and scheduled computation jobs aggregate the source data into pre-computed summary rows. These are the primary read targets for all org-dashboard API endpoints. Refreshes happen on scheduled cadences (15-minute, hourly, daily) via pg_cron. Direct response inserts trigger Redis pub/sub events that feed the real-time layer separately.

**Stage 3 — Delivery Layer (REST + WebSocket)**  
The Express API reads from materialized views and Redis cache. The WebSocket server (`org-realtime.service.ts`) consumes Redis pub/sub channels and pushes incremental updates to connected clients. The frontend assembles the full view from an initial REST payload and then applies WebSocket deltas without a full page reload.

**Three-tier drill-down:**
```
Org Dashboard (Command Center)
  └── Tag Group Intelligence View (tag_group_metrics)
        └── Survey Detail + Insights (existing survey/insights pages)
```

Each drill-down level is a navigation transition, not an in-page expansion. State is passed via URL params so every level is deep-linkable and shareable.

---

## Data Model

### Existing tables (source layer — do not modify)

The org-dashboard reads from these but does not own them:
- `surveys` — `id`, `org_id`, `title`, `tag_group_id`, `deleted_at`
- `survey_responses` — `id`, `survey_id`, `org_id`, `nps_score`, `sentiment_score`, `submitted_at`
- `survey_topics` — `id`, `survey_id`, `org_id`, `topic_label`, `frequency`, `avg_sentiment`, `week_start`
- `tag_groups` — `id`, `org_id`, `name`

---

### Migration: org_metrics_daily (materialized view)

```sql
-- supabase/migrations/20260101000001_org_metrics_daily.sql

CREATE MATERIALIZED VIEW org_metrics_daily AS
SELECT
  sr.org_id,
  DATE_TRUNC('day', sr.submitted_at)::DATE        AS date,
  COUNT(*)                                         AS total_responses,
  ROUND(AVG(sr.nps_score)::NUMERIC, 2)             AS avg_nps,
  ROUND(AVG(sr.sentiment_score)::NUMERIC, 4)       AS avg_sentiment,
  COUNT(DISTINCT sr.survey_id)                     AS active_surveys,
  -- velocity = responses in the last 24h as a proportion of 7-day daily avg
  ROUND(
    COUNT(*) FILTER (
      WHERE sr.submitted_at >= NOW() - INTERVAL '24 hours'
    )::NUMERIC
    / NULLIF(
        COUNT(*) FILTER (
          WHERE sr.submitted_at >= NOW() - INTERVAL '7 days'
        ) / 7.0,
        0
      ),
    2
  )                                                AS response_velocity,
  NOW()                                            AS created_at
FROM survey_responses sr
JOIN surveys s ON s.id = sr.survey_id AND s.deleted_at IS NULL
GROUP BY sr.org_id, DATE_TRUNC('day', sr.submitted_at)::DATE
WITH DATA;

CREATE UNIQUE INDEX ON org_metrics_daily (org_id, date);
CREATE INDEX ON org_metrics_daily (org_id, date DESC);
```

---

### Migration: org_metrics_weekly (materialized view)

```sql
-- supabase/migrations/20260101000002_org_metrics_weekly.sql

CREATE MATERIALIZED VIEW org_metrics_weekly AS
WITH weekly AS (
  SELECT
    org_id,
    DATE_TRUNC('week', date)::DATE   AS week_start,
    SUM(total_responses)             AS total_responses,
    ROUND(AVG(avg_nps)::NUMERIC, 2)  AS avg_nps,
    ROUND(AVG(avg_sentiment)::NUMERIC, 4) AS avg_sentiment,
    MAX(active_surveys)              AS active_surveys
  FROM org_metrics_daily
  GROUP BY org_id, DATE_TRUNC('week', date)::DATE
),
lagged AS (
  SELECT
    w.*,
    LAG(w.avg_nps)         OVER (PARTITION BY w.org_id ORDER BY w.week_start) AS prev_nps,
    LAG(w.total_responses) OVER (PARTITION BY w.org_id ORDER BY w.week_start) AS prev_responses,
    LAG(w.avg_sentiment)   OVER (PARTITION BY w.org_id ORDER BY w.week_start) AS prev_sentiment
  FROM weekly w
)
SELECT
  org_id,
  week_start,
  total_responses,
  avg_nps,
  avg_sentiment,
  active_surveys,
  ROUND((avg_nps - COALESCE(prev_nps, avg_nps))::NUMERIC, 2)                AS nps_wow_delta,
  (total_responses - COALESCE(prev_responses, total_responses))              AS responses_wow_delta,
  ROUND((avg_sentiment - COALESCE(prev_sentiment, avg_sentiment))::NUMERIC, 4) AS sentiment_wow_delta,
  NOW()                                                                      AS created_at
FROM lagged
WITH DATA;

CREATE UNIQUE INDEX ON org_metrics_weekly (org_id, week_start);
CREATE INDEX ON org_metrics_weekly (org_id, week_start DESC);
```

---

### Migration: org_topic_trends (table)

```sql
-- supabase/migrations/20260101000003_org_topic_trends.sql

CREATE TABLE org_topic_trends (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start             DATE NOT NULL,
  topic_label            TEXT NOT NULL,
  frequency              INTEGER NOT NULL DEFAULT 0,
  avg_sentiment          NUMERIC(5,4) NOT NULL DEFAULT 0,
  is_new_this_week       BOOLEAN NOT NULL DEFAULT FALSE,
  frequency_change_pct   NUMERIC(8,2),  -- NULL for new topics, positive = rising, negative = falling
  rank                   INTEGER NOT NULL,  -- 1..20 per org per week
  computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_topic_trends_org_week_rank_unique UNIQUE (org_id, week_start, rank),
  CONSTRAINT rank_range CHECK (rank BETWEEN 1 AND 20)
);

CREATE INDEX ON org_topic_trends (org_id, week_start DESC);
CREATE INDEX ON org_topic_trends (org_id, topic_label);
```

The computation that populates this table runs as a scheduled function (not a materialized view) because it requires cross-week joins that a simple `REFRESH MATERIALIZED VIEW` cannot express cleanly. See the refresh strategy section.

---

### Migration: org_health_score (table)

```sql
-- supabase/migrations/20260101000004_org_health_score.sql

CREATE TABLE org_health_score (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- component scores, each 0.0 to 1.0
  nps_score               NUMERIC(5,4) NOT NULL,   -- weight: 40%
  sentiment_score         NUMERIC(5,4) NOT NULL,   -- weight: 30%
  response_velocity_score NUMERIC(5,4) NOT NULL,   -- weight: 20%
  anomaly_free_score      NUMERIC(5,4) NOT NULL,   -- weight: 10%
  -- composite, 0-100
  total_score             INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  -- metadata
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_through           TIMESTAMPTZ NOT NULL,    -- invalidated when new data arrives
  CONSTRAINT org_health_score_org_unique UNIQUE (org_id)  -- one live row per org, upserted
);

CREATE INDEX ON org_health_score (org_id);
CREATE INDEX ON org_health_score (computed_at DESC);

-- Computation logic (called by pg_cron, not inline)
-- nps_score:               LEAST(GREATEST((avg_nps + 100) / 200.0, 0), 1)
-- sentiment_score:         LEAST(GREATEST((avg_sentiment + 1) / 2.0, 0), 1)
-- response_velocity_score: LEAST(response_velocity / 3.0, 1)  -- 3x baseline = perfect score
-- anomaly_free_score:      1 - LEAST(open_anomaly_count::NUMERIC / 10.0, 1)
-- total_score:             ROUND((nps_score * 0.4 + sentiment_score * 0.3 +
--                                 response_velocity_score * 0.2 + anomaly_free_score * 0.1) * 100)
```

---

### Migration: tag_group_metrics (materialized view)

```sql
-- supabase/migrations/20260101000005_tag_group_metrics.sql

CREATE MATERIALIZED VIEW tag_group_metrics AS
SELECT
  tg.id                                           AS tag_group_id,
  tg.org_id,
  tg.name                                         AS tag_group_name,
  DATE_TRUNC('day', sr.submitted_at)::DATE        AS date,
  COUNT(*)                                         AS total_responses,
  ROUND(AVG(sr.nps_score)::NUMERIC, 2)             AS avg_nps,
  ROUND(AVG(sr.sentiment_score)::NUMERIC, 4)       AS avg_sentiment,
  COUNT(DISTINCT sr.survey_id)                     AS active_surveys,
  NOW()                                            AS created_at
FROM survey_responses sr
JOIN surveys s ON s.id = sr.survey_id AND s.deleted_at IS NULL
JOIN tag_groups tg ON tg.id = s.tag_group_id
GROUP BY tg.id, tg.org_id, tg.name, DATE_TRUNC('day', sr.submitted_at)::DATE
WITH DATA;

CREATE UNIQUE INDEX ON tag_group_metrics (tag_group_id, date);
CREATE INDEX ON tag_group_metrics (org_id, date DESC);
CREATE INDEX ON tag_group_metrics (tag_group_id, date DESC);
```

---

### Migration: survey_health_summary (materialized view)

```sql
-- supabase/migrations/20260101000006_survey_health_summary.sql

CREATE TYPE sentiment_trend_enum AS ENUM ('improving', 'stable', 'declining');
CREATE TYPE health_status_enum AS ENUM ('healthy', 'attention', 'critical');

CREATE MATERIALIZED VIEW survey_health_summary AS
WITH recent AS (
  SELECT
    survey_id,
    ROUND(AVG(nps_score)::NUMERIC, 2)                                   AS last_nps,
    COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '7 days')   AS response_velocity_7d,
    ROUND(AVG(sentiment_score) FILTER (
      WHERE submitted_at >= NOW() - INTERVAL '7 days')::NUMERIC, 4)    AS recent_sentiment,
    ROUND(AVG(sentiment_score) FILTER (
      WHERE submitted_at BETWEEN NOW() - INTERVAL '14 days'
                             AND NOW() - INTERVAL '7 days')::NUMERIC, 4) AS prev_sentiment
  FROM survey_responses
  WHERE submitted_at >= NOW() - INTERVAL '14 days'
  GROUP BY survey_id
),
anomaly_counts AS (
  SELECT survey_id, COUNT(*) AS anomaly_count
  FROM survey_anomalies
  WHERE resolved_at IS NULL
  GROUP BY survey_id
)
SELECT
  s.id                                                           AS survey_id,
  s.org_id,
  s.tag_group_id,
  COALESCE(r.last_nps, 0)                                        AS last_nps,
  COALESCE(r.response_velocity_7d, 0)                            AS response_velocity_7d,
  CASE
    WHEN r.recent_sentiment IS NULL OR r.prev_sentiment IS NULL THEN 'stable'::sentiment_trend_enum
    WHEN r.recent_sentiment > r.prev_sentiment + 0.05            THEN 'improving'::sentiment_trend_enum
    WHEN r.recent_sentiment < r.prev_sentiment - 0.05            THEN 'declining'::sentiment_trend_enum
    ELSE 'stable'::sentiment_trend_enum
  END                                                            AS sentiment_trend,
  COALESCE(ac.anomaly_count, 0)                                  AS anomaly_count,
  CASE
    WHEN COALESCE(ac.anomaly_count, 0) > 2
         OR COALESCE(r.last_nps, 0) < -20                       THEN 'critical'::health_status_enum
    WHEN COALESCE(ac.anomaly_count, 0) > 0
         OR COALESCE(r.last_nps, 0) < 20                        THEN 'attention'::health_status_enum
    ELSE 'healthy'::health_status_enum
  END                                                            AS health_status,
  MAX(sr2.submitted_at)                                          AS last_activity_at,
  NOW()                                                          AS created_at
FROM surveys s
LEFT JOIN recent r ON r.survey_id = s.id
LEFT JOIN anomaly_counts ac ON ac.survey_id = s.id
LEFT JOIN survey_responses sr2 ON sr2.survey_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.org_id, s.tag_group_id, r.last_nps, r.response_velocity_7d,
         r.recent_sentiment, r.prev_sentiment, ac.anomaly_count
WITH DATA;

CREATE UNIQUE INDEX ON survey_health_summary (survey_id);
CREATE INDEX ON survey_health_summary (org_id, health_status);
CREATE INDEX ON survey_health_summary (org_id, last_activity_at DESC);
```

---

### Migration: org_crystal_briefs (table)

```sql
-- supabase/migrations/20260101000007_org_crystal_briefs.sql

CREATE TABLE org_crystal_briefs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date_range_start  DATE NOT NULL,
  date_range_end    DATE NOT NULL,
  brief_text        TEXT NOT NULL,                  -- 2-3 sentence narrative
  recommendations   JSONB NOT NULL DEFAULT '[]',    -- array of {rank, action, rationale, survey_id?}
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_version     TEXT NOT NULL,                  -- crystalos graph version that produced this
  input_snapshot    JSONB,                          -- org metrics snapshot used as input (for debugging)
  CONSTRAINT org_crystal_briefs_org_week_unique UNIQUE (org_id, date_range_start)
);

CREATE INDEX ON org_crystal_briefs (org_id, date_range_start DESC);

-- recommendations JSONB schema:
-- [
--   {
--     "rank": 1,
--     "action": "Investigate declining NPS in the Onboarding survey (down 12 points WoW)",
--     "rationale": "Three of your five critical-path programs show correlated negative sentiment",
--     "survey_id": "uuid | null",
--     "tag_group_id": "uuid | null",
--     "action_type": "investigate | review | celebrate | monitor"
--   }
-- ]
```

---

## Materialized View Refresh Strategy

### 15-Minute Refresh (via pg_cron)

Refreshed every 15 minutes because this is the data freshness SLA for org-level metrics. The cost is acceptable because `org_metrics_daily` only reads the current day's partition.

```sql
SELECT cron.schedule(
  'refresh-org-metrics-daily',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY org_metrics_daily$$
);

SELECT cron.schedule(
  'refresh-tag-group-metrics',
  '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY tag_group_metrics$$
);
```

`CONCURRENTLY` is used so reads are not blocked during refresh. This requires the unique index to be present.

### Hourly Refresh

`survey_health_summary` is refreshed hourly because its anomaly join reads from a separate table that is updated infrequently, and full recalculation is bounded by the survey count (not response count).

```sql
SELECT cron.schedule(
  'refresh-survey-health-summary',
  '0 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY survey_health_summary$$
);
```

### Daily Refresh (via pg_cron + stored procedure)

`org_metrics_weekly` is refreshed once per day at 02:00 UTC. The weekly rollup reads from `org_metrics_daily` (already aggregated), so the daily refresh is inexpensive.

`org_topic_trends` is populated by a stored procedure (not a simple REFRESH) because it requires the previous week's data for frequency change calculation:

```sql
SELECT cron.schedule(
  'refresh-org-metrics-weekly',
  '0 2 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY org_metrics_weekly$$
);

SELECT cron.schedule(
  'compute-org-topic-trends',
  '30 2 * * 1',   -- Monday 02:30 UTC, after weekly refresh completes
  $$CALL compute_org_topic_trends()$$
);

SELECT cron.schedule(
  'compute-org-health-scores',
  '0 3 * * *',
  $$CALL compute_all_org_health_scores()$$
);
```

The Crystal brief generation is not triggered by pg_cron directly — it is triggered by a backend scheduler job in `backend/src/jobs/crystal-brief.job.ts` that calls the CrystalOS `/graphs/org-brief` endpoint and persists the result.

---

## API Design

All org-dashboard endpoints require a valid Clerk session. The org_id is extracted from the authenticated session — it is never accepted as a query parameter from the client.

### GET /api/org/dashboard

Returns the full initial payload for Command Center. This is the only endpoint the frontend calls on page load.

**Request:**
```
GET /api/org/dashboard
Authorization: Bearer <clerk_token>
```

**Response (200):**
```typescript
{
  org: {
    id: string;
    name: string;
  };
  healthScore: {
    total: number;          // 0-100
    components: {
      nps: number;          // 0-1
      sentiment: number;    // 0-1
      velocity: number;     // 0-1
      anomalyFree: number;  // 0-1
    };
    computedAt: string;     // ISO timestamp
  };
  kpis: {
    activeSurveys: number;
    totalResponses: number;
    responsesToday: number;
    avgNps: number;
    npsWowDelta: number;
    avgSentiment: number;
    sentimentTrend: 'improving' | 'stable' | 'declining';
  };
  crystalBrief: {
    id: string;
    briefText: string;
    recommendations: Array<{
      rank: number;
      action: string;
      rationale: string;
      surveyId: string | null;
      tagGroupId: string | null;
      actionType: 'investigate' | 'review' | 'celebrate' | 'monitor';
    }>;
    generatedAt: string;
    dateRangeStart: string;
    dateRangeEnd: string;
  } | null;
  dataFreshnessAt: string;   // timestamp of last materialized view refresh
}
```

**Error responses:**
- `401` — missing or invalid auth token
- `404` — org has no surveys yet (return empty state payload, not a 404)
- `500` — database error, include `requestId` for log correlation

---

### GET /api/org/dashboard/trends

Returns time-series data for the NPS trend chart. The date range defaults to 30 days.

**Request:**
```
GET /api/org/dashboard/trends?range=30d&granularity=daily
Authorization: Bearer <clerk_token>

Query params:
  range:       "7d" | "30d" | "90d" | "1y"  (default: "30d")
  granularity: "daily" | "weekly"             (default: "daily" for <=90d, "weekly" for 1y)
```

**Response (200):**
```typescript
{
  series: Array<{
    date: string;           // ISO date "2026-06-15"
    avgNps: number;
    totalResponses: number;
    avgSentiment: number;
  }>;
  benchmark: {
    nps: number | null;     // industry benchmark if configured, else null
    source: string | null;
  };
}
```

---

### GET /api/org/dashboard/programs

Returns paginated survey list with health summary for the Programs Overview table.

**Request:**
```
GET /api/org/dashboard/programs?page=1&pageSize=25&sort=health&order=asc&tagGroupId=uuid
Authorization: Bearer <clerk_token>

Query params:
  page:        integer (default: 1)
  pageSize:    integer 10|25|50 (default: 25)
  sort:        "health" | "nps" | "responses" | "lastActivity" | "name" (default: "health")
  order:       "asc" | "desc" (default: "asc" for health = critical first)
  tagGroupId:  UUID (optional, filters to one tag group)
  status:      "healthy" | "attention" | "critical" (optional filter)
```

**Response (200):**
```typescript
{
  programs: Array<{
    surveyId: string;
    surveyTitle: string;
    tagGroupId: string | null;
    tagGroupName: string | null;
    responses7d: number;
    lastNps: number;
    sentimentTrend: 'improving' | 'stable' | 'declining';
    velocityScore: number;
    healthStatus: 'healthy' | 'attention' | 'critical';
    lastActivityAt: string;
    sparkline: number[];    // last 7 NPS daily values for inline sparkline
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

---

### GET /api/org/dashboard/topics

Returns the current week's top 20 cross-survey emerging topics.

**Request:**
```
GET /api/org/dashboard/topics
Authorization: Bearer <clerk_token>
```

**Response (200):**
```typescript
{
  weekStart: string;
  topics: Array<{
    topicLabel: string;
    frequency: number;
    avgSentiment: number;    // -1.0 to 1.0
    isNewThisWeek: boolean;
    frequencyChangePct: number | null;
    rank: number;
    surveyIds: string[];     // which surveys this topic appears in
  }>;
}
```

---

### GET /api/org/dashboard/alerts

Returns open (unresolved) anomaly alerts for the org, newest first.

**Request:**
```
GET /api/org/dashboard/alerts?limit=20
Authorization: Bearer <clerk_token>
```

**Response (200):**
```typescript
{
  alerts: Array<{
    id: string;
    surveyId: string;
    surveyTitle: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    detectedAt: string;
    resolvedAt: string | null;
    isAcknowledged: boolean;
  }>;
  totalUnresolved: number;
}
```

**PATCH /api/org/dashboard/alerts/:alertId/acknowledge** (marks acknowledged, does not resolve)
```typescript
// Request body: empty
// Response 200: { alertId: string; acknowledgedAt: string }
```

---

### GET /api/org/dashboard/crystal-brief

Returns the most recent Crystal brief for the org.

**Request:**
```
GET /api/org/dashboard/crystal-brief
Authorization: Bearer <clerk_token>
```

**Response (200):** Same shape as the `crystalBrief` field in `/api/org/dashboard`, plus:
```typescript
{
  // all crystalBrief fields above, plus:
  inputSnapshot: object | null;   // debug — only returned to org admins
}
```

**POST /api/org/dashboard/crystal-brief/regenerate** (triggers async regeneration)
```typescript
// No request body
// Response 202: { jobId: string; estimatedSeconds: number }
// The new brief is pushed via WebSocket when complete
```

---

### GET /api/org/health-score

Returns the current org health score with full component breakdown.

**Request:**
```
GET /api/org/health-score
Authorization: Bearer <clerk_token>
```

**Response (200):**
```typescript
{
  totalScore: number;         // 0-100
  status: 'healthy' | 'attention' | 'critical';
  components: {
    nps: { score: number; weight: 0.4; contribution: number };
    sentiment: { score: number; weight: 0.3; contribution: number };
    responseVelocity: { score: number; weight: 0.2; contribution: number };
    anomalyFree: { score: number; weight: 0.1; contribution: number };
  };
  history: Array<{ date: string; totalScore: number }>;  // last 30 days
  computedAt: string;
}
```

---

### WebSocket: ws://api/org/dashboard/live

Real-time incremental updates. The client connects after the initial REST payload loads.

**Connection:**
```
WS /api/org/dashboard/live
Sec-WebSocket-Protocol: Bearer.<clerk_token>
```

**Server → Client message types:**

```typescript
// New response received (triggers KPI counter update)
{
  type: 'response_received';
  payload: {
    surveyId: string;
    orgId: string;
    npsScore: number;
    sentimentScore: number;
    submittedAt: string;
    // Running totals (debounced — sent max once per 3 seconds)
    orgTotals: {
      responsesToday: number;
      avgNps: number;
      avgSentiment: number;
    };
  };
}

// New anomaly detected
{
  type: 'anomaly_detected';
  payload: {
    alertId: string;
    surveyId: string;
    surveyTitle: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    detectedAt: string;
  };
}

// Crystal brief regeneration complete
{
  type: 'crystal_brief_ready';
  payload: {
    briefId: string;
    generatedAt: string;
  };
}

// Health score recomputed
{
  type: 'health_score_updated';
  payload: {
    totalScore: number;
    computedAt: string;
  };
}

// Heartbeat (server → client every 30s)
{ type: 'ping'; timestamp: string; }
```

**Client → Server message types:**
```typescript
// Acknowledge heartbeat
{ type: 'pong'; }

// Subscribe to a specific survey's real-time events (for drill-down)
{ type: 'subscribe_survey'; surveyId: string; }

// Unsubscribe
{ type: 'unsubscribe_survey'; surveyId: string; }
```

---

## CrystalOS Org Brief Graph (LangGraph DAG)

**File:** `crystalos/graphs/org_brief_graph.py`

The graph runs once per org per week (triggered by the backend scheduler). It produces one `org_crystal_briefs` row.

### Node: aggregate_org_metrics

**Inputs:** `org_id: str`, `date_range_start: date`, `date_range_end: date`  
**Outputs:** `org_metrics: OrgMetricsSnapshot`

```python
# Queries org_metrics_weekly for the target week + 3 prior weeks (for trend context)
# Queries survey_health_summary for all surveys in the org
# Returns a structured snapshot:
class OrgMetricsSnapshot(TypedDict):
    org_id: str
    week_start: str
    total_responses: int
    avg_nps: float
    avg_sentiment: float
    nps_wow_delta: float
    responses_wow_delta: int
    active_surveys: int
    critical_surveys: list[SurveyHealthRow]
    attention_surveys: list[SurveyHealthRow]
    healthy_surveys: list[SurveyHealthRow]
    top_topics: list[TopicRow]
```

---

### Node: identify_top_programs

**Inputs:** `org_metrics: OrgMetricsSnapshot`  
**Outputs:** `ranked_programs: list[RankedProgram]`

Ranking algorithm — composite score per survey:
```python
# response_velocity_score: velocity_7d / max_velocity_in_org (normalized 0-1)
# nps_trend_score: 1.0 if improving, 0.5 if stable, 0.0 if declining
# health_weight: critical = 3.0, attention = 2.0, healthy = 1.0
# rank_score = health_weight * (0.6 * velocity_score + 0.4 * nps_trend_score)
# Top 5 by rank_score are "top programs to highlight"
```

---

### Node: detect_org_signals

**Inputs:** `org_metrics: OrgMetricsSnapshot`  
**Outputs:** `org_signals: list[OrgSignal]`

Cross-survey anomaly logic:
```python
# Signal 1: Correlated negative sentiment
#   Condition: >= 3 surveys show declining sentiment_trend simultaneously
#   Severity: critical if all 3 are in the same tag_group, warning otherwise
#   Description: "3 of your {N} programs show simultaneous negative sentiment this week"

# Signal 2: Response velocity collapse
#   Condition: org response_velocity_7d < 0.3 AND was > 0.7 two weeks ago
#   Severity: warning
#   Description: "Response volume dropped 60%+ compared to last week"

# Signal 3: NPS floor breach
#   Condition: avg_nps < -20 for the current week
#   Severity: critical
#   Description: "Org-level NPS has fallen below -20 — immediate review recommended"

# Signal 4: Bright spot
#   Condition: >= 2 surveys show improving sentiment AND nps_wow_delta > 5
#   Severity: info (celebratory)
#   Description: "Multiple programs are trending positive — worth amplifying"
```

---

### Node: synthesize_narrative

**Inputs:** `org_metrics: OrgMetricsSnapshot`, `org_signals: list[OrgSignal]`, `ranked_programs: list[RankedProgram]`  
**Outputs:** `narrative: str`  

LLM prompt structure:
```python
SYSTEM_PROMPT = """
You are Crystal, Xperiq's AI copilot. You are writing a weekly executive brief for a VP of CX.

Your voice: direct, confident, specific. You name programs. You cite numbers. You do not hedge with
"it seems like" or "you might want to consider." You speak in the present tense about what is true
now and what to do next. You are not a report — you are a trusted analyst briefing an executive in
30 seconds before a board meeting.

Length: exactly 2-3 sentences. No more. The executive is reading this on a dashboard, not in an email.
"""

USER_PROMPT = """
Weekly brief for {org_name} ({week_range}):

Key metrics:
- Org NPS: {avg_nps} ({nps_wow_delta:+.1f} WoW)
- Total responses: {total_responses} ({responses_wow_delta:+d} WoW)  
- Active programs: {active_surveys}
- Health breakdown: {healthy_count} healthy, {attention_count} attention, {critical_count} critical

Signals detected:
{signals_text}

Top programs to reference:
{top_programs_text}

Write the executive brief (2-3 sentences).
"""
```

---

### Node: generate_recommendations

**Inputs:** `org_metrics: OrgMetricsSnapshot`, `org_signals: list[OrgSignal]`, `ranked_programs: list[RankedProgram]`  
**Outputs:** `recommendations: list[Recommendation]`

Selection algorithm — produces exactly 3 recommendations, prioritized:
1. If there is a critical-severity signal: the first recommendation is always "Investigate [critical program/signal]"
2. If there is an attention-level program with declining NPS trend: "Review [program name] — NPS down [X] points WoW"
3. If there is a bright spot signal: "Amplify [program name] — your highest-performing program this week"
4. Fallback (no signals): "Review response velocity in [lowest-velocity program]", "Check [declining sentiment program]", "Continue monitoring [org-level NPS trend]"

Each recommendation includes `survey_id` or `tag_group_id` when it references a specific program, so the frontend can render a direct navigation link.

---

### Node: publish_brief

**Inputs:** `org_id: str`, `narrative: str`, `recommendations: list[Recommendation]`, `input_snapshot: OrgMetricsSnapshot`  
**Outputs:** `brief_id: str`

Actions:
1. Upsert `org_crystal_briefs` row (conflict on `(org_id, date_range_start)` → update)
2. Delete Redis key `org:{org_id}:crystal-brief` to force cache invalidation
3. Publish to Redis channel `org:{org_id}:alerts` message type `crystal_brief_ready` with the new `brief_id`
4. Return the `brief_id` to the backend scheduler for confirmation logging

---

## Performance Requirements

### Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dashboard initial load (GET /api/org/dashboard) | <500ms P95 | Datadog APM |
| Real-time update latency (response submit → client flash) | <2s P95 | Synthetic test |
| Programs table render (500 surveys) | <200ms | Lighthouse |
| NPS chart render (365 data points) | <100ms | React profiler |

### Redis Caching Layer

```
Key pattern              TTL     Invalidated by
─────────────────────────────────────────────────────────────────────
org:{id}:dashboard       2min    Materialized view refresh completion
org:{id}:health-score    5min    Health score computation job
org:{id}:crystal-brief   1h      publish_brief node in CrystalOS graph
org:{id}:trends:30d      15min   Materialized view refresh
org:{id}:programs:p1     5min    Survey health summary refresh
org:{id}:topics          1h      compute_org_topic_trends job
org:{id}:alerts          30s     New anomaly detected event
```

Cache read strategy: stale-while-revalidate. Return the cached value immediately, then trigger an async refresh if the TTL is within 20% of expiry. Never block a request waiting for fresh data — always serve cached data with a `dataFreshnessAt` timestamp so the frontend can show "data as of X minutes ago."

### Incremental Real-time Update Pattern

The WebSocket path does not read from materialized views. It reads from Redis pub/sub channels that are populated by response insert triggers:

```sql
-- Postgres trigger on survey_responses INSERT
CREATE OR REPLACE FUNCTION notify_response_inserted()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'response_inserted',
    json_build_object(
      'survey_id', NEW.survey_id,
      'org_id',    NEW.org_id,
      'nps_score', NEW.nps_score,
      'sentiment', NEW.sentiment_score
    )::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER response_inserted_notify
  AFTER INSERT ON survey_responses
  FOR EACH ROW EXECUTE FUNCTION notify_response_inserted();
```

The backend listens to `pg_notify` via `pg.Client` LISTEN, aggregates events using a 3-second debounce window per org, and publishes batched running totals to Redis pub/sub. The WebSocket server subscribes to Redis and forwards to connected clients in the matching org room.

---

## Real-time Architecture

### Redis Pub/Sub Channel Design

```
org:{org_id}:responses    — response_received events (debounced 3s per org)
org:{org_id}:alerts       — anomaly_detected events + crystal_brief_ready events
org:{org_id}:health       — health_score_updated events (after each computation run)
```

### WebSocket Server (Express ws)

```typescript
// backend/src/services/org-realtime.service.ts

// Room model: one Redis subscriber per org channel
// Connected clients are grouped by org_id in a Map<string, Set<WebSocket>>
// A client joins a room by authenticating — their org_id is extracted from the Clerk token
// on connection. No explicit room-join message required.

// Connection lifecycle:
// 1. WS connection arrives → verify Clerk token → extract org_id
// 2. Subscribe to Redis channels for org_id if not already subscribed
// 3. Add client socket to org room
// 4. On disconnect: remove from room, unsubscribe Redis if room is now empty
// 5. Heartbeat: server sends ping every 30s, expects pong within 10s, else closes
```

### Frontend Subscription Model

| Component | Channel | Debounce |
|-----------|---------|----------|
| KPIRow (response counter) | `org:{id}:responses` | 500ms — accumulate, then flash |
| AnomalyAlerts | `org:{id}:alerts` | none — show immediately |
| CrystalBriefCard | `org:{id}:alerts` (brief_ready type) | none |
| OrgHealthScore | `org:{id}:health` | none |

### Debouncing Strategy

The KPI response counter receives bursts during survey campaigns. The frontend hook accumulates `response_received` events in a local buffer and flushes every 500ms, animating the counter incrementing by the accumulated delta rather than by 1 each time. This prevents visual noise during high-volume periods while still showing a live counter feel.

---

*Architecture changes require a written decision entry in `docs/org-dashboard/DECISIONS.md` and sign-off from Dariusz Kowalski and Jordan Whitfield before implementation begins.*
