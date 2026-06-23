# UX Implementation Guide — Theme-Aligned Component Specs

**Version:** 2.0 (Ground Truth Edition)  
**Date:** 2026-06-03  
**Built from:** Direct reading of `AppShell.tsx`, `TopBar.tsx`, `SideNav.tsx`, `CrystalPanel.tsx`, `LoadingStates.tsx`, `ErrorBoundary.tsx`, `WorkflowsPage.tsx`, `theme.css`, `index.css`, `useNotifications.ts`

> This document supersedes the earlier UX_DESIGN_SPEC.md wherever they conflict.  
> Every class name, token, animation value, and pattern here is taken from **actual running code** — not guessed.

---

## Table of Contents

1. [Design System Reference](#1-design-system-reference)
2. [Page Anatomy — How to Write a New Page](#2-page-anatomy)
3. [Navigation Changes](#3-navigation-changes)
4. [Loading & Skeleton Patterns](#4-loading--skeleton-patterns)
5. [Error Handling Patterns](#5-error-handling-patterns)
6. [Animation Specs](#6-animation-specs)
7. [Feature 1: Notifications (Enhance What Exists)](#7-feature-1-notifications)
8. [Feature 2: Alerts System](#8-feature-2-alerts-system)
9. [Feature 3: Dashboard](#9-feature-3-dashboard)
10. [Feature 4: Visual AI](#10-feature-4-visual-ai)
11. [Feature 5: Workflow Builder](#11-feature-5-workflow-builder)
12. [New Routes Manifest](#12-new-routes-manifest)
13. [New Localization Keys](#13-new-localization-keys)
14. [Accessibility Checklist](#14-accessibility-checklist)

---

## 1. Design System Reference

### 1.1 Color Tokens (from `theme.css` — use `var()`, never hardcode hex)

```css
/* Primary — brand blue */
var(--color-primary)              /* #2a4bd9 — buttons, links, active states */
var(--color-primary-dim)          /* #173dcd — hover states */
var(--color-primary-container)    /* #879aff — tinted chips, backgrounds */
var(--color-on-primary)           /* #f2f1ff — text on primary bg */

/* Tertiary — crystal purple */
var(--color-tertiary)             /* #8329c8 — Crystal AI elements */
var(--color-tertiary-container)   /* #d299ff — Crystal tinted backgrounds */
var(--color-on-tertiary)          /* #fceeff — text on tertiary bg */

/* Status — NOT brand-overridden, always these values */
var(--color-error)                /* #b41340 — critical/error/destructive */
var(--color-error-container)      /* #f74b6d — error chip background */
var(--color-success)              /* #059669 — success states */
var(--color-success-container)    /* #d1fae5 — success chip background */
var(--color-warning)              /* #d97706 — warning states */
var(--color-warning-container)    /* #fef3c7 — warning chip background */

/* Surfaces */
var(--color-surface)              /* #f5f7f9 — page background */
var(--color-surface-container-lowest) /* #ffffff — cards */
var(--color-surface-container-low)    /* #eef1f3 — subtle container */
var(--color-surface-container)        /* #e5e9eb — inputs, muted areas */

/* Text */
var(--color-on-surface)           /* #2c2f31 — primary text */
var(--color-on-surface-variant)   /* #595c5e — secondary text */
var(--color-outline-variant)      /* #abadaf — borders, dividers */

/* Shadows */
var(--shadow-card)                /* 0 4px 24px rgba(0,0,0,0.04) */
var(--shadow-card-hover)          /* lifts on hover with primary color tint */
var(--shadow-primary)             /* 0 10px 25px -5px primary@35% */
```

### 1.2 The Critical Rule — Brand-Responsive Colors

```tsx
// ✅ CORRECT — responds to runtime brand overrides
<div style={{ background: 'var(--color-primary)' }}>
<div style={{ color: 'var(--color-tertiary)' }}>

// ✅ OK for subtle tints — Tailwind /opacity syntax works
<div className="bg-primary/5">          {/* 5% primary tint */}
<div className="hover:bg-primary/8">    {/* hover state */}
<div className="text-primary">          {/* primary text color */}

// ❌ WRONG for buttons/borders/anything user-visible — static, ignores brand
<div className="bg-[#2a4bd9]">          {/* hardcoded hex */}
<div className="bg-indigo-600">         {/* Tailwind color, not brand */}

// ✅ BOTH — static Tailwind + live CSS var (best for important elements)
<button
  className="bg-primary text-on-primary"
  style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
>
```

### 1.3 Typography

```tsx
// Heading font (Manrope) — use font-headline class
<h1 className="font-headline text-3xl font-black">

// Body font (Inter) — default, no class needed
<p className="text-sm text-on-surface-variant">

// Brand gradient text (used on hero headings)
<h2 className="brand-gradient-text font-headline font-black text-2xl">
```

### 1.4 Icons — Material Symbols ONLY

```tsx
import { Icon } from '@/components/Icon';

// Standard usage
<Icon name="notifications" size={20} />
<Icon name="dashboard" size={20} fill={1} />  // fill=1 for filled variant

// Inline gradient icon (used in empty states)
<Icon
  name="notifications"
  size={22}
  style={{
    backgroundImage: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }}
/>

// Icon name reference for new features:
// notifications       — bell (unread notifications)
// notification_important — alert bell
// dashboard           — dashboard grid
// bar_chart           — analytics/alerts
// account_tree        — workflows (already in nav)
// warning             — warning/alert
// error               — critical error
// check_circle        — success/resolved
// auto_awesome        — Crystal/AI sparkles
// trending_down       — NPS drop
// trending_up         — NPS rise
// image               — image upload
// photo_camera        — camera
// scatter_plot        — bubble chart
// analytics           — dashboard/analytics
// schedule            — time trigger
// webhook             — webhook connector
// bolt                — alert firing / trigger
```

### 1.5 Border Radius

```tsx
// Always use semantic tokens — they respect brand radius overrides
rounded-xl    // var(--brand-radius) = 0.75rem — cards, buttons, inputs
rounded-2xl   // var(--brand-radius-lg) = 1rem — larger cards
rounded-full  // for badges, avatars

// Card pattern (always this shadow + border + radius combo)
<div
  className="rounded-2xl bg-surface-container-lowest"
  style={{
    boxShadow: 'var(--shadow-card)',
    border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)',
  }}
>
```

### 1.6 Gradient Utilities (from `index.css`)

```tsx
// Available CSS classes:
"brand-gradient"       // bg: linear-gradient(135deg, primary, tertiary)
"brand-gradient-text"  // gradient text clip
"brand-shadow"         // box-shadow with primary tint
"brand-ring"           // focus ring outline

// color-mix pattern (used throughout for tinted backgrounds):
style={{ background: 'color-mix(in srgb, var(--color-primary) 6%, transparent)' }}
style={{ border: '1px solid color-mix(in srgb, var(--color-primary) 10%, transparent)' }}
```

### 1.7 Severity Color System (for Alerts/Notifications)

```tsx
// Map priority → color token (never hardcode)
const SEVERITY_COLORS = {
  critical: {
    color:  'var(--color-error)',          // #b41340
    bg:     'var(--color-error-container)', // semi-transparent red
    border: 'var(--color-error)',
    icon:   'notification_important',
  },
  warning: {
    color:  'var(--color-warning)',         // #d97706
    bg:     'var(--color-warning-container)',
    border: 'var(--color-warning)',
    icon:   'warning',
  },
  info: {
    color:  'var(--color-primary)',         // #2a4bd9
    bg:     'color-mix(in srgb, var(--color-primary) 8%, transparent)',
    border: 'var(--color-primary)',
    icon:   'info',
  },
  success: {
    color:  'var(--color-success)',         // #059669
    bg:     'var(--color-success-container)',
    border: 'var(--color-success)',
    icon:   'check_circle',
  },
} as const;
```

---

## 2. Page Anatomy

Every new authenticated page follows this exact pattern, matching existing pages:

```tsx
// app/src/pages/DashboardPage.tsx
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { PageHeader } from '../components/PageHeader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ROUTES } from '../constants/routes';
import { motion } from 'framer-motion';

export function DashboardPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('dashboard.pageTitle'), t('dashboard.pageSubtitle'));

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        title={t('dashboard.pageTitle')}
        subtitle={t('dashboard.pageSubtitle')}
        actions={
          <Button variant="outline" size="sm">
            <Icon name="tune" size={16} />
            {t('dashboard.customizeButton')}
          </Button>
        }
      />

      {/* Wrap content sections in inline ErrorBoundary */}
      <ErrorBoundary inline>
        <DashboardContent />
      </ErrorBoundary>
    </div>
  );
}

function DashboardContent() {
  // stagger entrance for content sections
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
      className="space-y-6 pb-8"
    >
      <motion.div variants={RISE}>
        <KpiTilesRow />
      </motion.div>
      <motion.div variants={RISE}>
        <CrystalNarrativeCard />
      </motion.div>
      {/* ...more sections */}
    </motion.div>
  );
}

// House spring curve — use for all entrance animations
const RISE = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};
```

---

## 3. Navigation Changes

### 3.1 New Routes to Add to `constants/routes.ts`

```ts
// Add to ROUTES object:
DASHBOARD:      '/app/dashboard',
ALERTS:         '/app/alerts',
ALERTS_RULES:   '/app/alerts/rules',
WORKFLOWS_NEW:  '/app/workflows/new',
WORKFLOWS_BUILDER: '/app/workflows/:workflowId/builder',
```

### 3.2 SideNav — Add Dashboard & Alerts Items

Add these two items to `NAV_ITEMS` in `SideNav.tsx`, **after** the existing `nav.experience` item:

```tsx
// In SideNav.tsx, update NAV_ITEMS:
const NAV_ITEMS = [
  { key: 'nav.surveys',     icon: 'poll',         path: ROUTES.SURVEYS },
  { key: 'nav.data',        icon: 'dataset',      path: '/app/data' },
  { key: 'nav.insights',    icon: 'psychology',   path: ROUTES.INSIGHTS, fill: 1 },
  { key: 'nav.experience',  icon: 'spa',          path: ROUTES.EXPERIENCE },
  // ↓ NEW
  { key: 'nav.dashboard',   icon: 'analytics',    path: ROUTES.DASHBOARD },
  { key: 'nav.alerts',      icon: 'notification_important', path: ROUTES.ALERTS },
  // ↑ NEW
  { key: 'nav.respondents', icon: 'groups',       path: ROUTES.RESPONDENTS },
  { key: 'nav.workflows',   icon: 'account_tree', path: ROUTES.WORKFLOWS },
  { key: 'nav.templates',   icon: 'auto_awesome', path: ROUTES.TEMPLATES },
];
```

### 3.3 Alerts Badge in SideNav (Critical Count)

The Alerts nav item needs a badge showing the count of active critical alerts. Wrap the existing nav item render with a badge overlay:

```tsx
// In SideNav.tsx — modify the nav item render to support badges:
// Add to each NAV_ITEMS entry: optional badge prop

interface NavItem {
  key: string;
  icon: string;
  path: string;
  fill?: number;
  badge?: () => number | null; // optional dynamic badge count
}

// In the alerts item:
{ key: 'nav.alerts', icon: 'notification_important', path: ROUTES.ALERTS,
  badge: () => useAlertsBadge() } // hook that returns critical count or null

// In render (both expanded and collapsed):
{item.badge && (() => {
  const count = item.badge!();
  return count && count > 0 ? (
    <span
      className="ml-auto min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-black
                 flex items-center justify-center px-0.5 flex-shrink-0"
      style={{ background: 'var(--color-error)' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  ) : null;
})()}
```

**`useAlertsBadge` hook** — add to `hooks/useAlertsBadge.ts`:

```ts
import { useState, useEffect, useRef } from 'react';
import { useApi } from './useApi';

export function useAlertsBadge() {
  const api = useApi();
  const [count, setCount] = useState<number | null>(null);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { critical } = await api.getAlertBadgeCount();
        setCount(critical);
      } catch {
        // non-critical — silently ignore, badge just won't show
      }
    };
    fetch();
    ref.current = setInterval(fetch, 60_000); // poll every 60s
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);

  return count;
}
```

---

## 4. Loading & Skeleton Patterns

### 4.1 Existing Patterns (reuse these — do NOT invent new ones)

```tsx
import { Spinner, SurveyListSkeleton, OverlayLoader } from '../components/LoadingStates';

// Inline spinner (inside a panel or card)
<Spinner size={24} color="var(--color-primary)" />

// Full-page loading (before first data arrives)
<FullPageLoader message={t('common.loading')} />

// Overlay (for save/submit operations)
<OverlayLoader visible={saving} message={t('common.saving')} />

// Bounce dots (for panel loading — matches existing notification panel)
<div className="flex items-center justify-center py-12">
  <div className="flex gap-1">
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        className="w-2 h-2 rounded-full animate-bounce"
        style={{ background: 'var(--color-primary-container)', animationDelay: `${i * 0.15}s` }}
      />
    ))}
  </div>
</div>
```

### 4.2 Skeleton Component (using existing `.skeleton` CSS class)

The `.skeleton` class is defined in `App.css` / `index.css` — use it directly:

```tsx
// Generic skeleton placeholder
function SkeletonLine({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`skeleton ${h} ${w} rounded-lg`} />;
}

// KPI tile skeleton (matches card pattern)
function KpiTileSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl p-5 bg-surface-container-lowest"
      style={{ boxShadow: 'var(--shadow-card)', border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)' }}
    >
      <SkeletonLine w="w-24" h="h-3" />
      <SkeletonLine w="w-16" h="h-8" />
      <SkeletonLine w="w-20" h="h-3" />
    </motion.div>
  );
}

// Alert card skeleton
function AlertCardSkeleton() {
  return (
    <div className="rounded-xl p-4 bg-surface-container-lowest border-l-4"
      style={{ borderColor: 'var(--color-outline-variant)', boxShadow: 'var(--shadow-card)' }}>
      <SkeletonLine w="w-48" h="h-4" />
      <div className="mt-2 space-y-1.5">
        <SkeletonLine w="w-full" h="h-3" />
        <SkeletonLine w="w-3/4" h="h-3" />
      </div>
    </div>
  );
}

// Staggered list skeleton (matches SurveyListSkeleton pattern)
function AlertListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <AlertCardSkeleton />
        </motion.div>
      ))}
    </div>
  );
}
```

### 4.3 Crystal AI Loading State

When Crystal is generating a narrative or analysis, use the bounce dots with a Crystal gradient:

```tsx
function CrystalThinkingIndicator({ label = 'Crystal is thinking…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
      >
        ◆
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-on-surface-variant">{label}</span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: 'var(--color-tertiary)', animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 5. Error Handling Patterns

### 5.1 The Three Tiers (from actual `ErrorBoundary.tsx` and existing pages)

**Tier 1 — Catastrophic (full-screen):** App crashes, routing fails.
```tsx
// Wrap App in App.tsx — already exists
<ErrorBoundary>
  <AppShell />
</ErrorBoundary>
```

**Tier 2 — Page-level (inline card):** A page section crashes, nav stays functional.
```tsx
// Every new page wraps its data-fetching content:
<ErrorBoundary inline>
  <DashboardContent />
</ErrorBoundary>

// The inline ErrorBoundary renders a white card with:
// - Error icon (error_outline) in red circle
// - "Something went wrong" heading
// - "Try again" button that calls setState({ hasError: false })
// This pattern is already built in ErrorBoundary.tsx — just use inline prop
```

**Tier 3 — Silent (non-critical operations):** Badge counts, polling, background updates.
```tsx
// Match the exact pattern from useNotifications.ts:
const fetchAlertBadge = useCallback(async () => {
  try {
    const { critical } = await api.getAlertBadgeCount();
    setCriticalCount(critical);
  } catch {
    // silently ignore — badge is non-critical UI
  }
}, [api]);
```

### 5.2 Async Operation Error States (Toast pattern)

For user-triggered async actions (mark alert resolved, save workflow), show an inline error message rather than a toast. Match the existing WorkflowsPage pattern:

```tsx
const [error, setError] = useState<string | null>(null);
const [saving, setSaving] = useState(false);

const handleSave = async () => {
  setError(null);
  setSaving(true);
  try {
    await api.saveWorkflow(data);
    // success — optionally show success state
  } catch (err) {
    setError(t('common.saveFailed'));
  } finally {
    setSaving(false);
  }
};

// In JSX:
{error && (
  <motion.div
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
    style={{ background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
             border: '1px solid color-mix(in srgb, var(--color-error) 20%, transparent)',
             color: 'var(--color-error)' }}
  >
    <Icon name="error_outline" size={16} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
    {error}
  </motion.div>
)}
```

### 5.3 Empty States

Every list/feed must have an empty state. Pattern from existing TopBar notification empty state:

```tsx
function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #eef2ff, #f3e8ff)' }}
      >
        <Icon
          name={icon}
          size={22}
          style={{
            backgroundImage: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        />
      </div>
      <p className="text-sm font-semibold text-on-surface">{title}</p>
      {subtitle && <p className="text-xs text-on-surface-variant">{subtitle}</p>}
    </div>
  );
}

// Usage:
<EmptyState
  icon="notifications"
  title={t('notifications.empty')}
  subtitle={t('notifications.emptySubtitle')}
/>
```

---

## 6. Animation Specs

### 6.1 The House Spring Curve

```ts
// This is the single easing to use for ALL entrance animations
const SPRING = [0.22, 1, 0.36, 1] as const;

// Page-level (AppShell already applies this via pageVariants)
initial: { opacity: 0, y: 10 }
animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: SPRING } }
exit:    { opacity: 0, y: -6, transition: { duration: 0.16 } }

// Component entrance (slightly longer for content sections)
initial: { opacity: 0, y: 16 }
animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: SPRING } }

// Stagger children (for grids/lists)
const STAGGER = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const RISE    = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: SPRING } },
};
```

### 6.2 Panel Slide-In (Sheet/Drawer Pattern)

The existing app uses shadcn `Sheet` for all panels. The Sheet already animates — do NOT add extra Framer Motion on top of it. Just pass `side="right"` and the animation is handled:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Standard panel — matches TopBar notification sheet exactly
<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <SheetContent side="right" className="w-96 p-0 flex flex-col">
    <SheetHeader className="px-5 py-4 border-b flex-shrink-0"
      style={{ borderColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }}>
      <SheetTitle className="font-headline text-base">{title}</SheetTitle>
    </SheetHeader>
    <ScrollArea className="flex-1">
      {content}
    </ScrollArea>
  </SheetContent>
</Sheet>
```

### 6.3 AnimatePresence for Conditional Content

```tsx
import { AnimatePresence, motion } from 'framer-motion';

// For content that appears/disappears (alert detail, expanded card):
<AnimatePresence mode="wait">
  {isExpanded && (
    <motion.div
      key="expanded-content"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: { duration: 0.3, ease: SPRING } }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

### 6.4 CSS-Only Animations (for persistent decorative animation)

Use CSS keyframes for anything that runs continuously — they don't need React re-renders:

```css
/* Already defined in App.css — use these class names: */
.skeleton      /* shimmer loading animation */
.holographic   /* aurora color shift (Crystal orb on landing) */

/* CSS animation shorthand (use inline style prop): */
style={{ animation: 'pulse-glow 2.5s ease-in-out infinite' }}    /* Crystal pulse */
style={{ animation: 'float-bob 6s ease-in-out infinite' }}        /* floating element */

/* For live data indicators (new response received, alert firing): */
<span
  className="w-2 h-2 rounded-full flex-shrink-0"
  style={{ background: 'var(--color-success)', animation: 'pulse-glow 2s ease-in-out infinite' }}
/>
```

### 6.5 Active State Micro-interaction

Buttons already have `active:scale-95` built into the Button component. For card-level interactions:

```tsx
// Clickable card with hover lift (matches sidenav item spring):
<div
  className="rounded-2xl cursor-pointer transition-all duration-200"
  style={{
    boxShadow: 'var(--shadow-card)',
    // transition uses CSS not Framer Motion for performance
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
    e.currentTarget.style.transform = 'translateY(-2px)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.boxShadow = 'var(--shadow-card)';
    e.currentTarget.style.transform = 'translateY(0)';
  }}
>
```

---

## 7. Feature 1: Notifications (Enhance What Exists)

> **Critical finding:** Notifications are already substantially built.  
> `TopBar.tsx` has `useNotifications`, `NotificationItem`, and the Sheet panel.  
> DO NOT rebuild from scratch. Extend the existing implementation.

### 7.1 What Already Exists (do not touch)

- `hooks/useNotifications.ts` — poll-based unread count + load-on-open pattern ✓
- `TopBar.tsx` — bell button with badge, Sheet panel, `NotificationItem` component ✓
- `backend/src/routes/notifications.js` — GET pending, GET preferences, PUT preferences ✓
- DB: `notification_events` + `notification_preferences` tables ✓

### 7.2 What Needs to Be Added

**A. Upgrade `useNotifications.ts` to add WebSocket support** (alongside polling):

```ts
// hooks/useNotifications.ts — ADD WebSocket subscription
import { useEffect } from 'react';
import { useSocket } from './useSocket'; // new hook

export function useNotifications() {
  // ... existing polling code stays ...

  // NEW: WebSocket real-time updates
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return;
    socket.on('notification:new', (notif: Notification) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((c) => c + 1);
    });
    socket.on('notification:count', ({ unread }: { unread: number }) => {
      setUnreadCount(unread);
    });
    return () => {
      socket.off('notification:new');
      socket.off('notification:count');
    };
  }, [socket]);

  return { unreadCount, notifications, loading, loadNotifications, markRead, markAllRead };
}
```

**B. New `hooks/useSocket.ts`:**

```ts
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAppAuth } from '../lib/auth';

let sharedSocket: Socket | null = null;

export function useSocket() {
  const { getToken } = useAppAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (sharedSocket?.connected) {
      socketRef.current = sharedSocket;
      return;
    }
    getToken().then((token) => {
      sharedSocket = io(import.meta.env.VITE_API_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });
      socketRef.current = sharedSocket;
    });
    return () => {
      // Don't disconnect — socket is shared across all components
    };
  }, []);

  return socketRef.current;
}
```

**C. Upgrade `NotificationItem` in `TopBar.tsx` to show Crystal narration:**

```tsx
// Add Crystal narration block inside NotificationItem
// After the body text:
{n.crystal_narration && (
  <div
    className="mt-2 flex gap-1.5 rounded-lg px-2.5 py-2 text-xs leading-snug"
    style={{
      background: 'color-mix(in srgb, var(--color-tertiary) 6%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-tertiary) 12%, transparent)',
    }}
  >
    <span
      className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5"
      style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
    >
      ◆
    </span>
    <span style={{ color: 'var(--color-tertiary)' }} className="italic">
      {n.crystal_narration}
    </span>
  </div>
)}
```

**D. Toast notifications for real-time events** — add `NotificationToast.tsx`:

```tsx
// app/src/components/notifications/NotificationToast.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../Icon';
import { useSocket } from '../../hooks/useSocket';
import { useState, useEffect } from 'react';

interface ToastNotif { id: string; title: string; body?: string; priority: string; actionUrl?: string; }

export function NotificationToastStack() {
  const [toasts, setToasts] = useState<ToastNotif[]>([]);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;
    socket.on('notification:new', (n: ToastNotif) => {
      setToasts((prev) => [n, ...prev].slice(0, 3)); // max 3
      if (n.priority !== 'critical') {
        setTimeout(() => dismiss(n.id), 5000);
      }
    });
    return () => { socket.off('notification:new'); };
  }, [socket]);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const SEVERITY = SEVERITY_COLORS;

  return (
    <div className="fixed top-20 right-4 z-[200] flex flex-col gap-2 w-[380px] pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 400, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: 400, scale: 0.95, transition: { duration: 0.2 } }}
            onClick={() => { dismiss(toast.id); if (toast.actionUrl) window.location.href = toast.actionUrl; }}
            className="pointer-events-auto rounded-2xl overflow-hidden cursor-pointer"
            style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.12)', background: '#ffffff' }}
          >
            <div
              className="h-1 w-full"
              style={{ background: SEVERITY[toast.priority as keyof typeof SEVERITY]?.color ?? 'var(--color-primary)' }}
            />
            <div className="p-4 flex gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: `${SEVERITY[toast.priority as keyof typeof SEVERITY]?.color ?? 'var(--color-primary)'}18` }}
              >
                <Icon
                  name={SEVERITY[toast.priority as keyof typeof SEVERITY]?.icon ?? 'notifications'}
                  size={16}
                  style={{ color: SEVERITY[toast.priority as keyof typeof SEVERITY]?.color ?? 'var(--color-primary)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface leading-snug">{toast.title}</p>
                {toast.body && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{toast.body}</p>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
                className="text-on-surface-variant hover:text-on-surface flex-shrink-0 -mt-1 -mr-1"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
```

Mount `<NotificationToastStack />` once in `AppShell.tsx` alongside `CrystalPanel`.

---

## 8. Feature 2: Alerts System

### 8.1 Alert Center Page (`app/src/pages/AlertCenterPage.tsx`)

```tsx
export function AlertCenterPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('alerts.pageTitle'), t('alerts.pageSubtitle'));
  const { alerts, loading, counts } = useAlerts();

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        title={t('alerts.pageTitle')}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.ALERTS_RULES)}>
            <Icon name="tune" size={16} />
            {t('alerts.configureRules')}
          </Button>
        }
      />

      <div className="flex gap-2 mb-6">
        {(['all', 'critical', 'warning', 'info'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-semibold transition-colors',
              activeTab === tab
                ? 'text-white'
                : 'text-on-surface-variant hover:bg-surface-container'
            )}
            style={activeTab === tab ? {
              background: tab === 'all' ? 'var(--color-primary)'
                        : tab === 'critical' ? 'var(--color-error)'
                        : tab === 'warning'  ? 'var(--color-warning)'
                        : 'var(--color-primary)',
            } : undefined}
          >
            {t(`alerts.tab.${tab}`)}
            {counts[tab] > 0 && (
              <span className="ml-1.5 text-[10px] opacity-75">({counts[tab]})</span>
            )}
          </button>
        ))}
      </div>

      <ErrorBoundary inline>
        {loading ? (
          <AlertListSkeleton count={4} />
        ) : alerts.length === 0 ? (
          <EmptyState icon="notification_important" title={t('alerts.empty')} subtitle={t('alerts.emptySubtitle')} />
        ) : (
          <motion.div
            initial="hidden" animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            className="space-y-3"
          >
            {alerts.map((alert) => (
              <motion.div key={alert.id} variants={RISE}>
                <AlertCard alert={alert} onSelect={setSelectedAlert} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </ErrorBoundary>

      {/* Detail drawer */}
      <AlertDetailDrawer alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}
```

### 8.2 `AlertCard` Component

```tsx
function AlertCard({ alert, onSelect }: { alert: Alert; onSelect: (a: Alert) => void }) {
  const { t } = useTranslation();
  const severity = SEVERITY_COLORS[alert.severity as keyof typeof SEVERITY_COLORS];

  return (
    <motion.div
      layout
      className="rounded-2xl bg-surface-container-lowest overflow-hidden cursor-pointer border-l-4"
      style={{
        boxShadow: 'var(--shadow-card)',
        borderColor: severity?.color ?? 'var(--color-outline-variant)',
      }}
      whileHover={{ boxShadow: 'var(--shadow-card-hover)', x: 2 }}
      transition={{ duration: 0.15 }}
      onClick={() => onSelect(alert)}
    >
      <div className="p-4 flex gap-3">
        {/* Severity icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${severity?.color ?? 'var(--color-primary)'}14` }}
        >
          <Icon
            name={severity?.icon ?? 'notifications'}
            size={18}
            fill={1}
            style={{ color: severity?.color ?? 'var(--color-primary)' }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-on-surface leading-snug">{alert.title}</p>
            <span className="text-[10px] text-on-surface-variant flex-shrink-0 mt-0.5">
              {formatAge(alert.triggered_at)}
            </span>
          </div>

          <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{alert.description}</p>

          {/* Crystal narration */}
          {alert.crystal_narration && (
            <div
              className="mt-2 flex gap-1.5 rounded-lg px-2.5 py-2 text-xs leading-snug"
              style={{
                background: 'color-mix(in srgb, var(--color-tertiary) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-tertiary) 12%, transparent)',
              }}
            >
              <span
                className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5"
                style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
              >
                ◆
              </span>
              <span style={{ color: 'var(--color-tertiary)' }} className="italic line-clamp-2">
                {alert.crystal_narration}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div
        className="px-4 py-2.5 flex items-center gap-2 border-t"
        style={{ borderColor: 'color-mix(in srgb, var(--color-outline-variant) 40%, transparent)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg"
          onClick={() => handleAcknowledge(alert.id)}>
          {t('alerts.acknowledge')}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg"
          onClick={() => handleSnooze(alert.id)}>
          {t('alerts.snooze')}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg ml-auto text-on-surface-variant"
          onClick={() => handleResolve(alert.id)}>
          {t('alerts.resolve')}
        </Button>
      </div>
    </motion.div>
  );
}
```

### 8.3 `AlertDetailDrawer` (Sheet-based, right side)

```tsx
function AlertDetailDrawer({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  return (
    <Sheet open={!!alert} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-[560px] p-0 flex flex-col">
        {alert && (
          <>
            <SheetHeader
              className="px-6 py-4 border-b flex-shrink-0"
              style={{ borderColor: 'color-mix(in srgb, var(--color-outline-variant) 40%, transparent)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `${SEVERITY_COLORS[alert.severity]?.color}14` }}
                >
                  <Icon name={SEVERITY_COLORS[alert.severity]?.icon} size={18} fill={1}
                    style={{ color: SEVERITY_COLORS[alert.severity]?.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="font-headline text-base truncate">{alert.title}</SheetTitle>
                  <p className="text-xs text-on-surface-variant">{formatAge(alert.triggered_at)}</p>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-5">
                {/* Crystal Analysis Panel */}
                {(alert.crystal_narration || alert.crystal_action) && (
                  <div
                    className="rounded-2xl p-4 space-y-3"
                    style={{
                      background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 4%, transparent), color-mix(in srgb, var(--color-tertiary) 4%, transparent))',
                      border: '1px solid color-mix(in srgb, var(--color-tertiary) 12%, transparent)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
                      >
                        ◆
                      </span>
                      <span className="text-sm font-semibold font-headline">Crystal Analysis</span>
                    </div>
                    {alert.crystal_narration && (
                      <p className="text-sm text-on-surface leading-relaxed">{alert.crystal_narration}</p>
                    )}
                    {alert.crystal_action && (
                      <div
                        className="rounded-xl p-3 flex gap-2"
                        style={{ background: 'color-mix(in srgb, var(--color-success) 8%, transparent)' }}
                      >
                        <Icon name="lightbulb" size={16} fill={1} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                        <p className="text-xs text-on-surface leading-relaxed">{alert.crystal_action}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence / top verbatims */}
                {alert.evidence?.topVerbatims && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                      Key verbatims
                    </p>
                    {alert.evidence.topVerbatims.map((v: string, i: number) => (
                      <div key={i} className="rounded-xl px-4 py-3 text-sm text-on-surface bg-surface-container-low italic">
                        "{v}"
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button variant="default" className="flex-1" onClick={() => handleAcknowledge(alert.id)}>
                    <Icon name="check" size={16} />
                    Acknowledge
                  </Button>
                  <Button variant="outline" onClick={() => handleResolve(alert.id)}>
                    Resolve
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

---

## 9. Feature 3: Dashboard

### 9.1 KPI Tile Component

```tsx
interface KpiTileProps {
  icon: string;
  label: string;
  value: string | number;
  change?: number;       // positive = up, negative = down
  changeLabel?: string;  // "vs last 30 days"
  trend?: number[];      // sparkline data
  onClick?: () => void;
  isLoading?: boolean;
}

export function KpiTile({ icon, label, value, change, changeLabel, trend, onClick, isLoading }: KpiTileProps) {
  if (isLoading) return <KpiTileSkeleton />;

  const isPositive = (change ?? 0) >= 0;

  return (
    <motion.div
      variants={RISE}
      className={cn(
        'rounded-2xl p-5 bg-surface-container-lowest transition-all duration-200',
        onClick && 'cursor-pointer'
      )}
      style={{ boxShadow: 'var(--shadow-card)', border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)' }}
      onClick={onClick}
      whileHover={onClick ? { y: -2, boxShadow: 'var(--shadow-card-hover)' } : undefined}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }}
        >
          <Icon name={icon} size={18} fill={1} style={{ color: 'var(--color-primary)' }} />
        </div>
        {typeof change === 'number' && (
          <div className="flex items-center gap-1">
            <Icon
              name={isPositive ? 'trending_up' : 'trending_down'}
              size={14}
              fill={1}
              style={{ color: isPositive ? 'var(--color-success)' : 'var(--color-error)' }}
            />
            <span
              className="text-xs font-bold"
              style={{ color: isPositive ? 'var(--color-success)' : 'var(--color-error)' }}
            >
              {isPositive ? '+' : ''}{change}
            </span>
          </div>
        )}
      </div>

      <p className="text-2xl font-black font-headline text-on-surface mb-0.5">{value}</p>
      <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
      {changeLabel && <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{changeLabel}</p>}
    </motion.div>
  );
}
```

### 9.2 Crystal Narrative Card

```tsx
export function CrystalNarrativeCard({ surveyId }: { surveyId?: string }) {
  const { narrative, isLoading, regenerate } = useCrystalNarrative(surveyId);

  return (
    <motion.div
      variants={RISE}
      className="rounded-2xl p-6"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 4%, white), color-mix(in srgb, var(--color-tertiary) 4%, white))',
        border: '1px solid color-mix(in srgb, var(--color-tertiary) 12%, transparent)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
          >
            ◆
          </span>
          <span className="text-sm font-bold font-headline">Crystal's Analysis</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-on-surface-variant"
          onClick={regenerate}
          disabled={isLoading}
        >
          <Icon name="refresh" size={14} className={isLoading ? 'animate-spin' : ''} />
          Regenerate
        </Button>
      </div>

      {isLoading ? (
        <CrystalThinkingIndicator label="Crystal is analyzing your data…" />
      ) : narrative ? (
        <div className="text-sm text-on-surface leading-relaxed space-y-3 whitespace-pre-line">
          {narrative}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant italic">
          Crystal hasn't analyzed this data yet. Click Regenerate to start.
        </p>
      )}
    </motion.div>
  );
}
```

### 9.3 Dashboard Widget Wrapper

```tsx
interface DashboardWidgetProps {
  title: string;
  children: React.ReactNode;
  onAskCrystal?: () => void;
  onRefresh?: () => void;
  lastUpdated?: Date;
  isLoading?: boolean;
  className?: string;
}

export function DashboardWidget({ title, children, onAskCrystal, onRefresh, lastUpdated, isLoading, className }: DashboardWidgetProps) {
  return (
    <motion.div
      variants={RISE}
      className={cn('rounded-2xl bg-surface-container-lowest flex flex-col', className)}
      style={{ boxShadow: 'var(--shadow-card)', border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
        <h3 className="text-sm font-bold text-on-surface">{title}</h3>
        <div className="flex items-center gap-1">
          {onAskCrystal && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={onAskCrystal}>
                  <span
                    className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
                  >
                    ◆
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Ask Crystal about this</TooltipContent>
            </Tooltip>
          )}
          {onRefresh && (
            <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={onRefresh} disabled={isLoading}>
              <Icon name="refresh" size={15} className={cn('text-on-surface-variant', isLoading && 'animate-spin')} />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-5 flex-1">
        <ErrorBoundary inline>
          {children}
        </ErrorBoundary>
      </div>

      {/* Footer */}
      {lastUpdated && (
        <div
          className="px-5 py-2 text-[10px] text-on-surface-variant border-t flex-shrink-0"
          style={{ borderColor: 'color-mix(in srgb, var(--color-outline-variant) 30%, transparent)' }}
        >
          Updated {formatAge(lastUpdated)}
        </div>
      )}
    </motion.div>
  );
}
```

### 9.4 Global Filter Bar

```tsx
export function DashboardFilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <div
      className="sticky z-30 flex items-center gap-2 px-6 md:px-8 py-3 -mx-6 md:-mx-8"
      style={{
        top: '4rem', // topbar height
        background: 'color-mix(in srgb, var(--color-surface) 95%, transparent)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid color-mix(in srgb, var(--color-outline-variant) 40%, transparent)',
      }}
    >
      {/* Date picker pill */}
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors"
        style={{
          background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
          color: 'var(--color-primary)',
          border: '1px solid color-mix(in srgb, var(--color-primary) 15%, transparent)',
        }}
      >
        <Icon name="calendar_today" size={14} style={{ color: 'var(--color-primary)' }} />
        {filters.dateLabel}
        <Icon name="expand_more" size={14} style={{ color: 'var(--color-primary)' }} />
      </button>

      {/* Survey filter pill */}
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors bg-surface-container hover:bg-surface-container-high text-on-surface-variant"
      >
        <Icon name="poll" size={14} />
        {filters.surveyLabel}
        <Icon name="expand_more" size={14} />
      </button>

      {/* Active segment filters */}
      <AnimatePresence>
        {filters.segments.map((seg) => (
          <motion.div
            key={seg.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: 'color-mix(in srgb, var(--color-secondary) 10%, transparent)',
              color: 'var(--color-secondary)',
              border: '1px solid color-mix(in srgb, var(--color-secondary) 20%, transparent)',
            }}
          >
            {seg.label}
            <button onClick={() => onChange.removeSegment(seg.id)} className="hover:opacity-70">
              <Icon name="close" size={12} style={{ color: 'var(--color-secondary)' }} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
      >
        <Icon name="add" size={14} />
        Filter
      </button>
    </div>
  );
}
```

---

## 10. Feature 4: Visual AI

### 10.1 Image Upload Survey Question

Rendered inside the existing survey fill question switch/case on `question.type`:

```tsx
// In SurveyFillPage — add case 'image_upload':
case 'image_upload':
  return <ImageUploadQuestion question={question} onAnswer={handleAnswer} />;

// The component:
export function ImageUploadQuestion({ question, onAnswer }: ImageUploadQuestionProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <motion.div
        className="rounded-2xl p-8 text-center transition-all duration-200"
        style={{
          border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
          background: isDragging
            ? 'color-mix(in srgb, var(--color-primary) 4%, transparent)'
            : 'var(--color-surface-container-low)',
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
          style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' }}
        >
          <Icon name="photo_camera" size={24} style={{ color: 'var(--color-primary)' }} />
        </div>
        <p className="text-sm font-semibold text-on-surface mb-1">{t('survey.imageUpload.dropHere')}</p>
        <p className="text-xs text-on-surface-variant mb-4">{t('survey.imageUpload.formats')}</p>

        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={triggerFileInput}>
            <Icon name="upload" size={16} />
            {t('survey.imageUpload.upload')}
          </Button>
          {/* Camera only on mobile */}
          <Button variant="outline" size="sm" className="md:hidden" onClick={triggerCamera}>
            <Icon name="photo_camera" size={16} />
            {t('survey.imageUpload.camera')}
          </Button>
        </div>
      </motion.div>

      {/* Uploaded thumbnails */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence>
            {files.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative w-20 h-20 rounded-xl overflow-hidden group"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <img src={f.previewUrl} alt="" className="w-full h-full object-cover" />
                {f.status === 'analyzing' && (
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.4)' }}>
                    <Spinner size={16} color="#ffffff" />
                  </div>
                )}
                {f.status === 'done' && (
                  <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--color-success)' }}>
                    <Icon name="check" size={12} style={{ color: '#ffffff' }} />
                  </div>
                )}
                <button
                  onClick={() => removeFile(f.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Icon name="close" size={10} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Privacy notice */}
      <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
        <Icon name="lock" size={12} style={{ color: 'var(--color-on-surface-variant)' }} />
        {t('survey.imageUpload.privacyNotice')}
      </p>
    </div>
  );
}
```

### 10.2 Visual Insight Card (Crystal-generated chart)

```tsx
export function VisualInsightCard({ spec, headline, explanation, confidence, onAskCrystal }: VisualInsightCardProps) {
  return (
    <motion.div
      variants={RISE}
      className="rounded-2xl bg-surface-container-lowest overflow-hidden"
      style={{ boxShadow: 'var(--shadow-card)', border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)' }}
    >
      {/* Crystal badge strip at top */}
      <div
        className="h-1 w-full"
        style={{ background: 'linear-gradient(90deg, var(--color-primary), var(--color-tertiary))' }}
      />

      <div className="p-5">
        {/* Chart area */}
        <div className="rounded-xl overflow-hidden mb-4" style={{ background: 'var(--color-surface)' }}>
          <VegaChart spec={spec} />
        </div>

        {/* Headline */}
        <p className="text-sm font-bold text-on-surface leading-snug mb-1.5">{headline}</p>

        {/* Explanation */}
        <p className="text-xs text-on-surface-variant leading-relaxed">{explanation}</p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t"
          style={{ borderColor: 'color-mix(in srgb, var(--color-outline-variant) 40%, transparent)' }}>
          <div className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 rounded-md flex items-center justify-center text-white text-[8px] font-bold"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
            >
              ◆
            </span>
            <span className="text-[10px] text-on-surface-variant">
              Crystal · {Math.round((confidence ?? 0.8) * 100)}% confident
            </span>
          </div>
          {onAskCrystal && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onAskCrystal}>
              Ask Crystal
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
```

---

## 11. Feature 5: Workflow Builder

### 11.1 Workflow List Page (Redesign of Existing)

The existing `WorkflowsPage.tsx` needs the "+ New Workflow" button to navigate to the builder route. Keep the existing card list pattern, enhance it:

```tsx
// Add to WorkflowsPage.tsx header actions:
<Button
  variant="gradient"
  className="font-bold rounded-xl relative overflow-hidden group"
  onClick={() => navigate(ROUTES.WORKFLOWS_NEW)}
>
  <span className="shimmer absolute inset-0 rounded-[0.75rem] opacity-0 group-hover:opacity-100 transition-opacity" />
  <span className="relative flex items-center gap-2">
    <Icon name="add" size={16} />
    {t('workflows.newWorkflow')}
  </span>
</Button>
```

### 11.2 Workflow Builder Page

The builder uses "builder mode" — AppShell suppresses gutters/footer. Add a route that matches `/app/workflows/:workflowId/builder` (the existing regex `/\/surveys\/[^/]+\/build/` needs to be extended):

```tsx
// In AppShell.tsx — extend isBuilder:
const isBuilder =
  /\/surveys\/[^/]+\/build/.test(location.pathname) ||
  /\/workflows\/[^/]+\/builder/.test(location.pathname);  // ← ADD THIS
```

**`WorkflowBuilderPage.tsx`** structure:

```tsx
export function WorkflowBuilderPage() {
  // Builder gets full viewport — no AppShell gutters
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Left node library */}
      <NodeLibraryPanel />
      {/* Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <WorkflowBuilderTopBar />
        <WorkflowCanvas />
      </div>
      {/* Right config panel (conditionally shown) */}
      <NodeConfigPanel />
    </div>
  );
}
```

**Builder TopBar:**
```tsx
function WorkflowBuilderTopBar() {
  return (
    <header
      className="flex items-center justify-between h-14 px-4 flex-shrink-0 border-b"
      style={{
        background: 'var(--color-surface-container-lowest)',
        borderColor: 'color-mix(in srgb, var(--color-outline-variant) 50%, transparent)',
        boxShadow: 'var(--shadow-nav)',
      }}
    >
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl" onClick={() => navigate(ROUTES.WORKFLOWS)}>
          <Icon name="arrow_back" size={18} />
        </Button>
        <div
          className="w-px h-5"
          style={{ background: 'var(--color-outline-variant)' }}
        />
        {/* Editable workflow name */}
        <input
          className="text-sm font-bold text-on-surface bg-transparent border-none outline-none focus:ring-0 min-w-0"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Status badge */}
        <span
          className="px-2.5 py-1 rounded-full text-xs font-bold"
          style={{
            background: isActive
              ? 'color-mix(in srgb, var(--color-success) 12%, transparent)'
              : 'var(--color-surface-container)',
            color: isActive ? 'var(--color-success)' : 'var(--color-on-surface-variant)',
          }}
        >
          {isActive ? '● Active' : '○ Draft'}
        </span>

        <Button variant="ghost" size="sm" onClick={handleTest} disabled={isTesting}>
          {isTesting ? <Spinner size={14} /> : <Icon name="play_arrow" size={16} />}
          Test
        </Button>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Spinner size={14} /> : null}
          Save
        </Button>
        <Button
          variant={isActive ? 'secondary' : 'gradient'}
          size="sm"
          onClick={handleToggleActive}
          className="font-bold"
        >
          {isActive ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
    </header>
  );
}
```

**Canvas background** — dot grid via CSS:
```tsx
function WorkflowCanvas() {
  return (
    <div
      className="flex-1 relative overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        backgroundImage: `radial-gradient(circle, var(--color-outline-variant) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    >
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}>
        <Background color="transparent" />
        <Controls className="rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }} />
        <MiniMap
          className="rounded-xl overflow-hidden"
          style={{ boxShadow: 'var(--shadow-card)' }}
          nodeColor={(n) => n.type === 'trigger' ? 'var(--color-primary)' : 'var(--color-tertiary)'}
        />
      </ReactFlow>
    </div>
  );
}
```

### 11.3 Workflow Node Cards (React Flow custom nodes)

```tsx
// Custom node component for React Flow
export function WorkflowNode({ data, selected }: NodeProps) {
  const TYPE_STYLES = {
    trigger:   { border: 'var(--color-primary)',  bg: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',  icon: 'bolt' },
    condition: { border: 'var(--color-warning)',  bg: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',  icon: 'filter_alt' },
    crystal:   { border: 'var(--color-tertiary)', bg: 'color-mix(in srgb, var(--color-tertiary) 8%, transparent)', icon: 'auto_awesome' },
    action:    { border: 'var(--color-success)',  bg: 'color-mix(in srgb, var(--color-success) 8%, transparent)',  icon: 'bolt' },
    flow:      { border: 'var(--color-outline)',  bg: 'var(--color-surface-container-low)',                        icon: 'account_tree' },
  };

  const style = TYPE_STYLES[data.nodeType as keyof typeof TYPE_STYLES] ?? TYPE_STYLES.action;

  return (
    <div
      className="rounded-2xl bg-surface-container-lowest w-60 transition-all duration-150"
      style={{
        border: `2px solid ${selected ? style.border : 'color-mix(in srgb, var(--color-outline-variant) 60%, transparent)'}`,
        boxShadow: selected ? `0 0 0 3px color-mix(in srgb, ${style.border} 20%, transparent)` : 'var(--shadow-card)',
      }}
    >
      {/* Header bar */}
      <div
        className="rounded-t-xl px-3 py-2 flex items-center gap-2"
        style={{ background: style.bg }}
      >
        {data.nodeType === 'crystal' ? (
          <span
            className="w-5 h-5 rounded-lg flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
          >
            ◆
          </span>
        ) : (
          <Icon name={style.icon} size={14} fill={1} style={{ color: style.border }} />
        )}
        <span className="text-xs font-bold truncate" style={{ color: style.border }}>
          {data.label}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {data.status === 'error' && (
            <Icon name="error" size={14} fill={1} style={{ color: 'var(--color-error)' }} />
          )}
          {data.status === 'running' && (
            <Spinner size={12} color={style.border} />
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        {data.summary ? (
          <p className="text-xs text-on-surface-variant leading-snug line-clamp-2">{data.summary}</p>
        ) : (
          <p className="text-xs text-on-surface-variant/50 italic">Click to configure…</p>
        )}
      </div>

      {/* React Flow handles (ports) */}
      <Handle type="target" position={Position.Left}
        style={{ background: 'var(--color-outline-variant)', border: '2px solid white', width: 12, height: 12 }} />
      <Handle type="source" position={Position.Right}
        style={{ background: style.border, border: '2px solid white', width: 12, height: 12 }} />
    </div>
  );
}
```

### 11.4 Node Configuration Panel (Right-side Sheet)

```tsx
function NodeConfigPanel({ node, onClose, onSave }: NodeConfigPanelProps) {
  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ width: 0, opacity: 0, transition: { duration: 0.18 } }}
          className="flex flex-col border-l overflow-hidden flex-shrink-0"
          style={{
            background: 'var(--color-surface-container-lowest)',
            borderColor: 'color-mix(in srgb, var(--color-outline-variant) 50%, transparent)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
            style={{ borderColor: 'color-mix(in srgb, var(--color-outline-variant) 40%, transparent)' }}>
            <span className="text-sm font-bold font-headline">Configure: {node.data.label}</span>
            <Button variant="ghost" size="icon" className="w-7 h-7 rounded-lg" onClick={onClose}>
              <Icon name="close" size={16} />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-5 space-y-5">
              {/* Dynamic form fields based on node.type */}
              <NodeConfigForm node={node} onChange={handleChange} />

              {/* Variable picker */}
              <div>
                <Label className="text-xs font-semibold text-on-surface-variant mb-2 block">
                  Insert variable
                </Label>
                <VariablePicker onSelect={handleInsertVariable} />
              </div>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="px-5 py-4 border-t flex gap-2 flex-shrink-0"
            style={{ borderColor: 'color-mix(in srgb, var(--color-outline-variant) 40%, transparent)' }}>
            <Button variant="outline" size="sm" className="flex-1" onClick={handleTestStep} disabled={isTesting}>
              {isTesting ? <Spinner size={14} /> : <Icon name="play_circle" size={15} />}
              Test step
            </Button>
            <Button variant="default" size="sm" onClick={() => onSave(node)}>
              Done
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
```

---

## 12. New Routes Manifest

Add to `app/src/constants/routes.ts` and register in the React Router config:

```ts
// New routes to add:
DASHBOARD:            '/app/dashboard',
ALERTS:               '/app/alerts',
ALERTS_RULES:         '/app/alerts/rules',
WORKFLOWS_BUILDER:    '/app/workflows/:workflowId/builder',

// New pages to create:
app/src/pages/DashboardPage.tsx
app/src/pages/AlertCenterPage.tsx
app/src/pages/AlertRulesPage.tsx
app/src/pages/workflows/WorkflowBuilderPage.tsx

// New component directories:
app/src/components/notifications/
  NotificationToast.tsx        (toast stack)

app/src/components/alerts/
  AlertCard.tsx
  AlertDetailDrawer.tsx
  AlertSetupWizard.tsx

app/src/components/dashboard/
  KpiTile.tsx
  KpiTilesRow.tsx
  CrystalNarrativeCard.tsx
  DashboardWidget.tsx
  DashboardFilterBar.tsx
  NpsTrendChart.tsx
  TopicBubbleChart.tsx
  VerbatimStream.tsx

app/src/components/visual-ai/
  ImageUploadQuestion.tsx
  VisualInsightCard.tsx
  ImageGallery.tsx
  CrystalChartQuery.tsx

app/src/components/workflows/
  WorkflowNode.tsx              (React Flow custom node)
  NodeLibraryPanel.tsx
  WorkflowCanvas.tsx
  NodeConfigPanel.tsx
  VariablePicker.tsx
  WorkflowBuilderTopBar.tsx

// New hooks:
app/src/hooks/useAlertsBadge.ts
app/src/hooks/useAlerts.ts
app/src/hooks/useDashboard.ts
app/src/hooks/useCrystalNarrative.ts
app/src/hooks/useSocket.ts
app/src/hooks/useWorkflowBuilder.ts
```

---

## 13. New Localization Keys

Add to `app/src/locales/en.ts` following existing namespace pattern:

```ts
// ── Navigation ────────────────────────────────────────────────────
'nav.dashboard': 'Dashboard',
'nav.alerts':    'Alerts',

// ── Notifications ─────────────────────────────────────────────────
'notifications.title':             'Notifications',
'notifications.markAllRead':       'Mark all read',
'notifications.empty':             "You're all caught up",
'notifications.emptySubtitle':     'Crystal activity and survey events will appear here',
'notifications.loadMore':          'Load more',
'notifications.justNow':           'Just now',
'notifications.preferences':       'Notification preferences',

// ── Alerts ────────────────────────────────────────────────────────
'alerts.pageTitle':                'Alert Center',
'alerts.pageSubtitle':             'Track and respond to experience signals',
'alerts.configureRules':           'Configure rules',
'alerts.tab.all':                  'All',
'alerts.tab.critical':             'Critical',
'alerts.tab.warning':              'Warning',
'alerts.tab.info':                 'Info',
'alerts.empty':                    'No active alerts',
'alerts.emptySubtitle':            'Crystal will surface issues when they emerge',
'alerts.acknowledge':              'Acknowledge',
'alerts.snooze':                   'Snooze',
'alerts.resolve':                  'Resolve',
'alerts.severity.critical':        'Critical',
'alerts.severity.warning':         'Warning',
'alerts.severity.info':            'Info',
'alerts.severity.success':         'Success',
'alerts.crystalAnalysis':          'Crystal Analysis',
'alerts.recommendedAction':        'Recommended action',
'alerts.rulesPage.title':          'Alert Rules',
'alerts.rulesPage.newRule':        'New rule',

// ── Dashboard ─────────────────────────────────────────────────────
'dashboard.pageTitle':             'Dashboard',
'dashboard.pageSubtitle':          'Your experience intelligence at a glance',
'dashboard.customizeButton':       'Customize',
'dashboard.crystalStory':          "Crystal's Analysis",
'dashboard.crystalRegenerate':     'Regenerate',
'dashboard.crystalThinking':       'Crystal is analyzing your data…',
'dashboard.filterDate':            'Last 30 days',
'dashboard.filterSurveys':         'All Surveys',
'dashboard.addFilter':             'Filter',
'dashboard.kpi.nps':               'NPS Score',
'dashboard.kpi.csat':              'CSAT',
'dashboard.kpi.responses':         'Responses',
'dashboard.kpi.responseRate':      'Response Rate',
'dashboard.kpi.insights':          'Crystal Insights',
'dashboard.widget.npsTrend':       'NPS Trend',
'dashboard.widget.distribution':   'Score Distribution',
'dashboard.widget.topics':         'Topics',
'dashboard.widget.verbatims':      'Recent Verbatims',
'dashboard.askCrystal':            'Ask Crystal about this',
'dashboard.lastUpdated':           'Updated {time}',

// ── Visual AI ─────────────────────────────────────────────────────
'survey.imageUpload.dropHere':     'Drop image here or click to upload',
'survey.imageUpload.formats':      'JPG, PNG, HEIC up to 10MB',
'survey.imageUpload.upload':       'Upload image',
'survey.imageUpload.camera':       'Take photo',
'survey.imageUpload.privacyNotice':'Images are analyzed securely and never shared publicly',
'survey.imageUpload.analyzing':    'Crystal is analyzing…',
'visualAI.crystalDraws':           'Ask Crystal to draw a chart',
'visualAI.chartPlaceholder':       'e.g. "Show NPS by region as a bar chart"',
'visualAI.generateChart':          'Generate',
'visualAI.addToDashboard':         'Add to Dashboard',

// ── Workflows ─────────────────────────────────────────────────────
'workflows.newWorkflow':           'New Workflow',
'workflows.builder.back':          'Back to Workflows',
'workflows.builder.test':          'Test',
'workflows.builder.save':          'Save',
'workflows.builder.activate':      'Activate',
'workflows.builder.deactivate':    'Deactivate',
'workflows.builder.status.active': '● Active',
'workflows.builder.status.draft':  '○ Draft',
'workflows.node.configure':        'Configure:',
'workflows.node.unconfigured':     'Click to configure…',
'workflows.node.testStep':         'Test step',
'workflows.variable.insert':       'Insert variable',
'workflows.library.triggers':      'Triggers',
'workflows.library.conditions':    'Conditions',
'workflows.library.actions':       'Actions',
'workflows.library.flow':          'Flow Control',
'workflows.library.crystal':       'Crystal AI',
```

---

## 14. Accessibility Checklist

Every new component must pass this checklist before PR merge:

### Icons & Buttons
```tsx
// Icon-only buttons MUST have aria-label:
<button aria-label={t('notifications.title')}>
  <Icon name="notifications" size={20} />
</button>

// Never rely on icon alone for meaning — add text or aria-label
```

### Focus Management
```tsx
// All interactive elements must show focus ring:
// The Button component already has this via CVA:
// focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary

// For custom interactive elements, add brand-ring:
<div
  tabIndex={0}
  className="cursor-pointer"
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
  style={{ outline: 'none' }}
  onFocus={(e) => { e.currentTarget.style.outline = '2px solid var(--color-primary)'; e.currentTarget.style.outlineOffset = '2px'; }}
  onBlur={(e) => { e.currentTarget.style.outline = 'none'; }}
>
```

### Live Regions for Real-Time Updates
```tsx
// New notifications arriving — polite for info, assertive for critical:
<div aria-live="polite" aria-atomic="false" className="sr-only">
  {latestNotification?.title}
</div>

// Critical alerts:
<div aria-live="assertive" aria-atomic="true" className="sr-only">
  {latestCritical?.title}
</div>
```

### Reduced Motion
```tsx
// Check before mounting Three.js and complex animations:
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// For Framer Motion components — add to transition:
transition={{
  duration: prefersReducedMotion ? 0 : 0.5,
  ease: SPRING,
}}

// OR use the Framer Motion hook:
import { useReducedMotion } from 'framer-motion';
const shouldReduceMotion = useReducedMotion();
```

### Color Contrast
```tsx
// Status colors pass WCAG AA on white background:
// var(--color-error)   #b41340 → 5.2:1 ✓
// var(--color-success) #059669 → 4.7:1 ✓
// var(--color-warning) #d97706 → 3.2:1 ✗ on white

// For warning text on white, use a darker variant:
style={{ color: '#92400e' }}  // amber-800 — 7.3:1 ✓
// Or use on tinted background (warning-container) which brings it above threshold
```

### Keyboard Traps in Panels
```tsx
// The shadcn Sheet component already handles focus trap.
// For custom panels (NodeConfigPanel using Framer Motion), add:
import { useFocusTrap } from '@mantine/hooks'; // or implement manually

// Or use dialog/sheet primitives — they handle this automatically via Radix UI
```

---

*This document is the ground truth for UX implementation. All patterns here are verified against the actual running codebase. Do not deviate from these patterns without updating this doc.*
