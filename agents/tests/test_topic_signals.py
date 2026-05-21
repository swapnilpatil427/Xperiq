"""Unit tests for topic signal computation — pure Python, no DB, no LLM."""
import math
import pytest

from agents.lib.topic_signals import (
    EMOTION_CANONICALIZE,
    HIGH_URGENCY_EMOTIONS,
    compute_csat_alignment,
    compute_emotion_distribution,
    compute_full_topic_signals,
    compute_nps_alignment,
    compute_sentiment_signals,
    select_top_verbatims,
)


# ── helpers ────────────────────────────────────────────────────────────────────

def _absa(text="sample text that is long enough to pass is_meaningful_text",
          sentiment="positive", score=0.5, emotion="joy", response_id="r1"):
    return {"text": text, "sentiment": sentiment, "score": score,
            "emotion": emotion, "response_id": response_id}


def _response(id_="r1", nps=9, csat=4.0):
    return {"id": id_, "nps_score": nps, "csat_score": csat}


# ── compute_sentiment_signals ─────────────────────────────────────────────────

class TestComputeSentimentSignals:
    def test_empty_returns_zeros(self):
        r = compute_sentiment_signals([])
        assert r["avg_sentiment_score"] == 0.0
        assert r["net_sentiment"] == 0.0
        assert r["sentiment_positive_pct"] == 0.0

    def test_all_positive(self):
        items = [_absa(sentiment="positive", score=0.8, response_id=str(i)) for i in range(5)]
        r = compute_sentiment_signals(items)
        assert r["sentiment_positive_pct"] == 100.0
        assert r["sentiment_negative_pct"] == 0.0
        assert r["net_sentiment"] == pytest.approx(100.0)
        assert r["avg_sentiment_score"] == pytest.approx(0.8)

    def test_all_negative(self):
        items = [_absa(sentiment="negative", score=-0.6, response_id=str(i)) for i in range(4)]
        r = compute_sentiment_signals(items)
        assert r["net_sentiment"] == pytest.approx(-100.0)

    def test_mixed_sentiment_counts(self):
        items = [
            _absa(sentiment="positive", score=0.9, response_id="r1"),
            _absa(sentiment="negative", score=-0.5, response_id="r2"),
            _absa(sentiment="neutral",  score=0.0,  response_id="r3"),
            _absa(sentiment="negative", score=-0.3, response_id="r4"),
        ]
        r = compute_sentiment_signals(items)
        assert r["sentiment_positive_pct"] == pytest.approx(25.0)
        assert r["sentiment_negative_pct"] == pytest.approx(50.0)
        assert r["sentiment_neutral_pct"]  == pytest.approx(25.0)
        # net = (1 - 2) / 4 * 100 = -25
        assert r["net_sentiment"] == pytest.approx(-25.0)

    def test_out_of_range_scores_clamped(self):
        # LLM hallucination: scores outside [-1, 1]
        items = [_absa(score=99.0, response_id="r1"), _absa(score=-99.0, response_id="r2")]
        r = compute_sentiment_signals(items)
        # After clamping: [1.0, -1.0], avg = 0.0
        assert r["avg_sentiment_score"] == pytest.approx(0.0, abs=0.01)


# ── compute_emotion_distribution ──────────────────────────────────────────────

class TestComputeEmotionDistribution:
    def test_empty_returns_neutral_defaults(self):
        r = compute_emotion_distribution([])
        assert r["emotion_distribution"] == {}
        assert r["dominant_emotion"] == "neutral"
        assert r["urgency_score"] == 0.0

    def test_single_emotion_distribution(self):
        items = [_absa(emotion="joy", response_id=str(i)) for i in range(4)]
        r = compute_emotion_distribution(items)
        assert r["dominant_emotion"] == "joy"
        assert r["emotion_distribution"]["joy"] == pytest.approx(1.0)
        assert r["urgency_score"] == 0.0  # joy is not high-urgency

    def test_high_urgency_anger(self):
        items = [_absa(emotion="anger", response_id=str(i)) for i in range(3)]
        items += [_absa(emotion="joy", response_id=str(i + 10)) for i in range(1)]
        r = compute_emotion_distribution(items)
        assert r["urgency_score"] == pytest.approx(75.0)  # 3/4 = 75%

    def test_unknown_emotion_maps_to_neutral(self):
        items = [_absa(emotion="completely_unknown_word", response_id="r1")]
        r = compute_emotion_distribution(items)
        assert r["dominant_emotion"] == "neutral"
        assert "neutral" in r["emotion_distribution"]

    def test_synonym_canonicalized_to_sadness(self):
        items = [_absa(emotion="disappointment", response_id="r1")]
        r = compute_emotion_distribution(items)
        assert "sadness" in r["emotion_distribution"]
        assert "disappointment" not in r["emotion_distribution"]

    def test_distribution_sums_to_one(self):
        items = [
            _absa(emotion="joy",       response_id="r1"),
            _absa(emotion="anger",     response_id="r2"),
            _absa(emotion="fear",      response_id="r3"),
            _absa(emotion="neutral",   response_id="r4"),
            _absa(emotion="sadness",   response_id="r5"),
        ]
        r = compute_emotion_distribution(items)
        total = sum(r["emotion_distribution"].values())
        assert total == pytest.approx(1.0, abs=0.01)

    def test_all_high_urgency_emotions_recognized(self):
        for emotion in HIGH_URGENCY_EMOTIONS:
            items = [_absa(emotion=emotion, response_id="r1")]
            r = compute_emotion_distribution(items)
            assert r["urgency_score"] == pytest.approx(100.0), \
                f"{emotion} should be high-urgency"


# ── compute_nps_alignment ─────────────────────────────────────────────────────

class TestComputeNpsAlignment:
    def test_no_nps_data_returns_all_none(self):
        r = compute_nps_alignment({"r1"}, [{"id": "r1"}], None)
        assert r["avg_nps_response"] is None
        assert r["topic_nps_score"] is None
        assert r["driver_score"] is None

    def test_all_promoters(self):
        rids = {str(i) for i in range(4)}
        responses = [{"id": str(i), "nps_score": 10} for i in range(4)]
        r = compute_nps_alignment(rids, responses, None)
        assert r["promoter_pct"] == pytest.approx(100.0)
        assert r["detractor_pct"] == pytest.approx(0.0)
        assert r["topic_nps_score"] == pytest.approx(100.0)

    def test_nps_impact_vs_survey_score(self):
        rids = {"r1", "r2"}
        responses = [
            {"id": "r1", "nps_score": 10},
            {"id": "r2", "nps_score": 10},
            {"id": "r3", "nps_score": 2},
        ]
        r = compute_nps_alignment(rids, responses, survey_nps_score=0.0)
        # topic_nps_score = 100, survey = 0 → impact = 100
        assert r["nps_impact"] == pytest.approx(100.0)

    def test_nps_score_clamped_to_0_10(self):
        rids = {"r1"}
        responses = [{"id": "r1", "nps_score": 999}]
        r = compute_nps_alignment(rids, responses, None)
        assert r["avg_nps_response"] == pytest.approx(10.0)

    def test_driver_score_requires_n_ge_10(self):
        # n = 9 (5 mentioners + 4 non-mentioners) — below threshold
        rids = {str(i) for i in range(5)}
        responses = [{"id": str(i), "nps_score": 9} for i in range(5)]
        responses += [{"id": str(i + 10), "nps_score": 3} for i in range(4)]
        r = compute_nps_alignment(rids, responses, None)
        assert r["driver_score"] is None

    def test_driver_score_computed_at_n_ge_10(self):
        # 6 mentioners + 6 non-mentioners = 12, all separated (promoters vs detractors)
        rids = {str(i) for i in range(6)}
        responses = [{"id": str(i), "nps_score": 9} for i in range(6)]
        responses += [{"id": str(i + 10), "nps_score": 2} for i in range(6)]
        r = compute_nps_alignment(rids, responses, None)
        assert r["driver_score"] is not None
        assert -1.0 <= r["driver_score"] <= 1.0
        assert r["driver_score"] > 0  # mentioners have higher NPS → positive driver


# ── compute_csat_alignment ────────────────────────────────────────────────────

class TestComputeCsatAlignment:
    def test_no_csat_field_returns_none(self):
        r = compute_csat_alignment({"r1"}, [{"id": "r1"}], None)
        assert r["avg_csat"] is None
        assert r["csat_impact"] is None

    def test_avg_csat_computed(self):
        rids = {"r1", "r2"}
        responses = [{"id": "r1", "csat_score": 5.0}, {"id": "r2", "csat_score": 3.0}]
        r = compute_csat_alignment(rids, responses, survey_csat_avg=None)
        assert r["avg_csat"] == pytest.approx(4.0)
        assert r["csat_impact"] is None  # no survey avg provided

    def test_csat_impact_computed(self):
        rids = {"r1", "r2"}
        responses = [{"id": "r1", "csat_score": 5.0}, {"id": "r2", "csat_score": 4.0}]
        r = compute_csat_alignment(rids, responses, survey_csat_avg=3.0)
        assert r["avg_csat"] == pytest.approx(4.5)
        assert r["csat_impact"] == pytest.approx(1.5)

    def test_non_mentioners_excluded(self):
        rids = {"r1"}
        responses = [
            {"id": "r1", "csat_score": 5.0},
            {"id": "r2", "csat_score": 1.0},  # not in rids
        ]
        r = compute_csat_alignment(rids, responses, survey_csat_avg=None)
        assert r["avg_csat"] == pytest.approx(5.0)


# ── select_top_verbatims ──────────────────────────────────────────────────────

class TestSelectTopVerbatims:
    def test_empty_returns_empty(self):
        assert select_top_verbatims([]) == []

    def test_returns_at_most_n(self):
        items = [_absa(
            text="This is a sufficiently long text that should pass the meaningful filter easily here",
            sentiment="negative", score=-0.9 + i * 0.1,
            response_id=str(i),
        ) for i in range(10)]
        verbatims = select_top_verbatims(items, n=3)
        assert len(verbatims) <= 3

    def test_deduplicates_by_response_id(self):
        # Two items from the same response — only one should appear in output
        items = [
            _absa(text="Really terrible experience with the product and service team",
                  sentiment="negative", score=-0.8, response_id="same"),
            _absa(text="I absolutely love this product it is amazing and wonderful",
                  sentiment="positive", score=0.9, response_id="same"),
        ]
        verbatims = select_top_verbatims(items)
        ids = [v["response_id"] for v in verbatims]
        assert len(ids) == len(set(ids))

    def test_text_truncated_to_400_chars(self):
        long_text = "A" * 500 + " more words that make it even longer and exceed the limit"
        items = [_absa(text=long_text, sentiment="negative", score=-0.5, response_id="r1")]
        verbatims = select_top_verbatims(items)
        if verbatims:
            assert len(verbatims[0]["text"]) <= 400

    def test_verbatim_has_required_fields(self):
        items = [_absa(
            text="Great product I really love using it every single day it helps a lot",
            sentiment="positive", score=0.8, emotion="joy", response_id="r1",
        )]
        verbatims = select_top_verbatims(items)
        if verbatims:
            v = verbatims[0]
            for key in ("text", "sentiment", "score", "emotion", "response_id"):
                assert key in v


# ── compute_full_topic_signals ────────────────────────────────────────────────

class TestComputeFullTopicSignals:
    def _cluster(self, n_pos=3, n_neg=2, n_neutral=1):
        items = []
        for i in range(n_pos):
            items.append(_absa(sentiment="positive", score=0.7, emotion="joy",
                               response_id=f"pos{i}"))
        for i in range(n_neg):
            items.append(_absa(sentiment="negative", score=-0.6, emotion="frustration",
                               response_id=f"neg{i}"))
        for i in range(n_neutral):
            items.append(_absa(sentiment="neutral", score=0.0, emotion="neutral",
                               response_id=f"neu{i}"))
        return {"texts": items, "size": len(items)}

    def test_returns_all_required_keys(self):
        cluster = self._cluster()
        r = compute_full_topic_signals(cluster, [], {"total_responses": 10})
        required = (
            "response_count", "response_pct", "confidence_level",
            "emotion_distribution", "dominant_emotion", "urgency_score",
            "top_verbatims", "response_ids",
            # backward-compat aliases
            "nps_avg", "positive_pct", "negative_pct", "neutral_pct",
        )
        for key in required:
            assert key in r, f"Missing key: {key}"

    def test_confidence_low_for_few_responses(self):
        cluster = {"texts": [_absa(response_id="r1"), _absa(response_id="r2")], "size": 2}
        r = compute_full_topic_signals(cluster, [], {"total_responses": 100})
        assert r["confidence_level"] == "low"

    def test_confidence_medium(self):
        items = [_absa(response_id=str(i)) for i in range(5)]
        r = compute_full_topic_signals({"texts": items, "size": 5}, [], {"total_responses": 100})
        assert r["confidence_level"] == "medium"

    def test_confidence_high(self):
        items = [_absa(response_id=str(i)) for i in range(30)]
        r = compute_full_topic_signals({"texts": items, "size": 30}, [], {"total_responses": 100})
        assert r["confidence_level"] == "high"

    def test_confidence_medium_below_threshold(self):
        # n=12, coverage=0.12 — below both n≥30 and coverage≥0.3 thresholds → medium
        items = [_absa(response_id=str(i)) for i in range(12)]
        r = compute_full_topic_signals({"texts": items, "size": 12}, [], {"total_responses": 100})
        assert r["confidence_level"] == "medium"

    def test_response_ids_are_strings(self):
        cluster = self._cluster()
        r = compute_full_topic_signals(cluster, [], {})
        assert all(isinstance(rid, str) for rid in r["response_ids"])

    def test_deduplicates_response_ids(self):
        # Same response_id appearing in multiple ABSA items counts once
        items = [_absa(response_id="same") for _ in range(5)]
        cluster = {"texts": items, "size": 5}
        r = compute_full_topic_signals(cluster, [], {"total_responses": 10})
        assert r["response_count"] == 1

    def test_response_pct_computed(self):
        items = [_absa(response_id=str(i)) for i in range(5)]
        cluster = {"texts": items, "size": 5}
        r = compute_full_topic_signals(cluster, [], {"total_responses": 10})
        assert r["response_pct"] == pytest.approx(50.0)

    def test_nps_alignment_propagated(self):
        cluster = self._cluster()
        responses = [
            {"id": "pos0", "nps_score": 9},
            {"id": "neg0", "nps_score": 2},
        ]
        r = compute_full_topic_signals(cluster, responses, {"nps_avg": 50.0, "total_responses": 10})
        # nps fields present
        assert "promoter_pct" in r
        assert "detractor_pct" in r
