"""Unit tests for the Survey Creator Agent.

All LLM calls are mocked — tests are fast and deterministic.
"""
import pytest
from unittest.mock import AsyncMock, patch

from agents.agents.creator import SurveyCreatorAgent
from agents.schemas.output import CreatorInput, CreatorOutput, OrgContext
from agents.schemas.question import Question
from tests.conftest import SAMPLE_QUESTIONS, make_credit


@pytest.fixture
def agent():
    return SurveyCreatorAgent()


@pytest.fixture
def basic_input(sample_org_context):
    return CreatorInput(
        intent="Understand customer satisfaction after onboarding",
        survey_type_id="cx",
        org_context=OrgContext(**sample_org_context),
    )


@pytest.fixture
def mock_creator_output():
    questions = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    return CreatorOutput(questions=questions, rationale="Mixed NPS and open questions for CX.")


async def test_creator_run_success(agent, basic_input, mock_creator_output, sample_org_context):
    credit = make_credit("creator")
    with patch(
        "agents.agents.creator.call_agent",
        new=AsyncMock(return_value=(mock_creator_output, credit)),
    ):
        output, credits = await agent.run(basic_input)

    assert isinstance(output, CreatorOutput)
    assert len(output.questions) == 5
    assert output.questions[0].type == "nps"
    assert output.questions[-1].type == "open_text"
    assert len(credits) == 1
    assert credits[0]["agent"] == "creator"


async def test_creator_revision_injects_issues(agent, mock_creator_output):
    revision_input = CreatorInput(
        intent="Measure onboarding satisfaction",
        revision_count=1,
        revision_issues=[
            {
                "question_id": "q1",
                "type": "bias",
                "message": "Leading question detected",
                "severity": "high",
                "suggestion": "Rephrase neutrally",
            }
        ],
    )
    credit = make_credit("creator")
    captured_calls: list = []

    async def capture_call(agent_name, system, user, output_schema, current_tokens=0):
        captured_calls.append({"system": system, "user": user})
        return mock_creator_output, credit

    with patch("agents.agents.creator.call_agent", new=capture_call):
        await agent.run(revision_input)

    assert captured_calls, "call_agent was not called"
    system_prompt = captured_calls[0]["system"]
    assert "REVISION 1/2" in system_prompt
    assert "Leading question detected" in system_prompt


async def test_creator_manifest(agent):
    m = agent.manifest
    assert m.name == "creator"
    assert m.enabled is True
    assert m.phase == "1"
    assert "survey" in m.tags


async def test_creator_output_validates_question_count(agent):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        CreatorOutput(
            questions=[],   # below min_length=3
            rationale="too few",
        )
