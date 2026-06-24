"""Group insight pipeline — cross-survey intelligence for tagged survey groups.

Pipeline:
  load_surveys → sample_responses → compute_metrics → extract_topics
               → analyze_coverage → run_gap_analyst → narrate_group
               → verify → publish
"""
from __future__ import annotations

import asyncio
import json
import traceback as _tb
import uuid
from datetime import datetime, timezone
from typing import Any, TypedDict

import structlog
from langgraph.graph import StateGraph, END

from crystalos.lib import db
from crystalos.lib.logger import logger


class GroupInsightState(TypedDict):
    org_id: str
    run_id: str
    tag_ids: list[str]
    survey_ids: list[str]
    surveys: list[dict]           # metadata for each survey
    all_responses: list[dict]     # sampled responses (max 2000 total)
    group_metrics: dict           # aggregated NPS/CSAT/CES
    cross_topics: list[dict]      # unified topic landscape
    coverage_analysis: dict       # time/type/segment coverage
    gap_analysis: dict            # from gap-analyst skill
    group_insights: list[dict]    # final insights to persist
    stream_events: list[dict]     # events accumulated for SSE
    errors: list[str]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _event(event_type: str, **kwargs) -> dict:
    return {"event": event_type, "ts": _now_iso(), **kwargs}


# ── Pipeline nodes ────────────────────────────────────────────────────────────

async def node_load_surveys(state: GroupInsightState) -> dict:
    """Fetch all surveys for the given tag_ids."""
    tag_ids = state["tag_ids"]
    org_id = state["org_id"]
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="load_surveys"))

    try:
        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT s.id, s.title, s.status, s.survey_type_id, s.created_at,
                              s.questions,
                              (SELECT COUNT(*)::int FROM responses r WHERE r.survey_id = s.id) AS response_count
                       FROM surveys s
                       WHERE s.id IN (
                         SELECT survey_id FROM survey_tag_mappings
                         WHERE tag_id = ANY(%s::uuid[]) AND org_id = %s
                       ) AND s.org_id = %s AND s.deleted_at IS NULL
                       ORDER BY s.created_at DESC""",
                    (tag_ids, org_id, org_id),
                )
                rows = await cur.fetchall()
                cols = [d[0] for d in cur.description]

        surveys = []
        survey_ids = []
        for row in rows:
            s = dict(zip(cols, row))
            s["id"] = str(s["id"])
            if s.get("created_at"):
                s["created_at"] = str(s["created_at"])
            if s.get("survey_type_id"):
                s["survey_type_id"] = str(s["survey_type_id"])
            surveys.append(s)
            survey_ids.append(s["id"])

        events.append(_event("node_complete", node="load_surveys", survey_count=len(surveys)))
        logger.info("group_insights_load_surveys", run_id=state["run_id"], count=len(surveys))

    except Exception as exc:
        errors.append(f"node_load_surveys: {exc}")
        logger.error("group_insights_load_surveys_failed", run_id=state["run_id"], error=str(exc))
        surveys = []
        survey_ids = list(state.get("survey_ids") or [])

    return {"surveys": surveys, "survey_ids": survey_ids, "stream_events": events, "errors": errors}


async def node_sample_responses(state: GroupInsightState) -> dict:
    """Sample up to 2000 responses across all group surveys."""
    survey_ids = state.get("survey_ids") or []
    org_id = state["org_id"]
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="sample_responses"))

    if not survey_ids:
        return {"all_responses": [], "stream_events": events, "errors": errors}

    try:
        per_survey_limit = max(1, 2000 // len(survey_ids))
        all_responses: list[dict] = []

        async with db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                for sid in survey_ids:
                    await cur.execute(
                        """SELECT id, survey_id, answers, ai_sentiment, ai_sentiment_score,
                                  nps_score, submitted_at
                           FROM responses
                           WHERE survey_id = %s AND org_id = %s
                           ORDER BY submitted_at DESC
                           LIMIT %s""",
                        (sid, org_id, per_survey_limit),
                    )
                    resp_rows = await cur.fetchall()
                    resp_cols = [d[0] for d in cur.description]
                    for rr in resp_rows:
                        r = dict(zip(resp_cols, rr))
                        r["id"] = str(r["id"])
                        r["survey_id"] = str(r["survey_id"])
                        if r.get("submitted_at"):
                            r["submitted_at"] = str(r["submitted_at"])
                        all_responses.append(r)

        events.append(_event("node_complete", node="sample_responses", response_count=len(all_responses)))
        logger.info("group_insights_sample_responses", run_id=state["run_id"], count=len(all_responses))

    except Exception as exc:
        errors.append(f"node_sample_responses: {exc}")
        logger.error("group_insights_sample_responses_failed", run_id=state["run_id"], error=str(exc))
        all_responses = []

    return {"all_responses": all_responses, "stream_events": events, "errors": errors}


async def node_compute_metrics(state: GroupInsightState) -> dict:
    """Aggregate NPS/CSAT/CES across all group surveys."""
    tag_ids = state["tag_ids"]
    org_id = state["org_id"]
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="compute_metrics"))

    try:
        # Build a minimal CrystalContext for the tool executor
        from crystalos.crystal.context import CrystalContext
        from crystalos.crystal.tools import execute_get_group_metrics

        ctx = CrystalContext(
            org_id=org_id,
            user_id="system",
            survey_id=None,
            scope="group",
            tag_ids=tuple(tag_ids),
        )
        group_metrics = await execute_get_group_metrics(ctx, {"tag_ids": tag_ids})
        events.append(_event("node_complete", node="compute_metrics",
                             survey_count=group_metrics.get("aggregate", {}).get("survey_count", 0)))

    except Exception as exc:
        errors.append(f"node_compute_metrics: {exc}")
        logger.error("group_insights_compute_metrics_failed", run_id=state["run_id"], error=str(exc))
        group_metrics = {}

    return {"group_metrics": group_metrics, "stream_events": events, "errors": errors}


async def node_extract_topics(state: GroupInsightState) -> dict:
    """Merge and deduplicate cross-survey topics."""
    tag_ids = state["tag_ids"]
    org_id = state["org_id"]
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="extract_topics"))

    try:
        from crystalos.crystal.context import CrystalContext
        from crystalos.crystal.tools import execute_get_group_topics

        ctx = CrystalContext(
            org_id=org_id,
            user_id="system",
            survey_id=None,
            scope="group",
            tag_ids=tuple(tag_ids),
        )
        topics_result = await execute_get_group_topics(ctx, {"tag_ids": tag_ids, "limit": 50})
        cross_topics = topics_result.get("topics", [])
        events.append(_event("node_complete", node="extract_topics", topic_count=len(cross_topics)))

    except Exception as exc:
        errors.append(f"node_extract_topics: {exc}")
        logger.error("group_insights_extract_topics_failed", run_id=state["run_id"], error=str(exc))
        cross_topics = []

    return {"cross_topics": cross_topics, "stream_events": events, "errors": errors}


async def node_analyze_coverage(state: GroupInsightState) -> dict:
    """Build coverage analysis for the group."""
    tag_ids = state["tag_ids"]
    org_id = state["org_id"]
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="analyze_coverage"))

    try:
        from crystalos.crystal.context import CrystalContext
        from crystalos.crystal.tools import execute_analyze_group_coverage

        ctx = CrystalContext(
            org_id=org_id,
            user_id="system",
            survey_id=None,
            scope="group",
            tag_ids=tuple(tag_ids),
        )
        coverage_analysis = await execute_analyze_group_coverage(ctx, {"tag_ids": tag_ids})
        events.append(_event("node_complete", node="analyze_coverage",
                             cadence=coverage_analysis.get("time_coverage", {}).get("cadence")))

    except Exception as exc:
        errors.append(f"node_analyze_coverage: {exc}")
        logger.error("group_insights_analyze_coverage_failed", run_id=state["run_id"], error=str(exc))
        coverage_analysis = {}

    return {"coverage_analysis": coverage_analysis, "stream_events": events, "errors": errors}


async def node_run_gap_analyst(state: GroupInsightState) -> dict:
    """Invoke the gap-analyst skill via the skill registry."""
    tag_ids = state["tag_ids"]
    org_id = state["org_id"]
    surveys = state.get("surveys") or []
    cross_topics = state.get("cross_topics") or []
    group_metrics = state.get("group_metrics") or {}
    coverage_analysis = state.get("coverage_analysis") or {}
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="run_gap_analyst"))

    try:
        from crystalos.lib.skill_registry import get_registry as _get_reg

        reg = _get_reg()
        if not reg.is_initialized() or not reg.get_skill_meta("gap-analyst"):
            # Fall back to the tool-based gap detection
            logger.warning("gap_analyst_skill_unavailable", run_id=state["run_id"])
            from crystalos.crystal.context import CrystalContext
            from crystalos.crystal.tools import execute_detect_data_gaps
            ctx = CrystalContext(
                org_id=org_id, user_id="system",
                survey_id=None, scope="group", tag_ids=tuple(tag_ids),
            )
            gap_analysis = await execute_detect_data_gaps(ctx, {"tag_ids": tag_ids})
        else:
            skill_input = {
                "group_name": f"group:{','.join(sorted(tag_ids))}",
                "group_surveys": [
                    {
                        "survey_id": s.get("id"),
                        "title": s.get("title", ""),
                        "type": s.get("survey_type_id", "custom"),
                        "date": s.get("created_at"),
                        "response_count": s.get("response_count", 0),
                    }
                    for s in surveys
                ],
                "group_topics": cross_topics[:30],
                "group_metrics": group_metrics,
                "coverage_analysis": coverage_analysis,
            }
            result = await reg.execute(
                "gap-analyst",
                skill_input,
                {"org_id": org_id},
            )
            gap_analysis = result.get("output") or {}

        events.append(_event("node_complete", node="run_gap_analyst",
                             coverage_score=gap_analysis.get("coverage_score"),
                             gap_count=len(gap_analysis.get("gaps", []))))

    except Exception as exc:
        errors.append(f"node_run_gap_analyst: {exc}")
        logger.error("group_insights_gap_analyst_failed", run_id=state["run_id"],
                     error=str(exc), traceback=_tb.format_exc())
        gap_analysis = {}

    return {"gap_analysis": gap_analysis, "stream_events": events, "errors": errors}


async def node_narrate_group(state: GroupInsightState) -> dict:
    """Generate narrative insights for the group using the report-composer skill."""
    tag_ids = state["tag_ids"]
    org_id = state["org_id"]
    surveys = state.get("surveys") or []
    group_metrics = state.get("group_metrics") or {}
    cross_topics = state.get("cross_topics") or []
    gap_analysis = state.get("gap_analysis") or {}
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="narrate_group"))

    group_insights: list[dict] = []

    try:
        from crystalos.lib.openrouter import call_agent
        from pydantic import BaseModel

        class GroupNarrativeOutput(BaseModel):
            headline: str = ""
            narrative: str = ""
            key_findings: list[str] = []
            recommended_actions: list[str] = []
            confidence: str = "medium"

        agg = group_metrics.get("aggregate", {})
        coverage_score = gap_analysis.get("coverage_score", 0.5)
        gap_count = len(gap_analysis.get("gaps", []))
        survey_count = len(surveys)

        system = (
            "You are a senior XM analyst. Synthesize cross-survey intelligence "
            "for a survey group into a concise narrative insight. Be specific and grounded."
        )
        user = (
            f"Survey group analysis ({survey_count} surveys):\n"
            f"- Aggregate NPS: {agg.get('nps')}, CSAT: {agg.get('csat')}\n"
            f"- Total responses: {agg.get('response_count', 0)}\n"
            f"- Top topics: {', '.join(t.get('name', '') for t in cross_topics[:5])}\n"
            f"- Coverage score: {coverage_score:.0%}\n"
            f"- Data gaps found: {gap_count}\n"
            f"- Gap summary: {gap_analysis.get('summary', 'N/A')}\n\n"
            "Generate a headline insight, a 2-3 sentence narrative, 3 key findings, "
            "and 2 recommended actions for this survey group."
        )

        output, _ = await call_agent(
            agent_name="group_narrator",
            system=system,
            user=user,
            output_schema=GroupNarrativeOutput,
        )

        group_insights.append({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "run_id": state["run_id"],
            "tag_ids": tag_ids,
            "survey_ids": state.get("survey_ids") or [],
            "layer": "descriptive",
            "category": "group_overview",
            "headline": output.headline,
            "narrative": output.narrative,
            "metric_json": agg,
            "citations_json": [],
            "trust_score": 70,
            "priority": 5,
            "data_gap_signals": gap_analysis.get("gaps", []),
            "suggested_survey_types": [
                g.get("suggested_survey_type") for g in gap_analysis.get("gaps", [])
                if g.get("suggested_survey_type")
            ],
            "suggested_survey_json": None,
            "created_at": _now_iso(),
        })

        events.append(_event("node_complete", node="narrate_group", insight_count=len(group_insights)))

    except Exception as exc:
        errors.append(f"node_narrate_group: {exc}")
        logger.error("group_insights_narrate_failed", run_id=state["run_id"],
                     error=str(exc), traceback=_tb.format_exc())

    return {"group_insights": group_insights, "stream_events": events, "errors": errors}


async def node_verify(state: GroupInsightState) -> dict:
    """Basic hallucination check — ensure insights reference real survey data."""
    group_insights = state.get("group_insights") or []
    survey_ids = set(state.get("survey_ids") or [])
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="verify"))

    verified_insights = []
    for ins in group_insights:
        # Ensure survey_ids in insight are subset of known group survey_ids
        ins_surveys = set(ins.get("survey_ids") or [])
        if ins_surveys and not ins_surveys.issubset(survey_ids):
            # Strip out unknown survey refs
            ins = {**ins, "survey_ids": list(ins_surveys & survey_ids)}
        # Ensure headline and narrative are non-empty
        if not ins.get("headline") or not ins.get("narrative"):
            continue
        verified_insights.append(ins)

    events.append(_event("node_complete", node="verify",
                         verified_count=len(verified_insights),
                         dropped=len(group_insights) - len(verified_insights)))

    return {"group_insights": verified_insights, "stream_events": events, "errors": errors}


async def node_publish(state: GroupInsightState) -> dict:
    """Write group insights to DB and update group_insight_runs to completed."""
    org_id = state["org_id"]
    run_id = state["run_id"]
    tag_ids = state["tag_ids"]
    survey_ids = state.get("survey_ids") or []
    group_insights = state.get("group_insights") or []
    gap_analysis = state.get("gap_analysis") or {}
    events = list(state.get("stream_events") or [])
    errors = list(state.get("errors") or [])

    events.append(_event("node_start", node="publish"))

    try:
        async with db._pool_conn().connection() as conn:
            # Insert group insights
            for ins in group_insights:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """INSERT INTO group_insights
                           (id, org_id, run_id, tag_ids, survey_ids, layer, category,
                            headline, narrative, metric_json, citations_json,
                            trust_score, priority, data_gap_signals,
                            suggested_survey_types, suggested_survey_json, created_at)
                           VALUES (%s, %s, %s, %s::uuid[], %s::uuid[], %s, %s,
                                   %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                           ON CONFLICT (id) DO NOTHING""",
                        (
                            ins.get("id", str(uuid.uuid4())),
                            org_id,
                            run_id,
                            tag_ids,
                            survey_ids,
                            ins.get("layer", "descriptive"),
                            ins.get("category", "group_overview"),
                            ins.get("headline", ""),
                            ins.get("narrative", ""),
                            json.dumps(ins.get("metric_json") or {}),
                            json.dumps(ins.get("citations_json") or []),
                            ins.get("trust_score", 70),
                            ins.get("priority", 5),
                            json.dumps(ins.get("data_gap_signals") or []),
                            ins.get("suggested_survey_types") or [],
                            json.dumps(ins.get("suggested_survey_json")) if ins.get("suggested_survey_json") else None,
                            datetime.now(timezone.utc),
                        ),
                    )

            # Append final complete event to stream_events
            events.append(_event("complete",
                                 insight_count=len(group_insights),
                                 coverage_score=gap_analysis.get("coverage_score"),
                                 run_id=run_id))

            # Update group_insight_runs to completed
            async with conn.cursor() as cur:
                await cur.execute(
                    """UPDATE group_insight_runs
                       SET status = 'completed',
                           completed_at = NOW(),
                           stream_events = %s::jsonb,
                           result_json = %s::jsonb
                       WHERE id = %s AND org_id = %s""",
                    (
                        json.dumps(events),
                        json.dumps({
                            "insight_count": len(group_insights),
                            "coverage_score": gap_analysis.get("coverage_score"),
                            "gap_count": len(gap_analysis.get("gaps", [])),
                            "survey_count": len(survey_ids),
                        }),
                        run_id,
                        org_id,
                    ),
                )

            await conn.commit()

        logger.info("group_insights_published", run_id=run_id, insight_count=len(group_insights))

    except Exception as exc:
        errors.append(f"node_publish: {exc}")
        logger.error("group_insights_publish_failed", run_id=run_id,
                     error=str(exc), traceback=_tb.format_exc())
        # Best-effort: mark run as failed
        try:
            async with db._pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """UPDATE group_insight_runs
                           SET status = 'failed', error_log = %s::jsonb
                           WHERE id = %s AND org_id = %s""",
                        (json.dumps(errors[-3:]), run_id, org_id),
                    )
                await conn.commit()
        except Exception:
            pass

    return {"stream_events": events, "errors": errors}


# ── Graph construction ────────────────────────────────────────────────────────

def build_group_insight_graph():
    """Build and compile the group insight LangGraph pipeline."""
    g = StateGraph(GroupInsightState)

    g.add_node("load_surveys",     node_load_surveys)
    g.add_node("sample_responses", node_sample_responses)
    g.add_node("compute_metrics",  node_compute_metrics)
    g.add_node("extract_topics",   node_extract_topics)
    g.add_node("analyze_coverage", node_analyze_coverage)
    g.add_node("run_gap_analyst",  node_run_gap_analyst)
    g.add_node("narrate_group",    node_narrate_group)
    g.add_node("verify",           node_verify)
    g.add_node("publish",          node_publish)

    g.set_entry_point("load_surveys")
    g.add_edge("load_surveys",     "sample_responses")
    g.add_edge("sample_responses", "compute_metrics")
    g.add_edge("compute_metrics",  "extract_topics")
    g.add_edge("extract_topics",   "analyze_coverage")
    g.add_edge("analyze_coverage", "run_gap_analyst")
    g.add_edge("run_gap_analyst",  "narrate_group")
    g.add_edge("narrate_group",    "verify")
    g.add_edge("verify",           "publish")
    g.set_finish_point("publish")

    return g.compile()


# Module-level compiled graph (lazy-initialized)
_group_insight_graph = None


def _get_graph():
    global _group_insight_graph
    if _group_insight_graph is None:
        _group_insight_graph = build_group_insight_graph()
    return _group_insight_graph


async def run_group_insight_generation(
    tag_ids: list[str],
    survey_ids: list[str],
    org_id: str,
    run_id: str,
    db_pool=None,
) -> None:
    """Entry point called by the FastAPI endpoint.

    Runs the full group insight pipeline and writes results to DB.
    Errors are caught per-node; the run always ends in 'completed' or 'failed'.
    """
    logger.info("group_insight_generation_started", run_id=run_id, org_id=org_id,
                tag_count=len(tag_ids), survey_count=len(survey_ids))

    initial_state: GroupInsightState = {
        "org_id": org_id,
        "run_id": run_id,
        "tag_ids": tag_ids,
        "survey_ids": survey_ids,
        "surveys": [],
        "all_responses": [],
        "group_metrics": {},
        "cross_topics": [],
        "coverage_analysis": {},
        "gap_analysis": {},
        "group_insights": [],
        "stream_events": [],
        "errors": [],
    }

    try:
        graph = _get_graph()
        config = {"configurable": {"thread_id": f"group_insights:{run_id}"}}
        await graph.ainvoke(initial_state, config)
        logger.info("group_insight_generation_complete", run_id=run_id)
    except Exception as exc:
        logger.error("group_insight_generation_fatal", run_id=run_id, error=str(exc),
                     traceback=_tb.format_exc())
        # Mark run as failed
        try:
            async with db._pool_conn().connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """UPDATE group_insight_runs
                           SET status = 'failed', error_log = %s::jsonb
                           WHERE id = %s AND org_id = %s""",
                        (json.dumps([f"fatal: {str(exc)}"]), run_id, org_id),
                    )
                await conn.commit()
        except Exception:
            pass
