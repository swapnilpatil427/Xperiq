# Experient AI Insights — Insight Taxonomy

> The contract. This document defines exactly what counts as an "insight" in Experient, the four layers of insight, the per-question-type insight catalog, the per-template-family insight bundles, the scoring/ranking system, the trust signals, and the data shape that backs them all. Engineering builds to this contract. PMs gate features on this contract.

This taxonomy is grounded in [RESEARCH.md](RESEARCH.md) and pressure-tested against [COMPETITIVE.md](COMPETITIVE.md). [ARCHITECTURE.md](ARCHITECTURE.md) describes how the pipeline produces these objects; [UX.md](UX.md) describes how they render.

---

## 1. Definitions

### 1.1 What is an insight?

> **Insight** (n.) — A *single*, *cited*, *quantified* statement about a survey, segment, or trend, produced by Experient's pipeline, that a user can act on. Has a confidence score, a sample size, source quotes, and (where appropriate) a recommended action.

An insight is **not** a chart. It is **not** a summary paragraph. It is **not** an LLM response. An insight is a structured object that *can* be rendered as a card, paragraph, chart annotation, alert, or Slack message — but its truth is in the structure.

### 1.2 What is not an insight (and how to render those things)

| Concept | Where it lives | NOT an insight because |
|---|---|---|
| Raw metric (NPS = 47) | KPI card | No interpretation; no source quotes; no action |
| Chart | Dashboard panel | Visual; not a claim |
| Verbatim quote | Response drawer | Source material, not interpretation |
| LLM narrative paragraph | Insight card body | Is a *rendering* of insights, not an insight itself |
| Recommended action | Insight card / workflow | Attached to an insight, not standalone |

---

## 2. The four layers

Per the canonical analytics maturity model (Gartner), every insight in Experient falls into one of four layers:

| Layer | Verb | Example insight | Powered by |
|---|---|---|---|
| **L1 — Descriptive** | What happened? | "NPS is 47 (±5 at 90% CI, n=312)" | Statistical computation |
| **L2 — Diagnostic** | Why did it happen? | "47% of detractors mentioned 'onboarding' — top driver of negative NPS this month" | KDA + ABSA + topic modeling |
| **L3 — Predictive** | What is likely next? | "Based on response velocity and sentiment trend, projected NPS at 1,000 responses: 51 ±4" | Time-series + ML |
| **L4 — Prescriptive** | What should we do? | "Fixing 'email verification loop' (cited 24×) is projected to raise NPS +3.2 ±1.8 — recommended action: create Linear ticket" | Uplift + causal reasoning |

**Layer progression rules:**

- L1 is always shown (table stakes; legacy XM has this)
- L2 unlocks at n ≥ 30 per relevant segment
- L3 unlocks at n ≥ 200 and ≥ 4 weeks of history
- L4 unlocks at n ≥ 500 *or* an explicit user request with caveats

**Failure mode to avoid:** Most legacy XM platforms stop at L1 + a chart and let humans do the rest. Most LLM upstarts skip to L4 with zero grounding. **Our edge is consistently shipping L2 and L3 with citations and CIs.**

---

## 3. Insight object schema

Every insight in our system is the same structured object. The UI, API, Slack message, and PDF export all consume the same schema.

```typescript
type Insight = {
  // Identity
  id: string;                          // UUID
  survey_id: string;                   // FK → surveys
  org_id: string;                      // tenant
  generated_at: string;                // ISO timestamp
  generated_by_run_id: string;         // FK → agent_runs (lineage)

  // Classification
  layer: 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';
  category: InsightCategory;           // see §4 catalog
  question_type: QuestionType | null;  // null if cross-question
  segment: Segment | null;             // null if survey-wide

  // The claim
  headline: string;                    // ≤120 chars, plain English
  narrative: string;                   // 1–4 sentences with [r123] citations
  recommended_action: Action | null;   // L4 only

  // The numbers (always from code, never LLM)
  metric: {
    name: string;                      // e.g. "nps", "detractor_share"
    value: number;
    unit: string;                      // "score", "percent", "count"
    ci_low: number;
    ci_high: number;
    ci_method: 'adjusted-wald' | 'wilson' | 'bootstrap' | 'bayesian';
    confidence_level: number;          // default 0.90
  } | null;

  // Grounding (REQUIRED for every narrative)
  citations: Array<{
    response_id: string;
    quote: string;
    sentiment: GoEmotion;
    relevance: number;                 // 0–1
  }>;

  // Trust
  trust: {
    score: number;                     // 0–100 composite
    components: {
      statistical: number;             // CI width × sample size adequacy
      coverage: number;                // % of relevant responses considered
      consistency: number;             // % of LLM samples that produced this
      grounding: number;               // citation count × relevance
    };
    sample_size: number;
    below_minimum_sample: boolean;     // if true, render as "exploratory"
  };

  // Reproducibility
  audit: {
    prompt_hash: string;               // sha256 of prompt template
    model: string;                     // e.g. "gemini-2.0-flash@2025-12"
    embedding_model: string;
    temperature: 0;                    // always pinned to 0
    seed: number | null;
    insight_hash: string;              // sha256 of canonicalized output
  };

  // Lifecycle
  user_state: {
    pinned: boolean;
    dismissed: boolean;
    converted_to_action_id: string | null;
    thumbs: 'up' | 'down' | null;
    notes: string | null;
  };
};
```

**Mandatory invariants** (enforced at validation time):

1. `narrative` must contain at least one `[rXXX]` citation for every factual claim
2. `metric.value` must equal a value computed by deterministic code (not LLM math)
3. `citations.length ≥ 2` OR `trust.below_minimum_sample === true`
4. `layer === 'prescriptive'` ⇒ `recommended_action !== null`
5. `audit.temperature === 0` and `audit.model` must be a pinned version string

---

## 4. The insight category catalog

Insights are grouped by **category**. Categories are stable, named, and finite. Each category has one or more *generators* (agents/skills/methods) that can produce it.

### 4.1 Score / Metric categories (L1 — Descriptive)

| Category | Question types | Example headline |
|---|---|---|
| `score.nps` | `nps` | "NPS is 47 (±5 at 90% CI, n=312)" |
| `score.csat` | `csat`, `rating` | "CSAT is 4.2 / 5.0 (±0.2, n=189)" |
| `score.ces` | `rating` (effort) | "CES is 2.4 / 7.0 — 78% report low effort" |
| `score.distribution` | `nps`, `csat`, `rating`, `slider` | "Promoter share: 52%, Passive: 28%, Detractor: 20%" |
| `score.choice_breakdown` | `multiple_choice`, `dropdown`, `checkbox` | "73% chose 'desktop' as primary device" |
| `score.matrix` | `matrix` | "All 5 rows scored above 4.0 except 'pricing transparency' (3.1)" |
| `score.ranking` | `ranking` | "Top-ranked feature: 'mobile app' — chosen #1 by 41%" |
| `score.completion` | (survey-level) | "Completion rate: 84% (15% drop on Q4)" |

### 4.2 Trend categories (L1 → L2)

| Category | Generator | Example |
|---|---|---|
| `trend.metric` | Prophet / STL | "NPS trending −2 pts/week over 6 weeks" |
| `trend.sentiment_drift` | Embedding shift | "Sentiment shifted negative on 'pricing' since 2026-04-15" |
| `trend.topic_emergence` | Cluster diffing | "'mobile crashes' emerged as a new topic in last 7 days (24 mentions)" |
| `trend.topic_decline` | Cluster diffing | "'onboarding confusion' down 60% since fix shipped 2026-04-01" |
| `trend.response_velocity` | Time-series | "Response rate 2.3× normal — likely linked to email campaign" |

### 4.3 Driver categories (L2 — Diagnostic)

| Category | Generator | Example |
|---|---|---|
| `driver.key` | Shapley + Bootstrap | "'Support response time' is the #1 driver of NPS (importance 0.31, CI [0.24, 0.38])" |
| `driver.delta` | Shapley over time windows | "'Pricing' rose from 4th to 1st driver of detractors over 30 days" |
| `driver.segment_specific` | Stratified Shapley | "For Enterprise tier, 'integration breadth' is the #1 driver (vs 'support' overall)" |
| `driver.quadrant` | IPA matrix | "'Onboarding speed' is high-importance / low-performance → highest-leverage fix" |

### 4.4 Voice categories (L2 — Diagnostic, text-based)

| Category | Generator | Example |
|---|---|---|
| `voice.topic` | BERTopic + LLM-label | "Topic 'Email verification loop' (n=24, 8% of detractors)" |
| `voice.theme` | Cluster of topics | "Theme 'Onboarding friction' spans 4 topics: email verify, password reset, profile setup, tutorial skip" |
| `voice.emotion` | GoEmotions | "Dominant emotion among detractors: 'frustration' (38%), 'disappointment' (22%)" |
| `voice.aspect_sentiment` | ABSA | "On 'pricing': 62% negative; on 'design': 81% positive" |
| `voice.intent` | LLM multi-label | "12 responses contain churn-intent language ('considering switching')" |
| `voice.suggestion` | LLM extraction | "31 distinct feature suggestions — top: 'CSV bulk import' (mentioned 8×)" |
| `voice.quote_exemplar` | Centroid retrieval | "Most representative quote for 'onboarding friction': 'I wasted 15 minutes on email verification'" |

### 4.5 Segment categories (L2 — Diagnostic)

| Category | Generator | Example |
|---|---|---|
| `segment.contrast` | Stratified analysis | "Enterprise customers score NPS 62; SMB 31 — 31-point gap" |
| `segment.outlier` | Statistical outlier | "Cohort '2026-Q1 signups' has NPS 22 — 3σ below cohort mean of 51" |
| `segment.persona` | Embedding cluster | "Persona 'Power user' (n=72) emphasizes API depth; Persona 'New user' (n=204) emphasizes onboarding" |

### 4.6 Anomaly categories (L1 → L2)

| Category | Generator | Example |
|---|---|---|
| `anomaly.spike` | Prophet outlier | "NPS dropped 12 points on 2026-05-10 (outside 95% PI) — likely tied to incident X" |
| `anomaly.regime_change` | Bayesian changepoint | "NPS regime shift detected on 2026-04-20 — new mean 39 vs prior 51" |
| `anomaly.segment_collapse` | Stratified Prophet | "Segment 'Trial users' NPS collapsing: 48 → 21 over 14 days" |

### 4.7 Predictive categories (L3 — Predictive)

| Category | Generator | Example |
|---|---|---|
| `predict.metric_forecast` | Prophet / BSTS | "Projected NPS at 1,000 responses: 51 ±4" |
| `predict.churn_risk` | XGBoost + survey | "37 respondents flagged high churn risk (probability > 0.7)" |
| `predict.completion_likelihood` | Survival analysis | "Predicted final response count: ~890 (90% PI: 820–960)" |
| `predict.topic_growth` | Time-series on topic | "'Mobile crashes' projected to be top-3 topic by next week if trend continues" |

### 4.8 Prescriptive categories (L4 — Prescriptive)

| Category | Generator | Example |
|---|---|---|
| `action.fix_friction` | Uplift on topic resolution | "Fixing 'email verification loop' projected to raise NPS +3.2 ±1.8" |
| `action.target_segment` | Uplift on segment intervention | "CSM outreach to 12 enterprise detractors projected to recover 9.2K ARR" |
| `action.workflow_trigger` | Rule-based | "Create Linear ticket for 'mobile crashes' (severity high, 24 mentions)" |
| `action.copy_change` | LLM suggestion | "Q7 wording ambiguous — 28% of respondents flagged via 'don't understand' open text" |

### 4.9 Meta categories (cross-survey, organizational)

| Category | Generator | Example |
|---|---|---|
| `meta.benchmark` | Industry baseline lookup | "Your CSAT (4.2) is in the 78th percentile for SaaS (n=312 industry surveys)" |
| `meta.cross_survey` | Embedding similarity | "Topic 'pricing transparency' appears in 4 of your 7 active surveys — possibly systemic" |
| `meta.bias_warning` | Distribution audit | "Response sample 73% from Enterprise; aggregate NPS may overstate SMB experience" |
| `meta.sample_warning` | Sample-size check | "n=18 below threshold of 30 — surfacing as exploratory, not insight" |

---

## 5. Per-question-type insight catalog

For each of the 13 question types in our system (see [codebase mapping](../../app/src/constants/questionTypes.ts)), this is the full set of insights we generate.

### 5.1 `nps`

- `score.nps` — value + CI + sample size
- `score.distribution` — promoter/passive/detractor split
- `trend.metric` — over time (if enough history)
- `driver.key` — top drivers (requires ≥1 other question)
- `voice.topic` from open-text follow-up (the "why" question)
- `voice.emotion` segmented by Promoter/Passive/Detractor
- `voice.aspect_sentiment` for top aspects
- `anomaly.spike`, `anomaly.regime_change`
- `predict.metric_forecast`
- `action.fix_friction` from top detractor topic

### 5.2 `csat`

- `score.csat` — mean + CI, top-2-box %, distribution
- `trend.metric`
- `driver.key`, `driver.quadrant`
- Same voice / anomaly / predict / action chain as NPS

### 5.3 `rating` (general 1-5/1-7/1-10)

- `score.csat` (treated as CSAT-equivalent if loyalty/satisfaction wording)
- `score.distribution`
- `trend.metric`
- `driver.key`

### 5.4 `slider`

- `score.distribution` — histogram + mean ± SD
- `segment.contrast` — by demographic
- `trend.metric`
- `voice.aspect_sentiment` — pair with open text

### 5.5 `multiple_choice`

- `score.choice_breakdown` — % per option with CI
- `segment.contrast` — does choice vary by segment?
- `trend.metric` — choice share over time
- `driver.key` — choice as predictor of NPS
- `anomaly.regime_change` — choice distribution shift

### 5.6 `checkbox`

- `score.choice_breakdown` — multi-select frequency
- `voice.theme` — co-selection patterns ("'mobile' + 'desktop' chosen together by 41%")
- `segment.contrast`

### 5.7 `dropdown`

- Same as `multiple_choice`

### 5.8 `ranking`

- `score.ranking` — average rank per item + CI
- `segment.contrast` — does ranking differ by segment?
- `trend.metric` — top-ranked over time
- `voice.theme` — pair with open text on "why"

### 5.9 `open_text`

- `voice.topic` — BERTopic clusters with LLM labels
- `voice.theme` — meta-clusters
- `voice.emotion` — GoEmotions distribution
- `voice.aspect_sentiment` — ABSA
- `voice.intent` — multi-label
- `voice.suggestion` — feature/copy/process suggestions
- `voice.quote_exemplar` — per topic
- `trend.topic_emergence`, `trend.topic_decline`
- `action.fix_friction` from top negative topic

### 5.10 `short_text`

- `voice.topic` (lighter clustering — typically structured input like "what tool do you use?")
- `score.choice_breakdown` — when input is enumerable (auto-normalize)

### 5.11 `matrix`

- `score.matrix` — per-row mean + CI, row-by-column heatmap
- `driver.key` — each row as a driver candidate
- `segment.contrast` — row scores by segment

### 5.12 `date`

- `score.distribution` — temporal histogram
- `trend.metric` — date-of-event vs current sentiment

### 5.13 `statement`

- (none — display-only; never generates insights)

---

## 6. Per-template-family insight bundles

For each of our **35+ system templates** (NPS, CSAT, CES, eNPS, Pulse, Engagement, VoC, etc.), the "default insight bundle" is the curated set of insights that appears on first load. PMs sign off on each bundle.

### 6.1 NPS family (`nps`, `nps_relational`)

**Always-on bundle:**
1. `score.nps` (the headline)
2. `score.distribution` (promoter/passive/detractor)
3. `voice.topic` segmented by Promoter / Passive / Detractor (top 3 each)
4. `driver.key` (when ≥2 questions answered)
5. `trend.metric` (when ≥2 weeks history)
6. `action.fix_friction` (top detractor topic)

### 6.2 CSAT family (`csat`)

1. `score.csat`
2. `score.distribution`
3. `voice.aspect_sentiment` on the open-text follow-up
4. `driver.key`
5. `voice.suggestion` (cleanups, improvements)

### 6.3 CES family (`ces`)

1. `score.ces` + top-box %
2. `voice.intent` — flag churn-intent language
3. `voice.aspect_sentiment` — by touchpoint
4. `action.fix_friction` — top friction phrase

### 6.4 Employee — eNPS

1. `score.nps` (employee variant)
2. `score.distribution`
3. `voice.theme` (career growth, manager quality, workload, comp)
4. `segment.contrast` — by department, tenure
5. `meta.bias_warning` — small-team identifiability

### 6.5 Pulse / Engagement (Gallup Q12-compatible)

1. `score.matrix` — Q12 dimensions heatmap
2. `driver.key` — top Q12 drivers of overall engagement
3. `trend.metric` — engagement index over time
4. `voice.suggestion` — open responses
5. `meta.benchmark` — vs Gallup industry baseline (when integrated)

### 6.6 Voice of Customer (`voc`)

1. `voice.theme` — top themes (full clustering)
2. `voice.emotion` distribution
3. `voice.intent` distribution
4. `voice.aspect_sentiment` for top aspects
5. `voice.suggestion` — verbatim suggestions
6. `meta.cross_survey` — recurring themes across all org surveys

### 6.7 Other verticals

Each vertical (retail, healthcare, education, hospitality, etc.) inherits the base bundle of its primary metric (NPS / CSAT / CES) plus **vertical-specific category specializations**. For example:

- **Healthcare → patient_satisfaction**: adds `voice.aspect_sentiment` pre-tuned for "wait time", "communication", "staff empathy", "outcomes"
- **Retail → checkout_experience**: adds `voice.aspect_sentiment` pre-tuned for "speed", "payment", "stock", "store_layout"
- **Hospitality → guest_satisfaction**: adds `voice.aspect_sentiment` pre-tuned for "cleanliness", "staff", "amenities", "value"

The vertical specialization is a **prompt-side configuration**, not a separate model. This is one of our quiet asymmetric advantages over Lexalytics-based competitors.

---

## 7. Scoring & ranking

Once generated, insights compete for screen real estate. The default sort is by **priority score**.

```
priority = severity × confidence × actionability × novelty
```

Each component is 0–1:

- **Severity** — how far from baseline / industry benchmark / target. `|metric.value − baseline| / baseline_std`, clipped to [0, 1]
- **Confidence** — `trust.score / 100`
- **Actionability** — 1.0 for L4 prescriptive, 0.7 for L2 diagnostic, 0.4 for L1 descriptive, 0.5 for L3 predictive
- **Novelty** — `1.0` if first time seen this period, decays exponentially each render the user dismisses or ignores

User actions feed back into novelty:
- Thumbs-up → novelty stays high; similar insights ranked higher
- Thumbs-down → category demoted by 0.2 (per-user, per-org)
- Dismissed → novelty drops to 0 for 7 days
- Converted to action → category boosted by 0.1 (correlated with workflow creation)

The home dashboard shows **top 8 by priority**. The user can sort by category, layer, or recency.

---

## 8. Trust signals — visible to users

Every insight card surfaces (always, never on hover-only):

1. **Confidence chip** — color-coded `0–100`:
   - 80+ → green "High confidence"
   - 60–80 → yellow "Moderate"
   - < 60 → grey "Exploratory" (label is "Exploratory finding", not "Insight")
2. **Sample size chip** — `n=312`
3. **Citation count chip** — `🔗 4 quotes`
4. **CI bar on the number** — visual confidence interval, never just a point
5. **"Why this insight?"** — opens a drawer with:
   - Component breakdown of trust score
   - List of citations (full quote + response ID + sentiment)
   - Generator method ("Shapley regression with bootstrap CIs")
   - Audit hash (for support / repro)

These signals are **not optional UI polish**. They are the product differentiation. Hide them in a demo and we look identical to Qualtrics. Show them prominently and we make the legacy stack look reckless.

---

## 9. Confidence score — concrete formula

```
trust.score = round(
  0.30 × statistical
+ 0.25 × coverage
+ 0.20 × consistency
+ 0.25 × grounding
)
```

Where each component is 0–100:

- **statistical** = `100 × min(1, n_segment / n_min) × min(1, target_ci_width / observed_ci_width)`
  - `n_min` = 30 for L1, 50 for L2, 200 for L3, 500 for L4
  - `target_ci_width` = 0.10 (10 pts) for proportions, 0.20 for unit-scaled
- **coverage** = `100 × responses_considered / responses_relevant`
- **consistency** = `100 × claims_present_in_all_samples / total_claims_in_sample` (n=3 LLM samples)
- **grounding** = `100 × min(1, citation_count / 3) × mean(citation.relevance)`

This is the formula the audit drawer shows users.

---

## 10. Refresh policy

Insights live in a `materialized` table. They are recomputed on:

| Trigger | Frequency |
|---|---|
| New response | Incremental — score insights re-computed; topic clustering re-run if n_new ≥ 10% of corpus |
| Manual "regenerate" | On demand, idempotent |
| Schedule | Hourly (free tier), every 5 min (paid), real-time stream (enterprise) |
| Survey edit | Topic/aspect re-clustered if question added |
| Workflow execution | Insight that triggered it is timestamped |

A **soft-invalidate** pattern: when a recompute is queued, existing insights keep showing with a "fresh in: ~12s" badge until the new ones replace them. Never blank UI.

---

## 11. Internationalization

Every insight carries a `locale` field. The pipeline:

1. Detects response language per-verbatim (fastText or LLM)
2. Runs ABSA / emotion / topic in the response's native language using a multilingual model
3. Generates narrative in the **org's primary locale** (configured in [BrandSettings])
4. Citations remain in original language; quote drawer optionally offers translation

This is the LLM-native advantage made concrete: 60+ languages out of the box, no per-language model pipeline.

---

## 12. Versioning & contracts

This taxonomy is a **public contract**. Every change is versioned (semver):

- `category` set is append-only between major versions
- `metric.name` values are stable between major versions
- `Insight` object shape is forward-compatible within a major version (additive fields only)

Major version bumps require:
- PM sign-off
- Engineering migration plan for stored insights
- API deprecation notice (90 days)

Current version: **1.0.0** (this document).

---

## 13. What this taxonomy explicitly does NOT include (v1)

Defer to v2+. Listed here to keep scope honest:

- **Voice / video** — multimodal insight categories
- **Cross-org benchmarks** — `meta.benchmark` against anonymized peer corpora (privacy review needed)
- **Causal attribution** for product launches (CausalImpact integration)
- **Latent Class segmentation** — for v1 use RFS quintiles
- **Earned Growth Rate** — requires revenue/referral integration
- **Synthetic respondent insights** — explicitly excluded as production data per [RESEARCH.md §8.3](RESEARCH.md)

---

## 14. The PM gate

Before any insight category ships, PM must answer:

1. **What is the one-sentence claim?** (≤120 chars)
2. **What method produces the numbers?** (must trace to [RESEARCH.md](RESEARCH.md))
3. **What is the minimum n?**
4. **What citations does it produce?**
5. **What action can the user take from it?** (or explicit: "informational, no action")
6. **What is the credit cost?** (Phase 3 billing)
7. **What is the demo line?** ("Watch — we just identified the top driver of detractor sentiment with citations to 4 real customers, in 12 seconds")

No category ships without sign-off on all seven.
