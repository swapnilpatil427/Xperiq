# Prism — UX Design

**Status:** Flow approved; ready for component build
**Date:** 2026-06-29
**Owners:** Elena Rossi (Principal Design), Jonah Pratt (Staff UX), Maya Chen (Research)

> **Design standard.** Prism is a native Xperiq surface. It lives inside `AppShell`,
> uses `PageHeader`, shadcn primitives, the brand spectrum (`var(--color-primary)` →
> accent), the house motion curve `[0.22, 1, 0.36, 1]`, the global `CrystalPanel`, and
> the `useBreakpoint()` responsive strategy. All strings go through `t()` →
> `locales/en.ts` (`prism` namespace). No hardcoded copy, no raw hex, no bespoke shell.
> See `app/CLAUDE.md`. Figma was offered; per decision we ship **markdown specs + ASCII
> wireframes** here, which the build can translate directly to components.

---

## 1. UX principles for Prism

1. **The hero is trust, not speed.** The emotional center of the flow is the **dry-run
   diff** — "here's exactly what will happen, nothing is written yet." (From discovery
   R1/R2/R9.)
2. **One spine, two doors.** Self-serve and services-guided are the *same wizard*; the
   guided path just adds a co-pilot rail and a services checkpoint.
3. **Always reversible until the last step.** Every step before "Approve & Import" is
   back-navigable and non-destructive. The point of no return is explicit and singular.
4. **Crystal is the guide, not a popup.** The existing global Crystal panel explains
   mappings, answers "will my NPS change?", and—after import—delivers first insight.
5. **Progress you can trust.** Long jobs show *stage*, *counts*, and *what's happening*,
   never a fake spinner. You can close the tab and come back.

---

## 2. Information architecture & routing

New routes (registered in `app/src/constants/routes.ts`, accessed via `toPath()`):

```
ROUTES.PRISM                 /prism                          → PrismHomePage (connector gallery + recent jobs)
ROUTES.PRISM_CONNECT         /prism/connect/:platform        → PrismConnectPage (auth)
ROUTES.PRISM_JOB             /prism/jobs/:jobId              → PrismJobPage (the wizard host; renders the active stage)
ROUTES.PRISM_JOBS            /prism/jobs                      → PrismJobsPage (all imports, status)
```

`PrismJobPage` is a **stepper host** that renders the current stage component based on
`job.stage` (Select → Map → Review → Import → Done). This mirrors the survey builder's
single-page-owns-viewport pattern but stays inside the standard shell (it is not builder
mode).

Nav entry: a **Prism** item in `SideNav` (icon: `prism` / `auto_awesome_motion`), placed
under "Data". On mobile it surfaces in the Data tab, not the BottomNav primary slots.

---

## 3. The flow (end to end)

```
PrismHome ──select source──► Connect (auth) ──► Discover & Select
   ▲                                                   │
   │                                                   ▼
   └──────────── Done ◄── Import (live) ◄── Review (DRY-RUN DIFF) ◄── Map (AI-assisted)
                   │
                   └──► "See insights" → Experience/Insights (Crystal)
```

Stepper (persistent at top of `PrismJobPage`, uses the brand spectrum for the active fill):

```
①Connect ──── ②Select ──── ③Map ──── ④Review ──── ⑤Import ──── ⑥Done
  ✓ done        ✓ done      ● active    ○            ○            ○
```

---

## 4. Screen specs + wireframes

### 4.1 Prism Home — connector gallery

`PrismHomePage`. `max-w-7xl mx-auto`, `PageHeader` with title "Prism" / subtitle
"Bring everything. Lose nothing. See more." Hero uses the **CSS Crystal/prism orb**
(zero-weight, from `app/CLAUDE.md`) refracting the brand gradient.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Prism                                                          [docs] [?]   │
│  Bring everything. Lose nothing. See more.                                   │
│                                                                              │
│   ◇  Connect a platform and import your experience data — with a full        │
│      preview before anything is written.                                     │
│                                                                              │
│  ┌─ Survey & XM platforms ──────────────────────────────────────────────┐   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │   │
│  │  │Qualtrics│ │Medallia │ │ Survey  │ │ Typeform│ │ Google  │  …      │   │
│  │  │   ◆     │ │   ◆     │ │ Monkey  │ │   ◆     │ │ Forms   │         │   │
│  │  │ Connect │ │ Connect │ │ Connect │ │ Connect │ │ Connect │         │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌─ Reviews & public voice ─────────────────────────────────────────────┐   │
│  │  [Google Business] [Yelp] [App Store] [Google Play] [Trustpilot] …    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌─ Files ──────────────────────────────────────────────────────────────┐   │
│  │  [CSV / Excel]  [SPSS .sav]  [Qualtrics .qsf]  [JSON]                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Recent imports                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Qualtrics · CX Relational NPS   ✓ Complete · 48,211 responses · 2d ago │  │
│  │ Yelp · 312 locations            ↻ Syncing  · 9,840 reviews             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

- Connector cards: shadcn `Card`, `card-tilt` hover, staggered entrance (`rise` variant,
  `staggerChildren: 0.06`). Each card shows source logo, a 1-line capability hint
  (e.g. "Surveys · Responses · Directory"), and a `Button variant="outline"`.
- A small **legal/ToS chip** appears on review sources (e.g. "Official API · owned
  locations only") — sets expectations early (from [`security-compliance.md`](./security-compliance.md)).
- Empty state: large prism orb + "Connect your first platform."

### 4.2 Connect (authentication)

`PrismConnectPage` — opens as a focused page (or `Sheet` on mobile). Auth UI adapts to
`connector.meta.authKind`:

```
┌─ Connect Qualtrics ───────────────────────────────────────────────┐
│                                                                    │
│  How do you want to connect?                                       │
│   ( ) OAuth — sign in to Qualtrics            ← recommended        │
│   (•) API token                                                    │
│       Data center ID  [ syd1 ▾ ]                                   │
│       API token       [ ••••••••••••••••••••••••• ]  (encrypted)   │
│                                                                    │
│   🔒 Your token is stored encrypted in Secret Manager. Prism only  │
│      ever reads data you select. We never write to Qualtrics.      │
│                                                                    │
│                                   [ Cancel ]   [ Connect ]         │
└────────────────────────────────────────────────────────────────────┘
```

- Secret fields use `type=password`; the value is sent once to the backend, stored as a
  `credential_ref`, and **never returned to the client** (matches `FeedbackSource.credentialRef`).
- OAuth path → standard popup/redirect; on return, connection is verified with a cheap
  read (`/whoami`-style) and we show a green "Connected" state.
- Error states are explicit and actionable ("Token lacks `read:responses` scope").

### 4.3 Discover & Select

After connect, Prism enumerates what's importable and lets the user pick scope.

```
┌─ Select what to import — Qualtrics ───────────────────────────────────────┐
│  Search [▢ filter…]                              Selected: 3 surveys · all │
│                                                                            │
│  ☑ CX Relational NPS         48,211 responses   2019–2026   NPS           │
│  ☑ Post-Support CSAT        128,402 responses   2021–2026   CSAT          │
│  ☑ Onboarding CES             9,120 responses   2022–2026   CES           │
│  ☐ Test survey (draft)             3 responses              —             │
│                                                                            │
│  Also import:  ☑ XM Directory (contacts + embedded data)  ☑ Distributions │
│  Date range:   [ All time ▾ ]      Include partials: ( •)Yes ( )No         │
│                                                                            │
│                                            [ Back ]   [ Continue → Map ]   │
└────────────────────────────────────────────────────────────────────────────┘
```

- shadcn `Table` with checkbox rows + `Switch` for the "also import" toggles.
- Counts come from DISCOVER (cheap metadata calls); large counts get a "we'll export
  this in the background" note.

### 4.4 Map (AI-assisted) — *Crystal proposes, you confirm*

The mapping screen is a two-column reconciliation: source schema (left) → Xperiq schema
(right). CrystalOS `schema-mapper` pre-fills suggestions with confidence; the user
confirms or edits. **This is a confirm surface, exactly like Crystal action proposals.**

```
┌─ Map fields — CX Relational NPS ─────────────────────────────────────────────┐
│  Crystal suggested 14 of 16 mappings.  ● high  ◐ review  ○ unmapped           │
│                                                                               │
│  SOURCE (Qualtrics)              →   XPERIQ                          conf.     │
│  ──────────────────────────────────────────────────────────────────────────  │
│  ● Q1  "How likely…recommend"    →   [ NPS question        ▾]  metric: nps  98%│
│  ● Q2  "Why this score?"         →   [ Long text           ▾]               95%│
│  ◐ Q5  "Overall satisfaction"    →   [ CSAT (1–5)          ▾]  ⚠ scale 1–7→1–5│
│  ● EmbeddedData: region          →   [ Embedded: region    ▾]               99%│
│  ○ Q17 "Custom internal code"    →   [ Keep as embedded data ▾]  (preserved)  │
│                                                                               │
│  Value mappings (Q5 scale):                                                   │
│     1–2 → Dissatisfied   3 → Neutral   4–5 → Satisfied   [ edit rule ]        │
│                                                                               │
│  💬 Ask Crystal: "Will remapping Q5 from 1–7 to 1–5 change my CSAT trend?"     │
│                                                                               │
│                                    [ Back ]   [ Continue → Review diff ]      │
└────────────────────────────────────────────────────────────────────────────┘
```

- Confidence chips reuse the insight-layer `ConfidenceChip` styling (≥80 reliable /
  60–79 review / <60 low — from `app/CLAUDE.md`).
- Anything unmapped defaults to **"Keep as embedded data"** (Principle 2, lossless) —
  never silently dropped.
- Scale/value remaps that affect a metric get a ⚠ and a one-click "Ask Crystal" that
  opens the global panel scoped to this mapping (`openCrystal(...)`).
- Editing a target uses shadcn `Select`; value-mapping rules open in a `Dialog`.

### 4.5 Review — the **dry-run diff** (trust hero)

The most important screen. Nothing has been written. This is the "look before you leap."

```
┌─ Review — nothing has been imported yet ─────────────────────────────────────┐
│                                                                               │
│   This is a preview. Click Approve to import. You can still go back.          │
│                                                                               │
│   ┌── What will happen ──────────────────────────────────────────────────┐   │
│   │   ＋ 48,211 responses created                                          │   │
│   │   ✎ 132 existing responses updated (re-import)                         │   │
│   │   ⤫ 3 conflicts need a decision                          [ Resolve ▸ ] │   │
│   │   ◆ 16 questions mapped · 1 preserved as embedded data                 │   │
│   │   ⏱ History preserved: 2019-01-04 → 2026-06-28 (no gaps)               │   │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│   ┌── Metric parity check ───────────────────────────────────────────────┐   │
│   │   NPS    source 42      Prism 42      ✓ match                          │   │
│   │   CSAT   source 4.31    Prism 4.30    ⚠ −0.01  (rounding: half-up)     │   │
│   │          → [ match source rounding ]  [ keep Prism method ]            │   │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│   ┌── Sample (10 rows) ──────────────────────────────────────────────────┐   │
│   │  date        NPS  verbatim                       region   → preview    │   │
│   │  2024-03-02   9   "Loved the fast support…"      EMEA      ✓           │   │
│   │  2024-03-02   3   "Hold time was brutal"         NA        ✓           │   │
│   └────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│   ⚠ This writes 48,211 responses into "CX Relational NPS".                    │
│                                       [ Back ]   [ Approve & Import → ]        │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Approve & Import** is the single point of no return — `Button variant="gradient"`,
  guarded by a confirm `Dialog` that restates the counts (Jonah's "scary irreversible
  action" pattern: type-to-confirm only for very large/destructive imports).
- Conflicts must be resolved before the button enables.
- Metric-parity mismatches must be acknowledged (choose a method) — not dismissable
  silently. This *is* Principle 1 made visible.

### 4.6 Import (live progress)

```
┌─ Importing — CX Relational NPS ──────────────────────────────────────────────┐
│   Stage: Loading responses                              [ Run in background ] │
│   ████████████████████████░░░░░░░░  31,402 / 48,211  (65%)                    │
│                                                                               │
│   ✓ Connected      ✓ Extracted      ✓ Mapped      ● Loading      ○ Reconcile  │
│                                                                               │
│   Throughput 5.1k rows/s · 0 errors · started 1m 12s ago                      │
│   You can leave this page — we'll keep going and notify you.                  │
└────────────────────────────────────────────────────────────────────────────┘
```

- Progress comes from polling `GET /api/prism/jobs/:id` (the existing job-polling
  pattern). `LiveDot` pulse indicator; stage chips fill with the brand spectrum.
- "Run in background" returns to Home; a toast + (optional) `PushNotification` fires on
  completion. Closing the tab is safe (server-side job).
- Partial failures surface a non-blocking banner: "47,998 imported · 213 failed
  [ view errors ]" → downloadable error report keyed by `source_record_id`.

### 4.7 Done — reconciliation + first insight

```
┌─ Import complete — CX Relational NPS ────────────────────────────────────────┐
│   ✓ 48,211 responses imported · reconciled against source                     │
│                                                                               │
│   ┌── Reconciliation ─────────────────────────────────────────────────────┐  │
│   │  Responses   source 48,211   Prism 48,211   ✓                          │  │
│   │  Checksum (answers)          ✓ match                                    │  │
│   │  NPS (full history)          42  =  42   ✓                              │  │
│   │            [ Download signed reconciliation report (PDF) ]              │  │
│   └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│   ◇ Crystal is generating insights on your imported history…                  │
│      "NPS dipped 6 pts in EMEA in Q2 2024 — driven by 'wait time'."           │
│                                                                               │
│              [ Import another ]        [ See insights → ]                      │
└────────────────────────────────────────────────────────────────────────────┘
```

- The reconciliation report is the audit artifact C1 asked for (downloadable PDF/JSON).
- **"See insights"** navigates to the survey's Experience/Insights view; Crystal has
  already kicked off the insight pipeline on the imported data (closing the loop).
- DataBus `invalidate('surveys')` + `invalidate('insights')` fire so open views refresh.

---

## 5. Crystal integration points

| Moment | Crystal behavior |
|---|---|
| Map step | `schema-mapper` skill proposes mappings; inline "Ask Crystal" opens the global panel scoped to the connection |
| Review step | Answers "will this change my metric?" using the parity computation |
| After import | Insight pipeline runs on imported data; first insight shown on Done screen |
| Anytime | Global `CrystalPanel` is available (mounted in `AppShell`); Prism never renders its own panel |

Mapping suggestions render with the same trust affordances as `ActionProposalCard`
(confidence + cite the source field). Confirmations record an outcome
(`recordProposalOutcome`-style) so the `schema-mapper` skill improves over time — the
closed loop from the root `CLAUDE.md`.

---

## 6. Responsive & accessibility

- **Desktop (≥1024):** two-column map view; side-by-side diff.
- **Tablet (768–1023):** map collapses to stacked source→target cards; diff stays full-width.
- **Mobile (<768):** wizard becomes one card per step; mapping is a vertical list with
  per-field expand; "Approve & Import" is a sticky bottom action above the BottomNav
  safe-area inset. Heavy imports nudge "best done on desktop" but never block.
- **A11y:** stepper is an ARIA `nav` with `aria-current`; diff tables are real `<table>`
  with scope; confidence/parity states are never color-only (icon + label); the
  point-of-no-return dialog is focus-trapped (Radix `Dialog`); respects
  `prefers-reduced-motion` (no orb animation, instant stage transitions).

---

## 7. Locale namespace

All copy under a new `prism` namespace in `app/src/locales/en.ts`:

```ts
prism: {
  title: 'Prism',
  tagline: 'Bring everything. Lose nothing. See more.',
  gallery: { surveysGroup: 'Survey & XM platforms', reviewsGroup: 'Reviews & public voice', filesGroup: 'Files' },
  connect: { tokenHint: 'Your token is stored encrypted. Prism never writes to {platform}.' },
  map: { suggested: 'Crystal suggested {done} of {total} mappings', keepAsEmbedded: 'Keep as embedded data' },
  review: { nothingYet: 'This is a preview. Nothing has been imported yet.',
            willHappen: 'What will happen', parity: 'Metric parity check',
            approve: 'Approve & Import' },
  progress: { stage: 'Stage: {stage}', runInBackground: 'Run in background', safeToLeave: "You can leave this page — we'll notify you." },
  done: { reconciled: 'Imported and reconciled against source', downloadReport: 'Download signed reconciliation report',
          seeInsights: 'See insights' },
  // …status, errors, conflicts, etc.
}
```

---

## 8. Component inventory (to build)

| Component | Built on | Notes |
|---|---|---|
| `PrismHomePage` | PageHeader, Card grid, motion stagger | connector gallery + recent jobs |
| `ConnectorCard` | shadcn Card | logo, capability hint, ToS chip |
| `PrismConnectPage` | Sheet/Dialog, Input, Select | auth by `authKind` |
| `PrismJobPage` (stepper host) | custom stepper + stage router | renders stage by `job.stage` |
| `MappingTable` | shadcn Table, Select, ConfidenceChip | AI suggestions + confirm |
| `ValueMappingDialog` | shadcn Dialog | scale/value remap rules |
| `DryRunDiff` | Card sections, Table | the trust hero (§4.5) |
| `ParityCheck` | Table + status icons | metric parity, acknowledge-to-proceed |
| `ImportProgress` | Progress, LiveDot, stage chips | polling `/api/prism/jobs/:id` |
| `ReconciliationPanel` | Card + download | signed report |

Tests mirror `src/__tests__/` per the testing rule in `app/CLAUDE.md` (mock `useApi`,
`i18n`, `framer-motion`).
