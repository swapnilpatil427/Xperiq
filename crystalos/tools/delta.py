"""Delta analysis for Crystal Intelligence checkpoints.

Computes:
- Metric deltas between consecutive checkpoints
- Topic change classification (emerged/resolved/persisted)
- Trend persistence classification
- Canonical insight hashes
- Topic fingerprints
"""
from __future__ import annotations

import hashlib
from typing import Any


# ── Canonical insight hash ────────────────────────────────────────────────────

def compute_insight_hash(survey_id: str, topic_fingerprint: str, layer: str, category: str) -> str:
    """Canonical insight hash — single definition, used by all callers.

    Format: sha256(f"{survey_id}:{topic_fingerprint}:{layer}:{category}")
    """
    raw = f"{survey_id}:{topic_fingerprint}:{layer}:{category}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


# ── Topic fingerprint ─────────────────────────────────────────────────────────

def compute_topic_fingerprint(topics: list[dict]) -> str:
    """Compute a canonical fingerprint for a set of topics.

    sha256(sorted topic names joined with |)
    Stable: adding a topic changes the fingerprint, removing one does too.
    """
    names = sorted(t.get("name", "") for t in topics if t.get("name"))
    raw = "|".join(names)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ── Delta computation ─────────────────────────────────────────────────────────

def compute_delta(
    checkpoint_n: dict,
    checkpoint_n1: dict,
    checkpoint_n2: dict | None = None,
) -> dict:
    """Compute delta between checkpoint N (latest) and N-1 (prior).

    Optionally accepts N-2 to compute trend persistence and acceleration.

    Args:
        checkpoint_n:  Latest checkpoint blob (or metrics dict)
        checkpoint_n1: Prior checkpoint blob
        checkpoint_n2: Optional checkpoint before prior (for persistence)

    Returns delta dict with NPS delta, topic changes, trend direction, etc.
    """
    def _safe_float(v: Any) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    def _metric_delta(key: str) -> float | None:
        curr = _safe_float(checkpoint_n.get(key))
        prev = _safe_float(checkpoint_n1.get(key))
        if curr is not None and prev is not None:
            return round(curr - prev, 1)
        return None

    def _first_not_none(*values: float | None) -> float | None:
        # Use explicit None check — 0.0 is a valid zero-delta, not a fallback signal.
        for v in values:
            if v is not None:
                return v
        return None

    nps_delta  = _first_not_none(_metric_delta("nps"), _metric_delta("nps_at_checkpoint"), _metric_delta("nps_score"))
    csat_delta = _first_not_none(_metric_delta("csat"), _metric_delta("csat_at_checkpoint"), _metric_delta("csat_score"))
    ces_delta  = _first_not_none(_metric_delta("ces"), _metric_delta("ces_at_checkpoint"), _metric_delta("ces_score"))

    n_count  = int(checkpoint_n.get("response_count") or checkpoint_n.get("response_count_at_checkpoint") or 0)
    n1_count = int(checkpoint_n1.get("response_count") or checkpoint_n1.get("response_count_at_checkpoint") or 0)
    response_count_delta = n_count - n1_count

    # Topic changes
    topics_n  = {t.get("name") for t in (checkpoint_n.get("topics") or []) if t.get("name")}
    topics_n1 = {t.get("name") for t in (checkpoint_n1.get("topics") or []) if t.get("name")}
    emerged   = sorted(topics_n - topics_n1)
    resolved  = sorted(topics_n1 - topics_n)
    persisted = sorted(topics_n & topics_n1)

    # Trend direction (based on primary metric — NPS preferred)
    primary_delta = nps_delta if nps_delta is not None else csat_delta
    if primary_delta is None:
        trend_direction = "stable"
    elif primary_delta > 2:
        trend_direction = "up"
    elif primary_delta < -2:
        trend_direction = "down"
    else:
        trend_direction = "stable"

    # Trend persistence (requires N-2)
    trend_persistence = "first_occurrence"
    nps_acceleration = None
    anomaly_credibility = None

    if checkpoint_n2 is not None:
        def _metric_delta_prior(key: str) -> float | None:
            curr = _safe_float(checkpoint_n1.get(key))
            prev = _safe_float(checkpoint_n2.get(key))
            if curr is not None and prev is not None:
                return round(curr - prev, 1)
            return None

        prior_nps_delta = _first_not_none(_metric_delta_prior("nps"), _metric_delta_prior("nps_at_checkpoint"), _metric_delta_prior("nps_score"))

        if nps_delta is not None and prior_nps_delta is not None:
            nps_acceleration = round(nps_delta - prior_nps_delta, 1)

        # Trend persistence classification
        if primary_delta is not None and prior_nps_delta is not None:
            if trend_direction == "up" and prior_nps_delta > 2:
                trend_persistence = "confirmed"
            elif trend_direction == "down" and prior_nps_delta < -2:
                trend_persistence = "confirmed"
            elif trend_direction != "stable":
                trend_persistence = "second_occurrence"
            else:
                trend_persistence = "first_occurrence"

        # Check if N-2 had anomaly flag
        n2_anomaly = checkpoint_n2.get("anomaly_flag", False)
        n_anomaly  = checkpoint_n.get("anomaly_flag", False)
        if n_anomaly:
            anomaly_credibility = "ongoing_issue" if n2_anomaly else "new_anomaly"

    delta = {
        "nps_delta":             nps_delta,
        "csat_delta":            csat_delta,
        "ces_delta":             ces_delta,
        "response_count_delta":  response_count_delta,
        "topic_changes": {
            "emerged":   emerged,
            "resolved":  resolved,
            "persisted": persisted,
        },
        "trend_direction":    trend_direction,
        "trend_persistence":  trend_persistence,
    }

    if nps_acceleration is not None:
        delta["nps_acceleration"] = nps_acceleration
    if anomaly_credibility is not None:
        delta["anomaly_credibility"] = anomaly_credibility

    return delta
