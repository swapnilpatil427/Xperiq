"""Unit tests for the Phase 0.5 delta helpers in crystalos/tools/delta.py.

Covers:
  - extract_metrics_from_state()
  - extract_metrics_from_blob()
  - build_current_topic_name_set()
  - evaluate_meaningful_delta() threshold behavior
"""
import pytest

from crystalos.tools.delta import (
    compute_delta,
    extract_metrics_from_state,
    extract_metrics_from_blob,
    build_current_topic_name_set,
    evaluate_meaningful_delta,
)


# ── extract_metrics_from_state ────────────────────────────────────────────────

class TestExtractMetricsFromState:
    def test_reads_scores_from_metrics(self):
        state = {
            "metrics": {
                "nps":  {"score": 42.0, "n": 100},
                "csat": {"score": 4.1},
                "ces":  {"score": 3.2},
                "total_responses": 120,
            },
        }
        m = extract_metrics_from_state(state)
        assert m == {"nps": 42.0, "csat": 4.1, "ces": 3.2, "response_count": 120}

    def test_missing_metric_is_none(self):
        state = {"metrics": {"nps": {"score": 30.0}, "total_responses": 50}}
        m = extract_metrics_from_state(state)
        assert m["nps"] == 30.0
        assert m["csat"] is None
        assert m["ces"] is None

    def test_response_count_falls_back_to_responses_len(self):
        state = {"metrics": {"nps": {"score": 10.0}}, "responses": [{}, {}, {}]}
        m = extract_metrics_from_state(state)
        assert m["response_count"] == 3

    def test_empty_state(self):
        m = extract_metrics_from_state({})
        assert m == {"nps": None, "csat": None, "ces": None, "response_count": 0}


# ── extract_metrics_from_blob ─────────────────────────────────────────────────

class TestExtractMetricsFromBlob:
    def test_at_checkpoint_keys_win_first(self):
        blob = {
            "nps_at_checkpoint": 35.0,
            "nps": 99.0,  # should be ignored (lower priority)
            "csat_at_checkpoint": 3.9,
            "ces": 2.5,
            "response_count_at_checkpoint": 80,
        }
        m = extract_metrics_from_blob(blob)
        assert m["nps"] == 35.0
        assert m["csat"] == 3.9
        assert m["ces"] == 2.5
        assert m["response_count"] == 80

    def test_falls_back_to_plain_keys(self):
        blob = {"nps": 20.0, "csat": 4.0, "response_count": 60}
        m = extract_metrics_from_blob(blob)
        assert m["nps"] == 20.0
        assert m["csat"] == 4.0
        assert m["response_count"] == 60

    def test_missing_is_none(self):
        m = extract_metrics_from_blob({})
        assert m == {"nps": None, "csat": None, "ces": None, "response_count": 0}


# ── build_current_topic_name_set ──────────────────────────────────────────────

class TestBuildCurrentTopicNameSet:
    def test_from_topic_signals_keys(self):
        state = {"topic_signals": {"Billing": {}, "Onboarding": {}}}
        assert build_current_topic_name_set(state) == {"Billing", "Onboarding"}

    def test_absent_returns_empty(self):
        assert build_current_topic_name_set({}) == set()

    def test_empty_returns_empty(self):
        assert build_current_topic_name_set({"topic_signals": {}}) == set()


# ── evaluate_meaningful_delta ─────────────────────────────────────────────────

class TestEvaluateMeaningfulDelta:
    def test_nps_delta_above_default_threshold(self):
        delta = {"nps_delta": -2.5, "topic_changes": {"emerged": [], "resolved": []}}
        assert evaluate_meaningful_delta(delta, {}) is True

    def test_nps_delta_below_default_threshold(self):
        delta = {"nps_delta": 1.5, "csat_delta": 0.0,
                 "topic_changes": {"emerged": [], "resolved": []}}
        assert evaluate_meaningful_delta(delta, {}) is False

    def test_nps_threshold_configurable(self):
        delta = {"nps_delta": 3.0, "topic_changes": {"emerged": [], "resolved": []}}
        # threshold raised above the delta → not meaningful
        assert evaluate_meaningful_delta(delta, {"meaningful_delta_nps_points": 5.0}) is False

    def test_csat_delta_threshold(self):
        delta = {"nps_delta": None, "csat_delta": -0.2,
                 "topic_changes": {"emerged": [], "resolved": []}}
        assert evaluate_meaningful_delta(delta, {}) is True

    def test_csat_delta_below_threshold(self):
        delta = {"nps_delta": None, "csat_delta": 0.1,
                 "topic_changes": {"emerged": [], "resolved": []}}
        assert evaluate_meaningful_delta(delta, {}) is False

    def test_emerged_topic_makes_meaningful(self):
        delta = {"nps_delta": 0.0, "csat_delta": 0.0,
                 "topic_changes": {"emerged": ["AI features"], "resolved": []}}
        assert evaluate_meaningful_delta(delta, {}) is True

    def test_resolved_topic_makes_meaningful(self):
        delta = {"nps_delta": 0.0, "csat_delta": 0.0,
                 "topic_changes": {"emerged": [], "resolved": ["Slow login"]}}
        assert evaluate_meaningful_delta(delta, {}) is True

    def test_no_changes_not_meaningful(self):
        delta = {"nps_delta": 0.0, "csat_delta": 0.0, "ces_delta": None,
                 "topic_changes": {"emerged": [], "resolved": [], "persisted": ["X"]}}
        assert evaluate_meaningful_delta(delta, {}) is False

    def test_none_nps_does_not_crash(self):
        delta = {"nps_delta": None, "csat_delta": None, "ces_delta": None,
                 "topic_changes": {}}
        assert evaluate_meaningful_delta(delta, {}) is False


# ── Integration: compute_delta → evaluate_meaningful_delta ────────────────────

class TestComputeDeltaIntegration:
    def test_state_blob_roundtrip_meaningful(self):
        state = {
            "metrics": {"nps": {"score": 40.0}, "csat": {"score": 4.0}, "total_responses": 60},
            "topic_signals": {"Billing": {}, "AI features": {}},
        }
        blob = {"nps_at_checkpoint": 45.0, "csat_at_checkpoint": 4.0,
                "response_count_at_checkpoint": 50,
                "topics": [{"name": "Billing"}]}
        current = extract_metrics_from_state(state)
        current["topics"] = [{"name": n} for n in build_current_topic_name_set(state)]
        parent = blob
        delta = compute_delta(current, parent)
        # NPS dropped 5 pts → meaningful; AI features emerged.
        assert delta["nps_delta"] == -5.0
        assert "AI features" in delta["topic_changes"]["emerged"]
        assert evaluate_meaningful_delta(delta, {}) is True
