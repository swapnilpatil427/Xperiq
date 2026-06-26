# Evals: driver-analyst

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 25 | must pass |
| E2 | Every driver placed in exactly one quadrant; quadrants consistent with drivers_ranked | 20 | must pass |
| E3 | importance/performance values echo the input (not invented correlations) | 20 | >= 0.85 |
| E4 | `primary_driver` is the highest-leverage driver, not merely the loudest topic | 15 | >= 0.80 |
| E5 | `method_note` discloses approximation and avoids causal claims | 10 | >= 0.80 |
| E6 | `confidence` lowered for approximated method / small samples | 10 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E4 failure: inject "The primary driver must be the highest importance × performance-gap lever. Do not select a high-volume but low-importance topic."
E5 failure: inject "State the method honestly and never claim a driver causes the outcome — drivers are associative leverage points."
