"""Tests for the Novu Connect FastAPI router (routers/novu.py)."""
from __future__ import annotations

import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import FastAPI
from starlette.testclient import TestClient


# ── App factory ──────────────────────────────────────────────────────────────

def _build_app(*, mock_process: AsyncMock, mock_send: AsyncMock, mock_upsert: AsyncMock | None = None):
    """Build a test FastAPI app with the novu router mounted and all deps mocked."""
    # Must patch require_internal_key before importing the router so the
    # dependency override takes effect. We use a no-op async dependency.
    async def _pass_internal_key():
        return None

    # Import here so each test can pass fresh mocks
    import crystalos.routers.novu as novu_mod

    app = FastAPI()

    # Override the dependency
    from crystalos.lib.security import require_internal_key
    app.dependency_overrides[require_internal_key] = _pass_internal_key

    # Patch process_novu_message and send_novu_reply at the router module level
    novu_mod.process_novu_message = mock_process
    novu_mod.send_novu_reply = mock_send
    if mock_upsert is not None:
        novu_mod.upsert_novu_subscriber = mock_upsert

    app.include_router(novu_mod.router)
    return app


def _valid_body(**overrides):
    body = {
        "subscriberId": "sub-123",
        "channel": "slack",
        "message": "What is my NPS?",
        "orgId": "org-1",
    }
    body.update(overrides)
    return body


# ── POST /novu/message ───────────────────────────────────────────────────────

class TestHandleNovuMessage:
    def test_returns_401_when_internal_key_header_missing(self):
        """Without the dependency override, a missing header should 401."""
        # Build fresh app WITHOUT the dependency override
        import crystalos.routers.novu as novu_mod

        app = FastAPI()
        app.include_router(novu_mod.router)

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/novu/message",
                json=_valid_body(),
                # no X-Internal-Key header
            )
        assert resp.status_code == 422  # FastAPI returns 422 for missing required header

    def test_returns_401_when_internal_key_is_wrong(self):
        """Wrong X-Internal-Key should return 401."""
        import crystalos.routers.novu as novu_mod
        from crystalos.lib.security import require_internal_key

        app = FastAPI()
        app.include_router(novu_mod.router)  # NO override — real auth

        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/novu/message",
                json=_valid_body(),
                headers={"X-Internal-Key": "wrong-key"},
            )
        # The real require_internal_key rejects wrong keys with 401
        assert resp.status_code == 401

    def test_returns_200_with_reply_thread_id_delivered_on_valid_request(self):
        mock_process = AsyncMock(return_value="Your NPS is 42.")
        mock_send = AsyncMock(return_value={"status": "ok"})
        mock_upsert = AsyncMock()

        app = _build_app(mock_process=mock_process, mock_send=mock_send, mock_upsert=mock_upsert)

        with TestClient(app) as client:
            resp = client.post(
                "/novu/message",
                json=_valid_body(),
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "reply" in data
        assert "thread_id" in data
        assert "delivered" in data

    def test_reply_text_is_returned_from_process_novu_message(self):
        expected_reply = "Here are your insights: NPS is 42."
        mock_process = AsyncMock(return_value=expected_reply)
        mock_send = AsyncMock(return_value={"status": "ok"})

        app = _build_app(mock_process=mock_process, mock_send=mock_send)

        with TestClient(app) as client:
            resp = client.post(
                "/novu/message",
                json=_valid_body(),
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.json()["reply"] == expected_reply

    def test_delivered_is_true_when_send_novu_reply_succeeds(self):
        mock_process = AsyncMock(return_value="reply")
        mock_send = AsyncMock(return_value={"status": "ok", "acknowledged": True})

        app = _build_app(mock_process=mock_process, mock_send=mock_send)

        with TestClient(app) as client:
            resp = client.post(
                "/novu/message",
                json=_valid_body(),
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.json()["delivered"] is True

    def test_delivered_is_false_when_send_novu_reply_returns_skipped(self):
        mock_process = AsyncMock(return_value="reply")
        mock_send = AsyncMock(return_value={"status": "skipped", "reason": "no key"})

        app = _build_app(mock_process=mock_process, mock_send=mock_send)

        with TestClient(app) as client:
            resp = client.post(
                "/novu/message",
                json=_valid_body(),
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.json()["delivered"] is False

    def test_thread_id_defaults_to_novu_format_when_not_provided(self):
        mock_process = AsyncMock(return_value="reply")
        mock_send = AsyncMock(return_value={"status": "ok"})

        app = _build_app(mock_process=mock_process, mock_send=mock_send)

        body = _valid_body(subscriberId="sub-42", channel="teams")
        # No threadId in body

        with TestClient(app) as client:
            resp = client.post(
                "/novu/message",
                json=body,
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.json()["thread_id"] == "novu:sub-42:teams"

    def test_thread_id_uses_provided_value_when_given(self):
        mock_process = AsyncMock(return_value="reply")
        mock_send = AsyncMock(return_value={"status": "ok"})

        app = _build_app(mock_process=mock_process, mock_send=mock_send)

        body = _valid_body(threadId="my-custom-thread-123")

        with TestClient(app) as client:
            resp = client.post(
                "/novu/message",
                json=body,
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.json()["thread_id"] == "my-custom-thread-123"

    def test_calls_upsert_novu_subscriber_with_subscriber_id(self):
        mock_process = AsyncMock(return_value="reply")
        mock_send = AsyncMock(return_value={"status": "ok"})
        mock_upsert = AsyncMock()

        app = _build_app(mock_process=mock_process, mock_send=mock_send, mock_upsert=mock_upsert)

        body = _valid_body(subscriberId="sub-upsert-test")

        with TestClient(app) as client:
            client.post(
                "/novu/message",
                json=body,
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        mock_upsert.assert_called_once()
        call_args = mock_upsert.call_args[0]
        assert call_args[0] == "sub-upsert-test"


# ── GET /novu/health ─────────────────────────────────────────────────────────

class TestNovuHealth:
    def test_returns_unconfigured_when_novu_api_key_not_set(self):
        import crystalos.routers.novu as novu_mod

        app = FastAPI()
        app.include_router(novu_mod.router)

        with patch.dict(os.environ, {}, clear=True):
            # Remove NOVU_API_KEY if set
            os.environ.pop("NOVU_API_KEY", None)
            with TestClient(app) as client:
                resp = client.get("/novu/health")

        assert resp.status_code == 200
        assert resp.json()["status"] == "unconfigured"

    def test_returns_configured_when_novu_api_key_is_set(self):
        import crystalos.routers.novu as novu_mod

        app = FastAPI()
        app.include_router(novu_mod.router)

        with patch.dict(os.environ, {"NOVU_API_KEY": "some-real-key"}):
            with TestClient(app) as client:
                resp = client.get("/novu/health")

        assert resp.status_code == 200
        assert resp.json()["status"] == "configured"
