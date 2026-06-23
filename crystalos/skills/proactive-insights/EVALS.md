# Evals: proactive-insights

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema | 25 | must pass |
| E2 | `should_notify` is false (empty cards) when no signal clears the bar | 20 | must pass |
| E3 | No card fingerprint appears in `recently_notified` (unless marked escalating) | 20 | must pass |
| E4 | Card count <= thresholds.max_cards; cards ranked by importance/novelty/urgency | 15 | >= 0.80 |
| E5 | Each `detail` cites real numbers from the input signals | 10 | >= 0.85 |
| E6 | `priority` bucket matches the highest card severity | 10 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E2 failure: inject "If no anomaly/trend/driver/segment signal clears the threshold, return should_notify=false, priority=none, empty insight_cards, empty digest_summary. Do not invent an alert."
E3 failure: inject "Drop any candidate whose fingerprint is in recently_notified. Only re-surface if it is genuinely escalating, and then set novelty=escalating."
