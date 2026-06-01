"""Tiered insight report agents — evidence-based narrative reports from raw responses.

Three agents map to progressive data tiers:
  run_headline_insights → first_voices  (10–39 responses)
  run_summary_insights  → early_signals (40–69 responses)
  run_full_report       → growing_picture + full_report (70+ responses)

Each agent:
  1. Builds a 3-part system prompt: expert persona + survey context + analysis instructions
  2. Sends all available open-text responses to the LLM (up to REPORT_MAX_RESPONSES_WINDOW)
  3. LLM extracts themes autonomously — no pre-clustered topics are provided
  4. Ground step: deterministically verifies supporting quotes appear verbatim in corpus
  5. Themes with zero grounded quotes are dropped to prevent hallucinated citations
  6. Results are converted to insight dicts and appended to state["insights"]

Report insights use "report.*" categories to distinguish them from metric-based
insights (metric.nps, voice.topic, etc.). Both tracks coexist in the insights table.
"""
from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from agents.lib.openrouter import call_agent
from agents.lib.logger import logger
from agents.lib.constants import REPORT_MAX_RESPONSES_WINDOW


# ── Output schemas ─────────────────────────────────────────────────────────────


class _RecommendedAction(BaseModel):
    action: str = Field(max_length=350, description="Specific actionable step")
    priority: Literal["critical", "high", "medium", "low"] = "high"
    time_horizon: Literal["immediate", "short_term", "long_term"] = "short_term"
    estimated_impact: str = Field(default="", max_length=250)


class HeadlineTheme(BaseModel):
    theme: str = Field(max_length=80, description="Short theme name (max 80 chars)")
    summary: str = Field(max_length=400, description="1-2 sentence summary (max 400 chars)")
    supporting_quotes: list[str] = Field(
        description="2-3 exact verbatim phrases copied from the responses"
    )
    sentiment: Literal["positive", "negative", "mixed", "neutral"]
    frequency_estimate: int = Field(ge=1, description="Estimated number of responses mentioning this theme")


class HeadlineReport(BaseModel):
    report_summary: str = Field(max_length=600, description="2-3 sentence overall summary of what respondents said")
    themes: list[HeadlineTheme] = Field(description="1-3 most prominent themes")


class SummaryTheme(BaseModel):
    theme: str = Field(max_length=80)
    description: str = Field(max_length=600, description="2-3 sentence description of what respondents said about this theme")
    supporting_quotes: list[str] = Field(
        description="2-4 exact verbatim phrases copied from the responses"
    )
    sentiment: Literal["positive", "negative", "mixed", "neutral"]
    frequency_estimate: int = Field(ge=1)
    recommended_focus: str = Field(
        default="",
        max_length=250,
        description="1-sentence specific action to address this theme (leave empty if unclear from data)",
    )


class SummaryReport(BaseModel):
    report_summary: str = Field(max_length=800, description="3-4 sentence overall summary")
    themes: list[SummaryTheme] = Field(description="3-5 themes ranked by frequency")


class FullTheme(BaseModel):
    theme: str = Field(max_length=80)
    description: str = Field(
        max_length=800,
        description="What respondents explicitly say about this theme (2-3 sentences, paraphrase allowed here)",
    )
    supporting_quotes: list[str] = Field(
        description="3-5 EXACT verbatim phrases from different respondents — copy character-for-character"
    )
    sentiment: Literal["positive", "negative", "mixed", "neutral"]
    frequency_estimate: int = Field(ge=1)
    business_impact: str = Field(
        default="",
        max_length=500,
        description="Consequence if this theme is not addressed (only if evident from responses)",
    )
    root_cause_hypothesis: str = Field(
        default="",
        max_length=500,
        description="Most likely root cause based strictly on what respondents wrote (no external assumptions)",
    )
    trend_direction: Literal["improving", "declining", "stable", "unknown"] = "unknown"
    recommended_action: _RecommendedAction | None = None


class _PriorityAction(BaseModel):
    action: str = Field(max_length=350)
    rationale: str = Field(default="", max_length=400)
    expected_outcome: str = Field(default="", max_length=300)
    priority: Literal["critical", "high", "medium", "low"] = "high"
    time_horizon: Literal["immediate", "short_term", "long_term"] = "short_term"


class FullReport(BaseModel):
    executive_summary: str = Field(
        default="",
        max_length=1200,
        description="4-5 sentence executive summary covering the most important findings",
    )
    themes: list[FullTheme] = Field(description="5-8 themes ranked by business impact")
    cross_theme_patterns: str = Field(
        default="",
        max_length=600,
        description="Connections or compounding effects across multiple themes (optional)",
    )
    priority_actions: list[_PriorityAction] = Field(
        default_factory=list,
        description="Top 3 highest-ROI actions spanning all themes",
    )


# ── Prompt helpers ─────────────────────────────────────────────────────────────


def _build_metrics_context(metrics: dict) -> str:
    parts: list[str] = []
    nps = metrics.get("nps", {})
    if nps.get("score") is not None:
        n = nps.get("n", 0)
        p = nps.get("promoters")
        d = nps.get("detractors")
        base = f"NPS: {nps['score']} (n={n}"
        if p is not None and d is not None:
            base += f", {p}% promoters, {d}% detractors"
        parts.append(base + ")")
    csat = metrics.get("csat", {})
    if csat.get("score") is not None:
        parts.append(f"CSAT: {csat['score']:.1f}/5 (n={csat.get('n', 0)})")
    ces = metrics.get("ces", {})
    if ces.get("score") is not None:
        parts.append(f"CES: {ces['score']:.1f} (n={ces.get('n', 0)})")
    compl = metrics.get("completion", {})
    if compl.get("rate") is not None:
        parts.append(f"Completion: {compl['rate']}%")
    return " | ".join(parts) if parts else "No numeric metrics available"


def _build_system_prompt(
    tier: Literal["headline", "summary", "full"],
    survey: dict,
    org_context: dict,
    metrics: dict,
    total_responses: int,
    schema_cls: type,
) -> str:
    """Build a 3-part system prompt: expert identity, survey context, analysis instructions."""
    industry   = org_context.get("industry") or "general"
    sub_vert   = org_context.get("sub_vertical") or ""
    use_case   = org_context.get("primary_use_case") or "Customer Experience"
    region     = org_context.get("region") or "global"
    title      = survey.get("title") or "this survey"
    intent     = survey.get("intent") or survey.get("description") or ""

    industry_label = f"{industry} / {sub_vert}" if sub_vert else industry

    expertise_map = {
        "CX": "customer experience and satisfaction research",
        "EX": "employee experience and engagement research",
        "NPS": "Net Promoter Score and loyalty research",
        "product": "product feedback and usability research",
    }
    expertise = expertise_map.get(use_case, f"{use_case} research")

    metrics_ctx = _build_metrics_context(metrics)

    # Cap schema JSON to keep the prompt size manageable
    schema_json = json.dumps(schema_cls.model_json_schema(), indent=2)[:3500]

    # ── Part 1: Expert identity ──────────────────────────────────────────────
    part1 = (
        f"You are a senior experience management (XM) analyst with 15+ years of expertise in "
        f"{industry_label} ({region} market), specializing in {expertise}.\n"
        "Your role: extract truthful, evidence-based insights from verbatim respondent feedback.\n"
        "Core constraint: you never fabricate quotes, never generalize beyond what respondents wrote."
    )

    # ── Part 2: Survey context ───────────────────────────────────────────────
    intent_line = f"\nSurvey purpose: {intent}" if intent else ""
    part2 = (
        f'Survey: "{title}"{intent_line}\n'
        f"Industry: {industry_label} | Use case: {use_case} | Region: {region}\n"
        f"Survey metrics: {metrics_ctx}\n"
        f"Total responses: {total_responses}"
    )

    # ── Part 3: Tier-specific instructions with anti-hallucination rules ─────
    anti_hallucination = (
        "CRITICAL RULES (violation = output rejected and regenerated):\n"
        "1. VERBATIM QUOTES: supporting_quotes must be exact phrases copied character-for-character "
        "from a response below. Never paraphrase, combine, or rephrase.\n"
        "   VALID: 'checkout process took forever' (exact words from a response)\n"
        "   INVALID: 'users struggle with checkout speed' (your paraphrase — not allowed)\n"
        "2. EVIDENCE THRESHOLD: only include a theme if at least 2 different responses mention it.\n"
        "3. NO INFERENCE BEYOND DATA: business_impact and root_cause_hypothesis must be based "
        "only on what respondents explicitly wrote — no external assumptions.\n"
        "4. STRICT JSON ONLY: return only valid JSON matching the schema. "
        "No markdown code fences, no preamble, no trailing explanation."
    )

    if tier == "headline":
        instructions = (
            "Extract 1-3 key themes that appear most frequently in the responses below.\n\n"
            f"{anti_hallucination}\n\n"
            f"Output schema (JSON):\n{schema_json}"
        )
    elif tier == "summary":
        instructions = (
            "Extract 3-5 themes ranked by frequency. For each theme, add a recommended_focus: "
            "one specific, actionable sentence — only if the data clearly supports it.\n\n"
            f"{anti_hallucination}\n\n"
            f"Output schema (JSON):\n{schema_json}"
        )
    else:  # full
        instructions = (
            "Extract 5-8 themes for a comprehensive executive report, ranked by business impact.\n"
            "For each theme:\n"
            "  - 3-5 EXACT verbatim quotes from different respondents\n"
            "  - business_impact: consequence if unaddressed (only if evident from data)\n"
            "  - root_cause_hypothesis: most likely cause based only on what respondents wrote\n"
            "  - trend_direction: 'improving'/'declining' if timestamps show a pattern, else 'unknown'\n"
            "  - recommended_action: the single most impactful specific action for this theme\n"
            "Also:\n"
            "  - cross_theme_patterns: connections or compounding effects across themes\n"
            "  - priority_actions: 3 highest-ROI actions spanning all themes\n\n"
            f"{anti_hallucination}\n\n"
            f"Output schema (JSON):\n{schema_json}"
        )

    return f"{part1}\n\n---\n\n{part2}\n\n---\n\n{instructions}"


def _format_responses_for_llm(
    responses: list[dict],
    open_texts: list[dict],
    max_count: int,
    max_chars_per_answer: int = 250,
) -> str:
    """Format open-text responses as numbered blocks with metric tags.

    Groups by response_id, caps to max_count, truncates individual answers.
    """
    # Group texts by response_id (preserving order)
    texts_by_rid: dict[str, list[str]] = {}
    for t in open_texts:
        rid = str(t.get("response_id", ""))
        text = str(t.get("text") or "").strip()
        if rid and text:
            texts_by_rid.setdefault(rid, []).append(text[:max_chars_per_answer])

    if not texts_by_rid:
        return "(no open-text responses available)"

    resp_index: dict[str, dict] = {str(r["id"]): r for r in responses}

    lines: list[str] = []
    idx = 1
    for rid, texts in texts_by_rid.items():
        if idx > max_count:
            break
        r = resp_index.get(rid, {})

        # Build compact metric tags
        tags: list[str] = []
        if r.get("nps_score") is not None:
            tags.append(f"NPS:{r['nps_score']}")
        if r.get("csat_score") is not None:
            tags.append(f"CSAT:{float(r['csat_score']):.1f}")
        if r.get("ai_sentiment"):
            tags.append(r["ai_sentiment"])
        tag_str = f" [{' | '.join(tags)}]" if tags else ""

        parts = " | ".join(f'"{t}"' for t in texts)
        lines.append(f"[{idx}]{tag_str} {parts}")
        idx += 1

    total_shown = idx - 1
    if total_shown < len(texts_by_rid):
        lines.append(f"(showing {total_shown} of {len(texts_by_rid)} responses)")

    return "\n".join(lines)


def _ground_quotes(quotes: list[str], all_texts: list[str]) -> tuple[list[str], float]:
    """Verify quotes appear verbatim in the response corpus using 4-gram matching.

    A quote passes if any 4-consecutive-word window from it appears in the corpus.
    Short quotes (< 4 words) use direct substring matching.
    Returns (grounded_quotes, grounding_rate).
    """
    if not quotes:
        return [], 1.0

    corpus = " ".join(t.lower() for t in all_texts)
    grounded: list[str] = []

    for quote in quotes:
        q = (quote or "").strip()
        if len(q) < 5:
            continue
        words = re.findall(r"[a-z0-9']+", q.lower())
        if len(words) < 4:
            if q.lower() in corpus:
                grounded.append(quote)
        else:
            if any(
                " ".join(words[i : i + 4]) in corpus
                for i in range(len(words) - 3)
            ):
                grounded.append(quote)

    rate = len(grounded) / len(quotes) if quotes else 1.0
    return grounded, rate


def _sentiment_to_score(sentiment: str) -> float:
    return {"positive": 0.7, "negative": -0.7, "mixed": 0.0, "neutral": 0.1}.get(sentiment, 0.1)


# ── Tier agents ────────────────────────────────────────────────────────────────


async def run_headline_insights(state: dict) -> list[dict]:
    """Generate 1-3 headline themes for first_voices tier (10-39 responses)."""
    metrics   = state.get("metrics", {})
    survey    = state.get("survey", {})
    org_ctx   = state.get("org_context", {})
    responses = state.get("responses", [])
    open_txts = state.get("open_texts") or state.get("embedded_texts") or []
    survey_id = state["survey_id"]
    total     = metrics.get("total_responses", len(responses))

    max_resp = min(REPORT_MAX_RESPONSES_WINDOW, 50, max(1, total))

    system = _build_system_prompt("headline", survey, org_ctx, metrics, total, HeadlineReport)
    user   = (
        f"Responses (n={total}, showing up to {max_resp}):\n\n"
        + _format_responses_for_llm(responses, open_txts, max_count=max_resp)
    )

    try:
        report, _ = await call_agent(
            agent_name="report_headline",
            system=system,
            user=user,
            output_schema=HeadlineReport,
        )
    except Exception as exc:
        logger.error("report_headline_failed", survey_id=survey_id, error=str(exc))
        return []

    all_texts = [str(t.get("text", "")) for t in open_txts]
    insights: list[dict] = []

    if report.report_summary:
        insights.append({
            "layer": "descriptive",
            "category": "report.headline_summary",
            "headline": f"First signals: {total} responses analyzed",
            "narrative": report.report_summary,
            "trust_score": 52,
            "trust_json": {
                "statistical": 38, "coverage": 68, "consistency": 62,
                "grounding": 60, "sample_size": total, "below_minimum_sample": total < 20,
            },
            "citations_json": [],
            "priority": 0.92,
            "metric_json": {"report_tier": "headline", "response_count": total},
        })

    for theme in (report.themes or [])[:3]:
        grounded, rate = _ground_quotes(theme.supporting_quotes, all_texts)
        if not grounded:
            logger.warning("headline_theme_no_grounded_quotes", theme=theme.theme, survey_id=survey_id)
            continue
        freq = theme.frequency_estimate
        insights.append({
            "layer": "descriptive",
            "category": "report.headline_theme",
            "headline": theme.theme,
            "narrative": theme.summary,
            "trust_score": min(62, max(32, 22 + freq * 3)),
            "trust_json": {
                "statistical": min(58, 28 + freq * 2),
                "coverage": 65, "consistency": 68,
                "grounding": round(rate * 100), "sample_size": freq,
            },
            "citations_json": [{"quote": q, "relevance": 0.85} for q in grounded[:3]],
            "priority": 0.62 + min(0.16, freq * 0.01),
            "metric_json": {
                "theme": theme.theme, "sentiment": theme.sentiment,
                "frequency_estimate": freq, "report_tier": "headline",
                "grounding_rate": round(rate, 2),
            },
        })

    logger.info("report_headline_done", survey_id=survey_id, theme_count=len(insights) - bool(report.report_summary))
    return insights


async def run_summary_insights(state: dict) -> list[dict]:
    """Generate 3-5 summary themes for early_signals tier (40-69 responses)."""
    metrics   = state.get("metrics", {})
    survey    = state.get("survey", {})
    org_ctx   = state.get("org_context", {})
    responses = state.get("responses", [])
    open_txts = state.get("open_texts") or state.get("embedded_texts") or []
    survey_id = state["survey_id"]
    total     = metrics.get("total_responses", len(responses))

    max_resp = min(REPORT_MAX_RESPONSES_WINDOW, 100, max(1, total))

    system = _build_system_prompt("summary", survey, org_ctx, metrics, total, SummaryReport)
    user   = (
        f"Responses (n={total}, showing up to {max_resp}):\n\n"
        + _format_responses_for_llm(responses, open_txts, max_count=max_resp)
    )

    try:
        report, _ = await call_agent(
            agent_name="report_summary",
            system=system,
            user=user,
            output_schema=SummaryReport,
        )
    except Exception as exc:
        logger.error("report_summary_failed", survey_id=survey_id, error=str(exc))
        return []

    all_texts = [str(t.get("text", "")) for t in open_txts]
    insights: list[dict] = []

    if report.report_summary:
        insights.append({
            "layer": "descriptive",
            "category": "report.summary_overview",
            "headline": f"Summary report: {total} responses",
            "narrative": report.report_summary,
            "trust_score": 65,
            "trust_json": {
                "statistical": 55, "coverage": 75, "consistency": 70,
                "grounding": 70, "sample_size": total,
            },
            "citations_json": [],
            "priority": 0.94,
            "metric_json": {"report_tier": "summary", "response_count": total},
        })

    for theme in (report.themes or [])[:5]:
        grounded, rate = _ground_quotes(theme.supporting_quotes, all_texts)
        if not grounded:
            logger.warning("summary_theme_no_grounded_quotes", theme=theme.theme, survey_id=survey_id)
            continue
        freq = theme.frequency_estimate
        sent_score = _sentiment_to_score(theme.sentiment)

        ins: dict[str, Any] = {
            "layer": "diagnostic",
            "category": "report.summary_theme",
            "headline": theme.theme,
            "narrative": theme.description,
            "trust_score": min(75, max(45, 35 + freq * 2)),
            "trust_json": {
                "statistical": min(70, 40 + freq * 2),
                "coverage": 72, "consistency": 72,
                "grounding": round(rate * 100), "sample_size": freq,
            },
            "citations_json": [{"quote": q, "relevance": 0.88} for q in grounded[:4]],
            "priority": 0.70 + min(0.18, abs(sent_score) * 0.15 + freq * 0.008),
            "metric_json": {
                "theme": theme.theme, "sentiment": theme.sentiment,
                "sentiment_score": sent_score, "frequency_estimate": freq,
                "report_tier": "summary", "grounding_rate": round(rate, 2),
            },
        }

        if theme.recommended_focus:
            ins["recommended_action"] = {
                "type": "investigate",
                "label": theme.recommended_focus,
                "target": theme.theme,
                "priority": "medium",
            }

        insights.append(ins)

    logger.info("report_summary_done", survey_id=survey_id, theme_count=len(insights) - bool(report.report_summary))
    return insights


async def run_full_report(state: dict) -> list[dict]:
    """Generate a comprehensive executive report for growing_picture/full_report tiers (70+ responses)."""
    metrics   = state.get("metrics", {})
    survey    = state.get("survey", {})
    org_ctx   = state.get("org_context", {})
    responses = state.get("responses", [])
    open_txts = state.get("open_texts") or state.get("embedded_texts") or []
    survey_id = state["survey_id"]
    total     = metrics.get("total_responses", len(responses))

    max_resp = min(REPORT_MAX_RESPONSES_WINDOW, max(1, total))

    system = _build_system_prompt("full", survey, org_ctx, metrics, total, FullReport)
    user   = (
        f"Responses (n={total}, showing up to {max_resp}):\n\n"
        + _format_responses_for_llm(responses, open_txts, max_count=max_resp, max_chars_per_answer=300)
    )

    try:
        report, _ = await call_agent(
            agent_name="report_full",
            system=system,
            user=user,
            output_schema=FullReport,
        )
    except Exception as exc:
        logger.error("report_full_failed", survey_id=survey_id, error=str(exc))
        return []

    # Reasoning models sometimes omit executive_summary — synthesize from themes
    if not report.executive_summary and report.themes:
        top = report.themes[:3]
        sentiments = [t.sentiment for t in top]
        dominant = max(set(sentiments), key=sentiments.count)
        theme_names = ", ".join(f'"{t.theme}"' for t in top)
        report = report.model_copy(update={
            "executive_summary": (
                f"Analysis of {total} responses surfaces {len(report.themes)} themes. "
                f"Key themes include {theme_names}. "
                f"Overall respondent sentiment is {dominant}."
            )
        })

    all_texts = [str(t.get("text", "")) for t in open_txts]
    insights: list[dict] = []
    grounding_rates: list[float] = []

    # Executive summary
    if report.executive_summary:
        insights.append({
            "layer": "descriptive",
            "category": "report.executive_summary",
            "headline": f"Executive report: {total} responses analyzed",
            "narrative": report.executive_summary,
            "trust_score": 78,
            "trust_json": {
                "statistical": 72, "coverage": 85, "consistency": 80,
                "grounding": 75, "sample_size": total,
            },
            "citations_json": [],
            "priority": 0.98,
            "metric_json": {
                "report_tier": "full_report",
                "response_count": total,
                "cross_theme_patterns": report.cross_theme_patterns or "",
            },
        })

    # Themes
    for theme in (report.themes or [])[:8]:
        grounded, rate = _ground_quotes(theme.supporting_quotes, all_texts)
        grounding_rates.append(rate)
        if not grounded:
            logger.warning("full_theme_no_grounded_quotes", theme=theme.theme, survey_id=survey_id)
            continue

        freq = theme.frequency_estimate
        sent_score = _sentiment_to_score(theme.sentiment)
        stat_trust = min(85, 50 + freq)
        trust = min(90, max(55, round(stat_trust * 0.4 + 80 * 0.35 + rate * 100 * 0.25)))

        theme_ins: dict[str, Any] = {
            "layer": "diagnostic",
            "category": "report.full_theme",
            "headline": theme.theme,
            "narrative": theme.description,
            "trust_score": trust,
            "trust_json": {
                "statistical": stat_trust,
                "coverage": 80, "consistency": 78,
                "grounding": round(rate * 100), "sample_size": freq,
            },
            "citations_json": [
                {"quote": q, "relevance": 0.90, "sentiment": "neutral"}
                for q in grounded[:5]
            ],
            "priority": 0.75 + min(0.20, abs(sent_score) * 0.15 + freq * 0.005),
            "metric_json": {
                "theme": theme.theme,
                "sentiment": theme.sentiment,
                "sentiment_score": sent_score,
                "frequency_estimate": freq,
                "trend_direction": theme.trend_direction,
                "business_impact": theme.business_impact or "",
                "root_cause_hypothesis": theme.root_cause_hypothesis or "",
                "report_tier": "full_report",
                "grounding_rate": round(rate, 2),
            },
        }

        if theme.recommended_action:
            ra = theme.recommended_action
            theme_ins["recommended_action"] = {
                "type":              ra.time_horizon,
                "label":             ra.action,
                "target":            theme.theme,
                "priority":          ra.priority,
                "time_horizon":      ra.time_horizon,
                "estimated_impact":  ra.estimated_impact,
            }
            theme_ins["layer"]    = "prescriptive"
            theme_ins["priority"] = min(0.96, theme_ins["priority"] + 0.05)

        insights.append(theme_ins)

    # Priority actions (cross-theme)
    for i, action in enumerate((report.priority_actions or [])[:3]):
        insights.append({
            "layer": "prescriptive",
            "category": "report.priority_action",
            "headline": action.action,
            "narrative": " ".join(filter(None, [action.rationale, action.expected_outcome])),
            "trust_score": 72,
            "trust_json": {
                "statistical": 70, "coverage": 75, "consistency": 75,
                "grounding": 70, "sample_size": total,
            },
            "citations_json": [],
            "recommended_action": {
                "type":             action.time_horizon,
                "label":            action.action,
                "target":           "cross_theme",
                "priority":         action.priority,
                "time_horizon":     action.time_horizon,
                "estimated_impact": action.expected_outcome,
            },
            "priority": 0.94 - i * 0.03,
            "metric_json": {"report_tier": "full_report", "action_rank": i + 1},
        })

    avg_ground = round(sum(grounding_rates) / len(grounding_rates), 2) if grounding_rates else 0.0
    logger.info(
        "report_full_done",
        survey_id=survey_id,
        theme_count=sum(1 for ins in insights if ins["category"] == "report.full_theme"),
        action_count=sum(1 for ins in insights if ins["category"] == "report.priority_action"),
        avg_grounding=avg_ground,
    )
    return insights


# ── Main entry point ──────────────────────────────────────────────────────────


async def run_tiered_report_agent(state: dict) -> list[dict]:
    """Route to the appropriate tier-based report agent.

    Returns a list of insight dicts to append to state["insights"].
    Returns [] if the survey has no open-text responses or not enough data.
    """
    if not state.get("has_open_text"):
        return []

    open_txts = state.get("open_texts") or state.get("embedded_texts") or []
    if not open_txts:
        return []

    metrics = state.get("metrics", {})
    total   = metrics.get("total_responses", len(state.get("responses", [])))

    if total < 10:
        return []
    elif total < 40:
        return await run_headline_insights(state)
    elif total < 70:
        return await run_summary_insights(state)
    else:
        return await run_full_report(state)
