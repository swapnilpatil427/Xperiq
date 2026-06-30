# Prism — Design Review, Decisions & Readiness

**Status:** Adversarial review + CrystalOS validation + readiness assessment complete — **GO with 9 required changes (3 blocking for P1); conditional GO for full-scale build**
**Date:** 2026-06-29
**Author:** Anders Holm (Chief Architect)
**Reviewers:** Karthik Nair (DistSys), Diego Fernández (Data Eng), Rebecca Stern (Security), Grace Mbeki (SRE), Aisha Bello (Insight), Naomi Bergström (GTM), Dr. Wei Zhang (AI); readiness chaired by Lena Vasquez + Trust Council

> This is the single canonical review for Prism: the adversarial design critique (9 issues +
> best-in-class fixes), the CrystalOS validation grounded in the live code, the full decision
> log (26 ADRs), and the full-scale-development readiness verdict. It absorbs four prior
> working docs. The bar was "attack it, don't bless it" — so the gaps are named, not hidden.

---

## 1. Verdict

**GO with required changes — the design is right in its bones and wrong in three specific,
fixable places.** The foundational bets are correct: Postgres-only exactly-once, raw lossless
staging, the proposal/confirm seam, the Augment→Ingest→Migrate spectrum, decoupling ingestion
from processing, and tiered intelligence. But the design **over-indexes on the one-time bulk
migration** and **under-designs the two things that make Prism a *product* not a *project*:**
(a) continuous incremental sync (the basis of Augment), and (b) mapping/parity at enterprise
scale. Fix those and it is a design worth staking a full-scale build on.

**Readiness:** **architecturally complete and build-ready** for P0 (ingestion engine + CSV)
and P1 (Qualtrics + Typeform). P0 should start now. The 3 P1-blockers change contracts/UX, so
they are cheapest to land before P1. An ~8-item external punch-list (§7) must clear before GA
but blocks nothing in P0. See [`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md)
for the spectrum thesis and [`README.md`](./README.md) for the full doc set.

---

## 2. The 9 issues and their best-in-class resolutions

Severity: 🔴 Critical (**blocks P1**) · 🟠 High (fix in-phase) · 🟡 Medium (track).
**P1 blockers: I1, I2, I3.** Each resolution is the *best* design, not a patch.

| ID | Sev | Issue | Best-in-class resolution (owner) |
|---|---|---|---|
| **I1** Continuous sync | 🔴 | Augment is under-designed — "new data always checkpointed" hand-waves *how* new data arrives; most XM/survey APIs have no real-time push. Bulk export ≠ continuous sync. Without this, Augment (our wedge) doesn't exist. | **Capability-negotiated CDC subsystem on the unified log.** Per-source capture: **push** (webhooks/event subscriptions — Qualtrics, Typeform, Medallia Omni; HMAC-verified → append to log) where offered, **poll+cursor** fallback otherwise (Qualtrics `continuationToken`, Typeform `since/until`, Forms `timestamp`+Pub/Sub). **Trust-but-verify:** even with push, a low-cadence reconciling poll backstops missed/dup webhooks (push=latency, poll=completeness; natural-key upsert makes overlap free). `prism_sync_state` per `(connection,resource)` tracks `cursor/last_event_at/last_synced_at/lag/capture_mode/freshness_slo`; adaptive scheduler auto-tunes cadence to the Redis token bucket. Augment = a **bounded rolling-buffer log retention** (accrues into history; *not* stateless). (Karthik, Sara) |
| **I2** Mapping at scale | 🔴 | Human-confirming LLM-proposed mappings is fine for 16 questions, unusable across 500 surveys × 80 questions (fatigue → errors). We lean on the LLM where deterministic mapping should dominate. | **Deterministic-first three-layer resolver — LLM is the last resort.** L1 connector type-map (Qualtrics NPS→`nps`; pure lookup, ~80–90% of fields, zero AI/review). L2 org mapping memory keyed by **schema-shape hash** — a confirmed mapping auto-applies to structurally-identical surveys (confirm **once** for hundreds). L3 `schema-mapper` LLM only on the ambiguous residual, **bulk-confirm** high-confidence groups. Human review scales with **novelty, not volume**; mappings become durable org assets. (Wei, Diego) |
| **I3** Metric parity | 🔴 | We over-promise parity. Incumbent dashboards apply hidden filters/weighting/cleaning/rolling-windows we can't see via API; "match source" will frequently fail and erode the trust it was meant to build. | **Two-tier parity + a parity explainer.** **Tier 1 (guaranteed):** raw counts + answer checksums + timestamp continuity reconcile exactly — what the signed report certifies. **Tier 2 (best-effort, explained):** compute our metric next to the source's *reported* number; on a gap the **parity explainer** runs a small diagnostic search (with/without partials, half-up vs banker's rounding, top-2-box vs mean, date-window shift) and names the hypothesis that closes it. Persist a **parity ledger** `{source_reported, prism_computed, method, variance, explanation}`. We never promise to reproduce a black box. (Aisha) |
| **I4** Insight trail | 🟠 | Concurrent Tier-A live checkpoints + Tier-B historical snapshots can corrupt lineage/`meaningful_delta` — a "past" snapshot landing after a "present" one breaks insertion-ordered monotonic-time assumptions. | **Bitemporal, time-anchored checkpoints.** Key each checkpoint by **valid-time** (data period `period_start/period_end`) and **transaction-time** (`as_of`). Trail orders by valid-time, so a late backfill for an earlier period slots into the past and triggers a cheap **delta relink** of only its valid-time neighbor — never touching newer checkpoints. Backfill tagged `origin: prism_backfill`. Doubles as the audit / as-of / on-demand-timeframe capability ("what was true in period Y" / "what did we know as of date X"). (Aisha, Karthik) |
| **I5** CrystalOS scaling | 🟠 | All mapping + enrichment + insight funnels through one Python service; Prism adds 50M backfills + N continuous streams × 100s of tenants. The synchronous-ish `agentsClient` trigger won't hold. | **Decoupled enrichment worker tier + Tier-1 hardening** — validated against live code (§3); **no rewrite.** Enrichment becomes its own queue-backed, horizontally-scaled worker tier, enriching on ingestion (idempotent, `enrichment_version`-stamped, cached); the insight pipeline reads cached enrichments. Per-tenant fairness + credit-gated admission isolate Prism backfills from the interactive copilot. (Karthik, Grace, Wei) |
| **I6** Identity | 🟠 | "Unify so Crystal reasons across sources" needs a respondent/identity graph; today we only have per-row provenance + basic contact dedup. Bad merges are also a GDPR hazard. | **Reversible identity graph.** Deterministic match (normalized email→phone→external id) → probabilistic match on the residual (fuzzy name+org+locale, scored; low-confidence proposed-and-confirmed, never silent). Store match **edges** with evidence+confidence; `xperiq_person_id` = the connected component. A merge is **reversible** (drop an edge) — critical for corrections and GDPR (erase one source identity without nuking the cluster). Survivorship rules build the unified profile. (Diego) |
| **I7** Build/buy | 🟡 | Self-hosting Airbyte is operationally heavy (its own control plane, secrets, multi-tenancy, failure modes); most sources are simple REST. It earns its keep only for genuinely complex/rare sources. | **Thin in-house SDK is the default; borrow by rubric.** A simple REST connector ≈ a day with SDK helpers. Borrow a (self-hosted) extractor only if ≥2 hold: protocol genuinely complex; a maintained connector matches our fidelity; in-house would exceed ~2 weeks — **and** it runs self-hosted under our Secret Manager + observability. SDK interface stays the seam, so it's a per-connector, reversible call. Re-scopes ADR-014. (Sara, Yuki) |
| **I8** Augment day-1 | 🟡 | With zero history stored, Crystal has nothing to trend against on day 1; "out-insight the incumbent" needs accumulated data. | **Optional `history_window` seed + instant baseline.** On enabling Augment the customer may pull just the `history_window` (e.g. last 3 months) into the rolling buffer; Prism runs a one-shot baseline insight so the first screen shows real insight in minutes, then live checkpointing takes over. Seed is promoted to permanent history if they move to Ingest (no re-pull). Honest framing: Augment's value **compounds**. (Aisha, Naomi) |
| **I9** GTM gap | 🟠 | No marketing/sales strategy existed — scattered notes ≠ a GTM. | **Delivered** ([`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md)): ICP/segmentation, Augment-led PLG wedge → enterprise displacement, pricing-by-mode (incl. continuous-intelligence pricing), battlecards vs Qualtrics/Medallia/Forsta, funded-migration + anti-lock-in plays, demand gen, launch waves, funnel/KPIs. (Naomi, Raj) |

### The unifying idea — ADR-022, one log, many consumers

Several issues (I1 sync, I4 ordering, idempotency, resumability) get simpler under one stance
borrowed from log-structured streaming (Kappa): **treat every source as an append-only log of
records per `(connection, resource)`.** `prism_raw_records` *is* the log (ordered by source
event-time + ingest offset). **Bulk backfill and continuous sync are the same consumer at
different offsets** — "historical" = old offsets, "live" = new offsets, reprocessing = replay,
resumability = a cursor. LOAD is an idempotent consumer. This collapses the bulk-vs-streaming
dichotomy and gives I4 its time ordering for free.

---

## 3. CrystalOS validation (grounded in the live code)

**Method:** direct inspection of `crystalos/` (`main.py`, `insights.py`, `custom_analysis.py`,
`crystal/tools.py`, `crystal/registry.py`, `response_stream.py`), `backend/src/lib/agentsClient*`,
`backend/src/routes/insights*`, and `docs/agent-framework/ENTERPRISE_CRYSTALOS_REDESIGN.md`.
**Verdict: PASS with required hardening — no fundamental redesign.** This resolves I5.

**The killer finding:** the insight pipeline runs **one survey at a time** (~10-connection pool,
30s–2min/run → ~5 concurrent runs max). A naïve "enrich + insight on all 50M responses" backfill
≈ **~230 days** of wall-clock. **This is exactly why tiered intelligence (ADR-013) is
load-bearing, not a feature** — we must never run the full pipeline over all history.

**Question-coverage matrix** (what a customer asks Crystal after import/augment):

| Question type | Supported? | Evidence |
|---|---|---|
| Descriptive ("NPS this quarter", "EMEA detractors") | ✅ | `get_survey_overview` (`crystal/tools.py:94`); 45 tools in `TOOL_REGISTRY` |
| Diagnostic ("why did NPS drop in Q2 2024") | ✅ | `analyze_trend_drivers`, `compare_periods`, `get_topic_details` |
| Cross-survey / org-level ("top themes across all surveys") | ✅ | group-insights pipeline |
| Time-ranged / arbitrary window | ✅ | custom analysis `filter_spec {date_from,date_to}` (`main.py:1092`) |
| Topic-filtered | ✅ | custom analysis `filter_spec.topics` |
| On-demand custom timeframe → checkpoint | ✅ | writes `custom_reports` + checkpoint; maps to Prism Tier C |
| **Cross-source (surveys + reviews/signals together)** | ❌ **GAP** | reads only `responses` (`insights.py:1104`); no `signals` path |
| **Provenance ("the verbatims behind this number")** | ⚠️ **Partial** | `citations_manifest` exists; no response→insight tool |

**The 6 bottlenecks** (all fixable without redesign):

| # | Bottleneck | Breaks at |
|---|---|---|
| B1 | DB connection pool (~10), held for whole run (`SKILLS.md:123`) | any large backfill / many custom analyses |
| B2 | No per-provider LLM semaphore; org-wide circuit trips on `BudgetExceededError` (`ENTERPRISE_REDESIGN.md:174–183`) | hundreds of concurrent runs |
| B3 | Single Redis stream consumer, plain `XREAD` not groups (`response_stream.py`) | multi-replica; consumer death loses triggers |
| B4 | Enrichment inline in the insight pipeline (`insights.py`) | 50M backfill; latency before narration |
| B5 | In-proc `run_registry` (`main.py:530`) → no horizontal scale | >1 replica can't see/cancel runs |
| B6 | No `enrichment_version` | model change → silent full re-enrich, no provenance |

**Required changes (the I5 resolution):**

- **Tier 1 — hardening** (small, before P1 load tests): pgBouncer transaction pooling so runs
  don't pin connections (B1); per-provider LLM semaphore + backoff and **separate
  `BudgetExceededError` from provider failure** so a budget event doesn't open the org-wide
  circuit (B2); Redis **consumer groups** `XREADGROUP` (B3); `enrichment_version` column,
  re-enrich only on bump (B6).
- **Tier 2 — decoupled enrichment + horizontal scale** (the core fix, **ADR-025**): enrichment
  is its own queue-backed worker tier, enriching on ingestion (idempotent, cached by
  `response_id`+`enrichment_version`); insight pipeline reads cached enrichments (B4). Move
  `run_registry` to Redis → **N stateless replicas** (B5); separate interactive vs batch
  pools/queues. **Tiered intelligence is the load-shedding strategy** (live streams / paced
  batch snapshots / on-demand deep past) — what turns "230 days" into tractable.
- **Tier 3 — cross-source + provenance** (**ADR-026**): a `unified_feedback` view/table over
  `responses` **+ `signals`** with a normalized shape (closes the cross-source ❌; pairs with
  the I6 identity graph for cross-*person*); an `insight_response_citations` table +
  `get_insight_sources` tool (closes the provenance ⚠).

**Honest caveat:** the effort numbers are integration estimates from code inspection +
arithmetic, **not measurement**. Full 50M-at-scale productionization is **gated on running the
load/soak tests** (not yet run). Horizontal scale (run-registry move) is the highest-risk item —
treat as its own hardening spike with chaos tests. The existing checkpoints v2 is a per-run
linked list; ADR-023 bitemporal is an *enhancement*, not a contradiction.

---

## 4. Decision log — all 26 ADRs (compact)

Full debate, personas, and rationale were preserved across the program; this is the terse
canonical index. Dissent is recorded, never erased.

| ADR | Decision | Rationale (1-line) | Dissent |
|---|---|---|---|
| 001 | Product name **Prism** | Ties to Crystal (light→prism→crystal), describes refraction, owns the brand spectrum, clean trademark | Karthik preferred "Harbor" (warmth); accepted on Crystal-tie-in |
| 002 | Keep raw lossless staging (`prism_raw_records`) | Re-mappability + replay without re-hitting rate-limited sources; PII managed via `purge_after_reconcile`+encryption | None sustained |
| 003 | Metric parity: compute both, default match-source, user chooses, persist `metric_method` | Never silently rebaseline; protects the board trend line at cutover | Aisha: long-term taxonomy drift if many pin exotic methods; nudge added |
| 004 | Public reviews: **first-party only** by default; third-party display-only | Most ToS forbid storing/AI-feeding third-party review content; enforced via `legalPosture` | Marcus wanted licensed aggregation; logged as BD track |
| 005 | AI mapping: **always propose, never auto-apply** | Auto-apply = silent transformation (Principle 1); wrong NPS map is catastrophic+invisible | Wei: allow "confirm all high-confidence" bulk — accepted (still explicit) |
| 006 | One engine, two doors (self-serve + services) | Same pipeline/contracts; guided flow adds services rail + sign-off; no forked codebase | None |
| 007 | **Postgres-only** (honor platform rule, not the data-model's Firestore framing) | Live platform is Postgres+Redis; reuse the data model's type shapes only | None (action: annotate the data-model doc) |
| 008 | Exactly-once via natural-key upsert (partial unique index `(org_id,source_platform,source_record_id)`) | Atomic, replayable, no dedup table to keep in sync | None |
| 009 | **No incumbent two-way sync**; one-way read coexistence only for reviews/signals | Customers want a clean dated cutover; two-way is a correctness nightmare | None sustained |
| 010 | **API-only, never scrape** | Scraping violates ToS, is brittle, exposes us+customer; MS Forms via export only | Marcus flagged competitive pressure; logged as BD/licensing |
| 011 | Done = reconciled + enrichment kicked off + first insight; big backfills deferred | "Insight on arrival" is the promise without blocking on huge enrichment | None |
| 012 | Offer the full **spectrum** (Augment / Ingest / Migrate); never force migration | The move, not the destination, is the blocker; one engine serves all depths; migration becomes an outcome | Marcus feared Augment cannibalizes migration; resolved via ADR-016 |
| 013 | **Tiered intelligence**: live window + paced batch snapshots + on-demand | Enriching all 50M up front is economically absurd; decouple cheap ingestion from expensive processing; credits track *processed* | None — seen as the FinOps+UX unlock |
| 014 | Build/buy connector split (borrow commodity self-hosted, build fidelity-critical + the moat) | The moat isn't extraction; never let data egress to a managed cloud | None (⚠ verify vendor coverage + residency) |
| 015 | Lead the wedge with the **universal AI importer** (CSV/Excel/SPSS + AI mapping) | Broadest, fully compliant, no external approval gate, showcases AI-mapping magic immediately | None sustained |
| 016 | GTM weapons: **funded migration** + radical **anti-lock-in export** | Subsidize the incumbent's switching-cost moat to flip it; "we'll never trap you" is the strongest trust signal | Finance flagged margin; mitigated by tiered-intelligence cost control |
| 017 | Continuous-sync (CDC) is a **first-class subsystem** | Capture/freshness/forever-token-refresh is a distinct machine; bolting onto bulk hides the hardest part. **Blocks P1** | None — agreed biggest gap |
| 018 | **Deterministic-first mapping** (AI is fallback) | LLM unnecessary for a Qualtrics-NPS→`nps` lookup; review scales with novelty not volume. **Blocks P1** | None |
| 019 | **Two-tier parity**: guaranteed data fidelity, best-effort explained metric | Can guarantee the data matches; cannot guarantee a black-box dashboard number. **Blocks P1** | Marketing wanted the stronger claim; overruled (under-promise) |
| 020 | **Time-anchored checkpoints** (concurrent-backfill safety) | Order by data period, not insertion; filling an earlier period relinks adjacent deltas cheaply | None |
| 021 | Re-scope build/buy to **thin-SDK-default** | Most sources are simple REST; Airbyte is operationally heavy. Refines ADR-014 | Yuki: a few exotic sources may still warrant Airbyte — case by case |
| 022 | **Unified log**: bulk + continuous are one stream, many consumers | `prism_raw_records` is an append-only log; backfill = old offsets, live = new, replay = re-consume | None |
| 023 | **Bitemporal checkpoints** | Key by valid-time + transaction-time; correct under concurrency; doubles as audit/as-of | None — textbook-correct |
| 024 | **Reversible identity graph** | Match edges with evidence+confidence; reversible merge (drop an edge); GDPR-safe cross-source identity | None |
| 025 | **Enrichment = decoupled, horizontally-scaled worker tier** | Inline enrichment is the bottleneck (~230-day naïve backfill); enrich on ingestion, read cached; isolate from interactive Crystal | None — inline can't carry Prism |
| 026 | **Unified feedback layer + provenance** (cross-source Q&A) | `unified_feedback` over `responses`+`signals`; `insight_response_citations` + `get_insight_sources` tool | None |

---

## 5. Answers to the four questions

**Q1 — Ingestion from any platform?** **Ready for bulk now; ready for continuous after I1.**
The connector SDK + cited per-source research make a new bulk connector a days-long, repeatable
build ([`source-platforms-catalog.md`](./source-platforms-catalog.md) is honest about exports vs
locks). Continuous (Augment) ingestion needs the I1 CDC subsystem; with I1 + I2 the answer is an
unqualified yes across the T1/T2 catalog. Reviews are ToS-constrained to first-party via `legalPosture`.

**Q2 — Marketing & sales strategy?** **Was a real gap, now addressed** in
[`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md) — ICP, the
land-in-Augment → expand-to-Ingest → convert-to-Migrate motion, pricing-by-mode,
battlecards, funded-migration + anti-lock-in plays, launch waves, funnel/KPIs. Coherent
*because* the product is a spectrum.

**Q3 — Security?** **Strong — the most mature dimension** (STRIDE threat model + envelope
encryption + 404-not-403 isolation + SSRF `guardedFetch` + prompt-injection defenses;
[`security-compliance.md`](./security-compliance.md) covers secrets/PII/residency/`legalPosture`).
Three review residuals folded into existing controls: continuous-sync expands the long-lived
credential surface (rotation must cover always-on syncs); webhook receivers are new ingress
(HMAC + replay protection + tenant binding → a connector-certification gate); imported
review/verbatim content is a prompt-injection vector (keep the data-not-instructions boundary firm).
**No critical security gap.**

**Q4 — Operations?** **Strong for migrations** ([`operations-runbook.md`](./operations-runbook.md):
Sev1–4, 9 runbooks, cutover, rollback). **Gap the review adds: continuous-sync ops** — Augment
syncs run *forever* and fail differently (token expiry at scale, silent source-API changes,
freshness/lag drift, webhook outages). Add: a freshness/lag SLO + alert per active sync;
runbooks for stale sync / mass webhook failure / live-schema drift; promote contract-test
canaries to *production* monitors for live connectors. **Ready for migration; add the
continuous-sync operating surface alongside I1.**

---

## 6. Readiness scorecard

Legend: ✅ build-ready · 🟡 ready by design, needs validation/build · 🔵 external dependency.
**No dimension is unaddressed.** The 8 readiness gaps found were closed in the consolidated
deep-dive docs ([`operations-runbook.md`](./operations-runbook.md) for scale, reliability/DR,
observability, and testing/QA; [`security-compliance.md`](./security-compliance.md) for the
threat model and data governance; [`architecture-ingestion.md`](./architecture-ingestion.md)
for the connector SDK).

| Dimension | Status | Note |
|---|---|---|
| Product strategy & vision | ✅ | Name, principles, metrics locked |
| Customer validation | 🟡 | Discovery done; **design-partner recruitment pending** |
| Source coverage & API research | ✅ | Cited; `[⚠]` items need live re-verify (§7) |
| Ingestion architecture | ✅ | Pipeline, idempotency, staging, tables |
| Data mapping & fidelity | ✅ | Per-source maps; lossless; provenance |
| Insight continuity | ✅ | Parity, taxonomy, re-enrichment |
| UX | 🟡 | Design + wireframes complete; **build pending** |
| Security — policy + threat model | ✅ | Secrets/PII/residency + STRIDE/KMS/isolation/SSRF/AI risks |
| Scale & performance | 🟡 | Design targets; **load tests pending (P0/P1)** |
| Reliability & DR | 🟡 | Design solid; **prod infra (HA/PITR/region) to verify** |
| Observability | ✅ | Metrics/logs/traces/alerts + ship-gate |
| Testing & QA | ✅ | Strategy + fidelity-certification gate |
| Operations & runbooks | ✅ | On-call, runbooks, cutover, rollback |
| Data governance | ✅ | Lineage, retention, DSAR, residency |
| Connector SDK / ecosystem | ✅ | SDK + certification + marketplace vision |
| CrystalOS at Prism scale | 🟡 | No rewrite; hardening + decoupled enrichment + cross-source layer (§3); **load tests pending** |
| Engineering plan / phasing | ✅ | Phases, contracts, DB, env vars, risks ([`engineering-plan.md`](./engineering-plan.md)) |

**Consistency check (passed):** pipeline stages, state machine, `prism_*` tables, exactly-once
natural key, `legalPosture` gating, and `metadata.prism` provenance are used identically across
the doc set; platform rules honored (Postgres-only, soft-delete, org_id tenancy, credits =
backend-single-writer, new env vars → `.env.example` + `docs/ENV_VARS.md`); owners consistent
with [`teams.md`](./teams.md). One tracked discrepancy: `docs/SURVEY_DATA_MODEL.md` (v2.0) still
uses Firestore framing — annotate when next touched (ADR-007).

---

## 7. GA punch-list (external items — none block starting P0)

Real and owned; the difference between "design-ready" and "completely ready."

| # | Item | Owner | When |
|---|---|---|---|
| O1 | Verify prod infra: Postgres **HA + PITR**, backup cadence, available Fly.io regions | Grace, Anton | Before P0 load test |
| O2 | **Counsel sign-off on `legalPosture`** per review source (Trustpilot AI-use basis; G2/Capterra licensing) | Faisal | Before any review connector |
| O3 | **Procure source sandbox/test accounts** (Qualtrics, Typeform, SurveyMonkey, GBP…) for contract tests + record/replay | Sara, Yuki | P0–P1 |
| O4 | **Start Google Business Profile access request now** (default quota 0; days–weeks lead) | Yuki | Immediately |
| O5 | **Finalize enrichment credit pricing** for imported-text backfill; per-tenant cost caps | Anton, Marcus | Before P2 |
| O6 | **Confirm KMS availability** for envelope encryption (per-org KEK) | Rebecca, Anton | Before storing any credential |
| O7 | **Re-verify `[⚠]` API specifics** (Qualtrics export limits + OAuth scopes; Typeform 2 req/s; SurveyMonkey token policy; GBP quota) | Sara | Per connector, at build |
| O8 | **Recruit Qualtrics + Medallia design partners** for first real migrations | Marcus, Sofia | P1–P3 |

---

## 8. Bottom line

**Conditional GO — strengthened.** P0 (engine + CSV) is unaffected and should start now. Before
P1 (Qualtrics + Typeform), land **I1 (continuous sync), I2 (deterministic-first mapping), I3
(parity reframing)** — they change contracts/UX, so they're cheapest now. I4–I8 are in-phase; I9
(GTM) is delivered. CrystalOS needs no rewrite — hardening + a decoupled enrichment tier + a
cross-source/provenance layer, with full-50M productionization gated on the load tests we've
specified. Tiered intelligence is confirmed **load-bearing**. The remaining work is **validation
and build, not discovery** — start P0 now and clear the 8-item punch-list on the path to GA.
