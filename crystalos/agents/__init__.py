from crystalos.agents.creator    import survey_creator_agent
from crystalos.agents.qc         import quality_control_agent
from crystalos.agents.recommender import recommender_agent
from crystalos.agents.compliance  import compliance_agent
from crystalos.agents.refiner     import refiner_agent
from crystalos.agents.skip_logic  import skip_logic_agent
from crystalos.agents.copilot     import copilot_agent
from crystalos.agents.stub        import ALL_STUBS

# All active (enabled) agents — used by the capability registry endpoint.
# Order matters: the graph runs Creator → QC → Compliance → Recommender.
# Refiner, SkipLogic, Copilot are standalone (not in the main graph).
ACTIVE_AGENTS = [
    survey_creator_agent,
    quality_control_agent,
    compliance_agent,
    recommender_agent,
    refiner_agent,
    skip_logic_agent,
    copilot_agent,
]

# Full registry including stubs — used by the /agents/registry endpoint
ALL_AGENTS = ACTIVE_AGENTS + ALL_STUBS
