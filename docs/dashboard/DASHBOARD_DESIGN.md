# Dashboard — Design Document

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Design  
**Team:** Isabella Ferreira (VP Product, ex-Qualtrics), Kenji Nakamura (UX, data viz), Amara Diallo (Frontend Lead), Patrick Sullivan (Backend/Analytics), Dr. Maria Garcia (Data Science), Grace Kim (XM Expert), Robert Chen (Enterprise Customer, Head of Insights at major bank), Emma Thompson (Platform Expert), Sophia Laurent (Crystal AI Lead)

---

## Table of Contents

1. [Executive Vision](#1-executive-vision)
2. [Design Principles](#2-design-principles)
3. [Dashboard Layouts & Views](#3-dashboard-layouts--views)
4. [Complete Widget Library](#4-complete-widget-library)
5. [Filtering System](#5-filtering-system)
6. [Drill-Down & Data Exploration](#6-drill-down--data-exploration)
7. [Customization & Personalization](#7-customization--personalization)
8. [Real-Time & Live Data](#8-real-time--live-data)
9. [Export & Sharing](#9-export--sharing)
10. [Backend API Design](#10-backend-api-design)
11. [Crystal AI Dashboard Integration](#11-crystal-ai-dashboard-integration)
12. [Frontend Technical Architecture](#12-frontend-technical-architecture)
13. [ASCII Wireframes](#13-ascii-wireframes)
14. [Competitive Analysis](#14-competitive-analysis)
15. [Implementation Roadmap](#15-implementation-roadmap)

---

## 1. Executive Vision

### The Problem With Today's XM Dashboards

> **Isabella Ferreira (ex-Qualtrics):** "I spent 4 years at Qualtrics. The dashboard is powerful but it's a reporting tool — you have to know what to look for. There's no intelligence layer telling you what to pay attention to."

> **Robert Chen (Head of Insights, major bank):** "My Monday morning ritual is: open Qualtrics, check NPS, try to remember what changed, open Excel, build a comparison, realize I need last quarter's data, find it somewhere else, paste it together, then make a slide. I need all of that to happen automatically, and I need someone to tell me the story — not just the numbers."

> **Grace Kim (XM Expert):** "Every XM dashboard I've ever seen shows you what happened. None of them tell you what it means. Experient's dashboard should be the first one that does."

### The Vision

**"The Dashboard others build shows you what happened. Experient's Dashboard tells you what it means, what's next, and what to do."**

Experient's Dashboard is a living intelligence surface — not a report. Crystal AI is embedded at every layer: it narrates the story behind the numbers, annotates charts with insights, predicts what happens next, and suggests the right action. Users walk into Monday morning with a pre-written executive brief, not an empty screen.

---

## 2. Design Principles

Six principles from Kenji (UX Lead) that govern every design decision:

**1. Signal over Noise**
Every metric shown must answer "does this tell me something I should act on?" If not, it's noise. Default dashboards show 5 KPIs, not 50.

**2. Narrative over Numbers**
Crystal writes a 3-paragraph story about the data. The charts are the evidence. The narrative is the product.

**3. Actionable over Informational**
Every KPI tile has a "What to do" CTA. Every alert annotation has a "View details" link. No metric exists without a path to action.

**4. Temporal Awareness**
Past (what happened), Present (what's happening now), Future (what's likely to happen). All three visible without switching views.

**5. Progressive Disclosure**
Start with 5 KPI tiles. One click reveals the distribution. One more click shows the verbatims. The data is always there — it's revealed on demand.

**6. Crystal-First**
Crystal's narrative leads. Charts confirm. Crystal's confidence in its own analysis is shown transparently. If Crystal doesn't know, it says so.

---

## 3. Dashboard Layouts & Views

### 3.1 Executive Summary Dashboard (Default for Admins, CX Leaders)

Purpose: Monday morning briefing. Walk into a meeting with 3 slides worth of context in 30 seconds.

```
┌───────────────────────────────────────────────────────────────────────┐
│  Experient Dashboard           [Last 30 days ▾]  [All Surveys ▾]  🔔  │
├───────────────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │ NPS  │ │ CSAT │ │ CES  │ │Responses │ │Resp Rate │ │ Insights │  │
│ │  42  │ │ 4.2  │ │ 3.1  │ │  1,847   │ │   31%    │ │    12    │  │
│ │ -3▼  │ │ +0.2▲│ │ -0.1▼│ │  +12%▲   │ │  -4%▼    │ │  +3▲    │  │
│ └──────┘ └──────┘ └──────┘ └──────────┘ └──────────┘ └──────────┘  │
├───────────────────────────────────────────────────────────────────────┤
│  🤖 CRYSTAL'S STORY — This Week                                       │
│  ─────────────────────────────────────────────────────────────────── │
│  "NPS held steady at 42 despite a 3-point dip in the final week,     │
│  driven by a spike in 'shipping delay' mentions (up from 8% to 24%  │
│  of verbatims). CSAT improved slightly, suggesting the product       │
│  itself is strong — the gap is in the last-mile experience.          │
│                                                                       │
│  Two new topics emerged this week: 'mobile app crash' and 'long      │
│  hold times'. Both are early-stage (< 5% of responses) but          │
│  trending upward. Watch closely next week.                           │
│                                                                       │
│  Crystal's prediction: If the shipping experience doesn't improve    │
│  in the next 14 days, NPS is likely to drop to the high 30s."       │
│                                          [Read full analysis →]      │
├─────────────────────────────────┬─────────────────────────────────────┤
│  NPS TREND (90 days)            │  TOP TOPICS                         │
│                                 │                                     │
│  50 ┤                           │  POSITIVE            NEGATIVE        │
│  45 ┤    ╭────╮    ╭──         │  ✓ Fast shipping   ✗ Delays (24%)  │
│  40 ┤   ╭╯    ╰───╯   ╰─      │  ✓ Easy returns    ✗ App crashes    │
│  35 ┤──╮╯                      │  ✓ Friendly staff  ✗ Long hold time │
│     └───────────────────────    │                                     │
│       3mo    2mo    1mo  now    │       [Explore topics →]            │
├─────────────────────────────────┴─────────────────────────────────────┤
│  🚨 ACTIVE ALERTS                         CRYSTAL WATCH LIST          │
│  ● NPS drop 3pts (Shipping Survey)       ⚡ Shipping delays trending ↑│
│  ● Response rate < 20% (Q4 Survey)       ⚡ App crash cluster emerging │
│                    [View all alerts →]          [View predictions →]  │
└───────────────────────────────────────────────────────────────────────┘
```

### 3.2 Analyst Dashboard

Purpose: Deep analysis. For CX analysts, researchers running statistical exploration.

Sections:
- Full KPI breakdown with statistical significance indicators (vs. prior period, vs. industry benchmark)
- Segment comparison matrix (compare any 2+ segments side-by-side)
- Topic deep-dive panel (topic trend, verbatim evidence, Crystal taxonomy)
- Verbatim explorer (search, filter, sentiment-coded)
- Cross-survey comparison (compare programs side-by-side)
- Distribution charts (NPS detractor/passive/promoter breakdown)
- Crystal confidence panel (Crystal's certainty on each insight)

### 3.3 Operations Dashboard

Purpose: Survey health and pipeline management. For the people running programs.

Sections:
- Survey status matrix (all active surveys: name, responses, rate, completion, status)
- Response volume heatmap (day × hour grid for last 30 days)
- AI pipeline status (Crystal jobs: queued, running, complete, failed)
- Data freshness indicators (last sync time per survey/integration)
- Distribution channel performance (email, QR, link — response rates per channel)
- Survey pipeline (drafts, active, closing, archived)

### 3.4 Insights Dashboard (Crystal-Powered)

Purpose: Track and act on Crystal AI intelligence.

Sections:
- Crystal insight feed (real-time stream of all insights, newest first)
- Insight map (clustering: which insights are related to which topics)
- Insight action tracker (per insight: status — read, actioned, dismissed, watching)
- Insight confidence timeline (how Crystal's confidence in each insight evolved)
- Crystal discovery log (what Crystal analyzed, when, confidence)

---

## 4. Complete Widget Library

### 4.1 KPI Tiles

**NPS Score Tile**
- Primary: Current NPS score (large)
- Secondary: Change vs comparison period (arrow + points)
- Tertiary: Industry benchmark comparison (above/below)
- Mini sparkline: 7-day trend
- Click: drill to NPS distribution + full trend

**CSAT Score Tile**
- Same pattern as NPS, scale 1-5
- Secondary metric: % of responses ≥ 4.0

**CES Score Tile**
- Customer Effort Score (1-7 scale, lower = better)
- Highlight: % of high-effort responses (> 5)

**Response Volume Tile**
- Count of responses in selected period
- Change vs prior period
- Daily average
- Click: drill to volume heatmap

**Response Rate Tile**
- Calculated: responses / invitations × 100%
- Visual: speedometer/gauge
- Threshold indicator: red if < 20%, green if > 40%

**Crystal Insight Count Tile**
- Count of insights generated in period
- Breakdown: new, high-confidence, actionable
- Click: jump to Insights Dashboard

---

### 4.2 Trend Widgets

**NPS Over Time (Line Chart)**
- X: date, Y: NPS score
- Multiple periods overlaid (current, prior period, same period last year)
- Crystal anomaly markers: ▲ points on the chart where Crystal detected a significant event
- Prediction overlay: dashed line showing Crystal's forward projection (14 days)
- Reference line: industry benchmark horizontal line
- Interaction: hover for tooltip with NPS value, response count, Crystal annotation

**Multi-Metric Trend**
- Multiple metrics on same chart (NPS, CSAT, CES)
- Dual-axis if scales differ
- Crystal highlights where metrics diverge (NPS drops while CSAT holds — delivery issue, not product)

**Response Volume Heatmap**
- Grid: 7 columns (days of week) × 24 rows (hours)
- Color: response volume (light = few, dark = many)
- Insight: shows the best distribution channel timing

**Moving Average + Anomaly Overlay**
- 7-day and 30-day moving averages on NPS trend
- Crystal anomaly bands (shaded regions where Crystal detected unusual variation)

---

### 4.3 Distribution Widgets

**NPS Distribution Bar**
- Stacked bar: Detractors (0-6) | Passives (7-8) | Promoters (9-10)
- Percentages with count
- Click segment: filter verbatims to that segment
- Comparison period overlay (thin bar below showing prior distribution)

**Rating Scale Distribution**
- Horizontal stacked bar for any question
- Color gradient: red (low) to green (high)
- Count + percentage per rating

**Sentiment Distribution**
- Donut chart: Positive / Neutral / Negative
- Center: dominant sentiment
- Click segment: see verbatims for that sentiment

**Score Distribution Histogram**
- Bell curve / frequency chart
- Mean, median, mode annotated
- Crystal annotation: "Bimodal distribution suggests two distinct customer segments"

---

### 4.4 Topic Widgets

**Topic Sentiment Matrix (Bubble Chart)**
- X axis: sentiment score (-1 to +1)
- Y axis: (can be volume, trend, or custom)
- Bubble size: relative mention volume
- Color: positive (green) to negative (red)
- Interaction: hover to see topic name + top verbatim
- Click: drill to topic detail
- Crystal annotation: highlights outlier bubbles

**Topic Trend Chart**
- Line chart: mention % over time for selected topics
- Compare up to 5 topics simultaneously
- Crystal marks: where topics emerged, peaked, declined

**Topic Word Cloud**
- Weighted by frequency
- Color-coded by sentiment (green = positive, red = negative, gray = neutral)
- Crystal filters noise (removes stop words + generic phrases)

**Emerging Topics Panel**
- Crystal-detected topics that didn't exist in prior period
- Shows: topic name, emergence date, % of responses, sentiment, trajectory (rising/stable)
- Alert badge if trajectory is sharply negative

---

### 4.5 Verbatim Widgets

**Recent Verbatims Stream**
- Live feed of response text (most recent first)
- Sentiment badge per verbatim (colored dot)
- Key phrase highlights (Crystal underlines the most meaningful phrases)
- Interaction: click to see full response + metadata

**Crystal-Highlighted Quotes**
- Crystal selects the 3-5 most representative or most important verbatims
- Shows as pull-quote cards with Crystal's reasoning ("Selected because this verbatim precisely captures the shipping issue pattern")

**Verbatim Search**
- Full-text search across all verbatims in current filter
- Results highlighted with matched terms
- Filter: by sentiment, by topic, by score, by date

---

### 4.6 Comparison Widgets

**Segment Comparison Table**
- Rows: metrics (NPS, CSAT, response rate, etc.)
- Columns: segments (mobile vs desktop, region, customer tier)
- Cells: value + change indicator
- Statistical significance markers (asterisk if difference is significant)
- Crystal row: Crystal's explanation of the biggest divergence

**Period-over-Period Waterfall Chart**
- Waterfall showing NPS journey from prior period to current
- Each bar: a contributing factor (segment shift, topic change, etc.)
- Crystal names each bar ("Shipping delays: -4 pts")

**Survey A/B Comparison**
- Side-by-side comparison of two survey programs
- Same metrics across both
- Crystal: "Survey A is outperforming Survey B by 8 NPS points primarily due to..."

---

### 4.7 Crystal AI Widgets

**Crystal Narrative Card**
- Crystal's free-text analysis of the current dashboard state
- 3 paragraphs: what happened, why it happened, what to watch
- Regenerate button (re-run with latest data)
- Timestamp + confidence indicator

**Crystal "What Changed" Panel**
- Bullet-point summary of the 3-5 biggest changes in the selected period
- Each bullet links to the relevant chart
- Crystal confidence badge per bullet

**Crystal Prediction Panel**
- 14-day forecast for NPS (with confidence interval band)
- Key assumption: "Prediction assumes current trend continues. If shipping improves, NPS could recover to 45."
- Probability breakdown: "60% chance NPS stays stable, 30% chance of further decline, 10% chance of recovery"

**Crystal Action Board**
- 3 recommended actions based on current data
- Priority-ordered
- Each action: what to do, expected impact, which metric it affects
- Mark as "Done" or "Not applicable"

**Crystal Anomaly Timeline**
- Horizontal timeline showing all Crystal-detected anomalies for selected period
- Click anomaly: see what changed and Crystal's analysis
- Color-coded by type: score anomaly (blue), topic anomaly (orange), volume anomaly (gray)

---

### 4.8 Operational Widgets

**Survey Health Matrix**
- Table: all active surveys
- Columns: name, responses, response rate, completion rate, last response, status, Crystal status
- Row color: green (healthy), yellow (attention), red (critical)
- Click row: jump to survey detail

**AI Pipeline Status**
- List of Crystal AI jobs
- Status: queued, running, complete, failed
- Progress bar for running jobs
- "View insights" CTA for complete jobs

**Data Freshness Indicator**
- Last data sync time per integration/survey
- Staleness badge: "Data 2 hours old" in yellow if > 1h

---

## 5. Filtering System

### 5.1 Global Filter Bar

Always visible at the top of every dashboard, below the navigation:

```
┌───────────────────────────────────────────────────────────────────────┐
│  [📅 Last 30 days ▾]  [📋 All Surveys ▾]  [👥 All Segments ▾]  [✕ Clear]│
│                                            [+ Add filter]  [Save view] │
└───────────────────────────────────────────────────────────────────────┘
```

Filters are displayed as pill tags — click to edit, × to remove.

### 5.2 Date Filter Options

```
Presets:                    Custom:
● Today                     [From: ______] [To: ______]
● Yesterday                 
● Last 7 days               Relative:
● Last 30 days              [Last  N  ▾ days ▾]
● Last 90 days              
● Last 12 months            Compare to:
● This quarter              ● Prior period (same length)
● Last quarter              ○ Same period last year
● This year                 ○ No comparison
● Custom range
```

### 5.3 Survey Filter

- All surveys (default)
- Single survey picker (searchable dropdown)
- Survey group (if groups are configured)
- Survey tag filter (multi-select)
- Survey type filter (NPS, CSAT, CES, custom)

### 5.4 Segment Filters (Advanced)

Accessible via "+ Add filter":

```
Category          Field              Operator      Value
─────────────────────────────────────────────────────────
Demographics      Age group        contains       [18-35]
Channel           Source           equals         [Email]
Device            Device type      equals         [Mobile]
Score             NPS score        between        [0] and [6]
Sentiment         Sentiment        equals         [Negative]
Date              Response date    after          [Dec 1, 2025]
Custom            customer_tier    equals         [Gold]
```

### 5.5 Filter Persistence & Sharing

- Filters encoded in URL (`?dateRange=last30d&surveyId=abc123&segment=mobile`)
- Shareable filter URLs — send a link that opens the exact same filtered view
- Saved filter presets: name and save any filter combination, access from dropdown

### 5.6 Compare Mode

Side-by-side comparison: apply two different filter sets to the same dashboard simultaneously:

```
┌──────────────────────────────┬──────────────────────────────┐
│  VIEW A                      │  VIEW B                      │
│  Filter: Mobile users        │  Filter: Desktop users        │
│  NPS: 38                     │  NPS: 49                     │
│  [all widgets mirrored]      │  [all widgets mirrored]      │
└──────────────────────────────┴──────────────────────────────┘
Crystal: "Mobile NPS is 11 points lower than desktop. Top reasons in mobile verbatims: app speed, navigation confusion."
```

### 5.7 Crystal-Aware Filtering

When filters are applied, Crystal re-analyzes in the filtered context:
- Crystal narrative updates to reflect current filter scope
- Crystal predictions re-computed for the filtered cohort
- Crystal alerts recalibrated to filtered baseline

---

## 6. Drill-Down & Data Exploration

### 6.1 Drill-Down Paths

```
NPS Tile (42)
  → Click → NPS Distribution Chart (Detractors: 23% / Passives: 30% / Promoters: 47%)
              → Click "Detractors" → Verbatims filtered to NPS 0-6
                                      → Click verbatim → Full response view
                                      → "Explore in Crystal" → Crystal analyzes detractor cohort

Topic Matrix (Shipping Delays bubble)
  → Click → Topic Detail Page
              → Trend over time (is it growing?)
              → Example verbatims (filtered to this topic)
              → Correlation with NPS drop
              → Crystal analysis of this topic
              → "Create Alert" (alert when this topic spikes)
```

### 6.2 Breadcrumb Navigation

```
Dashboard → NPS Distribution → Detractors → Verbatim #1847
                                            [← Back to Detractors]
```

### 6.3 "Explore in Crystal" CTA

Available on every chart and widget:
- Opens Crystal chat panel on the right side
- Pre-loads context: "You're looking at [widget name] filtered to [current filters]"
- User can ask: "Why is NPS lower for mobile users?" and Crystal responds with analysis

---

## 7. Customization & Personalization

### 7.1 Drag-and-Drop Layout Builder

Accessible via "Customize Dashboard" button:
- Grid system: 12 columns, infinite rows
- Drag widgets from library to canvas
- Resize: drag widget edge to resize (minimum 3 columns wide)
- Reorder: drag by header
- Remove: click × on widget

### 7.2 Widget Library Browser

```
┌───────────────────────────────────────────┐
│  Add Widget              [Search widgets] │
│                                           │
│  KPI TILES                                │
│  [NPS Score] [CSAT Score] [CES Score]     │
│  [Responses] [Response Rate] [Insights]   │
│                                           │
│  TRENDS                                   │
│  [NPS Trend] [Multi-Metric] [Heatmap]     │
│                                           │
│  CRYSTAL AI                               │
│  [Narrative] [Prediction] [Actions]       │
│  [Anomaly Timeline] [What Changed]        │
│                                           │
│  TOPICS                                   │
│  [Topic Matrix] [Emerging Topics]         │
│  [Word Cloud] [Topic Trend]               │
└───────────────────────────────────────────┘
```

### 7.3 Role-Based Default Layouts

| Role | Default Layout |
|------|---------------|
| Admin / CX Leader | Executive Dashboard |
| Analyst | Analyst Dashboard |
| Survey Creator | Operations Dashboard |
| Read-only / Stakeholder | Executive Dashboard |

### 7.4 Saved Dashboard Views

- Personal views (visible only to creator)
- Shared views (visible to all org members)
- "Default for role" (admin can set which view opens for each role)
- View name, description, last modified

---

## 8. Real-Time & Live Data

### 8.1 Live Updates via WebSocket

Socket.IO events the dashboard subscribes to:

```javascript
// Frontend subscribes on mount
socket.on('dashboard:response_received', ({ surveyId, count }) => {
  // Increment response counter in relevant tile
});

socket.on('dashboard:nps_updated', ({ surveyId, newNps, change }) => {
  // Update NPS tile with animation
});

socket.on('dashboard:crystal_insight', ({ insight }) => {
  // Prepend to Crystal insight feed
});

socket.on('dashboard:alert_fired', ({ alert }) => {
  // Show alert banner + update alert count
});
```

### 8.2 Data Freshness Strategy

| Metric | Update frequency |
|--------|-----------------|
| Response count | Real-time (WebSocket) |
| NPS score | Every 5 minutes (batched for performance) |
| Verbatim stream | Real-time (WebSocket) |
| Crystal narrative | On-demand (regenerate button) or after significant data change |
| Trend charts | Every 15 minutes |
| Topic matrix | Every 15 minutes |

### 8.3 Stale Data Indicators

Each widget shows "Last updated: 3 minutes ago" in tooltip. If data is > 30 minutes old, a yellow staleness badge appears.

---

## 9. Export & Sharing

### 9.1 Export Options

**Dashboard PDF Export:**
- Crystal's narrative + top widgets
- Brand logo included
- Date range + filter context
- Generated by Puppeteer on backend, emailed or downloaded

**Widget CSV Export:**
- Click "..." on any widget → "Export CSV"
- Raw data for the widget's current filter state

**Scheduled Digest Email:**
- Configure: daily at 8am, weekly on Monday
- Content: Crystal narrative + 5 key metrics
- Recipients: configurable list (internal users or external email addresses)

**PowerPoint Export:**
- Crystal generates a 5-slide executive presentation:
  1. Title slide (period summary)
  2. Key metrics slide
  3. Crystal's analysis slide
  4. Topic highlights slide
  5. Recommended actions slide

**Shareable Link:**
- Token-based read-only link to current dashboard + filter state
- Optional: password-protected
- Optional: expiry date

**Slack/Teams Integration:**
- "Send to Slack" on any widget
- Posts widget image + data summary to configured channel

---

## 10. Backend API Design

### 10.1 Analytics API Endpoints

```
GET /api/analytics/kpis
GET /api/analytics/nps-trend
GET /api/analytics/score-distribution
GET /api/analytics/topics
GET /api/analytics/verbatims
GET /api/analytics/segments
GET /api/analytics/surveys/health
GET /api/analytics/volume-heatmap
GET /api/analytics/crystal/narrative
POST /api/analytics/export/pdf
POST /api/analytics/export/pptx
```

All analytics endpoints accept a shared filter object:

```json
{
  "dateFrom": "2026-05-01",
  "dateTo": "2026-06-01",
  "surveyIds": ["abc123", "def456"],
  "segments": [
    { "field": "device_type", "operator": "eq", "value": "mobile" }
  ],
  "compareWith": "prior_period"
}
```

### 10.2 Key Response Shapes

**`GET /api/analytics/kpis`**
```json
{
  "nps": {
    "current": 42,
    "prior": 45,
    "change": -3,
    "benchmark": 38,
    "trend": "down"
  },
  "responseCount": {
    "current": 1847,
    "prior": 1650,
    "change": 197,
    "changePercent": 11.9
  },
  "responseRate": {
    "current": 0.31,
    "prior": 0.35,
    "change": -0.04
  },
  "crystalInsightCount": 12
}
```

**`GET /api/analytics/nps-trend`**
```json
{
  "series": [
    { "date": "2026-05-01", "nps": 44, "responseCount": 62, "anomaly": null },
    { "date": "2026-05-08", "nps": 45, "responseCount": 71, "anomaly": null },
    { "date": "2026-05-15", "nps": 43, "responseCount": 58, "anomaly": null },
    { "date": "2026-05-22", "nps": 38, "responseCount": 89,
      "anomaly": {
        "type": "drop",
        "crystalNote": "Shipping delays cited in 24% of this week's verbatims"
      }
    }
  ],
  "prediction": [
    { "date": "2026-06-08", "nps": 36, "confidenceLow": 31, "confidenceHigh": 42 },
    { "date": "2026-06-15", "nps": 35, "confidenceLow": 29, "confidenceHigh": 43 }
  ],
  "compareSeries": [...]
}
```

### 10.3 Query Optimization

**Materialized view for NPS aggregation:**
```sql
CREATE MATERIALIZED VIEW nps_daily_agg AS
SELECT
  org_id,
  survey_id,
  DATE_TRUNC('day', submitted_at) AS day,
  COUNT(*) AS response_count,
  AVG(nps_score) AS avg_nps,
  -- NPS calculation
  100.0 * SUM(CASE WHEN nps_score >= 9 THEN 1 ELSE 0 END) / COUNT(*) -
  100.0 * SUM(CASE WHEN nps_score <= 6 THEN 1 ELSE 0 END) / COUNT(*) AS nps
FROM responses
WHERE deleted_at IS NULL
GROUP BY org_id, survey_id, DATE_TRUNC('day', submitted_at);

CREATE UNIQUE INDEX ON nps_daily_agg(org_id, survey_id, day);
```

Refreshed every 5 minutes via scheduled job. Real-time queries fall back to raw table for < 1 hour windows.

---

## 11. Crystal AI Dashboard Integration

### 11.1 Dashboard Narrator Skill

Crystal generates a 3-paragraph executive brief for the current dashboard state:

```python
# crystalos/skills/dashboard_narrator.skill.md → exposes narrate_dashboard tool

async def narrate_dashboard(kpi_data: dict, trend_data: dict, topic_data: dict) -> str:
    """
    Generate a 3-paragraph executive narrative for the current dashboard state.
    
    Paragraph 1: What happened (key metric movements, biggest changes)
    Paragraph 2: Why it happened (Crystal's root cause analysis)
    Paragraph 3: What to watch (emerging risks and opportunities)
    """
```

Triggered:
- When user loads dashboard (cached for 15 minutes per filter state)
- When user clicks "Regenerate" button
- When a critical alert fires (auto-refreshes narrative)

### 11.2 Chart Annotation System

Crystal places markers on trend charts at significant moments:

```json
// Each anomaly annotation:
{
  "date": "2026-05-22",
  "type": "drop",
  "magnitude": -7,
  "crystalNote": "Shipping delays entered top 3 topics",
  "confidence": 0.87,
  "linkTo": "/surveys/abc123/insights?insight=ins-221"
}
```

Rendered as clickable markers on the chart. Click → tooltip with Crystal's explanation + "View full analysis" link.

### 11.3 "Ask Crystal About This Chart"

Every chart has an "Ask Crystal" button (speech bubble icon). Click opens Crystal panel pre-loaded with chart context:

```
Crystal Panel:
┌────────────────────────────────────────┐
│ 🤖 Crystal                          × │
│                                        │
│ You're looking at: NPS Trend           │
│ Filter: Last 30 days, All Surveys      │
│ Current NPS: 42 (down 3 pts)          │
│                                        │
│ Ask me anything about this data...     │
│                                        │
│ Suggested questions:                   │
│ • Why did NPS drop on May 22?          │
│ • Which segment is dragging NPS down?  │
│ • What's the NPS forecast for June?    │
│                                        │
│ [Type a question...]          [Send]   │
└────────────────────────────────────────┘
```

### 11.4 Predictive Overlay

The NPS trend chart includes a dashed continuation line (Crystal's 14-day prediction):
- Rendered as a dashed line with a confidence band (shaded area)
- Tooltip on hover: "Crystal predicts NPS will be 36-43 by June 15. Key assumption: current trend continues."
- "Learn more" link → opens Crystal prediction explanation

---

## 12. Frontend Technical Architecture

### 12.1 Component Hierarchy

```
<DashboardPage>
  <DashboardHeader>
    <GlobalFilterBar />
    <DateRangePicker />
    <ViewSelector />
    <ExportMenu />
  </DashboardHeader>
  
  <DashboardGrid>
    <Widget key={id} config={widgetConfig}>
      <WidgetHeader title actions={[refresh, export, askCrystal]} />
      <WidgetContent>
        {/* Specific widget renders here */}
      </WidgetContent>
      <WidgetFooter lastUpdated crystalConfidence />
    </Widget>
  </DashboardGrid>
  
  <CrystalPanel isOpen={crystalOpen} context={chartContext} />
  <AlertBanner alerts={criticalAlerts} />
</DashboardPage>
```

### 12.2 State Management

| State type | Location | Why |
|------------|----------|-----|
| Filter state | URL params | Shareable, bookmarkable |
| Widget data | React Query (server state) | Auto-refetch, caching |
| Real-time counters | React state (WebSocket) | Local, ephemeral |
| Crystal panel | React context | Cross-component access |
| Dashboard layout | Postgres (saved) + local state | Persisted per user |

### 12.3 Chart Library Recommendation

**Recharts** (current likely choice for Tailwind/React ecosystem) is the baseline for standard charts (line, bar, donut).

For advanced visualizations:
- **Topic bubble chart**: D3.js force simulation (Recharts cannot do this)
- **Volume heatmap**: D3.js or custom Canvas
- **Prediction confidence band**: Recharts `ReferenceArea` + `Line` combined

Chart design system:
- Color palette: aligned with Tailwind theme
- Font: match app typography
- Consistent tooltip design across all charts
- Accessible: ARIA labels, keyboard navigation

### 12.4 Performance Strategy

- **Virtualized verbatim list**: React Virtual for large lists (> 1000 verbatims)
- **Lazy-loaded widgets**: widgets below the fold load on scroll (Intersection Observer)
- **Chart data pagination**: load full trend data on demand (not on page load)
- **React Query cache**: 5-minute stale time for analytics data, 30-second for real-time
- **WebSocket**: single connection shared across all dashboard widgets

---

## 13. ASCII Wireframes

### 13.1 Executive Dashboard (Full Layout)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Experient          [Dashboard] Surveys  Crystal  Insights      🔔3  👤 │
├───────────────────────────────────────────────────────────────────────┤
│ [📅 Last 30 days ▾] [📋 Q4 Customer Survey ▾] [👥 All ▾] [Save view] │
├───────────────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │ NPS  │ │ CSAT │ │ CES  │ │Responses │ │Resp Rate │ │ Insights │  │
│ │  42  │ │ 4.2  │ │ 3.1  │ │  1,847   │ │   31%    │ │    12    │  │
│ │ -3▼  │ │ +0.2▲│ │ -0.1▼│ │  +12%▲   │ │  -4%▼    │ │  +3▲    │  │
│ │ vs30d│ │ vs30d│ │ vs30d│ │  vs30d   │ │  vs30d   │ │  vs30d   │  │
│ └──────┘ └──────┘ └──────┘ └──────────┘ └──────────┘ └──────────┘  │
├───────────────────────────────────────────────────────────────────────┤
│  🤖 CRYSTAL'S STORY                            [Regenerate] [Expand]  │
│  NPS held steady at 42 this period despite increased response volume. │
│  The primary risk factor is 'shipping delays' (now 24% of verbatims). │
│  Crystal predicts NPS in the high 30s by June 15 without intervention.│
│                                              [Read full analysis →]   │
├──────────────────────────────────┬────────────────────────────────────┤
│  NPS TREND (90 days)             │  TOPIC SENTIMENT MATRIX            │
│  50┤                   [⋯]      │                          [⋯]       │
│  45┤    ╭────╮    ╭──           │  Sentiment (-1 to +1)              │
│  40┤   ╭╯    ╰───╯   ╰─        │  +1 ┤ ●(returns)  ●(staff)        │
│  35┤──╮╯                        │   0 ┤         ●(price)             │
│     └──────────────────────     │  -1 ┤ ●(shipping)  ●(app crash)   │
│       3mo  2mo  1mo  now        │     └────────────────────────────  │
│  [🤖 Ask Crystal about trend →] │     Small          Large (volume)   │
├──────────────────────────────────┴────────────────────────────────────┤
│  NPS DISTRIBUTION                │  RECENT VERBATIMS                  │
│  Det  ████████ 23%              │  "Package arrived 2 weeks late"🔴  │
│  Pass ███████████ 30%           │  "Love the return process!" 🟢     │
│  Prom █████████████████ 47%     │  "App crashed during checkout" 🔴  │
│  [Compare to prior →]           │  [View all verbatims →]            │
├──────────────────────────────────┴────────────────────────────────────┤
│  🚨 ACTIVE ALERTS  (2)          │  🤖 CRYSTAL ACTIONS                 │
│  ● NPS -3pts (Q4 Survey)        │  1. Brief supply chain on delays   │
│  ● Response rate 31% (low)      │  2. Investigate iOS 18 crash       │
│       [View all alerts →]       │  3. Add reminder to Q4 Survey      │
└──────────────────────────────────┴────────────────────────────────────┘
```

### 13.2 Filter Panel (Expanded)

```
┌───────────────────────────────────────────┐
│  ← Filters                    [Apply]     │
├───────────────────────────────────────────┤
│  DATE RANGE                               │
│  ● Last 30 days                           │
│  ○ Last 7 days                            │
│  ○ Last 90 days                           │
│  ○ Custom range: [____] to [____]         │
│                                           │
│  COMPARE TO                               │
│  ● Prior period                           │
│  ○ Same period last year                  │
│  ○ None                                   │
├───────────────────────────────────────────┤
│  SURVEYS                                  │
│  [Search surveys...]                      │
│  ☑ Q4 Customer Survey                    │
│  ☐ Onboarding NPS                        │
│  ☐ Post-Purchase Survey                  │
├───────────────────────────────────────────┤
│  SEGMENTS                                 │
│  + Add segment filter                     │
│  Device: [Mobile ▾]                       │
│  Score:  [NPS < 7 ▾]                     │
│  [Remove] [Add another]                   │
├───────────────────────────────────────────┤
│  SAVED FILTERS                            │
│  ● Mobile detractors (last 30d)          │
│  ● Q4 + Enterprise tier                  │
│  [Save current filters...]               │
└───────────────────────────────────────────┘
```

---

## 14. Competitive Analysis

| Capability | Qualtrics | Medallia | Amplitude | Looker | **Experient** |
|------------|-----------|----------|-----------|--------|---------------|
| Executive summary view | ✓ | ✓ | ✗ | Partial | ✓ |
| Crystal AI narrative | ✗ | ✗ | ✗ | ✗ | **✓ Unique** |
| Predictive overlays on charts | ✗ | Partial | ✗ | ✗ | **✓ Unique** |
| "Ask AI about this chart" | Limited | ✗ | ✗ | ✗ | **✓ Crystal** |
| Drag-and-drop builder | ✓ | ✓ | ✓ | ✓ | ✓ |
| Real-time WebSocket updates | Partial | ✓ | ✓ | ✗ | ✓ |
| Crystal action recommendations | ✗ | ✗ | ✗ | ✗ | **✓ Unique** |
| Compare mode (dual filter) | Partial | ✓ | ✓ | ✓ | ✓ |
| Cross-survey correlation widget | ✗ | ✗ | N/A | N/A | **✓ Unique** |
| PowerPoint export | ✓ | ✓ | ✗ | ✗ | ✓ |
| Anomaly annotations on charts | ✗ | Partial | ✓ | ✗ | **✓ Crystal** |

**What makes Experient's dashboard category-defining:**
1. Crystal narrates every dashboard — no competitor does this
2. Predictive overlays on trend charts — see the future, not just the past
3. "Ask Crystal" on any widget — conversational data exploration
4. Action board — Crystal tells you what to do, not just what happened
5. Cross-program correlation visible on a single dashboard

---

## 15. Implementation Roadmap

### Phase 1 — Core KPIs + Date Filter (Weeks 1-2)
- [ ] NPS, CSAT, response count, response rate tiles
- [ ] NPS trend line chart (Recharts)
- [ ] Date range filter (preset options only)
- [ ] Survey filter (single survey)
- [ ] Static Crystal narrative card (copy placeholder → wire up in Phase 3)
- [ ] Basic analytics API: `/kpis` and `/nps-trend`

### Phase 2 — Topics + Distribution + Verbatims (Weeks 3-4)
- [ ] NPS distribution bar chart
- [ ] Topic list (simple, no bubble chart yet)
- [ ] Verbatim stream (recent 20, no search)
- [ ] Segment filter (basic: mobile vs desktop)
- [ ] Alert banner integration
- [ ] Materialized view for nps_daily_agg

### Phase 3 — Crystal AI Integration (Weeks 5-6)
- [ ] Crystal narrative card (live API call)
- [ ] Chart anomaly annotations from Crystal
- [ ] Crystal action board
- [ ] "Ask Crystal" panel on charts
- [ ] Crystal prediction overlay (dashed line + confidence band)
- [ ] Crystal insight count tile (linked to Insights Dashboard)

### Phase 4 — Custom Layout Builder + Sharing (Weeks 7-8)
- [ ] Drag-and-drop widget layout
- [ ] Widget library browser
- [ ] Save/load dashboard layouts
- [ ] Shareable URLs with filter state
- [ ] PDF export (Puppeteer)
- [ ] Compare mode (dual filter)

### Phase 5 — Real-Time + Advanced Charts (Weeks 9-10)
- [ ] WebSocket integration for live counts
- [ ] Topic bubble chart (D3 force simulation)
- [ ] Volume heatmap (D3 or Canvas)
- [ ] Verbatim search and full-text filter
- [ ] Period-over-period waterfall chart
- [ ] Scheduled digest email

### Phase 6 — Enterprise & Scale (Ongoing)
- [ ] PowerPoint export
- [ ] Role-based default layouts
- [ ] External sharing (read-only link with expiry)
- [ ] Slack/Teams widget sharing
- [ ] Benchmark comparison (industry data integration)
- [ ] Advanced segment builder (demographic, behavioral)

---

*Document prepared by the Dashboard cross-functional team — Experient Platform Design Series, June 2026.*
