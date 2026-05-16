"""ENV-based model router.

Provider strategy: Chinese + Google models via OpenRouter across all envs.
No OpenAI or Anthropic SDK — equivalent quality at significantly lower cost.

Environments:
  dev        Free OpenRouter models. Currently deepseek-r1:free (only stable free model).
             $0 cost. Use for local solo development.
  dev-paid   Cheapest Chinese/Google models. Gemini 2.5 Flash + DeepSeek Chat.
             Price caps: $0.50/1M (fast roles), $1/1M (medium), $2/1M (complex).
             ~$0.002–0.005/run. Use when 2+ devs test simultaneously.
  staging    Better Chinese/Google models. DeepSeek R1 for reasoning roles
             (insight_topics, insight_expert, creator), Gemini 2.5 Flash for narration,
             Gemini 2.0 Flash for fast structured roles. ~$0.010–0.020/run.
  prod       Best Chinese/Google within budget. Same providers as staging with
             larger token budgets and DeepSeek R1 for all high-reasoning roles.
             ~$0.020–0.040/run. Far cheaper than Opus 4.7 with comparable XM quality.

Cross-vendor QC rule (all envs):
  The QC agent always uses a DIFFERENT vendor than the Creator to avoid
  self-confirmation bias — a model reviewing its own vendor's output
  rates it more favourably. Creator=DeepSeek → QC=Gemini; Creator=Gemini → QC=DeepSeek.

Model routing via OpenRouter only (all envs):
  All models route through OpenRouter (https://openrouter.ai) using the
  openrouter.py async client. No Anthropic SDK calls in any env.
  OPENROUTER_API_KEY required. ANTHROPIC_API_KEY no longer needed.
"""
import os
from dataclasses import dataclass
from typing import Literal

AgentName = Literal["creator", "qc", "qc_validator", "compliance", "recommender", "skip-logic", "copilot", "insight_narrate", "insight_verify", "insight_topics", "crystal", "response_gen", "insight_expert", "insight_evaluate", "crystal_eval", "survey_bias", "survey_evaluate"]
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
    # 8-pool free-tier setup — each pool is a distinct rate-limit bucket.
    # All models verified live on OpenRouter free tier as of 2026-05-15.
    # Run `python -m agents.skills.openrouter_scan --check-stale` to verify.
    #
    # Pool | Model                                   | Strengths           | Roles
    # ─────┼─────────────────────────────────────────┼─────────────────────┼───────────────────────
    #  R1  | deepseek/deepseek-r1:free               | Reasoning + tools   | creator
    #  V4F | deepseek/deepseek-v4-flash:free          | Fast structured     | qc_validator, compliance, recommender, copilot
    #  Q80 | qwen/qwen3-next-80b-a3b-instruct:free   | XL reasoning, cross-vendor QC | qc, insight_topics
    #  GEM | google/gemma-4-31b-it:free              | Quality writing     | insight_narrate, crystal
    #  MMX | minimax/minimax-m2.5:free               | 1M ctx synthesis    | response_gen, insight_evaluate
    #  ARC | arcee-ai/trinity-large-thinking:free    | Thinking model      | insight_expert
    #  NNO | nvidia/nemotron-nano-9b-v2:free         | Ultra-fast, small   | insight_verify, crystal_eval
    #  QCD | qwen/qwen3-coder:free                   | Structured JSON     | survey_bias, survey_evaluate, skip-logic
    #
    "dev": {
        # R1 — Reasoning + tool use
        "creator":         ModelConfig("deepseek/deepseek-r1:free",                   max_tokens=2000, temperature=0.3),

        # V4Flash — Fast structured (tools for compliance/recommender/copilot)
        "qc_validator":    ModelConfig("deepseek/deepseek-v4-flash:free",             max_tokens=400,  temperature=0.1),
        "compliance":      ModelConfig("deepseek/deepseek-v4-flash:free",             max_tokens=600,  temperature=0.1),
        "recommender":     ModelConfig("deepseek/deepseek-v4-flash:free",             max_tokens=500,  temperature=0.4),
        "copilot":         ModelConfig("deepseek/deepseek-v4-flash:free",             max_tokens=1500, temperature=0.3),

        # Qwen 80B — Cross-vendor QC (different provider from deepseek!) + topic reasoning
        "qc":              ModelConfig("qwen/qwen3-next-80b-a3b-instruct:free",       max_tokens=1000, temperature=0.1),
        "insight_topics":  ModelConfig("qwen/qwen3-next-80b-a3b-instruct:free",       max_tokens=800,  temperature=0.0),

        # Gemma 4 31B — Quality instruction-following writing (Google, cross-vendor)
        "insight_narrate": ModelConfig("google/gemma-4-31b-it:free",                  max_tokens=800,  temperature=0.1),
        "crystal":         ModelConfig("google/gemma-4-31b-it:free",                  max_tokens=800,  temperature=0.3),

        # MiniMax M2.5 — 1M context window, excellent for large-batch synthesis
        "response_gen":    ModelConfig("minimax/minimax-m2.5:free",                   max_tokens=4000, temperature=0.7),
        "insight_evaluate":ModelConfig("minimax/minimax-m2.5:free",                   max_tokens=800,  temperature=0.0),

        # Arcee Trinity — Thinking model for XM domain expert reasoning
        "insight_expert":  ModelConfig("arcee-ai/trinity-large-thinking:free",        max_tokens=1000, temperature=0.1),

        # NVIDIA Nemotron Nano — Smallest/fastest for tiny-output verification
        "insight_verify":  ModelConfig("nvidia/nemotron-nano-9b-v2:free",             max_tokens=300,  temperature=0.0),
        "crystal_eval":    ModelConfig("nvidia/nemotron-nano-9b-v2:free",             max_tokens=500,  temperature=0.0),

        # Qwen3 Coder — Exceptional at structured JSON output (skip-logic branching rules, QA scoring)
        "skip-logic":      ModelConfig("qwen/qwen3-coder:free",                       max_tokens=1200, temperature=0.1),
        "survey_bias":     ModelConfig("qwen/qwen3-coder:free",                       max_tokens=800,  temperature=0.0),
        "survey_evaluate": ModelConfig("qwen/qwen3-coder:free",                       max_tokens=600,  temperature=0.0),
    },

    # ── dev-paid ─────────────────────────────────────────────────────────────────
    # Provider spread: Google (Gemini) / DeepSeek (Chinese)
    # Cross-vendor: Gemini Flash for creator/copilot/crystal, DeepSeek Chat for QC/validator/recommender.
    # ~$0.002–0.005 per full orchestration run.
    # ── dev-paid ─────────────────────────────────────────────────────────────────
    # Provider spread: Google (Gemini) for writing/synthesis, DeepSeek for reasoning/QC.
    # Cross-vendor: creator=Google → QC=DeepSeek.
    # ~$0.002–0.005 per full orchestration run.
    "dev-paid": {
        "creator":         ModelConfig("google/gemini-2.5-flash",      max_tokens=3000, temperature=0.3),
        "qc":              ModelConfig("deepseek/deepseek-chat",        max_tokens=1000, temperature=0.1),
        "qc_validator":    ModelConfig("google/gemini-2.0-flash-001",   max_tokens=400,  temperature=0.1),
        "compliance":      ModelConfig("google/gemini-2.0-flash-001",   max_tokens=600,  temperature=0.1),
        "recommender":     ModelConfig("deepseek/deepseek-chat",        max_tokens=600,  temperature=0.4),
        "skip-logic":      ModelConfig("google/gemini-2.0-flash-001",   max_tokens=1200, temperature=0.1),
        "copilot":         ModelConfig("google/gemini-2.5-flash",       max_tokens=2000, temperature=0.3),
        "insight_narrate": ModelConfig("google/gemini-2.5-flash",       max_tokens=1200, temperature=0.1),
        "insight_verify":  ModelConfig("google/gemini-2.0-flash-001",   max_tokens=400,  temperature=0.0),
        "insight_topics":  ModelConfig("deepseek/deepseek-chat",        max_tokens=2000, temperature=0.0),
        "crystal":         ModelConfig("google/gemini-2.5-flash",       max_tokens=1000, temperature=0.3),
        "response_gen":    ModelConfig("google/gemini-2.5-flash",       max_tokens=8000, temperature=0.8),
        "insight_expert":  ModelConfig("deepseek/deepseek-r1",          max_tokens=1500, temperature=0.1),
        "insight_evaluate":ModelConfig("google/gemini-2.0-flash-001",   max_tokens=1000, temperature=0.0),
        "crystal_eval":    ModelConfig("google/gemini-2.0-flash-001",   max_tokens=600,  temperature=0.0),
        "survey_bias":     ModelConfig("deepseek/deepseek-chat",        max_tokens=1000, temperature=0.0),
        "survey_evaluate": ModelConfig("deepseek/deepseek-chat",        max_tokens=800,  temperature=0.0),
    },

    # ── staging ──────────────────────────────────────────────────────────────────
    # Chinese/Google models via OpenRouter — no Anthropic SDK.
    # DeepSeek R1 for reasoning-heavy roles (creator, insight_topics, insight_expert).
    # Gemini 2.5 Flash for writing/synthesis (narrate, crystal, copilot, response_gen).
    # Gemini 2.0 Flash for fast structured roles (verify, evaluate, crystal_eval).
    # DeepSeek Chat for cross-vendor QC + QA roles (bias, evaluate).
    # ~$0.010–0.020 per full pipeline run. OPENROUTER_API_KEY required.
    "staging": {
        "creator":         ModelConfig(
            "deepseek/deepseek-r1",        # Strong reasoning for survey design — $0.55/1M
            max_tokens=5000,
            temperature=0.3,
        ),
        "qc":              ModelConfig(
            "google/gemini-2.5-flash",     # Cross-vendor from DeepSeek — $0.15/1M
            max_tokens=1000,
            temperature=0.1,
        ),
        "qc_validator":    ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=400,
            temperature=0.2,
        ),
        "compliance":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=600,
            temperature=0.1,
        ),
        "recommender":     ModelConfig(
            "qwen/qwen-2.5-72b-instruct",  # Multilingual XM recommendations — $0.90/1M
            max_tokens=800,
            temperature=0.4,
        ),
        "skip-logic":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=1200,
            temperature=0.1,
        ),
        "copilot":         ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=2000,
            temperature=0.3,
        ),
        "insight_narrate": ModelConfig(
            "google/gemini-2.5-flash",     # Quality XM narrative writing — $0.15/1M
            max_tokens=2000,
            temperature=0.1,
        ),
        "insight_verify":  ModelConfig(
            "google/gemini-2.0-flash-001", # Fast fact-check — $0.10/1M
            max_tokens=400,
            temperature=0.0,
        ),
        "insight_topics":  ModelConfig(
            "deepseek/deepseek-r1",        # Topic discovery needs reasoning — $0.55/1M
            max_tokens=2000,
            temperature=0.0,
        ),
        "crystal":         ModelConfig(
            "google/gemini-2.5-flash",     # XM Q&A synthesis — $0.15/1M
            max_tokens=1500,
            temperature=0.3,
        ),
        "response_gen":    ModelConfig(
            "google/gemini-2.5-flash",     # Bulk synthetic responses — $0.15/1M
            max_tokens=8000,
            temperature=0.8,
        ),
        "insight_expert":  ModelConfig("deepseek/deepseek-r1",        max_tokens=2000, temperature=0.1),  # NPS/CSAT/CX expert reasoning
        "insight_evaluate":ModelConfig("google/gemini-2.0-flash-001", max_tokens=1000, temperature=0.0),  # Fast set audit
        "crystal_eval":    ModelConfig("google/gemini-2.0-flash-001", max_tokens=600,  temperature=0.0),  # Fast hallucination check
        "survey_bias":     ModelConfig("deepseek/deepseek-chat",       max_tokens=1000, temperature=0.0),  # Cross-vendor QA
        "survey_evaluate": ModelConfig("deepseek/deepseek-chat",       max_tokens=800,  temperature=0.0),  # Cross-vendor QA
    },

    # ── prod ─────────────────────────────────────────────────────────────────────
    # Best Chinese/Google models via OpenRouter — no Anthropic SDK, no OpenAI.
    # DeepSeek R1 for all high-reasoning roles (creator, topics, expert).
    # Gemini 2.5 Flash for synthesis and conversation.
    # Gemini 2.0 Flash for fast structured validators.
    # DeepSeek Chat for cross-vendor QA (different pool from R1).
    # ~$0.020–0.040/run — 2–3× cheaper than Opus 4.7 equivalent, comparable XM quality.
    # OPENROUTER_API_KEY required. ANTHROPIC_API_KEY NOT required.
    "prod": {
        "creator":         ModelConfig(
            "deepseek/deepseek-r1",        # Best open-source reasoning — $0.55/1M input
            max_tokens=8000,               # Large output for complex multi-section surveys
            temperature=0.3,
        ),
        "qc":              ModelConfig(
            "google/gemini-2.5-flash",     # Cross-vendor from DeepSeek — $0.15/1M
            max_tokens=1000,
            temperature=0.1,
        ),
        "qc_validator":    ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=400,
            temperature=0.2,
        ),
        "compliance":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=600,
            temperature=0.1,
        ),
        "recommender":     ModelConfig(
            "qwen/qwen-2.5-72b-instruct",  # Multilingual XM expertise — $0.90/1M
            max_tokens=800,
            temperature=0.4,
        ),
        "skip-logic":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=1200,
            temperature=0.1,
        ),
        "copilot":         ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=2000,
            temperature=0.3,
        ),
        "insight_narrate": ModelConfig(
            "google/gemini-2.5-flash",     # Multilingual XM narrative quality — $0.15/1M
            max_tokens=2000,
            temperature=0.1,
        ),
        "insight_verify":  ModelConfig(
            "google/gemini-2.0-flash-001", # Fastest structured verifier — $0.10/1M
            max_tokens=400,
            temperature=0.0,
        ),
        "insight_topics":  ModelConfig(
            "deepseek/deepseek-r1",        # CX topic pattern recognition — $0.55/1M
            max_tokens=2000,
            temperature=0.0,
        ),
        "crystal":         ModelConfig(
            "google/gemini-2.5-flash",     # XM Q&A — multilingual + synthesis — $0.15/1M
            max_tokens=1500,
            temperature=0.3,
        ),
        "response_gen":    ModelConfig(
            "google/gemini-2.5-flash",     # Diverse XM persona generation — $0.15/1M
            max_tokens=8000,
            temperature=0.8,
        ),
        "insight_expert":  ModelConfig("deepseek/deepseek-r1",        max_tokens=2000, temperature=0.1),  # Domain NPS/CSAT/CX reasoning
        "insight_evaluate":ModelConfig("google/gemini-2.0-flash-001", max_tokens=1000, temperature=0.0),  # Fast quality audit
        "crystal_eval":    ModelConfig("google/gemini-2.0-flash-001", max_tokens=600,  temperature=0.0),  # Fast hallucination check
        "survey_bias":     ModelConfig("deepseek/deepseek-chat",       max_tokens=1000, temperature=0.0),  # Cross-vendor QA
        "survey_evaluate": ModelConfig("deepseek/deepseek-chat",       max_tokens=800,  temperature=0.0),  # Cross-vendor QA
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
    """True when the current env uses Anthropic SDK for any agent.
    All envs now route through OpenRouter — this always returns False.
    Kept for backwards-compatibility with startup health checks.
    """
    return any(
        getattr(cfg, "use_anthropic_sdk", False)
        for env_dict in _ROUTING.values()
        for cfg in env_dict.values()
        if env_dict is _ROUTING.get(get_env(), {})
    )


def requires_openrouter_key() -> bool:
    """True when the current env uses OpenRouter for any agent. Always True — all envs use OpenRouter."""
    return True
