# Command Center — 2027–2028 Expansion Roadmap

**Document owner:** Swapnil Patil (Product Engineering)
**Last updated:** 2026-06-29
**Status:** Forward-looking roadmap — not yet approved for implementation. Each expansion requires a DECISIONS.md entry and architecture review before work begins.

---

## Context and Scope

This document describes seven planned expansions to the Command Center (org-dashboard) for the 2027–2028 planning horizon. Each expansion builds on the existing architecture described in `ARCHITECTURE.md` and the visual language described in `DESIGN.md`. The goal is to evolve Command Center from a read-only monitoring interface into the strategic nerve center for enterprise CX organizations: shareable, goal-aware, predictive, benchmarked, immersive, temporal, and mobile-native.

All expansions assume the current data model is live: `org_metrics_daily`, `org_metrics_weekly`, `org_topic_trends`, `org_health_score`, `tag_group_metrics`, `survey_health_summary`, and `org_crystal_briefs`. New tables and views defined here are additive — they do not replace existing structures.

---

## Expansion 1 — Executive Share Links

**One-sentence pitch:** Generate a token-authenticated, read-only, scoped snapshot of Command Center that board members or external stakeholders can view without a Xperiq login.

### The Problem

CX leaders routinely need to share program health with people outside their Xperiq organization: board members reviewing QBRs, agency partners monitoring campaign impact, or executives at a parent company who will never have a Xperiq account. Today, recipients either need a full Xperiq login (over-provisioned) or receive a static screenshot (stale and untrustworthy). Executive Share Links solve this by creating durable, scoped, time-bounded views that feel like the real dashboard but expose only what the org admin explicitly chose to share.

### Technical Architecture

#### New DB Tables

```sql
-- supabase/migrations/20270101000001_share_links.sql

CREATE TABLE org_share_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL,                          -- Clerk user_id of the creator
  token             TEXT NOT NULL UNIQUE,                   -- 48-byte URL-safe random token
  label             TEXT NOT NULL,                          -- human label e.g. "Board Q3 2027"
  -- scoping: which sections are visible
  show_health_score BOOLEAN NOT NULL DEFAULT TRUE,
  show_kpis         BOOLEAN NOT NULL DEFAULT TRUE,
  show_trends       BOOLEAN NOT NULL DEFAULT TRUE,
  show_programs     BOOLEAN NOT NULL DEFAULT FALSE,         -- off by default (survey names visible)
  show_topics       BOOLEAN NOT NULL DEFAULT TRUE,
  show_crystal_brief BOOLEAN NOT NULL DEFAULT TRUE,
  show_alerts       BOOLEAN NOT NULL DEFAULT FALSE,         -- off by default (internal ops detail)
  -- time bounding
  date_range_start  DATE,                                   -- NULL = use dashboard default
  date_range_end    DATE,                                   -- NULL = use dashboard default
  expires_at        TIMESTAMPTZ,                            -- NULL = never expires
  -- access control
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  view_count        INTEGER NOT NULL DEFAULT 0,
  last_viewed_at    TIMESTAMPTZ,
  -- audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ
);

CREATE INDEX ON org_share_links (token) WHERE revoked_at IS NULL AND is_active = TRUE;
CREATE INDEX ON org_share_links (org_id, created_at DESC);
```

```sql
-- supabase/migrations/20270101000002_share_link_views.sql

-- Audit log for external views (GDPR-compliance: no PII beyond IP hash)
CREATE TABLE org_share_link_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id   UUID NOT NULL REFERENCES org_share_links(id) ON DELETE CASCADE,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash         TEXT,         -- SHA-256 of viewer IP, for abuse detection only
  user_agent_hash TEXT          -- SHA-256 of user agent string
);

CREATE INDEX ON org_share_link_views (share_link_id, viewed_at DESC);
```

#### New API Endpoints

```
POST   /api/org/share-links
       Body: { label, showHealthScore, showKpis, showTrends, showPrograms, showTopics,
               showCrystalBrief, showAlerts, dateRangeStart?, dateRangeEnd?, expiresAt? }
       Auth: Clerk session (org admin only)
       Returns: { id, token, shareUrl }

GET    /api/org/share-links
       Auth: Clerk session
       Returns: paginated list of all share links for the org

PATCH  /api/org/share-links/:id
       Body: { label?, isActive?, expiresAt? }
       Auth: Clerk session (only creator or org admin)

DELETE /api/org/share-links/:id
       Auth: Clerk session — sets revoked_at, does not hard-delete

GET    /api/share/:token
       Auth: NONE — public endpoint, token is the credential
       Returns: scoped dashboard payload matching the link's show_* flags
       Side-effect: increments view_count, inserts org_share_link_views row
       Rate-limited: 60 req/min per IP via Express rate-limit middleware
```

The `/api/share/:token` endpoint reads from the same materialized views as `/api/org/dashboard` but applies a projection mask based on `show_*` columns. It never exposes `org_id` or internal identifiers in the response; the org is identified only by its name.

#### New CrystalOS Nodes

No new LangGraph nodes are required for this expansion. The shared view uses the existing `org_crystal_briefs` narrative text; the brief is pre-generated and cached. A future enhancement could add a `generate_board_brief` node that synthesizes a more external-facing narrative, but that is out of scope for the initial release.

#### New Frontend Components

`ShareLinksPanel` (`app/src/features/org-dashboard/ShareLinksPanel.tsx`)
- Accessible from a "Share" button in the top-right actions zone of Command Center
- A slide-over sheet that lists existing share links with their view counts, expiry status, and a copy-to-clipboard button for each URL
- A "Create new link" form with toggle switches for each `show_*` field, a date picker for expiry, and a label field
- Uses optimistic UI: link appears immediately in the list with a loading spinner on the copy button

`SharedCommandCenter` (`app/src/pages/SharedCommandCenter.tsx`)
- A standalone route at `/share/:token`, served without the authenticated app shell
- Renders the Xperiq wordmark, the org name (no org ID), and only the sections permitted by the share link's `show_*` flags
- A non-dismissible banner at the top: "Read-only view — shared by {orgName} via Xperiq"
- No WebSocket connection — snapshot data only, refreshed every 5 minutes by polling `/api/share/:token`
- Renders identically in dark mode if the viewer's OS prefers dark

`ShareLinkRow` (used inside `ShareLinksPanel`) — shows label, short token preview, view count, expiry badge, and a revoke button.

### Effort Estimate

Backend: 5 days (new table, four endpoints, projection mask logic, rate-limiting)
Frontend: 4 days (ShareLinksPanel, SharedCommandCenter, route setup, no-auth shell)
Testing: 2 days (token-expiry edge cases, projection correctness, rate-limit tests)
**Total: ~11 days (2.2 weeks)**

### Dependencies

- Requires org admin role concept (already implicit in Clerk org metadata; confirm `org:admin` permission key exists before starting)
- The `/api/share/:token` route must be explicitly excluded from Clerk's middleware — verify `backend/src/middleware/auth.ts` allows a public path prefix
- War Room 2.0 (Expansion 5) can optionally display a "Share this view" button that pre-selects War Room compatible sections

---

## Expansion 2 — Goal Tracking

**One-sentence pitch:** Let org admins set NPS, CSAT, and response rate targets per program and surface live progress-to-goal indicators throughout Command Center.

### The Problem

Every CX team has numerical targets ("NPS above +40 by Q4", "1,000 responses per quarter from the Onboarding program") but today those targets live in spreadsheets or OKR tools that have no visibility into the live data flowing through Xperiq. There is no way to know, at a glance, whether the team is on track. Goal Tracking closes this loop: targets live in Xperiq, progress is computed from the same materialized views that drive the dashboard, and every component that shows a metric can optionally show a goal-progress overlay.

### Technical Architecture

#### New DB Tables

```sql
-- supabase/migrations/20270201000001_program_goals.sql

CREATE TYPE goal_metric_enum AS ENUM ('nps', 'csat', 'response_rate', 'total_responses', 'sentiment');
CREATE TYPE goal_period_enum AS ENUM ('weekly', 'monthly', 'quarterly', 'annual');

CREATE TABLE program_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  survey_id       UUID REFERENCES surveys(id) ON DELETE CASCADE,   -- NULL = org-level goal
  tag_group_id    UUID REFERENCES tag_groups(id) ON DELETE CASCADE, -- NULL = not scoped to a group
  metric          goal_metric_enum NOT NULL,
  target_value    NUMERIC(10,4) NOT NULL,
  period          goal_period_enum NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  label           TEXT,                -- optional human label e.g. "Q3 2027 NPS Target"
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at     TIMESTAMPTZ,         -- soft-delete when the goal period ends or is replaced
  CONSTRAINT no_overlapping_goals EXCLUDE USING gist (
    org_id WITH =,
    COALESCE(survey_id::text, '') WITH =,
    metric WITH =,
    daterange(period_start, period_end, '[)') WITH &&
  ) WHERE (archived_at IS NULL)
);

CREATE INDEX ON program_goals (org_id, period_start, period_end);
CREATE INDEX ON program_goals (survey_id, metric) WHERE archived_at IS NULL;
CREATE INDEX ON program_goals (org_id, metric) WHERE survey_id IS NULL AND archived_at IS NULL;
```

```sql
-- supabase/migrations/20270201000002_goal_progress.sql

-- Materialized view: computes current progress against each active goal
-- Refreshed every 15 minutes alongside org_metrics_daily
CREATE MATERIALIZED VIEW goal_progress AS
SELECT
  g.id                                               AS goal_id,
  g.org_id,
  g.survey_id,
  g.tag_group_id,
  g.metric,
  g.target_value,
  g.period_start,
  g.period_end,
  -- current_value: computed differently per metric
  CASE g.metric
    WHEN 'nps' THEN
      COALESCE(
        (SELECT ROUND(AVG(avg_nps)::NUMERIC, 2)
         FROM org_metrics_daily
         WHERE org_id = g.org_id
           AND date BETWEEN g.period_start AND CURRENT_DATE),
        0
      )
    WHEN 'total_responses' THEN
      COALESCE(
        (SELECT SUM(total_responses)
         FROM org_metrics_daily
         WHERE org_id = g.org_id
           AND date BETWEEN g.period_start AND CURRENT_DATE),
        0
      )
    WHEN 'sentiment' THEN
      COALESCE(
        (SELECT ROUND(AVG(avg_sentiment)::NUMERIC, 4)
         FROM org_metrics_daily
         WHERE org_id = g.org_id
           AND date BETWEEN g.period_start AND CURRENT_DATE),
        0
      )
    ELSE NULL
  END                                                AS current_value,
  -- progress_pct: 0-100 (can exceed 100 if goal is surpassed)
  CASE
    WHEN g.target_value = 0 THEN NULL
    ELSE ROUND(
      (CASE g.metric
        WHEN 'nps' THEN
          COALESCE((SELECT ROUND(AVG(avg_nps)::NUMERIC, 2) FROM org_metrics_daily
                   WHERE org_id = g.org_id AND date BETWEEN g.period_start AND CURRENT_DATE), 0)
        WHEN 'total_responses' THEN
          COALESCE((SELECT SUM(total_responses) FROM org_metrics_daily
                   WHERE org_id = g.org_id AND date BETWEEN g.period_start AND CURRENT_DATE), 0)
        ELSE 0
      END / g.target_value) * 100,
      1
    )
  END                                                AS progress_pct,
  -- days_remaining in goal period
  (g.period_end - CURRENT_DATE)                      AS days_remaining,
  -- on_track: TRUE if current progress >= expected progress given elapsed days
  CASE
    WHEN (g.period_end - g.period_start) = 0 THEN NULL
    ELSE (
      COALESCE(
        CASE g.metric
          WHEN 'total_responses' THEN
            COALESCE((SELECT SUM(total_responses) FROM org_metrics_daily
                     WHERE org_id = g.org_id AND date BETWEEN g.period_start AND CURRENT_DATE), 0)
          ELSE 0
        END, 0
      ) / g.target_value
    ) >= (
      EXTRACT(EPOCH FROM (CURRENT_DATE - g.period_start)) /
      EXTRACT(EPOCH FROM (g.period_end - g.period_start))
    )
  END                                                AS on_track,
  NOW()                                              AS computed_at
FROM program_goals g
WHERE g.archived_at IS NULL
  AND g.period_end >= CURRENT_DATE
WITH DATA;

CREATE UNIQUE INDEX ON goal_progress (goal_id);
CREATE INDEX ON goal_progress (org_id);
CREATE INDEX ON goal_progress (survey_id) WHERE survey_id IS NOT NULL;

-- Add to pg_cron refresh schedule alongside org_metrics_daily:
-- SELECT cron.schedule('refresh-goal-progress', '*/15 * * * *',
--   $$REFRESH MATERIALIZED VIEW CONCURRENTLY goal_progress$$);
```

#### New API Endpoints

```
GET    /api/org/goals
       Auth: Clerk session
       Query: surveyId?, metric?, period?
       Returns: list of goals with their goal_progress values

POST   /api/org/goals
       Auth: Clerk session (org admin)
       Body: { surveyId?, tagGroupId?, metric, targetValue, period, periodStart, periodEnd, label? }

PATCH  /api/org/goals/:id
       Auth: Clerk session (org admin, only creator)
       Body: { targetValue?, label?, periodEnd? }

DELETE /api/org/goals/:id
       Auth: Clerk session — sets archived_at (soft-delete)

GET    /api/org/goals/summary
       Auth: Clerk session
       Returns: { onTrack: number, atRisk: number, achieved: number, total: number }
       -- Used for the KPI row goal badge
```

The `/api/org/dashboard` response (`GET /api/org/dashboard`) is extended with a `goalsSummary` field: `{ onTrack, atRisk, achieved, total }`. No pagination is needed here — the summary is the only data embedded in the main dashboard payload.

#### New CrystalOS Nodes

`evaluate_goal_health` node added to the `org_brief_graph.py` pipeline, inserted between `detect_org_signals` and `synthesize_narrative`:

```python
# crystalos/graphs/org_brief_graph.py — new node

class GoalHealthAssessment(TypedDict):
    at_risk_goals: list[GoalRow]          # on_track = FALSE and days_remaining < 30
    achieved_goals: list[GoalRow]          # progress_pct >= 100
    on_track_count: int
    at_risk_count: int

# Node: evaluate_goal_health
# Inputs:  org_id: str, date_range_end: date
# Outputs: goal_assessment: GoalHealthAssessment
#
# Queries goal_progress for all org-level and survey-level goals.
# Classifies each goal as on_track, at_risk, or achieved.
# At-risk goals (on_track=FALSE, days_remaining < 30) are surfaced to
# synthesize_narrative and generate_recommendations as high-priority signals.
#
# If any at-risk goal is found, generate_recommendations produces a goal-specific
# recommendation: "Goal at risk: {metric} target of {target} for {program/org} —
# currently at {current} with {days} days remaining."
```

#### New Frontend Components

`GoalProgressBadge` (`app/src/features/org-dashboard/GoalProgressBadge.tsx`)
- A compact progress ring (SVG, 28px) that appears next to the metric value on each KPI tile when a goal exists for that metric
- Color: green if `on_track`, amber if `!on_track && days_remaining > 14`, red if `!on_track && days_remaining <= 14`
- Tooltip on hover: "{current} / {target} target — {progress_pct}% — {days_remaining} days remaining"

`GoalSettingsSheet` (`app/src/features/org-dashboard/GoalSettingsSheet.tsx`)
- A slide-over sheet opened from a "Set Goals" link in the dashboard sub-bar (admin only)
- Lists all active goals per program with an inline edit form (controlled numeric input + period date picker)
- "Add goal" button opens a creation form with metric selector, target input, period selector
- Goal rows show their current progress inline so admins understand the gap immediately

`ProgramsTable` modifications: a new "Goal" column (optional, toggled via a column visibility dropdown) that shows a `GoalProgressBadge` for each program that has an active NPS or response-count goal.

`GoalSummaryBar` (`app/src/features/org-dashboard/GoalSummaryBar.tsx`)
- A compact 3-chip summary row rendered just below the Crystal Brief Card when the org has active goals
- Chips: "X on track" (green), "X at risk" (amber), "X achieved" (indigo checkmark)
- Clicking any chip opens `GoalSettingsSheet` pre-filtered to that status

### Effort Estimate

Backend: 6 days (tables, exclusion constraint, materialized view, five endpoints, dashboard payload extension)
CrystalOS: 2 days (new node, integration into existing brief graph)
Frontend: 5 days (GoalProgressBadge, GoalSettingsSheet, GoalSummaryBar, ProgramsTable column)
Testing: 3 days (period overlap constraint, progress math edge cases, Crystal brief with goal signals)
**Total: ~16 days (3.2 weeks)**

### Dependencies

- Requires org admin role gate in the frontend (already in scope for Executive Share Links)
- The Crystal brief integration requires Expansion 2 to land before the `evaluate_goal_health` node is meaningful
- Multi-Org Benchmarking (Expansion 4) can use goal targets as input for peer comparison framing

---

## Expansion 3 — Predictive Health Score

**One-sentence pitch:** Crystal uses historical health score time-series to project the Org Health Score 30, 60, and 90 days into the future, surfacing inflection points before they become crises.

### The Problem

The current Org Health Score tells you where you are. It does not tell you where you are going. A CX leader looking at a score of 71 today has no way to know whether that number is about to decline because three programs show early warning signs that individually look mild but collectively are a leading indicator of a crash. Predictive Health Score adds a forward-looking layer: Crystal analyzes the history of each health score component, detects trend patterns, and projects a probabilistic future range so leaders can intervene before the score drops, not after.

### Technical Architecture

#### New DB Tables

```sql
-- supabase/migrations/20270301000001_health_score_history.sql

-- The existing org_health_score table keeps only the latest row per org.
-- We need a history table for time-series analysis.
CREATE TABLE org_health_score_history (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nps_score               NUMERIC(5,4) NOT NULL,
  sentiment_score         NUMERIC(5,4) NOT NULL,
  response_velocity_score NUMERIC(5,4) NOT NULL,
  anomaly_free_score      NUMERIC(5,4) NOT NULL,
  total_score             INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON org_health_score_history (org_id, computed_at DESC);

-- The existing compute_all_org_health_scores() procedure is extended to also
-- INSERT into org_health_score_history after each UPSERT of org_health_score.
-- History rows are never updated — they are immutable audit records.
-- Retention: rows older than 2 years are deleted by a monthly pg_cron job.
```

```sql
-- supabase/migrations/20270301000002_health_score_forecasts.sql

CREATE TABLE org_health_score_forecasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  forecast_horizon  INTEGER NOT NULL CHECK (forecast_horizon IN (30, 60, 90)),  -- days
  -- point estimate and confidence interval
  predicted_score   INTEGER NOT NULL CHECK (predicted_score BETWEEN 0 AND 100),
  lower_bound       INTEGER NOT NULL CHECK (lower_bound BETWEEN 0 AND 100),
  upper_bound       INTEGER NOT NULL CHECK (upper_bound BETWEEN 0 AND 100),
  -- which signals drive this forecast
  key_drivers       JSONB NOT NULL DEFAULT '[]',
  -- [{ "component": "nps_score", "direction": "declining", "contribution": -4.2,
  --    "explanation": "NPS has declined 3 WoW in a row" }]
  -- narrative Crystal generated to explain the forecast
  forecast_narrative TEXT,
  model_version     TEXT NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_through     TIMESTAMPTZ NOT NULL,   -- forecasts expire after 24h
  CONSTRAINT org_forecast_horizon_unique UNIQUE (org_id, forecast_horizon)
);

CREATE INDEX ON org_health_score_forecasts (org_id);
CREATE INDEX ON org_health_score_forecasts (generated_at DESC);
```

#### New API Endpoints

```
GET    /api/org/health-score/forecast
       Auth: Clerk session
       Returns: {
         current: { totalScore, computedAt },
         forecasts: [
           { horizon: 30, predictedScore, lowerBound, upperBound,
             keyDrivers, forecastNarrative, generatedAt },
           { horizon: 60, ... },
           { horizon: 90, ... }
         ],
         historyForChart: Array<{ date: string, totalScore: number }>  -- last 90 days
       }

POST   /api/org/health-score/forecast/regenerate
       Auth: Clerk session (org admin only)
       Response 202: { jobId: string, estimatedSeconds: number }
       -- Triggers async forecast regeneration; new forecast pushed via WebSocket
       -- type: 'forecast_ready' on channel org:{org_id}:health
```

The `/api/org/health-score` response is extended with a `forecast` field containing the 30-day point estimate and narrative, so the health score card in the TopNav can show a "projected: X in 30 days" sub-label without an additional API call.

#### New CrystalOS Nodes

A new LangGraph graph `crystalos/graphs/health_forecast_graph.py`, triggered daily by the backend scheduler job `backend/src/jobs/health-forecast.job.ts`.

`fetch_health_history` node:
- Queries `org_health_score_history` for the past 180 days for the target org
- Returns a structured time series of all four component scores and the composite score
- Computes rolling 7-day and 30-day averages for each component

`decompose_trends` node:
- Applies linear regression to each component's 30-day time series using `scipy.stats.linregress`
- Computes slope, R-squared, and whether the trend is statistically significant (p < 0.05)
- Identifies the two components with the highest-magnitude slopes as key drivers
- Returns `TrendDecomposition` TypedDict with per-component slope, intercept, r_squared

`project_scores` node:
- Inputs: `TrendDecomposition`, forecast horizons `[30, 60, 90]`
- For each horizon, projects each component forward using its linear trend
- Applies the same weighting formula as `compute_all_org_health_scores()` to get composite projected scores
- Computes 80% confidence intervals using the regression's standard error scaled by horizon length
- Clips all values to `[0, 100]`

`synthesize_forecast_narrative` node:
- LLM call with a compact prompt summarizing the trend decomposition and projected scores
- Produces a 1–2 sentence narrative per forecast horizon using Crystal's voice: "At current trajectory, your Org Health Score is projected to reach X by [date]. The primary driver is [component], which has declined [X] points over the past [N] weeks."
- Model: same OpenRouter model used for the org brief, via `crystalos/skills/llm_client.py`

`persist_forecasts` node:
- Upserts all three `org_health_score_forecasts` rows (one per horizon, conflict on `(org_id, forecast_horizon)`)
- Invalidates Redis key `org:{org_id}:health-forecast`
- Publishes `forecast_ready` to Redis channel `org:{org_id}:health`

#### New Frontend Components

`HealthScoreForecastCard` (`app/src/features/org-dashboard/HealthScoreForecastCard.tsx`)
- Appears below the existing OrgHealthScore section (or as an expansion of the health score panel)
- Shows the current score, then a forward-projected arc with three markers at 30d / 60d / 90d
- The arc itself is an SVG path drawn from current score to each projected value, with a shaded confidence band between `lower_bound` and `upper_bound`
- Color transitions on the arc: green if projected score is rising or stable, amber if declining, red if projected to cross below the "critical" threshold (40)
- The forecast narrative renders below the arc as italic Crystal-voice text

`ForecastTrendBadge` (small, used in TopNav health score zone):
- Shows "30d: ↑X" or "30d: ↓X" in 10px text beneath the current score number
- Color-coded to the projected score's health status
- Only renders if a valid (non-expired) forecast exists for the org

WebSocket extension: the existing `health_score_updated` message type is extended with an optional `forecast30d` field containing the 30-day predicted score. The TopNav badge updates in real time without a page reload.

### Effort Estimate

Backend: 4 days (history table, forecast table, two endpoints, job scheduler)
CrystalOS: 6 days (new graph with 5 nodes, scipy regression, LLM narrative, integration tests)
Frontend: 4 days (HealthScoreForecastCard, ForecastTrendBadge, WebSocket extension)
Testing: 3 days (regression math verification, confidence interval correctness, narrative quality spot-checks)
**Total: ~17 days (3.4 weeks)**

### Dependencies

- Requires `org_health_score_history` to exist and be populated — the table starts accumulating data when Expansion 3 is deployed; meaningful forecasts require at least 30 days of history, so the feature is gated behind `org_health_score_history count >= 30 rows for org`
- Predictive scores shown in Executive Share Links (Expansion 1) require the `show_forecast` permission flag to be added to `org_share_links`
- Goal Tracking (Expansion 2) feeds into forecast context: if a goal target is set, the forecast narrative can compare the projected score to the goal trajectory

---

## Expansion 4 — Multi-Org Benchmarking

**One-sentence pitch:** Show anonymized comparison metrics against industry peers, enforcing k-anonymity (minimum 15 contributing organizations) before any aggregate is surfaced.

### The Problem

"Is our NPS of +32 good?" is a question every CX team asks, and today Xperiq has no answer. The industry benchmark field in `GET /api/org/dashboard/trends` is currently always `null`. Organizations are flying blind relative to their market context. Multi-Org Benchmarking turns the aggregate of all Xperiq orgs into an opt-in intelligence layer: participating orgs contribute anonymized metrics and in return see where they stand among their peers. k-anonymity enforcement ensures no individual org's data can be inferred from the published benchmarks.

### Technical Architecture

#### New DB Tables

```sql
-- supabase/migrations/20270401000001_benchmarking_opt_in.sql

CREATE TABLE org_benchmarking_settings (
  org_id              UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  opted_in            BOOLEAN NOT NULL DEFAULT FALSE,
  industry_category   TEXT,     -- e.g. "Financial Services", "Healthcare", "Retail"
  org_size_bucket     TEXT,     -- "1-50", "51-500", "501-5000", "5001+"
  opted_in_at         TIMESTAMPTZ,
  opted_out_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```sql
-- supabase/migrations/20270401000002_benchmark_cohorts.sql

-- Anonymized benchmark aggregates, computed nightly
-- A cohort is defined by (industry_category, org_size_bucket, metric, period)
-- Only published if org_count >= 15 (k-anonymity threshold)
CREATE TABLE benchmark_cohorts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_category   TEXT NOT NULL,
  org_size_bucket     TEXT NOT NULL,
  metric              TEXT NOT NULL,    -- 'nps', 'sentiment', 'response_velocity', 'health_score'
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  -- aggregate statistics (never individual org values)
  org_count           INTEGER NOT NULL,  -- must be >= 15 for is_published = TRUE
  p25_value           NUMERIC(10,4),
  p50_value           NUMERIC(10,4),     -- median
  p75_value           NUMERIC(10,4),
  p90_value           NUMERIC(10,4),
  mean_value          NUMERIC(10,4),
  is_published        BOOLEAN NOT NULL DEFAULT FALSE,  -- FALSE until org_count >= 15
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT benchmark_cohort_unique UNIQUE (industry_category, org_size_bucket, metric, period_start)
);

CREATE INDEX ON benchmark_cohorts (industry_category, org_size_bucket, metric, period_start DESC)
  WHERE is_published = TRUE;
```

```sql
-- supabase/migrations/20270401000003_benchmark_contributions.sql

-- Tracks which orgs contributed to which cohorts (for auditability and re-computation)
-- This table is internal-only; never exposed via API
CREATE TABLE benchmark_contributions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cohort_id       UUID NOT NULL REFERENCES benchmark_cohorts(id) ON DELETE CASCADE,
  contributed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, cohort_id)
);

CREATE INDEX ON benchmark_contributions (cohort_id);
```

The `compute_benchmark_cohorts` stored procedure runs nightly via pg_cron. It:
1. Selects all opted-in orgs with their `industry_category` and `org_size_bucket`
2. Joins with `org_metrics_weekly` and `org_health_score_history` for the previous week's metrics
3. Groups by `(industry_category, org_size_bucket, metric)`
4. Computes percentile aggregates using `PERCENTILE_CONT`
5. Sets `is_published = TRUE` only if `org_count >= 15`
6. Inserts into `benchmark_contributions` (upsert on conflict)

#### New API Endpoints

```
GET    /api/org/benchmarking/settings
       Auth: Clerk session
       Returns: { optedIn, industryCategory, orgSizeBucket, optedInAt }

PUT    /api/org/benchmarking/settings
       Auth: Clerk session (org admin)
       Body: { optedIn: boolean, industryCategory?: string, orgSizeBucket?: string }
       Returns: { updated: true, cohortSize: number | null }
       -- cohortSize: number of orgs in their cohort, or null if < 15 (no info leak)

GET    /api/org/benchmarking/comparison
       Auth: Clerk session
       Query: metric?, period?
       Returns: {
         isOptedIn: boolean,
         cohortAvailable: boolean,   -- FALSE if org's cohort has < 15 members
         cohortSize: string,         -- "15-20" bucket, never exact count
         yourPercentile: number | null,  -- null if cohortAvailable = false
         benchmarks: {
           nps:    { p25, p50, p75, p90, yourValue },
           sentiment: { p25, p50, p75, p90, yourValue },
           healthScore: { p25, p50, p75, p90, yourValue },
           responseVelocity: { p25, p50, p75, p90, yourValue }
         } | null
       }
```

The `yourPercentile` value is computed in the API layer by comparing the org's current metric values against the published cohort distribution. The raw benchmark aggregates are never returned — only the percentile position and the cohort statistics.

The existing `GET /api/org/dashboard/trends` endpoint is updated to populate the `benchmark.nps` field when the org is opted in and their cohort has `>= 15` members, replacing the current `null` return.

#### New CrystalOS Nodes

`fetch_benchmark_context` node added to `org_brief_graph.py`, parallel to `aggregate_org_metrics`:

```python
# crystalos/graphs/org_brief_graph.py — new parallel node

# Node: fetch_benchmark_context
# Inputs:  org_id: str
# Outputs: benchmark_context: BenchmarkContext | None
#
# Queries the backend /api/org/benchmarking/comparison endpoint (internal call)
# Returns None if the org is not opted in or the cohort is not available
# If available, populates BenchmarkContext with percentile positions
#
# The synthesize_narrative node is updated to include benchmark framing when available:
# "Your NPS of +38 places you in the top 25% of {industryCategory} organizations on Xperiq."
```

#### New Frontend Components

`BenchmarkOptInBanner` (`app/src/features/org-dashboard/BenchmarkOptInBanner.tsx`)
- A dismissible info banner shown once to org admins who have not yet opted in
- Message: "See how your programs compare to peers — opt into anonymized benchmarking"
- CTA: "Enable Benchmarking" → opens `BenchmarkSettingsSheet`
- Dismissed state stored in `localStorage`; if admin clicks "Never show again," store in `org_benchmarking_settings.opted_in = FALSE` (explicit opt-out)

`BenchmarkSettingsSheet` (`app/src/features/org-dashboard/BenchmarkSettingsSheet.tsx`)
- Slide-over for opting in: select industry category and org size bucket, review the data sharing agreement summary, confirm
- Shows the current cohort size (as a bucket string like "15-25 organizations") so admins know how representative their benchmark will be

`NPSTrendChart` modification: when `benchmark.nps` is non-null, the existing dashed benchmark line is activated with a label. The tooltip is extended to show "Industry median: +XX" when hovering near that line.

`BenchmarkComparisonPanel` (`app/src/features/org-dashboard/BenchmarkComparisonPanel.tsx`)
- Accessible from a "See how you compare" link below the KPI row (only shown when opted in and cohort is available)
- Renders four horizontal range bars (one per metric), each showing the P25–P75 shaded band, a P90 marker, and the org's current value as a dot on the bar
- The org's percentile rank ("You are in the top 28% for NPS among peers") is shown as a headline above each bar

### Effort Estimate

Backend: 8 days (four tables, nightly computation procedure, k-anonymity enforcement, three endpoints, trends endpoint update)
CrystalOS: 2 days (fetch_benchmark_context node, narrative update)
Frontend: 5 days (BenchmarkOptInBanner, BenchmarkSettingsSheet, BenchmarkComparisonPanel, chart update)
Legal/compliance review: external timeline (data sharing agreement, anonymization audit)
**Total: ~15 days engineering (3 weeks) + legal review**

### Dependencies

- Requires a minimum viable user base of opted-in orgs before cohorts become meaningful — the feature is built but surfaced only when `cohortAvailable = TRUE`
- Industry category taxonomy must be defined as a product decision before migration runs (the `TEXT` column is intentionally free-form to allow evolution, but a canonical list must be established)
- The legal team must review the data sharing agreement displayed in `BenchmarkSettingsSheet` before this ships to production

---

## Expansion 5 — War Room 2.0

**One-sentence pitch:** A dedicated, fullscreen, TV-optimized Command Center mode with ambient sound alerts, auto-rotating program views, and Crystal voice briefings — built for crisis response and executive briefings on a large display.

### The Problem

During a product launch, a service outage, or a post-event experience review, CX teams need to run a live situation room. They project Command Center on a shared display, huddle around it, and monitor it for hours. The current War Room Mode (dark theme toggle) addresses the visual layer but does nothing for the operational layer: there is no way to see all programs automatically cycle through their detail, no ambient audio signal for critical anomalies (so the person watching must never look away), and no way to hear Crystal summarize what is happening without reading the brief themselves. War Room 2.0 turns Command Center into a genuine live operations center.

### Technical Architecture

#### New DB Tables

```sql
-- supabase/migrations/20270501000001_war_room_configs.sql

CREATE TABLE war_room_configs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by            UUID NOT NULL,
  label                 TEXT NOT NULL,
  -- rotation settings
  rotation_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  rotation_interval_sec INTEGER NOT NULL DEFAULT 30 CHECK (rotation_interval_sec BETWEEN 10 AND 300),
  pinned_survey_ids     UUID[] NOT NULL DEFAULT '{}',  -- shown first before rotation begins
  -- alert audio settings
  audio_alerts_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  audio_alert_severity  TEXT NOT NULL DEFAULT 'critical'
                          CHECK (audio_alert_severity IN ('critical', 'warning', 'all')),
  -- voice briefing settings
  voice_briefing_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  voice_briefing_interval TEXT NOT NULL DEFAULT '30m'
                            CHECK (voice_briefing_interval IN ('15m', '30m', '1h')),
  -- display settings
  show_topic_ticker     BOOLEAN NOT NULL DEFAULT TRUE,  -- horizontal scrolling topic ticker
  show_response_counter BOOLEAN NOT NULL DEFAULT TRUE,  -- large live counter
  -- metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON war_room_configs (org_id);
```

```sql
-- supabase/migrations/20270501000002_war_room_voice_logs.sql

-- Log of Crystal voice briefings delivered in War Room sessions
CREATE TABLE war_room_voice_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  config_id       UUID REFERENCES war_room_configs(id),
  brief_text      TEXT NOT NULL,    -- text Crystal read aloud
  audio_url       TEXT,             -- if audio was pre-generated and stored (optional)
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_type    TEXT NOT NULL     -- 'scheduled', 'anomaly', 'manual'
                    CHECK (trigger_type IN ('scheduled', 'anomaly', 'manual'))
);

CREATE INDEX ON war_room_voice_logs (org_id, triggered_at DESC);
```

#### New API Endpoints

```
GET    /api/org/war-room/configs
       Auth: Clerk session
       Returns: list of all war_room_configs for the org

POST   /api/org/war-room/configs
       Auth: Clerk session (org admin)
       Body: { label, rotationEnabled, rotationIntervalSec, pinnedSurveyIds,
               audioAlertsEnabled, audioAlertSeverity, voiceBriefingEnabled,
               voiceBriefingInterval, showTopicTicker, showResponseCounter }

PATCH  /api/org/war-room/configs/:id
       Auth: Clerk session (org admin)

DELETE /api/org/war-room/configs/:id
       Auth: Clerk session (org admin)

POST   /api/org/war-room/voice-briefing
       Auth: Clerk session
       Body: { configId }
       Response 202: { jobId, estimatedSeconds }
       -- Triggers CrystalOS to generate a fresh spoken briefing
       -- The audio or SSML text is pushed via WebSocket when ready
```

#### New CrystalOS Nodes

New graph `crystalos/graphs/war_room_brief_graph.py`. This graph is shorter than the full org brief graph — it is optimized for low latency (target: < 8 seconds end-to-end) so the voice briefing feels responsive when triggered by an anomaly.

`fetch_war_room_snapshot` node:
- Queries `org_health_score`, `org_metrics_daily` (today only), `survey_health_summary` (critical + attention rows), and `org_crystal_briefs` (most recent brief)
- Returns a compact `WarRoomSnapshot` TypedDict — 5 fields, not the full `OrgMetricsSnapshot`
- Target: < 300ms database query time

`generate_voice_brief` node:
- LLM call with a voice-optimized prompt: shorter sentences, no markdown, no parenthetical asides, spoken-word rhythm
- System prompt emphasizes: "You are being read aloud by a text-to-speech system to a room of executives watching a live dashboard. Every sentence should be complete and intelligible when heard, not read."
- Output: `voice_text: str` — 3–5 sentences maximum
- Also outputs `ssml_text: str` — the same text wrapped in SSML tags with appropriate pauses, emphasis on numbers, and a steady speaking rate

`deliver_voice_brief` node:
- Publishes `voice_brief_ready` to Redis channel `org:{org_id}:alerts`
- Payload includes `voice_text` (for client-side TTS via the Web Speech API) and `ssml_text`
- Inserts a `war_room_voice_logs` row
- For orgs with an audio pre-generation flag set (future capability): calls a TTS API and stores the audio URL

#### New Frontend Components

`WarRoom2Layout` (`app/src/features/org-dashboard/war-room/WarRoom2Layout.tsx`)
- Activated by clicking "Enter War Room 2.0" in the user menu (replaces the existing dark mode toggle for this mode)
- Uses the Fullscreen API (`document.documentElement.requestFullscreen()`) to go truly fullscreen
- Renders in a completely different layout from the standard Command Center: 2/3 of the screen is the rotating `ProgramFocusView`, 1/3 is a right panel with the live KPI counter, Crystal brief excerpt, and alert feed
- Keyboard shortcut: `Esc` exits fullscreen and returns to normal mode

`ProgramRotationController` (`app/src/features/org-dashboard/war-room/ProgramRotationController.tsx`)
- Manages the auto-rotation queue: cycles through all critical and attention programs first, then remaining programs
- Pinned programs (from `war_room_configs.pinned_survey_ids`) are shown first before rotation begins
- Each program is shown for `rotation_interval_sec` seconds
- Progress bar at the bottom of `ProgramFocusView` shows time remaining on the current program
- Rotation pauses when the user moves their mouse (hover-pause behavior), resumes 5 seconds after mouse goes still

`TopicTicker` (`app/src/features/org-dashboard/war-room/TopicTicker.tsx`)
- A horizontal scrolling ticker at the bottom of the screen (like a financial news ticker)
- Displays the top 20 org topics from `EmergingTopics` data, cycling continuously
- Each topic shows: label, frequency, and a sentiment dot (green/gray/red)
- New topics that arrive via WebSocket are animated in from the right

`AmbientAlertOrchestrator` (`app/src/features/org-dashboard/war-room/AmbientAlertOrchestrator.tsx`)
- Subscribes to `org:{id}:alerts` WebSocket channel
- On `anomaly_detected` with severity matching `audio_alert_severity`: plays a short ambient tone using the Web Audio API
  - Critical: a descending three-note chime (C5 → A4 → F4, 100ms each, sine wave, -12dB)
  - Warning: a single two-note chime (C5 → G4, 150ms each)
  - Never autoplays before user interaction — the user must explicitly click "Enable audio alerts" in the War Room settings panel, which satisfies the browser autoplay policy
- The alert also triggers a full-screen amber/red flash (1 second, 10% opacity overlay) so viewers not facing the screen are alerted

`VoiceBriefingButton` (`app/src/features/org-dashboard/war-room/VoiceBriefingButton.tsx`)
- A microphone icon button in the right panel
- On click (or on scheduled trigger from `WarRoomConfigPanel`): calls `POST /api/org/war-room/voice-briefing`
- When `voice_brief_ready` WebSocket event arrives: uses the Web Speech API (`SpeechSynthesisUtterance`) with the `voice_text` content
- A "Crystal is speaking" animated waveform overlay appears during playback
- Manual override: the user can click the button again to stop playback mid-sentence

`WarRoomConfigPanel` (`app/src/features/org-dashboard/war-room/WarRoomConfigPanel.tsx`)
- A side panel accessible before entering fullscreen mode
- Configures rotation interval, pinned programs, audio alert sensitivity, and voice briefing schedule
- Saves to `POST /api/org/war-room/configs`

### Effort Estimate

Backend: 4 days (two tables, five endpoints, WebSocket message type additions)
CrystalOS: 4 days (new compact graph, voice-optimized prompt engineering, SSML generation, latency optimization)
Frontend: 8 days (WarRoom2Layout, ProgramRotationController, TopicTicker, AmbientAlertOrchestrator, VoiceBriefingButton, WarRoomConfigPanel)
Browser API integration testing: 2 days (Web Audio API, Web Speech API, Fullscreen API across Chrome/Safari/Edge)
**Total: ~18 days (3.6 weeks)**

### Dependencies

- Requires the existing dark mode War Room palette from `DESIGN.md` as the base theme (already built)
- Voice briefing requires CrystalOS to be running; falls back gracefully to text-only if CrystalOS is unreachable
- Audio alerts require user gesture to activate (browser autoplay policy) — the onboarding flow in `WarRoomConfigPanel` must make this clear
- Executive Share Links (Expansion 1) can optionally link to a read-only War Room 2.0 view

---

## Expansion 6 — Period Comparison Mode

**One-sentence pitch:** Let users select any two time periods and view every Command Center metric side-by-side to answer "how are we doing compared to last quarter?" at a glance.

### The Problem

The current NPS trend chart shows a time series, and the KPI tiles show week-over-week deltas, but there is no way to do a deliberate period-vs-period comparison: "How did our NPS in Q3 2027 compare to Q3 2026?" or "What changed between the first two weeks of this campaign versus the last two weeks?" Period Comparison Mode turns every metric on the dashboard into a side-by-side comparison, making it easy to present progress in QBRs, investigate the impact of a product change, or assess seasonal patterns.

### Technical Architecture

#### New DB Tables

No new persistent tables are required. Period Comparison Mode is a query-time transformation: the same materialized views are queried twice with different date ranges, and the difference is computed in the API layer. However, a saved comparison table is needed to support sharing comparisons as permalinks:

```sql
-- supabase/migrations/20270601000001_saved_comparisons.sql

CREATE TABLE saved_period_comparisons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL,
  label           TEXT NOT NULL,
  period_a_start  DATE NOT NULL,
  period_a_end    DATE NOT NULL,
  period_a_label  TEXT,              -- e.g. "Q3 2027"
  period_b_start  DATE NOT NULL,
  period_b_end    DATE NOT NULL,
  period_b_label  TEXT,              -- e.g. "Q3 2026"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,  -- if TRUE, linked in share links
  CONSTRAINT non_overlapping_periods CHECK (
    period_a_end < period_b_start OR period_b_end < period_a_start
  )
);

CREATE INDEX ON saved_period_comparisons (org_id, created_at DESC);
```

#### New API Endpoints

```
GET    /api/org/dashboard/compare
       Auth: Clerk session
       Query: periodAStart, periodAEnd, periodBStart, periodBEnd
       Returns: {
         periodA: { label, start, end, metrics: DashboardMetricsSnapshot },
         periodB: { label, start, end, metrics: DashboardMetricsSnapshot },
         deltas: {
           avgNps:           { absolute, pct },
           totalResponses:   { absolute, pct },
           avgSentiment:     { absolute, pct },
           healthScore:      { absolute, pct },
           activeSurveys:    { absolute, pct }
         },
         programComparisons: Array<{
           surveyId, surveyTitle,
           periodA: { avgNps, totalResponses, sentimentTrend, healthStatus },
           periodB: { avgNps, totalResponses, sentimentTrend, healthStatus },
           delta: { nps: number, responses: number }
         }>
       }
       -- DashboardMetricsSnapshot: same shape as kpis + healthScore from GET /api/org/dashboard

GET    /api/org/dashboard/compare/trends
       Auth: Clerk session
       Query: periodAStart, periodAEnd, periodBStart, periodBEnd, granularity
       Returns: {
         periodA: Array<{ date, avgNps, totalResponses, avgSentiment }>,
         periodB: Array<{ date, avgNps, totalResponses, avgSentiment }>
         -- dates in periodB are normalized to align with periodA for overlay rendering
       }

GET    /api/org/comparisons
       Auth: Clerk session
       Returns: list of saved_period_comparisons for the org

POST   /api/org/comparisons
       Auth: Clerk session
       Body: { label, periodAStart, periodAEnd, periodALabel, periodBStart, periodBEnd, periodBLabel, isPublic }

DELETE /api/org/comparisons/:id
       Auth: Clerk session
```

The `GET /api/org/dashboard/compare` endpoint reads from `org_metrics_daily` (aggregated across each period's date range) and `survey_health_summary`. It does not use materialized views for the historical period because those views only reflect current state; it queries the source `org_metrics_daily` directly with `WHERE date BETWEEN :start AND :end`. Response time target: < 800ms P95 (two sequential aggregation queries, each bounded by date range).

#### New CrystalOS Nodes

`generate_comparison_narrative` node, invoked ad-hoc (not part of the weekly brief graph). Called by a new backend endpoint `POST /api/org/dashboard/compare/narrative`:

```python
# crystalos/graphs/comparison_graph.py

# Node: generate_comparison_narrative
# Inputs:  comparison_result: ComparisonResult (the full response from /api/org/dashboard/compare)
# Outputs: narrative: str
#
# Produces a 3-5 sentence Crystal narrative that interprets the comparison:
# - Names the most significant positive and negative changes
# - Calls out any programs that dramatically improved or declined
# - Uses specific numbers, period labels, and directional language
# - Does NOT hedge — states what changed and what it means
#
# System prompt:
# "You are Crystal, Xperiq's AI copilot. You are comparing two time periods for a VP of CX.
#  Name specific programs and cite specific numbers. Focus on the story: what changed, why it
#  matters, and what to watch. Avoid saying 'it appears' or 'it seems.' Speak in past tense
#  for period B and present tense for period A."
```

#### New Frontend Components

`PeriodComparisonModeToggle` (`app/src/features/org-dashboard/PeriodComparisonModeToggle.tsx`)
- A button in the filter sub-bar: "Compare periods"
- Clicking it slides in a two-calendar date range picker (two adjacent `CalendarDateRangePicker` components labeled "Period A" and "Period B")
- "Period B" defaults to the same date range exactly one year prior to "Period A"
- A "Compare" CTA button triggers the comparison query

`ComparisonLayout` (`app/src/features/org-dashboard/ComparisonLayout.tsx`)
- When Period Comparison Mode is active, the entire Command Center below the filter bar re-renders in a two-column split layout
- Left column (Period A — "Current"): renders standard Command Center sections with Period A data
- Right column (Period B — "Reference"): renders identical sections with Period B data
- Between the two columns, a narrow delta column shows arrows and signed delta values for each metric
- The NPS trend chart renders both periods on the same axes — Period A as a solid line, Period B as a dashed line of the same color — with a toggle to switch between overlay and side-by-side modes
- The programs table shows both periods' NPS and response values for each survey, with the delta in a highlight column

`ComparisonDeltaColumn` (`app/src/features/org-dashboard/ComparisonDeltaColumn.tsx`)
- The narrow column between Period A and Period B in `ComparisonLayout`
- Each row shows: metric name, delta arrow (up/down), absolute delta value, pct delta
- Color coding: positive deltas green, negative red, for NPS-direction metrics; reversed for anomaly count

`SavedComparisonsPanel` (`app/src/features/org-dashboard/SavedComparisonsPanel.tsx`)
- Accessible from a bookmark icon in the period comparison date picker
- Lists saved comparisons with their labels and date ranges; clicking one restores the comparison state
- "Save this comparison" button below the date picker creates a new `saved_period_comparisons` row

`NPSComparisonChart` (extends `NPSTrendChart`):
- New `compareMode` prop: when `true`, renders two series (A and B) with aligned time axes
- The x-axis normalizes both periods to "Day 1, Day 2, … Day N" so periods of different calendar dates can be overlaid
- A legend distinguishes the two periods with their labels

### Effort Estimate

Backend: 5 days (saved comparisons table, four endpoints, period aggregation query logic)
CrystalOS: 2 days (comparison_graph.py, one node, narrative prompt)
Frontend: 7 days (PeriodComparisonModeToggle, ComparisonLayout, ComparisonDeltaColumn, SavedComparisonsPanel, NPSComparisonChart extension)
Testing: 2 days (date boundary edge cases, normalized axis alignment, delta sign correctness)
**Total: ~16 days (3.2 weeks)**

### Dependencies

- Period Comparison Mode works standalone but is more powerful when combined with Goal Tracking (Expansion 2): the goal target line can be overlaid on both periods in `NPSComparisonChart`
- Executive Share Links (Expansion 1) should support sharing a specific saved comparison via a new `comparison_id` parameter in `org_share_links`
- The `org_metrics_daily` table must have sufficient historical data; the feature is fully usable from the moment it ships but period comparisons spanning beyond the `org_metrics_daily` retention window will silently return partial data with a `dataAvailableFrom` field in the API response

---

## Expansion 7 — Mobile Command Center

**One-sentence pitch:** Native iOS and Android widgets that surface the Org Health Score and live KPIs on the home screen, with push alerts when the score drops or a critical anomaly is detected.

### The Problem

A VP of CX does not live inside Xperiq. They check their phone between meetings, during a commute, or at 6am on the day of a major product launch. Today, that person has no Xperiq presence on their home screen — they must open the app, authenticate, and navigate to Command Center. Mobile Command Center puts the most important signal (Org Health Score) on the home screen as a widget, and ensures that a critical anomaly is surfaced as a push notification within seconds of detection — not the next time they happen to open the app.

### Technical Architecture

#### New DB Tables

```sql
-- supabase/migrations/20270701000001_push_subscriptions.sql

CREATE TABLE user_push_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,     -- Clerk user_id
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  push_token          TEXT NOT NULL,     -- APNs device token (iOS) or FCM registration token (Android)
  -- notification preferences
  notify_critical_anomaly   BOOLEAN NOT NULL DEFAULT TRUE,
  notify_health_score_drop  BOOLEAN NOT NULL DEFAULT TRUE,
  health_score_drop_threshold INTEGER NOT NULL DEFAULT 10,  -- alert if score drops >= this many points
  notify_goal_at_risk       BOOLEAN NOT NULL DEFAULT FALSE,
  -- metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT push_subscription_unique UNIQUE (user_id, org_id, platform, push_token)
);

CREATE INDEX ON user_push_subscriptions (org_id) WHERE is_active = TRUE;
CREATE INDEX ON user_push_subscriptions (user_id) WHERE is_active = TRUE;
```

```sql
-- supabase/migrations/20270701000002_push_notification_log.sql

CREATE TABLE push_notification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES user_push_subscriptions(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL
                    CHECK (notification_type IN ('critical_anomaly', 'health_score_drop',
                                                  'goal_at_risk', 'voice_briefing', 'weekly_brief')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  payload         JSONB,             -- deep link params, e.g. { surveyId, alertId }
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at    TIMESTAMPTZ,       -- set by APNs/FCM delivery receipt
  tapped_at       TIMESTAMPTZ        -- set by client on notification tap
);

CREATE INDEX ON push_notification_log (subscription_id, sent_at DESC);
CREATE INDEX ON push_notification_log (org_id, notification_type, sent_at DESC);
```

```sql
-- supabase/migrations/20270701000003_widget_cache.sql

-- A lightweight key-value cache for widget data, separate from Redis
-- so native widget extensions can fetch data without going through the full API
-- (widgets have strict memory and time budgets)
CREATE TABLE org_widget_cache (
  org_id          UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  widget_payload  JSONB NOT NULL,
  -- widget_payload schema:
  -- {
  --   "healthScore": 74,
  --   "healthStatus": "healthy",
  --   "kpis": { "activeSurveys": 12, "responsesToday": 147, "avgNps": 38 },
  --   "criticalCount": 0,
  --   "attentionCount": 2,
  --   "scoreSparkline": [68, 70, 72, 71, 74],  -- last 5 daily scores
  --   "computedAt": "2027-10-15T08:00:00Z"
  -- }
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `org_widget_cache` table is populated by a new procedure `compute_widget_payloads()` that runs every 15 minutes via pg_cron alongside `org_metrics_daily` refresh. It aggregates the minimum set of data needed for the widget from `org_health_score`, `org_metrics_daily` (today's row), and `survey_health_summary`.

#### New API Endpoints

```
POST   /api/mobile/push-subscriptions
       Auth: Clerk session
       Body: { platform, pushToken, notifyCriticalAnomaly, notifyHealthScoreDrop,
               healthScoreDropThreshold, notifyGoalAtRisk }
       Returns: { subscriptionId }

DELETE /api/mobile/push-subscriptions/:id
       Auth: Clerk session

PATCH  /api/mobile/push-subscriptions/:id
       Auth: Clerk session
       Body: preference fields to update

GET    /api/mobile/widget
       Auth: Clerk session (or a short-lived widget access token — see below)
       Returns: org_widget_cache.widget_payload for the authenticated org
       -- This endpoint must return in < 200ms; it reads only from org_widget_cache
       -- Cache-Control: max-age=300 (5 minutes) so the widget OS layer can cache aggressively

POST   /api/mobile/widget-token
       Auth: Clerk session
       Returns: { widgetToken, expiresAt }  -- 24h JWT signed with a dedicated widget secret
       -- This token is stored by the native app in its shared keychain/keystore
       -- and used by the widget extension to call GET /api/mobile/widget without Clerk
```

The push notification delivery flow runs in the backend's existing job infrastructure:

`backend/src/jobs/push-notifier.job.ts` — new job triggered by two events:
1. `anomaly_detected` Redis pub/sub event: immediately queries `user_push_subscriptions` for the org, filters by `notify_critical_anomaly = TRUE`, and enqueues APNs/FCM delivery via the push notification library (`node-apn` for iOS, `firebase-admin` for Android)
2. Health score recomputation: compares new score to the previous score (stored in `org_health_score_history`); if the drop exceeds any subscriber's `health_score_drop_threshold`, queues a push notification

All push notifications carry a deep link payload that opens the native app to the relevant screen (Command Center, the specific anomaly alert, or the goal detail).

#### New CrystalOS Nodes

No new LangGraph nodes are required for the core widget and push alert functionality. However, a new `generate_push_brief` utility function (not a full graph) is added to `crystalos/utils/push_brief.py`:

```python
# crystalos/utils/push_brief.py

# generate_push_brief(org_id: str, trigger_type: str, context: dict) -> str
#
# Produces a 1-sentence push notification body in Crystal's voice.
# Not a full LangGraph graph — a direct LLM call with a tight 5-token budget for the title
# and a 30-word budget for the body.
#
# Called by the backend push-notifier.job.ts via POST /internal/push-brief
# (internal endpoint, not exposed publicly, authenticated by X-Internal-Key header)
#
# Example output for a health score drop:
# title: "Org Health Dropped"
# body:  "Your score fell from 71 to 58 — the Onboarding survey is flagged critical."
#
# Example output for a critical anomaly:
# title: "Critical Anomaly Detected"
# body:  "Response velocity in Post-Purchase Survey collapsed 70% in the last 4 hours."
```

#### New Frontend Components

The mobile app (`app/`) does not currently exist as a native app — Xperiq is a web app served via Firebase Hosting. Mobile Command Center requires a React Native or Capacitor wrapper. The recommendation is to use **Capacitor** to wrap the existing React app, as it minimizes code duplication while enabling native widget extensions.

`MobileCommandCenterWidget` (native iOS `WidgetExtension` / Android `AppWidget`)
- Written in Swift (iOS, using WidgetKit) and Kotlin (Android, using Glance API)
- Fetches data from `GET /api/mobile/widget` using the stored widget token
- Small widget (2x2): shows health score number with color coding and a 5-point sparkline
- Medium widget (2x4): adds the three KPI numbers (active surveys, responses today, avg NPS) and critical/attention program counts
- Widget tap deep-links to the full Xperiq app on the Command Center screen

`PushNotificationSettingsPanel` (`app/src/features/org-dashboard/PushNotificationSettingsPanel.tsx`)
- Accessible from a "Mobile & Notifications" link in the user account dropdown
- Shows registered devices with their platforms and last-active dates
- Toggle switches for each notification type, with a threshold slider for `healthScoreDropThreshold`
- "Remove device" button to deregister a push subscription
- A "Send test notification" button that sends a test push to the selected device

`MobileNotificationBanner` (`app/src/features/org-dashboard/MobileNotificationBanner.tsx`)
- A dismissible in-app banner shown to mobile browser users who haven't installed the native app
- Message: "Get live alerts on your home screen — download the Xperiq app"
- Shows only on mobile viewport widths (below `sm` breakpoint)
- Dismissed state stored in `localStorage`

`CommandCenterMobileLayout` (`app/src/features/org-dashboard/CommandCenterMobileLayout.tsx`)
- Responsive layout variant for `sm` viewports (below 640px)
- Renders only the health score (hero), a compact 2-tile KPI row (NPS + responses today), and the anomaly alert list
- The Crystal brief is collapsed to 1 line with a "Read brief" expansion
- The programs table is replaced by a vertical list of `ProgramHealthCard` components (stacked, each 80px tall, swipeable to reveal "Ask Crystal" action)
- Sticky bottom tab bar: "Overview" / "Programs" / "Topics" / "Crystal"

### Effort Estimate

Backend: 6 days (four tables, six endpoints, push-notifier.job.ts, widget-token flow)
CrystalOS: 2 days (generate_push_brief utility, internal endpoint)
Native widget: 5 days iOS (Swift WidgetKit) + 5 days Android (Kotlin Glance) — parallel tracks
Frontend: 5 days (PushNotificationSettingsPanel, MobileNotificationBanner, CommandCenterMobileLayout, Capacitor wrapper config)
Push infrastructure: 2 days (APNs certificate provisioning, FCM project setup, end-to-end delivery test)
**Total: ~20 days engineering (4 weeks, with iOS/Android in parallel)**

### Dependencies

- Requires App Store and Google Play developer accounts — these must be provisioned before native widget development begins
- The widget token flow requires a dedicated `WIDGET_JWT_SECRET` environment variable — add to `.env.example`, `backend/.env.example`, and `docs/ENV_VARS.md` per project rules
- War Room 2.0 (Expansion 5) voice briefings can be delivered as push notifications to mobile devices — `notify_voice_briefing` becomes a valid `notification_type` once Expansion 5 ships
- Period Comparison Mode (Expansion 6) is desktop-only; mobile layout renders standard single-period view only

---

## Dependency Graph

```
Executive Share Links (1)
  ├── (enables) War Room 2.0 share view  → War Room 2.0 (5)
  ├── (enables) Comparison share links   → Period Comparison Mode (6)
  └── (optional) Forecast in share view  → Predictive Health Score (3)

Goal Tracking (2)
  ├── (feeds) Forecast narrative context → Predictive Health Score (3)
  ├── (feeds) Benchmark framing          → Multi-Org Benchmarking (4)
  └── (feeds) Goal at-risk push alerts   → Mobile Command Center (7)

Predictive Health Score (3)
  └── (enriches) Crystal brief content  → (all consumers of org_crystal_briefs)

Multi-Org Benchmarking (4)
  └── (no hard dependencies — self-contained opt-in layer)

War Room 2.0 (5)
  └── (optional voice push to mobile)   → Mobile Command Center (7)

Period Comparison Mode (6)
  └── (optional goal overlay)           → Goal Tracking (2)

Mobile Command Center (7)
  ├── (critical anomaly push context)   → existing alert infrastructure
  └── (health score drop alerts)        → org_health_score_history (created by Expansion 3)
```

---

## Recommended Build Sequence

The sequence below minimizes blocked dependencies and maximizes early value delivery. Each phase is sized to fit within a 6–8 week sprint cycle.

**Phase 1 (Q1 2027) — Foundation expansions (parallel tracks)**
- Track A: Goal Tracking (Expansion 2) — 3.2 weeks
- Track B: Executive Share Links (Expansion 1) — 2.2 weeks
- Rationale: Both are self-contained, deliver immediate user value, and establish patterns (goal data, token-auth views) that later expansions consume. They share no dependencies and can be built in parallel.

**Phase 2 (Q2 2027) — Intelligence expansions**
- Predictive Health Score (Expansion 3) — 3.4 weeks
  - Requires `org_health_score_history` accumulation; deploy the history table at the end of Phase 1 so 30+ days of data exist before the forecast UI ships
- Multi-Org Benchmarking (Expansion 4) — 3 weeks engineering + legal review in parallel
  - Begin legal review for the data sharing agreement during Phase 1 so it unblocks Phase 2 delivery
- Rationale: Both expansions add intelligence layers on top of the existing data model. Predictive Score requires history data to warm up; Benchmarking requires legal clearance. Starting both at the same time with parallel workstreams is the fastest path.

**Phase 3 (Q3 2027) — Experience expansions (parallel tracks)**
- Track A: War Room 2.0 (Expansion 5) — 3.6 weeks
- Track B: Period Comparison Mode (Expansion 6) — 3.2 weeks
- Rationale: Both are pure experience expansions — no new data infrastructure, no new CrystalOS graphs that require warm-up time. They can run in parallel and deliver a major UX leap for the platform in a single quarter.

**Phase 4 (Q4 2027 → Q1 2028) — Mobile expansion**
- Mobile Command Center (Expansion 7) — 4 weeks
- Rationale: Native app development (WidgetKit, Glance) requires a separate development environment setup and App Store review time. Build this last so the iOS/Android surfaces reflect the fully mature Command Center feature set from Phases 1–3. The Capacitor wrapper also benefits from having all responsive layout work from Phase 3 already complete.

---

*This roadmap is a planning document, not a commitment. Each expansion must receive a formal architecture review entry in `docs/org-dashboard/DECISIONS.md` and sign-off from the backend architect and principal UX designer before implementation begins. Effort estimates assume two experienced full-stack engineers per track.*
