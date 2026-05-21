#!/usr/bin/env python3
"""Colorize structured JSON log lines from the agents service.

Usage:
    docker compose logs -f agents 2>&1 | python3 agents/logfmt.py
    tail -f agents.log | python3 agents/logfmt.py
    AGENTS_ENV=dev-paid LOG_PRETTY=1 python -m agents.scheduler 2>&1 | tee -a agents.log

Visual hierarchy:
    ERROR    → full red block with separator and all fields
    WARNING  → yellow prefix line with all fields
    INFO     → compact cyan single line
    DEBUG    → dimmed single line
"""
import json
import sys
import textwrap

# ANSI codes
RESET    = "\033[0m"
BOLD     = "\033[1m"
DIM      = "\033[2m"
RED      = "\033[31m"
BRED     = "\033[1;31m"
YELLOW   = "\033[33m"
BYELLOW  = "\033[1;33m"
CYAN     = "\033[36m"
GREEN    = "\033[32m"
MAGENTA  = "\033[35m"
WHITE    = "\033[37m"
BG_RED   = "\033[41m"
BG_YELLOW = "\033[43m"

_W = 72  # block width for error banners

# Keys shown separately — strip them from the extras list
_STRUCTURAL = {
    "level", "event", "timestamp", "severity",
    "logging.googleapis.com/trace", "logging.googleapis.com/labels",
    "error", "exception",
}

# Keys we want to show in extras for errors/warnings (ordered preference)
_PRIORITY_KEYS = ["name", "model", "agent", "run_id", "org_id", "trace_id",
                  "failures", "threshold", "from_state", "to_state",
                  "attempt", "wait_s", "status", "event_type", "node"]


def _ts(d: dict) -> str:
    raw = d.get("timestamp", "")
    return raw[11:19] if len(raw) >= 19 else raw  # HH:MM:SS


def _extras(d: dict, include_dicts: bool = False) -> list[tuple[str, str]]:
    """Return (key, value) pairs for display, priority keys first."""
    pairs: dict[str, str] = {}
    for k, v in d.items():
        if k in _STRUCTURAL:
            continue
        if isinstance(v, (dict, list)) and not include_dicts:
            continue
        if isinstance(v, dict):
            v = json.dumps(v, separators=(",", ":"))
        pairs[k] = str(v)

    ordered: list[tuple[str, str]] = []
    for k in _PRIORITY_KEYS:
        if k in pairs:
            ordered.append((k, pairs.pop(k)))
    ordered += [(k, v) for k, v in pairs.items()]
    return ordered


def _fmt_kv(pairs: list[tuple[str, str]], color: str, indent: int = 5) -> str:
    """Format key=value pairs, wrapping long lines."""
    if not pairs:
        return ""
    parts = [f"{DIM}{k}{RESET}={color}{v}{RESET}" for k, v in pairs]
    line = "  " * indent + "  ".join(parts)
    if len(line) <= _W + indent * 2:
        return line
    # wrap — each pair on its own line
    return "\n".join("  " * indent + p for p in parts)


def _sep(char: str, color: str) -> str:
    return f"{color}{char * _W}{RESET}"


def _fmt_error(d: dict) -> str:
    """Full red block for ERROR level."""
    ts      = _ts(d)
    event   = d.get("event", "unknown")
    error   = d.get("error") or d.get("exception", "")
    extras  = _extras(d)

    lines = [
        _sep("═", BRED),
        f"{BRED}{BOLD}  ERROR  {ts}  {event}{RESET}",
    ]
    if error:
        # Wrap long error messages
        for chunk in textwrap.wrap(str(error), width=_W - 5):
            lines.append(f"  {RED}  {chunk}{RESET}")
    kv = _fmt_kv(extras, WHITE)
    if kv:
        lines.append(kv)
    lines.append(_sep("═", BRED))
    return "\n".join(lines)


def _fmt_warning(d: dict) -> str:
    """Yellow block for WARNING level."""
    ts     = _ts(d)
    event  = d.get("event", "unknown")
    error  = d.get("error") or d.get("exception", "")
    extras = _extras(d)

    lines = [
        _sep("─", BYELLOW),
        f"{BYELLOW}  WARN   {ts}  {event}{RESET}",
    ]
    if error:
        for chunk in textwrap.wrap(str(error), width=_W - 5):
            lines.append(f"  {YELLOW}  {chunk}{RESET}")
    kv = _fmt_kv(extras, WHITE)
    if kv:
        lines.append(kv)
    lines.append(_sep("─", BYELLOW))
    return "\n".join(lines)


def _fmt_info(d: dict) -> str:
    """Compact single line for INFO."""
    ts     = _ts(d)
    event  = d.get("event", "unknown")
    error  = d.get("error", "")
    extras = _extras(d)

    kv_str = "  ".join(f"{DIM}{k}{RESET}={WHITE}{v}{RESET}" for k, v in extras[:6])
    err_str = f"  {RED}→ {error}{RESET}" if error else ""
    return f"{DIM}{ts}{RESET}  {CYAN}INFO   {event}{RESET}{err_str}{'  ' + kv_str if kv_str else ''}"


def _fmt_debug(d: dict) -> str:
    ts    = _ts(d)
    event = d.get("event", "unknown")
    return f"{DIM}{ts}  DEBUG  {event}{RESET}"


_FORMATTERS = {
    "error":   _fmt_error,
    "warning": _fmt_warning,
    "warn":    _fmt_warning,
    "info":    _fmt_info,
    "debug":   _fmt_debug,
}


def _fmt(raw: str) -> str:
    raw = raw.rstrip()
    if not raw:
        return ""

    # Strip docker compose prefix "container  | "
    if " | " in raw[:40]:
        raw = raw.split(" | ", 1)[-1].strip()

    try:
        d = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return raw

    level = d.get("level", "info").lower()
    fn    = _FORMATTERS.get(level, _fmt_info)
    return fn(d)


def main() -> None:
    try:
        for line in sys.stdin:
            out = _fmt(line)
            if out:
                print(out, flush=True)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
