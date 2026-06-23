"""Org and survey context schemas for specialist routing."""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class OrgContextModel(BaseModel):
    industry: str = "general"           # e.g. "healthcare", "retail", "saas"
    sub_vertical: str = ""              # e.g. "ambulatory_care", "ecommerce"
    size_band: str = "mid_market"       # "smb" | "mid_market" | "enterprise"
    region: str = "global"             # "NA" | "EMEA" | "APAC" | "global"
    primary_use_case: str = "CX"        # "CX" | "EX" | "research"


class SurveyContextModel(BaseModel):
    survey_type: str = "general"
    audience: str = "customers"         # "customers" | "employees" | "prospects"
    channel: str = "web"
    topic_focus: list[str] = Field(default_factory=list)
    use_case: str = "CX"
