"""Crystal → Notification bridge.

When the insight pipeline finishes (or Crystal detects something), it publishes a
notification event to the SAME Redis stream the Node Event Engine consumes
(`notifications:events`), with a plain-English `crystalSummary` already baked into
the payload. The Event Engine then resolves recipients, applies preferences/dedup,
persists, and pushes via SSE.

`narrate()` is deterministic (no LLM) so it's fast, free, and fully testable; an
LLM-backed narration can layer on later by passing a richer `crystalSummary`.
"""
from __future__ import annotations

import json
import time
from typing import Any

STREAM_KEY = "notifications:events"  # must match backend/src/lib/notificationEvents.js


def narrate(notification_type: str, payload: dict[str, Any] | None = None) -> str:
    """Return a 1-2 sentence plain-English explanation for a notification."""
    p = payload or {}
    if p.get("crystalSummary"):
        return str(p["crystalSummary"])

    if notification_type == "crystal.insight_ready":
        n = p.get("insightCount", 0)
        rc = p.get("responseCount")
        base = f"Crystal surfaced {n} key insight{'s' if n != 1 else ''}"
        return f"{base} from {rc} responses." if rc else f"{base}."
    if notification_type == "score.nps_drop":
        old, new = p.get("old"), p.get("new")
        driver = p.get("driver")
        if old is not None and new is not None:
            msg = f"NPS fell from {old} to {new}"
            return f"{msg}, driven by '{driver}'." if driver else f"{msg}."
        return "NPS dropped versus the prior period."
    if notification_type == "score.nps_rise":
        old, new = p.get("old"), p.get("new")
        if old is not None and new is not None:
            return f"NPS rose from {old} to {new} — momentum is positive."
        return "NPS improved versus the prior period."
    if notification_type == "crystal.anomaly_detected":
        return p.get("description") or "Crystal detected an anomaly in recent responses."
    if notification_type == "crystal.topic_emerged":
        topic = p.get("topic")
        return f"A new topic is emerging: '{topic}'." if topic else "A new topic is emerging in responses."
    if notification_type == "survey.milestone":
        m = p.get("milestone")
        return f"This survey reached {m} responses." if m else "This survey hit a response milestone."
    # Fallback: humanize the type.
    return notification_type.replace(".", " ").replace("_", " ").capitalize() + "."


async def publish_notification_event(
    redis_client,
    *,
    type: str,
    org_id: str,
    target_user_ids: list[str] | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    priority: str | None = None,
    title: str | None = None,
    payload: dict[str, Any] | None = None,
) -> str | None:
    """XADD a notification event for the Node Event Engine to process.

    Field names mirror backend/src/lib/notificationEvents.js parseEventFields().
    Returns the stream message id, or None if redis_client is falsy.
    """
    if not redis_client:
        return None
    payload = dict(payload or {})
    # Ensure a narration is present so delivery is always actionable.
    payload.setdefault("crystalSummary", narrate(type, payload))

    fields = {
        "type": type,
        "org_id": org_id,
        "target_user_ids": json.dumps(target_user_ids or []),
        "actor_id": "",
        "entity_type": entity_type or "",
        "entity_id": entity_id or "",
        "priority": priority or "",
        "title": title or "",
        "body": payload.get("crystalSummary", ""),
        "action_url": payload.get("actionUrl", ""),
        "dedup_window_ms": "",
        "payload": json.dumps(payload),
        "ts": str(int(time.time() * 1000)),
    }
    return await redis_client.xadd(STREAM_KEY, fields, maxlen=50000, approximate=True)


async def notify_insight_complete(redis_client, org_id, survey_id, insight_ids, summary, response_count=None):
    """Convenience: called when insight generation completes."""
    return await publish_notification_event(
        redis_client,
        type="crystal.insight_ready",
        org_id=org_id,
        entity_type="survey",
        entity_id=survey_id,
        priority="info",
        payload={
            "insightCount": len(insight_ids or []),
            "insightIds": insight_ids or [],
            "responseCount": response_count,
            "crystalSummary": summary,
            "actionUrl": f"/app/surveys/{survey_id}/insights",
        },
    )
