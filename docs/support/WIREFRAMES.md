# Experient Support System — Wireframes

**Status:** Design Reference — Primary frontend engineering specification  
**Owner:** UX / Product  
**Date:** June 2026  
**Companion docs:** `DESIGN.md`, `SITE_STRUCTURE.md`, `ARCHITECTURE.md`

---

## Design System Reference

This document uses shorthand tokens throughout. Map every token to the exact value below before implementing.

| Token | Value | Usage |
|-------|-------|-------|
| `[PRIMARY]` | `#2a4bd9` | Primary actions, active nav, links |
| `[PURPLE]` | `#8329c8` | Crystal, tertiary accent, gradients |
| `[TEAL]` | `#00647c` | Secondary actions, success tones |
| `[BG]` | `#f5f7f9` | Page background |
| `[WHITE]` | `#ffffff` | Cards, panels, inputs |
| `[TEXT]` | `#2c2f31` | Primary on-surface text |
| `[MUTED]` | `#595c5e` | Secondary text, placeholders |
| `[GREEN]` | `#059669` | Success, shipped, operational |
| `[RED]` | `#b41340` | Error, degraded, destructive |
| `[AMBER]` | `#d97706` | Warning, beta, in-progress |
| `[GRAD]` | `linear-gradient(135deg, #2a4bd9, #8329c8)` | Gradient buttons, Crystal elements |
| `[GLASS]` | `backdrop-filter:blur(24px); bg:rgba(255,255,255,0.72); border:rgba(255,255,255,0.5)` | Glass card overlay |

**Typography tokens:**

| Token | Value |
|-------|-------|
| `[H1]` | Manrope font-extrabold 1.75rem (28px) |
| `[H2]` | Manrope font-extrabold 1.25rem (20px) |
| `[BODY]` | Inter font-normal 0.875rem (14px) |
| `[LABEL]` | Inter font-black 0.625rem (10px) uppercase tracking-widest |
| `[BADGE]` | Inter font-black 0.625rem uppercase rounded-full px-2.5 py-0.5 |

**Layout constants:**

| Element | Value |
|---------|-------|
| TopBar height | 64px fixed |
| SideNav expanded | 256px |
| SideNav collapsed | 56px |
| Content max-width | 1280px (max-w-7xl) |
| Content horizontal padding | 32px (px-8) |
| Card border-radius | 16px (rounded-2xl) |
| Card shadow | `0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)` |
| Card padding | 24px (p-6) |
| Button height | 40px (h-10) |
| Button padding | 20px horizontal (px-5) |
| Button border-radius | 12px (rounded-xl) |
| Crystal FAB | 52px circle, fixed bottom-right, [GRAD] bg |

---

## Screen 1: Support Site Homepage (Desktop 1440px)

### Overview

The homepage is the primary entry point for `support.experient.ai`. It surfaces Crystal search as the dominant interaction, backed by quick-nav cards, a live platform status bar, and a "Just Shipped" changelog strip. The layout is full-bleed 1440px with a centered `max-w-7xl` content column.

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  TOPBAR  [WHITE] bg · 64px fixed · box-shadow: 0 1px 0 rgba(0,0,0,0.06)                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │ ▣ Experient [PRIMARY] logo + wordmark · Manrope bold 1rem          🔍  ← Back to app  │ │
│  │   24px from left edge                                                  icon   [PRIMARY] │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  HERO SECTION  [BG] gradient overlay: linear(180deg, rgba(42,75,217,0.04) 0%, transparent)  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                       max-w-7xl · px-8 · pt-16 pb-12                                   │ │
│  │                                                                                         │ │
│  │                     How can we help?                                                    │ │
│  │                     [H1] Manrope extrabold · [TEXT] · text-center                       │ │
│  │                     gradient text on "help" → from [PRIMARY] to [PURPLE]                │ │
│  │                                                                                         │ │
│  │   ┌───────────────────────────────────────────────────────────────────────────────┐    │ │
│  │   │  ✦ │  Ask Crystal anything — docs, API, roadmap, status...      Enter ↵      │    │ │
│  │   │[GRAD]│  [MUTED] placeholder · [BODY] · h-14 (56px)              [MUTED] hint │    │ │
│  │   └───────────────────────────────────────────────────────────────────────────────┘    │ │
│  │     [WHITE] bg · rounded-2xl · border 1.5px [PRIMARY]/20 · shadow-lg                   │ │
│  │     Focus: border [PRIMARY] · glow: 0 0 0 3px rgba(42,75,217,0.12)                    │ │
│  │     Sparkle icon ✦ → [GRAD] fill 28px                                                  │ │
│  │                                                                                         │ │
│  │   POPULAR QUERY CHIPS  · mt-4 · flex gap-2 justify-center                              │ │
│  │   ┌─────────────────┐ ┌──────────────────┐ ┌────────────────┐ ┌──────────────────────┐ │ │
│  │   │ How do credits  │ │ Create survey API│ │ Crystal skills │ │ Export CSV timeout   │ │ │
│  │   │ work?           │ │ endpoint         │ │ reference      │ │ fix                  │ │ │
│  │   └─────────────────┘ └──────────────────┘ └────────────────┘ └──────────────────────┘ │ │
│  │   [WHITE] rounded-full border [PRIMARY]/20 [TEXT] [BODY] px-4 py-1.5                   │ │
│  │   Hover: border [PRIMARY] bg [PRIMARY]/5 cursor-pointer                                 │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  QUICK-NAV CARDS  · max-w-7xl px-8 · mt-10                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  4-column grid · gap-5                                                                  │ │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌────────┐ │ │
│  │  │  ◈ Get Started      │  │  { } API Reference  │  │  ✦ Crystal AI       │  │ 🗺  │ │ │
│  │  │                     │  │                     │  │                     │  │ What's │ │ │
│  │  │  [PRIMARY] icon 32px│  │  [TEAL] icon 32px   │  │  [GRAD] icon 32px   │  │ Coming │ │ │
│  │  │                     │  │                     │  │                     │  │        │ │ │
│  │  │  First 30 minutes   │  │  Full REST API,      │  │  13 skills, prompt  │  │ Road-  │ │ │
│  │  │  with Experient.    │  │  schema refs, and   │  │  guide, and action  │  │ map,   │ │ │
│  │  │  Surveys, Crystal,  │  │  code examples for  │  │  proposals.         │  │ sprint │ │ │
│  │  │  and insights.      │  │  all endpoints.     │  │                     │  │ ETA.   │ │ │
│  │  │                     │  │                     │  │                     │  │        │ │ │
│  │  │  Guides →           │  │  API Docs →         │  │  Crystal Docs →     │  │ Road-  │ │ │
│  │  │  [PRIMARY] link     │  │  [TEAL] link        │  │  [PURPLE] link      │  │ map →  │ │ │
│  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  └────────┘ │ │
│  │  [WHITE] rounded-2xl shadow-card p-6                                                    │ │
│  │  Hover: transform translateY(-2px) shadow-lg transition-all 200ms                       │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  PLATFORM STATUS BAR  · max-w-7xl px-8 · mt-8                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [WHITE] rounded-2xl p-4 flex items-center gap-6 shadow-card                           │ │
│  │                                                                                         │ │
│  │  ● All Systems Operational   │  ● API  │  ● CrystalOS  │  ● Survey  │  ● Insights  │  ▸ │ │
│  │  [GREEN] dot 8px [GREEN]      │  [GREEN]│  [GREEN]      │  [GREEN]  │  [GREEN]     │ more│ │
│  │  [BODY] font-semibold         │                                                         │ │
│  │  "Last checked 45s ago" [MUTED] [LABEL]                         View full status →       │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  TWO-COLUMN LOWER SECTION  · max-w-7xl px-8 · mt-8 · grid cols-[2fr_1fr] gap-6             │
│  ┌──────────────────────────────────────────────────┐  ┌──────────────────────────────────┐ │
│  │  JUST SHIPPED                                    │  │  CRYSTAL PANEL (IDLE STATE)      │ │
│  │  [H2] + "Sprint 14" [BADGE] [AMBER]              │  │  [GLASS] card · rounded-2xl      │ │
│  │                                                  │  │                                  │ │
│  │  ┌────────────────────────────────────────────┐  │  │  ✦ Crystal                       │ │
│  │  │  [SHIPPED ✓] [BADGE][GREEN]  Jun 20         │  │  │  [GRAD] text · Manrope bold      │ │
│  │  │  Billing & Credits Engine                  │  │  │                                  │ │
│  │  │  Full credit ledger, Stripe integration,   │  │  │  ┌──────────────────────────┐   │ │
│  │  │  and usage metering are live.              │  │  │  │  Hi! Ask me anything      │   │ │
│  │  │  Read docs →  [PRIMARY]                    │  │  │  │  about Experient. I know  │   │ │
│  │  └────────────────────────────────────────────┘  │  │  │  every doc, every API,    │   │ │
│  │                                                  │  │  │  and your org's data.     │   │ │
│  │  ┌────────────────────────────────────────────┐  │  │  │                           │   │ │
│  │  │  [SHIPPED ✓] [BADGE][GREEN]  Jun 18         │  │  │  └──────────────────────────┘   │ │
│  │  │  Scheduler + 7 Cron Jobs                   │  │  │  [WHITE] rounded-xl p-4           │ │
│  │  │  Automated survey reminders, nightly        │  │  │                                  │ │
│  │  │  insight digests, and ledger rollups.       │  │  │  ┌──────────────────────────┐   │ │
│  │  │  Read docs →  [PRIMARY]                    │  │  │  │  Try: "How do I set up    │   │ │
│  │  └────────────────────────────────────────────┘  │  │  │  Crystal webhooks?"      │   │ │
│  │                                                  │  │  │                           │   │ │
│  │  ┌────────────────────────────────────────────┐  │  │  └──────────────────────────┘   │ │
│  │  │  [SHIPPED ✓] [BADGE][GREEN]  Jun 15         │  │  │  [PRIMARY]/8 bg rounded-xl p-3  │ │
│  │  │  Crystal Skill Runtime v2                  │  │  │  suggested query chip            │ │
│  │  │  SKILL.md + EVALS.md auto-loaded,          │  │  │                                  │ │
│  │  │  output coercion, and action proposals.    │  │  │  Powered by crystal-support v2   │ │
│  │  │  Read docs →  [PRIMARY]                    │  │  │  [MUTED] [LABEL] · text-center   │ │
│  │  └────────────────────────────────────────────┘  │  │                                  │ │
│  │                                                  │  └──────────────────────────────────┘ │
│  │  View all changelog →  [PRIMARY] link            │                                        │
│  └──────────────────────────────────────────────────┘                                        │
│                                                                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 1

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| TopBar | `<header>` fixed | [WHITE] bg, 64px h, `box-shadow: 0 1px 0 rgba(0,0,0,0.06)`, z-index 50 |
| Logo | `<Logo />` | SVG mark + wordmark, Manrope bold, [PRIMARY] |
| "Back to app" link | `<Button variant="ghost">` | [PRIMARY] text, [BODY], no bg, hover [PRIMARY]/8 bg |
| Search icon | `<IconButton>` | Material Symbol `search`, 20px, [MUTED] |
| Hero headline | `<h1>` | [H1] Manrope extrabold, [TEXT], text-center, "help" word uses gradient-text clip |
| Crystal search bar | `<SearchBar>` | [WHITE] bg, h-14, rounded-2xl, border 1.5px [PRIMARY]/20, sparkle icon [GRAD] left, "Enter ↵" hint right [MUTED] |
| Search bar focus | State | border-color → [PRIMARY], box-shadow `0 0 0 3px rgba(42,75,217,0.12)` |
| Popular chips | `<QueryChip>` | [WHITE] bg, border [PRIMARY]/20, rounded-full, px-4 py-1.5, [BODY] [TEXT] |
| Chip hover | State | bg [PRIMARY]/5, border [PRIMARY], cursor-pointer |
| Quick-nav cards | `<NavCard>` | [WHITE] rounded-2xl shadow-card p-6, hover: translateY(-2px) shadow-lg 200ms |
| Card icons | `<Icon>` | 32px, per-card color: [PRIMARY] / [TEAL] / [GRAD] / [AMBER] |
| Status bar | `<StatusBar>` | [WHITE] rounded-2xl p-4, flex row, gap-6 |
| Status dot | `<StatusDot>` | 8px circle, [GREEN]/[AMBER]/[RED] per health |
| Changelog cards | `<ChangelogEntry>` | [WHITE] rounded-2xl p-4 border-l-4 [GREEN] |
| Crystal idle panel | `<CrystalIdlePanel>` | [GLASS] card, [GRAD] icon, suggestion chip [PRIMARY]/8 bg |
| Crystal branding | `<CrystalBrand>` | gradient-text "Crystal", Manrope bold |

### Dimensions (Desktop 1440px)

- Viewport: 1440px
- Content column: max-w-7xl = 1280px, centered, px-8 = 32px each side
- Quick-nav: 4-col grid, each card ~286px wide, gap-5 (20px)
- Two-column lower: `grid-template-columns: 2fr 1fr`, gap-6 (24px), left ~840px, right ~400px
- Hero search bar: full-width within content column, max-w-2xl = 672px, centered

### Interaction Notes

- Clicking any popular query chip auto-fills search bar and submits
- Crystal idle panel animates in on mount: fade-in + translateY(8px → 0) 400ms ease-out
- Status bar dots pulse every 30s on refresh; green dots have `animation: pulse 2s infinite` at low opacity
- Quick-nav card hover triggers `box-shadow` upgrade and `transform: translateY(-2px)` with `transition: all 200ms ease`
- "Back to app" link opens the main app in same tab; clicking the Experient logo goes to `/`

---

## Screen 2: Support Site Homepage (Mobile 390px)

### Overview

The mobile layout collapses the 4-column quick-nav to a 2×2 grid, replaces the horizontal status bar with a condensed pill, and swaps the two-column lower section to a single stacked column. A bottom tab nav replaces the TopBar links.

### Wireframe

```
┌─────────────────────────────────────────┐
│  TOPBAR · 56px · [WHITE] · shadow       │
│  ┌─────────────────────────────────────┐ │
│  │  ▣ Experient logo     🔍  ···       │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  HERO · px-4 pt-10 pb-8 · [BG]           │
│  ┌─────────────────────────────────────┐ │
│  │                                     │ │
│  │      How can we help?               │ │
│  │      [H1] 1.5rem text-center        │ │
│  │      gradient on "help"             │ │
│  │                                     │ │
│  │  ┌─────────────────────────────┐    │ │
│  │  │ ✦  Ask Crystal...  Enter↵   │    │ │
│  │  │ h-12 rounded-2xl border     │    │ │
│  │  └─────────────────────────────┘    │ │
│  │                                     │ │
│  │  QUERY CHIPS · scroll-x hidden      │ │
│  │  ┌──────────┐ ┌─────────────┐       │ │
│  │  │ Credits? │ │ Create API  │ ···   │ │
│  │  └──────────┘ └─────────────┘       │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  STATUS PILL · px-4 · mt-4               │
│  ┌─────────────────────────────────────┐ │
│  │  ● All Systems Operational  ›       │ │
│  │  [GREEN] · rounded-full · [WHITE]   │ │
│  │  border · px-4 py-2 · full-width    │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  QUICK-NAV GRID · px-4 mt-4             │
│  ┌───────────────────┐ ┌───────────────┐ │
│  │  ◈ Get Started    │ │ {} API Ref    │ │
│  │  [PRIMARY] icon   │ │ [TEAL] icon   │ │
│  │  [BODY] desc      │ │ [BODY] desc   │ │
│  │  Guides →         │ │ API Docs →    │ │
│  └───────────────────┘ └───────────────┘ │
│  ┌───────────────────┐ ┌───────────────┐ │
│  │  ✦ Crystal AI     │ │ 🗺 Coming     │ │
│  │  [PURPLE] icon    │ │ [AMBER] icon  │ │
│  │  [BODY] desc      │ │ [BODY] desc   │ │
│  │  Crystal Docs →   │ │ Roadmap →     │ │
│  └───────────────────┘ └───────────────┘ │
│  [WHITE] rounded-2xl shadow-card p-4     │
│  2-col grid gap-3                         │
│                                           │
│  JUST SHIPPED · px-4 mt-6               │
│  [H2] + Sprint 14 badge [AMBER]          │
│  ┌─────────────────────────────────────┐ │
│  │  [SHIPPED ✓][GREEN] Jun 20          │ │
│  │  Billing & Credits Engine           │ │
│  │  Full credit ledger...              │ │
│  │  Read docs →                        │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │  [SHIPPED ✓][GREEN] Jun 18          │ │
│  │  Scheduler + 7 Cron Jobs            │ │
│  │  Automated survey reminders...      │ │
│  │  Read docs →                        │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  CRYSTAL PANEL · px-4 mt-4 mb-24         │
│  ┌─────────────────────────────────────┐ │
│  │  [GLASS] rounded-2xl p-4            │ │
│  │  ✦ Crystal — ready to help          │ │
│  │  "Ask me anything..."               │ │
│  │  [PRIMARY]/8 suggestion chip        │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  BOTTOM TAB NAV · fixed bottom · 64px    │
│  ┌─────────────────────────────────────┐ │
│  │  ◉ Home   🔍 Search  ✦ Crystal  ···  │ │
│  │  [PRIMARY]  [MUTED]  [MUTED]  [MUTED]│ │
│  │  Active: [PRIMARY] + dot indicator  │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Legend — Screen 2

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| TopBar mobile | `<header>` | [WHITE], 56px h (reduced from desktop 64px), `···` opens sheet menu |
| Query chips | `<ScrollChips>` | Single horizontal row, `overflow-x: auto`, `scrollbar-none`, touch-scroll |
| Status pill | `<StatusPill>` | Full-width, rounded-full, [WHITE] border, chevron opens status page |
| Quick-nav grid | `<NavGrid>` | `grid-cols-2`, gap-3 (12px), each card p-4 (reduced from p-6) |
| Bottom tab nav | `<BottomNav>` | Fixed bottom 0, h-16, [WHITE] bg, border-top 1px [BG] darker |
| Active tab | State | [PRIMARY] icon + label, active dot 4px circle below icon |
| Crystal panel mobile | `<CrystalPanel>` | Full width, [GLASS], mb-24 to clear bottom nav |

### Dimensions (Mobile 390px)

- Viewport: 390px
- Content padding: px-4 = 16px each side, effective width 358px
- Quick-nav cards: 2-col grid, each card ~171px wide
- Search bar: full-width 358px, h-12 (48px, reduced from desktop 56px)
- Bottom nav: 64px, 4 tabs at equal width ~97px each

### Interaction Notes

- Query chips row scrolls horizontally with momentum; no scrollbar visible (`scrollbar-none`)
- Status pill tap navigates to `/status`
- Bottom nav tabs use `<NavLink>` with active state detection
- Crystal panel taps open the Crystal support overlay sheet (full-screen on mobile)
- `···` in TopBar opens a `<Sheet>` from the right with full site navigation

---

## Screen 3: Search Results / Crystal Response Page

### Overview

The search results page activates when a user submits a query from the homepage search bar or the `/search` route. It shows the query in an active search bar at top, then splits into a 65/35 two-column layout: ranked doc results on the left, Crystal's synthesized answer on the right.

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  TOPBAR [WHITE] 64px fixed                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  ▣ Experient        ┌─────────────────────────────────────────────┐   🔍  Back to app  │ │
│  │                     │ ✦  How do credits work?              ✕  ↵   │                     │ │
│  │                     └─────────────────────────────────────────────┘                     │ │
│  │                     Active state: border [PRIMARY], glow ring                           │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  RESULTS AREA · max-w-7xl px-8 · mt-24 (below fixed topbar)                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  Results for "How do credits work?"   ·  4 results  ·  0.34s                           │ │
│  │  [MUTED] [BODY]                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  TWO-COLUMN LAYOUT · grid cols-[65%_35%] gap-8                                               │
│  ┌──────────────────────────────────────────────────┐  ┌──────────────────────────────────┐ │
│  │  DOC RESULTS (65% = ~832px)                      │  │  CRYSTAL ANSWER (35% = ~448px)   │ │
│  │                                                  │  │                                  │ │
│  │  RESULT CARD 1 — score 0.97                      │  │  ┌──────────────────────────────┐│ │
│  │  ┌────────────────────────────────────────────┐  │  │  │  GRADIENT HEADER BAR         ││ │
│  │  │  [BILLING] [BADGE][PRIMARY]  Guides         │  │  │  │  [GRAD] bg · p-4 · rounded  ││ │
│  │  │                                            │  │  │  │  ✦ Crystal [WHITE] Manrope   ││ │
│  │  │  Credits & Billing Guide                   │  │  │  │  bold · "AI Answer"          ││ │
│  │  │  [H2] [TEXT] Manrope                       │  │  │  └──────────────────────────────┘│ │
│  │  │                                            │  │  │  rounded-t-2xl                   │ │
│  │  │  Experient uses a credit-based model.       │  │  │                                  │ │
│  │  │  Each Crystal action, AI insight, and       │  │  │  ┌──────────────────────────────┐│ │
│  │  │  automated workflow run consumes credits    │  │  │  │  [WHITE] rounded-b-2xl p-5   ││ │
│  │  │  from your monthly allowance...             │  │  │  │  shadow-card                 ││ │
│  │  │  [BODY] [MUTED] line-clamp-3               │  │  │  │                              ││ │
│  │  │                                            │  │  │  │  Credits are Experient's      ││ │
│  │  │  Relevance ████████████░░  97%             │  │  │  │  internal currency. Your org  ││ │
│  │  │  [PRIMARY] progress [LABEL]                │  │  │  │  gets a monthly allowance     ││ │
│  │  │                          Read more →       │  │  │  │  based on plan tier, plus     ││ │
│  │  └────────────────────────────────────────────┘  │  │  │  top-up packs if you need    ││ │
│  │  [WHITE] rounded-2xl shadow-card p-6             │  │  │  more.                        ││ │
│  │  Hover: shadow-lg border [PRIMARY]/20            │  │  │                              ││ │
│  │                                                  │  │  │  [¹] credits are deducted     ││ │
│  │  RESULT CARD 2 — score 0.91                      │  │  │  per-event, not per-session.  ││ │
│  │  ┌────────────────────────────────────────────┐  │  │  │  [²] Monthly allowance resets ││ │
│  │  │  [API] [BADGE][TEAL]  API Reference         │  │  │  │  on billing cycle date.       ││ │
│  │  │                                            │  │  │  │  [³] Pack credits never expire││ │
│  │  │  GET /api/billing/balance                  │  │  │  │                              ││ │
│  │  │  [H2] [TEXT]                               │  │  │  │  CITATION CHIPS              ││ │
│  │  │                                            │  │  │  │  ┌──────┐ ┌──────┐ ┌──────┐ ││ │
│  │  │  Returns the current credit balance for   │  │  │  │  │ [¹]  │ │ [²]  │ │ [³]  │ ││ │
│  │  │  the authenticated org including monthly  │  │  │  │  └──────┘ └──────┘ └──────┘ ││ │
│  │  │  allowance and pack balances...            │  │  │  │  [PRIMARY]/10 bg rounded-lg  ││ │
│  │  │  [BODY] [MUTED] line-clamp-3              │  │  │  │  [PRIMARY] text [LABEL]       ││ │
│  │  │                                            │  │  │  │                              ││ │
│  │  │  Relevance ██████████░░░  91%             │  │  │  │  FOLLOW-UP CHIPS             ││ │
│  │  │                          Read more →       │  │  │  │  ┌───────────────────────┐   ││ │
│  │  └────────────────────────────────────────────┘  │  │  │  │ How do I top up credits│  ││ │
│  │                                                  │  │  │  └───────────────────────┘   ││ │
│  │  RESULT CARD 3 — score 0.88                      │  │  │  ┌───────────────────────┐   ││ │
│  │  ┌────────────────────────────────────────────┐  │  │  │  │ What's the credit cost│   ││ │
│  │  │  [BILLING] [BADGE][PRIMARY]  Guides         │  │  │  │  │ per Crystal action?  │   ││ │
│  │  │                                            │  │  │  │  └───────────────────────┘   ││ │
│  │  │  Credit Plans & Pricing Tiers              │  │  │  │  [WHITE] border rounded-xl   ││ │
│  │  │  [H2] [TEXT]                               │  │  │  │  hover: border [PRIMARY]     ││ │
│  │  │                                            │  │  │  │                              ││ │
│  │  │  Starter: 2,000 cr/mo · Growth: 10,000 cr  │  │  │  │  WAS THIS HELPFUL?          ││ │
│  │  │  Business: 50,000 cr · Enterprise: custom  │  │  │  │  ┌────────┐  ┌────────────┐ ││ │
│  │  │  Relevance ████████░░░░  88%              │  │  │  │  │  👍     │  │  👎         │ ││ │
│  │  │                          Read more →       │  │  │  │  └────────┘  └────────────┘ ││ │
│  │  └────────────────────────────────────────────┘  │  │  │  [MUTED] [LABEL]             ││ │
│  │                                                  │  │  └──────────────────────────────┘│ │
│  │  RESULT CARD 4 — score 0.82                      │  │                                  │ │
│  │  ┌────────────────────────────────────────────┐  │  │  Crystal is reading 4 docs       │ │
│  │  │  [CHANGELOG] [BADGE][AMBER]  Changelog     │  │  │  [MUTED] [LABEL] · text-center   │ │
│  │  │  Billing Engine v1 — Jun 20, 2026          │  │  │  mt-3                            │ │
│  │  │  [H2] [TEXT]                               │  │  │                                  │ │
│  │  │  What shipped: Stripe integration, credit  │  │  │                                  │ │
│  │  │  ledger, Paddle fallback, webhook handler  │  │  │                                  │ │
│  │  │  Relevance ████████░░░░  82%              │  │  │                                  │ │
│  │  │                          Read more →       │  │  │                                  │ │
│  │  └────────────────────────────────────────────┘  │  │                                  │ │
│  └──────────────────────────────────────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 3

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| Search bar (active) | `<SearchBar active>` | border [PRIMARY], glow `0 0 0 3px rgba(42,75,217,0.12)`, ✕ clear icon appears |
| Results meta | `<ResultsMeta>` | [MUTED] [BODY], "N results · Xs" format |
| Doc result card | `<DocResultCard>` | [WHITE] rounded-2xl shadow-card p-6, hover: shadow-lg + border [PRIMARY]/20 |
| Category badge | `<Badge variant="category">` | [BADGE] typography, color per category: API=[TEAL], Billing=[PRIMARY], Changelog=[AMBER] |
| Relevance bar | `<RelevanceBar>` | [PRIMARY] fill, [BG] track, h-1.5 rounded-full, [LABEL] percentage |
| "Read more →" | `<Link>` | [PRIMARY] text, [BODY], hover: underline |
| Crystal answer panel | `<CrystalAnswerPanel>` | gradient header [GRAD], body [WHITE], combined: shadow-card rounded-2xl |
| Citation chips | `<CitationChip>` | [PRIMARY]/10 bg, [PRIMARY] text, [LABEL], rounded-lg, superscript-style |
| Follow-up chips | `<FollowUpChip>` | [WHITE] bg, border 1px [PRIMARY]/20, [BODY], rounded-xl, hover: border [PRIMARY] |
| Helpful feedback | `<HelpfulFeedback>` | 👍/👎 buttons, [WHITE] bg, border, hover: respective positive/negative color fill |

### Dimensions (Desktop 1440px)

- Left column (doc results): 65% = ~832px
- Right column (Crystal panel): 35% = ~448px
- Gap between columns: 32px (gap-8)
- Result cards: full-width of left column, stacked with gap-4 (16px)
- Crystal panel: sticky top-24 so it stays visible while scrolling results

### Interaction Notes

- Crystal panel header "AI Answer" pulses a subtle gradient animation while streaming
- Citation chips `[¹]` etc. are clickable: hover shows tooltip with source doc title, click scrolls to matching result card on the left
- Follow-up chips click → auto-fill search bar and submit new query
- "Was this helpful?" thumbs record explicit Crystal feedback via `POST /api/support/crystal-feedback`
- Result cards animate in staggered: each card delays 50ms × index, fade-in + translateY(8px → 0)

---

## Screen 4: Doc Article Page — "Create Survey (POST /api/surveys)"

### Overview

The article page is the canonical reading surface for API reference and guide content. It has a fixed right sidebar for in-page navigation, a breadcrumb trail, a tabbed content area, and a doc feedback footer.

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  TOPBAR [WHITE] 64px fixed                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  ▣ Experient                ┌──────────────────────────────┐      🔍  Back to app       │ │
│  │                             │ ✦  Search docs...            │                             │ │
│  │                             └──────────────────────────────┘                             │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  BREADCRUMB · max-w-7xl px-8 · mt-20 (below fixed topbar)                                   │
│  Support  /  API Reference  /  Surveys  /  Create Survey                                    │
│  [MUTED] [BODY] · separator "/" [MUTED] lighter · last crumb [TEXT] font-medium             │
│                                                                                               │
│  ARTICLE LAYOUT · max-w-7xl px-8 · grid cols-[1fr_240px] gap-8 · mt-6                      │
│  ┌──────────────────────────────────────────────────────────────┐  ┌──────────────────────┐ │
│  │  MAIN CONTENT AREA (~960px)                                  │  │  RIGHT SIDEBAR 240px  │ │
│  │                                                              │  │                       │ │
│  │  POST /api/surveys                    [STABLE] [BADGE][GREEN]│  │  ON THIS PAGE         │ │
│  │  Create Survey                                               │  │  [LABEL] [MUTED]      │ │
│  │  [H1] Manrope extrabold [TEXT] · badge inline-flex mt-1      │  │                       │ │
│  │                                                              │  │  · Overview           │ │
│  │  Creates a new survey for the authenticated organization.    │  │  · Parameters         │ │
│  │  [BODY] [MUTED] mt-2                                         │  │  · Request body       │ │
│  │                                                              │  │  · Response           │ │
│  │  TAB BAR · mt-6 border-b 1px [BG]darker                     │  │  · Errors             │ │
│  │  ┌──────────┬────────────┬──────────┬────────┬─────────────┐ │  │  · Code examples      │ │
│  │  │ Overview │ Parameters │ Response │ Errors │Code Examples│ │  │                       │ │
│  │  └──────────┴────────────┴──────────┴────────┴─────────────┘ │  │  [PRIMARY] active dot │ │
│  │  Active: [PRIMARY] underline 2px bottom · Manrope font-semibold│  │  · on current section │ │
│  │  Inactive: [MUTED] · hover [TEXT] · transition-colors 150ms  │  │                       │ │
│  │                                                              │  │  ┌───────────────────┐ │ │
│  │  TAB CONTENT: Parameters (active)                            │  │  │  ✦ Ask Crystal    │ │ │
│  │  ┌──────────────────────────────────────────────────────┐   │  │  │  about this page  │ │ │
│  │  │  PARAMETERS TABLE                                    │   │  │  │                   │ │ │
│  │  │  ┌──────────┬──────────┬──────────┬───────────────┐  │   │  │  │  [GRAD] bg button │ │ │
│  │  │  │ Field    │ Type     │ Required │ Description   │  │   │  │  │  rounded-xl h-10  │ │ │
│  │  │  ├──────────┼──────────┼──────────┼───────────────┤  │   │  │  │  px-4 text-center │ │ │
│  │  │  │ title    │ string   │  ✓ Yes   │ Survey title. │  │   │  │  │  [WHITE] text     │ │ │
│  │  │  │          │          │[GREEN]   │ Max 120 chars │  │   │  │  │  [BODY] font-bold │ │ │
│  │  │  ├──────────┼──────────┼──────────┼───────────────┤  │   │  │  └───────────────────┘ │ │
│  │  │  │ questions│ array    │  ✓ Yes   │ Array of      │  │   │  │  Hover: opacity 0.9   │ │
│  │  │  │          │          │[GREEN]   │ question obj. │  │   │  │  Click: opens Crystal │ │
│  │  │  │          │          │          │ See schema →  │  │   │  │  panel in support mode│ │
│  │  │  ├──────────┼──────────┼──────────┼───────────────┤  │   │  │  pre-seeded with page │ │
│  │  │  │ settings │ object   │  ○ No    │ Survey config │  │   │  │  context              │ │
│  │  │  │          │          │[MUTED]   │ (anonymize,   │  │   │  │                       │ │
│  │  │  │          │          │          │ max responses)│  │   │  └───────────────────────┘ │
│  │  │  └──────────┴──────────┴──────────┴───────────────┘  │   │                           │ │
│  │  │  Table: [WHITE] bg, border 1px [BG]darker, rounded-xl │   │                           │ │
│  │  │  Header row: [BG] bg, [LABEL] [MUTED]                 │   │                           │ │
│  │  │  Body rows: [WHITE] bg, alternate [BG]/20 on hover    │   │                           │ │
│  │  └──────────────────────────────────────────────────────┘   │  │                           │
│  │                                                              │  │                           │
│  │  CODE EXAMPLE PANEL · mt-6                                   │  │                           │
│  │  ┌──────────────────────────────────────────────────────┐   │  │                           │
│  │  │  LANG TABS  ┌───────┐ ┌─────────┐ ┌────────┐         │   │  │                           │
│  │  │             │ curl  │ │Node.js  │ │ Python │         │   │  │                           │
│  │  │             └───────┘ └─────────┘ └────────┘         │   │  │                           │
│  │  │  [#1a1b26] dark bg · rounded-2xl p-0                  │   │  │                           │
│  │  │  Tabs: px-4 py-2 h-10 [#1a1b26] bg top strip        │   │  │                           │
│  │  │  Active lang tab: [WHITE]/10 bg border-b 2px [GRAD]  │   │  │                           │
│  │  │                                                       │   │  │                           │
│  │  │  CODE BODY · p-5 · font-mono 0.8rem                  │   │  │                           │
│  │  │  ┌───────────────────────────────────────────────┐   │   │  │                           │
│  │  │  │  [#7aa2f7]curl [#c0caf5]-X POST \             │   │   │  │                           │
│  │  │  │    [#9ece6a]https://api.experient.ai          │   │   │  │                           │
│  │  │  │    [#c0caf5]/api/surveys \                    │   │   │  │                           │
│  │  │  │    [#7aa2f7]-H [#9ece6a]"Authorization:       │   │   │  │                           │
│  │  │  │       Bearer YOUR_KEY" \                      │   │   │  │                           │
│  │  │  │    [#7aa2f7]-d [#e0af68]'{"title":"Q2 NPS",' │   │   │  │                           │
│  │  │  │    [#e0af68]"questions":[...]}'               │   │   │  │                           │
│  │  │  └───────────────────────────────────────────────┘   │   │  │                           │
│  │  │  [#c0caf5] default text · syntax: tokyo-night theme  │   │  │                           │
│  │  │  📋 Copy button top-right: [WHITE]/10 bg rounded-lg  │   │  │                           │
│  │  └──────────────────────────────────────────────────────┘   │  │                           │
│  │                                                              │  │                           │
│  │  DOC FEEDBACK FOOTER · mt-10 pt-6 border-t 1px [BG]darker  │  │                           │
│  │  ┌──────────────────────────────────────────────────────┐   │  │                           │
│  │  │  Was this page helpful?   👍 Yes   👎 No              │   │  │                           │
│  │  │  [BODY] [MUTED]         [WHITE] border rounded-xl h-9 │   │  │                           │
│  │  │  px-4 gap-2                                          │   │  │                           │
│  │  │                                                       │   │  │                           │
│  │  │  🤖 Auto-generated from source code · Last updated   │   │  │                           │
│  │  │  3 minutes ago                                       │   │  │                           │
│  │  │  [MUTED] [LABEL] · flex items-center gap-1           │   │  │                           │
│  │  └──────────────────────────────────────────────────────┘   │  │                           │
│  └──────────────────────────────────────────────────────────────┘  └───────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 4

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| Breadcrumb | `<Breadcrumb>` | [MUTED] [BODY], "/" separators, last item [TEXT] font-medium |
| Article title | `<h1>` | [H1] Manrope extrabold, inline [STABLE] badge [GREEN] |
| [STABLE] badge | `<Badge variant="stable">` | [GREEN] bg/10, [GREEN] text, [BADGE] typography |
| Tab bar | `<DocTabs>` | border-b 1px, active: [PRIMARY] 2px underline + Manrope semibold |
| Parameters table | `<ParamsTable>` | [WHITE] bg, rounded-xl, border, header [BG] [LABEL] |
| Required indicator | `<RequiredBadge>` | "✓ Yes" [GREEN], "○ No" [MUTED] |
| Code panel | `<CodePanel>` | `bg: #1a1b26` (tokyo-night), rounded-2xl, overflow hidden |
| Lang tabs | `<LangTab>` | `bg: #1a1b26`, active: [WHITE]/10 + [GRAD] 2px border-bottom |
| Syntax colors | Tokyo-night | keywords [#7aa2f7], strings [#9ece6a], literals [#e0af68], default [#c0caf5] |
| Copy button | `<CopyBtn>` | [WHITE]/10 bg, rounded-lg, absolute top-right of code body |
| Right sidebar | `<DocSidebar>` | 240px fixed-width, sticky top-24 |
| "On this page" | `<AnchorNav>` | [LABEL] header, [MUTED] links, active: [PRIMARY] with 3px left dot |
| "Ask Crystal" button | `<Button variant="gradient">` | [GRAD] bg, [WHITE] text, rounded-xl h-10, full-width in sidebar |
| Feedback buttons | `<DocFeedback>` | [WHITE] bg, border 1px, rounded-xl h-9 px-4, hover: relevant color fill |
| Auto-generated label | `<AutoGenLabel>` | 🤖 icon + [MUTED] [LABEL] text, italic |

### Dimensions

- Main content: flexible, ~960px at 1440px viewport
- Right sidebar: 240px fixed, sticky top-24 (96px from top, below topbar)
- Table columns: Field 140px, Type 100px, Required 90px, Description flex-1
- Code panel: full-width of main content, min-h-48

### Interaction Notes

- Tab switching: content animates in with fade-in 150ms, no page reload
- Anchor nav items highlight as user scrolls: `IntersectionObserver` on section headers
- "Ask Crystal about this page" passes `{ pageTitle, pageUrl, currentTab }` to Crystal panel
- 👍/👎 feedback records to `POST /api/support/doc-feedback` with page slug + rating
- Copy button: copies code to clipboard, icon briefly becomes checkmark ✓ for 1.5s
- Code panel lang tabs are keyboard-accessible with arrow keys

---

## Screen 5: Crystal Support Conversation (In-App Panel)

### Overview

This is the Crystal panel rendered in "Support mode" inside the main Experient app. It appears as a right-side slide-over panel, distinct from the Analyst mode panel by its amber mode pill and support-focused UI patterns.

### Wireframe

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│  MAIN APP  (blurred/dimmed underlying content)                                             │
│  ┌─────────────────────────────────────────────────────────────────┐  ┌───────────────┐  │
│  │  App content (surveys, dashboard, etc.)                         │  │ CRYSTAL PANEL │  │
│  │  opacity 0.4 when panel open                                    │  │               │  │
│  └─────────────────────────────────────────────────────────────────┘  │  400px wide   │  │
│                                                                        │  h-full fixed │  │
│                                                                        │  right-0 top-0│  │
│                                                                        │               │  │
│                                                          PANEL BELOW ▼                   │
└───────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ CRYSTAL SUPPORT PANEL  [WHITE] bg · 400px · h-screen fixed     │
│ right-0 top-0 · shadow-2xl · z-50                              │
│ slide-in from right: translateX(100% → 0) 300ms ease-out       │
│                                                                │
│  PANEL HEADER  · p-4 border-b 1px [BG]darker                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ✦ Crystal                                        ⤢  ✕  │  │
│  │  Manrope bold [TEXT]              expand   close icon     │  │
│  │  [GRAD] sparkle icon 20px         icon     [MUTED] 20px   │  │
│  │                                                           │  │
│  │  ┌────────────────────┐  ┌──────────────────────────┐    │  │
│  │  │ [Analyst mode]     │  │ [Support mode]           │    │  │
│  │  │ [PRIMARY] bg/10    │  │ [AMBER] bg/15            │    │  │
│  │  │ [PRIMARY] text     │  │ [AMBER] text             │    │  │
│  │  │ [BADGE] rounded-full│  │ [BADGE] rounded-full    │    │  │
│  │  └────────────────────┘  └──────────────────────────┘    │  │
│  │  Mode pills are clickable to switch between modes         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  MESSAGE THREAD  · flex-1 overflow-y-auto · p-4 · gap-4        │
│                                                                │
│  TURN 1 — User message                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                        USER BUBBLE (right-aligned)       │  │
│  │                     ┌──────────────────────────────────┐ │  │
│  │                     │  Why is my CSV export timing out? │ │  │
│  │                     └──────────────────────────────────┘ │  │
│  │                     [PRIMARY] bg · [WHITE] text · [BODY]  │  │
│  │                     rounded-2xl rounded-tr-sm · px-4 py-3 │  │
│  │                     max-w-[85%] ml-auto                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  TURN 2 — Crystal (investigating state)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ✦                                                       │  │
│  │  [GRAD] avatar circle 32px                               │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  TOOL CALL INDICATOR                               │  │  │
│  │  │  ┌────────────────────────────────────────────┐   │  │  │
│  │  │  │  ⟳ Checking known issues...  [spinner]     │   │  │  │
│  │  │  └────────────────────────────────────────────┘   │  │  │
│  │  │  [BG] bg · rounded-xl p-3 · border 1px [BG]darker │  │  │
│  │  │  ⟳ icon: [PRIMARY] rotating animation 1s linear   │  │  │
│  │  │  text: [MUTED] [BODY] italic                       │  │  │
│  │  │                                                    │  │  │
│  │  │  Also: "Searching support docs..."  (queued)       │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  rounded-2xl rounded-tl-sm max-w-[90%]                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  TURN 3 — Crystal (resolved state)                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ✦                                                       │  │
│  │  [GRAD] avatar 32px                                      │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  [WHITE] bubble · rounded-2xl rounded-tl-sm       │  │  │
│  │  │  border 1px [BG]darker · p-4 · shadow-sm          │  │  │
│  │  │                                                    │  │  │
│  │  │  Your CSV export is hitting the 30-second         │  │  │
│  │  │  gateway timeout. This is a known issue when      │  │  │
│  │  │  exporting surveys with >10,000 responses.        │  │  │
│  │  │  [BODY] [TEXT]                                     │  │  │
│  │  │                                                    │  │  │
│  │  │  KNOWN ISSUE CARD (embedded)                       │  │  │
│  │  │  ┌──────────────────────────────────────────────┐ │  │  │
│  │  │  │  ⚠ Known Issue · EXPORTS                     │ │  │  │
│  │  │  │  [AMBER]/10 bg · border-l-4 [AMBER] · p-3   │ │  │  │
│  │  │  │  rounded-xl                                  │ │  │  │
│  │  │  │                                              │ │  │  │
│  │  │  │  CSV timeout on large exports (>10K rows)   │ │  │  │
│  │  │  │  Status: In fix queue · ETA Sprint 15        │ │  │  │
│  │  │  │  [LABEL] [AMBER]                             │ │  │  │
│  │  │  └──────────────────────────────────────────────┘ │  │  │
│  │  │                                                    │  │  │
│  │  │  WORKAROUND (highlighted)                         │  │  │
│  │  │  ┌──────────────────────────────────────────────┐ │  │  │
│  │  │  │  ✓ Workaround                                │ │  │  │
│  │  │  │  [GREEN]/8 bg · border-l-4 [GREEN] · p-3    │ │  │  │
│  │  │  │  rounded-xl                                  │ │  │  │
│  │  │  │                                              │ │  │  │
│  │  │  │  Use the paginated export API endpoint:     │ │  │  │
│  │  │  │  GET /api/exports/csv?page=1&limit=1000      │ │  │  │
│  │  │  │  Fetch pages and stitch client-side.         │ │  │  │
│  │  │  └──────────────────────────────────────────────┘ │  │  │
│  │  │                                                    │  │  │
│  │  │  DOC LINK CHIP                                     │  │  │
│  │  │  ┌────────────────────────────────────────────┐   │  │  │
│  │  │  │  📄 Exports API Reference  →               │   │  │  │
│  │  │  └────────────────────────────────────────────┘   │  │  │
│  │  │  [PRIMARY]/8 bg · [PRIMARY] text · rounded-lg     │  │  │
│  │  │  border 1px [PRIMARY]/20 · [BODY] font-medium     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  RESOLUTION FEEDBACK  · p-4 border-t 1px [BG]darker           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ┌────────────────────┐  ┌───────────────────────────┐   │  │
│  │  │  👍 Resolved        │  │  👎 Still stuck            │   │  │
│  │  └────────────────────┘  └───────────────────────────┘   │  │
│  │  [WHITE] bg · border · rounded-xl h-9 px-4               │  │
│  │  👍 hover: [GREEN]/10 bg · border [GREEN]                 │  │
│  │  👎 hover: [RED]/10 bg · border [RED]                     │  │
│  │  Both: [BODY] [TEXT] font-medium                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  INPUT BAR  · p-3 border-t 1px [BG]darker                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ 🎤 │  Follow up...                            ▶   │  │  │
│  │  │ mic│  [MUTED] placeholder · [BODY]            send │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  [WHITE] bg · rounded-xl · border 1px [BG]darker          │  │
│  │  Focus: border [PRIMARY] · glow ring                      │  │
│  │  Send ▶: [GRAD] bg when input non-empty · [MUTED] when empty│
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 5

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| Panel container | `<CrystalPanel mode="support">` | 400px wide, h-screen, fixed right-0 top-0, shadow-2xl, z-50 |
| Panel slide-in | Animation | `translateX(100% → 0)` 300ms cubic-bezier(0.16, 1, 0.3, 1) |
| Expand icon ⤢ | `<IconButton>` | Material Symbol `open_in_full`, opens panel to 640px or full-screen |
| Mode pills | `<ModePill>` | [Analyst mode]: [PRIMARY]/10 bg + [PRIMARY] text; [Support mode]: [AMBER]/15 bg + [AMBER] text |
| User bubble | `<UserBubble>` | [PRIMARY] bg, [WHITE] text, rounded-2xl rounded-tr-sm, max-w-[85%] ml-auto |
| Crystal avatar | `<CrystalAvatar>` | 32px circle, [GRAD] bg, white ✦ sparkle icon |
| Tool call indicator | `<ToolCallCard>` | [BG] bg, rounded-xl p-3, border, rotating ⟳ [PRIMARY], italic [MUTED] [BODY] |
| Crystal bubble | `<CrystalBubble>` | [WHITE] bg, rounded-2xl rounded-tl-sm, border, shadow-sm |
| Known issue card | `<KnownIssueCard>` | [AMBER]/10 bg, border-l-4 [AMBER], rounded-xl p-3 embedded |
| Workaround card | `<WorkaroundCard>` | [GREEN]/8 bg, border-l-4 [GREEN], rounded-xl p-3 embedded |
| Doc link chip | `<DocLinkChip>` | [PRIMARY]/8 bg, [PRIMARY] text, border [PRIMARY]/20, rounded-lg |
| Resolution row | `<ResolutionFeedback>` | Two buttons: 👍 Resolved (hover [GREEN]), 👎 Still stuck (hover [RED]) |
| Input bar | `<CrystalInput>` | [WHITE] bg, rounded-xl, mic icon left, send button right |
| Send button active | State | [GRAD] bg when `input.length > 0`, [MUTED] bg when empty |

### Dimensions

- Panel width: 400px default, 640px expanded, 100vw on mobile
- Panel header: 64px h
- Message thread: flex-1, overflow-y-auto, max-h = `100vh - 64px - 56px - 60px`
- Resolution row: 56px h
- Input bar: 60px h
- Crystal avatar: 32px circle

### Interaction Notes

- Mode pill click: switches Crystal to analyst mode and closes support context; confirmation toast "Switching to Analyst mode"
- Tool call indicator: each tool call appears as a new chip, completed ones show ✓ checkmark
- Known issue card "ETA Sprint 15" links to the roadmap page for that sprint
- Doc link chip opens the referenced doc in a new tab (support site)
- 👍 Resolved: sends feedback, shows success toast "Glad that helped!", panel auto-minimizes after 2s
- 👎 Still stuck: expands to show "Would you like to open a support ticket?" confirmation
- Input bar mic icon: activates browser speech recognition (experimental)

---

## Screen 6: What's Coming / Roadmap Page

### Overview

The roadmap page is a live, auto-generated feed of shipping status. It is divided into four sections from most-recent to most-future: Just Shipped, Building Now, Up Next, On the Horizon. A filter bar lets users narrow by category.

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  TOPBAR [WHITE] 64px                                                                         │
│                                                                                               │
│  PAGE HEADER · max-w-7xl px-8 · mt-20                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  What's Coming                                                                          │ │
│  │  [H1] Manrope extrabold [TEXT]                                                          │ │
│  │                                                                                         │ │
│  │  ┌───────────────────────────────────────┐                                             │ │
│  │  │  ● Live · Updated 3 min ago           │                                             │ │
│  │  └───────────────────────────────────────┘                                             │ │
│  │  [GREEN] dot 8px · [WHITE] bg · border · rounded-full · px-3 py-1 · [BODY] [MUTED]    │ │
│  │  dot pulses every 60s when live data refreshes                                          │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  FILTER CHIPS · max-w-7xl px-8 · mt-4 · flex gap-2                                         │
│  ┌──────┐ ┌──────────┐ ┌─────────┐ ┌────────────┐ ┌─────┐ ┌──────┐                        │
│  │  All │ │ Features │ │ Crystal │ │ Enterprise │ │ API │ │Fixes │                        │
│  └──────┘ └──────────┘ └─────────┘ └────────────┘ └─────┘ └──────┘                        │
│  Active: [PRIMARY] bg, [WHITE] text, rounded-full px-4 py-1.5                               │
│  Inactive: [WHITE] bg, border, [TEXT], rounded-full, hover [PRIMARY]/5                      │
│                                                                                               │
│  SECTION 1: JUST SHIPPED · max-w-7xl px-8 · mt-8                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [H2] Just Shipped  ·  Sprint 14                                                        │ │
│  │                                                                                         │ │
│  │  2-col grid · gap-5                                                                     │ │
│  │  ┌───────────────────────────────────────────┐  ┌───────────────────────────────────┐  │ │
│  │  │  [SHIPPED ✓] [BADGE][GREEN]  Jun 20        │  │  [SHIPPED ✓] [BADGE][GREEN] Jun 18│  │ │
│  │  │  Sprint 14 · Enterprise RBAC              │  │  Sprint 14 · Billing Engine       │  │ │
│  │  │  [LABEL] [MUTED]                          │  │  [LABEL] [MUTED]                  │  │ │
│  │  │                                           │  │                                   │  │ │
│  │  │  Custom Roles & Org-Level Permissions     │  │  Credits, Stripe & Metering       │  │ │
│  │  │  [H2] Manrope extrabold [TEXT]            │  │  [H2] Manrope extrabold [TEXT]    │  │ │
│  │  │                                           │  │                                   │  │ │
│  │  │  Full RBAC with custom roles, resource-   │  │  Complete credit ledger, Stripe   │  │ │
│  │  │  level scoping, and invite flows for      │  │  integration, usage metering, and │  │ │
│  │  │  all permission levels.                   │  │  billing webhook handlers.        │  │ │
│  │  │  [BODY] [MUTED]                           │  │  [BODY] [MUTED]                   │  │ │
│  │  │                                           │  │                                   │  │ │
│  │  │  Read docs →  [PRIMARY] link              │  │  Read docs →  [PRIMARY] link      │  │ │
│  │  └───────────────────────────────────────────┘  └───────────────────────────────────┘  │ │
│  │  [WHITE] rounded-2xl shadow-card p-6 · border-l-4 [GREEN]                              │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  SECTION 2: BUILDING NOW · max-w-7xl px-8 · mt-8                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [H2] Building Now  ·  Sprint 15                                                        │ │
│  │                                                                                         │ │
│  │  2-col grid · gap-5                                                                     │ │
│  │  ┌───────────────────────────────────────────┐  ┌───────────────────────────────────┐  │ │
│  │  │  [IN PROGRESS] [BADGE][PURPLE]  ETA Jul 4  │  │  [IN PROGRESS] [BADGE][PURPLE]    │  │ │
│  │  │  Sprint 15 · Crystal AI                   │  │  ETA Jul 11 · Sprint 15           │  │ │
│  │  │                                           │  │                                   │  │ │
│  │  │  Crystal Support Skill v2                 │  │  Multi-Org Dashboard              │  │ │
│  │  │                                           │  │                                   │  │ │
│  │  │  Full support mode with known-issue       │  │  Enterprise multi-org view with   │  │ │
│  │  │  detection, doc search, and in-app        │  │  aggregated insights, shared      │  │ │
│  │  │  resolution feedback loop.                │  │  surveys, and cross-org Crystal   │  │ │
│  │  │                                           │  │  queries.                         │  │ │
│  │  │  PROGRESS BAR                             │  │                                   │  │ │
│  │  │  ████████████░░░░░░░  60%                 │  │  ████████░░░░░░░░░░░  40%         │  │ │
│  │  │  [PURPLE] fill · [BG] track · h-2         │  │  [PURPLE] fill · [BG] track       │  │ │
│  │  │  rounded-full · mt-3                      │  │  rounded-full · mt-3              │  │ │
│  │  │  [LABEL] [MUTED] "60% complete"           │  │  [LABEL] [MUTED] "40% complete"   │  │ │
│  │  └───────────────────────────────────────────┘  └───────────────────────────────────┘  │ │
│  │  [WHITE] rounded-2xl shadow-card p-6 · border-l-4 [PURPLE]                             │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  SECTION 3: UP NEXT · max-w-7xl px-8 · mt-8                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [H2] Up Next  ·  Sprint 16–17                                                          │ │
│  │                                                                                         │ │
│  │  List layout (not cards)  · divide-y divide-[BG]darker                                 │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────┐   │ │
│  │  │  [PLANNED] [BADGE][MUTED]   Slack Deep Integration                     API  ›   │   │ │
│  │  │  Real-time Slack notifications with Crystal summaries and action buttons.        │   │ │
│  │  │  [BODY] [MUTED]                                                                 │   │ │
│  │  ├─────────────────────────────────────────────────────────────────────────────────┤   │ │
│  │  │  [PLANNED] [BADGE][MUTED]   Advanced Workflow Conditionals              Feat ›  │   │ │
│  │  │  If/else branching, delay nodes, and Crystal-powered condition evaluation.       │   │ │
│  │  ├─────────────────────────────────────────────────────────────────────────────────┤   │ │
│  │  │  [PLANNED] [BADGE][MUTED]   Crystal Memory & Org Context Store          Crystal›│   │ │
│  │  │  Crystal retains org-specific context between sessions. No re-explaining.        │   │ │
│  │  └─────────────────────────────────────────────────────────────────────────────────┘   │ │
│  │  Row: py-4 flex items-start gap-4 [WHITE] bg                                          │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  SECTION 4: ON THE HORIZON · max-w-7xl px-8 · mt-8                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [H2] On the Horizon                                                                    │ │
│  │                                                                                         │ │
│  │  flex gap-4                                                                             │ │
│  │  ┌─────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐ │ │
│  │  │  Phase 2                │ │  Phase 4                 │ │  Phase 5                 │ │ │
│  │  │  AI Engine              │ │  Enterprise              │ │  Integrations            │ │ │
│  │  │  [PURPLE] text          │ │  [TEAL] text             │ │  [PRIMARY] text          │ │ │
│  │  │  [PURPLE]/8 bg          │ │  [TEAL]/8 bg             │ │  [PRIMARY]/8 bg          │ │ │
│  │  │  rounded-2xl p-5        │ │  rounded-2xl p-5         │ │  rounded-2xl p-5         │ │ │
│  │  │                         │ │                          │ │                          │ │ │
│  │  │  Crystal v3 multimodal  │ │  SOC 2 Type II, SSO,     │ │  HubSpot, Salesforce,    │ │ │
│  │  │  reasoning + proactive  │ │  custom data retention,  │ │  Segment, and 12+        │ │ │
│  │  │  coaching mode.         │ │  and audit logs.         │ │  native connectors.      │ │ │
│  │  └─────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  SUBSCRIBE CTA · max-w-7xl px-8 · mt-8 mb-12                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [GLASS] rounded-2xl p-6 · flex items-center justify-between                           │ │
│  │                                                                                         │ │
│  │  🔔 Get notified when things ship.          ┌─────────────────────────┐  ┌──────────┐  │ │
│  │  [H2] Manrope bold [TEXT]                   │ your@email.com          │  │ Notify me│  │ │
│  │  We'll email you on every ship.             └─────────────────────────┘  └──────────┘  │ │
│  │  [BODY] [MUTED]                             [WHITE] rounded-xl h-10 px-4 [GRAD] btn    │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 6

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| "Live" timestamp pill | `<LivePill>` | [GREEN] dot 8px + pulse animation, [WHITE] bg, border, rounded-full, [BODY] [MUTED] |
| Filter chips | `<FilterChip>` | Active: [PRIMARY] bg [WHITE] text. Inactive: [WHITE] bg border [TEXT] |
| Just Shipped card | `<ShippedCard>` | [WHITE] rounded-2xl shadow-card p-6, border-l-4 [GREEN] |
| [SHIPPED ✓] badge | `<Badge variant="shipped">` | [GREEN]/10 bg, [GREEN] text, [BADGE] |
| Building Now card | `<InProgressCard>` | [WHITE] rounded-2xl shadow-card p-6, border-l-4 [PURPLE] |
| [IN PROGRESS] badge | `<Badge variant="in-progress">` | [PURPLE]/10 bg, [PURPLE] text, [BADGE] |
| Progress bar | `<ProgressBar>` | [PURPLE] fill, [BG] track, h-2 rounded-full, animated fill transition |
| Up Next row | `<PlannedRow>` | py-4, divide-y, [MUTED] [BADGE] pill + description |
| [PLANNED] badge | `<Badge variant="planned">` | [MUTED]/20 bg, [MUTED] text, [BADGE] |
| Horizon phase pill | `<HorizonPill>` | Phase-colored bg/8 + text, rounded-2xl p-5, no shadow |
| Subscribe CTA | `<SubscribeCTA>` | [GLASS] card, email input + [GRAD] button, flex row |

### Interaction Notes

- Filter chips: click filters all four sections in one animation pass; filtered-out items `opacity → 0 height → 0` 200ms
- Progress bars animate to target percentage on mount (from 0%)
- "Live · Updated N min ago" increments the time counter every minute
- "Notify me" form: email validates, submits to `POST /api/support/roadmap-subscribe`, success toast "You're subscribed!"
- Phase pills expand on click to show a short feature list beneath them

---

## Screen 7: Status Page

### Overview

The status page is a live operational dashboard for `support.experient.ai/status`. It shows aggregate system health, per-component status with response times, 30-day sparklines, and incident history.

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  TOPBAR [WHITE] 64px                                                                         │
│                                                                                               │
│  OVERALL STATUS BANNER · max-w-7xl px-8 · mt-20                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [GREEN]/5 bg · rounded-2xl · border 1.5px [GREEN]/30 · p-8 · text-center             │ │
│  │                                                                                         │ │
│  │                  ●                                                                      │ │
│  │                  [GREEN] 20px dot · pulse animation                                     │ │
│  │                                                                                         │ │
│  │              All Systems Operational                                                    │ │
│  │              [H1] Manrope extrabold [TEXT]                                              │ │
│  │                                                                                         │ │
│  │              99.94% uptime · last 90 days                                               │ │
│  │              [BODY] [MUTED]                                                             │ │
│  │                                                                                         │ │
│  │  ┌────────────────────────┐  Last incident: 12 days ago · no active incidents          │ │
│  │  │  View incident history  │  [BODY] [MUTED]                                           │ │
│  │  └────────────────────────┘                                                             │ │
│  │  [WHITE] border rounded-xl h-10 px-5 [TEXT] hover: [BG]                                │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  COMPONENT GRID · max-w-7xl px-8 · mt-8                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  System Components  [H2]                                                                │ │
│  │                                                                                         │ │
│  │  2-column grid · gap-4                                                                  │ │
│  │                                                                                         │ │
│  │  ┌──────────────────────────────────────────┐  ┌──────────────────────────────────────┐│ │
│  │  │  ● API                        48ms  ✓    │  │  ● CrystalOS               112ms  ✓  ││ │
│  │  │  [GREEN] dot  [TEXT] bold  [MUTED][BODY] │  │  [GREEN] dot                         ││ │
│  │  │                                          │  │                                       ││ │
│  │  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d    │  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d  ││ │
│  │  │  Sparkline [GREEN]/60 fill · h-8          │  │  Sparkline [GREEN]/60 fill · h-8     ││ │
│  │  └──────────────────────────────────────────┘  └──────────────────────────────────────┘│ │
│  │  [WHITE] rounded-2xl p-4 shadow-card                                                   │ │
│  │                                                                                         │ │
│  │  ┌──────────────────────────────────────────┐  ┌──────────────────────────────────────┐│ │
│  │  │  ● Survey Collection          31ms  ✓    │  │  ● Insight Pipeline        890ms  ✓  ││ │
│  │  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d    │  │  ▇▇▇▇▇▇▇▇▇▄▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d  ││ │
│  │  └──────────────────────────────────────────┘  │  Note: dip in sparkline indicates     ││ │
│  │                                                 │  brief degradation 8 days ago         ││ │
│  │                                                 └──────────────────────────────────────┘│ │
│  │                                                                                         │ │
│  │  ┌──────────────────────────────────────────┐  ┌──────────────────────────────────────┐│ │
│  │  │  ● Notifications              22ms  ✓    │  │  ● Exports                 340ms  ✓  ││ │
│  │  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d    │  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d  ││ │
│  │  └──────────────────────────────────────────┘  └──────────────────────────────────────┘│ │
│  │                                                                                         │ │
│  │  ┌──────────────────────────────────────────┐  ┌──────────────────────────────────────┐│ │
│  │  │  ● Billing                    55ms  ✓    │  │  ● Auth (Clerk)             38ms  ✓  ││ │
│  │  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d    │  │  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  30d  ││ │
│  │  └──────────────────────────────────────────┘  └──────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  INCIDENT HISTORY · max-w-7xl px-8 · mt-8                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [H2] Incident History  ·  Last 30 days                                                │ │
│  │                                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────┐   │ │
│  │  │                                                                                 │   │ │
│  │  │          ░░░░░░░░░░░░░░                                                         │   │ │
│  │  │        [illustration placeholder: empty calendar/timeline graphic]              │   │ │
│  │  │                                                                                 │   │ │
│  │  │              No incidents in the last 30 days                                   │   │ │
│  │  │              [H2] [MUTED] font-normal text-center                               │   │ │
│  │  │                                                                                 │   │ │
│  │  │     All systems have been running smoothly. The team is watching closely.       │   │ │
│  │  │     [BODY] [MUTED] text-center                                                  │   │ │
│  │  │                                                                                 │   │ │
│  │  └─────────────────────────────────────────────────────────────────────────────────┘   │ │
│  │  [WHITE] rounded-2xl p-10 text-center shadow-card                                      │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  SUBSCRIBE CTA · max-w-7xl px-8 · mt-6 mb-12                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │  [PRIMARY]/4 bg · rounded-2xl · border 1.5px [PRIMARY]/20 · p-6                        │ │
│  │  flex items-center justify-between                                                      │ │
│  │                                                                                         │ │
│  │  🔔 Get status updates                  ┌──────────────────────┐  ┌──────────────────┐ │ │
│  │  [H2] [TEXT]                            │  your@email.com      │  │ Subscribe        │ │ │
│  │  Real-time email and Slack alerts       └──────────────────────┘  └──────────────────┘ │ │
│  │  when incidents occur or resolve.       input h-10 rounded-xl     [GRAD] btn rounded-xl│ │
│  │  [BODY] [MUTED]                                                                        │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 7

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| Overall status banner | `<OverallStatusBanner>` | [GREEN]/5 bg, border 1.5px [GREEN]/30, rounded-2xl p-8 text-center |
| Overall dot | `<StatusDot size="xl">` | 20px, [GREEN], CSS `@keyframes pulse` animation |
| "All Systems Operational" | `<h1>` | [H1] Manrope extrabold [TEXT] |
| Uptime stat | `<UptimeStat>` | [BODY] [MUTED] below headline |
| Component card | `<ComponentCard>` | [WHITE] rounded-2xl p-4 shadow-card, dot + name + response time + sparkline |
| Component dot | `<StatusDot size="sm">` | 10px, color: [GREEN]=operational, [AMBER]=degraded, [RED]=outage |
| Response time | `<ResponseTime>` | [MUTED] [BODY] right-aligned, color shifts: <100ms [GREEN], 100-500ms [MUTED], >500ms [AMBER] |
| Sparkline | `<Sparkline>` | SVG path, 30 data points, [GREEN]/60 stroke, h-8 fill-below |
| Empty incident state | `<EmptyState>` | Illustration placeholder 120px, centered [MUTED] text |
| Subscribe CTA | `<StatusSubscribeCTA>` | [PRIMARY]/4 bg, border [PRIMARY]/20, email input + [GRAD] button |

### Dimensions

- Component grid: 2-col, `grid-cols-2`, gap-4 (16px), each card ~608px at 1440px
- Sparkline: 100% width of card minus padding, h-8 (32px)
- Status dot (component): 10px circle
- Status dot (overall): 20px circle
- Empty incident state: min-h-48, centered content

### Interaction Notes

- Component card hover: shows tooltip with last 7-day average response time and uptime percentage
- Sparkline hover: shows per-day tooltip `{date}: {response_time}ms, uptime {pct}%`
- Overall status auto-refreshes every 30s via `EventSource` (SSE) from `/api/status/stream`
- "View incident history" scrolls to `#incident-history` section
- Status dot colors update without page reload when system state changes

---

## Screen 8: In-App Support Access (Cmd+K Extension)

### Overview

This extends the existing Cmd+K command palette with a support-focused overlay that surfaces Crystal answers, doc results, and feature status inline. It appears as a centered modal at 640px wide over a dimmed backdrop.

### Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  APP BACKDROP · rgba(15,15,20,0.6) · backdrop-filter blur(4px)                              │
│                                                                                               │
│                         COMMAND PALETTE MODAL                                                 │
│              ┌─────────────────────────────────────────────────────┐                        │
│              │  640px · rounded-2xl · shadow-2xl                   │                        │
│              │  [WHITE] bg · max-h-[80vh] overflow-hidden           │                        │
│              │  animate-in: scale(0.96→1) fade-in 150ms ease-out   │                        │
│              │                                                     │                        │
│              │  SEARCH BAR · p-4 border-b 1px [BG]darker          │                        │
│              │  ┌─────────────────────────────────────────────┐   │                        │
│              │  │  🔍 │  Search docs, ask Crystal...      Esc │   │                        │
│              │  └─────────────────────────────────────────────┘   │                        │
│              │  h-12 · [BG] bg · rounded-xl · no border           │                        │
│              │  🔍 icon [MUTED] 20px left · Esc hint right [MUTED] │                        │
│              │  Focus auto on mount, [TEXT] on type               │                        │
│              │                                                     │                        │
│              │  RECENT SEARCHES · px-4 pt-3 · flex gap-2          │                        │
│              │  RECENT  [LABEL] [MUTED] mb-2                       │                        │
│              │  ┌───────────────┐ ┌───────────────┐ ┌──────────┐  │                        │
│              │  │ CSV export    │ │ credit plans  │ │ webhooks │  │                        │
│              │  └───────────────┘ └───────────────┘ └──────────┘  │                        │
│              │  [BG] rounded-full px-3 py-1 [MUTED] [BODY]        │                        │
│              │  hover: [PRIMARY]/8 bg cursor-pointer               │                        │
│              │                                                     │                        │
│              │  RESULTS · overflow-y-auto · max-h-[60vh]          │                        │
│              │                                                     │                        │
│              │  ┌─────────────────────────────────────────────┐   │                        │
│              │  │  CRYSTAL SUPPORT  [LABEL] [MUTED] · px-4 pt-4│  │                        │
│              │  │                                             │   │                        │
│              │  │  ┌───────────────────────────────────────┐  │   │                        │
│              │  │  │  ✦  Crystal is thinking...            │  │   │                        │
│              │  │  │  ● ● ●  (streaming dots animation)    │  │   │                        │
│              │  │  │  [GRAD] sparkle · [BODY] [MUTED]      │  │   │                        │
│              │  │  │  italic · dots pulse 600ms interval   │  │   │                        │
│              │  │  └───────────────────────────────────────┘  │   │                        │
│              │  │  [PRIMARY]/4 bg · rounded-xl p-3 mx-4       │   │                        │
│              │  └─────────────────────────────────────────────┘   │                        │
│              │                                                     │                        │
│              │  ┌─────────────────────────────────────────────┐   │                        │
│              │  │  DOCUMENTATION  [LABEL] [MUTED] · px-4 pt-4 │   │                        │
│              │  │                                             │   │                        │
│              │  │  ┌─────────────────────────────────────┐   │   │                        │
│              │  │  │  📄 Credits & Billing Guide          │   │   │                        │
│              │  │  │  How credits work, plans, top-ups    │   │   │                        │
│              │  │  │  Guide · Billing                     │   │   │                        │
│              │  │  └─────────────────────────────────────┘   │   │                        │
│              │  │  Row: px-4 py-2.5 flex items-center gap-3   │   │                        │
│              │  │  hover: [BG] bg · cursor-pointer             │   │                        │
│              │  │  selected (keyboard): [PRIMARY]/8 bg         │   │                        │
│              │  │                                             │   │                        │
│              │  │  ┌─────────────────────────────────────┐   │   │                        │
│              │  │  │  { } GET /api/billing/balance        │   │   │                        │
│              │  │  │  Returns credit balance for org      │   │   │                        │
│              │  │  │  API Reference · Billing             │   │   │                        │
│              │  │  └─────────────────────────────────────┘   │   │                        │
│              │  │                                             │   │                        │
│              │  │  ┌─────────────────────────────────────┐   │   │                        │
│              │  │  │  📄 Crystal Support Skill            │   │   │                        │
│              │  │  │  Support-mode Crystal, tool calls    │   │   │                        │
│              │  │  │  Crystal Docs · Skills               │   │   │                        │
│              │  │  └─────────────────────────────────────┘   │   │                        │
│              │  └─────────────────────────────────────────────┘   │                        │
│              │                                                     │                        │
│              │  ┌─────────────────────────────────────────────┐   │                        │
│              │  │  FEATURE STATUS  [LABEL] [MUTED] · px-4 pt-4│   │                        │
│              │  │                                             │   │                        │
│              │  │  ┌─────────────────────────────────────┐   │   │                        │
│              │  │  │  ✅  Crystal Support v2              │   │   │                        │
│              │  │  │  Live since Jun 20 · Sprint 14       │   │   │                        │
│              │  │  │  [GREEN] checkmark · [BODY] [TEXT]   │   │   │                        │
│              │  │  └─────────────────────────────────────┘   │   │                        │
│              │  │                                             │   │                        │
│              │  │  ┌─────────────────────────────────────┐   │   │                        │
│              │  │  │  🔄  Multi-Org Dashboard             │   │   │                        │
│              │  │  │  Building now · ETA Jul 11           │   │   │                        │
│              │  │  │  [AMBER] spinner · [BODY] [TEXT]     │   │   │                        │
│              │  │  └─────────────────────────────────────┘   │   │                        │
│              │  └─────────────────────────────────────────────┘   │                        │
│              │                                                     │                        │
│              │  KEYBOARD HINTS · px-4 py-3 border-t 1px [BG]     │                        │
│              │  ┌─────────────────────────────────────────────┐   │                        │
│              │  │  ↑↓ navigate · Enter select · Esc close     │   │                        │
│              │  │  [LABEL] [MUTED] · flex gap-4 items-center  │   │                        │
│              │  │  each hint: kbd tag [BG] rounded px-1.5      │   │                        │
│              │  └─────────────────────────────────────────────┘   │                        │
│              └─────────────────────────────────────────────────────┘                        │
│                                                                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Legend — Screen 8

| Element | Component | Styling Notes |
|---------|-----------|---------------|
| Backdrop | `<DialogOverlay>` | `rgba(15,15,20,0.6)`, `backdrop-filter: blur(4px)`, full viewport |
| Modal container | `<CommandPalette>` | 640px w, rounded-2xl, shadow-2xl, [WHITE] bg, max-h-[80vh], scale-in animation |
| Search input | `<PaletteSearch>` | h-12 [BG] bg rounded-xl, no border, auto-focus on mount, 🔍 icon left |
| Esc hint | `<KbdHint>` | [MUTED] [LABEL], `<kbd>` styling: [BG] bg rounded px-1.5 |
| Recent chips | `<RecentChip>` | [BG] bg, rounded-full, px-3 py-1, [MUTED] [BODY], click → populate search |
| Section header | `<PaletteSectionHeader>` | [LABEL] [MUTED], px-4 pt-4 pb-1 |
| Crystal streaming row | `<CrystalStreamingRow>` | [PRIMARY]/4 bg rounded-xl p-3 mx-4, ✦ [GRAD] + streaming dots animation |
| Streaming dots | Animation | 3 dots `● ● ●`, each fades in/out staggered 200ms at `opacity: 0.3 → 1` loop |
| Doc result row | `<DocResultRow>` | px-4 py-2.5, icon left, title + subtitle + breadcrumb, hover [BG] bg |
| Selected row (keyboard) | State | [PRIMARY]/8 bg, left 3px [PRIMARY] bar |
| Doc icon | `<DocIcon>` | 📄 for guides, `{ }` for API, ✦ for Crystal, 20px |
| Feature status row | `<FeatureStatusRow>` | px-4 py-2.5, ✅ or 🔄 icon, title + subtitle, hover [BG] bg |
| Keyboard hints | `<KeyboardHints>` | border-t, [LABEL] [MUTED], `<kbd>` tags for each key |

### Dimensions

- Modal width: 640px (fixed)
- Modal max-height: 80vh
- Search bar: h-12 (48px), full-width of modal
- Results section: `flex-1 overflow-y-auto`, max-h approximately `80vh - 48px (search) - 48px (recent) - 40px (hints) = ~calc`
- Row height: 52px (px-4 py-2.5 with title + subtitle)
- Section headers: 32px h

### Interaction Notes

- Keyboard navigation: `↑`/`↓` arrows move selection highlight; `Enter` on a doc row opens it in new tab; `Enter` on Crystal row opens Crystal panel seeded with the query
- `Esc` closes the palette with `scale(1 → 0.96) fade-out` 100ms
- Crystal streaming row: fires `crystalSupportQuery(inputValue)` after 300ms debounce from last keystroke; shows streaming dots until first token arrives, then streams text in-place
- Recent searches persist in `localStorage['support.recentSearches']`, capped at 5 items
- Each row type has a distinct keyboard shortcut shown on hover: `⌘ + number` for the first N results
- Modal backdrop click closes the palette

---

## Component Cross-Reference

The following components appear across multiple screens. Implement them once in a shared component library.

| Component | Used in | Notes |
|-----------|---------|-------|
| `<CrystalAvatar>` | 5, 8 | [GRAD] circle, ✦ sparkle, 32px default |
| `<Badge>` | 1, 3, 4, 6 | All variants: shipped, in-progress, planned, stable, beta, api, billing |
| `<StatusDot>` | 1, 7 | Size variants: sm (10px), md (14px), xl (20px) |
| `<SearchBar>` | 1, 2, 3, 8 | Shared base with `active` and `support` prop variants |
| `<DocLinkChip>` | 5, 8 | [PRIMARY]/8 bg, icon + title, hover border [PRIMARY] |
| `<CrystalIdlePanel>` | 1, 2 | [GLASS] card, gradient branding, suggestion chip |
| `<SubscribeCTA>` | 6, 7 | Email input + [GRAD] button; slightly different bg per context |
| `<CodePanel>` | 4 | Dark bg #1a1b26, lang tabs, copy button, syntax colors |
| `<ProgressBar>` | 6 | [PURPLE] fill, animated mount, [LABEL] percentage |
| `<RelevanceBar>` | 3 | [PRIMARY] fill, h-1.5, [LABEL] percentage |

---

## Animation Reference

All transitions should prefer `transition: all Xms ease` or `transition: property Xms cubic-bezier(...)` rather than `transition: all`. Use these standard durations:

| Interaction | Duration | Easing | Notes |
|-------------|----------|--------|-------|
| Hover state | 150ms | ease | Color, background, border transitions |
| Card lift (translateY) | 200ms | ease | Quick card hover elevation |
| Panel slide-in | 300ms | cubic-bezier(0.16, 1, 0.3, 1) | Crystal panel from right |
| Modal scale-in | 150ms | ease-out | Cmd+K palette open |
| Modal scale-out | 100ms | ease-in | Cmd+K palette close |
| Page section stagger | 50ms × index | ease-out | Result cards, staggered mount |
| Streaming dots | 600ms loop | ease-in-out | Crystal thinking indicator |
| Progress bar fill | 800ms | ease-out | Animate from 0% on mount |
| Status dot pulse | 2s infinite | ease-in-out | Operational status breathing |
| Filter chip transition | 200ms | ease | Height/opacity for filtered items |
| Sparkline draw | 1s | ease-out | SVG path length animation on mount |

---

## Accessibility Notes

- All interactive elements must have `aria-label` where icon-only
- Color alone is never the sole indicator: status dots also have `aria-label="Operational"` etc.
- Crystal streaming state: `aria-live="polite"` on the streaming container
- Cmd+K modal: `role="dialog"`, `aria-modal="true"`, `aria-label="Support search"`, focus trap
- Tab order in search results: search input → recent chips → result rows → keyboard hints
- Code panels: `role="region"` with `aria-label="Code example: {language}"`
- Filter chips: `role="group"` with `aria-label="Filter by category"`, active chip has `aria-pressed="true"`
- Keyboard hints in Cmd+K: `aria-hidden="true"` (decorative)
- Progress bars: `role="progressbar"` with `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`
- Status page: `<main>` landmark, component grid `role="list"`, each component `role="listitem"`
