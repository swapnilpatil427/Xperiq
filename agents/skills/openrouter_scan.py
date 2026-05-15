#!/usr/bin/env python3
"""OpenRouter model scanner for Experient Copilot agents.

Usage:
    python -m agents.skills.openrouter_scan            # dry run, show report
    python -m agents.skills.openrouter_scan --patch    # also update models.py
    python -m agents.skills.openrouter_scan --json     # machine-readable output

What it does:
  1. Fetches the full model catalog from OpenRouter
  2. Scores every model for each agent role (creator, qc, qc_validator, compliance, recommender)
  3. Compares top candidates against the current routing table in agents/lib/models.py
  4. Reports cost deltas, context sizes, and rate limit info
  5. Flags better or cheaper options for staging/prod and cheaper free-tier options for dev

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


# ── Current routing (read from models.py at import time) ────────────────────

_MODELS_PY = os.path.join(os.path.dirname(__file__), "..", "lib", "models.py")

# Mirrors the current defaults from models.py — updated automatically when
# --patch is run. Import the live module for an exact comparison.
try:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
    from agents.lib.models import _ROUTING as CURRENT_ROUTING  # type: ignore
except ImportError:
    CURRENT_ROUTING = {}


# ── Role scoring criteria ────────────────────────────────────────────────────

@dataclass
class RoleCriteria:
    """Scoring weights and constraints for each agent role."""
    name:               str
    min_context:        int   = 32_000   # minimum context window (tokens)
    min_output:         int   = 1_000    # minimum output tokens needed
    needs_tools:        bool  = True     # must list "tools" in supported_parameters
    needs_structured:   bool  = False    # prefers json_schema output
    reasoning_bonus:    float = 0.0      # extra score multiplier if model has "thinking" cap
    latency_sensitive:  bool  = False    # penalise very large / slow models
    preferred_families: list[str] = field(default_factory=list)  # e.g. ["gemini", "claude"]
    calls_per_run:      int   = 2        # estimated HTTP calls this agent makes per survey run
                                         # (1 initial + up to 1 JSON retry is typical)


ROLE_CRITERIA: dict[str, RoleCriteria] = {
    "creator": RoleCriteria(
        name="creator",
        min_context=64_000,
        min_output=4_096,
        needs_tools=True,
        reasoning_bonus=0.25,
        preferred_families=["claude", "gemini", "gpt-4"],
        calls_per_run=3,  # complex task — more likely to need a JSON retry
    ),
    "qc": RoleCriteria(
        name="qc",
        min_context=32_000,
        min_output=1_000,
        needs_tools=False,
        needs_structured=True,
        latency_sensitive=True,
        preferred_families=["gemini", "llama", "mistral"],
        calls_per_run=2,
    ),
    "qc_validator": RoleCriteria(
        name="qc_validator",
        min_context=16_000,
        min_output=400,
        needs_tools=True,
        needs_structured=True,
        latency_sensitive=True,
        preferred_families=["claude", "gemini", "gpt-4"],
        calls_per_run=1,
    ),
    "compliance": RoleCriteria(
        name="compliance",
        min_context=32_000,
        min_output=600,
        needs_tools=True,
        needs_structured=True,
        preferred_families=["claude", "gemini", "gpt-4"],
        calls_per_run=1,
    ),
    "recommender": RoleCriteria(
        name="recommender",
        min_context=32_000,
        min_output=500,
        needs_tools=True,
        preferred_families=["claude", "llama", "gemini"],
        calls_per_run=1,
    ),
}


# ── Model metadata ────────────────────────────────────────────────────────────

@dataclass
class ModelInfo:
    id:                  str
    name:                str
    context_length:      int
    max_output_tokens:   int
    price_prompt:        float   # USD per token (input)
    price_completion:    float   # USD per token (output)
    supported_params:    list[str]
    is_free:             bool
    provider:            str     # org slug before first "/"
    rpm:                 int | None = None   # requests/minute limit from OpenRouter (None = unknown)
    tpm:                 int | None = None   # tokens/minute limit (None = unknown)
    raw:                 dict    = field(repr=False, default_factory=dict)

    @property
    def price_per_1m_input(self)  -> float: return self.price_prompt * 1_000_000
    @property
    def price_per_1m_output(self) -> float: return self.price_completion * 1_000_000

    @property
    def has_tools(self)   -> bool: return "tools" in self.supported_params
    @property
    def has_thinking(self) -> bool:
        return any(p in self.supported_params for p in ("reasoning", "thinking"))

    def runs_per_hour(self, calls_per_run: int) -> int | None:
        """Estimated survey runs per hour before hitting this model's rate limit."""
        if self.rpm is None:
            return None
        if calls_per_run == 0:
            return None
        return int((self.rpm * 60) / calls_per_run)

    def score_for_role(self, criteria: RoleCriteria) -> float:
        """Return a 0–100 quality score for a given agent role."""
        import math
        s = 50.0

        # Hard filters — model is unusable for role
        if self.context_length < criteria.min_context:
            return 0.0
        if self.max_output_tokens < criteria.min_output:
            return 0.0
        if criteria.needs_tools and not self.has_tools:
            return 0.0

        # Hard filter: if rate limit is known and too tight to handle even 1 run/min, reject
        if self.rpm is not None and self.rpm < criteria.calls_per_run:
            return 0.0

        # Context bonus (log scale up to +15)
        ctx_ratio = min(self.context_length / criteria.min_context, 4.0)
        s += min(math.log2(ctx_ratio + 1) * 7, 15)

        # Output headroom bonus (+5)
        if self.max_output_tokens >= criteria.min_output * 2:
            s += 5

        # Thinking bonus
        if self.has_thinking:
            s += criteria.reasoning_bonus * 20

        # Preferred family bonus (+10)
        for fam in criteria.preferred_families:
            if fam in self.id.lower() or fam in self.name.lower():
                s += 10
                break

        # Latency penalty for large models when latency matters
        if criteria.latency_sensitive and "70b" in self.id.lower():
            s -= 5
        if criteria.latency_sensitive and ("120b" in self.id.lower() or "130b" in self.id.lower()):
            s -= 10

        # Rate-limit penalty: if known limits are tight relative to calls needed per run
        if self.rpm is not None:
            runs_ph = self.runs_per_hour(criteria.calls_per_run) or 0
            if runs_ph < 5:
                s -= 20   # can barely do 5 runs/hour — heavy penalty
            elif runs_ph < 20:
                s -= 10   # moderate limit
            elif runs_ph < 60:
                s -= 3    # slight headroom concern

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
            pricing = m.get("pricing", {})
            p_prompt     = float(pricing.get("prompt", "0") or "0")
            p_completion = float(pricing.get("completion", "0") or "0")
            is_free = (p_prompt == 0.0 and p_completion == 0.0)

            top = m.get("top_provider") or {}
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


# ── Scoring + recommendation ─────────────────────────────────────────────────

@dataclass
class Recommendation:
    role:         str
    env:          str         # "dev" | "dev-paid" | "staging" | "prod"
    current_id:   str
    suggested_id: str
    score:        float
    cost_delta:   str         # "+$0.01/1M tokens" | "free" | "same"
    reason:       str


def top_candidates(
    models: list[ModelInfo],
    criteria: RoleCriteria,
    free_only: bool = False,
    exclude_providers: set[str] | None = None,
    top_n: int = 5,
) -> list[tuple[float, ModelInfo]]:
    """Return the top N models for a role, sorted by score desc."""
    scored = []
    for m in models:
        if free_only and not m.is_free:
            continue
        if exclude_providers and m.provider in exclude_providers:
            continue
        s = m.score_for_role(criteria)
        if s > 0:
            scored.append((s, m))
    scored.sort(key=lambda x: (-x[0], x[1].price_per_1m_input))
    return scored[:top_n]


def build_recommendations(models: list[ModelInfo]) -> list[Recommendation]:
    recs: list[Recommendation] = []

    env_configs = {
        "dev":       dict(free_only=True),
        "dev-paid":  dict(free_only=False, max_input_per_1m=1.0),
        "staging":   dict(free_only=False, max_input_per_1m=10.0),
        "prod":      dict(free_only=False),
    }

    for env, cfg in env_configs.items():
        if env not in CURRENT_ROUTING:
            continue

        creator_id       = CURRENT_ROUTING[env].get("creator", type("X", (), {"model": ""})()).model
        creator_provider = creator_id.split("/")[0] if "/" in creator_id else "anthropic"

        # Hard constraint: the same model ID must not be assigned to more than one agent.
        # Pre-seed with SDK model IDs (not patched, but should not be duplicated).
        used_model_ids: set[str] = set()
        for r, c in CURRENT_ROUTING[env].items():
            if getattr(c, "use_anthropic_sdk", False):
                used_model_ids.add(c.model)

        role_order = ["creator", "qc", "qc_validator", "compliance", "recommender"]

        for role in role_order:
            criteria = ROLE_CRITERIA.get(role)
            if criteria is None or role not in CURRENT_ROUTING.get(env, {}):
                continue

            current_cfg = CURRENT_ROUTING[env][role]
            current_id  = current_cfg.model
            is_sdk      = getattr(current_cfg, "use_anthropic_sdk", False)

            if is_sdk:
                continue

            # Cross-vendor rule for QC only (provider exclusion, not model-ID exclusion)
            exc_providers: set[str] = set()
            if role == "qc":
                exc_providers.add(creator_provider)
                exc_providers.add("anthropic")

            free_only = cfg.get("free_only", False)
            candidates = top_candidates(
                models, criteria,
                free_only=free_only,
                exclude_providers=exc_providers if exc_providers else None,
                top_n=15,
            )
            if not candidates:
                continue

            # Pick the highest-scoring model that hasn't already been assigned in this env
            best_score, best_model = candidates[0]
            for score, m in candidates:
                if m.id not in used_model_ids:
                    best_score, best_model = score, m
                    break

            # Reserve this model ID so subsequent roles can't duplicate it
            used_model_ids.add(best_model.id)

            if best_model.id == current_id:
                continue  # already optimal

            # Cost delta
            try:
                curr_model = next(m for m in models if m.id == current_id)
                delta_input  = (best_model.price_per_1m_input  - curr_model.price_per_1m_input)
                delta_output = (best_model.price_per_1m_output - curr_model.price_per_1m_output)
                if abs(delta_input) < 0.001 and abs(delta_output) < 0.001:
                    cost_str = "same cost"
                elif delta_input < 0:
                    cost_str = f"saves ${abs(delta_input):.2f}/1M input tokens"
                else:
                    cost_str = f"+${delta_input:.2f}/1M input tokens"
            except StopIteration:
                cost_str = "current model not in catalog (may be removed)"

            recs.append(Recommendation(
                role=role,
                env=env,
                current_id=current_id,
                suggested_id=best_model.id,
                score=best_score,
                cost_delta=cost_str,
                reason=_build_reason(best_model, criteria, cost_str),
            ))

    return recs


def _build_reason(m: ModelInfo, c: RoleCriteria, cost_str: str) -> str:
    parts = []
    if m.has_thinking:
        parts.append("supports reasoning/thinking")
    if m.context_length >= 128_000:
        parts.append(f"{m.context_length // 1000}K context")
    if m.has_tools:
        parts.append("tool use")
    parts.append(cost_str)
    return "; ".join(parts) if parts else "better overall score"


# ── Rate limit summary ────────────────────────────────────────────────────────

def rate_limit_summary(models: list[ModelInfo], model_ids: list[str]) -> dict[str, dict]:
    """Extract per_request_limits from raw model data for the given IDs."""
    lookup = {m.id: m for m in models}
    result = {}
    for mid in model_ids:
        m = lookup.get(mid)
        if not m:
            result[mid] = {"status": "not in catalog"}
            continue
        limits = m.raw.get("per_request_limits") or {}
        result[mid] = {
            "requests_per_minute": limits.get("requests_per_minute", "unknown"),
            "tokens_per_minute":   limits.get("tokens_per_minute", "unknown"),
            "context_length":      m.context_length,
            "max_output":          m.max_output_tokens,
            "is_free":             m.is_free,
        }
    return result


# ── Report rendering ──────────────────────────────────────────────────────────

def _fmt_price(p: float) -> str:
    if p == 0:
        return green("FREE")
    if p < 1:
        return f"${p:.3f}/1M"
    return f"${p:.2f}/1M"


def render_report(models: list[ModelInfo], recs: list[Recommendation]) -> None:
    all_ids_in_routing: list[str] = []
    for env_dict in CURRENT_ROUTING.values():
        for cfg in env_dict.values():
            mid = cfg.model
            if "/" in mid:  # OpenRouter models only (not anthropic SDK IDs)
                all_ids_in_routing.append(mid)

    rl = rate_limit_summary(models, list(dict.fromkeys(all_ids_in_routing)))

    # ── Header ────────────────────────────────────────────────────────────────
    print()
    print(bold("━━━ OpenRouter Model Scanner — Experient Copilot ━━━"))
    total = len(models)
    free  = sum(1 for m in models if m.is_free)
    print(f"  Catalog: {total} models ({green(str(free))} free, {total - free} paid)")
    print()

    # ── Current routing + rate limits ────────────────────────────────────────
    print(bold("Current Routing Table"))
    print(dim("─" * 70))

    envs = ["dev", "dev-paid", "staging", "prod"]
    for env in envs:
        if env not in CURRENT_ROUTING:
            continue
        print(f"\n  {bold(env.upper())}")
        for role, cfg in CURRENT_ROUTING[env].items():
            mid  = cfg.model
            sdk  = " [Anthropic SDK]" if getattr(cfg, "use_anthropic_sdk", False) else ""
            think = " + thinking" if getattr(cfg, "use_thinking", False) else ""
            rl_info = rl.get(mid, {})

            if sdk:
                price_str = cyan("direct API")
            else:
                m = next((x for x in models if x.id == mid), None)
                price_str = (
                    f"{_fmt_price(m.price_per_1m_input)} in / {_fmt_price(m.price_per_1m_output)} out"
                    if m else red("NOT IN CATALOG")
                )

            # Rate limit + runs/hour annotation
            calls = ROLE_CRITERIA.get(role, type("X", (), {"calls_per_run": 2})()).calls_per_run
            m_obj = next((x for x in models if x.id == mid), None)
            if m_obj and m_obj.rpm is not None:
                rph = m_obj.runs_per_hour(calls)
                rph_str = green(f"{rph}/hr") if rph and rph >= 60 else yellow(f"{rph}/hr") if rph and rph >= 10 else red(f"{rph}/hr") if rph else ""
                rl_str  = f"  {dim(str(m_obj.rpm) + ' rpm')} {rph_str}"
            else:
                rl_str = ""

            print(f"    {role:<14} {mid:<45} {price_str}{sdk}{think}{rl_str}")

    print()

    # ── Recommendations ───────────────────────────────────────────────────────
    if not recs:
        print(bold(green("✓  Current routing is optimal — no suggestions.")))
        print()
        return

    print(bold("Recommendations"))
    print(dim("─" * 70))

    grouped: dict[str, list[Recommendation]] = {}
    for r in recs:
        grouped.setdefault(r.env, []).append(r)

    for env in envs:
        if env not in grouped:
            continue
        print(f"\n  {bold(env.upper())}")
        for r in grouped[env]:
            arrow = yellow("→")
            print(f"    {r.role:<14} {dim(r.current_id)}")
            print(f"    {'':14} {arrow} {green(r.suggested_id)}  (score {r.score:.0f})")
            print(f"    {'':14}   {dim(r.reason)}")

    print()

    # ── Free tier top-5 per role ──────────────────────────────────────────────
    print(bold("Top 5 Free Models Per Role  (dev / zero-cost)"))
    print(dim("─" * 70))
    for role, criteria in ROLE_CRITERIA.items():
        candidates = top_candidates(models, criteria, free_only=True, top_n=5)
        if not candidates:
            print(f"\n  {role}: {red('no free models meet criteria')}")
            continue
        print(f"\n  {bold(role)}")
        for score, m in candidates:
            ctx   = f"{m.context_length // 1000}K ctx"
            out   = f"{m.max_output_tokens} out"
            tools = green("tools") if m.has_tools else dim("no-tools")
            think = cyan(" reasoning") if m.has_thinking else ""
            print(f"    {score:5.1f}  {m.id:<45} {ctx:<10} {out:<10} {tools}{think}")

    print()

    # ── Cheap paid alternatives ────────────────────────────────────────────────
    print(bold("Top 5 Cheapest Paid Models Per Role  (dev-paid)"))
    print(dim("─" * 70))
    for role, criteria in ROLE_CRITERIA.items():
        candidates = top_candidates(models, criteria, free_only=False, top_n=10)
        paid = [(s, m) for s, m in candidates if not m.is_free][:5]
        if not paid:
            continue
        print(f"\n  {bold(role)}")
        for score, m in paid:
            ctx   = f"{m.context_length // 1000}K ctx"
            price = f"${m.price_per_1m_input:.3f}/{m.price_per_1m_output:.3f} per 1M"
            think = cyan(" reasoning") if m.has_thinking else ""
            print(f"    {score:5.1f}  {m.id:<45} {ctx:<10} {price}{think}")

    print()
    print(dim("Run with --patch to update dev/dev-paid models.py  (staging/prod require --allow-prod)."))
    print()


# ── Patch models.py ───────────────────────────────────────────────────────────

_ENV_ORDER = ["dev", "dev-paid", "staging", "prod"]

# Envs that require --allow-prod to be patched
_PROTECTED_ENVS = {"staging", "prod"}


def _find_env_block_range(source: str, env: str) -> tuple[int, int]:
    """Return (start, end) char positions of the env's section in models.py."""
    start_marker = f'    "{env}": {{'
    start_pos = source.find(start_marker)
    if start_pos == -1:
        raise ValueError(f"Cannot locate env block '{env}' in models.py")

    idx = _ENV_ORDER.index(env)
    if idx < len(_ENV_ORDER) - 1:
        next_env   = _ENV_ORDER[idx + 1]
        next_marker = f'    "{next_env}": {{'
        end_pos    = source.find(next_marker, start_pos)
    else:
        # Last env — scan forward to the closing `}` of _ROUTING
        end_pos = source.find("\n}", start_pos)
        if end_pos != -1:
            end_pos += 2

    return start_pos, end_pos if end_pos != -1 else len(source)


def _patch_in_block(source: str, env: str, old_id: str, new_id: str) -> tuple[str, bool]:
    """Replace old_id with new_id ONLY inside the correct env block."""
    try:
        start, end = _find_env_block_range(source, env)
    except ValueError:
        return source, False

    block     = source[start:end]
    old_str   = f'"{old_id}"'
    new_str   = f'"{new_id}"'
    if old_str not in block:
        return source, False

    new_block = block.replace(old_str, new_str, 1)
    return source[:start] + new_block + source[end:], True


def _git_is_dirty(path: str) -> bool:
    import subprocess
    result = subprocess.run(
        ["git", "diff", "--quiet", path],
        capture_output=True,
    )
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
    if not diff:
        return
    for line in diff:
        if line.startswith("+") and not line.startswith("+++"):
            print(green(line), end="")
        elif line.startswith("-") and not line.startswith("---"):
            print(red(line), end="")
        else:
            print(dim(line), end="")


def apply_patches(
    recs: list[Recommendation],
    allowed_envs: set[str],
    yes: bool = False,
) -> None:
    filtered = [r for r in recs if r.env in allowed_envs]
    if not filtered:
        print("No recommendations for the selected envs.")
        return

    # Warn if git has uncommitted changes to models.py
    if _git_is_dirty(_MODELS_PY):
        print(yellow("⚠  models.py has uncommitted changes — patch will layer on top."))

    with open(_MODELS_PY, "r") as f:
        source = f.read()

    patched = source
    plan: list[tuple[str, str, str]] = []  # (env/role, old, new)
    for r in filtered:
        updated, ok = _patch_in_block(patched, r.env, r.current_id, r.suggested_id)
        if ok:
            patched = updated
            plan.append((f"{r.env}/{r.role}", r.current_id, r.suggested_id))

    if not plan:
        print("No patches applied (models may already be updated or not found in file).")
        return

    print(bold("\nProposed changes:"))
    for label, old, new in plan:
        print(f"  {label}")
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

    print(green(f"\n✓ Applied {len(plan)} patch(es) to agents/lib/models.py"))
    print(dim("Verify: python -m pytest agents/tests/test_models.py -v"))


# ── Interactive env selection ─────────────────────────────────────────────────

def _prompt_env_selection(patch_mode: bool = False) -> set[str]:
    """Ask the user which environment(s) to include. Returns a set of env names."""
    all_envs = _ENV_ORDER  # ["dev", "dev-paid", "staging", "prod"]

    print()
    print(bold("Which environment(s) do you want to scan?"))
    print()
    print(f"  {bold('0')}  all    — scan all 4 environments")
    print(f"  {bold('1')}  dev    — free OpenRouter models  {green('(zero cost)')}  {dim('[default]')}")
    print(f"  {bold('2')}  dev-paid — cheap paid models  {yellow('(~$0.001–0.003/run)')}")
    print(f"  {bold('3')}  staging  — Sonnet 4.6 + Haiku  {yellow('(~$0.01/run)')}")
    print(f"  {bold('4')}  prod     — Opus 4.7 + Haiku  {red('(~$0.05–0.10/run)')}")
    print()
    print(dim("  Enter numbers separated by commas, e.g.  1,2  or  0  for all"))

    if patch_mode:
        print(dim(f"  {yellow('Note:')} staging/prod patches require explicit confirmation per env."))

    print()

    try:
        raw = input("  Selection [0]: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        raw = ""

    if not raw or raw == "0":
        return set(all_envs)

    selected: set[str] = set()
    for part in raw.split(","):
        part = part.strip()
        if part == "0":
            return set(all_envs)
        try:
            idx = int(part)
            if 1 <= idx <= len(all_envs):
                selected.add(all_envs[idx - 1])
            else:
                print(yellow(f"  ⚠  Ignoring out-of-range choice: {part}"))
        except ValueError:
            # Accept env name typed directly, e.g. "dev"
            if part in all_envs:
                selected.add(part)
            else:
                print(yellow(f"  ⚠  Unknown env '{part}', skipping"))

    return selected if selected else {"dev"}


# ── CLI entry point ───────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan OpenRouter for better/cheaper models for Experient agents.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python -m agents.skills.openrouter_scan                        # interactive — asks which env
              python -m agents.skills.openrouter_scan --env dev              # scan dev only (non-interactive)
              python -m agents.skills.openrouter_scan --env dev,dev-paid     # scan dev + dev-paid
              python -m agents.skills.openrouter_scan --env all              # scan all envs
              python -m agents.skills.openrouter_scan --env dev --patch      # scan + patch dev (with confirmation)
              python -m agents.skills.openrouter_scan --env dev --patch --yes  # no prompt
              python -m agents.skills.openrouter_scan --env staging,prod --patch --allow-prod
              python -m agents.skills.openrouter_scan --json > scan.json

            Safety rules for --patch:
              - staging and prod: BLOCKED unless --allow-prod is also passed
              - Always shows a diff and asks "Apply? [y/N]" before writing (bypass with --yes)
              - Replacement is scoped to the correct env block (not a global find-replace)
              - Warns if models.py has uncommitted git changes before writing
        """),
    )
    parser.add_argument("--env",        default=None,
                        help="comma-separated envs to scan: dev,dev-paid,staging,prod or 'all'  (interactive prompt if omitted)")
    parser.add_argument("--patch",      action="store_true",
                        help="update models.py for the selected envs")
    parser.add_argument("--allow-prod", action="store_true",
                        help="allow patching staging and prod (requires --patch)")
    parser.add_argument("--yes",        action="store_true",
                        help="skip confirmation prompt when patching")
    parser.add_argument("--json",       action="store_true",
                        help="output machine-readable JSON instead of the terminal report")
    parser.add_argument("--top",        type=int, default=5,
                        help="number of candidates to show per role (default 5)")
    args = parser.parse_args()

    # ── Resolve selected envs ────────────────────────────────────────────────
    if args.env:
        # Non-interactive: --env flag provided
        if args.env.strip().lower() == "all":
            selected_envs = set(_ENV_ORDER)
        else:
            selected_envs = {e.strip() for e in args.env.split(",") if e.strip() in _ENV_ORDER}
            invalid = {e.strip() for e in args.env.split(",") if e.strip() not in _ENV_ORDER}
            if invalid:
                print(red(f"Unknown env(s): {', '.join(invalid)}. Valid: {', '.join(_ENV_ORDER)}"),
                      file=sys.stderr)
                sys.exit(1)
    elif args.yes or args.json:
        # Non-interactive mode (piped / scripted) — default to all
        selected_envs = set(_ENV_ORDER)
    else:
        # Interactive: ask the user
        selected_envs = _prompt_env_selection(patch_mode=args.patch)

    # ── Load API key ─────────────────────────────────────────────────────────
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
        print(red("Error: OPENROUTER_API_KEY not set. Export it or add it to agents/.env"),
              file=sys.stderr)
        sys.exit(1)

    # ── Fetch + score ────────────────────────────────────────────────────────
    print(dim(f"Fetching model catalog from OpenRouter…"), file=sys.stderr)
    models = fetch_models(api_key)
    print(dim(f"  {len(models)} models loaded.  Scanning: {', '.join(sorted(selected_envs))}"),
          file=sys.stderr)

    recs = build_recommendations(models)
    # Filter recommendations to selected envs
    recs = [r for r in recs if r.env in selected_envs]

    # ── Output ───────────────────────────────────────────────────────────────
    if args.json:
        output = {
            "scanned_envs":  sorted(selected_envs),
            "total_models":  len(models),
            "free_models":   sum(1 for m in models if m.is_free),
            "recommendations": [
                {
                    "env":        r.env,
                    "role":       r.role,
                    "current":    r.current_id,
                    "suggested":  r.suggested_id,
                    "score":      round(r.score, 1),
                    "cost_delta": r.cost_delta,
                    "reason":     r.reason,
                }
                for r in recs
            ],
            "top_free": {
                role: [
                    {"id": m.id, "score": round(s, 1), "context": m.context_length,
                     "has_tools": m.has_tools, "has_thinking": m.has_thinking}
                    for s, m in top_candidates(models, ROLE_CRITERIA[role], free_only=True, top_n=args.top)
                ]
                for role in ROLE_CRITERIA
                if "dev" in selected_envs  # top-free only relevant when dev is selected
            },
        }
        print(json.dumps(output, indent=2))
    else:
        render_report(models, recs)

    # ── Patch ────────────────────────────────────────────────────────────────
    if args.patch:
        # Gate: staging/prod need --allow-prod
        patch_envs = selected_envs - (_PROTECTED_ENVS if not args.allow_prod else set())
        if args.allow_prod:
            blocked = selected_envs & _PROTECTED_ENVS
            if blocked:
                print(yellow(f"⚠  --allow-prod set: {', '.join(sorted(blocked))} eligible for patching."))
        else:
            skipped = selected_envs & _PROTECTED_ENVS
            if skipped:
                print(dim(f"  {', '.join(sorted(skipped))} skipped (pass --allow-prod to include them)."))

        if patch_envs:
            print(bold("\nApplying patches…"))
            apply_patches(recs, allowed_envs=patch_envs, yes=args.yes)
        else:
            print(dim("No patchable envs selected."))


if __name__ == "__main__":
    main()
