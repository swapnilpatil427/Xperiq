"""Pydantic question schemas — mirrors the TypeScript types in app/src/types/index.ts.

Keeping these in sync is intentional: the agents produce JSON that the frontend
renders directly. Any new question type or field must be added here AND in the
TypeScript types file.
"""
from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

QuestionType = Literal[
    "nps", "csat", "rating", "slider",
    "multiple_choice", "checkbox", "dropdown", "ranking",
    "open_text", "short_text", "matrix", "date", "statement",
]


class SkipLogicCondition(BaseModel):
    operator: Literal["eq", "neq", "lt", "gt", "lte", "gte", "contains", "answered", "not_answered"]
    value:    Any = None


class SkipLogicRule(BaseModel):
    id:          str
    condition:   SkipLogicCondition
    destination: str   # question ID or "END_SURVEY"


class DisplayLogic(BaseModel):
    sourceQuestionId: str
    operator:         str
    value:            Any = None


class Question(BaseModel):
    id:       str
    type:     QuestionType
    question: str
    required: bool = True

    # Scale types (nps / rating / slider)
    labelLow:    str | None = None
    labelHigh:   str | None = None
    scaleMax:    int | None = None         # 5 | 7 | 10
    ratingStyle: str | None = None         # "stars" | "numbers"

    # CSAT
    csatStyle:   str | None = None         # "emoji" | "stars" | "numbers"

    # Slider
    min:         float | None = None
    max:         float | None = None
    step:        float | None = None
    showValue:   bool | None = None

    # Choice types
    options:        list[str] | None = None
    allowOther:     bool | None = None
    randomize:      bool | None = None
    maxSelections:  int | None = None

    # Text types
    placeholder: str | None = None
    maxLength:   int | None = None
    validation:  str | None = None

    # Matrix
    rows:       list[str] | None = None
    columns:    list[str] | None = None
    matrixType: str | None = None   # "radio" | "checkbox"

    # Date
    dateType:   str | None = None   # "date" | "time" | "datetime"

    # Logic
    skipLogic:    list[SkipLogicRule] | None = None
    displayLogic: DisplayLogic | None = None

    model_config = ConfigDict(extra="allow")  # tolerate new fields from LLM
