"""Background consumer: reads insight_events stream, batches by survey_id,
and triggers incremental insight generation when a threshold is met.

Thresholds (smart defaults by AGENTS_ENV, overridable via env vars):
  NEW_RESPONSE_THRESHOLD — trigger after N new responses for a survey
    production default: 10  |  development/local default: 1
  TIME_THRESHOLD_MINUTES — trigger if >= N minutes elapsed since last run (+ 1 new response)
    production default: 5   |  development/local default: 1
  Set AGENTS_ENV=development or AGENTS_ENV=local to auto-apply local-dev defaults.

The consumer runs as a long-lived asyncio task. Start it from the FastAPI lifespan
or as a standalone process:

    asyncio.create_task(run_response_stream_consumer())
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from crystalos.lib.logger import logger
from crystalos.consumers.event_bus import consume_events

# ── Progressive tier Redis client ─────────────────────────────────────────────

_redis_client = None


async def _get_redis():
    global _redis_client
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            import redis.asyncio as _aioredis  # type: ignore[import]
            _redis_client = await _aioredis.from_url(redis_url, decode_responses=True)
        except Exception:
            pass
    return _redis_client


async def should_trigger_progressive_tier(survey_id: str, response_count: int) -> str | None:
    """Return the tier name if we should trigger a progressive run, else None.

    Checks Redis to avoid re-triggering the same tier.
    Thresholds: first_voices=10, early_signals=40, growing_picture=70, full_report=100.
    """
    from crystalos.lib.constants import (
        PROGRESSIVE_TIER_FIRST_VOICES,
        PROGRESSIVE_TIER_EARLY_SIGNALS,
        PROGRESSIVE_TIER_GROWING_PICTURE,
        PROGRESSIVE_TIER_FULL_REPORT,
    )

    tiers = [
        (PROGRESSIVE_TIER_FIRST_VOICES,    "first_voices"),
        (PROGRESSIVE_TIER_EARLY_SIGNALS,   "early_signals"),
        (PROGRESSIVE_TIER_GROWING_PICTURE, "growing_picture"),
        (PROGRESSIVE_TIER_FULL_REPORT,     "full_report"),
    ]

    redis = await _get_redis()
    if redis is None:
        return None

    for threshold, tier_name in reversed(tiers):
        if response_count >= threshold:
            key = f"progressive:{survey_id}:{tier_name}:triggered"
            try:
                already = await redis.get(key)
                if not already:
                    return tier_name
            except Exception:
                pass
            break  # Only check highest matching tier

    return None


async def mark_progressive_tier_complete(survey_id: str, tier: str) -> None:
    """Mark a progressive tier as triggered in Redis (30-day TTL)."""
    redis = await _get_redis()
    if redis is None:
        return
    key = f"progressive:{survey_id}:{tier}:triggered"
    try:
        await redis.set(key, "1", ex=2592000)  # 30 days
    except Exception:
        pass


_AGENTS_ENV: str = os.getenv("AGENTS_ENV", "production")
_DEFAULT_THRESHOLD = "1" if _AGENTS_ENV in ("development", "local") else "10"
_DEFAULT_TIME = "1" if _AGENTS_ENV in ("development", "local") else "5"

NEW_RESPONSE_THRESHOLD: int = int(os.getenv("INSIGHT_NEW_RESPONSE_THRESHOLD", _DEFAULT_THRESHOLD))
TIME_THRESHOLD_MINUTES: int = int(os.getenv("INSIGHT_TIME_THRESHOLD_MIN", _DEFAULT_TIME))

_AGENTS_URL: str = os.getenv("AGENTS_URL", "http://localhost:8001")
_INTERNAL_KEY: str = os.getenv("AGENTS_INTERNAL_KEY", "dev-internal-key-change-in-prod")
_DB_DSN: str = os.getenv("AGENTS_DB_DSN", "postgresql://postgres:postgres@localhost:5432/experient")

# ── Dead-letter queue ─────────────────────────────────────────────────────────
DLQ_KEY = "crystal:dlq:trigger_failures"
MAX_RETRIES = 3

# In-memory batch tracker: {survey_id: {"org_id": str, "count": int, "last_trigger": datetime|None}}
_batches: dict[str, dict] = defaultdict(lambda: {"org_id": "", "count": 0, "last_trigger": None})

# Surveys with a trigger task currently in-flight (prevents duplicate concurrent triggers
# when multiple events arrive in the same consumer batch and threshold=1)
_pending_triggers: set[str] = set()


async def _should_trigger(survey_id: str) -> bool:
    """Return True when the batch warrants kicking off a new insight run."""
    batch = _batches[survey_id]
    if batch["count"] >= NEW_RESPONSE_THRESHOLD:
        return True
    if batch["last_trigger"] is None:
        return False
    elapsed_minutes = (
        datetime.now(timezone.utc) - batch["last_trigger"]
    ).total_seconds() / 60
    return elapsed_minutes >= TIME_THRESHOLD_MINUTES and batch["count"] > 0


async def _get_survey_status(survey_id: str) -> str | None:
    """Return survey status from DB, or None if not found."""
    import psycopg  # type: ignore[import]
    try:
        async with await psycopg.AsyncConnection.connect(_DB_DSN) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT status FROM surveys WHERE id = %s AND deleted_at IS NULL",
                    (survey_id,),
                )
                row = await cur.fetchone()
                return row[0] if row else None
    except Exception as exc:
        logger.warning("stream_consumer_survey_status_check_failed", survey_id=survey_id, error=str(exc))
        return None


async def _get_total_response_count(survey_id: str) -> int:
    """Return the total response count for a survey from the DB."""
    import psycopg  # type: ignore[import]
    try:
        async with await psycopg.AsyncConnection.connect(_DB_DSN) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT COUNT(*) FROM responses WHERE survey_id = %s",
                    (survey_id,),
                )
                row = await cur.fetchone()
                return int(row[0]) if row else 0
    except Exception as exc:
        logger.warning("stream_consumer_response_count_failed", survey_id=survey_id, error=str(exc))
        return 0


async def _trigger_with_retry(survey_id: str, org_id: str, tier: str) -> None:
    """Trigger insight generation with exponential backoff and DLQ on persistent failure."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            await _trigger_insights(survey_id, org_id)
            return
        except Exception as exc:
            wait = 2 ** attempt  # 2, 4, 8 seconds
            logger.warning(
                "trigger_retry",
                survey_id=survey_id,
                attempt=attempt,
                wait=wait,
                error=str(exc),
            )
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)
    # All retries exhausted — write to DLQ for manual review
    redis = await _get_redis()
    if redis is not None:
        try:
            await redis.rpush(
                DLQ_KEY,
                json.dumps({
                    "id":          str(uuid.uuid4()),
                    "survey_id":   survey_id,
                    "org_id":      org_id,
                    "tier":        tier,
                    "payload":     {},
                    "error":       f"Failed after {MAX_RETRIES} retries",
                    "failed_at":   datetime.utcnow().isoformat(),
                    "retry_count": MAX_RETRIES,
                }),
            )
        except Exception as dlq_exc:
            logger.error(
                "trigger_dlq_write_failed",
                survey_id=survey_id,
                error=str(dlq_exc),
            )
    logger.error("trigger_dlq", survey_id=survey_id, tier=tier)
    _pending_triggers.discard(survey_id)


async def _trigger_insights(survey_id: str, org_id: str) -> None:
    """Insert an agent_run row then call POST /insights/generate.

    Uses the same pattern as the scheduler so the insights pipeline sees a
    consistent agent_runs record regardless of trigger source.

    Dedup strategy: check for any currently-running pipeline for this survey
    before inserting. Each run gets a unique thread_id so completed runs never
    block future triggers (the old ON CONFLICT (thread_id) DO NOTHING approach
    re-used the same thread_id and permanently blocked after the first run).
    """
    import httpx
    import psycopg  # type: ignore[import]

    run_id = str(uuid.uuid4())
    # Unique per-run thread_id: completed runs never interfere with future triggers
    thread_id = f"insight:stream:{run_id}"

    # Capture the count that caused this trigger. New events can increment the
    # counter while this task is awaiting DB/HTTP — we subtract only this amount
    # so those mid-flight events still count toward the next threshold.
    triggered_count = _batches[survey_id]["count"]

    try:
        async with await psycopg.AsyncConnection.connect(_DB_DSN) as conn:
            async with conn.cursor() as cur:
                # Check for a LIVE in-progress pipeline (not a zombie).
                # Column: last_heartbeat_at (see migration 20240521000001_agent_runs_heartbeat.sql)
                # A run is considered zombie if last_heartbeat_at is stale (> 5 min)
                # OR the run is older than 30 minutes regardless of heartbeat.
                await cur.execute(
                    """SELECT id FROM agent_runs
                       WHERE survey_id = %s
                         AND run_type = 'insight_generation'
                         AND status = 'running'
                         AND last_heartbeat_at > now() - INTERVAL '5 minutes'
                         AND created_at > now() - INTERVAL '30 minutes'
                       LIMIT 1""",
                    (survey_id,),
                )
                if await cur.fetchone():
                    logger.info(
                        "stream_consumer_skip",
                        survey_id=survey_id,
                        reason="pipeline_already_running",
                    )
                    return

                # Mark stale zombie runs as failed before inserting the new run.
                # error_log is JSONB (see migration 20240514000000_agents.sql).
                await cur.execute(
                    """UPDATE agent_runs
                       SET status = 'failed',
                           error_log = '["terminated:zombie_sweep"]'::jsonb,
                           completed_at = now()
                       WHERE survey_id = %s
                         AND run_type = 'insight_generation'
                         AND status = 'running'
                         AND (
                             last_heartbeat_at IS NULL
                             OR last_heartbeat_at < now() - INTERVAL '5 minutes'
                             OR created_at < now() - INTERVAL '30 minutes'
                         )""",
                    (survey_id,),
                )

                await cur.execute(
                    """INSERT INTO agent_runs
                         (id, org_id, user_id, thread_id, run_type, status, intent, survey_id)
                       VALUES (%s, %s, 'stream_consumer', %s, 'insight_generation', 'running',
                               'insight:stream', %s)""",
                    (run_id, org_id, thread_id, survey_id),
                )
            await conn.commit()

        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{_AGENTS_URL}/insights/generate",
                json={
                    "survey_id": survey_id,
                    "org_id":    org_id,
                    "run_id":    run_id,
                    "trigger":   "stream",
                },
                headers={"X-Internal-Key": _INTERNAL_KEY},
            )

        # Subtract only the count that caused this trigger — events that arrived
        # while this task was awaiting DB/HTTP are preserved for the next threshold.
        _batches[survey_id]["count"] = max(0, _batches[survey_id]["count"] - triggered_count)
        _batches[survey_id]["last_trigger"] = datetime.now(timezone.utc)
        logger.info("stream_consumer_triggered", survey_id=survey_id, run_id=run_id,
                    triggered_count=triggered_count, remaining=_batches[survey_id]["count"])

    except Exception as exc:
        logger.error(
            "stream_consumer_trigger_failed",
            survey_id=survey_id,
            error_type=type(exc).__name__,   # UndefinedColumn, ConnectionError, etc.
            error=str(exc),
        )
    finally:
        _pending_triggers.discard(survey_id)


async def run_response_stream_consumer() -> None:
    """Main consumer loop. Intended to be started as a background asyncio task.

    Retries indefinitely if Redis is unavailable — polls every 15s until Redis comes up.
    This prevents silent death when Redis starts after CrystalOS.
    """
    logger.info(
        "stream_consumer_started",
        new_response_threshold=NEW_RESPONSE_THRESHOLD,
        time_threshold_minutes=TIME_THRESHOLD_MINUTES,
    )

    while True:
        # Outer retry loop — re-enters if Redis goes down mid-run or was never available.
        # Logs a clear message and waits 15s before retrying so you can see it in terminal.
        try:
            async for events in consume_events(batch_size=50, block_ms=5000):
                # Phase 1: accumulate all events synchronously — no I/O, no yields.
                # Doing this before any await prevents mid-batch task execution from
                # discarding _pending_triggers and creating duplicate trigger tasks.
                affected: dict[str, str] = {}  # survey_id -> org_id
                for event in events:
                    survey_id = event.get("survey_id", "")
                    org_id    = event.get("org_id", "")
                    if not survey_id or not org_id:
                        continue
                    _batches[survey_id]["org_id"]  = org_id
                    _batches[survey_id]["count"]  += 1
                    affected[survey_id] = org_id

                # Phase 2: one trigger decision per affected survey.
                for survey_id, org_id in affected.items():
                    if survey_id in _pending_triggers:
                        continue

                    should_run      = await _should_trigger(survey_id)
                    total_responses = await _get_total_response_count(survey_id)
                    tier            = await should_trigger_progressive_tier(survey_id, total_responses)

                    if not should_run and not tier:
                        continue

                    survey_status = await _get_survey_status(survey_id)
                    if survey_status not in ('active',):
                        logger.info("pipeline_skipped_survey_not_active", survey_id=survey_id, status=survey_status)
                        continue

                    if tier:
                        await mark_progressive_tier_complete(survey_id, tier)
                        logger.info(
                            "stream_consumer_progressive_tier",
                            survey_id=survey_id,
                            tier=tier,
                            total_responses=total_responses,
                        )

                    _pending_triggers.add(survey_id)
                    asyncio.create_task(_trigger_with_retry(survey_id, org_id, tier or "manual"))
        except Exception as exc:
            # Redis disconnected or never available — log clearly and retry
            logger.error(
                "stream_consumer_redis_error",
                error_type=type(exc).__name__,
                error=str(exc),
                note="Redis may be down. Will retry in 15s. Run: docker-compose up -d redis",
            )

        # Reset cached Redis connection so next iteration reconnects fresh
        from crystalos.consumers import _redis as _redis_mod
        _redis_mod._redis = None
        await asyncio.sleep(15)
        logger.info("stream_consumer_reconnecting")
