# Evals: schema-mapper

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching the output schema | 20 | must pass |
| E2 | Every input `source_field_id` is accounted for — appears in `mappings` or `unmapped`, none silently dropped | 20 | must pass |
| E3 | Every metric-bearing field (NPS/CSAT/CES/eNPS) carries a non-null `metric` | 20 | must pass |
| E4 | No hallucinated targets — every `target_question_id` / `target_option_id` exists in the input | 15 | must pass |
| E5 | Every answer-scale change is recorded in `scale_changes` with `metric_affecting` set | 10 | >= 0.85 |
| E6 | `confidence` scores are differentiated and honest (not a blanket high value) | 8 | >= 0.75 |
| E7 | Each mapping has a specific one-sentence `rationale` | 7 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.80

E1, E2, E3, E4 are hard-fail (must pass) — a structurally invalid output, a dropped field, an
unflagged metric, or a hallucinated id fails the run regardless of the weighted score.

## Failure Behavior

On failure inject the failed criteria. Max 1 retry.
- E2 failure: inject "Every source_field_id from the input must appear in mappings or unmapped. Prefer disposition='preserved' over dropping a field. Do not omit any field."
- E3 failure: inject "Fields measuring NPS/CSAT/CES/eNPS MUST carry a non-null `metric`. Re-check every 0-10 / 1-5 / 1-7 scale and every NPS/CSAT/CES/eNPS-labelled field."
- E4 failure: inject "Only emit target_question_id and target_option_id values that appear in the provided target_questions/options. If no real target exists, use disposition='new' with target_question_id=null. Never invent an id."
- E5 failure: inject "Any source field whose answer scale differs from its target (e.g. 1-7 -> 1-5) must be added to scale_changes with metric_affecting set."
