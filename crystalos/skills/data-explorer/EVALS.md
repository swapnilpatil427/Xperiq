# Evals: data-explorer

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 25 | must pass |
| E2 | `lens` is set and matches the intent of the question | 15 | >= 0.80 |
| E3 | `summary` directly answers the question in 2-4 sentences | 15 | >= 0.85 |
| E4 | Every `representative_verbatim` is a real quote from the input verbatims | 20 | must pass |
| E5 | `takeaways` / themes are specific (name a topic + a fact), not generic | 15 | >= 0.80 |
| E6 | `suggested_lenses` are concrete and tied to the data (not "want more?") | 10 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E4 failure: inject "Every representative_verbatim must be copied from the provided verbatim_samples or topic sample_verbatims. Do not paraphrase into a fake quote."
E5 failure: inject "Takeaways and theme gists must name the specific topic and a concrete fact or direction — no generic 'customers have concerns'."
