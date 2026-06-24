# Evals: specialist-custom

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | headline, narrative, data_summary, top_findings present | 20 | must pass |
| E3 | top_findings count is 3-5 with verbatim evidence | 25 | >= 0.80 |
| E4 | recommendations are specific (not generic advice) | 15 | >= 0.75 |
| E5 | confidence is float between 0.0 and 1.0 | 10 | must pass |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
