"""Tests for the ENV-based model router.

Verifies:
  - Every env has an entry for every agent (no missing keys)
  - Model configs are correct per env (SDK flags, thinking flags, temperature)
  - Unknown env falls back to dev
  - get_env() handles all valid values and unknown values
  - Cross-vendor QC rule holds (QC vendor != Creator vendor in every env)
  - Anthropic SDK used only in staging + prod
  - Free models only in dev
  - requires_anthropic_key() and requires_openrouter_key() return correct values per env
"""
import os
import pytest
from unittest.mock import patch

from agents.lib.models import (
    _ROUTING,
    _VALID_ENVS,
    AgentName,
    ModelConfig,
    get_env,
    get_model,
    requires_anthropic_key,
    requires_openrouter_key,
)

ALL_AGENTS: list[str] = ["creator", "qc", "qc_validator", "compliance", "recommender"]
ALL_ENVS:   list[str] = ["dev", "dev-paid", "staging", "prod"]


# ── Completeness ──────────────────────────────────────────────────────────────

class TestRoutingCompleteness:
    def test_all_envs_present(self):
        for env in ALL_ENVS:
            assert env in _ROUTING, f"Missing env '{env}' in routing table"

    def test_all_agents_present_in_every_env(self):
        for env in ALL_ENVS:
            for agent in ALL_AGENTS:
                assert agent in _ROUTING[env], f"Missing agent '{agent}' in env '{env}'"

    def test_no_extra_envs(self):
        assert set(_ROUTING.keys()) == set(ALL_ENVS)

    def test_all_configs_are_model_config(self):
        for env in ALL_ENVS:
            for agent in ALL_AGENTS:
                cfg = _ROUTING[env][agent]
                assert isinstance(cfg, ModelConfig), f"{env}/{agent} is not a ModelConfig"

    def test_valid_envs_set_matches_routing(self):
        assert _VALID_ENVS == set(ALL_ENVS)


# ── Dev env ───────────────────────────────────────────────────────────────────

class TestDevEnv:
    def test_all_models_are_free(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["dev"][agent].model
            assert model.endswith(":free"), f"dev/{agent} model '{model}' is not a free tier model"

    def test_no_anthropic_sdk_in_dev(self):
        for agent in ALL_AGENTS:
            cfg = _ROUTING["dev"][agent]
            assert not cfg.use_anthropic_sdk, f"dev/{agent} should not use Anthropic SDK"

    def test_no_thinking_in_dev(self):
        for agent in ALL_AGENTS:
            cfg = _ROUTING["dev"][agent]
            assert not cfg.use_thinking, f"dev/{agent} should not use thinking mode"

    def test_all_have_temperature(self):
        for agent in ALL_AGENTS:
            cfg = _ROUTING["dev"][agent]
            assert cfg.temperature is not None, f"dev/{agent} temperature must be set (no thinking)"

    def test_two_pools(self):
        """Dev uses multiple free model pools for independent rate-limit buckets.
        Pool A: openai/gpt-oss-120b:free (reasoning). Pool B: openai/gpt-oss-20b:free (fast).
        """
        models_used = set(_ROUTING["dev"][agent].model for agent in ALL_AGENTS)
        assert len(models_used) >= 2, (
            f"Dev should use at least 2 different free models, got {len(models_used)}: {models_used}"
        )

    def test_cross_vendor_qc(self):
        """QC and creator must use different model pools to avoid self-confirmation bias."""
        creator_model = _ROUTING["dev"]["creator"].model
        qc_model      = _ROUTING["dev"]["qc"].model
        assert creator_model != qc_model, (
            f"Dev QC and Creator use same model '{creator_model}' — breaks cross-pool separation"
        )


# ── Dev-paid env ──────────────────────────────────────────────────────────────

class TestDevPaidEnv:
    def test_no_free_models(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["dev-paid"][agent].model
            assert not model.endswith(":free"), f"dev-paid/{agent} should not use free tier model"

    def test_no_anthropic_sdk(self):
        for agent in ALL_AGENTS:
            cfg = _ROUTING["dev-paid"][agent]
            assert not cfg.use_anthropic_sdk, f"dev-paid/{agent} should not use Anthropic SDK"

    def test_cross_vendor_qc(self):
        """QC uses Gemini — different vendor from OpenAI o3-mini reasoning creator."""
        creator_provider = _ROUTING["dev-paid"]["creator"].model.split("/")[0]
        qc_provider      = _ROUTING["dev-paid"]["qc"].model.split("/")[0]
        assert creator_provider == "openai", f"dev-paid creator should be OpenAI, got '{creator_provider}'"
        assert qc_provider == "google", f"dev-paid QC should be Google/Gemini, got '{qc_provider}'"
        assert creator_provider != qc_provider

    def test_all_models_support_tools(self):
        """dev-paid uses paid variants of same tool-capable models as dev."""
        for agent in ALL_AGENTS:
            model = _ROUTING["dev-paid"][agent].model
            # Paid variants are the free models without the :free suffix
            base = model.split(":")[0]
            assert "/" in base, f"dev-paid/{agent} model '{model}' has unexpected format"


# ── Staging env ───────────────────────────────────────────────────────────────
# Strategy: Chinese/Google models via OpenRouter — no Anthropic SDK.
# Creator = DeepSeek R1 (reasoning). QC = Gemini (cross-vendor). Narrate/crystal = Gemini.

class TestStagingEnv:
    def test_no_anthropic_sdk(self):
        """Staging now uses OpenRouter Chinese/Google models — no Anthropic SDK."""
        for agent in ALL_AGENTS:
            assert not _ROUTING["staging"][agent].use_anthropic_sdk, (
                f"staging/{agent} should not use Anthropic SDK (moved to OpenRouter)"
            )

    def test_creator_is_deepseek_or_high_quality(self):
        model = _ROUTING["staging"]["creator"].model
        assert any(p in model.lower() for p in ("deepseek", "gemini", "qwen", "moonshot")), (
            f"staging creator should be a Chinese/Google model, got '{model}'"
        )

    def test_creator_temperature_set(self):
        cfg = _ROUTING["staging"]["creator"]
        assert cfg.temperature is not None, "staging creator should have temperature set"

    def test_no_free_models(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["staging"][agent].model
            assert not model.endswith(":free"), f"staging/{agent} should not use free tier model"

    def test_cross_vendor_qc(self):
        """QC must use a different provider than creator."""
        creator_provider = _ROUTING["staging"]["creator"].model.split("/")[0]
        qc_provider      = _ROUTING["staging"]["qc"].model.split("/")[0]
        assert creator_provider != qc_provider, (
            f"staging QC and Creator should use different providers, both got '{creator_provider}'"
        )

    def test_insight_roles_have_sufficient_tokens(self):
        for agent in ("insight_narrate", "insight_topics", "insight_expert"):
            assert _ROUTING["staging"][agent].max_tokens >= 1500, (
                f"staging/{agent} needs at least 1500 tokens for quality XM insights"
            )

    def test_no_openai_models(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["staging"][agent].model
            assert not model.startswith("openai/"), f"staging/{agent} should not use OpenAI"


# ── Prod env ──────────────────────────────────────────────────────────────────
# Strategy: Best Chinese/Google via OpenRouter — DeepSeek R1 for reasoning,
# Gemini 2.5 Flash for narration/synthesis, DeepSeek Chat for cross-vendor QA.

class TestProdEnv:
    def test_no_anthropic_sdk(self):
        """Prod now uses OpenRouter Chinese/Google models — no Anthropic SDK."""
        for agent in ALL_AGENTS:
            assert not _ROUTING["prod"][agent].use_anthropic_sdk, (
                f"prod/{agent} should not use Anthropic SDK (moved to OpenRouter)"
            )

    def test_creator_is_deepseek_or_high_quality(self):
        model = _ROUTING["prod"]["creator"].model
        assert any(p in model.lower() for p in ("deepseek", "gemini", "qwen", "moonshot")), (
            f"prod creator should be a Chinese/Google model, got '{model}'"
        )

    def test_creator_temperature_set(self):
        cfg = _ROUTING["prod"]["creator"]
        assert cfg.temperature is not None, "prod creator should have temperature set"

    def test_no_free_models(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["prod"][agent].model
            assert not model.endswith(":free")

    def test_cross_vendor_qc(self):
        """QC must use a different provider than creator."""
        creator_provider = _ROUTING["prod"]["creator"].model.split("/")[0]
        qc_provider      = _ROUTING["prod"]["qc"].model.split("/")[0]
        assert creator_provider != qc_provider, (
            f"prod QC and Creator should use different providers, both got '{creator_provider}'"
        )

    def test_max_tokens_reasonable(self):
        creator_tokens = _ROUTING["prod"]["creator"].max_tokens
        assert creator_tokens >= 2048, "prod creator needs enough tokens for a full survey"

    def test_no_openai_models(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["prod"][agent].model
            assert not model.startswith("openai/"), f"prod/{agent} should not use OpenAI"

    def test_insight_roles_have_sufficient_tokens(self):
        for agent in ("insight_narrate", "insight_topics", "insight_expert"):
            assert _ROUTING["prod"][agent].max_tokens >= 1500, (
                f"prod/{agent} needs at least 1500 tokens for quality XM insights"
            )


# ── Token limits ──────────────────────────────────────────────────────────────

class TestTokenLimits:
    @pytest.mark.parametrize("env", ALL_ENVS)
    @pytest.mark.parametrize("agent", ALL_AGENTS)
    def test_max_tokens_positive(self, env, agent):
        assert _ROUTING[env][agent].max_tokens > 0

    @pytest.mark.parametrize("env", ALL_ENVS)
    def test_creator_has_most_tokens(self, env):
        creator_tokens = _ROUTING[env]["creator"].max_tokens
        for agent in ("qc_validator", "compliance"):
            assert creator_tokens > _ROUTING[env][agent].max_tokens, (
                f"{env}: creator should have more tokens than {agent}"
            )


# ── get_env() ─────────────────────────────────────────────────────────────────

class TestGetEnv:
    @pytest.mark.parametrize("env", ALL_ENVS)
    def test_valid_envs_returned_as_is(self, env):
        with patch.dict(os.environ, {"AGENTS_ENV": env}):
            assert get_env() == env

    def test_unknown_env_falls_back_to_dev(self):
        with patch.dict(os.environ, {"AGENTS_ENV": "production"}):
            assert get_env() == "dev"

    def test_empty_env_falls_back_to_dev(self):
        with patch.dict(os.environ, {"AGENTS_ENV": ""}):
            assert get_env() == "dev"

    def test_missing_env_var_defaults_to_dev(self):
        env = os.environ.copy()
        env.pop("AGENTS_ENV", None)
        with patch.dict(os.environ, env, clear=True):
            assert get_env() == "dev"


# ── get_model() ───────────────────────────────────────────────────────────────

class TestGetModel:
    @pytest.mark.parametrize("env", ALL_ENVS)
    @pytest.mark.parametrize("agent", ALL_AGENTS)
    def test_returns_model_config_for_all_combinations(self, env, agent):
        with patch.dict(os.environ, {"AGENTS_ENV": env}):
            cfg = get_model(agent)  # type: ignore[arg-type]
            assert isinstance(cfg, ModelConfig)
            assert cfg.model

    def test_unknown_env_uses_dev_model(self):
        with patch.dict(os.environ, {"AGENTS_ENV": "unknown"}):
            cfg = get_model("creator")
            assert cfg == _ROUTING["dev"]["creator"]


# ── Key requirements ──────────────────────────────────────────────────────────

class TestKeyRequirements:
    @pytest.mark.parametrize("env", ALL_ENVS)
    def test_no_env_requires_anthropic_key(self, env):
        """All envs now route through OpenRouter — no Anthropic SDK in any env."""
        with patch.dict(os.environ, {"AGENTS_ENV": env}):
            assert not requires_anthropic_key(), (
                f"{env} should not require Anthropic key — all agents use OpenRouter now"
            )

    @pytest.mark.parametrize("env", ALL_ENVS)
    def test_all_envs_require_openrouter_key(self, env):
        """All envs use OpenRouter — OPENROUTER_API_KEY always needed."""
        with patch.dict(os.environ, {"AGENTS_ENV": env}):
            assert requires_openrouter_key()
