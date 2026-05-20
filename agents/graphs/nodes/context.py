"""Pipeline nodes: node_context and node_route_specialists."""
from __future__ import annotations
from agents.lib.logger import logger
from agents.schemas.context import OrgContextModel, SurveyContextModel
from agents.specialists.registry import get_registry


async def node_context(state: dict) -> dict:
    """Load org and survey context from the survey payload and inject into state."""
    survey = state.get("survey", {})
    org_id = state.get("org_id", "")

    # Extract org context from survey metadata or org table data
    # The survey dict contains what the ingest node loaded
    org_meta = survey.get("org_context") or {}
    survey_meta = survey.get("metadata") or {}

    org_ctx = OrgContextModel(
        industry         = org_meta.get("industry", "general"),
        sub_vertical     = org_meta.get("sub_vertical", ""),
        size_band        = org_meta.get("size_band", "mid_market"),
        region           = org_meta.get("region", "global"),
        primary_use_case = org_meta.get("primary_use_case", "CX"),
    )

    survey_ctx = SurveyContextModel(
        survey_type = survey.get("survey_type_id") or survey_meta.get("survey_type", "general"),
        audience    = survey_meta.get("audience", "customers"),
        channel     = survey_meta.get("channel", "web"),
        topic_focus = survey_meta.get("topic_focus") or [],
        use_case    = survey_meta.get("use_case") or org_meta.get("primary_use_case", "CX"),
    )

    logger.info({
        "msg":         "node_context: loaded",
        "industry":    org_ctx.industry,
        "use_case":    survey_ctx.use_case,
        "survey_type": survey_ctx.survey_type,
    })

    return {
        **state,
        "org_context":    org_ctx.model_dump(),
        "survey_context": survey_ctx.model_dump(),
    }


async def node_route_specialists(state: dict) -> dict:
    """Route to the appropriate specialist agents based on org+survey context."""
    org_ctx    = OrgContextModel(**state.get("org_context", {}))
    survey_ctx = SurveyContextModel(**state.get("survey_context", {}))

    registry = get_registry()
    specialists = registry.match(org_ctx, survey_ctx)
    specialist_ids = [s.id for s in specialists]

    if specialists:
        logger.info({
            "msg":     "node_route_specialists: selected",
            "primary": specialists[0].display_name,
            "all_ids": specialist_ids,
        })
    else:
        logger.warning({"msg": "node_route_specialists: no specialist matched, pipeline continues with defaults"})

    return {**state, "selected_specialists": specialist_ids}
