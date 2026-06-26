<!-- Auto-generated from skill_examples DB table. Do not edit manually. -->

## Example 1 — NPS survey with clear driver

**Input:**
```json
{
  "message": "Give me a quick summary I can share with my CEO",
  "survey_facts": {
    "survey_id": "s_abc123",
    "response_count": 312,
    "survey_type": "NPS",
    "nps_score": 34,
    "top_topics": [
      {"label": "Onboarding complexity", "volume": 89, "sentiment": -0.71},
      {"label": "Support responsiveness", "volume": 74, "sentiment": 0.62},
      {"label": "Product reliability", "volume": 61, "sentiment": 0.44}
    ]
  },
  "insights": [
    {"id": "i1", "category": "diagnostic", "headline": "Onboarding is the primary detractor driver", "layer": "diagnostic", "trust_score": 0.88}
  ]
}
```

**Output:**
```json
{
  "summary": "NPS stands at 34 across 312 responses — a solid baseline but below our 45-point target. Onboarding complexity is the primary drag, cited negatively by 89 respondents. Support quality is a genuine strength; the opportunity is fixing onboarding to convert passives to promoters.",
  "trend_findings": [
    {"finding": "Onboarding complexity accounts for 29% of all feedback with strongly negative sentiment (-0.71) — the single biggest risk to NPS improvement."},
    {"finding": "Support responsiveness is the top positive driver (74 mentions, +0.62 sentiment) — a replicable model for other touchpoints."},
    {"finding": "Product reliability scores neutrally positive (61 mentions, +0.44) — stable but not a differentiated strength."}
  ],
  "suggestions": [
    "Which specific step in onboarding generates the most complaints?",
    "How does our NPS of 34 compare to last quarter?"
  ]
}
```
