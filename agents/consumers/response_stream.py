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
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from agents.lib.logger import logger
from agents.consumers.event_bus import consume_events

_AGENTS_ENV: str = os.getenv("AGENTS_ENV", "production")
_DEFAULT_THRESHOLD = "1" if _AGENTS_ENV in ("development", "local") else "10"
_DEFAULT_TIME = "1" if _AGENTS_ENV in ("development", "local") else "5"

NEW_RESPONSE_THRESHOLD: int = int(os.getenv("INSIGHT_NEW_RESPONSE_THRESHOLD", _DEFAULT_THRESHOLD))
TIME_THRESHOLD_MINUTES: int = int(os.getenv("INSIGHT_TIME_THRESHOLD_MIN", _DEFAULT_TIME))

_AGENTS_URL: str = os.getenv("AGENTS_URL", "http://localhost:8001")
_INTERNAL_KEY: str = os.getenv("AGENTS_INTERNAL_KEY", "dev-internal-key-change-in-prod")
_DB_DSN: str = os.getenv("AGENTS_DB_DSN", "postgresql://postgres:postgres@localhost:5432/experient")

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
                # Check for an in-progress pipeline for this survey — one at a time
                await cur.execute(
                    """SELECT id FROM agent_runs
                       WHERE survey_id = %s
                         AND run_type = 'insight_generation'
                         AND status = 'running'
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
        logger.error("stream_consumer_trigger_failed", survey_id=survey_id, error=str(exc))
    finally:
        _pending_triggers.discard(survey_id)


async def run_response_stream_consumer() -> None:
    """Main consumer loop. Intended to be started as a background asyncio task."""
    logger.info(
        "stream_consumer_started",
        new_response_threshold=NEW_RESPONSE_THRESHOLD,
        time_threshold_minutes=TIME_THRESHOLD_MINUTES,
    )

    async for events in consume_events(batch_size=50, block_ms=5000):
        for event in events:
            survey_id = event.get("survey_id", "")
            org_id = event.get("org_id", "")
            if not survey_id or not org_id:
                continue

            _batches[survey_id]["org_id"] = org_id
            _batches[survey_id]["count"] += 1

            if await _should_trigger(survey_id) and survey_id not in _pending_triggers:
                _pending_triggers.add(survey_id)
                asyncio.create_task(_trigger_insights(survey_id, org_id))
