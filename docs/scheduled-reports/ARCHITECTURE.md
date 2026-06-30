# Scheduled Intelligence Reports — Architecture

> **Feature:** Scheduled Intelligence Reports ("Intelligence Briefings")
> **Updated:** 2026-06-29

---

## Core Concepts

A **Scheduled Report** is the composition of four orthogonal concerns:

```
Report = Template + Schedule + Scope + DeliveryConfig
```

- **Template** — The structural definition of the report: which sections appear, in what order, with what metric requirements. Templates are immutable seeds; user customization creates a `template_overrides` JSON blob on the `scheduled_reports` row, not a new template record.

- **Schedule** — When to generate: `daily`, `weekly`, `monthly`, or `custom_cron`. Weekly defaults to Monday 6am in the org's timezone. Monthly defaults to the 1st at 6am. Custom cron is a standard 5-field cron expression.

- **Scope** — What data to generate over: a single survey (`survey_id`), a tag group (`tag_group_id`), or the entire organization (`org_id` with no further filter). Scope resolution is handled entirely by the `assemble_scope` node in CrystalOS.

- **DeliveryConfig** — Where to send the finished artifact: email (primary), Slack (secondary), webhook (tertiary), in-app (always on). A single report run generates one artifact and fans it out to all configured channels.

**The generation-delivery split is intentional.** A report is generated once (one CrystalOS run, one artifact record) and delivered to N recipients. This means all recipients see identical content — no per-recipient personalization in v1 — and re-delivery (e.g. "send to me again") is a delivery operation only, not a re-generation.

---

## Data Model

All tables live in the `public` schema. All tables use UUID primary keys. All tables follow the soft-delete pattern: `deleted_at TIMESTAMPTZ` (NULL = active).

```sql
-- ============================================================
-- report_templates
-- Immutable built-in definitions + user-created custom templates.
-- Built-in templates have org_id = NULL (system-owned).
-- ============================================================
CREATE TABLE report_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL = built-in, system-owned template
  slug              TEXT NOT NULL,
  -- machine name: 'weekly_nps_digest', 'monthly_executive_summary', etc.
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  -- shown in template picker UI
  best_for          TEXT NOT NULL,
  -- e.g. "CX managers who need weekly stakeholder updates"
  trigger_type      TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'event')),
  -- 'scheduled' = runs on cadence; 'event' = triggered by condition
  default_cadence   TEXT,
  -- NULL for event-triggered. Values: 'daily','weekly','monthly','custom'
  sections          JSONB NOT NULL DEFAULT '[]',
  -- ordered array of section definitions; see SectionDef type below
  metric_contract   JSONB NOT NULL DEFAULT '{}',
  -- the set of metrics this template requires from compute_metrics
  is_built_in       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX report_templates_slug_builtin_idx
  ON report_templates (slug) WHERE is_built_in = true;

-- SectionDef JSONB shape:
-- { id: string, type: 'kpi_row'|'narrative'|'topic_list'|'quote_block'|'chart'|'recommendation', label: string, required: boolean }


-- ============================================================
-- scheduled_reports
-- A user's configured report instance. One row per report.
-- ============================================================
CREATE TABLE scheduled_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id  UUID NOT NULL REFERENCES users(id),
  template_id         UUID NOT NULL REFERENCES report_templates(id),
  name                TEXT NOT NULL,
  -- user-given name; defaults to template name + scope summary
  scope_type          TEXT NOT NULL CHECK (scope_type IN ('survey', 'tag_group', 'org')),
  scope_id            UUID,
  -- survey_id or tag_group_id; NULL when scope_type = 'org'
  cadence             TEXT NOT NULL,
  -- 'daily', 'weekly', 'monthly', 'custom'
  cron_expression     TEXT,
  -- populated for cadence = 'custom', and also computed for daily/weekly/monthly
  -- e.g. weekly = '0 6 * * 1' (Mon 6am), monthly = '0 6 1 * *'
  timezone            TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  enabled             BOOLEAN NOT NULL DEFAULT true,
  next_run_at         TIMESTAMPTZ,
  -- computed after each run; NULL = not yet scheduled (will be set on first save)
  last_run_at         TIMESTAMPTZ,
  last_run_status     TEXT CHECK (last_run_status IN ('success', 'failed', 'running')),
  template_overrides  JSONB NOT NULL DEFAULT '{}',
  -- user customizations over the base template sections
  delivery_email      BOOLEAN NOT NULL DEFAULT true,
  delivery_slack      BOOLEAN NOT NULL DEFAULT false,
  delivery_webhook    BOOLEAN NOT NULL DEFAULT false,
  slack_webhook_url   TEXT,
  webhook_url         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX scheduled_reports_org_id_idx ON scheduled_reports (org_id);
CREATE INDEX scheduled_reports_next_run_idx
  ON scheduled_reports (next_run_at)
  WHERE enabled = true AND deleted_at IS NULL;
-- This index is the scheduler's hot path. Must stay lean.


-- ============================================================
-- report_runs
-- One row per execution of a scheduled_report.
-- ============================================================
CREATE TABLE report_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id UUID NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  org_id              UUID NOT NULL REFERENCES organizations(id),
  triggered_by        TEXT NOT NULL CHECK (triggered_by IN ('scheduler', 'manual', 'api')),
  triggered_by_user_id UUID REFERENCES users(id),
  -- NULL for scheduler-triggered runs
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  duration_ms         INTEGER,
  error_message       TEXT,
  -- populated on failure
  crystalos_run_id    TEXT,
  -- the run ID from the CrystalOS Report Generation Graph execution
  metric_snapshot_id  UUID,
  -- reference to the Redis key or a future metric_snapshots table
  attempt_number      INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX report_runs_scheduled_report_id_idx ON report_runs (scheduled_report_id);
CREATE INDEX report_runs_org_id_created_at_idx ON report_runs (org_id, created_at DESC);


-- ============================================================
-- report_artifacts
-- The generated report output. One row per successful run.
-- Decoupled from report_runs so re-delivery does not re-generate.
-- ============================================================
CREATE TABLE report_artifacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES report_runs(id) ON DELETE CASCADE,
  scheduled_report_id UUID NOT NULL REFERENCES scheduled_reports(id),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  html_content        TEXT,
  -- full rendered HTML of the report (stored inline for < 256KB reports)
  html_storage_key    TEXT,
  -- GCS/S3 key if HTML is too large for inline storage
  pdf_storage_key     TEXT,
  -- GCS/S3 key for PDF artifact; NULL if PDF not generated
  narrative_text      TEXT NOT NULL,
  -- Crystal's plain-language narrative (always stored; used for in-app and Slack)
  highlights          JSONB NOT NULL DEFAULT '[]',
  -- array of { quote: string, respondent_id: string, sentiment: 'positive'|'negative'|'neutral' }
  recommendations     JSONB NOT NULL DEFAULT '[]',
  -- array of { action: string, priority: 'high'|'medium'|'low', rationale: string }
  metric_payload      JSONB NOT NULL DEFAULT '{}',
  -- the full ReportMetricPayload that was fed into Crystal; enables re-render
  subject_line        TEXT NOT NULL,
  -- pre-computed email subject line (e.g. "Your Weekly NPS Digest — Week of Jun 23")
  preview_text        TEXT NOT NULL,
  -- email preview text (shown after subject in inbox)
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  -- artifacts expire after 90 days; a job prunes them
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX report_artifacts_run_id_idx ON report_artifacts (run_id);
CREATE INDEX report_artifacts_scheduled_report_id_idx ON report_artifacts (scheduled_report_id, created_at DESC);


-- ============================================================
-- report_recipients
-- Who receives a scheduled_report's deliveries.
-- Supports per-recipient unsubscribe without removing the config.
-- ============================================================
CREATE TABLE report_recipients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id UUID NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  org_id              UUID NOT NULL REFERENCES organizations(id),
  user_id             UUID REFERENCES users(id),
  -- NULL for external email recipients
  email               TEXT NOT NULL,
  display_name        TEXT,
  channel             TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'slack', 'webhook')),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at     TIMESTAMPTZ,
  unsubscribe_token   UUID NOT NULL DEFAULT gen_random_uuid(),
  -- used in one-click unsubscribe links; never expires
  added_by_user_id    UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheduled_report_id, email, channel)
);

CREATE INDEX report_recipients_scheduled_report_id_idx ON report_recipients (scheduled_report_id);
CREATE UNIQUE INDEX report_recipients_unsubscribe_token_idx ON report_recipients (unsubscribe_token);
```

---

## Report Template System

Six built-in templates are seeded at startup. They cover the most common CX reporting patterns. Each template specifies an ordered `sections` array that drives both the HTML email layout and the CrystalOS narrative prompt structure.

### Template 1: Weekly NPS Digest (`weekly_nps_digest`)

**Default cadence:** Weekly (Monday 6am, org timezone)
**Trigger type:** Scheduled
**Best for:** CX managers who report NPS weekly to their team or stakeholders

**Sections:**
1. `kpi_row` — NPS score (current week) with delta vs. prior week; total responses; response velocity (responses/day this week vs. last week); completion rate
2. `narrative` — Crystal's 3-sentence narrative: "Here's what happened this week in your NPS data. Here's the most important change. Here's what it means."
3. `chart` — Rolling 8-week NPS trend sparkline
4. `topic_list` — Top 5 promoter themes (green) and top 5 detractor themes (red), each with frequency count and example verbatim
5. `quote_block` — 2 Crystal-selected verbatim quotes: one promoter, one detractor. Selected for emotional salience and representativeness.
6. `recommendation` — 1–2 Crystal action bullets based on the week's data

**Metric contract:** `{ nps_current, nps_prior_week, nps_delta, responses_total, responses_this_week, responses_prior_week, velocity_current, velocity_prior, completion_rate, promoter_topics: Topic[], detractor_topics: Topic[], nps_trend: WeeklyNPS[] }`

---

### Template 2: Monthly Executive Summary (`monthly_executive_summary`)

**Default cadence:** Monthly (1st of month, 7am, org timezone)
**Trigger type:** Scheduled
**Best for:** CX directors presenting to executives or boards; ops leads doing monthly business reviews

**Sections:**
1. `kpi_row` — Org Health Score (Xperiq composite), NPS YTD, total responses MTD, response velocity trend (this month vs. last month)
2. `narrative` — Crystal's full executive paragraph: a 5–7 sentence synthesis of the month's experience data, written at C-suite reading level
3. `topic_list` — Top 3 wins (positive themes with frequency and sentiment score) and top 3 concerns (negative themes with frequency and example verbatims)
4. `chart` — NPS YTD trend (12-month bar chart data)
5. `recommendation` — Crystal's 3 strategic recommendations, each with rationale and suggested owner (e.g. "Customer Success team", "Product team")
6. `quote_block` — 3 Crystal-selected verbatim quotes that best represent the month's experience signal

**Metric contract:** `{ org_health_score, nps_ytd, nps_mom_delta, responses_mtd, responses_prior_month, velocity_trend, top_wins: Topic[], top_concerns: Topic[], nps_12m: MonthlyNPS[], crystal_recommendations: Recommendation[] }`

---

### Template 3: Survey Closeout Report (`survey_closeout`)

**Default cadence:** N/A — event-triggered when a survey's `status` changes to `closed`
**Trigger type:** Event
**Best for:** Research managers, CX ops teams closing a project-based survey

**Sections:**
1. `kpi_row` — Total responses, completion rate, average time to complete, NPS (if applicable), date range
2. `narrative` — Crystal's full analysis of the closed survey: key finding, unexpected finding, and recommended next step
3. `topic_list` — Complete topic breakdown: all themes with frequency, sentiment, and example verbatims
4. `chart` — Response volume over time (bar chart of responses per day for the survey's lifespan)
5. `quote_block` — 3 Crystal-selected quotes that best capture the survey's signal
6. `recommendation` — Crystal's full next-steps section: 3–5 action bullets with rationale

**Metric contract:** `{ total_responses, completion_rate, avg_completion_seconds, nps, date_range, all_topics: Topic[], response_by_day: DailyCount[], crystal_summary: string }`

---

### Template 4: Tag Group Weekly (`tag_group_weekly`)

**Default cadence:** Weekly (Monday 6am, org timezone)
**Trigger type:** Scheduled
**Scope:** Requires `scope_type = 'tag_group'`
**Best for:** CX managers who track NPS by team, region, product line, or customer segment

**Sections:** Identical to Weekly NPS Digest, but all metrics are scoped to the tag group. Adds a `comparison` section: tag group NPS vs. org-wide NPS, showing whether this segment is above or below average.

1. `kpi_row` — Tag group NPS (current week), delta vs. prior week, tag group response count, segment response rate
2. `narrative` — Crystal's narrative scoped to the segment: "Here's what your [segment name] customers told you this week."
3. `chart` — Rolling 8-week NPS trend for this tag group vs. org-wide trend (overlay)
4. `topic_list` — Top 5 themes specific to this tag group
5. `quote_block` — 2 verbatim quotes from this tag group
6. `recommendation` — 1–2 Crystal recommendations specific to this segment

---

### Template 5: Response Anomaly Alert (`anomaly_alert`)

**Default cadence:** N/A — event-triggered by `detect_changes` node in the insight pipeline
**Trigger type:** Event (immediate delivery, not scheduled)
**Best for:** CX managers who need real-time alerting when something unusual happens

**Trigger conditions (defined in `metric_contract.trigger_rules`):**
- NPS drops > 10 points vs. 7-day rolling average
- Response velocity drops > 50% vs. prior week
- A single topic's frequency spikes > 3x its 30-day average
- Completion rate drops below 40%

**Sections:**
1. `alert_header` — "Crystal detected an anomaly in [survey name]" with severity badge (Warning / Critical)
2. `kpi_row` — The anomalous metric: current value, baseline, delta, and magnitude
3. `narrative` — Crystal's 3-sentence anomaly explanation: "What changed. Why this matters. What to check first."
4. `topic_list` — The top 3 topics associated with the anomaly (e.g., if NPS dropped, which detractor topics spiked)
5. `recommendation` — Crystal's immediate recommended action (1–2 bullets, actionable within hours)

---

### Template 6: Quarterly Business Review Pack (`qbr_pack`)

**Default cadence:** Quarterly (1st day of Jan/Apr/Jul/Oct, 8am, org timezone)
**Trigger type:** Scheduled
**Best for:** CX leaders preparing QBR materials for executive or client-facing reviews

**Sections:**
1. `kpi_row` — NPS for the quarter, delta vs. prior quarter, responses this quarter, completion rate, org health score
2. `narrative` — Crystal's full QBR executive summary: 8–10 sentences covering the quarter's experience story arc
3. `chart` — NPS trend for the last 4 quarters (quarterly comparison bar chart)
4. `topic_list` — Top 5 themes this quarter with frequency, sentiment, and MoM trend indicator
5. `benchmark_comparison` — Xperiq industry benchmark: org NPS vs. industry average (if benchmark data available)
6. `quote_block` — 4 Crystal-selected verbatims that represent the quarter
7. `recommendation` — Crystal's 3–5 strategic recommendations with rationale, owner, and suggested timeline
8. `chart` — Response velocity trend: weekly responses over the quarter (line chart data)

---

## CrystalOS Report Generation Graph

The Report Generation Graph is a new LangGraph `StateGraph` defined in `crystalos/graphs/report_generation.py`. It runs alongside (not inside) the existing Insight Pipeline graph. Shared utility functions (topic extraction, NPS computation) are extracted to `crystalos/shared/metrics.py` and called by both graphs — there is no code duplication.

### Graph State

```python
class ReportGenerationState(TypedDict):
    # Input
    scheduled_report_id: str
    run_id: str
    template_slug: str
    scope_type: Literal["survey", "tag_group", "org"]
    scope_id: Optional[str]
    org_id: str
    time_range: TimeRange          # { start: datetime, end: datetime }
    template_overrides: dict

    # Assembled
    scope_metadata: ScopeMetadata  # survey/tag_group/org names, context
    raw_responses: list[Response]  # filtered to scope + time_range
    metric_payload: ReportMetricPayload

    # Computed by Crystal
    topics: list[Topic]
    changes: list[MetricChange]    # deltas vs. prior period
    narrative: str                 # full Crystal narrative
    highlights: list[Quote]        # selected verbatim quotes
    recommendations: list[Recommendation]

    # Rendered
    html_content: str
    pdf_bytes: Optional[bytes]
    subject_line: str
    preview_text: str

    # Delivery
    artifact_id: str
    delivery_results: list[DeliveryResult]

    # Control
    error: Optional[str]
    current_node: str
```

### Nodes

**`assemble_scope`**
Pure data node (no LLM). Resolves the scope to a concrete set of survey IDs, loads scope metadata (survey name, tag group label, org name), and fetches responses from Postgres scoped to the time range. Applies the same soft-delete filter as the rest of the platform. Output: `scope_metadata`, `raw_responses`. This node is the most expensive DB call in the graph; it uses the pre-aggregated `response_summaries` materialized view where possible and falls back to direct `responses` table queries for templates that need verbatim text.

**`compute_metrics`**
Pure computation node (no LLM). Takes `raw_responses` and computes the full `ReportMetricPayload` as defined by `metric_contract` for the given template. Includes: NPS score, promoter/detractor/passive counts, response velocity, completion rate, rolling NPS window, YTD aggregates where needed. Checks the Redis metric cache first (key: `metric:{org_id}:{scope_type}:{scope_id}:{date_range_hash}`); if hit, skips computation. Cache TTL: 1 hour for daily cadence, 4 hours for weekly/monthly. Output: `metric_payload`.

**`run_topics`**
Calls the shared `extract_topics` utility (the same topic extraction used in the main Insight Pipeline). Does not re-implement topic extraction. Input: `raw_responses` (verbatim text fields only). Output: `topics` — a list of `Topic` objects with label, frequency, sentiment, example verbatims, and embedding. Skips this node if the template's `sections` array does not include `topic_list`.

**`detect_changes`**
Computes period-over-period deltas for all metrics in `metric_payload`. Compares current period vs. prior equivalent period (e.g., this week vs. last week, this month vs. last month). For Anomaly Alert template: applies trigger rule evaluation against `metric_contract.trigger_rules`. If no trigger rules are met, sets `changes = []` and the graph's delivery node will skip delivery (the report is not sent if no anomaly is detected). Output: `changes`.

**`generate_narrative`**
LLM node. Constructs a structured prompt from: template slug, metric_payload, topics, changes, and scope_metadata. The prompt is template-specific (each template slug maps to a prompt template in `crystalos/prompts/report_narrative/`). Uses structured output with Pydantic to enforce: `{ narrative: str, subject_line: str, preview_text: str }`. Narrative is grounded: every factual claim in the output is verified against the metric_payload before the node returns — a post-generation guard checks that any number mentioned in the narrative appears in the payload. Output: `narrative`, `subject_line`, `preview_text`.

**`generate_highlights`**
LLM node. Given the full list of `raw_responses` verbatim texts and the `topics` list, selects 2–4 verbatim quotes that best represent the report's signal. Selection criteria: semantic diversity (selected quotes must not be paraphrases of each other), emotional salience (quotes that express strong positive or negative sentiment score higher), topic alignment (each quote is associated with a top topic). Output: `highlights` — a list of `Quote` objects with `text`, `respondent_id`, `sentiment`, and `topic_label`.

**`assemble_report`**
Pure assembly node (no LLM). Combines metric_payload, narrative, topics, highlights, recommendations, and template section definitions into a single `ReportDocument` object. Applies `template_overrides` from the user's configuration (e.g., custom section visibility, custom header text). Output: `report_document` (added to state).

**`render_html`**
Pure rendering node. Takes `report_document` and renders it to HTML using Jinja2 templates in `crystalos/templates/email/`. The base email template (`base.html.j2`) implements the responsive email layout system. Each section type has its own partial template (`kpi_row.html.j2`, `narrative.html.j2`, etc.). Inlines all CSS using the `premailer` library for email client compatibility. Output: `html_content`.

**`render_pdf`**
Conditional node. Only runs if the template includes a PDF delivery channel or the run was triggered with `include_pdf=True`. Uses Playwright (headless Chromium) to render the HTML to PDF. PDF is base64-encoded and included in the state. Skipped for Anomaly Alert template (email-only). Output: `pdf_bytes`.

**`deliver`**
Fan-out node. Retrieves the recipient list from Postgres for this `scheduled_report_id`. For each active, non-unsubscribed recipient: dispatches to the appropriate delivery handler (email via SendGrid, Slack via webhook, webhook via HTTP POST, in-app via backend API). Delivery is fire-and-forget per recipient — one recipient's bounce does not block others. Aggregates results into `delivery_results`. Output: `delivery_results`.

**`record_artifact`**
Terminal node. Writes the `report_artifacts` row to Postgres with all rendered content, metric snapshot, narrative, highlights, and recommendations. Updates the `report_runs` row to `status = 'success'`, sets `completed_at`, `duration_ms`. Updates `scheduled_reports.last_run_at`, `last_run_status`, and computes + writes `next_run_at`. Emits a telemetry event to the backend's observability pipeline. Output: `artifact_id`.

---

## Scheduling Engine

The scheduling engine runs inside the existing CrystalOS scheduler tick (configurable interval, default 60 seconds). On each tick:

```python
# crystalos/scheduler/report_scheduler.py

async def tick(db: AsyncPg, redis: Redis):
    # 1. Acquire global scheduler lock (prevents multi-instance races)
    lock_key = "scheduler:reports:tick_lock"
    acquired = await redis.set(lock_key, "1", nx=True, ex=30)
    if not acquired:
        return  # another instance is handling this tick

    # 2. Find all reports due
    due_reports = await db.fetch("""
        SELECT id, org_id, template_id, scope_type, scope_id,
               cron_expression, timezone
        FROM scheduled_reports
        WHERE enabled = true
          AND deleted_at IS NULL
          AND next_run_at <= now()
        ORDER BY next_run_at ASC
        LIMIT 100
    """)

    # 3. For each due report, acquire a per-report lock and enqueue
    for report in due_reports:
        run_lock_key = f"scheduler:reports:run:{report['id']}"
        run_lock = await redis.set(run_lock_key, "1", nx=True, ex=900)
        # 15-minute lock: prevents double-run if tick fires twice
        if not run_lock:
            continue  # already running

        run_id = await create_run_record(db, report['id'], triggered_by='scheduler')
        await enqueue_report_run(report['id'], run_id)
        # Immediately compute and write next_run_at so the report
        # is not picked up again before this run completes
        next_run = compute_next_run_at(report['cron_expression'], report['timezone'])
        await db.execute(
            "UPDATE scheduled_reports SET next_run_at = $1 WHERE id = $2",
            next_run, report['id']
        )
```

**next_run_at computation:** Uses the `croniter` library. Given the cron expression and timezone, `croniter.get_next(datetime)` returns the next scheduled datetime in UTC. The result is stored as TIMESTAMPTZ.

**Failure handling:** If a run fails, `report_runs.status` is set to `'failed'` and `error_message` is populated. The scheduler does NOT automatically retry failed runs — retries are explicit and initiated via the `POST /api/reports/:id/runs/:runId/retry` endpoint. This is intentional: automatic retry of report generation can result in duplicate deliveries, which users find more confusing than a missed report.

**Event-triggered reports** (Anomaly Alert, Survey Closeout): Not handled by the scheduler tick. These are triggered by the backend when the relevant event occurs (survey status change, anomaly detected in insight pipeline). They call the same `enqueue_report_run` function with `triggered_by='event'`.

---

## API Design

All endpoints are under `/api/reports`. Auth is standard Clerk middleware. Org isolation is enforced by looking up `scheduled_reports.org_id = req.orgId` on every query.

### `GET /api/reports`
Returns all active scheduled reports for the org. Includes last run status, next run time, and recipient count.

```typescript
// Response
{
  reports: Array<{
    id: string;
    name: string;
    templateSlug: string;
    templateName: string;
    scopeType: 'survey' | 'tag_group' | 'org';
    scopeName: string;         // resolved display name
    cadence: string;
    nextRunAt: string | null;  // ISO 8601
    lastRunAt: string | null;
    lastRunStatus: 'success' | 'failed' | 'running' | null;
    enabled: boolean;
    recipientCount: number;
    createdAt: string;
  }>;
}
```

### `POST /api/reports`
Creates a new scheduled report. Validates template exists, scope exists and belongs to org, cron expression is valid. Computes initial `next_run_at`. Does not immediately trigger a run.

```typescript
// Request body
{
  name: string;
  templateId: string;
  scopeType: 'survey' | 'tag_group' | 'org';
  scopeId?: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'custom';
  cronExpression?: string;   // required if cadence = 'custom'
  timezone: string;          // IANA timezone string
  templateOverrides?: Record<string, unknown>;
  deliveryEmail?: boolean;
  deliverySlack?: boolean;
  slackWebhookUrl?: string;
}

// Response: 201 Created
{ report: ScheduledReport }
```

### `GET /api/reports/:id`
Returns full report config with template details, scope details, recipient list, and last 5 run summaries.

### `PUT /api/reports/:id`
Updates report config. Cannot change templateId — create a new report instead. Recomputes `next_run_at` if cadence/timezone changes. Returns updated report.

### `DELETE /api/reports/:id`
Soft-delete: sets `deleted_at`. Does not cancel in-progress runs. Returns `204 No Content`.

### `POST /api/reports/:id/run-now`
Immediately enqueues a run. Requires the report to exist and not be currently running. Returns the created `run_id`. Callers poll `GET /api/reports/:id/runs/:runId` for completion.

```typescript
// Response: 202 Accepted
{ runId: string; message: 'Report run enqueued.' }
```

### `GET /api/reports/:id/runs`
Returns paginated run history for a report.

```typescript
// Query params: ?page=1&limit=20
// Response
{
  runs: Array<{
    id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
    triggeredBy: 'scheduler' | 'manual' | 'api';
    triggeredByUserId?: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    errorMessage: string | null;
    deliveryResults?: DeliveryResult[];
    artifactId?: string;
  }>;
  total: number;
  page: number;
}
```

### `GET /api/reports/:id/runs/:runId/preview`
Returns the HTML content of the artifact for in-browser preview. Requires the run to be in `success` status.

```typescript
// Response
{
  html: string;
  subjectLine: string;
  previewText: string;
  generatedAt: string;
  metricPayload: ReportMetricPayload;  // for debugging
}
```

### `GET /api/report-templates`
Returns all available templates (built-in + org-specific custom templates). Includes section definitions and descriptions.

```typescript
// Response
{
  templates: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    bestFor: string;
    triggerType: 'scheduled' | 'event';
    defaultCadence: string | null;
    isBuiltIn: boolean;
    sections: SectionDef[];
  }>;
}
```

### `POST /api/reports/:id/recipients`
Adds one or more recipients to a report. Idempotent on email+channel.

```typescript
// Request body
{
  recipients: Array<{
    email: string;
    displayName?: string;
    channel: 'email' | 'slack' | 'webhook';
    userId?: string;
  }>;
}
// Response: 200 OK
{ added: number; skipped: number }
```

### `DELETE /api/reports/:id/recipients/:recipientId`
Removes a recipient. Soft-remove via `is_active = false` (preserves unsubscribe audit trail).

### `GET /api/reports/unsubscribe/:token`
Unsubscribe handler. Validates the token, sets `is_active = false` and `unsubscribed_at = now()`. Returns a minimal HTML page ("You've been unsubscribed. You will no longer receive [report name] from [org name]."). This endpoint is unauthenticated.

---

## Email Design System

All HTML email output follows these constraints, enforced by the base Jinja2 template:

**Layout:** Single-column, max-width 600px, centered. Table-based layout (not div/flexbox) for Outlook compatibility. Outer wrapper table with `cellpadding="0" cellspacing="0" border="0"`.

**Typography:** Primary font stack `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`. All font sizes in `px`, not `em`. Body text: 16px/1.6. Section headers: 13px uppercase tracking. KPI values: 36px bold.

**Colors:** Light mode defaults. CSS `@media (prefers-color-scheme: dark)` overrides for Apple Mail and Gmail dark mode. Light: background `#F9FAFB`, card background `#FFFFFF`, text `#111827`, muted text `#6B7280`, accent `#4F46E5` (Xperiq Indigo), positive `#10B981`, negative `#EF4444`, neutral `#6B7280`. Dark: background `#111827`, card `#1F2937`, text `#F9FAFB`.

**Unsubscribe:** Every email includes `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058 one-click unsubscribe). The footer includes a plain-text unsubscribe link using the recipient's `unsubscribe_token`.

**Preview text:** The `subject_line` and `preview_text` are generated by the `generate_narrative` node. Preview text is injected as a hidden `<span>` in the email `<body>` immediately after the opening `<body>` tag, followed by a zero-width non-joiner fill to prevent Gmail from surfacing body copy as preview.

**MSO conditional comments:** Section headers and dividers use `<!--[if mso]>` conditional comments to inject VML-based table borders and spacing that Outlook ignores from CSS.
