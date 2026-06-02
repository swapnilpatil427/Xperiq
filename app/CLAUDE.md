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

# Type-check (does NOT emit — used for CI validation)
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
| Animation | Framer Motion |
| UI Primitives | shadcn/UI (`src/components/ui/`) built on Radix UI |
| Icons | Material Symbols Outlined via `<Icon name="..." />` |
| 3D | `@react-three/fiber` + `@react-three/drei` (lazy-loaded, only in SpatialView) |
| Charts | Recharts |
| HTTP | Axios via `createApiClient()` in `src/lib/api.ts` |
| Testing | Vitest + React Testing Library + jsdom |

---

## Architecture

### Application Shell

`AppShell.tsx` is the root layout for all authenticated pages. It provides:
- `px-6 md:px-8` horizontal gutters + `pb-24 md:pb-8` bottom clearance — pages must NOT add their own gutters
- `paddingTop: '4rem'` on `<main>` to clear the fixed TopBar — pages that skip `PageHeader` must add their own `pt-6 md:pt-8`
- `--sidebar-width` CSS variable set dynamically — consumed by fixed-position panels
- **Builder mode**: when `pathname` matches `/surveys/:id/build`, gutters/footer/BottomNav are suppressed and the page owns its full viewport

```
App (BrandProvider > CrystalPanelProvider > AppShell)
  ├── SideNav   (desktop ≥768px; collapsed 3.5rem or expanded 16rem)
  ├── TopBar    (fixed 4rem height)
  ├── <main>    (marginLeft = sidebarWidth, paddingTop = 4rem)
  │    └── Outlet  (wrapped in px-6 md:px-8 pb-24 md:pb-8 for non-builder)
  ├── BottomNav (mobile only)
  └── CrystalPanel (global fixed panel, right side, available on every route)
```

### Page Pattern

Every authenticated page:
1. Uses `max-w-7xl mx-auto w-full` on the root div
2. Calls `useSetPageTitle(title, subtitle)` — AppShell reads it for TopBar
3. Uses `PageHeader` component for breadcrumbs + H1 + subtitle + actions (which provides `pt-8 md:pt-10`). Pages without `PageHeader` add `pt-6 md:pt-8` manually.
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

### Crystal AI Panel

`CrystalPanel` is mounted **once globally** in `AppShell` — never render it inside a page. Pages interact with it through `useCrystalPanel()`:

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

`VITE_CRYSTAL_STREAMING=true` enables SSE streaming path; default is the legacy REST path.

### API Client

All backend calls go through `useApi()`:

```ts
const api = useApi();
// api is a fully-typed ApiClient (src/lib/api.ts)
// It injects the Clerk JWT automatically via getToken
```

**Postgres NUMERIC columns return as strings** from the backend. Every method that fetches numeric data must coerce values before returning. Pattern already used in `listTopics()`, `getTopicHierarchy()`, `getTopicDetail()`, `getTopicDrivers()`:

```ts
const coerce = (v: unknown) => (v == null ? null : Number(v));
```

### Routing

All routes live in `src/constants/routes.ts`. Always use `ROUTES.KEY` and `toPath(route, params)` — never raw strings:

```ts
import { ROUTES, toPath } from '../constants/routes';
<Link to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId, topicId })} />
```

---

## Styling System

### CSS Variable Architecture (three-layer cascade)

```
--brand-primary            (theme.css :root — runtime-overrideable)
  → --color-primary        (theme.css :root — semantic alias)
    → Tailwind @theme      (index.css @theme block — build-time, powers bg-primary etc.)
    → var(--color-primary) (live in CSS rules — responds to brand overrides)
```

**Rule**: CSS rules that must respond to white-label brand changes (e.g. buttons, borders, focus rings) must use `var(--color-primary)`, NOT the Tailwind utility `bg-primary`. Tailwind utilities are safe for purely static decorative uses.

### Design Tokens

Core brand colours (from `theme.css`):
- `--color-primary` #2a4bd9 (blue)
- `--color-secondary` #00647c (teal)  
- `--color-tertiary` #8329c8 (purple)
- `--color-error` #b41340, `--color-success` #059669, `--color-warning` #d97706

Surface scale: `surface-container-lowest` → `surface-container-low` → `surface-container` → `surface-container-high` → `surface-container-highest`

Brand theming at runtime: `applyBrandTheme()` from `src/lib/brandTheme.ts` sets `--brand-*` on `:root`, which cascades automatically.

### Glass Morphism Utilities

| Class | Usage |
|---|---|
| `.glass-card` | Standard glass surface (rgba white 0.7, blur 24px) |
| `.glass-card-premium` | Richer glass (rgba white 0.72, blur 32px, saturate 180%) |
| `.holographic` | Animated iridescent gradient overlay (aurora keyframe) |
| `.glass-nav` | Navigation glass surface |

`GlassCard` from `src/pages/insights/shared.tsx` is the React wrapper — prefer it over raw `className="glass-card-premium"` in insight/experience pages.

### Animation Utilities

| Class / Keyframe | Effect |
|---|---|
| `.float-card` | Gentle float (6s, `float-bob` keyframe) |
| `.float-card-slow` | Slower float (9s) |
| `.holographic` | Aurora shimmer (8s) |
| `.animate-fade-up` | Fade + translate-up entry |
| `.animate-scale-in` | Scale from 0.92 entry |
| `.card-tilt:hover` | Perspective tilt on hover |
| `.card-3d:hover` | Deeper 3D perspective lift |
| `.shimmer` | Loading skeleton sweep |
| `.skeleton` | Shimmer skeleton placeholder |
| `pulse-glow` | Opacity + scale pulse (for dots, orbs) |

For page-level entrance animations, use **Framer Motion** (`motion.div` with `initial/animate/transition` or `variants`). For persistent decoration (floating orbs, holographic backgrounds), use CSS keyframes directly.

---

## Localisation

**Every user-visible string goes through `t()`**. No exceptions. The locale file is the single source of truth.

```ts
import { useTranslation } from '../lib/i18n';
const { t } = useTranslation();

// Simple
t('surveys.title')

// Interpolation
t('surveys.countDescription', { count: 5, responses: 100 })
// → "Showing {count} surveys with {responses} responses"
```

### Locale File Structure (`src/locales/en.ts`)

The file exports a single deeply-nested `en` object (~2200 lines). Keys mirror the feature hierarchy:

```
en.brand.*         — product name, tagline, Crystal branding
en.nav.*           — sidebar navigation labels
en.common.*        — shared labels (loading, responses, actions)
en.surveys.*       — survey list/builder/creation
en.insights.*      — /app/insights pages and insight card labels
en.surveyInsights.* — agentic insight layers, trust, filters
en.experience.*    — /app/experience/* pages (hub, intelligence, topics, topicDetail)
en.advancedInsights.* — /app/insights/advanced page
en.sampleResponses.* — sample response generation page
en.crystal.*       — Crystal AI tool labels
```

### Adding New Keys

1. Add the key to `src/locales/en.ts` in the correct namespace section
2. Use `t('your.new.key')` in the component — in `DEV` mode, a console warning fires for missing keys
3. Sub-components defined outside the main component function must call `const { t } = useTranslation()` themselves — `t` is not inherited from parent scope

### Interpolation Syntax

Variables use `{variable}` notation:
```ts
// en.ts
count: '{n} topics discovered'

// Usage
t('experience.topics.summary.topicsDiscovered', { n: String(rootTopics.length) })
```

---

## Insight Layer System

The four insight layers have a shared visual config in `src/pages/insights/shared.tsx`:

```ts
import { LAYER_CONFIG } from '../insights/shared';
// LAYER_CONFIG['descriptive' | 'diagnostic' | 'predictive' | 'prescriptive']
// → { color, bg, ringColor, textColor }
```

Layer labels come from locale keys `surveyInsights.layers.${layer}.label` and `.tooltip`. Always use these — never hardcode "What happened" or "Prescriptive".

Shared primitives from `src/pages/insights/shared.tsx`:
- `GlassCard` / `GlassCardDark` — surface wrappers
- `CitationChip` — clickable `[rXXXX]` inline citation
- `ConfidenceChip` — color-coded trust badge (green/amber/grey)
- `CIBar` — confidence interval visualisation
- `LayerBadge` — layer icon + label
- `LiveDot` — pulsing status dot
- `SENTIMENT_BORDER` — border colour map for quote cards

---

## Insight Trust Scores

Trust is 0–100. Two different formulas exist:

- **Qualitative insights** (topics, drivers, prescriptions): weighted composite of statistical + coverage + consistency + grounding
- **Metric insights** (`metric.nps`, `metric.csat`, `metric.ces`): computed by `_build_metric_trust()` — purely statistical, since citations are not applicable to calculated numbers

Frontend thresholds:
- ≥ 80 → `● Reliable finding` (emerald)
- 60–79 → `◑ Indicative finding` (amber)
- < 60 → `○ Low-signal` (muted)

---

## Testing

Test files live alongside their subjects in `src/__tests__/` mirroring the `src/` structure. Setup file at `src/test/setup.ts` extends Vitest with `@testing-library/jest-dom` matchers.

```ts
// Standard test structure
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

afterEach(cleanup);

describe('ComponentName', () => {
  it('describes expected behaviour', async () => {
    render(<Component prop="value" />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('result')).toBeTruthy();
  });
});
```

Component tests should not test implementation details — test what the user sees and how they interact with it.

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | Yes | Backend base URL (default `http://localhost:3001`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | No | Enables Clerk auth; omit to run in `SKIP_AUTH` demo mode |
| `VITE_CRYSTAL_STREAMING` | No | Set `true` to enable SSE streaming for Crystal AI responses |

When `VITE_CLERK_PUBLISHABLE_KEY` is absent, the app runs without auth (all routes accessible, `useAppAuth()` returns `{ isSignedIn: true, userId: 'dev-user', orgId: 'dev-org' }`).

---

## Build Chunking

Vite splits heavy dependencies into named chunks (configured in `vite.config.ts`):
- `vendor-three` — Three.js + `@react-three/*`
- `vendor-firebase` — Firebase SDK
- `vendor-clerk` — Clerk auth
- `vendor-charts` — Recharts
- `vendor-motion` — Framer Motion
- `vendor-react` — React, ReactDOM, React Router

Three.js (`HeroCanvas`) is lazy-loaded via `React.lazy()` — import it with `<Suspense fallback={null}>`.
