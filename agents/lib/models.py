"""ENV-based model router.

Provider strategy: Chinese + Google models via OpenRouter across all envs.
No OpenAI or Anthropic SDK — equivalent quality at significantly lower cost.

Environments:
  dev        Free OpenRouter models. OpenAI OSS reasoning pools + cross-vendor free models.
             $0 cost. Use for local solo development.
  dev-paid   OpenAI reasoning + gpt-4.1-mini structured/writing + Claude Haiku 4.5 QC.
             ~$0.015–0.035/run. Paid tier, no free-pool rate limits.
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

AgentName = Literal["creator", "qc", "qc_validator", "compliance", "recommender", "skip-logic", "copilot", "insight_narrate", "insight_verify", "insight_topics", "crystal", "response_gen", "insight_expert", "insight_evaluate", "crystal_eval", "survey_bias", "survey_evaluate", "report_headline", "report_summary", "report_full"]
EnvName   = Literal["dev", "dev-paid", "staging", "prod"]

_VALID_ENVS = {"dev", "dev-paid", "staging", "prod"}


@dataclass(frozen=True)
class ModelConfig:
    model:             str
    max_tokens:        int
    temperature:       float | None  # None = omit (required for Opus 4.7 with thinking)
    use_anthropic_sdk: bool = False   # True = call Anthropic SDK directly (not via OpenRouter)
    use_thinking:      bool = False   # True = adaptive thinking (Opus 4.7 / Sonnet 4.6 only)
    context_window:    int  = 32_000  # tokens available for input context
    absa_concurrency:  int  = 3       # max parallel ABSA batches for this env
    absa_batch_size:   int  = 10      # texts per ABSA LLM call
    absa_cap:          int  = 100     # max new (un-enriched) texts to ABSA per pipeline run


_ROUTING: dict[EnvName, dict[AgentName, ModelConfig]] = {

    # ── dev ─────────────────────────────────────────────────────────────────────
    # 6-pool free-tier setup — each pool is a distinct rate-limit bucket.
    # Verified live on OpenRouter as of 2026-06-01. Run openrouter_scan --check-stale to verify.
    #
    # Pool | Model                                   | Strengths                    | Roles
    # ─────┼─────────────────────────────────────────┼──────────────────────────────┼────────────────────────────
    # OSS120 | openai/gpt-oss-120b:free              | OpenAI reasoning + tools     | creator, insight_topics/expert, report
    # OSS20  | openai/gpt-oss-20b:free               | Fast OpenAI reasoning        | qc_validator, compliance, recommender, copilot
    # Q80    | qwen/qwen3-next-80b-a3b-instruct:free | Cross-vendor QC + evaluation | qc, insight_evaluate
    # GEM    | google/gemma-4-31b-it:free            | Quality writing              | insight_narrate, crystal, report_headline
    # NNO    | nvidia/nemotron-nano-9b-v2:free       | Ultra-fast verify            | insight_verify, crystal_eval
    # QCD    | qwen/qwen3-coder:free                 | Structured JSON              | skip-logic, survey QA
    # KIMI   | moonshotai/kimi-k2.6:free             | Long-context synthesis       | response_gen
    #
    "dev": {
        # OSS-120B — OpenAI free reasoning pool (tools + reasoning param)
        "creator":         ModelConfig("openai/gpt-oss-120b:free",                     max_tokens=4000, temperature=0.3,  context_window=128_000),
        "insight_topics":  ModelConfig("openai/gpt-oss-120b:free",                     max_tokens=6000, temperature=0.0,  context_window=128_000),
        "insight_expert":  ModelConfig("openai/gpt-oss-120b:free",                     max_tokens=1000, temperature=0.1,  context_window=128_000),
        "report_summary":  ModelConfig("openai/gpt-oss-120b:free",                     max_tokens=6000, temperature=0.1,  context_window=128_000),
        "report_full":     ModelConfig("openai/gpt-oss-120b:free",                     max_tokens=30000, temperature=0.0, context_window=128_000),

        # OSS-20B — Fast OpenAI reasoning pool (separate rate-limit bucket from 120B)
        "qc_validator":    ModelConfig("openai/gpt-oss-20b:free",                      max_tokens=400,  temperature=0.1,  context_window=128_000),
        "compliance":      ModelConfig("openai/gpt-oss-20b:free",                      max_tokens=600,  temperature=0.1,  context_window=128_000),
        "recommender":     ModelConfig("openai/gpt-oss-20b:free",                      max_tokens=500,  temperature=0.4,  context_window=128_000),
        "copilot":         ModelConfig("openai/gpt-oss-20b:free",                      max_tokens=1500, temperature=0.3,  context_window=128_000),

        # Qwen 80B — Cross-vendor QC (OpenAI creator → Qwen reviewer)
        "qc":              ModelConfig("qwen/qwen3-next-80b-a3b-instruct:free",        max_tokens=1000, temperature=0.1,  context_window=262_144),
        "insight_evaluate":ModelConfig("qwen/qwen3-next-80b-a3b-instruct:free",        max_tokens=2500, temperature=0.0,  context_window=262_144),

        # Gemma 4 31B — Quality instruction-following writing (Google, cross-vendor)
        # ABSA uses this model via insight_narrate — dev free-tier tuning: concurrency=3, batch=10, cap=100
        "insight_narrate": ModelConfig("google/gemma-4-31b-it:free",                   max_tokens=800,  temperature=0.1,  context_window=262_144, absa_concurrency=3,  absa_batch_size=10, absa_cap=100),
        "crystal":         ModelConfig("google/gemma-4-31b-it:free",                   max_tokens=800,  temperature=0.3,  context_window=262_144),
        "report_headline": ModelConfig("google/gemma-4-31b-it:free",                   max_tokens=4000, temperature=0.1,  context_window=262_144),

        # Kimi K2.6 — Long-context synthetic response generation
        "response_gen":    ModelConfig("moonshotai/kimi-k2.6:free",                    max_tokens=6000, temperature=0.7,  context_window=262_144),

        # NVIDIA Nemotron Nano — Smallest/fastest for tiny-output verification
        "insight_verify":  ModelConfig("nvidia/nemotron-nano-9b-v2:free",              max_tokens=300,  temperature=0.0,  context_window=128_000),
        "crystal_eval":    ModelConfig("nvidia/nemotron-nano-9b-v2:free",              max_tokens=500,  temperature=0.0,  context_window=128_000),

        # Qwen3 Coder — Structured JSON output (skip-logic branching rules, QA scoring)
        "skip-logic":      ModelConfig("qwen/qwen3-coder:free",                        max_tokens=1200, temperature=0.1,  context_window=1_048_576),
        "survey_bias":     ModelConfig("qwen/qwen3-coder:free",                        max_tokens=800,  temperature=0.0,  context_window=1_048_576),
        "survey_evaluate": ModelConfig("qwen/qwen3-coder:free",                        max_tokens=600,  temperature=0.0,  context_window=1_048_576),
    },

    # ── dev-paid ─────────────────────────────────────────────────────────────────
    # o3-mini for deep reasoning (report_full, creator, insight_topics).
    # o4-mini for mid-reasoning + writing (expert, copilot, summary).
    # Gemini 2.5 Flash for fast synthesis/writing + cross-vendor QC.
    # Gemini 2.0 Flash for structured validators + ABSA.
    #
    # Tier | Model                   $/1M in  $/1M out  Used for
    # ─────┼────────────────────────────────────────────────────────────────────
    #  A   | openai/o3-mini          $1.10    $4.40     creator, topics, report_full
    #  B   | openai/o4-mini          $1.10    $4.40     expert, copilot, report_summary
    #  C   | google/gemini-2.5-flash $0.15    $0.60     narrate, crystal, writing, QC
    #  D   | google/gemini-2.0-flash $0.10    $0.40     verify, evaluate, QA, ABSA
    #
    # ~$0.015–0.035 per full orchestration run.
    "dev-paid": {
        # Tier A — o3-mini: deep reasoning, long-context report generation
        "creator":         ModelConfig("openai/o3-mini",          max_tokens=6000,  temperature=0.3,  context_window=200_000),
        "insight_topics":  ModelConfig("openai/o3-mini",          max_tokens=8000,  temperature=0.0,  context_window=200_000),
        "report_full":     ModelConfig("openai/o3-mini",          max_tokens=60000, temperature=0.0,  context_window=200_000),

        # Tier B — o4-mini: mid-reasoning, expert narration, interactive copilot
        "insight_expert":  ModelConfig("openai/o4-mini",          max_tokens=2000,  temperature=0.1,  context_window=200_000),
        "report_summary":  ModelConfig("openai/o4-mini",          max_tokens=12000, temperature=0.1,  context_window=200_000),
        "copilot":         ModelConfig("openai/o4-mini",          max_tokens=3000,  temperature=0.3,  context_window=200_000),

        # Cross-vendor QC (Google vs OpenAI creator)
        "qc":              ModelConfig("google/gemini-2.5-flash",  max_tokens=1000, temperature=0.1,  context_window=1_000_000),

        # Tier B — Gemini 2.5 Flash: fast structured + quality writing
        "qc_validator":    ModelConfig("google/gemini-2.5-flash",  max_tokens=400,  temperature=0.1,  context_window=1_000_000),
        "compliance":      ModelConfig("google/gemini-2.5-flash",  max_tokens=600,  temperature=0.1,  context_window=1_000_000),
        "recommender":     ModelConfig("google/gemini-2.5-flash",  max_tokens=600,  temperature=0.4,  context_window=1_000_000),
        "skip-logic":      ModelConfig("google/gemini-2.5-flash",  max_tokens=1200, temperature=0.1,  context_window=1_000_000),
        "report_headline": ModelConfig("google/gemini-2.5-flash",  max_tokens=5000, temperature=0.1,  context_window=1_000_000),
        "crystal":         ModelConfig("google/gemini-2.5-flash",  max_tokens=1500, temperature=0.3,  context_window=1_000_000),
        "response_gen":    ModelConfig("google/gemini-2.5-flash",  max_tokens=8000, temperature=0.8,  context_window=1_000_000),

        # Tier C — Gemini 2.0 Flash: fast structured validators + ABSA
        # absa_concurrency=5, batch=25, cap=250 for dev-paid throughput
        "insight_narrate": ModelConfig("google/gemini-2.0-flash", max_tokens=1200, temperature=0.1, context_window=1_000_000, absa_concurrency=5, absa_batch_size=25, absa_cap=250),
        "insight_verify":  ModelConfig("google/gemini-2.0-flash", max_tokens=400,  temperature=0.0, context_window=1_000_000),
        "insight_evaluate":ModelConfig("google/gemini-2.0-flash", max_tokens=2500, temperature=0.0, context_window=1_000_000),
        "crystal_eval":    ModelConfig("google/gemini-2.0-flash", max_tokens=600,  temperature=0.0, context_window=1_000_000),
        "survey_bias":     ModelConfig("google/gemini-2.0-flash", max_tokens=1000, temperature=0.0, context_window=1_000_000),
        "survey_evaluate": ModelConfig("google/gemini-2.0-flash", max_tokens=800,  temperature=0.0, context_window=1_000_000),
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
            context_window=128_000,
        ),
        "qc":              ModelConfig(
            "google/gemini-2.5-flash",     # Cross-vendor from DeepSeek — $0.15/1M
            max_tokens=1000,
            temperature=0.1,
            context_window=1_000_000,
        ),
        "qc_validator":    ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=400,
            temperature=0.2,
            context_window=1_000_000,
        ),
        "compliance":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=600,
            temperature=0.1,
            context_window=1_000_000,
        ),
        "recommender":     ModelConfig(
            "qwen/qwen-2.5-72b-instruct",  # Multilingual XM recommendations — $0.90/1M
            max_tokens=800,
            temperature=0.4,
            context_window=32_000,
        ),
        "skip-logic":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=1200,
            temperature=0.1,
            context_window=1_000_000,
        ),
        "copilot":         ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=2000,
            temperature=0.3,
            context_window=1_000_000,
        ),
        # ABSA uses this model via insight_narrate — staging tuning: concurrency=8, batch=25, cap=500
        "insight_narrate": ModelConfig(
            "google/gemini-2.5-flash",     # Quality XM narrative writing — $0.15/1M
            max_tokens=2000,
            temperature=0.1,
            context_window=1_000_000,
            absa_concurrency=8,
            absa_batch_size=25,
            absa_cap=500,
        ),
        "insight_verify":  ModelConfig(
            "google/gemini-2.0-flash", # Fast fact-check — $0.10/1M
            max_tokens=400,
            temperature=0.0,
            context_window=1_000_000,
        ),
        "insight_topics":  ModelConfig(
            "deepseek/deepseek-r1",        # Topic discovery needs reasoning — $0.55/1M
            max_tokens=8000,
            temperature=0.0,
            context_window=128_000,
        ),
        "crystal":         ModelConfig(
            "google/gemini-2.5-flash",     # XM Q&A synthesis — $0.15/1M
            max_tokens=1500,
            temperature=0.3,
            context_window=1_000_000,
        ),
        "response_gen":    ModelConfig(
            "google/gemini-2.5-flash",     # Bulk synthetic responses — $0.15/1M
            max_tokens=8000,
            temperature=0.8,
            context_window=1_000_000,
        ),
        "insight_expert":  ModelConfig("deepseek/deepseek-r1",        max_tokens=2000, temperature=0.1, context_window=128_000),   # NPS/CSAT/CX expert reasoning
        "insight_evaluate":ModelConfig("google/gemini-2.0-flash", max_tokens=2500, temperature=0.0, context_window=1_000_000),  # Larger set audit for 50-response surveys
        "crystal_eval":    ModelConfig("google/gemini-2.0-flash", max_tokens=600,  temperature=0.0, context_window=1_000_000),  # Fast hallucination check
        "survey_bias":     ModelConfig("deepseek/deepseek-chat",       max_tokens=1000, temperature=0.0, context_window=64_000),    # Cross-vendor QA
        "survey_evaluate": ModelConfig("deepseek/deepseek-chat",       max_tokens=800,  temperature=0.0, context_window=64_000),    # Cross-vendor QA

        # Tiered report agents (staging: DeepSeek R1 for full report reasoning)
        # report_full token budget increased — larger context now: prior insights + all new responses
        "report_headline": ModelConfig("google/gemini-2.5-flash",      max_tokens=5000,  temperature=0.1, context_window=1_000_000),
        "report_summary":  ModelConfig("deepseek/deepseek-r1",         max_tokens=12000, temperature=0.1, context_window=128_000),
        "report_full":     ModelConfig("deepseek/deepseek-r1",         max_tokens=60000, temperature=0.0, context_window=128_000),
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
            context_window=128_000,
        ),
        "qc":              ModelConfig(
            "google/gemini-2.5-flash",     # Cross-vendor from DeepSeek — $0.15/1M
            max_tokens=1000,
            temperature=0.1,
            context_window=1_000_000,
        ),
        "qc_validator":    ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=400,
            temperature=0.2,
            context_window=1_000_000,
        ),
        "compliance":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=600,
            temperature=0.1,
            context_window=1_000_000,
        ),
        "recommender":     ModelConfig(
            "qwen/qwen-2.5-72b-instruct",  # Multilingual XM expertise — $0.90/1M
            max_tokens=800,
            temperature=0.4,
            context_window=32_000,
        ),
        "skip-logic":      ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=1200,
            temperature=0.1,
            context_window=1_000_000,
        ),
        "copilot":         ModelConfig(
            "google/gemini-2.5-flash",
            max_tokens=2000,
            temperature=0.3,
            context_window=1_000_000,
        ),
        # ABSA uses this model via insight_narrate — prod tuning: concurrency=10, batch=50, cap=1000
        "insight_narrate": ModelConfig(
            "google/gemini-2.5-flash",     # Multilingual XM narrative quality — $0.15/1M
            max_tokens=2000,
            temperature=0.1,
            context_window=1_000_000,
            absa_concurrency=10,
            absa_batch_size=50,
            absa_cap=1000,
        ),
        "insight_verify":  ModelConfig(
            "google/gemini-2.0-flash", # Fastest structured verifier — $0.10/1M
            max_tokens=400,
            temperature=0.0,
            context_window=1_000_000,
        ),
        "insight_topics":  ModelConfig(
            "deepseek/deepseek-r1",        # CX topic pattern recognition — $0.55/1M
            max_tokens=8000,
            temperature=0.0,
            context_window=128_000,
        ),
        "crystal":         ModelConfig(
            "google/gemini-2.5-flash",     # XM Q&A — multilingual + synthesis — $0.15/1M
            max_tokens=1500,
            temperature=0.3,
            context_window=1_000_000,
        ),
        "response_gen":    ModelConfig(
            "google/gemini-2.5-flash",     # Diverse XM persona generation — $0.15/1M
            max_tokens=8000,
            temperature=0.8,
            context_window=1_000_000,
        ),
        "insight_expert":  ModelConfig("deepseek/deepseek-r1",        max_tokens=2000, temperature=0.1, context_window=128_000),   # Domain NPS/CSAT/CX reasoning
        "insight_evaluate":ModelConfig("google/gemini-2.0-flash", max_tokens=2500, temperature=0.0, context_window=1_000_000),  # Larger set audit for 50-response surveys
        "crystal_eval":    ModelConfig("google/gemini-2.0-flash", max_tokens=600,  temperature=0.0, context_window=1_000_000),  # Fast hallucination check
        "survey_bias":     ModelConfig("deepseek/deepseek-chat",       max_tokens=1000, temperature=0.0, context_window=64_000),    # Cross-vendor QA
        "survey_evaluate": ModelConfig("deepseek/deepseek-chat",       max_tokens=800,  temperature=0.0, context_window=64_000),    # Cross-vendor QA

        # Tiered report agents (prod: DeepSeek R1 full report, Gemini 2.5 Flash for headline/summary)
        # report_full token budget increased — larger context: prior insights + all new response texts
        "report_headline": ModelConfig("google/gemini-2.5-flash",      max_tokens=5000,  temperature=0.1, context_window=1_000_000),
        "report_summary":  ModelConfig("deepseek/deepseek-r1",         max_tokens=12000, temperature=0.1, context_window=128_000),
        "report_full":     ModelConfig("deepseek/deepseek-r1",         max_tokens=60000, temperature=0.0, context_window=128_000),
    },
}

# Per-run hard token cap: protects against runaway LLM loops.
# Increased for larger report context: report_full (60K) + topics (8K) + narrate (5×800) + ABSA batches.
MAX_TOKENS_PER_RUN: int = int(os.getenv("MAX_TOKENS_PER_RUN", "200000"))

# Per-org daily spend cap in USD (0 = disabled)
MAX_DAILY_SPEND_USD: float = float(os.getenv("MAX_DAILY_SPEND_USD", "0"))


def get_model(agent: AgentName) -> ModelConfig:
    env = get_env()
    return _ROUTING[env][agent]


def get_absa_config() -> dict:
    """Return ABSA tuning params for the current env from the insight_narrate model config."""
    cfg = get_model("insight_narrate")
    return {
        "batch_size":     cfg.absa_batch_size,
        "concurrency":    cfg.absa_concurrency,
        "cap":            cfg.absa_cap,
        "context_window": cfg.context_window,
    }


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
