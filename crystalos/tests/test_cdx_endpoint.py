"""Tests for CDX developer experience endpoint.

Covers: production block, routing scores, skill name override, fallback.
All tests are offline — no LLM calls, no DB connections.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_skill_result(**kwargs):
    """Build a minimal SkillResult-like object."""
    from crystalos.lib.skill_runtime import SkillResult
    defaults = dict(
        output={"answer": "test"},
        eval_score=0.88,
        eval_passed=True,
        eval_issues=[],
        retried=False,
        skill_name="test-skill",
        skill_version="1.0.0",
        model="gpt-4o-mini",
        tokens_used=100,
        latency_ms=250.0,
    )
    defaults.update(kwargs)
    return SkillResult(**defaults)


def _make_app():
    """Build a minimal FastAPI app with the CDX router mounted."""
    from fastapi import FastAPI
    from crystalos.lib.cdx import router
    app = FastAPI()
    app.include_router(router)
    return app


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestCdxTestBlockedInProduction:
    """CDX test endpoint must return 403 in production."""

    def test_cdx_test_blocked_in_production(self):
        with patch("crystalos.lib.cdx.AGENTS_ENV", "production"):
            app = _make_app()
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/cdx/test",
                json={"query": "summarize NPS trends"},
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )
            assert resp.status_code == 403
            assert "disabled in production" in resp.json()["detail"]


class TestCdxTestReturnsRoutingScores:
    """CDX test returns routing scores for query."""

    def test_cdx_test_returns_routing_scores(self, tmp_path):
        # Create a minimal skill
        sd = tmp_path / "insight-narrator"
        sd.mkdir()
        (sd / "SKILL.md").write_text(
            "---\nname: insight-narrator\ndescription: Narrate insights from survey data\n---\nBody\n"
        )

        mock_result = _make_skill_result(skill_name="insight-narrator")

        with patch("crystalos.lib.cdx.AGENTS_ENV", "dev"), \
             patch("crystalos.lib.cdx.get_registry") as mock_reg, \
             patch("crystalos.lib.cdx.SkillRuntime") as mock_rt_cls:

            mock_registry = MagicMock()
            mock_registry.find_with_scores.return_value = [
                {"name": "insight-narrator", "score": 0.82},
                {"name": "nps-analyzer", "score": 0.61},
            ]
            mock_registry.get_skill_meta.return_value = {
                "name": "insight-narrator",
                "version": "1.0.0",
                "_body": "body",
                "_dir": str(sd),
            }
            mock_reg.return_value = mock_registry

            mock_runtime = MagicMock()
            mock_runtime.execute = AsyncMock(return_value=mock_result)
            mock_rt_cls.return_value = mock_runtime

            app = _make_app()
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/cdx/test",
                json={"query": "summarize NPS trends"},
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["routing"]) == 2
        assert data["routing"][0]["name"] == "insight-narrator"
        assert data["routing"][0]["score"] == 0.82
        assert data["skill_used"] == "insight-narrator"
        assert data["eval_score"] == 0.88


class TestCdxTestUsesSpecifiedSkillName:
    """When skill_name is provided, CDX bypasses routing and uses that skill directly."""

    def test_cdx_test_uses_specified_skill_name(self):
        mock_result = _make_skill_result(skill_name="nps-analyzer")

        with patch("crystalos.lib.cdx.AGENTS_ENV", "dev"), \
             patch("crystalos.lib.cdx.get_registry") as mock_reg, \
             patch("crystalos.lib.cdx.SkillRuntime") as mock_rt_cls:

            mock_registry = MagicMock()
            mock_registry.find_with_scores.return_value = [
                {"name": "insight-narrator", "score": 0.91},
            ]
            mock_registry.get_skill_meta.return_value = {
                "name": "nps-analyzer",
                "version": "1.0.0",
                "_body": "body",
                "_dir": "/tmp/nps",
            }
            mock_reg.return_value = mock_registry

            mock_runtime = MagicMock()
            mock_runtime.execute = AsyncMock(return_value=mock_result)
            mock_rt_cls.return_value = mock_runtime

            app = _make_app()
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/cdx/test",
                json={"query": "what is NPS trend", "skill_name": "nps-analyzer"},
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.status_code == 200
        data = resp.json()
        # skill_used is the requested skill, not routing top match
        assert data["skill_used"] == "nps-analyzer"
        # But routing scores are still returned
        assert len(data["routing"]) == 1

        # Verify meta was fetched for the specified skill
        mock_registry.get_skill_meta.assert_called_once_with("nps-analyzer")


class TestCdxTestFallsBackToTopMatch:
    """When no skill_name is specified, CDX uses the top routing match."""

    def test_cdx_test_falls_back_to_top_match(self):
        mock_result = _make_skill_result(skill_name="topic-clusterer")

        with patch("crystalos.lib.cdx.AGENTS_ENV", "dev"), \
             patch("crystalos.lib.cdx.get_registry") as mock_reg, \
             patch("crystalos.lib.cdx.SkillRuntime") as mock_rt_cls:

            mock_registry = MagicMock()
            mock_registry.find_with_scores.return_value = [
                {"name": "topic-clusterer", "score": 0.77},
                {"name": "insight-narrator", "score": 0.55},
            ]
            mock_registry.get_skill_meta.return_value = {
                "name": "topic-clusterer",
                "version": "1.0.0",
                "_body": "body",
                "_dir": "/tmp/tc",
            }
            mock_reg.return_value = mock_registry

            mock_runtime = MagicMock()
            mock_runtime.execute = AsyncMock(return_value=mock_result)
            mock_rt_cls.return_value = mock_runtime

            app = _make_app()
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(
                "/api/cdx/test",
                json={"query": "cluster topics"},
                headers={"X-Internal-Key": "dev-internal-key-change-in-prod"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["skill_used"] == "topic-clusterer"
        # write_example=False is passed for dev test runs
        mock_runtime.execute.assert_called_once()
        call_kwargs = mock_runtime.execute.call_args.kwargs
        assert call_kwargs.get("write_example") is False
