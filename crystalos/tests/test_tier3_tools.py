"""Tests for tier-3 Crystal tools: propose_assign_owner, get_verbatims,
get_case_history, get_contact_identity.
"""
from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from dataclasses import dataclass, field
from typing import Any


# ── Minimal CrystalContext stand-in ─────────────────────────────────────────

@dataclass
class FakeCtx:
    org_id: str = "org-test"
    survey_id: str | None = "sv-test"
    user_id: str = "user-test"
    effective_perms: frozenset = field(default_factory=frozenset)


@pytest.fixture
def make_ctx():
    """Factory for a minimal context object."""
    def _factory(org_id="org-test", survey_id="sv-test", perms=frozenset()):
        return FakeCtx(org_id=org_id, survey_id=survey_id, effective_perms=perms)
    return _factory


# ── Mock DB helper ──────────────────────────────────────────────────────────

def _make_mock_conn(rows=None, cols=None):
    """Return nested mock for async with db._pool_conn().connection() as conn."""
    rows = rows or []
    cols = cols or []

    mock_cur = AsyncMock()
    mock_cur.execute = AsyncMock()
    mock_cur.fetchall = AsyncMock(return_value=rows)
    mock_cur.fetchone = AsyncMock(return_value=rows[0] if rows else None)
    mock_cur.description = [(c,) for c in cols]

    mock_conn = AsyncMock()
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=False)
    mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

    mock_pool = MagicMock()
    mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

    return mock_pool, mock_cur


def _ctx_manager(obj):
    """Wrap an object as an async context manager."""
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=obj)
    ctx.__aexit__ = AsyncMock(return_value=False)
    return ctx


# ── execute_propose_assign_owner ────────────────────────────────────────────

class TestProposeAssignOwner:
    @pytest.mark.asyncio
    async def test_returns_proposal_with_matched_true_when_route_matches(self, make_ctx):
        from crystalos.crystal.tools import execute_propose_assign_owner

        ctx = make_ctx()
        params = {"dimension": "region", "match_value": "us-west"}

        matched_route = {
            "matched": True,
            "owner_user_id": "user-owner-1",
            "owner_label": "West Coast Team",
            "rule_id": "route-abc",
            "rule_match_value": "us-west",
        }

        with patch(
            "crystalos.crystal.tools.execute_get_ownership_route",
            AsyncMock(return_value=matched_route),
        ):
            result = await execute_propose_assign_owner(ctx, params)

        assert result["proposal_type"] == "assign_owner"
        assert result["matched"] is True
        assert result["params"]["owner_user_id"] == "user-owner-1"
        assert result["params"]["owner_label"] == "West Coast Team"

    @pytest.mark.asyncio
    async def test_returns_proposal_with_matched_false_when_no_route_matches(self, make_ctx):
        from crystalos.crystal.tools import execute_propose_assign_owner

        ctx = make_ctx()
        params = {"dimension": "region", "match_value": "antartica"}

        unmatched_route = {
            "matched": False,
            "owner_user_id": None,
            "owner_label": None,
        }

        with patch(
            "crystalos.crystal.tools.execute_get_ownership_route",
            AsyncMock(return_value=unmatched_route),
        ):
            result = await execute_propose_assign_owner(ctx, params)

        assert result["proposal_type"] == "assign_owner"
        assert result["matched"] is False
        assert result.get("requires_confirmation") is True

    @pytest.mark.asyncio
    async def test_always_includes_proposal_type_key(self, make_ctx):
        from crystalos.crystal.tools import execute_propose_assign_owner

        ctx = make_ctx()
        params = {}

        with patch(
            "crystalos.crystal.tools.execute_get_ownership_route",
            AsyncMock(return_value={"matched": False}),
        ):
            result = await execute_propose_assign_owner(ctx, params)

        assert "proposal_type" in result
        assert result["proposal_type"] == "assign_owner"


# ── execute_get_verbatims ───────────────────────────────────────────────────

class TestGetVerbatims:
    def _make_verbatim_rows(self, sentiments=("positive",)):
        """Return mock DB rows in the format responses table uses."""
        rows = []
        for i, sent in enumerate(sentiments):
            # answers column is a JSON-encoded list of answer dicts
            answers = json.dumps([{"value": f"Sample feedback {i}"}])
            rows.append((answers, sent, 0.8, "2024-01-01"))
        return rows

    @pytest.mark.asyncio
    async def test_org_id_included_in_verbatim_query(self, make_ctx):
        from crystalos.crystal.tools import execute_get_verbatims

        ctx = make_ctx(org_id="org-isolated")
        params = {"survey_id": "sv-1"}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=[])
        mock_cur.description = [("answers",), ("ai_sentiment",), ("ai_sentiment_score",), ("submitted_at",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            await execute_get_verbatims(ctx, params)

        # Verify org_id is in the query params
        call_args = mock_cur.execute.call_args
        sql, args = call_args[0]
        assert "org-isolated" in args

    @pytest.mark.asyncio
    async def test_returns_list_of_verbatim_dicts_when_db_has_data(self, make_ctx):
        from crystalos.crystal.tools import execute_get_verbatims

        ctx = make_ctx()
        params = {"survey_id": "sv-1"}
        rows = self._make_verbatim_rows(("positive", "negative"))

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=rows)
        mock_cur.description = [("answers",), ("ai_sentiment",), ("ai_sentiment_score",), ("submitted_at",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            result = await execute_get_verbatims(ctx, params)

        assert "verbatims" in result
        assert result["count"] == 2

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_db_returns_no_rows(self, make_ctx):
        from crystalos.crystal.tools import execute_get_verbatims

        ctx = make_ctx()
        params = {"survey_id": "sv-1"}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=[])
        mock_cur.description = [("answers",), ("ai_sentiment",), ("ai_sentiment_score",), ("submitted_at",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            result = await execute_get_verbatims(ctx, params)

        assert result["verbatims"] == []
        assert result["count"] == 0

    @pytest.mark.asyncio
    async def test_respects_sentiment_filter_in_query_params(self, make_ctx):
        from crystalos.crystal.tools import execute_get_verbatims

        ctx = make_ctx()
        params = {"survey_id": "sv-1", "sentiment": "negative"}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=[])
        mock_cur.description = [("answers",), ("ai_sentiment",), ("ai_sentiment_score",), ("submitted_at",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            await execute_get_verbatims(ctx, params)

        call_args = mock_cur.execute.call_args
        sql, args = call_args[0]
        assert "negative" in args

    @pytest.mark.asyncio
    async def test_respects_limit_param(self, make_ctx):
        from crystalos.crystal.tools import execute_get_verbatims

        ctx = make_ctx()
        params = {"survey_id": "sv-1", "limit": 5}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=[])
        mock_cur.description = [("answers",), ("ai_sentiment",), ("ai_sentiment_score",), ("submitted_at",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            await execute_get_verbatims(ctx, params)

        call_args = mock_cur.execute.call_args
        _, args = call_args[0]
        # The limit should be in the args tuple
        assert 5 in args


# ── execute_get_case_history ────────────────────────────────────────────────

class TestGetCaseHistory:
    def _make_case_rows(self, n=2):
        rows = []
        for i in range(n):
            rows.append((
                f"case-{i}",
                f"Case #{i}",
                "open",
                "high",
                None,   # resolved_at
                None,   # resolution_note
            ))
        return rows

    @pytest.mark.asyncio
    async def test_queries_cx_cases_with_contact_id_and_org_id_filters(self, make_ctx):
        from crystalos.crystal.tools import execute_get_case_history

        ctx = make_ctx(org_id="org-cx")
        params = {"contact_id": "contact-abc"}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=[])
        mock_cur.description = [("id",), ("title",), ("status",), ("severity",), ("resolved_at",), ("resolution_note",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            await execute_get_case_history(ctx, params)

        call_args = mock_cur.execute.call_args
        _, args = call_args[0]
        assert "org-cx" in args
        assert "contact-abc" in args

    @pytest.mark.asyncio
    async def test_returns_list_of_cases_with_status_severity(self, make_ctx):
        from crystalos.crystal.tools import execute_get_case_history

        ctx = make_ctx()
        params = {"contact_id": "contact-1"}
        rows = self._make_case_rows(2)

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=rows)
        mock_cur.description = [("id",), ("title",), ("status",), ("severity",), ("resolved_at",), ("resolution_note",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            result = await execute_get_case_history(ctx, params)

        assert result["total"] == 2
        assert len(result["cases"]) == 2
        assert result["cases"][0]["status"] == "open"

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_cases_found(self, make_ctx):
        from crystalos.crystal.tools import execute_get_case_history

        ctx = make_ctx()
        params = {"contact_id": "contact-xyz"}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchall = AsyncMock(return_value=[])
        mock_cur.description = [("id",), ("title",), ("status",), ("severity",), ("resolved_at",), ("resolution_note",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            result = await execute_get_case_history(ctx, params)

        assert result["cases"] == []
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_returns_empty_dict_when_contact_id_missing_and_no_driver(self, make_ctx):
        from crystalos.crystal.tools import execute_get_case_history

        ctx = make_ctx()
        params = {}  # no contact_id, no driver

        result = await execute_get_case_history(ctx, params)
        assert "error" in result


# ── execute_get_contact_identity ─────────────────────────────────────────────

class TestGetContactIdentity:
    @pytest.mark.asyncio
    async def test_returns_masked_error_when_no_pii_permission(self, make_ctx):
        from crystalos.crystal.tools import execute_get_contact_identity

        ctx = make_ctx(perms=frozenset())  # no data:pii
        params = {"response_id": "resp-1"}

        result = await execute_get_contact_identity(ctx, params)

        assert result.get("masked") is True
        assert "error" in result
        assert "data:pii" in result["error"]

    @pytest.mark.asyncio
    async def test_returns_full_contact_data_when_caller_has_pii_permission(self, make_ctx):
        from crystalos.crystal.tools import execute_get_contact_identity

        ctx = make_ctx(perms=frozenset({"data:pii"}))
        params = {"response_id": "resp-1"}

        contact_row = ("contact-uuid", "Alice Smith", "alice@example.com", "acct-1", "Acme Corp", {}, True)
        cols = ["id", "name", "email", "account_id", "account_name", "segment_attrs", "consent_given"]

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchone = AsyncMock(return_value=contact_row)
        mock_cur.description = [(c,) for c in cols]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            result = await execute_get_contact_identity(ctx, params)

        assert result["contact"]["email"] == "alice@example.com"
        assert result["contact"]["name"] == "Alice Smith"

    @pytest.mark.asyncio
    async def test_queries_contacts_with_both_contact_id_and_org_id(self, make_ctx):
        from crystalos.crystal.tools import execute_get_contact_identity

        ctx = make_ctx(org_id="org-secure", perms=frozenset({"data:pii"}))
        params = {"response_id": "resp-abc"}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchone = AsyncMock(return_value=None)
        mock_cur.description = [("id",), ("name",), ("email",), ("account_id",), ("account_name",), ("segment_attrs",), ("consent_given",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            await execute_get_contact_identity(ctx, params)

        call_args = mock_cur.execute.call_args
        _, args = call_args[0]
        # Both response_id and org_id must be passed to the query
        assert "resp-abc" in args
        assert "org-secure" in args

    @pytest.mark.asyncio
    async def test_returns_contact_none_when_row_not_found(self, make_ctx):
        from crystalos.crystal.tools import execute_get_contact_identity

        ctx = make_ctx(perms=frozenset({"data:pii"}))
        params = {"response_id": "resp-missing"}

        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchone = AsyncMock(return_value=None)
        mock_cur.description = [("id",), ("name",), ("email",), ("account_id",), ("account_name",), ("segment_attrs",), ("consent_given",)]

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.cursor = MagicMock(return_value=_ctx_manager(mock_cur))

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=_ctx_manager(mock_conn))

        with patch("crystalos.crystal.tools.db._pool_conn", return_value=mock_pool):
            result = await execute_get_contact_identity(ctx, params)

        assert result["contact"] is None
