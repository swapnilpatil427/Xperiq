# Components — Shared UI

> All components are TypeScript (`.tsx`). Filenames below using `.jsx` are historical —
> read them as `.tsx`. `App.jsx` → `App.tsx`.

## AppShell.tsx (critical)
The central layout wrapper for all authenticated pages. Provides:
- Collapsible SideNav (desktop/tablet) via `useSidebarState`
- Fixed TopBar (hamburger + CreditsChip + notifications + UserButton)
- BottomNav (mobile only)
- CSS variable `--sidebar-width` for consistent sidebar offset
- Page transition animations via Framer Motion `AnimatePresence`
- **Global page container**: `px-6 md:px-8 pb-24 md:pb-8` wraps every Outlet page

Do NOT import this in pages — it's wired in App.jsx at the route level.
Pages only need to declare their `max-w-X mx-auto w-full` content constraint — padding and BottomNav clearance come from AppShell automatically.

## SideNav.jsx
Props: `{ isExpanded, onToggle }` — controlled by AppShell (or SurveyBuilderPage).
- Expanded: 16rem (256px) — full labels, Create CTA button, OrgSwitcher
- Collapsed: 3.5rem (56px) — icons only with Tooltip (right side)
- Nav items: Surveys, Data, Insights, Respondents, Workflows, Templates, [divider], Settings

## TopBar.jsx
Props: `{ onMenuToggle }` — called by AppShell to toggle SideNav.
- Has `CreditsChip` component (pill with credit count, opens Sheet drawer)
- Position fixed, width/left driven by `--sidebar-width` CSS var
- Does NOT display page title (each page owns its heading via PageHeader)
- `TopBarPublic` exported separately for the public marketing nav

## PageHeader.jsx
Shared page header for all AppShell pages. Renders breadcrumb + H1 + subtitle + actions.
`<PageHeader crumbs={[...]} title="..." subtitle="..." actions={<Button>} />`
- Breadcrumb only renders when `crumbs.length >= 2` — top-level pages just get the H1
- Parent crumb: `← Label` link style (text-sm, chevron_left icon on first)
- Current crumb: `font-semibold text-on-surface`
- Top padding `pt-8 md:pt-10` is built in — do not add extra top spacing above PageHeader

## BottomNav.jsx
Mobile-only (hidden on desktop/tablet by AppShell).
5 items: Surveys | Data | FAB(Create) | Insights | Settings. Center FAB is gradient circle.

## Logo.jsx
- `<LogoMark size={n} />` — Crystal facet SVG (icon only)
- `<LogoFull height={n} showTagline />` — LogoMark + wordmark gradient text
Use these instead of any `psychology` Material icon for branding.

## Icon.jsx
Wraps Material Symbols Outlined.
`<Icon name="poll" size={20} fill={0|1} className="..." />`
fill=1 = filled variant. Common names: poll, dataset, psychology, groups, account_tree, auto_awesome, settings, add, refresh, menu, menu_open, chevron_right.

## CrystalPanel.tsx — Crystal AI + action proposals
Mounted once globally inside AppShell (never render it in a page). Streams Crystal
answers over SSE and renders **action proposals** as confirmation cards.

- **Boundary: Crystal proposes, the app executes.** Crystal never mutates data
  autonomously. The stream can emit an `action_proposals` event; each renders as an
  `ActionProposalCard` showing title, description, business rationale, confidence,
  priority, and a **Details** toggle ("What will happen" — a `humanizeParams` preview
  so nothing mutates unseen). The user clicks **Apply** (the confirm gesture).
- `executeAction` dispatches by `proposal.type`: write actions (`create_workflow`,
  `create_alert`, `schedule_rerun`) call the API then `invalidate(...)` the DataBus;
  builder actions (`create_survey`, `edit_survey`, `distribute`) `navigate(toPath(ROUTES.BUILDER, …))`
  with state — never `window.location.href`.
- **Outcome telemetry:** every interaction calls `api.recordProposalOutcome(...)`
  through the funnel `accepted → succeeded | failed` (and `dismissed`).
- Types: `ActionProposal` / `ActionProposalType` in `types/index.ts`; `requires_confirmation`
  is always true. Adding a new proposal type → handle it in `executeAction`, add to the
  type union, and `invalidate()` after any mutation.

## ui/ subdirectory
shadcn/UI primitives. Available: badge, button, card, dialog, dropdown-menu, input, label, progress, scroll-area, select, separator, sheet, switch, tabs, textarea, tooltip.
All use `cn()` from `@/lib/utils` for class merging.
