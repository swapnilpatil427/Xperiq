"""
agents/lib/topic_signals.py

XM-grade per-topic signal computation — no LLM calls, no DB I/O.

All functions are pure Python, unit-testable, and deterministic.
Called by node_topics after clustering to produce the full analytics fingerprint
for each topic before it is written to survey_topics and topic_windows.

Signals reference
-----------------
  Qualtrics Text iQ driver analysis, Medallia topic analytics,
  Clarabridge CX analytics, NPS methodology (Reichheld 2003),
  Customer Effort Score (CEB/Gartner 2010), Plutchik emotion wheel (1980).

Per-topic signals computed
--------------------------
Volume
  response_count       int     Responses mentioning this topic in the loaded window
  response_pct         float   % of total survey responses loaded this run
  confidence_level     str     'low' (<3 texts), 'medium' (3-9), 'high' (>=10)

Sentiment
  avg_sentiment_score  float   Mean score in [-1.0, 1.0].  Input scores clamped
                               before averaging so a hallucinated LLM score
                               cannot push the mean out of range.
  net_sentiment        float   (% positive - % negative) * 100  range [-100, 100].
                               Directly analogous to NPS: a topic-level loyalty proxy.
  sentiment_positive_pct float % mentions with sentiment == "positive"
  sentiment_negative_pct float % mentions with sentiment == "negative"
  sentiment_neutral_pct  float % neutral (residual: 100 - pos - neg)

Emotion distribution (Plutchik 8-wheel + XM-specific extensions)
  emotion_distribution dict    {canonical_emotion: fraction}  sum to 1.0
                               Unknown emotions are mapped to "neutral".
  dominant_emotion     str     Most frequent canonical emotion
  urgency_score        float   % of mentions with high-intensity emotion [0, 100]
                               High-intensity: anger, fear, frustration, disgust, sadness

Effort (Customer Effort Score proxy)
  avg_effort_score     float   Mean linguistic effort score.
                               Effective range [1.5, 7.0] — scale is non-linear.
                               4.0 is neutral baseline (returned when no texts).

NPS Alignment (Qualtrics Text iQ Driver Analysis methodology)
  avg_nps_response     float   Mean raw NPS *response* (0-10 scale) of topic mentioners.
                               Kept separate from topic_nps_score to preserve granularity.
  topic_nps_score      float   Topic-level NPS Score = promoter_pct - detractor_pct.
                               Range [-100, 100] — SAME scale as survey-level NPS Score.
  nps_impact           float   topic_nps_score - survey_nps_score.
                               >0 = satisfaction driver, <0 = pain driver.
                               Both operands on [-100, 100] scale — no unit mismatch.
  promoter_pct         float   % of topic mentions from NPS 9-10 respondents  [0, 100]
  detractor_pct        float   % from NPS 0-6  [0, 100]
  passive_pct          float   % from NPS 7-8  [0, 100]
  driver_score         float   Point-biserial r: mention vs NPS.  Practical range
                               is roughly [-0.5, 0.5] because the correlation
                               coefficient is bounded by sqrt(p*(1-p)) where p = n1/n.
                               Positive -> topic predicts high NPS (strength driver).
                               Negative -> topic predicts low NPS (pain driver).
                               Only computed when n >= 10 (unreliable below).
                               Formula uses POPULATION std (not sample) per definition.

CSAT Alignment
  avg_csat             float   Mean CSAT score of topic mentioners (raw scale, e.g. 1-5)
  csat_impact          float   avg_csat_topic - avg_csat_survey (same scale)

Representative Verbatims
  top_verbatims        list    Up to 3 curated quotes (deduplicated by response_id):
                                 1. most_negative  (score < -0.2, lowest score wins)
                                 2. most_positive  (score > 0.2, highest score wins)
                                 3. most_representative (score closest to group median)
                               Each item: {text, sentiment, score, emotion, response_id}
                               Only texts passing is_meaningful_text() are candidates.
"""
from __future__ import annotations

import math
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

from agents.tools.metrics import is_meaningful_text, compute_effort_score


# ── Emotion canonicalisation ───────────────────────────────────────────────────
# Maps any LLM-returned emotion string to one of 12 canonical XM emotions.
# Anything not listed here falls through to "neutral" (see compute_emotion_distribution).

EMOTION_CANONICALIZE: dict[str, str] = {
    # Joy cluster
    "joy": "joy", "happiness": "joy", "delight": "joy",
    "satisfaction": "joy",   # NB: sentiment.py uses "satisfaction" as a label
    "love": "joy", "excited": "joy", "excitement": "joy", "pleased": "joy",
    # Trust cluster
    "trust": "trust", "confidence": "trust", "appreciation": "trust",
    "gratitude": "trust",
    # Anticipation cluster
    "anticipation": "anticipation", "hope": "anticipation", "eagerness": "anticipation",
    # Surprise cluster
    "surprise": "surprise", "shock": "surprise",
    # Sadness cluster
    "sadness": "sadness", "disappointment": "sadness", "grief": "sadness",
    "regret": "sadness", "unhappiness": "sadness",
    # Disgust cluster
    "disgust": "disgust", "contempt": "disgust",
    # Anger cluster
    "anger": "anger", "rage": "anger", "irritation": "anger",
    # Fear cluster
    "fear": "fear", "anxiety": "fear", "worry": "fear",
    # XM-specific extensions (not in original Plutchik but common in CX literature)
    "frustration": "frustration",
    "confusion": "confusion",
    # Neutral
    "neutral": "neutral",
}

HIGH_URGENCY_EMOTIONS: frozenset[str] = frozenset({
    "anger", "fear", "frustration", "disgust", "sadness",
})


# ── Sentiment signals ──────────────────────────────────────────────────────────

def compute_sentiment_signals(absa_results: list[dict]) -> dict:
    """Compute sentiment distribution signals from ABSA results.

    Input scores are clamped to [-1.0, 1.0] before averaging to guard against
    LLM hallucinations returning out-of-range values.

    Returns:
        avg_sentiment_score, net_sentiment, sentiment_positive_pct,
        sentiment_negative_pct, sentiment_neutral_pct.
        All percentages are independently rounded; neutral_pct is the integer
        residual so the three always sum to exactly 100.0 before rounding.
    """
    n = len(absa_results)
    _empty = {
        "avg_sentiment_score":   0.0,
        "net_sentiment":         0.0,
        "sentiment_positive_pct": 0.0,
        "sentiment_negative_pct": 0.0,
        "sentiment_neutral_pct":  0.0,
    }
    if n == 0:
        return _empty

    # Clamp each score to [-1, 1] before summing — LLM can return e.g. 1.8
    scores = [max(-1.0, min(1.0, float(r.get("score") or 0.0))) for r in absa_results]
    avg_score = round(sum(scores) / n, 3)

    positive_count = sum(1 for r in absa_results if r.get("sentiment") == "positive")
    negative_count = sum(1 for r in absa_results if r.get("sentiment") == "negative")
    neutral_count  = n - positive_count - negative_count

    # net_sentiment: topic-level NPS analogue, range [-100, 100]
    net_sentiment = round((positive_count - negative_count) / n * 100, 1)

    return {
        "avg_sentiment_score":    avg_score,
        "net_sentiment":          net_sentiment,
        "sentiment_positive_pct": round(positive_count / n * 100, 1),
        "sentiment_negative_pct": round(negative_count / n * 100, 1),
        "sentiment_neutral_pct":  round(neutral_count  / n * 100, 1),
    }


# ── Emotion distribution ───────────────────────────────────────────────────────

def compute_emotion_distribution(absa_results: list[dict]) -> dict:
    """Compute Plutchik emotion distribution from ABSA results.

    Every emotion string is lower-cased, stripped, and mapped through
    EMOTION_CANONICALIZE.  Strings not in the map default to "neutral" so
    the fractions always sum exactly to 1.0 (within float rounding).

    urgency_score = % of items whose canonical emotion is in HIGH_URGENCY_EMOTIONS.
    Range: [0, 100].
    """
    n = len(absa_results)
    if n == 0:
        return {
            "emotion_distribution": {},
            "dominant_emotion":     "neutral",
            "urgency_score":        0.0,
        }

    counts: Counter = Counter()
    for r in absa_results:
        raw = (r.get("emotion") or "neutral").lower().strip()
        canonical = EMOTION_CANONICALIZE.get(raw, "neutral")
        counts[canonical] += 1

    total = sum(counts.values())  # equals n because every item maps
    emotion_distribution = {
        emotion: round(count / total, 4)
        for emotion, count in sorted(counts.items(), key=lambda x: -x[1])
    }

    dominant_emotion = counts.most_common(1)[0][0] if counts else "neutral"

    high_urgency_count = sum(counts.get(e, 0) for e in HIGH_URGENCY_EMOTIONS)
    urgency_score = round(high_urgency_count / n * 100, 1)

    return {
        "emotion_distribution": emotion_distribution,
        "dominant_emotion":     dominant_emotion,
        "urgency_score":        urgency_score,
    }


# ── NPS alignment ──────────────────────────────────────────────────────────────

def compute_nps_alignment(
    cluster_response_ids: set[str],
    all_responses: list[dict],
    survey_nps_score: float | None,
) -> dict:
    """Compute NPS driver alignment for a topic cluster.

    Two distinct NPS metrics are computed to avoid scale confusion:

    avg_nps_response
        Mean of the raw 0-10 NPS *responses* from topic mentioners.
        Useful for "how did mentioners respond on average" — comparable across
        topic sub-groups on the same 0-10 axis.

    topic_nps_score
        (promoter_pct - detractor_pct), range [-100, 100].
        This is the standard NPS Score formula applied to the topic's respondent pool.
        Directly comparable to survey_nps_score (which comes from compute_nps_ci).

    nps_impact = topic_nps_score - survey_nps_score
        Both operands are on the [-100, 100] scale — no unit mismatch.
        Positive: topic mentioners have higher NPS than the survey average.
        Negative: topic mentioners pull NPS down (pain driver).

    driver_score
        Point-biserial correlation: does mentioning this topic predict NPS?
        Formula: r_pb = (M1 - M0) / sigma_Y * sqrt(n1 * n0 / n^2)
        where sigma_Y is the POPULATION standard deviation of all NPS responses
        (divides by n, not n-1 — Bessel's correction does not apply here because
        we are treating the survey dataset as the full population of interest,
        not a sample from a larger population).
        Only computed when n >= 10 (correlation is unreliable below this).
        Clamped to [-1.0, 1.0] as a safety guard; practical maximum is
        approximately ±0.5 because r_pb <= sqrt(p*(1-p)) where p = n1/n.

    Args:
        cluster_response_ids: Set of response UUIDs (as strings) that mention this topic.
        all_responses: Full list of response dicts from node_ingest.
        survey_nps_score: Survey-level NPS Score from compute_nps_ci, range [-100, 100].
                          None when the survey has no NPS question.

    Returns:
        Dict with avg_nps_response, topic_nps_score, nps_impact, promoter_pct,
        detractor_pct, passive_pct, driver_score.  All None when no NPS data exists.
    """
    _empty = {
        "avg_nps_response": None,
        "topic_nps_score":  None,
        "nps_impact":       None,
        "promoter_pct":     None,
        "detractor_pct":    None,
        "passive_pct":      None,
        "driver_score":     None,
        # Backward-compat alias kept in compute_full_topic_signals
    }

    mentioner_scores: list[float] = []
    non_mentioner_scores: list[float] = []

    for r in all_responses:
        rid = str(r.get("id") or r.get("response_id") or "")
        nps = r.get("nps_score")
        if nps is None:
            continue
        try:
            nps_f = float(nps)
        except (TypeError, ValueError):
            continue
        # Clamp to [0, 10] — NPS responses outside this range are invalid
        nps_f = max(0.0, min(10.0, nps_f))
        if rid in cluster_response_ids:
            mentioner_scores.append(nps_f)
        else:
            non_mentioner_scores.append(nps_f)

    if not mentioner_scores:
        return _empty

    n1 = len(mentioner_scores)
    avg_nps_response = round(sum(mentioner_scores) / n1, 2)

    promoter_count  = sum(1 for s in mentioner_scores if s >= 9)
    detractor_count = sum(1 for s in mentioner_scores if s <= 6)
    passive_count   = n1 - promoter_count - detractor_count

    promoter_pct  = round(promoter_count  / n1 * 100, 1)
    detractor_pct = round(detractor_count / n1 * 100, 1)
    passive_pct   = round(passive_count   / n1 * 100, 1)

    # Topic-level NPS Score — same formula as survey-level, [-100, 100].
    # Computed from raw counts (not rounded pcts) to avoid compounding rounding error.
    topic_nps_score = round((promoter_count - detractor_count) / n1 * 100, 1)

    # nps_impact: both operands on [-100, 100] scale — no unit mismatch
    nps_impact: float | None = None
    if survey_nps_score is not None:
        nps_impact = round(topic_nps_score - survey_nps_score, 1)
    elif non_mentioner_scores:
        # Fallback: compare topic mentioners vs non-mentioners using same NPS Score formula
        n0_nm = len(non_mentioner_scores)
        non_promoters  = sum(1 for s in non_mentioner_scores if s >= 9)
        non_detractors = sum(1 for s in non_mentioner_scores if s <= 6)
        non_nps_score  = round((non_promoters / n0_nm - non_detractors / n0_nm) * 100, 1)
        nps_impact = round(topic_nps_score - non_nps_score, 1)

    # Point-biserial driver_score: does mentioning this topic predict NPS?
    # Computed at n≥10 for internal ranking, but only reliable (publishable)
    # at n≥30 — flagged via driver_score_reliable.
    # Formula: r_pb = (M1 - M0) / σ_Y × √(n1·n0 / n²)
    # σ_Y uses POPULATION std (÷n, not n-1) per point-biserial definition.
    driver_score: float | None = None
    driver_score_reliable = False
    n0 = len(non_mentioner_scores)
    n  = n1 + n0
    if n >= 10 and n1 > 0 and n0 > 0:
        all_nps  = mentioner_scores + non_mentioner_scores
        M1       = sum(mentioner_scores) / n1
        M0       = sum(non_mentioner_scores) / n0
        mean_all = sum(all_nps) / n
        variance = sum((x - mean_all) ** 2 for x in all_nps) / n
        sigma_Y  = math.sqrt(variance) if variance > 0 else 0.0
        if sigma_Y > 0:
            r_pb         = (M1 - M0) / sigma_Y * math.sqrt(n1 * n0 / (n * n))
            driver_score = round(max(-1.0, min(1.0, r_pb)), 3)
        driver_score_reliable = (n >= 30)  # reliable for publishing at n≥30

    return {
        "avg_nps_response":     avg_nps_response,
        "topic_nps_score":      topic_nps_score,
        "nps_impact":           nps_impact,
        "promoter_pct":         promoter_pct,
        "detractor_pct":        detractor_pct,
        "passive_pct":          passive_pct,
        "driver_score":         driver_score,
        "driver_score_reliable": driver_score_reliable,
    }


# ── CSAT alignment ─────────────────────────────────────────────────────────────

def compute_csat_alignment(
    cluster_response_ids: set[str],
    all_responses: list[dict],
    survey_csat_avg: float | None,
) -> dict:
    """Compute CSAT alignment for a topic cluster.

    avg_csat uses the same raw scale as survey_csat_avg (both from compute_csat),
    so csat_impact is a valid same-unit difference.
    """
    mentioner_scores: list[float] = []
    for r in all_responses:
        rid = str(r.get("id") or r.get("response_id") or "")
        csat = r.get("csat_score")
        if csat is None:
            continue
        try:
            csat_f = float(csat)
        except (TypeError, ValueError):
            continue
        if rid in cluster_response_ids:
            mentioner_scores.append(csat_f)

    if not mentioner_scores:
        return {"avg_csat": None, "csat_impact": None}

    avg_csat = round(sum(mentioner_scores) / len(mentioner_scores), 2)
    csat_impact: float | None = None
    if survey_csat_avg is not None:
        csat_impact = round(avg_csat - float(survey_csat_avg), 2)

    return {"avg_csat": avg_csat, "csat_impact": csat_impact}


# ── Representative verbatims ───────────────────────────────────────────────────

def select_top_verbatims(absa_results: list[dict], n: int = 3) -> list[dict]:
    """Select up to n curated representative verbatims.

    Candidates must pass is_meaningful_text() — short/generic responses are excluded.
    Selection (each from a different response_id):
      1. Most negative  — item with score < -0.2 and minimum score
      2. Most positive  — item with score > 0.2 and maximum score
      3. Most representative — item with score closest to the MEDIAN of all candidates

    Scores are clamped to [-1, 1] before selection.
    """
    def _fmt(item: dict) -> dict:
        score = max(-1.0, min(1.0, float(item.get("score") or 0.0)))
        return {
            "text":        item["text"][:400],
            "sentiment":   item.get("sentiment", "neutral"),
            "score":       round(score, 2),
            "emotion":     item.get("emotion", "neutral"),
            "response_id": str(item.get("response_id") or ""),
        }

    candidates = [
        item for item in absa_results
        if is_meaningful_text(item.get("text", ""))
    ]
    if not candidates:
        return []

    all_scores = [max(-1.0, min(1.0, float(item.get("score") or 0.0))) for item in candidates]
    # Median using sorted list (avoids statistics module dependency)
    sorted_scores = sorted(all_scores)
    mid = len(sorted_scores) // 2
    median_score = (
        sorted_scores[mid]
        if len(sorted_scores) % 2 == 1
        else (sorted_scores[mid - 1] + sorted_scores[mid]) / 2
    )

    selected: list[dict] = []
    used_ids: set[str] = set()

    # 1. Most negative
    neg_cands = [item for item in candidates if float(item.get("score") or 0.0) < -0.2]
    if neg_cands:
        worst = min(neg_cands, key=lambda x: max(-1.0, min(1.0, float(x.get("score") or 0.0))))
        rid = str(worst.get("response_id") or "")
        selected.append(_fmt(worst))
        used_ids.add(rid)

    # 2. Most positive
    pos_cands = [
        item for item in candidates
        if float(item.get("score") or 0.0) > 0.2
        and str(item.get("response_id") or "") not in used_ids
    ]
    if pos_cands and len(selected) < n:
        best = max(pos_cands, key=lambda x: max(-1.0, min(1.0, float(x.get("score") or 0.0))))
        rid = str(best.get("response_id") or "")
        selected.append(_fmt(best))
        used_ids.add(rid)

    # 3. Most representative (closest to median)
    remaining = [
        item for item in candidates
        if str(item.get("response_id") or "") not in used_ids
    ]
    if remaining and len(selected) < n:
        rep = min(
            remaining,
            key=lambda x: abs(max(-1.0, min(1.0, float(x.get("score") or 0.0))) - median_score),
        )
        selected.append(_fmt(rep))

    return selected


# ── Unified signal computation ─────────────────────────────────────────────────

def compute_full_topic_signals(
    cluster: dict,
    all_responses: list[dict],
    survey_metrics: dict,
) -> dict:
    """Compute the complete XM signal fingerprint for a topic cluster.

    Pure Python — no LLM, no DB.  Combines all signal groups into one dict
    suitable for writing to survey_topics and topic_windows.

    Args:
        cluster: Cluster dict with 'texts' (ABSA results), 'size', etc.
        all_responses: Full response list from node_ingest (for NPS/CSAT alignment).
        survey_metrics: {
            'nps_avg': float | None   — survey-level NPS Score from compute_nps_ci,
                                        range [-100, 100]. Key is 'nps_avg' by convention.
            'csat_avg': float | None  — survey-level CSAT mean from compute_csat.
            'total_responses': int    — total responses loaded by node_ingest.
          }

    Returns:
        Unified signals dict.  Backward-compat keys are included for callers
        that still reference the old field names.
    """
    absa_results = cluster.get("texts", [])
    cluster_response_ids: set[str] = {
        str(item.get("response_id"))
        for item in absa_results
        if item.get("response_id")
    }

    sentiment_signals = compute_sentiment_signals(absa_results)
    emotion_signals   = compute_emotion_distribution(absa_results)
    nps_signals       = compute_nps_alignment(
        cluster_response_ids,
        all_responses,
        survey_metrics.get("nps_avg"),   # NPS Score [-100, 100] from compute_nps_ci
    )
    csat_signals  = compute_csat_alignment(
        cluster_response_ids,
        all_responses,
        survey_metrics.get("csat_avg"),
    )
    top_verbatims = select_top_verbatims(absa_results)

    text_strs = [item["text"] for item in absa_results if item.get("text")]
    avg_effort_score = compute_effort_score(text_strs) if text_strs else 4.0

    # Use unique respondent count (cluster_response_ids), NOT ABSA item count
    # (cluster["size"] is ABSA items; one respondent answering 2 open-text questions
    # contributes 2 items but is ONE respondent — overcounting inflates response_pct
    # and shifts confidence_level thresholds incorrectly).
    response_count  = len(cluster_response_ids) if cluster_response_ids else cluster.get("size", len(absa_results))
    total_responses = max(1, survey_metrics.get("total_responses", 1))
    response_pct    = round(response_count / total_responses * 100, 1)

    # Confidence based purely on sample size (industry standard: Medallia/Qualtrics).
    # The old coverage >= 0.3 threshold was wrong for enterprise surveys: at n=1000
    # total, a topic mentioned by 50 people (5% coverage, n=50) is statistically
    # solid (MOE < 14%) but was labelled "medium" by the coverage rule.
    #
    # Thresholds (based on MOE for a proportion at 95% CI):
    #   low:    n < 10   — MOE > 60%; virtually no statistical reliability
    #   medium: 10≤n<30  — MOE 18-60%; directional only, treat with caution
    #   high:   n ≥ 30   — MOE < 18%; meets Bain/Satmetrix minimum for NPS
    if response_count >= 30:
        confidence_level = "high"
    elif response_count >= 10:
        confidence_level = "medium"
    else:
        confidence_level = "low"

    return {
        # Volume
        "response_count":    response_count,
        "response_pct":      response_pct,
        "confidence_level":  confidence_level,

        # Sentiment
        **sentiment_signals,

        # Emotion
        **emotion_signals,

        # Effort
        "avg_effort_score": avg_effort_score,

        # NPS alignment (see compute_nps_alignment docstring for scale notes)
        **nps_signals,

        # CSAT alignment
        **csat_signals,

        # Verbatims
        "top_verbatims": top_verbatims,

        # ── Backward compatibility ────────────────────────────────────────────
        # These keys are used by upsert_survey_topics and the existing
        # topic_signals parameter contract.  Do not remove.
        "nps_avg":      nps_signals.get("avg_nps_response"),  # raw 0-10 mean
        "avg_nps":      nps_signals.get("avg_nps_response"),  # alias
        "effort_score": avg_effort_score,
        "positive_pct": sentiment_signals.get("sentiment_positive_pct"),
        "negative_pct": sentiment_signals.get("sentiment_negative_pct"),
        "neutral_pct":  sentiment_signals.get("sentiment_neutral_pct"),
        "response_ids": list(cluster_response_ids),
    }
