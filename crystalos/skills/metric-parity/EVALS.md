# Evals: metric-parity

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching the output schema | 20 | must pass |
| E2 | `explanation` + `hypothesis.cause` name a concrete, checkable methodology difference (not generic "numbers differ") | 25 | must pass |
| E3 | Figures cited trace to `response_evidence` / provenance data — none invented | 20 | must pass |
| E4 | `recommended_method` is `match_source` or `rebaseline` with a one-sentence rationale | 15 | >= 0.85 |
| E5 | `parity_ledger` carries all six fields {metric, source_reported, prism_computed, method, variance, explanation} | 12 | must pass |
| E6 | `citations` reference real response ids / counts the explanation rests on | 8 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.80

E1, E2, E3, E5 are hard-fail (must pass) — invalid output, a hand-wavy non-cause, invented figures,
or an incomplete ledger fails the run regardless of the weighted score.

## Failure Behavior

On failure inject the failed criteria. Max 1 retry.
- E2 failure: inject "The explanation and hypothesis.cause must name a specific, checkable methodology difference (rounding mode, partials inclusion, scale, date window, passive handling, top-box vs mean) — not 'the numbers are different'. If none fits, set cause='unexplained' and say so."
- E3 failure: inject "Every figure in the explanation must come from response_evidence or the cited provenance data. Do not invent response counts, distributions, or ids."
- E4 failure: inject "Always output recommended_method as either match_source or rebaseline, with a one-sentence rationale. Default to match_source at cutover unless the source method is demonstrably wrong."
- E5 failure: inject "parity_ledger must include all six fields: metric, source_reported, prism_computed, method, variance, explanation."
