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
            patch("agents.consumers.response_stream._get_total_response_count", new=AsyncMock(return_value=0)),
            patch("agents.consumers.response_stream.should_trigger_progressive_tier", new=AsyncMock(return_value=None)),
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
            patch("agents.consumers.response_stream._get_survey_status", new=AsyncMock(return_value="active")),
            patch("agents.consumers.response_stream._get_total_response_count", new=AsyncMock(return_value=10)),
            patch("agents.consumers.response_stream.should_trigger_progressive_tier", new=AsyncMock(return_value=None)),
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


# ---------------------------------------------------------------------------
# Progressive tier system
# ---------------------------------------------------------------------------

class TestProgressiveTierSystem:
    """Tests for should_trigger_progressive_tier and mark_progressive_tier_complete."""

    def _make_mock_redis(self, get_return=None):
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=get_return)
        mock_redis.set = AsyncMock()
        return mock_redis

    @pytest.mark.asyncio
    async def test_triggers_at_first_voices_threshold(self):
        """response_count=10 triggers 'first_voices' when Redis key not set."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        mock_redis = self._make_mock_redis(get_return=None)
        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=10)

        assert result == "first_voices"

    @pytest.mark.asyncio
    async def test_triggers_at_early_signals_threshold(self):
        """response_count=40 triggers 'early_signals' (not 'first_voices')."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        mock_redis = self._make_mock_redis(get_return=None)
        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=40)

        assert result == "early_signals"

    @pytest.mark.asyncio
    async def test_triggers_at_growing_picture_threshold(self):
        """response_count=70 triggers 'growing_picture'."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        mock_redis = self._make_mock_redis(get_return=None)
        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=70)

        assert result == "growing_picture"

    @pytest.mark.asyncio
    async def test_triggers_at_full_report_threshold(self):
        """response_count=100 triggers 'full_report'."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        mock_redis = self._make_mock_redis(get_return=None)
        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=100)

        assert result == "full_report"

    @pytest.mark.asyncio
    async def test_does_not_trigger_below_threshold(self):
        """response_count=9 returns None (below all thresholds)."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        mock_redis = self._make_mock_redis(get_return=None)
        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=9)

        assert result is None

    @pytest.mark.asyncio
    async def test_dedup_prevents_retrigger(self):
        """Redis key already set ('1') means tier was triggered; returns None."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        mock_redis = self._make_mock_redis(get_return="1")
        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=10)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_redis_unavailable(self):
        """Returns None gracefully when _get_redis() returns None."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=None)):
            result = await should_trigger_progressive_tier("survey-1", response_count=50)

        assert result is None

    @pytest.mark.asyncio
    async def test_mark_tier_complete_sets_redis_key(self):
        """mark_progressive_tier_complete sets the correct Redis key with 30-day TTL."""
        from agents.consumers.response_stream import mark_progressive_tier_complete

        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock()

        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            await mark_progressive_tier_complete("survey-1", "first_voices")

        mock_redis.set.assert_called_once_with(
            "progressive:survey-1:first_voices:triggered",
            "1",
            ex=2592000,
        )

    @pytest.mark.asyncio
    async def test_highest_tier_checked_first(self):
        """response_count=100 with full_report already set returns None (no fallback to lower tiers)."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        async def fake_get(key):
            # full_report is already triggered; growing_picture is not
            if "full_report" in key:
                return "1"
            return None

        mock_redis = AsyncMock()
        mock_redis.get = fake_get

        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=100)

        # The highest matching tier (full_report) is already done → None
        assert result is None

    @pytest.mark.asyncio
    async def test_growing_picture_triggers_when_full_report_not_yet_reached(self):
        """response_count=70 with growing_picture not yet triggered fires growing_picture."""
        from agents.consumers.response_stream import should_trigger_progressive_tier

        mock_redis = self._make_mock_redis(get_return=None)
        with patch("agents.consumers.response_stream._get_redis", new=AsyncMock(return_value=mock_redis)):
            result = await should_trigger_progressive_tier("survey-1", response_count=75)

        assert result == "growing_picture"
