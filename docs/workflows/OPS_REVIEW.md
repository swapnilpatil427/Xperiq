# Xperiq Actions — Operational Risk Review

**Author:** Priya Sundaram, Platform Engineering Lead  
**Date:** 2026-06-29  
**Version:** 1.0  
**Scope:** Xperiq Actions (Workflow Automation Engine) — end-to-end operational assessment  
**Classification:** Internal Engineering

---

## Executive Summary

Xperiq Actions is a workflow automation engine handling trigger evaluation, conditional logic, and multi-step action execution across Slack, Jira, Zendesk, email, and custom webhooks. The engine is built on BullMQ (Redis), PostgreSQL, Node.js/Express, and CrystalOS (Python FastAPI + LangGraph).

This review identifies **12 material risks** across infrastructure resilience, queue health, SLO correctness, data model stability, and cost governance. Three risks are classified P0 — they have the potential to completely halt workflow execution or produce data corruption in production. Four are P1, meaning they will cause measurable degradation under realistic load. The remaining five are P2/P3, covering correctness, cost, and observability gaps.

The most critical finding is that the entire workflow execution stack has a single hard dependency on one Redis instance with no documented persistence, HA, or failover behavior. A 2-minute Redis restart results in zero workflow executions and zero alerting for the duration. This must be addressed before any production traffic scales.

The second critical finding is an architectural contract violation: the documented SLO of "99.5% of workflow runs complete within 30 seconds of trigger event" is physically impossible for AI-triggered workflows, which depend on CrystalOS insight pipelines that take up to 10 minutes. The SLO is wrong, not the pipeline. The SLO must be tiered.

The third P0 risk is horizontal scaling of the backend: the WorkflowScheduler runs as a bare `setInterval` in the Node.js process. If two backend instances run simultaneously (any blue-green deploy, any horizontal scale-out), both scheduler instances will evaluate and enqueue the same workflows, producing duplicate runs. The idempotency key prevents duplicate DB rows but does not prevent duplicate external side effects (Slack messages, Jira tickets, emails sent twice).

Every risk in this document includes a unique ID, exact affected files, precise failure mode, and actionable fix. Runbooks follow the risk analysis. The document closes with a Prometheus metrics checklist and a chaos engineering test plan.

---

## Risk Summary Table

| ID    | Title                                        | Priority | Category             |
|-------|----------------------------------------------|----------|----------------------|
| R-001 | BullMQ single Redis SPOF                    | P0       | Infrastructure       |
| R-002 | Dual scheduler instances (horizontal scale)  | P0       | Concurrency          |
| R-003 | AI trigger SLO violation                    | P0       | SLO / Contract       |
| R-004 | DLQ flood / queue poisoning                 | P1       | Queue health         |
| R-005 | Scheduler tick drift and silent failure     | P1       | Scheduler            |
| R-006 | High-volume response_submitted burst        | P1       | Throughput           |
| R-007 | crystal_analysis blocking worker threads    | P1       | Worker pool          |
| R-008 | Action idempotency at transport level       | P2       | Correctness          |
| R-009 | Workflow version history JSONB bloat        | P2       | Data model           |
| R-010 | Test mode production resource contention    | P2       | Performance          |
| R-011 | Crystal Builder LLM cost and no rate limit  | P2       | Cost governance      |
| R-012 | Missing scheduler heartbeat alert           | P3       | Observability        |

---

## P0 Risks — Production-Stopping

### R-001: BullMQ Single Redis SPOF

**Priority:** P0  
**Affected components:** Backend BullMQ queue configuration, WorkflowScheduler, all action executors  
**Affected files:** `backend/src/workflows/WorkflowScheduler.ts`, `backend/src/workers/workflowTriggerWorker.ts`, `backend/src/workers/workflowActionWorker.ts`, `backend/src/lib/redis.ts`

**Description.**  
All workflow execution — trigger evaluation, action dispatch, DLQ monitoring — runs through a single Redis instance. Redis persistence mode (AOF vs. RDB vs. none) is not specified in any infrastructure document. Redis high availability (Sentinel, Cluster) is not configured or documented.

**Failure mode (step by step).**  
1. Redis instance becomes unavailable (OOM kill, disk full, host reboot, network partition).  
2. BullMQ cannot enqueue or dequeue jobs. All active workers enter a retry/backoff loop against an unreachable connection.  
3. WorkflowScheduler continues its 30-second setInterval ticks. Each tick calls BullMQ `queue.add()`, which throws `ECONNREFUSED` or times out. The exception is caught at the worker level but there is no circuit breaker — the scheduler keeps attempting and logging errors.  
4. All in-flight jobs that had not been ACKed are lost if Redis was running without AOF persistence. Default RDB snapshots every 15 minutes mean up to 15 minutes of enqueued jobs are gone on an unclean crash.  
5. No alert fires for "zero jobs processed" unless the Grafana queue depth panel has a floor alert. That alert is not documented.  
6. Customer workflows stop silently. Survey responses arrive, no actions execute. Notifications, ticket creation, and escalations fail with no user-visible error.  
7. On Redis recovery, the queue is empty. There is no replay mechanism to recover lost trigger events from the response_submitted trigger type.

**Impact.**  
Complete halt of all workflow execution for the duration of the outage. Mean time to detection could be hours if no floor alert is configured on execution rate.

**Fix.**

Infrastructure level:
- Enable Redis AOF persistence with `appendfsync everysec`. This limits data loss to at most 1 second of enqueued jobs.
- Deploy Redis with Sentinel (minimum 3 nodes: 1 primary, 1 replica, 1 sentinel) or Redis Cluster for automatic failover. Failover time with Sentinel is typically 10-30 seconds, during which BullMQ workers retry and recover automatically via `ioredis` reconnection.
- Document Redis topology in `backend/README.md` and `docker/docker-compose.yml`. Add Sentinel configuration variables to `backend/.env.example` and `docs/ENV_VARS.md`.

Application level:
- Add a BullMQ circuit breaker: if the Redis client emits `error` events for more than 30 consecutive seconds, the WorkflowScheduler should pause its tick and emit a `workflow_scheduler_redis_down` metric increment.
- Add a "zero executions in 5 minutes" Prometheus alert: `workflow_runs_total` rate = 0 for orgs with active enabled workflows.

**Metrics to add.**  
- `workflow_redis_connection_errors_total` — counter, label: `instance`  
- `workflow_scheduler_tick_failures_total` — counter  
- Alert: `workflow_runs_total` rate = 0 sustained for 5 minutes while enabled workflows > 0

---

### R-002: Dual Scheduler Instances — Distributed Locking Gap

**Priority:** P0  
**Affected components:** WorkflowScheduler  
**Affected files:** `backend/src/workflows/WorkflowScheduler.ts`

**Description.**  
The WorkflowScheduler is a bare `setInterval` loop inside the Node.js process. There is no distributed lock preventing multiple instances from running simultaneously. Any deployment event that runs two backend processes in parallel — blue-green deploy, horizontal scale to 2+ replicas, pod restart overlap in Kubernetes or Fly.io — will cause both instances to evaluate all enabled scheduler-type workflows and enqueue duplicate jobs.

**Failure mode (step by step).**  
1. A rolling deploy starts a new backend instance (instance B) before the old instance (instance A) is terminated.  
2. Both instances run simultaneously for 10-30 seconds during the overlap window.  
3. Both instances' `setInterval` ticks fire within the same window. Both query `SELECT * FROM workflows WHERE enabled = true AND trigger_type = 'schedule'`.  
4. Both instances call `queue.add()` for the same workflow with the same trigger payload.  
5. Two workers process the two jobs. Each evaluates conditions independently.  
6. Each worker executes all action steps: sends the Slack message, creates the Jira ticket, fires the webhook.  
7. The second worker then attempts the DB write to `workflow_runs`. The `idempotency_key` UNIQUE constraint fires and rejects the insert. The job is marked failed and enters the retry queue.  
8. Result: two Slack messages sent, two Jira tickets created, webhook fired twice. The idempotency constraint prevents a duplicate DB row but does not undo already-executed external side effects.

**Impact.**  
Duplicate external side effects on every deploy event. For customers with high-value automated workflows (escalation, ticket creation, notification), this is a trust-breaking bug that will surface on every production deployment.

**Fix.**  
Implement a distributed lock using `redlock` (Redis-based distributed mutual exclusion). Before each scheduler tick evaluates workflows, acquire a lock with a TTL of 25 seconds (slightly less than the 30-second tick interval). Only the instance holding the lock proceeds.

Relevant pattern for `backend/src/workflows/WorkflowScheduler.ts`:
```typescript
// Acquire distributed lock before each scheduler tick
const lock = await redlock.acquire(['workflow-scheduler-lock'], 25000);
try {
  await this.evaluateAllScheduledWorkflows();
} finally {
  await lock.release();
}
```

If the lock cannot be acquired (another instance holds it), skip this tick and increment `workflow_scheduler_lock_skipped_total`. This is expected behavior during deploys and should not alert unless sustained beyond the deploy window.

Additionally, the idempotency key generation logic must be audited to ensure it is deterministic and consistent between instances, so the DB-level UNIQUE constraint serves as a last-resort guard even if the distributed lock fails.

**Metrics to add.**  
- `workflow_scheduler_lock_acquired_total` — counter  
- `workflow_scheduler_lock_skipped_total` — counter (alert if consistently > 0 outside deploy windows)  
- `workflow_duplicate_run_prevented_total` — counter (incremented when idempotency key constraint fires)

---

### R-003: AI Trigger SLO Violation — Incompatible Contract

**Priority:** P0  
**Affected components:** SLO definition, CrystalOS insight pipeline, AI trigger handler  
**Affected files:** `docs/workflows/` (SLO documentation), `crystalos/` (insight pipeline), `backend/src/routes/internal/workflow-signals.ts`

**Description.**  
The documented SLO states "99.5% of workflow runs complete within 30 seconds of trigger event." The AI trigger type depends on CrystalOS completing the insight pipeline, which is documented to take up to 10 minutes. These two constraints are mutually exclusive for AI-triggered workflows. The SLO is not tiered by trigger type, meaning a single AI-triggered workflow permanently degrades the SLO metric.

**Failure mode (step by step).**  
1. An AI-triggered workflow is defined. The trigger condition is "when Crystal detects a significant negative sentiment shift."  
2. A survey response is submitted at T+0.  
3. CrystalOS starts the insight pipeline at T+0. Due to LLM chain complexity and CrystalOS queue depth, the pipeline completes at T+8 minutes.  
4. CrystalOS POSTs to `/api/internal/workflow-signals` at T+8 minutes.  
5. The workflow run completes at T+8:05.  
6. The SLO measurement records this run as a violation. If 0.6% of all workflow runs are AI-triggered, the 30-second SLO is in permanent breach regardless of infrastructure health.  
7. Engineering is paged for SLO breach. Investigation finds no infrastructure problem. The root cause is a miscategorized SLO.

**Impact.**  
Permanently broken SLO metric regardless of system health. Alert fatigue. Incorrect engineering prioritization driven by false breach signals. If this SLO is referenced in customer contracts or sales materials, the company is technically in breach on day one of any AI trigger usage.

**Fix.**  
Define a tiered SLO framework:

| Trigger type | SLO target |
|---|---|
| response_submitted, condition_met, schedule, webhook | 99.5% complete within 30 seconds |
| manual_trigger | 99.5% complete within 60 seconds |
| ai_insight_trigger | 99.0% complete within 15 minutes |

Update all SLO tracking in Prometheus to record `trigger_type` as a label on `workflow_run_latency_seconds`. Create separate Prometheus recording rules and alert rules per tier. Remove AI trigger runs from the 30-second SLO calculation entirely. Update `docs/workflows/` SLO documentation to reflect the tiered model.

**Metrics to add.**  
- `workflow_run_latency_seconds` histogram — add label `trigger_type`  
- Per-tier SLO burn rate alert rules in the Prometheus alerting configuration

---

## P1 Risks — Significant Degradation

### R-004: DLQ Flood / Queue Poisoning

**Priority:** P1  
**Affected components:** DlqMonitor, BullMQ failed set, `dead_letter_items` table  
**Affected files:** `backend/src/workers/DlqMonitor.ts`, database migrations for `dead_letter_items`

**Description.**  
If a misconfiguration or a bad code deploy causes a large cohort of workflows to fail systematically, all failing jobs retry 3 times each with exponential backoff and then land in the BullMQ failed set. The DlqMonitor polls every 5 minutes and writes to `dead_letter_items`. No capacity limit is defined for the failed set. The alert threshold of DLQ depth > 10 does not scale with queue volume and provides 5 minutes of blindness before detection.

**Failure mode (step by step).**  
1. A deploy introduces a bug in the Slack action executor — all Slack actions throw an unhandled exception.  
2. At 100 workflow fires/minute with 2 Slack actions each, 200 action jobs fail per minute.  
3. Each job retries 3 times (at 5s, 15s, 45s). Within 3 minutes, 600 retry attempts flood the "workflow-actions" queue.  
4. Redis memory grows as the failed set accumulates. At 100KB per job payload, 10,000 failed jobs consume 1GB of Redis memory.  
5. DlqMonitor fires at T+5 minutes and writes to `dead_letter_items`. The table has no retention policy or partition strategy.  
6. The DLQ depth > 10 alert fires. The on-call engineer investigates but there is no documented drain procedure.  
7. If Redis is configured with `maxmemory-policy allkeys-lru` (a common default), BullMQ job data is silently evicted, making DLQ drain and post-incident analysis impossible.

**Fix.**  
- Set `maxFailedJobs` limit per queue in BullMQ configuration (e.g., `maxFailedJobs: 5000`). BullMQ trims the oldest failed jobs when this limit is exceeded, preventing unbounded Redis memory growth.  
- Implement per-org DLQ rate limiting: if a single org accounts for more than 20% of DLQ entries in a 5-minute window, pause that org's workflow execution and notify the org admin.  
- Add a BullMQ rate limit on the action queue: max 500 jobs/second globally, max 50 jobs/second per org. Use BullMQ's `rateLimit` option.  
- Reduce DlqMonitor poll interval from 5 minutes to 30 seconds, or switch to BullMQ's `failed` event listener for real-time detection.  
- Add a `dead_letter_items` retention job: archive rows older than 30 days to cold storage, delete rows older than 90 days.  
- Set Redis `maxmemory-policy noeviction` for all BullMQ Redis instances.

---

### R-005: Scheduler Tick Drift and Silent Failure

**Priority:** P1  
**Affected components:** WorkflowScheduler  
**Affected files:** `backend/src/workflows/WorkflowScheduler.ts`

**Description.**  
The WorkflowScheduler uses `setInterval(tick, 30000)`. JavaScript `setInterval` fires after the interval regardless of whether the previous tick has completed. If evaluation takes 25 seconds (DB query under load with many enabled workflows), the next tick fires 5 seconds after the current tick started — not 30 seconds after it finished. At higher loads, two ticks can be executing concurrently. Additionally, if the tick callback throws an uncaught exception, `setInterval` silently stops firing with no error logged at the process level.

**Failure mode (step by step).**  
1. The system has 2,000 enabled schedule-type workflows. The DB query to fetch them takes 8 seconds at normal load.  
2. A spike brings it to 35 seconds. The tick at T=0 completes at T=35s. The next `setInterval` fire was already scheduled at T=30s — two ticks are now executing concurrently.  
3. Concurrent ticks query the same rows and enqueue duplicate jobs, re-creating the R-002 problem even on a single-instance deployment.  
4. Alternatively: the tick at T=0 throws a DB connection timeout. The setInterval callback does not propagate the error. No further ticks fire. All scheduled workflows stop executing with no process-level error or alert.

**Fix.**  
Replace `setInterval` with a self-scheduling pattern that prevents concurrent tick execution:

```typescript
private async tick(): Promise<void> {
  const start = Date.now();
  metrics.gauge('workflow_scheduler_heartbeat_timestamp_seconds', start / 1000);
  try {
    await this.evaluateAllScheduledWorkflows();
    metrics.increment('workflow_scheduler_tick_success_total');
  } catch (err) {
    logger.error('WorkflowScheduler tick failed', err);
    metrics.increment('workflow_scheduler_tick_failures_total');
  } finally {
    setTimeout(() => this.tick(), this.tickIntervalMs);
  }
}
```

For `schedule` trigger types requiring minute-level or sub-minute precision, delegate to BullMQ's native cron scheduler (`queue.add('job', data, { repeat: { cron: '*/30 * * * * *' } })`). BullMQ's cron is backed by a Redis sorted set and is immune to tick drift.

**Metrics to add.**  
- `workflow_scheduler_heartbeat_timestamp_seconds` — gauge (alert if age > 90s)  
- `workflow_scheduler_tick_success_total` — counter  
- `workflow_scheduler_tick_failures_total` — counter  
- `workflow_scheduler_tick_duration_seconds` — histogram (alert if p99 > 20s)

---

### R-006: High-Volume response_submitted Burst

**Priority:** P1  
**Affected components:** response_submitted trigger handler, workflow-actions BullMQ queue  
**Affected files:** `backend/src/workflows/triggers/responseSubmittedTrigger.ts`, `backend/src/workers/workflowActionWorker.ts`

**Description.**  
A single workflow can be attached to a survey. If that survey receives a burst of responses — flash sale, viral social post, conference registration opening — every response enqueues one job per workflow action. A workflow with 5 actions receiving 1,000 responses/second produces 5,000 action jobs per second on the shared "workflow-actions" queue.

**Failure mode (step by step).**  
1. A customer launches a campaign. The attached survey receives 1,000 responses in the first second.  
2. The response_submitted trigger fires 1,000 times. Each enqueues a "workflow-actions" job chain with 5 actions.  
3. 5,000 jobs land in "workflow-actions" in 1 second.  
4. With undocumented worker concurrency (assume N=10), the queue backlog is 4,990 after 1 second. At 10 jobs/second, it takes ~500 seconds (8+ minutes) to drain.  
5. During drain, all other orgs' workflows are delayed because the queue is not partitioned by org.  
6. Orgs with time-sensitive escalation workflows (response_submitted → page on-call) miss their latency target by minutes.

**Fix.**  
- Implement per-org BullMQ queue priority. High-burst orgs get lower priority, ensuring fairness across the queue.  
- Add a per-survey, per-workflow concurrency cap: maximum 100 concurrent action jobs per (survey_id, workflow_id) pair at any time. Excess triggers are coalesced or dropped with a `workflow_trigger_throttled_total` counter increment.  
- Consider partitioning "workflow-actions" into per-org-tier queues (enterprise, standard, trial) so a burst from one org cannot starve another tier.  
- Document worker concurrency settings and expose them as environment variables in `backend/.env.example`.

---

### R-007: crystal_analysis Blocking Worker Threads

**Priority:** P1  
**Affected components:** crystal_analysis action executor, workflowActionWorker  
**Affected files:** `backend/src/workflows/actions/crystalAnalysisAction.ts`, `backend/src/workers/workflowActionWorker.ts`

**Description.**  
The `crystal_analysis` action makes a synchronous HTTP call to CrystalOS and awaits the response for up to 90 seconds. BullMQ workers are async but each worker concurrency slot is held for the full duration of the awaited promise. If the worker pool size is 10 and 10 concurrent `crystal_analysis` actions are in-flight, all 10 slots are occupied. No other action types — Slack notifications, Jira tickets, emails — execute until CrystalOS responds.

**Failure mode (step by step).**  
1. 10 workflows trigger simultaneously, each with a `crystal_analysis` action as step 1.  
2. All 10 worker slots are consumed. Each slot awaits a CrystalOS HTTP call that takes 60-90 seconds under load.  
3. Slack notification jobs, Jira ticket jobs, and email jobs pile up in "workflow-actions". Their queue depth grows.  
4. For up to 90 seconds, no non-AI actions execute across all orgs.  
5. Grafana shows queue depth spike and latency increase but no breakdown by action_type identifies CrystalOS as the cause.  
6. After CrystalOS responds, workers free up. If another burst of `crystal_analysis` actions arrives immediately, starvation repeats cyclically.

**Fix.**  
- Run `crystal_analysis` actions in a dedicated BullMQ queue ("workflow-crystal-actions") with its own worker pool (concurrency 3). This pool cannot consume slots from the main action queue.  
- Add a per-action-type timeout in each action executor: `crystal_analysis` max 95 seconds; all other action types max 30 seconds. Jobs exceeding their timeout are moved to DLQ with `failure_reason: timeout`.  
- Add `workflow_action_duration_seconds` histogram with label `action_type` so CrystalOS-related latency is independently visible in Grafana.

---

## P2 Risks — Performance and Correctness Degradation

### R-008: Action Idempotency at Transport Level

**Priority:** P2  
**Affected components:** Slack, Jira, Zendesk, email action executors  
**Affected files:** `backend/src/workflows/actions/slackAction.ts`, `backend/src/workflows/actions/jiraAction.ts`, `backend/src/workflows/actions/emailAction.ts`, `backend/src/workflows/actions/zendesk Action.ts`

**Description.**  
When an action executor succeeds at the transport level (Slack message sent, Jira ticket created) but the subsequent DB write to `workflow_run_steps` fails (transient network timeout, DB connection drop), BullMQ marks the job as failed and retries it. The retry re-executes the entire action including the external API call, producing a duplicate Slack message, Jira ticket, or email. The idempotency key on `workflow_runs` prevents duplicate run records but does not protect external side effects.

**Fix.**  
- For email (SendGrid/Resend): both providers support idempotency keys in the HTTP request header. Pass the `workflow_run_step_id` as the idempotency key on every send request. Duplicate calls with the same key are rejected by the provider.  
- For Slack: store a `(idempotency_key → slack_message_ts)` mapping in Redis with a 24-hour TTL before sending. On retry, check the Redis key first; if present, skip the send and proceed directly to the DB write.  
- For Jira: pass the `workflow_run_step_id` in a Jira issue custom field or description text. Before creating a ticket, query Jira for existing issues in the same project with the matching ID. Create only if none found.  
- General pattern: all action executors must follow check-then-act with an external idempotency store (Redis TTL cache keyed by `workflow_run_step_id`) as the gate before any external API call.

---

### R-009: Workflow Version History JSONB Bloat

**Priority:** P2  
**Affected components:** Workflow version history storage  
**Affected files:** `backend/src/routes/workflows.ts` (PUT handler), `supabase/migrations/` (workflows table schema)

**Description.**  
Every PUT to `/api/workflows/:id` appends a new version entry to the `version_history` JSONB array on the `workflows` table row. A complex workflow definition can be 50-100KB. A frequently-edited workflow (automated updates, power user iteration) can accumulate thousands of versions. At 1,000 versions of a 50KB workflow, the JSONB field is 50MB on a single row. PostgreSQL TOAST handles oversized values but row bloat degrades query performance for all columns on the row and increases backup volume.

**Fix.**  
- Add a Postgres migration that creates a `workflow_versions` table: `(id UUID PK, workflow_id UUID FK, version_number INT, spec JSONB, created_at TIMESTAMPTZ, created_by TEXT)`. Index on `(workflow_id, version_number DESC)`.  
- In the PUT handler in `backend/src/routes/workflows.ts`, write new versions to `workflow_versions` instead of appending to the JSONB array on `workflows`.  
- Add a nightly background job that deletes versions older than the 50 most recent per workflow.  
- Expose `GET /api/workflows/:id/versions` (paginated list) and `GET /api/workflows/:id/versions/:versionNumber` (single version retrieval) endpoints.

---

### R-010: Test Mode Production Resource Contention

**Priority:** P2  
**Affected components:** Safe Run / test mode endpoint  
**Affected files:** `backend/src/routes/workflows.ts` (test-run handler), `backend/src/workflows/WorkflowEngine.ts`

**Description.**  
Test mode (Safe Run) evaluates conditions and renders action configurations using the same production PostgreSQL database and CrystalOS instance as live workflow executions. Under concurrent usage (1,000 users iterating on workflow designs simultaneously), test mode generates significant read traffic and CrystalOS capacity consumption that competes with production workflow runs.

**Fix.**  
- Rate limit the test-run endpoint: max 5 concurrent test runs per org, max 20 globally. Return HTTP 429 with `Retry-After: 5` for excess requests.  
- Route test-mode CrystalOS calls to a `priority: low` queue in CrystalOS so they do not preempt production insight pipeline capacity.  
- Add `workflow_test_run_total` counter and `workflow_test_run_duration_seconds` histogram to quantify the actual resource contribution of test mode in production.

---

### R-011: Crystal Builder LLM Cost and No Rate Limit

**Priority:** P2  
**Affected components:** Crystal Builder NL parsing endpoint  
**Affected files:** `backend/src/routes/workflows.ts` (POST /api/workflows/crystal-build), CrystalOS Crystal Builder LangGraph agent

**Description.**  
`POST /api/workflows/crystal-build` passes user natural language input to a LangGraph agent that calls an LLM. No per-user rate limiting, per-org cost cap, or frontend debouncing is documented. A user iterating on a workflow NL description makes one LLM call per submission. At 1,000 concurrent users each submitting 10 times in a session, this is 10,000 LLM calls in a short window with no cost control.

**Fix.**  
- Add per-user rate limiting on the Crystal Builder endpoint: max 10 calls/minute per user, max 60 calls/hour per user. Return HTTP 429 on excess.  
- Add per-org monthly LLM cost tracking in a `llm_usage` table `(org_id, month, model, input_tokens, output_tokens, estimated_cost_usd)`. Alert (Slack to platform team) when an org exceeds $50/month from Crystal Builder alone.  
- Implement frontend debouncing: the UI should not call the endpoint on every UI change event. A 500ms debounce after the user stops editing the NL description field is sufficient and reduces call volume by 80%+ in typical usage.  
- Add `crystalbuilder_llm_tokens_total` (counter, labels: `org_id, model`) and `crystalbuilder_llm_cost_usd_total` (counter, label: `org_id`) metrics.

---

## P3 Risks — Observability Gaps

### R-012: Missing Scheduler Heartbeat Alert

**Priority:** P3  
**Affected components:** WorkflowScheduler, Grafana/Prometheus dashboard  
**Affected files:** `backend/src/workflows/WorkflowScheduler.ts`, Grafana dashboard configuration

**Description.**  
The WorkflowScheduler can silently stop if its tick callback throws an uncaught exception (with `setInterval`) or if the Node.js process is OOM-killed and restarts slowly. The Grafana dashboard covers queue depth and execution latency but does not include a scheduler heartbeat panel. A silent scheduler failure is undetectable until customers report missed executions.

**Fix.**  
- Add a `workflow_scheduler_heartbeat_timestamp_seconds` gauge updated at the start of every tick.  
- Add a Prometheus alert rule: `time() - workflow_scheduler_heartbeat_timestamp_seconds > 90` triggers a P1 page.  
- Add a Grafana "Scheduler Health" stat panel showing heartbeat age with color thresholds: green < 45s, yellow 45-90s, red > 90s.

---

## Runbooks

### Runbook 1: Redis Outage

**Trigger:** PagerDuty alert — `workflow_redis_connection_errors_total` rate > 1/s for 60 seconds, OR `workflow_runs_total` rate = 0 for 5 minutes with enabled workflows present, OR on-call engineer observation of zero queue activity in Grafana.

**Detection.**  
- Grafana: queue depth panels show static non-zero values (jobs enqueued but not draining), or all panels flatline at zero.  
- Backend logs: repeated `ECONNREFUSED` or `Connection timeout` against the Redis host address.  
- Prometheus: `workflow_redis_connection_errors_total` counter rate is non-zero and sustained.

**Immediate mitigation (first 5 minutes).**  
1. Confirm Redis is unreachable: `redis-cli -h <REDIS_HOST> -p 6379 ping`. If no response within 2 seconds, Redis is down.  
2. Check Redis process status on the host: `systemctl status redis` or review cloud provider console.  
3. If Redis Sentinel is configured: `redis-cli -h <SENTINEL_HOST> -p 26379 SENTINEL masters` — confirm whether automatic failover has already promoted a replica. If failover occurred, BullMQ workers should reconnect automatically within 30 seconds via `ioredis` retry logic.  
4. If no HA: restart the Redis process. Do not attempt to recover in-memory state — Redis will reload from the last RDB/AOF snapshot.  
5. Monitor `workflow_runs_total` rate in Grafana. It should recover within 60 seconds of Redis becoming available.  
6. Communicate to stakeholders: "Workflow execution was halted between T1 and T2. Scheduled workflows missed during this window will not auto-backfill. AI trigger events submitted during this window are not recoverable."

**Root cause analysis.**  
1. Review Redis logs for the failure event: `journalctl -u redis -n 500` or cloud provider log archive.  
2. Run `redis-cli INFO memory` on the recovered instance: compare `used_memory` vs. `maxmemory`. OOM kill is the most common cause on underdimensioned instances.  
3. Run `redis-cli INFO persistence` to confirm AOF/RDB state and last successful save timestamp.  
4. Check disk usage on the Redis host: `df -h`. A full disk prevents AOF writes, causing Redis to exit.  
5. Check if `maxmemory-policy` was set to a value that evicts data: `redis-cli CONFIG GET maxmemory-policy`.

**Resolution.**  
1. Quantify lost jobs: identify the outage window from Prometheus metrics. Query `workflow_runs` for the gap: `SELECT count(*) FROM workflow_runs WHERE created_at BETWEEN '<outage_start>' AND '<outage_end>'`. Compare against the expected rate from the pre-outage baseline.  
2. For `schedule`-type workflows: identify missed firings from `SELECT id, name, next_fire_at FROM workflows WHERE trigger_type = 'schedule' AND enabled = true AND next_fire_at BETWEEN '<outage_start>' AND '<outage_end>'`. Manually enqueue via admin API if customer SLA requires it.  
3. For `response_submitted` workflows: trigger events that arrived during the outage are permanently lost. Log the data loss window in the incident report.

**Post-incident actions.**  
- If AOF was not enabled: enable `appendfsync everysec` before closing the incident. This is a prerequisite, not a follow-up.  
- If no HA was in place: open a P0 infrastructure ticket for Redis Sentinel deployment.  
- Verify `maxmemory-policy noeviction` is set. BullMQ requires it.  
- Add the `workflow_runs_total` rate floor alert if it was not present.  
- Write a data loss report quantifying affected orgs and time window.

---

### Runbook 2: DLQ Flood / Queue Poisoning

**Trigger:** PagerDuty alert — DLQ depth > 10 (existing). Recommended update: rate-based alert — DLQ depth increasing by > 100 per minute for 3 consecutive minutes.

**Detection.**  
- Grafana: "DLQ depth" panel spiking or trending steeply upward.  
- Backend worker logs: high volume of `Job failed after 3 attempts` entries with a consistent error message. Consistent error = systematic failure, not random noise.  
- Database: `SELECT count(*) FROM dead_letter_items WHERE created_at > now() - interval '10 minutes'` returning hundreds or thousands.

**Immediate mitigation (first 5 minutes).**  
1. Identify the failing action type from recent DLQ entries: `SELECT action_type, error_message, count(*) FROM dead_letter_items WHERE created_at > now() - interval '10 minutes' GROUP BY action_type, error_message ORDER BY count DESC LIMIT 10`.  
2. If all failures share the same error (e.g., "Slack API 401 Unauthorized", "Jira host unreachable"): this is an integration credential or third-party outage. Do NOT retry the failed jobs — it will make things worse and hit the third-party rate limit.  
3. Pause the affected action type queue via BullMQ admin (or set worker concurrency to 0 for the affected action executor) to stop consuming retry capacity while diagnosing.  
4. Check the deploy timestamp against the DLQ spike start time: `git log --since='<spike_start>' --format='%h %ai %s' -- backend/src/workflows/actions/`.  
5. If a deploy caused the failure: trigger a rollback. The queue will drain normally once the fix is deployed and workers resume.

**Root cause analysis.**  
1. For third-party integration failures: check Slack, Jira, Zendesk status pages. Verify API credentials are valid and not expired: `SELECT integration_type, created_at, expires_at FROM workflow_integrations WHERE expires_at < now()`.  
2. For code failures from a recent deploy: review the git diff for the affected action executor file. Look for serialization changes, API client changes, or environment variable references.  
3. For schema failures: check if a DB migration ran within the spike window and whether any column types or constraint names changed.  
4. For payload size failures: check if any workflow definitions grew in complexity and whether the job payload exceeds BullMQ's default size limit.

**Resolution.**  
1. Fix the root cause (rotate credential, rollback deploy, hotfix, restore third-party connectivity).  
2. Drain the DLQ: after confirming the fix, re-enqueue failed jobs from the affected time window. Use BullMQ's `queue.retryJobs({ state: 'failed', count: 1000 })` method. Re-enqueue in batches to avoid re-flooding the queue.  
3. Monitor queue depth and DLQ write rate for 15 minutes after re-enqueue to confirm jobs process successfully.  
4. If the `dead_letter_items` table grew very large (> 100,000 rows), schedule a cleanup job during off-peak hours.

**Post-incident actions.**  
- If a single org drove the flood: apply per-org rate limiting as described in R-004 fix.  
- Update the DLQ alert threshold to a rate-based rule, not a depth threshold.  
- Add the DLQ drain procedure (step 2 above) to the team on-call playbook.  
- Review whether `maxFailedJobs` is configured. If not, add it to prevent future unbounded growth.

---

### Runbook 3: Scheduler Drift and Silent Failure

**Trigger:** PagerDuty alert — `workflow_scheduler_heartbeat_timestamp_seconds` gauge age > 90 seconds (once R-005 fix is deployed and the heartbeat metric exists). Pre-fix detection: customer report of missed scheduled workflow executions, or Grafana shows `workflow_fire_rate` = 0 for schedule-type workflows during a window when firings were expected.

**Detection.**  
- Prometheus alert: `time() - workflow_scheduler_heartbeat_timestamp_seconds > 90`.  
- Customer report: "My daily workflow at 9 AM did not run."  
- Database cross-check: `SELECT count(*) FROM workflow_runs WHERE trigger_type = 'schedule' AND created_at > now() - interval '5 minutes'` returns 0 despite enabled schedule workflows existing.

**Immediate mitigation (first 5 minutes).**  
1. Check backend process health via deployment platform (Fly.io app status / `fly status`, or Kubernetes `kubectl get pods`).  
2. If the process is down or restarting: the scheduler will reinitialize on process start. Monitor the heartbeat gauge for recovery within 60 seconds of the process coming up.  
3. If the process is running but the heartbeat is stale: the `setInterval` has silently stopped. Restart the process. This is a clean restart — no state is held in process memory that needs draining.  
4. After restart: confirm `workflow_scheduler_heartbeat_timestamp_seconds` updates within 60 seconds. Confirm `workflow_runs_total` rate recovers for schedule-type triggers.

**Root cause analysis.**  
1. Pull backend logs for the period immediately before the heartbeat went stale: `grep -E 'WorkflowScheduler|Uncaught|UnhandledPromise' <log_file>`. An uncaught exception in the tick callback is the most common cause.  
2. Check DB connection pool saturation at the time of failure: `pg_stat_activity` max connections, connection wait time. A pool exhaustion event can cause the tick DB query to time out and throw.  
3. Check if a Redis connection drop preceded the scheduler failure: cross-reference `workflow_redis_connection_errors_total` timestamps with the heartbeat stale timestamp.  
4. Check Node.js heap: if the process was OOM-killed, the restart log shows `exit code 137`. Review `--max-old-space-size` setting.

**Resolution.**  
1. Identify missed scheduled workflow executions during the silent failure window: `SELECT id, name, next_fire_at FROM workflows WHERE trigger_type = 'schedule' AND enabled = true AND next_fire_at BETWEEN '<failure_start>' AND '<recovery_time>'`.  
2. Manually backfill any missed executions that fall within customer SLA windows via the admin API: `POST /api/admin/workflows/:id/trigger`.  
3. Update `next_fire_at` for any workflows whose calculated next fire is now stale: `UPDATE workflows SET next_fire_at = <recalculated> WHERE trigger_type = 'schedule' AND next_fire_at < now()`.

**Post-incident actions.**  
- Implement the self-scheduling `setTimeout` tick pattern (R-005 fix) to prevent future `setInterval` silent failures.  
- Add the heartbeat Prometheus metric and alert if not yet deployed.  
- Review Node.js process memory limits and add an OOM kill alert based on container memory usage approaching the limit.  
- Add a startup log message from WorkflowScheduler confirming successful initialization on each process start.

---

## Prometheus Metrics to Add

The following metrics are absent from the current documentation and Grafana dashboard configuration. All metrics should be registered in `backend/src/lib/metrics.ts` (or equivalent) and exported via the `/metrics` endpoint.

| Metric name | Type | Labels | Alert threshold |
|---|---|---|---|
| `workflow_redis_connection_errors_total` | counter | `instance` | rate > 1/s for 60s |
| `workflow_scheduler_heartbeat_timestamp_seconds` | gauge | — | `time() - value > 90s` |
| `workflow_scheduler_tick_duration_seconds` | histogram | — | p99 > 20s |
| `workflow_scheduler_tick_success_total` | counter | — | — |
| `workflow_scheduler_tick_failures_total` | counter | — | rate > 0 sustained |
| `workflow_scheduler_lock_acquired_total` | counter | — | — |
| `workflow_scheduler_lock_skipped_total` | counter | — | > 0 outside deploy window |
| `workflow_duplicate_run_prevented_total` | counter | — | > 0 triggers investigation |
| `workflow_run_latency_seconds` | histogram | `trigger_type`, `org_id` | per-tier SLO burn rate rules |
| `workflow_trigger_throttled_total` | counter | `org_id`, `trigger_type` | — |
| `workflow_action_duration_seconds` | histogram | `action_type` | p99 > 30s (non-AI), p99 > 95s (AI) |
| `workflow_action_failures_total` | counter | `action_type`, `error_class` | error rate > 1% of total |
| `workflow_dlq_write_rate` | gauge | — | > 100/min for 3 consecutive minutes |
| `workflow_test_run_total` | counter | `org_id` | — |
| `workflow_test_run_duration_seconds` | histogram | — | p99 > 10s |
| `crystalbuilder_llm_tokens_total` | counter | `org_id`, `model` | — |
| `crystalbuilder_llm_cost_usd_total` | counter | `org_id` | > 50 USD/month per org |
| `workflow_queue_depth_by_type` | gauge | `queue_name`, `state` | depth > 10,000 |
| `workflow_version_count` | histogram | — | p99 > 100 versions per workflow |

---

## Chaos Engineering Test Plan

The following scenarios must be executed in a staging environment that mirrors production queue depth, workflow count, and org count. Each scenario documents the injection method, the pass criterion, and which risk it validates.

**Scenario 1: Redis cold restart**  
Validates: R-001  
Injection: `redis-cli DEBUG SLEEP 120` to simulate 2-minute Redis unavailability.  
Pass criterion: No workflow runs are duplicated after recovery. Queue drains within 5 minutes of Redis returning. Alert fires within 90 seconds of Redis going down. Exactly the jobs enqueued after the last AOF sync are lost; no additional data loss.

**Scenario 2: Dual backend instances (rolling deploy simulation)**  
Validates: R-002  
Injection: Start a second backend process. Allow both to run for 60 seconds. Terminate the first.  
Pass criterion: Zero duplicate workflow runs appear in `workflow_runs`. `workflow_scheduler_lock_skipped_total` increments during the overlap window. No duplicate Slack messages or Jira tickets are created. `workflow_duplicate_run_prevented_total` may increment (idempotency key conflict caught at DB level); this is acceptable as long as no external side effects occurred.

**Scenario 3: DLQ flood from a bad action executor**  
Validates: R-004  
Injection: Deploy a version of `slackAction.ts` that always throws `new Error('simulated failure')`. Queue 500 workflow runs with Slack actions.  
Pass criterion: DLQ alert fires within 5 minutes. `dead_letter_items` row count stabilizes at `maxFailedJobs` limit (does not grow unboundedly). Redis memory does not grow beyond 2x baseline. Re-enqueuing after the fix drains successfully.

**Scenario 4: Scheduler tick overrun causing concurrent execution**  
Validates: R-005  
Injection: Add `await new Promise(resolve => setTimeout(resolve, 35000))` inside the scheduler tick in staging.  
Pass criterion: With the self-scheduling `setTimeout` pattern, no concurrent tick execution occurs. `workflow_scheduler_tick_duration_seconds` p99 reflects the delay. No duplicate enqueues appear. With the old `setInterval` pattern, duplicate enqueues should appear, validating the test is exercising the right code path.

**Scenario 5: response_submitted burst at 1,000 responses/second**  
Validates: R-006  
Injection: Use a load generator to send 1,000 concurrent POST requests to the survey response endpoint for a survey with an active 5-action workflow.  
Pass criterion: All 1,000 trigger events result in exactly 1,000 workflow run records (verified via `SELECT count(*) FROM workflow_runs WHERE ...`). "workflow-actions" queue drains within 10 minutes. Other orgs' workflows experience less than 5% p99 latency increase during the burst.

**Scenario 6: CrystalOS unavailability during crystal_analysis actions**  
Validates: R-007  
Injection: Stop the CrystalOS process while 10 concurrent `crystal_analysis` action jobs are in-flight.  
Pass criterion: Action jobs time out within 95 seconds (per the per-action-type timeout). They enter the retry queue — not DLQ immediately. Non-AI action jobs in the main queue (if the dedicated crystal queue fix is deployed) are not stalled. Worker pool concurrency recovers within 10 seconds of timed-out jobs completing.

**Scenario 7: AI trigger pipeline latency against SLO**  
Validates: R-003  
Injection: Inject a 10-minute artificial delay in the CrystalOS insight pipeline for a designated test workflow.  
Pass criterion: The workflow run is recorded with a latency > 30s. It is categorized under the `ai_insight_trigger` SLO tier and does not contribute to the 30-second SLO tier's burn rate metric. The 30-second SLO tier metric is unaffected.

**Scenario 8: Crystal Builder LLM API unavailability**  
Validates: R-011  
Injection: Block the outbound LLM API endpoint at the network layer using a staging firewall rule.  
Pass criterion: Crystal Builder endpoint returns HTTP 503 with a user-readable error body within 10 seconds. No unhandled promise rejections appear in backend logs. `crystalbuilder_llm_tokens_total` does not increment. Endpoint is rate-limited independently of the LLM failure (rate limit fires before the LLM call is attempted).

**Scenario 9: Version history bloat under automated saves**  
Validates: R-009  
Injection: Script 10,000 PUT requests to a single workflow's update endpoint at 100 requests/second.  
Pass criterion: If the `workflow_versions` table migration is deployed, row count for this workflow is capped at 50 (nightly job) or at most 50 + intra-day saves. Query latency for `GET /api/workflows/:id` does not degrade as version count grows. If still on JSONB column, `workflow_version_count` p99 metric should breach the 100-version alert threshold.

**Scenario 10: Test mode under concurrent load**  
Validates: R-010  
Injection: Send 1,000 concurrent POST requests to the test-run (Safe Run) endpoint.  
Pass criterion: Rate limiter returns HTTP 429 for all requests beyond the 20-concurrent global cap. `workflow_test_run_total` counter correctly reflects both accepted and rejected counts. Production workflow execution p99 latency increases by less than 5% during the test mode load.

**Scenario 11: Backend OOM kill during active scheduler tick**  
Validates: R-005, R-002  
Injection: Allocate memory until the Node.js process is OOM-killed mid-tick (inject a large allocation in the scheduler tick callback in staging).  
Pass criterion: No `workflow_runs` records are left in `status = 'running'` for more than 5 minutes after process restart (stuck-in-progress cleanup). Scheduler heartbeat alert fires within 90 seconds. On process restart, the scheduler acquires the distributed lock on the first tick and resumes without duplicating any enqueues that were in-progress at crash time.

**Scenario 12: Idempotency key replay attack**  
Validates: R-002 guard  
Injection: Capture a valid `idempotency_key` from a completed workflow run. Submit a new trigger request with the same key via the internal workflow-signals endpoint.  
Pass criterion: The second trigger is rejected (HTTP 409 or silently deduplicated). No new action jobs are enqueued. The existing completed run's status and step records are unchanged. No external side effects (Slack, Jira) are triggered.

---

## Updated Architecture Decisions

The following changes to the current architecture are required to address P0 and P1 risks. Items marked "prerequisite" must be completed before scaling workflow execution beyond 1 million runs/month.

**Decision 1: Redis HA is a prerequisite for production scale.**  
The current single-Redis topology is acceptable for development and limited beta. For any production deployment, deploy Redis Sentinel with 3 nodes or Redis Cluster. Enable AOF persistence (`appendfsync everysec`) on the primary. Document topology in `backend/README.md` and `docker/docker-compose.yml`. Add Redis Sentinel variables to `backend/.env.example` and `docs/ENV_VARS.md`.

**Decision 2: Distributed scheduler locking is mandatory before any horizontal scaling.**  
The WorkflowScheduler must acquire a `redlock` distributed lock before each tick. This is non-negotiable for any deployment that could run more than one backend process simultaneously — including any blue-green deploy, pod restart overlap, or scale-out. The `redlock` npm package integrates directly with the existing `ioredis` client. This change is in `backend/src/workflows/WorkflowScheduler.ts`.

**Decision 3: The SLO framework must be tiered before any external publication.**  
The monolithic 30-second SLO must be replaced with the tiered framework defined in R-003. All Prometheus SLO metrics must include `trigger_type` as a label. No customer contract, status page, or sales material should reference the 30-second SLO as applying to AI-triggered workflows. This change affects `docs/workflows/` SLO documentation and Prometheus alert rule configuration.

**Decision 4: Dedicated queue for crystal_analysis actions.**  
The `crystal_analysis` action type must run in a dedicated BullMQ queue ("workflow-crystal-actions") with a separate, smaller worker pool (concurrency 3). This prevents AI action latency from blocking the main "workflow-actions" worker pool. Changes: `backend/src/workers/workflowActionWorker.ts`, `backend/src/workflows/actions/crystalAnalysisAction.ts`.

**Decision 5: Replace setInterval with self-scheduling setTimeout in WorkflowScheduler.**  
The recursive `setTimeout` pattern (with try/catch/finally) prevents concurrent tick execution and eliminates silent failure on uncaught exceptions. This change is isolated to `backend/src/workflows/WorkflowScheduler.ts` and is low-risk.

**Decision 6: workflow_versions as a separate table.**  
The `version_history` JSONB column on `workflows` must be migrated to a dedicated `workflow_versions` table before any org uses workflow versioning heavily. A Postgres migration (in `supabase/migrations/`) and PUT handler update (in `backend/src/routes/workflows.ts`) are required. A retention policy of 50 versions per workflow must be enforced by a nightly background job. This is a P2 but should be addressed before any marketing of the version history feature.
