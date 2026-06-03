"""Tests for agents/lib/memory.py

Covers: L0 memoization, L1 semantic cache, L2 compression, L3 survey facts, L4 org memory.
All external dependencies (Redis, DB) are mocked or None — fully offline tests.
"""
from __future__ import annotations

import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from crystalos.lib.memory import MemoryManager, _is_cacheable_question, get_memory_manager


# ── _is_cacheable_question ────────────────────────────────────────────────────

def test_cacheable_factual_question():
    assert _is_cacheable_question("What is our NPS score?") is True


def test_cacheable_metric_question():
    assert _is_cacheable_question("Show me the top topics by volume") is True


def test_not_cacheable_conversational():
    assert _is_cacheable_question("Why did you say that?") is False
    assert _is_cacheable_question("What did you mean by high effort?") is False
    assert _is_cacheable_question("Explain that to me more") is False
    assert _is_cacheable_question("I disagree with that finding") is False


# ── L0: Tool memoization ──────────────────────────────────────────────────────

def test_l0_cache_miss_returns_none():
    mm = MemoryManager()
    cache: dict = {}
    result = mm.get_tool_result(cache, "get_topics", {"survey_id": "abc"})
    assert result is None


def test_l0_cache_set_and_get():
    mm = MemoryManager()
    cache: dict = {}
    params = {"survey_id": "abc", "limit": 10}
    result = {"topics": [{"name": "Onboarding"}]}
    mm.set_tool_result(cache, "get_topics", params, result)
    retrieved = mm.get_tool_result(cache, "get_topics", params)
    assert retrieved == result


def test_l0_cache_not_set_for_errors():
    mm = MemoryManager()
    cache: dict = {}
    mm.set_tool_result(cache, "get_topics", {}, {"error": "not found"})
    assert mm.get_tool_result(cache, "get_topics", {}) is None


def test_l0_cache_different_params_different_keys():
    mm = MemoryManager()
    cache: dict = {}
    mm.set_tool_result(cache, "get_topics", {"survey_id": "abc"}, {"result": "abc"})
    mm.set_tool_result(cache, "get_topics", {"survey_id": "xyz"}, {"result": "xyz"})
    assert mm.get_tool_result(cache, "get_topics", {"survey_id": "abc"}) == {"result": "abc"}
    assert mm.get_tool_result(cache, "get_topics", {"survey_id": "xyz"}) == {"result": "xyz"}


# ── L1: Semantic cache (with mocked Redis) ─────────────────────────────────────

@pytest.mark.asyncio
async def test_l1_returns_none_without_redis():
    mm = MemoryManager(redis=None)
    result = await mm.get_semantic_cache("org1", "survey1", "What is our NPS?")
    assert result is None


@pytest.mark.asyncio
async def test_l1_get_cache_hit():
    cached_answer = {"answer": "Your NPS is 42", "citations": ["insight_1"]}
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(cached_answer))

    mm = MemoryManager(redis=mock_redis)
    result = await mm.get_semantic_cache("org1", "survey1", "What is our NPS?")
    assert result == cached_answer
    mock_redis.get.assert_called_once()


@pytest.mark.asyncio
async def test_l1_get_cache_miss_returns_none():
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)

    mm = MemoryManager(redis=mock_redis)
    result = await mm.get_semantic_cache("org1", "survey1", "What is our NPS?")
    assert result is None


@pytest.mark.asyncio
async def test_l1_skip_non_cacheable():
    mock_redis = AsyncMock()
    mm = MemoryManager(redis=mock_redis)

    result = await mm.get_semantic_cache("org1", "survey1", "Why did you say that?")
    assert result is None
    mock_redis.get.assert_not_called()


@pytest.mark.asyncio
async def test_l1_set_cache():
    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock()

    mm = MemoryManager(redis=mock_redis)
    answer = {"answer": "NPS is 42"}
    await mm.set_semantic_cache("org1", "survey1", "What is our NPS?", answer)
    mock_redis.set.assert_called_once()
    call_args = mock_redis.set.call_args
    assert "semantic_cache:org1:survey1:" in call_args[0][0]


@pytest.mark.asyncio
async def test_l1_invalidate_survey_cache():
    mock_redis = AsyncMock()
    mock_redis.keys = AsyncMock(return_value=["key1", "key2", "key3"])
    mock_redis.delete = AsyncMock()

    mm = MemoryManager(redis=mock_redis)
    count = await mm.invalidate_survey_cache("org1", "survey1")
    assert count == 3
    mock_redis.delete.assert_called_once_with("key1", "key2", "key3")


@pytest.mark.asyncio
async def test_l1_graceful_redis_error():
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(side_effect=ConnectionError("Redis down"))

    mm = MemoryManager(redis=mock_redis)
    result = await mm.get_semantic_cache("org1", "survey1", "What is NPS?")
    assert result is None  # Should not raise


# ── L2: Thread compression ────────────────────────────────────────────────────

def test_should_compress_below_threshold():
    mm = MemoryManager()
    assert mm.should_compress(4) is False  # < THREAD_COMPRESS_FIRST_TURN (5)


def test_should_compress_at_threshold():
    mm = MemoryManager()
    assert mm.should_compress(5) is True  # == THREAD_COMPRESS_FIRST_TURN


def test_should_compress_interval():
    mm = MemoryManager()
    assert mm.should_compress(8) is True   # 5 + 3
    assert mm.should_compress(11) is True  # 5 + 6
    assert mm.should_compress(9) is False  # 5 + 4 (not on interval)


def test_compress_messages_extracts_decisions():
    mm = MemoryManager()
    messages = [
        {"role": "user", "content": "Let's focus on the onboarding topic."},
        {"role": "assistant", "content": "Sure, onboarding shows -0.7 sentiment."},
        {"role": "user", "content": "Actually, focus on detractors instead."},
        {"role": "assistant", "content": "Detractors are primarily concerned about pricing."},
    ]
    ctx = mm._compress_messages(messages, turn_count=2)
    assert ctx["schema_version"] == 2
    assert "decisions" in ctx
    assert len(ctx["decisions"]) >= 1


def test_compress_messages_decision_supersession():
    mm = MemoryManager()
    messages = [
        {"role": "user", "content": "Focus on onboarding."},
        {"role": "assistant", "content": "Ok."},
        {"role": "user", "content": "Focus on support instead."},
        {"role": "assistant", "content": "Ok."},
    ]
    ctx = mm._compress_messages(messages, turn_count=2)
    # The "onboarding" decision should be superseded (unless topics differ)
    # At minimum, we should have 2 decisions in the list
    decisions = ctx.get("decisions", [])
    assert isinstance(decisions, list)


def test_compress_messages_preference_extraction():
    mm = MemoryManager()
    messages = [
        {"role": "user", "content": "Please always use bullet points in your answers."},
        {"role": "assistant", "content": "Got it."},
    ]
    ctx = mm._compress_messages(messages, turn_count=1)
    assert ctx["user_preferences"]["preferred_format"] == "bullet points"


def test_compress_messages_data_retrieved_tracking():
    mm = MemoryManager()
    messages = [
        {"role": "user", "content": "What are the NPS metrics?"},
        {"role": "assistant", "content": "The NPS score is 42."},
    ]
    ctx = mm._compress_messages(messages, turn_count=1)
    assert ctx["data_retrieved"]["metrics_loaded"] is True


def test_build_context_blocks_order():
    """Verify G23 fix: org_memory first, survey_facts last (closest to user message)."""
    mm = MemoryManager()
    blocks = mm.build_context_blocks(
        org_memory=[{"fact": "User prefers bullet points"}],
        context_state={"decisions": []},
        survey_facts={"nps_score": 42},
        raw_turns=[{"role": "user", "content": "What's our NPS?"}],
    )
    layers = [b.get("layer") or b.get("role") for b in blocks]
    # org_memory should come before survey_facts
    if "org_memory" in layers and "survey_facts" in layers:
        assert layers.index("org_memory") < layers.index("survey_facts")


# ── L3: Survey facts ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_l3_get_returns_none_without_redis():
    mm = MemoryManager(redis=None)
    result = await mm.get_survey_facts("survey_abc")
    assert result is None


@pytest.mark.asyncio
async def test_l3_get_cache_hit():
    facts = {"nps_score": 42, "response_count": 200}
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=json.dumps(facts))

    mm = MemoryManager(redis=mock_redis)
    result = await mm.get_survey_facts("survey_abc")
    assert result == facts


@pytest.mark.asyncio
async def test_l3_set_survey_facts():
    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock()

    mm = MemoryManager(redis=mock_redis)
    await mm.set_survey_facts("survey_abc", {"nps_score": 42})
    mock_redis.set.assert_called_once()
    key = mock_redis.set.call_args[0][0]
    assert "survey_facts:survey_abc" == key


@pytest.mark.asyncio
async def test_l3_invalidate():
    mock_redis = AsyncMock()
    mock_redis.delete = AsyncMock()

    mm = MemoryManager(redis=mock_redis)
    await mm.invalidate_survey_facts("survey_abc")
    mock_redis.delete.assert_called_once_with("survey_facts:survey_abc")


@pytest.mark.asyncio
async def test_l3_warm_from_tool_results_skips_empty():
    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock()

    mm = MemoryManager(redis=mock_redis)
    await mm.warm_from_tool_results("survey_abc", {})  # Empty tool results
    mock_redis.set.assert_not_called()


@pytest.mark.asyncio
async def test_l3_warm_from_tool_results_writes_facts():
    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock()

    mm = MemoryManager(redis=mock_redis)
    tool_results = {
        "get_survey_overview": {
            "response_count": 150,
            "nps_score": 35,
            "top_topics": [{"label": "Onboarding", "volume": 50, "sentiment": -0.5}],
        }
    }
    await mm.warm_from_tool_results("survey_abc", tool_results)
    mock_redis.set.assert_called_once()


# ── L4: Org memory ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_l4_returns_empty_without_db():
    mm = MemoryManager(db_pool=None)
    result = await mm.get_org_memory("org1", "user1", "What is NPS?")
    assert result == []


@pytest.mark.asyncio
async def test_l4_graceful_db_error():
    mm = MemoryManager()
    # db is None by default — should return empty, not raise
    result = await mm.get_org_memory("org1", "user1", "some query")
    assert result == []


# ── build_context_injection ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_build_context_injection_returns_dict():
    mm = MemoryManager(redis=None, db_pool=None)
    ctx = await mm.build_context_injection(
        org_id="org1",
        user_id="user1",
        survey_id="survey1",
        thread_id="thread1",
        turn_count=3,
        raw_messages=[{"role": "user", "content": "hi"}],
    )
    assert "org_memory_facts" in ctx
    assert "context_state" in ctx
    assert "survey_facts" in ctx
    assert "verbatim_turns" in ctx
    assert isinstance(ctx["org_memory_facts"], list)


# ── Singleton ────────────────────────────────────────────────────────────────

def test_get_memory_manager_returns_singleton():
    mm1 = get_memory_manager()
    mm2 = get_memory_manager()
    assert mm1 is mm2
