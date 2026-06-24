"""Tests for the real Crystal ReAct loop — LLM-driven tool selection with arguments,
error-correction, and de-duplication. Exercises _react_plan_tools directly so no
synthesis/eval/LLM-network is needed."""
import pytest
from unittest.mock import AsyncMock, patch

from crystalos.agents.crystal import (
    CrystalInput,
    ReActStep,
    ReActToolCall,
    _react_plan_tools,
)
from crystalos.crystal.context import CrystalContext
from tests.conftest import make_credit


def _ctx():
    return CrystalContext(org_id="org-1", user_id="u-1", survey_id="s-1", scope="survey")


def _inp(message="What does the data say?"):
    return CrystalInput(survey_id="s-1", org_id="org-1", message=message, insights=[])


def _call_agent_steps(steps):
    """Async call_agent stub that returns successive ReActStep objects (last repeats)."""
    state = {"i": 0}

    async def _fn(agent_name, system, user, output_schema, current_tokens=0, prior_messages=None):
        i = min(state["i"], len(steps) - 1)
        state["i"] += 1
        return (steps[i], make_credit("crystal"))

    return _fn


async def _drive(inp, ctx):
    events, results = [], []
    async for kind, payload in _react_plan_tools(inp, ctx):
        if kind == "event":
            events.append(payload)
        else:
            results = payload
    return events, results


@pytest.mark.asyncio
async def test_loop_dispatches_llm_chosen_tool_with_args():
    """The tool and arguments the LLM emits are passed through to dispatch_tool,
    with survey_id injected from context."""
    steps = [
        ReActStep(action="tool_call", tool_calls=[
            ReActToolCall(tool="get_topic_details", args={"topic_name": "Shipping"})
        ]),
        ReActStep(action="final", answer="done"),
    ]
    dispatched = []

    async def fake_dispatch(name, ctx, params):
        dispatched.append((name, params))
        return {"topic": {"name": "Shipping"}, "verbatims": []}

    with (
        patch("crystalos.agents.crystal.call_agent", new=_call_agent_steps(steps)),
        patch("crystalos.crystal.tools.dispatch_tool", new=fake_dispatch),
    ):
        events, results = await _drive(_inp("Tell me about shipping"), _ctx())

    assert dispatched == [("get_topic_details", {"topic_name": "Shipping", "survey_id": "s-1"})]
    assert any(e["type"] == "thinking" for e in events)
    assert any(e["type"] == "observation" for e in events)
    assert results[0]["tool"] == "get_topic_details"


@pytest.mark.asyncio
async def test_tool_error_is_kept_and_loop_can_correct():
    """A tool error is retained (so the LLM can see it) and the loop proceeds to a
    corrective tool on the next turn."""
    steps = [
        ReActStep(action="tool_call", tool_calls=[ReActToolCall(tool="analyze_segments", args={})]),
        ReActStep(action="tool_call", tool_calls=[ReActToolCall(tool="list_segmentable_questions", args={})]),
        ReActStep(action="final", answer="done"),
    ]
    dispatched = []

    async def fake_dispatch(name, ctx, params):
        dispatched.append(name)
        if name == "analyze_segments":
            return {"error": "segment_question_id required", "available_segments": []}
        return {"questions": [{"id": "q1", "text": "Region", "type": "dropdown"}], "count": 1}

    with (
        patch("crystalos.agents.crystal.call_agent", new=_call_agent_steps(steps)),
        patch("crystalos.crystal.tools.dispatch_tool", new=fake_dispatch),
    ):
        events, results = await _drive(_inp("How does it differ by region?"), _ctx())

    assert dispatched == ["analyze_segments", "list_segmentable_questions"]
    # the error result is kept in the accumulated results so the model could correct
    assert any("error" in r["result"] for r in results)
    assert any(r["tool"] == "list_segmentable_questions" for r in results)


@pytest.mark.asyncio
async def test_duplicate_tool_call_is_not_run_twice():
    """The same tool with the same args is de-duplicated across turns to avoid loops."""
    steps = [
        ReActStep(action="tool_call", tool_calls=[ReActToolCall(tool="get_metric_history", args={})]),
        ReActStep(action="tool_call", tool_calls=[ReActToolCall(tool="get_metric_history", args={})]),
        ReActStep(action="final", answer="done"),
    ]
    count = {"n": 0}

    async def fake_dispatch(name, ctx, params):
        count["n"] += 1
        return {"history": [], "count": 0}

    with (
        patch("crystalos.agents.crystal.call_agent", new=_call_agent_steps(steps)),
        patch("crystalos.crystal.tools.dispatch_tool", new=fake_dispatch),
    ):
        await _drive(_inp(), _ctx())

    assert count["n"] == 1


@pytest.mark.asyncio
async def test_final_action_with_no_tools_runs_nothing():
    """When the LLM immediately answers, no tools are dispatched."""
    steps = [ReActStep(action="final", answer="hi")]
    dispatched = []

    async def fake_dispatch(name, ctx, params):
        dispatched.append(name)
        return {}

    with (
        patch("crystalos.agents.crystal.call_agent", new=_call_agent_steps(steps)),
        patch("crystalos.crystal.tools.dispatch_tool", new=fake_dispatch),
    ):
        events, results = await _drive(_inp("hello"), _ctx())

    assert dispatched == []
    assert results == []
