"""Unit tests for lib/turn_publisher.py — TurnEvent telemetry and quality detection."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from crystalos.crystal.context import BrandContext, CrystalContext
from crystalos.lib.turn_publisher import (
    TurnEvent,
    _FRUSTRATION,
    _SATISFACTION,
    detect_quality_signal,
    publish_turn_event,
    _write_turn_event,
    log_capability_gap,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_ctx(brand: BrandContext | None = None) -> CrystalContext:
    return CrystalContext(
        org_id="org-123",
        user_id="user-456",
        survey_id="survey-789",
        scope="survey",
        brand=brand,
    )


def _make_event(**kwargs) -> TurnEvent:
    defaults = dict(
        org_id="org-123",
        brand_id=None,
        user_id="user-456",
        survey_id="survey-789",
        thread_id="thread-001",
        turn_index=0,
        query="What is the NPS trend?",
        tools_called=[],
        tool_errors=[],
        eval_score=0.85,
        model_used="crystal",
        tokens_in=100,
        tokens_out=200,
        latency_ms=1234,
        specialist_used=None,
        quality_signal=None,
    )
    defaults.update(kwargs)
    return TurnEvent(**defaults)


# ---------------------------------------------------------------------------
# test_publish_turn_event_is_nonblocking
# ---------------------------------------------------------------------------

def test_publish_turn_event_is_nonblocking():
    """publish_turn_event creates an asyncio task and returns immediately without blocking."""
    event = _make_event()
    ctx = _make_ctx()

    with patch("crystalos.lib.turn_publisher.asyncio") as mock_asyncio:
        # create_task should be called once
        publish_turn_event(event, ctx)
        mock_asyncio.create_task.assert_called_once()


# ---------------------------------------------------------------------------
# detect_quality_signal — frustration patterns
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("phrase", [
    "that's wrong",
    "incorrect",
    "not what i asked",
    "try again",
    "that's not right",
    "you're wrong",
    "that doesn't make sense",
    "that's not helpful",
    "stop",
    "nevermind",
    "forget it",
])
def test_detect_quality_signal_frustration_patterns(phrase: str):
    assert detect_quality_signal(phrase) == "negative"


# ---------------------------------------------------------------------------
# detect_quality_signal — satisfaction patterns
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("phrase", [
    "perfect",
    "exactly",
    "great",
    "thanks",
    "helpful",
    "that's what i needed",
    "good job",
    "nice",
    "awesome",
    "thank you",
    "excellent",
])
def test_detect_quality_signal_satisfaction_patterns(phrase: str):
    assert detect_quality_signal(phrase) == "positive"


# ---------------------------------------------------------------------------
# detect_quality_signal — neutral returns None
# ---------------------------------------------------------------------------

def test_detect_quality_signal_neutral_returns_none():
    assert detect_quality_signal("What is the NPS score for last quarter?") is None
    assert detect_quality_signal("Show me the trends") is None
    assert detect_quality_signal("") is None


def test_detect_quality_signal_case_insensitive():
    assert detect_quality_signal("THAT'S WRONG") == "negative"
    assert detect_quality_signal("PERFECT") == "positive"


# ---------------------------------------------------------------------------
# _write_turn_event — mocked DB
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_write_turn_event_writes_to_db():
    """_write_turn_event calls conn.execute with the correct SQL. No real DB needed."""
    event = _make_event()
    ctx = _make_ctx()

    mock_conn = AsyncMock()
    mock_conn_cm = MagicMock()
    mock_conn_cm.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn_cm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.connection = MagicMock(return_value=mock_conn_cm)

    with patch("crystalos.lib.turn_publisher._pool_conn", return_value=mock_pool):
        await _write_turn_event(event, ctx)

    mock_conn.execute.assert_called_once()
    call_args = mock_conn.execute.call_args[0]
    # First arg is the SQL string
    assert "crystal_turn_events" in call_args[0]
    # Second arg is the params tuple
    params = call_args[1]
    assert params[0] == "org-123"  # org_id
    assert params[2] == "user-456"  # user_id


@pytest.mark.asyncio
async def test_write_turn_event_never_raises_on_db_error():
    """_write_turn_event swallows DB errors and logs a warning — never raises."""
    event = _make_event()
    ctx = _make_ctx()

    with patch("crystalos.lib.turn_publisher._pool_conn", side_effect=RuntimeError("DB down")):
        # Should not raise
        await _write_turn_event(event, ctx)


# ---------------------------------------------------------------------------
# log_capability_gap — fire-and-forget write to crystal_capability_gaps
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_log_capability_gap_writes_to_db():
    """log_capability_gap embeds the query and fires a background write."""
    ctx = _make_ctx()

    mock_embeddings = [[0.1, 0.2, 0.3]]

    with patch("crystalos.lib.turn_publisher.asyncio") as mock_asyncio, \
         patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock(return_value=mock_embeddings)):
        await log_capability_gap(ctx, "Why can't I compare surveys?")
        mock_asyncio.create_task.assert_called_once()


@pytest.mark.asyncio
async def test_log_capability_gap_handles_embed_failure():
    """log_capability_gap handles embedding failures gracefully and still fires the task."""
    ctx = _make_ctx()

    with patch("crystalos.lib.turn_publisher.asyncio") as mock_asyncio, \
         patch("crystalos.tools.embeddings.embed_texts", new=AsyncMock(side_effect=RuntimeError("API down"))):
        # Should not raise
        await log_capability_gap(ctx, "some query")
        # Task still fires with embedding=None
        mock_asyncio.create_task.assert_called_once()
