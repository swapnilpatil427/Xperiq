"""Tests for the OpenRouter retry/circuit-breaker layer.

Covers:
  - _retry_wait: Retry-After header takes priority; dev caps; exponential fallback
  - _retry_loop: retries on 429/5xx, raises immediately on 4xx, exhausts attempts
  - _call_with_backoff: circuit breaker trips only after exhausted sequences, not
    individual 429s inside the loop
  - Env-specific config (dev vs staging/prod thresholds)
"""
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from crystalos.lib.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from crystalos.lib.models import ModelConfig
from crystalos.lib.openrouter import (
    OpenRouterError,
    _retry_wait,
    _retry_loop,
    _call_with_backoff,
    _MAX_HTTP_ATTEMPTS,
    _MAX_RETRY_AFTER,
    _CB_THRESHOLD,
    _CB_RECOVERY,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def model_cfg() -> ModelConfig:
    return ModelConfig(
        model="test/model:free",
        max_tokens=100,
        temperature=0.1,
    )


def _rate_limit_err(retry_after: float | None = 10.0) -> OpenRouterError:
    return OpenRouterError("Rate limited", retryable=True, retry_after=retry_after)


def _server_err() -> OpenRouterError:
    return OpenRouterError("Server error 503", retryable=True, retry_after=None)


def _bad_model_err() -> OpenRouterError:
    return OpenRouterError("404 model not found", retryable=False)


# ── _retry_wait ───────────────────────────────────────────────────────────────

class TestRetryWait:
    def test_uses_retry_after_when_present(self):
        err = _rate_limit_err(retry_after=5.0)
        wait = _retry_wait(err, attempt=0)
        # Should use Retry-After (possibly capped), not 2^0=1
        assert wait <= 5.0

    def test_caps_retry_after_in_dev(self):
        """Dev environments cap long Retry-After values."""
        err = _rate_limit_err(retry_after=30.0)
        wait = _retry_wait(err, attempt=0)
        if _MAX_RETRY_AFTER is not None:
            assert wait <= _MAX_RETRY_AFTER, (
                f"Dev should cap retry wait at {_MAX_RETRY_AFTER}s, got {wait}s"
            )

    def test_exponential_backoff_when_no_retry_after(self):
        err = _server_err()  # no retry_after
        waits = [_retry_wait(err, attempt=i) for i in range(4)]
        # Each wait should be >= previous (exponential growth)
        for i in range(1, len(waits)):
            assert waits[i] >= waits[i - 1], f"Wait at attempt {i} is not >= attempt {i-1}"

    def test_exponential_base_is_powers_of_two(self):
        err = _server_err()
        assert _retry_wait(err, attempt=0) == 1.0
        assert _retry_wait(err, attempt=1) == 2.0
        assert _retry_wait(err, attempt=2) == 4.0
        assert _retry_wait(err, attempt=3) == 8.0


# ── _retry_loop ───────────────────────────────────────────────────────────────

class TestRetryLoop:
    @pytest.mark.asyncio
    async def test_returns_on_first_success(self, model_cfg):
        with patch("crystalos.lib.openrouter._raw_call", new_callable=AsyncMock) as mock:
            mock.return_value = ('{"result": "ok"}', {"prompt_tokens": 10})
            content, usage = await _retry_loop([], model_cfg)
        assert content == '{"result": "ok"}'
        assert mock.call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_429_then_succeeds(self, model_cfg):
        call_count = 0

        async def side_effect(*_args, **_kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise _rate_limit_err(retry_after=0.01)
            return ('{"ok": true}', {})

        with patch("crystalos.lib.openrouter._raw_call", side_effect=side_effect):
            with patch("crystalos.lib.openrouter.asyncio.sleep", new_callable=AsyncMock):
                content, _ = await _retry_loop([], model_cfg)

        assert call_count == 3
        assert content == '{"ok": true}'

    @pytest.mark.asyncio
    async def test_raises_immediately_on_non_retryable_error(self, model_cfg):
        with patch("crystalos.lib.openrouter._raw_call", new_callable=AsyncMock) as mock:
            mock.side_effect = _bad_model_err()
            with pytest.raises(OpenRouterError, match="404"):
                await _retry_loop([], model_cfg)
        assert mock.call_count == 1   # no retries

    @pytest.mark.asyncio
    async def test_exhausts_all_attempts_on_persistent_429(self, model_cfg):
        with patch("crystalos.lib.openrouter._raw_call", new_callable=AsyncMock) as mock:
            mock.side_effect = _rate_limit_err(retry_after=0.001)
            with patch("crystalos.lib.openrouter.asyncio.sleep", new_callable=AsyncMock):
                with pytest.raises(OpenRouterError, match="failed after"):
                    await _retry_loop([], model_cfg)
        assert mock.call_count == _MAX_HTTP_ATTEMPTS

    @pytest.mark.asyncio
    async def test_exhausts_all_attempts_on_persistent_5xx(self, model_cfg):
        with patch("crystalos.lib.openrouter._raw_call", new_callable=AsyncMock) as mock:
            mock.side_effect = _server_err()
            with patch("crystalos.lib.openrouter.asyncio.sleep", new_callable=AsyncMock):
                with pytest.raises(OpenRouterError, match="failed after"):
                    await _retry_loop([], model_cfg)
        assert mock.call_count == _MAX_HTTP_ATTEMPTS


# ── _call_with_backoff (circuit breaker behaviour) ────────────────────────────

class TestCircuitBreakerIntegration:
    """Verify that the circuit breaker counts exhausted retry sequences,
    not individual 429s inside the loop."""

    @pytest.mark.asyncio
    async def test_circuit_does_not_open_from_single_exhausted_sequence(self, model_cfg):
        """One failed sequence is not enough to open the circuit."""
        breaker = CircuitBreaker("test", failure_threshold=_CB_THRESHOLD,
                                 recovery_timeout=_CB_RECOVERY)

        with patch("crystalos.lib.openrouter.openrouter_breaker", breaker):
            with patch("crystalos.lib.openrouter._raw_call", new_callable=AsyncMock) as mock:
                mock.side_effect = _rate_limit_err(retry_after=0.001)
                with patch("crystalos.lib.openrouter.asyncio.sleep", new_callable=AsyncMock):
                    with pytest.raises(OpenRouterError):
                        await _call_with_backoff([], model_cfg)

        from crystalos.lib.circuit_breaker import CBState
        assert breaker.state == CBState.CLOSED, (
            "Circuit should stay CLOSED after just 1 exhausted sequence "
            f"(threshold is {_CB_THRESHOLD})"
        )

    @pytest.mark.asyncio
    async def test_circuit_opens_after_threshold_exhausted_sequences(self, model_cfg):
        """Circuit opens only after _CB_THRESHOLD fully-exhausted sequences."""
        breaker = CircuitBreaker("test", failure_threshold=_CB_THRESHOLD,
                                 recovery_timeout=_CB_RECOVERY)

        with patch("crystalos.lib.openrouter.openrouter_breaker", breaker):
            with patch("crystalos.lib.openrouter._raw_call", new_callable=AsyncMock) as mock:
                mock.side_effect = _server_err()
                with patch("crystalos.lib.openrouter.asyncio.sleep", new_callable=AsyncMock):
                    for _ in range(_CB_THRESHOLD):
                        with pytest.raises(OpenRouterError):
                            await _call_with_backoff([], model_cfg)

        from crystalos.lib.circuit_breaker import CBState
        assert breaker.state == CBState.OPEN, (
            f"Circuit should be OPEN after {_CB_THRESHOLD} exhausted sequences"
        )

    @pytest.mark.asyncio
    async def test_circuit_open_raises_immediately(self, model_cfg):
        """When the circuit is open, calls fail fast without hitting OpenRouter."""
        breaker = CircuitBreaker("test", failure_threshold=1, recovery_timeout=9999)

        with patch("crystalos.lib.openrouter.openrouter_breaker", breaker):
            with patch("crystalos.lib.openrouter._raw_call", new_callable=AsyncMock) as mock:
                mock.side_effect = _server_err()
                with patch("crystalos.lib.openrouter.asyncio.sleep", new_callable=AsyncMock):
                    # First call exhausts retries → opens circuit
                    with pytest.raises(OpenRouterError):
                        await _call_with_backoff([], model_cfg)
                    first_call_count = mock.call_count

                    # Second call should fail immediately (circuit open)
                    with pytest.raises(CircuitBreakerOpen):
                        await _call_with_backoff([], model_cfg)

                    # No additional raw calls made
                    assert mock.call_count == first_call_count


# ── Env-specific config sanity checks ────────────────────────────────────────

class TestEnvConfig:
    def test_max_http_attempts_is_positive(self):
        assert _MAX_HTTP_ATTEMPTS >= 3

    def test_cb_threshold_is_positive(self):
        assert _CB_THRESHOLD >= 1

    def test_cb_recovery_is_positive(self):
        assert _CB_RECOVERY > 0

    def test_max_retry_after_is_none_or_positive(self):
        assert _MAX_RETRY_AFTER is None or _MAX_RETRY_AFTER > 0
