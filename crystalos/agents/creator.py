"""Survey Creator Agent.

Generates survey questions from a plain-English intent and org context.
Context-aware: uses org industry, size, use case, and prior survey count
to tailor questions beyond generic templates.

On revision runs, QC issues from the previous attempt are injected so the
agent can self-correct without losing the survey's overall intent.

Anti-hallucination guards (post-LLM):
  - Question ID correction: auto-fixes non-sequential IDs (q3→q1 etc.)
  - Semantic validation via validators.validate_questions_semantic():
    * Options presence check (multiple_choice needs options; nps must NOT have them)
    * Scale consistency (all rating questions must use same scale)
    * Open-text requirement (last question should be open/short_text)
    * Duplicate detection (copy-paste error by LLM)
  - Violations are logged and surfaced in stream events; the run continues
    with auto-corrected data rather than failing hard (fail-safe, not fail-stop).

Independently runnable via POST /agents/creator/run.
"""
from __future__ import annotations

from crystalos.agents.base import AgentManifest, BaseAgent
from crystalos.lib.logger import logger
from crystalos.lib.openrouter import call_agent
from crystalos.lib.validators import fix_question_ids, validate_questions_semantic
from crystalos.schemas.output import CreatorInput, CreatorOutput, OrgContext
from crystalos.schemas.question import Question
from crystalos.agents.insight_experts import check_survey_bias, evaluate_survey

_SYSTEM_TEMPLATE = """\
You are an expert enterprise survey designer working inside Experient Copilot.

ORG CONTEXT:
- Industry: {industry}
- Size: {size} employees
- Primary use case: {use_case}
- Target audience: {target_audience}
- Prior surveys created by this org: {prior_survey_count}
{brand_hint}

SURVEY TYPE: {survey_type}
GOAL: "{intent}"

{revision_block}

DESIGN RULES (follow strictly):
1. Generate between 5 and 12 questions — never fewer than 5, never more than 12.
2. ALWAYS include at least one NPS or CSAT question for any CX/product survey.
3. ALWAYS end with at least one open_text question ("What else would you like us to know?").
4. Mix closed questions (measurable, 70%) with open-text (meaningful, 30%).
5. NO double-barreled questions (questions that ask two things in one).
6. NO leading questions (questions that presuppose a positive or negative answer).
7. Scale consistency: if you use a 1-5 rating in one question, do NOT use 1-10 in another.
8. Use sequential question IDs: q1, q2, q3 … qN. Never skip or reuse IDs.
9. For choice questions, provide 4–6 balanced options unless the domain demands otherwise.
10. required: true for all closed questions; required: false for open_text by default.
11. DO NOT ask for personally identifiable information (names, emails, phone numbers, addresses).

CONFIGURATION RULES:
12. For open_text and short_text questions, always set "maxLength": 500 (short_text) or 2000 (open_text).
13. For short_text asking for a specific format (e.g. order number, code), set "validation": "alphanumeric" or "numeric".
14. For multiple_choice and checkbox questions, add "allowOther": true if the options list may not be exhaustive.
15. For checkbox questions, set "maxSelections" if appropriate (e.g., "Select up to 3").
16. For choice questions where option order could bias responses, set "randomize": true.
17. For dropdown questions, always set a "placeholder" like "Select an option…".
18. For rating/slider, always include "labelLow" and "labelHigh" to anchor the scale.

SKIP LOGIC RULES (conditional branching):
19. Add skip logic when a question's answer determines whether a follow-up is relevant.
    Examples:
    - NPS detractors (0–6) → ask "What disappointed you?" (skip for promoters 9–10)
    - "Did you contact support?" = No → skip "How was the support experience?"
    - "How often do you use our product?" = Never → skip product experience questions
20. Use "skipLogic" array on the SOURCE question (the one whose answer triggers branching).
    Each rule: {{ "id": "rule_1", "condition": {{"operator": "...", "value": ...}}, "destination": "q5" | "END_SURVEY" }}
    Operators: "eq" (equals), "neq" (not equals), "lt" (less than), "gt" (greater than),
               "lte" (≤), "gte" (≥), "contains" (text contains), "answered", "not_answered"
21. Skip logic destination must be a LATER question ID (never a previous one) or "END_SURVEY".
22. Only add skip logic where it genuinely improves respondent experience — do not over-engineer.

DISPLAY LOGIC RULES (conditional visibility):
23. Add "displayLogic" on a question that should only APPEAR if a previous question matches a condition.
    {{ "sourceQuestionId": "q2", "operator": "eq", "value": "Yes" }}
24. displayLogic is an alternative to skipLogic — use displayLogic when the question is a follow-up
    that appears inline; use skipLogic when you want to jump over a block of questions.

FULL QUESTION SCHEMA — include only fields relevant to the question type:
{{
  "id": "q1",
  "type": "nps|csat|rating|slider|multiple_choice|checkbox|dropdown|ranking|open_text|short_text|matrix|date|statement",
  "question": "...",
  "required": true|false,

  // Scale types (nps, csat, rating, slider)
  "labelLow": "Not at all likely",
  "labelHigh": "Extremely likely",
  "scaleMax": 5|7|10,
  "ratingStyle": "stars|numbers",
  "csatStyle": "emoji|stars|numbers",
  "min": 0, "max": 100, "step": 1, "showValue": true,

  // Choice types (multiple_choice, checkbox, dropdown, ranking)
  "options": ["Option A", "Option B", "Option C"],
  "allowOther": true|false,
  "randomize": true|false,
  "maxSelections": 3,
  "placeholder": "Select an option…",

  // Text types (open_text, short_text)
  "maxLength": 500,
  "validation": "email|phone|numeric|alphanumeric|url",
  "placeholder": "Your answer here…",

  // Matrix
  "rows": ["Ease of use", "Value for money"],
  "columns": ["Poor", "Fair", "Good", "Excellent"],
  "matrixType": "radio|checkbox",

  // Date
  "dateType": "date|time|datetime",

  // Skip logic (on the question whose answer triggers branching)
  "skipLogic": [
    {{ "id": "rule_1", "condition": {{"operator": "lt", "value": 7}}, "destination": "q5" }},
    {{ "id": "rule_2", "condition": {{"operator": "gte", "value": 9}}, "destination": "END_SURVEY" }}
  ],

  // Display logic (on the question that should conditionally appear)
  "displayLogic": {{ "sourceQuestionId": "q2", "operator": "eq", "value": "Yes" }}
}}

RETURN FORMAT — ONLY valid JSON, no markdown fences, no explanation:
{{
  "questions": [ ...array of question objects... ],
  "rationale": "One sentence explaining your key design choices."
}}
"""

_REVISION_BLOCK = """\
REVISION {n}/2 — The previous survey draft had the following QC issues. Fix ALL of them:
{issues_list}

Keep questions that had NO issues exactly as they were.
"""


class SurveyCreatorAgent(BaseAgent):
    manifest = AgentManifest(
        name="creator",
        version="1.2.0",
        description=(
            "Generates a tailored survey from a plain-English intent. "
            "Context-aware: uses org industry, size, and use case. "
            "Generates skip logic, display logic, config fields (maxLength, allowOther, randomize, validation). "
            "Revises output based on QC feedback (max 2 loops). "
            "Post-LLM validation auto-corrects IDs and catches structural errors."
        ),
        input_schema=CreatorInput,
        output_schema=CreatorOutput,
        tags=["survey", "creation", "copilot"],
        est_cost_usd=0.002,
        enabled=True,
        phase="1",
    )

    async def run(
        self,
        input_data: CreatorInput,
        current_tokens: int = 0,
    ) -> tuple[CreatorOutput, list[dict]]:
        ctx: OrgContext = input_data.org_context

        revision_block = ""
        if input_data.revision_count > 0 and input_data.revision_issues:
            issues_list = "\n".join(
                f"  - [{i['severity'].upper()}] Q{i['question_id']}: {i['message']}. "
                f"Suggestion: {i.get('suggestion', '')}"
                for i in input_data.revision_issues
            )
            revision_block = _REVISION_BLOCK.format(
                n=input_data.revision_count,
                issues_list=issues_list,
            )

        brand_hint = ""
        if ctx.brand_description:
            brand_hint = f"- Brand voice: {ctx.brand_description[:100]}"

        system = _SYSTEM_TEMPLATE.format(
            industry=ctx.industry or "general",
            size=ctx.size or "unknown",
            use_case=ctx.use_case or "general feedback",
            target_audience=ctx.target_audience or "customers",
            prior_survey_count=ctx.prior_survey_count,
            brand_hint=brand_hint,
            survey_type=input_data.survey_type_id or "general",
            intent=input_data.intent,
            revision_block=revision_block,
        )

        user_msg = (
            f"Create a survey for this goal: {input_data.intent}"
            + (f" (Survey type: {input_data.survey_type_id})" if input_data.survey_type_id else "")
        )

        # ── Skill-first: try the survey-creator skill on the initial draft ───────
        # Revisions stay on the legacy path (the skill has no QC-feedback input).
        # Any skill failure (not registered, eval fail, mapping error) falls back
        # to the legacy call_agent path below — output is identical downstream.
        raw_output = None
        entry = None
        if input_data.revision_count == 0:
            raw_output = await self._try_skill_creator(input_data)

        if raw_output is None:
            raw_output, entry = await call_agent(
                agent_name="creator",
                system=system,
                user=user_msg,
                output_schema=CreatorOutput,
                current_tokens=current_tokens,
            )

        # ── Post-LLM validation (anti-hallucination guards) ──────────────────────

        # 1. Auto-fix non-sequential IDs (q3, q5 → q1, q2)
        questions_dicts = [q.model_dump(by_alias=True) for q in raw_output.questions]
        fixed_dicts     = fix_question_ids(questions_dicts)
        if fixed_dicts != questions_dicts:
            logger.info(
                "creator_ids_corrected",
                original_ids=[q.get("id") for q in questions_dicts],
                corrected_ids=[q.get("id") for q in fixed_dicts],
            )

        # 2. Semantic validation
        semantic_errors = validate_questions_semantic(fixed_dicts)
        if semantic_errors:
            logger.warning(
                "creator_semantic_validation_errors",
                errors=semantic_errors,
                revision=input_data.revision_count,
            )
            # On first run, errors are just logged (model will be given issues on revision)
            # On revision 2 (final), errors are surfaced but we proceed (fail-safe)

        # 3. Rebuild validated Question objects
        try:
            validated_questions = [Question.model_validate(q) for q in fixed_dicts]
        except Exception as e:
            logger.error("creator_question_rebuild_error", error=str(e))
            validated_questions = raw_output.questions  # fall back to raw output

        # ── Post-LLM expert passes (parallel) ────────────────────────────────
        # Run bias detection + survey evaluation concurrently.
        # Both are fail-safe — failures log a warning and don't block output.

        import asyncio as _asyncio

        question_dicts = [q.model_dump(by_alias=True) if hasattr(q, "model_dump") else vars(q)
                          for q in validated_questions]

        bias_result  = None
        eval_result  = None
        try:
            bias_task = check_survey_bias(question_dicts)
            eval_task = evaluate_survey(
                questions=question_dicts,
                intent=input_data.intent,
                survey_type=input_data.survey_type_id or "general",
            )
            bias_result, eval_result = await _asyncio.gather(
                bias_task, eval_task, return_exceptions=True,
            )
        except Exception as exc:
            logger.warning("creator_expert_passes_failed", error=str(exc))

        if isinstance(bias_result, Exception):
            logger.warning("creator_bias_check_failed", error=str(bias_result))
            bias_result = None
        if isinstance(eval_result, Exception):
            logger.warning("creator_survey_eval_failed", error=str(eval_result))
            eval_result = None

        if bias_result and bias_result.biased_questions:
            logger.warning(
                "creator_bias_detected",
                count=len(bias_result.biased_questions),
                bias_score=bias_result.overall_bias_score,
                questions=[b.get("question_id") for b in bias_result.biased_questions],
            )

        if eval_result:
            logger.info(
                "creator_survey_eval",
                quality=eval_result.quality_score,
                balance=eval_result.balance_score,
                coverage=eval_result.coverage_score,
                flow=eval_result.flow_score,
            )

        # Surface bias issues as additional QC-style semantic errors so the
        # caller (graph.py revision loop) can include them in the next pass.
        extra_errors = semantic_errors[:]
        if bias_result:
            for b in bias_result.biased_questions:
                extra_errors.append({
                    "type": "bias",
                    "question_id": b.get("question_id"),
                    "issue_type": b.get("issue_type"),
                    "message": b.get("description", ""),
                    "suggestion": b.get("suggestion", ""),
                    "severity": "warning",
                })

        if extra_errors and extra_errors != semantic_errors:
            logger.warning(
                "creator_combined_validation_errors",
                total=len(extra_errors),
                revision=input_data.revision_count,
            )

        return CreatorOutput(
            questions=validated_questions,
            rationale=raw_output.rationale,
        ), ([entry.to_dict()] if entry is not None else [])

    async def _try_skill_creator(self, input_data: CreatorInput):
        """Run the survey-creator skill; return a raw_output-like object or None.

        Returns an object exposing ``.questions`` (list[Question]) and ``.rationale``
        so the existing post-LLM validation pipeline can consume it unchanged.
        Returns None on any failure so the caller falls back to the legacy agent.
        """
        try:
            from types import SimpleNamespace
            from crystalos.lib.skill_registry import get_registry
            from crystalos.lib.skill_survey_adapter import skill_questions_to_models

            reg = get_registry()
            if not reg.is_initialized() or not reg.get_skill_meta("survey-creator"):
                return None

            ctx: OrgContext = input_data.org_context
            skill_input = {
                "intent": input_data.intent,
                "survey_type": input_data.survey_type_id,
                "org_context": {
                    "industry": ctx.industry,
                    "company_size": ctx.size,
                    "audience": ctx.target_audience,
                },
                "constraints": {"max_questions": 12, "language": "en"},
            }
            skill_ctx = {"org_id": getattr(input_data, "org_id", "") or ""}

            result = await reg.execute("survey-creator", skill_input, skill_ctx)
            if not result.get("eval_passed") or not result.get("output"):
                logger.info("creator_skill_fallback", reason="eval failed or empty output")
                return None

            output = result["output"]
            questions = skill_questions_to_models(output.get("questions", []))
            rationale = str(output.get("design_rationale") or output.get("rationale") or "")[:300]

            logger.info(
                "creator_skill_runtime",
                question_count=len(questions),
                eval_score=result.get("eval_score"),
                retried=result.get("retried"),
            )
            return SimpleNamespace(questions=questions, rationale=rationale)
        except Exception as exc:
            logger.warning("creator_skill_error", error=str(exc))
            return None


# Module-level singleton — imported by graph.py and main.py
survey_creator_agent = SurveyCreatorAgent()
