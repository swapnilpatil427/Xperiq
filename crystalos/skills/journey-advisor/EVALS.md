# Evals

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON with actions array | 30 | must pass |
| E2 | actions has 1-4 entries with id, type, priority, title, description, params | 25 | must pass |
| E3 | Each action references specific data from input (metric values, theme names) | 25 | >= 0.80 |
| E4 | business_rationale includes a quantified impact estimate | 20 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E3 failure: inject "Each action MUST reference specific metric values or theme names from the input — no generic advice."
E4 failure: inject "business_rationale MUST include a quantified estimate (%, points, days, %)."
