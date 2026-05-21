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
                   SET messages = messages || %s::jsonb,
                       last_active_at = NOW(),
                       message_count = message_count + 1
                   WHERE id = %s""",
                (f"[{msg}]", thread_id),
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

    # Rate limit: 10 req/min per org
    try:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        r = await _redis_mod.from_url(redis_url)
        rate_key = f"crystal:{inp.org_id}:rpm"
        count = await r.incr(rate_key)
        if count == 1:
            await r.expire(rate_key, 60)
        if count > 10:
            await r.close()
            raise ValueError("Rate limit exceeded: 10 requests per minute per org")
        await r.close()
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
                f"**{r['tool']}**: {json.dumps(r['result'])[:500]}"
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
    """Streaming Crystal ReAct loop — yields SSE event JSON strings."""
    import json as _json
    from agents.lib.constants import CRYSTAL_MAX_TOOL_TURNS, CRYSTAL_CONVERSATION_WINDOW
    from agents.crystal.context import CrystalContext
    from agents.crystal.tools import dispatch_tool
    from agents.crystal.registry import TOOL_REGISTRY, get_tools_for_scope
    import redis.asyncio as _redis_mod
    import os

    ctx = CrystalContext(
        org_id=inp.org_id,
        user_id=inp.user_id or 'unknown',
        survey_id=inp.survey_id,
        scope=inp.scope,
        has_open_text=inp.has_open_text,
    )

    # Rate limit
    try:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        r = await _redis_mod.from_url(redis_url)
        rate_key = f"crystal:{inp.org_id}:rpm"
        count = await r.incr(rate_key)
        if count == 1:
            await r.expire(rate_key, 60)
        await r.close()
        if count > 10:
            yield _json.dumps({"type": "error", "message": "Rate limit exceeded"})
            return
    except Exception:
        pass

    # Collect data from relevant tools based on the question
    tools_to_run = get_tools_for_scope(ctx.scope)[:3]  # Run top 3 relevant tools
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

    # Generate final answer using accumulated tool results
    context_block = (
        "\n\n## Retrieved Data\n" + "\n".join(
            f"**{r['tool']}**: {_json.dumps(r['result'])[:800]}"
            for r in tool_results
        )
        if tool_results else ""
    )

    # Augment the input with tool results for final generation
    augmented_inp = CrystalInput(
        survey_id=inp.survey_id,
        org_id=inp.org_id,
        message=inp.message + context_block,
        insights=inp.insights,
        topics=inp.topics,
        survey_title=inp.survey_title,
        survey_response_count=inp.survey_response_count,
        metrics=inp.metrics,
        conversation_history=inp.conversation_history,
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
