# XOS Memory & Context Management

**Status:** Design  
**Last updated:** 2026-05-21

---

## The Problem

Crystal currently passes 10 raw message turns (~5,000 tokens) on every call. As conversations grow, the context window fills with redundant history. Tool results accumulate. The ReAct loop silently truncates when it hits the model's limit.

The fix is not to pass more context — it's to pass *smarter* context.

**Target:** 62% token reduction with equal or better answer quality.

---

## Four-Layer Memory Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  L1  Semantic Response Cache                                     │
│       Redis · 24h TTL · ~$0 / repeat question                   │
│       "What is the NPS for Q1?"  →  cached answer               │
├──────────────────────────────────────────────────────────────────┤
│  L2  Thread Compression                                          │
│       Postgres crystal_threads · structured JSON · ~200 tokens  │
│       10 raw turns → compressed context_state JSON              │
├──────────────────────────────────────────────────────────────────┤
│  L3  Survey Facts Cache                                          │
│       Redis · warm at publish · survey_facts:{survey_id}        │
│       Pre-computed: NPS score, top topics, response count, etc. │
├──────────────────────────────────────────────────────────────────┤
│  L4  Org Memory                                                  │
│       pgvector crystal_org_memory · semantic retrieval          │
│       Cross-session facts: preferences, past decisions, context │
└──────────────────────────────────────────────────────────────────┘
```

Each layer answers a different question:

| Layer | Question | Cost |
|-------|----------|------|
| L1 | "Have we answered this before?" | ~0 (Redis lookup) |
| L2 | "What happened earlier in this conversation?" | ~0.1ms (DB read) |
| L3 | "What do we know about this survey?" | ~0.2ms (Redis read) |
| L4 | "What do we know about this org from past sessions?" | ~5ms (vector search) |

---

## L1: Semantic Response Cache

### What it does

Caches Crystal responses by semantic similarity of the question. Identical and near-identical questions return the cached answer without an LLM call.

### Implementation

> **G13/G14 fix:** The original design had two contradictions. (1) The key format omitted `survey_id`, making per-survey cache invalidation impossible. (2) It claimed cosine similarity ≥ 0.92 near-match detection while using a hash lookup — these are mutually exclusive mechanisms. Both are corrected below.

**Mode A: Exact cache (default — Redis 6, no vector module)**

```
Key format: semantic_cache:{org_id}:{survey_id}:{sha256(question_embedding_quantized)}
Value: JSON {answer, citations, timestamp, model, tokens_saved}
TTL: 24 hours (SEMANTIC_CACHE_TTL_HOURS in constants.py)
```

On each request: embed question → quantize to 8-bit → hash → exact key lookup. Hits on identical or very near phrasing within the same quantization bucket. Fast. No cosine scan needed.

**Mode B: Semantic cache (upgrade path — Redis Stack / Redis Cloud with vector search)**

```
Key format: semantic_cache:{org_id}:{survey_id}:{uuid}
Value: JSON {question_embedding: float[], answer, citations, timestamp, model}
Index: HNSW vector index scoped to {org_id, survey_id}
```

On each request: embed question → ANN search with `cosine_similarity ≥ 0.92` → return cached answer if found. True semantic near-duplicate detection.

Start with Mode A. Upgrade to Mode B when Redis Stack is available and cache hit rate data shows value.

**Cache invalidation** (now works because `survey_id` is in the key):
```
On node_publish: scan and delete semantic_cache:{org_id}:{survey_id}:*
```

### What gets cached vs. not

- **Cached:** Factual questions about survey data ("What is our NPS?", "Show top topics")
- **Not cached:** Conversational follow-ups ("Why did you say that?"), questions with date ranges that may become stale

### Token savings

Every cache hit saves the full Crystal call: typically 800–2,000 tokens. In production, 30–40% of repeat user sessions ask variations of the same 3–5 questions per survey.

---

## L2: Thread Compression

### The current problem

`crystal_threads` stores `messages` as a JSONB array of raw message objects. After 10 turns, this is ~5,000 tokens. The full array is loaded and passed to the LLM on every call.

### The fix: structured `context_state`

Instead of prose summaries (which lose precision and drift), extract structured facts from the conversation:

```json
{
  "context_state": {
    "schema_version": 2,
    "verbatim_turns": 2,
    "decisions": [
      {
        "turn": 3,
        "topic": "NPS analysis",
        "conclusion": "Passives are primary concern, not detractors",
        "status": "active"
      },
      {
        "turn": 7,
        "topic": "NPS analysis",
        "conclusion": "Actually, focus on detractors — user changed mind",
        "status": "active",
        "supersedes_turn": 3
      }
    ],
    "data_retrieved": {
      "topics_loaded": true,
      "metrics_loaded": true,
      "verbatims_count": 12
    },
    "open_questions": ["User asked about Q3 comparison — not yet answered"],
    "user_preferences": {
      "detail_level": "executive",
      "preferred_format": "bullet points"
    },
    "last_active": "2026-05-21T14:30:00Z"
  }
}
```

**G15 fix — decision supersession:** The `decisions` array now includes `status` ("active" | "superseded") and `supersedes_turn`. When the compression step detects that a new decision contradicts an earlier one on the same topic, it marks the earlier decision `status: "superseded"`. The LLM receives only active decisions. This prevents contradictory context after a user changes direction.

The `verbatim_turns` field (G23 improvement) explicitly declares how many raw turns to append after the compressed context_state. The runtime reads this from the schema rather than hardcoding `[-2:]` in Python.

### Migration

The `crystal_threads` table gains a `context_state` JSONB column (nullable, opt-in). Compression runs at turn 5 and every 3 turns thereafter. The full `messages` array is kept for audit but not sent to the LLM.

### What the LLM receives — corrected context order

> **G23 fix:** Context injection order matters. Research shows LLMs pay highest attention to content at the beginning (primacy) and end (recency) of context. Survey facts — the most query-relevant data — must be near the user message, not in the middle.

```
[Crystal persona + instructions — hardcoded, candidate for prompt caching]
[Org memory — past session facts, lowest recency value]
[Thread context_state JSON — compressed conversation facts ~200 tokens]
[Last N raw turns — immediate conversation continuity ~400 tokens]
[Survey facts from L3 — most query-relevant, close to user message ~300 tokens]
[Current user message]
```

Total: ~1,200 tokens vs. ~5,000+. Survey facts are placed last (high attention) instead of first (middle = low attention).

### Compression trigger

- Turn counted as: one user message + one assistant response = 1 turn
- After turn 5: first compression
- Every 3 turns after that: incremental update to `context_state`
- If `messages` array exceeds 20 turns: archive old turns to `crystal_thread_archive`, keep last 5

---

## L3: Survey Facts Cache

### What it does

Pre-computes the key facts about a survey at publish time so Crystal doesn't need to call `getMetrics`, `getTopics`, and `getSentiment` on every cold start.

### What's cached

```json
{
  "survey_facts": {
    "survey_id": "abc123",
    "computed_at": "2026-05-21T12:00:00Z",
    "response_count": 847,
    "survey_type": "NPS",
    "nps_score": 42,
    "sentiment_distribution": {"positive": 0.52, "neutral": 0.23, "negative": 0.25},
    "top_topics": [
      {"label": "Onboarding", "volume": 234, "sentiment": -0.3},
      {"label": "Support Quality", "volume": 189, "sentiment": 0.6}
    ],
    "response_rate": 0.38,
    "date_range": {"start": "2026-01-01", "end": "2026-03-31"}
  }
}
```

**Key:** `survey_facts:{survey_id}`  
**TTL:** Until next publish run (actively invalidated, not time-based)  
**Written:** At end of `node_publish` in `graphs/insights.py`  
**Read:** At Crystal startup (before first LLM call)

### Token savings

Loading survey facts from Redis at Crystal startup saves 2–3 tool calls that previously happened in the first ReAct turns. These tool calls cost ~400 tokens each. Savings: ~1,000 tokens per Crystal session cold start.

---

## L4: Org Memory

### What it does

Persists facts across sessions for the same org. Unlike L2 (per-thread), L4 spans all Crystal conversations for an org.

### Use cases

- "This org always wants executive-level summaries"
- "Last quarter this org decided to focus on onboarding — is it still relevant?"
- "This org has 3 active surveys — Crystal knows which are related"

### Schema

> **G24 fix:** The original schema had only `org_id` — user preferences were conflated with org preferences. A separate `user_id` column and `scope` field separates them. User A's "bullet point" preference is no longer served to User B in the same org.

```sql
CREATE TABLE crystal_org_memory (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         UUID NOT NULL,
    user_id        UUID,             -- NULL = org-scoped; set = user-scoped
    scope          TEXT NOT NULL DEFAULT 'org', -- 'org' | 'user'
    memory_type    TEXT NOT NULL,    -- 'preference', 'decision', 'context', 'survey_link'
    fact           TEXT NOT NULL,
    source_thread  TEXT,             -- thread_id that created this fact
    embedding      vector(1536),     -- pgvector
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small', -- G18 fix
    confidence     FLOAT DEFAULT 1.0,
    created_at     TIMESTAMPTZ DEFAULT now(),
    expires_at     TIMESTAMPTZ       -- NULL = permanent; set for time-sensitive facts
);

CREATE INDEX ON crystal_org_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX ON crystal_org_memory (org_id, user_id, scope);
```

The `embedding_model` column (G18 fix) ensures stored vectors are never silently queried against a different model's embedding space. On startup, if the current embedding model differs from stored rows, a background re-indexing job is triggered.

### Write path

> **G16 fix:** Crystal runs over HTTP/SSE. There is no "session end" event — client disconnect does not trigger a server callback. The write-on-disconnect design would never execute in practice.

**Revised trigger:** Write to L4 at two points:
1. **After each successful high-quality Crystal response** (`eval_score ≥ 0.80`) — extract any new user/org facts from the last turn
2. **Background sweep (5-min heartbeat job):** Scan for threads where `last_active_at < now() - 5min` and `context_state_written_at < last_active_at`. Write pending L4 facts for those threads. This handles any session that ended without a final high-quality response.

Facts worth persisting:
- User explicitly stated preferences ("always show bullet points") → `scope: 'user'`
- Org-level decisions confirmed by a manager ("focus on Q2 going forward") → `scope: 'org'`
- Cross-survey relationships Crystal identified → `scope: 'org'`

Write with `confidence = eval_score` so low-quality inferences are down-weighted.

### Read path

At Crystal startup, retrieve top-5 most relevant entries — user-scoped entries for this user first, then org-scoped:

```python
# User-scoped (highest priority)
user_facts = pgvector_search(query_embedding, filter={"user_id": user_id}, top_k=3)
# Org-scoped (context)
org_facts  = pgvector_search(query_embedding, filter={"org_id": org_id, "scope": "org"}, top_k=3)
# Merge, user facts take precedence on conflicts
```

Injected into system prompt as the first context block (low recency value — belongs near the top):

```
[Org context from past sessions]:
- This user prefers executive-level summaries (user preference)
- This org last analyzed: Q1 2026 NPS survey, focus was onboarding friction
```

Cost: two pgvector ANN queries, ~10ms total.

---

## Context Window Budget

> **G27 fix:** The original tool result buffer estimate (500 tokens) is ~3× too low. A single `get_topic_details` call with 10 verbatims returns ~800 tokens. Three tool calls fill ~2,400 tokens, not 500. The table below reflects realistic measurements.

With all four layers active, Crystal's context budget per call:

| Section | Tokens (target) | Tokens (realistic max) | Source |
|---------|----------------|----------------------|--------|
| System prompt (persona + instructions) | 300 | 300 | Hardcoded |
| Org memory | 200 | 200 | L4 pgvector |
| Thread context_state | 200 | 200 | L2 Postgres |
| Last 2 raw turns | 400 | 600 | L2 raw messages |
| Survey facts | 300 | 400 | L3 Redis |
| Current message | 100 | 200 | User input |
| Tool result buffer | 500 | **2,400** | Dynamic — 3 tool calls |
| **Total** | **~2,000** | **~4,300** | |

**Key implication:** Tool results are the dominant variable. Three tool calls blow the 2,000-token target to 4,300. This is why tool call memoization (see below) and per-tool result truncation are essential, not optional.

Current baseline without any improvements: ~5,000–8,000 tokens.
Target with all improvements: ~2,000 (single-tool session) to ~4,300 (three-tool session).

---

## L1.5: Anthropic Prompt Caching (G22 — High Priority)

> This is the single highest-ROI improvement not in the original design. It doesn't require new infrastructure — just a change to how `call_agent` builds the message list for Claude models.

### What it is

Anthropic's Claude API supports `cache_control` blocks that cache specific message segments at the provider level. Cached content is billed at **$0.30/MTok for cache reads vs $3.00/MTok for standard input** — a 10× cost reduction.

### Why Crystal is the perfect use case

Crystal's system prompt includes the full insights list, topics table, and metrics block — typically 2,000–4,000 tokens. This content is **identical across multiple turns in the same conversation** (the survey data doesn't change mid-session). Passing the same 3,000-token block on every Crystal turn is pure waste.

### Implementation

In `call_agent` (or the skill runtime), when the provider is `anthropic`:

```python
messages = [
    {
        "role": "system",
        "content": [
            {
                "type": "text",
                "text": static_prefix,           # persona + instructions (~300 tokens)
                "cache_control": {"type": "ephemeral"}   # cached across turns
            },
            {
                "type": "text",
                "text": survey_context_block,    # insights + topics + metrics (~2,500 tokens)
                "cache_control": {"type": "ephemeral"}   # cached across turns
            }
        ]
    },
    # Dynamic content (org memory, thread state, current message) NOT cached
    ...
]
```

Cache TTL: 5 minutes. Crystal conversations rarely exceed 5 minutes. Turns 2–6 read from cache.

### Cost savings estimate

For a 6-turn Crystal session with a 3,000-token system prompt:
- Without caching: 6 × 3,000 = 18,000 input tokens × $3.00/MTok = $0.054
- With caching: 1 write (3,000 × $3.75/MTok) + 5 reads (15,000 × $0.30/MTok) = $0.011 + $0.0045 = $0.016
- **Savings: 70% on system prompt tokens per session**

**This improvement is implementation-only. No schema changes, no new services.**

---

## L0: Tool Call Memoization (G21 — Per-Session Cache)

> Missing from the original design. Adds a per-session in-memory cache for Crystal tool calls so duplicate calls within one conversation are free.

### Problem

In a multi-turn Crystal conversation, the user might ask "What are the top topics?" and later "Tell me more about the top topics." Crystal may call `get_survey_overview` or `get_topics` in both turns. The data hasn't changed. The second call is a redundant DB query + redundant tokens added to context.

### Implementation

Add `tool_cache` to `CrystalContext`:

```python
@dataclass
class CrystalContext:
    org_id: str
    user_id: str
    survey_id: str
    scope: str
    has_open_text: bool
    tool_cache: dict = field(default_factory=dict)  # {tool_name + str(params): result}
```

Wrap `dispatch_tool`:

```python
async def dispatch_tool_memoized(name: str, ctx: CrystalContext, params: dict) -> dict:
    cache_key = f"{name}:{json.dumps(params, sort_keys=True)}"
    if cache_key in ctx.tool_cache:
        return ctx.tool_cache[cache_key]
    result = await dispatch_tool(name, ctx, params)
    if "error" not in result:
        ctx.tool_cache[cache_key] = result
    return result
```

Lifetime: the `CrystalContext` object (one HTTP request / one SSE session). No Redis needed. No TTL management.

**Impact:** Eliminates 1–3 duplicate DB queries per Crystal session. More importantly, eliminates duplicate tokens in context (a repeated `get_survey_overview` result is ~300 tokens added twice = 300 tokens saved per duplicate).

---

## L3: Cold Start Handling (G28)

### Problem

L3 survey facts are written at `node_publish`. A user who opens Crystal before the first pipeline run completes gets an empty L3 cache. Crystal falls back to calling `get_survey_overview`, `get_topics`, and `get_metrics` in the first ReAct turns — 3 tool calls, ~1,000 tokens, ~1.5s added latency.

### Fix

Two steps:

1. **Document the fallback:** Crystal gracefully handles empty L3 by running tool calls. This is correct behavior, not a bug. The first session for a new survey will always be slower. Log `crystal_cold_start=true` in the trace.

2. **Self-warm after cold start:** After a successful first Crystal session where L3 was empty, write the tool results back to L3:
```python
if cold_start and tool_results:
    await redis.set(
        f"survey_facts:{survey_id}",
        json.dumps(build_survey_facts_from_tool_results(tool_results)),
        ex=86400,  # 24h TTL — will be replaced when pipeline publishes
    )
```
The second Crystal session for the same survey now hits L3 even before the pipeline runs.
The pipeline's `node_publish` always overwrites this with authoritative data.

---

## Gap G8: Unbounded Context Window

Crystal's ReAct loop accumulates tool results with no pruning. After 10+ tool calls, the context window can approach the model's limit, causing silent truncation.

**Fix:** Track token count in the Crystal loop. When total context exceeds `CRYSTAL_MAX_CONTEXT_TOKENS` (default: 80,000):
1. Compress older tool observations to one-line summaries
2. Drop tool results for tools that have been called before with identical inputs
3. Log a warning when compression kicks in

This is a safety valve — the L2/L3 improvements should prevent most cases.

---

## Alternative Memory Libraries

### Mem0

Open-source (MIT), `pip install mem0ai`. Automatically extracts facts from conversation turns, deduplicates memories, and handles org + user scoping natively.

**What it replaces:** L2 compression logic + L4 write/read paths. Single `memory.add(messages, user_id=..., org_id=...)` API.

**What it doesn't replace:** L1 semantic cache, L3 survey facts cache (both are survey-domain-specific and need custom logic regardless).

**Tradeoffs vs. 4-layer design:**

| | 4-layer (this design) | Mem0 |
|--|----------------------|------|
| Token reduction | 60–75% (measured) | 40–50% (reported) |
| L3 cold start handling | Yes (custom) | No |
| L1 semantic cache | Yes (custom) | No |
| Extraction quality | Deterministic/structured | LLM-based (better for edge cases) |
| New infra | None | None (uses existing Redis+PG) |
| Maintenance burden | We own logic | Mem0 maintains |

**Recommendation:** Start with the 4-layer design. If L2 extraction logic grows beyond ~300 lines or starts drifting in quality, Mem0 is a clean drop-in for layers 2 and 4.

### Graphiti (from Zep)

Open-source (Apache 2.0), `pip install graphiti-core`. Time-aware knowledge graph for agent memory. Stores facts as graph edges with `valid_from`/`valid_to` timestamps.

**Why this matters:** pgvector stores static vectors. Cosine similarity doesn't capture time. Crystal often needs temporal reasoning: "last quarter they focused on onboarding — is that still relevant?" Graphiti handles temporal decay natively.

**Tradeoff:** Requires Neo4j or FalkorDB (additional service). Not needed until temporal reasoning becomes a visible gap in production Crystal sessions.

### Zep Cloud

Auto-extracts structured facts per user/session, maintains a knowledge graph. Better than Mem0 for social/conversational use cases. Less specialized than your domain-specific approach.

**Recommendation:** Evaluate Graphiti specifically for L4 (org memory with temporal reasoning) once the basic L4 is shipped and showing limitations. Zep Cloud is lower priority — data residency concerns for enterprise customers.
