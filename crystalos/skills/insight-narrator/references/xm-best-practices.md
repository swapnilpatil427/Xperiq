# XM Best Practices Reference

## NPS (Net Promoter Score) — Bain & Company Standard

### Score Interpretation
| Score | Rating | Typical Action |
|-------|--------|----------------|
| < 0 | Poor | Urgent intervention required |
| 0-30 | Good | Focus on passive conversion |
| 30-70 | Great | Amplify promoter drivers |
| 70+ | Excellent | Benchmark and sustain |

### Industry Benchmarks (Satmetrix 2023)
| Industry | Median NPS |
|----------|-----------|
| Technology / SaaS | 35 |
| Healthcare | 27 |
| Retail | 46 |
| Financial Services | 34 |
| Education | 47 |
| Government | 14 |
| Professional Services | 43 |
| E-commerce | 45 |

### Segment Analysis
- **Promoters (9-10):** Leverage for referrals, case studies, beta programs
- **Passives (7-8):** Highest conversion potential — identify their unmet needs
- **Detractors (0-6):** Churn risk — prioritize recovery, find root cause

### NPS Math
- NPS = % Promoters - % Detractors (range: -100 to +100)
- Margin of error (95% CI): ≈ 1.96 × √(P(1-P)/n) × 200, where P = promoter rate
- Meaningful change threshold: ≈ ±3-5 points for n > 200

## CSAT (Customer Satisfaction Score)

### Scale Interpretation (1-5)
| Score | Rating |
|-------|--------|
| < 3.5 | Needs urgent attention |
| 3.5-4.0 | Room for improvement |
| 4.0-4.5 | Good |
| > 4.5 | Excellent |

### Percentage-based CSAT (% satisfied or very satisfied)
| % | Rating |
|---|--------|
| < 75% | Needs improvement |
| 75-85% | Good |
| > 85% | Excellent |

## CES (Customer Effort Score)

### Scale Interpretation (1-7, LOWER IS BETTER)
| Score | Effort Level | Risk |
|-------|-------------|------|
| < 3.5 | Low effort | Loyalty driver |
| 3.5-5.0 | Moderate effort | Watch trends |
| > 5.0 | High effort | Churn risk |

### CES-Churn Correlation
- Customers with high-effort interactions are 4× more likely to leave than those with low-effort interactions (CEB/Gartner research)
- Reducing effort by 1 point can reduce churn by 5-10%

## eNPS (Employee Net Promoter Score)

### Score Interpretation
| Score | Engagement Level |
|-------|----------------|
| < 10 | Poor — high flight risk |
| 10-30 | Good — room for growth |
| 30-50 | Great — engaged workforce |
| > 50 | Excellent — highly engaged |

### Key Engagement Drivers (HR research consensus)
1. Manager effectiveness and recognition
2. Growth and development opportunities
3. Work-life balance and flexibility
4. Culture alignment and psychological safety
5. Compensation and benefits equity

## Common XM Patterns and Their Interpretations

### Bimodal Sentiment Distribution
When a topic has both high positive AND high negative verbatims:
- Often indicates inconsistent experience (varies by rep, region, or use case)
- Diagnostic action: segment by cohort (enterprise vs SMB, channel, tenure)
- NOT a "mixed" result — it signals a process or training inconsistency

### NPS Plateau
When NPS has been stable for 3+ quarters:
- Check if the metric is measuring the right thing
- Passive-to-promoter gap is the growth lever — not detractor recovery
- Investigate what the 7-8 group is missing vs. 9-10 group

### Topic Volume ≠ Topic Impact
- High volume topics are not always the highest NPS-impact topics
- Calculate NPS impact per topic: (topic NPS if topic mentioned) - (overall NPS)
- Focus prescriptive actions on high-impact topics, not just high-volume

### Trending Metrics
- A metric improving from -5 to +5 (+10 pts) is more actionable than one stable at 40
- Momentum matters: 3 consecutive quarters of improvement signals systemic fix
- Single-quarter spikes may be seasonal or response-pool artifacts

## Prescriptive Action Templates

### Support Quality Issues
"Route the top 20% most-effort support interactions to senior agents. Target: reduce CES from {score} to < 4.5 within 60 days."

### Onboarding Friction
"Audit the onboarding flow for steps with > 30% drop-off. Redesign to ≤ 5 steps. Assign: Product + CS ops. Timeline: 6 weeks."

### Promoter Amplification
"Launch a referral program targeting the {n} promoters from Q{X}. 5% conversion = {est_referrals} new leads. Assign: Marketing."

### Detractor Recovery
"Trigger a personal outreach sequence for all detractors (score ≤ 4) within 48 hours of response. Assign: CSM team."

## Insight Quality Standards

### Headlines (< 120 chars)
Good: "Onboarding friction drives 43% of detractors — account setup is the #1 pain point"
Bad: "Customers have feedback about onboarding"

### Narratives
- Lead with the data point (number first, interpretation second)
- Include the "so what" — what does this mean for the business?
- Use [rXXXX] citation markers when referencing specific verbatims
- Avoid hedging language ("might", "could possibly", "it seems")

### Verbatims
- Select verbatims that REPRESENT the pattern, not outliers
- Prefer verbatims that name a specific process or product feature
- Paraphrase when the original is too long, using "..."

## What Makes a Finding Diagnostic (Not Just Descriptive)

Descriptive: "28% of respondents mentioned slow response times."
Diagnostic: "Slow response times are driven by queue overflow in the SMB tier — 73% of slow-response complaints come from accounts with < 50 seats where there's no dedicated CSM."

The diagnostic finding proposes a mechanism, not just a pattern.
