# CrystalOS Gap Status

Last updated: 2026-06-03  
Sprint: Integration Sprint (Sprint 2)

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Implemented | 19 |
| 🔄 In Progress | 3 |
| 📋 Designed | 6 |
| ❌ Not Started | 1 |

---

## Gaps

### G1 — No distributed tracing across multi-step skill chains
**Status:** 🔄 In Progress  
**File:** `crystalos/lib/tracer.py` — Langfuse wrapper implemented, no-op without key  
**Wiring:** Pipeline nodes and Crystal turns not yet instrumented  
**Notes:** No-op design means adding tracing doesn't require LANGFUSE_PUBLIC_KEY in dev.

---

### G2 — Hallucination verifier is LLM-asks-LLM (unreliable)
**Status:** ✅ Implemented  
**File:** `crystalos/lib/hallucination_scorer.py` — deterministic + LLM hybrid  
**Wiring:** `node_verify` in `graphs/insights.py` — uses `score_insight()` when `USE_SKILL_RUNTIME=true`  
**Notes:** Two-pass approach: deterministic citation/number check (free) + optional LLM judge (triggered only when det_score < 0.80).

---

### G3 — PII in trace logs
**Status:** ✅ Implemented  
**File:** `crystalos/lib/pii_scrubber.py` — regex scrubber for email, phone, SSN, CC, IP  
**Wiring:** Integrated into `crystalos/lib/tracer.py` — all Langfuse inputs are scrubbed before transmission.

---

### G4 — Crystal passes 10 raw turns (~5k tokens) on every call
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py` — L2 thread compression  
**Wiring:** Crystal needs to call `memory_manager.build_context_injection()` per turn (integration sprint)  
**Notes:** context_state column added via `20260603000003_crystal_threads_context_state.sql`. Decision supersession implemented (G15 fix included).

---

### G5 — No semantic response cache
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py` — L1 Redis cache with exact hash match  
**Notes:** G13/G14 fixed: key includes survey_id; pure hash-based (no false cosine similarity claim). Mode B (Redis Stack vector search) is upgrade path.

---

### G6 — Crystal has no data freshness awareness
**Status:** 📋 Designed  
**Notes:** Design: check survey_facts.computed_at vs now(). If > 7 days, include freshness warning in context. Implementation in Crystal ReAct integration sprint.

---

### G7 — No model fallback on primary model failure
**Status:** 📋 Designed  
**Notes:** MODEL_FALLBACK_CHAIN in constants.py planned. Circuit breaker in openrouter.py is per-model (partially). Full fallback chain not yet wired.

---

### G8 — Crystal context window grows unbounded
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py` — L2 compression triggers at turn 5, every 3 turns after  
**Notes:** CRYSTAL_CONTEXT_COMPRESSION_THRESHOLD in constants.py as safety valve. Archive to crystal_thread_archive on > 20 turns (planned).

---

### G9 — No UI feedback collection (thumbs up/down)
**Status:** ❌ Not Started  
**Notes:** Requires frontend + backend work. Highest-quality training signal not yet collected.

---

### G10 — No A/B testing for prompt changes
**Status:** 📋 Designed  
**Notes:** Requires Langfuse experiment tracking or custom split logic. Deferred post-Sprint 1.

---

### G11 — No per-org rate limiting
**Status:** 📋 Designed  
**Notes:** Redis sliding window middleware designed in architecture.md. Per-model circuit breakers partially fixed. Not yet implemented in main.py middleware.

---

### G12 — Partial pipeline publish not possible
**Status:** 📋 Designed  
**Notes:** Tiered publish (topics → narrative → verified) designed in architecture.md. Not yet implemented in pipeline nodes.

---

### G13 — L1 cache key excludes survey_id
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py:_l1_key()`  
**Fix:** Key format: `semantic_cache:{org_id}:{survey_id}:{sha256_hash[:16]}`

---

### G14 — L1 near-match via hash lookup (impossible with hash)
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py`  
**Fix:** Hash-based exact match only (Mode A). Cosine similarity (Mode B) documented as upgrade path requiring Redis Stack. No false claim of near-match via hash.

---

### G15 — L2 context_state has no decision supersession
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py:_compress_messages()`  
**Fix:** Decisions with same topic: later one marks earlier as `status: "superseded"`. LLM receives only active decisions.

---

### G16 — L4 org memory write uses "on disconnect" (no disconnect event in HTTP/SSE)
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py:sweep_stale_threads()`  
**Fix:** Background sweep every `ORG_MEMORY_SWEEP_INTERVAL_MIN` minutes (default: 5). Finds threads inactive since last sweep and extracts L4 facts.

---

### G17 — EXAMPLES.md is a flat file — concurrent writes corrupt it
**Status:** ✅ Implemented  
**File:** `supabase/migrations/20260603000001_skill_examples.sql`  
**Fix:** skill_examples DB table with `prune_skill_examples()` function. EXAMPLES.md in skill folders is human-read-only (generated on demand).

---

### G18 — Embedding model name not stored alongside vectors
**Status:** ✅ Implemented  
**Files:** `supabase/migrations/20260603000001_skill_examples.sql`, `20260603000002_crystal_org_memory.sql`  
**Fix:** `embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small'` in both tables. Runtime should re-index on model mismatch (not yet wired).

---

### G19 — No per-skill resource limits
**Status:** ✅ Implemented  
**File:** `crystalos/lib/skill_runtime.py` + SKILL.md frontmatter  
**Fix:** `timeout_seconds`, `max_output_tokens`, `max_retries` in SKILL.md. Enforced by `asyncio.wait_for()` in skill runtime.

---

### G20 — Crystal has no client-disconnect detection
**Status:** ✅ Implemented  
**File:** `crystalos/agents/crystal.py:_run_react_loop_streaming()` — polls `request.is_disconnected()` between each tool call  
**File:** `crystalos/main.py:crystal_stream_endpoint` — passes `request=req` to streaming function

---

### G21 — Tool call memoization missing
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py:get_tool_result() / set_tool_result()`  
**Fix:** L0 per-session in-memory dict. Tool results cached by `(tool_name, params_hash)`. Error results not cached.

---

### G22 — Anthropic prompt caching not used
**Status:** 📋 Designed  
**Notes:** Requires adding `cache_control: {type: "ephemeral"}` to static system prompt segments in call_agent for Anthropic models. 70% cost savings on repeated turns. Not yet implemented.

---

### G23 — Context injection order not specified
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py:build_context_blocks()`  
**Fix:** Order: org_memory → context_state → raw_turns → survey_facts (last = highest attention, closest to user message).

---

### G24 — L4 org memory conflates user and org preferences
**Status:** ✅ Implemented  
**File:** `supabase/migrations/20260603000002_crystal_org_memory.sql`  
**Fix:** `user_id UUID` + `scope TEXT CHECK ('org' | 'user')` columns. User-scoped facts fetched first, org-scoped second.

---

### G25 — No pipeline idempotency lock
**Status:** ✅ Implemented  
**File:** `crystalos/graphs/insights.py:node_ingest()` — `pg_try_advisory_xact_lock` prevents concurrent runs for same survey  
**Notes:** Returns early with existing run_id if lock not acquired. Transaction-scoped — auto-released on crash.

---

### G26 — No audit trail for AI decisions
**Status:** ✅ Implemented  
**File:** `supabase/migrations/20260603000004_insights_reasoning_trace.sql` — `reasoning_trace JSONB` column  
**File:** `crystalos/graphs/insights.py:node_publish()` — writes `{supporting_tool_results, hallucination_score, eval_score, model, schema_version}` per insight

---

### G27 — Tool result token budget is ~3× underestimated
**Status:** ✅ Implemented  
**File:** `crystalos/lib/constants.py` — updated comment; realistic budget in memory.md  
**Notes:** Design doc updated with realistic tool result token estimates (~800 per tool call, not 167).

---

### G28 — Cold start: no L3 survey facts until pipeline completes
**Status:** ✅ Implemented  
**File:** `crystalos/lib/memory.py:warm_from_tool_results()` — logic  
**File:** `crystalos/agents/crystal.py:_run_react_loop_streaming()` — calls warm after tool results on cold start  
**File:** `crystalos/graphs/insights.py:node_publish()` — writes authoritative L3 facts at publish time

---

### G29 — Braintrust is cloud-only — eval data leaves customer environment
**Status:** 📋 Designed  
**Notes:** Policy decision needed. Options: self-host Langfuse (open-source), use PII scrubber before any external eval service, or eval only on synthetic data. Deferred.
