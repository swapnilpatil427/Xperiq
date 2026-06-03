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
from agents.lib.constants import (
    REPORT_MAX_RESPONSES_WINDOW, REPORT_REGEN_MIN_NEW_RESPONSES,
    REPORT_PRIOR_MIN_TRUST, REPORT_PRIOR_MAX_INSIGHTS,
    REPORT_NEW_RESPONSES_MAX, REPORT_RESPONSE_TEXT_MAX_LEN, REPORT_FULL_MAX_TOPICS,
)
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
    theme: str = Field(max_length=100)
    description: str = Field(
        max_length=1200,
        description=(
            "Detailed 3-5 sentence analysis of what respondents say. "
            "Cover: what customers experience, emotional tone, frequency pattern, "
            "any change from prior reports. Be specific — name actual issues, not generalities."
        ),
    )
    supporting_quotes: list[str] = Field(
        description=(
            "5-7 exact verbatim phrases from different respondents. "
            "Use quotes from both established evidence [INS:id] AND fresh responses [RESP:id]. "
            "ONLY use exact text from the provided evidence — never paraphrase."
        )
    )
    sentiment: Literal["positive", "negative", "mixed", "neutral"]
    frequency_estimate: int = Field(ge=1, description="Estimated number of respondents mentioning this theme")
    is_new_theme: bool = Field(
        default=False,
        description="True if this theme was NOT in established prior findings — first appearance",
    )
    confirms_prior: bool = Field(
        default=False,
        description="True if this theme directly confirms or updates an established prior finding",
    )
    prior_insight_ref: str = Field(
        default="",
        max_length=20,
        description="Short ID of the prior insight this theme confirms or updates, e.g. 'ba58f64c'",
    )
    business_impact: str = Field(
        default="",
        max_length=700,
        description=(
            "Specific business consequence if unaddressed — cite evidence. "
            "E.g. churn risk, support cost, NPS drag. Only state what the data supports."
        ),
    )
    root_cause_hypothesis: str = Field(
        default="",
        max_length=700,
        description=(
            "Most likely root cause based strictly on what customers said. "
            "Be concrete — name the specific product/process failure, not a category."
        ),
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
    headline: str = Field(
        default="",
        max_length=800,
        description=(
            "3-5 sentence paragraph summarising this report. "
            "This is the first thing the customer reads — make it count. "
            "Cover: (1) what the data shows overall, (2) the biggest change or finding, "
            "(3) any new pattern discovered, (4) the single most important action. "
            "Be specific — name the themes, numbers, and what they mean for the business. "
            "Example: 'NPS fell to -14 as multiple callbacks spiked 158% following the Day 14 incident. "
            "A new billing double-charge pattern emerged from 4 fresh responses — not previously reported. "
            "Onboarding friction is improving for standard accounts but worsening for multi-seat. "
            "Immediate priority: implement case IDs so agents see full call history.'"
        ),
    )
    executive_summary: str = Field(
        default="",
        max_length=2000,
        description=(
            "5-7 sentence executive summary. Structure: "
            "(1) Current overall state in one sentence. "
            "(2) Biggest change or finding from this run. "
            "(3) What is confirmed from prior analysis. "
            "(4) Any new pattern discovered. "
            "(5) Top recommended action. "
            "Be specific — name the themes, numbers, and evidence."
        ),
    )
    themes: list[FullTheme] = Field(
        description=(
            "Exactly 8 themes ranked by business impact. "
            "Mix: some confirming prior findings (confirms_prior=true), some new (is_new_theme=true). "
            "Every theme must have supporting_quotes from the evidence."
        )
    )
    cross_theme_patterns: str = Field(
        default="",
        max_length=800,
        description=(
            "2-3 sentences on connections across themes. "
            "E.g. 'Billing errors and callback loops compound each other — customers who are double-charged "
            "and then can't reach support are the highest churn risk segment.'"
        ),
    )
    priority_actions: list[_PriorityAction] = Field(
        default_factory=list,
        description="Top 3 highest-ROI actions. Each must trace to specific theme evidence.",
    )
    # Audit trail — which prior insights and new responses were referenced
    prior_insight_ids_referenced: list[str] = Field(
        default_factory=list,
        description="IDs of established insights from prior runs that were referenced in this report",
    )
    new_response_ids_sample: list[str] = Field(
        default_factory=list,
        description="IDs of new responses whose text was included for pattern discovery",
    )


# ── Intelligence Brief — extends FullReport with delta signals ─────────────────
# Generated when prior run data is available. Sections computed deterministically
# from topic_signals + new_response_ids + prior_insights; LLM only narrates.

class NewFinding(BaseModel):
    topic: str = Field(max_length=80)
    summary: str = Field(max_length=500, description="What's emerging from new responses specifically")
    new_response_share_pct: int = Field(ge=0, le=100, description="% of topic responses that are new")
    supporting_quotes: list[str] = Field(default_factory=list, description="Quotes from new responses only")
    is_new_topic: bool = Field(default=False, description="True if this topic didn't exist in prior run")


class Divergence(BaseModel):
    topic: str = Field(max_length=80)
    prior_finding: str = Field(max_length=400, description="What was established in the prior run")
    current_signal: str = Field(max_length=400, description="What the current data shows instead")
    direction: Literal["improving", "worsening", "reversed"] = "reversed"
    magnitude: str = Field(default="", max_length=200, description="How significant the shift is (e.g. 'sentiment +0.35 in 2 weeks')")


class TrendSignal(BaseModel):
    topic: str = Field(max_length=80)
    direction: Literal["rising", "declining", "accelerating", "stabilising"] = "rising"
    signal: str = Field(max_length=400, description="One sentence describing what is trending and why it matters")
    volume_delta: int = Field(default=0, description="Change in mention volume since last run")
    nps_impact: float = Field(default=0.0, description="NPS impact score for this topic")


class AnomalyAlert(BaseModel):
    topic: str = Field(default="", max_length=80, description="Topic name, empty for survey-level anomalies")
    anomaly_type: Literal["urgency_spike", "volume_spike", "sentiment_reversal", "nps_drop", "new_pattern"] = "urgency_spike"
    severity: Literal["critical", "high", "medium"] = "high"
    description: str = Field(max_length=400, description="What was detected and why it warrants attention")


class IntelligenceBrief(BaseModel):
    """Structured intelligence brief for incremental runs (when prior data exists).

    Sections are populated from deterministic signal computation — the LLM narrates
    structured findings, never discovers them. Extends FullReport with delta sections.
    """
    headline: str = Field(max_length=280, description="Single most important finding this run — leads the report")
    executive_summary: str = Field(max_length=1200, description="4-5 sentences covering overall status, biggest changes, and top action")
    # Delta sections — populated only when prior run data available
    new_findings: list[NewFinding] = Field(default_factory=list, description="Topics emerging predominantly from new responses")
    divergences: list[Divergence] = Field(default_factory=list, description="Findings that conflict with or update prior-run insights")
    trends: list[TrendSignal] = Field(default_factory=list, description="Directional patterns forming across topics")
    anomalies: list[AnomalyAlert] = Field(default_factory=list, description="Statistical outliers and urgent signals")
    # Full theme breakdown (same as FullReport)
    themes: list[FullTheme] = Field(description="5-8 themes ranked by business impact")
    priority_actions: list[_PriorityAction] = Field(default_factory=list, description="Top 3 highest-ROI actions")


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


# Regex that matches LLM citation markers: [RESP:26ec15e2] [INS:ba58f64c] etc.
_CITATION_REF_RE = re.compile(r'\[(?:RESP|INS):[^\]]{1,16}\]\s*', re.IGNORECASE)

def _strip_refs(text: str) -> str:
    """Remove internal citation markers from customer-facing text.

    The LLM embeds [RESP:xxx] and [INS:xxx] in quotes and narratives to track sources.
    These IDs are useful for audit trails but must never be shown to customers.
    """
    return _CITATION_REF_RE.sub('', text).strip('" ').strip()


# ── Evidence context builders ─────────────────────────────────────────────────
# Build the two evidence blocks that go into the full report LLM prompt:
#   A. Established insights — high-confidence findings from prior runs
#   B. New response texts  — raw verbatims from responses not yet in any report
#
# The LLM synthesises both into an updated full report. It does not receive
# aggregated signals alone — it receives actual customer words as primary evidence.


def _build_established_context(prior_insights: list[dict]) -> tuple[str, list[str]]:
    """Format established high-confidence insights from prior runs for the LLM.

    Returns (formatted_text, list_of_insight_ids) so the caller can populate audit_json.
    Each entry is formatted as [INS:short_id] so the LLM can cite inline.
    """
    if not prior_insights:
        return "", []

    lines = ["━━━ ESTABLISHED FINDINGS (from prior analysis) ━━━",
             "These are validated findings from previous runs. Confirm, update, or flag changes.",
             "Cite inline as [INS:id] when referencing them.", ""]

    ids_used: list[str] = []
    for ins in prior_insights[:REPORT_PRIOR_MAX_INSIGHTS]:
        ins_id    = str(ins.get("id") or ins.get("run_id") or "")
        short_id  = ins_id[:8] if ins_id else "unk"
        layer     = (ins.get("layer") or "").upper()
        trust     = int(float(ins.get("trust_score") or 0))
        headline  = ins.get("headline") or ""
        narrative = (ins.get("narrative") or "")[:500]   # more narrative detail

        lines.append(f"[INS:{short_id}] [{layer}·trust:{trust}] {headline}")
        if narrative:
            lines.append(f"  {narrative}{'…' if len(ins.get('narrative') or '') > 500 else ''}")

        # Include all available verbatim citations from this insight (real customer words)
        raw_citations = ins.get("citations_json") or []
        if isinstance(raw_citations, str):
            try:
                raw_citations = json.loads(raw_citations)
            except Exception:
                raw_citations = []
        quote_count = 0
        for cit in raw_citations:
            if quote_count >= 4:   # up to 4 quotes per established insight
                break
            q = cit.get("quote") or "" if isinstance(cit, dict) else ""
            if q:
                lines.append(f'  Evidence: "{q[:250]}"')
                quote_count += 1

        # Include recommended action if this was prescriptive
        ra = ins.get("recommended_action")
        if isinstance(ra, str):
            try:
                ra = json.loads(ra)
            except Exception:
                ra = None
        if ra and isinstance(ra, dict) and ra.get("label"):
            lines.append(f"  Prior action: {ra['label']}")

        lines.append("")
        if ins_id:
            ids_used.append(ins_id)

    return "\n".join(lines), ids_used


def _build_new_responses_context(state: dict) -> tuple[str, list[str]]:
    """Format new response texts for the LLM — the fresh evidence for pattern discovery.

    Returns (formatted_text, list_of_response_ids).
    New responses are taken from state["open_texts"] filtered by state["new_response_ids"].
    Each entry includes the response ID for citation and ABSA labels for context.
    """
    new_ids: set[str] = state.get("new_response_ids") or set()
    open_texts: list[dict] = state.get("open_texts") or []
    absa_results: list[dict] = state.get("absa_results") or []
    responses: list[dict] = state.get("responses") or []

    # Build ABSA lookup: response_id → {sentiment, score, emotion, effort_score}
    absa_by_rid: dict[str, dict] = {}
    for a in absa_results:
        rid = str(a.get("response_id") or "")
        if rid and rid not in absa_by_rid:
            absa_by_rid[rid] = {
                "sentiment": a.get("sentiment") or "neutral",
                "score":     float(a.get("score") or 0.0),
                "emotion":   a.get("emotion") or "neutral",
                "effort":    float(a.get("effort_score") or 4.0),
            }

    # Build topic lookup: response_id → list of topic names from ai_topics field.
    # This is the critical link between responses and themes — each response knows
    # which topics it was assigned to during clustering.
    topics_by_rid: dict[str, list[str]] = {}
    for r in responses:
        rid = str(r.get("id") or "")
        if not rid:
            continue
        raw = r.get("ai_topics") or []
        if isinstance(raw, str):
            try:
                import json as _j
                raw = _j.loads(raw)
            except Exception:
                raw = []
        if raw:
            topics_by_rid[rid] = [str(t) for t in raw if t]

    # Select new response texts — include ALL new responses.
    # REPORT_NEW_RESPONSES_MAX = 0 means no cap (default). Set a positive value
    # only to reduce token cost at the expense of pattern-discovery coverage.
    _max = REPORT_NEW_RESPONSES_MAX if REPORT_NEW_RESPONSES_MAX > 0 else 10_000
    new_entries: list[dict] = []
    seen_rids: set[str] = set()
    for ot in open_texts:
        rid = str(ot.get("response_id") or "")
        text = (ot.get("text") or "").strip()
        if not text or not is_meaningful_text(text):
            continue
        # Include if: response is new OR if new_ids is empty (first run, all are new)
        if new_ids and rid not in new_ids:
            continue
        if rid in seen_rids:
            continue
        seen_rids.add(rid)
        new_entries.append({"rid": rid, "text": text, **absa_by_rid.get(rid, {})})
        if len(new_entries) >= _max:
            break

    if not new_entries:
        return "", []

    # Sort by emotional intensity (highest effort/urgency first — most signal)
    new_entries.sort(key=lambda e: -(abs(float(e.get("score") or 0)) + float(e.get("effort") or 4) / 7), reverse=False)

    lines = [f"━━━ FRESH EVIDENCE ({len(new_entries)} new responses) ━━━",
             "Analyze for NEW patterns not yet in established findings.",
             "Cite inline as [RESP:rid] when referencing a specific response.", ""]

    ids_used: list[str] = []
    for e in new_entries:
        rid       = e["rid"]
        short_rid = rid[:8] if rid else "unk"
        text      = e["text"][:REPORT_RESPONSE_TEXT_MAX_LEN]
        sentiment = e.get("sentiment") or "neutral"
        score     = e.get("score") or 0.0
        emotion   = e.get("emotion") or "neutral"
        effort    = e.get("effort") or 4.0

        # Topic attribution — which topics this response was assigned to during clustering.
        # This connects the raw response text to the theme structure, letting the LLM
        # confirm existing topics or discover new ones that aren't yet in the taxonomy.
        topic_names = topics_by_rid.get(rid, [])
        topic_str   = f", topics:[{', '.join(topic_names[:3])}]" if topic_names else ""

        lines.append(
            f"[RESP:{short_rid}] (sentiment:{sentiment}/{score:.2f}, "
            f"emotion:{emotion}, effort:{effort:.1f}/7{topic_str})"
        )
        lines.append(f'  "{text}{"…" if len(e["text"]) > REPORT_RESPONSE_TEXT_MAX_LEN else ""}"')
        lines.append("")
        if rid:
            ids_used.append(rid)

    return "\n".join(lines), ids_used


# ── Delta intelligence signal computation ─────────────────────────────────────
# All computations here are deterministic — no LLM involved.
# The LLM's only job is to narrate what these signals describe.

def _compute_delta_signals(state: dict) -> dict:
    """Compute structured change signals from current run vs prior run data.

    Returns a dict with keys: new_findings, divergences, trends, anomalies.
    Each list contains pre-computed signal objects ready for LLM narration.
    Empty lists are returned gracefully when data is insufficient.
    """
    topic_signals    = state.get("topic_signals", {})
    new_response_ids = state.get("new_response_ids", set()) or set()
    prior_insights   = state.get("prior_insights", [])   # loaded in node_narrate
    metrics          = state.get("metrics", {})
    clusters         = state.get("clusters", [])

    # ── 1. New findings — topics with high overlap with new_response_ids ─────
    # For each topic, compute what % of its response mentions come from new data.
    # ≥ 50% new → "new finding";  ≥ 15% → "evolving";  < 15% → "stable"
    new_findings: list[dict] = []
    if new_response_ids:
        # Build response_id → cluster texts lookup from live clusters
        cluster_by_name: dict[str, dict] = {
            (c.get("canonical_name") or c.get("aspect") or ""): c
            for c in clusters
        }
        for name, sig in topic_signals.items():
            topic_resp_ids = set(str(r) for r in (sig.get("response_ids") or []))
            if not topic_resp_ids:
                continue
            new_count   = len(topic_resp_ids & new_response_ids)
            new_pct     = int(new_count / max(1, len(topic_resp_ids)) * 100)
            if new_pct < 15:
                continue

            cluster     = cluster_by_name.get(name, {})
            new_texts   = [
                t.get("text", "") for t in (cluster.get("texts") or [])
                if str(t.get("response_id", "")) in new_response_ids
                and is_meaningful_text(t.get("text", ""))
            ][:3]
            verbatim_quotes = (sig.get("top_verbatims") or [])
            new_findings.append({
                "topic":                  name,
                "new_pct":                new_pct,
                "new_count":              new_count,
                "total_count":            len(topic_resp_ids),
                "sentiment":              sig.get("avg_sentiment_score", 0.0),
                "urgency":                sig.get("urgency_score", 0.0),
                "is_new_topic":           sig.get("is_new", False) or (name not in {pi.get("topic_ref","") for pi in prior_insights}),
                "quotes_from_new":        new_texts,
                "verbatims":              [v.get("text","") for v in verbatim_quotes[:2]],
            })
        new_findings.sort(key=lambda x: (-x["new_pct"], -x["urgency"]))

    # ── 2. Divergences — current data conflicts with prior validated insights ──
    # Match prior insight topic to current signals by keyword overlap.
    # Classify as: improving (prior-negative, now-better) / worsening / reversed.
    divergences: list[dict] = []
    for pi in prior_insights:
        headline = pi.get("headline") or ""
        narrative = pi.get("narrative") or ""
        layer     = pi.get("layer") or ""

        # Skip metric-level insights (NPS/CSAT change handled in metrics section)
        category = (pi.get("category") or "")
        if category.startswith("metric.") or category.startswith("report."):
            continue

        # Find best matching topic in current signals
        best_match_name  = None
        best_match_score = 0
        pi_words = set(re.sub(r"[^a-z0-9 ]", "", headline.lower()).split())
        for name in topic_signals:
            topic_words = set(re.sub(r"[^a-z0-9 ]", "", name.lower()).split())
            overlap = len(pi_words & topic_words)
            if overlap > best_match_score:
                best_match_score = overlap
                best_match_name  = name

        if best_match_name is None or best_match_score == 0:
            continue

        current_sig = topic_signals[best_match_name]
        current_sent = float(current_sig.get("avg_sentiment_score") or 0.0)

        # Infer prior sentiment direction from layer (prescriptive = was negative)
        if layer == "prescriptive":
            prior_sent_inferred = -0.4
        elif layer == "diagnostic":
            prior_sent_inferred = float(re.search(r"(-?[0-9]\.[0-9]+)", narrative or "").group(1)
                                         if re.search(r"(-?[0-9]\.[0-9]+)", narrative or "") else -0.2)
        else:
            continue  # not actionable enough to track divergence

        delta = current_sent - prior_sent_inferred
        if abs(delta) < 0.12:
            continue  # no meaningful divergence

        if delta > 0.12:
            direction = "improving"
        elif delta < -0.12:
            direction = "worsening"
        else:
            direction = "reversed"

        divergences.append({
            "topic":         best_match_name,
            "prior_layer":   layer,
            "prior_headline": headline,
            "current_sent":  current_sent,
            "prior_sent":    prior_sent_inferred,
            "delta":         delta,
            "direction":     direction,
            "magnitude":     f"sentiment {delta:+.2f} ({prior_sent_inferred:.2f} → {current_sent:.2f})",
        })
    divergences.sort(key=lambda x: abs(x["delta"]), reverse=True)

    # ── 3. Anomalies — statistical outliers ──────────────────────────────────
    anomalies: list[dict] = []

    # Survey-level NPS anomaly from trend engine
    if metrics.get("trend", {}).get("anomaly"):
        nps = metrics.get("nps", {}).get("score")
        delta_pct = metrics.get("trend", {}).get("delta_pct", 0.0)
        anomalies.append({
            "topic":   "",
            "type":    "nps_drop",
            "severity": "critical" if abs(delta_pct or 0) > 30 else "high",
            "description": f"NPS anomaly detected: score {nps}, delta {delta_pct:+.1f}% from baseline",
        })

    # Topic-level: urgency spikes + volume spikes + sentiment reversals
    for name, sig in topic_signals.items():
        urgency = float(sig.get("urgency_score") or 0.0)
        vol     = int(sig.get("response_count") or sig.get("volume") or 0)
        vd      = int(sig.get("volume_delta") or 0)
        sent    = float(sig.get("avg_sentiment_score") or 0.0)

        if urgency >= 80:
            anomalies.append({
                "topic": name, "type": "urgency_spike",
                "severity": "critical" if urgency >= 90 else "high",
                "description": f"Urgency {urgency:.0f}% — emotional intensity unusually high in {vol} responses",
            })
        if vol > 0 and vd > 0:
            vd_pct = vd / max(1, vol - vd) * 100
            if vd_pct >= 40:
                anomalies.append({
                    "topic": name, "type": "volume_spike",
                    "severity": "high" if vd_pct >= 80 else "medium",
                    "description": f"Volume grew {vd_pct:.0f}% (+{vd} mentions) since last run",
                })
        if sent < -0.5 and sig.get("trending") in ("up",) and urgency >= 50:
            anomalies.append({
                "topic": name, "type": "sentiment_reversal",
                "severity": "high",
                "description": f"Rising negative sentiment ({sent:.2f}) with increasing volume — escalating pain",
            })

    anomalies.sort(key=lambda x: {"critical": 0, "high": 1, "medium": 2}.get(x["severity"], 3))

    # ── 4. Trends — directional patterns forming ─────────────────────────────
    # Include only topics with clear direction and meaningful volume
    trends: list[dict] = []
    for name, sig in topic_signals.items():
        trending = sig.get("trending") or "stable"
        if trending not in ("up", "down"):
            continue
        vol     = int(sig.get("response_count") or sig.get("volume") or 0)
        if vol < 3:
            continue
        vd      = int(sig.get("volume_delta") or 0)
        sent    = float(sig.get("avg_sentiment_score") or 0.0)
        nps_imp = sig.get("nps_impact")
        # Classify: rising/declining/accelerating
        direction = "rising" if trending == "up" else "declining"
        if abs(vd or 0) >= vol * 0.5:
            direction = "accelerating"

        trends.append({
            "topic":        name,
            "direction":    direction,
            "volume":       vol,
            "volume_delta": vd,
            "sentiment":    sent,
            "nps_impact":   nps_imp,
            "urgency":      float(sig.get("urgency_score") or 0.0),
        })
    trends.sort(key=lambda x: (-abs(x.get("nps_impact") or 0), -x.get("urgency", 0)))

    return {
        "new_findings": new_findings[:5],
        "divergences":  divergences[:4],
        "anomalies":    anomalies[:5],
        "trends":       trends[:5],
        "has_prior":    len(prior_insights) > 0,
    }


def _format_delta_signals_for_llm(signals: dict) -> str:
    """Format pre-computed delta signals as structured LLM prompt sections."""
    parts: list[str] = []

    if signals.get("new_findings"):
        parts.append("━━━ NEW / EMERGING (from latest responses) ━━━")
        for f in signals["new_findings"]:
            new_flag = " [BRAND NEW TOPIC]" if f.get("is_new_topic") else ""
            parts.append(
                f"  {f['topic']}{new_flag}: {f['new_pct']}% of mentions are new"
                f" | sentiment={f['sentiment']:.2f} | urgency={f['urgency']:.0f}%"
            )
            for q in f.get("quotes_from_new") or f.get("verbatims", []):
                if q:
                    parts.append(f'    Quote: "{q[:200]}"')

    if signals.get("divergences"):
        parts.append("\n━━━ DIVERGENCES (prior ≠ current) ━━━")
        for d in signals["divergences"]:
            parts.append(
                f"  {d['topic']}: {d['direction'].upper()} — {d['magnitude']}"
                f"\n    Prior: {d['prior_headline']}"
            )

    if signals.get("anomalies"):
        parts.append("\n━━━ ANOMALIES DETECTED ━━━")
        for a in signals["anomalies"]:
            label = f"[{a['severity'].upper()}]" + (f" {a['topic']}" if a.get("topic") else " SURVEY-LEVEL")
            parts.append(f"  {label} {a['type'].replace('_',' ')}: {a['description']}")

    if signals.get("trends"):
        parts.append("\n━━━ TRENDS FORMING ━━━")
        for t in signals["trends"]:
            nps_str = f" | NPS impact={t['nps_impact']:+.1f}" if t.get("nps_impact") is not None else ""
            parts.append(
                f"  {t['topic']}: {t['direction'].upper()} "
                f"(vol={t['volume']}, Δ={t['volume_delta']:+d}{nps_str})"
            )

    return "\n".join(parts)


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
            "headline":       _strip_refs(theme.theme),
            "narrative":      _strip_refs(theme.summary),
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [{"quote": _strip_refs(q), "relevance": 0.88} for q in grounded[:3] if _strip_refs(q)],
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
            "headline":       _strip_refs(theme.theme),
            "narrative":      _strip_refs(theme.description),
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [{"quote": _strip_refs(q), "relevance": 0.88} for q in grounded[:4] if _strip_refs(q)],
            "priority":       0.70 + min(0.18, abs(sent_score) * 0.15 + freq * 0.008),
            "metric_json":    {
                "theme":              _strip_refs(theme.theme),
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
    """Generate a comprehensive full report for growing_picture/full_report tiers (70+ responses).

    Approach: send TWO evidence sources to the LLM and let it synthesise.

    A. ESTABLISHED FINDINGS — high-confidence insights from prior runs (headlines + their verbatims).
       These are background knowledge. The LLM confirms, updates, or flags when they no longer hold.

    B. FRESH EVIDENCE — actual new response texts with ABSA labels (sentiment, emotion, effort).
       The LLM reads these directly and discovers new patterns, just like the individual
       narrate_topic_insight calls received sample_quotes.

    Both sources are cited in the output: [INS:id] for prior insights, [RESP:id] for new responses.
    The audit_json on every published insight records which prior insight IDs and response IDs
    were included in its generation context.
    """
    metrics    = state.get("metrics", {})
    survey     = state.get("survey", {})
    org_ctx    = state.get("org_context", {})
    topic_sigs = state.get("topic_signals", {})
    survey_id  = state["survey_id"]
    total      = metrics.get("total_responses", len(state.get("responses", [])))
    prior_insights = state.get("prior_insights", [])

    all_topics = _build_sorted_topic_list(topic_sigs, max_topics=REPORT_FULL_MAX_TOPICS)
    if not all_topics:
        return []

    industry    = org_ctx.get("industry") or "general"
    use_case    = org_ctx.get("primary_use_case") or "CX"
    title       = survey.get("title") or "this survey"
    intent      = survey.get("intent") or survey.get("description") or ""
    intent_line = f"\nSurvey purpose: {intent}" if intent else ""

    # Historical NPS for longitudinal framing
    longitudinal_ctx = ""
    prior_snapshots = state.get("prior_snapshots", [])
    if prior_snapshots:
        snap_lines = [
            f"NPS={s.get('nps')}" + (f"(n={s.get('response_count')})" if s.get('response_count') else "")
            for s in reversed(prior_snapshots) if s.get("nps") is not None
        ]
        if snap_lines:
            longitudinal_ctx = "\nHistorical NPS trend: " + " → ".join(snap_lines)

    # ── Build evidence context ────────────────────────────────────────────────
    established_ctx, prior_ids_used = _build_established_context(prior_insights)
    new_responses_ctx, new_resp_ids_used = _build_new_responses_context(state)

    has_established = bool(established_ctx)
    has_new_responses = bool(new_responses_ctx)

    # ── Compose system + user prompts ─────────────────────────────────────────
    schema_str = json.dumps(FullReport.model_json_schema(), indent=2)[:4000]

    if has_established and has_new_responses:
        task_instruction = (
            "You have TWO evidence sources. Write a detailed, comprehensive report from both.\n\n"
            "ESTABLISHED FINDINGS (prior validated analysis):\n"
            "  • Confirm findings still supported by evidence — set confirms_prior=true, cite [INS:id]\n"
            "  • Update narratives where fresh evidence changes the picture\n"
            "  • Flag reversals or improvements honestly\n\n"
            "FRESH EVIDENCE (new customer responses):\n"
            "  • Read each response directly — find patterns not in established findings\n"
            "  • Create new themes for emerging topics — set is_new_theme=true\n"
            "  • Cite specific responses inline: [RESP:short_rid]\n\n"
            "THEME STRUCTURE — exactly 8 themes, mixed:\n"
            "  • Some confirming/updating prior findings (prior insight reference in prior_insight_ref)\n"
            "  • Some brand-new patterns discovered from fresh responses\n"
            "  • Every theme needs 5-7 supporting quotes drawn from the evidence sources\n"
            "  • Be SPECIFIC: name the exact product feature, support step, or process failing\n\n"
        )
    elif has_new_responses:
        task_instruction = (
            "Analyse all fresh response texts. Write a detailed report with exactly 8 themes.\n"
            "Be specific — name exact issues. Cite responses as [RESP:short_rid].\n"
            "Every theme needs 5-7 supporting quotes from the evidence.\n\n"
        )
    else:
        task_instruction = (
            "Synthesise the topic signals into a comprehensive report with exactly 8 themes.\n"
            "Be detailed — name specific issues, root causes, and business impacts.\n\n"
        )

    system = (
        f"You are a senior {industry} experience analyst specializing in {use_case} research.\n"
        f'Survey: "{title}"{intent_line}{longitudinal_ctx}\n'
        f"Total responses this run: {total}\n\n"
        + task_instruction +
        "CITATION RULES:\n"
        "  • Use [INS:id] for established prior insights — verbatim from [INS:...] labels above\n"
        "  • Use [RESP:rid] for new responses — verbatim from [RESP:...] labels above\n"
        "  • supporting_quotes in each theme MUST be exact text from the evidence sources\n"
        "  • Do NOT invent quotes or patterns not in the evidence\n\n"
        "Return valid JSON only, no markdown.\n\n"
        f"JSON schema:\n{schema_str}"
    )

    # Build user message: evidence blocks + topic signals structure
    user_parts: list[str] = []
    if established_ctx:
        user_parts.append(established_ctx)
    if new_responses_ctx:
        user_parts.append(new_responses_ctx)

    user_parts.append(
        f"━━━ TOPIC SIGNALS STRUCTURE ({len(all_topics)} topics, {total} responses) ━━━\n"
        "Use for frequency_estimate, sentiment, trend_direction, and additional quotes.\n"
        + _format_topic_signals_for_llm(all_topics, metrics)
    )

    user_parts.append(
        "Write the full detailed report:\n"
        "• headline: 3-5 sentence paragraph summarising the report. "
        "First thing the customer reads. Cover: overall state, biggest change, any new pattern, top action. "
        "Name specific themes and numbers. "
        "Example: 'NPS fell to -14 as callbacks spiked 158%. A new billing issue emerged from 4 responses. "
        "Onboarding improving for standard accounts. Fix the callback loop first.'\n"
        "• executive_summary: 5-7 sentences — current state, biggest change, what's confirmed, "
        "any new pattern, top action. Name the specific themes and numbers.\n"
        "• themes: EXACTLY 8, ranked by business impact. Mix of confirmed prior + new discoveries. "
        "Each theme needs 5-7 supporting_quotes (exact text from evidence). "
        "description must be 3-5 sentences — specific, named issues, not generalities.\n"
        "• cross_theme_patterns: 2-3 sentences on compounding effects between themes.\n"
        "• priority_actions: top 3 with full rationale and expected_outcome.\n"
        "• Set prior_insight_ids_referenced to [INS:id] values you cited.\n"
        "• Set new_response_ids_sample to [RESP:rid] values you cited.\n"
        "Be detailed and specific throughout. This is an executive intelligence brief."
    )

    user = "\n\n".join(user_parts)

    # ── LLM call ─────────────────────────────────────────────────────────────
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

    # Fallback executive_summary if LLM omitted it
    if not report.executive_summary and report.themes:
        top = report.themes[:3]
        dominant = max(set(t.sentiment for t in top), key=[t.sentiment for t in top].count)
        theme_names = ", ".join(f'"{t.theme}"' for t in top)
        report = report.model_copy(update={
            "executive_summary": (
                f"Analysis of {total} responses surfaces {len(report.themes)} themes. "
                f"Key themes: {theme_names}. Overall sentiment: {dominant}."
            )
        })

    # ── Audit trail ───────────────────────────────────────────────────────────
    # Merge IDs the LLM reported it used with the full list we sent.
    # The LLM may not perfectly track all references, so we include what we sent.
    all_prior_ids  = list(dict.fromkeys(prior_ids_used + list(report.prior_insight_ids_referenced or [])))
    all_resp_ids   = list(dict.fromkeys(new_resp_ids_used[:20]))  # cap to avoid bloating audit_json

    # ── Convert to publishable insight records ────────────────────────────────
    all_texts = _collect_verbatim_corpus(topic_sigs)
    insights: list[dict] = []
    grounding_rates: list[float] = []

    def _audit(extra: dict | None = None) -> dict:
        """Build audit_json with source references for every published insight."""
        base = {
            "model":                  "report_full",
            "report_tier":            "full_report",
            "prior_insight_refs":     all_prior_ids,
            "new_response_refs":      all_resp_ids,
            "prior_insight_count":    len(all_prior_ids),
            "new_response_count":     len(new_resp_ids_used),
        }
        if extra:
            base.update(extra)
        return base

    # Executive summary
    if report.executive_summary:
        trust, trust_json = _compute_trust_score(total, 1.0, total, "full")
        # Use LLM-generated headline if available; fall back to a descriptive metadata string
        if report.headline:
            report_headline = _strip_refs(report.headline)
        elif report.executive_summary:
            # Fallback: first 2 sentences of the executive summary
            sentences = [s.strip() for s in _strip_refs(report.executive_summary).split('.') if s.strip()]
            report_headline = '. '.join(sentences[:2]) + ('.' if sentences[:2] else '')
        else:
            report_headline = f"Intelligence report: {total} responses"
        insights.append({
            "layer":          "descriptive",
            "category":       "report.executive_summary",
            "headline":       report_headline,
            "narrative":      _strip_refs(report.executive_summary),
            "trust_score":    trust,
            "trust_json":     {**trust_json, "grounding": 100},
            "citations_json": [],
            "priority":       0.98,
            "metric_json": {
                "report_tier":             "full_report",
                "response_count":          total,
                "cross_theme_patterns":    report.cross_theme_patterns or "",
                "prior_insights_used":     len(all_prior_ids),
                "new_responses_analyzed":  len(new_resp_ids_used),
                "has_established_context": has_established,
                "has_new_responses":       has_new_responses,
            },
            "audit_json": _audit(),
        })

    # Themes
    for theme in (report.themes or [])[:8]:
        grounded, rate = _ground_quotes_against_corpus(theme.supporting_quotes, all_texts)
        grounding_rates.append(rate)
        if not grounded:
            logger.warning("full_theme_no_grounded_quotes", theme=theme.theme, survey_id=survey_id)
            # Allow through with zero grounding — theme may cite new responses whose text
            # is not in the verbatim corpus. Don't silently drop it.
            rate = 0.0

        freq      = theme.frequency_estimate
        sent_score = _sentiment_to_score(theme.sentiment)
        trust, trust_json = _compute_trust_score(total, max(rate, 0.3), freq, "full")

        # Strip internal citation refs from all customer-facing text before storing
        clean_quotes = [_strip_refs(q) for q in (grounded or theme.supporting_quotes)[:5] if _strip_refs(q)]

        theme_ins: dict[str, Any] = {
            "layer":          "diagnostic",
            "category":       "report.full_theme",
            "headline":       _strip_refs(theme.theme),
            "narrative":      _strip_refs(theme.description),
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [
                {"quote": q, "relevance": 0.90, "sentiment": "neutral"}
                for q in clean_quotes
            ],
            "priority":       0.75 + min(0.20, abs(sent_score) * 0.15 + freq * 0.005),
            "metric_json": {
                "theme":                 _strip_refs(theme.theme),
                "sentiment":             theme.sentiment,
                "sentiment_score":       sent_score,
                "frequency_estimate":    freq,
                "trend_direction":       theme.trend_direction,
                "business_impact":       _strip_refs(theme.business_impact or ""),
                "root_cause_hypothesis": theme.root_cause_hypothesis or "",
                "report_tier":           "full_report",
                "grounding_rate":        round(rate, 2),
            },
            "audit_json": _audit({"theme": theme.theme}),
        }

        if theme.recommended_action:
            ra = theme.recommended_action
            theme_ins["recommended_action"] = {
                "type":             ra.time_horizon,
                "label":            _strip_refs(ra.action),
                "target":           _strip_refs(theme.theme),
                "priority":         ra.priority,
                "time_horizon":     ra.time_horizon,
                "estimated_impact": _strip_refs(ra.estimated_impact or ""),
            }
            theme_ins["layer"]    = "prescriptive"
            theme_ins["priority"] = min(0.96, theme_ins["priority"] + 0.05)

        insights.append(theme_ins)

    # Priority actions
    for i, action in enumerate((report.priority_actions or [])[:3]):
        trust, trust_json = _compute_trust_score(total, 0.8, total // 2, "full")
        insights.append({
            "layer":          "prescriptive",
            "category":       "report.priority_action",
            "headline":       _strip_refs(action.action),
            "narrative":      _strip_refs(" ".join(filter(None, [action.rationale, action.expected_outcome]))),
            "trust_score":    trust,
            "trust_json":     trust_json,
            "citations_json": [],
            "recommended_action": {
                "type":             action.time_horizon,
                "label":            _strip_refs(action.action),
                "target":           "cross_theme",
                "priority":         action.priority,
                "time_horizon":     action.time_horizon,
                "estimated_impact": _strip_refs(action.expected_outcome or ""),
            },
            "priority":       0.94 - i * 0.03,
            "metric_json":    {"report_tier": "full_report", "action_rank": i + 1},
            "audit_json":     _audit(),
        })

    avg_ground = round(sum(grounding_rates) / len(grounding_rates), 2) if grounding_rates else 0.0
    logger.info(
        "report_full_done",
        survey_id=survey_id,
        theme_count=sum(1 for ins in insights if ins["category"] == "report.full_theme"),
        action_count=sum(1 for ins in insights if ins["category"] == "report.priority_action"),
        prior_insights_included=len(all_prior_ids),
        new_responses_included=len(new_resp_ids_used),
        avg_grounding=avg_ground,
        has_established_context=has_established,
        has_new_responses=has_new_responses,
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
