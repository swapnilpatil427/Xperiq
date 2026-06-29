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

    def _first_not_none(*values: float | None) -> float | None:
        # Use explicit None check — 0.0 is a valid zero-delta, not a fallback signal.
        for v in values:
            if v is not None:
                return v
        return None

    def _metric(d: dict, *keys: str) -> float | None:
        for k in keys:
            v = _safe_float(d.get(k))
            if v is not None:
                return v
        return None

    def _cross_delta(*keys: str) -> float | None:
        a = _metric(checkpoint_n, *keys)
        b = _metric(checkpoint_n1, *keys)
        return round(a - b, 1) if a is not None and b is not None else None

    nps_delta  = _cross_delta("nps", "nps_at_checkpoint", "nps_score")
    csat_delta = _cross_delta("csat", "csat_at_checkpoint", "csat_score")
    ces_delta  = _cross_delta("ces", "ces_at_checkpoint", "ces_score")

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


# ── Phase 0.5: node_delta_compute helpers ─────────────────────────────────────

def extract_metrics_from_state(state: dict) -> dict:
    """Extract the current metric snapshot from pipeline state.

    Sources: ``state["metrics"]["nps"]["score"]`` (and csat/ces). Returns None for
    any metric not present. ``response_count`` reads total_responses, then the
    length of loaded responses.
    """
    metrics = state.get("metrics") or {}

    def _score(key: str) -> float | None:
        sub = metrics.get(key)
        if isinstance(sub, dict):
            v = sub.get("score")
            try:
                return float(v) if v is not None else None
            except (TypeError, ValueError):
                return None
        return None

    response_count = (
        metrics.get("total_responses")
        if metrics.get("total_responses") is not None
        else len(state.get("responses") or [])
    )

    return {
        "nps":            _score("nps"),
        "csat":           _score("csat"),
        "ces":            _score("ces"),
        "response_count": int(response_count or 0),
    }


def extract_metrics_from_blob(blob: dict) -> dict:
    """Extract a metric snapshot from a prior checkpoint blob.

    Reads each metric from a priority-ordered list of keys (first non-None wins):
      nps  → "nps_at_checkpoint", "nps", "nps_score"
      csat → "csat_at_checkpoint", "csat", "csat_score"
      ces  → "ces_at_checkpoint", "ces", "ces_score"
      response_count → "response_count_at_checkpoint", "response_count"
    Same return shape as ``extract_metrics_from_state``.
    """
    blob = blob or {}

    def _first(*keys: str) -> float | None:
        for k in keys:
            v = blob.get(k)
            if v is not None:
                try:
                    return float(v)
                except (TypeError, ValueError):
                    continue
        return None

    rc = None
    for k in ("response_count_at_checkpoint", "response_count"):
        v = blob.get(k)
        if v is not None:
            try:
                rc = int(v)
                break
            except (TypeError, ValueError):
                continue

    return {
        "nps":            _first("nps_at_checkpoint", "nps", "nps_score"),
        "csat":           _first("csat_at_checkpoint", "csat", "csat_score"),
        "ces":            _first("ces_at_checkpoint", "ces", "ces_score"),
        "response_count": rc or 0,
    }


def build_current_topic_name_set(state: dict) -> set[str]:
    """Return the set of current topic name strings from ``state["topic_signals"]``.

    Returns an empty set when ``topic_signals`` is absent or empty.
    """
    sigs = state.get("topic_signals") or {}
    if not isinstance(sigs, dict):
        return set()
    return {str(name) for name in sigs.keys() if name}


def compute_topic_lifecycle(
    parent_topics: list[dict] | dict,
    current_topics: list[dict] | dict,
    settings: dict | None = None,
) -> dict:
    """Share-weighted topic lifecycle classification (Phase 2 — 03 §8).

    Classifies each topic into emerged / growing / stable / declining / resolved using
    ``volume_share`` (fraction of responses, 0–1) and the share delta vs the parent
    checkpoint. Returns the Phase 2 extended ``topic_changes`` shape plus a
    ``fingerprint_changed`` flag.

    Args:
        parent_topics:  topics from the parent checkpoint blob. Either a list of
                        ``{name, volume_share | volume}`` dicts, or a dict
                        ``{name: signal_dict}`` (e.g. state["topic_signals"]).
        current_topics: current topics, same accepted shapes.
        settings:       optional dict; reads ``meaningful_delta_topic_pct`` (percent,
                        default 10.0 → 0.10 emerged/resolved floor uses 3% per spec)
                        and uses ±5pp growing/declining bands.

    Thresholds (03 §8):
        emerged   — in current, not in parent; volume_share ≥ 3%
        growing   — in both; share delta ≥ +5pp
        stable    — in both; |share delta| < 5pp
        declining — in both; share delta ≤ -5pp
        resolved  — in parent, absent from current; was ≥ 3% share

    Returns:
        {
          "emerged":   [{"name", "volume_share"}],
          "growing":   [{"name", "volume_share_delta"}],
          "stable":    ["name", ...],
          "declining": [{"name", "volume_share_delta"}],
          "resolved":  [{"name", "prior_volume_share"}],
          "persisted": ["name", ...],   # growing ∪ stable ∪ declining names (back-compat)
          "fingerprint_changed": bool,
        }
    """
    settings = settings or {}
    # Emerged / resolved floor is fixed at 3% per spec; growing/declining band ±5pp.
    EMERGED_FLOOR = 0.03
    GROW_BAND = 0.05

    def _shares(topics: list[dict] | dict) -> dict[str, float]:
        """Normalize any accepted shape into {name: volume_share(0-1)}."""
        out: dict[str, float] = {}
        if isinstance(topics, dict):
            # {name: signal_dict} or {name: share}
            items = topics.items()
            for name, val in items:
                if not name:
                    continue
                if isinstance(val, dict):
                    share = val.get("volume_share")
                    if share is None:
                        # derive from response_pct (0-100) or response_count
                        pct = val.get("response_pct")
                        share = (float(pct) / 100.0) if pct is not None else None
                    out[str(name)] = float(share) if share is not None else 0.0
                else:
                    try:
                        out[str(name)] = float(val)
                    except (TypeError, ValueError):
                        out[str(name)] = 0.0
            # If shares look like raw counts (sum > 1.5), normalize to fractions.
            total = sum(out.values())
            if total > 1.5:
                out = {k: (v / total if total else 0.0) for k, v in out.items()}
            return out
        # list of dicts
        raw: dict[str, float] = {}
        for t in (topics or []):
            name = t.get("name")
            if not name:
                continue
            share = t.get("volume_share")
            if share is None:
                vol = t.get("volume")
                share = float(vol) if vol is not None else None
            raw[str(name)] = float(share) if share is not None else 0.0
        total = sum(raw.values())
        if total > 1.5:
            raw = {k: (v / total if total else 0.0) for k, v in raw.items()}
        return raw

    parent = _shares(parent_topics)
    current = _shares(current_topics)

    emerged: list[dict] = []
    growing: list[dict] = []
    stable: list[str] = []
    declining: list[dict] = []
    resolved: list[dict] = []

    for name, cur_share in current.items():
        if name not in parent:
            if cur_share >= EMERGED_FLOOR:
                emerged.append({"name": name, "volume_share": round(cur_share, 4)})
            else:
                # below floor — treat as nascent stable so it isn't lost entirely
                stable.append(name)
            continue
        delta_share = cur_share - parent[name]
        if delta_share >= GROW_BAND:
            growing.append({"name": name, "volume_share_delta": round(delta_share, 4)})
        elif delta_share <= -GROW_BAND:
            declining.append({"name": name, "volume_share_delta": round(delta_share, 4)})
        else:
            stable.append(name)

    for name, prior_share in parent.items():
        if name not in current and prior_share >= EMERGED_FLOOR:
            resolved.append({"name": name, "prior_volume_share": round(prior_share, 4)})

    persisted = (
        [g["name"] for g in growing]
        + list(stable)
        + [d["name"] for d in declining]
    )

    fingerprint_changed = bool(emerged) or bool(resolved) or set(parent.keys()) != set(current.keys())

    return {
        "emerged":             emerged,
        "growing":             growing,
        "stable":              stable,
        "declining":           declining,
        "resolved":            resolved,
        "persisted":           persisted,
        "fingerprint_changed": fingerprint_changed,
    }


def evaluate_meaningful_delta(delta: dict, settings: dict) -> bool:
    """Return True when the delta is meaningful enough to write a checkpoint.

    Conditions (any one is sufficient):
      - abs(nps_delta)  >= settings.get("meaningful_delta_nps_points", 2.0)
      - abs(csat_delta) >= 0.15
      - >= 1 emerged topic
      - >= 1 resolved topic
    Bootstrap / tier-milestone short-circuits are handled by the caller
    (node_delta_compute / node_publish), not here.
    """
    delta = delta or {}
    settings = settings or {}

    nps_threshold = settings.get("meaningful_delta_nps_points", 2.0)
    try:
        nps_threshold = float(nps_threshold)
    except (TypeError, ValueError):
        nps_threshold = 2.0

    nps_delta = delta.get("nps_delta")
    if nps_delta is not None and abs(nps_delta) >= nps_threshold:
        return True

    csat_delta = delta.get("csat_delta")
    if csat_delta is not None and abs(csat_delta) >= 0.15:
        return True

    ces_delta = delta.get("ces_delta")
    if ces_delta is not None and abs(ces_delta) >= 0.3:  # CES is a 1-7 scale; 0.3 is meaningful
        return True

    topic_changes = delta.get("topic_changes") or {}
    if len(topic_changes.get("emerged") or []) >= 1:
        return True
    if len(topic_changes.get("resolved") or []) >= 1:
        return True

    return False
