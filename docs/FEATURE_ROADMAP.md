# Xperiq — Feature Roadmap & Team Index
# The Four Capabilities That Make Xperiq Best-in-Class

> **Vision:** Every feature below must be the best version of that capability the XM
> industry has ever seen. Not "good enough." Not "feature parity with Qualtrics." The
> design bar is: a CX leader who has used every major XM platform sees this and says
> "nobody has built this before."

---

## Build Sequence

These four capabilities are built in dependency order. Each unlocks the next.

```
Priority 1: Intelligence Groups (Tags)
    └─ Provides the grouping primitive everything else uses
        │
        ▼
Priority 2: Xperiq Actions (Workflows)
    └─ Turns passive data into triggered responses
        │
        ▼
Priority 3: Intelligence Briefings (Scheduled Reports)
    └─ Delivers intelligence automatically to stakeholders
        │
        ▼
Priority 4: Command Center (Org Dashboard)
    └─ The single view of the organization's experience health
```

---

## Priority 1 — Intelligence Groups
### `docs/tags-insight/`

**User-facing name:** Intelligence Groups
**What it is:** Living segments that group surveys by dimension (product line, region,
team, program) and automatically aggregate insights, NPS, sentiment, and themes across
all surveys in the group. Crystal generates fresh narrative briefs every 15 minutes.

**Why it wins:** Every legacy XM platform has folders. We have dimensional intelligence.
Qualtrics "Projects" are static filing cabinets. Intelligence Groups are living analytics
lenses that self-update with every new response.

**The wow moment:** Tag Universe — a force-directed graph showing how all your feedback
programs interrelate, sized by survey count, colored by NPS health. Nobody in XM has built this.

| Doc | Contents |
|---|---|
| [TEAM.md](tags-insight/TEAM.md) | Priya Nalawade (PM), Marcus Osei (UX), Dmitri Volkov (Backend), Tanya Krishnamurthy (Frontend), Leila Hosseini (AI/ML), Reuben Adeyemi (Data), Cassandra Weil (Marketing), Jordan Castillo (Platform) |
| [ARCHITECTURE.md](tags-insight/ARCHITECTURE.md) | Postgres schema (`tags`, `survey_tags`, `tag_insights` materialized view, `tag_insight_trend`, `tag_hierarchies`, `tag_proposals`), 9 API endpoints, auto-tag CrystalOS skill, tag insight pipeline LangGraph graph, Redis cache strategy |
| [DESIGN.md](tags-insight/DESIGN.md) | 14-color tag palette, inline tag creation (T shortcut), survey list filter bar, Group Intelligence Report page, auto-tag proposal confirm-cards with Framer Motion fly-to, Tag Universe D3 force graph |
| [GTM.md](tags-insight/GTM.md) | "Stop organizing surveys into folders" positioning, Thursday-night spreadsheet launch story, 4 launch channels, 4-tier pricing (Free 10 tags → Starter → Growth auto-tag → Enterprise Universe) |
| [ROADMAP.md](tags-insight/ROADMAP.md) | 4 phases × 8 weeks: Foundation → Group Intelligence → Auto-Intelligence → Cross-Feature integration |
| [SECURITY_REVIEW.md](tags-insight/SECURITY_REVIEW.md) | Dr. Anika Sharma — 15 findings (4 Critical): cross-org tag injection, broken MCP org_id validation, missing survey ownership check on tag delete, prompt injection in auto_tag skill |
| [OPS_REVIEW.md](tags-insight/OPS_REVIEW.md) | Marcus Chen — 12 risks (3 P0): no distributed lock on CONCURRENTLY refresh, cycle detection absent in tag_hierarchies, unbounded Postgres connections from CrystalOS pipeline |
| [CUSTOMER_REVIEW.md](tags-insight/CUSTOMER_REVIEW.md) | Sarah Okonkwo — 12 gaps (4 Must Fix): UI/marketing naming inconsistency, no retroactive bulk-tag flow, no comparison view, 10-tag free limit wall |
| [ISSUES_AND_FIXES.md](tags-insight/ISSUES_AND_FIXES.md) | 38 issues total — 11 must fix before Phase 1 ships (schema decisions, namespace lock redesign requiring new `tag_namespaces` table) |
| [EXPANSION.md](tags-insight/EXPANSION.md) | 7 expansions 2027–2028: Predictive Intelligence, Cross-Org Benchmarking, Temporal Tags, Tag Health Score, Tag Merging AI, MCP skill, Mobile Tag Manager |

**Delivery:** 8 weeks · 4 phases · Tags enable all downstream features

---

## Priority 2 — Xperiq Actions
### `docs/workflows/`

**User-facing name:** Xperiq Actions
**What it is:** Visual workflow automation for XM. Trigger-based system with 10 trigger
types (including AI triggers from Crystal — sentiment spikes, new themes, anomalies) and
10 action types (Slack, email, Jira, Zendesk, webhooks, survey lifecycle). Natural
language workflow creation via Crystal Builder.

**Why it wins:** No legacy XM platform has AI-detected triggers. Qualtrics has "action
planning" (manual). Medallia has email alerts (basic thresholds only). Xperiq fires when
Crystal detects a pattern — before you've noticed it yourself.

**The wow moment:** Natural language → workflow in 10 seconds. User types "When our NPS
drops below 30, send a Slack message to #cx-alerts with a summary." Crystal builds the
workflow. User confirms. Done.

| Doc | Contents |
|---|---|
| [TEAM.md](workflows/TEAM.md) | Maya Okonkwo (PM, ex-HubSpot Workflows), Rohan Desai (UX, ex-Zapier builder), Priya Krishnamurthy (Backend, ex-Stripe Webhooks), Elias Park (Frontend, ex-Airbyte), Amara Osei (AI/ML, ex-Qualtrics iQ), David Mensah (Integrations, ex-Zapier), Kenji Watanabe (Reliability, ex-Twilio), Simone Dufour (Marketing, ex-Intercom), Nina Reeves (Platform) |
| [ARCHITECTURE.md](workflows/ARCHITECTURE.md) | 5-table Postgres schema, 10 trigger types with hysteresis rules, 10 action types with JSONB configs, BullMQ queue topology, idempotency keys, CrystalOS `nl_to_workflow` LangGraph subgraph, 12 REST endpoints |
| [DESIGN.md](workflows/DESIGN.md) | Workflow list card grid, 3-panel visual builder with animated bezier SVG connectors, Crystal NL Builder with staggered fill animation, run history timeline, test mode dry-run panel, in-app notification center |
| [GTM.md](workflows/GTM.md) | "The first XM platform that acts on your data" positioning, competitive teardown with sales objection handling, 4-phase launch (beta co-creation → ProductHunt → content → integration partners), 4-tier pricing |
| [ROADMAP.md](workflows/ROADMAP.md) | 5 phases × 10 weeks: Core Engine → Builder UI → AI Triggers → Integration Depth → MCP Skill |
| [SECURITY_REVIEW.md](workflows/SECURITY_REVIEW.md) | James Whitmore — 15 findings (3 Critical): SSRF via webhook URL, AES-256 encryption with no per-record IV, prompt injection in Crystal Builder |
| [OPS_REVIEW.md](workflows/OPS_REVIEW.md) | Priya Sundaram — 12 risks (3 P0): Redis SPOF with no AOF, no distributed lock on scheduler (double-enqueue), AI trigger latency incompatible with 30s SLO |
| [CUSTOMER_REVIEW.md](workflows/CUSTOMER_REVIEW.md) | Tom Reyes — 11 gaps (Must Fix): no cooldown UI, action output variables non-functional, no RBAC ownership model, no workflow health on list cards |
| [ISSUES_AND_FIXES.md](workflows/ISSUES_AND_FIXES.md) | 41 issues — 8 must fix before Phase 1 code is written (DB schema, queue architecture, foundational security); 7 updated ADRs superseding ARCHITECTURE.md |
| [EXPANSION.md](workflows/EXPANSION.md) | 7 expansions 2027–2028: Branching logic, Multi-survey orchestration, AI-authored actions, Workflow marketplace, Self-healing workflows, Compliance workflows, Voice creation |

**Delivery:** 10 weeks · 5 phases · Requires Intelligence Groups for tag-scoped triggers

---

## Priority 3 — Intelligence Briefings
### `docs/scheduled-reports/`

**User-facing name:** Intelligence Briefings
**What it is:** AI-written scheduled reports delivered to inboxes and Slack channels.
Crystal generates the narrative, computes the trends, flags the concerns. Six built-in
briefing templates: Weekly NPS Digest, Monthly Executive Summary, Survey Closeout Report,
Tag Group Weekly, Response Anomaly Alert, Quarterly Business Review Pack.

**Why it wins:** Qualtrics "scheduled exports" are CSV file dumps. Medallia "report
delivery" is PDF charts with no narrative. Xperiq delivers intelligence: Crystal writes
3 sentences about what changed, what matters, and what to do. The email looks like it
came from a smart analyst, not a BI tool.

**The wow moment:** The "Monday Brief" email — beautiful, Crystal-written, with
"Moments that Mattered" (verbatim quotes Crystal selected as most representative) and
3 prioritized action recommendations. Forwarded to the CEO before 9 AM, no prep required.

| Doc | Contents |
|---|---|
| [TEAM.md](scheduled-reports/TEAM.md) | 9-person team: ex-Amplitude, Looker, Tableau, Heap backgrounds. Product Lead, UX, Backend, Frontend, AI/ML Narrative, Email/Delivery, Data, Marketing, Platform Expert |
| [ARCHITECTURE.md](scheduled-reports/ARCHITECTURE.md) | 5-table Postgres schema (`report_templates`, `scheduled_reports`, `report_runs`, `report_artifacts`, `report_recipients`), 6 template definitions with metric contracts, 11-node CrystalOS LangGraph DAG, Redis SET NX scheduler, 9 REST endpoints, email design system constraints |
| [DESIGN.md](scheduled-reports/DESIGN.md) | Reports landing page, 3-step builder wizard (template picker → scope/schedule → recipients), live preview panel with viewport toggle, physical HTML email design spec (header, KPI row, Crystal narrative card, topic chips, "Moments that Mattered" quotes, action recommendations, footer) |
| [GTM.md](scheduled-reports/GTM.md) | "Monday morning, your inbox gets smarter" narrative, two-tier naming (Intelligence Briefings / The Monday Brief), competitive teardown, 5 launch channels, 4-tier pricing |
| [ROADMAP.md](scheduled-reports/ROADMAP.md) | 5 phases × 7 weeks: Foundation → Email Delivery → Scheduling → Full Builder → Cross-Feature Integration |
| [SECURITY_REVIEW.md](scheduled-reports/SECURITY_REVIEW.md) | Elena Vasquez — 11 findings (4 Critical): LLM output HTML injection into email (XSS), PII in unencrypted artifacts, unconstrained external recipients enabling exfiltration, GDPR deletion gap in already-generated PDFs. NOT APPROVED FOR LAUNCH. |
| [OPS_REVIEW.md](scheduled-reports/OPS_REVIEW.md) | Roberto Nakamura — 11 risks (2 P0): no generation queue (5,000 simultaneous LLM calls Monday 9 AM), Playwright in-process blocking all CrystalOS workers |
| [CUSTOMER_REVIEW.md](scheduled-reports/CUSTOMER_REVIEW.md) | Diana Okafor — 11 gaps (4 Must Fix): no approval gate before delivery, single cadence per report, no archive, no narrative feedback loop |
| [ISSUES_AND_FIXES.md](scheduled-reports/ISSUES_AND_FIXES.md) | 33 issues — 11 launch blockers, 7 new DB tables / 20+ new columns, 6 updated architecture decisions |
| [EXPANSION.md](scheduled-reports/EXPANSION.md) | 7 expansions 2027–2028: Living Reports, Briefing Conversations, Predictive Briefings, Multi-Org Benchmarking, Voice Briefings, Executive Briefing Editor, Multi-Language Delivery |

**Delivery:** 7 weeks · 5 phases · Requires Intelligence Groups for tag-scoped reports; uses Workflow engine for `generate_report` action type

---

## Priority 4 — Command Center
### `docs/org-dashboard/`

**User-facing name:** Command Center
**What it is:** The single-screen intelligence view of an organization's entire experience
health. Org Health Score (0–100 composite), Crystal's weekly brief, real-time KPI row,
NPS trend chart, programs overview with per-survey health pills, emerging topics feed,
anomaly alerts, tag group comparison grid. War Room Mode (dark theme for large-screen
CX team war rooms).

**Why it wins:** Qualtrics requires professional services to configure a cross-program
view. Medallia's "Experience Cloud" is complex and enterprise-only. Xperiq auto-populates
from existing surveys — zero config. Crystal writes the Monday brief. The Org Health Score
tells you in one number whether things are OK.

**The wow moment:** The Org Health Score animated count-up on page load, followed by a
3-sentence Crystal brief that tells you exactly what changed since last week and what to
act on. A VP of CX sees this and never opens a spreadsheet on Monday morning again.

| Doc | Contents |
|---|---|
| [TEAM.md](org-dashboard/TEAM.md) | Priya Rajan (PM, ex-Tableau Executive Analytics), Marcus Osei (UX, command-center design), Dariusz Kowalski (Backend, ex-Databricks real-time analytics), Yuki Tanaka (Frontend, financial trading platform charts), Amara Nwosu (AI/ML, CMU anomaly detection PhD), Leila Ahmadi (Data, healthcare analytics), Theo Bergmann (Design Systems), Sofia Reyes (Marketing), Jordan Whitfield (Platform) |
| [ARCHITECTURE.md](org-dashboard/ARCHITECTURE.md) | 7 Postgres objects (`org_metrics_daily`, `org_metrics_weekly`, `org_topic_trends`, `org_health_score`, `tag_group_metrics`, `survey_health_summary`, `org_crystal_briefs`), pg_cron schedules, 8 REST endpoints + WebSocket live channel, CrystalOS 6-node LangGraph DAG, Redis pub/sub → WebSocket room-per-org, performance targets (<500ms load, <2s real-time) |
| [DESIGN.md](org-dashboard/DESIGN.md) | Fixed top nav Health Bar, Crystal Brief card, KPI row (4 tiles), dual-axis NPS/volume trend chart, Programs Overview table with health pills, Emerging Topics chip scroll, Anomaly Alerts sidebar, Tag Group comparison grid, War Room dark mode |
| [GTM.md](org-dashboard/GTM.md) | "One number. Your entire CX health." positioning, Monday morning VP of CX narrative, 4-column competitive matrix, 3 ICP profiles, 5 launch phases with LinkedIn 60-second video script, 4-tier pricing (Starter → Growth → Growth+ → Enterprise) |
| [ROADMAP.md](org-dashboard/ROADMAP.md) | 5 phases × 8 weeks: Foundation → Intelligence Layer → Real-time → Full Command Center → Polish & Scale |
| [SECURITY_REVIEW.md](org-dashboard/SECURITY_REVIEW.md) | Dr. Rafi Goldstein — pre-implementation review: WebSocket JWT re-validation, Redis pub/sub org isolation, Health Score gaming surface, Crystal brief PII exposure, War Room public URL leakage |
| [OPS_REVIEW.md](org-dashboard/OPS_REVIEW.md) | Kenji Watanabe — 12 risks (3 P0): room map memory leak, pg_notify queue overflow at 1,000+ inserts/min, silent pg.Client LISTEN failure on failover. Cost cliff: unpartitioned `org_metrics_daily` = $13k/month at 10k orgs. |
| [CUSTOMER_REVIEW.md](org-dashboard/CUSTOMER_REVIEW.md) | Catherine Walsh — 10 gaps (Must Fix): Health Score unexplained, no executive share link, no goal tracking, no period comparison, urgency-sorted programs table |
| [ISSUES_AND_FIXES.md](org-dashboard/ISSUES_AND_FIXES.md) | 31 issues — 16 blocking, 5 architecture decisions; pre-launch effort 28–35 engineer-days |
| [EXPANSION.md](org-dashboard/EXPANSION.md) | 7 expansions 2027–2028: Executive Share Links, Goal Tracking, Predictive Health Score, Multi-Org Benchmarking, War Room 2.0, Period Comparison Mode, Mobile Command Center |

**Delivery:** 8 weeks · 5 phases · Requires Intelligence Groups for drill-down; uses Intelligence Briefings for Crystal brief content

---

## Cross-Feature Integration Map

```
Intelligence Groups ──────────────────────────────────────────┐
  tags.slug used as:                                           │
  - Workflow trigger scope (tag_nps_threshold)                 │
  - Report scope filter (tag_filter: string[])                 │
  - Command Center drill-down (org → tag group → survey)       │
  - MCP skill: get_tag_insights(tag_slug)                      │
                                                               │
Xperiq Actions ───────────────────────────────────────────────┤
  workflow action types include:                               │
  - generate_report (triggers Intelligence Briefings)          │
  - notify_in_app (feeds Command Center notification center)   │
  - Crystal Signals (AI triggers from insight pipeline)        │
                                                               │
Intelligence Briefings ───────────────────────────────────────┤
  report data sources:                                         │
  - Per-survey insights (existing)                             │
  - Tag group aggregates (from Intelligence Groups)            │
  - Org-wide metrics (from Command Center data layer)          │
                                                               │
Command Center ───────────────────────────────────────────────┘
  drill-down path:
  Org Health → Tag Group → Survey Detail → Crystal Chat
```

---

## Team Composition Summary

| Feature | Team Size | PM | UX Lead | Backend | Frontend | AI/ML | Marketing |
|---|---|---|---|---|---|---|---|
| Intelligence Groups | 8 | Priya Nalawade | Marcus Osei | Dmitri Volkov | Tanya Krishnamurthy | Leila Hosseini | Cassandra Weil |
| Xperiq Actions | 9 | Maya Okonkwo | Rohan Desai | Priya Krishnamurthy | Elias Park | Amara Osei | Simone Dufour |
| Intelligence Briefings | 9 | (see TEAM.md) | (see TEAM.md) | (see TEAM.md) | (see TEAM.md) | (see TEAM.md) | (see TEAM.md) |
| Command Center | 9 | Priya Rajan | Marcus Osei | Dariusz Kowalski | Yuki Tanaka | Amara Nwosu | Sofia Reyes |

**Total: 35 senior-level roles across 4 feature teams.** Each team has a Platform Expert
(Jordan Castillo / Nina Reeves / Jordan Whitfield) who guards integration with the
existing Xperiq architecture.

---

## Shared Architectural Principles

All four features follow the same Xperiq architecture pattern — no exceptions:

1. **CrystalOS proposes. The app executes.** CrystalOS never writes to app state directly.
   Auto-tag proposals, workflow NL creation, Crystal briefs — all flow through the
   propose → confirm → execute pattern with an outcome funnel.

2. **Pre-compute, never compute on load.** Every dashboard surface reads from
   materialized views or cached aggregates. No live SQL on page load.

3. **Soft delete everywhere.** Tags, workflows, reports, metrics — `deleted_at` timestamp,
   never hard delete. Historical data is always preserved.

4. **Org isolation is non-negotiable.** Every query checks `req.orgId` from auth
   middleware. No cross-org data leakage at any layer.

5. **All user strings through `locales/en.ts`.** No hardcoded strings in JSX.
   Ever. On any of the four surfaces.

6. **Test gate on every phase.** No phase ships without ≥80% frontend coverage and
   ≥90% backend route coverage on new code.

---

## Competitive Position After All Four Features Ship

| Capability | Qualtrics | Medallia | SurveyMonkey | **Xperiq** |
|---|---|---|---|---|
| Cross-survey grouping with live AI insights | Folders (static) | Programs (manual) | Teams (filing) | **Intelligence Groups (live, AI-briefed)** |
| Workflow automation with AI triggers | Action planning (manual) | Email alerts (threshold only) | Basic notifications | **Xperiq Actions (10 AI trigger types, visual builder)** |
| Scheduled intelligence reports | CSV exports | PDF chart delivery | Basic email | **Intelligence Briefings (Crystal-written narrative)** |
| Org-level command center | Professional services config | Complex enterprise setup | Not available | **Command Center (auto-populates, zero config)** |
| Natural language creation | No | No | No | **Everything in plain English** |
| Callable from AI agents (MCP) | No | No | No | **4 native skills, MCP-published** |
| Time to first insight | Weeks | Months | Days | **< 5 minutes** |
| Self-serve | Partial | No | Yes | **Fully self-serve** |

---

---

## Expert Review Summary

Each feature has been reviewed by independent security, operations, and customer panels.
All review documents live in the feature folder alongside the design docs.

| Feature | Security verdict | Ops verdict | Launch blockers |
|---|---|---|---|
| Intelligence Groups | Conditional — 4 Criticals (cross-org injection, MCP org_id bypass) | 3 P0s — distributed lock missing, cycle detection absent | 11 issues pre-Phase-1 |
| Xperiq Actions | **NOT APPROVED** — SSRF in webhooks, broken encryption, prompt injection | 3 P0s — Redis SPOF, scheduler double-enqueue, AI trigger latency | 8 issues pre-Phase-1 |
| Intelligence Briefings | **NOT APPROVED** — LLM→email XSS, PII in artifacts, GDPR deletion gap | 2 P0s — no generation queue, Playwright in-process | 11 issues pre-launch |
| Command Center | Conditional — pre-implementation; WebSocket auth + org isolation gaps | 3 P0s — room map leak, pg_notify overflow, silent LISTEN failure | 16 issues pre-launch |

**The single most important finding across all four reviews:**
No feature is safe to ship without fixing its org isolation layer first. Cross-org data leakage is a risk in all four features and must be the first thing each team addresses before writing a single line of product code.

---

*Last updated: 2026-06-29. Each feature folder is the source of truth for its own team,
architecture, design, GTM, and roadmap. This index is navigation only.*
