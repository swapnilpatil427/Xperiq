# Experient AI Insights — UX & Interaction Design

> The Insight page is the moment of truth for the entire product. Built for the [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md) contract, against the trust-by-default principle in [RESEARCH.md](RESEARCH.md), powered by the streaming pipeline in [ARCHITECTURE.md](ARCHITECTURE.md).
>
> **Supersedes** the existing mocks at `Designs/experient_ai_insights_dashboard/`, `Designs/advanced_ai_insights_dashboard/`, `Designs/experient_advanced_insights/`, and `Designs/insights_actions_workflows/`. The visual language from those mocks may be reused; the *functional* design here is the new contract.

---

## 1. UX principles

These come first and override every layout decision below.

1. **Streaming, never blocking.** The user never sees a full-page spinner. Insights stream in as the DAG produces them.
2. **Trust is visible, always.** Confidence chip, sample size, citation count are first-class — not hover-only.
3. **Sources are one click away.** Every claim is a hyperlink to the verbatims that support it.
4. **The number always carries its uncertainty.** Never show a metric without its CI bar or "n=…" label.
5. **The action is the headline.** L4 prescriptive insights are visually distinct (CTA-styled card) and prominent.
6. **Conversation is the right default.** Cmd+K is always available; the user can ask "why is NPS down?" anywhere on the page.
7. **Mobile-first for monitoring, desktop-first for analysis.** Dashboard view degrades gracefully; deep drill-down assumes desktop.
8. **No empty states without an action.** "Not enough data yet" includes a CTA to collect more.
9. **Reproducibility is a feature.** "Why this insight?" drawer exposes the audit trail for any user.
10. **Plain language.** Avoid statistical jargon in primary copy; jargon is fine inside the "Why this insight?" drawer.

---

## 2. Information architecture

The Insight page has **three top-level views** plus a global chat layer.

```
/surveys/:id/insights
├── Dashboard view       (default — KPI summary + top priority insights)
├── Explore view         (faceted browsing of all insights, filterable)
├── Voice view           (the open-text corpus: topics, themes, emotion, ABSA, quotes)
└── (Cmd+K global)        Ask Crystal — NLQ overlay (Crystal is Experient Copilot)
```

Optional fourth view, accessible via tab if survey has multiple time-points:

```
└── Trends view          (time-series for NPS/CSAT/topics/sentiment with anomaly markers)
```

### Why three views?

User research from competitor reviews (see [COMPETITIVE.md](COMPETITIVE.md)) consistently identifies two failure modes:

1. **"Too many dashboards, no answers"** — Qualtrics/Medallia: every tab is a chart-builder that requires expertise
2. **"Single magic page that hides everything"** — pure-AI tools: a single summary card that's beautiful and useless

We split the difference: **Dashboard** = headline (action-led), **Explore** = controlled drill-down, **Voice** = the qualitative corpus that 80% of XM users actually want.

---

## 3. Dashboard view (the landing)

The page a user lands on when they click "Insights" for a survey.

### 3.1 Layout

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ← Survey title                                                  [⌘K]  [···]   │
│                                                                                │
│ ┌──────────────┬──────────────┬──────────────┬──────────────────────────────┐  │
│ │ NPS 47       │ CSAT 4.2/5   │ Responses    │ "Email verification loop"    │  │
│ │ ±5 · n=312   │ ±0.2 · n=312 │ 312 / 500    │ raises NPS +3.2 if fixed    │  │
│ │ ▔▔▔▁▁▁▔▔     │ ▔▔▔▔▔▁▔▔     │ 62% · 4d left│ Confidence 81% · 24 quotes  │  │
│ └──────────────┴──────────────┴──────────────┴──────────────────────────────┘  │
│   Descriptive (L1)               Lifecycle              Prescriptive (L4)      │
│                                                                                │
│ ─── TOP PRIORITIES ────────────────────────────────────────────  Sort: Priority│
│                                                                                │
│ ┌─────────────────────────────────────────────────────────────────────────────┐│
│ │ 🔥 DRIVER                                              Confidence 89  ⤴︎ +12 ││
│ │                                                                             ││
│ │ "Support response time" is the #1 driver of NPS                            ││
│ │ — its importance jumped from 4th to 1st over 30 days.                      ││
│ │                                                                             ││
│ │ Impact 0.31 [0.24–0.38 95% CI]   n=189   🔗 8 quotes   Why this? ›         ││
│ │                                                                             ││
│ │ [ View quotes ]  [ Create workflow ]  [ 👍 👎 ]  [ Pin ]                     ││
│ └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                │
│ ┌─────────────────────────────────────────────────────────────────────────────┐│
│ │ 💬 VOICE — TOPIC                                       Confidence 76        ││
│ │                                                                             ││
│ │ "Email verification loop" is the top friction phrase among detractors      ││
│ │ — cited 24 times across 18 respondents.                                    ││
│ │                                                                             ││
│ │ Dominant emotion: frustration (62%)                                         ││
│ │ Aspect sentiment: 92% negative   n=18   🔗 24 quotes                       ││
│ │                                                                             ││
│ │ Sample quote:  "I spent 15 minutes in the verification loop"  ↗            ││
│ │                                                                             ││
│ │ [ View all 24 quotes ]  [ Create Linear ticket ]  [ 👍 👎 ]                  ││
│ └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                │
│ ┌─────────────────────────────────────────────────────────────────────────────┐│
│ │ ⚠️ ANOMALY                                              Confidence 92       ││
│ │                                                                             ││
│ │ NPS dropped 12 points on May 10                                            ││
│ │ outside the 95% prediction interval.                                       ││
│ │ Likely linked to: a spike of 'login error' mentions in same 24h window.    ││
│ │                                                                             ││
│ │ [ View the 14 responses ]   [ Why this anomaly? › ]                          ││
│ └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                │
│ + 5 more · See all                                                             │
│                                                                                │
│ ── Live: 3 insights generated in last 60s ──────  Last full scan: 2m ago  ↻    │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 KPI row (top of page)

- **Three or four KPI tiles**, depending on survey template
- Each tile carries: name, value, **CI bar** (visual not just text), sample size, sparkline of last 30 days, and a layer label (L1/L4 etc.)
- Tiles with `below_minimum_sample === true` are dimmed and labeled "Need ≥30 responses"
- The fourth tile, when shown, is a **rotating Top Action** — the highest-priority L4 insight rendered as a CTA tile

### 3.3 Priority feed

- The Top Priorities feed is **streaming** — cards animate in as the DAG emits them
- Sort: default `priority`, alternatives `recency`, `confidence`, `severity`, `layer`
- Filter chips at the top: All • Action needed • Drivers • Voice • Anomalies • Predictions
- Below the fold: "+ N more" expands to the full list (Explore view jump if >12)

### 3.4 Card anatomy (the most important UI primitive)

```
┌─────────────────────────────────────────────────────────────────────┐
│ <icon> <CATEGORY LABEL>                  Confidence XX  <trend>     │   ← header strip
│                                                                     │
│ <Headline — ≤120 chars, plain English, bold>                        │   ← claim
│ <Narrative — 1–4 sentences with [quote markers] inline>             │
│                                                                     │
│ <Metric line — value [CI low–high CI%]   n=NN   🔗 X quotes  Why?›  │   ← grounding
│                                                                     │
│ [ Primary action ]  [ Secondary action ]  [ 👍 ] [ 👎 ] [ Pin ] [···]│   ← actions
└─────────────────────────────────────────────────────────────────────┘
```

**Rules:**

- Header strip color signals layer: blue=descriptive, purple=diagnostic, amber=predictive, green=prescriptive
- "Confidence XX" chip color follows §8 of [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md): green ≥80, yellow 60–79, grey <60 (labeled "Exploratory")
- Below-threshold (`below_minimum_sample`) insights have a 4th color: grey diagonal stripes background + "Exploratory finding" label
- The `[quote markers]` in narrative are inline chips — clicking opens the quote in a side drawer (not navigating away)
- Primary action is **category-specific**: "View quotes" for voice, "Create workflow" for action, "View trend" for trend, etc.

---

## 4. The "Why this insight?" drawer

The single most differentiating UI element in the product. Opens as a right-side drawer (or full sheet on mobile).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Why this insight?                                                  [✕]   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Confidence  ████████████████░░░░  81 / 100                             │
│                                                                          │
│   Statistical    93/100   n=189, CI width 0.14 (target 0.20)             │
│   Coverage       88/100   162 of 184 relevant responses considered        │
│   Consistency    75/100   3 of 3 LLM samples produced this claim         │
│   Grounding      68/100   8 citations, avg relevance 0.82                │
│                                                                          │
│ ─── Method ───────────────────────────────────────────────────────────── │
│                                                                          │
│   Shapley regression with 1,000 bootstrap samples                        │
│   Predictors: 7 closed-question items + 4 voice topics                   │
│   Target: NPS (0–10)                                                     │
│   Time window: last 30 days                                              │
│                                                                          │
│ ─── Cited responses ─────────────────────────────────────────────────── │
│                                                                          │
│   [r1234]  "Support took 3 days to even acknowledge my ticket."           │
│            anger · 2026-05-12  ·  NPS 2                                  │
│                                                                          │
│   [r1188]  "When I finally got a human, they fixed it in 5 minutes.       │
│            But the wait was insane."   frustration · 2026-05-11 · NPS 4  │
│                                                                          │
│   + 6 more · View all in Voice                                           │
│                                                                          │
│ ─── Audit ──────────────────────────────────────────────────────────── │
│                                                                          │
│   Generated 2026-05-15 14:23:11 UTC by run #f8e3…                        │
│   Model:      gemini-2.0-flash@2025-12  (T=0)                            │
│   Verifier:   claude-haiku-4.5@2026-01  → supported                      │
│   Hash:       sha256: a3f2e8…                                            │
│                                                                          │
│   [ Reproduce this insight ]   [ Report issue ]   [ Show full prompt* ]  │
│                                                                          │
│   * Admin only                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

This drawer is **available on every insight card, every time**. It is the answer to "why should I trust this?" — and the answer is shown, not asserted.

---

## 5. Explore view

Faceted browsing of all generated insights. Built for analysts who want to slice the corpus.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ FILTERS                          CONTENT                                     │
├──────────────────────────────────┼────────────────────────────────────────────┤
│ Layer                            │  18 insights                              │
│  ☑ Descriptive (4)               │                                           │
│  ☑ Diagnostic (7)                │  [card] [card] [card]                     │
│  ☐ Predictive (2)                │  [card] [card] [card]                     │
│  ☑ Prescriptive (5)              │  [card] [card] [card]                     │
│                                  │                                           │
│ Category                         │  Sort: priority ▾                         │
│  ☐ score.nps                     │                                           │
│  ☑ driver.key (3)                │                                           │
│  ☑ voice.topic (4)               │                                           │
│  ☐ voice.emotion                 │                                           │
│  ☑ anomaly.spike (1)             │                                           │
│  ☑ action.fix_friction (3)       │                                           │
│  ...                             │                                           │
│                                  │                                           │
│ Confidence                       │                                           │
│  [────●─────────]  ≥ 60          │                                           │
│                                  │                                           │
│ Sample size                      │                                           │
│  [──●───────────]  ≥ 30          │                                           │
│                                  │                                           │
│ Segment                          │                                           │
│  + Add segment filter            │                                           │
│                                  │                                           │
│ Date range                       │                                           │
│  Last 30 days ▾                  │                                           │
│                                  │                                           │
│ User state                       │                                           │
│  ☐ Pinned only                   │                                           │
│  ☐ Hide dismissed                │                                           │
└──────────────────────────────────┴────────────────────────────────────────────┘
```

- Cards in Explore view are the same primitive as Dashboard, sized smaller (denser)
- All filters update the URL; shareable links are stable
- Selection mode: ⌘-click multiple cards → bulk action toolbar (pin, dismiss, export as report, send to Slack)

---

## 6. Voice view

The qualitative deep-dive. This is where 80% of XM users actually spend their time, but legacy tools bury it under five clicks. We surface it as a peer view.

### 6.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Voice — 489 verbatim responses across 3 open-text questions                  │
│                                                                              │
│ ┌─────────────────────────────────────┬──────────────────────────────────┐   │
│ │ TOPICS (12)                         │ SELECTED: Email verification loop │   │
│ │                                     │  18 respondents · 24 mentions     │   │
│ │ ● Onboarding friction (102)         │  92% negative · 62% frustration   │   │
│ │ ● Pricing transparency (47)         │                                   │   │
│ │ ● Support response time (32)        │  Aspect sentiment                 │   │
│ │ ● Email verification loop (24) ▶︎    │  • email   ████████████ 95% neg  │   │
│ │ ● Mobile crashes (19)               │  • verify  █████████░░░ 78% neg  │   │
│ │ ● Feature parity (18)               │  • loop    ████████████ 100% neg │   │
│ │ ● ...                               │                                   │   │
│ │                                     │  Top quotes (24)                  │   │
│ │ + 2 more · Refine clusters          │                                   │   │
│ │                                     │  "I spent 15 minutes in the       │   │
│ │ EMOTIONS                            │   verification loop"              │   │
│ │ ┌──────────────────────────────┐    │   — r1188 · 2026-05-11 · NPS 2   │   │
│ │ │ frustration 38%              │    │                                   │   │
│ │ │ disappointment 22%           │    │  "Tried 3 times, gave up,         │   │
│ │ │ anger 12%                    │    │   contacted support"              │   │
│ │ │ confusion 11%                │    │   — r1234 · 2026-05-12 · NPS 1   │   │
│ │ │ ...                          │    │                                   │   │
│ │ └──────────────────────────────┘    │  + 22 more                        │   │
│ │                                     │                                   │   │
│ │ INTENT SIGNALS                      │  ──────────                       │   │
│ │ • churn-intent  12                  │                                   │   │
│ │ • suggestion    31                  │  Generated insights for this topic│   │
│ │ • praise         8                  │  [card: action.fix_friction]      │   │
│ │ • complaint     67                  │  [card: trend.topic_emergence]    │   │
│ │ • question       9                  │                                   │   │
│ └─────────────────────────────────────┴──────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Notable interactions

- **Topic refinement**: a "Refine clusters" inline action lets the user merge two topics or split a heterogeneous one — this re-runs the LLM-labeling pass with the new clustering, and updates affected insights. *This is one of our differentiators vs Qualtrics' rigid taxonomies.*
- **Quote drawer is canonical**: anywhere a quote is referenced — in dashboard cards, drivers, narratives — it opens the same Voice quote drawer with the response in full context.
- **Filter chip composition**: `topic=email verification loop` + `emotion=frustration` + `segment=Enterprise` chips compose; results update inline.

---

## 7. Trends view (optional fourth view)

Only renders if the survey has either >7 days of responses or a recurring schedule. Otherwise this tab is hidden.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ NPS — last 90 days                                                           │
│                                                                              │
│   80 ┤                                                                       │
│   60 ┤        ╭─╮                                                            │
│   40 ┤────────╯ ╰─────╮                                  ╭─────              │
│   20 ┤                ╰────────────────╮       ╭─────────╯                   │
│    0 ┤                                  ╰───────╯                            │
│      └────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────             │
│        Feb 14   Mar 1   Mar 15  ...    May 10*                               │
│                                                                              │
│   * Anomaly: 12-point drop, outside 95% PI · See insight ›                  │
│                                                                              │
│ Overlays:  ☑ NPS  ☐ CSAT  ☑ Topic: Onboarding friction  ☐ Response velocity  │
│                                                                              │
│ ─── ANNOTATIONS ─── (auto-detected events from changepoints) ───             │
│  Mar 22  Regime change: mean NPS rose from 35 to 49                          │
│  May 10  Spike: NPS −12 (likely linked to incident I-0421)                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Anomalies, regime changes, and predictions are first-class annotations on the chart, not buried in a side panel
- Hover/tap on an anomaly marker → mini insight card preview → click to open full drawer

---

## 8. Cmd+K — Ask Crystal (Experient Copilot)

Crystal is Experient's AI copilot — named Crystal, branded as "Experient Copilot." Available globally on every Insight page via ⌘K. Replaces the "AI Query Bar" in the existing tracker.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🔍  Ask anything about this survey                                       │
│                                                                          │
│   Why did NPS drop on May 10?                                            │
│                                                                          │
│ ─── Suggestions ──────────                                               │
│   "What are the top complaints from Enterprise customers?"               │
│   "Compare this survey to last quarter's NPS"                            │
│   "What would raise our CSAT the most?"                                  │
│   "Send a Slack summary to #cx-leads"                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

Answers stream in like ChatGPT — but every claim is cited with `[r…]` chips that open the quote drawer, and every number is rendered with its CI.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Why did NPS drop on May 10?                                              │
│                                                                          │
│ NPS dropped 12 points (47 → 35) on May 10, outside the 95%               │
│ prediction interval [42–52].                                              │
│                                                                          │
│ Two signals correlate:                                                    │
│  • A spike of 14 responses mentioning "login error" in the same          │
│    24h window  [r2104, r2107, r2111, +11 more]                          │
│  • Average response sentiment dropped from +0.12 to −0.41                │
│    (effect size large; p<0.01)                                            │
│                                                                          │
│ Likely root cause: the 2026-05-10 14:12 UTC login outage                 │
│ (cross-referenced with your incident log if integrated).                 │
│                                                                          │
│ Confidence: 84%                                                          │
│                                                                          │
│ ── Related insights ──                                                   │
│  [card: anomaly.spike — NPS dropped 12 points...]                        │
│  [card: voice.topic — "login error" emerged as topic]                    │
│                                                                          │
│ [ 👍 ] [ 👎 ] [ Pin this answer ] [ Send to Slack ] [ Open as report ]     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Critical UX rules for Cmd+K:**

- Conversational; follow-up questions stay in same panel
- Every numerical claim is from the analytics tools, not LLM math
- Citation chips are clickable
- "Send to Slack" / "Open as report" promote one-off questions into shareable artifacts
- If the question can't be answered with the current insight set, the system runs the relevant tool inline (e.g., "we don't have segment-level NPS for SMB yet; running now…")

---

## 9. Empty states & gating

| State | Render |
|---|---|
| 0 responses | Hero illustration + "Insights appear after the first 5 responses" + CTA "Send invitations" |
| 1–4 responses | Show raw response list with sentiment chips; placeholder card "Insights unlock at 5 responses" |
| 5–29 responses | Show L1 descriptive insights only + grey "Exploratory finding" cards for voice topics |
| 30+ responses | Full L1 + L2 |
| 200+ responses and ≥4 weeks history | Full L1+L2+L3 |
| 500+ responses | Full L1+L2+L3+L4 |

Always show what *will unlock* next, with the threshold and current count. No dead ends.

---

## 10. Mobile / responsive

- **Mobile-first KPI strip + priority feed**. Drawers become full sheets. Voice/Trends views are read-only on mobile (no cluster refinement).
- **Tablet** — Dashboard and Voice views split-pane; full feature parity.
- **Desktop** — All views, all interactions; multi-column layouts.
- **Embedded** — A `<ExperientInsights surveyId="…" view="dashboard|kpi|action" />` web component for embedding in third-party dashboards. Same SSE stream; respects host theme.

---

## 11. Shareable artifacts

| Artifact | Format | How |
|---|---|---|
| Insight card | Public URL with token (read-only) | Share button on any card |
| Executive summary | PDF (one page), styled to brand | "Send Exec Summary" CTA |
| Slack digest | Adaptive Cards | "Send to Slack" on any insight or Cmd+K answer |
| Action ticket | Linear / Jira / GitHub issue | "Create ticket" on L4 cards |
| Report deck | PDF or Google Slides export | "Generate report" — composed from pinned + top-priority |

Every artifact carries the same citation chips and CI labels — trust travels with the share.

---

## 12. Personalization & learning

The Insight page **learns from the user** in two non-creepy ways:

1. **Priority decay on dismissal.** Insights the user explicitly dismisses lower the priority of their *category* for that user for 7 days (per [INSIGHT_TAXONOMY.md §7](INSIGHT_TAXONOMY.md)). Doesn't affect other users in the org.
2. **Action-driven boosting.** Insights that the user converts to actions (workflow / ticket) boost the priority of similar future insights by 0.1.

Both are reversible from a settings panel; full transparency at "Manage insight feed."

---

## 13. Accessibility

- WCAG 2.2 AA target
- All confidence chips have both color *and* text + icon (color-blind safe)
- CI bars carry numeric labels accessible to screen readers
- Drawers are focus-trapped; ESC closes
- Cmd+K is keyboard-fully navigable; Tab moves through citation chips
- Live region announcements for stream events ("3 new insights")

---

## 14. Brand & visual language

- Inherits from existing `brand_settings` (logo, brand colors, fonts) — see `app/src/pages/BrandSettingsPage.tsx`
- Default theme: Manrope font (existing), Indigo-600 primary, Teal accent (matches existing design system)
- Confidence chip colors: green-600, amber-500, slate-400 (Tailwind v4 tokens)
- Layer ribbon colors: blue-500 (desc), purple-500 (diag), amber-500 (pred), green-600 (presc)
- Motion: 200ms ease-out for card insertion (streaming feels alive but not jittery)

The existing mocks under `Designs/` provide useful **visual reference** for typography, spacing, and chrome. The **functional layout above supersedes them.**

---

## 15. Open UX decisions to validate

Worth a quick design review / user test before locking:

1. **Three views vs four** — should Trends always be present or only when meaningful history exists? *Recommendation:* keep it conditional; reduces clutter for first-time users.
2. **Confidence as a single number vs. a breakdown bar** — single number is simpler; bar is more informative. *Recommendation:* single number on card, full breakdown in drawer (current design).
3. **CI bar visual** — error-bar style (engineering-y) vs. shaded gradient (consumer-y). *Recommendation:* gradient; less intimidating, still honest.
4. **Auto-pinning of top L4 action** — pin the top prescriptive insight automatically at the top, or let the user pin manually? *Recommendation:* surface as a fourth KPI tile (already in design); never auto-pin in the feed (loses scrollback context).
5. **"Exploratory finding" vs "Insight" labeling** — the language must clearly differentiate trust tier without sounding apologetic. *Recommendation:* test "Exploratory finding · low confidence" vs "Insight (preview)" with 5 users.
6. **Card density** — 3 columns vs 2 vs 1 in Dashboard view? *Recommendation:* 1-column for top 3 priorities, then 2-column grid for the rest. Top 3 are the headline; the long tail is browsing.
