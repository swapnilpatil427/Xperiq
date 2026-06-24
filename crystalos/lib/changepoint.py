"""Changepoint detection for metric time series (Layer 2 of anomaly detection).

A compact PELT-style detector: it finds the single most significant mean-shift
breakpoint by minimising within-segment sum-of-squared-error, and reports it only
when the split improves SSE by more than a penalty (guards against noise). This is
deterministic and dependency-free (no ruptures/numpy), so it's fast and testable.
For Experient's series lengths (daily points over weeks) a single-best-split scan
is more than sufficient; full multi-changepoint PELT can layer on later.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Changepoint:
    index: int          # split index: segment A = [0:index], B = [index:]
    mean_before: float
    mean_after: float
    delta: float        # mean_after - mean_before
    confidence: float   # 0..1, relative SSE improvement


def _sse(xs: list[float]) -> float:
    n = len(xs)
    if n == 0:
        return 0.0
    m = sum(xs) / n
    return sum((x - m) ** 2 for x in xs)


def detect_changepoint(series: list[float], min_segment: int = 2, penalty_ratio: float = 0.10) -> Changepoint | None:
    """Return the single best mean-shift changepoint, or None if none is significant.

    `penalty_ratio`: the split must reduce total SSE by at least this fraction of the
    no-split SSE to count (filters noise).
    """
    xs = [float(v) for v in series if v is not None]
    n = len(xs)
    if n < 2 * min_segment:
        return None

    total_sse = _sse(xs)
    if total_sse == 0:
        return None  # perfectly flat — no changepoint

    best = None
    best_split_sse = None
    for i in range(min_segment, n - min_segment + 1):
        split_sse = _sse(xs[:i]) + _sse(xs[i:])
        if best_split_sse is None or split_sse < best_split_sse:
            best_split_sse = split_sse
            best = i

    if best is None:
        return None

    improvement = (total_sse - best_split_sse) / total_sse
    if improvement < penalty_ratio:
        return None

    before, after = xs[:best], xs[best:]
    mean_before = sum(before) / len(before)
    mean_after = sum(after) / len(after)
    return Changepoint(
        index=best,
        mean_before=round(mean_before, 4),
        mean_after=round(mean_after, 4),
        delta=round(mean_after - mean_before, 4),
        confidence=round(min(1.0, improvement), 4),
    )
