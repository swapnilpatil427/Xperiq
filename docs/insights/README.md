# Experient AI Insights — Research, Design & GTM

This folder is the design bible for **Experient AI Insights** — the feature that turns survey responses into trustworthy, agentic intelligence. It is intentionally separated from `docs/PRODUCT_PLAN.md` (cross-product roadmap) and `docs/TRACKER.md` (sprint-level execution).

**Date of last full refresh:** 2026-05-15
**Status:** Pre-implementation. Phase 2 ("AI Differentiation Engine") will be re-scoped against the architecture and decisions defined here.

---

## What is "AI Insights" at Experient?

> A continuously running pipeline of LLM-orchestrated agents and statistical methods that converts survey responses into **trustworthy, citable, actionable insights** — at a fraction of the time, cost, and complexity of legacy XM platforms.

We are not building "ChatGPT for surveys." We are building an **insight engine with safety rails** — one that:

1. **Cites every claim** back to real verbatims (no hallucinated insights)
2. **Quantifies uncertainty** (CIs, sample sizes, confidence scores) on every number
3. **Adapts its taxonomy** automatically from response embeddings — no manual tagging trees
4. **Runs in seconds** for free-tier orgs and **in real-time** for enterprise tiers
5. **Speaks plainly** — every insight comes with a "why" and a recommended action, in the user's language

---

## Documents in this folder

### Foundation (read first)

| File | What it covers | Primary audience |
|---|---|---|
| [RESEARCH.md](RESEARCH.md) | Scientific foundations: NPS/CSAT/CES math, key driver analysis, BERTopic, GoEmotions, hallucination control, bias audit, what we MUST implement to be credible | Applied scientists, engineers |
| [COMPETITIVE.md](COMPETITIVE.md) | Qualtrics ($6.75B Press Ganey/Forsta/InMoment acquisition), Medallia, Sprinklr, NICE, plus agentic upstarts (Enterpret, Maven AGI, Kraftful-in-Amplitude). Feature matrix and the exploitable wedge | PM, sales, exec |
| [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md) | **The contract.** What an "insight" is in our system: 4 layers (descriptive → diagnostic → predictive → prescriptive), per-question-type insight catalog, per-template-family insight bundles, scoring/ranking, trust signals | All |

### Architecture & Engineering

| File | What it covers | Primary audience |
|---|---|---|
| **[new_design/](./new_design/README.md)** | **v2 redesign** — automated vs manual, checkpoint linked list, Expert/Quick modes, Trail UX, Crystal docs | All — start here for pipeline evolution |
| [INTELLIGENCE_LIFECYCLE_README.md](INTELLIGENCE_LIFECYCLE_README.md) | **As-built lifecycle guide** — checkpoints, snapshots, trends, auto vs manual, anchor model ([HTML](intelligence-lifecycle-presentation.html)) | Engineering, PM, CX ops |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The scalable, distributed, global insight pipeline: ingestion, embeddings, vector store, LangGraph DAG, streaming, model routing, caching, multi-region, cost model | Engineering |
| [ENGINE_DECISIONS.md](ENGINE_DECISIONS.md) | **The opinionated choices.** Eight architectural refusals that produce simplicity. The "no" budget — what we will not build and why | All |
| [OPERATIONS_ECONOMICS.md](OPERATIONS_ECONOMICS.md) | The cheap + scalable + manageable claim defended with concrete numbers. Cost per insight at four scale points, ops headcount projection, why Qualtrics structurally cannot match | Engineering, finance, exec |

### UX & Variants

| File | What it covers | Primary audience |
|---|---|---|
| [UX.md](UX.md) | The Insight page IA, interaction model, trust panel, conversation interface, mobile/share views. Supersedes the existing `experient_ai_insights_dashboard/` mock | Design, frontend |
| [INSIGHT_PAGE_VARIANTS.md](INSIGHT_PAGE_VARIANTS.md) | **Four distinct Insights page variants** powered by the same engine: Editorial (default), Mission Cockpit, Spatial Canvas, Conversation Studio. PM/UX/Engineering team synthesis for each | Design, frontend, PM |

### Marketing & Strategy

| File | What it covers | Primary audience |
|---|---|---|
| [MARKETING.md](MARKETING.md) | Post-Qualtrics-monopoly positioning, messaging pillars, ICP, packaging, pricing, sales narratives, demo scripts | Marketing, sales |
| [THESIS_VERIFICATION.md](THESIS_VERIFICATION.md) | **The honest pressure test.** Ten counter-arguments to our thesis, each with a defense or accepted risk. Three scenarios that would actually kill the thesis | All — especially exec, board |

### Visual mockups (in `Designs/`)

| Folder | Variant |
|---|---|
| `Designs/experient_insights_v2_editorial/code.html` | Editorial Brief (default) — magazine-like with citations inline and bento grid |
| `Designs/experient_insights_v2_cockpit/code.html` | Mission Cockpit — dense terminal-style war-room |
| `Designs/experient_insights_v2_spatial/code.html` | Spatial Canvas — full 3D cinematic with floating gems |
| `Designs/experient_insights_v2_conversation/code.html` | Conversation Studio — chat-first with 3D crystal focal element |

---

## The "Team" that produced this

Per the project brief, this body of work was synthesized as if from a cross-functional team:

- **Applied scientists & psychometricians** — for the rigor in [RESEARCH.md](RESEARCH.md)
- **Customer experience researchers** — for behavioral and emotional dimension framing
- **Senior software & platform engineers** — for [ARCHITECTURE.md](ARCHITECTURE.md), [ENGINE_DECISIONS.md](ENGINE_DECISIONS.md), [OPERATIONS_ECONOMICS.md](OPERATIONS_ECONOMICS.md)
- **Senior product managers** — for [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md), [UX.md](UX.md), [INSIGHT_PAGE_VARIANTS.md](INSIGHT_PAGE_VARIANTS.md)
- **Marketing strategists & GTM** — for [MARKETING.md](MARKETING.md) positioning
- **A skeptical investor / red team** — for [THESIS_VERIFICATION.md](THESIS_VERIFICATION.md)

In execution, each of these viewpoints is encoded in the documents and should be re-litigated together as new evidence arrives.

---

## How to use this folder

| Role | Reading order |
|---|---|
| **PM writing Phase-2 specs** | INSIGHT_TAXONOMY → ENGINE_DECISIONS → UX → INSIGHT_PAGE_VARIANTS |
| **Engineer writing Phase-2 tickets** | ARCHITECTURE → ENGINE_DECISIONS → RESEARCH (the "MUST" checklist) → OPERATIONS_ECONOMICS |
| **Sales / Marketing** | COMPETITIVE → MARKETING → THESIS_VERIFICATION |
| **Exec / investor questions** | MARKETING → COMPETITIVE → OPERATIONS_ECONOMICS → THESIS_VERIFICATION |
| **Design** | UX → INSIGHT_PAGE_VARIANTS → mockups in `Designs/experient_insights_v2_*` |
| **First-time reader** | THESIS_VERIFICATION → ENGINE_DECISIONS → MARKETING |

---

## Hard product commitments encoded here

These commitments are the contract this folder defends. Anyone changing them must update all four design docs:

1. **First insight within 60 seconds** of survey close (free + paid tiers)
2. **Every narrative claim cites ≥2 verbatim quotes** — uncited claims are rejected at validation time
3. **Every metric carries a confidence interval** and a sample size; below threshold we refuse to display
4. **The insight taxonomy adapts** from response embeddings — no fixed topic tree to maintain
5. **Transparent per-credit pricing** — published, predictable, no enterprise sales gate for analysis
6. **60+ languages** out of the box (LLM-native; no per-language model pipeline)
7. **Reproducibility**: temperature 0 + pinned model versions; same inputs → identical outputs
8. **Quantitative claims come from code, never from an LLM**

And from [ENGINE_DECISIONS.md §3](ENGINE_DECISIONS.md), the standing refusals — what we will *not* build:

- No dashboard builder
- No taxonomy editor
- No SQL / formula / scripting
- No model picker
- No widget marketplace
- No per-org "advanced settings"
- No fifth page-variant called "Custom"

---

## The bet, in one line

> **The right architecture, ruthlessly executed in an 18-month window, beats more resources spent on the wrong architecture.**

See [THESIS_VERIFICATION.md §16](THESIS_VERIFICATION.md) for the full statement of the bet, the risks accepted, and the scenarios that would invalidate it.

---

## Status & next steps

The companion `docs/TRACKER.md` has 32 unstarted tasks under "Phase 2 — AI Differentiation Engine." With this folder finalized, that phase should be re-scoped against the [ARCHITECTURE.md](ARCHITECTURE.md) plan and the [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md) contract. The existing `InsightsDashboardPage.tsx` mock and `experient_ai_insights_dashboard/` design are superseded by [UX.md](UX.md) and the four variants in [INSIGHT_PAGE_VARIANTS.md](INSIGHT_PAGE_VARIANTS.md).

The Editorial Brief variant is the proposed default for new users; Mission Cockpit follows for power-user adoption; Spatial Canvas and Conversation Studio ship later as visual-brand and AI-native flag-planting respectively.
