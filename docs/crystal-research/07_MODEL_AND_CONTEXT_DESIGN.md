# Crystal — Model Selection, Response Size & Context Window Design

> Owner: AI Engineering + Applied Science
> Audience: AI Engineers, Applied Scientists, Engineering Leadership
> Status: Research Draft | May 2026

---

## 1. The Core Question

Crystal generates insight reports from survey response data. Two questions determine whether those reports are trustworthy:

1. **How many responses do we need before a given signal is statistically reliable?**
2. **Which AI model do we use for which task, and how much context does each task require?**

Getting the first question wrong produces confident-sounding nonsense from small samples. Getting the second wrong produces either a slow, expensive system (if we over-provision) or a shallow, inaccurate one (if we under-provision). Both errors destroy trust.

This document answers both questions with precision, then defines the operating policy Crystal follows.

---

## 2. Response Size Requirements for Report Accuracy

### 2.1 The Fundamental Problem

Survey data is sparse by nature. A new survey might have 8 responses. A mature one might have 800. Crystal must produce *useful* output at 8 and *rigorous* output at 800. The difference is not just confidence — it is which computations are valid to run at all.

Running driver analysis (point-biserial correlation) on 12 responses produces numerically valid output that is statistically meaningless. Presenting it as insight is worse than saying nothing — it misleads. Crystal must know what it can and cannot compute honestly at every sample size.

### 2.2 Signal-Level Minimum Response Requirements

The table below defines three thresholds for each signal. **Minimum**: the computation produces a number. **Reliable**: the number is stable enough to report directionally. **Robust**: the number is stable enough to report with confidence intervals and act on.

| Signal | Minimum n | Reliable n | Robust n | Notes |
|---|---|---|---|---|
| **NPS score (point estimate)** | 1 | 30 | 150 | ±5pt CI at n=150 (95% conf). Below 30, report as directional only. |
| **NPS confidence interval** | 30 | 75 | 200 | Wilson score CI. Below 30, CI spans >20 pts — meaningless for decisions. |
| **CSAT score** | 1 | 30 | 100 | Same logic as NPS. |
| **CES score** | 1 | 30 | 100 | Effort score requires reasonable distribution. |
| **Completion rate** | 10 | 50 | 200 | Completion rate is a proportion — Wilson CI applies. |
| **Response velocity (7-day)** | 7 days of data | 21 days | 60 days | Needs multiple time points. Single day = no baseline. |
| **Topic extraction** | 10 | 50 | 200 | Below 10: one topic (everything is noise). 10-50: rough themes. 200+: stable, nuanced topics. |
| **Topic volume (response_pct)** | 5/topic | 15/topic | 50/topic | A topic with 3 mentions is not a theme. |
| **Net sentiment per topic** | 5/topic | 20/topic | 50/topic | Sentiment averages stabilize around n=20 per topic. |
| **NPS impact per topic** | 20 total + score coverage | 50 | 150 | Requires both NPS scores AND topic tagging on same responses. |
| **Driver score (point-biserial)** | 30 total | 100 | 500 | Below 30: correlation is meaningless. Below 100: high variance. |
| **Urgency score** | 5/topic | 15/topic | 50/topic | Proportion of high-urgency responses — needs distribution. |
| **Velocity WoW (trend)** | 2 weeks | 4 weeks | 8 weeks | Week-over-week change. Two data points = one comparison. |
| **Anomaly detection (volume)** | 14 days | 30 days | 60 days | Z-score needs mean and std. |
| **Anomaly detection (score)** | 3 checkpoints | 5 checkpoints | 10 checkpoints | CI non-overlap test needs multiple snapshot pairs. |
| **Segment analysis (promoter vs detractor)** | 20/segment | 50/segment | 100/segment | Each segment is an independent sample. |
| **Emotion distribution** | 10/topic | 30/topic | 100/topic | Proportions per emotion bucket. 8 emotions = 8 cells to fill. |
| **Predictive projection (linear)** | 5 metric snapshots | 8 snapshots | 15 snapshots | OLS regression on time series. Below 5 points: slope is arbitrary. |
| **Industry benchmark comparison** | 30 | 30 | 30 | Benchmark is external data — sample requirement is ours vs. benchmark stability. |
| **Cross-survey theme co-occurrence** | 2 surveys × 20 responses | 2 surveys × 50 | 3+ surveys × 100 | Needs sufficient signal in each survey independently. |

### 2.3 Report Tier Policy

Crystal does not produce the same report format at every sample size. It operates in four tiers. Presenting a Tier 1 report as equivalent to a Tier 4 report is a trust violation.

#### Tier 1: Exploratory (n < 30)
**What Crystal says:** "This survey has [n] responses. Here's what we can observe so far."
- ✅ Response count, completion rate (no CI)
- ✅ NPS/CSAT as directional only ("trending positive") — no exact score
- ✅ Top 2-3 raw themes with most-mentioned keywords (not NLP-clustered)
- ✅ Up to 5 representative verbatims
- ❌ No driver analysis, no benchmarks, no anomaly detection, no sentiment per topic
- Crystal's tone: "Early signals. Not enough data for confident conclusions."

#### Tier 2: Standard (30 ≤ n < 150)
**What Crystal says:** "Based on [n] responses, here are the key findings."
- ✅ NPS with CI (wide but valid) and benchmark comparison
- ✅ Top 5 topics with volume and rough sentiment direction
- ✅ Basic urgency detection (keyword-level)
- ✅ Completion rate with CI
- ⚠️ Driver analysis flagged as "preliminary" (not used for ranking)
- ❌ No segment analysis, no anomaly detection (needs baseline)
- Crystal's tone: "Moderate confidence. Consider collecting more responses before major decisions."

#### Tier 3: Robust (150 ≤ n < 500)
**What Crystal says:** "Statistically grounded findings from [n] responses."
- ✅ Full NPS/CSAT/CES with CIs and percentile benchmarks
- ✅ Top 5 themes with all per-topic signals (driver_score, nps_impact, urgency, emotion)
- ✅ Promoter vs. detractor verbatim contrast
- ✅ Anomaly detection (if 3+ checkpoints exist)
- ✅ Predictive projection (if 8+ checkpoints exist)
- ✅ Segment analysis for binary segments (promoter/detractor)
- Crystal's tone: Full confidence in signals. Report presented without caveats.

#### Tier 4: Enterprise (n ≥ 500)
**What Crystal says:** Full report. No hedging.
- ✅ All Tier 3 plus multi-segment analysis (NPS bucket × topic × time)
- ✅ Robust driver analysis (driver_score is the primary sort key)
- ✅ Full anomaly framework (volume + score + structural)
- ✅ Verbatim cluster evolution across checkpoints
- ✅ Survey health signals (completion rate trend, skip rates, response length trend)
- ✅ Competitive entity mention detection (if entity list configured)

### 2.4 How Tier Is Surfaced in the UI

The current response count is visible on every Crystal report page. Tier is shown as a "data confidence" badge:

```
⚪ Exploratory   — n < 30
🟡 Standard      — 30 ≤ n < 150
🟢 Robust        — 150 ≤ n < 500
🔵 Enterprise    — n ≥ 500
```

Crystal's generated text adapts automatically based on tier. The prompt includes the tier and its constraints — Crystal cannot claim statistical significance if the tier does not permit it.

---

## 3. AI Model Selection

### 3.1 Model Landscape (May 2026)

Crystal uses Anthropic's Claude family as primary models, accessed via OpenRouter for routing flexibility. The three models in active use:

| Model | Context Window | Strength | Approximate Cost |
|---|---|---|---|
| **Claude Haiku 4.5** | 200K tokens | Fast, cheap, routing and filtering | ~$0.00025/1K in, ~$0.00125/1K out |
| **Claude Sonnet 4.6** | 200K tokens | Balanced reasoning, tool use, analysis | ~$0.003/1K in, ~$0.015/1K out |
| **Claude Opus 4.7** | 200K tokens | Deepest reasoning, complex synthesis, reports | ~$0.015/1K in, ~$0.075/1K out |

### 3.2 Task-to-Model Mapping

Crystal performs distinct task types. Each has different reasoning demands, latency budgets, and cost constraints. The correct model is never "always use the best one" — it is the cheapest model that meets the quality bar for the task.

#### Task 1: Scope Resolution & Intent Classification
**What:** "Is this an org-level or survey-level question? Which tools does this probably need?"
**Model:** Claude Haiku 4.5
**Context size:** ~2K tokens (system prompt + tool descriptions + user message)
**Latency target:** <500ms
**Why Haiku:** This is classification, not reasoning. Haiku handles it correctly >95% of the time. Using Sonnet here wastes 10× the cost on a task that doesn't need it.
**Cost per call:** ~$0.001

#### Task 2: Tool Selection (ReAct Step)
**What:** Given the user question and accumulated tool results so far, which tool to call next?
**Model:** Claude Sonnet 4.6
**Context size:** 5K–40K tokens (grows with each tool result added to context)
**Latency target:** <2s per step
**Why Sonnet:** Tool selection in a multi-step loop requires real reasoning — understanding which data is missing, which tool fills the gap, when to stop. Haiku degrades significantly on 4+ step chains. Opus is overkill for step-by-step decisions.
**Cost per call:** ~$0.05–$0.40 depending on accumulated context

#### Task 3: Answer Synthesis (Conversational Crystal)
**What:** Combine 2–6 tool results into a coherent, cited, 3–6 sentence answer.
**Model:** Claude Sonnet 4.6
**Context size:** 20K–80K tokens (all tool results + history)
**Latency target:** <5s (streamed, so first token < 1s)
**Why Sonnet:** Synthesis of moderate-complexity data. Sonnet produces high-quality answers here. Opus is ~5× more expensive for minimal quality gain in conversational responses.
**Cost per synthesis:** ~$0.30–$1.20

#### Task 4: Survey Deep-Dive Report Generation
**What:** Generate a full checkpoint report — 7 sections, top 5 themes, trend analysis, anomalies, benchmarks, action priorities.
**Model:** Claude Opus 4.7
**Context size:** 40K–120K tokens (checkpoint data for one survey)
**Latency target:** <30s (background task, not blocking UI)
**Why Opus:** Report generation requires: holding 5 themes simultaneously, ranking them correctly by driver_score and nps_impact, writing coherent narrative per section without contradiction, producing actionable output not just descriptive output. Sonnet produces acceptable reports; Opus produces excellent ones. For a report users will share with leadership, excellence matters.
**Extended Thinking:** Enabled for Opus report generation. Crystal thinks before it narrates, producing more internally consistent reports.
**Cost per report:** ~$1.50–$6.00 depending on report depth

#### Task 5: Anomaly Explanation
**What:** "A volume spike was detected. Explain what happened and why, citing the specific responses."
**Model:** Claude Sonnet 4.6 with extended thinking enabled
**Context size:** 30K–60K tokens (metric history + verbatims around anomaly date)
**Latency target:** <15s (background, displayed as alert card)
**Why Sonnet + thinking:** Anomaly explanation requires connecting temporal events (response spike) to content events (what changed in verbatims). Extended thinking lets Claude reason about causality before committing to an explanation. Sonnet with thinking matches Opus quality here at ~30% of the cost.
**Cost per anomaly explanation:** ~$0.50–$1.50

#### Task 6: Org Portfolio Report
**What:** Synthesize the latest checkpoint from each active survey into an org-level digest.
**Model:** Claude Opus 4.7
**Context size:** 50K–180K tokens (checkpoint summaries for up to 50 surveys)
**Latency target:** <60s (daily scheduled task, not user-facing blocking)
**Why Opus:** Comparing 10+ surveys, identifying cross-cutting themes, ranking by urgency and impact, and writing a coherent org narrative requires Opus. At this scale, Sonnet makes ranking errors and misses cross-survey pattern connections.
**Cost per org report:** ~$2.50–$13.50 (scales with org size)
**Mitigation:** Compress each survey checkpoint to a ~2K token summary before feeding to Opus. This caps the org report context at 20K–30K tokens even for large orgs.

#### Task 7: Urgency Alert Generation (Real-time)
**What:** A response with cancel-intent language was detected. Generate a 1-2 sentence alert and suggested action.
**Model:** Claude Haiku 4.5
**Context size:** ~3K tokens (the flagged response + survey context)
**Latency target:** <1s (fires from streaming consumer)
**Why Haiku:** Speed is the primary constraint. The alert is short and the input is small. Haiku is more than sufficient.
**Cost per alert:** ~$0.002

### 3.3 Cost Model by User Scenario

| User Action | Tasks Triggered | Models Used | Estimated Cost |
|---|---|---|---|
| Conversational question (simple) | Scope resolution + 1–2 tool calls + synthesis | Haiku + Sonnet × 2 | ~$0.15–$0.50 |
| Conversational question (complex) | Scope resolution + 4–6 tool calls + synthesis | Haiku + Sonnet × 5 | ~$0.50–$1.50 |
| Survey deep-dive report (Tier 3) | Checkpoint compute (no LLM) + Opus report gen | Opus × 1 | ~$2.00–$4.00 |
| Survey deep-dive report (Tier 4) | Checkpoint compute + Opus report gen | Opus × 1 | ~$4.00–$6.00 |
| Org portfolio report (10 surveys) | Checkpoint summaries + Opus org report | Opus × 1 | ~$3.00–$8.00 |
| Anomaly alert (streaming) | Haiku alert + Sonnet explanation | Haiku + Sonnet | ~$0.70–$1.50 |
| Weekly digest | Per-survey summaries + Opus digest gen | Opus × 1 | ~$2.00–$10.00 |

**Monthly cost estimate for a mid-tier org** (5 active surveys, 50 Crystal conversations/day, 4 weekly reports):
- 50 conversations × $0.50 average × 30 days = $750
- 4 weekly reports × 5 surveys × $3.00 = $240/month
- Daily org report × $5.00 × 30 = $150
- **Total: ~$1,140/month in model costs**

This is well within the margin for a $500–$2,000/month SaaS product. Crystal needs to be behind a usage tier, not offered unlimited.

---

## 4. Context Window Architecture

### 4.1 What Goes Into Context

Claude's 200K token window is large but not infinite. The challenge is not capacity — it is **signal-to-noise**. A context filled with raw response data is harder for Claude to reason over than a context with compressed, structured signals.

**Never put in context:**
- Raw response JSON arrays (too verbose, too many tokens)
- Full Postgres query results without compression
- Duplicate data (e.g., topic name repeated in every row)

**Always put in context:**
- Computed signals (already aggregated — efficient)
- Top N verbatims (5 per topic is enough; 50 is too many)
- Compressed metric history (date + value pairs, not full row objects)
- Checkpoint delta summaries (what changed, not raw before/after)

### 4.2 Token Budget per Context Type

#### Conversational Crystal (single survey, 4-step tool call chain)

```
System prompt (Crystal persona + rules + tier constraints):    3,000 tokens
Survey context header (title, n, tier, industry):                 500 tokens
Conversation history (last 10 turns):                          5,000 tokens
Tool call 1 result (metric history, 90 days):                  8,000 tokens
Tool call 2 result (topic signals, 10 topics):                 5,000 tokens
Tool call 3 result (verbatims, 5 per topic):                   5,000 tokens
Tool call 4 result (anomalies, last 3):                        3,000 tokens
────────────────────────────────────────────────────────────
Total:                                                        ~29,500 tokens

Claude output (answer + suggestions):                          1,000 tokens
──────────────────────────────────────────────────────────── 
Grand total:                                                  ~30,500 tokens
```

This is 15% of the 200K window. Plenty of headroom for longer conversations and additional tool calls.

#### Survey Deep-Dive Report (Opus, Tier 3+)

```
System prompt (Crystal report persona + formatting rules):     4,000 tokens
Survey metadata (title, questions, n, tier, industry):         1,000 tokens
All topic signals (10 topics × 24 signals each):               6,000 tokens
Metric snapshot history (90 days, daily):                     10,000 tokens
Top verbatims (5 per topic, 10 topics = 50 verbatims):         8,000 tokens
Checkpoint delta (changes since last report):                  4,000 tokens
Industry benchmarks (static table, 6 verticals):               2,000 tokens
────────────────────────────────────────────────────────────
Total input:                                                  ~35,000 tokens

Opus output (full 7-section report):                           5,000 tokens
────────────────────────────────────────────────────────────
Grand total:                                                  ~40,000 tokens
```

20% of the 200K window. Even a survey with 50 topics and 180 days of history fits comfortably.

#### Org Portfolio Report (Opus, 15 surveys)

```
System prompt:                                                 4,000 tokens
Per-survey checkpoint summaries (15 surveys × 1,500 tokens):  22,500 tokens
Cross-survey theme matrix:                                     3,000 tokens
Org metric history (90 days):                                  8,000 tokens
Portfolio health map:                                          2,000 tokens
────────────────────────────────────────────────────────────
Total input:                                                  ~39,500 tokens

Opus output (org digest):                                      4,000 tokens
────────────────────────────────────────────────────────────
Grand total:                                                  ~43,500 tokens
```

This scales linearly with number of surveys. At 100 surveys, the input grows to ~154K tokens — still within the 200K window if summaries are compressed well.

**Compression strategy for large orgs:** When org survey count > 30, generate a 500-token "one-liner" per survey (title, NPS, top topic, health label, urgency flag) instead of a 1,500-token summary. This caps the org context at ~60K tokens regardless of org size.

### 4.3 Context Management in the ReAct Loop

Each tool call adds to the accumulated context. Without management, a 10-step reasoning chain could push context into the 80K–100K range, which is fine for capacity but expensive.

**Strategy: progressive compression**

After each tool result is added to the context, apply compression:
1. **Summarize large arrays**: If a tool returns 200 verbatims, compress to the top 10 most representative before adding to context.
2. **Drop intermediate reasoning**: Once a tool result has been used to inform a decision (Claude has processed it), it can be replaced with a one-line summary in subsequent steps.
3. **Rolling conversation window**: Keep only the last 6 turns of conversation in context. Older turns are summarized into a "conversation summary" block.

This keeps the ReAct loop context under 60K tokens for 95% of Crystal conversations, regardless of depth.

### 4.4 Context Isolation (Multi-Tenancy)

Every Crystal context includes `org_id` at the start of the system prompt and every tool result is filtered by `org_id` before being returned. Crystal cannot accidentally receive data from another org because:

1. `CrystalContext.org_id` is set from the authenticated JWT, not user input
2. Every tool executor's first parameter is `ctx: CrystalContext` — the executor applies `WHERE org_id = ctx.org_id` to every query
3. Claude is told explicitly in the system prompt: "You are operating within org `{org_id}`. All data you receive is scoped to this organization. Never reference data from other organizations."

---

## 5. The "Provable" Requirement

Every claim Crystal makes must be:

**Backed** — the specific data point (insight ID, topic name, response count, verbatim quote) that supports the claim is cited inline.

**Bounded** — the confidence interval or sample size caveat is stated when it affects the claim's reliability.

**Traceable** — the user can click through from any claim in a Crystal report to see the underlying responses or signals that produced it.

**Non-hallucinated** — Crystal is explicitly told which insight IDs and topic names exist in context. The evaluator checks every cited ID against the known set. Any citation that doesn't exist in context is flagged and triggers a retry.

### 5.1 The Claim Validation Rule

Before Crystal produces final output, a lightweight Haiku-powered validator checks:

```
For each factual claim in Crystal's draft:
  → Is there a corresponding data point in the tool results provided?
  → Is the direction (up/down, high/low) consistent with the data?
  → If a percentage or score is cited, does it match the tool result within ±1?
  → If an insight ID is cited, does it exist in the insights list provided?

If any check fails: retry with correction prompt.
Maximum retries: 2. If still failing after 2 retries: return answer with "low confidence" flag.
```

This validator runs on every Crystal output, not just reports. The cost is minimal (Haiku, <2K tokens) and the trust payoff is high.

---

## 6. Model Upgrade Policy

Models improve rapidly. This policy governs when and how Crystal's model configuration changes.

**Upgrade trigger:** A new model version is available AND shows >5% quality improvement on the Crystal eval benchmark without regression on cost-efficiency.

**Upgrade process:**
1. Run eval harness on both old and new model across 200 representative Crystal queries
2. Compare grounding score, specificity score, hallucination rate, tool selection accuracy
3. If new model wins on primary metrics, update `CRYSTAL_MODEL_CONFIG` in `agents/crystal/config.py`
4. Shadow-run new model for 7 days alongside old model, comparing outputs
5. Full cutover if shadow run confirms eval results

**Never upgrade in production without eval first.** Model version is logged on every Crystal output so degradations can be traced to a specific model change.

---

## 7. Quick Reference: Decision Table

```
User asks a simple factual question (what is NPS?)
  → Haiku for scope + Sonnet for 1-step synthesis
  → Cost: ~$0.10

User asks "why did NPS drop?"
  → Haiku for scope + Sonnet × 4 steps (metric history → topics → verbatims → synthesis)
  → Cost: ~$0.60

User clicks "Generate Deep Dive Report" on a Tier 3 survey
  → Background: Checkpoint system computes signals (no LLM)
  → Opus for report generation
  → Cost: ~$3.00, latency: ~20s

Streaming consumer fires: 30 new responses received
  → Python checkpoint system runs (no LLM) — delta computed
  → If anomaly detected: Haiku alert + Sonnet explanation
  → Cost: ~$1.00 for anomaly path, $0 if no anomaly

Scheduler fires daily org report
  → Read latest survey checkpoints → compress to summaries
  → Opus generates org digest
  → Cost: ~$5.00 for 10-survey org

User opens Crystal on topic page
  → Crystal knows scope = topic, survey = X
  → System prompt pre-loaded with topic signals for that topic
  → First message costs: ~$0.15 (no tool calls needed for initial context)
```
