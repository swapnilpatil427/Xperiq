# Evals: action-recommender

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | actions array has 3-5 entries | 15 | must pass |
| E3 | Each action has id, type, priority, title, description, params | 20 | must pass |
| E4 | Actions reference specific data from input (theme names, metric values) | 20 | >= 0.80 |
| E5 | params are populated and relevant to the action type | 15 | >= 0.80 |

## Scoring

Score = weighted average of numeric-threshold criteria.
Hard-fail (must pass) gate: failure = score 0.
Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria and scores. Max 1 retry.

Common failures:
- E4: Generic actions without data references → inject "Each action MUST reference a specific metric value or theme name from the input"
- E5: Empty or mismatched params → inject "params must be populated with values relevant to the action type; see the params schema"
