# Evals: report-composer

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 25 | must pass |
| E2 | Only sections with present inputs are built; missing ones listed in sections_omitted | 20 | must pass |
| E3 | No figure appears that is not traceable to a section_inputs value | 20 | >= 0.85 |
| E4 | `executive_summary` is 3-5 prose sentences consistent with all sections | 15 | >= 0.85 |
| E5 | `chart_hints.series_ref` names a real field in the section input | 10 | >= 0.80 |
| E6 | Sections do not contradict each other or the exec summary | 10 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E2 failure: inject "Build only sections whose section_inputs are non-null. List every requested-but-missing section in export_meta.sections_omitted with reason input_missing. Never fabricate a section."
E3 failure: inject "Every number in the report must come from a section_inputs value. Do not introduce figures the analytical skills did not provide."
