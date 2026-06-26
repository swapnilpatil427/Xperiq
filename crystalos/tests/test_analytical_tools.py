"""Tests for the analytical-skill bridge tools and segment helpers in crystal/tools.py.

The wrappers fetch data then delegate to a CrystalOS skill via the skill runtime.
We isolate the input-shaping logic by patching the lower-level fetchers and _run_skill.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from crystalos.crystal.context import CrystalContext
import crystalos.crystal.tools as tools


def _ctx():
    return CrystalContext(org_id="org-1", user_id="u-1", survey_id="s-1", scope="survey")


def _make_mock_pool(fetchone_return=None, fetchall_return=None):
    mock_cur = AsyncMock()
    mock_cur.execute = AsyncMock()
    mock_cur.fetchone = AsyncMock(return_value=fetchone_return)
    mock_cur.fetchall = AsyncMock(return_value=fetchall_return or [])
    mock_cur.description = []
    mock_cur.__aenter__ = AsyncMock(return_value=mock_cur)
    mock_cur.__aexit__ = AsyncMock(return_value=False)
    mock_conn = AsyncMock()
    mock_conn.cursor = MagicMock(return_value=mock_cur)
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=False)
    mock_pool_ctx = MagicMock()
    mock_pool_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool = MagicMock()
    mock_pool.connection = MagicMock(return_value=mock_pool_ctx)
    return mock_pool, mock_cur


# ── list_segmentable_questions ────────────────────────────────────────────────

class TestListSegmentableQuestions:
    @pytest.mark.asyncio
    async def test_filters_to_segmentable_types(self):
        questions = [
            {"id": "q1", "type": "dropdown", "question": "Region?"},
            {"id": "q2", "type": "open_text", "question": "Comments?"},
            {"id": "q3", "type": "nps", "question": "Recommend?"},
            {"id": "q4", "type": "statement", "question": "Thanks"},
        ]
        pool, _ = _make_mock_pool(fetchone_return=(questions,))
        with patch("crystalos.crystal.tools.db._pool_conn", return_value=pool):
            result = await tools.execute_list_segmentable_questions(_ctx(), {"survey_id": "s-1"})
        ids = {q["id"] for q in result["questions"]}
        assert ids == {"q1", "q3"}          # dropdown + nps, not open_text/statement
        assert result["count"] == 2

    @pytest.mark.asyncio
    async def test_missing_survey_id(self):
        ctx = CrystalContext(org_id="org-1", user_id="u", survey_id=None, scope="survey")
        result = await tools.execute_list_segmentable_questions(ctx, {})
        assert result == {"error": "survey_id required"}


# ── segment text → id resolution ──────────────────────────────────────────────

class TestSegmentTextResolution:
    @pytest.mark.asyncio
    async def test_resolves_by_question_text(self):
        questions = [{"id": "q-region", "type": "dropdown", "question": "Which region are you in?"}]
        responses = [
            ([{"questionId": "q-region", "value": "EMEA"}], "negative", -0.5, 3),
            ([{"questionId": "q-region", "value": "EMEA"}], "negative", -0.3, 4),
            ([{"questionId": "q-region", "value": "AMER"}], "positive", 0.6, 9),
        ]
        # _load_segmentable_questions uses fetchone; the responses query uses fetchall
        pool, _ = _make_mock_pool(fetchone_return=(questions,), fetchall_return=responses)
        with patch("crystalos.crystal.tools.db._pool_conn", return_value=pool):
            result = await tools.execute_get_segment_breakdown(
                _ctx(), {"survey_id": "s-1", "segment_question_text": "region"}
            )
        assert "error" not in result
        segs = {s["segment"] for s in result["segments"]}
        assert segs == {"EMEA", "AMER"}

    @pytest.mark.asyncio
    async def test_no_match_returns_available_segments(self):
        questions = [{"id": "q-region", "type": "dropdown", "question": "Region?"}]
        pool, _ = _make_mock_pool(fetchone_return=(questions,), fetchall_return=[])
        with patch("crystalos.crystal.tools.db._pool_conn", return_value=pool):
            result = await tools.execute_get_segment_breakdown(
                _ctx(), {"survey_id": "s-1", "segment_question_text": "nonexistent"}
            )
        assert "error" in result
        assert result["available_segments"][0]["id"] == "q-region"


# ── _run_skill graceful degradation ───────────────────────────────────────────

class TestRunSkill:
    @pytest.mark.asyncio
    async def test_returns_error_when_registry_not_initialized(self):
        fake_reg = MagicMock()
        fake_reg.is_initialized.return_value = False
        fake_reg.get_skill_meta.return_value = None
        with patch("crystalos.lib.skill_registry.get_registry", return_value=fake_reg):
            out = await tools._run_skill("driver-analyst", {"x": 1}, _ctx(), "s-1")
        assert "error" in out and "driver-analyst" in out["error"]

    @pytest.mark.asyncio
    async def test_returns_skill_output(self):
        fake_reg = MagicMock()
        fake_reg.is_initialized.return_value = True
        fake_reg.get_skill_meta.return_value = {"name": "driver-analyst"}
        fake_reg.execute = AsyncMock(return_value={"output": {"headline": "ok"}})
        with patch("crystalos.lib.skill_registry.get_registry", return_value=fake_reg):
            out = await tools._run_skill("driver-analyst", {"x": 1}, _ctx(), "s-1")
        assert out == {"headline": "ok"}


# ── analyze_key_drivers input shaping ──────────────────────────────────────────

class TestAnalyzeKeyDrivers:
    @pytest.mark.asyncio
    async def test_builds_driver_analyst_input(self):
        captured = {}

        async def fake_run_skill(skill_name, skill_input, ctx, survey_id):
            captured["skill"] = skill_name
            captured["input"] = skill_input
            return {"headline": "drivers ok"}

        driver_data = {"drivers": [
            {"topic": "Onboarding", "volume": 60, "nps_avg": -10, "driver_impact": -72.0, "effort_score": 0.8},
            {"topic": "Support",    "volume": 40, "nps_avg": 5,   "driver_impact": 30.0,  "effort_score": 0.3},
        ], "count": 2}
        actx = {"metrics": {"nps": {"score": 42, "n": 250}}, "topics": [], "title": "T",
                "survey_type": "custom", "response_count": 250, "insights": [], "verbatims": []}

        with (
            patch("crystalos.crystal.tools.execute_get_driver_analysis", new=AsyncMock(return_value=driver_data)),
            patch("crystalos.crystal.tools._fetch_analysis_context", new=AsyncMock(return_value=actx)),
            patch("crystalos.crystal.tools._run_skill", new=fake_run_skill),
        ):
            out = await tools.execute_analyze_key_drivers(_ctx(), {"survey_id": "s-1", "metric": "nps"})

        assert out == {"headline": "drivers ok"}
        assert captured["skill"] == "driver-analyst"
        si = captured["input"]
        assert si["outcome_metric"] == "NPS"
        assert si["outcome_score"] == 42
        labels = {d["label"] for d in si["drivers"]}
        assert labels == {"Onboarding", "Support"}
        onboarding = next(d for d in si["drivers"] if d["label"] == "Onboarding")
        assert onboarding["importance"] == pytest.approx(0.72, abs=0.01)   # |−72|/100
        assert onboarding["performance"] == pytest.approx(-0.72, abs=0.01)  # −72/100


# ── generate_report tolerates missing sections ─────────────────────────────────

class TestGenerateReport:
    @pytest.mark.asyncio
    async def test_omits_failed_sections(self):
        captured = {}

        async def fake_run_skill(skill_name, skill_input, ctx, survey_id):
            captured["skill"] = skill_name
            captured["input"] = skill_input
            return {"report": {"title": "Q1"}}

        actx = {"metrics": {"nps": {"score": 42, "n": 9}}, "topics": [], "title": "Q1 Survey",
                "survey_type": "custom", "response_count": 9, "insights": [], "verbatims": []}

        async def ok_themes(ctx, params):  return {"summary": "themes"}
        async def err_trends(ctx, params): return {"error": "no series"}
        async def ok_drivers(ctx, params): return {"headline": "drivers"}
        async def ok_bench(ctx, params):   return {"metric": "nps", "benchmark": 35}

        with (
            patch("crystalos.crystal.tools._fetch_analysis_context", new=AsyncMock(return_value=actx)),
            patch("crystalos.crystal.tools.execute_summarize_themes", new=ok_themes),
            patch("crystalos.crystal.tools.execute_analyze_trends_over_time", new=err_trends),
            patch("crystalos.crystal.tools.execute_analyze_key_drivers", new=ok_drivers),
            patch("crystalos.crystal.tools.execute_get_benchmark_comparison", new=ok_bench),
            patch("crystalos.crystal.tools._run_skill", new=fake_run_skill),
        ):
            out = await tools.execute_generate_report(_ctx(), {"survey_id": "s-1"})

        assert out == {"report": {"title": "Q1"}}
        assert captured["skill"] == "report-composer"
        sections = captured["input"]["section_inputs"]
        assert sections["themes"] == {"summary": "themes"}
        assert sections["drivers"] == {"headline": "drivers"}
        assert sections["benchmark"] == {"metric": "nps", "benchmark": 35}
        assert sections["trends"] is None   # errored section omitted, not fabricated
