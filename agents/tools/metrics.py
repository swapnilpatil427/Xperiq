"""Deterministic metric computations. All functions return typed dicts."""
from __future__ import annotations
import math
import statistics
from collections import Counter
from typing import Any

def compute_nps_ci(responses: list[dict], nps_field: str = "nps_score") -> dict:
    """Compute NPS with Wilson score CI. Returns {score, promoters, passives, detractors, n, ci_low, ci_high, below_minimum}."""
    scores = [r[nps_field] for r in responses if r.get(nps_field) is not None]
    n = len(scores)
    if n == 0:
        return {"score": None, "n": 0, "below_minimum": True}
    promoters   = sum(1 for s in scores if s >= 9) / n
    detractors  = sum(1 for s in scores if s <= 6) / n
    nps = round((promoters - detractors) * 100, 1)
    # Wilson score CI for NPS (treats promoter_rate and detractor_rate independently, difference)
    z = 1.96
    def wilson_ci(p, nn):
        if nn == 0: return (0.0, 0.0)
        center = (p + z**2 / (2 * nn)) / (1 + z**2 / nn)
        margin = z * math.sqrt((p * (1 - p) + z**2 / (4 * nn)) / (nn + z**2))
        return (max(0, center - margin), min(1, center + margin))
    p_lo, p_hi = wilson_ci(promoters, n)
    d_lo, d_hi = wilson_ci(detractors, n)
    ci_low  = round((p_lo - d_hi) * 100, 1)
    ci_high = round((p_hi - d_lo) * 100, 1)
    distribution = dict(Counter(int(s) for s in scores))
    return {
        "score": nps, "promoters": round(promoters * 100, 1),
        "passives": round((1 - promoters - detractors) * 100, 1),
        "detractors": round(detractors * 100, 1),
        "n": n, "ci_low": ci_low, "ci_high": ci_high,
        "distribution": distribution, "below_minimum": n < 30,
    }

def compute_csat(responses: list[dict], csat_field: str = "csat_score", scale: int = 5) -> dict:
    scores = [r[csat_field] for r in responses if r.get(csat_field) is not None]
    n = len(scores)
    if n == 0:
        return {"score": None, "n": 0, "below_minimum": True}
    mean = statistics.mean(scores)
    z = 1.96
    try:
        std = statistics.stdev(scores)
        margin = z * std / math.sqrt(n)
    except statistics.StatisticsError:
        margin = 0.0
    return {
        "score": round(mean, 2), "scale": scale,
        "ci_low": round(mean - margin, 2), "ci_high": round(mean + margin, 2),
        "n": n, "below_minimum": n < 30,
    }

def compute_ces(responses: list[dict], ces_field: str = "ces_score") -> dict:
    """Customer Effort Score (1-7 scale typically)."""
    scores = [r[ces_field] for r in responses if r.get(ces_field) is not None]
    n = len(scores)
    if n == 0:
        return {"score": None, "n": 0, "below_minimum": True}
    mean = statistics.mean(scores)
    return {"score": round(mean, 2), "n": n, "below_minimum": n < 30}

def compute_completion_rate(responses: list[dict]) -> dict:
    """Fraction of responses that answered all required questions."""
    n = len(responses)
    if n == 0:
        return {"rate": 0.0, "n": 0}
    completed = sum(1 for r in responses if r.get("completed", True))
    return {"rate": round(completed / n * 100, 1), "n": n}

def compute_response_trend(responses: list[dict], window_days: int = 30) -> list[dict]:
    """Group response counts by day for the last window_days days."""
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
    by_day: Counter = Counter()
    for r in responses:
        ts = r.get("submitted_at") or r.get("created_at")
        if not ts:
            continue
        try:
            if isinstance(ts, str):
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            else:
                dt = ts
            if dt >= cutoff:
                by_day[dt.strftime("%Y-%m-%d")] += 1
        except Exception:
            pass
    return [{"date": d, "count": c} for d, c in sorted(by_day.items())]

def extract_open_texts(responses: list[dict], questions: list[dict]) -> list[dict]:
    """Extract all open-text answers as {response_id, question_id, text}."""
    open_types = {"open_text", "short_text"}
    open_qids = {q["id"] for q in questions if q.get("type") in open_types}
    texts = []
    for r in responses:
        rid = str(r.get("id") or r.get("response_id") or "")
        for answer in (r.get("answers") or []):
            if answer.get("questionId") in open_qids:
                val = answer.get("value", "")
                if val and isinstance(val, str) and len(val.strip()) > 5:
                    texts.append({"response_id": rid, "question_id": answer["questionId"], "text": val.strip()})
    return texts


def compute_effort_score(texts: list[str]) -> float:
    """Linguistic effort score 1-7 (higher = more customer effort/frustration).

    Scores are derived from four independent signals:
    - Length: longer responses signal more effort to articulate a problem.
    - Frustration keywords: explicit negative/effort vocabulary.
    - Punctuation intensity: multiple ! or ? signals emotional escalation.
    - Negation density: 'not', 'never', 'can't', etc. signal unmet expectations.
    """
    FRUSTRATION = {
        'hard', 'difficult', 'frustrating', 'annoying', 'complicated',
        'confusing', 'terrible', "couldn't", "can't", 'impossible',
        'forever', 'broken', 'useless', 'awful', 'worst',
    }
    NEGATION = {'not', "n't", 'no', 'never', 'without', 'lack', "didn't", "doesn't"}

    if not texts:
        return 4.0

    scores = []
    for text in texts:
        lower = text.lower()
        words = lower.split()
        word_count = len(words)

        # Length signals effort (normalised: 0–1.5 points)
        length_factor = min(1.5, word_count / 25.0)
        # Frustration keywords (0–2 points)
        frustration_factor = min(2.0, sum(1 for w in FRUSTRATION if w in lower) * 0.5)
        # Punctuation intensity (0–1 point)
        punct_factor = min(1.0, (text.count('!') + text.count('?')) * 0.3)
        # Negation density (0–1 point)
        neg_factor = min(1.0, sum(1 for w in NEGATION if w in words) * 0.25)

        raw = 1.5 + length_factor + frustration_factor + punct_factor + neg_factor
        scores.append(min(7.0, max(1.0, raw)))

    return round(sum(scores) / len(scores), 2)


def compute_response_trend_analysis(responses: list[dict], window_days: int = 30) -> dict:
    """Extended trend: daily counts + linear trend + anomaly flag + 7-day forecast."""
    daily = compute_response_trend(responses, window_days)

    counts = [d['count'] for d in daily]
    if len(counts) < 3:
        return {
            'daily': daily,
            'trend': 'stable',
            'slope': 0.0,
            'delta_pct': 0,
            'anomaly': False,
            'forecast_7d': None,
            'recent_avg': 0.0,
        }

    # Simple linear regression (OLS, no libraries)
    n = len(counts)
    x = list(range(n))
    x_mean = sum(x) / n
    y_mean = sum(counts) / n

    numerator = sum((x[i] - x_mean) * (counts[i] - y_mean) for i in range(n))
    denominator = sum((xi - x_mean) ** 2 for xi in x)
    slope = numerator / denominator if denominator != 0 else 0.0

    # Trend direction based on recent vs earlier average
    recent_avg = sum(counts[-7:]) / max(1, len(counts[-7:]))
    earlier_avg = sum(counts[:-7]) / max(1, len(counts[:-7]))
    delta_pct = round(((recent_avg - earlier_avg) / max(1, earlier_avg)) * 100, 1)
    trend = 'up' if delta_pct > 15 else 'down' if delta_pct < -15 else 'stable'

    # Anomaly: last 3 days avg > 2× overall avg
    last3_avg = sum(counts[-3:]) / max(1, len(counts[-3:]))
    anomaly = last3_avg > (y_mean * 2.0) and y_mean > 0

    # Forecast next 7 days (linear extrapolation, capped at 0)
    forecast_7d = max(0, round(counts[-1] + slope * 7))

    return {
        'daily': daily,
        'trend': trend,
        'slope': round(slope, 3),
        'delta_pct': delta_pct,
        'anomaly': anomaly,
        'forecast_7d': forecast_7d,
        'recent_avg': round(recent_avg, 1),
    }


def filter_responses_by_window(responses: list[dict], window: str) -> list[dict]:
    """Filter responses to a time window.

    Args:
        responses: List of response dicts (must have 'submitted_at' or 'created_at').
        window: One of 'all_time', 'last_7d', 'last_30d'.

    Returns:
        Filtered response list. Responses without a timestamp are always included
        (to avoid silently discarding data).
    """
    from datetime import datetime, timezone, timedelta

    if window == 'all_time':
        return responses

    days = {'last_7d': 7, 'last_30d': 30}.get(window, 999)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    result = []
    for r in responses:
        ts = r.get('submitted_at') or r.get('created_at')
        if not ts:
            result.append(r)
            continue
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            except Exception:
                result.append(r)
                continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= cutoff:
            result.append(r)
    return result
