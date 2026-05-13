# Components — Shared UI

## AppShell.jsx (critical)
The central layout wrapper for all authenticated pages. Provides:
- Collapsible SideNav (desktop/tablet) via `useSidebarState`
- Fixed TopBar with title from `PageTitleProvider` context
- BottomNav (mobile only)
- CSS variable `--sidebar-width` for consistent offset
- Page transition animations via Framer Motion `AnimatePresence`
Do NOT import this in pages — it's wired in App.jsx at the route level.

## SideNav.jsx
Props: `{ isExpanded, onToggle }` — controlled by AppShell (or SurveyBuilderPage).
- Expanded: 16rem (256px) — full labels, Create CTA button, OrgSwitcher
- Collapsed: 3.5rem (56px) — icons only with Tooltip (right side)
- Nav items: Surveys, Data, Insights, Respondents, Workflows, Templates, [divider], Settings

## TopBar.jsx
No props — reads title/subtitle from `PageTitleContext`.
- Has `CreditsChip` component (pill with credit count, opens Sheet drawer)
- Position fixed, width/left driven by `--sidebar-width` CSS var
- `TopBarPublic` exported separately for the public marketing nav

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

## ui/ subdirectory
shadcn/UI primitives. Available: badge, button, card, dialog, dropdown-menu, input, label, progress, scroll-area, select, separator, sheet, switch, tabs, textarea, tooltip.
All use `cn()` from `@/lib/utils` for class merging.
