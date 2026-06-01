"""Smoke tests for tiered_report helpers (no LLM calls)."""
import asyncio
import pytest

from agents.agents.tiered_report import (
    _ground_quotes,
    _format_responses_for_llm,
    _build_metrics_context,
    run_tiered_report_agent,
    HeadlineReport,
    SummaryReport,
    FullReport,
)
from agents.lib.constants import REPORT_MAX_RESPONSES_WINDOW


def test_report_max_responses_window_is_200():
    assert REPORT_MAX_RESPONSES_WINDOW == 200


# ── _ground_quotes ─────────────────────────────────────────────────────────────


def test_ground_quotes_exact_4gram():
    texts  = ["The checkout process took forever and I gave up"]
    quotes = ["checkout process took forever"]
    grounded, rate = _ground_quotes(quotes, texts)
    assert grounded == quotes
    assert rate == 1.0


def test_ground_quotes_paraphrase_rejected():
    texts  = ["checkout took a long time"]
    quotes = ["the checkout experience was extremely slow and painful"]
    grounded, rate = _ground_quotes(quotes, texts)
    assert grounded == []
    assert rate == 0.0


def test_ground_quotes_short_direct_match():
    texts  = ["great support team overall"]
    quotes = ["great support"]
    grounded, rate = _ground_quotes(quotes, texts)
    assert grounded == quotes
    assert rate == 1.0


def test_ground_quotes_empty_input():
    grounded, rate = _ground_quotes([], ["some text"])
    assert grounded == []
    assert rate == 1.0


def test_ground_quotes_mixed():
    texts  = ["delivery was super fast and I loved it", "support was unhelpful"]
    quotes = ["delivery was super fast", "onboarding took months"]  # second should fail
    grounded, rate = _ground_quotes(quotes, texts)
    assert len(grounded) == 1
    assert grounded[0] == "delivery was super fast"
    assert rate == 0.5


# ── _format_responses_for_llm ─────────────────────────────────────────────────


def test_format_responses_no_open_texts():
    result = _format_responses_for_llm([], [], max_count=50)
    assert "no open-text" in result


def test_format_responses_basic():
    responses = [{"id": "r1", "nps_score": 9, "ai_sentiment": "positive"}]
    open_texts = [{"response_id": "r1", "question_id": "q1", "text": "Great experience overall"}]
    result = _format_responses_for_llm(responses, open_texts, max_count=10)
    assert "Great experience overall" in result
    assert "NPS:9" in result
    assert "positive" in result


def test_format_responses_truncates_at_max_count():
    responses  = [{"id": f"r{i}"} for i in range(10)]
    open_texts = [{"response_id": f"r{i}", "question_id": "q1", "text": f"Response {i}"} for i in range(10)]
    result = _format_responses_for_llm(responses, open_texts, max_count=3)
    assert "Response 0" in result
    assert "Response 4" not in result


# ── _build_metrics_context ────────────────────────────────────────────────────


def test_build_metrics_context_with_nps():
    metrics = {"nps": {"score": 42, "n": 100, "promoters": 60, "detractors": 18}}
    result = _build_metrics_context(metrics)
    assert "NPS: 42" in result
    assert "n=100" in result


def test_build_metrics_context_empty():
    result = _build_metrics_context({})
    assert "No numeric metrics available" in result


def test_build_metrics_context_all_scores():
    metrics = {
        "nps":  {"score": 35, "n": 80},
        "csat": {"score": 4.2, "n": 80},
        "ces":  {"score": 3.1, "n": 80},
    }
    result = _build_metrics_context(metrics)
    assert "NPS: 35" in result
    assert "CSAT: 4.2" in result
    assert "CES: 3.1" in result


# ── run_tiered_report_agent routing ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_skip_when_no_open_text():
    state = {
        "has_open_text": False,
        "survey_id": "s1", "org_id": "o1", "run_id": "r1",
        "metrics": {"total_responses": 50},
        "responses": [], "open_texts": [],
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
        "responses": [], "open_texts": [{"response_id": "r1", "text": "hi"}],
        "survey": {}, "org_context": {},
    }
    result = await run_tiered_report_agent(state)
    assert result == []


@pytest.mark.asyncio
async def test_skip_when_open_texts_empty():
    state = {
        "has_open_text": True,
        "survey_id": "s1", "org_id": "o1", "run_id": "r1",
        "metrics": {"total_responses": 50},
        "responses": [], "open_texts": [],
        "survey": {}, "org_context": {},
    }
    result = await run_tiered_report_agent(state)
    assert result == []


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
