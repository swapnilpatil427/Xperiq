"""Unit tests for lib/feedback_detector.py — FeedbackDetector signal extraction."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from crystalos.crystal.context import BrandContext, CrystalContext
from crystalos.lib.feedback_detector import (
    ProductSignal,
    _BUG_PATTERNS,
    _FEATURE_PATTERNS,
    _quick_classify,
    _determine_routing,
    detect_and_route_signal,
    persist_signal,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_brand(support_url: str | None = "https://marriott.atlassian.net/servicedesk") -> BrandContext:
    return BrandContext(
        brand_id="brand-001",
        brand_name="Marriott Hotels",
        brand_persona=None,
        data_region="us",
        plan_tier="enterprise",
        permitted_features=frozenset(["data:export"]),
        restricted_features=frozenset(),
        custom_instructions=None,
        support_ticket_url=support_url,
        feature_request_url=None,
    )


def _make_ctx(brand: BrandContext | None = None) -> CrystalContext:
    return CrystalContext(
        org_id="org-123",
        user_id="user-456",
        survey_id="survey-789",
        scope="survey",
        brand=brand,
    )


def _make_signal(**kwargs) -> ProductSignal:
    defaults = dict(
        signal_type="bug",
        title="Data not loading",
        description="The trend chart shows wrong data",
        affects_feature="trends",
        severity="high",
        routing="platform",
        brand_ticket_url=None,
        raw_query="the trend chart is showing wrong data",
    )
    defaults.update(kwargs)
    return ProductSignal(**defaults)


# ---------------------------------------------------------------------------
# _quick_classify — bug patterns
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("phrase", [
    "there's a bug in the chart",
    "the dashboard is broken",
    "the widget is not working",
    "I keep getting an error message",
    "app keeps crashing on export",
    "it's showing wrong data",
    "wrong data after import",
    "incorrect data in the table",
])
def test_quick_classify_bug_patterns(phrase: str):
    assert _quick_classify(phrase) == "bug"


# ---------------------------------------------------------------------------
# _quick_classify — feature patterns
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("phrase", [
    "I wish we could export to PDF",
    "it would be great if you added dark mode",
    "can you add a team notifications feature?",
    "this is a feature request: custom branding",
    "I need the ability to schedule reports",
    "it would be nice to have SSO",
    "please add API rate limit visibility",
    "the export is missing a column",
    "the app doesn't support multi-language",
    "I can't do bulk operations",
])
def test_quick_classify_feature_patterns(phrase: str):
    assert _quick_classify(phrase) == "feature_request"


# ---------------------------------------------------------------------------
# _quick_classify — neutral returns None
# ---------------------------------------------------------------------------

def test_quick_classify_neutral_returns_none():
    assert _quick_classify("What is the NPS for last month?") is None
    assert _quick_classify("Show me a breakdown by segment") is None
    assert _quick_classify("") is None


# ---------------------------------------------------------------------------
# _determine_routing
# ---------------------------------------------------------------------------

def test_determine_routing_brand_has_url_routes_to_brand():
    ctx = _make_ctx(brand=_make_brand(support_url="https://brand.com/support"))
    assert _determine_routing("bug", ctx) == "brand"


def test_determine_routing_feature_routes_to_platform_even_with_brand():
    """Feature requests always route to Experient, not brand support."""
    ctx = _make_ctx(brand=_make_brand(support_url="https://brand.com/support"))
    assert _determine_routing("feature_request", ctx) == "platform"


def test_determine_routing_no_brand_routes_to_platform():
    ctx = _make_ctx(brand=None)
    assert _determine_routing("bug", ctx) == "platform"
    assert _determine_routing("feature_request", ctx) == "platform"


def test_determine_routing_brand_without_support_url_routes_to_platform():
    ctx = _make_ctx(brand=_make_brand(support_url=None))
    assert _determine_routing("bug", ctx) == "platform"


# ---------------------------------------------------------------------------
# detect_and_route_signal — neutral returns None (mocked LLM)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_detect_and_route_returns_none_for_neutral():
    """Neutral queries do not trigger LLM — _quick_classify returns None early."""
    ctx = _make_ctx()
    with patch("crystalos.lib.feedback_detector._llm_extract_signal") as mock_call:
        result = await detect_and_route_signal("What is the NPS trend?", ctx)
    # LLM should NOT be called for neutral queries
    mock_call.assert_not_called()
    assert result is None


# ---------------------------------------------------------------------------
# detect_and_route_signal — extracts bug (mocked LLM returns JSON)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_detect_and_route_extracts_bug():
    ctx = _make_ctx()
    extracted = {
        "title": "Trend chart shows wrong data",
        "description": "The NPS trend chart does not match the raw export",
        "affects_feature": "trends",
        "severity": "high",
    }

    with patch(
        "crystalos.lib.feedback_detector._llm_extract_signal",
        new=AsyncMock(return_value=extracted),
    ):
        result = await detect_and_route_signal("the trend chart is showing wrong data", ctx)

    assert result is not None
    assert result.signal_type == "bug"
    assert result.title == "Trend chart shows wrong data"
    assert result.severity == "high"
    assert result.routing == "platform"  # no brand


@pytest.mark.asyncio
async def test_detect_and_route_extracts_feature_request():
    ctx = _make_ctx()
    extracted = {
        "title": "PDF export for reports",
        "description": "User wants to export Crystal reports as PDF",
        "affects_feature": "export",
        "severity": "medium",
    }

    with patch(
        "crystalos.lib.feedback_detector._llm_extract_signal",
        new=AsyncMock(return_value=extracted),
    ):
        result = await detect_and_route_signal("I wish I could export my Crystal reports as PDF", ctx)

    assert result is not None
    assert result.signal_type == "feature_request"
    assert result.title == "PDF export for reports"


@pytest.mark.asyncio
async def test_detect_and_route_returns_none_on_llm_json_error():
    """When LLM returns malformed JSON, detect_and_route returns None gracefully."""
    ctx = _make_ctx()

    with patch(
        "crystalos.lib.feedback_detector._llm_extract_signal",
        new=AsyncMock(side_effect=Exception("bad json")),
    ):
        result = await detect_and_route_signal("the chart is broken", ctx)

    assert result is None


# ---------------------------------------------------------------------------
# persist_signal — dedup increments vote_count
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_persist_signal_dedup_increments_vote_count():
    """When a signal with the same hash already exists, vote_count is incremented."""
    ctx = _make_ctx()
    signal = _make_signal(signal_type="feature_request")

    # Simulate existing row with the same hash
    mock_existing_id = "existing-uuid-001"
    mock_cur = AsyncMock()
    mock_cur.fetchone = AsyncMock(return_value=(mock_existing_id, "feature_request"))

    mock_conn = AsyncMock()
    mock_conn.cursor = MagicMock(return_value=MagicMock(
        __aenter__=AsyncMock(return_value=mock_cur),
        __aexit__=AsyncMock(return_value=False),
    ))
    mock_conn.execute = AsyncMock()
    mock_conn.commit = AsyncMock()

    mock_conn_cm = MagicMock()
    mock_conn_cm.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn_cm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.connection = MagicMock(return_value=mock_conn_cm)

    with patch("crystalos.lib.feedback_detector._pool_conn", return_value=mock_pool):
        await persist_signal(signal, ctx)

    # Should call UPDATE vote_count, not INSERT
    update_calls = [
        call for call in mock_conn.execute.call_args_list
        if "vote_count" in str(call)
    ]
    assert len(update_calls) == 1


@pytest.mark.asyncio
async def test_persist_signal_new_inserts_row():
    """When no existing signal with the same hash, a new row is inserted."""
    ctx = _make_ctx()
    signal = _make_signal()

    # Simulate no existing row
    mock_cur = AsyncMock()
    mock_cur.fetchone = AsyncMock(return_value=None)

    mock_conn = AsyncMock()
    mock_conn.cursor = MagicMock(return_value=MagicMock(
        __aenter__=AsyncMock(return_value=mock_cur),
        __aexit__=AsyncMock(return_value=False),
    ))
    mock_conn.execute = AsyncMock()
    mock_conn.commit = AsyncMock()

    mock_conn_cm = MagicMock()
    mock_conn_cm.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn_cm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.connection = MagicMock(return_value=mock_conn_cm)

    with patch("crystalos.lib.feedback_detector._pool_conn", return_value=mock_pool):
        await persist_signal(signal, ctx)

    # Should call INSERT via cursor.execute
    all_execute_calls = list(mock_cur.execute.call_args_list) + list(mock_conn.execute.call_args_list)
    insert_calls = [c for c in all_execute_calls if "INSERT" in str(c)]
    assert len(insert_calls) >= 1


@pytest.mark.asyncio
async def test_persist_signal_never_raises_on_db_error():
    """persist_signal swallows DB errors — never raises."""
    ctx = _make_ctx()
    signal = _make_signal()

    with patch("crystalos.lib.feedback_detector._pool_conn", side_effect=RuntimeError("DB down")):
        # Should not raise
        await persist_signal(signal, ctx)
