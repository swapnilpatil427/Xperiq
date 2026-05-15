# Survey Scope on the Insights Page — UX/PM Synthesis

> The Insights page must serve two jobs at once: **drill into a single survey** and **roll up across all surveys**. This document captures the team's reasoning behind the scope picker, the alternatives we rejected, and the open follow-ups. Companion to [INSIGHT_PAGE_VARIANTS.md](INSIGHT_PAGE_VARIANTS.md).

**Status:** Implemented (May 2026). See `app/src/components/SurveyScopePicker.tsx` and `app/src/pages/InsightsDashboardPage.tsx`.

---

## 1. The two jobs that must coexist

| User intent | Frequency | Where it lives today |
|---|---|---|
| "Show me insights for survey X" | Daily for analysts, weekly for PMs | The four variants, single-survey content |
| "What's true across all my surveys?" | Weekly for PMs, monthly for execs | New: same variants, cross-survey content |

The mistake legacy XM platforms make is forcing these into separate pages — Qualtrics has "Reports" (single-survey) and "Programs" (cross-survey), with different UIs, different filters, different mental models. Users learn one and avoid the other.

**Our move: one page, one selector, two scopes. Same UI shape. The variant tabs work identically in both modes.**

---

## 2. The scope picker — design decisions

### 2.1 Position: PageHeader actions slot

The picker sits **next to the title in the page header**, not as a separate filter row above the content. Reasoning:

- The scope is always relevant to what's on screen — it deserves the page-header position
- A row beneath the title would push real content below the fold on smaller viewports
- The page header is what gets photographed for screenshots; the scope is the headline of any insight discussion

### 2.2 Form: DropdownMenu (Radix), not Select

Why not a `<Select>` (the obvious choice for a single-value picker)?

- We want **multi-line rows** — each item has name, status, response count, KPI. `<Select>` is single-line by design.
- We want **section labels** by status (Active / Paused / Draft / Closed). `<Select>` allows `<optgroup>` but with limited styling.
- We want the **"All surveys" option to look architecturally different** (peer scope, primary visual), not just another item. DropdownMenu lets us style it richly.

Trade-off: DropdownMenu has less accessibility-default behavior than `<Select>` (e.g., no native search). We accept this; if an org has ≥15 surveys we'll add inline search in v2.

### 2.3 "All surveys" as the first option, not a separate UI

Considered alternatives:

| Alternative | Why we rejected it |
|---|---|
| Separate tab: "Overview" / "By Survey" | Doubles the navigation surface; users must remember which mode they're in twice |
| Toggle switch above content | Two states, same toggle — too easy to flip accidentally; less discoverable |
| Hidden behind a "More" menu | Demotes the cross-survey view to a power-user feature; we want it as a first-class choice |
| Always-visible left sidebar with survey tree | Eats horizontal space on every page; doesn't degrade well on tablet |

**The dropdown puts "All surveys" at the top with its own icon (`dataset`) and a one-line description ("Cross-survey themes & portfolio metrics"). It looks like a *peer* to the survey list, not a special case.**

### 2.4 Group by status, not alphabetical

Surveys are listed grouped by `status` in the order: Active → Paused → Draft → Closed. Reasoning:

- Active surveys are 90% of what users want to look at today
- Draft surveys are noise in this context (no responses yet)
- Closed surveys are useful historically but not daily — pushed to the bottom
- Within each group, the natural order is "most recently updated" — backend already returns this order

We do not alphabetize. A user with surveys named "Q1 NPS", "Q2 NPS", "Q3 NPS" alphabetically clusters them, but they're rarely looked at in that order — they're looked at in time order.

### 2.5 Each row shows: dot + title + KPI + response count

Rationale: four pieces of information is the minimum to **recognize a survey without expanding**.

- **Status dot** (green/amber/grey) — color-codes at a glance
- **Title** — primary identifier
- **Response count** — proxies for "how much data is in here"
- **NPS / CSAT score** — proxies for "is this the survey that's in trouble?"

We considered adding "last response time," but it's redundant with response count for active surveys and noisy for closed ones.

### 2.6 Trigger shows the current scope, not just "Select…"

The dropdown button itself mirrors what's selected:
- **All scope**: `[icon: dataset] All surveys · 7 active · 2,141 responses`
- **Single scope**: `[status dot] Customer Onboarding · 312 resp · NPS 47`

So users always see *which* scope is active without opening the picker.

---

## 3. Cross-survey content — what changes between scopes

When `scope === 'all'`, every variant renders modified content. The data contract stays the same (the `Insight` schema in [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md)) — only the *category mix* differs.

### 3.1 In Editorial Brief

| Element | Single-survey scope | All-surveys scope |
|---|---|---|
| Brief headline | "NPS held steady at 47…" | "'Pricing transparency' appears in 4 of your 7 surveys…" |
| Brief paragraph | Quotes & citations from that survey | Aggregated citations, named-survey references |
| Source-surveys strip | Hidden | New: pill row of contributing surveys with KPI |
| Metric label | "NPS" | "Portfolio NPS" |
| Driver card | Top driver of *that* survey | Cross-survey recurring theme |
| Driver card chip | None | Survey name pill (which survey this insight came from) |

### 3.2 In Mission Cockpit

| Element | Single | All |
|---|---|---|
| NPS tile | Single-survey NPS | Portfolio NPS |
| Response count tile | "312 / 500" | "2,141 total · 7 active" |
| Priority Feed rows | Untagged | Each row tagged with the survey name pill |

### 3.3 In Spatial Canvas

| Element | Single | All |
|---|---|---|
| Hero label | "Net Promoter Score · Live" | "Portfolio NPS · 7 active surveys" |
| Big number | Single-survey NPS | Portfolio aggregate |
| Constellation header | "Insight constellation" | "Portfolio constellation · drawn from 7 active surveys" |
| Driver card | "Support response time #1" | "Pricing transparency recurs across 4 surveys" + survey-name chip |

### 3.4 In Crystal (Experient Copilot)

Crystal is the AI copilot embedded throughout Insights. The Crystal UI renders in the unified Insights page (Crystal Command) as both the hero ask-bar and the conversation section.

| Element | Single | All |
|---|---|---|
| Crystal label | "Crystal · Experient Copilot" | "Crystal · Experient Copilot" |
| Crystal subtitle | "Ask anything about this survey" | "Ask anything across your surveys" |
| Suggested prompts | "Why did NPS drop?" etc. | "Which survey has highest churn risk?" / "Themes appearing in 3+ surveys?" / "Are surveys over-sampling one segment?" |

---

## 4. Empty / edge states

| State | UX |
|---|---|
| Zero surveys in org | Picker shows "No surveys yet — create one to see insights"; variants show empty-state with CTA |
| One survey only | Picker still shows "All surveys" + that one; "All" mode renders single-survey content (graceful degradation) |
| Stale persisted scope (survey deleted) | Auto-falls back to "all" on next mount (already implemented in `useEffect` in `InsightsDashboardPage`) |
| Many surveys (>15) | Source-surveys strip in Editorial truncates to 8 + "more" link; picker is scrollable |
| Generating regenerate while in "All" mode | Regenerate button disabled with tooltip: "Pick a single survey to regenerate" (cross-survey aggregation is a backend job, not a one-click action) |

---

## 5. Implementation notes for engineering

- **Persistence:** Two separate localStorage keys — `insights_variant` (which view) and `insights_scope` (which survey or "all"). Independent so a user can switch surveys without losing their variant preference, and vice versa.
- **Backend follow-up:** The "All surveys" content currently uses *representative static content* in the variants. Real cross-survey aggregation requires:
  - `GET /api/insights/aggregate` returning portfolio-level metrics and recurring-theme insights (`meta.cross_survey` category from the taxonomy)
  - An embedding-similarity join across all of an org's surveys' response_embeddings rows (see [ARCHITECTURE.md §13 open question #5](ARCHITECTURE.md))
  - This is a v1.1 backend deliverable, not v1.0
- **Survey-name tagging on insight cards:** Currently fakes the assignment from the surveys array. Real implementation: each `Insight` row carries `survey_id`; the card reads `survey.title` via a small lookup. Already in the schema (`Insight.survey_id`).

---

## 6. What we explicitly are NOT building

In line with [ENGINE_DECISIONS.md §3](ENGINE_DECISIONS.md):

- **No multi-select scope** (compare 2 surveys side by side). We considered it. We're refusing it for v1 because: (a) the UI tax is large for a feature few users will use weekly; (b) the comparison can be reformulated as an "Ask" query in Conversation Studio. If demand justifies it, a third scope mode "Compare" comes in v2.
- **No saved scope sets / "favorites"**. Users have a sequential workflow — they go where they need. Bookmark-style features add complexity without saving real clicks.
- **No date-range filter at the page level.** Date ranges are per-insight (built into the analytics tools), not per-page. Adding a global date filter would compose poorly with the variants and the scope.
- **No "compare to last period" toggle.** The trend insights already handle this. Toggling at the page level would duplicate functionality.

---

## 7. Success metrics for this UX

We'll know the scope picker works if:

| Signal | Target by month 3 of GA |
|---|---|
| % of sessions where the user changes scope at least once | >40% |
| % of sessions that include time in "All surveys" mode | >25% |
| Mean time-to-switch-survey | <5 seconds (single click + select) |
| Drop-off rate when no scope selected (zero-state) | <10% |
| Support tickets like "how do I see insights for survey X?" | Zero in month 2+ |

If "All surveys" mode sees <10% session time, we made it too prominent and should consider demoting it to a "Recent" link.

---

## 8. Variants × scope — the simple invariant

> **The variant decides how insights are rendered. The scope decides which insights exist. The two are orthogonal.**

This invariant means:
- A user's variant choice persists across scope changes
- A user's scope choice persists across variant changes
- Engineering doesn't have to build 4 × 2 = 8 separate page versions — just 4 variants that each branch internally on scope

This is the productized form of the design discipline in [ENGINE_DECISIONS.md](ENGINE_DECISIONS.md): two orthogonal axes, two independent persists, no Cartesian explosion of UI to maintain.
