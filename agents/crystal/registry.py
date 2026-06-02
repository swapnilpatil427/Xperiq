"""Crystal tool registry — defines all 13 tools available to the ReAct loop."""
from __future__ import annotations
from typing import Any

# Each tool entry: name, description, input_schema (JSON Schema), scope
TOOL_REGISTRY: list[dict[str, Any]] = [
    {
        "name": "get_survey_overview",
        "description": "Get a high-level overview of a survey including response count, NPS/CSAT scores, and top topics.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string", "description": "UUID of the survey"}
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "get_topic_details",
        "description": "Get detailed information about a specific topic including verbatims and sentiment breakdown.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "topic_name": {"type": "string", "description": "Name of the topic to deep-dive"},
                "limit": {"type": "integer", "default": 10, "description": "Max verbatims to return"},
            },
            "required": ["survey_id", "topic_name"],
        },
    },
    {
        "name": "get_metric_history",
        "description": "Get time series of NPS/CSAT/CES metrics over time from metric snapshots.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "metric": {"type": "string", "enum": ["nps", "csat", "ces", "all"], "default": "all"},
                "days": {"type": "integer", "default": 90, "description": "Lookback window in days"},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "get_insights_list",
        "description": "Get the list of AI-generated insights for a survey, optionally filtered by layer or time window.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "layer": {"type": "string", "enum": ["descriptive", "diagnostic", "predictive", "prescriptive", "all"], "default": "all"},
                "time_window": {"type": "string", "enum": ["all_time", "last_30d", "last_7d"], "default": "all_time"},
                "limit": {"type": "integer", "default": 20},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "get_verbatims",
        "description": "Retrieve raw response verbatims filtered by topic and/or sentiment.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "topic_name": {"type": "string", "description": "Filter by topic (optional)"},
                "sentiment": {"type": "string", "enum": ["positive", "negative", "neutral", "all"], "default": "all"},
                "limit": {"type": "integer", "default": 15},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "get_benchmark_comparison",
        "description": "Compare survey metrics against industry benchmarks.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "metric": {"type": "string", "enum": ["nps", "csat", "ces"], "default": "nps"},
                "industry": {"type": "string", "description": "Industry for benchmark (uses org profile if not provided)"},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "get_driver_analysis",
        "description": "Get key drivers of NPS/CSAT with impact scores on a -100 to +100 scale.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "metric": {"type": "string", "enum": ["nps", "csat"], "default": "nps"},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "get_segment_breakdown",
        "description": "Break down responses by a specific question answer to show segment-level differences.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "segment_question_id": {"type": "string", "description": "Question ID to segment by"},
                "metric": {"type": "string", "enum": ["nps", "csat", "sentiment"], "default": "sentiment"},
            },
            "required": ["survey_id", "segment_question_id"],
        },
    },
    {
        "name": "get_checkpoint_history",
        "description": "Get the history of insight checkpoints for a survey showing how metrics changed over time.",
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string"},
                "limit": {"type": "integer", "default": 5},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "compare_surveys",
        "description": "Compare two surveys side-by-side on key metrics and themes.",
        "scope": "org",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id_a": {"type": "string"},
                "survey_id_b": {"type": "string"},
                "metrics": {"type": "array", "items": {"type": "string"}, "default": ["nps", "csat"]},
            },
            "required": ["survey_id_a", "survey_id_b"],
        },
    },
    {
        "name": "get_org_portfolio",
        "description": "Get a portfolio summary of all active surveys in the org with aggregate metrics.",
        "scope": "org",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 10, "description": "Max surveys to include"},
            },
        },
    },
    {
        "name": "get_cross_survey_themes",
        "description": "Identify topics/themes that appear frequently across multiple surveys in the org.",
        "scope": "org",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_survey_count": {"type": "integer", "default": 2, "description": "Min number of surveys a theme must appear in"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "get_anomaly_events",
        "description": "Get anomalous metric changes flagged by the pipeline across surveys.",
        "scope": "both",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id": {"type": "string", "description": "Filter by survey (optional for org scope)"},
                "days": {"type": "integer", "default": 30},
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
]


def get_tool_by_name(name: str) -> dict | None:
    """Look up a tool definition by name."""
    return next((t for t in TOOL_REGISTRY if t["name"] == name), None)


def get_tools_for_scope(scope: str) -> list[dict]:
    """Return tools available for a given scope ('survey' or 'org')."""
    return [
        t for t in TOOL_REGISTRY
        if t["scope"] == scope or t["scope"] == "both"
    ]
