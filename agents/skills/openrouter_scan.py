#!/usr/bin/env python3
"""OpenRouter model scanner for Experient Copilot agents.

Usage:
    python -m agents.skills.openrouter_scan                        # interactive — prompts for env
    python -m agents.skills.openrouter_scan --env dev,dev-paid     # non-interactive env selection
    python -m agents.skills.openrouter_scan --env all --patch      # scan + propose patches
    python -m agents.skills.openrouter_scan --env all --patch --yes   # no prompt, auto-apply
    python -m agents.skills.openrouter_scan --env all --allow-prod    # include staging/prod
    python -m agents.skills.openrouter_scan --json > scan.json     # machine-readable output
    python -m agents.skills.openrouter_scan --check-stale          # list models missing from catalog

What it does:
  1. Fetches the full model catalog from OpenRouter (~400+ models)
  2. Scores every model for each of the 17 agent roles with use-case-specific criteria
  3. Detects STALE models (in routing but no longer in the catalog) — these must be replaced
  4. Compares top candidates against the current routing table in agents/lib/models.py
  5. Reports cost deltas, context sizes, rate limit info, and runs-per-hour estimates
  6. Flags better or cheaper options; can auto-patch models.py (--patch)

Agent roles covered:
  Survey pipeline:   creator, qc, qc_validator, compliance, recommender, skip-logic, copilot
  Insight pipeline:  insight_narrate, insight_verify, insight_topics, insight_expert,
                     insight_evaluate, crystal, crystal_eval, response_gen
  Survey QA:         survey_bias, survey_evaluate

Environment:
    OPENROUTER_API_KEY — required (set in agents/.env or export before running)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
from dataclasses import dataclass, field
from typing import Any

import httpx

# ── ANSI colours (disabled when piped or --json) ────────────────────────────

_COLOUR = sys.stdout.isatty()


def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOUR else text


def green(t: str)  -> str: return _c("32", t)
def yellow(t: str) -> str: return _c("33", t)
def red(t: str)    -> str: return _c("31", t)
def bold(t: str)   -> str: return _c("1",  t)
def dim(t: str)    -> str: return _c("2",  t)
def cyan(t: str)   -> str: return _c("36", t)
def magenta(t: str) -> str: return _c("35", t)


# ── Current routing (read from models.py at import time) ────────────────────

_MODELS_PY = os.path.join(os.path.dirname(__file__), "..", "lib", "models.py")

try:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
    from agents.lib.models import _ROUTING as CURRENT_ROUTING  # type: ignore
except ImportError:
    CURRENT_ROUTING = {}


# ── Provider / model blocklist ────────────────────────────────────────────────

BLOCKED_PROVIDERS: set[str] = {
    # meta-llama — free tier frequently rate-limited (20 req/day shared pool).
    # Also lacks response_format/JSON-schema support on the free tier.
    "meta-llama",
    # baidu — low-quality, inconsistent JSON output.
    "baidu",
    # poolside — unknown startup provider, no SLA, unstable endpoints.
    "poolside",
    # cohere — free tier rate-limited and inconsistent JSON schema support.
    "cohere",
    # openai — preference for Chinese/Google equivalents at lower cost.
    # Remove this entry to re-enable GPT-4o/o1 in recommendations.
    "openai",
    # anthropic — staging/prod now route through OpenRouter Chinese/Google models.
    # Remove this entry if you want Anthropic models in OpenRouter recommendations.
    "anthropic",
}

# ── XM-domain family bonuses ──────────────────────────────────────────────────
# Models from these providers are known to excel at Experience Management tasks:
# structured survey analysis, NPS/CSAT reasoning, multilingual CX feedback,
# long-form qualitative synthesis, and JSON schema fidelity.
XM_PREFERRED_PROVIDERS: set[str] = {
    "google",      # Gemini: multilingual, structured output, long-context XM analysis
    "deepseek",    # DeepSeek: strong reasoning, structured JSON, cheap, great CX domain
    "qwen",        # Qwen: multilingual (APAC markets), structured, good at survey data
    "moonshot",    # Kimi: large context, good for long survey batches
    "minimax",     # MiniMax: large context synthesis
    "tencent",     # Hunyuan: Chinese enterprise CX data
    "mistral",     # Mistral: structured output, EU market compliance awareness
}

BLOCKED_MODEL_IDS: set[str] = {
    "openrouter/owl-alpha",
    # Confirmed delisted 2026-05-16:
    "deepseek/deepseek-r1-0528:free",
    "google/gemma-3-27b-it:free",
    # Note: deepseek/deepseek-v4-flash:free is confirmed live as of 2026-05-15 — NOT blocked.
}

# Substring patterns that make a model unsuitable for text-only agents
BLOCKED_ID_PATTERNS_EXTRA: list[str] = [
    "-vl:",        # vision-language — wrong modality
    "-vl-",
    "-omni-",      # multimodal audio/video — worse at pure text JSON
    "/turbo:",     # rate-limited turbo free aliases
]

# Unstable/preview endpoint patterns — these disappear without warning
BLOCKED_ID_PATTERNS: list[str] = [
    "-lite-001",
    "-lite-002",
    "-20241022",
    "-20240620",
    "-20240229",
    "-preview-",
    ":experimental",
    "-0301",
    "-0314",
    "-0324",
]


# ── Role scoring criteria ─────────────────────────────────────────────────────

@dataclass
class RoleCriteria:
    """Scoring weights and constraints for each agent role."""
    name:               str
    # Hard limits
    min_context:        int   = 32_000
    min_output:         int   = 1_000
    needs_tools:        bool  = True
    needs_structured:   bool  = False   # prefers json_schema / structured output
    # Soft scoring
    reasoning_bonus:    float = 0.0     # extra weight if model has thinking/reasoning capability
    latency_sensitive:  bool  = False   # penalise very large / slow models
    preferred_families: list[str] = field(default_factory=list)
    # Price cap — hard filter for paid envs (0.0 = no cap; free_only envs ignore this)
    # Set per-role so cheap fast agents aren't overshadowed by expensive reasoning models.
    # Tiers: $0.50 (fast/structured) · $1.00 (medium) · $2.00 (complex/reasoning)
    max_price_per_1m_input: float = 2.0   # USD per 1M input tokens — default $2 cap
    # XM domain bonus — extra +8 score for providers known to excel at XM/CX tasks.
    # Separate from preferred_families so the XM bonus stacks with the family bonus.
    xm_bonus: bool = True   # True = apply XM_PREFERRED_PROVIDERS bonus for this role
    # Rate-limit awareness
    calls_per_run:      int   = 2       # estimated HTTP calls this agent makes per survey run
    # Display metadata
    group:              str   = "survey"   # "survey" | "insight" | "qa"
    description:        str   = ""


# ── 17-role criteria table ────────────────────────────────────────────────────
#
# Design decisions per role:
#
# SURVEY PIPELINE
#   creator      — complex survey generation with tool calls; needs strong reasoning + large output
#   qc           — cross-vendor JSON reviewer; fast, structured, cross-vendor from creator
#   qc_validator — secondary pass validator; fast, small output
#   compliance   — GDPR/ethics flagging; structured, fast
#   recommender  — improvement suggestions; medium output, structured
#   skip-logic   — conditional branching rules; structured, medium output
#   copilot      — interactive survey assistant; needs good instruction following + tools
#
# INSIGHT PIPELINE
#   insight_narrate  — writes insight narratives; large output, quality writing, latency sensitive
#                      (runs once per insight: ~5-10 calls per pipeline run)
#   insight_verify   — fact-checks claims vs source responses; tiny output, fast, structured
#   insight_topics   — discovers topic labels for clusters; needs wide context + reasoning
#   insight_expert   — domain-specialist NPS/CSAT/CX narrators; deep reasoning per insight
#   insight_evaluate — audit full insight set for redundancy/coverage; needs to see all insights
#   crystal          — conversational Q&A over insights; good synthesis, medium output
#   crystal_eval     — hallucination checker for Crystal answers; fast, structured
#   response_gen     — generates synthetic survey responses; HIGH output volume (8K tokens)
#
# SURVEY QA
#   survey_bias      — detects bias in survey questions; structured, medium output
#   survey_evaluate  — holistic survey quality scoring; structured, medium output

ROLE_CRITERIA: dict[str, RoleCriteria] = {

    # ── Survey pipeline ───────────────────────────────────────────────────────
    # preferred_families: Chinese/Google only — no OpenAI/Anthropic.
    # Tier A ($2/1M cap): complex reasoning + tool use
    # Tier B ($1/1M cap): medium complexity, some structured output
    # Tier C ($0.50/1M cap): fast, structured, tiny output

    "creator": RoleCriteria(
        name="creator",
        min_context=64_000,
        min_output=4_096,
        needs_tools=True,
        reasoning_bonus=0.25,
        preferred_families=["deepseek", "gemini", "qwen", "moonshot", "minimax"],
        max_price_per_1m_input=2.0,    # complex — allow up to $2/1M
        calls_per_run=3,
        group="survey",
        description="Survey generation — tool use + strong reasoning (DeepSeek R1 / Gemini 2.5 Flash)",
    ),
    "qc": RoleCriteria(
        name="qc",
        min_context=32_000,
        min_output=1_000,
        needs_tools=False,
        needs_structured=True,
        latency_sensitive=True,
        preferred_families=["gemini", "deepseek", "qwen", "mistral"],
        max_price_per_1m_input=1.0,    # medium — cross-vendor reviewer
        calls_per_run=2,
        group="survey",
        description="Cross-vendor quality reviewer — must differ from creator's provider",
    ),
    "qc_validator": RoleCriteria(
        name="qc_validator",
        min_context=16_000,
        min_output=400,
        needs_tools=True,
        needs_structured=True,
        latency_sensitive=True,
        preferred_families=["gemini", "deepseek", "qwen", "moonshot"],
        max_price_per_1m_input=0.50,   # cheap — secondary fast pass
        calls_per_run=1,
        group="survey",
        description="Secondary QC pass — fast structured validation",
    ),
    "compliance": RoleCriteria(
        name="compliance",
        min_context=32_000,
        min_output=600,
        needs_tools=True,
        needs_structured=True,
        preferred_families=["gemini", "deepseek", "qwen"],
        max_price_per_1m_input=0.50,   # cheap — structured flag output
        calls_per_run=1,
        group="survey",
        description="GDPR/ethics compliance flagging — structured output",
    ),
    "recommender": RoleCriteria(
        name="recommender",
        min_context=32_000,
        min_output=600,
        needs_tools=True,
        preferred_families=["deepseek", "gemini", "qwen"],
        max_price_per_1m_input=1.0,
        calls_per_run=1,
        group="survey",
        description="Survey improvement suggestions — structured recommendations",
    ),
    "skip-logic": RoleCriteria(
        name="skip-logic",
        min_context=16_000,
        min_output=1_200,
        needs_tools=False,
        needs_structured=True,
        preferred_families=["gemini", "deepseek", "qwen", "mistral"],
        max_price_per_1m_input=0.50,   # cheap — structured JSON branching rules
        calls_per_run=1,
        group="survey",
        description="Conditional branching rule generation — structured JSON output",
    ),
    "copilot": RoleCriteria(
        name="copilot",
        min_context=32_000,
        min_output=2_000,
        needs_tools=True,
        reasoning_bonus=0.10,
        preferred_families=["gemini", "deepseek", "qwen", "moonshot"],
        max_price_per_1m_input=1.0,
        calls_per_run=2,
        group="survey",
        description="Interactive survey builder assistant — instruction following + tools",
    ),

    # ── Insight pipeline ─────────────────────────────────────────────────────
    # XM domain insight roles need models strong at:
    #   • Survey data pattern recognition (NPS/CSAT/effort)
    #   • Sentiment + emotion analysis in free-text responses
    #   • Structured JSON output with citations
    #   • Multilingual text (global XM deployments)
    # Best fits: Gemini 2.5 Flash (cheap, fast, multilingual, structured)
    #            DeepSeek R1 (cheap, reasoning-heavy for NPS benchmarks + CX taxonomy)
    #            DeepSeek Chat (cheapest structured JSON, great for validators)
    #            Qwen 2.5 72B (multilingual APAC, XM data)
    #            Kimi 128k (huge context for large survey batches)

    "insight_narrate": RoleCriteria(
        name="insight_narrate",
        min_context=32_000,
        min_output=2_000,
        needs_tools=False,
        needs_structured=False,
        reasoning_bonus=0.15,
        latency_sensitive=True,    # runs ~7× per pipeline — keep fast + cheap
        preferred_families=["gemini", "deepseek", "qwen", "moonshot", "mistral"],
        max_price_per_1m_input=1.0,    # medium — good writing quality needed
        calls_per_run=7,
        group="insight",
        description="Writes CX insight narratives — quality writing, XM domain, runs 7×",
    ),
    "insight_verify": RoleCriteria(
        name="insight_verify",
        min_context=32_000,
        min_output=300,
        needs_tools=False,
        needs_structured=True,
        latency_sensitive=True,    # runs ~7× per pipeline — must be fast + cheap
        preferred_families=["gemini", "deepseek", "qwen", "mistral"],
        max_price_per_1m_input=0.50,   # cheap — tiny output, runs many times
        calls_per_run=7,
        group="insight",
        description="Fact-checks insight claims vs source responses — fast, runs 7×",
    ),
    "insight_topics": RoleCriteria(
        name="insight_topics",
        min_context=64_000,        # must see many response excerpts
        min_output=2_000,
        needs_tools=False,
        needs_structured=True,
        reasoning_bonus=0.30,      # XM topic discovery needs strong CX pattern recognition
        latency_sensitive=False,
        preferred_families=["deepseek", "gemini", "qwen", "moonshot"],
        max_price_per_1m_input=2.0,    # complex — topic labeling from 100s of responses
        calls_per_run=1,
        group="insight",
        description="CX topic discovery from clusters — reasoning + large context (64K+)",
    ),
    "insight_expert": RoleCriteria(
        name="insight_expert",
        min_context=32_000,
        min_output=2_000,
        needs_tools=False,
        needs_structured=True,
        reasoning_bonus=0.35,      # NPS benchmarks, CX friction taxonomy, ICE framework
        latency_sensitive=True,    # parallel via asyncio.gather — still prefer fast
        preferred_families=["deepseek", "gemini", "qwen"],
        max_price_per_1m_input=2.0,    # complex — domain reasoning for NPS/CSAT/CX
        calls_per_run=7,
        group="insight",
        description="Domain NPS/CSAT/CX expert — ICE scoring, benchmarks, friction taxonomy",
    ),
    "insight_evaluate": RoleCriteria(
        name="insight_evaluate",
        min_context=64_000,        # must see the full insight set
        min_output=1_000,
        needs_tools=False,
        needs_structured=True,
        latency_sensitive=True,
        preferred_families=["gemini", "deepseek", "qwen", "mistral"],
        max_price_per_1m_input=0.50,   # cheap — structured audit pass
        calls_per_run=1,
        group="insight",
        description="Full insight set audit — coverage/redundancy check, 64K context needed",
    ),
    "crystal": RoleCriteria(
        name="crystal",
        min_context=32_000,
        min_output=1_500,
        needs_tools=False,
        reasoning_bonus=0.15,
        preferred_families=["gemini", "deepseek", "qwen", "moonshot"],
        max_price_per_1m_input=1.0,    # medium — synthesis + citation quality matters
        calls_per_run=3,
        group="insight",
        description="XM Q&A over insights — synthesis, citation grounding, XM domain knowledge",
    ),
    "crystal_eval": RoleCriteria(
        name="crystal_eval",
        min_context=16_000,
        min_output=600,
        needs_tools=False,
        needs_structured=True,
        latency_sensitive=True,
        preferred_families=["gemini", "deepseek", "qwen", "mistral"],
        max_price_per_1m_input=0.50,   # cheap — fast hallucination check
        calls_per_run=3,
        group="insight",
        description="Hallucination checker for Crystal answers — fast structured verdict",
    ),
    "response_gen": RoleCriteria(
        name="response_gen",
        min_context=16_000,
        min_output=4_000,          # bulk synthetic responses — large output volume
        needs_tools=False,
        needs_structured=False,
        latency_sensitive=False,
        preferred_families=["gemini", "deepseek", "qwen", "minimax"],
        max_price_per_1m_input=1.0,    # medium — large output but not reasoning-heavy
        calls_per_run=1,
        group="insight",
        description="Synthetic survey response generation — HIGH output (8K tokens), XM personas",
    ),

    # ── Survey QA ─────────────────────────────────────────────────────────────

    "survey_bias": RoleCriteria(
        name="survey_bias",
        min_context=16_000,
        min_output=800,
        needs_tools=False,
        needs_structured=True,
        preferred_families=["deepseek", "gemini", "qwen", "mistral"],
        max_price_per_1m_input=0.50,   # cheap — structured bias detection
        calls_per_run=1,
        group="qa",
        description="Detects leading/loaded/double-barreled bias — structured XM quality gate",
    ),
    "survey_evaluate": RoleCriteria(
        name="survey_evaluate",
        min_context=16_000,
        min_output=600,
        needs_tools=False,
        needs_structured=True,
        preferred_families=["deepseek", "gemini", "qwen", "mistral"],
        max_price_per_1m_input=0.50,   # cheap — structured quality scoring
        calls_per_run=1,
        group="qa",
        description="Holistic survey quality scoring — quality/balance/coverage/flow for XM",
    ),
}


# ── Model metadata ────────────────────────────────────────────────────────────

@dataclass
class ModelInfo:
    id:                  str
    name:                str
    context_length:      int
    max_output_tokens:   int
    price_prompt:        float
    price_completion:    float
    supported_params:    list[str]
    is_free:             bool
    provider:            str
    rpm:                 int | None = None
    tpm:                 int | None = None
    raw:                 dict = field(repr=False, default_factory=dict)

    @property
    def price_per_1m_input(self)  -> float: return self.price_prompt * 1_000_000
    @property
    def price_per_1m_output(self) -> float: return self.price_completion * 1_000_000

    @property
    def has_tools(self)    -> bool: return "tools" in self.supported_params
    @property
    def has_thinking(self) -> bool:
        return any(p in self.supported_params for p in ("reasoning", "thinking"))
    @property
    def has_json_mode(self) -> bool:
        """True if the model supports response_format / JSON mode.

        Required for any role with needs_structured=True — sending response_format
        to a model that doesn't support it causes a 400 "JSON mode is not enabled"
        error from the provider.
        """
        return "response_format" in self.supported_params

    def runs_per_hour(self, calls_per_run: int) -> int | None:
        if self.rpm is None or calls_per_run == 0:
            return None
        return int((self.rpm * 60) / calls_per_run)

    def score_for_role(self, criteria: RoleCriteria) -> float:
        import math
        s = 50.0

        # Hard filters
        if self.context_length < criteria.min_context:
            return 0.0
        if self.max_output_tokens < criteria.min_output:
            return 0.0
        if criteria.needs_tools and not self.has_tools:
            return 0.0
        if criteria.needs_structured and not self.has_json_mode:
            # Provider returns 400 "JSON mode is not enabled for this model" at runtime.
            return 0.0
        if self.rpm is not None and self.rpm < criteria.calls_per_run:
            return 0.0

        # Context bonus (log scale, up to +15)
        ctx_ratio = min(self.context_length / criteria.min_context, 4.0)
        s += min(math.log2(ctx_ratio + 1) * 7, 15)

        # Output headroom bonus (+5)
        if self.max_output_tokens >= criteria.min_output * 2:
            s += 5

        # Thinking/reasoning bonus
        if self.has_thinking:
            s += criteria.reasoning_bonus * 20

        # Preferred family bonus (+10) — Chinese/Google providers listed first
        for fam in criteria.preferred_families:
            if fam in self.id.lower() or fam in self.name.lower():
                s += 10
                break

        # XM domain bonus (+8) — providers known to excel at survey/CX analysis
        if criteria.xm_bonus and self.provider in XM_PREFERRED_PROVIDERS:
            s += 8

        # Structured output bonus — prefer models that explicitly support it when needed
        if criteria.needs_structured and "json" in " ".join(self.supported_params).lower():
            s += 5

        # Price efficiency bonus — cheaper models get a small bonus for cost-sensitive roles
        # This breaks ties between equally-scored models in favour of cheaper ones
        if not self.is_free and criteria.max_price_per_1m_input > 0:
            price_ratio = self.price_per_1m_input / criteria.max_price_per_1m_input
            if price_ratio <= 0.25:
                s += 6    # very cheap relative to cap
            elif price_ratio <= 0.50:
                s += 3    # moderately cheap
            elif price_ratio > 0.90:
                s -= 2    # close to cap — slight penalty

        # Latency penalties for large models when speed matters
        if criteria.latency_sensitive:
            if "70b" in self.id.lower():
                s -= 5
            if any(x in self.id.lower() for x in ("120b", "130b", "180b", "405b")):
                s -= 12

        # Rate-limit penalty
        if self.rpm is not None:
            rph = self.runs_per_hour(criteria.calls_per_run) or 0
            if rph < 5:
                s -= 20
            elif rph < 20:
                s -= 10
            elif rph < 60:
                s -= 3

        return min(max(s, 0.0), 100.0)


# ── OpenRouter fetch ──────────────────────────────────────────────────────────

def fetch_models(api_key: str) -> list[ModelInfo]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://experient.app",
        "X-Title": "Experient Model Scanner",
    }
    with httpx.Client(timeout=30) as client:
        resp = client.get("https://openrouter.ai/api/v1/models", headers=headers)
        resp.raise_for_status()
    data: list[dict[str, Any]] = resp.json().get("data", [])

    models = []
    for m in data:
        try:
            pricing      = m.get("pricing", {})
            p_prompt     = float(pricing.get("prompt",     "0") or "0")
            p_completion = float(pricing.get("completion", "0") or "0")
            is_free      = (p_prompt == 0.0 and p_completion == 0.0)

            top     = m.get("top_provider") or {}
            max_out = int(top.get("max_completion_tokens") or m.get("context_length", 4096))
            ctx     = int(m.get("context_length") or 4096)
            params  = m.get("supported_parameters") or []
            limits  = m.get("per_request_limits") or {}
            provider = m["id"].split("/")[0] if "/" in m["id"] else "unknown"

            rpm_raw = limits.get("requests_per_minute")
            tpm_raw = limits.get("tokens_per_minute")

            models.append(ModelInfo(
                id=m["id"],
                name=m.get("name", m["id"]),
                context_length=ctx,
                max_output_tokens=max_out,
                price_prompt=p_prompt,
                price_completion=p_completion,
                supported_params=params,
                is_free=is_free,
                provider=provider,
                rpm=int(rpm_raw) if rpm_raw is not None else None,
                tpm=int(tpm_raw) if tpm_raw is not None else None,
                raw=m,
            ))
        except (KeyError, ValueError, TypeError):
            continue

    return models


# ── Blocklist check ───────────────────────────────────────────────────────────

def _is_blocked(m: ModelInfo) -> bool:
    if m.provider in BLOCKED_PROVIDERS:
        return True
    if m.id in BLOCKED_MODEL_IDS:
        return True
    for pattern in BLOCKED_ID_PATTERNS:
        if pattern in m.id:
            return True
    for pattern in BLOCKED_ID_PATTERNS_EXTRA:
        if pattern in m.id:
            return True
    return False


# ── Stale model detection ─────────────────────────────────────────────────────

def check_stale_models(models: list[ModelInfo]) -> dict[str, list[str]]:
    """Return {env: [stale_model_ids]} for OpenRouter models not in the current catalog."""
    catalog_ids = {m.id for m in models}
    stale: dict[str, list[str]] = {}
    for env, roles in CURRENT_ROUTING.items():
        for role, cfg in roles.items():
            mid = cfg.model
            is_sdk = getattr(cfg, "use_anthropic_sdk", False)
            if is_sdk:
                continue  # Anthropic SDK models are not on OpenRouter catalog
            if "/" not in mid:
                continue  # bare model names (Anthropic) — skip
            if mid not in catalog_ids:
                stale.setdefault(env, [])
                if mid not in stale[env]:
                    stale[env].append(mid)
    return stale


# ── Candidate scoring ─────────────────────────────────────────────────────────

def top_candidates(
    models: list[ModelInfo],
    criteria: RoleCriteria,
    free_only: bool = False,
    exclude_providers: set[str] | None = None,
    max_price_override: float | None = None,  # override criteria.max_price_per_1m_input
    top_n: int = 5,
) -> list[tuple[float, ModelInfo]]:
    """Return top N models for a role sorted by score desc then price asc.

    Price cap enforcement:
    - free_only=True  → only $0 models (dev)
    - Otherwise       → max_price_per_1m_input from criteria (role-specific cap)
    - max_price_override → manual override for the report's top-paid section
    """
    price_cap = max_price_override if max_price_override is not None else criteria.max_price_per_1m_input
    scored = []
    for m in models:
        if _is_blocked(m):
            continue
        if free_only and not m.is_free:
            continue
        if not free_only and not m.is_free and price_cap > 0:
            if m.price_per_1m_input > price_cap:
                continue   # hard price filter
        if exclude_providers and m.provider in exclude_providers:
            continue
        s = m.score_for_role(criteria)
        if s > 0:
            scored.append((s, m))
    scored.sort(key=lambda x: (-x[0], x[1].price_per_1m_input))
    return scored[:top_n]


# ── Recommendation engine ─────────────────────────────────────────────────────

@dataclass
class Recommendation:
    role:         str
    env:          str
    current_id:   str
    suggested_id: str
    score:        float
    cost_delta:   str
    reason:       str
    is_stale:     bool = False   # True if current model is no longer in the catalog


def build_recommendations(models: list[ModelInfo]) -> list[Recommendation]:
    """Score all 17 roles across all envs and return swap recommendations."""
    recs: list[Recommendation] = []
    catalog_ids = {m.id for m in models}

    # Price caps per environment:
    #   dev      → free only ($0)
    #   dev-paid → role-specific caps from RoleCriteria.max_price_per_1m_input ($0.50–$2)
    #   staging  → 2× role cap (same model families, can afford slightly better tier)
    #   prod     → 3× role cap (best Chinese/Google within budget — no OpenAI/Anthropic)
    env_configs = {
        "dev":      dict(free_only=True,  price_multiplier=0.0),
        "dev-paid": dict(free_only=False, price_multiplier=1.0),
        "staging":  dict(free_only=False, price_multiplier=2.0),
        "prod":     dict(free_only=False, price_multiplier=3.0),
    }

    for env, cfg in env_configs.items():
        if env not in CURRENT_ROUTING:
            continue

        creator_cfg      = CURRENT_ROUTING[env].get("creator")
        creator_id       = creator_cfg.model if creator_cfg else ""
        creator_provider = creator_id.split("/")[0] if "/" in creator_id else "anthropic"

        # Track assigned model IDs per env to avoid duplicates
        used_model_ids: set[str] = set()
        for r, c in CURRENT_ROUTING[env].items():
            if getattr(c, "use_anthropic_sdk", False):
                used_model_ids.add(c.model)

        for role, criteria in ROLE_CRITERIA.items():
            if role not in CURRENT_ROUTING.get(env, {}):
                continue

            current_cfg = CURRENT_ROUTING[env][role]
            current_id  = current_cfg.model
            is_sdk      = getattr(current_cfg, "use_anthropic_sdk", False)

            if is_sdk:
                continue  # Anthropic SDK agents managed separately — not scanned here

            is_stale = (current_id not in catalog_ids and "/" in current_id)

            # Cross-vendor constraint: QC must differ from creator's provider
            exc_providers: set[str] = set()
            if role == "qc":
                exc_providers.add(creator_provider)

            free_only        = cfg.get("free_only", False)
            price_multiplier = cfg.get("price_multiplier", 1.0)
            # Compute effective price cap: role cap × env multiplier
            # dev → 0 (free_only handles it); dev-paid → 1×; staging → 2×; prod → 3×
            effective_price_cap = (
                None if free_only else
                criteria.max_price_per_1m_input * price_multiplier if price_multiplier > 0 else None
            )
            candidates = top_candidates(
                models, criteria,
                free_only=free_only,
                exclude_providers=exc_providers if exc_providers else None,
                max_price_override=effective_price_cap,
                top_n=15,
            )
            if not candidates:
                continue

            # Pick highest-scoring model not yet assigned in this env
            best_score, best_model = candidates[0]
            for score, m in candidates:
                if m.id not in used_model_ids:
                    best_score, best_model = score, m
                    break

            used_model_ids.add(best_model.id)

            # Emit recommendation if: stale (must replace) OR genuinely better
            if best_model.id == current_id and not is_stale:
                continue

            # Cost delta
            try:
                curr_model   = next(m for m in models if m.id == current_id)
                delta_input  = best_model.price_per_1m_input  - curr_model.price_per_1m_input
                delta_output = best_model.price_per_1m_output - curr_model.price_per_1m_output
                if abs(delta_input) < 0.001 and abs(delta_output) < 0.001:
                    cost_str = "same cost"
                elif delta_input < 0:
                    cost_str = f"saves ${abs(delta_input):.3f}/1M input"
                else:
                    cost_str = f"+${delta_input:.3f}/1M input"
            except StopIteration:
                cost_str = "current model not in catalog — stale" if is_stale else "unknown"

            recs.append(Recommendation(
                role=role,
                env=env,
                current_id=current_id,
                suggested_id=best_model.id,
                score=best_score,
                cost_delta=cost_str,
                reason=_build_reason(best_model, criteria, cost_str, is_stale),
                is_stale=is_stale,
            ))

    return recs


def _build_reason(m: ModelInfo, c: RoleCriteria, cost_str: str, is_stale: bool) -> str:
    parts = []
    if is_stale:
        parts.append("⚠ current model removed from catalog")
    if m.has_thinking:
        parts.append("reasoning/thinking")
    if m.context_length >= 128_000:
        parts.append(f"{m.context_length // 1000}K ctx")
    if m.has_tools:
        parts.append("tool use")
    if m.rpm is not None:
        rph = m.runs_per_hour(c.calls_per_run) or 0
        parts.append(f"~{rph}/hr throughput")
    parts.append(cost_str)
    return "; ".join(parts) if parts else "better overall score"


# ── Rate limit summary ────────────────────────────────────────────────────────

def rate_limit_summary(models: list[ModelInfo], model_ids: list[str]) -> dict[str, dict]:
    lookup = {m.id: m for m in models}
    result = {}
    for mid in model_ids:
        m = lookup.get(mid)
        if not m:
            result[mid] = {"status": red("NOT IN CATALOG — stale")}
            continue
        limits = m.raw.get("per_request_limits") or {}
        result[mid] = {
            "rpm":     limits.get("requests_per_minute", "unknown"),
            "tpm":     limits.get("tokens_per_minute",   "unknown"),
            "ctx":     m.context_length,
            "max_out": m.max_output_tokens,
            "is_free": m.is_free,
            "obj":     m,
        }
    return result


# ── Report ────────────────────────────────────────────────────────────────────

def _fmt_price(p: float) -> str:
    if p == 0:
        return green("FREE")
    if p < 1:
        return f"${p:.3f}/1M"
    return f"${p:.2f}/1M"


def _rph_str(m_obj: ModelInfo, calls: int) -> str:
    if m_obj.rpm is None:
        return ""
    rph = m_obj.runs_per_hour(calls) or 0
    if rph >= 60:
        return green(f"{rph}/hr")
    if rph >= 10:
        return yellow(f"{rph}/hr")
    return red(f"{rph}/hr")


GROUP_HEADERS = {
    "survey":  "Survey Pipeline",
    "insight": "Insight Pipeline",
    "qa":      "Survey QA",
}


def render_report(models: list[ModelInfo], recs: list[Recommendation]) -> None:
    catalog_ids = {m.id for m in models}
    stale = check_stale_models(models)

    all_ids: list[str] = []
    for env_dict in CURRENT_ROUTING.values():
        for cfg in env_dict.values():
            mid = cfg.model
            if "/" in mid:
                all_ids.append(mid)
    rl = rate_limit_summary(models, list(dict.fromkeys(all_ids)))

    print()
    print(bold("━━━ OpenRouter Model Scanner — Experient Copilot ━━━"))
    total = len(models)
    free  = sum(1 for m in models if m.is_free)
    print(f"  Catalog: {total} models ({green(str(free))} free, {total - free} paid)")
    print()

    # ── Stale alert ───────────────────────────────────────────────────────────
    if stale:
        print(bold(red("⚠  STALE MODELS DETECTED — no longer in OpenRouter catalog")))
        for env, ids in sorted(stale.items()):
            for mid in ids:
                print(f"  {yellow(env.upper())}: {red(mid)}")
        print(dim("  These must be replaced. Run --patch to apply fixes."))
        print()

    # ── Current routing table ─────────────────────────────────────────────────
    print(bold("Current Routing Table"))
    print(dim("─" * 80))

    envs = ["dev", "dev-paid", "staging", "prod"]
    for env in envs:
        if env not in CURRENT_ROUTING:
            continue
        print(f"\n  {bold(env.upper())}")

        # Group roles
        for group in ("survey", "insight", "qa"):
            group_roles = [
                (role, CURRENT_ROUTING[env][role])
                for role in ROLE_CRITERIA
                if role in CURRENT_ROUTING[env] and ROLE_CRITERIA[role].group == group
            ]
            if not group_roles:
                continue
            print(f"    {dim(GROUP_HEADERS[group])}")
            for role, cfg in group_roles:
                mid   = cfg.model
                sdk   = " [SDK]" if getattr(cfg, "use_anthropic_sdk", False) else ""
                think = "+thinking" if getattr(cfg, "use_thinking", False) else ""
                is_stale_model = mid not in catalog_ids and "/" in mid and not sdk

                role_criteria = ROLE_CRITERIA.get(role)
                if sdk:
                    price_str = cyan("direct Anthropic API")
                    json_flag = ""
                else:
                    m_obj = next((x for x in models if x.id == mid), None)
                    if m_obj:
                        price_str = f"{_fmt_price(m_obj.price_per_1m_input)} in / {_fmt_price(m_obj.price_per_1m_output)} out"
                        needs_j   = role_criteria.needs_structured if role_criteria else False
                        if needs_j and not m_obj.has_json_mode:
                            json_flag = red(" ✗json")
                        elif needs_j:
                            json_flag = green(" ✓json")
                        else:
                            json_flag = ""
                    else:
                        price_str = red("NOT IN CATALOG")
                        json_flag = ""

                calls = ROLE_CRITERIA.get(role, type("X", (), {"calls_per_run": 2})()).calls_per_run
                m_obj2 = next((x for x in models if x.id == mid), None)
                rph_s  = _rph_str(m_obj2, calls) if m_obj2 else ""

                stale_flag = red(" ⚠STALE") if is_stale_model else ""
                think_str  = f" {cyan(think)}" if think else ""
                print(f"      {role:<18} {(red(mid) if is_stale_model else mid):<48} {price_str}{json_flag}{sdk}{think_str}{stale_flag}  {rph_s}")

    print()

    # ── Recommendations ───────────────────────────────────────────────────────
    if not recs:
        print(bold(green("✓  Current routing is optimal — no suggestions.")))
    else:
        print(bold("Recommendations  (⚠ = stale; all others = better candidate found)"))
        print(dim("─" * 80))

        grouped: dict[str, list[Recommendation]] = {}
        for r in recs:
            grouped.setdefault(r.env, []).append(r)

        for env in envs:
            if env not in grouped:
                continue
            print(f"\n  {bold(env.upper())}")

            # Sort: stale first (critical), then by group order
            env_recs = sorted(grouped[env], key=lambda r: (
                not r.is_stale,
                list(GROUP_HEADERS.keys()).index(ROLE_CRITERIA.get(r.role, type("X", (), {"group": "survey"})()).group),
            ))
            for r in env_recs:
                flag  = red(" ⚠ STALE — must replace") if r.is_stale else ""
                arrow = yellow("→")
                print(f"    {r.role:<18} {dim(r.current_id)}{flag}")
                print(f"    {'':18} {arrow} {green(r.suggested_id)}  (score {r.score:.0f})")
                print(f"    {'':18}   {dim(r.reason)}")

    print()

    # ── Top free models per role ──────────────────────────────────────────────
    print(bold("Top 5 Free Models Per Role  (dev)"))
    print(dim("─" * 80))
    for group in ("survey", "insight", "qa"):
        roles_in_group = [r for r, c in ROLE_CRITERIA.items() if c.group == group]
        if not roles_in_group:
            continue
        print(f"\n  {dim(GROUP_HEADERS[group])}")
        for role in roles_in_group:
            criteria   = ROLE_CRITERIA[role]
            candidates = top_candidates(models, criteria, free_only=True, top_n=5)
            if not candidates:
                print(f"    {role:<18} {red('no free models meet criteria')}")
                continue
            json_req = yellow(" [needs json_mode]") if criteria.needs_structured else ""
            print(f"    {bold(role)}  {dim(criteria.description)}{json_req}")
            for score, m in candidates:
                ctx   = f"{m.context_length // 1000}K"
                out   = f"{m.max_output_tokens}out"
                tools = green("tools") if m.has_tools else dim("notools")
                think = cyan(" reason") if m.has_thinking else ""
                json_m = green(" json") if m.has_json_mode else red(" nojson")
                rpm_s = f" {m.rpm}rpm" if m.rpm else ""
                print(f"      {score:5.1f}  {m.id:<48} {ctx:<7} {out:<8} {tools}{json_m}{think}{dim(rpm_s)}")

    print()

    # ── Top paid candidates ───────────────────────────────────────────────────
    print(bold("Top 5 Paid Models Per Role  (dev-paid)"))
    print(dim("─" * 80))
    for group in ("survey", "insight", "qa"):
        roles_in_group = [r for r, c in ROLE_CRITERIA.items() if c.group == group]
        if not roles_in_group:
            continue
        print(f"\n  {dim(GROUP_HEADERS[group])}")
        for role in roles_in_group:
            criteria   = ROLE_CRITERIA[role]
            candidates = top_candidates(models, criteria, free_only=False, top_n=10)
            paid       = [(s, m) for s, m in candidates if not m.is_free][:5]
            if not paid:
                continue
            json_req = yellow(" [needs json_mode]") if criteria.needs_structured else ""
            print(f"    {bold(role)}  {dim(criteria.description)}{json_req}")
            for score, m in paid:
                ctx   = f"{m.context_length // 1000}K"
                price = f"${m.price_per_1m_input:.3f}/${m.price_per_1m_output:.3f}"
                think = cyan(" reason") if m.has_thinking else ""
                json_m = green(" json") if m.has_json_mode else red(" nojson")
                rpm_s = f" {m.rpm}rpm" if m.rpm else ""
                print(f"      {score:5.1f}  {m.id:<48} {ctx:<7} {price}{json_m}{think}{dim(rpm_s)}")

    print()
    print(dim("Run --patch to apply recommendations to models.py"))
    print(dim("Run --patch --allow-prod to also patch staging/prod"))
    print()


# ── Patch models.py ───────────────────────────────────────────────────────────

_ENV_ORDER = ["dev", "dev-paid", "staging", "prod"]
_PROTECTED_ENVS = {"staging", "prod"}


def _find_env_block_range(source: str, env: str) -> tuple[int, int]:
    start_marker = f'    "{env}": {{'
    start_pos    = source.find(start_marker)
    if start_pos == -1:
        raise ValueError(f"Cannot locate env block '{env}' in models.py")

    idx = _ENV_ORDER.index(env)
    if idx < len(_ENV_ORDER) - 1:
        next_env    = _ENV_ORDER[idx + 1]
        next_marker = f'    "{next_env}": {{'
        end_pos     = source.find(next_marker, start_pos)
    else:
        end_pos = source.find("\n}", start_pos)
        if end_pos != -1:
            end_pos += 2

    return start_pos, end_pos if end_pos != -1 else len(source)


def _patch_in_block(source: str, env: str, old_id: str, new_id: str) -> tuple[str, bool]:
    try:
        start, end = _find_env_block_range(source, env)
    except ValueError:
        return source, False

    block   = source[start:end]
    old_str = f'"{old_id}"'
    new_str = f'"{new_id}"'
    if old_str not in block:
        return source, False

    new_block = block.replace(old_str, new_str, 1)
    return source[:start] + new_block + source[end:], True


def _git_is_dirty(path: str) -> bool:
    import subprocess
    result = subprocess.run(["git", "diff", "--quiet", path], capture_output=True)
    return result.returncode != 0


def _show_diff(original: str, patched: str) -> None:
    import difflib
    diff = list(difflib.unified_diff(
        original.splitlines(keepends=True),
        patched.splitlines(keepends=True),
        fromfile="models.py (current)",
        tofile="models.py (patched)",
        n=3,
    ))
    for line in diff:
        if line.startswith("+") and not line.startswith("+++"):
            print(green(line), end="")
        elif line.startswith("-") and not line.startswith("---"):
            print(red(line), end="")
        else:
            print(dim(line), end="")


def apply_patches(recs: list[Recommendation], allowed_envs: set[str], yes: bool = False) -> None:
    filtered = [r for r in recs if r.env in allowed_envs]
    if not filtered:
        print("No recommendations for the selected envs.")
        return

    if _git_is_dirty(_MODELS_PY):
        print(yellow("⚠  models.py has uncommitted changes — patch will layer on top."))

    with open(_MODELS_PY, "r") as f:
        source = f.read()

    patched = source
    plan: list[tuple[str, str, str, bool]] = []
    for r in filtered:
        updated, ok = _patch_in_block(patched, r.env, r.current_id, r.suggested_id)
        if ok:
            patched = updated
            plan.append((f"{r.env}/{r.role}", r.current_id, r.suggested_id, r.is_stale))

    if not plan:
        print("No patches applied (models may already be updated).")
        return

    print(bold("\nProposed changes:"))
    for label, old, new, is_stale in plan:
        flag = red("  ← STALE, must replace") if is_stale else ""
        print(f"  {label}{flag}")
        print(f"    {red('- ' + old)}")
        print(f"    {green('+ ' + new)}")

    print()
    print(bold("Diff preview:"))
    _show_diff(source, patched)
    print()

    if not yes:
        try:
            answer = input("Apply these patches? [y/N] ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            answer = "n"
        if answer != "y":
            print("Aborted — no changes written.")
            return

    with open(_MODELS_PY, "w") as f:
        f.write(patched)

    stale_count = sum(1 for _, _, _, s in plan if s)
    print(green(f"\n✓ Applied {len(plan)} patch(es) to agents/lib/models.py"))
    if stale_count:
        print(yellow(f"  {stale_count} stale model(s) replaced."))
    print(dim("Verify: python -m pytest agents/tests/test_models.py -v"))


# ── Interactive env selection ─────────────────────────────────────────────────

def _prompt_env_selection(patch_mode: bool = False) -> set[str]:
    print()
    print(bold("Which environment(s) do you want to scan?"))
    print()
    print(f"  {bold('0')}  all      — scan all 4 environments")
    print(f"  {bold('1')}  dev      — free OpenRouter models  {green('(zero cost)')}  {dim('[default]')}")
    print(f"  {bold('2')}  dev-paid — cheap paid models  {yellow('(~$0.002–0.005/run)')}")
    print(f"  {bold('3')}  staging  — Sonnet 4.6 + Haiku  {yellow('(~$0.01/run)')}")
    print(f"  {bold('4')}  prod     — Opus 4.7 + Haiku  {red('(~$0.05–0.10/run)')}")
    print()
    print(dim("  Enter numbers separated by commas, e.g.  1,2  or  0  for all"))
    if patch_mode:
        print(dim(f"  {yellow('Note:')} staging/prod patches require --allow-prod."))
    print()

    try:
        raw = input("  Selection [0]: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        raw = ""

    if not raw or raw == "0":
        return set(_ENV_ORDER)

    selected: set[str] = set()
    for part in raw.split(","):
        part = part.strip()
        if part == "0":
            return set(_ENV_ORDER)
        try:
            idx = int(part)
            if 1 <= idx <= len(_ENV_ORDER):
                selected.add(_ENV_ORDER[idx - 1])
        except ValueError:
            if part in _ENV_ORDER:
                selected.add(part)

    return selected if selected else {"dev"}


# ── CLI entry point ───────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan OpenRouter for better/cheaper models for all Experient agents.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python -m agents.skills.openrouter_scan                           # interactive
              python -m agents.skills.openrouter_scan --env dev                 # dev only
              python -m agents.skills.openrouter_scan --env dev,dev-paid        # dev + dev-paid
              python -m agents.skills.openrouter_scan --env all                 # all envs
              python -m agents.skills.openrouter_scan --env dev --patch         # patch dev
              python -m agents.skills.openrouter_scan --env all --patch --yes   # no prompt
              python -m agents.skills.openrouter_scan --env staging,prod --patch --allow-prod
              python -m agents.skills.openrouter_scan --check-stale             # stale check only
              python -m agents.skills.openrouter_scan --json > scan.json        # machine JSON

            Safety:
              - staging/prod are BLOCKED unless --allow-prod is also passed
              - Always shows diff and asks [y/N] before writing (bypass with --yes)
              - Replacement is scoped to the correct env block (not global find-replace)
              - Warns if models.py has uncommitted git changes before patching
        """),
    )
    parser.add_argument("--env",          default=None,
                        help="comma-separated envs: dev,dev-paid,staging,prod or 'all'")
    parser.add_argument("--patch",        action="store_true",
                        help="propose and apply updates to models.py")
    parser.add_argument("--allow-prod",   action="store_true",
                        help="allow patching staging and prod (requires --patch)")
    parser.add_argument("--yes",          action="store_true",
                        help="skip confirmation prompt when patching")
    parser.add_argument("--json",         action="store_true",
                        help="output machine-readable JSON")
    parser.add_argument("--check-stale",  action="store_true",
                        help="only list models missing from the catalog and exit")
    parser.add_argument("--top",          type=int, default=5,
                        help="candidates to show per role (default 5)")
    args = parser.parse_args()

    # ── API key ───────────────────────────────────────────────────────────────
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line.startswith("OPENROUTER_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break

    if not api_key:
        print(red("Error: OPENROUTER_API_KEY not set."), file=sys.stderr)
        sys.exit(1)

    # ── Fetch catalog ─────────────────────────────────────────────────────────
    print(dim("Fetching model catalog from OpenRouter…"), file=sys.stderr)
    models = fetch_models(api_key)
    print(dim(f"  {len(models)} models loaded."), file=sys.stderr)

    # ── Stale-only mode ───────────────────────────────────────────────────────
    if args.check_stale:
        stale = check_stale_models(models)
        if not stale:
            print(green("✓ No stale models found — all OpenRouter model IDs are in the current catalog."))
        else:
            print(bold(red("Stale models (not in catalog):")))
            for env, ids in sorted(stale.items()):
                for mid in ids:
                    print(f"  {yellow(env)}: {red(mid)}")
        return

    # ── Resolve envs ──────────────────────────────────────────────────────────
    if args.env:
        if args.env.strip().lower() == "all":
            selected_envs = set(_ENV_ORDER)
        else:
            selected_envs = {e.strip() for e in args.env.split(",") if e.strip() in _ENV_ORDER}
    elif args.yes or args.json:
        selected_envs = set(_ENV_ORDER)
    else:
        selected_envs = _prompt_env_selection(patch_mode=args.patch)

    print(dim(f"  Scanning: {', '.join(sorted(selected_envs))}"), file=sys.stderr)

    recs   = build_recommendations(models)
    recs   = [r for r in recs if r.env in selected_envs]

    # ── Output ────────────────────────────────────────────────────────────────
    if args.json:
        stale_map = check_stale_models(models)
        output = {
            "scanned_envs":    sorted(selected_envs),
            "total_models":    len(models),
            "free_models":     sum(1 for m in models if m.is_free),
            "stale_models":    stale_map,
            "recommendations": [
                {
                    "env":        r.env,
                    "role":       r.role,
                    "group":      ROLE_CRITERIA.get(r.role, type("X", (), {"group": "?"})()).group,
                    "current":    r.current_id,
                    "suggested":  r.suggested_id,
                    "score":      round(r.score, 1),
                    "cost_delta": r.cost_delta,
                    "reason":     r.reason,
                    "is_stale":   r.is_stale,
                }
                for r in recs
            ],
            "top_free": {
                role: [
                    {
                        "id": m.id, "score": round(s, 1),
                        "context_k": m.context_length // 1000,
                        "max_output": m.max_output_tokens,
                        "has_tools": m.has_tools,
                        "has_thinking": m.has_thinking,
                        "rpm": m.rpm,
                    }
                    for s, m in top_candidates(models, ROLE_CRITERIA[role], free_only=True, top_n=args.top)
                ]
                for role in ROLE_CRITERIA
                if "dev" in selected_envs
            },
        }
        print(json.dumps(output, indent=2))
    else:
        render_report(models, recs)

    # ── Patch ────────────────────────────────────────────────────────────────
    if args.patch:
        patch_envs = selected_envs - (_PROTECTED_ENVS if not args.allow_prod else set())
        if args.allow_prod:
            blocked = selected_envs & _PROTECTED_ENVS
            if blocked:
                print(yellow(f"⚠  --allow-prod: {', '.join(sorted(blocked))} eligible for patching."))
        else:
            skipped = selected_envs & _PROTECTED_ENVS
            if skipped:
                print(dim(f"  {', '.join(sorted(skipped))} skipped (pass --allow-prod to include)."))

        if patch_envs:
            apply_patches(recs, allowed_envs=patch_envs, yes=args.yes)
        else:
            print(dim("No patchable envs selected."))


if __name__ == "__main__":
    main()
