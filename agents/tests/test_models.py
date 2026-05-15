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

    def test_five_different_providers(self):
        """Each dev agent uses a different provider for independent rate-limit pools."""
        providers = set()
        for agent in ALL_AGENTS:
            model = _ROUTING["dev"][agent].model
            provider = model.split("/")[0]
            providers.add(provider)
        assert len(providers) == 5, (
            f"Dev should use 5 different providers, got {len(providers)}: {providers}"
        )

    def test_cross_vendor_qc(self):
        creator_provider = _ROUTING["dev"]["creator"].model.split("/")[0]
        qc_provider      = _ROUTING["dev"]["qc"].model.split("/")[0]
        assert creator_provider != qc_provider, (
            f"Dev QC and Creator use same provider '{creator_provider}' — breaks cross-vendor review"
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
        creator_provider = _ROUTING["dev-paid"]["creator"].model.split("/")[0]
        qc_provider      = _ROUTING["dev-paid"]["qc"].model.split("/")[0]
        assert creator_provider != qc_provider, (
            f"dev-paid QC ({qc_provider}) and Creator ({creator_provider}) use same provider — breaks cross-vendor review"
        )

    def test_all_models_support_tools(self):
        """dev-paid uses paid variants of same tool-capable models as dev."""
        for agent in ALL_AGENTS:
            model = _ROUTING["dev-paid"][agent].model
            # Paid variants are the free models without the :free suffix
            base = model.split(":")[0]
            assert "/" in base, f"dev-paid/{agent} model '{model}' has unexpected format"


# ── Staging env ───────────────────────────────────────────────────────────────

class TestStagingEnv:
    def test_creator_uses_anthropic_sdk(self):
        assert _ROUTING["staging"]["creator"].use_anthropic_sdk

    def test_creator_uses_thinking(self):
        assert _ROUTING["staging"]["creator"].use_thinking

    def test_creator_temperature_allowed(self):
        """Sonnet 4.6 supports adaptive thinking WITH temperature (unlike Opus 4.7)."""
        cfg = _ROUTING["staging"]["creator"]
        assert cfg.temperature is not None, (
            "Sonnet 4.6 allows temperature with adaptive thinking — should be set"
        )

    def test_qc_does_not_use_anthropic_sdk(self):
        """QC must stay on OpenRouter (Gemini) for cross-vendor independence."""
        assert not _ROUTING["staging"]["qc"].use_anthropic_sdk

    def test_support_agents_use_anthropic_sdk(self):
        for agent in ("qc_validator", "compliance", "recommender"):
            assert _ROUTING["staging"][agent].use_anthropic_sdk, (
                f"staging/{agent} should use Anthropic SDK"
            )

    def test_no_free_models(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["staging"][agent].model
            assert not model.endswith(":free"), f"staging/{agent} should not use free tier model"

    def test_creator_is_sonnet(self):
        model = _ROUTING["staging"]["creator"].model
        assert "sonnet" in model.lower(), f"staging creator should be Sonnet, got '{model}'"

    def test_cross_vendor_qc(self):
        creator_provider = "anthropic"  # SDK means Anthropic
        qc_model         = _ROUTING["staging"]["qc"].model
        assert "anthropic" not in qc_model.lower() and "claude" not in qc_model.lower(), (
            "staging QC must not be an Anthropic model — cross-vendor rule"
        )


# ── Prod env ──────────────────────────────────────────────────────────────────

class TestProdEnv:
    def test_creator_uses_anthropic_sdk(self):
        assert _ROUTING["prod"]["creator"].use_anthropic_sdk

    def test_creator_uses_thinking(self):
        assert _ROUTING["prod"]["creator"].use_thinking

    def test_creator_temperature_is_none(self):
        """Opus 4.7 with adaptive thinking must omit temperature."""
        assert _ROUTING["prod"]["creator"].temperature is None

    def test_creator_is_opus(self):
        model = _ROUTING["prod"]["creator"].model
        assert "opus" in model.lower(), f"prod creator should be Opus, got '{model}'"

    def test_qc_does_not_use_anthropic_sdk(self):
        """QC must stay on OpenRouter (Gemini) for cross-vendor independence."""
        assert not _ROUTING["prod"]["qc"].use_anthropic_sdk

    def test_support_agents_use_anthropic_sdk(self):
        for agent in ("qc_validator", "compliance", "recommender"):
            assert _ROUTING["prod"][agent].use_anthropic_sdk

    def test_no_free_models(self):
        for agent in ALL_AGENTS:
            model = _ROUTING["prod"][agent].model
            assert not model.endswith(":free")

    def test_cross_vendor_qc(self):
        qc_model = _ROUTING["prod"]["qc"].model
        assert "claude" not in qc_model.lower() and "anthropic" not in qc_model.lower(), (
            "prod QC must not be an Anthropic model — cross-vendor rule"
        )

    def test_max_tokens_reasonable(self):
        creator_tokens = _ROUTING["prod"]["creator"].max_tokens
        assert creator_tokens >= 2048, "prod creator needs enough tokens for a full survey"


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
    def test_dev_does_not_require_anthropic_key(self):
        with patch.dict(os.environ, {"AGENTS_ENV": "dev"}):
            assert not requires_anthropic_key()

    def test_dev_paid_does_not_require_anthropic_key(self):
        with patch.dict(os.environ, {"AGENTS_ENV": "dev-paid"}):
            assert not requires_anthropic_key()

    def test_staging_requires_anthropic_key(self):
        with patch.dict(os.environ, {"AGENTS_ENV": "staging"}):
            assert requires_anthropic_key()

    def test_prod_requires_anthropic_key(self):
        with patch.dict(os.environ, {"AGENTS_ENV": "prod"}):
            assert requires_anthropic_key()

    @pytest.mark.parametrize("env", ALL_ENVS)
    def test_all_envs_require_openrouter_key(self, env):
        """QC uses OpenRouter in every env — OPENROUTER_API_KEY always needed."""
        with patch.dict(os.environ, {"AGENTS_ENV": env}):
            assert requires_openrouter_key()
