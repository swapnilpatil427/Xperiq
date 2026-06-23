# Evals: crystal-analyst

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | answer, citations, suggestions present and non-empty | 20 | must pass |
| E3 | answer is 2-5 sentences (not too brief, not too long) | 15 | >= 0.85 |
| E4 | suggestions are specific follow-up questions (not generic "would you like more?") | 20 | >= 0.80 |
| E5 | citations reference actual data from tool_results or survey_facts | 15 | >= 0.85 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E4 failure: inject "suggestions must be specific questions about the survey data, not generic offers to help."
E5 failure: inject "Every number or topic name in the answer must appear in the provided tool_results or survey_facts."
