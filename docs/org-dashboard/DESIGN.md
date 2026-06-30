# Org Intelligence Dashboard — Design Specification

**User-facing product name:** Command Center  
**Document owner:** Marcus Osei (Principal UX Designer)  
**Last updated:** 2026-06-29  
**Status:** Authoritative spec — engineering must implement against this document. Design changes require Marcus's sign-off.

---

## Design Philosophy

Command Center is built on a single conviction: a VP of CX should be able to open this page on a Monday morning and, within 10 seconds, know whether their organization's experience programs are healthy or in trouble. That 10-second window is not a feature — it is the design constraint that governs every decision we make about what to show, what to hide, and how to present it.

The closest design analogs are not other SaaS dashboards — they are aircraft cockpits and network operations centers. These environments have solved the exact problem we are solving: displaying dozens of live data streams to a trained operator who needs to detect anomalies instantly and understand the overall system state at a glance. We take the visual vocabulary of those environments (status lights, health indicators, hierarchical scanning order) and apply it with the polish and accessibility standards expected of a modern enterprise SaaS product.

Density and clarity are not in conflict. The failure of most analytics dashboards is not that they show too much — it is that they show things without hierarchy. Command Center uses three visual weights: hero information (the Org Health Score, the Crystal Brief), supporting context (the KPI row, the trend chart), and reference data (the programs table, topic chips). The user's eye follows this hierarchy naturally. Nothing at the supporting or reference level should ever compete visually with the hero layer.

Dark mode is not an afterthought. "War Room Mode" is a genuine alternative experience designed for crisis situations — when a CX leader needs to run a live response center, project Command Center on a screen, and monitor it for hours. The dark palette is designed for that context: reduced eye strain, higher contrast for critical indicators, and a visual vocabulary that signals "we are in serious mode right now."

---

## Layout System

### Grid

12-column grid with 24px gutters. Breakpoints:
- `sm`: 640px (mobile — single column, core KPIs only)
- `md`: 768px (tablet — 2-column layout, table condensed)
- `lg`: 1024px (desktop — full layout, sidebar appears)
- `xl`: 1280px (wide — programs table at full 8 columns)
- `2xl`: 1536px (ultra-wide — tag group grid expands to 4-column)

### Fixed vs. Scrollable

- **Fixed:** Top Nav / Health Bar (always visible, 64px tall)
- **Fixed:** Sub-filter bar (below top nav, 48px tall, sticks on scroll)
- **Scrollable:** All content below the filter bar

### Component Hierarchy (DOM order = visual scan order)

```
TopNav + HealthBar (fixed)
FilterBar (fixed, below TopNav)
└── CrystalBriefCard (full width)
└── KPIRow (4 tiles, full width)
└── TrendsSection (NPS chart, full width)
└── ProgramsTable (8 col) + AnomalyAlerts sidebar (4 col)
└── EmergingTopics (full width, horizontal scroll)
└── TagGroupGrid (collapsible, full width)
```

On `md` and below, the AnomalyAlerts sidebar moves below ProgramsTable and becomes full-width.

---

## Section Specifications

### 1. Top Nav / Health Bar

**Height:** 64px  
**Position:** Fixed, z-index 50, full viewport width  
**Background:** `bg-white/95 backdrop-blur-sm border-b border-gray-200` (light mode) / `bg-[#0A0F1E]/95 backdrop-blur-sm border-b border-[#1E2A3A]` (dark mode)

**Left zone (logo + org):**
- Xperiq wordmark logo (SVG, 20px tall)
- Separator `|` at 40% opacity
- Org name in `font-semibold text-sm text-gray-900`
- If org name exceeds 24 characters: truncate with ellipsis + tooltip on hover

**Center zone (Org Health Score):**
- Label: `t('orgDashboard.healthScore.label')` — `text-xs text-gray-500 uppercase tracking-wider`
- Score number: `text-3xl font-black tabular-nums` — color-coded (see Color System)
- 30-day sparkline: 80px wide, 20px tall, rendered as a `<canvas>` or minimal SVG path
  - Line color matches the score color (green/yellow/red)
  - No axes, no labels — pure trend signal
- Score label below number: `text-xs font-medium` — "Healthy", "Needs Attention", or "Critical"

**Right zone (actions):**
- "Live" badge: `text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full` with a 6px pulsing green dot to the left
  - Pulse animation: CSS `@keyframes pulse` — 2s infinite ease-in-out
  - When WebSocket disconnects: badge changes to "Reconnecting..." with amber color and a spinner, no pulse
- Notification bell icon (24px): shows a red dot badge if `totalUnresolved > 0`
- User avatar (28px circle): click opens a dropdown (account, settings, sign out)

**Sub-bar (48px, fixed below TopNav):**
- `bg-gray-50 border-b border-gray-200 px-6`
- Date range picker: `CalendarDateRangePicker` component — default "Last 30 days", options: 7d / 30d / 90d / 1y / Custom
- Tag Group filter: `<select>` styled as Xperiq's dropdown — "All Groups" default, then each tag group name
- Ask Crystal command bar trigger: `⌘K` badge + "Ask Crystal about your org..." placeholder text in a button styled as a fake input field
  - Clicking or pressing ⌘K opens the Crystal command overlay with org context pre-populated

**States:**
- Loading skeleton: TopNav renders at full opacity immediately (static content). The health score number shows a `<Skeleton className="h-8 w-12" />` while the initial API call is in flight.
- WebSocket disconnected: Live badge changes (described above). All real-time-dependent components show a `text-xs text-amber-500` indicator "Live updates paused".
- Health score animating in: Once the API response arrives, the number animates from 0 to its final value using a count-up animation (see Micro-interactions).

---

### 2. Crystal Brief Card

**Width:** Full content width (12 of 12 columns)  
**Background:** Subtle gradient — `bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl` (light) / `bg-gradient-to-r from-indigo-950/40 to-purple-950/40 border border-indigo-800/40 rounded-xl` (dark)

**Header:**
- Left: Crystal icon (16px, purple) + `t('orgDashboard.crystalBrief.title')` in `text-sm font-semibold text-indigo-700`
- Right: Date range label in `text-xs text-gray-500` (e.g., "Jun 16–22, 2026")

**Brief body:**
- 2–3 sentence narrative text: `text-base text-gray-900 leading-relaxed`
- Maximum 3 lines before "Read more" expansion — use CSS `-webkit-line-clamp: 3`

**Recommendations list:**
- Numbered list 1–3
- Each item: rank circle (20px, indigo filled) + action text in `text-sm font-medium` + rationale in `text-sm text-gray-500`
- Items with a linked survey: the survey name is an underlined link that navigates to that survey's detail page
- `actionType` icon: investigate (🔍 → use search icon), review (📊 → chart icon), celebrate (⭐ → star icon), monitor (👁 → eye icon)

**Footer:**
- Left: `t('orgDashboard.crystalBrief.lastUpdated', { time: relativeTime })` — `text-xs text-gray-400`
- Right: `t('orgDashboard.crystalBrief.askFollowUp')` CTA button — `variant="ghost" size="sm"` — clicking opens Crystal chat with pre-loaded context: `"org:${orgId} — asking about the weekly brief"`

**Hover state:** Card border brightens from `border-indigo-100` to `border-indigo-300`. Transition 150ms ease.

**Loading/skeleton state:**
- Entire card shows as a skeleton block: `<Skeleton className="h-32 rounded-xl" />`
- Do not flash between "no brief" and "brief loaded" — show skeleton until data arrives, then animate in with a 200ms fade

**Empty state (org too new for a brief — fewer than 3 surveys or fewer than 2 weeks of data):**
- Show a gentle message: `t('orgDashboard.crystalBrief.notEnoughData')` with a progress indicator ("Crystal needs at least 2 weeks of data from 3 programs")
- Do not show an error state — this is an expected new-org state

---

### 3. KPI Row

**Layout:** 4 equal-width tiles in a CSS grid, `grid-cols-4` on `lg+`, `grid-cols-2` on `md`, `grid-cols-1` on `sm`  
**Each tile:** `bg-white border border-gray-100 rounded-xl p-6 shadow-sm`

**Tile 1 — Total Active Surveys:**
- Label: `t('orgDashboard.kpis.activeSurveys')`
- Value: Large integer, `text-4xl font-black tabular-nums text-gray-900`
- Delta: `+3 this month` in `text-xs` with green/red color based on sign

**Tile 2 — Total Responses:**
- Label: `t('orgDashboard.kpis.totalResponses')`
- Value: Formatted large integer (e.g., "12,847"), `text-4xl font-black tabular-nums text-gray-900`
- Sub-label: Live counter — `t('orgDashboard.kpis.responsesToday', { count })` in `text-sm text-green-600 font-semibold tabular-nums`
- This sub-label flashes on WebSocket `response_received` events (see Micro-interactions)

**Tile 3 — Org NPS:**
- Label: `t('orgDashboard.kpis.orgNps')`
- Value: NPS score with sign, `text-4xl font-black tabular-nums` — green if >30, yellow if 0-30, red if <0
- WoW delta arrow: Up arrow (green) or down arrow (red) + `text-sm font-medium` value (e.g., "+4.2 WoW")
- Small NPS gauge arc: SVG half-circle gauge, -100 to +100 range, 80px wide, fills to the current NPS value

**Tile 4 — Avg Sentiment:**
- Label: `t('orgDashboard.kpis.avgSentiment')`
- Value: Score from -1.0 to 1.0, displayed as a percentage mapped to 0-100 for readability (e.g., 0.72 displays as "72 / 100")
- Trend arrow: `improving` → green up, `stable` → gray right, `declining` → red down
- Sentiment bar: thin horizontal progress bar below the value, using the sentiment spectrum colors

**States (all tiles):**
- Loading: entire tile replaced with `<Skeleton className="h-32 rounded-xl" />`
- Hover: `shadow-md border-gray-200` transition 150ms ease
- Click: navigates to the relevant expanded section (Tile 3 → NPS Trends section, smooth scroll)

---

### 4. NPS & Sentiment Trends Chart

**Component:** `NPSTrendChart` — Recharts `ComposedChart`  
**Height:** 280px  
**Width:** Full content width

**Left Y-axis:** NPS range -100 to +100, major gridlines at -50, 0, +50, +100  
**Right Y-axis:** Response volume (auto-scaled to the data range)

**Series:**
- NPS line: solid, 2px stroke, color `#6366F1` (indigo-500) in light mode, `#818CF8` in dark mode
  - Dot on each data point: 4px radius circle, filled white with 2px stroke
  - Active dot on hover: 6px radius, filled with line color
- Response volume bars: `#E0E7FF` fill (indigo-100) in light mode, stacked behind the NPS line on the z-axis
- Industry benchmark line (if configured): dashed, 1.5px stroke, `#9CA3AF` (gray-400), label at right edge "Industry: +XX"

**Hover tooltip:**
- Shows on cursor proximity (within 10px of any data point)
- Content: Date label, NPS value with delta from previous period, response count
- Styled as: `bg-white shadow-lg border border-gray-200 rounded-lg px-3 py-2 text-xs`

**Toggle buttons (top-right of chart):**
- "Aggregated" (default) / "By Survey" — `<ToggleGroup>` component
- "By Survey" mode renders one NPS line per survey (up to 10 lines, color-coded), stacks them on the same chart area
- No more than 10 survey lines at a time — if org has more surveys, show a "showing 10 most active" note

**Live NPS extension:**
When a `response_received` WebSocket event arrives, the rightmost data point of the NPS line updates in place — the line extends slightly rightward if the day's data has changed. Use a Recharts `customized` dot on the live point to show a pulsing indicator.

**Empty state:** Show the chart axes and a centered `t('orgDashboard.trends.noData')` message with a subtle illustration.

---

### 5. Programs Overview Table

**Component:** `ProgramsTable`  
**Columns (in order):** Survey Name | Tag Group | Responses (7d) | NPS | Sentiment | Velocity | Health | Last Activity

**Column specs:**

| Column | Width | Sortable | Notes |
|--------|-------|----------|-------|
| Survey Name | flex-grow | Yes | Truncate at 32 chars, full title in tooltip |
| Tag Group | 120px | Yes | Pill badge with tag group color |
| Responses (7d) | 100px | Yes | Integer, right-aligned |
| NPS | 80px | Yes | Signed integer, color-coded |
| Sentiment | 120px | Yes | Shows trend icon + `improving/stable/declining` label |
| Velocity | 80px | Yes | 0-3x scale shown as 5-segment bar |
| Health | 120px | Yes | `HealthPill` component + 7-day NPS sparkline |
| Last Activity | 100px | Yes | Relative time ("2h ago") |

**HealthPill component:**
- `Healthy` → `bg-green-100 text-green-700 border border-green-200`
- `Attention` → `bg-yellow-100 text-yellow-700 border border-yellow-200`
- `Critical` → `bg-red-100 text-red-700 border border-red-200`
- Right of the pill: 60px sparkline of last 7 NPS daily values (SVG, no axes)

**Row hover state:**
- Row background: `bg-indigo-50/50`
- Right edge of row: "Ask Crystal" inline button appears — `<Button variant="ghost" size="xs">` with Crystal icon and `t('orgDashboard.programs.askCrystal')`
- Clicking "Ask Crystal" opens Crystal command bar pre-seeded with `"survey:{surveyId} — {surveyTitle}"`

**Row click:**
- Triggers a CSS transition: row expands downward to reveal a mini-detail panel (200ms ease-out)
- Mini-detail shows: 30-day NPS sparkline (larger, 200px wide), top 3 topics, latest Crystal insight for this survey
- A "View Full Survey" button navigates to the existing survey detail page
- Alternatively: if the survey has an Insights page, the CTA is "View Insights"
- Clicking the row again collapses the detail panel

**Sort behavior:**
- Default sort: Health status (Critical first), then by Last Activity descending
- Active sort column shows a sort indicator arrow
- Sorting is client-side for up to 50 rows; beyond 50, triggers a new API call with `sort` and `order` params

**Pin-to-top:**
- Hover a row → a pin icon appears at the far left
- Pinned rows stay at the top of the table regardless of sort order, with a subtle `border-l-2 border-indigo-400` left accent
- Pins are persisted in `localStorage` keyed by `org_id` — not server-persisted in Phase 1

**Pagination:** Standard pagination controls below the table. Page size selector: 10 / 25 / 50.

---

### 6. Emerging Topics

**Component:** `EmergingTopics`  
**Layout:** Full-width horizontal scrollable chip row  
**Background:** `bg-gray-50 rounded-xl px-4 py-4 border border-gray-100`

**Topic chip anatomy:**
- Container: `flex items-center gap-2 px-3 py-2 rounded-full border cursor-pointer whitespace-nowrap`
- Default state: `bg-white border-gray-200 text-gray-700`
- Sentiment icon to the left: `😊` positive (>0.3) / `😐` neutral (-0.3 to 0.3) / `😟` negative (<-0.3) — or use colored dot icons to avoid emoji in enterprise UI (Marcus to decide final approach in Figma)
- Topic label: `text-sm font-medium`
- Frequency count: `text-xs text-gray-400 ml-1`

**Chip variants:**
- "New this week" (`isNewThisWeek: true`): blue left border `border-l-2 border-blue-400` + blue dot `w-2 h-2 rounded-full bg-blue-400` before the label
- "Rising" (`frequencyChangePct > 50`): upward arrow icon (green) before the label + green text color for the count

**Chip click — expand drawer:**
- A bottom sheet / slide-in panel appears (400ms ease-out cubic-bezier)
- Content: Topic label as heading, frequency across org, breakdown by survey (bar chart, Recharts), 3 sample verbatim quotes from responses mentioning this topic
- Close via X button, Escape key, or clicking outside

**Scroll behavior:** Mouse users can scroll horizontally. Touch users swipe. Show fade gradients at left/right edges when the chip list overflows.

**Empty state:** `t('orgDashboard.topics.empty')` — "No topics detected yet. Topics appear after 10+ responses."

---

### 7. Anomaly Alerts

**Component:** `AnomalyAlerts`  
**Position:** Right sidebar (4 of 12 columns) alongside ProgramsTable on `lg+`. Full-width below ProgramsTable on `md` and smaller.  
**Background:** `bg-white rounded-xl border border-gray-100 shadow-sm`  
**Header:** `t('orgDashboard.alerts.title')` — `text-sm font-semibold text-gray-900` + unresolved count badge

**Alert item:**
- Left: Severity indicator — vertical bar 4px wide, full item height
  - Critical: `bg-red-500`
  - Warning: `bg-amber-500`
  - Info: `bg-blue-400`
- Content: Survey name in `text-sm font-medium` + detection description in `text-xs text-gray-600` + time ago in `text-xs text-gray-400`
- Actions (appear on hover): 
  - `Resolve` button: `<Button variant="ghost" size="xs">` — marks acknowledged via PATCH endpoint
  - `View` button: `<Button variant="ghost" size="xs">` — navigates to the survey detail page

**New alert animation:** When a `anomaly_detected` WebSocket event arrives, the new alert slides in from the top of the list with a 300ms ease-out transform, and the severity bar pulses once.

**Severity color palette:**
- Critical: `bg-red-500`, `text-red-700 bg-red-50`
- Warning: `bg-amber-500`, `text-amber-700 bg-amber-50`
- Info: `bg-blue-400`, `text-blue-700 bg-blue-50`

**Empty state:**
- Full-width message: `t('orgDashboard.alerts.empty')` — "No anomalies detected — your programs are healthy"
- Illustration: a simple green checkmark shield icon
- This state should feel celebratory, not like a loading indicator

---

### 8. Tag Group Comparison Grid

**Component:** `TagGroupGrid`  
**Default state:** Collapsed — shows a header row with "Tag Groups" label + survey count summary + expand chevron  
**Expanded state:** Grid of cards, `grid-cols-2` on `md`, `grid-cols-3` on `lg`, `grid-cols-4` on `2xl`

**Tag group card anatomy:**
- Card: `bg-white border border-gray-100 rounded-xl p-5 shadow-sm cursor-pointer`
- Group name: `text-sm font-semibold text-gray-900`
- Survey count: `text-xs text-gray-500` — "X surveys"
- Aggregate NPS: large `text-2xl font-black tabular-nums` with color coding
- Top topic: `text-xs text-gray-600 mt-1` — "Top topic: [label]"
- Health pill: `HealthPill` component (same as Programs table)
- 14-day NPS sparkline: full width of card, 40px tall

**Sort options (above the grid):** "By health" (default) / "By NPS" / "By responses" / "By name"

**Card click:** CSS page transition to the Tag Intelligence View (separate page, not in-page). Pass `tagGroupId` as a route param. The transition should feel like drilling down — a slight zoom-in effect.

**Collapse animation:** The grid animates its height from full to 0 with a 200ms ease-in transition. The expand chevron rotates 180°.

---

### 9. Dark Mode / War Room Mode

**Activation:** Toggle in the top-right user menu, labeled `t('orgDashboard.warRoomMode.toggle')`. Persist in `localStorage` as `org_dashboard_dark_mode: boolean`.

**Color palette (CSS custom properties on `:root[data-theme="war-room"]`):**

```css
--bg-primary:     #0A0F1E;   /* deep navy — page background */
--bg-surface:     #111827;   /* slightly lighter — card backgrounds */
--bg-surface-2:   #1E2A3A;   /* borders and subtle separations */
--text-primary:   #F0F4FF;   /* primary text — high contrast on dark */
--text-secondary: #94A3B8;   /* secondary text */
--accent-green:   #00FF88;   /* healthy / positive — neon green */
--accent-amber:   #FFB800;   /* attention / warning — warm amber */
--accent-red:     #FF4757;   /* critical — vivid red */
--accent-indigo:  #818CF8;   /* Crystal / AI elements */
--chart-line:     #818CF8;   /* NPS line in trend chart */
--chart-bar:      #1E2A3A;   /* response volume bars */
```

**Components with dark-mode-specific design (not just color inversion):**
- TopNav: adds a subtle glow to the Org Health Score number using `text-shadow`
- HealthPill: uses neon colors for status — `#00FF88` for healthy, `#FFB800` for attention, `#FF4757` for critical — with a subtle glow filter
- Crystal Brief card: background becomes a dark indigo gradient with a subtle shimmer animation on the card border
- AnomalyAlerts: critical severity indicator becomes a pulsing red glow
- KPI tiles: tile borders become subtle glows matching the tile's status color

**Toggle location:** User menu dropdown, bottom item. Label: "War Room Mode". Icon: a sun/moon toggle icon.

**Toggle animation:** The entire page fades through 50% opacity as the CSS class switches (150ms ease), then fades back in at full opacity. This prevents a jarring flash between themes.

---

## Micro-interactions Specification

### Org Health Score Count-Up Animation

When the initial API response arrives and the health score is first displayed:
- Start: `0`
- End: actual score value
- Duration: `800ms`
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out quart — fast start, decelerate to final value)
- Implementation: `useCountUp(target, duration, easing)` custom hook using `requestAnimationFrame`
- The color of the number also transitions from neutral (`text-gray-400`) to its final color during the animation

### Real-time Response Counter Flash

When a `response_received` event arrives:
- The "responses today" sub-label in the Total Responses KPI tile increments its number
- For 600ms after the increment: the sub-label receives a `bg-green-100 rounded` highlight, then fades back to transparent
- CSS: `@keyframes flash-green` — `0% {background: transparent} 15% {background: #DCFCE7} 100% {background: transparent}`

### NPS Chart Live Extension

When the rightmost data point of the NPS line updates with a new value:
- The line segment from the second-to-last point to the last point re-draws with a 400ms transition
- The live data point dot pulses once (scale 1 → 1.4 → 1, 300ms ease)

### Anomaly Alert Pulse Animation

When a new anomaly alert slides in via WebSocket:
- The severity bar (left edge of the alert) pulses 3 times: opacity 1 → 0.3 → 1 → 0.3 → 1, over 1.5s
- The alert card itself has a 1px border that fades from the severity color to `border-gray-100` over 3 seconds

### ⌘K Command Bar Open/Close Animation

- Open: the command bar overlay fades in at 150ms while simultaneously scaling from `scale(0.97)` to `scale(1.0)` with `transform-origin: center`
- The backdrop: `bg-black/30 backdrop-blur-sm`, fades in at 150ms
- Close: reverse of open, 100ms duration
- The input field is auto-focused on open with a cursor blink

---

## Color System

### Health Score Colors (hex values)

| Score Range | Status | Background | Text | Sparkline |
|-------------|--------|------------|------|-----------|
| 70–100 | Healthy | `#F0FDF4` | `#15803D` | `#22C55E` |
| 40–69 | Needs Attention | `#FFFBEB` | `#B45309` | `#F59E0B` |
| 0–39 | Critical | `#FFF1F2` | `#BE123C` | `#F43F5E` |

### Sentiment Spectrum (gradient, -1.0 to +1.0)

```
-1.0 → -0.6: #DC2626  (red-600)
-0.6 → -0.3: #F97316  (orange-500)
-0.3 → +0.3: #6B7280  (gray-500)
+0.3 → +0.6: #22C55E  (green-500)
+0.6 → +1.0: #15803D  (green-700)
```

### Data Visualization Palette (chart lines, grouped bars)

For multi-survey "By Survey" chart mode — consistent assignment by survey index:
```
Index 0: #6366F1  (indigo-500)
Index 1: #EC4899  (pink-500)
Index 2: #14B8A6  (teal-500)
Index 3: #F59E0B  (amber-500)
Index 4: #8B5CF6  (violet-500)
Index 5: #06B6D4  (cyan-500)
Index 6: #10B981  (emerald-500)
Index 7: #F43F5E  (rose-500)
Index 8: #3B82F6  (blue-500)
Index 9: #A16207  (yellow-700)
```

### Dark Mode Color Overrides

All light mode colors above are replaced by their dark-mode counterparts (defined in the War Room Mode CSS custom properties). Charts use `--chart-line` for primary series and `--bg-surface-2` for secondary fills.

---

## Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Org Health Score (hero number) | System UI / Inter | 2.5rem (40px) | 900 (black) | Dynamic (health color) |
| KPI values | Inter | 2.25rem (36px) | 800 (extrabold) | `gray-900` |
| Chart axis labels | Inter | 0.75rem (12px) | 400 | `gray-500` |
| Table cell text | Inter | 0.875rem (14px) | 400 | `gray-700` |
| Table header | Inter | 0.75rem (12px) | 600 | `gray-500` uppercase |
| Crystal Brief body | Inter | 1rem (16px) | 400 | `gray-900` |
| Crystal recommendation text | Inter | 0.875rem (14px) | 500 | `gray-800` |
| Section headings | Inter | 0.875rem (14px) | 600 | `gray-900` |
| Sub-labels (e.g., "127 today") | Inter | 0.75rem (12px) | 600 | dynamic |

All numeric values use `font-variant-numeric: tabular-nums` to prevent layout shift during live updates.

---

## Accessibility

### WCAG 2.1 AA Targets

All color combinations meet a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text (18pt or 14pt bold). The War Room Mode palette is specifically designed to exceed 7:1 contrast ratio (AAA level) for all critical information.

### Keyboard Navigation Spec

```
Tab order (left-to-right, top-to-bottom):
1. Xperiq logo link
2. Date range picker
3. Tag Group filter dropdown
4. Ask Crystal trigger (⌘K)
5. Notification bell
6. User menu
7. Crystal Brief card (focusable, Enter navigates to full Crystal chat)
8. "Ask follow-up" button
9. KPI tiles (focusable, Enter scroll to related section)
10. Chart (receives focus; keyboard-navigates data points with arrow keys)
11. Programs table rows (Enter to expand detail; Tab to "Ask Crystal" button)
12. Topic chips (Enter to expand drawer; Escape to close)
13. Anomaly alert items (Tab to Resolve/View buttons)
14. Tag group cards (Enter to navigate to Tag Intelligence View)
```

Arrow key support in the NPS chart: Left/Right arrows move between data points. The active data point shows a focus ring and an aria-label with the full data values.

### Screen Reader aria-label Patterns

```
Org Health Score:
  aria-label="Organization health score: {score} out of 100. Status: {status}. 
               30-day trend: {trend direction}."

KPI Tiles:
  aria-label="Total active surveys: {count}. Change: {delta} this month."
  aria-label="Total responses: {count}. Responses today: {today}."
  aria-label="Organization NPS: {score}. Week over week change: {delta} points."
  aria-label="Average sentiment: {score} out of 100. Trend: {trend}."

HealthPill:
  aria-label="Health status: {status}"

Anomaly Alert:
  role="alert" (for new alerts arriving via WebSocket)
  aria-label="New {severity} anomaly: {description}. In survey: {surveyName}. Detected {timeAgo}."

Crystal Brief:
  aria-label="Crystal's weekly brief for the week of {dateRange}"
  
"Live" badge:
  aria-label="Live data connection active"
  (when disconnected): aria-label="Live data connection interrupted, reconnecting"
```

All interactive elements have a visible focus ring (`outline: 2px solid #6366F1; outline-offset: 2px`) that is not suppressed with `outline: none`.

---

*This design specification is the contract between Design and Engineering. No UI component within Command Center may ship to production without matching this specification. Deviations require Marcus's written sign-off and a DECISIONS.md entry explaining the rationale.*
