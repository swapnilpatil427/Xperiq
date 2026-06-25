"""
Process inbound Novu Connect messages through Crystal and return a reply.

This bridges the stateless Novu ACI message format to Crystal's stateful
LangGraph conversation model. Each Novu message is mapped to a Crystal thread
keyed by novu:{subscriber_id}:{channel}, persisted in Redis for 7 days.
"""
from __future__ import annotations

import json
from typing import Any

from crystalos.lib.logger import logger

# Redis TTL for Novu conversation threads — matches crystal_threads 7-day TTL
_NOVU_THREAD_TTL = 7 * 24 * 3600
_NOVU_THREAD_MAX_TURNS = 10  # keep last N turns to bound context size


class NovuMessage:
    """Parsed inbound message from Novu Connect ACI."""

    def __init__(self, raw: dict[str, Any]) -> None:
        self.subscriber_id: str = raw.get("subscriberId", "")
        self.channel: str = raw.get("channel", "in_app")  # slack|teams|whatsapp|email|telegram
        self.message_text: str = raw.get("message", raw.get("text", ""))
        self.thread_id: str | None = raw.get("threadId")
        self.org_id: str = raw.get("orgId", "")
        self.user_id: str = raw.get("userId", self.subscriber_id)
        self.metadata: dict[str, Any] = raw.get("metadata", {})

    def to_crystal_context(self) -> dict[str, Any]:
        """Map to CrystalContext-compatible dict."""
        return {
            "org_id": self.org_id,
            "user_id": self.user_id,
            "survey_id": self.metadata.get("survey_id"),
            "scope": "org",
            "channel": self.channel,
            "thread_id": self.thread_id,
        }


async def _load_thread_history(redis_key: str) -> list[dict[str, Any]]:
    """Load prior conversation turns from Redis. Returns [] if Redis unavailable."""
    try:
        from crystalos.lib.redis import get_redis
        r = await get_redis()
        raw = await r.get(redis_key)
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("novu_connect:thread_load_failed", error=str(exc))
    return []


async def _save_thread_history(
    redis_key: str,
    history: list[dict[str, Any]],
    user_message: str,
    reply: str,
) -> None:
    """Append this turn and persist to Redis with TTL. Trims to max turns."""
    history = history + [
        {"role": "user", "content": user_message},
        {"role": "assistant", "content": reply},
    ]
    # Keep only the last N turns (each turn = 2 entries)
    if len(history) > _NOVU_THREAD_MAX_TURNS * 2:
        history = history[-(  _NOVU_THREAD_MAX_TURNS * 2):]
    try:
        from crystalos.lib.redis import get_redis
        r = await get_redis()
        await r.setex(redis_key, _NOVU_THREAD_TTL, json.dumps(history))
    except Exception as exc:
        logger.warning("novu_connect:thread_save_failed", error=str(exc))


async def process_novu_message(
    message: NovuMessage,
    crystal_graph: Any,  # unused — Crystal uses crystal_agent.run(); kept for API compatibility
) -> str:
    """
    Run Crystal to respond to a Novu Connect message.
    Returns the text reply to send back via Novu.
    """
    logger.info(
        "novu_connect:message_received",
        subscriber_id=message.subscriber_id,
        channel=message.channel,
        org_id=message.org_id,
        thread_id=message.thread_id,
    )

    channel_hints = {
        "slack": "Respond concisely with Slack markdown (*bold*, _italic_, bullet lists).",
        "teams": "Respond with clear formatting suitable for Microsoft Teams.",
        "whatsapp": "Respond conversationally and concisely. Plain text only.",
        "email": "Respond with full detail. You may use structured paragraphs.",
        "telegram": "Respond concisely with plain text.",
    }
    channel_hint = channel_hints.get(message.channel, "")

    user_message = message.message_text
    if channel_hint:
        user_message = f"[Channel: {message.channel}] {user_message}"

    try:
        thread_id = message.thread_id or f"novu:{message.subscriber_id}:{message.channel}"
        redis_key = f"novu_thread:{thread_id}"

        # Load prior turns for conversation continuity
        conversation_history = await _load_thread_history(redis_key)

        context = message.to_crystal_context()
        context["thread_id"] = thread_id

        reply = await _invoke_crystal_conversational(user_message, context, conversation_history)

        # Persist this turn so the next message has full context
        await _save_thread_history(redis_key, conversation_history, user_message, reply)

        return reply

    except Exception as exc:
        logger.error("novu_connect:crystal_invoke_failed", error=str(exc))
        return "I encountered an issue processing your request. Please try again or visit the Experient dashboard directly."


async def _invoke_crystal_conversational(
    message: str,
    context: dict[str, Any],
    conversation_history: list[dict[str, Any]],
) -> str:
    """
    Invoke Crystal in conversational (non-streaming) mode via its native agent interface.
    Returns a string response for Novu to deliver.

    When metadata.survey_id is provided the full skill pipeline runs with real data.
    Without it Crystal answers from org-level knowledge and general training.
    """
    try:
        from crystalos.agents.crystal import crystal_agent, CrystalInput

        inp = CrystalInput(
            survey_id=context.get("survey_id") or "",
            org_id=context.get("org_id", ""),
            message=message,
            insights=[],
            topics=[],
            survey_title="",
            survey_response_count=0,
            metrics={},
            conversation_history=conversation_history,
            user_id=context.get("user_id", ""),
            scope=context.get("scope", "org"),
            has_open_text=True,
            # editor grants org-level read access which is appropriate for authenticated Novu users.
            user_role="editor",
        )

        output, _ = await crystal_agent.run(inp)
        answer = (output.answer or "").strip()
        if answer:
            return answer

        return "I've analyzed your request. Please check the Experient dashboard for detailed insights."

    except Exception as exc:
        logger.warning("novu_connect:crystal_fallback", error=str(exc))
        return (
            "Crystal is currently processing. For immediate insights, "
            "visit your dashboard at experient.app"
        )
