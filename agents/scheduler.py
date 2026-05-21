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
  INSIGHT_INTERVAL_FREE_MIN   default: 60   (minutes between free-tier runs)
  INSIGHT_INTERVAL_PAID_MIN   default: 5    (minutes between paid-tier runs)
  SCHEDULER_POLL_SEC          default: 30   (how often scheduler checks the queue)
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

INTERVAL_FREE_MIN = int(os.getenv("INSIGHT_INTERVAL_FREE_MIN", "120"))  # 2 hours
INTERVAL_PAID_MIN = int(os.getenv("INSIGHT_INTERVAL_PAID_MIN", "15"))   # 15 minutes
POLL_SEC          = int(os.getenv("SCHEDULER_POLL_SEC",        "120"))  # 2 minutes


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


async def run_scheduler_once() -> None:
    """Run a single scheduler tick (useful for testing and inline embedding)."""
    # Always clean up stale runs first so they don't block re-triggering.
    await _recover_stale_runs()
    await _auto_close_by_date()
    await _auto_close_by_response_count()

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
