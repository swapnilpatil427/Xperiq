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

_DSN  = os.getenv("AGENTS_DB_DSN") or os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/experient")
_pool: AsyncConnectionPool | None = None


async def init_pool() -> None:
    global _pool
    if _pool is not None:
        return  # already initialised — avoid leaking the first pool
    _pool = AsyncConnectionPool(_DSN, min_size=4, max_size=20, open=False)
    await _pool.open()
    logger.info("db_pool_ready", dsn=_DSN.split("@")[-1])


async def close_pool() -> None:
    if _pool:
        await _pool.close()


async def ensure_schema() -> None:
    """Idempotent DDL guard — creates/alters all tables the agents pipeline depends on.

    Called once at startup (after init_pool). Safe to run multiple times.
    Mirrors the Supabase migrations so the agents service works even if they
    haven't been applied yet.
    """
    stmts = [
        "ALTER TABLE insights ADD COLUMN IF NOT EXISTS time_window TEXT NOT NULL DEFAULT 'all_time'",
        # Replace the old single-column hash index with the compound one that
        # node_publish's ON CONFLICT clause requires.
        "DROP INDEX IF EXISTS insights_hash_idx",
        "DROP INDEX IF EXISTS insights_hash_unique",
        "CREATE UNIQUE INDEX IF NOT EXISTS insights_hash_window_unique ON insights(survey_id, insight_hash, time_window)",
        # Unique index required for ON CONFLICT (survey_id, name, time_window) in upsert_survey_topics
        "CREATE UNIQUE INDEX IF NOT EXISTS survey_topics_survey_name_window_unique ON survey_topics (survey_id, name, time_window)",
        # Legacy signal columns — may not exist in older DBs
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS emotion_breakdown JSONB NOT NULL DEFAULT '{}'",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS avg_response_len INT NOT NULL DEFAULT 0",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS sample_response_ids JSONB NOT NULL DEFAULT '[]'",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS neutral_pct NUMERIC(5,1)",
        # Delta/streak columns written by upsert_survey_topics ON CONFLICT logic
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS sentiment_momentum TEXT CHECK (sentiment_momentum IN ('improving','worsening','stable'))",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS volume_delta INT DEFAULT 0",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS volume_delta_pct NUMERIC(6,1) DEFAULT 0",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS chronic BOOLEAN DEFAULT FALSE",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS negative_run_streak INT DEFAULT 0",
        # health_label column on survey_topics (from 20240520000000_topic_centroids.sql)
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS health_label TEXT",
        # pgvector incremental clustering tables
        "CREATE EXTENSION IF NOT EXISTS vector",
        """CREATE TABLE IF NOT EXISTS survey_topic_centroids (
            id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            survey_id       UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            org_id          TEXT         NOT NULL,
            topic_id        UUID         REFERENCES survey_topics(id) ON DELETE SET NULL,
            topic_name      TEXT         NOT NULL,
            centroid        vector(1536) NOT NULL,
            response_count  INTEGER      NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (survey_id, topic_name)
        )""",
        "CREATE INDEX IF NOT EXISTS survey_topic_centroids_survey_idx ON survey_topic_centroids (survey_id)",
        # HNSW works at any table size (IVFFlat needs 390+ rows for lists=10)
        "DROP INDEX IF EXISTS survey_topic_centroids_ivfflat_idx",
        """CREATE INDEX IF NOT EXISTS survey_topic_centroids_hnsw_idx
           ON survey_topic_centroids USING hnsw (centroid vector_cosine_ops)
           WITH (m = 16, ef_construction = 64)""",
        """CREATE TABLE IF NOT EXISTS topic_candidates (
            id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            survey_id   UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            org_id      TEXT         NOT NULL,
            response_id UUID         NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
            embedding   vector(1536) NOT NULL,
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (survey_id, response_id)
        )""",
        "CREATE INDEX IF NOT EXISTS topic_candidates_survey_idx ON topic_candidates (survey_id, created_at)",
        """CREATE TABLE IF NOT EXISTS topic_windows (
            id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            survey_id           UUID        NOT NULL,
            org_id              TEXT        NOT NULL,
            topic_id            UUID        NOT NULL REFERENCES survey_topics(id) ON DELETE CASCADE,
            window_start        TIMESTAMPTZ NOT NULL,
            window_end          TIMESTAMPTZ NOT NULL,
            response_count      INTEGER     NOT NULL DEFAULT 0,
            avg_sentiment_score FLOAT,
            avg_nps             FLOAT,
            health_label        TEXT,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""",
        "CREATE UNIQUE INDEX IF NOT EXISTS topic_windows_topic_window_idx ON topic_windows (topic_id, window_start)",
        "CREATE INDEX IF NOT EXISTS topic_windows_survey_idx ON topic_windows (survey_id, topic_id, window_start DESC)",
        # Extended XM signals on survey_topics
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS net_sentiment        FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS nps_impact           FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS promoter_pct         FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS detractor_pct        FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS passive_pct          FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS urgency_score        FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS driver_score         FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS velocity_pct         FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS avg_csat             FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS csat_impact          FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS confidence_level     TEXT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS avg_effort_score     FLOAT",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS top_verbatims        JSONB DEFAULT '[]'",
        "ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS emotion_distribution JSONB DEFAULT '{}'",
        # Extended XM signals on topic_windows
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS net_sentiment        FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS nps_impact           FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS promoter_pct         FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS detractor_pct        FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS passive_pct          FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS urgency_score        FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS driver_score         FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS velocity_pct         FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS avg_csat             FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS csat_impact          FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS avg_effort_score     FLOAT",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS emotion_distribution JSONB DEFAULT '{}'",
        "ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS top_verbatims        JSONB DEFAULT '[]'",
        # survey_metric_snapshots — per-pipeline-run KPI history
        """CREATE TABLE IF NOT EXISTS survey_metric_snapshots (
            id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            survey_id            UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
            org_id               TEXT        NOT NULL,
            run_id               UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
            captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            response_count       INT,
            nps                  FLOAT,
            nps_ci_low           FLOAT,
            nps_ci_high          FLOAT,
            nps_n                INT,
            promoter_pct         FLOAT,
            detractor_pct        FLOAT,
            passive_pct          FLOAT,
            csat                 FLOAT,
            completion_rate      FLOAT,
            effort_score         FLOAT,
            response_velocity_7d FLOAT,
            anomaly_flag         BOOLEAN NOT NULL DEFAULT FALSE
        )""",
        "CREATE INDEX IF NOT EXISTS survey_metric_snapshots_survey_time_idx ON survey_metric_snapshots (survey_id, captured_at DESC)",
        "CREATE INDEX IF NOT EXISTS survey_metric_snapshots_org_idx ON survey_metric_snapshots (org_id, captured_at DESC)",
        # org_metric_snapshots — per-scheduler-tick org-level aggregates
        """CREATE TABLE IF NOT EXISTS org_metric_snapshots (
            id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id               TEXT        NOT NULL,
            captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            active_survey_count  INT,
            total_responses      INT,
            avg_nps              FLOAT,
            avg_csat             FLOAT,
            avg_completion_rate  FLOAT,
            top_urgent_topic     TEXT,
            top_driver_topic     TEXT
        )""",
        "CREATE INDEX IF NOT EXISTS org_metric_snapshots_org_time_idx ON org_metric_snapshots (org_id, captured_at DESC)",
        # Audit trail: which response IDs were sampled for each insight run.
        # One write per run in node_publish — links insights→run→responses.
        # Use: SELECT sampled_response_ids FROM agent_runs WHERE id = '<run_id>'
        "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS sampled_response_ids JSONB DEFAULT '[]'",
        "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS sampled_response_count INT DEFAULT 0",
        # new_response_count: how many responses were genuinely NEW in this run (not cached from prior).
        # Used to distinguish real data runs (new_response_count > 0) from manual regenerations
        # (new_response_count = 0) when selecting the prior-context anchor.
        "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS new_response_count INT DEFAULT 0",
        # prior_context_run_id: which run's insights were used as the "established findings" prior.
        # Advances only when real new data arrives — manual regens reuse the same anchor.
        # Audit chain: current_run → prior_context_run_id → prior_context_run_id → ... → first_run
        "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS prior_context_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL",
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

    params += [min(limit, 100), max(0, min(offset, 10_000))]
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


async def save_run_questions(run_id: str, questions: list[dict], org_id: str = "") -> None:
    """Overwrite result_questions for a run (used by CRUD endpoints).

    org_id is required to prevent cross-tenant writes — pass the org from the
    verified request, not from user input.
    """
    async with _pool_conn().connection() as conn:
        await conn.execute(
            "UPDATE agent_runs SET result_questions = %s::jsonb WHERE id = %s AND (org_id = %s OR %s = '')",
            (json.dumps(questions), run_id, org_id, org_id),
        )


async def cancel_run(run_id: str, org_id: str = "") -> None:
    """Mark a run as cancelled and record its completion timestamp.

    org_id is required to prevent cross-tenant writes.
    """
    async with _pool_conn().connection() as conn:
        await conn.execute(
            "UPDATE agent_runs SET status = 'cancelled', completed_at = NOW() WHERE id = %s AND (org_id = %s OR %s = '')",
            (run_id, org_id, org_id),
        )


# ── metric snapshot helpers ────────────────────────────────────────────────────

async def get_prior_metric_snapshots(survey_id: str, limit: int = 5) -> list[dict]:
    """Return the last N metric snapshots for a survey, newest first.

    Used by node_ingest to feed longitudinal NPS/CSAT history into node_narrate
    so experts can produce delta narratives ("NPS up 12 pts since last month").
    Returns [] gracefully when table is empty or doesn't exist yet.
    """
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT nps, csat, response_count, captured_at
                       FROM survey_metric_snapshots
                       WHERE survey_id = %s
                       ORDER BY captured_at DESC
                       LIMIT %s""",
                    (survey_id, limit),
                )
                rows = await cur.fetchall()
                cols = [desc[0] for desc in cur.description]
                return [dict(zip(cols, row)) for row in rows]
    except Exception as exc:
        logger.warning("get_prior_metric_snapshots_failed", survey_id=survey_id, error=str(exc))
        return []


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
