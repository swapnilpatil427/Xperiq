# Tags & Group Intelligence — UX Design

> **Design philosophy:** The XM industry has trained users to think about survey
> organization as a filing problem (folders, projects, programs). Xperiq's Intelligence
> Groups reframe it as a grouping-for-insight problem. Every interaction should feel like
> you are assembling a lens onto your data, not sorting documents into drawers.
>
> Aesthetic target: the precision of Linear's command palette, the flexibility of Notion's
> properties system, and the visual richness of Figma's object inspector. No platform in
> XM has come close to this bar.

---

## Design System Tokens for Tags

Before specifying interactions, we lock the visual tokens so every tag surface is
consistent.

### Tag Color Palette (14 colors)

These are curated to be accessible (WCAG AA on white), distinct from each other, and
harmonious with Xperiq's brand purple (`#6366F1`).

| Name | Hex | Usage |
|---|---|---|
| Indigo (default) | `#6366F1` | Default for new tags |
| Violet | `#8B5CF6` | |
| Purple | `#A855F7` | |
| Rose | `#F43F5E` | High-urgency / retention risk |
| Orange | `#F97316` | |
| Amber | `#F59E0B` | |
| Yellow | `#EAB308` | |
| Lime | `#84CC16` | |
| Emerald | `#10B981` | Positive / growing |
| Teal | `#14B8A6` | |
| Sky | `#0EA5E9` | |
| Blue | `#3B82F6` | |
| Slate | `#64748B` | Neutral / archived |
| Pink | `#EC4899` | |

**Background tint formula:** Each tag pill uses the tag color at 12% opacity as its
background, with the tag color at 100% for the text/icon. This creates the glassmorphism
effect without clashing with page backgrounds.

```css
/* Tailwind v4 dynamic tokens — set as CSS variables from tag.color */
--tag-color: #6366F1;
.tag-pill {
  background-color: color-mix(in srgb, var(--tag-color) 12%, transparent);
  color: var(--tag-color);
  border: 1px solid color-mix(in srgb, var(--tag-color) 25%, transparent);
}
```

### Tag Typography

- Tag name: `text-xs font-medium` (12px, 500 weight)
- Namespace prefix: `text-xs font-normal opacity-60` — rendered as `region:` before `APAC`
- Tooltip text: `text-xs` with `font-mono` for numbers

---

## 1. Tag Creation & Management

### 1a. Inline tag creation (survey card / survey edit page)

**Trigger:** The `+ Add tag` button appears on hover on any survey card (bottom-left of
the card) and is always visible in the survey detail header. Keyboard shortcut: pressing
`T` while a survey card is focused opens the picker immediately.

**Interaction flow:**

```
User presses T on survey card
        ↓
TagPicker popover opens (anchored below the card's tag row)
        ↓
[Search input — autofocused]
        ↓
List: existing org tags filtered by input
      + "Create '[input]'" option at the bottom if no exact match
        ↓
Click/Enter on existing tag → applied immediately (optimistic update)
Click/Enter on "Create..." → inline creation mode
        ↓
[Inline creation mode]
  Name field (pre-filled with input)
  Color picker (14 swatches, horizontal row)
  Emoji picker button (opens emoji panel — top 48 relevant emojis + search)
  Optional: namespace field (with dropdown of existing namespaces)
  [Create tag] button → creates tag + applies to survey
        ↓
Tag animates into the survey's tag row with a scale-in + fade-in (120ms, ease-out)
```

**TagPicker component spec:**
```typescript
interface TagPickerProps {
  surveyId: string;
  appliedTagIds: string[];
  onApply: (tagId: string) => void;
  onRemove: (tagId: string) => void;
  onCreateAndApply: (tagData: NewTagData) => void;
  anchor: 'bottom-left' | 'bottom-right' | 'top-left';
}
```

The picker uses Radix UI Popover so it handles portal-rendering, focus trapping, and
escape-to-close correctly. The search input debounces at 150ms — below this threshold
the list updates synchronously from the cached tag list (no API calls during typing).

**Color picker design:** 14 swatches in a 7×2 grid. Selected swatch shows a checkmark.
Hover reveals the color name as a tooltip. The color picker is part of the same popover
(no modal, no separate page) — it appears as a collapsible section below the name input.

**Emoji picker:** Not the full emoji keyboard. A curated grid of 48 icons most relevant
to XM (chart icons, geographic icons, department icons, sentiment icons) plus a free-text
emoji search. Renders as a 6×8 grid with 32px cells.

### 1b. Bulk tag application from survey list

**Trigger:** User selects 2+ surveys via checkboxes in the survey list → a bulk action
bar slides up from the bottom of the screen (similar to Notion's multi-select toolbar).

**Bulk action bar includes:**
- "X surveys selected" count
- "Apply tags" button → opens a TagPicker variant that shows which tags are applied
  to ALL selected surveys (checked), SOME (indeterminate dash), or NONE (unchecked)
- "Remove tags" to strip tags from all selected

**Partial application state:** When applying a tag to surveys where some already have it,
the tag is applied only to those that don't (no duplication). The confirmation toast says
"Tag 'Customer Onboarding' applied to 3 of 5 selected surveys (2 already had it)."

### 1c. Tag management at `/settings/tags`

A dedicated management page for org admins (and all users for their own-created tags).

**Layout:** Full-page table with left sidebar for namespace filter.

**Table columns:**
- Tag (color swatch + icon + name + namespace badge)
- Survey count (linked — click opens the survey list filtered to this tag)
- Total responses
- Aggregate NPS (with mini trend sparkline — 30-day, 48px wide)
- Created by / Created at
- Actions (Edit · Merge · Delete)

**Merge tags flow:** Select two tags → "Merge" → modal confirms which tag survives
(the target), shows impact: "N surveys will have their tag updated. Historical insight
data for the source tag will be preserved under the target tag."

**Namespace settings:** Below the tag table, a collapsible "Namespace Settings" section
shows all discovered namespaces with a lock toggle. Locking requires admin confirmation
modal.

---

## 2. Survey List with Tag Filtering

### 2a. Tag filter bar

The tag filter bar sits between the search input and the survey list. It is always
visible but shows only used tags.

**Visual design:**
```
[All] [Customer Onboarding ×] [Mobile App ×] [+ Add filter]
```

- Active filter pills have the tag's color as background tint (glassmorphism)
- `[All]` button resets all filters (visible when any filter is active)
- `[+ Add filter]` opens the TagPicker in filter mode (no create option, select only)
- Pill row is horizontally scrollable with gradient fade at the right edge

**Multi-tag filtering semantics:** By default, selecting multiple tags shows surveys
matching ANY of the tags (OR logic). A toggle button switches to AND logic. AND logic
is less common but powerful for precise filtering. The URL reflects the current filter
state: `?tags=mobile,q3-2026&match=all`.

**Filter state in URL:** All tag filter state is serialized into URL search params so any
filtered view is shareable and bookmarkable. React Router `useSearchParams` manages this.

### 2b. Group by tag view

Activated by a view toggle: `[List] [Group by tag]` in the survey list toolbar.

**Layout:** Surveys organized into horizontal swim lanes, one per active tag. Within
each lane, surveys render as compact cards in a horizontal scroll row.

**Swim lane header:**
- Tag color as a 4px left border + background tint on the header row
- Tag icon + name + survey count badge + NPS indicator
- "View Group Intelligence" chevron link → navigates to `/tag-insights/:slug`

**Empty state:** Surveys not tagged appear in a "Untagged" swim lane at the bottom
(collapsible). This creates a gentle nudge to tag everything.

### 2c. Tag pills on survey cards

Each survey card shows up to 3 tag pills in its footer row. If more than 3 tags are
applied, shows "+N more" that expands on click.

**Tag pill micro-interactions:**
- Hover on tag pill → tooltip: "12 surveys · 4,230 responses · NPS: +42"
- Click on tag pill → filters the list to that tag (stays in the survey list)
- Drag-to-reorder tags on a survey card (cosmetic display order)

---

## 3. Tag Intelligence View (`/tag-insights/:slug`)

This is the signature feature page. Every design decision should communicate: this is
not a filter, this is an analyst.

### 3a. Page header

Full-width colored header using the tag's color as a gradient wash.

```
[Tag icon 32px] [Tag name — text-2xl font-bold]  [namespace badge if set]
[survey_count surveys] · [total_responses total responses] · [daily_velocity responses/day]
                                                    [Edit tag] [Ask Crystal ↗]
```

The "Ask Crystal" button opens the Crystal panel with pre-loaded context:
"I want to understand the Intelligence Group: [tag name]"

### 3b. KPI row

Four KPI cards in a horizontal row, each with metric value (large, tag-colored), label,
delta from 30 days ago (green/red arrow + percentage), and sparkline (48px × 24px).

| Card | Value | Delta | Sparkline |
|---|---|---|---|
| Aggregate NPS | +42 | +8 pts (30d) | NPS trend |
| Total Responses | 4,230 | +12% (30d) | Response volume trend |
| Avg Sentiment | 72% | +3% (30d) | Sentiment trend |
| Response Velocity | 18.4 /day | +2.1 (30d) | Velocity trend |

**Trust score indicator:** If pipeline `trust_score < 0.70`, a subtle amber banner
appears below the KPI row: "Insights are based on fewer than 30 responses — interpret
with caution."

### 3c. NPS Trend chart

A full-width area chart showing rolling NPS across all surveys in the tag group.

- Library: Recharts (already used in Xperiq's insight dashboard)
- X-axis: dates; Y-axis: NPS score (-100 to +100)
- Fill area: tag color at 15% opacity below the line
- Toggle: "30 days / 60 days / 90 days"
- Annotation pins: Orange pin on detected anomalies (NPS drop >10 points in 3 days)

### 3d. Topic Heatmap

A 2-column grid of topic cards.

**Each topic card:**
- Topic name + frequency bar + sentiment indicator (green/amber/red dot)
- Frequency percentage label

**Hover expansion:** Shows 2-3 verbatim quotes from responses exemplifying this topic
and which specific surveys contribute most to it.

**Why not a word cloud:** Word clouds are visually fun but analytically useless —
word size conveys frequency but not sentiment. The grid with sentiment indicators
conveys both dimensions cleanly.

### 3e. Survey breakdown table

Sortable table of all surveys in the tag group.

**Columns:** Survey name · Status · NPS · Responses · Sentiment · Last response · Actions

**Sort:** Default by NPS descending (worst performers first).

**Color coding:** NPS cell: green (≥50), amber (20-49), red (<20).

### 3f. Crystal narrative panel

Distinct panel below the trend chart with Crystal branding:
- Left-border in `#6366F1`, background `#F8F7FF`, Crystal avatar icon
- 2-3 sentence intelligence summary
- "Refreshed X minutes ago" timestamp
- "Ask Crystal for more" button → opens Crystal chat with tag context

---

## 4. Auto-Tag Proposal UI

### 4a. Placement

1. **Survey creation flow:** After the user names their survey and clicks "Next"
2. **Survey edit page:** If title/questions are updated significantly, a banner appears

### 4b. Proposal card component

```
┌─────────────────────────────────────────────────────────┐
│  ✦ Crystal suggests Intelligence Groups for this survey  │
│                                                         │
│  Based on your survey content, these groups match:      │
│                                                         │
│  [🚀 Customer Onboarding  ✓ ✗]  [📱 Mobile App  ✓ ✗]  │
│  [📅 Q3 2026  ✓ ✗]  [+ New: "Checkout Flow"  ✓ ✗]     │
│                                                         │
│  [Accept all]  [Dismiss all]                            │
└─────────────────────────────────────────────────────────┘
```

**Each proposal pill:**
- Tag color swatch (if existing tag) or neutral gray (if new tag suggestion)
- `✓` accept / `✗` dismiss buttons
- Hover: shows Crystal's rationale tooltip

**New tag proposal:** Dashed border with `+` prefix. Accepting it creates the tag and
applies it.

**"Accept all" / "Dismiss all":** Bulk actions that animate all pills in sequence
(staggered by 50ms each) with Framer Motion's `staggerChildren`.

### 4c. Post-acceptance animation

When a tag proposal is accepted:
1. Pill in the proposal row shrinks (scale 1 → 0.8, opacity 1 → 0) over 150ms
2. Same tag pill animates in at the survey's tag row (scale 0.8 → 1, opacity 0 → 1) over 200ms
3. Uses Framer Motion's `layoutId` to create a "fly-to" effect

---

## 5. Tag Universe Visualization (Enterprise)

### 5a. Concept and placement

Route: `/tag-insights/universe`

For free/starter orgs: shows upgrade prompt.

### 5b. Force-directed graph

**Library:** D3.js force simulation, wrapped in a React component `<TagUniverseGraph>`.

**Nodes:**
- Node radius: proportional to `sqrt(survey_count)` — square root scale prevents
  large tags from overwhelming the layout
- Node fill: radial gradient from tag color (center) to transparent (edge), glowing orb effect
- NPS color overlay at 30% opacity: green (NPS > 40), amber (10-40), red (< 10)
- Label: tag name below node, visible for nodes with survey_count > 3

**Edges:**
- Edge = two tags co-occurring on the same survey
- Edge thickness proportional to `shared_survey_count` (min 1px, max 5px)
- Edges visible only when connecting nodes with ≥2 shared surveys

**Force simulation parameters:**
```javascript
d3.forceSimulation(nodes)
  .force('charge', d3.forceManyBody().strength(-300))
  .force('link', d3.forceLink(edges).distance(d => 150 / Math.log(d.shared_survey_count + 2)))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide(d => Math.sqrt(d.survey_count) * 12 + 20))
```

### 5c. Interactions

**Hover on node:**
- Node scales up 1.15× (Framer Motion spring)
- Tooltip panel slides in from the right edge
- Connected edges brighten; all other edges fade to 10% opacity

**Click on node:**
- Camera "flies" to the node via D3's zoom behavior over 600ms
- Side panel animates open with full Tag Intelligence data
- URL updates to `/tag-insights/universe?focus=customer-onboarding`

**Click on edge:**
- Opens mini-panel: "4 surveys are tagged both Customer Onboarding and Mobile App"

**Search overlay:** Floating search input. Typing highlights matching nodes, fades
non-matching nodes to 20% opacity.

---

## Interaction Micro-Details

### Tag pill glassmorphism
```css
.tag-pill {
  background: color-mix(in srgb, var(--tag-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tag-color) 20%, transparent);
  backdrop-filter: blur(4px);
  color: var(--tag-color);
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}
.tag-pill:hover {
  background: color-mix(in srgb, var(--tag-color) 20%, transparent);
}
```

### Keyboard shortcuts
| Shortcut | Action |
|---|---|
| `T` (on survey card focus) | Open TagPicker for that survey |
| `Escape` | Close TagPicker |
| `↑ ↓` in TagPicker | Navigate tag list |
| `Enter` in TagPicker | Apply selected tag |
| `Cmd+K` then "Tag..." | Universal command palette tag action |

### Animations summary
| Interaction | Animation | Duration |
|---|---|---|
| Tag applied to survey | Scale-in 0.8→1 + fade-in | 200ms ease-out |
| Tag removed from survey | Scale-out 1→0.8 + fade-out | 150ms ease-in |
| Filter pill added | Slide-in from left + fade-in | 180ms |
| Filter cleared | All pills fade + slide out | 120ms stagger |
| Auto-tag proposal fly-to | layoutId transition (Framer Motion) | 300ms spring |
| Universe node hover | Scale 1→1.15 | 200ms spring |
| Universe node click zoom | D3 zoom | 600ms ease-in-out |
| Tag Intelligence View data refresh | Fade-in new values | 400ms |

---

## Accessibility

- All tag pills have `role="button"` and descriptive `aria-label`
- TagPicker popover uses `role="listbox"` with `aria-activedescendant`
- Color is never the sole differentiator — tag icons and names always accompany color
- Force-directed graph includes an accessible table view toggle: "View as table"
- All filter state changes announce via `aria-live="polite"` region
- Focus management: closing the TagPicker returns focus to the trigger element
