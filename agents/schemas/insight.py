"""Insight-related Pydantic schemas."""
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field


class MetricResult(BaseModel):
    name:           str
    value:          float | None
    ci_low:         float | None = None
    ci_high:        float | None = None
    n:              int          = 0
    below_minimum:  bool         = False
    distribution:   dict         = Field(default_factory=dict)


class CitationRef(BaseModel):
    response_id: str
    quote:       str
    sentiment:   str  = "neutral"
    relevance:   float = 0.8
    emotion:     str  = "neutral"


class TrustComponents(BaseModel):
    statistical:  int = Field(ge=0, le=100, default=80)
    coverage:     int = Field(ge=0, le=100, default=80)
    consistency:  int = Field(ge=0, le=100, default=80)
    grounding:    int = Field(ge=0, le=100, default=80)
    below_minimum_sample: bool = False
    sample_size:  int = 0


class AuditInfo(BaseModel):
    model:           str
    embedding_model: str = "text-embedding-3-small"
    temperature:     float = 0.0
    seed:            int   = 42
    verifier_pass:   bool  = True
    verifier_notes:  str   = ""
    prompt_hash:     str   = ""
    run_id:          str   = ""


class InsightRecord(BaseModel):
    """One generated insight — maps to a DB row in the insights table."""
    survey_id:   str
    org_id:      str
    run_id:      str
    layer:       Literal["descriptive", "diagnostic", "predictive", "prescriptive"]
    category:    str                           # e.g. 'metric.nps', 'voice.topic', 'driver.key'
    question_type: str | None = None
    segment_json:  dict | None = None
    headline:    str
    narrative:   str                           # with [rXXXX] citation markers
    recommended_action: dict | None = None     # L4 only
    metric_json: dict | None = None            # {name, value, ci_low, ci_high, ...}
    citations_json: list[dict] = Field(default_factory=list)
    trust_score: int = Field(ge=0, le=100, default=75)
    trust_json:  dict = Field(default_factory=dict)
    priority:    float = Field(ge=0.0, le=1.0, default=0.5)
    insight_hash: str  = ""
    audit_json:  dict  = Field(default_factory=dict)
    user_state_json: dict = Field(default_factory=dict)


# ── LLM narrate/verify schemas ────────────────────────────────────────────────

class NarrateInsightOutput(BaseModel):
    """Structured output from the insight narration LLM call."""
    headline:  str = Field(max_length=120, description="Plain-English insight headline")
    narrative: str = Field(max_length=600,  description="2-3 sentence narrative with [rXXXX] citation markers")


class VerifyInsightOutput(BaseModel):
    """Structured output from the verifier LLM pass."""
    supported: bool
    reason:    str = Field(max_length=200, default="")


class InsightStateModel(BaseModel):
    """LangGraph state for the insight DAG."""
    survey_id:    str
    org_id:       str
    run_id:       str
    trigger:      str = "schedule"   # "new_response" | "regenerate" | "schedule" | "stream"

    # Loaded
    survey:       dict = Field(default_factory=dict)
    responses:    list[dict] = Field(default_factory=list)

    # Computed
    metrics:      dict = Field(default_factory=dict)          # name -> MetricResult dict
    open_texts:   list[dict] = Field(default_factory=list)    # [{response_id, question_id, text}]
    absa_results: list[dict] = Field(default_factory=list)    # ABSA output
    clusters:     list[dict] = Field(default_factory=list)    # topic clusters
    drivers:      list[dict] = Field(default_factory=list)    # key driver analysis
    stream_events: list[dict] = Field(default_factory=list)

    # Emitted
    insights:     list[dict] = Field(default_factory=list)    # InsightRecord dicts
    errors:       list[str]  = Field(default_factory=list)
