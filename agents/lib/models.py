"""ENV-based model router.

Environments:
  dev        Free OpenRouter models. 5 agents × 5 providers = independent rate-limit pools.
             $0 cost. Use for local solo development.
  dev-paid   Cheap but capable OpenRouter models. ~$0.001–0.003/run.
             Use when 2+ devs test simultaneously (free-tier limits hit fast).
  staging    Near-production quality. Anthropic SDK for creator (Sonnet), Haiku for the rest.
             ~$0.01/run. Use for pre-prod validation and QA.
  prod       Best-in-class. Opus 4.7 + adaptive thinking for creator, Haiku for support agents.
             ~$0.05–0.10/run. Use in production only.

Cross-vendor QC rule (all envs):
  The QC agent always uses a DIFFERENT vendor than the Creator to avoid
  self-confirmation bias — a model reviewing its own vendor's output
  rates it more favourably.

Anthropic SDK routing (staging + prod):
  Creator, QC Validator, Compliance, and Recommender call Anthropic directly
  for native tool use — more reliable structured output than JSON mode via OpenRouter.
  QC stays on OpenRouter (Gemini) to maintain cross-vendor independence.
"""
import os
from dataclasses import dataclass
from typing import Literal

AgentName = Literal["creator", "qc", "qc_validator", "compliance", "recommender", "skip-logic", "copilot"]
EnvName   = Literal["dev", "dev-paid", "staging", "prod"]

_VALID_ENVS = {"dev", "dev-paid", "staging", "prod"}


@dataclass(frozen=True)
class ModelConfig:
    model:             str
    max_tokens:        int
    temperature:       float | None  # None = omit (required for Opus 4.7 with thinking)
    use_anthropic_sdk: bool = False   # True = call Anthropic SDK directly (not via OpenRouter)
    use_thinking:      bool = False   # True = adaptive thinking (Opus 4.7 / Sonnet 4.6 only)


_ROUTING: dict[EnvName, dict[AgentName, ModelConfig]] = {

    # ── dev ─────────────────────────────────────────────────────────────────────
    # 5 different providers → 5 independent rate-limit pools → no cross-agent contention.
    # Provider spread: InclusionAI / Meta / NousResearch / Qwen / Nvidia
    # Smaller models (3B, 12B) preferred where possible — less rate-limit pressure on free tier.
    "dev": {
        "creator":      ModelConfig("inclusionai/ring-2.6-1t:free",              max_tokens=2000, temperature=0.3),
        "qc":           ModelConfig("google/gemma-3-12b-it:free",                max_tokens=1000, temperature=0.1),
        "qc_validator": ModelConfig("nousresearch/hermes-3-llama-3.1-405b:free", max_tokens=400,  temperature=0.1),
        "compliance":   ModelConfig("qwen/qwen3-coder:free",                     max_tokens=600,  temperature=0.1),
        "recommender":  ModelConfig("nvidia/nemotron-3-super-120b-a12b:free",    max_tokens=500,  temperature=0.4),
        "skip-logic":   ModelConfig("meta-llama/llama-3.3-70b-instruct:free",    max_tokens=1200, temperature=0.1),
        "copilot":      ModelConfig("meta-llama/llama-3.3-70b-instruct:free",    max_tokens=1500, temperature=0.3),
    },

    # ── dev-paid ─────────────────────────────────────────────────────────────────
    # Reliable paid models with confirmed tool support. Good for team sprints.
    # ~$0.001–0.003 per full orchestration run.
    # Provider spread: Google / Mistral / Qwen / DeepSeek
    # Cross-vendor: Gemini (Google) for creator, Mistral for QC.
    "dev-paid": {
        "creator":      ModelConfig("google/gemini-2.5-flash",                  max_tokens=2000, temperature=0.3),
        "qc":           ModelConfig("mistralai/mistral-small-3.2-24b-instruct", max_tokens=1000, temperature=0.1),
        "qc_validator": ModelConfig("qwen/qwen-2.5-72b-instruct",               max_tokens=400,  temperature=0.1),
        "compliance":   ModelConfig("google/gemini-2.0-flash-lite-001",         max_tokens=600,  temperature=0.1),
        "recommender":  ModelConfig("deepseek/deepseek-chat-v3-0324",           max_tokens=500,  temperature=0.4),
        "skip-logic":   ModelConfig("google/gemini-2.5-flash",                  max_tokens=1200, temperature=0.1),
        "copilot":      ModelConfig("google/gemini-2.5-flash",                  max_tokens=1500, temperature=0.3),
    },

    # ── staging ──────────────────────────────────────────────────────────────────
    # Near-prod quality. Sonnet 4.6 for creator (cheaper than Opus, still excellent).
    # QC on Gemini Flash (cross-vendor). Haiku for all support agents (fast + cheap).
    # Requires ANTHROPIC_API_KEY + OPENROUTER_API_KEY.
    # ~$0.008–0.015 per full orchestration run.
    "staging": {
        "creator":      ModelConfig(
            "claude-sonnet-4-6",
            max_tokens=3000,
            temperature=0.3,
            use_anthropic_sdk=True,
            use_thinking=True,      # Adaptive thinking on Sonnet 4.6 — good quality signal
        ),
        "qc":           ModelConfig(
            "google/gemini-2.0-flash",
            max_tokens=1000,
            temperature=0.1,
        ),
        "qc_validator": ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=400,
            temperature=0.2,
            use_anthropic_sdk=True,
        ),
        "compliance":   ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=600,
            temperature=0.1,
            use_anthropic_sdk=True,
        ),
        "recommender":  ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=600,
            temperature=0.4,
            use_anthropic_sdk=True,
        ),
        "skip-logic":   ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=1200,
            temperature=0.1,
            use_anthropic_sdk=True,
        ),
        "copilot":      ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=1500,
            temperature=0.3,
            use_anthropic_sdk=True,
        ),
    },

    # ── prod ─────────────────────────────────────────────────────────────────────
    # Best quality. Opus 4.7 + adaptive thinking for survey creation.
    # QC on Gemini 2.0 Flash (cross-vendor independence).
    # Haiku for all support agents (speed + cost).
    # Requires ANTHROPIC_API_KEY + OPENROUTER_API_KEY.
    # ~$0.05–0.10 per full orchestration run.
    "prod": {
        "creator":      ModelConfig(
            "claude-opus-4-7",
            max_tokens=4096,
            temperature=None,           # Must be omitted when using adaptive thinking on Opus 4.7
            use_anthropic_sdk=True,
            use_thinking=True,
        ),
        "qc":           ModelConfig(
            "google/gemini-2.0-flash",
            max_tokens=1000,
            temperature=0.1,
        ),
        "qc_validator": ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=400,
            temperature=0.2,
            use_anthropic_sdk=True,
        ),
        "compliance":   ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=600,
            temperature=0.1,
            use_anthropic_sdk=True,
        ),
        "recommender":  ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=600,
            temperature=0.4,
            use_anthropic_sdk=True,
        ),
        "skip-logic":   ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=1200,
            temperature=0.1,
            use_anthropic_sdk=True,
        ),
        "copilot":      ModelConfig(
            "claude-haiku-4-5-20251001",
            max_tokens=1500,
            temperature=0.3,
            use_anthropic_sdk=True,
        ),
    },
}

# Per-run hard token cap: protects against runaway LLM loops.
MAX_TOKENS_PER_RUN: int = int(os.getenv("MAX_TOKENS_PER_RUN", "50000"))

# Per-org daily spend cap in USD (0 = disabled)
MAX_DAILY_SPEND_USD: float = float(os.getenv("MAX_DAILY_SPEND_USD", "0"))


def get_model(agent: AgentName) -> ModelConfig:
    env = get_env()
    return _ROUTING[env][agent]


def get_env() -> EnvName:
    env = os.getenv("AGENTS_ENV", "dev")
    return env if env in _VALID_ENVS else "dev"  # type: ignore[return-value]


def requires_anthropic_key() -> bool:
    """True when the current env uses Anthropic SDK for any agent."""
    return get_env() in ("staging", "prod")


def requires_openrouter_key() -> bool:
    """True when the current env uses OpenRouter for any agent."""
    return get_env() in ("dev", "dev-paid", "staging", "prod")  # all envs use OpenRouter for QC
