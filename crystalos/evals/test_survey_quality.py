"""Golden-dataset evals for survey quality.

These tests make REAL LLM calls. They require OPENROUTER_API_KEY (dev)
or ANTHROPIC_API_KEY (prod) to be set.

Run with:
    AGENTS_ENV=dev pytest agents/evals/ -v -m eval

Skip in CI unless keys are present:
    pytest agents/evals/ -m "eval and not slow"

Each eval asserts properties of the LLM output that should hold
regardless of which model is used or how the prompt is phrased.
"""
import os

import pytest
import pytest_asyncio

from crystalos.agents import quality_control_agent, survey_creator_agent
from crystalos.schemas.output import CreatorInput, OrgContext, QCInput
from crystalos.schemas.question import Question

# Skip all evals if no API key is configured
pytestmark = pytest.mark.skipif(
    not (os.getenv("OPENROUTER_API_KEY") or os.getenv("ANTHROPIC_API_KEY")),
    reason="No LLM API key set — skipping real-call evals",
)


# ── Golden dataset ──────────────────────────────────────────────────────────────

BIASED_QUESTIONS = [
    Question(id="q1", type="multiple_choice", question="How much did you ENJOY our amazing product?",
             required=True, options=["A lot", "Very much", "Extremely", "Beyond words"]),
    Question(id="q2", type="multiple_choice", question="Why was our onboarding so smooth?",
             required=True, options=["Great team", "Clear docs", "Both", "All of the above"]),
    Question(id="q3", type="multiple_choice",
             question="Since you use our product daily, how productive have you become?",
             required=True, options=["Very", "Extremely", "Super", "Incredibly"]),
    Question(id="q4", type="open_text", question="What else?", required=False),
]

CLEAN_INTENT = "Measure customer satisfaction after our product's 3-month onboarding for enterprise B2B customers in the financial services industry"

CLEAN_ORG_CONTEXT = OrgContext(
    industry="financial_services",
    size="201-1000",
    use_case="cx",
    target_audience="enterprise B2B customers",
    prior_survey_count=5,
)


# ── Evals ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_qc_flags_biased_survey_score_below_7():
    """QC agent must score a heavily biased survey below 7.0."""
    qc_input = QCInput(questions=BIASED_QUESTIONS, survey_type_id="cx")
    output, _ = await quality_control_agent.run(qc_input)

    assert output.score < 7.0, (
        f"Expected score < 7.0 for biased survey, got {output.score}. "
        f"Issues: {[i.message for i in output.issues]}"
    )
    bias_issues = [i for i in output.issues if i.type == "bias"]
    assert len(bias_issues) >= 2, (
        f"Expected >= 2 bias issues, got {len(bias_issues)}: {[i.message for i in output.issues]}"
    )


@pytest.mark.asyncio
async def test_creator_generates_valid_question_count():
    """Creator must produce 5-12 questions for a normal intent."""
    creator_input = CreatorInput(
        intent=CLEAN_INTENT,
        survey_type_id="cx",
        org_context=CLEAN_ORG_CONTEXT,
    )
    output, _ = await survey_creator_agent.run(creator_input)

    assert 5 <= len(output.questions) <= 12, (
        f"Expected 5-12 questions, got {len(output.questions)}"
    )


@pytest.mark.asyncio
async def test_creator_cx_survey_has_nps_or_csat():
    """Creator must include at least one NPS or CSAT question for CX surveys."""
    creator_input = CreatorInput(
        intent=CLEAN_INTENT,
        survey_type_id="cx",
        org_context=CLEAN_ORG_CONTEXT,
    )
    output, _ = await survey_creator_agent.run(creator_input)

    types = [q.type for q in output.questions]
    assert "nps" in types or "csat" in types, (
        f"CX survey must have NPS or CSAT. Got question types: {types}"
    )


@pytest.mark.asyncio
async def test_creator_ends_with_open_text():
    """Creator must end with an open_text question."""
    creator_input = CreatorInput(
        intent=CLEAN_INTENT,
        survey_type_id="cx",
        org_context=CLEAN_ORG_CONTEXT,
    )
    output, _ = await survey_creator_agent.run(creator_input)

    last_type = output.questions[-1].type
    assert last_type == "open_text", (
        f"Last question must be open_text, got '{last_type}'"
    )


@pytest.mark.asyncio
async def test_creator_clean_survey_passes_qc():
    """End-to-end: creator output on a clean intent should score >= 7.0 from QC."""
    creator_input = CreatorInput(
        intent=CLEAN_INTENT,
        survey_type_id="cx",
        org_context=CLEAN_ORG_CONTEXT,
    )
    creator_output, _ = await survey_creator_agent.run(creator_input)

    qc_input = QCInput(
        questions=creator_output.questions,
        survey_type_id="cx",
        org_context=CLEAN_ORG_CONTEXT,
    )
    qc_output, _ = await quality_control_agent.run(qc_input)

    assert qc_output.score >= 7.0, (
        f"Clean intent should produce a QC score >= 7.0, got {qc_output.score}. "
        f"Issues: {[i.model_dump() for i in qc_output.issues]}"
    )
