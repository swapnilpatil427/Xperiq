"""Credit / token accounting for agent runs.

Tracks token usage and estimated USD cost per LLM call.
Aggregated at the run level in the agent_runs table.

Cost table is approximate — update when pricing changes.
All costs in USD per 1M tokens (input + output blended).
"""
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from crystalos.lib.models import MAX_TOKENS_PER_RUN


# USD per 1K tokens (input/output averaged; update as needed)
_COST_PER_1K: dict[str, float] = {
    # Free models
    "deepseek/deepseek-r1:free":           0.0,
    "google/gemini-2.0-flash-lite:free":   0.0,
    # Dev-paid
    "deepseek/deepseek-v3":                0.00028,
    "google/gemini-2.0-flash-lite":        0.000038,
    # Prod — OpenRouter-routed
    "google/gemini-2.0-flash":             0.000075,
    # Prod — direct Anthropic SDK
    "claude-opus-4-7":                     0.015,   # $5 in / $25 out → $15 blended per 1M
    "claude-haiku-4-5-20251001":           0.003,   # direct Anthropic SDK (legacy, kept for cost tracking)
    "claude-sonnet-4-6":                   0.009,   # $3 in / $15 out → $9 blended per 1M
    # Legacy OpenRouter Anthropic routes (kept for backward compat)
    "anthropic/claude-3.5-sonnet":         0.003,
    "anthropic/claude-3.5-haiku":          0.0008,
}


@dataclass
class CreditEntry:
    agent:         str
    model:         str
    input_tokens:  int
    output_tokens: int
    cost_usd:      float
    timestamp:     str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    thinking_text: str | None = None

    @classmethod
    def from_usage(cls, agent: str, model: str, usage: dict[str, Any]) -> "CreditEntry":
        input_t  = usage["prompt_tokens"] if "prompt_tokens" in usage else usage.get("input_tokens", 0)
        output_t = usage["completion_tokens"] if "completion_tokens" in usage else usage.get("output_tokens", 0)
        total_t  = input_t + output_t
        rate     = _COST_PER_1K.get(model, 0.001)   # default $1/1K for unknown models
        cost     = (total_t / 1000) * rate
        return cls(
            agent=agent,
            model=model,
            input_tokens=input_t,
            output_tokens=output_t,
            cost_usd=round(cost, 8),
        )

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "agent":         self.agent,
            "model":         self.model,
            "input_tokens":  self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd":      self.cost_usd,
            "timestamp":     self.timestamp,
        }
        if self.thinking_text:
            d["thinking_summary"] = self.thinking_text[:500]
        return d


class BudgetExceededError(Exception):
    """Raised when a run's token usage would exceed MAX_TOKENS_PER_RUN."""


def check_budget(current_tokens: int, new_tokens: int) -> None:
    """Raise BudgetExceededError if adding new_tokens would breach the cap."""
    if MAX_TOKENS_PER_RUN > 0 and (current_tokens + new_tokens) > MAX_TOKENS_PER_RUN:
        raise BudgetExceededError(
            f"Token budget exceeded: {current_tokens + new_tokens} > {MAX_TOKENS_PER_RUN}. "
            "Increase MAX_TOKENS_PER_RUN or reduce prompt size."
        )


def summarise_credits(credit_log: list[dict[str, Any]]) -> dict[str, Any]:
    total_tokens = sum(e.get("input_tokens", 0) + e.get("output_tokens", 0) for e in credit_log)
    total_cost   = sum(e.get("cost_usd", 0.0) for e in credit_log)
    by_agent: dict[str, Any] = {}
    for e in credit_log:
        key = e["agent"]
        if key not in by_agent:
            by_agent[key] = {"tokens": 0, "cost_usd": 0.0, "model": e["model"]}
        by_agent[key]["tokens"]   += e.get("input_tokens", 0) + e.get("output_tokens", 0)
        by_agent[key]["cost_usd"] += e.get("cost_usd", 0.0)
    return {
        "total_tokens":   total_tokens,
        "total_cost_usd": round(total_cost, 8),
        "by_agent":       by_agent,
    }


def format_cost_display(cost_usd: float, total_tokens: int) -> str:
    """Human-readable credit summary for Copilot chat footer."""
    if cost_usd == 0:
        return f"~{total_tokens:,} tokens · free tier"
    if cost_usd < 0.001:
        return f"~{total_tokens:,} tokens · <$0.001"
    return f"~{total_tokens:,} tokens · ${cost_usd:.4f}"
