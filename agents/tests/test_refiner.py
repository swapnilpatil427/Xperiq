"""Unit tests for the Question Refiner Agent."""
import pytest
from unittest.mock import AsyncMock, patch

from agents.agents.refiner import RefinerAgent
from agents.schemas.output import RefinerInput, RefinerOutput, OrgContext
from agents.schemas.question import Question
from tests.conftest import make_credit


@pytest.fixture
def agent():
    return RefinerAgent()


@pytest.fixture
def original_question():
    return Question(
        id="q2",
        type="multiple_choice",
        question="How much did you ENJOY our amazing service?",
        required=True,
        options=["A lot", "Very much", "Extremely", "Beyond words"],
    )


@pytest.fixture
def surrounding_questions():
    return [
        Question(id="q1", type="nps", question="How likely to recommend?", required=True),
        Question(id="q3", type="open_text", question="Anything else?", required=False),
    ]


async def test_refiner_removes_bias(agent, original_question, surrounding_questions):
    refined_q = Question(
        id="q2",
        type="multiple_choice",
        question="How would you rate your overall service experience?",
        required=True,
        options=["Excellent", "Good", "Fair", "Poor"],
    )
    output = RefinerOutput(
        refined_question=refined_q,
        explanation="Removed loaded language; replaced biased options with balanced ones.",
        type_was_preserved=True,
        validation_errors=[],
    )
    credit = make_credit("refiner")

    refiner_input = RefinerInput(
        question_to_refine=original_question,
        user_feedback="Remove the leading language and make the options more neutral",
        survey_questions=surrounding_questions,
    )

    with patch("agents.agents.refiner.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, credits = await agent.run(refiner_input)

    assert result.refined_question.id == "q2"  # ID preserved
    assert result.refined_question.type == "multiple_choice"  # type preserved
    assert result.type_was_preserved is True
    assert result.validation_errors == []
    assert len(credits) == 1


async def test_refiner_rejects_type_change_without_request(agent, original_question):
    """If LLM changes question type without user asking, the original is returned."""
    # LLM incorrectly changes type from multiple_choice to rating
    bad_refined = Question(
        id="q2",
        type="rating",   # Changed without permission!
        question="Rate your service experience",
        required=True,
        scaleMax=5,
    )
    bad_output = RefinerOutput(
        refined_question=bad_refined,
        explanation="Changed to rating for simplicity.",
        type_was_preserved=False,
        validation_errors=[],
    )
    credit = make_credit("refiner")

    refiner_input = RefinerInput(
        question_to_refine=original_question,
        user_feedback="Remove the biased wording",  # No type change requested
    )

    with patch("agents.agents.refiner.call_agent", new=AsyncMock(return_value=(bad_output, credit))):
        result, _ = await agent.run(refiner_input)

    # Agent should revert to original question
    assert result.refined_question.id == "q2"
    assert result.refined_question.type == "multiple_choice"  # original type restored
    assert len(result.validation_errors) > 0
    assert "type" in result.validation_errors[0].lower()


async def test_refiner_preserves_id_invariant(agent, original_question):
    """If LLM changes question ID, the original is returned."""
    bad_refined = Question(
        id="q5",   # Wrong ID!
        type="multiple_choice",
        question="How would you rate your service?",
        required=True,
        options=["Excellent", "Good", "Fair", "Poor"],
    )
    bad_output = RefinerOutput(
        refined_question=bad_refined,
        explanation="Refined question.",
        type_was_preserved=True,
        validation_errors=[],
    )
    credit = make_credit("refiner")

    refiner_input = RefinerInput(
        question_to_refine=original_question,
        user_feedback="Rephrase the question",
    )

    with patch("agents.agents.refiner.call_agent", new=AsyncMock(return_value=(bad_output, credit))):
        result, _ = await agent.run(refiner_input)

    assert result.refined_question.id == "q2"  # original ID must be preserved
    assert any("id" in e.lower() for e in result.validation_errors)


async def test_refiner_manifest(agent):
    m = agent.manifest
    assert m.name == "refiner"
    assert m.enabled is True
    assert "editing" in m.tags
