# Experient Agent Framework — XOS (Experience Operating System)

**Status:** Architecture design — not yet fully implemented  
**Last updated:** 2026-05-21  
**Owner:** AI Platform team

> This is a living document. Update it as decisions are made, patterns change, or new issues are found. Every architectural change should be reflected here before implementation.

---

## What This Is

XOS is the agent platform layer that powers Crystal, Copilot, and all AI capabilities in Experient. It is not a new framework built from scratch — it is a set of conventions and thin infrastructure layered on top of what already exists (LangGraph, OpenRouter, FastAPI, Redis, Postgres).

The core idea: **every AI capability is a SKILL.md file**. Skills are self-describing, self-evaluating, and self-improving. The orchestrator never changes — it just discovers and calls skills by name. Adding a new agent means adding one file.

---

## Design Principles

1. **One file = one agent.** A SKILL.md file is the complete definition of an agent: instructions, tool declarations, evaluation criteria, and knowledge references. No Python required to add a new capability.

2. **Orchestrators never change.** LangGraph DAGs, Crystal's ReAct loop — these stay as-is. They call `skill_registry.execute("skill-name", input, ctx)` instead of agent classes. That is the only wiring change.

3. **Internal tools = direct Python calls.** `getTopics`, `getMetrics`, `getVerbatims` are Python functions. They don't need MCP wrapping. MCP is only for genuinely external systems (Jira, Slack, Salesforce).

4. **Every skill evaluates itself.** Each skill has an `EVALS.md` defining quality criteria. The runtime checks these after every execution. Skills that fail retry with the failure context injected.

5. **Skills learn from production.** Every execution with eval_score ≥ 75 is written to `EXAMPLES.md`. Future executions of the same skill get the top-3 most similar past examples as few-shot context automatically.

6. **Cheap memory over expensive context.** Rather than passing 10 full message turns (5,000+ tokens), compress threads into structured facts (200 tokens). Cache identical questions. Pre-compute survey facts. 62% fewer tokens per Crystal call with equal or better quality.

7. **A2A-compatible contracts.** Every skill has a clean JSON input/output schema with no hidden shared state. This makes skills callable via the Google A2A protocol with no changes when that becomes the standard.

---

## Document Index

| File | What it covers |
|------|---------------|
| [architecture.md](./architecture.md) | Full system diagram, layer breakdown, component responsibilities |
| [skills.md](./skills.md) | SKILL.md format spec, plugin.json, EXAMPLES.md, EVALS.md, references/ |
| [memory.md](./memory.md) | 4-layer memory system, context compression, semantic cache |
| [observability.md](./observability.md) | Langfuse tracing, hallucination gate, PII scrubbing, eval stack |
| [a2a.md](./a2a.md) | A2A protocol integration, agent card design, future inter-agent calls |
| [migration.md](./migration.md) | Exact mapping from current agents → skills, sprint plan |

---

## Current State vs Target State

| Dimension | Current | Target |
|-----------|---------|--------|
| Adding a new agent | Edit Python, wire into graph | Create one SKILL.md file |
| Prompts | Hardcoded in .py files | In SKILL.md + references/ |
| Evaluation | Inline LLM judge, no persistence | EVALS.md criteria + logged to Langfuse |
| Self-improvement | 2-retry correction loop only | EXAMPLES.md auto-filled + weekly DSPy optimization |
| Tool discovery | 13 hardcoded tools | Semantic search over all registered skills |
| Memory | 10 raw message turns (~5k tokens) | Structured compression + cache (~1.5k tokens) |
| Observability | Prometheus + structlog only | Langfuse distributed traces + hallucination scoring |
| External tools | Not connected | MCP servers per domain (Jira, Slack, etc.) |
| Inter-agent calls | Python imports | A2A protocol (future) |

---

## Known Gaps — Open Issues

These are known architectural problems. Each links to the relevant design doc.

### Original Gaps

| # | Issue | Impact | Design doc | Status |
|---|-------|--------|-----------|--------|
| G1 | No distributed tracing across multi-step skill chains | Can't debug production failures | [observability.md](./observability.md) | Design ready |
| G2 | Hallucination verifier is LLM-asks-LLM (unreliable) | False confidence in insight quality | [observability.md](./observability.md) | Design ready |
| G3 | PII in trace logs (ai_operation_logs, future Langfuse) | GDPR compliance risk | [observability.md](./observability.md) | Design ready |
| G4 | Crystal passes 10 raw turns (~5k tokens) every call | Token waste, coherence loss in long sessions | [memory.md](./memory.md) | Design ready |
| G5 | No semantic response cache | Identical questions cost full LLM call | [memory.md](./memory.md) | Design ready |
| G6 | Crystal has no data freshness awareness | Answers about stale insights with no warning | [memory.md](./memory.md) | Design ready |
| G7 | No model fallback on primary model failure | Hard failure when one model is down | [architecture.md](./architecture.md) | Design ready |
| G8 | Crystal context window grows unbounded in ReAct loop | Silent truncation at high tool turn counts | [memory.md](./memory.md) | Design ready |
| G9 | No UI feedback collection (thumbs up/down) | Highest quality training signal not collected | [observability.md](./observability.md) | Not designed |
| G10 | No A/B testing for prompt changes | Deploys are blind — can't measure prompt quality | [observability.md](./observability.md) | Not designed |
| G11 | No per-org rate limiting | One org can affect all others via circuit breaker | [architecture.md](./architecture.md) | Not designed |
| G12 | Partial pipeline publish not possible | Failed runs leave users with stale data | [architecture.md](./architecture.md) | Not designed |

### New Gaps (Research Analysis — 2026-05-22)

#### Design Contradictions — Must Fix Before Memory Layer (Sprint 4)

| # | Issue | Impact | Design doc | Status |
|---|-------|--------|-----------|--------|
| G13 | L1 cache key excludes survey_id — `flush semantic_cache:{survey_id}:*` matches nothing | Cache never invalidated on insight update; stale answers served forever | [memory.md](./memory.md) | Fix in memory.md |
| G14 | L1 near-match via hash lookup — hash key cannot compute cosine similarity | "Near-duplicate questions return cache hit" claim is impossible with current design | [memory.md](./memory.md) | Fix in memory.md |
| G15 | L2 context_state has no decision supersession — contradicting decisions accumulate | LLM receives contradictory context after user changes mind mid-session | [memory.md](./memory.md) | Fix in memory.md |
| G16 | L4 org memory write uses "on disconnect" — no disconnect event in HTTP/SSE | Org memory is never written in production (no session end signal) | [memory.md](./memory.md) | Fix in memory.md |
| G17 | EXAMPLES.md is a flat file — concurrent pipeline runs corrupt it | Examples bank silently corrupts under concurrent runs | [skills.md](./skills.md) | Move to DB table |
| G18 | Embedding model name not stored alongside vectors | Upgrading embedding model breaks all stored vectors silently; cosine search returns nonsense | [skills.md](./skills.md) | Schema fix |

#### Missing Production Concerns — High Value

| # | Issue | Impact | Design doc | Status |
|---|-------|--------|-----------|--------|
| G19 | No per-skill resource limits (timeout, max_output_tokens) | Runaway skill consumes unbounded tokens, halts pipeline | [skills.md](./skills.md) | Not designed |
| G20 | Crystal has no client-disconnect detection | Orphaned sessions burn $0.10–0.50 in tokens after client leaves | [architecture.md](./architecture.md) | Fix available |
| G21 | Tool call memoization missing — same tool called twice in one session | Duplicate DB queries + duplicate tokens in context per Crystal turn | [memory.md](./memory.md) | Not designed |
| G22 | Anthropic prompt caching not used — system prompt re-tokenized every call | 80–90% savings on repeated system prompt tokens uncaptured | [memory.md](./memory.md) | Not designed |
| G23 | Context injection order not specified — survey facts likely in middle (low-attention zone) | LLM attention degraded on most query-relevant data | [memory.md](./memory.md) | Fix available |
| G24 | L4 org memory conflates user and org preferences (no user_id scope) | User A's display preferences applied to User B in the same org | [memory.md](./memory.md) | Schema fix |
| G25 | No pipeline idempotency lock — concurrent runs for same survey produce undefined state | Concurrent manual refreshes corrupt insight_records | [architecture.md](./architecture.md) | Fix available |
| G26 | No audit trail for AI decisions — no record of why an insight was generated | Can't explain Crystal answers (GDPR right to explanation, SOC2) | [observability.md](./observability.md) | Not designed |
| G27 | Tool result token budget is ~3× underestimated in context budget table | Context window fills 3× faster than the design predicts in practice | [memory.md](./memory.md) | Calibration needed |
| G28 | Cold start: no L3 survey facts until first pipeline run completes | Crystal makes 3–4 extra tool calls on first-ever session for a survey | [memory.md](./memory.md) | Not designed |
| G29 | Braintrust is cloud-only — eval data (production LLM I/O) leaves customer environment | Customer data exits for eval storage; violates enterprise data residency requirements | [observability.md](./observability.md) | Policy needed |
