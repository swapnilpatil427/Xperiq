"""Unit tests for the Compliance Agent."""
import pytest
from unittest.mock import AsyncMock, patch

from crystalos.agents.compliance import ComplianceAgent
from crystalos.schemas.output import ComplianceFinding, ComplianceInput, ComplianceOutput, OrgContext
from crystalos.schemas.question import Question
from tests.conftest import make_credit


@pytest.fixture
def agent():
    return ComplianceAgent()


@pytest.fixture
def clean_survey():
    return ComplianceInput(
        questions=[
            Question(id="q1", type="nps", question="How likely are you to recommend us?", required=True),
            Question(id="q2", type="rating", question="How satisfied are you overall?", required=True, scaleMax=5),
            Question(id="q3", type="open_text", question="What could we improve?", required=False),
        ],
        org_context=OrgContext(industry="technology", region="US"),
    )


@pytest.fixture
def pii_survey():
    return ComplianceInput(
        questions=[
            Question(id="q1", type="short_text", question="What is your full name?", required=True),
            Question(id="q2", type="short_text", question="What is your email address?", required=True),
            Question(id="q3", type="open_text", question="Any other feedback?", required=False),
        ],
        org_context=OrgContext(industry="technology", region="EU"),
    )


async def test_compliance_clean_survey(agent, clean_survey):
    clean_output = ComplianceOutput(
        risk_level="low",
        findings=[],
        overall_assessment="No compliance concerns detected.",
        blocks_distribution=False,
    )
    credit = make_credit("compliance")

    with patch("crystalos.agents.compliance.call_agent", new=AsyncMock(return_value=(clean_output, credit))):
        output, credits = await agent.run(clean_survey)

    assert output.risk_level == "low"
    assert output.findings == []
    assert output.blocks_distribution is False


async def test_compliance_pii_survey_high_risk(agent, pii_survey):
    high_risk_output = ComplianceOutput(
        risk_level="high",
        findings=[
            ComplianceFinding(
                question_id="q1",
                risk_type="pii_direct",
                description="Collecting full names without consent disclosure",
                severity="high",
                suggestion="Remove or add GDPR consent notice before this question",
            ),
            ComplianceFinding(
                question_id="q2",
                risk_type="pii_direct",
                description="Email collection — personal data under GDPR",
                severity="high",
                suggestion="Only collect if strictly necessary; add consent checkbox",
            ),
        ],
        overall_assessment="High PII risk: direct name and email collection without consent.",
        blocks_distribution=True,
    )
    credit = make_credit("compliance")

    with patch("crystalos.agents.compliance.call_agent", new=AsyncMock(return_value=(high_risk_output, credit))):
        output, credits = await agent.run(pii_survey)

    assert output.risk_level == "high"
    assert output.blocks_distribution is True
    assert len(output.findings) == 2


async def test_compliance_enforces_blocks_distribution_invariant(agent, pii_survey):
    """If LLM returns risk=high but blocks_distribution=False, agent must correct it."""
    buggy_output = ComplianceOutput(
        risk_level="high",
        findings=[
            ComplianceFinding(
                question_id="q1",
                risk_type="pii_direct",
                description="Name collection",
                severity="high",
                suggestion="Remove name field",
            ),
        ],
        overall_assessment="High risk survey.",
        blocks_distribution=False,   # Bug: LLM forgot to set this
    )
    credit = make_credit("compliance")

    with patch("crystalos.agents.compliance.call_agent", new=AsyncMock(return_value=(buggy_output, credit))):
        output, _ = await agent.run(pii_survey)

    # The agent must enforce: risk=high → blocks_distribution=True
    assert output.blocks_distribution is True


async def test_compliance_pii_patterns_injected_into_prompt(agent, pii_survey):
    """Verify that the PII pattern scan results are passed to the LLM as context."""
    captured_calls: list = []
    clean_output = ComplianceOutput(
        risk_level="low", findings=[], overall_assessment="OK.", blocks_distribution=False
    )
    credit = make_credit("compliance")

    async def capture(agent_name, system, user, output_schema, current_tokens=0):
        captured_calls.append(user)
        return clean_output, credit

    with patch("crystalos.agents.compliance.call_agent", new=capture):
        await agent.run(pii_survey)

    assert captured_calls, "call_agent was not called"
    user_msg = captured_calls[0]
    # Pattern scan should be in the user message
    assert "AUTOMATED PATTERN SCAN RESULTS" in user_msg
    # Email and name PII should be detected
    assert "email" in user_msg.lower() or "name" in user_msg.lower()


async def test_compliance_manifest(agent):
    m = agent.manifest
    assert m.name == "compliance"
    assert m.enabled is True
    assert m.required_features == []   # no external deps
    assert "pii" in m.tags
