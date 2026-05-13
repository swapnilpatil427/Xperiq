# Experient — Frontend App

## Stack
React 18 + Vite, Tailwind v4, Framer Motion, shadcn/UI, Clerk auth, React Router v6

## Key architectural decisions
- **No tailwind.config.js** — all design tokens are CSS custom properties in `src/index.css` and `src/styles/theme.css`
- **AppShell pattern** — `components/AppShell.jsx` wraps all authenticated pages (SideNav + TopBar + BottomNav). Only SurveyBuilderPage manages its own layout.
- **i18n** — All user-visible strings in `src/locales/en.js`, accessed via `t('key')` from `useTranslation()` in `src/lib/i18n.js`
- **API calls** — All write/AI operations via `src/lib/api.js` (`createApiClient(getToken)`). The `useApi()` hook from `src/hooks/useApi.js` provides a ready-to-use client.
- **Auth** — Clerk via `useAppAuth()` from `src/lib/auth.jsx`. Wrapped by `ProtectedRoute` in `App.jsx`.
- **Page title** — Set via `useSetPageTitle(title, subtitle)` from `src/contexts/pageTitle.jsx`. AppShell reads it and passes to TopBar.

## Directory guide
- `src/components/` — Shared UI components (AppShell, SideNav, TopBar, BottomNav, Logo, Icon, etc.)
- `src/components/ui/` — shadcn/UI primitives (button, dialog, sheet, etc.)
- `src/pages/` — One file per route/page
- `src/hooks/` — Custom React hooks (useApi, useSidebarState, useBreakpoint, etc.)
- `src/contexts/` — React contexts (pageTitle)
- `src/constants/` — ROUTES, question types, colors, thresholds — single source of truth
- `src/locales/` — i18n strings (`en.js`)
- `src/lib/` — Utilities (api.js, auth.jsx, i18n.js, brandTheme.js)
- `src/styles/` — theme.css (shadcn CSS vars bridge)

## CSS conventions
- Glass morphism: `.glass-card`, `.glass-card-premium`, `.glass-nav`
- Gradient text: `.text-gradient`, `.text-gradient-teal`
- Animation: `.animate-fade-up`, `.animate-scale-in`
- Nav: `.sidenav-item`, `.sidenav-item-collapsed`, `.active-bar`, `.bottomnav`, `.topbar-fixed`
- Credits: `.credits-chip`, `.credits-chip.warn`, `.credits-chip.critical`

## Responsive strategy
- Mobile (<768px): BottomNav replaces sidebar, no SideNav
- Tablet (768-1023px): Collapsed icon-only SideNav (56px), no BottomNav
- Desktop (>=1024px): Full or collapsed SideNav per user preference (localStorage)
- No horizontal scroll: `overflow-x: hidden` on body + content containers
