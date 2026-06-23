"""Quality Control Agent.

Independent reviewer of survey drafts. Uses a DIFFERENT LLM vendor than
the Creator (in prod) to avoid self-confirmation bias — a model reviewing
its own vendor's output tends to rate it more favourably.

Checks:
  - BIAS: leading, loaded, assumption-laden language
  - CLARITY: double-barreled, ambiguous, jargon-heavy questions
  - STRUCTURE: scale consistency, missing required question types
  - COMPLETENESS: open-text coverage, actionability

Score: 10.0 baseline, deductions per issue severity.
  high   → -2.0
  medium → -1.0
  low    → -0.5

Score ≥ 7.0 → proceed to approval
Score < 7.0 AND revision_count < 2 → send back to Creator with issues
Score < 7.0 AND revision_count ≥ 2 → proceed anyway, surface issues to user

Anti-hallucination guards (post-LLM):
  - Score inflation detection: if LLM returns score=9.0 with 3 high issues,
    the math says max score is 4.0. validators.clamp_qc_score() corrects this.
  - Issue question_id validity: all flagged question IDs must exist in the input.
    Invalid references are silently dropped and logged.

Independently runnable via POST /agents/qc/run.
"""
from __future__ import annotations

from crystalos.agents.base import AgentManifest, BaseAgent
from crystalos.lib.logger import logger
from crystalos.lib.openrouter import call_agent
from crystalos.lib.validators import clamp_qc_score
from crystalos.schemas.output import QCInput, QCIssue, QCOutput, QCValidationOutput

_SYSTEM = """\
You are an independent survey quality auditor. You did NOT write these questions.
Your job is rigorous, impartial review.

Evaluate each question for:

1. BIAS (severity: high)
   - Leading questions ("How much did you ENJOY our service?")
   - Loaded questions ("Why was our onboarding so smooth?")
   - Assumption-embedded questions ("Since you use our product daily, how…?")

2. CLARITY (severity: medium)
   - Double-barreled: asking two things at once ("Was our product fast AND easy?")
   - Ambiguous timeframe ("How often do you use it?")
   - Jargon without definition ("How was your NPS journey?")

3. STRUCTURE (severity: medium)
   - Scale inconsistency across questions (1-5 in Q1, 1-10 in Q3)
   - Missing required types: CX surveys MUST have NPS or CSAT
   - Too few questions (< 5) or too many (> 12)

4. COMPLETENESS (severity: low)
   - No open-text question at the end
   - All questions closed with no qualitative depth
   - Missing audience segment capture (when relevant)

SCORING RULES (critical — follow EXACTLY):
- Start at 10.0
- Deduct 2.0 for each HIGH severity issue
- Deduct 1.0 for each MEDIUM severity issue
- Deduct 0.5 for each LOW severity issue
- Floor at 0.0
- Your score MUST be mathematically consistent with your issues.
  Example: 1 HIGH + 2 MEDIUM → deduct 2.0 + 2.0 = 4.0 → score = 6.0 (max).
  DO NOT return score=8.0 if your issues mathematically require score ≤ 6.0.

RETURN FORMAT — ONLY valid JSON, no markdown:
{
  "score": <float 0.0-10.0>,
  "issues": [
    {
      "question_id": "q2",
      "type": "bias|clarity|structure|completeness",
      "message": "Specific problem description",
      "severity": "high|medium|low",
      "suggestion": "Specific fix recommendation"
    }
  ],
  "overall_feedback": "One sentence summary of the survey's quality."
}

If the survey has NO issues, return: {"score": 10.0, "issues": [], "overall_feedback": "..."}
"""


_VALIDATOR_SYSTEM = """\
You are reviewing another AI model's quality assessment of a survey.
You will see: the original questions, a QC score (0-10), and a list of issues found.

Your ONLY job is to verify:
1. Are the identified issues real and accurately described? (watch for false positives)
2. Is the score plausible given the issues listed? (watch for lenient/harsh scoring)

Be brief and specific. If you agree, return empty concerns.

RETURN FORMAT — ONLY valid JSON, no markdown:
{
  "agrees_with_score": true,
  "concerns": [],
  "suggested_score": null
}

Or if you disagree:
{
  "agrees_with_score": false,
  "concerns": ["Specific concern about issue X", "Score seems too generous given Y"],
  "suggested_score": 6.5
}
"""


class QualityControlAgent(BaseAgent):
    manifest = AgentManifest(
        name="qc",
        version="1.2.0",
        description=(
            "Independent quality review of survey drafts. Checks for bias, "
            "clarity issues, structural problems, and completeness. "
            "Uses a cross-vendor model to avoid self-confirmation bias. "
            "Post-LLM score-inflation guard corrects mathematically inconsistent scores. "
            "Haiku cross-validation pass catches false positives and miscalibrated severity."
        ),
        input_schema=QCInput,
        output_schema=QCOutput,
        tags=["survey", "quality", "bias-detection", "copilot"],
        est_cost_usd=0.0005,
        enabled=True,
        phase="1",
    )

    async def run(
        self,
        input_data: QCInput,
        current_tokens: int = 0,
    ) -> tuple[QCOutput, list[dict]]:
        valid_ids = {q.id for q in input_data.questions}

        questions_json = "\n".join(
            f"Q{q.id}: [{q.type.upper()}] {q.question}"
            + (
                f" (options: {', '.join(q.options[:4])}{'...' if len(q.options or []) > 4 else ''})"
                if q.options
                else ""
            )
            for q in input_data.questions
        )

        user_msg = (
            f"Survey type: {input_data.survey_type_id or 'general'}\n"
            f"Questions to review ({len(input_data.questions)} total):\n\n{questions_json}"
        )

        raw_output, entry = await call_agent(
            agent_name="qc",
            system=_SYSTEM,
            user=user_msg,
            output_schema=QCOutput,
            current_tokens=current_tokens,
        )

        # ── Anti-hallucination guard 1: drop issues referencing non-existent questions ──
        valid_issues: list[QCIssue] = []
        dropped_ids: list[str] = []
        for issue in raw_output.issues:
            if issue.question_id in valid_ids or issue.question_id == "general":
                valid_issues.append(issue)
            else:
                dropped_ids.append(issue.question_id)

        if dropped_ids:
            logger.warning(
                "qc_invalid_question_ids_dropped",
                dropped=dropped_ids,
                valid_ids=sorted(valid_ids),
            )

        # ── Anti-hallucination guard 2: clamp score to be consistent with issues ──
        clamped_score, was_adjusted = clamp_qc_score(raw_output.score, valid_issues)

        if was_adjusted:
            logger.info(
                "qc_score_clamped",
                original_score=raw_output.score,
                clamped_score=clamped_score,
                issue_count=len(valid_issues),
            )

        validation_errors: list[str] = []
        if was_adjusted:
            validation_errors.append(
                f"Score adjusted from {raw_output.score:.1f} to {clamped_score:.1f} "
                "to match issue severity math."
            )
        if dropped_ids:
            validation_errors.append(
                f"Dropped {len(dropped_ids)} issue(s) referencing non-existent questions: {dropped_ids}"
            )

        final_output = QCOutput(
            score=clamped_score,
            issues=valid_issues,
            overall_feedback=raw_output.overall_feedback,
            score_was_adjusted=was_adjusted,
            validation_errors=validation_errors,
        )

        # ── Haiku cross-validation: check if Gemini's assessment is plausible ──────
        try:
            questions_summary = "\n".join(
                f"  {q.id}: [{q.type}] {q.question}" for q in input_data.questions
            )
            issues_summary = "\n".join(
                f"  [{i.severity.upper()}] {i.question_id}: {i.message}" for i in final_output.issues
            ) or "  (no issues found)"
            validator_user = (
                f"QC Score: {final_output.score:.1f}/10\n\n"
                f"Issues found:\n{issues_summary}\n\n"
                f"Questions reviewed:\n{questions_summary}"
            )
            val_output, val_entry = await call_agent(
                agent_name="qc_validator",
                system=_VALIDATOR_SYSTEM,
                user=validator_user,
                output_schema=QCValidationOutput,
                current_tokens=current_tokens,
            )
            haiku_concerns: list[str] = []
            if not val_output.agrees_with_score and val_output.concerns:
                haiku_concerns = [f"[Haiku validator] {c}" for c in val_output.concerns]
            if val_output.suggested_score is not None and not val_output.agrees_with_score:
                haiku_concerns.append(
                    f"[Haiku validator] Suggested score: {val_output.suggested_score:.1f}"
                )
            if haiku_concerns:
                logger.info("qc_validator_disagrees", concerns=haiku_concerns, original_score=final_output.score)

            # If Haiku suggests a stricter score AND math clamping didn't already catch it,
            # apply the stricter of the two
            final_score = final_output.score
            if (val_output.suggested_score is not None
                    and val_output.suggested_score < final_output.score
                    and not final_output.score_was_adjusted):
                final_score = val_output.suggested_score
                haiku_concerns.append(
                    f"Score adjusted {final_output.score:.1f}→{final_score:.1f} by Haiku cross-validator"
                )
                logger.info("qc_validator_score_adjusted",
                            from_score=final_output.score, to_score=final_score)

            final_output = QCOutput(
                score=final_score,
                issues=final_output.issues,
                overall_feedback=final_output.overall_feedback,
                score_was_adjusted=final_output.score_was_adjusted or (final_score != final_output.score),
                validation_errors=final_output.validation_errors + haiku_concerns,
            )
            return final_output, [entry.to_dict(), val_entry.to_dict()]

        except Exception as e:
            # Haiku validation is non-fatal — return the Gemini result unchanged
            logger.warning("qc_validator_failed", error=str(e))
            return final_output, [entry.to_dict()]


# Module-level singleton
quality_control_agent = QualityControlAgent()
