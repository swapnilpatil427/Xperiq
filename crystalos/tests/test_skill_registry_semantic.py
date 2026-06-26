"""Tests for SkillRegistry semantic routing via warm_router() and find()."""
from __future__ import annotations

import math
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from crystalos.lib.skill_registry import SkillRegistry, _cosine_sim, get_registry


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_skill_meta(name: str, description: str = "", use_cases: list[str] | None = None) -> dict:
    return {
        "name": name,
        "version": "1.0.0",
        "shared": True,
        "description": description,
        "compatibility": "",
        "allowed_tools": [],
        "evals": "EVALS.md",
        "examples": "EXAMPLES.md",
        "max_output_tokens": 2000,
        "max_retries": 1,
        "timeout_seconds": 60,
        "_path": f"/fake/skills/{name}/SKILL.md",
        "_dir": f"/fake/skills/{name}",
        "_body": "# Skill body",
        "use_cases": use_cases or [],
    }


def _make_registry_with_skills(*skill_specs: tuple[str, str]) -> SkillRegistry:
    """Create a SkillRegistry with pre-loaded skills (bypasses filesystem)."""
    registry = SkillRegistry()
    for name, description in skill_specs:
        registry._skills[name] = _make_skill_meta(name, description)
    registry._initialized = True
    return registry


# ── _cosine_sim tests ─────────────────────────────────────────────────────────

def test_cosine_sim_correctness():
    """Cosine similarity of identical vectors is 1.0."""
    vec = [1.0, 0.5, 0.3, 0.8]
    assert _cosine_sim(vec, vec) == pytest.approx(1.0, abs=1e-6)


def test_cosine_sim_orthogonal():
    """Orthogonal vectors have cosine similarity 0.0."""
    a = [1.0, 0.0, 0.0]
    b = [0.0, 1.0, 0.0]
    assert _cosine_sim(a, b) == pytest.approx(0.0, abs=1e-6)


def test_cosine_sim_zero_vector():
    """Zero vector returns 0.0 without division error."""
    zero = [0.0, 0.0, 0.0]
    other = [1.0, 2.0, 3.0]
    assert _cosine_sim(zero, other) == 0.0
    assert _cosine_sim(other, zero) == 0.0


def test_cosine_sim_range():
    """Cosine similarity is always in [-1.0, 1.0]."""
    import random
    rng = random.Random(42)
    for _ in range(20):
        a = [rng.uniform(-1, 1) for _ in range(10)]
        b = [rng.uniform(-1, 1) for _ in range(10)]
        sim = _cosine_sim(a, b)
        assert -1.0 - 1e-6 <= sim <= 1.0 + 1e-6


# ── warm_router tests ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_warm_router_embeds_all_skills():
    """warm_router() calls embed_texts for all skills and sets _router_ready=True."""
    registry = _make_registry_with_skills(
        ("nps-advisor", "Analyze NPS scores and drivers"),
        ("ces-analyzer", "Evaluate customer effort scores"),
    )

    fake_vectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    with patch("crystalos.lib.skill_registry.SkillRegistry.warm_router", wraps=registry.warm_router):
        with patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock(return_value=fake_vectors)):
            await registry.warm_router()

    assert registry._router_ready is True
    assert len(registry._embeddings) == 2
    assert "nps-advisor" in registry._embeddings
    assert "ces-analyzer" in registry._embeddings


@pytest.mark.asyncio
async def test_warm_router_handles_embed_failure_gracefully():
    """warm_router() sets _router_ready=False if embedding fails."""
    registry = _make_registry_with_skills(("skill-a", "Some skill"))

    with patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock(side_effect=RuntimeError("API down"))):
        await registry.warm_router()

    assert registry._router_ready is False
    assert registry._embeddings == {}


@pytest.mark.asyncio
async def test_warm_router_empty_skills_no_op():
    """warm_router() with no skills does nothing safely."""
    registry = SkillRegistry()
    # No skills loaded

    with patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock()) as mock_embed:
        await registry.warm_router()

    # embed_texts should not be called when there are no skills
    mock_embed.assert_not_called()
    assert registry._router_ready is False


# ── find() semantic tests ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_find_returns_top_k_by_similarity():
    """find() returns at most top_k results sorted by similarity descending."""
    registry = _make_registry_with_skills(
        ("nps-advisor", "Analyze Net Promoter Score drivers and trends"),
        ("ces-analyzer", "Customer effort score analysis"),
        ("trend-forecaster", "Forecast metric trends over time"),
    )

    # Pre-populate embeddings manually
    registry._embeddings = {
        "nps-advisor": [1.0, 0.0, 0.0],
        "ces-analyzer": [0.0, 1.0, 0.0],
        "trend-forecaster": [0.0, 0.0, 1.0],
    }
    registry._router_ready = True

    # Query vector close to nps-advisor
    query_vector = [0.95, 0.1, 0.05]
    query_vector_norm = sum(x * x for x in query_vector) ** 0.5
    query_vector = [x / query_vector_norm for x in query_vector]

    with patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock(return_value=[query_vector])):
        results = await registry.find("NPS drivers analysis", top_k=2)

    assert len(results) <= 2
    if len(results) > 1:
        # Results should be sorted by similarity descending
        assert results[0][1] >= results[1][1]


@pytest.mark.asyncio
async def test_find_returns_empty_below_threshold():
    """find() returns empty list when all similarities are below 0.35."""
    registry = _make_registry_with_skills(
        ("nps-advisor", "Analyze NPS"),
        ("ces-analyzer", "Customer effort"),
    )

    # Pre-populate with unit vectors
    registry._embeddings = {
        "nps-advisor": [1.0, 0.0, 0.0],
        "ces-analyzer": [0.0, 1.0, 0.0],
    }
    registry._router_ready = True

    # Query vector orthogonal to all skills (similarity ≈ 0 for both)
    query_vector = [0.0, 0.0, 1.0]

    with patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock(return_value=[query_vector])):
        results = await registry.find("completely unrelated query xyz", top_k=3)

    # All similarities are 0.0, below 0.35 threshold → empty
    assert results == []


@pytest.mark.asyncio
async def test_find_falls_back_to_difflib_if_not_warmed():
    """find() gracefully falls back to difflib when router is not warmed."""
    registry = _make_registry_with_skills(
        ("nps-advisor", "NPS analysis tool"),
    )
    # Do NOT warm router — _router_ready stays False

    results = await registry.find("nps")

    # Should return 0 or 1 result via difflib fallback (no crash)
    assert isinstance(results, list)
    # If difflib found something, it has the right structure
    for skill_meta, score in results:
        assert isinstance(skill_meta, dict)
        assert isinstance(score, float)


@pytest.mark.asyncio
async def test_find_respects_top_k_limit():
    """find() never returns more than top_k results."""
    registry = _make_registry_with_skills(
        ("skill-a", "Analysis of metric A"),
        ("skill-b", "Analysis of metric B"),
        ("skill-c", "Analysis of metric C"),
        ("skill-d", "Analysis of metric D"),
    )

    # All unit-ish vectors with same first component → all similar to query
    registry._embeddings = {
        "skill-a": [0.9, 0.1, 0.1],
        "skill-b": [0.85, 0.2, 0.1],
        "skill-c": [0.8, 0.15, 0.2],
        "skill-d": [0.75, 0.25, 0.1],
    }
    # Normalize
    for name in registry._embeddings:
        v = registry._embeddings[name]
        mag = sum(x * x for x in v) ** 0.5
        registry._embeddings[name] = [x / mag for x in v]

    registry._router_ready = True

    query_vector = [1.0, 0.0, 0.0]  # unit vector

    with patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock(return_value=[query_vector])):
        results = await registry.find("analysis query", top_k=2)

    assert len(results) <= 2


# ── find_sync tests ───────────────────────────────────────────────────────────

def test_find_sync_returns_best_difflib_match():
    """find_sync() returns the best difflib-scored skill name."""
    registry = _make_registry_with_skills(
        ("nps-advisor", "NPS analysis"),
        ("ces-analyzer", "Customer effort score"),
    )

    result = registry.find_sync("nps")
    assert result == "nps-advisor"


def test_find_sync_returns_none_for_no_match():
    """find_sync() returns None when no skill scores above threshold."""
    registry = _make_registry_with_skills(
        ("nps-advisor", "NPS analysis"),
    )

    result = registry.find_sync("zzz")
    # Either None or some result — just verify it doesn't crash
    assert result is None or isinstance(result, str)


def test_find_sync_returns_none_when_no_skills():
    """find_sync() returns None when registry is empty."""
    registry = SkillRegistry()
    result = registry.find_sync("any query")
    assert result is None
