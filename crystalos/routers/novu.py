"""Novu Connect (ACI) router for CrystalOS.

Endpoints:
  POST /novu/message   — inbound message from Novu Connect (via backend proxy)
  GET  /novu/health    — verify Novu integration is configured
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from crystalos.lib.logger import logger
from crystalos.lib.security import require_internal_key
from crystalos.novu_connect.adapter import send_novu_reply, upsert_novu_subscriber
from crystalos.novu_connect.message_processor import NovuMessage, process_novu_message

router = APIRouter(prefix="/novu", tags=["novu-connect"])


class NovuMessageRequest(BaseModel):
    subscriberId: str
    channel: str = "in_app"
    message: str
    orgId: str
    userId: str | None = None
    threadId: str | None = None
    metadata: dict[str, Any] = {}


class NovuMessageResponse(BaseModel):
    reply: str
    thread_id: str | None
    delivered: bool


@router.post("/message", response_model=NovuMessageResponse)
async def handle_novu_message(
    body: NovuMessageRequest,
    _: None = Depends(require_internal_key),
) -> NovuMessageResponse:
    """
    Process an inbound Novu Connect message through Crystal and send the reply back via Novu.
    Called by the backend (crystal-novu.ts route) after Novu signature verification.
    """
    # Build NovuMessage from request
    novu_msg = NovuMessage({
        "subscriberId": body.subscriberId,
        "channel": body.channel,
        "message": body.message,
        "orgId": body.orgId,
        "userId": body.userId or body.subscriberId,
        "threadId": body.threadId,
        "metadata": body.metadata,
    })

    # Ensure subscriber exists in Novu
    await upsert_novu_subscriber(body.subscriberId, email=body.metadata.get("email"))

    # Process through Crystal
    reply_text = await process_novu_message(novu_msg, None)

    # Determine thread ID for reply continuity
    thread_id = body.threadId or f"novu:{body.subscriberId}:{body.channel}"

    # Send reply back via Novu ACI
    delivered = False
    try:
        result = await send_novu_reply(
            subscriber_id=body.subscriberId,
            channel=body.channel,
            reply_text=reply_text,
            thread_id=thread_id,
        )
        delivered = result.get("status") != "skipped"
        logger.info("novu_connect:reply_sent", thread_id=thread_id, channel=body.channel)
    except Exception as exc:
        logger.error("novu_connect:reply_failed", error=str(exc), thread_id=thread_id)

    return NovuMessageResponse(reply=reply_text, thread_id=thread_id, delivered=delivered)


@router.get("/health")
async def novu_health() -> dict[str, str]:
    """Check whether Novu Connect is configured."""
    import os
    configured = bool(os.getenv("NOVU_API_KEY"))
    return {
        "status": "configured" if configured else "unconfigured",
        "detail": "NOVU_API_KEY is set" if configured else "Set NOVU_API_KEY to enable Novu Connect",
    }
