"""Survey Orchestrator — LangGraph supervisor graph.

Flow:
    START → intake → creator → qc → [revision?] → creator
                                  → compliance → recommender → output → END

Revision loop (max 2):
  - score < 7.0 AND revision_count < 2 → send back to creator with issues
  - score < 7.0 AND revision_count ≥ 2 → force-accept, surface issues to user
  - score ≥ 7.0                        → proceed to compliance

Compliance node:
  - Runs after QC passes (no point checking compliance on a low-quality draft)
  - Adds compliance_risk_level and compliance_findings to state
  - High risk sets blocks_distribution=True (recommender reads this)

Timeout defence:
  - Every agent call is wrapped in asyncio.wait_for(coro, timeout=NODE_TIMEOUT_S)
  - If an agent hangs, the node marks itself failed and the run ends gracefully

Error handling:
  - Each node catches its own exceptions (fail-safe per node)
  - status="failed" short-circuits all subsequent nodes
  - output node writes the final state to DB regardless of success/failure

Checkpointing:
  - AsyncPostgresSaver persists state at every node boundary
  - thread_id = orgId:sessionId for tenant isolation
"""
from __future__ import annotations

import asyncio
from typing import Annotated, Any

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from typing import TypedDict

from agents.agents import (
    survey_creator_agent,
    quality_control_agent,
    compliance_agent,
    recommender_agent,
)
from agents.lib import db
from agents.lib.logger import logger
from agents.lib.metrics import orchestration_qc_score, orchestration_runs_total
from agents.schemas.output import (
    ComplianceInput,
    CreatorInput,
    OrgContext,
    QCInput,
    RecommenderInput,
    SessionAction,
    SurveyHistoryItem,
)
from agents.schemas.question import Question
from agents.schemas.state import make_stream_event

# Per-node timeout: if an LLM call hangs longer than this, the node fails cleanly
NODE_TIMEOUT_S = 90.0


# ── State definition ────────────────────────────────────────────────────────────

def _append(left: list, right: list) -> list:
    return left + right


class GraphState(TypedDict, total=False):
    # Identity (immutable after intake)
    thread_id:      str
    org_id:         str
    user_id:        str
    run_id:         str
    # Input
    intent:         str
    survey_type_id: str | None
    org_context:    dict
    session_actions: list[dict]
    survey_history:  list[dict]
    # Agent outputs
    questions:            list[dict]
    qc_score:             float
    qc_issues:            list[dict]
    qc_validation_errors: list[str]
    compliance_risk_level: str | None
    compliance_findings:   list[dict]
    compliance_blocks_dist: bool
    recommendations:       list[dict]
    # Control
    revision_count:    int
    status:            str
    awaiting_approval: bool
    approval_decision: dict | None
    # Observability (append-only via reducers)
    credit_log:    Annotated[list[dict], _append]
    stream_events: Annotated[list[dict], _append]
    error_log:     Annotated[list[str],  _append]
    # Totals (last-write-wins, updated each node)
    total_tokens: int
    cost_usd:     float


def _total_tokens(state: dict) -> int:
    return state.get("total_tokens", 0)


def _total_cost(state: dict) -> float:
    return state.get("cost_usd", 0.0)


# ── Helper: apply credits to state ──────────────────────────────────────────────

def _add_credits(state: dict, credits: list[dict]) -> tuple[int, float]:
    new_tokens = _total_tokens(state) + sum(
        c.get("input_tokens", 0) + c.get("output_tokens", 0) for c in credits
    )
    new_cost   = _total_cost(state) + sum(c.get("cost_usd", 0.0) for c in credits)
    return new_tokens, new_cost


# ── Nodes ───────────────────────────────────────────────────────────────────────

async def intake_node(state: dict) -> dict:
    """Emit run-start event. DB record already created by the API handler."""
    return {
        "stream_events": [make_stream_event("agent_start", "orchestrator", {"phase": "intake"})],
    }


async def creator_node(state: dict) -> dict:
    """Call the Survey Creator Agent to generate (or revise) questions."""
    if state.get("status") == "failed":
        return {}

    revision_count = state.get("revision_count", 0)
    try:
        input_data = CreatorInput(
            intent=state["intent"],
            survey_type_id=state.get("survey_type_id"),
            org_context=OrgContext(**state.get("org_context", {})),
            revision_count=revision_count,
            revision_issues=state.get("qc_issues", []),
        )

        output, credits = await asyncio.wait_for(
            survey_creator_agent.run(input_data, current_tokens=_total_tokens(state)),
            timeout=NODE_TIMEOUT_S,
        )

        questions    = [q.model_dump(by_alias=True) for q in output.questions]
        total_tokens, cost_usd = _add_credits(state, credits)

        credit_dict = credits[0] if credits else {}
        stream_event_data = {
            "question_count": len(questions),
            "revision":       revision_count,
            "rationale":      output.rationale,
        }
        if credit_dict.get("thinking_summary"):
            stream_event_data["thinking_summary"] = credit_dict["thinking_summary"]

        return {
            "questions":    questions,
            "credit_log":   credits,
            "total_tokens": total_tokens,
            "cost_usd":     cost_usd,
            "stream_events": [make_stream_event("agent_complete", "creator", stream_event_data)],
        }

    except asyncio.TimeoutError:
        logger.error("creator_node_timeout", revision=revision_count)
        return {
            "status":    "failed",
            "error_log": [f"Creator agent timed out after {NODE_TIMEOUT_S}s (revision {revision_count})"],
            "stream_events": [make_stream_event("run_failed", "creator", {"error": "timeout"})],
        }
    except Exception as e:
        logger.error("creator_node_error", error=str(e), revision=revision_count)
        return {
            "status":    "failed",
            "error_log": [f"Creator agent failed (revision {revision_count}): {e}"],
            "stream_events": [make_stream_event("run_failed", "creator", {"error": str(e)})],
        }


async def qc_node(state: dict) -> dict:
    """Call the Quality Control Agent to audit the current questions."""
    if state.get("status") == "failed":
        return {}

    questions_raw = state.get("questions", [])
    try:
        questions = [Question.model_validate(q) for q in questions_raw]
        input_data = QCInput(
            questions=questions,
            survey_type_id=state.get("survey_type_id"),
            org_context=OrgContext(**state.get("org_context", {})),
        )

        output, credits = await asyncio.wait_for(
            quality_control_agent.run(input_data, current_tokens=_total_tokens(state)),
            timeout=NODE_TIMEOUT_S,
        )

        issues       = [i.model_dump() for i in output.issues]
        total_tokens, cost_usd = _add_credits(state, credits)

        # Track revision count: increment when score < 7.0 (pre-routing decision)
        current_revision = state.get("revision_count", 0)
        new_revision     = current_revision + (1 if output.score < 7.0 else 0)

        orchestration_qc_score.labels(run_type="survey_creation").observe(output.score)

        return {
            "qc_score":             output.score,
            "qc_issues":            issues,
            "qc_validation_errors": output.validation_errors,
            "revision_count":       new_revision,
            "credit_log":           credits,
            "total_tokens":         total_tokens,
            "cost_usd":             cost_usd,
            "stream_events": [make_stream_event("agent_complete", "qc", {
                "score":             output.score,
                "issue_count":       len(issues),
                "overall_feedback":  output.overall_feedback,
                "score_was_adjusted": output.score_was_adjusted,
                "revision_count":    new_revision,
            })],
        }

    except asyncio.TimeoutError:
        logger.error("qc_node_timeout")
        return {
            "status":    "failed",
            "error_log": [f"QC agent timed out after {NODE_TIMEOUT_S}s"],
            "stream_events": [make_stream_event("run_failed", "qc", {"error": "timeout"})],
        }
    except Exception as e:
        logger.error("qc_node_error", error=str(e))
        return {
            "status":    "failed",
            "error_log": [f"QC agent failed: {e}"],
            "stream_events": [make_stream_event("run_failed", "qc", {"error": str(e)})],
        }


def qc_router(state: dict) -> str:
    """Routing function after QC: revise or proceed to compliance."""
    if state.get("status") == "failed":
        return "output"

    score          = state.get("qc_score", 10.0)
    revision_count = state.get("revision_count", 0)

    # revision_count was already incremented in qc_node if score < 7.0
    if score < 7.0 and revision_count < 2:
        logger.info("qc_router_revision", score=score, revision_count=revision_count)
        return "creator"

    # Score ≥ 7.0 or revision cap hit → proceed to compliance
    return "compliance"


async def compliance_node(state: dict) -> dict:
    """Run the Compliance Agent after QC passes."""
    if state.get("status") == "failed":
        return {}

    questions_raw = state.get("questions", [])
    try:
        questions  = [Question.model_validate(q) for q in questions_raw]
        input_data = ComplianceInput(
            questions=questions,
            org_context=OrgContext(**state.get("org_context", {})),
            survey_type_id=state.get("survey_type_id"),
        )

        output, credits = await asyncio.wait_for(
            compliance_agent.run(input_data, current_tokens=_total_tokens(state)),
            timeout=NODE_TIMEOUT_S,
        )

        findings     = [f.model_dump() for f in output.findings]
        total_tokens, cost_usd = _add_credits(state, credits)

        return {
            "compliance_risk_level":  output.risk_level,
            "compliance_findings":    findings,
            "compliance_blocks_dist": output.blocks_distribution,
            "credit_log":             credits,
            "total_tokens":           total_tokens,
            "cost_usd":               cost_usd,
            "stream_events": [make_stream_event("agent_complete", "compliance", {
                "risk_level":    output.risk_level,
                "finding_count": len(findings),
                "blocks_distribution": output.blocks_distribution,
            })],
        }

    except asyncio.TimeoutError:
        logger.error("compliance_node_timeout")
        # Compliance timeout is non-fatal — proceed with unknown risk
        return {
            "compliance_risk_level": None,
            "compliance_findings":   [],
            "error_log": [f"Compliance agent timed out after {NODE_TIMEOUT_S}s — risk unknown"],
            "stream_events": [make_stream_event("agent_complete", "compliance", {
                "risk_level": "unknown", "finding_count": 0, "timeout": True,
            })],
        }
    except Exception as e:
        logger.error("compliance_node_error", error=str(e))
        # Non-fatal: proceed with unknown compliance risk rather than failing the run
        return {
            "compliance_risk_level": None,
            "compliance_findings":   [],
            "error_log": [f"Compliance agent failed (non-fatal): {e}"],
            "stream_events": [make_stream_event("agent_complete", "compliance", {
                "risk_level": "unknown", "error": str(e),
            })],
        }


async def recommender_node(state: dict) -> dict:
    """Call the Recommendation Agent — the smartest agent in the pipeline."""
    if state.get("status") == "failed":
        return {}

    questions_raw = state.get("questions", [])
    try:
        questions  = [Question.model_validate(q) for q in questions_raw]
        raw_actions = state.get("session_actions", [])
        raw_history = state.get("survey_history", [])
        input_data = RecommenderInput(
            questions=questions,
            qc_score=state.get("qc_score", 0.0),
            intent=state["intent"],
            org_context=OrgContext(**state.get("org_context", {})),
            survey_type_id=state.get("survey_type_id"),
            revision_count=state.get("revision_count", 0),
            # Compliance context from compliance_node
            compliance_risk_level=state.get("compliance_risk_level"),
            compliance_findings_count=len(state.get("compliance_findings", [])),
            # Session context from the request (passed in by Node.js backend)
            session_actions=[SessionAction.model_validate(a) for a in raw_actions],
            survey_history=[SurveyHistoryItem.model_validate(h) for h in raw_history],
        )

        output, credits = await asyncio.wait_for(
            recommender_agent.run(input_data, current_tokens=_total_tokens(state)),
            timeout=NODE_TIMEOUT_S,
        )

        recs         = [r.model_dump() for r in output.recommendations]
        total_tokens, cost_usd = _add_credits(state, credits)

        return {
            "recommendations": recs,
            "credit_log":      credits,
            "total_tokens":    total_tokens,
            "cost_usd":        cost_usd,
            "stream_events": [make_stream_event("agent_complete", "recommender", {
                "recommendation_count": len(recs),
                "lifecycle_stage":      output.lifecycle_stage,
            })],
        }

    except asyncio.TimeoutError:
        logger.error("recommender_node_timeout")
        return {
            "status":    "failed",
            "error_log": [f"Recommender agent timed out after {NODE_TIMEOUT_S}s"],
            "stream_events": [make_stream_event("run_failed", "recommender", {"error": "timeout"})],
        }
    except Exception as e:
        logger.error("recommender_node_error", error=str(e))
        return {
            "status":    "failed",
            "error_log": [f"Recommender agent failed: {e}"],
            "stream_events": [make_stream_event("run_failed", "recommender", {"error": str(e)})],
        }


async def output_node(state: dict) -> dict:
    """Write the final run state to Postgres and emit a notification."""
    run_id  = state["run_id"]
    org_id  = state["org_id"]
    user_id = state["user_id"]
    status  = state.get("status", "completed")

    import datetime
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    if status != "failed":
        status = "completed"

    try:
        await db.update_run(
            run_id,
            status=status,
            qc_score=state.get("qc_score"),
            qc_issues=state.get("qc_issues", []),
            qc_validation_errors=state.get("qc_validation_errors", []),
            compliance_risk_level=state.get("compliance_risk_level"),
            compliance_findings=state.get("compliance_findings", []),
            compliance_blocks_dist=state.get("compliance_blocks_dist", False),
            recommendations=state.get("recommendations", []),
            result_questions=state.get("questions", []),
            revision_count=state.get("revision_count", 0),
            total_tokens=state.get("total_tokens", 0),
            cost_usd=state.get("cost_usd", 0.0),
            completed_at=now,
        )

        notif_type  = "SURVEY_CREATED" if status == "completed" else "RUN_FAILED"
        notif_title = (
            "Survey ready for review"
            if status == "completed"
            else "Survey creation failed"
        )

        compliance_note = ""
        if state.get("compliance_risk_level") == "high":
            compliance_note = " ⚠ Compliance: high risk detected."
        elif state.get("compliance_risk_level") == "medium":
            compliance_note = " Note: medium compliance risk."

        notif_body = (
            f"QC score: {state.get('qc_score', 0):.1f}/10.{compliance_note}"
            if status == "completed"
            else "; ".join(state.get("error_log", ["Unknown error"])[:2])
        )

        await db.create_notification(
            org_id=org_id,
            user_id=user_id,
            type_=notif_type,
            title=notif_title,
            body=notif_body,
            payload={
                "run_id":                run_id,
                "qc_score":              state.get("qc_score"),
                "compliance_risk_level": state.get("compliance_risk_level"),
                "thread_id":             state.get("thread_id"),
                "blocks_distribution":   state.get("compliance_blocks_dist", False),
            },
            run_id=run_id,
        )

        orchestration_runs_total.labels(run_type="survey_creation", status=status).inc()
        logger.info(
            "orchestration_complete",
            run_id=run_id,
            status=status,
            qc_score=state.get("qc_score"),
            compliance_risk=state.get("compliance_risk_level"),
            total_tokens=state.get("total_tokens"),
            cost_usd=state.get("cost_usd"),
        )

    except Exception as e:
        logger.error("output_node_error", run_id=run_id, error=str(e))

    final_event = make_stream_event(
        "run_complete" if status == "completed" else "run_failed",
        "orchestrator",
        {
            "status":                status,
            "qc_score":              state.get("qc_score"),
            "compliance_risk_level": state.get("compliance_risk_level"),
        },
    )
    return {
        "status":        status,
        "stream_events": [final_event],
    }


# ── Graph builder ───────────────────────────────────────────────────────────────

def build_graph(checkpointer: AsyncPostgresSaver) -> Any:
    """Compile the survey orchestration graph with a Postgres checkpointer."""
    builder = StateGraph(GraphState)

    builder.add_node("intake",      intake_node)
    builder.add_node("creator",     creator_node)
    builder.add_node("qc",          qc_node)
    builder.add_node("compliance",  compliance_node)
    builder.add_node("recommender", recommender_node)
    builder.add_node("output",      output_node)

    builder.add_edge(START,        "intake")
    builder.add_edge("intake",     "creator")
    builder.add_edge("creator",    "qc")
    builder.add_conditional_edges(
        "qc",
        qc_router,
        {"creator": "creator", "compliance": "compliance", "output": "output"},
    )
    builder.add_edge("compliance",  "recommender")
    builder.add_edge("recommender", "output")
    builder.add_edge("output",      END)

    return builder.compile(checkpointer=checkpointer)
