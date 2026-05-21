"""Unit tests for the insights pipeline graph nodes and signal helpers.

Tests cover:
  - extract_signals_from_response()
  - compute_survey_capability_flags()
  - node_embed / node_absa / node_cluster / node_topics guard paths (no open text)
  - _update_heartbeat()
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from agents.graphs.insights import (
    extract_signals_from_response,
    compute_survey_capability_flags,
    node_absa,
    node_embed,
    node_cluster,
    node_topics,
    node_narrate,
    _update_heartbeat,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_state(**kwargs):
    """Return a minimal InsightState dict for node tests."""
    defaults = {
        "survey_id": "s1",
        "org_id": "org-1",
        "run_id": "run-1",
        "trigger": "test",
        "survey": {"questions": []},
        "responses": [],
        "metrics": {},
        "open_texts": [],
        "embedded_texts": [],
        "absa_results": [],
        "clusters": [],
        "topics": [],
        "drivers": [],
        "stream_events": [],
        "insights": [],
        "errors": [],
        "has_open_text": True,
        "has_nps": False,
        "has_csat": False,
        "has_ces": False,
        "is_bootstrap": True,
        "new_response_ids": set(),
        "survey_questions": [],
    }
    defaults.update(kwargs)
    return defaults


# ── TestExtractSignals ────────────────────────────────────────────────────────

class TestExtractSignals:
    """Tests for extract_signals_from_response()."""

    def _make_args(self, answers, questions):
        return answers, questions

    def test_nps_question_extracts_nps_score(self):
        """NPS question value '9' → signals['nps_score'] == 9."""
        answers = [{"questionId": "q1", "value": "9"}]
        questions = [{"id": "q1", "type": "nps"}]
        result = extract_signals_from_response(answers, questions)
        assert result.get("nps_score") == 9

    def test_csat_extracts_float(self):
        """CSAT question value '4.5' → signals['csat_score'] == 4.5."""
        answers = [{"questionId": "q1", "value": "4.5"}]
        questions = [{"id": "q1", "type": "csat"}]
        result = extract_signals_from_response(answers, questions)
        assert result.get("csat_score") == 4.5

    def test_ces_extracts_float(self):
        """CES question value '3' → signals['ces_score'] == 3.0."""
        answers = [{"questionId": "q1", "value": "3"}]
        questions = [{"id": "q1", "type": "ces"}]
        result = extract_signals_from_response(answers, questions)
        assert result.get("ces_score") == 3.0

    def test_open_text_extracted_as_list(self):
        """Text question value → signals['open_text'] == ['Great product']."""
        answers = [{"questionId": "q1", "value": "Great product"}]
        questions = [{"id": "q1", "type": "text"}]
        result = extract_signals_from_response(answers, questions)
        assert result.get("open_text") == ["Great product"]

    def test_multiple_open_text_accumulated(self):
        """Two text answers → signals['open_text'] contains both."""
        answers = [
            {"questionId": "q1", "value": "text1"},
            {"questionId": "q2", "value": "text2"},
        ]
        questions = [
            {"id": "q1", "type": "text"},
            {"id": "q2", "type": "text"},
        ]
        result = extract_signals_from_response(answers, questions)
        assert result.get("open_text") == ["text1", "text2"]

    def test_short_text_still_extracted(self):
        """Empty string value is NOT added to open_text (falsy guard in the code)."""
        answers = [{"questionId": "q1", "value": ""}]
        questions = [{"id": "q1", "type": "text"}]
        result = extract_signals_from_response(answers, questions)
        # Empty string stripped → falsy → not added
        assert "open_text" not in result

    def test_boolean_extracted(self):
        """Boolean question type → signals['boolean_value'] == True."""
        answers = [{"questionId": "q1", "value": True}]
        questions = [{"id": "q1", "type": "boolean"}]
        result = extract_signals_from_response(answers, questions)
        assert result.get("boolean_value") is True

    def test_multiple_choice_extracted(self):
        """Multiple choice question → signals['selected_option'] == 'option_a'."""
        answers = [{"questionId": "q1", "value": "option_a"}]
        questions = [{"id": "q1", "type": "multiple_choice"}]
        result = extract_signals_from_response(answers, questions)
        assert result.get("selected_option") == "option_a"

    def test_unknown_question_type_skipped(self):
        """Unknown question type → empty signals dict."""
        answers = [{"questionId": "q1", "value": "something"}]
        questions = [{"id": "q1", "type": "unknown_type"}]
        result = extract_signals_from_response(answers, questions)
        assert result == {}

    def test_missing_question_id_skipped(self):
        """Answer with no questionId → empty signals dict."""
        answers = [{"value": "something"}]
        questions = [{"id": "q1", "type": "nps"}]
        result = extract_signals_from_response(answers, questions)
        assert result == {}


# ── TestComputeCapabilityFlags ────────────────────────────────────────────────

class TestComputeCapabilityFlags:
    """Tests for compute_survey_capability_flags()."""

    def test_nps_only_survey(self):
        """NPS-only survey → has_nps=True, has_open_text=False."""
        questions = [{"id": "q1", "type": "nps"}]
        flags = compute_survey_capability_flags(questions)
        assert flags["has_nps"] is True
        assert flags["has_open_text"] is False

    def test_text_question_sets_has_open_text(self):
        """A 'text' question sets has_open_text=True."""
        questions = [{"id": "q1", "type": "text"}]
        flags = compute_survey_capability_flags(questions)
        assert flags["has_open_text"] is True

    def test_textarea_sets_has_open_text(self):
        """A 'textarea' question also sets has_open_text=True."""
        questions = [{"id": "q1", "type": "textarea"}]
        flags = compute_survey_capability_flags(questions)
        assert flags["has_open_text"] is True

    def test_mixed_survey(self):
        """Survey with nps + csat + text → all three flags True."""
        questions = [
            {"id": "q1", "type": "nps"},
            {"id": "q2", "type": "csat"},
            {"id": "q3", "type": "text"},
        ]
        flags = compute_survey_capability_flags(questions)
        assert flags["has_nps"] is True
        assert flags["has_csat"] is True
        assert flags["has_open_text"] is True

    def test_rating_only_no_open_text(self):
        """Rating-only survey → has_open_text=False, has_ratings=True."""
        questions = [{"id": "q1", "type": "rating"}]
        flags = compute_survey_capability_flags(questions)
        assert flags["has_open_text"] is False
        assert flags["has_ratings"] is True

    def test_empty_questions(self):
        """Empty questions list → all flags False."""
        flags = compute_survey_capability_flags([])
        assert flags["has_nps"] is False
        assert flags["has_csat"] is False
        assert flags["has_ces"] is False
        assert flags["has_open_text"] is False
        assert flags["has_ratings"] is False


# ── TestNoTextGuards ──────────────────────────────────────────────────────────

class TestNoTextGuards:
    """Tests that pipeline nodes skip text processing when has_open_text=False."""

    @pytest.mark.asyncio
    async def test_node_embed_skips_when_no_open_text(self):
        """node_embed returns empty embedded_texts when has_open_text=False."""
        state = _make_state(has_open_text=False, responses=[{"nps_score": 9}])

        with (
            patch("agents.graphs.insights._update_heartbeat", new=AsyncMock()),
            patch("agents.graphs.insights._emit_event", new=AsyncMock()),
        ):
            result = await node_embed(state)

        assert result.get("embedded_texts") == [] or result["embedded_texts"] == []

    @pytest.mark.asyncio
    async def test_node_absa_skips_when_no_open_text(self):
        """node_absa returns empty absa_results when has_open_text=False."""
        state = _make_state(
            has_open_text=False,
            open_texts=[{"text": "Some text", "response_id": "r1", "question_id": "q1"}],
        )

        with (
            patch("agents.graphs.insights._update_heartbeat", new=AsyncMock()),
            patch("agents.graphs.insights._emit_event", new=AsyncMock()),
        ):
            result = await node_absa(state)

        assert result.get("absa_results") == []

    @pytest.mark.asyncio
    async def test_node_cluster_skips_when_no_open_text(self):
        """node_cluster returns empty clusters when has_open_text=False."""
        state = _make_state(
            has_open_text=False,
            open_texts=[{"text": "Some text", "response_id": "r1", "question_id": "q1"}],
            embedded_texts=[],
        )

        with (
            patch("agents.graphs.insights._update_heartbeat", new=AsyncMock()),
            patch("agents.graphs.insights._emit_event", new=AsyncMock()),
        ):
            result = await node_cluster(state)

        assert result.get("clusters") == []

    @pytest.mark.asyncio
    async def test_node_topics_skips_when_no_open_text(self):
        """node_topics returns empty topics when has_open_text=False."""
        state = _make_state(
            has_open_text=False,
            clusters=[{"name": "Shipping", "size": 10}],
        )

        with (
            patch("agents.graphs.insights._update_heartbeat", new=AsyncMock()),
            patch("agents.graphs.insights._emit_event", new=AsyncMock()),
        ):
            result = await node_topics(state)

        assert result.get("topics") == []


# ── TestHeartbeat ─────────────────────────────────────────────────────────────

class TestHeartbeat:
    """Tests for _update_heartbeat()."""

    @pytest.mark.asyncio
    async def test_update_heartbeat_calls_db(self):
        """_update_heartbeat executes an UPDATE SQL for the given run_id."""
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)

        mock_pool_ctx = MagicMock()
        mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(return_value=mock_pool_ctx)

        with patch("agents.graphs.insights.db._pool_conn", return_value=mock_pool):
            await _update_heartbeat("run-123")

        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args[0]
        assert "UPDATE agent_runs" in call_args[0]
        assert "run-123" in call_args[1]

    @pytest.mark.asyncio
    async def test_update_heartbeat_never_raises(self):
        """_update_heartbeat swallows exceptions — never propagates."""
        mock_pool = MagicMock()
        mock_pool.connection = MagicMock(side_effect=Exception("DB totally down"))

        with patch("agents.graphs.insights.db._pool_conn", return_value=mock_pool):
            # Should not raise even if DB is unavailable
            await _update_heartbeat("run-xyz")
