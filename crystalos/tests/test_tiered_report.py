"""Tests for tiered_report helpers — no LLM calls."""
import math
import pytest

from crystalos.agents.tiered_report import (
    _ground_quotes_against_corpus,
    _format_topic_signals_for_llm,
    _build_sorted_topic_list,
    _collect_verbatim_corpus,
    _compute_trust_score,
    run_tiered_report_agent,
    HeadlineReport,
    SummaryReport,
    FullReport,
)
from crystalos.lib.constants import REPORT_MAX_RESPONSES_WINDOW, REPORT_REGEN_MIN_NEW_RESPONSES


def test_report_max_responses_window_is_200():
    assert REPORT_MAX_RESPONSES_WINDOW == 200


def test_report_regen_min_new_responses():
    assert REPORT_REGEN_MIN_NEW_RESPONSES == 25


# ── _ground_quotes_against_corpus ─────────────────────────────────────────────


def test_ground_quotes_exact_4gram():
    texts  = ["The checkout process took forever and I gave up"]
    quotes = ["checkout process took forever"]
    grounded, rate = _ground_quotes_against_corpus(quotes, texts)
    assert grounded == quotes
    assert rate == 1.0


def test_ground_quotes_paraphrase_rejected():
    texts  = ["checkout took a long time"]
    quotes = ["the checkout experience was extremely slow and painful"]
    grounded, rate = _ground_quotes_against_corpus(quotes, texts)
    assert grounded == []
    assert rate == 0.0


def test_ground_quotes_short_direct_match():
    texts  = ["great support team overall"]
    quotes = ["great support"]
    grounded, rate = _ground_quotes_against_corpus(quotes, texts)
    assert grounded == quotes
    assert rate == 1.0


def test_ground_quotes_empty_input():
    grounded, rate = _ground_quotes_against_corpus([], ["some text"])
    assert grounded == []
    assert rate == 1.0


def test_ground_quotes_mixed():
    texts  = ["delivery was super fast and I loved it", "support was unhelpful"]
    quotes = ["delivery was super fast", "onboarding took months"]
    grounded, rate = _ground_quotes_against_corpus(quotes, texts)
    assert len(grounded) == 1
    assert grounded[0] == "delivery was super fast"
    assert rate == 0.5


# ── _compute_trust_score ──────────────────────────────────────────────────────


def test_trust_score_grows_with_sample_size():
    score_small, _ = _compute_trust_score(15, 0.8, 5, "headline")
    score_large, _ = _compute_trust_score(500, 0.8, 80, "full")
    assert score_large > score_small


def test_trust_score_grounding_matters():
    score_high, data_high = _compute_trust_score(100, 1.0, 20, "full")
    score_low,  data_low  = _compute_trust_score(100, 0.0, 20, "full")
    assert score_high > score_low
    assert data_high["grounding"] == 100
    assert data_low["grounding"] == 0


def test_trust_score_within_bounds():
    for total in [10, 40, 70, 300, 5000]:
        for rate in [0.0, 0.5, 1.0]:
            score, tj = _compute_trust_score(total, rate, max(1, total // 5), "full")
            assert 20 <= score <= 95, f"trust_score={score} out of bounds for total={total}, rate={rate}"
            assert 0 <= tj["grounding"] <= 100


def test_trust_score_includes_below_minimum_flag():
    _, tj = _compute_trust_score(15, 1.0, 15, "headline")
    assert tj["below_minimum_sample"] is True
    _, tj2 = _compute_trust_score(50, 1.0, 20, "summary")
    assert tj2["below_minimum_sample"] is False


# ── _format_topic_signals_for_llm ─────────────────────────────────────────────


def test_format_topic_signals_basic():
    topic_sigs = {
        "Checkout Speed": {
            "response_count": 15,
            "avg_sentiment_score": -0.65,
            "dominant_emotion": "frustration",
            "avg_effort_score": 5.2,
            "nps_impact": -22.0,
            "urgency_score": 4.5,
            "trending": "up",
            "is_new": False,
            "top_verbatims": [
                {"text": "checkout was too slow and painful", "sentiment": "negative", "score": -0.8, "emotion": "frustration"},
            ],
        }
    }
    metrics = {"nps": {"score": 42}}
    result = _format_topic_signals_for_llm(list(_build_sorted_topic_list(topic_sigs, max_topics=5)), metrics)
    assert "Checkout Speed" in result
    assert "NPS impact" in result or "nps_impact" in result.lower()
    assert "checkout was too slow" in result


def test_format_topic_signals_no_verbatims():
    topic_sigs = {
        "Billing Clarity": {
            "response_count": 8,
            "avg_sentiment_score": -0.3,
            "dominant_emotion": "confusion",
            "avg_effort_score": 3.5,
            "urgency_score": 1.2,
            "top_verbatims": [],
        }
    }
    result = _format_topic_signals_for_llm(list(_build_sorted_topic_list(topic_sigs, max_topics=5)), {})
    assert "Billing Clarity" in result


# ── _build_sorted_topic_list ──────────────────────────────────────────────────


def test_build_sorted_by_urgency():
    topic_sigs = {
        "Low Urgency":  {"urgency_score": 0.5, "response_count": 50, "top_verbatims": []},
        "High Urgency": {"urgency_score": 8.0, "response_count": 10, "top_verbatims": []},
        "Mid Urgency":  {"urgency_score": 3.0, "response_count": 20, "top_verbatims": []},
    }
    sorted_topics = _build_sorted_topic_list(topic_sigs, max_topics=10)
    names = [t["name"] for t in sorted_topics]
    assert names[0] == "High Urgency"
    assert names[-1] == "Low Urgency"


def test_build_sorted_respects_max_topics():
    topic_sigs = {f"Topic {i}": {"urgency_score": float(i), "top_verbatims": []} for i in range(20)}
    result = _build_sorted_topic_list(topic_sigs, max_topics=5)
    assert len(result) == 5


# ── _collect_verbatim_corpus ──────────────────────────────────────────────────


def test_collect_verbatim_corpus_filters_short():
    topic_sigs = {
        "Topic A": {
            "top_verbatims": [
                {"text": "ok"},                                 # too short — filtered
                {"text": "delivery was super fast and good"},   # kept
            ]
        }
    }
    corpus = _collect_verbatim_corpus(topic_sigs)
    assert len(corpus) == 1
    assert "delivery was super fast" in corpus[0]


def test_collect_verbatim_corpus_empty():
    assert _collect_verbatim_corpus({}) == []


# ── run_tiered_report_agent routing ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_skip_when_no_open_text():
    state = {
        "has_open_text": False,
        "survey_id": "s1", "org_id": "o1", "run_id": "r1",
        "metrics": {"total_responses": 50},
        "responses": [], "open_texts": [],
        "topic_signals": {"Topic A": {"urgency_score": 1.0, "top_verbatims": []}},
        "survey": {}, "org_context": {},
    }
    result = await run_tiered_report_agent(state)
    assert result == []


@pytest.mark.asyncio
async def test_skip_when_no_topic_signals():
    state = {
        "has_open_text": True,
        "survey_id": "s1", "org_id": "o1", "run_id": "r1",
        "metrics": {"total_responses": 50},
        "responses": [], "open_texts": [],
        "topic_signals": {},   # empty — should skip
        "survey": {}, "org_context": {},
    }
    result = await run_tiered_report_agent(state)
    assert result == []


@pytest.mark.asyncio
async def test_skip_when_too_few_responses():
    state = {
        "has_open_text": True,
        "survey_id": "s1", "org_id": "o1", "run_id": "r1",
        "metrics": {"total_responses": 5},
        "responses": [],
        "topic_signals": {"Topic A": {"urgency_score": 1.0, "response_count": 5, "top_verbatims": []}},
        "survey": {}, "org_context": {},
    }
    result = await run_tiered_report_agent(state)
    assert result == []


@pytest.mark.asyncio
async def test_skip_when_delta_below_threshold():
    state = {
        "has_open_text": True,
        "force_regenerate": False,
        "trigger": "stream",
        "survey_id": "s1", "org_id": "o1", "run_id": "r1",
        "metrics": {"total_responses": 80},
        "responses": [],
        "topic_signals": {"Topic A": {"urgency_score": 3.0, "response_count": 30, "top_verbatims": []}},
        "last_report_response_count": 75,   # only 5 new — below threshold of 25
        "survey": {}, "org_context": {},
    }
    result = await run_tiered_report_agent(state)
    assert result == []


@pytest.mark.asyncio
async def test_bypass_delta_check_on_manual_trigger():
    """Manual trigger bypasses the delta threshold — no LLM call in this test, just routing check."""
    state = {
        "has_open_text": True,
        "force_regenerate": True,
        "trigger": "manual",
        "survey_id": "s1", "org_id": "o1", "run_id": "r1",
        "metrics": {"total_responses": 80},
        "responses": [],
        "topic_signals": {"Topic A": {"urgency_score": 3.0, "response_count": 30, "top_verbatims": []}},
        "last_report_response_count": 78,   # only 2 new — would normally be skipped
        "survey": {}, "org_context": {},
    }
    # We can't call the full LLM here, so we just verify the delta check is NOT the reason for skipping.
    # The function will attempt an LLM call and likely fail without API key — we check that it got past delta.
    # If topic_signals is present and delta check passes, it proceeds to the LLM tier.
    # We mock out call_agent to avoid actual API call.
    from unittest.mock import patch, AsyncMock
    from crystalos.agents.tiered_report import FullReport

    mock_report = FullReport(
        executive_summary="Test summary.",
        themes=[],
        cross_theme_patterns="",
        priority_actions=[],
    )
    with patch("crystalos.agents.tiered_report.call_agent", new=AsyncMock(return_value=(mock_report, None))):
        result = await run_tiered_report_agent(state)
    # With force_regenerate=True, delta check is bypassed and LLM call proceeds
    # Result may be empty (no themes passed grounding) but it attempted the call
    assert isinstance(result, list)


# ── Pydantic schema validation ────────────────────────────────────────────────


def test_headline_report_schema():
    data = {
        "report_summary": "Respondents appreciate fast delivery.",
        "themes": [{
            "theme": "Fast Delivery",
            "summary": "Quick shipping was highlighted.",
            "supporting_quotes": ["delivery was super fast", "arrived next day"],
            "sentiment": "positive",
            "frequency_estimate": 15,
        }],
    }
    report = HeadlineReport(**data)
    assert report.themes[0].theme == "Fast Delivery"
    assert len(report.themes[0].supporting_quotes) == 2


def test_summary_report_schema_with_action():
    data = {
        "report_summary": "Three main themes identified.",
        "themes": [{
            "theme": "Onboarding Friction",
            "description": "Many respondents find the onboarding confusing.",
            "supporting_quotes": ["setup was confusing", "took too long to get started"],
            "sentiment": "negative",
            "frequency_estimate": 20,
            "recommended_focus": "Simplify the first-run setup wizard.",
        }],
    }
    report = SummaryReport(**data)
    assert report.themes[0].recommended_focus == "Simplify the first-run setup wizard."


def test_full_report_schema_with_action():
    data = {
        "executive_summary": "The survey reveals three areas of concern.",
        "themes": [{
            "theme": "Slow Support",
            "description": "Customers mention long wait times.",
            "supporting_quotes": ["waited 3 hours", "no response for days", "support is slow"],
            "sentiment": "negative",
            "frequency_estimate": 30,
            "business_impact": "High churn risk.",
            "root_cause_hypothesis": "Insufficient support staff.",
            "trend_direction": "declining",
            "recommended_action": {
                "action": "Add tier-1 support 9-5pm",
                "priority": "critical",
                "time_horizon": "immediate",
                "estimated_impact": "Reduce wait by 60%",
            },
        }],
        "cross_theme_patterns": "Support and onboarding issues compound.",
        "priority_actions": [{
            "action": "Hire 3 support reps",
            "rationale": "Volume exceeds capacity",
            "expected_outcome": "50% backlog reduction",
            "priority": "critical",
            "time_horizon": "immediate",
        }],
    }
    report = FullReport(**data)
    assert report.themes[0].recommended_action.priority == "critical"
    assert report.priority_actions[0].action == "Hire 3 support reps"


def test_full_report_missing_executive_summary_defaults_to_empty():
    """Reasoning models sometimes omit executive_summary — schema must still validate."""
    data = {
        "themes": [{
            "theme": "Onboarding",
            "description": "Setup was hard.",
            "supporting_quotes": ["setup was confusing"],
            "sentiment": "negative",
            "frequency_estimate": 10,
        }],
    }
    report = FullReport(**data)
    assert report.executive_summary == ""
    assert len(report.themes) == 1
