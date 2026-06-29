"""Response sampling for manual run profiles (04 §10).

Pure functions over response-metadata rows so they are deterministic and unit-testable
without a DB. Each row is a dict with at least:
    {"id": str, "submitted_at": datetime|str|None, "sentiment": str|None, "nps_score": int|None}

``stratified_sample``     — manual_expert large corpus (week × sentiment × has_nps buckets).
``recency_weighted_sample`` — manual_quick (top 60% by recency, stratified fill by sentiment).

Both return a list of selected id strings, capped at ``cap``. When the corpus is
already ≤ cap, all ids are returned (caller decides full-corpus vs sample).
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timezone
from typing import Any


def _as_dt(val: Any) -> datetime | None:
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str) and val:
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _sentiment_tertile(row: dict) -> str:
    """Bucket a row into neg / neu / pos by sentiment label or numeric score."""
    s = row.get("sentiment")
    if isinstance(s, str) and s:
        sl = s.lower()
        if sl.startswith("neg"):
            return "neg"
        if sl.startswith("pos"):
            return "pos"
        return "neu"
    score = row.get("sentiment_score")
    try:
        score = float(score) if score is not None else None
    except (TypeError, ValueError):
        score = None
    if score is None:
        # fall back to NPS bands when present
        nps = row.get("nps_score")
        try:
            nps = int(nps) if nps is not None else None
        except (TypeError, ValueError):
            nps = None
        if nps is None:
            return "neu"
        return "neg" if nps <= 6 else ("pos" if nps >= 9 else "neu")
    return "neg" if score < -0.1 else ("pos" if score > 0.1 else "neu")


def _week_key(row: dict) -> str:
    dt = _as_dt(row.get("submitted_at"))
    if dt is None:
        return "unknown"
    iso = dt.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def stratified_sample(rows: list[dict], cap: int, *, seed: int = 42) -> list[str]:
    """Stratified sample for manual_expert large corpus (04 §10).

    1. Bucket by week × sentiment_tertile × has_nps_score.
    2. Proportional allocation per bucket.
    3. Within bucket: recency-biased weighted choice (weight ∝ exp(-age_days/30)).

    Returns up to ``cap`` id strings. If len(rows) <= cap, returns all ids.
    """
    ids_all = [str(r.get("id")) for r in rows if r.get("id") is not None]
    if cap <= 0:
        return []
    if len(ids_all) <= cap:
        return ids_all

    rng = random.Random(seed)
    now = datetime.now(timezone.utc)

    buckets: dict[tuple, list[dict]] = {}
    for r in rows:
        if r.get("id") is None:
            continue
        has_nps = r.get("nps_score") is not None
        key = (_week_key(r), _sentiment_tertile(r), has_nps)
        buckets.setdefault(key, []).append(r)

    total = sum(len(v) for v in buckets.values())
    selected: list[str] = []
    # Proportional allocation; guarantee ≥1 from each non-empty bucket where budget allows.
    for key, members in buckets.items():
        if not selected and not members:
            continue
        alloc = max(1, round(cap * len(members) / total)) if total else 0
        alloc = min(alloc, len(members))

        def _weight(row: dict) -> float:
            dt = _as_dt(row.get("submitted_at"))
            if dt is None:
                return 0.5
            age_days = max(0.0, (now - dt).total_seconds() / 86400.0)
            return math.exp(-age_days / 30.0)

        weights = [_weight(m) for m in members]
        chosen_idx: set[int] = set()
        # Weighted sampling without replacement.
        pool = list(range(len(members)))
        for _ in range(min(alloc, len(members))):
            w = [weights[i] for i in pool]
            tot = sum(w) or 1.0
            pick = rng.choices(pool, weights=[x / tot for x in w], k=1)[0]
            chosen_idx.add(pick)
            pool.remove(pick)
        for i in chosen_idx:
            selected.append(str(members[i].get("id")))

    # Trim or top up to exactly cap.
    if len(selected) > cap:
        rng.shuffle(selected)
        selected = selected[:cap]
    elif len(selected) < cap:
        remaining = [i for i in ids_all if i not in set(selected)]
        rng.shuffle(remaining)
        selected.extend(remaining[: cap - len(selected)])
    return selected


def recency_weighted_sample(rows: list[dict], cap: int, *, seed: int = 42) -> list[str]:
    """Recency-weighted sample for manual_quick (04 §10).

    1. Sort by submitted_at DESC.
    2. Take top 60% by recency.
    3. Stratified fill to ``cap`` across sentiment classes.

    Returns up to ``cap`` id strings. If len(rows) <= cap, returns all ids.
    """
    ids_all = [str(r.get("id")) for r in rows if r.get("id") is not None]
    if cap <= 0:
        return []
    if len(ids_all) <= cap:
        return ids_all

    rng = random.Random(seed)
    sortable = [r for r in rows if r.get("id") is not None]
    sortable.sort(
        key=lambda r: (_as_dt(r.get("submitted_at")) or datetime.min.replace(tzinfo=timezone.utc)),
        reverse=True,
    )
    top_n = max(cap, int(len(sortable) * 0.6))
    recent = sortable[:top_n]

    # Stratify the recent pool by sentiment class, allocate proportionally to cap.
    by_class: dict[str, list[dict]] = {}
    for r in recent:
        by_class.setdefault(_sentiment_tertile(r), []).append(r)

    selected: list[str] = []
    total = sum(len(v) for v in by_class.values()) or 1
    for cls, members in by_class.items():
        alloc = min(len(members), max(1, round(cap * len(members) / total)))
        picks = rng.sample(members, alloc) if alloc < len(members) else members
        selected.extend(str(m.get("id")) for m in picks)

    if len(selected) > cap:
        rng.shuffle(selected)
        selected = selected[:cap]
    elif len(selected) < cap:
        remaining = [i for i in ids_all if i not in set(selected)]
        rng.shuffle(remaining)
        selected.extend(remaining[: cap - len(selected)])
    return selected
