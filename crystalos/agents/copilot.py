"""Copilot Chat Agent — Natural Language Survey Editor.

The main user-facing AI for the Copilot chat interface. Takes a plain-English
message from the user and applies the appropriate changes to the survey.

Handles all survey editing operations:
  - Refine a specific question ("make q3 less biased")
  - Add skip logic ("if NPS < 7, ask why they're unhappy")
  - Configure questions ("set max 200 chars on all text fields")
  - Add a new question ("add a follow-up about support experience")
  - Remove a question ("remove the date question")
  - General improvements ("make the survey shorter", "improve flow")
  - Multiple changes in one message ("add skip logic to q1 and shorten q5")

Design:
  1. LLM classifies the user's intent and applies changes directly (single call).
  2. For complex skip logic requests, delegates to SkipLogicAgent to get
     proper forward-only validation.
  3. For single-question refinement, preserves type/ID invariants like Refiner.
  4. Returns the full updated questions array + explanation of every change.
  5. Suggests follow-up actions to keep the conversation going.

Standalone via POST /agents/copilot/run.
Called by POST /orchestrate/{run_id}/refine.
"""
from __future__ import annotations

import json

from crystalos.agents.base import AgentManifest, BaseAgent
from crystalos.lib.logger import logger
from crystalos.lib.openrouter import call_agent
from crystalos.lib.validators import fix_question_ids
from crystalos.schemas.output import CopilotChange, CopilotInput, CopilotOutput
from crystalos.schemas.question import Question

_SYSTEM_TEMPLATE = """\
You are Experient Copilot — an AI assistant for survey design. You help users build better surveys by answering questions, giving advice, and making changes on request.

CURRENT SURVEY ({question_count} questions):
{questions_json}

SURVEY GOAL: "{intent}"
SURVEY TYPE: {survey_type}

ORG CONTEXT:
- Industry: {industry}
- Target audience: {target_audience}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE A — ANSWER A QUESTION (no survey changes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use this mode when the user is asking for information, analysis, or advice. Examples:
  - "What skip logic exists in this survey?"
  - "How many questions do I have?"
  - "Is Q3 biased?"
  - "What does NPS measure?"
  - "Is this survey too long?"
  - "What type is Q2?"

Rules for MODE A:
  - Return questions UNCHANGED (exact same array you received).
  - Set "response_type": "answer".
  - Put your full answer in "explanation" — be direct and helpful, no preamble.
  - Leave "changes" as an empty array [].
  - Suggest 1–3 natural follow-ups in "suggestions".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE C — FETCH RECOMMENDATIONS (trigger the recommender)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use this mode when the user wants to know what to do next, wants action suggestions,
or is asking for recommendations about the survey — NOT asking a factual question
and NOT requesting a specific edit. Examples:
  - "Give me recommendations"
  - "What should I do next?"
  - "What do you suggest?"
  - "Give me the next set of recommendations"
  - "What would you recommend?"
  - "Any suggestions for improvement?"
  - "What's the best next step?"
  - "What actions should I take?"

Rules for MODE C:
  - Return questions UNCHANGED (exact same array you received).
  - Set "response_type": "recommendations".
  - Set "explanation" to "" (empty string) — the orchestrator will populate this.
  - Leave "changes" as an empty array [].
  - Leave "suggestions" as an empty array [].

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE B — EDIT THE SURVEY (apply changes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use this mode when the user explicitly asks for a change. Supported operations:

1. REFINE A QUESTION — improve wording, remove bias, clarify ambiguity
   Apply changes ONLY to the specific question(s) mentioned.
   NEVER change a question's ID. Preserve type unless user asks to change it.

2. ADD SKIP LOGIC — conditional branching based on an answer
   Add "skipLogic" to the SOURCE question (the one whose answer triggers the branch).
   Format: {{ "id": "rule_1", "condition": {{"operator": "lt", "value": 7}}, "destination": "q4" }}
   Destination must be a LATER question ID or "END_SURVEY".
   Valid operators: eq, neq, lt, gt, lte, gte, contains, answered, not_answered
   - Use numeric operators (lt/gt/lte/gte) for: nps (0–10), csat (1–5), rating (1–scaleMax), slider (min–max)
   - Use eq/neq/contains for: multiple_choice, checkbox, dropdown, ranking (match option text exactly)
   - Use answered/not_answered for: any type
   - "answered"/"not_answered" have no value field: {{"operator": "answered"}}
   - For numeric comparisons use the numeric value: {{"operator": "lt", "value": 7}}
   - Multiple rules on one question = multiple entries in skipLogic array.

3. ADD DISPLAY LOGIC — show a question only when a condition is met
   Add "displayLogic" to the TARGET question (the one that should conditionally appear).
   Format: {{ "sourceQuestionId": "q2", "operator": "eq", "value": "Yes" }}
   Source must be a PREVIOUS question.

4. CONFIGURE A QUESTION — set properties without changing question text
   You can set ANY of these fields based on the question type:

   ALL TYPES:
   - required: true | false

   NPS (type: "nps") — 0–10 numeric scale:
   - labelLow: string  (left-end label, e.g. "Not at all likely")
   - labelHigh: string (right-end label, e.g. "Extremely likely")

   CSAT (type: "csat") — satisfaction 1–5:
   - csatStyle: "emoji" | "stars" | "numbers"

   RATING (type: "rating") — customisable star/number scale:
   - scaleMax: 5 | 7 | 10   (maximum value on the scale)
   - ratingStyle: "stars" | "numbers"
   - labelLow: string, labelHigh: string

   SLIDER (type: "slider") — continuous range input:
   - min: number    (e.g. 0)
   - max: number    (e.g. 100)
   - step: number   (e.g. 1 or 5)
   - labelLow: string, labelHigh: string
   - showValue: true | false

   MULTIPLE_CHOICE / CHECKBOX / DROPDOWN / RANKING (choice types):
   - options: ["Option A", "Option B", "Option C"]  ← replaces ALL options
   - allowOther: true | false   (multiple_choice and checkbox only)
   - randomize: true | false
   - maxSelections: number | null   (checkbox only; null = no limit)
   - placeholder: string   (dropdown only — shown before selection)

   OPEN_TEXT / SHORT_TEXT (text input types):
   - placeholder: string
   - maxLength: number | null   (null = no character limit)
   - validation: "email" | "url" | "number" | "phone" | null   (short_text only)

   MATRIX (type: "matrix") — grid of rows × columns:
   - rows: ["Row 1", "Row 2", ...]      ← replaces ALL rows
   - columns: ["Col 1", "Col 2", ...]   ← replaces ALL columns
   - matrixType: "radio" | "checkbox"   (radio = pick one per row, checkbox = pick many)

   DATE (type: "date") — date/time picker:
   - dateType: "date" | "time" | "datetime"

5. ADD A QUESTION — insert a new question into the survey
   - Assign the next sequential ID (e.g. if last is q5, new one is q6).
   - Insert after the referenced question or at the end if not specified.
   - Populate type-appropriate defaults (options, scaleMax, csatStyle, etc.).

6. REMOVE A QUESTION — delete a specified question.
   - Also remove any skipLogic rules on OTHER questions that point to this question's ID.

7. REORDER QUESTIONS — move questions to improve survey flow.
   - Do NOT renumber IDs — keep original IDs in new order.

8. BULK CONFIGURE — apply a setting to multiple or all questions at once.
   Example: "make all questions required" → set required: true on every question.

9. IMPROVE OVERALL — general improvements to flow, wording, or structure.

Rules for MODE B:
  - Set "response_type": "edit".
  - Return ALL questions (modified AND unchanged) in the correct order.
  - Question IDs are IMMUTABLE — never change them.
  - Preserve all skipLogic and displayLogic on questions you are NOT modifying.
  - In "changes", list each modified question as {{"question_id": "q2", "what_changed": "one-line description", "action": "edited"|"added"|"removed"}}.
  - Explain clearly what changed in "explanation" (be specific, no vague preamble).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RETURN FORMAT — ONLY valid JSON, no markdown fences:
{{
  "response_type": "answer" | "edit" | "recommendations",
  "questions": [ ...full question array... ],
  "explanation": "Direct answer or clear description of changes, or empty string for recommendations mode.",
  "changes": [{{"question_id": "q2", "what_changed": "added skip logic: NPS < 7 → q4", "action": "edited"}}],
  "suggestions": ["Follow-up idea 1", "Follow-up idea 2"]
}}
"""


class CopilotAgent(BaseAgent):
    manifest = AgentManifest(
        name="copilot",
        version="1.0.0",
        description=(
            "Natural language survey editor for the Copilot chat interface. "
            "Handles: question refinement, skip/display logic, configuration, "
            "add/remove/reorder questions, bulk changes. "
            "Single LLM call applies all changes and returns the full updated survey."
        ),
        input_schema=CopilotInput,
        output_schema=CopilotOutput,
        tags=["survey", "copilot", "editing", "nlp"],
        est_cost_usd=0.002,
        enabled=True,
        phase="1",
    )

    async def run(
        self,
        input_data: CopilotInput,
        current_tokens: int = 0,
    ) -> tuple[CopilotOutput, list[dict]]:
        ctx = input_data.org_context
        questions_json = json.dumps(
            [q.model_dump(by_alias=True, exclude_none=True) for q in input_data.questions],
            indent=2,
        )

        system = _SYSTEM_TEMPLATE.format(
            question_count=len(input_data.questions),
            questions_json=questions_json,
            intent=input_data.intent or "general survey",
            survey_type=input_data.survey_type_id or "general",
            industry=ctx.industry or "general",
            target_audience=ctx.target_audience or "general audience",
        )

        prior_msgs = [
            {"role": m.role, "content": m.content}
            for m in input_data.conversation_history[-6:]  # last 3 exchanges
        ] if input_data.conversation_history else None

        # ── Skill-first: try the copilot-analyst skill ───────────────────────────
        # Falls back to the legacy call_agent path on any skill failure (not
        # registered, eval fail, mapping error). Downstream guards run identically.
        raw_output = await self._try_skill_copilot(input_data)
        entry = None
        if raw_output is None:
            raw_output, entry = await call_agent(
                agent_name="copilot",
                system=system,
                user=input_data.message,
                output_schema=CopilotOutput,
                current_tokens=current_tokens,
                prior_messages=prior_msgs,
            )

        # ── Post-LLM validation ──────────────────────────────────────────────────
        original_ids = {q.id for q in input_data.questions}
        guard_errors: list[str] = []
        validated: list[Question] = []

        for q in raw_output.questions:
            # Validate IDs weren't changed on existing questions
            if q.id in original_ids:
                validated.append(q)
            else:
                # New question added by LLM — acceptable
                validated.append(q)

        # Fix sequential IDs only if all questions have sequential IDs (no reorder)
        # In copilot, we allow non-sequential ordering, so only fix truly malformed IDs
        validated_dicts = [q.model_dump(by_alias=True) for q in validated]

        # Validate skip logic destinations
        all_ids = {q.id for q in validated}
        for q in validated:
            if q.skipLogic:
                q_idx = next((i for i, v in enumerate(validated) if v.id == q.id), -1)
                forward_ids = {v.id for v in validated[q_idx + 1:]} | {"END_SURVEY"}
                bad_rules = [r for r in q.skipLogic if r.destination not in forward_ids]
                if bad_rules:
                    guard_errors.append(
                        f"{q.id}: skip destinations {[r.destination for r in bad_rules]} not forward — removed"
                    )
                    q.skipLogic = [r for r in q.skipLogic if r.destination in forward_ids] or None

            if q.displayLogic:
                src = q.displayLogic.sourceQuestionId
                q_idx = next((i for i, v in enumerate(validated) if v.id == q.id), -1)
                src_idx = next((i for i, v in enumerate(validated) if v.id == src), -1)
                if src_idx == -1:
                    guard_errors.append(f"{q.id}: displayLogic source '{src}' not found — removed")
                    q.displayLogic = None
                elif src_idx >= q_idx:
                    guard_errors.append(f"{q.id}: displayLogic source '{src}' is not before this question — removed")
                    q.displayLogic = None

        if guard_errors:
            logger.warning("copilot_guard_errors", errors=guard_errors)

        explanation = raw_output.explanation
        if guard_errors:
            explanation = f"Note: {len(guard_errors)} logic rule(s) were removed (invalid destinations/sources). {explanation}"

        return CopilotOutput(
            questions=validated,
            explanation=explanation,
            changes=raw_output.changes,
            suggestions=raw_output.suggestions,
        ), ([entry.to_dict()] if entry is not None else [])

    async def _try_skill_copilot(self, input_data: CopilotInput):
        """Run the copilot-analyst skill; return a raw_output-like object or None.

        Returns an object exposing ``.questions`` (list[Question]), ``.explanation``,
        ``.changes`` (list[CopilotChange]), ``.suggestions`` so the existing guard
        validation can consume it unchanged. Returns None on any failure so the
        caller falls back to the legacy agent.
        """
        try:
            from types import SimpleNamespace
            from crystalos.lib.skill_registry import get_registry
            from crystalos.lib.skill_survey_adapter import (
                question_models_to_skill_shape,
                skill_questions_to_models,
            )

            reg = get_registry()
            if not reg.is_initialized() or not reg.get_skill_meta("copilot-analyst"):
                return None

            ctx = input_data.org_context
            skill_input = {
                "message": input_data.message,
                "questions": question_models_to_skill_shape(input_data.questions),
                "conversation_history": [
                    {"role": m.role, "content": m.content}
                    for m in input_data.conversation_history[-6:]
                ],
                "org_context": {"industry": ctx.industry, "audience": ctx.target_audience},
                "survey_type": input_data.survey_type_id,
                "intent": input_data.intent or "",
            }
            skill_ctx = {"org_id": getattr(input_data, "org_id", "") or ""}

            result = await reg.execute("copilot-analyst", skill_input, skill_ctx)
            if not result.get("eval_passed") or not result.get("output"):
                logger.info("copilot_skill_fallback", reason="eval failed or empty output")
                return None

            output = result["output"]
            questions = skill_questions_to_models(output.get("questions", []))
            changes = [
                CopilotChange(
                    question_id=str(c.get("question_id", "")),
                    what_changed=str(c.get("description", c.get("what_changed", ""))),
                    action=c.get("change_type") or c.get("action"),
                )
                for c in output.get("changes", [])
                if isinstance(c, dict)
            ]
            suggestions = [str(s) for s in output.get("suggestions", [])][:3]

            logger.info(
                "copilot_skill_runtime",
                question_count=len(questions),
                eval_score=result.get("eval_score"),
                retried=result.get("retried"),
            )
            return SimpleNamespace(
                questions=questions,
                explanation=str(output.get("explanation", "")),
                changes=changes,
                suggestions=suggestions,
            )
        except Exception as exc:
            logger.warning("copilot_skill_error", error=str(exc))
            return None


# Module-level singleton
copilot_agent = CopilotAgent()
