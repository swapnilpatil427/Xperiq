# Experient AI Insights — Scientific Foundations

> A research synthesis grounding the insight engine in psychometrics, statistics, causal inference, and modern NLP — not LLM hand-waving. Every claim traces back to a citable source. Inputs from psychometricians, applied scientists, CX researchers.

This document is the "why we believe what we display" file. It defines the math behind every metric, the methods behind every insight, and the safety rails on the LLM layer. The [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md) doc encodes these methods into the product contract; the [ARCHITECTURE.md](ARCHITECTURE.md) doc encodes them into running code.

---

## 1. Core XM metrics — math, interpretation, pitfalls

### 1.1 Net Promoter Score (NPS)

**Definition.** `NPS = %Promoters (9-10) − %Detractors (0-6)`. Passives (7-8) are excluded from the score.

**Reichheld's original claim** ("The One Number You Need to Grow," HBR 2003): a single recommendation question predicts revenue growth better than any other satisfaction metric.

**The academic counter-attack.** Keiningham, Cooil, Andreassen & Aksoy (2007), *"A Longitudinal Examination of Net Promoter and Firm Revenue Growth,"* Journal of Marketing 71(3), 39–51 — winner of the 2007 MSI/H. Paul Root Award. Using 21 firms and 15,500+ Norwegian Customer Satisfaction Barometer interviews:

- NPS was the best/second-best predictor in only 2 of 5 industries
- R² gains over simpler metrics were 0.1% to 1.6% — essentially noise
- NPS correlates highly with CSAT/ACSI, contradicting Reichheld's "satisfaction doesn't predict growth" claim

A 2023 MSI report (*"The Net Promoter Score Fails to Predict Revenue Growth"*) and a 2022 JBR systematic evaluation continue to find no superiority over alternative calculations.

**Reichheld's 2021 walk-back — NPS 3.0 / Earned Growth Rate** (HBR Nov–Dec 2021). Reichheld concedes that the survey-based score is gameable and supplements it with **Earned Growth Rate**: revenue from returning customers + their referrals divided by total revenue growth. This is an accounting metric, not a survey metric. We should emulate this credibility move — correlate NPS to retention/referral data, not treat NPS as a standalone truth.

**Statistical limits.**

- NPS is a *difference of two proportions*. Variance ≈ `(p_P + p_D − (p_P − p_D)²) / n` where `p_P`, `p_D` are promoter/detractor proportions. Standard normal CI is too narrow; use the **adjusted-Wald** method.
- With n=50: expect ±20 percentage points at 90% confidence
- n≥1,000 needed for ±5%
- Two-thirds of "movement" in NPS month-over-month at typical sample sizes is statistical noise

**Top-box variants.** Top-2-box (9-10 only) or top-3-box (8-10) give more variance for tracking but lose information. MeasuringU's analyses show ~4% information loss in top-box vs. mean. Top-box scores skew high and induce complacency.

**Pitfalls.** Cultural drift ("the sensitive 7" — US scores skew higher than EU/Japan), selection bias, survey fatigue, "coaching" by reps for 9s.

### 1.2 CSAT

**Definition.** Mean rating on 1-5, 1-7, or 1-10 scale; sometimes reported as top-2-box %.

**Scale variants — psychometric literature (Krosnick & Presser, *Handbook of Survey Research*, 2010):**

- 5-point: simplest, lower discrimination
- **7-point: best balance of discrimination vs. cognitive load (preferred default)**
- 10/11-point: more discrimination but introduces midpoint ambiguity and bigger cross-cultural drift

**Normalization across scales.** Common transform: linear remap to 0–100. *Not mathematically equivalent* — the distance between "4" and "5" on 5-point is not the same as "8" to "10" on 10-point. For comparability use percentile rank within scale or **POMP (Percent of Maximum Possible)** scoring.

### 1.3 Customer Effort Score (CES)

**Origin.** Dixon, Freeman, Toman (2010), *"Stop Trying to Delight Your Customers,"* HBR. CEB study of 75K+ service interactions: 94% of low-effort customers said they'd repurchase; 81% of high-effort said they'd badmouth.

**When CES beats NPS.** Service/support touchpoints — transactional moments (resolve-an-issue, complete-a-task). NPS is better for relationship/brand-level loyalty.

**Caveat.** de Haan, Verhoef, Wiesel (2015), *International Journal of Research in Marketing* — across-study replication found CES r = −0.073 with two-year retention. CES is event-level, not lifetime-level.

### 1.4 Likert scales — ordinal vs. interval

**Rigorous position.** A single Likert item is *ordinal* — "agree" is not numerically equidistant from "strongly agree." Carifio & Perla, and Norman (2010, *Advances in Health Sciences Education*) defend that **summed Likert scales** (≥4 items, symmetric, equidistant labels) behave robustly as interval-scaled for parametric tests. The Sullivan & Artino review is canonical.

**Practical rules.**

- Single item → median, mode, rank-order stats, ordinal regression, Spearman correlations
- Summed scale (≥4 symmetric items, balanced wording) → mean, SD, Pearson, OLS regression acceptable
- Always report wording and distribution, never just the mean

### 1.5 Emotion, effort, intent

Forrester's CX Index measures **ease, effectiveness, and emotion** as the three drivers of CX-driven loyalty. The 2025 Forrester Global CX Index found 21% of brands declined, 73% flat, 6% improved — **emotion is the most weighted predictor in most industries**.

Best practice: capture all three dimensions per touchpoint + open text, then weight by industry-specific loyalty regression (Forrester does this; we will).

### 1.6 Confidence intervals & small-sample discipline

- Always show CI on every reported metric. For NPS with n<200, expect 10–30 pp margins of error
- For proportions with <10 successes/failures, use Wilson or adjusted-Wald, never normal approximation
- For mean comparisons across cohorts, use bootstrap CIs (10K resamples) — robust to non-normality

### 1.7 Response bias inventory (must be modeled, not ignored)

Per Krosnick & Presser (Stanford), GESIS Survey Guidelines, Lensym/Kapiche industry summaries:

| Bias | Effect | Mitigation |
|---|---|---|
| **Acquiescence** ("yes-saying") | 15–25% in cross-cultural surveys | Balance positive + negative-worded items |
| **Social desirability** | Inflated positive responses | Indirect questions, randomized response, online self-administration |
| **Mid-point / central tendency** | Pile-up on neutral | Even-numbered scales; allow "don't know" separately |
| **Extreme response style** | Cultural — Latin/Mediterranean > East Asian | Standardize within respondent (z-score across items) |
| **Order effects** | Earlier items anchor later ones | Randomize item order; counterbalance |
| **Selection / non-response** | Only very happy or very angry respond | Weight by demographic/behavioral propensity scores |

**Key sources:**
- [Has the Net Promoter Score Been Discredited? — MeasuringU](https://measuringu.com/nps-discredited/)
- [Keiningham et al. 2007 — Journal of Marketing](https://journals.sagepub.com/doi/10.1509/jmkg.71.3.039)
- [Net Promoter 3.0 — HBR 2021](https://hbr.org/2021/11/net-promoter-3-0)
- [NPS Confidence Intervals — MeasuringU](https://measuringu.com/nps-ci-sample-size/)
- [Analyzing Likert-Type Scales — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3886444/)
- [Forrester CX Index methodology](https://www.forrester.com/research/cx-index/)
- [GESIS Response Biases in Standardised Surveys](https://www.gesis.org/fileadmin/admin/Dateikatalog/pdf/guidelines/response_biases_standardized_surveys_bogner_landrock_2016.pdf)

---

## 2. Key driver analysis (KDA)

The single most-asked XM question: *"which attributes most drive overall satisfaction / NPS?"*

### 2.1 Why naive OLS regression is wrong

CX driver attributes are nearly always **multicollinear** (people who rate "support" high also rate "trust" high). OLS β coefficients become unstable, can flip sign, and are not interpretable as "importance."

### 2.2 The defensible methods

| Method | When to use | Limits |
|---|---|---|
| **Relative Weights Analysis** (Johnson 2000) | Default for tabular survey driver questions | Can yield negative weights; less intuitive than Shapley |
| **Shapley Value Regression** (Lipovetsky & Conklin 2001) | Executive-grade defensibility | O(2^k) — tractable for k ≤ ~15 |
| **Gradient-boosting + SHAP** | Non-linear interactions, threshold effects | Less interpretable; risk of overfit at small n |
| **Partial / semi-partial correlations** | Quick sanity check | Not a replacement for the above |

Shapley is our **gold-standard default** for executive-facing key driver views. It is built on cooperative game theory axioms (efficiency, symmetry, dummy, additivity) and is the only method whose attribution is provably "fair" in the formal sense.

### 2.3 Sample-size minimums

- 10–20 respondents per predictor (Tabachnick & Fidell rule)
- Shapley reliability requires bootstrap CIs; n ≥ 200 per segment for stable rankings
- For executive reporting: only show drivers whose 95% bootstrap CI **excludes zero**

### 2.4 Output forms

- **Driver matrix** — importance × performance, with size = sample, color = direction
- **Impact-Performance Analysis quadrant (Martilla & James, 1977)** — top-right "keep up the good work"; **top-left "concentrate here"** (high importance, low performance — the actionable quadrant)
- **Driver delta over time** — has the most important driver shifted? (Often the real story)

**Sources:**
- [Benefits of Shapley Value in Key Driver Analysis — HSTalks](https://hstalks.com/article/6044/the-benefits-of-shapley-value-in-key-driver-analys/)
- [Displayr — Visualizing Relative Importance](https://www.displayr.com/5-ways-to-visualize-relative-importance-scores-from-key-driver-analysis/)

---

## 3. Open-text analytics

### 3.1 Topic modeling: BERTopic supersedes LDA in 2025

**LDA (Blei et al., 2003).** Bag-of-words probabilistic mixture. Requires stop-word lists, preprocessing, manual k selection, manual label interpretation. Mediocre on short text (survey verbatims).

**BERTopic (Grootendorst, 2022).** Pipeline: SBERT/MiniLM embeddings → UMAP dimensionality reduction → HDBSCAN density clustering → class-based TF-IDF for topic terms. Higher topic coherence (c_v), better separation, no preprocessing required, direct LLM-labeling hooks.

**LLM-augmented clustering (the 2025 frontier).**

1. Embed verbatims with a strong encoder (E5, BGE, OpenAI text-embedding-3-large)
2. Cluster via HDBSCAN
3. Pass each cluster's exemplar quotes to LLM for naming + summarization
4. Iterative refinement: ask LLM to merge similar clusters, split heterogeneous ones
5. Always pair every topic with **citation quotes** from real responses

### 3.2 Sentiment beyond pos/neg/neutral

- **Plutchik's wheel** — 8 primary emotions (joy/sadness, anger/fear, trust/disgust, surprise/anticipation) in opposing pairs, plus dyads. Bidimensional (valence × arousal).
- **Ekman's basic six** — anger, disgust, fear, happiness, sadness, surprise. Cross-cultural facial-expression studies. Heavily skewed negative (5 of 6).
- **GoEmotions** (Demszky et al., Google Research, ACL 2020) — 27 fine-grained emotion categories + neutral, on 58K Reddit comments. Maps to both Ekman and Plutchik. Fine-tuned BERT achieves F1 = 0.46 across 27, 0.64 on Ekman-grouped, 0.69 on sentiment-grouped. The de-facto industry baseline.

**Our default:** GoEmotions taxonomy. Collapse to Ekman-6 for executive dashboards. Keep full 27 for diagnostic drill-down.

### 3.3 Aspect-based sentiment analysis (ABSA)

Four canonical sub-tasks:

1. **Aspect term extraction** — "the *checkout*"
2. **Aspect category detection** — checkout → "purchase flow"
3. **Opinion term extraction** — "was confusing"
4. **Aspect sentiment classification** — negative

**Method evolution:** lexicon → CRF → BiLSTM-CRF → BERT → instruction-tuned LLMs with zero/few-shot prompting. 2025 reasoning-infused LLMs and LLM-based data augmentation report +10–30 macro-F1 over standard baselines. M-ABSA (14,800 parallel sentences, 21 languages) is the new multilingual benchmark.

### 3.4 Intent / effort / urgency from text

Multi-label classification on the same embeddings. Tag each verbatim with:

- **Intent** — complaint, suggestion, praise, question, churn signal
- **Effort signal** — explicit ("had to try 3 times", "spent an hour")
- **Urgency** — time-sensitive ("can't log in right now", "deadline tomorrow")
- **Churn risk** — "considering switching", "for the last time"

LLM extraction with structured output (JSON schema, low temperature, consistency self-check) is competitive with fine-tuned models for n < 10K examples.

### 3.5 When LLM prompting beats fine-tuning (2025–2026)

| Use LLM prompting when | Use fine-tuning when |
|---|---|
| <5K labeled examples per class | >50K labeled examples |
| Schema may change | Fixed taxonomy |
| Novel domains | Latency/cost-critical at high QPS |
| Multilingual coverage needed | Regulated, deterministic environment |
| Need explanations alongside predictions | |

**Hybrid (production answer):** LLM bootstraps labels → distill to small fine-tuned model for inference → LLM handles long-tail edge cases.

### 3.6 Hallucination control & citation-back-to-quotes

**Non-negotiable for credibility.** The 2025 surveys (arXiv 2510.24476 "Application-Oriented Survey on RAG, Reasoning, Agentic Systems"; arXiv 2510.06265 "Comprehensive Survey of Hallucinations") converge on these patterns:

1. **RAG grounding** — retrieve actual response quotes, force LLM to cite IDs. Properly-implemented RAG reduces hallucination 40–71%.
2. **Strict citation contract** — every claim in narrative must be followed by `[r123, r456]` where IDs map to real responses. **Reject any uncited claim at validation.**
3. **Self-consistency** — sample n=3–5 generations; only surface claims that recur.
4. **Verifier model** — second LLM call asks "is claim X supported by quotes Y?"; reject on disagreement.
5. **Quantitative claims must come from code** — never let the LLM compute NPS. The LLM writes the narrative; the code computes the number.

**Sources:**
- [BERTopic vs LDA — Marketing Research 2026 study](https://journals.sagepub.com/doi/10.1177/14413582251399667)
- [GoEmotions: Fine-Grained Emotions — ACL 2020](https://aclanthology.org/2020.acl-main.372.pdf)
- [Integrating Plutchik's Theory with MoE — EMNLP 2024](https://aclanthology.org/2024.emnlp-main.50.pdf)
- [Mitigating Hallucination — RAG/Reasoning/Agentic Survey 2025](https://arxiv.org/abs/2510.24476)
- [LLM Hallucination Comprehensive Survey 2025](https://arxiv.org/html/2510.06265v2)

---

## 4. Segmentation & cohorts

### 4.1 Three bases

- **Demographic** (age, geo, role) — cheap, weak predictor of behavior
- **Behavioral** (logins, purchases, support tickets) — strong predictor
- **Psychographic / attitudinal** (values, motivations, sentiment patterns) — strong but expensive

The XM differentiator is combining all three. For B2B SaaS: firmographic + behavioral + sentiment.

### 4.2 Latent Class Analysis (LCA)

LCA finds *unobserved* segments by modeling response patterns as a finite mixture. Unlike k-means it:
- Handles categorical/ordinal data natively (Likert produces these)
- Gives probabilistic membership (a respondent can be 60% A, 40% B)
- Tests model fit (BIC/AIC, entropy)

Use LCA when 3–7 meaningful segments suspected and n ≥ 500 respondents.

### 4.3 RFS — RFM analogue for XM

Replace Monetary with Sentiment:

| Dimension | XM analogue |
|---|---|
| Recency | Days since last touchpoint / last response |
| Frequency | # responses + # support interactions over window |
| Sentiment | Composite of NPS + CSAT + verbatim emotion score |

Score 1–5 quintiles → 125 micro-segments → roll up to "champions" (recent + frequent + positive), "at-risk" (recent + frequent + suddenly negative), "lost" (no activity + ever-negative).

### 4.4 Cohort retention curves

Plot % cohort still engaged by month-since-acquisition. Overlay NPS by cohort. The flattening point is the "habit cliff." Behavioral cohorts (≥3 surveys in first 30 days) usually beat pure NPS cohorts as retention predictors.

---

## 5. Predictive & prescriptive

### 5.1 Churn prediction

Per 2025 MDPI systematic review and Tandfonline survey:

- Gradient-boosted trees (XGBoost, LightGBM, CatBoost) remain strongest tabular baseline
- Top features are **rates of change**: Δ-logins, Δ-sentiment, Δ-support-volume — not absolute levels
- Survey signals (NPS drop, CES spike, negative emotion) add 3–8% AUC over behavior-only
- Deep learning (LSTM/Transformer on event sequences) competitive but rarely worth operational overhead unless n > 100K customers

Production accuracy: 85–92% AUC when behavior + survey features combined.

### 5.2 Customer Lifetime Value

- **BTYD models** (Fader & Hardie BG/NBD + Gamma-Gamma) — probabilistic, transparent, transaction logs only
- **Survival analysis** (Cox PH, AFT) — handles censoring properly
- **ML regression** (XGBoost on rolled-up features) — easier, opaquer

CLV-aware churn ranking (focus on saving high-CLV segment, not highest-probability churners) is table-stakes refinement.

### 5.3 Causal inference: "what action moves NPS by X?"

Where most XM platforms fail. Correlation ≠ causation. Required tools:

| Tool | When to use |
|---|---|
| **A/B testing** | Gold standard when feasible |
| **Difference-in-differences** | Non-randomized rollouts |
| **Propensity-score matching** | Observational comparisons |
| **CausalImpact (BSTS)** | Pre/post event attribution |
| **Uplift modeling** (S/T/X/R/DR-learners) | "Who responds best to which intervention" — Uber's CausalML library is canonical |
| **Synthetic control** | Case-study attribution |

For prescriptive output ("if you fix onboarding, NPS expected +5.2 ±2.1"), uplift modeling with bootstrap CIs is the defensible answer.

### 5.4 Bandit / RL for recommended actions

Contextual bandits (LinUCB, Thompson sampling) when:
- Multiple possible interventions (email vs. discount vs. CSM call)
- Reward is fast (NPS-followup within days)
- Tolerable exploration cost (~10–20% suboptimal actions during learning)

Instacart, Optimizely, Hightouch have public case studies. Deep RL (DQN, PPO) is overkill for most XM recommendation problems.

**Sources:**
- [Customer Churn Prediction Systematic Review — MDPI 2025](https://www.mdpi.com/2504-4990/7/3/105)
- [Uber CausalML — GitHub](https://github.com/uber/causalml)
- [Uplift Modeling for Multiple Treatments — arXiv](https://arxiv.org/pdf/1908.05372)

---

## 6. Anomaly & change detection

### 6.1 Time-series methods

- **STL** — decomposition (trend + seasonal + remainder). Anomalies = large remainders. Doesn't forecast.
- **ARIMA/SARIMA** — forecasts with prediction interval; outliers fall outside. Brittle with limited history.
- **Prophet** (Meta, 2017) — additive trend + seasonality + holidays. Robust to missing data and outliers. **Default for daily/weekly NPS time-series with modest history.**
- **Bayesian Online Change-Point Detection** (Adams & MacKay 2007) — distinguishes a *one-off spike* from a *regime change*. Critical for not crying wolf.
- **Matrix Profile** — discord/motif mining. Pairs well with Prophet as hybrid.

### 6.2 Cohort-level vs aggregate anomaly

Aggregate NPS can be flat while a specific segment is collapsing. The discipline:
- Detect at multiple granularities (overall, segment, touchpoint, feature)
- Multiple-testing correction (**Benjamini-Hochberg FDR at q=0.05**) to avoid alert spam
- Group anomalies by time-correlation (cluster simultaneous spikes → likely common cause)

### 6.3 Avoiding false alarms at low sample size

With n=20 weekly responses, NPS can swing 30 points by chance. Rules:
- Don't alert on segments with n < 30 in the window
- Require persistence — two consecutive periods, not one
- Use Bayesian posteriors (was the change *probable*, not just *possible*?)
- Always report effect size *and* CI, never just point change

---

## 7. Trust & explainability

### 7.1 Confidence scoring

Every insight should carry a numeric confidence with components:

- **Statistical** — CI width, sample size, effect-size significance
- **Coverage** — fraction of relevant responses considered
- **Consistency** — % of LLM samples (n≥3) that produced this claim
- **Grounding** — number and quality of cited source quotes

Surface as a single 0–100 + breakdown on hover. Below threshold (default 60), label as "exploratory" not "insight."

### 7.2 Citation-back-to-source-quotes (CRITICAL)

Every narrative claim must hyperlink to ≥2 real verbatims. Hover/click reveals the quotes. **This single feature buys more trust than any model upgrade.**

Architecture pattern (from RAG literature):

1. Retrieve top-K candidate quotes by topic/embedding
2. Pass to LLM with strict prompt: "every claim must end with `[q1, q3, q5]`"
3. Validator post-processes — strips any uncited sentences
4. UI renders citations as inline chips → quote drawer

### 7.3 Bias audit

Per Wharton, Stanford SLS, arXiv 2411.10915 ("Bias in LLMs"):

- LLMs exhibit **positivity bias** (over-summarizing the upbeat) from RLHF training. Counter by:
  1. Sample-balanced retrieval (force equal positive/negative quotes into context)
  2. Explicit instruction to "represent the distribution faithfully"
  3. Post-hoc audit comparing LLM summary sentiment distribution to ground-truth distribution
- LLMs **suppress minority voices** when summarizing — non-standard language, less-frequent topics get dropped. Counter with stratified retrieval (sample from every cluster), explicit minority-perspective prompts, distribution-faithfulness validator.
- **Demographic skew** — if response sample over-represents segments (e.g., happy power users), LLM amplifies this. Mitigate with post-stratification weighting.

**Required: a bias dashboard** showing (sentiment distribution of source quotes) vs. (sentiment distribution of summary claims). Flag delta > 10 pp.

### 7.4 Reproducibility

LLM temperature > 0 means re-running the same analysis produces different insights. Requirements:

- Pin **temperature = 0** for production
- Pin model version explicitly
- Store full prompt, retrieved context, output as an audit record
- Re-run identical inputs → identical outputs as a CI test
- For non-LLM components (KDA, topic modeling), pin random seeds, embedding model versions, clustering parameters
- Save a deterministic **insight-hash**; if the same survey produces different insights, that's a bug

---

## 8. Cutting-edge in 2025–2026

### 8.1 LLM-as-analyst / agentic analysis

The September 2025 arXiv survey "LLM/Agent-as-Data-Analyst" (arXiv 2509.23988) codifies four design goals:

1. **Semantic-aware** — knows what NPS means, not just that it's a number
2. **Autonomous pipelines** — generates SQL, runs analyses, interprets results
3. **Tool-augmented** — calls KDA tools, statistical libraries, visualization
4. **Open-world** — handles novel survey schemas without retraining

**Our pattern:** tool-using agent with a fixed analytics toolbox (`compute_kda`, `run_absa`, `detect_anomaly`, `retrieve_quotes`, …) and an LLM that orchestrates and narrates. The LLM never computes — it commissions and explains.

### 8.2 Embedding-based cross-survey comparison

Embed every verbatim. Now:
- Compare two surveys: are topics shifting? (clustering similarity)
- Find "responses like this one" across history
- Surface emerging themes (responses far from existing clusters)

**pgvector is our default** (Postgres-backed, no separate datastore). Pinecone/Weaviate/Qdrant only if pgvector hits scale limits.

### 8.3 Synthetic respondents — when valid, when dangerous

2025 evidence (Verasight, Cambridge *Political Analysis*, arXiv "Reliability of Persona-Conditioned LLMs"):

- LLM-generated responses approximate **toplines** crudely (~5 pp off)
- **Subgroup errors balloon to 10–30 pp** — useless for any segment-level decision
- No reliable mapping from synthetic to real population parameters

**Safe uses:** prompting/copy testing, draft survey design QA, edge-case enumeration, "what would this persona say?" prototype demos.

**Dangerous uses:** replacing real respondents, training predictive models on synthetic data, claiming statistical validity to executives.

A 2025 PMC paper labels LLM-generated fake responses *"an existential threat to online survey research"* — also a vector we must defend against on the *receiving* side (bot detection, attention checks, response-pattern anomaly detection on inbound responses).

### 8.4 Multi-modal: voice + video

2025 MDPI Comprehensive Review of Multimodal Emotion Recognition shows >40% of recent studies use trimodal (text + audio + visual) with transformer cross-modal fusion. Customer-service datasets like EmoWork (call-center role-play) are public.

Practical XM applications:
- **Voice surveys** — Whisper/Deepgram transcription + prosodic features (pitch, energy, pause) for valence/arousal scoring
- **Video feedback** — face-based emotion recognition (FER2013-trained) + speech

Privacy is gating; on-device or short-retention pipelines mandatory for EU/CA compliance.

**For v1: text-only. Voice as a fast-follow.**

---

## 9. What we MUST implement to be credible (v1 checklist)

These are non-negotiable. Without them we are another LLM wrapper.

### Statistical credibility
- [ ] NPS / CSAT / CES computed with adjusted-Wald CIs, shown on every metric
- [ ] Refuse to surface insights when n < threshold (configurable, default 30 per segment)
- [ ] Show sample size next to every number, always
- [ ] Multiple-testing correction (BH-FDR) on "significant change" alerts
- [ ] Treat individual Likert items as ordinal; only treat summed scales as interval

### Driver analysis done right
- [ ] Shapley-value regression or Relative Weights (not raw OLS β)
- [ ] Bootstrap CIs on driver importance; suppress drivers whose CI includes zero
- [ ] Importance × Performance quadrant view

### Open text done responsibly
- [ ] BERTopic-style embedding-clustering pipeline, not LDA
- [ ] GoEmotions-grade emotion taxonomy, not just pos/neg/neutral
- [ ] ABSA for aspect-level sentiment (don't conflate "product is great but support is awful" into one sentiment)

### LLM safety rails
- [ ] Every narrative claim cites ≥2 real response IDs; uncited claims rejected at validation
- [ ] Numeric claims come from deterministic code, never LLM math
- [ ] Self-consistency check (n≥3 samples) for high-stakes summaries
- [ ] Verifier model pass over generated narratives
- [ ] Temperature 0 + pinned model version for reproducibility
- [ ] Audit log: prompt, context, output, model version stored per insight

### Bias & fairness
- [ ] Stratified retrieval into LLM context (no positivity-bias amplification)
- [ ] Sentiment-distribution audit: summary vs. source quotes; flag delta > 10 pp
- [ ] Sample weights for non-representative response sets

### Anomaly detection that doesn't cry wolf
- [ ] Require persistence (≥2 periods) and minimum n before alerting
- [ ] Show effect size with CI, never raw point movement
- [ ] Distinguish "spike" from "regime change" (changepoint method, not just threshold)

### Trust UI
- [ ] Confidence score (0–100) on every insight card
- [ ] Click-to-source-quotes drawer
- [ ] "Why this insight?" explanation pane

---

## 10. Nice-to-have (defer to v2+)

- Uplift modeling for prescriptive recommendations (need substantial response volume + intervention history)
- Contextual bandits for action recommendation (requires fast-feedback loop)
- Bayesian Online Changepoint Detection (Prophet + persistence rule covers 90% of cases initially)
- Voice / video multimodal (text-only first; massive complexity multiplier)
- Latent Class Analysis (start with simpler RFS quintile segmentation)
- Cross-survey embedding comparison (presupposes multi-survey history)
- Earned Growth Rate (requires linking NPS to revenue/referral data — year-2 integration)
- Synthetic respondents for survey design QA (genuinely useful; label clearly as synthetic)
- Fine-tuned domain ABSA/emotion models (LLM-prompted versions fine until volume justifies MLOps cost)
- Causal-impact attribution for product launches (CausalImpact/BSTS — high-value with product analytics integration)

---

## 11. Headline take-aways

1. **NPS is a UX choice, not a science.** Fine as a North Star; treat as one signal among many, always with CI, pair with Earned Growth Rate.
2. **Key driver analysis is the most valuable analytical capability.** Get Shapley right and we've out-built half the market still shipping naive regressions.
3. **The defensibility moat is citation-back-to-quotes + statistical CIs.** Unglamorous; buys more enterprise trust than any model upgrade.
4. **LLMs are great writers, poor statisticians.** Let them narrate; never let them count.
5. **Synthetic respondents are a trap for production decisioning.** Design QA only.
6. **Bias audit is non-optional.** RLHF-trained LLMs over-summarize positive content and underweight minority voices.
7. **Modern stack consensus (2025–2026):** BERTopic for topics, GoEmotions for emotion, LLM+RAG with citations for narrative, Shapley for drivers, Prophet + persistence for anomalies, pgvector for cross-survey search, XGBoost + uplift for prediction. Boring is correct.
