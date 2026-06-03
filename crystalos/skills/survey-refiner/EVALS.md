# Evals: survey-refiner

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | questions, changes, quality_delta, rationale all present | 20 | must pass |
| E3 | changes include original and refined text for each modified question | 25 | >= 0.85 |
| E4 | quality_delta.after_score > quality_delta.before_score (refinement improves quality) | 15 | >= 0.80 |
| E5 | rationale explains the key improvements in plain English | 10 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
