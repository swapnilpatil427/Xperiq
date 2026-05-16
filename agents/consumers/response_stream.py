"""Background consumer: reads insight_events stream, batches by survey_id,
and triggers incremental insight generation when a threshold is met.

Thresholds (overridable via env vars):
  NEW_RESPONSE_THRESHOLD = 10  — trigger after 10 new responses for a survey
  TIME_THRESHOLD_MINUTES = 5   — trigger if >= 5 minutes have elapsed since the
                                  last run AND at least one new response arrived

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

NEW_RESPONSE_THRESHOLD: int = int(os.getenv("INSIGHT_NEW_RESPONSE_THRESHOLD", "10"))
TIME_THRESHOLD_MINUTES: int = int(os.getenv("INSIGHT_TIME_THRESHOLD_MIN", "5"))

_AGENTS_URL: str = os.getenv("AGENTS_URL", "http://localhost:8001")
_INTERNAL_KEY: str = os.getenv("AGENTS_INTERNAL_KEY", "dev-internal-key-change-in-prod")
_DB_DSN: str = os.getenv("AGENTS_DB_DSN", "postgresql://postgres:postgres@localhost:5432/experient")

# In-memory batch tracker: {survey_id: {"org_id": str, "count": int, "last_trigger": datetime|None}}
_batches: dict[str, dict] = defaultdict(lambda: {"org_id": "", "count": 0, "last_trigger": None})


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
    """
    import httpx
    import psycopg  # type: ignore[import]

    run_id = str(uuid.uuid4())
    thread_id = f"insight:stream:{org_id}:{survey_id}"

    try:
        async with await psycopg.AsyncConnection.connect(_DB_DSN) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """INSERT INTO agent_runs
                         (id, org_id, user_id, thread_id, run_type, status, intent, survey_id)
                       VALUES (%s, %s, 'stream_consumer', %s, 'insight_generation', 'running',
                               'insight:stream', %s)
                       ON CONFLICT (thread_id) DO NOTHING
                       RETURNING id""",
                    (run_id, org_id, thread_id, survey_id),
                )
                row = await cur.fetchone()
                if not row:
                    logger.debug(
                        "stream_consumer_skip",
                        survey_id=survey_id,
                        reason="already_running",
                    )
                    return
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

        # Reset batch counter on successful trigger
        _batches[survey_id]["count"] = 0
        _batches[survey_id]["last_trigger"] = datetime.now(timezone.utc)
        logger.info("stream_consumer_triggered", survey_id=survey_id, run_id=run_id)

    except Exception as exc:
        logger.warning("stream_consumer_trigger_failed", survey_id=survey_id, error=str(exc))


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

            if await _should_trigger(survey_id):
                asyncio.create_task(_trigger_insights(survey_id, org_id))
