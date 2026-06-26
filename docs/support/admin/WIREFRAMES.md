# Experient Docs Admin Pipeline — UI Wireframes

**Route:** `/admin/support/pipeline`
**Role gate:** `org:admin`
**Status:** Specification — ready for frontend implementation
**Companion docs:** [CONTENT_ENGINE.md](../CONTENT_ENGINE.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [DESIGN.md](../DESIGN.md)

---

## Document Purpose

This file is the single engineering source of truth for the Docs Admin Pipeline UI. It specifies all six screens a frontend engineer needs to build: layout, component composition, design-token annotations, interaction behavior, keyboard shortcuts, and the API surface that populates each view.

The pipeline turns every git push into a live doc through the following state machine:

```
Queued → Extracting → Drafting → QualityCheck
       → AutoApproved / PendingReview / RequiresAnnotation / Rejected
       → Publishing → Live → Stale
```

Admins interact with docs in the `PendingReview`, `RequiresAnnotation`, and `Stale` states primarily. `AutoApproved` docs appear in the feed but require no action unless the admin wants to override.

---

## Design System Reference

All annotations in this document use the following tokens verbatim. Engineers must not substitute arbitrary values.

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#2a4bd9` | CTA buttons, active nav, links |
| `--color-tertiary` | `#8329c8` | Gradient endpoint, accent badges |
| `--color-secondary` | `#00647c` | Secondary actions, teal accents |
| `--color-surface` | `#f5f7f9` | Page background, inactive rows |
| `--color-surface-container-lowest` | `#ffffff` | Cards, panels, modal backgrounds |
| `--color-on-surface` | `#2c2f31` | Body text, headings |
| `--color-on-surface-variant` | `#595c5e` | Muted text, timestamps, doc keys |
| `--color-success` | `#059669` | Approved states, live badge, positive trends |
| `--color-warning` | `#d97706` | PendingReview, amber quality scores |
| `--color-error` | `#b41340` | Rejected, RequiresAnnotation, destructive actions |
| Gradient | `linear-gradient(135deg, #2a4bd9, #8329c8)` | Primary CTA buttons |
| `font-headline` | Manrope, extrabold | Page titles, card headers |
| Body | Inter | All other text |
| Card radius | `rounded-2xl` | All card containers |
| Card shadow | `shadow-card` (`0 1px 4px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)`) | Cards and panels |
| Button radius | `rounded-xl` | All button elements |
| Badge | `font-black uppercase tracking-widest text-[10px] rounded-full` | State and category badges |
| TopBar height | `h-16` (64px) | Glass-nav top bar |
| SideNav width | `256px` expanded | Present on all admin pages |

---

## Screen 1: Pipeline Dashboard — Main View (1440px Desktop)

### Layout Overview

The dashboard is the admin's landing page at `/admin/support/pipeline`. SideNav is visible and expanded (256px). TopBar is present (64px). The content area below TopBar is split into a left action queue panel (65% width) and a right activity feed panel (35% width). A stats bar runs full-width at the very bottom of the viewport (fixed, not scrollable).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  TopBar (h-16, glass-nav, --color-surface-container-lowest/80 + backdrop-blur-md)            │
│  [≡] Experient Logo     /admin/support/pipeline                    [Crystal ⚡] [Avatar]      │
├────────────┬─────────────────────────────────────────────────────────────────────────────────┤
│            │                                                                                  │
│  SideNav   │  LEFT PANEL (65%)                          RIGHT PANEL (35%)                    │
│  (256px)   │  ┌──────────────────────────────────┐     ┌────────────────────────────────┐   │
│            │  │  Doc Pipeline          [● 2m ago]│     │ Activity    Since last visit   │   │
│  ·Crystal  │  │  3 items need your review        │     │             (2h ago)           │   │
│  ·Skills   │  │                                  │     │                                │   │
│  ·Quality  │  │  [All 18][Needs Review 3]        │     │  ✓  survey-create approved     │   │
│  ·Signals  │  │  [Auto-Approved 12][Gaps 2]      │     │     by you · 2h ago           │   │
│  ·Gaps     │  │  [Rejected 1]                    │     │                                │   │
│            │  │                                  │     │  ⚡  3 docs auto-published     │   │
│  ──────    │  │  ┌──────────────────────────────┐│     │     (score > 0.90) · 3h ago   │   │
│  ·Pipeline │  │  │▌ csv-export                  ││     │                                │   │
│   (active) │  │  │  docs.api.exports.csv        ││     │  ⚠   csv-export rejected      │   │
│            │  │  │  backend/src/routes/…         ││     │     · 5h ago                  │   │
│            │  │  │  [0.83] [NEEDS REVIEW]        ││     │                                │   │
│            │  │  │  14 min ago  [Review→][✓][✗]  ││     │  ↺   nps-analysis regenerated │   │
│            │  │  └──────────────────────────────┘│     │     (source changed) · 6h ago │   │
│            │  │  ┌──────────────────────────────┐│     │                                │   │
│            │  │  │▌ nps-analysis                ││     │  ✓  workflow-trigger approved  │   │
│            │  │  │  docs.insights.nps           ││     │     · 8h ago                  │   │
│            │  │  │  backend/src/routes/…         ││     │                                │   │
│            │  │  │  [0.76] [REQ. ANNOTATION]     ││     │  ⚡  1 doc auto-published      │   │
│            │  │  │  1h ago     [Review→][✓][✗]   ││     │     · 9h ago                  │   │
│            │  │  └──────────────────────────────┘│     │                                │   │
│            │  │  ┌──────────────────────────────┐│     │  ──────────────────────────── │   │
│            │  │  │▌ webhook-retry               ││     │                                │   │
│            │  │  │  docs.api.webhooks.retry     ││     │  [Load earlier]                │   │
│            │  │  │  backend/src/routes/…         ││     │                                │   │
│            │  │  │  [0.88] [NEEDS REVIEW]        ││     └────────────────────────────────┘   │
│            │  │  │  32 min ago  [Review→][✓][✗]  ││                                          │
│            │  │  └──────────────────────────────┘│                                          │
│            │  │                                  │                                          │
│            │  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │                                          │
│            │  │  0 more items need action right  │                                          │
│            │  │  now — Crystal is handling rest  │                                          │
│            │  └──────────────────────────────────┘                                          │
├────────────┴─────────────────────────────────────────────────────────────────────────────────┤
│  STATS BAR (fixed bottom, h-12, --color-surface, border-t)                                   │
│  12 Live docs  ·  3 Pending review  ·  2 Gaps  ·  0.87 avg quality  ·  18 min avg publish   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Left Panel — Detailed Anatomy

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Doc Pipeline                              ┌──────────────────────────────┐│
│  (font-headline, 28px, --color-on-surface) │ ● Last updated 2 min ago     ││
│                                            │ (pill: --color-surface,      ││
│  3 items need your review                  │  border, text-[11px] Inter)  ││
│  (Inter 14px, --color-on-surface-variant)  └──────────────────────────────┘│
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ [All · 18] [Needs Review · 3] [Auto-Approved · 12] [Gaps · 2] [Rejected · 1] │
│  │ Tab bar: Inter 13px, active = --color-primary underline 2px          │  │
│  │ Counts: badge, font-black, --color-on-surface-variant bg-surface     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  QUEUE ROW (each row: rounded-2xl, shadow-card, bg-surface-container-lowest, p-4, mb-3)
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │▌ (3px left border: red=critical / amber=standard / gray=low)          ││
│  │                                                                        ││
│  │ csv-export                              [0.83]    [NEEDS REVIEW]       ││
│  │ (Inter 16px font-semibold)              (amber badge) (amber badge)   ││
│  │                                                                        ││
│  │ docs.api.exports.csv                                                   ││
│  │ (font-mono 12px --color-on-surface-variant)                           ││
│  │                                                                        ││
│  │ backend/src/routes/experience.ts · line 142                           ││
│  │ (font-mono 11px --color-on-surface-variant opacity-70)                ││
│  │                                                                        ││
│  │ 14 min ago                     [Review →] [✓ Approve] [✗ Reject]     ││
│  │ (Inter 12px muted)             (primary outline) (success) (error ghost)││
│  └────────────────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

**Queue row state badge mapping:**

| Pipeline State | Badge text | Badge color |
|---|---|---|
| `PendingReview` | NEEDS REVIEW | `--color-warning` bg at 15% opacity, text `--color-warning` |
| `AutoApproved` | AUTO-APPROVED | `--color-success` bg at 15% opacity, text `--color-success` |
| `RequiresAnnotation` | REQUIRES ANNOTATION | `--color-error` bg at 15% opacity, text `--color-error` |
| `Rejected` | REJECTED | `--color-error` filled, text white |
| `Live` | LIVE | `--color-success` filled, text white |
| `Stale` | STALE | `--color-on-surface-variant` bg, text white |
| `Queued` / `Extracting` / `Drafting` | IN PROGRESS | `--color-primary` bg at 15%, text `--color-primary` |

**Quality score badge mapping:**

| Score range | Badge color |
|---|---|
| ≥ 0.90 | `--color-success` |
| 0.80–0.89 | `--color-warning` |
| < 0.80 | `--color-error` |

### Right Panel — Activity Feed Anatomy

```
┌─────────────────────────────────────────────────────────┐
│  Activity                                               │
│  (font-headline 18px)                                   │
│                                                         │
│  Since last visit (2h ago)                              │
│  (Inter 12px --color-on-surface-variant)                │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  ● (dot: --color-success 8px)                           │
│  survey-create doc approved by you                      │
│  (Inter 13px --color-on-surface)                        │
│  2h ago (Inter 11px muted)                              │
│                                                         │
│  ● (dot: --color-primary 8px)                           │
│  3 docs auto-published (score > 0.90)                   │
│  3h ago                                                 │
│                                                         │
│  ● (dot: --color-warning 8px)                           │
│  csv-export doc rejected                                │
│  5h ago                                                 │
│                                                         │
│  ● (dot: --color-tertiary 8px)                          │
│  nps-analysis regenerated (source changed)              │
│  6h ago                                                 │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  [Load earlier]                                         │
│  (Inter 13px --color-primary, ghost button)             │
└─────────────────────────────────────────────────────────┘
```

### Stats Bar Anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  12 Live docs  ·  3 Pending review  ·  2 Gaps  ·  0.87 avg quality  ·  18 min avg publish  │
│  (Inter 13px --color-on-surface-variant, each segment separated by · divider)              │
│  "12", "3", "2", "0.87", "18 min" rendered as --color-on-surface font-semibold            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 1

| Element | Component | Styling |
|---|---|---|
| Page title "Doc Pipeline" | `<h1>` | `font-headline`, `text-[28px]`, `--color-on-surface`, `font-extrabold` |
| Subtitle "3 items need your review" | `<p>` | Inter 14px, `--color-on-surface-variant` |
| "Last updated" pill | `<span>` | `rounded-full`, `border`, Inter 11px, `--color-on-surface-variant`, live-updating via WebSocket or 30s poll |
| Filter tabs | `<TabsList>` (shadcn) | `rounded-xl`, active tab underline `--color-primary` 2px, Inter 13px |
| Queue row card | `<div>` | `rounded-2xl shadow-card bg-[--color-surface-container-lowest] p-4 mb-3` |
| Priority bar | `<div>` | `w-[3px] h-full absolute left-0 top-0 rounded-l-2xl` — red/amber/gray |
| Doc title | `<span>` | Inter 16px `font-semibold --color-on-surface` |
| Doc key | `<span>` | `font-mono text-[12px] --color-on-surface-variant` |
| Source file | `<span>` | `font-mono text-[11px] --color-on-surface-variant opacity-70` |
| Time in state | `<span>` | Inter 12px `--color-on-surface-variant` |
| "Review →" button | `<Button variant="outline">` | `rounded-xl border-[--color-primary] text-[--color-primary]` |
| "Approve ✓" button | `<Button>` | `rounded-xl bg-[--color-success] text-white` |
| "Reject ✗" button | `<Button variant="ghost">` | `rounded-xl text-[--color-error] hover:bg-[--color-error]/10` |
| Activity feed dot | `<span>` | `w-2 h-2 rounded-full` color by event type |
| Stats bar | `<footer>` | `fixed bottom-0 h-12 w-full bg-[--color-surface] border-t flex items-center gap-6 px-6` |

### Interactions — Screen 1

- **Hover on queue row:** card lifts with `shadow-lg` transition 150ms ease-out; action buttons fade in from opacity-0 to opacity-100 if not already visible (on narrow rows)
- **Click "Review →":** right panel morphs into full review mode (Screen 2); URL updates to `/admin/support/pipeline/:docKey/review` without page reload; use `framer-motion` `AnimatePresence` for panel swap
- **Click "Approve ✓":** optimistic update — row fades out with 200ms ease-out, activity feed prepends new `✓` event; POST `PATCH /api/admin/support/docs/:docKey/approve`
- **Click "Reject ✗":** reject reason dropdown appears inline below the row (not a modal); reason is required; confirm button triggers same fade-out
- **Filter tab switch:** list re-renders with `AnimatePresence` stagger on items; counts in tab badges update via 30s poll or WebSocket
- **Keyboard:** `j`/`k` to navigate between queue items (focus ring `outline-2 outline-offset-2 outline-[--color-primary]`); `a` to approve focused item; `r` to reject; `Enter` to open review
- **"Last updated" pill:** pulses (opacity 0.4 → 1 → 0.4, 2s loop) while a doc is in `Extracting` or `Drafting` state

### API Calls — Screen 1

| Data | Endpoint | Method | Notes |
|---|---|---|---|
| Queue items | `GET /api/admin/support/docs?state=pipeline` | GET | Returns paginated list sorted by priority desc, then `updated_at` desc |
| Approve doc | `PATCH /api/admin/support/docs/:docKey/approve` | PATCH | Body: `{ note?: string }` |
| Reject doc | `PATCH /api/admin/support/docs/:docKey/reject` | PATCH | Body: `{ reason: string }` |
| Activity feed | `GET /api/admin/support/activity?limit=20` | GET | Returns events since last visit timestamp (sent as header or query param) |
| Stats bar | `GET /api/admin/support/stats` | GET | Returns counts + averages; cache 60s |
| Real-time updates | `WS /ws/admin/support/pipeline` | WebSocket | Emits `doc_state_changed`, `new_activity` events |

---

## Screen 2: Doc Review Panel — Full Review Mode (Desktop)

### Layout Overview

Three-column layout inside the content area (SideNav still visible). Left column is narrow navigation (200px). Center column is the diff/preview pane (680px). Right column is the action bar (240px). Total content width fits within 1440px minus SideNav (256px) minus outer padding (48px) = ~1136px usable.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  TopBar                                                                                      │
├────────────┬─────────────────────────────────────────────────────────────────────────────────┤
│  SideNav   │                                                                                  │
│  (256px)   │  LEFT COL (200px)   CENTER COL (680px)                  RIGHT COL (240px)        │
│            │  ┌──────────────┐  ┌──────────────────────────────────┐ ┌────────────────────┐  │
│            │  │ ← Back       │  │ Crystal Draft vs. Current Live   │ │ Quality Score       │  │
│            │  │              │  │ [Diff ●][Preview][Source]        │ │                     │  │
│            │  │ csv-export   │  │ ─────────────────────────────── │ │    0.83             │  │
│            │  │ [API REF]    │  │                                  │ │  (amber ring)       │  │
│            │  │ Jun 23, 2026 │  │ ## CSV Export                   │ │  Needs Review       │  │
│            │  │              │  │ + Added in v2.1                  │ │                     │  │
│            │  │ Versions     │  │ - Was added in v2.0              │ │  [Approve & Publish]│  │
│            │  │ ──────────── │  │                                  │ │  (gradient btn)     │  │
│            │  │ Current draft│  │ + The export endpoint supports   │ │                     │  │
│            │  │ Prev (3d ago)│  │   streaming for large datasets.  │ │  [Approve with note]│  │
│            │  │ Live (1w ago)│  │ - The endpoint blocks on large   │ │  ┌────────────────┐ │  │
│            │  │              │  │   datasets.                      │ │  │ Add a note...  │ │  │
│            │  │ Sections     │  │                                  │ │  └────────────────┘ │  │
│            │  │ ──────────── │  │ ### Authentication               │ │  [Approve]          │  │
│            │  │ ⚡ Overview  │  │   Bearer token required          │ │                     │  │
│            │  │ ⚡ Auth      │  │                                  │ │  [Open editor]      │  │
│            │  │ 🔒 Rate limits│  │ ### Rate Limits                  │ │  (outline btn)      │  │
│            │  │ ⚡ Examples  │  │ 🔒 LOCKED — human-edited         │ │                     │  │
│            │  │              │  │   10 req/min per org             │ │  [Reject]           │  │
│            │  │              │  │                                  │ │  (destructive ghost)│  │
│            │  │              │  │ [▼ Quality score breakdown]      │ │  ┌────────────────┐ │  │
│            │  └──────────────┘  └──────────────────────────────────┘ │  │ Select reason ▼│ │  │
│            │                                                          │  └────────────────┘ │  │
│            │                                                          │                     │  │
│            │                                                          │ ─────────────────── │  │
│            │                                                          │ ⏱ Auto-approve      │  │
│            │                                                          │   1h 46m remaining  │  │
│            │                                                          │                     │  │
│            │                                                          │ Notify subscribers  │  │
│            │                                                          │ [toggle: off]       │  │
│            │                                                          │                     │  │
│            │                                                          │ Related docs        │  │
│            │                                                          │ · docs.api.exports  │  │
│            │                                                          │ · docs.api.formats  │  │
│            │                                                          └────────────────────┘  │
└────────────┴─────────────────────────────────────────────────────────────────────────────────┘
```

### Left Column — Detailed Anatomy

```
┌──────────────────────────────────────────┐
│ ← Back to queue                          │
│ (Inter 13px --color-primary, hover       │
│  underline, chevron-left icon 16px)      │
│                                          │
│ ────────────────────────────────────     │
│                                          │
│ csv-export                               │
│ (Inter 16px font-semibold)               │
│                                          │
│ [API REFERENCE]                          │
│ (badge: --color-secondary bg/15%,        │
│  text --color-secondary)                 │
│                                          │
│ Created Jun 23, 2026                     │
│ (Inter 11px --color-on-surface-variant)  │
│                                          │
│ ────────────────────────────────────     │
│                                          │
│ VERSION HISTORY                          │
│ (Inter 11px uppercase tracking-wide      │
│  --color-on-surface-variant)             │
│                                          │
│ ● Current draft                          │
│   (dot: --color-primary)                 │
│   Inter 13px font-semibold               │
│                                          │
│   Previous (3 days ago)                  │
│   (Inter 12px --color-on-surface-variant)│
│   [View diff ↗]                          │
│                                          │
│   Published (1 week ago)                 │
│   (Inter 12px muted)                     │
│   [View ↗]                               │
│                                          │
│ ────────────────────────────────────     │
│                                          │
│ SECTIONS                                 │
│ (Inter 11px uppercase tracking-wide)     │
│                                          │
│ ⚡ Overview                              │
│ ⚡ Authentication                        │
│ 🔒 Rate Limits                           │
│ ⚡ Request Format                        │
│ ⚡ Code Examples                         │
│                                          │
│ (⚡ = Crystal-generated, Inter 12px      │
│  --color-primary; 🔒 = human-locked,     │
│  Inter 12px --color-on-surface-variant)  │
│ Each item is an anchor link; active      │
│ section highlighted with left border     │
│ 2px --color-primary                      │
└──────────────────────────────────────────┘
```

### Center Column — Diff View Anatomy

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Crystal Draft vs. Current Live                                            │
│  (font-headline 18px --color-on-surface)                                   │
│                                                                            │
│  [Diff ●] [Preview] [Source]                                               │
│  (segmented control: rounded-xl, active = --color-primary bg, text white)  │
│                                                                            │
│  ────────────────────────────────────────────────────────────────────────  │
│                                                                            │
│  (scroll region, max-height = viewport - 200px, overflow-y: auto)         │
│                                                                            │
│  ## CSV Export     [🔒 Lock] [✏️ Edit]    ← hover-reveal controls         │
│  (section header: Inter 17px font-semibold, controls appear on row hover) │
│                                                                            │
│  + Added in v2.1    (bg: #d1fae5, text: --color-success, left border 3px  │
│                      --color-success, font-mono 13px, line prefix "+")     │
│  - Was added in v2.0 (bg: #fee2e2, text: --color-error, left border 3px   │
│                       --color-error, font-mono 13px, line prefix "-")      │
│    (unchanged)       (normal bg, font-mono 13px --color-on-surface)        │
│                                                                            │
│  ### Authentication     [🔒 Lock] [✏️ Edit]                               │
│  + The export endpoint supports streaming for large datasets.              │
│  - The endpoint blocks on large datasets.                                  │
│    Bearer token required (unchanged)                                       │
│                                                                            │
│  ### Rate Limits     (locked section)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  3px left border --color-primary                                    │  │
│  │  🔒 LOCKED — Human-edited. Crystal will not overwrite this section. │  │
│  │  (banner: --color-primary/8% bg, Inter 12px --color-primary)        │  │
│  │  10 req/min per org                                                  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ [▼ Quality score breakdown]                                         │  │
│  │ (collapsible, default collapsed, Inter 13px --color-primary)        │  │
│  │                                                                     │  │
│  │ When expanded:                                                      │  │
│  │ Resolution accuracy  0.87  ████████░░  --color-success              │  │
│  │ Source citation      0.92  █████████░  --color-success              │  │
│  │ Code examples        0.79  ███████░░░  --color-warning              │  │
│  │ Clarity              0.85  ████████░░  --color-success              │  │
│  │ No hallucination     0.91  █████████░  --color-success              │  │
│  │ (each: Inter 13px, label left, score center, bar right)            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Right Column — Actions Anatomy

```
┌────────────────────────────────────────────┐
│  Quality Score                             │
│  (Inter 13px uppercase tracking-wide       │
│   --color-on-surface-variant)              │
│                                            │
│         ┌─────────┐                        │
│         │  0.83   │  ← large ring          │
│         │         │  (SVG circle, stroke   │
│         └─────────┘   --color-warning,     │
│                        strokeDash animation│
│                        on mount)           │
│                                            │
│  Needs Review                              │
│  (Inter 14px --color-warning font-semibold)│
│                                            │
│  ────────────────────────────────────      │
│                                            │
│  [Approve & Publish]                       │
│  (full-width, rounded-xl, gradient         │
│   bg linear-gradient(135deg,#2a4bd9,       │
│   #8329c8), text white, font-semibold,     │
│   h-11, hover: brightness-110)             │
│                                            │
│  ── or ─────────────────────────────       │
│                                            │
│  Approve with note:                        │
│  ┌──────────────────────────────────┐      │
│  │ Optional note to self...         │      │
│  │ (textarea 3 rows, rounded-xl,    │      │
│  │  border --color-on-surface/30,   │      │
│  │  Inter 13px, resize-none)        │      │
│  └──────────────────────────────────┘      │
│  [Approve]                                 │
│  (full-width outline, --color-success      │
│   border+text, rounded-xl, h-9)            │
│                                            │
│  ────────────────────────────────────      │
│                                            │
│  [Open editor]                             │
│  (full-width, rounded-xl, outline,         │
│   --color-primary border+text, h-9)        │
│                                            │
│  [Reject]                                  │
│  (full-width, ghost, --color-error text,   │
│   rounded-xl, h-9, hover: bg-error/10)     │
│  ┌──────────────────────────────────┐      │
│  │ Select reason ▼                  │      │
│  │ · Inaccurate content             │      │
│  │ · Missing code examples          │      │
│  │ · Outdated information           │      │
│  │ · Confusing explanation          │      │
│  │ · Other (free text)              │      │
│  └──────────────────────────────────┘      │
│  (dropdown: shadcn Select, rounded-xl)     │
│                                            │
│  ────────────────────────────────────      │
│                                            │
│  ⏱ Auto-approve in                        │
│  1h 46m remaining                          │
│  (pill: --color-surface border, Inter 12px,│
│   countdown updates every minute)          │
│                                            │
│  ────────────────────────────────────      │
│                                            │
│  Notify subscribers about this change?     │
│  (Inter 12px --color-on-surface-variant)   │
│  [● OFF / ON]  (shadcn Switch)             │
│                                            │
│  ────────────────────────────────────      │
│                                            │
│  Related docs                              │
│  (Inter 12px --color-on-surface-variant    │
│   uppercase tracking-wide)                 │
│  · docs.api.exports                        │
│  · docs.api.formats                        │
│  (font-mono 12px --color-primary, hover    │
│   underline, open in new tab)              │
└────────────────────────────────────────────┘
```

### Legend — Screen 2

| Element | Component | Styling |
|---|---|---|
| "← Back to queue" | `<Link>` | Inter 13px `--color-primary`, `chevron-left` icon, hover underline |
| Section map anchor | `<a>` | Inter 12px, active = `border-l-2 border-[--color-primary] pl-2` |
| 🔒 icon | Material Symbol `lock` 16px | `--color-on-surface-variant` |
| ⚡ icon | Material Symbol `bolt` 16px | `--color-primary` |
| Diff view toggle | `<SegmentedControl>` | `rounded-xl bg-surface p-0.5`, active segment `bg-[--color-primary] text-white rounded-lg` |
| Added line | `<div>` | `bg-[#d1fae5] border-l-[3px] border-[--color-success] font-mono text-[13px]` |
| Removed line | `<div>` | `bg-[#fee2e2] border-l-[3px] border-[--color-error] font-mono text-[13px]` |
| Locked section | `<section>` | `border-l-[3px] border-[--color-primary] bg-[--color-primary]/8` |
| Quality ring | SVG `<circle>` | `stroke-[--color-warning]` animated strokeDashoffset on mount, 200ms ease-out |
| Approve & Publish | `<Button>` | `rounded-xl h-11 w-full` gradient background |
| Reject dropdown | shadcn `<Select>` | `rounded-xl` |
| Countdown pill | `<span>` | `rounded-full border px-3 py-1 Inter 12px` |

### Interactions — Screen 2

- **Toggle Diff/Preview/Source:** content area cross-fades in 150ms; scroll position resets to top
- **Hover on section header:** `[🔒 Lock]` and `[✏️ Edit]` buttons fade in (opacity 0 → 1, 100ms)
- **Click "🔒 Lock section":** section immediately gains locked visual treatment; API call `PATCH /api/admin/support/docs/:docKey/sections/:sectionId/lock`; button label changes to "🔓 Unlock"
- **Click "Approve & Publish":** button shows loading spinner 200ms, row removed from queue with stagger animation, user redirected to pipeline dashboard with success toast
- **Click "Reject" + select reason:** reason dropdown is required before confirm button activates; confirm triggers same redirect flow
- **Auto-approve countdown:** if countdown reaches 0:00 while admin is viewing, the panel shows a pulsing amber banner "This doc was auto-approved — you can still override" and the Approve button changes to "Override & Republish"
- **Keyboard:** `Escape` returns to queue; `Ctrl+Enter` approves; `Ctrl+E` opens editor

### API Calls — Screen 2

| Data | Endpoint | Method |
|---|---|---|
| Doc draft content | `GET /api/admin/support/docs/:docKey/draft` | GET |
| Current live content | `GET /api/admin/support/docs/:docKey/live` | GET |
| Lock/unlock section | `PATCH /api/admin/support/docs/:docKey/sections/:id/lock` | PATCH |
| Approve | `PATCH /api/admin/support/docs/:docKey/approve` | PATCH |
| Reject | `PATCH /api/admin/support/docs/:docKey/reject` | PATCH |
| Quality score details | `GET /api/admin/support/docs/:docKey/quality` | GET |
| Related docs | `GET /api/admin/support/docs/:docKey/related` | GET |

---

## Screen 3: Inline Doc Editor

### Layout Overview

Full-screen focus mode. SideNav is hidden (not just collapsed — `display:none`). TopBar persists but loses its nav items, showing only "Doc Editor" breadcrumb and Save/Discard controls. Content is a horizontal split: left = markdown editor (Monaco-style), right = live preview. A fixed toolbar sits between the TopBar and the editor split.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  TopBar (focus mode)                                                                         │
│  ← Doc Pipeline / csv-export / editing               [Save & Review]  [Discard changes]     │
│  (breadcrumb Inter 13px --color-primary)              (gradient btn)   (ghost --color-error) │
├────────────────────────────────────────────────────────────────────────────────────────────  │
│  TOOLBAR (h-10, bg-[--color-surface], border-b, sticky)                                      │
│  [B] [I] [<>] [⊞ Table] [💾 Save section] [🔒 Lock section]   Word count: 843  Score: 0.83  │
│  (each: rounded-lg px-2 py-1 hover:bg-[--color-primary]/10 Inter 13px)                      │
├─────────────────────────────────────────────────────────────────────────────────────────────  │
│  EDITOR SPLIT                                                                                │
│  ┌──────────────────────────────────────────┐ ┌──────────────────────────────────────────┐  │
│  │ MARKDOWN EDITOR (50%)                    │ │ LIVE PREVIEW (50%)                       │  │
│  │ (dark theme: bg-[#1a1d23], white text,   │ │ (bg-white, styled as docs site)          │  │
│  │  font-mono text-[14px], line-height 1.7, │ │                                          │  │
│  │  syntax highlighting via Monaco)         │ │ CSV Export                               │  │
│  │                                          │ │ ───────────────────────────────          │  │
│  │ ## CSV Export                            │ │                                          │  │
│  │                                          │ │ Export survey response data as CSV.      │  │
│  │ Export survey response data as CSV.      │ │ Added in v2.1.                           │  │
│  │ Added in v2.1.                           │ │                                          │  │
│  │                                          │ │ Authentication                           │  │
│  │ ### Authentication                       │ │ ───────────────                          │  │
│  │                                          │ │ Bearer token required.                   │  │
│  │ Bearer token required.                   │ │                                          │  │
│  │                                          │ │ ┌─ 🔒 Rate Limits ─────────────────────┐│  │
│  │ ┌─── LOCKED SECTION ──────────────────┐  │ │ │  🔒 Human-locked                    ││  │
│  │ │ ### Rate Limits                     │  │ │ │  10 req/min per org                 ││  │
│  │ │ (3px left border --color-primary,   │  │ │ └────────────────────────────────────┘│  │
│  │ │  bg --color-primary/5%)             │  │ │                                          │  │
│  │ │ 10 req/min per org                  │  │ │ Quality Score: 0.83                      │  │
│  │ │                                     │  │ │ (live-updating amber badge)              │  │
│  │ └─────────────────────────────────────┘  │ └──────────────────────────────────────────┘  │
│  └──────────────────────────────────────────┘                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Section Lock Control — Anatomy

When admin clicks a section header in the editor, a floating popover appears:

```
            ┌─────────────────────────────────────────────┐
            │  ### Rate Limits          [× dismiss]        │
            │                                              │
            │  Lock this section?                          │
            │  Crystal will not overwrite locked sections  │
            │  on future regenerations.                    │
            │  (Inter 13px --color-on-surface-variant)     │
            │                                              │
            │  [🔒 Lock section]  [Cancel]                 │
            │  (--color-primary outline)  (ghost)          │
            └─────────────────────────────────────────────┘
```

### Locked Section Visual Treatment (Editor)

```
  ┌────────────────────────────────────────────────────┐
  │  3px left border --color-primary                   │
  │  bg: --color-primary/5%                            │
  │                                                    │
  │  🔒  Rate Limits  (header, cursor:not-allowed)     │
  │  [🔓 Unlock to edit]  (Inter 11px --color-primary) │
  │                                                    │
  │  10 req/min per org  (editable only after unlock)  │
  └────────────────────────────────────────────────────┘
```

### Legend — Screen 3

| Element | Component | Styling |
|---|---|---|
| TopBar (focus mode) | `<header>` | Same glass-nav, but nav items replaced with breadcrumb + CTA pair |
| Breadcrumb separator | `/` | `--color-on-surface-variant` |
| Toolbar | `<div>` | `h-10 bg-[--color-surface] border-b sticky top-16 z-30 flex items-center gap-1 px-4` |
| Toolbar button | `<button>` | `rounded-lg px-2 py-1 text-[13px] hover:bg-[--color-primary]/10 transition-colors` |
| Editor pane | Monaco Editor | `theme:"vs-dark"`, `language:"markdown"`, `fontFamily:"JetBrains Mono, monospace"`, `fontSize:14` |
| Preview pane | `<div>` | `bg-white p-8 overflow-y-auto prose prose-sm` (Tailwind Typography) |
| Word count | `<span>` | Inter 12px `--color-on-surface-variant`, far right of toolbar |
| Quality score (live) | Badge | Same badge rules as Screen 1, updates with 500ms debounce after keystrokes |
| Locked section (editor) | Overlay `<div>` | `border-l-[3px] border-[--color-primary] bg-[--color-primary]/5 cursor-not-allowed` |
| Save & Review | `<Button>` | `rounded-xl` gradient, TopBar right |
| Discard changes | `<Button variant="ghost">` | `rounded-xl text-[--color-error]` |

### Interactions — Screen 3

- **Monaco editor:** standard Monaco keyboard shortcuts; Cmd+S triggers "Save section" (saves without exiting editor); Cmd+Shift+S triggers "Save & Review"
- **Lock section:** click section heading → popover appears anchored to heading; confirm lock → section immediately gains locked treatment in editor (grayed out, cursor blocked) and preview pane shows 🔒 badge on heading
- **Live quality score:** debounced 500ms after last keystroke; shows loading spinner on badge while recalculating; POST `POST /api/admin/support/docs/:docKey/quality-preview` with current markdown body
- **Split resize:** draggable divider between editor and preview; min-width 320px each side; position persisted in `localStorage`
- **Discard changes:** confirmation popover "Discard all unsaved changes?" with "Discard" (destructive) + "Keep editing" (primary); on confirm, navigate back to Screen 2 with unchanged draft
- **Keyboard:** `Escape` shows discard confirmation if changes exist; `Ctrl+Z`/`Ctrl+Y` for undo/redo within Monaco

### API Calls — Screen 3

| Data | Endpoint | Method |
|---|---|---|
| Save draft | `PATCH /api/admin/support/docs/:docKey/draft` | PATCH |
| Lock section | `PATCH /api/admin/support/docs/:docKey/sections/:id/lock` | PATCH |
| Quality preview | `POST /api/admin/support/docs/:docKey/quality-preview` | POST |

---

## Screen 4: Doc Gap Queue

### Layout Overview

Full-content area (SideNav visible). Single-column list with sort controls. Accessible via the "Gaps" filter tab on Screen 1, or the ADMIN_CRYSTAL_GAPS route in SideNav.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  TopBar                                                                                      │
├────────────┬─────────────────────────────────────────────────────────────────────────────────┤
│  SideNav   │                                                                                  │
│            │  Doc Gaps                                                                       │
│            │  (font-headline 28px)                                                            │
│            │  Questions Crystal couldn't answer — these topics need documentation            │
│            │  (Inter 14px --color-on-surface-variant)                                         │
│            │                                                                                  │
│            │  Sort by: [Most frequent ▼]  [Oldest] [Newest]                                  │
│            │  (segmented, rounded-xl)                                                         │
│            │                                                                                  │
│            │  ┌────────────────────────────────────────────────────────────────────────────┐ │
│            │  │  [MISSING DOC]                     Asked 4 times this week  [amber ●]      │ │
│            │  │  "How do I configure webhook retry behavior?"                               │ │
│            │  │  (italic, --color-on-surface, Inter 16px, quotes included)                  │ │
│            │  │                                                                             │ │
│            │  │  Suggested key: api.webhooks.retry-config                                  │ │
│            │  │  (font-mono 12px --color-on-surface-variant)                                │ │
│            │  │                                                                             │ │
│            │  │  Created Jun 20 · From support ticket #EXP-2847 ↗                          │ │
│            │  │  (Inter 12px muted, ticket link --color-primary hover:underline)            │ │
│            │  │                                                                             │ │
│            │  │  [Write doc] [Link to existing] [Mark as known issue]                      │ │
│            │  └────────────────────────────────────────────────────────────────────────────┘ │
│            │                                                                                  │
│            │  ┌────────────────────────────────────────────────────────────────────────────┐ │
│            │  │  [UNCLEAR DOC]                     Asked 2 times this week                  │ │
│            │  │  "What does the 'draft' state mean for surveys?"                            │ │
│            │  │  Suggested key: concepts.survey-states                                     │ │
│            │  │  Created Jun 19 · From support ticket #EXP-2831 ↗                          │ │
│            │  │  [Write doc] [Link to existing] [Mark as known issue]                      │ │
│            │  └────────────────────────────────────────────────────────────────────────────┘ │
│            │                                                                                  │
│            │  ┌────────────────────────────────────────────────────────────────────────────┐ │
│            │  │  [MISSING FEATURE]                 Asked 1 time this week                  │ │
│            │  │  "Can Crystal summarize free-text responses by topic?"                     │ │
│            │  │  Suggested key: crystal.skills.topic-summarization                         │ │
│            │  │  Created Jun 18 · From support ticket #EXP-2819 ↗                          │ │
│            │  │  [Write doc] [Link to existing] [Mark as known issue]                      │ │
│            │  └────────────────────────────────────────────────────────────────────────────┘ │
└────────────┴─────────────────────────────────────────────────────────────────────────────────┘
```

### Gap Card — Detailed Anatomy

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  [MISSING DOC]                                        Asked 4 times this week  ●           │
│  (badge: --color-error/15% bg,                        (amber if > 3 times,                 │
│   text --color-error, font-black                       Inter 12px font-semibold,            │
│   uppercase tracking-widest text-[10px])               dot: --color-warning 6px)            │
│                                                                                             │
│  "How do I configure webhook retry behavior?"                                               │
│  (Inter 16px, font-style: italic, --color-on-surface, opening/closing quote marks)         │
│                                                                                             │
│  Suggested doc key:  api.webhooks.retry-config                                             │
│  (Inter 12px --color-on-surface-variant, key in font-mono --color-on-surface-variant)       │
│                                                                                             │
│  Created Jun 20, 2026  ·  From support ticket #EXP-2847 ↗                                 │
│  (Inter 12px --color-on-surface-variant; ticket = --color-primary link, external icon 12px)│
│                                                                                             │
│  ─────────────────────────────────────────────────────────────────────────────────────     │
│                                                                                             │
│  [Write doc ✏️]              [Link to existing ↗]          [Mark as known issue]           │
│  (rounded-xl gradient btn,    (rounded-xl outline           (rounded-xl ghost               │
│   text white, h-9)             --color-secondary)            --color-on-surface-variant)    │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Gap Category Badge Mapping

| Category | Badge text | Badge style |
|---|---|---|
| `MISSING_DOC` | MISSING DOC | `--color-error` bg/15%, text `--color-error` |
| `UNCLEAR_DOC` | UNCLEAR DOC | `--color-warning` bg/15%, text `--color-warning` |
| `MISSING_FEATURE` | MISSING FEATURE | `--color-tertiary` bg/15%, text `--color-tertiary` |

### Empty State

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                    (Crystal ⚡ animated logo, 80px)                       │
│                    (Framer Motion: subtle float animation                  │
│                     y: 0 → -8 → 0, 3s ease-in-out loop)                  │
│                                                                            │
│              No gaps — Crystal is resolving everything                     │
│              (font-headline 20px --color-on-surface text-center)           │
│                                                                            │
│     All support queries matched a doc in the last 7 days.                 │
│     (Inter 14px --color-on-surface-variant text-center)                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Interactions — Screen 4

- **"Write doc":** opens Screen 3 (Inline Doc Editor) in new-doc mode with `doc_key` pre-populated from suggested key; gap record is linked to the new doc
- **"Link to existing":** opens a search modal (`Cmd+K` style) — fuzzy search over existing doc keys and titles; selecting a doc links the gap and marks it resolved
- **"Mark as known issue":** inline confirmation row replaces button row; "Confirm mark as known issue" (destructive) + "Cancel"; on confirm, card fades out and moves to a collapsed "Known Issues" section at page bottom
- **Frequency highlight:** "Asked N times this week" is amber (`--color-warning`) when N > 3, green (`--color-success`) for N = 0, default muted for N ≤ 3
- **Sort:** instant re-sort in client without network call (data already loaded); sort state persisted in URL query param `?sort=frequency`

### API Calls — Screen 4

| Data | Endpoint | Method |
|---|---|---|
| Gap list | `GET /api/admin/support/gaps` | GET |
| Mark known issue | `PATCH /api/admin/support/gaps/:gapId/known-issue` | PATCH |
| Link to existing doc | `PATCH /api/admin/support/gaps/:gapId/link` | PATCH |
| Search existing docs | `GET /api/admin/support/docs?q=:query&limit=10` | GET |

---

## Screen 5: Pipeline Stats / Analytics Dashboard

### Layout Overview

Full-content area. Stats grid at top (4 KPI cards). Below: quality distribution + throughput chart side by side. Below that: review latency table + top gaps list side by side. Bottom: human edit rate callout.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│  TopBar                                                                                      │
├────────────┬─────────────────────────────────────────────────────────────────────────────────┤
│  SideNav   │                                                                                  │
│            │  Pipeline Analytics                                                              │
│            │  (font-headline 28px)                                                            │
│            │  Last 7 days  [7d ●] [30d] [90d]   ← period toggle (segmented, rounded-xl)     │
│            │                                                                                  │
│            │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐          │
│            │  │ Crystal      │ │ Avg Publish  │ │ Doc Coverage │ │ Open Gaps    │          │
│            │  │ Resolution   │ │ Time         │ │              │ │              │          │
│            │  │ Rate         │ │              │ │              │ │              │          │
│            │  │              │ │              │ │              │ │              │          │
│            │  │    84%       │ │   18 min     │ │    73%       │ │     5        │          │
│            │  │              │ │              │ │              │ │              │          │
│            │  │ ↑ +2% vs    │ │ ↓ -3 min vs │ │ ↑ +5% vs    │ │ ↓ -2 vs     │          │
│            │  │   last week  │ │   last week  │ │   last week  │ │   last week  │          │
│            │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘          │
│            │                                                                                  │
│            │  ┌─────────────────────────────────┐ ┌─────────────────────────────────┐       │
│            │  │ Quality Score Distribution       │ │ Pipeline Throughput (7-day)     │       │
│            │  │                                  │ │                                 │       │
│            │  │ 0.90–1.0  ████████████  47 docs  │ │  (area chart: stacked)          │       │
│            │  │ 0.85–0.89 ████████     31 docs  │ │  green = auto-approved          │       │
│            │  │ 0.75–0.84 █████        18 docs  │ │  blue  = human-reviewed         │       │
│            │  │ 0.65–0.74 ██            8 docs  │ │  red   = rejected               │       │
│            │  │                                  │ │                                 │       │
│            │  │ (horiz. bar chart,               │ │  Mon Tue Wed Thu Fri Sat Sun    │       │
│            │  │  bar color = quality band color) │ │  (x-axis)                       │       │
│            │  └─────────────────────────────────┘ └─────────────────────────────────┘       │
│            │                                                                                  │
│            │  ┌─────────────────────────────────┐ ┌─────────────────────────────────┐       │
│            │  │ Review Latency                  │ │ Top Doc Gaps (last 7 days)      │       │
│            │  │                                 │ │                                 │       │
│            │  │ Category    Count  Avg   P95    │ │ webhook retry config  ████ 4    │       │
│            │  │ ─────────── ─────  ───   ───    │ │ survey draft states  ███  3    │       │
│            │  │ API Ref     12     8 min 22 min │ │ topic summarization  ██   2    │       │
│            │  │ Guides       4    34 min 61 min │ │ billing credits      ██   2    │       │
│            │  │ Skill Ref    6    11 min 28 min │ │ csv stream mode      █    1    │       │
│            │  │                                 │ │                                 │       │
│            │  │ (Inter 13px, zebra stripe       │ │ (horizontal freq bars,          │       │
│            │  │  --color-surface alternating)   │ │  --color-warning fill)          │       │
│            │  └─────────────────────────────────┘ └─────────────────────────────────┘       │
│            │                                                                                  │
│            │  ┌──────────────────────────────────────────────────────────────────────────┐  │
│            │  │ 🔒 Human Edit Rate                                                       │  │
│            │  │ 14% of docs had human edits before publish —                            │  │
│            │  │ these sections are now locked.                                          │  │
│            │  │ (callout card: --color-primary/8% bg, border-l-4 --color-primary)       │  │
│            │  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────┴─────────────────────────────────────────────────────────────────────────────────┘
```

### KPI Card — Detailed Anatomy

```
┌────────────────────────────────────────┐
│  Crystal Resolution Rate               │
│  (Inter 13px --color-on-surface-variant│
│   uppercase tracking-wide)             │
│                                        │
│  84%                                   │
│  (font-headline 48px --color-on-surface│
│   font-extrabold)                      │
│                                        │
│  ↑ +2% vs last week                   │
│  (Inter 13px, ↑ = --color-success,     │
│   ↓ = --color-error, → = muted)        │
└────────────────────────────────────────┘
```

All 4 KPI cards: `rounded-2xl shadow-card bg-[--color-surface-container-lowest] p-6`, equal width in a 4-column CSS grid with `gap-4`.

### Legend — Screen 5

| Element | Component | Styling |
|---|---|---|
| KPI card | `<div>` | `rounded-2xl shadow-card p-6 bg-[--color-surface-container-lowest]` |
| KPI number | `<span>` | `font-headline text-[48px] font-extrabold --color-on-surface` |
| KPI label | `<span>` | Inter 13px uppercase `tracking-wide --color-on-surface-variant` |
| Trend ↑ | `<span>` | Inter 13px `--color-success` |
| Trend ↓ | `<span>` | Inter 13px `--color-error` |
| Bar chart bars | `<div>` | height-fixed at 24px, width proportional, colored by band |
| Area chart | Recharts `<AreaChart>` | `stroke-[--color-success]` auto-approved, `stroke-[--color-primary]` human, `stroke-[--color-error]` rejected |
| Table row (zebra) | `<tr>` | even rows `bg-[--color-surface]`, odd rows `bg-[--color-surface-container-lowest]` |
| Human edit rate callout | `<div>` | `bg-[--color-primary]/8 border-l-4 border-[--color-primary] rounded-r-2xl p-4` |
| Period toggle | Segmented control | `rounded-xl`, active `--color-primary bg text-white` |

### Interactions — Screen 5

- **Period toggle (7d / 30d / 90d):** refetches all chart + table data; charts re-animate on new data (recharts `animationDuration={400}`)
- **Bar chart hover:** tooltip shows exact count + percentage of total for that band; tooltip `rounded-xl shadow-card bg-[--color-surface-container-lowest] p-3 Inter 12px`
- **Area chart hover:** crosshair + tooltip showing per-day counts by state
- **Review latency row click:** drills down to filtered queue showing only that category's docs

### API Calls — Screen 5

| Data | Endpoint | Method |
|---|---|---|
| All analytics | `GET /api/admin/support/analytics?period=7d` | GET |
| Returns: resolution rate, publish time, coverage, gap count, quality distribution, throughput series, latency by category, top gaps, human edit rate | | |

---

## Screen 6: Mobile Admin View (390px)

### Layout Overview

No SideNav. TopBar is simplified (logo + avatar only). Content is full-width stacked queue items. Bottom tab bar is fixed at the viewport bottom (height 56px). Quick-approve banner appears above the tab bar when relevant.

```
┌────────────────────────────────────────┐
│  TopBar (h-16, glass-nav)              │
│  [☰]  Experient        [⚡] [Avatar]   │
├────────────────────────────────────────┤
│                                        │
│  Doc Pipeline                          │
│  (font-headline 22px)                  │
│  3 items need review                   │
│  (Inter 13px muted)                    │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │▌ csv-export                      │  │
│  │  docs.api.exports.csv            │  │
│  │  [0.83] [NEEDS REVIEW]           │  │
│  │  14 min ago                      │  │
│  │                                  │  │
│  │  swipe → to approve              │  │
│  │  swipe ← to reject               │  │
│  │  (hint shown on first visit only)│  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │▌ nps-analysis                    │  │
│  │  docs.insights.nps               │  │
│  │  [0.76] [REQ. ANNOTATION]        │  │
│  │  1h ago                          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │▌ webhook-retry                   │  │
│  │  docs.api.webhooks.retry         │  │
│  │  [0.88] [NEEDS REVIEW]           │  │
│  │  32 min ago                      │  │
│  └──────────────────────────────────┘  │
│                                        │
│                                        │
│ ┌────────────────────────────────────┐ │
│ │ ⚡ 2 auto-approved in last hour    │ │
│ │    Tap to review                   │ │
│ │ (--color-primary/10% bg,           │ │
│ │  border-t border-[--color-primary],│ │
│ │  h-10 Inter 13px --color-primary)  │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│  TAB BAR (h-14, bg-surface-lowest,     │
│           border-t, fixed bottom)      │
│                                        │
│  [Queue]  [Feed]  [Gaps]  [Stats]      │
│  (active: --color-primary icon+label,  │
│   inactive: --color-on-surface-variant)│
└────────────────────────────────────────┘
```

### Mobile Queue Item — Tap-to-Expand State

When the admin taps a queue item, it expands in-place (no navigation):

```
┌──────────────────────────────────────┐
│▌ csv-export              [× collapse]│
│  docs.api.exports.csv               │
│  [0.83] [NEEDS REVIEW]  14 min ago  │
│                                      │
│  ─────────────────────────────────   │
│                                      │
│  SUMMARY (not full diff)             │
│  Crystal made 3 changes to this doc. │
│  Main change: updated streaming note │
│  in Overview section.               │
│                                      │
│  Quality breakdown:                  │
│  Resolution accuracy  0.87           │
│  Code examples        0.79 ⚠        │
│  Clarity              0.85           │
│                                      │
│  ─────────────────────────────────   │
│                                      │
│  [✓ Approve]     [✗ Reject]          │
│  (full-width     (full-width         │
│   success btn)    error ghost)       │
│                                      │
│  [View full review on desktop →]     │
│  (Inter 12px --color-primary muted)  │
└──────────────────────────────────────┘
```

### Mobile Swipe Gesture Specification

- **Swipe right (approve):** card translates right with spring physics; `x: 0 → 80px` reveals a green checkmark backdrop `bg-[--color-success]`; release at `x > 60px` confirms; under 60px snaps back; uses `framer-motion` drag with `dragConstraints={{ left: 0, right: 120 }}`
- **Swipe left (reject):** mirrors approve gesture; red `x` icon backdrop `bg-[--color-error]`; release at `x < -60px` opens reject reason sheet (bottom sheet, not inline)
- **Reject reason bottom sheet:** slides up from bottom (`y: 100% → 0`, spring), contains the same reason list as Screen 2 right column, plus a "Confirm reject" button and a drag-down-to-dismiss handle

### Legend — Screen 6

| Element | Component | Styling |
|---|---|---|
| Mobile queue card | `<motion.div>` | `rounded-2xl shadow-card p-4 mx-4 mb-3`, drag-enabled via Framer Motion |
| Swipe approve backdrop | `<div>` | `absolute inset-0 bg-[--color-success] rounded-2xl flex items-center justify-start pl-6 text-white` |
| Swipe reject backdrop | `<div>` | `absolute inset-0 bg-[--color-error] rounded-2xl flex items-center justify-end pr-6 text-white` |
| Bottom tab bar | `<nav>` | `fixed bottom-0 h-14 w-full bg-[--color-surface-container-lowest] border-t` |
| Tab item (active) | `<button>` | icon + label, `--color-primary`, `font-semibold` |
| Tab item (inactive) | `<button>` | icon + label, `--color-on-surface-variant` |
| Quick-approve banner | `<div>` | `fixed bottom-14 w-full h-10 bg-[--color-primary]/10 border-t border-[--color-primary]` |
| Expand/collapse card | Framer Motion `<AnimatePresence>` | height animation `0 → auto`, spring `stiffness:300 damping:30` |
| Bottom sheet | `<motion.div>` | `fixed bottom-0 w-full bg-[--color-surface-container-lowest] rounded-t-2xl shadow-[0_-4px_32px_rgba(0,0,0,0.12)]` |

### Interactions — Screen 6

- **First visit:** onboarding overlay shows swipe hints as animated arrows; dismissed on first interaction; stored in `localStorage` key `pipeline_swipe_hint_dismissed`
- **Quick-approve banner:** taps navigate to "Feed" tab filtered to show the auto-approved items; count updates via 30s poll
- **Tab switching:** instant client-side, tabs own their scroll position (not reset on switch)
- **"View full review on desktop →":** copies a deep link to clipboard (uses Web Share API if available, falls back to clipboard); shows "Link copied" toast 1.5s

### API Calls — Screen 6

Same as Screen 1, narrowed:

| Data | Endpoint | Notes |
|---|---|---|
| Queue items | `GET /api/admin/support/docs?state=pipeline&limit=20` | Mobile requests fewer items |
| Approve | `PATCH /api/admin/support/docs/:docKey/approve` | |
| Reject | `PATCH /api/admin/support/docs/:docKey/reject` | Requires reason |
| Activity feed | `GET /api/admin/support/activity?limit=10` | |
| Stats summary | `GET /api/admin/support/stats` | |

---

## Global Shared Patterns

### Toast Notifications

All confirmations (approve, reject, lock, save) trigger a toast:

```
┌───────────────────────────────────────────────────────────┐
│  ✓  csv-export approved and published                     │
│     (Inter 14px --color-on-surface)             [×]        │
│  (rounded-2xl shadow-card bg-[--color-surface-container-   │
│   lowest] px-4 py-3, left border 4px --color-success)      │
│  auto-dismiss 4s; stacked if multiple                      │
└───────────────────────────────────────────────────────────┘
```

Error toast uses `--color-error` left border. Warning uses `--color-warning`.

### Loading States

- **Queue items loading:** skeleton rows — `rounded-2xl bg-[--color-surface] animate-pulse h-[100px] mb-3`
- **Chart loading:** skeleton blocks with same animate-pulse
- **Button loading:** spinner icon replaces label; button remains same size (no layout shift)
- **Right panel loading:** skeleton for quality ring + action buttons while `GET /api/admin/support/docs/:docKey/draft` resolves

### Empty States

All empty states follow the same pattern:

```
icon (64px, --color-on-surface-variant/40%)
title (font-headline 20px --color-on-surface, text-center)
subtitle (Inter 14px --color-on-surface-variant, text-center, max-w-[320px])
[optional CTA button]
```

### Error States

Network errors show an inline error banner at the top of the affected panel:

```
⚠ Failed to load queue items.  [Retry]
(--color-error/10% bg, border-l-4 --color-error, Inter 13px)
```

---

## Route Registration (for frontend engineers)

Add to `ROUTES` in `app/src/constants/routes.ts`:

```typescript
// Admin — Support Pipeline
ADMIN_SUPPORT_PIPELINE:        '/app/admin/support/pipeline',
ADMIN_SUPPORT_PIPELINE_REVIEW: '/app/admin/support/pipeline/:docKey/review',
ADMIN_SUPPORT_PIPELINE_EDIT:   '/app/admin/support/pipeline/:docKey/edit',
ADMIN_SUPPORT_GAPS:            '/app/admin/support/gaps',
ADMIN_SUPPORT_ANALYTICS:       '/app/admin/support/analytics',
```

Role gate (wrap each route in the existing `RequireRole` HOC or equivalent):

```typescript
// Required role: 'org:admin'
// If user lacks org:admin, redirect to /app/dashboard with toast:
// "You don't have permission to access the doc pipeline."
```

---

## Animation Budget

Per the Experient frontend standard (see SideNav + CrystalPanel precedents):

| Transition | Duration | Easing |
|---|---|---|
| Panel swap (queue ↔ review) | 250ms | `cubic-bezier(0.22, 1, 0.36, 1)` (house ease) |
| Card appear (stagger) | 200ms per item, 30ms stagger | ease-out |
| Card dismiss (approve/reject) | 200ms | ease-in |
| Quality ring draw | 600ms | ease-out |
| Score badge color | 150ms | linear |
| Bottom sheet slide-up (mobile) | spring `stiffness:300 damping:30` | — |
| Swipe gesture spring-back | spring `stiffness:400 damping:40` | — |
| Skeleton pulse | 1.5s | `ease-in-out` loop |
| Toast appear | 200ms | ease-out, slide up 8px |
| Toast dismiss | 150ms | ease-in, slide down + fade |

Total animation budget on Screen 1 initial load: ≤ 600ms total perceived animation time; skeleton → content swap must not cause layout shift (CLS < 0.05).
