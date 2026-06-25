"""Tests for scheduler._cx_sla_breach_sweep.

All DB calls are mocked — no real connections are made.
"""
from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_case_row(
    case_id="case-001",
    org_id="org-1",
    title="Test Case",
    severity="high",
    escalation_tier=0,
    owner_user_id="user-old",
    external_refs=None,
):
    """Return a tuple matching the SELECT cols for cx_cases."""
    if external_refs is None:
        external_refs = {}
    return (case_id, org_id, title, severity, escalation_tier, owner_user_id, external_refs)


CASE_COLS = ["id", "org_id", "title", "severity", "escalation_tier", "owner_user_id", "external_refs"]


def _build_mock_pool(breached_cases, *, escalation_owner_id=None, pool_conn_side_effects=None):
    """
    Build a layered mock of db._pool_conn() so:
    - First query (SELECT from cx_cases) returns `breached_cases`.
    - Second query (SELECT from ownership_routes) returns escalation owner if set.
    - Third query (UPDATE cx_cases + INSERT crystal_event_queue) commits successfully.

    Returns the mock pool and a list that collects all executed SQL statements.
    """
    executed_sql = []

    # Cursor for first connection (SELECT breached cases)
    cur_select = AsyncMock()
    cur_select.execute = AsyncMock(side_effect=lambda sql, args=(): executed_sql.append(("select", sql, args)))
    cur_select.fetchall = AsyncMock(return_value=breached_cases)
    cur_select.description = [(c,) for c in CASE_COLS]

    conn_select = AsyncMock()
    conn_select.__aenter__ = AsyncMock(return_value=conn_select)
    conn_select.__aexit__ = AsyncMock(return_value=False)
    conn_select.cursor = MagicMock(return_value=_ctx(cur_select))

    # Cursor for ownership_routes query
    escalation_row = (escalation_owner_id,) if escalation_owner_id else None
    cur_route = AsyncMock()
    cur_route.execute = AsyncMock(side_effect=lambda sql, args=(): executed_sql.append(("route", sql, args)))
    cur_route.fetchone = AsyncMock(return_value=escalation_row)

    conn_route = AsyncMock()
    conn_route.__aenter__ = AsyncMock(return_value=conn_route)
    conn_route.__aexit__ = AsyncMock(return_value=False)
    conn_route.cursor = MagicMock(return_value=_ctx(cur_route))

    # Cursor for UPDATE + INSERT
    cur_update = AsyncMock()
    cur_update.execute = AsyncMock(side_effect=lambda sql, args=(): executed_sql.append(("update", sql, args)))

    conn_update = AsyncMock()
    conn_update.__aenter__ = AsyncMock(return_value=conn_update)
    conn_update.__aexit__ = AsyncMock(return_value=False)
    conn_update.cursor = MagicMock(return_value=_ctx(cur_update))
    conn_update.commit = AsyncMock()

    # Pool that cycles through connections
    pool = MagicMock()
    connections = [
        _ctx(conn_select),   # 1st: SELECT breached cases
    ]
    # For each case: route lookup + update conn
    for _ in breached_cases:
        connections.append(_ctx(conn_route))
        connections.append(_ctx(conn_update))

    pool.connection = MagicMock(side_effect=connections)
    return pool, executed_sql, cur_update


def _ctx(obj):
    """Wrap obj as async context manager."""
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=obj)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCxSlaBreachSweep:
    @pytest.mark.asyncio
    async def test_marks_cases_as_breached_when_past_sla_window(self):
        """When cx_cases has overdue open cases, they get marked sla_breached=true."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        case = _make_case_row(case_id="case-001", escalation_tier=0)
        pool, executed_sql, cur_update = _build_mock_pool([case])

        with patch("crystalos.scheduler._pool_conn", return_value=pool):
            await _cx_sla_breach_sweep()

        # At least one UPDATE should have been executed
        update_calls = [s for s in executed_sql if s[0] == "update"]
        assert len(update_calls) >= 1

    @pytest.mark.asyncio
    async def test_does_not_raise_when_db_returns_no_cases(self):
        """When no cases are overdue, sweep completes silently."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        pool, _, _ = _build_mock_pool([])

        with patch("crystalos.scheduler._pool_conn", return_value=pool):
            await _cx_sla_breach_sweep()  # must not raise

    @pytest.mark.asyncio
    async def test_escalation_tier_advances_from_prior_value(self):
        """new_tier = existing_tier + 1."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        case = _make_case_row(case_id="case-tier1", escalation_tier=1)
        pool, executed_sql, cur_update = _build_mock_pool([case])

        with patch("crystalos.scheduler._pool_conn", return_value=pool):
            await _cx_sla_breach_sweep()

        # Find update call args to verify new_tier=2
        update_calls = [s for s in executed_sql if s[0] == "update"]
        assert len(update_calls) >= 1
        # The escalation_tier arg should be 2 (1 + 1)
        found_tier_2 = any(2 in (args if args else ()) for _, _, args in update_calls)
        assert found_tier_2, "escalation_tier should advance to 2"

    @pytest.mark.asyncio
    async def test_audit_log_entry_is_valid_json(self):
        """The audit_log entry appended to cx_cases must be valid JSON."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        case = _make_case_row(case_id="case-audit", escalation_tier=0)
        pool, executed_sql, cur_update = _build_mock_pool([case])

        with patch("crystalos.scheduler._pool_conn", return_value=pool):
            await _cx_sla_breach_sweep()

        update_calls = [s for s in executed_sql if s[0] == "update"]
        # Find the audit_entry argument (a JSON string)
        audit_entries = []
        for _, sql, args in update_calls:
            if args and "UPDATE cx_cases" in sql:
                for arg in args:
                    if isinstance(arg, str):
                        try:
                            parsed = json.loads(arg)
                            if isinstance(parsed, list):
                                audit_entries.append(parsed)
                        except (json.JSONDecodeError, TypeError):
                            pass

        assert len(audit_entries) >= 1, "Should have at least one JSON audit entry"
        entry = audit_entries[0][0]
        assert entry["event"] == "sla_breach"
        assert "escalation_tier" in entry
        assert "ts" in entry

    @pytest.mark.asyncio
    async def test_exception_in_one_case_does_not_stop_processing_others(self):
        """If the update for case-1 raises, case-2 should still be processed.

        We simulate this by having case1's update raise and case2's update succeed.
        The sweep should continue — it uses try/except+continue per case.
        """
        from crystalos.scheduler import _cx_sla_breach_sweep

        case1 = _make_case_row(case_id="case-fail")
        case2 = _make_case_row(case_id="case-ok", org_id="org-2")

        processed_cases = []

        # Track pool.connection() call count to sequence fakes
        call_count = [0]

        def make_pool():
            # Cursor that returns both cases
            cur_select = AsyncMock()
            cur_select.execute = AsyncMock()
            cur_select.fetchall = AsyncMock(return_value=[case1, case2])
            cur_select.description = [(c,) for c in CASE_COLS]
            conn_select = AsyncMock()
            conn_select.__aenter__ = AsyncMock(return_value=conn_select)
            conn_select.__aexit__ = AsyncMock(return_value=False)
            conn_select.cursor = MagicMock(return_value=_ctx(cur_select))

            # Route cursor — no escalation owner
            cur_route = AsyncMock()
            cur_route.execute = AsyncMock()
            cur_route.fetchone = AsyncMock(return_value=None)
            conn_route = AsyncMock()
            conn_route.__aenter__ = AsyncMock(return_value=conn_route)
            conn_route.__aexit__ = AsyncMock(return_value=False)
            conn_route.cursor = MagicMock(return_value=_ctx(cur_route))

            # Update cursor for case1: raises
            cur_update_fail = AsyncMock()
            cur_update_fail.execute = AsyncMock(side_effect=Exception("DB write failed for case1"))
            conn_update_fail = AsyncMock()
            conn_update_fail.__aenter__ = AsyncMock(return_value=conn_update_fail)
            conn_update_fail.__aexit__ = AsyncMock(return_value=False)
            conn_update_fail.cursor = MagicMock(return_value=_ctx(cur_update_fail))
            conn_update_fail.commit = AsyncMock()

            # Route cursor for case2
            cur_route2 = AsyncMock()
            cur_route2.execute = AsyncMock()
            cur_route2.fetchone = AsyncMock(return_value=None)
            conn_route2 = AsyncMock()
            conn_route2.__aenter__ = AsyncMock(return_value=conn_route2)
            conn_route2.__aexit__ = AsyncMock(return_value=False)
            conn_route2.cursor = MagicMock(return_value=_ctx(cur_route2))

            # Update cursor for case2: succeeds
            cur_update_ok = AsyncMock()
            async def record_and_execute(sql, args=()):
                if "UPDATE cx_cases" in sql:
                    processed_cases.append("case-ok")
            cur_update_ok.execute = AsyncMock(side_effect=record_and_execute)
            conn_update_ok = AsyncMock()
            conn_update_ok.__aenter__ = AsyncMock(return_value=conn_update_ok)
            conn_update_ok.__aexit__ = AsyncMock(return_value=False)
            conn_update_ok.cursor = MagicMock(return_value=_ctx(cur_update_ok))
            conn_update_ok.commit = AsyncMock()

            pool = MagicMock()
            pool.connection = MagicMock(side_effect=[
                _ctx(conn_select),       # SELECT breached cases
                _ctx(conn_route),        # case1 ownership route
                _ctx(conn_update_fail),  # case1 update (raises)
                _ctx(conn_route2),       # case2 ownership route
                _ctx(conn_update_ok),    # case2 update (succeeds)
            ])
            return pool

        with patch("crystalos.scheduler._pool_conn", return_value=make_pool()):
            await _cx_sla_breach_sweep()  # must not raise

        assert "case-ok" in processed_cases, "case2 should be processed despite case1 update failing"

    @pytest.mark.asyncio
    async def test_idempotent_query_filters_on_sla_breached_false(self):
        """The SELECT query must include 'sla_breached = false' to avoid re-processing."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        pool, executed_sql, _ = _build_mock_pool([])

        with patch("crystalos.scheduler._pool_conn", return_value=pool):
            await _cx_sla_breach_sweep()

        select_calls = [s for s in executed_sql if s[0] == "select"]
        # There should be a SELECT query filtering sla_breached = false
        assert any(
            "sla_breached" in s[1].lower()
            for s in select_calls
        ), "SELECT must filter on sla_breached"

    @pytest.mark.asyncio
    async def test_inserts_into_crystal_event_queue_after_update(self):
        """After updating the case, an event is inserted into crystal_event_queue."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        case = _make_case_row(case_id="case-evt", org_id="org-evt")
        pool, executed_sql, _ = _build_mock_pool([case])

        with patch("crystalos.scheduler._pool_conn", return_value=pool):
            await _cx_sla_breach_sweep()

        # All SQL statements tracked with tag "update"
        update_statements = [sql for tag, sql, args in executed_sql if tag == "update"]
        queue_inserts = [sql for sql in update_statements if "crystal_event_queue" in sql]
        assert len(queue_inserts) >= 1, "Should insert into crystal_event_queue"

    @pytest.mark.asyncio
    async def test_slack_webhook_notification_attempted_when_configured(self):
        """When external_refs.slack_webhook is set, an httpx POST is attempted."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        case = _make_case_row(
            case_id="case-slack",
            external_refs={"slack_webhook": "https://hooks.slack.com/test"},
        )
        pool, executed_sql, _ = _build_mock_pool([case])

        mock_response = MagicMock()
        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)
        mock_http_client.post = AsyncMock(return_value=mock_response)

        with patch("crystalos.scheduler._pool_conn", return_value=pool), \
             patch("httpx.AsyncClient", return_value=mock_http_client):
            await _cx_sla_breach_sweep()

        mock_http_client.post.assert_called_once()
        call_url = mock_http_client.post.call_args[0][0]
        assert "hooks.slack.com" in call_url

    @pytest.mark.asyncio
    async def test_slack_error_does_not_raise(self):
        """If the Slack webhook call fails, sweep must not raise."""
        from crystalos.scheduler import _cx_sla_breach_sweep

        case = _make_case_row(
            case_id="case-slack-fail",
            external_refs={"slack_webhook": "https://hooks.slack.com/fail"},
        )
        pool, _, _ = _build_mock_pool([case])

        import httpx
        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)
        mock_http_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection refused"))

        with patch("crystalos.scheduler._pool_conn", return_value=pool), \
             patch("httpx.AsyncClient", return_value=mock_http_client):
            await _cx_sla_breach_sweep()  # must not raise
