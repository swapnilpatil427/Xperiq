"""CrystalOS Tool Dispatcher — routes skill tool calls to Python functions or MCP servers.

Internal tools (agents.tools.*, agents.crystal.tools.*) are called directly
via importlib — sub-millisecond overhead, no subprocess.

MCP tools (Jira, Slack, etc.) are stubbed for future implementation.

Usage:
    dispatcher = get_dispatcher()
    dispatcher.initialize()
    result = await dispatcher.dispatch("get_topics", params, ctx, allowed_tools={"get_topics"})
"""
from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import Any

from crystalos.lib.logger import logger

_dispatcher: "ToolDispatcher | None" = None


def get_dispatcher(plugin_path: Path | None = None) -> "ToolDispatcher":
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = ToolDispatcher(plugin_path=plugin_path)
    return _dispatcher


class ToolNotAllowedError(Exception):
    """Raised when a skill calls a tool not in its allowed-tools list."""
    pass


class ToolDispatcher:
    """Resolves tool names to Python functions via plugin.json manifest."""

    def __init__(self, plugin_path: Path | None = None):
        self._plugin_path = plugin_path or (
            Path(__file__).parent.parent / "skills" / "plugin.json"
        )
        self._tools: dict[str, Any] = {}          # name → callable
        self._mcp_servers: dict[str, dict] = {}    # name → config
        self._initialized = False

    def initialize(self) -> None:
        """Load plugin.json and resolve all tool import paths."""
        if not self._plugin_path.exists():
            logger.warning("plugin_json_not_found", path=str(self._plugin_path))
            return

        try:
            plugin = json.loads(self._plugin_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error("plugin_json_parse_error", error=str(exc))
            return

        tools_config: dict[str, str] = plugin.get("tools", {})
        for tool_name, import_path in tools_config.items():
            try:
                fn = self._resolve_import(import_path)
                self._tools[tool_name] = fn
            except Exception as exc:
                logger.warning("tool_resolve_failed", tool=tool_name, path=import_path, error=str(exc))

        self._mcp_servers = plugin.get("mcp_servers", {})
        self._initialized = True
        logger.info(
            "tool_dispatcher_initialized",
            tool_count=len(self._tools),
            tools=sorted(self._tools.keys()),
        )

    def _resolve_import(self, import_path: str) -> Any:
        """Resolve 'module.path:function_name' to a callable."""
        if ":" not in import_path:
            raise ValueError(f"Invalid import path (missing ':'): {import_path!r}")
        module_path, fn_name = import_path.rsplit(":", 1)
        module = importlib.import_module(module_path)
        fn = getattr(module, fn_name)
        if not callable(fn):
            raise TypeError(f"{import_path!r} resolved to non-callable {type(fn)}")
        return fn

    async def dispatch(
        self,
        tool_name: str,
        params: dict,
        ctx: dict,
        allowed_tools: set[str] | None = None,
        tool_cache: dict | None = None,
    ) -> dict:
        """Dispatch a tool call.

        Args:
            tool_name: Name of the tool to call.
            params: Tool parameters dict.
            ctx: Execution context (org_id, survey_id, etc.).
            allowed_tools: If set, restricts which tools this call may use.
            tool_cache: Optional per-session memoization dict.

        Returns:
            Tool result dict. On error: {"error": str, "tool": tool_name}.
        """
        # Access control
        if allowed_tools is not None and tool_name not in allowed_tools:
            raise ToolNotAllowedError(
                f"Tool {tool_name!r} is not in the skill's allowed-tools list. "
                f"Allowed: {sorted(allowed_tools)}"
            )

        # L0 memoization (per-session in-memory cache)
        cache_key = f"{tool_name}:{json.dumps(params, sort_keys=True, default=str)}"
        if tool_cache is not None:
            if cache_key in tool_cache:
                logger.debug("tool_cache_hit", tool=tool_name)
                return tool_cache[cache_key]

        # Resolve tool
        fn = self._tools.get(tool_name)
        if fn is None:
            if tool_name in self._mcp_servers:
                return await self._dispatch_mcp(tool_name, params, ctx)
            return {"error": f"Unknown tool: {tool_name!r}", "tool": tool_name}

        # Call the tool function
        try:
            import asyncio
            import inspect
            if inspect.iscoroutinefunction(fn):
                result = await fn(ctx=ctx, params=params, **params)
            else:
                result = fn(ctx=ctx, params=params, **params)
        except TypeError:
            # Some tools may not accept ctx/params kwargs — try positional
            try:
                import asyncio
                if inspect.iscoroutinefunction(fn):
                    result = await fn(ctx, params)
                else:
                    result = fn(ctx, params)
            except Exception as exc:
                logger.error("tool_dispatch_error", tool=tool_name, error=str(exc))
                return {"error": str(exc), "tool": tool_name}
        except Exception as exc:
            logger.error("tool_dispatch_error", tool=tool_name, error=str(exc))
            return {"error": str(exc), "tool": tool_name}

        if not isinstance(result, dict):
            result = {"result": result}

        # Cache successful results
        if tool_cache is not None and "error" not in result:
            tool_cache[cache_key] = result

        return result

    async def _dispatch_mcp(self, tool_name: str, params: dict, ctx: dict) -> dict:
        """Placeholder for MCP server dispatch (future implementation)."""
        raise NotImplementedError(
            f"MCP tool dispatch not yet implemented. Tool: {tool_name!r}. "
            "Configure this tool as an internal Python tool first."
        )

    def get_tool_names(self) -> list[str]:
        """Return all registered internal tool names."""
        return sorted(self._tools.keys())

    def has_tool(self, tool_name: str) -> bool:
        return tool_name in self._tools or tool_name in self._mcp_servers
