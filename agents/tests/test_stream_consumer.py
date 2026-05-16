"""Smoke tests for the Redis Streams response consumer.

Tests cover:
  - _should_trigger threshold logic (count-based and time-based)
  - Batching accumulation across multiple events
  - _trigger_insights is called (mocked) when threshold is met
  - consume_events gracefully degrades when Redis is unavailable

All external I/O (Redis, Postgres, httpx) is mocked.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers to reset module-level state between tests
# ---------------------------------------------------------------------------

def _reset_batches():
    """Return a fresh defaultdict matching the shape used by the consumer."""
    return defaultdict(lambda: {"org_id": "", "count": 0, "last_trigger": None})


# ---------------------------------------------------------------------------
# _should_trigger — count threshold
# ---------------------------------------------------------------------------

class TestShouldTriggerCountThreshold:
    @pytest.mark.asyncio
    async def test_triggers_at_threshold(self):
        from agents.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _reset_batches()
        try:
            rs._batches["survey-1"]["count"] = 10  # default threshold
            assert await rs._should_trigger("survey-1") is True
        finally:
            rs._batches = original

    @pytest.mark.asyncio
    async def test_does_not_trigger_below_threshold(self):
        from agents.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _reset_batches()
        try:
            rs._batches["survey-1"]["count"] = 9
            assert await rs._should_trigger("survey-1") is False
        finally:
            rs._batches = original

    @pytest.mark.asyncio
    async def test_triggers_above_threshold(self):
        from agents.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _reset_batches()
        try:
            rs._batches["survey-1"]["count"] = 15
            assert await rs._should_trigger("survey-1") is True
        finally:
            rs._batches = original


# ---------------------------------------------------------------------------
# _should_trigger — time threshold
# ---------------------------------------------------------------------------

class TestShouldTriggerTimeThreshold:
    @pytest.mark.asyncio
    async def test_triggers_after_time_with_pending_responses(self):
        from agents.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _reset_batches()
        try:
            rs._batches["survey-2"]["count"] = 3
            rs._batches["survey-2"]["last_trigger"] = (
                datetime.now(timezone.utc) - timedelta(minutes=6)
            )
            assert await rs._should_trigger("survey-2") is True
        finally:
            rs._batches = original

    @pytest.mark.asyncio
    async def test_does_not_trigger_before_time_threshold(self):
        from agents.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _reset_batches()
        try:
            rs._batches["survey-2"]["count"] = 3
            rs._batches["survey-2"]["last_trigger"] = (
                datetime.now(timezone.utc) - timedelta(minutes=2)
            )
            assert await rs._should_trigger("survey-2") is False
        finally:
            rs._batches = original

    @pytest.mark.asyncio
    async def test_does_not_trigger_if_no_pending_responses(self):
        from agents.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _reset_batches()
        try:
            rs._batches["survey-2"]["count"] = 0
            rs._batches["survey-2"]["last_trigger"] = (
                datetime.now(timezone.utc) - timedelta(minutes=10)
            )
            assert await rs._should_trigger("survey-2") is False
        finally:
            rs._batches = original

    @pytest.mark.asyncio
    async def test_does_not_trigger_if_no_last_trigger_and_below_count(self):
        from agents.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _reset_batches()
        try:
            rs._batches["survey-3"]["count"] = 5
            rs._batches["survey-3"]["last_trigger"] = None
            assert await rs._should_trigger("survey-3") is False
        finally:
            rs._batches = original


# ---------------------------------------------------------------------------
# Batching logic in run_response_stream_consumer
# ---------------------------------------------------------------------------

class TestBatchAccumulation:
    @pytest.mark.asyncio
    async def test_batch_counter_increments_per_event(self):
        from agents.consumers import response_stream as rs

        original_batches = rs._batches
        rs._batches = _reset_batches()

        events = [
            {"survey_id": "s1", "org_id": "org1", "response_id": "r1"},
            {"survey_id": "s1", "org_id": "org1", "response_id": "r2"},
            {"survey_id": "s2", "org_id": "org2", "response_id": "r3"},
        ]

        # Patch consume_events to yield one batch then stop, and _should_trigger to False
        async def fake_consume(**kwargs):
            yield events
            return  # exhausted

        async def fake_should_trigger(survey_id):
            return False

        with (
            patch("agents.consumers.response_stream.consume_events", fake_consume),
            patch("agents.consumers.response_stream._should_trigger", fake_should_trigger),
        ):
            # run_response_stream_consumer is an infinite loop; we need it to stop
            # after one iteration. The fake_consume above yields once then returns.
            try:
                await asyncio.wait_for(
                    rs.run_response_stream_consumer(), timeout=1.0
                )
            except asyncio.TimeoutError:
                pass  # expected — loop blocks on consume_events

        try:
            assert rs._batches["s1"]["count"] == 2
            assert rs._batches["s1"]["org_id"] == "org1"
            assert rs._batches["s2"]["count"] == 1
            assert rs._batches["s2"]["org_id"] == "org2"
        finally:
            rs._batches = original_batches

    @pytest.mark.asyncio
    async def test_trigger_called_when_threshold_reached(self):
        from agents.consumers import response_stream as rs

        original_batches = rs._batches
        rs._batches = _reset_batches()

        # Pre-load a batch at threshold - 1
        rs._batches["s1"]["org_id"] = "org1"
        rs._batches["s1"]["count"] = 9

        # One more event pushes it to 10
        event = {"survey_id": "s1", "org_id": "org1", "response_id": "r10"}

        async def fake_consume(**kwargs):
            yield [event]
            return

        trigger_called_for: list[tuple] = []

        async def fake_trigger(survey_id: str, org_id: str) -> None:
            trigger_called_for.append((survey_id, org_id))

        with (
            patch("agents.consumers.response_stream.consume_events", fake_consume),
            patch("agents.consumers.response_stream._trigger_insights", fake_trigger),
        ):
            try:
                await asyncio.wait_for(
                    rs.run_response_stream_consumer(), timeout=1.0
                )
            except asyncio.TimeoutError:
                pass

        try:
            # Give any created tasks a chance to run
            await asyncio.sleep(0)
            assert ("s1", "org1") in trigger_called_for
        finally:
            rs._batches = original_batches


# ---------------------------------------------------------------------------
# _redis.consume_events — graceful degradation
# ---------------------------------------------------------------------------

class TestRedisConsumerDegradation:
    @pytest.mark.asyncio
    async def test_consume_events_returns_immediately_if_redis_unavailable(self):
        """If _get_redis() returns None, consume_events should yield nothing."""
        from agents.consumers import _redis as redis_mod

        original_redis = redis_mod._redis
        redis_mod._redis = None  # force re-init path

        with patch.object(redis_mod, "_get_redis", new=AsyncMock(return_value=None)):
            collected = []
            async for batch in redis_mod.consume_events(batch_size=10, block_ms=100):
                collected.append(batch)

        redis_mod._redis = original_redis
        assert collected == []
