"""Per-agent input/output schemas.

Each agent exports:
  - <Name>Input  — what it needs to run
  - <Name>Output — what it returns (validated by Pydantic from LLM JSON)

These schemas double as the API request/response bodies for the standalone
/agents/{name}/run endpoints, making every agent independently testable.
"""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, field_validator

from agents.schemas.question import Question


# ── Shared ─────────────────────────────────────────────────────────────────────

class OrgContext(BaseModel):
    """Org profile fields injected into every agent for context-awareness."""
    industry:           str | None = None
    size:               str | None = None    # "1-10" | "11-50" | "51-200" | "201-1000" | "1000+"
    use_case:           str | None = None    # "cx" | "employee" | "market_research" | ...
    target_audience:    str | None = None
    prior_survey_count: int        = 0
    brand_description:  str | None = None
    region:             str        = "US"    # "US" | "EU" | "APAC" — drives compliance rules


# ── Survey Creator ─────────────────────────────────────────────────────────────

class CreatorInput(BaseModel):
    intent:         str
    survey_type_id: str | None = None
    org_context:    OrgContext  = Field(default_factory=OrgContext)
    revision_issues: list[dict] = Field(default_factory=list)
    revision_count:  int        = 0


class CreatorOutput(BaseModel):
    """LLM must return exactly this structure."""
    questions: list[Question]   = Field(min_length=3, max_length=15)
    rationale: str              = Field(max_length=300)


# ── Quality Control ────────────────────────────────────────────────────────────

class QCIssue(BaseModel):
    question_id: str
    type:        Literal["bias", "clarity", "structure", "completeness"]
    message:     str
    severity:    Literal["high", "medium", "low"]
    suggestion:  str


class QCInput(BaseModel):
    questions:      list[Question]
    survey_type_id: str | None = None
    org_context:    OrgContext  = Field(default_factory=OrgContext)


class QCOutput(BaseModel):
    """LLM must return exactly this structure."""
    score:            float           = Field(ge=0.0, le=10.0)
    issues:           list[QCIssue]   = Field(default_factory=list)
    overall_feedback: str             = Field(max_length=300)
    # Populated by the agent after LLM returns — not from the LLM
    score_was_adjusted: bool = False
    validation_errors:  list[str]     = Field(default_factory=list)


class QCValidationOutput(BaseModel):
    """Haiku's independent assessment of Gemini's QC result — not shown to the user."""
    agrees_with_score: bool
    concerns:          list[str] = Field(default_factory=list, max_length=3)
    suggested_score:   float | None = Field(default=None, ge=0.0, le=10.0)


# ── Compliance ─────────────────────────────────────────────────────────────────

class ComplianceFinding(BaseModel):
    question_id: str
    risk_type:   Literal["pii_direct", "pii_indirect", "sensitive_topic", "legal_risk", "industry_specific"]
    description: str = Field(max_length=300)
    severity:    Literal["high", "medium", "low"]
    suggestion:  str = Field(max_length=300)


class ComplianceInput(BaseModel):
    questions:      list[Question]
    org_context:    OrgContext  = Field(default_factory=OrgContext)
    survey_type_id: str | None = None


class ComplianceOutput(BaseModel):
    """LLM must return exactly this structure."""
    risk_level:          Literal["low", "medium", "high"]
    findings:            list[ComplianceFinding] = Field(default_factory=list)
    overall_assessment:  str = Field(max_length=400)
    blocks_distribution: bool = False   # True only if risk_level == "high"

    @field_validator("blocks_distribution", mode="before")
    @classmethod
    def set_blocks_from_risk(cls, v: bool, info) -> bool:
        # blocks_distribution must be True if risk_level is high
        risk = info.data.get("risk_level", "low")
        return True if risk == "high" else v


# ── Question Refiner ───────────────────────────────────────────────────────────

class RefinerInput(BaseModel):
    question_to_refine: Question          # The specific question to improve
    user_feedback:      str = Field(max_length=500)  # Plain-English edit request
    survey_questions:   list[Question] = Field(default_factory=list)  # Surrounding context
    org_context:        OrgContext      = Field(default_factory=OrgContext)


class RefinerOutput(BaseModel):
    """LLM must return exactly this structure."""
    refined_question: Question
    explanation:      str = Field(max_length=300)   # What changed and why
    # Populated by the agent after validation — not from LLM
    type_was_preserved: bool = True
    validation_errors:  list[str] = Field(default_factory=list)


# ── Audience Validator ─────────────────────────────────────────────────────────

class AudienceFinding(BaseModel):
    question_id: str
    issue:       str = Field(max_length=200)
    severity:    Literal["high", "medium", "low"]
    suggestion:  str = Field(max_length=200)


class AudienceInput(BaseModel):
    questions:      list[Question]
    org_context:    OrgContext  = Field(default_factory=OrgContext)
    survey_type_id: str | None = None


class AudienceOutput(BaseModel):
    """LLM must return exactly this structure."""
    audience_score:     float = Field(ge=0.0, le=10.0)
    findings:           list[AudienceFinding] = Field(default_factory=list)
    overall_assessment: str = Field(max_length=300)


# ── Recommendation ─────────────────────────────────────────────────────────────

VALID_RECOMMENDATION_ACTIONS = {
    # Editing
    "add_skip_logic",
    "add_followup_question",
    "refine_question",
    "review_in_builder",
    "add_piping_logic",
    # Quality
    "run_pilot",
    "request_expert_review",
    "check_compliance",
    # Distribution (only when qc_score >= 8.0 and compliance low/medium)
    "distribute_now",
    "schedule_send",
    "set_response_quota",
    # Analysis
    "compare_template",
    "compare_previous_survey",
    # Lifecycle
    "save_as_template",
    "set_expiry_date",
}


class Recommendation(BaseModel):
    action:     str
    label:      str   = Field(max_length=60)
    reason:     str   = Field(max_length=200)
    priority:   Literal["high", "medium", "low"]
    cta:        str   = Field(max_length=40)
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)  # LLM's confidence in this rec


class SessionAction(BaseModel):
    """An action the user already took in this Copilot session."""
    action:    str
    context:   str = ""  # brief description of what happened


class SurveyHistoryItem(BaseModel):
    """Summary of one of the org's previous surveys."""
    survey_type_id: str | None
    qc_score:       float | None
    question_count: int
    days_ago:       int


class RecommenderInput(BaseModel):
    questions:      list[Question]
    qc_score:       float
    intent:         str
    org_context:    OrgContext  = Field(default_factory=OrgContext)
    survey_type_id: str | None = None
    revision_count: int        = 0          # How many Creator→QC loops were needed
    # From compliance agent (if it ran before recommender)
    compliance_risk_level:     str | None = None    # "low" | "medium" | "high" | None
    compliance_findings_count: int        = 0
    # From audience agent (if it ran)
    audience_score: float | None = None
    # Session context — what has already been done
    session_actions: list[SessionAction]    = Field(default_factory=list)
    # Org's historical survey data (from DB lookup before calling recommender)
    survey_history:  list[SurveyHistoryItem] = Field(default_factory=list)


class RecommenderOutput(BaseModel):
    """LLM must return exactly this structure."""
    recommendations: list[Recommendation] = Field(min_length=1, max_length=3)
    lifecycle_stage: str = Field(
        default="post_creation",
        description="Detected lifecycle stage: drafting|post_creation|ready_to_distribute|active|closed",
    )


# ── Skip Logic Generator ──────────────────────────────────────────────────────

class SkipLogicInput(BaseModel):
    questions:    list[Question]
    request:      str = Field(max_length=1000)  # plain-English: "if NPS < 7 ask follow-up"
    org_context:  OrgContext = Field(default_factory=OrgContext)


class SkipLogicChange(BaseModel):
    question_id:    str
    field:          Literal["skipLogic", "displayLogic"]
    previous_value: list | dict | None = None
    new_value:      list | dict | None = None
    explanation:    str = Field(max_length=300)


class SkipLogicOutput(BaseModel):
    """LLM must return exactly this structure."""
    questions:   list[Question]
    changes:     list[SkipLogicChange] = Field(default_factory=list)
    summary:     str = Field(max_length=400)


class CopilotChange(BaseModel):
    question_id:  str
    what_changed: str
    action:       str | None = None   # "added" | "removed" | "edited"


# ── Copilot Chat Agent ─────────────────────────────────────────────────────────

class ConversationTurn(BaseModel):
    """A single turn in the Copilot chat conversation."""
    role:    Literal["user", "assistant"]
    content: str = Field(max_length=2000)


class CopilotIntent(BaseModel):
    """Structured intent parsed from natural-language Copilot message."""
    action:         Literal[
        "refine_question",       # edit wording / type / config of a specific question
        "add_skip_logic",        # add conditional branching
        "add_display_logic",     # add conditional visibility
        "add_question",          # insert a new question
        "remove_question",       # delete a question
        "reorder_questions",     # change question sequence
        "configure_question",    # set maxLength / allowOther / randomize / validation / etc.
        "bulk_configure",        # apply a config rule across multiple questions
        "general_refine",        # regenerate / improve the whole survey
    ]
    target_question_ids: list[str] = Field(default_factory=list)  # q1, q3 etc.
    parameters:          dict      = Field(default_factory=dict)   # action-specific params
    user_message:        str       = ""                            # original message


class CopilotInput(BaseModel):
    questions:    list[Question]
    message:      str = Field(max_length=2000)   # user's chat message
    org_context:  OrgContext  = Field(default_factory=OrgContext)
    survey_type_id: str | None = None
    intent:       str = ""                       # original survey creation intent
    conversation_history: list[ConversationTurn] = Field(default_factory=list)


class CopilotOutput(BaseModel):
    """LLM must return exactly this structure."""
    questions:     list[Question]
    explanation:   str = Field(max_length=1200)
    response_type: Literal["edit", "answer", "recommendations"] = "edit"
    changes:       list[CopilotChange] = Field(default_factory=list)
    suggestions:   list[str]  = Field(default_factory=list, max_length=3)  # follow-up prompts


# ── Approval (human-in-the-loop) ───────────────────────────────────────────────

class ApprovalDecision(BaseModel):
    approved:         bool
    edited_questions: list[Question] | None = None


# ── Orchestration API ──────────────────────────────────────────────────────────

class OrchestrationRequest(BaseModel):
    org_id:         str
    user_id:        str
    intent:         str
    survey_type_id: str | None = None
    session_id:     str | None = None
    org_context:    OrgContext  = Field(default_factory=OrgContext)
    # Enrichment from the Node.js backend (optional — recommender uses if present)
    session_actions: list[SessionAction]     = Field(default_factory=list)
    survey_history:  list[SurveyHistoryItem] = Field(default_factory=list)


class OrchestrationResponse(BaseModel):
    run_id:    str
    thread_id: str
    status:    str


class RunStatusResponse(BaseModel):
    run_id:           str
    thread_id:        str
    status:           str
    stream_events:    list[dict]  = Field(default_factory=list)
    qc_score:         float | None = None
    compliance_risk:  str | None  = None
    questions:        list[Question] | None = None
    recommendations:  list[dict]  = Field(default_factory=list)
    credit_summary:   dict        = Field(default_factory=dict)
    error:            str | None  = None
    validation_warnings: list[str] = Field(default_factory=list)


# ── CRUD / Edit Endpoint Schemas ───────────────────────────────────────────────

class RefineRequest(BaseModel):
    """Body for POST /orchestrate/{run_id}/refine — Copilot chat edit."""
    org_id:        str
    message:       str = Field(max_length=2000)
    questions:     list[Question] | None = None  # current frontend state; overrides DB if provided
    org_context:   OrgContext  = Field(default_factory=OrgContext)
    survey_type_id: str | None = None
    intent:        str = ""
    conversation_history: list[ConversationTurn] = Field(default_factory=list)


class RefineResponse(BaseModel):
    questions:       list[Question]
    explanation:     str
    changes:         list[CopilotChange] = Field(default_factory=list)
    suggestions:     list[str]  = Field(default_factory=list)
    recommendations: list[dict] = Field(default_factory=list)
    response_type:   str        = "edit"


class AddQuestionRequest(BaseModel):
    """Body for POST /orchestrate/{run_id}/questions."""
    org_id:   str
    type:     str = "open_text"
    after_id: str | None = None   # insert after this question ID; None = append


class PatchQuestionRequest(BaseModel):
    """Body for PATCH /orchestrate/{run_id}/questions/{q_id}."""
    org_id: str
    fields: dict    # partial question fields to apply


class ReorderRequest(BaseModel):
    """Body for POST /orchestrate/{run_id}/reorder."""
    org_id:   str
    order:    list[str]   # ordered list of question IDs


class SkipLogicRequest(BaseModel):
    """Body for POST /orchestrate/{run_id}/skip-logic."""
    org_id:      str
    request:     str = Field(max_length=1000)
    org_context: OrgContext = Field(default_factory=OrgContext)


class ApplyRecommendationRequest(BaseModel):
    """Body for POST /orchestrate/{run_id}/apply-recommendation/{action_id}."""
    org_id:      str
    parameters:  dict = Field(default_factory=dict)   # action-specific params
    org_context: OrgContext = Field(default_factory=OrgContext)
    survey_type_id: str | None = None
    intent:      str = ""


class QuestionsResponse(BaseModel):
    """Generic questions + message response for CRUD endpoints."""
    questions:       list[Question]
    message:         str = ""
    changes:         list[dict] = Field(default_factory=list)
    recommendations: list[dict] = Field(default_factory=list)
