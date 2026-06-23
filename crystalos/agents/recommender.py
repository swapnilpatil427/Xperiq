"""Recommendation Agent — Survey Lifecycle Coach.

The smartest agent in the Copilot framework. It doesn't just look at the
current survey; it understands the full survey lifecycle and the org's
history to recommend the highest-impact next action.

Context inputs (in priority order):
  1. QC score + issues (how good is the survey right now?)
  2. Compliance risk (is it safe to distribute?)
  3. Revision history (how many loops did it take to get here?)
  4. Session actions (what has the user already done this session?)
  5. Org survey history (is this their first survey? same type as before?)
  6. Org context (industry, size, use case)
  7. Survey content (specific questions — what's in it?)

Anti-hallucination design:
  - Action IDs are validated against VALID_RECOMMENDATION_ACTIONS in schemas/output.py
  - Business rules are encoded in BOTH the system prompt AND enforced in post-processing
  - Confidence score per recommendation surfaces LLM uncertainty
  - Session actions prevent recommending things the user already did

Lifecycle stages:
  drafting        — Survey has no QC run yet (shouldn't reach here)
  post_creation   — Just created, QC has run (normal entry point)
  ready_to_dist   — QC ≥ 8.0, compliance low/medium, no blockers
  revision_needed — Needs more edits before distributing
  expert_review   — Quality or compliance issues require human expert

Independently runnable via POST /agents/recommender/run.
"""
from __future__ import annotations

from crystalos.agents.base import AgentManifest, BaseAgent
from crystalos.lib.openrouter import call_agent
from crystalos.schemas.output import (
    VALID_RECOMMENDATION_ACTIONS,
    Recommendation,
    RecommenderInput,
    RecommenderOutput,
)

_SYSTEM = """\
You are a senior survey strategist and lifecycle coach for Experient Copilot.
Your job is to recommend the user's best 2–3 next actions — ordered by impact.

You see the full picture: survey quality, compliance status, org history,
and what actions have already been taken this session.

═══════════════════════════════════════════════════════════════
ACTION CATALOGUE (use ONLY these exact action IDs):

  [EDITING — improve the survey]
  add_skip_logic         — Add conditional branching based on responses
  add_followup_question  — Add a targeted follow-up on a specific topic
  refine_question        — Improve wording of a specific question
  review_in_builder      — Open the visual builder for manual editing
  add_piping_logic       — Pipe previous answers into later questions

  [QUALITY — before distributing]
  run_pilot              — Test with 5–10 internal respondents first
  request_expert_review  — Flag for a human survey expert to review
  check_compliance       — Run a compliance/PII scan

  [DISTRIBUTION — only when safe]
  distribute_now         — Send the survey immediately
  schedule_send          — Plan a scheduled send to the audience
  set_response_quota     — Cap responses to avoid over-surveying fatigue

  [ANALYSIS — compare and improve]
  compare_template       — Compare against a similar survey template
  compare_previous_survey — Compare with the org's most recent similar survey

  [LIFECYCLE — manage the survey]
  save_as_template       — Save as a reusable template for this org
  set_expiry_date        — Set an automatic close date

═══════════════════════════════════════════════════════════════
MANDATORY BUSINESS RULES (check all before recommending):

Rule 1 — DISTRIBUTION GATE: NEVER recommend distribute_now or schedule_send if:
  - qc_score < 8.0, OR
  - compliance_risk = "high"
  Violation of this rule risks regulatory and reputational damage.

Rule 2 — PILOT GATE: ALWAYS recommend run_pilot if qc_score < 8.0.
  Exception: if run_pilot is already in session_actions (user already did it).

Rule 3 — EXPERT REVIEW: ALWAYS recommend request_expert_review if:
  - revision_count >= 2 AND qc_score < 7.5
  This means the AI couldn't fix it automatically — a human should look.

Rule 4 — COMPLIANCE AWARENESS:
  - If compliance_risk is null/unknown: recommend check_compliance (user should run it)
  - If compliance_risk = "high": recommend request_expert_review before anything else
  - If compliance_risk = "medium": add a note in the reason about reviewing findings

Rule 5 — HISTORY AWARENESS:
  - If prior_survey_count = 0 (first survey): always include compare_template
  - If org has >= 3 surveys of the same type: recommend compare_previous_survey
  - If the org has sent similar surveys before: recommend set_response_quota to avoid fatigue

Rule 6 — SESSION DEDUP: NEVER recommend an action that appears in session_actions.
  The user already took that action — recommending it again is noise.

Rule 7 — AUDIENCE FIT: If survey is CX type and target_audience is "enterprise":
  - Consider recommending add_skip_logic (B2B surveys benefit from role-based branching)

═══════════════════════════════════════════════════════════════
RANKING: Order recommendations by: COMPLIANCE SAFETY first, then QUALITY, then DISTRIBUTION.

CONFIDENCE scoring:
  0.9–1.0 — Rule-based certainty (e.g. must run pilot because qc_score < 8.0)
  0.7–0.89 — Strong signal from context
  0.5–0.69 — Good suggestion, less certain

RETURN FORMAT — ONLY valid JSON, no markdown:
{
  "lifecycle_stage": "post_creation|ready_to_dist|revision_needed|expert_review",
  "recommendations": [
    {
      "action": "<exact action_id from catalogue>",
      "label": "<short label, max 50 chars>",
      "reason": "<specific sentence explaining WHY for THIS survey, max 200 chars>",
      "priority": "high|medium|low",
      "cta": "<button label, max 30 chars>",
      "confidence": <float 0.0-1.0>
    }
  ]
}
"""


def _build_context_block(input_data: RecommenderInput) -> str:
    """Build the rich context message for the recommender."""
    ctx = input_data.org_context
    lines: list[str] = []

    lines.append(f"SURVEY INTENT: {input_data.intent}")
    lines.append(f"Survey type: {input_data.survey_type_id or 'general'}")
    lines.append(f"QC score: {input_data.qc_score:.1f}/10")
    lines.append(f"Revision loops needed: {input_data.revision_count}")
    lines.append(f"Total questions: {len(input_data.questions)}")

    # Question type summary
    type_counts: dict[str, int] = {}
    for q in input_data.questions[:10]:
        type_counts[q.type] = type_counts.get(q.type, 0) + 1
    lines.append(f"Question types: {', '.join(f'{k}×{v}' for k, v in type_counts.items())}")

    # Org context
    lines.append(f"\nORG CONTEXT:")
    lines.append(f"  Industry: {ctx.industry or 'unspecified'}")
    lines.append(f"  Size: {ctx.size or 'unknown'} employees")
    lines.append(f"  Use case: {ctx.use_case or 'general'}")
    lines.append(f"  Target audience: {ctx.target_audience or 'unspecified'}")
    lines.append(f"  Region: {ctx.region}")
    lines.append(f"  Prior surveys created: {ctx.prior_survey_count}")

    # Compliance status
    if input_data.compliance_risk_level is not None:
        risk = input_data.compliance_risk_level
        count = input_data.compliance_findings_count
        lines.append(f"\nCOMPLIANCE STATUS: {risk.upper()} ({count} findings)")
    else:
        lines.append("\nCOMPLIANCE STATUS: Not yet run (unknown)")

    # Audience score
    if input_data.audience_score is not None:
        lines.append(f"AUDIENCE FIT SCORE: {input_data.audience_score:.1f}/10")

    # Survey history
    if input_data.survey_history:
        lines.append(f"\nORG SURVEY HISTORY (most recent first):")
        same_type = [h for h in input_data.survey_history
                     if h.survey_type_id == input_data.survey_type_id]
        for h in input_data.survey_history[:3]:
            tag = " ← same type" if h.survey_type_id == input_data.survey_type_id else ""
            lines.append(
                f"  {h.days_ago}d ago: {h.survey_type_id or 'general'} | "
                f"{h.question_count}q | QC={h.qc_score:.1f if h.qc_score else 'n/a'}{tag}"
            )
        if len(same_type) >= 3:
            lines.append(f"  → {len(same_type)} prior surveys of type '{input_data.survey_type_id}'")

    # Session actions already taken
    if input_data.session_actions:
        lines.append("\nACTIONS ALREADY TAKEN THIS SESSION (DO NOT recommend these again):")
        for a in input_data.session_actions:
            lines.append(f"  - {a.action}" + (f": {a.context}" if a.context else ""))
    else:
        lines.append("\nACTIONS ALREADY TAKEN: None — this is the first recommendation.")

    return "\n".join(lines)


class RecommenderAgent(BaseAgent):
    manifest = AgentManifest(
        name="recommender",
        version="2.0.0",
        description=(
            "Survey Lifecycle Coach — the smartest Copilot agent. "
            "Context-aware: integrates QC score, compliance risk, org history, "
            "and session actions to recommend the highest-impact next steps. "
            "As Copilot expands, new lifecycle stages and actions are added to the catalogue."
        ),
        input_schema=RecommenderInput,
        output_schema=RecommenderOutput,
        tags=["survey", "recommendations", "lifecycle", "next-steps", "copilot"],
        est_cost_usd=0.0004,
        enabled=True,
        phase="1",
    )

    async def run(
        self,
        input_data: RecommenderInput,
        current_tokens: int = 0,
    ) -> tuple[RecommenderOutput, list[dict]]:
        user_msg = _build_context_block(input_data)

        output, entry = await call_agent(
            agent_name="recommender",
            system=_SYSTEM,
            user=user_msg,
            output_schema=RecommenderOutput,
            current_tokens=current_tokens,
        )

        # ── Post-processing: enforce invariants the LLM might violate ────────────

        already_done = {a.action for a in input_data.session_actions}
        filtered: list[Recommendation] = []

        for rec in output.recommendations:
            # 1. Action must be in the catalogue
            if rec.action not in VALID_RECOMMENDATION_ACTIONS:
                continue

            # 2. Never recommend what's already done
            if rec.action in already_done:
                continue

            # 3. Distribution gate: never allow distribute/schedule on low QC or high compliance risk
            if rec.action in ("distribute_now", "schedule_send"):
                if input_data.qc_score < 8.0:
                    continue
                if input_data.compliance_risk_level == "high":
                    continue

            filtered.append(rec)

        # 4. Inject run_pilot if QC < 8.0 and not already in session/output
        if input_data.qc_score < 8.0:
            pilot_in_output   = any(r.action == "run_pilot" for r in filtered)
            pilot_already_done = "run_pilot" in already_done
            if not pilot_in_output and not pilot_already_done:
                filtered.insert(0, Recommendation(
                    action="run_pilot",
                    label="Run a pilot test",
                    reason=(
                        f"QC score {input_data.qc_score:.1f}/10 — validate with "
                        "5–10 internal respondents before wider distribution."
                    ),
                    priority="high",
                    cta="Start Pilot",
                    confidence=1.0,   # Rule-based certainty
                ))

        # 5. Inject expert_review if too many revisions and still low quality
        if input_data.revision_count >= 2 and input_data.qc_score < 7.5:
            expert_in_output = any(r.action == "request_expert_review" for r in filtered)
            if not expert_in_output:
                filtered.insert(0, Recommendation(
                    action="request_expert_review",
                    label="Request expert review",
                    reason=(
                        f"AI revised this survey {input_data.revision_count} times but "
                        f"QC is still {input_data.qc_score:.1f}/10 — a human expert can resolve this."
                    ),
                    priority="high",
                    cta="Get Expert Review",
                    confidence=1.0,
                ))

        # Cap at 3
        filtered = filtered[:3]

        # Guarantee at least 1 recommendation
        if not filtered:
            filtered = [Recommendation(
                action="review_in_builder",
                label="Review in builder",
                reason="Open the visual survey builder to review and edit questions manually.",
                priority="medium",
                cta="Open Builder",
                confidence=0.7,
            )]

        return RecommenderOutput(
            recommendations=filtered,
            lifecycle_stage=output.lifecycle_stage,
        ), [entry.to_dict()]


# Module-level singleton
recommender_agent = RecommenderAgent()
