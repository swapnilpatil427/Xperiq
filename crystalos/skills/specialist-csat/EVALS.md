# Evals: specialist-csat

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | headline, narrative, satisfaction_analysis, top_drivers, dissatisfiers present | 20 | must pass |
| E3 | csat_rating is one of: excellent, good, needs_improvement, critical | 10 | must pass |
| E4 | top_drivers and dissatisfiers each have at least 1 entry with verbatim evidence | 25 | >= 0.80 |
| E5 | recommendations name a specific team and expected impact | 15 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
