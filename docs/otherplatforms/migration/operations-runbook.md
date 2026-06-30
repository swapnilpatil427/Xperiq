# Prism — Engineering & Operations Readiness

**Status:** Operational playbook approved; on-call active for P1 design-partner migrations
**Date:** 2026-06-29
**Owners:** Karthik Nair, Grace Mbeki, Diego Fernández, Anton Petrov, Priya Raghunathan

> The single engineering-readiness book for running Prism in production — scale, reliability/DR,
> observability, testing/QA, and ops procedures. Read alongside
> [`architecture-ingestion.md`](./architecture-ingestion.md) (the engine these mechanisms operate),
> [`security-compliance.md`](./security-compliance.md) (secrets, residency, erasure, legal posture),
> [`engineering-plan.md`](./engineering-plan.md) (contracts & phasing),
> [`architecture-review.md`](./architecture-review.md), [`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md),
> [`teams.md`](./teams.md), and [`source-platforms-catalog.md`](./source-platforms-catalog.md). Start at [`README.md`](./README.md).
>
> **Mental model.** Prism is a resumable, idempotent pipeline:
> `CONNECT → DISCOVER → EXTRACT → PROFILE → MAP → TRANSFORM → DRY-RUN → LOAD → RECONCILE → ENRICH → PUBLISH`.
> Every job is a row in `prism_jobs` with `status ∈ {queued, running, awaiting_input, paused, complete, partial, failed}`
> and a resumable `cursor`. Durable truth lives **only in Postgres**; Redis holds only ephemeral
> queues/locks/token-buckets. Natural key `(org_id, source_platform, source_record_id)`; LOAD = `ON CONFLICT`
> upsert; provenance = `metadata.prism`. **Almost nothing here requires destructive action** — the first
> move is usually `pause` + `resume`, because the engine resumes, not restarts.

---

## 1. Conventions

- Runbook entries follow **Symptom → Diagnose → Action**.
- `[⚠]` marks a step that mutates customer-visible state/secrets — get a second operator and log it.
- Fly apps: `prism-backend` (Express+tsx), `prism-crystalos` (CrystalOS); Postgres via `fly pg connect -a prism-pg`; Redis via `redis-cli`.
- SQL is **org-scoped** — always `org_id` in WHERE. A `prism_*`/canonical query without `org_id` is a review-board incident.
- Vocabulary is the shared Prism contract: 11 stages above; tables `prism_*` + canonical `surveys/responses/signals/contacts`.

---

## 2. Scale & performance

### 2.1 Capacity envelope

The numeric envelope (from [`architecture-ingestion.md`](./architecture-ingestion.md) §9) every mechanism is sized against:

| Dimension | Target | Notes |
|---|---|---|
| Single migration — responses | up to **50M** rows | one tenant/source/job tree |
| Single migration — contacts | up to **40M** rows | directory/distribution import |
| Single migration — signals | up to **20M** rows | reviews + call/video/chat feedback |
| Sustained LOAD throughput | **≥ 5,000** rows/sec/tenant | batched upserts into a partition |
| Peak LOAD (burst, 1 tenant) | **~12,000** rows/sec | staging COPY+MERGE path (§2.3) |
| EXTRACT throughput | **source-bound** | governed by Redis token buckets (§2.4) |
| Concurrent tenant migrations | **100s** (target 200 active) | bounded by fair-share scheduler (§2.7) |
| Resume granularity | **per-batch ≤ 500 rows** | lost-work ceiling on crash |
| Media — file answers | **5M** files, p95 **2 MB**, cap **100 MB** | offloaded to object storage (§2.6) |
| Media — call/video assets | **500k**, cap **2 GB** | streamed re-host, never inline |
| Per-tenant raw-staging headroom | **~150 GB** transient | `prism_raw_records` buffer (§2.5) |
| Avg canonical row (response) | **~3.5 KB** JSONB | drives storage math |

**Storage math (one 50M-response migration):** responses 50M × 3.5 KB ≈ **175 GB** heap; `prism_raw_records` 50M × ~6 KB ≈ **300 GB** transient (purged after RECONCILE); nat-key index 50M × ~80 B ≈ **4 GB**; contacts 40M × ~1 KB ≈ **40 GB**. Peak transient ≈ **0.5 TB** before raw-purge; steady-state added ≈ **220 GB**. The raw buffer is the largest consumer and is fully reconstructable from re-extract, so it defaults to `PRISM_RAW_RETENTION=purge_after_reconcile` ([`engineering-plan.md`](./engineering-plan.md) §6).

### 2.2 Postgres at 50M+: HASH partition by `org_id`

A 50M-row unpartitioned upsert degrades on index maintenance, autovacuum stall, and cross-tenant contention. **`PARTITION BY HASH (org_id)`** fixes all three — reads are always org-scoped, upsert churn is isolated per tenant, and autovacuum parallelizes per partition.

| Table | Scheme | Why |
|---|---|---|
| `responses` | `HASH (org_id)` → 64 partitions | org-scoped reads; per-tenant churn isolation |
| `signals` | `HASH (org_id)` → 64 partitions | same; delta sync appends here (§2.8) |
| `prism_raw_records` | `HASH (org_id)` → 32 partitions, **detach-and-drop** per completed job | transient; partition drop = cheapest purge |
| `contacts` | `HASH (org_id)` → 32 partitions | 40M ceiling, org-scoped |

**Why hash on `org_id`, not RANGE on time:** dominant access is tenant-scoped; every query carries `org_id`, so hash gives clean pruning. A re-mapping replay touches all of a tenant's history (no time predicate) → RANGE would force cross-partition scans on the most expensive ops.

```sql
CREATE TABLE responses (
  id UUID NOT NULL, org_id TEXT NOT NULL, survey_id UUID NOT NULL,
  answers JSONB NOT NULL, respondent JSONB, submitted_at TIMESTAMPTZ NOT NULL,
  metadata JSONB, deleted_at TIMESTAMPTZ
) PARTITION BY HASH (org_id);
CREATE TABLE responses_p00 PARTITION OF responses FOR VALUES WITH (MODULUS 64, REMAINDER 0);
-- … responses_p63 (generated in a DO loop in the migration)
```

`[⚠]` **Hot-tenant caveat:** one enterprise's 50M rows land in a *single* ~175 GB partition (a hotspot during its migration). Accepted because churn is write-mostly, time-bounded, and isolated from others. For tenants projected **> 20M** rows, add a **time sub-partition** (`RANGE (submitted_at)` yearly) under the hash partition (config-gated, decided at MAP time from `prism_dryrun_report` counts).

**Exactly-once index under partitioning.** A UNIQUE index on a partitioned table must include the partition key. Because the natural key *begins with* `org_id` (= partition key), this is satisfied for free; uniqueness is per-partition but globally correct (no two natural-key collisions can land in different partitions). The partial `WHERE` keeps it small (~64 MB/partition, cache-resident).

```sql
CREATE UNIQUE INDEX responses_prism_nat_key ON responses
  (org_id, (metadata->'prism'->>'source_platform'), (metadata->'prism'->>'source_record_id'))
  WHERE metadata ? 'prism' AND deleted_at IS NULL;
```

`[⚠]` The `ON CONFLICT` arbiter must reference this index expression **exactly** — a mismatch silently disables the upsert path (covered by the idempotency test, [`engineering-plan.md`](./engineering-plan.md) §7).

**Autovacuum for heavy upsert** (per-partition — the partitioning win): `fillfactor 85` (HOT updates skip index churn), `autovacuum_vacuum_scale_factor 0.02` (vacuum at 2% dead, not the lazy 20%), `autovacuum_vacuum_cost_limit 4000`. Post-migration: one `REINDEX … CONCURRENTLY` + `VACUUM (ANALYZE)` on the touched partition at PUBLISH (cheap — one ~64 MB local index). Monitor `age(relfrozenxid)` per partition for wraparound; `ANALYZE` the active partition before RECONCILE so count queries plan well.

### 2.3 Bulk LOAD: COPY → staging → MERGE (exactly-once)

| Approach | Throughput (1 partition, 1 conn) | Exactly-once? | Verdict |
|---|---|---|---|
| `INSERT … ON CONFLICT DO UPDATE`, 500-row batches | ~3–6k rows/s | **Yes** | correct but per-row probe caps throughput |
| Raw `COPY` into live table | ~50–150k rows/s | **No** | breaks idempotency — unusable directly |
| **`COPY` → staging → upsert** (recommended) | ~15–30k rows/s | **Yes** | COPY-speed ingest + exactly-once at MERGE |

```sql
-- 1. Per-batch UNLOGGED staging (no WAL), org_id-scoped to the target hash partition.
CREATE UNLOGGED TABLE prism_load_stage_<batch_id> (LIKE responses INCLUDING DEFAULTS);
-- 2. COPY the transformed batch in binary (driver: pg-copy-streams; rows carry metadata.prism).
COPY prism_load_stage_<batch_id> (id, org_id, survey_id, answers, respondent, submitted_at, metadata)
  FROM STDIN WITH (FORMAT binary);
-- 3. Set-based exactly-once merge into the live partitioned table.
INSERT INTO responses AS r (id, org_id, survey_id, answers, respondent, submitted_at, metadata)
SELECT id, org_id, survey_id, answers, respondent, submitted_at, metadata FROM prism_load_stage_<batch_id>
ON CONFLICT (org_id, (metadata->'prism'->>'source_platform'), (metadata->'prism'->>'source_record_id'))
  WHERE metadata ? 'prism' AND deleted_at IS NULL
DO UPDATE SET answers=EXCLUDED.answers, respondent=EXCLUDED.respondent,
              metadata = r.metadata || EXCLUDED.metadata, updated_at = now();
DROP TABLE prism_load_stage_<batch_id>;
```

One batch = one txn = all-or-nothing resume unit (`backend/src/lib/prism/load.ts`): `BEGIN` → create unlogged stage → COPY stream → set-based upsert → `DROP` → `COMMIT` → `advanceCursor(batchId)`; on error `ROLLBACK`, retry the whole batch (≤500 lost-work). Beats per-row because COPY bypasses per-row parse/plan, staging is `UNLOGGED` (no WAL until merge), and the conflict probe runs once against the in-cache local index.

**Sizing & connection budget:**

| Knob | Value | Reasoning |
|---|---|---|
| Rows/batch (= txn = resume unit) | **500** | 500 × 3.5 KB ≈ 1.75 MB one round-trip; rollback loses ≤500 |
| Concurrent LOAD batches/tenant | **8** | bounded so one tenant can't monopolize conns |
| Sustained throughput/tenant | **≥ 5k rows/s** | 8 batches × ~700 rows/s via staging-merge |
| Txn duration ceiling | **< 2 s/batch** | short locks; avoids long-txn bloat |

```
Server connection budget (primary):                    200
  reserved app reads (REST) + admin:                   -80
  available to Prism LOAD pool:                         120   → ÷ 8/tenant = 15 tenants at full tilt
pgBouncer transaction mode: default_pool_size=120, max_client_conn=4000  (≤4,000 worker logical conns multiplex onto 120 server)
Per-tenant fair share @200 active: weighted-fair across 120, min 1/tenant, burst to 8
```

EXTRACT workers write `prism_raw_records` through a **separate small pool** (`default_pool_size=30`) — append-only/bursty, off the LOAD budget.

`[⚠]` **pgBouncer client-pool exhaustion** is the silent failure here: 200 tenants × 8 logical conns = 1,600 client conns, well under `max_client_conn=4000`, but a stuck/long server-side txn pins a server conn so the transaction-mode queue backs up — symptom is rising `prism_load_batch_duration_seconds` with flat LOAD throughput and no PG error. Guard: txn-duration ceiling (< 2 s/batch), alert on pgBouncer `cl_waiting > 0` sustained, and `SHOW POOLS`/`SHOW CLIENTS` in triage (§6.5).

### 2.4 EXTRACT scaling (source-rate-limited)

EXTRACT is IO/network-bound and source-throttled (opposite of DB-bound LOAD); separate worker pools so neither starves. A **Redis token bucket keyed by `connection_id`** (per source credential, not `org_id`) enforces each connector's declared limits via an atomic Lua `TAKE` script (`backend/src/lib/prism/ratelimit.ts`); workers on one connection share one bucket. Backoff on 429/503 is exponential + jitter and **also drains the bucket** (treat a throttle as proof it was too generous), then `cursor` resumes mid-stream.

| Source | Hard limit | Practical ceiling |
|---|---|---|
| **SurveyMonkey** | ~**500 req/day** | daily-budgeted; ~50k resp/day/conn → big migrations span days → incremental backfill, UI expectations |
| **Typeform** | **2 req/s** | ~2 pages/s × 1k/page ≈ **2k resp/s**/conn |
| **Qualtrics** | export-concurrency (e.g. 3/brand, not RPS) | download bandwidth once ready; parallelism = surveys exported at once, cap 3 |
| Medallia | service/SFTP, low API RPS | services-led; batch files |
| GBP / app stores | per-project daily quota | quota-budgeted; owned reviews only |

Three parallelism axes: within one connection `workers ≤ min(bucket concurrency, connector max in-flight)`; across resources (tenant's surveys up to the bucket); across connections (independent buckets run fully parallel); global cap `PRISM_MAX_CONCURRENT_EXTRACT`. Sizing rule: **enough workers to keep every bucket saturated, not one more.**

### 2.5 Backpressure

The raw staging table is the shock absorber; unbounded buffering would blow the ~150 GB/tenant headroom, so EXTRACT throttles on a watermark over unloaded depth (`extracted − loaded − skipped`, `backpressure.ts`):

| Control | Value | Effect |
|---|---|---|
| High watermark (per job) | **2M** unloaded raw (~12 GB) | EXTRACT pauses *this job*, frees workers for other tenants |
| Low watermark | **500k** | EXTRACT resumes — hysteresis prevents flapping |
| Global staging guard | per-tenant ~150 GB cap | hard stop → job `paused` with reason, never silent |

Pausing EXTRACT *yields workers to other tenants* — backpressure and fairness are the same mechanism from two angles. **Enrichment-tier backpressure** is separate and downstream: ENRICH is off the critical path (§3.6), so its backlog never throttles EXTRACT/LOAD — it accrues in `prism:q:enrich` and is bounded only by the credit gate and the CrystalOS pool (§2.9/§6.6), draining against R8, not R1–R3.

### 2.6 Media at scale

Never inline in Postgres (a 100 MB JSONB blob destroys upsert perf via TOAST thrash, bloats WAL, breaks the 3.5 KB math). **Postgres holds a reference; bytes live in object storage.** EXTRACT streams the source URL → re-host to GCS (key `org_id/job_id/source_record_id/<sha256>`) → write `metadata.prism.attachments[] = [{key, bytes, sha256, mime}]`; never buffer the whole file (~16 MB stream window). Content-addressed by sha256 (dedup). Over-cap (100 MB files / 2 GB assets) → recorded as a skip with reason in the dry-run, never silently dropped (Principle 1). Media is its own bandwidth-budgeted pool, autoscaling on media-queue depth independently of LOAD.

### 2.7 Multi-tenant fairness

Queues partitioned by `org_id`; scheduler enforces **deficit-weighted fair queuing** with per-tenant caps (`scheduler.ts`: filter `inFlight < concurrencyCap && backpressure != 'pause'`, sort by `deficit/weight`).

| Mechanism | Value | Effect |
|---|---|---|
| Per-tenant LOAD concurrency cap | **8 batches** | no tenant exceeds its share of the 120-conn budget |
| Per-tenant EXTRACT cap | bucket-bound + `PRISM_MAX_CONCURRENT_EXTRACT` slice | one tenant can't hold all extract workers |
| Weight | default 1; enterprise can be weighted up, never to starvation | priority without monopoly |
| Min guarantee | **≥ 1 in-flight batch** per active tenant | the 50-row SMB import always progresses |
| Starvation guard | deficit accrual | long-waiting small tenant's deficit rises until picked |

Enforced at **three layers in concert**: scheduler (who runs next), connection budget (§2.3, how much DB a tenant grabs), physical partitioning (§2.2, whose churn touches whose pages). Removing any one re-opens a starvation path.

### 2.8 Incremental / delta sync (CDC)

`kind='sync'` jobs keep Xperiq current and **move only what changed**, sidestepping the rate-limit pain of a full backfill. Cursor-driven (`prism_jobs.cursor` stores `continuationToken`/`updated_since`); change detection by `payload_hash` (sha256) — a record whose hash matches the stored raw record is a **skip before TRANSFORM** (no upsert, no churn):

```sql
INSERT INTO prism_raw_records (org_id, job_id, connection_id, source_platform, record_type, source_record_id, payload, payload_hash)
VALUES (...) ON CONFLICT (org_id, connection_id, record_type, source_record_id)
DO UPDATE SET payload=EXCLUDED.payload, payload_hash=EXCLUDED.payload_hash, extracted_at=now()
WHERE prism_raw_records.payload_hash <> EXCLUDED.payload_hash;  -- only touch on real change
```

Only changed rows hit ENRICH → steady-state credit cost tracks **change volume**, not total volume. The continuous-sync failure surface (cursor stall, webhook gaps, upstream schema drift) is its own incident class — runbook §6.7.

### 2.9 Autoscaling on Fly.io

Worker pools scale independently (different bottlenecks):

| Pool | Signal | Scale up when | Ceiling |
|---|---|---|---|
| EXTRACT | extract-queue depth + bucket idle | depth rising AND buckets unsaturated | `PRISM_MAX_CONCURRENT_EXTRACT` |
| TRANSFORM | CPU + transform-queue | CPU > 70% sustained (~1 worker/vCPU) | vCPU budget |
| LOAD | LOAD lag (`extracted−loaded`) + pgBouncer wait | lag rising AND server conns < 120 | **120 server conns (hard)** |
| Media | media-queue + egress | queue rising | bandwidth budget |
| CrystalOS (ENRICH) | `/insights/generate` queue + credit gate | backlog AND credits available | credit/$ guardrail (§2.10) |

**Never autoscale LOAD past the connection budget** — past 120 conns degrades *everyone* via lock/latch contention. LOAD scales to the budget, then backpressure (§2.5) takes over and EXTRACT yields. The budget is a hard wall.

**Worked 50M Qualtrics migration:** export-concurrency 3 is binding; extract ~8–12k resp/s blended (export-prep latency dominates 1,200 surveys) → ~3–5 hrs paced; LOAD ~5–8k/s into its partition (~2.3 hrs, overlaps extract); recon = minutes; enrich deferred/overnight. **End-to-end ~4–6 hrs to RECONCILE.** Peak workers: ~3 EXTRACT + 4 TRANSFORM + 8 LOAD batches (~2 machines) + 1 media + off-critical-path enrich. **Headline: compute is cheap and the migration is source-paced; enrichment credits are the real cost.**

### 2.10 FinOps & cost (owner: Anton Petrov)

Cost surfaced *before* import (dry-run estimate) and capped *during*, so a 50M migration never surprises us or the tenant's credit balance.

| Stage | Cost driver | Magnitude |
|---|---|---|
| CONNECT/DISCOVER/RECONCILE | API calls / partition-pruned reads | negligible |
| EXTRACT/TRANSFORM | egress + worker-hours / CPU | low |
| LOAD | PG CPU/IO + WAL + transient storage | low–medium |
| **ENRICH** | **CrystalOS LLM tokens → credits** | **dominant** |
| Storage (steady / transient / media) | heap+index+backup / raw buffer / GCS GB-mo | medium / medium (purged) / low–medium |

**Enrichment** runs through CrystalOS (`POST /insights/generate`, 17-node pipeline); **backend is the single ledger writer** (root `CLAUDE.md` credits rule). `enrich credits ≈ Σ tokens(row)/token_per_credit` over enriched rows; for 50M responses ~40% bear enrichable text → ~20M enriched rows = the dominant cost. Guardrails: deferred/overnight enrich for backfills; **credit pre-flight** estimates from PROFILE-sampled text density shown *before* approve; incremental sync enriches only changed rows. Per-tenant credit cap → over-budget pauses **enrich**, LOAD still completes (data safe, insight deferred), never silent auto-charge. Estimate-vs-actual drift > 20% `[⚠]` flags the estimator. Honors Principle 1 extended to cost: **no silent spend**.

---

## 3. Reliability & disaster recovery

Three load-bearing invariants ([`architecture-ingestion.md`](./architecture-ingestion.md)): **(1) Lossless landing** — every source record is written verbatim to `prism_raw_records` before any transform (replay from raw, not source); **(2) Idempotent endpoints** — EXTRACT key `(org_id, connection_id, record_type, source_record_id)` + LOAD natural-key upsert → whole pipeline replayable; **(3) A job never silently stalls** — always advancing, retrying with backoff, or parked terminal/actionable with a recorded `error`.

### 3.1 SLOs & error budgets

Measured per `org_id`/`source_platform`, 28-day rolling. **Error budget = `(1 − target) × 28d`; burn rate = observed error-rate ÷ (1 − target)** (a dimensionless multiple of allowed). Burn > 2× over 7 days → connector freeze + game-day.

| # | SLO | Target | Error budget (28d) | On burn |
|---|---|---|---|---|
| **R1** | Job success rate (`complete+partial`/all, no operator) | ≥ 99.0% | 1.0% (~7/700) | connector-scoped freeze |
| **R2** | **Data-loss rate** | **= 0 (hard, no budget)** | **0** | page on any non-zero; job → `failed`, never `complete` (§3.7) |
| **R3** | Reconciliation pass rate (first attempt) | ≥ 99.5% | 0.5% | investigate parity/checksum class |
| **R4** | Time-in-stage (no-progress) | p95 EXTRACT heartbeat ≤ 60s | per-stage (below) | alert "stuck"; auto-retry then `awaiting_input` |
| **R5** | LOAD durability (approved batches committed exactly once) | 100% | **0** | page; replay batch (idempotent) |
| **R6** | Resume correctness | ≤ 1 batch (≤500) re-done; 0 lost, 0 dup | **0/0** | block release |
| **R7** | Control-plane availability (`/api/prism/*`) | 99.9% | 0.1% (~40 min/28d) | backend on-call |
| **R8** | Enrichment freshness (soft) | 95% enriched ≤ 24h after LOAD | 5% | deferrable — does **not** burn R1/R2 |

R2/R5/R6 are **hard** (zero-budget): a single breach pages and blocks, never trades against a budget. R8 is **soft** and explicitly decoupled — an AI outage cannot consume the data-integrity budget (§3.6).

**Per-stage no-progress budgets** (R4 — bounds *being stuck*, not runtime): CONNECT 30s · DISCOVER 120s · EXTRACT 60s heartbeat · PROFILE/MAP/TRANSFORM 300s (MAP may sit `awaiting_input` indefinitely — human, not a stall) · DRY-RUN 600s · LOAD 60s/batch · RECONCILE 600s · ENRICH governed by R8.

### 3.2 Failure-mode matrix (detection → recovery)

"Replayable" = safe to re-run by the §3 idempotency invariants. A failure may *pause/degrade* a job or move it to `partial`/`awaiting_input`/`failed`, but may **never** silently drop a record or let a job reach `complete` with unaccounted records. Every failure writes `prism_jobs.error` + a structured Loki log.

| Failure | Detection | Retry/backoff | Recovery | Customer impact |
|---|---|---|---|---|
| **Source 429** | HTTP 429/`Retry-After`; `source_429_rate` | Retryable; honor `Retry-After` else exp backoff±jitter; token bucket prevents re-trip | EXTRACT pauses on `cursor`, resumes on refill | none if in budget; "pacing — ETA extended" |
| **Source 5xx / timeout** | HTTP 5xx / socket timeout | Retryable; exp backoff+jitter, max N=8/batch then `failed` (`retryable=false`) | resume from `cursor`; raw not re-fetched | usually invisible |
| **Source token/OAuth expiry** | 401/403 or proactive check | Non-retryable; silent refresh once → else `awaiting_input` (`reauth_required`) | refresh OK = transparent; else user re-auths, new `credential_ref`, Resume | best case none; "Reconnect <source>" |
| **Partial batch failure** | per-record errors in TRANSFORM/LOAD | per-record not per-batch; good rows proceed, bad → poison (§3.4) | job continues; unresolved → `partial` | "N need attention, M imported" + report |
| **Malformed/poison record** | schema/coercion failure on one record | bounded retry (≤2) then quarantine | `prism_record_errors`; manual/fixed-mapping replay | counts toward `partial`; in error report |
| **Worker crash mid-stage** | missed heartbeat / lease expiry | Retryable (auto); lease expires → re-enqueue | resume from `cursor`/`import_batch_id`; ≤1 batch re-done | none if in budget |
| **Redis loss** | health probe; queue-depth flatlines | Retryable (whole-fleet); workers stop claiming; in-flight PG txns commit/rollback | jobs **re-derived from Postgres** (`status='running'`+`cursor`); buckets rebuild cold | pause then auto-resume; "jobs are safe" |
| **Postgres failover** | conn errors; leader election | Retryable; pool reconnects; uncommitted batch aborts cleanly | aborted batch replays (idempotent); EXTRACT resumes from `cursor` | seconds-minutes pause; no loss/dup |
| **pgBouncer pool exhaustion** | `cl_waiting>0` sustained; batch duration up, throughput flat; no PG error | Retryable (transient); transaction-mode queue drains as txns finish | kill long txns / cut LOAD concurrency (§6.5); short txn ceiling self-heals | LOAD slows platform-wide; no loss |
| **Hot-partition / autovacuum stall** | `n_dead_tup` rising, `last_autovacuum` stale on hot partition; bloat | N/A — capacity, not txn failure | targeted `VACUUM (ANALYZE)` off-peak; sub-partition large tenants (§2.2) | LOAD slows on one tenant; no loss |
| **CDC/continuous-sync stall** | sync `cursor`/`updated_since` not advancing; no new raw on a live sync | Retryable; resume from stored cursor | re-poll from cursor (raw dedupes); webhook gap → polled `updated_since` catch-up (§6.7) | stale data window; recon over sync window |
| **CrystalOS/ENRICH down** | `agentsClient`/FastAPI health | Retryable but deferrable; ENRICH non-blocking (§3.6); MAP-down → `awaiting_input` | backlog drains on return (R8) | **import still completes & reconciles** |
| **Object-storage failure** | 5xx/timeout; checksum mismatch | Retryable; re-request/re-download; checksum-gate parse | cursor = export handle → re-download idempotent | none in budget |
| **Duplicate webhook** | same payload ≥2× | N/A — dedup not retry; raw unique key + LOAD upsert → no dup | naturally absorbed | none — invisible |
| **Clock skew / bad timestamps** | DRY-RUN continuity check | Non-retryable; surfaced, never silently fixed | user reviews continuity report; timestamps preserved verbatim | dry-run continuity panel; user decision |

### 3.3 Retry & backoff

Classifier stamps `error.retryable`: **retryable** (429/5xx/timeout/reset/Redis-PG blip/storage-5xx/CrystalOS-503) → backoff to cap then park; **non-retryable** (401/403 after refresh, bad creds, `legalPosture` violation, schema break, repeated poison) → `awaiting_input` or quarantine; **per-record poison** → bounded retry ≤2 → quarantine, job continues.

```
delay(n) = min(base·2^n, cap) · (1 ± jitter)   # full jitter; base=1s, cap=60s, jitter=±50%, max N=8/batch
# Source 429 with Retry-After → honor header, ignore formula for that hop
```

Per-source caps enforced by the Redis token bucket per `connection_id` (retries draw from the same bucket → a retry storm can never exceed the source's published limit). Full jitter de-correlates retries (no thundering herd). **Circuit breaker:** sustained 5xx/timeout above threshold on a `connection_id` trips open for a cool-down (paused EXTRACT, `cursor` retained).

### 3.4 Dead-letter / poison handling

```sql
CREATE TABLE prism_record_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id TEXT NOT NULL,
  job_id UUID NOT NULL REFERENCES prism_jobs(id), source_platform TEXT NOT NULL,
  source_record_id TEXT NOT NULL,                       -- ties back to prism_raw_records
  stage TEXT NOT NULL,                                  -- TRANSFORM | LOAD | ENRICH
  error_code TEXT NOT NULL,                             -- malformed | coercion | conflict | enrich_failed | ...
  error_detail JSONB NOT NULL,                          -- human + machine context (no PII)
  attempts INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL,                                 -- quarantined | replayed | resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ,
  UNIQUE (org_id, job_id, source_record_id)
);
CREATE INDEX ON prism_record_errors (org_id, job_id, status);
```

**Capture, not crash** — poison written here (cross-refs verbatim raw payload), bounded retry ≤2 first. **Partial is first-class** — any quarantined record at end → job `partial` (not `failed`/`complete`); RECONCILE accounts for quarantined explicitly (§3.7). **Downloadable error report** `GET /api/prism/jobs/:id/errors.csv` lists every `source_record_id`/stage/reason. **Manual replay** `POST /api/prism/jobs/:id/replay {source_record_ids[]}` reuses idempotent TRANSFORM→LOAD from raw (**no re-extraction**); a clean replay flips `partial → complete`.

### 3.5 Resumability & exactly-once (proven)

**Claim:** a crash at any point leaves the job resumable with **≤ 1 batch (≤500 rows) re-work, 0 lost, 0 duplicated.** Durable state is only in Postgres (`cursor`, `counts`, `prism_raw_records`, committed `import_batch_id`s); Redis loss loses no truth. EXTRACT: crash before cursor advance → re-fetch chunk, raw upserts no-op; after → continue from cursor. TRANSFORM/DRY-RUN: pure functions of raw + mappings, recompute on resume, nothing canonical touched. LOAD: crash mid-txn → atomic rollback → replay converges (≤1 batch); after commit → next batch from durable load cursor. RECONCILE is the conservation gate — even a resume bug surfaces as recon failure, never silent loss.

**Exactly-once:** at-least-once (retry + cursor never gives up while a record is in raw + unreconciled) ∧ at-most-once (two unique keys make every write an idempotent upsert) ⇒ **exactly-once at the canonical layer**. Measured by chaos game-days (§3.8), not just argued.

### 3.6 Graceful degradation (ENRICH deferral)

The import is "done" at **RECONCILE, not ENRICH** — the propose(CrystalOS)/execute(backend) seam gives resilience:

| Dependency state | Behavior | Why safe |
|---|---|---|
| CrystalOS down during MAP | job parks `awaiting_input` (hand-map or wait) | no canonical data at risk |
| CrystalOS down during/after LOAD | LOAD→RECONCILE→PUBLISH complete; ENRICH queued separately | ENRICH only adds derived signals to correct rows |
| Credits low/exhausted | LOAD proceeds; enrichment deferred (overnight); user told the gap | correctness independent of enrich budget; raw retained |
| Enrichment backlogged | other jobs' LOAD/RECONCILE continue; ENRICH drains own pool (R8) | EXTRACT/LOAD pools isolated from ENRICH |

Job reports `complete` (data) with `enrichment: pending|partial|done` — *"Data fully imported & reconciled — insights generating."* R8 decoupled from R1–R3: an AI outage **cannot** burn the data-integrity budget.

### 3.7 Data-integrity & the conservation gate

At RECONCILE the engine asserts the **conservation equation**:

```
source_count == loaded + quarantined + dry_run_skipped + intentionally_excluded
```

`source_count` (DISCOVER, re-checked at RECONCILE); `loaded` (canonical upserts); `quarantined` (`prism_record_errors`, visible+replayable); `dry_run_skipped` (user conflict choice); `intentionally_excluded` (scope filter). **Zero data loss ≡ every source record is in exactly one bucket, none unaccounted.** A record can be quarantined ("not imported") but never *lost* — it's still verbatim in raw and in the error report. If the equation doesn't balance the job **cannot** reach `complete` (→ `failed`/`partial`) and R2 pages. RECONCILE (`prism_recon_report`) checks: count parity (→ R2), checksum parity (→ R3), metric parity (delta surfaced honestly, user picks `metric_method` — a method difference, not loss), timestamp continuity. A **signed reconciliation report** (`GET /api/prism/jobs/:id/report.pdf`) is the white-glove trust deliverable.

**Checksums:** per-record `payload_hash = sha256(canonical-JSON(payload))` (stored at extract) + post-TRANSFORM `mapped_hash`; per-`import_batch_id` order-independent aggregate (XOR/sum) verified in O(rows); source-side counts folded into count parity where exposed.

### 3.8 Backup & DR

| Asset | Store | Loss = ? | Recovery |
|---|---|---|---|
| Job state/mappings/recon (`prism_*`) | Postgres | orchestration truth | PITR / replica promotion |
| Raw records | Postgres | *the* re-mappable SoR | PITR; source as last resort |
| Canonical rows | Postgres | imported data | PITR + idempotent re-LOAD from raw |
| Queues/leases/buckets | Redis | **nothing durable** | re-derive `running` jobs from `prism_jobs` |
| Per-org secrets | Secret Manager (`credential_ref` in PG) | re-extract ability | provider versioning |
| Export files | Object storage | re-fetchable | re-request (idempotent EXTRACT) |

**Postgres is the only system of record** → DR surface is one PG cluster + Secret Manager + re-fetchable object storage.

| Tier | RPO | RTO | Mechanism |
|---|---|---|---|
| Postgres (all Prism + canonical) | ≤ 5 min `[⚠]` | ≤ 30 min `[⚠]` | continuous WAL archiving + PITR; standby promotion |
| Secret Manager | 0 (versioned) | ≤ 15 min | provider SLA |
| Object storage | N/A (re-fetchable) | minutes | re-request from source |
| Redis | N/A (ephemeral) | ≤ 5 min | cold restart; re-derive from PG |

`[⚠ verify prod infra]` RPO/RTO assume Fly Postgres WAL/PITR + near-sync standby. **The 5-min RPO holds only with synchronous (or near-sync) replication; with async replication true RPO = replication lag** (could exceed 5 min under write burst) — confirm backup cadence, WAL retention, and `synchronous_commit`/standby mode before any external publish.

**Restoring mid-flight jobs (what is recoverable):** PITR restores PG to a single consistent point where `cursor`/`counts`/committed `import_batch_id`s/`prism_raw_records` are **co-located** (one cluster, one snapshot) → scheduler re-derives the work queue from `prism_jobs` (Redis rebuilt cold, buckets refill paced) → each running job re-applies its in-flight batch idempotently (≤1 re-done) → RECONCILE re-verifies conservation. Recoverable mid-flight state: anything committed to PG before the restore point — raw rows, advanced cursors, committed batches. **Not** recoverable: an in-flight uncommitted batch (rolls back, replays ≤500 from raw) and ephemeral Redis bucket fill (refills cold). A restore to *before* LOAD completed still replays TRANSFORM→LOAD from raw — **no source re-hit.** `[⚠ verify prod infra]` Cross-region DR is **not yet proven** (multi-region Fly PG, region-pinned workers for PII residency, region-failover runbook are open) — treat "survive full region loss" as aspirational. Owner: Grace.

### 3.9 Chaos & fault injection

Monthly automated chaos suite in staging against the largest golden fixture; **manual game-day before each connector GA** and before any LOAD/cursor/reconciliation change. Each scenario maps to the SLO it protects; a regression blocks release. Scenarios: kill-mid-LOAD (`0 lost/0 dup`, ≤1 batch, recon balances — R6); kill-mid-EXTRACT (raw exactly once); drop-Redis (re-derive from PG, buckets refill); PG failover (atomic abort, 0 dup); pgBouncer saturation (queue drains, no loss); 429 storm (rate ≤ cap, extended ETA); corrupt batch (quarantine, → `partial`, recon balances incl. quarantined); CrystalOS outage (data SLOs unaffected); object-storage 5xx (checksum-gated re-download); duplicate webhook flood (one row); CDC cursor stall + webhook gap (polled catch-up closes it); clock skew (surfaced in DRY-RUN, preserved verbatim).

---

## 4. Observability

Goal: answer "is this migration healthy?" in under 5s from one Grafana row per job — advancing/stuck, lossless, will-match-source, throttled, enrich keeping up, credit burn, traceable to source. **Every value a human asks for in an incident is a label or field, not a grep.** Reuses the existing Prometheus + Grafana + Loki + Pino→Loki stack (`docker-compose.yml`). Non-goal: no new backend; cardinality discipline is a hard constraint.

### 4.1 SLIs/SLOs & burn-rate alerts

Per-job SLIs aggregated per tenant/source (28d rolling): job success ≥ 99.0%; stage liveness ≤ 60s heartbeat (hard); stage latency p95 per budget; EXTRACT throughput ≥ source floor (CSV ≥ 10k/s; Qualtrics export-bound); LOAD ≥ 5k/s/tenant; recon pass ≥ 99.5%; source-429 rate ≤ 0.5% steady; enrich lag p95 ≤ 15 min interactive / ≤ 4h overnight. **Per-stage latency p95 budgets:** CONNECT ≤ 10s · DISCOVER ≤ 60s · EXTRACT source-bound (throughput) · PROFILE ≤ 5 min/resource · MAP n/a (interactive, `awaiting_input` — track `time_to_confirm` as product metric) · TRANSFORM ≤ 1 min/100k · DRY-RUN ≤ 2 min/100k · LOAD ≥ 5k/s · RECONCILE ≤ 5 min/job · ENRICH lag SLI · PUBLISH ≤ 10s. `[⚠]` Interactive stages (`awaiting_input`) are **excluded** from latency SLOs — a job waiting for a human is healthy, not stalled; alerting keys off that distinction.

**Multi-window multi-burn-rate alerts** (Google SRE workbook), not static thresholds. **Burn rate = error-rate ÷ (1 − SLO target)**; a 14.4× burn sustained would exhaust the entire 28d budget in ~2 days, so the short+long window pair fires fast while suppressing noise. The two windows must *both* breach to fire (the short window confirms it is still burning *now*):

| Burn | Windows (short ∧ long) | Budget consumed | Severity |
|---|---|---|---|
| Fast (14.4×) | 5m ∧ 1h | ~2% of 28d budget in 1h | page (sev2) |
| Medium (6×) | 30m ∧ 6h | ~5% in 6h | page (sev3) |
| Slow (1×) | 6h ∧ 3d | trickle | ticket |

```promql
# Fast-burn on reconciliation pass: error-rate must exceed 14.4× the (1-0.995)=0.005 budget
# in BOTH the 5m and 1h windows. burn = mismatch_rate / 0.005; alert when burn > 14.4.
( sum(rate(prism_recon_mismatch_total[5m])) / sum(rate(prism_recon_checks_total[5m])) > (14.4 * 0.005) )
and
( sum(rate(prism_recon_mismatch_total[1h])) / sum(rate(prism_recon_checks_total[1h])) > (14.4 * 0.005) )
```

### 4.2 Metrics catalog (Prometheus, prefix `prism_`)

**Cardinality contract — label set:** `org_id` (bounded — see below), `source_platform` (~20), `stage` (11), `connector_version`, `result` (ok|retryable|failed). **Never** label by `job_id`/`record_id`/`source_record_id`/`connection_id`/`import_batch_id`/free-text — those are Loki/trace keys.

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `prism_records_total` | counter | stage,source_platform,org_id,result | conservation funnel (discovered→…→loaded) |
| `prism_stage_duration_seconds` | histogram | stage,source_platform | wall time/stage (p95 SLOs) |
| `prism_stage_age_seconds` | gauge | stage,source_platform,org_id | age of in-progress stage — **stuck signal** |
| `prism_stage_transitions_total` | counter | from_stage,to_stage,result | state-machine edges |
| `prism_extract_throughput_records` | counter | source_platform,org_id | extracted (rate = throughput SLI) |
| `prism_source_request_duration_seconds` | histogram | source_platform,http_status_class | source API latency |
| `prism_source_429_total` | counter | source_platform,org_id | throttle (429/503) — §4.5 alert |
| `prism_token_bucket_wait_seconds` | histogram | source_platform | EXTRACT blocked on rate bucket |
| `prism_load_upserts_total` | counter | source_platform,org_id,result | upserts (ok/conflict/failed) |
| `prism_load_batch_duration_seconds` | histogram | source_platform | per-batch txn time (pgBouncer-wait signal, §2.3) |
| `prism_recon_checks_total` / `prism_recon_mismatch_total` | counter | source_platform,org_id,check_kind | recon comparisons run / failed (parity SLI) |
| `prism_enrich_lag_seconds` / `prism_enrich_queue_depth` | gauge | org_id | oldest unenriched age / queued rows |
| `prism_queue_depth` | gauge | queue,org_id | Redis depth/pool — backpressure |
| `prism_worker_busy` | gauge | pool | saturation |
| `prism_mapping_confidence` | histogram | source_platform | mapper field-confidence (§4.6) |
| `prism_unmapped_field_total` | counter | source_platform,disposition | preserved/dropped (dropped ~0) |
| `prism_quality_flag_total` | counter | source_platform,flag | spam/dup/short/gibberish |
| `prism_credits_consumed_total` | counter | org_id,phase | credits (enrich/insight) |
| `prism_job_state` | gauge | org_id,status | jobs per status |
| `prism_lineage_orphans_total` | counter | org_id | provenance with no resolvable raw/job (should be 0; sev3) |

**Cardinality control:** bound `org_id` (only emit for orgs with a job active in last 24h via LRU; idle = 0 series → caps live series at ~active-orgs × source × stage); recording rules aggregate away `org_id` for fleet (`sum without (org_id)`); `connection_id`/`job_id` correlation via histogram exemplars (→ trace_id) + Loki labels; fixed modest buckets. E.g. `prism:stage_duration_seconds:p95 = histogram_quantile(0.95, sum by (le,stage,source_platform) (rate(prism_stage_duration_seconds_bucket[5m])))`.

### 4.3 Logs — Pino → Loki (PII-safe)

Every Prism log line carries `PrismLogContext` (`backend/src/lib/prism/log.ts`): `evt` · `job_id` · `org_id` · `connection_id` · `import_batch_id?` · `stage` · `source_platform` · `connector_version` · `trace_id?` · `counts?{discovered,extracted,transformed,loaded,skipped,failed}` (numeric only) · `result?` · `reason_code?` (ENUM only, e.g. `source_429`,`natural_key_conflict`,`auth_expired`). **PII hard rule: IDs and counts only — never content/PII** (no answer text, name/email, review body, custom-field values, raw payloads). Enforced by a mandatory Pino serializer/redactor that allowlists the schema and drops `record`/`payload`/`answers`/`respondent`/`email` keys; a CI unit test feeds PII-shaped keys and asserts absence. Levels: `debug` per-batch (sampled, off in prod), `info` stage enter/exit + transitions + recon summary, `warn` retryable/429-backoff/parity surfaced, `error` non-retryable/failed/auth. Loki labels: `job_id`, `org_id`, `source_platform`, `stage` (bounded); everything else in JSON body. `{job_id="…"}` = full single-migration timeline; `{trace_id="…"}` jumps from exemplar/trace to logs.

### 4.4 Traces — OTel across the seam

One trace spans frontend → `/api/prism` → Redis-queued workers → CrystalOS. Root client span (frontend, mints trace_id) → express server span (sets `job_id`) → producer span (enqueue) → **CONSUMER span per stage** (worker) → CrystalOS server span (ENRICH) → `llm.call` (model/tokens/credits). **Propagation:** W3C `traceparent` on every `useApi` `/api/prism/*` call; the **critical async hop** = producer injects `traceparent` into the Redis message, consumer extracts and continues (without it the background pipeline is invisible); `agentsClient` injects `traceparent` alongside `X-Internal-Key` to CrystalOS. Every span carries `prism.job_id/org_id/stage/source_platform`; the job's root `trace_id` is persisted on `prism_jobs` for UI deep-link; exemplars on `prism_stage_duration_seconds` carry trace_id. **Sampling:** root + per-stage spans head-100% (the skeleton); per-batch/per-record children (`source.request`,`db.write`,`llm.call`) ratio/1% + aggregate counters; **any errored trace tail-sampled 100%**; `llm.call` always records token/credit attributes (also captured as `prism_credits_consumed_total`).

### 4.5 Dashboards & alerts

Grafana folder `Prism`: **Fleet overview** (jobs-by-status, active-jobs table green/amber/red, stage p95 heatmap, global 429, global enrich lag, error-budget burn gauges) · **Per-job drilldown** (conservation funnel, stage Gantt, `stage_age`, deep-link to trace + Loki, recon summary, credit burn) · **Per-tenant** (all jobs, queue depth, credit vs balance, LOAD throughput, fair-share standing) · **Per-source health** (429, latency p95/p99, bucket wait, throughput, connector_version, error by `reason_code` — connector owner's home) · **Reconciliation/parity** (pass rate vs 99.5%, mismatch by check_kind, metric-parity delta, open mismatches) · **Enrichment backlog** · **Cost/credits** (burn vs preflight, projected cost-to-complete) · **Data quality** (§4.6). Fleet + per-job are where on-call lives.

Alerts route sev2/sev3 → PagerDuty `prism-oncall`, sev4 → `#prism-ops`; every alert links a §6 runbook; stuck/recon/load alerts honor the `awaiting_input` exclusion.

| Alert | Condition | Severity | Runbook |
|---|---|---|---|
| Job stuck in stage | `stage_age{stage!~"MAP\|DRY-RUN"}` > stage SLO (running, not awaiting_input); EXTRACT no heartbeat > 60s | sev2 | §6.3 |
| Reconciliation mismatch | fast-burn (§4.1) OR `increase(prism_recon_mismatch_total[15m]) > 0` on completing job | sev2 | §6.4 |
| Source-429 sustained | 429-rate / request-rate > 2% for 10m | sev3 | §6.2 |
| LOAD error-rate | failed/total upserts > 1% for 5m | sev2 | §6.5 |
| pgBouncer pool wait | pgBouncer `cl_waiting > 0` for 5m (batch-duration up, throughput flat) | sev2 | §6.5 |
| Enrich lag | `prism_enrich_lag_seconds > 900` for 10m | sev3 | §6.6 |
| Queue backpressure | `prism_queue_depth{queue="load"} > watermark` rising 15m | sev3 | §6.7 |
| CDC sync stalled | sync `stage_age` rising with no new raw on a `kind='sync'` job | sev3 | §6.7 |
| Credit exhaustion | projected balance → 0 before completion, or balance < 5% | sev3 + notify org admin | §6.6 |
| Job → failed | `increase(prism_stage_transitions_total{to_stage="failed"}[5m]) > 0` | sev2 | §6 |
| Unmapped→dropped | `increase(prism_unmapped_field_total{disposition="dropped"}[1h]) > 0` | sev4 | §6.4 |
| SLO burn (any) | multi-burn-rate (§4.1) | sev2/3/4 | §6 |

### 4.6 Data-quality, lineage & product funnel

**Data-quality** (recon proves we moved data; this proves we moved it *faithfully*): mapping-confidence distribution (low-confidence tail → human review in MAP); parity-mismatch rate (near 0, deltas explained); unmapped-field rate (`preserved` OK, `dropped` = 0); quality flags (spam/dup/short/gibberish vs baseline); **drift vs source** (recurring sync compares new extract distribution vs prior baseline — drift = upstream schema change → `warn` + re-profile prompt, not a corrupt load). Mapping-confidence + parity feed the CrystalOS skill-quality loop.

**Lineage** (Principle 4): `metadata.prism` on every canonical row → backward trace `(source_platform, source_record_id, import_batch_id, imported_at)` → verbatim `prism_raw_records.payload` → `prism_jobs.trace_id` → full trace + logs; surfaced in response detail + signed recon report; same key is the erasure handle and replay path. `prism_lineage_orphans_total` should be 0. `[⚠]` With `PRISM_RAW_RETENTION=purge_after_reconcile` the raw-payload link is severed after recon (nat-key + job/trace links persist); orgs needing full forensic lineage set `keep`.

**Product funnel** (`connect → select → map → approve → load → reconcile → insight`, event bus, distinct from ops metrics): self-serve completion rate > 85% (P2 exit); TTFI (connect→insight, trend down); MAP friction (edits/confirmed mapping, trend down); dry-run abandon rate (low). High MAP-friction / dry-run-abandon is the "outcome record" telling `schema-mapper`/`metric-parity` to improve.

---

## 5. Testing & QA

**First principle:** the trust contract (README non-negotiable principles) *is* the test plan — every principle maps to an automated gate; **no test = unenforced.** We test the *contract* not the implementation.

### 5.1 Test pyramid

```
E2E WIZARD (Playwright) ~dozens — CSV/Qualtrics happy, conflict, parity-ack, point-of-no-return, a11y
DATA-FIDELITY CERTIFICATION per-connector — counts+checksums+parity+ts-continuity (release gate §5.6, EVERY connector PR)
CONTRACT (live scheduled canary §5.4) · CONNECTOR record/replay (golden §5.3) · IDEMPOTENCY/replay (§5.5)
INTEGRATION (Vitest + ephemeral PG) — state machine, upsert, dry-run, recon, queue/lock, Zod, tenant scope
UNIT (Vitest/pytest) ~thousands — mappers, scale-rescale, parity math, natural-key, partial-fail; CrystalOS structural evals
  CrystalOS skill EVALS (structural + LLM-judge) sit beside CONTRACT — gate skill changes
```

Test locations: connectors `backend/src/__tests__/prism/connectors/` (Vitest, fixtures); engine/API `…/engine/`,`…/api/` (Vitest + ephemeral PG/Redis + supertest); frontend `app/src/__tests__/prism/` (Vitest+RTL) + `app/e2e/prism/` (Playwright); CrystalOS `crystalos/skills/{schema,taxonomy,metric-parity}/EVALS.md`; contract `…/contract/` (cron, sandbox). **Determinism rule:** everything except contract canary, LLM-judge, and load runs is deterministic + offline (injected `clock()`, seeded ids, fixture payloads) → green = correct, not lucky.

### 5.2 Unit tests (the rules that must each be correct)

Per-source mappers (table-driven over [`source-platforms-catalog.md`](./source-platforms-catalog.md)), asserting `(source field/type) → (QuestionType, metric tag, value rule)` and **never drops an unknown type** (falls back to preserve-as-embedded, Principle 2). Hard cases per source: Qualtrics (NPS recode, SBS→matrix+raw, timing→embedded, QSF), SurveyMonkey (`family`+`display_type` ⚠ star/smiley, demographic→split), Typeform (key on `ref`, value-key-named-after-`answer.type`, picture→re-host), Google Forms (grid→matrix, RADIO/CHECKBOX split, STAR/HEART/THUMB), Alchemer (MaxDiff/heatmap→preserve-raw, `shown`→`Answer.skipped`), Jotform (pipe options, `control_fullname` composite→multiple embedded), Forsta (datamap/triple-S/SPSS labels→`ChoiceOption.label`), CSV/SPSS (wide↔long pivot, date detection, SPSS value labels). Also: **scale-rescale** `out=round((in-inMin)/(inMax-inMin)*(outMax-outMin)+outMin)` — **every rescale flagged `metricAffecting=true`** (unit-level Principle 1 guard); **natural-key derivation** (stable, collision-safe across platforms, builds `ON CONFLICT DO UPDATE` not insert-only, refuses empty `source_record_id`); **parity** (NPS/CSAT/CES vs hand-computed; reports delta+reason not bare match; method-parameterized so user method reproduces source); **partial-failure** (497 good + 3 bad → `loaded=497, failed=3, status=partial`, conservation `loaded+failed+skipped=500`).

### 5.3 Connector record/replay (golden fixtures)

Record a real sandbox payload once, sanitize, replay deterministically forever. Triple under `backend/src/__tests__/prism/fixtures/{platform}/{case}/`: `source.export.json` · `meta.json` (extractionMode, recordedAt, sourceApiVersion, sanitizedBy) · `expected.raw.json` · `expected.canonical.json` · `expected.parity.json`. **Capture & scrub:** sandbox accounts only; emails→`user{n}@example.com`, names→seeded faker, phones/addresses→synthetic, free-text→neutralized, ids→stable pseudonyms (joins survive); strip auth/tokens/signed-URLs (assert none remain); pin timestamps. `[⚠]` A fixture is **invalid until the scrubber passes and a human signs `sanitizedBy`**; CI fails on any PII/secret pattern. Replay is order- and clock-independent (run twice → identical hash). **Coverage: a golden fixture for each extraction mode used** — export-poll (request→poll→download ZIP→stream-parse, cursor=export handle), paginate (multi-page, `nextPage`/`endCursor`, last-empty-page, cursor-resume), file (wide/long CSV, XLSX, SPSS labels, byte/row-offset resume), webhook (def+answers, HMAC verify, duplicate delivery → §5.5).

### 5.4 Contract tests (catch source API drift)

Golden fixtures are frozen; the source API is not. Each connector declares the fields/shapes it depends on; a **scheduled canary** fetches a small live sandbox sample and validates it (e.g. SurveyMonkey still exposes `family`+`display_options`; Typeform value key still named after `answer.type`). **Cadence:** nightly per connector + on-demand before a connector PR merge; sources without a sandbox (Medallia, InMoment) run on the **design-partner cadence**. **Fires on:** schema mismatch, new required field, removed mapped field, auth/endpoint change, rate-limit/429-shape change → routes to Connectors on-call (Sara) via Prometheus→Alertmanager; connector auto-marked `degraded` in `prism_connections.status` until re-certified. Sandbox creds live in Secret Manager (never env/fixtures). Contract failure is a **targeted alert + tracked re-cert task**, not a build break of unrelated work (keeps the deterministic suite green). These also serve as **prod monitors for live syncs** (the CDC drift early-warning, §6.7).

### 5.5 Idempotency / replay (exactly-once, proven)

Integration tests on ephemeral PG: re-running a completed job → zero-change dry-run (`create:0, update:0, skip_duplicate:total, conflict:0`); LOAD twice → identical row count (nat-key upsert); kill mid-EXTRACT → resume from cursor, ≤1 batch lost, still reconciles, `restartedFromScratch=false`; kill mid-LOAD → no double-apply (all-or-nothing tx); duplicate webhook → one Signal/Response; stale-signature webhook rejected (HMAC + freshness).

### 5.6 Data-fidelity certification (the release gate)

A connector cannot graduate and **a connector PR cannot merge** unless its certification harness passes on the golden corpus. **All four must pass:** count parity (`loaded + skipped_duplicate + intentional_drops == source_count`, `failed == 0` — Principle 2); answer checksums (canonical == recomputed-from-raw == fixture — Principle 1); metric parity (every NPS/CSAT/CES within tolerance under chosen method, deltas explained — Principle 3); timestamp continuity (min/max `submitted_at` == source, no injected import-time, no gaps — Principle 3). Harness `backend/src/__tests__/prism/certification/runCertification.ts` → `certifyConnector(platform)` replays the corpus through the full pipeline on ephemeral PG and reconciles; pass = `∀ counts ∧ ∀ checksums ∧ ∀ parity ∧ ∀ continuity`. The report mirrors the production signed recon report shape; `verdict: "CERTIFIED"` or red build. Runs on any change to `backend/src/lib/prism/connectors/{platform}/` or its fixtures; reports archived per corpus version (bisectable).

### 5.7 Load / soak / spike (the scale envelope)

Dedicated perf env (not CI), synthetic generated corpora (no PII), real PG+Redis+worker topology:

| Test | Setup | Must meet |
|---|---|---|
| **Load — 50M** | 50M responses / 40M contacts, one tenant | completes; LOAD ≥ 5k rows/s/tenant; raw buffer never unbounded; resume ≤ 500 |
| **Soak** | 5–10M rows/day for 24–72h | no memory/conn leak/queue creep; p99 stage latency flat; zero recon drift |
| **Spike** | 100s of tenants start within a short window | fair-share holds (no starve); no cross-tenant latency cliff; pgBouncer `cl_waiting` bounded; buckets never breach a source 429 ceiling |

Tracks worker CPU/mem, PG connection-budget headroom, pgBouncer pool waits, Redis memory, `org_id`-labeled throughput (fairness *measured*). A regression blocks GA.

### 5.8 Fault injection, security & skill evals

**Fault injection** (perf/chaos env, each maps to a §3.2 recovery): kill worker mid-stage (resume from cursor, ≤1 batch, recon matches); drop Redis (no loss, graceful degrade, no double-load on lock re-acquire); throttle source (backoff+jitter, cursor preserved, no breach); poison batch (`partial` not stuck, conservation holds); PG failover (atomic rollback, idempotent replay, exactly-once); pgBouncer saturation (queue drains as txns finish, no loss).

**Security tests:** tenant isolation (org A → org B's `prism_*`/canonical returns 0 rows / 404 — existence not leaked — fuzzed across every route/table); secret never returned (`GET /connections/:id` returns `credential_ref`+status only, asserted against secret-pattern matcher; same for logs); `legalPosture` enforcement (display-only source e.g. Yelp/Places/TripAdvisor **cannot write a Signal or call CrystalOS** — engine refuses TRANSFORM→LOAD, enrich blocked at boundary); erasure-by-provenance (delete by `metadata.prism.source_*` across canonical + raw, scoped to `org_id`, nothing survives); SSRF/egress (connector/OAuth-callback/file-fetch can't hit internal/metadata endpoints; `169.254.169.254` blocked; allowlist enforced); Zod validation (every body validated → 400 on malformed/oversized/extra-field, never a partial write).

**CrystalOS skill evals** (`schema-mapper`, `taxonomy-mapper`, `metric-parity`; two-tier). **Structural (deterministic, hard fail):** schema-mapper — every source field mapped or preserved-as-embedded, metric-bearing fields carry `metric`, no hallucinated target ids/options, scale changes flagged metric-affecting, validates against proposal schema; taxonomy-mapper — every label → merge/new/conflict (no silent drop), merged labels reference existing registry id, conflicts surfaced not auto-resolved; metric-parity — cites response ids, recommends match/rebaseline with concrete cause, no unexplained metric when `match=false`. **LLM-judge (graded):** seeded judge scores `EXAMPLES.md` on correctness/rationale/confidence-calibration; thresholded; below-threshold blocks a skill change. CrystalOS *proposes* — evals guard proposal quality, human-confirm UI is the safety net.

### 5.9 UX/a11y & release gates

E2E (Playwright, seeded backend): CSV import (file mode), Qualtrics (export-poll, OAuth→discover→AI-map→dry-run-parity→approve→recon), conflict resolution (keep-source/keep-existing/create-new honored at LOAD), **parity acknowledgement** (non-matching metric forces explicit ack/method before Approve enables), **point-of-no-return** (LOAD confirm; cancel = nothing written; nothing loads pre-confirm). A11y: keyboard-only operable + focus trap in point-of-no-return; ARIA stepper + `aria-live` progress; `prefers-reduced-motion`; `axe` clean + brand-chip contrast.

Ships behind `VITE_PRISM_ENABLED`; **flag off in prod until regression suite + per-connector cert green.** Graduation `flag off → internal dogfood → design-partner beta → GA`:

| Gate | Criteria |
|---|---|
| **Merge (any PR)** | unit+integration green; affected connector **cert CERTIFIED**; security green; skill structural evals pass; no a11y regression |
| **Internal dogfood** | E2E happy green; soak clean 24h on team data; dashboards live |
| **Design-partner beta** | cert on partner's *real* corpus; signed recon reviewed; `legalPosture` counsel-signed; fault-injection passes |
| **GA (connector)** | scale targets met; LLM-judge above threshold; full regression green; security sign-off; docs + locale shipped; self-serve completion > 85% |

**Regression suite** = unit + integration + all golden replays + every connector's cert + security + structural skill evals + E2E happy; runs every PR + nightly; a red suite blocks **all** merges. Graduation states (alpha=behind-flag internal/known-gaps-documented; beta=design-partner cohort, cert on real corpus, legal signed, "beta" badge; GA=flag default-on, all gates, self-serve) tracked in `prism_connections` + [`source-platforms-catalog.md`](./source-platforms-catalog.md).

---

## 6. Ops procedures

### 6.1 On-call, severities & incident flow

| Rotation | Who | Coverage |
|---|---|---|
| **Prism Primary** | SRE + Platform Ops pool | 24×7, 1-week shifts; PagerDuty `prism-primary`; owns all alerts, ack 5 min (Sev1/2) / 30 min (Sev3) |
| **Prism Secondary** | same pool, offset 1 wk | backup/escalation |
| **Migration Duty** | Migration Services (engagement lead) | shadows every enterprise cutover (§6.8); first contact for a customer mid-migration |
| **Eng escalation** | connector/engine owners | business hours; on-demand Sev1/2 |

| Sev | Definition | Ack / resolve |
|---|---|---|
| **Sev1** | Data-correctness risk OR active enterprise cutover blocked (wrong/dup/lost canonical, wrong-`org_id` rows, recon mismatch on live cutover, secret leak) | 5 min / 1 h mitigate |
| **Sev2** | Pipeline broadly degraded; SLOs breached many tenants; no loss but migrations stalled | 5 min / 4 h |
| **Sev3** | Single tenant/job impaired; contained; workaround exists | 30 min / 1 business day |
| **Sev4** | Cosmetic / no impact / proactive | next business day |

**Data-correctness always escalates** — any suspicion canonical data is wrong/dup/mis-tenanted/lost is **Sev1 regardless of blast radius**. When unsure, pick higher. **Escalation:** Primary acks → contained/known runbook resolve+log; Sev3 needing source/engine → Eng escalation; Sev2 → page Secondary+Eng, open `#inc-prism-<id>`; Sev1 → page Secondary+Eng+Priya (comms)+Sofia (if customer migration), declare incident, assign IC, open bridge. For a Sev1/2 touching a customer migration, **the engagement lead owns customer comms** — engineers never message the customer directly. Status page: Sev1 or multi-tenant Sev2 (Priya approves wording, never name customers, update ≥ every 30 min). **Customer-comms golden rule during a migration:** lead with *what is safe* (raw retained, nothing published without sign-off), then *what happened*, then *next step + ETA*.

**Incident flow:** DETECT (alert/customer) → TRIAGE (blast radius: one job/tenant/source/all; set severity; pull job state) → MITIGATE (stop bleeding *without destroying recoverability*: `pause` job → throttle/scale → `pause` connection-wide → rare `[⚠]` drain pool; **never delete raw/canonical to "fix"**) → RESOLVE (matching §6.x runbook; `resume`; confirm counts climb) → POSTMORTEM (Sev1/2 blameless within 5 business days: customer experience, timeline, 5-whys root cause, *why safeguards didn't catch it earlier*, action items in `docs/TRACKER.md`).

**Triage warm-up — first five commands:**
```bash
# 1. exact job state
curl -s -H "X-Internal-Key: $PRISM_INTERNAL_KEY" \
  https://prism-backend.fly.dev/api/admin/prism/jobs/$JOB_ID | jq '{stage,status,error,counts,cursor}'
# 2. recent transitions/errors (Loki)
fly logs -a prism-backend | grep "\"job_id\":\"$JOB_ID\""   # LogQL: {app="prism-backend"} | json | job_id="..."
# 3. queue depth + per-tenant fairness
redis-cli LLEN prism:q:extract; redis-cli LLEN prism:q:load
redis-cli --scan --pattern "prism:q:*:org:$ORG_ID"
# 4. source 429 rate → metric prism_source_429_total / prism_source_http_total{code="429"}
# 5. one job or systemic?
psql -c "SELECT stage,status,count(*) FROM prism_jobs WHERE deleted_at IS NULL GROUP BY 1,2 ORDER BY 3 DESC;"
```

### 6.2 Runbook — source rate-limit storm (429) / mass token expiry

**429 storm** (alert §4.5 Source-429). Diagnose: `sum by (source_platform)(rate(prism_source_http_total{code="429"}[5m]))`; `redis-cli HGETALL prism:ratebucket:$CONN_ID`. If the bucket is backing off with cursor preserved → **expected throttling, not an incident** (job slow, not broken). 429s *below* our declared limit → source tightened or shared app-level quota (SM 500/day, Typeform ~2/s). Action: do **not** raise concurrency (deepens throttle); if app-level quota is binding, lower the ceiling `[⚠] redis-cli HSET prism:ratebucket:$CONN_ID refill_rate <lower>`; for a hard daily cap switch to paced overnight backfill + set UI expectations; if 429s come with auth errors → token expiry below.

**Mass token/OAuth expiry** (alert `PrismAuthFailuresSpike`). Diagnose: group `prism_jobs` failed/paused where `error->>'message' ILIKE '%token%' OR '%401%'`; `fly logs | grep -E "invalid_grant|refresh_failed"`. Single connection = customer revoked → customer re-auth. **Many** connections one platform = **OAuth app creds rotated/revoked** or refresh broke (Sev2). Action: confirm secrets present in Secret Manager (`credential_ref`, `PRISM_SECRETS_BACKEND`, never PG/env); rotate app cred `[⚠] fly secrets set <SRC>_OAUTH_CLIENT_SECRET=... -a prism-backend` (update `.env.example` + `docs/ENV_VARS.md` key name only, never the value); jobs stay `paused` with cursor → trigger re-auth banner → `resume` (idempotent EXTRACT means no re-pull/dup).

### 6.3 Runbook — job stuck in stage past SLO

Alert §4.5 Job-stuck (`PrismJobStageStalled`; `running` but `counts` not climbing). Diagnose: `SELECT stage,status,updated_at,counts,error FROM prism_jobs WHERE id='$JOB_ID'`; `redis-cli GET prism:lock:job:$JOB_ID`. If `awaiting_input` → **not stuck**, waiting on a human (mapping/dry-run) — nudge owner, no engine action. Lock held + no progress + lease not expiring → wedged worker. Action: let the lease expire (self-heal) or force `[⚠] redis-cli DEL prism:lock:job:$JOB_ID; curl -X POST .../jobs/$JOB_ID/pause; curl -X POST .../jobs/$JOB_ID/resume` (resumes from cursor). Whole stage slow for everyone → systemic, jump to §6.2 or §6.5. Confirm counts climb within one heartbeat (≤60s).

### 6.4 Runbook — reconciliation mismatch (Sev1)

Alert §4.5 Recon-mismatch. **Treat as Sev1; block any cutover sign-off.** Diagnose `SELECT * FROM prism_recon_report WHERE job_id='$JOB_ID'` (source vs loaded per record_type, checksum_match, missing[], extra[]) + `counts`. Classify: loaded < source with skipped/failed > 0 → dropped in TRANSFORM/LOAD (poison → §6.5); loaded < source no failures → EXTRACT under-pull (pagination/cursor); **loaded > source → duplication, STOP** (suspect missing/invalid nat-key index); counts match + checksums differ → silent transformation (Principle 1 violation). Action: **never publish an unexplained mismatch** (keep `partial`/`paused`); duplication → verify `SELECT indisvalid FROM pg_index WHERE indexrelid='responses_prism_nat_key'::regclass` (must be true), rebuild `[⚠]` + re-dry-run, soft-delete dups by `import_batch_id` (§6.9); under-pull → re-EXTRACT from reset cursor (raw dedupes) + re-TRANSFORM from raw (no source re-hit); checksum drift → open metric-parity/mapping diff, decide match vs rebaseline **with the customer**; document the resolved delta in the signed recon report before sign-off.

### 6.5 Runbook — poison batch / Postgres pressure / pgBouncer exhaustion / Redis loss

**Poison batch** (alert LOAD-error-rate; `counts.failed` climbing, same batch cycles). Diagnose offending records via `prism_raw_records` (read-only, PII-aware — no PII in incident channel). The engine bisects a failing batch to quarantine the poison record(s); the rest loads. Action: confirm quarantine routing on; if mapping edge case → fix mapping, re-TRANSFORM from raw, re-dry-run, resume LOAD (good rows already upsert-idempotent); if genuinely unmappable → record in dry-run "unmapped/preserved" (Principle 2); job ends `partial`, recon lists quarantined.

**Postgres pressure** (alert `PrismPgContention`; LOAD drops platform-wide, lock waits, autovacuum behind, disk climbing). Diagnose blocked/blocking via `pg_locks`+`pg_stat_activity`; bloat via `pg_stat_user_tables` (`n_dead_tup`, `last_autovacuum`) on `responses`/`prism_raw_records`/`signals`. Many upserts on same nat-key index → contention (LOAD concurrency should be ≤ §2.3 budget). Action: reduce concurrency first `[⚠] redis-cli SET prism:cfg:load_concurrency 4`; per-tenant fairness — lower the *giant* migration's share, not everyone's; confirm purge-after-reconcile; targeted `VACUUM (ANALYZE) prism_raw_records` off-peak `[⚠]`; disk near ceiling → also a reliability event (§3.8); **never `DELETE` canonical to free space — soft-delete only.**

**pgBouncer pool exhaustion** (alert pgBouncer-pool-wait; batch duration up, LOAD throughput flat, *no* PG error). Key fact: transaction-mode pooler runs out of free *server* conns because a long-held txn pins one — the symptom looks like slowness, not failure. Diagnose `psql -p 6432 pgbouncer -c "SHOW POOLS"` (watch `cl_waiting`, `sv_active` vs `pool_size`) + `SHOW CLIENTS`; find the long txn `SELECT pid, state, now()-xact_start AS age, query FROM pg_stat_activity WHERE state <> 'idle' ORDER BY age DESC`. Action: terminate the offending long txn `[⚠] SELECT pg_terminate_backend(<pid>)` (its batch rolls back and replays idempotently, ≤500); cut LOAD concurrency `[⚠] redis-cli SET prism:cfg:load_concurrency 4` until the queue drains; verify the < 2s/batch txn ceiling is enforced (a regression that lengthens txns is the usual root cause); **never raise `default_pool_size` past 120** (that just pushes contention into Postgres, §2.9). Self-heals once txns shorten.

**Redis loss** (alert `PrismRedisDown`; queues/buckets/locks gone, jobs "stuck"). Key fact: Redis holds **only ephemeral coordination** — the SoR is Postgres, no durable state in Redis → a **recoverability** event, not data-loss. Diagnose `redis-cli PING/DBSIZE`; `fly status -a prism-redis`. Action: restore Redis (§3.8); **rehydrate queues from Postgres** `curl -X POST -H "X-Internal-Key: $PRISM_INTERNAL_KEY" https://prism-backend.fly.dev/api/admin/prism/requeue-active` (rebuilds from `prism_jobs`); buckets rebuild lazily from `connector.meta` (start conservative → avoid 429 storm); re-acquired locks are safe (cursor + idempotent stages); verify no dup loads (`GROUP BY natural_key HAVING count(*)>1` returns nothing).

### 6.6 Runbook — enrichment backlog / credits exhausted

Alert §4.5 Enrich-lag / Credit-exhaustion; jobs sit at `stage='enrich'` or credit preflight rejects. Diagnose `redis-cli LLEN prism:q:enrich`; `SELECT balance FROM credit_ledger_balance WHERE org_id='$ORG_ID'` + recent `credit_ledger` debits. Backlog without credit issue = CrystalOS throughput bottleneck; credits exhausted = backfill cost wasn't pre-estimated. Action: **LOAD/RECONCILE are already durable before ENRICH — a stalled enrichment is never data-loss, only delayed insight (Sev3, not Sev1)**; credits exhausted → surface preflight to customer, let LOAD+RECONCILE+PUBLISH finish, run enrichment overnight once topped up (no silent auto-charge); backlog → `fly scale count 4 -a prism-crystalos` `[⚠]` (cost — clear with Anton/Priya); schedule huge migrations off-peak; confirm the ledger debits **once** per enrichment (double-debit = Sev2 billing-correctness).

### 6.7 Runbook — continuous-sync failures: schema drift / CDC stall / mass webhook failure (I5)

**Source-schema drift on a live sync** (alert `PrismConnectorErrorSpike{source_platform}` or data-quality drift §4.6; one connector's sync jobs fail uniformly — schema mismatch, removed field, changed pagination — often a vendor changelog; the §5.4 contract canary is the early-warning). Diagnose `fly logs | grep "$SRC" | grep -iE "schema|unexpected|deprecat|version"`; isolate to one platform via failed-count group-by. Action: **pause new jobs for that connector** `[⚠] curl -X POST .../api/admin/prism/connectors/$SRC/disable -d '{"reason":"upstream breaking change <ticket>"}'`; in-flight jobs are safe (raw extracted is in `prism_raw_records`, pause with cursor); engage the connector owner to ship a fix + add a record/replay fixture from the new payload; roll fix, **re-enable**, `resume` (extract continues from cursor, transform replays from raw if mapping changed); post-fix add a contract canary (§5.4) so the next bump is caught in CI, note version in `connector.meta`.

**CDC cursor stall** (alert CDC-sync-stalled; a `kind='sync'` job's `stage_age` rises with no new raw). Diagnose: read the stored cursor `SELECT cursor FROM prism_jobs WHERE id='$JOB_ID'` and compare `updated_since`/`continuationToken` against the source's latest; check for a silently-emptied page or a source-side cursor-expiry. Action: if the source invalidated the continuation token, **reset to a safe `updated_since` watermark just before the last confirmed extract** and resume — raw `payload_hash` dedup absorbs the overlap (§2.8), so over-fetching is harmless; never advance the cursor past a gap. Confirm new raw lands and recon over the sync window balances.

**Mass webhook failure** (sync sources; deliveries stop landing or error en masse). Diagnose: check webhook ingress logs + signature-verification failures (HMAC); is it our endpoint (5xx/deploy) or the source (stopped sending / rotated signing secret)? Action: duplicate-delivery is already absorbed (idempotent dedup, §3.2) — the risk is *missed* deliveries. If our endpoint was down, **backfill the gap with a polled `updated_since` catch-up sync** (cursor-driven, §2.8) rather than trusting at-least-once redelivery; if the source rotated its signing secret, update it in Secret Manager `[⚠]` and resume; verify no gap via recon over the sync window.

### 6.8 Enterprise cutover playbook (white-glove, owner: Migration Services)

**Governing rule: no incumbent two-way sync — one clean, dated cutover.** Prism reads the incumbent and loads into Xperiq; never writes back. After the agreed cutover date Xperiq is system of record for the migrated data; ongoing *one-way* review/signal sync is fine.

- **Pre-flight (T-minus weeks):** engagement lead + shared bridge named; **scope agreed in writing** (surveys/responses/contacts/signals, date range, parity metrics; anti-scope confirmed); **counsel-signed `legalPosture`** for every source `[⚠]` (no extraction without it); access provisioned in Secret Manager (least-privilege; **GBP** approval confirmed — §6.10; **Medallia/InMoment** SFTP drop arranged); residency/HIPAA confirmed (region-pinned workers); **credit preflight** estimated (avoids §6.6); capacity check with SRE (fair-share headroom, PG+worker budget reserved); rollback plan + `import_batch_id` scheme reviewed (§6.9); **logical pre-load snapshot taken for any non-empty org** (so updates to pre-existing rows are reversible, §6.9).
- **Connection + scope sign-off:** CONNECT→DISCOVER; walk the customer through what Prism found at source; customer signs off discovered scope (counts/resource) = the reconciliation target.
- **Dry-run review (the trust gate):** EXTRACT→PROFILE→MAP (Crystal proposes, Migration Services + customer confirm/edit mappings incl. taxonomy)→TRANSFORM→**DRY-RUN**; present `prism_dryrun_report` live (creates/updates/skips/conflicts, **metric parity** with explained deltas, **timestamp continuity**, unmapped-but-preserved). **Nothing written to canonical yet** — resolve every conflict and agree the metric method with the customer; customer approves = contractual "yes".
- **Load window:** agree an (often off-peak) window; engagement lead + Primary on the bridge; run LOAD (`POST /jobs/:id/approve` with conflict resolutions + metric methods); watch throughput/error-rate/fair-share; trouble → §6.4/§6.5; pause is always safe.
- **Reconciliation sign-off:** run RECONCILE; generate **signed report** (`GET /api/prism/jobs/:id/report.pdf`: loaded vs signed-off scope, checksums, parity, quarantined-with-reasons, continuity); `[⚠]` **customer countersigns — no go-live without it**; any unexplained mismatch blocks (§6.4).
- **Go-live:** ENRICH (may be deferred/overnight, §6.6) → PUBLISH (marks sources active + emits DataBus invalidation). **This is the dated cutover.**
- **Post-cutover validation:** spot-check trend lines across the cutover date (continuity unbroken); customer validates a sample + a key metric + a longitudinal view; Crystal answers a real question (insight-on-arrival); confirm raw retention applied; arrange incumbent decommission **after** validation; short retro → `docs/TRACKER.md`.
- **Comms cadence:** window start ("incumbent untouched; nothing published until you sign"); mid-load delay (lead on bridge: what/why/ETA + losslessness reassurance); recon ready ("report attached for countersignature"); go-live ("Xperiq is now your system of record; here is your insight"); any incident → Sev1/2 path, lead leads comms.

### 6.9 Rollback by `import_batch_id`

Every loaded row carries `metadata.prism.import_batch_id`; canonical deletes are **soft** (`deleted_at`); raw lives in `prism_raw_records` → imports are undoable. **Full** (dry-run approved in error / wrong scope / customer aborts) vs **partial** (one bad batch) vs **no data rollback** (data correct, only enrichment wrong → re-run ENRICH, §6.6). Procedure: (1) `curl -X POST .../jobs/$JOB_ID/cancel`; (2) soft-delete by batch `[⚠] UPDATE responses SET deleted_at=now() WHERE org_id='$ORG_ID' AND metadata->'prism'->>'import_batch_id'='$BATCH_ID' AND deleted_at IS NULL` (repeat signals/contacts/surveys; loop all batch ids for the job); (3) restore prior state — **net-new rows fully reverse by soft-delete; updates to pre-existing rows reverse only to the pre-load snapshot/PITR** (§3.8), so for a non-empty org the pre-flight logical snapshot (§6.8) is mandatory; (4) optional raw purge `[⚠] DELETE FROM prism_raw_records WHERE org_id='$ORG_ID' AND job_id='$JOB_ID'` (erasure obligation only); (5) emit DataBus invalidation; (6) comms ("fully reversed; no rolled-back data remains live; your incumbent was never modified"). **Partial** = same scoped to one `$BATCH_ID`, then re-dry-run + fix + re-load (idempotent). **The incumbent is never modified** — rollback only ever touches Xperiq.

### 6.10 Connector lifecycle

**Onboarding** (meets [`engineering-plan.md`](./engineering-plan.md) §9 DoD + ops gate): implements `PrismConnector` + declares `meta` (platform, authKind, capabilities, **counsel-signed `legalPosture`**, rate limits); display-only sources cannot write content/call CrystalOS (enforced in code); least-privilege scopes + Secret Manager `credential_ref` (secret never to client); rate limits → Redis bucket; record/replay + idempotency + reconciliation pass; env vars in `.env.example` + `docs/ENV_VARS.md` same PR; per-source metrics + alerts wired; rollout behind a flag, canary on a design-partner first. **Credential rotation:** app-level (`*_OAUTH_CLIENT_SECRET`, `APPLE_ASC_*`) via `fly secrets set` `[⚠]` with provider overlap (jobs resumable across it); per-connection via customer re-auth (never re-pulls raw); alert ahead of known expiries. **Disable/deprecate:** disable intake `[⚠]` (existing jobs stay paused & resumable) → notify orgs → mark `deprecated` (block new connections, keep extraction for in-flight through a sunset date) → remove only after no active jobs (soft-delete `prism_connections`, retain raw per policy, keep `legalPosture` history). **Version bumps:** track API version in `connector.meta` + changelog watch; on a bump add a fixture, run the contract canary, ship the update, bump `meta`; breaking bump in prod = §6.7. **GBP access:** Google Business Profile API has a **default quota of 0** — maintain a GBP approval tracker (org, request date, Google ticket, quota state, reviewer); start approval **at engagement kickoff** (never at the load window); until approved GBP reviews are blocked — unblock the "wow" with CSV/owned-app reviews first; on approval verify granted quota covers the location count (300+ for a restaurant group) before committing a window.

### 6.11 SLAs & support

| Tier | Scope | Response SLA | Migration support |
|---|---|---|---|
| **Self-serve** | wizard imports (CSV, SurveyMonkey, Typeform, Forms…) | in-product + email, next-business-day | runbook-guided self-recovery (auto-resume) |
| **Enterprise / white-glove** | managed (Qualtrics large, Medallia/InMoment, Forsta) | named lead; bridge during cutover; Sev1 ack 5 min | full §6.8 playbook; signed recon; post-cutover validation |

**Data SLA (both):** losslessness + continuity are guarantees, not service-credit SLAs — a continuity break is a Sev1. Availability SLA tracks the platform SLA. Self-serve: in-product banners surface state in plain language ("paused — no data lost — resuming"); most issues self-heal; ticket → Secondary if engine-side. Enterprise: engagement lead is first contact; customer never debugs against the raw pager. Escalation: self-serve → ticket → Secondary → Eng; enterprise → engagement lead → Primary → IC + Eng + TPM (Sev1/2), comms always via the lead.

---

## 7. Engineering-readiness checklist (the DoD)

A connector/feature is **prod-ready** only when ALL hold (else **beta behind a flag** at most). Each line is the merge of [`engineering-plan.md`](./engineering-plan.md) §9 with §2–§6 here — the single source of truth for "is this connector done?":

- [ ] **Closed-loop seam:** skill (CrystalOS) → contract (backend endpoint + persisted) → handler (frontend preview→confirm→execute→invalidate) → outcome recorded.
- [ ] **Correctness (§3.5, §3.7):** nat-key upsert idempotency proven (re-run = no-op diff); conservation equation **enforced in code** so a job that fails it cannot reach `complete` (non-zero data-loss pages, R2); dry-run surfaces every transform/drop honestly (Principle 1).
- [ ] **Resumability & reversibility (§3.5, §6.9):** crash mid-stage resumes from `cursor` (no re-pull/dup, R6); pause/resume/cancel safe; import undoable by `import_batch_id` (soft-delete); pre-load snapshot for non-empty orgs; rollback rehearsed.
- [ ] **Poison & degradation (§3.4, §3.6):** malformed record → `prism_record_errors`, job → `partial`, error report downloadable, replay flips `partial → complete`; CrystalOS-down + credits-low still LOAD+RECONCILE+PUBLISH (R8 decoupled from R1–R3).
- [ ] **Security/compliance (§5.8):** counsel-signed `legalPosture` (display-only can't write Signal/call CrystalOS); least-privilege; secrets in Secret Manager (never env/PG/client); residency/PII per [`security-compliance.md`](./security-compliance.md); erasure-by-provenance works.
- [ ] **Multi-tenant + rate-limit safety (§2.4, §2.7):** every query/row `org_id`-scoped; per-tenant fair-share verified; declared limits via Redis token bucket, backoff+jitter, no storm.
- [ ] **Scale (P1 load test, §2):** partitioning live; exactly-once at scale (re-run 10M = no-op diff); sustained LOAD ≥ 5k/s/tenant, peak ≥ 10k without exceeding 120 conns under 200 tenants; pgBouncer `cl_waiting` bounded; EXTRACT never trips a throttle; backpressure 2M/500k; fairness (50M + 50-row both progress); resume ≤ 500; media offloaded; delta sync moves only changes; autovacuum < 20% dead; autoscaling never passes the conn budget; cost guardrails enforced; worked-50M reconciles in ~4–6 hr.
- [ ] **Observability (§4):** stage + source metrics labelled (no `job_id`/`record_id` labels); logs carry full `PrismLogContext`, **no PII** (redactor test); traces propagate frontend→backend→worker→CrystalOS; alerts wired + fault-injection-tested; lineage resolves (`prism_lineage_orphans_total` == 0); SLO + burn-rate coverage registered.
- [ ] **Reliability (§3.8, §3.9):** Redis-loss rehydration works; PITR covers a pre-load snapshot; `[⚠]` prod infra (Fly PG backup cadence/WAL retention/sync mode + region-failover) verified — async replication makes true RPO = replication lag; **signed recon report** produced; **game-day cadence** live (monthly staging + pre-GA per connector).
- [ ] **Testing (§5):** unit + integration green; golden record/replay per extraction mode (sanitized, human-signed); contract canary scheduled + alert wired; idempotency/replay green; **data-fidelity certification `verdict = CERTIFIED`** on golden corpus *and* design-partner real corpus before beta; fault injection (incl. pgBouncer + CDC stall); full security suite; skill evals (structural + LLM-judge); E2E happy + conflict + parity-ack + point-of-no-return + a11y; regression suite green.
- [ ] **Cost (§2.10):** enrichment credit preflight/estimate; deferrable; no double-debit on replay; estimate-vs-actual drift tracked.
- [ ] **Docs/env:** new env vars in `.env.example` + `docs/ENV_VARS.md` (platform rule); `prism` locale strings in `en.ts`; runbook updated; tracker tasks filed; graduation recorded with cert report archived per corpus version.

> A connector that ships without a green cert is a **silent-loss / broken-trust risk** — it violates the reason Prism exists ("Bring everything. Lose nothing. Lose no sleep."). The checklist is non-negotiable; exceptions require an ADR ([`architecture-review.md`](./architecture-review.md)). **If we can't see it, prove it, and reverse it — it doesn't ship.**

---

> **Cross-references:** the engine these procedures operate → [`architecture-ingestion.md`](./architecture-ingestion.md) ·
> secrets, residency, erasure, legal posture → [`security-compliance.md`](./security-compliance.md) ·
> contracts & phasing, per-connector DoD §9, risk register §8 → [`engineering-plan.md`](./engineering-plan.md) ·
> source quirks, hard cases, GA waves → [`source-platforms-catalog.md`](./source-platforms-catalog.md) ·
> operating modes & strategy → [`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md) ·
> roles & ownership → [`teams.md`](./teams.md) · review record (debate, issue resolutions, readiness, ADRs) → [`architecture-review.md`](./architecture-review.md) ·
> the doc set → [`README.md`](./README.md).
