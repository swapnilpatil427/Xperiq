"""Crystal tool registry — defines all tools available to the Crystal ReAct loop.

Two categories:
  1. Data tools (read-only) — query DB for insights, topics, metrics, verbatims
  2. Action tools (write-intent) — propose surveys, edits, workflows, distribution.
     Action tools return *proposals* (structured JSON) that the frontend executes
     after user confirmation. Crystal never executes write operations autonomously.
"""
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
    # ── Action tools (propose-only — frontend executes after user confirmation) ──

    {
        "name": "recommend_next_actions",
        "description": (
            "Generate a prioritized list of recommended next actions based on current survey insights, "
            "industry context, top themes, and conversation history. Returns concrete proposals "
            "(create follow-up survey, add questions, distribute to segment, create workflow) "
            "with execution params the user can apply with one click. Use when the user asks "
            "'What should I do?', 'What are my next steps?', or 'How do I act on this?'."
        ),
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id":  {"type": "string"},
                "focus_area": {"type": "string", "description": "Specific theme or topic to focus recommendations on (optional)"},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "propose_survey_creation",
        "description": (
            "Propose a new follow-up or complementary survey based on insights gaps. "
            "Returns a survey creation proposal with intent, type, and suggested questions. "
            "Use when the user wants to dig deeper into a theme, target a specific segment, "
            "or run a follow-up after this survey's results. The proposal must be confirmed by "
            "the user before anything is created."
        ),
        "scope": "both",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id":    {"type": "string", "description": "Source survey for context"},
                "purpose":      {"type": "string", "description": "What should the new survey learn? (plain English)"},
                "target_audience": {"type": "string", "description": "Who to send it to (e.g., 'NPS detractors', 'churned customers')"},
                "survey_type":  {"type": "string", "enum": ["NPS", "CSAT", "CES", "eNPS", "custom"], "default": "custom"},
            },
            "required": ["purpose"],
        },
    },
    {
        "name": "propose_survey_edit",
        "description": (
            "Propose specific edits to the current survey — add questions, improve wording, "
            "add skip logic, or restructure. Returns a list of proposed changes with rationale. "
            "Use when the user wants to improve the survey based on insights, add follow-up "
            "questions for a specific theme, or add conditional branching. Confirms before applying."
        ),
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id":    {"type": "string"},
                "edit_request": {"type": "string", "description": "What changes to propose (plain English)"},
                "focus_topic":  {"type": "string", "description": "Topic or theme to target with edits (optional)"},
            },
            "required": ["survey_id", "edit_request"],
        },
    },
    {
        "name": "propose_distribution",
        "description": (
            "Propose a targeted distribution strategy — which segment to reach, which channel "
            "to use, and when to send. Returns a distribution proposal with audience filter, "
            "channel, timing, and expected response rate. Use when the user asks about "
            "sending the survey to more people, targeting a specific group, or re-engaging "
            "non-respondents. Confirms before distributing."
        ),
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id":       {"type": "string"},
                "target_segment":  {"type": "string", "description": "Who to target (e.g., 'NPS detractors', 'churned last 30 days')"},
                "goal":            {"type": "string", "description": "What you want to learn from this send"},
            },
            "required": ["survey_id"],
        },
    },
    {
        "name": "propose_workflow",
        "description": (
            "Propose an automation workflow triggered by survey responses — for example, "
            "alert a CSM when NPS < 7, send a follow-up email after low CSAT, or create a "
            "Jira ticket for high-effort interactions. Returns a workflow proposal with trigger, "
            "condition, and action. Confirms before creating."
        ),
        "scope": "survey",
        "input_schema": {
            "type": "object",
            "properties": {
                "survey_id":        {"type": "string"},
                "trigger_condition": {"type": "string", "description": "What response pattern triggers the workflow (e.g., 'NPS score 0-6')"},
                "desired_outcome":  {"type": "string", "description": "What should happen when triggered"},
            },
            "required": ["survey_id", "trigger_condition"],
        },
    },
    {
        "name": "list_relevant_templates",
        "description": (
            "Find survey templates relevant to the current insights or themes. "
            "Returns matching templates from the template library that the user can "
            "use as starting points for follow-up surveys. Use when the user asks "
            "'what template should I use?' or 'do you have a template for X?'."
        ),
        "scope": "both",
        "input_schema": {
            "type": "object",
            "properties": {
                "search_query": {"type": "string", "description": "What kind of survey template to find"},
                "survey_type":  {"type": "string", "enum": ["NPS", "CSAT", "CES", "eNPS", "custom", "any"], "default": "any"},
            },
            "required": ["search_query"],
        },
    },
    # ── User-directory tools (org segmentation) ──────────────────────────────────
    {
        "name": "get_user_directory_context",
        "description": (
            "Get the org's department hierarchy, user groups, and active-user count. "
            "Use this to discover how the organization is structured before segmenting "
            "responses (e.g. 'How does Engineering compare to Sales?')."
        ),
        "scope": "org",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "segment_users_by_attribute",
        "description": (
            "Resolve a segment (a department and its sub-departments, a user group, or a "
            "role) to the list of user_ids in it. Use the returned user_ids to cross-reference "
            "responses by respondent for comparative analysis across org segments."
        ),
        "scope": "org",
        "input_schema": {
            "type": "object",
            "properties": {
                "department_id": {"type": "string", "description": "Department UUID (includes sub-departments)"},
                "department_name": {"type": "string", "description": "Department name (resolved to id)"},
                "group_id": {"type": "string", "description": "User group UUID"},
                "group_name": {"type": "string", "description": "User group name (resolved to id)"},
                "role_key": {"type": "string", "description": "Built-in role key, e.g. org:analyst"},
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


# Separate lists for UI categorisation
DATA_TOOL_NAMES = {
    "get_survey_overview", "get_topic_details", "get_metric_history",
    "get_insights_list", "get_verbatims", "get_benchmark_comparison",
    "get_driver_analysis", "get_segment_breakdown", "get_checkpoint_history",
    "compare_surveys", "get_org_portfolio", "get_cross_survey_themes",
    "get_anomaly_events",
    "get_user_directory_context", "segment_users_by_attribute",
}

ACTION_TOOL_NAMES = {
    "recommend_next_actions", "propose_survey_creation", "propose_survey_edit",
    "propose_distribution", "propose_workflow", "list_relevant_templates",
}


def is_action_tool(tool_name: str) -> bool:
    """True when the tool proposes a user-confirming action (vs. read-only data query)."""
    return tool_name in ACTION_TOOL_NAMES
