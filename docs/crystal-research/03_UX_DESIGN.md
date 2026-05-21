# Crystal — UX Design: Routes, Screens & Crystal-Everywhere

> Owner: UX Design
> Contributors: PM, Applied Science, Engineering
> Audience: Design, Engineering, Product
> Status: Design Draft | May 2026

---

## Preface: The UX Problem Statement

### What This Document Addresses

The current insights experience has a fundamental architectural flaw: **Crystal is an afterthought**. It lives in a popover, knows only what the current page pre-loads for it, disappears when you navigate away, and cannot reach across pages to give context. Users on the org overview have no Crystal. Users on the survey insights page get Crystal with a fixed payload. Users on the topics page get no Crystal at all.

This document designs a fundamentally different model: **Crystal is present everywhere insights exist, and it knows exactly where it is**.

This is not a chatbot. It is an embedded analyst — the equivalent of having a senior CX analyst sitting next to you, who has read all the data before you arrived, and who you can ask anything at any time.

---

## Part 1: The PM/UX/Science Design Discussion

*This section documents the cross-functional alignment conversation that shaped the design decisions below. It is kept here so future team members understand why decisions were made.*

---

### Opening Question from PM: What Are Users Actually Trying to Do?

When we shadowed 8 CX managers using legacy XM tools (Qualtrics, Medallia), the top 5 things they were trying to do were:

1. **Understand what's happening** — "Is our NPS good? What changed since last month?"
2. **Explain it to someone else** — "I need to present this to the VP next Tuesday."
3. **Find what to fix** — "What one thing would move NPS the most if we fixed it?"
4. **Monitor specific things** — "Has the Checkout Pain topic gotten worse?"
5. **Get ahead of a problem** — "I want to know before my VP does when something goes wrong."

None of these are "explore a dashboard." They are **investigative, narrative, and action-oriented**. This is what shapes the UX: the interface is not a dashboard you explore — it is an analyst you talk to, backed by a dashboard that surfaces the most important things automatically.

**PM decision:** The primary interface on every insights page is Crystal. The data visualizations are secondary — they are Crystal's evidence, not the product.

---

### UX Response: Why Crystal Can't Be a Floating Button

Crystal as a floating "ask me anything" button (current state) has a critical failure mode: **users don't know what to ask**. When you open a new dashboard and see a chat button, you are presented with a blank text box and infinite possibility. Most users close it.

Crystal needs to be **proactively present**. On every page, Crystal has already read the data and has something to say. The first thing Crystal shows is not "How can I help?" — it is a 1-2 sentence observation about what's on screen, followed by 3 suggested questions the user can tap.

This is the difference between a tool and an analyst. An analyst doesn't wait to be asked — they walk in and say "I looked at your data. Here's what I found. Want to dig into any of these?"

**UX principle:** Crystal speaks first. Always. Every page opens with Crystal's observation.

---

### Science Input: What Crystal Can Observe at Each Scope

Applied Science defines what Crystal has pre-computed (and can therefore state immediately without tool calls) at each scope:

**Org scope — available immediately (from org_metric_snapshots + portfolio state):**
- Number of active surveys and their health distribution
- Org NPS trend direction and magnitude
- The single most urgent survey (highest urgency_score)
- Any cross-survey theme appearing in 3+ surveys
- Any anomaly detected in last 24 hours

**Survey scope — available immediately (from survey_metric_snapshots + survey_topics):**
- Current NPS/CSAT with direction vs. last checkpoint
- Top topic by volume
- Any active anomaly
- Report tier (how many responses, what level of confidence)
- Last checkpoint timestamp

**Topic scope — available immediately (from survey_topics XM signals):**
- Topic health label (emerging/growing/stable/worsening/fading)
- NPS impact (positive or negative driver)
- Dominant emotion
- Urgency level
- 3 top verbatims (pre-selected by compute_topic_signals)

**Science rule:** Crystal's opening observation on any page uses only pre-computed data — no tool calls on page load. This keeps first-render latency to 0 additional cost. Tool calls happen only when the user asks a question.

---

### The Routes Discussion: PM + UX + Engineering Alignment

**PM initial ask:** "We need org-level insights, survey-level deep insights, topic analysis, and trend analysis — all accessible without removing what exists."

**UX concern:** "If we add 6 new routes under `/app/insights/*`, users won't know which one to use. The navigation will be overwhelming."

**Engineering constraint:** "We can't rename existing routes — `/app/insights/:surveyId` is bookmarked by users and referenced in share links."

**Resolution:** New routes live under a new prefix: `/app/experience`. This is:
- A new top-level navigation section: "Experience" in the sidebar
- Completely backward compatible — old routes still work
- Semantically different: "Insights" is survey-specific; "Experience" is the full program view
- Gives us clean URL space: `/app/experience/org/*` for org, `/app/experience/survey/:id/*` for survey

---

## Part 2: Navigation Architecture

### Current Navigation (Do Not Modify)

```
/app/surveys                     → Survey List
/app/surveys/:surveyId/responses → Response Dashboard
/app/surveys/:surveyId/insights  → Survey Insights (legacy, preserved)
/app/insights                    → Insights Hub (existing)
/app/insights/advanced           → Advanced Insights (existing)
/app/insights/topics             → Topics (existing)
```

### New Navigation: `/app/experience`

```
/app/experience                              → Experience Intelligence Hub (Org Overview)
/app/experience/org/trends                   → Org Trend Analysis
/app/experience/survey/:surveyId             → Survey Intelligence Home
/app/experience/survey/:surveyId/report      → Full Checkpoint Report
/app/experience/survey/:surveyId/topics      → Topic Analysis Hub
/app/experience/survey/:surveyId/trends      → Survey Trend Analysis
/app/experience/survey/:surveyId/topics/:id  → Topic Deep Dive
```

### Sidebar Addition

Add "Experience" as a new section in the sidebar (`SideNav.tsx`), positioned between "Insights" and "Templates":

```
──────────────────
📊 Surveys
💡 Insights          ← existing
✨ Experience        ← new (Crystal icon)
   └ Overview
   └ [Survey Name]
   └ [Survey Name]
📝 Templates
```

---

## Part 3: Screen-by-Screen Design

---

### Screen 1: Experience Intelligence Hub (`/app/experience`)

**Purpose:** Org-level portfolio view. The answer to "How is our experience program performing overall?"

**Crystal's opening observation** (pre-computed, no tool calls):
```
"Your experience program has 5 active surveys. Org NPS is 34 — down 4 pts
since last month, driven primarily by 'Product Onboarding' which is in
worsening health. One anomaly detected in 'Support Survey' 6 hours ago.
Want me to dig into what's happening?"

[Suggested questions]
→ Why did org NPS drop?
→ Which survey needs the most attention?
→ What themes are appearing across all surveys?
```

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR: "Experience Intelligence" | [Date Range ▾] | [Export]  │
├────────────────────────────────────┬────────────────────────────┤
│                                    │ CRYSTAL PANEL (always open)│
│  ORG OVERVIEW                      │                            │
│  ┌──────────────────────────────┐  │ 💎 "Your experience program│
│  │  Org NPS: 34  ↓4 pts        │  │ has 5 active surveys..."   │
│  │  ████████░░  [34th pct]     │  │                            │
│  │  vs. SaaS median: 41        │  │ [3 suggested questions]    │
│  └──────────────────────────────┘  │                            │
│                                    │ ────────────────────────── │
│  SURVEY PORTFOLIO HEALTH           │                            │
│  ┌───────────────────────────────┐ │ [Message input]            │
│  │ 🔴 Product Onboarding  NPS↓  │ │ "Ask Crystal anything..."  │
│  │    Top issue: Checkout Pain   │ │                            │
│  │    ──────────────────────    │ │                            │
│  │ 🟡 Support Survey  [ANOMALY] │ │                            │
│  │    Vol spike: 3× normal      │ │                            │
│  │    ──────────────────────    │ │                            │
│  │ 🟢 Post-Purchase  NPS stable │ │                            │
│  │ 🟢 NPS Relationship  NPS↑   │ │                            │
│  │ ⚪ Beta Feedback  <30 resp.  │ │                            │
│  └───────────────────────────────┘ │                            │
│                                    │                            │
│  CROSS-SURVEY THEMES               │                            │
│  ┌───────────────────────────────┐ │                            │
│  │ "Wait Time" — in 3 surveys   │ │                            │
│  │ "Communication" — in 2       │ │                            │
│  └───────────────────────────────┘ │                            │
│                                    │                            │
│  ORG NPS TREND (90 days)           │                            │
│  [Line chart — from org snapshots] │                            │
└────────────────────────────────────┴────────────────────────────┘
```

**Crystal context on this page:**
- Scope: `org`
- Pre-loaded: org_metric_snapshots (last 90 days), portfolio health per survey, cross-survey themes
- Available tools: `get_org_overview`, `compare_surveys`, `get_metric_history(scope=org)`, `get_topic_signals` (any survey)

**Survey health card interaction:**
- Click a card → navigate to `/app/experience/survey/:id`
- Crystal's context shifts automatically to that survey

**Anomaly badge:**
- Clicking "ANOMALY" badge on a survey card opens a mini Crystal explanation inline, without leaving the page

---

### Screen 2: Survey Intelligence Home (`/app/experience/survey/:surveyId`)

**Purpose:** The main survey intelligence landing. Replaces the need to go to legacy `/app/insights/:surveyId`. This is the first screen a CX manager sees when they want to understand a specific survey.

**Crystal's opening observation:**
```
"Product Onboarding survey — 342 responses, Tier 3 confidence.
NPS is 28, down 14 pts since last checkpoint on May 15. The primary
driver is 'Checkout Pain' (NPS impact: -22 pts, 67 responses, worsening).
Three verbatims in the last week contain cancel-intent language.
Want me to explain what's happening or jump to the top recommendations?"

[Suggested questions]
→ What's causing the NPS drop?
→ Show me the worst verbatims this week
→ What should we fix first?
```

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  "Product Onboarding" | [All Time ▾] | [Generate Report] | ...  │
├────────────────────────────────────┬────────────────────────────┤
│                                    │ CRYSTAL PANEL              │
│  SURVEY STATUS BAR                 │                            │
│  NPS: 28 ↓14  CSAT: 3.8/5 →      │ 💎 [Opening observation]   │
│  342 responses  [🟢 Robust]        │                            │
│  Last checkpoint: May 15           │ [Suggested questions]      │
│  ─────────────────────────────── │ ──────────────────────────  │
│                                    │ [Message history]          │
│  TOP 5 THEMES                      │                            │
│  ┌─────────────────────────────┐   │                            │
│  │ 🔴 Checkout Pain            │   │                            │
│  │    67 resp | NPS -22 | ↑WoW │   │ [Message input]           │
│  │    😤 Frustration (68%)     │   │                            │
│  │    [View verbatims] [Trend] │   │                            │
│  ├─────────────────────────────┤   │                            │
│  │ 🟡 Onboarding Complexity    │   │                            │
│  │    45 resp | NPS -8 | →     │   │                            │
│  ├─────────────────────────────┤   │                            │
│  │ 🟢 Support Helpfulness      │   │                            │
│  │    38 resp | NPS +11 | ↑    │   │                            │
│  ├─────────────────────────────┤   │                            │
│  │ 🟢 Speed of Resolution      │   │                            │
│  │    29 resp | NPS +7  | →    │   │                            │
│  ├─────────────────────────────┤   │                            │
│  │ ⚪ Documentation Quality    │   │                            │
│  │    18 resp | NPS -3  | new  │   │                            │
│  └─────────────────────────────┘   │                            │
│                                    │                            │
│  [View Full Report]  [Topics Hub]  │                            │
│  [Trends]  [Compare to Industry]   │                            │
└────────────────────────────────────┴────────────────────────────┘
```

**Crystal context on this page:**
- Scope: `survey`, survey_id = `:surveyId`
- Pre-loaded: current NPS/CSAT, top 5 topics with signals, last checkpoint delta summary, report tier
- Available tools: all survey-scoped tools + `get_verbatims`, `get_metric_history`, `get_topic_signals`, `get_benchmark`, `filter_responses`

**Topic card health indicators:**
- 🔴 Worsening (health_label = "worsening" OR urgency_score > threshold)
- 🟡 Needs attention (health_label = "stable" but nps_impact < -5)
- 🟢 Positive driver (nps_impact > 0)
- ⚪ New/emerging (health_label = "emerging" or n < minimum)

**"Generate Report" button:**
- Triggers background Opus report generation
- Shows progress indicator in Crystal panel: "Generating your full report... I'm analyzing 342 responses across 5 themes."
- Report ready notification → navigates to Screen 3

---

### Screen 3: Full Checkpoint Report (`/app/experience/survey/:surveyId/report`)

**Purpose:** The detailed, shareable, structured report. This is what you present to leadership. Think Qualtrics Executive Summary — but generated automatically, cited, and statistically grounded.

**Crystal's role here:** Crystal IS the report. The report is not a separate artifact — it is Crystal's structured output, rendered with rich formatting. Crystal is still available on the right panel for follow-up questions.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Full Report: Product Onboarding | May 20, 2026 | [🔗 Share]   │
│  342 responses | [🟢 Robust confidence] | [⬇ Export PDF]        │
├────────────────────────────────────┬────────────────────────────┤
│  REPORT                            │ CRYSTAL PANEL              │
│                                    │                            │
│  ── STATE OF THE SURVEY ─────────  │ 💎 "This report was       │
│  NPS: 28 (95% CI: 22–34, n=201)   │ generated from 342        │
│  Industry: 36 (SaaS median)        │ responses. I'm available  │
│  Percentile: 34th in SaaS          │ to answer questions about │
│  Trend: ↓14 pts since May 15       │ any finding."             │
│                                    │                            │
│  "This survey is deteriorating,    │ [Suggested questions]     │
│  primarily driven by Checkout      │ → Which finding is most   │
│  Pain, which has grown 340% in     │   actionable?             │
│  volume over 3 weeks..."           │ → How confident is the    │
│                                    │   NPS driver finding?     │
│  ── TOP 5 THEMES ───────────────   │ → What will happen if we  │
│                                    │   don't act?              │
│  1. Checkout Pain [🔴 Worsening]   │                            │
│     Volume: 67 resp (20% of total) │ ──────────────────────── │
│     NPS Impact: -22 pts            │ [Message input]           │
│     Driver Score: 0.71             │                            │
│     Dominant emotion: frustration  │                            │
│     Confidence: 🟢 High (n=67)     │                            │
│     ─────────────────────────────  │                            │
│     "The payment step consistently │                            │
│     generates the most negative    │                            │
│     feedback. 89% of respondents   │                            │
│     who mentioned Checkout Pain    │                            │
│     are detractors."               │                            │
│                                    │                            │
│     VERBATIMS:                     │                            │
│     [-] "Payment kept timing out"  │                            │
│     [-] "Had to retry 3 times"     │                            │
│     [+] "Finally fixed the bug -   │                            │
│          works great now"          │                            │
│                                    │                            │
│  [2-5 similarly formatted themes]  │                            │
│                                    │                            │
│  ── SINCE LAST REPORT ──────────   │                            │
│  • Checkout Pain: +40% volume ↑    │                            │
│  • Documentation Quality: NEW      │                            │
│  • NPS: -14 pts (significant)      │                            │
│  • No topics disappeared           │                            │
│                                    │                            │
│  ── ANOMALIES ──────────────────   │                            │
│  ⚠ Volume spike: May 18-19        │                            │
│    2.8× normal rate (51 responses) │                            │
│    Correlated with: "payment bug"  │                            │
│                                    │                            │
│  ── INDUSTRY CONTEXT ───────────   │                            │
│  Your NPS: 28 | SaaS median: 36    │                            │
│  You are in the 34th percentile.   │                            │
│  Companies fixing their top driver │                            │
│  gain ~8 NPS points on average.    │                            │
│                                    │                            │
│  ── ACTION PRIORITIES ──────────   │                            │
│  1. Fix checkout payment flow      │                            │
│     Expected NPS impact: +8–12 pts │                            │
│     Effort: Medium | Timeline: 2wk │                            │
│  2. Improve onboarding docs        │                            │
│     Expected NPS impact: +3–5 pts  │                            │
│     Effort: Low | Timeline: 1wk    │                            │
│  3. Expand support team coverage   │                            │
│     Expected NPS impact: +2–4 pts  │                            │
│     Effort: High | Timeline: 1mo   │                            │
└────────────────────────────────────┴────────────────────────────┘
```

**Report rendering rules:**
- Every number that has a CI shows it on hover: "NPS 28 → [hover: 95% CI: 22–34, n=201]"
- Every verbatim is clickable → opens the full response in a side drawer
- Every theme is clickable → navigates to Screen 5 (Topic Deep Dive) with Crystal context carried
- Driver Score has a tooltip: "0.71 = strong positive correlation between mentioning this topic and being a detractor"
- Export PDF renders the Crystal panel content as a "Crystal Analysis" sidebar in the PDF

---

### Screen 4: Topic Analysis Hub (`/app/experience/survey/:surveyId/topics`)

**Purpose:** See all topics at once, with their full signal set. The place to answer "which topic is most hurting us?" and "which one is getting worse?"

**Crystal's opening observation:**
```
"5 topics across 342 responses. Checkout Pain is your #1 NPS driver
at -22 pts and is worsening week-over-week. Support Helpfulness is
a positive driver at +11 pts — your biggest asset. Documentation
Quality emerged 2 weeks ago and is still small but worth watching.
Want me to compare how these topics trended over time?"
```

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Topic Analysis — Product Onboarding | [Sort: NPS Impact ▾]     │
├────────────────────────────────────┬────────────────────────────┤
│                                    │ CRYSTAL PANEL              │
│  TOPIC GRID (cards)                │                            │
│                                    │ 💎 [Context observation]   │
│  ┌──────────────┐ ┌──────────────┐ │                            │
│  │CHECKOUT PAIN │ │ONBOARDING    │ │ [Suggested questions]      │
│  │🔴 WORSENING  │ │COMPLEXITY    │ │ → Compare topic trends     │
│  │              │ │🟡 STABLE     │ │ → Which topic to fix first?│
│  │NPS: -22 pts  │ │              │ │ → Show promoter language   │
│  │Driver: 0.71  │ │NPS: -8 pts   │ │   vs detractor language    │
│  │67 responses  │ │Driver: 0.44  │ │                            │
│  │😤 68% frust. │ │45 responses  │ ├────────────────────────────┤
│  │              │ │😕 45% disap. │ │ [Message input]            │
│  │[▶ Trend]     │ │[▶ Trend]     │ │                            │
│  │[💬 Verbatims]│ │[💬 Verbatims]│ │                            │
│  └──────────────┘ └──────────────┘ │                            │
│                                    │                            │
│  ┌──────────────┐ ┌──────────────┐ │                            │
│  │SUPPORT       │ │SPEED OF      │ │                            │
│  │HELPFULNESS   │ │RESOLUTION    │ │                            │
│  │🟢 GROWING    │ │🟢 STABLE     │ │                            │
│  │              │ │              │ │                            │
│  │NPS: +11 pts  │ │NPS: +7 pts   │ │                            │
│  │Driver: -0.38 │ │Driver: -0.21 │ │                            │
│  │38 responses  │ │29 responses  │ │                            │
│  │😊 72% joy    │ │😊 61% joy    │ │                            │
│  └──────────────┘ └──────────────┘ │                            │
│                                    │                            │
│  ┌──────────────┐                  │                            │
│  │DOCUMENTATION │                  │                            │
│  │QUALITY       │                  │                            │
│  │⚪ EMERGING   │                  │                            │
│  │              │                  │                            │
│  │NPS: -3 pts   │                  │                            │
│  │n=18 (low     │                  │                            │
│  │confidence)   │                  │                            │
│  └──────────────┘                  │                            │
│                                    │                            │
│  DRIVER MATRIX                     │                            │
│  [Scatter: NPS Impact × Volume]    │                            │
│  [Quadrants: Fix/Watch/Amplify/Mon]│                            │
└────────────────────────────────────┴────────────────────────────┘
```

**Driver Matrix quadrants:**
- **Fix Now** (high volume + negative NPS impact): Checkout Pain → most urgent
- **Watch** (low volume + negative NPS impact): Documentation Quality → monitor
- **Amplify** (high volume + positive NPS impact): Support Helpfulness → invest here
- **Monitor** (low volume + positive NPS impact): Speed of Resolution → stable

Crystal can explain any quadrant placement when clicked.

---

### Screen 5: Topic Deep Dive (`/app/experience/survey/:surveyId/topics/:topicId`)

**Purpose:** Everything about one topic. For when a manager is going into a meeting about "the checkout problem."

**Crystal's opening observation (topic-scoped):**
```
"Checkout Pain — your most urgent topic. 67 responses this checkpoint,
up from 23 last week (340% growth). NPS impact is -22 pts — meaning
respondents who mention Checkout Pain give NPS scores 22 points lower
on average than those who don't. 68% express frustration. Here are
the 3 most representative negative verbatims. What would you like to
explore — the trend over time, what promoters say about this, or the
most urgent specific complaints?"
```

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Topics | Checkout Pain | [🔴 WORSENING]             │
├────────────────────────────────────┬────────────────────────────┤
│                                    │ CRYSTAL PANEL (topic-aware)│
│  SIGNAL SUMMARY                    │                            │
│  ┌─────────────────────────────┐   │ 💎 "Checkout Pain — your  │
│  │ Volume: 67 (19.6% of total) │   │ most urgent topic..."     │
│  │ NPS Impact: -22 pts         │   │                            │
│  │ Driver Score: 0.71 (strong) │   │ [Suggested questions]     │
│  │ Net Sentiment: -0.61        │   │ → What are promoters       │
│  │ Urgency Score: 0.84 (HIGH)  │   │   saying about this?      │
│  │ Confidence: 🟢 High         │   │ → When did this get worse? │
│  │ Velocity: +340% WoW         │   │ → What's the single most  │
│  └─────────────────────────────┘   │   common complaint?        │
│                                    │                            │
│  EMOTION DISTRIBUTION              ├────────────────────────────┤
│  [Horizontal bar chart]            │ [Message input]            │
│  Frustration  ████████████ 68%     │                            │
│  Disappointmnt ████████    45%     │                            │
│  Anger        ████         22%     │                            │
│  Neutral      ██           12%     │                            │
│                                    │                            │
│  WEEKLY TREND (sparkline)          │                            │
│  Responses:  ▂▃▄▄▇██              │                            │
│  Sentiment:  ▆▆▅▄▃▂▁              │                            │
│  Health:  stable→worsening         │                            │
│                                    │                            │
│  TOP VERBATIMS                     │                            │
│  [Tab: All | Negative | Positive]  │                            │
│                                    │                            │
│  [-] "Payment kept timing out.     │                            │
│       Had to retry 3 times before  │                            │
│       it went through." — May 19   │                            │
│       NPS: 2 | 😤 Frustration     │                            │
│                                    │                            │
│  [-] "Why does the checkout ask    │                            │
│       for my address twice?" — 18  │                            │
│       NPS: 3 | 😠 Anger           │                            │
│                                    │                            │
│  [+] "Fixed! Payment flow is much  │                            │
│       better this week" — May 20   │                            │
│       NPS: 9 | 😊 Joy             │                            │
│                                    │                            │
│  [Load more...]                    │                            │
│                                    │                            │
│  PROMOTER VS DETRACTOR LANGUAGE    │                            │
│  Promoters say: "fixed", "better", │                            │
│    "fast", "easy", "seamless"      │                            │
│  Detractors say: "timeout",        │                            │
│    "retry", "confusing", "twice"   │                            │
└────────────────────────────────────┴────────────────────────────┘
```

---

### Screen 6: Survey Trend Analysis (`/app/experience/survey/:surveyId/trends`)

**Purpose:** Historical view. "Show me how this survey has been performing over the last 3 months."

**Data sources:** `survey_metric_snapshots` (per-run), `topic_windows` (per-week per-topic)

**Crystal's opening observation:**
```
"Product Onboarding over 90 days: NPS has been declining since March,
with the steepest drop in the last 3 weeks (-14 pts). Checkout Pain
emerged as a topic in Week 8 and has grown every week since. If current
trend continues, NPS will reach approximately 18 by June 20 (±8 pts,
linear projection). Want me to explain what triggered the decline?"
```

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Trends — Product Onboarding | [90 days ▾] | [Compare Period]  │
├────────────────────────────────────┬────────────────────────────┤
│                                    │ CRYSTAL PANEL              │
│  NPS OVER TIME                     │                            │
│  [Area chart with CI band]         │ 💎 "90 days trending:     │
│  52 ↘↘↘↘↘ 34                      │ NPS declining since..."   │
│  [Checkpoint markers on x-axis]    │                            │
│  [Anomaly flags: ⚠ May 18]        │ [Suggested questions]      │
│                                    │ → What triggered March     │
│  RESPONSE VELOCITY                 │   decline?                 │
│  [Bar chart: daily response count] │ → Project NPS for June     │
│  [May 18-19 spike highlighted]     │ → Compare to industry avg  │
│                                    │                            │
│  TOPIC HEALTH TIMELINE             ├────────────────────────────┤
│  [Gantt-style: each topic row,     │ [Message input]            │
│   health label color per week]     │                            │
│                                    │                            │
│  Checkout Pain:                    │                            │
│  [new][growing][worsening][worsen] │                            │
│                                    │                            │
│  Support Helpfulness:              │                            │
│  [stable][stable][growing][growing]│                            │
│                                    │                            │
│  CHECKPOINT HISTORY                │                            │
│  ┌───────────────────────────────┐ │                            │
│  │ May 15 | 312 resp | NPS: 42  │ │                            │
│  │ Apr 30 | 280 resp | NPS: 47  │ │                            │
│  │ Apr 15 | 241 resp | NPS: 52  │ │                            │
│  └───────────────────────────────┘ │                            │
│  [View Report for Checkpoint ▶]    │                            │
└────────────────────────────────────┴────────────────────────────┘
```

---

## Part 4: Crystal UX Patterns — The Design System

### 4.1 Crystal Panel States

Crystal has four states. Each has a distinct visual treatment.

**State 1: Observing (page just loaded)**
```
╔════════════════════════════╗
║ 💎 Crystal                 ║
║ ─────────────────────────  ║
║ [Scope-aware observation   ║
║  in 2-3 sentences]         ║
║                            ║
║ Suggested questions:       ║
║ ◦ [Question 1]             ║
║ ◦ [Question 2]             ║
║ ◦ [Question 3]             ║
╚════════════════════════════╝
```
No input field visible. Crystal is speaking. Click any suggested question to activate.

**State 2: Thinking (tool calls in progress)**
```
╔════════════════════════════╗
║ 💎 Crystal                 ║
║ ─────────────────────────  ║
║ ⟳ Fetching metric history  ║
║ ⟳ Analyzing 5 topics...    ║
║ ✓ Got verbatims (67 found) ║
║ ⟳ Synthesizing...          ║
╚════════════════════════════╝
```
Tool calls shown as they execute. Users see Crystal working — not a spinner.

**State 3: Answering (streaming response)**
```
╔════════════════════════════╗
║ 💎 Crystal                 ║
║ ─────────────────────────  ║
║ NPS dropped 14 pts because ║
║ Checkout Pain grew 340%    ║
║ in 3 weeks. The driver     ║
║ score is 0.71, meaning...  ║
║ ▌ (streaming)              ║
╚════════════════════════════╝
```
Response streams word by word. Citations appear as inline chips `[67 responses]` that expand on click.

**State 4: Waiting (after response, ready for follow-up)**
```
╔════════════════════════════╗
║ 💎 Crystal                 ║
║ ─────────────────────────  ║
║ [Previous answer shown]    ║
║ ─────────────────────────  ║
║ [Message input field]      ║
║ "Ask a follow-up..."       ║
║                            ║
║ Suggested follow-ups:      ║
║ ◦ [Dynamic follow-up 1]    ║
║ ◦ [Dynamic follow-up 2]    ║
╚════════════════════════════╝
```

### 4.2 Crystal Minimized State

On every page, Crystal can be minimized to a tab. The tab shows:
- Crystal icon (gem emoji)
- A 1-line "headline" of Crystal's current observation
- Unread indicator if Crystal has something new to surface

```
│ 💎 "NPS ↓14 pts, Checkout Pain is primary driver"  [Open] │
```

Clicking [Open] expands Crystal back to full panel without losing conversation state.

### 4.3 Stuck State — Crystal's Proactive Help

If a user has been on a page for >90 seconds without interacting with Crystal or clicking any data element, Crystal proactively expands with a nudge:

```
💎 "Looks like you're exploring. Here's what I'd look at first:
    The Checkout Pain topic (top right of the driver matrix)
    is your highest priority by NPS impact. Want me to walk
    you through what's happening there?"
```

This addresses the user's requirement that Crystal "helps customers if they are stuck."

### 4.4 Citation Interaction

Every claim Crystal makes has a citation. Citations are chips embedded in the text:

```
NPS dropped 14 pts [201 responses, CI: ±6] primarily due to Checkout Pain 
[driver score: 0.71] which grew 340% in volume [from 18 to 67 responses].
```

Clicking a chip opens an inline evidence drawer:
- For `[201 responses, CI: ±6]` → shows distribution histogram, CI bar, benchmark line
- For `[driver score: 0.71]` → explains point-biserial correlation in plain language
- For `[from 18 to 67 responses]` → shows week-by-week volume table

### 4.5 Anomaly Alert Pattern

When an anomaly is detected (by the streaming consumer or scheduler), a persistent alert bar appears at the top of any insights page for that survey:

```
⚠ ANOMALY DETECTED — May 18 volume spike: 3× normal rate
  51 responses in 48 hours, correlated with "payment bug" mentions
  [Crystal Explains] [Dismiss]
```

Clicking [Crystal Explains] opens Crystal in Thinking state, fetching the anomaly context and producing a full explanation.

### 4.6 Crystal Thread Continuity

Crystal remembers each user's conversation within a survey. The conversation history is stored per user per survey — two different users on the same survey have separate Crystal conversations.

**Continuation rule:**
- If the user returns within **7 days** of their last message, Crystal continues the same conversation — context is preserved
- If more than 7 days have passed, Crystal starts fresh — no reference to the prior conversation
- The transition is silent — Crystal does not say "starting a new conversation." It simply opens with a fresh observation.

**What persists in Crystal's memory:**
- Questions the user asked and Crystal's answers
- Topics the user flagged as interesting
- Any follow-up context the user shared ("we're seeing this from enterprise customers only")

**What does NOT persist:**
- Crystal's pre-computed opening observation (refreshed on every page load from latest insights)
- Survey data (Crystal always reads the freshest insights, regardless of when the thread was created)

**New checkpoint behavior:** When a new analysis is published while a conversation is in progress, Crystal's data context refreshes automatically. On the user's next message, Crystal is working from the updated insights — no thread reset, no notification. Crystal may note proactively if the new data changes a prior answer.

**i18n:** No user-visible copy needed for thread lifecycle — the behavior is invisible. The only copy needed is if Crystal explicitly references past context: Crystal uses `crystal.threadContinued.observation` = "Based on what we discussed before, here's what I'm seeing now..." — this is authored by Crystal naturally, not a template.

---

## Part 5: UX Role in Crystal Implementation

### 5.1 What UX Owns

**Design System for Agentic UX:** Crystal's four states (Observing, Thinking, Answering, Waiting) need a component library. This is not a general chat component — it is a specialized evidence-presenting interface. UX owns the component spec, interaction model, and animation design.

**Report Rendering System:** The checkpoint report is Crystal's output, rendered as a structured document. UX designs the typography system, citation chip interaction, verbatim card design, and PDF export layout. This requires collaboration with Engineering on the rendering engine (likely a structured JSON → React rendering system, not raw Markdown).

**Driver Matrix Visualization:** The NPS Impact × Volume scatter plot with quadrant labels is a custom visualization. UX owns the interaction design (hover, click, drill-down) and the labeling system.

**Anomaly Alert Design:** Anomalies must be urgent without being alarming. UX designs the alert hierarchy (banner vs. badge vs. notification), the dismissal pattern, and the "Crystal explains" interaction.

**Stuck-State Nudge Timing:** The 90-second rule is a hypothesis. UX runs A/B tests to find the right timing and phrasing. Too early = annoying. Too late = the user has already left.

**Navigation:** Adding "Experience" to the sidebar requires UX to own the icon (💎 Crystal logo), the collapsed state (icon only), the expanded state, and the sub-navigation pattern (org vs. per-survey items).

### 5.2 UX Open Questions (To Be Resolved in Phase 1)

1. **Crystal panel width:** Right panel takes 30% of viewport. On mobile (<768px), Crystal becomes a bottom sheet triggered by a floating button. Confirm behavior with Engineering.

2. **Conversation persistence:** Should Crystal remember the conversation when you navigate from Topics back to Survey Home? Current plan: yes, within a session. Cross-session: no (Crystal starts fresh with new observation).

3. **Report format:** Is the report best experienced as a scrollable page (current design) or as a slide-deck style (one section per screen)? Research with users before committing.

4. **Empty states:** What does Crystal say on a brand new survey with 0 responses? Proposed: "No responses yet. Crystal will generate your first report after 30 responses arrive. Meanwhile, I can help you review your survey questions."

5. **Crystal for non-insights pages:** Should Crystal be available on the survey builder? The response dashboard? Proposal: yes, but with different context (on builder: Crystal reviews questions for bias; on responses: Crystal answers questions about response patterns).

---

## Part 6: New Routes — Engineering Spec

For Engineers implementing the frontend routing changes:

### 6.1 New Constants in `routes.ts`

```typescript
// In app/src/constants/routes.ts — ADD these (do not remove existing):

EXPERIENCE:                '/app/experience',
EXPERIENCE_ORG_TRENDS:     '/app/experience/org/trends',
EXPERIENCE_SURVEY:         '/app/experience/survey/:surveyId',
EXPERIENCE_SURVEY_REPORT:  '/app/experience/survey/:surveyId/report',
EXPERIENCE_SURVEY_TOPICS:  '/app/experience/survey/:surveyId/topics',
EXPERIENCE_SURVEY_TOPIC:   '/app/experience/survey/:surveyId/topics/:topicId',
EXPERIENCE_SURVEY_TRENDS:  '/app/experience/survey/:surveyId/trends',
```

### 6.2 New Pages to Create

| Route | Page Component | Parent Layout |
|---|---|---|
| `/app/experience` | `ExperienceHubPage.tsx` | AppShell |
| `/app/experience/org/trends` | `OrgTrendsPage.tsx` | AppShell |
| `/app/experience/survey/:id` | `SurveyIntelligencePage.tsx` | AppShell |
| `/app/experience/survey/:id/report` | `SurveyReportPage.tsx` | AppShell |
| `/app/experience/survey/:id/topics` | `TopicAnalysisHubPage.tsx` | AppShell |
| `/app/experience/survey/:id/topics/:topicId` | `TopicDeepDivePage.tsx` | AppShell |
| `/app/experience/survey/:id/trends` | `SurveyTrendsPage.tsx` | AppShell |

### 6.3 Shared Crystal Panel Component

```typescript
// app/src/components/CrystalPanel.tsx — NEW

interface CrystalPanelProps {
  scope: 'org' | 'survey' | 'topic';
  surveyId?: string;
  topicId?: string;
  initialObservation?: string;      // pre-computed, shown immediately
  suggestedQuestions?: string[];    // pre-computed, shown on load
}
```

This component is rendered in the right panel of every Experience page. It handles all four states internally. The parent page provides `scope` + identifiers; Crystal Panel handles all conversation logic.

### 6.4 New API Hooks to Create

```typescript
// app/src/hooks/useExperience.ts — NEW

useOrgOverview()                           // polls /api/experience/org/overview
useSurveyIntelligence(surveyId)            // /api/experience/:id
useSurveyReport(surveyId, checkpointId?)   // /api/experience/:id/report
useTopicAnalysis(surveyId)                 // /api/experience/:id/topics/signals
useTopicDeepDive(surveyId, topicId)        // /api/experience/:id/topics/:topicId
useSurveyTrends(surveyId, days)            // /api/experience/:id/trends
```

All hooks follow the existing pattern in `useInsights.ts`: `{ data, loading, error }`.

---

## Part 7: System Transparency and Empty States

### 7.1 The Design Principle: Honest, Helpful, Non-Technical

Experience Intelligence is only valuable when users trust it. Trust is destroyed when a system is opaque — when users don't understand why they're seeing what they're seeing, or why they're NOT seeing what they expected.

**The rule across all Crystal and Insights surfaces**: The system must always communicate honestly about what it knows, what it doesn't know, and why. It must do this without:
- Exposing raw numbers (no "you need 200 responses")
- Using technical language ("pipeline failed", "confidence interval", "below threshold")
- Being vague ("something went wrong — please try again")

Every system state maps to a concrete, human message that tells the user the situation and what to do next. UX and Engineering own this mapping jointly. The messages live in `app/src/locales/en.ts`. Engineers do not write their own error strings — they throw a state code; UX writes the string.

---

### 7.2 Insight Page State Machine

The insight page has seven distinct states. Engineers must expose the current state as a typed enum in the API response; UX maps each enum value to a specific layout and message.

**State enum (add to `app/src/types/index.ts`):**
```typescript
export type InsightPageState =
  | 'no_responses'      // Survey has 0 responses
  | 'collecting'        // Some responses, below snapshot threshold
  | 'early_insights'    // Snapshot exists, below full checkpoint threshold
  | 'generating'        // Pipeline currently running
  | 'insights_ready'    // Full insights available
  | 'insights_stale'    // Insights exist but survey has no new activity > 7 days
  | 'pipeline_failed';  // Last run failed
```

**State → Layout → Message mapping:**

#### State: `no_responses`

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│          [Crystal avatar — neutral, attentive pose]            │
│                                                                 │
│     "Your survey is live. Insights will appear once           │
│      responses start arriving."                                │
│                                                                 │
│     [Share Survey]  [Preview Survey]                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
- Crystal panel: Open, shows this message as Crystal's opening line
- No insight cards, no metric tiles, no empty grid
- i18n key: `insights.state.noResponses`

#### State: `collecting`

```
┌─────────────────────────────────────────────────────────────────┐
│  ○ ○ ○  Collecting feedback                                    │
│  Your survey is gathering responses.                           │
│  Analysis begins soon — no action needed.                      │
│                                                                │
│  [small subtle progress indicator — no numbers, just motion]   │
└─────────────────────────────────────────────────────────────────┘
```
- Show the survey's response count as a number (this is factual, not a threshold)
- Do NOT show "X more needed"
- Crystal panel: Minimized, shows "Waiting for more data to analyze"
- i18n key: `insights.state.collecting`

#### State: `early_insights`

```
┌─────────────────────────────────────────────────────────────────┐
│  ◑  Early Trends                                               │
│  Showing initial patterns from your responses so far.          │
│  Your analysis deepens as more feedback arrives.               │
└─────────────────────────────────────────────────────────────────┘
```
- Show metric snapshot data (NPS trend, top topics) but with a visual "early" badge
- Metric tiles show values but with a soft confidence treatment (muted colors, ◑ icon)
- Crystal panel: Open, can answer basic questions using early data
- i18n key: `insights.state.earlyInsights`
- The "early" treatment must NOT say what threshold will unlock full analysis

#### State: `generating`

```
┌─────────────────────────────────────────────────────────────────┐
│  ◉  Analyzing your latest responses...                         │
│                                                                │
│  [animated progress: "Understanding themes" → "Finding        │
│   patterns" → "Writing insights" → "Reviewing findings"]       │
└─────────────────────────────────────────────────────────────────┘
```
- Show the PREVIOUS insight results underneath (do not blank the page)
- Overlay a non-blocking generating banner at the top of the insights section
- Progress labels map to pipeline nodes but use human language (never node names):
  - `node_absa` → "Understanding how respondents feel"
  - `node_cluster` → "Grouping similar feedback"
  - `node_topics` → "Identifying themes"
  - `node_narrate` → "Writing insights"
  - `node_verify` → "Reviewing for accuracy"
  - `node_publish` → "Finalizing your report"
- Crystal panel: Available, can answer from previous insights while new ones generate
- i18n key: `insights.state.generating`
- Engineering note: node progress comes from `agent_runs.stream_events` JSONB column (SSE)

#### State: `insights_ready`

Normal display. All insight cards, metric tiles, Crystal panel fully active.
- Report tier badge (visual only, no tier names or numbers):
  - `< 50 responses`: ◑ "Early Analysis"
  - `50-199 responses`: ◕ "Growing Confidence"
  - `200-499 responses`: ● "Full Analysis"
  - `500+ responses`: ● "Deep Analysis"
- i18n key: `insights.state.insightsReady`

#### "Generate new insight" button — `insights_ready` with new responses

When `page_state === 'insights_ready'` AND `page_state_metadata.can_manual_refresh === true` (meaning ≥10 new responses have arrived since the last completed checkpoint), show a "Generate new insight" button inline in the insights header:

```
┌─────────────────────────────────────────────────────────────────┐
│  [Survey title]                                [progress arc ●] │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  New responses available since your last analysis.       │   │
│  │                          [Generate new insight →]        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Existing insight cards — fully readable]                     │
└─────────────────────────────────────────────────────────────────┘
```

**Design rules:**
- The banner is informational, not urgent. Use `info` variant (soft blue border, no warning icon).
- Do NOT show the number of new responses. Do NOT say "10 new responses since your last report." Just say "New responses available since your last analysis." The exact count is internal.
- The button text is `t('insights.actions.generateNewInsight')` → "Generate new insight"
- The existing report is fully readable below the banner. Nothing is hidden or dimmed.
- While generation runs (`page_state === 'generating'`): hide the button, show the generating overlay (existing behavior).
- Once generation completes: toast notification appears (see below), insights reload in place.
- `can_manual_refresh` is `false` if the survey has exhausted its daily manual refresh limit — in that case, the banner still shows but the button is disabled with text `t('insights.actions.generateNewInsight.limitReached')` → "Analysis limit reached for today".
- i18n key: `insights.state.newResponsesAvailable`
- i18n key: `insights.actions.generateNewInsight`
- i18n key: `insights.actions.generateNewInsight.limitReached`

#### State: `insights_stale`

```
┌─────────────────────────────────────────────────────────────────┐
│  ○  Insights are from a while ago                              │
│  New responses haven't arrived recently.                       │
│  Results will update automatically when feedback resumes.      │
└─────────────────────────────────────────────────────────────────┘
```
- Show existing insights with a subtle stale banner (dismissible)
- NOT a blocker — insights are still fully usable
- Crystal panel: Active, notes "I'm working from older data" in opening observation
- i18n key: `insights.state.insightsStale`

#### State: `pipeline_failed`

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠  Analysis paused                                            │
│  We ran into a problem updating your insights.                 │
│  We'll retry automatically. Previous results are shown below.  │
│                                                       [Retry]  │
└─────────────────────────────────────────────────────────────────┘
```
- Show previous insights underneath — never blank the page on failure
- "Retry" button triggers `POST /api/insights/:surveyId/trigger` manually
- Do NOT say "error", "failed", "500", or any technical language
- Do NOT expose what failed (LLM failure, timeout, rate limit — irrelevant to user)
- i18n key: `insights.state.pipelineFailed`

#### Rating-Only / No-Text Survey State

When a survey has no open-text questions (`has_open_text = false`), the insights page shows a modified layout that omits topics entirely and explains what Crystal can and cannot do.

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Survey title]                                      [progress arc] │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  ℹ  Score-based survey                                        │ │
│  │  This survey collects ratings and scores — Crystal will        │ │
│  │  analyze patterns in your data.                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  [NPS tile]  [CSAT tile]  [Completion rate]                        │
│                                                                     │
│  INSIGHTS                                                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ NPS distribution shows a polarized experience — 42% rate    │  │
│  │ 9-10 while 28% rate 0-3. Strong loyalty from a segment      │  │
│  │ alongside significant detractors.                           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  [No Topics section — section is hidden, not empty]                │
└─────────────────────────────────────────────────────────────────────┘
```

**Design rules:**
- Topics section: completely hidden. Not "No topics found" — the section does not render at all
- The info banner is `info` variant (soft blue, not a warning) — this is not an error state
- Crystal panel: active, but opening observation is score-focused: "This survey collects ratings. Here's what the patterns suggest."
- Crystal i18n key for the no-text context: `crystal.context.scoreOnlySurvey`
- The banner is dismissible per user — once dismissed, does not reappear
- i18n key: `insights.state.scoreOnlySurvey`
- i18n key: `insights.state.scoreOnlySurvey.subtitle`

#### Survey Status Banners — Paused and Closed

When a survey is `paused` or `closed`, a persistent banner appears at the top of the insights page. The banner communicates the status clearly and explains what is and is not available.

**Paused survey banner:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⏸  This survey is paused                                          │
│  New responses can still be submitted, but insights will not        │
│  update until the survey is resumed.                                │
│                                           [Resume survey →]        │
└─────────────────────────────────────────────────────────────────────┘
```

- Color: amber (warning, not error)
- NOT dismissible — persists until survey is resumed
- Existing insights fully readable below the banner
- "Generate new insight" button: hidden (not disabled — removed entirely)
- "Resume survey" link: navigates to survey settings (only shown to survey owners, not read-only members)
- Crystal: active, but notes "I'm working from insights captured before this survey was paused."
- i18n key: `insights.state.surveySuspended.paused`
- i18n key: `insights.state.surveySuspended.paused.subtitle`
- i18n key: `insights.state.surveySuspended.resume`

**Closed survey banner:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  ✓  This survey is closed                                          │
│  Showing final insights from [N] responses.                         │
│  This survey is no longer accepting responses.                      │
└─────────────────────────────────────────────────────────────────────┘
```

- Color: neutral grey (informational, no urgency)
- NOT dismissible — permanent state
- Existing insights fully readable
- No "Generate new insight" button
- Response count shown (from `survey.response_count`)
- Crystal: active, notes "This survey is closed. I'm working from the final dataset of [N] responses."
- i18n key: `insights.state.surveySuspended.closed`
- i18n key: `insights.state.surveySuspended.closed.subtitle`

**Rendering logic (frontend):**
```tsx
// In UnifiedInsightsView.tsx — above all content
{survey_status === 'paused' && (
  <SurveyStatusBanner status="paused" responseCount={survey.response_count} />
)}
{survey_status === 'closed' && (
  <SurveyStatusBanner status="closed" responseCount={survey.response_count} />
)}
{has_open_text === false && page_state === 'insights_ready' && (
  <ScoreOnlyBanner />
)}
```

**Note:** `survey_status` is returned in `page_state_metadata.survey_status` from the API. The frontend checks this before rendering the "Generate new insight" button — if `survey_status !== 'active'`, the button is not rendered regardless of `can_manual_refresh`.

---

### 7.3 Topic Confidence States

Topics have three confidence states that affect their visual treatment. UX never shows the sample size — only the confidence category.

| Confidence | Visual treatment | Tooltip on hover | i18n key |
|---|---|---|---|
| `low` (emerging) | Dashed border, muted color, "Emerging" badge | "This theme is still developing — we'll have more detail as responses grow" | `topics.confidence.low` |
| `medium` (building) | Normal border, soft accent, "Building" badge | "Gathering more data on this theme" | `topics.confidence.medium` |
| `high` (established) | Normal display, no badge | (no tooltip needed) | — |

The `emerging` state uses `●` animation (pulsing) to suggest live development. The `building` state uses a static ◑ indicator. The `established` state has no indicator at all — it is the default.

**Never show**: "This topic has 2 responses" or "Need 10 responses for full analysis."

---

### 7.4 Insight Trust Indicators

Every insight card shows a trust indicator based on `trust_score`. The indicator is purely visual — no number is ever shown.

```
●  — High confidence (trust_score ≥ 80)
◑  — Moderate confidence (trust_score 50–79)
○  — Limited data (trust_score < 50)
```

Hover tooltip for each:
- ● : "Strong supporting evidence"
- ◑ : "Moderate evidence — confidence grows with more responses"
- ○ : "Limited supporting data — treat as directional"

The "Insight Audit Drawer" (clicking the indicator) shows the breakdown from `trust_json` — but using human labels, not numbers:
- Statistical: "Based on [how many]..." — shown as "Small sample" / "Moderate sample" / "Large sample"
- Coverage: "Supported by..." — shown as "Few respondents" / "Many respondents" / "Most respondents"
- Consistency: "Sentiment is..." — "Mixed" / "Mostly consistent" / "Very consistent"
- Grounding: "Accuracy check..." — "Needs review" / "Verified"

---

### 7.5 Crystal State Messages

Crystal has six states. Each maps to a visual state of the Crystal panel and a specific message.

| Crystal State | Trigger | Message | Panel State |
|---|---|---|---|
| `observing` | Page just loaded | Opening observation (pre-computed, 1-2 sentences) | Open, shows observation |
| `thinking` | User sent message | "Checking..." with animated tool-call indicators | Loading with tool labels |
| `answering` | Tool calls done, streaming | Streaming answer text | Active, text appearing |
| `low_confidence` | Quality score below threshold | "I don't have enough data to answer this confidently. Try asking about a specific topic." | Shows message, then suggestions |
| `error` | Crystal threw exception | "Something went wrong. Try rephrasing your question, or ask about a different topic." | Shows message |
| `waiting` | No question asked yet | Opening observation + 3 suggested questions | Open, suggestions visible |

**Thinking state — tool call labels** (what users see while Crystal investigates):

The label shown during a tool call must use the tool's friendly name, not its technical name. Engineering exposes `{type: "tool_call", tool: "get_topic_details"}` in the SSE stream; UX maps it:

| Tool name | User-facing label |
|---|---|
| `get_survey_overview` | "Reading your survey summary..." |
| `get_topic_details` | "Checking topic details..." |
| `get_metric_history` | "Looking at the trend data..." |
| `get_insights_list` | "Reviewing your insights..." |
| `get_verbatims` | "Reading respondent feedback..." |
| `compare_surveys` | "Comparing surveys..." |
| `get_org_portfolio` | "Checking your portfolio..." |
| `get_cross_survey_themes` | "Finding themes across surveys..." |
| `get_anomaly_events` | "Checking for anomalies..." |
| `get_benchmark_comparison` | "Looking up industry benchmarks..." |
| `get_driver_analysis` | "Analyzing what's driving this..." |
| `get_segment_breakdown` | "Breaking down by segment..." |

i18n key pattern: `crystal.tool.{toolName}` for each label.

---

### 7.6 New Report Completion Notification

When a user clicks "Generate new insight" and the analysis finishes, a non-blocking notification appears. This is the only automatic notification Crystal currently surfaces.

**Trigger:** The `run_completed` SSE event is received from the analysis stream.

**Design:**

```
                                    ┌──────────────────────────────────┐
                                    │  ✓  Your new analysis is ready   │
                                    │     Updated insights are now      │
                                    │     available for your survey.    │
                                    │                         [View →]  │
                                    └──────────────────────────────────┘
                                                        (auto-dismisses 6s)
```

**Rules:**
- Position: toast, bottom-right corner, z-index above content
- Auto-dismiss: 6 seconds. User can also manually dismiss.
- Does NOT navigate the user. The insights panel refreshes in place.
- [View →] button scrolls to the top of the insights panel (no route change)
- Do NOT say "Analysis complete" or any technical language
- Do NOT say how many insights were generated
- i18n key: `insights.notifications.insightReady` → "Your new analysis is ready"
- i18n key: `insights.notifications.insightReady.subtitle` → "Updated insights are now available for your survey"
- i18n key: `insights.notifications.insightReady.action` → "View"

---

### 7.7 Anomaly Alert UX

When `anomaly_flag = true` on a survey, a persistent alert banner appears at the top of the insights section.

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚡  Something notable happened with this survey               │
│  Crystal spotted a significant change in your feedback.         │
│  [Crystal Explains →]                                           │
└─────────────────────────────────────────────────────────────────┘
```

"Crystal Explains →" opens the Crystal panel with a pre-loaded message: Crystal's explanation of the anomaly (from the checkpoint's `delta_json.anomaly_explanation` field).

The banner uses amber/yellow styling — not red (which implies error). The anomaly is notable, not catastrophic.

- i18n key: `insights.anomaly.banner`
- i18n key: `insights.anomaly.crystalExplains`

---

### 7.8 Benchmark Unavailable State

When `get_benchmark_comparison` returns no data for the org's industry:

```
[small gray chip]: "Benchmarks coming soon for your industry"
```

Never: "Benchmark data not found" or "null". The chip links to a help article explaining what benchmarks are.

i18n key: `insights.benchmark.unavailable`

---

### 7.9 The Complete i18n Key Catalog

All user-visible strings must live in `app/src/locales/en.ts`. Here is the complete catalog of keys that Engineering must implement and UX must keep current:

```typescript
// Insight page states
'insights.state.noResponses': "Your survey is live. Insights will appear once responses start arriving.",
'insights.state.noResponses.cta': "Share your survey to collect responses",
'insights.state.collecting': "Collecting feedback — analysis begins soon",
'insights.state.collecting.sub': "No action needed. Check back as responses arrive.",
'insights.state.earlyInsights': "Showing early trends",
'insights.state.earlyInsights.sub': "Your analysis deepens as more feedback arrives.",
'insights.state.generating': "Analyzing your latest responses...",
'insights.state.insightsReady': "Analysis up to date",
'insights.state.insightsStale': "Insights are from a while ago",
'insights.state.insightsStale.sub': "Results will update automatically when feedback resumes.",
'insights.state.pipelineFailed': "Analysis paused",
'insights.state.pipelineFailed.sub': "We'll retry automatically. Previous results are shown below.",
'insights.state.pipelineFailed.retry': "Retry now",

// Insight actions (manual refresh + new responses banner)
'insights.state.newResponsesAvailable': "New responses available since your last analysis.",
'insights.actions.generateNewInsight': "Generate new insight",
'insights.actions.generateNewInsight.limitReached': "Analysis limit reached for today",
'insights.actions.generateNewInsight.tooltip': "Analyze responses collected since your last report",

// Insight completion notifications
'insights.notifications.insightReady': "Your new analysis is ready",
'insights.notifications.insightReady.subtitle': "Updated insights are now available for your survey",
'insights.notifications.insightReady.action': "View",

// Report tier badges (visual only, no numbers)
'insights.tier.early': "Early Analysis",
'insights.tier.growing': "Growing Confidence",
'insights.tier.full': "Full Analysis",
'insights.tier.deep': "Deep Analysis",

// Topic confidence
'topics.confidence.low': "Emerging theme",
'topics.confidence.low.tooltip': "This theme is still developing — we'll have more detail as responses grow",
'topics.confidence.medium': "Building confidence",
'topics.confidence.medium.tooltip': "Gathering more data on this theme",

// Insight trust indicators
'insights.trust.high.tooltip': "Strong supporting evidence",
'insights.trust.medium.tooltip': "Moderate evidence — confidence grows with more responses",
'insights.trust.low.tooltip': "Limited supporting data — treat as directional",

// Trust audit drawer
'insights.trust.audit.statistical.small': "Small sample",
'insights.trust.audit.statistical.moderate': "Moderate sample",
'insights.trust.audit.statistical.large': "Large sample",
'insights.trust.audit.coverage.few': "Supported by few respondents",
'insights.trust.audit.coverage.many': "Supported by many respondents",
'insights.trust.audit.coverage.most': "Supported by most respondents",
'insights.trust.audit.consistency.mixed': "Mixed sentiment",
'insights.trust.audit.consistency.mostly': "Mostly consistent sentiment",
'insights.trust.audit.consistency.strong': "Very consistent sentiment",
'insights.trust.audit.grounding.fail': "Needs review",
'insights.trust.audit.grounding.pass': "Accuracy verified",

// Crystal states
'crystal.state.observing': "", // dynamic — comes from pre-computed observation
'crystal.state.thinking': "Analyzing...",
'crystal.state.lowConfidence': "I don't have enough data to answer this confidently. Try asking about a specific topic.",
'crystal.state.error': "Something went wrong. Try rephrasing your question, or ask about a different topic.",
'crystal.state.waiting.cta': "Ask Crystal anything about your survey",

// Crystal tool labels (shown during ReAct thinking phase)
'crystal.tool.get_survey_overview': "Reading your survey summary...",
'crystal.tool.get_topic_details': "Checking topic details...",
'crystal.tool.get_metric_history': "Looking at the trend data...",
'crystal.tool.get_insights_list': "Reviewing your insights...",
'crystal.tool.get_verbatims': "Reading respondent feedback...",
'crystal.tool.compare_surveys': "Comparing surveys...",
'crystal.tool.get_org_portfolio': "Checking your portfolio...",
'crystal.tool.get_cross_survey_themes': "Finding themes across surveys...",
'crystal.tool.get_anomaly_events': "Checking for anomalies...",
'crystal.tool.get_benchmark_comparison': "Looking up industry benchmarks...",
'crystal.tool.get_driver_analysis': "Analyzing what's driving this...",
'crystal.tool.get_segment_breakdown': "Breaking down by segment...",

// Anomaly banner
'insights.anomaly.banner': "Something notable happened with this survey",
'insights.anomaly.banner.sub': "Crystal spotted a significant change in your feedback.",
'insights.anomaly.crystalExplains': "Crystal Explains →",

// Benchmark
'insights.benchmark.unavailable': "Benchmarks coming soon for your industry",

// Delta / comparison
'insights.delta.improved': "Improved since last analysis",
'insights.delta.declined': "Declined since last analysis",
'insights.delta.noChange': "Holding steady",
'insights.delta.notEnoughData': "Not enough history to compare yet",

# Multi-checkpoint trends and anomaly display
'trends.anomaly.new': "New anomaly detected",
'trends.anomaly.ongoing': "Ongoing issue",
'trends.anomaly.resolved': "Issue appears resolved",
'trends.confirmed.decline': "Confirmed decline",
'trends.confirmed.improvement': "Confirmed improvement",
'trends.reversal': "Reversed",
'trends.volatile': "Volatile",
'trends.noChanges': "No significant changes since last analysis.",
'trends.seeAll': "See all changes",
'trends.checkpoint.selector.label': "Checkpoint:",
'trends.checkpoint.selector.latest': "(latest)",
'trends.checkpoint.historicalBanner': "Viewing checkpoint from {date}. This is a historical snapshot.",
'trends.checkpoint.switchToLatest': "Switch to latest",
'notifications.settings.title': "Notifications for this survey",
'notifications.settings.inApp': "In-app",
'notifications.settings.email': "Email",
'notifications.settings.push': "Push",
'notifications.settings.push.soon': "Coming soon",
'notifications.settings.push.notifyMe': "Notify me when it's available",
'notifications.types.analysisReady': "New analysis ready",
'notifications.types.anomalyDetected': "Anomaly detected",
'notifications.types.confirmedTrend': "Confirmed trend",
'notifications.types.issueResolved': "Issue resolved",
'notifications.types.analysisFailed': "Analysis failed",
# Survey status and rating-only survey states
'insights.state.scoreOnlySurvey': "Score-based survey",
'insights.state.scoreOnlySurvey.subtitle': "This survey collects ratings and scores — Crystal will analyze patterns in your data.",
'insights.state.surveySuspended.paused': "This survey is paused",
'insights.state.surveySuspended.paused.subtitle': "New responses can still be submitted, but insights will not update until the survey is resumed.",
'insights.state.surveySuspended.resume': "Resume survey",
'insights.state.surveySuspended.closed': "This survey is closed",
'insights.state.surveySuspended.closed.subtitle': "Showing final insights from {count} responses. This survey is no longer accepting responses.",
// crystal.context.scoreOnlySurvey — (internal prompt context, not displayed to users)
```

---

### 7.10 Engineering Contract for State Exposure

Engineers do not decide what message to show. Engineers expose state via API; UX decides the message.

The backend `GET /api/insights/:surveyId/list` response must include a top-level `page_state` field:

```typescript
{
  page_state: InsightPageState;  // one of the 7 states above
  page_state_metadata?: {
    run_status?: string;           // for 'generating' state
    last_run_at?: string;          // ISO timestamp
    anomaly_active?: boolean;
    report_tier?: 'early' | 'growing' | 'full' | 'deep';  // no numbers
  };
  insights: Insight[];
  // ... rest of response
}
```

The frontend reads `page_state` and renders the appropriate empty/loading state. The exact message strings come from `en.ts`. Engineers never write display strings in component logic.

---

### 7.11 UX+Engineering Collaboration Checklist

For every new system state added to the pipeline:

1. [ ] Engineer adds enum value to `InsightPageState` in `app/src/types/index.ts`
2. [ ] Engineer adds `page_state` population logic in `backend/src/routes/insights.js`
3. [ ] UX writes the message string and adds it to `app/src/locales/en.ts`
4. [ ] UX designs the layout component in `app/src/pages/insights/StateOverlay.tsx` (new shared component)
5. [ ] UX reviews in staging that the message appears correctly in the actual scenario
6. [ ] Both sign off before the state ships to production

No state ships without a message. No message ships without engineer verification that the state is correctly exposed.

---

## Part 8: Progressive Intelligence — Below-Threshold UX

### 8.1 The Problem with All-or-Nothing

The current design has a gap: below 200 responses, the platform shows either early metric snapshots (Tier 1) or nothing useful. Users who collect responses gradually — 30 today, 80 next week, 150 the week after — see the same limited experience until they cross 200.

This is both a UX failure and a retention problem. Survey owners check their insights page repeatedly in the early days. If they see a blank page or "collecting feedback" every time, they stop checking — and stop caring about the platform.

The solution is **Progressive Intelligence**: four distinct UX states below 200 responses that each show the maximum accurate information for that data volume. Each state feels complete and useful at its stage, not like a preview of something better.

Applied Science defines what is statistically accurate at each response count (see document 04, section on Progressive Intelligence). This section designs the UX for each tier.

---

### 8.2 The Four Progressive States

These map to the sub-tiers defined in Applied Science doc 04:

```
    0          10         40         100         200
    │          │          │           │            │
    ▼          ▼          ▼           ▼            ▼
Collecting  First      Early      Growing      Clear
            Voices    Signals     Picture     Picture
            (◔)        (◑)         (◕)         (●)
                                           = Full Report
```

0–9 responses is the Collecting state — no pipeline run, no content. Crystal is not shown. The first sub-tier content appears when the 10th response arrives.

Clear Picture at 200 responses is the full report — not a separate sub-tier. The ProgressArc hits ● when the first complete analysis publishes.

**Visual language across all four:** Each state uses a consistent progress indicator — a subtle arc in the top-right of the insights header. It fills from 0% to the approximate 200-response fullness. No numbers. No labels. Just a visual sense of momentum.

---

### 8.3 Collecting State (0–9 responses)

**What this is:** No pipeline run. No content. The platform is waiting for enough signal to say something meaningful.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Survey title]                                      [progress arc ○ ]│
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │  Collecting responses                                           │ │
│ │  Share your survey to start gathering feedback.                 │ │
│ │  Your first analysis will appear automatically.                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  [No content below — no metric tiles, no topic cards]              │
└─────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Completely blank below the banner — no placeholder cards, no skeleton loaders
- Crystal panel: not shown in this state
- ProgressArc: ○, static (no pulse)
- i18n key: `insights.state.collecting`
- i18n key: `insights.state.collecting.subtitle`

---

### 8.4 First Voices (10–39 responses)

**What Applied Science says we can show accurately:** Sentiment direction (positive/mixed/challenging), 2–3 emerging theme names, top verbatims, dominant emotions. No NPS number.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Survey title]                                      [progress arc ◔ ]│
│                                                                     │
│  EARLY DIRECTION                                                    │
│  ┌──────────────────────┐                                           │
│  │  ◑  Mixed signals    │   "Feedback is early — direction may     │
│  │     so far           │    shift as more responses arrive."       │
│  └──────────────────────┘                                           │
│                                                                     │
│  EMERGING THEMES                                                    │
│  ┌────────────────────────────────┐ ┌───────────────────────────┐  │
│  │ ● Checkout Experience          │ │ ● Help & Support          │  │
│  │ [Emerging] [😤 Frustration]   │ │ [Emerging] [😕 Confusion] │  │
│  │                                │ │                           │  │
│  │ "The checkout process was      │ │ "Couldn't find the help   │  │
│  │  really confusing..."          │ │  section easily..."       │  │
│  └────────────────────────────────┘ └───────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Crystal: "Early feedback shows some friction with           │   │
│  │ checkout and navigation. Want me to pull out the most       │   │
│  │ common phrases people are using?"                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Sentiment direction tile: Three possible states with icon + label:
  - "Positive signals" (🟢 soft green)
  - "Mixed signals" (🟡 amber)
  - "Challenging signals" (🔴 soft red)
  - Never say "NPS is X" — no number
- No NPS number — sentiment direction only
- Theme cards: Name + "Emerging" badge + dominant emotion chip + one verbatim
- No volume count, no percentage, no NPS impact arrow
- Crystal: Can explain themes and quote verbatims. Cannot answer "what's my NPS?" — responds: "I don't have enough responses yet to give you a reliable score. I'll let you know when the picture clears."
- i18n key: `insights.progressive.firstVoices.*`

---

### 8.5 Early Signals (40–99 responses)

**What Applied Science says we can show accurately:** NPS as a zone (not a number), topics with confidence badges and driver direction, verbatims.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Survey title]                                      [progress arc ◑ ]│
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐  │
│  │  NPS Zone    │ │   CSAT       │ │  Responses                │  │
│  │  ◑ Good      │ │  4.1 / 5    │ │  [count]                  │  │
│  │  for SaaS    │ │             │ │                           │  │
│  └──────────────┘ └──────────────┘ └───────────────────────────┘  │
│  [soft label]: "Score refines as more responses arrive"            │
│                                                                     │
│  TOP THEMES                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Checkout Experience  [Building] [😤] →  Pain driver         │   │
│  │ "Respondents who mention this tend to rate lower"           │   │
│  │ [3 verbatims →]                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Product Quality      [Building] [😊] ↑  Strength driver     │   │
│  │ "Respondents who mention this tend to rate higher"          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Crystal: "Your NPS is in the good zone for SaaS. Checkout         │
│  friction is emerging as a pain point. Want to see the details?"   │
└─────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- NPS tile: Shows the zone label + benchmark context. Three zones per industry ("Improving", "Good", "Leading"). No exact number in the tile.
  - Optional: show exact number small below the zone with "~" prefix and note "approx."
- CSAT: Show the number (scale means nothing is being implied about CIs for now)
- Theme cards: Name + confidence badge + driver direction arrow (→ pain, ↑ strength, — neutral) + brief explanation sentence + verbatim count
- No percentages on themes
- Crystal: Full conversational capability. Can quote verbatims, describe themes, explain driver direction. Cannot give exact NPS, cannot compare to last week.
- i18n keys: `insights.progressive.earlySignals.*`

---

### 8.6 Growing Picture (100–199 responses)

**What Applied Science says we can show accurately:** NPS with ± margin, full topic signals, all four insight layers with hedged language, benchmark comparison with caveat.

**Layout:** Nearly identical to the full report layout. The differences:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  NPS: 38 ±11    │  │  CSAT: 4.1   │  │  Responses: [N]     │  │
│  │  [range bar ─●─] │  │              │  │  [progress arc ◕]   │  │
│  └──────────────────┘  └──────────────┘  └─────────────────────┘  │
│  [soft label]: "Confidence grows as more responses arrive"         │
│                                                                     │
│  [Full topic cards — same as insights_ready state]                 │
│  [All four insight layers — with hedged language on predictions]   │
│                                                                     │
│  INDUSTRY COMPARISON                                               │
│  NPS 38 is in the Good range for SaaS (Avg: 10-35, Good: 36-50)   │
│  [soft note]: "Based on current responses"                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- NPS tile: Show the number with ± margin. Render a small range bar visualization showing the CI range.
- Benchmark: Show the comparison but always with the soft note "Based on current responses — deepens with more feedback"
- All insight cards visible but Predictive layer insights have a ◑ indicator ("Developing — more data will confirm this")
- This state is visually nearly identical to the full report. The only visible differences are:
  - The progress arc (◕ vs ●)
  - The ± on the NPS tile
  - The "Developing" indicator on Predictive insights
  - No "Compare to previous" section (delta not available yet)
- Crystal: Full capability including benchmarks. Cannot do delta comparisons.
- i18n keys: `insights.progressive.growingPicture.*`

---

### 8.6a Clear Picture (200+ responses) — The Full Report

**What this is:** Clear Picture is the first complete analysis. It is not a separate sub-tier — it IS the 200-response full checkpoint. When it publishes, the ProgressArc advances to ● and the sub-tier system is permanently retired for this survey.

**Layout:** Full report layout — identical to `insights_ready` state. All metric tiles, full topic cards, all four insight layers, delta comparison section (if N-1 exists), benchmark comparison.

**Design notes:**
- No hedging language (unlike Growing Picture). Scores are reported with confidence.
- Delta section appears for the first time if a prior sub-tier checkpoint exists for comparison.
- ProgressArc: ● (complete)
- Crystal: full capability, including delta comparison and benchmarks
- i18n key: `insights.progressive.clearPicture.headline`

---

### 8.7 The Progress Arc Component

Every insight page shows a progress arc in the top-right of the survey header. It is a purely visual indicator with no numbers or labels.

```
○       ◔       ◑        ◕         ●
0–9    10–39   40–99   100–199    200+
none  first_  early_  growing_   full /
      voices  signals  picture  clear_picture
```

The arc fills based on `page_state_metadata.report_tier`:
- `no_responses` / `collecting` (0–9) → ○ empty, static (no pulse)
- `first_voices` (10–39) → ◔ ~15% filled, animated pulse
- `early_signals` (40–99) → ◑ ~40% filled
- `growing_picture` (100–199) → ◕ ~70% filled
- `full` / `clear_picture` (200+) → ● complete

**What it is not:** A progress bar toward a specific goal. No label like "200 responses to full report." It is momentum — a sense that things are building.

**The arc must never show:** The 200-response threshold. The exact percentage. Any number.

---

### 8.8 Crystal Language Tiers

Crystal's opening observation changes in language calibration based on `data_tier`. The frontend receives the `data_tier` in the API response and passes it to the Crystal component, which selects the appropriate prompt context. Crystal never breaks its own tier's language rules — if it's in `early_signals` tier, it will not quote an NPS number even if the user asks.

When a user asks Crystal for information it can't provide at the current tier:

| User asks | Crystal says (early_signals tier) |
|---|---|
| "What's my NPS?" | "I don't have enough responses yet for a reliable score. I can tell you the general direction is [positive/mixed/challenging]." |
| "How does this compare to competitors?" | "I'll be able to make that comparison once we have more feedback. Right now, here's what respondents are telling you directly..." |
| "Is [theme] getting worse?" | "It's too early to see a trend — I'd need to see more responses over time. For now, here's what people are saying about [theme]." |

These responses are honest without being dismissive. They redirect to what Crystal CAN tell the user.

i18n keys for these redirects:
- `crystal.tierLimit.npsNotReady`
- `crystal.tierLimit.benchmarkNotReady`
- `crystal.tierLimit.trendNotReady`
- `crystal.tierLimit.deltaNotReady`

---

### 8.9 Summary: State → What Users See

| State | NPS shown | Topics shown | Insights shown | Crystal capability |
|---|---|---|---|---|
| Collecting (0–9) | No | No | No | Not shown |
| First Voices (10–39) | Direction only | Names + emotion | No | Describe themes, quote verbatims |
| Early Signals (40–99) | Zone label | Full + driver direction | No | Themes, driver direction, NPS zone |
| Growing Picture (100–199) | Number + ± margin | Full signals | All 4 layers (hedged) | Full except delta |
| Clear Picture (200+) | Number + CI | Full signals | All 4 layers | Full including delta |

---

### 8.10 Multi-Checkpoint Trend & Anomaly Display

**Status:** Designed. Engineering data available from third checkpoint onward (see doc 04, Section 3.7 and doc 05). Push notification infrastructure is a future build — placeholder settings UI ships now.

---

#### 8.10.1 Where Trend Data Appears

Trend data appears in two places — neither is a separate tab (adding a tab increases navigation cost without adding clarity).

**Place 1: Inline delta indicators on metric tiles**

Every metric tile (NPS, CSAT, CES) gains a small delta row beneath the score:

```
┌──────────────────────┐
│  NPS: 38             │
│  ↓ 4 pts since last  │  ← delta row
│  [Confirmed decline] │  ← persistence badge (only for confirmed)
└──────────────────────┘
```

Delta row rules:
- Show only when `trend_persistence` is NOT `first_occurrence` for the first checkpoint (N=1 has no prior)
- Color: green for positive delta, red for negative, grey for stable (±2 pts)
- Arrow: ↑ improving, ↓ declining, → stable, ↕ volatile
- The exact delta number is shown (e.g., "↓ 4 pts since last analysis")
- Persistence badge appears only for `confirmed` trends — not for `first_occurrence`, `second_occurrence`, or `reversal`

**Place 2: "Trends & Changes" summary section**

Positioned between the metric tiles row and the insight cards, collapsed by default after the first full report, expanded by default when a `confirmed` trend or `new_anomaly` is present:

```
┌─────────────────────────────────────────────────────────────────────┐
│  TRENDS & CHANGES  [▼ expanded]                          [Dismiss] │
│                                                                     │
│  ┌─────────────────────────────────────┐ ┌─────────────────────┐   │
│  │ ↓ NPS declining — 2nd checkpoint   │ │ ⚠ Checkout Pain     │   │
│  │   in a row                         │ │   Ongoing issue      │   │
│  │   [See what changed]               │ │   [See responses]    │   │
│  └─────────────────────────────────────┘ └─────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────┐                           │
│  │ ✦ Product Quality — Emerging       │                           │
│  │   New theme not seen before        │                           │
│  │   [Explore]                        │                           │
│  └─────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

Cards shown in this section:
- One card per confirmed trend or anomaly (NPS, CSAT, key topics)
- Ordered by urgency: `new_anomaly` → `confirmed` decline → `confirmed` improvement → topic emergence/disappearance
- Maximum 4 cards. If more, show a "See all changes" link.
- When no trends: section collapses automatically to a single line: "No significant changes since last analysis."

---

#### 8.10.2 Visual Language — Confirmed vs. First-Occurrence Trends

| `trend_persistence` | Visual treatment | Badge | Color weight |
|---|---|---|---|
| `first_occurrence` | Arrow only, no badge | None | Muted (grey arrow) |
| `second_occurrence` | Arrow + delta number | None | Normal weight |
| `confirmed` | Arrow + delta + badge | "Confirmed trend" | Strong (bold, full color) |
| `reversal` | Opposite arrow + badge | "Reversed" | Amber |
| `volatile` | Double-headed arrow | "Volatile" | Amber |

**Rule:** Only `confirmed` trends should feel urgent. `first_occurrence` should feel informational — the system noticed something but is not sure yet. Crystal calibrates its language the same way (see 8.10.4).

**Confirmed trend treatment on the NPS tile:**
```
NPS: 34  ↓ 4 pts
━━━━━━━━━━━━━━━━━━  [red fill bar showing decline magnitude]
● Confirmed decline — 2 checkpoints in a row
```

**First-occurrence treatment:**
```
NPS: 38  ↓ 4 pts
(no bar, no badge — just the arrow and number in muted grey)
```

---

#### 8.10.3 Ongoing Issues — Avoiding Alert Fatigue

An `ongoing_issue` is a problem that was flagged at the previous checkpoint AND is still present now. The platform must not alert the user twice for the same unresolved problem.

**Three-state issue lifecycle:**

```
new_anomaly  →  ongoing_issue  →  resolved
   (alert)       (persistent      (quiet
                  indicator)    celebration)
```

**State 1: `new_anomaly`**
- Full alert card in the "Trends & Changes" section
- In-app notification fires
- Crystal proactively mentions it in opening observation
- i18n key: `trends.anomaly.new`

**State 2: `ongoing_issue`** (same anomaly present in N and N-1)
- Downgraded to a persistent indicator chip on the affected topic card: `[⚠ Ongoing issue]`
- No new notification — the user already knows
- The "Trends & Changes" card for this issue shows: "Still unresolved since [date]"
- User can dismiss: clicking `[Dismiss]` on the card moves it to `acknowledged` state (stored in `user_state_json` on the relevant insight record)
  - Dismissed: the chip stays visible but the "Trends & Changes" card is hidden
  - Re-surfaces: if the metric worsens further (delta exceeds the original anomaly magnitude by 50%), the issue escalates back to `new_anomaly`
- Crystal does NOT proactively mention an acknowledged ongoing issue unless asked
- i18n key: `trends.anomaly.ongoing`

**State 3: `resolved`**
- When the metric returns to its pre-anomaly baseline for one full checkpoint, the issue is marked `resolved`
- A quiet positive card appears in "Trends & Changes": "✓ Checkout Pain — Issue appears resolved"
- One notification fires: "Good news — an issue you were tracking has resolved"
- Auto-expires from the section after 7 days
- i18n key: `trends.anomaly.resolved`

**Mute option:** User can "mute" an ongoing issue for 30 days from the dismiss menu:
```
[Dismiss ▼]
  Mark as acknowledged
  Mute for 30 days
  This isn't a problem for us
```

"This isn't a problem for us" permanently hides the issue type for this survey (stored as a survey-level preference).

---

#### 8.10.4 Crystal — Proactive vs. On-Demand Trend Surfacing

**Crystal speaks first (proactive)** for these conditions:

| Condition | Crystal opening observation |
|---|---|
| `confirmed` decline | "NPS has declined for two checkpoints in a row — this is a sustained pattern. [Top declining topic] appears to be driving it. Want me to dig in?" |
| `confirmed` improvement | "NPS has improved for two checkpoints — the trend is holding. [Top improving topic] is likely the driver. Great signal." |
| `new_anomaly` | "Something changed significantly since your last analysis. [Topic or metric] shows an unusual shift. I'd recommend looking at this." |
| `reversal` | "NPS reversed direction this checkpoint after [improving/declining] last time. Worth keeping an eye on whether this holds." |

**Crystal waits to be asked** for these conditions:

| Condition | Crystal includes only if asked |
|---|---|
| `first_occurrence` change | Describes the change but does not characterize it as a trend |
| `second_occurrence` | Reports the delta but says "It's early to call this a trend — one more checkpoint will confirm" |
| Topic persistence details | Only describes which topics are confirmed vs. emerging if directly asked |
| Checkpoint-to-checkpoint comparison | Responds fully if asked "how does this compare to last time?" |

**Crystal suggested questions** (shown as tappable chips below the opening observation):

When a `confirmed` trend exists:
- "Why is NPS declining?"
- "Which topic is driving the change?"
- "What should we prioritize fixing?"

When `new_anomaly`:
- "What caused this spike?"
- "Which respondents flagged this?"
- "Is this related to [ongoing topic]?"

---

#### 8.10.5 Checkpoint History Navigation

Users can view any previous checkpoint's report. This is read-only — historical checkpoints cannot be regenerated.

**Checkpoint selector:**

A dropdown in the insights page header, right of the survey title, visible only when 2+ checkpoints exist:

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Survey Title]          [Checkpoint: May 20, 2026 (latest) ▼]     │
│  ● Clear Picture                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

Dropdown options:
```
✓ May 20, 2026  (latest)         ← current
  Apr 12, 2026  (250 responses)
  Mar 1, 2026   (211 responses)
```

Each option shows: date + response count at that checkpoint.

**Retention:** All checkpoints are kept indefinitely. The selector shows every checkpoint ever generated for the survey. Full report payloads are stored in object storage (see doc 05); only metadata (date, response count) is needed to render the dropdown.

**Historical view behavior:**
- A banner appears: "Viewing checkpoint from [date]. This is a historical snapshot — [Switch to latest]"
- "Generate new insight" button is hidden
- Crystal panel shows: "I'm working from the [date] checkpoint. Ask me anything about that data."
- Crystal can be asked to compare: "How does this compare to the latest?"
- All insight cards, metric tiles, and topic cards reflect that checkpoint's data

**API requirement:** `GET /api/insights/:surveyId/checkpoints` — returns list of checkpoints for the selector. `GET /api/insights/:surveyId/list?checkpoint_id=:id` — returns insights for a specific checkpoint (existing endpoint, new query param).

---

#### 8.10.6 Notification Channel Configuration

**Implementation status: Stub.** Email and push are not delivered today — the backend records the intent and delivers only in-app toasts. The settings UI ships now so user preferences are captured before delivery infrastructure is built.

**In-app notifications (active now):**
- New analysis ready → toast (6s, non-blocking)
- Anomaly detected → toast with "View" action
- Confirmed trend → toast
- Issue resolved → quiet toast
- Analysis failed → toast with "Retry" action

**Settings UI — "Notifications" tab on the survey settings page:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  NOTIFICATIONS FOR THIS SURVEY                                      │
│                                                                     │
│  Notification type          In-app   Email           Push           │
│  ─────────────────────────  ──────   ─────           ────           │
│  New analysis ready          [✓]      [✓ coming soon] [○ coming soon]│
│  Anomaly detected            [✓]      [✓ coming soon] [○ coming soon]│
│  Confirmed trend             [✓]      [○ coming soon] [○ coming soon]│
│  Issue resolved              [✓]      [○ coming soon] [○ coming soon]│
│  Analysis failed             [✓]      [✓ coming soon] [○ coming soon]│
│                                                                     │
│  In-app notifications are always active and cannot be turned off.   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  📬 Email & push notifications coming soon                    │  │
│  │  Preferences saved above will apply when available.           │  │
│  │  [Get notified when email & push launch →]                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Design rules:**
- In-app column: always ✓, not toggleable (enforced server-side)
- Email and Push columns: show toggles but all are greyed out with "coming soon" tooltip. Clicking stores the preference for when delivery ships.
- "Get notified when email & push launch" → stores `push_interest = true` in `notification_preferences`
- Settings are **per-survey** — a user can have different notification preferences per survey they manage
- When email/push delivery ships, the "coming soon" label is removed via a feature flag. No other UI changes needed.

**i18n keys:**
- `notifications.settings.title`
- `notifications.settings.comingSoon`
- `notifications.settings.inAppAlwaysOn`
- `notifications.settings.notifyMeLaunch`
- `notifications.types.analysisReady`
- `notifications.types.anomalyDetected`
- `notifications.types.confirmedTrend`
- `notifications.types.issueResolved`
- `notifications.types.analysisFailed`

---

#### 8.10.7 PM Decisions Required

Before engineering builds the notification delivery infrastructure:

1. **Email provider**: Which email service sends insight notifications? (Existing transactional email provider, or new?)
2. **Push platform**: Native mobile app (iOS/Android) or web push? Both? This determines the push infrastructure choice.
3. **Notification frequency cap**: If NPS is declining and a new checkpoint generates every 200 responses, should the system cap emails to max 1 per day even if multiple triggers fire?
4. **Resolution definition**: Is an `ongoing_issue` "resolved" when the metric returns to pre-anomaly baseline (science definition), or when the user manually marks it resolved (user definition)? Both options have trade-offs.
5. **Checkpoint retention**: How many historical checkpoints are kept per survey? Forever? Last 12? This affects storage costs and the checkpoint history selector length.
