"""Skip Logic Generator Agent.

Adds conditional branching (skipLogic) and display logic (displayLogic) to
an existing survey question set based on a plain-English request.

Design principles:
  - Non-destructive: only modifies skipLogic / displayLogic fields, never
    question text, type, options, or IDs.
  - Idempotent: running twice with the same request produces the same result.
  - Forward-only: skip destinations must be LATER question IDs or END_SURVEY.
  - Minimal: only adds logic where the user explicitly asked; no speculative branching.

Standalone via POST /agents/skip-logic/run.
Also called by the Copilot agent and the /orchestrate/{run_id}/skip-logic endpoint.
"""
from __future__ import annotations

import json

from crystalos.agents.base import AgentManifest, BaseAgent
from crystalos.lib.logger import logger
from crystalos.lib.openrouter import call_agent
from crystalos.schemas.output import SkipLogicInput, SkipLogicOutput, SkipLogicChange
from crystalos.schemas.question import Question, SkipLogicRule, SkipLogicCondition, DisplayLogic

_SYSTEM_TEMPLATE = """\
You are a survey logic expert working inside Experient Copilot.
Your job is to add conditional skip logic and display logic to survey questions.

CURRENT SURVEY QUESTIONS:
{questions_json}

USER REQUEST: "{request}"

RULES:
1. Only modify "skipLogic" and "displayLogic" fields — never change question text, type, options, IDs, or required status.
2. skipLogic goes on the SOURCE question (the one whose answer triggers the branch).
   Each rule: {{ "id": "rule_N", "condition": {{"operator": "...", "value": ...}}, "destination": "qX" | "END_SURVEY" }}
   Valid operators: eq, neq, lt, gt, lte, gte, contains, answered, not_answered
   - Use numeric operators (lt/gt/lte/gte) for: nps (0–10), csat (1–5), rating (1–scaleMax), slider (min–max)
   - Use eq/neq/contains for: multiple_choice, checkbox, dropdown, ranking (match option text exactly)
   - Use answered/not_answered for: any type — these have NO value field: {{"operator": "answered"}}
   - For numeric comparisons use the numeric value: {{"operator": "lt", "value": 7}}
3. displayLogic goes on the TARGET question (the one that conditionally appears).
   Format: {{ "sourceQuestionId": "qX", "operator": "eq", "value": "Yes" }}
   Source must be a PREVIOUS question.
4. Destinations must be a LATER question ID or "END_SURVEY" — NEVER a previous question.
5. If a question already has skipLogic, APPEND new rules rather than replacing them (unless the request says to replace).
6. Return ALL questions (with changes applied). Unchanged questions must be returned exactly as given.
7. In "changes", list only questions you actually modified.

QUESTION IDS AVAILABLE: {question_ids}

RETURN FORMAT — ONLY valid JSON, no markdown fences:
{{
  "questions": [ ...all questions, modified ones with skipLogic/displayLogic added... ],
  "changes": [
    {{ "question_id": "q2", "field": "skipLogic", "previous_value": null, "new_value": [...], "explanation": "..." }}
  ],
  "summary": "One sentence describing what logic was added."
}}
"""


class SkipLogicAgent(BaseAgent):
    manifest = AgentManifest(
        name="skip-logic",
        version="1.0.0",
        description=(
            "Adds conditional skip logic and display logic to survey questions "
            "from a plain-English request. Non-destructive: only modifies logic "
            "fields, never question content. Forward-only destinations enforced."
        ),
        input_schema=SkipLogicInput,
        output_schema=SkipLogicOutput,
        tags=["survey", "logic", "copilot"],
        est_cost_usd=0.001,
        enabled=True,
        phase="1",
    )

    async def run(
        self,
        input_data: SkipLogicInput,
        current_tokens: int = 0,
    ) -> tuple[SkipLogicOutput, list[dict]]:
        questions_json = json.dumps(
            [q.model_dump(by_alias=True, exclude_none=True) for q in input_data.questions],
            indent=2,
        )
        question_ids = [q.id for q in input_data.questions]

        system = _SYSTEM_TEMPLATE.format(
            questions_json=questions_json,
            request=input_data.request,
            question_ids=", ".join(question_ids),
        )
        user_msg = f"Add logic: {input_data.request}"

        raw_output, entry = await call_agent(
            agent_name="skip-logic",
            system=system,
            user=user_msg,
            output_schema=SkipLogicOutput,
            current_tokens=current_tokens,
        )

        # ── Post-LLM validation ──────────────────────────────────────────────────
        valid_ids    = set(question_ids)
        valid_ids.add("END_SURVEY")
        validated    = []
        guard_errors: list[str] = []

        for q in raw_output.questions:
            q_dict = q.model_dump(by_alias=True)

            # Validate skip logic destinations are forward-only
            if q.skipLogic:
                q_index = question_ids.index(q.id) if q.id in question_ids else -1
                forward_ids = set(question_ids[q_index + 1:]) | {"END_SURVEY"}
                clean_rules = []
                for rule in q.skipLogic:
                    if rule.destination not in forward_ids:
                        guard_errors.append(
                            f"{q.id}: skip destination '{rule.destination}' is not forward — removed"
                        )
                    else:
                        clean_rules.append(rule)
                q_dict["skipLogic"] = [r.model_dump() for r in clean_rules] or None

            # Validate displayLogic source exists and is before this question
            if q.displayLogic:
                src = q.displayLogic.sourceQuestionId
                q_index = question_ids.index(q.id) if q.id in question_ids else -1
                src_index = question_ids.index(src) if src in question_ids else -1
                if src_index >= q_index:
                    guard_errors.append(
                        f"{q.id}: displayLogic source '{src}' is not before this question — removed"
                    )
                    q_dict["displayLogic"] = None

            try:
                validated.append(Question.model_validate(q_dict))
            except Exception as e:
                guard_errors.append(f"{q.id}: validation error — {e}")
                validated.append(q)  # keep original on error

        if guard_errors:
            logger.warning("skip_logic_guard_errors", errors=guard_errors)

        summary = raw_output.summary
        if guard_errors:
            removed_count = len(guard_errors)
            summary = f"{summary} Note: {removed_count} rule(s) were removed due to invalid destinations."

        return SkipLogicOutput(
            questions=validated,
            changes=raw_output.changes,
            summary=summary,
        ), [entry.to_dict()]


# Module-level singleton — imported by graph.py and main.py
skip_logic_agent = SkipLogicAgent()
