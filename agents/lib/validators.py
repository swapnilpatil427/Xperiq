"""Post-LLM semantic validation — the code-level hallucination guard.

These checks run AFTER Pydantic schema validation and AFTER the LLM returns.
They catch outputs that are schema-valid but semantically wrong.

Design principle: LLMs make statistical errors; validators make zero errors.
Validators are the last line of defence before data enters the user-facing pipeline.

Examples of what this catches:
  - NPS question with options (schema allows it, survey design doesn't)
  - QC score of 9.0 with 3 high-severity issues (score inflation by the LLM)
  - Creator returning q3, q5, q7 instead of sequential q1..qN
  - Multiple rating questions with different scales (1-5 vs 1-10 in same survey)
  - Duplicate question text (LLM copy-paste error)
  - Refiner changing question TYPE without explicit user instruction
"""
from __future__ import annotations

import re
from typing import Any


# ── Question type rules ─────────────────────────────────────────────────────────

_REQUIRES_OPTIONS = {"multiple_choice", "checkbox", "dropdown", "ranking"}
_FORBIDS_OPTIONS  = {"nps", "csat", "rating", "slider", "open_text", "short_text", "date", "statement"}
_OPEN_TYPES       = {"open_text", "short_text"}


def validate_questions_semantic(questions: list[Any]) -> list[str]:
    """
    Return a list of semantic violation strings for a question list.
    Empty list = valid.

    Accepts dicts or Question objects (checks .type, .id, .question, .options, .scale_max).
    """
    errors: list[str] = []

    def _get(q: Any, attr: str, default: Any = None) -> Any:
        return q.get(attr, default) if isinstance(q, dict) else getattr(q, attr, default)

    # ── 1. Sequential IDs ─────────────────────────────────────────────────────
    for i, q in enumerate(questions):
        expected = f"q{i + 1}"
        actual   = _get(q, "id", "")
        if actual != expected:
            errors.append(f"ID mismatch at position {i+1}: expected '{expected}', got '{actual}'")

    # ── 2. Options presence ───────────────────────────────────────────────────
    for q in questions:
        qtype   = _get(q, "type", "")
        opts    = _get(q, "options") or []
        qid     = _get(q, "id", "?")
        if qtype in _REQUIRES_OPTIONS and not opts:
            errors.append(f"{qid} ({qtype}): must have options")
        if qtype in _FORBIDS_OPTIONS and opts:
            errors.append(f"{qid} ({qtype}): must NOT have options")

    # ── 3. Scale consistency ──────────────────────────────────────────────────
    rating_scales: set[int] = set()
    for q in questions:
        if _get(q, "type") == "rating":
            s = _get(q, "scaleMax") or _get(q, "scale_max")
            if s:
                rating_scales.add(int(s))
    if len(rating_scales) > 1:
        errors.append(
            f"Inconsistent rating scales: {sorted(rating_scales)}. "
            "Choose one scale (5 or 10) and apply it uniformly."
        )

    # ── 4. Must end with open text ────────────────────────────────────────────
    if questions:
        last_type = _get(questions[-1], "type", "")
        if last_type not in _OPEN_TYPES:
            errors.append(
                f"Last question must be open_text or short_text, got '{last_type}'. "
                "Always give respondents a final open-text option."
            )

    # ── 5. Duplicate question text ────────────────────────────────────────────
    seen: dict[str, str] = {}
    for q in questions:
        text  = (_get(q, "question") or "").lower().strip()
        qid   = _get(q, "id", "?")
        if text and text in seen:
            errors.append(f"Duplicate question text: {qid} duplicates {seen[text]}")
        elif text:
            seen[text] = qid

    # ── 6. Empty question text ────────────────────────────────────────────────
    for q in questions:
        text = (_get(q, "question") or "").strip()
        if not text:
            errors.append(f"{_get(q, 'id', '?')}: empty question text")

    # ── 7. Options have ≥ 2 values ────────────────────────────────────────────
    for q in questions:
        opts = _get(q, "options") or []
        if opts and len(opts) < 2:
            errors.append(f"{_get(q, 'id', '?')}: must have at least 2 options, got {len(opts)}")

    return errors


def fix_question_ids(questions: list[dict]) -> list[dict]:
    """
    Auto-correct non-sequential question IDs (q3→q1, etc.).
    Mutates a copy of the list — never modifies input in-place.
    """
    result = []
    for i, q in enumerate(questions):
        fixed = dict(q)
        fixed["id"] = f"q{i + 1}"
        result.append(fixed)
    return result


# ── QC score anti-inflation ─────────────────────────────────────────────────────

def compute_max_allowed_score(issues: list[Any]) -> float:
    """
    Compute the MAXIMUM score that is mathematically consistent with the issues.

    Scoring rules (mirrored from QC system prompt):
      high   → -2.0
      medium → -1.0
      low    → -0.5
    """
    deduction = 0.0
    for issue in issues:
        sev = (issue.get("severity") if isinstance(issue, dict) else getattr(issue, "severity", "low")) or "low"
        deduction += {"high": 2.0, "medium": 1.0, "low": 0.5}.get(sev, 0.5)
    return max(0.0, 10.0 - deduction)


def clamp_qc_score(score: float, issues: list[Any]) -> tuple[float, bool]:
    """
    Return (clamped_score, was_adjusted).

    If the LLM returned a score higher than the issues justify, clamp it.
    A 1.0-point tolerance is allowed for holistic judgement (e.g. a minor
    high-severity issue that doesn't warrant the full -2.0 deduction).
    """
    max_allowed = compute_max_allowed_score(issues)
    tolerance   = 1.0   # allow LLM up to 1 point of discretionary leniency

    if score > max_allowed + tolerance:
        adjusted = round(min(score, max_allowed + tolerance), 1)
        return adjusted, True  # (clamped, was_adjusted=True)
    return score, False


# ── Refiner type-preservation guard ────────────────────────────────────────────

def validate_refiner_output(original: Any, refined: Any, feedback: str) -> list[str]:
    """
    Ensure the refiner didn't silently change the question type unless the user
    explicitly requested it (e.g. "change this to multiple choice").

    Returns a list of violations. Empty = valid.
    """
    errors: list[str] = []

    def _get(q: Any, attr: str) -> Any:
        return q.get(attr) if isinstance(q, dict) else getattr(q, attr, None)

    orig_type    = _get(original, "type")
    refined_type = _get(refined, "type")
    orig_id      = _get(original, "id")
    refined_id   = _get(refined, "id")

    # ID must never change
    if orig_id != refined_id:
        errors.append(f"Question ID changed from '{orig_id}' to '{refined_id}' — IDs are immutable")

    # Type must be preserved unless explicitly requested
    if orig_type != refined_type:
        type_change_keywords = {
            "multiple choice", "checkbox", "dropdown", "rating", "nps", "csat",
            "slider", "ranking", "open text", "short text", "date", "matrix", "statement",
            "change to", "convert to", "make it a", "switch to",
        }
        feedback_lower = feedback.lower()
        explicitly_requested = any(kw in feedback_lower for kw in type_change_keywords)
        if not explicitly_requested:
            errors.append(
                f"Question type changed from '{orig_type}' to '{refined_type}' "
                "without explicit user request. Preserve the original type."
            )

    return errors


# ── PII pattern scanner (no LLM — runs before compliance agent LLM call) ────────

_PII_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\b(full\s+)?name\b', re.IGNORECASE),               "name"),
    (re.compile(r'\b(email|e-mail|email\s+address)\b', re.IGNORECASE), "email"),
    (re.compile(r'\b(phone|mobile|cell|telephone)\b', re.IGNORECASE), "phone"),
    (re.compile(r'\b(address|street|zip|postal)\b', re.IGNORECASE),   "address"),
    (re.compile(r'\b(social\s+security|ssn|national\s+id|passport)\b', re.IGNORECASE), "govt_id"),
    (re.compile(r'\b(credit\s+card|bank\s+account|routing)\b', re.IGNORECASE), "financial"),
    (re.compile(r'\b(date\s+of\s+birth|birthday|dob|born\s+on)\b', re.IGNORECASE), "dob"),
    (re.compile(r'\b(race|ethnicity|racial|ethnic)\b', re.IGNORECASE), "sensitive_demo"),
    (re.compile(r'\b(religion|religious|faith|church|denomination)\b', re.IGNORECASE), "sensitive_demo"),
    (re.compile(r'\b(political|party\s+affiliation|vote|voting)\b', re.IGNORECASE), "political"),
    (re.compile(r'\b(health|medical|diagnosis|condition|disability|prescription)\b', re.IGNORECASE), "health"),
    (re.compile(r'\b(salary|income|annual\s+earnings|compensation|pay)\b', re.IGNORECASE), "financial"),
    (re.compile(r'\b(sexual|orientation|gender\s+identity)\b', re.IGNORECASE), "sensitive_demo"),
]

_HIGH_RISK_TYPES = {"name", "email", "phone", "address", "govt_id", "financial", "dob"}
_MEDIUM_RISK_TYPES = {"sensitive_demo", "political", "health"}


def scan_pii_patterns(questions: list[Any]) -> dict[str, list[str]]:
    """
    Fast, zero-LLM PII pattern scan.

    Returns {question_id: [pii_type_1, pii_type_2, ...]}
    for every question where PII indicators were found.
    """
    findings: dict[str, list[str]] = {}

    def _get(q: Any, attr: str) -> Any:
        return q.get(attr) if isinstance(q, dict) else getattr(q, attr, None)

    for q in questions:
        qid  = _get(q, "id") or "unknown"
        text = _get(q, "question") or ""
        matched: list[str] = []
        for pattern, pii_type in _PII_PATTERNS:
            if pattern.search(text) and pii_type not in matched:
                matched.append(pii_type)
        if matched:
            findings[qid] = matched

    return findings


def overall_pii_risk(pattern_findings: dict[str, list[str]]) -> str:
    """
    Compute a quick risk estimate from pattern findings alone.
    The LLM may upgrade or downgrade this based on context.

    Returns: "low" | "medium" | "high"
    """
    all_types: set[str] = set()
    for types in pattern_findings.values():
        all_types.update(types)

    if all_types & _HIGH_RISK_TYPES:
        return "high"
    if all_types & _MEDIUM_RISK_TYPES:
        return "medium"
    return "low"
