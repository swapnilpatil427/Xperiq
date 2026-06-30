# Evals: taxonomy-mapper

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching the output schema | 20 | must pass |
| E2 | Every imported `label` appears exactly once in `resolutions` — no silent drops, no duplicates | 25 | must pass |
| E3 | Every `merge` resolution's `target_topic_id` exists in the input `registry_topics` | 15 | must pass |
| E4 | Genuinely ambiguous / multi-candidate labels are emitted as `conflict` (not silently merged) | 20 | >= 0.80 |
| E5 | Every `conflict` lists >= 2 candidate topic ids and a concrete reason | 8 | >= 0.80 |
| E6 | Every `new` resolution has a matching `registry_additions` entry | 7 | >= 0.80 |
| E7 | Each resolution has an honest confidence + one-sentence rationale | 5 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.80

E1, E2, E3 are hard-fail (must pass) — invalid output, a dropped/duplicated label, or a merge onto a
non-existent topic id fails the run regardless of the weighted score.

## Failure Behavior

On failure inject the failed criteria. Max 1 retry.
- E2 failure: inject "Every imported label must appear exactly once in resolutions. There is no ignore path — a label you cannot place is a 'new' or 'conflict', never a silent drop."
- E3 failure: inject "A merge resolution may only target a topic_id that exists in registry_topics. If none fits, use action='new' or action='conflict'."
- E4 failure: inject "When a label could map to more than one registry topic or only partially overlaps one, emit action='conflict' with the candidate ids — do not pick a merge target silently."
- E5 failure: inject "Each conflict entry must list at least two candidate_topic_ids and a concrete reason for the ambiguity."
