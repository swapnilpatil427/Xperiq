# CrystalOS Skills — Format Specification

**Status:** Design  
**Last updated:** 2026-05-21

---

## What a Skill Is

A skill is the complete definition of one AI capability. It lives in the `crystalos/skills/` directory. One folder = one skill.

```
crystalos/skills/
  insight-narrator/
    SKILL.md          ← brain: instructions + schema + tool declarations
    EVALS.md          ← quality criteria checked after every execution
    EXAMPLES.md       ← auto-filled few-shot bank (top production runs)
    references/
      narrative-style-guide.md
      quality-benchmarks.md
  survey-qc/
    SKILL.md
    EVALS.md
    EXAMPLES.md
  crystal-analyst/
    SKILL.md
    EVALS.md
    EXAMPLES.md
    references/
      domain-knowledge.md
```

The orchestrators (LangGraph, Crystal) never change their structure. They just call:
```python
result = await skill_registry.execute("insight-narrator", input, ctx)
```

---

## SKILL.md Format

### Frontmatter

```yaml
---
name: insight-narrator           # max 64 chars, kebab-case, unique across registry
version: 1.2.0                   # semver — bump minor for prompt changes, major for schema breaks
shared: false                    # true = available to all orgs; false = internal only
description: |                   # max 1024 chars — LLM-readable for semantic discovery
  Generates a structured narrative insight report from survey topic clusters,
  sentiment scores, and verbatim examples. Produces title, executive summary,
  3-5 key findings, and recommended actions. Optimized for NPS and CSAT surveys.
compatibility: |                 # max 500 chars — human-readable constraints
  Requires insight pipeline state after node_cluster. Expects topics list with
  sentiment_score, volume, and sample_verbatims fields. Output schema v1.
allowed-tools: getTopics getMetrics getVerbatims getSentiment   # space-delimited
evals: EVALS.md
examples: EXAMPLES.md
# G19 — per-skill resource limits enforced by the skill runtime
max_output_tokens: 2000          # hard cap on LLM output per call (default: model max)
max_retries: 1                   # override runtime default retry count
timeout_seconds: 30              # abort if skill doesn't complete within N seconds
---
```

### Field Rules

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | kebab-case, max 64 chars, globally unique in registry |
| `version` | yes | semver; minor bumps for prompt edits, major for schema changes |
| `shared` | yes | `true` for platform skills, `false` for domain-specific |
| `description` | yes | Written for LLM consumption — full sentences, include input/output shape |
| `compatibility` | no | State preconditions and known limitations |
| `allowed-tools` | no | Space-delimited list of tool names this skill may call |
| `evals` | yes | Points to EVALS.md file |
| `examples` | yes | Points to EXAMPLES.md file |
| `max_output_tokens` | no | Per-call output cap (default: model's max). Prevents runaway output. |
| `max_retries` | no | Override skill runtime default (default: 1 retry). |
| `timeout_seconds` | no | Hard abort if skill hangs (default: 60s). |

### Body (Markdown Instructions)

After the frontmatter, the body is the prompt template. Structure it for progressive disclosure — keep the SKILL.md file under 500 lines; link longer reference material in `references/`.

```markdown
## Context

You are the Insight Narrator for CrystalOS. Your job is to turn a set of
clustered survey topics into a clear, actionable insight report.

## Input

```json
{
  "survey_id": "string",
  "topics": [
    {
      "label": "string",
      "sentiment_score": "float [-1, 1]",
      "volume": "integer",
      "sample_verbatims": ["string"]
    }
  ],
  "response_count": "integer",
  "survey_type": "NPS | CSAT | CES | custom"
}
```

## Output

```json
{
  "title": "string (max 80 chars)",
  "executive_summary": "string (2-3 sentences)",
  "key_findings": [
    {
      "finding": "string",
      "sentiment": "positive | negative | neutral",
      "volume_pct": "float",
      "supporting_verbatim": "string"
    }
  ],
  "recommended_actions": ["string"],
  "confidence": "float [0, 1]"
}
```

## Instructions

[step-by-step narrative instructions here]

## References

- [Narrative Style Guide](references/narrative-style-guide.md)
- [Quality Benchmarks](references/quality-benchmarks.md)
```

---

## EVALS.md Format

EVALS.md defines what "good" looks like for this skill. The runtime checks these after every execution.

```markdown
# Evals: insight-narrator

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | executive_summary is 2-3 sentences, no bullet points | 15 | ≥ 0.8 |
| E3 | key_findings count is 3-5 | 10 | must pass |
| E4 | Each finding cites a supporting_verbatim | 15 | ≥ 0.9 |
| E5 | No findings contradict the sentiment_score direction | 20 | ≥ 0.85 |
| E6 | recommended_actions are specific and actionable (not generic) | 10 | ≥ 0.75 |

## Scoring

Score = weighted average of all criteria where threshold is numeric.
Hard-fail criteria (threshold = "must pass") gate the score: a fail there = score 0.

Pass threshold: overall score ≥ 0.75

## Failure Behavior

On failure, the runtime injects the failed criteria and scores as context into a
retry. Maximum 1 retry per execution.
```

---

## EXAMPLES.md Format

> **G17 fix:** EXAMPLES.md is NOT a flat file in the target implementation. Flat files are not safe for concurrent writes — two pipeline runs completing simultaneously would corrupt the file. The EXAMPLES.md in the skill folder is for **human review only** (generated on demand). Reads and writes happen through a database table.

### Storage: `skill_examples` table

```sql
CREATE TABLE skill_examples (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name     TEXT NOT NULL,
    skill_version  TEXT NOT NULL,
    eval_score     FLOAT NOT NULL,
    input_json     JSONB NOT NULL,
    output_json    JSONB NOT NULL,
    input_embedding vector(1536),
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    run_id         TEXT,
    org_id         UUID,            -- NULL = shared example
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON skill_examples (skill_name, eval_score DESC);
CREATE INDEX ON skill_examples USING ivfflat (input_embedding vector_cosine_ops);
```

### Write rule

Runtime writes a new row when `eval_score ≥ 0.75`. Keep the top 50 rows per skill (drop lowest-scoring when over limit).

### Read rule (few-shot injection)

At inference time, retrieve the top-3 examples most similar to the current input:
```python
examples = await db.execute("""
    SELECT input_json, output_json, eval_score
    FROM skill_examples
    WHERE skill_name = %s AND eval_score >= 0.75
    ORDER BY input_embedding <=> %s  -- pgvector cosine search
    LIMIT 3
""", (skill_name, current_input_embedding))
```

### Human-readable EXAMPLES.md

The EXAMPLES.md file in the skill folder is generated on demand for human review:
```bash
python -m agents.skills.generate_examples insight-narrator > crystalos/skills/insight-narrator/EXAMPLES.md
```
It is never read by the runtime. Check it in for documentation; don't rely on it for execution.

---

## plugin.json Format

`plugin.json` is the domain manifest. It lives at the skill pack level (one level above individual skills) and declares:
- Which skills are in this pack
- What Python tools they can call
- What MCP servers are available (external systems only)

```json
{
  "name": "insight-pipeline-skills",
  "version": "1.0.0",
  "skills": [
    "./insight-narrator",
    "./survey-qc",
    "./topic-analyst",
    "./specialist-nps",
    "./specialist-ces",
    "./specialist-csat"
  ],
  "tools": {
    "getTopics": "agents.tools.topics:get_topics",
    "getMetrics": "agents.tools.metrics:get_metrics",
    "getVerbatims": "agents.tools.topics:get_verbatims",
    "getSentiment": "agents.tools.sentiment:get_sentiment",
    "getEmbeddings": "agents.tools.embeddings:get_embeddings",
    "getDelta": "agents.tools.delta:get_delta"
  },
  "mcp_servers": {}
}
```

```json
{
  "name": "external-integration-skills",
  "version": "1.0.0",
  "skills": [
    "./jira-ticket-create",
    "./slack-notify"
  ],
  "tools": {},
  "mcp_servers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-atlassian"],
      "env": { "ATLASSIAN_TOKEN": "${ATLASSIAN_TOKEN}" }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": { "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}" }
    }
  }
}
```

**Rule:** Internal tools (Python functions we own) go in `"tools"`. External systems (anything we call over the network that we don't own) go in `"mcp_servers"`. Never wrap internal tools in MCP — that adds unnecessary subprocess overhead for function calls.

---

## Skill Registry

The registry discovers skills by:
1. Scanning `crystalos/skills/*/SKILL.md` at startup
2. Embedding each skill's `description` field using `tools/embeddings.py`
3. Storing `(skill_name, embedding, embedding_model, SKILL.md path)` in memory

> **G18 fix:** The registry stores `embedding_model` alongside every vector. If the current embedding model differs from the stored model on startup, a re-indexing job runs before the registry accepts queries. Cosine similarity between vectors from different model families is meaningless — this prevents silent ranking corruption when the embedding model is upgraded.

At query time:
```python
skill = await skill_registry.find("generate narrative from clustered topics")
# Returns: "insight-narrator" with cosine similarity score
```

For hard-coded calls (orchestrators know the skill name):
```python
result = await skill_registry.execute("insight-narrator", input, ctx)
# Bypasses discovery, goes directly to runtime
```

Registry reloads automatically when a SKILL.md file changes (inotify watcher in dev; restart-based in production).

---

## Adding a New Skill

To add a new AI capability:

1. Create a folder under `crystalos/skills/<skill-name>/`
2. Write `SKILL.md` with the frontmatter + prompt body
3. Write `EVALS.md` with quality criteria
4. Create an empty `EXAMPLES.md` with the header comment
5. Add any `references/` files the skill needs
6. Add the skill path to the relevant `plugin.json`
7. Add an entry to `crystalos/tests/skills/test_<skill-name>.py`

No Python changes required. No graph wiring. No class to inherit.

---

## Versioning

Skills use semver. The runtime enforces compatibility:

- **Patch** (1.0.x) — wording tweaks, example additions. Safe to deploy without review.
- **Minor** (1.x.0) — prompt restructure, new optional output fields. Requires eval comparison before deploy.
- **Major** (x.0.0) — schema break, input/output contract change. Requires orchestrator coordination.

The `compatibility` field documents breaking constraints so orchestrators know what they depend on.

---

## DSPy Weekly Optimization

Once per week, a background job (in `scheduler.py`) runs DSPy optimization over each skill's example bank (stored in `skill_examples` table):

1. Pull all examples with `eval_score ≥ 0.75` from `skill_examples` where `created_at > now() - 7 days`
2. Run DSPy's `BootstrapFewShot` to find optimal few-shot selection
3. Run DSPy's `MIPROv2` to optimize the instruction section of SKILL.md
4. Evaluate the optimized version against a held-out test set (20% of examples)
5. If optimized version scores ≥ 5% better: auto-commit a patch version bump + updated SKILL.md

This is an automatic improvement loop. Prompts get better with production usage without manual tuning.

### DSPy cost estimate

MIPROv2 runs many LLM calls internally (instruction candidates × few-shot candidates × evaluation calls). For 12 skills:

| Per skill | Estimate |
|-----------|---------|
| BootstrapFewShot (50 examples, 5 candidates) | ~$0.50 |
| MIPROv2 instruction optimization (10 trials) | ~$2.00 |
| Evaluation set scoring (10 examples × 10 trials) | ~$1.00 |
| **Per skill total** | **~$3.50** |
| **12 skills per week** | **~$42/week** |

Add a weekly budget cap: if DSPy cost exceeds `DSPY_WEEKLY_BUDGET_USD` (default: $75), stop after the highest-priority skills and defer the rest to next week. Priority order mirrors migration.md (P1 skills first).

### DSPy ↔ SKILL.md integration

DSPy's `Signature` is the natural representation of a SKILL.md input/output schema. When the skill runtime loads a SKILL.md, it can instantiate a DSPy `Signature` from the declared `Input` and `Output` sections. DSPy optimization then directly modifies the `Signature`'s instructions — which maps back to SKILL.md's body section.

Write-back: the optimization job serializes the winning DSPy `Signature` back to SKILL.md format and creates a git commit with the patch version bump. CI runs Braintrust evals on the new version before it's deployed.
