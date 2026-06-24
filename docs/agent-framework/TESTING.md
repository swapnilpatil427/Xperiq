> **Moved:** Authoritative copy lives in [`crystalos/TESTING.md`](../../crystalos/TESTING.md). This copy is kept here for design-doc cross-reference only.

# CrystalOS Framework Testing Guide

---

## Running Tests

### Framework unit tests (fast, offline, no LLM calls)

```bash
cd crystalos
.venv/bin/pytest tests/test_pii_scrubber.py \
                 tests/test_skill_registry.py \
                 tests/test_skill_runtime.py \
                 tests/test_tool_dispatcher.py \
                 tests/test_memory.py \
                 tests/test_hallucination_scorer.py \
                 -v --tb=short
```

Expected: **~60 tests, < 2 seconds**. All offline.

### Full test suite

```bash
cd crystalos && .venv/bin/pytest
```

Expected: **580+ tests, ~35 seconds**. No LLM calls, no DB required.

### Specific skill registry test

```bash
.venv/bin/pytest tests/test_skill_registry.py::test_real_skills_directory_loads -v
```

Verifies all 13 skills load from `crystalos/skills/`.

---

## Environment Variables for Tests

| Variable | Value for tests | Required |
|----------|----------------|----------|
| `AGENTS_ENV` | `dev` | No (default) |
| `DATABASE_URL` | local postgres | For DB-dependent tests only |
| `REDIS_URL` | local redis | For Redis-dependent tests only |
| `OPENROUTER_API_KEY` | your key | For LLM integration tests only |
| `USE_SKILL_RUNTIME` | `true` | For skill routing tests |

Most tests mock external dependencies and work without any env vars.

---

## Writing a New Skill Test

Create `crystalos/tests/test_skills/test_<skill-name>.py`:

```python
"""Tests for the my-new-skill CrystalOS skill."""
from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from agents.lib.skill_registry import SkillRegistry
from agents.lib.skill_runtime import SkillRuntime


# ── Fixture: skill directory ──────────────────────────────────────────────────

def test_skill_loads_from_registry():
    """Smoke test: skill is discovered and frontmatter is valid."""
    real_skills_dir = Path(__file__).parent.parent.parent / "skills"
    reg = SkillRegistry(skills_dir=real_skills_dir)
    reg._scan_skills()
    meta = reg.get_skill_meta("my-new-skill")
    assert meta is not None, "my-new-skill not found in registry"
    assert meta["version"].count(".") == 2  # semver
    assert meta["timeout_seconds"] > 0


def test_skill_evals_md_exists():
    """EVALS.md must exist and have at least one criterion."""
    skills_dir = Path(__file__).parent.parent.parent / "skills"
    evals_path = skills_dir / "my-new-skill" / "EVALS.md"
    assert evals_path.exists(), "EVALS.md missing"
    content = evals_path.read_text()
    assert "| E1 |" in content, "EVALS.md must have at least one criterion row"


@pytest.mark.asyncio
async def test_skill_executes_successfully(tmp_path: Path):
    """End-to-end execution with mocked LLM."""
    runtime = SkillRuntime()

    # Use real skill meta from the skills directory
    reg = SkillRegistry(skills_dir=Path(__file__).parent.parent.parent / "skills")
    reg._scan_skills()
    meta = reg.get_skill_meta("my-new-skill")
    assert meta is not None

    # Mock LLM output — must match your skill's output schema
    mock_output = MagicMock()
    mock_output.to_dict.return_value = {
        "emerging_themes": [
            {"theme": "Test theme", "description": "Found in 3 responses",
             "supporting_responses": ["r1", "r2", "r3"], "confidence": 0.8}
        ],
        "confidence": 0.8,
    }
    mock_credit = MagicMock()
    mock_credit.model = "test-model"
    mock_credit.input_tokens = 100
    mock_credit.output_tokens = 50

    test_input = {
        "survey_id": "test-survey",
        "responses": [
            {"id": "r1", "text": "The pricing is confusing"},
            {"id": "r2", "text": "I don't understand the pricing tiers"},
            {"id": "r3", "text": "Pricing model needs clarification"},
        ],
        "existing_topics": [{"label": "Support", "description": "Customer support experience"}],
    }

    with patch("agents.lib.openrouter.call_agent", AsyncMock(return_value=(mock_output, mock_credit))):
        with patch.object(runtime, "_fetch_examples", AsyncMock(return_value=[])):
            result = await runtime.execute("my-new-skill", meta, test_input, {"org_id": "test-org"})

    assert result.skill_name == "my-new-skill"
    assert "emerging_themes" in result.output
    assert result.tokens_used == 150
    assert result.latency_ms > 0
```

---

## Test Coverage Goals

| Module | Goal | Current |
|--------|------|---------|
| `pii_scrubber.py` | 100% | ✅ 100% |
| `skill_registry.py` | 90%+ | ✅ ~95% |
| `skill_runtime.py` | 85%+ | ✅ ~90% |
| `tool_dispatcher.py` | 85%+ | ✅ ~90% |
| `memory.py` | 80%+ | ✅ ~85% |
| `hallucination_scorer.py` | 80%+ | ✅ ~85% |
| `tracer.py` | Smoke test | ✅ |

---

## Running Eval Suite (slow, costs money)

The evals in `crystalos/evals/` make real LLM calls and measure output quality. Run before deploying prompt changes.

```bash
# Requires OPENROUTER_API_KEY
cd crystalos && OPENROUTER_API_KEY=xxx .venv/bin/pytest evals/ -v
```

Expected runtime: 5-15 minutes. Costs ~$0.10-0.50 depending on model.

---

## CI Matrix

```yaml
# .github/workflows/test.yml (or equivalent)

# Fast (on every PR, < 60 seconds)
- name: Unit tests
  run: cd crystalos && .venv/bin/pytest tests/ -q

# Slow (on main branch only)
- name: Eval suite  
  run: cd crystalos && .venv/bin/pytest evals/ -v
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
```

---

## Skill Discovery Smoke Test

After adding any new SKILL.md, run this to verify it's discovered:

```bash
cd /path/to/project
agents/.venv/bin/python -c "
from agents.lib.skill_registry import SkillRegistry
from pathlib import Path
reg = SkillRegistry(skills_dir=Path('agents/skills'))
reg._scan_skills()
print(f'Found {len(reg._skills)} skills:')
for name in sorted(reg._skills):
    print(f'  - {name}')
"
```

Expected output should include all 13 skills plus any new ones you added.
