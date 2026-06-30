# Prism — Strategy & Operating Modes

**Status:** Canonical strategy + vision + GTM (spectrum model is the core thesis; pricing numbers pending committee)
**Date:** 2026-06-29
**Owners:** Marcus Adeyemi, Naomi Bergström, Lena Vasquez

> Consolidates the product vision, the operating-mode strategy, and the go-to-market plan
> into one canonical doc. Prism is **not a migration tool** — migration is the *deepest*
> point on a spectrum. It is the **on-ramp to Xperiq intelligence at any level of
> commitment**: keep your data where it is and only get smarter on new data, or bring
> everything and choose how much history to light up. **You don't have to leave to get
> value — and you're never forced to ingest more than you'll pay to process.**

---

## 1. Name & vision

**Prism** — *the way every source of experience is refracted into one spectrum of insight.* A prism takes many scattered beams (a Qualtrics export, a Medallia feed, Google reviews, a Typeform CSV) and refracts them into one coherent spectrum Crystal can reason over. It ties to Crystal (light passes *through a prism, into a crystal*), names what it does (refraction = transform + separate), is short/ownable/global, and *is* the brand gradient (`#2a4bd9 → #8329c8 → #00647c`). UI: *Prism*; marketing: *Prism by Xperiq*. (Alternatives Confluence/Harbor/Influx/Onramp rejected — see [`architecture-review.md`](./architecture-review.md) (ADR-001).)

**The problem:** enterprises don't stay because the incumbent is best — they stay because leaving is terrifying. The incumbent holds history (years of NPS/CSAT/CES trend lines), definitions (surveys, logic, directories), taxonomy (tuned TA models), and trust ("the number means the same as last year"). Switching today = a 3–6mo services engagement, CSV graveyard, hand-rebuilt surveys, a broken trend line at cutover, and a quarter of "do we trust the new numbers?"

> **Vision: Bring everything. Lose nothing. See more.**
> **You don't have to leave to get value.** Prism is a spectrum, not a one-way migration:
> keep your data in the incumbent and let Crystal run insight on new data (**Augment**),
> bring everything and choose how much history to light up (**Ingest**), or move fully
> over (**Migrate**). Enter anywhere; move at your pace. The moment data lands, Crystal
> re-derives richer AI-native insight than the customer ever had — migration stops being a
> project and becomes a button.

---

## 2. Product principles

Eight non-negotiables — every design and code review checks against them.

| # | Principle | What it means |
|---|---|---|
| 1 | **No silent transformation** | Every mapping/recompute/dedupe/dropped field shown in a **dry-run diff** before any write; customer approves, Prism executes ("Crystal proposes, the app executes"). |
| 2 | **Lossless by default** | Never discard source data; unmappable data preserved as raw payload + embedded data; re-mapping always possible later. |
| 3 | **Continuity is sacred** | Imported history keeps original timestamps; trend lines continuous across cutover; never re-baseline a metric without showing before/after. |
| 4 | **Provenance on every datapoint** | Every row carries `source_platform`, `source_record_id`, `import_batch_id` — trace any number to its source record. |
| 5 | **Compliant by construction** | Ingest only what each source's API + ToS permit; public reviews are API-only, never scraped ([`security-compliance.md`](./security-compliance.md)). |
| 6 | **Insight on arrival** | Import is "done" when Crystal has re-enriched and the first insight is on screen, not when data lands. |
| 7 | **Self-serve where possible, services where needed** | Long tail fully self-serve; enterprise tier (Qualtrics, Medallia) gets guided, services-assisted flow — same engine underneath. |
| 8 | **It must feel like Xperiq** | Same shell, brand spectrum, Crystal panel, calm motion — a native surface, not a bolted-on importer. |

**The bar (best-in-class targets):** TTFI < 1hr self-serve (vs 2–6 wks); AI-suggested mapping (vs spreadsheets); dry-run diff + reconciliation (vs import-and-pray); continuous trend lines (vs broken at cutover); metric parity shown (vs unexplained recompute); idempotent/resumable/exactly-once; reviews via official APIs only.

---

## 3. The Prism spectrum — three operating modes

A customer picks a mode **per source** and can move rightward anytime. Same engine, same contracts; modes differ in **what we store** and **what we process**.

```
   LOWEST COMMITMENT                                          DEEPEST
   ┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
   │ 1. AUGMENT      │ ──▶ │ 2. INGEST            │ ──▶ │ 3. MIGRATE       │
   │   "Prism Live"  │     │  (tiered intelligence)│     │   (cutover)      │
   ├─────────────────┤     ├──────────────────────┤     ├──────────────────┤
   │ Data stays in   │     │ All data ingested     │     │ Xperiq is system │
   │ the incumbent;  │     │ into Xperiq; tiered   │     │ of record;       │
   │ Prism reads NEW │     │ processing (§4).      │     │ incumbent        │
   │ data only;      │     │ Full history kept,    │     │ decommissioned   │
   │ Crystal insight │     │ continuity preserved. │     │ (dated cutover). │
   │ on new data;    │     │                       │     │                  │
   │ no history kept.│     │                       │     │                  │
   └─────────────────┘     └──────────────────────┘     └──────────────────┘
```

| Mode | What it does | Commitment / role |
|---|---|---|
| **1. Augment** ("Prism Live") | Connect incumbent (or any source) **read-only**; ingest **only new data** from connection point forward (streaming/incremental); **no history stored**. Crystal runs the live insight pipeline on new data → response-level, checkpoint-based intelligence. Incumbent topics/taxonomy imported as **reference** so insight speaks the existing vocabulary immediately (no cold start). | Lowest-commitment entry — risk nothing, store nothing historical, prove Crystal out-insights the incumbent on the customer's own live feed. **The primary wedge.** |
| **2. Ingest** | Ingest the **entire** history into Xperiq (full pipeline EXTRACT→…→LOAD→RECONCILE, with continuity + provenance + reconciliation). Intelligence is **tiered** (§4). Taxonomy + per-record topics reconciled into the living topic registry, then improved by re-enrichment. | Steady state most enterprises live in. Migrate is a later, optional step. |
| **3. Migrate** | Mode 2 **+ dated cutover**: Xperiq becomes system of record, distributions/collection move over, incumbent decommissioned. Clean dated cutover ([`operations-runbook.md`](./operations-runbook.md)) — no two-way sync. | Deepest commitment (system of record). |

> **Continuum, not separate products.** A customer flows Augment → Ingest → Migrate at
> their own pace; each step *increases* trust and value while we already hold the
> relationship — without re-connecting or losing the insight trail.

---

## 4. Tiered-intelligence model (the core mechanic)

The breakthrough: **decouple ingestion from processing.** Ingest everything (cheap — it's storage), but run expensive Crystal intelligence on a **tiered** basis so cost tracks value. All three tiers reuse **Insight Pipeline v2** (checkpoints, automated + manual/custom lanes, `meaningful_delta`, lineage) — Prism adds *time-window orchestration*, not a new engine.

```
                        INGESTED DATA (all of it, stored, reconciled)
   ◀──────────────── time ──────────────────────────────────────────────────▶
   [  deep past (years)  ][  older history  ][ last 1–12mo history │ NEW DATA ▶ ]
            │                     │                    │               │
     ON-DEMAND (custom)     BATCH SNAPSHOTS      CHECKPOINTED      ALWAYS
     compute on request     slow background      (history_window)  CHECKPOINTED
     → insight+checkpoint    → snapshot ckpts    real-time         (no setting)
```

| Tier | Scope | Behavior |
|---|---|---|
| **A — Live checkpointing** | **New data (always)** + a configurable **`history_window` of 1–12mo** (default ~3) of recent history | **New data is ALWAYS checkpointed in real time — no setting.** Everything from the connection point forward runs the live, response-level pipeline like native Xperiq data. The *only* configurable thing is how much **existing history** to *also* checkpoint (per survey/source/org). History older than the window → Tier B/C. |
| **B — Historical backfill** | Everything older than the live window | Processed **slowly, in batches, in the background** (Insight Pipeline v2 automated lane) → **snapshot insight checkpoints** per period (e.g. quarter/wave). Seeds the trail so trends + `meaningful_delta` are continuous from history into the live window. Throttled, resumable, deferrable ("enrich overnight"), credit-metered — never blocks import (Mode 2 is "done" at RECONCILE; intelligence fills in progressively). |
| **C — On-demand custom** | Any older timeframe not yet snapshotted, or a fresh custom cut | Customer specifies a window; Prism **computes insight on the fly** and **generates a checkpoint when requested** via the custom-analysis lane. Deep past is never *lost* (ingested) nor *wasted* (not pre-processed) — one click away. |

> Plain version: **New data → always checkpointed.** **Old data → pick 1–12 months of
> recent history to checkpoint too; everything older is batch / on-demand.**

**Why it's right:** *Cost tracks value* — a 50M-response migration triggers live-window streaming + paced snapshots + on-demand for the rest, not 50M enrichments up front; **credits track PROCESSED intelligence (live + batch + on-demand), not ingested rows** (FinOps unlock, [`architecture-ingestion.md`](./architecture-ingestion.md)). *Reuses what we built.* *Scales the promise* — "live insight on arrival, historical insight progressively, any-era insight on demand."

**Topics & metadata, all modes, day one:** incumbent topics/taxonomies/custom fields/hierarchies/metadata import as first-class (via `taxonomy-mapper`) regardless of mode — reference in Augment, reconciled + re-enriched in Ingest/Migrate; embedded data, contact attributes, unit/role hierarchies, metric definitions all carry over losslessly.

---

## 5. Build / buy — thin-SDK default

**Extraction is partly a commodity; the fidelity + insight layer is the moat.** Default to **borrowing commodity extraction** behind the SDK; build only where differentiation lives. A "borrowed" extractor is just another `extract()` implementation behind the [`source-platforms-catalog.md`](./source-platforms-catalog.md) / connector-SDK contract.

| Layer | Build or borrow | Why |
|---|---|---|
| EXTRACT (standard/long-tail) | **Borrow** — self-hosted Airbyte / managed OAuth (Nango); data stays in our infra (compliance) | Commodity; accelerates breadth, saves a connector phase |
| EXTRACT (fidelity-critical: Qualtrics defs+parity, Medallia) | **Build** | Differentiation lives here |
| TRANSFORM / MAP / parity / reconcile / tiered intelligence | **Build (always ours)** | The moat — no vendor does this |

[⚠ verify each vendor's survey-platform coverage + self-host data-residency terms before committing.]

---

## 6. GTM thesis & weapons

Everything ladders to the discovery sentence: **"Nobody fears the new platform, everybody fears the move."** Prism's GTM is engineered to delete that fear.

1. **Migration is the acquisition engine.** Attack the incumbent's deepest moat — switching cost. Make leaving free, safe, fast, so the only question is "is Xperiq better?" (it is, day one).
2. **Intelligence + continuous ingestion is the retention engine.** Once a source flows, value compounds: more data → more insight → more credits → deeper commitment. Metered tiered intelligence (§4) grows revenue with realized value, not seat count.
3. **Augment is the wedge.** "You don't have to leave to get value." Connect read-only, store no history, risk nothing, watch Crystal out-insight the incumbent on the customer's own feed — the lowest-friction "yes" in the category.

**Strategic inversion:** every other vendor's GTM makes the buyer commit *before* value (rip-and-replace, SOW, "trust us"). Prism delivers **value first, commitment later, at the customer's pace** — we monetize the value, not the lock-in.

**GTM weapons:** **Funded / done-for-you migration** (turn the incumbent's migration-cost moat into our acquisition channel; cheap because Augment delivers most proof before any paid migration) · **Radical anti-lock-in export** (one-click full export, marketed — "we'll never trap you the way they did"; credible *because* we built world-class ingestion) · **Wedge sequencing** (lead with the universal AI any-schema importer — CSV/Excel/SPSS + AI mapping, broadest reach, compliant, no GBP lead-time, fastest "wow", near-zero per-source cost — then Augment connectors, then deep enterprise migration).

```
   Augment (land, ~free) → prove Crystal out-insights incumbent on live data
        ▼
   Ingest (expand, credits) ◀── trust earned ── "now bring the history"
        ▼
   Migrate (enterprise, funded services) ── become system of record
        ▼
   Reference + win/loss citing Prism ── fuels next displacement
```

---

## 7. ICP & segmentation

Four segments, each mapped to a discovery archetype and a **natural entry mode**. Don't force every segment to the same door.

| Segment | Archetype | Economic buyer / champion | Core pain & trigger | Entry mode |
|---|---|---|---|---|
| **Enterprise switchers** | C1 bank (Qualtrics), C2 health (Medallia) | CX/EX SVP / CCO (CFO co-signs); VP Cust/Patient Exp | Locked by history + tuned taxonomy; can't defend a migration to the board. Trigger: renewal price hike, TA decay, new CXO mandate | **Augment** → **Migrate** (funded) |
| **Tool-consolidators** | C3 B2B SaaS (SurveyMonkey + Typeform + Forms) | VP CS Ops / RevOps; Head of CS Ops | Sprawl, 3 bills, duplicate contacts, no single view. Trigger: budget review, price hike, "consolidate vendors" mandate | **Ingest** self-serve via AI importer |
| **Multi-location / reviews** | C5 restaurant group (Google + Yelp) | SVP Ops / Guest Exp; field-ops or marketing lead | Guest voice scattered across listings; survey NPS apart from reviews. Trigger: reputation incident, bad outlier, loyalty launch | **Augment** (owned reviews as live signals) → Ingest |
| **EDU / research** | C4 university (Qualtrics + Forms) | Dir. Institutional Research (Provost/CIO co-sign); IR analyst | Longitudinal trend lines must survive (semester-anchored); IRB consent + retention. Trigger: renewal, grant cycle, governance audit | **Ingest** (exact timestamps) + services touch |

**Disqualifiers (say so early):** buyers with no incumbent and no data (net-new Xperiq sale, not Prism); buyers whose only feedback is in a store-prohibited third-party source (display-only widgets, not ingestion — [`source-platforms-catalog.md`](./source-platforms-catalog.md)); two-way-sync seekers (nobody wants it; poor fit if they insist).

---

## 8. Positioning & messaging

**Category:** not "a migration tool" (commodity) — **the on-ramp to AI-native experience management**; the category is **"experience-data liberation"**: your feedback/history/taxonomy freed from the platform holding it hostage and made smarter the moment it lands.

**One-liner:** *Prism. Bring everything. Lose nothing. See more.* — Connect any experience platform, keep your data where it is or bring it all over, and get richer AI insight from Crystal on day one than you ever had on the platform you're leaving.

**Three proof points (every asset/demo/battlecard repeats):** **(1) No data loss** — lossless, original timestamps, provenance, signed reconciliation report. **(2) Day-one better insight** — Crystal re-derives topics/metrics so day one beats the incumbent's last day. **(3) No lock-in** — radical marketed export.

| Segment | The promise (their words) |
|---|---|
| Enterprise switchers | "Six years of NPS arrive with the trend line unbroken and the number computed identically — proven by a signed reconciliation report before you sign anything." |
| Tool-consolidators | "Pull SurveyMonkey, Typeform, and Forms into one place yourself in an afternoon — deduped, unified, no services call." |
| Multi-location / reviews | "Every owned listing's reviews next to your survey NPS — ask Crystal 'what's going wrong in Dallas' — via real APIs, never scraped." |
| EDU / research | "Fall 2023 stays Fall 2023. Every timestamp, every wave, preserved exactly — with the consent and retention controls your IRB requires." |

**Foundation message:** *"You don't have to leave to get value."* (the Augment wedge — the spectrum, not a cutover).

---

## 9. Pricing & packaging

Packaging maps **directly** to the three modes. Principle: **price the value (processed intelligence + services), never the data sitting still.**

| Mode | Package | What's processed / paid for | Motion | Funnel role |
|---|---|---|---|---|
| **Augment** | **Prism Live** | New data only (always checkpointed); **no history stored** — thin streaming slice. Free / low-friction front door | PLG self-serve | **LAND** |
| **Ingest** | **Prism Ingest** | All ingested; live checkpointing + chosen `history_window` (1–12mo) + paced batch snapshots + on-demand. Storage + **metered credits** (track processed, not ingested) | PLG → sales-assist | **EXPAND** |
| **Migrate** | **Prism Migrate** | Ingest + cutover + **Migration Services** (optionally funded), reconciliation sign-off, cutover runbook | Enterprise sales | **ENTERPRISE / SoR** |

**How continuous Augment is priced (no surprise bills — say loudly):** new-data-only, so no "we re-enriched your 50M-row history overnight" bill (Augment never touches history); **generous free monthly allowance** sized so a real one-source evaluation costs nothing, then the same transparent **credits** that govern all Crystal usage; **spend controls first-class** — per-org caps, soft-limit alerts, a hard ceiling that *pauses* (never silently bills); **no bill shock on graduation** — Augment → Ingest previews the estimated credit cost of lighting up the chosen `history_window` *before* the customer confirms.

**Free-migration economics (displacement weapon):** a **CAC line, not a loss** — Augment delivers most proof first (funded migration closes an already-convinced buyer, higher win-rate/dollar); the borrowed-extractor split drops marginal self-serve migration cost toward zero (reserve human services for T1 closers); funding is **gated + conditional** (competitive-displacement deals above a size threshold, often a **credit grant** that recovers as expansion); TCO framing: a fraction of what the buyer saves leaving the incumbent's renewal — a multi-year credits annuity for a one-time capped cost.

> [⚠] Free-allowance size, credit-per-checkpoint rate, and Ingest storage pricing are
> **owned by the pricing committee, not yet ratified.** The *structure* (free Augment →
> metered Ingest → services Migrate) is decided; the numbers are not. Assets quoting
> prices are gated on ratification.

---

## 10. Sales motion (dual PLG + enterprise)

One product, one engine, two doors.

- **Motion A — PLG self-serve (Augment + AI importer):** default for consolidators, multi-location, and the *first touch* of every enterprise account. Sign up → connect a source (or drag a CSV/Excel/SPSS) → AI-suggested mapping → dry-run diff → **first Crystal insight in minutes**, no sales contact. Monetizes via credits; product-qualified signals route to sales-assist.
- **Motion B — Enterprise sales (Migrate) + Migration Services:** for T1 switchers (Qualtrics/Medallia/InMoment/Forsta) where data gravity, compliance, procurement demand a guided flow. Same engine, services-assisted: account team handles provisioning (esp. Medallia's gated access), reconciliation sign-off, dated cutover runbook. Where **funded migration** and the **signed reconciliation report** deploy as closing levers.

**Sales-assist hand-off triggers:** enterprise domain + incumbent = Qualtrics/Medallia on connect → route to AE in 1 day, offer Augment POC · credit consumption crosses expansion threshold → CSM "ready to bring history?" · source list includes a services-gated connector (Medallia SFTP, InMoment) → auto-engage Migration Services · buyer requests reconciliation report / security review / DPA → enterprise track · multi-source consolidation > N sources or > X contacts → identity-resolution + governance review.

**The killer demo ("connect → first Crystal insight in minutes"):** connect the prospect's own Qualtrics read-only in Augment ("your data stays in Qualtrics") → AI mapping + dry-run diff ("nothing written yet") → Crystal surfaces an insight their incumbent's Text iQ *didn't* (out-insighting on their own data) → upsell: "that was just new data — imagine this on six years of history, one click, trend line intact."

---

## 11. Competitive battlecards

Universal threads: **anti-lock-in export** ("we'll never trap you") + **funded migration** ("we'll pay to set you free"). Structural truth ([`source-platforms-catalog.md`](./source-platforms-catalog.md)): *data migrates; intelligence rebuilds* — their proprietary TA models/dashboards never export, but Crystal **re-derives** them, often better.

| Incumbent | Their lock-in | Our counter | Play & landmines |
|---|---|---|---|
| **Qualtrics** | Data gravity (XM Directory, years of NPS, Text iQ taxonomies); dashboards/Stats iQ/Text iQ **don't export**; contract inertia | Most open export in category (QSF + async response export + directory); import losslessly, recompute NPS/CSAT/CES with **parity check**, rebuild Text iQ as a *living* registry | Augment live → out-insight Text iQ → funded Migrate at renewal. **Landmines:** no pixel-perfect re-creation (anti-requirement); CSAT/CES are dashboard metrics — recompute + prove parity; large exports rate-limited |
| **Medallia** | Hardest export — bulk history is **PS/account-gated SFTP**; Athena TA proprietary; "getting data out is the hard part" (C2) | We do the hard part: Services drives SFTP/provisioning, ingest **signals** (call summaries, hotline), "take the labels not the labeler" (import Athena outputs to seed `taxonomy-mapper`), HIPAA-grade | Funded white-glove Migrate is the *whole* pitch; Augment harder (gated). **Landmines:** provisioning lead-time real [⚠]; never promise self-serve Medallia |
| **InMoment / Forsta** | InMoment **most closed** (no public self-serve REST; account/PS SFTP/CSV). Forsta actually has clean portable formats (DDF/MDD, triple-S, SPSS, Decipher REST) but customers don't know it | InMoment → one-time bulk SFTP/CSV + Wootric API where used (lowest confidence [⚠]). Forsta → lean into good formats: "more portable than you think — days, not months" | Forsta = *fast* win, prioritize as proof logos; InMoment = services-led, lead with anti-lock-in. **Landmines:** hedge InMoment fidelity [⚠]; verify Forsta endpoints post-rebrand |
| **SurveyMonkey / Typeform** | Soft lock-in: per-seat/response pricing, scattered ownership, duplicate contacts; SurveyMonkey **doesn't expose conditional logic**; 500/day API cap | Self-serve consolidation via AI importer: pull all three, **dedupe/identity-resolve**, unify for Crystal; Typeform logic imports best-in-catalog; SurveyMonkey unexposed logic **flagged in dry-run** (Principle 1) | Pure PLG land-and-expand, no sales call (C3); win on "one bill, one place, deduped." **Landmines:** be upfront SurveyMonkey skip-logic / MS Forms structure don't come over; 500/day = multi-day paced backfill |

---

## 12. Launch waves, demand gen, funnel & KPIs

**Launch waves tie to engineering phases** ([`engineering-plan.md`](./engineering-plan.md), [`architecture-review.md`](./architecture-review.md)) and the connector build sequence. **We do not market a mode or connector before its fidelity-certification gate passes.**

| Phase | Engineering gate | GTM motion | Connectors live | Modes live |
|---|---|---|---|---|
| **P0 — Internal** | Ingestion engine + CSV end-to-end; idempotency proof; observability + fidelity harness | No external GTM; build killer demo; train Services; draft battlecards | CSV/Excel/SPSS (W1) | Ingest (internal) |
| **DP beta** | W1 certified (CSV/SPSS · Qualtrics · Typeform); Augment shipped | Design-partner program (5 discovery accounts); private; first reference quotes | + Qualtrics, Typeform | + **Augment** |
| **GA wave 1** | W2 certified; spend controls + credits live | Public: AI importer + Augment wedge + connector gallery; PLG opens; "switching is safe" content launches | + SurveyMonkey, Google Forms, GBP, Apple ASC, Google Play | Augment + Ingest |
| **GA wave 2** | W3 certified; Medallia provisioning + funded-migration program live | Enterprise displacement ABM; Migration Services GA; funded Migrate | + Medallia, Alchemer, Trustpilot, Forsta | + **Migrate** |
| **GA wave 3** | W4 | Long-tail + display-only widgets; connector-partner program | + Jotform, QSF/triple-S, display-only widgets | full spectrum |

**Design partners (5 discovery accounts):** C1 bank (Qualtrics, Augment→Migrate, flagship reference) · C2 health (Medallia, funded Migrate, "impossible export" proof) · C3 SaaS (3-tool, Ingest PLG, self-serve validation) · C4 university (Qualtrics+Forms, Ingest, EDU reference) · C5 restaurants (Google+Yelp, Augment, multi-location reference). Beta success = TTFI < 60min, 100% trend continuity, reconciliation pass.

**Demand gen:** "Switching is safe" content engine (Naomi) · connector gallery SEO/PLG surface, page-per-source (Marcus) · connector ecosystem as a channel ([`source-platforms-catalog.md`](./source-platforms-catalog.md)) · SI/consulting partnerships (turn migration-services firms into our delivery arm — Raj) · event/field "out-insight your incumbent" demos · renewal-timed ABM against Qualtrics/Medallia install bases (Raj).

**Funnels:** *PLG* — Visit → Sign up → **Connect** (activation gate 1) → **First insight, TTFI<60min** (gate 2, the aha) → recurring Augment credits → **EXPAND to Ingest** (light up `history_window`, PQL) → multi-source/Migrate. *Enterprise* — renewal-timed ABM → Augment POC → reconciliation/parity + security review + DPA → funded-migration proposal → closed-won (cutover scheduled) → system of record.

| KPI | Why |
|---|---|
| **★ Sources flowing into Xperiq** (Augment + Ingest live) | North star — measures the on-ramp's job: getting data in |
| **Time-to-first-insight (TTFI)** | PLG activation; target < 60 min self-serve |
| **Augment → Ingest graduation rate** | Proves the wedge expands, not just lands |
| **Migration completion rate** | > 85% self-serve; trust + engine quality |
| **Credits consumed (processed intelligence)** | Revenue proxy tracking realized value, not seats |
| **Switcher influence (closed-won citing Prism)** | Acquisition-engine proof; tracked from GA |
| **Net revenue retention** | Validates "intelligence + continuous ingestion = retention" |

**Win/loss tracking:** every enterprise deal tagged with incumbent displaced, entry mode, whether funded migration was used, whether anti-lock-in/parity proof was deciding, and Prism cited (Y/N) — the loop that tunes battlecards and the funded-migration gate.

**Key GTM risks:** Augment cannibalizes Migrate revenue → Augment is designed as low-margin land; revenue is credits + services; track graduation rate. · Free-migration margin erosion → gated/credit-grant/Augment-prequalified. · Surprise-bill backlash → hard pausing caps + real-time visibility + previewed graduation cost (launch-blocking control). · SI channel conflict → position SIs as delivery/co-sell. · Review legal messaging → first-party/API-only; Yelp/TripAdvisor/Places display-only; counsel signs off. · Over-promising fidelity → battlecards hedge [⚠], dry-run flags don't drop. · "Just a migration tool" → lead with spectrum + day-one insight. · Pricing not ratified [⚠].

---

> **Cross-links:** [README.md](./README.md) · [teams.md](./teams.md) · [source-platforms-catalog.md](./source-platforms-catalog.md) · [architecture-ingestion.md](./architecture-ingestion.md) · [operations-runbook.md](./operations-runbook.md) · [security-compliance.md](./security-compliance.md) · [architecture-review.md](./architecture-review.md) · [engineering-plan.md](./engineering-plan.md)
