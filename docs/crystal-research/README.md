# Crystal Research — Experience Intelligence Platform

> **Project Codename: Crystal**
> Status: Design & Research Phase | Last Updated: May 2026
> Owner: Product, Applied Science, Engineering, UX

---

## What Is This

Crystal is Experient's next-generation experience intelligence platform. It transforms Crystal from a single-call AI chatbot into a fully agentic, tool-using XM analyst that understands org-level and survey-level context, generates structured reports, detects anomalies in real time, and is available as a context-aware assistant on every insights page.

This folder contains the complete design corpus for the Crystal initiative — from marketing through applied science through engineering implementation. It is the single source of truth for the project.

---

## Document Index

| # | Document | Owner | Audience | Status |
|---|---|---|---|---|
| 01 | [Marketing 1-Pager](./01_MARKETING_ONE_PAGER.md) | PMM | Executives, Investors, Customers | Draft |
| 02 | [Product Vision & Strategy](./02_PRODUCT_VISION.md) | PM | Leadership, Product Team | Draft |
| 03 | [UX Design — Routes & Screens](./03_UX_DESIGN.md) | UX | Design, Engineering, PM | Draft |
| 04 | [Applied Science Design](./04_APPLIED_SCIENCE.md) | Applied Science | Scientists, AI Engineers | Draft |
| 05 | [Technical Architecture](./05_TECHNICAL_ARCHITECTURE.md) | Staff Engineering | Engineering | Draft |
| 06 | [Engineering Implementation Guide](./06_ENGINEERING_IMPLEMENTATION.md) | Engineering | Engineers | Draft |
| 07 | [Model Selection & Context Window Design](./07_MODEL_AND_CONTEXT_DESIGN.md) | AI Engineering + Applied Science | AI Engineers, Scientists | Draft |

---

## The One-Paragraph Summary

Crystal is a Claude-powered agentic XM analyst embedded throughout Experient. Unlike legacy XM dashboards that surface static metrics, Crystal can reason across your data — calling tools to fetch topic signals, verbatims, metric trends, and cross-survey patterns — then synthesize findings into structured, cited, statistically grounded answers and reports. Crystal lives on every insights page, knows what you're looking at, and can answer "why did NPS drop?" by actually investigating your data, not just repeating a pre-computed summary. The same architecture that powers conversational Crystal also drives automated checkpoint reports (triggered by streaming consumer when 30+ new responses arrive), weekly org digests (written by the scheduler), and real-time anomaly alerts.

---

## The Core Problems We Solve

1. **No one knows why.** Every XM platform tells you *what* (NPS is 34). None convincingly explain *why* in a multi-step, data-grounded way. Crystal investigates.

2. **Insights don't connect to actions.** Leaders see a dashboard, then ask their team what to do. Crystal closes the gap with prioritized, impact-ranked action recommendations.

3. **Org-level is invisible.** Survey-level analytics exist everywhere. Understanding how your *entire experience program* is performing — which surveys are healthy, which topics are cross-cutting, which programs need attention — is not offered by any mid-market tool. Crystal surfaces this.

4. **Context disappears when you switch pages.** Crystal is context-aware on every screen. On the org overview, it answers portfolio questions. On a survey page, it knows the survey. On a topic, it knows the topic. You never have to re-explain where you are.

---

## Key Design Decisions (Do Not Relitigate Without Evidence)

| Decision | Rationale |
|---|---|
| Claude (Anthropic) as the reasoning model | Best-in-class tool use quality, 200K context, extended thinking for complex reasoning |
| ReAct agent loop (not single LLM call) | Crystal needs multi-step investigation — single calls cannot traverse topic → verbatim → driver logic |
| Tool registry pattern (plug-and-play) | Every new XM capability ships as a registered tool; Crystal uses it automatically |
| Streaming checkpoint system | Incremental delta analysis is far more valuable than full reprocessing; anomalies can only be detected by comparing against a baseline |
| Postgres (not TimescaleDB) | Current scale (<5M rows per table) does not justify operational complexity of a separate TSDB; revisit at 10M+ rows |
| New `/app/experience/*` routes alongside existing `/app/insights/*` | Old routes preserved for backward compatibility; new routes built ground-up without legacy constraints |
| Statistical significance gating | Crystal never reports a directional change without CI confirmation — grounding > impressiveness |

---

## Team

| Role | Responsibility |
|---|---|
| Applied Scientists | Signal catalog, anomaly models, eval framework, benchmark calibration, Crystal prompt engineering |
| AI Engineers | ReAct agent loop, tool execution, streaming, cost optimization, context management |
| Software Engineers | Tool executor implementations, checkpoint system, API routes, DB schema |
| UX Designers | Agentic conversation UX, report rendering, Crystal placement on every page, anomaly alert patterns |
| PMs | JTBD coverage, skill prioritization, benchmark data strategy, customer co-design |
| Platform Engineers | Tool registry versioning, multi-tenancy, observability, rate limiting |

---

## What's In Scope (This Phase)

- Crystal as a ReAct agent with tool registry (replaces single-call `crystal.py`)
- Survey-level deep insight: top 5 themes, trends, anomalies, benchmarks
- Org-level portfolio intelligence: cross-survey view, biggest movers, cross-cutting themes
- Checkpoint system: triggered by streaming consumer, delta analysis vs. previous checkpoint
- New frontend routes: `/app/experience/*` with Crystal on every section
- Crystal context-aware placement: org scope, survey scope, topic scope

## What's Out of Scope (Future Phases)

- Closed-loop action management (Jira/Salesforce integration)
- Employee experience (eNPS, burnout signals)
- Multi-modal feedback (voice transcription, video)
- Real-time competitive benchmarking (live peer data)
- Fine-tuned custom models per org
