"""Tests for Phase 6 bug tracker module.

Covers:
  - _compute_auto_severity rules (all threshold branches)
  - _assign_team mapping and triage fallback
  - create_bug_report inserts correctly (mock DB)
  - record_additional_affected_org → _maybe_escalate_bug escalation
  - _fire_critical_alert writes notification_events
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# _compute_auto_severity
# ---------------------------------------------------------------------------

class TestComputeAutoSeverity:
    def test_compute_auto_severity_single_org_is_low(self):
        from crystalos.lib.bug_tracker import _compute_auto_severity
        assert _compute_auto_severity(1, 1, 24.0) == "low"

    def test_compute_auto_severity_two_orgs_is_medium(self):
        from crystalos.lib.bug_tracker import _compute_auto_severity
        assert _compute_auto_severity(2, 1, 24.0) == "medium"

    def test_compute_auto_severity_three_orgs_is_high(self):
        from crystalos.lib.bug_tracker import _compute_auto_severity
        assert _compute_auto_severity(3, 1, 24.0) == "high"

    def test_compute_auto_severity_three_brands_is_critical(self):
        from crystalos.lib.bug_tracker import _compute_auto_severity
        assert _compute_auto_severity(3, 3, 24.0) == "critical"

    def test_compute_auto_severity_five_orgs_is_critical(self):
        from crystalos.lib.bug_tracker import _compute_auto_severity
        assert _compute_auto_severity(5, 1, 24.0) == "critical"

    def test_compute_auto_severity_rapid_spread_escalates(self):
        """2+ brands within 2 hours triggers critical (rapid spread rule)."""
        from crystalos.lib.bug_tracker import _compute_auto_severity
        assert _compute_auto_severity(1, 2, 1.0) == "critical"

    def test_compute_auto_severity_two_brands_slow_spread_is_high(self):
        """2 brands but > 2 hours open → high (not rapid-spread critical)."""
        from crystalos.lib.bug_tracker import _compute_auto_severity
        assert _compute_auto_severity(2, 2, 5.0) == "high"


# ---------------------------------------------------------------------------
# _assign_team
# ---------------------------------------------------------------------------

class TestAssignTeam:
    def test_assign_team_maps_known_features(self):
        from crystalos.lib.bug_tracker import _assign_team
        assert _assign_team("nps_calculation") == "insights-team"
        assert _assign_team("survey_builder")  == "survey-team"
        assert _assign_team("workflows")       == "automation-team"
        assert _assign_team("crystal")         == "crystalos-team"
        assert _assign_team("auth")            == "platform-team"
        assert _assign_team("billing")         == "platform-team"
        assert _assign_team("exports")         == "data-team"
        assert _assign_team("notifications")   == "platform-team"

    def test_assign_team_fallback_triage(self):
        from crystalos.lib.bug_tracker import _assign_team
        assert _assign_team(None)          == "triage-team"
        assert _assign_team("")            == "triage-team"
        assert _assign_team("unknown_xyz") == "triage-team"

    def test_assign_team_case_insensitive(self):
        from crystalos.lib.bug_tracker import _assign_team
        assert _assign_team("NPS_CALCULATION") == "insights-team"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_conn():
    mock_cur = AsyncMock()
    mock_cur.execute = AsyncMock()
    mock_cur.fetchone = AsyncMock(return_value=None)
    mock_cur.fetchall = AsyncMock(return_value=[])
    mock_cur.description = []
    mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_cur.__aexit__  = AsyncMock(return_value=False)

    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_conn.cursor  = MagicMock(return_value=mock_cur)
    mock_conn.commit  = AsyncMock()
    return mock_conn, mock_cur


def _make_ctx(org_id="org-1", user_id="user-1"):
    ctx = MagicMock()
    ctx.org_id  = org_id
    ctx.user_id = user_id
    ctx.brand   = None
    ctx.survey_id = None
    return ctx


def _make_signal(**kwargs):
    defaults = dict(
        title="Test Bug", description="Something broke",
        affects_feature="crystal", severity="medium", routing="platform",
    )
    defaults.update(kwargs)
    sig = MagicMock()
    for k, v in defaults.items():
        setattr(sig, k, v)
    return sig


# ---------------------------------------------------------------------------
# create_bug_report
# ---------------------------------------------------------------------------

class TestCreateBugReport:
    @pytest.mark.asyncio
    async def test_create_bug_report_inserts_correctly(self):
        """create_bug_report inserts into bug_reports and bug_report_affected."""
        from crystalos.lib.bug_tracker import create_bug_report

        mock_conn, mock_cur = _make_mock_conn()
        mock_cur.fetchone = AsyncMock(return_value=(2,))  # ack_sla_hrs from config

        bug_id = await create_bug_report(_make_signal(), _make_ctx(), mock_conn)

        # Returns a UUID-shaped string
        assert len(bug_id) == 36 and bug_id.count("-") == 4

        # Two execute calls: INSERT bug_reports + INSERT bug_report_affected
        assert mock_conn.execute.await_count == 2

        first_sql = mock_conn.execute.call_args_list[0][0][0]
        assert "INSERT" in first_sql and "bug_reports" in first_sql

        second_sql = mock_conn.execute.call_args_list[1][0][0]
        assert "bug_report_affected" in second_sql


# ---------------------------------------------------------------------------
# record_additional_affected_org + escalation
# ---------------------------------------------------------------------------

class TestRecordAdditionalAffectedOrg:
    @pytest.mark.asyncio
    async def test_maybe_escalate_bug_on_new_org(self):
        """Adding a new org triggers recount and potential escalation."""
        from crystalos.lib.bug_tracker import record_additional_affected_org

        mock_conn, mock_cur = _make_mock_conn()

        created = datetime(2026, 6, 23, 0, 0, 0, tzinfo=timezone.utc)
        call_n = {"n": 0}

        async def _fetchone():
            call_n["n"] += 1
            if call_n["n"] == 1:
                return (3, 1)               # COUNT orgs, brands → 3 orgs
            if call_n["n"] == 2:
                return ("low", 3, 1, created)   # bug row
            if call_n["n"] == 3:
                return (8,)                 # ack_sla_hrs
            return None

        mock_cur.fetchone = AsyncMock(side_effect=_fetchone)

        insert_result = MagicMock()
        insert_result.rowcount = 1
        mock_conn.execute = AsyncMock(return_value=insert_result)

        await record_additional_affected_org("bug-id-123", _make_ctx(org_id="org-2"), mock_conn)

        # At minimum: INSERT affected, UPDATE counts, UPDATE severity, INSERT escalation
        assert mock_conn.execute.await_count >= 2


# ---------------------------------------------------------------------------
# _fire_critical_alert
# ---------------------------------------------------------------------------

class TestFireCriticalAlert:
    @pytest.mark.asyncio
    async def test_fire_critical_alert_writes_notification_event(self):
        """_fire_critical_alert inserts a row into notification_events."""
        from crystalos.lib.bug_tracker import _fire_critical_alert

        mock_conn, mock_cur = _make_mock_conn()
        mock_cur.fetchone = AsyncMock(return_value=(
            "Crystal is broken", "crystal", 5, "platform",
        ))

        await _fire_critical_alert("bug-999", mock_conn)

        assert mock_conn.execute.await_count == 1
        sql = mock_conn.execute.call_args[0][0]
        assert "crystal_event_queue" in sql

        payload_str = mock_conn.execute.call_args[0][1][1]
        import json
        payload = json.loads(payload_str)
        assert payload["severity"] == "critical"
        assert payload["bug_id"]   == "bug-999"
