"""Bug tracker — structured bug reports with auto-severity, SLA enforcement, and escalation.

Phase 6: Bug Tracking at Scale (ENTERPRISE_CRYSTALOS_REDESIGN.md Part XV)
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from crystalos.lib.logger import logger

if TYPE_CHECKING:
    from crystalos.lib.feedback_detector import ProductSignal
    from crystalos.crystal.context import CrystalContext

# ── Team routing map ─────────────────────────────────────────────────────────────

FEATURE_TEAM_MAP: dict[str, str] = {
    "nps_calculation": "insights-team",
    "survey_builder":  "survey-team",
    "workflows":       "automation-team",
    "crystal":         "crystalos-team",
    "auth":            "platform-team",
    "billing":         "platform-team",
    "exports":         "data-team",
    "notifications":   "platform-team",
}


def _assign_team(affects_feature: str | None) -> str:
    """Return the responsible team for a given feature area.

    Falls back to 'triage-team' when no mapping is found.
    """
    if not affects_feature:
        return "triage-team"
    feature_lower = affects_feature.lower()
    for prefix, team in FEATURE_TEAM_MAP.items():
        if prefix in feature_lower:
            return team
    return "triage-team"


# ── Auto-severity computation ────────────────────────────────────────────────────

def _compute_auto_severity(
    affected_orgs: int,
    affected_brands: int,
    hours_open: float,
) -> str:
    """Compute severity from breadth and speed of spread.

    Rules:
    - critical: 3+ brands  OR  5+ orgs  OR  (2+ brands AND within 2 hours)
    - high:     2 brands   OR  3+ orgs
    - medium:   2 orgs
    - low:      1 org
    """
    if affected_brands >= 3 or affected_orgs >= 5:
        return "critical"
    if affected_brands >= 2 and hours_open <= 2:
        return "critical"  # rapid cross-brand spread
    if affected_brands >= 2 or affected_orgs >= 3:
        return "high"
    if affected_orgs >= 2:
        return "medium"
    return "low"


# ── SLA deadline computation ─────────────────────────────────────────────────────

async def _compute_sla_deadline(
    severity: str,
    created_at: datetime,
    conn,
) -> datetime:
    """Look up ack SLA hours for this severity and return the deadline."""
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                """SELECT ack_sla_hrs FROM bug_sla_configs
                   WHERE severity = %s AND brand_id = ''
                   LIMIT 1""",
                (severity,),
            )
            row = await cur.fetchone()
            ack_hours = int(row[0]) if row else 24
    except Exception as exc:
        logger.warning("sla_config_lookup_failed", severity=severity, error=str(exc))
        ack_hours = 24  # safe default

    from datetime import timedelta
    return created_at + timedelta(hours=ack_hours)


# ── Bug report creation ──────────────────────────────────────────────────────────

async def create_bug_report(
    signal: "ProductSignal",
    ctx: "CrystalContext",
    conn,
) -> str:
    """Insert a new bug_report row and seed the bug_report_affected table.

    Returns the new bug_id (UUID string).
    """
    bug_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    team = _assign_team(signal.affects_feature)
    auto_severity = _compute_auto_severity(
        affected_orgs=1,
        affected_brands=1,
        hours_open=0.0,
    )
    sla_deadline = await _compute_sla_deadline(auto_severity, now, conn)

    brand_id = ctx.brand.brand_id if ctx.brand else None  # type: ignore[union-attr]

    await conn.execute(
        """INSERT INTO bug_reports
               (id, title, description, affects_feature, auto_severity,
                reported_severity, affected_org_count, affected_brand_count,
                routing, assigned_team, sla_deadline, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            bug_id,
            signal.title,
            signal.description,
            signal.affects_feature or "unknown",
            auto_severity,
            signal.severity,
            1,
            1,
            signal.routing,
            team,
            sla_deadline,
            now,
        ),
    )

    # Seed the affected table with the first reporter
    await conn.execute(
        """INSERT INTO bug_report_affected (bug_id, org_id, brand_id, user_id, reported_at)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (bug_id, org_id) DO NOTHING""",
        (bug_id, ctx.org_id, brand_id, ctx.user_id, now),
    )

    logger.info(
        "bug_report_created",
        bug_id=bug_id,
        title=signal.title,
        severity=auto_severity,
        team=team,
    )
    return bug_id


# ── Record additional affected org ───────────────────────────────────────────────

async def record_additional_affected_org(
    bug_id: str,
    ctx: "CrystalContext",
    conn,
) -> None:
    """Register another org as affected by an existing bug and potentially escalate it."""
    brand_id = ctx.brand.brand_id if ctx.brand else None  # type: ignore[union-attr]

    # INSERT ignore-on-conflict so the same org is only counted once
    result = await conn.execute(
        """INSERT INTO bug_report_affected (bug_id, org_id, brand_id, user_id)
           VALUES (%s, %s, %s, %s)
           ON CONFLICT (bug_id, org_id) DO NOTHING""",
        (bug_id, ctx.org_id, brand_id, ctx.user_id),
    )

    # Only update counts + potentially escalate when this is a new org
    # psycopg3: result.rowcount gives affected rows
    rows_inserted = getattr(result, "rowcount", 1)
    if rows_inserted == 0:
        return  # org already recorded — no change needed

    # Recount actual unique orgs and brands from the affected table
    async with conn.cursor() as cur:
        await cur.execute(
            """SELECT COUNT(DISTINCT org_id), COUNT(DISTINCT brand_id)
               FROM bug_report_affected
               WHERE bug_id = %s""",
            (bug_id,),
        )
        row = await cur.fetchone()
        org_count = int(row[0]) if row else 1
        brand_count = int(row[1]) if row else 1

    await conn.execute(
        """UPDATE bug_reports
           SET affected_org_count = %s, affected_brand_count = %s
           WHERE id = %s""",
        (org_count, brand_count, bug_id),
    )

    await _maybe_escalate_bug(bug_id, conn)


# ── Escalation logic ─────────────────────────────────────────────────────────────

async def _maybe_escalate_bug(bug_id: str, conn) -> None:
    """Recompute auto_severity from current counts; escalate if changed."""
    async with conn.cursor() as cur:
        await cur.execute(
            """SELECT auto_severity, affected_org_count, affected_brand_count, created_at
               FROM bug_reports WHERE id = %s""",
            (bug_id,),
        )
        row = await cur.fetchone()
    if row is None:
        return

    old_severity, org_count, brand_count, created_at = row
    now = datetime.now(timezone.utc)
    # Ensure created_at is timezone-aware
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    hours_open = (now - created_at).total_seconds() / 3600

    new_severity = _compute_auto_severity(int(org_count), int(brand_count), hours_open)
    if new_severity == old_severity:
        return

    new_deadline = await _compute_sla_deadline(new_severity, created_at, conn)

    await conn.execute(
        """UPDATE bug_reports
           SET auto_severity = %s, sla_deadline = %s
           WHERE id = %s""",
        (new_severity, new_deadline, bug_id),
    )

    await conn.execute(
        """INSERT INTO bug_escalations (bug_id, from_sev, to_sev, reason, triggered_by)
           VALUES (%s, %s, %s, %s, 'auto')""",
        (
            bug_id,
            old_severity,
            new_severity,
            f"Affected {org_count} orgs, {brand_count} brands",
        ),
    )

    logger.info(
        "bug_escalated",
        bug_id=bug_id,
        from_sev=old_severity,
        to_sev=new_severity,
    )

    if new_severity == "critical":
        await _fire_critical_alert(bug_id, conn)


# ── Critical alert ───────────────────────────────────────────────────────────────

async def _fire_critical_alert(bug_id: str, conn) -> None:
    """Insert a critical_bug notification event."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT title, affects_feature, affected_org_count, routing FROM bug_reports WHERE id = %s",
            (bug_id,),
        )
        row = await cur.fetchone()

    if row is None:
        return

    title, feature, org_count, routing = row

    try:
        await conn.execute(
            """INSERT INTO crystal_event_queue (type, payload, created_at)
               VALUES (%s, %s::jsonb, NOW())""",
            (
                "critical_bug",
                json.dumps({
                    "bug_id":       bug_id,
                    "title":        title,
                    "feature":      feature,
                    "org_count":    org_count,
                    "routing":      routing,
                    "severity":     "critical",
                }),
            ),
        )
        logger.warning(
            "critical_bug_alert_fired",
            bug_id=bug_id,
            title=title,
            org_count=org_count,
        )
    except Exception as exc:
        logger.error("critical_bug_alert_failed", bug_id=bug_id, error=str(exc))


# ── SLA breach checker (called by scheduler every 15 min) ────────────────────────

async def check_sla_breaches(conn) -> None:
    """Find bugs past their SLA deadline with no acknowledgment; set sla_breached=true
    and fire notification events.
    """
    async with conn.cursor() as cur:
        await cur.execute(
            """SELECT id, title, effective_severity, assigned_team,
                      sla_deadline, routing, affected_brand_count
               FROM bug_reports
               WHERE sla_deadline < NOW()
                 AND acknowledged_at IS NULL
                 AND sla_breached = false
                 AND status != 'resolved'""",
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description] if rows else []

    breaches = [dict(zip(cols, row)) for row in rows]

    for bug in breaches:
        try:
            await conn.execute(
                "UPDATE bug_reports SET sla_breached = true WHERE id = %s",
                (bug["id"],),
            )
            await conn.execute(
                """INSERT INTO crystal_event_queue (type, payload, created_at)
                   VALUES (%s, %s::jsonb, NOW())""",
                (
                    "sla_breach",
                    json.dumps({
                        "bug_id":          str(bug["id"]),
                        "title":           bug["title"],
                        "severity":        bug["effective_severity"],
                        "team":            bug["assigned_team"],
                        "routing":         bug["routing"],
                        "brands_affected": bug["affected_brand_count"],
                        "sla_deadline":    bug["sla_deadline"].isoformat() if bug["sla_deadline"] else None,
                    }),
                ),
            )
            logger.warning(
                "sla_breach_detected",
                bug_id=str(bug["id"]),
                severity=bug["effective_severity"],
                team=bug["assigned_team"],
            )
        except Exception as exc:
            logger.error("sla_breach_process_failed", bug_id=str(bug["id"]), error=str(exc))

    if breaches:
        logger.info("sla_breach_check_complete", breach_count=len(breaches))

    # Commit all changes
    await conn.commit()
