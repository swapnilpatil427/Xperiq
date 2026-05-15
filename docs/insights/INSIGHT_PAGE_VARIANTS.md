# Experient AI Insights — Page Variants

> Four distinct Insights page variants, each grounded in the existing Experient visual language ("Tactile Ether" + Three.js HeroCanvas + holographic glass) and powered by the same backend architecture defined in [ARCHITECTURE.md](ARCHITECTURE.md). Synthesized by a cross-functional team (PM, UX, Engineering) to cover the full spectrum of users and contexts.

The four variants share **one data contract** (the `Insight` object from [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md)), **one SSE stream**, and **one set of analytics tools**. They differ only in their **presentation**, **density**, **3D use**, and **primary interaction**. This is the explicit thesis: one engine, many surfaces.

---

## 0. Why multiple variants

The four user contexts we see in the field map to fundamentally different interaction needs:

| Context | What the user wants |
|---|---|
| **Exec / board / sales demo** | Beautiful, presentational, low cognitive load, one big number, one story |
| **CX ops / analyst on the daily** | Dense, fast, no fluff, live data, war-room feel |
| **PM / product manager weekly review** | Mid-density, action-oriented, "what should I ship" energy |
| **AI-native team / founder / engineer** | Conversational, "talk to your data", minimal chrome |

A single layout cannot serve all four well. Instead of forcing one compromise design, we ship **four routes** — each with the same data, optimized for one audience. The user picks their default in settings or per-survey.

Routes:
- `/surveys/:id/insights` — auto-selects user's default view
- `/surveys/:id/insights/spatial` — Variant A: Spatial Canvas
- `/surveys/:id/insights/cockpit` — Variant B: Mission Cockpit
- `/surveys/:id/insights/editorial` — Variant C: Editorial Brief
- `/surveys/:id/insights/conversation` — Variant D: Conversation Studio

All variants share: the **"Why this insight?" drawer**, the **Voice deep-drill**, **Cmd+K** (always-available globally), and the **trust signals** (CI, citations, confidence chip).

---

## 1. The team's perspectives

Before describing the variants, each role brings their lens:

### Product Manager — Priya

> "Four variants is a feature, not a fragmentation. Legacy XM forces every CXO, analyst, and PM through the same UI; everyone hates it differently. Our standing refusal in [ENGINE_DECISIONS.md](ENGINE_DECISIONS.md) is 'no dashboard builder' — but we still need to honor the legitimate truth that users have different jobs. **Variants are our compromise: pre-built, opinionated, all-defaults, zero-config.** Each user picks one. We never let them configure their own. That preserves simplicity while serving multiple personas."

### UX Lead — Jordan

> "The 'Tactile Ether' system already gives us a rich vocabulary: glass-morphism, tonal depth, holographic overlays, soft extrusion, Three.js HeroCanvas, Framer Motion stagger. The variants exploit different parts of this vocabulary. Spatial Canvas leans heaviest on the 3D primitives. Cockpit refuses 3D for a pure 2D data-density move. Editorial uses 3D as a punctuation, not a backdrop. Conversation uses one 3D element — the crystal — as a focal point. **Each variant has a 'signature visual move' that the others don't.**"

### Engineering Lead — Sam

> "All four variants are powered by the *same* React Query hook, the *same* SSE stream, the *same* Insight card data, the *same* shadcn primitives. The variants are about 200 LOC each of layout. **Adding a fifth variant is a week of design work, not a quarter of engineering.** Three.js HeroCanvas is already in place; Framer Motion is already in place; pgvector + Cloud Run already deliver the data. The cost-to-build a variant is dominated by design polish, not infrastructure."

### Performance Engineer — Devi

> "The big perf concern is Variant A (Spatial Canvas) with Three.js running 24/7. The HeroCanvas at 60fps consumes ~10W on a laptop — fine for occasional use, expensive for an always-on analyst dashboard. **Spatial Canvas auto-pauses the 3D when the tab is hidden, drops to 30fps when no insight has streamed in for 30 seconds, and falls back to a static CSS gradient on devices with `prefers-reduced-motion` or under a 4GB RAM threshold.** Cockpit, Editorial, and Conversation are CSS-only and run anywhere."

---

## 2. Variant A — "Spatial Canvas" (the cinematic flagship)

**Tagline:** *Your customers' voices, as a constellation.*

### 2.1 The signature visual move

The entire viewport background is a live **Three.js HeroCanvas-style scene**, but with semantic meaning: each large floating gem in the 3D space corresponds to a top-priority insight. The cluster of gems behind a card is **its citation set**. Hovering or selecting a card highlights its gems in the background; the camera lazily parallaxes toward them.

The visual language: holographic overlays, glass cards, particle field, ambient lighting. Like the Landing Page hero, but the gems *mean* something.

### 2.2 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   [HeroCanvas in background — particles, floating gems, starfield]       │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │  Customer Onboarding Survey — May 2026                           │   │
│   │  312 responses · NPS 47 · regenerating every 60s                 │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌──────────────────────┐   ┌──────────────────────────────────────┐   │
│   │ NPS                  │   │  TOP PRIORITY — PRESCRIPTIVE         │   │
│   │  47                  │   │                                       │   │
│   │  ±5 90% CI · n=312   │   │  "Email verification loop"           │   │
│   │  [holographic gauge] │   │   raises NPS +3.2 if fixed           │   │
│   │                      │   │   Confidence 81 · 24 cited quotes    │   │
│   │  glass + soft-ext.   │   │                                       │   │
│   └──────────────────────┘   │  [ Create ticket ] [ View quotes ]   │   │
│                              └──────────────────────────────────────┘   │
│                                                                          │
│   ┌──────────────────────┐   ┌──────────────────────┐                   │
│   │ DRIVER               │   │ VOICE                │   ...              │
│   │  Support time #1     │   │  Onboarding (102)    │                   │
│   └──────────────────────┘   └──────────────────────┘                   │
│                                                                          │
│   ─── Live · 3 insights in last 60s · Last full scan 2m ago ─── ↻       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.3 PM analysis (Priya)

- **Audience:** Executives, board demos, marketing screenshots, sales kickoffs, customer beauty shots
- **Job to be done:** Communicate "we have an AI-native intelligence layer" in 5 seconds; one big number + one big action
- **Density:** Low. 5–7 cards visible. Generous whitespace. The 3D background is most of the canvas
- **Risk:** Power users find it slow to scan
- **Mitigation:** Easy switch to Cockpit; default for new orgs is Editorial (the middle ground)

### 2.4 UX analysis (Jordan)

- **Visual language:** Full HeroCanvas-style 3D, `glass-card-premium` for every card, `holographic` overlay on the priority card, `glow-purple` halo on prescriptive cards, soft-extrusion shadows
- **Motion:** Framer Motion fadeUp staggered, gems orbit gently behind cards, holographic aurora at 8s cycle on active cards
- **Card metaphor:** Cards as "floating intelligence panels" hovering in the volume — Tactile Ether at its strongest
- **Critical principle:** The 3D is not decorative; it *encodes* citation relationships. A card hover dims unrelated gems
- **Accessibility:** `prefers-reduced-motion` collapses to a static gradient backdrop; all data unchanged

### 2.5 Engineering analysis (Sam)

- **Components:** Reuses `HeroCanvas.tsx` with a new prop `mode="insights"` that adjusts particle/gem counts to ~12 (one per visible card) and links gem positions to card refs
- **Files:**
  - New: `app/src/pages/insights/SpatialCanvasView.tsx`
  - New: `app/src/components/insights/InsightGem.tsx` (a gem with semantic data binding)
  - Reuse: `app/src/hooks/useInsights.ts`, all card components
- **Data flow:** Same SSE → React Query → render loop. Three.js scene re-renders on insight set change (debounced)
- **State:** `useInsights()` already returns the data; only the layout layer changes
- **LOC estimate:** ~350 LOC new code

### 2.6 Performance analysis (Devi)

- **Frame budget:** Target 60fps on M-series MacBook; 30fps on mid-2023 mid-range Android; static fallback on devices <4GB RAM
- **Particle count:** 350 (HeroCanvas baseline); reducible to 150 on perf budget
- **GPU bandwidth:** ~10W laptop, ~3W high-end phone — acceptable for "premium" view
- **Throttling:** Auto-pause on tab hidden, 30fps after 30s idle, full-pause when no insight changes for 5 min
- **Cost on backend:** Identical to other variants — the rendering is client-side only

### 2.7 Verdict

**Ship as the second variant, after Editorial (the default).** It is the "investor deck" view, the "demo magic" view, the "first ProductHunt screenshot" view. **It also serves as the visual brand argument that we are not Qualtrics.**

---

## 3. Variant B — "Mission Cockpit" (the daily war-room)

**Tagline:** *Every signal, instantly. No 3D, no nonsense.*

### 3.1 The signature visual move

A **deliberately flat, ultra-dense layout** with three columns and ~30 insight elements visible at once. Soft-extrusion shadows for depth; tonal stacking for hierarchy; **no Three.js, no canvas, no glow on every card**. The 3D vocabulary is sparingly used — only the *priority hero card* gets a subtle holographic overlay. Everything else is fast, scannable, terminal-like.

Inspired by Bloomberg terminals, Slack's daily standups, and the war-room dashboards CX ops teams actually use.

### 3.2 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Onboarding Survey — May 2026 · 312 responses · Last scan 12s ago ↻      │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐  │
│ │ NPS         │ CSAT        │ CES         │ Completion  │ Top action  │  │
│ │ 47 ±5       │ 4.2 ±0.2    │ 2.4 ±0.3    │ 84% / 500   │ Fix verify  │  │
│ │ ▔▔▁▁▔▔      │ ▔▔▔▁▔       │ ▁▁▔▁        │ 4 days left │ +3.2 NPS    │  │
│ └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘  │
│                                                                          │
│ ┌─────────────────────────────┬─────────────────────────────┬──────────┐ │
│ │ PRIORITY FEED               │ VOICE                       │ TIMELINE │ │
│ │                             │                             │          │ │
│ │ ⚠ NPS -12 on May 10         │ ● Onboarding (102)          │ 12s NPS  │ │
│ │   anomaly · 92% conf        │   neg 76% · frustration     │   live   │ │
│ │   ─ 14 quotes · See ›       │ ● Pricing (47)              │          │ │
│ │                             │   neg 62%                   │ 30s VOI  │ │
│ │ 🔥 Support time #1 driver   │ ● Support time (32)         │   topic  │ │
│ │   importance 0.31 [0.24-.38]│   neu 51%                   │          │ │
│ │   ─ 8 quotes · See ›        │ ● Email verify (24) ◄       │ 2m FULL  │ │
│ │                             │   neg 92% · CRITICAL        │   scan   │ │
│ │ 💬 Email verify - 24 quotes │ ● Mobile crashes (19)       │          │ │
│ │   62% frustration           │ ● Feature parity (18)       │ ── auto  │ │
│ │   ─ Sample: "I wasted 15..."│ ● Doc clarity (12)          │  hourly  │ │
│ │                             │ ● ...                       │          │ │
│ │ 📈 Predicted NPS at 500     │                             │          │ │
│ │   51 ±4 by Friday           │ INTENT SIGNALS              │ EVENTS   │ │
│ │                             │ • churn 12  • suggest 31    │ May 10   │ │
│ │ + 6 more                    │ • praise 8  • complaint 67  │  ⚠ NPS   │ │
│ └─────────────────────────────┴─────────────────────────────┴──────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 PM analysis (Priya)

- **Audience:** CX ops leads, daily monitors, multi-monitor war-room operators, frontline managers
- **Job to be done:** Catch anomalies fast; never miss a signal; act within minutes; treat insights like a stock ticker
- **Density:** Highest. ~30 elements per screen. Information design first
- **Risk:** Overwhelming to a new user
- **Mitigation:** Never the default for new orgs. Opt-in. Power-user mode

### 3.4 UX analysis (Jordan)

- **Visual language:** `surface-container-lowest` rectangular cards, **no glass on most cards** (perf + clarity), `surface-container-low` page background, sparse use of `holographic` (only on the hero priority card)
- **Color:** Status semantics dominate — red for anomalies, amber for "needs attention", green for stable, slate for routine
- **Typography:** Inter throughout for legibility, Manrope only for tile values (the big numbers)
- **Motion:** Minimal — pulse-glow on live indicators, shimmer-sweep on freshly-arrived insights, fade-in for new items
- **3D vocabulary used:** `soft-extrusion` for cards, `pulse-glow` for "live" dots — that's it
- **Critical principle:** Density is the feature. Every pixel must justify itself

### 3.5 Engineering analysis (Sam)

- **Components:** Pure shadcn primitives (Card, Badge, ScrollArea). No Three.js. Three react columns with `ScrollArea` for overflow
- **Files:**
  - New: `app/src/pages/insights/CockpitView.tsx`
  - New: `app/src/components/insights/CompactInsightRow.tsx` (denser version of the card)
  - Reuse: `useInsights`, all existing primitives
- **LOC estimate:** ~250 LOC
- **Bundle cost:** Drops Three.js dependency *for this route only* via dynamic import in SpatialCanvas view, so Cockpit bundle is ~60% smaller

### 3.6 Performance (Devi)

- **Frame budget:** Effectively unlimited; no canvas
- **Render cost:** O(n) on insight count, low constant — re-render of <5ms even with 50 cards visible
- **Mobile:** Auto-collapses to single-column with horizontal scrolling tabs between Feed/Voice/Timeline
- **Best variant for** large-deployment SaaS customers with shared monitors

### 3.7 Verdict

**Ship as the third variant.** This is the variant most likely to drive daily active usage. **It is the win against Qualtrics on density and speed.** Every CX ops lead who tries it will tell their team. We make this the recommended view for users who tag themselves "analyst" or "ops" in onboarding.

---

## 4. Variant C — "Editorial Brief" (the default)

**Tagline:** *Today's intelligence, written for you.*

### 4.1 The signature visual move

A **magazine-like layout** — generous, hierarchical, narrative-driven. The top is a single **"Today's Brief"** narrative paragraph generated by the LLM (with citations, of course), a 3-tile metric strip below it, then a **bento grid** of insight cards in 2- and 3-column arrangements. **Subtle 3D**: a small `<HeroCanvas mode="compact" />` floats in the page header as a small "intelligence orb" — animated but contained, ~150px wide.

This is the variant for someone who wants to *read their insights* like a Monday morning briefing, not scan them like a ticker.

### 4.2 Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [intel orb]   Onboarding Survey                                            │
│               Customer Onboarding · May 2026 · 312 responses               │
│                                                                            │
│ ─── TODAY'S BRIEF ────────────────────────────────────────────────────── │
│                                                                            │
│  NPS held steady at 47 [r1102, r1188] with a brief 12-point dip on        │
│  May 10 [r2104, r2107] now recovered. The dominant driver of detractor    │
│  sentiment remains support response time, which moved from 4th to 1st     │
│  position in the last 30 days [r983, r1234]. The single highest-leverage  │
│  action this week is fixing the email verification loop — cited by 18    │
│  respondents, projected to raise NPS by 3.2 ±1.8 [r1188, r1234, r1492]. │
│                                                                            │
│                              [ Send to Slack ] [ Open as report ]         │
│                                                                            │
│ ─── METRICS ────────────────────────────────────────────────────────── │
│ ┌─────────────────┬─────────────────┬───────────────────────────────────┐ │
│ │ NPS             │ CSAT            │ TOP ACTION                        │ │
│ │  47 ±5          │ 4.2 ±0.2        │ Email verification loop           │ │
│ │  n=312          │ n=312           │ +3.2 NPS if fixed                 │ │
│ │  [gauge]        │ [bars]          │ [holographic gradient card]       │ │
│ └─────────────────┴─────────────────┴───────────────────────────────────┘ │
│                                                                            │
│ ─── DEEPER FINDINGS ────────────────────────────────────────────────── │
│ ┌──────────────────────────────┬──────────────────────────────┐           │
│ │ DRIVER                       │ ANOMALY                       │           │
│ │ Support time #1              │ NPS -12 on May 10            │           │
│ │ jumped from 4th in 30 days   │ likely linked to login error  │           │
│ └──────────────────────────────┴──────────────────────────────┘           │
│ ┌──────────────────────────────┬──────────────────────────────┐           │
│ │ VOICE — TOPIC                │ PREDICTIVE                    │           │
│ │ Onboarding friction (102)    │ NPS at 500 responses          │           │
│ │ 4 sub-themes                 │ 51 ±4 by Friday               │           │
│ └──────────────────────────────┴──────────────────────────────┘           │
│                                                                            │
│ ─── ASK INSIGHTS ───────────────────────────────────────────────────── │
│                                                                            │
│  ⌘K  Ask anything — "Why did NPS dip?" — "Which segment is at risk?"     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 PM analysis (Priya)

- **Audience:** PMs on Monday morning, CX leaders preparing weekly reviews, anyone consuming insights rather than producing them
- **Job to be done:** Catch up on a survey's state in 90 seconds; copy the brief into a Slack message; one-click-to-action
- **Density:** Medium. ~12–15 elements per screen. Hierarchical
- **Risk:** Less screen-grabbing than Spatial Canvas; less dense than Cockpit. But the right *default*
- **Editorial Brief is the default** for new orgs. The narrative paragraph at the top is the killer feature

### 4.4 UX analysis (Jordan)

- **Visual language:** Editorial typography (Manrope display sizes for the brief, generous line-height), `glass-card-premium` for metric tiles, `holographic` overlay on the Top Action tile only, `soft-extrusion` shadows throughout
- **Bento grid:** Asymmetric 2/3-column blend, larger card for the headline finding
- **Subtle 3D:** A small `HeroCanvas` in compact mode (150×150px) anchored in the page title area; auto-pauses when off-screen
- **Motion:** fadeUp stagger with longer durations (0.8s); brief paragraph types in word-by-word for the first generate (then static on re-renders)
- **Citations:** Inline `[rXXX]` chips with hover preview of the quote; click opens the same `WhyThisInsight` drawer used in other variants

### 4.5 Engineering analysis (Sam)

- **Components:** Mix of shadcn + a new `BriefParagraph` component that handles citation chip rendering inline
- **Files:**
  - New: `app/src/pages/insights/EditorialBriefView.tsx`
  - New: `app/src/components/insights/BriefParagraph.tsx` (parses `[rXXX]` markers and renders chips inline with hover-cards)
  - New: `app/src/components/insights/CompactHeroCanvas.tsx` (a 150×150 HeroCanvas with low particle count)
  - Reuse: All metric tile primitives
- **Data:** Reads from same `useInsights()` + a new `useInsightBrief()` that fetches the LLM-narrated paragraph (~$0.0005/call, cached for 5 min)
- **LOC estimate:** ~400 LOC

### 4.6 Performance (Devi)

- **Frame budget:** Compact HeroCanvas drops to ~2W on laptop — acceptable for default view
- **Lazy mount:** Brief paragraph is server-rendered on first request, then live-updated; no LLM call on page navigation if cached
- **Mobile:** Brief paragraph becomes accordion; compact 3D orb pauses on mobile <4GB RAM

### 4.7 Verdict

**This is the default variant.** New users land here. It tells the product story (citations, narratives, actions) without overwhelming. It is also the most likely to convert free → paid because the "Today's Brief" feature is something a free user gets immediately and instantly internalizes value from.

---

## 5. Variant D — "Conversation Studio" (the AI-native interface)

**Tagline:** *Ask. Cite. Act.*

### 5.1 The signature visual move

The entire page is a **chat interface**. Cmd+K isn't a modal — it's the page. Top center: a single **3D crystal** (a low-poly icosahedron with `MeshDistortMaterial`, ~200px) that pulses with each query. Below it: the conversation history. Each AI answer is a fully-cited response with chips and a card preview. Below the conversation: "Today's auto-surfaced findings" — a feed of insights that arrived without being asked.

The visual: minimal, almost meditative. One 3D element. Glass for chat bubbles. Holographic effect on the crystal.

### 5.2 Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                              [3D crystal — pulses]                         │
│                                                                            │
│                    Ask anything about this survey                          │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ ⌨️  Type a question or 🎙️ press to speak                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  ─── CONVERSATION ──────────────────────────────────────────────────── │
│                                                                            │
│  You · 2m ago                                                              │
│  → Why did NPS drop on May 10?                                            │
│                                                                            │
│  Crystal · just now                                                        │
│  ↩ NPS dropped 12 points (47 → 35) on May 10, outside the 95%             │
│    prediction interval [r2104, r2107]. Two signals correlate: a spike     │
│    of 14 responses mentioning "login error" in the same 24h window         │
│    and average sentiment dropping from +0.12 to −0.41 [r2111, r2114].    │
│                                                                            │
│    Likely root cause: the 2026-05-10 14:12 UTC login outage.              │
│                                                                            │
│    Confidence: 84 · Method: Bayesian changepoint + topic correlation      │
│                                                                            │
│    [ Show the 14 quotes ]  [ Pin this answer ]  [ Create ticket ]         │
│                                                                            │
│  ─── AUTO-SURFACED TODAY ────────────────────────────────────────────── │
│                                                                            │
│  💡 "Email verification loop" is now the top driver of detractor          │
│      sentiment — automatically surfaced 2 hours ago.  [ Read ]            │
│                                                                            │
│  📈 Response velocity 2.3× normal — likely the email campaign you        │
│      launched yesterday.  [ Read ]                                         │
│                                                                            │
│  ⚠ Sample bias: 73% of responses from Enterprise tier. The aggregate     │
│      NPS may overstate SMB experience.  [ Read ]                          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 PM analysis (Priya)

- **Audience:** AI-native teams, founder-led companies, engineers, anyone whose default tool is ChatGPT or Claude
- **Job to be done:** Talk to your data; ask follow-ups; treat insights as conversation, not configuration
- **Density:** Low. Single conversation thread + a small feed
- **Risk:** A first-time user might not know what to ask
- **Mitigation:** The auto-surfaced feed is always there, populated by the same pipeline that drives the other variants. The conversation is the *bonus*, not the only surface

### 5.4 UX analysis (Jordan)

- **Visual language:** Minimal. `surface-bright` background. Glass chat bubbles. The crystal is the entire visual emphasis. **One 3D element, doing all the work**
- **Crystal:** Reuses the central icosahedron primitive from `HeroCanvas.tsx`, isolated to ~200×200px in the top center. Pulses with each query (scale animation), distorts more during LLM generation, returns to idle. Holographic aurora at 15s cycle when idle
- **Motion:** Typing indicator while LLM is generating, conversation bubbles fadeUp on arrival, citation chips have subtle shimmer-sweep on hover
- **Critical principle:** The page should feel like talking to a quietly brilliant analyst

### 5.5 Engineering analysis (Sam)

- **Components:** New chat surface + isolated 3D crystal + a streaming response renderer
- **Files:**
  - New: `app/src/pages/insights/ConversationView.tsx`
  - New: `app/src/components/insights/InsightCrystal.tsx` (the 3D focal element, props for state: idle/listening/generating)
  - New: `app/src/components/insights/AnswerBubble.tsx` (renders LLM response with citation chips + action buttons)
  - Reuse: The Cmd+K backend route `/api/insights/ask` (specced in [ARCHITECTURE.md §9](ARCHITECTURE.md))
- **Voice input:** Optional. Whisper or Web Speech API. Defer to v2
- **LOC estimate:** ~350 LOC

### 5.6 Performance (Devi)

- **Frame budget:** One Three.js scene with one mesh — under 3W. Trivial
- **LLM cost:** Each question is ~$0.0004 (per [OPERATIONS_ECONOMICS.md §2.3](OPERATIONS_ECONOMICS.md))
- **Conversation history:** Stored per-user, capped at 50 turns; persisted in `copilot_sessions` table (already exists)

### 5.7 Verdict

**Ship as the fourth variant, after the others.** This is our **HN-friendly, AI-native flag-planting**. The 60-second agentic demo for the homepage will be filmed against this variant. It is also the simplest implementation and the cheapest to maintain, since it's mostly UI on top of an endpoint that already exists in our architecture.

---

## 6. Cross-variant requirements

Every variant ships these — non-negotiable:

| Requirement | Where it appears |
|---|---|
| **Confidence chip + sample size** | On every card / answer / metric |
| **Citation chips** | Inline `[rXXX]` in narratives, hoverable |
| **"Why this insight?" drawer** | Click → drawer (same in all variants) |
| **Cmd+K global overlay** | Available everywhere except inside ConversationView (which IS Cmd+K) |
| **Variant switcher** | Top-right of the page header, persists user choice |
| **Brand colors / logo** | Pulled from BrandSettings as today |
| **Streaming SSE** | All variants subscribe to `/api/insights/:id/stream` |
| **Trust signals always-visible** | No hover-to-reveal trust info anywhere |

These cross-variant guarantees mean a user can switch variants at any time and not lose context.

---

## 7. The variant picker (settings)

In Settings → Insights Display:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ How do you want to view insights?                                        │
│                                                                          │
│ ○ Editorial Brief  (Recommended — daily readable summary)               │
│ ○ Spatial Canvas   (Cinematic — for demos, executive views)             │
│ ○ Mission Cockpit  (Dense — for ops teams, monitoring)                  │
│ ○ Conversation     (Chat-first — ask anything, see auto-findings)        │
│                                                                          │
│ ☑ Use the same variant on every survey                                  │
│ ☐ Auto-select Cockpit on shared/TV displays                             │
│                                                                          │
│ ───                                                                      │
│                                                                          │
│ Reduced motion:  ⦿ Match system  ○ Always reduce  ○ Always full         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Only four choices. No customization beyond this. The standing refusal from [ENGINE_DECISIONS.md §3](ENGINE_DECISIONS.md) holds: no layout builder.

---

## 8. Shipping order

The team agrees on this order:

| Order | Variant | Sprint | Why first/last |
|---|---|---|---|
| 1 | **Editorial Brief** (default) | Sprint 4-5 | Best landing experience; gets us to "production quality default" first |
| 2 | **Mission Cockpit** | Sprint 6 | Highest daily-active driver; serves the most demanding users |
| 3 | **Spatial Canvas** | Sprint 7 (or pulled forward for demo) | Big visual brand asset; can be filmed and shared independently |
| 4 | **Conversation Studio** | Sprint 7A (parallel with skills work) | Composes with the Cmd+K backend we're already building |

If marketing pulls hard for the brand asset, Spatial Canvas can be promoted to sprint 5 alongside Editorial. The other two stay in their order.

---

## 9. Risks and trade-offs we are accepting

1. **Four variants is more surface to maintain.** True. But each is ~300–400 LOC of layout. Total maintenance is ~1,500 LOC of UI code; the underlying engine is shared.
2. **Users might be confused which to pick.** True. Mitigation: opinionated default (Editorial), opinionated per-role suggestion at onboarding ("you're a CX ops lead — try Cockpit").
3. **3D in Spatial Canvas excludes some devices.** True. Static-gradient fallback is good enough for those users; the data and interaction model are unchanged.
4. **Conversation Studio depends on a high-quality NLQ pipeline.** True. This is the riskiest variant. We hold its release until the citation-validity rate on NLQ is >99% on our internal test corpus.

---

## 10. What we are NOT building

In the spirit of [ENGINE_DECISIONS.md §3](ENGINE_DECISIONS.md):

- **No fifth variant "Custom"** — the user cannot configure their own layout
- **No widget marketplace** — Editorial's cards are fixed, not draggable
- **No theme tokens beyond brand colors** — every variant uses the existing palette
- **No per-variant feature gating** — every variant gets the same insights from the same engine
- **No "variant builder"** — variants are shipped, not configured

The variants are an opinionated, pre-built menu. Choosing one is one decision. Once chosen, it just works.

---

## 11. Mockups

HTML mockups for each variant live alongside the existing design library:

- `Designs/experient_insights_v2_spatial/` — Variant A
- `Designs/experient_insights_v2_cockpit/` — Variant B
- `Designs/experient_insights_v2_editorial/` — Variant C
- `Designs/experient_insights_v2_conversation/` — Variant D

Each `code.html` is a self-contained Tailwind-via-CDN page using the existing design tokens. They are visual references, not the production code (which lives in `app/src/pages/insights/`).

---

## 12. The shipping bet

Five sprints from now, we ship four variants on one engine. Each variant is the best-in-class option for its persona. **No legacy XM competitor ships any single one of these layouts well. We ship all four.** That is the practical meaning of "more value, simpler, cheaper."

The bet pays off if:
- Editorial converts free → paid above 5%
- Cockpit drives DAU among paid customers above 60%
- Spatial Canvas appears in one major sales demo or PR placement
- Conversation Studio drives the agentic-demo viral moment

Each is a separable success criterion. None is a single point of failure.
