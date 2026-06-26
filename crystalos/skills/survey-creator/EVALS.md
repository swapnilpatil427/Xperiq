# Evals: survey-creator

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | title, description, questions, estimated_completion_minutes present | 15 | must pass |
| E3 | questions count is 5-15 (within reasonable bounds) | 15 | >= 0.85 |
| E4 | At least one open_text question included | 15 | must pass |
| E5 | NPS questions use scale 0-10 with correct labels | 15 | >= 0.90 |
| E6 | design_rationale is present and non-empty | 10 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E4 failure: inject "Every survey MUST include at least one open_text question (required: false) to capture qualitative feedback."
