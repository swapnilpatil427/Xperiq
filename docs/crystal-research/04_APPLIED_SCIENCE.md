# Crystal Applied Science

**Document series:** Crystal Research — 04  
**Owner:** Applied Science  
**Status:** Living document — updated as methodology evolves  
**Last revised:** 2026-05-20

---

## Table of Contents

1. [Science Philosophy](#1-science-philosophy)
2. [Signal Catalog](#2-signal-catalog)
3. [Checkpoint Delta Analysis](#3-checkpoint-delta-analysis)
4. [Anomaly Detection Framework](#4-anomaly-detection-framework)
5. [Industry Benchmark Design](#5-industry-benchmark-design)
6. [Predictive Projection](#6-predictive-projection)
7. [Crystal Eval Framework](#7-crystal-eval-framework)
8. [Promoter/Detractor Language Separation](#8-promoterdetractor-language-separation)
9. [Statistical Significance Policy](#9-statistical-significance-policy)
11. [Specialist Context Design](#11-specialist-context-design)
12. [Progressive Intelligence — Accuracy Tiers Below 200 Responses](#12-progressive-intelligence--accuracy-tiers-below-200-responses)
13. [Research Roadmap](#13-research-roadmap)

---

## 1. Science Philosophy

### What makes an XM insight trustworthy, provable, and actionable?

Experience Management has a measurement problem. Most XM platforms produce dashboards full of numbers, but numbers are not insights. A score of 42 on an NPS survey is a statistic. The statement "Respondents who mentioned billing difficulty score 18 points below the survey average, and that gap has widened 7 points week-over-week" is an insight — it names a cause, quantifies the magnitude, and implies urgency.

Crystal is built around three commitments that separate insights from statistics.

**Trustworthy: Every claim must be falsifiable from the source data.**  
An insight Crystal presents must be derivable from data Crystal has access to. The signal catalog in Section 2 defines exactly how each number is computed — which formula, which data source, which sample size threshold, which caveats. If the formula cannot be applied (e.g., no NPS question in the survey), Crystal does not fabricate an estimate. The hallucination filter in `agents/agents/crystal.py` enforces this deterministically: any insight ID cited by the LLM that does not exist in the provided context is stripped before the response reaches the user. Trust scores (`trust_json` on every `insights` row) decompose into four independent components — statistical (sample size), coverage (fraction of responses), consistency (sentiment uniformity within cluster), and grounding (verifier pass/fail) — so the source of low confidence is always attributable.

**Provable: Methodology is explicit, reproducible, and documented.**  
Every signal in Section 2 includes a formula written in the same notation used by the implementation. The NPS driver score formula in `agents/lib/topic_signals.py` matches the point-biserial correlation definition exactly, including the decision to use population standard deviation (not Bessel-corrected sample std) because the survey dataset is treated as the full population of interest, not a sample. This level of explicitness exists so a skeptical data scientist can reproduce any signal independently from the raw `responses` table without reading Crystal's source code.

**Actionable: Insights must close the loop to a decision.**  
The four-layer insight taxonomy (Descriptive → Diagnostic → Predictive → Prescriptive) is not cosmetic. Each layer answers a different management question. Descriptive answers "what happened." Diagnostic answers "why." Predictive answers "what happens next if nothing changes." Prescriptive answers "what should I do now." A platform that only delivers descriptive statistics has completed 25% of the job. Crystal is designed to always push toward the prescriptive layer: every diagnostic topic insight has a `friction_type` classification (product / process / people / policy / price), a root cause hypothesis, and a business impact statement. Every prescriptive insight has an ICE score (Impact, Confidence, Ease) to help teams prioritize.

### The difference between a statistic and an insight

| Dimension | Statistic | Insight |
|-----------|-----------|---------|
| Subject | A number | A pattern with a cause |
| Scope | Single metric, single point in time | Relationship between signals, often over time |
| Comparison | None | Against baseline, benchmark, or prior period |
| Implication | Absent | Explicit — "this means..." |
| Action | Not implied | Specific recommendation or question |
| Confidence | Not stated | Quantified (sample size, CI, trust score) |
| Falsifiability | N/A | Derivable from data in context |

Crystal's insight generation pipeline enforces this distinction structurally. The `node_narrate` step uses domain-expert LLM agents (`agents/agents/insight_experts.py`) that encode this standard: `NpsExpertOutput` requires `key_driver_hypothesis`, `CsatExpertOutput` requires `key_driver_hypothesis`, `TopicExpertOutput` requires `root_cause_hypothesis`, `business_impact`, and `friction_type`. These are not optional fields — they are required output fields that the LLM must populate or the response is rejected by Pydantic validation and retried.

---

## 2. Signal Catalog

### 2.0 Question Type → Signal Mapping

Before any signal can be computed, the pipeline must know which question in the survey produces which signal. This mapping is deterministic: it reads `surveys.questions` JSONB and matches `question.type` to the signal extractor.

**Canonical question type → signal mapping:**

| Question type | Signal produced | Value domain | Notes |
|---|---|---|---|
| `nps` | `nps_score` | Integer 0–10 | One NPS question per survey expected. If multiple, use the first. |
| `csat` | `csat_score` | Numeric, scale in `scale_max` | If scale_max is 5, normalize to 1-5 for comparisons |
| `ces` | `ces_score` | Integer 1–7 | Lower = less effort = better |
| `rating` | `ratings[]` | Numeric, normalized to 0-1 | Added to ratings array, not a single score |
| `scale` | `ratings[]` | Integer, treated as rating | Same as `rating` type |
| `text` | `open_texts[]` | String | Fed into ABSA pipeline |
| `textarea` | `open_texts[]` | String | Fed into ABSA pipeline |
| `multiple_choice` | Not extracted | — | Not used by pipeline currently |
| `checkbox` | Not extracted | — | Not used by pipeline currently |

**Survey capability flags:** At ingest time, `node_ingest` computes boolean flags from the question type set:
- `has_open_text`: at least one `text` or `textarea` question → gates ABSA, topic discovery, narration
- `has_nps`: at least one `nps` question → gates NPS signal computation
- `has_csat`, `has_ces`, `has_ratings`: similarly gate their respective computations

These flags are stored in pipeline state and drive conditional node execution. A survey missing a question type simply produces `None` for that signal — no error, no fallback fabrication.

### 2.1 Survey-Level Signals

These signals are computed in `agents/tools/metrics.py` during `node_metrics` of the insights pipeline. They operate on the full set of responses loaded for the survey run (up to 300 on bootstrap, 200 on incremental runs).

| Signal | Formula / Method | Data Source | Interpretation | Known Limitations |
|--------|------------------|-------------|----------------|-------------------|
| **NPS Score** | `(promoter_count - detractor_count) / n * 100`, range [-100, 100]. Promoters = NPS response 9-10; detractors = 0-6. | `responses.nps_score` (extracted from `answers` JSONB where question type = `nps`) | The gold-standard loyalty metric. Industry median varies by vertical (see Section 5). Anything above 0 means more promoters than detractors. | Requires an NPS question in the survey. Responds to 0-10 scale only. NPS has well-documented ceiling/floor effects at small n. |
| **NPS Wilson CI** | Wilson score CI applied independently to promoter_rate and detractor_rate. `ci_low = (p_lo - d_hi) * 100`, `ci_high = (p_hi - d_lo) * 100`. z=1.96 (95% confidence). Implemented in `compute_nps_ci()`. | Same as NPS Score | Use the CI when reporting directional changes. A score delta is only meaningful when the confidence intervals of the two periods do not overlap. | CI becomes very wide below n=30. Do not report NPS delta as significant if CIs overlap (see Section 9). |
| **NPS Distribution** | Counts and percentages for each response value 0-10. `Counter(int(s) for s in scores)` | Same | Bimodal distributions (many 9-10 AND many 0-3) indicate a polarized experience — very different from a unimodal distribution at 7. | Distribution shape is underused in most platforms; Crystal surfaces it in predictive insights. |
| **CSAT Score** | `mean(csat_scores)` on raw scale. Scale is survey-defined (typically 1-5 or 1-7). `compute_csat()` returns `{score, n, scale_min, scale_max}`. | `responses.csat_score` | Higher = better satisfaction. For a 1-5 scale, 4.0+ is generally strong. | Scale ambiguity: 4.0 means very different things on a 1-5 vs 1-10 scale. Crystal normalizes to the survey's defined scale before comparison. |
| **CES (Customer Effort Score)** | `mean(ces_scores)`. Lower = less effort = better. Typically 1-7 scale. `compute_ces()`. | `responses.ces_score` | CES predicts churn better than NPS in transactional contexts (Gartner/CEB, 2010). A mean above 5 on a 1-7 scale is a retention risk signal. | CES is directionally inverted from CSAT and NPS (lower is better), which confuses visual displays. Crystal always labels the direction explicitly. |
| **Completion Rate** | `(responses with at least one non-null answer / total submissions) * 100`. `compute_completion_rate()`. | `responses.answers` | High abandonment (< 70%) signals survey fatigue or a confusing question flow. | Partial-complete submissions are counted as incomplete here, which may undercount if respondents answered only the first question intentionally. |
| **Response Velocity** | `count(responses) for each day` over the last 30 days. `compute_response_trend_analysis()` returns a trend dict with daily counts, 7-day rolling mean, and a simple growth rate. | `responses.submitted_at` | Declining velocity often precedes NPS decline by 2-4 weeks — respondents disengage before sentiment turns negative. | Velocity is highly seasonal. A post-campaign spike followed by low-traffic weeks is not a decline. |
| **Response Quality Score** | Proxy derived from `is_meaningful_text()` applied to open text answers. `quality_pct = meaningful_texts / total_open_texts * 100`. | `responses.answers` open text fields | High quality score means respondents are writing substantive feedback. Low score (<40%) means most are submitting blank or "n/a" responses, limiting topic analysis. | The `is_meaningful_text()` filter uses min 10 chars and 3 alpha tokens — it is intentionally generous to avoid discarding genuine terse feedback (e.g., "Price too high"). |

### 2.2 Per-Topic Signals

These signals are computed in `agents/lib/topic_signals.py` via `compute_full_topic_signals()`. They are pure Python with no LLM calls — deterministic, unit-tested, and always reproducible from the same input data. They are written to both `survey_topics` and `topic_windows` tables.

#### Volume Signals

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **response_count** | `len(cluster_response_ids)` — unique respondent count, not ABSA item count. One respondent who answers two open-text questions contributes 2 ABSA items but 1 to response_count. | Raw volume of distinct respondents who mentioned this topic. | Does not distinguish between topics where the respondent mentioned it in passing vs. it being their primary complaint. |
| **response_pct** | `response_count / total_responses * 100` | "What fraction of my respondents brought up this topic?" Values above 20% are significant. | Meaningful only relative to total_responses for the same run. Do not compare across surveys with different sizes. |
| **confidence_level** | `'high'` if response_count >= 10; `'medium'` if >= 3; `'low'` if < 3. | A 'low' confidence topic has fewer than 3 respondents mentioning it — signals and percentages are not trustworthy. Crystal suppresses directional claims on low-confidence topics. | Thresholds are conservative. Some teams have argued for 5/15/30 thresholds; we chose 3/10 to avoid suppressing early signals in small surveys. |

#### Sentiment Signals

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **avg_sentiment_score** | `mean(clamp(score, -1, 1) for all ABSA items in cluster)`. Clamp is applied before averaging to prevent hallucinated out-of-range LLM scores from distorting the mean. | Range [-1.0, 1.0]. 0 is neutral. Positive = net positive sentiment about this topic. | Mean sentiment is sensitive to extreme values even after clamping. Use `net_sentiment` for a more robust directional signal. |
| **net_sentiment** | `(positive_count - negative_count) / n * 100`. Range [-100, 100]. | Directly analogous to NPS. A topic with net_sentiment of -40 has 40 more negative mentions than positive. Compare to survey-level NPS as a sanity check: high-NPS surveys should have high-net_sentiment topics. | Does not capture intensity. A topic where every mention is mildly negative scores the same as one where every mention is furious. Use urgency_score for intensity. |
| **sentiment_positive_pct** | `positive_count / n * 100` | Fraction of topic mentions with positive ABSA label. | ABSA is an LLM call and can mislabel neutral-but-polite feedback as positive. Treat any single ABSA result as probabilistic; the aggregate is reliable for n >= 10. |
| **sentiment_negative_pct** | `negative_count / n * 100` | Fraction of topic mentions with negative ABSA label. | Same as above. |
| **sentiment_neutral_pct** | `(n - positive_count - negative_count) / n * 100`. Computed as residual to guarantee `pos + neg + neutral = 100`. | | |

#### Emotion Distribution Signals

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **emotion_distribution** | `{canonical_emotion: count/n}` — sorted by descending frequency. All LLM-returned emotion strings are canonicalized through `EMOTION_CANONICALIZE` mapping (12 canonical XM emotions: joy, trust, anticipation, surprise, sadness, disgust, anger, fear, frustration, confusion, neutral, plus XM extensions). Strings not in the map default to "neutral". | Shows the emotional profile of a topic. A topic with `{"frustration": 0.6, "anger": 0.3}` is a retention risk. A topic with `{"joy": 0.7, "trust": 0.2}` is a marketing message. | Canonical emotion set is derived from Plutchik's 8-wheel with 2 XM-specific additions (frustration, confusion) that appear frequently in CX verbatims but don't have natural Plutchik mappings. |
| **dominant_emotion** | `counts.most_common(1)[0][0]` | The single most-expressed emotion for this topic. | Can be misleading when distribution is nearly uniform. |
| **urgency_score** | `sum(count for e in HIGH_URGENCY_EMOTIONS) / n * 100`. HIGH_URGENCY_EMOTIONS = {anger, fear, frustration, disgust, sadness}. Range [0, 100]. | Percentage of topic mentions expressing high-intensity negative emotion. Values above 30 warrant immediate review; above 50 indicate a systemic crisis signal. | Urgency score treats all high-intensity emotions equally. An angry topic and a fearful topic may require very different response strategies. Crystal surfaces the dominant_emotion alongside urgency_score to prevent misinterpretation. |

#### Effort Signal

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **avg_effort_score** | Computed by `compute_effort_score()` in `agents/tools/metrics.py`. A heuristic proxy using linguistic features: sentence length, use of effort-indicating words ("difficult", "hard", "took forever", "had to", "waited"), use of process words ("steps", "required", "needed to"). Effective range [1.5, 7.0] — 4.0 is neutral baseline. Higher = more effort. | Effort is the strongest predictor of disloyalty in transactional surveys (Gartner/CEB). A topic with avg_effort_score above 5.5 is a strong candidate for process redesign. | This is a heuristic, not the validated CES scale. It is computed from open-text content, not from a dedicated CES question. Treat as a directional signal only. |

#### NPS Alignment Signals

These are the most analytically rich signals in the catalog. They connect topic mentions to respondent-level NPS scores, enabling true driver analysis.

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **avg_nps_response** | `mean(nps_score for r in mentioner_responses)`. Raw 0-10 mean of NPS responses from topic mentioners. | "How did people who mentioned this topic rate the survey?" Comparable across topics on a 0-10 scale. | This is a raw mean of 0-10 NPS responses, NOT an NPS Score. Do not confuse with topic_nps_score. |
| **topic_nps_score** | `(promoter_count - detractor_count) / n_mentioners * 100`. Same formula as survey-level NPS Score but applied only to respondents who mentioned this topic. Range [-100, 100]. | Directly comparable to the survey-level NPS Score. If topic_nps_score is -30 and survey NPS is +20, this topic is a significant pain driver. | Requires NPS question in the survey. The mentioner subset can be small — treat as unreliable when n < 10 (confidence_level = 'low'). |
| **nps_impact** | `topic_nps_score - survey_nps_score` if survey_nps_score is known; otherwise `topic_nps_score - non_mentioner_nps_score`. Both operands are on the [-100, 100] NPS Score scale — no unit mismatch. Positive = satisfaction driver; negative = pain driver. | The most useful single signal for prioritization. A topic with nps_impact of -25 is dragging overall NPS down by a structurally significant amount. | When the survey has fewer than 20 NPS responses, the survey_nps_score CI is wide and nps_impact has high variance. See Section 9 for significance gating rules. |
| **promoter_pct** | `count(nps >= 9 in mentioners) / n_mentioners * 100` | Fraction of topic mentions from NPS promoters. | |
| **detractor_pct** | `count(nps <= 6 in mentioners) / n_mentioners * 100` | Fraction of topic mentions from NPS detractors. | |
| **passive_pct** | `(n_mentioners - promoters - detractors) / n_mentioners * 100` | | |
| **driver_score** | Point-biserial correlation between "mentions this topic" (binary) and NPS response (continuous 0-10). Formula: `r_pb = (M1 - M0) / sigma_Y * sqrt(n1 * n0 / n^2)` where sigma_Y is the **population** standard deviation of all NPS responses (divides by n, not n-1). Population std is correct here because we treat the survey dataset as the full population of interest, not a sample. Only computed when total n >= 10. Clamped to [-1.0, 1.0]. Practical range is approximately [-0.5, 0.5] because `r_pb <= sqrt(p*(1-p))` where p = n1/n. | Positive driver_score: mentioning this topic predicts higher NPS (strength driver). Negative: predicts lower NPS (pain driver). The magnitude indicates strength: |r| < 0.1 is weak, 0.1–0.3 is moderate, > 0.3 is strong for XM data. | Point-biserial correlation does not imply causation. A topic correlated with low NPS may be a symptom of the real cause. Use in combination with verbatims and the prescriptive layer for root cause analysis. |

#### CSAT Alignment Signals

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **avg_csat** | `mean(csat_score for r in mentioner_responses)`. Raw scale (as defined in survey). | Average CSAT of people who mentioned this topic. | Scale-dependent. Do not compare avg_csat across surveys with different CSAT scales. |
| **csat_impact** | `avg_csat_topic - avg_csat_survey`. Same-unit difference. Positive = topic mentioners are more satisfied. | | |

#### Representative Verbatims

| Signal | Method | Interpretation | Limitations |
|--------|--------|----------------|-------------|
| **top_verbatims** | Up to 3 curated quotes selected by `select_top_verbatims()`. Candidates must pass `is_meaningful_text()`. Selection: (1) most negative — lowest score below -0.2, (2) most positive — highest score above 0.2, (3) most representative — closest to the median score of all candidates. Each from a distinct response_id to prevent a single prolific respondent from dominating. Truncated to 400 characters. | The "tell the story" signal. Humans trust concrete quotes more than aggregate statistics. Crystal surfaces these to ground analytical claims in actual respondent language. | Selection algorithm is deterministic (not LLM-generated). The "representative" verbatim is the median-score text, which may not be the most eloquent. Future work: LLM-assisted selection. |

### 2.3 Rating-Only and No-Text Surveys

Not all surveys contain open-text questions. A survey with only NPS, CSAT, rating sliders, and multiple-choice questions produces no open texts — making ABSA, topic clustering, and theme narration impossible.

**Pipeline behavior when `has_open_text = False`:**

| Node | Behavior |
|---|---|
| `node_ingest` | Loads responses, extracts metric signals only. Sets `has_open_text = False` in state. |
| `node_absa` | **Skipped.** Returns empty `absa_results`. |
| `node_embed` | **Skipped.** Returns empty `embeddings`. |
| `node_cluster` | **Skipped.** Returns empty `clusters`. |
| `node_topics` | **Skipped.** Returns empty `topics`. No `survey_topics` rows written. |
| `node_metrics` | Runs fully. NPS, CSAT, CES, response velocity, completion rate all computed if present. |
| `node_narrate` | Runs in **score-only mode** — uses a different prompt that generates insights from metric distributions, not themes. |
| `node_verify` | Runs normally. Verifies metric accuracy only (no topic claims to verify). |
| `node_publish` | Runs normally. Publishes metric insights. |

**Score-only insights — what the LLM can still generate from metrics:**
1. **Distribution insight**: "73% of respondents rated checkout 2-3 out of 5, concentrated in the lower half of the scale — a consistent friction signal."
2. **Score segmentation**: If the survey has multiple rating questions, the LLM can find correlations — e.g., respondents who scored checkout low also scored support low.
3. **NPS distribution shape**: Bimodal distribution (many 9-10 AND many 0-3) vs. unimodal — a bimodal NPS reveals a polarized experience worth investigating.
4. **Velocity-correlated patterns**: If response rate dropped 40% over the last 7 days, the LLM can note this as a potential engagement signal.
5. **Delta analysis**: When prior checkpoints exist, the LLM can note that NPS improved 8 points or that average rating on a specific question declined.

**What Crystal can answer for no-text surveys:**
- "What's my NPS?" ✓
- "Is satisfaction improving?" ✓ (if multiple checkpoints)
- "What are people saying?" ✗ → "This survey doesn't collect written feedback, so I can't show you specific comments. I can tell you what the scores suggest."
- "What topics keep coming up?" ✗ → Crystal redirects to score patterns

**Crystal system prompt adjustment:** When `has_open_text = False`, Crystal's context includes: `"This survey has no open-text questions. Answer questions about scores, distributions, and trends only. Do not discuss themes, topics, or verbatims — they do not exist for this survey."`

**Applied Science principle:** No fabrication. If the data to support a claim doesn't exist, Crystal does not invent it. A no-text survey cannot produce theme insights, and Crystal will never imply it can.

### 2.4 Trend Signals

Trend signals are computed from `topic_windows` (weekly snapshots) and `survey_metric_snapshots` (per-run snapshots). They require at least 2 data points and become reliable at 4+.

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **WoW volume delta** | `(current_week_count - prior_week_count) / max(1, prior_week_count) * 100`. Stored as `velocity_pct` on `topic_windows`. | Positive = topic growing; negative = topic fading. > +25% is labeled "growing"; < -30% is labeled "fading" by `_compute_health_label()`. | Week-over-week is noisy for small volumes. A topic going from 2 mentions to 3 is +50% but not meaningful. Combined with confidence_level gating. |
| **WoW sentiment delta** | `current_avg_sentiment_score - prior_avg_sentiment_score`. If delta < -0.15, health_label is set to "worsening". | A -0.15 shift represents a material sentiment regression. | Health labels are lagging by one week. An emergency issue this week won't show as "worsening" until the next window computation. Real-time urgency detection (Section 4.3) fills this gap. |
| **MoM delta** | Derived from `survey_metric_snapshots` by comparing snapshots 30 days apart. Not yet surfaced as a standalone column — computed on-the-fly in the predictive projection layer. | Month-over-month is more stable than WoW for noisy surveys. | Requires at least 5 weeks of data. |
| **Trajectory (linear slope)** | OLS regression slope on the last 8 metric snapshots. Described in detail in Section 6. | Positive slope = improving; negative = declining. Magnitude is in units per pipeline run (approximately per week for active surveys). | OLS is sensitive to outliers. A single anomalous data point can reverse the apparent trajectory. |
| **health_label** | Categorical: `emerging`, `growing`, `worsening`, `fading`, `stable`. Set by `_compute_health_label()` in `agents/lib/topic_registry.py`. | Human-readable topic health status. Used for topic-level sparklines and alerts. | Discrete buckets lose nuance. A topic oscillating between -15% and +15% WoW volume will always be labeled "stable". |
| **anomaly_flag** | Boolean stored on `survey_metric_snapshots`. Set by anomaly detection pipeline (Section 4). | True = at least one anomaly class detected for this survey in this snapshot period. | Currently a single boolean — does not distinguish volume anomaly from score anomaly. |

### 2.5 Org-Level Signals

These are computed in `agents/scheduler.py` and written to `org_metric_snapshots` during each scheduler tick.

| Signal | Formula | Interpretation | Limitations |
|--------|---------|----------------|-------------|
| **Portfolio health** | `COUNT(*) FILTER (WHERE status = 'active') / total_surveys` as active fraction, plus weighted avg NPS across all active surveys. | An org with many active surveys but declining average NPS is experiencing a portfolio-wide experience degradation. | Weighting by response volume vs. equal weighting produces very different results. Current implementation uses `AVG(nps_score)` which weights by response count. |
| **Cross-survey theme frequency** | Topics sharing the same `theme` label across surveys. Not yet a first-class signal — computed by joining `survey_topics` on `theme` column. | A theme appearing in 3+ surveys simultaneously indicates an org-wide systemic issue, not a survey-specific one. | Theme labels are set by the LLM topic naming step and may not be consistent across surveys without explicit normalization. |
| **Biggest mover** | `top_urgent_topic` and `top_driver_topic` stored in `org_metric_snapshots`. Currently identified by highest urgency_score and most negative nps_impact respectively. | The most urgent topic in the portfolio and the strongest NPS driver. | Single-signal selection may miss compound issues (e.g., two topics jointly causing NPS decline). |

---

## 3. Checkpoint Delta Analysis

### 3.1 What a Checkpoint Captures vs. a Pipeline Run

The insight refresh system uses a two-tier model. The tiers differ in cost, latency, and what they produce.

**Tier 1 — Metric Snapshot (no LLM, no narration):** Triggered every ~50 new responses. Writes current NPS/CSAT/velocity to `survey_metric_snapshots`. Costs nothing in LLM terms. Keeps trending data fresh and enables real-time anomaly detection. Runs in under 1 second. A Tier 1 snapshot captures:
- All survey-level metric values (NPS score, CI, CSAT, CES, response count, completion rate)
- The `anomaly_flag` boolean (computed from Z-score and CI non-overlap checks)
- Timestamp and trigger reason

**Tier 2 — Full Checkpoint Report (complete LLM pipeline + delta analysis):** Triggered every 200 new responses OR when Tier 1 detects an anomaly. Full LangGraph DAG run: ABSA + clustering + topics + specialist narration + verification + delta analysis vs. previous checkpoint. Costs approximately $0.02-0.08 per run. Takes 30-90 seconds. A Tier 2 checkpoint produces:
- All per-topic signals (the full dict from `compute_full_topic_signals()`)
- A structural fingerprint of the topic set (hash of sorted topic names + their confidence levels)
- A complete set of narrated insights (Descriptive → Diagnostic → Predictive → Prescriptive)
- Delta analysis comparing signals to the previous Tier 2 checkpoint
- Data provenance fields (see Section 3.6)

The 200-response threshold for Tier 2 is chosen for specific statistical reasons:
- At n=200, Wilson CI for NPS narrows to approximately ±7 points, making delta detection meaningful
- Topic clusters are stable by 200 responses (ABSA confidence is high, cluster membership is settled)
- 200 is the lower bound of the "Robust" reporting tier (n=150-500) defined in document 07
- Below 200, delta analysis produces false alarms more often than real signal

The two-tier system does not currently exist as a deployed subsystem — it is the primary target of Phase 2 engineering work (see Section 13 (Research Roadmap) and the companion architecture document `05_TECHNICAL_ARCHITECTURE.md`). This section describes the intended design.

### 3.2 Trigger Conditions

Each tier has its own trigger conditions:

| Tier | Condition | Threshold | Rationale |
|------|-----------|-----------|-----------|
| 1 (Metric Snapshot) | New response count | 50 new responses since last snapshot | Keeps trending data fresh without LLM cost |
| 1 (Metric Snapshot) | Time elapsed | 6 hours since last snapshot | Guarantees regular snapshots even on slow surveys |
| 2 (Full Checkpoint) | New response count | **200 new responses since last checkpoint** | Statistically sufficient for meaningful delta analysis (NPS CI ±7 at n=200) |
| 2 (Full Checkpoint) | Time elapsed | 7 days since last full checkpoint | Weekly minimum for active surveys |
| 2 (Full Checkpoint) | Anomaly detected | Tier 1 triggers anomaly_flag | Immediate investigation when something unusual detected |
| 2 (Full Checkpoint) | Manual trigger | User clicks "Refresh Insights" | Explicit intent, no threshold |

These conditions are checked in the streaming consumer (`agents/consumers/response_stream.py`). Tier 1 is handled by the streaming consumer directly — no agents service call needed, just a pure SQL aggregate write. Tier 2 triggers the full LangGraph pipeline via the agents service. The distinction is enforced in `response_stream.py` by checking `new_response_count % 50 == 0` for Tier 1 and `new_response_count >= 200` (or `anomaly_flag`) for Tier 2.

### 3.3 Topic Fingerprinting

The topic fingerprint is a hash-based structural change detector. It answers: "Has the set of topics for this survey changed since the last checkpoint?"

```
fingerprint = sha256(
    sorted(
        f"{topic.name}:{topic.confidence_level}"
        for topic in active_topics
    ).join("\n")
)
```

If the fingerprint changes between checkpoints, it means either:
- A new topic has emerged (new text cluster broke above the ASSIGNMENT_THRESHOLD of 0.72 cosine similarity)
- An existing topic has disappeared (dropped below the minimum response count)
- A topic's confidence level changed (e.g., from 'low' to 'medium' — it gained enough volume to be trustworthy)

Fingerprint mismatches trigger the structural anomaly detection path (Section 4.3) and are logged with the specific changes enumerated.

### 3.4 Delta Computation

When checkpoint N is compared to checkpoint N-1, the delta service computes:

**Score delta with confidence intervals:**  
For NPS: `delta_score = nps_N - nps_N-1`. Significant if Wilson CIs do not overlap (see Section 9). For CSAT: `delta_score = csat_N - csat_N-1`. Significant if t-test p < 0.05 with Bonferroni correction for the number of signals being tested (typically 3: NPS, CSAT, CES).

**Topic emergence:**  
New topics in checkpoint N not present in N-1. Classified as `emerging` and promoted to the Crystal response as "new feedback theme."

**Topic disappearance:**  
Topics in N-1 with response_count > 0 but absent or zero-count in N. Classified as `resolved` if they were negative topics (potentially a win) or `faded` if neutral/positive.

**Sentiment reversal detection:**  
A topic with `avg_sentiment_score` that crosses from positive (> 0.1) to negative (< -0.1) or vice versa since the last checkpoint. This is a qualitative change, not just a quantitative one — it means respondents fundamentally changed how they feel about this topic. Sentiment reversals on high-volume topics trigger an `anomaly_flag` on the checkpoint.

### 3.5 Statistical Significance Gating

The delta system only reports a change as an "insight" if it clears statistical significance thresholds (see Section 9 for the full policy). The principle: do not produce a "Your NPS improved!" notification for a 3-point delta when the CI is ±15. This is the most common way XM platforms erode user trust — reporting noise as signal. Crystal's policy is: **if we cannot say with 95% confidence that the change is real, we report the trend direction with uncertainty language ("NPS appears to be improving, though the sample size limits confidence"), not as a definitive finding.**

### 3.6 Data Provenance and Citations

Every full checkpoint report (Tier 2) must record exactly what data was used to produce it. This is not optional — it is the foundation of the "provable" commitment in Section 1.

#### Checkpoint Provenance Fields

The `survey_insight_checkpoints` table stores:

| Field | Type | Content |
|-------|------|---------|
| `response_ids` | UUID[] | Exact IDs of all responses included in this run |
| `new_response_ids` | UUID[] | Response IDs new since the previous checkpoint |
| `responses_from` | TIMESTAMPTZ | Earliest `submitted_at` among included responses |
| `responses_to` | TIMESTAMPTZ | Latest `submitted_at` among included responses |
| `previous_checkpoint_id` | UUID | FK to the prior checkpoint (for delta queries) |
| `previous_response_count` | INT | Response count at previous checkpoint |
| `response_count` | INT | Total responses in this checkpoint run |

Reproducibility guarantee: Any analyst can reproduce the exact signal values for checkpoint N by querying `SELECT * FROM responses WHERE id = ANY(checkpoint_N.response_ids)` and running the same pipeline formulas.

**Checkpoint report storage:** Metadata fields (NPS, CSAT, response counts, trend direction, provenance date ranges) are stored in the `survey_insight_checkpoints` DB table for fast delta computation. The full report payload (all insights with narrative, citations, topic snapshots, full delta results) is stored as a JSON blob in object storage, linked via `report_url` on the checkpoint row. This means delta math always uses DB queries — never object store fetches — keeping pipeline latency low.

#### Insight-Level Citations

Each insight record stores citations in `citations_json` — a JSON array of objects identifying the specific responses that support the insight claim:

```json
[
  {
    "response_id": "uuid-1234",
    "verbatim_excerpt": "The checkout process took forever and I gave up twice...",
    "sentiment": "negative",
    "nps_score": 3,
    "submitted_at": "2026-04-15T14:22:00Z"
  },
  ...
]
```

Up to 5 citations per insight. Selected by the narration LLM from the cluster's response set. The narration prompt instructs: "From the following responses in this cluster, select 3-5 that most directly support your insight headline. Include the response_id and a verbatim excerpt of ≤200 characters."

This selection is not deterministic — it is a judgment call by the LLM — but it is grounded (the cited response_ids must exist in the cluster's `response_ids` list, which is a deterministic set). The verification step (`node_verify`) confirms all cited response_ids exist in the provided cluster.

#### Why Citations Matter

Without citations:
- An insight saying "Checkout friction is the top driver of detractor sentiment" is an assertion.
- With citations: it is a claim grounded in 47 specific verbatims from respondents who scored NPS ≤ 6.

For the prescriptive layer (action recommendations), citations are especially important: the LLM must cite the diagnostic evidence that supports the recommendation. A recommendation without a supporting diagnostic citation is rejected by `node_verify`.

### 3.7 Multi-Checkpoint Delta Analysis (N vs N-1 vs N-2)

The standard delta analysis compares the current checkpoint (N) against the immediately prior checkpoint (N-1). To detect trends, acceleration, and pattern persistence, the pipeline additionally loads the checkpoint before that (N-2) and computes a three-point comparison.

**Why N-2 matters:**

| Analysis | What it tells you |
|----------|-------------------|
| N vs N-1 | Current period change |
| N-1 vs N-2 | Prior period change (trend baseline) |
| Derived: trend direction | Are we improving, declining, or reversing? |
| Derived: trend acceleration | Is the rate of change speeding up or slowing down? |
| Derived: persistence | Is this the second checkpoint showing the same shift? |

**Computed fields in delta analysis:**

```python
class CheckpointDelta(TypedDict):
    # Existing single-step delta (N vs N-1)
    nps_delta: float           # positive = improved
    topic_fingerprint_delta: dict  # emerged/disappeared/shifted topics
    
    # New: multi-checkpoint analysis
    prior_nps_delta: float | None      # N-1 vs N-2 delta (None if N-2 unavailable)
    trend_direction: str | None        # 'improving' | 'declining' | 'stable' | 'volatile'
    trend_persistence: str | None      # 'confirmed' | 'reversal' | 'first_occurrence'
    nps_acceleration: float | None     # nps_delta - prior_nps_delta (positive = accelerating improvement)
    topic_persistence: list[str]       # topic IDs present in both N-1 and N-2 (confirmed, not noise)
```

**Trend direction rules:**

| nps_delta (N vs N-1) | prior_nps_delta (N-1 vs N-2) | trend_direction | trend_persistence |
|---|---|---|---|
| Positive | Positive | `improving` | `confirmed` |
| Negative | Negative | `declining` | `confirmed` |
| Positive | Negative | `improving` | `reversal` |
| Negative | Positive | `declining` | `reversal` |
| Any | None (N-2 unavailable) | From N vs N-1 | `first_occurrence` |
| Near-zero (±2pts) | Any | `stable` | depends |

**Crystal language for multi-checkpoint trends:**

| trend_persistence | Crystal says |
|---|---|
| `confirmed` (improving) | "NPS has improved for two consecutive checkpoints — this is a sustained trend, not a one-off." |
| `confirmed` (declining) | "NPS has declined for two checkpoints in a row. This is a persistent pattern worth investigating." |
| `reversal` | "NPS improved this checkpoint after declining last time. It's worth watching whether this holds." |
| `first_occurrence` | "This is the first comparison available. We'll have trend data after the next checkpoint." |

**Anomaly credibility upgrade:** An anomaly detected at checkpoint N is classified as `high_confidence` if the N-2 baseline was normal and N-1 was also normal. If N-2 was already anomalous, classify as `ongoing_issue` rather than a new anomaly. This prevents repeated alerts for the same unresolved problem.

**Implementation note:** `node_evaluate_delta` in `agents/graphs/insights.py` fetches checkpoints N-1 and N-2 from `survey_insight_checkpoints` in a single query ordered by `created_at DESC LIMIT 2`. If fewer than 2 prior checkpoints exist, `prior_nps_delta` and derived fields are `None` and Crystal acknowledges the limitation.

---

## 4. Anomaly Detection Framework

Crystal implements three classes of anomaly detection, each operating on a different signal type and time scale.

### 4.1 Volume Anomalies

**Definition:** An unusual spike or drop in daily response submission rate.

**Method:** Z-score of the daily response count against a 30-day rolling mean.

```
z = (count_today - mean_30d) / std_30d
anomaly if |z| > 2.5
```

The threshold of 2.5 (rather than the conventional 2.0) is chosen deliberately to reduce false positives in low-volume surveys where a single day of 0 responses followed by a surge is common. At z > 2.5 we are confident the volume is outside normal operating range for that survey.

**Implementation location:** Currently embedded in `compute_response_trend_analysis()` in `agents/tools/metrics.py`. The pipeline writes `anomaly_flag=True` to `survey_metric_snapshots` when triggered.

**Interpretation:**
- Volume spike (z > +2.5): Survey may have been shared in a new channel or promoted. Signals are temporarily less trustworthy because the new cohort may not represent the baseline population.
- Volume drop (z < -2.5): Survey may have lost its distribution channel. Signals are less reliable. May indicate a technical issue (broken survey link).

**Limitation:** The 30-day rolling mean requires 30 days of data. In the first month of a survey's life, the baseline is estimated from available data. False positive rate is higher during this window.

### 4.2 Score Anomalies

**Definition:** A statistically significant shift in NPS, CSAT, or CES between consecutive checkpoints.

**Method:** Wilson CI non-overlap test. Two consecutive NPS measurements are anomalous when their 95% confidence intervals do not overlap:

```
anomaly if ci_low_N > ci_high_N-1   # NPS jumped up
       or ci_high_N < ci_low_N-1    # NPS dropped down
```

This is more conservative than a simple delta threshold because it accounts for sample size: a 5-point drop with n=200 is anomalous (tight CIs); the same 5-point drop with n=15 is not (wide CIs).

**Score anomaly severity levels:**
- **Warning:** CI non-overlap on one metric only (NPS, CSAT, or CES)
- **Alert:** CI non-overlap on two or more metrics simultaneously
- **Critical:** NPS drops below 0 (net-detractor territory) or CSAT drops below 3.0/5.0

**Limitation:** The Wilson CI test is designed for proportion data (NPS). CSAT is continuous; the CI comparison is a proxy test. Phase 2 will replace the CSAT and CES anomaly detection with proper t-test based monitoring.

### 4.3 Structural Anomalies

**Definition:** The topic fingerprint hash changes between consecutive checkpoints.

**Method:** Compare `sha256(sorted topic fingerprint)` from checkpoint N to checkpoint N-1. If hashes differ, enumerate the changes:

```python
emerged = set(topics_N) - set(topics_N1)
disappeared = set(topics_N1) - set(topics_N)
confidence_changed = {t for t in topics_N & topics_N1 if confidence_N[t] != confidence_N1[t]}
```

**Interpretation:**
- Topic emergence: A new concern is appearing in respondent feedback. Could be a product change, external event, or new customer segment.
- Topic disappearance: Either a prior issue is resolved (positive signal if it was a pain topic) or it was a spurious cluster that didn't sustain across more data.
- Confidence escalation (low → medium → high): A previously niche concern is becoming mainstream.

**Limitation:** The fingerprint is sensitive to the topic clustering threshold (ASSIGNMENT_THRESHOLD = 0.72 cosine similarity in `agents/lib/topic_registry.py`). Adjusting this threshold changes which topics get created and destroyed. The fingerprint does not distinguish between "threshold-sensitivity churn" and "genuine topic emergence."

### 4.4 Urgency Language Detection (Real-Time Path)

**Definition:** Individual response contains language signaling immediate distress or urgent negative experience.

**Method:** Two-stage filter applied in the streaming consumer path (not yet implemented in production; target of Phase 2):

Stage 1 — Pattern matching (synchronous, zero LLM cost):
```python
URGENCY_PATTERNS = [
    r'\b(cancel|refund|lawsuit|fraud|scam|horrible|terrible|disgusting)\b',
    r'\b(never again|will not return|lost.{0,15}customer)\b',
    r'\b(immediately|urgent|emergency|asap)\b',
]
```

Stage 2 — Sentiment confirmation (LLM ABSA):
If stage 1 matches AND `score < -0.5` from ABSA, the response is flagged as urgent.

**Integration:** Urgent responses bypass the standard batch accumulation threshold. A single response crossing both stages triggers an immediate notification (via webhook or email, TBD) and forces a checkpoint computation.

**Limitation:** Stage 1 pattern matching has a non-trivial false positive rate for sarcastic or comparative language ("This is NOT a scam, unlike..."). Stage 2 ABSA significantly reduces false positives but adds latency. The trade-off is acceptable because the cost of missing a genuine churn signal outweighs the cost of a false positive alert.

---

## 5. Industry Benchmark Design

### 5.1 V1 Static Benchmarks

V1 benchmarks are derived from published industry research: Bain & Company NPS Benchmarks (2023-2025), Qualtrics XM Benchmark Reports, Medallia Experience Intelligence Reports, Zendesk Customer Experience Trends, and ACSI (American Customer Satisfaction Index) for CSAT comparisons.

These are point estimates for the "good" and "excellent" thresholds in each vertical. Crystal uses them as reference points, not pass/fail gates.

**NPS Industry Benchmarks:**

| Vertical | Poor | Average | Good | Excellent | Source |
|----------|------|---------|------|-----------|--------|
| SaaS / Technology | < 10 | 10-35 | 36-50 | > 50 | Bain 2024, Qualtrics |
| Healthcare | < 20 | 20-40 | 41-60 | > 60 | HCAHPS + Qualtrics |
| Retail (e-commerce) | < 25 | 25-45 | 46-65 | > 65 | Medallia 2024 |
| Financial Services | < 15 | 15-35 | 36-55 | > 55 | Bain 2024 |
| Education | < 30 | 30-50 | 51-65 | > 65 | Internal + EDUCAUSE |
| Government | < 10 | 10-25 | 26-40 | > 40 | ACSI 2024 |
| Professional Services | < 20 | 20-40 | 41-60 | > 60 | Bain 2024 |

**CSAT Industry Benchmarks (1-5 scale, top-2-box equivalent):**

| Vertical | Poor | Average | Good | Excellent |
|----------|------|---------|------|-----------|
| SaaS / Technology | < 3.5 | 3.5-4.0 | 4.0-4.3 | > 4.3 |
| Healthcare | < 3.8 | 3.8-4.2 | 4.2-4.5 | > 4.5 |
| Retail | < 3.6 | 3.6-4.1 | 4.1-4.4 | > 4.4 |
| Financial Services | < 3.5 | 3.5-4.0 | 4.0-4.3 | > 4.3 |
| Education | < 3.7 | 3.7-4.1 | 4.1-4.4 | > 4.4 |

**CES Industry Benchmarks (1-7 scale, lower = less effort = better):**

| Vertical | High Effort | Acceptable | Low Effort | Excellent |
|----------|-------------|------------|------------|-----------|
| SaaS / Technology | > 5.5 | 4.5-5.5 | 3.5-4.5 | < 3.5 |
| Healthcare | > 5.0 | 4.0-5.0 | 3.0-4.0 | < 3.0 |
| Retail | > 5.5 | 4.5-5.5 | 3.5-4.5 | < 3.5 |

### 5.2 Percentile Ranking

Given a survey's NPS score and its org's configured `industry` field, Crystal computes a percentile rank:

```python
def percentile_rank(score: float, vertical: str, metric: str) -> int:
    # Map score to percentile using the benchmark distribution
    # approximated as a normal distribution between Poor and Excellent bounds.
    # Returns integer percentile 0-100.
```

The `industry` field is stored in `org_profiles` and is set during org onboarding. The `sub_vertical` field enables finer-grained benchmarking (e.g., "SaaS / DevTools" vs. "SaaS / HR Tech") when we have enough data.

The `NpsExpertOutput.benchmark_context` field (in `agents/agents/insight_experts.py`) is where Crystal populates the benchmark narrative: "Your NPS of 47 is in the top quartile for SaaS companies and significantly above the 35-point industry median."

### 5.3 Peer Benchmarks (V2+)

Static benchmarks become stale and imprecise as the market evolves. The long-term benchmark strategy is **peer benchmarking**: anonymous aggregate comparisons across Experient customers in the same vertical and size band.

**Design:**
- Aggregation unit: `(industry, sub_vertical, company_size_band, survey_use_case)` — minimum 10 orgs in the cohort before surfacing
- Privacy: Org-level metrics are aggregated into median/p25/p75 bands. No individual org's data is identifiable.
- Refresh: Weekly, computed by a background job reading `org_metric_snapshots`
- Storage: `benchmark_cohorts` table (planned): `(cohort_key, metric, p25, p50, p75, n_orgs, computed_at)`

The peer benchmark system requires enough customer volume to be statistically meaningful. Our minimum viable cohort is 10 orgs with at least 50 responses each. We estimate reaching this threshold in vertical-specific cohorts at approximately 50 total Experient customers.

---

## 6. Predictive Projection

### 6.1 Method: OLS Regression on Metric Snapshots

Crystal generates 30-day forward projections for NPS and CSAT using Ordinary Least Squares (OLS) regression on the most recent 8 `survey_metric_snapshots` data points.

```python
from scipy.stats import linregress

def project_metric(snapshots: list[dict], metric: str, days_forward: int = 30) -> dict:
    """
    snapshots: last 8 rows from survey_metric_snapshots ordered by captured_at ASC
    Returns: {projected_value, ci_low, ci_high, slope, r_squared, confidence}
    """
    x = [i for i in range(len(snapshots))]  # ordinal time index
    y = [float(s[metric]) for s in snapshots if s[metric] is not None]
    
    if len(y) < 4:
        return {"projected_value": None, "confidence": "insufficient_data"}
    
    slope, intercept, r_value, p_value, std_err = linregress(x, y)
    
    # Project forward (each snapshot is approximately 1 pipeline run interval)
    x_future = len(snapshots) + (days_forward / avg_interval_days)
    projected = slope * x_future + intercept
    
    # Prediction interval at 95% using t-distribution
    n = len(y)
    x_mean = sum(x) / n
    se_pred = std_err * math.sqrt(1 + 1/n + (x_future - x_mean)**2 / sum((xi - x_mean)**2 for xi in x))
    t_critical = 2.0  # approximate for n < 10
    ci_low  = projected - t_critical * se_pred
    ci_high = projected + t_critical * se_pred
    
    return {
        "projected_value": round(projected, 1),
        "ci_low": round(ci_low, 1),
        "ci_high": round(ci_high, 1),
        "slope": round(slope, 3),
        "r_squared": round(r_value**2, 3),
        "confidence": "high" if r_value**2 > 0.7 else "medium" if r_value**2 > 0.4 else "low",
        "p_value": round(p_value, 4),
    }
```

### 6.2 Why OLS and Not ARIMA for V1

The decision to use OLS regression rather than ARIMA (AutoRegressive Integrated Moving Average) for V1 projections is driven by data sparsity and implementation complexity, not analytical preference.

**The data sparsity problem:** ARIMA models require a minimum of 30-50 data points to fit reliably. An active survey running the insights pipeline daily would accumulate 30 snapshots in a month — at the very edge of the minimum for ARIMA. Surveys running weekly (the most common cadence for smaller organizations) would take 6+ months to accumulate enough data. OLS can produce a meaningful projection with as few as 4 data points, though with correspondingly wide confidence intervals.

**The interpretability problem:** The coefficients of an OLS model (slope and intercept) are immediately interpretable. "Your NPS is improving at approximately 2.3 points per week" is a statement every non-technical stakeholder can act on. ARIMA produces AR, I, and MA parameters that require explanation and do not map naturally to business language.

**The overfitting problem:** A 3-parameter ARIMA model fitted to 8 data points is likely to overfit, producing projections that are extremely confident but wrong. OLS with 2 parameters on 8 data points is simpler and the confidence intervals are more honest.

**Future migration to ARIMA:** When an org has 90+ days of data (approximately 90-365 snapshots depending on survey activity), ARIMA becomes tractable and is likely to outperform OLS on surveys with seasonal patterns. The migration plan is to automatically switch the projection model based on data availability, reporting the model type to the user.

### 6.3 Projection Limitations

- **Non-stationarity:** NPS and CSAT rarely follow a linear trend for extended periods. A product launch, a PR crisis, or a seasonal pattern can completely break a linear projection. The R-squared and confidence level fields communicate model quality, but users must understand these are extrapolations, not predictions.
- **Boundary effects:** NPS is bounded at [-100, 100]. A linear projection can exceed the boundary. The projection is clamped to the valid range in production.
- **Minimum data requirement:** We require at least 4 non-null data points. Below this, Crystal returns `"insufficient_data"` with an explanation rather than a low-confidence projection.
- **Confounding:** OLS does not account for external factors (marketing campaigns, product changes, seasonality). Crystal surfaces the projection alongside the explanation that it assumes current trajectory continues.

---

## 7. Crystal Eval Framework

Every response generated by `agents/agents/crystal.py` passes through a two-stage quality evaluation: a deterministic hallucination filter and an LLM evaluator (`evaluate_crystal_response()` in `agents/agents/insight_experts.py`). This section documents both stages and the metrics we track.

### 7.1 Deterministic Hallucination Filter

Before evaluation, the hallucination filter strips any cited insight IDs from the response that do not exist in the valid ID set loaded from the database:

```python
_, valid_ids = _build_insights_context(inp.insights)
cited_ids = list(set(output.citations + output.insight_refs))
hallucinated = [cid for cid in cited_ids if cid and cid not in valid_ids]
output.citations    = [c for c in output.citations    if c not in hallucinated]
output.insight_refs = [r for r in output.insight_refs if r not in hallucinated]
```

This runs synchronously, costs nothing, and is fully deterministic. It prevents Crystal from ever citing a made-up insight ID to the user, regardless of what the LLM produced.

**Hallucination rate metric:** `len(hallucinated) / len(cited_ids)` when `len(cited_ids) > 0`. Tracked per response in the `crystal_response` log event. Target: < 2% of responses have any hallucinated citation.

### 7.2 LLM Quality Evaluator

The `crystal_eval` agent (mapped to a fast model — `nvidia/nemotron-nano-9b-v2:free` in dev, `google/gemini-2.0-flash-001` in staging/prod) evaluates Crystal's response on five dimensions:

| Dimension | What it measures | Scoring |
|-----------|-----------------|---------|
| **Grounding score** | Are all claims backed by data in the provided insight context? | Boolean `is_grounded` — True if no claims are made without a cited ID or named topic. |
| **Relevance score** | Does the answer address what was asked? | `answers_question` boolean + `quality_score` contribution. |
| **Completeness score** | Are all relevant signals surfaced? | Implicit in `quality_score` (0-100). High-quality answers mention NPS/CSAT values, specific topic names, and trend direction. |
| **Specificity score** | Does Crystal cite numbers, not just directions? | Implicitly measured — the evaluator is prompted to penalize vague directional answers ("it's improving") that don't cite specific values. |
| **Hallucination detection** | Does Crystal cite IDs that appear to not exist? | `hallucinated_ids` list returned by evaluator (cross-checked against deterministic filter results). |

The evaluator output schema:

```python
class CrystalEvalOutput(BaseModel):
    quality_score: int           # 0-100
    is_grounded: bool
    answers_question: bool
    issues: list[str]            # specific identified problems
    hallucinated_ids: list[str]  # suspected hallucinations
    correction: str              # instruction for self-correction attempt
```

A response **passes** if `quality_score >= 72 AND is_grounded AND answers_question`. This threshold of 72 was chosen empirically: responses scoring below 72 were consistently evaluated as "unhelpful" in internal testing, while responses above 72 were generally rated as useful even when imperfect.

### 7.3 Checkpoint Report Evaluation

The full checkpoint report (produced by the Tier 2 pipeline) is evaluated by a separate report evaluator agent before it is marked as `completed` in `agent_runs`. This is a post-generation step distinct from the per-insight verifier (`node_verify`).

The report evaluator checks:

| Check | Method | Threshold |
|-------|--------|-----------|
| **Statistical accuracy** | Compare NPS/CSAT claims in narrative text against computed values in `survey_metric_snapshots` | Claims must match within ±2 points |
| **Citation validity** | Verify all `cited_response_ids` in `citations_json` exist in `checkpoint.response_ids` | Zero invalid citations permitted |
| **Delta accuracy** | Confirm delta claims ("NPS improved 8 points") match `nps_N - nps_N-1` from checkpoints table | Delta must match ±1 point |
| **Internal consistency** | No contradictions between layers (a Prescriptive action should address a cited Diagnostic finding) | LLM judge: 1-5 scale, reject if < 3 |
| **Benchmark accuracy** | Any benchmark comparisons cite the correct vertical (org.industry → benchmark table) | Deterministic lookup, must match |

The evaluator returns a `report_quality_score` (0-100) that is stored on the `agent_runs` row. Scores < 60 trigger automatic re-narration of the failing sections. Scores < 40 fail the run and the report is not published.

### 7.4 Specialist Domain Accuracy

When a specialist is matched for the survey (see Section 11 below), the evaluator also checks domain-specific accuracy:

- **SaaS specialist**: Confirms that churn-risk language is calibrated to SaaS retention patterns, not retail patterns
- **Healthcare specialist**: Confirms HIPAA-appropriate language (no patient identifiers in citations, no clinical diagnostic claims)
- **Retail specialist**: Confirms that effort/friction signals are prioritized in the prescriptive layer

### 7.5 Self-Correction Loop

If a response fails evaluation, Crystal retries with a `correction` block prepended to the system prompt, containing the specific issues identified by the evaluator and a prohibition on the hallucinated IDs. Up to 2 retries are attempted (3 total attempts). The best-scoring response across all attempts is returned.

```python
for attempt in range(3):
    output = await _generate_response(inp, correction=correction)
    eval_result = await evaluate_crystal_response(...)
    if score > best_score:
        best_score = score
        best_output = output
    if passes:
        break
    correction = f"Previous answer had issues: {issue_list}. {eval_result.correction}"
```

This approach is more reliable than prompt engineering alone: it adapts the correction instruction to the specific failure mode of each attempt rather than using a fixed retry prompt.

### 7.6 Automated Eval Pipeline

The eval framework as described runs inline with every Crystal request. We additionally plan to run a batch evaluation pipeline offline:

1. **Sampling:** Collect 100 Crystal (question, context, answer) triples per week from production logs (consent assumed via ToS; no PII stored in eval set).
2. **Human annotation:** 10% of sampled triples are reviewed by the team for ground truth quality scores.
3. **Model-human correlation:** Track Pearson r between `crystal_eval` quality_score and human annotations. Target: r > 0.75.
4. **Regression tracking:** When the Crystal model changes (e.g., different model routing), run the full batch against the historical sample set to detect quality regressions before they reach users.
5. **Score drift detection:** Monitor weekly average quality_score. Alert if weekly mean drops by more than 5 points vs. 4-week rolling average.

---

## 8. Promoter/Detractor Language Separation

Standard topic analysis pools all verbatims together before clustering. This produces a mixed signal: a topic like "Onboarding" might appear with moderate negative sentiment, but the underlying story is that detractors are writing about a confusing initial setup while promoters are writing about how the onboarding team went above and beyond. These are two different business problems requiring two different responses.

Crystal's Promoter/Detractor Language Separation methodology addresses this by analyzing verbatims separately within each NPS bucket before clustering.

### 8.1 Methodology

**Step 1 — Bucket assignment:**  
For every open-text response with a corresponding NPS score, assign to one of three buckets: promoter (NPS 9-10), passive (NPS 7-8), detractor (NPS 0-6). Responses without NPS scores are analyzed in the "all responses" pool only.

**Step 2 — Independent ABSA within buckets:**  
Run ABSA on promoter verbatims and detractor verbatims separately. This ensures that a positive statement ("Great onboarding team!") in a promoter response is never averaged with a negative statement ("Confusing onboarding portal") in a detractor response. The ABSA signal is therefore pure within each bucket.

**Step 3 — Separate clustering:**  
Cluster promoter texts independently from detractor texts using the same cosine similarity clustering algorithm in `agents/tools/clustering.py`. This produces promoter-specific topic clusters and detractor-specific topic clusters.

**Step 4 — Topic comparison:**  
Compare topic names and sentiment distributions across buckets. Topics that appear in both buckets with opposite sentiment represent bifurcated experiences — a point of leverage where fixing the detractor experience might create new promoters. Topics that appear only in promoter clusters are candidate marketing messages. Topics that appear only in detractor clusters are pure pain signals.

**Step 5 — Narration:**  
The `TopicExpertOutput` schema has a `business_impact` field. When bucket separation is active, this field articulates the different stories for promoters vs. detractors. Example: "Promoters describe the onboarding team as responsive and proactive [n=47, net_sentiment=+82]. Detractors describe the onboarding portal as confusing and error-prone [n=31, net_sentiment=-61]. These are distinct systems — fixing the portal may not affect team perception but would address the primary detractor complaint."

### 8.2 Current Implementation Status

The conceptual methodology is described above but is not yet implemented as a fully separate pipeline path. The current `compute_nps_alignment()` function in `agents/lib/topic_signals.py` computes `promoter_pct`, `detractor_pct`, and `passive_pct` per topic, and separately computes `nps_impact`. These signals are sufficient for V1 driver analysis.

The full promoter/detractor verbatim separation pipeline is targeted for Phase 3 (see Section 13).

---

## 9. Statistical Significance Policy

Crystal follows a strict significance policy before reporting any directional claim. The policy is designed to prevent one of the most common XM analytics failures: reporting noise as insight.

### 9.1 Core Principle

**If the data cannot support a directional claim with 95% confidence, Crystal must either: (a) not report the claim at all, or (b) report it with explicit uncertainty language that communicates the limitation.**

The threshold of 95% confidence (α = 0.05) is the standard in academic research. Some commercial analytics platforms use 90% (α = 0.10) to increase the volume of "significant" findings. We use 95% because our users are making resource allocation decisions based on these insights — a false positive ("Your NPS improved!") wastes leadership attention and can prevent the identification of the real problem.

### 9.2 NPS Significance Policy

**Metric:** NPS Score. Range [-100, 100].

**Method:** Wilson CI non-overlap.

**Threshold rules:**
- Do not report any NPS delta as significant if the 95% Wilson CIs of the two periods overlap.
- Do not report an NPS score at all if n < 10 (return `below_minimum: True`).
- Report NPS as `preliminary` (not `confirmed`) when 10 <= n < 30.
- Report NPS as `reliable` when n >= 30.
- Report NPS as `high-confidence` when n >= 100.

The `compute_nps_ci()` function in `agents/tools/metrics.py` returns `below_minimum: True` when n < 10 and does not compute a score. Crystal will not surface an NPS insight when `below_minimum` is True.

**For topic NPS (driver analysis):** Apply the same rules, but the relevant n is `n_mentioners` (respondents who mentioned the topic), not the total survey response count.

### 9.3 CSAT Significance Policy

**Metric:** CSAT mean. Continuous scale (typically 1-5).

**Method:** Welch's t-test (does not assume equal variance) for comparing two periods.

```python
from scipy.stats import ttest_ind
t_stat, p_value = ttest_ind(period_A_scores, period_B_scores, equal_var=False)
significant = p_value < 0.05
```

**Threshold rules:**
- Report a CSAT delta as significant only if Welch's t-test p < 0.05.
- Minimum n per period: 10 (below this, the t-test is not reliable).
- Also require that the practical effect size (Cohen's d) >= 0.2 (small effect). A statistically significant but practically meaningless difference (e.g., 3.82 vs 3.85 with n=500) is not an insight.

### 9.4 Proportion Significance Policy

**Metrics:** sentiment_positive_pct, sentiment_negative_pct, promoter_pct, detractor_pct.

**Method:** Fisher's exact test for 2x2 contingency tables (period A vs. period B, count of positive vs. not-positive).

```python
from scipy.stats import fisher_exact
odds_ratio, p_value = fisher_exact([[pos_A, n_A - pos_A], [pos_B, n_B - pos_B]])
significant = p_value < 0.05
```

**Threshold rules:**
- Minimum cell size of 5 for each quadrant of the contingency table.
- p < 0.05 required.
- For the weekly velocity_pct (WoW change), a stricter threshold of p < 0.01 is used because this signal is updated every week and the multiple comparisons problem inflates false positive rate over time.

### 9.5 The "Not Enough Data" Threshold by Signal Type

| Signal | Minimum n | Method when below threshold |
|--------|-----------|----------------------------|
| NPS Score | 10 per period | Return null; do not generate NPS insight |
| NPS Delta | 10 per period, CI non-overlap | Report trend direction with "preliminary" label |
| CSAT Score | 5 total | Return null |
| CSAT Delta | 10 per period, p < 0.05 | Report delta with uncertainty language |
| Topic volume (any signal) | 3 unique respondents | Mark confidence_level = 'low'; suppress claims |
| Driver score (point-biserial) | 10 total NPS responses | Return null (driver_score = None) |
| WoW velocity_pct | 2 weeks of data | Compute value; suppress significance claim |
| Anomaly Z-score | 30 days of daily counts | Use available mean; widen significance threshold to |Z| > 3.0 |

### 9.6 Crystal's Language Policy

When data is below threshold, Crystal must use uncertainty language. The `insight_narrate` agents are prompted with explicit language rules. Prohibited language when n < threshold:

- "Your NPS improved" → "Your NPS appears to be trending upward, though the sample size is still too small to confirm"
- "Billing is your top pain driver" → "Billing appears in several negative responses and warrants monitoring as volume grows"
- "Satisfaction increased 5 points" → "Satisfaction scores are slightly higher this period, though the difference is within the margin of error for this sample size"

The `CrystalEvalOutput.is_grounded` field explicitly checks for this: the evaluator is prompted to return `is_grounded = False` if the answer makes definitive directional claims without citing sample sizes or acknowledging uncertainty.

---

## 11. Specialist Context Design

### 11.1 The Specialist Matching Problem

A "checkout friction" topic in a SaaS survey means something very different from the same topic in a healthcare survey. The same NPS of 35 is "good" in financial services and "mediocre" in education. A generic narration prompt produces generic insights — insights that could have been generated by any XM platform.

The specialist system (implemented in `agents/specialists/registry.py`) solves this by matching each survey to a domain expert persona before narration begins. The matching uses industry + use_case + survey_type scoring.

### 11.2 Specialist Context Block

Every narration LLM call (in `node_narrate`) must include a specialist context block in the system prompt. This block is populated from the matched `BaseSpecialist` object:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYST ROLE: {specialist.display_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are a senior {specialist.display_name} analyst with expertise in {specialist.domain_description}.

SURVEY CONTEXT:
  Title: {survey.title}
  Type: {survey.survey_type}
  Use case: {survey.use_case}
  Target audience: {survey.audience}

ORG CONTEXT:
  Industry: {org.industry}
  Sub-vertical: {org.sub_vertical}
  Size: {org.size}

INDUSTRY BENCHMARKS (for {org.industry}):
  NPS: Poor < {benchmark.nps_poor}, Average {benchmark.nps_avg_low}-{benchmark.nps_avg_high}, 
       Good {benchmark.nps_good_low}-{benchmark.nps_good_high}, Excellent > {benchmark.nps_excellent}
  CSAT (1-5): Poor < {benchmark.csat_poor}, Good > {benchmark.csat_good}

SPECIALIST LENS:
{specialist.prompt_instructions}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The `prompt_instructions` field in the specialist YAML pack contains domain-specific narration guidance. Examples:

**SaaS/Technology specialist:**
> "Prioritize retention signals: topics correlated with detractors represent churn risk. Connect feature-request topics to NPS driver scores — feature gaps that correlate with low NPS are product roadmap inputs. Reference the industry NPS benchmark; a score above 35 is competitive for SaaS."

**Healthcare specialist:**
> "Lead with patient safety and dignity signals. Do not include patient names, medical record numbers, or specific diagnosis information in citations — use anonymized excerpts only. For HCAHPS-aligned surveys, reference the domain-specific benchmarks. Compliance language must be medically cautious, not alarming."

**Retail (e-commerce) specialist:**
> "Effort and friction are the primary retention predictors in e-commerce (Gartner CEB). When checkout, returns, or delivery topics appear with effort_score > 5.0, prioritize them in the prescriptive layer regardless of volume. Connect NPS driver scores to the specific friction point."

### 11.3 Multi-Specialist Surveys

When the registry matches multiple specialists (primary + overlays scoring >= 70), the system:
1. Uses the primary specialist for the system prompt persona
2. Appends overlay specialists' `prompt_instructions` as additional lenses
3. Caps at 3 specialists total to prevent context bloat

### 11.4 Specialist Matrix

| Specialist ID | Matched Industries | Matched Survey Types | Key Prioritization |
|---------------|-------------------|---------------------|-------------------|
| `saas_cx` | Technology, SaaS | CSAT, NPS | Retention, feature gaps, support quality |
| `healthcare_cx` | Healthcare | HCAHPS, Patient satisfaction | Safety, dignity, communication, HIPAA-safe |
| `retail_cx` | Retail, E-commerce | Post-purchase, Returns | Effort, delivery, checkout friction |
| `finserv_cx` | Financial Services | NPS, Trust surveys | Trust, transparency, resolution speed |
| `education_cx` | Education | Student satisfaction, Alumni | Academic support, outcomes, career prep |
| `employee_ex` | Any | eNPS, Engagement, Pulse | Burnout signals, manager relationships, growth |
| `research_generic` | Any | Any (fallback) | Balanced across all signal types |

---

## 12. Progressive Intelligence — Accuracy Tiers Below 200 Responses

### What Can Be Accurately Shown Below 200 Responses

The 200-response threshold is the trigger for the **Clear Picture** — a full LLM-narrated analysis with delta comparison, benchmark grounding, and all four insight layers. But surveys don't jump from 0 to 200 responses. Users arrive at the insights page at every stage.

This section defines three progressive intelligence tiers below 200 responses, plus the collecting state for the first 1–9 responses. Each tier shows the maximum accurate information for that data volume.

| Tier | Response range | Trigger at | ProgressArc |
|------|---------------|-----------|-------------|
| Collecting | 0–9 | — (no run) | ○ |
| First Voices | 10–39 | 10 responses | ◔ |
| Early Signals | 40–99 | 40 responses | ◑ |
| Growing Picture | 100–199 | 100 responses | ◕ |
| Clear Picture (Full Report) | 200+ | 200 responses | ● |

**Collecting state (0–9 responses):** No pipeline run. The UI shows a simple "Collecting responses" state. Crystal is not active. No verbatims, no metrics. This is not a sub-tier — it is the waiting state before the platform has enough signal to say anything meaningful.

---

### The Statistical Foundation

All accuracy decisions derive from two statistical properties:

**Wilson CI for NPS:** As n increases, the confidence interval narrows. The CI half-width at z=1.96 for NPS is approximately:

| n | NPS CI half-width (approximate) |
|---|---|
| 10 | ±31 pts |
| 30 | ±18 pts |
| 50 | ±14 pts |
| 100 | ±10 pts |
| 150 | ±8 pts |
| 200 | ±7 pts |
| 500 | ±4 pts |

A CI of ±31 means an NPS of 40 could plausibly be anywhere from 9 to 71 — the score is meaningless as a directional claim. A CI of ±7 means the score is reliable to within 7 points in either direction.

**Topic cluster stability:** Topic clusters require enough responses to distinguish genuine themes from noise. With fewer than 10 texts in a cluster, the cosine centroid shifts dramatically with each new response — topic names and sentiment directions are unreliable. With 10-30 texts, clusters are directionally stable. With 30+ texts, clusters are robust for production claims.

---

### Sub-Tier 1: "First Voices" (10–39 responses)

**Statistical status:** NPS CI at n=10 is ±31 points; at n=39 it is ±16 points — too wide for any numerical claim. But sentiment direction (positive/neutral/negative) is reliable: if 8 of 10 responses contain negative language, the survey is negative. At this range, we can name themes but cannot size them.

**What Crystal can accurately show:**
1. **Raw verbatim quotes** — exact, unmodified text from the first respondents. This is 100% accurate — the text is the data.
2. **Word/phrase frequency list** — top 5-8 words or short phrases appearing across the response texts. Computed by term frequency, no LLM. Pure fact.
3. **Sentiment direction bucket** — one of three: `mostly positive` / `mixed` / `mostly negative`. Based on ABSA across all texts. Always stated with the caveat 'based on early feedback.'
4. **2–3 emerging theme names** — LLM-discovered cluster names only. No volume, no NPS impact, no driver scores.

**What Crystal says (language tier 0):**
> "Your first responses are in. I'm seeing [sentiment direction] signals overall, with [theme name] coming up. Here are the responses so far."

**LLM operations in this tier:**
- ABSA on all responses (same as always — cached for later)
- Light topic discovery with n=10-39 input — results labeled confidence='low'
- NO narration LLM calls

**Data that feeds the full checkpoint later:**
- Every response in this tier gets ABSA-scored when the next triggered pipeline run occurs. They are not wasted — they become part of the Tier 2 report's cluster inputs. 10–39 responses of ABSA data are available at the next tier trigger.

---

### Sub-Tier 2: "Early Signals" (40–99 responses)

**Statistical status:** At n=40 the NPS CI is ±16 points; at n=99 it is ±10 points. The score is directionally meaningful as a zone (good/fair/challenging) but not as a specific number. Topic clusters at the lower end of this range have medium confidence; at 80-99 responses they are approaching high confidence.

**What Crystal can accurately show:**
1. **Sentiment direction bucket** — one of three: `mostly positive` / `mixed` / `mostly negative`. Computed from the distribution of ABSA scores across all texts. Report with the caveat: "Based on early feedback."
2. **3–5 emerging theme names** — LLM-discovered cluster names, but only names. No volume percentages, no NPS impact, no driver scores (all require larger n).
3. **Top 3 verbatims per theme** — one most-positive, one most-negative, one most representative. Same selection as the full pipeline.
4. **Dominant emotion(s)** — the top 2 canonical emotions across all ABSA items. Emotion detection is reliable even at n=10.
5. **NPS zone (not a number)** — one of three zones per industry vertical. Example: 'Your NPS is in the good range for SaaS.' No exact score.

**What Crystal says (language tier 0.5):**
> "Early feedback is building. I can see [sentiment direction] signals overall, with [theme name] as the clearest emerging theme. NPS is looking [good/fair/challenging] for your type of survey — I'll have a precise score once more responses arrive."

Language rules for this tier:
- Use "appears to", "early signs suggest", "respondents mention" — never "shows", "indicates", "X% say"
- NPS zone allowed with caveat; never state an NPS number
- Never use a percentage claim on any topic
- Themes are labeled "emerging" — not established

**LLM operations in this tier:**
- Full ABSA (cached from First Voices if already run)
- Full topic discovery with n=40-99 input — results labeled confidence='medium' for topics n≥15
- Light narration: run narrate_topic_insight for topics with n≥15 only, with data_tier='early_signals' flag
- NO full NPS/CSAT narration

**Crystal system prompt adjustment:** A `data_tier: 'early_signals'` flag is injected. Crystal reads: "You are working with early data (fewer than 30 responses). State only directional observations. Never cite a number. Use hedged language throughout."

**Estimated cost:** ~$0.002–0.006 per trigger

---

### Sub-Tier 3: "Growing Picture" (100–199 responses)

**Statistical status:** NPS CI is ±10 points at n=100, narrowing to ±8 points at n=150–199. The score is reportable as a specific number with a stated margin. Topic clusters are stable and high-confidence. Nearly all XM signals are reliable at this range.

**What Crystal can accurately show:**
1. **NPS score with stated uncertainty**: "NPS: 38 (±10 at 95% confidence)". Show the CI as a range bar or ± notation.
2. **Full topic signals**: All per-topic signals, driver_score for topics with n≥15.
3. **CSAT and CES** if present.
4. **All four insight layers**: Descriptive, Diagnostic, Predictive (hedged language), Prescriptive.
5. **Industry benchmark comparison**: With caveat — "based on current responses, refining with more feedback."
6. No delta analysis yet (no prior full checkpoint).

**What Crystal says (language tier 1):**
> "I have a solid picture of your survey. NPS is [X], which puts you in the [tier] range for [industry]. [Top topic] is the strongest signal — here's what it means and what you can do about it."

Language rules for this tier:
- NPS number with explicit CI shown
- Driver scores for n≥15 topics
- Benchmark with one-phrase hedge
- No trend claims

**LLM operations in this tier:**
- Full pipeline (same as Clear Picture), except:
- delta_analysis = False (no prior full checkpoint)
- All four narration layers run with data_tier='growing_picture' flag

**Estimated cost:** ~$0.015–0.030 per trigger

---

### Clear Picture (200+ responses) — The Full Report

At 200 responses, the survey crosses into "Clear Picture" — the same threshold as the Tier 2 full checkpoint. **Clear Picture is not a separate sub-tier: it is the product name for the first complete analysis.** The pipeline that runs at 200 responses is the full LangGraph checkpoint pipeline (node_ingest → node_absa → node_embed → node_cluster → node_topics → node_narrate → node_verify → node_evaluate_delta → node_publish).

What users see at Clear Picture is described in the checkpoint delta analysis section (Section 3) and the full signal catalog (Section 2). The ProgressArc advances to ● and all sub-tier logic is permanently disabled for the survey.

The 200-response threshold ensures NPS confidence intervals are ±7 points or tighter before delta analysis is attempted.

---

### How Progressive Tiers Feed the Full Checkpoint

Data gathered in progressive tiers is not discarded when the full checkpoint triggers. It becomes the **baseline** for the first delta analysis. The pipeline uses a **cumulative window**: every checkpoint loads ALL available responses up to `INGEST_MAX_RESPONSES_CAP` (250 responses), not just responses since the last run. ABSA caches already-scored responses so the incremental LLM cost is minimal even on the second or third full regeneration.

```
Growing Picture (n=150)  →  Clear Picture / First full checkpoint (n=200+)
        │                              │  Loads up to 250 responses (cumulative)
        │  ABSA cached                 │  Delta: 50 new responses vs 150-response baseline
        │  Topics cached               │  Delta: what changed in topics, sentiment, NPS
        └──────────────────────────────┘  First delta (trend_persistence = 'first_occurrence')
```

The `new_response_ids` in the first checkpoint's provenance is populated relative to the previous sub-tier run — so the delta is meaningful even though there was no prior "full checkpoint."

**Manual refresh window:** When a user triggers "Generate new insight" from the UI, the pipeline runs with `force_regenerate=True` using the same cumulative cap (250). The minimum new-response requirement (`MANUAL_REFRESH_MIN_NEW_RESPONSES=10`) is enforced at the API layer before the pipeline is invoked — the pipeline itself always runs the full analysis.

---

### Language Calibration Summary

Crystal has a `data_tier` context flag that changes its language calibration across all tiers. This is injected into the system prompt:

```python
DATA_TIER_LANGUAGE = {
    "collecting":      "You are in a waiting state. No responses yet or fewer than 10. Do not make any claims.",
    "first_voices":    "State only directional observations. Never cite a number. Use hedged language: 'appears to', 'early signs'. NPS zone allowed.",
    "early_signals":   "Use hedged language for scores. NPS zone allowed with caveat. Show topic confidence badges. No driver scores.",
    "growing_picture": "Report specific numbers with their confidence intervals. Use calibrated language. All four insight layers with hedging.",
    "full_report":     "Full analytical authority. Report with appropriate statistical grounding. Delta analysis available.",
}
```

Note: `full_report` maps to the Clear Picture / 200+ tier for Crystal's language calibration.

Applied Science owns the language rules per tier. Engineering implements the `data_tier` flag. UX designs the visual treatment for each tier.

---

### Cost Model for Progressive Tiers

| Tier | n range | LLM operations | Approx. cost |
|------|---------|----------------|--------------|
| Collecting | 0–9 | None | $0 |
| First Voices | 10–39 | ABSA + light topic discovery | ~$0.001–0.003 |
| Early Signals | 40–99 | ABSA + topics + partial narration | ~$0.002–0.006 |
| Growing Picture | 100–199 | Full pipeline minus delta analysis | ~$0.015–0.030 |
| Clear Picture | 200+ | Full pipeline + delta analysis | ~$0.020–0.080 |

**No-text survey cost modifier:** Rating-only and no-text surveys skip ABSA, embedding, clustering, and full topic narration. Cost is approximately 60–70% lower than a text-inclusive survey of the same response count:

| Tier | Text survey cost | No-text survey cost |
|------|-----------------|---------------------|
| First Voices (10–39) | ~$0.001–0.003 | ~$0.0003–0.001 |
| Early Signals (40–99) | ~$0.002–0.006 | ~$0.001–0.002 |
| Growing Picture (100–199) | ~$0.015–0.030 | ~$0.005–0.010 |
| Clear Picture (200+) | ~$0.020–0.080 | ~$0.008–0.025 |

Progressive tiers are significantly cheaper than the full pipeline because they skip the most expensive operations (cross-checkpoint delta narration, full prescriptive layer with ICE scoring for all topics).

**Storage cost (in addition to LLM cost):** Each full checkpoint blob is ~100–500KB. At 5 checkpoints/survey × 1,000 surveys, total storage is ~2.5GB — approximately $0.05/month at GCS Standard pricing. Object storage cost is negligible relative to LLM cost.

---

## 13. Research Roadmap

The research roadmap is organized into four phases. Each phase builds on the validated signal infrastructure of the previous phase.

### Phase 1: Signal Accuracy Validation (Months 1-3)

**Goal:** Validate that the 24 signals computed by `compute_full_topic_signals()` are accurate and trustworthy before using them as the foundation for more complex analyses.

**Work items:**
1. **Unit test coverage:** Achieve 100% unit test coverage of `agents/lib/topic_signals.py`. Every signal computation must have tests for edge cases (n=0, all-same-sentiment, NPS-less surveys, CSAT-less surveys).
2. **End-to-end validation:** Create a synthetic dataset of 200 responses with known ground-truth topics, NPS scores, and sentiment distributions. Run the pipeline and compare computed signals to expected values.
3. **ABSA accuracy evaluation:** Manually annotate 500 open-text responses for sentiment, emotion, and aspect. Compute precision/recall of the LLM ABSA output against annotations. Target: precision > 0.80, recall > 0.75 for sentiment classification.
4. **Centroid stability analysis:** Run the clustering algorithm on the same dataset 10 times with different random seeds. Measure Jaccard similarity of resulting topic sets. Target: Jaccard > 0.85 (topic set is stable despite clustering non-determinism).
5. **Driver score correlation validation:** For surveys with known ground truth (A/B tests with controlled topic manipulation), validate that driver_score correctly identifies manipulated topics.

### Phase 2: Anomaly Model Tuning with Real Customer Data (Months 4-6)

**Goal:** Calibrate the anomaly detection framework (Section 4) against real customer data to reduce false positive rate and improve sensitivity.

**Work items:**
1. **False positive audit:** Review all `anomaly_flag = True` records in `survey_metric_snapshots` over a 30-day production window. Manually classify each as true positive, false positive, or ambiguous. Target: false positive rate < 20%.
2. **Z-score threshold optimization:** Test thresholds of 2.0, 2.5, and 3.0 against the labeled dataset. Choose the threshold that maximizes F1 score across the labeled set.
3. **Checkpoint system deployment:** Implement the `survey_insight_checkpoints` table and the trigger evaluation logic described in Section 3. Run in shadow mode for 4 weeks (compute checkpoints but don't act on them) to validate trigger frequency and delta computation.
4. **Sentiment reversal detection validation:** Identify cases from production history where sentiment reversed (positive → negative or vice versa) on a topic between two consecutive pipeline runs. Manually verify that these reversals were real and not artifacts of ABSA variance.
5. **Urgency language detection pilot:** Implement stage 1 pattern matching in the streaming consumer for a selected cohort of customers who opt in. Track precision/recall against manually reviewed urgent responses.

### Phase 3: Churn Prediction Model (Months 7-12)

**Goal:** Build a predictive model that identifies which respondent profiles and topic exposure patterns predict survey disengagement and, for transaction surveys, actual customer churn.

**Work items:**
1. **Feature engineering:** Define a feature vector for each respondent: NPS score, sentiment scores per topic, effort scores, response length, submission time-of-day, number of prior survey completions. Store in a `respondent_features` table.
2. **Label creation:** For customers who also have CRM or product telemetry data (e.g., a SaaS customer with active/churned labels), create a labeled dataset of respondent → churned/retained within 90 days.
3. **Baseline model:** Logistic regression on respondent features. Evaluate AUC-ROC, precision at top 20% (the "alert on the most at-risk"), and calibration.
4. **Feature importance:** Identify which signals most strongly predict churn. Hypothesis: CES (effort) and detractor_pct on the "Billing" topic will be the strongest predictors.
5. **Crystal integration:** Surface churn risk scores in Crystal responses. "Respondents who mentioned Billing and gave NPS < 6 have historically shown 3x higher churn likelihood in similar SaaS surveys."
6. **Promoter/Detractor Language Separation (full implementation):** Implement the methodology described in Section 8 as a separate pipeline path with its own ABSA and clustering stages.

### Phase 4: Multi-Survey Journey Correlation (Months 13-18)

**Goal:** Identify experience patterns that emerge across multiple touchpoints in a customer journey by correlating signals across surveys within the same org.

**Work items:**
1. **Journey stitching:** Define a respondent identity resolution model that matches the same individual across multiple surveys within an org (using email, user ID, or probabilistic matching on demographic attributes).
2. **Cross-survey topic co-occurrence:** Identify topics that co-occur across surveys submitted by the same respondent. Example: a respondent who mentioned "Onboarding difficulty" in a post-trial survey and "Support quality" in a post-purchase survey may represent a systematic journey gap.
3. **Journey NPS halo effect:** Measure whether a very positive experience in one survey (e.g., Sales experience NPS 10) predicts higher NPS in the next survey in the journey (e.g., Onboarding NPS). This establishes the XM equivalent of a loyalty loop.
4. **Org-level portfolio correlation:** Identify which survey topics are correlated across the org's portfolio. A topic that simultaneously appears in 3+ surveys with negative sentiment indicates a systemic issue — product, policy, or operational — not a survey-specific one.
5. **Crystal org-scope mode:** Enable Crystal to answer questions about the entire org's experience portfolio, not just a single survey. "What is the single biggest experience problem in our entire survey portfolio right now?"

---

*Crystal Applied Science Document — Experient Internal*  
*Questions: Applied Science team*
