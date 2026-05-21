---
name: openrouter-scan
description: Scan OpenRouter for better or cheaper models for Experient Copilot agents. Compares live catalog against current routing table and reports recommendations.
---

## What this skill does

Fetches the full OpenRouter model catalog (currently 300+ models), scores every model for each Experient agent role, and produces a terminal report comparing current routing to optimal alternatives.

## Setup (one-time)

Copy this file to `.claude/skills/openrouter-scan.md` at the project root:

```bash
mkdir -p .claude/skills
cp agents/skills/openrouter-scan.skill.md .claude/skills/openrouter-scan.md
```

## Usage

Invoke via Claude Code:

```
/openrouter-scan
/openrouter-scan --patch
/openrouter-scan --json
```

Or run directly from the repo root (uses `agents/.venv`; one-time: `npm run setup:agents`):

```bash
# Dry run — show report
npm run scan-models

# Auto-update agents/lib/models.py with suggestions
npm run scan-models -- --patch

# Machine-readable JSON (pipe to jq, scripts, etc.)
npm run scan-models -- --json | jq .recommendations

# Equivalent without npm:
PYTHONPATH=. agents/.venv/bin/python -m agents.skills.openrouter_scan --patch
```

## What the report covers

1. **Current routing table** — shows every env × agent combination with live pricing from OpenRouter
2. **Rate limit info** — requests/min and tokens/min where available
3. **Recommendations** — better models per role, with cost delta and reasoning
4. **Top 5 free models per role** — scored candidates for dev environment
5. **Top 5 cheapest paid models per role** — scored candidates for dev-paid environment

## Scoring criteria per role

| Role         | Min Context | Needs Tools | Latency | Reasoning Bonus |
|--------------|-------------|-------------|---------|-----------------|
| creator      | 64K         | yes         | no      | +25% (helps quality) |
| qc           | 32K         | no          | yes     | no              |
| qc_validator | 16K         | yes         | yes     | no              |
| compliance   | 32K         | yes         | no      | no              |
| recommender  | 32K         | yes         | no      | no              |

## Cross-vendor QC rule

The scanner enforces the cross-vendor rule: QC must be from a different provider than Creator. When scoring QC candidates, it filters out Anthropic models and the same provider as the current Creator model.

## --patch behaviour

Applies in-place string replacements to `agents/lib/models.py`. After patching:

```bash
python -m pytest agents/tests/test_models.py -v
```

All 92 tests must still pass. If they don't, revert with:

```bash
git checkout agents/lib/models.py
```

## Environment variables

- `OPENROUTER_API_KEY` — required. Auto-loaded from `agents/.env` if not exported.

## When to run

- Weekly (or before a sprint) to catch newly available free models
- After OpenRouter announces new model additions
- When rate limit errors appear in production (check if better limits exist)
- Before upgrading staging/prod models (compare quality scores)
