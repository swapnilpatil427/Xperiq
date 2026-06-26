---
name: scan-models
description: Scan OpenRouter for the best models for each Experient agent role, detect stale/removed models, and upgrade models.py. Covers all 17 agent roles across dev, dev-paid, staging, and prod.
---

## What this skill does

Runs the OpenRouter model scanner to:
1. Fetch the live catalog (~400+ models) from OpenRouter
2. Score every model for each of the 17 agent roles using role-specific criteria
3. Detect STALE models (in `models.py` but removed from OpenRouter) — these break pipelines
4. Recommend the best model per role per environment
5. Optionally patch `agents/lib/models.py` directly

## When to use

- Any model starts returning 404 or "model not found" errors
- You want to check if cheaper/better models have launched on OpenRouter
- After a major OpenRouter catalog update (they retire models frequently)
- Before a release to verify all model IDs are still valid

## Usage

```bash
# Dry run — report only, no changes (interactive env selection)
cd /path/to/Experient
agents/.venv/bin/python -m agents.skills.openrouter_scan

# Check for stale models only (fast — just validates model IDs)
agents/.venv/bin/python -m agents.skills.openrouter_scan --check-stale

# Scan dev + dev-paid, propose patches (with confirmation prompt)
agents/.venv/bin/python -m agents.skills.openrouter_scan --env dev,dev-paid --patch

# Full scan all envs, non-interactive, show report
agents/.venv/bin/python -m agents.skills.openrouter_scan --env all

# Machine-readable JSON output (for Claude to parse)
agents/.venv/bin/python -m agents.skills.openrouter_scan --env all --json

# Apply patches without prompt (CI/automation)
agents/.venv/bin/python -m agents.skills.openrouter_scan --env dev,dev-paid --patch --yes

# Also patch staging/prod (requires explicit flag — protected by default)
agents/.venv/bin/python -m agents.skills.openrouter_scan --env all --patch --allow-prod --yes
```

## Environment variables required

- `OPENROUTER_API_KEY` — must be set (in `agents/.env` or exported)
- `AGENTS_ENV` — which environment you're running locally (dev, dev-paid, etc.)

## Agent roles covered

| Group | Role | Use case |
|-------|------|---------|
| Survey | `creator` | Survey question generation — strong reasoning + tool use |
| Survey | `qc` | Cross-vendor quality review — must differ from creator's provider |
| Survey | `qc_validator` | Secondary validation pass — fast, structured |
| Survey | `compliance` | GDPR/ethics flagging — structured output |
| Survey | `recommender` | Improvement suggestions — structured |
| Survey | `skip-logic` | Conditional branching rules — structured JSON |
| Survey | `copilot` | Interactive builder assistant — tool use |
| Insight | `insight_narrate` | Writes narrative text for insights — quality writing, runs ~7×/pipeline |
| Insight | `insight_verify` | Fact-checks claims vs responses — tiny output, runs ~7× |
| Insight | `insight_topics` | Topic cluster labeling — large context + reasoning |
| Insight | `insight_expert` | Domain NPS/CSAT/CX specialist — deep reasoning, ICE scoring |
| Insight | `insight_evaluate` | Full insight set quality audit — must see all insights (64K ctx) |
| Insight | `crystal` | Conversational Q&A over insights — synthesis + citation |
| Insight | `crystal_eval` | Hallucination checker for Crystal — fast structured verdict |
| Insight | `response_gen` | Synthetic response generation — high output volume (8K tokens) |
| QA | `survey_bias` | Detects leading/loaded/double-barreled bias |
| QA | `survey_evaluate` | Holistic survey quality scoring |

## How Claude should run this skill

1. Run the JSON scan:
   ```bash
   agents/.venv/bin/python -m agents.skills.openrouter_scan --env dev,dev-paid --json 2>/dev/null
   ```
2. Parse the JSON — look at `stale_models` first (critical, must fix), then `recommendations`
3. For each stale model: find the best replacement in `top_free` (dev) or `recommendations` (dev-paid)
4. For non-stale recommendations: evaluate if the upgrade is worth it (score delta > 5, cost similar)
5. Update `agents/lib/models.py` directly using the Edit tool
6. Run tests: `agents/.venv/bin/python -m pytest agents/tests/test_models.py -v`
7. Report what changed

## Model selection principles

**dev** (free tier):
- Use the best available free model — currently `deepseek/deepseek-r1:free` (only stable free model)
- Accept that all roles share one model when the free catalog is sparse
- Never use blocklisted models (meta-llama, baidu, poolside, cohere)

**dev-paid** (~$0.002–0.005/run):
- Gemini 2.5 Flash for complex roles (creator, topics, expert, crystal, response_gen, copilot)
- Gemini 2.0 Flash for fast/structured roles (narrate, verify, evaluate, crystal_eval)
- DeepSeek Chat for QC (cross-vendor), bias, survey_evaluate
- Balance: good quality without exceeding $0.005/full pipeline run

**staging** (Anthropic SDK — not patched by this tool):
- insight_topics → claude-sonnet-4-6 (richer topic taxonomy)
- insight_expert → claude-sonnet-4-6 (domain reasoning depth)
- everything else → claude-haiku-4-5-20251001 (fast + cost-effective)
- Edit models.py manually for staging/prod (or use --allow-prod flag)

**prod** (Anthropic SDK — same as staging for insight pipeline):
- creator → claude-opus-4-7 + thinking (best quality for survey generation)
- insight_topics, insight_expert → claude-sonnet-4-6
- everything else → claude-haiku-4-5-20251001

## Rate limit awareness

The scanner reports runs/hour for each model. Key thresholds:
- ≥ 60/hr  = green — no bottleneck
- 10–59/hr = yellow — monitor under load
- < 10/hr  = red — avoid for high-frequency roles

High-frequency insight roles (`insight_narrate`, `insight_verify`, `insight_expert`, `crystal_eval`) run ~7× per pipeline. Pick models with RPM headroom.

## What NOT to touch

- `use_anthropic_sdk: True` entries — these call Anthropic directly, not OpenRouter
- `claude-sonnet-4-6` and `claude-haiku-4-5-20251001` in staging/prod — managed separately
- `temperature: None` on Opus 4.7 — required for adaptive thinking mode
