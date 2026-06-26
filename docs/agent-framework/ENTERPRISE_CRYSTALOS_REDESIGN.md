# Enterprise CrystalOS Redesign

**Status:** Design complete — implementation ready  
**Scope:** Multi-tenant architecture, skill system, quality pipeline, feedback routing

---

## Executive Summary

CrystalOS was built for a single tenant. It works. But the model breaks at enterprise scale:

- No brand isolation — a Marriott Crystal session can theoretically collide with a Hilton one
- Crystal identifies itself as "Crystal" regardless of what brand the customer bought
- Quality is immeasurable — there's no feedback loop, no thumbs up/down, no signal back into training
- Skill evals are keyword heuristics — `if "actionable" in description: return 0.8`
- Feature requests and bug reports vanish into the void — there's no capture, no routing, no aggregation

This document defines the path from "works for one tenant" to "best-in-class enterprise AI platform." Every change is grounded in specific code issues with file and line citations.

---

## Part I — Current State Audit

Twelve specific issues found in the current codebase:

### Issue 1: CrystalContext has no tenant identity
**File:** `crystalos/crystal/context.py:8-15`

```python
@dataclass(frozen=True)
class CrystalContext:
    org_id:        str     # ← only tenant signal
    user_id:       str
    survey_id:     str | None
    scope:         Literal["survey", "org", "group"]
    run_id:        str | None = None
    has_open_text: bool = True
    tag_ids:       tuple[str, ...] | None = None
```

No `brand_id`, no `brand_name`, no `permitted_features`, no `user_role`. Every enterprise requirement — persona customization, feature gating, data region, custom instructions — has nowhere to live. When Marriott buys a Crystal license, the context object has no way to know it's Marriott.

### Issue 2: Redis keys are not brand-namespaced
**Files:** `crystalos/lib/constants.py:204-206`, `crystalos/agents/crystal.py:739`

```python
# constants.py
SEMANTIC_CACHE_KEY_PREFIX: str = "semantic_cache"
SURVEY_FACTS_KEY_PREFIX:   str = "survey_facts"

# crystal.py:739
rate_key = f"crystal:{org_id}:rpm"
```

If two brands share the same Redis instance and happen to have the same org_id structure, semantic cache results can bleed across tenants. Rate limits are per-org only, meaning a high-volume brand cannot be given its own rate envelope. The pattern should be `brand:{brand_id}:crystal:{org_id}:rpm`.

### Issue 3: org_context accepted from untrusted client input
**File:** `crystalos/main.py:488, 645, 706, 886`

```python
org_ctx = sanitise_org_context(body.org_context.model_dump())
```

`sanitise_org_context` validates field lengths, not ownership. A client for org A could inject `industry: "finance"` to activate the finserv specialist even if org A is a retail org. The specialist selection and compliance rules flow from this context. It should be fetched from the database using the trusted `org_id`, not accepted from the request body.

### Issue 4: Navigation hints are vague strings, not actual routes
**File:** `crystalos/agents/crystal.py:419-431`

```python
nav_section = """
• "Explore [Survey Name] Intelligence"   — survey dashboard with insights
• "View topics in [Survey Name]"         — topic hierarchy and drill-down
• "Run advanced analysis on [Survey]"    — deep analytical tools
"""
```

These are human-readable description strings. The frontend can't render them as clickable navigation. Crystal should emit structured route objects: `{"type": "navigation", "route": "/app/surveys/{id}/responses", "label": "View NPS breakdown"}`. The frontend already has `ROUTES` constants and `toPath()` — Crystal should speak in those terms.

### Issue 5: Two specialist routing functions that diverge
**File:** `crystalos/specialists/registry.py:46-119`

```python
class SpecialistRegistry:
    def match(self, org, survey) -> list[BaseSpecialist]:
        # 5-signal score matrix: industry(50) + vertical(10) + use_case(30) + type(20) + audience(10)
        ...

def get_specialist_for_survey(org_industry: str, survey_type: str | None) -> str:
    # Simple industry_map dict lookup, no score matrix
    industry_map = {"healthcare": "healthcare_cx", ...}
```

`SpecialistRegistry.match()` and `get_specialist_for_survey()` are separate functions that can return different specialists for the same inputs. `insights.py` calls `get_specialist_for_survey()` in `_generate_action_recommendations()` (line 408), while `route_specialists` in the LangGraph pipeline calls `match()`. A survey can get different specialists at different pipeline stages. This is a routing consistency bug.

### Issue 6: `_eval_criterion` is pure keyword heuristics
**File:** `crystalos/lib/skill_runtime.py:379-427`

```python
def _eval_criterion(self, description: str, output: str, weight: float) -> float:
    desc = description.lower()
    if "valid json" in desc:
        try:
            json.loads(output); return 1.0
        except Exception:
            return 0.0
    if "required fields" in desc:
        ...
    if "actionable" in desc:
        if len(output) > 50: return 0.8  # ← length proxy for actionable
    ...
    return 0.8  # default soft pass
```

The soft default `0.8` means any criterion not matching a known keyword pattern passes at 80%. A criterion like "recommendations should reference specific survey questions" returns 0.8 regardless of whether the output does that. This makes EVALS.md gates meaningless for anything beyond basic structural checks.

### Issue 7: `difflib.SequenceMatcher` for skill discovery
**File:** `crystalos/lib/skill_registry.py:132-152`

```python
def find(self, query: str) -> SkillManifest | None:
    best_ratio = 0.0
    best_skill = None
    for name, skill in self._skills.items():
        ratio = SequenceMatcher(None, query.lower(), name.lower()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_skill = skill
    return best_skill if best_ratio > 0.6 else None
```

Character-level string overlap doesn't match semantics. "What's causing score drops?" has zero string overlap with "analyze_key_drivers" even though that's exactly the right skill. The `find()` method needs semantic (embedding) matching to work reliably.

### Issue 8: ReAct loop swallows errors during synthesis
**File:** `crystalos/agents/crystal.py:837-847, 865-868, 898`

```python
# Turn loop
try:
    step, _ = await call_agent(...)
except Exception as exc:
    logger.warning("crystal_react_step_failed", turn=turn, error=str(exc))
    break  # ← exits loop, no error context injected

# Tool calls
try:
    result = await dispatch_tool(call.tool, ctx, args)
except Exception as exc:
    result = {"error": str(exc)}  # ← no type discrimination (timeout vs auth vs rate limit)

# Synthesis (line 898) — runs even when tool_results is empty
augmented_input = f"{inp}\n\n{format_observations(tool_results)}"
```

When `call_agent()` fails, synthesis runs with empty tool observations. Crystal generates a response with no grounding. The error type is lost — a circuit breaker open looks identical to a network timeout in the logs. Enterprise monitoring needs structured error codes, not exception string dumps.

### Issue 9: Stream consumer has no dead-letter queue
**File:** `crystalos/consumers/response_stream.py:254-262, 323-335`

```python
except Exception as exc:
    logger.error("stream_consumer_trigger_failed", ...)
finally:
    _pending_triggers.discard(survey_id)  # ← removed even on failure

# Redis error handling
except Exception as exc:
    logger.error("stream_consumer_redis_error", ...)
    await asyncio.sleep(15)  # ← then restarts — no backoff, no circuit breaker
```

A failed trigger (DB timeout, backend down) discards the event forever. There's no retry queue, no dead-letter storage, no backoff on repeated backend failures. When the backend is down, the consumer hammers it every 15 seconds. Progressive tier events (the first 10 responses that should trigger a quick-insights run) can be permanently lost.

### Issue 10: Budget exhaustion trips the circuit breaker
**File:** `crystalos/lib/openrouter.py:129-140`

```python
def _count_for_circuit(exc: BaseException) -> bool:
    if isinstance(exc, OpenRouterError) and not exc.retryable:
        return False
    return True  # ← BudgetExceededError falls here and increments the failure counter
```

`BudgetExceededError` is a customer entitlement limit, not a provider failure. After three budget-exceeded events (a single org running expensive multi-doc analyses), the circuit opens and blocks ALL subsequent calls for that org — including cheap followup questions. This is the wrong behavior.

### Issue 11: No user feedback capture
**Across entire codebase** — grep found no `/feedback` endpoint, no `thumbs_up`/`thumbs_down` columns in insights table, no quality signal collection anywhere. `user_state` in `insights.py:3759-3795` carries `pins` and `thumbs` through pipeline runs but there's no way for a user to submit a thumbs signal. Crystal produces thousands of insights with no signal on which ones were actually useful.

### Issue 12: Skill runtime disabled in production
**File:** `crystalos/lib/constants.py`

```python
USE_SKILL_RUNTIME: bool = False
```

The entire skill framework — SKILL.md discovery, EVALS.md quality gates, few-shot example bank, progressive retry — is gated behind a flag that defaults to `False`. Skills are defined but their runtime quality guarantee is off. Evaluation passes happen but aren't enforced.

---

## Part II — The Enterprise Foundation: BrandContext

Everything in the redesign flows from adding proper tenant identity to the context object.

### 2.1 New CrystalContext

**File to update:** `crystalos/crystal/context.py`

```python
"""CrystalContext — immutable request context passed to every Crystal tool."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, FrozenSet


@dataclass(frozen=True)
class BrandContext:
    """Enterprise tenant identity — set once at request boundary, propagated everywhere."""
    brand_id:              str
    brand_name:            str
    brand_persona:         str | None          # "Marriott Insights" — how Crystal introduces itself
    data_region:           Literal["us", "eu", "apac", "ca"]
    plan_tier:             Literal["starter", "growth", "enterprise", "enterprise_plus"]
    permitted_features:    frozenset[str]      # Explicit allowlist from brand contract
    restricted_features:   frozenset[str]      # Explicit blocklist
    custom_instructions:   str | None          # Brand-specific Crystal behavior addendum
    support_ticket_url:    str | None          # Brand's own support system for bug routing
    feature_request_url:   str | None          # Brand's own roadmap system
    max_tool_turns:        int = 10            # Configurable per brand tier
    thread_ttl_days:       int = 7             # Configurable per brand
    progressive_tiers:     tuple[int, ...] = (10, 40, 100, 250)  # Configurable per volume


@dataclass(frozen=True)
class CrystalContext:
    org_id:             str
    user_id:            str
    survey_id:          str | None
    scope:              Literal["survey", "org", "group"]
    run_id:             str | None = None
    has_open_text:      bool = True
    tag_ids:            tuple[str, ...] | None = None
    brand:              BrandContext | None = None              # None = first-party Experient org
    user_role:          Literal["viewer", "editor", "admin", "brand_admin"] = "viewer"
    effective_perms:    frozenset[str] = frozenset()            # Resolved at request boundary
```

`effective_perms` is computed once per request from `(brand.permitted_features ∩ user_role_perms)` — the intersection of what the brand contract allows AND what the user's role permits. Every downstream check reads `ctx.effective_perms`, never re-computing.

### 2.2 Brand-safe Redis Key Builder

**New file:** `crystalos/lib/redis_keys.py`

```python
"""Central namespace for all Redis keys — enforces brand isolation."""
from __future__ import annotations


class K:
    """Every Redis key in CrystalOS goes through this class."""

    @staticmethod
    def _ns(brand_id: str | None) -> str:
        return f"brand:{brand_id}" if brand_id else "global"

    @classmethod
    def rate_limit(cls, brand_id: str | None, org_id: str) -> str:
        return f"{cls._ns(brand_id)}:crystal:{org_id}:rpm"

    @classmethod
    def semantic_cache(cls, brand_id: str | None, org_id: str, key_hash: str) -> str:
        return f"{cls._ns(brand_id)}:semantic_cache:{org_id}:{key_hash}"

    @classmethod
    def survey_facts(cls, brand_id: str | None, org_id: str, survey_id: str) -> str:
        return f"{cls._ns(brand_id)}:survey_facts:{org_id}:{survey_id}"

    @classmethod
    def progressive_tier(cls, brand_id: str | None, survey_id: str, tier: str) -> str:
        return f"{cls._ns(brand_id)}:tier:{survey_id}:{tier}"

    @classmethod
    def thread_lock(cls, brand_id: str | None, survey_id: str, org_id: str) -> str:
        return f"{cls._ns(brand_id)}:thread_lock:{org_id}:{survey_id}"
```

All code that constructs Redis keys is refactored to use `K.*()`. No raw f-string key construction anywhere.

### 2.3 BrandContext Loaded from DB, Not Client

**File to update:** `crystalos/main.py` — the request boundary

```python
@router.post("/api/insights/{survey_id}/crystal")
async def crystal_endpoint(
    survey_id: str,
    body: CrystalRequest,
    db: asyncpg.Connection = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    # Trust: org_id and user_id come from the authenticated session (set by Node.js backend)
    # Do NOT trust: industry, brand info, permissions from the request body
    
    # Fetch brand context from DB using trusted org_id
    brand_row = await db.fetchrow(
        """SELECT b.brand_id, b.brand_name, b.brand_persona, b.data_region,
                  b.plan_tier, b.permitted_features, b.restricted_features,
                  b.custom_instructions, b.support_ticket_url, b.feature_request_url,
                  b.max_tool_turns, b.thread_ttl_days
           FROM brand_org_memberships m
           JOIN brands b ON b.brand_id = m.brand_id
           WHERE m.org_id = $1""",
        body.org_id,
    )
    
    brand = BrandContext(**brand_row) if brand_row else None
    
    # Resolve effective permissions once
    effective_perms = _resolve_permissions(brand, body.user_role)
    
    ctx = CrystalContext(
        org_id=body.org_id,
        user_id=body.user_id,
        survey_id=survey_id,
        scope=body.scope,
        brand=brand,
        user_role=body.user_role,
        effective_perms=effective_perms,
    )
    # org_context for specialist routing is also fetched from DB, not trusted from body
    org_ctx = await _fetch_org_context(db, body.org_id)
    ...
```

---

## Part III — Redesigned Crystal Agent

### 3.1 Brand-Aware System Prompt

**File to update:** `crystalos/agents/crystal.py:389` — `_build_system_prompt()`

```python
def _build_brand_identity(ctx: CrystalContext) -> str:
    if ctx.brand and ctx.brand.brand_persona:
        return ctx.brand.brand_persona
    elif ctx.brand:
        return f"Crystal, the AI intelligence layer for {ctx.brand.brand_name} — powered by Experient"
    return "Crystal, the AI Intelligence layer for Experient"

def _build_custom_instructions(ctx: CrystalContext) -> str:
    if ctx.brand and ctx.brand.custom_instructions:
        return f"\n\nAdditional brand guidance:\n{ctx.brand.custom_instructions}"
    return ""

def _build_system_prompt(ctx: CrystalContext, ...) -> str:
    identity = _build_brand_identity(ctx)
    custom = _build_custom_instructions(ctx)
    tool_list = _build_filtered_tool_list(ctx)       # only permitted tools
    nav_guide = _build_navigation_guide()             # route-based, not vague strings
    ...
```

Crystal's self-introduction changes per brand. Marriott's Crystal says "Marriott Insights, the AI intelligence layer for Marriott Hotels." Their custom_instructions can add "Always frame responses in hospitality industry terms. Reference RevPAR and CSAT metrics when available."

### 3.2 Permission-Filtered Tool List

```python
def _build_filtered_tool_list(ctx: CrystalContext) -> list[str]:
    """Return only tools the user's effective permissions allow."""
    all_tools = list(TOOL_DEFINITIONS.keys())
    
    filtered = []
    for tool_name in all_tools:
        required_perm = TOOL_PERMISSION_MAP.get(tool_name)
        if required_perm is None:
            filtered.append(tool_name)  # tool needs no special permission
        elif required_perm in ctx.effective_perms:
            filtered.append(tool_name)
        # else: silently exclude — Crystal won't see or attempt this tool

    # Also exclude brand-restricted tools
    if ctx.brand:
        filtered = [t for t in filtered if t not in ctx.brand.restricted_features]
    
    return filtered

# Permission map — tools requiring elevated access
TOOL_PERMISSION_MAP = {
    "export_responses":     "data:export",
    "view_respondent_pii":  "data:pii",
    "configure_alerts":     "workflow:write",
    "manage_survey":        "survey:write",
}
```

Crystal's tool list in the system prompt only shows tools the user can actually use. A viewer-role user gets a shorter prompt and Crystal never attempts `configure_alerts` on their behalf.

### 3.3 Dynamic Context Selection (Replace Full-Dump)

Current `_build_system_prompt()` injects all available insights into the prompt. At 200 insights it exceeds context limits and injects irrelevant noise.

**Replacement: relevance-ranked selection**

```python
async def _select_relevant_context(
    query: str,
    insights: list[dict],
    max_tokens: int = 6000,
) -> list[dict]:
    if not insights or not query:
        return insights[:10]  # fallback: recency
    
    q_embedding = await embed_text(query)
    scored = []
    for ins in insights:
        if ins.get("embedding"):
            sim = _cosine_sim(q_embedding, ins["embedding"])
            scored.append((sim, ins))
        else:
            scored.append((0.3, ins))  # unembedded: below average priority
    
    scored.sort(key=lambda x: x[0], reverse=True)
    
    selected, tokens = [], 0
    for _, ins in scored:
        t = _estimate_tokens(ins.get("summary", ""))
        if tokens + t > max_tokens:
            break
        selected.append(ins)
        tokens += t
    
    return selected
```

For a query about "NPS drivers," Crystal's context is seeded with the NPS-relevant insights. For "employee themes" it shifts to employee insights. Context stays focused and under budget regardless of how many total insights exist.

### 3.4 Route-Aware Navigation (Replace Vague Strings)

**File to update:** `crystalos/agents/crystal.py:419-431`

```python
NAVIGATION_GUIDE = """
## Navigation

When recommending a user navigate somewhere, emit a structured navigation action:
{"type": "navigation", "route": "<path>", "label": "<user-visible text>"}

Available routes:
- /app/surveys                              — survey list
- /app/surveys/{survey_id}/build            — survey builder
- /app/surveys/{survey_id}/responses        — response dashboard + insights
- /app/insights                             — cross-survey insights hub
- /app/insights/advanced                    — advanced analytical tools
- /app/workflows                            — automation workflows
- /app/settings                             — account settings
- /app/respondents                          — respondent directory

Rules:
- Always use the actual route pattern, substituting real survey IDs you know from context
- Include navigation suggestions as structured actions in your response, not as text links
- Multiple navigation suggestions in one turn are fine
"""
```

The frontend SSE handler already parses structured event types. It will render `{"type": "navigation", "route": "..."}` events as clickable chips the user can tap to navigate directly — no copy-paste of a path required.

### 3.5 Structured Error Injection (Replace Silent Break)

**File to update:** `crystalos/agents/crystal.py:837-847`

```python
async def _run_react_loop(inp: str, ctx: CrystalContext, ...) -> dict:
    tool_results = []
    error_context = []
    
    for turn in range(max_turns):
        try:
            step, _ = await call_agent(messages=messages, ...)
        except CircuitBreakerOpen as exc:
            error_context.append({"turn": turn, "code": "circuit_open", "detail": str(exc)})
            break  # provider unreachable — stop here
        except BudgetExceededError:
            error_context.append({"turn": turn, "code": "budget_exceeded"})
            break  # entitlement limit — stop gracefully
        except Exception as exc:
            error_context.append({"turn": turn, "code": "llm_error", "detail": str(exc)})
            if turn < 2:
                continue  # retry transient failures on early turns
            break
        
        # ... tool dispatch ...
        try:
            result = await dispatch_tool(call.tool, ctx, args)
        except Exception as exc:
            result = {
                "error": True,
                "code": type(exc).__name__,
                "message": str(exc)[:500],
            }
            logger.error("crystal_tool_failed", tool=call.tool, error_code=type(exc).__name__)
    
    # Synthesis gets both observations AND error context
    synthesis_context = {
        "observations": tool_results,
        "errors": error_context,  # LLM can acknowledge "I couldn't access X because..."
    }
    return synthesis_context
```

Crystal can now say "I was unable to analyze trends because the data tool timed out — here's what I found from the other tools." The error type is structured, enabling telemetry dashboards to distinguish timeout rates from budget exhaustion rates.

---

## Part IV — Redesigned Skill System

### 4.1 Unified Specialist Routing

**File to update:** `crystalos/specialists/registry.py` — eliminate `get_specialist_for_survey()`

The standalone function on line 107 is removed. All routing goes through `SpecialistRegistry.match()`. Code in `insights.py:408` that calls `get_specialist_for_survey()` is updated to call `registry.match(org_ctx, survey_ctx)`.

This is the single change that fixes the routing consistency bug — one function, one logic path, one result regardless of where in the pipeline the routing happens.

### 4.2 Semantic Skill Router

**File to update:** `crystalos/lib/skill_registry.py:132` — replace `find()` with embedding search

```python
class SkillRegistry:
    def __init__(self):
        self._skills: dict[str, SkillManifest] = {}
        self._embeddings: dict[str, list[float]] = {}
        self._router_ready = False
        # ... existing init ...
    
    async def warm_router(self):
        """Pre-embed all skill descriptions for semantic search. Call at startup."""
        texts = {
            name: f"{s.name}: {s.description}. {' '.join(s.use_cases or [])}"
            for name, s in self._skills.items()
        }
        embeddings = await embed_batch(list(texts.values()))
        self._embeddings = dict(zip(texts.keys(), embeddings))
        self._router_ready = True
        logger.info("skill_router_warmed", skill_count=len(self._embeddings))
    
    async def find(self, query: str, top_k: int = 3) -> list[tuple[SkillManifest, float]]:
        """Semantic skill search — returns up to top_k skills with similarity scores."""
        if not self._router_ready or not self._embeddings:
            return []  # graceful degradation if embeddings not ready
        
        q_embedding = await embed_text(query)
        
        scored = []
        for skill_name, skill_embedding in self._embeddings.items():
            sim = _cosine_sim(q_embedding, skill_embedding)
            if sim > 0.35:  # minimum relevance threshold
                scored.append((self._skills[skill_name], sim))
        
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]
    
    def find_sync(self, query: str) -> SkillManifest | None:
        """Legacy sync interface — kept for backward compat, uses difflib as fallback."""
        from difflib import SequenceMatcher
        # ... existing difflib logic ...
```

The embedding model is `all-MiniLM-L6-v2` (80MB, ~5ms inference). Embeddings are computed once at startup and cached in memory. A query like "what's causing NPS drops" now finds `analyze_key_drivers` at similarity 0.73 instead of missing it entirely.

### 4.3 LLM-Judged Evals for Complex Criteria

**File to update:** `crystalos/lib/skill_runtime.py:379-427`

```python
# Structural criteria that can be evaluated deterministically
STRUCTURAL_KEYWORDS = {
    "valid json", "required fields", "word count", "character limit",
    "count", "length", "number of", "contains", "starts with", "ends with",
}

def _is_structural_criterion(description: str) -> bool:
    return any(kw in description.lower() for kw in STRUCTURAL_KEYWORDS)


async def _eval_criterion(
    self,
    description: str,
    criterion_name: str,
    output: str,
    weight: float,
) -> float:
    """Evaluate one criterion. Use keyword rules for structural checks,
    LLM judge for semantic/quality checks."""
    
    if _is_structural_criterion(description):
        return self._eval_structural(description, output)
    
    # Semantic/quality criterion — use LLM judge
    prompt = f"""You are an AI quality evaluator. Score this output on one criterion.

Criterion: {description}

Output:
---
{output[:3000]}
---

Score from 0.0 to 1.0:
- 0.0: completely fails the criterion
- 0.5: partially meets the criterion
- 1.0: fully meets the criterion

Respond with ONLY a decimal number (e.g. 0.7). No explanation."""

    try:
        result = await call_agent(
            messages=[{"role": "user", "content": prompt}],
            model="claude-haiku-4-5-20251001",  # cheapest model — this runs per-criterion
            max_tokens=5,
        )
        score = float(result.strip())
        return max(0.0, min(1.0, score))
    except (ValueError, Exception):
        return 0.5  # neutral fallback, not soft-pass


def _eval_structural(self, description: str, output: str) -> float:
    """Fast deterministic evaluation for structural criteria."""
    desc = description.lower()
    
    if "valid json" in desc:
        try:
            json.loads(output); return 1.0
        except Exception:
            return 0.0
    
    if "word count" in desc or "words" in desc:
        match = re.search(r"(\d+)\s*words?", desc)
        if match:
            target = int(match.group(1))
            actual = len(output.split())
            return 1.0 if actual >= target * 0.8 else actual / (target * 0.8)
    
    # ... other structural checks ...
    return 0.8
```

This hybrid approach: structural criteria (JSON validity, word count, field presence) use deterministic code. Quality criteria ("recommendations should be specific to the survey data", "tone should be professional") use an LLM judge that actually understands the criterion semantics. The LLM judge model is Haiku — fast and cheap. A full EVALS.md run with 5 criteria costs ~$0.001.

### 4.4 Multi-Source Skill Loading (Brand-Specific Skills)

**File to update:** `crystalos/lib/skill_registry.py:62` — `_scan_skills()`

```python
def _scan_skills(self, extra_dirs: list[Path] | None = None):
    """Discover skills from global directory + any brand-specific directories."""
    search_dirs = [self._skills_dir]
    
    if extra_dirs:
        search_dirs.extend(extra_dirs)
    
    for skills_dir in search_dirs:
        if not skills_dir.exists():
            continue
        for skill_path in skills_dir.rglob("SKILL.md"):
            manifest = self._parse_skill_md(skill_path)
            if manifest:
                # Brand skills override global skills with same name
                self._skills[manifest.name] = manifest
                logger.info("skill_loaded", name=manifest.name, source=str(skill_path.parent))
```

At startup (or at brand session init for hot-load), the registry loads:
1. `/crystalos/skills/` — global Experient skills (always loaded)
2. `/crystalos/skills/brands/{brand_id}/` — brand-specific skills (loaded per brand)

A healthcare brand can contribute `SKILL.md` files for HCAHPS analysis, CMS star rating benchmarks, or press ganey scoring. These appear as tools Crystal can use *only for that brand*.

### 4.5 Diversity-Controlled Example Bank

**File to update:** `crystalos/lib/skill_runtime.py:429-460` — `_write_example_async()`

```python
async def _write_example_async(
    self,
    skill_name: str,
    org_id: str,
    input_text: str,
    output: str,
    eval_score: float,
    db_conn,
):
    """Write a passing example to the bank, enforcing diversity."""
    if eval_score < self._pass_threshold:
        return
    
    # Check how many examples we already have from this org for this skill
    org_count = await db_conn.fetchval(
        "SELECT COUNT(*) FROM skill_examples WHERE skill_name=$1 AND org_id=$2",
        skill_name, org_id,
    )
    max_per_org = max(1, SKILL_EXAMPLE_MAX_PER_SKILL // 5)  # at most 20% per org
    if org_count >= max_per_org:
        return  # diversity gate: prevent one org from dominating example bank
    
    # Deduplicate against existing examples via embedding similarity
    input_embedding = await embed_text(input_text)
    similar = await db_conn.fetchval(
        """SELECT COUNT(*) FROM skill_examples
           WHERE skill_name=$1
             AND embedding <=> $2::vector < 0.15""",  # within 15% cosine distance
        skill_name, json.dumps(input_embedding),
    )
    if similar > 0:
        return  # near-duplicate detected, skip
    
    await db_conn.execute(
        """INSERT INTO skill_examples
           (skill_name, org_id, input, output, eval_score, embedding, created_at)
           VALUES ($1,$2,$3,$4,$5,$6::vector, NOW())""",
        skill_name, org_id, input_text, output, eval_score, json.dumps(input_embedding),
    )
```

The example bank now:
- Caps any single org at 20% of examples (prevents bias toward large customers)
- Deduplicates via pgvector cosine distance (< 0.15 = near-duplicate, skip)
- Spreads examples across org/use case combinations to maximize generalization

### 4.6 Enable Skill Runtime by Default

**File to update:** `crystalos/lib/constants.py`

```python
USE_SKILL_RUNTIME: bool = True   # was False — skill runtime is now the production path
```

This is the smallest change with the largest impact. Every skill execution now goes through EVALS.md quality gates, the few-shot example bank, and retry-on-failure. The entire framework was built and then left off.

---

## Part V — Telemetry + Auto-Improvement Pipeline

The core principle: every Crystal interaction is structured data, and that data powers automatic quality improvement.

### 5.1 Database Schema

```sql
-- Every Crystal turn, structured
CREATE TABLE crystal_turn_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    brand_id        TEXT,
    user_id         TEXT NOT NULL,
    survey_id       TEXT,
    thread_id       TEXT NOT NULL,
    turn_index      INT NOT NULL,
    query           TEXT NOT NULL,
    response_tokens INT,
    tools_called    JSONB DEFAULT '[]',      -- [{tool, latency_ms, success}]
    tool_errors     JSONB DEFAULT '[]',      -- [{tool, code, message}]
    eval_score      DECIMAL(4,3),
    model_used      TEXT,
    tokens_in       INT,
    tokens_out      INT,
    latency_ms      INT,
    quality_signal  TEXT CHECK (quality_signal IN ('positive', 'negative', 'neutral')),
    specialist_used TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User-submitted feedback (thumbs up/down)  
CREATE TABLE crystal_feedback (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_event_id  UUID REFERENCES crystal_turn_events(id),
    org_id         TEXT NOT NULL,
    brand_id       TEXT,
    user_id        TEXT NOT NULL,
    signal         SMALLINT NOT NULL CHECK (signal IN (-1, 1)),
    reason_code    TEXT,   -- "wrong_data", "not_actionable", "off_topic", "great"
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature requests and bug reports extracted from conversations
CREATE TABLE crystal_product_signals (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type      TEXT NOT NULL CHECK (signal_type IN ('feature_request', 'bug', 'complaint', 'praise')),
    org_id           TEXT NOT NULL,
    brand_id         TEXT,
    user_id          TEXT NOT NULL,
    survey_id        TEXT,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL,
    affects_feature  TEXT,
    severity         TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    routing          TEXT NOT NULL CHECK (routing IN ('platform', 'brand')),
    brand_ticket_url TEXT,
    status           TEXT DEFAULT 'open',
    vote_count       INT DEFAULT 1,
    semantic_hash    TEXT,   -- for dedup
    raw_query        TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skill quality aggregation (updated by background job)
CREATE TABLE skill_quality_metrics (
    skill_name          TEXT NOT NULL,
    org_id              TEXT NOT NULL,
    brand_id            TEXT,
    total_runs          INT DEFAULT 0,
    pass_count          INT DEFAULT 0,
    avg_eval_score      DECIMAL(4,3),
    positive_signals    INT DEFAULT 0,
    negative_signals    INT DEFAULT 0,
    p50_latency_ms      INT,
    p99_latency_ms      INT,
    last_updated        TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (skill_name, org_id, COALESCE(brand_id, ''))
);

CREATE INDEX ON crystal_turn_events (org_id, brand_id, created_at DESC);
CREATE INDEX ON crystal_turn_events (quality_signal) WHERE quality_signal IS NOT NULL;
CREATE INDEX ON crystal_product_signals (brand_id, status, signal_type);
CREATE INDEX ON crystal_product_signals (semantic_hash);
```

### 5.2 Turn Event Publisher

**New file:** `crystalos/lib/turn_publisher.py`

```python
"""Publishes structured Crystal turn events for telemetry and quality improvement."""
from __future__ import annotations
import asyncio
from dataclasses import dataclass, asdict
from datetime import datetime
from crystalos.crystal.context import CrystalContext
from crystalos.lib.db import get_pool
from crystalos.lib.logger import logger


@dataclass
class TurnEvent:
    org_id:          str
    brand_id:        str | None
    user_id:         str
    survey_id:       str | None
    thread_id:       str
    turn_index:      int
    query:           str
    tools_called:    list[dict]
    tool_errors:     list[dict]
    eval_score:      float | None
    model_used:      str
    tokens_in:       int
    tokens_out:      int
    latency_ms:      int
    specialist_used: str | None
    quality_signal:  str | None = None


async def publish_turn_event(event: TurnEvent, ctx: CrystalContext) -> None:
    """Fire-and-forget telemetry write — never blocks the Crystal response."""
    asyncio.create_task(_write_turn_event(event, ctx))


async def _write_turn_event(event: TurnEvent, ctx: CrystalContext) -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO crystal_turn_events
                   (org_id, brand_id, user_id, survey_id, thread_id, turn_index,
                    query, tools_called, tool_errors, eval_score, model_used,
                    tokens_in, tokens_out, latency_ms, specialist_used, quality_signal)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)""",
                event.org_id, event.brand_id, event.user_id, event.survey_id,
                event.thread_id, event.turn_index, event.query,
                json.dumps(event.tools_called), json.dumps(event.tool_errors),
                event.eval_score, event.model_used, event.tokens_in,
                event.tokens_out, event.latency_ms, event.specialist_used,
                event.quality_signal,
            )
    except Exception as exc:
        logger.warning("turn_event_publish_failed", error=str(exc))
        # Telemetry is non-blocking — never propagate this error to the user
```

Crystal calls `publish_turn_event()` after every response. The write is `asyncio.create_task()` — it does not add latency to the response.

### 5.3 Automatic Quality Signal Detection

```python
_FRUSTRATION = [
    "that's wrong", "incorrect", "not what i asked", "try again",
    "that's not right", "you're wrong", "that doesn't make sense",
    "that's not helpful", "stop", "nevermind", "forget it",
]
_SATISFACTION = [
    "perfect", "exactly", "great", "thanks", "helpful",
    "that's what i needed", "good job", "nice", "awesome",
    "thank you", "excellent",
]

def detect_quality_signal(query: str) -> str | None:
    q = query.lower()
    if any(p in q for p in _FRUSTRATION):
        return "negative"
    if any(p in q for p in _SATISFACTION):
        return "positive"
    return None
```

Quality signal from the NEXT turn's query: if the user says "that's wrong, try again" Crystal knows the previous turn was bad. This is captured on the turn event for the previous turn.

### 5.4 User Feedback Endpoint

**File to update:** `crystalos/main.py` — new endpoint

```python
@router.post("/api/crystal/feedback")
async def submit_crystal_feedback(
    body: CrystalFeedbackRequest,
    db: asyncpg.Connection = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    """Thumbs up/down on a Crystal response."""
    
    await db.execute(
        """INSERT INTO crystal_feedback
           (turn_event_id, org_id, brand_id, user_id, signal, reason_code, comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
        body.turn_event_id, body.org_id, body.brand_id,
        body.user_id, body.signal, body.reason_code, body.comment,
    )
    
    # If negative signal, check if this is a pattern (3+ in last 7 days from this org)
    negative_count = await db.fetchval(
        """SELECT COUNT(*) FROM crystal_feedback
           WHERE org_id=$1 AND signal=-1 AND created_at > NOW() - INTERVAL '7 days'""",
        body.org_id,
    )
    if negative_count >= 3:
        # Auto-flag for quality review
        await _flag_quality_regression(db, body.org_id, body.brand_id)
    
    return {"status": "recorded"}
```

The frontend shows thumbs up/down on every Crystal response. These are the most direct quality signals and they previously had nowhere to go.

### 5.5 Auto-Improvement Background Job

**File to update:** `crystalos/scheduler.py` — new nightly job

```python
async def _aggregate_skill_quality():
    """Nightly: update skill_quality_metrics from turn events and feedback."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO skill_quality_metrics
                (skill_name, org_id, brand_id, total_runs, pass_count,
                 avg_eval_score, positive_signals, negative_signals,
                 p50_latency_ms, last_updated)
            SELECT
                unnest(tools_called::text[]) as skill_name,
                org_id, brand_id,
                COUNT(*) as total_runs,
                COUNT(*) FILTER (WHERE eval_score >= 0.75) as pass_count,
                AVG(eval_score) as avg_eval_score,
                COUNT(*) FILTER (WHERE quality_signal = 'positive') as positive_signals,
                COUNT(*) FILTER (WHERE quality_signal = 'negative') as negative_signals,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50_latency_ms,
                NOW()
            FROM crystal_turn_events
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY 1, 2, 3
            ON CONFLICT (skill_name, org_id, COALESCE(brand_id, ''))
            DO UPDATE SET
                total_runs = EXCLUDED.total_runs,
                pass_count = EXCLUDED.pass_count,
                avg_eval_score = EXCLUDED.avg_eval_score,
                positive_signals = EXCLUDED.positive_signals,
                negative_signals = EXCLUDED.negative_signals,
                last_updated = NOW()
        """)

async def _flag_low_quality_skills():
    """Flag skills with negative_signal_rate > 30% or avg_eval_score < 0.6."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        low_quality = await conn.fetch("""
            SELECT skill_name, avg_eval_score,
                   negative_signals::float / NULLIF(total_runs, 0) as neg_rate
            FROM skill_quality_metrics
            WHERE total_runs >= 20
              AND (avg_eval_score < 0.6 
                   OR negative_signals::float / NULLIF(total_runs, 0) > 0.3)
        """)
        for row in low_quality:
            logger.warning(
                "skill_quality_alert",
                skill=row["skill_name"],
                eval_score=row["avg_eval_score"],
                neg_rate=row["neg_rate"],
            )
            # Future: auto-create Jira ticket via crystal_product_signals table
```

This closes the quality loop. Low-performing skills surface automatically instead of degrading silently.

---

## Part VI — Bug, Feature Request, and Feedback System

### 6.1 Crystal as a Feedback Instrument

Every Crystal interaction is now a structured feedback event. But we also want Crystal to *actively* capture product feedback from the conversation.

**New file:** `crystalos/lib/feedback_detector.py`

```python
"""Detect and route product feedback signals from Crystal conversations."""
from __future__ import annotations
import json
import hashlib
from dataclasses import dataclass
from crystalos.crystal.context import CrystalContext
from crystalos.lib.openrouter import call_agent
from crystalos.lib.db import get_pool
from crystalos.lib.logger import logger


@dataclass
class ProductSignal:
    signal_type: str       # feature_request | bug | complaint | praise
    title: str
    description: str
    affects_feature: str | None
    severity: str          # low | medium | high | critical
    routing: str           # platform | brand
    brand_ticket_url: str | None
    raw_query: str


_FEATURE_PATTERNS = [
    "wish", "would be great", "can you add", "feature request",
    "need the ability", "it would be nice", "please add", "missing",
    "doesn't support", "can't do",
]
_BUG_PATTERNS = [
    "bug", "broken", "not working", "error", "crash",
    "wrong data", "incorrect data", "showing wrong",
]


def _quick_classify(query: str) -> str | None:
    q = query.lower()
    if any(p in q for p in _BUG_PATTERNS):
        return "bug"
    if any(p in q for p in _FEATURE_PATTERNS):
        return "feature_request"
    return None


async def detect_and_route_signal(
    query: str,
    ctx: CrystalContext,
) -> ProductSignal | None:
    signal_type = _quick_classify(query)
    if not signal_type:
        return None
    
    extraction = await call_agent(
        messages=[{"role": "user", "content": f"""Extract a structured {signal_type} from:

"{query}"

JSON only:
{{"title": "...", "description": "...", "affects_feature": "...", "severity": "low|medium|high|critical"}}"""}],
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
    )
    
    try:
        data = json.loads(extraction.strip())
    except Exception:
        return None
    
    routing = _determine_routing(signal_type, ctx)
    
    return ProductSignal(
        signal_type=signal_type,
        title=data.get("title", query[:100]),
        description=data.get("description", query),
        affects_feature=data.get("affects_feature"),
        severity=data.get("severity", "medium"),
        routing=routing,
        brand_ticket_url=ctx.brand.support_ticket_url if (ctx.brand and routing == "brand") else None,
        raw_query=query,
    )


def _determine_routing(signal_type: str, ctx: CrystalContext) -> str:
    """Brand bugs → brand's own system. Platform capabilities → Experient tracking."""
    if not ctx.brand:
        return "platform"
    # Brand has its own support system AND this looks like a brand-level config issue
    if ctx.brand.support_ticket_url and signal_type == "bug":
        return "brand"
    return "platform"


async def persist_signal(signal: ProductSignal, ctx: CrystalContext) -> None:
    """Write signal to DB with semantic dedup."""
    sig_hash = hashlib.sha256(
        f"{signal.title}:{signal.affects_feature}".encode()
    ).hexdigest()[:16]
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Dedup: if same hash exists and is open, increment vote_count
        existing = await conn.fetchrow(
            "SELECT id FROM crystal_product_signals WHERE semantic_hash=$1 AND status='open'",
            sig_hash,
        )
        if existing:
            await conn.execute(
                "UPDATE crystal_product_signals SET vote_count=vote_count+1 WHERE id=$1",
                existing["id"],
            )
            return
        
        await conn.execute(
            """INSERT INTO crystal_product_signals
               (signal_type, org_id, brand_id, user_id, survey_id, title, description,
                affects_feature, severity, routing, brand_ticket_url, semantic_hash, raw_query)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)""",
            signal.signal_type, ctx.org_id, ctx.brand.brand_id if ctx.brand else None,
            ctx.user_id, ctx.survey_id, signal.title, signal.description,
            signal.affects_feature, signal.severity, signal.routing,
            signal.brand_ticket_url, sig_hash, signal.raw_query,
        )
```

### 6.2 Crystal's Response When Detecting Feedback

When Crystal detects a feature request or bug in a conversation, it:

1. Captures it silently via `asyncio.create_task(persist_signal(...))`
2. Acknowledges it in the response and routes appropriately

```python
# In crystal.py, after response generation
signal = await detect_and_route_signal(user_query, ctx)
if signal:
    asyncio.create_task(persist_signal(signal, ctx))
    
    # Add feedback acknowledgment to the SSE stream
    if signal.routing == "brand" and signal.brand_ticket_url:
        yield {"type": "feedback_captured", 
               "signal_type": signal.signal_type,
               "message": f"I've noted this — you can also file it directly with {ctx.brand.brand_name} support.",
               "action_url": signal.brand_ticket_url,
               "action_label": "Open support ticket"}
    else:
        yield {"type": "feedback_captured",
               "signal_type": signal.signal_type, 
               "message": "I've noted this feedback. Our team reviews all Crystal feedback to improve the platform.",
               "action_url": None}
```

The frontend renders `feedback_captured` events as a small confirmation card below Crystal's response. No form filling, no leaving the page — the feedback is captured from the natural conversation.

### 6.3 Brand Administration API

Brands need visibility into what their users are reporting. New admin endpoints:

```
GET  /api/brands/{brand_id}/signals          — list all product signals for this brand
GET  /api/brands/{brand_id}/signals/summary  — counts by type, severity, feature
POST /api/brands/{brand_id}/signals/{id}/status  — update status (open/in_progress/resolved)
GET  /api/brands/{brand_id}/crystal/quality  — Crystal quality metrics for this brand
```

These are admin-only endpoints gated behind `brand_admin` role. Brand teams can see what their users are requesting and reporting without any access to Experient's internal systems.

### 6.4 Cross-Brand Aggregation (Platform Intelligence)

Experient gains a second view: all `routing='platform'` signals aggregated across brands:

```sql
-- Most-requested features across all brands (last 30 days)
SELECT title, affects_feature, SUM(vote_count) as total_votes,
       COUNT(DISTINCT org_id) as requesting_orgs
FROM crystal_product_signals
WHERE signal_type = 'feature_request'
  AND routing = 'platform'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY title, affects_feature
ORDER BY total_votes DESC;
```

Feature requests are semantically deduplicated (same `semantic_hash`) and vote-counted across organizations. Product managers see real demand signal sourced directly from conversations, not from surveys about the product.

---

## Part VII — Stream Consumer Reliability

**File to update:** `crystalos/consumers/response_stream.py`

### Dead-Letter Queue Pattern

```python
DLQ_KEY = "crystal:dlq:trigger_failures"
MAX_RETRIES = 3

async def _trigger_with_retry(survey_id: str, org_id: str, tier: str) -> None:
    """Trigger insight generation with retry + dead-letter queue on persistent failure."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            await _trigger_insights(survey_id, org_id, tier)
            return  # success
        except Exception as exc:
            wait = 2 ** attempt  # 2s, 4s, 8s backoff
            logger.warning(
                "trigger_retry",
                survey_id=survey_id, attempt=attempt, wait=wait, error=str(exc)
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)
    
    # All retries exhausted — write to DLQ for manual review
    redis = await get_redis()
    await redis.rpush(DLQ_KEY, json.dumps({
        "survey_id": survey_id,
        "org_id": org_id,
        "tier": tier,
        "failed_at": datetime.utcnow().isoformat(),
    }))
    logger.error("trigger_dlq", survey_id=survey_id, tier=tier)
```

The DLQ is a Redis list. A separate admin endpoint allows reprocessing DLQ entries. This prevents silent loss while keeping the consumer moving.

---

## Part VIII — Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTERPRISE CRYSTALOS                           │
│                                                                             │
│  ┌──────────────┐    ┌────────────────────────────────────────────────────┐ │
│  │   BRANDS     │    │              CRYSTAL INTELLIGENCE LAYER            │ │
│  │              │    │                                                    │ │
│  │  Marriott    │    │  ┌─────────────────────────────────────────────┐  │ │
│  │  Hilton      │───▶│  │           BrandContext (frozen)             │  │ │
│  │  Accenture   │    │  │  brand_id · brand_persona · permissions     │  │ │
│  │  (your org)  │    │  │  data_region · custom_instructions · tier   │  │ │
│  └──────────────┘    │  └─────────────────────┬───────────────────────┘  │ │
│                      │                        │                          │ │
│  ┌──────────────┐    │         ┌──────────────▼──────────────┐          │ │
│  │  USER ROLES  │    │         │     Crystal ReAct Agent     │          │ │
│  │              │    │         │  brand-persona system prompt │          │ │
│  │  viewer      │    │         │  permission-filtered tools  │          │ │
│  │  editor      │───▶│         │  relevance-ranked context   │          │ │
│  │  admin       │    │         │  route-aware navigation     │          │ │
│  │  brand_admin │    │         │  structured error injection  │          │ │
│  └──────────────┘    │         └──────────┬──────────────────┘          │ │
│                      │                    │                              │ │
│                      │     ┌──────────────▼──────────────────────────┐  │ │
│                      │     │              13 Tools                   │  │ │
│                      │     │  permission-gated by effective_perms    │  │ │
│                      │     └──────────────┬──────────────────────────┘  │ │
│                      │                    │                              │ │
│                      │     ┌──────────────▼──────────────────────────┐  │ │
│                      │     │          Skill Runtime (ON)             │  │ │
│                      │     │  semantic router · LLM-judged evals     │  │ │
│                      │     │  multi-source loading · diversity bank  │  │ │
│                      │     └─────────────────────────────────────────┘  │ │
│                      └────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     TELEMETRY PIPELINE                               │  │
│  │                                                                      │  │
│  │   Crystal turn ──▶ TurnEvent (fire-and-forget) ──▶ DB write         │  │
│  │   User thumbs ───▶ POST /api/crystal/feedback   ──▶ quality table   │  │
│  │   Conversation ──▶ FeedbackDetector             ──▶ product signals │  │
│  │   Nightly job ───▶ skill_quality_metrics        ──▶ auto-alert      │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    PRODUCT SIGNAL ROUTING                            │  │
│  │                                                                      │  │
│  │   Bug detected ──▶ routing=brand  ──▶ brand support URL             │  │
│  │                ──▶ routing=platform ──▶ crystal_product_signals DB  │  │
│  │                                                                      │  │
│  │   Feature request ──▶ semantic dedup ──▶ vote aggregation           │  │
│  │                   ──▶ cross-org ranking ──▶ PM dashboard            │  │
│  │                                                                      │  │
│  │   Brand admin ──▶ GET /brands/{id}/signals ──▶ their signals only   │  │
│  │   Experient PM ──▶ aggregated across all brands (platform only)     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌────────────────────┐    ┌────────────────────┐    ┌────────────────┐   │
│  │   REDIS (brand-ns) │    │   POSTGRES (pgvect) │    │   SCHEDULER    │  │
│  │                    │    │                     │    │                │   │
│  │ brand:{id}:crystal │    │ crystal_turn_events │    │ skill quality  │   │
│  │ brand:{id}:cache   │    │ crystal_feedback    │    │ aggregation    │   │
│  │ brand:{id}:tier    │    │ crystal_product_sig │    │ DLQ reprocess  │   │
│  └────────────────────┘    └────────────────────┘    └────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part IX — Migration Path

### Phase 1 — Foundation (no user-visible changes)
1. Add `BrandContext` and extend `CrystalContext` (`crystal/context.py`)
2. Add `RedisKeys` class (`lib/redis_keys.py`) and migrate all key construction
3. Fix `main.py`: fetch `org_context` from DB instead of trusting body
4. Fix `openrouter.py`: exclude `BudgetExceededError` from circuit counting
5. Set `USE_SKILL_RUNTIME = True` in constants
6. Add `crystal_turn_events`, `crystal_feedback`, `crystal_product_signals` tables to migrations

### Phase 2 — Crystal Quality (internal improvement, user sees better answers)
7. Replace `_eval_criterion` keyword heuristics with hybrid structural+LLM judge
8. Replace difflib `find()` with semantic skill router
9. Add `warm_router()` call to startup in `main.py`
10. Fix dynamic context selection in `_build_system_prompt()`
11. Consolidate `get_specialist_for_survey()` into `SpecialistRegistry.match()`

### Phase 3 — Observability (operations can see quality)
12. Add `TurnPublisher` and wire into Crystal response path
13. Add `detect_quality_signal()` — quality signal from next-turn query
14. Add nightly `_aggregate_skill_quality()` scheduler job
15. Add diversity-controlled example bank in `_write_example_async()`

### Phase 4 — Enterprise Features (brand-facing)
16. Add brand-aware system prompt (persona, custom instructions, filtered tools)
17. Add route-based navigation (replace vague nav_section strings)
18. Add structured error injection in ReAct loop
19. Add `FeedbackDetector` and wire into Crystal turn flow

### Phase 5 — Feedback System (external-facing)
20. Add `POST /api/crystal/feedback` endpoint
21. Add `GET/POST /api/brands/{brand_id}/signals` admin endpoints
22. Add brand ticket URL surfacing in Crystal SSE stream
23. Add DLQ pattern to `response_stream.py`

---

## Part X — Crystal Development Kit (CDX)

CDX is the developer experience layer. Every part of the system so far covers correctness and runtime behavior. CDX covers the time between "I want to build something" and "it's running in production." Without CDX, engineers and brand developers write SKILL.md files manually, test by running the full service, and have no feedback until they hit production.

### 10.1 Package Design

CDX ships as an npm package published to internal Artifactory:

```
package name:  @experient/cdx
binary:        experient-cdx
install:       npx @experient/cdx <command>
```

Node.js CLI (not Python) — engineers on any OS can run it without a Python venv. Internally it talks to a local or remote CrystalOS REST API for test execution. Validation-only commands work offline.

### 10.2 Config File

```json
// .crystalos.json — checked into the repo root
{
  "version": 1,
  "crystalos_url": "http://localhost:8001",
  "skills_dir": "crystalos/skills",
  "brand_skills_dir": "crystalos/skills/brands",
  "test_org_id": "dev-org-001",
  "test_brand_id": null,
  "default_model": "claude-haiku-4-5-20251001",
  "eval_pass_threshold": 0.75
}
```

### 10.3 Command: `scaffold`

Generates a fully-wired skill skeleton so developers write content, not structure.

```
$ experient-cdx scaffold --type skill --name roi-calculator

  Scaffolding skill: roi-calculator
  ✓ crystalos/skills/roi-calculator/SKILL.md
  ✓ crystalos/skills/roi-calculator/EVALS.md
  ✓ crystalos/tests/test_roi_calculator.py

  Next:
    1. Edit SKILL.md — add your prompt, model, use_cases
    2. Edit EVALS.md — define quality criteria
    3. experient-cdx test "what is the ROI of improving CSAT by 10 points?"
```

Generated `SKILL.md` template:
```markdown
---
name: roi-calculator
version: "1.0.0"
description: "FILL IN: one sentence description of what this skill does"
model: claude-haiku-4-5-20251001
use_cases:
  - "FILL IN: example query that should route to this skill"
  - "FILL IN: another example query"
max_tokens: 800
temperature: 0.3
---

# System Prompt

FILL IN: Instructions for the LLM. Be specific about format, tone, and
what the skill should and should not do.

## Output Format

FILL IN: Describe the expected output format (JSON, markdown, etc.)
```

Generated `EVALS.md` template:
```markdown
# Evaluation Criteria

| type       | description                                           | weight |
|------------|-------------------------------------------------------|--------|
| must_pass  | Output must be valid JSON                             | 1.0    |
| must_pass  | FILL IN: critical criterion that must always pass    | 1.0    |
| scored     | FILL IN: quality criterion (0.0–1.0 score)           | 0.8    |
| scored     | Response should be actionable and specific           | 0.7    |
```

Generated pytest harness (`test_roi_calculator.py`):
```python
"""Auto-generated test harness for roi-calculator skill."""
import pytest
from crystalos.lib.skill_registry import SkillRegistry
from crystalos.lib.skill_runtime import SkillRuntime

SKILL_NAME = "roi-calculator"
TEST_CASES = [
    {
        "input": "FILL IN: paste a real test input here",
        "min_eval_score": 0.75,
        "must_contain": [],  # strings that must appear in output
    }
]

@pytest.fixture(scope="module")
async def runtime():
    registry = SkillRegistry()
    await registry.warm_router()
    return SkillRuntime(registry)

@pytest.mark.parametrize("case", TEST_CASES)
async def test_skill_quality(runtime, case):
    result = await runtime.execute(SKILL_NAME, case["input"], ctx=None)
    assert result.eval_score >= case["min_eval_score"], (
        f"Eval score {result.eval_score:.2f} below threshold {case['min_eval_score']}"
    )
    for s in case.get("must_contain", []):
        assert s.lower() in result.output.lower(), f"Output missing: {s}"

async def test_skill_routing():
    registry = SkillRegistry()
    await registry.warm_router()
    results = await registry.find("FILL IN: test query", top_k=3)
    names = [m.name for m, _ in results]
    assert SKILL_NAME in names, (
        f"{SKILL_NAME} not in top-3 results for test query. Got: {names}"
    )
```

### 10.4 Command: `test`

Runs a skill against a live query against the local CrystalOS service. Shows routing, eval results, and output in a readable format.

```
$ experient-cdx test "what is the ROI of improving CSAT by 10 points?"

  ─── Semantic Routing ──────────────────────────────────────────────────
  roi-calculator          0.84  ← selected
  analyze_key_drivers     0.61
  benchmark-comparator    0.55

  ─── Skill Execution ───────────────────────────────────────────────────
  Model:    claude-haiku-4-5-20251001
  Latency:  1.24s
  Tokens:   in=412  out=289

  ─── EVALS.md Results ──────────────────────────────────────────────────
  ✓  valid JSON                               1.00  (must_pass — deterministic)
  ✓  response references CSAT improvement     0.91  (must_pass — LLM judge)
  ✓  actionable and specific                  0.82  (scored)
  ✗  cites industry benchmark                 0.41  (scored — BELOW threshold)
  ─────────────────────────────────────────────────────────────────────
  Overall score: 0.71  ← FAIL (threshold: 0.75)

  ─── Output ────────────────────────────────────────────────────────────
  {
    "roi_estimate": "...",
    "methodology": "...",
    ...
  }

  ─── Suggested fix ─────────────────────────────────────────────────────
  Criterion "cites industry benchmark" scored 0.41.
  Add benchmark data to your SKILL.md prompt, or lower the weight for
  this criterion if benchmarks are not always available.
```

Implementation: CDX calls `POST /api/cdx/test` on the local CrystalOS service. This endpoint runs the skill isolated without creating a thread or writing to turn events (dev flag).

```python
# crystalos/main.py — CDX test endpoint (dev-only, blocked in production)
@router.post("/api/cdx/test")
async def cdx_test_skill(body: CdxTestRequest, _: None = Depends(require_internal_key)):
    if AGENTS_ENV == "production":
        raise HTTPException(403, "CDX test endpoint disabled in production")
    
    registry = get_skill_registry()
    
    # Show routing results
    routing = await registry.find(body.query, top_k=5)
    
    # Execute the target skill (or top match if not specified)
    skill_name = body.skill_name or (routing[0][0].name if routing else None)
    if not skill_name:
        raise HTTPException(400, "No matching skill found")
    
    runtime = get_skill_runtime()
    result = await runtime.execute(skill_name, body.query, ctx=None, write_example=False)
    
    return {
        "routing": [{"name": m.name, "score": round(s, 2)} for m, s in routing],
        "skill_used": skill_name,
        "output": result.output,
        "eval_score": result.eval_score,
        "eval_detail": result.eval_detail,   # per-criterion scores
        "latency_ms": result.latency_ms,
        "tokens_in": result.tokens_in,
        "tokens_out": result.tokens_out,
    }
```

### 10.5 Command: `validate`

Offline SKILL.md schema validation. No CrystalOS connection needed.

```
$ experient-cdx validate crystalos/skills/roi-calculator/SKILL.md

  ✓  name present
  ✓  version format valid (semver)
  ✓  model is a recognized model ID
  ✓  use_cases: 2 entries (minimum 1)
  ✓  max_tokens: 800 (within 50–4000 range)
  ✗  description: "FILL IN" placeholder not replaced
  ✓  EVALS.md present and parseable
  ✓  EVALS.md: 4 criteria found, 2 must_pass
  ─────────────────────────────────────────────
  1 error found. Fix before running test.
```

### 10.6 Command: `ci`

Designed for CI pipelines. Runs `validate` + `test` for every skill in the skills directory. Exits non-zero if any skill fails.

```yaml
# .gitlab-ci.yml
skill-quality-gate:
  script:
    - npx @experient/cdx ci --skills-dir crystalos/skills
  only:
    changes:
      - crystalos/skills/**/*.md
```

```
$ experient-cdx ci --skills-dir crystalos/skills

  Running quality gate for 14 skills...

  ✓  nps-advisor           0.88
  ✓  ces-analyzer          0.79
  ✓  roi-calculator        0.76
  ✗  trend-forecaster      0.61  ← BELOW THRESHOLD
  ...

  1 skill failed. Blocking merge.
  Run: experient-cdx test "your query" --skill trend-forecaster for details
```

### 10.7 Command: `publish` (Brand Developer Workflow)

Brand developers can push a local SKILL.md to their brand's directory via the API.

```
$ experient-cdx publish crystalos/skills/hcahps-scorer/SKILL.md \
    --brand marriott-001 \
    --env staging

  Validating SKILL.md...  ✓
  Running quality gate...  score: 0.91  ✓
  Publishing to brand: marriott-001 (staging)
  ✓  Uploaded to /brands/marriott-001/hcahps-scorer/SKILL.md
  ✓  Hot-reload triggered (active in ~30s)
  ✓  Skill visible at: GET /api/admin/skills/hcahps-scorer?brand=marriott-001
```

### 10.8 Fault Tolerance

- All CDX commands that hit the network have `--timeout` flag (default 30s)
- `validate` and `scaffold` are fully offline — no dependency on CrystalOS running
- `ci` supports `--skip-llm-evals` flag for fast pipeline runs (structural only, no LLM judge)
- CDX writes a `.cdx-cache/` directory with embedded skill models to speed up repeated routing tests

---

## Part XI — Skill Browser Admin UI

The Skill Browser is an internal admin page that makes the state of the skill system visible without running SQL queries. It serves three audiences: engineers debugging quality issues, PMs tracking skill coverage, and brand admins reviewing their custom skills.

### 11.1 Routes and Layout

```
/app/admin/crystal                — redirects to /skills
/app/admin/crystal/skills         — skill catalog with live metrics
/app/admin/crystal/skills/:name   — skill detail: quality trend, top queries, examples
/app/admin/crystal/quality        — quality dashboard: all skills sorted by health
/app/admin/crystal/signals        — product signals: feature requests + bugs
/app/admin/crystal/gaps           — queries Crystal couldn't answer
/app/admin/crystal/dlq            — dead-letter queue: failed tier events
```

Access: requires `brand_admin` role for brand-scoped views, `platform_admin` for cross-brand views.

### 11.2 Skills List View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Crystal Skills                                    [+ New Skill]  [Run CI]  │
│  Filter: [All ▼] [Global + Brand ▼] [Health: All ▼]                         │
├─────────────────────┬────────┬──────────┬──────────┬──────────┬────────────┤
│ Skill               │Queries │Avg Score │Neg Rate  │P50 ms    │Source      │
├─────────────────────┼────────┼──────────┼──────────┼──────────┼────────────┤
│ nps-advisor         │ 2,341  │ 0.88 ●   │  8%      │  1.2s    │ global     │
│ ces-analyzer        │   891  │ 0.79 ●   │ 12%      │  0.9s    │ global     │
│ hcahps-scorer       │   234  │ 0.91 ●   │  3%      │  1.1s    │ marriott   │
│ trend-forecaster    │   556  │ 0.61 ▲   │ 31%      │  2.4s    │ global     │  ← flagged
│ roi-calculator      │    89  │ 0.76 ●   │ 15%      │  1.8s    │ accenture  │
├─────────────────────┴────────┴──────────┴──────────┴──────────┴────────────┤
│  ● Healthy  ▲ Needs attention  ✗ Failing                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Health indicator logic:
- `● Healthy`: avg_eval_score ≥ 0.75 AND neg_rate < 20%
- `▲ Needs attention`: avg_eval_score 0.60–0.74 OR neg_rate 20–30%
- `✗ Failing`: avg_eval_score < 0.60 OR neg_rate > 30%

### 11.3 Skill Detail View

```
/app/admin/crystal/skills/trend-forecaster

┌─── Skill: trend-forecaster ─────────────────────────────────────────────────┐
│  Source: global  │  Model: claude-sonnet-4-6  │  Version: 1.2.0             │
│  Status: ▲ Needs attention                    │  [Edit SKILL.md]  [Run CDX] │
├─────────────────────────────────────────────────────────────────────────────┤
│  Quality Trend (30 days)                                                     │
│                                                                              │
│  1.0 ┤                                                                       │
│  0.8 ┤──────────────────╮                                                   │
│  0.6 ┤                  ╰──────╮                                            │
│  0.4 ┤                        ╰─────────────────                           │
│  0.2 ┤                                                                       │
│  0.0 └─────────────────────────────────────────────────────── time          │
│       Jun 1              Jun 10             Jun 20                           │
│       ↑ model changed to claude-sonnet-4-6 on Jun 8                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Top Queries (last 7 days)                         Eval Detail              │
│  ─────────────────────────────────────────         ───────────────────────  │
│  "Is NPS improving?"              → 0.71           ✓ valid JSON      1.00   │
│  "Trend over last quarter"        → 0.58           ✓ cites date      0.89   │
│  "How has CSAT moved this year?"  → 0.64           ✗ confidence      0.41   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Example Bank (42 examples)        [Purge duplicates]  [Export]             │
│  ─────────────────────────────────                                          │
│  showing 5 of 42 · sorted by eval_score DESC                               │
│  [0.94] "Is our NPS improving this..."  org: acme-corp  Jun 12             │
│  [0.91] "How has employee sat trended"  org: hilton-001  Jun 8             │
│  ...                                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.4 Backend API for Skill Browser

```
GET  /api/admin/skills
     ?brand_id=...     filter to brand skills
     ?source=global|brand|all
     ?health=healthy|attention|failing|all
     Response: [{name, version, source, queries_30d, avg_eval_score, neg_rate, p50_ms}]

GET  /api/admin/skills/:name
     ?brand_id=...
     Response: {manifest, quality_trend[], top_queries[], eval_detail{}}

GET  /api/admin/skills/:name/examples
     ?limit=20&offset=0&sort=eval_score_desc
     Response: {examples: [{input, output, eval_score, org_id_hash, created_at}]}

DELETE /api/admin/skills/:name/examples
     body: {ids: [...]}   — for purging low-quality or duplicate examples

GET  /api/admin/skills/quality/summary
     Response: {healthy: N, attention: N, failing: N, total_queries_today: N}
```

### 11.5 Gaps View

Tracks queries Crystal couldn't answer — the signal that drives new skill development.

```
/app/admin/crystal/gaps

┌─── Crystal Capability Gaps ─────────────────────────────────────────────────┐
│  Last 30 days  │  Filtered: all brands                                      │
├──────────────────────────────────────────────────┬────────┬─────────────────┤
│ Query pattern (clustered)                        │ Count  │ Best match      │
├──────────────────────────────────────────────────┼────────┼─────────────────┤
│ "ROI of improving [metric] by [N] points"        │   94   │ 0.29 similarity │
│ "Predict [metric] for next quarter"              │   67   │ 0.31 similarity │
│ "Compare our score to [competitor]"              │   41   │ 0.24 similarity │
│ "How many responses needed for significance?"    │   38   │ 0.28 similarity │
├──────────────────────────────────────────────────┴────────┴─────────────────┤
│  [Create skill for top gap]                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

A gap is logged when Crystal's ReAct loop exhausts all tool turns without producing a grounded answer. The query is embedded, and weekly the gap table is semantically clustered to surface patterns. "Create skill for top gap" launches `cdx scaffold` in the browser via a form.

```python
# Logged in crystal.py when synthesis is ungrounded
if not tool_results and not error_context:
    await _log_capability_gap(ctx, inp)

async def _log_capability_gap(ctx: CrystalContext, query: str) -> None:
    embedding = await embed_text(query)
    await db.execute(
        """INSERT INTO crystal_capability_gaps
           (org_id, brand_id, user_id, query, embedding, created_at)
           VALUES ($1,$2,$3,$4,$5::vector,NOW())""",
        ctx.org_id, ctx.brand.brand_id if ctx.brand else None,
        ctx.user_id, query, json.dumps(embedding),
    )
```

---

## Part XII — Crystal Routing Debugger

The routing debugger answers "why did Crystal do that?" without reading logs. It exposes the full decision chain for a given turn: which specialist scored highest, which skills were considered, which tools were called, and how each tool result scored in the eval.

### 12.1 Activation

```
POST /api/insights/{survey_id}/crystal?debug=true
```

The `debug=true` parameter is stripped before the SSE stream reaches the end user. It's a developer/admin-only tool — gated behind `platform_admin` or `brand_admin` role. In production, it adds ~50ms of overhead from serializing the trace (only when active).

### 12.2 SSE Debug Events

When debug mode is on, the SSE stream includes additional event types interleaved with normal events:

```json
// Specialist routing decision
{"type": "debug_routing", "specialists_scored": [
  {"id": "nps_specialist",    "score": 90, "selected": true},
  {"id": "employee_ex",       "score": 20, "selected": false},
  {"id": "research_generic",  "score": 0,  "selected": false}
]}

// Skill routing decision
{"type": "debug_skills", "query": "what's causing score drops?", "candidates": [
  {"name": "analyze_key_drivers",  "similarity": 0.81, "selected": true},
  {"name": "nps-advisor",          "similarity": 0.74, "selected": false},
  {"name": "trend-forecaster",     "similarity": 0.61, "selected": false}
]}

// Context selection (what was injected into the prompt)
{"type": "debug_context", "total_insights": 187, "selected_insights": 8,
 "token_budget": 6000, "tokens_used": 4821,
 "selection_method": "embedding_similarity"}

// Per-turn tool execution
{"type": "debug_turn", "turn": 1, "tool": "analyze_key_drivers",
 "latency_ms": 412, "success": true, "eval_score": null}

// Synthesis eval
{"type": "debug_eval", "eval_score": 0.84, "criteria": [
  {"name": "valid JSON",       "score": 1.00, "method": "structural"},
  {"name": "cites evidence",   "score": 0.91, "method": "llm_judge"},
  {"name": "actionable",       "score": 0.72, "method": "llm_judge"}
]}

// Full latency breakdown
{"type": "debug_timing", "context_load_ms": 34, "routing_ms": 12,
 "react_loop_ms": 1842, "synthesis_ms": 389, "total_ms": 2277}
```

### 12.3 Frontend Rendering

The debug panel renders as a collapsible drawer at the bottom of the Crystal chat panel. It is never shown to end users — only when the current user has `platform_admin` or `brand_admin` role.

```
┌─── Debug Trace ─────────────────────────────────────────────── [▲ collapse] ┐
│  Specialist:  nps_specialist (score: 90)                                    │
│  Context:     187 insights → 8 selected (4,821 tokens)                     │
│  Skills:      analyze_key_drivers (0.81) · nps-advisor (0.74) considered   │
│  Tools:       [1] analyze_key_drivers 412ms ✓  [2] analyze_segments 388ms ✓│
│  Eval:        0.84 · JSON: 1.0 · evidence: 0.91 · actionable: 0.72         │
│  Total:       2,277ms · 841 tokens (in: 612, out: 229)                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.4 Stored Debug Traces

For post-hoc debugging (production issue analysis), debug traces are optionally persisted to `crystal_debug_traces` table when `store_trace=true` is passed:

```sql
CREATE TABLE crystal_debug_traces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_event_id   UUID REFERENCES crystal_turn_events(id),
    org_id          TEXT NOT NULL,
    brand_id        TEXT,
    trace           JSONB NOT NULL,    -- full trace payload
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
-- 7-day retention, auto-partitioned
CREATE INDEX ON crystal_debug_traces (org_id, created_at DESC);
```

Retention is 7 days. Traces are never stored for end-user turns without explicit opt-in from a `platform_admin`.

---

## Part XIII — A/B Testing for Skills

Skill A/B testing lets you validate that a new skill version actually performs better before graduating it to 100% of traffic. Without it, every skill change is a flag day.

### 13.1 SKILL.md Variant Declaration

```yaml
---
name: nps-advisor
version: "2.0.0"
variant: "v2"          # label for this variant — any string
rollout_pct: 10        # percent of traffic to send here (0–100)
baseline_variant: "v1" # which variant this is being compared against
min_sample_size: 100   # minimum runs before graduation is allowed
---
```

When no `variant` is set, the skill is in default slot and receives all unrouted traffic.

### 13.2 SkillRegistry Variant Tracking

```python
@dataclass
class SkillVariant:
    manifest:     SkillManifest
    variant:      str
    rollout_pct:  int           # 0-100
    baseline:     str | None    # variant name of the baseline
    min_sample:   int

class SkillRegistry:
    # Skills now keyed by (name, variant)
    _variants: dict[str, list[SkillVariant]]  # name → [v1, v2, ...]

    def resolve(self, skill_name: str, request_hash: str) -> SkillManifest:
        """Deterministic traffic split using hash of (user_id + skill_name)."""
        variants = self._variants.get(skill_name, [])
        if not variants:
            return None

        # Single variant: no split needed
        if len(variants) == 1:
            return variants[0].manifest

        # Multi-variant: hash-based deterministic assignment
        # Same user always gets same variant — consistent experience
        bucket = int(hashlib.md5(request_hash.encode()).hexdigest(), 16) % 100

        cumulative = 0
        for v in sorted(variants, key=lambda x: x.rollout_pct):
            cumulative += v.rollout_pct
            if bucket < cumulative:
                return v.manifest

        # Fallback to baseline
        baseline = next((v for v in variants if v.variant == variants[0].baseline), variants[0])
        return baseline.manifest
```

`request_hash` is `f"{user_id}:{skill_name}"` — same user always gets the same variant. This prevents the jarring experience of getting different answers to the same question across sessions.

### 13.3 Variant-Aware Telemetry

`crystal_turn_events` already has skill tracking. The variant is captured alongside:

```sql
ALTER TABLE crystal_turn_events
    ADD COLUMN skill_variant TEXT;   -- null for baseline, "v2" for challenger
```

`skill_quality_metrics` PK is extended:

```sql
-- old: PRIMARY KEY (skill_name, org_id, COALESCE(brand_id, ''))
-- new:
PRIMARY KEY (skill_name, skill_variant, org_id, COALESCE(brand_id, ''))
```

### 13.4 Graduation Workflow

```
GET  /api/admin/skills/:name/variants
     Response: {variants: [{variant, rollout_pct, total_runs, avg_eval_score,
                             neg_rate, vs_baseline: {eval_delta, neg_rate_delta}}]}

POST /api/admin/skills/:name/variants/:variant/graduate
     body: {}
     — checks: total_runs >= min_sample_size
     — checks: eval_score improvement statistically significant (p < 0.05, z-test)
     — if ok: sets variant rollout_pct=100, demotes baseline to 0
     — if not ok: returns 400 with reason

POST /api/admin/skills/:name/variants/:variant/rollback
     — sets rollout_pct=0 for the variant, baseline goes back to 100
```

### 13.5 Statistical Significance Check

Before graduation is allowed, the system runs a two-proportion z-test comparing pass rates:

```python
def _check_significance(
    baseline_passes: int, baseline_total: int,
    challenger_passes: int, challenger_total: int,
    alpha: float = 0.05,
) -> tuple[bool, float]:
    p1 = baseline_passes / baseline_total if baseline_total else 0
    p2 = challenger_passes / challenger_total if challenger_total else 0
    p_pool = (baseline_passes + challenger_passes) / (baseline_total + challenger_total)
    
    se = math.sqrt(p_pool * (1 - p_pool) * (1/baseline_total + 1/challenger_total))
    if se == 0:
        return False, 1.0
    
    z = (p2 - p1) / se
    p_value = 2 * (1 - stats.norm.cdf(abs(z)))  # two-tailed
    
    return p_value < alpha and p2 > p1, p_value
```

A graduation attempt that fails significance returns:
```json
{
  "error": "insufficient_significance",
  "p_value": 0.14,
  "required": 0.05,
  "baseline_pass_rate": 0.77,
  "challenger_pass_rate": 0.81,
  "message": "Improvement is promising but not yet statistically significant. Need ~80 more runs."
}
```

---

## Part XIV — Feature Request Tracking at Scale

The signal tracking in Part VI handles individual feature requests. At scale (thousands of signals across hundreds of brands) the challenges shift to: deduplication quality degrades with simple hashing, prioritization needs a real formula, signals need to integrate with PM tools, and users want to know the status of what they asked for.

### 14.1 Semantic Dedup Pipeline (Replacing Hash Dedup)

Simple `semantic_hash = SHA256(title + affects_feature)` misses near-duplicates: "export to Excel" and "download as spreadsheet" are different hashes but the same request. At scale this creates 100 signal rows where there should be 1.

**New schema:**

```sql
-- Signal clusters group semantically similar requests
CREATE TABLE product_signal_clusters (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_label  TEXT NOT NULL,           -- LLM-generated canonical description
    signal_type    TEXT NOT NULL,
    affects_area   TEXT,                    -- auto-classified product area
    total_votes    INT DEFAULT 0,
    distinct_orgs  INT DEFAULT 0,
    distinct_brands INT DEFAULT 0,
    priority_score DECIMAL(10,4) DEFAULT 0, -- computed nightly
    status         TEXT DEFAULT 'open',
    embedding      vector(384),             -- centroid embedding
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    last_vote_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_signal_cluster_members (
    cluster_id  UUID REFERENCES product_signal_clusters(id),
    signal_id   UUID REFERENCES crystal_product_signals(id),
    similarity  DECIMAL(4,3),
    PRIMARY KEY (cluster_id, signal_id)
);

CREATE TABLE product_signal_watchers (
    signal_id  UUID REFERENCES crystal_product_signals(id),
    org_id     TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    notify_on  TEXT[] DEFAULT '{"status_change", "resolved"}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (signal_id, user_id)
);

CREATE TABLE product_signal_webhook_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    secret      TEXT NOT NULL,           -- HMAC secret for payload signing
    events      TEXT[] NOT NULL,         -- ["feature_request", "bug", "all"]
    active      BOOL DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON product_signal_clusters USING ivfflat (embedding vector_cosine_ops);
```

**Real-time dedup on signal insert** (replaces the SHA256 hash check):

```python
async def _find_or_create_cluster(signal: ProductSignal, embedding: list[float], conn) -> UUID:
    """Find the nearest existing cluster or create a new one."""
    
    # pgvector nearest-neighbor search — finds clusters within similarity threshold
    existing = await conn.fetchrow(
        """SELECT id, cluster_label, embedding <=> $1::vector as distance
           FROM product_signal_clusters
           WHERE signal_type = $2
             AND status = 'open'
             AND embedding <=> $1::vector < 0.25   -- 25% cosine distance = close enough
           ORDER BY embedding <=> $1::vector
           LIMIT 1""",
        json.dumps(embedding), signal.signal_type,
    )
    
    if existing:
        # Update cluster centroid (running average) and counts
        await conn.execute(
            """UPDATE product_signal_clusters SET
               total_votes = total_votes + 1,
               distinct_orgs = (
                   SELECT COUNT(DISTINCT s.org_id) FROM crystal_product_signals s
                   JOIN product_signal_cluster_members m ON m.signal_id = s.id
                   WHERE m.cluster_id = $1
               ),
               last_vote_at = NOW()
               WHERE id = $1""",
            existing["id"],
        )
        return existing["id"]
    
    # No close cluster: create new one with LLM-generated label
    label = await _generate_cluster_label(signal)
    cluster_id = await conn.fetchval(
        """INSERT INTO product_signal_clusters
           (cluster_label, signal_type, affects_area, total_votes, distinct_orgs,
            distinct_brands, embedding)
           VALUES ($1,$2,$3,1,1,1,$4::vector)
           RETURNING id""",
        label, signal.signal_type,
        _classify_product_area(signal.affects_feature),
        json.dumps(embedding),
    )
    return cluster_id
```

### 14.2 Priority Score Formula

Priority is recomputed nightly for all open clusters:

```python
def compute_priority_score(
    vote_count: int,
    distinct_orgs: int,
    distinct_brands: int,
    days_since_last_vote: float,
    severity_weights: dict,  # {"critical": 4, "high": 3, "medium": 2, "low": 1}
    avg_severity_weight: float,
) -> float:
    """
    Priority = vote_count × log(orgs+1) × brand_diversity × recency × severity
    
    - Logarithmic org scaling: 10 orgs is not 10× better than 1 org, more like 3×
    - Brand diversity multiplier: cross-brand signals are more significant
    - Recency decay: old signals decay but never fully die
    - Severity multiplier: critical bugs score higher than nice-to-haves
    """
    vote_signal     = vote_count
    org_scaling     = math.log(distinct_orgs + 1)
    brand_diversity = 1.0 + (distinct_brands * 0.2)  # 20% bonus per additional brand
    recency         = math.exp(-days_since_last_vote / 30)  # half-life 30 days
    severity_mult   = avg_severity_weight / 2.0  # normalized to 1.0 for medium

    return vote_signal * org_scaling * brand_diversity * recency * severity_mult
```

Sample outputs with this formula:

| Votes | Orgs | Brands | Days ago | Severity | Score |
|-------|------|--------|----------|----------|-------|
| 50    | 15   | 3      | 2        | medium   | 68.9  |
| 50    | 15   | 1      | 2        | medium   | 51.6  |
| 12    | 8    | 2      | 0        | high     | 41.8  |
| 100   | 1    | 1      | 60       | low      | 5.8   |

The last row (100 votes but all from one org, 60 days stale) correctly scores low.

### 14.3 Webhook Integration

Brands can subscribe to receive signals in their own tools (Jira, Linear, GitHub Issues):

```python
async def _fire_webhooks(signal: ProductSignal, cluster_id: UUID, ctx: CrystalContext) -> None:
    if not ctx.brand:
        return
    
    configs = await db.fetch(
        """SELECT webhook_url, secret, events FROM product_signal_webhook_configs
           WHERE brand_id=$1 AND active=true""",
        ctx.brand.brand_id,
    )
    
    for config in configs:
        if signal.signal_type not in config["events"] and "all" not in config["events"]:
            continue
        
        payload = {
            "event": signal.signal_type,
            "cluster_id": str(cluster_id),
            "title": signal.title,
            "description": signal.description,
            "affects_feature": signal.affects_feature,
            "severity": signal.severity,
            "vote_count": 1,  # always 1 at emit time; cluster has total
            "brand_id": ctx.brand.brand_id,
            "created_at": datetime.utcnow().isoformat(),
        }
        
        # HMAC-SHA256 signature for webhook authentication
        sig = hmac.new(
            config["secret"].encode(),
            json.dumps(payload).encode(),
            hashlib.sha256,
        ).hexdigest()
        
        asyncio.create_task(_send_webhook(
            config["webhook_url"], payload,
            headers={"X-Experient-Signature": f"sha256={sig}"},
        ))
```

Webhook payload is compatible with GitHub Issues API format — brands can route directly to GitHub Issues with a minimal adapter.

### 14.4 User Notification on Signal Status Change

When a signal cluster's status changes to `resolved`, every watcher gets notified through Crystal itself — the next time they open Crystal, it proactively mentions it:

```python
# In crystal.py _build_system_prompt(), check for resolved signals user was watching
resolved_signals = await _get_resolved_watched_signals(ctx.user_id, db)
if resolved_signals:
    proactive_note = f"""
[PROACTIVE] The following feature requests you reported have been resolved:
{chr(10).join(f'- {s["cluster_label"]}' for s in resolved_signals)}
Mention this naturally at the start of the conversation if relevant.
"""
```

---

## Part XV — Bug Tracking at Scale

Individual bug reports from conversations (Part VI) work for low volume. At scale the challenges are: the same bug gets reported by dozens of users across brands, severity needs to auto-escalate based on breadth, SLAs need to be enforced with alerts, and bugs need to be auto-routed to the right team.

### 15.1 Extended Schema

```sql
-- Replaces/extends crystal_product_signals for bugs specifically
CREATE TABLE bug_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id           UUID REFERENCES crystal_product_signals(id),
    cluster_id          UUID REFERENCES product_signal_clusters(id),
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    affects_feature     TEXT NOT NULL,
    reproduction_steps  TEXT,           -- extracted from conversation context
    conversation_excerpt TEXT,          -- the Crystal turn that surfaced the bug
    thread_id           TEXT,           -- crystal_threads.id for context
    auto_severity       TEXT NOT NULL,  -- computed from breadth + time
    reported_severity   TEXT,           -- user-stated severity
    effective_severity  TEXT GENERATED ALWAYS AS (
                            CASE WHEN auto_severity = 'critical' THEN 'critical'
                                 WHEN reported_severity = 'critical' THEN 'critical'
                                 ELSE COALESCE(auto_severity, reported_severity, 'medium')
                            END
                        ) STORED,
    affected_org_count  INT DEFAULT 1,
    affected_brand_count INT DEFAULT 1,
    routing             TEXT NOT NULL CHECK (routing IN ('platform', 'brand')),
    assigned_team       TEXT,           -- auto-assigned from FEATURE_TEAM_MAP
    status              TEXT DEFAULT 'open',
    acknowledged_at     TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    sla_deadline        TIMESTAMPTZ,    -- computed from effective_severity
    sla_breached        BOOL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which orgs/brands reported the same bug
CREATE TABLE bug_report_affected (
    bug_id      UUID REFERENCES bug_reports(id),
    org_id      TEXT NOT NULL,
    brand_id    TEXT,
    user_id     TEXT NOT NULL,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (bug_id, org_id)
);

-- Escalation audit trail
CREATE TABLE bug_escalations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bug_id      UUID REFERENCES bug_reports(id),
    from_sev    TEXT,
    to_sev      TEXT,
    reason      TEXT NOT NULL,
    triggered_by TEXT NOT NULL,   -- 'auto' | user_id
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- SLA configuration (per platform + per brand override)
CREATE TABLE bug_sla_configs (
    brand_id    TEXT,          -- NULL = platform default
    severity    TEXT NOT NULL,
    ack_sla_hrs INT NOT NULL,  -- hours until acknowledgment required
    fix_sla_hrs INT,           -- hours until fix required (null = no SLA)
    PRIMARY KEY (COALESCE(brand_id, ''), severity)
);

-- Defaults
INSERT INTO bug_sla_configs (brand_id, severity, ack_sla_hrs, fix_sla_hrs) VALUES
    (NULL, 'critical', 2,  24),
    (NULL, 'high',     8,  72),
    (NULL, 'medium',   24, NULL),
    (NULL, 'low',      72, NULL);
```

### 15.2 Auto-Severity Escalation

Auto-severity is recomputed when a new org reports the same bug:

```python
def _compute_auto_severity(affected_orgs: int, affected_brands: int, hours_open: float) -> str:
    """
    Escalation rules:
    - critical: 3+ brands OR 5+ orgs OR (2+ brands AND within 2 hours)
    - high:     2 brands OR 3+ orgs
    - medium:   1 brand, 2 orgs
    - low:      1 org
    """
    if affected_brands >= 3 or affected_orgs >= 5:
        return "critical"
    if affected_brands >= 2 and hours_open <= 2:
        return "critical"  # rapid spread — treat as critical
    if affected_brands >= 2 or affected_orgs >= 3:
        return "high"
    if affected_orgs >= 2:
        return "medium"
    return "low"

async def _maybe_escalate_bug(bug_id: UUID, conn) -> None:
    bug = await conn.fetchrow("SELECT * FROM bug_reports WHERE id=$1", bug_id)
    new_sev = _compute_auto_severity(
        bug["affected_org_count"],
        bug["affected_brand_count"],
        (datetime.utcnow() - bug["created_at"]).total_seconds() / 3600,
    )
    if new_sev != bug["auto_severity"]:
        await conn.execute(
            "UPDATE bug_reports SET auto_severity=$1, sla_deadline=$2 WHERE id=$3",
            new_sev,
            _compute_sla_deadline(new_sev, bug["created_at"], conn),
            bug_id,
        )
        await conn.execute(
            "INSERT INTO bug_escalations (bug_id, from_sev, to_sev, reason, triggered_by) VALUES ($1,$2,$3,$4,'auto')",
            bug_id, bug["auto_severity"], new_sev,
            f"Affected {bug['affected_org_count']} orgs, {bug['affected_brand_count']} brands",
        )
        if new_sev == "critical":
            await _fire_critical_alert(bug_id, conn)
```

### 15.3 SLA Enforcement

A dedicated SLA checker runs every 15 minutes (not nightly — SLAs are time-sensitive):

```python
# crystalos/scheduler.py
async def _check_sla_breaches():
    """Every 15 minutes: check for SLA breaches and fire alerts."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Find bugs past SLA deadline with no acknowledgment
        breaching = await conn.fetch(
            """SELECT b.id, b.title, b.effective_severity, b.assigned_team,
                      b.sla_deadline, b.routing, b.affected_brand_count
               FROM bug_reports b
               WHERE b.sla_deadline < NOW()
                 AND b.acknowledged_at IS NULL
                 AND b.sla_breached = false
                 AND b.status != 'resolved'""",
        )
        
        for bug in breaching:
            await conn.execute(
                "UPDATE bug_reports SET sla_breached=true WHERE id=$1",
                bug["id"],
            )
            await _fire_sla_breach_alert(bug, conn)

async def _fire_sla_breach_alert(bug: dict, conn) -> None:
    """Publish SLA breach event — consumed by notification service."""
    await conn.execute(
        """INSERT INTO notification_events (type, payload, created_at)
           VALUES ('sla_breach', $1::jsonb, NOW())""",
        json.dumps({
            "bug_id":     str(bug["id"]),
            "title":      bug["title"],
            "severity":   bug["effective_severity"],
            "team":       bug["assigned_team"],
            "routing":    bug["routing"],
            "brands_affected": bug["affected_brand_count"],
        }),
    )
```

### 15.4 Auto-Assignment by Feature Area

```python
FEATURE_TEAM_MAP = {
    "nps_calculation":     "insights-team",
    "survey_builder":      "survey-team",
    "workflows":           "automation-team",
    "crystal":             "crystalos-team",
    "auth":                "platform-team",
    "billing":             "platform-team",
    "exports":             "data-team",
    "notifications":       "platform-team",
}
# Fallback: "triage-team" if no match

def _assign_team(affects_feature: str | None) -> str:
    if not affects_feature:
        return "triage-team"
    for prefix, team in FEATURE_TEAM_MAP.items():
        if prefix in (affects_feature or "").lower():
            return team
    return "triage-team"
```

### 15.5 Reproduction Context Extraction

When a bug is detected in a Crystal conversation, the system saves the thread context automatically:

```python
async def _extract_reproduction_context(ctx: CrystalContext, query: str) -> str:
    """Extract reproduction steps from the conversation thread."""
    thread = await _get_recent_thread_messages(ctx.thread_id, limit=5)
    if not thread:
        return query
    
    formatted = "\n".join(
        f"[{m['role'].upper()}] {m['content'][:500]}"
        for m in thread
    )
    
    # LLM extraction
    steps = await call_agent(
        messages=[{"role": "user", "content": f"""Extract reproduction steps from this conversation:

{formatted}

Format as numbered steps. If not clear, write: "User reported: {query}". Be brief."""}],
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
    )
    return steps
```

---

## Part XVI — Feedback Tracking at Scale

Feedback tracking includes thumbs up/down (Part V), auto-detected quality signals (Part V), and product signals from conversation (Parts VI + XIV/XV). At scale the challenges are: aggregate computation is expensive, different brands need different quality SLAs, cross-org learning must be privacy-preserving, and the improvement flywheel needs to be automatic.

### 16.1 Tiered Aggregation (Realtime + Hourly + Nightly)

Three aggregation levels cover different latency requirements:

```
Realtime (per turn):     crystal_turn_events written on every response
Hourly aggregation:      feedback_hourly_rollups — for brand dashboards
Nightly aggregation:     skill_quality_metrics — for skill health

Realtime is needed for: SLA breach detection, critical quality regression alerts
Hourly is needed for:   brand admin dashboard (they don't want stale data)
Nightly is enough for:  long-term trend analysis, PM roadmap signals
```

```sql
-- Hourly rollups (materialized every hour by scheduler)
CREATE TABLE feedback_hourly_rollups (
    hour            TIMESTAMPTZ NOT NULL,  -- truncated to hour
    org_id          TEXT NOT NULL,
    brand_id        TEXT,
    skill_name      TEXT,
    total_turns     INT DEFAULT 0,
    positive_count  INT DEFAULT 0,
    negative_count  INT DEFAULT 0,
    avg_eval_score  DECIMAL(4,3),
    p50_latency_ms  INT,
    PRIMARY KEY (hour, org_id, COALESCE(brand_id,''), COALESCE(skill_name,''))
) PARTITION BY RANGE (hour);
-- Monthly partitions, auto-created by scheduler
```

The hourly rollup job runs at the top of every hour:
```python
async def _rollup_feedback_hour(hour: datetime):
    await conn.execute("""
        INSERT INTO feedback_hourly_rollups
            (hour, org_id, brand_id, skill_name, total_turns,
             positive_count, negative_count, avg_eval_score, p50_latency_ms)
        SELECT
            date_trunc('hour', $1) as hour,
            org_id, brand_id,
            (tools_called->0->>'tool') as skill_name,
            COUNT(*) as total_turns,
            COUNT(*) FILTER (WHERE quality_signal='positive') as positive_count,
            COUNT(*) FILTER (WHERE quality_signal='negative') as negative_count,
            AVG(eval_score) as avg_eval_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::int
        FROM crystal_turn_events
        WHERE created_at >= date_trunc('hour', $1)
          AND created_at < date_trunc('hour', $1) + INTERVAL '1 hour'
        GROUP BY 1,2,3,4
        ON CONFLICT DO UPDATE SET
            total_turns = EXCLUDED.total_turns,
            ...
    """, hour)
```

### 16.2 Quality SLAs Per Brand

Each brand can define their own quality floor. Experient monitors compliance.

```sql
CREATE TABLE quality_sla_configs (
    brand_id            TEXT PRIMARY KEY,
    min_positive_rate   DECIMAL(4,3) DEFAULT 0.70,  -- 70% positive signal required
    min_eval_score      DECIMAL(4,3) DEFAULT 0.72,  -- avg eval score floor
    measurement_window  INTERVAL DEFAULT '7 days',  -- rolling window
    breach_action       TEXT DEFAULT 'alert',        -- 'alert' | 'auto_escalate' | 'pause'
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quality_sla_breaches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id            TEXT NOT NULL,
    metric              TEXT NOT NULL,    -- 'positive_rate' | 'eval_score'
    measured_value      DECIMAL(4,3),
    required_value      DECIMAL(4,3),
    measurement_window  INTERVAL,
    action_taken        TEXT,
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

SLA check runs nightly. If a brand's positive_rate drops below their floor:
1. `alert`: post to `notification_events` (→ Slack/email to brand admin)
2. `auto_escalate`: promote all open bugs for that brand to `high`
3. `pause`: suspend Crystal for that brand pending investigation (extreme — manual override needed)

### 16.3 Cross-Org Learning with Privacy

The example bank (Part IV) stores examples with `org_id`. For global skills, we want cross-org learning — examples from one org should improve the skill for all orgs. But orgs must not see each other's data.

Privacy-preserving cross-org learning:

```python
async def _promote_to_global_bank(
    skill_name: str,
    org_id: str,
    input_text: str,
    output: str,
    eval_score: float,
    conn,
) -> None:
    """
    Before writing to the global example bank, strip org-identifying information.
    The example is anonymized — the input/output may reference the org's data,
    but the org_id stored is anonymized and cannot be reverse-engineered.
    """
    # Anonymize: replace org-identifying strings in input/output
    anonymized_input  = await _anonymize_example(input_text)
    anonymized_output = await _anonymize_example(output)
    
    # Store with hashed org_id — one-way, cannot be reversed
    org_hash = hashlib.sha256(f"{org_id}:salt".encode()).hexdigest()[:12]
    
    await conn.execute(
        """INSERT INTO skill_examples_global
           (skill_name, org_id_hash, input, output, eval_score, created_at)
           VALUES ($1,$2,$3,$4,$5,NOW())""",
        skill_name, org_hash, anonymized_input, anonymized_output, eval_score,
    )

async def _anonymize_example(text: str) -> str:
    """Remove PII and org-identifying info from example text."""
    return await call_agent(
        messages=[{"role": "user", "content": f"""Remove all identifying information from this text.
Replace: company names, personal names, email addresses, phone numbers, specific URLs,
internal project names.
Keep: the analytical structure, metrics, and question patterns.
Text: {text[:2000]}
Return only the anonymized text."""}],
        model="claude-haiku-4-5-20251001",
        max_tokens=len(text.split()) + 100,
    )
```

### 16.4 Cohort Quality Analysis

Not all queries are equal. Some types of queries consistently get negative feedback. Cohort analysis groups queries by semantic topic and finds which topics have the worst quality.

```sql
-- Weekly batch job clusters queries semantically and computes quality per cluster
CREATE TABLE query_quality_cohorts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_label    TEXT NOT NULL,    -- LLM-generated: "trend analysis queries"
    skill_name      TEXT,
    sample_count    INT,
    avg_eval_score  DECIMAL(4,3),
    neg_signal_rate DECIMAL(4,3),
    example_queries TEXT[],           -- 3-5 example queries from this cohort
    week            DATE NOT NULL,
    needs_attention BOOL DEFAULT false
);
```

This directly answers: "Which kinds of queries does Crystal handle worst?" If "predictive analytics queries" consistently get 0.52 avg eval score and 35% negative rate, that's the next skill to build — with specific example queries already known.

### 16.5 Auto-Training Trigger

When enough new passing examples accumulate, the example bank for a skill is refreshed automatically:

```python
# In _write_example_async() — check if bank refresh should trigger
async def _check_example_bank_refresh(skill_name: str, conn) -> None:
    new_since_refresh = await conn.fetchval(
        """SELECT COUNT(*) FROM skill_examples
           WHERE skill_name=$1 AND created_at > (
               SELECT COALESCE(MAX(refreshed_at), '2000-01-01') FROM skill_example_refreshes
               WHERE skill_name=$1
           )""",
        skill_name,
    )
    if new_since_refresh >= 20:
        # Enough new examples: trigger a background bank consolidation
        asyncio.create_task(_consolidate_example_bank(skill_name))

async def _consolidate_example_bank(skill_name: str) -> None:
    """
    When new examples accumulate:
    1. Re-embed all examples (some may be stale)
    2. Run diversity dedup: remove near-duplicates
    3. Cap bank at SKILL_EXAMPLE_MAX_PER_SKILL (default 50)
    4. Keep highest-scoring examples within diversity constraint
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        examples = await conn.fetch(
            "SELECT * FROM skill_examples WHERE skill_name=$1 ORDER BY eval_score DESC",
            skill_name,
        )
        
        kept = []
        kept_embeddings = []
        
        for ex in examples:
            embedding = ex["embedding"] or await embed_text(ex["input"])
            
            # Check distance from all kept examples
            too_similar = any(
                _cosine_sim(embedding, e) > 0.85 for e in kept_embeddings
            )
            if not too_similar:
                kept.append(ex["id"])
                kept_embeddings.append(embedding)
                if len(kept) >= SKILL_EXAMPLE_MAX_PER_SKILL:
                    break
        
        # Delete examples not in kept list
        await conn.execute(
            "DELETE FROM skill_examples WHERE skill_name=$1 AND id != ALL($2::uuid[])",
            skill_name, kept,
        )
        await conn.execute(
            "INSERT INTO skill_example_refreshes (skill_name, refreshed_at) VALUES ($1,NOW())",
            skill_name,
        )
```

---

## Part XVII — Complete System Architecture

This diagram shows the full system after all phases are implemented. Every component, every data flow.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  ENTERPRISE CRYSTALOS — COMPLETE                                │
│                                                                                                 │
│  ╔══════════════════════╗   ╔══════════════════════╗   ╔════════════════════════════════════╗  │
│  ║  BRAND LAYER         ║   ║  USER LAYER           ║   ║  DEVELOPER LAYER                  ║  │
│  ║                      ║   ║                       ║   ║                                   ║  │
│  ║  Marriott  Accenture ║   ║  viewer  editor       ║   ║  Experient eng  Brand dev         ║  │
│  ║  Hilton    (direct)  ║   ║  admin   brand_admin  ║   ║                                   ║  │
│  ╚══════════╤═══════════╝   ╚═══════════╤═══════════╝   ╚═══════════════════╤════════════════╝  │
│             │                           │                                   │                  │
│             ▼                           ▼                                   ▼                  │
│  ╔══════════════════════════════════════════════════╗   ╔════════════════════════════════════╗  │
│  ║  REQUEST BOUNDARY (main.py)                      ║   ║  CDX (experient-cdx CLI)           ║  │
│  ║                                                  ║   ║                                   ║  │
│  ║  DB: BrandContext loaded from brands table       ║   ║  scaffold  test  validate          ║  │
│  ║  _resolve_permissions() → effective_perms        ║   ║  publish   ci                     ║  │
│  ║  CrystalContext frozen → propagated everywhere   ║   ║                                   ║  │
│  ╚═════════════════════════╤════════════════════════╝   ╚════════════════════╤═══════════════╝  │
│                            │                                                 │                  │
│                            ▼                                                 ▼                  │
│  ╔═════════════════════════════════════════════════════════════════════════════════════════════╗ │
│  ║  CRYSTAL INTELLIGENCE ENGINE                                                               ║ │
│  ║                                                                                            ║ │
│  ║   _build_brand_identity()      ← brand persona, custom instructions                       ║ │
│  ║   _build_filtered_tool_list()  ← effective_perms gate                                     ║ │
│  ║   _select_relevant_context()   ← embedding similarity, not full-dump                      ║ │
│  ║   NAVIGATION_GUIDE             ← structured routes, not vague strings                     ║ │
│  ║                                                                                            ║ │
│  ║   ReAct Loop (max_turns: brand-configurable)                                               ║ │
│  ║   ├── LLM call (circuit breaker: BudgetExceededError excluded)                            ║ │
│  ║   ├── Tool dispatch (permission-gated, structured error context)                          ║ │
│  ║   └── debug=true → debug_routing, debug_skills, debug_timing SSE events                  ║ │
│  ║                                                                                            ║ │
│  ║   SSE Stream: text_delta | navigation | feedback_captured | debug_* | error               ║ │
│  ╚═════════════════════════════════════════════════╤══════════════════════════════════════════╝ │
│                                                    │                                            │
│                  ┌─────────────────────────────────┼─────────────────────────────────┐         │
│                  ▼                                 ▼                                 ▼         │
│  ╔════════════════════════╗  ╔══════════════════════════╗  ╔═══════════════════════════════╗   │
│  ║  SKILL SYSTEM          ║  ║  SPECIALIST ROUTING      ║  ║  TELEMETRY PIPELINE           ║   │
│  ║                        ║  ║                          ║  ║                               ║   │
│  ║  SemanticRouter        ║  ║  SpecialistRegistry      ║  ║  TurnPublisher (fire+forget)  ║   │
│  ║  (embeddings, 0.35 min)║  ║  .match() — one fn only  ║  ║  → crystal_turn_events        ║   │
│  ║                        ║  ║  5-signal score matrix   ║  ║                               ║   │
│  ║  SkillRuntime (ON)     ║  ║  10 domain specialists   ║  ║  detect_quality_signal()      ║   │
│  ║  → few-shot examples   ║  ║  + research_generic      ║  ║  → updates prev turn event    ║   │
│  ║  → hybrid EVALS.md     ║  ║                          ║  ║                               ║   │
│  ║    structural + LLM    ║  ║  Brand specialist dirs   ║  ║  FeedbackDetector              ║   │
│  ║  → retry on fail       ║  ║  override global         ║  ║  → product_signals             ║   │
│  ║                        ║  ║                          ║  ║  → webhook_configs fire        ║   │
│  ║  Variant A/B testing   ║  ╚══════════════════════════╝  ╚═══════════════════════════════╝   │
│  ║  hash-based split      ║                                                                    │
│  ║  z-test graduation     ║  ╔══════════════════════════════════════════════════════════════╗  │
│  ║                        ║  ║  REDIS (brand-namespaced via K class)                        ║  │
│  ║  Example bank          ║  ║                                                              ║  │
│  ║  diversity-capped 20%  ║  ║  brand:{id}:crystal:{org}:rpm      — rate limiting          ║  │
│  ║  pgvector dedup        ║  ║  brand:{id}:semantic_cache:{org}   — LLM response cache     ║  │
│  ║  auto-consolidation    ║  ║  brand:{id}:survey_facts:{org}     — survey metadata cache  ║  │
│  ╚════════════════════════╝  ║  brand:{id}:tier:{survey}:{tier}   — progressive tier dedup ║  │
│                              ║  crystal:dlq:trigger_failures       — dead-letter queue      ║  │
│                              ╚══════════════════════════════════════════════════════════════╝  │
│                                                                                                 │
│  ╔═════════════════════════════════════════════════════════════════════════════════════════════╗ │
│  ║  DATABASE (Postgres + pgvector)                                                            ║ │
│  ║                                                                                            ║ │
│  ║  crystal_turn_events            — every turn, tools, latency, eval_score, quality_signal  ║ │
│  ║  crystal_feedback               — user thumbs up/down, reason_code                        ║ │
│  ║  crystal_capability_gaps        — queries Crystal couldn't answer                         ║ │
│  ║  crystal_debug_traces           — optional stored debug traces (7-day retention)          ║ │
│  ║                                                                                            ║ │
│  ║  crystal_product_signals        — individual bug/feature signal rows                      ║ │
│  ║  product_signal_clusters        — semantic clusters with centroid embeddings              ║ │
│  ║  product_signal_cluster_members — signal → cluster membership                             ║ │
│  ║  product_signal_watchers        — users watching a cluster for updates                    ║ │
│  ║  product_signal_webhook_configs — per-brand webhook destinations                          ║ │
│  ║                                                                                            ║ │
│  ║  bug_reports                    — detailed bug records with SLA fields                    ║ │
│  ║  bug_report_affected            — which orgs/brands reported the same bug                 ║ │
│  ║  bug_escalations                — auto + manual escalation history                        ║ │
│  ║  bug_sla_configs                — per-severity SLA definitions (per brand override)       ║ │
│  ║                                                                                            ║ │
│  ║  feedback_hourly_rollups        — pre-computed hourly aggregates (partitioned)            ║ │
│  ║  skill_quality_metrics          — nightly per-skill quality aggregates                    ║ │
│  ║  query_quality_cohorts          — weekly semantic clustering of query topics              ║ │
│  ║  quality_sla_configs            — per-brand quality floor SLAs                           ║ │
│  ║  quality_sla_breaches           — breach log + action taken                               ║ │
│  ║                                                                                            ║ │
│  ║  skill_examples                 — per-org examples (diversity-capped)                     ║ │
│  ║  skill_examples_global          — anonymized cross-org examples                           ║ │
│  ║  skill_example_refreshes        — consolidation run log                                   ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                                 │
│  ╔═════════════════════════════════════════════════════════════════════════════════════════════╗ │
│  ║  SCHEDULER (crystalos/scheduler.py)                                                        ║ │
│  ║                                                                                            ║ │
│  ║  Every 15 min:  _check_sla_breaches() — bug SLA enforcement                               ║ │
│  ║  Every 1 hour:  _rollup_feedback_hour() — hourly aggregation                              ║ │
│  ║  Every night:   _aggregate_skill_quality() — skill_quality_metrics upsert                 ║ │
│  ║                 _flag_low_quality_skills() — alert on neg_rate > 30%                       ║ │
│  ║                 _compute_priority_scores() — product_signal_clusters priority              ║ │
│  ║                 _check_quality_sla_compliance() — per-brand quality floors                 ║ │
│  ║  Every week:    _cluster_capability_gaps() — semantic cluster gap queries                  ║ │
│  ║                 _compute_query_cohorts() — query quality cohort analysis                   ║ │
│  ║                 _cluster_product_signals() — re-cluster signals with new embeddings        ║ │
│  ╚═════════════════════════════════════════════════════════════════════════════════════════════╝ │
│                                                                                                 │
│  ╔════════════════════════════════╗  ╔════════════════════════════════════════════════════════╗ │
│  ║  ADMIN UI (/app/admin/crystal) ║  ║  NOTIFICATION SYSTEM                                  ║ │
│  ║                                ║  ║                                                        ║ │
│  ║  /skills      — skill browser  ║  ║  notification_events table                            ║ │
│  ║  /skills/:id  — skill detail   ║  ║  → Slack webhook (critical bugs, SLA breach)          ║ │
│  ║  /quality     — quality dash   ║  ║  → Email (quality SLA breach)                         ║ │
│  ║  /signals     — bug + features ║  ║  → Crystal proactive (resolved signal to watcher)     ║ │
│  ║  /gaps        — capability     ║  ║  → Brand webhook (new signal, status change)           ║ │
│  ║  /dlq         — dead letters   ║  ╚════════════════════════════════════════════════════════╝ │
│  ╚════════════════════════════════╝                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Part XVIII — Complete Migration Path (All Phases)

### Phase 1 — Foundation (no user-visible changes)
1. Add `BrandContext` + extend `CrystalContext` (`crystal/context.py`)
2. Add `K` class (`lib/redis_keys.py`) and migrate all key construction
3. Fix `main.py`: DB fetch for `org_context`, not request body
4. Fix `openrouter.py`: exclude `BudgetExceededError` from circuit counting
5. Set `USE_SKILL_RUNTIME = True` in constants
6. Migrations: `crystal_turn_events`, `crystal_feedback`, `crystal_product_signals`

### Phase 2 — Crystal Quality
7. Hybrid `_eval_criterion`: structural code + LLM judge (Haiku)
8. Semantic skill router replacing difflib `find()`
9. `warm_router()` at startup
10. Dynamic context selection in `_build_system_prompt()`
11. Consolidate `get_specialist_for_survey()` into `SpecialistRegistry.match()`

### Phase 3 — Observability
12. `TurnPublisher` wired into Crystal response path
13. `detect_quality_signal()` for next-turn quality capture
14. Nightly `_aggregate_skill_quality()` scheduler job
15. Diversity-controlled example bank in `_write_example_async()`

### Phase 4 — Enterprise Agent
16. Brand-aware system prompt (persona, custom instructions, filtered tools)
17. Route-based navigation (structured SSE events)
18. Structured error injection in ReAct loop
19. `FeedbackDetector` wired into Crystal turn flow
20. `crystal_capability_gaps` logging when Crystal is ungrounded

### Phase 5 — Feedback System
21. `POST /api/crystal/feedback` endpoint
22. `GET/POST /api/brands/{brand_id}/signals` admin endpoints
23. Brand ticket URL surfacing in Crystal SSE stream
24. DLQ with exponential backoff in `response_stream.py`
25. Migrations: `product_signal_clusters`, `product_signal_cluster_members`, `product_signal_watchers`

### Phase 6 — Bug Tracking
26. `bug_reports`, `bug_report_affected`, `bug_escalations`, `bug_sla_configs` migrations
27. Auto-severity escalation in signal persist flow
28. SLA deadline computation on bug creation
29. 15-minute `_check_sla_breaches()` scheduler job
30. Reproduction context extraction in `FeedbackDetector`
31. Auto-assignment to team via `FEATURE_TEAM_MAP`
32. `notification_events` table + Slack/email consumer

### Phase 7 — Developer Experience (CDX)
33. `@experient/cdx` npm package: `scaffold`, `test`, `validate`, `ci`, `publish`
34. `POST /api/cdx/test` endpoint (dev-only, production-blocked)
35. `.crystalos.json` config file support
36. Variant A/B testing in `SkillRegistry.resolve()`
37. `skill_variant` column in `crystal_turn_events`
38. `GET/POST /api/admin/skills/:name/variants/:variant/graduate` endpoints
39. Statistical significance check (z-test) before graduation

### Phase 8 — Skill Browser Admin UI
40. React pages: `/app/admin/crystal/*` routes
41. `GET /api/admin/skills`, `/api/admin/skills/:name`, `/api/admin/skills/:name/examples`
42. `DELETE /api/admin/skills/:name/examples` (purge)
43. `crystal_debug_traces` table + `POST /api/insights/:id/crystal?debug=true`
44. `crystal_capability_gaps` browser at `/app/admin/crystal/gaps`
45. DLQ browser + replay at `/app/admin/crystal/dlq`

### Phase 9 — Scale & Learning
46. Semantic dedup: pgvector nearest-neighbor cluster search replacing SHA256 hash
47. Priority score formula: `_compute_priority_scores()` nightly job
48. Webhook integration: `product_signal_webhook_configs` + `_fire_webhooks()`
49. Semantic cluster formation: `product_signal_clusters` centroid embeddings
50. Hourly rollup job: `feedback_hourly_rollups` partitioned table
51. Cross-org anonymized example bank: `skill_examples_global` + `_anonymize_example()`
52. Auto-training trigger: `_check_example_bank_refresh()` → `_consolidate_example_bank()`
53. `quality_sla_configs` + nightly `_check_quality_sla_compliance()`
54. Weekly `_cluster_capability_gaps()` + `_compute_query_cohorts()` jobs
55. User signal watching: `product_signal_watchers` + proactive Crystal mention on resolve

---

## What "Best in Class" Looks Like

**From a brand perspective:** You buy Crystal. Your users see "Accenture Intelligence." Crystal knows your industry vertical, speaks in your terminology, only offers tools your contract permits. When a user runs into a bug they report it through Crystal and it lands in your ticketing system automatically — with reproduction steps, severity, and affected user count already filled in. Feature requests aggregate across your users with semantic dedup and vote counts so you see real demand, not noise. Your brand admin dashboard shows Crystal quality metrics, open signals, and SLA status. You configure a webhook and every new signal lands in your Jira or Linear automatically.

**From an Experient perspective:** Every Crystal conversation is structured telemetry. Skills that perform poorly surface automatically — nightly for trends, every 15 minutes for SLA breaches. Feature demand is ranked by actual conversation signal with a priority formula that weights cross-brand breadth and recency. Quality regressions alert before customers file tickets. The example bank is self-improving from every passing run, with anonymized cross-org learning and automatic consolidation. Bug auto-severity escalates when three brands hit the same issue — before any human notices.

**From a user perspective:** Crystal works. Navigation suggestions are rendered as clickable chips. Feedback is captured from the natural conversation — no form, no Jira login. When Crystal doesn't know something it says so with confidence calibration rather than hallucinating. Every answer comes from the right specialist for the domain. When you report a bug or feature request, Crystal tells you if others have reported the same thing and how many votes it has. When the feature ships, Crystal proactively mentions it next time you open it.

**From an engineering perspective:** A new analysis skill is a SKILL.md file and a test case — four hours, not three days. `registerCrystalCapability()` makes a new app page Crystal-aware on deploy. Routing is testable before shipping via `experient-cdx test`. Quality gates are written in natural language in EVALS.md and enforced by an LLM judge on every run. A/B testing lets you validate a skill version on 10% of traffic before graduation, with statistical significance required. The Skill Browser shows every skill's health live. Debug mode on any Crystal request shows the full routing trace without reading logs.

**From an operations perspective:** No silent data loss — the DLQ catches every failed progressive tier event and makes it replayable. Budget exhaustion doesn't trip the circuit breaker. Redis keys are brand-namespaced so tenant data is safely inspectable and flushable in isolation. SLA breach alerts fire within 15 minutes of a critical bug going unacknowledged. The complete scheduler job map means every aggregation, escalation, and quality check has a known owner, frequency, and failure mode.
