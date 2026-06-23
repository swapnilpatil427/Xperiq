# Alerts & Intelligence System — Design Document

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Design  
**Team:** Dr. Nalini Patel (Applied Science), Ryan O'Brien (Backend), Yuki Tanaka (UX), Fatima Al-Hassan (XM Expert, 15 years Forrester), Tom Bradley (Enterprise Customer, SVP CX), Aisha Okonkwo (Product), Chen Wei (Frontend), Jorge Santos (CrystalOS), Emma Thompson (Platform Expert)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Complete Alert Taxonomy](#2-complete-alert-taxonomy)
3. [Alert Engine Architecture](#3-alert-engine-architecture)
4. [Database Schema](#4-database-schema)
5. [Backend API Design](#5-backend-api-design)
6. [UX Design](#6-ux-design)
7. [Crystal AI Integration](#7-crystal-ai-integration)
8. [Industry Benchmarking](#8-industry-benchmarking)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Success Metrics](#10-success-metrics)

---

## 1. Executive Summary

### The Core Insight

> **Fatima Al-Hassan (XM Expert):** "In 15 years of XM research, the most consistent complaint from CX executives is not that they lack data — it's that the signal drowns in the noise and reaches them too late. Qualtrics dashboards are full of data that nobody checks until the quarterly business review. By then, the customer churn has already happened."

> **Tom Bradley (SVP CX, major airline):** "I have 6 active surveys and 4 direct reports who are supposed to flag issues. But I'm always the last to know. I need the system to be my first reporter — not my team's PowerPoint slides."

### What Alerts Change

The Alerts & Intelligence System transforms Experient from a data repository into an active intelligence partner. Instead of requiring users to discover problems, Crystal proactively surfaces them with:
- **When**: The exact moment the signal emerges
- **What**: A precise description of what changed
- **Why**: Crystal's AI narration explaining the root cause
- **What to do**: Recommended next action

### Competitive Differentiation

No competitor in the XM market today combines:
1. Real-time threshold-based alerts
2. Crystal AI anomaly detection (statistical + LLM-contextualized)
3. Predictive alerts (before the threshold is crossed)
4. Crystal narration on every alert explaining *why* it fired
5. Cross-survey correlation alerts (same issue appearing in multiple programs)

Qualtrics has alert rules. Medallia has Signal. Neither tells you *why* or *what's coming*.

---

## 2. Complete Alert Taxonomy

Each alert type is specified with: trigger condition, default threshold (configurable), severity, target audience, suggested action, and Crystal AI enhancement.

### Category S — Score & Performance Alerts

**S-01: NPS Drop Alert**
- **Trigger**: NPS score drops by ≥ N points vs. comparison period
- **Default**: ≥ 5 points drop over 7-day rolling window
- **Severity**: Critical (≥10pt drop) / Warning (5-9pt drop)
- **Audience**: CX leaders, org admins
- **Suggested action**: "Review recent verbatims → identify root cause → escalate to operations team"
- **Crystal enhancement**: Crystal narrates the top 3 contributing factors with verbatim evidence

**S-02: NPS Rise Alert**
- **Trigger**: NPS score rises by ≥ N points vs. comparison period
- **Default**: ≥ 5 points rise over 7-day window
- **Severity**: Success
- **Audience**: CX leaders, entire team
- **Suggested action**: "Analyze what changed → identify positive drivers → replicate across channels"
- **Crystal enhancement**: Crystal identifies the positive driver ("Service speed improvements mentioned in 31% of promoter verbatims")

**S-03: NPS Threshold Breach**
- **Trigger**: NPS crosses a configured absolute threshold (not change-based)
- **Default**: NPS falls below 30 (configurable per org)
- **Severity**: Critical
- **Audience**: Configured alert subscribers
- **Suggested action**: "Immediate review — NPS in danger zone"
- **Crystal enhancement**: Crystal compares to industry benchmark and prior periods

**S-04: CSAT Score Drop**
- **Trigger**: CSAT average drops below threshold or falls N% week-over-week
- **Default**: Below 3.5/5 or drops >10% WoW
- **Severity**: Warning / Critical
- **Audience**: Survey owner, CX team

**S-05: CES Score Spike**
- **Trigger**: Customer Effort Score rises above threshold (high CES = high effort = bad)
- **Default**: CES > 4.5/7
- **Severity**: Warning
- **Audience**: Product team, CX ops

**S-06: Segment Score Divergence**
- **Trigger**: Crystal detects one segment's score diverging from org average by > N points
- **Default**: > 8 point divergence
- **Severity**: Warning
- **Audience**: CX analysts, survey owner
- **Crystal enhancement**: Crystal identifies which segment and theorizes why ("Mobile app users NPS is 18 points below web users — correlated with 'slow loading' mentions")

**S-07: Industry Percentile Alert**
- **Trigger**: Score falls below a configured industry percentile benchmark
- **Default**: Falls below 25th percentile for industry vertical
- **Severity**: Warning
- **Audience**: CX leaders, executives
- **Crystal enhancement**: Crystal provides benchmark context and names top-performing peers if available

---

### Category V — Volume & Response Rate Alerts

**V-01: Response Rate Drop**
- **Trigger**: Survey response rate drops below target threshold
- **Default**: Response rate < 20% (configurable)
- **Severity**: Warning (< 20%) / Critical (< 10%)
- **Audience**: Survey creator
- **Suggested action**: "Send follow-up reminder → review survey length → check distribution channel"
- **Crystal enhancement**: Crystal suggests specific improvement ("Past surveys with reminders on Day 3 saw 40% response rate lift")

**V-02: Completion Rate Drop**
- **Trigger**: Survey completion rate (started but didn't finish) drops below threshold
- **Default**: Completion rate < 60%
- **Severity**: Warning
- **Audience**: Survey designer
- **Crystal enhancement**: Crystal identifies the specific question where most respondents drop off

**V-03: Response Volume Spike**
- **Trigger**: Response volume over 1-hour window exceeds N× baseline
- **Default**: 5× the 30-day hourly average
- **Severity**: Info / Warning
- **Audience**: Survey creator, ops
- **Note**: Could be positive (viral) or negative (bot attack) — Crystal determines which

**V-04: Response Volume Cliff**
- **Trigger**: Response volume drops to near-zero when baseline was non-zero
- **Default**: < 5% of baseline for 4 consecutive hours
- **Severity**: Warning
- **Audience**: Survey creator, IT/ops

**V-05: Quota Milestone**
- **Trigger**: Survey response count crosses milestone
- **Default**: Milestones at 25, 50, 100, 250, 500, 1000 (configurable)
- **Severity**: Success
- **Audience**: Survey creator, team
- **Crystal enhancement**: "At 100 responses, Crystal has enough data to run preliminary analysis. Launch early insights?"

**V-06: Survey Expiry Warning**
- **Trigger**: Survey close date approaching
- **Default**: Alerts at 72h and 24h before close
- **Severity**: Warning (72h) / Critical (24h)
- **Audience**: Survey creator

---

### Category T — Sentiment & Topic Alerts

**T-01: Topic Sentiment Shift**
- **Trigger**: Sentiment score for a specific topic changes significantly vs. prior period
- **Default**: Topic sentiment changes by > 0.3 on -1 to 1 scale
- **Severity**: Warning (negative shift) / Success (positive shift)
- **Audience**: CX analysts, product teams
- **Crystal enhancement**: Crystal names the topic, shows trending verbatims, and quantifies impact on NPS

**T-02: Emerging Topic Alert**
- **Trigger**: Crystal detects a new topic cluster that wasn't present in prior periods
- **Default**: Topic appears in > 5% of recent responses but was < 1% previously
- **Severity**: Info / Warning (if sentiment is negative)
- **Audience**: CX analysts, product, survey owner
- **Crystal enhancement**: Crystal names the topic, shows example verbatims, and classifies it (product/service/support/other)

**T-03: Topic Volume Spike**
- **Trigger**: An existing topic's mention rate spikes vs. baseline
- **Default**: Topic mention rate increases > 3× over 7-day window
- **Severity**: Warning
- **Audience**: Relevant team (product, ops, support — configurable by topic tag)

**T-04: Negative Keyword Cluster**
- **Trigger**: Specific high-urgency keywords appear above threshold in verbatims
- **Default**: Keywords like "terrible," "never again," "cancel," "lawsuit," "dangerous" appear in > 3% of verbatims
- **Severity**: Critical
- **Audience**: CX leaders, legal team (configurable)
- **Crystal enhancement**: Crystal extracts and summarizes the specific complaints for immediate review

**T-05: Competitor Mention Spike**
- **Trigger**: Competitor brand names appear with increasing frequency in verbatims
- **Default**: Competitor mentions > 2× baseline
- **Severity**: Info
- **Audience**: Product, marketing teams
- **Crystal enhancement**: Crystal analyzes context — are they mentioned positively (customer comparing favorably) or negatively (defecting to competitor)?

**T-06: Feature Request Cluster**
- **Trigger**: Crystal detects a cluster of verbatims requesting the same feature/capability
- **Default**: > 15 unique verbatims expressing similar request in 30-day window
- **Severity**: Info
- **Audience**: Product team, CX analyst
- **Crystal enhancement**: Crystal writes a feature request summary suitable for a Jira ticket

**T-07: Verbatim Escalation**
- **Trigger**: A single verbatim contains language flagged as requiring immediate attention
- **Default**: Safety threats, legal threats, discriminatory language, PII mentioned
- **Severity**: Critical
- **Audience**: Legal, HR, or CX leader (role-based)
- **Crystal enhancement**: Crystal flags the specific risk category and recommends escalation path

---

### Category AI — Crystal Intelligence Alerts

**AI-01: New Insight Generated**
- **Trigger**: Crystal completes insight generation for a survey
- **Severity**: Info
- **Audience**: Survey owner
- **Crystal enhancement**: Preview of the top insight in the notification body

**AI-02: Confidence Threshold Crossed**
- **Trigger**: Crystal's confidence in an insight crosses a configured threshold
- **Default**: Confidence rises from < 0.6 to ≥ 0.8
- **Severity**: Info
- **Audience**: Survey owner, analysts
- **Crystal enhancement**: Crystal explains what additional data raised its confidence

**AI-03: Statistical Anomaly Detected**
- **Trigger**: Crystal's anomaly detection identifies a statistically significant outlier
- **Default**: Z-score > 2.5 on any tracked metric
- **Severity**: Warning
- **Audience**: CX analysts, survey owner
- **Crystal enhancement**: Crystal identifies the anomaly, its magnitude, and whether it's directionally positive or negative

**AI-04: Predictive Churn Signal**
- **Trigger**: Crystal's predictive model indicates NPS is likely to drop below threshold within N days
- **Default**: 80%+ probability of NPS drop > 5 points within 14 days
- **Severity**: Warning
- **Audience**: CX leaders
- **Crystal enhancement**: Crystal cites the leading indicators driving the prediction

**AI-05: Cross-Survey Correlation Alert**
- **Trigger**: Crystal detects the same theme appearing across multiple surveys in the same org
- **Default**: Same topic cluster appearing in 3+ surveys simultaneously
- **Severity**: Warning
- **Audience**: CX program lead, executives
- **Crystal enhancement**: Crystal writes a cross-program summary ("Shipping delays are now the #1 issue in Customer Support, Onboarding, and Post-Purchase surveys simultaneously")

**AI-06: Cohort Divergence Alert**
- **Trigger**: Crystal detects two user cohorts behaving significantly differently
- **Default**: > 12 point NPS divergence between two cohorts over 30 days
- **Severity**: Warning
- **Audience**: CX analysts, product team
- **Crystal enhancement**: Crystal identifies the cohorts and hypothesizes the cause

---

### Category O — Operational Alerts

**O-01: Data Pipeline Failure**
- **Trigger**: Data ingestion pipeline fails or stops processing
- **Severity**: Critical
- **Audience**: Org admins, IT team

**O-02: Integration Sync Failure**
- **Trigger**: External integration (Salesforce, HubSpot, Zendesk) sync fails
- **Severity**: Warning
- **Audience**: IT admins

**O-03: AI Credits Low**
- **Trigger**: Crystal AI credit balance falls below threshold
- **Default**: < 20% of monthly allocation remaining
- **Severity**: Warning / Critical (< 5%)
- **Audience**: Org admins, billing contacts

**O-04: Export/Report Completed**
- **Trigger**: A scheduled export or Crystal report completes
- **Severity**: Info
- **Audience**: Requester

**O-05: Survey Close-Date Approaching**
- (See V-06 — same alert, operational framing)

---

### Category B — Benchmarking Alerts

**B-01: Below Industry Benchmark**
- **Trigger**: Score falls below industry benchmark for the org's vertical
- **Default**: Falls below median benchmark
- **Severity**: Warning
- **Audience**: CX leaders, executives
- **Crystal enhancement**: Crystal contextualizes with industry data and best practices

**B-02: Above Industry Benchmark**
- **Trigger**: Score rises above industry benchmark (milestone)
- **Severity**: Success
- **Audience**: CX team, executives (worth celebrating)

**B-03: Year-Over-Year Significant Change**
- **Trigger**: Score changes significantly vs. same period last year
- **Default**: > 8 point change YoY
- **Severity**: Warning (drop) / Success (rise)
- **Audience**: CX leaders, executives

---

### Category C — Compliance Alerts

**C-01: PII Detected in Verbatims**
- **Trigger**: Crystal detects PII (email, phone, credit card, name) in open-text responses
- **Severity**: Warning
- **Audience**: Privacy officer, org admin
- **Crystal enhancement**: Crystal identifies the type of PII and affected response IDs (without exposing PII in notification)

**C-02: Data Retention Limit Approaching**
- **Trigger**: Survey data approaching configured retention policy limit
- **Default**: Alert when within 30 days of retention expiry
- **Severity**: Warning
- **Audience**: Org admin, compliance team

---

## 3. Alert Engine Architecture

### 3.1 High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         DATA INGESTION LAYER                           │
│  [Survey Responses]  [Crystal Pipeline Events]  [System Events]        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Redis Streams
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        ALERT EVALUATION ENGINE                         │
│                                                                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ REAL-TIME       │  │ SCHEDULED BATCH  │  │ CRYSTAL ASYNC        │  │
│  │ EVALUATOR       │  │ EVALUATOR        │  │ EVALUATOR            │  │
│  │                 │  │                  │  │                      │  │
│  │ Stream consumer │  │ Bull cron jobs   │  │ Called by CrystalOS  │  │
│  │ Per-event rules │  │ Every 15min/1h   │  │ post-analysis        │  │
│  │ Threshold check │  │ Trend analysis   │  │ Anomaly detection    │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
└───────────┼───────────────────┼────────────────────────┼──────────────┘
            │                   │                        │
            └───────────────────┴────────────────────────┘
                                        │
                                        ▼
                    ┌───────────────────────────────────┐
                    │        ALERT PROCESSOR            │
                    │                                   │
                    │ 1. Check deduplication            │
                    │ 2. Resolve subscribers            │
                    │ 3. Apply user preferences         │
                    │ 4. Generate Crystal narration     │
                    │ 5. Persist to alert_events table  │
                    │ 6. Publish to Notification Service│
                    └───────────────────────────────────┘
                                        │
                    ┌───────────────────┴──────────────────┐
                    │                                      │
                    ▼                                      ▼
        ┌─────────────────────┐              ┌──────────────────────┐
        │  ALERT STORE        │              │  NOTIFICATION SERVICE │
        │  (Postgres)         │              │  (in-app + email +    │
        │  alert_events table │              │   Slack channels)     │
        └─────────────────────┘              └──────────────────────┘
```

### 3.2 Evaluation Strategies

**Real-Time Evaluation** (for critical threshold breaches):
- Triggered on every ingested response event
- Checks: V-03 (volume spike), T-07 (verbatim escalation), C-01 (PII detection)
- Maximum latency: < 10 seconds from event to alert

**Scheduled Batch Evaluation** (for trend-based alerts):
- Runs every 15 minutes: S-01, S-03, S-06, V-01, V-02, V-04
- Runs every 1 hour: S-04, S-05, T-01, T-03, B-01, B-02
- Runs daily at midnight: S-07, B-03, V-06, AI-05

**Crystal AI Evaluation** (async, post-insight pipeline):
- Triggered by CrystalOS after completing any analysis job
- Handles: AI-01 through AI-06, T-02, T-04, T-05, T-06, AI-06

### 3.3 Alert State Machine

```
                    ┌─────────────────┐
                    │     PENDING     │
                    │  (conditions    │
                    │   being eval)   │
                    └────────┬────────┘
                             │ conditions met
                             ▼
                    ┌─────────────────┐
             ┌──── │     ACTIVE      │ ────┐
             │     │  (firing, not   │     │
             │     │   acknowledged) │     │
             │     └────────┬────────┘     │
             │              │              │
        user snoozes   user acks       auto-resolved
             │              │          (condition
             ▼              ▼           cleared)
     ┌────────────┐  ┌───────────────┐       │
     │  SNOOZED   │  │ ACKNOWLEDGED  │       │
     │ (snooze    │  │               │       │
     │  expires → │  │               │       │
     │  → ACTIVE) │  └───────┬───────┘       │
     └────────────┘          │               │
                             │ user resolves │
                             ▼               ▼
                    ┌─────────────────────────┐
                    │        RESOLVED         │
                    │  (terminal state)       │
                    └─────────────────────────┘
```

### 3.4 Deduplication Logic

Prevents the same alert from firing repeatedly for the same condition:

```javascript
// Dedup key: org_id + rule_id + entity_id + evaluation_window
const dedupKey = `alert:dedup:${orgId}:${ruleId}:${entityId}:${windowKey}`;

// Window keys by severity:
// critical: 24 hours
// warning:  6 hours  
// info:     1 hour

const isDuplicate = await redis.get(dedupKey);
if (isDuplicate) return; // Skip

// After firing: set with expiry
await redis.set(dedupKey, '1', 'EX', deduplicationTTL);
```

---

## 4. Database Schema

```sql
-- Alert rule configurations (user-defined + Crystal-defined)
CREATE TABLE alert_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  survey_id       UUID REFERENCES surveys(id),  -- NULL = org-wide rule
  
  alert_type      VARCHAR(32) NOT NULL,   -- e.g. 'S-01', 'T-02', 'AI-03'
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,  -- Crystal-managed rules
  
  -- Threshold configuration
  threshold_config  JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- {"minDrop": 5, "windowDays": 7}  for S-01
  -- {"minRate": 20}                   for V-01
  -- {"keywords": ["cancel","refund"]} for T-04
  
  severity        VARCHAR(16) NOT NULL DEFAULT 'warning',
  
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_alert_rules_org_active ON alert_rules(org_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_alert_rules_survey ON alert_rules(survey_id) WHERE survey_id IS NOT NULL;


-- Triggered alert instances
CREATE TABLE alert_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  rule_id         UUID NOT NULL REFERENCES alert_rules(id),
  survey_id       UUID REFERENCES surveys(id),
  
  alert_type      VARCHAR(32) NOT NULL,
  severity        VARCHAR(16) NOT NULL,
  
  -- Alert content
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  crystal_narration TEXT,          -- Crystal's AI-generated explanation
  crystal_action  TEXT,            -- Crystal's recommended next action
  
  -- Supporting data
  metric_value    DECIMAL(12, 4),   -- The triggering metric value
  metric_baseline DECIMAL(12, 4),   -- What it was before
  metric_change   DECIMAL(12, 4),   -- The delta
  evidence        JSONB DEFAULT '{}',  -- Supporting verbatims, chart data
  
  -- State
  status          VARCHAR(16) NOT NULL DEFAULT 'active',
  -- active | acknowledged | snoozed | resolved
  
  -- Lifecycle timestamps
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id),
  snoozed_until   TIMESTAMPTZ,
  snoozed_by      UUID REFERENCES users(id),
  
  -- Metadata
  metadata        JSONB DEFAULT '{}',
  
  CONSTRAINT alert_events_status_check CHECK (
    status IN ('active', 'acknowledged', 'snoozed', 'resolved')
  ),
  CONSTRAINT alert_events_severity_check CHECK (
    severity IN ('critical', 'warning', 'info', 'success')
  )
);

CREATE INDEX idx_alert_events_org_active ON alert_events(org_id, triggered_at DESC) 
  WHERE status = 'active';
CREATE INDEX idx_alert_events_rule ON alert_events(rule_id, triggered_at DESC);
CREATE INDEX idx_alert_events_survey ON alert_events(survey_id, triggered_at DESC);


-- Who receives which alert types and on which channels
CREATE TABLE alert_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID REFERENCES users(id),   -- NULL = role-based
  role            VARCHAR(32),                   -- 'admin', 'cx_lead', 'analyst'
  rule_id         UUID REFERENCES alert_rules(id),  -- NULL = subscribe to type
  alert_type      VARCHAR(32),
  
  in_app_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  slack_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  
  UNIQUE(org_id, user_id, rule_id)
);


-- Org-level threshold overrides
CREATE TABLE alert_thresholds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  alert_type      VARCHAR(32) NOT NULL,
  threshold_key   VARCHAR(64) NOT NULL,   -- e.g. 'minDrop', 'windowDays'
  threshold_value JSONB NOT NULL,
  
  UNIQUE(org_id, alert_type, threshold_key)
);


-- Snooze records
CREATE TABLE alert_snooze (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_event_id  UUID NOT NULL REFERENCES alert_events(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  snoozed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snoozed_until   TIMESTAMPTZ NOT NULL,
  reason          TEXT
);

CREATE INDEX idx_alert_snooze_expiry ON alert_snooze(snoozed_until) 
  WHERE snoozed_until > NOW();


-- Immutable audit trail of all state transitions
CREATE TABLE alert_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_event_id  UUID NOT NULL REFERENCES alert_events(id),
  user_id         UUID REFERENCES users(id),   -- NULL = system action
  action          VARCHAR(32) NOT NULL,         -- 'triggered','acknowledged','snoozed','resolved'
  from_status     VARCHAR(16),
  to_status       VARCHAR(16),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_history_event ON alert_history(alert_event_id, created_at);
```

---

## 5. Backend API Design

### 5.1 Alert Management Endpoints

```
GET    /api/alerts                        -- list active alerts (paginated)
GET    /api/alerts/history                -- historical alerts (paginated)
GET    /api/alerts/:id                    -- alert detail
POST   /api/alerts/:id/acknowledge        -- acknowledge alert
POST   /api/alerts/:id/snooze            -- snooze with duration
POST   /api/alerts/:id/resolve           -- mark resolved

GET    /api/alerts/rules                  -- list configured alert rules
POST   /api/alerts/rules                  -- create rule
GET    /api/alerts/rules/:id             -- get rule
PUT    /api/alerts/rules/:id             -- update rule
DELETE /api/alerts/rules/:id             -- delete rule (soft)
POST   /api/alerts/rules/:id/test        -- test rule with current data

GET    /api/alerts/subscriptions          -- get my subscriptions
PUT    /api/alerts/subscriptions          -- update subscriptions

GET    /api/alerts/thresholds             -- org-level threshold config
PUT    /api/alerts/thresholds             -- update thresholds
```

### 5.2 Key Response Shapes

**`GET /api/alerts`**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "alertType": "S-01",
      "severity": "critical",
      "title": "NPS dropped 8 points — Q4 Customer Survey",
      "description": "NPS fell from 42 to 34 over the past 7 days.",
      "crystalNarration": "This week's NPS decline is primarily driven by a surge in verbatims mentioning 'shipping delays' — rising from 8% to 24% of all responses. The sharpest drop occurred among customers who received orders after Dec 18th.",
      "crystalAction": "Review logistics data for Dec 18+ orders. Escalate to supply chain team. Consider proactive outreach to affected customers.",
      "metricValue": 34,
      "metricBaseline": 42,
      "metricChange": -8,
      "status": "active",
      "triggeredAt": "2026-06-03T09:14:22Z",
      "surveyId": "abc123",
      "surveyName": "Q4 Customer Survey",
      "evidence": {
        "topVerbatims": [
          "Package arrived 2 weeks late. Completely unacceptable.",
          "The delay ruined my holiday gift. Never ordering again."
        ],
        "topicBreakdown": {
          "shipping_delays": 0.24,
          "communication": 0.15,
          "product_quality": 0.08
        }
      }
    }
  ],
  "counts": {
    "critical": 1,
    "warning": 3,
    "info": 5,
    "total": 9
  },
  "pagination": { "page": 1, "limit": 20, "total": 9, "hasMore": false }
}
```

**`POST /api/alerts/:id/snooze`**
```json
// Request
{ "duration": "4h", "reason": "Investigating with ops team" }

// Response
{ "snoozedUntil": "2026-06-03T13:14:22Z" }
```

---

## 6. UX Design

### 6.1 Alert Center Page

```
┌──────────────────────────────────────────────────────────────────────┐
│  Alert Center                                          [+ New Rule]   │
├──────────────────────────────────────────────────────────────────────┤
│  [All (9)] [Critical (1)] [Warning (3)] [Info (5)]   [Filter ▾]      │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🔴 CRITICAL                                        9 min ago   │  │
│  │ NPS dropped 8 points — Q4 Customer Survey                      │  │
│  │ NPS fell from 42 → 34 over 7 days.                             │  │
│  │ 🤖 Crystal: "Shipping delays are the primary driver (24% of    │  │
│  │    verbatims). Sharp drop started Dec 18."                     │  │
│  │ → Review Survey   [Acknowledge]  [Snooze ▾]  [Resolve]        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ⚠️  WARNING                                        2 hours ago │  │
│  │ New topic emerging — "App crashes on checkout"                 │  │
│  │ Topic appeared in 8% of recent responses (up from 0%).         │  │
│  │ 🤖 Crystal: "First detected Tuesday. Tracking upward. Likely   │  │
│  │    iOS 18 compatibility issue based on device metadata."       │  │
│  │ → View Topic   [Acknowledge]  [Snooze ▾]  [Resolve]           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ℹ️  INFO                                           6 hours ago │  │
│  │ Crystal analysis complete — Onboarding NPS Survey              │  │
│  │ 4 new insights generated from 312 responses.                   │  │
│  │ 🤖 Top insight: "Users who complete onboarding < 5 min are 18  │  │
│  │    NPS points higher than those who take > 10 min."            │  │
│  │ → View Insights   [Dismiss]                                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 Alert Detail View

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back to Alerts    NPS Drop — Q4 Customer Survey      [Resolve]    │
├─────────────────────────────────┬────────────────────────────────────┤
│  ALERT DETAIL                   │  🤖 CRYSTAL ANALYSIS               │
│                                 │                                    │
│  Status:  🔴 ACTIVE             │  "This week's NPS decline from     │
│  Severity: Critical             │  42 to 34 is driven primarily by   │
│  Triggered: Jun 3, 9:14am      │  shipping delays, mentioned in     │
│  Survey: Q4 Customer Survey     │  24% of recent verbatims — up      │
│                                 │  from 8% last week.               │
│  METRIC CHANGE                  │                                    │
│  ┌──────────────────────────┐   │  The sharpest drop correlates     │
│  │  42 → 34  (-8 points)   │   │  with orders placed after Dec     │
│  │  ████████░░░░░░░░░░░░░  │   │  18th, when a new carrier was     │
│  │  7-day rolling avg       │   │  introduced in the Midwest.       │
│  └──────────────────────────┘   │                                    │
│                                 │  RECOMMENDED ACTIONS:              │
│  TIMELINE                       │  1. Review carrier performance    │
│  ● Jun 3 9:14am — Triggered    │     for Dec 18+ shipments          │
│  ● Jun 3 9:15am — Notified 3   │  2. Proactive outreach to         │
│    subscribers                  │     affected customers             │
│  ● (awaiting acknowledgment)   │  3. Brief supply chain team        │
│                                 │                                    │
│  TOP CONTRIBUTING VERBATIMS     │  SIMILAR PAST ALERTS:             │
│  "Package arrived 2 weeks late" │  • Nov 2025: -6pt NPS drop        │
│  "Delay ruined holiday gift"    │    (resolved in 4 days)           │
│  "Will not order again"         │                                    │
└─────────────────────────────────┴────────────────────────────────────┘
```

### 6.3 Alert Setup Wizard

```
Step 1 of 4: Choose what to monitor
┌──────────────────────────────────────────────────────┐
│  What do you want to be alerted about?               │
│                                                      │
│  ● Score Changes        NPS, CSAT, CES drops/rises  │
│  ○ Response Volume      Rate, quota, milestones      │
│  ○ Topics & Sentiment   Emerging topics, shifts      │
│  ○ Crystal AI Events    Insights, anomalies          │
│  ○ Operations           Pipeline, integrations       │
│                                                      │
│                                    [Next →]          │
└──────────────────────────────────────────────────────┘

Step 2 of 4: Set conditions
┌──────────────────────────────────────────────────────┐
│  NPS Score Alert                                     │
│                                                      │
│  Alert when NPS drops by more than  [5 ▾] points    │
│  Over a window of  [7 days ▾]                       │
│  Compared to:  [● Rolling average  ○ Same period     │
│                   last year  ○ Custom baseline]     │
│                                                      │
│  Apply to:  [● All surveys  ○ Specific surveys ▾]   │
│                                                      │
│  [← Back]                           [Next →]         │
└──────────────────────────────────────────────────────┘

Step 3 of 4: Choose recipients
┌──────────────────────────────────────────────────────┐
│  Who should receive this alert?                      │
│                                                      │
│  ☑ Survey creator                                   │
│  ☑ Org administrators                              │
│  ☐ All team members                                 │
│  ☐ External email: [enter email address...]         │
│                                                      │
│  [← Back]                           [Next →]         │
└──────────────────────────────────────────────────────┘

Step 4 of 4: Choose delivery channels
┌──────────────────────────────────────────────────────┐
│  How should alerts be delivered?                     │
│                                                      │
│  ☑ In-app notification center                       │
│  ☑ Email notification                               │
│  ☐ Slack (connect workspace first)                  │
│  ☐ Webhook (advanced)                               │
│                                                      │
│  Preview: Alert fires when NPS drops ≥5 pts in 7    │
│  days. Survey creator + admins notified via in-app  │
│  + email.                                           │
│                                                      │
│  [← Back]                   [Activate Alert ✓]      │
└──────────────────────────────────────────────────────┘
```

---

## 7. Crystal AI Integration

### 7.1 Bidirectional Coupling

Crystal is both a **trigger source** and an **enrichment engine** for alerts:

**Crystal → Alert System:** Crystal's analysis pipeline publishes events when it detects anomalies, emerging topics, or predictive signals. These events are consumed by the Alert Engine as AI-category alerts (AI-01 through AI-06).

**Alert → Crystal:** When a threshold-based alert fires (e.g., NPS drop), the Alert Processor immediately requests Crystal narration via the CrystalOS API to enrich the alert before delivering it to subscribers.

### 7.2 Crystal Anomaly Detection (Three-Layer)

```python
# crystalos/agents/anomaly_detector.py

class AnomalyDetectorAgent:
    """
    Three-layer anomaly detection for generating alert events.
    Layer 1: Statistical (Z-score, moving average deviation)
    Layer 2: Changepoint detection (PELT algorithm for trend breaks)
    Layer 3: LLM contextualization (Claude explains the anomaly)
    """
    
    async def detect(self, metric_series: list[float], context: dict) -> AnomalyResult:
        # Layer 1: Z-score
        z_score = self._compute_zscore(metric_series)
        if z_score < 2.5:
            return AnomalyResult(detected=False)
        
        # Layer 2: Changepoint detection
        breakpoint = self._detect_changepoint(metric_series)
        
        # Layer 3: LLM narration
        narration = await self._narrate(metric_series, z_score, breakpoint, context)
        
        return AnomalyResult(
            detected=True,
            z_score=z_score,
            breakpoint_index=breakpoint,
            narration=narration,
            severity=self._classify_severity(z_score)
        )
```

### 7.3 Crystal Alert Narration Standards

Every Crystal narration attached to an alert must:
- Be ≤ 200 words
- Include at least 2 specific data citations (percentages, counts, or direct verbatim quotes)
- Include one recommended action
- Be written at a level suitable for a VP without XM domain expertise
- Never use passive voice or hedging language when the data is clear

Template structure:
```
{WHAT changed} — {MAGNITUDE} {DIRECTION} {TIME WINDOW}.
{WHY}: {top factor} (cited as {X}% of {metric}), followed by {second factor}.
{WHERE}: The effect is most pronounced in {segment/channel/time window}.
RECOMMENDED ACTION: {specific, actionable step}.
```

### 7.4 Predictive Alert Design

Crystal's predictive alerting uses a simple leading-indicator model:
1. Identify metrics that historically precede NPS drops by 7-14 days
2. Score current data against those leading indicators
3. If probability > 80%: fire a warning-level predictive alert
4. Include confidence interval and leading indicators in Crystal narration

Leading indicators tracked:
- Response sentiment moving average (sentiment drops often precede NPS drops by ~10 days)
- Verbatim escalation rate
- Response completion rate (dropping completion correlates with customer frustration)
- Topic cluster velocity (new negative topics growing fast)

---

## 8. Industry Benchmarking

| Capability | Qualtrics XM Discover | Medallia Signal | Confirmit | **Experient** |
|------------|----------------------|-----------------|-----------|---------------|
| Threshold-based alerts | ✓ | ✓ | ✓ | ✓ |
| AI anomaly detection | Limited | ✓ | ✗ | ✓ (3-layer) |
| Alert narration (why it fired) | ✗ | ✗ | ✗ | **✓ Crystal** |
| Predictive alerts | ✗ | Limited | ✗ | **✓ Crystal** |
| Cross-survey correlation | ✗ | ✗ | ✗ | **✓ Crystal** |
| No-code setup wizard | Partial | ✓ | Partial | **✓** |
| Alert state machine | Limited | ✓ | ✗ | ✓ |
| Crystal-recommended actions | ✗ | ✗ | ✗ | **✓** |
| Verbatim escalation | ✗ | ✓ | ✗ | **✓** |

**Unique to Experient:**
1. Crystal narration on every alert — not just "NPS dropped" but *why*
2. Predictive alerting before the threshold is crossed
3. Cross-survey correlation detection across the program portfolio
4. Crystal-generated recommended action in every alert
5. Alert backtesting (test a rule against historical data before activating)

---

## 9. Implementation Roadmap

### Phase 1 — Foundation (Weeks 1-2)
- [ ] Postgres schema: all 6 tables
- [ ] Alert rule CRUD API
- [ ] Threshold-based evaluator (batch, every 15min)
- [ ] S-01 (NPS drop), V-01 (response rate), V-05 (milestone), V-06 (expiry)
- [ ] Alert Processor → Notification Service integration
- [ ] Alert Center UI (list + basic detail)

### Phase 2 — Crystal Intelligence (Weeks 3-4)
- [ ] Crystal narration API integration (enrich alerts with AI explanation)
- [ ] Crystal anomaly detection agent (3-layer pipeline)
- [ ] AI-01 (insight ready), AI-03 (anomaly), T-02 (emerging topic)
- [ ] Alert detail view with Crystal panel
- [ ] Alert setup wizard (all 4 steps)

### Phase 3 — Predictive & Advanced (Weeks 5-6)
- [ ] AI-04 (predictive churn signal)
- [ ] AI-05 (cross-survey correlation)
- [ ] T-07 (verbatim escalation)
- [ ] C-01 (PII detection)
- [ ] Alert backtesting feature
- [ ] Subscription management UI

### Phase 4 — External Channels (Weeks 7-8)
- [ ] Slack alert delivery
- [ ] Webhook connector
- [ ] PagerDuty escalation for Critical severity
- [ ] ServiceNow integration (for enterprise ops teams)

---

## 10. Success Metrics

### Alert Quality
- **Alert precision**: % of alerts users find actionable (target: > 80%)
- **False positive rate**: % of alerts immediately dismissed without action (target: < 15%)
- **Duplicate alert rate**: Same condition firing multiple times (target: 0%)

### Response Time
- **Critical alert time-to-action**: From trigger to first user action (target: < 30 minutes)
- **Warning alert time-to-action**: (target: < 4 hours)
- **Alert-to-resolution time**: From alert firing to resolved status (target: < 24 hours for critical)

### Business Impact
- **NPS improvement velocity**: Orgs with alerts enabled should show faster NPS recovery after drops
- **Feature adoption**: % of orgs with ≥ 1 active alert rule (target: > 80% within 60 days of launch)

### Operational SLOs
- Alert evaluation latency: P95 < 30 seconds for real-time; P95 < 16 minutes for batch
- Crystal narration generation: P95 < 10 seconds
- Alert delivery to notification system: P99 < 5 seconds

---

*Document prepared by the Alerts & Intelligence System cross-functional team — Experient Platform Design Series, June 2026.*
