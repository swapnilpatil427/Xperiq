"""Question Refiner Agent.

Takes a single survey question + plain-English user feedback and returns a
refined version of that specific question — without touching any others.

Design for zero hallucination:
  1. Type preservation: the LLM is forbidden from changing question type unless
     the user explicitly says "change to X" or "convert to Y".
  2. ID preservation: question ID is immutable.
  3. Minimal-change principle: the LLM is instructed to make ONLY the changes
     the user requested, and nothing else.
  4. Post-validation: validators.py verifies type and ID invariants after the
     LLM returns. If violated, the original question is returned unchanged
     and the error is surfaced in validation_errors.
  5. Scale consistency check: if the survey uses a consistent rating scale,
     the refined question must respect it.

Security:
  - user_feedback is a user-supplied string — sanitised before reaching this agent.
  - The surrounding survey_questions are passed as read-only context so the
    LLM can maintain consistency, but the LLM MUST NOT modify them.

Standalone — called via POST /agents/refiner/run. Not part of the main graph.
The frontend calls this when a user clicks "Edit" on a specific question.
"""
from __future__ import annotations

from agents.agents.base import AgentManifest, BaseAgent
from agents.lib.openrouter import call_agent
from agents.lib.validators import validate_refiner_output
from agents.schemas.output import RefinerInput, RefinerOutput
from agents.schemas.question import Question

_SYSTEM = """\
You are an expert survey question editor inside Experient Copilot.

You will receive:
1. ONE specific question to refine
2. User feedback explaining what to change
3. The surrounding questions in the same survey (READ-ONLY context)

MANDATORY RULES — violating any of these will break the survey:
1. PRESERVE the question ID exactly as given — IDs are immutable database keys.
2. PRESERVE the question type (e.g. multiple_choice, nps, rating) UNLESS the user
   explicitly says "change to [type]" or "convert to [type]" or "make it a [type]".
3. MINIMAL CHANGES — only change what the user asked for. Do not rewrite unrelated
   parts of the question.
4. PRESERVE options count — if the original has 4 options, keep 4 (unless user
   asks to add/remove options).
5. If the user asks to remove bias or leading language, rephrase neutrally while
   keeping the question's original intent.
6. Maintain the same scale (scaleMax, labelLow, labelHigh) as the original.
7. The refined question must NOT introduce new bias, ambiguity, or double-barreling.
8. Do NOT suggest changes to OTHER questions — only refine the one specified.

RETURN FORMAT — ONLY valid JSON, no markdown:
{
  "refined_question": {
    "id": "<same id as original>",
    "type": "<same type as original, unless user asked to change it>",
    "question": "<refined question text>",
    "required": <true|false>,
    <...other fields as needed...>
  },
  "explanation": "One sentence: what changed and why."
}
"""


class RefinerAgent(BaseAgent):
    manifest = AgentManifest(
        name="refiner",
        version="1.0.0",
        description=(
            "Refines a single survey question based on plain-English user feedback. "
            "Preserves question type, ID, and scale by default. "
            "Standalone endpoint — not part of the main orchestration graph."
        ),
        input_schema=RefinerInput,
        output_schema=RefinerOutput,
        required_features=[],
        tags=["survey", "editing", "refinement", "copilot"],
        est_cost_usd=0.0001,
        enabled=True,
        phase="1",
    )

    async def run(
        self,
        input_data: RefinerInput,
        current_tokens: int = 0,
    ) -> tuple[RefinerOutput, list[dict]]:
        original = input_data.question_to_refine

        # Build the survey context (read-only reference for the LLM)
        other_questions = [
            f"  {q.id}: [{q.type}] {q.question}"
            for q in input_data.survey_questions
            if q.id != original.id
        ]
        context_block = (
            "Surrounding questions (READ-ONLY — do NOT modify these):\n"
            + "\n".join(other_questions[:10])
            if other_questions
            else "This is the only question in the survey."
        )

        # Check existing rating scale for consistency
        rating_scales = {
            q.scaleMax for q in input_data.survey_questions
            if q.type == "rating" and q.scaleMax
        }
        scale_note = (
            f"\nSurvey uses a {list(rating_scales)[0]}-point rating scale — maintain this."
            if len(rating_scales) == 1
            else ""
        )

        user_msg = (
            f"QUESTION TO REFINE:\n"
            f"  id: {original.id}\n"
            f"  type: {original.type}\n"
            f"  question: {original.question}\n"
            + (f"  options: {', '.join((original.options or [])[:6])}\n" if original.options else "")
            + (f"  scaleMax: {original.scaleMax}, labelLow: {original.labelLow}, labelHigh: {original.labelHigh}\n"
               if original.scaleMax else "")
            + f"\nUSER FEEDBACK: {input_data.user_feedback}\n\n"
            + context_block
            + scale_note
        )

        output, entry = await call_agent(
            agent_name="refiner",
            system=_SYSTEM,
            user=user_msg,
            output_schema=RefinerOutput,
            current_tokens=current_tokens,
        )

        # ── Post-LLM validation (hallucination guard) ──────────────────────────
        original_dict = original.model_dump()
        refined_dict  = output.refined_question.model_dump()
        violations    = validate_refiner_output(original_dict, refined_dict, input_data.user_feedback)

        if violations:
            # Fail safe: return original question with error surfaced
            return RefinerOutput(
                refined_question=original,  # revert to original
                explanation=f"Refinement rejected — validation failed: {'; '.join(violations)}",
                type_was_preserved=original_dict.get("type") == refined_dict.get("type"),
                validation_errors=violations,
            ), [entry.to_dict()]

        type_preserved = original.type == output.refined_question.type
        return RefinerOutput(
            refined_question=output.refined_question,
            explanation=output.explanation,
            type_was_preserved=type_preserved,
            validation_errors=[],
        ), [entry.to_dict()]


# Module-level singleton
refiner_agent = RefinerAgent()
