# Evals

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON with summary, trend_findings, and suggestions fields | 30 | must pass |
| E2 | trend_findings count is 3-3 | 20 | must pass |
| E3 | summary contains a specific number from the input (response count, NPS score, or percentage) | 25 | >= 0.80 |
| E4 | suggestions are specific questions, not generic advice | 25 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E2 failure: inject "trend_findings MUST have exactly 3 items — no more, no fewer."
E3 failure: inject "summary MUST reference at least one specific number (NPS score, response count, or percentage) from the input data."
E4 failure: inject "suggestions must be natural follow-up questions an executive would ask, specific to this survey's data — not generic advice."
