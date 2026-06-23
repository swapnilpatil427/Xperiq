# Workflow System — Design Document

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Design  
**Team:** Marcus Johnson (Staff Engineer, workflow engines), Aiko Yamamoto (UX Lead, no-code), Ben Carter (Backend Engineer), Diana Osei (Frontend Engineer), Dr. Felix Nguyen (Applied Scientist), Valentina Cruz (XM Expert, closed-loop), Patricia Holloway (Enterprise Customer, CX Operations Director), Emma Thompson (Platform Expert), Theo Larsson (Crystal AI Lead), Nadia Okafor (Product)

---

## Table of Contents

1. [Executive Vision](#1-executive-vision)
2. [What is the Workflow System](#2-what-is-the-workflow-system)
3. [Complete Trigger Taxonomy](#3-complete-trigger-taxonomy)
4. [Complete Condition Taxonomy](#4-complete-condition-taxonomy)
5. [Complete Action Taxonomy](#5-complete-action-taxonomy)
6. [Visual Workflow Builder UX](#6-visual-workflow-builder-ux)
7. [Backend Architecture](#7-backend-architecture)
8. [Database Schema](#8-database-schema)
9. [Backend API Design](#9-backend-api-design)
10. [Crystal AI Workflow Integration](#10-crystal-ai-workflow-integration)
11. [Integration Connectors](#11-integration-connectors)
12. [Variable System & Templating](#12-variable-system--templating)
13. [Audit & Compliance](#13-audit--compliance)
14. [Pre-Built Workflow Templates](#14-pre-built-workflow-templates)
15. [Competitive Positioning](#15-competitive-positioning)
16. [Implementation Roadmap](#16-implementation-roadmap)

---

## 1. Executive Vision

### The Problem

> **Patricia Holloway (CX Operations Director, insurance company):** "Right now, when NPS drops, my manual process takes 4 hours: I check the dashboard, dig into verbatims, figure out which segment was affected, Slack my team lead, they create a Jira ticket, I schedule a review meeting, and we send an email to the affected customers. By then, 2 days have passed and the damage is done. I need this entire chain to happen automatically in 5 minutes."

> **Valentina Cruz (XM Expert):** "Closed-loop action is the most consistently under-delivered promise in experience management. Every platform says 'insights to action' — but the action part still requires manual work. Workflow automation is how you close the loop without hiring 10 more analysts."

### The Vision

**"Workflows turn Crystal's intelligence into operational reality. Every insight fires an action. Every alert closes a loop. Every threshold triggers a response."**

The Workflow System lets Experient users build automated programs that:
- React to any experience data event (response received, score changed, Crystal detected something)
- Apply intelligence at every step (Crystal can be a decision-maker, not just a data source)
- Connect to the tools teams already use (Slack, Jira, Salesforce, email)
- Run automatically — 24/7, without human intervention

### Example Workflows Patricia Would Build

1. **NPS Recovery**: *"When NPS drops below 30 → Crystal analyzes root cause → Slack my team with Crystal's explanation → Create Jira ticket for product → Email affected respondents apology"*

2. **Executive Weekly Brief**: *"Every Monday 8am → Crystal generates weekly intelligence summary → Email to VP list → Post to #cx-leadership Slack channel"*

3. **Verbatim Escalation**: *"When a verbatim contains 'lawsuit' or 'dangerous' → Crystal classifies severity → If critical: page on-call via PagerDuty → Create Jira P1 ticket"*

4. **Survey Closure Report**: *"When survey reaches 1000 responses → Crystal generates full analysis → PDF report emailed to stakeholders → Archive survey"*

---

## 2. What is the Workflow System

A **no-code visual workflow builder** where users assemble automated pipelines from:

| Building Block | What it does | Examples |
|----------------|-------------|---------|
| **Trigger** | What starts the workflow | Score dropped, survey milestone, schedule |
| **Condition** | Filter when to proceed | Only if NPS < 30, only if mobile segment |
| **Action** | What happens | Send Slack, create Jira, run Crystal |
| **Branch** | Conditional routing | If severity=critical → route A, else → route B |
| **Delay** | Pause before continuing | Wait 24h before sending follow-up |
| **Crystal AI** | Intelligence at any step | Crystal analyzes, narrates, classifies, decides |

Workflows are visual graphs on a canvas. Each node is a step. Arrows show flow direction. No code required.

---

## 3. Complete Trigger Taxonomy

### 3.1 Survey Triggers

| Trigger | Description | Key Config |
|---------|-------------|-----------|
| `survey.response_received` | Any new response submitted | Can filter: specific survey, score range, segment |
| `survey.milestone_reached` | Response count crosses milestone | Milestones: 25, 50, 100, 250, 500, 1000, custom |
| `survey.response_rate_low` | Response rate drops below threshold | Threshold %, check frequency |
| `survey.completion_rate_low` | Respondents abandoning mid-survey | Threshold %, question dropout point |
| `survey.published` | Survey goes live | Any survey or specific tag |
| `survey.closed` | Survey reaches end date | Any survey or specific |
| `survey.expiring_soon` | Close date approaching | Hours before: 72, 48, 24, custom |
| `survey.quota_reached` | Target response count reached | Per survey quota config |
| `survey.response_filtered` | Response matching criteria received | Complex filter expression |

**`survey.response_filtered` — the power trigger:**
Fires only when an incoming response meets user-configured criteria:
- NPS score ≤ 6 (detractor)
- Contains keyword "cancel"
- From segment "Enterprise tier"
- Completion time < 30 seconds (speed-run, low quality)
- Specific embedded data value matches

### 3.2 Score & Metric Triggers

| Trigger | Description |
|---------|-------------|
| `score.nps_drop` | NPS falls by N points vs rolling window |
| `score.nps_rise` | NPS rises by N points |
| `score.nps_threshold` | NPS crosses absolute threshold |
| `score.csat_drop` | CSAT falls below threshold |
| `score.ces_spike` | CES rises above threshold |
| `score.anomaly` | Crystal detects statistical anomaly |

### 3.3 Crystal AI Triggers

| Trigger | Description |
|---------|-------------|
| `crystal.insight_ready` | Crystal completes insight generation |
| `crystal.anomaly_detected` | Crystal finds statistical anomaly |
| `crystal.topic_emerged` | Crystal detects new topic cluster |
| `crystal.prediction_alert` | Crystal's predictive model fires |
| `crystal.cross_survey_correlation` | Crystal correlates across programs |
| `crystal.verbatim_escalation` | Crystal flags high-urgency verbatim |

### 3.4 Alert Triggers

| Trigger | Description |
|---------|-------------|
| `alert.fired` | Any alert fires (optionally filtered by type/severity) |
| `alert.acknowledged` | Alert marked acknowledged |
| `alert.resolved` | Alert marked resolved |
| `alert.snoozed` | Alert snoozed |

### 3.5 Time Triggers

| Trigger | Description | Examples |
|---------|-------------|---------|
| `time.schedule` | Cron-based schedule | Every Monday 8am, 1st of month |
| `time.relative` | Relative to event | 24h after survey sent, 1 week after response |
| `time.date` | Specific date/time | Survey close date, campaign end date |

### 3.6 External Triggers

| Trigger | Description |
|---------|-------------|
| `external.webhook` | HTTP POST received at workflow webhook URL |
| `external.api` | Programmatic trigger via API |

---

## 4. Complete Condition Taxonomy

Conditions filter whether the workflow should proceed after a trigger fires.

### 4.1 Score Conditions

```
NPS score           is / is not / is greater than / is less than / is between    [value]
CSAT score          is / is not / is greater than / is less than                 [value]
Score changed       increased by / decreased by / changed by more than           [N points]
Response count      is greater than / is less than / equals                      [N]
Response rate       is greater than / is less than                               [%]
```

### 4.2 Verbatim / Text Conditions

```
Response text       contains / does not contain                [keyword or phrase]
Response text       matches regex                              [pattern]
Crystal sentiment   is / is not                               [positive/neutral/negative]
Crystal topic       includes / does not include               [topic name]
Crystal confidence  is greater than                           [0.0–1.0]
```

### 4.3 Segment / Respondent Conditions

```
Embedded data       [field name] equals / contains / starts with / is in list   [value]
Device type         equals                                    [mobile/desktop/tablet]
Channel             equals                                    [email/QR/link/kiosk]
Respondent tier     equals / is in                            [Gold/Silver/Bronze]
Response language   equals / is in                            [en/es/fr/...]
Completion time     greater than / less than                  [seconds]
```

### 4.4 Date / Time Conditions

```
Time of day         is between                                [start time] and [end time]
Day of week         is                                        [Mon/Tue/.../Sat/Sun]
Date                is after / before / between               [dates]
```

### 4.5 Logic Operators

Conditions can be combined with:
- **AND** — all conditions must match
- **OR** — any condition matches
- **NOT** — condition must not match
- **Groups** — nest conditions: `(A AND B) OR (C AND D)`

### 4.6 Crystal AI Conditions

```
Crystal severity classification    is          [low/medium/high/critical]
Crystal topic classification       includes    [topic name or category]
Crystal churn risk                 exceeds     [probability threshold]
Crystal anomaly score              exceeds     [Z-score threshold]
Crystal's recommended action       is          [specific action type]
```

---

## 5. Complete Action Taxonomy

### 5.1 Notification Actions

| Action | Config | Crystal support |
|--------|--------|----------------|
| `notify.in_app` | Message, recipients, priority | Crystal can write the message body |
| `notify.email` | Template, recipients, subject, body | Crystal-generated body |
| `notify.slack` | Workspace, channel, message | Crystal-formatted Block Kit message |
| `notify.teams` | Team, channel, adaptive card | Crystal-formatted card |
| `notify.sms` | Phone number(s), message | Crystal-written message |
| `notify.webhook` | URL, method, headers, payload | Crystal-generated payload fields |
| `notify.pagerduty` | Service key, severity, description | Crystal-written description |

### 5.2 Crystal AI Actions

| Action | What Crystal does |
|--------|-----------------|
| `crystal.analyze` | Run full insight analysis on trigger survey |
| `crystal.summarize` | Generate N-sentence summary of trigger data |
| `crystal.classify` | Classify trigger into category (severity, topic, sentiment) |
| `crystal.ask` | Ask Crystal a specific question about the data |
| `crystal.generate_report` | Generate PDF/PPTX report |
| `crystal.generate_chart` | Generate a specific visualization |
| `crystal.write` | Crystal writes content (email body, Jira description, Slack message) |
| `crystal.decide` | Crystal returns a decision used by downstream If/Else branch |

### 5.3 Data Actions

| Action | Description |
|--------|-------------|
| `data.tag_responses` | Add tag to responses matching filter |
| `data.export_csv` | Export filtered data to CSV, save to org storage |
| `data.update_metadata` | Update embedded data on response |
| `data.archive_survey` | Archive a survey |
| `data.add_to_watchlist` | Flag response for review |
| `data.create_insight` | Create a manual insight record |

### 5.4 Integration Actions

| Action | Description |
|--------|-------------|
| `jira.create_issue` | Create Jira issue with Crystal-written description |
| `jira.update_issue` | Update existing Jira issue |
| `jira.add_comment` | Add comment to issue |
| `servicenow.create_incident` | Create ServiceNow incident |
| `salesforce.update_contact` | Update CRM record |
| `hubspot.create_task` | Create HubSpot task |
| `asana.create_task` | Create Asana task |
| `sheets.append_row` | Append data row to Google Sheet |
| `zapier.trigger` | Fire a Zapier webhook |

### 5.5 Flow Control Actions

| Action | Description |
|--------|-------------|
| `flow.delay` | Pause for N hours/days before continuing |
| `flow.wait_until` | Wait until a condition becomes true |
| `flow.if_else` | Branch based on condition (Crystal output or data field) |
| `flow.switch` | Multi-branch routing (like switch/case) |
| `flow.parallel` | Run multiple branches simultaneously |
| `flow.merge` | Wait for all parallel branches to complete |
| `flow.trigger_workflow` | Start another workflow (chaining) |
| `flow.stop` | Terminate workflow execution |

---

## 6. Visual Workflow Builder UX

### 6.1 Canvas Layout

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Workflows   NPS Recovery Automation           [Active ●] [Save] [Run▶] │
├─────────────┬─────────────────────────────────────────────────────────────┤
│ NODE LIBRARY│                                                             │
│             │   CANVAS                                                    │
│ 🔵 TRIGGERS │                                                             │
│  Survey     │  ┌─────────────┐                                           │
│  Score      │  │ 🔵 TRIGGER  │                                           │
│  Crystal    │  │ Score: NPS  │                                           │
│  Schedule   │  │ Drop ≥5pts  │                                           │
│  Webhook    │  └──────┬──────┘                                           │
│             │         │                                                   │
│ 🟡 CONDITIONS│        ▼                                                   │
│  Filter     │  ┌─────────────┐    ┌──────────────────────────────────┐  │
│  Segment    │  │ 🟡 CONDITION│    │ 🟡 CONDITION                     │  │
│  Crystal    │  │ IF NPS < 30 │    │ IF NPS 30–40                     │  │
│             │  └──────┬──────┘    └──────────────┬───────────────────┘  │
│ 🟢 ACTIONS  │         │                           │                       │
│  Notify     │         ▼                           ▼                       │
│  Crystal    │  ┌──────────────┐          ┌──────────────┐                │
│  Integrate  │  │ 🤖 CRYSTAL  │          │ 📧 EMAIL     │                │
│  Data       │  │ Analyze +   │          │ Weekly digest│                │
│             │  │ Summarize   │          │ to managers  │                │
│ 🔶 FLOW     │  └──────┬──────┘          └──────────────┘                │
│  If/Else    │         │                                                   │
│  Delay      │         ▼                                                   │
│  Parallel   │  ┌──────────────┐   ┌──────────────┐                      │
│  Merge      │  │ 💬 SLACK    │   │ 🎫 JIRA      │                      │
│             │  │ #cx-alerts  │   │ Create P1    │                      │
│             │  └──────────────┘   └──────────────┘                      │
│             │         ↑ parallel steps ↑                                 │
└─────────────┴─────────────────────────────────────────────────────────────┘
```

### 6.2 Node Design

Each node is a card on the canvas:

```
TRIGGER NODE:
┌─────────────────────────────────┐
│ 🔵 Score Trigger           [⚙] │
│ ─────────────────────────────── │
│ NPS drops by ≥ 5 points         │
│ over 7-day rolling window       │
│ Survey: All surveys             │
│                                 │
│ Status: ✓ Configured            │
└──────────────────┬──────────────┘
                   ↓ (output port)

ACTION NODE (with Crystal):
┌─────────────────────────────────┐
│ 🤖 Crystal Action          [⚙] │
│ ─────────────────────────────── │
│ Task: Analyze + Summarize       │
│ Output: {{crystal.summary}}     │
│         {{crystal.severity}}    │
│         {{crystal.top_causes}}  │
│                                 │
│ Status: ✓ Configured            │
└──────────────────┬──────────────┘
                   ↓

SLACK ACTION NODE:
┌─────────────────────────────────┐
│ 💬 Slack Message           [⚙] │
│ ─────────────────────────────── │
│ Channel: #cx-alerts             │
│ Message: "🚨 NPS Alert:         │
│ {{crystal.summary}}"            │
│                                 │
│ Status: ✓ Configured            │
└─────────────────────────────────┘
```

Node states:
- **Unconfigured** (gray): needs setup
- **Configured** (checkmark): ready to run
- **Error** (red border): config issue
- **Running** (pulsing blue): actively executing
- **Success** (green): last run succeeded
- **Failed** (red): last run failed

### 6.3 Node Configuration Panel

Clicking a node opens a right-side configuration panel:

```
┌──────────────────────────────────────────────────────┐
│ ← Slack Message Configuration                 [Done] │
├──────────────────────────────────────────────────────┤
│                                                      │
│ WORKSPACE                                            │
│ [Acme Corp Workspace ▾]           [+ Connect new]   │
│                                                      │
│ CHANNEL                                              │
│ [#cx-alerts ▾]                                      │
│                                                      │
│ MESSAGE                                              │
│ ┌────────────────────────────────────────────────┐   │
│ │ 🚨 NPS Alert — {{trigger.survey.name}}         │   │
│ │                                                │   │
│ │ NPS dropped from {{trigger.nps_baseline}} to  │   │
│ │ {{trigger.nps_current}} ({{trigger.nps_change}}│   │
│ │ pts) over the last {{trigger.window_days}} days│   │
│ │                                                │   │
│ │ 🤖 Crystal: {{crystal.summary}}                │   │
│ │                                                │   │
│ │ → {{trigger.dashboard_url}}                    │   │
│ └────────────────────────────────────────────────┘   │
│ [Insert variable ▾]                 Characters: 312  │
│                                                      │
│ SEND AS                                              │
│ [Crystal Bot ▾]                                      │
│                                                      │
│ [Test with sample data]                             │
└──────────────────────────────────────────────────────┘
```

### 6.4 Workflow List View

```
┌───────────────────────────────────────────────────────────────────────┐
│  Workflows                                         [+ New Workflow]   │
├───────────────────────────────────────────────────────────────────────┤
│  [All] [Active (8)] [Paused (2)] [Draft (3)] [Error (1)]  [Search]   │
├───────────────────────────────────────────────────────────────────────┤
│  Name                   Trigger          Last Run    Status  Runs    │
│  ─────────────────────────────────────────────────────────────────── │
│  NPS Recovery           Score drop       Jun 3       ● Active  142   │
│  Weekly Executive Brief Schedule         Jun 2       ● Active  24    │
│  Verbatim Escalation    Response filter  Jun 3       ● Active  8     │
│  Q4 Survey Closure      Survey milestone (never)     ○ Draft   0     │
│  App Crash Alert        Crystal topic    Jun 1       ✕ Error   3     │
│                                           [See error details]        │
│  ─────────────────────────────────────────────────────────────────── │
│  [1] [2] ... [4]                                                     │
└───────────────────────────────────────────────────────────────────────┘
```

### 6.5 Workflow Run History

```
┌───────────────────────────────────────────────────────────────────────┐
│  ← NPS Recovery   Run History                    [Re-run last] [Logs] │
├───────────────────────────────────────────────────────────────────────┤
│  Run #142  Jun 3, 9:14am   ✓ Success   Duration: 8.2s               │
│  ▶ Score Trigger → Crystal Analyze → Slack ✓ → Jira ✓               │
│                                                                       │
│  Run #141  Jun 2, 11:30am  ✓ Success   Duration: 6.8s               │
│  ▶ Score Trigger → Crystal Analyze → Email ✓ (Slack skipped: cond.) │
│                                                                       │
│  Run #140  Jun 1, 3:15pm   ✕ Failed    Duration: 12.1s              │
│  ▶ Score Trigger → Crystal Analyze → Slack ✕ (Slack API error)      │
│                                              [Retry] [View error]    │
└───────────────────────────────────────────────────────────────────────┘
```

### 6.6 Template Gallery

```
┌───────────────────────────────────────────────────────────────────────┐
│  Workflow Templates                      [Browse all] [Filter ▾]      │
├──────────────────────┬───────────────────┬───────────────────────────┤
│ 🔄 CLOSED-LOOP       │ 📊 REPORTING      │ 🚨 ESCALATION             │
│                      │                   │                           │
│ NPS Recovery         │ Weekly Executive  │ Verbatim Escalation       │
│ "Detect detractor,   │ Brief             │ "Legal/safety keyword     │
│  analyze, email"     │ "Monday digest    │  → immediate alert"       │
│ [Use template]       │  for leadership"  │ [Use template]            │
│                      │ [Use template]    │                           │
│ Product Feedback     │                   │ Response Rate             │
│ Routing              │ Monthly Board     │ Recovery                  │
│ "Route to PM inbox"  │ Report            │ "Low rate → send          │
│ [Use template]       │ [Use template]    │  reminder"                │
│                      │                   │ [Use template]            │
└──────────────────────┴───────────────────┴───────────────────────────┘
```

---

## 7. Backend Architecture

### 7.1 Workflow Engine Components

```
┌────────────────────────────────────────────────────────────────────┐
│                      TRIGGER LISTENER                              │
│                                                                    │
│  Redis Streams consumer (for data events)                          │
│  Bull cron jobs (for scheduled triggers)                           │
│  HTTP webhook receiver (for external triggers)                     │
│                                                                    │
│  Matches incoming events to active workflow trigger rules          │
│  Creates workflow_executions record for each match                 │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │ enqueues
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                   EXECUTION ENGINE (Bull Queue)                    │
│                                                                    │
│  Picks up execution jobs from queue                                │
│  Runs workflow graph step by step:                                 │
│    1. Evaluate conditions (pass/fail)                              │
│    2. Execute action (via Action Dispatcher)                       │
│    3. Handle branching (select next node based on output)          │
│    4. Handle delays (schedule next step in queue with delay)       │
│    5. Record each step result (for audit + retry)                  │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │ dispatches to
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                     ACTION DISPATCHER                              │
│                                                                    │
│  notification.executor    → Notification Service API               │
│  crystal.executor         → CrystalOS /api/workflow-action         │
│  slack.executor           → Slack API (Block Kit)                  │
│  email.executor           → SendGrid API                           │
│  jira.executor            → Jira REST API                          │
│  webhook.executor         → HTTP POST to configured URL            │
│  data.executor            → Postgres direct (tag, export, archive) │
│                                                                    │
│  Each executor: idempotency key, retry 3× w/ exp. backoff,        │
│  circuit breaker per integration, dead-letter on failure           │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │ results to
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│              EXECUTION LOGGER (Postgres)                           │
│                                                                    │
│  workflow_executions: one row per execution                        │
│  workflow_step_executions: one row per step per execution          │
│  Full input/output captured for debugging + audit                  │
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 Workflow State Machine

```
[CREATED] → [TRIGGERED] → [EVALUATING] → [EXECUTING_STEPS]
                                                ↓
                                    [WAITING_DELAY or WAITING_CONDITION]
                                                ↓
                                    [COMPLETED / FAILED / TIMED_OUT]
                                         ↓ on failure
                                    [RETRY] → [FAILED_DEAD_LETTER]
```

### 7.3 Reliability Design

**At-least-once delivery:**
- Trigger events from Redis Streams use consumer group + XACK
- Execution jobs in Bull Queue are persistent (Redis-backed)
- Action dispatches have idempotency keys to prevent duplicate actions on retry

**Idempotency keys:**
```javascript
// Each action execution gets a deterministic idempotency key
const idempotencyKey = `wf-${workflowId}-run-${executionId}-step-${stepId}`;

// Slack message: use as X-Idempotency-Key header
// Email: use as Message-ID header
// Jira: check for existing issue with matching key in description
```

**Circuit breaker per integration:**
```javascript
// If Slack is down, open circuit — don't retry immediately
// Other actions in same workflow continue (parallel execution)
// Slack-dependent actions are logged as skipped with reason
```

**Dead letter queue:**
Failed actions after 3 retries go to `workflow_dead_letters` table for manual review/replay.

**Timeouts:**
- Individual action: 30 seconds
- Crystal AI action: 120 seconds (analysis takes longer)
- Maximum workflow duration: 24 hours (workflows with delays can run up to 24h)

---

## 8. Database Schema

```sql
-- Workflow definitions (graph stored as JSONB)
CREATE TABLE workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  
  -- Graph definition
  nodes           JSONB NOT NULL DEFAULT '[]',  -- array of node definitions
  edges           JSONB NOT NULL DEFAULT '[]',  -- array of {from, to} connections
  
  -- Status
  status          VARCHAR(16) NOT NULL DEFAULT 'draft',
  -- draft | active | paused | archived | error
  
  -- Stats
  run_count       INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  last_status     VARCHAR(16),
  
  -- Template reference
  template_id     UUID REFERENCES workflow_templates(id),
  
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  
  CONSTRAINT workflows_status_check CHECK (
    status IN ('draft', 'active', 'paused', 'archived', 'error')
  )
);

CREATE INDEX idx_workflows_org_active ON workflows(org_id, status)
  WHERE status = 'active' AND deleted_at IS NULL;


-- Trigger subscriptions (what events activate each workflow)
CREATE TABLE workflow_triggers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  
  trigger_type    VARCHAR(64) NOT NULL,   -- e.g. 'survey.response_received'
  trigger_config  JSONB NOT NULL DEFAULT '{}',  -- threshold, filter config
  
  -- Subscription state
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- For cron triggers
  cron_expression VARCHAR(64),   -- e.g. '0 8 * * 1' (Mon 8am)
  timezone        VARCHAR(64),
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_triggers_type ON workflow_triggers(trigger_type, is_active)
  WHERE is_active = TRUE;


-- Individual workflow execution records
CREATE TABLE workflow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  -- What triggered this execution
  trigger_type    VARCHAR(64) NOT NULL,
  trigger_payload JSONB NOT NULL DEFAULT '{}',  -- the event data that fired
  
  -- State
  status          VARCHAR(16) NOT NULL DEFAULT 'triggered',
  -- triggered | evaluating | executing | waiting | completed | failed | timed_out
  
  -- Timing
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  
  -- Outputs
  error_message   TEXT,
  output          JSONB DEFAULT '{}',   -- final outputs of workflow
  
  -- Retry tracking
  retry_count     INTEGER NOT NULL DEFAULT 0,
  parent_execution_id  UUID REFERENCES workflow_executions(id),
  
  CONSTRAINT workflow_executions_status_check CHECK (
    status IN ('triggered', 'evaluating', 'executing', 'waiting', 'completed', 'failed', 'timed_out')
  )
);

CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id, triggered_at DESC);
CREATE INDEX idx_workflow_executions_active ON workflow_executions(status, triggered_at)
  WHERE status IN ('triggered', 'evaluating', 'executing', 'waiting');


-- Per-step execution results
CREATE TABLE workflow_step_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    UUID NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES workflows(id),
  
  -- Which node
  node_id         TEXT NOT NULL,          -- the node's ID in the graph JSON
  node_type       VARCHAR(64) NOT NULL,   -- 'trigger', 'condition', 'slack', 'crystal', etc.
  
  -- Execution
  status          VARCHAR(16) NOT NULL DEFAULT 'pending',
  -- pending | running | completed | failed | skipped
  
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  
  -- Data
  input           JSONB DEFAULT '{}',    -- variables available at this step
  output          JSONB DEFAULT '{}',    -- what this step produced
  error_message   TEXT,
  
  -- Retry
  attempt_count   INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT,                  -- for deduplication on retry
  
  UNIQUE(execution_id, node_id, attempt_count)
);

CREATE INDEX idx_workflow_step_executions_execution ON workflow_step_executions(execution_id, started_at);


-- Workflow templates (pre-built)
CREATE TABLE workflow_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name            VARCHAR(255) NOT NULL,
  description     TEXT NOT NULL,
  category        VARCHAR(64),           -- 'closed_loop', 'reporting', 'escalation', etc.
  industry        VARCHAR(64),           -- 'all', 'retail', 'hospitality', etc.
  
  -- Template graph (same structure as workflows.nodes + edges)
  nodes           JSONB NOT NULL DEFAULT '[]',
  edges           JSONB NOT NULL DEFAULT '[]',
  
  -- Metadata
  preview_image   TEXT,                  -- thumbnail for template gallery
  use_count       INTEGER NOT NULL DEFAULT 0,
  
  is_featured     BOOLEAN DEFAULT FALSE,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Integration credentials (per org, encrypted)
CREATE TABLE workflow_connector_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  connector_type  VARCHAR(32) NOT NULL,  -- 'slack', 'jira', 'email', 'webhook', etc.
  name            VARCHAR(128),          -- user-friendly name ("Acme Slack")
  
  -- Encrypted credentials (org-level encryption key)
  credentials     JSONB NOT NULL,        -- encrypted: {accessToken, webhookUrl, apiKey, etc.}
  
  -- OAuth state (for OAuth connectors)
  oauth_state     JSONB DEFAULT '{}',    -- {accessToken, refreshToken, expiresAt}
  
  is_valid        BOOLEAN DEFAULT TRUE,  -- set FALSE on auth failure
  last_verified   TIMESTAMPTZ,
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_workflow_connector_org_type ON workflow_connector_credentials(org_id, connector_type, name)
  WHERE deleted_at IS NULL;
```

---

## 9. Backend API Design

```
GET    /api/workflows                        -- list all workflows
POST   /api/workflows                        -- create workflow
GET    /api/workflows/:id                    -- get workflow with graph
PUT    /api/workflows/:id                    -- update workflow (full graph)
DELETE /api/workflows/:id                    -- soft delete
POST   /api/workflows/:id/activate           -- activate (make live)
POST   /api/workflows/:id/deactivate         -- pause
POST   /api/workflows/:id/run               -- manual trigger
POST   /api/workflows/:id/test              -- dry-run with test data (no real actions)

GET    /api/workflows/:id/executions         -- run history (paginated)
GET    /api/workflows/:id/executions/:eid    -- execution detail with step log
POST   /api/workflows/:id/executions/:eid/retry  -- retry failed execution
GET    /api/workflows/:id/executions/:eid/steps  -- per-step results

GET    /api/workflow-templates               -- list templates
GET    /api/workflow-templates/:id           -- template detail
POST   /api/workflow-templates/:id/use       -- instantiate template → create workflow

GET    /api/workflow-connectors              -- list connected integrations
POST   /api/workflow-connectors             -- connect new integration
DELETE /api/workflow-connectors/:id         -- disconnect
POST   /api/workflow-connectors/:id/verify  -- test the connection

POST   /api/workflows/webhook/:id           -- inbound webhook trigger URL
```

---

## 10. Crystal AI Workflow Integration

### 10.1 Crystal as a Workflow Step

When a Crystal AI action node executes, the Execution Engine calls CrystalOS:

```
POST /api/crystal/workflow-action
{
  "task": "analyze",
  "context": {
    "surveyId": "{{trigger.entity_id}}",
    "triggerType": "{{trigger.type}}",
    "triggerData": {
      "npsScore": "{{trigger.nps_current}}",
      "npsDrop": "{{trigger.nps_change}}",
      "period": "{{trigger.window_days}} days"
    },
    "previousStepOutputs": {
      // All variables from prior steps
    }
  },
  "outputSchema": {
    "summary": "string (max 200 chars)",
    "severity": "low | medium | high | critical",
    "topCauses": "string[] (max 3)",
    "recommendedAction": "string (max 150 chars)"
  }
}
```

Crystal returns structured JSON that becomes available as variables in downstream steps:
- `{{crystal.summary}}` → 200-char NPS drop summary
- `{{crystal.severity}}` → classification used by If/Else branch
- `{{crystal.topCauses[0]}}` → first identified cause
- `{{crystal.recommendedAction}}` → suggested action

### 10.2 Crystal as a Workflow Decision Maker

Crystal's classification output can drive branching:

```
[Crystal AI Node: Classify Severity]
  → Output: crystal.severity = "critical"
  
  [If/Else Branch]
    → IF crystal.severity == "critical":
        [PagerDuty: Page on-call]
        [Jira: Create P1 ticket]
    → ELSE IF crystal.severity == "high":
        [Slack: Post to #cx-alerts]
        [Jira: Create P2 ticket]
    → ELSE:
        [Email: Weekly digest queue]
```

This makes Crystal the autonomous decision-maker in the workflow — the workflow doesn't just run Crystal, it lets Crystal direct what happens next.

### 10.3 Crystal Writing Actions

When a Slack/Email/Jira action node uses Crystal output as the message body:

```javascript
// Crystal generates the Slack message
const crystalWriteTask = {
  task: "write",
  format: "slack_block_kit",
  context: triggerData,
  instructions: "Write a Slack message for the #cx-alerts channel summarizing this NPS drop. Include: what happened, Crystal's top 2 causes, recommended action, link to dashboard."
};

// Crystal returns Block Kit JSON → sent directly to Slack
```

### 10.4 Crystal Workflow Templates

**Template: Crystal NPS Recovery**
```
[NPS Drop Trigger: ≥5pts in 7 days]
    ↓
[Condition: NPS < 30]
    ↓
[Crystal AI: Analyze + Summarize + Classify severity]
    ↓ (parallel)
[Slack: Post Crystal-written message to #cx-alerts]
[Jira: Create ticket with Crystal-written description]
    ↓ (merge)
[Condition: Crystal severity == "critical"]
    ↓ YES
[Email: Crystal-written email to CX leadership team]
```

**Template: Crystal Weekly Intelligence Digest**
```
[Schedule: Every Monday 8:00 AM, user's timezone]
    ↓
[Crystal AI: Generate weekly intelligence narrative]
    ↓ (parallel)
[Email: Crystal's digest to leadership email list]
[Slack: Crystal's top 3 bullets to #cx-weekly]
```

---

## 11. Integration Connectors

### 11.1 Slack Connector

**Auth:** OAuth 2.0 (user installs Experient Slack App)
**Scopes required:** `chat:write`, `channels:read`, `groups:read`

**Actions:**
- Post to channel (text or Block Kit)
- Send DM to specific user
- Add reaction to message
- Update existing message
- Upload file (CSV data, chart image)

**Message templating:**
Slack messages use Block Kit for rich formatting:
```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🚨 NPS Alert — {{trigger.survey.name}}" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "NPS dropped *{{trigger.nps_change}} points* (from {{trigger.nps_baseline}} → {{trigger.nps_current}})"
      }
    },
    {
      "type": "section",
      "text": { "type": "mrkdwn", "text": "🤖 *Crystal:* {{crystal.summary}}" }
    },
    {
      "type": "actions",
      "elements": [
        { "type": "button", "text": "View Dashboard", "url": "{{trigger.dashboard_url}}" },
        { "type": "button", "text": "View Insights", "url": "{{trigger.insights_url}}" }
      ]
    }
  ]
}
```

### 11.2 Email Connector

**Auth:** SendGrid API key (org-configured)
**From:** Configurable sender (support@company.com or noreply@experient.io)

**Actions:**
- Send HTML email (Crystal-generated or template)
- Send to individual, list, or role group
- Send with attachment (PDF report, CSV export)
- Schedule delivery (for digest emails)

**Crystal-generated email body:**
When `usecrystal: true` on email action, Crystal writes the full email body:
- Subject line (Crystal writes a descriptive subject)
- 2-3 paragraph email body in professional tone
- Bullet points for key metrics
- Clear CTA (View Dashboard, Review Insights)

### 11.3 Jira Connector

**Auth:** OAuth 2.0 or API token
**Supports:** Jira Cloud, Jira Server (8.x+)

**Actions:**
- Create issue (with Crystal-written description)
- Update issue fields
- Add comment
- Transition issue status
- Link to existing issue
- Assign to user

**Crystal-generated Jira description:**
```
Crystal writes the Jira description using structured format:
- Summary of trigger event (2 sentences)
- Key data: NPS score, change, period
- Crystal's root cause analysis (bullet points)
- Affected segments (if detectable)
- Crystal's recommended action
- Link back to Experient: [View in Experient](dashboard_url)
- Crystal confidence: 87%
```

### 11.4 Webhook Connector

**Auth:** HMAC-SHA256 signature on every request
**Supports:** Any HTTP endpoint

**Actions:**
- POST JSON payload to configured URL
- Custom headers (auth tokens, API keys)
- Payload templating with workflow variables

**Payload template:**
```json
{
  "event": "{{trigger.type}}",
  "timestamp": "{{now}}",
  "org": "{{org.id}}",
  "survey": "{{trigger.survey.id}}",
  "nps": {{trigger.nps_current}},
  "crystal_summary": "{{crystal.summary}}",
  "crystal_severity": "{{crystal.severity}}",
  "dashboard_url": "{{trigger.dashboard_url}}"
}
```

### 11.5 Zapier / Make.com Integration

**Experient as Trigger (Zapier trigger):**
- Experient fires webhook to Zapier when workflow step is reached
- Zapier receives structured event data
- Enables connection to 5000+ Zapier apps

**Experient as Action (Zapier/Make action):**
- External Zapier zap → POST to Experient webhook trigger
- Enables: "When Salesforce closes a deal → trigger Experient welcome survey workflow"

---

## 12. Variable System & Templating

### 12.1 Variable Namespaces

All variables follow the pattern `{{namespace.path}}`:

**Trigger variables:**
```
{{trigger.type}}                  -- e.g. 'survey.response_received'
{{trigger.timestamp}}             -- ISO timestamp
{{trigger.entity_type}}           -- 'survey', 'insight', 'alert', etc.
{{trigger.entity_id}}             -- UUID of the triggering entity

{{trigger.survey.id}}
{{trigger.survey.name}}
{{trigger.survey.url}}
{{trigger.survey.response_count}}
{{trigger.survey.response_rate}}

{{trigger.nps_current}}           -- current NPS score
{{trigger.nps_baseline}}          -- prior period NPS
{{trigger.nps_change}}            -- delta (negative = drop)
{{trigger.window_days}}           -- comparison window

{{trigger.response.id}}           -- triggering response ID
{{trigger.response.nps_score}}    -- NPS score of the response
{{trigger.response.verbatim}}     -- open text response
{{trigger.response.sentiment}}    -- Crystal-classified sentiment
{{trigger.response.segment.*}}    -- embedded data fields
```

**Crystal output variables (set by Crystal action step):**
```
{{crystal.summary}}               -- 200-char narrative
{{crystal.severity}}              -- low|medium|high|critical
{{crystal.topCauses}}             -- array of strings
{{crystal.topCauses[0]}}          -- first cause
{{crystal.topCauses[1]}}          -- second cause
{{crystal.recommendedAction}}     -- suggested action
{{crystal.confidence}}            -- float 0-1
{{crystal.narrative}}             -- full-length narrative
{{crystal.topTopics}}             -- array of topic names
{{crystal.dashboardUrl}}          -- deep link Crystal generated
```

**Organization variables:**
```
{{org.id}}
{{org.name}}
{{org.industry}}
{{org.admin.email}}
```

**System variables:**
```
{{now}}                           -- current ISO timestamp
{{today}}                         -- current date (YYYY-MM-DD)
{{week_start}}                    -- first day of current week
```

### 12.2 Pipe Filters

Variables support transformation filters:
```
{{trigger.nps_change | abs}}            -- absolute value
{{trigger.survey.name | uppercase}}     -- string transformation
{{trigger.nps_change | sign}}           -- '+' or '-'
{{trigger.timestamp | date:'MMM D'}}    -- date formatting
{{crystal.topCauses | join:', '}}       -- array to string
{{trigger.nps_current | round}}         -- round to integer
```

### 12.3 Variable Picker UI

In action configuration panels, users click "Insert variable" to open the variable picker:

```
┌─────────────────────────────────────────┐
│ Insert Variable                    [×]  │
├─────────────────────────────────────────┤
│ [Search variables...]                   │
├─────────────────────────────────────────┤
│ 🔵 Trigger                             │
│   trigger.survey.name     "Q4 Survey"  │
│   trigger.nps_current     42           │
│   trigger.nps_change      -8           │
│                                         │
│ 🤖 Crystal (from step 2)              │
│   crystal.summary         "NPS dropp..." │
│   crystal.severity        "critical"   │
│   crystal.recommendedAction  "Brief..." │
│                                         │
│ 🏢 Organization                        │
│   org.name                "Acme Corp" │
│   org.admin.email         "admin@..." │
└─────────────────────────────────────────┘
```

---

## 13. Audit & Compliance

### 13.1 Immutable Audit Log

Every workflow execution and every step execution is logged immutably:
- Who created/modified the workflow
- What trigger fired
- What actions were executed
- What data was passed to each action
- What response was received from each integration
- All timestamps

Retained for: 1 year (configurable by org policy).

### 13.2 GDPR / Data Handling

**PII in workflow variables:**
- Verbatim text may contain PII (name, email in open text)
- Workflow execution logs are encrypted at rest
- Respondent data passed to external systems (Jira, Slack) is flagged in UI: "This action sends response data to an external system"
- User must explicitly confirm before connecting third-party integrations that receive response data

**Right to deletion:**
- If a respondent requests data deletion: their response ID is removed from workflow execution logs (response data scrubbed, execution record kept for audit trail)

### 13.3 Role-Based Access

| Permission | Who has it |
|------------|-----------|
| View all workflows | Admins, CX Leads |
| Create/edit workflows | Admins, CX Leads |
| Activate/deactivate | Admins only |
| View execution history | Admins, CX Leads, Analysts (read-only) |
| Connect integrations | Admins only |
| Delete workflows | Admins only |

### 13.4 Approval Workflow (Enterprise Feature)

For orgs that require oversight before activating high-impact workflows:
- Workflow goes to "Pending Approval" state instead of "Active"
- Designated approvers receive notification
- Approver reviews workflow graph + test run results
- Approver approves or rejects with comment
- Full approval chain logged

---

## 14. Pre-Built Workflow Templates

### Template 1: Closed-Loop NPS Recovery
**Trigger:** NPS drops ≥5 points (7-day rolling)  
**Conditions:** NPS < 40  
**Steps:** Crystal analyze → Slack alert → Jira ticket (Crystal-written) → Email CX lead  
**Industry:** All  
**Use case:** Immediate response to NPS deterioration

### Template 2: Weekly Executive Digest
**Trigger:** Schedule (Monday 8am, user timezone)  
**Steps:** Crystal generate weekly intelligence → Email to leadership list → Post bullets to Slack  
**Industry:** All  
**Use case:** Keep executives informed without manual reporting

### Template 3: Verbatim Escalation
**Trigger:** Response filter (verbatim contains escalation keywords)  
**Conditions:** Crystal severity == "critical"  
**Steps:** Crystal classify → PagerDuty alert → Jira P1 ticket → Email legal/compliance  
**Industry:** All  
**Use case:** Immediate escalation for legal/safety mentions

### Template 4: New Topic Alert
**Trigger:** crystal.topic_emerged  
**Steps:** Crystal summarize topic → Slack to #cx-team → Email product manager  
**Industry:** All  
**Use case:** Surface new customer issues to the right team

### Template 5: Survey Response Milestone
**Trigger:** survey.milestone_reached (100 responses)  
**Steps:** Crystal run preliminary analysis → Notify survey creator → Post Slack update  
**Industry:** All  
**Use case:** Celebrate milestones and trigger early analysis

### Template 6: Survey Close-Date Warning
**Trigger:** survey.expiring_soon (48h before)  
**Steps:** Email survey creator → Slack reminder → If response rate < 20%: trigger reminder email campaign  
**Industry:** All  
**Use case:** Prevent surveys from closing with low response rates

### Template 7: Crystal Insight Distribution
**Trigger:** crystal.insight_ready  
**Steps:** Crystal summarize insights → Email to stakeholders → Post to #insights Slack channel  
**Industry:** All  
**Use case:** Ensure insights reach the right people

### Template 8: Competitive Mention Alert
**Trigger:** crystal.topic_emerged (topic includes competitor names)  
**Steps:** Crystal analyze context → Email product + marketing → Create Asana task  
**Industry:** SaaS, Retail, Hospitality  
**Use case:** Monitor competitive mention spikes

### Template 9: Response Rate Recovery
**Trigger:** survey.response_rate_low (< 15%)  
**Conditions:** Survey age < 14 days (still worth recovering)  
**Steps:** Email survey creator with Crystal's suggestions → Delay 24h → Check rate again → If still low: trigger reminder distribution  
**Industry:** All  
**Use case:** Automated response rate rescue

### Template 10: Monthly Board Report
**Trigger:** Schedule (1st of month, 6am)  
**Steps:** Crystal generate executive report (PDF) → Email to board distribution list  
**Industry:** All  
**Use case:** Automated monthly stakeholder reporting

### Template 11: Detractor Follow-Up
**Trigger:** survey.response_filtered (NPS score ≤ 6)  
**Conditions:** Response has valid contact email embedded  
**Steps:** Delay 2 hours → Crystal write personalized follow-up → Email to respondent (with opt-out)  
**Industry:** B2B SaaS, Financial Services  
**Use case:** Close the loop with detractors

### Template 12: Product Feedback Routing
**Trigger:** crystal.topic_emerged (topic category = "product feedback")  
**Steps:** Crystal extract feature requests → Create Jira issues per unique request → Email product team  
**Industry:** SaaS, Tech  
**Use case:** Turn verbatim clusters into product backlog items

### Template 13: Customer Churn Risk Alert
**Trigger:** crystal.prediction_alert (churn risk > 80%)  
**Steps:** Crystal identify at-risk accounts → Create Salesforce tasks for CSMs → Slack CSM team  
**Industry:** B2B SaaS  
**Use case:** Proactive retention when Crystal predicts churn

### Template 14: Cross-Survey Correlation Alert
**Trigger:** crystal.cross_survey_correlation  
**Steps:** Crystal write cross-program summary → Email CX program lead → Create summary insight  
**Industry:** Enterprise (multi-program)  
**Use case:** Surface systemic issues appearing across programs

### Template 15: Employee Experience Loop
**Trigger:** score.nps_drop (Employee NPS survey)  
**Conditions:** NPS < 30  
**Steps:** Crystal analyze → Email HR Business Partner → Create Workday/ServiceNow ticket → Schedule manager briefing reminder  
**Industry:** Enterprise (Employee Experience programs)  
**Use case:** Employee NPS recovery process

---

## 15. Competitive Positioning

| Capability | Qualtrics XM Workflows | Medallia Actions | Zapier/Make | **Experient** |
|------------|----------------------|-----------------|-------------|---------------|
| Visual workflow builder | ✓ | Limited | ✓ | ✓ |
| Crystal AI as workflow step | ✗ | ✗ | N/A | **✓ Unique** |
| Crystal writes message content | ✗ | ✗ | ✗ | **✓ Unique** |
| Crystal as decision router | ✗ | ✗ | ✗ | **✓ Unique** |
| No-code setup | Partial | Limited | ✓ | ✓ |
| Pre-built XM templates | ✓ | Partial | Generic | **✓ XM-specific** |
| Jira integration | ✓ | ✓ | ✓ | ✓ |
| Slack integration | ✓ | ✓ | ✓ | ✓ |
| PagerDuty escalation | ✗ | ✓ | ✓ | ✓ |
| Webhook support | ✓ | ✓ | ✓ | ✓ |
| Full audit log | Partial | ✓ | ✗ | ✓ |
| Approval workflow | ✓ | ✓ | ✗ | ✓ |
| Cross-survey workflow trigger | ✗ | ✗ | N/A | **✓ Crystal** |

**The Experient advantage:**
1. Crystal AI is a first-class workflow citizen — not just a trigger source
2. Crystal writes the messages (Slack, email, Jira) — no template needed
3. Crystal makes routing decisions — classify severity, route to right team
4. XM-native templates — built for NPS recovery, not generic webhooks
5. Cross-survey correlation triggers — unique to Crystal's intelligence

---

## 16. Implementation Roadmap

### Phase 1 — Core Engine (Month 1)
- [ ] Postgres schema: all 6 tables
- [ ] Trigger Listener: Redis Streams consumer + Bull cron
- [ ] Execution Engine: basic step-by-step execution
- [ ] Action Dispatcher: email, in-app notification, webhook
- [ ] REST API: workflow CRUD, execution history
- [ ] Workflow List UI (no canvas yet)
- [ ] 2 templates: Weekly Digest, Survey Milestone

### Phase 2 — Visual Builder (Month 2)
- [ ] Canvas-based workflow builder (React Flow or custom D3)
- [ ] Node library panel
- [ ] Node configuration panels (right-side form)
- [ ] Connection arrows (click output port → click input port)
- [ ] Variable picker UI
- [ ] Test mode (dry-run with sample data)
- [ ] Template gallery

### Phase 3 — Crystal AI Steps (Month 3)
- [ ] Crystal action node type (Analyze, Summarize, Classify, Write)
- [ ] CrystalOS `/api/crystal/workflow-action` endpoint
- [ ] Crystal variables in downstream steps
- [ ] Crystal-as-router (If/Else branch based on Crystal output)
- [ ] 5 Crystal-powered templates

### Phase 4 — External Integrations (Month 4)
- [ ] Slack connector (OAuth + Block Kit)
- [ ] Email connector (SendGrid)
- [ ] Jira connector (OAuth)
- [ ] Webhook connector
- [ ] Connector configuration UI
- [ ] Credential vault (encrypted storage)

### Phase 5 — Advanced Flow + Reliability (Month 5)
- [ ] Parallel execution (split + merge nodes)
- [ ] Delay nodes (Bull Queue delayed jobs)
- [ ] Circuit breaker per integration
- [ ] Dead letter queue + manual replay
- [ ] Approval workflow feature
- [ ] Full audit log UI

### Phase 6 — Ecosystem (Month 6+)
- [ ] Zapier / Make.com integration
- [ ] Salesforce connector
- [ ] ServiceNow connector
- [ ] PagerDuty connector
- [ ] Public API for external workflow triggers
- [ ] Workflow analytics (success rates, popular templates, avg duration)

---

*Document prepared by the Workflow System cross-functional team — Experient Platform Design Series, June 2026.*
