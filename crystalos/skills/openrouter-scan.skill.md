---
name: openrouter-scan
description: Scan OpenRouter for better or cheaper models for CrystalOS pipeline agents and skills. Compares live catalog against current routing tables (_ROUTING and _SKILL_ROUTING) and reports recommendations with cost deltas.
---

## What this skill does

Fetches the full OpenRouter model catalog (300+ models), scores every model for each
CrystalOS pipeline agent role AND each of the 26 CrystalOS skills, and produces a terminal
report comparing current routing to optimal alternatives.

Covers both routing tables in `crystalos/lib/models.py`:
- `_ROUTING` — pipeline agents (creator, qc, insight_narrate, crystal, …)
- `_SKILL_ROUTING` — 26 CrystalOS skills (insight-narrator, survey-qc, crystal-analyst, …)

## Setup (one-time)

The skill file is already at `crystalos/skills/openrouter-scan.skill.md`.
The `.claude/skills/openrouter-scan.md` entry at the project root invokes it.

## Usage

Invoke via Claude Code:

```
/openrouter-scan
/openrouter-scan --patch
/openrouter-scan --json
/openrouter-scan --skills-only   # scan only _SKILL_ROUTING
/openrouter-scan --check-stale   # verify current models are still live
```

Or run directly from the project root:

```bash
# Dry run — show report for pipeline agents + skills
PYTHONPATH=. crystalos/.venv/bin/python -m crystalos.skills.openrouter_scan

# Auto-update crystalos/lib/models.py with suggestions
PYTHONPATH=. crystalos/.venv/bin/python -m crystalos.skills.openrouter_scan --patch

# Skills only (27 skill routing entries)
PYTHONPATH=. crystalos/.venv/bin/python -m crystalos.skills.openrouter_scan --skills-only

# Machine-readable JSON
PYTHONPATH=. crystalos/.venv/bin/python -m crystalos.skills.openrouter_scan --json | jq .recommendations
```

## What the report covers

1. **Current pipeline routing** — every env × agent with live pricing from OpenRouter
2. **Current skill routing** — every env × skill (26 skills × 4 envs = 104 entries)
3. **Rate limit info** — requests/min and tokens/min where available
4. **Cost comparison** — before/after cost per 1M executions for each skill
5. **Recommendations** — better models per role/skill, with cost delta and rationale
6. **Top 5 free models per role** — scored candidates for dev environment
7. **Top 5 cheapest paid models** — scored candidates for dev-paid

## Scoring criteria

### Pipeline agents

| Role         | Min Context | Needs Tools | Latency | Reasoning Bonus |
|--------------|-------------|-------------|---------|-----------------|
| creator      | 64K         | yes         | no      | +25% |
| qc           | 32K         | no          | yes     | no |
| insight_narrate | 32K      | no          | no      | no |
| crystal      | 64K         | yes         | yes     | +10% |
| insight_topics | 128K     | no          | no      | +30% |

### CrystalOS skills

| Skill category        | Min Context | Max Tokens | Priority     | Key capability needed     |
|-----------------------|-------------|------------|--------------|---------------------------|
| insight-narrator      | 64K         | 2500       | quality      | XM domain + JSON output   |
| action-recommender    | 128K        | 1000       | reasoning    | Synthesis + de-duplication|
| crystal-analyst       | 512K        | 1200       | instruction  | Multi-turn + tool use      |
| specialist-nps/ces/csat | 32K      | 1000       | domain       | XM metric expertise       |
| action advisors (×8)  | 32K         | 800        | cost         | Structured JSON, fast     |
| survey-creator        | 128K        | 4000       | quality      | Creative + schema adherence|
| copilot/refiner       | 512K        | 2000       | instruction  | Edit following, minimal   |
| survey-qc             | 64K         | 800        | cross-vendor | Different vendor from creator|
| compliance-scanner    | 64K         | 1000       | accuracy     | Compliance knowledge      |
| strategic advisors (×6) | 32K      | 700        | cost         | Domain knowledge, cheap   |

## Cross-vendor QC rule

Enforced for both `_ROUTING` and `_SKILL_ROUTING`:
- `survey-creator` = DeepSeek → `survey-qc` and `compliance-scanner` MUST be Gemini or Qwen
- `creator` = DeepSeek → `qc` and `qc_validator` MUST be Gemini
- Scanner flags any violation automatically

## Current model assignments (mid-2026)

| Env       | Insight skills        | Advisory skills        | QC/Writing           |
|-----------|-----------------------|------------------------|----------------------|
| dev       | gemma-4-31b-it:free   | qwen3-coder:free       | qwen3-next-80b:free  |
| dev-paid  | deepseek-v4-flash     | deepseek-v4-flash      | gemini-2.5-flash     |
| staging   | deepseek-v4-pro       | deepseek-v4-flash      | gemini-2.5-flash     |
| prod      | deepseek-v4-pro       | deepseek-v4-flash      | gemini-2.5-flash     |

## --patch behaviour

Applies in-place replacements to `crystalos/lib/models.py`. After patching:

```bash
cd crystalos && .venv/bin/pytest tests/test_models.py -v
```

All model tests must still pass. If they don't, revert:

```bash
git checkout crystalos/lib/models.py
```

## Environment variables

- `OPENROUTER_API_KEY` — required. Auto-loaded from `crystalos/.env` if not exported.
- `AGENTS_ENV` — filters report to specific env (default: all envs).

## When to run

- Weekly (before each sprint) to catch newly available models on OpenRouter
- After OpenRouter announces new model releases from DeepSeek, Gemini, Qwen, xAI
- When rate limit errors appear in prod (check if better rate limits exist)
- Before staging → prod promotion (validate model availability and pricing)
- After a significant cost spike in the dashboard (identify high-cost skill executions)

## Cost tracking

The scanner also reports per-skill cost contribution:
- `insight-narrator`: ~2500 tokens × prod cost = X per 1M insight reports
- `action-recommender`: ~1000 tokens × 12 advisor calls = Y per 1M recommendation runs
- Top-5 highest cost skills highlighted for optimization
