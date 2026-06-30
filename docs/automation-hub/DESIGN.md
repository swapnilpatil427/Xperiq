# Automation Hub — UI/UX Design Specification

**Version:** 2.0
**Owner:** Rohan Desai (Principal UX) + Elias Park (Frontend Engineer)
**Status:** Design — approved for Phase 3 implementation
**Last updated:** 2026-06-29
**Supersedes:** v1.0 (Workflows-only design)

---

## Design Philosophy

### The Unified Mental Model

The old design forced a false choice: "is this a workflow or a scheduled report?" Users don't think this way. They think: *"What do I want to happen automatically?"* A CX director who says "email me every Monday with a Crystal NPS summary" is describing exactly the same mental action as one who says "alert #cx-alerts when NPS drops below 30." Both are automations. Both belong in the same place.

**Briefings are architecturally just automations:** `schedule trigger → generate_report action → deliver_email action → deliver_slack action → in_app action`. The canvas model is identical; only the card palette differs. By unifying them, we eliminate the /reports vs. /workflows split — a source of real user confusion in v1.

### Design Lineage

- **Linear**: information density without clutter; status is always legible without shouting
- **Zapier**: progressive disclosure in the builder; the most complex configs feel approachable on first pass
- **Figma**: spatial canvas thinking; the builder is a visual artifact, not a configuration form
- **Notion AI**: natural-language intent as the primary creation path; structure is generated, not typed

### Six Design Principles

1. **Unified mental model.** Users think "what do I want to happen automatically?" — Crystal figures out whether that's a workflow or a briefing. Never ask the user to choose first.
2. **Crystal NL as the primary creation path.** The command bar is always visible, always ready. Most users start there. The Visual Builder is the power-user and refinement path.
3. **Briefings are automations.** They live in the same grid, share the same builder, share the same run history. No separate /reports page, no separate nav item.
4. **Zero empty-state anxiety.** The page never feels empty. The Crystal command bar is always present, with rotating placeholder examples that make it obvious what's possible.
5. **Fault resilience visible.** Error states are clear, immediately actionable, and show retry paths directly on the card — not buried in logs.
6. **The email IS the product.** The briefing delivery view (`/app/workflows/:id/runs/:runId`) is a first-class page. It is the artifact a CX director forwards to their VP. It must be beautiful enough to feel worth forwarding.

---

## Design System Tokens

### Color Palette — Automation-Specific

These tokens extend the base Xperiq design system defined in `app/src/index.css` and `app/src/theme.css`. They use CSS custom properties consistent with the brand system pattern.

```css
/* Canvas and builder surface */
--color-canvas-bg:          #F8F9FC;      /* dot-grid canvas background */
--color-canvas-dot:         #D1D5DB;      /* dot-grid dot color */
--color-canvas-dot-size:    1.5px;        /* dot diameter */
--color-canvas-dot-spacing: 24px;         /* dot-to-dot spacing */
--color-canvas-border:      #E5E7EB;      /* panel borders */

/* Connector SVG paths */
--color-connector:          #CBD5E1;      /* default bezier connector stroke */
--color-connector-hover:    var(--color-primary);  /* highlighted connector stroke */
--color-connector-width:    2px;

/* Workflow card type — Indigo / Electric */
--color-workflow-accent:    #4F46E5;      /* card top border + badge */
--color-workflow-bg:        #EEF2FF;      /* badge background */
--color-workflow-text:      #3730A3;      /* badge text */
--color-workflow-glow:      rgba(79,70,229,0.15);  /* hover glow */

/* Briefing card type — Crystal Purple */
--color-briefing-accent:    #7C3AED;      /* card top border + badge */
--color-briefing-bg:        #F5F3FF;      /* badge background */
--color-briefing-text:      #5B21B6;      /* badge text */
--color-briefing-glow:      rgba(124,58,237,0.15); /* hover glow */

/* Crystal / AI global tokens */
--color-crystal:            #7C3AED;      /* Crystal brand purple */
--color-crystal-dim:        #6D28D9;      /* Crystal hover */
--color-crystal-container:  #EDE9FE;      /* Crystal tinted bg */
--color-crystal-border:     #A78BFA;      /* Crystal accent borders */
--color-crystal-glow:       rgba(124,58,237,0.25); /* glow for Crystal elements */

/* Canvas card accent colors (left border) */
--color-card-trigger:       #2563EB;      /* blue — all trigger cards */
--color-card-condition:     #D97706;      /* amber — condition cards */
--color-card-email:         #16A34A;      /* green — email delivery */
--color-card-slack:         #7C3AED;      /* violet — Slack delivery */
--color-card-webhook:       #0891B2;      /* cyan — webhook delivery */
--color-card-jira:          #1D4ED8;      /* blue — Jira */
--color-card-inapp:         #0D9488;      /* teal — in-app notification */
--color-card-generate:      #7C3AED;      /* Crystal purple — generate briefing */
--color-card-crystal:       #7C3AED;      /* Crystal analysis */

/* Status pills */
--color-status-active-bg:   rgba(34,197,94,0.10);
--color-status-active-text: #15803D;
--color-status-active-dot:  #22C55E;
--color-status-cooldown-bg: rgba(245,158,11,0.10);
--color-status-cooldown-text: #B45309;
--color-status-error-bg:    rgba(239,68,68,0.10);
--color-status-error-text:  #B91C1C;
--color-status-paused-bg:   rgba(107,114,128,0.10);
--color-status-paused-text: #4B5563;
```

### Canvas Dot-Grid Background

The builder canvas uses a CSS dot-grid pattern applied via `background-image`:

```css
.automation-canvas {
  background-color: var(--color-canvas-bg);
  background-image: radial-gradient(
    circle,
    var(--color-canvas-dot) var(--color-canvas-dot-size),
    transparent var(--color-canvas-dot-size)
  );
  background-size: var(--color-canvas-dot-spacing) var(--color-canvas-dot-spacing);
}
```

Dot spacing 24px, dot diameter 1.5px, bg color `#F8F9FC`. The grid appears static but the canvas area is scrollable; the background scrolls with the content (no `background-attachment: fixed`).

---

## Surface 1: Automation Hub List Page

**Route:** `/app/workflows` (no route change — existing ROUTES.WORKFLOWS)
**Viewport:** 1440px primary design target; responsive to 768px tablet and 375px mobile.
**Page title:** "Automation Hub" — set via `useSetPageTitle`.

### 1.1 Page Layout (1440px)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  [SideNav 240px]  │  [TopBar — fixed 64px]                                         │
│                   │  ┌──────────────────────────────────────────────────────────┐  │
│                   │  │  HEADER ROW                                              │  │
│                   │  │  "Automation Hub"  [subtitle]  [+ New Automation] [Templates] │
│                   │  ├──────────────────────────────────────────────────────────┤  │
│                   │  │  CRYSTAL COMMAND BAR (52px height, full-width)           │  │
│                   │  ├──────────────────────────────────────────────────────────┤  │
│                   │  │  STATS ROW (4 stat cards)                                │  │
│                   │  ├──────────────────────────────────────────────────────────┤  │
│                   │  │  TAB BAR  All(12) | Active(9) | Briefings(5) | Workflows(7) | Error(1) │
│                   │  ├──────────────────────────────────────────────────────────┤  │
│                   │  │  CARD GRID (3 columns, 24px gap)                         │  │
│                   │  │  [Workflow card] [Briefing card] [Workflow card]          │  │
│                   │  │  [Briefing card] [Workflow card] [Briefing card]          │  │
│                   │  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Header Row

```
Automation Hub                                    [ + New Automation ]  [ Templates ]
Automated workflows and intelligence briefings — all in one place.
```

- **Title:** `text-2xl font-semibold text-gray-900`, `letter-spacing: -0.01em`
- **Subtitle:** `text-sm text-gray-500 mt-0.5`, value: `t('automations.hub.subtitle')`
- **"+ New Automation" button:** `variant="default"` (solid Indigo), size `md`, left icon `add` (Material Symbols). Clicking opens a selection sheet (see §1.7).
- **"Templates" button:** `variant="outline"` size `md`, left icon `dashboard_customize`. Opens the template gallery modal (see §1.8).
- Header row padding: `pt-8 pb-4`; buttons float right via `flex items-center justify-between`.

### 1.3 Crystal NL Command Bar

The command bar is the emotional center of the page. It must feel alive and inviting, not like a utility input.

**Dimensions:** Full-width within the content area, `height: 52px`, `border-radius: 12px`.

**Visual anatomy:**
- Outer container: `border border-gray-200 rounded-xl bg-white shadow-sm`
- **Left accent:** `width: 4px`, `height: 100%`, `background: linear-gradient(to bottom, #7C3AED, #A78BFA)`, `border-radius: 12px 0 0 12px`
- **Crystal sparkle icon:** 20px, Crystal purple (`#7C3AED`), `margin-left: 16px`, `margin-right: 12px`, uses the CSS crystal sparkle `✦` glyph styled as a component
- **Input:** `flex-1`, `font-size: 15px`, `color: #374151`, `border: none`, `outline: none`, `background: transparent`, `placeholder-color: #9CA3AF`
- **Placeholder text** (rotates every 5s via CSS animation, fade crossfade 400ms):
  ```
  ✦ Tell Crystal what to automate — try "Alert #cx-alerts when NPS drops below 30"
  ✦ Tell Crystal what to automate — try "Email me a weekly NPS digest every Monday"
  ✦ Tell Crystal what to automate — try "Slack #product when a new theme is detected"
  ✦ Tell Crystal what to automate — try "Close the survey when we hit 500 responses"
  ```
  Localization keys: `automations.commandBar.placeholder[0–3]`
- **"✦ Build with Crystal" button:** `variant="ghost"` with Crystal purple text and background `#F5F3FF`, `border-radius: 8px`, `padding: 8px 16px`, `font-size: 14px font-medium`, `margin-right: 8px`. On hover: `background: #EDE9FE`.

**Interaction:** Clicking anywhere in the bar (not just the input) focuses the input and selects any text. Pressing Enter or clicking the "Build with Crystal" button navigates to the Crystal NL Builder (`/app/workflows/build?mode=crystal`), pre-seeded with the typed text as the query parameter `q=...`.

**Animation on focus:** On focus, `box-shadow` transitions from `0 1px 3px rgba(0,0,0,0.08)` to `0 0 0 2px #A78BFA, 0 4px 12px rgba(124,58,237,0.15)` over 200ms. The left accent bar glows slightly: `filter: brightness(1.15)`.

### 1.4 Stats Row

Four stat cards in a single row, equal-width, `gap: 16px`.

**Card spec (each):**
- Container: `bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center gap-4`
- Icon area: 40×40px rounded-lg with colored background. Icon: 20px Material Symbol.
- Right of icon:
  - Metric value: `text-2xl font-bold text-gray-900`
  - Label: `text-sm text-gray-500 mt-0.5`
  - Delta indicator (optional, shown if changed vs. yesterday): `text-xs font-medium rounded-full px-2 py-0.5`

| Card | Icon | Icon bg | Value source | Label (locale key) | Delta color |
|------|------|---------|--------------|---------------------|-------------|
| Active automations | `bolt` | `bg-indigo-50 text-indigo-600` | `stats.activeCount` | `automations.stats.active` | n/a |
| Runs today | `play_circle` | `bg-emerald-50 text-emerald-600` | `stats.runsToday` | `automations.stats.runsToday` | +N green / -N red |
| Briefings delivered | `mail` | `bg-violet-50 text-violet-600` | `stats.briefingsDelivered` | `automations.stats.briefings` | n/a |
| Errors | `error` | `bg-red-50 text-red-500` | `stats.errorCount` | `automations.stats.errors` | — |

Stats are fetched from `GET /api/automations/stats` on mount. Loading state: skeleton cards (`skeleton h-24 rounded-xl`). Error state: cards show `—`.

### 1.5 Tab Bar

```
All (12)  |  Active (9)  |  Briefings (5)  |  Workflows (7)  |  Error (1)
```

- Implemented with the existing shadcn `Tabs` component.
- Active tab: `border-b-2 border-indigo-600 text-indigo-600 font-medium`
- Inactive tab: `text-gray-500 hover:text-gray-700`
- Count badges: inline, `text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 ml-1`. Error count badge: `bg-red-100 text-red-600`.
- Tab change triggers a filter on the in-memory card list; no full page reload.
- Tab state persists in URL search params: `?tab=briefings` — so linking a tab works and back/forward navigation behaves correctly.

### 1.6 Card Grid

3 columns on desktop (≥1280px), 2 on tablet (768–1279px), 1 on mobile (<768px). `gap: 24px`. Cards animate in with the standard stagger pattern:

```tsx
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const rise = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
```

#### Workflow Card Anatomy

```
┌─────────────────────────────────────────────────────────────────┐
│ [4px INDIGO top border]                                         │
│                                                                 │
│  [⚡ WORKFLOW badge]                    [● Active]              │  ← row 1
│                                                                 │
│  NPS Drop Alert                                                 │  ← name (18px semibold)
│                                                                 │
│  When NPS drops below 30 on CSAT Q3                            │  ← trigger summary (14px muted)
│  → [📧] [Slack] [Jira]                                         │  ← action icons
│                                                                 │
│  ✓ 100% success · 14 runs          Last fired: 2 hours ago     │  ← footer stats (12px)
│  ─────────────────────────────────────────────────────────────  │
│  [Survey: CSAT Q3 2026]                                         │  ← scope tag
└─────────────────────────────────────────────────────────────────┘
```

**Container:** `bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer`
**Top accent:** `height: 4px; background: var(--color-workflow-accent); width: 100%` — an absolutely-positioned div at top of card.
**Padding:** `px-4 pt-5 pb-4`
**Type badge:** `⚡ WORKFLOW` — `text-xs font-bold tracking-wider uppercase`, `background: var(--color-workflow-bg)`, `color: var(--color-workflow-text)`, `rounded-full px-2 py-0.5`
**Name:** `text-lg font-semibold text-gray-900 mt-2 leading-tight`
**Trigger summary:** `text-sm text-gray-500 mt-1.5 truncate`
**Action icons row:** `flex items-center gap-1.5 mt-2`
  - Each icon: 20×20px colored icon + integration logo, max 4 shown
  - If more: `+N` badge `text-xs text-gray-400 bg-gray-100 rounded-full px-1.5`
**Footer stats:** `text-xs text-gray-400 mt-3` — format: `{healthIcon} {healthText} · {runCount} runs` + right-aligned `Last fired: {relativeTime}`. Health state logic:
  - `✓ 100% success` — all runs succeeded in last 7 days (`text-green-600`)
  - `⚠ {N} error{s} last 7 days` — partial failures (`text-amber-600`)
  - `✕ Last run failed` — most recent run failed (`text-red-600`)
  - No runs yet: footer shows `No runs yet`
**Scope tag:** `text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 inline-flex items-center mt-3`

#### Briefing Card Anatomy

```
┌─────────────────────────────────────────────────────────────────┐
│ [4px CRYSTAL PURPLE top border]                                 │
│                                                                 │
│  [✦ BRIEFING badge]                    [● Active]              │  ← row 1
│                                                                 │
│  Weekly NPS Digest                                              │  ← name (18px semibold)
│                                                                 │
│  Every Monday at 9:00 AM PT                                    │  ← schedule summary (14px muted)
│  → [📧 4] [Slack]                                              │  ← delivery icons
│                                                                 │
│  Last delivered: 2 days ago · Next: Mon Jun 30                  │  ← footer stats (12px)
│  ─────────────────────────────────────────────────────────────  │
│  [Org-wide]                                                     │  ← scope tag
└─────────────────────────────────────────────────────────────────┘
```

**Identical structure to Workflow card** with these differences:
- **Top accent:** `background: var(--color-briefing-accent)` (Crystal purple `#7C3AED`)
- **Type badge:** `✦ BRIEFING`, `background: var(--color-briefing-bg)`, `color: var(--color-briefing-text)`
- **Second line:** Shows schedule description instead of trigger
- **Footer:** Shows "Last delivered" and "Next: [date]" instead of "Last fired"

#### Card Hover State

Both card types share the same hover behavior:
```css
.automation-card:hover {
  box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
  transform: translateY(-1px);
  transition: all 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

On hover, a quick-actions bar slides up from the card bottom (Framer Motion `y: 0` from `y: 100%`, `duration: 180ms`):
```
[ Enable / Disable ]  [ Edit ]  [ View Runs ]  [ Duplicate ]  [ ··· ]
```

The bar has `background: white`, `border-top: 1px solid #E5E7EB`, `padding: 8px 16px`.

#### Card Execution Success Pulse (Workflow only)

When a `automation_fired` SSE event arrives for a workflow card:
```css
@keyframes automationSuccessPulse {
  0%   { box-shadow: 0 0 0 0 rgba(79,70,229,0.5); }
  50%  { box-shadow: 0 0 0 14px rgba(79,70,229,0); }
  100% { box-shadow: 0 0 0 0 rgba(79,70,229,0); }
}
```
Duration: 500ms. Applied once via a React `useEffect` that adds/removes a class.

#### Card Delivery Arrival Pulse (Briefing only)

When `briefing_delivered` SSE event arrives:
```css
@keyframes briefingArrivalPulse {
  0%   { box-shadow: 0 0 0 0 rgba(124,58,237,0.5); }
  50%  { box-shadow: 0 0 0 14px rgba(124,58,237,0); }
  100% { box-shadow: 0 0 0 0 rgba(124,58,237,0); }
}
```

#### Dormant State

Automations with no activity in 30+ days: card opacity `0.72`, grayscale filter `saturate(0.6)`, `DORMANT` badge `text-[10px] font-bold tracking-widest text-gray-400 uppercase` in the bottom-left corner of the card above the scope tag.

#### Error State Card

Cards with `status = 'error'` show:
- Red top accent border
- `✕ ERROR` status pill (red bg/text)
- An inline error row below the action icons: `text-xs text-red-600 mt-1.5 flex items-center gap-1` — "Step 2 failed: Jira timeout"
- Hover quick-action bar includes: `[ Retry ]` as the first action (red text)

### 1.7 "+ New Automation" Selection Sheet

Clicking `+ New Automation` opens a bottom sheet (mobile) or a centered modal (desktop, `max-width: 480px`).

```
┌────────────────────────────────────────────────────┐
│  What would you like to automate?              [×] │
│  ────────────────────────────────────────────────  │
│                                                    │
│  ┌──────────────────────┐  ┌──────────────────────┐│
│  │  ⚡                   │  │  ✦                    ││
│  │  Reactive Workflow   │  │  Intelligence Briefing││
│  │                      │  │                       ││
│  │  Trigger-based: fire │  │  Scheduled: Crystal   ││
│  │  when something      │  │  writes and delivers  ││
│  │  happens in your     │  │  a report on a        ││
│  │  data.               │  │  schedule.            ││
│  │                      │  │                       ││
│  │  [ Start building ]  │  │  [ Start building ]   ││
│  └──────────────────────┘  └──────────────────────┘│
│                                                    │
│  ── or describe it and let Crystal decide ─────── │
│                                                    │
│  [ Crystal command bar — same as hub bar ]         │
│                                                    │
└────────────────────────────────────────────────────┘
```

- "Reactive Workflow" navigates to `/app/workflows/build?type=workflow`
- "Intelligence Briefing" navigates to `/app/workflows/build?type=briefing`
- Crystal command bar in the sheet works identically to the hub bar

### 1.8 Template Gallery Modal

Full-screen modal overlay (Framer Motion `opacity: 0→1, scale: 0.98→1, 250ms`).

```
┌──────────────────────────────────────────────────────────────────────┐
│  Automation Templates                                           [×]  │
│  ────────────────────────────────────────────────────────────────    │
│  [ 🔍 Search templates...                                       ]    │
│                                                                      │
│  [ All ] [ Alert & Notify ] [ Close the Loop ] [ Briefings ]         │
│          [ Lifecycle ] [ Escalation ] [ ⭐ Featured ]                 │
│                                                                      │
│  ── ⭐ FEATURED ──────────────────────────────────────────────────   │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  ✦ BRIEFING      │  │  ⚡ WORKFLOW      │  │  ⚡ WORKFLOW      │   │
│  │  ⭐ Featured      │  │  ⭐ Featured      │  │  ⭐ Featured      │   │
│  │                  │  │                  │  │                  │   │
│  │  Timely          │  │  NPS Drop Alert  │  │  Detractor       │   │
│  │                  │  │                  │  │  Instant Ticket  │   │
│  │  Crystal writes  │  │  Fires when NPS  │  │  Every detractor │   │
│  │  your weekly CX  │  │  drops below     │  │  response opens  │   │
│  │  brief every     │  │  your threshold. │  │  a Zendesk       │   │
│  │  Monday.         │  │  Alerts Slack    │  │  ticket.         │   │
│  │                  │  │  immediately.    │  │                  │   │
│  │  940+ orgs ★4.9  │  │  1,200+ ★4.9    │  │  680+ orgs ★4.8  │   │
│  │  [Use this →]    │  │  [Use this →]    │  │  [Use this →]    │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
│                                                                      │
│  ── BRIEFINGS ────────────────────────────────────────────────────   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Timely  │ │Executive │ │  QBR     │ │ Closeout │ │  Churn   │  │
│  │  ★4.9    │ │ Monthly  │ │  Pack    │ │  Brief   │ │  Watch   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Onboarding│ │ Release  │ │  Theme   │ │ Cross-   │ │Detractor │  │
│  │  Pulse   │ │ Debrief  │ │ Tracker  │ │ Survey   │ │  Brief   │  │
│  │          │ │          │ │          │ │ Digest🔒 │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**`🔒` = tier-gated (Growth+ or Enterprise+).** Locked templates show a tooltip on hover: `"Requires Growth plan — upgrade to unlock"`. They are always visible (not hidden) — seeing them drives upgrade intent.

---

#### Template Card Anatomy

```
┌──────────────────────────────────────────┐
│  ⭐ FEATURED       [✦ BRIEFING]  [Growth] │  ← row 1: badges
│                                          │
│  Timely                                  │  ← name (16px semibold)
│                                          │
│  Crystal writes your weekly CX brief     │  ← description (13px muted)
│  every Monday — NPS, themes, what        │
│  changed, and recommended actions.       │
│                                          │
│  Trigger:  📅 Schedule (weekly)          │  ← trigger summary
│  Actions:  ✦ Generate · 📧 Email · 🔔   │  ← action icons
│                                          │
│  940+ orgs installed   ★★★★★  4.9       │  ← social proof
│                                          │
│  [Use this template →]                   │  ← CTA
└──────────────────────────────────────────┘
```

- **`⭐ FEATURED` badge:** `bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full`
- **Type badge:** `⚡ WORKFLOW` or `✦ BRIEFING` (same style as hub cards)
- **Tier badge:** `[Starter]` `[Growth]` `[Enterprise]` — `text-[10px] font-medium rounded-full px-1.5 py-0.5`. Starter = gray, Growth = indigo, Enterprise = purple. Only shown for Growth+ tiers.
- **Rating stars:** `text-amber-400 text-[11px]`; count: `text-[11px] text-gray-400`
- **CTA button:** `w-full h-[34px] rounded-lg bg-indigo-600 text-white text-[13px] font-medium hover:bg-indigo-700`. If tier-gated: `bg-gray-100 text-gray-400 cursor-not-allowed` + lock icon.

---

#### Full Template Catalog — 25 templates

**BRIEFINGS (Intelligence Briefings) — 10 templates**

| ID | Name | Schedule / Trigger | Audience | Tier | Featured |
|----|----|----|----|----|----|
| `timely` | **Timely** | Weekly, Mon 9AM | Team | Starter | ⭐ |
| `executive_monthly` | Executive Monthly | Monthly, 1st | Executive | Starter | |
| `qbr_pack` | QBR Pack | Quarterly, Jan/Apr/Jul/Oct | Executive | Growth | |
| `survey_closeout` | Survey Closeout Brief | On survey close | Team | Starter | |
| `churn_watch` | Churn Watch | Weekly, Mon | Analyst | Growth | |
| `onboarding_pulse` | Onboarding Pulse | Weekly, Mon | Team | Growth | |
| `release_debrief` | Release Debrief | 7 days post-launch | Team | Growth | |
| `theme_tracker` | Theme Tracker | Weekly, Mon | Team | Starter | |
| `cross_survey_digest` | Cross-Survey Digest | Monthly, 1st | Executive | Enterprise | |
| `detractor_brief` | Detractor Brief | Daily (when detractors exist) | Team | Growth | |

**ALERT & NOTIFY — 5 templates**

| ID | Name | Trigger | Actions | Tier | Featured |
|----|----|----|----|----|---|
| `nps_drop_alert` | **NPS Drop Alert** | `nps_threshold` | Slack + email | Starter | ⭐ |
| `sentiment_spike` | Sentiment Spike | `sentiment_spike` | Slack + Jira | Growth | |
| `new_theme_alert` | New Theme Emerged | `new_theme_detected` | Slack + Crystal analysis | Growth | |
| `anomaly_alert` | Statistical Anomaly | `anomaly_detected` | Slack + Zendesk | Growth | |
| `response_rate_drop` | Response Rate Drop | `response_rate_drop` | Email to owner | Starter | |

**CLOSE THE LOOP — 3 templates**

| ID | Name | Trigger | Actions | Tier | Featured |
|----|----|----|----|----|---|
| `detractor_ticket` | **Detractor Instant Ticket** | `response_submitted` (NPS 0–6) | Zendesk ticket | Growth | ⭐ |
| `promoter_thankyou` | Promoter Thank-You | `response_submitted` (NPS 9–10) | Send email | Starter | |
| `passive_nurture` | Passive Nurture | `response_submitted` (NPS 7–8) | Email + Crystal analysis | Growth | |

**SURVEY LIFECYCLE — 5 templates**

| ID | Name | Trigger | Actions | Tier |
|----|----|----|----|---|
| `survey_launched` | Survey Launched → Notify | `survey_lifecycle: published` | Slack + email | Starter |
| `goal_close` | Goal Reached → Close | `response_count >= N` | `close_survey` | Starter |
| `goal_alert` | Goal Reached → Alert | `response_count >= N` | Slack | Starter |
| `survey_autoclose` | Survey Auto-Close | `schedule` | `close_survey` | Starter |
| `low_response_warning` | Low Response Warning | `response_rate_drop` | Email to admin | Starter |

**ESCALATION CHAINS — 2 templates**

| ID | Name | Trigger | Actions | Tier | Featured |
|----|----|----|----|----|---|
| `full_cx_escalation` | Full CX Escalation | `nps_threshold` + `sentiment_spike` | Slack + Jira + Zendesk + Crystal | Enterprise | |
| `exec_alert` | Exec Alert | `nps_threshold` (critical) | Slack exec channel + email to VP | Growth | |

---

#### Install Count Display Rules

Show exact count for 0–9 installs (e.g., "3 orgs"). Show rounded threshold for 10+ (e.g., "10+ orgs", "50+ orgs", "100+ orgs", "500+ orgs"). Do NOT show "0 orgs" — omit the count entirely for new templates with zero installs. The "Featured" row in the gallery is curated by the Xperiq team (not algorithmic); featured templates are seeded at launch from internal usage and design-partner beta installs. No placeholder counts are pre-populated — launch counts reflect real installs only.

<!-- ENT-016 applied -->

#### Template Search & Filter

**Search** (`GET /api/automations/templates?q=&category=&tier=`) — full-text search across `name`, `description`, `tags`. Returns ranked results; exact name match ranks first.

**Category filter tabs** — driven by `TemplateDefinition.category` field (see Template Authoring section below). Adding a new template to a new category automatically creates a new tab with no frontend code change.

**"Use this template" flow:**
1. User clicks `[Use this template →]`
2. If tier-gated: show upgrade modal instead
3. If available: open the builder pre-populated from the template spec
   - Trigger card and all action cards drop in with the stagger animation
   - Crystal annotation card appears: `"✦ This automation was built from the [Template Name] template. Review each card and customize for your survey."`
   - Right panel auto-opens to the first card that needs user input (e.g., Slack channel, recipient email)
4. Template `installed_count` incremented (via `POST /api/automations/templates/:id/install`)
5. User is in the builder — they can modify, test, and enable

### 1.9 Empty State

Shown when the active tab has zero results.

```
        ┌────────────────────────────────────────────────────────┐
        │                                                        │
        │    [CSS Crystal orb animation — 80px diameter]         │
        │                                                        │
        │    Your data shouldn't just sit there.                 │  (text-xl font-semibold)
        │                                                        │
        │    Tell Crystal what you want to automate:             │  (text-sm text-gray-500)
        │                                                        │
        │    [ Crystal command bar — same as hub bar ]           │
        │                                                        │
        │    — or browse templates ↓                             │
        │                                                        │
        └────────────────────────────────────────────────────────┘

        [4 featured template cards below — most popular templates]
```

The command bar in the empty state is identical in behavior to the hub bar. The "browse templates" link triggers the same template gallery modal as the header button. The empty state does NOT show the stats row or tab bar — those only appear when automations exist.

---

## Surface 2: Unified Builder

**Route:** `/app/workflows/build` (existing ROUTES.WORKFLOW_BUILD)
**URL params:** `?type=workflow|briefing` (pre-selects the type selector), `?mode=crystal|visual`, `?q=<nl-text>` (pre-seeds the Crystal NL input), `?template=<templateId>` (pre-populates from a template)
**Viewport:** 1440px, 3-panel fixed layout. Builder mode suppresses AppShell gutters (existing builder-mode behavior).

### 2.1 Builder Header

```
← Back to Hub │ [Automation Name — click to edit] │ [✦ Crystal Builder] [⊞ Visual Builder] │ [▷ Test Run] [Save] [Enable →]
```

**Full-width fixed header, height: 56px, border-bottom: 1px solid #E5E7EB, bg: white.**

- **Back button:** `← Back` ghost icon-button; navigates to `/app/workflows` (no confirm dialog unless unsaved changes)
- **Automation name:** Inline editable `<input>` styled as `text-lg font-semibold text-gray-900 border-none outline-none bg-transparent`. Placeholder: "New Automation". Clicking focuses it. Blurring or pressing Enter saves the name.
- **Mode selector tabs:** Two tabs using the segmented-control pattern:
  - `[✦ Crystal Builder]` — Crystal purple icon + text; active: `bg-violet-50 text-violet-700 ring-1 ring-violet-300`
  - `[⊞ Visual Builder]` — grid icon + text; active: `bg-indigo-50 text-indigo-700 ring-1 ring-indigo-300`
  - Container: `bg-gray-100 rounded-lg p-0.5 flex gap-0.5`; each tab: `px-4 py-1.5 rounded-md text-sm font-medium transition-all 200ms`
- **"▷ Test Run" button:** `variant="outline"` size `sm`, icon `play_arrow`. Opens the Test Mode panel (see Surface 6).
- **"Save" button:** `variant="outline"` size `sm`, saves current state to backend (`PUT /api/automations/:id` or `POST /api/automations` for new). Shows `✓ Saved` state for 2s.
- **"Enable →" button:** `variant="default"` size `sm` (Indigo). Saves AND sets `enabled = true`. Label changes to "Disable" if currently enabled. On click: 200ms optimistic toggle, toast on success.

**Unsaved changes indicator:** If the canvas has been modified since last save, a `●` dot appears next to the Save button (amber, 6px diameter).

### 2.2 Left Panel (256px fixed)

The left panel is fixed-width, full-height below the header, `border-right: 1px solid #E5E7EB`, `bg-white`, `overflow-y: auto`.

#### Automation Type Selector (top of left panel)

```
AUTOMATION TYPE
─────────────────────────────────────
[●] ⚡ Reactive Workflow
    Fires when something happens in your data

[ ] ✦ Intelligence Briefing
    Crystal writes + delivers on a schedule
─────────────────────────────────────
```

- Two radio-style cards, `padding: 12px`, `border-radius: 8px`, `cursor: pointer`
- Selected: `bg-indigo-50 border border-indigo-200` (workflow) or `bg-violet-50 border border-violet-200` (briefing)
- Unselected: `border border-gray-200 hover:border-gray-300 hover:bg-gray-50`
- Icon: 18px, colored by type
- Label: `text-sm font-medium text-gray-900`
- Description: `text-xs text-gray-500 mt-0.5`
- **Switching type when canvas has cards:** Shows an inline warning: "Switching type will clear the canvas. Continue?" with [Cancel] and [Switch] buttons.

#### Scope Block

```
SCOPE
─────────────────────────────────────
[●] Org-wide
[ ] Specific survey
[ ] Tag group
─────────────────────────────────────
```

Three radio options. "Specific survey" and "Tag group" show a combobox picker below when selected. Scope is displayed on canvas cards but configured here, not per-card.

#### "Add to Canvas" Palette

This is the drag-source for building the automation. Items are listed by category; dragging an item onto the canvas creates a new card at the drop position. Clicking an item (on mobile) appends it at the bottom of the canvas.

**For Reactive Workflow type:**
```
TRIGGERS
  ⌚  Schedule
  📊  NPS Threshold
  📈  Response Count
  📉  Response Rate Drop
  💬  Sentiment Spike
  ✦   AI Theme Detected
  ✦   Statistical Anomaly
  🔄  Survey Lifecycle
  📥  Response Submitted
  👆  Manual

CONDITIONS
  🔀  Survey Field
  📊  Response Data
  ⏱   Time Window
  🏷   Tag Match

ACTIONS
  📧  Send Email
  💬  Slack Message
  🔗  Webhook
  🎫  Jira Ticket
  🔔  In-App Notify
  ✕   Close Survey
  ⏸   Pause Survey
  ✦   Crystal Analysis
```

**For Intelligence Briefing type:**
```
TRIGGERS
  ⌚  Schedule (required, always first)
  🔄  Survey Lifecycle

CONDITIONS
  📊  Response Threshold
  🏷   Tag Match

ACTIONS
  ✦   Generate Briefing  ← Crystal purple accent
  📧  Deliver via Email
  💬  Deliver via Slack
  🔗  Deliver via Webhook
  🔔  In-App Notification  ← always-on, grayed out (cannot be removed)
```

Palette items have `cursor: grab`. On drag start: item lifts (scale 1.05, shadow), cursor changes to `grabbing`. The canvas shows drop-zone highlights between existing cards.

### 2.3 Center Canvas

The canvas is the main viewport, `flex: 1`, `overflow-y: auto`, with the dot-grid background.

Cards are laid out in a vertical stack, centered horizontally (`max-width: 480px`, `margin: 0 auto`), with `32px` gap between cards (occupied by the bezier connector). First card starts at `padding-top: 32px`. Bottom padding: `120px` (for the "Add" button and Live Preview strip).

#### Canvas Card Spec (all types)

All canvas cards share these base styles:
- Container: `bg-white rounded-xl shadow-sm border border-gray-200 width: 100%`
- **Colored left accent:** `width: 4px height: 100% border-radius: 8px 0 0 8px` — color varies by card type (see design tokens)
- Inner padding: `py-4 pr-4 pl-5` (5px gap from left accent)
- Selected state: `ring-2 ring-offset-2` colored by card type + `shadow-md`
- Drag handle: `⠿` (6-dot grip), `color: #9CA3AF`, `width: 16px`, shows on hover via `opacity: 0→1` transition
- `[×]` delete button: absolute top-right, `width: 28px height: 28px`, shows on hover, hidden for required cards (schedule trigger on briefings, in-app action on briefings)

**Card type tag:** `text-[10px] font-bold tracking-wider uppercase` at top of card content area. Color matches left accent.

**Card title:** `text-base font-semibold text-gray-900 mt-0.5`

**Card summary:** `text-sm text-gray-500 mt-1 leading-relaxed`

#### SCHEDULE TRIGGER Card

Left accent: `#2563EB` (blue)
Type tag: `SCHEDULE TRIGGER`
Title: e.g. "Every Monday at 9:00 AM PT"
Summary: "Next run: Mon Jun 30, 2026 · 3 days from now"

#### RESPONSE TRIGGER Card

Left accent: `#2563EB`
Type tag: `[TRIGGER TYPE]` (e.g. `NPS THRESHOLD`)
Title: e.g. "NPS drops below 30"
Summary: "24-hour rolling window · 5pt hysteresis buffer"
AI badge: If AI-type trigger (theme, anomaly, sentiment): `✦ Crystal Signal` chip — `text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5` — appears top-right of card.

#### CONDITION Card

Left accent: `#D97706` (amber)
Type tag: `CONDITION`
Title: e.g. "Response count > 100"
Summary: "And must be true for action to fire"
Smaller card: `min-height: 72px`

Between conditions: text separator `AND` — `text-xs font-bold text-gray-400 uppercase tracking-widest text-center py-1`

#### GENERATE BRIEFING Action Card

Left accent: `#7C3AED` (Crystal purple)
Type tag: `GENERATE BRIEFING`
Title: e.g. "Weekly NPS Digest"
Summary: "Template: Weekly NPS · Tone: Professional · Range: Last 7 days"
Extra context line: `text-xs text-violet-600 mt-1.5` — "7 sections · Crystal writes the narrative"

#### DELIVER: EMAIL Action Card

Left accent: `#16A34A` (green)
Type tag: `DELIVER VIA EMAIL`
Title: "Email to 4 recipients"
Summary: e.g. "spatil@qualtrics.com + 3 more"

#### DELIVER: SLACK Action Card

Left accent: `#7C3AED`
Type tag: `DELIVER VIA SLACK`
Title: "#cx-alerts"
Summary: "Compact summary with link to full briefing"

#### IN-APP Action Card (always-on, briefings)

Left accent: `#0D9488` (teal)
Type tag: `IN-APP NOTIFICATION`
Title: "Notification Center"
Summary: "Always delivered · Cannot be disabled"
Card opacity: `0.75`; no drag handle; no delete button. Visual indicator: lock icon `lock` (16px, gray) at top-right.

#### CRYSTAL ANALYSIS Action Card

Left accent: `#7C3AED`
Type tag: `CRYSTAL ANALYSIS`
Title: e.g. "Theme Extraction"
Summary: "Runs after trigger fires · Results in Crystal panel"

#### "+ Add Action or Condition" Button

Appears at the bottom of the card chain, above the Live Preview strip.

```css
.add-automation-btn {
  border: 2px dashed #D1D5DB;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  color: #6B7280;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  width: 100%;
  background: rgba(255,255,255,0.8);
  transition: all 150ms;
}
.add-automation-btn:hover {
  border-color: #9CA3AF;
  background: white;
  color: #374151;
}
```

Clicking opens a compact menu anchored to the button:
```
Add Condition ▸
Add Action    ▸
```

Each sub-menu lists the palette items.

#### Bezier Connector SVG Spec

SVG connectors are drawn between adjacent cards. Each connector is a `<path>` element in a dedicated SVG overlay layer (`position: absolute, inset: 0, pointer-events: none, overflow: visible`).

**Path calculation:**
```javascript
// source: bottom-center of card above
// target: top-center of card below
// curvature: 0.5 of the vertical gap
function bezierPath(sx, sy, tx, ty) {
  const cp1y = sy + (ty - sy) * 0.5;
  const cp2y = ty - (ty - sy) * 0.5;
  return `M ${sx} ${sy} C ${sx} ${cp1y}, ${tx} ${cp2y}, ${tx} ${ty}`;
}
```

**Styles:**
```javascript
// Default
stroke: 'var(--color-connector)'  // #CBD5E1
strokeWidth: 2
fill: 'none'
strokeLinecap: 'round'

// When parent or child card is selected/hovered
stroke: 'var(--color-connector-hover)'
strokeWidth: 2.5
```

**Draw animation on card appearance:**
```jsx
<motion.path
  d={path}
  initial={{ pathLength: 0, opacity: 0 }}
  animate={{ pathLength: 1, opacity: 1 }}
  transition={{ duration: 0.35, ease: 'easeInOut' }}
/>
```

**Arrowhead:** A small equilateral triangle at the end of each connector:
```svg
<marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
  <path d="M 0 2 L 4 4 L 0 6 Z" fill="var(--color-connector)" />
</marker>
```

### 2.4 Right Panel (320px fixed)

The right panel shows the configuration form for the currently-selected canvas card. When no card is selected, it shows contextual help.

**No-selection state:**
```
Select a card to configure it.

Canvas tips:
• Drag cards to reorder actions
• Click any card to edit its config
• Use ✦ Crystal Builder for AI-assisted setup
```

**Panel header (always present):**
- Card type tag (color matches left accent)
- Card title (editable inline input if applicable)
- Section label: "Configuration"

Each config panel uses shadcn form components. All changes are immediately reflected in the card's summary line via two-way binding.

#### Schedule Trigger Config Panel

**Design principle:** Cron is an implementation detail. Users express intent (when, how often, at what time). The system converts to cron internally. The cron string is never displayed unless explicitly requested via a deep developer toggle.

**shadcn components:** `ToggleGroup` + `ToggleGroupItem` (frequency, days, AM/PM), `Select` (hour, minute, month ordinal, weekday name, interval unit, timezone), `RadioGroup` (monthly type), `Input` type=number (interval count), `Collapsible` (developer mode), `Badge` (preview).

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCHEDULE TRIGGER                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  How often?                                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  [ Daily ]  [ Weekly ]  [ Monthly ]  [ Custom interval ]     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  (ToggleGroup, single-select, default: Daily)                        │
│                                                                     │
│  ── WEEKLY VARIANT ───────────────────────────────────────────────  │
│  On which days?                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  [Mon]  [Tue]  [Wed]  [Thu]  [Fri]  [Sat]  [Sun]            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  (ToggleGroup multiple, min 1 required)                              │
│                                                                     │
│  ── MONTHLY VARIANT ──────────────────────────────────────────────  │
│  On                                                                 │
│  ○  The  [ 1st ▾ ]  day of the month                               │
│     (Select: 1st–28th — values ≥ 29 show skip warning below)        │
│     ⚠ Months with fewer than 29 days will be skipped.               │
│  ○  The  [ First ▾ ]  [ Monday ▾ ]  of the month                   │
│     (Select: First/Second/Third/Fourth/Last × Monday–Sunday)         │
│  ○  The last day of the month                                       │
│  (RadioGroup, default: 1st day)                                     │
│                                                                     │
│  ── CUSTOM INTERVAL VARIANT ──────────────────────────────────────  │
│  Every                                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  [ 2     ]  [ Weeks ▾ ]                                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  (Input type=number min=1 max=365 + Select: Hours/Days/Weeks/Months) │
│  Starting from next  [ Monday ▾ ]                                   │
│                                                                     │
│  ── ALL VARIANTS ─────────────────────────────────────────────────  │
│  At what time?                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  [ 09 ▾ ] : [ 00 ▾ ]  [ AM ▾ ]                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  (Select 1–12 × Select 00/15/30/45 × ToggleGroup AM/PM)             │
│  [ ↕ Pick exact minute ]  ← ghost link reveals full 00–59 Select    │
│                                                                     │
│  Time zone                                                          │
│  [ America / Los_Angeles  —  Pacific Time (UTC−7)  ▾ ]             │
│  (Command inside Popover — searchable IANA timezone list)           │
│  ○ Use my browser's timezone  ○ Choose a timezone                  │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  📅 Runs every Monday at 9:00 AM Pacific Time                       │
│     Next run: Mon, Jun 30 · 3 days from now                         │
│  (Updates in real-time on every field change. Primary feedback       │
│   mechanism — replaces cron display entirely.)                       │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  ⚙ Developer mode (cron expression)             [ show ▾ ]          │
│                                                                     │
│  ── DEVELOPER MODE (Collapsible, closed by default) ──────────────  │
│  Cron expression    [ 0 9 * * 1                                   ] │
│  Validates as: "every Monday at 9:00 AM"                            │
│  ⚠ Changing this field overrides the visual picker above.           │
│  (If cron is not representable in the picker, preview shows:         │
│   "Custom expression (not representable in picker)")                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Preview line computation:**
```tsx
const humanDescription = useMemo(() =>
  buildScheduleDescription(frequency, days, monthlyConfig, customInterval, time, timezone),
  [frequency, days, monthlyConfig, customInterval, time, timezone]
);
// output examples:
// "every Monday and Wednesday at 9:00 AM Pacific Time"
// "the first Monday of each month at 6:00 AM UTC"
// "every 3 months starting January at 6:00 AM Eastern Time"

const nextRun = useMemo(() => {
  const cron = buildCronFromConfig({ frequency, days, monthlyConfig, customInterval, time });
  return getNextRunFromCron(cron, timezone); // returns Date
}, [frequency, days, monthlyConfig, customInterval, time, timezone]);
```

**Cron is computed internally** — `buildCronFromConfig()` is a pure function that maps the picker state to a cron string. It is never displayed to the user by default. The developer mode toggle reveals it as an escape hatch only.

#### NPS Threshold Trigger Config Panel

```
Survey
  [ CSAT Q3 2026 ▾ ]  (or uses scope if org-wide)

Threshold
  [  30  ↑↓ ]

Direction
  [ Below ▾ ]   (Below / Above / Crosses)

Rolling window
  [ 24h  ▾ ]   (1h / 6h / 12h / 24h / 48h / 7d)

ⓘ Hysteresis buffer: +5 pts
   Workflow won't re-fire until NPS recovers
   by 5 points past the threshold.
```

#### Generate Briefing Config Panel

This is the most detailed config panel in the builder. See **Gap Fix 4 (Audience Selector)** for the full updated spec — the `Tone` field is replaced by `Audience`.

```
Template
  [ Weekly NPS Digest ▾ ]

Audience
  [ Executive ]  [ Team ✓ ]  [ Analyst ]   (card selector — see Fix 4)

Time range
  [ Last 7 days ▾ ]

Scope override
  [ Use automation scope (Org-wide) ▾ ]

─────────────────────────────────────
Sections  (drag to reorder)
─────────────────────────────────────
⠿  [✓] Crystal Summary     required
⠿  [✓] KPI Row
⠿  [✓] What Changed
⠿  [✓] Top Themes
⠿  [✓] Moments That Mattered
⠿  [✓] Recommendations     required
⠿  [ ] Response Velocity Chart
─────────────────────────────────────

Email preview (mini)
┌─────────────────────────────────┐
│ [Indigo header band]            │
│ Crystal Summary —               │
│ "Your NPS rose..."              │
│ [KPI row — 4 numbers]           │
│ ...                             │
└─────────────────────────────────┘
[ ✦ Generate live preview ]
```

- **Template selector:** Combobox showing the 6 built-in templates + any custom ones. Changing template resets sections list.
- **Audience selector** — see Fix 4 (AudienceSelector) for the full spec. The audience field replaces the deprecated Tone field.
- **Time range:** Select with presets + "Custom range" (shows date range picker).

<!-- ENT-029 applied -->
- **Sections list:** Draggable with `@dnd-kit/core`. `DndContext` + `SortableContext`. Each section has a drag handle, toggle switch, and label. Required sections (`Crystal Summary`, `Recommendations`) have their toggle disabled and show a lock icon. Section reorder is persisted in the automation config.
- **Mini email preview:** 320px wide, 160px height, non-interactive, refreshes when template or sections change (debounced 500ms). Shows a static layout approximation (not a live render).
- **"✦ Generate live preview" button:** Crystal purple, triggers `POST /api/automations/:id/preview` which calls CrystalOS to render a full preview with sample data. Loading state: "Crystal is writing..." spinner. On success: opens the full Briefing Delivery View in a new tab.

#### Deliver via Email Config Panel

```
Recipients
  [ Tag input — email addresses ]
  [+ Add me]  [ Import from org ]

Subject template
  [ Weekly NPS Digest — {{survey.name}} ]
  (supports {{ variable }} chips)

Format
  [ HTML Email ▾ ]   (HTML Email / Plain Text)

─────────────────────────────────────
Variable reference
  {{survey.name}}    {{org.name}}
  {{run.date}}       {{crystal.headline}}
  {{briefing.nps}}   {{briefing.responses}}
```

#### Deliver via Slack Config Panel

```
Webhook URL  (or workspace connection)
  [ https://hooks.slack.com/...    ]
  [ Connect Slack workspace ↗ ]

Channel (if workspace connected)
  [ #cx-alerts ▾ ]

Format
  [ Compact summary + link ▾ ]

[ Send test message ]
```

#### Slack Notification (Workflow) Config Panel

```
Channel
  [ #cx-alerts        ]

Message template
  [ NPS Alert: {{survey.name}} is at {{trigger.nps_score}} ]

  Available variables:
  {{trigger.nps_score}}  {{trigger.delta}}
  {{survey.name}}        {{run.id}}
  {{crystal.summary}}

Preview:
  NPS Alert: CSAT Q3 2026 is at 27.4
  ▲ Change: -4.2 pts vs. 24h ago
```

#### Email Action (Workflow) Config Panel

```
To
  [ Tag input — emails or {{ vars }} ]

Subject
  [ text input with {{ var }} support ]

Body
  [ Rich text editor (Tiptap subset) ]
  [ B / I / Link / {{ var }} chips   ]

[ Preview email ]
```

#### Jira Ticket Config Panel

```
Project
  [ CX Project ▾ ]  (combobox from connected Jira)

Issue type
  [ Bug ▾ ]

Summary template
  [ NPS Alert — {{survey.name}} ]

Priority
  [ High ▾ ]

Description template
  [ textarea with {{ var }} ]

[ Connect Jira ↗ ]  (shown if not connected)
```

#### In-App Notify Config Panel

```
Title template
  [ {{workflow.name}} fired ]

Body template
  [ NPS on {{survey.name}} dropped to {{trigger.nps_score}} ]

CTA label
  [ View Survey ]

CTA destination
  [ Survey dashboard ▾ ]
```

### 2.5 Live Preview Strip

Fixed to the bottom of the builder canvas (not the viewport). `height: 48px`, `background: rgba(255,255,255,0.95)`, `border-top: 1px solid #E5E7EB`, `backdrop-filter: blur(8px)`. `padding: 0 32px`.

```
When [NPS drops below 30] on [CSAT Q3 2026], then → [Slack #cx-alerts] · [Jira CX ticket] · [In-app notify]
```

- `When`, `then`, `→`, `·` are plain gray text (`text-sm text-gray-400`)
- Each `[bracketed]` segment is a colored chip matching the card's left-accent color
- Updates in real-time as cards are configured (React state → derived string, re-renders on any change)
- **Briefing version:** `Every [Monday at 9AM] → [Generate Weekly NPS Digest] → [Email 4 recipients] · [Slack #cx-alerts] · [In-app]`

### 2.6 Mode Switching Animation

When the user switches between Visual Builder and Crystal Builder mode tabs:

```javascript
// Framer Motion AnimatePresence with mode="wait"
// Exiting panel: opacity 1→0, x: 0→-20, duration 160ms
// Entering panel: opacity 0→1, x: 20→0, duration 200ms
// Ease: [0.22, 1, 0.36, 1]
```

The canvas contents do NOT change on mode switch — Visual Builder and Crystal Builder share the same canvas state. Switching to Crystal Builder shows the NL input area above the canvas; the canvas remains visible below it.

---

## Surface 3: Crystal NL Builder

**Route:** `/app/workflows/build?mode=crystal` (same route, different `mode` param)

### 3.1 NL Input Area

Displayed at the top of the builder (above the canvas), `width: 100%`, below the header.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ✦ Describe your automation in plain English                                     │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                           │  │
│  │  Alert #cx-alerts when NPS drops below 30, and also email me a weekly    │  │
│  │  Monday digest of NPS trends for the CSAT Q3 survey.                     │  │
│  │                                                                           │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  Examples: "Close CSAT Q3 at 500 responses" · "Weekly briefing every Monday"   │
│                                                  [ Clear ]  [ ✦ Build with Crystal → ] │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Textarea spec:**
- `min-height: 112px`, auto-expands to content (max 240px before scrolling)
- `border: 2px solid var(--color-crystal)` (`#7C3AED`)
- `border-radius: 12px`
- `padding: 16px`
- `font-size: 15px`, `line-height: 1.6`, `color: #1F2937`
- `box-shadow: 0 0 0 4px rgba(124,58,237,0.08)` — Crystal glow on focus
- Pre-seeded with `?q=` URL param value on mount

**"✦ Build with Crystal →" button:**
- `background: var(--color-crystal)` (`#7C3AED`)
- `color: white`
- `border-radius: 8px`, `padding: 10px 20px`, `font-size: 14px font-medium`
- On hover: `background: var(--color-crystal-dim)` (`#6D28D9`)
- Active: `scale: 0.98`

### 3.2 Building Animation

After the user clicks "✦ Build with Crystal →":

**Phase 1 — Thinking (0–800ms):**
The button disables and shows spinner. An amber thinking bar animates in below the textarea:
```
[amber left border] ✦ Crystal is analyzing your request...
```
`background: #FFFBEB`, `border-left: 3px solid #F59E0B`, `padding: 10px 16px`, `text-sm text-amber-800`.
The bar animates in with `opacity: 0→1, y: -8→0, 200ms`.

**Phase 2 — Building (800ms–N):**
The canvas below begins populating. Cards animate in sequentially from the top:

Stagger timing:
- Card 1 (trigger): appears at t=800ms
- Card 2 (condition, if any): t=1200ms
- Card 3 (first action): t=1600ms
- Card 4+: t += 400ms each

Card appearance animation:
```css
@keyframes crystalCardIn {
  from {
    opacity: 0;
    transform: translateY(-24px) scale(0.94);
    filter: blur(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}
```
Duration: `350ms`, easing: `cubic-bezier(0.22, 1, 0.36, 1)`.

**Opacity stagger while building (cards that Crystal hasn't reached yet):**
- Cards that have appeared but are still being "typed": `opacity: 1`
- Cards that Crystal will fill next (shown as placeholder): `opacity: 0.70`, left-border color muted
- Cards not yet started: `opacity: 0.35`, titles show "..." skeleton shimmer

**Config type-on animation:**
While a card is being "filled in," the summary line fills character by character:
```javascript
// 15ms per character, concurrent with card slide-in
// Implemented as a custom hook: useTypewriter(targetText, isActive, delay)
```

**Phase 3 — Complete:**
The thinking bar transitions from amber to Crystal purple:
```
[crystal purple left border] ✦ Crystal built this automation from your description
```
`background: #F5F3FF`, `border-left: 3px solid #7C3AED`, `text-sm text-violet-800`.
Fades from amber→purple with `background: cross-fade`, duration 400ms.

### 3.25 Crystal Disambiguation Card

Before the annotation card appears, if CrystalOS detected any ambiguous references (survey name, Slack channel, etc.), a `CrystalDisambiguationCard` appears between the NL input area and the canvas. Building is paused until the user resolves all ambiguities. See **Gap Fix 3 (Crystal Builder Disambiguation)** for the full spec — shows the amber disambiguation card, radio options, Cancel/Apply buttons, and the API contract change for `POST /api/workflows/crystal-build`.

### 3.3 Crystal Annotation Card

After all canvas cards are populated (and all disambiguations resolved), a Crystal annotation card appears at the top of the canvas (above the trigger card), animated in with `opacity: 0→1, y: 8→0, 250ms delay from last card`.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ✦ [Crystal purple left border]                                        │
│                                                                      │
│  Crystal built this from your description                            │  (text-sm font-medium)
│                                                                      │
│  • I set the NPS window to 24h (you didn't specify a timeframe).     │  (text-sm text-gray-600)
│  • I mapped "CSAT Q3" to your survey "CSAT Q3 2026 (active)".        │
│  • I set the Slack channel to #cx-alerts (found in your workspace).  │
│                                                                      │
│  Review the configuration, then click Enable.           [Edit in Visual Builder →] │
└──────────────────────────────────────────────────────────────────────┘
```

- Container: `bg-violet-50 border border-violet-200 rounded-xl p-4`
- Bullet items: each is a separate line, `text-sm text-gray-700`
- "Edit in Visual Builder →" link: `text-sm text-violet-600 font-medium underline-offset-2 hover:underline`

**Clicking "Edit in Visual Builder →":**
The NL input area collapses (Framer Motion `height: auto→0, opacity: 1→0, 300ms`), the builder switches to Visual Builder mode tab, and the canvas expands to fill the full vertical space.

### 3.4 Inline Warnings on Cards

If Crystal couldn't resolve something (e.g., Slack not connected), the relevant card shows an inline warning below its summary:

```
⚠  Slack not connected.  [ Connect Slack ↗ ]
```

Style: `text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2 flex items-center gap-2`

The builder can still be saved in this state, but the Enable button shows a tooltip: "Resolve all warnings before enabling."

---

## Surface 4: Briefing Delivery View

**Route:** `/app/workflows/:id/runs/:runId`
**URL params:** `:id` (automation ID), `:runId` (specific run ID)

<!-- ENT-028 applied -->

This is the first-class page that renders a completed Intelligence Briefing. It is what a CX director navigates to from the in-app notification and then forwards to their VP. Treat this as a product moment, not a debug view.

### 4.1 Page Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  TopBar — "← Back" + breadcrumb "Automation Hub → Weekly NPS Digest → Run"       │
├────────────────────────────────────────────┬─────────────────────────────────────┤
│                                            │  RIGHT SIDEBAR (320px)              │
│  CENTER (flex-1)                           │                                     │
│  gray background (#F3F4F6)                 │  Run metadata                       │
│                                            │  Generated: Jun 29, 2026 · 9:04 AM  │
│  ┌────────────────────────────────────┐    │  Duration: 11.3s                     │
│  │                                    │    │  Data range: Jun 22–29               │
│  │  [EMAIL HTML — 600px wide,         │    │  Recipients: 4 emails + Slack        │
│  │   centered within gray bg]         │    │  Run ID: run_a8f3b2                  │
│  │                                    │    │                                     │
│  └────────────────────────────────────┘    │  [ ↻ Resend ]                       │
│                                            │  [ ✎ Edit automation ]              │
│                                            │                                     │
│                                            │  ── Share ──────────────────────── │
│                                            │  [ 🔗 Copy share link ]             │
│                                            │  [ ⬇ Download PDF ]                │
│                                            │                                     │
└────────────────────────────────────────────┴─────────────────────────────────────┘
```

**Center area:** `bg-gray-100 flex-1 min-height: 100vh padding: 48px 24px`
**Email container:** `width: 600px margin: 0 auto background: white border-radius: 8px overflow: hidden box-shadow: 0 4px 24px rgba(0,0,0,0.10)`
**Right sidebar:** `width: 320px border-left: 1px solid #E5E7EB bg-white padding: 24px position: sticky top: 64px`

### 4.2 Right Sidebar Spec

**Run metadata block:**
```
Generated
  Jun 29, 2026 at 9:04 AM PT

Duration
  11.3 seconds

Data range
  Jun 22–29, 2026 (7 days)

Recipients
  spatil@qualtrics.com
  jsmith@company.com
  + 2 more recipients
  #cx-briefings (Slack)

Run ID
  run_a8f3b2cd
  [copy icon]
```

Each label: `text-xs font-medium text-gray-400 uppercase tracking-wide`
Each value: `text-sm text-gray-900 mt-0.5`
Separator between items: `border-b border-gray-100 my-3`

**Action buttons:**
- `[ ↻ Resend ]` — `variant="outline" size="sm" width: 100%`. On click: confirm sheet "Resend to all original recipients?" [Cancel] [Resend]. On confirm: `POST /api/automations/:id/runs/:runId/resend`.
- `[ ✎ Edit automation ]` — `variant="ghost" size="sm" width: 100%`. Navigates to `/app/workflows/build?id=:automationId`.

**Share block:**
- `[ 🔗 Copy share link ]` — `variant="outline" size="sm" width: 100%`. Copies a public share URL (30-day validity, no auth required for read-only view). Toast: "Link copied to clipboard".
- `[ ⬇ Download PDF ]` — `variant="ghost" size="sm" width: 100%`. `POST /api/automations/:id/runs/:runId/export-pdf` → download.

### 4.3 Email HTML Spec — Section by Section

#### Header Section

```html
<table width="600" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background:#4F46E5; padding:24px 32px;">
      <!-- Logo row -->
      <table width="100%">
        <tr>
          <td><img src="[logo-white]" width="120" alt="Xperiq" /></td>
          <td style="text-align:right; color:#C7D2FE; font-size:11px;
                     letter-spacing:0.1em; text-transform:uppercase;">
            Intelligence Briefing
          </td>
        </tr>
      </table>
      <!-- Scope + period row -->
      <p style="color:white; font-size:18px; font-weight:600; margin:16px 0 4px;">
        {{scope_label}}
      </p>
      <p style="color:#C7D2FE; font-size:13px; margin:0;">
        Week of {{period_start}} – {{period_end}}
      </p>
    </td>
  </tr>
</table>
```

Visual: Full-width Indigo (`#4F46E5`) band, 24px top/bottom padding, 32px left/right padding.

#### Crystal Summary Card

```html
<tr>
  <td style="padding:24px 32px 16px;">
    <table width="100%" style="border-left:4px solid #7C3AED; /* Crystal purple — matches --color-crystal token; do not use workflow indigo here */
                                background:#F8F9FF; border-radius:0 8px 8px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="font-size:11px; color:#6B7280; text-transform:uppercase;
                    letter-spacing:0.06em; margin:0 0 8px;">
            ✦ Crystal's Summary
          </p>
          <p style="font-size:15px; color:#1F2937; line-height:1.7; margin:0;">
            {{crystal_narrative_sentence_1}}<br>
            {{crystal_narrative_sentence_2}}<br>
            {{crystal_narrative_sentence_3}}
          </p>
        </td>
      </tr>
    </table>
  </td>
</tr>
```

The narrative must be specific, not generic. Example:
> Your NPS rose 12 points this week, driven by a surge of promoter responses citing the new onboarding flow. Detractor themes centered on response time and billing clarity. This week's signal suggests a strong opportunity to reduce detractor volume by addressing the billing FAQ gap.

Left border: 4px solid Crystal purple (`#7C3AED`) — matches `--color-crystal` token; do not use workflow indigo here. Background: `#F8F9FF`. `border-radius: 0 8px 8px 0`.

<!-- ENT-026 applied -->

#### KPI Row

```html
<tr>
  <td style="padding:0 32px 24px;">
    <table width="100%" style="border:1px solid #E5E7EB; border-radius:8px; overflow:hidden;">
      <tr>
        <!-- 4 cells, each 25% width -->
        <td style="padding:16px; border-right:1px solid #E5E7EB; text-align:center;">
          <p style="font-size:11px; color:#6B7280; text-transform:uppercase;
                    letter-spacing:0.06em; margin:0 0 6px;">NPS Score</p>
          <p style="font-size:32px; font-weight:700; color:#4F46E5; margin:0;">47</p>
          <span style="font-size:11px; background:#D1FAE5; color:#065F46;
                       border-radius:999px; padding:2px 8px;">+12 pts</span>
        </td>
        <td style="padding:16px; border-right:1px solid #E5E7EB; text-align:center;">
          <!-- Responses cell (same pattern, color:#374151) -->
        </td>
        <td style="padding:16px; border-right:1px solid #E5E7EB; text-align:center;">
          <!-- Velocity cell -->
        </td>
        <td style="padding:16px; text-align:center;">
          <!-- Completion Rate cell -->
        </td>
      </tr>
    </table>
  </td>
</tr>
```

KPI metrics:
1. **NPS Score** — value color: `#4F46E5` (Indigo)
2. **Total Responses** — value color: `#374151`
3. **Response Velocity** — "avg/day" subtitle, value color: `#374151`
4. **Completion Rate** — percentage, value color: `#374151`

Delta pill colors: `+N` → `bg:#D1FAE5 text:#065F46`; `-N` → `bg:#FEE2E2 text:#991B1B`; `=` → `bg:#F3F4F6 text:#6B7280`

#### What Changed Section

```html
<tr>
  <td style="padding:0 32px 24px;">
    <p style="font-size:11px; color:#9CA3AF; text-transform:uppercase;
              letter-spacing:0.06em; border-bottom:1px solid #F3F4F6;
              padding-bottom:8px; margin:0 0 12px;">What Changed</p>
    <!-- 3 rows, each: metric name + direction arrow + delta + context -->
    <table width="100%">
      <tr style="margin-bottom:8px;">
        <td style="font-size:13px; color:#374151; font-weight:500;">NPS Score</td>
        <td style="text-align:right;">
          <span style="color:#059669;">↑ +12 pts</span>
          <span style="font-size:11px; color:#9CA3AF;"> vs. last week</span>
        </td>
      </tr>
      <!-- Additional rows -->
    </table>
  </td>
</tr>
```

Arrow icons: `↑` in `#059669` (emerald) for positive, `↓` in `#DC2626` (red) for negative, `→` in `#9CA3AF` (gray) for flat. Always show all metrics including flat ones.

#### Top Themes (What Customers Are Saying)

```html
<tr>
  <td style="padding:0 32px 24px;">
    <p style="font-size:11px; color:#9CA3AF; text-transform:uppercase;
              letter-spacing:0.06em; margin:0 0 16px;">What Customers Are Saying</p>
    <table width="100%">
      <tr>
        <!-- Promoter column -->
        <td width="48%" style="vertical-align:top;">
          <p style="font-size:11px; font-weight:600; color:#059669;
                    text-transform:uppercase; letter-spacing:0.04em;
                    margin:0 0 8px;">😊 Promoters</p>
          <!-- Chips: each on its own line -->
          <span style="background:#D1FAE5; color:#065F46; border:1px solid #A7F3D0;
                       border-radius:999px; padding:4px 12px; font-size:12px;
                       font-weight:500; display:inline-block; margin:0 0 6px;">
            Onboarding experience <span style="opacity:0.6; margin-left:4px;">42</span>
          </span>
          <!-- additional chips -->
        </td>
        <td width="4%"></td>
        <!-- Detractor column (same pattern, colors red) -->
        <td width="48%" style="vertical-align:top;">
          <p style="font-size:11px; font-weight:600; color:#DC2626;
                    text-transform:uppercase; letter-spacing:0.04em;
                    margin:0 0 8px;">😟 Detractors</p>
          <!-- Red chips -->
        </td>
      </tr>
    </table>
  </td>
</tr>
```

In the **web view** (`/app/automations/:id/runs/:runId`), topic chips are `<a>` tags that navigate to `/app/experience/survey/:surveyId/topics?topic=X`. In the email HTML, clicking chips navigates to the full web view URL.

#### Moments That Mattered

```html
<tr>
  <td style="padding:0 32px 24px;">
    <p style="font-size:11px; color:#9CA3AF; text-transform:uppercase;
              letter-spacing:0.06em; margin:0 0 16px;">✦ Moments That Mattered</p>
    <!-- 2-3 verbatim cards -->
    <table width="100%" style="margin-bottom:12px;">
      <tr>
        <td style="border-left:3px solid #059669; background:#F0FDF4;
                   border-radius:0 8px 8px 0; padding:12px 16px;">
          <p style="font-size:13px; font-style:italic; color:#374151;
                    line-height:1.6; margin:0 0 6px;">
            "The new onboarding walkthrough made it so easy — I was up and running in
            under 10 minutes."
          </p>
          <p style="font-size:11px; color:#9CA3AF; margin:0;">
            Respondent #4821 · Jun 28
            <span style="background:#D1FAE5; color:#065F46; border-radius:999px;
                         padding:1px 8px; font-size:10px; margin-left:6px;">
              Positive
            </span>
          </p>
        </td>
      </tr>
    </table>
    <!-- Negative sentiment card: border-left: 3px solid #DC2626, background: #FFF1F2 -->
  </td>
</tr>
```

Left border: `3px solid #059669` for positive sentiment, `3px solid #DC2626` for negative. Background: `#F0FDF4` / `#FFF1F2` accordingly.
Attribution format: `Respondent #[anonymized_id] · [date]`. Never show full name or email.

#### Crystal's Recommendations

Evidence trail update (Fix 2): In the **email HTML**, evidence counts are wrapped in `<a>` links pointing to the web briefing view with `#rec-{index}` hash. In the **web view** (`BriefingDeliveryPage`), each recommendation card is rendered by `RecommendationCard` with an expandable `EvidenceDrawer` and a `RecommendationActionMenu`. See **Gap Fix 2 (Recommendation Evidence Trail)** and **Gap Fix 5 (Recommendation Outcome Loop)** for full specs.

```html
<tr>
  <td style="padding:0 32px 24px;">
    <table width="100%" style="background:#EEF2FF; border:1px solid #C7D2FE;
                                border-radius:12px; overflow:hidden;">
      <tr>
        <td style="padding:20px 24px;">
          <p style="font-size:13px; font-weight:600; color:#3730A3; margin:0 0 16px;">
            ✦ Crystal's Recommended Actions
          </p>
          <!-- 1-3 bullet items -->
          <table width="100%">
            <tr style="margin-bottom:12px;">
              <td width="12" style="vertical-align:top; padding-top:3px;">
                <!-- Priority dot: 8px circle -->
                <div style="width:8px; height:8px; border-radius:50%;
                             background:#DC2626; margin-top:4px;"></div>
              </td>
              <td style="padding-left:10px;">
                <p style="font-size:13px; font-weight:500; color:#1F2937; margin:0 0 2px;">
                  Address the billing FAQ gap immediately
                </p>
                <p style="font-size:11px; color:#6B7280; margin:0;">
                  <!-- evidence count is a link in email HTML (Fix 2) -->
                  <a href="{briefingWebUrl}#rec-0" style="color:#7C3AED; text-decoration:underline;">
                    12 detractors
                  </a> specifically mentioned billing clarity confusion
                  this week — up from 3 last week.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>
```

Priority dot colors: `#DC2626` (red, high), `#D97706` (amber, medium), `#059669` (green, low).
Recommendation container: `background: #EEF2FF` (Indigo 50), `border: 1px solid #C7D2FE`.

#### Footer

```html
<tr>
  <td style="background:#F9FAFB; padding:24px 32px; text-align:center;
              border-top:1px solid #E5E7EB;">
    <a href="{{dashboard_url}}"
       style="background:#4F46E5; color:white; text-decoration:none;
              border-radius:8px; padding:12px 24px; font-size:14px;
              font-weight:500; display:inline-block;">
      View full dashboard →
    </a>
    <p style="font-size:11px; color:#9CA3AF; margin:16px 0 0;">
      <a href="{{unsubscribe_url}}" style="color:#9CA3AF;">Unsubscribe</a>
      &nbsp;·&nbsp;
      Generated by Crystal AI
      &nbsp;·&nbsp;
      Xperiq
    </p>
  </td>
</tr>
```

Footer background: `#F9FAFB`. CTA button: Indigo (`#4F46E5`), rounded, full-width on mobile (CTA table cell `width: 100%`). Links use absolute URLs — the email does not rely on client-side routing.

### 4.4 Web-Interactive Enhancements

In the `/app/automations/:id/runs/:runId` web view, the static email HTML is replaced with a React-rendered version that adds:

- **Interactive topic chips:** clickable `<Link>` components
- **Expandable recommendations:** click to expand full Crystal rationale
- **Live NPS sparkline** in the KPI row (Recharts LineChart, 120×40px, no axes)
- **Shareable link** from the sidebar
- **"React to this briefing"** thumbs up/down for feedback (sent to `POST /api/automations/:id/runs/:runId/feedback`)

---

## Surface 5: Run History

**Route:** `/app/automations/:id/runs`
**Layout:** Standard page with PageHeader, below the TopBar.

### 5.1 Page Header

```
← Weekly NPS Digest     Run History
                        26 total runs · Last run: Jun 29, 2026 at 9:04 AM
                                                    [ Filter ▾ ]  [ Export CSV ]
```

### 5.2 Filter Bar

```
All  |  Success  |  Failed  |  In Progress  |  Dry Run     [Date range picker]     [Export CSV]
```

Tab filter + date range picker (shadcn DateRangePicker). "Export CSV" triggers `GET /api/automations/:id/runs?format=csv&from=...&to=...` → download.

### 5.3 Run Timeline

Each run is a row in a vertical timeline. Adjacent runs are connected by a thin `1px solid #E5E7EB` left border (timeline stem).

**Run Row (collapsed):**
```
[✓ icon]  Jun 29, 2026 · 9:04 AM  |  Scheduled  |  3 actions · 11.3s  |  [✓ Completed]  [▼]
```

- Icon: 24×24px circle — `bg-emerald-100 text-emerald-600` (success), `bg-red-100 text-red-600` (error), `bg-blue-100 text-blue-600` (in progress, animated pulse), `bg-gray-100 text-gray-400` (dry run)
- Date + time: `text-sm font-medium text-gray-900`
- Trigger type: `text-sm text-gray-500`
- Stats: `text-sm text-gray-500`
- Status badge: same pill style as card status pills
- Expand chevron: `▼` icon button, rotates 180° when expanded

**Run Row (expanded, 250ms ease-out accordion):**
```
▼ ───────────────────────────────────────────────────────────────────────

   TRIGGER CONTEXT
   ┌─────────────────────────────────────────────────────────────┐
   │  schedule_trigger fired                                      │
   │  scheduled_at: 2026-06-29T09:00:00Z · run_id: run_a8f3b2    │
   └─────────────────────────────────────────────────────────────┘

   STEPS EXECUTED
   ┌─────────────────────────────────────────────────────────────┐
   │  1  ✓  Generate Briefing        8,420ms                     │
   │        Template: Weekly NPS · 7 sections generated          │
   │        [View briefing ↗]                                    │
   ├─────────────────────────────────────────────────────────────┤
   │  2  ✓  Deliver via Email        1,230ms                     │
   │        Sent to 4 recipients                                 │
   │        [View delivery receipt ↗]                            │
   ├─────────────────────────────────────────────────────────────┤
   │  3  ✓  Deliver via Slack        380ms                       │
   │        Posted to #cx-briefings                              │
   ├─────────────────────────────────────────────────────────────┤
   │  4  ✓  In-App Notification      12ms                        │
   │        Delivered to 4 users                                 │
   └─────────────────────────────────────────────────────────────┘

   [Replay this run]  [View briefing]
```

**Signal Evidence section (Crystal Signal runs only):**
When `initiated_by = 'crystalos'`, an additional `SignalEvidencePanel` section appears below the steps. See **Gap Fix 1 (Signal Evidence Panel)** for the full spec — shows why Crystal fired, which responses contributed, metric snapshot, and deep-link to filtered response view.

**Failed step display:**
```
   2  ✕  Deliver via Email         Timeout (30s)
         Error: SMTP_TIMEOUT after 3 retries
         Last attempt: Jun 29 · 9:04:47 AM
         [Retry step]   [View error log]
```

Retry button: `POST /api/automations/:id/runs/:runId/retry-step?step=2`.

---

## Surface 6: Test Mode

**Trigger:** "▷ Test Run" button in the builder header.
**Mechanism:** Slides in from the right as an overlay panel, full height, 480px wide. The canvas remains visible to the left (not dimmed). The panel has `position: fixed`, `right: 0`, `top: 56px` (below builder header), `height: calc(100vh - 56px)`.

**Panel animation:** `x: 480→0, opacity: 0→1, duration: 280ms, ease: [0.22, 1, 0.36, 1]`

### 6.1 Test Panel Layout

```
┌────────────────────────────────────────────────────────────┐
│  Test Run                                             [×]  │  ← 48px header
│  ──────────────────────────────────────────────────────    │
│                                                            │
│  SIMULATE TRIGGER CONTEXT                                  │
│                                                            │
│  [For Schedule trigger:]                                   │
│  Simulate as of date:  [ 2026-06-29 ▾ ]                   │
│                                                            │
│  [For NPS Threshold trigger:]                              │
│  NPS score:    [ 27.4          ]                           │
│  Response count: [ 412         ]                           │
│  Window:       [ 24h ▾         ]                           │
│                                                            │
│  ────────────────────────────────────────────────────      │
│  SIMULATE CRYSTAL (optional)                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Paste sample response text for Crystal to analyze... │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ⚠ No side effects — this is a dry run.                    │
│     Slack / email / Jira will NOT be called.               │
│                                                            │
│              [ ▷ Run Test ]                                │
│                                                            │
│  ──────────────────────────────────────────────────────    │
│  RESULTS                                                   │
│                                                            │
│  (results appear here after test run)                      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Trigger context form fields are dynamically rendered based on the canvas trigger card type.

### 6.2 Test Results Display

After the test run completes (`POST /api/automations/test` with `automation_id` and `test_context`):

**Briefing test results:**
```
RESULTS

✓ Trigger conditions met
  Scheduled run time: 2026-06-29 at 09:00 AM PT

Would execute 4 steps:

1  →  Generate Briefing
      Template: Weekly NPS · Tone: Professional
      [✦ Generate live preview] ← triggers actual Crystal run to preview

2  →  Deliver via Email
      Would send to: spatil@qualtrics.com + 3 more
      [Preview email HTML ↗]

3  →  Deliver via Slack
      Would post to: #cx-briefings

4  →  In-App Notification
      Would notify: 4 users

Run ID: dry_run_c8f2a1 · Executed in 0ms (dry run)
```

**Workflow test results:**
```
RESULTS

✓ Condition check passed
  survey.response_count (412) ≥ 100 ✓

Would execute 3 actions:

1  →  Slack #cx-alerts
      "NPS Alert: *CSAT Q3 2026* is at *27.4*
      ▼ -4.2 pts vs. last 24h"
      [Preview message]

2  →  Jira ticket in CX
      Summary: "NPS Alert: CSAT Q3 2026"
      [Preview]

3  →  Crystal Analysis
      Would run theme_extraction on 412 open-text responses

Run ID: dry_run_a8f3b2 · Executed in 0ms (dry run)
```

The test panel stays open alongside the builder. The user can modify canvas cards, then re-run the test without closing the panel. The results area clears and re-fills with the new results.

---

## Micro-Interactions Reference

### Enable/Disable Toggle

1. Click: toggle slides 200ms `ease-in-out`
2. Optimistic update: UI shows new state immediately
3. API call `PUT /api/automations/:id` with `{ enabled: bool }`
4. Success: toast `"Automation enabled"` (green) or `"Automation paused"` (gray), auto-dismiss 2.5s
5. Failure: toggle snaps back (spring animation, `stiffness: 400, damping: 20`), toast shows error (red)

### Crystal Builder Card Appearance

```css
@keyframes crystalCardIn {
  from {
    opacity: 0;
    transform: translateY(-24px) scale(0.94);
    filter: blur(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}
/* duration: 350ms, ease: cubic-bezier(0.22, 1, 0.36, 1) */
/* stagger: 400ms between cards */
```

### Config Summary Typewriter

```javascript
// Custom hook: useTypewriter
// 15ms per character, starts at card mount + 100ms delay
// Characters revealed: 0 → targetText.length
// Cursor blinks during typing: CSS animation blink 600ms
// Cursor hidden when complete
```

### Bezier Connector Draw

```jsx
<motion.path
  d={bezierPath(sx, sy, tx, ty)}
  initial={{ pathLength: 0, opacity: 0 }}
  animate={{ pathLength: 1, opacity: 1 }}
  transition={{ duration: 0.35, ease: 'easeInOut', delay: 0.1 }}
  stroke="var(--color-connector)"
  strokeWidth={2}
  fill="none"
/>
```

### Drag-to-Reorder (Action Cards)

On drag start:
```css
.card-dragging {
  transform: scale(1.02);
  box-shadow: 0 12px 32px rgba(0,0,0,0.14);
  opacity: 0.92;
  z-index: 999;
  cursor: grabbing;
}
```

Drop target placeholder: dashed border `2px dashed #CBD5E1`, same height as dragged card, `animation: placeholder-pulse 1s ease-in-out infinite` (opacity 0.4→0.8 oscillation).

Drop animation (Framer Motion `layoutId` + `AnimatePresence`): card springs into position, `type: "spring", stiffness: 300, damping: 30`.

### Page Load Stagger (Hub List)

```jsx
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
const rise = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
```

Order: stats row cards first (stagger 0.08s), then tab bar (0.4s delay), then grid cards (0.08s stagger starting at 0.5s).

### Crystal Command Bar Placeholder Rotation

```css
@keyframes placeholderFadeOut {
  0%, 80% { opacity: 1; }
  90%, 100% { opacity: 0; }
}
@keyframes placeholderFadeIn {
  0%, 10% { opacity: 0; }
  20%, 100% { opacity: 1; }
}
```

Each placeholder string is an absolutely-positioned element. One is visible at a time. Rotation period: 5 seconds per placeholder. `animation-fill-mode: forwards`.

### Briefing Delivery Countdown (on cards)

When a briefing card's `next_run_at` is within 24 hours, the "Next: Mon Jun 30" text transitions to a live countdown:

```javascript
// useEffect with setInterval(1 minute)
// Format: "Next run in 6h 32m"
// When < 1 hour: "Next run in 42m" + Tailwind animate-pulse on the text
// When < 15 min: text color changes to amber, pulse frequency doubles
```

---

## Component Inventory

All automation components live in `app/src/components/automations/` and `app/src/pages/automations/`.

| Component | File path | Description |
|-----------|-----------|-------------|
| `AutomationHubPage` | `pages/automations/AutomationHubPage.tsx` | Hub list page — layout shell |
| `AutomationStatsRow` | `components/automations/AutomationStatsRow.tsx` | 4 stat cards row |
| `CrystalCommandBar` | `components/automations/CrystalCommandBar.tsx` | NL command bar (used in hub + empty state + new-automation sheet) |
| `AutomationTabBar` | `components/automations/AutomationTabBar.tsx` | All/Active/Briefings/Workflows/Error tabs |
| `AutomationCardGrid` | `components/automations/AutomationCardGrid.tsx` | 3-col card grid with stagger animation |
| `WorkflowCard` | `components/automations/WorkflowCard.tsx` | Workflow-type card in grid |
| `BriefingCard` | `components/automations/BriefingCard.tsx` | Briefing-type card in grid |
| `AutomationStatusPill` | `components/automations/AutomationStatusPill.tsx` | Active/Cooldown/Error/Paused pill |
| `NewAutomationSheet` | `components/automations/NewAutomationSheet.tsx` | Type selector sheet/modal |
| `TemplateGallery` | `components/automations/TemplateGallery.tsx` | Full-screen template modal |
| `TemplateCard` | `components/automations/TemplateCard.tsx` | Individual template card in gallery |
| `AutomationHubEmptyState` | `components/automations/AutomationHubEmptyState.tsx` | Empty state with Crystal bar + featured templates |
| `AutomationBuilder` | `pages/automations/AutomationBuilder.tsx` | Builder page layout shell (3-panel) |
| `BuilderHeader` | `components/automations/builder/BuilderHeader.tsx` | Builder top bar |
| `BuilderLeftPanel` | `components/automations/builder/BuilderLeftPanel.tsx` | Type selector + scope + palette |
| `AutomationTypeSelector` | `components/automations/builder/AutomationTypeSelector.tsx` | Workflow vs. Briefing radio cards |
| `ScopeBlock` | `components/automations/builder/ScopeBlock.tsx` | Scope radio + pickers |
| `CanvasPalette` | `components/automations/builder/CanvasPalette.tsx` | Draggable palette of items |
| `BuilderCanvas` | `components/automations/builder/BuilderCanvas.tsx` | Center canvas with dot-grid bg |
| `CanvasCardStack` | `components/automations/builder/CanvasCardStack.tsx` | Vertical stack of canvas cards |
| `TriggerCard` | `components/automations/builder/cards/TriggerCard.tsx` | Trigger card on canvas |
| `ConditionCard` | `components/automations/builder/cards/ConditionCard.tsx` | Condition card on canvas |
| `ActionCard` | `components/automations/builder/cards/ActionCard.tsx` | Generic action card (accepts type prop) |
| `GenerateBriefingCard` | `components/automations/builder/cards/GenerateBriefingCard.tsx` | Briefing-specific generate card |
| `InAppCard` | `components/automations/builder/cards/InAppCard.tsx` | Always-on in-app notification card |
| `BezierConnector` | `components/automations/builder/BezierConnector.tsx` | SVG bezier path between cards |
| `AddCardButton` | `components/automations/builder/AddCardButton.tsx` | Dashed "add action/condition" button |
| `LivePreviewStrip` | `components/automations/builder/LivePreviewStrip.tsx` | Bottom human-readable summary |
| `BuilderRightPanel` | `components/automations/builder/BuilderRightPanel.tsx` | Config panel container |
| `ScheduleConfigPanel` | `components/automations/builder/config/ScheduleConfigPanel.tsx` | Schedule trigger config |
| `NpsThresholdConfigPanel` | `components/automations/builder/config/NpsThresholdConfigPanel.tsx` | NPS threshold config |
| `GenerateBriefingConfigPanel` | `components/automations/builder/config/GenerateBriefingConfigPanel.tsx` | Generate briefing config (template, tone, sections reorder) |
| `EmailActionConfigPanel` | `components/automations/builder/config/EmailActionConfigPanel.tsx` | Email action config |
| `SlackActionConfigPanel` | `components/automations/builder/config/SlackActionConfigPanel.tsx` | Slack action config |
| `JiraActionConfigPanel` | `components/automations/builder/config/JiraActionConfigPanel.tsx` | Jira ticket config |
| `InAppConfigPanel` | `components/automations/builder/config/InAppConfigPanel.tsx` | In-app notification config |
| `SectionsReorderList` | `components/automations/builder/config/SectionsReorderList.tsx` | DnD sections reorder in generate config |
| `VariableChipInput` | `components/automations/builder/VariableChipInput.tsx` | `{{var}}` autocomplete input |
| `MiniEmailPreview` | `components/automations/builder/MiniEmailPreview.tsx` | 320px email preview in right panel |
| `CrystalBuilderMode` | `components/automations/builder/CrystalBuilderMode.tsx` | NL input area + building animation |
| `CrystalAnnotationCard` | `components/automations/builder/CrystalAnnotationCard.tsx` | Post-build annotation card |
| `BuilderModeSwitch` | `components/automations/builder/BuilderModeSwitch.tsx` | Crystal / Visual mode tabs |
| `BriefingDeliveryPage` | `pages/automations/BriefingDeliveryPage.tsx` | Briefing delivery view layout |
| `BriefingEmailRenderer` | `components/automations/delivery/BriefingEmailRenderer.tsx` | Web-interactive email renderer |
| `BriefingDeliverySidebar` | `components/automations/delivery/BriefingDeliverySidebar.tsx` | Run metadata + actions sidebar |
| `RunHistoryPage` | `pages/automations/RunHistoryPage.tsx` | Run history list page |
| `RunRow` | `components/automations/RunRow.tsx` | Expandable run timeline row |
| `RunStepDetail` | `components/automations/RunStepDetail.tsx` | Expanded step detail inside RunRow |
| `TestModePanel` | `components/automations/TestModePanel.tsx` | Test mode slide-in panel |
| `TestResultsDisplay` | `components/automations/TestResultsDisplay.tsx` | Results display after test run |

**Hooks:**
| Hook | File path | Description |
|------|-----------|-------------|
| `useAutomations` | `hooks/useAutomations.ts` | List + CRUD for automations |
| `useAutomationStats` | `hooks/useAutomationStats.ts` | Stats row data fetch |
| `useAutomationBuilder` | `hooks/useAutomationBuilder.ts` | Builder state (canvas, selections, dirty) |
| `useTypewriter` | `hooks/useTypewriter.ts` | Typewriter text animation |
| `useBriefingDelivery` | `hooks/useBriefingDelivery.ts` | Single run fetch + resend |
| `useRunHistory` | `hooks/useRunHistory.ts` | Paginated run history for an automation |

---

## Accessibility

### ARIA Roles and Labels

```tsx
// Hub page
<main aria-label={t('automations.hub.ariaLabel')}>
<section aria-label={t('automations.stats.ariaLabel')} role="region">
<nav aria-label={t('automations.tabs.ariaLabel')} role="tablist">
  <button role="tab" aria-selected={isActive} aria-controls="tab-panel-all">

// Command bar
<form role="search" aria-label={t('automations.commandBar.ariaLabel')}>
  <input
    aria-label={t('automations.commandBar.inputAriaLabel')}
    aria-describedby="commandbar-hint"
  />

// Card grid
<ul aria-label={t('automations.cardGrid.ariaLabel')}>
  <li>
    <article
      aria-label={`${automation.name} — ${automation.type}`}
      aria-describedby={`card-status-${automation.id}`}
    >

// Builder canvas
<div
  role="application"
  aria-label={t('automations.builder.canvasAriaLabel')}
  aria-roledescription="Automation canvas"
>

// Canvas cards
<div
  role="article"
  aria-selected={isSelected}
  aria-label={`${cardType}: ${cardTitle}`}
  tabIndex={0}
>

// Drag handles
<div
  role="button"
  aria-label={t('automations.builder.dragHandleAriaLabel', { title: cardTitle })}
  aria-roledescription="Drag handle — press Space to pick up, arrow keys to move"
>
```

### Keyboard Navigation

**Hub page:**
- `Tab` cycles through: command bar → stats → tab items → cards
- `Enter` on a card: navigates to edit view
- `Space` on enable/disable toggle: toggles state

**Builder:**
- `Tab` cycles through: left panel → canvas cards → right panel form fields
- `Enter` or `Space` on a canvas card: selects it and focuses the right panel
- `Delete` or `Backspace` on a selected canvas card: shows delete confirmation
- `Escape`: deselects current card (focus returns to canvas container)
- Canvas card reorder via keyboard: `Space` to pick up, `Arrow Up/Down` to move, `Space` to drop, `Escape` to cancel (follows `@dnd-kit/core` keyboard preset)

**Briefing delivery view:**
- Full keyboard navigation — no mouse required
- `Tab` through: sidebar metadata → action buttons → share buttons

### Focus Management

- On builder load: focus moves to the automation name input
- On card selection: focus moves to the right panel's first form field
- On mode switch (Crystal ↔ Visual): focus moves to the NL textarea (Crystal) or canvas first card (Visual)
- On test panel open: focus moves to the test panel's first input
- On test panel close: focus returns to the "▷ Test Run" button in the header

### Screen Reader Announcements

Use `aria-live="polite"` regions for:
- Canvas card addition: "Trigger card added to automation canvas"
- Crystal build completion: "Crystal has finished building your automation. Review the canvas."
- Test run completion: "Test run complete. 3 actions would execute."
- Enable/disable: "Automation [name] is now enabled" / "disabled"

---

## Localization

All user-visible strings in `app/src/locales/en.ts` under the `automations` namespace. This completely replaces the `workflows` namespace in v1 (backward-compat: keep `workflows` namespace as an alias until all pages are migrated).

```typescript
automations: {
  // ── Hub page ─────────────────────────────────────────────────────────────
  hub: {
    title: 'Automation Hub',
    subtitle: 'Automated workflows and intelligence briefings — all in one place.',
    ariaLabel: 'Automation Hub page',
    newAutomation: '+ New Automation',
    templates: 'Templates',
    emptyStateHeadline: "Your data shouldn't just sit there.",
    emptyStateSubtext: 'Tell Crystal what you want to automate:',
  },

  // ── Stats row ─────────────────────────────────────────────────────────────
  stats: {
    ariaLabel: 'Automation statistics',
    active: 'Active automations',
    runsToday: 'Runs today',
    briefings: 'Briefings delivered',
    errors: 'Errors',
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────
  tabs: {
    ariaLabel: 'Filter automations',
    all: 'All',
    active: 'Active',
    briefings: 'Briefings',
    workflows: 'Workflows',
    error: 'Error',
  },

  // ── Card grid ─────────────────────────────────────────────────────────────
  cardGrid: {
    ariaLabel: 'Automation cards',
  },

  // ── Card types ────────────────────────────────────────────────────────────
  cardType: {
    workflow: '⚡ WORKFLOW',
    briefing: '✦ BRIEFING',
  },

  // ── Status pills ──────────────────────────────────────────────────────────
  status: {
    active: 'Active',
    paused: 'Paused',
    cooldown: 'Cooldown',
    error: 'Error',
    dormant: 'DORMANT',
  },

  // ── Crystal command bar ───────────────────────────────────────────────────
  commandBar: {
    ariaLabel: 'Crystal automation command bar',
    inputAriaLabel: 'Describe your automation',
    placeholder: [
      "✦ Tell Crystal what to automate — try \"Alert #cx-alerts when NPS drops below 30\"",
      "✦ Tell Crystal what to automate — try \"Email me a weekly NPS digest every Monday\"",
      "✦ Tell Crystal what to automate — try \"Slack #product when a new theme is detected\"",
      "✦ Tell Crystal what to automate — try \"Close the survey when we hit 500 responses\"",
    ],
    buildCta: '✦ Build with Crystal',
  },

  // ── New automation sheet ──────────────────────────────────────────────────
  newSheet: {
    title: 'What would you like to automate?',
    workflowTitle: 'Reactive Workflow',
    workflowDesc: 'Trigger-based: fires when something happens in your data.',
    briefingTitle: 'Intelligence Briefing',
    briefingDesc: 'Scheduled: Crystal writes and delivers a report on a schedule.',
    startBuilding: 'Start building',
    orDescribe: 'or describe it and let Crystal decide',
  },

  // ── Builder ───────────────────────────────────────────────────────────────
  builder: {
    canvasAriaLabel: 'Automation canvas',
    dragHandleAriaLabel: 'Drag handle for {title}',
    namePlaceholder: 'New Automation',
    back: '← Back to Hub',
    testRun: '▷ Test Run',
    save: 'Save',
    saved: '✓ Saved',
    enable: 'Enable →',
    disable: 'Disable',
    unsavedDot: 'Unsaved changes',
    modeTabCrystal: '✦ Crystal Builder',
    modeTabVisual: '⊞ Visual Builder',
    leftPanel: {
      typeLabel: 'AUTOMATION TYPE',
      workflowType: '⚡ Reactive Workflow',
      workflowTypeDesc: 'Fires when something happens in your data',
      briefingType: '✦ Intelligence Briefing',
      briefingTypeDesc: 'Crystal writes + delivers on a schedule',
      switchTypeWarning: 'Switching type will clear the canvas. Continue?',
      scopeLabel: 'SCOPE',
      scopeOrg: 'Org-wide',
      scopeSurvey: 'Specific survey',
      scopeTag: 'Tag group',
      paletteLabel: 'ADD TO CANVAS',
    },
    addCardBtn: '+ Add Action or Condition',
    addCondition: 'Add Condition',
    addAction: 'Add Action',
    noCardSelected: 'Select a card to configure it.',
  },

  // ── Crystal NL builder ────────────────────────────────────────────────────
  crystalBuilder: {
    inputLabel: '✦ Describe your automation in plain English',
    inputPlaceholder: 'When our NPS drops below 30, send a Slack message to #cx-alerts...',
    examplesLabel: 'Examples:',
    clearBtn: 'Clear',
    buildCta: '✦ Build with Crystal →',
    thinkingBar: '✦ Crystal is analyzing your request...',
    buildingBar: '✦ Crystal is building your automation...',
    completeBar: '✦ Crystal built this automation from your description',
    annotationTitle: 'Crystal built this from your description',
    editInVisual: 'Edit in Visual Builder →',
    warningSlackNotConnected: 'Slack not connected.',
    connectSlack: 'Connect Slack ↗',
  },

  // ── Card type labels ──────────────────────────────────────────────────────
  cardLabels: {
    scheduleTrigger: 'SCHEDULE TRIGGER',
    npsTrigger: 'NPS THRESHOLD',
    responseCountTrigger: 'RESPONSE COUNT',
    sentimentTrigger: 'SENTIMENT SPIKE',
    themeTrigger: 'AI THEME DETECTED',
    anomalyTrigger: 'STATISTICAL ANOMALY',
    lifecycleTrigger: 'SURVEY LIFECYCLE',
    responseSubmittedTrigger: 'RESPONSE SUBMITTED',
    manualTrigger: 'MANUAL TRIGGER',
    condition: 'CONDITION',
    generateBriefing: 'GENERATE BRIEFING',
    deliverEmail: 'DELIVER VIA EMAIL',
    deliverSlack: 'DELIVER VIA SLACK',
    deliverWebhook: 'DELIVER VIA WEBHOOK',
    inApp: 'IN-APP NOTIFICATION',
    sendEmail: 'SEND EMAIL',
    slackMessage: 'SLACK MESSAGE',
    webhook: 'WEBHOOK',
    jiraTicket: 'JIRA TICKET',
    closeSurvey: 'CLOSE SURVEY',
    crystalAnalysis: 'CRYSTAL ANALYSIS',
  },

  // ── Config panels ─────────────────────────────────────────────────────────
  config: {
    generateBriefing: {
      template: 'Template',
      // tone removed — replaced by audience (Fix 4)
      audience: 'Audience',
      audienceOptions: {
        executive: 'Executive',
        executiveDesc: 'Focused. Fewer sections, stronger headline.',
        team: 'Team',
        teamDesc: 'Balanced. All key sections, curated verbatims.',
        analyst: 'Analyst',
        analystDesc: 'Full depth. All sections + velocity chart.',
      },
      timeRange: 'Time range',
      scopeOverride: 'Scope override',
      sections: 'Sections',
      sectionsHint: 'Drag to reorder',
      generatePreview: '✦ Generate live preview',
      miniPreviewTitle: 'Email preview',
      audienceSwitchWarning: 'Switching audience will reset your section order. Continue?',
    },
    schedule: {
      howOften: 'How often?',
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      customInterval: 'Custom interval',
      onWhichDays: 'On which days?',
      theNthDay: 'The {ordinal} day of the month',
      theNthWeekday: 'The {ordinal} {weekday} of the month',
      theLastDay: 'The last day of the month',
      monthlySkipWarning: 'Months with fewer than {day} days will be skipped.',
      every: 'Every',
      startingFrom: 'Starting from next',
      atWhatTime: 'At what time?',
      exactMinuteToggle: '↕ Pick exact minute',
      timezone: 'Time zone',
      useBrowserTimezone: "Use my browser's timezone",
      chooseTimezone: 'Choose a timezone',
      nextRun: 'Next run: {date} · {relative}',
      developerModeLabel: '⚙ Developer mode (cron expression)',
      cronLabel: 'Cron expression',
      cronOverrideWarning: 'Changing this field overrides the visual picker above.',
      cronNotRepresentable: 'Custom expression (not representable in picker)',
    },
    npsThreshold: {
      survey: 'Survey',
      threshold: 'Threshold',
      direction: 'Direction',
      directionOptions: { below: 'Below', above: 'Above', crosses: 'Crosses' },
      window: 'Rolling window',
      hysteresisNote: 'Hysteresis buffer: +5 pts — workflow won\'t re-fire until NPS recovers by 5 points.',
    },
    email: {
      recipients: 'Recipients',
      addMe: '+ Add me',
      importFromOrg: 'Import from org',
      subject: 'Subject template',
      format: 'Format',
      variableReference: 'Variable reference',
    },
    slack: {
      webhookUrl: 'Webhook URL',
      connectWorkspace: 'Connect Slack workspace ↗',
      channel: 'Channel',
      format: 'Format',
      sendTest: 'Send test message',
    },
  },

  // ── Live preview strip ────────────────────────────────────────────────────
  livePreview: {
    when: 'When',
    on: 'on',
    then: 'then →',
    every: 'Every',
    and: 'and',
  },

  // ── Briefing delivery view ─────────────────────────────────────────────────
  delivery: {
    breadcrumb: '{automationName} · Run',
    generated: 'Generated',
    duration: 'Duration',
    dataRange: 'Data range',
    recipients: 'Recipients',
    runId: 'Run ID',
    resend: '↻ Resend',
    editAutomation: '✎ Edit automation',
    copyShareLink: '🔗 Copy share link',
    downloadPdf: '⬇ Download PDF',
    resendConfirmTitle: 'Resend to all original recipients?',
    resendConfirmCta: 'Resend',
    linkCopied: 'Link copied to clipboard',
    emailSections: {
      crystalSummary: "Crystal's Summary",
      kpiRow: 'Key Metrics',
      whatChanged: 'What Changed',
      topThemes: 'What Customers Are Saying',
      moments: 'Moments That Mattered',
      recommendations: "Crystal's Recommended Actions",
      footer: 'View full dashboard →',
      unsubscribe: 'Unsubscribe from this report',
      generatedBy: 'Generated by Crystal AI',
    },
  },

  // ── Run history ────────────────────────────────────────────────────────────
  runHistory: {
    title: 'Run History',
    totalRuns: '{count} total runs',
    lastRun: 'Last run: {date}',
    filterAll: 'All',
    filterSuccess: 'Success',
    filterFailed: 'Failed',
    filterInProgress: 'In Progress',
    filterDryRun: 'Dry Run',
    exportCsv: 'Export CSV',
    noRuns: 'No runs yet',
    expandRow: 'Expand run details',
    collapseRow: 'Collapse run details',
    triggerContext: 'TRIGGER CONTEXT',
    stepsExecuted: 'STEPS EXECUTED',
    replayRun: 'Replay this run',
    viewBriefing: 'View briefing',
    retryStep: 'Retry step',
    viewErrorLog: 'View error log',
  },

  // ── Test mode ─────────────────────────────────────────────────────────────
  testMode: {
    title: 'Test Run',
    close: 'Close',
    simulateTrigger: 'SIMULATE TRIGGER CONTEXT',
    simulateCrystal: 'SIMULATE CRYSTAL (optional)',
    crystalTextPlaceholder: 'Paste sample response text for Crystal to analyze...',
    dryRunWarning: 'No side effects — this is a dry run.',
    dryRunWarningDetail: 'Slack / email / Jira will NOT be called.',
    runCta: '▷ Run Test',
    results: 'RESULTS',
    conditionPassed: 'Trigger conditions met',
    wouldExecute: 'Would execute {count} steps:',
    generatePreview: '✦ Generate live preview',
    previewEmail: 'Preview email HTML ↗',
    dryRunId: 'Run ID: {id} · Executed in 0ms (dry run)',
  },

  // ── Toasts and notifications ───────────────────────────────────────────────
  toasts: {
    enabled: 'Automation enabled',
    paused: 'Automation paused',
    saved: 'Automation saved',
    deleted: 'Automation deleted',
    duplicated: 'Automation duplicated',
    runStarted: 'Running now — you\'ll be notified when it\'s ready',
    testRunComplete: 'Test run complete',
    previewSent: 'Preview sent to {email}',
    resent: 'Resent to {count} recipients',
    errorEnabling: 'Failed to enable automation',
    errorSaving: 'Failed to save automation',
  },
},
```

---

## New Routes to Add

Add these to `app/src/constants/routes.ts`:

```typescript
// Automation Hub (unified — replaces /workflows split)
AUTOMATIONS:                '/app/workflows',          // existing ROUTES.WORKFLOWS (no change)
AUTOMATION_BUILD:           '/app/workflows/build',    // existing ROUTES.WORKFLOW_BUILD (no change)
AUTOMATION_RUN_HISTORY:     '/app/workflows/:id/runs',
AUTOMATION_RUN_DELIVERY:    '/app/workflows/:id/runs/:runId',
```

The existing `ROUTES.WORKFLOWS` and `ROUTES.WORKFLOW_BUILD` remain unchanged — the Automation Hub is a progressive redesign of the existing routes, not a route migration.

---

---

## Gap Fixes — v2.1

**Version:** 2.1
**Addresses:** Five design gaps identified in the post-session review (2026-06-29).
**Status:** Approved — applies retroactively to all phases.

The five gaps and their fixes are each self-contained; they touch existing surfaces (RunRow, Briefing email, Crystal Builder, Generate Briefing config) and add two new components.

---

### Fix 1 — Signal Evidence Panel

**Problem:** When a Crystal Signal fires (`sentiment_spike`, `new_theme_detected`, `anomaly_detected`), users see that the workflow fired but have no way to see *why* Crystal decided to fire it. There is no link from the run detail back to the responses that triggered the signal.

**Fix:** The expanded `RunRow` gains a new collapsible section at the bottom — **Signal Evidence** — that appears only when `initiated_by = 'crystalos'`. It shows the signal metric snapshot, 3 sample contributing responses, and a deep-link to the filtered response view.

#### Signal Evidence UI (expanded RunRow — additional section below STEPS EXECUTED)

```
▼ STEPS EXECUTED
   [... steps as before ...]

──────────────────────────────────────────────────────────────────

✦ SIGNAL EVIDENCE                         Why did Crystal fire this?

   ┌─────────────────────────────────────────────────────────────┐
   │  [Violet bg, rounded-lg]                                    │
   │                                                             │
   │  NEGATIVE SENTIMENT     RESPONSES FLAGGED   CONFIDENCE      │
   │  38%  ▲ +17pp           47                  0.91            │
   │  was 21%                in 48h window       threshold: 0.75 │
   │                                                             │
   │  Sample responses that triggered this signal:               │
   │                                                             │
   │  ┌──────────────────────────────────────────────────────┐   │
   │  │ [Negative]  Respondent · Jun 29                      │   │
   │  │ "The checkout process is incredibly confusing —      │   │
   │  │  I've tried three times and keep getting an error."  │   │
   │  └──────────────────────────────────────────────────────┘   │
   │                                                             │
   │  ┌──────────────────────────────────────────────────────┐   │
   │  │ [Negative]  Respondent · Jun 28                      │   │
   │  │ "Support took 4 days to respond. I shouldn't have    │   │
   │  │  to wait that long for a billing issue."              │   │
   │  └──────────────────────────────────────────────────────┘   │
   │                                                             │
   │  ┌──────────────────────────────────────────────────────┐   │
   │  │ [Negative]  Respondent · Jun 28                      │   │
   │  │ "The new UI redesign completely broke my workflow."   │   │
   │  └──────────────────────────────────────────────────────┘   │
   │                                                             │
   │              [ View all 47 contributing responses → ]        │
   └─────────────────────────────────────────────────────────────┘
```

**Container:** `background: #F5F3FF` (violet-50), `border-top: 1px solid #E5E7EB`, `padding: 20px`.

**Section header row:**
- Left: `✦ SIGNAL EVIDENCE` badge (violet-100 bg, violet-700 text, same pill pattern as Crystal Signal badge on canvas cards) + `"Why did Crystal fire this?"` in `text-sm font-semibold text-gray-900`
- Right: `"View all {N} contributing responses →"` in `text-sm font-medium text-violet-600`, navigates to `/app/experience/survey/:surveyId/responses?signal_run_id=:runId` — the response list pre-filtered to the exact responses that contributed to this signal run. Link is only shown when `signal_response_ids` is non-null in the run payload.

**Metric snapshot row:**
Three cells in a `bg-white border border-violet-200 rounded-lg` container. Each cell: label (`text-xs font-medium text-gray-400 uppercase tracking-wide`), value (`text-2xl font-bold`, red for negative-direction metrics, gray-900 for neutral), sub-label (`text-xs text-gray-500` or `text-xs text-red-600` for delta). Cells: `border-right: 1px solid #E5E7EB` between them.

- Cell 1: Metric name (e.g. "Negative sentiment"), value (38%), sub-label ("was 21% · +17pp") — color red for `sentiment_spike` / `anomaly_detected`, violet for `new_theme_detected`
- Cell 2: "Responses flagged", value (47), sub-label ("in {window_hours}h window")
- Cell 3: "Confidence", value (0.91), sub-label ("threshold: {threshold}")

**Response cards (3 max):**
Each: `bg-white border border-gray-200 rounded-lg px-3 py-2.5`. Top row: sentiment badge (Negative/red, Positive/green, Neutral/gray — pill, same as elsewhere) + respondent + date (`text-xs text-gray-400`). Body: verbatim text `text-sm text-gray-700 italic`.

Responses are drawn from `trigger_payload.signal_evidence.sample_verbatims` (array of `{ respondent_id_hash, submitted_at, text, sentiment, response_id }`). CrystalOS populates this field in the signal payload it emits.

**"View all N contributing responses →" link:**
Builds the URL from `trigger_payload.signal_evidence.contributing_response_ids` (array of UUIDs). Backend endpoint: `GET /api/surveys/:id/responses?ids=uuid1,uuid2,...` or, if > 200 IDs, via `signal_run_id` lookup. This route already exists in the response list page; only the filter param needs to be added.

**Collapse behavior:** The Signal Evidence section defaults to expanded. A `[▲ Collapse]` / `[▼ Signal Evidence]` toggle `text-xs text-gray-500` appears at the top-right of the section. Collapsed state shows only the metric snapshot row (no response cards).

**When not shown:** For non-Crystal-Signal triggers (`scheduler`, `api`, `user`), the Signal Evidence section does not render at all — only for `initiated_by = 'crystalos'` runs.

#### New backend contract
`trigger_payload` for Crystal Signal runs must include:
```typescript
signal_evidence: {
  sample_verbatims: Array<{
    respondent_id_hash: string;   // SHA-256 of respondent_id — never raw ID
    submitted_at: string;         // ISO 8601
    text: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    response_id: string;          // for deep-link construction
  }>;
  contributing_response_ids: string[];  // all response IDs that contributed
  contributing_response_count: number;
};
```
CrystalOS `signal_emitter.py` must populate this field. The sample_verbatims array is truncated to 5 max before emission.

#### New component
`SignalEvidencePanel` — `components/automations/SignalEvidencePanel.tsx`. Receives `triggerPayload: TriggerPayload` and `surveyId: string`. Renders the full violet evidence section. Used inside `RunRow` when `initiated_by === 'crystalos'`.

---

### Fix 2 — Recommendation Evidence Trail

**Problem:** Briefing recommendations cite counts ("12 detractors mentioned billing clarity") but provide no way to see the actual responses. A recipient forwarding this to their VP cannot show the evidence.

**Fix:** In the web-interactive briefing view (`BriefingDeliveryPage`), each recommendation's evidence count becomes a clickable link. Clicking expands an inline evidence drawer below the recommendation showing up to 3 verbatims and a "View all N responses →" link to the filtered response list. In the email HTML, the count links to the web briefing view with the recommendation pre-expanded via URL hash.

#### Updated Recommendations Section (web view)

```
✦ Crystal's Recommended Actions
────────────────────────────────────────────────────────────────────

●  Address the billing FAQ gap immediately                    [···]
   12 detractors mentioned billing clarity this week
   — up from 3 last week.

   ▼ See evidence (12 responses)                   [×]
   ┌──────────────────────────────────────────────────────────┐
   │ [Negative] Respondent #4821 · Jun 28                     │
   │ "I've been trying to understand my invoice for 3 days.   │
   │  The FAQ page doesn't explain the line items at all."    │
   ├──────────────────────────────────────────────────────────┤
   │ [Negative] Respondent #3917 · Jun 27                     │
   │ "Your billing page says one thing and the email says     │
   │  another. Completely contradictory."                     │
   ├──────────────────────────────────────────────────────────┤
   │ [Negative] Respondent #5103 · Jun 29                     │
   │ "Had to contact support to understand my own bill.       │
   │  This should be self-service."                           │
   └──────────────────────────────────────────────────────────┘
                               [ View all 12 responses → ]

●  Accelerate support response time for billing queries       [···]
   9 detractors cited response time this week (stable).
```

**Evidence count link:**
`text-sm font-medium text-violet-600 underline underline-offset-2 cursor-pointer`. Clicking toggles the evidence drawer. In the email HTML: `<a href="{briefingWebUrl}#rec-{index}">12 detractors</a>` — links to the web view with the drawer pre-expanded.

**Evidence drawer:**
- Container: `mt-3 rounded-lg border border-gray-200 overflow-hidden bg-white`
- Header: `flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200` — left: `"▼ See evidence ({N} responses)"` `text-xs font-medium text-gray-600`, right: `[×]` close button
- Response rows: each is `px-3 py-2.5 border-b border-gray-100` (last row: no bottom border)
  - Top row: sentiment badge + respondent hash + date
  - Body: verbatim text `text-sm text-gray-700 leading-relaxed`
- Footer: `px-3 py-2.5 bg-gray-50 text-right` — `"View all {N} responses →"` as `<Link>` to `/app/experience/survey/:id/responses?theme={themeSlug}&sentiment=negative&range={briefingRange}`
- Animation: `max-height: 0 → auto` with `overflow: hidden; transition: max-height 300ms ease-in-out`

**URL hash pre-expansion:**
`BriefingDeliveryPage` reads `window.location.hash` on mount. If `#rec-{N}`, expand the Nth recommendation's evidence drawer and scroll it into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`).

**Email HTML change:**
The evidence count in the email is wrapped in an `<a>` tag linking to `{briefingWebUrl}#rec-{index}`. This is the only interactive element added to the email HTML — all actual evidence is in the web view, not the email, since email cannot render dynamic drawers.

```html
<!-- Updated recommendation body in email HTML -->
<p style="...">
  <a href="{briefingWebUrl}#rec-0" style="color:#7C3AED; text-decoration:underline;">
    12 detractors
  </a> mentioned billing clarity this week — up from 3 last week.
</p>
```

**Data source:** CrystalOS populates `recommendations[].evidence` in the briefing payload:
```typescript
evidence: {
  response_ids: string[];           // IDs of the supporting responses
  sample_verbatims: Array<{
    respondent_id_hash: string;
    submitted_at: string;
    text: string;
    sentiment: 'positive' | 'negative' | 'neutral';
  }>;
  theme_slug: string;               // for the deep-link filter
  response_count: number;
};
```

#### New components
- `RecommendationCard` — `components/automations/delivery/RecommendationCard.tsx`. Wraps one recommendation with evidence drawer toggle.
- `EvidenceDrawer` — `components/automations/delivery/EvidenceDrawer.tsx`. The expandable verbatim list + "View all" link.

---

### Fix 3 — Crystal Builder Disambiguation

**Problem:** If a user types "my CSAT survey" and the org has 3 active CSAT surveys, Crystal silently picks one. There is no inline disambiguation — the selected trigger card may be wrong without the user noticing.

**Fix:** A `CrystalDisambiguationCard` appears between the NL input area and the canvas when Crystal detects an ambiguous reference. Crystal pauses building, shows the disambiguation card, and resumes once the user makes a selection.

#### Disambiguation Card UI

Appears below the NL input, above the canvas, with `opacity: 0 → 1, y: 8 → 0, 200ms` animation:

```
┌─────────────────────────────────────────────────────────────────────┐
│  [3px amber left border, bg: #FFFBEB, border: 1px solid #FDE68A]    │
│                                                                     │
│  ✦ Crystal needs a clarification                                    │  (14px semibold, amber-900)
│                                                                     │
│  Found 3 surveys matching "CSAT survey". Which one did you mean?   │  (13px regular, gray-700)
│                                                                     │
│  ○  CSAT Q3 2026          ● Active    412 responses               │
│  ○  CSAT Q2 2026          ● Closed    1,203 responses             │
│  ○  CSAT Mobile (Beta)    ● Active    89 responses                │
│                                                                     │
│  [ Cancel — use all CSAT surveys ]         [ Apply selection → ]   │
└─────────────────────────────────────────────────────────────────────┘
```

**Container:** `bg-amber-50 border border-amber-200 rounded-xl p-4 mx-0 mt-0 mb-4`. Left accent: `border-left: 3px solid #D97706` applied via pseudo-element (same pattern as thinking bar).

**Header:** `✦ Crystal needs a clarification` — `text-sm font-semibold text-amber-900`. Below: body text `text-sm text-gray-700`.

**Options list:** Each option is a radio row — `flex items-center gap-3 py-2 cursor-pointer`. Radio input (`accent-color: #7C3AED`), survey name (`text-sm font-medium text-gray-900`), status pill (same `AutomationStatusPill` component — Active/Closed), response count (`text-sm text-gray-500`). Hover: `bg-amber-50` → `bg-amber-100` transition 150ms.

**Buttons:**
- `[ Cancel — use all CSAT surveys ]`: `variant="ghost" size="sm" text-gray-600`. On click: dismiss card, proceed with `scope_type = 'tag_group', scope_tag = 'CSAT'` (broadens scope instead of picking one). Adds an annotation bullet: "I couldn't identify a single survey, so I set the scope to all CSAT surveys."
- `[ Apply selection → ]`: `variant="default" size="sm"`. Enabled only when a radio is selected. On click: dismiss card, update the trigger card's `scope_survey_id` and trigger card summary line, resume building remaining cards.

**When triggered:** CrystalOS `nl_to_workflow.py` returns `{ ambiguities: [{ type: 'survey_reference', query: 'CSAT survey', candidates: [...] }] }` instead of a `WorkflowSpec` when confidence < 0.7 on a survey match. The frontend `POST /api/workflows/crystal-build` response handler renders the disambiguation card for each ambiguity before proceeding.

**Multiple ambiguities:** If there are 2 ambiguities (e.g., survey reference + channel reference), they are shown as two stacked disambiguation cards, each with its own Apply button. The canvas building animation does not start until all ambiguities are resolved.

**Already-on-canvas trigger:** If a trigger card is already on the canvas (user switched to Visual Builder and back), and a disambiguation is needed, the existing trigger card shows the amber inline warning pattern (`⚠ Multiple surveys match...`) instead of the full disambiguation card.

#### API contract change
`POST /api/workflows/crystal-build` response:
```typescript
// Success path (no ambiguity):
{ spec: WorkflowSpec, action_proposal: {...} }

// Ambiguity path (new):
{
  ambiguities: Array<{
    type: 'survey_reference' | 'channel_reference' | 'metric_reference';
    query: string;             // the ambiguous text Crystal found
    field: string;             // which field this affects (e.g. 'scope_survey_id')
    candidates: Array<{
      id: string;
      label: string;
      meta: string;            // e.g. "Active · 412 responses"
      confidence: number;
    }>;
    fallback: {                // what Crystal will use if user clicks Cancel
      value: string;
      label: string;
    };
  }>;
  partial_spec?: WorkflowSpec; // spec with ambiguous fields null
}
```

#### New component
`CrystalDisambiguationCard` — `components/automations/builder/CrystalDisambiguationCard.tsx`. Props: `ambiguity: AmbiguityItem`, `onResolve: (value: string) => void`, `onCancel: () => void`.

---

### Fix 4 — Audience-Based Briefing Config

**Problem:** The "Tone" selector (Formal / Professional / Conversational) is a surface-level knob that doesn't actually change what goes in the briefing. Audience is the real variable — an executive summary needs fewer sections and a stronger headline; an analyst briefing needs all verbatims and the velocity chart.

**Fix:** Replace the `tone` field in the Generate Briefing config panel with an `audience` field. Three options: **Executive**, **Team**, **Analyst**. Each carries a default section preset and depth setting. Users can still customize sections after choosing an audience.

#### Updated Generate Briefing Config Panel (§2.4 replacement)

```
Template
  [ Weekly NPS Digest ▾ ]

Audience
  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │  👔  Executive       │  │  👥  Team            │  │  📊  Analyst         │
  │                     │  │                     │  │                     │
  │  Focused. Fewer      │  │  Balanced. All key  │  │  Full depth. All    │
  │  sections, stronger  │  │  sections, curated  │  │  sections + chart.  │
  │  headline.           │  │  verbatims.         │  │  All verbatims.     │
  │                     │  │                     │  │                     │
  │  ✓ Summary          │  │  ✓ Summary          │  │  ✓ Summary          │
  │  ✓ KPIs             │  │  ✓ KPIs             │  │  ✓ KPIs             │
  │  ✓ Top themes (3)   │  │  ✓ What Changed     │  │  ✓ What Changed     │
  │  ✓ Recommendations  │  │  ✓ Top themes (5)   │  │  ✓ Top themes (all) │
  │  ✗ Verbatims        │  │  ✓ Moments (2)      │  │  ✓ Moments (all)    │
  │  ✗ Velocity chart   │  │  ✓ Recommendations  │  │  ✓ Velocity chart   │
  │                     │  │  ✗ Velocity chart   │  │  ✓ Recommendations  │
  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘
       (selected state)

Time range
  [ Last 7 days ▾ ]

Scope override
  [ Use automation scope (Org-wide) ▾ ]

─────────────────────────────────────
Sections  (drag to reorder)
─────────────────────────────────────
⠿  [✓] Crystal Summary     required
⠿  [✓] KPI Row
⠿  [✓] What Changed         ← hidden for Executive by default
⠿  [✓] Top Themes (3)
⠿  [✗] Moments That Mattered ← hidden for Executive by default
⠿  [✓] Recommendations      required
⠿  [✗] Response Velocity Chart ← visible for Analyst by default
─────────────────────────────────────

Email preview (mini)
[...]
[ ✦ Generate live preview ]
```

**Audience selector cards:**
- Container row: `grid grid-cols-3 gap-3`
- Each card: `border rounded-xl p-3 cursor-pointer transition-all 200ms`
  - Unselected: `border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50`
  - Selected: audience-specific:
    - Executive: `border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200`
    - Team: `border-violet-300 bg-violet-50 ring-1 ring-violet-200`
    - Analyst: `border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200`
- Icon: 20px emoji + `text-xs font-bold text-gray-700 mt-1.5`
- Name: `text-sm font-semibold text-gray-900`
- Description: `text-xs text-gray-500 mt-0.5 leading-relaxed`
- Feature list: `mt-2 space-y-0.5` — `text-xs text-gray-600`, `✓` in green-600 or `✗` in gray-300

**Preset defaults per audience:**

| Section | Executive | Team | Analyst |
|---|---|---|---|
| Crystal Summary | ✓ (required) | ✓ (required) | ✓ (required) |
| KPI Row | ✓ | ✓ | ✓ |
| What Changed | ✗ | ✓ | ✓ |
| Top Themes | ✓ (max 3) | ✓ (max 5) | ✓ (all) |
| Moments That Mattered | ✗ | ✓ (2 max) | ✓ (all) |
| Response Velocity Chart | ✗ | ✗ | ✓ |
| Recommendations | ✓ (required, max 1) | ✓ (required, max 3) | ✓ (required, all) |

Selecting an audience resets the sections list to the preset (with a `200ms` fade-out/fade-in on the sections list). If the user has manually customized sections, changing audience shows: `"Switching audience will reset your section order. Continue?"` inline below the audience cards.

**Backend/CrystalOS contract change:**
The `generate_briefing` action config gains `audience` (replaces `tone`):
```typescript
// Before:
{ tone: 'professional', sections: [...] }

// After:
{ audience: 'executive' | 'team' | 'analyst', sections: [...] }
```
CrystalOS briefing templates use `audience` to control:
- Crystal Summary length: Executive (2 sentences), Team (3 sentences), Analyst (5+ sentences)
- Max themes: per preset table above
- Recommendation depth: Executive (headline only), Team (headline + 1 supporting sentence), Analyst (headline + full rationale + theme citations)
- Verbatim selection: none / curated / all above threshold

**Backward compatibility:** Existing automations with `tone` set should be migrated: `formal → executive`, `professional → team`, `conversational → analyst`. Migration is a one-time script run at deploy time.

#### Component updates
- `GenerateBriefingConfigPanel` — replace `tone` select with `AudienceSelector` sub-component.
- New: `AudienceSelector` — `components/automations/builder/config/AudienceSelector.tsx`. Props: `value: 'executive'|'team'|'analyst'`, `onChange: (v) => void`. Self-contained card grid with preset definitions.

---

### Fix 5 — Recommendation Outcome Loop

**Problem:** Crystal recommends actions but never learns whether they were taken. There's no way for a user to close the loop ("I did this, did it work?"), and no way for Crystal to measure whether its recommendations drive outcomes. The feedback button (thumbs up/down) on the briefing exists but is disconnected from recommendation-level outcomes.

**Fix:** Each recommendation in the web briefing view gets an action menu `[···]` with three options: **Mark as acted on**, **Dismiss**, **Snooze 1 week**. When acted on, Crystal tracks whether the underlying metric improved in the following briefing cycle and reports back.

#### Recommendation Card Action Menu

```
●  Address the billing FAQ gap immediately             [···]  ←  action menu button
   12 detractors mentioned billing clarity this week
   — up from 3 last week.

   [···] menu (popover, anchored top-right of card):
   ┌────────────────────────────────────────┐
   │  ✓  Mark as acted on                   │
   │  ✕  Dismiss (won't show again)         │
   │  ⏱  Snooze · 1 week                   │
   └────────────────────────────────────────┘
```

**`[···]` button:** `variant="ghost" size="icon"` (24×24px), `color: text-gray-400 hover:text-gray-600`. Popover: `Popover` from shadcn, `align="end"`, `sideOffset={4}`.

**Popover menu items:** Each is a `button` with `role="menuitem"`, `text-sm text-gray-700 hover:bg-gray-50`, icon + label. Icons: `check_circle` (green-600 on hover), `cancel` (red-400 on hover), `snooze` (amber-500 on hover). `width: 200px`, `border-radius: 8px`, `box-shadow: 0 4px 12px rgba(0,0,0,0.12)`.

#### "Acted on" State (within the same briefing)

After clicking "Mark as acted on":

```
●  Address the billing FAQ gap immediately            [✓ Acted on]
   12 detractors mentioned billing clarity this week
   — up from 3 last week.

   ✓ Marked as acted on · Jun 29 at 2:14 PM
   Crystal will report back in the next briefing.
```

- `[✓ Acted on]` badge: `bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 text-xs font-medium`
- Confirmation line: `text-xs text-gray-500 mt-1.5 flex items-center gap-1.5` with a `check_circle` icon in emerald-600
- The recommendation card dims slightly: `opacity: 0.85`
- API call: `POST /api/automations/:id/runs/:runId/recommendations/:recIndex/outcome` with `{ action: 'acted_on', acted_on_at: ISO8601 }`

#### Outcome Report in Next Briefing

In the **next briefing** that covers the same scope, Crystal adds an **Outcomes** section between "What Changed" and "Top Themes". This section only appears if there are acted-on recommendations from the prior cycle with measurable outcomes.

```
────────────────────────────────────────────────────────────────────
✦ FROM LAST WEEK                        How recommendations played out
────────────────────────────────────────────────────────────────────

✅  You addressed: billing FAQ gap

    THEN                NOW              CHANGE
    12 detractors       3 detractors     ↓ 75% drop
    mentioning billing  mentioning       in one week
                        billing

    Crystal's read: The FAQ improvements appear to have reduced billing
    confusion directly. Theme is no longer in the top 5 detractors.

    [View the 3 remaining responses]

────────────────────────────────────────────────────────────────────
```

**Outcomes section spec:**
- Section header: `text-xs uppercase tracking-widest text-gray-400 border-bottom`. "FROM LAST WEEK" left, "How recommendations played out" right.
- Each outcome card: `bg-emerald-50 border border-emerald-200 rounded-xl p-4`
  - Top: `✅ You addressed: {recommendation headline}` — `text-sm font-semibold text-gray-900`
  - Comparison table: 3-column. THEN: prior metric (red), NOW: current metric (green or gray), CHANGE: delta (green arrow + number). `text-xs` labels, `text-xl font-bold` values.
  - Crystal's narrative: 2-sentence interpretation. `text-sm text-gray-700 leading-relaxed mt-2`
  - Deep-link: `"View the {N} remaining responses"` → filtered response view
- If outcome is **ambiguous** (metric didn't move clearly): `bg-amber-50 border-amber-200`, `⚠ Outcome unclear — not enough signal yet. Crystal will continue tracking.`
- If outcome is **negative** (metric got worse): `bg-red-50 border-red-200`, `↑ Billing detractors increased. The recommendation may need a different approach.`

**Dismissed/snoozed behavior:**
- **Dismiss:** `POST /api/automations/:id/runs/:runId/recommendations/:recIndex/outcome` with `{ action: 'dismissed' }`. The recommendation is hidden (not shown in current or future briefings for this theme for 90 days). An undo toast appears: `"Recommendation dismissed. [Undo]"` — 5s, clicking sends `{ action: 'undismissed' }`.
- **Snooze 1 week:** `{ action: 'snoozed', snooze_until: ISO8601 }`. Recommendation re-appears in the next scheduled briefing after the snooze date with a `"↻ Snoozed last week"` badge.

**Backend additions:**
New table `recommendation_outcomes`:
```sql
CREATE TABLE recommendation_outcomes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  run_id          UUID NOT NULL REFERENCES workflow_runs(id),
  rec_index       INTEGER NOT NULL,            -- position in recommendations array
  rec_headline    TEXT NOT NULL,               -- snapshot for display
  theme_slug      TEXT,                        -- for metric tracking
  action          TEXT NOT NULL CHECK (action IN ('acted_on','dismissed','snoozed','undismissed')),
  acted_on_at     TIMESTAMPTZ,
  snooze_until    TIMESTAMPTZ,
  outcome_data    JSONB,                       -- populated by CrystalOS on next briefing run
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rec_outcomes_org ON recommendation_outcomes(org_id, acted_on_at DESC);
CREATE INDEX idx_rec_outcomes_theme ON recommendation_outcomes(org_id, theme_slug) WHERE action = 'acted_on';
```

CrystalOS briefing pipeline (`briefing_generator.py`) queries `recommendation_outcomes WHERE org_id = $1 AND action = 'acted_on' AND acted_on_at > now() - interval '14 days'` before generating each briefing. For each matched outcome, it computes the metric delta and appends the `outcomes` section if there are ≥1 outcomes with `outcome_data` computable.

#### New components
- `RecommendationActionMenu` — `components/automations/delivery/RecommendationActionMenu.tsx`. Popover menu with three actions.
- `RecommendationOutcomesSection` — `components/automations/delivery/RecommendationOutcomesSection.tsx`. The "FROM LAST WEEK" outcomes section in the briefing.

---

## Updated Component Inventory (v2.1 additions)

New components added by gap fixes:

| Component | File path | Gap |
|---|---|---|
| `SignalEvidencePanel` | `components/automations/SignalEvidencePanel.tsx` | Fix 1 |
| `RecommendationCard` | `components/automations/delivery/RecommendationCard.tsx` | Fix 2 |
| `EvidenceDrawer` | `components/automations/delivery/EvidenceDrawer.tsx` | Fix 2 |
| `CrystalDisambiguationCard` | `components/automations/builder/CrystalDisambiguationCard.tsx` | Fix 3 |
| `AudienceSelector` | `components/automations/builder/config/AudienceSelector.tsx` | Fix 4 |
| `RecommendationActionMenu` | `components/automations/delivery/RecommendationActionMenu.tsx` | Fix 5 |
| `RecommendationOutcomesSection` | `components/automations/delivery/RecommendationOutcomesSection.tsx` | Fix 5 |

---

## Updated Localization (v2.1 additions)

Add to `app/src/locales/en.ts` under the `automations` namespace:

```typescript
// Fix 1 — Signal Evidence
signalEvidence: {
  sectionTitle: '✦ SIGNAL EVIDENCE',
  whyFired: 'Why did Crystal fire this?',
  viewAllResponses: 'View all {count} contributing responses →',
  metricNegativeSentiment: 'Negative sentiment',
  metricResponsesFlagged: 'Responses flagged',
  metricConfidence: 'Confidence',
  threshold: 'threshold: {value}',
  sampleResponsesLabel: 'Sample responses that triggered this signal',
  collapse: '▲ Collapse',
  expand: '▼ Signal Evidence',
},

// Fix 2 — Evidence trails
evidenceDrawer: {
  header: '▼ See evidence ({count} responses)',
  viewAll: 'View all {count} responses →',
  close: '×',
},

// Fix 3 — Disambiguation
disambiguation: {
  title: '✦ Crystal needs a clarification',
  body: 'Found {count} surveys matching "{query}". Which one did you mean?',
  cancel: 'Cancel — use all {query} surveys',
  apply: 'Apply selection →',
},

// Fix 4 — Audience
audience: {
  label: 'Audience',
  executive: 'Executive',
  executiveDesc: 'Focused. Fewer sections, stronger headline.',
  team: 'Team',
  teamDesc: 'Balanced. All key sections, curated verbatims.',
  analyst: 'Analyst',
  analystDesc: 'Full depth. All sections + velocity chart.',
  switchWarning: 'Switching audience will reset your section order. Continue?',
},

// Fix 5 — Outcome loop
outcomes: {
  menuMarkActedOn: '✓ Mark as acted on',
  menuDismiss: '✕ Dismiss (won\'t show again)',
  menuSnooze: '⏱ Snooze · 1 week',
  actedOnBadge: '✓ Acted on',
  actedOnConfirmation: 'Marked as acted on · {date}',
  actedOnCrystalNote: 'Crystal will report back in the next briefing.',
  dismissedToast: 'Recommendation dismissed.',
  undoDismiss: 'Undo',
  snoozedBadge: '↻ Snoozed last week',
  outcomeSectionTitle: 'FROM LAST WEEK',
  outcomeSectionSubtitle: 'How recommendations played out',
  outcomeAddressed: '✅ You addressed: {headline}',
  outcomeThen: 'THEN',
  outcomeNow: 'NOW',
  outcomeChange: 'CHANGE',
  outcomeUnclear: '⚠ Outcome unclear — not enough signal yet. Crystal will continue tracking.',
  outcomeNegative: '↑ Metric got worse. The recommendation may need a different approach.',
  outcomeViewRemaining: 'View the {count} remaining responses',
},
```

---

---

## Gap Fixes — v2.2

**Version:** 2.2
**Addresses:** Fourteen UX gaps identified in the full 41-issue audit (2026-06-29). These complete the design coverage of all customer-experience and cross-review issues from `ISSUES_AND_FIXES.md`.
**Status:** Approved — applies retroactively to all phases.

---

### Fix 6 — Trigger Picker User-Language Groupings (ISS-025)

**Problem:** The `CanvasPalette` lists triggers as a flat list of technical names. A user building their first automation doesn't think "I need an `nps_threshold` trigger" — they think "I want something to happen when my score looks bad."

**Fix:** Group triggers in the palette under plain-English category headers, ordered by frequency of use.

```
ADD TO CANVAS — TRIGGERS

  WHEN SOMETHING LOOKS WRONG
  ┌──────────────────────────────────────────────────────────┐
  │  [📉]  NPS Drop or Rise                                  │
  │  [😞]  Sentiment Spike                                   │
  │  [📊]  Statistical Anomaly       [✦ Crystal]             │
  └──────────────────────────────────────────────────────────┘

  WHEN A NUMBER IS REACHED
  ┌──────────────────────────────────────────────────────────┐
  │  [#]   Response Count Reached                            │
  │  [📉]  Response Rate Drop                                │
  └──────────────────────────────────────────────────────────┘

  CRYSTAL DETECTS AUTOMATICALLY
  ┌──────────────────────────────────────────────────────────┐
  │  [✦]   New Theme Detected        [✦ Crystal]             │
  └──────────────────────────────────────────────────────────┘

  ON A SCHEDULE
  ┌──────────────────────────────────────────────────────────┐
  │  [🗓]  Schedule                                           │
  │  [▷]   Manual (run now)                                  │
  └──────────────────────────────────────────────────────────┘

  WHEN SOMETHING HAPPENS
  ┌──────────────────────────────────────────────────────────┐
  │  [📝]  Response Submitted                                │
  │  [⚙]   Survey Lifecycle                                  │
  └──────────────────────────────────────────────────────────┘
```

`[✦ Crystal]` badge — violet-100 bg, violet-700 text — marks Crystal Signal triggers. These are plan-gated: on Starter, they are shown but disabled with a tooltip `"Crystal Signals require Growth plan or above."` **Not hidden** — showing them upsells the tier.

The category headers and groupings are driven by `TriggerGroup` in the registry (see `docs/workflows/EXTENSIBILITY.md`). Adding a new trigger with a `group` field automatically places it in the correct section with no code change.

---

### Fix 7 — Cooldown UI in the Builder (ISS-026)

**Problem:** Every trigger has an invisible 60-minute cooldown (the system won't re-fire the same workflow within 60 minutes of the previous fire). Users have no way to see or change this, leading to "why didn't it fire again?" tickets.

**Fix:** Add a **Cooldown** field to every trigger config panel, below the trigger-specific fields.

```
── ALL TRIGGER PANELS (below trigger-specific config) ──────────────────

Cooldown (min time between fires)
  [ 60 min  ▾ ]
  (Select: 5 min / 15 min / 30 min / 60 min / 2h / 4h / 24h / None)

  ⓘ After firing, this workflow won't fire again for 60 minutes.
     Prevents alert fatigue during data spikes.
```

The default is `60 min`. Users who want real-time alerting on every response can set `None` (no cooldown). The info tooltip explains the purpose in plain language so users don't mistake it for a bug.

**State stored in:** `workflows.trigger_config.cooldown_minutes` — `null` = no cooldown, number = minutes. Zero is treated as `null`.

---

### Fix 8 — Crystal Builder Degradation Tiers (ISS-028)

**Problem:** Fix 3 (v2.1) only covers the "ambiguous input" tier — where Crystal can parse the request but needs clarification. Two other degradation cases have no UI: **partial parse** (Crystal built most of it but couldn't fill one field) and **total parse failure** (the request can't be built at all with current trigger/action types).

**Fix:** Define the full 3-tier degradation spec.

#### Tier 1 — Ambiguous (already in Fix 3)
Crystal parsed everything but found multiple matches for a named entity (e.g., two surveys named "CSAT"). Shows `CrystalDisambiguationCard`. Covered by v2.1 Fix 3.

#### Crystal Builder API Contract Extension (Tiers 2 + 3)

The existing `POST /api/automations/crystal-build` response (from v2.1 Fix 3) is extended:

```typescript
// POST /api/automations/crystal-build response (v2.2 extension)
{
  spec?: WorkflowSpec;         // Tier 1+2: full or partial spec
  ambiguities?: AmbiguityItem[];          // Tier 1 only (from v2.1 Fix 3)

  // NEW: Tier 2 — partial parse
  unfilled_fields?: Array<{
    field: string;          // e.g. "recipients"
    reason: string;         // e.g. "I don't know who should receive this."
    card_index: number;     // which canvas card (0-indexed) has the gap
    card_type: string;      // e.g. "send_email"
  }>;

  // NEW: Tier 3 — no parse
  no_parse_reason?: string;   // e.g. "Trigger on Zendesk ticket creation is not available."
  alternatives?: Array<{
    trigger_type: string;
    display_name: string;
    description: string;    // e.g. "Alert when sentiment spikes (similar pattern)"
  }>;

  parse_tier: 1 | 2 | 3;   // always present — tells the frontend which card to render
}
```

**Frontend card selection:**
- `parse_tier: 1` + `ambiguities` → render `CrystalDisambiguationCard` (v2.1 Fix 3)
- `parse_tier: 2` + `unfilled_fields` → render `CrystalPartialParseCard`
- `parse_tier: 3` + `no_parse_reason` + `alternatives` → render `CrystalNoParseCard`, canvas stays empty

**Component props:**
```typescript
interface CrystalPartialParseCardProps {
  unfilledFields: UnfilledField[];
  onDismiss: () => void;       // collapses to CrystalAnnotationCard
  onJumpToField: (cardIndex: number) => void; // selects card + focuses field
}

interface CrystalNoParseCardProps {
  reason: string;
  alternatives: AlternativeSuggestion[];
  onSelectAlternative: (triggerType: string) => void; // populates canvas
  onBuildManually: () => void; // switches to Visual Builder
}
```

#### Tier 2 — Partial Parse

Crystal built the workflow but left one or more fields as placeholders because it couldn't determine the value from the description.

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ Crystal built this, but needs a little more                  │
│                                                                 │
│  I've set up most of this automation, but couldn't fill in:     │
│                                                                 │
│  • Email recipients — I don't know who should receive this.     │
│    [→ Jump to Email action]                                     │
│                                                                 │
│  • Slack channel — I wasn't sure which channel to use.          │
│    [→ Jump to Slack action]                                     │
│                                                                 │
│  The canvas is ready — just complete the highlighted fields.   │
│                                  [Got it, I'll complete it →]  │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:** Canvas cards with unfilled fields show a `⚠` amber indicator on the card. The right panel highlights the empty field with `ring-2 ring-amber-400`. The automation cannot be enabled until all `⚠` fields are filled. "Got it" dismisses the Crystal card (it becomes a collapsed `CrystalAnnotationCard`), leaving the canvas-level warnings visible.

#### Tier 3 — No Parse

Crystal cannot map the request to any available trigger or action type.

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ I can't build this one yet                                   │
│                                                                 │
│  I understood your request, but it requires capabilities        │
│  that aren't available yet:                                     │
│                                                                 │
│  • Trigger on Zendesk ticket creation (not yet connected)       │
│                                                                 │
│  What I CAN do instead:                                         │
│  → Alert when sentiment spikes (similar pattern)                │
│  → Trigger on response submitted                                │
│                                                                 │
│  [Try one of these →]   [Build manually instead →]             │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:** Canvas stays empty. Crystal explains what it understood and why it can't build it, then surfaces 2 "What I CAN do instead" alternatives drawn from the capability registry. The user can accept an alternative (auto-populates the canvas with the closest match) or switch to Visual Builder.

---

### Fix 9 — Workflow Detail Page + Analytics Tab (ISS-030)

**Problem:** Run history exists (`/app/workflows/:id/runs`) but there is no workflow detail page — no single URL that shows the automation's overview, run history, and analytics in one place. The analytics view doesn't exist either.

**Fix:** Define the **workflow detail page** at `/app/workflows/:id` as a 3-tab container, and add the **Analytics** tab.

#### Workflow Detail Page Shell

Route: `/app/workflows/:id` (add as `AUTOMATION_DETAIL: '/app/workflows/:id'` to `routes.ts`)

```
┌────────────────────────────────────────────────────────────────────┐
│  ← Back to Hub                                                     │
├────────────────────────────────────────────────────────────────────┤
│  NPS Drop Alert                [● Active]    [Edit]  [···]         │
│  When NPS drops below 30 on CSAT Q3                                │
│  Created by Aisha Malone · Last fired 2h ago                       │
├────────────────────────────────────────────────────────────────────┤
│  [ Overview ]  [ Runs ]  [ Analytics ]                             │
├────────────────────────────────────────────────────────────────────┤
│  (tab content below)                                               │
└────────────────────────────────────────────────────────────────────┘
```

- **Overview tab:** Shows the automation canvas in read-only mode + the Live Preview Strip + the Signal Evidence Panel (if Crystal Signal). Edit button opens the builder.
- **Runs tab:** The existing `RunHistoryPage` content, embedded here.
- **Analytics tab:** See below.

`[Edit]` button: navigates to `/app/workflows/build?id=:id`. `[···]` menu: Enable/Disable, Pause, Pause Until…, Duplicate, Delete.

**Add to `WorkflowAnalyticsTab` props:**
```typescript
interface WorkflowAnalyticsTabProps {
  automationId: string;
  days?: number; // default 30
}
```

**Fix:** Add an **Analytics** tab to the workflow detail page.

```
┌────────────────────────────────────────────────────────────────────┐
│  NPS Drop Alert                [● Active]    [Edit]  [···]         │
│  When NPS drops below 30 on CSAT Q3                                │
├────────────────────────────────────────────────────────────────────┤
│  [ Overview ]  [ Runs ]  [ Analytics ]                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LAST 30 DAYS                                                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌─────────────┐   │
│  │ 14 fires   │  │ 100%       │  │ 14 actions │  │ 0 errors    │   │
│  │ total      │  │ success    │  │ delivered  │  │             │   │
│  └────────────┘  └────────────┘  └────────────┘  └─────────────┘   │
│                                                                     │
│  FIRE FREQUENCY                                                     │
│  [Sparkline bar chart — fires per day, last 30 days]                │
│  │ ▄ ░ ░ ▄ ░ ░ ▄ ░ ▄ ▄ ░ ░ ░ ▄ ▄ ░ ░ ░ ▄ ░ ░ ▄ ▄ ░ ░ ▄ ░ ░ ░ │   │
│                                                                     │
│  DELIVERY BY ACTION                                                  │
│  Slack #cx-alerts      14 / 14 sent    100%  ████████████████████   │
│  Jira ticket (CX)      14 / 14 created 100%  ████████████████████   │
│  Crystal Analysis      14 / 14 done    100%  ████████████████████   │
│                                                                     │
│  SLOWEST RUNS                                                        │
│  Jun 27 10:32 AM — 12,480ms   [View run]                           │
│  Jun 24  9:15 AM —  8,320ms   [View run]                           │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

**Endpoint:** `GET /api/automations/:id/analytics?days=30` — returns fire count, success rate, per-action delivery stats, fires-per-day timeseries, and slowest runs.

---

### Fix 10 — Creator Attribution + RBAC (ISS-031)

**Problem:** No creator is shown on workflow cards. Any org member can edit any workflow. There is no way to filter "automations I own."

**Fix:** Add three things:

**1. Creator avatar on cards:**
```
│  [⚡ WORKFLOW badge]    [A.M. ⚬] [● Active]              │
```
`[A.M. ⚬]` — 20px avatar (initials or photo) of the creator. Tooltip: "Created by Aisha Malone". On hover, shows a `···` menu that includes "Transfer ownership."

**2. Three RBAC roles (defined in `docs/workflows/ARCHITECTURE.md`):**
- **Creator** — full edit + delete + enable/disable
- **Editor** — full edit, no delete, no transfer
- **Viewer** — read-only (can view runs and briefings, cannot edit)

Role is set per-automation. Default: org admins are Creator. The user who creates an automation is its Creator.

**3. "Created by me" filter:**
Add to the hub tab bar:
```
[ All ]  [ Active ]  [ Briefings ]  [ Workflows ]  [ Error ]  [ Mine ]
```
`Mine` tab filters to `created_by = current_user_id OR editor_of = current_user_id`.

---

### Fix 11 — Test with Real Historical Events (ISS-032)

**Problem:** TestModePanel only accepts manually typed values. For complex triggers (e.g., `sentiment_spike`), the user has no idea what realistic values to enter.

**Fix:** Add a "Load from last real fire" dropdown to the test panel.

```
┌────────────────────────────────────────────────────────────┐
│  Test Run                                             [×]  │
│  ──────────────────────────────────────────────────────    │
│                                                            │
│  SIMULATE TRIGGER CONTEXT                                  │
│                                                            │
│  Load from:  [ Enter values manually  ▾ ]                  │
│              ┌──────────────────────────────────────────┐  │
│              │ Enter values manually                    │  │
│              │ ─────────────────────────────────────    │  │
│              │ ✓ Jun 27 10:32 AM (NPS: 27.4, n=412)    │  │
│              │   Jun 24  9:15 AM (NPS: 29.1, n=388)    │  │
│              │   Jun 20 11:00 AM (NPS: 31.0, n=401)    │  │
│              └──────────────────────────────────────────┘  │
│                                                            │
│  NPS score:      [ 27.4          ]  (pre-filled)           │
│  Response count: [ 412           ]  (pre-filled)           │
│  Window:         [ 24h ▾         ]  (pre-filled)           │
│                                                            │
```

When a historical event is selected, all form fields pre-fill with the actual values from that run. This lets the user re-run with identical conditions to reproduce a past fire and verify the actions behave correctly.

**Endpoint:** `GET /api/automations/:id/runs?status=success&limit=3` — the same runs endpoint, filtered to successful runs, used to populate the dropdown.

---

### Fix 12 — Bulk Operations (ISS-033)

**Problem:** The card grid only supports individual card actions. Org admins managing 50+ automations need to bulk-enable, bulk-pause, or bulk-delete.

**Fix:** Multi-select mode activated by hovering over any card and clicking a new checkbox, or via a `Select all` control.

```
┌────────────────────────────────────────────────────────────────────┐
│  Automation Hub              ☐ Select all   3 selected             │
│  ─────────────────────────────────────────────────────────────     │
│  ╔══════════════════════╗  ┌──────────────────────┐                │
│  ║ ☑ NPS Drop Alert     ║  │ ☑ Weekly NPS Digest  │                │
│  ║ [⚡ WORKFLOW badge]  ║  │ [✦ BRIEFING badge]   │                │
│  ║ ...                  ║  │ ...                  │                │
│  ╚══════════════════════╝  └──────────────────────┘                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  [▶ Enable]  [⏸ Pause]  [⋯ Duplicate]  [🗑 Delete (3)]       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ↑ Bulk action bar — fixed at bottom of page when ≥1 selected       │
└────────────────────────────────────────────────────────────────────┘
```

Selected cards show a `2px indigo ring` (`ring-2 ring-indigo-500`). Bulk action bar slides up from the bottom of the viewport (`position: fixed, bottom: 0`). Delete shows a confirmation: `"Delete 3 automations? This cannot be undone."` with explicit `Delete 3` CTA.

---

### Fix 13 — "Check Trigger Now" Button (ISS-034)

**Problem:** After configuring a trigger, the user has no way to know if it would fire right now with current data, without waiting for the scheduler. The test mode requires entering values manually; it doesn't check live data.

**Fix:** Add a `"Would this fire right now?"` button to each trigger config panel.

```
── NPS THRESHOLD CONFIG PANEL (bottom) ──────────────────────────────

[  ▷ Would this fire right now?  ]    ← secondary button, full width

(on click, calls GET /api/automations/:id/trigger-check — evaluates
 the trigger against current live data, returns within ~2s)

─── RESULT ──────────────────────────────────────────────────────────

✓  YES — would fire now
   Current NPS: 27.4 (threshold: 30, direction: below ✓)
   Response count in window: 412 ✓

OR:

✕  NO — would not fire now
   Current NPS: 34.2 (threshold: 30, direction: below ✗)
   NPS needs to drop 4.2 more points to trigger.
   (Checked at 10:47 AM just now)
```

The result auto-dismisses after 60 seconds (shown with a progress bar). The user can click `Recheck` to run again with the latest data.

---

### Fix 14 — Template Usage Stats (ISS-035)

**Problem:** The `TemplateGallery` shows 16 templates with name + description only. Users have no signal to distinguish proven templates from ones no one uses.

**Fix:** Add social proof signals to each `TemplateCard`.

```
┌──────────────────────────────────────────┐
│  ⭐ FEATURED                              │
│                                          │
│  Weekly NPS Digest                       │
│  Delivered every Monday at 9 AM to       │
│  the whole CX team.                      │
│                                          │
│  Installed by 240+ orgs   ★★★★★ (4.8)   │
│  [Use this template →]                   │
└──────────────────────────────────────────┘
```

**Fields added to template data:**
- `installed_count` — aggregated install count (fetched from marketplace endpoint)
- `avg_rating` — float 0–5, from outcome loop feedback signals
- `featured` — boolean, manually curated, shown as `⭐ FEATURED` badge at top of card

The `TemplateGallery` sorts by `featured DESC, installed_count DESC` by default. A search/filter bar at the top allows filtering by trigger type or action category.

---

### Fix 15 — Integration Dependency Warning (ISS-037)

**Problem:** If a user disconnects Slack from their integrations page, all automations that use Slack silently fail at runtime. There is no pre-deletion warning and no recovery UX.

**Fix:** Two changes:

**1. Integration deletion warning:**
When the user attempts to delete an integration, before confirming, show:
```
⚠ Deleting this integration will affect 3 automations:
  • NPS Drop Alert (Slack Message action)
  • Weekly NPS Digest (Deliver via Slack action)
  • Theme Spike Alert (Slack Message action)

These automations will error on their next run.

[ Cancel ]   [ Delete anyway + pause affected automations ]
```

The "Delete anyway" option pauses all affected automations immediately rather than letting them fail at runtime.

**2. Missing integration badge on canvas cards:**
If a canvas action card references an integration that is not connected for this org, the card shows:
```
┌────────────────────────────────────────┐
│  ⚠ SLACK MESSAGE             [● Error] │
│  Integration not connected             │
│  [Connect Slack ↗]                     │
└────────────────────────────────────────┘
```

This is a persistent warning (not dismissable) that appears in the builder and in the hub card's action icons row (the Slack icon gets an amber `⚠` overlay).

---

### Fix 16 — Keyboard Shortcuts (ISS-039)

**Problem:** The accessibility section covers focus and ARIA but not keyboard shortcuts for power users in the builder.

**Fix:** Define the keyboard shortcut set for the builder.

| Shortcut | Action |
|----------|--------|
| `A` | Open "Add action/condition" dropdown (when canvas focused) |
| `Delete` / `Backspace` | Delete selected canvas card (shows confirm dialog) |
| `Cmd/Ctrl + S` | Save automation |
| `Cmd/Ctrl + Enter` | Enable automation (if saved and valid) |
| `Cmd/Ctrl + Z` | Undo last canvas change |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + D` | Duplicate selected canvas card |
| `Escape` | Deselect / close right panel |
| `?` | Show keyboard shortcut cheatsheet overlay |

Keyboard shortcut cheatsheet (`?` key):
```
┌───────────────────────────────────────────┐
│  Keyboard shortcuts                  [×]  │
│                                           │
│  A           Add action/condition         │
│  Delete      Remove selected card         │
│  ⌘S          Save                        │
│  ⌘↵          Enable automation           │
│  ⌘Z / ⌘⇧Z   Undo / Redo                 │
│  ⌘D          Duplicate card              │
│  Esc         Deselect                    │
│  ?           Show this panel             │
└───────────────────────────────────────────┘
```

The cheatsheet is a `Dialog` (shadcn) with `role="dialog"` and `aria-label="Keyboard shortcuts"`.

---

### Fix 17 — Pause Until Date (ISS-040)

**Problem:** The status pills include `Paused` but the `···` card menu only has "Pause" as a toggle. There is no "Pause until [date]" option, so users who want to pause for a vacation or planned maintenance must remember to manually re-enable.

**Fix:** Add "Pause until…" option to the card `···` menu.

```
Card ··· menu:
  ┌─────────────────────────────────────┐
  │  Edit                               │
  │  ─────────────────────────────────  │
  │  ▶ Enable now                       │
  │  ⏸ Pause now                        │
  │  ⏸ Pause until…              [new]  │
  │  ─────────────────────────────────  │
  │  ⋯ Duplicate                        │
  │  ─────────────────────────────────  │
  │  🗑 Delete                           │
  └─────────────────────────────────────┘
```

"Pause until…" opens a `Popover` date picker (shadcn `Calendar`):
```
Pause until
[ June 2026 calendar — date picker ]

[ Cancel ]  [ Pause until Jul 7 ]
```

When a scheduled resume is active, the card status pill changes to:
```
[ ⏸ Paused until Jul 7 ]
```

with amber background (`bg-amber-50 text-amber-700`). The system resumes the automation automatically at midnight of the selected date in the automation's configured timezone.

**State stored in:** `workflows.paused_until TIMESTAMPTZ NULL` — `NULL` = not scheduled to resume. The scheduler checks this field each tick and re-enables automations past their `paused_until` timestamp.

**Timezone for resume calculation:** For `schedule` trigger automations, midnight is computed in `trigger_config.timezone`. For all other trigger types (NPS threshold, sentiment spike, etc.) that have no configured timezone, midnight is computed in the org's default timezone (`organizations.default_timezone`, defaulting to `'UTC'` if not set). This ensures a consistent, predictable resume time regardless of trigger type.

---

## Updated Component Inventory (v2.2 additions)

| Component | File path | Gap fix |
|---|---|---|
| `TriggerGroupHeader` | `components/automations/builder/TriggerGroupHeader.tsx` | Fix 6 |
| `CooldownSelect` | `components/automations/builder/config/CooldownSelect.tsx` | Fix 7 |
| `CrystalPartialParseCard` | `components/automations/builder/CrystalPartialParseCard.tsx` | Fix 8 Tier 2 |
| `CrystalNoParseCard` | `components/automations/builder/CrystalNoParseCard.tsx` | Fix 8 Tier 3 |
| `WorkflowAnalyticsTab` | `pages/automations/WorkflowAnalyticsTab.tsx` | Fix 9 |
| `BulkActionBar` | `components/automations/BulkActionBar.tsx` | Fix 12 |
| `SelectableCard` | `components/automations/SelectableCard.tsx` | Fix 12 |
| `TriggerCheckButton` | `components/automations/builder/config/TriggerCheckButton.tsx` | Fix 13 |
| `KeyboardShortcutsDialog` | `components/automations/builder/KeyboardShortcutsDialog.tsx` | Fix 16 |
| `PauseUntilPopover` | `components/automations/PauseUntilPopover.tsx` | Fix 17 |

---

## Updated Localization (v2.2 additions)

Add to `app/src/locales/en.ts` under the `automations` namespace:

```typescript
// Fix 6 — Trigger groups
triggerGroups: {
  alerts: 'When something looks wrong',
  thresholds: 'When a number is reached',
  aiSignals: 'Crystal detects automatically',
  scheduled: 'On a schedule',
  events: 'When something happens',
  crystalBadge: 'Crystal',
  tierGate: 'Crystal Signals require Growth plan or above.',
},

// Fix 7 — Cooldown
cooldown: {
  label: 'Cooldown (min time between fires)',
  none: 'None',
  hint: 'After firing, this workflow won\'t fire again for {duration}. Prevents alert fatigue during data spikes.',
},

// Fix 8 — Degradation tiers
crystalDegrade: {
  partialTitle: '✦ Crystal built this, but needs a little more',
  partialBody: "I've set up most of this automation, but couldn't fill in:",
  partialCta: 'Got it, I\'ll complete it →',
  noParseTile: '✦ I can\'t build this one yet',
  noParseBody: 'I understood your request, but it requires capabilities that aren\'t available yet:',
  canDoInstead: 'What I CAN do instead:',
  tryAlternative: 'Try one of these →',
  buildManually: 'Build manually instead →',
},

// Fix 9 — Analytics tab
analytics: {
  tabLabel: 'Analytics',
  last30Days: 'Last 30 days',
  fires: '{count} fires',
  successRate: '{pct}% success',
  actionsDelivered: '{count} actions delivered',
  errors: '{count} errors',
  fireFrequency: 'Fire frequency',
  deliveryByAction: 'Delivery by action',
  slowestRuns: 'Slowest runs',
},

// Fix 10 — RBAC
rbac: {
  createdBy: 'Created by {name}',
  transferOwnership: 'Transfer ownership',
  mineTab: 'Mine',
  roles: {
    creator: 'Creator',
    editor: 'Editor',
    viewer: 'Viewer',
  },
},

// Fix 12 — Bulk operations
bulk: {
  selectAll: 'Select all',
  nSelected: '{count} selected',
  selectCardAriaLabel: 'Select {name}',
  enable: '▶ Enable',
  pause: '⏸ Pause',
  duplicate: '⋯ Duplicate',
  delete: '🗑 Delete ({count})',
  deleteConfirmTitle: 'Delete {count} automations?',
  deleteConfirmBody: 'These automations will be removed. They are soft-deleted and can be restored within 30 days from Settings → Deleted automations.',
  deleteConfirmCta: 'Delete {count}',
},

// Fix 11 — Test with history
testMode: {
  loadFromLabel: 'Load from:',
  loadManually: 'Enter values manually',
  prefilledNote: '(pre-filled)',
},

// Fix 13 — Trigger check
triggerCheck: {
  cta: '▷ Would this fire right now?',
  loading: 'Checking against live data…',
  yesTitle: '✓  YES — would fire now',
  noTitle: '✕  NO — would not fire now',
  checkedAt: 'Checked at {time} just now',
  recheck: 'Recheck',
},

// Fix 15 — Integration dependency warning
integrationWarning: {
  deletionTitle: 'This integration is used by automations',
  deletionBody: 'Deleting this integration will affect {count} automation{s}:',
  deleteAnyway: 'Delete anyway + pause affected automations',
  cancelDelete: 'Cancel',
  missingBadge: 'Integration not connected',
  connectCta: 'Connect {integrationName} ↗',
},

// Fix 16 — Keyboard shortcuts
shortcuts: {
  title: 'Keyboard shortcuts',
  add: 'Add action/condition',
  delete: 'Remove selected card',
  save: 'Save',
  enable: 'Enable automation',
  undo: 'Undo',
  redo: 'Redo',
  duplicate: 'Duplicate card',
  deselect: 'Deselect',
  showShortcuts: 'Show this panel',
},

// Fix 17 — Pause until
pauseUntil: {
  menuItem: 'Pause until…',
  popoverTitle: 'Pause until',
  cancelBtn: 'Cancel',
  confirmBtn: 'Pause until {date}',
  pillLabel: '⏸ Paused until {date}',
},
```

---

---

## Template Authoring Framework

**Design goal:** Adding a new template should require creating **one file**. No frontend code, no migration, no registration call. Drop a `.template.ts` file in the right folder and it appears in the gallery on next deploy.

This mirrors the Automation Capability Registry pattern from `docs/workflows/EXTENSIBILITY.md`.

---

### Template Definition File

```typescript
// backend/src/registry/templates/timely.template.ts
import { TemplateDefinition, TemplateCategory } from '../types';

export const timelyTemplate: TemplateDefinition = {
  id: 'timely',                          // stable, used in DB + URL params
  name: 'Timely',
  description: 'Crystal writes your weekly CX brief every Monday — NPS, themes, what changed, and recommended actions.',
  category: TemplateCategory.BRIEFINGS,
  automationType: 'briefing',            // 'workflow' | 'briefing'
  featured: true,
  minTier: 'starter',
  tags: ['nps', 'weekly', 'briefing', 'cx', 'team'],

  // Pre-filled spec — identical shape to WorkflowSpec from crystal-build
  spec: {
    trigger: {
      type: 'schedule',
      config: {
        frequency: 'weekly',
        days: ['monday'],
        hour: 9,
        minute: 0,
        ampm: 'AM',
        timezone: '__ORG_DEFAULT__',     // placeholder — replaced with org's default timezone on install
      }
    },
    actions: [
      {
        type: 'generate_report',
        config: {
          template_id: 'weekly_nps_digest',
          audience: 'team',
          time_range: 'last_7_days',
        }
      },
      {
        type: 'send_email',
        config: {
          recipients: '__INSTALL_PROMPT__',  // empty — user prompted in builder after install
          subject: 'Weekly CX Briefing — {{survey.name}}',
        }
      },
      {
        type: 'notify_in_app',
        config: { always_on: true }
      }
    ]
  },

  // Fields that require user input after installing — builder highlights these
  requiredOnInstall: [
    { field: 'actions[1].config.recipients', label: 'Who should receive this briefing?', card: 1 }
  ],
};

export default timelyTemplate;
```

---

### Placeholder Values

Two special placeholder strings are used in template specs:

| Placeholder | Replaced with |
|---|---|
| `'__ORG_DEFAULT__'` | The org's default timezone (`organizations.default_timezone`), set at install time |
| `'__INSTALL_PROMPT__'` | Leaves the field empty; builder shows amber `⚠` on the card and lists it in the Crystal annotation card |
| `'__SURVEY_SCOPE__'` | The survey selected in the builder's scope block |

---

### Template Versioning Policy

Installed automations are pinned to the template spec at install time. Template updates do NOT auto-update installed automations. The `TemplateDefinition` has a `version: string` field (semver). When a template is updated and the new version has breaking changes (removed required field, changed trigger type), the template registry increments the major version. The `GET /api/automations/templates/:id` response includes `latest_version` and the installed automation's `installed_at_version`. A non-blocking in-app notification is shown to the creator: "A newer version of the \"Timely\" template is available. [Review changes]" — the creator can choose to re-install the new version (creates a new draft) or dismiss.

<!-- ENT-021 applied -->

### Template Registry Auto-Loader

```typescript
// backend/src/registry/templates/index.ts
const modules = import.meta.glob('./*.template.ts', { eager: true });
export const templateRegistry: TemplateDefinition[] = Object.values(modules)
  .map((mod: any) => mod.default ?? Object.values(mod)[0])
  .filter(Boolean)
  .sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (b.installed_count ?? 0) - (a.installed_count ?? 0);
  });
```

**CommonJS fallback for Node.js runtime:** The `import.meta.glob` loader above is for Vite/ESBuild only and does NOT work in the Node.js production backend or test runner. The backend uses a CommonJS-compatible loader at runtime:

```typescript
// backend/src/registry/templates/index.cjs.ts
// CommonJS fallback for Node.js (non-Vite environments, e.g., tests, prod server)
import * as fs from 'fs';
import * as path from 'path';

const templateDir = path.join(__dirname);
export const templateRegistry: TemplateDefinition[] = fs
  .readdirSync(templateDir)
  .filter(f => f.endsWith('.template.ts') || f.endsWith('.template.js'))
  .map(f => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(path.join(templateDir, f));
    return mod.default ?? Object.values(mod)[0];
  })
  .filter(Boolean);
```

The production entry point at `backend/src/registry/templates/index.ts` re-exports from the CommonJS loader. The `import.meta.glob` version is for frontend tooling only (if templates are ever surfaced client-side).

<!-- ENT-022 applied -->

**Adding a new template — complete checklist:**

```
□  Create backend/src/registry/templates/{id}.template.ts
□  Fill in: id, name, description, category, spec, requiredOnInstall
□  Set minTier (starter / growth / enterprise)
□  Set featured: true if it should appear in the featured row
□  Run: npm run generate-template-preview {id}  ← generates the thumbnail
□  Deploy — template appears in gallery automatically
```

No frontend code, no migration, no registration call. The gallery renders from `GET /api/automations/templates` which returns the full registry.

---

### Template API Endpoints

```
GET  /api/automations/templates              — full catalog (filtered by org tier)
GET  /api/automations/templates/:id         — single template spec
POST /api/automations/templates/:id/install — increments installed_count, returns pre-filled WorkflowSpec
```

`POST /api/automations/templates/:id/install` response:
```typescript
{
  spec: WorkflowSpec;              // pre-filled, placeholders resolved
  automation_id: string;           // draft automation created in DB (status: 'draft')
  required_on_install: Array<{ field, label, card_index }>;
  builder_url: string;             // '/app/workflows/build?id={automation_id}'
}
```

The builder opens at `builder_url` with the draft pre-populated. The user configures the `required_on_install` fields and clicks Enable.

---

### Template Preview Thumbnail Generator

```bash
# Generates a 320×200px SVG skeleton for the template card preview
npm run generate-template-preview timely

# Output: backend/src/registry/templates/previews/timely.svg
# The SVG shows: section count, audience badge, trigger label — no real data
```

The thumbnail is served as a static asset and shown in the template card. It updates automatically when the template spec changes (section count, audience, etc.).

---

## Simplified Workflow Creation, Testing, and Productionizing

**Design goal:** A new user should be able to go from zero to a live, tested automation in under 5 minutes. An existing user should be able to clone, modify, and re-enable in under 2 minutes.

---

### Builder Status Model

Automations have three states in the builder lifecycle:

```
[Draft] ──────► [Validated] ──────► [Active]
   ↑                 ↑                  │
   └── edit ─────────┘                  │
                                        └── Disable → [Paused]
                                        └── Error  → [Error]
```

| State | What it means | UI indicator |
|---|---|---|
| **Draft** | Not yet tested or enabled. Can have empty required fields. | `○ Draft` gray pill in builder header |
| **Validated** | At least one successful test run. No `⚠` unfilled fields. | `✓ Validated` green pill |
| **Active** | Enabled — running live. | `● Active` green pill |
| **Paused** | Manually paused or paused-until date. | `⏸ Paused` amber pill |
| **Error** | Last run failed. Requires attention. | `✕ Error` red pill |

---

### Pre-Flight Checklist (Before First Enable)

When the user clicks `Enable →` for the first time (state = Draft), instead of enabling immediately, show a **pre-flight modal**:

```
┌──────────────────────────────────────────────────────────────────┐
│  Before going live                                          [×]  │
│  ────────────────────────────────────────────────────────────    │
│                                                                  │
│  ✓  Trigger configured                                           │
│     NPS drops below 28 on CSAT Q3 · 24h window                  │
│                                                                  │
│  ✓  Actions configured                                           │
│     Slack #cx-alerts · Jira CX project                          │
│                                                                  │
│  ✓  Integrations connected                                       │
│     Slack ✓  ·  Jira ✓                                          │
│                                                                  │
│  ⚠  Not yet tested                                               │
│     You haven't run a test yet. We recommend testing             │
│     before going live so you can see exactly what fires.         │
│     [▷ Run a test now]   [Skip and enable anyway]               │
│                                                                  │
│  ─────────────────────────────────────────────────────────────   │
│                                                                  │
│  ✓  Cooldown: 60 minutes                                         │
│  ✓  No missing required fields                                   │
│                                                                  │
│              [ ✓ Enable automation → ]                           │
└──────────────────────────────────────────────────────────────────┘
```

**Checklist items (auto-evaluated):**

| Check | Pass condition | Failure behaviour |
|---|---|---|
| Trigger configured | All required fields non-empty | Blocks enable, deep-links to trigger card |
| Actions configured | All action cards have no `⚠` fields | Blocks enable, lists which cards need input |
| Integrations connected | All `requiresIntegration` checks pass | Blocks enable with `[Connect {name} →]` link |
| Tested | At least one `dry_run` run exists for this automation | Warning only — can skip |
| Cooldown set | `cooldown_minutes` is non-null | Informational — shown for awareness |

**First-time automation checklist** passes when all blocking items are green. The `Enable automation →` button is disabled (grayed out) until all blocking checks pass.

If the user clicks `Enable →` on a **previously-active** automation (re-enabling after a pause), skip the pre-flight modal — they've already validated it.

---

### Guided Quick-Start Sidebar (New Builder Only)

For brand-new automations (never saved before), a collapsible quick-start panel appears at the bottom of the left panel:

```
┌─────────────────────────────────────────────────────┐
│  ✦ Quick start guide           [collapse ▲]          │
│  ─────────────────────────────────────────────────   │
│  1  ✓  Choose automation type                        │
│  2  →  Set your trigger                              │  ← current step (indigo)
│  3  ○  Add actions                                   │
│  4  ○  Test it                                       │
│  5  ○  Enable                                        │
│  ─────────────────────────────────────────────────   │
│  Tip: Click a trigger card on the canvas to          │
│  configure it in the right panel.                    │
└─────────────────────────────────────────────────────┘
```

Steps advance automatically as the user completes them (trigger configured → step 2 checked, action added → step 3 checked, test run → step 4 checked). The panel collapses automatically after step 5 (first enable). It never reappears for that automation.

Closing it manually removes it permanently for the session. It does NOT reappear on subsequent visits to the same automation.

---

### One-Click Clone and Modify

Any automation in the hub can be duplicated from the card `···` menu → **`⋯ Duplicate`**.

Duplicating creates a new Draft automation with:
- All trigger + action config copied
- Name suffixed with ` (copy)`
- `status: 'draft'` — must be re-enabled explicitly
- `installed_count` reset to 0 (it's a new automation, not an install)

The builder opens immediately on the duplicate, in the same state as if the user just installed a template. This is the fastest path for "I want the same automation but for a different survey."

---

### Staged Rollout (Dry Run → Live)

For high-impact automations (webhook, Jira, Zendesk, close_survey actions), the pre-flight checklist adds a **staged rollout** option:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠  This automation has high-impact actions                     │
│     (Zendesk ticket creation, close_survey)                     │
│                                                                 │
│  Recommended: start with a 24-hour observation period.          │
│  Your automation will evaluate conditions but not execute        │
│  actions — you'll see exactly what would have fired and what    │
│  it would have done.                                            │
│                                                                 │
│  ○  [⦿ Start with 24h observation]   (recommended)             │
│  ○  [  Enable fully now]                                        │
└─────────────────────────────────────────────────────────────────┘
```

**24h observation mode:** `status = 'observing'`. The scheduler evaluates all conditions on the normal schedule and writes `dry_run` run records with full rendered action payloads — but does NOT execute any actions. After 24 hours, status automatically transitions to `enabled`. The user receives an in-app notification: `"NPS Drop Alert observed 3 fires overnight — no actions were taken. Review the runs and enable fully if you're satisfied."`.

This is particularly important for `close_survey` and `create_zendesk_ticket` — actions that are hard to reverse.

---

### Localization (New Strings)

Add to `app/src/locales/en.ts` under the `automations` namespace:

```typescript
// Pre-flight checklist
preflight: {
  title: 'Before going live',
  checkTrigger: 'Trigger configured',
  checkActions: 'Actions configured',
  checkIntegrations: 'Integrations connected',
  checkTested: 'Not yet tested',
  checkTestedPass: 'Test run completed',
  checkTestedWarning: 'You haven\'t run a test yet. We recommend testing before going live.',
  runTestNow: '▷ Run a test now',
  skipAndEnable: 'Skip and enable anyway',
  checkCooldown: 'Cooldown: {duration}',
  checkNoMissingFields: 'No missing required fields',
  enableCta: '✓ Enable automation →',
},

// Builder status states
builderStatus: {
  draft: '○ Draft',
  validated: '✓ Validated',
  active: '● Active',
  paused: '⏸ Paused',
  error: '✕ Error',
  observing: '◎ Observing',
},

// Quick-start guide
quickStart: {
  title: '✦ Quick start guide',
  collapse: 'collapse',
  step1: 'Choose automation type',
  step2: 'Set your trigger',
  step3: 'Add actions',
  step4: 'Test it',
  step5: 'Enable',
},

// Staged rollout
stagedRollout: {
  warning: 'This automation has high-impact actions',
  body: 'Recommended: start with a 24-hour observation period.',
  observeOption: 'Start with 24h observation',
  observeRecommended: '(recommended)',
  enableNow: 'Enable fully now',
  observingNotification: '{name} observed {count} fires overnight — no actions were taken. Review the runs and enable fully if you\'re satisfied.',
},

// Duplicate
duplicate: {
  nameSuffix: ' (copy)',
  toast: 'Automation duplicated — review and enable when ready.',
},
```

---

## Updated Component Inventory (Template + Productionizing additions)

| Component | File path | Purpose |
|---|---|---|
| `TemplateCard` | `components/automations/TemplateCard.tsx` | Individual card in gallery — updated to show rating, tier badge, featured star |
| `TemplateSearchBar` | `components/automations/TemplateSearchBar.tsx` | Search input inside gallery modal |
| `TemplateCategoryTabs` | `components/automations/TemplateCategoryTabs.tsx` | Category filter tabs — driven by registry, no hardcoded list |
| `PreflightModal` | `components/automations/PreflightModal.tsx` | Pre-enable checklist modal |
| `PreflightCheckRow` | `components/automations/PreflightCheckRow.tsx` | Individual check row (pass/warn/fail state) |
| `StagedRolloutChoice` | `components/automations/StagedRolloutChoice.tsx` | Observe vs enable-now choice inside pre-flight |
| `QuickStartGuide` | `components/automations/builder/QuickStartGuide.tsx` | Collapsible step guide in left panel |
| `BuilderStatusPill` | `components/automations/builder/BuilderStatusPill.tsx` | Draft/Validated/Active pill in builder header |

---

*This document is the single source of truth for the Automation Hub design. Any implementation question not answered here should be resolved by consulting Rohan Desai (UX) or Elias Park (Engineering) before building, not after.*
