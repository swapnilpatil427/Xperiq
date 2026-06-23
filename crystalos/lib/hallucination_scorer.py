"""Hallucination scorer — deterministic + optional LLM hybrid.

Two-pass scoring:
  Pass 1 (free, ~0ms): Deterministic — citation validation + numeric claim check.
  Pass 2 (optional, LLM): Only runs when deterministic score < 0.80 to save cost.

Thresholds are configurable via env vars (HALLUCINATION_FAIL_THRESHOLD,
HALLUCINATION_FLAG_THRESHOLD) — see agents/lib/constants.py.

Replaces the LLM-asks-LLM _verify() approach (gap G2 fix).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from crystalos.lib.logger import logger


@dataclass
class HallucinationScore:
    score: float                            # 0.0–1.0, higher = less hallucination
    verdict: str                            # "pass" | "flag" | "fail"
    issues: list[str]                       # human-readable problem descriptions
    deterministic_score: float              # score from deterministic pass alone
    llm_score: float | None = None          # score from LLM pass (None if skipped)


def _extract_numbers(text: str) -> list[float]:
    """Extract all numeric values from text (integers and decimals)."""
    raw = re.findall(r"\b\d+\.?\d*\b", text)
    result = []
    for r in raw:
        try:
            result.append(float(r))
        except ValueError:
            pass
    return result


def _flatten_values(data: Any, depth: int = 0) -> list[float]:
    """Recursively extract all numeric values from a dict/list."""
    if depth > 6:
        return []
    numbers: list[float] = []
    if isinstance(data, (int, float)):
        numbers.append(float(data))
    elif isinstance(data, str):
        numbers.extend(_extract_numbers(data))
    elif isinstance(data, dict):
        for v in data.values():
            numbers.extend(_flatten_values(v, depth + 1))
    elif isinstance(data, (list, tuple)):
        for item in data:
            numbers.extend(_flatten_values(item, depth + 1))
    return numbers


def _numbers_close(a: float, b: float, tolerance: float = 0.05) -> bool:
    """Return True if |a-b|/max(|b|,1) <= tolerance (i.e., within 5% by default)."""
    if b == 0:
        return abs(a) <= tolerance
    return abs(a - b) / max(abs(b), 1.0) <= tolerance


async def score_insight(
    insight_text: str,
    supporting_data: dict,
    model_name: str = "insight_verify",
) -> HallucinationScore:
    """Score a generated insight text for hallucination against its supporting data.

    Args:
        insight_text: The generated insight narrative.
        supporting_data: The raw data used to produce the insight.
        model_name: Model key (from models.py) used for the optional LLM pass.
    """
    from crystalos.lib.constants import HALLUCINATION_FAIL_THRESHOLD, HALLUCINATION_FLAG_THRESHOLD

    issues: list[str] = []

    # ── Pass 1: Deterministic ─────────────────────────────────────────────
    answer_numbers = _extract_numbers(insight_text)
    supporting_numbers = _flatten_values(supporting_data)

    unverified: list[float] = []
    for num in answer_numbers:
        if num in (0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 100.0):
            continue  # Skip trivial numbers
        if not any(_numbers_close(num, s) for s in supporting_numbers):
            unverified.append(num)

    for u in unverified[:3]:  # Cap at 3 issues to avoid noise
        issues.append(f"Unverified number: {u}")

    # Penalty: each unverified number costs 0.15, clamped to [0, 1]
    det_score = max(0.0, 1.0 - len(unverified) * 0.15)
    det_score = round(det_score, 3)

    # ── Pass 2: LLM judge (only when det_score < 0.80) ────────────────────
    llm_score_float: float | None = None
    if det_score < 0.80:
        llm_score_float = await _llm_grounding_score(insight_text, supporting_data, model_name)

    # ── Final score ───────────────────────────────────────────────────────
    if llm_score_float is not None:
        final_score = round(0.5 * det_score + 0.5 * llm_score_float, 3)
    else:
        final_score = det_score

    verdict = _score_to_verdict(final_score, HALLUCINATION_FAIL_THRESHOLD, HALLUCINATION_FLAG_THRESHOLD)

    return HallucinationScore(
        score=final_score,
        verdict=verdict,
        issues=issues,
        deterministic_score=det_score,
        llm_score=llm_score_float,
    )


async def score_crystal_response(
    answer: str,
    tool_results: list[dict],
    citations: list[str],
) -> HallucinationScore:
    """Score a Crystal conversational response for hallucination.

    Args:
        answer: The Crystal answer text.
        tool_results: List of tool result dicts used to produce the answer.
        citations: List of insight IDs or topic names cited in the answer.
    """
    from crystalos.lib.constants import HALLUCINATION_FAIL_THRESHOLD, HALLUCINATION_FLAG_THRESHOLD

    issues: list[str] = []
    supporting_data: dict = {"tool_results": tool_results}

    # Verify citations exist in tool results
    tool_result_text = json.dumps(tool_results, default=str)
    for citation in citations:
        if citation and citation not in tool_result_text:
            issues.append(f"Citation not found in tool results: {citation!r}")

    # Numeric verification
    answer_numbers = _extract_numbers(answer)
    supporting_numbers = _flatten_values(tool_results)
    for num in answer_numbers:
        if num in (0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 100.0):
            continue
        if not any(_numbers_close(num, s) for s in supporting_numbers):
            issues.append(f"Unverified number: {num}")

    det_score = max(0.0, 1.0 - len(issues) * 0.12)
    det_score = round(det_score, 3)

    llm_score_float: float | None = None
    if det_score < 0.80:
        llm_score_float = await _llm_grounding_score(answer, supporting_data, "crystal_eval")

    if llm_score_float is not None:
        final_score = round(0.5 * det_score + 0.5 * llm_score_float, 3)
    else:
        final_score = det_score

    verdict = _score_to_verdict(final_score, HALLUCINATION_FAIL_THRESHOLD, HALLUCINATION_FLAG_THRESHOLD)

    return HallucinationScore(
        score=final_score,
        verdict=verdict,
        issues=issues[:5],  # Cap at 5 issues
        deterministic_score=det_score,
        llm_score=llm_score_float,
    )


async def _llm_grounding_score(
    claim_text: str,
    supporting_data: dict,
    model_name: str,
) -> float | None:
    """Ask an LLM to score grounding 0–100. Returns None on failure."""
    from pydantic import BaseModel, Field
    from crystalos.lib.openrouter import call_agent

    class GroundingOutput(BaseModel):
        grounding_score: int = Field(default=75, ge=0, le=100)
        reason: str = Field(default="")

    system = (
        "You are a hallucination detector for an Experience Management AI system. "
        "Given a claim text and supporting data, score how well the claim is grounded "
        "in the supporting data (0 = completely hallucinated, 100 = fully grounded). "
        "Be strict: penalize any claim that includes specific numbers or facts not visible "
        "in the supporting data. Return JSON: {grounding_score: int, reason: str}"
    )
    supporting_summary = json.dumps(supporting_data, default=str)[:3000]
    user = (
        f"Claim:\n{claim_text[:1500]}\n\n"
        f"Supporting data:\n{supporting_summary}"
    )

    try:
        result, _ = await call_agent(
            agent_name=model_name,
            system=system,
            user=user,
            output_schema=GroundingOutput,
        )
        return round(result.grounding_score / 100.0, 3)
    except Exception as exc:
        logger.debug("hallucination_llm_score_failed", error=str(exc))
        return None


def _score_to_verdict(
    score: float,
    fail_threshold: float,
    flag_threshold: float,
) -> str:
    if score < fail_threshold:
        return "fail"
    if score < flag_threshold:
        return "flag"
    return "pass"
