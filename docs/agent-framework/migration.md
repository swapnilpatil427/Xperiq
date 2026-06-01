# XOS Migration Plan

**Status:** Design  
**Last updated:** 2026-05-21

---

## Guiding Principle

Nothing breaks. The pipeline runs today. Crystal runs today. Migration happens in parallel — skills are added alongside existing agents, not replacing them. When a skill is stable (eval_score ≥ 0.80 for 50 runs), the old code gets deleted.

No big-bang migration. No feature flags that stay on forever.

---

## Current Agents → Target Skills

### Complete Agent Mapping

| Current | File | Target Skill | Priority |
|---------|------|-------------|----------|
| Insight narrator | `graphs/insights.py: node_narrate` | `insight-narrator` | P1 |
| QC agent | `agents/qc.py` | `survey-qc` | P1 |
| Survey creator | `agents/creator.py` | `survey-creator` | P2 |
| Copilot | `agents/copilot.py` | `copilot-analyst` | P2 |
| Refiner | `agents/refiner.py` | `survey-refiner` | P2 |
| NPS specialist | `specialists/nps.py` | `specialist-nps` | P1 |
| CES specialist | `specialists/ces.py` | `specialist-ces` | P1 |
| CSAT specialist | `specialists/csat.py` | `specialist-csat` | P1 |
| ENPS specialist | `specialists/enps.py` | `specialist-enps` | P2 |
| Custom specialist | `specialists/custom.py` | `specialist-custom` | P2 |
| Compliance agent | `agents/compliance.py` | `compliance-scanner` | P3 |
| Recommender | `agents/recommender.py` | `survey-recommender` | P3 |

### What Stays (Not Migrated to Skills)

| Component | Reason |
|-----------|--------|
| Crystal ReAct loop (`agents/crystal.py`) | Orchestrator, not a skill — stays as-is |
| LangGraph DAG structure (`graphs/insights.py`) | Orchestrator — only the node implementations move to skills |
| Tool functions (`tools/*.py`, `crystal/tools.py`) | Tool dispatch layer — skills call these, they don't become skills |
| DB pool, Redis, OpenRouter client | Infrastructure — not agents |
| Progressive tier consumer (`consumers/`) | Trigger logic — not an agent |

---

## What Changes vs. What Stays

### Things That Change

1. **Node implementations** — Each `node_*` function in `graphs/insights.py` delegates to `skill_registry.execute()` instead of calling agent code inline. The node function itself becomes 3 lines.

2. **Specialist dispatch** — `node_route_specialists` currently calls specialist Python classes. It will call `skill_registry.execute("specialist-{type}", ...)`.

3. **Crystal tool dispatch** — `dispatch_tool()` in `crystal/tools.py` currently calls tool functions directly. It stays direct Python for internal tools. MCP only for future external tools.

4. **Prompt location** — Prompts move from hardcoded strings in `.py` files to `SKILL.md` body sections. Python files keep the dispatch logic only.

### Things That Don't Change

- LangGraph DAG topology (edges, node names, state schema)
- Crystal ReAct loop structure
- All tool functions (`getTopics`, `getMetrics`, etc.)
- Database schema (except new columns for memory and feedback)
- API routes and request/response shapes
- Test structure (existing tests cover the same behavior)

---

## Sprint Plan

### Sprint 1: Foundation (no user-facing change)

**Goal:** Skill runtime exists and loads skills. No agents migrated yet.

Tasks:
- [ ] Create `agents/skills/` directory structure
- [ ] Implement `lib/skill_registry.py` — file scan, embedding, cosine search
- [ ] Implement `lib/skill_runtime.py` — SKILL.md loader, LLM dispatch, eval check
- [ ] Implement `lib/tool_dispatcher.py` — Python function dispatch from plugin.json
- [ ] Write `agents/skills/plugin.json` — maps all 13 tool names to Python paths
- [ ] Add unit tests for registry (find skill by description), runtime (load + execute), dispatcher (call Python function)

Exit criterion: `skill_registry.execute("insight-narrator", test_input, ctx)` returns a correct result in a test.

---

### Sprint 2: P1 Skills (pipeline quality gate)

**Goal:** Migrate the three most-used pipeline agents to skills. Existing code still present as fallback.

Skills to create:
- `agents/skills/insight-narrator/` — SKILL.md, EVALS.md, empty EXAMPLES.md
- `agents/skills/specialist-nps/`
- `agents/skills/specialist-ces/`
- `agents/skills/specialist-csat/`

Pipeline change: add `USE_SKILL_RUNTIME=false` flag in `constants.py`. When `true`, pipeline nodes call `skill_registry.execute()`. When `false`, existing code runs. Default: `false` in production.

Exit criterion: run pipeline with `USE_SKILL_RUNTIME=true` against 20 surveys. Compare `quality_score` before and after. New skills must score ≥ existing baseline.

---

### Sprint 3: Observability (prerequisite for quality tracking)

**Goal:** All three observability fixes live. Needed before Sprint 4 so we can measure quality.

Tasks:
- [ ] Implement `lib/tracer.py` (Langfuse, no-op without key)
- [ ] Implement `lib/hallucination_scorer.py` (Gemini Flash)
- [ ] Implement `lib/pii_scrubber.py` (regex, reuses `_PII_PATTERNS`)
- [ ] Add `langfuse>=2.0` to `requirements.txt`
- [ ] Wire tracer into `main.py` lifespan (flush on shutdown)
- [ ] Wire tracer into pipeline nodes (span per node)
- [ ] Wire tracer into Crystal turns
- [ ] Replace `node_verify` with hallucination scorer
- [ ] Wire PII scrubber into tracer span creation

Exit criterion: pipeline run produces Langfuse trace with node spans. `node_verify` uses Gemini Flash. No email/phone patterns visible in Langfuse input fields.

---

### Sprint 4: Memory Layer

**Goal:** Crystal token usage reduced by ≥ 50%.

Tasks:
- [ ] Add `context_state` JSONB column to `crystal_threads`
- [ ] Implement `lib/memory.py` — all 4 layers (cache reads/writes)
- [ ] Wire L3 survey facts write at `node_publish`
- [ ] Wire L3 facts read at Crystal startup
- [ ] Implement thread compression (turn 5, every 3 turns)
- [ ] Implement L1 semantic cache (Redis, 24h TTL)
- [ ] Add `crystal_org_memory` table with pgvector column
- [ ] Wire L4 org memory read/write

Exit criterion: measure avg tokens per Crystal call before and after. Target: ≥ 50% reduction. No regression in Crystal answer quality (eval scores stable).

---

### Sprint 5: P2 Skills + Skill Flip

**Goal:** All agents migrated. Remove `USE_SKILL_RUNTIME` flag and old agent code.

Skills to create:
- `agents/skills/survey-creator/`
- `agents/skills/copilot-analyst/`
- `agents/skills/survey-refiner/`
- `agents/skills/survey-qc/`
- `agents/skills/specialist-enps/`
- `agents/skills/specialist-custom/`

Skill flip:
- Remove `USE_SKILL_RUNTIME` flag
- Delete old agent code that has been superseded (after 50+ production runs with score ≥ 0.80)
- Update `CLAUDE.md` — "Adding a new agent" section points to skills, not Python classes

---

### Sprint 6: A2A Phase 1 + P3 Skills

**Goal:** Skills are A2A-discoverable. Remaining agents migrated.

Tasks:
- [ ] Generate agent cards for all `shared: true` skills
- [ ] Add `/a2a/{skill}/.well-known/agent.json` routes
- [ ] Create `agents/skills/compliance-scanner/`
- [ ] Create `agents/skills/survey-recommender/`
- [ ] EXAMPLES.md auto-population verified in production (eval_score ≥ 0.75 writes examples)

---

### Post-Sprint: DSPy + Weekly Optimization

After EXAMPLES.md banks have ≥ 50 entries per skill:
- [ ] Add `scheduler.py` job for weekly DSPy optimization
- [ ] Braintrust CI integration for pre-deploy eval gating

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Skill prompts produce lower quality than hardcoded prompts | Medium | High | `USE_SKILL_RUNTIME` flag — can flip back instantly |
| Langfuse adds latency to pipeline | Low | Medium | No-op design + async flush; measure p99 before/after Sprint 3 |
| Thread compression loses context | Low | High | Keep full `messages` array; compression is read-path only |
| Gemini Flash unavailable | Low | Medium | Hallucination scorer returns neutral 0.75 on error — pipeline never blocked |
| pgvector extension not installed | Low | High | Verify at startup; L4 is gracefully degraded if missing |
| DSPy optimization produces worse prompts | Low | Medium | CI eval gate — only auto-deploy if ≥ 5% improvement on held-out set |

---

## Definition of Done

XOS migration is complete when:

1. `agents/skills/` contains all 12 skills with SKILL.md + EVALS.md + EXAMPLES.md
2. No agent logic lives in `agents/agents/*.py` — those files are deleted
3. Langfuse traces exist for 100% of production pipeline runs and Crystal sessions
4. `crystal_threads.context_state` is populated for all active threads
5. `agents/a2a/cards/` contains cards for all `shared: true` skills
6. `CLAUDE.md` "Adding a new agent" section says: create a folder in `agents/skills/`, no Python required
