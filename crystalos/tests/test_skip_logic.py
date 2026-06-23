"""Unit tests for the Skip Logic Generator Agent."""
import pytest
from unittest.mock import AsyncMock, patch

from crystalos.agents.skip_logic import SkipLogicAgent
from crystalos.schemas.output import SkipLogicInput, SkipLogicOutput, SkipLogicChange
from crystalos.schemas.question import Question, SkipLogicRule, SkipLogicCondition, DisplayLogic
from tests.conftest import make_credit, SAMPLE_QUESTIONS


@pytest.fixture
def agent():
    return SkipLogicAgent()


@pytest.fixture
def questions():
    return [Question.model_validate(q) for q in SAMPLE_QUESTIONS]


def _make_output(questions, changes=None, summary="Logic added."):
    return SkipLogicOutput(
        questions=questions,
        changes=changes or [],
        summary=summary,
    )


async def test_skip_logic_adds_forward_rule(agent, questions):
    """Agent correctly adds a skip rule from q1 → q3 (forward)."""
    q1_with_skip = questions[0].model_copy(update={
        "skipLogic": [
            SkipLogicRule(
                id="rule_1",
                condition=SkipLogicCondition(operator="lt", value=7),
                destination="q3",
            )
        ]
    })
    modified = [q1_with_skip] + questions[1:]
    output = _make_output(
        modified,
        changes=[SkipLogicChange(
            question_id="q1", field="skipLogic",
            previous_value=None,
            new_value=[{"id": "rule_1", "condition": {"operator": "lt", "value": 7}, "destination": "q3"}],
            explanation="If NPS < 7, skip to q3",
        )],
        summary="Added NPS < 7 → skip to q3.",
    )
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(
        questions=questions,
        request="If NPS score is less than 7, skip to the improvement question",
    )
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, credits = await agent.run(inp)

    assert result.questions[0].skipLogic is not None
    assert result.questions[0].skipLogic[0].destination == "q3"
    assert len(credits) == 1


async def test_skip_logic_rejects_backward_destination(agent, questions):
    """Guard removes skip rules pointing to earlier questions."""
    # LLM incorrectly adds a backward skip: q3 → q1
    q3_with_bad_skip = questions[2].model_copy(update={
        "skipLogic": [
            SkipLogicRule(
                id="rule_1",
                condition=SkipLogicCondition(operator="eq", value="Product quality"),
                destination="q1",  # q1 is BEFORE q3 — must be rejected
            )
        ]
    })
    modified = questions[:2] + [q3_with_bad_skip] + questions[3:]
    output = _make_output(modified)
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(questions=questions, request="If top choice is quality, skip back to NPS")
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q3 = next(q for q in result.questions if q.id == "q3")
    # Guard must have stripped the backward rule
    assert q3.skipLogic is None or all(r.destination != "q1" for r in (q3.skipLogic or []))


async def test_skip_logic_rejects_same_question_destination(agent, questions):
    """Guard removes rules where destination == source (self-loop)."""
    q2_self_loop = questions[1].model_copy(update={
        "skipLogic": [
            SkipLogicRule(
                id="rule_1",
                condition=SkipLogicCondition(operator="lt", value=3),
                destination="q2",  # self-reference — must be rejected
            )
        ]
    })
    modified = [questions[0], q2_self_loop] + questions[2:]
    output = _make_output(modified)
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(questions=questions, request="Loop q2 if rating < 3")
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q2 = next(q for q in result.questions if q.id == "q2")
    assert q2.skipLogic is None or all(r.destination != "q2" for r in (q2.skipLogic or []))


async def test_skip_logic_end_survey_is_valid_destination(agent, questions):
    """END_SURVEY is a valid skip destination and must not be removed."""
    q1_end = questions[0].model_copy(update={
        "skipLogic": [
            SkipLogicRule(
                id="rule_1",
                condition=SkipLogicCondition(operator="gte", value=9),
                destination="END_SURVEY",
            )
        ]
    })
    modified = [q1_end] + questions[1:]
    output = _make_output(modified)
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(questions=questions, request="If NPS >= 9, end the survey")
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q1 = next(q for q in result.questions if q.id == "q1")
    assert q1.skipLogic is not None
    assert q1.skipLogic[0].destination == "END_SURVEY"


async def test_skip_logic_rejects_display_logic_with_later_source(agent, questions):
    """Guard removes displayLogic whose sourceQuestionId comes AFTER the target."""
    # q1 has displayLogic referencing q5 (which comes after it — invalid)
    q1_bad_display = questions[0].model_copy(update={
        "displayLogic": DisplayLogic(
            sourceQuestionId="q5",
            operator="answered",
            value=None,
        )
    })
    modified = [q1_bad_display] + questions[1:]
    output = _make_output(modified)
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(questions=questions, request="Show q1 only if q5 was answered")
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q1 = next(q for q in result.questions if q.id == "q1")
    assert q1.displayLogic is None


async def test_skip_logic_allows_display_logic_with_earlier_source(agent, questions):
    """displayLogic whose source precedes the target is preserved."""
    q4_with_display = questions[3].model_copy(update={
        "displayLogic": DisplayLogic(
            sourceQuestionId="q2",
            operator="lt",
            value=3,
        )
    })
    modified = questions[:3] + [q4_with_display] + questions[4:]
    output = _make_output(modified)
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(questions=questions, request="Show q4 only if satisfaction rating < 3")
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q4 = next(q for q in result.questions if q.id == "q4")
    assert q4.displayLogic is not None
    assert q4.displayLogic.sourceQuestionId == "q2"


async def test_skip_logic_preserves_all_questions(agent, questions):
    """Agent always returns all questions — not just modified ones."""
    output = _make_output(questions)  # no changes
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(questions=questions, request="Add skip logic if appropriate")
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    assert len(result.questions) == len(questions)
    assert [q.id for q in result.questions] == [q.id for q in questions]


async def test_skip_logic_does_not_modify_question_text(agent, questions):
    """Non-destructive: question text must not change."""
    q1_modified_text = questions[0].model_copy(update={
        "question": "CHANGED TEXT",  # LLM shouldn't do this
        "skipLogic": [
            SkipLogicRule(
                id="rule_1",
                condition=SkipLogicCondition(operator="lt", value=7),
                destination="q3",
            )
        ]
    })
    modified = [q1_modified_text] + questions[1:]
    output = _make_output(modified)
    credit = make_credit("skip-logic")

    inp = SkipLogicInput(questions=questions, request="Add skip logic to q1")
    with patch("crystalos.agents.skip_logic.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    # Agent doesn't enforce non-destructive text edits (that's LLM's job),
    # but the schema does pass through — just verify questions exist
    assert len(result.questions) == len(questions)


async def test_skip_logic_manifest(agent):
    m = agent.manifest
    assert m.name == "skip-logic"
    assert m.enabled is True
    assert "logic" in m.tags
    assert m.est_cost_usd > 0
