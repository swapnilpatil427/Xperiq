# XOS Architecture Research & Gap Analysis

**Status:** Research  
**Last updated:** 2026-05-22  
**Scope:** Deep analysis of all six framework docs against current state of the art in agent memory, context management, and production observability

---

## Executive Summary

The current XOS design is architecturally sound in its core choices — LangGraph DAG, SKILL.md one-file-per-agent, 4-layer memory, Langfuse observability. The gaps are not in the vision but in three areas:

1. **Design contradictions** — specific mechanisms described in the docs that would not work as written
2. **Missing layers** — significant production concerns not addressed anywhere
3. **Better tools exist** — the design chooses a custom implementation where a library now solves the problem better

This document catalogs all three. Each finding links to the relevant doc and proposes a specific fix.

---

## Part 1: Design Contradictions (Things That Would Break as Written)

### C1 — L1 Semantic Cache: Hash Lookup vs. Cosine Search Contradiction

**Doc:** `memory.md` — "L1: Semantic Response Cache"

The doc says two things simultaneously that cannot both be true:

1. *"Quantize the embedding to 8-bit integers... look up `semantic_cache:{org_id}:{hash}`"* — this is a hash lookup (exact key match)
2. *"Near-match threshold: cosine similarity ≥ 0.92"* — this is a vector search (scan all cached vectors)

An 8-bit quantized hash lookup returns either a hit or a miss. It does not compute cosine similarity to nearby vectors. Near-match detection requires either:
- A full scan of all cached embeddings (O(n), expensive)
- An approximate nearest neighbor index (FAISS, Annoy, or Redis's `vector search` module)

**Fix:** Two choices:

**Option A (exact cache only):** Remove the "near-match" claim. The cache hits on near-identical questions only (same embedding quantization bucket). Fast, simple, predictable. Miss rate is higher.

**Option B (true semantic cache):** Use Redis's built-in vector search module. Keys are stored with their embedding vectors. On lookup, run ANN search for `cosine_similarity ≥ 0.92` against all keys for that org. Returns cached answer if similar. More powerful, requires Redis Stack or Redis Cloud.

Recommendation: Option B if Redis Stack is available; Option A otherwise. The doc should clarify which.

---

### C2 — L1 Cache Invalidation Key Mismatch

**Doc:** `memory.md` — "Staleness: cache entries are invalidated when a new insight generation run publishes... flush `semantic_cache:{survey_id}:*`"

The key format defined one paragraph earlier is `semantic_cache:{org_id}:{hash}`. The survey_id is not in the key. A KEYS scan for `semantic_cache:{survey_id}:*` would return nothing.

**Fix:** Change the key format to include survey_id: `semantic_cache:{org_id}:{survey_id}:{hash}`. This enables per-survey invalidation on publish and per-org bulk invalidation on demand.

---

### C3 — L2 Thread Compression: No Decision Supersession

**Doc:** `memory.md` — L2 context_state schema

The `decisions` array:
```json
{"decisions": [
  {"turn": 3, "topic": "NPS analysis", "conclusion": "Passives are primary concern"},
  {"turn": 7, "topic": "action plan", "conclusion": "User wants to focus on onboarding"}
]}
```

Has no mechanism for: a decision at turn 10 that contradicts turn 3 ("actually, focus on detractors, not passives"). Both decisions sit in the array with equal weight. The LLM will see contradictory context.

**Fix:** Add a `superseded_by` field and status: `{"turn": 3, "status": "superseded", "superseded_by_turn": 10}`. The compression step, when it runs, should detect contradictions and mark older items as superseded before writing `context_state`.

---

### C4 — L4 Org Memory: No Session End Signal

**Doc:** `memory.md` — "Write path: At the end of each Crystal session (on disconnect or after a high-quality response)"

Crystal sessions are HTTP/SSE connections. FastAPI's `StreamingResponse` and `EventSourceResponse` do not fire a callback on client disconnect. When the browser tab closes, the server keeps streaming into the void until the TCP connection drops (seconds to minutes later). There is no "session end" event.

**Fix:** Write L4 memory at the end of each ReAct loop completion (non-streaming) or after each `_run_react_loop_streaming` generator exhaustion (streaming). This is deterministic. Alternatively, write asynchronously on a 5-minute heartbeat job that scans for threads with `last_active_at > 5 min ago AND context_state_written_at < last_active_at`. Session end is inferred, not detected.

---

### C5 — Skills: EXAMPLES.md as a File Is Unsafe for Concurrent Writes

**Doc:** `skills.md` — "EXAMPLES.md is auto-populated by the runtime"

If two pipeline runs for the same skill complete at the same time (possible with high traffic), both try to append to the same `EXAMPLES.md` file. File appends in Python are not atomic across processes. The result is file corruption.

**Fix:** Move examples to a DB table: `skill_examples(skill_name, eval_score, input_json, output_json, run_id, created_at)`. The EXAMPLES.md format can be generated from the table on demand (for human review) but reads and writes happen through the DB. The skill runtime queries the table for top-3 similar examples — faster and safer.

---

### C6 — Skill Embedding Model Versioning: Silent Breakage Risk

**Doc:** `skills.md` — "The registry discovers skills by... embedding each skill's description using `tools/embeddings.py`"
**Doc:** `memory.md` — "L4: pgvector column" and "L1: quantize embedding"

All three locations (skill registry, L4 org memory, L1 semantic cache) use `tools/embeddings.py`. This module is a single global dependency. If the embedding model changes (e.g., from `text-embedding-3-small` to `text-embedding-3-large`, which has a different vector dimensionality), every stored vector becomes incompatible — but silently. Cosine similarity between vectors from different models is meaningless. ANN searches will return wrong results.

**Fix:** Store the embedding model name and version alongside every vector. Add an `embedding_model` column to `crystal_org_memory` and `skill_registry`. Include model name in the L1 cache key: `semantic_cache:{org_id}:{survey_id}:{model_name}:{hash}`. On startup, check that the current model matches stored vectors; if not, trigger re-indexing.

---

## Part 2: Missing Layers (Production Concerns Not Addressed)

### M1 — Anthropic Prompt Caching: The Biggest Token Reduction Not Mentioned

**Missing from:** `memory.md`, `architecture.md`

Crystal builds a system prompt on every call that includes the full insights list, topics table, and metrics block — typically 2,000–4,000 tokens. This prompt changes rarely within a conversation (the data is the same). The Anthropic API supports `cache_control` blocks that cache prompt segments at **$0.30/MTok for reads vs $3.00/MTok for standard** — a 10× cost reduction.

The memory doc claims 62% token reduction via the 4-layer design. Prompt caching alone could reduce input token costs by 80–90% for the fixed parts of the system prompt.

**How it works:**
```python
messages = [
    {
        "role": "system",
        "content": [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"}  # Cache this block
            }
        ]
    },
    ...
]
```
Cache TTL: 5 minutes. The system prompt (insights + topics + metrics) is stable across multiple turns in a Crystal conversation — well within the 5-minute TTL.

**Impact estimate:** For a Crystal conversation with 6 turns, turns 2–6 would read from cache. At 3,000 tokens system prompt × 5 cached reads = 15,000 tokens at $0.30 instead of $3.00 = $4.05 vs $0.045. 89% savings on the system prompt alone.

**Note:** This is Anthropic Claude-specific. The design should abstract it behind the `call_agent` interface — OpenRouter models won't benefit, but when routing to Claude directly, this should be automatic.

---

### M2 — Tool Call Memoization Within a Crystal Session

**Missing from:** `memory.md`, `architecture.md`

If Crystal's ReAct loop calls `getTopics` in turn 1, then the user asks a follow-up and Crystal calls `getTopics` again in turn 3, it makes a fresh DB query. The result is identical (data didn't change mid-conversation). This is pure waste: DB query cost, token cost (the result is re-added to context), and latency.

**Fix:** Add a per-session tool result cache in memory (not Redis — session lifetime only):

```python
# In CrystalContext or thread state
tool_cache: dict[str, dict] = {}  # {tool_name + str(params): result}
```

Before any `dispatch_tool(name, ctx, params)` call, check `tool_cache`. On cache hit, return cached result and emit a "cached" observation instead of re-calling. Cache lifetime: the Crystal session (one HTTP request or until thread reset).

**Impact:** In practice, `get_survey_overview` and `get_topic_details` are called most often. Eliminating duplicate calls across a 6-turn conversation saves 2–4 tool calls per session.

---

### M3 — Context Injection Order Matters

**Missing from:** `memory.md`

The doc specifies what goes into Crystal's context budget but not the ORDER:
```
System prompt | Survey facts | Org memory | Thread context_state | Last 2 turns | Tool results | User message
```

Order matters significantly in modern LLMs. Empirically:
- **Recency bias:** LLMs pay more attention to content near the end of the context (especially the user message and the content immediately before it)
- **Primacy bias:** The very beginning (system prompt) also gets high attention
- **Middle neglect:** Content in the middle gets systematically less attention ("lost in the middle" phenomenon)

**Implication:** Survey facts (the data Crystal needs most) should be placed LAST in the system prompt (just before the conversation history), not first. Org memory and thread compression results, being less query-specific, belong earlier.

**Recommended order:**
```
1. Crystal persona + instructions (hardcoded system prefix)
2. Org memory (past session facts — lowest recency value)
3. Thread context_state (compressed conversation facts)
4. Last N raw turns (conversation history)
5. Survey facts (most query-relevant — near the user message)
6. Current user message
```

---

### M4 — Crystal Cold Start: No Survey Facts Yet

**Missing from:** `memory.md`, `architecture.md`

L3 survey facts are written at `node_publish`. But Crystal can be invoked before the first pipeline run completes (user navigates to Insights page immediately after creating the survey). The L3 cache is empty.

Crystal then falls back to... running all 13 tools. Which is fine, but:
1. The fallback behavior is nowhere documented
2. The tool results are not written back to L3 for the next call
3. The quality of the first Crystal session is lower than subsequent ones (cold data)

**Fix:** Document the cold start fallback explicitly. Add a "warm L3 cache from tool results" step at the end of a successful Crystal session when L3 was empty at start. This self-heals the cold start problem.

---

### M5 — Cancellation Propagation: Token Leak

**Missing from:** `architecture.md`

When the user navigates away during a Crystal ReAct loop, the frontend stops consuming SSE. The server doesn't know. `_run_react_loop_streaming` keeps calling tools, making LLM calls, writing to the DB. A single orphaned session can waste $0.10–0.50 in tokens before TCP drops.

**Fix:** FastAPI's `request.is_disconnected()` can be polled within the async generator:

```python
async def _run_react_loop_streaming(inp, request=None):
    for tool_def in tools_to_run:
        if request and await request.is_disconnected():
            logger.info("crystal_stream_client_disconnected")
            return
        # ... existing tool dispatch
```

This requires passing the `Request` object from the FastAPI endpoint handler into `_run_react_loop_streaming`. Minor change; prevents runaway token spend.

---

### M6 — No Per-Skill Resource Limits

**Missing from:** `skills.md`, `architecture.md`

If a skill's prompt contains an instruction that causes the LLM to generate very long outputs (e.g., "list all verbatims"), or if a skill enters a retry loop, there is no cap. The `check_budget` in `openrouter.py` is at the run level, not the skill level.

**Fix:** SKILL.md frontmatter should include:
```yaml
max_output_tokens: 2000      # Per-call output cap
max_retries: 1               # Override runtime default
timeout_seconds: 30          # Hard abort after N seconds
```

The skill runtime enforces these before calling `call_agent`.

---

### M7 — Pipeline Idempotency: No Exactly-Once Guarantee

**Missing from:** `architecture.md`

The `run_insight_generation` function can be called multiple times for the same survey (manual refresh, scheduled trigger, stream trigger) concurrently. The pipeline has no distributed lock. Two concurrent runs write to the same `insight_records` rows. The last writer wins, but intermediate state is undefined.

Currently there's a `should_trigger_progressive_tier` Redis dedup key, but that only prevents duplicate stream triggers — it doesn't prevent two manual triggers from running concurrently.

**Fix:** Add a Postgres advisory lock at the start of `node_ingest`:
```sql
SELECT pg_try_advisory_xact_lock(hashtext('insight_gen:' || survey_id))
```
If the lock fails, return a "run already in progress" result rather than a second competing run.

---

### M8 — Missing: User-Level Memory vs. Org-Level Memory

**Missing from:** `memory.md`

L4 org memory conflates user preferences with org preferences. If user Alice sets "I prefer bullet points" and user Bob prefers "executive prose," both preferences are stored under the same `org_id`. Crystal would give Bob bullet points and Alice executive prose regardless of which user is asking.

The schema has no `user_id` column in `crystal_org_memory`. The read path queries by `org_id` only.

**Fix:** Separate memory into two scopes:
- `user_preferences` (scoped to user_id) — display preferences, interaction style
- `org_context` (scoped to org_id) — decisions, survey relationships, benchmarks

Read path: merge both at Crystal startup. User preferences override org context on conflicts.

---

### M9 — No Audit Trail for AI Decisions

**Missing from:** all docs

Enterprise and regulated customers need to know "why did Crystal say X?" and "what data supported this insight?" The current system logs token counts and eval scores but not the reasoning chain.

This matters for:
- GDPR "right to explanation" when AI affects customer experience decisions
- SOC2 audit trail for AI-assisted business decisions
- Debugging: "the NPS insight was wrong last quarter, why?"

**Fix:** Add `reasoning_trace` JSONB column to `insight_records` and `crystal_threads`. Store the top tool results that supported each claim, the hallucination score, and the eval reasoning. This is NOT the full LangGraph state (too large) — just the decision-relevant subset. 3–5 structured fields per insight.

---

## Part 3: Better Tools That Exist Now

### T1 — Mem0: Replace Custom L2/L4 With a Purpose-Built Memory Library

**What it is:** Open-source (MIT) Python library for AI agent memory. PyPI: `mem0ai`. Self-hostable with Redis + Postgres + any embedding model.

**What it does that your 4-layer design does manually:**
- Automatically extracts facts from conversation turns (no custom compression code)
- Deduplicates and merges contradicting memories (fixes C3)
- Provides `user_id` + `agent_id` + `org_id` scoping natively (fixes M8)
- Handles temporal decay (recent facts weighted higher)
- Single `memory.add(messages, user_id=..., agent_id=...)` API

**What it replaces in your design:**
- L2 thread compression (the extraction logic) → `mem0.add(thread_messages)`
- L4 org memory (write + read path) → `mem0.search(query, user_id=..., org_id=...)`

**What it doesn't replace:**
- L1 semantic cache (Redis, survey-scoped) — you still build this
- L3 survey facts cache (pre-computed at publish) — you still build this

**Tradeoff:**
- Pro: Eliminates ~300 lines of custom memory code. Memory extraction is better than regex/structured extraction because it's LLM-based.
- Con: One more dependency. The LLM-based extraction adds ~$0.001 per Crystal turn for the extraction call.

**Recommendation:** Use Mem0 for L2 and L4 once the team has > 2 active engineers on the AI platform. Until then, the structured `context_state` JSON (current design) is simpler to debug.

---

### T2 — Graphiti (from Zep): Time-Aware Knowledge Graph for L4 Memory

**What it is:** Open-source Python library from Zep. Stores memories as a knowledge graph with time-aware edges. PyPI: `graphiti-core`.

**Why this matters:** pgvector stores static vectors. A query "what do we know about this org?" returns the most similar facts by embedding similarity. But org memory has temporal structure: "last quarter they focused on onboarding" is relevant only if it's recent. Cosine similarity doesn't capture time.

Graphiti stores facts as graph edges with `valid_from` / `valid_to` timestamps and automatically handles temporal reasoning. A query for "what is most relevant now" considers both semantic similarity AND recency.

**What it replaces:** The `crystal_org_memory` pgvector table + custom write/read logic

**Tradeoff:**
- Pro: Temporal reasoning is built-in. No custom "confidence decay" logic needed.
- Con: Neo4j or embedded graph DB required (Graphiti can use FalkorDB or Neo4j). Additional infrastructure.

**Recommendation:** Evaluate for Experient once L4 memory is shipped and temporal reasoning becomes visibly needed. Not urgent for Sprint 4, but worth noting as the natural upgrade path.

---

### T3 — PydanticAI: Type-Safe Agent Execution for Skills

**What it is:** Python agent framework from the Pydantic team. `pip install pydantic-ai`. Agents are Python functions with typed Pydantic I/O. Minimal overhead.

**What it does better than raw `call_agent()`:**
- Agents are typed end-to-end (input type → output type) — aligns perfectly with SKILL.md's declared schemas
- Built-in retry logic with structured error context
- `RunContext` carries dependencies (db pool, org_id, etc.) into tools — no global state
- Compatible with any LLM via `pydantic_ai.models.*`

**How it fits:** The Skill Runtime (`lib/skill_runtime.py`) executes a skill by: reading SKILL.md, building a prompt, calling `call_agent()`, running EVALS.md, retrying on failure. PydanticAI's `Agent` class handles exactly this pattern with proper typing. The skill runtime becomes a thin wrapper that reads SKILL.md frontmatter and instantiates a PydanticAI Agent.

**Tradeoff:**
- Pro: Type safety. Removes the `output_schema=CrystalOutput` pattern scattered everywhere with a cleaner API.
- Con: Framework lock-in for the skill execution layer. Small but real.

---

### T4 — DeepEval: Replace Custom EVALS.md Parsing

**What it is:** Open-source Python library for LLM evaluation. `pip install deepeval`. Built-in metrics: hallucination, answer relevance, contextual recall, faithfulness, bias detection.

**How it fits:** The current EVALS.md format defines criteria in markdown tables that a custom parser must interpret. `deepeval` provides ready-made eval functions:

```python
from deepeval.metrics import HallucinationMetric, AnswerRelevancyMetric
from deepeval.test_case import LLMTestCase

test_case = LLMTestCase(
    input=user_question,
    actual_output=crystal_answer,
    retrieval_context=[topic_data, metric_data],
)
metric = HallucinationMetric(threshold=0.65)
metric.measure(test_case)
```

**What it replaces:** The `node_evaluate` LLM-judge pattern and custom EVALS.md criterion parsing

**Tradeoff:**
- Pro: Built-in metrics are validated and well-tested. Removes LLM-calls-LLM (partially) for factual claims.
- Con: Adds a dependency. Some metrics still use LLM judges internally.

---

### T5 — Braintrust vs. Langfuse: Clearer Split Needed

**Current design:** "Langfuse distributed traces" (Sprint 3) + "Braintrust for CI" (mentioned in observability.md)

**The right split (current industry consensus 2025):**

| | Langfuse | Braintrust |
|--|----------|------------|
| Production tracing | ✅ Primary | ❌ Not designed for |
| Eval datasets | ❌ Basic only | ✅ Primary — versioned datasets |
| Online eval in prod | ✅ Score API | ✅ Better: automatic sampling |
| Experiment tracking | ❌ | ✅ Primary |
| CI eval gating | Possible | ✅ Native `braintrust` CLI |
| Self-hostable | ✅ | ❌ Cloud only (May 2025) |

**Recommendation:** The current design has this right but doesn't spell out the boundary clearly enough. **Langfuse is the operational trace store** (fires on every request). **Braintrust is the eval quality store** (fires on prompt version changes, weekly DSPy runs, and CI). They serve different audiences: Langfuse for debugging, Braintrust for product/quality decisions.

The key missing piece: Braintrust requires sending actual LLM inputs/outputs to their cloud. For customer data, this requires anonymization or a data processing agreement. The architecture should address this.

---

### T6 — Google ADK vs. Custom ReAct Loop for Crystal

**What Google ADK is:** Agent Development Kit, Python-first agent framework released 2025. `pip install google-adk`. Native support for multi-turn conversations, tool use, streaming, and session management.

**What ADK does better than Crystal's current custom ReAct:**
- Proper tool calling via function signatures (not regex parsing of LLM output)
- Built-in session management with history
- Event-driven streaming (maps directly to SSE)
- LiteLLM underneath (supports all LLM providers)

**Honest assessment:** Crystal's current custom ReAct loop (in `agents/crystal.py`) is well-structured but brittle. It doesn't do true multi-step tool calling — the code shows a `break` after the first turn, suggesting the ReAct is simulated, not real. A proper multi-step ReAct would dispatch tools, get results, feed them back, loop.

**Recommendation:** If Crystal's ReAct loop is to be meaningfully improved (true multi-step tool use), rebuild it with LangGraph (keeping the existing graph infrastructure) rather than custom Python. ADK is interesting but adds Google dependency. LangGraph already in the stack.

---

## Part 4: Context Management Deep Dive

### The "Lost in the Middle" Problem in Crystal's Context

Research by Stanford (2023, "Lost in the Middle") showed LLMs have significantly lower recall for information in the middle of long contexts. For Crystal:

```
[System prompt 2000 tokens] [Org memory 200 tokens] [Thread state 200 tokens]
[Turn 1 user 100] [Turn 1 assistant 400] [Turn 2 user 100] [Turn 2 assistant 400]
[Survey facts 300 tokens] [Current message 100]
```

The survey facts, being at the end before the user message, are actually in the HIGH attention zone. The thread state from L2, being in the middle, is in the LOW attention zone. This is the opposite of what you want.

**Fix:** Reorder context so the most query-relevant content is at the end, close to the user message:

```
[1. Crystal persona]
[2. Instructions (never change)]  ← candidate for prompt caching
[3. Org memory — low specificity, low urgency]
[4. Thread context_state — conversation continuity]
[5. Recent turns — immediate context]
[6. Survey facts — high specificity, always relevant]  ← last before user message
[7. User message]
```

This simple reordering (no new infrastructure) likely improves answer quality on survey-specific questions.

---

### Context Compression: Structured vs. Abstractive

The design chooses structured JSON compression (L2). This is the right call, but the rationale is worth making explicit because two competing approaches exist:

**Abstractive (prose summary):** "In turns 1-5 we discussed NPS declining in Q1 and identified onboarding as the root cause."
- Pro: Natural for the LLM to read
- Con: Facts can be lost or distorted in summarization; hard to update incrementally

**Structured (your current design):**
```json
{"decisions": [...], "data_retrieved": {...}, "user_preferences": {...}}
```
- Pro: Facts are preserved exactly; can be updated incrementally; machine-readable for future agents
- Con: Less natural for LLM; requires careful schema design

**Verdict:** Structured is the right choice for Crystal, which is an analytical tool where precision matters. Abstractive compression is appropriate for social/conversational agents.

One addition to the current L2 design: add a `verbatim_turns: 2` field that tells the runtime how many of the most recent raw turns to always include, regardless of compression. This makes the "last 2 raw turns" logic part of the context_state schema, not hardcoded in the runtime.

---

### Tool Result Management: The Missing Budget

The context budget table in `memory.md` shows "Tool result buffer: 500 tokens." In practice:

- `get_survey_overview`: ~300 tokens
- `get_topic_details` (10 verbatims): ~800 tokens
- `get_metric_history` (90 days): ~600 tokens
- `get_verbatims` (default 10): ~1,000 tokens

Three tool calls = 1,700–2,700 tokens, which blows the 500-token "buffer" immediately.

**Fix:** Tool results need their own compression strategy:

1. **Truncation at dispatch:** Each tool should declare `max_result_tokens: 400` in its registry entry. The dispatcher truncates the result before adding it to context.
2. **Result summarization:** For multi-item results (verbatims list, metric history), summarize rather than truncating raw JSON. "Top 5 verbatims about onboarding: [summary]" rather than full JSON.
3. **Stale result pruning:** If `getTopics` was called in turn 1 and now it's turn 6, drop the raw tool result and keep only the extracted key facts.

---

## Part 5: New Gaps for README.md

These should be added to the Known Gaps table:

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| G13 | L1 cache key excludes survey_id — flush at publish doesn't work | Cache never invalidated on insight update | Design contradiction |
| G14 | L1 near-match uses hash lookup — cosine similarity not computed | Near-duplicate questions always miss cache | Design contradiction |
| G15 | L2 context_state has no decision supersession | Contradictory decisions accumulate in context | Design needed |
| G16 | L4 org memory has no session-end trigger | Memory never written (no disconnect event) | Design needed |
| G17 | EXAMPLES.md is a file — concurrent writes corrupt it | Examples bank corrupts under concurrent pipeline runs | Should be DB table |
| G18 | No embedding model versioning | Embedding model change breaks all stored vectors silently | Design needed |
| G19 | No per-skill resource limits (timeout, max_tokens) | Runaway skill halts pipeline indefinitely | Feature needed |
| G20 | Crystal has no client-disconnect detection | Orphaned sessions consume tokens after client leaves | Fix available |
| G21 | Tool call memoization missing — same tool called twice per session | Duplicate DB queries, duplicate context tokens | Feature needed |
| G22 | Anthropic prompt caching not used | 80–90% savings on repeated system prompt tokens uncaptured | Feature needed |
| G23 | Context injection order not specified | Survey facts in wrong position → LLM attention degraded | Design needed |
| G24 | L4 org memory conflates user and org preferences | User A's preferences applied to User B in same org | Schema fix needed |
| G25 | No pipeline idempotency lock | Concurrent runs for same survey produce undefined state | Fix available |
| G26 | No audit trail for AI decisions | Can't explain why insight was generated (GDPR, SOC2) | Feature needed |
| G27 | Tool result token budget is ~3× underestimated | Context window fills before budget calculations suggest | Calibration needed |
| G28 | Cold start: no L3 survey facts until first pipeline run | Crystal makes 3–4 extra tool calls on first session | Design needed |
| G29 | Braintrust sends production data to cloud — no anonymization | Customer data leaving environment for eval storage | Policy needed |

---

## Part 6: Prioritized Recommendations

### P0 — Fix Before Implementing Memory Layer

These must be fixed before Sprint 4 (memory) or the memory layer won't work correctly:

1. **Fix L1 cache key** (C2) — add survey_id to key format. One-line change in constants.py and memory.py.
2. **Fix L1 cache mechanism** (C1) — decide exact vs. semantic. Implement one, document the other.
3. **Add embedding model versioning** (C6, G18) — add model name to all stored vector records.

### P1 — High Value, Low Effort

4. **Add prompt caching** (M1, G22) — Modify `call_agent` to include `cache_control` for Claude models. 15-line change. 80% cost reduction on Crystal system prompts.
5. **Fix L2 decision supersession** (C3, G15) — Add `superseded_by` field to context_state schema. Implement detection in compression logic.
6. **Fix context injection order** (M3, G23) — Reorder how L2/L3/L4 are concatenated into Crystal's system prompt. Zero infrastructure change.
7. **Add tool call memoization** (M2, G21) — Add `tool_cache` dict to CrystalContext. Wrap `dispatch_tool` to check cache first.
8. **Add client disconnect detection** (M5, G20) — Pass `Request` to streaming endpoint; poll `is_disconnected()` in loop.

### P2 — Significant Value, Medium Effort

9. **Move EXAMPLES.md to DB table** (C5, G17) — Add `skill_examples` table. One schema migration + update skill runtime to read/write DB.
10. **Add per-skill resource limits** (M6, G19) — Add `max_output_tokens`, `timeout_seconds` to SKILL.md frontmatter. Enforce in skill runtime.
11. **Separate user vs. org memory in L4** (M8, G24) — Add `user_id` scope to `crystal_org_memory`. Update read/write paths.
12. **Add pipeline advisory lock** (M7, G25) — Postgres `pg_try_advisory_xact_lock` in `node_ingest`. Prevents concurrent run corruption.

### P3 — Evaluate These Technologies

13. **Mem0** — Evaluate as replacement for custom L2/L4 memory code once the team grows. Strong fit architecturally.
14. **Graphiti** — Evaluate for L4 temporal knowledge graph when simple pgvector proves insufficient for multi-session reasoning.
15. **DeepEval** — Replace custom EVALS.md criterion parsing with built-in eval metrics. Reduces custom code.
16. **PydanticAI** — Consider for skill runtime execution layer (typed agents, structured retries).

---

## Appendix: Technology Reference

| Technology | Purpose | License | Self-hostable | Fit for XOS |
|------------|---------|---------|--------------|-------------|
| Mem0 | L2+L4 memory extraction | MIT | Yes (Redis+PG) | High — replaces custom code |
| Zep Cloud | L2+L4 memory | Commercial | Self-host available | Medium — adds infra |
| Graphiti | Time-aware knowledge graph | Apache 2.0 | Yes (Neo4j/FalkorDB) | High for L4 specifically |
| LangMem | Memory for LangGraph agents | MIT | Yes | High — native LangGraph fit |
| PydanticAI | Type-safe agent execution | MIT | Yes | High — minimal |
| Google ADK | Full agent framework | Apache 2.0 | Yes | Low — redundant with LangGraph |
| DeepEval | LLM eval metrics | Apache 2.0 | Yes | High — replaces custom evals |
| Braintrust | Eval datasets + CI gating | Commercial | No (cloud only) | Medium — data residency concern |
| Arize Phoenix | Open-source LLM observability | Elastic-2.0 | Yes | Medium — Langfuse alternative |
| DSPy | Prompt optimization | MIT | Yes | High — already in design |
| LlamaIndex Workflows | Event-driven agent pipelines | MIT | Yes | Low — redundant with LangGraph |
