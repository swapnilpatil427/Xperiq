"""Specialist agent manifest schemas."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


class MatchRules(BaseModel):
    industries: list[str] = Field(default_factory=list)
    sub_verticals: list[str] = Field(default_factory=list)
    use_cases: list[str] = Field(default_factory=list)
    survey_types: list[str] = Field(default_factory=list)
    audiences: list[str] = Field(default_factory=list)


class TopicEntry(BaseModel):
    name: str
    parent: str = ""
    keywords: list[str] = Field(default_factory=list)
    weight: float = 1.0


class Taxonomy(BaseModel):
    canonical_topics: list[TopicEntry] = Field(default_factory=list)


class BenchmarkBand(BaseModel):
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    source: str = ""
    scale: int = 10   # NPS uses 10, CSAT/rating uses 5


class Vocabulary(BaseModel):
    positive_signals: list[str] = Field(default_factory=list)
    negative_signals: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    domain_terms: list[str] = Field(default_factory=list)


class PromptOverlays(BaseModel):
    narrate_system: str = ""
    topics_system: str = ""
    crystal_system: str = ""
    creator_system: str = ""


class QuestionTemplate(BaseModel):
    id: str
    text: str
    type: str   # "nps" | "csat" | "rating" | "open_text" | "multiple_choice"
    theme: str = ""


class SpecialistManifest(BaseModel):
    id: str
    display_name: str
    priority: int = 50
    match: MatchRules = Field(default_factory=MatchRules)
    taxonomy: Taxonomy = Field(default_factory=Taxonomy)
    benchmarks: dict[str, BenchmarkBand] = Field(default_factory=dict)
    vocabulary: Vocabulary = Field(default_factory=Vocabulary)
    prompt_overlays: PromptOverlays = Field(default_factory=PromptOverlays)
    question_templates: list[QuestionTemplate] = Field(default_factory=list)
