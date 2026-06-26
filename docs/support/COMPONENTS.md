# Experient Support Site — Frontend Component Specification

**Status:** Implementation Reference  
**Owner:** Frontend Engineering  
**URL target:** `support.experient.ai`  
**Companion docs:** [DESIGN.md](./DESIGN.md), [SITE_STRUCTURE.md](./SITE_STRUCTURE.md), [CRYSTAL_SUPPORT.md](./CRYSTAL_SUPPORT.md)

---

## Design Token Reference

All components in this spec use the following tokens. These map 1:1 to the tokens defined in `app/src/styles/theme.css` and `app/src/index.css`. The support site is a standalone Next.js/Vite app that imports the same token sheet.

```css
/* Colors */
--color-primary:                  #2a4bd9
--color-tertiary:                 #8329c8
--color-secondary:                #00647c
--color-surface:                  #f5f7f9
--color-surface-container-lowest: #ffffff
--color-surface-container-low:    #eef1f3
--color-surface-container:        #e5e9eb
--color-on-surface:               #2c2f31
--color-on-surface-variant:       #595c5e
--color-outline-variant:          #abadaf
--color-success:                  #059669
--color-warning:                  #d97706
--color-error:                    #b41340

/* Typography */
--font-headline: "Manrope", sans-serif
--font-body:     "Inter", sans-serif

/* Radius */
rounded-xl   = 0.75rem   /* buttons, inputs */
rounded-2xl  = 1rem      /* cards */
rounded-full = 9999px    /* badges, pills, circles */

/* Shadows */
shadow-card:       0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)
shadow-card-hover: 0 20px 40px -8px color-mix(in srgb, #2a4bd9 14%, transparent)

/* Brand gradient (hero element) */
background: linear-gradient(135deg, var(--color-primary), var(--color-tertiary))
```

**Framer Motion house ease:** `[0.22, 1, 0.36, 1]`  
**Stagger:** `0.06s` between children  
**Page enter:** `opacity 0→1, y 10→0, duration 0.28s`

---

## 1. SupportTopBar

The top navigation bar for the support site. This is a standalone component — it does NOT use the app's `TopBar.tsx`. It is simpler, focused on documentation navigation, and includes the compact search bar slot.

### Props Interface

```typescript
interface SupportTopBarProps {
  /** Controls whether the compact UnifiedSearchBar renders in the top bar.
   *  False on the homepage (full hero search is visible), true on all other pages. */
  showSearch?: boolean;
  /** Active section key — used to highlight the current nav item */
  activeSection?: 'guides' | 'api' | 'crystal' | 'features' | 'roadmap' | 'status' | 'changelog';
}
```

### Visual Spec

- **Height:** 56px (desktop), 52px (mobile)
- **Background:** `var(--color-surface-container-lowest)` (#ffffff)
- **Bottom border:** `1px solid var(--color-outline-variant)` (#abadaf)
- **Padding:** `0 24px` (desktop), `0 16px` (mobile)
- **Position:** `sticky top-0 z-50`
- **Backdrop:** `backdrop-filter: blur(8px); background: rgba(255,255,255,0.92)` — frosted glass on scroll

**Left slot:**
- Logo: Experient logomark (20px × 20px gradient circle) + wordmark "Experient Support" in Manrope semibold 15px, `var(--color-on-surface)`
- On mobile: logomark only, wordmark hidden

**Center slot (desktop only):**
- Nav links: Guides · API Reference · Crystal · Features · Roadmap · Status
- Font: Inter 14px, `var(--color-on-surface-variant)`
- Active state: `var(--color-primary)`, `font-weight: 600`
- Hover: `var(--color-on-surface)`
- Gap between items: 28px

**Right slot:**
- When `showSearch={true}`: compact `UnifiedSearchBar` (40px height, 280px width)
- When `showSearch={false}`: empty (homepage has hero search below fold)
- Ghost button: "Back to app →" in Inter 13px, `var(--color-on-surface-variant)`, no border, hover underline

### Animation Spec

```typescript
// Framer Motion variant for the topbar on page load
const topBarVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
  }
}
```

Scroll behavior: add `shadow-sm` class when `scrollY > 8` (via scroll event listener + state).

### Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| `≥ 1024px` | Full nav links + search slot visible |
| `768–1023px` | Nav links hidden; hamburger menu icon (24px Material Symbol `menu`) appears in right slot |
| `< 768px` | Logo collapses to mark only; hamburger menu; search renders as icon-only trigger |

### Accessibility

- `role="navigation"` + `aria-label="Support site navigation"` on the `<nav>` wrapper
- Active nav item: `aria-current="page"`
- Hamburger button: `aria-label="Open navigation menu"`, `aria-expanded` toggled
- Skip link: `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>` as first child

---

## 2. UnifiedSearchBar

The most important component in the support site. It is the hero element on the homepage and the compact element in the TopBar. It is the single entry point for all Crystal-powered support queries and documentation lookup.

### Props Interface

```typescript
interface UnifiedSearchBarProps {
  /** Controls the visual size and layout variant */
  size: 'hero' | 'compact';
  /** Callback when user submits a query — triggers Crystal streaming */
  onSearch: (query: string) => void;
  /** Callback when user selects a quick doc suggestion from the dropdown */
  onDocSelect?: (docId: string, slug: string) => void;
  /** Controlled value — allows external reset (e.g. after navigation) */
  value?: string;
  onChange?: (value: string) => void;
  /** Placeholder cycles through examples when idle */
  placeholders?: string[];
  /** When true, the dropdown shows Crystal streaming answer in-place */
  inlineAnswer?: boolean;
  /** Passed down from parent to control open state externally (Cmd+K) */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

type SearchState = 'idle' | 'focused' | 'typing' | 'thinking' | 'results';
```

### Visual Spec

**Hero variant (homepage):**
- Height: 72px
- Width: 100%, max-width 720px, centered
- Border radius: `rounded-2xl` (1rem)
- Background: `var(--color-surface-container-lowest)` (#ffffff)
- Border: `1.5px solid var(--color-outline-variant)` in idle; `1.5px solid var(--color-primary)` in focused/typing/thinking
- Padding: `0 24px`
- Font: Inter 18px, `var(--color-on-surface)`
- Placeholder: Inter 18px, `var(--color-on-surface-variant)`, 0.5 opacity

**Compact variant (TopBar):**
- Height: 40px
- Width: 280px (desktop), collapses to icon on mobile
- Border radius: `rounded-xl` (0.75rem)
- Background: `var(--color-surface-container-low)` (#eef1f3)
- Border: none in idle; `1px solid var(--color-primary)` in focused
- Padding: `0 12px`
- Font: Inter 14px

**Focus glow effect (hero variant only):**
```css
box-shadow:
  0 0 0 4px color-mix(in srgb, var(--color-primary) 12%, transparent),
  0 8px 32px color-mix(in srgb, var(--color-primary) 10%, transparent);
```

**Left slot icon:**

| State | Icon | Details |
|-------|------|---------|
| `idle` | Sparkle gradient icon | 20px (hero) / 16px (compact). `auto_awesome` Material Symbol with `background: linear-gradient(135deg, #2a4bd9, #8329c8); -webkit-background-clip: text` |
| `focused` / `typing` | Same sparkle icon | No change |
| `thinking` | Spinner | 18px (hero) / 14px (compact). CSS `@keyframes spin` 0.8s linear infinite. Color: `var(--color-primary)` |
| `results` | Sparkle icon (animated pulse) | `@keyframes pulse` on opacity, 2s ease-in-out infinite |

**Right slot:**

| State | Content |
|-------|---------|
| `idle` | `⌘K` pill — Inter 12px, `var(--color-on-surface-variant)`, background `var(--color-surface-container-low)`, `rounded-md`, `px-1.5 py-0.5`, border `1px solid var(--color-outline-variant)` |
| `focused` / `typing` | `Enter ↵` pill — same style but border color `var(--color-primary)`, text `var(--color-primary)` |
| `thinking` | Empty (spinner is in left slot) |
| `results` | Clear `×` button — 20px circle, `var(--color-surface-container)` bg, `var(--color-on-surface-variant)` icon |

**Dropdown (results state):**
- Attaches below the input, same width
- Top gap: 8px
- Background: `var(--color-surface-container-lowest)` with `shadow-card`
- Border: `1px solid var(--color-outline-variant)`
- Border radius: `rounded-2xl` (1rem)
- Max height: 480px, `overflow-y: auto`
- Two sections:
  1. "Documentation" — up to 5 `DocResultCard` (compact variant)
  2. "Crystal Answer" — `CrystalAnswerCard` (streaming, renders inline)
- Section divider: `1px solid var(--color-surface-container)` with section label in 10px uppercase Manrope tracking-widest `var(--color-on-surface-variant)`

### Animation Spec

```typescript
// Height expand on focus (hero variant)
const inputVariants = {
  idle: { scale: 1 },
  focused: {
    scale: 1.01,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  }
}

// Dropdown slide-in
const dropdownVariants = {
  hidden: { opacity: 0, y: -8, scaleY: 0.96, transformOrigin: 'top' },
  visible: {
    opacity: 1, y: 0, scaleY: 1,
    transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
  },
  exit: {
    opacity: 0, y: -4, scaleY: 0.97,
    transition: { duration: 0.12 }
  }
}

// Placeholder cycling (idle state, hero variant)
// Use a text crossfade every 3s cycling through:
const defaultPlaceholders = [
  "Ask Crystal anything about Experient...",
  "How do I export my survey data?",
  "Why are my credits running low?",
  "Is SCIM provisioning supported?",
  "What happened in the last release?"
]
```

### Responsive Behavior

| Breakpoint | Hero | Compact |
|------------|------|---------|
| `≥ 768px` | Full 720px centered | 280px in TopBar |
| `< 768px` | Full width, 64px height | Icon-only (magnifying glass); taps open full-screen overlay |

**Mobile full-screen overlay:** When compact icon is tapped on mobile, a full-screen modal opens with an extra-large search input and no header obstruction. Animated with `y: '100%' → 0` from bottom.

### Keyboard Navigation

- `Cmd+K` / `Ctrl+K`: Opens compact search in TopBar from anywhere on the page
- `ArrowDown` / `ArrowUp`: Navigate dropdown results
- `Enter`: Select highlighted result or submit query to Crystal
- `Escape`: Close dropdown, blur input
- `Tab`: Moves focus through dropdown items

### Accessibility

- `role="combobox"`, `aria-expanded`, `aria-controls="search-dropdown"`, `aria-autocomplete="list"`
- Dropdown: `role="listbox"`, `id="search-dropdown"`
- Each result row: `role="option"`, `aria-selected`
- Thinking state: `aria-live="polite"` region announces "Crystal is thinking..."
- Input: `aria-label="Search Experient documentation and ask Crystal"`

---

## 3. CrystalAnswerCard

The card that renders Crystal's answer. Appears in the search dropdown (inline), on the `/search` results page (full), and in the `SupportCrystalPanel` message thread.

### Props Interface

```typescript
interface CrystalAnswerCardProps {
  /** The answer text — may be a partial stream or complete */
  content: string;
  /** Is this answer still streaming in? Controls cursor animation */
  isStreaming: boolean;
  /** Source documents Crystal cited */
  citations?: CrystalCitation[];
  /** Related known issues Crystal found */
  knownIssues?: KnownIssueSummary[];
  /** Resolved thumbs state from user interaction */
  thumbsState?: 'up' | 'down' | null;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  onOpenTicket?: () => void;
  /** Compact mode for search dropdown — hides action buttons */
  compact?: boolean;
  /** The mode Crystal is running in */
  mode?: 'support' | 'analyst';
}

interface CrystalCitation {
  id: string;
  label: string;     // e.g. "1", "2"
  title: string;     // doc title
  slug: string;      // URL path
  excerpt?: string;
}

interface KnownIssueSummary {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'resolved';
  workaroundAvailable: boolean;
}
```

### Visual Spec

**Card container:**
- Background: `var(--color-surface-container-lowest)` (#ffffff)
- Border: `1px solid var(--color-outline-variant)`
- Border radius: `rounded-2xl` (1rem)
- Box shadow: `shadow-card`
- Padding: `20px 24px`

**Header row:**
- Left: Crystal avatar — 32px circle, `background: linear-gradient(135deg, #2a4bd9, #8329c8)`, centered `auto_awesome` icon in white, 16px
- Center: "Crystal" label — Manrope semibold 14px, `var(--color-on-surface)`
- Right: Mode pill — `StatusBadge` variant; `support` = amber, `analyst` = primary blue

**Body text:**
- Font: Inter 15px, `var(--color-on-surface)`, line-height 1.6
- Inline citation chips: `[1]` `[2]` style — `<sup>` element, Inter 11px, `var(--color-primary)`, `cursor-pointer`, underline on hover
- Streaming cursor: `|` character, `@keyframes blink` 1s step-start infinite, `color: var(--color-primary)`. Removed when `isStreaming` becomes false.
- Streaming text appearance: characters fade in via `@keyframes fadeIn 0.1s ease-out`

**Citation chips row** (below body, only when citations present):
```
[1] Getting Started Guide    [2] API Reference — /surveys
```
Each chip: `rounded-full`, `px-2.5 py-1`, Inter 12px, background `var(--color-surface-container-low)`, border `1px solid var(--color-outline-variant)`, hover: border `var(--color-primary)`, `cursor-pointer`, transitions `0.15s`

**Source cards section** (below citation chips):
- Label: "Sources" in 11px uppercase Manrope tracking-widest `var(--color-on-surface-variant)`, `mb-8px`
- Cards: compact `DocResultCard` (no excerpt, just title + category), rendered in a horizontal scroll row on mobile, vertical stack on desktop

**Known issue banner** (when `knownIssues` non-empty):
- Background: amber 8% tint (`color-mix(in srgb, var(--color-warning) 8%, transparent)`)
- Left border: `3px solid var(--color-warning)`
- Border radius: `rounded-xl`
- Padding: `12px 16px`
- Icon: `warning` Material Symbol, 18px, `var(--color-warning)`
- Text: "Crystal found a related known issue." in Inter 13px, with link to `KnownIssueCard`

**Action buttons row** (hidden when `compact={true}`):
- `👍 Helpful` — ghost button, Inter 13px, `var(--color-on-surface-variant)`, hover: `var(--color-success)` text
- `👎 Still stuck` — ghost button, same style, hover: `var(--color-warning)` text
- `Open ticket →` — outline button, `var(--color-primary)` border/text, `rounded-xl`, `px-14px py-6px`
- When `thumbsState === 'up'`: replace buttons with "Glad that helped! ✓" in `var(--color-success)`, Inter 13px
- When `thumbsState === 'down'`: expand a "What was missing?" `<textarea>`, 3 rows, `rounded-xl`, border `var(--color-outline-variant)`, focus border `var(--color-primary)`

### States Summary

| State | Visual |
|-------|--------|
| Loading / Streaming | Header visible, body shows partial text + blinking cursor, actions hidden |
| Resolved | Full text, cursor gone, action buttons visible |
| Escalated | Actions replaced by `EscalationCard` |

### Animation Spec

```typescript
const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
  }
}

// Stagger children (header → body → citations → actions)
const containerVariants = {
  visible: {
    transition: { staggerChildren: 0.06 }
  }
}
```

### Accessibility

- `role="article"`, `aria-label="Crystal's answer"`
- Streaming: `aria-live="polite"` on the body text container, `aria-atomic="false"` (appends incrementally)
- Action buttons: `aria-label="Mark answer as helpful"`, `aria-label="Mark answer as not helpful"`
- Citation links: `aria-label="Source 1: Getting Started Guide"` (include document title)

---

## 4. DocResultCard

A search result card for a documentation article. Appears in search dropdown, search results page, and as source cards under `CrystalAnswerCard`.

### Props Interface

```typescript
interface DocResultCardProps {
  id: string;
  title: string;
  excerpt?: string;
  category: string;       // e.g. "API Reference", "Getting Started"
  slug: string;           // URL path for navigation
  status: DocStatus;
  updatedAt: string;      // ISO timestamp
  readingTimeMinutes?: number;
  /** Compact mode: no excerpt, condensed padding — used in CrystalAnswerCard sources */
  compact?: boolean;
  onClick?: (slug: string) => void;
}

type DocStatus = 'stable' | 'beta' | 'building' | 'planned' | 'new';
```

### Visual Spec

**Card container (full variant):**
- Background: `var(--color-surface-container-lowest)`
- Border: `1px solid var(--color-outline-variant)`
- Border radius: `rounded-2xl`
- Padding: `20px`
- Box shadow: `shadow-card`
- Transition: `box-shadow 0.2s ease, transform 0.2s ease`
- Hover: `shadow-card-hover`, `transform: translateY(-2px)`

**Compact variant:**
- Border radius: `rounded-xl`
- Padding: `12px 16px`
- No shadow, just border
- Height: 52px

**Title:**
- Font: Manrope semibold 15px (full) / 13px (compact), `var(--color-on-surface)`
- Max 2 lines, `overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2`

**Excerpt:**
- Font: Inter 14px, `var(--color-on-surface-variant)`, line-height 1.5
- Max 2 lines, same truncation as title
- Hidden in compact mode

**Metadata row** (below excerpt):
- Font: Inter 12px, `var(--color-on-surface-variant)`
- Layout: `flex items-center gap-8px`
- Content: `[category badge]` · `Updated {relative time}` · `{N} min read`
- Dot separators: `·` character in `var(--color-outline-variant)`

**Category badge:**
- Background: `var(--color-surface-container-low)`
- Border: `1px solid var(--color-outline-variant)`
- Border radius: `rounded-full`
- Padding: `px-2 py-0.5`
- Font: Inter 11px, `var(--color-on-surface-variant)`

**Status badge:** rendered as `StatusBadge` component (see component 5).

### Animation Spec

```typescript
const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
  }
}
// Applied via stagger from parent container
```

### Responsive Behavior

- Full width on mobile (no grid)
- `grid-cols-2` at 768px+ when displayed in search results grid
- Compact variant is always single-column

### Accessibility

- Entire card is a `<a>` tag wrapping all content — single focusable element
- `aria-label={title}` on the anchor
- Category badge and status badge use `aria-hidden="true"` (decorative, already in the readable label context)

---

## 5. StatusBadge

A reusable inline badge component for communicating feature or document status throughout the support site.

### Props Interface

```typescript
interface StatusBadgeProps {
  variant: StatusVariant;
  /** Optionally override the display label */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

type StatusVariant =
  | 'stable'
  | 'beta'
  | 'building'
  | 'planned'
  | 'shipped'
  | 'active'      // for KnownIssueCard
  | 'resolved'    // for KnownIssueCard
  | 'feature'     // for ChangelogEntry
  | 'fix'
  | 'improvement'
  | 'breaking';
```

### Visual Spec

All badges share the base style:
```css
font-family: var(--font-body); /* Inter */
font-weight: 900;              /* font-black */
font-size: 10px;
text-transform: uppercase;
letter-spacing: 0.08em;        /* tracking-widest */
border-radius: 9999px;         /* rounded-full */
padding: 2px 10px;             /* py-0.5 px-2.5 */
display: inline-flex;
align-items: center;
white-space: nowrap;
```

Per-variant colors:

| Variant | Background | Text color | Border |
|---------|-----------|------------|--------|
| `stable` | `color-mix(in srgb, #059669 12%, transparent)` | `#059669` | none |
| `beta` | `color-mix(in srgb, #d97706 12%, transparent)` | `#d97706` | none |
| `building` | `color-mix(in srgb, #8329c8 12%, transparent)` | `#8329c8` | none |
| `planned` | `var(--color-surface-container)` | `var(--color-on-surface-variant)` | `1px solid var(--color-outline-variant)` |
| `shipped` | `#059669` | `#ffffff` | none |
| `active` | `color-mix(in srgb, #d97706 12%, transparent)` | `#d97706` | none |
| `resolved` | `color-mix(in srgb, #059669 12%, transparent)` | `#059669` | none |
| `feature` | `color-mix(in srgb, #2a4bd9 10%, transparent)` | `#2a4bd9` | none |
| `fix` | `color-mix(in srgb, #059669 10%, transparent)` | `#059669` | none |
| `improvement` | `color-mix(in srgb, #8329c8 10%, transparent)` | `#8329c8` | none |
| `breaking` | `color-mix(in srgb, #b41340 12%, transparent)` | `#b41340` | none |

**`sm` size:** `font-size: 9px`, `padding: 1px 8px`

**Default label text per variant:**
- `stable` → "STABLE"
- `beta` → "BETA"
- `building` → "IN PROGRESS"
- `planned` → "PLANNED"
- `shipped` → "SHIPPED ✓"
- `active` → "ACTIVE"
- `resolved` → "RESOLVED"
- `feature` → "FEATURE"
- `fix` → "FIX"
- `improvement` → "IMPROVEMENT"
- `breaking` → "BREAKING"

### Animation Spec

No animation — badges are static. If appearing as part of a staggered list, they inherit the parent's `motion.div` entry animation.

### Accessibility

- `role="status"` when `variant` is `active` or `building`
- `aria-label={fullLabelText}` — e.g. `aria-label="Status: Beta"` for screen reader clarity on abbreviated text

---

## 6. RoadmapCard

Displayed on the `/roadmap` ("What's Coming") page. Three visual variants correspond to the feature's current development state.

### Props Interface

```typescript
interface RoadmapCardProps {
  variant: 'shipped' | 'in-progress' | 'planned';
  title: string;
  description: string;
  sprintLabel?: string;    // e.g. "Sprint 8"
  etaLabel?: string;       // e.g. "Expected Sprint 9"
  progressPercent?: number; // 0–100, for in-progress variant
  docsSlug?: string;       // if docs exist, "Read docs →" link
  category?: string;       // e.g. "Crystal AI", "Billing", "Integrations"
}
```

### Visual Spec

**Shared card container:**
- Background: `var(--color-surface-container-lowest)`
- Border radius: `rounded-2xl`
- Box shadow: `shadow-card`
- Padding: `24px`
- Left accent border: `4px solid` (color varies by variant)
- Transition: `box-shadow 0.2s ease, transform 0.2s ease`
- Hover: `shadow-card-hover`, `transform: translateY(-2px)`

**Shipped variant:**
- Left border color: `var(--color-success)` (#059669)
- Badge: `StatusBadge variant="shipped"` — "SHIPPED ✓"
- Sprint label: Inter 12px, `var(--color-on-surface-variant)`, above title
- Title: Manrope semibold 16px, `var(--color-on-surface)`
- Description: Inter 14px, `var(--color-on-surface-variant)`, line-height 1.5
- "Read docs →" link: Inter 13px, `var(--color-primary)`, hover underline — only if `docsSlug` provided

**In Progress variant:**
- Left border color: `var(--color-tertiary)` (#8329c8)
- Badge: `StatusBadge variant="building"` — "IN PROGRESS"
- Progress bar: `ProgressBar` component (see component 7) below description
- ETA chip: Inter 12px, background `color-mix(in srgb, #8329c8 10%, transparent)`, text `var(--color-tertiary)`, `rounded-full`, `px-2.5 py-0.5`, beside the badge

**Planned variant:**
- Left border color: `var(--color-outline-variant)` (#abadaf)
- Badge: `StatusBadge variant="planned"` — "PLANNED"
- Title and description: slightly muted — title `var(--color-on-surface-variant)`, description `var(--color-outline-variant)` — communicates this is future work
- No progress bar, no docs link

### Animation Spec

```typescript
// Cards stagger in on page load
const roadmapContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 }
  }
}

const roadmapCardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] }
  }
}
```

### Responsive Behavior

- Single column on mobile (< 768px)
- 2-column grid at 768px–1199px
- 3-column grid at 1200px+ (shipped on left, in-progress center, planned right — if filtered by section)

### Accessibility

- `role="article"`, `aria-label={title}`
- If `progressPercent` present: `aria-label={`${progressPercent}% complete`}` on the progress bar container
- "Read docs →" link: `aria-label={`Read documentation for ${title}`}`

---

## 7. ProgressBar

A focused, reusable progress bar component. Used inside `RoadmapCard` (in-progress variant) and anywhere else a completion percentage is displayed.

### Props Interface

```typescript
interface ProgressBarProps {
  /** 0–100 */
  percent: number;
  /** Show the "N% complete" label below the bar */
  showLabel?: boolean;
  /** Animate fill in on mount */
  animated?: boolean;
  className?: string;
}
```

### Visual Spec

**Track:**
- Height: 6px
- Background: `var(--color-surface-container)` (#e5e9eb)
- Border radius: `rounded-full`
- Width: 100%

**Fill:**
- Background: `linear-gradient(90deg, var(--color-primary), var(--color-tertiary))`
- Height: 100%
- Border radius: `rounded-full`
- Width: `${percent}%`

**Label (when `showLabel={true}`):**
- Font: Inter 11px, `var(--color-on-surface-variant)`
- Margin top: 4px
- Text: `${percent}% complete`

### Animation Spec

```typescript
// CSS transition on the fill element width
// Applied on mount after a 100ms delay to ensure the enter animation is visible
const fillStyle = {
  width: animated ? `${percent}%` : `${percent}%`,
  transition: animated ? 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
}

// Initial width is 0 (set via useEffect on mount, then toggled to percent)
```

### Accessibility

- Outer container: `role="progressbar"`, `aria-valuenow={percent}`, `aria-valuemin={0}`, `aria-valuemax={100}`, `aria-label="Feature completion progress"`

---

## 8. KnownIssueCard

Rendered when Crystal's support skill identifies a known platform issue matching a user's query. Also displayed in a dedicated "Known Issues" section of the documentation.

### Props Interface

```typescript
interface KnownIssueCardProps {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'resolved';
  workaround?: string;           // Markdown string — renders in collapsible
  etaLabel?: string;             // e.g. "Fix expected Sprint 9"
  affectedFeatures?: string[];   // e.g. ["CSV Export", "API"]
  resolvedAt?: string;           // ISO timestamp, only when status='resolved'
}
```

### Visual Spec

**Card container:**
- Background: `var(--color-surface-container-lowest)`
- Border radius: `rounded-2xl`
- Left accent border: `4px solid`
  - Active: `var(--color-warning)` (#d97706)
  - Resolved: `var(--color-success)` (#059669)
- Box shadow: `shadow-card`
- Padding: `20px 24px`

**Header row:**
- `StatusBadge` for status (`active` or `resolved`) — left aligned
- Severity badge — right aligned:
  - Critical: `rounded-full px-2.5 py-0.5`, background `color-mix(in srgb, #b41340 12%, transparent)`, text `#b41340`, font-black 10px uppercase
  - High: amber tint + amber text
  - Medium: primary tint + primary text
  - Low: muted surface + `var(--color-on-surface-variant)` text

**Title:**
- Manrope semibold 15px, `var(--color-on-surface)`
- Max 2 lines with ellipsis overflow

**Description:**
- Inter 14px, `var(--color-on-surface-variant)`, line-height 1.5
- Max 3 lines truncated with `See more` toggle

**Workaround section (collapsible):**
- Trigger: "Workaround available ▸" / "Hide workaround ▾" — Inter 13px, `var(--color-primary)`, pointer cursor
- Expand animation: `height: 0 → auto` via Framer Motion `AnimatePresence` + `motion.div` with `overflow: hidden`
- Body: Inter 14px, background `var(--color-surface-container-low)`, `rounded-xl`, `p-12px`, margin-top 8px
- Renders as plain text or markdown (no code blocks)

**Footer row:**
- ETA pill: Inter 12px, background `color-mix(in srgb, var(--color-warning) 8%, transparent)`, text `var(--color-warning)`, `rounded-full`, `px-2.5 py-0.5` — only when `status='active'` and `etaLabel` present
- Affected features: small tag list, same style as category badges in DocResultCard

### Animation Spec

```typescript
const workaroundVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto', opacity: 1,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
  }
}
```

### Accessibility

- `role="alert"` when `severity='critical'` and `status='active'` to announce to screen readers
- Workaround toggle: `aria-expanded`, `aria-controls="workaround-{id}"`
- Workaround body: `id="workaround-{id}"`

---

## 9. DocPage Layout Components

A suite of closely related components that compose individual documentation article pages. All share the same design token base.

### 9a. DocBreadcrumb

```typescript
interface DocBreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
  // last item is always the current page — bold, no link
}
```

Visual: items separated by `›` chevron character (Inter 12px, `var(--color-outline-variant)`). All items except last: Inter 13px, `var(--color-on-surface-variant)`, hover `var(--color-primary)`, underline on hover. Last item: Inter 13px, `font-weight: 600`, `var(--color-on-surface)`, no link.

Accessibility: `<nav aria-label="Breadcrumb"><ol>` with `<li>` for each item. Last item has `aria-current="page"`.

---

### 9b. DocTabBar

```typescript
interface DocTabBarProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onChange: (id: string) => void;
}
```

Visual: horizontal list of tab labels. Shared base: Inter 14px, `px-4 py-2.5`, cursor-pointer. Inactive: `var(--color-on-surface-variant)`, hover `var(--color-on-surface)`. Active: `var(--color-primary)`, `font-weight: 600`.

**Animated underline indicator:** `motion.div` with `background: var(--color-primary)`, `height: 2px`, `border-radius: 1px`, uses `layoutId="tab-indicator"` for Framer Motion layout animation — slides smoothly between tabs.

Container: `border-bottom: 1px solid var(--color-outline-variant)`.

---

### 9c. DocParamsTable

```typescript
interface DocParamsTableProps {
  params: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
    default?: string;
  }>;
}
```

Visual: full-width `<table>`. `thead` background `var(--color-surface-container-low)`, th font Inter 12px font-semibold uppercase `var(--color-on-surface-variant)`, `px-4 py-3`. `tbody` alternating rows: odd `var(--color-surface-container-lowest)`, even `var(--color-surface-container-low)`. `td` Inter 14px, `px-4 py-3`, `var(--color-on-surface)`.

`name` column: `<code>` element — monospace font 13px, background `var(--color-surface-container)`, `rounded`, `px-1 py-0.5`.

Required indicator: `*` asterisk in `var(--color-primary)` (`font-weight: 700`) appended after param name when `required=true`.

Border: `1px solid var(--color-outline-variant)` around whole table, `border-radius: rounded-xl`.

---

### 9d. CodeBlock

```typescript
interface CodeBlockProps {
  code: string;
  language: string;       // e.g. 'typescript', 'bash', 'json'
  /** Multiple language tabs — if provided, renders tab switcher */
  tabs?: Array<{ language: string; label: string; code: string }>;
  filename?: string;
}
```

Visual:
- Container border radius: `rounded-xl`
- Header bar: `24px` height, background `#13141f`, `border-radius: rounded-xl rounded-xl 0 0`
  - Left: language tab switcher (if `tabs`) — Inter 12px, `#9ca3af`, active tab: `#ffffff`, `border-bottom: 2px solid var(--color-primary)`, `px-3 py-1`
  - Left (no tabs): `filename` in Inter 12px `#9ca3af`, OR language label
  - Right: Copy button — 28px × 28px, `rounded-lg`, background `rgba(255,255,255,0.06)`, hover `rgba(255,255,255,0.12)`, icon `content_copy` in `#9ca3af`; after copy: shows `check` icon + "Copied!" for 2s
- Code body: background `#1a1b26`, padding `20px 24px`, `overflow-x: auto`
  - Font: `'JetBrains Mono', 'Fira Code', monospace`, 13px, line-height 1.7
  - Syntax highlighting via CSS classes: `.token.keyword` `#7c94ff`, `.token.string` `#9ece6a`, `.token.comment` `#565f89`, `.token.number` `#ff9e64`, `.token.function` `#7aa2f7`, `.token.operator` `#89ddff`

---

### 9e. DocFeedback

```typescript
interface DocFeedbackProps {
  docId: string;
  onSubmit: (helpful: boolean, comment?: string) => void;
}
```

Visual: row at the bottom of every doc page. "Was this helpful?" in Inter 14px `var(--color-on-surface-variant)`. Two icon buttons: thumbs-up (👍) and thumbs-down (👎) — 32px, `rounded-full`, background `var(--color-surface-container)`, hover fill with appropriate success/warning color.

When 👎 clicked: expand a `<textarea>` below — 3 rows, `rounded-xl`, `border: 1px solid var(--color-outline-variant)`, focus `var(--color-primary)`, placeholder "What was missing or unclear?". Submit button: primary filled, `rounded-xl`.

Confirmation: after submit, replace with "Thanks for the feedback!" in `var(--color-success)`.

---

### 9f. DocSidebar

```typescript
interface DocSidebarProps {
  headings: Array<{ id: string; text: string; level: 2 | 3 }>;
  onAskCrystal?: () => void;
  activeHeadingId?: string;
}
```

Visual:
- Width: 220px, `position: sticky`, `top: 80px`
- "On this page" label: Inter 11px uppercase tracking-widest `var(--color-on-surface-variant)`, `mb-12px`
- Heading links: Inter 13px, `var(--color-on-surface-variant)`, hover `var(--color-primary)`. `h3` items: `pl-12px`. Active item: `var(--color-primary)`, left border `2px solid var(--color-primary)`, `pl-10px`
- "Ask Crystal about this page" button: full-width, `rounded-xl`, `border: 1px solid var(--color-primary)`, `var(--color-primary)` text, `auto_awesome` icon, Inter 13px. Hover: filled primary.

---

## 10. SupportCrystalPanel

The in-app Crystal panel rendered in support mode. This is a modified version of the app's existing `CrystalPanel.tsx` but scoped to support context (not data analysis). Slides in from the right edge of the viewport over all page content.

### Props Interface

```typescript
interface SupportCrystalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Mode determines the UI color accent and Crystal behavior */
  mode: 'support' | 'analyst';
  initialQuery?: string;  // Pre-populate the input from a search
}

interface SupportMessage {
  id: string;
  role: 'user' | 'crystal';
  content: string;
  timestamp: Date;
  citations?: CrystalCitation[];
  toolCallLabel?: string;  // e.g. "Searching documentation..."
  isStreaming?: boolean;
  escalation?: EscalationPreview;
}

interface EscalationPreview {
  title: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  suggestedSteps: string[];
}
```

### Visual Spec

**Panel container:**
- Dimensions: `width: 420px`, `height: 100vh`
- Position: `fixed right-0 top-0 z-50`
- Background: `var(--color-surface-container-lowest)` (#ffffff)
- Left border: `1px solid var(--color-outline-variant)`
- Box shadow: `0 0 40px rgba(0,0,0,0.12)`

**Header:**
- Height: 60px
- Padding: `0 20px`
- Crystal avatar: 28px gradient circle + sparkle icon (white 14px)
- "Crystal" label: Manrope semibold 15px, `var(--color-on-surface)`
- Mode pill: `StatusBadge` — `support` mode → amber tint with "Support" label; `analyst` mode → primary tint with "Analyst" label
- Close button: ×, 28px, `rounded-full`, `var(--color-surface-container)` bg, hover `var(--color-surface-container-high)`
- Bottom border: `1px solid var(--color-surface-container)`

**Message thread:**
- Padding: `16px`
- Scroll: `overflow-y: auto`, `flex-direction: column`, `gap: 12px`
- User bubble (right-aligned):
  - Background: `var(--color-primary)` (#2a4bd9)
  - Color: `var(--color-on-primary)` (#f2f1ff)
  - Border radius: `rounded-2xl rounded-br-sm`
  - Padding: `10px 14px`
  - Font: Inter 14px, line-height 1.5
  - Max width: 80%
  - Self-align: `flex-end`
- Crystal bubble (left-aligned):
  - Background: `var(--color-surface-container-lowest)`
  - Border: `1px solid var(--color-outline-variant)`
  - Border radius: `rounded-2xl rounded-bl-sm`
  - Box shadow: `shadow-card`
  - Padding: `12px 16px`
  - Max width: 90%
  - Self-align: `flex-start`
  - Contains full `CrystalAnswerCard` body (without the outer card shell — just the content)

**Tool call indicator:**
- Background: `var(--color-surface-container-low)`, `rounded-xl`, `px-12px py-8px`
- Icon: `search` Material Symbol, 14px, `var(--color-primary)`
- Text: "Searching documentation..." — Inter 13px, `var(--color-on-surface-variant)`, italic
- Animated dots: three dots `···` cycling in sequence via CSS `@keyframes dot-blink`

```css
@keyframes dot-blink {
  0%, 60%, 100% { opacity: 0.2 }
  30% { opacity: 1 }
}
.dot-1 { animation: dot-blink 1.4s infinite 0s }
.dot-2 { animation: dot-blink 1.4s infinite 0.2s }
.dot-3 { animation: dot-blink 1.4s infinite 0.4s }
```

**Input bar:**
- Height: 40px
- Border radius: `rounded-xl`
- Background: `var(--color-surface-container-low)`
- Border: `1px solid var(--color-outline-variant)`
- Focus border: `var(--color-primary)`
- Padding: `0 12px`
- Font: Inter 14px
- Left icon: `mic` Material Symbol, 18px, `var(--color-on-surface-variant)`; tapping activates voice input
- Right: Send button — 28px circle, `background: linear-gradient(135deg, var(--color-primary), var(--color-tertiary))`, `send` icon in white 14px, hover `opacity: 0.9`

**Input row container:** 56px, padding `8px 16px`, border-top `1px solid var(--color-surface-container)`.

**Escalation card** (when Crystal decides to escalate):
- Background: `var(--color-surface-container-lowest)`
- Border: `1px solid var(--color-outline-variant)`
- Left border: `4px solid var(--color-error)` if `priority='critical'`, else `var(--color-warning)`
- Border radius: `rounded-2xl`
- Padding: `16px 20px`
- Header: "Escalation to Support" label in Manrope semibold 13px
- Fields: title, category, priority badge, summary text, suggested steps list
- CTA: "Confirm ticket →" — primary filled button, `rounded-xl`, full width

### Animation Spec

```typescript
const panelVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0, opacity: 1,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
  },
  exit: {
    x: '100%', opacity: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
  }
}

const messageVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  }
}
```

### Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| `≥ 768px` | 420px fixed panel on right |
| `< 768px` | Full-screen bottom sheet (100vw, 90vh, `border-radius: 20px 20px 0 0`, slides up from bottom) |

### Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-label="Crystal Support Panel"`
- When opened, focus moves to the input bar
- `Escape` closes the panel; focus returns to the trigger element
- Message thread: `aria-live="polite"` for new Crystal messages
- Tool call indicator: `aria-live="polite"`, announced as "Crystal is searching..."

---

## 11. CommandPalette (Cmd+K Extended)

The global command palette for the support site. Extends the standard Cmd+K experience with support-specific sections (Crystal, Documentation, Feature Status). This is a standalone overlay — it does NOT share state with the main app's command palette.

### Props Interface

```typescript
interface SupportCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
  onCrystalQuery: (query: string) => void;
}

interface CommandPaletteResult {
  type: 'crystal' | 'doc' | 'feature-status' | 'action';
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;  // Material Symbol name
  href?: string;
  action?: () => void;
}
```

### Visual Spec

**Overlay:**
- `position: fixed; inset: 0; z-index: 100`
- Background: `rgba(0,0,0,0.5)`
- `backdrop-filter: blur(4px)`
- Click-outside closes palette

**Modal:**
- Width: 640px, centered horizontally
- Vertical position: `top: 15vh`
- Max height: `80vh`
- Background: `var(--color-surface-container-lowest)` (#ffffff)
- Border radius: `rounded-2xl` (1rem)
- Box shadow: `0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)`
- `overflow: hidden` (content scrolls internally)

**Search input:**
- Height: 56px
- Border: none, border-bottom `1px solid var(--color-outline-variant)`
- Padding: `0 20px`
- Font: Inter 17px, `var(--color-on-surface)`
- Placeholder: Inter 17px, `var(--color-on-surface-variant)` 0.5 opacity, "Search docs, ask Crystal..."
- Left icon: `auto_awesome` sparkle, 20px, gradient fill (primary→tertiary)
- Right: clear `×` button — 24px, `rounded-full`, `var(--color-surface-container)` bg — visible when input non-empty

**Results container:**
- Overflow-y: auto, max-height: `calc(80vh - 56px)`
- Padding: `8px 0 12px`

**Section headers:**
- Font: Inter 10px, uppercase, `letter-spacing: 0.1em`, `var(--color-on-surface-variant)`
- Padding: `8px 20px 4px`
- Not selectable/focusable

**Result rows:**
- Height: 48px
- Padding: `0 20px`
- Layout: `display: flex; align-items: center; gap: 12px`
- Icon: 18px Material Symbol, `var(--color-on-surface-variant)`, in 32px centered `rounded-xl` container with `var(--color-surface-container-low)` background
- Title: Inter 14px, `var(--color-on-surface)`
- Subtitle/metadata: Inter 12px, `var(--color-on-surface-variant)`
- Selected/keyboard highlight: background `var(--color-surface-container-low)`, title → `var(--color-primary)`, icon container bg → `color-mix(in srgb, var(--color-primary) 10%, transparent)`
- Hover: same as keyboard highlight

**Sections order:**
1. "Crystal" — shows "Ask Crystal: [your query]" row when input has text
2. "Documentation" — top 5 matching docs from search index
3. "Feature Status" — matching features from roadmap/TRACKER

**Footer (static):**
- Height: 36px, border-top `1px solid var(--color-surface-container)`
- Keyboard hints: `↑↓` navigate, `↵` select, `Esc` close — Inter 11px, `var(--color-on-surface-variant)`, with `<kbd>` styling

### Animation Spec

```typescript
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.12 } }
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -10 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  },
  exit: {
    opacity: 0, scale: 0.97,
    transition: { duration: 0.15 }
  }
}
```

### Keyboard Navigation

- `ArrowDown` / `ArrowUp`: move selected result index
- `Enter`: activate selected result (navigate or trigger Crystal query)
- `Escape`: close palette
- `Cmd+K` / `Ctrl+K`: toggle open/close globally (registered at document level)
- Tab: should be trapped inside the modal while open

### Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`
- Input: `role="combobox"`, `aria-expanded="true"`, `aria-activedescendant` points to currently selected row ID
- Results list: `role="listbox"`
- Each result: `role="option"`, `aria-selected`, `id="cmd-result-{id}"`
- When palette opens: focus moves to input
- When palette closes: focus returns to trigger element

---

## 12. StatusComponentGrid

The platform status display on `/status`. Shows real-time health of each Experient platform component.

### Props Interface

```typescript
interface StatusComponentGridProps {
  components: PlatformComponent[];
  lastUpdated: string;  // ISO timestamp
}

interface PlatformComponent {
  id: string;
  name: string;         // e.g. "Crystal AI", "Survey API", "Data Export"
  status: 'healthy' | 'degraded' | 'down' | 'maintenance';
  responseTimeMs?: number;
  uptimeLast7Days?: number;   // 0–100 percentage
  sparklineData?: number[];   // 30 data points, response times in ms
}
```

### Visual Spec

**Grid container:**
- `display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px`
- Single column on mobile (< 640px)

**Component cell:**
- Background: `var(--color-surface-container-lowest)`
- Border: `1px solid var(--color-outline-variant)`
- Border radius: `rounded-2xl`
- Padding: `16px 20px`
- Box shadow: `shadow-card`

**Component name:** Manrope semibold 14px, `var(--color-on-surface)`

**Status dot:**
- Size: 8px circle, `rounded-full`
- Colors: healthy `var(--color-success)` (#059669); degraded `var(--color-warning)` (#d97706); down `var(--color-error)` (#b41340); maintenance `var(--color-primary)` (#2a4bd9)
- Healthy dot: adds CSS `@keyframes pulse-ring` — faint ring expands and fades, 2s infinite

**Response time:** Inter 13px, `var(--color-on-surface-variant)`, right-aligned in same row as name+dot

**Sparkline:**
- Width: 60px, height: 24px, SVG `<path>`
- Stroke: `var(--color-primary)` at 60% opacity (healthy), `var(--color-warning)` (degraded), `var(--color-error)` (down)
- Stroke width: 1.5
- Fill: gradient from stroke color at 15% opacity to transparent (area chart)
- No axes, no labels — pure visual indicator

**Hover tooltip:**
- `position: absolute`, triggered on cell hover
- Shows: "Last 7 days: 99.94% uptime" — Inter 12px white on `#1a1b26` background, `rounded-lg`, `px-2.5 py-1.5`, `box-shadow: 0 4px 12px rgba(0,0,0,0.2)`

**Overall status banner** (above grid):
- Green: "All systems operational" — `var(--color-success)` bg tint, `checkmark_circle` icon
- Yellow: "Degraded performance on some systems" — `var(--color-warning)` tint, `warning` icon
- Red: "Service disruption detected" — `var(--color-error)` tint, `error` icon

### Accessibility

- Each component cell: `role="status"`, `aria-label="{name}: {status}, {responseTimeMs}ms response time"`
- Sparkline SVG: `aria-hidden="true"` (decorative)
- Overall banner: `role="alert"` when `down` components exist

---

## 13. ChangelogEntry

A single entry in the release changelog on `/changelog`. Entries are auto-generated from the TRACKER.md and git release tags.

### Props Interface

```typescript
interface ChangelogEntryProps {
  date: string;           // ISO date string
  sprintLabel?: string;   // e.g. "Sprint 8"
  category: ChangelogCategory;
  title: string;
  description: string;
  docsSlug?: string;
  /** Whether to render in compact list mode or expanded standalone card */
  variant?: 'card' | 'list-item';
}

type ChangelogCategory = 'feature' | 'fix' | 'improvement' | 'breaking';
```

### Visual Spec

**Card variant:**
- Background: `var(--color-surface-container-lowest)`
- Border: `1px solid var(--color-outline-variant)`
- Border radius: `rounded-2xl`
- Padding: `20px 24px`
- Box shadow: `shadow-card`

**List-item variant (changelog feed):**
- No card shell — just the content inline, separated by `1px solid var(--color-surface-container)` dividers
- Padding: `16px 0`

**Date pill:**
- Inter 12px, `var(--color-on-surface-variant)`
- Background: `var(--color-surface-container-low)` (#eef1f3)
- Border radius: `rounded-full`
- Padding: `px-2.5 py-0.5`
- Format: "Jun 2026"

**Sprint label:** Inter 12px, `var(--color-on-surface-variant)`, displayed beside date pill with `·` separator

**Category badge:** `StatusBadge` component with variant mapped to category

**Title:** Manrope semibold 15px, `var(--color-on-surface)`

**Description:** Inter 14px, `var(--color-on-surface-variant)`, line-height 1.5, max 2 lines in list-item variant (expandable), full in card variant

**"View docs →" link:** Inter 13px, `var(--color-primary)`, hover underline — only rendered when `docsSlug` is provided

### Animation Spec

```typescript
// Stagger on scroll — use Framer Motion whileInView
const entryVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
  }
}
// Apply with viewport: { once: true, margin: "-50px" }
```

### Responsive Behavior

- Single column on all breakpoints (changelog is a vertical feed)
- Date pill and sprint label stack vertically on mobile (< 480px) instead of horizontal

### Accessibility

- `role="article"`, `aria-label="{title} — {date}"`
- "View docs" link: `aria-label="View documentation for {title}"`

---

## 14. NotifyMeButton

A subscription CTA on the `/roadmap` page that lets users subscribe to updates for planned or in-progress features.

### Props Interface

```typescript
interface NotifyMeButtonProps {
  featureId: string;
  featureTitle: string;
  onSubscribe: (featureId: string) => Promise<void>;
  onUnsubscribe: (featureId: string) => Promise<void>;
  /** Controlled state — parent fetches subscription status on mount */
  isSubscribed: boolean;
  /** While the subscribe/unsubscribe action is in flight */
  isLoading?: boolean;
  size?: 'sm' | 'md';
}
```

### Visual Spec

**Default state (not subscribed):**
- Style: outline variant
- Border: `1.5px solid var(--color-primary)`
- Text color: `var(--color-primary)`
- Background: transparent
- Border radius: `rounded-xl` (0.75rem)
- Padding: `sm` → `px-3 py-1.5`; `md` → `px-4 py-2`
- Font: Inter, `sm` 13px; `md` 14px, font-weight 500
- Icon left: `notifications_none` Material Symbol, 16px (sm) / 18px (md)
- Label: "Notify me"
- Hover: `background: var(--color-primary)`, `color: var(--color-on-primary)` (#f2f1ff), transition `0.15s ease`
- Focus: `outline: 2px solid var(--color-primary); outline-offset: 2px`

**Subscribed state:**
- Background: `color-mix(in srgb, var(--color-success) 10%, transparent)`
- Border: `1.5px solid var(--color-success)`
- Text color: `var(--color-success)`
- Icon: `notifications_active` Material Symbol (filled), 16px (sm) / 18px (md)
- Label: "Subscribed ✓"
- Hover: `background: color-mix(in srgb, var(--color-error) 10%, transparent)`, `border-color: var(--color-error)`, `color: var(--color-error)`, label changes to "Unsubscribe" — only on hover to confirm intent

**Loading state:**
- Show a 14px (sm) / 16px (md) spinner in place of the icon
- Disable pointer events: `pointer-events: none; opacity: 0.7`

### Animation Spec

```typescript
// Transition between default ↔ subscribed states
const buttonVariants = {
  default: { scale: 1 },
  tapped: {
    scale: 0.96,
    transition: { duration: 0.1, ease: 'easeOut' }
  }
}

// Icon swap animation: default icon → spinner → checkmark
// Use AnimatePresence with key switching between icon states:
// opacity 0→1, scale 0.7→1, duration 0.15s
const iconVariants = {
  hidden: { opacity: 0, scale: 0.7 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.15 } }
}
```

### Accessibility

- `role="button"` (or native `<button>`)
- `aria-label`: "Subscribe to notifications for {featureTitle}" (default) / "Unsubscribe from {featureTitle} notifications" (subscribed)
- `aria-pressed={isSubscribed}` — communicates toggle state to screen readers
- `aria-disabled={isLoading}`
- On subscribe success: `aria-live="polite"` region announces "You'll be notified when {featureTitle} ships."

---

## Component Composition Notes

### Page-level usage patterns

**Homepage (`/`):**
```
SupportTopBar (showSearch=false)
  └─ Hero section
       └─ UnifiedSearchBar (size="hero", inlineAnswer=true)
            └─ (on results) CrystalAnswerCard + DocResultCard × N
```

**Doc page (`/guides/*`, `/api/*`, `/crystal/*`):**
```
SupportTopBar (showSearch=true, activeSection=...)
  └─ DocBreadcrumb
  └─ DocTabBar (if tabbed content)
  └─ [doc content]
       └─ CodeBlock × N
       └─ DocParamsTable × N
  └─ DocFeedback
  └─ DocSidebar (sticky)
  └─ SupportCrystalPanel (slide-in on "Ask Crystal" click)
```

**Roadmap page (`/roadmap`):**
```
SupportTopBar (showSearch=true, activeSection="roadmap")
  └─ RoadmapCard × N (shipped section)
       └─ StatusBadge (shipped)
  └─ RoadmapCard × N (in-progress section)
       └─ StatusBadge (building)
       └─ ProgressBar
       └─ NotifyMeButton
  └─ RoadmapCard × N (planned section)
       └─ StatusBadge (planned)
       └─ NotifyMeButton
```

**Status page (`/status`):**
```
SupportTopBar (showSearch=true, activeSection="status")
  └─ StatusComponentGrid
       └─ StatusBadge (per component)
```

**Changelog page (`/changelog`):**
```
SupportTopBar (showSearch=true, activeSection="changelog")
  └─ ChangelogEntry × N
       └─ StatusBadge (category)
```

### Known issue inline display

When Crystal finds a matching known issue during a search, the flow is:

```
UnifiedSearchBar (results state)
  └─ CrystalAnswerCard
       └─ KnownIssueCard (inline, within Crystal's answer context)
```

The `KnownIssueCard` is embedded inside the `CrystalAnswerCard`'s source section with `compact={true}` styling — same token usage, smaller padding, no shadow.

---

## Implementation Checklist

- [ ] All string literals extracted to a `locales/support-en.ts` file — no hardcoded UI strings in JSX
- [ ] All color references use `var(--color-*)` CSS variables, NOT hardcoded hex (tokens may be overridden for white-label)
- [ ] Framer Motion `AnimatePresence` wraps all conditional render points
- [ ] Every interactive element has a keyboard handler + visible focus ring
- [ ] `aria-live` regions declared on streaming content before streaming begins
- [ ] `shadow-card-hover` transition on all card components uses `transition: box-shadow 0.2s ease, transform 0.2s ease` (not `transition: all`)
- [ ] Mobile breakpoint tested at 375px (iPhone SE viewport)
- [ ] `CommandPalette` keyboard trap verified with VoiceOver/NVDA
