"""Async database helpers for the agents service.

Writes to agent_runs and notifications tables in the shared Postgres instance.
Uses psycopg3 async with a connection pool for efficiency.

All queries are parameterized — never interpolate user input into SQL.
"""
from __future__ import annotations

import json
import os
from typing import Any

import psycopg
from psycopg_pool import AsyncConnectionPool

from agents.lib.logger import logger

_DSN  = os.getenv("AGENTS_DB_DSN", "postgresql://postgres:postgres@localhost:5432/experient")
_pool: AsyncConnectionPool | None = None


async def init_pool() -> None:
    global _pool
    _pool = AsyncConnectionPool(_DSN, min_size=2, max_size=10, open=False)
    await _pool.open()
    logger.info("db_pool_ready", dsn=_DSN.split("@")[-1])


async def close_pool() -> None:
    if _pool:
        await _pool.close()


def _pool_conn() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — call init_pool() first")
    return _pool


# ── agent_runs ──────────────────────────────────────────────────────────────────

async def create_run(
    run_id:         str,
    thread_id:      str,
    org_id:         str,
    user_id:        str,
    intent:         str,
    survey_type_id: str | None,
) -> None:
    async with _pool_conn().connection() as conn:
        await conn.execute(
            """
            INSERT INTO agent_runs
                (id, thread_id, org_id, user_id, intent, survey_type_id, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'running')
            """,
            (run_id, thread_id, org_id, user_id, intent, survey_type_id),
        )


async def update_run(run_id: str, **fields: Any) -> None:
    """Generic updater — only call with known-safe column names."""
    _ALLOWED = {
        "status", "qc_score", "qc_issues", "qc_validation_errors", "recommendations",
        "result_questions", "revision_count",
        "compliance_risk_level", "compliance_findings", "compliance_blocks_dist",
        "total_tokens", "cost_usd", "survey_id",
        "completed_at", "error_log",
    }
    columns = [k for k in fields if k in _ALLOWED]
    if not columns:
        return

    set_clauses = ", ".join(f"{col} = %s" for col in columns)
    values      = [fields[col] for col in columns]
    for i, col in enumerate(columns):
        # Serialise JSONB fields
        if col in (
            "qc_issues", "qc_validation_errors", "recommendations",
            "result_questions", "error_log",
            "compliance_findings",
        ) and isinstance(values[i], (list, dict)):
            values[i] = json.dumps(values[i])

    async with _pool_conn().connection() as conn:
        await conn.execute(
            f"UPDATE agent_runs SET {set_clauses} WHERE id = %s",
            values + [run_id],
        )


async def append_run_events(
    run_id:        str,
    stream_events: list[dict],
    credit_log:    list[dict],
    total_tokens:  int,
    cost_usd:      float,
) -> None:
    """Append stream events and credit entries to JSONB arrays atomically."""
    async with _pool_conn().connection() as conn:
        await conn.execute(
            """
            UPDATE agent_runs SET
                stream_events = stream_events || %s::jsonb,
                credit_log    = credit_log    || %s::jsonb,
                total_tokens  = %s,
                cost_usd      = %s
            WHERE id = %s
            """,
            (
                json.dumps(stream_events),
                json.dumps(credit_log),
                total_tokens,
                cost_usd,
                run_id,
            ),
        )


async def get_run_by_thread(thread_id: str, org_id: str) -> dict[str, Any] | None:
    """Fetch a run by thread_id, scoped to org_id for tenant isolation."""
    async with _pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM agent_runs WHERE thread_id = %s AND org_id = %s",
                (thread_id, org_id),
            )
            row = await cur.fetchone()
            if row is None:
                return None
            cols = [desc[0] for desc in cur.description]
            return dict(zip(cols, row))


async def get_run_by_id(run_id: str, org_id: str) -> dict[str, Any] | None:
    """Fetch a run by id, scoped to org_id."""
    async with _pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM agent_runs WHERE id = %s AND org_id = %s",
                (run_id, org_id),
            )
            row = await cur.fetchone()
            if row is None:
                return None
            cols = [desc[0] for desc in cur.description]
            return dict(zip(cols, row))


async def get_run_questions(run_id: str, org_id: str) -> list[dict] | None:
    """Return result_questions for a run, or None if not found."""
    row = await get_run_by_id(run_id, org_id)
    if row is None:
        return None
    return row.get("result_questions") or []


async def save_run_questions(run_id: str, questions: list[dict]) -> None:
    """Overwrite result_questions for a run (used by CRUD endpoints)."""
    async with _pool_conn().connection() as conn:
        await conn.execute(
            "UPDATE agent_runs SET result_questions = %s::jsonb WHERE id = %s",
            (json.dumps(questions), run_id),
        )


# ── notifications ───────────────────────────────────────────────────────────────

async def create_notification(
    org_id:  str,
    user_id: str,
    type_:   str,
    title:   str,
    body:    str | None = None,
    payload: dict | None = None,
    run_id:  str | None = None,
) -> None:
    async with _pool_conn().connection() as conn:
        await conn.execute(
            """
            INSERT INTO notifications
                (org_id, user_id, type, title, body, payload, run_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                org_id,
                user_id,
                type_,
                title,
                body,
                json.dumps(payload or {}),
                run_id,
            ),
        )
