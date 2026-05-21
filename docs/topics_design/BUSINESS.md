# Deep Topic Intelligence — Business Case

## Executive Summary

Experient's Deep Topic Intelligence feature transforms raw survey responses into a structured, prioritized, time-tracked theme registry. It eliminates the manual analyst work required to extract actionable signal from open-text feedback, replaces static word-frequency reports with live health labels and trend trajectories, and gives every team a shared, real-time view of what customers are saying and whether it's getting better or worse.

This document covers the value proposition, target buyer, competitive differentiation, pricing positioning, and success metrics.

---

## The Problem We Solve

### Qualitative feedback is high-value and high-cost

Organizations spend significant budget on surveys, yet the open-text fields — the richest source of customer signal — are consistently underanalyzed. The barriers are cost and time:

- Manual theme analysis on 500 open-text responses takes a trained analyst 4–8 hours.
- By the time the themes are coded and reviewed, the moment to act has often passed.
- Theme coding is subjective — two analysts on the same dataset produce different outputs.
- Historical tracking ("has this theme gotten worse since Q3?") requires consistent coding across time, which almost no team does reliably.

The result: organizations have feedback they can't use at the speed their decisions require.

### Existing solutions don't close the gap

**Enterprise XM platforms (Qualtrics, Medallia)** offer text analytics, but they are:
- Expensive (text analytics is typically a premium add-on)
- Slow to configure (taxonomy management, training classifiers)
- Built around fixed taxonomies that don't adapt to emerging themes
- Inaccessible to SMB and mid-market buyers

**BI tools and NLP libraries** require engineering investment and don't produce business-ready outputs.

**GPT-based ad-hoc analysis** is fast but produces inconsistent, non-comparable results across runs and doesn't track over time.

---

## What We Built

### Automatic, persistent, incrementally-updated topic registry

Every response that comes in is:
1. Embedded into semantic space (OpenAI text-embedding-3-small)
2. Matched to the nearest existing topic centroid, or buffered as a candidate for new topic formation
3. Added to the topic's running statistics — volume, sentiment, NPS alignment, emotion distribution

Topic centroids are updated using Welford's online mean — each new batch refines the centroid without re-processing the entire history. The system is O(k) per new response where k is the number of existing topics.

### Health labels for instant orientation

Every topic is classified weekly:
- **Emerging** — first seen this week
- **Growing** — response volume up >25% week-over-week
- **Worsening** — sentiment dropped >0.15 points, volume stable
- **Fading** — response volume down >30% week-over-week
- **Stable** — no significant change

This replaces the analyst question "what should I look at?" with a single label visible in the UI.

### XM Signal Fingerprint

Each topic carries a full signal profile updated on every pipeline run:
- NPS impact and CSAT impact scores
- Point-biserial driver score (correlation with low overall scores)
- Emotion distribution across Plutchik's 8 primary emotions
- Composite urgency score: `|sentiment| × √volume × (effort/7) × trend_multiplier`
- Negative run streak (number of consecutive runs with negative sentiment) and `chronic` flag
- Top verbatims: curated representative quotes

---

## Target Buyer

### Primary: Mid-market CX / Insights teams (50–2000 person orgs)

These teams:
- Run NPS, CSAT, or employee engagement surveys regularly (monthly or quarterly)
- Have 1–3 analysts who currently do manual theme analysis
- Cannot justify enterprise XM platform pricing for text analytics add-ons
- Need insights on a business timeline (days, not months)

**Job titles**: VP Customer Experience, Director of Customer Insights, Head of Research, Customer Success Operations Lead

**Pain**: Their survey data is sitting in a dashboard they trust but the open-text is a spreadsheet download that someone eventually reads once a quarter.

### Secondary: Product-led growth companies

These companies:
- Collect in-app NPS and CSAT with a high volume of responses
- Need to close the loop between qualitative feedback and product prioritization
- Have a PM or growth analyst who manages customer feedback but is not a data scientist

**Pain**: They're drowning in NPS responses but have no systematic way to connect verbatim themes to product decisions.

### Tertiary: HR / People Analytics teams

Employee engagement surveys produce qualitatively identical data to customer surveys. The same topic pipeline works for employee feedback, eNPS, and exit interview analysis.

---

## Competitive Differentiation

| Capability | Qualtrics Text iQ | Medallia | Experient |
|---|---|---|---|
| Automatic topic discovery (no taxonomy needed) | Partial (requires training) | No | Yes |
| Incremental updates (new responses, no re-run) | No | No | Yes |
| Health labels (emerging/growing/worsening/fading) | No | No | Yes |
| Composite urgency scoring | No | No | Yes |
| Emotion distribution (Plutchik model) | No | No | Yes |
| Driver score (NPS/CSAT correlation per topic) | Add-on | Add-on | Included |
| Weekly trend windows with WoW delta | No | No | Yes |
| Chronic flag (3+ consecutive negative runs) | No | No | Yes |
| Price | $25K–$150K/yr | $50K–$250K/yr | TBD (see below) |

---

## Pricing Positioning

### Recommended structure: Per-seat SaaS with response volume tiers

**Core tier** (Insights dashboard, basic topic clustering, health labels):
- $299/month for up to 5 seats and 10,000 responses/month
- Targets SMB and early growth stage

**Growth tier** (Full XM signal fingerprint, driver scores, emotion distribution, trend windows):
- $799/month for up to 15 seats and 50,000 responses/month
- Targets mid-market CX and research teams

**Enterprise tier** (Unlimited seats, custom volume, SSO, audit log, SLA):
- Custom pricing, typically $2K–$8K/month
- Targets enterprise buyers replacing Qualtrics text analytics add-on

### Value justification

A mid-market company with a 2-person insights team currently spends approximately:
- 8 hours/analyst/week on manual theme coding = 16 analyst-hours/week
- At $80/hour fully-loaded cost = $1,280/week, ~$5,500/month

Experient's Growth tier at $799/month replaces that work and produces higher-quality, more consistent, faster output. The ROI payback is under 3 weeks.

---

## Go-to-Market Strategy

### Phase 1: Land with surveys, expand with intelligence

Initial acquisition through the survey creation product (lower friction). Convert survey users to Insights customers when they first encounter the "export to spreadsheet" ceiling — typically after their first NPS run with >200 responses.

In-product conversion trigger: surface the topic analysis preview after the first batch of responses with open-text answers. Show the first 5 topics, blur the detail, offer a trial.

### Phase 2: Vertical expansion

**Customer Success platforms**: Partner integrations (HubSpot, Intercom, Zendesk) that push support ticket text into Experient and surface worsening topics to CSMs before renewal calls.

**HR platforms**: Target HR teams running engagement surveys. Similar data structure, different buyer, minimal pipeline change.

### Phase 3: API and data product

Expose the topic registry and XM signal fingerprint via API. Target companies that want to embed experience intelligence in their own internal dashboards or CRM data models.

---

## Success Metrics

### Product metrics (leading indicators)
- % of survey owners who view the topics dashboard after first analysis run
- Topics-to-action rate: % of worsening/chronic topics that generate a downstream action (CoPilot recommendation accepted, ticket created, etc.)
- Weekly active usage on topics tab vs. insights tab (topics is stickier — we expect >60% WAU for accounts that have data)

### Business metrics (lagging indicators)
- Net revenue retention: accounts using Deep Topic Intelligence should have higher NRR than those using only survey creation
- Time-to-insight: surveyed metric in onboarding; target <24 hours from survey close to actionable topic report
- Expansion revenue from Insights tier upgrades

### Competitive metrics
- Win rate in deals where Qualtrics iQ or Medallia is the alternative (target: >40%)
- Feature citation rate in sales calls ("topic health labels" mentioned by prospect as differentiator)

---

## Risk and Mitigation

### LLM quality and consistency
Risk: Topic names and summaries vary run-to-run if the LLM prompt is not stable.
Mitigation: Incremental clustering maintains centroid identity across runs. The LLM only names new topics. Topic names are canonicalized against existing names before creation.

### Embedding API dependency
Risk: OpenAI text-embedding-3-small API becomes unavailable or pricing increases.
Mitigation: Bag-of-words fallback implemented for local dev and degraded-mode operation. Embeddings are cached in the DB — only new responses incur API cost.

### Data volume and latency
Risk: Large enterprises with >100K responses/month generate pipeline runs that are too slow.
Mitigation: Incremental clustering processes only new responses per run. For a survey with 100 existing topics and 500 new responses, pipeline cost is O(500) ANN lookups, not O(100,000). This is the core architectural advantage over batch re-clustering systems.

### Privacy and data residency
Risk: Enterprise buyers have strict requirements about where response text is stored and processed.
Mitigation: Embeddings are computed in our cloud (OCI/GCP) and stored in a dedicated Postgres instance. Raw response text never leaves the customer's data region after the embedding step. Enterprise tier supports private deployment.
