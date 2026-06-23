# Evals: segment-analyst

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 25 | must pass |
| E2 | `segments_ranked` covers all input segments with correct signed `vs_overall` | 20 | must pass |
| E3 | `average_trap_flag` is set correctly (material underperforming segment vs healthy aggregate) | 20 | >= 0.80 |
| E4 | `biggest_gap` math is correct and `material` reflects segment n/share | 15 | >= 0.85 |
| E5 | Small-n (low reliability) segments are caveated, not headlined as findings | 10 | >= 0.80 |
| E6 | Supporting verbatims come from the correct segment | 10 | must pass |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E2 failure: inject "Recompute vs_overall = segment.score - overall.score for every segment, with correct sign."
E5 failure: inject "Do not headline a gap based on a segment with n < 30. Mark it low reliability and add the small-sample caveat."
