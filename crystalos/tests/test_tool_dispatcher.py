"""Tests for agents/lib/tool_dispatcher.py

Covers: plugin.json loading, tool resolution, dispatch, memoization, access control.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from crystalos.lib.tool_dispatcher import ToolDispatcher, ToolNotAllowedError


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_plugin_json(tmp_path: Path, tools: dict, mcp_servers: dict | None = None) -> Path:
    plugin = {
        "name": "test-plugin",
        "version": "1.0.0",
        "skills": [],
        "tools": tools,
        "mcp_servers": mcp_servers or {},
    }
    plugin_path = tmp_path / "plugin.json"
    plugin_path.write_text(json.dumps(plugin))
    return plugin_path


# ── Loading tests ─────────────────────────────────────────────────────────────

def test_initialize_loads_tools(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={"fake_tool": "json:loads"})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()
    assert dispatcher.has_tool("fake_tool")


def test_initialize_missing_plugin_does_not_crash(tmp_path: Path):
    dispatcher = ToolDispatcher(plugin_path=tmp_path / "nonexistent.json")
    dispatcher.initialize()  # Should log warning, not raise
    assert not dispatcher._initialized or len(dispatcher._tools) == 0


def test_initialize_bad_import_path_skipped(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={"bad_tool": "nonexistent.module:bad_fn"})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()
    assert "bad_tool" not in dispatcher._tools


def test_get_tool_names(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={"tool_a": "json:loads", "tool_b": "json:dumps"})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()
    names = dispatcher.get_tool_names()
    assert "tool_a" in names
    assert "tool_b" in names


# ── Dispatch tests ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dispatch_known_tool(tmp_path: Path):
    # json.loads is a known callable — use it as a mock tool
    plugin_path = make_plugin_json(tmp_path, tools={"parse_json": "json:loads"})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()

    # Mock the function dispatch to return a controlled value
    dispatcher._tools["parse_json"] = lambda ctx, params, **kw: {"parsed": True}
    result = await dispatcher.dispatch("parse_json", {}, ctx={})
    assert result == {"parsed": True}


@pytest.mark.asyncio
async def test_dispatch_unknown_tool_returns_error(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()
    result = await dispatcher.dispatch("nonexistent_tool", {}, ctx={})
    assert "error" in result
    assert "nonexistent_tool" in result["error"]


@pytest.mark.asyncio
async def test_dispatch_async_tool(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()

    async def async_tool(ctx, params, **kw):
        return {"async_result": True}

    dispatcher._tools["async_tool"] = async_tool
    result = await dispatcher.dispatch("async_tool", {}, ctx={})
    assert result == {"async_result": True}


@pytest.mark.asyncio
async def test_dispatch_tool_exception_returns_error(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()

    def broken_tool(ctx, params, **kw):
        raise ValueError("Something went wrong")

    dispatcher._tools["broken_tool"] = broken_tool
    result = await dispatcher.dispatch("broken_tool", {}, ctx={})
    assert "error" in result
    assert "broken_tool" in result.get("tool", "")


# ── Access control tests ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dispatch_raises_if_tool_not_allowed(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()
    dispatcher._tools["forbidden_tool"] = lambda ctx, params, **kw: {}

    with pytest.raises(ToolNotAllowedError):
        await dispatcher.dispatch(
            "forbidden_tool",
            {},
            ctx={},
            allowed_tools={"other_tool"},  # forbidden_tool not in allowed set
        )


@pytest.mark.asyncio
async def test_dispatch_allows_tool_in_allowed_set(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()
    dispatcher._tools["allowed_tool"] = lambda ctx, params, **kw: {"ok": True}

    result = await dispatcher.dispatch(
        "allowed_tool",
        {},
        ctx={},
        allowed_tools={"allowed_tool"},
    )
    assert result == {"ok": True}


# ── Memoization tests ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tool_cache_hit(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()

    call_count = 0

    def counting_tool(ctx, params, **kw):
        nonlocal call_count
        call_count += 1
        return {"count": call_count}

    dispatcher._tools["counting_tool"] = counting_tool

    cache: dict = {}
    r1 = await dispatcher.dispatch("counting_tool", {"x": 1}, ctx={}, tool_cache=cache)
    r2 = await dispatcher.dispatch("counting_tool", {"x": 1}, ctx={}, tool_cache=cache)  # Same params

    assert r1 == r2
    assert call_count == 1  # Tool called only once


@pytest.mark.asyncio
async def test_tool_cache_miss_different_params(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()

    call_count = 0

    def counting_tool(ctx, params, **kw):
        nonlocal call_count
        call_count += 1
        return {"count": call_count}

    dispatcher._tools["counting_tool"] = counting_tool

    cache: dict = {}
    await dispatcher.dispatch("counting_tool", {"x": 1}, ctx={}, tool_cache=cache)
    await dispatcher.dispatch("counting_tool", {"x": 2}, ctx={}, tool_cache=cache)  # Different params

    assert call_count == 2  # Both calls execute


@pytest.mark.asyncio
async def test_error_result_not_cached(tmp_path: Path):
    plugin_path = make_plugin_json(tmp_path, tools={})
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()

    call_count = 0

    def error_then_ok(ctx, params, **kw):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {"error": "first call failed"}
        return {"result": "ok"}

    dispatcher._tools["flaky_tool"] = error_then_ok

    cache: dict = {}
    r1 = await dispatcher.dispatch("flaky_tool", {"x": 1}, ctx={}, tool_cache=cache)
    r2 = await dispatcher.dispatch("flaky_tool", {"x": 1}, ctx={}, tool_cache=cache)

    assert r1.get("error") is not None
    assert r2.get("result") == "ok"
    assert call_count == 2  # Error result was not cached


# ── MCP stub test ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mcp_tool_raises_not_implemented(tmp_path: Path):
    plugin_path = make_plugin_json(
        tmp_path,
        tools={},
        mcp_servers={"jira": {"command": "npx", "args": ["@mcp/jira"]}},
    )
    dispatcher = ToolDispatcher(plugin_path=plugin_path)
    dispatcher.initialize()
    dispatcher._mcp_servers["jira_create_ticket"] = {}

    with pytest.raises(NotImplementedError):
        await dispatcher._dispatch_mcp("jira_create_ticket", {}, {})


# ── Real plugin.json smoke test ───────────────────────────────────────────────

def test_real_plugin_json_loads():
    real_plugin = Path(__file__).parent.parent / "skills" / "plugin.json"
    if not real_plugin.exists():
        pytest.skip("agents/skills/plugin.json not found")
    dispatcher = ToolDispatcher(plugin_path=real_plugin)
    dispatcher.initialize()
    # Should have loaded at least the crystal tools
    assert "get_survey_overview" in dispatcher._tools
    assert len(dispatcher._tools) >= 10
