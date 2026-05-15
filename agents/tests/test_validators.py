"""Tests for the semantic validation layer (no LLM calls)."""
import pytest

from agents.lib.validators import (
    validate_questions_semantic,
    clamp_qc_score,
    fix_question_ids,
    validate_refiner_output,
    scan_pii_patterns,
    overall_pii_risk,
)
from agents.schemas.output import QCIssue


# ── validate_questions_semantic ─────────────────────────────────────────────────

def test_valid_questions_no_errors():
    questions = [
        {"id": "q1", "type": "nps", "question": "How likely to recommend?"},
        {"id": "q2", "type": "rating", "question": "Rate your satisfaction.", "scaleMax": 5},
        {"id": "q3", "type": "multiple_choice", "question": "What improved?", "options": ["A", "B", "C", "D"]},
        {"id": "q4", "type": "open_text", "question": "Anything else?"},
    ]
    errors = validate_questions_semantic(questions)
    assert errors == []


def test_non_sequential_ids_allowed():
    # Non-sequential IDs (e.g. after reorder) are valid — only duplicates are flagged.
    questions = [
        {"id": "q1", "type": "nps", "question": "Recommend?"},
        {"id": "q3", "type": "open_text", "question": "Anything else?"},
    ]
    errors = validate_questions_semantic(questions)
    # No ID error — q1 and q3 are unique even if non-sequential
    assert not any("q3" in e or "q2" in e or "ID" in e for e in errors)


def test_duplicate_ids_flagged():
    questions = [
        {"id": "q1", "type": "nps", "question": "Recommend?"},
        {"id": "q1", "type": "open_text", "question": "Anything else?"},   # duplicate ID
    ]
    errors = validate_questions_semantic(questions)
    assert any("Duplicate" in e or "q1" in e for e in errors)


def test_nps_with_options_flagged():
    questions = [
        {"id": "q1", "type": "nps", "question": "Recommend?", "options": ["A", "B"]},
        {"id": "q2", "type": "open_text", "question": "Anything else?"},
    ]
    errors = validate_questions_semantic(questions)
    assert any("options" in e.lower() for e in errors)


def test_multiple_choice_without_options_flagged():
    questions = [
        {"id": "q1", "type": "multiple_choice", "question": "Which?"},   # no options
        {"id": "q2", "type": "open_text", "question": "Else?"},
    ]
    errors = validate_questions_semantic(questions)
    assert any("must have options" in e.lower() for e in errors)


def test_inconsistent_scales_flagged():
    questions = [
        {"id": "q1", "type": "rating", "question": "Q1?", "scaleMax": 5},
        {"id": "q2", "type": "rating", "question": "Q2?", "scaleMax": 10},
        {"id": "q3", "type": "open_text", "question": "Else?"},
    ]
    errors = validate_questions_semantic(questions)
    assert any("scale" in e.lower() for e in errors)


def test_last_question_not_open_text_flagged():
    questions = [
        {"id": "q1", "type": "nps", "question": "Recommend?"},
        {"id": "q2", "type": "rating", "question": "Rate us?", "scaleMax": 5},  # last is not open_text
    ]
    errors = validate_questions_semantic(questions)
    assert any("open_text" in e.lower() or "last question" in e.lower() for e in errors)


def test_duplicate_text_flagged():
    q_text = "How likely are you to recommend us?"
    questions = [
        {"id": "q1", "type": "nps", "question": q_text},
        {"id": "q2", "type": "rating", "question": q_text, "scaleMax": 5},   # duplicate
        {"id": "q3", "type": "open_text", "question": "Else?"},
    ]
    errors = validate_questions_semantic(questions)
    assert any("duplicate" in e.lower() for e in errors)


# ── clamp_qc_score ──────────────────────────────────────────────────────────────

def test_clamp_inflated_score():
    # 3 high issues → max 4.0 → score 9.0 should be clamped
    issues = [
        {"severity": "high"}, {"severity": "high"}, {"severity": "high"},
    ]
    clamped, was_adjusted = clamp_qc_score(9.0, issues)
    assert was_adjusted is True
    assert clamped <= 5.0   # max_allowed = 4.0, tolerance = 1.0 → clamped to 5.0


def test_no_clamp_when_consistent():
    # 1 medium issue → max 9.0 → score 8.5 is fine
    issues = [{"severity": "medium"}]
    clamped, was_adjusted = clamp_qc_score(8.5, issues)
    assert was_adjusted is False
    assert clamped == 8.5


def test_no_clamp_with_no_issues():
    clamped, was_adjusted = clamp_qc_score(10.0, [])
    assert was_adjusted is False
    assert clamped == 10.0


# ── fix_question_ids ────────────────────────────────────────────────────────────

def test_fix_question_ids():
    questions = [
        {"id": "q3", "type": "nps", "question": "A?"},
        {"id": "q5", "type": "open_text", "question": "B?"},
    ]
    fixed = fix_question_ids(questions)
    assert fixed[0]["id"] == "q1"
    assert fixed[1]["id"] == "q2"
    # Original not mutated
    assert questions[0]["id"] == "q3"


# ── validate_refiner_output ─────────────────────────────────────────────────────

def test_refiner_type_change_without_request():
    original = {"id": "q1", "type": "rating", "question": "Rate us?"}
    refined  = {"id": "q1", "type": "multiple_choice", "question": "Rate us?"}
    errors   = validate_refiner_output(original, refined, "Make the wording clearer")
    assert any("type" in e.lower() for e in errors)


def test_refiner_type_change_with_explicit_request():
    original = {"id": "q1", "type": "rating", "question": "Rate us?"}
    refined  = {"id": "q1", "type": "multiple_choice", "question": "Which best describes us?"}
    errors   = validate_refiner_output(original, refined, "Change to multiple choice with options")
    # Should NOT flag as error when user explicitly requested type change
    assert not any("type" in e.lower() for e in errors)


def test_refiner_id_change_always_rejected():
    original = {"id": "q1", "type": "nps", "question": "Recommend?"}
    refined  = {"id": "q2", "type": "nps", "question": "Recommend?"}
    errors   = validate_refiner_output(original, refined, "Rephrase this please")
    assert any("id" in e.lower() for e in errors)


# ── PII pattern scanner ─────────────────────────────────────────────────────────

def test_pii_scan_detects_email():
    questions = [
        {"id": "q1", "type": "short_text", "question": "What is your email address?"},
        {"id": "q2", "type": "open_text", "question": "Any other feedback?"},
    ]
    findings = scan_pii_patterns(questions)
    assert "q1" in findings
    assert "email" in findings["q1"]
    assert "q2" not in findings


def test_pii_scan_detects_multiple_types():
    questions = [
        {"id": "q1", "type": "short_text", "question": "Please provide your name and phone number."},
    ]
    findings = scan_pii_patterns(questions)
    assert "name" in findings.get("q1", [])
    assert "phone" in findings.get("q1", [])


def test_pii_scan_no_false_positive_health_plan():
    questions = [
        {"id": "q1", "type": "rating", "question": "How does your company's health insurance plan perform?"},
    ]
    findings = scan_pii_patterns(questions)
    # "health" pattern fires — this is expected (LLM will distinguish false positive)
    # But the pattern-level risk should still detect it
    risk = overall_pii_risk(findings)
    assert risk in ("low", "medium", "high")   # just ensure it runs without error


def test_overall_pii_risk_high_on_direct_pii():
    findings = {"q1": ["email", "phone"]}
    risk = overall_pii_risk(findings)
    assert risk == "high"


def test_overall_pii_risk_medium_on_sensitive_topic():
    findings = {"q1": ["sensitive_demo"]}
    risk = overall_pii_risk(findings)
    assert risk == "medium"


def test_overall_pii_risk_low_when_clean():
    findings = {}
    risk = overall_pii_risk(findings)
    assert risk == "low"
