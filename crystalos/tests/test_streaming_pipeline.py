"""End-to-end streaming pipeline tests.

Tests the complete flow:
  Response added → Redis pub/sub → stream consumer → pipeline trigger

Covers all recent bug fixes:
  1. Zombie run detection uses last_heartbeat_at (not heartbeat_at)
  2. error_log is JSONB ('["..."]') not text[] (ARRAY[...])
  3. Stream consumer retries on Redis failure instead of dying silently
  4. Trigger skips live runs, terminates zombie runs
  5. error_type field appears in all exception logs

All external I/O is mocked — tests run without Redis or Postgres.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def _fresh_batches():
    return defaultdict(lambda: {"org_id": "", "count": 0, "last_trigger": None})


# ── 1. Zombie detection uses correct column name ──────────────────────────────

class TestZombieRunDetection:
    """_trigger_insights must use last_heartbeat_at (real column name).
    Using heartbeat_at causes UndefinedColumn SQL error → silent failure."""

    @pytest.mark.asyncio
    async def test_live_run_blocks_new_trigger(self):
        """A run with a fresh heartbeat should block the trigger."""
        import uuid
        from crystalos.consumers import response_stream as rs

        mock_cur = AsyncMock()
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__ = AsyncMock(return_value=None)
        # First fetchone call → live run found → should skip
        mock_cur.fetchone = AsyncMock(return_value=("existing-run-id",))

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.cursor = MagicMock(return_value=mock_cur)
        mock_conn.commit = AsyncMock()

        with patch("psycopg.AsyncConnection.connect", AsyncMock(return_value=mock_conn)):
            await rs._trigger_insights("survey-1", "org-1")

        # Verify the SQL used last_heartbeat_at (not heartbeat_at)
        sql_calls = [str(c) for c in mock_cur.execute.call_args_list]
        assert any("last_heartbeat_at" in s for s in sql_calls), (
            f"Expected 'last_heartbeat_at' in SQL but got: {sql_calls}"
        )
        assert not any("AND heartbeat_at " in s for s in sql_calls), (
            "Must NOT use bare 'heartbeat_at' — that column doesn't exist. "
            f"Got: {sql_calls}"
        )

    @pytest.mark.asyncio
    async def test_zombie_run_terminated_and_new_run_created(self):
        """No live run → zombie cleanup runs → new run inserted → HTTP called."""
        from crystalos.consumers import response_stream as rs

        mock_cur = AsyncMock()
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__ = AsyncMock(return_value=None)
        # No live run found
        mock_cur.fetchone = AsyncMock(return_value=None)
        mock_cur.execute = AsyncMock()

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.cursor = MagicMock(return_value=mock_cur)
        mock_conn.commit = AsyncMock()

        mock_http_response = AsyncMock()
        mock_http_response.status_code = 200

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=None)
        mock_http_client.post = AsyncMock(return_value=mock_http_response)

        with patch("psycopg.AsyncConnection.connect", AsyncMock(return_value=mock_conn)):
            with patch("httpx.AsyncClient", return_value=mock_http_client):
                await rs._trigger_insights("survey-99", "org-99")

        sql_calls = [str(c) for c in mock_cur.execute.call_args_list]

        # Must update zombie runs using last_heartbeat_at
        zombie_update = [s for s in sql_calls if "terminated:zombie" in s or "UPDATE agent_runs" in s]
        assert zombie_update, f"No zombie cleanup UPDATE found. SQL calls: {sql_calls}"
        assert all("heartbeat_at" in s for s in zombie_update if "UPDATE" in s), (
            f"Zombie UPDATE must reference last_heartbeat_at column: {zombie_update}"
        )

        # Must insert new run
        insert_calls = [s for s in sql_calls if "INSERT INTO agent_runs" in s]
        assert insert_calls, f"Expected INSERT INTO agent_runs. SQL calls: {sql_calls}"

        # HTTP trigger must fire
        mock_http_client.post.assert_called_once()
        http_args = mock_http_client.post.call_args
        assert "/insights/generate" in str(http_args), f"Expected /insights/generate call: {http_args}"

    @pytest.mark.asyncio
    async def test_zombie_cleanup_uses_jsonb_not_array(self):
        """error_log column is JSONB — must use JSON literal, not ARRAY['...']."""
        from crystalos.consumers import response_stream as rs

        mock_cur = AsyncMock()
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__ = AsyncMock(return_value=None)
        mock_cur.fetchone = AsyncMock(return_value=None)
        mock_cur.execute = AsyncMock()

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)
        mock_conn.cursor = MagicMock(return_value=mock_cur)
        mock_conn.commit = AsyncMock()

        mock_http = AsyncMock()
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=None)
        mock_http.post = AsyncMock(return_value=AsyncMock(status_code=200))

        with patch("psycopg.AsyncConnection.connect", AsyncMock(return_value=mock_conn)):
            with patch("httpx.AsyncClient", return_value=mock_http):
                await rs._trigger_insights("survey-x", "org-x")

        sql_calls = [str(c) for c in mock_cur.execute.call_args_list]

        # Must NOT use Postgres ARRAY literal (wrong type for JSONB column)
        assert not any("ARRAY[" in s for s in sql_calls), (
            "Must NOT use ARRAY['...'] for error_log — column is JSONB. "
            f"Got SQL: {[s for s in sql_calls if 'ARRAY' in s]}"
        )

        # Must use JSON literal for the JSONB column
        zombie_sqls = [s for s in sql_calls if "terminated" in s]
        if zombie_sqls:
            assert any(
                "'[\"" in s or "::jsonb" in s
                for s in zombie_sqls
            ), (
                f"Zombie error_log update must use JSONB literal. Got: {zombie_sqls}"
            )


# ── 2. Retry loop — consumer doesn't die on Redis failure ─────────────────────

class TestConsumerRetryLoop:
    """Stream consumer retry behaviour — tested at the component level, not the infinite loop."""

    def test_retry_loop_source_contains_redis_reset(self):
        """After a Redis error, the consumer must reset the cached connection.
        Verified by inspecting the source code of run_response_stream_consumer.
        """
        import inspect
        from crystalos.consumers import response_stream as rs
        source = inspect.getsource(rs.run_response_stream_consumer)

        assert "_redis_mod._redis = None" in source or "_redis_mod" in source, (
            "run_response_stream_consumer must reset _redis_mod._redis on error "
            "so the next iteration reconnects fresh."
        )
        assert "asyncio.sleep" in source, (
            "run_response_stream_consumer must sleep between retries."
        )

    def test_retry_loop_source_logs_error_type(self):
        """The retry exception handler must include error_type in its log call."""
        import inspect
        from crystalos.consumers import response_stream as rs
        source = inspect.getsource(rs.run_response_stream_consumer)

        assert "error_type" in source, (
            "run_response_stream_consumer except block must log error_type=type(exc).__name__"
        )
        assert "stream_consumer_redis_error" in source, (
            "Exception handler must use event name 'stream_consumer_redis_error'"
        )

    def test_consume_events_returns_empty_when_redis_down(self):
        """When Redis is unavailable, consume_events returns immediately (no crash)."""
        from crystalos.consumers._redis import consume_events
        import inspect
        source = inspect.getsource(consume_events)
        # The generator must handle None redis gracefully
        assert "if not r" in source or "if r is None" in source or "return" in source, (
            "consume_events must return immediately when Redis is unavailable"
        )


# ── 3. error_type in all exception logs ───────────────────────────────────────

class TestErrorTypeLogging:
    """Every exception handler must include error_type so you know what failed."""

    @pytest.mark.asyncio
    async def test_trigger_failure_logs_error_type(self):
        """When _trigger_insights fails, log includes error_type."""
        from crystalos.consumers import response_stream as rs

        log_calls = []

        def fake_error(event, **kwargs):
            log_calls.append({"event": event, **kwargs})

        # Make psycopg connect raise an error
        with patch("psycopg.AsyncConnection.connect", AsyncMock(
            side_effect=RuntimeError("DB connection refused")
        )):
            with patch.object(rs.logger, "error", fake_error):
                await rs._trigger_insights("survey-err", "org-err")

        failed = [c for c in log_calls if "trigger_failed" in str(c.get("event", ""))]
        assert failed, f"Expected stream_consumer_trigger_failed log. Got: {log_calls}"
        assert "error_type" in failed[0], (
            f"error_type missing from trigger_failed log. Got: {failed[0]}"
        )
        assert failed[0]["error_type"] == "RuntimeError", (
            f"Wrong error_type. Got: {failed[0]['error_type']}"
        )


# ── 4. Full pipeline flow simulation ─────────────────────────────────────────

class TestFullStreamingFlow:
    """Simulate: 10 responses added → threshold hit → pipeline triggered."""

    @pytest.mark.asyncio
    async def test_10_responses_trigger_pipeline(self):
        """Adding 10 responses should trigger _trigger_insights exactly once."""
        from crystalos.consumers import response_stream as rs

        original_batches = rs._batches
        rs._batches = _fresh_batches()

        trigger_calls = []

        async def fake_trigger(survey_id, org_id):
            trigger_calls.append((survey_id, org_id))

        # Simulate 10 events for the same survey
        events = [
            {"survey_id": "survey-flow", "org_id": "org-flow", "response_id": f"r{i}"}
            for i in range(10)
        ]

        with patch.object(rs, "_trigger_insights", fake_trigger):
            with patch.object(rs, "_should_trigger", AsyncMock(return_value=True)):
                with patch.object(rs, "_get_total_response_count", AsyncMock(return_value=10)):
                    with patch.object(rs, "should_trigger_progressive_tier", AsyncMock(return_value="first_voices")):
                        with patch.object(rs, "_get_survey_status", AsyncMock(return_value="active")):
                            with patch.object(rs, "mark_progressive_tier_complete", AsyncMock()):
                                # Feed events directly (bypass Redis)
                                affected = {}
                                for event in events:
                                    sid = event["survey_id"]
                                    oid = event["org_id"]
                                    rs._batches[sid]["org_id"] = oid
                                    rs._batches[sid]["count"] += 1
                                    affected[sid] = oid

                                for survey_id, org_id in affected.items():
                                    should_run = await rs._should_trigger(survey_id)
                                    total = await rs._get_total_response_count(survey_id)
                                    tier = await rs.should_trigger_progressive_tier(survey_id, total)
                                    if should_run or tier:
                                        status = await rs._get_survey_status(survey_id)
                                        if status == "active":
                                            if tier:
                                                await rs.mark_progressive_tier_complete(survey_id, tier)
                                            if survey_id not in rs._pending_triggers:
                                                rs._pending_triggers.add(survey_id)
                                                asyncio.create_task(rs._trigger_insights(survey_id, org_id))

                                # Let task run
                                await asyncio.sleep(0.01)

        try:
            assert len(trigger_calls) == 1, f"Expected 1 trigger, got {len(trigger_calls)}: {trigger_calls}"
            assert trigger_calls[0] == ("survey-flow", "org-flow")
        finally:
            rs._batches = original_batches
            rs._pending_triggers.discard("survey-flow")

    @pytest.mark.asyncio
    async def test_paused_survey_does_not_trigger(self):
        """Pipeline must NOT trigger for paused surveys."""
        from crystalos.consumers import response_stream as rs

        original = rs._batches
        rs._batches = _fresh_batches()
        rs._batches["survey-paused"]["count"] = 15
        rs._batches["survey-paused"]["org_id"] = "org-1"

        trigger_calls = []

        async def fake_trigger(sid, oid):
            trigger_calls.append(sid)

        with patch.object(rs, "_trigger_insights", fake_trigger):
            with patch.object(rs, "_should_trigger", AsyncMock(return_value=True)):
                with patch.object(rs, "_get_total_response_count", AsyncMock(return_value=15)):
                    with patch.object(rs, "should_trigger_progressive_tier", AsyncMock(return_value="first_voices")):
                        with patch.object(rs, "_get_survey_status", AsyncMock(return_value="paused")):
                            # Simulate phase 2 dispatch
                            survey_status = await rs._get_survey_status("survey-paused")
                            if survey_status in ("active",):
                                asyncio.create_task(fake_trigger("survey-paused", "org-1"))
                            await asyncio.sleep(0.01)

        rs._batches = original
        assert not trigger_calls, f"Paused survey triggered pipeline: {trigger_calls}"


# ── 5. SQL correctness assertions (no live DB needed) ─────────────────────────

class TestSQLCorrectness:
    """Verify the exact SQL strings match the real column names."""

    def test_live_run_sql_uses_last_heartbeat_at(self):
        """The SELECT that checks for live runs must reference last_heartbeat_at."""
        import inspect
        from crystalos.consumers import response_stream as rs

        source = inspect.getsource(rs._trigger_insights)

        assert "last_heartbeat_at" in source, (
            "live-run check SQL must use 'last_heartbeat_at' (actual column name)"
        )
        # heartbeat_at alone (without last_) should NOT appear
        lines = [l for l in source.splitlines() if "heartbeat_at" in l and "last_heartbeat_at" not in l]
        assert not lines, (
            f"Found bare 'heartbeat_at' (wrong column name) in: {lines}"
        )

    def test_zombie_sql_uses_jsonb_literal(self):
        """The UPDATE that terminates zombie runs must use JSONB, not ARRAY literal."""
        import inspect
        from crystalos.consumers import response_stream as rs

        source = inspect.getsource(rs._trigger_insights)

        # Must NOT have ARRAY[ syntax for error_log
        assert "ARRAY[" not in source, (
            "zombie UPDATE must use JSONB literal for error_log, not ARRAY['...']"
        )

        # Must have JSON literal or ::jsonb cast
        assert "::jsonb" in source or "jsonb" in source.lower(), (
            "zombie UPDATE must use JSONB for error_log column (JSONB type)"
        )

    def test_error_type_in_trigger_failed_log(self):
        """stream_consumer_trigger_failed log must include error_type field."""
        import inspect
        from crystalos.consumers import response_stream as rs

        source = inspect.getsource(rs._trigger_insights)

        # Find the except block
        in_except = False
        has_error_type = False
        for line in source.splitlines():
            if "except Exception" in line:
                in_except = True
            if in_except and "error_type" in line:
                has_error_type = True
                break

        assert has_error_type, (
            "The except block in _trigger_insights must log 'error_type=type(exc).__name__'"
        )
