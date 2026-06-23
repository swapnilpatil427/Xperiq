"""Unit tests for the Crystal user-directory segmentation tools."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from crystalos.crystal.context import CrystalContext
from crystalos.crystal.user_directory_tools import (
    execute_get_user_directory_context,
    execute_segment_users_by_attribute,
)
from crystalos.crystal.registry import TOOL_REGISTRY, DATA_TOOL_NAMES
from crystalos.crystal.tools import TOOL_EXECUTORS


def _ctx():
    return CrystalContext(org_id="org-1", user_id="u-admin", survey_id=None, scope="org")


def _make_pool(responses):
    """responses: list of (sql_substr, description, fetchall_rows, fetchone_row).
    The first response whose substr is in the executed SQL wins."""
    cur = AsyncMock()
    state = {"all": [], "one": None}

    async def _execute(sql, params=None):
        for sub, desc, allrows, onerow in responses:
            if sub in sql:
                cur.description = desc
                state["all"] = allrows
                state["one"] = onerow
                return
        cur.description = []
        state["all"] = []
        state["one"] = None

    cur.execute = AsyncMock(side_effect=_execute)
    cur.fetchall = AsyncMock(side_effect=lambda: state["all"])
    cur.fetchone = AsyncMock(side_effect=lambda: state["one"])
    cur.__aenter__ = AsyncMock(return_value=cur)
    cur.__aexit__ = AsyncMock(return_value=False)

    conn = AsyncMock()
    conn.cursor = MagicMock(return_value=cur)
    conn.__aenter__ = AsyncMock(return_value=conn)
    conn.__aexit__ = AsyncMock(return_value=False)

    pool_ctx = MagicMock()
    pool_ctx.__aenter__ = AsyncMock(return_value=conn)
    pool_ctx.__aexit__ = AsyncMock(return_value=False)
    pool = MagicMock()
    pool.connection = MagicMock(return_value=pool_ctx)
    return pool


class TestRegistration:
    def test_tools_registered(self):
        names = {t["name"] for t in TOOL_REGISTRY}
        assert "get_user_directory_context" in names
        assert "segment_users_by_attribute" in names

    def test_executors_wired(self):
        assert "get_user_directory_context" in TOOL_EXECUTORS
        assert "segment_users_by_attribute" in TOOL_EXECUTORS

    def test_classified_as_data_tools(self):
        assert "segment_users_by_attribute" in DATA_TOOL_NAMES


class TestDirectoryContext:
    @pytest.mark.asyncio
    async def test_returns_departments_groups_and_total(self):
        pool = _make_pool([
            ("FROM departments",
             [("id",), ("name",), ("parent_department_id",), ("depth",), ("path",), ("member_count",)],
             [("d1", "Engineering", None, 0, ["d1"], 5)], None),
            ("FROM user_groups",
             [("id",), ("name",), ("group_type",), ("member_count",)],
             [("g1", "Q4 Pilot", "static", 12)], None),
            ("COUNT(*)::int AS n FROM user_profiles", [("n",)], [], (20,)),
        ])
        with patch("crystalos.crystal.user_directory_tools.db._pool_conn", return_value=pool):
            res = await execute_get_user_directory_context(_ctx(), {})
        assert res["total_active_users"] == 20
        assert res["departments"][0]["name"] == "Engineering"
        assert res["groups"][0]["type"] == "static"


class TestSegment:
    @pytest.mark.asyncio
    async def test_segment_by_role(self):
        pool = _make_pool([
            ("JOIN org_roles r", [("user_id",)], [("u1",), ("u2",)], None),
        ])
        with patch("crystalos.crystal.user_directory_tools.db._pool_conn", return_value=pool):
            res = await execute_segment_users_by_attribute(_ctx(), {"role_key": "org:analyst"})
        assert res["segment_type"] == "role"
        assert res["count"] == 2
        assert res["user_ids"] == ["u1", "u2"]

    @pytest.mark.asyncio
    async def test_segment_by_department_includes_subtree(self):
        pool = _make_pool([
            ("FROM departments WHERE org_id = %s AND name = %s", [("id",)], [], ("d1",)),
            ("path @> ARRAY", [("user_id",)], [("u1",), ("u2",), ("u3",)], None),
        ])
        with patch("crystalos.crystal.user_directory_tools.db._pool_conn", return_value=pool):
            res = await execute_segment_users_by_attribute(_ctx(), {"department_name": "Engineering"})
        assert res["segment_type"] == "department"
        assert res["count"] == 3

    @pytest.mark.asyncio
    async def test_segment_requires_a_selector(self):
        pool = _make_pool([])
        with patch("crystalos.crystal.user_directory_tools.db._pool_conn", return_value=pool):
            res = await execute_segment_users_by_attribute(_ctx(), {})
        assert "error" in res
