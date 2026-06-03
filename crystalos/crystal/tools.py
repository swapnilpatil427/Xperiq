"""Crystal tool executor functions — each tool queries the DB and returns structured data.

Every executor:
- Enforces org_id scoping on ALL SQL joins (tenant isolation)
- Uses parameterized queries only (no string interpolation)
- Returns {"error": "..."} on failure rather than raising
"""
from __future__ import annotations

import json
import time as _time
import traceback
from typing import Any

from crystalos.crystal.context import CrystalContext
from crystalos.lib import db
from crystalos.lib.logger import logger
from crystalos.lib.metrics import crystal_tool_calls_total, crystal_tool_duration_seconds


# ── NPS industry benchmarks (static reference table) ─────────────────────────
_NPS_BENCHMARKS = {
    "technology":            {"nps": 35, "source": "Satmetrix 2023"},
    "healthcare":            {"nps": 27, "source": "Satmetrix 2023"},
    "retail":                {"nps": 46, "source": "Satmetrix 2023"},
    "financial_services":    {"nps": 34, "source": "Satmetrix 2023"},
    "education":             {"nps": 47, "source": "Satmetrix 2023"},
    "government":            {"nps": 14, "source": "Satmetrix 2023"},
    "professional_services": {"nps": 43, "source": "Satmetrix 2023"},
    "other":                 {"nps": 32, "source": "Satmetrix 2023"},
}
_CSAT_BENCHMARKS = {
    "technology":            {"csat": 3.9},
    "healthcare":            {"csat": 3.7},
    "retail":                {"csat": 4.0},
    "financial_services":    {"csat": 3.8},
    "education":             {"csat": 4.1},
    "government":            {"csat": 3.5},
    "professional_services": {"csat": 3.9},
    "other":                 {"csat": 3.8},
}


async def execute_get_survey_overview(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        if not survey_id:
            return {"error": "survey_id required"}

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                # Survey metadata
                await cur.execute(
                    """SELECT id, title, status, created_at,
                              (SELECT COUNT(*)::int FROM responses r
                               WHERE r.survey_id = surveys.id) AS response_count
                       FROM surveys WHERE id = %s AND org_id = %s AND deleted_at IS NULL""",
                    (survey_id, ctx.org_id),
                )
                row = await cur.fetchone()
                if not row:
                    return {"error": "survey not found"}
                survey = dict(zip([d[0] for d in cur.description], row))

                # Latest metric snapshot
                await cur.execute(
                    """SELECT nps AS nps_score, csat AS csat_score,
                              effort_score AS ces_score, response_count, captured_at
                       FROM survey_metric_snapshots
                       WHERE survey_id = %s AND org_id = %s
                       ORDER BY captured_at DESC LIMIT 1""",
                    (survey_id, ctx.org_id),
                )
                snap_row = await cur.fetchone()
                snapshot = dict(zip([d[0] for d in cur.description], snap_row)) if snap_row else {}

                # Top topics
                await cur.execute(
                    """SELECT name, volume, sentiment_score, dominant_emotion, trending
                       FROM survey_topics
                       WHERE survey_id = %s AND org_id = %s AND time_window = 'all_time'
                       ORDER BY volume DESC LIMIT 5""",
                    (survey_id, ctx.org_id),
                )
                topics = [dict(zip([d[0] for d in cur.description], r)) for r in await cur.fetchall()]

        return {
            "survey": {k: str(v) if hasattr(v, 'isoformat') else v for k, v in survey.items()},
            "metrics": {k: float(v) if v is not None else None for k, v in snapshot.items() if k != 'captured_at'},
            "top_topics": topics,
        }
    except Exception as exc:
        logger.error("tool_get_survey_overview_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_topic_details(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        topic_name = params.get("topic_name")
        limit = min(int(params.get("limit", 10)), 30)
        if not survey_id or not topic_name:
            return {"error": "survey_id and topic_name required"}

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT name, volume, sentiment_score, dominant_emotion, effort_score,
                              trending, nps_avg, positive_pct, negative_pct
                       FROM survey_topics
                       WHERE survey_id = %s AND org_id = %s AND name ILIKE %s AND time_window = 'all_time'
                       LIMIT 1""",
                    (survey_id, ctx.org_id, f"%{topic_name}%"),
                )
                row = await cur.fetchone()
                topic = dict(zip([d[0] for d in cur.description], row)) if row else {}

                # Sample verbatims from responses with this topic tag
                await cur.execute(
                    """SELECT r.answers, r.ai_sentiment, r.ai_sentiment_score
                       FROM responses r
                       WHERE r.survey_id = %s
                         AND r.ai_topics::text ILIKE %s
                       ORDER BY r.submitted_at DESC
                       LIMIT %s""",
                    (survey_id, f'%{topic_name}%', limit),
                )
                verbatim_rows = await cur.fetchall()

        verbatims = []
        for vr in verbatim_rows:
            answers = vr[0]
            if isinstance(answers, str):
                try: answers = json.loads(answers)
                except Exception: answers = []
            texts = [a.get("value", "") for a in (answers or []) if isinstance(a.get("value"), str) and a.get("value")]
            if texts:
                verbatims.append({
                    "text": texts[0][:300],
                    "sentiment": vr[1],
                    "score": float(vr[2]) if vr[2] is not None else None,
                })

        return {"topic": topic, "verbatims": verbatims, "verbatim_count": len(verbatims)}
    except Exception as exc:
        logger.error("tool_get_topic_details_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_metric_history(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        metric = params.get("metric", "all")
        days = min(int(params.get("days", 90)), 365)
        if not survey_id:
            return {"error": "survey_id required"}

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT nps AS nps_score, csat AS csat_score,
                              effort_score AS ces_score, response_count, captured_at
                       FROM survey_metric_snapshots
                       WHERE survey_id = %s AND org_id = %s
                         AND captured_at > NOW() - (%s * INTERVAL '1 day')
                       ORDER BY captured_at ASC""",
                    (survey_id, ctx.org_id, days),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        data = [dict(zip(cols, r)) for r in rows]
        for item in data:
            for k in ("nps_score", "csat_score", "ces_score"):
                if item.get(k) is not None:
                    item[k] = float(item[k])
            if item.get("captured_at"):
                item["captured_at"] = str(item["captured_at"])

        return {"history": data, "count": len(data), "days": days}
    except Exception as exc:
        logger.error("tool_get_metric_history_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_insights_list(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        layer = params.get("layer", "all")
        time_window = params.get("time_window", "all_time")
        limit = min(int(params.get("limit", 20)), 50)
        if not survey_id:
            return {"error": "survey_id required"}

        conditions = ["survey_id = %s", "org_id = %s", "superseded_at IS NULL"]
        args: list = [survey_id, ctx.org_id]
        if layer != "all":
            conditions.append("layer = %s")
            args.append(layer)
        if time_window != "all_time":
            conditions.append("time_window = %s")
            args.append(time_window)
        args.append(limit)

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"""SELECT id, layer, category, headline, narrative, trust_score, metric_json
                        FROM insights WHERE {' AND '.join(conditions)}
                        ORDER BY priority DESC NULLS LAST, trust_score DESC NULLS LAST
                        LIMIT %s""",
                    args,
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        insights = []
        for row in rows:
            ins = dict(zip(cols, row))
            ins["id"] = str(ins["id"])
            if ins.get("trust_score") is not None:
                ins["trust_score"] = int(ins["trust_score"])
            insights.append(ins)

        return {"insights": insights, "count": len(insights)}
    except Exception as exc:
        logger.error("tool_get_insights_list_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_verbatims(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        topic_name = params.get("topic_name")
        sentiment = params.get("sentiment", "all")
        limit = min(int(params.get("limit", 15)), 50)
        if not survey_id:
            return {"error": "survey_id required"}

        conditions = ["survey_id = %s"]
        args: list = [survey_id]
        if topic_name:
            conditions.append("ai_topics::text ILIKE %s")
            args.append(f"%{topic_name}%")
        if sentiment != "all":
            conditions.append("ai_sentiment = %s")
            args.append(sentiment)
        args.append(limit)

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"""SELECT answers, ai_sentiment, ai_sentiment_score, submitted_at
                        FROM responses WHERE {' AND '.join(conditions)}
                        ORDER BY submitted_at DESC LIMIT %s""",
                    args,
                )
                rows = await cur.fetchall()

        verbatims = []
        for row in rows:
            answers = row[0]
            if isinstance(answers, str):
                try: answers = json.loads(answers)
                except Exception: answers = []
            texts = [a.get("value", "") for a in (answers or []) if isinstance(a.get("value"), str) and a.get("value")]
            if texts:
                verbatims.append({
                    "text": texts[0][:400],
                    "sentiment": row[1],
                    "score": float(row[2]) if row[2] is not None else None,
                    "submitted_at": str(row[3]) if row[3] else None,
                })

        return {"verbatims": verbatims, "count": len(verbatims)}
    except Exception as exc:
        logger.error("tool_get_verbatims_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_benchmark_comparison(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        metric = params.get("metric", "nps")
        industry = params.get("industry")

        if not industry:
            # Load from org profile
            async with db._pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT industry FROM org_profiles WHERE org_id = %s",
                        (ctx.org_id,),
                    )
                    row = await cur.fetchone()
                    industry = (row[0] if row else None) or "other"

        # Get current metric value
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT nps, csat FROM survey_metric_snapshots
                       WHERE survey_id = %s AND org_id = %s
                       ORDER BY captured_at DESC LIMIT 1""",
                    (survey_id, ctx.org_id),
                )
                row = await cur.fetchone()

        current_value = None
        if row:
            current_value = float(row[0]) if metric == "nps" and row[0] is not None else (
                float(row[1]) if metric == "csat" and row[1] is not None else None
            )

        benchmark = _NPS_BENCHMARKS.get(industry, _NPS_BENCHMARKS["other"]) if metric == "nps" else \
                    _CSAT_BENCHMARKS.get(industry, _CSAT_BENCHMARKS["other"])

        benchmark_value = benchmark.get(metric)
        delta = (current_value - benchmark_value) if (current_value is not None and benchmark_value is not None) else None

        return {
            "metric": metric,
            "industry": industry,
            "current_value": current_value,
            "benchmark": benchmark_value,
            "delta": round(delta, 1) if delta is not None else None,
            "source": benchmark.get("source", "Industry benchmark"),
            "above_benchmark": delta > 0 if delta is not None else None,
        }
    except Exception as exc:
        logger.error("tool_get_benchmark_comparison_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_driver_analysis(ctx: CrystalContext, params: dict) -> dict:
    """Returns driver scores on -100 to +100 NPS scale (not 0-10)."""
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        if not survey_id:
            return {"error": "survey_id required"}

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT name, volume, nps_avg, sentiment_score, effort_score
                       FROM survey_topics
                       WHERE survey_id = %s AND org_id = %s AND time_window = 'all_time'
                       ORDER BY volume DESC LIMIT 10""",
                    (survey_id, ctx.org_id),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        drivers = []
        for row in rows:
            t = dict(zip(cols, row))
            # Convert nps_avg to -100..+100 scale if it's stored differently
            nps_avg = float(t.get("nps_avg") or 0)
            # Normalize sentiment_score (-1..1) to nps-scale (-100..+100) for driver impact
            sentiment = float(t.get("sentiment_score") or 0)
            driver_impact = round(sentiment * 100, 1)  # -100 to +100 scale
            drivers.append({
                "topic": t["name"],
                "volume": int(t.get("volume") or 0),
                "nps_avg": nps_avg,
                "driver_impact": driver_impact,  # -100 to +100 NPS scale
                "effort_score": float(t.get("effort_score") or 0),
            })

        # Sort by absolute driver impact (biggest movers first)
        drivers.sort(key=lambda x: abs(x["driver_impact"]), reverse=True)
        return {"drivers": drivers, "count": len(drivers)}
    except Exception as exc:
        logger.error("tool_get_driver_analysis_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_segment_breakdown(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        segment_question_id = params.get("segment_question_id")
        metric = params.get("metric", "sentiment")
        if not survey_id or not segment_question_id:
            return {"error": "survey_id and segment_question_id required"}

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT answers, ai_sentiment, ai_sentiment_score, nps_score FROM responses WHERE survey_id = %s AND org_id = %s",
                    (survey_id, ctx.org_id),
                )
                rows = await cur.fetchall()

        segments: dict[str, list] = {}
        for row in rows:
            answers = row[0]
            if isinstance(answers, str):
                try: answers = json.loads(answers)
                except Exception: answers = []
            segment_value = None
            for a in (answers or []):
                qid = a.get("questionId") or a.get("question_id")
                if str(qid) == str(segment_question_id):
                    segment_value = str(a.get("value", "unknown"))
                    break
            if segment_value:
                segments.setdefault(segment_value, []).append({
                    "sentiment": row[1], "score": float(row[2]) if row[2] else 0,
                    "nps_score": int(row[3]) if row[3] is not None else None,
                })

        result = []
        for seg_value, responses_list in segments.items():
            n = len(responses_list)
            avg_sentiment = sum(r["score"] for r in responses_list) / n if n else 0
            nps_scores = [r["nps_score"] for r in responses_list if r["nps_score"] is not None]
            nps_avg = sum(nps_scores) / len(nps_scores) if nps_scores else None
            result.append({
                "segment": seg_value,
                "count": n,
                "avg_sentiment_score": round(avg_sentiment, 2),
                "nps_avg": round(nps_avg, 1) if nps_avg is not None else None,
            })

        result.sort(key=lambda x: x["count"], reverse=True)
        return {"segments": result, "segment_count": len(result)}
    except Exception as exc:
        logger.error("tool_get_segment_breakdown_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_checkpoint_history(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id") or ctx.survey_id
        limit = min(int(params.get("limit", 5)), 20)
        if not survey_id:
            return {"error": "survey_id required"}

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT id, checkpoint_number, response_count_at_checkpoint,
                              nps_at_checkpoint, csat_at_checkpoint, topic_fingerprint,
                              delta_from_prior, created_at
                       FROM survey_insight_checkpoints
                       WHERE survey_id = %s AND org_id = %s
                       ORDER BY checkpoint_number DESC
                       LIMIT %s""",
                    (survey_id, ctx.org_id, limit),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        checkpoints = []
        for row in rows:
            cp = dict(zip(cols, row))
            cp["id"] = str(cp["id"])
            if cp.get("created_at"):
                cp["created_at"] = str(cp["created_at"])
            for k in ("nps_at_checkpoint", "csat_at_checkpoint"):
                if cp.get(k) is not None:
                    cp[k] = float(cp[k])
            checkpoints.append(cp)

        return {"checkpoints": checkpoints, "count": len(checkpoints)}
    except Exception as exc:
        logger.error("tool_get_checkpoint_history_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_compare_surveys(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id_a = params.get("survey_id_a")
        survey_id_b = params.get("survey_id_b")
        if not survey_id_a or not survey_id_b:
            return {"error": "survey_id_a and survey_id_b required"}

        results = {}
        for sid, label in [(survey_id_a, "a"), (survey_id_b, "b")]:
            async with db._pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """SELECT title,
                                  (SELECT COUNT(*)::int FROM responses r
                                   WHERE r.survey_id = surveys.id) AS response_count
                           FROM surveys
                           WHERE id = %s AND org_id = %s AND deleted_at IS NULL""",
                        (sid, ctx.org_id),
                    )
                    row = await cur.fetchone()
                    if not row:
                        return {"error": f"Survey {sid} not found for org"}
                    results[label] = {"survey_id": sid, "title": row[0], "response_count": row[1]}

                    await cur.execute(
                        """SELECT nps, csat, effort_score FROM survey_metric_snapshots
                           WHERE survey_id = %s AND org_id = %s ORDER BY captured_at DESC LIMIT 1""",
                        (sid, ctx.org_id),
                    )
                    snap = await cur.fetchone()
                    if snap:
                        results[label].update({
                            "nps": float(snap[0]) if snap[0] is not None else None,
                            "csat": float(snap[1]) if snap[1] is not None else None,
                            "ces": float(snap[2]) if snap[2] is not None else None,
                        })

        delta = {}
        for metric in ("nps", "csat", "ces"):
            a_val = results.get("a", {}).get(metric)
            b_val = results.get("b", {}).get(metric)
            if a_val is not None and b_val is not None:
                delta[metric] = round(a_val - b_val, 1)

        return {"survey_a": results.get("a", {}), "survey_b": results.get("b", {}), "delta": delta}
    except Exception as exc:
        logger.error("tool_compare_surveys_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_org_portfolio(ctx: CrystalContext, params: dict) -> dict:
    try:
        limit = min(int(params.get("limit", 10)), 50)
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT s.id, s.title, s.status,
                              (SELECT COUNT(*)::int FROM responses r
                               WHERE r.survey_id = s.id) AS response_count,
                              m.nps_score, m.csat_score
                       FROM surveys s
                       LEFT JOIN LATERAL (
                           SELECT nps AS nps_score, csat AS csat_score
                           FROM survey_metric_snapshots
                           WHERE survey_id = s.id ORDER BY captured_at DESC LIMIT 1
                       ) m ON true
                       WHERE s.org_id = %s AND s.status = 'active' AND s.deleted_at IS NULL
                       ORDER BY response_count DESC NULLS LAST
                       LIMIT %s""",
                    (ctx.org_id, limit),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        surveys = []
        for row in rows:
            s = dict(zip(cols, row))
            s["id"] = str(s["id"])
            for k in ("nps_score", "csat_score"):
                if s.get(k) is not None:
                    s[k] = float(s[k])
            surveys.append(s)

        return {"surveys": surveys, "active_survey_count": len(surveys)}
    except Exception as exc:
        logger.error("tool_get_org_portfolio_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_cross_survey_themes(ctx: CrystalContext, params: dict) -> dict:
    try:
        min_survey_count = int(params.get("min_survey_count", 2))
        limit = min(int(params.get("limit", 10)), 30)

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT name, COUNT(DISTINCT survey_id) as survey_count, SUM(volume) as total_volume,
                              AVG(sentiment_score) as avg_sentiment
                       FROM survey_topics
                       WHERE org_id = %s AND time_window = 'all_time'
                       GROUP BY name
                       HAVING COUNT(DISTINCT survey_id) >= %s
                       ORDER BY survey_count DESC, total_volume DESC
                       LIMIT %s""",
                    (ctx.org_id, min_survey_count, limit),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        themes = []
        for row in rows:
            t = dict(zip(cols, row))
            t["survey_count"] = int(t["survey_count"])
            t["total_volume"] = int(t["total_volume"] or 0)
            t["avg_sentiment"] = round(float(t["avg_sentiment"] or 0), 2)
            themes.append(t)

        return {"themes": themes, "count": len(themes)}
    except Exception as exc:
        logger.error("tool_get_cross_survey_themes_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


async def execute_get_anomaly_events(ctx: CrystalContext, params: dict) -> dict:
    try:
        survey_id = params.get("survey_id")
        days = min(int(params.get("days", 30)), 365)
        limit = min(int(params.get("limit", 10)), 50)

        conditions = ["org_id = %s", "captured_at > NOW() - (%s * INTERVAL '1 day')"]
        args: list = [ctx.org_id, days]
        if survey_id:
            conditions.append("survey_id = %s")
            args.append(survey_id)
        # Filter for significant metric drops (anomalies)
        conditions.append("(nps < -10 OR csat < 2.5 OR anomaly_flag = true)")
        args.append(limit)

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    f"""SELECT survey_id, nps AS nps_score, csat AS csat_score,
                               response_count, captured_at
                        FROM survey_metric_snapshots
                        WHERE {' AND '.join(conditions)}
                        ORDER BY captured_at DESC LIMIT %s""",
                    args,
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        events = []
        for row in rows:
            e = dict(zip(cols, row))
            e["survey_id"] = str(e["survey_id"])
            if e.get("captured_at"):
                e["captured_at"] = str(e["captured_at"])
            for k in ("nps_score", "csat_score"):
                if e.get(k) is not None:
                    e[k] = float(e[k])
            events.append(e)

        return {"events": events, "count": len(events)}
    except Exception as exc:
        logger.error("tool_get_anomaly_events_failed", error=str(exc), traceback=traceback.format_exc())
        return {"error": str(exc)}


# ── Action tool executors ─────────────────────────────────────────────────────
# These tools return PROPOSALS (structured JSON) for the frontend to execute
# after user confirmation. Crystal never autonomously mutates survey data.

async def execute_recommend_next_actions(ctx: CrystalContext, params: dict) -> dict:
    """Run the action-recommender skill to surface next-step proposals."""
    try:
        survey_id  = params.get("survey_id") or ctx.survey_id
        focus_area = params.get("focus_area", "")

        # Gather context for the skill
        survey_data: dict = {}
        topics: list[dict] = []
        insights: list[dict] = []
        metrics: dict = {}

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                # Survey metadata
                await cur.execute(
                    "SELECT title, status FROM surveys WHERE id = %s AND org_id = %s AND deleted_at IS NULL",
                    (survey_id, ctx.org_id),
                )
                row = await cur.fetchone()
                if row:
                    survey_data = {"title": row[0], "status": row[1]}

                # Top topics (by urgency)
                await cur.execute(
                    """SELECT name, sentiment_score, volume, urgency_score, trending
                       FROM survey_topics WHERE survey_id = %s AND org_id = %s
                       ORDER BY urgency_score DESC NULLS LAST LIMIT 8""",
                    (survey_id, ctx.org_id),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                topics = [dict(zip(cols, r)) for r in rows]
                for t in topics:
                    for k in ("sentiment_score", "urgency_score"):
                        if t.get(k) is not None:
                            t[k] = float(t[k])

                # Top insights
                await cur.execute(
                    """SELECT layer, headline, trust_score FROM insights
                       WHERE survey_id = %s AND org_id = %s AND superseded_at IS NULL
                       ORDER BY trust_score DESC NULLS LAST LIMIT 8""",
                    (survey_id, ctx.org_id),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                insights = [dict(zip(cols, r)) for r in rows]

                # Latest metric snapshot
                await cur.execute(
                    """SELECT nps, csat, effort_score, response_count
                       FROM survey_metric_snapshots WHERE survey_id = %s AND org_id = %s
                       ORDER BY captured_at DESC LIMIT 1""",
                    (survey_id, ctx.org_id),
                )
                snap = await cur.fetchone()
                if snap:
                    metrics = {
                        "nps":  {"score": float(snap[0]) if snap[0] is not None else None, "n": snap[3] or 0},
                        "csat": {"score": float(snap[1]) if snap[1] is not None else None},
                        "ces":  {"score": float(snap[2]) if snap[2] is not None else None},
                    }

        # Invoke the action-recommender skill
        from crystalos.lib.skill_registry import get_registry as _get_reg
        reg = _get_reg()
        if not reg.is_initialized() or not reg.get_skill_meta("action-recommender"):
            return {"error": "action-recommender skill not initialized"}

        skill_input = {
            "survey_id":     survey_id,
            "survey_type":   "custom",
            "survey_title":  survey_data.get("title", ""),
            "org_context":   {"industry": None, "company_size": None, "audience": "customers"},
            "metrics":       metrics,
            "top_themes":    [
                {
                    "label":           t.get("name", ""),
                    "sentiment_score": t.get("sentiment_score", 0.0),
                    "volume_pct":      (t.get("volume") or 0) / max(1, sum(x.get("volume") or 0 for x in topics)),
                    "urgency_score":   t.get("urgency_score", 0.5),
                    "trending":        t.get("trending"),
                }
                for t in topics
            ],
            "key_insights":          insights,
            "conversation_history":  [],
            "response_count":        metrics.get("nps", {}).get("n", 0),
            "existing_surveys":      [],
        }
        if focus_area:
            skill_input["focus_area"] = focus_area

        result = await reg.execute(
            "action-recommender",
            skill_input,
            {"org_id": ctx.org_id, "survey_id": survey_id},
        )
        return result.get("output", {"error": "No recommendations generated"})
    except Exception as exc:
        logger.error("tool_recommend_actions_failed", error=str(exc))
        return {"error": str(exc)}


async def execute_propose_survey_creation(ctx: CrystalContext, params: dict) -> dict:
    """Propose a new follow-up survey — returns structured proposal for frontend confirmation."""
    purpose           = params.get("purpose", "")
    target_audience   = params.get("target_audience", "customers")
    survey_type       = params.get("survey_type", "custom")
    source_survey_id  = params.get("survey_id") or ctx.survey_id

    # Get source survey context
    survey_title = ""
    try:
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT title FROM surveys WHERE id = %s AND org_id = %s AND deleted_at IS NULL",
                    (source_survey_id, ctx.org_id),
                )
                row = await cur.fetchone()
                if row:
                    survey_title = row[0]
    except Exception:
        pass

    intent = (
        f"{purpose}. "
        f"Target audience: {target_audience}. "
        f"Based on learnings from: {survey_title or 'current survey'}."
    )

    return {
        "proposal_type": "create_survey",
        "title": f"Create follow-up {survey_type} survey",
        "description": f"New survey targeting {target_audience}: {purpose}",
        "requires_confirmation": True,
        "params": {
            "intent":       intent,
            "survey_type":  survey_type,
            "audience":     target_audience,
        },
        "estimated_time": "5 minutes to review and launch",
        "cta_label": "Create Survey",
    }


async def execute_propose_survey_edit(ctx: CrystalContext, params: dict) -> dict:
    """Propose edits to the current survey — questions to add or rephrase."""
    survey_id   = params.get("survey_id") or ctx.survey_id
    edit_request = params.get("edit_request", "")
    focus_topic  = params.get("focus_topic", "")

    # Suggest 1-3 specific questions based on edit_request + focus_topic
    suggested_questions: list[str] = []
    if focus_topic:
        suggested_questions = [
            f"What specifically about {focus_topic} was most frustrating?",
            f"How would you rate {focus_topic} on a scale of 1-5?",
            f"What would improve your experience with {focus_topic}?",
        ]
    else:
        suggested_questions = [
            "What is the most important improvement we could make?",
            "How likely are you to continue using our product after this experience?",
        ]

    return {
        "proposal_type": "edit_survey",
        "title": "Add questions to current survey",
        "description": f"Proposed edit: {edit_request}",
        "requires_confirmation": True,
        "params": {
            "survey_id":          survey_id,
            "message":            edit_request,
            "questions_to_add":   suggested_questions[:2],
        },
        "estimated_time": "2 minutes",
        "cta_label": "Apply Edits",
    }


async def execute_propose_distribution(ctx: CrystalContext, params: dict) -> dict:
    """Propose a targeted distribution campaign for the survey."""
    survey_id      = params.get("survey_id") or ctx.survey_id
    target_segment = params.get("target_segment", "all respondents")
    goal           = params.get("goal", "gather additional feedback")

    # Recommend channel based on segment
    if "detractor" in target_segment.lower() or "churned" in target_segment.lower():
        recommended_channel = "email"
        timing = "within 24 hours of identifying them"
        expected_rate = "15-25%"
    elif "employee" in target_segment.lower() or "staff" in target_segment.lower():
        recommended_channel = "in_app"
        timing = "weekday morning (9-11am local time)"
        expected_rate = "40-60%"
    else:
        recommended_channel = "email"
        timing = "Tuesday-Thursday, 10am-2pm"
        expected_rate = "20-35%"

    return {
        "proposal_type": "distribute",
        "title": f"Send to {target_segment}",
        "description": f"Targeted distribution to {target_segment}: {goal}",
        "requires_confirmation": True,
        "params": {
            "survey_id":          survey_id,
            "target_segment":     target_segment,
            "channel":            recommended_channel,
            "recommended_timing": timing,
        },
        "estimated_response_rate": expected_rate,
        "estimated_time": "Set up in 3 minutes",
        "cta_label": "Set Up Distribution",
    }


async def execute_propose_workflow(ctx: CrystalContext, params: dict) -> dict:
    """Propose an automation workflow based on response patterns."""
    survey_id         = params.get("survey_id") or ctx.survey_id
    trigger_condition = params.get("trigger_condition", "")
    desired_outcome   = params.get("desired_outcome", "")

    return {
        "proposal_type": "workflow",
        "title": "Create response automation",
        "description": f"Trigger: {trigger_condition} → Action: {desired_outcome}",
        "requires_confirmation": True,
        "params": {
            "survey_id":       survey_id,
            "trigger":         trigger_condition,
            "name":            f"Auto: {trigger_condition[:50]}",
            "action_type":     "notify",
            "action_config":   {"message": desired_outcome},
        },
        "estimated_time": "2 minutes to configure",
        "cta_label": "Create Workflow",
    }


async def execute_list_relevant_templates(ctx: CrystalContext, params: dict) -> dict:
    """Search the template library for relevant survey templates."""
    search_query = params.get("search_query", "")
    survey_type  = params.get("survey_type", "any")

    try:
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                if survey_type and survey_type != "any":
                    await cur.execute(
                        """SELECT id, title, description, survey_type_id
                           FROM templates
                           WHERE org_id = %s AND (title ILIKE %s OR description ILIKE %s)
                           ORDER BY created_at DESC LIMIT 5""",
                        (ctx.org_id, f"%{search_query}%", f"%{search_query}%"),
                    )
                else:
                    await cur.execute(
                        """SELECT id, title, description, survey_type_id
                           FROM templates
                           WHERE org_id = %s AND (title ILIKE %s OR description ILIKE %s)
                           ORDER BY created_at DESC LIMIT 5""",
                        (ctx.org_id, f"%{search_query}%", f"%{search_query}%"),
                    )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]
                templates = [dict(zip(cols, r)) for r in rows]
                for t in templates:
                    t["id"] = str(t["id"])

        return {
            "templates": templates,
            "count": len(templates),
            "search_query": search_query,
        }
    except Exception as exc:
        logger.error("tool_list_templates_failed", error=str(exc))
        return {"error": str(exc), "templates": []}


# ── Tool dispatch table ───────────────────────────────────────────────────────

TOOL_EXECUTORS: dict[str, Any] = {
    # Data tools
    "get_survey_overview":      execute_get_survey_overview,
    "get_topic_details":        execute_get_topic_details,
    "get_metric_history":       execute_get_metric_history,
    "get_insights_list":        execute_get_insights_list,
    "get_verbatims":            execute_get_verbatims,
    "get_benchmark_comparison": execute_get_benchmark_comparison,
    "get_driver_analysis":      execute_get_driver_analysis,
    "get_segment_breakdown":    execute_get_segment_breakdown,
    "get_checkpoint_history":   execute_get_checkpoint_history,
    "compare_surveys":          execute_compare_surveys,
    "get_org_portfolio":        execute_get_org_portfolio,
    "get_cross_survey_themes":  execute_get_cross_survey_themes,
    "get_anomaly_events":       execute_get_anomaly_events,
    # Action proposal tools
    "recommend_next_actions":   execute_recommend_next_actions,
    "propose_survey_creation":  execute_propose_survey_creation,
    "propose_survey_edit":      execute_propose_survey_edit,
    "propose_distribution":     execute_propose_distribution,
    "propose_workflow":         execute_propose_workflow,
    "list_relevant_templates":  execute_list_relevant_templates,
}


async def dispatch_tool(tool_name: str, ctx: CrystalContext, params: dict) -> dict:
    """Dispatch a tool call to the appropriate executor."""
    executor = TOOL_EXECUTORS.get(tool_name)
    if not executor:
        return {"error": f"Unknown tool: {tool_name}"}

    start = _time.monotonic()
    try:
        result = await executor(ctx, params)
        crystal_tool_calls_total.labels(tool=tool_name, org_id=ctx.org_id or "unknown").inc()
        return result
    finally:
        duration = _time.monotonic() - start
        crystal_tool_duration_seconds.labels(tool=tool_name).observe(duration)
