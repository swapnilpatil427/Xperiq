# Evals: trend-analyst

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 25 | must pass |
| E2 | Every trend_finding has direction, magnitude, window, and significance | 20 | must pass |
| E3 | Magnitudes are consistent with the provided series (not invented) | 20 | >= 0.85 |
| E4 | Moves within the historical band are labeled noise/marginal, not "trends" | 15 | >= 0.80 |
| E5 | `forecast_note` is hedged and contains no precise future value or arrival date | 10 | >= 0.85 |
| E6 | `confidence` is lowered when series is short or sample sizes are small | 10 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E3 failure: inject "Recompute every magnitude directly from metric_series / topic_trends. Do not state a delta the data does not support."
E5 failure: inject "forecast_note must be directional only — 'if sustained, NPS likely continues up' — never a specific number or date."
