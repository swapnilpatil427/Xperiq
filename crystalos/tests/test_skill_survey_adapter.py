"""Unit tests for the survey skill ↔ Question schema adapter."""
import pytest

from crystalos.lib.skill_survey_adapter import (
    question_models_to_skill_shape,
    skill_question_to_model,
    skill_questions_to_models,
)
from crystalos.schemas.question import Question


def test_maps_text_to_question():
    q = skill_question_to_model({"id": "q1", "type": "open_text", "text": "What can we improve?"})
    assert q.question == "What can we improve?"
    assert q.type == "open_text"


def test_maps_nps_scale_and_labels():
    q = skill_question_to_model({
        "id": "q1", "type": "nps", "text": "How likely to recommend?",
        "scale": {"min": 0, "max": 10, "min_label": "Not likely", "max_label": "Very likely"},
    })
    assert q.type == "nps"
    assert q.scaleMax == 10
    assert q.labelLow == "Not likely"
    assert q.labelHigh == "Very likely"


def test_ces_maps_to_rating_with_default_scale():
    q = skill_question_to_model({"id": "q1", "type": "ces", "text": "How easy was it?"})
    assert q.type == "rating"
    assert q.scaleMax == 7


def test_boolean_maps_to_multiple_choice_with_yes_no():
    q = skill_question_to_model({"id": "q1", "type": "boolean", "text": "Resolved?"})
    assert q.type == "multiple_choice"
    assert q.options == ["Yes", "No"]


def test_missing_text_raises():
    with pytest.raises(ValueError):
        skill_question_to_model({"id": "q1", "type": "open_text"})


def test_empty_list_raises():
    with pytest.raises(ValueError):
        skill_questions_to_models([])


def test_round_trip_question_to_skill_shape():
    q = Question.model_validate({
        "id": "q1", "type": "nps", "question": "Recommend?",
        "scaleMax": 10, "labelLow": "No", "labelHigh": "Yes", "required": True,
    })
    shaped = question_models_to_skill_shape([q])
    assert shaped[0]["text"] == "Recommend?"
    assert shaped[0]["scale"]["max"] == 10
    assert shaped[0]["scale"]["min_label"] == "No"
    # And back again
    back = skill_questions_to_models(shaped)
    assert back[0].question == "Recommend?"
    assert back[0].scaleMax == 10
