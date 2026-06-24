"""Unit tests for the Quality Control Agent."""
import pytest
from unittest.mock import AsyncMock, patch

from crystalos.agents.qc import QualityControlAgent
from crystalos.schemas.output import QCInput, QCOutput, QCIssue, QCValidationOutput, OrgContext
from crystalos.schemas.question import Question
from tests.conftest import SAMPLE_QUESTIONS, make_credit


@pytest.fixture
def agent():
    return QualityControlAgent()


@pytest.fixture
def clean_survey_input():
    questions = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    return QCInput(questions=questions, survey_type_id="cx")


@pytest.fixture
def biased_survey_input():
    biased_questions = [
        {"id": "q1", "type": "multiple_choice", "question": "How much did you ENJOY our amazing service?",
         "required": True, "options": ["A lot", "Very much", "Extremely", "Beyond words"]},
        {"id": "q2", "type": "multiple_choice", "question": "Why was our onboarding so smooth?",
         "required": True, "options": ["Great team", "Clear docs", "Both", "Everything"]},
        {"id": "q3", "type": "open_text", "question": "What else?", "required": False},
    ]
    questions = [Question.model_validate(q) for q in biased_questions]
    return QCInput(questions=questions, survey_type_id="cx")


async def test_qc_clean_survey_passes(agent, clean_survey_input):
    clean_output = QCOutput(score=9.0, issues=[], overall_feedback="Well-structured survey.")
    credit = make_credit("qc")

    with patch("crystalos.agents.qc.call_agent", new=AsyncMock(return_value=(clean_output, credit))):
        output, credits = await agent.run(clean_survey_input)

    assert output.score == 9.0
    assert output.issues == []
    assert len(credits) == 1


async def test_qc_biased_survey_flags_issues(agent, biased_survey_input):
    biased_output = QCOutput(
        score=5.0,
        issues=[
            QCIssue(
                question_id="q1",
                type="bias",
                message="Leading question — 'amazing' presupposes positive experience",
                severity="high",
                suggestion="Rephrase: 'How would you rate your service experience?'",
            ),
            QCIssue(
                question_id="q2",
                type="bias",
                message="Loaded question assumes onboarding was smooth",
                severity="high",
                suggestion="Rephrase: 'How was your onboarding experience?'",
            ),
        ],
        overall_feedback="Survey has significant bias — leading and loaded questions detected.",
    )
    credit = make_credit("qc")

    with patch("crystalos.agents.qc.call_agent", new=AsyncMock(return_value=(biased_output, credit))):
        output, credits = await agent.run(biased_survey_input)

    assert output.score == 5.0
    assert len(output.issues) == 2
    high_severity = [i for i in output.issues if i.severity == "high"]
    assert len(high_severity) == 2


async def test_qc_score_bounds():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        QCOutput(score=11.0, issues=[], overall_feedback="Invalid")
    with pytest.raises(ValidationError):
        QCOutput(score=-1.0, issues=[], overall_feedback="Invalid")


async def test_qc_haiku_validator_agrees(agent, clean_survey_input):
    """When Haiku agrees, no extra concerns are added and 2 credit entries are returned."""
    gemini_output = QCOutput(score=9.0, issues=[], overall_feedback="Clean survey.")
    haiku_validation = QCValidationOutput(agrees_with_score=True, concerns=[], suggested_score=None)
    gemini_credit = make_credit("qc")
    haiku_credit  = make_credit("qc_validator")

    call_count = 0

    async def side_effect(agent_name, system, user, output_schema, current_tokens=0):
        nonlocal call_count
        call_count += 1
        return (gemini_output, gemini_credit) if call_count == 1 else (haiku_validation, haiku_credit)

    with patch("crystalos.agents.qc.call_agent", new=side_effect):
        output, credits = await agent.run(clean_survey_input)

    assert output.score == 9.0
    assert output.validation_errors == []
    assert len(credits) == 2   # Gemini + Haiku


async def test_qc_haiku_validator_disagrees_adjusts_score(agent, biased_survey_input):
    """When Haiku suggests a lower score (and no math clamping occurred), the stricter score wins."""
    gemini_output = QCOutput(
        score=7.5,
        issues=[
            QCIssue(question_id="q1", type="bias", message="Leading language",
                    severity="medium", suggestion="Rephrase")
        ],
        overall_feedback="Minor bias.",
    )
    haiku_validation = QCValidationOutput(
        agrees_with_score=False,
        concerns=["Score 7.5 is too generous — the leading language is more than minor"],
        suggested_score=6.0,
    )
    gemini_credit = make_credit("qc")
    haiku_credit  = make_credit("qc_validator")

    call_count = 0

    async def side_effect(agent_name, system, user, output_schema, current_tokens=0):
        nonlocal call_count
        call_count += 1
        return (gemini_output, gemini_credit) if call_count == 1 else (haiku_validation, haiku_credit)

    with patch("crystalos.agents.qc.call_agent", new=side_effect):
        output, credits = await agent.run(biased_survey_input)

    assert output.score == 6.0              # Haiku's stricter score applied
    assert output.score_was_adjusted is True
    assert any("[Haiku validator]" in e for e in output.validation_errors)
    assert len(credits) == 2


async def test_qc_haiku_validator_failure_is_nonfatal(agent, clean_survey_input):
    """If the Haiku validation call throws, the Gemini result is returned unchanged."""
    gemini_output = QCOutput(score=8.0, issues=[], overall_feedback="Good survey.")
    gemini_credit = make_credit("qc")

    call_count = 0

    async def side_effect(agent_name, system, user, output_schema, current_tokens=0):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return gemini_output, gemini_credit
        raise RuntimeError("Haiku API unavailable")

    with patch("crystalos.agents.qc.call_agent", new=side_effect):
        output, credits = await agent.run(clean_survey_input)

    assert output.score == 8.0   # Gemini result preserved
    assert len(credits) == 1     # Only Gemini credit (Haiku failed)


async def test_qc_manifest(agent):
    m = agent.manifest
    assert m.name == "qc"
    assert m.enabled is True
    assert "bias-detection" in m.tags
