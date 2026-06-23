"""Compliance Agent.

Scans survey questions for data-protection and legal risks BEFORE distribution.

Two-phase approach (anti-hallucination by design):
  Phase 1 — Pattern scan (zero LLM, zero cost, instant):
    Regex-based detection of PII vocabulary in question text.
    Results are passed as ground-truth context to the LLM.

  Phase 2 — LLM contextual analysis:
    The model reviews the questions knowing what patterns were flagged.
    It distinguishes false positives (e.g. "How does our health plan compare?"
    is not asking for medical records) from genuine risks.
    It also catches nuanced risks the patterns miss (implicit data collection).

Risk levels:
  high   → Blocks distribute_now recommendation; requires legal review
  medium → Surfaces a warning; recommends disclosure language
  low    → Clean or minor concerns; safe to proceed

Checks:
  - PII direct: name, email, phone, address, SSN, DOB, financial account numbers
  - PII indirect: questions that could fingerprint respondents (rare job title + location)
  - Sensitive topics: health, religion, race, political affiliation, sexual orientation
    WITHOUT explicit purpose disclosure or consent collection
  - Legal risk: GDPR/CCPA exposure based on org_context.region
  - Industry-specific: HIPAA for healthcare, FINRA for financial services

Independently runnable via POST /agents/compliance/run.
"""
from __future__ import annotations

from crystalos.agents.base import AgentManifest, BaseAgent
from crystalos.lib.openrouter import call_agent
from crystalos.lib.validators import scan_pii_patterns, overall_pii_risk
from crystalos.schemas.output import ComplianceInput, ComplianceOutput

_SYSTEM = """\
You are a data-protection and legal-compliance auditor for enterprise surveys.
You did NOT write these questions. Your job is unbiased risk assessment.

You will be given:
1. Survey questions to review
2. An automated PII pattern scan that already ran — treat these as verified flags

REGULATORY CONTEXT:
  - US:     CCPA (California), sector-specific (HIPAA for healthcare, FINRA/SOX for finance)
  - EU:     GDPR — any PII requires lawful basis; sensitive categories need explicit consent
  - GLOBAL: Both US and EU rules apply; use stricter interpretation

RISK TYPES (use exact strings):
  pii_direct      — question explicitly asks for identifying data (name, email, phone, SSN, DOB)
  pii_indirect    — question combo could fingerprint respondents (rare job title + location + age)
  sensitive_topic — health, religion, race, political views, sexual orientation WITHOUT consent
  legal_risk      — GDPR/CCPA/HIPAA/FINRA exposure based on data type × region × industry
  industry_specific — sector rules (healthcare asking for conditions, finance asking for account numbers)

SEVERITY RULES:
  high   → Direct PII collection, explicit sensitive-category questions, clear regulatory violation
  medium → Implicit PII risk, sensitive topics without consent framing, regional grey areas
  low    → Minor concerns, best-practice improvements, optional disclosures

SCORING blocks_distribution = true if AND ONLY IF risk_level == "high"

IMPORTANT — AVOID FALSE POSITIVES:
  "How does your health insurance plan perform?" → LOW risk (business question, not medical data)
  "What is your date of birth?" → HIGH risk (direct PII)
  "How long have you worked in financial services?" → LOW risk (demographic, not account data)
  "What medications are you currently taking?" → HIGH risk (direct health PII)

RETURN FORMAT — ONLY valid JSON, no markdown:
{
  "risk_level": "low|medium|high",
  "findings": [
    {
      "question_id": "q2",
      "risk_type": "pii_direct|pii_indirect|sensitive_topic|legal_risk|industry_specific",
      "description": "Specific problem with this question",
      "severity": "high|medium|low",
      "suggestion": "Specific fix or required disclosure"
    }
  ],
  "overall_assessment": "One sentence executive summary of the compliance posture.",
  "blocks_distribution": true|false
}

If the survey is clean, return: {"risk_level": "low", "findings": [], "overall_assessment": "...", "blocks_distribution": false}
"""


class ComplianceAgent(BaseAgent):
    manifest = AgentManifest(
        name="compliance",
        version="1.0.0",
        description=(
            "Scans survey questions for PII risks and regulatory exposure. "
            "Two-phase: instant pattern scan + LLM contextual analysis. "
            "Covers GDPR/CCPA, HIPAA, FINRA, and sensitive-topic detection. "
            "High-risk findings block the distribute_now recommendation."
        ),
        input_schema=ComplianceInput,
        output_schema=ComplianceOutput,
        required_features=[],           # No external dependencies — replaces stub
        tags=["compliance", "pii", "gdpr", "ccpa", "hipaa", "copilot"],
        est_cost_usd=0.0003,
        enabled=True,
        phase="1",
    )

    async def run(
        self,
        input_data: ComplianceInput,
        current_tokens: int = 0,
    ) -> tuple[ComplianceOutput, list[dict]]:
        # ── Phase 1: Pattern scan (zero LLM cost) ──────────────────────────────
        q_dicts      = [q.model_dump() for q in input_data.questions]
        pii_findings = scan_pii_patterns(q_dicts)
        pattern_risk = overall_pii_risk(pii_findings)

        # Build a pattern-scan summary to ground the LLM
        if pii_findings:
            scan_summary = "AUTOMATED PATTERN SCAN RESULTS (verified — treat as facts):\n"
            for qid, types in pii_findings.items():
                scan_summary += f"  {qid}: detected PII types → {', '.join(types)}\n"
            scan_summary += f"Pattern-based risk estimate: {pattern_risk.upper()}\n"
        else:
            scan_summary = "AUTOMATED PATTERN SCAN RESULTS: No PII vocabulary detected in question text.\n"

        # ── Phase 2: LLM contextual analysis ──────────────────────────────────
        ctx = input_data.org_context
        region    = ctx.region or "US"
        industry  = ctx.industry or "general"
        audience  = ctx.target_audience or "unspecified"

        questions_text = "\n".join(
            f"  {q.id}: [{q.type.upper()}] {q.question}"
            + (f" | options: {', '.join((q.options or [])[:4])}" if q.options else "")
            for q in input_data.questions
        )

        user_msg = (
            f"Survey type: {input_data.survey_type_id or 'general'}\n"
            f"Regulatory region: {region}\n"
            f"Industry: {industry}\n"
            f"Target audience: {audience}\n\n"
            f"{scan_summary}\n"
            f"Questions to audit ({len(input_data.questions)} total):\n{questions_text}"
        )

        output, entry = await call_agent(
            agent_name="compliance",
            system=_SYSTEM,
            user=user_msg,
            output_schema=ComplianceOutput,
            current_tokens=current_tokens,
        )

        # ── Phase 3: Validate blocks_distribution consistency ──────────────────
        # Ensure blocks_distribution is True when risk is high (LLM sometimes misses this)
        if output.risk_level == "high" and not output.blocks_distribution:
            output = ComplianceOutput(
                risk_level=output.risk_level,
                findings=output.findings,
                overall_assessment=output.overall_assessment,
                blocks_distribution=True,  # enforce invariant
            )

        return output, [entry.to_dict()]


# Module-level singleton
compliance_agent = ComplianceAgent()
