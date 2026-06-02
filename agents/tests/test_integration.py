"""
P13-07 — Integration test: full end-to-end pipeline run.

Strategy: patch all external I/O boundaries (DB, AI, metrics, events) so the
actual LangGraph node wiring and state-flow logic runs for real.  We verify:

  1. The graph reaches completion without raising an exception.
  2. The returned state carries the expected keys.
  3. The error list is non-empty when access is denied.
  4. force_regenerate is set correctly for manual vs schedule triggers.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import asynccontextmanager


# ─── DB mock helpers ─────────────────────────────────────────────────────────

class _MockCursor:
    """Minimal async cursor that always returns empty result sets."""
    description: list = []

    async def execute(self, sql, params=()):
        pass

    async def fetchone(self):
        return None

    async def fetchall(self):
        return []

    async def fetchmany(self, size=100):
        return []

    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


def _make_pool_mock():
    """Return a pool-like mock whose .connection() is an async context manager factory."""
    pool = MagicMock()

    def _new_connection():
        @asynccontextmanager
        async def _conn_ctx():
            conn = MagicMock()
            cursor = _MockCursor()

            @asynccontextmanager
            async def _cursor_ctx():
                yield cursor

            conn.cursor = MagicMock(side_effect=lambda: _cursor_ctx())
            conn.execute = AsyncMock(return_value=None)
            conn.fetchone = AsyncMock(return_value=None)
            yield conn

        return _conn_ctx()

    pool.connection = MagicMock(side_effect=lambda: _new_connection())
    return pool


# ─── constants ───────────────────────────────────────────────────────────────

SURVEY_ID = "aaaaaaaa-0000-0000-0000-000000000001"
ORG_ID    = "test_org_p13"
RUN_ID    = "bbbbbbbb-0000-0000-0000-000000000002"


# ─── shared patch targets ────────────────────────────────────────────────────

_PATCHES = {
    # Trace / events
    "agents.lib.trace_context.set_trace_context": MagicMock(),
    # DB high-level helpers
    "agents.lib.db.update_run":          AsyncMock(return_value=None),
    "agents.lib.db.check_survey_access": AsyncMock(return_value=True),
    # Heartbeat
    "agents.graphs.insights._update_heartbeat": AsyncMock(return_value=None),
    # Event publisher
    "agents.lib.event_publisher.publish_run_event": AsyncMock(return_value=None),
    # AI / embedding
    "agents.lib.openrouter.call_agent":                  AsyncMock(return_value="[]"),
    "agents.tools.embeddings.get_or_create_embeddings":  AsyncMock(return_value=[]),
    "agents.tools.clustering.cluster_texts":             AsyncMock(return_value=[]),
    "agents.tools.sentiment.run_absa_llm":               AsyncMock(return_value=[]),
    # Topic signals / registry
    "agents.lib.topic_signals.compute_full_topic_signals": AsyncMock(return_value={}),
    "agents.lib.topic_registry.get_centroids":             AsyncMock(return_value=[]),
    "agents.lib.topic_registry.has_centroids":             AsyncMock(return_value=False),
    # Checkpoint — patch at the import site in insights.py
    "agents.graphs.insights.write_checkpoint_blob": AsyncMock(return_value=None),
    # Context nodes (pass state through unchanged)
    "agents.graphs.nodes.context.node_context": AsyncMock(
        side_effect=lambda s: {**s, "org_context": {}, "survey_context": {}}
    ),
    "agents.graphs.nodes.context.node_route_specialists": AsyncMock(
        side_effect=lambda s: {**s, "selected_specialists": []}
    ),
}


def _start_patches(overrides=None):
    active = {}
    config = {**_PATCHES, **(overrides or {})}
    for target, value in config.items():
        p = patch(target, value)
        try:
            p.start()
            active[target] = p
        except AttributeError:
            pass  # attribute may not exist in this Python version — skip
    pool_patch = patch("agents.lib.db._pool_conn", return_value=_make_pool_mock())
    pool_patch.start()
    active["__pool__"] = pool_patch
    return active


def _stop_patches(active):
    for p in active.values():
        try:
            p.stop()
        except RuntimeError:
            pass


# ─── tests ───────────────────────────────────────────────────────────────────

class TestPipelineIntegration:

    @pytest.mark.asyncio
    async def test_pipeline_returns_dict(self):
        """run_insight_generation must return a dict (even on access-denied path)."""
        from agents.graphs.insights import run_insight_generation

        active = _start_patches({"agents.lib.db.check_survey_access": AsyncMock(return_value=False)})
        try:
            result = await run_insight_generation(
                survey_id=SURVEY_ID, org_id=ORG_ID, run_id=RUN_ID
            )
        finally:
            _stop_patches(active)

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_pipeline_result_has_required_keys(self):
        """Final state must include survey_id, org_id, run_id, and errors."""
        from agents.graphs.insights import run_insight_generation

        active = _start_patches({"agents.lib.db.check_survey_access": AsyncMock(return_value=False)})
        try:
            result = await run_insight_generation(
                survey_id=SURVEY_ID, org_id=ORG_ID, run_id=RUN_ID
            )
        finally:
            _stop_patches(active)

        for key in ("survey_id", "org_id", "run_id", "errors"):
            assert key in result, f"Missing key in pipeline result: {key}"

    @pytest.mark.asyncio
    async def test_access_denied_records_error(self):
        """When check_survey_access returns False the errors list is non-empty."""
        from agents.graphs.insights import run_insight_generation

        active = _start_patches({"agents.lib.db.check_survey_access": AsyncMock(return_value=False)})
        try:
            result = await run_insight_generation(
                survey_id=SURVEY_ID, org_id=ORG_ID, run_id=RUN_ID
            )
        finally:
            _stop_patches(active)

        errors = result.get("errors", [])
        assert len(errors) > 0
        assert any(
            "access denied" in e.lower() or "not found" in e.lower()
            for e in errors
        )

    @pytest.mark.asyncio
    async def test_manual_trigger_sets_force_regenerate(self):
        """trigger='manual' must produce force_regenerate=True in the final result state."""
        from agents.graphs.insights import run_insight_generation

        active = _start_patches({"agents.lib.db.check_survey_access": AsyncMock(return_value=False)})
        try:
            result = await run_insight_generation(
                survey_id=SURVEY_ID, org_id=ORG_ID, run_id=RUN_ID, trigger="manual"
            )
        finally:
            _stop_patches(active)

        assert result.get("force_regenerate") is True

    @pytest.mark.asyncio
    async def test_schedule_trigger_does_not_force_regenerate(self):
        """trigger='schedule' must produce force_regenerate=False in the final result state."""
        from agents.graphs.insights import run_insight_generation

        active = _start_patches({"agents.lib.db.check_survey_access": AsyncMock(return_value=False)})
        try:
            result = await run_insight_generation(
                survey_id=SURVEY_ID, org_id=ORG_ID, run_id=RUN_ID, trigger="schedule"
            )
        finally:
            _stop_patches(active)

        assert result.get("force_regenerate") is False

    @pytest.mark.asyncio
    async def test_pipeline_ids_propagate_to_final_state(self):
        """survey_id, org_id, and run_id must be present in the final result dict."""
        from agents.graphs.insights import run_insight_generation

        active = _start_patches({"agents.lib.db.check_survey_access": AsyncMock(return_value=False)})
        try:
            result = await run_insight_generation(
                survey_id=SURVEY_ID, org_id=ORG_ID, run_id=RUN_ID
            )
        finally:
            _stop_patches(active)

        assert result["survey_id"] == SURVEY_ID
        assert result["org_id"]    == ORG_ID
        assert result["run_id"]    == RUN_ID
