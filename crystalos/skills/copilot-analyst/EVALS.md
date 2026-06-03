# Evals: copilot-analyst

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | questions, explanation, changes present and non-empty | 20 | must pass |
| E3 | questions array contains same or near-same count as input (add/remove changes are valid) | 15 | >= 0.85 |
| E4 | changes list references valid question_ids from the input | 20 | >= 0.90 |
| E5 | explanation names which question(s) changed and what changed | 15 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E4 failure: inject "changes[] must reference the exact question_id values from the input questions array."
