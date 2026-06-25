# Evals

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | convergence_risks is non-empty when NPS < 30 or avg_sentiment < -0.2 for the analyzed segment/account | 25 | must pass |
| E2 | Each convergence risk's x_signal contains numeric avg_nps or avg_sentiment values (not null) — must be grounded in actual data | 25 | >= 0.85 |
| E3 | convergence_score is a number between 0.0 and 1.0; urgency_level maps correctly (>= 0.8 → critical, 0.5-0.8 → high, 0.3-0.5 → medium) | 20 | >= 0.80 |
| E4 | case_proposal is present and non-null for all risks with urgency_level = critical or high | 15 | >= 0.80 |
| E5 | methodology_note explains the specific X-signal value, the O-concept it was compared against, and the threshold that was crossed | 15 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria into the retry prompt. Max 1 retry.

E1 failure: inject "convergence_risks MUST be non-empty when NPS < 30 or avg_sentiment < -0.2. Call get_xo_context and get_ontology_context again, then re-evaluate which X-data signals cross O-concept thresholds."

E2 failure: inject "Each convergence risk MUST include actual numeric values for x_signal.avg_nps or x_signal.avg_sentiment from the data returned by get_xo_context. Do not generate placeholder null values — if data is unavailable, omit the risk entry."

E3 failure: inject "convergence_score MUST be a float 0.0-1.0 computed from the actual signal vs threshold comparison. urgency_level MUST map: convergence_score >= 0.8 → critical, 0.5-0.79 → high, 0.3-0.49 → medium, < 0.3 → low."

E4 failure: inject "case_proposal MUST be a fully populated proposal object (not null) for every convergence risk with urgency_level = 'critical' or 'high'. Call propose_create_case to generate the proposal, or construct it inline following the output schema."

E5 failure: inject "methodology_note MUST name: (1) the specific X-signal value (e.g. 'avg_nps=-12'), (2) the O-concept and its threshold (e.g. 'churn_risk node, x_data_range.below=-10'), and (3) the resulting convergence_score. Generic explanations are insufficient."
