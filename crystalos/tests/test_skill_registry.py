"""Tests for agents/lib/skill_registry.py

Covers: SKILL.md discovery, frontmatter parsing, skill lookup, execute delegation.
All tests are offline — no LLM calls, no DB connections required.
"""
from __future__ import annotations

import asyncio
import textwrap
from pathlib import Path

import pytest
import pytest_asyncio

from crystalos.lib.skill_registry import SkillRegistry, get_registry


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_skill_dir(tmp_path: Path) -> Path:
    """Create a minimal skill directory for testing."""
    skill_dir = tmp_path / "test-skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(textwrap.dedent("""\
        ---
        name: test-skill
        version: 1.2.3
        shared: true
        description: |
          A test skill that generates test outputs from test inputs.
          Useful for unit testing the skill registry.
        allowed-tools: get_topics get_metrics
        evals: EVALS.md
        examples: EXAMPLES.md
        max_output_tokens: 500
        max_retries: 0
        timeout_seconds: 10
        ---

        ## Context
        You are a test skill.

        ## Instructions
        Return a JSON with {"result": "ok"}.
    """))
    (skill_dir / "EVALS.md").write_text(textwrap.dedent("""\
        # Evals: test-skill
        ## Criteria
        | ID | Criterion | Weight | Threshold |
        |----|-----------|--------|-----------|
        | E1 | Output is valid JSON | 30 | must pass |
        | E2 | result field present | 70 | >= 0.80 |
    """))
    return tmp_path


@pytest.fixture
def registry(tmp_skill_dir: Path) -> SkillRegistry:
    return SkillRegistry(skills_dir=tmp_skill_dir)


@pytest.fixture
def initialized_registry(registry: SkillRegistry) -> SkillRegistry:
    registry._scan_skills()
    return registry


# ── Scan / Parse tests ────────────────────────────────────────────────────────

def test_scan_finds_skill(initialized_registry: SkillRegistry) -> None:
    assert "test-skill" in initialized_registry._skills


def test_parse_frontmatter_fields(initialized_registry: SkillRegistry) -> None:
    meta = initialized_registry.get_skill_meta("test-skill")
    assert meta is not None
    assert meta["name"] == "test-skill"
    assert meta["version"] == "1.2.3"
    assert meta["shared"] is True
    assert meta["allowed_tools"] == ["get_topics", "get_metrics"]
    assert meta["max_output_tokens"] == 500
    assert meta["max_retries"] == 0
    assert meta["timeout_seconds"] == 10


def test_parse_body_content(initialized_registry: SkillRegistry) -> None:
    meta = initialized_registry.get_skill_meta("test-skill")
    assert meta is not None
    assert "You are a test skill" in meta["_body"]


def test_malformed_frontmatter_skipped(tmp_path: Path) -> None:
    """A SKILL.md with unclosed --- should be skipped, not crash."""
    bad_skill = tmp_path / "bad-skill"
    bad_skill.mkdir()
    (bad_skill / "SKILL.md").write_text("---\nname: bad-skill\n# no closing ---\n\nBody here")
    reg = SkillRegistry(skills_dir=tmp_path)
    reg._scan_skills()
    assert "bad-skill" not in reg._skills


def test_missing_name_field_skipped(tmp_path: Path) -> None:
    bad_skill = tmp_path / "nameless-skill"
    bad_skill.mkdir()
    (bad_skill / "SKILL.md").write_text("---\nversion: 1.0.0\n---\nBody")
    reg = SkillRegistry(skills_dir=tmp_path)
    reg._scan_skills()
    # Should log warning but not crash
    assert len(reg._skills) == 0


# ── Discovery tests ───────────────────────────────────────────────────────────

def test_find_by_exact_name(initialized_registry: SkillRegistry) -> None:
    result = initialized_registry.find_sync("test-skill")
    assert result == "test-skill"


def test_find_by_description_keywords(initialized_registry: SkillRegistry) -> None:
    result = initialized_registry.find_sync("generates test outputs")
    assert result == "test-skill"


def test_find_no_match_returns_none(initialized_registry: SkillRegistry) -> None:
    result = initialized_registry.find_sync("completely unrelated xyzzy")
    assert result is None


def test_find_empty_registry() -> None:
    reg = SkillRegistry()
    result = reg.find_sync("anything")
    assert result is None


# ── list_skills tests ─────────────────────────────────────────────────────────

def test_list_skills_returns_public_fields(initialized_registry: SkillRegistry) -> None:
    skills = initialized_registry.list_skills()
    assert len(skills) == 1
    skill = skills[0]
    assert skill["name"] == "test-skill"
    assert skill["version"] == "1.2.3"
    assert skill["shared"] is True
    assert "_body" not in skill  # Private field should not be exposed
    assert "_path" not in skill


# ── Multiple skills tests ─────────────────────────────────────────────────────

def test_multiple_skills_loaded(tmp_path: Path) -> None:
    for skill_name in ["alpha-skill", "beta-skill", "gamma-skill"]:
        d = tmp_path / skill_name
        d.mkdir()
        (d / "SKILL.md").write_text(
            f"---\nname: {skill_name}\nversion: 1.0.0\nshared: false\n"
            f"description: |\n  The {skill_name} skill.\n"
            f"evals: EVALS.md\nexamples: EXAMPLES.md\n---\nBody of {skill_name}"
        )
    reg = SkillRegistry(skills_dir=tmp_path)
    reg._scan_skills()
    assert len(reg._skills) == 3
    assert "alpha-skill" in reg._skills
    assert "beta-skill" in reg._skills
    assert "gamma-skill" in reg._skills


def test_duplicate_name_skipped(tmp_path: Path) -> None:
    """Second skill with same name should be skipped."""
    for subdir in ["dir1", "dir2"]:
        d = tmp_path / subdir / "same-name"
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text(
            "---\nname: same-name\nversion: 1.0.0\nshared: false\n"
            "description: |\n  Duplicate skill.\nevals: EVALS.md\nexamples: EXAMPLES.md\n---\nBody"
        )
    reg = SkillRegistry(skills_dir=tmp_path)
    reg._scan_skills()
    assert len(reg._skills) == 1


# ── Hot reload tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reload_detects_new_file(tmp_path: Path) -> None:
    """Registry detects a new SKILL.md added after initialization."""
    reg = SkillRegistry(skills_dir=tmp_path)
    reg._scan_skills()
    assert len(reg._skills) == 0

    new_skill = tmp_path / "new-skill"
    new_skill.mkdir()
    (new_skill / "SKILL.md").write_text(
        "---\nname: new-skill\nversion: 1.0.0\nshared: false\n"
        "description: |\n  New skill.\nevals: EVALS.md\nexamples: EXAMPLES.md\n---\nBody"
    )
    await reg._reload_if_changed()
    assert "new-skill" in reg._skills


@pytest.mark.asyncio
async def test_reload_detects_modified_file(tmp_path: Path) -> None:
    """Registry reloads when a SKILL.md mtime changes."""
    skill_dir = tmp_path / "modifiable-skill"
    skill_dir.mkdir()
    skill_md = skill_dir / "SKILL.md"
    skill_md.write_text(
        "---\nname: modifiable-skill\nversion: 1.0.0\nshared: false\n"
        "description: |\n  Original description.\nevals: EVALS.md\nexamples: EXAMPLES.md\n---\nBody v1"
    )
    reg = SkillRegistry(skills_dir=tmp_path)
    reg._scan_skills()
    assert reg._skills["modifiable-skill"]["_body"].strip() == "Body v1"

    import time
    time.sleep(0.01)  # Ensure mtime changes
    skill_md.write_text(
        "---\nname: modifiable-skill\nversion: 1.1.0\nshared: false\n"
        "description: |\n  Updated description.\nevals: EVALS.md\nexamples: EXAMPLES.md\n---\nBody v2"
    )
    await reg._reload_if_changed()
    assert reg._skills["modifiable-skill"]["version"] == "1.1.0"


# ── Integration: execute raises on unknown skill ───────────────────────────────

@pytest.mark.asyncio
async def test_execute_unknown_skill_raises(initialized_registry: SkillRegistry) -> None:
    with pytest.raises(ValueError, match="not found"):
        await initialized_registry.execute("nonexistent-skill", {}, {})


# ── Real skills directory smoke test ─────────────────────────────────────────

def test_real_skills_directory_loads() -> None:
    """Smoke test: real agents/skills/ directory should load without errors."""
    real_skills_dir = Path(__file__).parent.parent / "skills"
    if not real_skills_dir.exists():
        pytest.skip("agents/skills/ directory not found")
    reg = SkillRegistry(skills_dir=real_skills_dir)
    reg._scan_skills()
    # Should load at least the skills we created
    expected = [
        "insight-narrator", "specialist-nps", "specialist-ces",
        "specialist-csat", "survey-qc", "crystal-analyst",
    ]
    for skill_name in expected:
        assert skill_name in reg._skills, f"Expected skill {skill_name!r} not found"
