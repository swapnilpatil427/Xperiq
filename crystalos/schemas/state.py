"""LangGraph state schema for the Survey Orchestrator.

TypedDict with all fields that flow through the graph.
Append-only lists (credit_log, stream_events, error_log) use
LangGraph's reducer pattern so parallel nodes don't overwrite each other.
"""
from __future__ import annotations

from typing import Annotated, Any, Literal

from langgraph.graph.message import add_messages


def _append(left: list, right: list) -> list:
    """Reducer: concatenate two lists (used for append-only JSONB columns)."""
    return left + right


class SurveyOrchestratorState(dict):
    """
    Full state that flows through the LangGraph supervisor graph.

    Typed as a plain dict subclass for LangGraph compatibility.
    All keys documented below with their types and defaults.

    Key design decisions:
    - thread_id = orgId:sessionId  → org-scoped checkpoint keys
    - revision_count capped at 2   → prevents infinite Creator→QC loops
    - stream_events accumulated    → frontend polls for progress updates
    - credit_log accumulated       → full cost audit trail per run
    """

    # ── Identity (set once in INTAKE, never mutated) ──────────────────────────
    # thread_id: str       — "orgId:sessionId"
    # org_id:    str
    # user_id:   str
    # run_id:    str       — UUID, idempotency key

    # ── Input ─────────────────────────────────────────────────────────────────
    # intent:         str
    # survey_type_id: str | None
    # org_context:    dict         — OrgContext fields

    # ── Agent outputs ─────────────────────────────────────────────────────────
    # questions:       list[dict]  — current best questions from Creator
    # qc_score:        float       — 0.0–10.0
    # qc_issues:       list[dict]  — QCIssue objects
    # recommendations: list[dict]  — Recommendation objects

    # ── Control flow ──────────────────────────────────────────────────────────
    # revision_count:    int       — 0–2; max revisions before forced-accept
    # status:            str       — running | waiting_approval | completed | failed | cancelled
    # awaiting_approval: bool
    # approval_decision: dict | None

    # ── Observability (append-only via reducers) ───────────────────────────────
    # credit_log:    list[dict]   — CreditEntry per agent call
    # stream_events: list[dict]   — StreamEvent per graph transition
    # error_log:     list[str]    — error messages


# Annotated type hints for use in graph node functions
# (Python TypedDict can't carry __annotations__ from a dict subclass cleanly;
#  use these directly in node signatures as return type hints)
ReducedList = Annotated[list[Any], _append]


def make_initial_state(
    run_id: str,
    thread_id: str,
    org_id: str,
    user_id: str,
    intent: str,
    survey_type_id: str | None,
    org_context: dict,
    session_actions: list[dict] | None = None,
    survey_history: list[dict] | None = None,
) -> dict:
    """Build the initial graph state dict for a new run."""
    return {
        # Identity
        "thread_id":   thread_id,
        "org_id":      org_id,
        "user_id":     user_id,
        "run_id":      run_id,
        # Input
        "intent":         intent,
        "survey_type_id": survey_type_id,
        "org_context":    org_context,
        "session_actions": session_actions or [],
        "survey_history":  survey_history or [],
        # Agent outputs
        "questions":        [],
        "qc_score":         0.0,
        "qc_issues":        [],
        "recommendations":  [],
        # Control
        "revision_count":    0,
        "status":            "running",
        "awaiting_approval": False,
        "approval_decision": None,
        # Observability
        "credit_log":    [],
        "stream_events": [],
        "error_log":     [],
        "total_tokens":  0,
        "cost_usd":      0.0,
    }


def make_stream_event(
    event: Literal["agent_start", "agent_complete", "approval_required", "run_complete", "run_failed"],
    agent: str | None = None,
    data:  dict | None = None,
) -> dict:
    """Factory for stream event dicts appended to state.stream_events."""
    import datetime
    return {
        "event":     event,
        "agent":     agent,
        "data":      data or {},
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
