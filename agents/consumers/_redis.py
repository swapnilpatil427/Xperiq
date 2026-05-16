"""Redis Streams implementation of the event bus.

Requires: redis[asyncio]>=5.0 (see requirements.txt).
Consumer group: insight_consumers
Stream key:     insight_events
"""
import asyncio
import os
from typing import AsyncGenerator

_STREAM_KEY = "insight_events"
_GROUP = "insight_consumers"
_CONSUMER = os.getenv("WORKER_ID", "worker-1")
_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

_redis = None


async def _get_redis():
    global _redis
    if _redis is None:
        try:
            import redis.asyncio as aioredis  # type: ignore[import]
            _redis = await aioredis.from_url(_REDIS_URL, decode_responses=True)
            # Create consumer group if not exists; mkstream=True creates the stream if absent.
            try:
                await _redis.xgroup_create(_STREAM_KEY, _GROUP, id="0", mkstream=True)
            except Exception:
                pass  # group already exists — that's fine
        except Exception as e:
            # redis package not installed or Redis unreachable — degrade gracefully
            return None
    return _redis


async def publish_event(survey_id: str, org_id: str, response_id: str) -> None:
    """Publish a single insight event to the stream. Best-effort; never raises."""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.xadd(
            _STREAM_KEY,
            {
                "survey_id":   survey_id,
                "org_id":      org_id,
                "response_id": response_id,
            },
            maxlen=10000,
            approximate=True,
        )
    except Exception:
        pass


async def consume_events(
    batch_size: int = 100,
    block_ms: int = 5000,
) -> AsyncGenerator[list[dict], None]:
    """Yield batches of events from the stream.

    Each yielded item is a list of field-dicts (one per message).
    Acknowledges each batch after yielding (at-least-once delivery).
    Blocks for up to *block_ms* milliseconds waiting for new messages before
    returning an empty batch (and continuing the loop).
    """
    r = await _get_redis()
    if not r:
        return

    while True:
        try:
            messages = await r.xreadgroup(
                _GROUP, _CONSUMER,
                {_STREAM_KEY: ">"},
                count=batch_size,
                block=block_ms,
            )
            if messages:
                for _stream_name, entries in messages:
                    ids: list[str] = []
                    events: list[dict] = []
                    for msg_id, fields in entries:
                        ids.append(msg_id)
                        events.append(fields)
                    yield events
                    # Acknowledge only after the caller has processed the batch.
                    await r.xack(_STREAM_KEY, _GROUP, *ids)
        except Exception:
            await asyncio.sleep(5)
