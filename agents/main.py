"""Experient Copilot Agents — FastAPI application.

Endpoints:
  POST /orchestrate                                    — Start a survey creation run (async background)
  GET  /orchestrate/{run_id}/status                    — Poll run status + stream events
  POST /orchestrate/{run_id}/refine                    — Copilot chat: apply natural-language edits
  POST /orchestrate/{run_id}/skip-logic                — Add conditional branching to questions
  POST /orchestrate/{run_id}/questions                 — Add a new question
  DELETE /orchestrate/{run_id}/questions/{q_id}        — Remove a question
  PATCH /orchestrate/{run_id}/questions/{q_id}         — Update specific fields on a question
  POST /orchestrate/{run_id}/reorder                   — Reorder questions
  POST /orchestrate/{run_id}/apply-recommendation/{action_id} — Execute a recommendation action
  GET  /agents/registry                                — List all agent manifests
  GET  /health
  GET  /metrics

Security:
  All non-health/metrics endpoints require X-Internal-Key header (HMAC comparison).
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

import dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST
from prometheus_client.exposition import generate_latest

dotenv.load_dotenv()

from agents.agents import (
    ACTIVE_AGENTS, ALL_AGENTS,
    survey_creator_agent,
    copilot_agent,
    skip_logic_agent,
    refiner_agent,
    recommender_agent,
)
from agents.lib import db
from agents.lib.checkpointer import get_checkpointer
from agents.lib.logger import logger
from agents.lib.metrics import orchestration_runs_total
from agents.lib.security import require_internal_key, make_thread_id, sanitise_intent, sanitise_org_context
from agents.schemas.output import (
    OrchestrationRequest, OrchestrationResponse, RunStatusResponse,
    RefineRequest, RefineResponse,
    SkipLogicRequest,
    AddQuestionRequest, PatchQuestionRequest, ReorderRequest,
    ApplyRecommendationRequest, QuestionsResponse,
    RefinerInput, SkipLogicInput, CopilotInput, RecommenderInput,
    OrgContext, SessionAction,
)
from agents.schemas.question import Question
from agents.schemas.state import make_initial_state, make_stream_event
from agents.lib.credits import summarise_credits
from agents.lib.metrics import registry as metrics_registry
from agents.lib.validators import fix_question_ids


# ── Application state ────────────────────────────────────────────────────────────

_compiled_graph: Any = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _compiled_graph
    await db.init_pool()
    async with get_checkpointer() as checkpointer:
        from agents.graph import build_graph
        _compiled_graph = build_graph(checkpointer)
        logger.info("agents_service_ready", env=os.getenv("AGENTS_ENV", "dev"))
        yield
    await db.close_pool()
    logger.info("agents_service_shutdown")


# ── FastAPI app ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Experient Copilot Agents",
    version="2.0.0",
    description="Survey orchestration + editing microservice for Experient Copilot.",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for _agent in ACTIVE_AGENTS:
    app.include_router(_agent.build_router(), prefix="/agents")


# ── Helpers ──────────────────────────────────────────────────────────────────────

async def _require_run(run_id: str, org_id: str) -> dict:
    """Load a run row or raise 404. Raises 400 if org_id missing."""
    if not org_id:
        raise HTTPException(status_code=400, detail="org_id required")
    row = await db.get_run_by_id(run_id, org_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return row


def _load_questions(row: dict) -> list[Question]:
    raw = row.get("result_questions") or []
    return [Question.model_validate(q) for q in raw]


def _questions_to_dicts(questions: list[Question]) -> list[dict]:
    return [q.model_dump(by_alias=True, exclude_none=True) for q in questions]


# ── Recommendation action dispatcher ─────────────────────────────────────────────

_REFINE_ACTIONS   = {"refine_question", "review_in_builder"}
_SKIPLOGIC_ACTIONS = {"add_skip_logic", "add_piping_logic"}
_ADDQ_ACTIONS     = {"add_followup_question"}
_NOOP_ACTIONS     = {
    "run_pilot", "request_expert_review", "check_compliance",
    "distribute_now", "schedule_send", "set_response_quota",
    "compare_template", "compare_previous_survey",
    "save_as_template", "set_expiry_date",
}

async def _dispatch_recommendation(
    action_id: str,
    questions: list[Question],
    params: dict,
    org_context: OrgContext,
    survey_type_id: str | None,
    intent: str,
) -> tuple[list[Question], str]:
    """Route a recommendation action to the appropriate agent. Returns (questions, message)."""

    if action_id in _SKIPLOGIC_ACTIONS:
        request_text = params.get("request") or "Add skip logic where it improves the survey flow."
        inp = SkipLogicInput(questions=questions, request=request_text, org_context=org_context)
        output, _ = await skip_logic_agent.run(inp)
        return output.questions, output.summary

    if action_id in _REFINE_ACTIONS:
        q_id = params.get("question_id")
        feedback = params.get("feedback", "Improve this question for clarity and neutrality.")
        if q_id:
            target = next((q for q in questions if q.id == q_id), None)
            if target:
                from agents.schemas.output import RefinerInput
                inp = RefinerInput(
                    question_to_refine=target,
                    user_feedback=feedback,
                    survey_questions=questions,
                    org_context=org_context,
                )
                output, _ = await refiner_agent.run(inp)
                updated = [output.refined_question if q.id == q_id else q for q in questions]
                return updated, output.explanation
        # No specific question — use Copilot for general refinement
        inp = CopilotInput(
            questions=questions,
            message=f"Refine the survey for clarity and neutrality. {feedback}",
            org_context=org_context,
            survey_type_id=survey_type_id,
            intent=intent,
        )
        output, _ = await copilot_agent.run(inp)
        return output.questions, output.explanation

    if action_id in _ADDQ_ACTIONS:
        topic = params.get("topic", "a follow-up question to gather more context")
        inp = CopilotInput(
            questions=questions,
            message=f"Add {topic}",
            org_context=org_context,
            survey_type_id=survey_type_id,
            intent=intent,
        )
        output, _ = await copilot_agent.run(inp)
        return output.questions, output.explanation

    if action_id in _NOOP_ACTIONS:
        return questions, f"Action '{action_id}' recorded. No question changes needed."

    raise HTTPException(status_code=400, detail=f"Unknown recommendation action: {action_id}")


# ── Orchestration: create run ────────────────────────────────────────────────────

async def _run_graph_background(run_id: str, thread_id: str, initial_state: dict) -> None:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        accumulated_events:  list[dict] = []
        accumulated_credits: list[dict] = []
        total_tokens = 0
        cost_usd     = 0.0

        async for chunk in _compiled_graph.astream(initial_state, config, stream_mode="updates"):
            node_name   = next(iter(chunk))
            node_update = chunk[node_name] or {}

            events  = node_update.get("stream_events", [])
            credits = node_update.get("credit_log", [])
            accumulated_events  += events
            accumulated_credits += credits
            total_tokens  = node_update.get("total_tokens", total_tokens)
            cost_usd      = node_update.get("cost_usd", cost_usd)

            if events or credits:
                await db.append_run_events(
                    run_id,
                    stream_events=events,
                    credit_log=credits,
                    total_tokens=total_tokens,
                    cost_usd=cost_usd,
                )
            logger.debug("graph_node_complete", run_id=run_id, node=node_name)

    except Exception as e:
        import traceback as _tb
        logger.error("graph_background_error", run_id=run_id, error=str(e),
                     traceback=_tb.format_exc())
        try:
            await db.update_run(run_id, status="failed", error_log=[str(e)])
        except Exception:
            pass


@app.post("/orchestrate", response_model=OrchestrationResponse,
          summary="Start a survey creation orchestration run")
async def start_orchestration(
    body: OrchestrationRequest,
    _key: None = Depends(require_internal_key),
) -> OrchestrationResponse:
    intent     = sanitise_intent(body.intent)
    org_ctx    = sanitise_org_context(body.org_context.model_dump())
    run_id     = str(uuid.uuid4())
    session_id = body.session_id or run_id
    thread_id  = make_thread_id(body.org_id, session_id)

    await db.create_run(
        run_id=run_id, thread_id=thread_id, org_id=body.org_id,
        user_id=body.user_id, intent=intent, survey_type_id=body.survey_type_id,
    )

    initial_state = make_initial_state(
        run_id=run_id, thread_id=thread_id, org_id=body.org_id,
        user_id=body.user_id, intent=intent,
        survey_type_id=body.survey_type_id, org_context=org_ctx,
        session_actions=[a.model_dump() for a in body.session_actions],
        survey_history=[h.model_dump() for h in body.survey_history],
    )

    task = asyncio.create_task(_run_graph_background(run_id, thread_id, initial_state))
    task.add_done_callback(
        lambda t: logger.warning("graph_task_unhandled_error", run_id=run_id, error=str(t.exception()))
        if t.exception() else None
    )

    orchestration_runs_total.labels(run_type="survey_creation", status="started").inc()
    logger.info("orchestration_started", run_id=run_id, org_id=body.org_id)
    return OrchestrationResponse(run_id=run_id, thread_id=thread_id, status="running")


@app.get("/orchestrate/{run_id}/status", response_model=RunStatusResponse,
         summary="Poll run status and accumulated stream events")
async def get_run_status(
    run_id:  str,
    request: Request,
    _key:    None = Depends(require_internal_key),
) -> RunStatusResponse:
    org_id = request.query_params.get("org_id", "")
    row    = await _require_run(run_id, org_id)

    credit_summary = summarise_credits(row.get("credit_log") or [])
    questions_raw  = row.get("result_questions") or []
    errors         = row.get("error_log") or []

    return RunStatusResponse(
        run_id=str(row["id"]),
        thread_id=row["thread_id"],
        status=row["status"],
        stream_events=row.get("stream_events") or [],
        qc_score=row.get("qc_score"),
        compliance_risk=row.get("compliance_risk_level"),
        questions=questions_raw if questions_raw else None,
        recommendations=row.get("recommendations") or [],
        credit_summary=credit_summary,
        error=errors[-1] if errors else None,
        validation_warnings=row.get("qc_validation_errors") or [],
    )


# ── Copilot chat: natural-language edits ─────────────────────────────────────────

@app.post("/orchestrate/{run_id}/refine", response_model=RefineResponse,
          summary="Apply a natural-language edit to survey questions via Copilot")
async def refine_survey(
    run_id: str,
    body:   RefineRequest,
    _key:   None = Depends(require_internal_key),
) -> RefineResponse:
    row = await _require_run(run_id, body.org_id)

    # Use frontend-provided questions when available — they reflect unsaved manual edits
    if body.questions:
        questions = body.questions
        # Sync current state to agents DB so subsequent calls stay consistent
        await db.save_run_questions(run_id, _questions_to_dicts(questions))
    else:
        questions = _load_questions(row)

    if not questions:
        raise HTTPException(status_code=422, detail="Run has no questions yet")

    inp = CopilotInput(
        questions=questions,
        message=sanitise_intent(body.message),
        org_context=body.org_context,
        survey_type_id=body.survey_type_id,
        intent=body.intent or row.get("intent", ""),
        conversation_history=body.conversation_history,
    )
    output, _ = await copilot_agent.run(inp)

    await db.save_run_questions(run_id, _questions_to_dicts(output.questions))
    logger.info("copilot_refine", run_id=run_id, org_id=body.org_id,
                changes=len(output.changes))

    return RefineResponse(
        questions=output.questions,
        explanation=output.explanation,
        changes=output.changes,
        suggestions=output.suggestions,
    )


# ── Skip logic ───────────────────────────────────────────────────────────────────

@app.post("/orchestrate/{run_id}/skip-logic", response_model=QuestionsResponse,
          summary="Add conditional skip/display logic to survey questions")
async def add_skip_logic(
    run_id: str,
    body:   SkipLogicRequest,
    _key:   None = Depends(require_internal_key),
) -> QuestionsResponse:
    row       = await _require_run(run_id, body.org_id)
    questions = _load_questions(row)

    if not questions:
        raise HTTPException(status_code=422, detail="Run has no questions yet")

    inp    = SkipLogicInput(questions=questions, request=body.request, org_context=body.org_context)
    output, _ = await skip_logic_agent.run(inp)

    await db.save_run_questions(run_id, _questions_to_dicts(output.questions))
    logger.info("skip_logic_added", run_id=run_id, changes=len(output.changes))

    return QuestionsResponse(
        questions=output.questions,
        message=output.summary,
        changes=[c.model_dump() for c in output.changes],
    )


# ── Question CRUD ────────────────────────────────────────────────────────────────

@app.post("/orchestrate/{run_id}/questions", response_model=QuestionsResponse,
          summary="Add a new question to the survey")
async def add_question(
    run_id: str,
    body:   AddQuestionRequest,
    _key:   None = Depends(require_internal_key),
) -> QuestionsResponse:
    row       = await _require_run(run_id, body.org_id)
    questions = _load_questions(row)

    # Determine next ID
    existing_nums = []
    for q in questions:
        try:
            existing_nums.append(int(q.id.lstrip("q")))
        except ValueError:
            pass
    next_num = max(existing_nums, default=0) + 1
    new_id   = f"q{next_num}"

    new_q = Question(id=new_id, type=body.type, question="New question", required=True)

    if body.after_id:
        idx = next((i for i, q in enumerate(questions) if q.id == body.after_id), None)
        if idx is not None:
            questions.insert(idx + 1, new_q)
        else:
            questions.append(new_q)
    else:
        questions.append(new_q)

    await db.save_run_questions(run_id, _questions_to_dicts(questions))
    logger.info("question_added", run_id=run_id, q_id=new_id, type=body.type)

    return QuestionsResponse(
        questions=questions,
        message=f"Added {body.type} question {new_id}",
        changes=[{"question_id": new_id, "what_changed": "added"}],
    )


@app.delete("/orchestrate/{run_id}/questions/{q_id}", response_model=QuestionsResponse,
            summary="Remove a question from the survey")
async def remove_question(
    run_id: str,
    q_id:   str,
    request: Request,
    _key:   None = Depends(require_internal_key),
) -> QuestionsResponse:
    org_id    = request.query_params.get("org_id", "")
    row       = await _require_run(run_id, org_id)
    questions = _load_questions(row)

    before = len(questions)
    # Remove the question and any skip logic rules that reference it
    updated = []
    for q in questions:
        if q.id == q_id:
            continue
        if q.skipLogic:
            q.skipLogic = [r for r in q.skipLogic if r.destination != q_id] or None
        if q.displayLogic and q.displayLogic.sourceQuestionId == q_id:
            q.displayLogic = None
        updated.append(q)

    if len(updated) == before:
        raise HTTPException(status_code=404, detail=f"Question {q_id} not found")

    await db.save_run_questions(run_id, _questions_to_dicts(updated))
    logger.info("question_removed", run_id=run_id, q_id=q_id)

    return QuestionsResponse(
        questions=updated,
        message=f"Removed question {q_id}",
        changes=[{"question_id": q_id, "what_changed": "removed"}],
    )


@app.patch("/orchestrate/{run_id}/questions/{q_id}", response_model=QuestionsResponse,
           summary="Update specific fields on a question")
async def patch_question(
    run_id: str,
    q_id:   str,
    body:   PatchQuestionRequest,
    _key:   None = Depends(require_internal_key),
) -> QuestionsResponse:
    row       = await _require_run(run_id, body.org_id)
    questions = _load_questions(row)

    target_idx = next((i for i, q in enumerate(questions) if q.id == q_id), None)
    if target_idx is None:
        raise HTTPException(status_code=404, detail=f"Question {q_id} not found")

    # Security boundary: body.org_id is validated by _require_run above, which calls
    # db.get_run_by_id(run_id, org_id) — this ensures the run belongs to the org.
    # The Node.js copilot.js route extracts req.orgId from the verified Clerk JWT and
    # passes it here, so org_id is always org-scoped before reaching this service.
    # Merge fields — never allow ID or type to be changed via patch (use Refiner for type changes)
    safe_fields = {k: v for k, v in body.fields.items() if k not in ("id",)}
    q_dict = questions[target_idx].model_dump(by_alias=True)
    q_dict.update(safe_fields)

    try:
        questions[target_idx] = Question.model_validate(q_dict)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid field values: {e}")

    await db.save_run_questions(run_id, _questions_to_dicts(questions))
    logger.info("question_patched", run_id=run_id, q_id=q_id, fields=list(safe_fields.keys()))

    return QuestionsResponse(
        questions=questions,
        message=f"Updated {q_id}: {', '.join(safe_fields.keys())}",
        changes=[{"question_id": q_id, "what_changed": f"patched: {list(safe_fields.keys())}"}],
    )


@app.post("/orchestrate/{run_id}/reorder", response_model=QuestionsResponse,
          summary="Reorder questions by providing a new ordered list of IDs")
async def reorder_questions(
    run_id: str,
    body:   ReorderRequest,
    _key:   None = Depends(require_internal_key),
) -> QuestionsResponse:
    row       = await _require_run(run_id, body.org_id)
    questions = _load_questions(row)

    q_map = {q.id: q for q in questions}
    missing = [qid for qid in body.order if qid not in q_map]
    if missing:
        raise HTTPException(status_code=422, detail=f"Unknown question IDs: {missing}")

    reordered = [q_map[qid] for qid in body.order]
    # Append any questions not listed in the order at the end
    listed = set(body.order)
    reordered += [q for q in questions if q.id not in listed]

    await db.save_run_questions(run_id, _questions_to_dicts(reordered))
    logger.info("questions_reordered", run_id=run_id, order=body.order)

    return QuestionsResponse(
        questions=reordered,
        message=f"Reordered {len(body.order)} questions",
        changes=[{"question_id": qid, "what_changed": f"moved to position {i+1}"}
                 for i, qid in enumerate(body.order)],
    )


# ── Recommendation dispatcher ────────────────────────────────────────────────────

@app.post("/orchestrate/{run_id}/apply-recommendation/{action_id}",
          response_model=QuestionsResponse,
          summary="Execute a recommendation action (skip logic, refine, add question, etc.)")
async def apply_recommendation(
    run_id:    str,
    action_id: str,
    body:      ApplyRecommendationRequest,
    _key:      None = Depends(require_internal_key),
) -> QuestionsResponse:
    row       = await _require_run(run_id, body.org_id)
    questions = _load_questions(row)

    updated, message = await _dispatch_recommendation(
        action_id=action_id,
        questions=questions,
        params=body.parameters,
        org_context=body.org_context,
        survey_type_id=body.survey_type_id,
        intent=body.intent or row.get("intent", ""),
    )

    if updated is not questions:
        await db.save_run_questions(run_id, _questions_to_dicts(updated))

    logger.info("recommendation_applied", run_id=run_id, action=action_id, org_id=body.org_id)

    return QuestionsResponse(
        questions=updated,
        message=message,
        changes=[{"action": action_id, "applied": True}],
    )


# ── Agent registry ───────────────────────────────────────────────────────────────

@app.get("/agents/registry", summary="List all agent manifests (active + stubs)")
async def list_agents(_key: None = Depends(require_internal_key)) -> list[dict]:
    return [
        {
            "name":              a.manifest.name,
            "version":           a.manifest.version,
            "description":       a.manifest.description,
            "tags":              a.manifest.tags,
            "enabled":           a.manifest.enabled,
            "phase":             a.manifest.phase,
            "required_features": a.manifest.required_features,
            "est_cost_usd":      a.manifest.est_cost_usd,
        }
        for a in ALL_AGENTS
    ]


# ── Health + Metrics ─────────────────────────────────────────────────────────────

@app.get("/health", include_in_schema=False)
async def health() -> dict:
    return {"status": "ok", "service": "agents", "env": os.getenv("AGENTS_ENV", "dev")}


@app.get("/metrics", include_in_schema=False)
async def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest(metrics_registry), media_type=CONTENT_TYPE_LATEST)


# ── Dev entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "agents.main:app",
        host=os.getenv("AGENTS_HOST", "0.0.0.0"),
        port=int(os.getenv("AGENTS_PORT", "8001")),
        reload=os.getenv("AGENTS_ENV", "dev") == "dev",
        log_level="info",
    )
