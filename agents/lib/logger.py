"""Structured JSON logger for the agents service.

Uses structlog with JSON output in production, colorized console in dev.
Every log entry includes agent_name, org_id (when available), and run_id.
"""
import logging
import os
import sys

import structlog

ENV = os.getenv("AGENTS_ENV", "dev")

# Envs that emit machine-readable JSON (deployed/shared environments)
_JSON_ENVS = {"prod", "staging", "dev-paid"}


def configure_logging() -> None:
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if ENV in _JSON_ENVS:
        # Machine-readable JSON for GCP Cloud Logging / Loki
        processors = shared_processors + [structlog.processors.JSONRenderer()]
    else:
        # Human-readable colorized output for local dev
        processors = shared_processors + [structlog.dev.ConsoleRenderer(colors=True)]

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
