# Experient Platform Roadmap — Design Series

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Design Phase

This document is the master index for the five major platform capabilities designed by the Experient cross-functional team in June 2026.

---

## Design Documents

### 1. Notification Service
**Directory:** [`docs/notifications/`](./notifications/)  
**Main doc:** [`NOTIFICATION_SERVICE.md`](./notifications/NOTIFICATION_SERVICE.md)

A real-time intelligence delivery system. Crystal narrates every notification — not just "NPS dropped" but *why*.

- 25+ notification types (surveys, scores, Crystal AI, operations)
- Real-time WebSocket delivery (< 2s latency)
- Redis Streams + Postgres + Socket.IO
- Smart suppression with relevance scoring
- Email digest (daily/weekly), Slack (v2), mobile push (future)

---

### 2. Alerts & Intelligence System
**Directory:** [`docs/alerts/`](./alerts/)  
**Main doc:** [`ALERTS_SYSTEM.md`](./alerts/ALERTS_SYSTEM.md)

36 alert types across 7 categories. Crystal AI provides 3-layer anomaly detection and predictive alerting before thresholds are crossed.

- Score alerts (NPS drop/rise, CSAT, CES, segment divergence)
- Volume alerts (response rate, quota, expiry)
- Topic alerts (emerging topics, sentiment shifts, verbatim escalation)
- Crystal AI alerts (anomalies, predictions, cross-survey correlations)
- Compliance alerts (PII detection, data retention)
- No-code alert setup wizard
- Alert state machine (active → acknowledged → snoozed → resolved)

---

### 3. Dashboard
**Directory:** [`docs/dashboard/`](./dashboard/)  
**Main doc:** [`DASHBOARD_DESIGN.md`](./dashboard/DASHBOARD_DESIGN.md)

The first XM dashboard where Crystal writes the story. Charts provide evidence; AI provides meaning.

- 4 layouts: Executive, Analyst, Operations, Insights
- 25+ widgets including Crystal Narrative Card, Prediction Panel, Action Board
- Global filter system (date, survey, segment, saved presets, compare mode)
- Drag-and-drop custom layout builder
- Real-time WebSocket updates
- PDF, PPTX, CSV export; scheduled digest emails
- "Ask Crystal" on every chart

---

### 4. Visual AI Capabilities
**Directory:** [`docs/visual-ai/`](./visual-ai/)  
**Main doc:** [`VISUAL_AI_CAPABILITIES.md`](./visual-ai/VISUAL_AI_CAPABILITIES.md)

Crystal sees what your customers see. Generates any chart from natural language. Analyzes images respondents submit.

- AI chart generation: natural language → Vega-Lite → rendered chart
- Image upload survey question + Crystal image analysis
- Image annotation question (click-on-image heatmap)
- Visual insight cards (chart + headline + Crystal explanation)
- Crystal anomaly markers and predictive overlays on all charts
- AI-generated PDF/PPTX reports
- Privacy-first: default face blurring, PII detection, GDPR-compliant consent
- Future: video response analysis, audio tone analysis

---

### 5. Workflow System
**Directory:** [`docs/workflows/`](./workflows/)  
**Main doc:** [`WORKFLOW_SYSTEM.md`](./workflows/WORKFLOW_SYSTEM.md)

No-code visual workflow builder. Crystal is a first-class workflow step — it analyzes, writes, classifies, and routes.

- Visual canvas builder (drag-and-drop nodes, connection arrows)
- 40+ triggers, 25+ conditions, 50+ actions
- Crystal AI step: analyze, summarize, classify severity, write messages, route branches
- 15 pre-built XM templates (NPS Recovery, Weekly Digest, Verbatim Escalation, etc.)
- Integrations: Slack, Email, Jira, Webhook, PagerDuty, Salesforce, ServiceNow, Zapier
- Full audit log, approval workflow, GDPR-compliant data handling
- Bull Queue + Redis + Postgres (at-least-once delivery, circuit breakers, DLQ)

---

## Cross-Capability Integration Map

The five capabilities are deeply interconnected:

```
                     ┌───────────────┐
                     │   DASHBOARD   │
                     │  (surface it) │
                     └──────┬────────┘
                            │ shows
                            ▼
┌──────────────┐   fire  ┌──────────┐  trigger  ┌───────────────┐
│   ALERTS     │────────▶│NOTIFICA- │──────────▶│  WORKFLOWS    │
│ (detect it)  │         │  TIONS   │           │  (act on it)  │
└──────┬───────┘         │(deliver) │           └───────┬───────┘
       │                 └──────────┘                   │
       │ Crystal                                Crystal  │
       ▼ generates                            generates  ▼
┌──────────────────────────────────────────────────────────┐
│                    CRYSTAL AI (CrystalOS)                 │
│  Detects anomalies → Fires alerts → Narrates notifications│
│  Generates charts → Powers dashboards → Drives workflows  │
└──────────────────────────────────────────────────────────┘
       │
       ▼ visual output
┌──────────────┐
│  VISUAL AI   │
│(show visually)│
└──────────────┘
```

**Example end-to-end flow:**
1. **Crystal** detects NPS dropped 8 points (anomaly detection)
2. **Alert** fires (S-01: NPS Drop, Critical severity)
3. **Notification** delivered to CX lead in < 2 seconds with Crystal's narration
4. **Workflow** "NPS Recovery" triggers automatically:
   - Crystal analyzes root cause
   - Crystal writes the Slack message and Jira ticket
   - Slack alert posted to #cx-alerts
   - Jira P1 ticket created
5. **Dashboard** shows the anomaly marker on the NPS trend chart
6. **Visual AI** generates a visual insight card showing the NPS chart with Crystal's annotation

---

## Implementation Priority Order

Based on customer value and technical dependencies:

| Priority | Capability | Phase 1 ETA |
|----------|-----------|-------------|
| 1 | Dashboard (core KPIs + charts) | Week 1-2 |
| 2 | Notification Service (in-app) | Week 1-2 |
| 3 | Alerts System (threshold-based) | Week 3-4 |
| 4 | Crystal integration in all three | Week 5-6 |
| 5 | Dashboard Crystal widgets | Week 7-8 |
| 6 | Workflow System (core engine) | Month 2 |
| 7 | Visual AI (chart generation) | Month 2-3 |
| 8 | Workflow visual builder | Month 2 |
| 9 | Image analysis in surveys | Month 3 |
| 10 | Workflow integrations (Slack, Jira) | Month 4 |

---

## Team Assignments (Experience Expert: Emma Thompson on all teams)

| Capability | Engineering Lead | XM Expert | Customer Voice |
|------------|-----------------|-----------|----------------|
| Notifications | Aria Chen | Emma Thompson | Carlos Mendez (Fortune 500 CX Director) |
| Alerts | Ryan O'Brien | Fatima Al-Hassan (Forrester) | Tom Bradley (Airline SVP CX) |
| Dashboard | Amara Diallo | Grace Kim | Robert Chen (Bank Head of Insights) |
| Visual AI | Dr. Yuna Park | Dr. Carmen Rivera | Michael Tanaka (Retail Digital CX) |
| Workflows | Marcus Johnson | Valentina Cruz | Patricia Holloway (Insurance CX Ops) |

---

*Experient Platform Design Series — June 2026*
