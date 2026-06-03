"""Tests for agents/lib/skill_runtime.py

Covers: SkillResult shape, eval parsing, eval checking, retry logic, example write.
All LLM calls are mocked — no real API calls.
"""
from __future__ import annotations

import json
import textwrap
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from crystalos.lib.skill_runtime import SkillResult, SkillRuntime


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_skill_meta(
    tmp_path: Path,
    name: str = "test-skill",
    body: str = "## Instructions\nReturn JSON.",
    evals_md: str | None = None,
    max_retries: int = 1,
    timeout: int = 30,
) -> dict:
    skill_dir = tmp_path / name
    skill_dir.mkdir(exist_ok=True)
    (skill_dir / "SKILL.md").write_text(f"---\nname: {name}\nversion: 1.0.0\n---\n{body}")

    if evals_md:
        (skill_dir / "EVALS.md").write_text(evals_md)

    return {
        "name": name,
        "version": "1.0.0",
        "shared": False,
        "description": "Test skill",
        "allowed_tools": [],
        "evals": "EVALS.md",
        "examples": "EXAMPLES.md",
        "max_output_tokens": 500,
        "max_retries": max_retries,
        "timeout_seconds": timeout,
        "_path": str(skill_dir / "SKILL.md"),
        "_dir": str(skill_dir),
        "_body": body,
    }


def make_mock_credit(model: str = "test-model", in_tok: int = 100, out_tok: int = 50):
    credit = MagicMock()
    credit.model = model
    credit.input_tokens = in_tok
    credit.output_tokens = out_tok
    return credit


# ── SkillResult dataclass ─────────────────────────────────────────────────────

def test_skill_result_fields():
    result = SkillResult(
        output={"result": "ok"},
        eval_score=0.9,
        eval_passed=True,
        eval_issues=[],
        retried=False,
        skill_name="test-skill",
        skill_version="1.0.0",
        model="gemini-flash",
        tokens_used=150,
        latency_ms=234.5,
    )
    assert result.output == {"result": "ok"}
    assert result.eval_score == 0.9
    assert result.eval_passed is True
    assert result.reasoning_trace == {}  # default


# ── Eval parsing ──────────────────────────────────────────────────────────────

def test_parse_evals_md_extracts_criteria():
    runtime = SkillRuntime()
    evals_text = textwrap.dedent("""\
        # Evals: test-skill
        ## Criteria
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | Output is valid JSON | 30 | must pass |
        | E2 | key_findings count is 3-5 | 40 | >= 0.80 |
        | E3 | actionable recommendations | 30 | >= 0.75 |
    """)
    criteria = runtime._parse_evals_md(evals_text)
    assert len(criteria) == 3
    assert criteria[0]["id"] == "E1"
    assert criteria[0]["threshold"] == "must pass"
    assert criteria[1]["weight"] == 40.0
    assert criteria[2]["threshold"] == ">= 0.75"


def test_parse_evals_md_empty_returns_empty():
    runtime = SkillRuntime()
    criteria = runtime._parse_evals_md("# No table here\nJust text.")
    assert criteria == []


# ── Eval criterion evaluation ─────────────────────────────────────────────────

def test_eval_valid_json_passes_for_dict():
    runtime = SkillRuntime()
    score = runtime._eval_criterion("output is valid json matching output schema", {}, {"result": "ok"})
    assert score == 1.0


def test_eval_valid_json_fails_for_error():
    runtime = SkillRuntime()
    score = runtime._eval_criterion("output is valid json", {}, {"error": "failed"})
    assert score == 0.0


def test_eval_required_fields():
    runtime = SkillRuntime()
    score = runtime._eval_criterion("required fields are present and non-empty", {}, {"a": "x", "b": "y", "c": ""})
    assert score > 0.5  # 2/3 non-empty


def test_eval_count_range_exact():
    runtime = SkillRuntime()
    output = {"key_findings": [1, 2, 3, 4]}  # 4 — in range 3-5
    score = runtime._eval_criterion("key_findings count is 3-5", {}, output)
    assert score == 1.0


def test_eval_count_range_out_of_range():
    runtime = SkillRuntime()
    output = {"key_findings": [1, 2]}  # 2 — below range
    score = runtime._eval_criterion("key_findings count is 3-5", {}, output)
    assert score < 1.0


def test_eval_actionable_with_specific_actions():
    runtime = SkillRuntime()
    output = {"recommended_actions": [
        "Assign the support team to audit the onboarding flow within 14 days",
        "Create a new FAQ page for common setup questions",
    ]}
    score = runtime._eval_criterion("recommended_actions are specific and actionable", {}, output)
    assert score > 0.7


def test_eval_default_soft_pass():
    runtime = SkillRuntime()
    score = runtime._eval_criterion("some unknown criterion description", {}, {"result": "ok"})
    assert score == 0.8  # Default


# ── check_evals integration ────────────────────────────────────────────────────

def test_check_evals_no_evals_file(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, name="no-evals-skill")
    # No EVALS.md created — should soft pass
    score, passed, issues = runtime._check_evals(meta, {}, {"result": "ok"})
    assert passed is True
    assert score == 0.85


def test_check_evals_must_pass_fail_returns_zero(tmp_path: Path):
    evals = textwrap.dedent("""\
        # Evals
        ## Criteria
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | Output is valid JSON matching output schema | 30 | must pass |
    """)
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, evals_md=evals)
    # Pass an error dict (fails E1)
    score, passed, issues = runtime._check_evals(meta, {}, {"error": "something failed"})
    assert score == 0.0
    assert passed is False
    assert len(issues) > 0


def test_check_evals_all_numeric_pass(tmp_path: Path):
    evals = textwrap.dedent("""\
        # Evals
        ## Criteria
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | Output is valid JSON | 30 | must pass |
        | E2 | key_findings count is 3-5 | 70 | >= 0.80 |
    """)
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, evals_md=evals)
    output = {"key_findings": [{"finding": "x"}, {"finding": "y"}, {"finding": "z"}]}
    score, passed, issues = runtime._check_evals(meta, {}, output)
    assert score >= 0.75


# ── System prompt building ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_build_system_includes_body(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, body="## Test\nMy special instructions.")
    # Mock _fetch_examples to return empty
    with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
        system = await runtime._build_system(meta, {})
    assert "My special instructions" in system


@pytest.mark.asyncio
async def test_build_system_includes_references(tmp_path: Path):
    skill_dir = tmp_path / "ref-skill"
    skill_dir.mkdir()
    refs_dir = skill_dir / "references"
    refs_dir.mkdir()
    (refs_dir / "best-practices.md").write_text("# XM Best Practices\nNPS should be measured quarterly.")

    meta = {
        "name": "ref-skill",
        "version": "1.0.0",
        "_dir": str(skill_dir),
        "_body": "## Context\nI use references.",
        "evals": "EVALS.md",
        "examples": "EXAMPLES.md",
        "max_output_tokens": 500,
        "max_retries": 1,
        "timeout_seconds": 30,
    }
    runtime = SkillRuntime()
    with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
        system = await runtime._build_system(meta, {})
    assert "NPS should be measured quarterly" in system


@pytest.mark.asyncio
async def test_build_system_includes_examples(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, body="## Instructions\nUse examples.")
    examples = [
        {"input_json": {"q": "What is NPS?"}, "output_json": {"answer": "NPS is..."}, "eval_score": 0.9}
    ]
    with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=examples)):
        system = await runtime._build_system(meta, {})
    assert "High-Quality Examples from Production" in system
    assert "What is NPS?" in system


# ── Execute with mocked LLM ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_returns_skill_result(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path)

    mock_output = MagicMock()
    mock_output.to_dict.return_value = {"result": "success", "findings": ["f1", "f2", "f3"]}
    mock_credit = make_mock_credit()

    with patch("crystalos.lib.openrouter.call_agent", AsyncMock(return_value=(mock_output, mock_credit))):
        with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
            result = await runtime.execute("test-skill", meta, {"input": "test"}, {"org_id": "org1"})

    assert isinstance(result, SkillResult)
    assert result.skill_name == "test-skill"
    assert result.skill_version == "1.0.0"
    assert result.output == {"result": "success", "findings": ["f1", "f2", "f3"]}
    assert result.tokens_used == 150
    assert result.latency_ms > 0


@pytest.mark.asyncio
async def test_execute_retries_on_eval_failure(tmp_path: Path):
    evals = textwrap.dedent("""\
        # Evals
        ## Criteria
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | Output is valid JSON | 30 | must pass |
        | E2 | key_findings count is 3-5 | 70 | >= 0.80 |
    """)
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, evals_md=evals, max_retries=1)

    # First call returns bad output (only 1 finding), second returns good output
    bad_output = MagicMock()
    bad_output.to_dict.return_value = {"key_findings": [{"f": "only one"}]}
    good_output = MagicMock()
    good_output.to_dict.return_value = {"key_findings": [{"f": "one"}, {"f": "two"}, {"f": "three"}]}
    mock_credit = make_mock_credit()

    call_count = 0

    async def mock_call_agent(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return bad_output, mock_credit
        return good_output, mock_credit

    with patch("crystalos.lib.openrouter.call_agent", mock_call_agent):
        with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
            result = await runtime.execute("test-skill", meta, {}, {})

    assert result.retried is True
    assert call_count == 2


@pytest.mark.asyncio
async def test_execute_timeout_returns_error_result(tmp_path: Path):
    import asyncio
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, timeout=1)

    async def slow_call(*args, **kwargs):
        await asyncio.sleep(10)  # Much longer than timeout

    with patch("crystalos.lib.openrouter.call_agent", slow_call):
        with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
            result = await runtime.execute("test-skill", meta, {}, {})

    assert result.eval_passed is False
    assert "Timed out" in (result.output.get("error") or "")
    assert result.eval_score == 0.0


@pytest.mark.asyncio
async def test_execute_exception_returns_error_result(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path)

    with patch("crystalos.lib.openrouter.call_agent", AsyncMock(side_effect=RuntimeError("API down"))):
        with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
            result = await runtime.execute("test-skill", meta, {}, {})

    assert result.eval_passed is False
    assert "API down" in result.output.get("error", "")
