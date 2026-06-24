"""Stub agents for future Copilot capabilities.

These stubs reserve slots in the agent registry and graph without requiring
any real infrastructure. When the dependent sprint ships, replace the stub
with the real implementation — zero changes to the graph or other agents.

Each stub:
  - Has enabled=False so it never runs in production
  - Returns a clear "not yet available" message
  - Documents exactly what feature gate must be cleared to enable it
  - Preserves the agent manifest structure so the frontend can display
    "Coming soon" cards in the Copilot capability browser

Currently stubbed (active agents are in their own modules):
  - distribution     → blocked on Sprint 3B email channels
  - analytics        → blocked on Sprint 3 analytics endpoints
  - market_research  → blocked on BigQuery benchmark data
  - audience_validator → partially stubbed; pattern matching is done in validators.py
                         Full LLM implementation ships in Phase 2 with audience segmentation data
"""
from __future__ import annotations

from pydantic import BaseModel

from crystalos.agents.base import AgentManifest, BaseAgent


class _StubInput(BaseModel):
    org_id: str
    intent: str = ""


class _StubOutput(BaseModel):
    message: str
    required_features: list[str]


class _StubAgent(BaseAgent):
    def __init__(self, _manifest: AgentManifest) -> None:
        self._manifest = _manifest

    @property
    def manifest(self) -> AgentManifest:
        return self._manifest

    async def run(self, input_data: BaseModel, current_tokens: int = 0) -> tuple[_StubOutput, list[dict]]:
        return _StubOutput(
            message=(
                f"Agent '{self.manifest.name}' is not yet available. "
                f"Required features: {self.manifest.required_features}"
            ),
            required_features=self.manifest.required_features,
        ), []


# ── Distribution Agent (blocked on Sprint 3B) ─────────────────────────────────
distribution_agent = _StubAgent(
    AgentManifest(
        name="distribution",
        version="0.0.0-stub",
        description=(
            "Distributes surveys via email, SMS, and link channels. "
            "Tracks delivery, opens, and completion rates."
        ),
        input_schema=_StubInput,
        output_schema=_StubOutput,
        required_features=["sprint_3b_email_channels", "sprint_15_distribution"],
        tags=["distribution", "email", "sms", "copilot"],
        est_cost_usd=0.0,
        enabled=False,
        phase="2",
    )
)

# ── Analytics Agent (blocked on Sprint 3) ─────────────────────────────────────
analytics_agent = _StubAgent(
    AgentManifest(
        name="analytics",
        version="0.0.0-stub",
        description=(
            "Aggregates response data and generates executive-level insights. "
            "Surfaces NPS trends, topic clusters, and anomalies."
        ),
        input_schema=_StubInput,
        output_schema=_StubOutput,
        required_features=["sprint_3_analytics_endpoints"],
        tags=["analytics", "insights", "nps", "copilot"],
        est_cost_usd=0.0,
        enabled=False,
        phase="2",
    )
)

# ── Market Research Agent (blocked on BigQuery + external data) ───────────────
market_research_agent = _StubAgent(
    AgentManifest(
        name="market_research",
        version="0.0.0-stub",
        description=(
            "Benchmarks survey results against industry NPS standards. "
            "Surfaces competitive intelligence and market trends."
        ),
        input_schema=_StubInput,
        output_schema=_StubOutput,
        required_features=["sprint_3_analytics_endpoints", "bigquery_benchmark_data"],
        tags=["market-research", "benchmarks", "copilot"],
        est_cost_usd=0.0,
        enabled=False,
        phase="3",
    )
)

# ── Audience Validator (Phase 2 — blocked on audience segmentation data) ──────
# Phase 1: pattern-based checks are integrated into validators.py.
# Phase 2: full LLM analysis with org-specific audience profiles and reading-level scoring.
audience_validator_agent = _StubAgent(
    AgentManifest(
        name="audience_validator",
        version="0.0.0-stub",
        description=(
            "Validates that survey questions are appropriate for the target audience. "
            "Checks reading level, technical jargon, cultural sensitivity, and audience fit. "
            "Phase 2: integrates org-specific audience profiles and segment data."
        ),
        input_schema=_StubInput,
        output_schema=_StubOutput,
        required_features=["audience_segmentation_profiles"],
        tags=["audience", "validation", "accessibility", "copilot"],
        est_cost_usd=0.0,
        enabled=False,
        phase="2",
    )
)

ALL_STUBS = [distribution_agent, analytics_agent, market_research_agent, audience_validator_agent]
