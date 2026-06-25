"""Tests for crystalos.lib.json_coerce."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from crystalos.lib.json_coerce import (
    coerce_suggestion_item,
    extract_skill_answer,
    json_dumps_safe,
    normalize_suggestions,
)
from crystalos.schemas.output import CopilotOutput
from crystalos.schemas.question import Question


def test_coerce_suggestion_item_string():
    assert coerce_suggestion_item("  Follow up?  ") == "Follow up?"


def test_coerce_suggestion_item_navigation_dict():
    item = {"type": "navigation", "route": "/app/insights", "label": "View insights"}
    assert coerce_suggestion_item(item) == "View insights"


def test_normalize_suggestions_caps():
    raw = ["a", {"label": "b"}, "c", "d"]
    assert normalize_suggestions(raw, max_items=3) == ["a", "b", "c"]


def test_extract_skill_answer_from_summary():
    out = {"summary": "Response volume is highest in the APAC region with strong growth."}
    assert extract_skill_answer(out) == out["summary"]


def test_extract_skill_answer_headline_plus_narrative():
    out = {
        "headline": "NPS is volatile.",
        "narrative": "Scores swung between 38 and 52 over the last two quarters with no clear trend.",
    }
    text = extract_skill_answer(out)
    assert text is not None
    assert "NPS is volatile." in text
    assert "last two quarters" in text


def test_extract_skill_answer_executive_summary():
    out = {"executive_summary": "NPS held steady at 42 while onboarding friction remains the top detractor theme."}
    assert extract_skill_answer(out) == out["executive_summary"]


def test_extract_skill_answer_nested_report():
    out = {
        "report": {
            "executive_summary": "Customer effort improved modestly across all channels this quarter.",
        }
    }
    assert extract_skill_answer(out) == out["report"]["executive_summary"]


def test_extract_skill_answer_too_short_returns_none():
    assert extract_skill_answer({"answer": "Short"}) is None


def test_json_dumps_safe_serializes_uuid():
    uid = uuid4()
    payload = {"survey_id": uid, "insights": [{"id": uid}]}
    dumped = json_dumps_safe(payload)
    assert str(uid) in dumped
    assert "UUID" not in dumped


def test_json_dumps_safe_serializes_datetime_and_decimal():
    ts = datetime(2026, 6, 25, 12, 0, tzinfo=timezone.utc)
    dumped = json_dumps_safe({"at": ts, "score": Decimal("4.5")})
    assert "2026-06-25" in dumped
    assert "4.5" in dumped


def test_copilot_output_coerces_navigation_suggestion_dicts():
    """Regression: Copilot LLM may emit dicts in suggestions."""
    from tests.conftest import SAMPLE_QUESTIONS

    q = Question.model_validate(SAMPLE_QUESTIONS[0])
    out = CopilotOutput(
        questions=[q],
        explanation="Updated question wording.",
        suggestions=[
            {"type": "navigation", "route": "/app/surveys", "label": "Review all surveys"},
            "Add skip logic next",
        ],
    )
    assert out.suggestions == ["Review all surveys", "Add skip logic next"]
