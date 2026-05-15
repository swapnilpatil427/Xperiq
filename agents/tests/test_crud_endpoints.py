"""Unit tests for the CRUD endpoints in main.py.

Tests call the FastAPI handler functions directly (not via HTTP) with mocked DB.
This avoids spinning up the lifespan (DB pool + LangGraph build) and keeps tests fast.

Endpoints covered:
  - add_question
  - remove_question
  - patch_question
  - reorder_questions
  - _dispatch_recommendation (noop, skiplogic, refine, add-followup paths)
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException

from agents.main import (
    add_question,
    remove_question,
    patch_question,
    reorder_questions,
    _dispatch_recommendation,
)
from agents.schemas.output import (
    AddQuestionRequest,
    PatchQuestionRequest,
    ReorderRequest,
    SkipLogicInput, SkipLogicOutput,
    CopilotInput, CopilotOutput,
    OrgContext,
)
from agents.schemas.question import Question, SkipLogicRule, SkipLogicCondition
from tests.conftest import SAMPLE_QUESTIONS


# ── Shared fixtures ───────────────────────────────────────────────────────────────

QUESTIONS = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]

def _mock_row(questions=None):
    """Fake DB row with serialized questions."""
    qs = questions or SAMPLE_QUESTIONS
    return {
        "id": "run-1",
        "thread_id": "t-1",
        "status": "completed",
        "org_id": "org-1",
        "intent": "measure satisfaction",
        "result_questions": [dict(q) for q in qs] if qs and isinstance(qs[0], dict) else
                            [q.model_dump(by_alias=True, exclude_none=True) for q in qs],
        "stream_events": [],
        "credit_log": [],
        "qc_score": 8.5,
        "compliance_risk_level": "low",
        "error_log": [],
        "qc_validation_errors": [],
        "recommendations": [],
    }


# ── add_question ──────────────────────────────────────────────────────────────────

async def test_add_question_appends_to_end():
    body = AddQuestionRequest(org_id="org-1", type="open_text", after_id=None)
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()) as save_mock:
            result = await add_question(run_id="run-1", body=body, _key=None)

    assert len(result.questions) == 6          # 5 + 1
    assert result.questions[-1].type == "open_text"
    assert result.questions[-1].id == "q6"     # next sequential ID
    save_mock.assert_called_once()


async def test_add_question_inserts_after_specified_id():
    body = AddQuestionRequest(org_id="org-1", type="rating", after_id="q2")
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await add_question(run_id="run-1", body=body, _key=None)

    ids = [q.id for q in result.questions]
    q2_pos = ids.index("q2")
    # New question must come right after q2
    assert result.questions[q2_pos + 1].type == "rating"


async def test_add_question_assigns_unique_id():
    """Even with non-sequential existing IDs, new ID must be max+1."""
    sparse = [
        {"id": "q1", "type": "nps",       "question": "A?"},
        {"id": "q3", "type": "open_text", "question": "B?"},  # q2 missing
        {"id": "q5", "type": "rating",    "question": "C?", "scaleMax": 5},
    ]
    body = AddQuestionRequest(org_id="org-1", type="open_text")
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row(sparse))):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await add_question(run_id="run-1", body=body, _key=None)

    assert result.questions[-1].id == "q6"  # max(1,3,5) + 1 = 6


async def test_add_question_404_on_missing_run():
    body = AddQuestionRequest(org_id="org-1", type="open_text")
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=None)):
        with pytest.raises(HTTPException) as exc:
            await add_question(run_id="no-such-run", body=body, _key=None)
    assert exc.value.status_code == 404


# ── remove_question ───────────────────────────────────────────────────────────────

async def test_remove_question_deletes_by_id():
    request = MagicMock()
    request.query_params = {"org_id": "org-1"}
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await remove_question(run_id="run-1", q_id="q3", request=request, _key=None)

    assert len(result.questions) == 4
    assert all(q.id != "q3" for q in result.questions)


async def test_remove_question_cleans_skip_rules_referencing_it():
    """When q3 is removed, any skip rule pointing to q3 must also be removed."""
    from agents.schemas.question import SkipLogicRule, SkipLogicCondition
    q1_with_skip = SAMPLE_QUESTIONS[0].copy()
    qs_raw = SAMPLE_QUESTIONS.copy()
    # Manually inject skip rule pointing to q3
    qs_as_dicts = [dict(q) for q in SAMPLE_QUESTIONS]
    qs_as_dicts[0]["skipLogic"] = [
        {"id": "rule_1", "condition": {"operator": "lt", "value": 7}, "destination": "q3"}
    ]

    request = MagicMock()
    request.query_params = {"org_id": "org-1"}
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row(qs_as_dicts))):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await remove_question(run_id="run-1", q_id="q3", request=request, _key=None)

    q1 = next(q for q in result.questions if q.id == "q1")
    # Skip rule targeting q3 must be gone
    if q1.skipLogic:
        assert all(r.destination != "q3" for r in q1.skipLogic)


async def test_remove_question_cleans_display_logic_referencing_it():
    """When q2 is removed, displayLogic on other questions sourcing q2 must be cleared."""
    qs_as_dicts = [dict(q) for q in SAMPLE_QUESTIONS]
    qs_as_dicts[3]["displayLogic"] = {
        "sourceQuestionId": "q2", "operator": "lt", "value": 3
    }

    request = MagicMock()
    request.query_params = {"org_id": "org-1"}
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row(qs_as_dicts))):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await remove_question(run_id="run-1", q_id="q2", request=request, _key=None)

    q4 = next(q for q in result.questions if q.id == "q4")
    assert q4.displayLogic is None


async def test_remove_question_404_on_missing_q_id():
    request = MagicMock()
    request.query_params = {"org_id": "org-1"}
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with pytest.raises(HTTPException) as exc:
            await remove_question(run_id="run-1", q_id="q99", request=request, _key=None)
    assert exc.value.status_code == 404


# ── patch_question ────────────────────────────────────────────────────────────────

async def test_patch_question_updates_field():
    body = PatchQuestionRequest(org_id="org-1", fields={"required": False})
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await patch_question(run_id="run-1", q_id="q1", body=body, _key=None)

    q1 = next(q for q in result.questions if q.id == "q1")
    assert q1.required is False


async def test_patch_question_cannot_change_id():
    """Even if 'id' is in fields, it must be ignored."""
    body = PatchQuestionRequest(org_id="org-1", fields={"id": "q99", "required": False})
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await patch_question(run_id="run-1", q_id="q1", body=body, _key=None)

    q = next(q for q in result.questions if q.required is False and q.id != "q99")
    assert q.id == "q1"  # ID must remain q1, not q99


async def test_patch_question_422_on_invalid_field():
    """Patching with invalid Pydantic values must raise 422."""
    body = PatchQuestionRequest(org_id="org-1", fields={"scaleMax": "not-an-int"})
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            with pytest.raises(HTTPException) as exc:
                await patch_question(run_id="run-1", q_id="q2", body=body, _key=None)
    assert exc.value.status_code == 422


async def test_patch_question_404_on_missing_q_id():
    body = PatchQuestionRequest(org_id="org-1", fields={"required": False})
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with pytest.raises(HTTPException) as exc:
            await patch_question(run_id="run-1", q_id="q99", body=body, _key=None)
    assert exc.value.status_code == 404


# ── reorder_questions ─────────────────────────────────────────────────────────────

async def test_reorder_applies_new_order():
    body = ReorderRequest(org_id="org-1", order=["q5", "q4", "q3", "q2", "q1"])
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await reorder_questions(run_id="run-1", body=body, _key=None)

    ids = [q.id for q in result.questions]
    assert ids == ["q5", "q4", "q3", "q2", "q1"]


async def test_reorder_appends_unlisted_questions():
    """Questions not in the order list are appended at the end."""
    body = ReorderRequest(org_id="org-1", order=["q3", "q1"])  # q2, q4, q5 not listed
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with patch("agents.main.db.save_run_questions", new=AsyncMock()):
            result = await reorder_questions(run_id="run-1", body=body, _key=None)

    ids = [q.id for q in result.questions]
    assert ids[:2] == ["q3", "q1"]
    assert set(ids) == {"q1", "q2", "q3", "q4", "q5"}  # all questions present


async def test_reorder_422_on_unknown_id():
    body = ReorderRequest(org_id="org-1", order=["q1", "q99"])
    with patch("agents.main.db.get_run_by_id", new=AsyncMock(return_value=_mock_row())):
        with pytest.raises(HTTPException) as exc:
            await reorder_questions(run_id="run-1", body=body, _key=None)
    assert exc.value.status_code == 422


# ── _dispatch_recommendation ──────────────────────────────────────────────────────

async def test_dispatch_noop_action_returns_unchanged_questions():
    qs = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    updated, msg = await _dispatch_recommendation(
        action_id="distribute_now",
        questions=qs,
        params={},
        org_context=OrgContext(),
        survey_type_id=None,
        intent="",
    )
    assert updated is qs    # same list object — no mutation
    assert "distribute_now" in msg


async def test_dispatch_all_noop_actions_return_same_questions():
    noop_actions = [
        "run_pilot", "request_expert_review", "check_compliance",
        "distribute_now", "schedule_send", "set_response_quota",
        "compare_template", "compare_previous_survey",
        "save_as_template", "set_expiry_date",
    ]
    qs = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    for action in noop_actions:
        updated, _ = await _dispatch_recommendation(
            action_id=action, questions=qs, params={},
            org_context=OrgContext(), survey_type_id=None, intent="",
        )
        assert updated is qs, f"Noop action '{action}' must not modify questions"


async def test_dispatch_skip_logic_action_calls_agent():
    qs = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    mock_output = SkipLogicOutput(
        questions=qs, changes=[], summary="Skip logic added."
    )
    with patch("agents.main.skip_logic_agent.run", new=AsyncMock(return_value=(mock_output, []))):
        updated, msg = await _dispatch_recommendation(
            action_id="add_skip_logic",
            questions=qs,
            params={"request": "Add NPS branching"},
            org_context=OrgContext(),
            survey_type_id=None,
            intent="",
        )
    assert updated == qs
    assert "Skip logic added" in msg


async def test_dispatch_add_piping_logic_calls_skip_agent():
    qs = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    mock_output = SkipLogicOutput(questions=qs, changes=[], summary="Piping added.")
    with patch("agents.main.skip_logic_agent.run", new=AsyncMock(return_value=(mock_output, []))):
        _, msg = await _dispatch_recommendation(
            action_id="add_piping_logic",
            questions=qs, params={}, org_context=OrgContext(),
            survey_type_id=None, intent="",
        )
    assert "Piping added" in msg


async def test_dispatch_refine_with_question_id_calls_refiner():
    qs = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    from agents.schemas.output import RefinerOutput
    mock_refined = qs[0].model_copy(update={"question": "How likely are you to recommend us? (0-10)"})
    mock_output = RefinerOutput(
        refined_question=mock_refined,
        explanation="Made scale explicit.",
        type_was_preserved=True,
        validation_errors=[],
    )
    with patch("agents.main.refiner_agent.run", new=AsyncMock(return_value=(mock_output, []))):
        updated, msg = await _dispatch_recommendation(
            action_id="refine_question",
            questions=qs,
            params={"question_id": "q1", "feedback": "Make scale explicit"},
            org_context=OrgContext(),
            survey_type_id=None,
            intent="",
        )
    # q1 should be updated
    q1 = next(q for q in updated if q.id == "q1")
    assert "0-10" in q1.question


async def test_dispatch_add_followup_calls_copilot():
    qs = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    mock_output = CopilotOutput(
        questions=qs + [Question(id="q6", type="open_text", question="Why?", required=False)],
        explanation="Added follow-up.",
        changes=[{"question_id": "q6", "what_changed": "added"}],
        suggestions=[],
    )
    with patch("agents.main.copilot_agent.run", new=AsyncMock(return_value=(mock_output, []))):
        updated, msg = await _dispatch_recommendation(
            action_id="add_followup_question",
            questions=qs,
            params={"topic": "a follow-up about why the NPS was low"},
            org_context=OrgContext(),
            survey_type_id=None,
            intent="",
        )
    assert len(updated) == 6


async def test_dispatch_unknown_action_raises_400():
    qs = [Question.model_validate(q) for q in SAMPLE_QUESTIONS]
    with pytest.raises(HTTPException) as exc:
        await _dispatch_recommendation(
            action_id="fly_to_the_moon",
            questions=qs, params={}, org_context=OrgContext(),
            survey_type_id=None, intent="",
        )
    assert exc.value.status_code == 400
