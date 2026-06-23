# Evals: survey-qc

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | qc_score is integer 0-100, passed is boolean | 20 | must pass |
| E3 | Each issue has severity, issue_type, description, and suggestion | 25 | >= 0.85 |
| E4 | improvements show actual rewritten question text (not just advice) | 15 | >= 0.75 |
| E5 | qc_score calculation is consistent with issue count and severity | 10 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E4 failure: inject "Every improvement must include the full rewritten question text in the 'improved' field, not just a description of what to change."
