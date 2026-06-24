# Evals: specialist-enps

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | headline, narrative, engagement_analysis, retention_risk_signals present | 20 | must pass |
| E3 | enps_rating is one of: excellent, good, needs_improvement, critical | 10 | must pass |
| E4 | retention_risk_signals include verbatim_evidence for each signal | 25 | >= 0.80 |
| E5 | recommendations name specific owner (HR/L&D/Manager/Executive) not generic | 15 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
