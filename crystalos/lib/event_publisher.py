"""
Run lifecycle event publisher.

Locally:  publishes to Redis stream 'agent_run_events'
GCP prod: publishes to Cloud Pub/Sub topic 'agent-run-events'

Switch with EVENT_BUS=redis (default) | pubsub.

Event schema (JSON):
{
  "event_type": "run_started|run_completed|run_failed|cost_spike",
  "run_id": "uuid",
  "org_id": "org_xxx",
  "survey_id": "uuid|null",
  "timestamp": "ISO8601",
  "trace_id": "hex32",
  "metadata": { ... }
}

Pub/Sub integration (GCP):
  Topic: agent-run-events
  To connect to a ticketing system, create a Cloud Function or Cloud Run
  service that subscribes to this topic and creates Jira/Linear/PagerDuty
  issues on 'run_failed' events.

  Required env vars for pubsub mode:
    GOOGLE_CLOUD_PROJECT — GCP project ID
    PUBSUB_TOPIC        — defaults to 'agent-run-events'
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from crystalos.lib.logger import logger
from crystalos.lib.trace_context import get_trace_context

_EVENT_BUS = os.getenv("EVENT_BUS", "redis")
_REDIS_STREAM_KEY = "agent_run_events"
_PUBSUB_TOPIC = os.getenv("PUBSUB_TOPIC", "agent-run-events")
_GCP_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")


def _make_event(
    event_type: str,
    run_id: str,
    org_id: str,
    survey_id: str | None,
    metadata: dict,
) -> dict:
    ctx = get_trace_context()
    return {
        "event_type": event_type,
        "run_id":     run_id,
        "org_id":     org_id,
        "survey_id":  survey_id,
        "timestamp":  datetime.now(timezone.utc).isoformat(),
        "trace_id":   ctx.get("trace_id", ""),
        "metadata":   metadata or {},
    }


async def _publish_redis(event: dict) -> None:
    try:
        from crystalos.consumers._redis import _get_redis
        r = await _get_redis()
        if r:
            await r.xadd(
                _REDIS_STREAM_KEY,
                {"payload": json.dumps(event)},
                maxlen=50_000,
                approximate=True,
            )
    except Exception as exc:
        logger.warning("event_publish_redis_failed", error=str(exc))


async def _publish_pubsub(event: dict) -> None:
    try:
        from google.cloud import pubsub_v1  # type: ignore[import]
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(_GCP_PROJECT, _PUBSUB_TOPIC)
        data = json.dumps(event).encode("utf-8")
        # Add ordering key so events for the same run arrive in order
        future = publisher.publish(topic_path, data, ordering_key=event["run_id"])
        future.result(timeout=5)
    except Exception as exc:
        logger.warning("event_publish_pubsub_failed", error=str(exc))


async def publish_run_event(
    event_type: str,
    *,
    run_id:    str,
    org_id:    str,
    survey_id: str | None = None,
    metadata:  dict | None = None,
) -> None:
    """Best-effort publish. Never raises."""
    event = _make_event(event_type, run_id, org_id, survey_id, metadata or {})
    if _EVENT_BUS == "pubsub" and _GCP_PROJECT:
        await _publish_pubsub(event)
    else:
        await _publish_redis(event)
    logger.debug("run_event_published", event_type=event_type, run_id=run_id)
