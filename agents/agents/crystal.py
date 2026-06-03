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


def _format_tool_result(tool_name: str, result: dict, char_limit: int = 2000) -> str:
    """Format a tool result as a concise structured summary for LLM context.

    Replaces the raw JSON[:500] truncation with tool-aware summaries that
    preserve the most important signals within a larger character budget.
    Enterprise surveys with 30+ topics can saturate 500 chars in a single topic.
    """
    if not isinstance(result, dict):
        return str(result)[:char_limit]

    if result.get("error"):
        return f"[error: {result['error']}]"

    # Topics tool — most important for enterprise
    if tool_name in ("get_topics", "list_topics"):
        topics = result.get("topics", [])
        lines = [f"Topics ({len(topics)} total):"]
        for t in topics[:12]:
            name    = t.get("name", "?")
            vol     = t.get("volume") or t.get("response_count", 0)
            sent    = t.get("sentiment_score", 0.0)
            impact  = t.get("nps_impact")
            urgency = t.get("urgency_score", 0.0)
            trend   = t.get("trending", "")
            impact_str = f", NPS_impact={impact:+.1f}" if impact is not None else ""
            trend_str  = f" [{trend}]" if trend in ("up", "down") else ""
            lines.append(f"  {name}{trend_str}: vol={vol}, sentiment={sent:.2f}{impact_str}, urgency={urgency:.1f}")
        return "\n".join(lines)[:char_limit]

    # Insights tool
    if tool_name in ("get_insights", "list_insights"):
        insights = result.get("insights", [])
        lines = [f"Insights ({len(insights)} total):"]
        for ins in insights[:10]:
            cat  = ins.get("category", "")
            head = ins.get("headline", "")[:80]
            trust = ins.get("trust_score", 0)
            lines.append(f"  [{cat}] {head} (trust={trust})")
        return "\n".join(lines)[:char_limit]

    # Metrics / NPS tool
    if "nps" in tool_name or "metrics" in tool_name or "score" in tool_name:
        lines = []
        for k, v in result.items():
            if isinstance(v, dict):
                score = v.get("score")
                n     = v.get("n")
                if score is not None:
                    lines.append(f"  {k}: {score}" + (f" (n={n})" if n else ""))
            elif v is not None and not isinstance(v, (list, dict)):
                lines.append(f"  {k}: {v}")
        return ("Metrics:\n" + "\n".join(lines)) if lines else json.dumps(result)[:char_limit]

    # Verbatims / quotes tool
    if "verbatim" in tool_name or "quote" in tool_name or "response" in tool_name:
        verbatims = result.get("verbatims") or result.get("quotes") or result.get("responses", [])
        if verbatims:
            lines = [f"Verbatims ({len(verbatims)} total):"]
            for v in verbatims[:8]:
                text = (v.get("text") or str(v))[:120]
                sent = v.get("sentiment", "")
                lines.append(f'  [{sent}] "{text}"')
            return "\n".join(lines)[:char_limit]

    # Default: flatten to key: value pairs, skipping large nested objects
    lines = []
    for k, v in result.items():
        if isinstance(v, list):
            lines.append(f"{k}: [{len(v)} items]")
        elif isinstance(v, dict):
            lines.append(f"{k}: {json.dumps(v)[:100]}")
        elif v is not None:
            lines.append(f"{k}: {v}")
    return "\n".join(lines)[:char_limit]

from agents.lib.openrouter import call_agent
from agents.lib.logger import logger
from agents.lib.constants import CRYSTAL_EVAL_PASS_THRESHOLD
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
    user_id: str = ""
    scope: str = "survey"
    has_open_text: bool = True


class CrystalOutput(BaseModel):
    answer: str                   # 2-5 sentences, concise and evidence-based
    citations: list[str] = []     # insight IDs or topic names referenced
    suggestions: list[str] = []   # 2-3 follow-up questions
    insight_refs: list[str] = []  # insight IDs used in the answer


# ── Thread management ─────────────────────────────────────────────────────────

async def get_or_create_thread(ctx, db_pool) -> dict:
    """UPSERT into crystal_threads. Resets thread if inactive > 7 days."""
    from agents.lib.constants import CRYSTAL_THREAD_INACTIVITY_TTL_DAYS
    from agents.lib import db as _db

    try:
        async with _db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                # Check for existing thread
                await cur.execute(
                    """SELECT id, messages, last_active_at, message_count
                       FROM crystal_threads
                       WHERE org_id = %s AND user_id = %s
                         AND (survey_id = %s OR (survey_id IS NULL AND %s IS NULL))
                         AND scope = %s
                       LIMIT 1""",
                    (ctx.org_id, ctx.user_id, ctx.survey_id, ctx.survey_id, ctx.scope),
                )
                row = await cur.fetchone()

                if row:
                    thread_id, messages, last_active_at, message_count = row
                    # Check TTL
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc)
                    if last_active_at and hasattr(last_active_at, 'tzinfo'):
                        stale_days = (now - last_active_at).days
                    else:
                        stale_days = 0

                    if stale_days >= CRYSTAL_THREAD_INACTIVITY_TTL_DAYS:
                        # Reset thread - start fresh
                        await conn.execute(
                            """UPDATE crystal_threads
                               SET messages = '[]'::jsonb, message_count = 0,
                                   last_active_at = NOW()
                               WHERE id = %s""",
                            (thread_id,),
                        )
                        await conn.commit()
                        logger.info("crystal_thread_reset_stale", thread_id=str(thread_id), stale_days=stale_days)
                        return {"id": str(thread_id), "messages": [], "is_new": True}

                    # Continue existing thread
                    msgs = messages if isinstance(messages, list) else []
                    return {"id": str(thread_id), "messages": msgs, "is_new": False}

                # Create new thread
                await cur.execute(
                    """INSERT INTO crystal_threads
                       (org_id, user_id, survey_id, scope, messages, message_count,
                        last_active_at, storage_expires_at)
                       VALUES (%s, %s, %s, %s, '[]'::jsonb, 0, NOW(), NOW() + INTERVAL '90 days')
                       RETURNING id""",
                    (ctx.org_id, ctx.user_id, ctx.survey_id, ctx.scope),
                )
                new_row = await cur.fetchone()
                await conn.commit()
                return {"id": str(new_row[0]), "messages": [], "is_new": True}
    except Exception as exc:
        logger.warning("crystal_thread_get_or_create_failed", error=str(exc))
        return {"id": None, "messages": [], "is_new": True}


async def append_to_thread(thread_id: str, role: str, content: str) -> None:
    """Append a message to crystal_threads.messages JSONB array."""
    if not thread_id:
        return
    import json as _json
    from datetime import datetime, timezone
    from agents.lib import db as _db

    msg = _json.dumps({"role": role, "content": content, "ts": datetime.now(timezone.utc).isoformat()})
    try:
        async with _db._pool_conn().connection() as conn:
            await conn.execute(
                """UPDATE crystal_threads
                   SET messages = CASE
                           WHEN jsonb_array_length(messages) >= 100
                           THEN (messages - 0) || %s::jsonb
                           ELSE messages || %s::jsonb
                       END,
                       last_active_at = NOW(),
                       message_count = message_count + 1
                   WHERE id = %s""",
                (f"[{msg}]", f"[{msg}]", thread_id),
            )
    except Exception as exc:
        logger.warning("crystal_thread_append_failed", thread_id=thread_id, error=str(exc))


# ── Insight layer order for structured context ────────────────────────────────

_LAYER_ORDER = ["descriptive", "diagnostic", "predictive", "prescriptive"]
_LAYER_LABELS = {
    "descriptive":  "WHAT (Descriptive)",
    "diagnostic":   "WHY (Diagnostic)",
    "predictive":   "WHAT NEXT (Predictive)",
    "prescriptive": "ACTIONS (Prescriptive)",
}


def _build_insights_context(insights: list[dict]) -> tuple[str, set[str]]:
    """Group insights by layer, format as structured context, return valid IDs.

    When insights include _survey_title (org scope), each entry is prefixed with
    the survey name so Crystal can cite which survey an insight comes from.
    """
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
            ins_id  = ins.get("id", "")
            headline = ins.get("headline", "")
            narrative = ins.get("narrative", "")
            trust    = ins.get("trust_score")
            metric   = ins.get("metric_json")
            # Survey attribution — present when scope is org (cross-survey insights)
            survey_title = ins.get("_survey_title", "")
            survey_id    = ins.get("survey_id", "") or ins.get("_survey_id", "")

            survey_tag = f" [Survey: {survey_title}]" if survey_title else ""
            line = f"- [{ins_id}]{survey_tag} {headline}"
            if narrative:
                line += f"\n  {narrative[:200]}"
            if metric is not None:
                line += f"\n  Metric: {json.dumps(metric)}"
            if trust is not None:
                try:
                    line += f"  (trust: {float(trust):.0f})"
                except (TypeError, ValueError):
                    pass
            lines.append(line)

    if other:
        lines.append("\n## OTHER")
        for ins in other:
            survey_title = ins.get("_survey_title", "")
            survey_tag = f" [Survey: {survey_title}]" if survey_title else ""
            lines.append(f"- [{ins.get('id', '')}]{survey_tag} {ins.get('headline', '')}")

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

    # Build scope-aware sections
    scope = inp.scope if hasattr(inp, "scope") else "survey"
    is_org = scope == "org"

    scope_header = ""
    if is_org:
        scope_header = f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PORTFOLIO SCOPE — {inp.survey_response_count:,} responses across active surveys
You are analysing the full portfolio, not a single survey.
Each insight below is tagged [Survey: <name>] so you know its source.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    nav_section = """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APP NAVIGATION — help users explore further
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You know the app's structure. Use these in your suggestions when relevant:
• "Explore [Survey Name] Intelligence"   — survey dashboard with insights
• "View topics in [Survey Name]"         — topic hierarchy and drill-down
• "See trend analysis for [Survey Name]" — NPS/CSAT over time
• "Compare surveys side-by-side"         — use when patterns differ across surveys
• "Dig deeper into [Topic Name]"         — topic drill-down with verbatims

Include 1 navigation suggestion in your suggestions list when it would help.
"""

    return f"""\
You are Crystal, an expert CX (customer experience) analyst.
{"Your role is to synthesise intelligence across the organisation's surveys and help identify portfolio-level patterns." if is_org else f'Your role is to help the survey owner of "{title}" understand what their data means and what to do about it.'}
{correction_block}{scope_header}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{metrics_ctx}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSIGHTS (grouped by analysis layer)
Each insight is prefixed with its ID in brackets, e.g. [abc123].
{"Insights from different surveys are tagged [Survey: <name>]." if is_org else ""}
ONLY cite IDs listed here — never invent IDs.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{insights_ctx}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOPICS (respondent themes, ordered by volume)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{topics_ctx}
{nav_section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO RESPOND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write like a sharp colleague who knows this data cold — not like a chatbot.
Specific numbers, named themes, real quotes. Skip the preamble.

1. Lead with the finding, not the setup. "Onboarding friction is your top driver of churn [id]."
2. Ground claims in insight data. Cite IDs inline: "[abc123]". {"Name the source survey too." if is_org else "Reference topics by name."}
3. One concrete number per sentence wherever the data supports it.
4. If data doesn't support the question, say so directly: "The data here doesn't show that yet."
5. End with 2-3 follow-up questions that would actually help — vary between diagnosis, action, and navigation.
6. NEVER cite an ID not listed above. NEVER invent data. To change survey questions → direct them to the survey builder (Copilot).

Return ONLY valid JSON — no markdown, no extra text.
IMPORTANT: cite using the FULL insight ID exactly as shown above (e.g. [ba58f64c-1234-5678-abcd-ef0123456789]).
Never shorten or truncate IDs — the frontend needs the exact UUID to look up the source.
{{
  "answer": "2-5 sentence answer. Cite full IDs inline: [ba58f64c-1234-5678-abcd-ef0123456789].",
  "citations": ["ba58f64c-1234-5678-abcd-ef0123456789"],
  "suggestions": ["Follow-up question?", "Navigation suggestion like: Explore [Survey Name] Intelligence"],
  "insight_refs": ["ba58f64c-1234-5678-abcd-ef0123456789"]
}}
"""


async def _generate_response(
    inp: CrystalInput,
    correction: str = "",
    current_tokens: int = 0,
) -> tuple[CrystalOutput, int]:
    """Single LLM call to generate Crystal's response. Returns (output, tokens_used)."""
    from agents.lib.constants import CRYSTAL_CONVERSATION_WINDOW
    system = _build_system_prompt(inp, correction=correction)

    prior_messages: list[dict] | None = None
    if inp.conversation_history:
        prior_messages = [
            {"role": str(m["role"])[:20], "content": str(m["content"])[:2000]}
            for m in inp.conversation_history[-CRYSTAL_CONVERSATION_WINDOW * 2:]
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]

    output, entry = await call_agent(
        agent_name="crystal",
        system=system,
        user=inp.message,
        output_schema=CrystalOutput,
        current_tokens=current_tokens,
        prior_messages=prior_messages,
    )
    return output, entry.input_tokens + entry.output_tokens


async def _run_crystal(inp: CrystalInput) -> CrystalOutput:
    """Generate Crystal's response with evaluator + hallucination filter + self-correction."""
    _, valid_ids = _build_insights_context(inp.insights)
    metrics_ctx = _build_metrics_context(inp.metrics, inp.survey_response_count)

    best_output: CrystalOutput | None = None
    best_score = -1
    correction = ""
    cumulative_tokens = 0

    for attempt in range(3):
        try:
            output, tokens_used = await _generate_response(inp, correction=correction, current_tokens=cumulative_tokens)
            cumulative_tokens += tokens_used
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
            eval_result.quality_score >= CRYSTAL_EVAL_PASS_THRESHOLD
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


# ── ReAct system prompt ───────────────────────────────────────────────────────

def _build_system_prompt_agentic(ctx, specialist_context: str = "") -> str:
    """Build the ReAct system prompt for Crystal with tool-use instructions."""
    from agents.lib.constants import CRYSTAL_MAX_TOOL_TURNS
    from agents.crystal.registry import TOOL_REGISTRY, get_tools_for_scope

    tools = get_tools_for_scope(ctx.scope)
    tool_list = "\n".join(
        f"- **{t['name']}**: {t['description']}"
        for t in tools
    )

    scope_framing = (
        "You have access to data across all surveys in this organization."
        if ctx.scope == "org"
        else "You have access to this survey's data including responses, insights, and metrics."
    )

    no_text_note = ""
    if not ctx.has_open_text:
        no_text_note = (
            "\n\nIMPORTANT: This survey has no open-text questions. "
            "Never discuss themes, topics, or verbatims. Focus only on score-based metrics."
        )

    specialist_block = f"\n\n## Domain Context\n{specialist_context}" if specialist_context else ""

    return f"""You are Crystal, an expert CX analyst with access to powerful data tools.
{scope_framing}{no_text_note}{specialist_block}

## Available Tools
{tool_list}

## Instructions
1. Use tools to retrieve relevant data before answering. Don't guess — look it up.
2. You may call up to {CRYSTAL_MAX_TOOL_TURNS} tools per conversation turn.
3. After gathering data, synthesize a clear, evidence-based answer.
4. Cite specific metrics, topic names, and verbatims in your answer.
5. Suggest 2-3 natural follow-up questions.
6. Return JSON: {{"answer": "...", "citations": [...], "suggestions": [...], "tool_results": [...]}}
"""


# ── ReAct loop (non-streaming) ────────────────────────────────────────────────

async def _run_react_loop(inp: CrystalInput, db_pool=None) -> CrystalOutput:
    """Execute the Crystal ReAct loop — multi-step tool calling + synthesis."""
    from agents.lib.constants import CRYSTAL_MAX_TOOL_TURNS, CRYSTAL_CONVERSATION_WINDOW
    from agents.crystal.context import CrystalContext
    from agents.crystal.tools import dispatch_tool
    from agents.crystal.registry import get_tool_by_name
    import redis.asyncio as _redis_mod
    import os

    ctx = CrystalContext(
        org_id=inp.org_id,
        user_id=inp.user_id or 'unknown',
        survey_id=inp.survey_id,
        scope=inp.scope,
        has_open_text=inp.has_open_text,
    )

    # Rate limit: 10 req/min per org — try/finally ensures connection is always closed
    try:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        r = await _redis_mod.from_url(redis_url)
        try:
            rate_key = f"crystal:{inp.org_id}:rpm"
            count = await r.incr(rate_key)
            if count == 1:
                await r.expire(rate_key, 60)
        finally:
            await r.close()
        if count > 10:
            raise ValueError("Rate limit exceeded: 10 requests per minute per org")
    except ValueError:
        raise
    except Exception:
        pass  # Redis not available — skip rate limiting

    system = _build_system_prompt_agentic(ctx)

    # Build conversation history
    history = [
        {"role": m["role"], "content": m["content"]}
        for m in (inp.conversation_history or [])[-CRYSTAL_CONVERSATION_WINDOW * 2:]
        if m.get("role") in ("user", "assistant")
    ]

    # Simple ReAct: call LLM, parse tool calls, execute, repeat up to max turns
    tool_results_accumulated = []
    current_context = inp.message

    best_output: CrystalOutput | None = None

    for turn in range(CRYSTAL_MAX_TOOL_TURNS):
        # Build tool results context block
        if tool_results_accumulated:
            context_block = "\n\n## Tool Results\n" + "\n".join(
                f"**{r['tool']}**:\n{_format_tool_result(r['tool'], r['result'])}"
                for r in tool_results_accumulated
            )
            current_context = inp.message + context_block

        try:
            output, _ = await call_agent(
                agent_name="crystal",
                system=system,
                user=current_context,
                output_schema=CrystalOutput,
                prior_messages=history if history else None,
            )
            best_output = output
        except Exception as exc:
            logger.warning("crystal_react_llm_failed", turn=turn, error=str(exc))
            break

        # Check if output has tool calls (stored in a special field or detected in answer)
        # For now, use the existing CrystalOutput and treat each turn as final
        # Real ReAct would parse tool_calls from the LLM response
        break

    if best_output is None:
        raise RuntimeError("Crystal ReAct loop produced no output")

    return best_output


# ── ReAct loop (streaming) ────────────────────────────────────────────────────

async def _run_react_loop_streaming(inp: CrystalInput, db_pool=None):
    """Streaming Crystal ReAct loop — yields SSE event JSON strings.

    Always yields at least one event so the HTTP stream never closes silently.
    Any startup exception (import failure, context error, etc.) is caught and
    emitted as an 'error' event rather than killing the generator silently.
    """
    import json as _json

    # Wrap entire body so any exception — including lazy import failures or
    # unexpected runtime errors before the first yield — surfaces as an SSE event.
    try:
        from agents.lib.constants import CRYSTAL_MAX_TOOL_TURNS, CRYSTAL_CONVERSATION_WINDOW
        from agents.crystal.context import CrystalContext
        from agents.crystal.tools import dispatch_tool
        from agents.crystal.registry import TOOL_REGISTRY, get_tools_for_scope
        import redis.asyncio as _redis_mod
        import os
    except Exception as _import_exc:
        logger.error("crystal_streaming_import_failed", error=str(_import_exc))
        yield _json.dumps({"type": "error", "message": "Crystal initialisation failed — agents service may need a restart."})
        return

    try:
        ctx = CrystalContext(
            org_id=inp.org_id,
            user_id=inp.user_id or 'unknown',
            survey_id=inp.survey_id,
            scope=inp.scope,
            has_open_text=inp.has_open_text,
        )
    except Exception as _ctx_exc:
        logger.error("crystal_streaming_context_failed", error=str(_ctx_exc))
        yield _json.dumps({"type": "error", "message": "Crystal context error — please try again."})
        return

    # Rate limit — try/finally ensures connection is always closed before first yield
    _rate_count = 0
    try:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        r = await _redis_mod.from_url(redis_url)
        try:
            rate_key = f"crystal:{inp.org_id}:rpm"
            _rate_count = await r.incr(rate_key)
            if _rate_count == 1:
                await r.expire(rate_key, 60)
        finally:
            await r.close()
    except Exception:
        pass  # Redis not available — skip rate limiting
    if _rate_count > 10:
        yield _json.dumps({"type": "error", "message": "Rate limit exceeded"})
        return

    # Select tools by keyword relevance to the user's question
    _q_lower = inp.message.lower()
    _all_tools = get_tools_for_scope(ctx.scope)
    _scored = []
    for _t in _all_tools:
        _s = sum(2 for kw in _t["name"].replace("_", " ").split() if kw in _q_lower)
        _s += sum(1 for w in _q_lower.split() if len(w) > 3 and w in (_t.get("description") or "").lower())
        _scored.append((_s, _t))
    _scored.sort(key=lambda x: x[0], reverse=True)
    tools_to_run = [t for _, t in _scored[:3]] or _all_tools[:3]
    tool_results = []

    for tool_def in tools_to_run[:CRYSTAL_MAX_TOOL_TURNS]:
        tool_name = tool_def["name"]
        yield _json.dumps({
            "type": "thinking",
            "tool": tool_name,
            "message": f"Checking {tool_name.replace('_', ' ')}...",
        })

        params = {}
        if ctx.survey_id:
            params["survey_id"] = ctx.survey_id

        try:
            result = await dispatch_tool(tool_name, ctx, params)
            summary = (
                f"Found {len(result)} fields of data"
                if isinstance(result, dict) and "error" not in result
                else result.get("error", "No data")
            )

            yield _json.dumps({
                "type": "observation",
                "tool": tool_name,
                "summary": str(summary)[:200],
            })

            if "error" not in result:
                tool_results.append({"tool": tool_name, "result": result})
        except Exception as exc:
            logger.warning("crystal_stream_tool_failed", tool=tool_name, error=str(exc))

        # Only run tools that are relevant; stop if we have enough data
        if len(tool_results) >= 3:
            break

    yield _json.dumps({"type": "synthesizing", "message": "Putting it all together..."})

    # Pass tool results as prior conversation context — not appended to user message
    tool_context_history = list(inp.conversation_history or [])
    if tool_results:
        tool_context_history.append({
            "role": "assistant",
            "content": "## Retrieved Data\n" + "\n".join(
                f"**{r['tool']}**:\n{_format_tool_result(r['tool'], r['result'])}"
                for r in tool_results
            ),
        })

    augmented_inp = CrystalInput(
        survey_id=inp.survey_id,
        org_id=inp.org_id,
        message=inp.message,
        insights=inp.insights,
        topics=inp.topics,
        survey_title=inp.survey_title,
        survey_response_count=inp.survey_response_count,
        metrics=inp.metrics,
        conversation_history=tool_context_history,
        user_id=inp.user_id,
        scope=inp.scope,
        has_open_text=inp.has_open_text,
    )

    try:
        final = await _run_crystal(augmented_inp)
        yield _json.dumps({
            "type": "answer",
            "answer": final.answer,
            "citations": final.citations,
            "suggestions": final.suggestions,
        })
    except Exception as exc:
        logger.error("crystal_stream_final_failed", error=str(exc))
        yield _json.dumps({"type": "error", "message": "Failed to generate answer"})


class CrystalAgent:
    """Thin agent wrapper — no BaseAgent needed since Crystal isn't in the graph."""

    async def run(self, inp: CrystalInput) -> tuple[CrystalOutput, list[dict]]:
        import os
        if os.getenv("CRYSTAL_STREAMING_ENABLED", "false").lower() == "true":
            output = await _run_react_loop(inp)
        else:
            output = await _run_crystal(inp)
        return output, []


# Module-level singleton
crystal_agent = CrystalAgent()
