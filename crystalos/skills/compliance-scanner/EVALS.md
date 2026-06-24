# Evals: compliance-scanner

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | compliance_score is integer 0-100, passed is boolean | 20 | must pass |
| E3 | requires_privacy_notice and requires_legal_review are boolean | 10 | must pass |
| E4 | Each issue has category, severity, description, and recommendation | 25 | >= 0.85 |
| E5 | GDPR issues include regulation_reference | 15 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
