# Intelligence Briefings — Scheduled Reports: Operational Review

**Author**: Roberto Nakamura, Infrastructure Engineer
**Date**: 2026-06-29
**Status**: Pre-launch review — P0 items must be resolved before GA

---

## 1. Executive Summary

The Intelligence Briefings architecture is well-structured at the schema and API contract level, but the generation pipeline has not been designed for operational scale. Two P0 findings — no generation queue with concurrency limits, and Playwright running inside the main CrystalOS process — will cause service-wide outages under normal Monday-morning load if launched without remediation. The remaining P1 findings represent real data integrity and cost risks that will manifest within the first month of GA usage. My recommendation is to hold the launch until OPS-001 and OPS-002 are resolved, and to address OPS-003 through OPS-007 in the sprint immediately following.

---

## 2. Operational Risk Register

### P0 — Launch Blockers

---

#### OPS-001: No Generation Queue — Fan-Out Storm on Peak Load

**Title**: Unbounded concurrent LLM and graph invocations at peak schedule time

**Description**: The scheduler tick runs every 60 seconds and queries for all due reports with `LIMIT 100`. The `enqueue_report_run` function, as currently described, makes a direct async call into the CrystalOS generation graph — there is no intermediate queue, no concurrency cap, and no backpressure mechanism. On a typical Monday at 9:00am, if 500 organizations each have 10 active reports scheduled at the same wall-clock time, the scheduler will attempt to dispatch 5,000 generation runs across 50 ticks (10 minutes). Each generation run calls `generate_narrative` (LLM) and `generate_highlights` (LLM). That is 10,000 simultaneous LLM API requests.

**Failure Mode**: CrystalOS process crashes or becomes unresponsive under concurrent load. All 100 runs dispatched in the first tick transition to `status = 'running'`, hold their 15-minute Redis locks, and never complete. The scheduler skips them on the next tick (lock held), so subsequent batches begin processing but the service is already degraded. At the LLM provider layer, 10,000 simultaneous requests will hit rate limits (typically 500–1,000 RPM on enterprise tiers), causing systematic `429` errors that the graph has no retry handler for.

**Exact Fix**:
1. Replace the direct `enqueue_report_run` call with an enqueue into a BullMQ queue (Redis-backed, already available in the stack) with a configurable concurrency cap (start at 20 workers).
2. Add a `max_concurrent_runs_per_org` config (default: 3) enforced at enqueue time.
3. Add exponential backoff retry with jitter on LLM `429` errors in the `generate_narrative` and `generate_highlights` graph nodes.
4. Add a `queue_depth` metric emitted on each scheduler tick.

**Files Affected**:
- `crystalos/scheduler/tick.py` — replace direct dispatch with queue enqueue
- `crystalos/graphs/report_generation.py` — add retry logic on LLM nodes
- `backend/src/services/reportRunService.ts` — add queue depth telemetry
- New file: `crystalos/workers/report_generation_worker.py`

---

#### OPS-002: Playwright Inside CrystalOS Blocks LLM Capacity

**Title**: PDF rendering (headless Chromium) runs in-process with LLM graph, consuming 500MB RAM per render

**Description**: The `render_pdf` node in the CrystalOS generation graph launches Playwright (headless Chromium). Chromium requires approximately 500MB RSS per instance and takes 20–30 seconds to render a complex HTML report to PDF. Because this runs as a node in the same LangGraph execution, it occupies a CrystalOS async worker slot for the full 30-second render duration. With 20 concurrent generation runs (the proposed queue concurrency), 5 simultaneous PDF renders consume 2.5GB RAM and block 5 out of 20 worker slots — a 25% capacity tax on the entire generation pipeline for every report with PDF enabled.

**Failure Mode**: CrystalOS OOM-kills when PDF renders overlap with peak narrative generation load. The Fly.io machine for CrystalOS (assumed 2–4GB RAM) is exhausted by 4–8 simultaneous PDF renders. Narrative-only reports are delayed because worker slots are occupied by Chromium processes. If the Chromium process hangs (network timeout fetching an external asset), the graph node hangs and holds the run lock for the full 15-minute timeout.

**Exact Fix**:
1. Extract PDF rendering into a separate CrystalOS worker type: `pdf-worker`. Run as a separate Fly.io machine or process group with `scale count 2` and a dedicated concurrency limit of 4.
2. The `render_pdf` graph node should POST the rendered HTML artifact to a `POST /internal/pdf/render` endpoint on the pdf-worker and await the result asynchronously.
3. Set a 60-second timeout on Chromium render. On timeout, mark `pdf_status = 'failed'`, deliver the HTML report without PDF, and alert.
4. Run Chromium with `--disable-dev-shm-usage` and `--no-sandbox` flags in container environments to prevent shared memory exhaustion.

**Files Affected**:
- `crystalos/graphs/report_generation.py` — refactor `render_pdf` node to HTTP call
- New file: `crystalos/workers/pdf_worker.py`
- `backend/fly.toml` or equivalent Fly.io config — add pdf-worker process group
- `crystalos/CLAUDE.md` — update architecture notes

---

### P1 — Must Fix Before First Month

---

#### OPS-003: CrystalOS Single Point of Failure — No Fallback Mode

**Title**: All scheduling, generation, and PDF rendering fails silently when CrystalOS is down

**Description**: The scheduling tick, the LangGraph generation graph, and the Playwright PDF renderer all run inside a single CrystalOS process. A CrystalOS deployment failure, OOM, or unhandled exception stops all three simultaneously. The scheduler sets `status = 'running'` before dispatching to CrystalOS; if CrystalOS never responds, the run stays `'running'` forever (no timeout from the scheduler side) or until the 15-minute Redis lock expires. No fallback generates a simplified report from pre-computed data.

**Exact Fix**:
1. Add a `run_timeout_minutes` column to `scheduled_reports` (default: 20). The scheduler tick should transition any `status = 'running'` runs older than `run_timeout_minutes` to `status = 'failed'` with `error_message = 'run_timeout'`.
2. Add an alerting rule: if `count(report_runs where status='running' AND started_at < now() - interval '25 minutes') > 0`, page on-call.
3. Design a fallback generation path: if CrystalOS returns 503, generate a minimal report from the `metric_snapshots` table (once it exists) without LLM narrative. Mark the report `narrative_quality = 'degraded'`.

**Files Affected**:
- `crystalos/scheduler/tick.py` — add stale-run reaper
- `backend/src/services/reportRunService.ts` — add timeout transition
- `supabase/migrations/` — add `run_timeout_minutes` column

---

#### OPS-004: Run Deduplication Relies Solely on Redis Lock

**Title**: Redis restart or lock expiry before run completion can produce duplicate report deliveries

**Description**: The only deduplication mechanism is a Redis `SET NX` lock with a 15-minute TTL keyed on `report_run_id`. The `report_runs` table has no unique constraint on `(scheduled_report_id, scheduled_for_time)`. If Redis restarts mid-run, the lock is lost. The scheduler tick will re-query the same due report (its `next_run_at` has not advanced because the run has not completed) and dispatch a second run. Two runs complete, two emails are sent to every recipient.

**Exact Fix**:
1. Add a unique constraint to the database: `ALTER TABLE report_runs ADD CONSTRAINT uq_report_runs_schedule UNIQUE (scheduled_report_id, scheduled_for_time);`
2. The `enqueue_report_run` function should INSERT with `ON CONFLICT (scheduled_report_id, scheduled_for_time) DO NOTHING` and check the affected row count before dispatching.
3. Keep the Redis lock as a performance optimization (avoid re-querying DB on every tick), but treat the DB constraint as the authoritative deduplication gate.

**Files Affected**:
- `supabase/migrations/` — new migration adding the unique constraint
- `crystalos/scheduler/tick.py` — update enqueue logic to handle conflict
- `backend/src/services/reportRunService.ts` — update insert to use `ON CONFLICT`

---

#### OPS-005: Email Bounce Feedback Loop Not Wired

**Title**: Hard email bounces are not fed back to `report_recipients.is_active`, causing silent suppression

**Description**: SendGrid suppresses hard-bounced addresses at the account level after the first bounce. If Xperiq does not process the SendGrid `bounce` webhook event and mark `report_recipients.is_active = false` (or equivalent), subsequent sends to that address will be silently rejected by SendGrid. The report creator has no visibility — the run shows `status = 'delivered'` but the recipient never receives the report. At scale with a shared SendGrid account, accumulating suppressed addresses also degrades sender reputation across all orgs.

**Exact Fix**:
1. Implement a `POST /webhooks/sendgrid` handler (Simone's domain per TEAM.md) that processes `bounce`, `spamreport`, and `unsubscribe` events.
2. On `bounce` (type: `hard`): set `report_recipients.is_active = false`, set `report_recipients.bounce_reason = event.reason`, and log to the audit table.
3. On the next scheduler run, skip recipients where `is_active = false`.
4. Surface `is_active = false` recipients in the report builder UI with a "delivery failed" indicator.
5. Add `is_active BOOLEAN NOT NULL DEFAULT true` and `bounce_reason TEXT` columns to `report_recipients` if not present.

**Files Affected**:
- `backend/src/routes/webhooks.ts` — new SendGrid webhook handler
- `backend/src/services/reportRecipientService.ts` — bounce update logic
- `supabase/migrations/` — add `is_active`, `bounce_reason` columns
- `app/src/` — surface bounce status in report builder

---

#### OPS-006: Preview Endpoint is Synchronous and Unbounded

**Title**: `POST /api/reports/:id/run-now?preview_only=true` blocks HTTP for 5–12 seconds with no concurrency limit

**Description**: The preview endpoint runs the full CrystalOS generation graph synchronously and holds the HTTP connection open for the full duration. The DESIGN.md acknowledges "5–12 seconds" per preview. The frontend debounce hook is a UI-only control — it does not prevent a user from opening multiple browser tabs or calling the endpoint programmatically. 100 simultaneous preview requests create 100 simultaneous LLM calls. Unlike scheduled runs, preview requests bypass the scheduler queue (OPS-001 fix) entirely and have no rate limit.

**Exact Fix**:
1. Move preview generation to the same BullMQ queue with a separate `preview` job type and a per-org concurrency limit of 2.
2. The endpoint returns `202 Accepted` with a `job_id`. The frontend polls `GET /api/reports/preview/:job_id/status` at 2-second intervals (or uses SSE).
3. Add a `preview_timeout_seconds = 30` server-side hard timeout. If exceeded, return a partial preview with a warning banner.
4. Add a per-org rate limit of 10 preview requests per minute at the Express middleware layer.

**Files Affected**:
- `backend/src/routes/reports.ts` — convert preview to async + 202 pattern
- `backend/src/services/reportPreviewService.ts` — new service
- `crystalos/workers/report_generation_worker.py` — add preview job type
- `app/src/` — update preview polling logic

---

#### OPS-007: No LLM Cost Model or Per-Run Budget

**Title**: LLM costs for report generation are untracked and uncapped at the application layer

**Description**: No cost model is documented in any of the five design documents. Each `generate_narrative` call and each `generate_highlights` call consumes LLM tokens proportional to the survey scope. There is no per-run cost tracking, no per-org budget cap, no input token limit (a 50,000-response survey produces a large data context), and no alerting on unexpected cost spikes. Without this, a single misconfigured org-wide report scoped to 100,000 responses can spend $5+ per run undetected. See Section 4 for the full cost model.

**Exact Fix**:
1. Add `llm_input_tokens INT`, `llm_output_tokens INT`, `llm_cost_usd NUMERIC(10,6)` columns to `report_runs`.
2. Log token usage from every LLM call in the generation graph and aggregate onto the run record at completion.
3. Add a per-org monthly cap: `orgs.report_llm_budget_usd NUMERIC(10,2) DEFAULT 50.00`. Reject generation if the org has exceeded its monthly budget and notify the org admin.
4. Add a cost anomaly alert: if `sum(llm_cost_usd) in last 1 hour > $100`, page on-call.

**Files Affected**:
- `supabase/migrations/` — add cost columns to `report_runs`, budget column to `orgs`
- `crystalos/graphs/report_generation.py` — log token usage per node
- `backend/src/services/reportRunService.ts` — store cost on run completion

---

### P2 — Address Within 30 Days of Launch

---

#### OPS-008: `LIMIT 100` Scheduler Cap Causes Silent Delay at Peak

**Title**: Scheduler processes at most 100 due reports per tick; 1,000 due reports take 10 minutes

**Description**: The scheduler query includes `LIMIT 100`. At peak (1,000 reports all due at 6:00am Monday), the scheduler requires 10 ticks (10 minutes) to process all due reports. Reports scheduled for 6:00am may not begin generation until 6:09am. This is undocumented behavior that violates any "zero missed runs" SLA. There is no metric tracking how long due reports sit before being dispatched.

**Exact Fix**:
1. Raise `LIMIT` to 500 once the BullMQ queue (OPS-001) is in place — the queue absorbs concurrency, so dispatching 500 job IDs per tick is safe.
2. Add a metric: `report_scheduler_dispatch_lag_seconds = now() - min(next_run_at)` for all pending due reports. Alert if P95 > 120s.
3. Document the behavior and the dispatch lag SLO in `ARCHITECTURE.md` under "Scheduler Guarantees."

**Files Affected**:
- `crystalos/scheduler/tick.py` — raise LIMIT, add dispatch lag metric
- `docs/scheduled-reports/ARCHITECTURE.md` — document scheduler guarantees

---

#### OPS-009: DST Transition Needs Explicit Test Coverage

**Title**: `next_run_at` UTC calculation for cron schedules across DST boundaries has no regression tests

**Description**: croniter correctly handles DST when a timezone-aware datetime is passed. However, there is no test verifying that a weekly cron (`'0 6 * * 1'`) for `America/New_York` produces the correct UTC `next_run_at` value across spring-forward and fall-back transitions. A bug here would cause reports to run at 5:00am or 7:00am local time for one week following the transition — subtle and hard to detect in production.

**Exact Fix**:
1. Add parameterized tests in `crystalos/tests/test_scheduler_dst.py` covering:
   - Spring-forward: weekly schedule straddling the 2:00am → 3:00am transition
   - Fall-back: weekly schedule where the computed time is ambiguous (1:30am occurs twice)
   - Verify that `next_run_at` in UTC corresponds to the correct local wall-clock time on both sides of the boundary
2. Pin the croniter version in `crystalos/requirements.txt` to prevent silent regressions on library upgrades.

**Files Affected**:
- New file: `crystalos/tests/test_scheduler_dst.py`
- `crystalos/requirements.txt` — pin croniter version

---

#### OPS-010: Artifact Pruning Job Not Specified

**Title**: `expires_at` is set on `report_artifacts` but no pruning job is defined or scheduled

**Description**: The schema sets `expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')` on `report_artifacts`. Without a pruning job, expired artifacts accumulate indefinitely in Postgres (`html_content TEXT`) and in the object store (`html_storage_key`, `pdf_storage_key`). At 500 orgs × 10 reports/week × 90-day retention, the artifact table accumulates approximately 180,000 rows before any pruning occurs. At 256KB inline HTML per artifact, that is approximately 46GB stored in Postgres TEXT columns alone.

**Exact Fix**:
1. Add a daily cron in the CrystalOS scheduler running at 03:00 UTC: for each expired artifact row, delete the GCS objects for `html_storage_key` and `pdf_storage_key` (handle 404 gracefully), then delete the DB row.
2. Add a database index: `CREATE INDEX idx_report_artifacts_expires_at ON report_artifacts(expires_at)` to make the pruning query efficient.
3. Log pruning metrics: rows deleted, storage keys deleted, estimated bytes freed.
4. Add the pruning cron to the ROADMAP as a named phase deliverable.

**Files Affected**:
- `crystalos/scheduler/tick.py` — add daily pruning tick
- New file: `crystalos/jobs/artifact_pruner.py`
- `supabase/migrations/` — add `expires_at` index

---

#### OPS-011: Artifact Storage Backend Decision Deferred

**Title**: `html_storage_key` and `pdf_storage_key` reference GCS or S3 without a committed backend or size limits

**Description**: The schema defines `html_storage_key TEXT` and `pdf_storage_key TEXT` without specifying the storage backend. The ARCHITECTURE.md mentions "GCS/S3" without committing to either. No maximum artifact size is defined. A QBR Pack with 500 surveys and 4 quarters of data can produce HTML exceeding 1MB and PDFs exceeding 50MB. A single runaway report could write a multi-gigabyte PDF to the object store without triggering any alert.

**Exact Fix**:
1. Commit to GCS with a dedicated bucket `xperiq-report-artifacts-{env}`. Document the decision in `ARCHITECTURE.md`.
2. Set hard limits enforced in `report_generation.py`: `MAX_HTML_SIZE_BYTES = 5_000_000` (5MB); `MAX_PDF_SIZE_BYTES = 100_000_000` (100MB). Fail the run with `error_message = 'artifact_too_large'` if exceeded.
3. Set a GCS bucket lifecycle policy to delete objects with `expires_at` metadata older than 91 days as a defense-in-depth layer behind the pruning job.
4. Serve artifact downloads through signed URLs with a 15-minute expiry — do not expose the bucket publicly.

**Files Affected**:
- `crystalos/graphs/report_generation.py` — add size checks before storage write
- `docs/scheduled-reports/ARCHITECTURE.md` — storage backend decision
- `backend/src/config/storage.ts` — storage client configuration

---

## 3. Runbooks

### Runbook 1: Scheduled Reports Not Delivering (OPS-001 / OPS-003)

**Trigger**: On-call alert fires — `report_runs WHERE status='running' AND started_at < now() - 25 minutes COUNT > 0`.

**Detection**:
```sql
-- How many runs are stuck?
SELECT count(*), min(started_at), max(started_at)
FROM report_runs
WHERE status = 'running' AND started_at < now() - interval '25 minutes';

-- Which orgs are affected?
SELECT sr.org_id, count(*) AS stuck_runs
FROM report_runs rr
JOIN scheduled_reports sr ON sr.id = rr.scheduled_report_id
WHERE rr.status = 'running' AND rr.started_at < now() - interval '25 minutes'
GROUP BY sr.org_id
ORDER BY stuck_runs DESC;
```

**Immediate Mitigation**:
1. Check CrystalOS health: `GET https://crystalos.fly.dev/health`. If 503, scale up: `fly scale count 2 --app crystalos`.
2. Check Redis connectivity from CrystalOS logs: `fly logs --app crystalos | grep -i redis`.
3. If CrystalOS is healthy but runs are stuck, check whether the BullMQ queue is stalled: `fly ssh console --app crystalos -C "python -c 'from workers.queue import q; print(q.get_job_counts())'"`
4. Manually transition stuck runs to `failed` to unblock the scheduler:
```sql
UPDATE report_runs
SET status = 'failed',
    error_message = 'manual_timeout_on_call',
    completed_at = now()
WHERE status = 'running' AND started_at < now() - interval '25 minutes';
```
5. Once CrystalOS is healthy, use the manual retry endpoint for high-priority orgs: `POST /api/reports/runs/:id/retry`.

**Root Cause Investigation**:
- Check CrystalOS error logs for OOM signals, unhandled exceptions, or LLM 429 errors.
- Check whether a PDF render caused an OOM: `fly logs --app crystalos | grep -i playwright`.
- Check LLM provider status page for ongoing incidents.
- Check Redis memory usage: `redis-cli INFO memory | grep used_memory_human`.

**Resolution**:
- If OOM from PDF renders: scale CrystalOS memory up (`fly scale memory 4096 --app crystalos`), or fast-track OPS-002 (extract PDF worker).
- If LLM 429 errors are systemic: reduce BullMQ concurrency temporarily to 5 via the config table, then restore once provider rate limits reset.
- Document the incident, affected orgs, and timeline in `docs/scheduled-reports/INCIDENTS.md`.

---

### Runbook 2: Duplicate Reports Delivered (OPS-004)

**Trigger**: Recipient complaint or proactive monitoring detects duplicate completed runs for the same `(scheduled_report_id, scheduled_for_time)`.

**Detection**:
```sql
SELECT scheduled_report_id, scheduled_for_time, count(*) AS run_count
FROM report_runs
WHERE status = 'completed' AND completed_at > now() - interval '24 hours'
GROUP BY scheduled_report_id, scheduled_for_time
HAVING count(*) > 1;
```

**Immediate Mitigation**:
1. Identify the affected runs and their delivery logs.
2. If the duplicate emails have not yet been delivered (check SendGrid activity feed), cancel the duplicate send by marking the second run `status = 'duplicate'` before the delivery step processes it.
3. If the emails have already been delivered, prepare a correction notice to affected recipients using the report's `from_name` and `reply_to` settings.
4. Mark duplicate runs: `UPDATE report_runs SET status = 'duplicate' WHERE id = '<second_run_id>';`

**Root Cause Investigation**:
- Check whether Redis was restarted during the affected period: look at Redis restart timestamps in the monitoring dashboard and compare against the duplicate run `started_at` times.
- Check whether the run duration exceeded the 15-minute lock TTL: if `completed_at - started_at > 15 minutes`, the lock expired mid-run and a second dispatch occurred.
- Check whether the `UNIQUE (scheduled_report_id, scheduled_for_time)` constraint exists. If not, OPS-004 has not been applied.

**Resolution**:
- Apply the `UNIQUE (scheduled_report_id, scheduled_for_time)` migration immediately (OPS-004).
- Extend the Redis lock TTL from 15 minutes to 30 minutes as an interim measure for long-running reports.
- If Redis instability is ongoing, prioritize Redis HA (Fly.io Redis replica or Upstash).

---

### Runbook 3: LLM Cost Spike (OPS-007)

**Trigger**: Cost alert fires — `sum(llm_cost_usd) in last 1 hour > $100`.

**Detection**:
```sql
-- Top orgs by LLM cost in the last 24 hours
SELECT sr.org_id, sum(rr.llm_cost_usd) AS total_cost_usd, count(*) AS runs
FROM report_runs rr
JOIN scheduled_reports sr ON sr.id = rr.scheduled_report_id
WHERE rr.completed_at > now() - interval '24 hours'
GROUP BY sr.org_id
ORDER BY total_cost_usd DESC
LIMIT 20;

-- Highest cost individual runs
SELECT id, scheduled_report_id, llm_input_tokens, llm_output_tokens, llm_cost_usd
FROM report_runs
WHERE completed_at > now() - interval '24 hours'
ORDER BY llm_cost_usd DESC
LIMIT 10;
```

**Immediate Mitigation**:
1. Determine whether cost is concentrated in one org (runaway report) or distributed across many orgs (peak schedule overlap).
2. If one org: disable their scheduled reports: `UPDATE scheduled_reports SET is_active = false WHERE org_id = 'xxx';`. Notify the org admin via email. Investigate the report scope.
3. If systemic: reduce BullMQ concurrency to 5 to throttle overall generation rate. This reduces peak LLM concurrency from 20 to 5 immediately.
4. Check whether input token counts are anomalously high (> 20,000 input tokens per run). This indicates a report scoped to a large survey with full response data being passed to the LLM without summarization.

**Root Cause Investigation**:
- Pull the `llm_input_tokens` for the high-cost runs and compare against the survey response count.
- Review the prompt template being used — check whether the data context is being truncated or passed in full.
- Check whether a new report template was added that includes raw response verbatims (high token cost).

**Resolution**:
- Apply per-org budget caps from OPS-007.
- Add an input token limit in `report_generation.py`: truncate the data context to 50,000 tokens before passing to `generate_narrative`.
- Review and optimize the prompt template for token efficiency.
- Re-enable the affected org's reports after confirming the runaway scope has been corrected.

---

## 4. Cost Model at Scale

### Assumptions

| Parameter | Value |
|---|---|
| Model | GPT-4o-equivalent via OpenRouter |
| Input token price | $0.005 / 1K tokens |
| Output token price | $0.015 / 1K tokens |
| Tokens per `generate_narrative` call | 4,000 input, 800 output |
| Tokens per `generate_highlights` call | 2,000 input, 400 output |
| Total input tokens per run | 6,000 |
| Total output tokens per run | 1,200 |
| LLM cost per run | (6,000 × $0.005 / 1K) + (1,200 × $0.015 / 1K) = $0.030 + $0.018 = **$0.048** |
| PDF generation (Chromium, Fly.io) | ~$0.002 per render (CPU time) |
| HTML storage (GCS, 256KB avg, 90d) | ~$0.0002 per artifact/month |
| PDF storage (GCS, 5MB avg, 90d) | ~$0.003 per artifact/month |
| SendGrid email delivery | $0.0008 per recipient; avg 5 recipients/report |

### Per-Report Cost Budget

| Cost Component | Unit Cost |
|---|---|
| LLM (narrative + highlights) | $0.048 |
| PDF render (60% of reports) | $0.001 |
| HTML storage (90-day retention) | $0.0002 |
| PDF storage (90-day retention) | $0.003 |
| Email delivery (5 recipients) | $0.004 |
| **Total per report** | **~$0.056** |

The per-report budget of $0.056 is the baseline for a standard survey report with moderate response count. Large-survey reports (50,000+ responses) will have higher LLM input costs if raw data is passed to the context; token budgeting (OPS-007) must enforce the ceiling.

### Scale Analysis

Assumptions: 10 reports per org per week on average, 60% PDF-enabled, 5 recipients per report, 4.3 weeks per month.

| Scale | Orgs | Reports/Week | Reports/Month | LLM Cost/Month | PDF Cost/Month | Email Cost/Month | Storage Cost/Month | **Total/Month** |
|---|---|---|---|---|---|---|---|---|
| 50 orgs | 50 | 500 | 2,150 | $103 | $2.15 | $8.60 | $7 | **~$121** |
| 500 orgs | 500 | 5,000 | 21,500 | $1,032 | $21.50 | $86 | $70 | **~$1,210** |
| 5,000 orgs | 5,000 | 50,000 | 215,000 | $10,320 | $215 | $860 | $700 | **~$12,095** |

### Key Cost Observations

1. At 5,000 orgs, LLM costs alone are $10,320/month. This is the dominant cost component (85% of total) and must be tracked per-org from day one to support cost-recovery pricing.
2. The per-org monthly LLM cost at average usage is approximately $2.06/month — within range for cost recovery at typical per-seat SaaS pricing. The recommended initial per-org monthly budget cap of $50.00 (OPS-007) provides approximately 24x headroom at average usage, sufficient to absorb large-survey reports without false-positive throttling.
3. Storage costs are low at current projections, but a single org running weekly QBR Packs with 50MB PDFs accumulates 2.6GB/org after 90 days of retention. At 5,000 orgs with 20% running large PDF reports, this is 2.6TB in storage — a $52/month line item that grows linearly and requires the size caps specified in OPS-011.
4. Email delivery costs are negligible at all three scale points. SendGrid sender reputation is the more important constraint; the bounce feedback loop (OPS-005) is a reputation risk, not a cost risk.

---

## 5. Infrastructure Requirements

The following infrastructure components are required but absent from the current architecture documents.

### 5.1 Generation Queue (BullMQ)

Redis is already in the stack. A BullMQ queue named `report-generation` with the following configuration is required:

- **Workers**: 20 concurrent workers, configurable via `REPORT_GENERATION_CONCURRENCY` env var
- **Per-org concurrency**: Max 3 simultaneous runs per org, enforced at enqueue time via BullMQ `limiter`
- **Job types**: `scheduled_run`, `manual_run`, `preview` — each with separate priority levels
- **Retry policy**: 3 retries on LLM `429` with exponential backoff (base 2s, max 60s); no automatic retry on artifact storage errors (not idempotent until OPS-004 constraint is in place)
- **Dead letter queue**: Failed jobs after 3 retries enqueue to `report-generation-dlq` for manual inspection
- **Monitoring**: Expose `queue_depth`, `active_jobs`, `failed_jobs`, `waiting_jobs` as Prometheus gauges

### 5.2 PDF Worker Pool

A separate `pdf-worker` process group on Fly.io:

- **Machine type**: `performance-1x` (2 vCPU, 4GB RAM) — headless Chromium requires dedicated memory that cannot be shared with LLM inference overhead
- **Scale**: Minimum 2 instances; autoscale to 6 instances when queue depth > 50
- **Concurrency**: 3 Chromium instances per machine (3 × 500MB = 1.5GB RAM, leaving 2.5GB headroom)
- **Interface**: `POST /internal/pdf/render` — accepts `{html_content: string, report_run_id: uuid}`, returns `{gcs_key: string}` or error
- **Timeout**: 60-second hard limit per render; on timeout, the node returns `{pdf_status: 'failed', reason: 'render_timeout'}` and the run proceeds with HTML-only delivery
- **Chromium flags**: `--disable-dev-shm-usage`, `--no-sandbox`, `--single-process=false`

### 5.3 CrystalOS Fallback Mode

When CrystalOS is unhealthy or the generation graph fails after retries:

- **Degraded mode**: Generate a minimal report directly from `metric_snapshots` data without LLM narrative. Include raw metric values, response counts, and a "AI narrative temporarily unavailable" notice in the delivered report.
- **Activation detection**: Health check endpoint `GET /health` returns `{"status": "degraded", "llm": false}` when the LLM provider is unreachable for > 5 consecutive minutes.
- **Scheduler behavior**: When `llm_healthy = false`, the scheduler switches new runs to `generation_mode = 'degraded'` and dispatches them to the fallback path.
- **User communication**: Delivered reports in degraded mode include a banner noting that AI-generated narrative is unavailable for this run. The report creator receives an email notification.

### 5.4 Artifact Storage Backend

Recommended decision: GCS with a dedicated bucket `xperiq-report-artifacts-{env}`.

- **IAM**: CrystalOS service account needs `roles/storage.objectCreator` and `roles/storage.objectViewer` on the artifact bucket specifically — do not grant broader storage permissions
- **Lifecycle policy**: Delete objects with custom metadata `expires_at` older than 91 days, as a defense-in-depth layer alongside the DB pruning job (OPS-010)
- **Access pattern**: Serve downloads through signed URLs with 15-minute expiry generated by the backend. The bucket must not be publicly accessible.
- **Size limits**: `MAX_HTML_SIZE_BYTES = 5_000_000` (5MB); `MAX_PDF_SIZE_BYTES = 100_000_000` (100MB), enforced in `report_generation.py` before any write

### 5.5 `metric_snapshots` Table (Prerequisite)

The `metric_snapshot_id UUID` field on `report_runs` is described as a reference to "a future metric_snapshots table — not designed yet." This table is a prerequisite for three of the above fixes (CrystalOS fallback mode, retry idempotency, historical trend data for `generate_highlights`) and must be designed before the CrystalOS fallback mode can be implemented.

Minimum schema:
```sql
CREATE TABLE metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id),
  org_id UUID NOT NULL REFERENCES orgs(id),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_count INT NOT NULL,
  metric_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_metric_snapshots_survey_computed ON metric_snapshots(survey_id, computed_at DESC);
```

---

## 6. Performance Targets and SLOs

### Recommended SLOs

| Metric | Target | Alert Threshold | Severity |
|---|---|---|---|
| Report generation P50 | < 4s | — | — |
| Report generation P95 | < 8s | P95 > 12s | Page |
| Report generation P99 | < 15s | P99 > 20s | Page |
| Scheduler dispatch lag (time from `next_run_at` to job enqueue) | < 30s | > 120s | Page |
| End-to-end delivery latency (scheduled wall-clock to recipient inbox) | < 5 minutes | > 15 minutes | Page |
| PDF render P95 | < 30s | P95 > 45s | Ticket |
| Generation success rate (1-hour window) | > 99% | < 97% | Page |
| Duplicate delivery rate | 0% | Any duplicate detected | Page |
| LLM cost rate (1-hour window) | — | > $100/hour | Page |
| Stuck runs (running > 25 minutes) | 0 | Any detected | Page |

### Monitoring Queries

```sql
-- P95 generation time, last 24 hours
SELECT percentile_cont(0.95) WITHIN GROUP (
  ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))
) AS p95_seconds
FROM report_runs
WHERE status = 'completed' AND started_at > now() - interval '24 hours';

-- Scheduler dispatch lag (time pending due reports have been waiting)
SELECT max(EXTRACT(EPOCH FROM (now() - next_run_at))) AS max_lag_seconds
FROM scheduled_reports
WHERE is_active = true
  AND next_run_at < now()
  AND id NOT IN (
    SELECT scheduled_report_id FROM report_runs
    WHERE status IN ('pending', 'running', 'completed')
      AND created_at > now() - interval '1 hour'
  );

-- Generation success rate, last 1 hour
SELECT
  count(*) FILTER (WHERE status = 'completed') AS completed,
  count(*) FILTER (WHERE status = 'failed')    AS failed,
  round(
    100.0 * count(*) FILTER (WHERE status = 'completed')
    / nullif(count(*), 0), 2
  ) AS success_rate_pct
FROM report_runs
WHERE started_at > now() - interval '1 hour';

-- LLM cost rate, by hour
SELECT
  date_trunc('hour', completed_at) AS hour,
  sum(llm_cost_usd)                AS hourly_cost_usd,
  count(*)                         AS runs
FROM report_runs
WHERE completed_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY 1 DESC;

-- Stuck runs
SELECT id, scheduled_report_id, started_at,
       EXTRACT(EPOCH FROM (now() - started_at)) / 60 AS minutes_running
FROM report_runs
WHERE status = 'running' AND started_at < now() - interval '25 minutes'
ORDER BY started_at ASC;
```

### Required Alerts (Prometheus / Fly.io Metrics)

These alerts must be wired before launch. The first four are page-level; the last two are ticket-level.

| Alert | Condition | Severity |
|---|---|---|
| `report_generation_p95_high` | P95 generation time > 12s over last 30 minutes | Page |
| `report_scheduler_dispatch_lag_high` | Max dispatch lag > 120s | Page |
| `report_success_rate_low` | Success rate < 97% in any 1-hour window | Page |
| `report_stuck_runs` | Any run stuck in `running` for > 25 minutes | Page |
| `report_llm_cost_spike` | `sum(llm_cost_usd)` in last 1 hour > $100 | Page |
| `report_duplicate_delivery` | Any `(scheduled_report_id, scheduled_for_time)` with count > 1 and status = `completed` | Page |
| `report_pdf_render_p95_high` | PDF render P95 > 45s over last 30 minutes | Ticket |
| `report_artifacts_expired_undeleted` | Count of artifacts where `expires_at < now()` > 1,000 | Ticket |

---

*This document covers the Intelligence Briefings feature as designed in the five pre-launch architecture documents. All findings should be tracked in `docs/TRACKER.md` with owner assignments before the next sprint planning session. OPS-001 and OPS-002 are launch blockers; no GA date should be set until both are resolved and load-tested.*
