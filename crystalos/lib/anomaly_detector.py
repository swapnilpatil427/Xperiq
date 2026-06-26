"""Crystal three-layer anomaly detection (Alerts AI-category).

Layer 1: statistical (Z-score of the latest point vs the prior baseline)
Layer 2: changepoint (mean-shift break — see lib/changepoint.py)
Layer 3: narration (plain-English explanation per the alert narration standard)

Pure detection (`detect`) is deterministic/testable. `record_anomaly_alert` persists
a rule-less `alert_events` row (source='crystal', enabled by migration 17) and emits
a `crystal.anomaly_detected` notification through the Event Engine bus.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any

from crystalos.lib.changepoint import detect_changepoint, Changepoint

Z_DETECT = 2.5
Z_CRITICAL = 3.5


@dataclass
class AnomalyResult:
    detected: bool
    z_score: float = 0.0
    severity: str = "info"
    changepoint: Changepoint | None = None
    narration: str = ""
    metric_value: float | None = None
    baseline: float | None = None


def _mean_std(xs: list[float]) -> tuple[float, float]:
    n = len(xs)
    if n == 0:
        return 0.0, 0.0
    mean = sum(xs) / n
    var = sum((x - mean) ** 2 for x in xs) / (n - 1) if n > 1 else 0.0
    return mean, math.sqrt(var)


def classify_severity(z: float) -> str:
    az = abs(z)
    if az >= Z_CRITICAL:
        return "critical"
    if az >= Z_DETECT:
        return "warning"
    return "info"


def detect(series: list[float], *, metric: str = "metric", min_points: int = 6) -> AnomalyResult:
    """Detect an anomaly in the latest point of `series` against its baseline."""
    xs = [float(v) for v in series if v is not None]
    if len(xs) < min_points:
        return AnomalyResult(detected=False)

    baseline, latest = xs[:-1], xs[-1]
    mean, std = _mean_std(baseline)
    if std == 0:
        return AnomalyResult(detected=False, metric_value=latest, baseline=round(mean, 2))

    z = (latest - mean) / std
    if abs(z) < Z_DETECT:
        return AnomalyResult(detected=False, z_score=round(z, 2), metric_value=latest, baseline=round(mean, 2))

    cp = detect_changepoint(xs)
    severity = classify_severity(z)
    narration = narrate(metric, latest, mean, z, cp)
    return AnomalyResult(
        detected=True, z_score=round(z, 2), severity=severity,
        changepoint=cp, narration=narration,
        metric_value=round(latest, 2), baseline=round(mean, 2),
    )


def narrate(metric: str, latest: float, baseline: float, z: float, cp: Changepoint | None) -> str:
    """Plain-English narration following the alert narration template (§7.3)."""
    direction = "spiked" if z > 0 else "dropped"
    magnitude = abs(latest - baseline)
    parts = [
        f"{metric} {direction} to {round(latest, 1)} — {round(magnitude, 1)} away from the "
        f"~{round(baseline, 1)} baseline ({abs(round(z, 1))}σ)."
    ]
    if cp:
        parts.append(
            f"The shift began around point {cp.index} of the window "
            f"(mean moved {round(cp.mean_before, 1)} → {round(cp.mean_after, 1)})."
        )
    parts.append(
        "RECOMMENDED ACTION: review responses in this window for the driving factor "
        "before it compounds."
    )
    return " ".join(parts)


async def record_anomaly_alert(conn, redis_client, *, org_id, survey_id, metric, result: AnomalyResult):
    """Persist a Crystal alert_event (rule-less) + history, and publish a notification.

    `conn` is a psycopg async connection (caller manages the pool). Best-effort
    notification publish via the shared bus.
    """
    if not result.detected:
        return None

    title = f"{metric} anomaly detected"
    async with conn.cursor() as cur:
        await cur.execute(
            """INSERT INTO alert_events
                 (org_id, rule_id, survey_id, alert_type, severity, title, description,
                  crystal_narration, source, metric_value, metric_baseline, metric_change, evidence)
               VALUES (%s, NULL, %s, 'AI-01', %s, %s, %s, %s, 'crystal', %s, %s, %s, %s)
               RETURNING id""",
            (org_id, survey_id, result.severity, title, result.narration, result.narration,
             result.metric_value, result.baseline,
             (result.metric_value or 0) - (result.baseline or 0),
             json.dumps({"z_score": result.z_score, "metric": metric})),
        )
        row = await cur.fetchone()
        event_id = row[0]
        await cur.execute(
            """INSERT INTO alert_history (alert_event_id, user_id, action, from_status, to_status)
               VALUES (%s, NULL, 'triggered', NULL, 'active')""",
            (event_id,),
        )

    # Deliver through the notification bus (best-effort).
    try:
        from crystalos.lib.notification_bridge import publish_notification_event
        await publish_notification_event(
            redis_client, type="crystal.anomaly_detected", org_id=org_id,
            entity_type="alert", entity_id=str(event_id), priority=result.severity,
            title=title, payload={"crystalSummary": result.narration, "actionUrl": "/app/alerts"},
        )
    except Exception:
        pass
    return event_id
