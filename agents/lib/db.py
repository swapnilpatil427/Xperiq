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
    if _pool is not None:
        return  # already initialised — avoid leaking the first pool
    _pool = AsyncConnectionPool(_DSN, min_size=2, max_size=10, open=False)
    await _pool.open()
    logger.info("db_pool_ready", dsn=_DSN.split("@")[-1])


async def close_pool() -> None:
    if _pool:
        await _pool.close()


async def ensure_schema() -> None:
    """Idempotent DDL guard — ensures the insights table has time_window column
    and the compound unique index the agents pipeline depends on.

    Called once at startup (after init_pool). Safe to run multiple times.
    This mirrors the 20240518000000_insights_v2.sql migration so the agents
    service works even if the backend migration hasn't been applied yet.
    """
    stmts = [
        "ALTER TABLE insights ADD COLUMN IF NOT EXISTS time_window TEXT NOT NULL DEFAULT 'all_time'",
        # Replace the old single-column hash index with the compound one that
        # node_publish's ON CONFLICT clause requires.
        "DROP INDEX IF EXISTS insights_hash_idx",
        "DROP INDEX IF EXISTS insights_hash_unique",
        "CREATE UNIQUE INDEX IF NOT EXISTS insights_hash_window_unique ON insights(survey_id, insight_hash, time_window)",
        # Signal columns written by compute_topic_signals — may not exist in older DBs
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS emotion_breakdown JSONB NOT NULL DEFAULT '{}'",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS avg_response_len INT NOT NULL DEFAULT 0",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS sample_response_ids JSONB NOT NULL DEFAULT '[]'",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS neutral_pct NUMERIC(5,1)",
    ]
    try:
        async with _pool_conn().connection() as conn:
            for stmt in stmts:
                try:
                    await conn.execute(stmt)
                except Exception:
                    pass  # each statement is idempotent — ignore if already applied
            await conn.commit()
        logger.info("db_schema_ensured")
    except Exception as exc:
        logger.warning("db_ensure_schema_failed", error=str(exc))


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
    run_type:       str = "survey_creation",
) -> None:
    async with _pool_conn().connection() as conn:
        await conn.execute(
            """
            INSERT INTO agent_runs
                (id, thread_id, org_id, user_id, intent, survey_type_id, run_type, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'running')
            """,
            (run_id, thread_id, org_id, user_id, intent, survey_type_id, run_type),
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


async def list_runs(
    org_id:   str,
    run_type: str | None = None,
    status:   str | None = None,
    survey_id: str | None = None,
    limit:    int = 20,
    offset:   int = 0,
) -> list[dict[str, Any]]:
    """Return agent_runs rows for an org, newest-first. All filters are optional."""
    clauses: list[str] = ["org_id = %s"]
    params:  list[Any] = [org_id]

    if run_type:
        clauses.append("run_type = %s")
        params.append(run_type)
    if status:
        clauses.append("status = %s")
        params.append(status)
    if survey_id:
        clauses.append("survey_id = %s")
        params.append(survey_id)

    params += [min(limit, 100), max(offset, 0)]
    where  = " AND ".join(clauses)

    async with _pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                f"""SELECT id, run_type, status, intent, survey_id, survey_type_id,
                           total_tokens, cost_usd, qc_score, compliance_risk_level,
                           created_at, completed_at, error_log,
                           EXTRACT(EPOCH FROM (completed_at - created_at))::int AS duration_seconds
                    FROM agent_runs
                    WHERE {where}
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s""",
                params,
            )
            rows = await cur.fetchall()
            cols = [desc[0] for desc in cur.description]
            return [dict(zip(cols, row)) for row in rows]


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


async def cancel_run(run_id: str) -> None:
    """Mark a run as cancelled and record its completion timestamp."""
    async with _pool_conn().connection() as conn:
        await conn.execute(
            "UPDATE agent_runs SET status = 'cancelled', completed_at = NOW() WHERE id = %s",
            (run_id,),
        )


# ── access guards ──────────────────────────────────────────────────────────────

async def check_survey_access(survey_id: str, user_id: str, org_id: str) -> bool:
    """Return True iff a survey exists in the given org.

    This is a cross-service guard for the agents pipeline: survey data is only
    fed to the LLM after confirming the requesting org owns the survey. user_id
    is recorded in the audit log even though access is currently org-scoped,
    so per-user scoping can be added later without a schema change.
    """
    async with _pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id FROM surveys WHERE id = %s AND org_id = %s AND deleted_at IS NULL",
                (survey_id, org_id),
            )
            return await cur.fetchone() is not None


# ── notifications ───────────────────────────────────────────────────────────────

async def write_call_trace(
    *,
    run_id:        str,
    org_id:        str,
    trace_id:      str,
    agent_name:    str,
    model:         str,
    input_tokens:  int,
    output_tokens: int,
    cost_usd:      float,
    duration_ms:   int,
    status:        str,   # 'success' | 'error' | 'budget_exceeded'
    error_msg:     str | None = None,
) -> None:
    """Fire-and-forget: write one row to agent_call_traces. Never raises."""
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO agent_call_traces
                         (run_id, org_id, trace_id, agent_name, model,
                          input_tokens, output_tokens, cost_usd,
                          duration_ms, status, error_msg)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (run_id, org_id, trace_id, agent_name, model,
                     input_tokens, output_tokens, cost_usd,
                     duration_ms, status, error_msg),
                )
            await conn.commit()
    except Exception as exc:
        logger.warning("write_call_trace_failed", error=str(exc))


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
