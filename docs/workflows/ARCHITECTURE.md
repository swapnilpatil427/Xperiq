# Xperiq Actions — Workflow Automation Architecture

**Version:** 1.0
**Owner:** Priya Krishnamurthy (Backend Architect) + Nina Reeves (Platform Expert)
**Status:** Design — approved for Phase 1 implementation
**Last updated:** 2026-06-29

---

## Overview

Xperiq Actions is a fault-tolerant, AI-aware workflow execution engine that turns passive experience data into triggered organizational responses. The system is designed around three principles:

1. **Every execution is auditable.** A `WorkflowRun` is an immutable record. You can always answer "why did this fire last Tuesday at 2:17 AM, and what did it do?"
2. **AI triggers are first-class.** The engine natively integrates CrystalOS signal output as trigger events — not as a bolted-on feature, but as a designed seam.
3. **No execution is lost.** BullMQ Redis-backed queues with retry and dead-letter guarantee every trigger event that should fire eventually does, even under third-party failures.

---

## Core Concepts

### The Workflow Model

```
Workflow = Trigger + Conditions (optional, AND-chained) + Actions (ordered list)
```

- **Trigger**: The event that starts evaluation. Evaluated either by the backend scheduler tick or by CrystalOS signal emission.
- **Conditions**: Optional filters applied after the trigger fires. All conditions must pass (AND logic). Example: NPS threshold trigger + condition `survey.response_count > 100`.
- **Actions**: Ordered list of side effects to execute when trigger + conditions pass. Actions execute sequentially; a fatal action failure stops the chain (configurable per action).

### Scoping

A workflow is scoped to exactly one of:
- **Survey-level**: evaluates only responses/metrics from a specific `survey_id`
- **Tag-group-level**: evaluates across all surveys with a specific `tag` (e.g., all CSAT surveys)
- **Org-level**: evaluates across all surveys in the organization

Scope is set at creation and cannot be changed (create a new workflow instead).

### WorkflowRun

A `WorkflowRun` is created for every trigger evaluation that passes conditions. It is immutable after creation. Each action execution within a run creates a `WorkflowRunStep`. The run transitions through states: `pending → running → completed | failed | partial_failure`.

### Versioning

Every `PUT /api/workflows/:id` creates a new version record. `WorkflowRun` rows are linked to the exact version that fired them via `workflow_version`. This enables forensic queries: "show me all runs on version 3 of this workflow before I updated the condition."

---

## Database Schema

All tables are in the `public` schema on the Xperiq Postgres database. All tables include `created_at` and `updated_at` timestamps. Soft deletes use `deleted_at`.

```sql
-- ============================================================
-- WORKFLOWS
-- ============================================================

CREATE TABLE workflows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES users(id),
  
  -- Identity
  name              TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description       TEXT,
  
  -- Scope
  scope_type        TEXT NOT NULL CHECK (scope_type IN ('survey', 'tag_group', 'org')),
  scope_survey_id   UUID REFERENCES surveys(id),      -- non-null when scope_type = 'survey'
  scope_tag         TEXT,                              -- non-null when scope_type = 'tag_group'
  
  -- Trigger
  trigger_type      TEXT NOT NULL CHECK (trigger_type IN (
    'response_count',
    'response_rate_drop',
    'nps_threshold',
    'sentiment_spike',
    'new_theme_detected',
    'schedule',
    'manual',
    'survey_lifecycle',
    'response_submitted',
    'anomaly_detected'
  )),
  trigger_config    JSONB NOT NULL DEFAULT '{}',
  -- trigger_config examples:
  --   response_count:      { "threshold": 500, "direction": "above" }
  --   nps_threshold:       { "threshold": 30, "direction": "below", "window_hours": 24 }
  --   response_rate_drop:  { "threshold_pct": 20, "window_hours": 6 }
  --   sentiment_spike:     { "direction": "negative", "delta_pct": 15, "window_hours": 48 }
  --   new_theme_detected:  { "min_response_count": 5, "confidence_threshold": 0.85 }
  --   schedule:            { "cron": "0 9 * * 1", "timezone": "America/Chicago" }
  --   survey_lifecycle:    { "event": "published" | "paused" | "closed" }
  --   response_submitted:  { "filter": { "embedded_data": { "channel": "mobile" } } }
  --   anomaly_detected:    { "metric": "nps" | "csat" | "response_rate", "sigma": 2.0 }
  
  -- State
  status            TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN (
    'enabled',
    'disabled',
    'error',         -- last run ended in unrecoverable failure
    'cooldown'       -- fired recently; cooldown_until prevents re-fire
  )),
  cooldown_minutes  INTEGER NOT NULL DEFAULT 60,       -- minimum minutes between firings
  cooldown_until    TIMESTAMPTZ,                       -- null when not in cooldown
  
  -- Versioning
  version           INTEGER NOT NULL DEFAULT 1,
  version_history   JSONB NOT NULL DEFAULT '[]',
  -- version_history: array of { version, updated_at, updated_by, snapshot: { trigger_config, ... } }
  
  -- Meta
  tags              TEXT[] NOT NULL DEFAULT '{}',
  is_template       BOOLEAN NOT NULL DEFAULT false,
  template_id       UUID REFERENCES workflows(id),    -- if derived from a template
  last_fired_at     TIMESTAMPTZ,
  total_fire_count  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_workflows_org_id          ON workflows(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_scope_survey    ON workflows(scope_survey_id) WHERE scope_survey_id IS NOT NULL;
CREATE INDEX idx_workflows_scope_tag       ON workflows(org_id, scope_tag) WHERE scope_tag IS NOT NULL;
CREATE INDEX idx_workflows_trigger_type    ON workflows(org_id, trigger_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_workflows_status_enabled  ON workflows(org_id, status) WHERE status = 'enabled' AND deleted_at IS NULL;
CREATE INDEX idx_workflows_cooldown_until  ON workflows(cooldown_until) WHERE status = 'cooldown';


-- ============================================================
-- WORKFLOW CONDITIONS
-- ============================================================

CREATE TABLE workflow_conditions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Ordering (conditions are evaluated in order, all must pass)
  display_order   INTEGER NOT NULL DEFAULT 0,
  
  -- Condition definition
  field           TEXT NOT NULL,
  -- field examples:
  --   "survey.response_count"      (integer)
  --   "survey.nps_score"           (numeric)
  --   "survey.status"              (enum)
  --   "response.embedded_data.X"   (string/numeric, X is the embedded data key)
  --   "crystal.sentiment_score"    (numeric, from CrystalOS)
  --   "time.hour_of_day"           (integer, 0-23)
  --   "time.day_of_week"           (integer, 0-6)
  
  operator        TEXT NOT NULL CHECK (operator IN (
    'eq', 'neq',
    'gt', 'gte', 'lt', 'lte',
    'contains', 'not_contains',
    'in', 'not_in',
    'is_null', 'is_not_null'
  )),
  
  value           JSONB NOT NULL,
  -- value is always JSONB to support: string, number, array, null
  -- Examples: 100, "published", ["mobile", "web"], null
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wf_conditions_workflow ON workflow_conditions(workflow_id);


-- ============================================================
-- WORKFLOW ACTIONS
-- ============================================================

CREATE TABLE workflow_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Ordering
  display_order   INTEGER NOT NULL DEFAULT 0,
  
  -- Action definition
  action_type     TEXT NOT NULL CHECK (action_type IN (
    'send_email',
    'slack_notification',
    'webhook',
    'create_jira_ticket',
    'create_zendesk_ticket',
    'generate_report',
    'pause_survey',
    'close_survey',
    'crystal_analysis',
    'notify_in_app'
  )),
  
  action_config   JSONB NOT NULL DEFAULT '{}',
  -- action_config by type:
  --
  -- send_email:
  --   { "to": ["vp@company.com", "{{org.cx_team_email}}"],
  --     "subject": "NPS Alert: {{survey.name}} dropped to {{trigger.nps_score}}",
  --     "body_template": "html_template_string",
  --     "reply_to": "noreply@xperiq.com" }
  --
  -- slack_notification:
  --   { "webhook_url": "{{integrations.slack.default_webhook}}",
  --     "channel": "#cx-alerts",
  --     "message": "NPS Alert: *{{survey.name}}* is at *{{trigger.nps_score}}*\n>{{crystal.summary}}",
  --     "blocks": [] }  -- optional Slack Block Kit override
  --
  -- webhook:
  --   { "url": "https://hooks.example.com/xperiq",
  --     "method": "POST",
  --     "headers": { "Authorization": "Bearer {{integrations.custom.token}}" },
  --     "payload_template": { "survey_id": "{{survey.id}}", "nps": "{{trigger.nps_score}}" },
  --     "sign_payload": true }
  --
  -- create_jira_ticket:
  --   { "integration_id": "uuid",
  --     "project_key": "CX",
  --     "issue_type": "Bug",
  --     "summary": "NPS Alert: {{survey.name}}",
  --     "description": "{{crystal.summary}}",
  --     "priority": "High",
  --     "assignee_account_id": "5b10a..." }
  --
  -- create_zendesk_ticket:
  --   { "integration_id": "uuid",
  --     "subject": "CX Alert: {{survey.name}}",
  --     "body": "{{crystal.summary}}",
  --     "tags": ["xperiq-alert", "nps"],
  --     "priority": "high",
  --     "requester_email": "cx-bot@company.com" }
  --
  -- generate_report:
  --   { "report_type": "nps_trend" | "sentiment_breakdown" | "response_volume",
  --     "date_range_days": 30,
  --     "deliver_to": ["email@company.com"] }
  --
  -- pause_survey / close_survey:
  --   { "reason": "Auto-paused by workflow: {{workflow.name}}" }
  --
  -- crystal_analysis:
  --   { "analysis_type": "theme_extraction" | "sentiment_deep_dive" | "verbatim_summary",
  --     "question_ids": [],  -- empty = all open-text questions
  --     "attach_to_run": true }
  --
  -- notify_in_app:
  --   { "title": "NPS Alert: {{survey.name}}",
  --     "body": "Rolling NPS dropped to {{trigger.nps_score}}",
  --     "cta_label": "View Survey",
  --     "cta_url": "/surveys/{{survey.id}}/responses",
  --     "notify_user_ids": [],  -- empty = all org admins
  --     "icon": "alert" | "insight" | "survey" | "check" }
  
  -- Failure behavior
  on_failure      TEXT NOT NULL DEFAULT 'stop' CHECK (on_failure IN (
    'stop',     -- stop action chain on failure (default)
    'continue', -- skip this action and continue to next
    'retry'     -- retry up to max_retries before stopping
  )),
  max_retries     INTEGER NOT NULL DEFAULT 3,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wf_actions_workflow ON workflow_actions(workflow_id);
CREATE INDEX idx_wf_actions_type     ON workflow_actions(org_id, action_type);


-- ============================================================
-- WORKFLOW RUNS (immutable execution log)
-- ============================================================

CREATE TABLE workflow_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id           UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Version at time of execution
  workflow_version      INTEGER NOT NULL,
  
  -- Idempotency
  -- Deduplication key prevents double-firing on the same trigger event.
  -- Format: "{workflow_id}:{trigger_type}:{event_fingerprint}"
  -- event_fingerprint is deterministic from the trigger event payload.
  idempotency_key       TEXT NOT NULL UNIQUE,
  
  -- Trigger context
  trigger_type          TEXT NOT NULL,
  trigger_event_id      TEXT,  -- external event ID if applicable (e.g., response UUID)
  trigger_payload       JSONB NOT NULL DEFAULT '{}',
  -- trigger_payload: the full context at fire time
  -- { "nps_score": 28, "response_count": 412, "window_hours": 24,
  --   "crystal_signal": { "theme": "...", "confidence": 0.91 } }
  
  -- Execution state
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running',
    'completed',         -- all actions succeeded
    'failed',            -- all retries exhausted; in DLQ
    'partial_failure',   -- some actions succeeded, at least one failed with on_failure=continue
    'dry_run'            -- test mode; no side effects executed
  )),
  
  -- Timing
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  duration_ms           INTEGER,
  
  -- Retry tracking
  attempt_count         INTEGER NOT NULL DEFAULT 1,
  
  -- Crystal output attached to this run (if crystal_analysis action ran)
  crystal_analysis_id   UUID,  -- FK to crystal analysis record when implemented
  
  -- Error (if status = failed)
  error_message         TEXT,
  error_detail          JSONB,
  
  -- Initiator
  initiated_by          TEXT NOT NULL CHECK (initiated_by IN (
    'scheduler',        -- backend scheduler tick
    'crystalos',        -- CrystalOS signal emission
    'api',              -- POST /api/workflows/:id/test or manual trigger
    'user'              -- manual trigger via UI
  )),
  initiated_by_user_id  UUID REFERENCES users(id),
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Note: workflow_runs are intentionally NOT updated after creation.
  -- Status transitions are written as new columns, not updates to existing rows.
  -- The single exception is status/timing columns during execution.
);

-- Indexes
CREATE INDEX idx_wf_runs_workflow        ON workflow_runs(workflow_id, created_at DESC);
CREATE INDEX idx_wf_runs_org_recent      ON workflow_runs(org_id, created_at DESC);
CREATE INDEX idx_wf_runs_status          ON workflow_runs(workflow_id, status);
CREATE INDEX idx_wf_runs_idempotency     ON workflow_runs(idempotency_key);
CREATE INDEX idx_wf_runs_pending         ON workflow_runs(status, created_at) WHERE status IN ('pending', 'running');


-- ============================================================
-- WORKFLOW RUN STEPS (per-action execution log)
-- ============================================================

CREATE TABLE workflow_run_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  action_id       UUID NOT NULL REFERENCES workflow_actions(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Which action
  action_type     TEXT NOT NULL,
  display_order   INTEGER NOT NULL,
  
  -- Rendered config at time of execution (variables substituted)
  rendered_config JSONB NOT NULL DEFAULT '{}',
  -- This is the actual config sent to the action executor, with all {{vars}} resolved.
  -- This is what you inspect in the "why did this fire?" forensics view.
  
  -- Status
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'running',
    'success',
    'failed',
    'skipped',     -- skipped because a prior action failed with on_failure=stop
    'dry_run'      -- test mode
  )),
  
  -- Response from the action (for audit)
  response_payload JSONB,
  -- Example for slack_notification: { "ok": true, "ts": "1234567890.123456", "channel": "C0123456" }
  -- Example for create_jira_ticket: { "id": "10001", "key": "CX-42", "self": "https://..." }
  -- Example for webhook: { "status_code": 200, "response_body": "..." }
  
  -- Timing
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  
  -- Retry
  attempt_count   INTEGER NOT NULL DEFAULT 1,
  
  -- Error
  error_message   TEXT,
  error_code      TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wf_run_steps_run    ON workflow_run_steps(run_id, display_order);
CREATE INDEX idx_wf_run_steps_action ON workflow_run_steps(action_id);
CREATE INDEX idx_wf_run_steps_failed ON workflow_run_steps(run_id, status) WHERE status = 'failed';


-- ============================================================
-- RECOMMENDATION OUTCOMES (Fix 5 — Outcome Loop)
-- ============================================================

CREATE TABLE recommendation_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  rec_index       INTEGER NOT NULL,
  rec_headline    TEXT NOT NULL,
  theme_slug      TEXT,
  action          TEXT NOT NULL CHECK (action IN ('acted_on','dismissed','snoozed','undismissed')),
  acted_on_at     TIMESTAMPTZ,
  snooze_until    TIMESTAMPTZ,
  outcome_data    JSONB,
  -- outcome_data: populated by CrystalOS on next briefing run
  -- { "metric_then": 12, "metric_now": 3, "delta_pct": -75, "status": "positive"|"negative"|"unclear" }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rec_outcomes_org       ON recommendation_outcomes(org_id, acted_on_at DESC);
CREATE INDEX idx_rec_outcomes_run       ON recommendation_outcomes(run_id);
CREATE INDEX idx_rec_outcomes_theme     ON recommendation_outcomes(org_id, theme_slug) WHERE action = 'acted_on';
CREATE INDEX idx_rec_outcomes_snooze    ON recommendation_outcomes(snooze_until) WHERE action = 'snoozed';
```

---

## Trigger Type Specifications

### 1. `response_count`

**Description:** Fires when a survey's cumulative response count crosses a threshold.
**Evaluator:** Backend scheduler (every 30 seconds)
**Config:**
```json
{ "threshold": 500, "direction": "above" }
```
**Cooldown behavior:** After firing at 500, will not re-fire unless `direction` condition resets (i.e., responses drop below threshold, then rise above again — only possible if responses are deleted, which is rare). Effectively a one-shot trigger per threshold crossing. Cooldown set to 7 days minimum to prevent accidental double-fire.

**Implementation note:** Evaluated via `SELECT COUNT(*) FROM responses WHERE survey_id = $1 AND deleted_at IS NULL`.

---

### 2. `response_rate_drop`

**Description:** Fires when the response submission rate (responses per hour) drops below a percentage of the prior rolling average.
**Evaluator:** Backend scheduler
**Config:**
```json
{ "threshold_pct": 50, "window_hours": 6, "baseline_hours": 24 }
```
**Logic:** Compute `rate_now = responses in last window_hours`. Compute `rate_baseline = responses in prior baseline_hours / (baseline_hours / window_hours)`. Fire if `rate_now < rate_baseline * (threshold_pct / 100)`.

**Use case:** "Alert me when our daily email survey's response rate drops by more than 50% vs. its 24-hour baseline." Catches email delivery failures, link rot, survey fatigue.

---

### 3. `nps_threshold`

**Description:** Fires when rolling NPS score crosses a threshold in a given direction.
**Evaluator:** Backend scheduler
**Config:**
```json
{ "threshold": 30, "direction": "below", "window_hours": 24 }
```
**Logic:** NPS = `((promoters - detractors) / total) * 100`, computed over `window_hours`. Fire when `current_nps < threshold` (direction=below) or `current_nps > threshold` (direction=above).

**Hysteresis rule:** Once fired for a "below" crossing, will not re-fire until NPS rises above `threshold + 5` (a 5-point recovery buffer) and then drops again. This prevents chattery alerts when NPS oscillates around the threshold.

**Implementation note:** Promoters = score 9-10, Passives = 7-8, Detractors = 0-6.

---

### 4. `sentiment_spike` (AI Trigger — CrystalOS)

**Description:** Fires when Crystal detects a significant shift in sentiment distribution across open-text responses.
**Evaluator:** CrystalOS (emits `workflow_signal` event after insight pipeline run)
**Config:**
```json
{ "direction": "negative", "delta_pct": 15, "window_hours": 48, "min_response_count": 20 }
```
**Logic:** CrystalOS computes rolling sentiment distribution (positive/neutral/negative %) over `window_hours`. Fire if `negative_pct` increased by more than `delta_pct` relative to the prior equivalent window. `min_response_count` prevents false positives on sparse data.

**Signal contract:** CrystalOS emits:
```json
{
  "signal_type": "sentiment_spike",
  "survey_id": "uuid",
  "org_id": "uuid",
  "confidence": 0.91,
  "payload": {
    "direction": "negative",
    "current_negative_pct": 38,
    "prior_negative_pct": 21,
    "delta_pct": 17,
    "window_hours": 48,
    "sample_verbatims": ["...", "...", "..."]
  },
  "signal_evidence": {
    "sample_verbatims": [
      {
        "respondent_id_hash": "sha256_of_respondent_id",
        "submitted_at": "2026-06-29T02:14:00Z",
        "text": "The checkout process is incredibly confusing...",
        "sentiment": "negative",
        "response_id": "uuid"
      }
    ],
    "contributing_response_ids": ["uuid1", "uuid2"],
    "contributing_response_count": 47
  },
  "emitted_at": "2026-06-29T14:30:00Z"
}
```

---

### 5. `new_theme_detected` (AI Trigger — CrystalOS)

**Description:** Fires when Crystal identifies a new recurring topic that was not present in the prior analysis window.
**Evaluator:** CrystalOS
**Config:**
```json
{ "min_response_count": 5, "confidence_threshold": 0.85, "novelty_threshold": 0.70 }
```
**Logic:** CrystalOS maintains a theme registry per survey. After each insight pipeline run, new themes are scored for novelty vs. the prior registry. Themes above `novelty_threshold` and `confidence_threshold` with `>= min_response_count` supporting responses trigger a `new_theme_detected` signal.

**Use case:** "Alert me whenever a new complaint category appears in my product feedback survey." Catches emerging issues before they become viral.

---

### 6. `schedule`

**Description:** Time-based cron trigger.
**Evaluator:** Backend scheduler (validates cron expression on create; scheduler checks cron match on each tick)
**Config:**
```json
{ "cron": "0 9 * * 1", "timezone": "America/Chicago" }
```
**Valid cron:** Standard 5-field cron (minute, hour, day, month, weekday). Timezone is required — UTC is the fallback only if not specified. Maximum granularity: every 15 minutes (prevent abuse).

---

### 7. `manual`

**Description:** No automatic evaluation. Fires only when explicitly triggered via API or UI button.
**Config:** `{}`
**Use case:** "Quarterly business review report" — CX manager hits a button to fire a Crystal deep-dive analysis + email report to the leadership team.

---

### 8. `survey_lifecycle`

**Description:** Fires on survey status transitions.
**Evaluator:** Backend (hooked directly into survey update endpoint, not scheduler)
**Config:**
```json
{ "event": "published" | "paused" | "closed" }
```
**Implementation note:** The survey `PATCH /api/surveys/:id` endpoint checks for any enabled workflows with `trigger_type = 'survey_lifecycle'` and matching `scope_survey_id` after writing the status change.

---

### 9. `response_submitted`

**Description:** Fires on every new response submission. Supports embedded data filtering.
**Evaluator:** Backend (hooked into response submission endpoint, not scheduler)
**Config:**
```json
{
  "filter": {
    "embedded_data": { "channel": "mobile", "region": "APAC" },
    "nps_score_lt": 7
  }
}
```
**Performance note:** This trigger type is high-frequency. Condition evaluation is synchronous within the response submission request only if `filter` matches are fast (embedded data lookups). Actual action execution is always async via BullMQ.

**Rate limiting:** Maximum 1 workflow of this type per survey to prevent runaway action storms on high-volume surveys.

---

### 10. `anomaly_detected` (AI Trigger — CrystalOS)

**Description:** Fires when Crystal detects a statistically significant anomaly in a key metric.
**Evaluator:** CrystalOS
**Config:**
```json
{ "metric": "nps" | "csat" | "response_rate", "sigma": 2.0 }
```
**Logic:** CrystalOS maintains rolling statistics (mean, stddev) per metric per survey. Fires when the current value deviates by more than `sigma` standard deviations from the rolling mean (3-month lookback). This is different from `nps_threshold` — it's anomaly detection, not a fixed threshold.

---

## Action Type Specifications

### 1. `send_email`

Delivers HTML email to one or more addresses using the Xperiq transactional email service (SendGrid or Resend). Template variables are resolved at execution time from the trigger payload and survey context. Supports `{{survey.name}}`, `{{trigger.nps_score}}`, `{{crystal.summary}}`, `{{org.name}}`, `{{run.id}}`.

**Failure handling:** If SMTP delivery fails, retries 3x with exponential backoff (10s, 30s, 90s). After 3 failures, moves to DLQ.

---

### 2. `slack_notification`

Posts a message to a Slack channel or DM via incoming webhook or Slack API (bot token). Supports Slack Block Kit for rich formatting. Template variables supported in all text fields. The default template includes survey name, metric value, and a "View Survey" button with deep link.

**Auth:** Org-level Slack integration stored in `integrations` table (encrypted webhook URL or bot token). Multiple Slack workspace integrations supported per org.

---

### 3. `webhook`

POSTs a JSON payload to an external URL. Payload is a Jinja2-style template resolved against the trigger context. Request is signed with HMAC-SHA256 using an org-specific secret (`X-Xperiq-Signature` header). Supports custom headers. `Content-Type: application/json` always.

**Failure handling:** 4xx responses (except 429) are not retried (they indicate a client error in the receiving system). 5xx and 429 are retried with backoff.

---

### 4. `create_jira_ticket`

Creates an issue in a configured Jira Cloud project using the Jira REST API v3. Supports field mapping: summary, description (Markdown), priority, issue type, assignee, labels. Description template supports Crystal analysis output if a `crystal_analysis` action preceded this one in the action chain.

**Auth:** Per-org Jira integration (API token + email, or OAuth 2.0). Stored encrypted.

---

### 5. `create_zendesk_ticket`

Creates a ticket in Zendesk Support via the Zendesk API. Supports subject, body, tags, priority (low/normal/high/urgent), requester email, and custom field mapping.

**Auth:** Per-org Zendesk integration (API token + subdomain). Stored encrypted.

---

### 6. `generate_report`

Triggers an immediate report generation job (normally scheduled). Supported report types: `nps_trend`, `sentiment_breakdown`, `response_volume`, `theme_summary`. Report is emailed to the configured recipient list and attached to the `WorkflowRunStep` response payload as a download URL.

---

### 7. `pause_survey` / 8. `close_survey`

Mutates survey status via the backend survey update endpoint. Audit trail records the workflow run ID as the initiator. The survey's `pause_reason` / `close_reason` field records `"Auto-paused by workflow: {workflow.name}"`.

---

### 9. `crystal_analysis`

Dispatches an on-demand Crystal deep-dive analysis job to CrystalOS. Supported types: `theme_extraction`, `sentiment_deep_dive`, `verbatim_summary`. The result is attached to the `WorkflowRun` record and is available in subsequent action templates as `{{crystal.summary}}`, `{{crystal.themes}}`, `{{crystal.top_verbatims}}`.

**Implementation note:** This action blocks the action chain until Crystal responds (with a 90-second timeout) OR completes asynchronously and the chain continues with a placeholder. The synchronous path is preferred for accuracy; the async path is the fallback. Config field `wait_for_result: true | false`.

---

### 10. `notify_in_app`

Writes a notification record to the `notifications` table and pushes a server-sent event (SSE) to connected browser clients for the org. The frontend notification center subscribes to the SSE stream and renders new notifications immediately.

---

## Execution Engine

### Scheduler Architecture

```
Backend process (Node.js, runs alongside Express)
│
├── WorkflowScheduler (setInterval, 30s)
│   ├── Fetches all enabled workflows with scheduler-evaluated triggers
│   │   (response_count, response_rate_drop, nps_threshold, schedule)
│   ├── Evaluates each trigger against current metric state
│   ├── For passing triggers: enqueues TriggerEvaluationJob to Bull
│   └── Updates workflow.cooldown_until on fire
│
└── BullMQ Queue: "workflow-triggers"
    └── Worker: TriggerWorker
        ├── Evaluates conditions (workflow_conditions table)
        ├── If all conditions pass: creates WorkflowRun record
        ├── Enqueues ActionExecutionJobs (one per action, ordered) to Bull
        └── Updates WorkflowRun.status = 'running'

BullMQ Queue: "workflow-actions"
└── Worker: ActionWorker
    ├── Reads WorkflowRunStep config (with variable resolution)
    ├── Executes action (email, Slack, webhook, etc.)
    ├── Writes WorkflowRunStep result (success / failure + response payload)
    └── If last action in run: updates WorkflowRun.status = 'completed' | 'failed' | 'partial_failure'
```

### CrystalOS AI Trigger Path

```
CrystalOS Insight Pipeline (after each run)
│
├── Evaluates AI trigger conditions:
│   - sentiment_spike: compare rolling sentiment distributions
│   - new_theme_detected: diff theme registry against new themes
│   - anomaly_detected: compute z-score against rolling statistics
│
├── For each detected signal above confidence threshold:
│   └── POST /api/internal/workflow-signals (X-Internal-Key header)
│       Body: { signal_type, survey_id, org_id, confidence, payload }
│
Backend: /api/internal/workflow-signals
├── Finds all enabled workflows matching signal_type + scope
├── Applies signal to trigger condition evaluation
└── Enqueues TriggerEvaluationJob (same Bull queue as scheduler path)
```

### BullMQ Configuration

```typescript
// Queue definitions
const triggerQueue = new Queue('workflow-triggers', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10_000, // 10s, 30s, 90s
    },
    removeOnComplete: { age: 86400 * 7 }, // keep 7 days
    removeOnFail: false, // keep failed jobs for DLQ inspection
  },
});

const actionQueue = new Queue('workflow-actions', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000, // 5s, 15s, 45s
    },
    removeOnComplete: { age: 86400 * 3 },
    removeOnFail: false,
  },
});

// DLQ: failed jobs remain in Bull's failed set.
// A separate DlqMonitor process polls Bull failed set every 5 minutes
// and writes to a dead_letter_items table + fires an alert if depth > 10.
```

### Idempotency

Idempotency key format: `{workflow_id}:{trigger_type}:{event_fingerprint}`

Event fingerprint is computed deterministically:
- `response_count`: `sha256("{survey_id}:{threshold}:{current_count_bucket}")` where `current_count_bucket = floor(count / threshold)` — this ensures only one fire per threshold crossing, not per response
- `nps_threshold`: `sha256("{survey_id}:{threshold}:{window_hours}:{date_bucket}")` where `date_bucket = floor(unix_timestamp / (window_hours * 3600))`
- `schedule`: `sha256("{workflow_id}:{cron_fire_time_utc}")` where `cron_fire_time_utc` is the exact scheduled minute
- `response_submitted`: `sha256("{workflow_id}:{response_id}")`
- `crystalos` signals: the signal's `emitted_at` rounded to the nearest minute + signal content hash

The `workflow_runs.idempotency_key` column has a UNIQUE constraint. Duplicate jobs that arrive via the queue simply fail on INSERT and are silently dropped (this is the correct behavior — the first execution won).

---

## Natural Language Workflow Creation (Crystal Builder)

### Flow

```
User types: "When our NPS drops below 30, alert #cx-alerts on Slack with a summary"
                           │
                    Crystal Builder (CrystalOS)
                           │
                    LangGraph subgraph: nl_to_workflow
                           │
                    Structured output: WorkflowSpec
                    {
                      "name": "NPS Drop Alert",
                      "trigger_type": "nps_threshold",
                      "trigger_config": { "threshold": 30, "direction": "below", "window_hours": 24 },
                      "conditions": [],
                      "actions": [
                        {
                          "action_type": "slack_notification",
                          "action_config": {
                            "channel": "#cx-alerts",
                            "message": "NPS Alert: *{{survey.name}}* dropped to *{{trigger.nps_score}}*\n>{{crystal.summary}}"
                          }
                        }
                      ]
                    }
                           │
                    action_proposal type: "create_workflow"
                    Rendered as confirm-card in frontend:
                    ┌────────────────────────────────────────┐
                    │ Create Workflow: "NPS Drop Alert"       │
                    │                                        │
                    │ TRIGGER: NPS drops below 30           │
                    │           (rolling 24h window)         │
                    │                                        │
                    │ ACTION:  Slack → #cx-alerts            │
                    │          "NPS Alert: {survey} at {NPS}"│
                    │                                        │
                    │  [Confirm]          [Edit in Builder]  │
                    └────────────────────────────────────────┘
                           │
                    User confirms → POST /api/workflows
                    User clicks "Edit in Builder" → builder pre-populated with spec
```

### LangGraph Subgraph: `nl_to_workflow`

```python
# crystalos/skills/workflow/nl_to_workflow.py

class WorkflowSpec(BaseModel):
    name: str
    description: Optional[str]
    trigger_type: TriggerType
    trigger_config: dict
    conditions: List[ConditionSpec]
    actions: List[ActionSpec]
    confidence: float  # 0.0 - 1.0, how confident Crystal is in the parse

class NlToWorkflowState(TypedDict):
    user_input: str
    org_context: OrgContext        # available integrations, survey list
    parsed_spec: Optional[WorkflowSpec]
    ambiguities: List[str]         # questions Crystal needs to ask before confirming
    clarification_needed: bool

# Graph nodes:
# 1. parse_intent: extract trigger + actions from NL
# 2. resolve_ambiguity: if channel "#cx-alerts" not found in org's Slack integration, flag it
# 3. fill_defaults: apply sensible defaults (window_hours=24 for nps_threshold, etc.)
# 4. validate_spec: check against available integrations and action type constraints
# 5. emit_proposal: format as action_proposal for frontend confirm-card
```

---

## API Design

All endpoints require `Authorization: Bearer {clerk_jwt}`. All writes are org-scoped.

### `GET /api/workflows`

Query params:
- `survey_id` — filter to workflows scoped to this survey
- `scope_type` — `survey | tag_group | org`
- `status` — `enabled | disabled | error | cooldown`
- `trigger_type` — filter by trigger type
- `page`, `limit` (default 20, max 100)

Response: `{ workflows: WorkflowSummary[], total: number, page: number }`

---

### `POST /api/workflows`

Body: `CreateWorkflowRequest`
```typescript
{
  name: string;
  description?: string;
  scope_type: 'survey' | 'tag_group' | 'org';
  scope_survey_id?: string;
  scope_tag?: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  conditions?: ConditionInput[];
  actions: ActionInput[];
  cooldown_minutes?: number;
  tags?: string[];
}
```

Validation:
- `trigger_config` is validated against a per-trigger-type JSON schema
- `action_config` is validated against a per-action-type JSON schema
- Integration IDs in action configs are verified to exist and belong to the org
- `scope_survey_id` verified to belong to the org
- Maximum 10 actions per workflow (Growth tier), 3 (Starter), 1 (Free) — enforced by plan middleware

Response: `201 Created` with full `Workflow` object.

---

### `GET /api/workflows/:id`

Response: Full `Workflow` with `conditions[]`, `actions[]`, and the 5 most recent `runs[]`.

---

### `PUT /api/workflows/:id`

Same body as POST. Creates a new version. Previous version is stored in `version_history`. Cannot update `scope_type` or `scope_survey_id` after creation.

Response: Updated `Workflow` with incremented `version`.

---

### `DELETE /api/workflows/:id`

Soft delete: sets `deleted_at`. Any in-flight runs complete normally. New runs will not be created.

---

### `POST /api/workflows/:id/enable` / `POST /api/workflows/:id/disable`

Transitions `status` to `enabled` or `disabled`. `enable` returns 400 if workflow has validation errors (e.g., referenced integration credential was deleted).

---

### `POST /api/workflows/:id/test`

Dry run. Accepts an optional `trigger_payload` body to simulate a specific trigger event. Evaluates conditions and renders all action configs with variable substitution. Returns a full `WorkflowRun` with `status = 'dry_run'` and all `WorkflowRunStep` records with `status = 'dry_run'`. No side effects are executed.

Body:
```typescript
{
  trigger_payload?: Record<string, unknown>;  // override trigger context for testing
  simulate_crystal?: {
    sentiment_score?: number;
    summary?: string;
    themes?: string[];
  };
}
```

---

### `GET /api/workflows/:id/runs`

Query params: `status`, `page`, `limit`, `from`, `to` (date range)
Response: `{ runs: WorkflowRunSummary[], total: number }`

---

### `GET /api/workflows/:id/runs/:runId`

Response: Full `WorkflowRun` with all `WorkflowRunStep` records, rendered configs, response payloads.

---

### `POST /api/workflows/:id/runs/:runId/retry`

Retries a failed `WorkflowRun` from the first failed step. Creates a new `WorkflowRun` with `attempt_count = original.attempt_count + 1`. Idempotency key is reused (the retry is not a new firing — it's a re-execution of an existing firing). Only callable on runs with `status = 'failed'`.

---

### `POST /api/workflows/:id/runs/:runId/recommendations/:recIndex/outcome`

Records a user's response to a recommendation (acted on, dismissed, snoozed).

Body:
```typescript
{
  action: 'acted_on' | 'dismissed' | 'snoozed' | 'undismissed';
  acted_on_at?: string;    // ISO 8601, required for acted_on
  snooze_until?: string;   // ISO 8601, required for snoozed
}
```

Response: `200 OK` with the `recommendation_outcomes` row. Returns `404` if the run or recommendation index doesn't exist. Returns `409` if an outcome already exists for this run+index (use `undismissed` to undo a dismiss).

---

### Internal API (CrystalOS → Backend)

### `POST /api/internal/workflow-signals`

Header: `X-Internal-Key: {INTERNAL_API_KEY}`

Body:
```typescript
{
  signal_type: 'sentiment_spike' | 'new_theme_detected' | 'anomaly_detected';
  survey_id: string;
  org_id: string;
  confidence: number;
  payload: Record<string, unknown>;
  emitted_at: string; // ISO 8601
}
```

The backend finds all matching enabled workflows and enqueues trigger evaluation jobs. Returns `202 Accepted` immediately.

---

## Schema Changes Summary (v2.1 Gap Fixes)

| Change | What | Where |
|---|---|---|
| Fix 1 | Add `signal_evidence` object to CrystalOS signal payload | `crystalos/skills/workflow/signal_emitter.py` |
| Fix 2 | Add `evidence` array to `recommendations[]` in briefing payload | `crystalos/skills/workflow/briefing_generator.py` |
| Fix 3 | `POST /api/workflows/crystal-build` can now return `ambiguities[]` | `backend/src/routes/workflows.ts` |
| Fix 4 | `generate_briefing` action_config: `tone` → `audience` field | `backend/src/types/workflow.ts` + migration script |
| Fix 5 | New `recommendation_outcomes` table + `POST .../recommendations/:idx/outcome` endpoint | Migration + new route |

---

## Environment Variables

New vars required (add to `backend/.env.example` and `docs/ENV_VARS.md`):

```bash
# Workflow Action Delivery
SENDGRID_API_KEY=             # or RESEND_API_KEY — for send_email action
WORKFLOW_EMAIL_FROM=noreply@xperiq.com

# Workflow Encryption
INTEGRATION_SECRET_KEY=       # AES-256 key for encrypting stored integration credentials

# Internal API
INTERNAL_API_KEY=             # shared secret between CrystalOS and backend for workflow signals

# Queue
REDIS_URL=redis://localhost:6379  # already present — workflows use same Redis
```

---

## Monitoring

Grafana dashboard: `Xperiq Actions — Execution Health`

Panels:
- Queue depth: `workflow-triggers` and `workflow-actions` (alert if > 500)
- Execution latency p50/p95/p99 (alert if p95 > 10s)
- Action success rate by action_type (alert if any type drops below 95%)
- DLQ depth (alert if > 10)
- AI trigger signal volume per signal_type per day
- Workflow fire rate per org (detect runaway trigger loops)

All metrics are emitted as Prometheus counters/histograms from the BullMQ workers and exposed on the backend's `/metrics` endpoint.
