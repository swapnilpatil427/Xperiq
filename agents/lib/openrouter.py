"""Async OpenRouter client with enterprise defence layers.

Three-layer JSON protection:
  1. response_format: json_object — model-level hint
  2. X-OpenRouter-Response-Healing: true — OpenRouter post-processes malformed JSON
  3. Pydantic validation + retry with error context injected on failure

Circuit breaker wraps every call — 3 real failures → OPEN for 30s.
429 rate-limits are NOT counted as circuit failures (they're expected on free tier).
Exponential backoff on 429/503, capped at 5s for dev/dev-paid envs.

Usage:
    output, entry = await call_agent(
        agent_name="creator",
        system=SYSTEM_PROMPT,
        user="Create a survey about...",
        output_schema=CreatorOutput,
    )
"""
import asyncio
import json
import os
import re
import time
from collections import defaultdict
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from agents.lib.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from agents.lib.credits import CreditEntry, BudgetExceededError, check_budget
from agents.lib.logger import logger
from agents.lib.metrics import (
    agent_calls_total,
    agent_duration_seconds,
    agent_tokens_total,
    agent_cost_usd_total,
)
from agents.lib.models import get_model, get_env, ModelConfig

T = TypeVar("T", bound=BaseModel)

_BASE_URL  = "https://openrouter.ai/api/v1"
_API_KEY   = os.getenv("OPENROUTER_API_KEY", "")
_HTTP_REFS = "https://experient.app"
_MAX_RETRY = 2   # JSON parse failures — max 2 retries beyond the first attempt

_ENV = get_env()

# ── Per-env retry / circuit config ───────────────────────────────────────────
# Dev:          fast iteration. Cap Retry-After at 8s. Fail fast (3 exhausted
#               sequences → circuit opens). Recover quickly (15s).
# Staging/Prod: reliability matters more. Respect Retry-After fully. Tolerate
#               more failures (5) before opening. Longer recovery (60s).

if _ENV in ("staging", "prod"):
    _MAX_HTTP_ATTEMPTS  = 5     # attempts per call (initial + 4 retries)
    _MAX_RETRY_AFTER    = None  # respect Retry-After fully
    _CB_THRESHOLD       = 5     # exhausted-attempt sequences before circuit opens
    _CB_RECOVERY        = 60.0  # seconds before HALF_OPEN probe
else:
    _MAX_HTTP_ATTEMPTS  = 4     # attempts per call (initial + 3 retries)
    _MAX_RETRY_AFTER    = 8.0   # cap Retry-After; free-tier headers can say 19-30s
    _CB_THRESHOLD       = 3     # fail fast in dev
    _CB_RECOVERY        = 15.0  # recover quickly so dev iteration isn't blocked

# Per-session request counter logged at DEBUG so you can see exactly how many
# requests go to each model per session.
_request_counts: dict[str, int] = defaultdict(int)

# Circuit breaker wraps the FULL retry sequence (not each individual attempt).
# A model must exhaust ALL retries _CB_THRESHOLD times before the circuit opens.
# This means 429s inside the retry loop don't count — only final exhaustion does.
openrouter_breaker = CircuitBreaker(
    "openrouter",
    failure_threshold=_CB_THRESHOLD,
    recovery_timeout=_CB_RECOVERY,
)


class AgentOutputError(Exception):
    """Raised after all retries are exhausted with invalid JSON output."""


class OpenRouterError(Exception):
    """Raised on HTTP-level failure from OpenRouter."""
    def __init__(self, message: str, retryable: bool = True, retry_after: float | None = None):
        super().__init__(message)
        self.retryable   = retryable
        self.retry_after = retry_after  # seconds to wait before retrying (from Retry-After header)


def _log_rate_limit_headers(headers: "httpx.Headers", model: str) -> None:
    """Log OpenRouter rate-limit headers so you can see quota before hitting the wall.

    Free tier (no $10 purchase): 50 req/day, 20 req/min — shared across ALL free models.
    Paid tier ($10+ purchased once): 1000 req/day, 20 req/min.
    """
    remaining = headers.get("X-RateLimit-Remaining")
    limit     = headers.get("X-RateLimit-Limit")
    reset     = headers.get("X-RateLimit-Reset")
    if remaining is None:
        return

    try:
        remaining_int = int(remaining)
    except (ValueError, TypeError):
        remaining_int = -1

    log_fn = logger.warning if remaining_int < 10 else logger.debug
    log_fn(
        "openrouter_quota",
        model=model,
        remaining=remaining,
        limit=limit,
        reset_at=reset,
    )


async def _raw_call(
    messages: list[dict[str, str]],
    config: ModelConfig,
) -> tuple[str, dict[str, Any]]:
    """Single HTTP call to OpenRouter. Returns (content_str, usage_dict)."""
    if not _API_KEY:
        raise OpenRouterError("OPENROUTER_API_KEY is not set")

    _request_counts[config.model] += 1
    total_this_model = _request_counts[config.model]
    total_all        = sum(_request_counts.values())
    logger.debug(
        "openrouter_request",
        model=config.model,
        request_num_this_model=total_this_model,
        total_requests_this_session=total_all,
        all_counts=dict(_request_counts),
    )

    payload = {
        "model":           config.model,
        "messages":        messages,
        "max_tokens":      config.max_tokens,
        "temperature":     config.temperature,
        "response_format": {"type": "json_object"},
    }

    headers = {
        "Authorization": f"Bearer {_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  _HTTP_REFS,
        "X-Title":       "Experient Copilot",
        # OpenRouter Response Healing: reduces JSON defects by 80%+
        "X-OpenRouter-Response-Healing": "true",
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(f"{_BASE_URL}/chat/completions", json=payload, headers=headers)

    # Log remaining quota on every response so you can see when you're close to the limit
    _log_rate_limit_headers(resp.headers, config.model)

    if resp.status_code == 429:
        retry_after = float(resp.headers.get("Retry-After", "5"))
        raise OpenRouterError(f"Rate limited — retry after {retry_after}s",
                              retryable=True, retry_after=retry_after)
    if resp.status_code >= 500:
        raise OpenRouterError(f"OpenRouter server error: {resp.status_code}")
    if not resp.is_success:
        # 4xx errors (bad model ID, auth, etc.) are not retryable — raise immediately
        raise OpenRouterError(f"OpenRouter {resp.status_code}: {resp.text[:200]}", retryable=False)


    data    = resp.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    usage   = data.get("usage", {})
    return content, usage


def _retry_wait(err: "OpenRouterError", attempt: int) -> float:
    """Compute how long to wait before the next retry attempt.

    Priority:
      1. Retry-After header from OpenRouter (authoritative for 429s).
         Dev caps this at _MAX_RETRY_AFTER so free-tier headers (19-30s)
         don't freeze the dev loop. Staging/prod respect the full value.
      2. Exponential backoff (1s, 2s, 4s, 8s...) when no header is present.
    """
    if err.retry_after is not None:
        wait = err.retry_after
        if _MAX_RETRY_AFTER is not None:
            wait = min(wait, _MAX_RETRY_AFTER)
    else:
        wait = float(2 ** attempt)  # 1, 2, 4, 8, 16…
    return wait


async def _retry_loop(
    messages: list[dict[str, str]],
    config: ModelConfig,
) -> tuple[str, dict[str, Any]]:
    """Retry loop only — no circuit breaker here.

    Runs up to _MAX_HTTP_ATTEMPTS. Wait uses Retry-After if the header is
    present, otherwise pure exponential backoff. Non-retryable errors (4xx
    bad model ID, auth failure) are raised immediately without retrying.
    """
    last_err: Exception | None = None
    for attempt in range(_MAX_HTTP_ATTEMPTS):
        try:
            return await _raw_call(messages, config)
        except OpenRouterError as e:
            if not e.retryable:
                raise
            last_err = e
            wait = _retry_wait(e, attempt)
            logger.warning(
                "openrouter_retry",
                attempt=attempt + 1,
                max_attempts=_MAX_HTTP_ATTEMPTS,
                wait_s=wait,
                error=str(e),
                model=config.model,
            )
            await asyncio.sleep(wait)
    raise OpenRouterError(f"OpenRouter failed after {_MAX_HTTP_ATTEMPTS} attempts: {last_err}")


async def _call_with_backoff(
    messages: list[dict[str, str]],
    config: ModelConfig,
) -> tuple[str, dict[str, Any]]:
    """Circuit breaker wraps the FULL retry sequence.

    Exhausting all attempts (whether from 429s, 5xx, or timeouts) counts as
    ONE failure toward the circuit threshold. Individual 429s inside the retry
    loop do NOT increment the counter — only a fully exhausted sequence does.

    Dev:          3 exhausted sequences → OPEN, 15s recovery.
    Staging/Prod: 5 exhausted sequences → OPEN, 60s recovery.
    """
    async with openrouter_breaker:
        return await _retry_loop(messages, config)


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` wrappers that models sometimes emit despite instructions."""
    return re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", text.strip(), flags=re.DOTALL)


async def call_agent(
    agent_name: str,
    system:     str,
    user:       str,
    output_schema: type[T],
    current_tokens: int = 0,
    prior_messages: list[dict] | None = None,
) -> tuple[T, CreditEntry]:
    """
    High-level agent LLM call — routes to Anthropic SDK or OpenRouter based on env config.

    In prod, Anthropic models (creator, recommender) use the Anthropic SDK directly
    for native tool use (more reliable schema adherence than JSON mode).
    All other models (dev free/paid, Google Gemini QC) use OpenRouter.

    Raises:
        BudgetExceededError  — run would exceed MAX_TOKENS_PER_RUN
        AgentOutputError     — JSON parse failed after all retries (OpenRouter path)
        OpenRouterError      — HTTP failure after backoff (OpenRouter path)
        CircuitBreakerOpen   — OpenRouter circuit is open
        AnthropicOutputError — tool use response invalid (Anthropic path)
    """
    config = get_model(agent_name)  # type: ignore[arg-type]

    # Route to Anthropic SDK for prod Anthropic models
    if config.use_anthropic_sdk:
        from agents.lib.anthropic_client import call_agent_anthropic
        return await call_agent_anthropic(agent_name, system, user, output_schema, current_tokens)
    start  = time.monotonic()

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system},
        *(prior_messages or []),
        {"role": "user",   "content": user},
    ]

    last_parse_error: str = ""
    content:          str = ""
    usage:            dict[str, Any] = {}

    for attempt in range(_MAX_RETRY + 1):
        if attempt > 0:
            # Inject the previous error so the model can self-correct
            messages.append({
                "role": "user",
                "content": (
                    f"PREVIOUS ATTEMPT {attempt} FAILED — {last_parse_error}. "
                    "Return ONLY valid JSON matching the schema. No markdown. No explanation."
                ),
            })
            logger.info("agent_json_retry", agent=agent_name, attempt=attempt, error=last_parse_error[:100])

        try:
            content, usage = await _call_with_backoff(messages, config)
        except (OpenRouterError, CircuitBreakerOpen):
            duration = time.monotonic() - start
            agent_calls_total.labels(agent=agent_name, model=config.model, status="error").inc()
            agent_duration_seconds.labels(agent=agent_name, model=config.model).observe(duration)
            raise

        # Budget check against actual usage
        total_t = usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)
        try:
            check_budget(current_tokens, total_t)
        except BudgetExceededError:
            agent_calls_total.labels(agent=agent_name, model=config.model, status="budget_exceeded").inc()
            raise

        # JSON defence layer 3: Pydantic validation
        cleaned = _strip_markdown_fences(content)
        try:
            parsed = output_schema.model_validate_json(cleaned)

            # Success path — record metrics and return
            duration = time.monotonic() - start
            agent_calls_total.labels(agent=agent_name, model=config.model, status="success").inc()
            agent_duration_seconds.labels(agent=agent_name, model=config.model).observe(duration)
            agent_tokens_total.labels(agent=agent_name, model=config.model, direction="input").inc(
                usage.get("prompt_tokens", 0)
            )
            agent_tokens_total.labels(agent=agent_name, model=config.model, direction="output").inc(
                usage.get("completion_tokens", 0)
            )
            entry = CreditEntry.from_usage(agent_name, config.model, usage)
            agent_cost_usd_total.labels(agent=agent_name, model=config.model).inc(entry.cost_usd)

            logger.info(
                "agent_call_complete",
                agent=agent_name,
                model=config.model,
                duration_ms=round(duration * 1000),
                tokens_in=usage.get("prompt_tokens"),
                tokens_out=usage.get("completion_tokens"),
                cost_usd=entry.cost_usd,
            )
            return parsed, entry

        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            last_parse_error = str(e)[:300]

    # All retries exhausted
    duration = time.monotonic() - start
    agent_calls_total.labels(agent=agent_name, model=config.model, status="error").inc()
    agent_duration_seconds.labels(agent=agent_name, model=config.model).observe(duration)
    raise AgentOutputError(
        f"Agent '{agent_name}' output failed validation after {_MAX_RETRY + 1} attempts. "
        f"Last error: {last_parse_error}"
    )
