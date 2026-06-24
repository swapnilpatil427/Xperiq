---
name: run-insights
description: Trigger AI insight generation for Experient surveys. Run for all active surveys, a specific survey, or check status. Requires agents service and DB running locally.
---

## What this skill does

Connects directly to the agents service and Postgres to trigger the insight generation pipeline. Use it when:
- A new survey has responses and needs its first insights
- You want to force-regenerate insights after a data change
- You need to check the status of recent insight runs

## Setup (one-time)

```bash
mkdir -p .claude/skills
cp agents/skills/run-insights.skill.md .claude/skills/run-insights.md
```

## Usage

```
/run-insights
/run-insights --survey abc123
/run-insights --status
/run-insights --dry-run
```

Or run directly:

```bash
# Trigger all surveys that need insights
PYTHONPATH=. agents/.venv/bin/python -m agents.skills.run_insights

# Specific survey
PYTHONPATH=. agents/.venv/bin/python -m agents.skills.run_insights --survey <survey-id>

# Show last run status
PYTHONPATH=. agents/.venv/bin/python -m agents.skills.run_insights --status

# Dry run (show what would trigger, no changes)
PYTHONPATH=. agents/.venv/bin/python -m agents.skills.run_insights --dry-run
```

## What it does

1. Checks agents service health at `$AGENTS_URL` (default: `http://localhost:8001`)
2. Queries the DB for active/paused surveys with responses
3. Filters out surveys with a currently-running insight job
4. Creates an `agent_runs` row with `run_type='insight_generation'`
5. POSTs to `POST /insights/generate` on the agents service
6. Reports status for each survey (started / already_running / error)

## Environment variables

- `AGENTS_URL` — agents service URL (default: `http://localhost:8001`)
- `AGENTS_INTERNAL_KEY` — internal service key (from `.env`)
- `AGENTS_DB_DSN` — Postgres DSN (default: `postgresql://postgres:postgres@localhost:5432/experient`)

## When to use

- After collecting 30+ responses on a new survey
- After pulling prod data locally and wanting fresh insights
- During demos to trigger a live insight generation
- When the scheduler is disabled and you need an ad-hoc run
