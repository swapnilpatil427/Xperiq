# Evals: insight-narrator

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | Required fields present and non-empty: title, executive_summary, key_findings, recommended_actions, confidence | 20 | must pass |
| E3 | key_findings count is 3-5 | 15 | >= 0.80 |
| E4 | Each finding has a non-empty supporting_verbatim | 15 | >= 0.90 |
| E5 | recommended_actions are specific (each action > 5 words, names a team or deliverable) | 10 | >= 0.75 |
| E6 | executive_summary is 2-3 sentences and contains no bullet points | 10 | >= 0.85 |

## Scoring

Score = weighted average of all numeric-threshold criteria.
Hard-fail criteria (must pass) gate the score: failure there = score 0, no retry needed for structural issues.

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure, inject the failed criteria IDs, their descriptions, and scores into a retry prompt.
The retry prompt instructs the model to fix only the failed criteria without changing passing ones.
Maximum 1 retry per execution (controlled by max_retries in SKILL.md frontmatter).

## Common Failure Modes

- E3: LLM returns only 2 findings (too brief) or 7+ (not prioritized) → inject "You must return 3-5 findings, no more, no less."
- E4: LLM writes generic findings without verbatim quotes → inject "Every finding MUST include a supporting_verbatim that is a direct or paraphrased quote."
- E5: Actions are vague ("improve onboarding") → inject "Every action must name a team and a deliverable, not a general direction."
