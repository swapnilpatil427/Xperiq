# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
# Dev server (port 5173) — requires Node 20+
nvm use 20 && npm run dev

# Run all tests
npm test

# Run a single test file
npx vitest run src/__tests__/components/insights/SurveyStatusBanner.test.tsx

# Run tests matching a name pattern
npx vitest run --reporter=verbose -t "renders amber"

# Watch mode
npm run test:watch

# Type-check (no emit — CI validation)
npx tsc --noEmit

# Lint
npm run lint

# Build (runs tests first, then Vite build)
npm run build

# Build without tests
npm run build:app
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 8 + TypeScript (strict) |
| Styling | Tailwind v4 (no `tailwind.config.js`) + CSS custom properties |
| Routing | React Router v7 |
| Auth | Clerk (`@clerk/react`) — abstracted behind `useAppAuth()` |
| Animation | Framer Motion (page transitions, component entrances) |
| UI Primitives | shadcn/UI (`src/components/ui/`) built on Radix UI |
| Icons | Material Symbols Outlined via `<Icon name="..." />` |
| 3D | `@react-three/fiber` + `@react-three/drei` (lazy-loaded, Spatial view only) |
| Charts | Recharts |
| HTTP | Axios via `createApiClient()` in `src/lib/api.ts` |
| Testing | Vitest + React Testing Library + jsdom |

---

## Brand Theme System

### How It Works — Three-Layer Cascade

The brand system has three layers that serve different purposes:

```
Layer 1:  --brand-primary           (theme.css :root)
            ↓ referenced by
Layer 2:  --color-primary            (theme.css :root — semantic alias)
            ↓ two consumers:
Layer 3a: Tailwind @theme            (index.css — build-time copy, STATIC)
Layer 3b: var(--color-primary)       (live CSS — responds to runtime changes)
```

**The critical rule**: Any CSS that must change when a user customises their brand (buttons, borders, focus rings, gradients) must use `var(--color-primary)` or `style={{ color: 'var(--color-primary)' }}`. Tailwind utilities like `bg-primary` are baked at build time and will NOT update at runtime.

```tsx
// ✅ Correct — responds to brand changes
<div style={{ background: 'var(--color-primary)' }}>

// ❌ Wrong — static, ignores runtime brand
<div className="bg-primary">

// ✅ Both — Tailwind for initial render, CSS var for overrides
<div className="bg-primary" style={{ background: 'var(--color-primary)' }}>
```

### Runtime Brand Overriding

`applyBrandTheme()` in `src/lib/brandTheme.ts` sets `--brand-*` properties on `:root`, which automatically cascades through the `--color-*` aliases to every consuming CSS rule:

```ts
import { applyBrandTheme, saveBrandTheme, loadBrandTheme, injectFonts } from '../lib/brandTheme';

// Apply without persisting (preview mode)
applyBrandTheme({ primary: '#e63946', accent: '#457b9d' });

// Apply + save to localStorage (user saves brand settings)
applyBrandTheme(theme);
saveBrandTheme(theme);

// On app startup (called before createRoot in main.tsx)
loadBrandTheme();

// Dynamically load Google Fonts for custom brand typography
injectFonts('"DM Sans", sans-serif', '"Outfit", sans-serif');
```

### Brandable Tokens

| Token | Default | Controls |
|---|---|---|
| `--brand-primary` | `#2a4bd9` | Primary buttons, links, active nav |
| `--brand-primary-dim` | `#173dcd` | Hover states |
| `--brand-primary-container` | `#879aff` | Tinted backgrounds, chips |
| `--brand-secondary` | `#00647c` | Secondary actions, teal accents |
| `--brand-accent` | `#8329c8` | Purple accent, tertiary elements |
| `--brand-font-heading` | `"Manrope"` | All `font-headline` elements |
| `--brand-font-body` | `"Inter"` | Body text, labels |
| `--brand-radius` | `0.75rem` | Default border radius |

### Non-Brandable Tokens

Surface colours (`--color-surface-*`), text (`--color-on-surface`), status colours (success/warning/error), and outline colours are defined directly in `theme.css :root` and are **not** overridden by `applyBrandTheme()`. They provide neutral stability regardless of brand.

### BrandContext

`BrandProvider` wraps `AppShell` and fetches the org's saved brand from the API on mount, then calls `applyBrandTheme()`. Pages that show brand-updated UI should subscribe via `useBrand()` for the `logoUrl` and `brandName`:

```ts
import { useBrand } from '../contexts/brandContext';
const { logoUrl, brandName, isLoaded } = useBrand();
```

---

## shadcn/UI Components

### What shadcn/UI Is

shadcn is not a component library you install as a dependency — it's a collection of copy-pasted Radix UI primitives with Tailwind styling, living in `src/components/ui/`. They are **owned code** that can be modified freely.

### The `cn()` Utility

Every shadcn component uses `cn()` from `src/lib/utils.ts` to merge Tailwind classes safely:

```ts
import { cn } from '@/lib/utils';

// Merges classes, resolves Tailwind conflicts (e.g. p-4 + p-6 → p-6)
<div className={cn('px-4 py-2 rounded-lg', isActive && 'bg-primary text-white', className)} />
```

Always use `cn()` when combining conditional classes. Never use template literals for Tailwind class merging.

### Import Path

shadcn components always import as `@/components/ui/...`:

```ts
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
```

### Button Variants

The `Button` component has these variants (defined in `src/components/ui/button.tsx`):

| Variant | Use |
|---|---|
| `default` | Primary action — solid bg-primary |
| `outline` | Secondary action — border only |
| `ghost` | Tertiary / nav action — no border |
| `gradient` | Hero CTAs — primary→tertiary gradient |
| `destructive` | Delete/danger actions |
| `secondary` | Neutral background |
| `success` | Confirmation states |
| `link` | Text link — underline on hover |

```tsx
<Button variant="gradient" size="lg">Generate Insights</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button variant="ghost" size="icon"><Icon name="close" size={16} /></Button>
```

### shadcn Variable Bridge

`theme.css` contains a dedicated `:root` block that maps the design system's `--color-*` variables to shadcn's expected `--primary`, `--border`, `--muted`, etc. This means shadcn components automatically pick up brand theme changes without any additional wiring.

### Available shadcn Primitives

`badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `progress`, `scroll-area`, `select`, `separator`, `sheet`, `switch`, `table`, `tabs`, `textarea`, `tooltip`

`TooltipProvider` must wrap any subtree using `Tooltip`. For page-level usage, wrap the page root. For component-level, `delayDuration={200}` is the standard.

---

## Responsive Device Strategy

### Three Breakpoints

```
Mobile   < 768px   — BottomNav, no SideNav, single-column layouts
Tablet   768-1023px — Collapsed icon-only SideNav (3.5rem), no BottomNav
Desktop  ≥ 1024px  — Full or collapsed SideNav (16rem / 3.5rem)
```

`useBreakpoint()` from `src/hooks/useBreakpoint.ts` uses `ResizeObserver` on `document.documentElement` and returns `'mobile' | 'tablet' | 'desktop'`. It is the single source of truth for responsive logic in JS code.

```ts
const breakpoint = useBreakpoint();
const isMobile = breakpoint === 'mobile';
```

### SideNav Behaviour

The sidebar width is exposed as `--sidebar-width` CSS variable by AppShell (`'0px'` / `'3.5rem'` / `'16rem'`). The TopBar consumes this via `.topbar-fixed` class:

```css
.topbar-fixed {
  left: var(--sidebar-width, 16rem);
  width: calc(100% - var(--sidebar-width, 16rem));
  transition: left 250ms ease, width 250ms ease;
}
```

**Sidebar state persists** in localStorage via `useSidebarState()` — key `sidenav_expanded`. Tablet width forces collapsed state on mount.

### BottomNav (Mobile)

Mobile navigation uses a fixed bottom bar with 5 items: Surveys | Data | FAB(Create) | Insights | Settings. The centre FAB floats above the bar with a gradient circle. It respects iOS safe area insets via `env(safe-area-inset-bottom)`.

`pb-24 md:pb-8` on the AppShell content wrapper reserves space for BottomNav on mobile — never remove this.

### Responsive Tailwind Patterns

```tsx
// Content that adapts across all three breakpoints
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Padding changes at tablet
<div className="px-6 md:px-8">

// Text size adapts
<h1 className="text-2xl md:text-3xl xl:text-4xl font-black">

// Show/hide across breakpoints
<div className="hidden md:flex">   {/* hidden on mobile, flex on tablet+ */}
<span className="md:hidden">      {/* visible on mobile only */}
```

### No Horizontal Scroll Rule

`overflow-x: hidden` is set on both `body` and content containers. Never use fixed-width elements wider than the viewport. Use `min-w-0` on flex children that need to truncate.

---

## Smooth Animations

### Page Transitions (Framer Motion)

`AppShell` wraps the `<Outlet>` in `AnimatePresence mode="wait"` with `location.pathname` as the key. Every route change triggers:

```ts
const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
};
```

The ease `[0.22, 1, 0.36, 1]` is the house spring curve — use it for entrance animations throughout the app.

### Component Entrance Patterns

```tsx
// Standard section entrance
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
>

// Staggered children (e.g. card grids)
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const rise = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

<motion.div variants={stagger} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.div key={item.id} variants={rise}>
      <Card />
    </motion.div>
  ))}
</motion.div>

// Exit animation (AnimatePresence required in parent)
<AnimatePresence mode="wait">
  {isVisible && (
    <motion.div
      key="unique-key"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35 }}
    />
  )}
</AnimatePresence>
```

### CSS Keyframe Animations

For decorative persistent animations (not triggered by interaction), use CSS keyframes directly — they run off the main thread and don't require Framer Motion:

```tsx
// Floating Crystal orb
<div style={{ animation: 'float-bob 6s ease-in-out infinite' }} />

// Holographic shimmer
<div className="holographic" />  {/* aurora keyframe, 8s */}

// Pulse dot (live indicators)
<span style={{ animation: 'pulse-glow 2.5s ease-in-out infinite' }} />

// Skeleton loading
<div className="skeleton h-16 rounded-xl" />
```

### Navigation Micro-interactions

Sidebar item hover uses a spring-based transform: `translateX(4px)` with `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot spring). Active items get a gradient background + primary border + box shadow.

Button tap feedback: `active:scale-95` is baked into the base Button component via CVA.

Card hover: `.card-tilt:hover` applies a subtle `perspective(1000px) rotateX(2deg) rotateY(-1deg)` for depth. `.card-3d:hover` applies a more dramatic `translateZ(8px)` lift.

---

## 3D Navigation and Visuals

### Technology Stack

- **`@react-three/fiber`** — React renderer for Three.js (WebGL). Use `useFrame()` for per-frame animation loops.
- **`@react-three/drei`** — Helper components: `Float`, `Stars`, `MeshDistortMaterial`, `Icosahedron`, `Octahedron`, `Sphere`, `OrbitControls`.
- **`three`** — Core Three.js (geometry, materials, color utilities).

### When and How to Use Three.js

Three.js code lives in `src/components/three/`. Currently: `HeroCanvas.tsx`.

**Lazy-load always** — Three.js is ~500KB. Never import it directly in a page component:

```tsx
// ✅ Correct
import { Suspense, lazy } from 'react';
const HeroCanvas = lazy(() =>
  import('../../components/three/HeroCanvas').then(m => ({ default: m.HeroCanvas }))
);

// In render:
<Suspense fallback={null}>
  <HeroCanvas />
</Suspense>

// ❌ Wrong — bundles Three.js into the main chunk
import { HeroCanvas } from '../../components/three/HeroCanvas';
```

**Always check `prefers-reduced-motion`** before mounting a Canvas:

```tsx
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

{!prefersReducedMotion && (
  <Suspense fallback={null}>
    <HeroCanvas />
  </Suspense>
)}
```

### HeroCanvas Architecture

`HeroCanvas` is the full-bleed 3D scene used on the Landing page and Spatial Insights view. It renders:

1. **`Particles`** — 320 floating colour points (`THREE.Points`) rotating slowly via `useFrame`
2. **`CentralCrystal`** — Distorted icosahedron with wireframe overlay using `MeshDistortMaterial`, floating via `<Float>`
3. **`OrbitRing` × 3** — Thin torus rings at different angles and speeds
4. **`FloatingGem` × 8** — Small icosahedra/octahedra/spheres scattered in the background
5. **`Stars`** — `@react-three/drei` deep starfield

Canvas config: `dpr={[1, 2]}` caps at 2× DPR. `pointerEvents: 'none'` — the canvas is purely decorative.

### CSS Crystal Alternative

For most UI contexts, use the CSS-only Crystal orb instead of Three.js — it's zero-weight and runs via CSS animations:

```tsx
// CSS crystal (used in ExperienceHubPage, SurveyIntelligencePage hero)
<div style={{ width: 152, height: 152, position: 'relative',
  filter: 'drop-shadow(0 20px 44px rgba(42,75,217,0.45))' }}>
  {/* Outer rotating hex */}
  <div style={{ position:'absolute', inset:0,
    background:'conic-gradient(from 0deg at 50% 50%, #879aff 0%, #d299ff 25%, #82deff 50%, #d299ff 75%, #879aff 100%)',
    clipPath:'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)',
    animation:'exp-hub-spin 20s linear infinite', filter:'blur(0.5px)' }} />
  {/* Inner counter-rotating hex */}
  <div style={{ position:'absolute', inset:'18%',
    background:'conic-gradient(from 180deg at 50% 50%, #ffffff 0%, #879aff 33%, #d299ff 66%, #ffffff 100%)',
    clipPath:'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)',
    animation:'exp-hub-spin 10s linear infinite reverse', opacity:0.78 }} />
  {/* Glowing core */}
  <div style={{ position:'absolute', inset:'38%',
    background:'radial-gradient(circle, #ffffff, #82deff)',
    borderRadius:'50%', filter:'blur(5px)',
    animation:'pulse-glow 2.5s ease-in-out infinite' }} />
  <style>{`@keyframes exp-hub-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }`}</style>
</div>
```

---

## Application Shell

`AppShell.tsx` is the root layout for all authenticated pages. It provides:
- `px-6 md:px-8` horizontal gutters + `pb-24 md:pb-8` bottom clearance — pages must NOT add their own gutters
- `paddingTop: '4rem'` on `<main>` to clear the fixed TopBar — pages that skip `PageHeader` must add their own `pt-6 md:pt-8`
- `--sidebar-width` CSS variable — consumed by fixed-position panels
- **Builder mode**: when `pathname` matches `/surveys/:id/build`, gutters/footer/BottomNav are suppressed and the page owns its full viewport

```
App (BrandProvider > AppShell)   // AppShell internally provides CrystalPanelProvider + mounts CrystalPanel once
  ├── SideNav   (desktop ≥768px; collapsed 3.5rem or expanded 16rem)
  ├── TopBar    (fixed 4rem height)
  ├── <main>    (marginLeft = sidebarWidth, paddingTop = 4rem)
  │    └── Outlet  (wrapped in px-6 md:px-8 pb-24 md:pb-8 for non-builder)
  ├── BottomNav (mobile only)
  └── CrystalPanel (global fixed panel, right side, available on every route)
```

---

## Page Pattern

Every authenticated page:
1. Uses `max-w-7xl mx-auto w-full` on the root div
2. Calls `useSetPageTitle(title, subtitle)` — AppShell reads it for TopBar
3. Uses `PageHeader` which provides `pt-8 md:pt-10`. Pages without `PageHeader` add `pt-6 md:pt-8` manually
4. Never imports `SideNav`, `TopBar`, `BottomNav`, or `AppShell`

```tsx
export function SomePage() {
  const { t } = useTranslation();
  useSetPageTitle(t('page.title'), t('page.subtitle'));
  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.parent'), path: ROUTES.PARENT }, { label: t('page.title') }]}
        title={t('page.title')}
        actions={<Button>...</Button>}
      />
      {/* content */}
    </div>
  );
}
```

---

## Crystal AI Panel

`CrystalPanel` is mounted **once globally** in `AppShell` — never render it inside a page. Pages interact via `useCrystalPanel()`:

```ts
const { openCrystal, setScope, setCrystalData } = useCrystalPanel();

// On mount: scope Crystal to this survey
useEffect(() => {
  if (surveyId) setScope(surveyId);
  return () => { setScope('all'); setCrystalData([], []); };
}, [surveyId]);

// After loading agentic insights + topics:
setCrystalData(loadedInsights, loadedTopics);

// Open panel with a pre-loaded query:
openCrystal('Why did NPS drop?', { focused_topic: 'Wait Time' });
```

Crystal SSE streaming is **always on** (`const CRYSTAL_STREAMING = true` in
`CrystalPanel.tsx`); it falls back to REST only when the stream endpoint is
unreachable. There is no `VITE_CRYSTAL_STREAMING` flag anymore.

### Crystal action proposals (Crystal proposes, the app executes)
Crystal never mutates data on its own. The stream may emit an `action_proposals`
event rendered as confirmation cards (`ActionProposalCard`). On **Apply**,
`executeAction` (in `CrystalPanel.tsx`) dispatches by `proposal.type`:
- write actions (`create_workflow`, `create_alert`, `schedule_rerun`) call the API
  then `invalidate(...)` the DataBus so open pages refresh;
- builder actions (`create_survey`, `edit_survey`, `distribute`) `navigate(toPath(ROUTES.BUILDER, …))`
  with router state — never `window.location.href`.
Every interaction records `api.recordProposalOutcome(...)` (`accepted → succeeded | failed`, `dismissed`).
Types: `ActionProposal` / `ActionProposalType` in `types/index.ts`.

### DataBus invalidation (`lib/dataBus.ts`)
No shared query cache exists — each page hook owns its data. When Crystal mutates
data from the global panel, call `invalidate('workflows'|'alerts'|'insights'|'surveys')`;
data hooks subscribe with `useInvalidation(resource, reload)` to re-fetch. Any new
data hook for a Crystal-mutable resource MUST subscribe.

---

## API Client

All backend calls go through `useApi()`. The client injects Clerk JWT automatically.

**Postgres NUMERIC columns return as strings.** Every method fetching numeric data must coerce before returning:

```ts
const coerce = (v: unknown) => (v == null ? null : Number(v));
```

This is already done in `listTopics()`, `getTopicHierarchy()`, `getTopicDetail()`, `getTopicDrivers()`. Apply the same pattern when adding new data-fetching methods.

---

## Routing

Always use `ROUTES.KEY` and `toPath()` — never raw string paths:

```ts
import { ROUTES, toPath } from '../constants/routes';
<Link to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId, topicId })} />
```

---

## Localisation

Every user-visible string goes through `t()`. No exceptions.

```ts
import { useTranslation } from '../lib/i18n';
const { t } = useTranslation();

t('surveys.title')
t('surveys.countDescription', { count: 5, responses: 100 })  // {variable} interpolation
```

Sub-components defined outside the main component function must call `useTranslation()` themselves — `t` is NOT inherited from parent scope (this causes `t is not defined` runtime crashes).

Locale file `src/locales/en.ts` (~2200 lines) is organized by feature namespace: `brand`, `nav`, `common`, `surveys`, `insights`, `surveyInsights`, `experience`, `advancedInsights`, `sampleResponses`, `crystal`.

---

## Insight Layer System

Four layers with shared visual config in `src/pages/insights/shared.tsx`:

```ts
import { LAYER_CONFIG, GlassCard, CitationChip, ConfidenceChip, LayerBadge, LiveDot } from '../insights/shared';
// LAYER_CONFIG['descriptive' | 'diagnostic' | 'predictive' | 'prescriptive']
// → { color, bg, ringColor, textColor }
```

Trust score thresholds: ≥80 = Reliable (emerald), 60–79 = Indicative (amber), <60 = Low-signal (muted).

Metric insights (`metric.nps`, `metric.csat`) use a different trust formula than qualitative insights — they are scored on sample size only, not citation coverage.

---

## Testing

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

afterEach(cleanup);
```

Test files live in `src/__tests__/` mirroring `src/` structure. Setup at `src/test/setup.ts` extends Vitest with `@testing-library/jest-dom` matchers.

### Testing rules

Every code change requires a corresponding test change:
- **New component or hook** → add tests in `src/__tests__/` mirroring the source path
- **Modified component behavior** → update existing tests; delete tests for removed behavior
- **Bug fix** → add a regression test

Run the relevant test file before submitting:
```bash
nvm use 20 && npx vitest run src/__tests__/pages/experience/SurveyReportPage.test.tsx
```

Mock checklist for page tests:
- `vi.mock('../../lib/i18n', ...)` — always mock `useTranslation`
- `vi.mock('framer-motion', ...)` — replace motion components with plain HTML
- `vi.mock('../../hooks/useApi', ...)` + `vi.mock('../../hooks/useSurveys', ...)` — mock all data hooks
- `global.URL.createObjectURL` / `URL.revokeObjectURL` — mock in `beforeEach` if the component downloads files
- Wrap `render()` in `MemoryRouter` when component uses router hooks

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | Yes | Backend base URL (default `http://localhost:3001`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | No | Enables Clerk auth; omit for demo/dev mode |

When `VITE_CLERK_PUBLISHABLE_KEY` is absent, all routes are accessible and `useAppAuth()` returns `{ isSignedIn: true, userId: 'dev-user', orgId: 'dev-org' }`.

---

## Build Chunking

Vite splits heavy dependencies into named chunks:
- `vendor-three` — Three.js + `@react-three/*`
- `vendor-firebase` — Firebase SDK
- `vendor-clerk` — Clerk auth
- `vendor-charts` — Recharts
- `vendor-motion` — Framer Motion
- `vendor-react` — React, ReactDOM, React Router

Three.js (`HeroCanvas`) is only in `SpatialView` and `LandingPage`, loaded via `React.lazy()` + `<Suspense fallback={null}>`.
