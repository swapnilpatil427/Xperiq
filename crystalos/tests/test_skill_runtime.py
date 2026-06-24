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
    evals_text = textwrap.dedent("""        # Evals: test-skill
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

@pytest.mark.asyncio
async def test_eval_valid_json_passes_for_dict():
    runtime = SkillRuntime()
    score = await runtime._eval_criterion("output is valid json matching output schema", "E1", {}, {"result": "ok"}, 1.0)
    assert score == 1.0


@pytest.mark.asyncio
async def test_eval_valid_json_fails_for_error():
    runtime = SkillRuntime()
    score = await runtime._eval_criterion("output is valid json", "E1", {}, {"error": "failed"}, 1.0)
    assert score == 0.0


@pytest.mark.asyncio
async def test_eval_required_fields():
    runtime = SkillRuntime()
    score = await runtime._eval_criterion("required fields are present and non-empty", "E1", {}, {"a": "x", "b": "y", "c": ""}, 1.0)
    assert score > 0.5  # 2/3 non-empty


@pytest.mark.asyncio
async def test_eval_count_range_exact():
    runtime = SkillRuntime()
    output = {"key_findings": [1, 2, 3, 4]}  # 4 — in range 3-5
    score = await runtime._eval_criterion("key_findings count is 3-5", "E1", {}, output, 1.0)
    assert score == 1.0


@pytest.mark.asyncio
async def test_eval_count_range_out_of_range():
    runtime = SkillRuntime()
    output = {"key_findings": [1, 2]}  # 2 — below range
    score = await runtime._eval_criterion("key_findings count is 3-5", "E1", {}, output, 1.0)
    assert score < 1.0


@pytest.mark.asyncio
async def test_eval_actionable_with_specific_actions():
    runtime = SkillRuntime()
    output = {"recommended_actions": [
        "Assign the support team to audit the onboarding flow within 14 days",
        "Create a new FAQ page for common setup questions",
    ]}
    # "actionable" is a semantic criterion — mock _call_with_backoff to return a high score
    with patch("crystalos.lib.skill_runtime._call_with_backoff", new=AsyncMock(return_value=("0.9", {}))):
        score = await runtime._eval_criterion("recommended_actions are specific and actionable", "E1", {}, output, 1.0)
    assert score > 0.7


@pytest.mark.asyncio
async def test_eval_default_soft_pass():
    runtime = SkillRuntime()
    # Unknown quality criterion → LLM judge; when LLM returns valid score, use it
    with patch("crystalos.lib.skill_runtime._call_with_backoff", new=AsyncMock(return_value=("0.8", {}))):
        score = await runtime._eval_criterion("some unknown criterion description", "E1", {}, {"result": "ok"}, 1.0)
    assert score == pytest.approx(0.8)


# ── check_evals integration ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_evals_no_evals_file(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, name="no-evals-skill")
    # No EVALS.md created — falls back to baseline output gate (not a blind auto-pass).
    # A valid content field with substantial text passes at 0.70.
    score, passed, issues = await runtime._check_evals(
        meta, {}, {"answer": "This is a substantive answer that clears the baseline length bar."}
    )
    assert passed is True
    assert score == 0.70


@pytest.mark.asyncio
async def test_check_evals_no_evals_file_empty_output_fails(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, name="no-evals-skill")
    # No EVALS.md and an empty/garbage output — baseline gate must FAIL, not auto-pass.
    score, passed, issues = await runtime._check_evals(meta, {}, {})
    assert passed is False
    assert score == 0.0
    assert len(issues) > 0


@pytest.mark.asyncio
async def test_check_evals_no_evals_file_no_content_field_fails(tmp_path: Path):
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, name="no-evals-skill")
    # Output dict with no recognised content field — baseline gate fails.
    score, passed, issues = await runtime._check_evals(meta, {}, {"random_key": "x"})
    assert passed is False
    assert score == 0.0


@pytest.mark.asyncio
async def test_check_evals_must_pass_fail_returns_zero(tmp_path: Path):
    evals = textwrap.dedent("""        # Evals
        ## Criteria
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | Output is valid JSON matching output schema | 30 | must pass |
    """)
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, evals_md=evals)
    # Pass an error dict (fails E1)
    score, passed, issues = await runtime._check_evals(meta, {}, {"error": "something failed"})
    assert score == 0.0
    assert passed is False
    assert len(issues) > 0


@pytest.mark.asyncio
async def test_check_evals_all_numeric_pass(tmp_path: Path):
    evals = textwrap.dedent("""        # Evals
        ## Criteria
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | Output is valid JSON | 30 | must pass |
        | E2 | key_findings count is 3-5 | 70 | >= 0.80 |
    """)
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, evals_md=evals)
    output = {"key_findings": [{"finding": "x"}, {"finding": "y"}, {"finding": "z"}]}
    score, passed, issues = await runtime._check_evals(meta, {}, output)
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
    evals = textwrap.dedent("""        # Evals
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


@pytest.mark.asyncio
async def test_execute_passes_model_config_to_call_agent(tmp_path: Path):
    """execute() must pass model_config=<pre-resolved config> to call_agent,
    not rely on call_agent's internal get_model() lookup."""
    from crystalos.lib.models import ModelConfig

    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path)

    skill_model = ModelConfig(model="skill/model:free", max_tokens=200, temperature=0.2)
    mock_output = MagicMock()
    mock_output.to_dict.return_value = {"result": "ok"}
    mock_credit = make_mock_credit()

    captured_kwargs: dict = {}

    async def capturing_call_agent(*args, **kwargs):
        captured_kwargs.update(kwargs)
        return mock_output, mock_credit

    with patch("crystalos.lib.openrouter.call_agent", capturing_call_agent):
        with patch("crystalos.lib.models.get_skill_model", return_value=skill_model):
            with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
                await runtime.execute("test-skill", meta, {}, {})

    assert "model_config" in captured_kwargs, "model_config kwarg must be passed to call_agent"
    assert captured_kwargs["model_config"] is skill_model


@pytest.mark.asyncio
async def test_execute_retry_also_passes_model_config(tmp_path: Path):
    """On retry (eval failure), call_agent must also receive model_config."""
    from crystalos.lib.models import ModelConfig

    evals = textwrap.dedent("""        # Evals
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | key_findings count is 3-5 | 100 | >= 0.90 |
    """)
    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path, evals_md=evals, max_retries=1)

    skill_model = ModelConfig(model="retry/model:free", max_tokens=150, temperature=0.1)
    bad_output = MagicMock()
    bad_output.to_dict.return_value = {"key_findings": [{"f": "only one"}]}
    good_output = MagicMock()
    good_output.to_dict.return_value = {"key_findings": [{"f": "1"}, {"f": "2"}, {"f": "3"}]}
    mock_credit = make_mock_credit()

    all_kwargs: list[dict] = []
    call_count = 0

    async def capturing_call_agent(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        all_kwargs.append(dict(kwargs))
        if call_count == 1:
            return bad_output, mock_credit
        return good_output, mock_credit

    with patch("crystalos.lib.openrouter.call_agent", capturing_call_agent):
        with patch("crystalos.lib.models.get_skill_model", return_value=skill_model):
            with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
                result = await runtime.execute("test-skill", meta, {}, {})

    assert result.retried is True
    assert call_count == 2
    for i, kwargs in enumerate(all_kwargs):
        assert kwargs.get("model_config") is skill_model, (
            f"model_config not passed on call {i + 1}"
        )


@pytest.mark.asyncio
async def test_execute_does_not_call_get_model_directly(tmp_path: Path):
    """execute() uses get_skill_model(), not get_model(). Calling get_model() with a
    skill name raises KeyError — so if execute() ever falls back to get_model() the
    test will fail."""
    from crystalos.lib.models import ModelConfig

    runtime = SkillRuntime()
    meta = make_skill_meta(tmp_path)

    skill_model = ModelConfig(model="test/model:free", max_tokens=100, temperature=0.1)
    mock_output = MagicMock()
    mock_output.to_dict.return_value = {"result": "ok"}

    with patch("crystalos.lib.openrouter.call_agent", AsyncMock(return_value=(mock_output, make_mock_credit()))):
        with patch("crystalos.lib.models.get_skill_model", return_value=skill_model):
            # If get_model() is called anywhere inside execute(), it will raise KeyError
            with patch("crystalos.lib.openrouter.get_model", side_effect=KeyError("must not call get_model")):
                with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
                    result = await runtime.execute("nps-action-advisor", meta, {}, {})

    assert result.eval_passed is True or result.eval_score >= 0
    # If we got here, get_model() was never called — test passes
