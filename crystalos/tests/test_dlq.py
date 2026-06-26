"""Tests for Phase 5 DLQ pattern in response_stream consumer.

Covers:
  - _trigger_with_retry succeeds on first attempt (no retries needed)
  - _trigger_with_retry retries on transient failure then succeeds
  - _trigger_with_retry writes to DLQ after MAX_RETRIES exhausted
  - GET /api/admin/crystal/dlq endpoint returns DLQ entries
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# _trigger_with_retry
# ---------------------------------------------------------------------------

class TestTriggerWithRetry:
    @pytest.mark.asyncio
    async def test_trigger_with_retry_succeeds_first_attempt(self):
        """Successful on first try — no sleep, no DLQ write."""
        from crystalos.consumers import response_stream as rs

        mock_trigger = AsyncMock()
        mock_redis   = AsyncMock()

        with patch("crystalos.consumers.response_stream._trigger_insights", mock_trigger), \
             patch("crystalos.consumers.response_stream._get_redis",
                   new_callable=AsyncMock, return_value=mock_redis):
            await rs._trigger_with_retry("survey-1", "org-1", "first_voices")

        mock_trigger.assert_awaited_once_with("survey-1", "org-1")
        mock_redis.rpush.assert_not_called()

    @pytest.mark.asyncio
    async def test_trigger_with_retry_retries_on_failure(self):
        """Fails once, then succeeds — no DLQ write."""
        from crystalos.consumers import response_stream as rs

        call_n = {"n": 0}

        async def _flaky(*args, **kwargs):
            call_n["n"] += 1
            if call_n["n"] < 2:
                raise RuntimeError("transient")

        mock_redis = AsyncMock()
        mock_sleep = AsyncMock()

        with patch("crystalos.consumers.response_stream._trigger_insights",
                   side_effect=_flaky), \
             patch("crystalos.consumers.response_stream.asyncio.sleep", mock_sleep), \
             patch("crystalos.consumers.response_stream._get_redis",
                   return_value=mock_redis):
            await rs._trigger_with_retry("survey-2", "org-2", "early_signals")

        assert call_n["n"] == 2
        mock_sleep.assert_awaited_once()
        mock_redis.rpush.assert_not_called()

    @pytest.mark.asyncio
    async def test_trigger_with_retry_writes_to_dlq_after_max_retries(self):
        """All retries exhausted → entry written to DLQ Redis list."""
        from crystalos.consumers import response_stream as rs

        async def _always_fail(*a, **kw):
            raise RuntimeError("backend down")

        mock_redis = AsyncMock()
        mock_sleep = AsyncMock()

        with patch("crystalos.consumers.response_stream._trigger_insights",
                   side_effect=_always_fail), \
             patch("crystalos.consumers.response_stream.asyncio.sleep", mock_sleep), \
             patch("crystalos.consumers.response_stream._get_redis",
                   return_value=mock_redis):
            await rs._trigger_with_retry("survey-3", "org-3", "full_report")

        # Slept MAX_RETRIES-1 times (not after the final attempt)
        assert mock_sleep.await_count == rs.MAX_RETRIES - 1

        mock_redis.rpush.assert_awaited_once()
        dlq_key, raw_payload = mock_redis.rpush.call_args[0]
        assert dlq_key == rs.DLQ_KEY

        payload = json.loads(raw_payload)
        assert payload["survey_id"] == "survey-3"
        assert payload["org_id"]    == "org-3"
        assert payload["tier"]      == "full_report"
        assert "failed_at" in payload


# ---------------------------------------------------------------------------
# GET /api/admin/crystal/dlq — direct function test
# ---------------------------------------------------------------------------

class TestDlqAdminEndpoint:
    @pytest.mark.asyncio
    async def test_dlq_admin_endpoint_returns_entries(self):
        """list_dlq_entries returns entries from Redis lrange."""
        entry = json.dumps({
            "survey_id": "s-1",
            "org_id":    "o-1",
            "tier":      "first_voices",
            "failed_at": "2026-06-23T00:00:00",
        })
        mock_redis = AsyncMock()
        mock_redis.lrange = AsyncMock(return_value=[entry])

        with patch("crystalos.consumers.response_stream._get_redis",
                   return_value=mock_redis):
            from crystalos.main import list_dlq_entries
            result = await list_dlq_entries(None)

        assert result["count"] == 1
        assert result["entries"][0]["survey_id"] == "s-1"
        assert result["entries"][0]["tier"]      == "first_voices"
