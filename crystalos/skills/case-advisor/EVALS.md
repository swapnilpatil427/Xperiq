# Evals

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | case_proposals is non-empty when input contains NPS <= 6, CSAT <= 3, or churn-language verbatims | 25 | must pass |
| E2 | Each proposal's description references a specific verbatim text or exact metric value from the input — not generic language | 25 | >= 0.85 |
| E3 | severity field correctly matches signal urgency: NPS 0-2 or churn language → critical/high; NPS 3-5 → high/medium; passive → medium/low | 20 | >= 0.80 |
| E4 | owner_label and role_label are present and non-empty in each proposal's params (not "Unknown" or empty string) | 15 | >= 0.80 |
| E5 | business_rationale references a quantified impact: a recovery rate percentage AND either an ARR estimate or NPS point impact | 15 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria into the retry prompt. Max 1 retry.

E1 failure: inject "case_proposals MUST be non-empty when the input contains detractor scores (NPS <= 6 or CSAT <= 3) or verbatims with churn language. Review the input signals and generate at least one proposal."

E2 failure: inject "Each case proposal description MUST quote or paraphrase a specific verbatim from the input OR cite an exact metric value (e.g. 'NPS 3', 'CSAT 2.1'). Remove all generic descriptions like 'customer had a negative experience'."

E3 failure: inject "severity MUST match the input urgency tier: critical for NPS 0-2 or explicit churn/cancel language; high for NPS 3-5 or CSAT 1-2; medium for NPS 6 or CSAT 3; low for passives. Re-evaluate each proposal."

E4 failure: inject "owner_label and role_label MUST be populated in each proposal's params. If get_ownership_route returned no match, use the fallback role for the driver dimension (e.g. 'CSM', 'Support Lead') — do not leave blank."

E5 failure: inject "business_rationale MUST include both: (1) a recovery rate percentage (e.g. '15-25% of contacted detractors convert to passive') and (2) a quantified business impact (ARR at risk estimate or NPS point impact). Generic rationale is not acceptable."
