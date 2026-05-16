"""Crystal — Stateful Conversational AI Analyst for the Insights Page.

Crystal is the expert CX analyst embedded in the SurveyInsightsPage. Unlike the
stateless NLQ endpoint (POST /ask), Crystal maintains a conversation thread so
follow-up questions build on earlier context.

Production features:
  - Hallucination filter: deterministically validates all cited IDs against context
  - LLM Evaluator: scores answer quality (grounding, relevance, completeness)
  - Self-correction loop: up to 2 retries when eval score < 72 or grounding fails
  - Type-safe context builders: coerce all numeric fields from DB (can arrive as str)

Design:
  - Single LLM call per user message (retried only on quality failure)
  - Full context: insights list, topics, metrics, survey metadata
  - Conversation history passed in and managed by backend (crystal_threads table)
  - Returns structured output: answer + citations + follow-up suggestions + insight refs
  - Does NOT modify surveys — refer users to Copilot for that

Used by: POST /api/insights/:surveyId/crystal (backend/src/routes/local/insights.js)
Called via: POST /insights/crystal (agents/main.py)
"""
from __future__ import annotations

import json

from pydantic import BaseModel

from agents.lib.openrouter import call_agent
from agents.lib.logger import logger
from agents.agents.insight_experts import evaluate_crystal_response


class CrystalInput(BaseModel):
    survey_id: str
    org_id: str
    message: str
    insights: list[dict]                   # current insights list (up to 30)
    topics: list[dict] = []                # survey topics with sentiment/volume
    survey_title: str = ""
    survey_response_count: int = 0
    metrics: dict = {}                     # {nps: {score, n}, csat: {score, n}}
    conversation_history: list[dict] = []  # [{role, content}], last 10 messages


class CrystalOutput(BaseModel):
    answer: str                   # 2-5 sentences, concise and evidence-based
    citations: list[str] = []     # insight IDs or topic names referenced
    suggestions: list[str] = []   # 2-3 follow-up questions
    insight_refs: list[str] = []  # insight IDs used in the answer


# ── Insight layer order for structured context ────────────────────────────────

_LAYER_ORDER = ["descriptive", "diagnostic", "predictive", "prescriptive"]
_LAYER_LABELS = {
    "descriptive":  "WHAT (Descriptive)",
    "diagnostic":   "WHY (Diagnostic)",
    "predictive":   "WHAT NEXT (Predictive)",
    "prescriptive": "ACTIONS (Prescriptive)",
}


def _build_insights_context(insights: list[dict]) -> tuple[str, set[str]]:
    """Group insights by layer, format as structured context, return valid IDs."""
    by_layer: dict[str, list[dict]] = {layer: [] for layer in _LAYER_ORDER}
    other: list[dict] = []
    valid_ids: set[str] = set()

    for ins in insights:
        layer = ins.get("layer", "")
        ins_id = str(ins.get("id", ""))
        if ins_id:
            valid_ids.add(ins_id)
        if layer in by_layer:
            by_layer[layer].append(ins)
        else:
            other.append(ins)

    lines: list[str] = []
    for layer in _LAYER_ORDER:
        layer_insights = by_layer[layer]
        if not layer_insights:
            continue
        lines.append(f"\n## {_LAYER_LABELS[layer]}")
        for ins in layer_insights:
            ins_id = ins.get("id", "")
            headline = ins.get("headline", "")
            narrative = ins.get("narrative", "")
            trust = ins.get("trust_score")
            metric = ins.get("metric_json")

            line = f"- [{ins_id}] {headline}"
            if narrative:
                line += f"\n  {narrative}"
            if metric is not None:
                line += f"\n  Metric: {json.dumps(metric)}"
            if trust is not None:
                try:
                    line += f"  (trust: {float(trust):.2f})"
                except (TypeError, ValueError):
                    pass
            lines.append(line)

    if other:
        lines.append("\n## OTHER")
        for ins in other:
            lines.append(f"- [{ins.get('id', '')}] {ins.get('headline', '')}")

    return "\n".join(lines) if lines else "No insights available yet.", valid_ids


def _build_topics_context(topics: list[dict]) -> str:
    """Format topics as a compact table-like block. Coerces all numeric fields."""
    if not topics:
        return "No topics available."

    lines = ["Topic | Volume | Sentiment | Effort | Trending"]
    lines.append("------|--------|-----------|--------|--------")
    for t in topics[:20]:
        name = t.get("name", "")
        try:
            vol = int(t.get("volume", 0) or 0)
        except (TypeError, ValueError):
            vol = 0
        try:
            sentiment = round(float(t.get("sentiment_score", 0.0) or 0.0), 2)
        except (TypeError, ValueError):
            sentiment = 0.0
        emotion = t.get("dominant_emotion", "")
        try:
            effort_raw = t.get("effort_score")
            effort_str = f"{float(effort_raw):.2f}" if effort_raw is not None else "n/a"
        except (TypeError, ValueError):
            effort_str = "n/a"
        trending = "yes" if t.get("trending") else "no"
        lines.append(f"{name} | {vol} | {sentiment} ({emotion}) | {effort_str} | {trending}")

    return "\n".join(lines)


def _build_metrics_context(metrics: dict, response_count: int) -> str:
    """Format key metrics block."""
    parts: list[str] = []
    if response_count:
        parts.append(f"Total responses: {response_count}")

    nps = metrics.get("nps")
    if nps:
        score = nps.get("score") or nps.get("value")
        n = nps.get("n") or nps.get("sample_size")
        if score is not None:
            parts.append(f"NPS score: {score}" + (f" (n={n})" if n else ""))

    csat = metrics.get("csat")
    if csat:
        score = csat.get("score") or csat.get("value")
        n = csat.get("n") or csat.get("sample_size")
        if score is not None:
            parts.append(f"CSAT score: {score}" + (f" (n={n})" if n else ""))

    return "\n".join(parts) if parts else "No key metrics available."


def _build_system_prompt(inp: CrystalInput, correction: str = "") -> str:
    title = inp.survey_title or f"Survey {inp.survey_id}"
    insights_ctx, _ = _build_insights_context(inp.insights)
    topics_ctx = _build_topics_context(inp.topics)
    metrics_ctx = _build_metrics_context(inp.metrics, inp.survey_response_count)

    correction_block = ""
    if correction:
        correction_block = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRECTION REQUIRED (previous attempt had issues)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{correction}

"""

    return f"""\
You are Crystal, an expert CX (customer experience) analyst for "{title}".
Your role is to help the survey owner understand what their data means and what to do about it.
{correction_block}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{metrics_ctx}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSIGHTS (grouped by analysis layer)
Each insight is prefixed with its ID in brackets, e.g. [abc123].
ONLY cite these IDs — never invent IDs not listed here.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{insights_ctx}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOPICS (respondent themes, ordered by volume)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{topics_ctx}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Answer the user's question in 2-5 concise sentences. Be direct — no preamble, no filler.
2. Ground every claim in the insight data above. Cite insight IDs (e.g. "[abc123]") inline.
3. For topics, reference them by name (e.g. "the Shipping topic").
4. If the data does not support an answer, say so honestly rather than speculating.
5. Suggest 2-3 natural follow-up questions the user might want to ask next.
6. NEVER cite an insight ID that is not listed above. NEVER invent data.
7. NEVER recommend changes to survey questions — refer them to the survey builder (Copilot).
8. Keep your answer analytical and evidence-based. Think like a management consultant.

Return ONLY valid JSON matching this schema — no markdown, no extra text:
{{
  "answer": "Your 2-5 sentence answer with inline citations like [insight-id].",
  "citations": ["insight-id-1", "insight-id-2"],
  "suggestions": ["Follow-up question 1?", "Follow-up question 2?", "Follow-up question 3?"],
  "insight_refs": ["insight-id-1", "insight-id-2"]
}}
"""


async def _generate_response(
    inp: CrystalInput,
    correction: str = "",
) -> CrystalOutput:
    """Single LLM call to generate Crystal's response."""
    system = _build_system_prompt(inp, correction=correction)

    prior_messages: list[dict] | None = None
    if inp.conversation_history:
        prior_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in inp.conversation_history[-10:]
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]

    output, _ = await call_agent(
        agent_name="crystal",
        system=system,
        user=inp.message,
        output_schema=CrystalOutput,
        current_tokens=0,
        prior_messages=prior_messages,
    )
    return output


async def _run_crystal(inp: CrystalInput) -> CrystalOutput:
    """Generate Crystal's response with evaluator + hallucination filter + self-correction."""
    _, valid_ids = _build_insights_context(inp.insights)
    metrics_ctx = _build_metrics_context(inp.metrics, inp.survey_response_count)

    best_output: CrystalOutput | None = None
    best_score = -1
    correction = ""

    for attempt in range(3):
        try:
            output = await _generate_response(inp, correction=correction)
        except Exception as exc:
            logger.warning("crystal_generate_failed", attempt=attempt, error=str(exc))
            if best_output is not None:
                return best_output
            raise

        # ── Deterministic hallucination filter ────────────────────────────────
        cited_ids = list(set((output.citations or []) + (output.insight_refs or [])))
        hallucinated = [cid for cid in cited_ids if cid and cid not in valid_ids]
        if hallucinated:
            # Strip hallucinated IDs from both fields before evaluating
            output.citations  = [c for c in output.citations  if c not in hallucinated]
            output.insight_refs = [r for r in output.insight_refs if r not in hallucinated]
            logger.warning(
                "crystal_hallucinated_ids_stripped",
                attempt=attempt,
                hallucinated=hallucinated,
            )

        # ── LLM quality evaluation ────────────────────────────────────────────
        try:
            eval_result = await evaluate_crystal_response(
                user_question=inp.message,
                answer=output.answer,
                valid_insight_ids=valid_ids,
                cited_ids=cited_ids,
                metrics_context=metrics_ctx,
            )
        except Exception as exc:
            logger.warning("crystal_eval_failed", attempt=attempt, error=str(exc))
            # Evaluation failed — accept output as-is on the first attempt
            if best_output is None:
                best_output = output
            break

        score = eval_result.quality_score
        if score > best_score:
            best_score = score
            best_output = output

        passes = (
            eval_result.quality_score >= 72
            and eval_result.is_grounded
            and eval_result.answers_question
        )

        logger.info(
            "crystal_eval",
            attempt=attempt,
            score=score,
            grounded=eval_result.is_grounded,
            answers_question=eval_result.answers_question,
            issues=eval_result.issues,
            passes=passes,
        )

        if passes:
            break

        if attempt < 2:
            # Build a concrete correction instruction for the next attempt
            issue_list = "; ".join(eval_result.issues[:3]) if eval_result.issues else "quality below threshold"
            hallucination_note = (
                f" Do NOT cite these IDs (they don't exist in context): {eval_result.hallucinated_ids}."
                if eval_result.hallucinated_ids else ""
            )
            correction = (
                f"Previous answer had issues: {issue_list}.{hallucination_note} "
                f"{eval_result.correction or 'Improve directness and grounding.'}"
            )

    assert best_output is not None  # at least one attempt always sets this

    logger.info(
        "crystal_response",
        survey_id=inp.survey_id,
        org_id=inp.org_id,
        insight_count=len(inp.insights),
        suggestion_count=len(best_output.suggestions),
        final_score=best_score,
    )
    return best_output


class CrystalAgent:
    """Thin agent wrapper — no BaseAgent needed since Crystal isn't in the graph."""

    async def run(self, inp: CrystalInput) -> tuple[CrystalOutput, list[dict]]:
        output = await _run_crystal(inp)
        return output, []


# Module-level singleton
crystal_agent = CrystalAgent()
