"""Unit tests for the Crystal conversational AI analyst agent."""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

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


# ── TestGetOrCreateThread ─────────────────────────────────────────────────────────

class TestGetOrCreateThread:
    """Tests for get_or_create_thread() in agents/agents/crystal.py."""

    def _make_ctx(self, org_id="org-1", user_id="user-1", survey_id="survey-1", scope="survey"):
        from dataclasses import dataclass

        @dataclass
        class FakeCtx:
            org_id: str
            user_id: str
            survey_id: str
            scope: str

        return FakeCtx(org_id=org_id, user_id=user_id, survey_id=survey_id, scope=scope)

    def _make_mock_pool(self, fetchone_return=None):
        """Return a MagicMock that mimics db._pool_conn().connection().__aenter__."""
        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchone = AsyncMock(return_value=fetchone_return)
        mock_cur.description = []
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__ = AsyncMock(return_value=False)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.commit = AsyncMock()
        mock_conn.cursor = MagicMock(return_value=mock_cur)
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)

        mock_pool_ctx = MagicMock()
        mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_pool_ctx)

        return mock_pool, mock_cur, mock_conn

    @pytest.mark.asyncio
    async def test_thread_continues_when_recently_active(self):
        """Thread is returned as-is when last_active_at is < 7 days ago."""
        from datetime import datetime, timezone, timedelta
        from agents.agents.crystal import get_or_create_thread

        recent = datetime.now(timezone.utc) - timedelta(days=2)
        thread_row = ("thread-uuid-1", [{"role": "user", "content": "hi"}], recent, 1)

        mock_pool, mock_cur, mock_conn = self._make_mock_pool(fetchone_return=thread_row)

        with patch("agents.lib.db._pool_conn", return_value=mock_pool):
            result = await get_or_create_thread(self._make_ctx(), db_pool=None)

        assert result["id"] == "thread-uuid-1"
        assert result["is_new"] is False
        assert isinstance(result["messages"], list)

    @pytest.mark.asyncio
    async def test_thread_resets_when_stale(self):
        """Thread resets (is_new=True) when last_active_at is 8+ days ago."""
        from datetime import datetime, timezone, timedelta
        from agents.agents.crystal import get_or_create_thread

        stale = datetime.now(timezone.utc) - timedelta(days=9)
        thread_row = ("thread-uuid-2", [], stale, 5)

        mock_pool, mock_cur, mock_conn = self._make_mock_pool(fetchone_return=thread_row)

        with patch("agents.lib.db._pool_conn", return_value=mock_pool):
            result = await get_or_create_thread(self._make_ctx(), db_pool=None)

        assert result["is_new"] is True
        assert result["messages"] == []

    @pytest.mark.asyncio
    async def test_new_thread_created_when_none_exists(self):
        """Returns is_new=True when no thread exists for the user/survey."""
        from agents.agents.crystal import get_or_create_thread

        import uuid
        new_id = uuid.uuid4()

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        # First fetchone: no existing thread; second fetchone: new row id
        mock_cur.fetchone = AsyncMock(side_effect=[None, (new_id,)])
        mock_cur.description = []
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__ = AsyncMock(return_value=False)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.commit = AsyncMock()
        mock_conn.cursor = MagicMock(return_value=mock_cur)
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)

        mock_pool_ctx = MagicMock()
        mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_pool_ctx)

        with patch("agents.lib.db._pool_conn", return_value=mock_pool):
            result = await get_or_create_thread(self._make_ctx(), db_pool=None)

        assert result["is_new"] is True
        assert result["messages"] == []

    @pytest.mark.asyncio
    async def test_db_failure_returns_safe_fallback(self):
        """DB failure returns safe fallback dict without raising."""
        from agents.agents.crystal import get_or_create_thread

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(side_effect=Exception("DB down"))

        with patch("agents.lib.db._pool_conn", return_value=mock_pool):
            result = await get_or_create_thread(self._make_ctx(), db_pool=None)

        assert result["id"] is None
        assert result["messages"] == []
        assert result["is_new"] is True


# ── TestReactLoop ─────────────────────────────────────────────────────────────────

class TestReactLoop:
    """Tests for _run_react_loop()."""

    def _make_input(self, **kwargs):
        defaults = dict(
            survey_id="s-1",
            org_id="org-1",
            message="What is our NPS?",
            insights=SAMPLE_INSIGHTS,
            topics=SAMPLE_TOPICS,
            metrics=SAMPLE_METRICS,
        )
        defaults.update(kwargs)
        return CrystalInput(**defaults)

    @pytest.mark.asyncio
    async def test_returns_crystal_output_with_answer(self):
        """_run_react_loop returns a CrystalOutput with a non-empty answer."""
        from agents.agents.crystal import _run_react_loop

        mock_output = _make_output()

        with (
            patch("agents.agents.crystal.call_agent", new=AsyncMock(return_value=(mock_output, []))),
            patch("agents.agents.crystal._build_system_prompt_agentic", return_value="system prompt"),
            patch("redis.asyncio.from_url", new=AsyncMock(side_effect=Exception("no redis"))),
        ):
            result = await _run_react_loop(self._make_input())

        assert isinstance(result, CrystalOutput)
        assert len(result.answer) > 0

    @pytest.mark.asyncio
    async def test_rate_limit_exceeded_raises_value_error(self):
        """When Redis rate limit count > 10, raises ValueError."""
        from agents.agents.crystal import _run_react_loop

        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=11)
        mock_redis.expire = AsyncMock()
        mock_redis.close = AsyncMock()

        with patch("redis.asyncio.from_url", new=AsyncMock(return_value=mock_redis)):
            with pytest.raises(ValueError, match="Rate limit"):
                await _run_react_loop(self._make_input())

    @pytest.mark.asyncio
    async def test_history_limited_to_conversation_window(self):
        """History passed to call_agent is limited to CRYSTAL_CONVERSATION_WINDOW * 2 messages."""
        from agents.agents.crystal import _run_react_loop
        from agents.lib.constants import CRYSTAL_CONVERSATION_WINDOW

        # Build history with more than the window
        long_history = [
            {"role": "user" if i % 2 == 0 else "assistant", "content": f"msg {i}"}
            for i in range(CRYSTAL_CONVERSATION_WINDOW * 2 + 6)
        ]

        captured = {}

        async def capture_call(agent_name, system, user, output_schema, prior_messages=None):
            captured["prior_messages"] = prior_messages
            return (_make_output(), [])

        with (
            patch("agents.agents.crystal.call_agent", new=capture_call),
            patch("agents.agents.crystal._build_system_prompt_agentic", return_value="sys"),
            patch("redis.asyncio.from_url", new=AsyncMock(side_effect=Exception("no redis"))),
        ):
            await _run_react_loop(self._make_input(conversation_history=long_history))

        prior = captured.get("prior_messages") or []
        assert len(prior) <= CRYSTAL_CONVERSATION_WINDOW * 2


# ── TestReactLoopStreaming ─────────────────────────────────────────────────────────

class TestReactLoopStreaming:
    """Tests for _run_react_loop_streaming()."""

    def _make_input(self, **kwargs):
        defaults = dict(
            survey_id="s-1",
            org_id="org-1",
            message="What themes are emerging?",
            insights=SAMPLE_INSIGHTS,
        )
        defaults.update(kwargs)
        return CrystalInput(**defaults)

    async def _collect_events(self, inp, extra_patches=None):
        import json as _json
        from agents.agents.crystal import _run_react_loop_streaming

        events = []
        # dispatch_tool is imported locally inside the function, patch at source
        mock_dispatch = AsyncMock(return_value={"overview": "test data"})
        mock_call_agent = AsyncMock(return_value=(_make_output(), []))

        patches_ctx = [
            patch("agents.crystal.tools.dispatch_tool", new=mock_dispatch),
            patch("agents.agents.crystal.call_agent", new=mock_call_agent),
            patch("redis.asyncio.from_url", new=AsyncMock(side_effect=Exception("no redis"))),
        ]
        if extra_patches:
            for target, mock_val in extra_patches.items():
                patches_ctx.append(patch(target, new=mock_val))

        import contextlib
        with contextlib.ExitStack() as stack:
            for p in patches_ctx:
                stack.enter_context(p)
            async for event_str in _run_react_loop_streaming(inp):
                events.append(_json.loads(event_str))

        return events

    @pytest.mark.asyncio
    async def test_events_contain_type_field(self):
        """All yielded events have a 'type' field."""
        events = await self._collect_events(self._make_input())
        assert all("type" in e for e in events)

    @pytest.mark.asyncio
    async def test_first_tool_event_is_thinking(self):
        """The first event per tool has type == 'thinking'."""
        events = await self._collect_events(self._make_input())
        thinking_events = [e for e in events if e.get("type") == "thinking"]
        assert len(thinking_events) >= 1

    @pytest.mark.asyncio
    async def test_observation_follows_thinking(self):
        """An 'observation' event follows each 'thinking' event when tool succeeds."""
        events = await self._collect_events(self._make_input())
        types = [e["type"] for e in events]
        # Find first thinking and verify observation comes after it
        if "thinking" in types:
            first_thinking_idx = types.index("thinking")
            # An observation should appear somewhere after the first thinking
            post_thinking_types = types[first_thinking_idx + 1:]
            assert "observation" in post_thinking_types

    @pytest.mark.asyncio
    async def test_synthesizing_event_before_answer(self):
        """A 'synthesizing' event is always emitted before the 'answer' event."""
        events = await self._collect_events(self._make_input())
        types = [e["type"] for e in events]
        assert "synthesizing" in types
        assert "answer" in types
        assert types.index("synthesizing") < types.index("answer")

    @pytest.mark.asyncio
    async def test_last_event_is_answer(self):
        """The last event has type == 'answer' with an 'answer' field."""
        events = await self._collect_events(self._make_input())
        assert len(events) > 0
        last = events[-1]
        assert last["type"] == "answer"
        assert "answer" in last

    @pytest.mark.asyncio
    async def test_rate_limit_first_event_is_error(self):
        """When rate limit is exceeded, first event is type == 'error'."""
        import json as _json
        from agents.agents.crystal import _run_react_loop_streaming

        mock_redis = AsyncMock()
        mock_redis.incr = AsyncMock(return_value=11)
        mock_redis.expire = AsyncMock()
        mock_redis.close = AsyncMock()

        events = []
        with patch("redis.asyncio.from_url", new=AsyncMock(return_value=mock_redis)):
            async for event_str in _run_react_loop_streaming(self._make_input()):
                events.append(_json.loads(event_str))

        assert len(events) >= 1
        assert events[0]["type"] == "error"


# ── TestBuildSystemPromptAgentic ──────────────────────────────────────────────────

class TestBuildSystemPromptAgentic:
    """Tests for _build_system_prompt_agentic()."""

    def _make_ctx(self, scope="survey", has_open_text=True):
        from agents.crystal.context import CrystalContext
        return CrystalContext(
            org_id="org-1",
            user_id="user-1",
            survey_id="survey-1",
            scope=scope,
            has_open_text=has_open_text,
        )

    def test_contains_available_tools(self):
        """Prompt contains 'Available Tools' section."""
        from agents.agents.crystal import _build_system_prompt_agentic

        prompt = _build_system_prompt_agentic(self._make_ctx())
        assert "Available Tools" in prompt

    def test_no_open_text_mentions_score_only(self):
        """When has_open_text=False, prompt says 'no open-text questions'."""
        from agents.agents.crystal import _build_system_prompt_agentic

        prompt = _build_system_prompt_agentic(self._make_ctx(has_open_text=False))
        assert "no open-text questions" in prompt.lower() or "no open-text" in prompt

    def test_org_scope_contains_portfolio_framing(self):
        """When scope is 'org', prompt includes portfolio-level framing."""
        from agents.agents.crystal import _build_system_prompt_agentic

        prompt = _build_system_prompt_agentic(self._make_ctx(scope="org"))
        # Should mention cross-survey or portfolio or "all surveys"
        lower = prompt.lower()
        assert "all surveys" in lower or "portfolio" in lower or "organization" in lower
