"""Structured JSON logger for the agents service.

Uses structlog with JSON output in production, colorized console in dev.
Every log entry includes agent_name, org_id (when available), and run_id.
"""
import logging
import os
import sys
from typing import Any

import structlog

ENV = os.getenv("AGENTS_ENV", "dev")

# LOG_PRETTY=1 forces colorized console output regardless of ENV.
# Use this locally when AGENTS_ENV=dev-paid (for circuit-breaker thresholds)
# but you still want readable colored logs instead of raw JSON.
_FORCE_PRETTY = os.getenv("LOG_PRETTY", "").lower() in ("1", "true", "yes")

# Envs that emit machine-readable JSON (deployed/shared environments)
_JSON_ENVS = {"prod", "staging", "dev-paid"}

# Log-level string → GCP severity mapping
_LEVEL_TO_SEVERITY: dict[str, str] = {
    "debug":    "DEBUG",
    "info":     "INFO",
    "warning":  "WARNING",
    "error":    "ERROR",
    "critical": "CRITICAL",
}


def _add_gcp_labels(logger: Any, method: str, event_dict: dict) -> dict:
    """Structlog processor: inject GCP Cloud Logging fields for JSON envs.

    Adds:
      - ``severity``                         — mapped from structlog level; GCP
                                               uses this for log severity filtering
      - ``logging.googleapis.com/trace``     — fully-qualified trace resource name;
                                               enables Cloud Trace correlation in
                                               Cloud Log Explorer
      - ``logging.googleapis.com/labels``    — dict with run_id, org_id, trace_id;
                                               indexed as log labels for fast search
    """
    from crystalos.lib.trace_context import get_trace_context, gcp_trace_field

    level = event_dict.get("level", "info")
    event_dict["severity"] = _LEVEL_TO_SEVERITY.get(level.lower(), "INFO")

    ctx = get_trace_context()
    trace_value = gcp_trace_field()
    if trace_value:
        event_dict["logging.googleapis.com/trace"] = trace_value

    event_dict["logging.googleapis.com/labels"] = {
        "run_id":   ctx.get("run_id", ""),
        "org_id":   ctx.get("org_id", ""),
        "trace_id": ctx.get("trace_id", ""),
    }
    return event_dict


def configure_logging() -> None:
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if ENV in _JSON_ENVS and not _FORCE_PRETTY:
        # Machine-readable JSON for GCP Cloud Logging / Loki
        # _add_gcp_labels runs after add_log_level so level is available
        processors = shared_processors + [_add_gcp_labels, structlog.processors.JSONRenderer()]
    else:
        # Human-readable colorized output for local dev (or when LOG_PRETTY=1)
        # Bold red errors and bold yellow warnings so they stand out immediately.
        _level_styles = {
            "critical":  "\033[1;31m",   # bold red
            "error":     "\033[1;31m",   # bold red
            "warning":   "\033[1;33m",   # bold yellow
            "warn":      "\033[1;33m",
            "info":      "\033[36m",     # cyan
            "debug":     "\033[2m",      # dim
            "notset":    "\033[2m",
        }
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True, level_styles=_level_styles)
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if ENV == "dev" else logging.INFO
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


configure_logging()

logger = structlog.get_logger("agents")
