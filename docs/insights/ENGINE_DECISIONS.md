# Experient AI Insights — Engine Decisions

> The opinionated choices that make Experient simpler than every competitor while delivering more value. This document is the **decision log**, not a description of options. Each decision is followed by what we are explicitly *not* building, because the discipline of refusal is what produces simplicity. Synthesized from [RESEARCH.md](RESEARCH.md), [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md), and [ARCHITECTURE.md](ARCHITECTURE.md). Where those documents describe what's possible, this one describes what we are *committing* to.

---

## 1. The simplicity contract

> **Every feature in the insight engine must pass two tests: (1) Can a non-analyst use it correctly within 30 seconds of seeing it? (2) Would deleting it make the product measurably worse for >20% of users? If the answer to (1) is "no" and the answer to (2) is "no," we cut it.**

This is the single rule that produces simplicity. Most legacy XM platforms violate (1) on every page and (2) on most features. Their problem isn't a lack of capability — it's that capability has been allowed to accumulate without curation. We win by curating ruthlessly.

The decisions below are the curation.

---

## 2. The eight decisions that define the engine

### Decision 1 — Adaptive taxonomy. Always. No exceptions.

**What we do:** Topics emerge from response embeddings via HDBSCAN clustering. The LLM labels them. The user can rename or merge clusters inline. New responses re-cluster automatically.

**What we explicitly do NOT build:**
- A taxonomy editor with drag-and-drop hierarchy
- Industry-specific topic templates ("Hospitality has these 47 topics, Retail has these 32...")
- A "topic library" or "category management" page
- Per-org custom tagging trees that need maintenance
- "Topic rules" — if-text-contains-X-then-tag-Y systems

**Why:** Manual taxonomies are the #1 maintenance burden in legacy XM (a Qualtrics customer described their taxonomy as "the worst part of my job"). Every taxonomy-edit feature looks productive in a demo and is a tax in production. **Our taxonomy is the embedding space; clustering is the discovery; the LLM is the labeler.**

**Tradeoff we accept:** A few enterprise customers will demand fixed industry taxonomies. We say no, and lose those deals. The simplicity premium is worth more than those logos.

---

### Decision 2 — Insight cards are the primary unit. Dashboards are secondary.

**What we do:** The unit of value we ship is the [`Insight` object from INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md). Every page renders cards. Charts are subordinate — they appear inside cards as context, not as standalone "what does this mean?" puzzles.

**What we explicitly do NOT build:**
- A dashboard builder
- A widget marketplace
- A "Custom Report" creator with 47 chart types
- A drag-and-drop layout editor
- Layout templates ("Choose your dashboard style: Executive / Analyst / Manager / ...")
- A "save view" feature for layouts

**Why:** Qualtrics, Medallia, and InMoment all spent ~15 years building dashboard builders. The result is that 80% of their UI surface is layout configuration that nobody uses correctly. Cards force us to surface the *conclusion* before the visualization. The conclusion is the product.

**Tradeoff we accept:** Power users who want a beautifully curated dashboard for their CXO won't get one. They get a stack of high-confidence cards that say what's true. That's a feature, not a limitation.

---

### Decision 3 — One pipeline. Three speeds. Same code.

**What we do:** A single [LangGraph DAG (see ARCHITECTURE.md §4)](ARCHITECTURE.md) runs in three modes:

- **Live** (sub-second per response): embed + emotion + ABSA + atomic metric update. Streamed to UI.
- **Incremental** (30–60s batch window): updates topics + drivers + trends if changes are material.
- **Full** (1–5min, scheduled): full DAG including predictions and prescriptive actions.

All three modes invoke the **same tools** with **the same data model**. The difference is what nodes execute and how often.

**What we explicitly do NOT build:**
- A separate "real-time engine" and "batch engine" with different schemas
- A "Lambda architecture" with reconciliation jobs
- Two codepaths for "online" and "offline" insights
- Per-tier feature gating ("real-time is enterprise only" — same code, just throttled)

**Why:** Two pipelines means double the bugs and quadruple the operational complexity. Legacy XM has this problem: their batch ML pipeline and their real-time signal layer disagree, requiring a reconciliation team. We avoid it by design.

**Tradeoff we accept:** Live mode does less work than Full mode. A user who wants "L4 prescriptive in real-time" doesn't get it — they get L4 within 5 minutes. This is fine: prescriptive actions don't need sub-second latency to be useful.

---

### Decision 4 — LLM narrates. Code computes. No exceptions, ever.

**What we do:** Every number on screen comes from deterministic Python. NPS, CSAT, CES, driver importance, confidence intervals, forecasts, anomaly thresholds — **all computed by the analytics tools layer**, passed to the LLM as inputs. The LLM's only job is to write prose that connects them.

**What we explicitly do NOT build:**
- "Ask the LLM to compute the average" anywhere in the codepath
- LLM-generated SQL that runs against the warehouse (no text-to-SQL agent)
- "Smart math" features where the LLM decides which formula to apply
- Hybrid prompts that mix "explain this finding" with "now compute the variance"

**Why:** LLMs are unreliable at arithmetic, sample-size discipline, CI calculations, and statistical interpretation. Letting them do math is the #1 source of "AI insights I can't trust" in every competitor and every demo. We are publicly inviolable on this: **the LLM never sees a number it didn't receive as an input.**

**Tradeoff we accept:** We can't promise "the AI can analyze anything." We promise "the AI explains what the analytics engine found." That's a more modest claim and a more durable one.

---

### Decision 5 — Two citations or no claim. The validator is law.

**What we do:** Every narrative sentence containing a factual claim must end with `[rXXX, rYYY]` referencing real response IDs. The validator strips any sentence that doesn't comply. The verifier model double-checks that cited responses actually support the claim. Both passes are mandatory.

**What we explicitly do NOT build:**
- A "summary mode" without citations for "casual users"
- A "preview mode" that skips validation for speed
- A configurable trust threshold per org ("our customers don't care about citations, can we turn it off?")
- Citations as a hover-only progressive disclosure (they are always visible on cards)

**Why:** Citation discipline is our deepest moat. Every minute we relax it, we become slightly less differentiated. The Qualtrics/Medallia/InMoment generative features all hallucinate; we won't, *by construction*. This is not a feature, it's an architectural property.

**Tradeoff we accept:** Edge cases where an insight is statistically valid but quote-poor (e.g., a numeric anomaly with no associated text) will be rendered as a metric-only card without the narrative paragraph. We don't fake citations to fill the visual.

---

### Decision 6 — Pgvector is the database. Stop choosing.

**What we do:** Embeddings live in Postgres via pgvector. Period. One database, one query language, one operational story, one backup strategy, one set of access controls.

**What we explicitly do NOT build:**
- A vector store abstraction layer ("pluggable vector backend")
- Pinecone / Weaviate / Qdrant integrations as options
- A "your data, your warehouse" feature for enterprise (BYO Snowflake / BigQuery)
- Separate hot/cold tiers for embeddings (until we hit 500M+ vectors per region)

**Why:** Every vector store we don't integrate is a runbook we don't write, a failure mode we don't have, and an integration test we don't maintain. Pgvector scales to ~10M vectors per index on commodity hardware; HNSW upgrade path covers another 10×; partitioning covers another 10×. **We are good through ~$50M ARR before we revisit.**

**Tradeoff we accept:** A handful of enterprise customers with petabyte data lakes will demand BYO vector store. We say "we'll get there, here's our roadmap." They wait or they don't buy. Either way we don't fork the codebase.

---

### Decision 7 — Gemini Flash 2.0 is the default model. One choice.

**What we do:** All LLM calls default to Gemini Flash 2.0 via OpenRouter. Enterprise tier optionally routes the narrate + verify nodes to Claude Haiku 4.5 for prose quality. Embeddings are Gemini's `gemini-embedding-001` (or text-embedding-3-large; we pick one and lock it).

**What we explicitly do NOT build:**
- A "choose your model" picker for end users
- Per-question model selection in the survey builder
- A "bring your own API key" feature (security and accounting nightmare)
- Custom fine-tuning per org (until at least year 3)
- A "we'll route to the best model" abstraction that obscures what's running

**Why:** Model choice is a tax on every PM specification, every test, every customer-support ticket. It's also a false signal of capability — users imagine bigger model = better insights, which is not generally true at our task profile (structured extraction + grounded narration). Locking the model means we tune prompts once, benchmark once, version once.

**Tradeoff we accept:** When a smarter model launches, we lag behind whoever shipped a model picker. Counter-claim: we ship a tighter, better-tested product on one model than they ship across five.

---

### Decision 8 — No SQL. No formulas. No code mode. Ever.

**What we do:** All analysis happens through fixed tools (`compute_kda`, `run_absa`, `detect_anomaly`, `retrieve_quotes`, etc.). The Cmd+K NLQ surface lets users *ask* anything in plain English; the agent picks tools and answers with citations. There is no SQL editor, no formula builder, no expression language.

**What we explicitly do NOT build:**
- A SQL console for "power users"
- A spreadsheet-style formula language
- A "scripting" surface (custom Python / R hooks)
- "Calculated metrics" / "derived fields" / "computed columns"
- A "query builder" with joins and filters

**Why:** Once you ship a query language, you own bug reports for every misuse. You ship documentation, tutorials, certifications, partner programs. **Half of Qualtrics' implementation services revenue exists because their query language is too powerful to use safely.** We refuse to enter this market. NLQ + tools is the surface; if a question can't be answered, we add a tool, not a syntax.

**Tradeoff we accept:** An analyst who wants to do a one-off bespoke join across surveys + responses + segments will hit a wall. They export to CSV. We are explicit about this; we are not a BI tool.

---

## 3. The "no" budget

Simplicity is not maintained by writing what we won't build once. It must be re-asserted every quarter against incoming pressure. The following are the **standing refusals** the product team commits to, updated with each release planning cycle:

| Standing refusal | Renewed reason |
|---|---|
| No dashboard builder | Cards are the unit |
| No taxonomy editor | Embeddings are the taxonomy |
| No SQL / formula / scripting | NLQ + tools is the surface |
| No model picker | One model, well-tuned |
| No widget marketplace | Marketplace = configuration tax |
| No theme builder beyond brand colors | Brand consistency by default |
| No PDF report designer | Generate report = one button, audience-tuned |
| No A/B testing of insights themselves | Insights are facts, not variants |
| No multi-step "data preparation" UI | Clean ingest is the API's job |
| No per-question custom display logic for charts | Charts are subordinate to cards |
| No "advanced settings" tab anywhere | Defaults are the product |

Each refusal is reviewed quarterly. To break a refusal requires PM + Eng + Founder sign-off and a written 2-page rationale. **The friction to add complexity must exceed the friction to ship a simpler alternative.**

---

## 4. The simplicity moves the user actually sees

Internal discipline produces external simplicity. Concretely:

### 4.1 First-run experience

1. User signs up. Zero configuration.
2. Choose a template (or describe a goal in plain English; the agent generates the survey).
3. Publish. Get the share link.
4. Send to respondents (any channel — link works everywhere).
5. **At response #5, the Insight page lights up.** Confidence labeled "Exploratory" until threshold.
6. **At response #30, full L1+L2 insights stream in.** No setup, no taxonomy decisions, no panel configuration.
7. **At response #200, predictive forecasts and trend lines appear.** No model training, no feature engineering.

There is no step where the user has to "configure analytics." There is no "Setup Wizard." There is no "First, define your topic taxonomy." There is the survey, the responses, and the insights.

### 4.2 The page surfaces

Three views, total. (See [UX.md §2](UX.md))

- **Dashboard** — the headline (top KPIs + top 8 priority cards)
- **Explore** — faceted browsing
- **Voice** — the qualitative corpus

That's it. There is no fourth view we are tempted to add. (Trends is conditional and embedded within Explore; it's not a peer view.)

### 4.3 The actions the user can take on any insight

Four. (See [UX.md §3.4](UX.md))

- Open quotes drawer
- Open "Why this insight?" drawer
- Convert to action (workflow / ticket)
- Pin / dismiss / thumb / share

No bulk-edit, no tag, no annotate, no comment thread, no "send to colleague for review," no "schedule revisit." Those things either compose from existing primitives (Slack share = "send to colleague") or they don't pull weight.

### 4.4 The configuration surface

The only org-level settings that affect insights:

- Brand colors / logo (already in BrandSettings)
- Primary locale
- Data residency region
- Sample-size minimum (default 30, configurable down to 10 for fast-moving teams or up to 100 for high-stakes use)
- Confidence threshold (default 60, used to demote to "Exploratory" label)
- Recommended action target system (Linear / Jira / GitHub / none)

Six settings. The rest is convention.

---

## 5. The value-per-dollar math, in one paragraph

The user pays for credits. A credit buys a deterministic unit of insight (see [INSIGHT_TAXONOMY.md §3](INSIGHT_TAXONOMY.md) and [MARKETING.md §6.2](MARKETING.md)). At Gemini Flash 2.0 token economics (~$0.075 / 1M input, $0.30 / 1M output), a full insight regenerate over 500 responses runs ~50K output tokens of LLM time and embedding amortization, **costing us under $0.02 in compute**. We sell the same as ~200 credits. The Pro tier is $199/mo for 10K credits — 50× a typical month's actual usage, so we are buying optionality and storage, not capacity. **Qualtrics charges $5/response with a 10,000-response annual floor — $50,000 baseline.** Our **gross margin at Pro is >85% before any infrastructure savings from scale**. The cheapness is not a loss leader. It is a structural advantage of running on commodity LLM APIs against competitors who maintain Clarabridge/Lexalytics ML stacks plus services orgs.

See [OPERATIONS_ECONOMICS.md](OPERATIONS_ECONOMICS.md) for the full math.

---

## 6. The capability-per-dollar moves

Where we add value that competitors don't, while staying cheaper:

| Capability | Experient | Qualtrics | Medallia | Net |
|---|---|---|---|---|
| **Citations on every claim** | Default, always-visible | No | No | We win on trust |
| **Confidence interval on every metric** | Default, always-visible | Power-user mode | Power-user mode | We win on rigor |
| **"Why this insight?" audit drawer** | Default on every card | No equivalent | No equivalent | We win on debuggability |
| **NLQ with citations** | Cmd+K, anywhere | "Ask Qualtrics" beta | Ask Athena | Comparable; we win on transparency |
| **Adaptive topic taxonomy** | Default, no setup | Manual + AI suggestions | Manual + AI labels | We win on ops cost |
| **Streaming insight generation** | Default | Batch refresh | Batch refresh | We win on UX |
| **MCP skills (callable from agents)** | Default | No | No | Category of one |
| **Public per-credit pricing** | Yes | No | No | We win on procurement velocity |
| **First insight in 60s** | Yes | Weeks | Weeks | We win on time-to-value |
| **Per-org spend cap** | Default | No | No | We win on cost predictability |
| **Reproducible insight hash** | Default | No | No | We win on compliance |
| **60+ languages, day one** | LLM-native | 23 NLP languages | Opaque | We win on coverage |
| **Vertical depth (healthcare patient-experience tooling)** | No (v1) | Yes (post-PG) | Partial | They win, we cede |
| **Voice/video analysis** | No (v1) | Yes | Yes | They win, we cede until v2 |
| **30+ social/review-site connectors** | No (v1) | Yes | Yes | They win, we cede |
| **Contact-center voice transcription** | No | Yes | Yes (Medallia Speech) | They win, we cede |

**Read:** We win on 11 dimensions that matter for 90% of users. We cede 4 dimensions that matter for niche enterprise verticals. The trade is unambiguously good for our ICP.

---

## 7. How the engine actually produces an insight, end to end

Walking through the lifecycle of one customer response, the way a new engineer should understand it:

1. **Submission.** Public endpoint `POST /api/surveys/:id/responses` accepts the response. Validation, rate limit, idempotency key. Row inserted into `responses`. (Already implemented.)
2. **Trigger.** Postgres `AFTER INSERT` trigger pushes a job onto Redis: `{org_id, survey_id, response_id, trigger: "new_response"}`.
3. **Live pass (sub-second).** A worker pulls the job. It:
   - Embeds the open-text answer via Gemini embedding-001
   - Computes per-response emotion (GoEmotions, prompted) and ABSA aspects
   - Inserts into `response_embeddings`
   - Updates the rolling NPS/CSAT counters (`UPDATE ... SET nps_promoter_count = ... WHERE survey_id = ?`)
   - Emits SSE event to any connected client: `metric.updated`
4. **Incremental tick (every 30s, idempotent).** A scheduler runs the partial DAG:
   - Re-clusters topics *only if* new embeddings ≥ 10% of corpus or far from existing centroids
   - Re-runs Shapley KDA *only if* a sufficient new-response volume
   - Re-runs Prophet anomaly check on rolling window
   - For each material change: generates one or more new `Insight` rows
   - Each `Insight` goes through narrate → cite-validate → verifier → upsert. Old insights are superseded, not deleted.
5. **Full tick (hourly free, every 5min paid, real-time enterprise).** Same DAG with all nodes enabled, including predictive and prescriptive. Insight rows tagged with new `run_id`.
6. **User opens Insights page.** SSE stream attaches; cards stream in by priority.
7. **User clicks "Why this insight?"** Drawer fetches `insight_audit_log`, renders prompt + citations + verifier output.
8. **User clicks "Create ticket."** Workflow engine creates Linear/Jira ticket from `recommended_action.json`, with quote citations in the issue body.
9. **User pins, dismisses, thumbs-up.** `user_state_json` updates; priority feed re-ranks.

**The full pipeline is one file (`agents/graphs/insights.py`), one schema (the `Insight` row), one API (`/api/insights/*`), and one UI primitive (the card).** There is no separate "real-time service," no "batch analyzer," no "report builder." That's the simplicity.

---

## 8. The decision the user will never make

The user never decides:
- Which model to use
- Which embedding model
- Which clustering algorithm
- How many topics to extract
- Confidence threshold (default works for 95%)
- Which KDA method (Shapley always)
- Time window for trend computation
- Which segments to compare
- Whether to use real-time or batch
- Output language (auto-detected from org locale)
- Whether to cite quotes (always yes)
- Whether to apply verifier (always yes)
- Whether to apply bias audit (always yes)

The user *does* decide:
- What survey to send
- What template to start from
- Who gets it
- Which insight to act on

That's the asymmetric simplicity we promise: **users decide what matters; the engine decides how to find it.**

---

## 9. What "more value than competitors" actually means

If we are simpler, cheaper, and ship in 60 seconds, the natural question is: *don't we therefore deliver less?* The answer is no, for four structural reasons:

### 9.1 Modern LLMs cover the long tail competitors built per-language ML for

Legacy XM platforms spent a decade training per-language sentiment, emotion, and topic models. Lexalytics covers 31 languages; Clarabridge ~23; Medallia bespoke. Their cost basis includes maintaining those models. **We use multilingual LLMs that natively cover 60+ languages with no per-language pipeline, often outperforming the legacy models on long-tail languages.** The "less" we deliver in per-language tuning is more than compensated by breadth.

### 9.2 Citations + CIs > more chart types

The legacy stack adds value by giving you more chart types. We add value by making each chart trustworthy. **A single cited, CI-bracketed insight is worth ten dashboards of uncalibrated bar graphs.** Procurement and CX leaders increasingly understand this; we are riding a wave, not creating one.

### 9.3 Adaptive taxonomy > deeper industry templates

Legacy stacks ship "Hospitality has these 47 standard topics, Healthcare has these 32." We ship "your taxonomy emerges from your actual responses." For mature large enterprises with established taxonomies, theirs is better. For everyone else — *which is who buys our product* — ours is dramatically better because it adapts to their language without setup.

### 9.4 Agentic distribution > more integrations

Legacy XM has 100+ connectors (Salesforce, Zendesk, Microsoft Dynamics, etc.) maintained by partner orgs. We have 5 MCP skills callable from any AI agent. **Their integrations are point-to-point; ours composes with whatever an AI agent can already call.** As AI agents become the integration layer, our 5 beats their 100.

---

## 10. The two things we must not get wrong

If everything else is right and these two are wrong, the engine fails:

### 10.1 Citation validity at scale

If our citation rate (citations resolve to real, supportive quotes) drops below 99.5%, the trust narrative collapses. Architecturally we have the validator + verifier; operationally we need:
- Daily integration test: feed a fixed corpus, check citations against ground truth
- Per-deploy regression: any prompt change re-runs the citation rate benchmark
- Alert at <99% sustained 15 min → page on-call

This is not negotiable. **A single high-profile hallucination in front of a Qualtrics customer would set us back six months.**

### 10.2 Sample-size discipline

If we surface "the top driver is X" with n=12, and a customer makes a real decision off it, we deserve the blowback. Our refusal to show small-sample insights — labeling them "Exploratory" or hiding them — is the second pillar of trust. **Every PR that touches insight generation must include the sample-size guard in its tests.**

These two — citation validity and sample-size discipline — are the engine's load-bearing properties. Everything else is decoration.

---

## 11. Roadmap implications

Re-stating Phase 2 of `docs/TRACKER.md` against this decision document:

| Sprint | Old framing | New framing (this doc) |
|---|---|---|
| 4 | Model strategy | Pick Gemini Flash 2.0 (decision 7), lock prompts, build cache layer |
| 5 | Predictive intelligence | Build Prophet + Shapley + uplift tools; insights stream as they emerge |
| 6 | NLQ interface | Cmd+K with tool-using agent over fixed analytics tools |
| 7 | Smart collection / adaptive surveys | Branching logic; **not** "AI decides which question to ask next" (that's a future bet, not v1) |

Sprint 4 should also include: pgvector setup (decision 6), embedding pipeline (decision 4), citation validator + verifier (decision 5). These are the foundations everything else stands on.

---

## 12. The closing test

When we ship this engine, the test of whether we executed correctly is whether a CX leader at a 200-person SaaS company can:

1. Sign up
2. Create an NPS survey
3. Send to 200 customers
4. Receive 100 responses
5. Get actionable, cited insights
6. Convert one into a Linear ticket

…in **under 60 minutes total**, **without contacting support, reading docs, or watching a tutorial**, and **without ever seeing a setting called "advanced."**

If that user journey works, we won. If it doesn't, no amount of feature-checklist competition with Qualtrics matters.
