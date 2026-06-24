"""Tests for agents/lib/hallucination_scorer.py"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from crystalos.lib.hallucination_scorer import (
    HallucinationScore,
    _extract_numbers,
    _flatten_values,
    _numbers_close,
    _score_to_verdict,
    score_crystal_response,
    score_insight,
)


# ── Utility functions ──────────────────────────────────────────────────────────

def test_extract_numbers_basic():
    numbers = _extract_numbers("NPS is 42 and CSAT is 4.2")
    assert 42.0 in numbers
    assert 4.2 in numbers


def test_extract_numbers_empty():
    assert _extract_numbers("No numbers here") == []


def test_flatten_values_dict():
    data = {"nps": 42, "csat": 4.2, "label": "good"}
    nums = _flatten_values(data)
    assert 42.0 in nums
    assert 4.2 in nums


def test_flatten_values_nested():
    data = {"metrics": {"nps": {"score": 35}, "csat": {"score": 4.5}}}
    nums = _flatten_values(data)
    assert 35.0 in nums
    assert 4.5 in nums


def test_numbers_close_same():
    assert _numbers_close(42.0, 42.0) is True


def test_numbers_close_within_tolerance():
    assert _numbers_close(42.0, 42.5) is True  # Within 5% of 42.5


def test_numbers_close_outside_tolerance():
    assert _numbers_close(42.0, 100.0) is False


def test_numbers_close_zero_denominator():
    assert _numbers_close(0.0, 0.0) is True


def test_score_to_verdict_pass():
    verdict = _score_to_verdict(0.85, 0.6, 0.8)
    assert verdict == "pass"


def test_score_to_verdict_flag():
    verdict = _score_to_verdict(0.70, 0.6, 0.8)
    assert verdict == "flag"


def test_score_to_verdict_fail():
    verdict = _score_to_verdict(0.50, 0.6, 0.8)
    assert verdict == "fail"


# ── score_insight ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_score_insight_all_numbers_verified():
    """All numbers in text appear in supporting data — should score high."""
    insight_text = "NPS improved to 42 with 847 responses."
    supporting_data = {"nps_score": 42, "response_count": 847}

    with patch("crystalos.lib.hallucination_scorer._llm_grounding_score", AsyncMock(return_value=None)):
        result = await score_insight(insight_text, supporting_data)

    assert isinstance(result, HallucinationScore)
    assert result.score >= 0.7  # High score (numbers verified)
    assert result.deterministic_score >= 0.7


@pytest.mark.asyncio
async def test_score_insight_unverified_numbers():
    """Numbers in text NOT in supporting data — should flag issues."""
    insight_text = "CSAT improved to 9.8 with 5000 responses."  # 9.8 and 5000 not in data
    supporting_data = {"nps_score": 42, "response_count": 100}

    with patch("crystalos.lib.hallucination_scorer._llm_grounding_score", AsyncMock(return_value=None)):
        result = await score_insight(insight_text, supporting_data)

    assert len(result.issues) > 0
    assert result.deterministic_score < 1.0


@pytest.mark.asyncio
async def test_score_insight_triggers_llm_on_low_det_score():
    """LLM pass triggered when deterministic score < 0.80."""
    insight_text = "Magic score 9999 and phantom number 8888."
    supporting_data = {}

    llm_score = 0.75
    with patch(
        "crystalos.lib.hallucination_scorer._llm_grounding_score",
        AsyncMock(return_value=llm_score),
    ) as mock_llm:
        result = await score_insight(insight_text, supporting_data)

    mock_llm.assert_called_once()
    assert result.llm_score == llm_score
    # Final score = 0.5 * det + 0.5 * llm
    assert result.score == pytest.approx(0.5 * result.deterministic_score + 0.5 * llm_score, abs=0.01)


@pytest.mark.asyncio
async def test_score_insight_skips_llm_on_high_det_score():
    """LLM pass NOT triggered when deterministic score >= 0.80."""
    insight_text = "NPS is 42."
    supporting_data = {"nps": 42}

    with patch(
        "crystalos.lib.hallucination_scorer._llm_grounding_score",
        AsyncMock(return_value=0.9),
    ) as mock_llm:
        result = await score_insight(insight_text, supporting_data)

    # 42 should be found in supporting_data → det_score should be high
    if result.deterministic_score >= 0.80:
        mock_llm.assert_not_called()
    assert result.llm_score is None  # Skipped


@pytest.mark.asyncio
async def test_score_insight_result_fields():
    result = await score_insight("NPS is 42.", {"nps": 42})
    assert hasattr(result, "score")
    assert hasattr(result, "verdict")
    assert hasattr(result, "issues")
    assert hasattr(result, "deterministic_score")
    assert result.verdict in ("pass", "flag", "fail")
    assert 0.0 <= result.score <= 1.0


# ── score_crystal_response ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_score_crystal_valid_citations():
    tool_results = [
        {"topics": [{"name": "Onboarding", "volume": 100}]},
    ]
    citations = ["Onboarding"]

    with patch("crystalos.lib.hallucination_scorer._llm_grounding_score", AsyncMock(return_value=None)):
        result = await score_crystal_response(
            answer="The Onboarding topic has 100 mentions.",
            tool_results=tool_results,
            citations=citations,
        )

    # "Onboarding" IS in tool_results → no citation issue
    assert isinstance(result, HallucinationScore)
    assert result.score >= 0.5


@pytest.mark.asyncio
async def test_score_crystal_invalid_citation():
    tool_results = [{"topics": [{"name": "Support Quality"}]}]
    citations = ["NonExistentTopicXYZ"]

    with patch("crystalos.lib.hallucination_scorer._llm_grounding_score", AsyncMock(return_value=None)):
        result = await score_crystal_response(
            answer="The NonExistentTopicXYZ is very important.",
            tool_results=tool_results,
            citations=citations,
        )

    assert any("NonExistentTopicXYZ" in issue for issue in result.issues)


@pytest.mark.asyncio
async def test_score_crystal_returns_valid_score():
    result = await score_crystal_response("The NPS is 35.", [], [])
    assert isinstance(result, HallucinationScore)
    assert 0.0 <= result.score <= 1.0
    assert result.verdict in ("pass", "flag", "fail")
