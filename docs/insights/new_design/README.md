# Experient Insight Pipeline — Redesign (v2)

> **Status:** Design proposal (June 2026)  
> **Supersedes (partially):** [ARCHITECTURE.md](../ARCHITECTURE.md) execution model for checkpoints, run modes, and lineage  
> **Grounded in:** [intelligence-lifecycle-visual-guide.md](../intelligence-lifecycle-visual-guide.md) (as-built audit)

## Why this folder exists

The current pipeline produces useful insights but **conflates automated streaming runs with manual analyst runs**, writes checkpoints that **the next run does not read**, and lacks the **enterprise lineage** customers need to trust delta narratives. This redesign separates concerns, makes checkpoints a **linked list of immutable intelligence artifacts**, and gives customers **configurable depth** without sacrificing the “insane, futuristic” ambition.

## Documents

| # | Document | Audience | Contents |
|---|----------|----------|----------|
| 0 | [00_DEBATE_SYNTHESIS.md](./00_DEBATE_SYNTHESIS.md) | All | Multidisciplinary panel review — what we’re doing wrong, consensus principles |
| 1 | [01_CURRENT_STATE_CRITIQUE.md](./01_CURRENT_STATE_CRITIQUE.md) | Engineering, PM | Gap analysis vs your vision and vs `intelligence-lifecycle-visual-guide` |
| 2 | [02_ARCHITECTURE.md](./02_ARCHITECTURE.md) | Architects, platform | System topology, run modes, data flows, API surface |
| 3 | [03_DATA_MODEL.md](./03_DATA_MODEL.md) | Backend, data | Tables, linked-list checkpoints, lineage JSON, citations |
| 4 | [04_PIPELINE_SPEC.md](./04_PIPELINE_SPEC.md) | CrystalOS, applied science | Automated vs Manual (Expert / Quick), sampling, delta engine |
| 5 | [05_CONFIGURATION.md](./05_CONFIGURATION.md) | PM, CX ops, enterprise | Org/survey knobs: lookback, thresholds, caps |
| 6 | [06_UX_DESIGN.md](./06_UX_DESIGN.md) | Design, frontend | Insight Trail, history, manual run UX, Crystal handoff |
| 7 | [07_CRYSTAL_INTEGRATION.md](./07_CRYSTAL_INTEGRATION.md) | CrystalOS, frontend | Full report retrieval, deep links, document mode |
| 8 | [08_MIGRATION_ROADMAP.md](./08_MIGRATION_ROADMAP.md) | Engineering leads | Phased rollout, compatibility, risks |

## Fastest path to customer value (Phase 0.5 — 5–8 days)

The full v2 design is an 18-week, 7-phase roadmap. But **the single highest-value customer-visible feature** — intelligence that knows its own history and shows customers what changed — can be unlocked in one sprint without any new tables or Trail UI.

**The two root causes blocking investigation details today:**
1. `node_delta_compute` runs inside `node_publish` (AFTER narrate) — the LLM never gets delta facts and cannot narrate "NPS dropped 3 consecutive checkpoints"
2. Prior checkpoint summaries are never loaded into pipeline state — the LLM has no historical context at all

**Fix those two things** (CrystalOS changes + 2 minimal schema migrations: `ADD COLUMN meaningful_delta` + CHECK constraint fix) + expose delta in `GET /api/insights/:surveyId/list` + add a delta chip to the existing Intelligence page = customers see complete investigation details this sprint.

See [08_MIGRATION_ROADMAP.md Phase 0.5](./08_MIGRATION_ROADMAP.md) for the exact task list.

---

## One-sentence vision

**Automated runs are incremental intelligence over a frozen past; manual runs are deliberate deep dives over a chosen window — both produce immutable, citable, linked artifacts customers can audit.**

## Default configuration (v2)

| Setting | Default | Scope | Who can change |
|---------|---------|-------|----------------|
| Automated insights (card updates) | **on** | Per survey | brand_admin, survey_owner |
| Automated report generation | **on** | Per survey | brand_admin, survey_owner |
| Automated prior checkpoint lookback | **5** checkpoints | Per survey (org override) | brand_admin |
| Automated lookback time window | **90 days** max | Per survey | brand_admin |
| Stream trigger threshold | **10** new responses | Per survey (range: 5–500) | brand_admin, survey_owner |
| Report regen threshold (automated) | **25** new responses | Per survey | brand_admin |
| Refresh lookback window | **30 days** | Per survey | brand_admin |
| Refresh minimum response count | **25** responses (fallback) | Per survey | brand_admin |
| Refresh daily limit | **5** per day | Per survey | brand_admin |
| Manual Expert snapshot depth | 5 metric snapshots + full corpus if ≤500 responses | Per run | brand_admin |
| Manual Quick sample cap | 150 responses, 2 snapshots | Per run | brand_admin |
| Checkpoint write gate (automated) | Meaningful delta OR first-of-tier OR ≥200 new since last full checkpoint | Per survey | brand_admin |
| Custom Analysis | **on** | Per survey | brand_admin |
| Settings visibility | Read-only for all members | — | (by design) |
| Settings editing | brand_admin (org + survey); survey_owner (own survey) | — | (by design) |

**Credit costs (all runs charged):**

| Run type | Default credits |
|----------|----------------|
| Automated checkpoint | 5 |
| Automated report document | 15 |
| Refresh | 8 |
| Manual Quick | 15 |
| Manual Expert | 40 |
| Custom Analysis | 25–75 (corpus size) |

## Relationship to existing docs

- **[INSIGHT_TAXONOMY.md](../INSIGHT_TAXONOMY.md)** — unchanged contract for what an *insight* is (layers, citations, trust)
- **[ENGINE_DECISIONS.md](../ENGINE_DECISIONS.md)** — still valid: LLM narrates, code computes, one pipeline three speeds → **refined** into Automated/Manual with shared tools
- **[intelligence-lifecycle-visual-guide.md](../intelligence-lifecycle-visual-guide.md)** — describes **today**; this folder describes **target**
