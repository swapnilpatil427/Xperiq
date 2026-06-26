"""Unit tests for the Survey Creator Agent.

All LLM calls are mocked — tests are fast and deterministic.
"""
import pytest
from unittest.mock import AsyncMock, patch

from crystalos.agents.creator import SurveyCreatorAgent
from crystalos.schemas.output import CreatorInput, CreatorOutput, OrgContext
from crystalos.schemas.question import Question
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
        "crystalos.agents.creator.call_agent",
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

    with patch("crystalos.agents.creator.call_agent", new=capture_call):
        await agent.run(revision_input)

    assert captured_calls, "call_agent was not called"
    system_prompt = captured_calls[0]["system"]
    assert "REVISION 1/2" in system_prompt
    assert "Leading question detected" in system_prompt


def _fake_registry(execute_result):
    from unittest.mock import MagicMock
    reg = MagicMock()
    reg.is_initialized.return_value = True
    reg.get_skill_meta.return_value = {"name": "survey-creator"}
    reg.execute = AsyncMock(return_value=execute_result)
    return reg


async def test_creator_uses_skill_when_eval_passes(agent, basic_input):
    """When the survey-creator skill passes evals, its output is used (no legacy call)."""
    skill_result = {
        "eval_passed": True,
        "eval_score": 0.9,
        "retried": False,
        "output": {
            "questions": [
                {"id": "q1", "type": "nps", "text": "How likely to recommend?",
                 "scale": {"min": 0, "max": 10, "min_label": "No", "max_label": "Yes"}, "required": True},
                {"id": "q2", "type": "csat", "text": "How satisfied are you?", "required": True},
                {"id": "q3", "type": "open_text", "text": "What can we improve?", "required": False},
            ],
            "design_rationale": "NPS primary metric with a CSAT driver and one open text.",
        },
    }
    legacy = AsyncMock()
    with (
        patch("crystalos.lib.skill_registry.get_registry", return_value=_fake_registry(skill_result)),
        patch("crystalos.agents.creator.call_agent", new=legacy),
    ):
        output, credits = await agent.run(basic_input)

    assert isinstance(output, CreatorOutput)
    assert output.questions[0].type == "nps"
    assert output.rationale.startswith("NPS primary metric")
    legacy.assert_not_called()   # skill path used, legacy never invoked


async def test_creator_falls_back_when_skill_eval_fails(agent, basic_input, mock_creator_output):
    """When the skill fails evals, the legacy call_agent path runs."""
    skill_result = {"eval_passed": False, "output": {}, "eval_score": 0.2}
    credit = make_credit("creator")
    legacy = AsyncMock(return_value=(mock_creator_output, credit))
    with (
        patch("crystalos.lib.skill_registry.get_registry", return_value=_fake_registry(skill_result)),
        patch("crystalos.agents.creator.call_agent", new=legacy),
    ):
        output, credits = await agent.run(basic_input)

    assert isinstance(output, CreatorOutput)
    legacy.assert_called_once()   # fell back to legacy


async def test_creator_revision_skips_skill(agent, mock_creator_output):
    """Revision runs always use the legacy path (skill has no QC-feedback input)."""
    revision_input = CreatorInput(intent="x", revision_count=1, revision_issues=[])
    credit = make_credit("creator")
    legacy = AsyncMock(return_value=(mock_creator_output, credit))
    # Registry would pass, but revision_count>0 must skip it entirely.
    skill_result = {"eval_passed": True, "output": {"questions": [{"id": "q1", "type": "open_text", "text": "x"}]}}
    reg = _fake_registry(skill_result)
    with (
        patch("crystalos.lib.skill_registry.get_registry", return_value=reg),
        patch("crystalos.agents.creator.call_agent", new=legacy),
    ):
        await agent.run(revision_input)

    reg.execute.assert_not_called()
    legacy.assert_called_once()


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
