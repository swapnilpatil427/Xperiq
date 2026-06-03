# Experient — UX Design Specification
## 5 New Features: Notifications, Alerts, Dashboard, Visual AI, Workflows

**Version:** 1.0  
**Date:** 2026-06-03  
**UX Team:** Kenji Nakamura (Principal UX), Priya Sharma (Notifications), Aiko Yamamoto (Workflow Builder), Mei-Ling Zhou (Visual/AI), Yuki Tanaka (Dashboard), Diana Osei (Frontend, React/Tailwind v4), Emma Thompson (Platform Expert)

---

## Table of Contents

1. [Existing Design System Analysis](#1-existing-design-system-analysis)
2. [Design Principles for All 5 Features](#2-design-principles-for-all-5-features)
3. [Navigation and App Shell Changes](#3-navigation-and-app-shell-changes)
4. [Design Token Additions](#4-design-token-additions)
5. [Notification UX — Complete Specification](#5-notification-ux--complete-specification)
6. [Alerts UX — Complete Specification](#6-alerts-ux--complete-specification)
7. [Dashboard UX — Complete Specification](#7-dashboard-ux--complete-specification)
8. [Visual AI UX — Complete Specification](#8-visual-ai-ux--complete-specification)
9. [Workflow Builder UX — Complete Specification](#9-workflow-builder-ux--complete-specification)
10. [Component Library Additions Summary](#10-component-library-additions-summary)
11. [Localization Keys](#11-localization-keys)
12. [Animation and Interaction Patterns](#12-animation-and-interaction-patterns)
13. [Accessibility Checklist](#13-accessibility-checklist)
14. [Mobile and Responsive Behavior](#14-mobile-and-responsive-behavior)

---

## 1. Existing Design System Analysis

### 1.1 Color Palette

Sourced from `app/src/styles/theme.css` and `app/src/index.css` (`@theme` block).

**Brand Tokens (runtime-overridable via `applyBrandTheme()`):**

| Token | Value | Role |
|-------|-------|------|
| `--brand-primary` | `#2a4bd9` | Primary buttons, links, active nav |
| `--brand-primary-dim` | `#173dcd` | Hover states |
| `--brand-primary-container` | `#879aff` | Tinted backgrounds, chips |
| `--brand-secondary` | `#00647c` | Secondary actions, teal accents |
| `--brand-accent` | `#8329c8` | Crystal purple, tertiary elements |
| `--brand-font-heading` | `"Manrope"` | All headline elements (`font-headline`) |
| `--brand-font-body` | `"Inter"` | Body text |
| `--brand-radius` | `0.75rem` | Default border radius |

**Non-brandable Semantic Tokens (fixed, defined in `theme.css`):**

| Token | Value | Role |
|-------|-------|------|
| `--color-surface` | `#f5f7f9` | App background |
| `--color-surface-container-lowest` | `#ffffff` | Cards, panels |
| `--color-surface-container-low` | `#eef1f3` | Secondary backgrounds |
| `--color-surface-container` | `#e5e9eb` | Chip backgrounds |
| `--color-on-surface` | `#2c2f31` | Primary text |
| `--color-on-surface-variant` | `#595c5e` | Secondary text |
| `--color-outline-variant` | `#abadaf` | Borders, dividers |
| `--color-error` | `#b41340` | Error, destructive |
| `--color-success` | `#059669` | Success states |
| `--color-warning` | `#d97706` | Warning states |

**Critical Rule from `app/CLAUDE.md`:**  
Any CSS that must respond to brand changes MUST use `var(--color-primary)` or inline `style={{ background: 'var(--color-primary)' }}`. Tailwind utility classes like `bg-primary` are baked at build time and will NOT respond to runtime brand changes.

### 1.2 Typography System

**Font families:** Manrope (headlines, `font-headline`), Inter (body, default)

Typography in use from reading components:
- Page headings: `text-2xl md:text-3xl xl:text-4xl font-black font-headline`
- Section headers: `text-xl font-black font-headline`
- Card titles: `text-sm font-semibold text-on-surface`
- Body: `text-sm leading-relaxed text-on-surface`
- Secondary body: `text-xs text-on-surface-variant`
- Labels/caps: class `label-caps` — `text-xs font-bold uppercase tracking-widest text-on-surface-variant`
- Tiny/meta: `text-[10px]` or `text-[11px]` — used for Crystal UI badges and footnotes
- Crystal brand label: `text-[10px] font-black uppercase tracking-[0.2em] text-tertiary`

### 1.3 Current Component Patterns

**shadcn/UI primitives available** (from `app/src/components/ui/`):
`badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `progress`, `scroll-area`, `select`, `separator`, `sheet`, `switch`, `table`, `tabs`, `textarea`, `tooltip`

**Button variants** (from `app/CLAUDE.md`):
- `default` — primary solid bg-primary
- `outline` — border only
- `ghost` — no border, for icon buttons and nav
- `gradient` — primary→tertiary gradient (hero CTAs)
- `destructive` — delete/danger
- `secondary` — neutral
- `success` — confirmation

**The `cn()` utility** from `@/lib/utils` must always be used for conditional class merging. Never use template literals for Tailwind class merging.

**Icons:** Material Symbols Outlined via `<Icon name="..." size={n} fill={0|1} />` from `app/src/components/Icon.tsx`. NOT lucide-react. The icon for notifications is `notifications`; for workflows: `account_tree`; for settings: `settings`; for close: `close`; for bell with alert: `notification_important`.

**Sheet component** (already in use for notifications): `<Sheet open={...} onOpenChange={...}><SheetContent side="right">` — slides in from right, already used in `TopBar.tsx` for the current notification panel and credits panel.

### 1.4 Current Navigation Structure

From `app/src/components/SideNav.tsx`:

```typescript
const NAV_ITEMS = [
  { key: 'nav.surveys',     icon: 'poll',         path: ROUTES.SURVEYS },
  { key: 'nav.data',        icon: 'dataset',      path: '/app/data' },
  { key: 'nav.insights',    icon: 'psychology',   path: ROUTES.INSIGHTS, fill: 1 },
  { key: 'nav.experience',  icon: 'spa',          path: ROUTES.EXPERIENCE },
  { key: 'nav.respondents', icon: 'groups',       path: ROUTES.RESPONDENTS },
  { key: 'nav.workflows',   icon: 'account_tree', path: ROUTES.WORKFLOWS },
  { key: 'nav.templates',   icon: 'auto_awesome', path: ROUTES.TEMPLATES },
];
const SETTINGS_ITEM = { key: 'nav.settings', icon: 'settings', path: ROUTES.SETTINGS };
```

**SideNav behaviors:**
- Expanded: `16rem` (256px) — full labels + logo + Create CTA
- Collapsed: `3.5rem` (56px) — icons only + Tooltip (side="right")
- Sidebar width exposed as `--sidebar-width` CSS variable consumed by `.topbar-fixed`
- State persisted to localStorage via `useSidebarState()` (key: `sidenav_expanded`)
- Tablet (768–1023px): forced collapsed on mount

**Navigation CSS classes:**
- Expanded item: `sidenav-item` (active adds `active active-bar`)
- Collapsed item: `sidenav-item-collapsed` (active adds `active`)
- Active indicator: left border `w-[3px] h-3/5 rounded-r-full bg-gradient-to-b from-primary to-tertiary`
- Active dot: `w-1.5 h-1.5 rounded-full bg-primary`

### 1.5 Current Page Layout Pattern

From `app/src/pages/CLAUDE.md` and `app/CLAUDE.md`:

```tsx
export function SomePage() {
  const { t } = useTranslation();
  useSetPageTitle(t('page.title'), t('page.subtitle'));
  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.parent'), icon: 'icon_name', path: ROUTES.PARENT }]}
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        actions={<Button>...</Button>}
      />
      {/* content */}
    </div>
  );
}
```

**Rules:**
- Do NOT add `px-6 md:px-8` — AppShell provides gutters globally
- Do NOT add `pb-24 md:pb-8` — AppShell provides BottomNav clearance
- Do NOT import SideNav, TopBar, BottomNav, AppShell
- `PageHeader` provides `pt-8 md:pt-10` top padding
- All standard pages use `max-w-7xl mx-auto w-full`

### 1.6 Localization Pattern

From `app/CLAUDE.md` and `app/src/locales/en.ts`:

```typescript
import { useTranslation } from '../lib/i18n';
const { t } = useTranslation();

// Simple: 
t('notifications.title')  // → 'Notifications'

// With interpolation:
t('notifications.unreadCount', { count: 7 })  // → '7 unread notifications'
```

The locale file is `app/src/locales/en.ts` (~2200 lines). Organized by feature namespace: `brand`, `nav`, `common`, `surveys`, `insights`, `crystal`, etc.

**Critical rule:** Sub-components defined outside the main component function must call `useTranslation()` themselves. `t` is NOT inherited from parent scope.

### 1.7 Crystal Panel Pattern

From `app/src/components/CrystalPanel.tsx`:

**How Crystal works globally:**
- Mounted once in `AppShell` — never rendered inside a page
- Pages interact via `useCrystalPanel()` context hook
- Opens via `⌘K` shortcut or explicit `openCrystal()` call
- Width: `calc((100vw - var(--sidebar-width)) * 0.28)` collapsed, `0.55` expanded

**Crystal brand identity (from code):**
- Crystal gem icon: `<Icon name="diamond" size={16} style={{ color: 'white' }} />` inside gradient container
- Crystal gradient: `linear-gradient(135deg, #2a4bd9, #8329c8)` (primary → tertiary)
- Crystal border accent: `rgba(42,75,217,0.18)`
- Crystal tinted background: `rgba(42,75,217,0.04)`
- Crystal purple text: `color: '#2a4bd9'` or `color: var(--color-primary)`
- Crystal CSS crystal orb: conic-gradient hex animation (see `CLAUDE.md` for full code)

**Crystal bubble colors:**
- User bubble: `linear-gradient(135deg, #2a4bd9, #8329c8)` — white text
- Crystal avatar: same gradient, 32×32px circle with diamond icon
- Crystal response card: `GlassCard` component from `app/src/pages/insights/shared`

**`useCrystalPanel()` API:**
```typescript
const { openCrystal, closeCrystal, toggleCrystal, setScope, setCrystalData, isOpen } = useCrystalPanel();

// Scope Crystal to a specific survey:
setScope(surveyId);

// Open with a pre-loaded query:
openCrystal('Why did NPS drop?', { focused_topic: 'Wait Time' });

// Return to portfolio view:
setScope('all');
```

### 1.8 Animation Patterns (Framer Motion)

**Page transition (from AppShell):**
```typescript
const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
};
```

**House ease curve:** `[0.22, 1, 0.36, 1]` — use for all entrance animations.

**Staggered card grids:**
```typescript
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const rise = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
```

**Crystal panel slide (from CrystalPanel.tsx):**
```typescript
// Panel: initial={{ x: '100%' }}, animate={{ x: 0 }}, exit={{ x: '100%' }}
// Transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
```

**CSS keyframe animations (run off main thread — use for persistent decorative animations):**
- `float-bob 6s ease-in-out infinite` — floating Crystal orb
- `pulse-glow 2.5s ease-in-out infinite` — live data dots, Crystal core
- `holographic` / `aurora` 8s — shimmer effect
- Skeleton loading: CSS gradient sweep animation

**Nav micro-interactions:**
- Sidebar hover: `translateX(4px)` spring `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot)
- Button tap: `active:scale-95` (built into Button component via CVA)
- Card hover: `.card-tilt:hover` → `perspective(1000px) rotateX(2deg) rotateY(-1deg)`

### 1.9 Routing Pattern

Always use `ROUTES.KEY` and `toPath()` — never raw string paths:
```typescript
import { ROUTES, toPath } from '../constants/routes';
<Link to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId, topicId })} />
```

---

## 2. Design Principles for All 5 Features

### 2.1 Crystal-First
AI insights lead; user controls follow. On every page with Crystal data, the Crystal narrative card or Crystal annotation appears ABOVE the raw charts and metrics. Crystal is never an afterthought tucked in a corner — it's the primary voice.

### 2.2 Progressive Disclosure
The pattern for all data views: summary tile → click → distribution chart → click → verbatims → click → full response. Never show all levels simultaneously. Each level reveals on demand.

### 2.3 Consistent Crystal Presence
Crystal looks identical everywhere:
- Icon: `<Icon name="diamond" />` inside a `linear-gradient(135deg, #2a4bd9, #8329c8)` container
- Crystal accent color: always `var(--color-primary)` (#2a4bd9) and `var(--color-tertiary)` (#8329c8)
- Crystal label: `text-[10px] font-black uppercase tracking-[0.2em] text-tertiary` → "CRYSTAL"
- Crystal narration text: `text-sm leading-relaxed` or `text-xs italic` for inline Crystal notes
- Crystal background tint: `rgba(42,75,217,0.04)` with `border: 1px solid rgba(42,75,217,0.12)`

### 2.4 Notification Hierarchy
Visual weight matches urgency. Colors NEVER used alone — always paired with an icon:
- Critical: `#b41340` (var(--color-error)) + `notification_important` or `error` icon
- Warning: `#d97706` (var(--color-warning)) + `warning` icon
- Info: `#2a4bd9` (var(--color-primary)) + `info` or `notifications` icon
- Success: `#059669` (var(--color-success)) + `check_circle` icon

### 2.5 Data Density
- Executive / operator views: max 6 KPI tiles visible above the fold. Dense mode is opt-in only.
- Analyst views can be dense — allow toggling row height in lists and tables.
- Rule: no more than 3 levels of hierarchy visible simultaneously on any screen.

### 2.6 Keyboard Accessible
Every interactive element reachable by Tab. Focus ring: `outline: 2px solid var(--color-primary); outline-offset: 2px` (class `brand-ring` in index.css). Panels trap focus: Tab cycles within open panel.

### 2.7 Mobile-Aware
Primary use is desktop. But panels (notification, alert drawer) must work on tablet. Workflow builder is desktop-only. Responsive breakpoints per `app/CLAUDE.md`:
- Mobile: `< 768px`
- Tablet: `768–1023px`
- Desktop: `≥ 1024px`

---

## 3. Navigation and App Shell Changes

### 3.1 Updated SideNav NAV_ITEMS Array

File to edit: `app/src/components/SideNav.tsx`

Replace the existing `NAV_ITEMS` constant with:

```typescript
const NAV_ITEMS = [
  { key: 'nav.dashboard',    icon: 'dashboard',    path: ROUTES.DASHBOARD },   // NEW
  { key: 'nav.surveys',      icon: 'poll',         path: ROUTES.SURVEYS },
  { key: 'nav.insights',     icon: 'psychology',   path: ROUTES.INSIGHTS, fill: 1 },
  { key: 'nav.experience',   icon: 'spa',          path: ROUTES.EXPERIENCE },
  { key: 'nav.alerts',       icon: 'notification_important', path: ROUTES.ALERTS }, // NEW
  { key: 'nav.workflows',    icon: 'account_tree', path: ROUTES.WORKFLOWS },
  { key: 'nav.templates',    icon: 'auto_awesome', path: ROUTES.TEMPLATES },
];
```

Items removed from original: `nav.data` (moved to a sub-view of Surveys or Data page), `nav.respondents` (renamed/merged).

**New routes to add to `app/src/constants/routes.ts`:**
```typescript
DASHBOARD: '/app/dashboard',
ALERTS: '/app/alerts',
```

### 3.2 Alerts Badge in SideNav

The Alerts nav item must display a red badge with count of active critical alerts.

**Implementation in SideNav.tsx — add hook:**
```typescript
import { useAlertCount } from '../hooks/useAlertCount';

// Inside SideNav component:
const { criticalCount } = useAlertCount();
```

**Badge component within the nav item (expanded state):**
```tsx
// In the expanded nav item render for ALERTS:
<button
  onClick={() => navigate(ROUTES.ALERTS)}
  className={`sidenav-item${active ? ' active active-bar' : ''}`}
>
  <Icon name="notification_important" fill={active ? 1 : 0} size={20} />
  <span className="truncate">{t('nav.alerts')}</span>
  {criticalCount > 0 && (
    <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-[var(--color-error)] text-white text-[10px] font-black flex items-center justify-center px-1 flex-shrink-0">
      {criticalCount > 9 ? '9+' : criticalCount}
    </span>
  )}
  {active && !criticalCount && (
    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
  )}
</button>
```

**Collapsed state (icon-only with tooltip + badge overlay):**
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button
      onClick={() => navigate(ROUTES.ALERTS)}
      className={`sidenav-item-collapsed relative${active ? ' active' : ''}`}
      aria-label={`${t('nav.alerts')}${criticalCount > 0 ? ` — ${criticalCount} critical` : ''}`}
    >
      <Icon name="notification_important" fill={active ? 1 : 0} size={20} />
      {criticalCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-[var(--color-error)] text-white text-[9px] font-black flex items-center justify-center px-0.5">
          {criticalCount > 9 ? '9+' : criticalCount}
        </span>
      )}
    </button>
  </TooltipTrigger>
  <TooltipContent side="right" className="font-semibold text-xs">
    {t('nav.alerts')}{criticalCount > 0 ? ` — ${criticalCount} critical` : ''}
  </TooltipContent>
</Tooltip>
```

### 3.3 Notification Bell in TopBar

File to edit: `app/src/components/TopBar.tsx`

The existing notification bell already exists but has been upgraded per the Notification Service spec. The current implementation uses a Sheet component. The new spec moves this to a dedicated `NotificationPanel` component for better modularity, but retains the Sheet pattern already working in the codebase.

**Current TopBar right-side controls order:**
```
[CreditsChip] [NotificationBell] [Help] [UserAvatar]
```

**Upgraded NotificationBell button (replace existing inline button):**
```tsx
// Import at top:
import { NotificationBell } from './NotificationBell';

// In TopBar right controls div:
<div className="flex items-center gap-2 md:gap-3">
  <CreditsChip onClick={() => setCreditsOpen(true)} />
  <NotificationBell
    unreadCount={unreadCount}
    hasCritical={notifications.some(n => !n.read && n.priority === 'critical')}
    onClick={() => handleNotifOpen(true)}
  />
  <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl text-on-surface-variant">
    <Icon name="help" size={20} />
  </Button>
  {/* UserButton */}
</div>
```

### 3.4 Updated App Shell Structure

The overall AppShell structure remains unchanged. New pages plug in as routes under `AppShell`:
```
AppShell
  ├── SideNav (updated NAV_ITEMS, alert badge)
  ├── TopBar (upgraded NotificationBell)
  ├── <main>
  │    └── Outlet → DashboardPage | AlertCenterPage | WorkflowsPage | ...
  ├── BottomNav (mobile — update with Dashboard and Alerts items)
  └── CrystalPanel (unchanged global panel)
```

**BottomNav update** (`app/src/components/BottomNav.tsx`):
Current: Surveys | Data | FAB(Create) | Insights | Settings
New: Dashboard | Surveys | FAB(Create) | Alerts | Insights

---

## 4. Design Token Additions

All additions go into `app/src/styles/theme.css` (`:root` block) and mirrored in `app/src/index.css` (`@theme` block).

### 4.1 Crystal AI Color Tokens (already partially exist — verify/add)

```css
/* Crystal AI accent — these map to existing --color-primary and --color-tertiary */
/* Crystal primary: var(--color-primary) = #2a4bd9 */
/* Crystal purple: var(--color-tertiary) = #8329c8 */

/* Crystal UI specific tokens */
:root {
  --crystal-gradient: linear-gradient(135deg, #2a4bd9, #8329c8);
  --crystal-tint-bg: rgba(42, 75, 217, 0.04);
  --crystal-tint-border: rgba(42, 75, 217, 0.12);
  --crystal-tint-bg-medium: rgba(42, 75, 217, 0.08);
  --crystal-tint-bg-strong: rgba(42, 75, 217, 0.14);
}
```

### 4.2 Priority/Severity Color Tokens

```css
:root {
  /* Notification/Alert priority — maps to existing status tokens */
  --priority-critical: var(--color-error);           /* #b41340 */
  --priority-critical-bg: #fff0f3;                   /* light red tint */
  --priority-critical-border: rgba(180, 19, 64, 0.3);
  
  --priority-warning: var(--color-warning);          /* #d97706 */
  --priority-warning-bg: var(--color-warning-container); /* #fef3c7 */
  --priority-warning-border: rgba(217, 119, 6, 0.3);
  
  --priority-info: var(--color-primary);             /* #2a4bd9 */
  --priority-info-bg: #eef2ff;
  --priority-info-border: rgba(42, 75, 217, 0.25);
  
  --priority-success: var(--color-success);          /* #059669 */
  --priority-success-bg: var(--color-success-container); /* #d1fae5 */
  --priority-success-border: rgba(5, 150, 105, 0.3);
}
```

### 4.3 Chart Color Tokens

```css
:root {
  /* Data visualization palette */
  --chart-primary: #6366f1;         /* indigo — primary series */
  --chart-secondary: #94a3b8;       /* slate — prior period / secondary */
  --chart-positive: #22c55e;        /* green — promoters, positive sentiment */
  --chart-negative: #ef4444;        /* red — detractors, negative sentiment */
  --chart-neutral: #94a3b8;         /* slate — passives, neutral */
  --chart-warning: #f59e0b;         /* amber — passives in NPS */
  --chart-prediction: #8329c8;      /* purple — Crystal prediction lines */
  --chart-anomaly: #ef4444;         /* red — anomaly markers */
  
  /* Topic bubble chart palette */
  --chart-topic-1: #6366f1;
  --chart-topic-2: #8b5cf6;
  --chart-topic-3: #ec4899;
  --chart-topic-4: #14b8a6;
  --chart-topic-5: #f59e0b;
}
```

### 4.4 Panel and Layout Width Tokens

```css
:root {
  --panel-notification: 400px;      /* NotificationPanel width */
  --panel-alert-detail: 560px;      /* AlertDetailDrawer width */
  --panel-node-config: 400px;       /* WorkflowNodeConfigPanel width */
  --panel-workflow-library: 240px;  /* WorkflowNodeLibrary sidebar width */
  --panel-crystal-context: 400px;   /* Dashboard "Ask Crystal" panel */
  /* CrystalPanel width is already set via calc() in CrystalPanel.tsx */
}
```

### 4.5 Animation Tokens

```css
:root {
  --ease-house: cubic-bezier(0.22, 1, 0.36, 1);   /* house spring curve */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* overshoot spring for nav */
  --duration-panel: 200ms;        /* panel slide-in duration */
  --duration-page: 280ms;         /* page transition */
  --duration-micro: 100ms;        /* dropdowns, tooltips */
}
```

**Skeleton shimmer CSS keyframe** (add to `app/src/index.css`):
```css
@keyframes skeleton-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface-container-low) 25%,
    var(--color-surface-container) 50%,
    var(--color-surface-container-low) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--brand-radius);
}

/* Crystal-tinted skeleton variant for Crystal card loading */
.skeleton-crystal {
  background: linear-gradient(
    90deg,
    rgba(42, 75, 217, 0.04) 25%,
    rgba(42, 75, 217, 0.10) 50%,
    rgba(42, 75, 217, 0.04) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 2s ease-in-out infinite;
}
```

---

## 5. Notification UX — Complete Specification

### 5.1 NotificationBell Component

**File:** `app/src/components/NotificationBell.tsx`

```tsx
interface NotificationBellProps {
  unreadCount: number;
  hasCritical: boolean;
  onClick: () => void;
}
```

**Visual spec:**

- Container: `relative w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors` (mirrors existing TopBar button style)
- Icon: `<Icon name="notifications" size={20} />` — no fill variant (outline only when idle)
- When `hasCritical`: use `<Icon name="notification_important" size={20} />` (filled alert bell)

**Badge:**
- Position: `absolute -top-0.5 -right-0.5`
- Size: `min-w-[18px] h-[18px] rounded-full`
- Content: count up to 99, then "99+" — use `text-[10px] font-black flex items-center justify-center px-0.5`
- Color: `hasCritical ? 'bg-[var(--color-error)]' : 'bg-[var(--color-primary)]'` — white text
- Hidden when `unreadCount === 0`

**Critical pulse animation** (Framer Motion — only when new critical arrives):
```tsx
import { motion, useAnimate } from 'framer-motion';

// The badge pulses scale 1 → 1.15 → 1, repeat 3 times, then stops.
// Use `animate()` imperative API triggered when hasCritical changes to true.
// Variant for reduced-motion: skip animation entirely.
const bellAnimation = hasCritical ? {
  scale: [1, 1.15, 1, 1.15, 1],
  transition: { duration: 0.8, repeat: 2 }
} : {};
```

**Full component:**
```tsx
export function NotificationBell({ unreadCount, hasCritical, onClick }: NotificationBellProps) {
  const { t } = useTranslation();
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <motion.button
      onClick={onClick}
      className="relative w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
      aria-label={t('notifications.bellLabel', { count: unreadCount })}
      animate={!prefersReducedMotion && hasCritical ? { scale: [1, 1.12, 1] } : {}}
      transition={{ duration: 0.5, repeat: 2 }}
    >
      <Icon name={hasCritical ? 'notification_important' : 'notifications'} size={20} />
      {unreadCount > 0 && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-black flex items-center justify-center px-0.5',
            hasCritical ? 'bg-[var(--color-error)]' : 'bg-[var(--color-primary)]'
          )}
          aria-hidden="true"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </motion.button>
  );
}
```

### 5.2 Notification Panel Component

**File:** `app/src/components/notifications/NotificationPanel.tsx`

The existing TopBar.tsx renders the notification sheet inline. Refactor into this dedicated component for separation of concerns. Keep using the existing shadcn `Sheet` component pattern — it already handles the slide-in animation and overlay via Radix.

```tsx
interface NotificationPanelProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
}
```

**Layout (using existing Sheet component):**
```tsx
<Sheet open={isOpen} onOpenChange={onClose}>
  <SheetContent
    side="right"
    className="w-[400px] p-0 flex flex-col"
    // On mobile (<768px): override width to full screen
    style={{ width: 'min(400px, 100vw)' }}
  >
    {/* Header */}
    <SheetHeader
      className="px-5 py-4 border-b flex-shrink-0"
      style={{ borderColor: 'var(--crystal-tint-border)' }}
    >
      <div className="flex items-center justify-between">
        <SheetTitle className="font-headline text-base font-bold text-on-surface">
          {t('notifications.title')}
        </SheetTitle>
        {hasUnread && (
          <button
            onClick={markAllRead}
            className="text-xs font-semibold hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>
      <SheetDescription className="sr-only">
        {t('notifications.panelDescription')}
      </SheetDescription>
    </SheetHeader>

    {/* Notification List — scrollable */}
    <ScrollArea className="flex-1">
      {loading ? (
        <NotificationPanelSkeleton />
      ) : notifications.length === 0 ? (
        <NotificationEmptyState />
      ) : (
        <NotificationGroupedList
          notifications={notifications}
          onRead={markRead}
          onDismiss={dismissNotification}
        />
      )}
    </ScrollArea>
  </SheetContent>
</Sheet>
```

**Z-index:** Sheet uses Radix Portal — it renders above all app content automatically (z-50). No manual z-index needed.

**Keyboard shortcut:** The bell is opened by clicking it. Global keyboard shortcut `Shift+N` opens the notification panel (register in `AppShell.tsx` similar to existing `⌘K` handler). Document this in the UI via `aria-keyshortcuts="Shift+N"` on the bell button.

### 5.3 Notification Grouped List

**File:** `app/src/components/notifications/NotificationGroupedList.tsx`

Groups notifications into sections using `date-fns`:
- "Today" — notifications from today
- "Yesterday" — notifications from yesterday
- "This Week" — notifications from this week
- "Older" — everything else

Section header style:
```tsx
<div className="sticky top-0 px-5 py-2 bg-[var(--color-surface-container-low)] border-b border-[var(--color-outline-variant)] z-10">
  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
    {t(`notifications.group.${groupKey}`)}
  </p>
</div>
```

**Infinite scroll:** On scroll near bottom of `ScrollArea`, call `loadMoreNotifications()`. Show a loading spinner row when fetching. "No more notifications" message at end.

### 5.4 Notification Item Component

**File:** `app/src/components/notifications/NotificationItem.tsx`

```tsx
interface NotificationItemProps {
  notification: Notification;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onClick: (actionUrl: string, id: string) => void;
}
```

**Unread item visual spec:**
```tsx
<motion.div
  layout
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: 20 }}
  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
  className={cn(
    'relative group w-full text-left flex gap-3 px-5 py-4 transition-colors cursor-pointer',
    'border-l-4',
    !n.read && n.priority === 'critical' && 'bg-[#fff0f3] border-[var(--color-error)]',
    !n.read && n.priority === 'warning'  && 'bg-[var(--color-warning-container)] border-[var(--color-warning)]',
    !n.read && n.priority === 'info'     && 'bg-[#eef2ff] border-[var(--color-primary)]',
    !n.read && n.priority === 'success'  && 'bg-[var(--color-success-container)] border-[var(--color-success)]',
    n.read && 'bg-[var(--color-surface-container-low)] border-transparent',
  )}
  onClick={() => onClick(n.actionUrl, n.id)}
>
  {/* Priority icon */}
  <NotificationIcon type={n.type} priority={n.priority} />

  {/* Content */}
  <div className="flex-1 min-w-0">
    <p className={cn(
      'text-sm leading-snug',
      n.read ? 'font-normal text-on-surface-variant' : 'font-semibold text-on-surface'
    )}>
      {n.title}
    </p>
    {n.body && (
      <p className={cn('text-xs mt-0.5 line-clamp-2', n.read ? 'text-on-surface-variant/60' : 'text-on-surface-variant')}>
        {n.body}
      </p>
    )}
    {/* Crystal narration — only shown when metadata.crystalSummary exists */}
    {n.metadata?.crystalSummary && (
      <p className="text-xs mt-1 text-[var(--color-primary)] italic line-clamp-2">
        <Icon name="diamond" size={10} className="inline mr-0.5" />
        {n.metadata.crystalSummary}
      </p>
    )}
    <p className={cn('text-[10px] mt-1', n.read ? 'text-on-surface-variant/40' : 'text-on-surface-variant/60')}>
      {formatRelativeTime(n.createdAt)}
    </p>
  </div>

  {/* Dismiss button — visible on hover */}
  <button
    className="opacity-0 group-hover:opacity-100 absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-[var(--color-surface-container)] transition-all"
    onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
    aria-label={t('notifications.dismiss')}
  >
    <Icon name="close" size={14} />
  </button>
</motion.div>
```

**Notification icons by type** (Material Symbols):

| Type pattern | Icon | Color source |
|---|---|---|
| `score.nps_drop`, `score.*_drop` | `trending_down` | `var(--color-error)` |
| `score.*_rise` | `trending_up` | `var(--color-success)` |
| `crystal.*` | `diamond` | `var(--color-primary)` |
| `survey.milestone` | `flag` | `var(--color-primary)` |
| `survey.expiring*` | `schedule` | `var(--color-warning)` |
| `survey.response_rate_low` | `warning` | `var(--color-warning)` |
| `system.*_error` | `error` | `var(--color-error)` |
| `team.*` | `groups` | `var(--color-secondary)` |
| `export.*`, `report.*` | `description` | `var(--color-on-surface-variant)` |
| `alert.fired` | `notification_important` | Priority color |
| default | `notifications` | `var(--color-primary)` |

### 5.5 Toast Notification Component

**File:** `app/src/components/notifications/NotificationToast.tsx`

Toasts appear when a new notification arrives via WebSocket while the panel is closed.

**Toast Container (global, mounted once in AppShell):**
```tsx
// Position: fixed top-20 right-4 (below TopBar height of 4rem = 64px)
// Stack: newest toast at top, max 3 visible
// z-index: z-[60] (above CrystalPanel z-50)
<div
  className="fixed top-20 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
  aria-live="polite"
  aria-atomic="false"
>
  <AnimatePresence mode="popLayout">
    {toasts.map(toast => (
      <NotificationToast key={toast.id} toast={toast} onDismiss={dismissToast} />
    ))}
  </AnimatePresence>
</div>
```

**Individual Toast:**
- Width: `w-[380px]` on desktop, `w-[calc(100vw-2rem)]` on mobile
- Background: `bg-white` with `shadow-xl`
- Border radius: `rounded-xl`
- Critical: red top bar `h-1 bg-[var(--color-error)] rounded-t-xl`
- Info/success/warning: colored icon but no top bar
- Animation: `initial={{ opacity: 0, x: 100 }}` → `animate={{ opacity: 1, x: 0 }}` (duration 0.2s, house ease)
- Auto-dismiss: info/success/warning after 5 seconds; critical toasts persist until clicked
- `pointer-events-auto` on each toast (container is pointer-events-none)
- Click anywhere: navigate to `actionUrl` + dismiss
- Critical: `aria-live="assertive"`, others: `aria-live="polite"`

### 5.6 Notification Preferences Page

**File:** `app/src/pages/NotificationPreferencesPage.tsx`  
**Route:** `/app/settings/notifications`  
**Page title:** `t('notificationPreferences.pageTitle')` — "Notification Preferences"

```tsx
export function NotificationPreferencesPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('notificationPreferences.pageTitle'));
  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('nav.settings'), icon: 'settings', path: ROUTES.SETTINGS },
          { label: t('notificationPreferences.pageTitle') },
        ]}
        title={t('notificationPreferences.pageTitle')}
        subtitle={t('notificationPreferences.pageSubtitle')}
      />
      {/* Category groups */}
    </div>
  );
}
```

**Layout — preference group:**
```tsx
<Card className="rounded-xl bg-white border border-[var(--color-outline-variant)] mb-6">
  <div className="px-6 py-4 border-b border-[var(--color-surface-container)]">
    <h3 className="font-headline font-semibold text-base text-on-surface">
      {t('notificationPreferences.category.score')}
    </h3>
  </div>
  <div className="divide-y divide-[var(--color-surface-container)]">
    {/* Preference row */}
    <NotificationPreferenceRow
      labelKey="notificationPreferences.npsAlerts.label"
      descriptionKey="notificationPreferences.npsAlerts.description"
      preference={prefs.npsAlerts}
      onUpdate={(updates) => updatePref('npsAlerts', updates)}
    />
  </div>
</Card>
```

**Preference row columns:** label/description | [In-app Switch] | [Email Switch] | [Slack Switch]

**Channel toggle style (using shadcn Switch):**
```tsx
<div className="flex items-center gap-2">
  <Switch
    checked={preference.inAppEnabled}
    onCheckedChange={(v) => onUpdate({ inAppEnabled: v })}
    aria-label={t('notificationPreferences.channel.inApp')}
  />
  <Label className="text-xs text-on-surface-variant">
    {t('notificationPreferences.channel.inApp')}
  </Label>
</div>
```

**Threshold config input (shown for configurable alerts like NPS drop):**
```tsx
<div className="px-6 py-3 bg-[var(--color-surface-container-low)] rounded-b-xl text-sm flex items-center gap-2 text-on-surface-variant">
  {t('notificationPreferences.npsAlerts.thresholdPrefix')}
  <Input
    type="number"
    min={1}
    max={50}
    value={preference.thresholdConfig?.minDrop ?? 5}
    onChange={(e) => onUpdate({ thresholdConfig: { minDrop: Number(e.target.value) } })}
    className="w-16 text-center px-2 py-1 h-8 rounded-lg border text-sm font-semibold"
  />
  {t('notificationPreferences.npsAlerts.thresholdSuffix')}
</div>
```

**Categories with their notification types:**
1. Score & Performance: NPS Alerts, CSAT Alerts, CES Alerts, Score Anomalies
2. Crystal AI: Insight Ready, New Topic Detected, Anomaly Detected, Weekly Digest, Prediction Alert
3. Surveys: Response Milestones, Survey Expiring, Response Rate Warning, Quota Reached
4. Operations: Pipeline Errors, Integration Errors, Credits Low
5. Quiet Hours: time range pickers + timezone selector

---

## 6. Alerts UX — Complete Specification

### 6.1 Alert Center Page

**File:** `app/src/pages/AlertCenterPage.tsx`  
**Route:** `/app/alerts`

```tsx
export function AlertCenterPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('alerts.pageTitle'), t('alerts.pageSubtitle'));
  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.alerts'), icon: 'notification_important', path: ROUTES.ALERTS }]}
        title={t('alerts.pageTitle')}
        subtitle={t('alerts.pageSubtitle')}
        actions={
          <Button
            onClick={openAlertWizard}
            className="flex items-center gap-2 font-bold text-sm text-white rounded-xl px-5 py-2.5"
            style={{ background: 'var(--color-primary)' }}
          >
            <Icon name="add" size={18} />
            {t('alerts.configureRules')}
          </Button>
        }
      />
      
      {/* Summary counts row */}
      <div className="flex gap-3 mb-6">
        <AlertCountChip severity="critical" count={counts.critical} />
        <AlertCountChip severity="warning"  count={counts.warning}  />
        <AlertCountChip severity="info"     count={counts.info}     />
      </div>

      {/* Tab bar */}
      <Tabs defaultValue="all" className="mb-6">
        <TabsList className="bg-[var(--color-surface-container-low)] rounded-xl p-1">
          <TabsTrigger value="all">
            {t('alerts.tabs.all')} ({counts.total})
          </TabsTrigger>
          <TabsTrigger value="critical">
            <span className="w-2 h-2 rounded-full bg-[var(--color-error)] mr-1.5" />
            {t('alerts.tabs.critical')} ({counts.critical})
          </TabsTrigger>
          <TabsTrigger value="warning">{t('alerts.tabs.warning')} ({counts.warning})</TabsTrigger>
          <TabsTrigger value="info">{t('alerts.tabs.info')} ({counts.info})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter bar */}
      <AlertFilterBar onFilterChange={setFilters} />

      {/* Alert list */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        {alerts.map(alert => (
          <motion.div key={alert.id} variants={rise}>
            <AlertCard
              alert={alert}
              onAcknowledge={acknowledgeAlert}
              onSnooze={snoozeAlert}
              onResolve={resolveAlert}
              onClick={setSelectedAlert}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
```

**AlertCountChip:**
```tsx
function AlertCountChip({ severity, count }: { severity: string; count: number }) {
  const colors = {
    critical: { bg: '#fff0f3', color: 'var(--color-error)',   dot: 'bg-[var(--color-error)]'   },
    warning:  { bg: '#fef3c7', color: 'var(--color-warning)', dot: 'bg-[var(--color-warning)]' },
    info:     { bg: '#eef2ff', color: 'var(--color-primary)', dot: 'bg-[var(--color-primary)]' },
  }[severity];
  return (
    <span
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
      style={{ background: colors.bg, color: colors.color }}
    >
      <span className={cn('w-2 h-2 rounded-full', colors.dot)} />
      {count} {t(`alerts.severity.${severity}`)}
    </span>
  );
}
```

### 6.2 Alert Card Component

**File:** `app/src/components/alerts/AlertCard.tsx`

```tsx
interface AlertCardProps {
  alert: AlertEvent;
  onAcknowledge: (id: string) => void;
  onSnooze: (id: string, duration: string) => void;
  onResolve: (id: string) => void;
  onClick: (alert: AlertEvent) => void;
}
```

**Visual spec:**

```tsx
<Card
  className={cn(
    'rounded-xl border-l-4 cursor-pointer transition-all hover:-translate-y-0.5',
    alert.status === 'active'       && severityBorderClass[alert.severity],
    alert.status === 'acknowledged' && 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)]',
    alert.status === 'resolved'     && 'bg-[var(--color-success-container)] border-[var(--color-success)]',
    alert.status === 'snoozed'      && 'bg-[var(--color-surface-container-low)] border-[var(--color-outline-variant)] opacity-75',
  )}
  style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}
  onClick={() => onClick(alert)}
>
  <div className="flex items-start gap-4 p-5">
    {/* Severity icon */}
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: `${severityColor[alert.severity]}18` }}
    >
      <Icon name={severityIcon[alert.severity]} size={20} style={{ color: severityColor[alert.severity] }} />
    </div>

    {/* Main content */}
    <div className="flex-1 min-w-0">
      {/* Severity label + timestamp */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[10px] font-black uppercase tracking-widest"
          style={{ color: severityColor[alert.severity] }}
        >
          {t(`alerts.severity.${alert.severity}`)}
        </span>
        <span className="text-[10px] text-on-surface-variant">
          {formatRelativeTime(alert.triggeredAt)}
        </span>
        {alert.surveyName && (
          <>
            <span className="text-[10px] text-on-surface-variant">·</span>
            <span className="text-[10px] text-on-surface-variant truncate max-w-[180px]">
              {alert.surveyName}
            </span>
          </>
        )}
      </div>

      {/* Alert title */}
      <h3 className="font-semibold text-sm text-on-surface mb-1 leading-snug">
        {alert.title}
      </h3>

      {/* Alert description */}
      <p className="text-xs text-on-surface-variant leading-relaxed mb-2">
        {alert.description}
      </p>

      {/* Crystal narration */}
      {alert.crystalNarration && (
        <div
          className="px-3 py-2 rounded-lg text-xs text-on-surface leading-relaxed mb-3"
          style={{ background: 'var(--crystal-tint-bg)', border: '1px solid var(--crystal-tint-border)' }}
        >
          <Icon name="diamond" size={11} className="inline mr-1" style={{ color: 'var(--color-primary)' }} />
          <span className="italic">{alert.crystalNarration}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {alert.status === 'active' && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 rounded-lg"
              onClick={() => onAcknowledge(alert.id)}
            >
              <Icon name="check" size={13} className="mr-1" />
              {t('alerts.actions.acknowledge')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs h-7 rounded-lg">
                  {t('alerts.actions.snooze')}
                  <Icon name="expand_more" size={13} className="ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {['1h', '4h', '24h', '7d'].map(dur => (
                  <DropdownMenuItem key={dur} onClick={() => onSnooze(alert.id, dur)}>
                    {t(`alerts.snooze.${dur}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 rounded-lg text-[var(--color-success)] hover:bg-[var(--color-success-container)]"
              onClick={() => onResolve(alert.id)}
            >
              <Icon name="check_circle" size={13} className="mr-1" />
              {t('alerts.actions.resolve')}
            </Button>
          </>
        )}
        {alert.status === 'acknowledged' && (
          <span className="text-xs text-on-surface-variant flex items-center gap-1">
            <Icon name="check" size={13} />
            {t('alerts.status.acknowledged')}
          </span>
        )}
        {alert.status === 'resolved' && (
          <span className="text-xs text-[var(--color-success)] flex items-center gap-1">
            <Icon name="check_circle" size={13} fill={1} />
            {t('alerts.status.resolved')}
          </span>
        )}
      </div>
    </div>
  </div>
</Card>
```

**Severity config:**
```typescript
const severityBorderClass = {
  critical: 'bg-[#fff0f3] border-[var(--color-error)]',
  warning:  'bg-[var(--color-warning-container)] border-[var(--color-warning)]',
  info:     'bg-[#eef2ff] border-[var(--color-primary)]',
  success:  'bg-[var(--color-success-container)] border-[var(--color-success)]',
};

const severityColor = {
  critical: 'var(--color-error)',
  warning:  'var(--color-warning)',
  info:     'var(--color-primary)',
  success:  'var(--color-success)',
};

const severityIcon = {
  critical: 'error',
  warning:  'warning',
  info:     'info',
  success:  'check_circle',
};
```

### 6.3 Alert Detail Drawer

**File:** `app/src/components/alerts/AlertDetailDrawer.tsx`

```tsx
interface AlertDetailDrawerProps {
  alert: AlertEvent | null;
  isOpen: boolean;
  onClose: () => void;
}
```

**Uses shadcn Sheet, slides in from right:**
```tsx
<Sheet open={isOpen} onOpenChange={onClose}>
  <SheetContent
    side="right"
    className="w-[560px] p-0 flex flex-col"
    style={{ width: 'min(560px, 100vw)' }}
  >
    {alert && <AlertDetailContent alert={alert} onClose={onClose} />}
  </SheetContent>
</Sheet>
```

**AlertDetailContent layout:**
```
Header (sticky): severity badge + title + [Acknowledge] [Resolve] [×]
├── Crystal Analysis Panel (indigo bg)
│     Crystal icon + "Crystal Analysis"
│     Crystal narration text (text-sm leading-relaxed)
│     Recommended actions (numbered list)
├── Metric Visualization
│     Before → After KPI comparison
│     Mini trend chart (Recharts LineChart, 40px height)
├── Evidence Panel (collapsible)
│     Top verbatims (max 5, truncated, clickable)
│     Topic breakdown (horizontal bar)
├── Timeline
│     Triggered → Notified → (Acknowledged/Snoozed/Resolved)
└── CTA Footer
      [View in Dashboard →]  [View Survey →]
```

**Crystal Analysis Panel style:**
```tsx
<div
  className="mx-5 my-4 rounded-xl p-4"
  style={{
    background: 'linear-gradient(to bottom right, #eef2ff, #f5f3ff)',
    border: '1px solid rgba(42,75,217,0.18)',
  }}
>
  <div className="flex items-center gap-2 mb-3">
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: 'var(--crystal-gradient)' }}
    >
      <Icon name="diamond" size={14} style={{ color: 'white' }} />
    </div>
    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary">
      Crystal Analysis
    </span>
  </div>
  <p className="text-sm text-on-surface leading-relaxed mb-3">
    {alert.crystalNarration}
  </p>
  {alert.crystalAction && (
    <div className="border-t border-[rgba(42,75,217,0.12)] pt-3">
      <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
        {t('alerts.recommendedAction')}
      </p>
      <p className="text-sm text-on-surface">{alert.crystalAction}</p>
    </div>
  )}
</div>
```

### 6.4 Alert Setup Wizard

**File:** `app/src/components/alerts/AlertSetupWizard.tsx`

Uses shadcn `Dialog` (modal), 560px wide:
```tsx
<Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="w-full max-w-[560px] p-0 overflow-hidden">
    <AlertSetupWizardContent />
  </DialogContent>
</Dialog>
```

**Step indicator (4 steps):**
```tsx
<div className="flex items-center gap-0 px-6 py-4 border-b border-[var(--color-surface-container)]">
  {steps.map((step, i) => (
    <React.Fragment key={i}>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
            i < currentStep && 'text-white',
            i === currentStep && 'border-2 border-[var(--color-primary)] text-[var(--color-primary)]',
            i > currentStep && 'bg-[var(--color-surface-container)] text-on-surface-variant',
          )}
          style={i < currentStep ? { background: 'var(--color-primary)' } : undefined}
        >
          {i < currentStep ? <Icon name="check" size={14} /> : i + 1}
        </div>
        <span className={cn(
          'text-xs font-medium hidden sm:block',
          i === currentStep ? 'text-on-surface font-semibold' : 'text-on-surface-variant'
        )}>
          {step.label}
        </span>
      </div>
      {i < steps.length - 1 && (
        <div className={cn('flex-1 h-px mx-3', i < currentStep ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-container-high)]')} />
      )}
    </React.Fragment>
  ))}
</div>
```

**Step content area:** `px-6 py-5 min-h-[300px]`

**Navigation footer:**
```tsx
<div className="px-6 py-4 border-t border-[var(--color-surface-container)] flex justify-between items-center">
  <Button variant="ghost" onClick={goBack} disabled={currentStep === 0}>
    <Icon name="arrow_back" size={16} className="mr-1" />
    {t('common.back')}
  </Button>
  {currentStep < 3 ? (
    <Button onClick={goNext} style={{ background: 'var(--color-primary)' }} className="text-white font-bold">
      {t('common.next')}
      <Icon name="arrow_forward" size={16} className="ml-1" />
    </Button>
  ) : (
    <Button onClick={activateAlert} variant="success" className="font-bold">
      <Icon name="check_circle" size={16} className="mr-1" />
      {t('alerts.wizard.activateAlert')}
    </Button>
  )}
</div>
```

**Step 1 — What to monitor:** Radio cards for alert category (Score, Volume, Topics, Crystal AI, Operations). Each card: icon + title + description. Selected card gets primary border and tinted background.

**Step 2 — Set conditions:** Dynamic form based on Step 1 selection. Uses Input, Select, and RadioGroup from shadcn. Example for NPS: "Alert when NPS drops by more than [N] points over [window] days."

**Step 3 — Recipients:** Checkbox list: Survey creator, Org admins, All team members. Plus text input for external email.

**Step 4 — Channels + Preview:** Channel toggles (In-App / Email / Slack). Summary preview box in `bg-[var(--color-surface-container-low)] rounded-xl p-4`.

---

## 7. Dashboard UX — Complete Specification

### 7.1 Dashboard Page Layout

**File:** `app/src/pages/DashboardPage.tsx`  
**Route:** `/app/dashboard`

Unlike standard pages, DashboardPage requires a sticky filter bar. Use full-width layout with the sticky bar:

```tsx
export function DashboardPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('dashboard.pageTitle'), t('dashboard.pageSubtitle'));
  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* Page header — standard pattern */}
      <PageHeader
        crumbs={[{ label: t('nav.dashboard'), icon: 'dashboard', path: ROUTES.DASHBOARD }]}
        title={t('dashboard.pageTitle')}
        actions={<DashboardHeaderActions />}
      />

      {/* Sticky filter bar — sits below the TopBar-offset */}
      <div className="sticky top-16 z-30 -mx-6 md:-mx-8 px-6 md:px-8 mb-6"
        style={{ background: 'var(--color-surface-container-lowest)', borderBottom: '1px solid var(--color-surface-container)' }}>
        <DashboardFilterBar filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* KPI tile row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiTile metric="nps" data={kpis.nps} />
        <KpiTile metric="csat" data={kpis.csat} />
        <KpiTile metric="ces" data={kpis.ces} />
        <KpiTile metric="responses" data={kpis.responseCount} />
        <KpiTile metric="responseRate" data={kpis.responseRate} />
        <KpiTile metric="insights" data={kpis.crystalInsightCount} />
      </div>

      {/* Crystal Narrative Card — full width */}
      <CrystalNarrativeCard narrative={narrative} lastUpdated={narrativeUpdatedAt} className="mb-6" />

      {/* Widget grid — 12-column responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <DashboardWidget title={t('dashboard.npsTrend')} id="nps-trend">
          <NpsTrendChart data={npsTrend} predictions={npsPredictions} annotations={chartAnnotations} />
        </DashboardWidget>
        <DashboardWidget title={t('dashboard.topicMatrix')} id="topic-matrix">
          <TopicSentimentMatrix topics={topics} />
        </DashboardWidget>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <DashboardWidget title={t('dashboard.npsDistribution')} id="nps-distribution">
          <NpsDistributionChart data={distribution} />
        </DashboardWidget>
        <DashboardWidget title={t('dashboard.recentVerbatims')} id="verbatims">
          <VerbatimStream verbatims={recentVerbatims} />
        </DashboardWidget>
      </div>

      {/* Bottom two-column: Alerts + Crystal Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertBannerWidget alerts={activeAlerts} />
        <CrystalActionBoard actions={crystalActions} />
      </div>
    </div>
  );
}
```

### 7.2 Dashboard Filter Bar

**File:** `app/src/components/dashboard/DashboardFilterBar.tsx`

Height: `56px`, content vertically centered.

```tsx
<div className="flex items-center gap-3 h-14">
  {/* Date picker */}
  <DateRangePicker
    value={filters.dateRange}
    onChange={(range) => onFiltersChange({ ...filters, dateRange: range })}
  />

  {/* Survey picker */}
  <SurveyScopePicker
    value={filters.surveyIds}
    onChange={(ids) => onFiltersChange({ ...filters, surveyIds: ids })}
  />

  {/* Active filter pills */}
  <div className="flex items-center gap-2 flex-wrap">
    {activeFilterPills.map(pill => (
      <span
        key={pill.id}
        className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
        style={{ background: 'rgba(42,75,217,0.10)', color: 'var(--color-primary)' }}
      >
        {pill.label}
        <button
          onClick={() => removeFilter(pill.id)}
          className="hover:opacity-70 transition-opacity"
          aria-label={t('dashboard.filters.remove', { label: pill.label })}
        >
          <Icon name="close" size={12} />
        </button>
      </span>
    ))}
  </div>

  <div className="ml-auto flex items-center gap-2">
    <Button variant="ghost" size="sm" className="text-xs" onClick={clearAllFilters}>
      {t('dashboard.filters.clear')}
    </Button>
    <Button variant="outline" size="sm" className="text-xs font-semibold">
      <Icon name="bookmark" size={14} className="mr-1" />
      {t('dashboard.filters.saveView')}
    </Button>
  </div>
</div>
```

### 7.3 KPI Tile Component

**File:** `app/src/components/dashboard/KpiTile.tsx`

```tsx
interface KpiTileProps {
  metric: 'nps' | 'csat' | 'ces' | 'responses' | 'responseRate' | 'insights';
  data: {
    current: number | string;
    prior?: number;
    change?: number;
    changePercent?: number;
    trend: 'up' | 'down' | 'stable';
    sparkline?: number[];  // 7-day mini trend
  };
  onClick?: () => void;
}
```

**Visual spec:**
```tsx
<Card
  className="bg-white rounded-xl border border-[var(--color-surface-container)] shadow-[var(--shadow-card)] p-5 cursor-pointer transition-all hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5"
  onClick={onClick}
>
  {/* Title */}
  <p className="text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wide">
    {t(`dashboard.kpi.${metric}`)}
  </p>

  {/* Primary value */}
  <p className={cn(
    'text-3xl font-black font-headline leading-none mb-1',
    metric === 'nps' && typeof data.current === 'number' && data.current < 0 && 'text-[var(--color-error)]',
    metric === 'nps' && typeof data.current === 'number' && data.current >= 0 && 'text-on-surface',
  )}>
    {metric === 'nps' && typeof data.current === 'number' && data.current > 0 ? `+${data.current}` : data.current}
    {metric === 'responseRate' && '%'}
  </p>

  {/* Change indicator */}
  {data.change !== undefined && (
    <div className="flex items-center gap-1 mb-2">
      <Icon
        name={data.trend === 'up' ? 'trending_up' : data.trend === 'down' ? 'trending_down' : 'trending_flat'}
        size={14}
        style={{ color: data.trend === 'up' ? 'var(--color-success)' : data.trend === 'down' ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }}
      />
      <span
        className="text-xs font-bold"
        style={{ color: data.trend === 'up' ? 'var(--color-success)' : data.trend === 'down' ? 'var(--color-error)' : 'var(--color-on-surface-variant)' }}
      >
        {data.trend === 'up' ? '+' : data.trend === 'down' ? '' : ''}{data.change}
      </span>
      <span className="text-[10px] text-on-surface-variant">{t('dashboard.kpi.vsPriorPeriod')}</span>
    </div>
  )}

  {/* Sparkline */}
  {data.sparkline && (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={data.sparkline.map((v, i) => ({ v, i }))}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={data.trend === 'down' ? 'var(--color-error)' : 'var(--color-primary)'}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )}

  {/* Loading skeleton */}
  {isLoading && <div className="skeleton h-8 rounded-lg mt-2" />}
</Card>
```

**Responsive grid:** `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`

### 7.4 Crystal Narrative Card

**File:** `app/src/components/dashboard/CrystalNarrativeCard.tsx`

```tsx
interface CrystalNarrativeCardProps {
  narrative: string | null;
  lastUpdated: Date | null;
  confidence?: number;   // 0-1
  isLoading?: boolean;
  onRegenerate?: () => void;
  className?: string;
}
```

**Visual spec:**
```tsx
<Card
  className={cn(
    'rounded-xl p-6',
    className
  )}
  style={{
    background: 'linear-gradient(to bottom right, #eef2ff, #f5f3ff)',
    border: '1px solid rgba(42,75,217,0.18)',
    boxShadow: '0 4px 24px rgba(42,75,217,0.06)',
  }}
>
  {/* Header */}
  <div className="flex items-start justify-between mb-4">
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--crystal-gradient)' }}
      >
        <Icon name="diamond" size={18} style={{ color: 'white' }} />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary mb-0.5">
          Crystal
        </p>
        <p className="font-headline font-bold text-sm text-on-surface">
          {t('dashboard.crystalNarrative.title')}
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {lastUpdated && (
        <span className="text-[10px] text-on-surface-variant">
          {formatRelativeTime(lastUpdated)}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs h-7 rounded-lg"
        onClick={onRegenerate}
        disabled={isLoading}
      >
        <Icon name="refresh" size={13} className={cn('mr-1', isLoading && 'animate-spin')} />
        {t('common.regenerate')}
      </Button>
    </div>
  </div>

  {/* Narrative body */}
  {isLoading ? (
    <div className="space-y-2">
      <div className="skeleton-crystal h-4 rounded" />
      <div className="skeleton-crystal h-4 rounded w-4/5" />
      <div className="skeleton-crystal h-4 rounded w-3/5 mt-3" />
      <div className="skeleton-crystal h-4 rounded w-5/6" />
    </div>
  ) : (
    <p className="text-sm text-on-surface leading-relaxed whitespace-pre-line">
      {narrative || t('dashboard.crystalNarrative.empty')}
    </p>
  )}

  {/* Confidence bar */}
  {confidence !== undefined && !isLoading && (
    <div className="mt-4 pt-3 border-t border-[rgba(42,75,217,0.12)]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">
          {t('dashboard.crystalNarrative.confidence')}
        </span>
        <span className="text-[10px] font-bold" style={{ color: 'var(--color-primary)' }}>
          {Math.round(confidence * 100)}%
        </span>
      </div>
      <Progress
        value={confidence * 100}
        className="h-1.5"
        style={{ '--progress-bg': 'var(--crystal-tint-bg-medium)' } as React.CSSProperties}
      />
    </div>
  )}
</Card>
```

### 7.5 Dashboard Widget Container

**File:** `app/src/components/dashboard/DashboardWidget.tsx`

```tsx
interface DashboardWidgetProps {
  title: string;
  id: string;
  children: React.ReactNode;
  lastUpdated?: Date;
  crystalConfidence?: number;
  isLoading?: boolean;
  onRefresh?: () => void;
  onExport?: () => void;
  onAskCrystal?: () => void;
  className?: string;
}
```

```tsx
<Card className={cn('bg-white rounded-xl border border-[var(--color-surface-container)] shadow-[var(--shadow-card)]', className)}>
  {/* Widget header */}
  <div className="flex items-center justify-between px-5 pt-4 pb-0">
    <h3 className="font-headline font-semibold text-sm text-on-surface">{title}</h3>
    <div className="flex items-center gap-1">
      {onRefresh && (
        <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={onRefresh}
          aria-label={t('dashboard.widget.refresh')}>
          <Icon name="refresh" size={14} />
        </Button>
      )}
      {onAskCrystal && (
        <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={onAskCrystal}
          aria-label={t('dashboard.widget.askCrystal')}>
          <Icon name="diamond" size={14} style={{ color: 'var(--color-primary)' }} />
        </Button>
      )}
      {onExport && (
        <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={onExport}
          aria-label={t('dashboard.widget.export')}>
          <Icon name="download" size={14} />
        </Button>
      )}
    </div>
  </div>

  {/* Content */}
  <div className="px-5 py-4">
    {isLoading ? (
      <div className="space-y-2">
        <div className="skeleton h-32 rounded-lg" />
      </div>
    ) : children}
  </div>

  {/* Footer */}
  {lastUpdated && (
    <div className="px-5 pb-3 border-t border-[var(--color-surface-container)] pt-2">
      <p className="text-[10px] text-on-surface-variant">
        {t('dashboard.widget.lastUpdated', { time: formatRelativeTime(lastUpdated) })}
      </p>
    </div>
  )}
</Card>
```

### 7.6 Chart Specifications

**NPS Trend Chart** (`app/src/components/dashboard/charts/NpsTrendChart.tsx`):
```tsx
// Uses Recharts: LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea
// Current period: solid line, color var(--color-primary), strokeWidth 2
// Prior period: dashed gray line, color #94a3b8, strokeDasharray "4 4"
// Prediction: purple dashed, color var(--color-tertiary), strokeDasharray "6 3", strokeOpacity 0.7
// Confidence band: ReferenceArea, fill: rgba(131,41,200,0.08), no stroke
// Industry benchmark: horizontal ReferenceLine, stroke #94a3b8, strokeDasharray "2 2"
// Grid: CartesianGrid, stroke: var(--color-surface-container), strokeDasharray "3 3"
// Tooltip: custom dark tooltip (see 7.7 below)
// Crystal anomaly markers: custom dot component on the line
```

**Anomaly marker component:**
```tsx
// Custom dot rendered at anomaly dataPoints
function AnomalyDot({ cx, cy, payload, annotations, onAnnotationClick }) {
  const annotation = annotations.find(a => a.date === payload.date);
  if (!annotation) return null;
  return (
    <g>
      {/* Red triangle for drops, green circle for positive events */}
      {annotation.type === 'drop' ? (
        <polygon
          points={`${cx},${cy-8} ${cx-6},${cy+2} ${cx+6},${cy+2}`}
          fill="var(--color-error)"
          cursor="pointer"
          onClick={() => onAnnotationClick(annotation)}
        />
      ) : (
        <circle cx={cx} cy={cy} r={5} fill="var(--color-success)" cursor="pointer"
          onClick={() => onAnnotationClick(annotation)} />
      )}
    </g>
  );
}
```

**NPS Distribution Chart** (`app/src/components/dashboard/charts/NpsDistributionChart.tsx`):
```tsx
// Recharts BarChart, horizontal bars
// Detractors: fill #ef4444
// Passives: fill #f59e0b
// Promoters: fill #22c55e
// Labels: percentage + count on bar end
```

**Topic Sentiment Matrix** (`app/src/components/dashboard/charts/TopicSentimentMatrix.tsx`):
```tsx
// D3 force simulation — not Recharts
// SVG canvas, force-directed bubble chart
// X: sentiment score (-1 to +1), Y: volume rank
// Bubble size: Math.sqrt(topic.mentionCount) * scaleFactor, min 20px, max 80px
// Colors: positive (#22c55e blend), negative (#ef4444 blend), neutral (#94a3b8)
// Labels: topic name inside bubble if space allows, otherwise outside
// Hover: scale 1.1 + tooltip with Crystal narration
// Click: drill to topic detail
```

**Tooltip (dark, shared across all charts):**
```tsx
function ChartTooltip({ active, payload, label, annotations }) {
  if (!active || !payload?.length) return null;
  const annotation = annotations?.find(a => a.date === label);
  return (
    <div className="bg-[#1a1d1e] text-white rounded-xl shadow-xl px-4 py-3 min-w-[160px]">
      <p className="text-[10px] text-[#9ca3af] mb-1 font-semibold">{formatDate(label)}</p>
      {payload.map(entry => (
        <p key={entry.name} className="text-sm font-bold mb-0.5">
          <span style={{ color: entry.color }}>{entry.name}: </span>
          {entry.value}
        </p>
      ))}
      {annotation && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <Icon name="diamond" size={10} className="inline mr-1 text-[#a5b4fc]" />
          <span className="text-[10px] text-[#a5b4fc] italic">{annotation.crystalNote}</span>
        </div>
      )}
    </div>
  );
}
```

### 7.7 "Ask Crystal" Panel for Dashboard

**File:** `app/src/components/dashboard/DashboardCrystalPanel.tsx`

When user clicks "Ask Crystal" button on a widget, open this panel:

```tsx
// Uses the global useCrystalPanel() hook:
const { openCrystal, setScope } = useCrystalPanel();

// Pre-load context for the specific widget:
function onAskCrystal(widgetId: string, widgetTitle: string) {
  openCrystal(
    `Tell me about the ${widgetTitle} data`,  // pre-loaded query
    { focused_topic: widgetTitle }
  );
}
```

Suggested questions chips (3 per widget) are passed as Crystal context.

---

## 8. Visual AI UX — Complete Specification

### 8.1 Image Upload Survey Question

**File:** `app/src/components/survey/ImageUploadQuestion.tsx`

Used in `SurveyFillPage.tsx` context (public survey view — no auth, no AppShell).

```tsx
interface ImageUploadQuestionProps {
  question: Question;
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  maxImages?: number;          // default: 5
  maxSizeMB?: number;          // default: 10
}
```

**Drop zone (idle state):**
```tsx
<div
  className={cn(
    'border-2 border-dashed rounded-xl p-8 text-center transition-all',
    isDragOver ? 'border-[var(--color-primary)] bg-[#eef2ff]' : 'border-[var(--color-outline-variant)]',
  )}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  <div className="flex justify-center gap-6 mb-4">
    <button
      className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-[var(--color-surface-container-low)] hover:bg-[var(--color-surface-container)] transition-colors"
      onClick={() => cameraRef.current?.click()}
    >
      <Icon name="photo_camera" size={28} className="text-on-surface-variant" />
      <span className="text-sm font-medium text-on-surface-variant">{t('imageUpload.camera')}</span>
    </button>
    <button
      className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-[var(--color-surface-container-low)] hover:bg-[var(--color-surface-container)] transition-colors"
      onClick={() => fileRef.current?.click()}
    >
      <Icon name="photo_library" size={28} className="text-on-surface-variant" />
      <span className="text-sm font-medium text-on-surface-variant">{t('imageUpload.fromLibrary')}</span>
    </button>
  </div>
  <p className="text-xs text-on-surface-variant">{t('imageUpload.orDragDrop')}</p>
  <p className="text-xs text-on-surface-variant mt-1">
    {t('imageUpload.limits', { formats: 'JPG, PNG, HEIC', maxMB: maxSizeMB, maxCount: maxImages })}
  </p>
</div>
```

**Privacy notice (shown once per session, not on every question):**
```tsx
<p className="text-xs text-on-surface-variant mt-3 flex items-center gap-1">
  <Icon name="lock" size={12} className="flex-shrink-0" />
  {t('imageUpload.privacyNotice')}
</p>
```

**Uploaded image thumbnail grid:**
```tsx
<div className="grid grid-cols-4 gap-3 mt-4">
  {images.map(img => (
    <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden group">
      <img src={img.previewUrl} alt="" className="w-full h-full object-cover" />
      {/* Crystal analyzing indicator */}
      {img.status === 'analyzing' && (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50">
          <p className="text-white text-[9px] font-semibold px-1.5 pb-1 flex items-center gap-0.5">
            <Icon name="diamond" size={9} />
            {t('imageUpload.analyzing')}
          </p>
        </div>
      )}
      {/* Upload progress bar */}
      {img.status === 'uploading' && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
          <div
            className="h-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${img.uploadProgress}%` }}
          />
        </div>
      )}
      {/* Remove button */}
      <button
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => removeImage(img.id)}
        aria-label={t('imageUpload.removeImage')}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  ))}
  {images.length < maxImages && (
    <button
      className="aspect-square rounded-lg border-2 border-dashed border-[var(--color-outline-variant)] flex items-center justify-center hover:border-[var(--color-primary)] transition-colors"
      onClick={() => fileRef.current?.click()}
    >
      <Icon name="add" size={20} className="text-on-surface-variant" />
    </button>
  )}
</div>
```

### 8.2 Image Gallery Component (Analyst View)

**File:** `app/src/components/visualai/SurveyImageGallery.tsx`

```tsx
interface SurveyImageGalleryProps {
  surveyId: string;
  questionId: string;
  totalCount: number;
  onImageClick: (image: MediaAnalysis) => void;
}
```

**Crystal Summary banner:**
```tsx
<div
  className="rounded-xl p-4 mb-4"
  style={{ background: 'var(--crystal-tint-bg)', border: '1px solid var(--crystal-tint-border)' }}
>
  <div className="flex items-center gap-2 mb-2">
    <div className="w-6 h-6 rounded-lg flex items-center justify-center"
      style={{ background: 'var(--crystal-gradient)' }}>
      <Icon name="diamond" size={12} style={{ color: 'white' }} />
    </div>
    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary">Crystal Summary</span>
  </div>
  <p className="text-sm text-on-surface leading-relaxed">{visualInsight.crystalNarrative}</p>
</div>
```

**Filter tabs:**
```tsx
<Tabs defaultValue="all" className="mb-4">
  <TabsList className="bg-[var(--color-surface-container-low)] rounded-xl p-1">
    <TabsTrigger value="all">{t('imageGallery.tabs.all')} ({totalCount})</TabsTrigger>
    <TabsTrigger value="positive">
      <span className="w-2 h-2 rounded-full bg-[var(--color-success)] mr-1.5" />
      {t('imageGallery.tabs.positive')} ({posCount})
    </TabsTrigger>
    <TabsTrigger value="neutral">
      <span className="w-2 h-2 rounded-full bg-[#94a3b8] mr-1.5" />
      {t('imageGallery.tabs.neutral')} ({neutCount})
    </TabsTrigger>
    <TabsTrigger value="negative">
      <span className="w-2 h-2 rounded-full bg-[var(--color-error)] mr-1.5" />
      {t('imageGallery.tabs.negative')} ({negCount})
    </TabsTrigger>
  </TabsList>
</Tabs>
```

**Image grid:**
```tsx
<div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
  {images.map(img => (
    <div
      key={img.id}
      className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group"
      onClick={() => onImageClick(img)}
    >
      <img
        src={img.thumbnailUrl}
        alt=""
        className="w-full h-full object-cover transition-transform group-hover:scale-105"
        loading="lazy"
      />
      {/* Sentiment badge */}
      <div className="absolute bottom-2 right-2">
        <span
          className="w-3.5 h-3.5 rounded-full border-2 border-white block"
          style={{ background: sentimentColor[img.sentiment] }}
        />
      </div>
      {/* Crystal tags on hover */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
        <div className="flex flex-wrap gap-1">
          {img.detectedObjects?.slice(0, 3).map(obj => (
            <span key={obj} className="text-[9px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded">
              {obj}
            </span>
          ))}
        </div>
      </div>
    </div>
  ))}
</div>
```

**Lightbox with Crystal analysis sidebar:**
- Uses `Dialog` full-screen on mobile, large dialog on desktop
- Left: full image at max 800px width
- Right: Crystal analysis panel (300px)
  - Sentiment badge, detected objects, extracted text
  - Crystal's narration for this specific image

### 8.3 Crystal Chart Query Interface

**File:** `app/src/components/visualai/CrystalChartQuery.tsx`

This is a standalone panel rendered inside the CrystalPanel or as a modal. Can be triggered from a "Ask Crystal to draw a chart" button in the Dashboard.

```tsx
<div className="px-5 py-4">
  {/* Input */}
  <div
    className="flex items-center gap-2 rounded-xl p-3"
    style={{ background: 'var(--crystal-tint-bg)', border: '1px solid var(--crystal-tint-border)' }}
  >
    <Icon name="diamond" size={16} style={{ color: 'var(--color-primary)' }} />
    <input
      ref={inputRef}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={t('crystalChartQuery.placeholder')}
      className="flex-1 bg-transparent text-sm focus:outline-none text-on-surface"
      onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
    />
    <Button
      size="sm"
      onClick={handleGenerate}
      disabled={!query.trim() || isGenerating}
      className="text-white font-bold text-xs rounded-lg flex-shrink-0"
      style={{ background: 'var(--crystal-gradient)' }}
    >
      {isGenerating ? <div className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin border-white" /> : t('crystalChartQuery.generate')}
    </Button>
  </div>

  {/* Suggestion chips */}
  {!generatedChart && (
    <div className="flex flex-wrap gap-2 mt-3">
      {suggestedQueries.map(q => (
        <button
          key={q}
          onClick={() => setQuery(q)}
          className="text-xs px-3 py-1.5 rounded-full border border-[var(--color-outline-variant)] text-on-surface-variant hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
        >
          {q}
        </button>
      ))}
    </div>
  )}

  {/* Generated chart */}
  {generatedChart && (
    <div className="mt-4">
      <p className="font-semibold text-sm text-on-surface mb-1">{generatedChart.headline}</p>
      <p className="text-xs text-on-surface-variant mb-3">{generatedChart.explanation}</p>
      <div className="rounded-xl overflow-hidden border border-[var(--color-surface-container)]">
        <VegaChart spec={generatedChart.chartSpec} />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button variant="outline" size="sm" className="text-xs" onClick={addToDashboard}>
          <Icon name="dashboard" size={13} className="mr-1" />
          {t('crystalChartQuery.addToDashboard')}
        </Button>
        <Button variant="outline" size="sm" className="text-xs" onClick={exportPng}>
          <Icon name="download" size={13} className="mr-1" />
          {t('crystalChartQuery.exportPng')}
        </Button>
        <Button variant="ghost" size="sm" className="text-xs" onClick={clearChart}>
          {t('crystalChartQuery.askFollowUp')}
        </Button>
      </div>
    </div>
  )}
</div>
```

### 8.4 Visual Insight Card

**File:** `app/src/components/visualai/VisualInsightCard.tsx`

```tsx
interface VisualInsightCardProps {
  chartSpec: object;           // Vega-Lite JSON
  headline: string;
  explanation: string;
  confidence: number;          // 0-1
  onAddToDashboard?: () => void;
  onShare?: () => void;
  onAskCrystal?: () => void;
}
```

```tsx
<Card className="rounded-xl bg-white border border-[var(--color-surface-container)] shadow-[var(--shadow-card)]">
  {/* Header */}
  <div className="flex items-center justify-between px-4 pt-3 pb-0">
    <div className="flex items-center gap-2">
      <Icon name="diamond" size={14} style={{ color: 'var(--color-primary)' }} />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary">
        Crystal Insight
      </span>
    </div>
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={onAskCrystal}
        aria-label={t('dashboard.widget.askCrystal')}>
        <Icon name="chat" size={13} />
      </Button>
      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={onShare}
        aria-label={t('common.share')}>
        <Icon name="ios_share" size={13} />
      </Button>
    </div>
  </div>

  {/* Vega-Lite chart */}
  <div className="px-4 py-2">
    <VegaChart spec={chartSpec} />
  </div>

  {/* Headline */}
  <div className="px-4 pb-4">
    <h4 className="font-semibold text-sm text-on-surface leading-snug mb-1 line-clamp-1">
      {headline}
    </h4>
    <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
      {explanation}
    </p>
    <div className="flex items-center justify-between mt-3">
      {/* Confidence badge */}
      <span
        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={{ background: 'var(--crystal-tint-bg-medium)', color: 'var(--color-primary)' }}
      >
        {Math.round(confidence * 100)}% confidence
      </span>
      <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={onAddToDashboard}>
        <Icon name="add" size={11} className="mr-0.5" />
        {t('crystalInsight.addToDashboard')}
      </Button>
    </div>
  </div>
</Card>
```

### 8.5 Annotation Question (Click-on-Image)

**File:** `app/src/components/survey/AnnotationQuestion.tsx`

```tsx
interface AnnotationQuestionProps {
  question: Question;           // must have baseImageUrl
  value: Annotation[];          // { id, x, y } coordinates (0-1 normalized)
  onChange: (annotations: Annotation[]) => void;
  maxAnnotations?: number;      // default: 10
}
```

**Canvas implementation (HTML Canvas for precise click tracking):**
```tsx
<div className="relative" style={{ maxWidth: 800 }}>
  <img
    src={question.baseImageUrl}
    alt={t('annotationQuestion.imageAlt')}
    className="w-full rounded-xl"
    style={{ cursor: 'crosshair', userSelect: 'none' }}
  />
  {/* Overlay canvas for annotation markers */}
  <canvas
    ref={canvasRef}
    className="absolute inset-0 w-full h-full"
    onClick={handleCanvasClick}
    style={{ cursor: 'crosshair' }}
  />
  {/* Render numbered markers as absolute-positioned elements */}
  {annotations.map((ann, i) => (
    <button
      key={ann.id}
      className="absolute w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform"
      style={{
        left: `${ann.x * 100}%`,
        top: `${ann.y * 100}%`,
        background: 'var(--color-error)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
      onClick={(e) => { e.stopPropagation(); removeAnnotation(ann.id); }}
      aria-label={t('annotationQuestion.removeMarker', { n: i + 1 })}
    >
      {i + 1}
    </button>
  ))}
</div>
<p className="text-xs text-on-surface-variant mt-2">
  {t('annotationQuestion.instructions')}
</p>
```

---

## 9. Workflow Builder UX — Complete Specification

### 9.1 Workflows List Page (Redesign)

**File:** `app/src/pages/WorkflowsPage.tsx` (exists — redesign required)

**What changes from current implementation:**
- Remove the 3-column stats row (replace with inline counts in tab bar)
- Add tab bar: All | Active | Draft | Error (with counts)
- Replace current card style with new table-style card (name + trigger icon + last run + toggle)
- Add search/filter bar
- Remove the "Create Workflow" simple modal — replace with route to the new builder

```tsx
export function WorkflowsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('workflows.pageTitle'), t('workflows.pageSubtitle'));
  const navigate = useNavigate();

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.workflows'), icon: 'account_tree', path: ROUTES.WORKFLOWS }]}
        title={t('workflows.mainHeading')}
        subtitle={t('workflows.mainDescription')}
        actions={
          <Button
            onClick={() => navigate(ROUTES.WORKFLOW_NEW)}
            className="flex items-center gap-2 font-bold text-sm text-white rounded-xl px-5 py-2.5"
            style={{ background: 'var(--color-primary)' }}
          >
            <Icon name="add" size={18} />
            {t('workflows.newWorkflowButton')}
          </Button>
        }
      />

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <Input placeholder={t('workflows.searchPlaceholder')} className="pl-9 rounded-xl" />
        </div>
        <Select>
          <SelectTrigger className="w-40 rounded-xl">{t('workflows.filterByTrigger')}</SelectTrigger>
          <SelectContent>{/* trigger type options */}</SelectContent>
        </Select>
      </div>

      {/* Tab bar with counts */}
      <Tabs defaultValue="all" className="mb-6">
        <TabsList className="bg-[var(--color-surface-container-low)] rounded-xl p-1">
          <TabsTrigger value="all">{t('common.all')} ({workflows.length})</TabsTrigger>
          <TabsTrigger value="active">
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)] mr-1.5" />
            {t('common.active')} ({activeCount})
          </TabsTrigger>
          <TabsTrigger value="draft">
            <span className="w-2 h-2 rounded-full bg-[#94a3b8] mr-1.5" />
            {t('common.draft')} ({draftCount})
          </TabsTrigger>
          {errorCount > 0 && (
            <TabsTrigger value="error">
              <span className="w-2 h-2 rounded-full bg-[var(--color-error)] mr-1.5" />
              {t('workflows.tabs.error')} ({errorCount})
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {/* Workflow cards */}
      <div className="space-y-3">
        {filteredWorkflows.map(wf => (
          <WorkflowListCard
            key={wf.id}
            workflow={wf}
            onToggle={toggleWorkflow}
            onEdit={() => navigate(toPath(ROUTES.WORKFLOW_BUILDER, { id: wf.id }))}
            onDelete={deleteWorkflow}
          />
        ))}
      </div>

      {/* Template gallery section */}
      <div className="mt-10">
        <h2 className="font-headline font-bold text-lg text-on-surface mb-4">
          {t('workflows.templates.sectionTitle')}
        </h2>
        <WorkflowTemplateGallery />
      </div>
    </div>
  );
}
```

**WorkflowListCard (new design):**
```tsx
<Card className="rounded-xl bg-white border border-[var(--color-surface-container)] shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
  <div className="flex items-center gap-4 px-5 py-4">
    {/* Trigger type icon */}
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: triggerColor(wf.triggerType) + '18' }}
    >
      <Icon name={triggerIcon(wf.triggerType)} size={20} style={{ color: triggerColor(wf.triggerType) }} />
    </div>

    {/* Name + trigger label */}
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-sm text-on-surface truncate">{wf.name}</h3>
      <p className="text-xs text-on-surface-variant">{formatTriggerLabel(wf)}</p>
    </div>

    {/* Last run + run count */}
    <div className="text-right flex-shrink-0 hidden md:block">
      <p className="text-xs text-on-surface-variant">{t('workflows.lastRun')}</p>
      <p className="text-xs font-semibold text-on-surface">
        {wf.lastRunAt ? formatRelativeTime(wf.lastRunAt) : t('workflows.neverRun')}
      </p>
    </div>

    {/* Run count */}
    <div className="text-center flex-shrink-0 hidden lg:block">
      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">{t('workflows.runs')}</p>
      <p className="text-sm font-bold text-on-surface">{wf.runCount}</p>
    </div>

    {/* Status badge */}
    <Badge
      variant="secondary"
      className={cn(
        'text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0',
        wf.status === 'active' && 'bg-[var(--color-success-container)] text-[var(--color-success)]',
        wf.status === 'draft'  && 'bg-[var(--color-surface-container)] text-on-surface-variant',
        wf.status === 'error'  && 'bg-[#fff0f3] text-[var(--color-error)]',
        wf.status === 'paused' && 'bg-[var(--color-warning-container)] text-[var(--color-warning)]',
      )}
    >
      {t(`workflows.status.${wf.status}`)}
    </Badge>

    {/* Enable/disable toggle */}
    <Switch
      checked={wf.status === 'active'}
      onCheckedChange={() => onToggle(wf.id)}
      aria-label={t('workflows.toggleEnabled', { name: wf.name })}
      className="flex-shrink-0"
    />

    {/* Action buttons */}
    <div className="flex items-center gap-1 flex-shrink-0">
      <Button variant="ghost" size="icon" className="w-8 h-8 rounded-lg" onClick={() => onEdit(wf)}>
        <Icon name="edit" size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="w-8 h-8 rounded-lg text-[var(--color-error)] hover:bg-[#fff0f3]"
        onClick={() => onDelete(wf.id)}
      >
        <Icon name="delete" size={16} />
      </Button>
    </div>
  </div>
</Card>
```

### 9.2 Workflow Canvas (Builder)

**File:** `app/src/pages/WorkflowBuilderPage.tsx`  
**Route:** `/app/workflows/:id/builder` (new route, add to `ROUTES`)

This page uses **builder mode** — same as `SurveyBuilderPage`. The page sets `isBuilder` detection via route pattern update in AppShell:

```typescript
// AppShell.tsx — update isBuilder regex:
const isBuilder = /\/surveys\/[^/]+\/build|\/workflows\/[^/]+\/builder/.test(location.pathname);
```

**Full-screen layout (no gutters from AppShell):**

```tsx
export function WorkflowBuilderPage() {
  return (
    <>  {/* Fragment — no outer div, per builder pattern */}
      {/* Builder top bar */}
      <div
        className="fixed top-0 left-0 right-0 h-16 z-30 flex items-center justify-between px-4 gap-3"
        style={{
          background: 'var(--color-surface-container-lowest)',
          borderBottom: '1px solid var(--color-surface-container)',
          paddingLeft: 'calc(var(--sidebar-width, 3.5rem) + 1rem)',
        }}
      >
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-xs" onClick={navigateBack}>
            <Icon name="arrow_back" size={14} className="mr-1" />
            {t('workflows.builder.backToList')}
          </Button>
          <div className="h-4 w-px bg-[var(--color-surface-container-high)]" />
          {/* Editable workflow name */}
          <input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-sm font-semibold text-on-surface bg-transparent border-b border-transparent hover:border-[var(--color-outline-variant)] focus:border-[var(--color-primary)] focus:outline-none px-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className={cn('text-[10px] font-bold uppercase', workflow.status === 'active' && 'bg-[var(--color-success-container)] text-[var(--color-success)]')}
          >
            {workflow.status === 'active' ? '● Active' : '○ Draft'}
          </Badge>
          <Button variant="outline" size="sm" className="text-xs" onClick={saveWorkflow}>
            {t('common.save')}
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={testWorkflow}>
            <Icon name="play_arrow" size={14} className="mr-1" />
            {t('workflows.builder.test')}
          </Button>
          {workflow.status !== 'active' ? (
            <Button
              size="sm"
              className="text-xs text-white font-bold"
              style={{ background: 'var(--color-success)' }}
              onClick={activateWorkflow}
            >
              <span className="w-2 h-2 rounded-full bg-white mr-1.5" />
              {t('workflows.builder.activate')}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="text-xs" onClick={deactivateWorkflow}>
              {t('workflows.builder.deactivate')}
            </Button>
          )}
        </div>
      </div>

      {/* Main builder layout */}
      <div
        className="fixed inset-0 flex"
        style={{ top: '4rem', left: 'var(--sidebar-width, 3.5rem)' }}
      >
        {/* Node library sidebar */}
        <WorkflowNodeLibrary onDragStart={handleNodeDragStart} />

        {/* Canvas */}
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={setNodes}
          onEdgesChange={setEdges}
          onNodeSelect={setSelectedNode}
          onDrop={handleDrop}
        />

        {/* Node configuration panel (conditional) */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <WorkflowNodeConfigPanel
                node={selectedNode}
                onUpdate={updateNode}
                onClose={() => setSelectedNode(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
```

### 9.3 Node Library Sidebar

**File:** `app/src/components/workflow/WorkflowNodeLibrary.tsx`

Width: `var(--panel-workflow-library)` = 240px. Fixed left.

```tsx
<div
  className="w-60 h-full flex flex-col overflow-hidden flex-shrink-0"
  style={{ background: 'var(--color-surface-container-low)', borderRight: '1px solid var(--color-surface-container)' }}
>
  {/* Search */}
  <div className="px-3 py-3 border-b border-[var(--color-surface-container)]">
    <div className="relative">
      <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
      <Input
        placeholder={t('workflows.nodeLibrary.search')}
        className="pl-8 h-8 text-xs rounded-lg bg-white"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
  </div>

  {/* Scrollable node list */}
  <ScrollArea className="flex-1">
    {nodeCategories.map(category => (
      <NodeCategory key={category.id} category={category} onDragStart={onDragStart} />
    ))}
  </ScrollArea>
</div>
```

**Node category section (collapsible):**
```tsx
function NodeCategory({ category, onDragStart }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="py-2">
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
        onClick={() => setOpen(o => !o)}
      >
        {category.label}
        <Icon name={open ? 'expand_less' : 'expand_more'} size={14} />
      </button>
      {open && category.nodes.map(node => (
        <NodeLibraryItem key={node.type} node={node} onDragStart={onDragStart} />
      ))}
    </div>
  );
}
```

**Node library item (draggable):**
```tsx
function NodeLibraryItem({ node, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, node.type)}
      className="flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-white transition-colors"
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: nodeTypeColor(node.type) + '18' }}
      >
        <Icon name={node.icon} size={14} style={{ color: nodeTypeColor(node.type) }} />
      </div>
      <span className="text-xs font-medium text-on-surface">{node.label}</span>
    </div>
  );
}
```

**Node categories:**
1. Triggers (blue `#3b82f6`): Survey, Score, Crystal AI, Schedule, Webhook
2. Conditions (amber `#f59e0b`): Filter, Crystal Check, Time/Date
3. Crystal AI (purple `var(--color-tertiary)`): Analyze, Summarize, Classify, Write, Decide
4. Actions — Notify (green `#22c55e`): Slack, Email, In-App, Webhook
5. Actions — Integrate (teal `#14b8a6`): Jira, Salesforce, Asana
6. Flow Control (gray `#94a3b8`): If/Else, Delay, Wait, Parallel, Merge, Stop

### 9.4 Canvas Specification

**File:** `app/src/components/workflow/WorkflowCanvas.tsx`

The canvas uses `react-flow` (the standard choice for node-based editors in the React ecosystem). If not installed, use `@xyflow/react` (same package, new name).

```tsx
// Canvas background: gray with dot grid
<ReactFlow
  nodes={nodes}
  edges={edges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  onConnect={onConnect}
  nodeTypes={customNodeTypes}
  edgeTypes={customEdgeTypes}
  fitView
  style={{ background: '#f1f5f9' }}  // var(--color-surface-container)
>
  {/* Dot grid background */}
  <Background variant="dots" gap={16} size={1} color="#cbd5e1" />

  {/* Zoom controls */}
  <Controls
    className="rounded-xl overflow-hidden border border-[var(--color-surface-container-high)] shadow-md"
    style={{ bottom: '2rem', right: '2rem' }}
  />

  {/* Mini-map */}
  <MiniMap
    className="rounded-xl border border-[var(--color-surface-container-high)]"
    style={{ bottom: '5rem', right: '2rem', width: 160, height: 100 }}
  />
</ReactFlow>
```

### 9.5 Node Card Specification

**File:** `app/src/components/workflow/nodes/*.tsx`

All node types share a base `WorkflowNodeCard` wrapper:

```tsx
interface WorkflowNodeCardProps {
  nodeType: 'trigger' | 'condition' | 'action' | 'crystal' | 'flow';
  title: string;
  icon: string;
  summary: string;
  status: 'unconfigured' | 'configured' | 'running' | 'success' | 'error';
  isSelected: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}
```

**Node type border colors:**
```typescript
const nodeTypeBorder = {
  trigger:   '#3b82f6',  // blue
  condition: '#f59e0b',  // amber
  action:    '#22c55e',  // green
  crystal:   '#8329c8',  // purple (var(--color-tertiary))
  flow:      '#94a3b8',  // gray
};
```

```tsx
<div
  className={cn(
    'w-60 rounded-xl border-2 bg-white shadow-sm transition-all',
    isSelected && 'ring-2 ring-[var(--color-primary)] ring-offset-2',
    status === 'unconfigured' && 'border-dashed opacity-75',
    status === 'error' && 'border-[var(--color-error)]',
    status === 'running' && 'animate-pulse',
    status === 'success' && 'border-[var(--color-success)]',
  )}
  style={{ borderColor: status === 'error' ? undefined : status === 'running' ? nodeTypeBorder[nodeType] : nodeTypeBorder[nodeType] }}
>
  {/* Node header */}
  <div
    className="flex items-center gap-2 px-3 py-2 rounded-t-xl"
    style={{ background: `${nodeTypeBorder[nodeType]}10`, borderBottom: `1px solid ${nodeTypeBorder[nodeType]}25` }}
  >
    <div
      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ background: `${nodeTypeBorder[nodeType]}20` }}
    >
      <Icon name={icon} size={14} style={{ color: nodeTypeBorder[nodeType] }} />
    </div>
    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: nodeTypeBorder[nodeType] }}>
      {title}
    </span>
    {/* Status indicator */}
    <div className="ml-auto">
      {status === 'configured' && <Icon name="check_circle" size={12} style={{ color: 'var(--color-success)' }} fill={1} />}
      {status === 'error'      && <Icon name="error" size={12} style={{ color: 'var(--color-error)' }} fill={1} />}
      {status === 'running'    && <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] animate-pulse" />}
    </div>
  </div>

  {/* Node body */}
  <div className="px-3 py-3">
    {status === 'unconfigured' ? (
      <p className="text-xs text-on-surface-variant italic">{t('workflows.node.clickToConfigure')}</p>
    ) : (
      <p className="text-xs text-on-surface leading-relaxed line-clamp-2">{summary}</p>
    )}
  </div>

  {/* Hover actions */}
  <div className="absolute -top-8 right-0 hidden group-hover:flex items-center gap-1 bg-white rounded-lg border border-[var(--color-surface-container)] shadow-md px-1.5 py-1">
    <button onClick={onDuplicate} className="text-on-surface-variant hover:text-on-surface p-1 rounded">
      <Icon name="content_copy" size={12} />
    </button>
    <button onClick={onDelete} className="text-[var(--color-error)] hover:bg-[#fff0f3] p-1 rounded">
      <Icon name="delete" size={12} />
    </button>
  </div>

  {/* Input port (left) and Output port (right) — react-flow handles positioning */}
  <Handle type="target" position={Position.Left} className="w-3 h-3 rounded-full border-2 border-white" style={{ background: nodeTypeBorder[nodeType] }} />
  <Handle type="source" position={Position.Right} className="w-3 h-3 rounded-full border-2 border-white" style={{ background: nodeTypeBorder[nodeType] }} />
</div>
```

**Connection arrows:**
- Default: `stroke: #94a3b8, strokeWidth: 2` bezier curve
- Hover / selected: `stroke: var(--color-primary), strokeWidth: 2.5`
- Arrow head at target
- If/Else branch labels: `YES` (green) / `NO` (red) text on edge, centered
- Running animation: CSS stroke-dasharray animation

### 9.6 Node Configuration Panel

**File:** `app/src/components/workflow/WorkflowNodeConfigPanel.tsx`

Width: `var(--panel-node-config)` = 400px. Slides in from right.

```tsx
<div
  className="h-full w-[400px] flex flex-col overflow-hidden flex-shrink-0"
  style={{
    background: 'var(--color-surface-container-lowest)',
    borderLeft: '1px solid var(--color-surface-container)',
  }}
>
  {/* Header */}
  <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-surface-container)] flex-shrink-0">
    <div
      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${nodeColor}18` }}
    >
      <Icon name={node.icon} size={16} style={{ color: nodeColor }} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: nodeColor }}>
        {t(`workflows.nodeType.${node.type}`)}
      </p>
      <p className="font-semibold text-sm text-on-surface">{node.label}</p>
    </div>
    <Button variant="ghost" size="sm" className="text-xs font-bold" onClick={onClose}>
      {t('common.close')}
    </Button>
  </div>

  {/* Form content */}
  <ScrollArea className="flex-1">
    <div className="px-5 py-4 space-y-5">
      {/* Dynamic form fields based on node type */}
      <NodeConfigForm node={node} onUpdate={onUpdate} />

      {/* Variable picker trigger */}
      <div>
        <Label className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2 block">
          {t('workflows.nodeConfig.variables')}
        </Label>
        <Button
          variant="outline"
          size="sm"
          className="text-xs rounded-lg"
          onClick={openVariablePicker}
        >
          <Icon name="data_object" size={13} className="mr-1" />
          {t('workflows.nodeConfig.insertVariable')}
        </Button>
      </div>

      {/* Test button */}
      <div className="pt-2 border-t border-[var(--color-surface-container)]">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs font-semibold rounded-xl"
          onClick={testNode}
        >
          <Icon name="play_arrow" size={14} className="mr-1" />
          {t('workflows.nodeConfig.testWithSampleData')}
        </Button>
      </div>
    </div>
  </ScrollArea>

  {/* IMPORTANT: Clicking outside does NOT close this panel */}
  {/* Only Done/× button closes it */}
</div>
```

**Variable picker popover** (opens over the config panel):
Categorized list of `{{trigger.*}}`, `{{crystal.*}}`, `{{org.*}}` variables. Search box at top. Click variable → insert `{{variable.path}}` at cursor in focused text field.

### 9.7 Workflow Run History

**File:** `app/src/components/workflow/WorkflowRunHistory.tsx`

Accessible via a "History" button in the builder top bar. Opens as a Sheet (right side, full height, 560px wide).

```tsx
<Sheet open={isOpen} onOpenChange={onClose}>
  <SheetContent side="right" className="w-[560px] p-0 flex flex-col">
    <SheetHeader className="px-5 py-4 border-b border-[var(--color-surface-container)] flex-shrink-0">
      <SheetTitle className="font-headline text-base">{t('workflows.runHistory.title')}</SheetTitle>
    </SheetHeader>
    <ScrollArea className="flex-1">
      <div className="divide-y divide-[var(--color-surface-container)]">
        {executions.map(run => (
          <WorkflowRunItem key={run.id} run={run} />
        ))}
      </div>
    </ScrollArea>
  </SheetContent>
</Sheet>
```

**WorkflowRunItem:**
```tsx
// Collapsed:
<div className="px-5 py-4 cursor-pointer hover:bg-[var(--color-surface-container-low)]" onClick={toggle}>
  <div className="flex items-center gap-3">
    <Icon
      name={run.status === 'completed' ? 'check_circle' : run.status === 'failed' ? 'error' : 'schedule'}
      size={16}
      style={{ color: runStatusColor[run.status] }}
      fill={1}
    />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-on-surface">
        {t('workflows.runHistory.runNumber', { n: run.runNumber })}
      </p>
      <p className="text-[10px] text-on-surface-variant">
        {formatDateTime(run.triggeredAt)} · {formatDuration(run.durationMs)}
      </p>
    </div>
    {run.status === 'failed' && (
      <Button variant="ghost" size="sm" className="text-xs text-[var(--color-primary)]" onClick={(e) => { e.stopPropagation(); retryRun(run.id); }}>
        {t('workflows.runHistory.retry')}
      </Button>
    )}
    <Icon name={isExpanded ? 'expand_less' : 'expand_more'} size={16} className="text-on-surface-variant" />
  </div>
</div>

// Expanded step log:
{isExpanded && (
  <div className="px-5 pb-4 bg-[var(--color-surface-container-low)]">
    {run.steps.map((step, i) => (
      <div key={step.id} className="flex gap-3 py-2">
        <div className="flex flex-col items-center">
          <Icon
            name={stepStatusIcon[step.status]}
            size={14}
            style={{ color: stepStatusColor[step.status] }}
            fill={1}
          />
          {i < run.steps.length - 1 && <div className="flex-1 w-px bg-[var(--color-surface-container)] my-1" />}
        </div>
        <div className="flex-1 min-w-0 pb-1">
          <p className="text-xs font-semibold text-on-surface">{step.nodeLabel}</p>
          <p className="text-[10px] text-on-surface-variant">{formatDuration(step.durationMs)}</p>
          {step.status === 'failed' && step.errorMessage && (
            <p className="text-[10px] text-[var(--color-error)] mt-0.5">{step.errorMessage}</p>
          )}
        </div>
      </div>
    ))}
  </div>
)}
```

---

## 10. Component Library Additions Summary

All new components across all 5 features. File paths are relative to `app/src/`.

```
NotificationBell
  Path: components/NotificationBell.tsx
  Props: { unreadCount: number; hasCritical: boolean; onClick: () => void }
  Extends: uses Icon, Framer Motion, useTranslation

NotificationPanel (refactored from TopBar inline)
  Path: components/notifications/NotificationPanel.tsx
  Props: { isOpen: boolean; onClose: (open: boolean) => void }
  Extends: shadcn Sheet, ScrollArea; uses NotificationGroupedList

NotificationGroupedList
  Path: components/notifications/NotificationGroupedList.tsx
  Props: { notifications: Notification[]; onRead: fn; onDismiss: fn }
  Extends: uses NotificationItem, date-fns

NotificationItem
  Path: components/notifications/NotificationItem.tsx
  Props: { notification: Notification; onRead: fn; onDismiss: fn; onClick: fn }
  Extends: Framer Motion motion.div, Icon, cn()

NotificationIcon
  Path: components/notifications/NotificationIcon.tsx
  Props: { type: string; priority: string }
  Extends: Icon

NotificationEmptyState
  Path: components/notifications/NotificationEmptyState.tsx
  Props: none
  Extends: Icon

NotificationPanelSkeleton
  Path: components/notifications/NotificationPanelSkeleton.tsx
  Props: none
  Extends: CSS skeleton class

NotificationToast
  Path: components/notifications/NotificationToast.tsx
  Props: { toast: ToastNotification; onDismiss: (id: string) => void }
  Extends: Framer Motion, Icon, useTranslation

NotificationToastContainer
  Path: components/notifications/NotificationToastContainer.tsx
  Props: { toasts: ToastNotification[]; onDismiss: fn }
  Extends: Framer Motion AnimatePresence, NotificationToast

NotificationPreferencesPage
  Path: pages/NotificationPreferencesPage.tsx
  Props: none (page-level)
  Extends: PageHeader, shadcn Switch/Input/Card/Label

NotificationPreferenceRow
  Path: components/notifications/NotificationPreferenceRow.tsx
  Props: { labelKey: string; descriptionKey: string; preference: UserPreference; onUpdate: fn }
  Extends: shadcn Switch, Label

AlertCenterPage
  Path: pages/AlertCenterPage.tsx
  Props: none (page-level)
  Extends: PageHeader, AlertCard, AlertDetailDrawer, AlertCountChip

AlertCard
  Path: components/alerts/AlertCard.tsx
  Props: { alert: AlertEvent; onAcknowledge: fn; onSnooze: fn; onResolve: fn; onClick: fn }
  Extends: shadcn Card, DropdownMenu, Button, Badge, Framer Motion

AlertDetailDrawer
  Path: components/alerts/AlertDetailDrawer.tsx
  Props: { alert: AlertEvent | null; isOpen: boolean; onClose: () => void }
  Extends: shadcn Sheet, Icon, Recharts LineChart

AlertCountChip
  Path: components/alerts/AlertCountChip.tsx
  Props: { severity: string; count: number }
  Extends: Icon, cn()

AlertFilterBar
  Path: components/alerts/AlertFilterBar.tsx
  Props: { onFilterChange: (filters: AlertFilters) => void }
  Extends: shadcn Select, Input

AlertSetupWizard
  Path: components/alerts/AlertSetupWizard.tsx
  Props: { isOpen: boolean; onClose: () => void; onActivate: (rule: AlertRule) => void }
  Extends: shadcn Dialog, Button, Input, Select, Switch

DashboardPage
  Path: pages/DashboardPage.tsx
  Props: none (page-level)
  Extends: PageHeader, DashboardFilterBar, KpiTile, CrystalNarrativeCard, DashboardWidget

DashboardFilterBar
  Path: components/dashboard/DashboardFilterBar.tsx
  Props: { filters: DashboardFilters; onFiltersChange: fn }
  Extends: shadcn Input, Select, Button

KpiTile
  Path: components/dashboard/KpiTile.tsx
  Props: { metric: string; data: KpiData; onClick?: () => void }
  Extends: shadcn Card, Recharts LineChart (sparkline), Icon

CrystalNarrativeCard
  Path: components/dashboard/CrystalNarrativeCard.tsx
  Props: { narrative: string | null; lastUpdated: Date | null; confidence?: number; isLoading?: boolean; onRegenerate?: () => void; className?: string }
  Extends: shadcn Card, Progress, Icon, Framer Motion (loading state)

DashboardWidget
  Path: components/dashboard/DashboardWidget.tsx
  Props: { title: string; id: string; children: ReactNode; lastUpdated?: Date; isLoading?: boolean; onRefresh?: fn; onExport?: fn; onAskCrystal?: fn; className?: string }
  Extends: shadcn Card, Button, Icon

NpsTrendChart
  Path: components/dashboard/charts/NpsTrendChart.tsx
  Props: { data: NpsTrendPoint[]; predictions?: PredictionPoint[]; annotations?: ChartAnnotation[]; onAnnotationClick?: fn }
  Extends: Recharts LineChart/Line/XAxis/YAxis/CartesianGrid/Tooltip/ReferenceArea

NpsDistributionChart
  Path: components/dashboard/charts/NpsDistributionChart.tsx
  Props: { data: NpsDistributionData; comparePrior?: NpsDistributionData }
  Extends: Recharts BarChart

TopicSentimentMatrix
  Path: components/dashboard/charts/TopicSentimentMatrix.tsx
  Props: { topics: TopicSentimentData[]; onTopicClick: fn }
  Extends: D3 force simulation, SVG

VerbatimStream
  Path: components/dashboard/VerbatimStream.tsx
  Props: { verbatims: Verbatim[]; maxVisible?: number }
  Extends: Framer Motion AnimatePresence (for new verbatim entrance)

ChartTooltip
  Path: components/dashboard/charts/ChartTooltip.tsx
  Props: { active?: boolean; payload?: any[]; label?: string; annotations?: ChartAnnotation[] }
  Extends: Icon

AlertBannerWidget
  Path: components/dashboard/AlertBannerWidget.tsx
  Props: { alerts: AlertEvent[] }
  Extends: shadcn Card, Icon

CrystalActionBoard
  Path: components/dashboard/CrystalActionBoard.tsx
  Props: { actions: CrystalAction[]; onActionComplete: fn; onActionDismiss: fn }
  Extends: shadcn Card, Button

ImageUploadQuestion
  Path: components/survey/ImageUploadQuestion.tsx
  Props: { question: Question; value: UploadedImage[]; onChange: fn; maxImages?: number; maxSizeMB?: number }
  Extends: Icon, Framer Motion, Progress

SurveyImageGallery
  Path: components/visualai/SurveyImageGallery.tsx
  Props: { surveyId: string; questionId: string; totalCount: number; onImageClick: fn }
  Extends: shadcn Tabs, ScrollArea, Dialog (for lightbox)

CrystalChartQuery
  Path: components/visualai/CrystalChartQuery.tsx
  Props: { context?: DashboardContext; onChartAdded?: fn }
  Extends: VegaChart, Icon, Button, Input

VegaChart
  Path: components/visualai/VegaChart.tsx
  Props: { spec: object; width?: number; height?: number }
  Extends: react-vega or vega-embed

VisualInsightCard
  Path: components/visualai/VisualInsightCard.tsx
  Props: { chartSpec: object; headline: string; explanation: string; confidence: number; onAddToDashboard?: fn; onShare?: fn; onAskCrystal?: fn }
  Extends: shadcn Card, VegaChart, Button, Icon

AnnotationQuestion
  Path: components/survey/AnnotationQuestion.tsx
  Props: { question: Question; value: Annotation[]; onChange: fn; maxAnnotations?: number }
  Extends: HTML Canvas, Icon

WorkflowsPage (redesigned)
  Path: pages/WorkflowsPage.tsx (existing file — replace implementation)
  Props: none (page-level)
  Extends: PageHeader, WorkflowListCard, shadcn Tabs, WorkflowTemplateGallery

WorkflowListCard
  Path: components/workflow/WorkflowListCard.tsx
  Props: { workflow: Workflow; onToggle: fn; onEdit: fn; onDelete: fn }
  Extends: shadcn Card, Switch, Badge, Button, Icon

WorkflowTemplateGallery
  Path: components/workflow/WorkflowTemplateGallery.tsx
  Props: { onSelectTemplate: fn }
  Extends: shadcn Card

WorkflowBuilderPage
  Path: pages/WorkflowBuilderPage.tsx
  Props: none (page-level, reads :id from params)
  Extends: WorkflowNodeLibrary, WorkflowCanvas, WorkflowNodeConfigPanel, Framer Motion

WorkflowNodeLibrary
  Path: components/workflow/WorkflowNodeLibrary.tsx
  Props: { onDragStart: fn }
  Extends: shadcn ScrollArea, Input, Icon

WorkflowCanvas
  Path: components/workflow/WorkflowCanvas.tsx
  Props: { nodes: Node[]; edges: Edge[]; onNodesChange: fn; onEdgesChange: fn; onConnect: fn; onNodeSelect: fn; onDrop: fn }
  Extends: react-flow (ReactFlow, Background, Controls, MiniMap)

WorkflowNodeCard (base)
  Path: components/workflow/nodes/WorkflowNodeCard.tsx
  Props: { nodeType; title; icon; summary; status; isSelected; onDuplicate; onDelete }
  Extends: react-flow Handle, Icon, cn()

WorkflowTriggerNode
  Path: components/workflow/nodes/WorkflowTriggerNode.tsx
  Props: { data: TriggerNodeData; selected: boolean }
  Extends: WorkflowNodeCard

WorkflowConditionNode
  Path: components/workflow/nodes/WorkflowConditionNode.tsx
  Props: { data: ConditionNodeData; selected: boolean }
  Extends: WorkflowNodeCard

WorkflowActionNode
  Path: components/workflow/nodes/WorkflowActionNode.tsx
  Props: { data: ActionNodeData; selected: boolean }
  Extends: WorkflowNodeCard

WorkflowCrystalNode
  Path: components/workflow/nodes/WorkflowCrystalNode.tsx
  Props: { data: CrystalNodeData; selected: boolean }
  Extends: WorkflowNodeCard

WorkflowFlowNode
  Path: components/workflow/nodes/WorkflowFlowNode.tsx
  Props: { data: FlowNodeData; selected: boolean }
  Extends: WorkflowNodeCard

WorkflowNodeConfigPanel
  Path: components/workflow/WorkflowNodeConfigPanel.tsx
  Props: { node: SelectedNode; onUpdate: fn; onClose: () => void }
  Extends: shadcn ScrollArea, Input, Select, Textarea, Button, Framer Motion

WorkflowRunHistory
  Path: components/workflow/WorkflowRunHistory.tsx
  Props: { workflowId: string; isOpen: boolean; onClose: () => void }
  Extends: shadcn Sheet, ScrollArea, Icon

WorkflowRunItem
  Path: components/workflow/WorkflowRunItem.tsx
  Props: { run: WorkflowExecution; onRetry: fn }
  Extends: Icon

useAlertCount
  Path: hooks/useAlertCount.ts
  Returns: { criticalCount: number; warningCount: number; totalCount: number }
  Extends: useApi(), SWR or React Query
```

---

## 11. Localization Keys

All keys go in `app/src/locales/en.ts`. Add under their feature namespace.

```typescript
// ── Notifications ──────────────────────────────────────────────────────────
notifications: {
  title: 'Notifications',
  bellLabel: '{count} unread notifications',
  markAllRead: 'Mark all read',
  panelDescription: 'Crystal and survey activity notifications',
  empty: "You're all caught up",
  emptySubtitle: 'Crystal activity will appear here',
  loadMore: 'Load more',
  dismiss: 'Dismiss',
  group: {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    older: 'Older',
  },
  priority: {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
    success: 'Success',
  },
  unreadCount: '{count} unread',
},

notificationPreferences: {
  pageTitle: 'Notification Preferences',
  pageSubtitle: 'Control when and how Experient notifies you',
  saveButton: 'Save Preferences',
  saved: 'Preferences saved',
  category: {
    score: 'Score & Performance',
    crystal: 'Crystal AI',
    surveys: 'Surveys',
    operations: 'Operations',
    quietHours: 'Quiet Hours',
  },
  channel: {
    inApp: 'In-App',
    email: 'Email',
    slack: 'Slack',
  },
  npsAlerts: {
    label: 'NPS Score Alerts',
    description: 'When NPS drops or rises significantly',
    thresholdPrefix: 'Alert when NPS drops by more than',
    thresholdSuffix: 'points',
  },
  quietHours: {
    label: 'Quiet Hours',
    description: 'Suppress non-critical notifications during these hours',
    from: 'From',
    to: 'To',
    timezone: 'Timezone',
  },
},

// ── Alerts ─────────────────────────────────────────────────────────────────
alerts: {
  pageTitle: 'Alerts',
  pageSubtitle: 'Intelligence alerts from Crystal and your surveys',
  configureRules: 'Configure Rules',
  tabs: {
    all: 'All',
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
  },
  severity: {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
    success: 'Success',
  },
  status: {
    active: 'Active',
    acknowledged: 'Acknowledged',
    snoozed: 'Snoozed',
    resolved: 'Resolved',
  },
  actions: {
    acknowledge: 'Acknowledge',
    snooze: 'Snooze',
    resolve: 'Resolve',
    dismiss: 'Dismiss',
  },
  snooze: {
    '1h': 'Snooze 1 hour',
    '4h': 'Snooze 4 hours',
    '24h': 'Snooze 1 day',
    '7d': 'Snooze 1 week',
  },
  recommendedAction: 'Recommended Action',
  wizard: {
    title: 'Create Alert Rule',
    step1: { label: 'What to Monitor', title: 'What do you want to be alerted about?' },
    step2: { label: 'Set Conditions', title: 'Set your alert conditions' },
    step3: { label: 'Recipients',     title: 'Who should receive this alert?' },
    step4: { label: 'Channels',       title: 'How should alerts be delivered?' },
    activateAlert: 'Activate Alert',
    preview: 'Alert preview',
    categories: {
      score:      { label: 'Score Changes',   description: 'NPS, CSAT, CES drops or rises' },
      volume:     { label: 'Response Volume', description: 'Rate, quota, milestones' },
      topics:     { label: 'Topics & Sentiment', description: 'Emerging topics, shifts' },
      crystal:    { label: 'Crystal AI Events',  description: 'Insights, anomalies' },
      operations: { label: 'Operations',      description: 'Pipeline, integrations' },
    },
    recipients: {
      surveyCreator: 'Survey creator',
      orgAdmins: 'Org administrators',
      allMembers: 'All team members',
      externalEmail: 'External email',
    },
  },
},

// ── Dashboard ───────────────────────────────────────────────────────────────
dashboard: {
  pageTitle: 'Dashboard',
  pageSubtitle: 'Your experience intelligence at a glance',
  kpi: {
    nps: 'NPS Score',
    csat: 'CSAT',
    ces: 'Effort Score',
    responses: 'Responses',
    responseRate: 'Response Rate',
    insights: 'Crystal Insights',
    vsPriorPeriod: 'vs prior period',
  },
  crystalNarrative: {
    title: "Crystal's Analysis",
    empty: 'Crystal is analyzing your data. Click Regenerate when ready.',
    confidence: 'Crystal Confidence',
  },
  npsTrend: 'NPS Trend',
  topicMatrix: 'Topic Sentiment Matrix',
  npsDistribution: 'NPS Distribution',
  recentVerbatims: 'Recent Verbatims',
  filters: {
    clear: 'Clear all',
    saveView: 'Save view',
    remove: 'Remove {label} filter',
    dateRange: 'Date range',
    survey: 'Survey',
    segment: 'Segment',
  },
  widget: {
    refresh: 'Refresh widget',
    askCrystal: 'Ask Crystal about this',
    export: 'Export data',
    lastUpdated: 'Updated {time}',
  },
  alerts: {
    sectionTitle: 'Active Alerts',
    viewAll: 'View all alerts →',
  },
  crystalActions: {
    sectionTitle: 'Crystal Recommends',
    markDone: 'Done',
    dismiss: 'Not applicable',
  },
},

// ── Visual AI ───────────────────────────────────────────────────────────────
imageUpload: {
  camera: 'Take a photo',
  fromLibrary: 'Upload image',
  orDragDrop: 'or drag & drop here',
  limits: 'Up to {maxCount} images · {formats} · Max {maxMB}MB each',
  privacyNotice: 'Images are analyzed privately and never shared publicly',
  analyzing: 'Analyzing...',
  removeImage: 'Remove image',
  uploadProgress: 'Uploading {percent}%',
},

imageGallery: {
  tabs: {
    all: 'All',
    positive: 'Positive',
    neutral: 'Neutral',
    negative: 'Negative',
  },
  crystalSummaryTitle: 'Crystal Summary',
  lightboxCrystalAnalysis: "Crystal's Analysis",
  exportButton: 'Export CSV',
},

crystalChartQuery: {
  placeholder: 'Ask Crystal to draw a chart...',
  generate: 'Generate',
  addToDashboard: 'Add to Dashboard',
  exportPng: 'Export PNG',
  askFollowUp: 'Ask follow-up...',
  suggestions: [
    'NPS by region for Q4',
    'Topic sentiment over time',
    'Response rate by channel',
  ],
},

crystalInsight: {
  addToDashboard: 'Add to Dashboard',
  confidence: '{pct}% confidence',
},

annotationQuestion: {
  imageAlt: 'Survey question image',
  instructions: 'Click anywhere on the image to place a marker. Click a marker to remove it.',
  removeMarker: 'Remove marker {n}',
},

// ── Workflows ────────────────────────────────────────────────────────────────
workflows: {
  pageTitle: 'Workflows',
  pageSubtitle: 'Automated programs that turn Crystal insights into action',
  mainHeading: 'Workflows',
  mainDescription: 'Build automated pipelines that react to your experience data',
  newWorkflowButton: 'New Workflow',
  searchPlaceholder: 'Search workflows...',
  filterByTrigger: 'Filter by trigger',
  tabs: {
    all: 'All',
    active: 'Active',
    draft: 'Draft',
    error: 'Error',
  },
  status: {
    active: 'Active',
    draft: 'Draft',
    paused: 'Paused',
    error: 'Error',
    archived: 'Archived',
  },
  lastRun: 'Last run',
  neverRun: 'Never',
  runs: 'Runs',
  toggleEnabled: 'Toggle {name}',
  templates: {
    sectionTitle: 'Start from a template',
    useTemplate: 'Use template',
    categories: {
      closedLoop: 'Closed-Loop',
      reporting: 'Reporting',
      escalation: 'Escalation',
    },
  },
  empty: {
    heading: 'No workflows yet',
    description: 'Create your first workflow to automate experience management actions.',
    cta: 'Create Workflow',
  },
  builder: {
    backToList: 'Workflows',
    test: 'Test',
    activate: 'Activate',
    deactivate: 'Deactivate',
    saveChanges: 'Save',
    unsavedChanges: 'Unsaved changes',
  },
  nodeLibrary: {
    search: 'Search nodes...',
    categories: {
      triggers: 'Triggers',
      conditions: 'Conditions',
      crystalAI: 'Crystal AI',
      actionsNotify: 'Actions — Notify',
      actionsIntegrate: 'Actions — Integrate',
      flowControl: 'Flow Control',
    },
  },
  nodeType: {
    trigger: 'Trigger',
    condition: 'Condition',
    action: 'Action',
    crystal: 'Crystal AI',
    flow: 'Flow Control',
  },
  node: {
    clickToConfigure: 'Click to configure this step',
  },
  nodeConfig: {
    variables: 'Insert Variable',
    insertVariable: 'Insert variable',
    testWithSampleData: 'Test this step with sample data',
  },
  runHistory: {
    title: 'Run History',
    runNumber: 'Run #{n}',
    retry: 'Retry',
    reRunLast: 'Re-run last',
  },
  controls: {
    pause: 'Pause',
    resume: 'Resume',
    edit: 'Edit',
  },
  conditionOptions: [],  // populated from API
  actionOptions: [],     // populated from API
  modal: {
    heading: 'New Workflow',
    nameLabel: 'Workflow Name',
    namePlaceholder: 'e.g. NPS Recovery',
    conditionLabel: 'When this happens',
    actionLabel: 'Do this',
    previewLabel: 'Preview',
    cancelButton: 'Cancel',
    createButton: 'Create',
  },
  stats: {
    active: 'Active',
    triggersToday: 'Triggers Today',
    paused: 'Paused',
  },
},
```

---

## 12. Animation and Interaction Patterns

All animations use Framer Motion (already in the stack). For CSS-only persistent decorative animations, use CSS keyframes.

### 12.1 Panel Slide-In

Used by: NotificationPanel (via shadcn Sheet), AlertDetailDrawer (via shadcn Sheet), WorkflowNodeConfigPanel (via Framer Motion directly).

Sheet component handles its own animation internally via Radix. For WorkflowNodeConfigPanel:
```typescript
// Panel enters from right
initial: { x: 400, opacity: 0 }
animate: { x: 0, opacity: 1 }
exit:    { x: 400, opacity: 0 }
transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
```

### 12.2 Page Fade-In

Already implemented in AppShell via `pageVariants`. Every route change triggers this automatically.

### 12.3 Scale-In (Dropdowns, Tooltips)

```typescript
// For custom dropdowns (not shadcn):
initial: { scale: 0.95, opacity: 0 }
animate: { scale: 1, opacity: 1 }
exit:    { scale: 0.95, opacity: 0 }
transition: { duration: 0.1, ease: [0.22, 1, 0.36, 1] }
```

shadcn DropdownMenu and Tooltip handle their own animation via Radix.

### 12.4 Badge Pulse (NotificationBell)

```typescript
// Only when hasCritical AND new notification arrived (not on mount):
animate: { scale: [1, 1.12, 1] }
transition: { duration: 0.5, repeat: 2, ease: 'easeInOut' }

// Prefers-reduced-motion: skip entirely
```

### 12.5 Toast Slide-In

```typescript
initial: { opacity: 0, x: 100, scale: 0.95 }
animate: { opacity: 1, x: 0, scale: 1 }
exit:    { opacity: 0, x: 100, scale: 0.95 }
transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
```

Auto-dismiss: use `setTimeout` + trigger `exit` animation manually via `AnimatePresence mode="popLayout"`.

### 12.6 Staggered Card Grid

For dashboard KPI tiles, alert list, workflow list — use the house stagger pattern:
```typescript
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const rise = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
// Usage:
<motion.div variants={stagger} initial="hidden" animate="visible">
  {items.map(item => <motion.div key={item.id} variants={rise}>{...}</motion.div>)}
</motion.div>
```

### 12.7 Skeleton Loading

Use CSS-only (no Framer Motion needed — better performance):
```tsx
// In components:
<div className="skeleton h-8 rounded-xl" />
<div className="skeleton h-4 rounded w-3/4 mt-2" />

// Crystal-tinted variant:
<div className="skeleton-crystal h-8 rounded-xl" />
```

### 12.8 Workflow Node Running State

```css
/* CSS pulse for running node border */
@keyframes node-running-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
.node-running {
  animation: node-running-pulse 1.5s ease-in-out infinite;
}
```

### 12.9 Workflow Connection Arrow Animation (active/running)

```css
@keyframes edge-flow {
  from { stroke-dashoffset: 20; }
  to   { stroke-dashoffset: 0; }
}
.edge-running {
  stroke-dasharray: 5 3;
  animation: edge-flow 0.5s linear infinite;
  stroke: var(--color-primary);
}
```

---

## 13. Accessibility Checklist

Apply to every new component listed in Section 10.

### 13.1 Icon-Only Buttons
Every `<button>` that contains only an icon must have:
```tsx
aria-label={t('accessibility.buttonLabel')}
// OR
<Button aria-label="Close panel">
  <Icon name="close" size={16} />
</Button>
```

### 13.2 Focus Ring
All interactive elements must show the Experient focus ring on keyboard focus. In Tailwind v4 with CSS vars:
```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--brand-radius-sm);
}
```

Use `class="brand-ring"` for custom focus rings (defined in index.css). shadcn components already use `focus-visible:ring-2 focus-visible:ring-ring` which maps to `--ring: var(--color-primary)`.

### 13.3 Panel Focus Trap

All sliding panels (NotificationPanel, AlertDetailDrawer, WorkflowNodeConfigPanel) must trap focus:
- First Tab after panel opens: first interactive element inside panel
- Shift+Tab from first element: wraps to last element
- Escape key: closes the panel

shadcn `Sheet` (Dialog) handles focus trap automatically via Radix. For custom panels using Framer Motion (WorkflowNodeConfigPanel), add `focus-trap-react` or implement manually with refs.

### 13.4 Screen Reader Announcements

**For new notifications (live updates):**
```tsx
// In NotificationToastContainer:
<div aria-live="polite" aria-atomic="false" className="sr-only">
  {latestToast?.title}
</div>

// For critical:
<div aria-live="assertive" aria-atomic="true" className="sr-only">
  {criticalToast?.title}
</div>
```

**For notification count changes:**
```tsx
// In NotificationBell:
<span className="sr-only" aria-live="polite">
  {unreadCount > 0 ? t('notifications.unreadCount', { count: unreadCount }) : t('notifications.allRead')}
</span>
```

### 13.5 Color + Icon (Never Color Alone)

Every severity indicator must pair color with an icon or text label:
- Alert severity: colored border-left + severity icon + severity text label
- Notification priority: colored dot + priority text
- Chart anomaly markers: triangle/circle shape (not just color)
- Status indicators in workflow nodes: icon + status text

### 13.6 Reduced Motion

```tsx
// Check at the component level before any animation:
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// In Framer Motion components:
<motion.div
  animate={prefersReducedMotion ? {} : { scale: [1, 1.12, 1] }}
>

// Three.js canvas (already handled in app/CLAUDE.md):
{!prefersReducedMotion && (
  <Suspense fallback={null}>
    <HeroCanvas />
  </Suspense>
)}
```

Also add CSS media query in `app/src/index.css`:
```css
@media (prefers-reduced-motion: reduce) {
  .skeleton, .skeleton-crystal {
    animation: none;
    background: var(--color-surface-container);
  }
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 13.7 Keyboard Navigation for Custom Components

**Notification Panel:**
- Bell button: Enter/Space opens panel
- Within panel: Tab navigates through notifications
- Each notification: Enter/Space navigates to actionUrl + marks read
- Dismiss button: accessible via Tab then Enter

**Alert Card:**
- Card: Enter/Space opens detail drawer
- Action buttons: each individually focusable
- Snooze dropdown: keyboard-navigable via shadcn DropdownMenu (Radix handles this)

**Workflow Canvas:**
- Selected node: Delete key deletes node (with confirmation)
- Arrow keys: move selected node by 10px
- Escape: deselect node, close config panel

### 13.8 ARIA Roles and Labels

```tsx
// Alert severity badge:
<span role="status" aria-label={t('alerts.severity.critical')}>🔴</span>

// Notification count:
<span aria-label={t('notifications.bellLabel', { count: unreadCount })} aria-live="polite">
  {unreadCount}
</span>

// Chart (non-decorative):
<div role="img" aria-label={t('dashboard.npsTrend.chartAriaLabel', { nps: currentNps })}>
  {/* chart */}
</div>

// Workflow canvas:
<div role="application" aria-label={t('workflows.builder.canvasAriaLabel')}>
  {/* react-flow */}
</div>
```

---

## 14. Mobile and Responsive Behavior

### 14.1 Notification Panel

- Desktop (≥1024px): 400px wide Sheet from right, content area shrinks
- Tablet (768–1023px): 360px wide Sheet from right (sidebar collapsed already)
- Mobile (<768px): Full-screen overlay (`width: 100vw`)
  ```tsx
  style={{ width: 'min(400px, 100vw)' }}
  ```

### 14.2 Alert Center Page

- Desktop: Alert cards full-width with all action buttons visible
- Tablet: Alert cards full-width, action buttons wrap to second row
- Mobile: Alert cards full-width, action buttons shown in a 2-column grid. AlertDetailDrawer becomes full-screen on mobile:
  ```tsx
  style={{ width: 'min(560px, 100vw)' }}
  ```

Alert filter bar on mobile: horizontal scroll, hide "Sort" option behind "⋯" more menu.

### 14.3 Dashboard

**KPI tiles:** Responsive grid breakpoints:
- Mobile: `grid-cols-2` (3 rows of 2)
- Tablet: `grid-cols-3` (2 rows of 3)
- Desktop: `grid-cols-6` (1 row of 6)
  ```tsx
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
  ```

**Widget grid:**
- Mobile: `grid-cols-1` (all widgets stacked)
- Tablet: `grid-cols-2` for most widgets, topic matrix full-width
- Desktop: `grid-cols-2` as default, Crystal narrative 12-col full-width

**Filter bar on mobile:** Horizontal scroll. Date picker and Survey picker shown as compact chips. "Save view" hidden on mobile.

**Crystal Narrative Card:** Always full-width across all breakpoints.

### 14.4 Visual AI Components

**Image Upload (SurveyFillPage — public, no AppShell):**
- Mobile: stacked camera/upload buttons instead of side-by-side
- Image thumbnail grid: `grid-cols-3` on mobile, `grid-cols-4` on desktop
- Drop zone: same height on all sizes

**Image Gallery (analyst view):**
- Mobile: `grid-cols-3` (60px each), tap → lightbox full-screen
- Desktop: `grid-cols-auto-fill minmax(160px, 1fr)`
- Lightbox on mobile: full-screen, Crystal sidebar becomes bottom sheet

### 14.5 Workflow Builder

Desktop only. On tablet and mobile, the builder shows a message:
```tsx
// In WorkflowBuilderPage, check breakpoint:
const breakpoint = useBreakpoint();
if (breakpoint !== 'desktop') {
  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader crumbs={...} title={t('workflows.builder.backToList')} />
      <div className="text-center py-20">
        <Icon name="desktop_windows" size={48} className="text-on-surface-variant mx-auto mb-4" />
        <h3 className="font-headline font-bold text-xl text-on-surface mb-2">
          {t('workflows.builder.desktopOnly')}
        </h3>
        <p className="text-sm text-on-surface-variant mb-6">
          {t('workflows.builder.desktopOnlyDescription')}
        </p>
        <Button variant="outline" onClick={navigateBack}>
          {t('workflows.builder.backToList')}
        </Button>
      </div>
    </div>
  );
}
```

Add these keys to locales:
```typescript
'workflows.builder.desktopOnly': 'Workflow Builder requires a desktop browser',
'workflows.builder.desktopOnlyDescription': 'Please open this page on a desktop computer to build and edit workflows.',
```

### 14.6 BottomNav Updates (Mobile)

The mobile BottomNav needs two new items. Update `app/src/components/BottomNav.tsx`:

New items: Dashboard, Surveys, FAB(Create), Alerts, Insights

```typescript
const BOTTOM_NAV_ITEMS = [
  { key: 'nav.dashboard', icon: 'dashboard',              path: ROUTES.DASHBOARD },
  { key: 'nav.surveys',   icon: 'poll',                   path: ROUTES.SURVEYS },
  // center FAB is Create (unchanged)
  { key: 'nav.alerts',    icon: 'notification_important', path: ROUTES.ALERTS },
  { key: 'nav.insights',  icon: 'psychology',             path: ROUTES.INSIGHTS },
];
```

The Alerts bottom nav item should show the critical count badge — same red badge style as the SideNav alerts badge.

---

*UX Design Specification compiled by the Experient UX Team — Kenji Nakamura (Lead), Priya Sharma, Aiko Yamamoto, Mei-Ling Zhou, Yuki Tanaka, Diana Osei, Emma Thompson.*  
*Experient Platform Design Series, June 2026.*
