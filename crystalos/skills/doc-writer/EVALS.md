# Evals: doc-writer

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema (title, sections[], quality_score, quality_breakdown, improvement_suggestions) | 20 | must pass |
| E2 | All four required sections present: intro, steps, examples, notes | 25 | must pass |
| E3 | quality_score is accurately self-assessed (within 0.10 of evaluator score) | 20 | >= 0.80 |
| E4 | No fabricated claims — all doc content traceable to artifact_content | 25 | must pass |
| E5 | improvement_suggestions present and specific when quality_score < 0.80 | 10 | >= 0.85 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E2 failure: inject "Your output is missing one or more required sections. All four keys must be present: intro, steps, examples, notes."
E4 failure: inject "One or more claims in the doc cannot be traced to the artifact_content. Remove or qualify any information not present in the artifact."
E3 failure: inject "Your quality_score appears inflated. Re-score against the rubric: accuracy (0.25), completeness (0.25), clarity (0.20), searchability (0.15), actionability (0.15). Be honest if the artifact is incomplete."

---

## Eval Cases

### Case 1: Generate doc from route file

**Input**:
```json
{
  "artifact_type": "route_file",
  "artifact_content": "router.get('/api/surveys/:id/responses', requireAuth, async (req, res) => {\n  // GET /api/surveys/:id/responses\n  // Query params: format (csv|json, default json), include_metadata (boolean, default false)\n  // Returns: 200 { responses: [...], total: number, survey_id: string }\n  // Errors: 404 Survey not found, 403 No access, 400 Invalid format\n  // Rate limit: 10 requests/min per org\n  const { id } = req.params;\n  const format = req.query.format || 'json';\n  const includeMetadata = req.query.include_metadata === 'true';\n  // ... handler implementation\n});",
  "existing_doc": null,
  "doc_key": "get-survey-responses-api",
  "doc_category": "api"
}
```

**Expected output fields**:
- `quality_score >= 0.80`
- `sections` has all 4 keys: intro, steps, examples, notes
- `examples` section includes a curl or fetch example with the endpoint URL
- `notes` section mentions rate limit (10 req/min) and format options

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| All 4 sections present | 2 | Must have intro, steps, examples, notes |
| examples section shows actual endpoint URL | 2 | /api/surveys/:id/responses must appear |
| format param documented (csv/json) | 2 | Both options from artifact |
| rate limit in notes (10 req/min) | 2 | Directly from artifact |
| quality_score >= 0.80 | 2 | Route is well-specified |

---

### Case 2: Generate doc from SKILL.md

**Input**:
```json
{
  "artifact_type": "skill_md",
  "artifact_content": "---\nname: crystal-analyst\nversion: 1.0.0\nshared: true\ndescription: |\n  Crystal conversational XM analyst. Answers questions about survey data using tool results.\n  Input: message, conversation_context, tool_results.\n  Output: answer, citations, suggestions.\nallowed-tools: get_survey_overview get_metric_history get_insights_list\nmax_output_tokens: 1200\ntimeout_seconds: 60\n---\n\n## Context\nYou are Crystal, the Experient XM analyst. Answer questions about survey data.\n\n## Output Schema\n```json\n{\"answer\": \"string\", \"citations\": [\"string\"], \"suggestions\": [\"string\"]}\n```",
  "existing_doc": null,
  "doc_key": "crystal-analyst-skill",
  "doc_category": "feature"
}
```

**Expected output fields**:
- All 4 sections present (intro, steps, examples, notes)
- `intro` names the skill as "crystal-analyst" or "Crystal XM Analyst"
- `examples` section shows example input/output JSON
- `notes` mentions max_output_tokens: 1200 and allowed tools
- `quality_score` between 0.70–0.90 (SKILL.md has limited step content)

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| All 4 sections present | 2 | Must have intro, steps, examples, notes |
| intro names the skill correctly | 2 | crystal-analyst / Crystal XM Analyst |
| allowed tools listed | 2 | get_survey_overview, get_metric_history, get_insights_list |
| examples shows input/output format | 2 | Must have a JSON example |
| quality_score reflects partial info (no full step-by-step possible) | 2 | Should not be 0.95+ for a sparse skill YAML |

---

### Case 3: Update existing doc with new artifact

**Input**:
```json
{
  "artifact_type": "route_file",
  "artifact_content": "router.get('/api/surveys/:id/responses', requireAuth, async (req, res) => {\n  // Format options: csv, json, xlsx (NEW in v2.1)\n  // Rate limit increased: 20 requests/min per org (was 10)\n  const format = req.query.format || 'json';  // csv | json | xlsx\n});",
  "existing_doc": {
    "title": "Get Survey Responses API",
    "sections": [
      {"key": "intro", "heading": "What This Is", "content": "The Get Survey Responses API returns all responses for a survey..."},
      {"key": "steps", "heading": "How to Use It", "content": "1. Authenticate with your API key..."},
      {"key": "examples", "heading": "Examples", "content": "```bash\ncurl /api/surveys/abc/responses?format=json\n```"},
      {"key": "notes", "heading": "Notes", "content": "- Rate limit: 10 requests/min per org\n- Human-written note: Large surveys (>10k responses) may take up to 30 seconds to export."}
    ],
    "quality_score": 0.82,
    "quality_breakdown": {"accuracy": 0.90, "completeness": 0.80, "clarity": 0.85, "searchability": 0.80, "actionability": 0.75},
    "improvement_suggestions": []
  },
  "doc_key": "get-survey-responses-api",
  "doc_category": "api"
}
```

**Expected output fields**:
- `notes` section preserves human note about large surveys (30 seconds)
- `notes` section updates rate limit to 20 req/min
- `examples` or `notes` section adds xlsx format option
- `quality_score >= 0.80`

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| Rate limit updated to 20/min | 2 | New value from artifact |
| xlsx format option added | 2 | New format in artifact |
| Human-written large-survey note preserved | 2 | Must not be removed |
| No claims added beyond artifact | 2 | Only changes from new artifact |
| quality_score reflects complete doc | 2 | Should be >= 0.80 |

---

### Case 4: Changelog entry doc

**Input**:
```json
{
  "artifact_type": "changelog",
  "artifact_content": "## v2.3.0 — 2026-06-15\n\n### New\n- Webhook retry logic: failed webhooks now retry up to 3 times with exponential backoff (5s, 25s, 125s)\n- New webhook event: `response.deleted` fires when a response is soft-deleted\n\n### Changed\n- `response.created` webhook payload now includes `survey_title` field\n\n### Breaking\n- Removed `data.answers` field from webhook payload. Use `data.responses` instead.\n  Migration: update any code reading `event.data.answers` to use `event.data.responses`.",
  "existing_doc": null,
  "doc_key": "webhook-changelog-v2-3-0",
  "doc_category": "api"
}
```

**Expected output fields**:
- `intro` section mentions released_at: 2026-06-15 and describes what changed
- `steps` section documents the migration from `data.answers` to `data.responses`
- `examples` section shows before/after webhook payload for the breaking change
- `notes` section mentions retry schedule (5s, 25s, 125s)
- `quality_score >= 0.75`

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| released_at 2026-06-15 in intro | 2 | Must be explicit |
| migration step for data.answers → data.responses | 2 | Breaking change must be documented |
| before/after example in examples section | 2 | Shows old payload vs new payload |
| retry schedule (5s/25s/125s) in notes | 2 | From artifact |
| new event response.deleted documented | 2 | New event from artifact |
