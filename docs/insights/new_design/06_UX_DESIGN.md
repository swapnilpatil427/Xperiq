# UX Design — Insight Trail & Run Modes

> **Primary surfaces:** Insight Trail (history), Manual Run dialog, Intelligence page (active), Crystal handoff.  
> All strings via `locales/en.ts` — keys proposed below.

---

## 1. Information architecture

```
Experience
└── Surveys
    └── {survey}
        ├── Intelligence (active automated projection)     ← existing, refined
        ├── Insight Trail (NEW)                            ← automated + manual history
        ├── Trends                                         ← existing
        └── Settings → Insights config (NEW)             ← or under Brand Settings
```

**Route constants:**

```typescript
SURVEY_INTELLIGENCE_TRAIL: '/experience/surveys/:surveyId/intelligence/trail'
SURVEY_INTELLIGENCE_REPORT: '/experience/surveys/:surveyId/intelligence/reports/:reportId'
SURVEY_INTELLIGENCE_TRAIL_CHECKPOINT: '/experience/surveys/:surveyId/intelligence/trail/:checkpointId'
```

---

## 2. Insight Trail page

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Insight Trail · Acme Support NPS                    [Generate report ▾] │
├─────────────────────────────────────────────────────────────────────────┤
│ Filters: [All] [Automated ●] [Manual]     Range: [90 days ▾]  [Compare] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  AUTOMATED LANE ─────────────────────────────────────────────────────   │
│                                                                         │
│  ● Checkpoint #14 · Today 2:04pm · system · +12 responses               │
│    NPS 41 (−3.2)  ·  2 emerged  ·  1 declining          [Open report] │
│    ╎                                                                    │
│  ○ Checkpoint #13 · Yesterday · +28 responses (collapsed ×3 similar)    │
│    NPS 44 · stable                                      [Expand]        │
│    ╎                                                                    │
│  ○ Checkpoint #9 · Jun 18 · milestone 100+            [Open report]    │
│                                                                         │
│  MANUAL LANE ───────────────────────────────────────────────────────   │
│                                                                         │
│  ★ Expert · Jun 20 · Sarah Chen · "Q2 board prep"                     │
│    Window: Apr 1 – Jun 20 · 1,240 responses · 38 insights [Open]      │
│                                                                         │
│  ⚡ Quick · Jun 22 · Sarah Chen · "Monday standup"                      │
│    Window: last 14 days · 150 sampled                   [Open]          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Visual language

| Element | Automated | Manual Expert | Manual Quick |
|---------|-----------|---------------|--------------|
| Icon | `auto_awesome` / pulse dot | `psychology` | `bolt` |
| Lane color | Primary blue | Purple | Amber |
| Badge | `Automated` | `Expert report` | `Quick brief` |

### Collapsed similar checkpoints

When `collapse_similar_checkpoints=true` and 3+ consecutive `meaningful_delta=false`:
- UI shows rollup: *"3 routine updates (Jun 21–22) · NPS stable"*
- Expand reveals individual nodes
- Backend still stores (or compaction job merges — ops decision)

---

## 3. Checkpoint detail view

**Route:** `/trail/:checkpointId`

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Trail    Checkpoint #14 · Automated · Jun 24, 2026 2:04pm           │
├─────────────────────────────────────────────────────────────────────────┤
│ [Summary] [What changed] [Sources] [Lineage] [Compare to #13]           │
├─────────────────────────────────────────────────────────────────────────┤
│ WHAT CHANGED                                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ NPS 41.0 (−3.2 vs #13)   CSAT 4.1 (stable)   +12 new responses    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Emerged: "Billing confusion" (+8% share)                                │
│ Declining: "Slow login" (−6pp)                                          │
│ Stable: "Product quality", "Support wait times"                         │
│                                                                         │
│ LINEAGE                                                                 │
│ Parent: Checkpoint #13                                                  │
│ Referenced: #9, #10, #11, #12, #13 (lookback=5)                         │
│ New responses: 12 (view list)                                           │
│ Created by: system (response stream)                                    │
│ Config: lookback=5, threshold=10 at generation time                     │
│                                                                         │
│ [Open full report document]  [Ask Crystal about this checkpoint]        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tabs

| Tab | Content |
|-----|---------|
| Summary | Executive digest from blob |
| What changed | `delta_from_prior` visualization |
| Sources | `citations_manifest` — filterable response list |
| Lineage | Linked list graph (simple vertical, not force-directed) |

---

## 4. Manual Run dialog

Triggered from Intelligence page, Trail page, or Crystal action card.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Generate insight report                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Mode                                                                    │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │ ★ Expert             │  │ ⚡ Quick              │                     │
│  │ Deepest analysis     │  │ Executive brief       │                     │
│  │ 3–8 min · full depth │  │ ~1 min · top findings │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
│                                                                         │
│ Time window                                                             │
│  [Last 30 days ▾]  or  custom [Jun 1] – [Jun 24]                       │
│                                                                         │
│ Preview                                                                 │
│  Responses in window: 1,240                                           │
│  Expert will analyze: full corpus (≤500 cap applies above)              │
│  Snapshots included: 5                                                │
│  Estimated: ~4 min · ~$0.18                                             │
│                                                                         │
│ Label (optional): [ Q2 board prep________________ ]                     │
│                                                                         │
│                              [Cancel]  [Generate report]              │
└─────────────────────────────────────────────────────────────────────────┘
```

### i18n keys (proposed)

```typescript
insightTrail: {
  title: 'Insight Trail',
  laneAutomated: 'Automated',
  laneManual: 'Manual',
  checkpointOpen: 'Open report',
  collapsedSimilar: '{count} routine updates',
  deltaNps: 'NPS {value} ({delta})',
  emerged: 'Emerged',
  declining: 'Declining',
  ...
},
manualRun: {
  title: 'Generate insight report',
  modeExpert: 'Expert',
  modeExpertDesc: 'Deepest analysis — industry-leading detail',
  modeQuick: 'Quick',
  modeQuickDesc: 'Executive brief in about a minute',
  windowLabel: 'Time window',
  previewCorpus: 'Responses in window: {count}',
  ...
}
```

---

## 5. Intelligence page (active view) — header

**When `insights_trajectory_v1` is OFF (default):**
The existing header strip renders:
    Active intelligence · Updated 2h ago via automated checkpoint #14
    [View trail]  [Generate report ▾]  [↻ Refresh]

**When `insights_trajectory_v1` is ON:**
The Enhanced Header Band (Section 15) REPLACES this strip entirely. The band incorporates all controls:
- `[View trail]` moves to the band's right action area
- `[Generate report ▾]` moves to the band's right action area
- `[↻ Refresh]` moves to the band (with full Section 12 state machine)
- Legacy NPS row is hidden (the band includes NPS + delta chip)

No separate "header strip" renders when the flag is on. There is no duplicate provenance line.

Cards remain sourced from `projection_source_checkpoint_id`.

---

## 6. Compare mode

Select two checkpoints → split view:

| Left | Right |
|------|-------|
| Checkpoint #12 | Checkpoint #14 |
| Metrics diff | Topic lifecycle diff |
| Side-by-side theme lists | |

API: `GET /trail/:id/compare/:otherId`

---

## 7. Empty & edge states

| State | Message |
|-------|---------|
| No checkpoints | "Insights will appear after 10 responses" + tier banner |
| Automated disabled | "Automated updates off — generate a manual report" |
| Low volume manual | Warning badge: `Exploratory · low sample (n=23)` |
| Generating | SSE overlay (reuse `GeneratingOverlay`) |

---

## 8. Mobile

- Trail: vertical timeline only
- Compare: disabled on mobile → "Open on desktop"
- Manual run: Quick mode promoted

---

## 9. Accessibility

- Timeline keyboard navigable
- Delta values include text equivalents ("decreased by 3.2 points")
- Lane filters as toggle button group with `aria-pressed`

---

## 10. Integration with Trends page

Cross-link:
- Trend chart point click → "View checkpoint at this time" (nearest `created_at`)
- Checkpoint detail → "See metrics in Trends" deep link with date range

---

## 11. Permissions

| Action | Role |
|--------|------|
| View trail | `insights:read` |
| Manual Expert | `insights:run_manual` |
| Manual Quick | `insights:run_manual` |
| Configure settings | `insights:configure` or admin |

---

## 12. Refresh button UX (Intelligence page)

"Refresh" lives on the existing Intelligence page alongside the active insight cards.
It is **not** the same as "Generate report" — it updates live dashboard cards, not documents.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Intelligence · Acme Support NPS                                         │
│ Active intelligence · Updated 2h ago via checkpoint #14                 │
│                                [View trail]  [↻ Refresh]  [Generate ▾] │
├─────────────────────────────────────────────────────────────────────────┤
│                   ... insight cards ...                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Refresh button states

| State | Label | Behavior |
|-------|-------|----------|
| Default | `↻ Refresh` | Opens confirm dialog |
| Loading | `↻ Refreshing…` | Disabled; shows spinner |
| Cooldown (daily limit hit) | `↻ Refresh (5/5 today)` | Disabled; tooltip: "Daily limit reached" |
| Insufficient credits | `↻ Refresh` | 402 → shows toast: "Not enough credits (need 8, have N)" |
| Insufficient data | `↻ Refresh` | 400 `insufficient_data` → shows toast: "Not enough responses — try expanding the window manually" |
| Rate limited (429) | `↻ Refresh (5/5 today)` | Same as Cooldown; server 429 confirms daily cap reached |

### Refresh confirm dialog

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Refresh intelligence?                                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ This will reanalyze the last 30 days of responses and update the        │
│ active intelligence cards.                                              │
│                                                                         │
│ Responses in window: 234                                                │
│ Estimated time: ~45 seconds                                             │
│ Cost: 8 credits  (balance: 1,250)                                       │
│                                                                         │
│                              [Cancel]  [Refresh (8 credits)]           │
└─────────────────────────────────────────────────────────────────────────┘
```

- Lookback window shown explicitly so users understand scope
- Credit cost shown before confirmation
- If window has fewer than `refresh_min_response_count` responses, show: *"Expanding window to find at least 25 responses..."* with the actual expanded range

---

## 13. Insight settings page (read-only for members, editable for admins)

**Route:** `/experience/surveys/:surveyId/settings/insights`

> **Decision — full route, not modal.** The settings page has six sections (A–F) plus per-run-type credit overrides; this is too much content for a modal. Render it as a standalone page. The frontend route constant to create is `EXPERIENCE_SURVEY_INSIGHT_SETTINGS`; the path should follow the existing singular-`survey` pattern used throughout `app/src/constants/routes.ts` (e.g. `/app/experience/survey/:surveyId/settings/insights`).

### RBAC rendering rules

| Role | View settings | Edit settings |
|------|--------------|---------------|
| Viewer / Analyst | Read-only UI (lock icons on inputs) | No |
| Survey owner | Read settings | Edit own survey's settings only |
| brand_admin | Full edit | Yes |

Non-admins see the **exact same page** as admins, but all inputs are disabled and have a lock icon.
Do not hide the page — visibility builds trust in the platform configuration.

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Survey settings  › Insights configuration                            │
│                              [🔒 Read-only — contact your admin]        │
├───────────────────────┬─────────────────────────────────────────────────┤
│ A. Automated updates  │                                                 │
│ B. Refresh            │  A. AUTOMATED UPDATES                           │
│ C. Manual reports     │  ┌──────────────────────────────────────────┐   │
│ D. Custom Analysis    │  │ Enable automatic insight updates     [●]  │   │
│ E. Credits & limits   │  │ Enable automated report generation   [○]  │   │
│ F. Retention          │  └──────────────────────────────────────────┘   │
│                       │  Stream response threshold:  [  10  ] responses │
│                       │   Min 5 · Max 500                               │
│                       │                                                 │
│                       │  B. REFRESH                                     │
│                       │  Lookback window:  [  30  ] days               │
│                       │  Minimum responses: [ 25 ]  (expands if needed) │
│                       │  Daily limit:      [  5  ] refreshes / day     │
│                       │                                                 │
│                       │  C. MANUAL REPORTS                              │
│                       │  Daily run limit:  [ 10 ] reports / day        │
│                       │                                                 │
│                       │  D. CUSTOM ANALYSIS                             │
│                       │  Enable custom analysis     [●]               │
│                       │  Daily limit:       [  3  ] analyses / day     │
│                       │                                                 │
│                       │  E. CREDIT COSTS (per run)                      │
│                       │  Automated checkpoint:  [ -- ] (org default: 5) │
│                       │  Automated report doc:  [ -- ] (org default: 15)│
│                       │  Refresh:              [ -- ] (org default: 8)  │
│                       │  Manual Quick:         [ -- ] (org default: 15) │
│                       │  Manual Expert:        [ -- ] (org default: 40) │
│                       │  Leave blank to use org defaults.               │
│                       │                                                 │
│                       │                        [Reset to defaults]      │
│                       │                        [Save changes]           │
└───────────────────────┴─────────────────────────────────────────────────┘
```

**Lock icon behavior (non-admin view):** All inputs render as `disabled`. Toggles show state but
cannot be clicked. A banner at the top reads: "These settings are managed by your admin. Contact
your brand administrator to make changes." All values are still visible for transparency.

### i18n keys (additions)

```typescript
insightSettings: {
  title: 'Insights configuration',
  readOnlyBanner: 'Read-only — contact your admin',
  sectionAutomated: 'Automated updates',
  sectionRefresh: 'Refresh',
  sectionManual: 'Manual reports',
  sectionCustom: 'Custom Analysis',
  sectionCredits: 'Credit costs (per run)',
  streamThreshold: 'Stream response threshold',
  streamThresholdHint: 'Min {min} · Max {max}',
  refreshLookback: 'Lookback window',
  refreshMinResponses: 'Minimum responses (expands window if needed)',
  refreshDailyLimit: 'Daily refresh limit',
  creditOrgDefault: '(org default: {value})',
  creditLeaveBlank: 'Leave blank to use org defaults.',
  resetToDefaults: 'Reset to defaults',
  saveChanges: 'Save changes',
}
```

---

## 14. Custom Analysis

Custom Analysis is a **separate product surface** — it has its own nav entry, its own run queue, and writes results exclusively to `custom_report_insights` (never the `insights` table). It never supersedes the active automated projection.

### Nav placement

```
Experience
└── Surveys
    └── {survey}
        ├── Intelligence
        ├── Insight Trail
        ├── Trends
        ├── Reports            ← NEW top-level nav item (alongside existing sections)
        │   └── Custom Analysis  ← default child route
        └── Settings → Insights config
```

### Route constants (to add)

```typescript
EXPERIENCE_SURVEY_REPORTS_CUSTOM: '/app/experience/survey/:surveyId/reports/custom'
EXPERIENCE_SURVEY_REPORTS_RESULT: '/app/experience/survey/:surveyId/reports/:reportId'
```

Both follow the existing singular-`survey` pattern used throughout `app/src/constants/routes.ts`.

---

### 14.1 Custom Analysis wizard

The wizard is a 3-step flow accessed at `EXPERIENCE_SURVEY_REPORTS_CUSTOM`. Each step is a full-width page panel (not a modal dialog).

#### Step 1 — Scope

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Custom Analysis · Step 1 of 3 · Scope               ○──●──○──○         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Date range                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │  From   [Jun 1, 2026]│  │  To  [Jun 24, 2026]  │                     │
│  └──────────────────────┘  └──────────────────────┘                     │
│  Quick: [Last 7 days]  [Last 30 days]  [Last 90 days]  [Custom ●]      │
│                                                                         │
│  Segment filter  (optional — single filter)                             │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Filter by ▾ [Select attribute]  =  [Select value]               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ℹ  One segment filter supported per run. Multiple filters coming soon. │
│                                                                         │
│  Survey scope                                                           │
│  ● This survey only (Acme Support NPS)                                  │
│                                                                         │
│                                            [Cancel]  [Next: Focus →]   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Step 2 — Focus

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Custom Analysis · Step 2 of 3 · Focus               ○──○──●──○         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Topics  (top 10 by response volume in selected range)                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ ☑ Billing confusion (148)   ☑ Slow login (112)                   │   │
│  │ ☑ Product quality (98)      ☐ Support wait times (67)            │   │
│  │ ☑ Onboarding friction (54)  ☐ Feature requests (41)              │   │
│  │ ☐ Pricing clarity (38)      ☐ Mobile app bugs (29)               │   │
│  │ ☐ API reliability (22)      ☐ Documentation gaps (18)            │   │
│  │                                            [Select all / None]   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Metric types                                                           │
│  ☑ NPS breakdown    ☑ CSAT distribution    ☐ Sentiment shift            │
│  ☑ Topic lifecycle  ☐ Verbatim highlights                               │
│                                                                         │
│  Narrative depth                                                        │
│  ● Summary   (key findings only, ~2 min)                                │
│  ○ Detailed  (full analysis + quotes + recommendations, ~5 min)         │
│                                                                         │
│                               [← Back: Scope]  [Next: Output →]        │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Step 3 — Output & credit preview

The credit preview is computed server-side when the user arrives at Step 3 (`POST /api/insights/:surveyId/custom-analysis/preview`). The preview is non-binding — the actual run is only triggered on "Generate".

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Custom Analysis · Step 3 of 3 · Output              ○──○──○──●         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Report name  (optional)                                                │
│  [ Q2 billing deep-dive________________________ ]                       │
│                                                                         │
│  Output format                                                          │
│  ● Standard report   ○ Executive summary only                           │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ ANALYSIS PREVIEW                                                 │   │
│  │                                                                  │   │
│  │  Responses in scope: 37   ·  Topics selected: 5                  │   │
│  │  Corpus size tier:   ≤500 responses  →  25 credits               │   │
│  │  Your balance:       1,210 credits                               │   │
│  │                                                                  │   │
│  │  ⚠  Exploratory accuracy (n=37)                                  │   │
│  │     Sample is below 30 responses. NPS and sentiment metrics      │   │
│  │     will carry a degraded trust score (capped at 55). Results    │   │
│  │     are directional only — not suitable for executive reporting. │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ℹ  Results are stored in Custom Analysis history and do not affect     │
│     your active Intelligence view.                                      │
│                                                                         │
│                          [← Back: Focus]  [Generate (25 credits)]      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Trust degradation rule:** When the matched corpus has n < 30:
- Trust score capped at 55 (vs standard ceiling of 100)
- Badge shown on Step 3 preview and on the results page: `Exploratory (n=37)`
- NPS metric rendered with explicit caveat; no "active projection" link shown

**Credit cost tiers** (from `05_CONFIGURATION.md` Section 7):

| Corpus size | Credits |
|-------------|---------|
| ≤ 500 responses | 25 |
| ≤ 2,000 responses | 50 |
| > 2,000 responses | 75 |

---

### 14.2 Custom Analysis results page

**Route:** `EXPERIENCE_SURVEY_REPORTS_RESULT` → `/app/experience/survey/:surveyId/reports/:reportId`

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Reports    Q2 billing deep-dive · Jun 24, 2026                        │
│              Custom Analysis · Sarah Chen · 25 credits used             │
├─────────────────────────────────────────────────────────────────────────┤
│ FILTER SUMMARY                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Date: Jun 1 – Jun 24, 2026  ·  Segment: Region = APAC              │ │
│ │ Topics: Billing confusion, Slow login, Product quality (+2 more)    │ │
│ │ Metrics: NPS, CSAT, Topic lifecycle  ·  Depth: Detailed             │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ ⚠  EXPLORATORY (n=37)                                           │    │
│  │    Sample below 30. Metrics are directional only.               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│ [Summary]  [Findings]  [Sources]  [Run details]                         │
├─────────────────────────────────────────────────────────────────────────┤
│ KEY FINDINGS                                                            │
│                                                                         │
│  NPS  38  ·  trust 55/100  ·  Exploratory                              │
│  CSAT  3.9 (37 responses)                                               │
│                                                                         │
│  Emerged:   "Invoice format confusion" (+12pp share)                    │
│  Declining: "Payment timeout errors"   (−8pp)                           │
│  Stable:    "Billing support response time"                             │
│                                                                         │
│                          [Ask Crystal about this report]               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Differences from Manual Run result:**
- Filter summary panel always visible at top (no equivalent in manual run)
- `Exploratory (n=37)` badge displayed when n < 30; absent otherwise
- No "active projection" link (custom results never become the active intelligence)
- "Run details" tab shows the wizard selections (date range, segment, topics, depth) rather than checkpoint lineage

---

### 14.3 Custom Analysis history (empty & list states)

**Route:** `EXPERIENCE_SURVEY_REPORTS_CUSTOM` also serves as the list view when prior runs exist.

**Empty state** (no Custom Analysis runs yet):

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Reports · Acme Support NPS                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│               ┌──────────────────────────────────┐                      │
│               │                                  │                      │
│               │   [chart icon]                   │                      │
│               │                                  │                      │
│               │   No custom analyses yet         │                      │
│               │                                  │                      │
│               │   Run a targeted analysis on any │                      │
│               │   date range, segment, or topic  │                      │
│               │   combination.                   │                      │
│               │                                  │                      │
│               │   [+ New Custom Analysis]        │                      │
│               │                                  │                      │
│               └──────────────────────────────────┘                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**List state** (prior runs exist):

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Reports · Acme Support NPS                     [+ New Custom Analysis]  │
├─────────────────────────────────────────────────────────────────────────┤
│  Jun 24  Q2 billing deep-dive        Sarah Chen   Exploratory (n=37)   │
│          Jun 1 – Jun 24 · APAC · 5 topics · 25 credits    [Open]       │
│  ─────────────────────────────────────────────────────────────────────  │
│  Jun 20  Onboarding friction Q2      Sarah Chen   Standard              │
│          May 1 – Jun 20 · All segments · 3 topics · 25 credits [Open]  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 14.4 Permissions

| Action | Role |
|--------|------|
| View Custom Analysis page | `insights:read` |
| Run Custom Analysis | `insights:run_manual` (same permission as manual reports) |
| Disable / configure Custom Analysis | `insights:configure` or `brand_admin` |

---

### 14.5 i18n keys

All new strings use the `customAnalysis:` namespace:

```typescript
customAnalysis: {
  // Nav & page titles
  navLabel: 'Reports',
  pageTitle: 'Custom Analysis',
  newButton: 'New Custom Analysis',

  // Wizard step labels
  wizardStep1: 'Scope',
  wizardStep2: 'Focus',
  wizardStep3: 'Output',
  stepOf: 'Step {current} of {total}',

  // Step 1 — Scope
  dateRangeLabel: 'Date range',
  dateFrom: 'From',
  dateTo: 'To',
  quickLast7: 'Last 7 days',
  quickLast30: 'Last 30 days',
  quickLast90: 'Last 90 days',
  quickCustom: 'Custom',
  segmentLabel: 'Segment filter',
  segmentHint: 'One segment filter supported per run. Multiple filters coming soon.',
  segmentFilterBy: 'Filter by',
  segmentSelectAttr: 'Select attribute',
  segmentSelectValue: 'Select value',
  surveyScope: 'Survey scope',
  surveyScopeThisOnly: 'This survey only ({surveyName})',

  // Step 2 — Focus
  topicsLabel: 'Topics',
  topicsHint: 'Top {count} by response volume in selected range',
  topicsSelectAll: 'Select all',
  topicsSelectNone: 'None',
  metricTypesLabel: 'Metric types',
  metricNps: 'NPS breakdown',
  metricCsat: 'CSAT distribution',
  metricSentiment: 'Sentiment shift',
  metricTopicLifecycle: 'Topic lifecycle',
  metricVerbatim: 'Verbatim highlights',
  narrativeDepthLabel: 'Narrative depth',
  narrativeSummary: 'Summary',
  narrativeSummaryDesc: 'Key findings only, ~2 min',
  narrativeDetailed: 'Detailed',
  narrativeDetailedDesc: 'Full analysis + quotes + recommendations, ~5 min',

  // Step 3 — Output & preview
  reportNameLabel: 'Report name',
  outputFormatLabel: 'Output format',
  outputStandard: 'Standard report',
  outputExecutive: 'Executive summary only',
  previewTitle: 'Analysis preview',
  previewResponses: 'Responses in scope: {count}',
  previewTopicsSelected: 'Topics selected: {count}',
  previewCorpusTier: 'Corpus size tier: {tier} responses → {credits} credits',
  previewBalance: 'Your balance: {balance} credits',
  previewNoteStorage: 'Results are stored in Custom Analysis history and do not affect your active Intelligence view.',
  generateButton: 'Generate ({credits} credits)',

  // Trust / exploratory
  exploratoryBadge: 'Exploratory (n={count})',
  exploratoryWarningTitle: 'Exploratory accuracy (n={count})',
  exploratoryWarningBody: 'Sample is below 30 responses. NPS and sentiment metrics will carry a degraded trust score (capped at 55). Results are directional only — not suitable for executive reporting.',

  // Results page
  filterSummaryDate: 'Date: {from} – {to}',
  filterSummarySegment: 'Segment: {segment}',
  filterSummaryTopics: 'Topics: {topics}',
  filterSummaryMetrics: 'Metrics: {metrics}',
  filterSummaryDepth: 'Depth: {depth}',
  tabSummary: 'Summary',
  tabFindings: 'Findings',
  tabSources: 'Sources',
  tabRunDetails: 'Run details',
  askCrystal: 'Ask Crystal about this report',

  // History / list
  historyEmpty: 'No custom analyses yet',
  historyEmptyDesc: 'Run a targeted analysis on any date range, segment, or topic combination.',
  historyExploratoryBadge: 'Exploratory (n={count})',
  historyStandardBadge: 'Standard',

  // Nav breadcrumb actions
  backToReports: '← Reports',
}
```

---

## 15. Investigation Details — Phase 0.5 UX

> **Feature flag:** `insights_trajectory_v1` — off by default; flip per org for testing.  
> **Scope:** Existing Intelligence page only. No new routes. No Insight Trail required.  
> **Figma flow:** [Investigation Details — User Flow (FigJam)](https://www.figma.com/board/dRnPHU0um6maVk3wnPToFg)

This section specifies all UX surfaces delivered by Phase 0.5 (see `08_MIGRATION_ROADMAP.md`). The goal is to show customers complete investigation details — what changed, why, on what evidence — on the existing Intelligence page, without waiting for the full v2 Trail UI.

---

### 15.0 State machine

Four input conditions → four UI states:

**State 1 — Loading (null or fetching)**
  Condition: `isLoading === true || latestCheckpoint === null`
  Note: `'loading'` is not a `run_status` value from the backend. Use React
  loading state (`isLoading` from the data fetching hook) and null-check on
  `latestCheckpoint`. `latestCheckpoint` is null until the backend task
  "Add `latest_checkpoint` to GET /api/insights/:surveyId/list response"
  from the Phase 0.5 roadmap is completed. Until that task ships, all States
  3–5 are unreachable.
  UI: Skeleton state (Screen 15.1a — animate-pulse shimmer)

**State 2 — Generating (pipeline active)**
  Condition: `run_status === 'running'`
  UI: Enhanced Header Band with "Analyzing…" mode:
    - Delta chip → replaced by pulsing text: "Analyzing {newResponseCount} new responses…"
      class: "text-xs text-zinc-400 animate-pulse font-mono"
    - [View details →] → hidden
    - [↻ Refresh] → disabled (matches Section 12 "Loading" state)
    - NPS number → shows last known value (from previous checkpoint)
    - Provenance line → "Analysis in progress…"
  Topic change bar (Section 15.3) → hidden during generation

**State 3 — Bootstrap (first checkpoint, checkpoint_number === 1)**
  Condition: `latestCheckpoint.checkpoint_number === 1`
  UI: Screen 15.1b (no delta chip, no topic chips)
  Drawer: Baseline empty state for Section A and B

**State 4 — Legacy checkpoint (checkpoint_number > 1, delta === null)**
  Condition: `latestCheckpoint.checkpoint_number > 1 && latestCheckpoint.delta === null`
  UI: Legacy mode — NPS number shown, no delta chip, no topic chips
      Provenance line shown (Updated X ago · trigger · checkpoint #N · Y responses)
      [View details →] shown (opens drawer in legacy mode)
  Drawer Section A: "Delta not available — this checkpoint predates investigation tracking."
                    Current NPS shown, no sparkline.
  Drawer Section B: "—" placeholder with caption "No change data for this checkpoint"
  Drawer Sections C + D: Render normally

**State 5 — Full delta (checkpoint_number > 1, delta present)**
  Condition: `latestCheckpoint.checkpoint_number > 1 && latestCheckpoint.delta !== null`
  UI: Screen 15.1c (full band with delta chip + topic chips)
  Topic bar: Screen 15.3 (only if delta.topic_changes.length > 0)
  Drawer: Full content (Sections A–D)

Feature flag guard:
  {showTrajectory ? <EnhancedHeaderBand state={...} /> : <LegacyHeaderStrip />}
  LegacyHeaderStrip = the Section 5 "OFF" strip above.

---

### 15.1 Intelligence page — Enhanced Header Band

Replaces the existing static NPS row. Full-width card above insight cards.

#### Screen 15.1a — Skeleton (loading)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ bg-zinc-900  border border-zinc-800  rounded-2xl  px-6 py-5  mb-6      │
│ animate-pulse                                                           │
│                                                                         │
│  ████████████████████████████  ← provenance line  h-3 w-72 rounded-full│
│                                                                         │
│  ████████████████  ████████████████████████  ← NPS + chip              │
│  h-16 w-20         h-6 w-28   rounded-full                             │
│                                                                         │
│  ████████████████  ████████████████  ← topic chips                     │
│  h-6 w-24          h-6 w-24                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Screen 15.1b — Baseline state (first checkpoint, no delta)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ bg-zinc-900  border border-zinc-800  rounded-2xl  px-6 py-5  mb-6      │
│                                                                         │
│  ●  First analysis · checkpoint #1 · 847 responses analyzed             │
│  text-xs  text-zinc-400  font-mono  gap-1.5  mb-4                       │
│                                                                         │
│  41       [View details →]  |  [View trail]  [Generate ▾]  [↻ Refresh] │
│  text-7xl font-black zinc-100  text-violet-400 text-sm                  │
│  Net Promoter Score                                                     │
│  text-xs zinc-400                                                       │
│                                                                         │
│  (no delta chip — hidden)                                               │
│  (no topic chips — hidden)                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

"View details →" still opens the Investigation Drawer. The drawer shows a baseline-mode Section A.

#### Screen 15.1c — Full delta state (checkpoint ≥ 2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ bg-zinc-900  border border-zinc-800  rounded-2xl  px-6 py-5  mb-6      │
│                                                                         │
│  ●  ✦  Updated 2h ago · automated · checkpoint #14 · 12 new responses  │
│  text-xs  text-zinc-400  font-mono  LiveDot(zinc-500/60)  mb-4          │
│                                                                         │
│  ┌──────────────────────────────┐   ┌────────────────────────────────────────────────────┐  │
│  │  41  [↓3.2 since #13]       │   │  [▲ 2 emerged]  [▼ 1 declining]                    │  │
│  │  ─────────────────────       │   │  [View details →] | [View trail] [Generate ▾] [↻ Refresh] │
│  │  text-7xl font-black zinc-100│   │                                                    │  │
│  │  chip: bg-rose-500/15        │   │  chips: bg-emerald-950/rose-950                    │  │
│  │        text-rose-400         │   │  text-emerald-500/rose-500                         │  │
│  │        border-rose-500/40    │   │  rounded-full px-3 py-1 text-xs                    │  │
│  │        rounded-full px-2.5   │   │                                                    │  │
│  │        cursor-pointer        │   │  "View details →"                                  │  │
│  │        ← opens drawer        │   │  text-violet-400 text-sm                           │  │
│  │  Net Promoter Score          │   │  font-medium hover:violet-300                      │  │
│  │  text-xs zinc-400 mt-1       │   │                                                    │  │
│  └──────────────────────────────┘   └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Right action area — order (left to right):**
1. `[▲ N emerged]` chip (if emerged > 0) — read-only
2. `[▼ N declining]` chip (if declined > 0) — read-only
3. `[View details →]` — opens drawer
4. separator `|`
5. `[View trail]` — text link, zinc-400; only shown when `insights_trail_ui` flag is also on; when flag is off, grayed with tooltip "Coming in Phase 4"
6. `[Generate ▾]` — dropdown button (same as Section 5 original)
7. `[↻ Refresh]` — uses the exact same 6-state machine as Section 12. Section 15 does not re-specify it — refer to Section 12 for all states, labels, confirm dialog, and error handling.

**Delta chip color rules:**

| Condition | Background | Text | Border |
|-----------|-----------|------|--------|
| delta < −2 | `bg-rose-500/15` | `text-rose-400` | `border-rose-500/40` |
| delta > +2 | `bg-emerald-500/15` | `text-emerald-400` | `border-emerald-500/40` |
| abs(delta) < 2 | `bg-zinc-800` | `text-zinc-400` | `border-zinc-700` |

**Component list:**

| Component | Tailwind classes |
|-----------|-----------------|
| Band root | `bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-5 w-full mb-6` |
| Provenance row | `flex items-center gap-1.5 text-xs text-zinc-400 font-mono mb-4` |
| `LiveDot` | `w-1.5 h-1.5 rounded-full bg-zinc-500/60` + `animate-pulse` only when `run_status === 'running'` OR last checkpoint was < 5 minutes ago. Static (no animation) when system is idle. Implementation: `className={cn("w-1.5 h-1.5 rounded-full bg-zinc-500/60", isRecent && "animate-pulse")}` where `isRecent = (Date.now() - new Date(latestCheckpoint.created_at).getTime()) < 5 * 60 * 1000` |
| NPS number | `text-7xl font-black text-zinc-100 leading-none tabular-nums` |
| Delta chip | `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold mb-2 cursor-pointer hover:bg-*/25 transition-colors duration-150` (color per table above) |
| NPS label | `text-xs text-zinc-400 font-medium mt-1` |
| Topic chip (▲) | `rounded-full px-3 py-1 text-xs font-medium bg-emerald-950 text-emerald-500 border border-emerald-500/20 cursor-default opacity-75` (read-only — no hover state) |
| Topic chip (▼) | `rounded-full px-3 py-1 text-xs font-medium bg-rose-950 text-rose-500 border border-rose-500/20 cursor-default opacity-75` (read-only — no hover state) |
| View details link | `text-sm text-violet-400 font-medium hover:text-violet-300 transition-colors flex items-center gap-1` |
| View trail link | `text-sm text-zinc-400 font-medium transition-colors flex items-center gap-1` — shown only when `insights_trail_ui` flag is on; when off, renders grayed with tooltip "Coming in Phase 4" |
| Generate dropdown | Same button component as Section 5 original |
| Refresh button | Uses Section 12 6-state machine exactly — `Button variant="ghost" size="icon" text-zinc-400 hover:text-zinc-100 w-8 h-8`. See Section 12 for all states, labels, confirm dialog, and error handling. |

**Responsive:**
- `< 768px`: NPS block full-width column. Topic chips wrap below. "View details →" own row at bottom. Provenance truncates at 280px.
- `≥ 768px`: Single-row layout as shown.

**Animation:**
- Band mount: `motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}`
- Delta chip + topic chips: stagger `0.05s` via `motion.span` children
- Delta chip hover: `transition-colors duration-150` only (no Framer)

---

### 15.2 Investigation Drawer

Slide-in panel (480px) triggered by delta chip click or "View details →". Uses `AnimatePresence`.

```
                              ┌─────────────────────────────────────────┐
                              │  w-[480px]  bg-zinc-950                 │
                              │  fixed top-0 right-0 h-screen           │
                              │  border-l border-zinc-800  z-50         │
                              │  shadow-2xl  overflow-y-auto  flex-col  │
                              │                                         │
                              │  ┌─────────────────────────────────┐    │
                              │  │  HEADER  sticky top-0           │    │
                              │  │  bg-zinc-950  px-6 pt-6 pb-4    │    │
                              │  │                                 │    │
                              │  │  Investigation Details    [×]   │    │
                              │  │  text-lg font-semibold          │    │
                              │  │  text-zinc-100                  │    │
                              │  │  <Separator bg-zinc-800 />      │    │
                              │  └─────────────────────────────────┘    │
                              │                                         │
                              │  ┌─────────────────────────────────┐    │
                              │  │  SECTION A — Metric Trajectory  │    │
                              │  │  px-6 pt-5 pb-4                 │    │
                              │  │                                 │    │
                              │  │  NPS OVER LAST 5 CHECKPOINTS    │    │
                              │  │  text-xs zinc-400 uppercase      │    │
                              │  │  tracking-wider mb-3             │    │
                              │  │                                 │    │
                              │  │  ┌─────────────────────────┐    │    │
                              │  │  │  SPARKLINE  h-24        │    │    │
                              │  │  │  bg-zinc-900 rounded-xl │    │    │
                              │  │  │                         │    │    │
                              │  │  │  44●─────●47           │    │    │
                              │  │  │       ●46  ●44──●41    │    │    │
                              │  │  │  #10  #11  #12  #13  #14    │    │
                              │  │  └─────────────────────────┘    │    │
                              │  │                                 │    │
                              │  │  41  ↓3.2 pts                   │    │
                              │  │  text-5xl font-black  text-2xl  │    │
                              │  │  tabular-nums         rose-400  │    │
                              │  │  Net Promoter Score             │    │
                              │  │  text-xs zinc-500               │    │
                              │  │                                 │    │
                              │  │  ┌─────────────────────────┐    │    │
                              │  │  │  CSAT / CES row         │    │    │
                              │  │  │  bg-zinc-900 rounded-xl │    │    │
                              │  │  │  px-4 py-3 mt-3          │    │    │
                              │  │  │  flex justify-between    │    │    │
                              │  │  │                         │    │    │
                              │  │  │  CSAT     4.1 / 5.0    │    │    │
                              │  │  │  CES      3.2 / 7.0    │    │    │
                              │  │  │  zinc-400 / zinc-100    │    │    │
                              │  │  └─────────────────────────┘    │    │
                              │  └─────────────────────────────────┘    │
                              │  <Separator mx-6 bg-zinc-800/60 />      │
                              │  ┌─────────────────────────────────┐    │
                              │  │  SECTION B — What Changed       │    │
                              │  │  px-6 py-5                      │    │
                              │  │                                 │    │
                              │  │  WHAT CHANGED  ← uppercase      │    │
                              │  │                                 │    │
                              │  │  Topics emerged                 │    │
                              │  │  [Wait Time ▲ 34][Onboarding ▲] │    │
                              │  │  border-violet-500/40           │    │
                              │  │  bg-violet-500/10 text-violet-300│   │
                              │  │                                 │    │
                              │  │  Topics declining               │    │
                              │  │  [Billing ▼ 12]                 │    │
                              │  │  border-rose-500/40             │    │
                              │  │  bg-rose-500/10 text-rose-400   │    │
                              │  │                                 │    │
                              │  │  8 topics unchanged             │    │
                              │  │  text-sm zinc-300 / zinc-500    │    │
                              │  └─────────────────────────────────┘    │
                              │  <Separator mx-6 bg-zinc-800/60 />      │
                              │  ┌─────────────────────────────────┐    │
                              │  │  SECTION C — Provenance         │    │
                              │  │  px-6 py-5                      │    │
                              │  │                                 │    │
                              │  │  ┌─────────────────────────┐    │    │
                              │  │  │  bg-zinc-900 rounded-xl │    │    │
                              │  │  │  divide-y divide-zinc-800│   │    │
                              │  │  │                         │    │    │
                              │  │  │  Checkpoint  │  #14     │    │    │
                              │  │  │  Generated   │  Jun 25, 2026 2:14am│ │
                              │  │  │  Trigger     │  [display label] │  │    │
                              │  │  │  New resp.   │  12      │    │    │
                              │  │  │  Credit cost │  5 credits│   │    │
                              │  │  │  Model       │  crystal-v4.2│ │    │
                              │  │  │  ← each row px-4 py-3   │    │    │
                              │  │  │    zinc-400 / zinc-100   │    │    │
                              │  │  │    font-mono             │    │    │
                              │  │  └─────────────────────────┘    │    │
                              │  │                                 │    │
                              │  │  ← View checkpoint #13          │    │
                              │  │  text-xs text-violet-400        │    │
                              │  └─────────────────────────────────┘    │
                              │  <Separator mx-6 bg-zinc-800/60 />      │
                              │  ┌─────────────────────────────────┐    │
                              │  │  SECTION D — Crystal Banner     │    │
                              │  │  px-6 py-4                      │    │
                              │  │                                 │    │
                              │  │  ┌─────────────────────────┐    │    │
                              │  │  │  bg-violet-500/8         │    │    │
                              │  │  │  border-violet-500/25    │    │    │
                              │  │  │  rounded-xl px-4 py-3    │    │    │
                              │  │  │  hover:bg-violet-500/14  │    │    │
                              │  │  │                         │    │    │
                              │  │  │  [hex orb]  Ask Crystal │    │    │
                              │  │  │  about these changes →  │    │    │
                              │  │  │  text-sm violet-300      │    │    │
                              │  │  └─────────────────────────┘    │    │
                              │  └─────────────────────────────────┘    │
                              │  ┌─────────────────────────────────┐    │
                              │  │  FOOTER  px-6 py-4 mt-auto      │    │
                              │  │  border-t border-zinc-800       │    │
                              │  │                                 │    │
                              │  │  Feature: insights_trajectory_v1│    │
                              │  │  text-[10px] zinc-600 font-mono │    │
                              │  │  bg-zinc-900 rounded-full       │    │
                              │  └─────────────────────────────────┘    │
                              └─────────────────────────────────────────┘
```

### Drawer states by input condition

**State 3 (Bootstrap):** Section A shows baseline empty state (database icon + "No prior checkpoint" + "This is your baseline."). Section B shows "—" placeholder. Sections C + D render normally.

**State 4 (Legacy — delta=null):**
Section A shows: `bg-zinc-900 rounded-xl px-4 py-4 text-center` with icon + "Delta not available — this checkpoint predates investigation tracking." + current NPS number (no delta text, no sparkline).
Section B shows: "—" placeholder with "No change data for this checkpoint" (zinc-500, text-xs).
Sections C + D render normally.

**State 5 (Full delta):** All sections render as specified in main mockup above.

**States 1 and 2 (Loading / Generating) — drawer behavior:**
The drawer button `[View details →]` is hidden during States 1 and 2 (State 1: skeleton state, no button rendered; State 2: button hidden per state machine). However, the `InvestigationDrawer` component is mounted regardless when `showTrajectory` is true. The component must handle a null `checkpoint` prop:

```tsx
if (!checkpoint) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="inv-drawer-title" className="...">
      <div id="inv-drawer-title" className="text-sm font-medium text-zinc-300">
        {t('surveyInsights.investigation.loading')}
      </div>
      <div className="animate-pulse rounded-lg bg-zinc-800 h-24 mt-4" />
    </div>
  );
}
```

During State 2 (generating), if a user somehow opens the drawer (e.g. via keyboard shortcut), it shows the State 1 loading skeleton rather than stale checkpoint data — this is conservative and safe.

---

**Framer Motion spec:**

```tsx
<AnimatePresence>
  {drawerOpen && (
    <>
      <motion.div                          // backdrop
        key="inv-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-zinc-950/60 z-40 backdrop-blur-sm"
        onClick={() => setDrawerOpen(false)}
      />
      <motion.div                          // panel
        key="inv-drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-0 right-0 h-screen w-[480px]
                   bg-zinc-950 border-l border-zinc-800
                   z-50 shadow-2xl overflow-y-auto flex flex-col"
      />
    </>
  )}
</AnimatePresence>

// Sections stagger in after drawer lands (delayChildren: 0.2s)
const sectionVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } }
};
const sectionItem = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
};
```

**Sparkline implementation:** `<LineChart>` (Recharts) or plain `<svg>`. `strokeWidth={2}`, no axes, no grid. Stroke color: `#10b981` (emerald) if last-point > first-point, else `#f43f5e` (rose). Dots: `r={3}`. Labels below as `<text>` at each x-position.

**Sparkline degradation — renders based on `priorCheckpoints.length`:**
- 0 points: baseline empty state (database icon + prose) — no sparkline rendered
- 1 point: single dot centered; label below: "Checkpoint #{n} · NPS {val}"; text below dot: "No trend yet — first update since baseline" (`text-xs text-zinc-500 text-center mt-2`)
- 2–4 points: render LineChart with actual N dots; section label uses `{n}` = actual count (e.g. "NPS over last 3 checkpoints")
- 5+ points: full 5-point sparkline as shown in main mockup

Section label: `t('surveyInsights.investigation.sectionA', { n: Math.min(priorCheckpoints.length, 5) })`

**Crystal Banner click:**
```tsx
// CORRECT — drawer stays open; Crystal panel opens alongside it:
onClick={() => {
  openCrystalPanel(
    t('surveyInsights.investigation.crystalPreFill', { prev: checkpoint.number - 1 })
  );
  // pre-fills: "What changed since checkpoint #13?"
  // Drawer stays open. Crystal panel opens at z-60 (above drawer z-50).
  // User closes drawer manually via [×] button after seeing Crystal response.
  // The drawer and Crystal panel coexist using the existing z-index layering.
}}
```

**Provenance table rows (in order):**
1. Checkpoint | #14
2. Generated  | Jun 25, 2026 2:14am
3. Trigger    | [display label — see trigger map below]
4. New responses | 12
5. Credit cost | 5 credits
6. Model      | crystal-v4.2

**Trigger display map** (map internal enum values to customer-facing labels):

| DB value | Customer label | Available from |
|----------|---------------|----------------|
| `stream` | Automated (new responses) | Phase 0.5 |
| `scheduler` | Automated (scheduled) | Phase 0.5 (after CHECK constraint fix) |
| `milestone` | Automated (milestone) | Phase 0.5 (after CHECK constraint fix) |
| `responses` | Automated (new responses) | Phase 0.5 (legacy alias for `stream`) |
| `days` | Automated (scheduled) | Phase 0.5 (legacy alias for `scheduler`) |
| `manual` | Manual refresh | Phase 0.5 (legacy value) |
| `refresh` | Manual refresh | Phase 3 |
| `manual_expert` | Expert report | Phase 3 |
| `manual_quick` | Quick brief | Phase 3 |
| `api` | API trigger | Phase 3 |

> Phase 0.5 frontend implementation: map `stream`, `responses` → 'Automated (new responses)'; map `scheduler`, `days` → 'Automated (scheduled)'; map `manual` → 'Manual refresh'; any other value → show the raw value as-is (defensive). Values for Phase 3 modes will appear after manual run modes ship.

i18n keys for trigger labels: `t('surveyInsights.investigation.triggerStream')`, `t('surveyInsights.investigation.triggerScheduler')`, etc. — see Section 15.4.

**Drawer in bootstrap mode (checkpoint #1):**
- Section A sparkline area: `bg-zinc-900 rounded-xl px-4 py-4 flex flex-col items-center gap-2` with `database` icon (zinc-600, 24px) + "No prior checkpoint" (zinc-300) + "This is your baseline." (zinc-500)
- NPS number shown without delta text
- Section B: em-dash placeholder (`text-2xl text-zinc-600`) + "No change data for first checkpoint" (`text-xs zinc-500`)
- Sections C + D: render normally

**Responsive:**
- `< 768px`: `w-screen` full-width sheet with swipe handle `w-10 h-1 rounded-full bg-zinc-700 mx-auto mt-3`. Sparkline height `h-16`.
- `≥ 768px`: `w-[480px]` as specified.

**Component list — Drawer:**

| Component | Tailwind classes |
|-----------|-----------------|
| Drawer root | `fixed top-0 right-0 h-screen w-[480px] bg-zinc-950 border-l border-zinc-800 z-50 shadow-2xl overflow-y-auto flex flex-col` |
| Backdrop | `fixed inset-0 bg-zinc-950/60 z-40 backdrop-blur-sm` |
| Header sticky | `sticky top-0 bg-zinc-950 px-6 pt-6 pb-4 z-10 flex justify-between items-center` |
| Section label | `text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4` |
| Sub-label | `text-xs text-zinc-500 mb-2` |
| Sparkline container | `bg-zinc-900 rounded-xl px-3 py-2 mb-4 h-24` |
| NPS large | `text-5xl font-black text-zinc-100 tabular-nums leading-none` |
| Delta large | `text-2xl font-bold text-rose-400` or `text-emerald-400` |
| CSAT/CES row | `bg-zinc-900 rounded-xl px-4 py-3 mt-3 flex flex-col gap-2` |
| Topic chip (emerged) | `rounded-full px-3 py-1 text-xs font-medium border border-violet-500/40 bg-violet-500/10 text-violet-300` |
| Topic chip (declining) | `rounded-full px-3 py-1 text-xs font-medium border border-rose-500/40 bg-rose-500/10 text-rose-400` |
| Provenance table | `bg-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-800` |
| Provenance row | `px-4 py-3 flex justify-between items-center` — label `text-xs text-zinc-400`, value `text-xs text-zinc-100 font-mono` |
| Prior checkpoint link | `mt-3 text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors` — rendered only when featureFlag `insights_trail_ui` is ALSO enabled. Hidden entirely (removed from DOM, not just disabled) in Phase 0.5 when `insights_trail_ui` is off. When shown (Phase 4+), navigates to `/trail/:checkpointId`. |
| Crystal banner | `bg-violet-500/8 border border-violet-500/25 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-violet-500/14 transition-colors duration-150 group` |
| Feature flag badge | `inline-flex items-center gap-1.5 text-[10px] text-zinc-600 font-mono bg-zinc-900 rounded-full px-2.5 py-1 border border-zinc-800` — rendered only when `user.role === 'brand_admin'` OR `process.env.NODE_ENV !== 'production'`. Regular members and analysts never see this badge in production. Implementation: `{(isBrandAdmin \|\| !isProd) && <FeatureFlagBadge />}` |

---

### 15.3 Topic Change Bar (inline, below insight cards)

Only rendered when `delta?.topic_changes?.length > 0`. Hidden (not just invisible) otherwise.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [last insight card above]                                              │
├─────────────────────────────────────────────────────────────────────────┤
│  TOPIC CHANGE BAR                                                       │
│  mt-4 mb-2  bg-zinc-900  border border-zinc-800  rounded-xl  px-5 py-3 │
│  flex items-center justify-between gap-4                                │
│                                                                         │
│  Since checkpoint #13 (Jun 22):    [▲ Wait Time] [▲ Onboarding] [▼ Billing] │
│  text-xs zinc-400 font-medium      emerald-950/500          rose-950/500│
│  whitespace-nowrap shrink-0        rounded-full px-3 py-1 text-xs       │
└─────────────────────────────────────────────────────────────────────────┘
```

Chips are **read-only** in this bar — no click. Full interaction is in the Drawer.

**Read-only chip classes (visually distinct from interactive chips):**
- Emerged:  `"rounded-full px-3 py-1 text-xs font-medium bg-emerald-950 text-emerald-500 cursor-default opacity-75"`
- Declining: `"rounded-full px-3 py-1 text-xs font-medium bg-rose-950 text-rose-500 cursor-default opacity-75"`

Rules: add `cursor-default`; remove any `hover:` classes (no hover state); add `opacity-75` to visually distinguish from clickable elements. Do NOT wrap in `<button>`; use `<span>` only.

### Topic information hierarchy (intentional design)

The three surfaces present topic change data at escalating detail:
1. Header band count chips: "▲ 2 · ▼ 1" — at-a-glance counts only. Read-only.
2. Topic Change Bar: named topic chips below insight cards — shows which topics. Read-only.
3. Investigation Drawer Section B: named topics with volume counts — full detail. Read-only.

All three surfaces are READ-ONLY in Phase 0.5. Topic drill-through (clicking a topic chip to see its verbatims) is a Phase 4 Trail feature. The visual treatment of read-only chips differs from interactive ones: read-only chips use `cursor-default` and `opacity-75`.

The count chips in the header band (Surface 1) and the named chips in the Topic Change Bar (Surface 2) are both visible simultaneously. This is intentional progressive disclosure: the band gives the count at a glance without requiring scroll; the bar names the topics without requiring the drawer to open. Users who want full detail open the drawer.

**Animation:** `motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}` with `AnimatePresence`.

Note: When `TopicChangeBar` is hidden during State 2 (generating), the `showTrajectory && run_status !== 'running'` guard in Section 15.5 renders this as a conditional render WITHOUT `AnimatePresence` wrapper in the parent (the component unmounts immediately). Wrap the conditional render with `<AnimatePresence mode='wait'>` in the parent so the exit animation fires on hide.

**Responsive:** `< 768px` becomes `flex-col items-start gap-2` (label top row, chips below, `justify-start`).

---

### 15.4 i18n keys (Section 15 — all new)

Add to `app/src/locales/en.ts` under the existing `surveyInsights` namespace (the namespace used by `SurveyIntelligencePage.tsx` — confirmed by grepping the page component). Create a new `investigation` sub-object within `surveyInsights`:

```typescript
// inside surveyInsights: { ... }
investigation: {
  provenanceLine:        'Updated {ago} ago · {trigger} · checkpoint #{checkpoint} · {newResponses} new responses',
  provenanceLineFirst:   'First analysis · checkpoint #{checkpoint} · {responses} responses analyzed',
  deltaSince:            '{arrow}{delta} since #{prev}',
  emerged:               'emerged',
  declining:             'declining',
  viewDetails:           'View details →',
  topicBarLabel:         'Since checkpoint #{checkpoint} ({date}):',

  // Drawer
  drawerTitle:           'Investigation Details',
  sectionA:              'NPS over last {n} checkpoints',
  metricNPS:             'Net Promoter Score',
  metricCSAT:            'CSAT',
  metricCES:             'CES',
  sectionB:              'What changed',
  topicsEmerged:         'Topics emerged',
  topicsDeclining:       'Topics declining',
  topicsStable:          '{n} topics unchanged',
  sectionC:              'Provenance',
  provenanceCheckpoint:  'Checkpoint',
  provenanceGenerated:   'Generated',
  provenanceTrigger:     'Trigger',
  provenanceNewResponses:'New responses',
  provenanceCreditCost:  'Credit cost',
  provenanceCreditCostValue: '{cost} credits',
  provenanceModel:       'Model',
  viewPriorCheckpoint:   '← View checkpoint #{n}',
  // (only rendered when insights_trail_ui flag is also on)
  crystalBanner:         'Ask Crystal about these changes →',
  crystalPreFill:        'What changed since checkpoint #{prev}?',
  featureFlag:           'Feature: insights_trajectory_v1',

  // Bootstrap / baseline variants
  noBaseline:            'No prior checkpoint',
  baselineCaption:       'This is your baseline.',
  noChangeData:          'No change data for first checkpoint',

  // Delta chip aria
  deltaChipAriaLabel:    'NPS {direction} {delta} points since checkpoint {prev}. Click to view investigation details.',
  viewDetailsAriaLabel:  'View investigation details for checkpoint {checkpoint}',
  topicCountAriaLabel:   '{count} {direction} since last checkpoint',
  crystalBannerAriaLabel:'Ask Crystal: What changed since checkpoint {prev}?',

  // State 2 (generating)
  analyzingResponses:    'Analyzing {count} new responses…',
  analysisInProgress:    'Analysis in progress…',

  // State 4 (legacy checkpoint)
  deltaNotAvailable:     'Delta not available — this checkpoint predates investigation tracking.',
  noChangeDataLegacy:    'No change data for this checkpoint',

  // Sparkline degraded states
  noTrendYet:            'No trend yet — first update since baseline',

  // Null checkpoint guard (States 1 and 2)
  loading:               'Loading investigation details…',

  // Provenance — trigger labels
  triggerStream:         'Automated (new responses)',
  triggerScheduler:      'Automated (scheduled)',
  triggerMilestone:      'Automated (milestone)',
  triggerRefresh:        'Manual refresh',
  triggerManualExpert:   'Expert report',
  triggerManualQuick:    'Quick brief',
  triggerApi:            'API trigger',

  // View trail (conditional)
  viewTrail:             'View trail',
  viewTrailComingSoon:   'Coming in Phase 4',
},
```

---

### 15.5 Feature flag guard (implementation reference)

```tsx
const showTrajectory = useFeatureFlag('insights_trajectory_v1');
const showTrail      = useFeatureFlag('insights_trail_ui');
const run_status     = insights.run_status;

// Header: Enhanced Band (all states) vs Legacy strip
{showTrajectory ? (
  <EnhancedHeaderBand
    checkpoint={latestCheckpoint}
    delta={latestCheckpoint?.delta ?? null}
    priorCheckpoints={priorCheckpoints}
    runStatus={run_status}
    showTrail={showTrail}
    onOpenDrawer={() => setDrawerOpen(true)}
  />
) : (
  <LegacyHeaderStrip runStatus={run_status} />
)}

// Topic change bar (below cards)
{showTrajectory && latestCheckpoint?.delta?.topic_changes?.length > 0
  && run_status !== 'running' && (
  <TopicChangeBar delta={latestCheckpoint.delta} prevCheckpoint={prevCheckpoint} />
)}

// Investigation Drawer
{showTrajectory && (
  <InvestigationDrawer
    open={drawerOpen}
    onClose={() => setDrawerOpen(false)}
    checkpoint={latestCheckpoint}
    delta={latestCheckpoint?.delta ?? null}
    priorCheckpoints={priorCheckpoints}
    showTrail={showTrail}
  />
)}
```

---

## 15.6 Accessibility

All Section 15 surfaces must meet WCAG 2.1 AA. Specific requirements:

**Header Band:**
- Delta chip: rendered as `<button>` element (not div/span with cursor-pointer).
  `aria-label`: `t('surveyInsights.investigation.deltaChipAriaLabel', { arrow, delta, prev })`
  e.g. "NPS decreased 3.2 points since checkpoint 13. Click to view investigation details."
- "View details →": rendered as `<button>`.
  `aria-label`: `t('surveyInsights.investigation.viewDetailsAriaLabel')`
  e.g. "View investigation details for checkpoint 14"
- Count chips (▲ N emerged, ▼ N declining): rendered as `<span role="status">`.
  `aria-label`: `t('surveyInsights.investigation.topicCountAriaLabel', { count, direction })`
  e.g. "2 topics emerged since last checkpoint"
- Provenance line: `aria-live="polite"` so screen readers announce updates when checkpoint changes.

**Investigation Drawer:**
- Drawer root: `role="dialog" aria-modal="true" aria-labelledby="inv-drawer-title"`
- Title: `id="inv-drawer-title"`
- Close button: `aria-label={t('common.close')}`
- Focus trap: on open, focus moves to the close button. Tab cycles within drawer. Escape closes.
- Backdrop: `aria-hidden="true"` (decorative, not interactive for screen readers)
- Sparkline: `role="img" aria-label="NPS trend over last {n} checkpoints: {values joined by comma}"`
- Crystal Banner: rendered as `<button>` with `aria-label={t('surveyInsights.investigation.crystalBannerAriaLabel')}`
  e.g. "Ask Crystal: What changed since checkpoint 13?"
- Provenance table: rendered as `<dl>` (description list) with `<dt>` for labels, `<dd>` for values.
  Alternatively: `<table role="table">` with proper th/td structure.

**Topic Change Bar:**
- Bar root: `role="status" aria-live="polite"` (announces when topics change)
- Each chip: `<span>` (not button — these are non-interactive). No role needed.
- Chips have no hover state: add `cursor-default` explicitly.

**Delta values (all surfaces):**
- Arrow glyphs (↓ ↑) must be wrapped: `<span aria-hidden="true">↓</span><span class="sr-only">decreased</span>`
- ▲ ▼ glyphs similarly: `<span aria-hidden="true">▲</span><span class="sr-only">emerged</span>`

---

## 16. Design references

Reuse existing patterns:
- `CaseDetailPage` audit timeline → Trail timeline
- `UnifiedInsightsView` audit drawer → Provenance tab
- `SurveyTrendsPage` charts → delta visualization
- `GeneratingOverlay` → manual run progress

Mockups: add to `docs/insights/Designs/` in Phase 2 (not blocking eng).
