"""Tests for Phase 5 feedback endpoints.

Covers:
  - POST /api/crystal/feedback (valid/invalid signals, quality regression detection)
  - GET  /api/brands/{brand_id}/signals (requires brand_admin, paginated)
  - GET  /api/brands/{brand_id}/signals/summary
  - POST /api/brands/{brand_id}/signals/{id}/status (valid and invalid transitions)
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# App fixture
# ---------------------------------------------------------------------------

@pytest.fixture()
def app():
    """Minimal FastAPI app with only the feedback + brand_admin routers."""
    from fastapi import FastAPI
    _app = FastAPI()

    with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"):
        from crystalos.routers.feedback import router as feedback_router
        from crystalos.routers.brand_admin import router as brand_admin_router
        _app.include_router(feedback_router)
        _app.include_router(brand_admin_router)

    return _app


@pytest.fixture()
def client(app):
    return TestClient(app, raise_server_exceptions=True)


def _headers() -> dict[str, str]:
    return {"X-Internal-Key": "test-key"}


# ---------------------------------------------------------------------------
# Mock DB helper
# ---------------------------------------------------------------------------

def _make_mock_pool(fetchone_return=None, fetchall_return=None):
    mock_cur = AsyncMock()
    mock_cur.execute = AsyncMock()
    mock_cur.fetchone = AsyncMock(return_value=fetchone_return)
    mock_cur.fetchall = AsyncMock(return_value=fetchall_return or [])
    mock_cur.description = []
    mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_cur.__aexit__ = AsyncMock(return_value=False)

    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_conn.cursor = MagicMock(return_value=mock_cur)
    mock_conn.commit = AsyncMock()
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.connection = MagicMock(return_value=mock_conn)
    return mock_pool, mock_conn, mock_cur


# ---------------------------------------------------------------------------
# POST /api/crystal/feedback
# ---------------------------------------------------------------------------

class TestPostCrystalFeedback:
    def _post(self, client, payload):
        return client.post(
            "/api/crystal/feedback",
            json=payload,
            headers=_headers(),
        )

    def _valid_payload(self, signal=1):
        return {
            "turn_event_id": "00000000-0000-0000-0000-000000000001",
            "org_id":        "org-abc",
            "user_id":       "user-1",
            "signal":        signal,
        }

    def test_post_feedback_valid_thumbs_up(self, client):
        mock_pool, mock_conn, mock_cur = _make_mock_pool(fetchone_return=(0,))
        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.feedback._pool_conn", return_value=mock_pool):
            resp = self._post(client, self._valid_payload(signal=1))

        assert resp.status_code == 200
        assert resp.json() == {"status": "recorded"}

    def test_post_feedback_valid_thumbs_down(self, client):
        mock_pool, mock_conn, mock_cur = _make_mock_pool(fetchone_return=(1,))
        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.feedback._pool_conn", return_value=mock_pool):
            resp = self._post(client, self._valid_payload(signal=-1))

        assert resp.status_code == 200
        assert resp.json() == {"status": "recorded"}

    def test_post_feedback_invalid_signal_rejects(self, client):
        """signal=0 must be rejected with HTTP 422 (Pydantic field_validator)."""
        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"):
            resp = self._post(client, self._valid_payload(signal=0))

        assert resp.status_code == 422
        assert "detail" in resp.json()

    def test_post_feedback_three_negatives_flags_regression(self, client):
        """When cumulative negative count >= 3, _flag_quality_regression is called."""
        mock_pool, mock_conn, mock_cur = _make_mock_pool(fetchone_return=(3,))
        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.feedback._pool_conn", return_value=mock_pool), \
             patch("crystalos.routers.feedback._flag_quality_regression",
                   new_callable=AsyncMock) as mock_flag:
            resp = self._post(client, self._valid_payload(signal=-1))

        assert resp.status_code == 200
        mock_flag.assert_awaited_once()
        assert mock_flag.call_args[0][0] == "org-abc"  # first arg is org_id


# ---------------------------------------------------------------------------
# GET /api/brands/{brand_id}/signals
# ---------------------------------------------------------------------------

class TestGetBrandSignals:
    def test_get_brand_signals_requires_brand_admin(self, client):
        """fetchone returns None → role not found → 403."""
        mock_pool, _, _ = _make_mock_pool(fetchone_return=None)
        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.brand_admin._pool_conn", return_value=mock_pool):
            resp = client.get(
                "/api/admin/brands/brand-1/signals?user_id=user-xyz",
                headers=_headers(),
            )

        assert resp.status_code == 403

    def test_get_brand_signals_returns_paginated(self, client):
        """With brand_admin role, returns paginated signals list."""
        from datetime import datetime, timezone
        fake_dt = datetime(2026, 1, 1, tzinfo=timezone.utc)

        call_n = {"n": 0}
        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()

        async def _fetchone():
            call_n["n"] += 1
            return (1,) if call_n["n"] == 1 else None

        async def _fetchall():
            return [("sig-1", "feature_request", "Add export", "Desc",
                     "exports", "high", "open", 5, fake_dt)]

        mock_cur.fetchone   = AsyncMock(side_effect=_fetchone)
        mock_cur.fetchall   = AsyncMock(side_effect=_fetchall)
        mock_cur.description = [
            ("id",), ("signal_type",), ("title",), ("description",),
            ("affects_feature",), ("severity",), ("status",), ("vote_count",), ("created_at",),
        ]
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__  = AsyncMock(return_value=False)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.cursor  = MagicMock(return_value=mock_cur)
        mock_conn.commit  = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__  = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_conn)

        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.brand_admin._pool_conn", return_value=mock_pool):
            resp = client.get(
                "/api/admin/brands/brand-1/signals?user_id=admin-user&limit=10&offset=0",
                headers=_headers(),
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["limit"] == 10
        assert len(body["signals"]) == 1
        assert body["signals"][0]["id"] == "sig-1"


# ---------------------------------------------------------------------------
# GET /api/brands/{brand_id}/signals/summary
# ---------------------------------------------------------------------------

class TestGetBrandSignalsSummary:
    def test_get_brand_signals_summary_counts(self, client):
        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()
        mock_cur.fetchone = AsyncMock(return_value=(1,))  # admin check passes
        mock_cur.fetchall = AsyncMock(return_value=[
            ("feature_request", "high",    "exports", 3),
            ("bug",             "critical", "crystal", 2),
            ("bug",             "high",     "crystal", 1),
        ])
        mock_cur.description = []
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__  = AsyncMock(return_value=False)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.cursor  = MagicMock(return_value=mock_cur)
        mock_conn.commit  = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__  = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_conn)

        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.brand_admin._pool_conn", return_value=mock_pool):
            resp = client.get(
                "/api/admin/brands/brand-1/signals/summary?user_id=admin-user",
                headers=_headers(),
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 6
        assert body["by_type"]["feature_request"] == 3
        assert body["by_type"]["bug"] == 3
        assert body["by_severity"]["critical"] == 2
        assert body["by_feature"]["exports"] == 3


# ---------------------------------------------------------------------------
# POST /api/brands/{brand_id}/signals/{signal_id}/status
# ---------------------------------------------------------------------------

class TestPostSignalStatus:
    def _post_status(self, client, signal_id, new_status):
        return client.patch(
            f"/api/admin/brands/brand-1/signals/{signal_id}/status?user_id=admin-user",
            json={"status": new_status},
            headers=_headers(),
        )

    def _pool_with_status(self, current_status: str):
        call_n = {"n": 0}
        mock_cur = AsyncMock()
        mock_cur.execute = AsyncMock()

        async def _fetchone():
            call_n["n"] += 1
            if call_n["n"] == 1:
                return (1,)                  # admin role found
            return (current_status,)          # signal current status

        mock_cur.fetchone   = AsyncMock(side_effect=_fetchone)
        mock_cur.description = []
        mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
        mock_cur.__aexit__  = AsyncMock(return_value=False)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.cursor  = MagicMock(return_value=mock_cur)
        mock_conn.commit  = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__  = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_conn)
        return mock_pool

    def test_post_signal_status_valid_transition(self, client):
        """open → in_progress is a valid forward transition."""
        mock_pool = self._pool_with_status("open")
        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.brand_admin._pool_conn", return_value=mock_pool):
            resp = self._post_status(client, "sig-1", "in_progress")

        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_post_signal_status_invalid_transition_rejected(self, client):
        """open → resolved skips in_progress — must be rejected with 400."""
        mock_pool = self._pool_with_status("open")
        with patch("crystalos.lib.security._INTERNAL_KEY", "test-key"), \
             patch("crystalos.routers.brand_admin._pool_conn", return_value=mock_pool):
            resp = self._post_status(client, "sig-1", "resolved")

        assert resp.status_code == 400
        assert "Invalid transition" in resp.json()["detail"]
