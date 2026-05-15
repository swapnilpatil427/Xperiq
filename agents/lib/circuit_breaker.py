"""Simple async circuit breaker.

Wraps OpenRouter calls to prevent hammering a failing API.
States: CLOSED (normal) → OPEN (failing, reject fast) → HALF_OPEN (test recovery).

Usage:
    cb = CircuitBreaker("openrouter", failure_threshold=3, recovery_timeout=30)

    async with cb:
        result = await call_openrouter(...)
"""
import asyncio
import time
from enum import Enum
from typing import Any, Callable

from agents.lib.logger import logger
from agents.lib.metrics import circuit_breaker_state


class CBState(Enum):
    CLOSED    = 0   # normal operation
    OPEN      = 1   # rejecting calls fast
    HALF_OPEN = 2   # testing recovery


class CircuitBreakerOpen(Exception):
    """Raised when a call is rejected because the circuit is open."""


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
        success_threshold: int = 1,   # successes in HALF_OPEN needed to close
        count_exception: Callable[[BaseException], bool] | None = None,
    ) -> None:
        self.name              = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout  = recovery_timeout
        self.success_threshold = success_threshold
        self._state            = CBState.CLOSED
        self._failures         = 0
        self._successes        = 0
        self._last_failure_at  = 0.0
        self._lock             = asyncio.Lock()
        # Callable: True = count as failure, False = ignore (transient errors like 429)
        self._count_exception  = count_exception if count_exception is not None else lambda _: True
        circuit_breaker_state.labels(name=name).set(0)

    @property
    def state(self) -> CBState:
        return self._state

    async def _transition(self, new_state: CBState) -> None:
        async with self._lock:
            old = self._state
            self._state = new_state
            circuit_breaker_state.labels(name=self.name).set(new_state.value)
            if old != new_state:
                logger.info("circuit_breaker_transition",
                            name=self.name, from_state=old.name, to_state=new_state.name)

    async def __aenter__(self) -> "CircuitBreaker":
        now = time.monotonic()

        if self._state == CBState.OPEN:
            if now - self._last_failure_at >= self.recovery_timeout:
                await self._transition(CBState.HALF_OPEN)
                self._successes = 0
            else:
                raise CircuitBreakerOpen(
                    f"Circuit '{self.name}' is OPEN — failing fast. "
                    f"Retry in {self.recovery_timeout - (now - self._last_failure_at):.0f}s."
                )
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        if exc_type is None:
            # Success
            self._failures = 0
            if self._state == CBState.HALF_OPEN:
                self._successes += 1
                if self._successes >= self.success_threshold:
                    await self._transition(CBState.CLOSED)
        elif exc_val is not None and not self._count_exception(exc_val):
            # Transient error (e.g. 429 rate limit) — don't count toward failure threshold
            pass
        else:
            # Real failure
            self._failures          += 1
            self._last_failure_at    = time.monotonic()
            if self._state == CBState.HALF_OPEN:
                await self._transition(CBState.OPEN)
            elif self._failures >= self.failure_threshold:
                await self._transition(CBState.OPEN)

        return False   # do not suppress the exception


# openrouter_breaker is created in agents/lib/openrouter.py so it can attach
# a rate-limit predicate without creating a circular import here.
