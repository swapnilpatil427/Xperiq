# Evals: specialist-nps

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | headline, narrative, loyalty_analysis, segment_insights present and non-empty | 20 | must pass |
| E3 | benchmark_context references the NPS score and either confirms or contextualizes it | 15 | >= 0.80 |
| E4 | segment_insights contains at least 2 entries with specific evidence | 20 | >= 0.80 |
| E5 | narrative contains at least one number from the input data | 15 | >= 0.85 |

## Scoring

Score = weighted average of numeric-threshold criteria.
Pass threshold: overall score >= 0.75

## Failure Behavior

On failure, inject failed criteria and scores. Max 1 retry.
Common fix: E4 often fails when LLM writes generic segment insights — inject "Each segment_insight must include specific evidence from the verbatims or metrics, not generic advice."
