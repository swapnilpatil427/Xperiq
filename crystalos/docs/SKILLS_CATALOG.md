
# CrystalOS Skills Catalog

Skills in the CrystalOS, grouped by tier. Discovery is by directory scan of `crystalos/skills/`.

---

## P1 — Core Pipeline Skills

These skills replace the per-node agent logic in `graphs/insights.py` and the specialist dispatch.

| Skill | Replaces | Purpose | Allowed Tools | Status |
|-------|----------|---------|---------------|--------|
| `insight-narrator` | `node_narrate` in `graphs/insights.py` | Generates the full narrative insight report from topic clusters, metrics, and verbatims | get_survey_overview, get_topic_details, get_metric_history, get_verbatims | Beta |
| `specialist-nps` | `specialists/nps.py` | Deep NPS loyalty analysis: promoter/passive/detractor breakdown, churn risk signals | get_metrics, get_topic_details, get_verbatims, get_benchmark_comparison | Beta |
| `specialist-ces` | `specialists/ces.py` | CES friction analysis: effort drivers, process friction points, resolution quality | get_metrics, get_topic_details, get_verbatims | Beta |
| `specialist-csat` | `specialists/csat.py` | CSAT satisfaction driver analysis: top_drivers, dissatisfiers, actionability | get_metrics, get_topic_details, get_verbatims | Beta |

---

## P2 — Copilot Skills

These skills replace the Copilot agent logic for survey creation and editing.

| Skill | Replaces | Purpose | Allowed Tools | Status |
|-------|----------|---------|---------------|--------|
| `survey-qc` | `agents/qc.py` | Quality control scan: leading questions, double-barreled, scale errors, bias | None (works on provided questions) | Beta |
| `survey-creator` | `agents/creator.py` | Creates complete survey from stated intent: questions, scales, order, skip logic hints | None | Beta |
| `copilot-analyst` | `agents/copilot.py` | Chat-based survey editor: rephrase, add, remove, reorder, add skip logic via NL | None | Beta |
| `survey-refiner` | `agents/refiner.py` | Holistic survey improvement pass: clarity, bias removal, flow, scale standardization | None | Beta |
| `specialist-enps` | `specialists/enps.py` | eNPS / employee engagement analysis: retention risk, manager signals, culture health | get_metrics, get_topic_details, get_verbatims | Beta |
| `specialist-custom` | `specialists/custom.py` | Generic specialist for non-standard survey types: relative comparisons, pattern ranking | get_metrics, get_topic_details, get_verbatims | Beta |

---

## P3 — Extended Skills

| Skill | Replaces | Purpose | Allowed Tools | Status |
|-------|----------|---------|---------------|--------|
| `compliance-scanner` | `agents/compliance.py` | GDPR/CCPA compliance, bias detection, WCAG accessibility, sensitive topic handling | None | Beta |
| `survey-recommender` | `agents/recommender.py` | Post-survey strategy: distribution channels, action planning, cadence, benchmarking | None | Beta |
| `crystal-analyst` | `agents/crystal.py` (ReAct loop) | Crystal conversational XM analyst: answers data questions, cites sources, suggests follow-ups | get_survey_overview, get_topic_details, get_metric_history, get_insights_list, get_verbatims, get_benchmark_comparison, get_driver_analysis, get_segment_breakdown, get_anomaly_events | Beta |

---

## P4 — Analytical Skills (Dynamic Exploration & Reporting)

These skills let Crystal *answer analytical questions and generate reports* on demand. Each does
one analysis type well and emits structured output; `crystal-analyst` and the insight pipeline can
delegate to them, and `report-composer` / `proactive-insights` compose their outputs.

| Skill | Capability | Purpose | Allowed Tools | Status |
|-------|-----------|---------|---------------|--------|
| `data-explorer` | Summarize / explore | Dynamic qualitative summarization: themes, topics, takeaways, non-quant trends; adapts the lens to the question | get_survey_overview, get_topic_details, get_verbatims, get_cross_survey_themes, get_metric_history | Beta |
| `trend-analyst` | Trends over time | Metric & theme trajectories, direction/magnitude/window, change points, signal-vs-noise | get_metric_history, get_checkpoint_history, get_topic_details, get_anomaly_events, get_survey_overview | Beta |
| `segment-analyst` | Trends across segments | "Average trap" detector: between-segment gaps, ranking, hidden underperformers, small-n caveats | get_segment_breakdown, get_metric_history, get_verbatims, get_survey_overview | Beta |
| `driver-analyst` | Key drivers | Importance × performance priority map: what moves the metric and where leverage lives | get_driver_analysis, get_topic_details, get_verbatims, get_metric_history | Beta |
| `proactive-insights` | Proactive insights/report | Decides what's worth pushing unprompted; ranks anomaly/trend/driver/segment signals into notification-ready cards | get_anomaly_events, get_metric_history, get_driver_analysis, get_segment_breakdown, get_survey_overview, get_topic_details | Beta |
| `report-composer` | Generate report | Assembles analytical outputs + benchmarks into an export-ready, sectioned report with exec summary and action appendix | get_survey_overview, get_insights_list, get_metric_history, get_segment_breakdown, get_driver_analysis, get_topic_details, get_verbatims, get_benchmark_comparison | Beta |

> **"Recommend actions to improve key metrics & sentiment"** is already covered by
> `action-recommender` + the 12 domain advisors (action suite). The P4 analytical skills feed
> their analysis into `action-recommender` (via `proactive-insights.suggested_skill` and
> `report-composer.action_appendix`) so analysis and recommendation stay one pipeline.

### Capability → skill map

| User-facing capability | Skill(s) |
|------------------------|----------|
| Summarize — themes, topics, takeaways, non-quant trends | `data-explorer` |
| Generate report | `report-composer` (narrative engine: `insight-narrator`) |
| Proactive insights / report | `proactive-insights` |
| Analyze trends over time | `trend-analyst` |
| Analyze trends across segments | `segment-analyst` |
| Analyze key drivers | `driver-analyst` |
| Recommend actions to improve metrics & sentiment | `action-recommender` + domain advisors |

---

## Skill Architecture

Each skill folder contains:

```
crystalos/skills/<skill-name>/
  SKILL.md       ← instructions, input/output schema, tool declarations
  EVALS.md       ← quality criteria and scoring rules
  EXAMPLES.md    ← auto-generated human view of production examples
  references/    ← optional: domain knowledge, style guides
```

### Execution flow

```
SkillRegistry.execute(skill_name, input, ctx)
  │
  └── SkillRuntime.execute(skill_name, meta, input, ctx)
        │
        ├── Load SKILL.md body + references/
        ├── Fetch top-3 examples from skill_examples DB table
        ├── Build system prompt (body + refs + examples)
        ├── Call LLM via call_agent()
        ├── Parse JSON output
        ├── Run EVALS.md criteria checks
        │
        ├── IF eval fails AND max_retries > 0:
        │     └── Retry with failure context injected
        │
        └── IF eval_score >= 0.75:
              └── Write example to skill_examples (async)
```

---

## What Stays (Not Migrated to Skills)

| Component | Location | Reason |
|-----------|----------|--------|
| Crystal ReAct loop orchestration | `crystalos/agents/crystal.py` | Orchestrator — stays as-is |
| LangGraph DAG topology | `crystalos/graphs/insights.py` | Orchestrator — only nodes delegate to skills |
| Tool executor functions | `crystalos/crystal/tools.py` | Tool layer — skills call these |
| DB pool, Redis, OpenRouter client | `crystalos/lib/` | Infrastructure — not agents |
| Progressive tier consumer | `agents/consumers/` | Trigger logic — not an agent |

---

## Adding a New Skill

See [QUICKSTART.md](./QUICKSTART.md) — add a skill in ~10 minutes, no Python required.
