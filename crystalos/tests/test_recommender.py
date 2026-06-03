"""Unit tests for the Recommendation Agent."""
import pytest
from unittest.mock import AsyncMock, patch

from crystalos.agents.recommender import RecommenderAgent
from crystalos.schemas.output import RecommenderInput, RecommenderOutput, Recommendation, OrgContext
from crystalos.schemas.question import Question
from tests.conftest import SAMPLE_QUESTIONS, make_credit


@pytest.fixture
def agent():
    return RecommenderAgent()


@pytest.fixture
def high_qc_input():
    questions = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    return RecommenderInput(
        questions=questions,
        qc_score=9.0,
        intent="Understand customer satisfaction after onboarding",
        org_context=OrgContext(industry="technology", size="51-200"),
        survey_type_id="cx",
    )


@pytest.fixture
def low_qc_input():
    questions = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    return RecommenderInput(
        questions=questions,
        qc_score=5.5,
        intent="Understand customer satisfaction after onboarding",
    )


async def test_recommender_high_qc_can_distribute(agent, high_qc_input):
    output = RecommenderOutput(
        recommendations=[
            Recommendation(action="distribute_now", label="Distribute survey", reason="QC score 9.0 — ready to send.", priority="high", cta="Send Now"),
            Recommendation(action="add_skip_logic", label="Add skip logic", reason="Route respondents based on NPS score.", priority="medium", cta="Add Logic"),
        ]
    )
    credit = make_credit("recommender")

    with patch("crystalos.agents.recommender.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, credits = await agent.run(high_qc_input)

    assert len(result.recommendations) == 2
    actions = [r.action for r in result.recommendations]
    assert "distribute_now" in actions


async def test_recommender_low_qc_cannot_distribute(agent, low_qc_input):
    # The system prompt forbids distribute_now when qc_score < 8.0
    # If the LLM returns it anyway, RecommenderOutput still validates (we rely on prompt)
    # This test verifies the prompt correctly omits distribute_now
    output = RecommenderOutput(
        recommendations=[
            Recommendation(action="run_pilot", label="Run a pilot", reason="QC score 5.5 — validate first.", priority="high", cta="Start Pilot"),
            Recommendation(action="review_in_builder", label="Review questions", reason="Address bias issues before distributing.", priority="medium", cta="Open Builder"),
        ]
    )
    credit = make_credit("recommender")
    captured_system: list[str] = []

    async def capture(agent_name, system, user, output_schema, current_tokens=0):
        captured_system.append(system)
        return output, credit

    with patch("crystalos.agents.recommender.call_agent", new=capture):
        result, _ = await agent.run(low_qc_input)

    # Verify the system prompt enforces the rules
    assert "run_pilot if qc_score < 8.0" in captured_system[0]   # Rule 2 verbatim
    assert "DISTRIBUTION GATE" in captured_system[0]              # Rule 1 header
    assert "distribute_now" in captured_system[0]                 # mentioned in Rule 1

    actions = [r.action for r in result.recommendations]
    assert "distribute_now" not in actions
    assert "run_pilot" in actions


async def test_recommender_post_processing_strips_distribute_on_low_qc(agent, low_qc_input):
    """Post-processing must remove distribute_now even if the LLM sneaks it in."""
    cheating_output = RecommenderOutput(
        recommendations=[
            Recommendation(action="distribute_now", label="Send it", reason="Looks fine to me.", priority="high", cta="Send"),
            Recommendation(action="run_pilot", label="Run pilot", reason="Good practice.", priority="medium", cta="Pilot"),
        ]
    )
    credit = make_credit("recommender")

    with patch("crystalos.agents.recommender.call_agent", new=AsyncMock(return_value=(cheating_output, credit))):
        result, _ = await agent.run(low_qc_input)

    actions = [r.action for r in result.recommendations]
    assert "distribute_now" not in actions   # post-processing must strip this
    assert "run_pilot" in actions            # injected or preserved


async def test_recommender_post_processing_skips_session_actions(agent, high_qc_input):
    """Actions already taken in the session should be filtered out by post-processing."""
    from crystalos.schemas.output import SessionAction
    high_qc_input_with_history = RecommenderInput(
        **{**high_qc_input.model_dump(), "session_actions": [
            SessionAction(action="distribute_now", context="Sent last week"),
        ]}
    )
    output = RecommenderOutput(
        recommendations=[
            Recommendation(action="distribute_now", label="Send", reason="Ready.", priority="high", cta="Send"),
            Recommendation(action="add_skip_logic", label="Skip logic", reason="B2B benefit.", priority="medium", cta="Add"),
        ]
    )
    credit = make_credit("recommender")

    with patch("crystalos.agents.recommender.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(high_qc_input_with_history)

    actions = [r.action for r in result.recommendations]
    assert "distribute_now" not in actions   # already done — post-processing strips it
    assert "add_skip_logic" in actions


async def test_recommender_max_3_recommendations():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        RecommenderOutput(
            recommendations=[
                Recommendation(action="run_pilot", label="X", reason="Y", priority="high", cta="Z"),
                Recommendation(action="add_skip_logic", label="X", reason="Y", priority="medium", cta="Z"),
                Recommendation(action="review_in_builder", label="X", reason="Y", priority="medium", cta="Z"),
                Recommendation(action="schedule_send", label="X", reason="Y", priority="medium", cta="Z"),
            ]
        )


async def test_recommender_manifest(agent):
    m = agent.manifest
    assert m.name == "recommender"
    assert m.enabled is True
    assert m.phase == "1"
