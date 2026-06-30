# Prism — Engineering Plan

**Status:** Plan approved; re-sequenced for the 3 P1-blockers; ready to break into tracker tasks
**Date:** 2026-06-29
**Owners:** Priya Raghunathan (TPM), Karthik Nair (Principal DistSys)

> Phasing, API/DB contracts, CrystalOS skills, env vars, testing, risks, per-connector DoD.
> Every capability moves along the Xperiq seam end-to-end (skill → contract → handler →
> outcome — see [`README.md`](./README.md) and [`architecture-review.md`](./architecture-review.md)).
> Incorporates 9 ratified fixes (I1–I8 + ADR-026) and re-sequences so the three P1-blockers
> (**I1 continuous-sync, I2 deterministic-first mapping, I3 two-tier parity**) land first.
> Dates indicative from 2026-06-29; fold tasks into `docs/TRACKER.md`.

---

## 1. Phasing (re-sequenced)

| Phase | Window | Goal | Connectors | Exit criterion |
|---|---|---|---|---|
| **P0 — Foundations** | Wks 1–4 (Jul 2026) | Ingestion engine + CSV end-to-end + **observability** + **fidelity-cert harness** | CSV/Excel | CSV import connect→map→dry-run→load→reconcile→insight, idempotent & resumable; **fidelity cert signed by the harness** |
| **CrystalOS Tier-1 hardening** | overlaps P0, **before P1** | Harden the 3 mapping/parity skills (evals, determinism) ahead of flagship | — | Tier-1 skill EVALS green; deterministic path covers majority of fields |
| **P1 — Flagship + blockers** | Wks 5–10 (Aug–Sep) | **I1 continuous-sync (CDC)** · **I2 deterministic-first mapping** · **I3 two-tier parity** + async export-poll | Qualtrics, Typeform | Qualtrics survey+responses+directory migrated with two-tier parity + signed recon report; CDC delta sync proven |
| **Enrichment tier decoupling (I5)** | end of P1, **before P2** | Split enrichment into its own tier/queue (cost + backfill isolation) | — | Imports complete without blocking on enrich; enrich runs deferred/overnight |
| **P2 — Self-serve breadth + cross-source** | Wks 11–16 (Oct–Nov) | Volume self-serve + owned reviews + **unified_feedback + provenance (ADR-026)** | SurveyMonkey, Google Forms, GBP, Apple ASC, Google Play | Self-serve completion >85% in beta; reviews + responses unified under `unified_feedback` with provenance |
| **P2–P3 — Identity graph (I6)** | spans P2→P3 | Cross-source identity resolution over unified feedback | — | Contacts/respondents resolved across ≥2 sources with audit trail |
| **P3 — Enterprise + T2** | Wks 17–24 (Dec–Q1 2027) | White-glove + clean T2 | Medallia, Alchemer, Trustpilot, Forsta | Medallia services migration completed for design-partner |
| **P4 — Long tail & GA** | Q1 2027 | Hardening, widgets, GA | Jotform, QSF/triple-S, display widgets | GA: SLOs met, security sign-off, docs |

**Cross-cutting (land with the tiered work, not as a separate phase):**
- **I4 — Bitemporal checkpoints:** job checkpoints carry valid-time + transaction-time so
  resume/replay and CDC deltas are point-in-time correct. Built into the engine in P0,
  exercised by every connector from P1.
- **I7 — Thin-SDK-default:** connectors default to thin HTTP clients; vendor SDKs only when
  they earn their weight (auth/pagination complexity). Keeps the connector surface auditable.
- **I8 — Augment history-window seed:** on enabling Augment, optionally pull just the
  `history_window` into the rolling buffer and run a one-shot baseline insight so the first
  screen shows real insight in minutes; the seed promotes to permanent history on Ingest.
- **Outcome loop (closed-loop seam):** mapping/parity skills are seeded with examples from
  completed jobs so deterministic coverage and confidence climb over time.

Display-only widgets (Yelp/Places/TripAdvisor) and contract-gated (G2/Capterra) sit in P4+
pending legal posture; Glassdoor/Amazon/MS-Forms-structure excluded. Tiering and per-source
detail: [`source-platforms-catalog.md`](./source-platforms-catalog.md). Modes/services split:
[`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md), [`teams.md`](./teams.md).

---

## 2. Backend API contracts (`/api/prism/*`)

All routes: Express + `tsx`, Clerk auth (dev mode when no key), Zod-validated, org-scoped,
soft-delete. Router `backend/src/routes/prism.ts`; engine `backend/src/lib/prism/`.

```
# Connections
POST   /api/prism/connections              { platform, authKind, credentials | oauthCode }
                                           → { connectionId } (verifies, stores credential_ref)
GET    /api/prism/connections              → [{ id, platform, status, stats }]
DELETE /api/prism/connections/:id          (revokes secret, soft-deletes)

# Discovery
GET    /api/prism/connections/:id/resources → [{ resourceRef, label, counts, dateRange, metric }]

# Jobs (the pipeline)
POST   /api/prism/jobs                      { connectionId, kind, resources[], options }
                                           → { jobId } (enqueues DISCOVER/EXTRACT)
GET    /api/prism/jobs                       → [{ id, platform, stage, status, counts }]
GET    /api/prism/jobs/:id                    → full job (stage, status, counts, error)  ← UI polls
POST   /api/prism/jobs/:id/pause | /resume | /cancel

# Continuous sync (I1 — CDC)
POST   /api/prism/connections/:id/sync       { mode: 'cdc' | 'poll', cursor? }  (registers ongoing delta sync)
GET    /api/prism/connections/:id/sync        → { mode, lastCursor, lastRunAt, lag }

# Mapping (Crystal proposes, user confirms; I2 deterministic-first)
GET    /api/prism/jobs/:id/mapping           → { suggestions[] } (deterministic rules first, skill fills gaps)
PUT    /api/prism/jobs/:id/mapping           { mappings[] } (confirm/edit → prism_mappings, advances TRANSFORM)

# Dry-run + approve (I3 two-tier parity)
GET    /api/prism/jobs/:id/dryrun            → DryRunReport (diff + two-tier metric parity + continuity)
POST   /api/prism/jobs/:id/approve           { conflictResolutions[], metricMethods } (→ LOAD)

# Reconciliation + report
GET    /api/prism/jobs/:id/reconciliation    → ReconReport
GET    /api/prism/jobs/:id/report.pdf        → signed reconciliation / fidelity-cert artifact
```

Mapping confirmations call `recordProposalOutcome`-style logging so `schema-mapper` improves
(outcome loop). After LOAD, enrichment is dispatched to the **decoupled enrichment tier
(I5)** rather than inline; the backend then triggers `POST /insights/generate` (CrystalOS)
and the frontend `invalidate('surveys' | 'insights')`.

---

## 3. Database migrations (`supabase/migrations/`)

New tables (all with `org_id`, `created_at`, `updated_at`, `deleted_at`):
`prism_connections`, `prism_jobs`, `prism_raw_records`, `prism_mappings`,
`prism_dryrun_report`, `prism_recon_report`, **`prism_sync_state`** (I1 CDC cursors +
bitemporal checkpoints, I4) — schemas in [`architecture-ingestion.md`](./architecture-ingestion.md)
§4–5, §11.

**Cross-source unification (ADR-026):** additive `unified_feedback` + `feedback_provenance`
tables that responses and review signals project into, carrying source platform, source record
id, and the bitemporal stamps. Identity graph (I6, P2–3) resolves actors across sources over
this layer. Details in [`architecture-ingestion.md`](./architecture-ingestion.md).

Canonical-table additions (non-breaking, additive):
```sql
-- exactly-once natural key for imports (partial unique index)
CREATE UNIQUE INDEX responses_prism_nat_key ON responses
  (org_id, (metadata->'prism'->>'source_platform'), (metadata->'prism'->>'source_record_id'))
  WHERE metadata ? 'prism' AND deleted_at IS NULL;
CREATE UNIQUE INDEX signals_prism_nat_key ON signals
  (org_id, (metadata->'prism'->>'source_platform'), (metadata->'prism'->>'source_record_id'))
  WHERE metadata ? 'prism' AND deleted_at IS NULL;
-- survey metric method (parity reproducibility)
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS metric_method JSONB;
```
No Firestore (platform rule). Redis only for queues, locks, per-connection rate-limit token
buckets, and CDC cursors.

---

## 4. CrystalOS skills (`crystalos/skills/`)

Each is a directory with `SKILL.md` + `EVALS.md` + `EXAMPLES.md` + `plugin.json`, registered
in `skills/plugin.json`, run by `SkillRuntime`. **Tier-1 hardening (evals + determinism)
completes before P1.**

| Skill | Output (proposal) | Key EVALS gate |
|---|---|---|
| `schema-mapper` | field→target + value rules + confidence; **I2 deterministic rules run first, skill fills only the gaps** | all fields mapped/preserved; metrics tagged; no hallucinated ids; deterministic coverage tracked |
| `taxonomy-mapper` | reconcile imported topics ↔ registry | every label → merge/new/conflict; no silent drops |
| `metric-parity` | **I3 two-tier:** Tier-1 exact recompute where method is known; Tier-2 explained-estimate where source method is opaque, + method rec | concrete cause; cites responses; recommends match/rebaseline; labels which tier |

These extend the existing insight pipeline; re-enrichment of imported text reuses the current
enrichment + 17-node `POST /insights/generate` path (no new pipeline), now invoked from the
decoupled enrichment tier (I5). Skills are seeded from completed-job outcomes (outcome loop).
Validation approach: [`architecture-review.md`](./architecture-review.md).

---

## 5. Frontend (`app/src/`)

New `prism` locale namespace in `en.ts` (all user-visible strings via `t()` — never hardcoded).
Data hooks (`usePrismJob`, `usePrismConnections`, `usePrismSync`) subscribe to DataBus
(`useInvalidation('surveys'|'insights', …)`). NUMERIC coercion rule applies to any
counts/scores (coerce strings → numbers). Dry-run UI surfaces two-tier parity (I3) and any
logic gaps honestly. Tests mirror `src/__tests__/` (mock `useApi`, `i18n`, `framer-motion`).

---

## 6. Environment variables

> **Platform rule (root `CLAUDE.md`):** every new env var → add to the matching `.env.example`
> (root/`app`/`backend`) **and** `docs/ENV_VARS.md` (source of truth) in the same PR.

| Var | Where | Purpose |
|---|---|---|
| `PRISM_SECRETS_BACKEND` | backend | `gcp_secret_manager` \| `local` (dev) |
| `PRISM_MAX_CONCURRENT_EXTRACT` | backend | global extract worker cap |
| `PRISM_RAW_RETENTION` | backend | `keep` \| `purge_after_reconcile` (default) |
| `PRISM_SYNC_ENABLED` | backend | enable continuous-sync (CDC) workers (I1) |
| `PRISM_ENRICH_TIER` | backend | route enrichment to decoupled tier/queue (I5) |
| `QUALTRICS_OAUTH_CLIENT_ID` / `_SECRET` | backend | Qualtrics OAuth app (per-deploy creds) |
| `SURVEYMONKEY_OAUTH_CLIENT_ID` / `_SECRET` | backend | SurveyMonkey OAuth |
| `TYPEFORM_OAUTH_CLIENT_ID` / `_SECRET` | backend | Typeform OAuth |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | backend | Forms + Business Profile (scoped) |
| `APPLE_ASC_ISSUER_ID` / `_KEY_ID` | backend | App Store Connect JWT (per-org `.p8` in Secret Manager, not env) |
| `VITE_PRISM_ENABLED` | app | feature flag for the Prism surface |

Per-org/per-connection credentials live in **Secret Manager** (referenced by `credential_ref`),
never in env or Postgres. See [`security-compliance.md`](./security-compliance.md).

---

## 7. Testing & acceptance

- **Fidelity-cert harness (P0):** every connector emits a machine-checked fidelity certificate
  (counts + answer checksums + metric-tier results) that signs the recon report — the
  observability + DoD gate from P0 onward.
- **Unit:** mappers (per source), deterministic-rule coverage (I2), scale-rescale rules,
  natural-key upsert idempotency, two-tier parity computation (I3), bitemporal checkpoint
  math (I4). Backend Vitest; CrystalOS skill EVALS.
- **Integration:** record/replay fixtures per connector (golden source payloads → expected
  canonical rows). Re-run a completed job = no-op diff (idempotency). CDC delta replay (I1)
  produces only new/changed rows.
- **Reconciliation:** counts + answer checksums match source for every connector.
- **E2E:** CSV and Qualtrics happy-path through the wizard; interrupted-then-resumed job
  (bitemporal); conflict resolution; metric-parity acknowledgement; ongoing sync delta.
- **Security:** secret never returned to client; `legalPosture` enforcement (display-only
  source cannot write content / call CrystalOS); erasure path deletes by provenance.

Runbook for live operation: [`operations-runbook.md`](./operations-runbook.md).

---

## 8. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Source rate limits (SM 500/day, Typeform 2/s) stall big migrations | High | Resumable paced backfill + CDC incremental sync (I1); set expectations in UI |
| GBP access approval (default quota 0) delays reviews | High | Start approval early; CSV/owned-app reviews unblock the wow first |
| Logic fidelity loss (SurveyMonkey/MS Forms) erodes trust | Med | Surface gaps in dry-run; never silent (Principle 1) |
| Metric parity mismatch reads as "Xperiq is wrong" | Med | Two-tier parity (I3): compute both, label tier, explain delta, let user choose method |
| Medallia/InMoment provisioning gate | High | Services-led flow; SFTP path; design-partner first |
| Legal exposure on reviews (GenAI clauses) | High | `legalPosture` enforced in code; counsel gate per source |
| Enrichment cost on huge backfills | Med | Decoupled enrichment tier (I5); deferred/overnight enrich; credit preflight + estimate |
| Mapping hallucination / drift | Med | Deterministic-first (I2) + augment seed (I8); no-hallucinated-id eval |
| PII/residency in cross-region extract | Med | Region-pinned workers; PII detection; minimization |

---

## 9. Definition of done (per connector)

A connector ships only when it: satisfies the closed-loop seam (skill→contract→handler→outcome)
· passes reconciliation (counts + checksums) and emits a **signed fidelity certificate** ·
supports continuous sync where the source allows it (I1) · uses **deterministic-first mapping**
(I2) with skill gap-fill · reports **two-tier metric parity** (I3) · has a counsel-signed
`legalPosture` · enforces least-privilege scopes + Secret Manager storage · defaults to a
**thin HTTP client** unless an SDK earns its place (I7) · has record/replay + idempotency +
CDC-delta tests · surfaces logic/metric gaps honestly in the dry-run.
