#!/usr/bin/env python3
"""Insight generation scheduler.

Runs as a separate process (not part of the FastAPI server).
Periodically enqueues insight generation for surveys that:
  - Have responses (response_count > 0)
  - Haven't been regenerated recently (based on tier interval)
  - Are in 'active' or 'paused' status (closed surveys are excluded)

Usage:
  python -m agents.scheduler

Or via the Makefile:
  make scheduler

Interval env vars:
  INSIGHT_INTERVAL_FREE_MIN   default: 120  (minutes between free-tier runs)
  INSIGHT_INTERVAL_PAID_MIN   default: 15   (minutes between paid-tier runs)
  SCHEDULER_POLL_SEC          default: env-aware (dev: 300s, prod: 3600s)
"""
from __future__ import annotations

import asyncio
import json
import os
import time

import dotenv
import httpx

dotenv.load_dotenv()

from agents.lib.db import init_pool, close_pool, _pool_conn
from agents.lib.logger import logger

AGENTS_URL          = os.getenv("AGENTS_URL",          "http://localhost:8001")
AGENTS_INTERNAL_KEY = os.getenv("AGENTS_INTERNAL_KEY", "dev-internal-key-change-in-prod")

_ENV = os.getenv("AGENTS_ENV", "dev").lower()

# How often the scheduler wakes up and checks for surveys that need processing.
# Prod: 1 hour — avoids unnecessary DB scans and LLM costs at enterprise scale.
# Dev/staging: 5 minutes — tighter feedback loop during development.
# Override via SCHEDULER_POLL_SEC for any env.
_POLL_SEC_DEFAULTS = {
    "prod":     3600,   # 1 hour
    "staging":  300,    # 5 minutes
    "dev-paid": 300,    # 5 minutes
    "dev":      300,    # 5 minutes
}
_POLL_SEC_DEFAULT = _POLL_SEC_DEFAULTS.get(_ENV, 300)

INTERVAL_FREE_MIN = int(os.getenv("INSIGHT_INTERVAL_FREE_MIN", "120"))  # 2 hours
INTERVAL_PAID_MIN = int(os.getenv("INSIGHT_INTERVAL_PAID_MIN", "15"))   # 15 minutes
POLL_SEC          = int(os.getenv("SCHEDULER_POLL_SEC", str(_POLL_SEC_DEFAULT)))


async def _trigger_generation(survey_id: str, org_id: str) -> bool:
    """Call the agents service to start insight generation. Returns True on success."""
    thread_id = f"insight:scheduled:{org_id}:{survey_id}:{int(time.time())}"

    # Create an agent_run row directly in the DB
    run_id: str | None = None
    async with _pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO agent_runs
                       (org_id, user_id, thread_id, run_type, status, intent, survey_id)
                   VALUES (%s, 'scheduler', %s, 'insight_generation', 'running', 'insight:schedule', %s)
                   RETURNING id""",
                (org_id, thread_id, survey_id),
            )
            row = await cur.fetchone()
            if row is None:
                logger.error("scheduler_insert_failed", survey_id=survey_id)
                return False
            run_id = str(row[0])

    # Fire the agents service endpoint
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{AGENTS_URL}/insights/generate",
                json={
                    "survey_id": survey_id,
                    "org_id":    org_id,
                    "run_id":    run_id,
                    "trigger":   "schedule",
                },
                headers={"X-Internal-Key": AGENTS_INTERNAL_KEY},
            )
            res.raise_for_status()
        logger.info("scheduler_triggered", survey_id=survey_id, org_id=org_id, run_id=run_id)
        return True
    except Exception as exc:
        logger.warning("scheduler_trigger_failed", survey_id=survey_id, error=str(exc))
        async with _pool_conn().connection() as conn:
            await conn.execute(
                "UPDATE agent_runs SET status='failed', completed_at=NOW() WHERE id=%s",
                (run_id,),
            )
        return False


async def _recover_stale_runs() -> int:
    """Mark runs stuck in 'running' for >10 minutes as 'cancelled'.

    Returns the count of runs recovered.
    """
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """UPDATE agent_runs
                       SET status='cancelled', completed_at=NOW()
                       WHERE run_type='insight_generation'
                         AND status='running'
                         AND created_at < NOW() - INTERVAL '10 minutes'
                       RETURNING id""",
                )
                rows = await cur.fetchall()
                count = len(rows)
            await conn.commit()
        if count:
            logger.info("scheduler_stale_recovery", recovered=count)
        return count
    except Exception as exc:
        logger.warning("scheduler_stale_recovery_failed", error=str(exc))
        return 0


async def sweep_zombie_runs() -> None:
    """Mark stale running runs as failed and enqueue retries for eligible ones."""
    from agents.lib.constants import MAX_RUN_HEARTBEAT_STALE_MINUTES, MAX_RUN_DURATION_MINUTES
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT id, survey_id, org_id, retry_count
                       FROM agent_runs
                       WHERE status = 'running'
                         AND (
                           last_heartbeat_at < NOW() - INTERVAL '%s minutes'
                           OR created_at < NOW() - INTERVAL '%s minutes'
                         )""",
                    (MAX_RUN_HEARTBEAT_STALE_MINUTES, MAX_RUN_DURATION_MINUTES),
                )
                zombies = await cur.fetchall()

        for zombie_id, survey_id, org_id, retry_count in zombies:
            async with _pool_conn().connection() as conn:
                await conn.execute(
                    """UPDATE agent_runs
                       SET status = 'failed',
                           failure_reason = 'zombie_timeout',
                           failed_at = NOW()
                       WHERE id = %s AND status = 'running'""",
                    (zombie_id,),
                )
            logger.warning(
                "zombie_run_killed",
                run_id=str(zombie_id),
                survey_id=str(survey_id) if survey_id else None,
            )
            if (retry_count or 0) < 2 and survey_id and org_id:
                await _trigger_generation(str(survey_id), str(org_id))
    except Exception as exc:
        logger.error("zombie_sweep_failed", error=str(exc))


async def _auto_close_by_date() -> int:
    """Close active/paused surveys that have passed their auto_close_at datetime."""
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """UPDATE surveys
                       SET status='closed', closed_at=NOW()
                       WHERE status IN ('active','paused')
                         AND auto_close_at IS NOT NULL
                         AND auto_close_at < NOW()
                       RETURNING id"""
                )
                rows = await cur.fetchall()
                count = len(rows)
            await conn.commit()
        if count:
            logger.info("scheduler_auto_closed_by_date", count=count)
        return count
    except Exception as exc:
        logger.warning("scheduler_auto_close_date_failed", error=str(exc))
        return 0


async def _auto_close_by_response_count() -> int:
    """Close active surveys that have hit their max_responses limit."""
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """UPDATE surveys
                       SET status='closed', closed_at=NOW()
                       WHERE status = 'active'
                         AND max_responses IS NOT NULL
                         AND (
                           SELECT COUNT(*) FROM responses r WHERE r.survey_id = surveys.id
                         ) >= max_responses
                       RETURNING id"""
                )
                rows = await cur.fetchall()
                count = len(rows)
            await conn.commit()
        if count:
            logger.info("scheduler_auto_closed_by_count", count=count)
        return count
    except Exception as exc:
        logger.warning("scheduler_auto_close_count_failed", error=str(exc))
        return 0


async def _get_surveys_due(interval_minutes: int) -> list[dict]:
    """Return surveys that are due for insight regeneration.

    A survey is due when:
    - It has responses
    - No completed/running run exists within the interval window
    - Stale runs (>10 min) have already been cleared by _recover_stale_runs
    """
    async with _pool_conn().connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT s.id, s.org_id
                FROM surveys s
                WHERE s.status IN ('active', 'paused')
                  AND s.deleted_at IS NULL
                  AND (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) > 0
                  AND NOT EXISTS (
                      SELECT 1 FROM agent_runs ar
                      WHERE ar.survey_id = s.id
                        AND ar.run_type = 'insight_generation'
                        AND ar.status IN ('running', 'completed')
                        AND ar.created_at > NOW() - (%s * INTERVAL '1 minute')
                  )
                ORDER BY (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) DESC
                LIMIT 20
                """,
                (interval_minutes,),
            )
            rows = await cur.fetchall()
            cols = [desc[0] for desc in cur.description]
            return [dict(zip(cols, r)) for r in rows]


async def _get_last_run_response_count(survey_id: str) -> int | None:
    """Return the response count stored in the last completed insight run, or None."""
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT stream_events FROM agent_runs
                       WHERE survey_id = %s
                         AND run_type = 'insight_generation'
                         AND status = 'completed'
                       ORDER BY created_at DESC
                       LIMIT 1""",
                    (survey_id,),
                )
                row = await cur.fetchone()
                if row is None:
                    return None
                events = row[0] if isinstance(row[0], list) else []
                for evt in reversed(events):  # newest event first
                    if isinstance(evt, dict) and evt.get("event") == "response_count":
                        return int(evt.get("count", 0))
    except Exception:
        pass
    return None


async def _get_current_response_count(survey_id: str) -> int:
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT COUNT(*) FROM responses WHERE survey_id = %s",
                    (survey_id,),
                )
                row = await cur.fetchone()
                return int(row[0]) if row else 0
    except Exception:
        return 0


_zombie_sweep_last_run: float = 0.0
_ZOMBIE_SWEEP_INTERVAL_SEC = 300  # 5 minutes

_org_aggregation_last_run: float = 0.0
_ORG_AGGREGATION_INTERVAL_SEC = 3600  # 1 hour


async def run_org_aggregation() -> None:
    """Aggregate NPS/CSAT across all active surveys per org into org_metric_snapshots.

    Runs hourly. Provides data for Crystal's get_org_portfolio tool.
    """
    try:
        async with _pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                # Get all active orgs with responses
                await cur.execute(
                    """SELECT DISTINCT org_id FROM surveys s
                       WHERE status = 'active' AND deleted_at IS NULL
                         AND EXISTS (
                             SELECT 1 FROM responses r WHERE r.survey_id = s.id
                         )"""
                )
                org_rows = await cur.fetchall()

        for (org_id,) in org_rows:
            try:
                async with _pool_conn().connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            """SELECT AVG(sms.nps), AVG(sms.csat), SUM(sms.response_count),
                                      COUNT(*) as survey_count
                               FROM survey_metric_snapshots sms
                               INNER JOIN surveys s ON s.id = sms.survey_id
                               WHERE sms.org_id = %s AND s.status = 'active'
                                 AND s.deleted_at IS NULL
                                 AND sms.captured_at = (
                                     SELECT MAX(captured_at) FROM survey_metric_snapshots
                                     WHERE survey_id = sms.survey_id
                                 )""",
                            (org_id,),
                        )
                        row = await cur.fetchone()
                        if not row or row[3] == 0:
                            continue

                        avg_nps, avg_csat, total_responses, survey_count = row

                    async with conn.cursor() as cur:
                        await cur.execute(
                            """INSERT INTO org_metric_snapshots
                               (org_id, captured_at, avg_nps, avg_csat, total_responses, active_survey_count)
                               VALUES (%s, NOW(), %s, %s, %s, %s)""",
                            (org_id, avg_nps, avg_csat, total_responses, survey_count),
                        )
                    await conn.commit()
                    logger.info("org_aggregation_written", org_id=org_id, survey_count=survey_count)
            except Exception as exc:
                logger.warning("org_aggregation_org_failed", org_id=org_id, error=str(exc))

    except Exception as exc:
        logger.error("org_aggregation_failed", error=str(exc))


async def run_scheduler_once() -> None:
    """Run a single scheduler tick (useful for testing and inline embedding)."""
    global _zombie_sweep_last_run, _org_aggregation_last_run

    # Always clean up stale runs first so they don't block re-triggering.
    await _recover_stale_runs()
    await _auto_close_by_date()
    await _auto_close_by_response_count()

    now = time.time()

    # Zombie sweep runs every 5 minutes (not every poll tick)
    if now - _zombie_sweep_last_run >= _ZOMBIE_SWEEP_INTERVAL_SEC:
        await sweep_zombie_runs()
        _zombie_sweep_last_run = now

    # Org aggregation runs hourly
    if now - _org_aggregation_last_run >= _ORG_AGGREGATION_INTERVAL_SEC:
        await run_org_aggregation()
        _org_aggregation_last_run = now

    surveys = await _get_surveys_due(INTERVAL_FREE_MIN)
    if surveys:
        logger.info("scheduler_batch", count=len(surveys))
        triggered = 0
        for survey in surveys:
            survey_id = survey["id"]
            current_count = await _get_current_response_count(survey_id)
            last_count = await _get_last_run_response_count(survey_id)
            if last_count is not None and current_count <= last_count:
                logger.info(
                    "scheduler_skip_no_new_responses",
                    survey_id=survey_id,
                    current_count=current_count,
                    last_run_count=last_count,
                )
                continue
            await _trigger_generation(survey_id, survey["org_id"])
            triggered += 1
            await asyncio.sleep(2)  # stagger requests

        # Snapshot org-level aggregates for all orgs managed this tick
        distinct_org_ids = list({s["org_id"] for s in surveys})
        try:
            async with _pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    for oid in distinct_org_ids:
                        await cur.execute(
                            """INSERT INTO org_metric_snapshots
                                   (org_id, captured_at, active_survey_count, total_responses, avg_nps)
                               SELECT
                                   %s, NOW(),
                                   COUNT(*) FILTER (WHERE status = 'active'),
                                   (SELECT COUNT(*)::int FROM responses WHERE org_id = %s),
                                   ROUND(AVG(nps_score)::numeric, 1)
                               FROM surveys
                               WHERE org_id = %s AND deleted_at IS NULL""",
                            (oid, oid, oid),
                        )
                await conn.commit()
            logger.info("scheduler_org_snapshots", org_count=len(distinct_org_ids))
        except Exception as exc:
            logger.warning("scheduler_org_snapshot_failed", error=str(exc))

        if not triggered:
            logger.debug("scheduler_idle_no_new_responses")
    else:
        logger.debug("scheduler_idle")


async def run_scheduler() -> None:
    """Main scheduler loop."""
    await init_pool()
    logger.info(
        "scheduler_started",
        interval_free_min=INTERVAL_FREE_MIN,
        interval_paid_min=INTERVAL_PAID_MIN,
        poll_sec=POLL_SEC,
    )

    try:
        while True:
            try:
                await run_scheduler_once()
            except Exception as exc:
                logger.error("scheduler_loop_error", error=str(exc))

            await asyncio.sleep(POLL_SEC)
    finally:
        await close_pool()


if __name__ == "__main__":
    asyncio.run(run_scheduler())
