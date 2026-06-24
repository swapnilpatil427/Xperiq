> **Moved:** Authoritative copy lives in [`crystalos/SKILLS_CATALOG.md`](../../crystalos/SKILLS_CATALOG.md). This copy is kept here for design-doc cross-reference only.

# CrystalOS Skills Catalog

All 13 skills in the CrystalOS.

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
