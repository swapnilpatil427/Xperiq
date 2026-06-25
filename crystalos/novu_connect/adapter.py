"""Novu Connect adapter — handles inbound ACI messages and dispatches replies via Novu API.

Note: Novu signature verification happens in the Node.js backend (crystal-novu.ts)
before this service is called. The /novu/message endpoint is protected by AGENTS_INTERNAL_KEY.
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

from crystalos.lib.logger import logger

NOVU_API_URL = "https://api.novu.co/v1"
NOVU_API_KEY = os.getenv("NOVU_API_KEY", "")


async def send_novu_reply(
    subscriber_id: str,
    channel: str,
    reply_text: str,
    thread_id: str | None = None,
) -> dict[str, Any]:
    """Send a reply back through Novu ACI to the user on their original channel."""
    if not NOVU_API_KEY:
        return {"status": "skipped", "reason": "NOVU_API_KEY not configured"}

    payload: dict[str, Any] = {
        "to": {"subscriberId": subscriber_id},
        "payload": {
            "message": reply_text,
            "thread_id": thread_id,
        },
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{NOVU_API_URL}/events/trigger",
            json={"name": "crystal-reply", **payload},
            headers={"Authorization": f"ApiKey {NOVU_API_KEY}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


async def upsert_novu_subscriber(
    subscriber_id: str,
    email: str | None = None,
    phone: str | None = None,
    first_name: str | None = None,
) -> None:
    """Ensure the user exists as a Novu subscriber."""
    if not NOVU_API_KEY:
        return

    body: dict[str, Any] = {"subscriberId": subscriber_id}
    if email:      body["email"] = email
    if phone:      body["phone"] = phone
    if first_name: body["firstName"] = first_name

    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            await client.post(
                f"{NOVU_API_URL}/subscribers",
                json=body,
                headers={"Authorization": f"ApiKey {NOVU_API_KEY}"},
            )
        except Exception as exc:
            logger.warning("novu_connect:subscriber_upsert_failed", subscriber_id=subscriber_id, error=str(exc))
