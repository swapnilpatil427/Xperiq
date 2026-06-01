"""Tiered insight report agents — evidence-based narrative reports synthesizing
pre-computed topic signals into progressive tiers.

Design: the LLM *narrates known topics*, not re-discovers them from scratch.
Topic signals (NPS impact, verbatims, sentiment, effort) come from node_topics
via compute_full_topic_signals, which is already grounded, deterministic, and
has no hallucination risk. The LLM's job is to weave them into a coherent story.

Three tiers map to progressive response thresholds:
  run_headline_insights → first_voices  (10–39 responses, 1-3 themes)
  run_summary_insights  → early_signals (40–69 responses, 3-5 themes)
  run_full_report       → growing_picture / full_report (70+ responses)

Trust scores are computed dynamically from actual data (sample size, grounding rate,
coverage) rather than hardcoded tier constants.

Report insights use "report.*" categories to coexist with metric-based Track 1
insights. The node_merge_tracks step later fuses them where topics overlap.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from agents.lib.openrouter import call_agent
from agents.lib.logger import logger
from agents.lib.constants import REPORT_MAX_RESPONSES_WINDOW, REPORT_REGEN_MIN_NEW_RESPONSES
from agents.tools.metrics import is_meaningful_text


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
        description="2-3 exact verbatim phrases from the provided top_verbatims"
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
        description="2-4 exact verbatim phrases from the provided top_verbatims"
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
        description="What respondents explicitly say about this theme (2-3 sentences)",
    )
    supporting_quotes: list[str] = Field(
        description="3-5 exact verbatim phrases from different respondents — use ONLY quotes from the provided top_verbatims"
    )
    sentiment: Literal["positive", "negative", "mixed", "neutral"]
    frequency_estimate: int = Field(ge=1)
    business_impact: str = Field(
        default="",
        max_length=500,
        description="Consequence if this theme is not addressed (only if evident from signals)",
    )
    root_cause_hypothesis: str = Field(
        default="",
        max_length=500,
        description="Most likely root cause based strictly on the signals provided (no external assumptions)",
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


# ── Dynamic trust score computation ────────────────────────────────────────────


def _compute_trust_score(
    total_responses: int,
    grounding_rate: float,
    freq_estimate: int,
    tier: str,
) -> tuple[int, dict]:
    """Compute trust score dynamically from actual data — no hardcoded tier constants.

    Components:
      statistical: confidence from sample size (grows with total_responses)
      coverage:    fraction of responses that mention this theme
      consistency: proxy for how stable/mature the signal is
      grounding:   fraction of quotes that were verified in the verbatim corpus
    """
    # Statistical confidence grows with log of sample size; plateaus at high n
    statistical = min(90, max(15, round(10 + 30 * math.log10(max(1, total_responses)))))
    # Coverage: what fraction of respondents mention this theme
    coverage_frac = freq_estimate / max(1, total_responses)
    coverage = min(90, max(25, round(coverage_frac * 200)))  # 200x so 20% coverage → 40
    # Consistency: proxy from total responses (more data → more stable signal)
    consistency = min(88, max(40, round(50 + 20 * math.log10(max(1, total_responses)))))
    # Grounding: directly from the verified quote rate
    grounding = round(min(100, max(0, grounding_rate * 100)))

    score = round(
        statistical * 0.30
        + coverage   * 0.25
        + consistency * 0.20
        + grounding  * 0.25
    )
    score = max(20, min(95, score))

    return score, {
        "statistical":  statistical,
        "coverage":     coverage,
        "consistency":  consistency,
        "grounding":    grounding,
        "sample_size":  total_responses,
        "below_minimum_sample": total_responses < 20,
    }


# ── Topic signal formatting ────────────────────────────────────────────────────


def _format_topic_signals_for_llm(
    topics_for_tier: list[dict],
    metrics: dict,
) -> str:
    """Format pre-computed topic signals into an LLM-readable block.

    Each topic entry is a merged dict of TopicItem fields + compute_full_topic_signals output.
    Quotes come from top_verbatims (already filtered by is_meaningful_text and select_top_verbatims).
    """
    nps_context = ""
    nps_score = metrics.get("nps", {}).get("score")
    if nps_score is not None:
        nps_context = f"Survey NPS: {nps_score}"
    csat_score = metrics.get("csat", {}).get("score")
    if csat_score is not None:
        nps_context += f" | CSAT: {csat_score}/5" if nps_context else f"CSAT: {csat_score}/5"

    lines: list[str] = []
    if nps_context:
        lines.append(f"Survey metrics: {nps_context}")
        lines.append("")

    for i, t in enumerate(topics_for_tier, 1):
        name        = t.get("name", "Unknown")
        volume      = t.get("response_count") or t.get("volume", 0)
        sentiment   = t.get("avg_sentiment_score", 0.0)
        emotion     = t.get("dominant_emotion", "neutral")
        effort      = t.get("avg_effort_score") or t.get("effort_score", 4.0)
        nps_impact  = t.get("nps_impact")
        urgency     = t.get("urgency_score", 0.0)
        trending    = t.get("trending", "stable")
        is_new      = t.get("is_new", False)
        verbatims   = t.get("top_verbatims", [])

        # Sentiment label
        if sentiment <= -0.3:
            sent_label = "negative"
        elif sentiment >= 0.3:
            sent_label = "positive"
        elif abs(sentiment) < 0.1:
            sent_label = "neutral"
        else:
            sent_label = "mixed"

        nps_impact_str = f", NPS impact={nps_impact:+.1f}" if nps_impact is not None else ""
        new_flag = " [NEW]" if is_new else ""
        trending_flag = f" [TRENDING {trending.upper()}]" if trending in ("up", "down") else ""

        lines.append(
            f"[{i}] {name}{new_flag}{trending_flag} — "
            f"vol={volume}, sentiment={sent_label}({sentiment:.2f}), "
            f"emotion={emotion}, effort={effort:.1f}/7, "
            f"urgency={urgency:.1f}{nps_impact_str}"
        )

        # Include real verbatims from topic_signals (already filtered + grounded)
        real_quotes = [
            v["text"] for v in verbatims
            if v.get("text") and is_meaningful_text(v["text"])
        ][:4]
        if real_quotes:
            for q in real_quotes:
                lines.append(f'  Quote: "{q[:200]}"')
        lines.append("")

    return "\n".join(lines)


def _sentiment_to_score(sentiment: str) -> float:
    return {"positive": 0.7, "negative": -0.7, "mixed": 0.0, "neutral": 0.1}.get(sentiment, 0.1)


# ── Tier agents ────────────────────────────────────────────────────────────────


async def run_headline_insights(state: dict) -> list[dict]:
    """Generate 1-3 headline themes for first_voices tier (10-39 responses).

    Uses pre-computed topic signals — does NOT re-discover topics from raw text.
    """
    metrics    = state.get("metrics", {})
    survey     = state.get("survey", {})
    org_ctx    = state.get("org_context", {})
    topic_sigs = state.get("topic_signals", {})
    survey_id  = state["survey_id"]
    total      = metrics.get("total_responses", len(state.get("responses", [])))

    # Sort topics by urgency descending, take top 3 for headline
    all_topics = _build_sorted_topic_list(topic_sigs, max_topics=3)
    if not all_topics:
        return []

    industry  = org_ctx.get("industry") or "general"
    use_case  = org_ctx.get("primary_use_case") or "CX"
    title     = survey.get("title") or "this survey"
    intent    = survey.get("intent") or survey.get("description") or ""
    intent_line = f"\nSurvey purpose: {intent}" if intent else ""

    system = (
        f"You are a senior {industry} experience analyst specializing in {use_case} research.\n"
        f'Survey: "{title}"{intent_line}\n'
        f"Total responses: {total}\n\n"
        "TASK: Synthesize the topic signals below into 1-3 key themes. "
        "Use ONLY the quotes provided under each topic — do not invent quotes. "
        "Return valid JSON only, no markdown.\n\n"
        f"JSON schema:\n{json.dumps(HeadlineReport.model_json_schema(), indent=2)[:2000]}"
    )
    user = (
        f"Topic signals ({len(all_topics)} topics, {total} total responses):\n\n"
        + _format_topic_signals_for_llm(all_topics, metrics)
        + "\n\nWrite a report_summary and 1-3 headline themes. "
        "supporting_quotes must be exact phrases from the quotes shown above."
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

    # Build verbatim corpus from top_verbatims (already filtered — no synthetic labels)
    all_texts = _collect_verbatim_corpus(topic_sigs)
    insights: list[dict] = []

    if report.report_summary:
        trust, trust_json = _compute_trust_score(total, 1.0, total, "headline")
        insights.append({
            "layer":          "descriptive",
            "category":       "report.headline_summary",
            "headline":       f"First signals: {total} responses analyzed",
            "narrative":      report.report_summary,
            "trust_score":    trust,
            "trust_json":     {**trust_json, "grounding": 100},
            "citations_json": [],
            "priority":       0.92,
            "metric_json":    {"report_tier": "headline", "response_count": total},
        })

    for theme in (report.themes or [])[:3]:
        grounded, rate = _ground_quotes_against_corpus(theme.supporting_quotes, all_texts)
        if not grounded:
            logger.warning("headline_theme_no_grounded_quotes", theme=theme.theme, survey_id=survey_id)
            continue
        freq = theme.frequency_estimate
        trust, trust_json = _compute_trust_score(total, rate, freq, "headline")
        insights.append({
            "layer":          "descriptive",
            "category":       "report.headline_theme",
            "headline":       theme.theme,
            "narrative":      theme.summary,
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [{"quote": q, "relevance": 0.88} for q in grounded[:3]],
            "priority":       0.62 + min(0.16, freq * 0.01),
            "metric_json":    {
                "theme":              theme.theme,
                "sentiment":          theme.sentiment,
                "frequency_estimate": freq,
                "report_tier":        "headline",
                "grounding_rate":     round(rate, 2),
            },
        })

    logger.info("report_headline_done", survey_id=survey_id,
                theme_count=len([i for i in insights if i["category"] == "report.headline_theme"]))
    return insights


async def run_summary_insights(state: dict) -> list[dict]:
    """Generate 3-5 summary themes for early_signals tier (40-69 responses)."""
    metrics    = state.get("metrics", {})
    survey     = state.get("survey", {})
    org_ctx    = state.get("org_context", {})
    topic_sigs = state.get("topic_signals", {})
    survey_id  = state["survey_id"]
    total      = metrics.get("total_responses", len(state.get("responses", [])))

    all_topics = _build_sorted_topic_list(topic_sigs, max_topics=5)
    if not all_topics:
        return []

    industry  = org_ctx.get("industry") or "general"
    use_case  = org_ctx.get("primary_use_case") or "CX"
    title     = survey.get("title") or "this survey"
    intent    = survey.get("intent") or survey.get("description") or ""
    intent_line = f"\nSurvey purpose: {intent}" if intent else ""

    system = (
        f"You are a senior {industry} experience analyst specializing in {use_case} research.\n"
        f'Survey: "{title}"{intent_line}\n'
        f"Total responses: {total}\n\n"
        "TASK: Synthesize the topic signals below into 3-5 themes with actionable focus areas. "
        "Use ONLY the quotes provided under each topic. "
        "Return valid JSON only, no markdown.\n\n"
        f"JSON schema:\n{json.dumps(SummaryReport.model_json_schema(), indent=2)[:2500]}"
    )
    user = (
        f"Topic signals ({len(all_topics)} topics, {total} total responses):\n\n"
        + _format_topic_signals_for_llm(all_topics, metrics)
        + "\n\nWrite a report_summary and 3-5 themes ranked by frequency. "
        "For each theme with a clear action, set recommended_focus to a specific 1-sentence step. "
        "supporting_quotes must be exact phrases from the quotes shown above."
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

    all_texts = _collect_verbatim_corpus(topic_sigs)
    insights: list[dict] = []

    if report.report_summary:
        trust, trust_json = _compute_trust_score(total, 1.0, total, "summary")
        insights.append({
            "layer":          "descriptive",
            "category":       "report.summary_overview",
            "headline":       f"Summary report: {total} responses",
            "narrative":      report.report_summary,
            "trust_score":    trust,
            "trust_json":     {**trust_json, "grounding": 100},
            "citations_json": [],
            "priority":       0.94,
            "metric_json":    {"report_tier": "summary", "response_count": total},
        })

    for theme in (report.themes or [])[:5]:
        grounded, rate = _ground_quotes_against_corpus(theme.supporting_quotes, all_texts)
        if not grounded:
            logger.warning("summary_theme_no_grounded_quotes", theme=theme.theme, survey_id=survey_id)
            continue
        freq = theme.frequency_estimate
        sent_score = _sentiment_to_score(theme.sentiment)
        trust, trust_json = _compute_trust_score(total, rate, freq, "summary")

        ins: dict[str, Any] = {
            "layer":          "diagnostic",
            "category":       "report.summary_theme",
            "headline":       theme.theme,
            "narrative":      theme.description,
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [{"quote": q, "relevance": 0.88} for q in grounded[:4]],
            "priority":       0.70 + min(0.18, abs(sent_score) * 0.15 + freq * 0.008),
            "metric_json":    {
                "theme":              theme.theme,
                "sentiment":          theme.sentiment,
                "sentiment_score":    sent_score,
                "frequency_estimate": freq,
                "report_tier":        "summary",
                "grounding_rate":     round(rate, 2),
            },
        }
        if theme.recommended_focus:
            ins["recommended_action"] = {
                "type":     "investigate",
                "label":    theme.recommended_focus,
                "target":   theme.theme,
                "priority": "medium",
            }
        insights.append(ins)

    logger.info("report_summary_done", survey_id=survey_id,
                theme_count=len([i for i in insights if i["category"] == "report.summary_theme"]))
    return insights


async def run_full_report(state: dict) -> list[dict]:
    """Generate a comprehensive executive report for growing_picture/full_report tiers (70+ responses)."""
    metrics    = state.get("metrics", {})
    survey     = state.get("survey", {})
    org_ctx    = state.get("org_context", {})
    topic_sigs = state.get("topic_signals", {})
    survey_id  = state["survey_id"]
    total      = metrics.get("total_responses", len(state.get("responses", [])))

    all_topics = _build_sorted_topic_list(topic_sigs, max_topics=8)
    if not all_topics:
        return []

    industry  = org_ctx.get("industry") or "general"
    use_case  = org_ctx.get("primary_use_case") or "CX"
    title     = survey.get("title") or "this survey"
    intent    = survey.get("intent") or survey.get("description") or ""
    intent_line = f"\nSurvey purpose: {intent}" if intent else ""

    # Include longitudinal context if available
    longitudinal_ctx = ""
    prior_snapshots = state.get("prior_snapshots", [])
    if prior_snapshots:
        snap_lines = []
        for snap in reversed(prior_snapshots):
            nps_v = snap.get("nps")
            cnt   = snap.get("response_count")
            if nps_v is not None:
                snap_lines.append(f"  NPS={nps_v}" + (f" (n={cnt})" if cnt else ""))
        if snap_lines:
            longitudinal_ctx = "\nHistorical NPS trend (oldest→newest): " + " → ".join(
                l.strip() for l in snap_lines
            )

    system = (
        f"You are a senior {industry} experience analyst specializing in {use_case} research.\n"
        f'Survey: "{title}"{intent_line}{longitudinal_ctx}\n'
        f"Total responses: {total}\n\n"
        "TASK: Write a comprehensive executive report synthesizing the topic signals below. "
        "Use ONLY the quotes listed under each topic — every supporting_quote must appear "
        "verbatim in the signals data. Do not invent or paraphrase quotes. "
        "Return valid JSON only, no markdown.\n\n"
        f"JSON schema:\n{json.dumps(FullReport.model_json_schema(), indent=2)[:3500]}"
    )
    user = (
        f"Topic signals ({len(all_topics)} topics, {total} total responses):\n\n"
        + _format_topic_signals_for_llm(all_topics, metrics)
        + "\n\nWrite an executive_summary, 5-8 full themes, cross_theme_patterns, "
        "and top 3 priority_actions. "
        "supporting_quotes must be exact phrases from the quotes shown above."
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

    # Synthesize executive_summary from themes when model omits it
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

    all_texts = _collect_verbatim_corpus(topic_sigs)
    insights: list[dict] = []
    grounding_rates: list[float] = []

    # Executive summary
    if report.executive_summary:
        trust, trust_json = _compute_trust_score(total, 1.0, total, "full")
        insights.append({
            "layer":          "descriptive",
            "category":       "report.executive_summary",
            "headline":       f"Executive report: {total} responses analyzed",
            "narrative":      report.executive_summary,
            "trust_score":    trust,
            "trust_json":     {**trust_json, "grounding": 100},
            "citations_json": [],
            "priority":       0.98,
            "metric_json":    {
                "report_tier":          "full_report",
                "response_count":       total,
                "cross_theme_patterns": report.cross_theme_patterns or "",
            },
        })

    # Themes
    for theme in (report.themes or [])[:8]:
        grounded, rate = _ground_quotes_against_corpus(theme.supporting_quotes, all_texts)
        grounding_rates.append(rate)
        if not grounded:
            logger.warning("full_theme_no_grounded_quotes", theme=theme.theme, survey_id=survey_id)
            continue

        freq = theme.frequency_estimate
        sent_score = _sentiment_to_score(theme.sentiment)
        trust, trust_json = _compute_trust_score(total, rate, freq, "full")

        theme_ins: dict[str, Any] = {
            "layer":          "diagnostic",
            "category":       "report.full_theme",
            "headline":       theme.theme,
            "narrative":      theme.description,
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [
                {"quote": q, "relevance": 0.90, "sentiment": "neutral"}
                for q in grounded[:5]
            ],
            "priority":       0.75 + min(0.20, abs(sent_score) * 0.15 + freq * 0.005),
            "metric_json":    {
                "theme":                theme.theme,
                "sentiment":            theme.sentiment,
                "sentiment_score":      sent_score,
                "frequency_estimate":   freq,
                "trend_direction":      theme.trend_direction,
                "business_impact":      theme.business_impact or "",
                "root_cause_hypothesis": theme.root_cause_hypothesis or "",
                "report_tier":          "full_report",
                "grounding_rate":       round(rate, 2),
            },
        }

        if theme.recommended_action:
            ra = theme.recommended_action
            theme_ins["recommended_action"] = {
                "type":             ra.time_horizon,
                "label":            ra.action,
                "target":           theme.theme,
                "priority":         ra.priority,
                "time_horizon":     ra.time_horizon,
                "estimated_impact": ra.estimated_impact,
            }
            theme_ins["layer"]    = "prescriptive"
            theme_ins["priority"] = min(0.96, theme_ins["priority"] + 0.05)

        insights.append(theme_ins)

    # Priority actions (cross-theme)
    for i, action in enumerate((report.priority_actions or [])[:3]):
        trust, trust_json = _compute_trust_score(total, 0.8, total // 2, "full")
        insights.append({
            "layer":          "prescriptive",
            "category":       "report.priority_action",
            "headline":       action.action,
            "narrative":      " ".join(filter(None, [action.rationale, action.expected_outcome])),
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [],
            "recommended_action": {
                "type":             action.time_horizon,
                "label":            action.action,
                "target":           "cross_theme",
                "priority":         action.priority,
                "time_horizon":     action.time_horizon,
                "estimated_impact": action.expected_outcome,
            },
            "priority":       0.94 - i * 0.03,
            "metric_json":    {"report_tier": "full_report", "action_rank": i + 1},
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


# ── Verbatim corpus helpers ────────────────────────────────────────────────────


def _collect_verbatim_corpus(topic_sigs: dict[str, dict]) -> list[str]:
    """Collect all real verbatim texts from topic_signals for grounding checks.

    Uses top_verbatims which were already filtered by is_meaningful_text and
    select_top_verbatims — no synthetic labels, no low-quality text.
    """
    corpus: list[str] = []
    for sig in topic_sigs.values():
        for v in sig.get("top_verbatims", []):
            text = v.get("text", "")
            if text and is_meaningful_text(text):
                corpus.append(text)
    return corpus


def _ground_quotes_against_corpus(quotes: list[str], all_texts: list[str]) -> tuple[list[str], float]:
    """Verify LLM-output quotes appear verbatim in the response corpus using 4-gram matching.

    A quote passes if any 4-consecutive-word window appears in the lowercased corpus.
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


def _build_sorted_topic_list(
    topic_sigs: dict[str, dict],
    max_topics: int,
) -> list[dict]:
    """Sort topics by urgency_score descending, return top N with their signals merged in.

    Topics with no real verbatims (all_texts empty) are still included — the LLM
    can still reason about them using sentiment/emotion/effort signals.
    """
    items = []
    for name, sig in topic_sigs.items():
        merged = {"name": name, **sig}
        items.append(merged)

    # Primary sort: urgency_score desc (negative topics first)
    # Secondary: response_count desc (high-volume topics prioritized)
    items.sort(key=lambda x: (-(x.get("urgency_score") or 0.0), -(x.get("response_count") or 0)))
    return items[:max_topics]


# ── Main entry point ──────────────────────────────────────────────────────────


async def run_tiered_report_agent(state: dict) -> list[dict]:
    """Route to the appropriate tier-based report agent.

    Skips if:
    - Survey has no open-text questions (score-only surveys)
    - No topic signals available (topics not yet computed)
    - Not enough responses for minimum tier threshold (< 10)
    - Not enough new responses since last report (< REPORT_REGEN_MIN_NEW_RESPONSES)
      unless force_regenerate=True or trigger='manual'

    Returns a list of insight dicts to append to state["insights"].
    """
    if not state.get("has_open_text"):
        return []

    topic_sigs = state.get("topic_signals", {})
    if not topic_sigs:
        logger.info("tiered_report_skipped_no_topic_signals", survey_id=state.get("survey_id"))
        return []

    metrics = state.get("metrics", {})
    total   = metrics.get("total_responses", len(state.get("responses", [])))

    if total < 10:
        return []

    # Delta check: skip if not enough new responses since last report run
    # Bypass on explicit force or manual trigger
    force      = state.get("force_regenerate", False)
    is_manual  = state.get("trigger") == "manual"
    if not force and not is_manual:
        last_count = state.get("last_report_response_count", 0)
        if last_count > 0 and (total - last_count) < REPORT_REGEN_MIN_NEW_RESPONSES:
            logger.info(
                "tiered_report_skipped_insufficient_delta",
                survey_id=state.get("survey_id"),
                total=total,
                last_count=last_count,
                delta=total - last_count,
                threshold=REPORT_REGEN_MIN_NEW_RESPONSES,
            )
            return []

    if total < 40:
        return await run_headline_insights(state)
    elif total < 70:
        return await run_summary_insights(state)
    else:
        return await run_full_report(state)
