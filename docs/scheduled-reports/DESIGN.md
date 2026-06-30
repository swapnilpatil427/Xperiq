# Intelligence Briefings — Design Specification

> **Feature:** Intelligence Briefings (formerly "Scheduled Reports")
> **Design owner:** Priya Menon (Design Lead)
> **Email delivery specialist:** Priya Menon
> **Updated:** 2026-06-29
> **Status:** Approved for implementation

---

## 1. Design Philosophy

Intelligence Briefings are no longer a separate feature. They are a type of automation, created inside the Automation Hub and viewed on a dedicated delivery route. This is not a cosmetic re-labeling — it changes what the feature fundamentally *is*.

**The old mental model:** "I'm configuring a report."
**The new mental model:** "I'm setting up an automation whose output is a briefing."

This shift matters because it eliminates a fork in the product. Users who already understand automations now understand briefings for free. The builder is the same. The run history is the same. What changes is the output: instead of triggering a Slack message or closing a survey, the action is "Generate Briefing" — and the result is a pixel-perfect, Crystal-authored email artifact that a VP of CX would forward to their board on Monday morning.

### Core Design Principles

**1. The InsightReport is the product. Email is a delivery channel.**
CrystalOS always generates a full InsightReport first — that is the canonical output. Email, Slack, and PDF are renderings of that report, not the other way around. A recipient who never opens the email can still find the report in the survey's Experience tab. A recipient who reads the email can click through to the same report in-app.

**2. Crystal speaks first.**
No section opens with a table or a number. Crystal's narrative leads every section. Data confirms what Crystal said — it does not replace it.

**3. Actions over observations.**
Every briefing ends with Crystal's Recommendations: three specific things the reader can do this week. Not "NPS is down." But: "Brief your Customer Success team on the billing FAQ gap before Thursday."

**4. Beautiful enough to forward.**
The briefing email must survive the VP forwarding test. A CX director should feel proud — not apologetic — when forwarding this to their board. Every pixel earns its place. But the email is a window into the report, not a replacement for it.

**5. Briefings as automations — no orphan features.**
There is no separate "Reports" page, no 3-step report wizard, no `/reports` route. Briefing configuration lives entirely inside the Automation Hub builder. The generated report lives in the survey's Experience tab. This is not a simplification — it's the correct architecture.

**6. Never go silent. Fallback to last report when data is insufficient.**
When a scheduled run fires and there are too few new responses to generate a meaningful report, the automation does not skip. It resends the most recent available InsightReport with a clear banner noting no new data is available. Recipients always receive *something* on schedule.

---

## 2. How Briefings Are Created

Intelligence Briefings are created through the standard Automation Hub flow at `/workflows`. The full builder design (canvas layout, left panel, right panel, Crystal Builder mode, Test Mode, etc.) is specified in `docs/workflows/DESIGN.md`. This section covers only what is **unique to the Intelligence Briefing type**.

### Creation Flow

1. User navigates to `/workflows` → clicks `+ New Workflow`
2. Builder opens in Crystal Builder mode (default for new workflows)
3. User either:
   - **Types a description** in the NL input: _"Send me a weekly NPS digest every Monday morning"_ → Crystal fills the builder with a `schedule` trigger and a `generate_briefing` action card
   - **Browses templates** → selects one of the 6 Intelligence Briefing templates from the Template Gallery (templates 2, 10, and the 4 briefing-specific templates in the gallery)
   - **Builds manually** → switches to Visual Builder, adds a `Schedule` trigger, then adds a `✦ Intelligence Briefing` action card from the Actions left panel
4. The `✦ Intelligence Briefing` action card is selected → right panel shows briefing-specific configuration (Section 3 below)
5. User configures template, tone, time range, scope, and sections in the right panel
6. User clicks `Enable` — briefing automation is active

### The Action Card (Center Canvas)

When a `generate_briefing` action is on the canvas, its card shows:

```
┌────────────────────────────────────────────────────────────┐
│  ✦ INTELLIGENCE BRIEFING                     (crystal-purple) │
│                                                             │
│  Weekly NPS Digest                                          │
│  Last 7 days · Professional · 4 sections                   │
│                                                             │
│  Recipients: [avatar] [avatar] [avatar] +2                  │
└────────────────────────────────────────────────────────────┘
```

- Card left border: 3px solid `#7C3AED` (Crystal purple — distinct from the standard action card's blue/green borders)
- Top label: `✦ INTELLIGENCE BRIEFING` in `text-[10px] font-semibold uppercase tracking-widest text-violet-500`
- Card title: selected template name in `text-[18px] font-medium text-gray-900`
- Summary line: `{time_range} · {tone} · {section_count} sections` in `text-[14px] text-gray-500`
- Recipients row: stacked avatars (24px each, -4px overlap), up to 4 shown + `+N` if more
- Background: `white` with subtle `bg-violet-50/30` tint
- Border: `2px solid #EDE9FE` (violet-100) at rest, `2px solid #7C3AED` when selected

---

## 3. Builder: Briefing-Specific Right Panel

When the `✦ Intelligence Briefing` action card is selected in the canvas, the right panel (320px fixed width) renders the `BriefingConfigPanel` component. This panel replaces the generic action config.

### Panel Header

```
┌─────────────────────────────────────────────────────────┐
│  ✦ Intelligence Briefing                                 │
│  Configure what Crystal will generate and send.         │
└─────────────────────────────────────────────────────────┘
```

- Title: `text-[14px] font-semibold text-gray-900`
- Subtitle: `text-[12px] text-gray-500`
- Crystal icon (16px, `text-violet-500`) precedes title

### Field 0: Output Mode

**Label:** `Output` in `text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1.5`

**Control:** Three-button segmented control, full-width, height 34px. Same style as Field 2 Tone selector.

```
[ Email Digest ]  [ Full Report ]  [ Both ]
```

| Value | Meaning |
|---|---|
| `email_digest` | Generate email briefing only. Stored in `report_artifacts`. Visible in automation run history. **Default for**: Weekly NPS Digest, Anomaly Alert, Tag Group Weekly. |
| `full_report` | Generate a full interactive in-app Insight Report AND an email that links to it. Report stored via `InsightReport` document format and written as a trail checkpoint. **No email-only artifact** — the email IS the "view in app" notification. |
| `both` | Generate email briefing AND a full in-app Insight Report. Email contains "View full report →" CTA linking to the in-app report. **Default for**: Monthly Exec Summary, QBR Pack, Survey Closeout. |

**Effect on the canvas card summary line:**

- `email_digest`: `Last 7 days · Professional · 4 sections · Email`
- `full_report`: `Last 7 days · Professional · Full Report · In-app`
- `both`: `Last 7 days · Professional · Full Report + Email`

**Interaction note:** When switching to `full_report` or `both`, the Fields 6 (Recipients) and 7 (Delivery Channels) sections collapse to show only an "In-app (always on)" static chip — email recipients are still shown but labeled "Email notification recipients" with a help tooltip: "These addresses receive an email linking to the full report in Xperiq. The full report lives in the survey's intelligence trail."

---

### Where Full Reports Live

The output destination depends on the briefing's scope (Field 4):

**Survey-scoped** (Scope = single survey):
- CrystalOS emits a `report_document` alongside the email artifact: `{ title, narrative, findings: [{ headline, narrative }] }`
- Backend writes a new `InsightTrailPage` checkpoint: `lane: 'automated'`, `trigger: 'scheduled'`, `tier_label: 'full_report'` (or `growing_picture` for shorter time ranges), `report_id` pointing to the new report document
- The report is viewable at `/app/surveys/:surveyId/intelligence/reports/:reportId` — same `InsightReportPage`, no new component needed
- Email CTA: `View full report →` links to this route
- The checkpoint appears in the survey's intelligence trail next to automated and manual checkpoints, with a `📅 Scheduled` trigger badge to distinguish it from threshold-triggered checkpoints

**Org-scoped or tag-scoped** (Scope ≠ single survey):
- There is no per-survey trail to write to
- Full reports for org/tag scope are stored in the `org_briefing_archive` (new — see TASK-046)
- Accessible from: Command Center → "Briefing Archive" tab, and from the automation's run history
- Route: `/app/briefings/:reportId` — uses the same `InsightReportPage` component with org-scoped data adapter
- Email CTA: `View full report in Xperiq →` links to this route

---

### Field 1: Template Selector

**Label:** `Template` in `text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1.5`

**Control:** Custom dropdown (`<select>`-based for v1, combobox in v2). Full-width. Height: 36px. `rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20`

**Options (6 built-in):**
| Value | Label | Icon |
|---|---|---|
| `weekly_nps_digest` | Weekly NPS Digest | `BarChart2` (Lucide, 14px) |
| `monthly_executive_summary` | Monthly Exec Summary | `Presentation` |
| `survey_closeout` | Survey Closeout | `CheckCircle2` |
| `tag_group_weekly` | Tag Group Weekly | `Tag` |
| `anomaly_alert` | Response Anomaly Alert | `AlertTriangle` |
| `qbr_pack` | QBR Pack | `Briefcase` |

**On change:** Mini email preview thumbnail (Field 8) updates immediately with new template structure skeleton.

### Field 2: Tone Selector

**Label:** `Tone` in same style as Field 1 label. `mt-4 mb-1.5`

**Control:** Three-button segmented control. Total width: 100% of panel minus 32px horizontal padding. Buttons equal width.

```
[ Formal ]  [ Professional ]  [ Conversational ]
```

- Container: `flex rounded-lg border border-gray-200 overflow-hidden h-[34px]`
- Inactive button: `flex-1 text-[12px] font-medium text-gray-600 bg-white hover:bg-gray-50 transition-colors`
- Active button: `flex-1 text-[12px] font-medium text-indigo-700 bg-indigo-50 border-x border-indigo-200`
- Default: `Professional`

**Effect:** Tone affects only Crystal's narrative writing style. It does not change which sections are included. The mini preview does not reflect tone visually.

### Field 3: Time Range

**Label:** `Time Range`

**Control:** Select dropdown, same style as Field 1.

**Options:**
- `last_7_days` — Last 7 days
- `last_30_days` — Last 30 days (default)
- `last_quarter` — Last quarter
- `since_launch` — Since survey launch

**Hidden for event-triggered templates** (`anomaly_alert`, `survey_closeout`): replaced by a muted note: `"Time range is determined automatically for event-triggered briefings."` in `text-[11px] text-gray-400 italic mt-1`

### Field 4: Scope Override

**Label:** `Scope`

**Behavior:** Inherits from the parent workflow's scope (set in the trigger's survey/org context). Shows a read-only chip by default:

```
Inherited from trigger:  [Survey: Q2 Customer NPS  ×]
```

- Chip: `inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-600`
- `×` button on chip: clicking it switches the field to edit mode
- In edit mode: three radio buttons — `Specific survey`, `Tag group`, `Entire org` — with the appropriate picker (combobox) below the selected option. Same combobox pattern as the main workflow scope selector.
- Edit mode confirmation: `[Apply scope override]` button (indigo, `text-[12px]`)
- After applying: chip shows override label + `[Clear override →]` ghost link below it

### Field 5: Sections List

**Label:** `Sections` with a `Reorder` ghost-text hint on the right: `text-[10px] text-gray-400`

**Container:** `mt-3 rounded-lg border border-gray-200 overflow-hidden`

Each section row (44px height):

```
⠿  Crystal Narrative    [FIXED]            ●
⠿  KPI Row              [FIXED]            ●
⠿  NPS Trend Chart                         ○ ──
⠿  Topics                                  ○ ──
⠿  Moments That Mattered                   ○ ──
⠿  Action Recommendations [FIXED]          ●
```

**Row anatomy:**
- `⠿` drag handle: `text-gray-300 hover:text-gray-500 cursor-grab`, visible on row hover only. Width: 20px. The `⠿` character is Unicode `U+2807` (Braille Pattern Dots-123).
- Section name: `text-[12px] font-medium text-gray-700`, truncated at 22 chars
- `[FIXED]` badge: shown for required sections only. `text-[9px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 ml-1.5`
- Toggle: standard Tailwind v4 toggle switch, 28×16px. Disabled (locked on) for FIXED sections — switch rendered with `opacity-50 cursor-not-allowed pointer-events-none`
- Row separator: `border-b border-gray-100` between rows

**Drag-to-reorder implementation:** Uses `@dnd-kit/core` with `@dnd-kit/sortable`. Each row is wrapped in `<SortableItem>`. Drag sensors: `useSensor(PointerSensor, { activationConstraint: { distance: 5 } })`. FIXED sections are not draggable (`disabled: true` on `useSortable`). Drop animation: `defaultDropAnimationSideEffects` with `duration: 200ms`. Drag overlay: ghost card at `opacity-70 scale-[1.02] shadow-lg`.

**Fixed sections (always required, always visible, cannot be reordered past optional sections):**
1. Crystal Narrative (always first)
2. KPI Row (always second)
3. Action Recommendations (always last)

**Optional sections (can be reordered among themselves, within the bounded range between KPI Row and Action Recommendations):**
- NPS Trend Chart
- Topics
- Moments That Mattered

### Field 6: Recipients

**Label:** `Recipients`

**Control:** Tag input. `rounded-lg border border-gray-200 bg-white min-h-[36px] px-2 py-1 flex flex-wrap gap-1 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20`

- Each recipient chip: `inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] text-indigo-700`
- Autocomplete against org members (Clerk users); accepts freeform external email
- `[+ Add me]` shortcut link below input: `text-[11px] text-indigo-600 hover:text-indigo-800 cursor-pointer`
- Recipient add animation: `initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}` over 150ms (Framer Motion)

### Field 7: Delivery Channels

**Label:** `Also deliver to`

**Toggles (stacked, 40px row height each):**

```
[toggle]  Slack  #channel-name
[toggle]  Webhook  https://...
```

- Toggle style: same 28×16px switch
- When Slack toggled on: webhook URL input slides in below (Framer Motion `AnimatePresence`, height animation 200ms). Input: `text-[12px] placeholder:text-gray-400` with `#` prefix for channel name.
- When Webhook toggled on: URL input slides in with `[Test]` button inline

In-app delivery: always-on, shown as a static chip: `In-app  ●  Always on` in `text-[11px] text-gray-400`

### Field 8: Mini Email Preview Thumbnail

**Container:** `mt-4 rounded-lg border border-gray-200 overflow-hidden bg-gray-50`

A 100%-width, ~160px tall thumbnail rendering the email skeleton for the selected template. This is NOT a live data preview — it is a pre-rendered SVG skeleton illustration shipped with each template. The skeleton shows:

- Header band (proportional, Indigo `#4F46E5`): Xperiq logo placeholder + "Intelligence Briefing" text
- Crystal Summary card: narrow horizontal bar with 3 lines
- KPI Row: 4 cells with placeholder metric blocks
- Optional sections: gray block for each enabled optional section, absent for disabled sections
- Recommendations card: indigo-tinted block with 3 bullet lines

When the template changes, the thumbnail cross-fades (200ms opacity transition) to the new template's skeleton.

**Below thumbnail:**
```
✦ Generate live preview with your data →
```
`text-[12px] text-violet-600 hover:text-violet-800 font-medium cursor-pointer flex items-center gap-1 px-3 py-2`

Clicking triggers the live preview flow (Section 6: Micro-Interactions).

---

## 4. Surface: Briefing Delivery View

**Route:** `/app/automations/:id/runs/:runId`

This is where users view, share, and download a generated briefing. It is the primary visual surface for the Intelligence Briefings feature — the equivalent of opening an email in an email client, but richer.

**This route is unified with the Automation Hub run detail view.** When the run is a `generate_briefing` action, the page renders the Briefing Delivery View layout. For other action types it renders the standard run detail layout. The router detects this from `run.actionType === 'generate_briefing'`.

### Page Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ← Automations  /  NPS Weekly Briefing  /  Run #47                 [Share] [···] │  ← top bar
├───────────────────────────────────────────────────────┬──────────────────────────┤
│                                                       │  RIGHT SIDEBAR (280px)   │
│             #F2F2F2 background                        │                          │
│                                                       │  [Briefing metadata]     │
│   ┌───────────────────────────────────────────────┐   │  [Actions]               │
│   │                                               │   │                          │
│   │         EMAIL CONTAINER (600px, white)        │   │                          │
│   │                                               │   │                          │
│   │  [Full email sections — see below]            │   │                          │
│   │                                               │   │                          │
│   └───────────────────────────────────────────────┘   │                          │
│                                                       │                          │
└───────────────────────────────────────────────────────┴──────────────────────────┘
```

- Page background: `#F2F2F2`
- Main area: `flex justify-center py-8 px-4`
- Email container: `w-[600px] max-w-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.10)] rounded-sm overflow-hidden`
- Right sidebar: `w-[280px] shrink-0 bg-white border-l border-gray-200 flex flex-col`

**Mobile (375px constrained):**
- Email container becomes full width: `w-full rounded-none shadow-none`
- Right sidebar collapses into a bottom sheet, triggered by a `···` button in the top bar. Bottom sheet height: 60vh, `rounded-t-2xl shadow-2xl`.

### Top Bar

`h-[48px] bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-20`

- Left: breadcrumb — `text-[13px] text-gray-500` with `→` separator, last item `text-gray-900 font-medium`
- Right: `[Share]` button (outlined, `text-[13px]`) + `[···]` menu button
- `[···]` menu items: "Resend to me", "Download PDF", "Edit automation →", "View run log"

---

### Email Container: Full Pixel Spec

The email container renders the same HTML that was delivered to recipients' inboxes. In the web view, it is enhanced with interactive overlays (clickable topics, live NPS chart). All measurements are exact — use these as the source of truth for both the HTML email template (Jinja2) and the React delivery view component.

---

#### Section 1: Header Band

**Height:** 72px
**Background:** `#4F46E5` (Xperiq Indigo, full-width)
**Padding:** `24px 32px` (desktop) / `20px 20px` (mobile, ≤600px)
**Layout:** Two-column flex row, `align-items: center`, `justify-content: space-between`

**Left column:**
- Xperiq logo: white SVG wordmark, width 88px, height auto
- Logo font fallback (text-only email clients): `font-family: 'Inter', Arial, sans-serif; font-size: 18px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.02em`

**Right column:** `text-align: right`
- Label: `"Intelligence Briefing"` in `font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #A5B4FC` (indigo-300)
- Scope + date line: `font-size: 12px; font-weight: 400; color: #E0E7FF` (indigo-100)
- Example: `"Survey: Q2 NPS · Jun 23–30, 2026"`

**HTML email table pattern:**
```html
<table width="600" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#4F46E5" style="background-color:#4F46E5;">
  <tr>
    <td style="padding:24px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="50%" valign="middle">
            <!-- Logo img or fallback text -->
            <img src="https://assets.xperiq.com/email/logo-white.png"
                 width="88" height="24" alt="Xperiq"
                 style="display:block; border:0;">
          </td>
          <td width="50%" valign="middle" style="text-align:right;">
            <p style="margin:0; font-family:'Inter',Arial,sans-serif;
                      font-size:10px; font-weight:600; text-transform:uppercase;
                      letter-spacing:0.08em; color:#A5B4FC;">
              Intelligence Briefing
            </p>
            <p style="margin:4px 0 0; font-family:'Inter',Arial,sans-serif;
                      font-size:12px; color:#E0E7FF;">
              Survey: Q2 NPS &middot; Jun 23&ndash;30, 2026
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

#### Section 2: Crystal Summary Card

**Height:** 96px minimum (auto if narrative is long)
**Background:** `#EEF2FF` (indigo-50)
**Border-left:** `4px solid #7C3AED` (Crystal purple)
**Margin:** `0` (directly under header, no gap)
**Padding:** `20px 28px`

**Layout (top line):**
- Crystal icon (SVG sparkle, 14px × 14px, `color: #7C3AED`) + `"✦ Crystal's Summary"` label
- Label: `font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6B7280`
- Icon + label inline, `gap: 6px`

**Narrative body:**
- `font-family: 'Inter', Arial, sans-serif`
- `font-size: 14px; line-height: 1.65; color: #1F2937` (gray-800)
- Three sentences. Each ends with a `<br><br>` in the email HTML for breathing room.
- The narrative MUST be specific and grounded. Template:
  - Sentence 1: What changed (metric + magnitude + driver)
  - Sentence 2: What's driving detractors or the most significant concern
  - Sentence 3: Crystal's forward-looking signal or recommended focus

**HTML email table pattern:**
```html
<table width="600" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#EEF2FF"
       style="background-color:#EEF2FF;
              border-left:4px solid #7C3AED;">
  <tr>
    <td style="padding:20px 28px;">
      <p style="margin:0 0 8px;
                font-family:'Inter',Arial,sans-serif;
                font-size:10px; font-weight:600;
                text-transform:uppercase; letter-spacing:0.08em;
                color:#6B7280;">
        ✦ Crystal's Summary
      </p>
      <p style="margin:0;
                font-family:'Inter',Arial,sans-serif;
                font-size:14px; line-height:1.65; color:#1F2937;">
        Your NPS rose 12 points this week, driven by a surge of promoter responses
        citing the new onboarding flow.<br><br>
        Detractor themes centered on response time and billing clarity, each
        appearing in over 18% of low-score responses.<br><br>
        This week's signal suggests a strong opportunity to close the billing FAQ
        gap — addressing it could convert 15–20 detractors to passives within
        30 days.
      </p>
    </td>
  </tr>
</table>
```

---

#### Section 3: KPI Row

**Height:** 80px
**Background:** `#FFFFFF`
**Border:** `1px solid #F3F4F6` (gray-100) top and bottom
**Padding:** `0` (padding is on each cell, not the container)

**Layout:** 4 equal-width cells in a single table row. Vertical `1px solid #F3F4F6` separators between cells.

**Each cell:**
- Width: 25% (150px each at 600px total)
- Padding: `16px 0`
- Text-align: `center`

**Cell content (top to bottom):**
1. Metric label: `font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #9CA3AF` (gray-400)
2. Metric value: `font-size: 36px; font-weight: 700; line-height: 1.1; margin-top: 4px`
   - NPS: color `#4F46E5` (Indigo)
   - Response count: color `#111827` (gray-900)
   - Velocity: color `#111827`
   - Completion rate: color `#111827`
3. Delta pill: `display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600`
   - Positive delta: `background: #ECFDF5; color: #059669` (emerald)
   - Negative delta: `background: #FEF2F2; color: #DC2626` (red)
   - Neutral (±0): `background: #F9FAFB; color: #6B7280` (gray)
   - Delta text format: `+12 pts` / `−4 pts` / `+87` / `−3%`

**Metrics:**
| Cell | Label | Value type | Delta label |
|---|---|---|---|
| 1 | NPS Score | Integer −100 to +100 | `pts vs last week` |
| 2 | Responses | Integer | `vs last week` |
| 3 | Resp / Day | Decimal (1dp) | `vs last week` |
| 4 | Completion | Percentage | `vs last week` |

**HTML email table pattern:**
```html
<table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF"
       style="background-color:#FFFFFF;
              border-top:1px solid #F3F4F6;
              border-bottom:1px solid #F3F4F6;">
  <tr>
    <td width="150" style="padding:16px 0; text-align:center;
                           border-right:1px solid #F3F4F6;">
      <p style="margin:0; font-size:10px; font-weight:600;
                text-transform:uppercase; letter-spacing:0.06em;
                color:#9CA3AF; font-family:'Inter',Arial,sans-serif;">
        NPS Score
      </p>
      <p style="margin:4px 0 0; font-size:36px; font-weight:700;
                line-height:1.1; color:#4F46E5;
                font-family:'Inter',Arial,sans-serif;">
        47
      </p>
      <span style="display:inline-block; margin-top:4px; padding:2px 8px;
                   border-radius:9999px; background:#ECFDF5; color:#059669;
                   font-size:11px; font-weight:600;
                   font-family:'Inter',Arial,sans-serif;">
        +12 pts
      </span>
    </td>
    <!-- repeat for Responses, Resp/Day, Completion -->
  </tr>
</table>
```

**Web view enhancement:** The KPI Row is a React component (`<BriefingKPIRow>`). Delta pills have a subtle count-up animation (`framer-motion` `animate={{ opacity: [0,1] }}` + value counting from `value * 0.8` to `value` over 600ms) on first paint of the delivery view.

---

#### Section 4: What Changed

**Height:** Auto (3 rows minimum)
**Background:** `#FFFFFF`
**Padding:** `20px 28px`

**Section label:**
`"WHAT CHANGED"` in `font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6B7280`
Followed immediately by a `<hr>` style divider: `border: none; border-top: 1px solid #F3F4F6; margin: 8px 0 12px`

**Change rows (3 total):**
Each row is a table row, `height: 40px`:
- Left: metric name `font-size: 13px; font-weight: 500; color: #374151` — width ~40%
- Center: directional arrow icon
  - Up: `↑` in `color: #059669` (emerald-600), `font-size: 16px; font-weight: 700`
  - Down: `↓` in `color: #DC2626` (red-600)
  - Flat: `→` in `color: #9CA3AF` (gray-400)
  - In HTML email: use Unicode arrows with inline color; do NOT use `<img>` for these
- Right: delta value + context string `font-size: 13px; color: #374151` + `font-size: 11px; color: #9CA3AF` on separate line

Example rows:
```
NPS Score         ↑  +12 points      vs. last week
Response Volume   ↑  +87 responses   vs. last week
Completion Rate   →  No change       steady at 78%
```

---

#### Section 5: Topics

**Height:** Auto
**Background:** `#FFFFFF`
**Padding:** `20px 28px`

**Section label:** `"WHAT CUSTOMERS ARE SAYING"` — same label style as Section 4

**Layout:** Two-column table, `50%` width each. Left column header: `"Promoters"` in `color: #059669; font-size: 11px; font-weight: 600`. Right column header: `"Detractors"` in `color: #DC2626; font-size: 11px; font-weight: 600`. Headers have bottom border `1px solid` in matching color at 30% opacity.

**Topic chips (3 per column, stacked with 6px gap):**
```html
<!-- Promoter chip -->
<span style="display:inline-flex; align-items:center;
             background:#ECFDF5; border:1px solid #A7F3D0;
             border-radius:9999px; padding:4px 12px;
             font-size:12px; font-weight:500; color:#065F46;
             font-family:'Inter',Arial,sans-serif;">
  Onboarding  <span style="margin-left:6px; opacity:0.6; font-size:11px;">×34</span>
</span>

<!-- Detractor chip -->
<span style="display:inline-flex; align-items:center;
             background:#FEF2F2; border:1px solid #FECACA;
             border-radius:9999px; padding:4px 12px;
             font-size:12px; font-weight:500; color:#991B1B;
             font-family:'Inter',Arial,sans-serif;">
  Billing FAQ  <span style="margin-left:6px; opacity:0.6; font-size:11px;">×22</span>
</span>
```

**Web view enhancement (interactive mode):**
Topic chips in the web delivery view are wrapped in `<button>` elements:
- `onClick` navigates to `/surveys/:surveyId/insights?topic={encodeURIComponent(topicLabel)}`
- Hover state: `ring-2 ring-offset-1 ring-current cursor-pointer`
- Tooltip on hover: `"View {count} responses about {topicLabel} →"`

**Mobile (≤600px):** Two columns collapse to one column (promoter rows then detractor rows, with color-coded header labels retained).

---

#### Section 6: Moments That Mattered

**Height:** Auto (2–3 quote cards)
**Background:** `#F9FAFB` (gray-50)
**Padding:** `20px 28px`

**Section label:** `"✦ MOMENTS THAT MATTERED"` in `font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #7C3AED` (Crystal purple — this label uses purple, not gray, to signal Crystal's curation)

**Quote cards (2–3):**
Each card: `background: #FFFFFF; border-left: 3px solid {sentimentColor}; border-radius: 0 8px 8px 0; padding: 14px 16px; margin-bottom: 10px`

Sentiment colors:
- Positive: `#10B981` (emerald-500)
- Negative: `#EF4444` (red-500)
- Neutral: `#9CA3AF` (gray-400)

Quote text: `font-size: 13px; font-style: italic; line-height: 1.6; color: #374151`

Attribution line (below quote, 8px margin-top):
`font-size: 11px; color: #9CA3AF; font-style: normal`
Format: `"Respondent #4821 · Jun 28"` — NEVER include full name or email address.

Sentiment pill (inline with attribution, 8px margin-left):
`background: {sentimentBg}; color: {sentimentText}; border-radius: 9999px; padding: 2px 8px; font-size: 10px; font-weight: 600; text-transform: uppercase`

---

#### Section 7: Crystal Recommendations

**Height:** Auto (3 bullets)
**Background:** `#EEF2FF` (indigo-50)
**Border:** `1px solid #E0E7FF` (indigo-100) on all sides
**Padding:** `20px 28px`
**Margin:** `16px 0` (spacer above and below within container)

**Section label:** `"✦ RECOMMENDED ACTIONS"` in `font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #4338CA` (indigo-700)

**Bullet rows (3 items, 16px gap between):**

Each bullet row: `display: flex; align-items: flex-start; gap: 12px`

Priority dot (left, `margin-top: 3px`): SVG circle 8px × 8px
- High priority: `fill: #DC2626` (red)
- Medium priority: `fill: #D97706` (amber)
- Low priority: `fill: #10B981` (emerald)

**Action text:** `font-size: 13px; font-weight: 500; color: #1F2937`

**Rationale line:** `font-size: 11px; color: #6B7280; margin-top: 3px; line-height: 1.5`

**HTML email table pattern:**
```html
<table width="600" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#EEF2FF"
       style="background-color:#EEF2FF; border:1px solid #E0E7FF;
              margin:16px 0;">
  <tr>
    <td style="padding:20px 28px;">
      <p style="margin:0 0 12px; font-size:10px; font-weight:600;
                text-transform:uppercase; letter-spacing:0.08em;
                color:#4338CA; font-family:'Inter',Arial,sans-serif;">
        ✦ Recommended Actions
      </p>
      <!-- Bullet 1 -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
        <tr>
          <td width="16" valign="top" style="padding-top:3px;">
            <!-- Red dot for high priority -->
            <div style="width:8px; height:8px; border-radius:50%;
                        background:#DC2626; display:inline-block;"></div>
          </td>
          <td style="padding-left:10px;">
            <p style="margin:0; font-size:13px; font-weight:500;
                      color:#1F2937; font-family:'Inter',Arial,sans-serif;">
              Brief your Customer Success team on the billing FAQ gap.
            </p>
            <p style="margin:3px 0 0; font-size:11px; color:#6B7280;
                      line-height:1.5; font-family:'Inter',Arial,sans-serif;">
              22 detractor responses cited billing confusion — a targeted FAQ update
              could measurably reduce this theme within 2 weeks.
            </p>
          </td>
        </tr>
      </table>
      <!-- Bullets 2–3: same pattern -->
    </td>
  </tr>
</table>
```

---

#### Section 8: Footer

**Height:** Auto
**Background:** `#F3F4F6` (gray-100)
**Padding:** `24px 32px`
**Text-align:** `center`

**CTA Button:**

The footer CTA changes based on `output_mode` (Field 0):

**`email_digest` mode** — links to the survey or org dashboard (existing behavior):
```html
<table cellpadding="0" cellspacing="0" border="0"
       style="margin:0 auto 16px;">
  <tr>
    <td bgcolor="#4F46E5"
        style="background-color:#4F46E5; border-radius:8px;">
      <a href="{dashboard_url}"
         style="display:inline-block; padding:12px 28px;
                font-family:'Inter',Arial,sans-serif;
                font-size:14px; font-weight:600; color:#FFFFFF;
                text-decoration:none; letter-spacing:0.01em;">
        View Full Dashboard &rarr;
      </a>
    </td>
  </tr>
</table>
```

**`full_report` or `both` mode** — primary CTA links to the full in-app report, secondary CTA links to the dashboard:
```html
<!-- Primary CTA: Full Report (Crystal purple) -->
<table cellpadding="0" cellspacing="0" border="0"
       style="margin:0 auto 10px;">
  <tr>
    <td bgcolor="#7C3AED"
        style="background-color:#7C3AED; border-radius:8px;">
      <a href="{full_report_url}"
         style="display:inline-block; padding:12px 28px;
                font-family:'Inter',Arial,sans-serif;
                font-size:14px; font-weight:600; color:#FFFFFF;
                text-decoration:none; letter-spacing:0.01em;">
        ✦ View Full Report in Xperiq &rarr;
      </a>
    </td>
  </tr>
</table>
<!-- Secondary CTA: Dashboard (ghost link, only shown when output_mode = 'both') -->
<p style="margin:0 0 16px; text-align:center;
           font-family:'Inter',Arial,sans-serif;
           font-size:12px; color:#9CA3AF;">
  or <a href="{dashboard_url}"
        style="color:#6B7280; text-decoration:underline;">
    open dashboard
  </a>
</p>
```

`{full_report_url}` resolves to:
- Survey-scoped: `/app/surveys/{surveyId}/intelligence/reports/{reportId}`
- Org-scoped: `/app/briefings/{reportId}`
- Tag-scoped: `/app/briefings/{reportId}?tag={tagSlug}`

**On mobile (≤600px):** Button becomes full-width: `width: 100%; display: block; text-align: center`

**Legal/Unsubscribe line:**
`font-size: 11px; color: #9CA3AF; line-height: 1.8`
```
Unsubscribe from this report &middot; Generated by Crystal AI &middot; Xperiq
```
Each word/phrase separated by `·`. "Unsubscribe from this report" is an `<a>` linking to `/api/reports/unsubscribe/{token}` — the unsubscribe token is per-recipient, generated at delivery time, never expires.

---

### Right Sidebar Spec (280px)

**Container:** `w-[280px] shrink-0 bg-white border-l border-gray-200 overflow-y-auto`
**Padding:** `px-5 py-6`

#### Sidebar Section 1: Report Identity

**Report name:** `text-[16px] font-semibold text-gray-900 leading-tight`
**Subtitle:** `"Intelligence Briefing"` in `text-[12px] text-violet-600 font-medium mt-0.5 flex items-center gap-1` with Crystal sparkle icon (12px)
**Divider:** `mt-4 border-t border-gray-100`

#### Sidebar Section 2: Run Metadata

Label style (all labels): `text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-3 mb-0.5`
Value style: `text-[13px] text-gray-700`

| Label | Value |
|---|---|
| Generated | `Jun 30, 2026 at 6:02am PT` |
| Generation Time | `8.4s` |
| Data Range | `Jun 23 – Jun 29, 2026` |
| Responses Analyzed | `412` |
| Recipients | `4 recipients` |
| Open Rate | `3 of 4 opened (75%)` |
| Run ID | `run_a8f3b2c1` in `text-[11px] font-mono text-gray-400` |

**Recipients value:** Clicking `"4 recipients"` expands an inline list of recipient names/emails with per-recipient open status (checkmark or dash). Expansion: `AnimatePresence` height animation 200ms.

#### Sidebar Section 3: Actions

Three buttons stacked, `mt-5 flex flex-col gap-2`:

**1. Resend to me** (primary button)
`w-full h-[36px] rounded-lg bg-indigo-600 text-white text-[13px] font-medium hover:bg-indigo-700 active:bg-indigo-800 transition-colors`
- On click: `POST /api/reports/{reportId}/runs/{runId}/resend-to-me` — delivers the existing artifact (no re-generation). Button shows loading spinner during request. On success: `"Sent to {userEmail}"` toast (3s).

**2. Edit automation →** (outlined button)
`w-full h-[36px] rounded-lg border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 transition-colors`
- Navigates to `/workflows/{automationId}/edit`

**3. Download PDF** (outlined button)
`w-full h-[36px] rounded-lg border border-gray-200 text-gray-700 text-[13px] font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5`
- Lucide `Download` icon (14px) + `"Download PDF"` text
- On click: `GET /api/reports/{reportId}/runs/{runId}/artifact/pdf` — triggers browser download
- If `pdf_storage_key` is null: button is disabled with tooltip `"PDF not available for this run"`

#### Sidebar Section 4: Share

**Label:** `"Share this briefing"` in `text-[12px] font-medium text-gray-700 mt-5 mb-2`
**Description:** `"Anyone with this link can view this briefing for 30 days — no login required."` in `text-[11px] text-gray-400 mb-3`

**Copy-link button:**
`w-full h-[36px] rounded-lg border border-gray-200 bg-gray-50 flex items-center gap-2 px-3 text-[12px] text-gray-500 hover:bg-gray-100 cursor-pointer`
- Left: Lucide `Link` icon (13px)
- Center text: `"Copy shareable link"` 
- Right: Lucide `Copy` icon (13px)
- On click:
  1. `POST /api/reports/{reportId}/runs/{runId}/share-link` → returns `{ url: string, expiresAt: string }`
  2. URL is copied to clipboard
  3. Button transitions to: `bg-emerald-50 border-emerald-200 text-emerald-700` with checkmark icon + `"Link copied!"` text. Reverts after 2.5s.

**Share link behavior:**
- Generated URL format: `https://app.xperiq.com/shared/briefings/{shareToken}`
- `shareToken` is a 32-character URL-safe random string, stored in `report_artifacts` table (add `share_token TEXT UNIQUE`, `share_expires_at TIMESTAMPTZ`)
- The shared route renders the email container only (no sidebar, no app chrome) with a minimal header: Xperiq logo + `"Shared Intelligence Briefing"` + expiry notice
- Link is valid for exactly 30 days from creation, not from the run date
- Multiple clicks generate the same token (idempotent); the expiry is reset on each POST call

---

## 5. The Email HTML Design System

The physical email (rendered and delivered to inboxes) has strict compatibility constraints. All HTML email output follows these rules, enforced by the Jinja2 base template at `crystalos/templates/email/base.html.j2`.

### Layout Constraints

- **Structure:** Single-column, max-width 600px, centered. Outer wrapper: `<table width="100%" cellpadding="0" cellspacing="0" border="0">` with inner `<td align="center">`. Content table: `<table width="600" ...>`.
- **No div/flexbox/grid** in the email HTML. Table-based layout only.
- **All CSS is inline.** The `premailer` Python library inlines the stylesheet at render time. The source Jinja2 templates may use a `<style>` block for authoring convenience, but the rendered output must have all styles inlined.
- **All `src` attributes use absolute URLs** (no relative paths — email clients do not resolve relative URLs).
- **Images must have `alt` text.** Every `<img>` has a non-empty `alt` attribute. Decorative images: `alt=""`. Content images (charts, icons): descriptive alt text.

### Typography Scale (email)

| Use | Size | Weight | Color (light) | Color (dark) |
|---|---|---|---|---|
| Section header label | 10px | 600 | `#9CA3AF` | `#6B7280` |
| Body / narrative | 14px | 400 | `#1F2937` | `#E5E7EB` |
| KPI value | 36px | 700 | context | context |
| Quote text | 13px | 400 italic | `#374151` | `#D1D5DB` |
| Recommendation action | 13px | 500 | `#1F2937` | `#E5E7EB` |
| Recommendation rationale | 11px | 400 | `#6B7280` | `#9CA3AF` |
| Attribution / muted | 11px | 400 | `#9CA3AF` | `#6B7280` |
| Footer text | 11px | 400 | `#9CA3AF` | `#6B7280` |

**Font stack (inline):** `font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif`

### Color Tokens (Email)

**Light mode (default):**
```
Page background:        #F9FAFB
Card / section bg:      #FFFFFF
Indigo accent:          #4F46E5
Indigo tint bg:         #EEF2FF
Crystal purple:         #7C3AED
Primary text:           #111827
Secondary text:         #374151
Muted text:             #6B7280
Subtle text:            #9CA3AF
Border / divider:       #F3F4F6
Positive:               #10B981  (emerald-500)
Positive tint:          #ECFDF5
Negative:               #EF4444  (red-500)
Negative tint:          #FEF2F2
Amber:                  #D97706
```

**Dark mode overrides** (`@media (prefers-color-scheme: dark)` — supported by Apple Mail and Gmail Android):
```css
@media (prefers-color-scheme: dark) {
  body, .email-wrapper { background-color: #111827 !important; }
  .email-container    { background-color: #1F2937 !important; }
  .text-primary       { color: #F9FAFB !important; }
  .text-secondary     { color: #D1D5DB !important; }
  .text-muted         { color: #9CA3AF !important; }
  .section-border     { border-color: #374151 !important; }
  .kpi-nps-value      { color: #818CF8 !important; } /* indigo-400 for dark */
  .crystal-card-bg    { background-color: #1E1B4B !important; } /* deep indigo dark */
  .reco-card-bg       { background-color: #1E1B4B !important; }
  .promoter-chip      { background-color: #064E3B !important; color: #A7F3D0 !important; }
  .detractor-chip     { background-color: #7F1D1D !important; color: #FECACA !important; }
}
```

### Preview Text (Inbox Snippet)

Immediately after `<body>`, before any visual content:
```html
<span style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
  {{ preview_text }}
</span>
<!-- Zero-width non-joiners to fill preview space and prevent body copy bleeding in -->
<span style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
  &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  (repeated ×8)
</span>
```

`preview_text` is generated by `generate_narrative` CrystalOS node. Max 100 characters. Example: `"NPS rose 12 pts this week — Crystal found the driver. 3 actions inside."`

### Email Headers (SendGrid)

Every email delivery sets:
```
List-Unsubscribe: <https://app.xperiq.com/api/reports/unsubscribe/{token}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
X-Report-ID: {scheduled_report_id}
X-Run-ID: {run_id}
```

`List-Unsubscribe-Post` enables RFC 8058 one-click unsubscribe in Apple Mail and Gmail. The `List-Unsubscribe` URL must respond to both `GET` (link-click unsubscribe) and `POST` (one-click unsubscribe from mail client header).

### Outlook-Specific MSO Conditional Comments

Outlook on Windows ignores most CSS border, padding, and rounded-corner declarations. Use MSO conditionals for critical layout elements:

```html
<!--[if mso]>
<table cellpadding="0" cellspacing="0" border="0" width="600"
       style="width:600px; margin:0 auto;">
<![endif]-->
<!-- email content -->
<!--[if mso]>
</table>
<![endif]-->
```

For the section divider lines (gray-100 borders between sections):
```html
<!--[if mso]>
<tr><td height="1" bgcolor="#F3F4F6" style="height:1px; font-size:1px; line-height:1px;">&nbsp;</td></tr>
<![endif]-->
```

For the Crystal Recommendations card (indigo-tinted background with border):
```html
<!--[if mso]>
<table width="544" cellpadding="0" cellspacing="0" border="0"
       bgcolor="#EEF2FF"
       style="background-color:#EEF2FF; border:1px solid #E0E7FF;">
<![endif]-->
```

### Text-Only Version

SendGrid is configured to send both HTML and plain-text versions (`multipart/alternative`). The plain-text version is generated by CrystalOS `render_html` node alongside the HTML render, using a separate Jinja2 template: `crystalos/templates/email/plain.txt.j2`.

Plain-text structure:
```
INTELLIGENCE BRIEFING — {scope} — {date_range}

CRYSTAL'S SUMMARY
{narrative}

KEY METRICS
NPS Score: {nps} ({delta})
Responses: {responses} ({delta})
...

WHAT CHANGED
...

WHAT CUSTOMERS ARE SAYING
Promoters: {topic1}, {topic2}, {topic3}
Detractors: {topic1}, {topic2}, {topic3}

MOMENTS THAT MATTERED
"{quote1}" — Respondent #{id}, {date}
...

RECOMMENDED ACTIONS
1. {action1}
   Why: {rationale1}
...

---
View full dashboard: {dashboard_url}
Unsubscribe: {unsubscribe_url}
Generated by Crystal AI · Xperiq
```

### NPS Chart: Email vs. Web

**In the HTML email:** The NPS Trend Chart section renders as a static `<img>` generated server-side by CrystalOS. The chart image is a 520×120px PNG, generated using `matplotlib` with the Xperiq color scheme. Alt text: `"NPS trend chart: {week1_nps}, {week2_nps}, ... over the past 8 weeks"`.

**In the web delivery view:** The same section renders as an interactive React chart component (`<BriefingNPSTrendChart>`) using Recharts. Line chart, same 8-week window. Axis labels visible on hover. Tooltip shows exact NPS value + response count for the hovered week. This is a progressive enhancement — the email HTML is rendered in an iframe in the web view, and the React component replaces the chart section via a DOM overlay positioned over the iframe's chart row (not a replacement of the iframe itself).

---

## 6. Micro-Interactions Specific to Briefings

### Run-Now Progress Dots

When "Run now" is triggered (from the automation card ··· menu or from the sidebar's ··· menu on the delivery view), the trigger point shows an animated progress indicator cycling through stages:

```
● Assembling data...
● Computing metrics...
● Crystal is writing...
● Rendering...
```

**Implementation:**
- Progress state polled from `GET /api/automations/:id/runs/:runId` every 3 seconds
- The `current_node` field on `ReportGenerationState` maps to display labels:
  - `assemble_scope` → `"Assembling data"`
  - `compute_metrics` → `"Computing metrics"`
  - `generate_narrative` / `generate_highlights` → `"Crystal is writing"`
  - `render_html` / `render_pdf` → `"Rendering"`
- Each label transition: previous label fades out (`opacity-0`, 200ms), new label fades in (`opacity-100`, 200ms)
- The leading `●` pulses: `animate-pulse` at 1s interval, `fill: currentColor`, colored per stage:
  - Assembling / Computing: `#6366F1` (indigo-500)
  - Crystal is writing: `#7C3AED` (purple, Crystal color)
  - Rendering: `#059669` (emerald-500)

**Progress total estimate:** Displayed below stage label: `"~8s remaining"` — estimated based on template type (weekly NPS: 6–8s, QBR Pack: 15–20s). This is a static estimate per template, not a real-time computation.

### Live Preview Loading Animation

When user clicks `"✦ Generate live preview with your data →"` in the builder right panel:

1. Right panel content below the mini thumbnail fades to `opacity-30`
2. An overlay appears over the thumbnail area: Crystal sparkle icon (`#7C3AED`, 24px) with a slow rotation animation (`animate-spin` at `2s` duration). Below it: `"Crystal is generating your preview..."` in `text-[12px] text-violet-500`
3. Stages cycle with the same dot animation as Run-Now (above)
4. Total expected duration: 6–10 seconds
5. On completion: the thumbnail area transitions (cross-fade, 400ms) to the live preview — a scaled-down (33%) rendering of the actual HTML artifact in an `<iframe>` at `pointer-events: none`
6. Below the live preview iframe: `"Preview generated — this is real data."` badge in `text-[11px] text-emerald-600 font-medium`

**API call:** `POST /api/reports/:reportId/run-now?preview_only=true` — runs full CrystalOS graph, returns HTML, does not deliver to recipients, does not write an artifact row.

### Countdown Badge

When the next scheduled run is within 24 hours, the automation card on `/workflows` shows a countdown badge:

- Badge position: replaces the static `"Next: {date}"` text
- Content: `"Next run in 6h 32m"` — updated every 60 seconds via `setInterval`
- Style: `text-[12px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5`
- When < 1 hour: badge transitions to `text-red-700 bg-red-50 border-red-200` + `animate-pulse` (Tailwind, 1s interval, `opacity` pulse from 1 to 0.7)
- React implementation: `useMemo` to compute time-to-run, `useEffect` with `setInterval(fn, 60_000)` to tick. Cleanup on unmount.

---

## 7. Empty and Error States

### Briefing Delivery View: Generation Failed

When `run.status === 'failed'`, the delivery view renders a failure state instead of the email container:

```
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│              [Crystal icon, gray, 40px]                               │
│                                                                       │
│              Crystal couldn't generate this briefing.                 │
│                                                                       │
│  Something went wrong while generating the briefing for this run.     │
│  The error has been logged and the team has been notified.            │
│                                                                       │
│  Error detail (for owners):                                           │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  {run.errorMessage}                                             │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                       │
│           [ Retry this run ]          [ Contact support ]             │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

- Error detail box: `font-family: monospace; font-size: 12px; bg-gray-50 border border-gray-200 rounded p-3 text-gray-600` — visible only if current user is the automation owner
- `[Retry this run]` button: `POST /api/automations/:id/runs/:runId/retry` — only enabled if `run.attemptNumber < 3`
- Right sidebar still renders with metadata and "Edit automation →" button; "Download PDF" and "Resend to me" are both disabled with tooltip `"Briefing generation failed"`

### Briefing Delivery View: Insufficient Data

When the CrystalOS graph detects fewer than 30 responses in the scoped time window, the `generate_narrative` node sets `state.error = 'INSUFFICIENT_DATA'` and the run completes with `status = 'success'` but the artifact contains a special low-data template.

The email and web view render a condensed briefing with:

- Header band: same Indigo styling
- Crystal Summary card: Crystal's note: _"There were fewer than 30 responses in this period. The data below reflects what's available, but statistical conclusions should be drawn carefully."_ — rendered with `border-left: 4px solid #D97706` (amber) instead of purple
- KPI Row: renders with a `⚠` data caveat icon below each delta pill: `"Low sample (n={count})"` in `text-[10px] text-amber-600`
- Topics and Moments That Mattered sections: hidden if response count < 15. Replaced by a single note: _"Topic analysis requires at least 15 open-text responses. This period had {count}."_
- Recommendations: Crystal provides 1–2 recommendations specifically about improving response volume, not the usual CX action bullets

**In the web delivery view:** Yellow banner at top of email container (not inside the email HTML): `"This briefing has limited data (n={responseCount}). Results may not be statistically significant."` in `text-[12px] text-amber-700 bg-amber-50 border-b border-amber-200 px-6 py-2.5`

### Briefing Delivery View: Delivery Failed (artifact exists, email bounced)

When `run.status === 'success'` but one or more delivery results have `status: 'bounced'` or `status: 'failed'`:

- The briefing renders normally (artifact was generated)
- Right sidebar shows a warning banner below the recipients row:
  ```
  ⚠  1 of 4 deliveries failed
  [View delivery details]
  ```
  Banner: `text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2`
- "Resend to me" button is always available regardless of delivery failures

### No Runs Yet (First-Load State)

When a user navigates to an automation that has `generate_briefing` as an action but no runs have been triggered:

The delivery view route (`/automations/:id/runs/:runId`) is not accessible; the router redirects to `/automations/:id` which shows the automation detail page. A centered empty state is shown in the main content area:

```
[Clock icon, 40px, gray-300]
No briefings generated yet.
This automation hasn't run. Enable it or trigger a manual run.
[ Run now ] [ Edit automation ]
```

---

## 8. Full In-App Report Destination

### Architecture: InsightReport is Primary

The CrystalOS `report_generation_graph` skill always produces an `InsightReport` document as its canonical output. Email HTML, Slack messages, and PDFs are all renderings derived from that report. There is no separate "format for trail" conversion node — the report is the output, and delivery formats are secondary.

```
Scheduled automation fires
         ↓
CrystalOS: generate_insight_report
         ↓
  InsightReport { title, summary, findings[] }  ← canonical output
         ↓                    ↓                    ↓
  render_email           render_slack          render_pdf
  (→ HTML artifact)      (→ message text)      (→ PDF file)
         ↓                    ↓
  deliver_email          deliver_slack
  (SendGrid)             (Slack API)
```

**CrystalOS output shape** (always produced, regardless of delivery channels):
```python
state.insight_report = {
    "title": f"{state.template_label} — {state.date_range_label}",
    "summary": state.narrative_text,          # Crystal's narrative paragraph
    "findings": [                              # highlights + recommendations combined
        {"headline": h["title"], "narrative": h["detail"]}
        for h in state.highlights[:8]
    ] + [
        {"headline": f"Action: {r['action']}", "narrative": r["rationale"]}
        for r in state.recommendations[:3]
    ],
    "metric_snapshot": state.metric_payload,
    "generated_by": "scheduled_briefing",
    "briefing_run_id": state.run_id,
}
```

The backend stores `state.insight_report` as an `InsightReport` row and writes a trail checkpoint. Email/Slack/PDF delivery happens independently after the report is stored.

### Insufficient Data Fallback

Before running the generation graph, the backend checks whether there are enough new responses in the scoped time window (threshold: 30 responses for weekly, 100 for monthly — configurable via `InsightSettingsPage`).

**The system never skips a scheduled run.** Every run produces a trail checkpoint, deducts credits, and delivers to recipients. The difference is what content is inside the report.

---

**Case A — Sufficient new data:**
Generate a fresh InsightReport → write new trail checkpoint → deduct credit → deliver email/Slack/PDF with full Crystal narrative.

---

**Case B — Insufficient new data, prior report exists:**
1. Load the most recent InsightReport for this survey
2. Clone it as a new InsightReport row with today's run timestamp — no banner, no indicator, no `data_note`
3. Write a new trail checkpoint stamped with today's date — indistinguishable from a freshly generated checkpoint
4. Deduct credit
5. Deliver to recipients exactly as if the report were freshly generated — same email, same content, same "View Full Report →" link pointing to the cloned report

The recipient experience is identical to a fresh report week. Cadence is maintained without surfacing data gaps to end users.

---

**Case C — No prior report exists, no data:**
Never skip. Generate a transparent "no data yet" InsightReport:
```python
state.insight_report = {
    "title": f"{state.template_label} — {state.date_range_label}",
    "summary": "No responses have been collected yet for this survey in the configured time window. Crystal will generate your first full briefing once enough responses come in.",
    "findings": [],
    "data_status": "no_data",
    "metric_snapshot": None,
}
```
- Write trail checkpoint with `tier_label: 'first_voices'` (the lowest tier badge)
- Deduct credit
- Deliver email with a full-width informational section instead of the Crystal Summary card:
  ```
  ✦ Nothing to report yet
  Crystal is watching. Once {threshold} responses arrive, your next scheduled
  briefing will include a full narrative analysis.
  Your survey has received {count} responses so far.
  ```
  Styled with Crystal purple border-left (`3px solid #7C3AED`), `background: #F5F3FF`
- Also notify the survey admin (in-app notification, not email): `"Weekly NPS Digest ran but found no data yet. The briefing was sent with a 'nothing yet' message."`

---

**Slack fallback messages:**

Case B — identical to a fresh report, no mention of reuse:
```
📊 *Weekly NPS Digest — Jun 30, 2026*
NPS: 47 ↑+12  ·  412 responses
View report: {url}
```

Case C:
```
📊 *Weekly NPS Digest — Jun 30, 2026*
_Crystal is watching — no responses yet (n=0). First briefing will generate once data arrives._
View survey: {url}
```

### Survey-Scoped: Trail Checkpoint

When scope is a single survey, the backend writes the report to the survey's Experience tab:

**Backend writes** (in `backend/src/workers/reportGenerationQueue.ts`):
1. Insert row into `insight_reports` table: `{ survey_id, document: state.insight_report, created_by: 'system' }`
2. Insert row into `insight_trail_checkpoints` table:
   ```sql
   INSERT INTO insight_trail_checkpoints (
     survey_id, lane, trigger, tier_label, report_id,
     nps, nps_delta, topic_changes, meaningful, created_at
   ) VALUES (
     $surveyId, 'automated', 'scheduled', 'full_report', $reportId,
     $currentNps, $npsDelta, $topicChanges, true, now()
   )
   ```
3. The checkpoint appears in the Automated lane of the trail with a `trigger: 'scheduled'` badge:

```
● #12  📅 Scheduled briefing           2 hours ago
       NPS  47  ▲ +12 pts
       [VIEW FULL REPORT]
```

**Checkpoint badge for `trigger: 'scheduled'`:**
- Icon: Lucide `Calendar`, 12px, `text-violet-500`
- Label: `"Scheduled briefing"` in `text-[11px] text-gray-500`
- `VIEW FULL REPORT` link: `text-[11px] font-medium text-violet-600 hover:text-violet-800`
- Tier badge: `full_report` — Crystal purple tier badge
- Scheduled checkpoints are always `meaningful: true` — never collapsed by the quiet-checkpoint rollup

**New locale keys** (`surveyInsights.trail`):
```typescript
triggerScheduled: 'Scheduled briefing',
viewFullReport: 'View full report',
```

### Experience Tab: Latest Report as Hero

When a user navigates to a survey's Experience tab (Intelligence section), the **most recent InsightReport** — whether generated manually, by threshold automation, or by a scheduled automation — appears as the hero at the top of the page, with the trail history below it. There is no distinction between "scheduled" and "manual" in terms of how prominently they surface. Whichever is newest is shown first.

**UX direction (implementation out of scope for this feature):**
```
┌────────────────────────────────────────────────────────────────┐
│  LATEST REPORT                           Jun 30, 2026  📅       │
│  Weekly NPS Digest                                              │
│                                                                 │
│  NPS 47  ▲ +12   "Customer satisfaction improved markedly..."   │
│                                                    [Open →]     │
├────────────────────────────────────────────────────────────────┤
│  HISTORY                                                        │
│  ● #12  Scheduled briefing  Jun 30  NPS 47 ▲+12  [view]        │
│  ● #11  Manual run          Jun 22  NPS 35 ▼-7   [view]        │
│  ● #10  Scheduled briefing  Jun 23  NPS 42 ▲+2   [view]        │
│  ...                                                            │
└────────────────────────────────────────────────────────────────┘
```

The scheduled report feeds into this hero naturally — no special UI treatment needed. It's just the latest report.

### Org-Scoped and Tag-Scoped: Builder Skeleton Only

Org-wide and tag-group scope are supported in the **Automation Hub builder** (the scope selector shows all three options: Specific survey / Tag group / Entire org). However, actual report generation for org/tag scope is **out of scope for this feature** — the backend generation worker only processes survey-scoped runs.

When a user configures an org/tag-scoped briefing and it fires:
- Backend detects `scope !== 'survey'`
- Run completes with `status: 'pending_feature'`
- Automation card shows a pill: `"Org-scope — coming soon"` in amber
- No report is generated, no email sent

This gives the builder the correct structure for when org/tag generation ships (likely tied to Command Center), without silently failing or blocking the survey-scoped work.

### Sidebar Addition in Delivery View (`/automations/:id/runs/:runId`)

When `output_mode === 'full_report' || output_mode === 'both'`, the right sidebar gains a new **Sidebar Section 1.5: Full Report Link** between Report Identity and Run Metadata:

```
┌─────────────────────────────────────────────────┐
│  ✦ Full Report Available                         │
│  View the full interactive report in Xperiq.    │
│                                                 │
│  [✦ Open Full Report →]                          │
└─────────────────────────────────────────────────┘
```

- Container: `rounded-lg bg-violet-50 border border-violet-200 p-3 mt-4`
- Label: `text-[12px] font-medium text-violet-700 flex items-center gap-1.5`
- Description: `text-[11px] text-violet-500 mt-0.5`
- Button: `mt-2 w-full h-[32px] rounded-lg bg-violet-600 text-white text-[12px] font-medium hover:bg-violet-700 flex items-center justify-center gap-1.5`
- Navigates to `/app/surveys/:surveyId/intelligence/reports/:reportId` (survey-scoped) or `/app/briefings/:reportId` (org/tag-scoped)

**New locale keys** (`briefings` namespace):
```typescript
outputModeLabel: 'Output',
outputModeEmailDigest: 'Email Digest',
outputModeFullReport: 'Full Report',
outputModeBoth: 'Both',
outputModeEmailDigestNote: 'Email only — no in-app report generated.',
outputModeFullReportNote: 'Generates a full in-app report. Email notifies recipients with a link.',
outputModeBothNote: 'Full in-app report + complete email digest.',
footerCtaFullReport: '✦ View Full Report in Xperiq →',
footerCtaDashboardSecondary: 'or open dashboard',
fullReportAvailable: '✦ Full Report Available',
fullReportAvailableDesc: 'View the full interactive report in Xperiq.',
openFullReportButton: '✦ Open Full Report →',
```

---

## 9. Accessibility

### Email Accessibility

- **Alt text:** Every `<img>` in the email HTML has `alt` text. Chart images have descriptive alt text summarizing what the chart shows (e.g., `"NPS trend: started at 35, peaked at 52 in week 4, ended at 47"`). Logo: `alt="Xperiq"`. Icons with adjacent text: `alt=""`.
- **Text-only version:** Every email delivery includes a `text/plain` MIME part (see Section 5). The footer includes: `"Can't read this email? View it online: {webview_url}"` linking to the briefing delivery route.
- **Link underlines:** All hyperlinks in the email HTML have `text-decoration: underline` — do not suppress underlines for email (email clients override visual styling inconsistently).
- **Table roles:** The outer layout tables set `role="presentation"` on the `<table>` element to prevent screen readers from announcing them as data tables.
- **Color contrast:** All foreground/background color pairs meet WCAG AA (4.5:1 for body text, 3:1 for large text). Specifically: body text `#1F2937` on `#FFFFFF` = 16.75:1. Section header gray `#9CA3AF` on white = 2.85:1 — this is below AA for the label text, which is intentional secondary treatment. The actual data values always meet AA contrast.
- **High-contrast mode (Windows):** MSO conditional comments ensure critical content renders in Windows High Contrast mode. Do not rely solely on background color to convey meaning (use border + color together for status chips).

### Web Delivery View Accessibility

- **Focus management:** When the delivery view page mounts, focus is set to the page `<h1>` (report name in the sidebar) via `useEffect` + `headingRef.current?.focus()`. This ensures screen readers announce the page context immediately.
- **Share link expiry notification:** When a share link is generated, an ARIA live region (`aria-live="polite"`) announces: `"Shareable link copied to clipboard. Valid for 30 days."` This ensures keyboard-only and screen-reader users receive the expiry information.
- **Interactive topics (web view):** The clickable topic chips in the web delivery view are `<button>` elements (not `<div>` or `<span>`). They have `aria-label="View insights for topic: {topicLabel} ({count} responses)"`.
- **NPS chart (web view):** The interactive Recharts component has `aria-label="NPS trend chart for {scope}, {dateRange}"` on the wrapper div. A visually hidden `<table>` adjacent to the chart provides the same data in tabular form for screen readers.
- **Email iframe (if used for inline rendering):** If the web view renders the email HTML in an `<iframe>`, the iframe has `title="Briefing email content"`. The sidebar's action buttons are outside the iframe and accessible independently.

---

## 9. Localization

All user-visible strings for briefings live under the `briefings` namespace in `app/src/locales/en.ts`, kept separate from the `workflows` namespace.

```typescript
briefings: {
  // Builder right panel
  panelTitle: '✦ Intelligence Briefing',
  panelSubtitle: 'Configure what Crystal will generate and send.',
  templateLabel: 'Template',
  toneLabel: 'Tone',
  toneFormal: 'Formal',
  toneProfessional: 'Professional',
  toneConversational: 'Conversational',
  timeRangeLabel: 'Time Range',
  timeRangeLast7: 'Last 7 days',
  timeRangeLast30: 'Last 30 days',
  timeRangeLastQuarter: 'Last quarter',
  timeRangeSinceLaunch: 'Since survey launch',
  timeRangeEventNote: 'Time range is determined automatically for event-triggered briefings.',
  scopeLabel: 'Scope',
  scopeInheritedPrefix: 'Inherited from trigger:',
  scopeOverrideClear: 'Clear override →',
  scopeOverrideApply: 'Apply scope override',
  sectionsLabel: 'Sections',
  sectionsReorderHint: 'Reorder',
  sectionFixedBadge: 'FIXED',
  recipientsLabel: 'Recipients',
  recipientsAddMe: '+ Add me',
  deliveryChannelsLabel: 'Also deliver to',
  deliveryAlwaysOn: 'In-app  ●  Always on',
  miniPreviewLabel: 'Preview',
  livePreviewCta: '✦ Generate live preview with your data →',
  livePreviewLoading: 'Crystal is generating your preview...',
  livePreviewComplete: 'Preview generated — this is real data.',

  // Email sections (rendered into HTML by Jinja2 — these keys are for the web delivery view React overlays)
  emailHeaderLabel: 'Intelligence Briefing',
  crystalSummaryLabel: "✦ Crystal's Summary",
  kpiSectionLabel: 'Key Metrics',
  kpiNpsLabel: 'NPS Score',
  kpiResponsesLabel: 'Responses',
  kpiVelocityLabel: 'Resp / Day',
  kpiCompletionLabel: 'Completion',
  whatChangedLabel: 'What Changed',
  topicsLabel: "What Customers Are Saying",
  topicsPromotersLabel: 'Promoters',
  topicsDetractorsLabel: 'Detractors',
  momentsLabel: '✦ Moments That Mattered',
  recommendationsLabel: '✦ Recommended Actions',
  // Output mode (Field 0 in builder right panel)
  outputModeLabel: 'Output',
  outputModeEmailDigest: 'Email Digest',
  outputModeFullReport: 'Full Report',
  outputModeBoth: 'Both',
  outputModeEmailDigestNote: 'Email only — no in-app report generated.',
  outputModeFullReportNote: 'Generates a full in-app report. Email notifies recipients with a link.',
  outputModeBothNote: 'Full in-app report + complete email digest.',

  // Footer CTA variants
  footerCtaLabel: 'View Full Dashboard →',
  footerCtaFullReport: '✦ View Full Report in Xperiq →',
  footerCtaDashboardSecondary: 'or open dashboard',

  // Full report sidebar section (delivery view)
  fullReportAvailable: '✦ Full Report Available',
  fullReportAvailableDesc: 'View the full interactive report in Xperiq.',
  openFullReportButton: '✦ Open Full Report →',

  // Briefings archive page
  archivePageTitle: 'Intelligence Reports',
  archivePageSubtitle: 'Full reports generated by scheduled automations across your org.',
  archiveScopeAll: 'All',
  archiveScopeSurvey: 'Survey-scoped',
  archiveScopeOrg: 'Org-wide',
  archiveScopeTag: 'Tag-group',

  // Additional (original)
  footerLegalLine: 'Unsubscribe from this report · Generated by Crystal AI · Xperiq',

  // Delivery view sidebar
  sidebarSubtitle: 'Intelligence Briefing',
  metaGeneratedLabel: 'Generated',
  metaDurationLabel: 'Generation Time',
  metaDataRangeLabel: 'Data Range',
  metaResponsesLabel: 'Responses Analyzed',
  metaRecipientsLabel: 'Recipients',
  metaOpenRateLabel: 'Open Rate',
  metaRunIdLabel: 'Run ID',
  resendToMeButton: 'Resend to me',
  editAutomationButton: 'Edit automation →',
  downloadPdfButton: 'Download PDF',
  pdfUnavailableTooltip: 'PDF not available for this run',
  shareHeading: 'Share this briefing',
  shareDescription: 'Anyone with this link can view this briefing for 30 days — no login required.',
  shareCopyButton: 'Copy shareable link',
  shareCopied: 'Link copied!',
  shareExpiry: 'Valid for 30 days from when the link is generated.',

  // Delivery warnings
  deliveryFailedBanner: '{count} of {total} deliveries failed',
  deliveryFailedViewDetails: 'View delivery details',
  insufficientDataBanner: 'This briefing has limited data (n={count}). Results may not be statistically significant.',
  lowDataCrystalNote: 'There were fewer than 30 responses in this period.',
  lowDataTopicsNote: 'Topic analysis requires at least 15 open-text responses. This period had {count}.',

  // Error states
  generationFailedHeadline: "Crystal couldn't generate this briefing.",
  generationFailedBody: 'Something went wrong while generating the briefing for this run. The error has been logged and the team has been notified.',
  retryRunButton: 'Retry this run',
  contactSupportButton: 'Contact support',
  maxRetriesReachedTooltip: 'Maximum retry attempts reached',

  // Empty state (no runs)
  noRunsHeadline: 'No briefings generated yet.',
  noRunsBody: "This automation hasn't run. Enable it or trigger a manual run.",
  runNowButton: 'Run now',

  // Progress stages
  progressAssembling: 'Assembling data',
  progressComputing: 'Computing metrics',
  progressWriting: 'Crystal is writing',
  progressRendering: 'Rendering',
  progressEstimate: '~{seconds}s remaining',

  // Countdown badge
  countdownNextRun: 'Next run in {time}',

  // Shared route
  sharedBriefingTitle: 'Shared Intelligence Briefing',
  sharedBriefingExpiry: 'This link expires on {date}.',
  sharedBriefingExpired: 'This shared link has expired. Ask the briefing owner to generate a new one.',

  // Accessibility
  npsChartAriaLabel: 'NPS trend chart for {scope}, {dateRange}',
  topicChipAriaLabel: 'View insights for topic: {topic} ({count} responses)',
  shareLinkAriaLive: 'Shareable link copied to clipboard. Valid for 30 days.',
},
```

**Namespace boundary:** Strings shared between briefings and workflows (e.g., builder chrome, enable/disable toggles) remain under `workflows`. The `briefings` namespace covers all content unique to the Intelligence Briefing action type and delivery view. If a string appears in both contexts, it belongs in `workflows`.

---

## Component Inventory (Briefings-Specific)

All briefing-specific components live in `app/src/components/workflows/briefings/` (subfolder of the existing workflows component tree):

| Component | File | Description |
|---|---|---|
| `BriefingConfigPanel` | `BriefingConfigPanel.tsx` | Right panel when briefing action is selected |
| `TemplateSelectorDropdown` | `TemplateSelectorDropdown.tsx` | Template picker with icons |
| `ToneSegmentedControl` | `ToneSegmentedControl.tsx` | Formal / Professional / Conversational |
| `SectionsListEditor` | `SectionsListEditor.tsx` | Drag-to-reorder sections with @dnd-kit |
| `BriefingMiniPreview` | `BriefingMiniPreview.tsx` | SVG skeleton thumbnail |
| `BriefingDeliveryView` | `BriefingDeliveryView.tsx` | Full delivery view page layout |
| `BriefingEmailContainer` | `BriefingEmailContainer.tsx` | 600px email container web rendering |
| `BriefingKPIRow` | `BriefingKPIRow.tsx` | KPI row with count-up animation |
| `BriefingTopicsSection` | `BriefingTopicsSection.tsx` | Topic chips (interactive in web view) |
| `BriefingNPSTrendChart` | `BriefingNPSTrendChart.tsx` | Interactive Recharts NPS chart |
| `BriefingSidebar` | `BriefingSidebar.tsx` | Right sidebar with metadata + actions |
| `BriefingShareButton` | `BriefingShareButton.tsx` | Copy-link button with clipboard logic |
| `BriefingProgressDots` | `BriefingProgressDots.tsx` | Animated stage progress indicator |
| `BriefingInsufficientDataBanner` | `BriefingInsufficientDataBanner.tsx` | Low-data warning banner |
| `BriefingErrorState` | `BriefingErrorState.tsx` | Generation-failed empty state |
| `SharedBriefingPage` | `SharedBriefingPage.tsx` | Unauthenticated shared briefing route |

---

*This document supersedes the previous scheduled-reports DESIGN.md entirely. The `/reports` route, 3-step wizard, and all associated components described in the prior version are deprecated. See `docs/workflows/DESIGN.md` for the shared Automation Hub builder specification.*
