# Evals: specialist-ces

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | headline, narrative, effort_analysis, friction_points present and non-empty | 20 | must pass |
| E3 | effort_level is one of: low, moderate, high, critical | 10 | must pass |
| E4 | friction_points contains at least 2 entries with verbatim_evidence | 25 | >= 0.80 |
| E5 | recommendations contain specific team and action (not generic advice) | 15 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E4 failure: inject "Each friction point MUST include a verbatim_evidence field with a direct or paraphrased quote from the data."
