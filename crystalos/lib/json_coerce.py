"""Shared JSON coercion helpers for LLM structured outputs.

LLMs sometimes return dicts where schemas expect strings (e.g. navigation actions
in a suggestions array). These helpers normalize output before Pydantic validation.
"""
from __future__ import annotations

_SKILL_ANSWER_MIN_LEN = 20


def coerce_suggestion_item(item) -> str | None:
    """Normalize one suggestion entry to a plain string."""
    if not item:
        return None
    if isinstance(item, str):
        return item.strip() or None
    if isinstance(item, dict):
        label = item.get("label") or item.get("text") or item.get("question")
        if label:
            return str(label).strip() or None
    text = str(item).strip()
    return text or None


def normalize_suggestions(v, *, max_items: int | None = None) -> list[str]:
    """Coerce a suggestions field to list[str], optionally capped."""
    if not v:
        return []
    if not isinstance(v, list):
        return []
    out: list[str] = []
    for item in v:
        text = coerce_suggestion_item(item)
        if text:
            out.append(text)
    if max_items is not None:
        return out[:max_items]
    return out


def extract_skill_answer(output: dict, min_len: int = _SKILL_ANSWER_MIN_LEN) -> str | None:
    """Pick the best prose answer from a skill output dict for Crystal normalization."""
    if not isinstance(output, dict):
        return None

    for key in (
        "answer",
        "summary",
        "executive_summary",
        "digest_summary",
        "explanation",
        "rationale",
        "recommendation",
        "design_rationale",
    ):
        val = output.get(key)
        if isinstance(val, str) and val.strip() and len(val.strip()) >= min_len:
            return val.strip()

    report = output.get("report")
    if isinstance(report, dict):
        es = report.get("executive_summary")
        if isinstance(es, str) and len(es.strip()) >= min_len:
            return es.strip()

    headline = output.get("headline")
    narrative = output.get("narrative")
    h = headline.strip() if isinstance(headline, str) and headline.strip() else ""
    n = narrative.strip() if isinstance(narrative, str) and narrative.strip() else ""

    if h and n:
        combined = f"{h} {n}"
        if len(combined) >= min_len:
            return combined
    if h and len(h) >= min_len:
        return h
    if n and len(n) >= min_len:
        return n

    return None
