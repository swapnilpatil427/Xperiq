"""BaseAgent — shared contract for every Copilot agent.

Every agent in the Experient Copilot framework inherits from BaseAgent.
This ensures:
  1. Consistent standalone /run endpoint (each agent is independently testable)
  2. Uniform credit tracking
  3. Uniform stream event emission
  4. Agent manifest for the capability registry (extensibility hook)

Copilot is the flagship Experient product. As new capabilities are added
(Distribution, Analytics, Compliance, etc.), each one registers an AgentManifest
so the supervisor can discover and route to it without graph changes.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel


@dataclass
class AgentManifest:
    """Describes a Copilot agent's capabilities and deployment requirements.

    The manifest is the single source of truth for what an agent can do,
    what it costs, and whether it's ready to run in the current environment.
    Modelled after the A2A (Agent-to-Agent) protocol's agent card concept
    for future interoperability.
    """
    name:                str
    version:             str
    description:         str             # plain-English, shown in Copilot UI
    input_schema:        type[BaseModel]
    output_schema:       type[BaseModel]
    # Features that must exist before this agent can be enabled.
    # Example: ["sprint_3b_distribution"] keeps DistributionAgent disabled
    # until the email channel infrastructure ships.
    required_features:   list[str] = field(default_factory=list)
    # Tags used for discovery (e.g. "survey", "analysis", "distribution")
    tags:                list[str] = field(default_factory=list)
    # Rough USD cost per single run — used for credit pre-display in UI
    est_cost_usd:        float = 0.001
    enabled:             bool  = True
    phase:               str   = "1"     # "1" | "2" | "3" — roadmap phase


class BaseAgent(abc.ABC):
    """Abstract base class for all Copilot agents.

    Subclasses must implement:
      - manifest: AgentManifest
      - run(input) -> (output, credit_entries)

    The router property exposes the agent's standalone HTTP endpoint.
    """

    @property
    @abc.abstractmethod
    def manifest(self) -> AgentManifest: ...

    @abc.abstractmethod
    async def run(self, input_data: BaseModel, current_tokens: int = 0) -> tuple[BaseModel, list[dict]]:
        """
        Execute the agent and return (output, credit_log_entries).

        current_tokens: tokens already consumed by this run — used for budget check.
        Returns credit_log_entries as list of CreditEntry.to_dict() dicts.
        """
        ...

    def build_router(self) -> APIRouter:
        """
        Returns a FastAPI router with a single POST /run endpoint.
        This makes the agent independently runnable and testable.

        Mount under /agents/{agent.manifest.name}
        """
        router  = APIRouter(prefix=f"/{self.manifest.name}", tags=[self.manifest.name])
        agent   = self
        InputModel  = self.manifest.input_schema
        OutputModel = self.manifest.output_schema

        @router.post(
            "/run",
            response_model=dict,
            summary=f"Run {self.manifest.name} agent standalone",
            description=(
                f"{self.manifest.description}\n\n"
                "This endpoint runs the agent in isolation without the full orchestration graph. "
                "Useful for testing individual agent behaviour and prompt tuning."
            ),
        )
        async def run_standalone(body: InputModel) -> dict:  # type: ignore[valid-type]
            output, credit_log = await agent.run(body)
            return {
                "agent":    agent.manifest.name,
                "version":  agent.manifest.version,
                "output":   output.model_dump(),
                "credits":  credit_log,
            }

        @router.get("/manifest", summary="Agent manifest / capability card")
        async def get_manifest() -> dict[str, Any]:
            return {
                "name":              agent.manifest.name,
                "version":           agent.manifest.version,
                "description":       agent.manifest.description,
                "tags":              agent.manifest.tags,
                "enabled":           agent.manifest.enabled,
                "phase":             agent.manifest.phase,
                "required_features": agent.manifest.required_features,
                "est_cost_usd":      agent.manifest.est_cost_usd,
                "input_schema":      InputModel.model_json_schema(),
                "output_schema":     OutputModel.model_json_schema(),
            }

        return router
