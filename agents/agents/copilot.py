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

from agents.agents.base import AgentManifest, BaseAgent
from agents.lib.logger import logger
from agents.lib.openrouter import call_agent
from agents.lib.validators import fix_question_ids
from agents.schemas.output import CopilotInput, CopilotOutput
from agents.schemas.question import Question

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
  - "What would you recommend for this survey?"

Rules for MODE A:
  - Return questions UNCHANGED (exact same array you received).
  - Set "response_type": "answer".
  - Put your full answer in "explanation" — be direct and helpful, no preamble.
  - Leave "changes" as an empty array [].
  - Suggest 1–3 natural follow-ups in "suggestions".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODE B — EDIT THE SURVEY (apply changes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use this mode when the user explicitly asks for a change. Supported operations:

1. REFINE A QUESTION — improve wording, remove bias, clarify ambiguity
   Apply changes ONLY to the specific question(s) mentioned.
   NEVER change a question's ID. Preserve type unless user asks to change it.

2. ADD SKIP LOGIC — conditional branching based on an answer
   Add "skipLogic" to the source question (whose answer triggers the branch).
   {{ "id": "rule_1", "condition": {{"operator": "lt", "value": 7}}, "destination": "q4" | "END_SURVEY" }}
   Operators: eq, neq, lt, gt, lte, gte, contains, answered, not_answered
   Destination must be a LATER question or END_SURVEY.

3. ADD DISPLAY LOGIC — show/hide a question based on another answer
   Add "displayLogic" to the target question.
   {{ "sourceQuestionId": "q2", "operator": "eq", "value": "Yes" }}

4. CONFIGURE A QUESTION — set properties without changing content
   - maxLength, allowOther, randomize, maxSelections, placeholder, validation, required, ratingStyle, csatStyle

5. ADD A QUESTION — insert a new question into the survey
   - Assign the next sequential ID; insert after the referenced question or at the end.

6. REMOVE A QUESTION — delete a specified question; remove its skip logic sources too.

7. REORDER QUESTIONS — move questions to improve flow (do NOT renumber IDs).

8. BULK CONFIGURE — apply a setting to multiple or all questions.

9. IMPROVE OVERALL — general improvements to flow, wording, or structure.

Rules for MODE B:
  - Set "response_type": "edit".
  - Return ALL questions (modified AND unchanged) in the correct order.
  - Question IDs are IMMUTABLE — never change them.
  - Preserve skip logic and display logic on questions you are NOT modifying.
  - In "changes", describe every question you modified.
  - Explain clearly what changed in "explanation" (no "No changes were made" preamble).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RETURN FORMAT — ONLY valid JSON, no markdown fences:
{{
  "response_type": "answer" | "edit",
  "questions": [ ...full question array... ],
  "explanation": "Direct answer or clear description of changes.",
  "changes": [],
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
                if src not in all_ids:
                    guard_errors.append(f"{q.id}: displayLogic source '{src}' not found — removed")
                    q.displayLogic = None

        if guard_errors:
            logger.warning("copilot_guard_errors", errors=guard_errors)

        return CopilotOutput(
            questions=validated,
            explanation=raw_output.explanation,
            changes=raw_output.changes,
            suggestions=raw_output.suggestions,
        ), [entry.to_dict()]


# Module-level singleton
copilot_agent = CopilotAgent()
