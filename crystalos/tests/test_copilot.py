"""Unit tests for the Copilot Chat Agent."""
import pytest
from unittest.mock import AsyncMock, patch

from crystalos.agents.copilot import CopilotAgent
from crystalos.schemas.output import CopilotInput, CopilotOutput, OrgContext
from crystalos.schemas.question import Question, SkipLogicRule, SkipLogicCondition, DisplayLogic
from tests.conftest import make_credit, SAMPLE_QUESTIONS


@pytest.fixture
def agent():
    return CopilotAgent()


@pytest.fixture
def questions():
    return [Question.model_validate(q) for q in SAMPLE_QUESTIONS]


@pytest.fixture
def org_context():
    return OrgContext(industry="technology", target_audience="enterprise customers")


def _make_output(questions, explanation="Done.", changes=None, suggestions=None):
    return CopilotOutput(
        questions=questions,
        explanation=explanation,
        changes=changes or [],
        suggestions=suggestions or [],
    )


# ── Skill-first wiring ───────────────────────────────────────────────────────────

def _fake_registry(execute_result):
    from unittest.mock import MagicMock
    reg = MagicMock()
    reg.is_initialized.return_value = True
    reg.get_skill_meta.return_value = {"name": "copilot-analyst"}
    reg.execute = AsyncMock(return_value=execute_result)
    return reg


async def test_copilot_uses_skill_when_eval_passes(agent, questions, org_context):
    """When copilot-analyst passes evals, its output is used (no legacy call)."""
    skill_result = {
        "eval_passed": True,
        "eval_score": 0.88,
        "retried": False,
        "output": {
            "questions": [
                {"id": q.id, "type": q.type, "text": q.question, "required": q.required}
                for q in questions
            ],
            "explanation": "Reworded q3 to be clearer.",
            "changes": [{"question_id": "q3", "change_type": "edit", "description": "clarity"}],
            "suggestions": ["Reorder for flow?"],
        },
    }
    legacy = AsyncMock()
    inp = CopilotInput(questions=questions, message="make q3 clearer", org_context=org_context)
    with (
        patch("crystalos.lib.skill_registry.get_registry", return_value=_fake_registry(skill_result)),
        patch("crystalos.agents.copilot.call_agent", new=legacy),
    ):
        result, credits = await agent.run(inp)

    assert isinstance(result, CopilotOutput)
    assert result.explanation.startswith("Reworded q3")
    assert result.changes[0].question_id == "q3"
    legacy.assert_not_called()


async def test_copilot_falls_back_when_skill_eval_fails(agent, questions, org_context):
    """When the skill fails evals, the legacy call_agent path runs."""
    skill_result = {"eval_passed": False, "output": {}}
    output = _make_output(questions, explanation="legacy path")
    credit = make_credit("copilot")
    legacy = AsyncMock(return_value=(output, credit))
    inp = CopilotInput(questions=questions, message="make q3 clearer", org_context=org_context)
    with (
        patch("crystalos.lib.skill_registry.get_registry", return_value=_fake_registry(skill_result)),
        patch("crystalos.agents.copilot.call_agent", new=legacy),
    ):
        result, credits = await agent.run(inp)

    assert result.explanation == "legacy path"
    legacy.assert_called_once()


# ── Basic operation ──────────────────────────────────────────────────────────────

async def test_copilot_refine_question_text(agent, questions, org_context):
    """Copilot can update question wording without changing ID or type."""
    updated = questions[2].model_copy(update={
        "question": "Which aspect of our service did you value most?"
    })
    modified = questions[:2] + [updated] + questions[3:]
    output = _make_output(
        modified,
        explanation="Reworded q3 to be less leading.",
        changes=[{"question_id": "q3", "what_changed": "improved wording"}],
        suggestions=["Would you like to reorder for better flow?"],
    )
    credit = make_credit("copilot")

    inp = CopilotInput(
        questions=questions,
        message="Make q3 less leading",
        org_context=org_context,
    )
    with patch("crystalos.agents.copilot.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, credits = await agent.run(inp)

    assert result.questions[2].id == "q3"          # ID preserved
    assert result.questions[2].type == "multiple_choice"  # type preserved
    assert len(result.changes) == 1
    assert len(credits) == 1


async def test_copilot_preserves_all_question_ids(agent, questions):
    """LLM cannot rename question IDs — originals must survive."""
    # LLM renames ids (should still be accepted since CopilotAgent allows new IDs)
    # but existing IDs should not vanish
    output = _make_output(questions)
    credit = make_credit("copilot")

    inp = CopilotInput(questions=questions, message="Improve overall flow")
    with patch("crystalos.agents.copilot.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    result_ids = {q.id for q in result.questions}
    original_ids = {q.id for q in questions}
    # All original IDs must still exist
    assert original_ids <= result_ids


async def test_copilot_returns_suggestions(agent, questions):
    """Copilot always returns follow-up suggestions."""
    output = _make_output(
        questions,
        suggestions=["Add skip logic to NPS?", "Add a demographic question?"],
    )
    credit = make_credit("copilot")

    inp = CopilotInput(questions=questions, message="Make all questions required")
    with patch("crystalos.agents.copilot.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    assert len(result.suggestions) == 2


# ── Skip logic validation ────────────────────────────────────────────────────────

async def test_copilot_strips_backward_skip_logic(agent, questions):
    """CopilotAgent guard removes skip destinations that point to earlier questions."""
    q4_bad_skip = questions[3].model_copy(update={
        "skipLogic": [
            SkipLogicRule(
                id="rule_1",
                condition=SkipLogicCondition(operator="eq", value="Speed"),
                destination="q1",  # backward — must be removed
            )
        ]
    })
    modified = questions[:3] + [q4_bad_skip] + questions[4:]
    output = _make_output(modified)
    credit = make_credit("copilot")

    inp = CopilotInput(questions=questions, message="Add skip logic to q4")
    with patch("crystalos.agents.copilot.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q4 = next(q for q in result.questions if q.id == "q4")
    assert q4.skipLogic is None or all(r.destination != "q1" for r in (q4.skipLogic or []))


async def test_copilot_strips_display_logic_with_nonexistent_source(agent, questions):
    """Guard removes displayLogic referencing an ID that doesn't exist in the survey."""
    q3_bad_display = questions[2].model_copy(update={
        "displayLogic": DisplayLogic(
            sourceQuestionId="q99",  # doesn't exist
            operator="eq",
            value="yes",
        )
    })
    modified = questions[:2] + [q3_bad_display] + questions[3:]
    output = _make_output(modified)
    credit = make_credit("copilot")

    inp = CopilotInput(questions=questions, message="Show q3 only if q99 is yes")
    with patch("crystalos.agents.copilot.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q3 = next(q for q in result.questions if q.id == "q3")
    assert q3.displayLogic is None


async def test_copilot_allows_valid_forward_skip(agent, questions):
    """Valid forward skip logic is preserved unchanged."""
    q1_forward = questions[0].model_copy(update={
        "skipLogic": [
            SkipLogicRule(
                id="rule_1",
                condition=SkipLogicCondition(operator="gte", value=9),
                destination="q5",  # forward — valid
            )
        ]
    })
    modified = [q1_forward] + questions[1:]
    output = _make_output(modified)
    credit = make_credit("copilot")

    inp = CopilotInput(questions=questions, message="If NPS >= 9 skip to final question")
    with patch("crystalos.agents.copilot.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    q1 = next(q for q in result.questions if q.id == "q1")
    assert q1.skipLogic is not None
    assert q1.skipLogic[0].destination == "q5"


# ── New question insertion ────────────────────────────────────────────────────────

async def test_copilot_accepts_new_question_with_fresh_id(agent, questions):
    """When LLM adds a new question, the result count increases."""
    new_q = Question(
        id="q6",
        type="open_text",
        question="What would make you recommend us to a colleague?",
        required=False,
    )
    extended = questions + [new_q]
    output = _make_output(
        extended,
        explanation="Added follow-up open text question at the end.",
        changes=[{"question_id": "q6", "what_changed": "added"}],
    )
    credit = make_credit("copilot")

    inp = CopilotInput(questions=questions, message="Add a follow-up recommendation question")
    with patch("crystalos.agents.copilot.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(inp)

    assert len(result.questions) == 6
    assert result.questions[-1].id == "q6"


# ── Context passthrough ──────────────────────────────────────────────────────────

async def test_copilot_passes_org_context_to_llm(agent, questions):
    """Org context is passed to the LLM system prompt (indirect: no error thrown)."""
    output = _make_output(questions)
    credit = make_credit("copilot")

    ctx = OrgContext(industry="healthcare", target_audience="patients", region="EU")
    inp = CopilotInput(
        questions=questions,
        message="Make the survey GDPR-compliant",
        org_context=ctx,
        survey_type_id="cx",
        intent="measure patient satisfaction",
    )

    captured = {}
    async def capture_call_agent(agent_name, system, user, output_schema, current_tokens=0, prior_messages=None):
        captured["system"] = system
        captured["user"] = user
        return (output, credit)

    with patch("crystalos.agents.copilot.call_agent", new=capture_call_agent):
        await agent.run(inp)

    assert "healthcare" in captured["system"]
    assert "patients" in captured["system"]


# ── Manifest ─────────────────────────────────────────────────────────────────────

async def test_copilot_manifest(agent):
    m = agent.manifest
    assert m.name == "copilot"
    assert m.enabled is True
    assert "copilot" in m.tags
    assert "editing" in m.tags
    assert m.est_cost_usd > 0
