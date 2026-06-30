# Prism — Production-Readiness Assessment

**Status:** Production-readiness layer landed — config + boot-gate + worker/scheduler wiring done; GA gated on the smoke test below + the §7 punch-list in [`architecture-review.md`](./architecture-review.md)
**Date:** 2026-06-29
**Author:** Anders Holm (Chief Architect)

> The architect's assessment of what stood between Prism's design-complete build and a
> production deploy, what was done to close each gap, and the **GA gate** (an end-to-end smoke
> test). Read alongside [`architecture-review.md`](./architecture-review.md) (the 9 issues + the
> §7 GA punch-list), [`operations-runbook.md`](./operations-runbook.md) (scale, DR, runbooks,
> Fly topology), [`engineering-plan.md`](./engineering-plan.md) (phasing/contracts), and
> [`security-compliance.md`](./security-compliance.md) (secrets/KMS). Start at [`README.md`](./README.md).
>
> **Mental model (from the runbook):** Prism is a resumable, idempotent pipeline —
> `CONNECT → DISCOVER → EXTRACT → PROFILE → MAP → TRANSFORM → DRY-RUN → LOAD → RECONCILE → ENRICH → PUBLISH`.
> Durable truth lives **only in Postgres**; Redis holds ephemeral queues/locks/token-buckets;
> uploaded files and per-org credentials live in **object storage / Secret Manager**, never on the
> instance disk.

---

## 1. What was NOT production-ready → fix → status

The build was code-complete (W0–W11 in [`IMPLEMENTATION_TRACKER.md`](./IMPLEMENTATION_TRACKER.md))
but carried production stubs and unmanaged config. The readiness layer closes the deploy-blocking
ones with **fail-fast config validation** so a misconfigured prod can never silently start.

| # | Not production-ready | Fix | Status |
|---|---|---|---|
| 1 | **Object storage was a stub** — `PRISM_UPLOAD_BACKEND` had only `local` (filesystem) + a `gcs` stub. Fly.io instance disks are **ephemeral & non-shared**: uploads vanish on redeploy and are invisible to the worker process. | `PRISM_UPLOAD_BACKEND=s3` (object storage) as the staging/prod default in `getPrismConfig()`; s3 settings (`_BUCKET/_REGION/_ENDPOINT/_FORCE_PATH_STYLE/_ACCESS_KEY_ID/_SECRET_ACCESS_KEY`). Boot **refuses** if prod-like and still `local`, or `s3` without bucket/region. | ✅ config + gate; ⬜ s3 client impl (storage agent — `@aws-sdk/client-s3`) |
| 2 | **No engine worker** — the EXTRACT/LOAD pipeline had no loop driving jobs; `prism_jobs` would sit `queued`. | `startPrismWorker()` (`lib/prism/worker.ts`) booted in `index.ts` behind `PRISM_WORKER_ENABLED` (default on). Dev: in-process. Prod: dedicated Fly `worker` process group. | ✅ wiring + flag; ⬜ worker loop impl (engine agent) |
| 3 | **CDC not scheduled** — continuous sync (Augment's basis, I1) had `sync/engine|webhook|poll` modules but nothing ticking the poll/freshness loop. | `startPrismSyncScheduler()` (`lib/prism/sync/scheduler.ts`) booted behind `PRISM_SYNC_ENABLED` (default on); `PRISM_SYNC_POLL_INTERVAL_S` cadence (300s dev / 3600s prod). | ✅ wiring + flag; ⬜ scheduler impl (sync agent) |
| 4 | **Secret not stored** — `authenticateConnection` used a placeholder `credential_ref`; `secretManager.putSecret` was never called (per tracker Integration TODOs). | `PRISM_SECRETS_BACKEND` is `gcp` by default in staging/prod; boot refuses if prod-like and still `local`. Forces real Secret Manager wiring before any prod credential is written. | ✅ config + gate; ⬜ `putSecret` call site (security agent) |
| 5 | **Local secrets / local Redis in prod** — both defaulted permissively; a prod deploy could run on a local file store and in-memory rate limiter (multi-instance = incorrect). | `validatePrismProductionConfig()` makes `PRISM_SECRETS_BACKEND=local` and missing `REDIS_URL` **fatal** in staging/prod. Mirrors the `AGENTS_INTERNAL_KEY` prod-validation precedent in `lib/validateEnv.ts`. | ✅ done |
| 6 | **Ephemeral / non-shared FS on Fly** — see #1; also affects the worker process group reading files the web instance wrote. | Object storage (s3) for `prism-upload://` refs is the shared substrate both the web and worker process groups read. | ✅ contract; ⬜ s3 impl |
| 7 | **Default service secret** — `AGENTS_INTERNAL_KEY` shipped as `dev-internal-key-change-in-prod`. | Reused the canonical default-rejection check inside `validatePrismProductionConfig()` (fatal in staging/prod). | ✅ done |
| 8 | **OAuth URLs unset** — `PUBLIC_API_URL`/`FRONTEND_URL` unset means OAuth `redirect_uri` and post-callback redirect break **silently**. | Both **fatal** in staging/prod. | ✅ done |
| 9 | **Unmanaged per-env config** — no single place said "dev vs staging vs prod differ here." | `backend/src/lib/prism/config.ts` — `getPrismConfig()` (typed, env-specific defaults) + `validatePrismProductionConfig()` (pure). | ✅ done |
| — | **Deps to install** | `@aws-sdk/client-s3` (s3 storage). Plus the tracker's dependency-gated stubs: `pg-copy-streams` (bulk COPY load), `pdfmake` (recon PDF), XLSX/SPSS/QSF parsers. | ⬜ install on the build/deploy machine |

> "✅ config + gate" = the config module + the boot-time fail-fast are in place and force the
> sibling implementation to be correct before prod will start. "⬜ impl" = owned by the named
> sibling agent per the shared production contract; the boot wiring imports from the contracted
> path and degrades gracefully (dynamic import, logged-and-continue) until it lands.

---

## 2. Deployment topology (dev / staging / prod)

Fly apps (from [`operations-runbook.md`](./operations-runbook.md) §1): `prism-backend` (Express+tsx),
`prism-crystalos` (CrystalOS), Postgres `prism-pg`, Redis.

```
                       ┌──────────────────────────────────────────────┐
  Dev (one process)    │  npm start  →  Express API                    │
                       │   ├─ in-process Prism worker  (WORKER_ENABLED) │
                       │   └─ in-process sync scheduler (SYNC_ENABLED)  │
                       │  Postgres + Redis via docker-compose (Redis    │
                       │  optional — in-memory fallback)                │
                       └──────────────────────────────────────────────┘

                       ┌──────────────────────────────────────────────┐
  Staging / Prod       │  Fly process groups (one app, two roles):     │
  (Fly.io)             │   • `web`    → Express API; serves traffic     │
                       │               PRISM_WORKER_ENABLED=false       │
                       │               PRISM_SYNC_ENABLED=false         │
                       │   • `worker` → same image, no HTTP listener    │
                       │               PRISM_WORKER_ENABLED=true        │
                       │               PRISM_SYNC_ENABLED=true          │
                       │  Redis = REQUIRED · uploads = s3 · secrets =gcp │
                       └──────────────────────────────────────────────┘
```

- **Dev:** the worker + sync scheduler run **in-process** (both flags default on). One command,
  no extra process. Redis optional (in-memory rate-limit fallback); uploads local; secrets local.
- **Staging/Prod:** the worker + scheduler run in a **dedicated Fly `worker` process group** so
  long backfills and the CDC poll loop don't compete with interactive API traffic, and so the web
  tier can scale independently. The `web` group sets `PRISM_WORKER_ENABLED=PRISM_SYNC_ENABLED=false`;
  the `worker` group leaves them on. Because uploads live in **s3** and credentials in **Secret
  Manager**, both groups share the same durable substrate (the Fly disk is never the source of truth).
- This pairs with the CrystalOS I5 plan ([`architecture-review.md`](./architecture-review.md) §3):
  the Prism worker tier and the decoupled enrichment worker tier are the same architectural move —
  keep batch ingestion off the interactive path.

### Env matrix (recommended values per tier)

| Var | Dev | Staging | Prod | Fatal if wrong (prod-like)? |
|---|---|---|---|---|
| `APP_ENV` | `development` | `staging` | `production` | — (selector) |
| `PRISM_UPLOAD_BACKEND` | `local` | `s3` | `s3` | ✅ fatal if `local` |
| `PRISM_UPLOAD_S3_BUCKET` / `_REGION` | — | set | set | ✅ fatal if `s3` & unset |
| `PRISM_SECRETS_BACKEND` | `local` | `gcp` | `gcp` | ✅ fatal if `local` |
| `PRISM_RAW_RETENTION` | `purge_after_reconcile` | `purge_after_reconcile` | `purge_after_reconcile` | — |
| `PRISM_WORKER_ENABLED` | `true` (in-proc) | `false` web / `true` worker | `false` web / `true` worker | — |
| `PRISM_MAX_CONCURRENT_EXTRACT` | `4` | `8` | `8` | — |
| `PRISM_SYNC_ENABLED` | `true` (in-proc) | `false` web / `true` worker | `false` web / `true` worker | — |
| `PRISM_SYNC_POLL_INTERVAL_S` | `300` | `3600` | `3600` | — |
| `REDIS_URL` | optional | set | set | ✅ fatal if unset |
| `AGENTS_INTERNAL_KEY` | dev default ok | non-default | non-default | ✅ fatal if missing/default |
| `PUBLIC_API_URL` | `http://localhost:3001` | `https://api.staging…` | `https://api…` | ✅ fatal if unset |
| `FRONTEND_URL` | `http://localhost:5173` | `https://app.staging…` | `https://app…` | ✅ fatal if unset |

Canonical per-var detail (purpose/status/defaults): `docs/ENV_VARS.md` → Prism section.

---

## 3. The boot-time production gate (what refuses to start)

On boot (`backend/src/index.ts`, in `start()` after `validateStartupConfig`), Prism calls
`validatePrismProductionConfig()`. In **development** it always returns `[]` — dev never crashes.
In **staging/production** any of these is **fatal** (each is logged, then the process exits
non-zero — exactly the `AGENTS_INTERNAL_KEY` precedent):

1. `REDIS_URL` missing — shared queues/rate-limits/run-registry require it.
2. `PRISM_UPLOAD_BACKEND` still `local` (or `s3` without `_BUCKET`/`_REGION`) — Fly disks are ephemeral.
3. `PRISM_SECRETS_BACKEND` is `local` — credentials must use GCP Secret Manager + KMS.
4. `AGENTS_INTERNAL_KEY` missing or the dev default.
5. `PUBLIC_API_URL` unset — OAuth `redirect_uri` would break.
6. `FRONTEND_URL` unset — the post-OAuth callback redirect would break.

---

## 4. GA gate — end-to-end smoke test

GA is gated on this scripted smoke test passing in **staging** (against real source sandbox
accounts — punch-list O3 in [`architecture-review.md`](./architecture-review.md) §7), then a
dry run in **production** with an internal test org. It exercises the full pipeline and the CDC
backstop — the two things the design under-built (I1) and the build stubbed.

**A. Bulk path (UI, the universal CSV importer — ADR-015):**
1. **Upload** — drag a CSV onto the Home dropzone → `POST /api/prism/uploads` stores it in the
   configured backend (s3 in staging) and returns a `prism-upload://` ref. *Verify the file is
   readable by the worker process group, not just the web instance.*
2. **Connect** — file connector job created (`prism_jobs` row, status `queued`).
3. **Discover** — resources enumerated.
4. **Map** — deterministic-first resolver maps columns; review only the residual (I2). Approve.
5. **Approve / Dry-run** — `DRY-RUN` diff + metric-parity preview; user confirms (no silent transform).
6. **Load** — natural-key upsert into `responses`; idempotent (re-run loads zero new rows).
7. **Reconcile** — counts + checksums match source → recon report ✅ (Tier-1 guaranteed parity, I3).
8. **Insight** — ENRICH + PUBLISH kick off; first Crystal insight/checkpoint appears ("insight on arrival", ADR-011).

**B. Continuous path (CDC backstop — the Augment wedge, I1):**
9. **New response arrives** — either (a) a **webhook** fires (`POST /webhooks/prism`, HMAC-verified,
   raw body) for a push-capable source, or (b) the **poll** loop picks it up on the next
   `PRISM_SYNC_POLL_INTERVAL_S` tick (trust-but-verify). The new record lands in `prism_raw_records`,
   upserts to `responses`, and `prism_sync_state` advances its cursor + freshness. *Verify both push
   and poll paths converge to the same row (natural-key upsert makes overlap free).*

**Pass criteria:** every stage advances without manual DB intervention; reconcile is exact;
re-running load is a no-op; the new-response check lands within the freshness SLO; and the boot
gate (§3) is green for the staging env config. Failing any of these blocks GA.

---

## 5. Bottom line

The design was "conditional GO" ([`architecture-review.md`](./architecture-review.md) §1); the build
was code-complete but carried prod stubs and unmanaged config. This layer makes the **environment
contract explicit and self-enforcing**: dev stays cheap-and-local, staging/prod **cannot boot**
misconfigured, and the worker + CDC scheduler are wired to start (in-process for dev, a dedicated
Fly process group for prod). What remains for GA is **sibling implementation** (s3 client,
`putSecret` call site, worker/scheduler loops) + **deps install** (`@aws-sdk/client-s3`, et al.) +
the **smoke test** (§4) green in staging — i.e. validation and finishing, not discovery.
