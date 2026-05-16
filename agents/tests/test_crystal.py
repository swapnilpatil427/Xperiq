"""Unit tests for the Crystal conversational AI analyst agent."""
import pytest
from unittest.mock import AsyncMock, patch

from agents.agents.crystal import (
    CrystalAgent,
    CrystalInput,
    CrystalOutput,
    _build_insights_context,
    _build_topics_context,
    _build_metrics_context,
    _build_system_prompt,
)
from tests.conftest import make_credit


# ── Fixtures ─────────────────────────────────────────────────────────────────────

SAMPLE_INSIGHTS = [
    {
        "id": "ins-001",
        "layer": "descriptive",
        "category": "metric.nps",
        "headline": "NPS score is 42",
        "narrative": "Based on 250 responses, promoters outnumber detractors 2:1.",
        "metric_json": {"value": 42, "sample_size": 250},
        "trust_score": 0.95,
    },
    {
        "id": "ins-002",
        "layer": "diagnostic",
        "category": "driver.negative",
        "headline": "Shipping delays drive 38% of detractors",
        "narrative": "Customers who rated shipping negatively gave NPS scores below 4.",
        "metric_json": {"pct": 38},
        "trust_score": 0.87,
    },
    {
        "id": "ins-003",
        "layer": "prescriptive",
        "category": "action",
        "headline": "Prioritize shipping SLA improvement",
        "narrative": "Reducing average delivery time by 1 day is estimated to lift NPS by 6 points.",
        "metric_json": None,
        "trust_score": 0.72,
    },
]

SAMPLE_TOPICS = [
    {"name": "Shipping", "volume": 120, "sentiment_score": -0.4, "dominant_emotion": "frustration", "effort_score": 0.8, "trending": True},
    {"name": "Product Quality", "volume": 80, "sentiment_score": 0.7, "dominant_emotion": "delight", "effort_score": 0.2, "trending": False},
]

SAMPLE_METRICS = {
    "nps":  {"score": 42, "n": 250},
    "csat": {"score": 3.8, "n": 180},
    "response_count": 250,
}


@pytest.fixture
def agent():
    return CrystalAgent()


@pytest.fixture
def basic_input():
    return CrystalInput(
        survey_id="survey-abc",
        org_id="org-xyz",
        message="What is driving our low NPS?",
        insights=SAMPLE_INSIGHTS,
        topics=SAMPLE_TOPICS,
        survey_title="Q1 2025 Customer Satisfaction",
        survey_response_count=250,
        metrics=SAMPLE_METRICS,
    )


def _make_output(answer="The main driver of low NPS is shipping delays.", **kwargs):
    return CrystalOutput(
        answer=answer,
        citations=kwargs.get("citations", ["ins-002"]),
        suggestions=kwargs.get("suggestions", [
            "Which shipping regions are worst affected?",
            "How does this compare to last quarter?",
            "What should we do to improve shipping scores?",
        ]),
        insight_refs=kwargs.get("insight_refs", ["ins-002"]),
    )


# ── CrystalInput model validation ────────────────────────────────────────────────

def test_crystal_input_minimal():
    """CrystalInput works with only required fields."""
    inp = CrystalInput(
        survey_id="s1",
        org_id="o1",
        message="Tell me about this survey.",
        insights=[],
    )
    assert inp.survey_id == "s1"
    assert inp.org_id == "o1"
    assert inp.topics == []
    assert inp.conversation_history == []
    assert inp.metrics == {}
    assert inp.survey_response_count == 0


def test_crystal_input_with_all_fields():
    """CrystalInput correctly stores all optional fields."""
    history = [
        {"role": "user", "content": "What is NPS?"},
        {"role": "assistant", "content": "NPS is Net Promoter Score."},
    ]
    inp = CrystalInput(
        survey_id="s2",
        org_id="o2",
        message="What's driving low NPS?",
        insights=SAMPLE_INSIGHTS,
        topics=SAMPLE_TOPICS,
        survey_title="My Survey",
        survey_response_count=300,
        metrics=SAMPLE_METRICS,
        conversation_history=history,
    )
    assert inp.survey_title == "My Survey"
    assert inp.survey_response_count == 300
    assert len(inp.conversation_history) == 2
    assert len(inp.insights) == 3
    assert len(inp.topics) == 2


def test_crystal_input_rejects_missing_required_fields():
    """CrystalInput raises ValidationError when required fields are missing."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        CrystalInput(org_id="o1", message="hello", insights=[])  # missing survey_id


# ── System prompt construction ────────────────────────────────────────────────────

def test_system_prompt_contains_survey_title(basic_input):
    """System prompt includes the survey title."""
    prompt = _build_system_prompt(basic_input)
    assert "Q1 2025 Customer Satisfaction" in prompt


def test_system_prompt_contains_insight_ids(basic_input):
    """System prompt includes insight IDs in brackets so Crystal can cite them."""
    prompt = _build_system_prompt(basic_input)
    assert "[ins-001]" in prompt
    assert "[ins-002]" in prompt
    assert "[ins-003]" in prompt


def test_system_prompt_contains_insight_headlines(basic_input):
    """System prompt includes insight headlines."""
    prompt = _build_system_prompt(basic_input)
    assert "NPS score is 42" in prompt
    assert "Shipping delays drive 38% of detractors" in prompt


def test_system_prompt_contains_topics(basic_input):
    """System prompt includes topic names."""
    prompt = _build_system_prompt(basic_input)
    assert "Shipping" in prompt
    assert "Product Quality" in prompt


def test_system_prompt_contains_metrics(basic_input):
    """System prompt includes key metrics."""
    prompt = _build_system_prompt(basic_input)
    assert "42" in prompt      # NPS score
    assert "250" in prompt     # response count


def test_system_prompt_instructs_no_survey_changes(basic_input):
    """System prompt tells Crystal not to recommend survey question changes."""
    prompt = _build_system_prompt(basic_input)
    assert "survey builder" in prompt.lower() or "copilot" in prompt.lower()


def test_system_prompt_uses_layer_grouping():
    """Insights are grouped by their layer (descriptive, diagnostic, etc.)."""
    inp = CrystalInput(
        survey_id="s",
        org_id="o",
        message="hi",
        insights=SAMPLE_INSIGHTS,
    )
    prompt = _build_system_prompt(inp)
    assert "WHAT (Descriptive)" in prompt
    assert "WHY (Diagnostic)" in prompt
    assert "ACTIONS (Prescriptive)" in prompt


# ── Context builder helpers ───────────────────────────────────────────────────────

def test_build_insights_context_empty():
    """Empty insight list returns a fallback message."""
    text, ids = _build_insights_context([])
    assert "No insights" in text
    assert ids == set()


def test_build_insights_context_groups_by_layer():
    """Insights are grouped by their layer heading."""
    text, ids = _build_insights_context(SAMPLE_INSIGHTS)
    assert "Descriptive" in text
    assert "Diagnostic" in text
    assert "Prescriptive" in text
    assert "ins-001" in text


def test_build_topics_context_empty():
    """Empty topics returns a sensible fallback."""
    result = _build_topics_context([])
    assert "No topics" in result


def test_build_topics_context_includes_topic_names():
    result = _build_topics_context(SAMPLE_TOPICS)
    assert "Shipping" in result
    assert "Product Quality" in result


def test_build_metrics_context_with_nps():
    result = _build_metrics_context({"nps": {"score": 42, "n": 200}}, response_count=200)
    assert "42" in result
    assert "200" in result


def test_build_metrics_context_empty():
    result = _build_metrics_context({}, 0)
    assert "No key metrics" in result


# ── Agent run: mocked LLM call ────────────────────────────────────────────────────

async def test_crystal_agent_run_returns_answer(agent, basic_input):
    """Agent.run() returns a CrystalOutput with a non-empty answer."""
    output = _make_output()
    credit = make_credit("crystal")

    with patch("agents.agents.crystal.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, credits = await agent.run(basic_input)

    assert isinstance(result, CrystalOutput)
    assert len(result.answer) > 0
    assert isinstance(credits, list)


async def test_crystal_agent_run_returns_suggestions(agent, basic_input):
    """Agent returns 2-3 follow-up suggestions."""
    output = _make_output()
    credit = make_credit("crystal")

    with patch("agents.agents.crystal.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(basic_input)

    assert len(result.suggestions) >= 1


async def test_crystal_agent_run_returns_citations(agent, basic_input):
    """Agent returns citation IDs from the insight list."""
    output = _make_output(citations=["ins-001", "ins-002"])
    credit = make_credit("crystal")

    with patch("agents.agents.crystal.call_agent", new=AsyncMock(return_value=(output, credit))):
        result, _ = await agent.run(basic_input)

    assert "ins-001" in result.citations or "ins-002" in result.citations


async def test_crystal_agent_passes_conversation_history(agent):
    """Conversation history is passed to the LLM as prior_messages."""
    history = [
        {"role": "user",      "content": "What is our NPS?"},
        {"role": "assistant", "content": "Your NPS is 42."},
    ]
    inp = CrystalInput(
        survey_id="s",
        org_id="o",
        message="Why is it 42?",
        insights=SAMPLE_INSIGHTS,
        conversation_history=history,
    )
    output = _make_output()
    credit = make_credit("crystal")

    captured = {}

    async def capture(agent_name, system, user, output_schema, current_tokens=0, prior_messages=None):
        captured["prior_messages"] = prior_messages
        return (output, credit)

    with patch("agents.agents.crystal.call_agent", new=capture):
        await agent.run(inp)

    # prior_messages should contain the history
    assert captured.get("prior_messages") is not None
    assert len(captured["prior_messages"]) == 2
    assert captured["prior_messages"][0]["role"] == "user"


async def test_crystal_agent_truncates_long_history(agent):
    """Conversation history is truncated to last 10 messages."""
    # 12 messages total — only last 10 should be sent
    history = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"message {i}"}
        for i in range(12)
    ]
    inp = CrystalInput(
        survey_id="s",
        org_id="o",
        message="Follow-up question",
        insights=[],
        conversation_history=history,
    )
    output = _make_output()
    credit = make_credit("crystal")

    captured = {}

    async def capture(agent_name, system, user, output_schema, current_tokens=0, prior_messages=None):
        captured["prior_messages"] = prior_messages
        return (output, credit)

    with patch("agents.agents.crystal.call_agent", new=capture):
        await agent.run(inp)

    assert len(captured["prior_messages"]) <= 10


async def test_crystal_agent_no_history_passes_none(agent):
    """When no conversation history, prior_messages is None."""
    inp = CrystalInput(
        survey_id="s",
        org_id="o",
        message="First question ever",
        insights=SAMPLE_INSIGHTS,
        conversation_history=[],
    )
    output = _make_output()
    credit = make_credit("crystal")

    captured = {}

    async def capture(agent_name, system, user, output_schema, current_tokens=0, prior_messages=None):
        captured["prior_messages"] = prior_messages
        return (output, credit)

    with patch("agents.agents.crystal.call_agent", new=capture):
        await agent.run(inp)

    assert captured.get("prior_messages") is None


async def test_crystal_agent_uses_crystal_agent_name(agent, basic_input):
    """Crystal always calls the LLM with agent_name='crystal'."""
    output = _make_output()
    credit = make_credit("crystal")

    captured = {}

    async def capture(agent_name, system, user, output_schema, current_tokens=0, prior_messages=None):
        captured["agent_name"] = agent_name
        return (output, credit)

    with patch("agents.agents.crystal.call_agent", new=capture):
        await agent.run(basic_input)

    assert captured["agent_name"] == "crystal"


async def test_crystal_agent_user_message_passed_correctly(agent):
    """The user's exact message is forwarded as the `user` argument to call_agent."""
    inp = CrystalInput(
        survey_id="s",
        org_id="o",
        message="Summarize findings for my VP",
        insights=SAMPLE_INSIGHTS,
    )
    output = _make_output()
    credit = make_credit("crystal")

    captured = {}

    async def capture(agent_name, system, user, output_schema, current_tokens=0, prior_messages=None):
        captured["user"] = user
        return (output, credit)

    with patch("agents.agents.crystal.call_agent", new=capture):
        await agent.run(inp)

    assert captured["user"] == "Summarize findings for my VP"


# ── CrystalOutput model ───────────────────────────────────────────────────────────

def test_crystal_output_defaults():
    """CrystalOutput optional fields default to empty lists."""
    out = CrystalOutput(answer="Some answer")
    assert out.citations == []
    assert out.suggestions == []
    assert out.insight_refs == []


def test_crystal_output_full():
    """CrystalOutput stores all fields correctly."""
    out = CrystalOutput(
        answer="NPS is driven by shipping.",
        citations=["ins-002"],
        suggestions=["What regions are worst?", "How to fix shipping?"],
        insight_refs=["ins-002", "ins-003"],
    )
    assert out.answer == "NPS is driven by shipping."
    assert len(out.citations) == 1
    assert len(out.suggestions) == 2
    assert len(out.insight_refs) == 2
