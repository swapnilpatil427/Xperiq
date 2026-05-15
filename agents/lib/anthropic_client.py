"""Direct Anthropic SDK client for prod Claude models.

Uses tool use to force structured JSON output — more reliable than JSON mode:
  - Tool call arguments are validated server-side by Anthropic
  - No markdown fence stripping needed
  - The model is training-optimized for valid tool call arguments

Used by: creator (Opus 4.7 + adaptive thinking), recommender (Haiku 4.5)
QC uses OpenRouter (Google Gemini) to maintain cross-vendor independence.
"""
from __future__ import annotations

import os
import time
from typing import Any, TypeVar

from anthropic import AsyncAnthropic, APIConnectionError, APIStatusError, APITimeoutError
from pydantic import BaseModel, ValidationError

from agents.lib.credits import BudgetExceededError, CreditEntry, check_budget
from agents.lib.logger import logger
from agents.lib.metrics import (
    agent_calls_total,
    agent_cost_usd_total,
    agent_duration_seconds,
    agent_tokens_total,
)
from agents.lib.models import get_model

T = TypeVar("T", bound=BaseModel)

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        _client = AsyncAnthropic(api_key=api_key)
    return _client


class AnthropicOutputError(Exception):
    """Raised when the Anthropic response cannot be parsed into the expected schema."""


async def call_agent_anthropic(
    agent_name: str,
    system:     str,
    user:       str,
    output_schema: type[T],
    current_tokens: int = 0,
) -> tuple[T, CreditEntry]:
    """
    Call a prod Anthropic model using tool use for guaranteed structured output.

    The output schema is exposed as the single tool the model MUST call.
    This means Anthropic validates the response JSON server-side — no retries needed.

    For creator agent: uses Opus 4.7 with adaptive thinking.
    For recommender agent: uses Haiku 4.5 (fast, cheap, no thinking).

    Raises:
        RuntimeError          — ANTHROPIC_API_KEY not set
        BudgetExceededError   — run exceeds MAX_TOKENS_PER_RUN
        AnthropicOutputError  — model didn't call the tool (shouldn't happen with tool_choice)
        APIStatusError        — Anthropic API error (4xx/5xx)
    """
    config = get_model(agent_name)  # type: ignore[arg-type]
    client = _get_client()
    start  = time.monotonic()

    # Build a tool whose input_schema IS the output schema.
    # tool_choice={"type": "tool", "name": ...} forces the model to call it.
    tool_name = f"submit_{agent_name}_result"
    raw_schema = output_schema.model_json_schema()
    tool = {
        "name":         tool_name,
        "description":  f"Submit the final structured {agent_name} result. You MUST call this tool.",
        "input_schema": raw_schema,
    }

    create_kwargs: dict[str, Any] = {
        "model":       config.model,
        "max_tokens":  config.max_tokens,
        "system":      system,
        "tools":       [tool],
        "tool_choice": {"type": "tool", "name": tool_name},
        "messages":    [{"role": "user", "content": user}],
    }

    if not config.use_thinking and config.temperature is not None:
        create_kwargs["temperature"] = config.temperature

    thinking_parts: list[str] = []

    if config.use_thinking:
        # "summarized" display makes Opus 4.7 emit readable thinking text in the stream.
        # Default "omitted" streams thinking blocks with empty text — useless for us.
        create_kwargs["thinking"] = {"type": "adaptive", "display": "summarized"}

    try:
        async with await client.messages.stream(**create_kwargs) as stream:
            async for event in stream:
                # Collect thinking delta text as it streams
                if (getattr(event, "type", None) == "content_block_delta"
                        and getattr(getattr(event, "delta", None), "type", None) == "thinking_delta"):
                    thinking_parts.append(event.delta.thinking)
            response = await stream.get_final_message()
    except (APIConnectionError, APITimeoutError) as e:
        duration = time.monotonic() - start
        agent_calls_total.labels(agent=agent_name, model=config.model, status="error").inc()
        agent_duration_seconds.labels(agent=agent_name, model=config.model).observe(duration)
        raise
    except APIStatusError as e:
        duration = time.monotonic() - start
        agent_calls_total.labels(agent=agent_name, model=config.model, status="error").inc()
        agent_duration_seconds.labels(agent=agent_name, model=config.model).observe(duration)
        logger.error("anthropic_api_error", agent=agent_name, status=e.status_code, message=str(e.message))
        raise

    # Extract the tool call block
    tool_use_block = next(
        (b for b in response.content if b.type == "tool_use" and b.name == tool_name),
        None,
    )
    if tool_use_block is None:
        raise AnthropicOutputError(
            f"Anthropic returned no tool_use block for agent '{agent_name}'. "
            f"stop_reason={response.stop_reason}"
        )

    # Validate tool call arguments through Pydantic
    try:
        parsed = output_schema.model_validate(tool_use_block.input)
    except ValidationError as e:
        raise AnthropicOutputError(
            f"Tool call arguments for '{agent_name}' failed Pydantic validation: {e}"
        ) from e

    # Accounting
    usage = {
        "input_tokens":  response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    check_budget(current_tokens, usage["input_tokens"] + usage["output_tokens"])
    entry = CreditEntry.from_usage(agent_name, config.model, usage)
    entry.thinking_text = "".join(thinking_parts) or None

    duration = time.monotonic() - start
    agent_calls_total.labels(agent=agent_name, model=config.model, status="success").inc()
    agent_duration_seconds.labels(agent=agent_name, model=config.model).observe(duration)
    agent_tokens_total.labels(agent=agent_name, model=config.model, direction="input").inc(usage["input_tokens"])
    agent_tokens_total.labels(agent=agent_name, model=config.model, direction="output").inc(usage["output_tokens"])
    agent_cost_usd_total.labels(agent=agent_name, model=config.model).inc(entry.cost_usd)

    logger.info(
        "anthropic_call_complete",
        agent=agent_name,
        model=config.model,
        duration_ms=round(duration * 1000),
        tokens_in=usage["input_tokens"],
        tokens_out=usage["output_tokens"],
        cost_usd=entry.cost_usd,
        stop_reason=response.stop_reason,
    )
    return parsed, entry
