# Evals: survey-recommender

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 30 | must pass |
| E2 | distribution_recommendations, action_plan, cadence_recommendation present | 20 | must pass |
| E3 | action_plan items include owner, timeline, and success_metric | 25 | >= 0.80 |
| E4 | distribution_recommendations include expected_response_rate | 15 | >= 0.75 |
| E5 | cadence_recommendation includes rationale | 10 | >= 0.75 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
