# Prism — Universal Experience-Data Ingestion & Migration

**Status:** Design complete · **Readiness reviewed → conditional GO** (3 fixes block P1) · consolidated to a **9-doc set**
**Date:** 2026-06-29
**Owner:** VP Product, Platform & Ingestion

> **Prism** brings any organization's experience data into Xperiq — from incumbent XM
> platforms (Qualtrics, Medallia, …) and public feedback (Google, Yelp, app stores) —
> **without losing a data point, a trend line, or a night of sleep**, with richer
> Crystal-powered insight on arrival.
>
> **Core thesis — a spectrum, not a migration.** **Augment** (data stays in the incumbent;
> insight on new data) → **Ingest** (full history + tiered intelligence) → **Migrate**
> (cutover). You enter anywhere and move at your pace. *Bring everything. Lose nothing. See more.*

---

## The 9-document set (read in this order)

| # | Doc | What's in it |
|---|---|---|
| 1 | [`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md) | **Core thesis** — vision & name, the 8 principles, the 3 modes, the tiered-intelligence model, build/buy, **and the full go-to-market** (ICP, positioning, pricing-by-mode, sales motion, battlecards, launch, KPIs) |
| 2 | [`teams.md`](./teams.md) | The team roster (incl. Chief Architect + GTM hires) + the customer **discovery** findings |
| 3 | [`source-platforms-catalog.md`](./source-platforms-catalog.md) | Per-source reference — APIs, what exports vs locks, rate limits, legal posture; reviews decision matrix; build-priority waves |
| 4 | [`architecture-ingestion.md`](./architecture-ingestion.md) | **The technical doc** — ingestion engine, the unified log, continuous-sync (CDC), modes, deterministic-first mapping, tiered insight + bitemporal checkpoints, the connector SDK |
| 5 | [`operations-runbook.md`](./operations-runbook.md) | **Engineering & ops readiness** — scale (Postgres@50M, COPY→MERGE), reliability/DR (SLOs, failure matrix, PITR), observability (metrics/traces/alerts), testing (fidelity certification), and the production runbooks + cutover playbook |
| 6 | [`security-compliance.md`](./security-compliance.md) | **Security, privacy & governance** — secrets/KMS, tenant isolation, STRIDE, `legalPosture`, lineage, retention, DSAR/erasure, residency, compliance mapping |
| 7 | [`architecture-review.md`](./architecture-review.md) | **The review** — the 9 issues + best-in-class fixes, the CrystalOS validation (grounded in code), all 26 ADRs, the readiness scorecard + GA punch-list |
| 8 | [`engineering-plan.md`](./engineering-plan.md) | Re-sequenced phasing (3 blockers first), API/DB contracts, CrystalOS skills, env vars, risks, per-connector DoD |
| 9 | [`README.md`](./README.md) | This index |

---

## The 9 issues (full detail + fixes in [`architecture-review.md`](./architecture-review.md))

🔴 = blocks P1 · 🟠 = in-phase · 🟡 = track

| # | Issue | Fix | Sev |
|---|---|---|---|
| I1 | Continuous sync under-designed (Augment's basis) | Capability-negotiated **CDC subsystem** on the unified log (push + trust-but-verify poll) | 🔴 |
| I2 | AI mapping doesn't scale | **Deterministic-first** 3-layer resolver; LLM only for the residual | 🔴 |
| I3 | Metric parity over-promised | **Two-tier parity** (raw guaranteed; computed best-effort) + **parity explainer** | 🔴 |
| I4 | Concurrent backfill corrupts the trail | **Bitemporal** checkpoints (valid-time + transaction-time) | 🟠 |
| I5 | CrystalOS bottleneck/coupling | **Decoupled, scaled enrichment worker tier** + Tier-1 hardening (validated; no rewrite) | 🟠 |
| I6 | No cross-source identity | **Reversible identity graph** | 🟠 |
| I7 | Airbyte too heavy | **Thin-SDK-default**, borrow by rubric | 🟡 |
| I8 | Augment day-1 value weak | Optional **history-window seed** + instant baseline | 🟡 |
| I9 | No GTM | Delivered (now in doc #1) | ✅ |

**CrystalOS validation headline:** no rewrite needed, but the insight pipeline runs one survey
at a time — a naïve "insight on all 50M" ≈ **~230 days**, which is exactly why **tiered
intelligence is load-bearing**, not optional.

---

## Non-negotiable principles

No silent transformation · lossless by default · continuity is sacred · provenance on every
datapoint · compliant by construction (reviews API-only) · insight on arrival · self-serve where
possible, services where needed · it must feel like Xperiq.

---

## Next steps

1. Break [`engineering-plan.md`](./engineering-plan.md) phases into `docs/TRACKER.md` tasks, tagged with acceptance criteria.
2. **P0:** engine + CSV connector end-to-end; wire observability + the fidelity-certification harness from day one.
3. Land the **3 P1 blockers** (I1 CDC, I2 deterministic mapping, I3 two-tier parity) before Qualtrics/Typeform.
4. Clear the longest-lead externals now: GBP access approval (quota 0), KMS; counsel sign-off on `legalPosture`; procure source sandbox accounts; **run the load tests** (the 50M numbers are not yet measured).

---

## Housekeeping — obsolete stub files

This doc set was consolidated from ~26 files. The sandbox shell can't run (`E2BIG`), so I
**couldn't delete** the merged-away files — they're now **1-line redirect stubs**. Delete them
when convenient (paste with the `!` prefix to run in-session):

```
cd docs/otherplatforms/migration && rm product-vision-prism.md go-to-market.md customer-interviews.md data-mapping.md connector-sdk.md insight-strategy.md scale-performance.md reliability-dr.md observability.md testing-qa.md threat-model.md data-governance.md issue-resolutions.md crystalos-validation.md debate-log.md READINESS_REVIEW.md
```
