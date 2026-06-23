
# Adding a New CrystalOS Skill — Quick Start

**Time:** ~10 minutes  
**Prerequisites:** Repo cloned, agents service running locally

---

## What is a Skill?

A skill is the complete definition of one AI capability. One folder, one capability. No Python class, no graph wiring.

```
crystalos/skills/my-new-skill/
  SKILL.md       ← the brain: instructions, schema, tool access
  EVALS.md       ← quality criteria evaluated after every run
  EXAMPLES.md    ← auto-populated from production runs (don't edit)
  references/    ← optional domain knowledge files
```

The skill runtime reads SKILL.md at execution time, calls the LLM, checks EVALS.md, and optionally retries once on failure.

---

## Step 1 — Create the folder

```bash
mkdir -p crystalos/skills/my-new-skill/references
```

---

## Step 2 — Write SKILL.md

SKILL.md has two parts: a YAML frontmatter block and a markdown prompt body.

```markdown
---
name: my-new-skill
version: 1.0.0
shared: false
description: |
  Analyzes survey responses to identify emerging themes not covered by existing topics.
  Input: responses[], existing_topics[]. Output: emerging_themes[], confidence.
  Best used when topic_count < 5 and response_count > 50.
allowed-tools: get_verbatims get_topic_details
evals: EVALS.md
examples: EXAMPLES.md
max_output_tokens: 1000
max_retries: 1
timeout_seconds: 30
---

## Context

You are a theme discovery specialist embedded in the CrystalOS.
Your job is to identify patterns in survey responses that existing topic clusters don't capture.

## Input Schema

```json
{
  "survey_id": "string",
  "responses": [{"id": "string", "text": "string"}],
  "existing_topics": [{"label": "string", "description": "string"}]
}
```

## Output Schema

```json
{
  "emerging_themes": [
    {
      "theme": "string",
      "description": "string",
      "supporting_responses": ["response_id"],
      "confidence": "float (0-1)"
    }
  ],
  "confidence": "float (0-1)"
}
```

## Instructions

1. Read each response and identify recurring language patterns not covered by existing_topics
2. Group responses that share similar language or concerns
3. For each group of 3+ responses: propose an emerging_theme
4. Include supporting_responses (IDs) for each theme
5. Only include themes with confidence >= 0.6

## Quality Standards

- Do not duplicate existing_topics
- Each theme must have at least 3 supporting responses
- Confidence should reflect how distinct and consistent the pattern is
```

### Frontmatter Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | kebab-case, max 64 chars, globally unique |
| `version` | yes | semver — bump minor for prompt edits, major for schema breaks |
| `shared` | yes | `true` = available to all orgs; `false` = internal only |
| `description` | yes | LLM-readable, includes input/output shape (max 1024 chars) |
| `compatibility` | no | State preconditions and known limitations |
| `allowed-tools` | no | Space-delimited tool names from plugin.json |
| `max_output_tokens` | no | Default: model max |
| `max_retries` | no | Default: 1 |
| `timeout_seconds` | no | Default: 60 |

---

## Step 3 — Write EVALS.md

EVALS.md defines what "good" means for this skill. The runtime checks these after every execution.

```markdown
# Evals: my-new-skill

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | emerging_themes and confidence fields present and non-empty | 20 | must pass |
| E3 | Each theme has at least 1 supporting response ID | 25 | >= 0.85 |
| E4 | No theme duplicates existing_topics labels | 15 | >= 0.90 |
| E5 | confidence is float between 0.0 and 1.0 | 10 | must pass |

## Scoring

Score = weighted average of numeric-threshold criteria.
Hard-fail criteria (must pass) → score 0 if failed.
Pass threshold: overall score >= 0.75

## Failure Behavior

Inject failed criteria IDs and scores into retry context. Max 1 retry.
```

**Threshold types:**
- `must pass` — structural gate (valid JSON, required fields). Fail = score 0, no retry.
- `>= 0.XX` — weighted quality score. Fails below threshold trigger retry.

---

## Step 4 — Create EXAMPLES.md stub

```bash
cat > crystalos/skills/my-new-skill/EXAMPLES.md << 'EOF'
<!-- Auto-generated from skill_examples DB table. Do not edit manually. -->
<!-- Run: python -m agents.skills.generate_examples my-new-skill to refresh -->
EOF
```

---

## Step 5 — Register in plugin.json

Add your skill to `crystalos/skills/plugin.json`:

```json
{
  "name": "experient-core-skills",
  "version": "1.0.0",
  "skills": [
    "./insight-narrator",
    "./my-new-skill"
  ],
  "tools": { ... }
}
```

If your skill uses tools not yet registered, add them to the `"tools"` section:
```json
"tools": {
  "my_custom_tool": "agents.tools.my_module:my_function"
}
```

---

## Step 6 — Verify discovery

```bash
# From repo root
USE_SKILL_RUNTIME=true agents/.venv/bin/python -c "
import asyncio
from agents.lib.skill_registry import get_registry

async def main():
    reg = get_registry()
    await reg.initialize()
    meta = reg.get_skill_meta('my-new-skill')
    print('Found:', meta['name'], 'v' + meta['version'])
    print('Tools:', meta['allowed_tools'])

asyncio.run(main())
"
```

Or via the REST API (with the agents service running):

```bash
curl -H "X-Internal-Key: dev-internal-key-change-in-prod" \
     http://localhost:8001/agents/registry | jq '.skills[] | select(.name=="my-new-skill")'
```

---

## Step 7 — Test the skill

```bash
make .venv/bin/pytest tests/test_skill_registry.py::test_real_skills_directory_loads -v
```

Write a skill-specific test in `crystalos/tests/test_skills/`:

```python
import pytest
from agents.lib.skill_registry import SkillRegistry
from pathlib import Path

def test_my_new_skill_loads():
    reg = SkillRegistry()
    reg._scan_skills()
    meta = reg.get_skill_meta("my-new-skill")
    assert meta is not None
    assert meta["version"] == "1.0.0"
    assert "get_verbatims" in meta["allowed_tools"]
```

---

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Missing `---` at start of SKILL.md | Skill not discovered | Add `---` on the very first line |
| Unclosed frontmatter (`---` missing at end) | Skill not discovered | Add closing `---` after last frontmatter field |
| `allowed-tools` references unknown tool | Runtime warning | Add tool to plugin.json first |
| EVALS.md missing `must pass` criterion | Low-quality outputs accepted | Add E1 (valid JSON) as must pass |
| `description` too short | Skill not matched in semantic search | Write 2-3 sentences including input/output shape |
| `name` not matching folder name | Confusing but works | Convention: name == folder name |

---

## Enabling the Skill Runtime

By default, the skill runtime is disabled — existing agents still run their Python code. Enable it per-environment:

```bash
USE_SKILL_RUNTIME=true uvicorn agents.main:app
```

Or in `.env`:
```
USE_SKILL_RUNTIME=true
```

When enabled, pipeline nodes that call `skill_registry.execute("skill-name", ...)` will route through the CrystalOS skill framework instead of legacy agent code.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Skill** | Complete AI capability: one folder, SKILL.md + EVALS.md |
| **Skill Registry** | Discovers and indexes SKILL.md files at startup; exposes `execute()` |
| **Skill Runtime** | Loads a skill, assembles the prompt, calls the LLM, runs evals |
| **EVALS.md** | Quality criteria evaluated after every skill execution |
| **EXAMPLES.md** | Human-readable view of the skill's production examples (read-only) |
| **Tool** | A Python function callable by a skill; declared in plugin.json |
| **Plugin** | A bundle of skills + tool declarations in a plugin.json manifest |
| **eval_score** | Weighted quality score 0.0–1.0; >= 0.75 = passing |
