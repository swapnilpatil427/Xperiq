# Xperiq Command Center — Operational & SRE Review

> **Reviewer:** Kenji Watanabe, Platform Engineering Lead  
> **Review date:** 2026-06-29  
> **Architecture doc reviewed:** `docs/org-dashboard/ARCHITECTURE.md` (authored by Dariusz Kowalski, 2026-06-29)  
> **Status:** Pre-production gate review — this document must be resolved before the Command Center ships to any paying org

---

## 1. Executive Summary

The Command Center architecture is well-conceived at the data modeling level. The layered aggregation strategy (source → materialized views → REST + WebSocket) is the right pattern, and the decision to never read `survey_responses` directly for aggregated views is correct. The Redis debounce design for WebSocket bursts shows operational awareness.

That said, I would not sign off on this shipping to production today. There are three issues that are individually P0 or near-P0 and would cause an outage at a moderately large org:

1. **The pg_notify → Redis pub/sub bridge is a single point of failure with no observability and no fallback.** The entire real-time layer rides on one `pg.Client` LISTEN connection. If it drops silently — and it will, on deploys and Postgres failover — no client gets another update until the backend restarts. There is no dead-letter queue, no alerting, no client-side awareness that updates have stopped.

2. **`REFRESH MATERIALIZED VIEW CONCURRENTLY` is not lock-free under the current schema.** The architecture correctly states that `CONCURRENTLY` prevents blocking reads. This is true for the view rows themselves. What it does not say is that the refresh still acquires a `ShareUpdateExclusiveLock` that blocks a second concurrent refresh of the same view. At 1,000+ orgs all triggering a 15-minute refresh simultaneously, pg_cron will queue multiple refresh attempts and they will pile up. Postgres connection exhaustion is the failure mode.

3. **There is no context-window budget guard in `synthesize_narrative`.** The `aggregate_org_metrics` node feeds the full `OrgMetricsSnapshot` into the LLM prompt, including `critical_surveys`, `attention_surveys`, and `healthy_surveys` as lists. At a large org with 200+ surveys, this prompt will exceed any reasonable context window silently — the LLM call will return an error, the `publish_brief` node will not upsert, and the frontend will show a stale brief or nothing, with no alerting.

The risk register below covers these and nine more issues in detail. Fix the P0s before any production deployment. Fix the P1s before GA.

---

## 2. Risk Register

### RISK-01 — WebSocket Server: Memory Leak from Unbounded Org Room Growth

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Component** | `backend/src/services/org-realtime.service.ts` |
| **Description** | The org room map (`Map<string, Set<WebSocket>>`) is never pruned for empty rooms. When the last client in an org disconnects, the architecture calls for unsubscribing the Redis channel if the room is empty. If the disconnect event fires but the cleanup path throws (e.g., Redis subscriber is in an error state), the empty `Set` stays in the map and the Redis `SUBSCRIBE` stays live. Over days of rolling deploys and flapping clients, this accumulates stale entries. At 1,000 orgs with 5 tabs open each, 5,000 WebSocket connections is nominal; leaked entries can double resident memory without any single client "leaking." |
| **Blast radius** | Backend OOM kill → all WebSocket connections dropped for all orgs simultaneously → WebSocket reconnection storm (see RISK-06) |
| **Fix** | Wrap the cleanup path in a try/catch that always removes the room entry even if Redis unsubscribe fails. Add a periodic sweep (every 5 minutes) that prunes rooms where `Set.size === 0`. Emit a metric `xperiq_ws_rooms_active` so growth is visible. |

---

### RISK-02 — Redis Pub/Sub Fan-Out Storm at High Response Volume

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Component** | `notify_response_inserted` Postgres trigger → `pg_notify` → LISTEN client → Redis pub/sub → `org-realtime.service.ts` |
| **Description** | The Postgres trigger fires `pg_notify('response_inserted', ...)` on **every row insert** into `survey_responses`. At a large org running a multi-channel campaign, this can easily reach 1,000+ inserts per minute. The LISTEN client receives all of them, and while the architecture specifies a 3-second debounce per org before publishing to Redis, the debounce buffer itself is unbounded in memory. A burst of 50,000 events (realistic for a survey launch to a large panel) will create a 50,000-item in-process queue before the debounce flush. More critically, `pg_notify` has a hard limit: if the notify queue in Postgres fills (8GB WAL by default, but effectively much less on shared instances), Postgres will begin silently dropping `pg_notify` messages. **There is no error returned to the trigger and no way to detect dropped events.** |
| **Blast radius** | Real-time updates silently stop for high-volume orgs. The frontend shows a stale counter with no indication. If the in-process buffer grows large enough, the backend process crashes (OOM), taking all WebSocket connections with it. |
| **Fix** | (1) Rate-limit the Postgres trigger: replace the per-row trigger with a `STATEMENT`-level trigger that emits one `pg_notify` per INSERT statement, not per row. (2) Add an explicit backpressure check in the LISTEN client: if the debounce buffer for any org exceeds 1,000 pending events, drop to sampling mode (emit 1-in-10) and set a metric flag. (3) Instrument `xperiq_pgnotify_received_total` and `xperiq_pgnotify_dropped_total` (the latter requires a health-check poll comparing `pg_notify` send vs. receive counts). |

---

### RISK-03 — pg_notify → Redis LISTEN Client: Silent Reconnect Failure

| Field | Detail |
|-------|--------|
| **Severity** | P0 |
| **Component** | Backend LISTEN client (unspecified file, presumably `backend/src/services/org-realtime.service.ts` or a separate `backend/src/services/pg-listen.service.ts`) |
| **Description** | The `pg.Client` used for `LISTEN` is a persistent, long-lived connection. Unlike a pool connection, it does not self-heal. On a Postgres failover, a Fly.io rolling deploy that bounces the Postgres proxy, or a network partition, the LISTEN connection drops. `pg.Client` does not auto-reconnect. The architecture document does not mention reconnect logic, exponential backoff, or a health check for this connection. During the outage window, all `pg_notify` events are silently lost — not queued, not retried. The WebSocket server continues to operate and send heartbeats, so clients have no indication that real-time updates have stopped. |
| **Blast radius** | All real-time updates silently stop for all orgs. Duration: until backend restarts (manual or Fly.io health check triggered restart). In the worst case this can persist for hours. |
| **Fix** | Use `pg-listen` (npm package) or implement explicit reconnect with exponential backoff (1s, 2s, 4s, 8s, cap 60s). Emit a `xperiq_pglisten_connected` gauge (0/1). Alert when it's 0 for >60 seconds. On reconnect, force a cache bust for all orgs' Redis keys so the next REST poll fetches fresh data. |

---

### RISK-04 — `REFRESH MATERIALIZED VIEW CONCURRENTLY` Lock Contention Under Concurrent Refreshes

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Component** | pg_cron jobs: `refresh-org-metrics-daily`, `refresh-tag-group-metrics`, `refresh-survey-health-summary` |
| **Description** | `REFRESH MATERIALIZED VIEW CONCURRENTLY` does not block concurrent reads — that is correct. However it does acquire a `ShareUpdateExclusiveLock` (lock mode 4) that blocks **a second concurrent refresh of the same view**. If the `refresh-org-metrics-daily` job takes longer than 15 minutes (e.g., at 100M rows in `survey_responses`), the next pg_cron trigger fires and queues behind the running refresh. These jobs do not timeout by default. At scale, with three views all refreshing on 15-minute cadences and daily refreshes of `org_metrics_weekly` overlapping the 15-minute windows at 02:00 UTC, it is straightforward to exhaust the Postgres connection limit (typically 100 on managed instances). Every queued refresh holds a connection. |
| **Blast radius** | Postgres connection exhaustion causes `GET /api/org/dashboard` to return 500s. The Redis cache TTLs are 2 minutes, so within 2 minutes of the pool exhaustion, every dashboard request fails. |
| **Fix** | (1) Add `pg_cron` timeout guards: wrap each refresh in a function that checks `pg_stat_activity` for a running refresh of the same view and skips if one is already in progress. (2) Stagger the 15-minute refreshes: `org_metrics_daily` at :00/:15/:30/:45, `tag_group_metrics` at :02/:17/:32/:47. (3) Instrument `xperiq_matview_refresh_duration_seconds` with a P95 alert at 10 minutes. (4) Set `lock_timeout = '1min'` on the pg_cron worker connection so a queued refresh fails fast rather than blocking indefinitely. |

---

### RISK-05 — Crystal Brief `synthesize_narrative` Context Window Overflow

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Component** | `crystalos/graphs/org_brief_graph.py`, node `synthesize_narrative` |
| **Description** | The `USER_PROMPT` template in `synthesize_narrative` includes `{signals_text}` and `{top_programs_text}` which are rendered from `org_signals` and `ranked_programs` respectively. Upstream, `aggregate_org_metrics` fetches `survey_health_summary` for **all surveys in the org** and populates `critical_surveys`, `attention_surveys`, and `healthy_surveys` as full lists. At an org with 500 surveys, each `SurveyHealthRow` serialized to text is approximately 200 tokens. The full prompt can easily reach 100,000+ tokens for a large org. Claude's context window is finite; the call will fail with a context-length error. The `publish_brief` node is never reached, so no brief is upserted, no Redis invalidation occurs, and the frontend shows the previous week's brief with no indication it is stale. |
| **Blast radius** | Crystal briefs silently fail for any org above a size threshold. The backend scheduler `crystal-brief.job.ts` logs the error but there is no alert, no fallback brief, and no user-visible signal. |
| **Fix** | (1) In `aggregate_org_metrics`, cap the number of surveys included in each health list: max 10 critical, 10 attention, 5 healthy — sorted by rank score. Do not send the full list to the LLM. (2) Add a pre-call token count estimate in `synthesize_narrative`; if it exceeds 80% of the model's context window, truncate `top_programs_text` further and log a warning. (3) If the LLM call fails with a context error, retry with a reduced prompt (signals-only, no per-survey detail). (4) Emit `xperiq_crystal_brief_generation_failed_total` and alert when it fires. |

---

### RISK-06 — WebSocket Reconnection Storm After Rolling Deploy

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Component** | `backend/src/services/org-realtime.service.ts`, frontend WebSocket hook |
| **Description** | Fly.io rolling deploys bring up new instances and terminate old ones. When the old instance closes, all connected WebSocket clients (potentially thousands of tabs across all orgs) receive a close event simultaneously. If the frontend reconnect logic uses a fixed retry delay (e.g., 1 second), all clients reconnect within a 1-2 second window. At 5,000 concurrent connections, this is a burst of 5,000 WebSocket handshakes + 5,000 Clerk token verifications hitting the new instance simultaneously. Clerk's token verification is not cheap. The architecture document does not specify reconnect behavior. |
| **Blast radius** | New backend instance is overwhelmed by the reconnect storm, fails health checks, and is killed by Fly.io. The next instance is also killed. Fly.io's rolling deploy becomes a full restart loop. All REST endpoints are also unavailable during this window. |
| **Fix** | (1) Implement exponential backoff with full jitter in the frontend reconnect hook: `delay = random(0, min(2^attempt * 1000, 30000))`. (2) Pre-drain WebSocket connections before shutdown: on `SIGTERM`, send a `{type: 'server_drain', reconnect_after_ms: 15000}` message to all clients, then wait 5 seconds before closing. Clients that receive this message know to wait 15 seconds before reconnecting, spreading the storm over 15 seconds rather than 0. (3) Add a WebSocket accept rate limiter on new connections: max 500 new handshakes per 10 seconds. |

---

### RISK-07 — pg_cron Silent Failure: No Alerting, No Last-Run Tracking

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Component** | All pg_cron jobs: `refresh-org-metrics-daily`, `refresh-tag-group-metrics`, `refresh-survey-health-summary`, `refresh-org-metrics-weekly`, `compute-org-topic-trends`, `compute-org-health-scores` |
| **Description** | pg_cron logs job runs to `cron.job_run_details` but does not send alerts on failure. If `compute_all_org_health_scores()` fails (Postgres function error, timeout, deadlock), the `org_health_score` table is silently stale. The `valid_through` column is designed to detect staleness, but there is no monitoring query that checks whether `valid_through < NOW()` for any org and fires an alert. Similarly, `compute-org-topic-trends` runs only on Monday at 02:30 UTC — if it fails, the topics table is stale for an entire week with no visible signal. |
| **Blast radius** | Org Health Score widgets show week-old data silently. The `dataFreshnessAt` field in `GET /api/org/dashboard` will show an old timestamp, but there is no threshold alert to tell the on-call engineer that something is wrong. Crystal briefs reference stale topic trends. |
| **Fix** | (1) Create a monitoring query that runs every 5 minutes (via pg_cron itself, or via the backend scheduler): `SELECT org_id FROM org_health_score WHERE valid_through < NOW() - INTERVAL '2 hours'` — alert if any rows return. (2) Query `cron.job_run_details WHERE status = 'failed' AND end_time > NOW() - INTERVAL '1 hour'` in the backend health-check endpoint. (3) Emit `xperiq_pgcron_job_last_success_timestamp` as a Prometheus gauge for each named job. Alert when any job has not succeeded in 2x its expected cadence. |

---

### RISK-08 — `org_health_score` Compute Cost at 10,000 Orgs

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Component** | pg_cron job `compute-org-health-scores`, stored procedure `compute_all_org_health_scores()` |
| **Description** | `compute_all_org_health_scores()` is a stored procedure that runs once per day at 03:00 UTC for all orgs. The architecture document does not define this procedure's implementation, but given that it reads from `org_metrics_daily`, `org_metrics_weekly`, and the anomaly count (from `survey_anomalies` via `survey_health_summary`), a naive implementation does a sequential pass over all orgs. At 10,000 orgs, even a 10ms computation per org takes 100 seconds of wall-clock time. If the procedure uses a cursor or row-by-row PL/pgSQL loop rather than a bulk `INSERT ... ON CONFLICT DO UPDATE`, this will be much worse. More critically: the job starts at 03:00 UTC but `org_metrics_weekly` refreshes at 02:00 UTC. If the weekly refresh takes longer than 60 minutes (possible at scale), health scores will be computed from yesterday's weekly data. |
| **Blast radius** | At 10,000 orgs, daily health score computation takes multiple minutes, holding a Postgres connection for the entire duration and potentially blocking other writes if the procedure uses table-level locks. |
| **Fix** | (1) Implement `compute_all_org_health_scores()` as a single `INSERT INTO org_health_score (...) SELECT ... ON CONFLICT (org_id) DO UPDATE SET ...` query with no row-by-row loop. (2) Add a 90-minute dependency guard: start the health score job at 04:00 UTC, not 03:00 UTC, giving the weekly refresh 2 hours. (3) If the org count grows beyond 5,000, partition the computation into batches of 1,000 orgs with a 30-second sleep between batches to avoid connection monopolization. |

---

### RISK-09 — `survey_health_summary` References `survey_anomalies` Table — Undefined Dependency

| Field | Detail |
|-------|--------|
| **Severity** | P1 |
| **Component** | `survey_health_summary` materialized view, migration `20260101000006_survey_health_summary.sql` |
| **Description** | The `survey_health_summary` view joins against `survey_anomalies` (column `resolved_at`) and `survey_responses` (for `last_activity_at`). The `survey_anomalies` table is not defined anywhere in the architecture document and does not appear in the listed migrations. If this table does not exist when the migration runs, the migration fails. If it does exist but lacks the expected schema (e.g., `resolved_at` is named differently), the view silently returns `anomaly_count = 0` for all surveys, causing all surveys to appear `healthy`. Additionally, `survey_health_summary` joins `survey_responses` without a date range filter in the `sr2` join for `last_activity_at`. On a table with 100M rows, this is a full table scan inside the REFRESH job. |
| **Blast radius** | If `survey_anomalies` does not exist, the migration and all subsequent org-dashboard functionality fails at deploy time. If the `sr2` join is slow, the hourly `refresh-survey-health-summary` refresh takes an unbounded amount of time. |
| **Fix** | (1) Add `survey_anomalies` to the architecture document and migrations with explicit schema. (2) Add a `WHERE sr2.submitted_at >= NOW() - INTERVAL '90 days'` filter on the `sr2` join for `last_activity_at` — or use a separate index-backed subquery. (3) Add a migration dependency check: `CREATE MATERIALIZED VIEW survey_health_summary` should fail loudly, not silently, if `survey_anomalies` does not exist. |

---

### RISK-10 — War Room Mode: Long-Lived WebSocket Connection Lifetime on TVs

| Field | Detail |
|-------|--------|
| **Severity** | P2 |
| **Component** | `backend/src/services/org-realtime.service.ts`, WebSocket heartbeat |
| **Description** | War Room Mode implies WebSocket connections open on large-screen TVs for hours or days without user interaction. The heartbeat mechanism (server sends `ping` every 30s, expects `pong` within 10s, closes if no response) will work correctly when the TV's browser is active. However, many browsers aggressively throttle timers in background tabs or when the display sleeps. A TV that goes to sleep for 5 minutes may stop processing JavaScript timers, miss 10+ heartbeat cycles, and get closed by the server. The browser then reconnects, generates a Clerk token verification, and the cycle repeats. At 50 War Room deployments, this creates regular low-level noise that makes WebSocket connection count metrics noisy and obscures real problems. More critically, if the TV's browser is in an `autohide taskbar` or kiosk mode, the reconnect may happen invisibly to the user — but not before showing a "disconnected" state for a moment. |
| **Blast radius** | War Room dashboards flicker as connections drop and reconnect. At scale, generates unnecessary Clerk token verification load. |
| **Fix** | (1) Increase the server-side heartbeat timeout for connections that have been open for more than 1 hour: extend `pong` wait from 10s to 60s. (2) In the frontend, use the `Page Visibility API` to suppress timer throttling concerns: pause the heartbeat timer when `document.hidden === true` and send an immediate pong on `visibilitychange`. (3) Store a `last_connected_at` timestamp per connection and emit `xperiq_ws_connection_age_hours` histogram to distinguish short-lived tabs from long-lived War Room connections. |

---

### RISK-11 — `GET /api/org/dashboard/programs` Sparkline: N+1 Query for 500 Surveys

| Field | Detail |
|-------|--------|
| **Severity** | P2 |
| **Component** | `GET /api/org/dashboard/programs`, response field `sparkline: number[]` |
| **Description** | The `sparkline` field returns the last 7 daily NPS values for each survey in the programs table. `survey_health_summary` does not store time-series NPS — it stores only the current `last_nps`. To populate the sparkline, the API must either: (a) query `org_metrics_daily` with a `survey_id` filter for each survey (N+1 query pattern at 500 surveys = 500 separate DB queries), or (b) do a bulk join that was not designed into the materialized view. The architecture document lists `sparkline` in the response schema but provides no implementation detail, strongly suggesting this was not thought through. |
| **Blast radius** | At 500 surveys with `pageSize=50`, the first page requires 50 sparkline queries. P95 latency for `GET /api/org/dashboard/programs` will be 5-10 seconds, violating the dashboard load SLA. |
| **Fix** | Add a `survey_sparkline` materialized view (or a new column in `survey_health_summary`) that pre-computes the last 7 days of NPS per survey as a `NUMERIC[]` array. Refresh it hourly alongside `survey_health_summary`. Alternatively, use a single `SELECT survey_id, date, avg_nps FROM org_metrics_daily WHERE org_id = $1 AND date >= NOW() - INTERVAL '7 days'` query and pivot in application code. Do not use a per-survey loop. |

---

### RISK-12 — `org_metrics_weekly` Depends on `org_metrics_daily`: Chain Refresh Failure

| Field | Detail |
|-------|--------|
| **Severity** | P2 |
| **Component** | pg_cron jobs `refresh-org-metrics-weekly` (02:00 UTC), `compute-org-topic-trends` (02:30 UTC Monday) |
| **Description** | `org_metrics_weekly` is computed from `org_metrics_daily` — it is a view of a view. If the 02:00 UTC weekly refresh runs before the previous day's 15-minute `org_metrics_daily` refresh has completed, the weekly view will roll up stale daily data. This is a timing race, not an explicit dependency. pg_cron has no job dependency syntax. Similarly, `compute-org-topic-trends` is scheduled 30 minutes after `refresh-org-metrics-weekly` with the assumption that the weekly refresh takes less than 30 minutes — an untested assumption at scale. If the topic trends procedure runs before the weekly refresh completes, it computes trends from last week's weekly data and writes them to `org_topic_trends`, which then persists for a full week. |
| **Blast radius** | Topic trends on the Command Center are silently one week stale. Crystal briefs built from these trends recommend actions based on last week's data. Detected on Monday morning when users compare the dashboard to their own records. |
| **Fix** | (1) Add explicit completion signaling: have each cron job write a completion timestamp to a `cron_job_completions` table. The downstream job checks this table before running and retries with a 5-minute sleep if the upstream job has not completed. (2) Instrument `xperiq_pgcron_job_last_success_timestamp{job="refresh-org-metrics-daily"}` and make `refresh-org-metrics-weekly` conditional on this being within the last 2 hours. (3) Move `compute-org-topic-trends` to 03:00 UTC Monday (not 02:30 UTC) to provide a more realistic buffer. |

---

## 3. Incident Runbooks

### Runbook RB-01: WebSocket Outage — All Real-Time Updates Stopped

**Trigger:** Alert fires on `xperiq_ws_rooms_active == 0` for >2 minutes with `xperiq_ws_connections_active > 0`, OR user reports that the KPI counter is frozen.

**Impact:** All real-time updates (response counters, anomaly alerts, Crystal brief notifications, health score updates) have stopped. The dashboard is functionally read-only, falling back to the 2-minute REST cache.

**Immediate diagnosis (< 5 minutes):**

1. Check the backend process health:
   ```
   fly logs --app xperiq-backend | grep -E "pglisten|LISTEN|Redis|org-realtime" | tail -50
   ```
2. Check whether the pg.Client LISTEN connection is alive:
   ```
   fly ssh console --app xperiq-backend
   # In the Node.js process, check: GET /internal/health should include pglisten_connected: true
   ```
3. Check Redis pub/sub subscriber count:
   ```
   fly ssh console --app xperiq-backend
   redis-cli -h $REDIS_HOST PUBSUB NUMSUB org:<any_known_org_id>:responses
   ```
   If result is `0`, no subscriber exists — the LISTEN client is down.

4. Check Postgres `pg_stat_activity` for LISTEN connections:
   ```sql
   SELECT pid, state, query, query_start
   FROM pg_stat_activity
   WHERE query LIKE 'LISTEN%' OR wait_event_type = 'Client';
   ```
   If no rows with `LISTEN response_inserted` appear, the LISTEN client is confirmed down.

**Remediation:**

- **If pg.Client LISTEN connection is down:** Restart the backend service. The LISTEN client reconnects on startup. If RISK-03 fix is in place, it will auto-reconnect without a restart.
  ```
  fly app restart xperiq-backend
  ```
  After restart, verify `xperiq_pglisten_connected` gauge goes to `1` within 30 seconds.

- **If Redis pub/sub is down:** Check Redis cluster health. If Redis is unreachable, WebSocket updates will fail silently even if the LISTEN client is up (the LISTEN → Redis publish step will fail). Check `xperiq_redis_publish_errors_total` counter.
  ```
  fly redis status <redis_instance_name>
  ```

- **If both are healthy but updates are still not flowing:** Force a Postgres `NOTIFY` manually to test the pipeline:
  ```sql
  NOTIFY response_inserted, '{"survey_id": "test", "org_id": "test", "nps_score": 0, "sentiment": 0}';
  ```
  Check whether the backend receives it via `xperiq_pgnotify_received_total` counter incrementing.

**Resolution criteria:** `xperiq_ws_rooms_active` returns to expected value, a test response insert triggers a client-visible update within 2 seconds.

**Post-incident:** If RISK-03 (silent LISTEN reconnect failure) was the root cause and the fix is not yet deployed, schedule a backend restart in the deploy runbook as a mitigation step until the fix ships.

---

### Runbook RB-02: Redis Pub/Sub Backlog — Real-Time Updates Severely Delayed

**Trigger:** `xperiq_ws_update_latency_seconds P95 > 10s`, OR `xperiq_pgnotify_received_total` is growing rapidly but `xperiq_ws_messages_sent_total` is not keeping pace, OR user reports that the response counter is updating in large jumps rather than smoothly.

**Impact:** Real-time updates are delayed by seconds to minutes. The debounce buffer in the LISTEN client is growing. If not addressed, the backend process will eventually OOM (see RISK-02).

**Immediate diagnosis (< 5 minutes):**

1. Check the in-process debounce buffer size:
   ```
   # Via /internal/metrics or /internal/health endpoint:
   GET /internal/health → check field: pgnotify_buffer_size_by_org
   ```
   If any org has a buffer exceeding 10,000 events, that org is the source of the storm.

2. Check Postgres `pg_notify` send rate:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE wait_event = 'notify';
   -- Also check the trigger fire rate:
   SELECT schemaname, relname, n_tup_ins
   FROM pg_stat_user_tables
   WHERE relname = 'survey_responses'
   ORDER BY n_tup_ins DESC;
   ```

3. Check Redis memory:
   ```
   redis-cli -h $REDIS_HOST INFO memory | grep used_memory_human
   ```
   If Redis memory is above 80% of its configured maxmemory, pub/sub messages may be evicted.

4. Identify the offending org:
   ```sql
   SELECT org_id, count(*) as inserts_last_minute
   FROM survey_responses
   WHERE submitted_at >= NOW() - INTERVAL '1 minute'
   GROUP BY org_id
   ORDER BY inserts_last_minute DESC
   LIMIT 5;
   ```

**Remediation:**

- **If one org is generating >500 inserts/minute (campaign launch):**
  1. Temporarily disable the `notify_response_inserted` trigger for that org:
     ```sql
     -- Emergency rate gate — add a check to the trigger function:
     IF NEW.org_id = '<offending_org_id>' THEN RETURN NEW; END IF;
     ```
     This is a temporary patch. Coordinate with the customer.
  2. Alternatively, raise the debounce window for that org from 3s to 30s in the LISTEN client config (requires a feature flag or hot config reload).

- **If backlog is system-wide (multiple orgs):**
  1. Scale the backend horizontally: `fly scale count xperiq-backend 4`. Note: this requires that the LISTEN client and debounce buffer are sharded by org, not centralized in one process. If they are centralized, horizontal scaling does NOT help — this is a critical architectural flaw to address.
  2. If horizontal scaling is not possible (single LISTEN client), restart the backend to flush the buffer. Accept that events during the restart window are lost.

- **If Redis is at memory pressure:**
  1. Increase Redis maxmemory: `fly redis update <instance> --vm-size <larger>`.
  2. Purge stale org-level cache keys immediately to free memory:
     ```
     redis-cli -h $REDIS_HOST KEYS "org:*:dashboard" | xargs redis-cli -h $REDIS_HOST DEL
     ```

**Resolution criteria:** `xperiq_pgnotify_buffer_size_by_org` returns to <100 for all orgs. `xperiq_ws_update_latency_seconds P95 < 2s`.

---

### Runbook RB-03: Crystal Brief Generation Failure

**Trigger:** `xperiq_crystal_brief_generation_failed_total` increments, OR users report that the Crystal brief card shows a stale brief older than 7 days, OR `POST /api/org/dashboard/crystal-brief/regenerate` returns 202 but no `crystal_brief_ready` WebSocket message arrives within 5 minutes.

**Impact:** Crystal brief is stale. The `generatedAt` timestamp on the brief card is the indicator. No data is incorrect — just missing the weekly AI-generated narrative. Not a data integrity issue, but a high-visibility feature failure.

**Immediate diagnosis (< 5 minutes):**

1. Check the backend crystal-brief job logs:
   ```
   fly logs --app xperiq-backend | grep -E "crystal-brief|org-brief|CrystalOS" | tail -50
   ```
   Look for: HTTP 4xx/5xx from CrystalOS `/graphs/org-brief`, timeout errors, or JSON parse failures.

2. Check the CrystalOS service health:
   ```
   curl https://crystalos.<fly-app>.fly.dev/health
   ```
   If CrystalOS is down, all brief generation fails.

3. Check the `org_crystal_briefs` table for the affected org:
   ```sql
   SELECT org_id, date_range_start, generated_at, model_version
   FROM org_crystal_briefs
   WHERE org_id = '<org_id>'
   ORDER BY generated_at DESC
   LIMIT 5;
   ```
   If no row exists for the current week's `date_range_start`, the upsert in `publish_brief` never executed.

4. Check CrystalOS logs for context-length errors:
   ```
   fly logs --app xperiq-crystalos | grep -E "context_length_exceeded|max_tokens|token" | tail -20
   ```
   If context-length errors appear, this org has hit the RISK-05 scenario.

5. Check the `input_snapshot` column from the previous successful brief:
   ```sql
   SELECT jsonb_array_length(input_snapshot->'critical_surveys') AS critical_count,
          jsonb_array_length(input_snapshot->'attention_surveys') AS attention_count,
          jsonb_array_length(input_snapshot->'healthy_surveys') AS healthy_count
   FROM org_crystal_briefs
   WHERE org_id = '<org_id>'
   ORDER BY generated_at DESC
   LIMIT 1;
   ```
   If counts are very large (>50), this org is likely exceeding the context budget.

**Remediation:**

- **If CrystalOS is down:**
  1. Restart CrystalOS: `fly app restart xperiq-crystalos`.
  2. Manually trigger brief regeneration for affected orgs via the admin endpoint once CrystalOS is back.
  3. If CrystalOS restart fails, check Python dependency health and GPU/model availability.

- **If context-length error for a specific org:**
  1. Manually invoke the brief graph with a truncated payload via the CrystalOS admin interface, capping survey lists at 10 per health tier.
  2. Deploy the RISK-05 fix (context budget guard) before this org's next scheduled brief generation.

- **If `publish_brief` Redis delete step failed (brief generated but cache not invalidated):**
  1. Manually delete the Redis key:
     ```
     redis-cli -h $REDIS_HOST DEL "org:<org_id>:crystal-brief"
     ```
  2. The next `GET /api/org/dashboard/crystal-brief` request will fetch the new brief from Postgres.

- **If `publish_brief` Redis pub/sub publish failed (brief generated, cache invalidated, but no WebSocket push):**
  1. The brief is in Postgres and the cache is clear — users will see it on next REST poll (within 2 minutes).
  2. Manually trigger a WebSocket push via the admin endpoint if immediate notification is required.

**Resolution criteria:** `org_crystal_briefs` has a row for the current week with `generated_at` within the last 24 hours. The Command Center Crystal brief card shows updated `generatedAt` timestamp.

---

## 4. Observability — Prometheus Metrics

The following 18 metrics must be instrumented before production launch. Alert thresholds assume a baseline org count of 100-1,000.

| # | Metric Name | Type | Labels | Description | Alert Threshold |
|---|-------------|------|--------|-------------|-----------------|
| 1 | `xperiq_ws_connections_active` | Gauge | `org_id` (optional, aggregated) | Active WebSocket connections to `org-realtime.service.ts` | Alert: >10,000 total (capacity planning); PagerDuty: drops to 0 when >0 expected |
| 2 | `xperiq_ws_rooms_active` | Gauge | — | Number of org rooms with at least one connected client | Alert: unexpected drop to 0 during business hours |
| 3 | `xperiq_ws_connection_age_seconds` | Histogram | `client_type: browser/warroom` | Age of WebSocket connections at close time. Use to detect War Room connection churn | P95 alert: <300s during business hours (indicates reconnect storm) |
| 4 | `xperiq_ws_messages_sent_total` | Counter | `message_type: response_received/anomaly_detected/crystal_brief_ready/health_score_updated/ping` | Total WebSocket messages sent by type | Alert: `ping` messages firing but zero `response_received` during campaign hours (indicates broken pub/sub) |
| 5 | `xperiq_ws_update_latency_seconds` | Histogram | — | End-to-end latency from `survey_responses` INSERT to WebSocket client delivery. Requires synthetic test injection. | P95 alert: >2s; P99 alert: >5s |
| 6 | `xperiq_pglisten_connected` | Gauge | — | 1 if the `pg.Client` LISTEN connection is alive, 0 if down | PagerDuty: value = 0 for >60 seconds |
| 7 | `xperiq_pgnotify_received_total` | Counter | `channel: response_inserted` | Total `pg_notify` events received by the LISTEN client | Alert: rate drops to 0 during active survey periods |
| 8 | `xperiq_pgnotify_buffer_size` | Gauge | `org_id` (top 10 by size) | Current size of the per-org debounce buffer in the LISTEN client | Alert: any org buffer >5,000 events |
| 9 | `xperiq_matview_refresh_duration_seconds` | Histogram | `view_name: org_metrics_daily/tag_group_metrics/survey_health_summary/org_metrics_weekly` | Duration of each `REFRESH MATERIALIZED VIEW` operation | P95 alert: `org_metrics_daily` >10 min; `survey_health_summary` >30 min |
| 10 | `xperiq_matview_refresh_last_success_timestamp` | Gauge | `view_name` | Unix timestamp of last successful refresh for each materialized view | Alert: `org_metrics_daily` not refreshed in >20 min; `survey_health_summary` not refreshed in >2 hours |
| 11 | `xperiq_pgcron_job_last_success_timestamp` | Gauge | `job_name: compute-org-health-scores/compute-org-topic-trends/refresh-org-metrics-weekly` | Unix timestamp of last successful pg_cron job completion | Alert: `compute-org-health-scores` not succeeded in >26 hours; `compute-org-topic-trends` not succeeded in >8 days |
| 12 | `xperiq_pgcron_job_failures_total` | Counter | `job_name` | pg_cron job failure count, polled from `cron.job_run_details` | Alert: any increment; PagerDuty on `compute-org-health-scores` or `compute-org-topic-trends` failure |
| 13 | `xperiq_crystal_brief_generation_duration_seconds` | Histogram | `status: success/failure` | Duration of Crystal brief generation in `crystalos/graphs/org_brief_graph.py` | P95 alert: >120s (indicates LLM timeout or large context) |
| 14 | `xperiq_crystal_brief_generation_failed_total` | Counter | `reason: context_length/llm_error/db_error/timeout` | Crystal brief generation failure count by reason | Alert: any increment within 1 hour; PagerDuty if >3 in 1 hour |
| 15 | `xperiq_crystal_brief_age_seconds` | Gauge | `org_id` (aggregated as P99 across orgs) | Age of the most recent Crystal brief per org | P99 alert: >14 days (two missed weekly generations) |
| 16 | `xperiq_api_dashboard_latency_seconds` | Histogram | `endpoint: /api/org/dashboard, /api/org/dashboard/programs, /api/org/dashboard/trends` | HTTP request latency for org-dashboard endpoints | P95 alert: >500ms for `/api/org/dashboard`; P95 alert: >2s for `/api/org/dashboard/programs` |
| 17 | `xperiq_redis_publish_errors_total` | Counter | `channel_pattern: org_responses/org_alerts/org_health` | Failed Redis `PUBLISH` calls in `org-realtime.service.ts` | Alert: any increment; PagerDuty if sustained for >2 min |
| 18 | `xperiq_org_health_score_staleness_count` | Gauge | — | Number of orgs where `org_health_score.valid_through < NOW()`. Queried by the backend health-check job every 5 minutes. | Alert: >0 for >30 minutes; PagerDuty if >10% of total orgs |

---

## 5. Cost Model

### Assumptions

| Parameter | Value |
|-----------|-------|
| WebSocket connection memory (Node.js ws + Redis subscriber overhead) | 25 KB per connection |
| Average tabs open per active user | 1.5 |
| Active concurrent users per org (business hours) | 3 |
| Redis memory per org channel + cached keys | ~50 KB at rest; ~200 KB under load |
| Crystal brief LLM call: input tokens (medium org, 50 surveys) | ~8,000 tokens |
| Crystal brief LLM call: output tokens | ~200 tokens |
| Crystal brief generation frequency | Once per org per week |
| LLM model assumed | Claude Sonnet 4.5 via OpenRouter (as per backend stack) |
| Approximate token cost (Sonnet-class, via OpenRouter blended) | $3 / 1M input, $15 / 1M output |

---

### At 100 Orgs

| Resource | Calculation | Cost / Month |
|----------|-------------|--------------|
| WebSocket connections | 100 orgs × 3 users × 1.5 tabs = 450 connections × 25 KB = 11 MB resident memory | Negligible (fits in 256 MB backend instance) |
| Redis pub/sub memory | 100 orgs × 200 KB active + 100 × 50 KB rest = ~25 MB | Included in smallest Redis tier (~$10/mo) |
| Redis cache keys (`org:{id}:*`) | 100 orgs × 6 keys × avg 5 KB = 3 MB | Included in smallest Redis tier |
| Crystal brief LLM calls | 100 orgs × 4.3 weeks × 8,200 tokens input = 3.5M input tokens; 100 × 4.3 × 200 = 86K output tokens | $10.50 input + $1.29 output ≈ **$12/month** |
| Postgres compute (matview refreshes) | Negligible at 100 orgs | Included in base DB cost |
| **Total incremental cost** | | **~$25/month** (mostly infrastructure floor, not org-driven) |

---

### At 1,000 Orgs

| Resource | Calculation | Cost / Month |
|----------|-------------|--------------|
| WebSocket connections | 1,000 × 3 × 1.5 = 4,500 connections × 25 KB = 112 MB | Requires 512 MB+ backend instance; ~$10/mo uplift on Fly.io |
| Redis pub/sub memory | 1,000 × 200 KB active = 200 MB active channels | Requires Redis instance with 512 MB+ allocation (~$50-75/mo) |
| Redis cache keys | 1,000 × 6 × 5 KB = 30 MB | Included above |
| Crystal brief LLM calls | 1,000 orgs × 4.3 × 8,200 tokens = 35.3M input tokens; 860K output tokens | $105.9 input + $12.9 output ≈ **$119/month** |
| Postgres compute (`compute_all_org_health_scores` at 1K orgs) | ~10s/run × 30 runs/month = negligible | Included in base DB cost |
| `org_metrics_daily` REFRESH data volume | 1K orgs × ~90 days × ~50 bytes/row = ~4.5 GB scanned per refresh; 96 refreshes/day = 432 GB/day scan | Meaningful on metered DB instances; budget $50-100/mo |
| **Total incremental cost** | | **~$350-400/month** |

---

### At 10,000 Orgs

| Resource | Calculation | Cost / Month |
|----------|-------------|--------------|
| WebSocket connections | 10,000 × 3 × 1.5 = 45,000 connections × 25 KB = 1.1 GB resident memory | **Single Node.js process cannot hold this.** Requires horizontal scaling to 4-8 backend instances with sticky sessions or a shared pub/sub router. Fly.io cost: ~$150/mo for 4× 512 MB instances |
| Redis pub/sub memory | 10,000 × 200 KB = 2 GB active channels | Requires Redis Cluster (3-node minimum) at ~$200-300/mo |
| Redis cache keys | 10,000 × 6 × 5 KB = 300 MB | Included in cluster above |
| Crystal brief LLM calls | 10,000 × 4.3 × 8,200 tokens = 353M input tokens; 8.6M output tokens | $1,059 input + $129 output ≈ **$1,188/month** |
| `compute_all_org_health_scores` at 10K orgs | Must be bulk SQL (see RISK-08). Assuming 30-second bulk run: negligible DB cost. If row-by-row: 100s/night × 30 = 50 min/month of DB compute — meaningful on serverless DB pricing. | $20-100/mo depending on DB tier |
| Matview refresh DB scan | 10K orgs × 90 days × 50 bytes = 45 GB matview data; full scan per refresh. 96 refreshes/day × 45 GB = **4.3 TB scanned/day** | **THIS IS A COST AND PERFORMANCE CLIFF.** On managed Postgres at $0.10/GB scanned: ~$430/day = **$13,000/month** in scan costs alone. Requires table partitioning by `org_id` and incremental refresh strategy before reaching this scale. |
| **Total incremental cost** | | **~$15,000-16,000/month — dominated by unpartitioned matview scans** |

**Critical note on the 10,000-org cost cliff:** The materialized view design (`org_metrics_daily`, `tag_group_metrics`) performs a full scan of `survey_responses` on every refresh. This is acceptable at 100 orgs but becomes economically unviable at 10,000. Before attempting 10,000-org scale, partition `survey_responses` by `org_id` (or at minimum by `submitted_at` date) and implement incremental refresh logic that only scans new rows since the last refresh. This is an architectural change that requires a migration plan.

---

## 6. Load Test Scenarios

### LT-01: Sustained Concurrent Dashboard Load

**Scenario:** 500 concurrent users across 50 orgs each load `GET /api/org/dashboard` simultaneously. Each user then connects to `ws://api/org/dashboard/live` and holds the connection open for 10 minutes.

**Setup:**
- 50 orgs, each with 100 surveys and ~30,000 historical responses
- 10 users per org, all opening the dashboard simultaneously
- Redis warmed with all `org:{id}:dashboard` keys populated
- Run for 10 minutes; measure at 1-minute intervals

**Pass criteria:**
- `GET /api/org/dashboard` P95 latency: <500ms throughout the 10-minute window
- WebSocket connection success rate: >99.5%
- Backend process memory: <512 MB at peak
- Zero backend process restarts
- `xperiq_pglisten_connected` gauge remains 1 for the full duration
- Zero Redis `PUBLISH` errors

**Fail criteria:** Any P95 latency >1s, any WebSocket connection refused, backend OOM.

---

### LT-02: Redis Pub/Sub Fan-Out Storm

**Scenario:** One org receives a simulated bulk insert of 5,000 survey responses over 60 seconds (≈83 inserts/second, simulating a large panel survey launch). 20 WebSocket clients are connected to this org.

**Setup:**
- Insert 5,000 rows into `survey_responses` for the target org_id using a bulk insert script
- 20 WebSocket clients connected and listening on `org:{id}:responses`
- Monitor: debounce buffer size, WebSocket message count, backend memory

**Pass criteria:**
- All 20 clients receive at least 1 `response_received` message per 3-second debounce window (≈20 messages over 60 seconds)
- Backend process memory does not grow by more than 50 MB during the test
- No WebSocket client receives more than 25 messages (debounce is working)
- `orgTotals.responsesToday` in the final message matches the actual insert count
- Zero dropped `pg_notify` events (verify via `xperiq_pgnotify_received_total` count matches 5,000)

**Fail criteria:** Any client disconnected, memory growth >100 MB, any message with stale `responsesToday` count.

---

### LT-03: Materialized View Refresh Under Concurrent Read Load

**Scenario:** While `REFRESH MATERIALIZED VIEW CONCURRENTLY org_metrics_daily` is running (manually triggered), 100 concurrent clients continuously poll `GET /api/org/dashboard` and `GET /api/org/dashboard/trends?range=30d`.

**Setup:**
- Seed `survey_responses` with 10M rows across 100 orgs to make the refresh take >30 seconds
- Expire all Redis cache keys for all 100 orgs before starting
- Trigger `REFRESH MATERIALIZED VIEW CONCURRENTLY org_metrics_daily` manually
- Immediately start 100 concurrent REST clients polling at 1 request/second each

**Pass criteria:**
- Zero 500 errors during the refresh window
- Zero requests blocked for more than 2 seconds waiting for the refresh lock
- Postgres connection count never exceeds 80% of `max_connections`
- A second `REFRESH MATERIALIZED VIEW CONCURRENTLY org_metrics_daily` triggered during the first refresh completes without deadlock (may queue, but must not error)

**Fail criteria:** Any 500 errors, any Postgres connection count >80% of max, any deadlock error in Postgres logs.

---

### LT-04: WebSocket Reconnection Storm (Post-Deploy Simulation)

**Scenario:** 2,000 WebSocket clients are connected. The backend is sent `SIGTERM` to simulate a Fly.io rolling deploy. All clients attempt to reconnect simultaneously to the new backend instance.

**Setup:**
- 2,000 WebSocket clients across 100 orgs (20 per org), all holding open connections
- Trigger `SIGTERM` on the backend process
- Measure time from first disconnect to 95% of clients reconnected and authenticated

**Pass criteria (without RISK-06 fix):**
- Backend survives the reconnect burst without OOM or restart
- 95% of clients reconnect within 30 seconds
- Clerk token verification error rate during reconnect: <1%

**Pass criteria (with RISK-06 fix — pre-drain + jitter):**
- Backend sends `server_drain` message before shutdown
- 95% of clients reconnect within 20 seconds (staggered by jitter)
- Zero backend errors during reconnect burst
- Peak reconnect rate: <500 handshakes/10s

**Fail criteria:** Backend OOM, backend restart loop triggered by Fly.io health checks, >5% of clients failing to reconnect within 60 seconds.

---

### LT-05: Crystal Brief Generation Under Concurrent Org Load

**Scenario:** The weekly Crystal brief job runs for 100 orgs simultaneously. Each brief generation calls CrystalOS `/graphs/org-brief`. Simulate org sizes: 10 orgs with 500+ surveys each (large), 40 orgs with 50 surveys each (medium), 50 orgs with 10 surveys each (small).

**Setup:**
- Seed `org_metrics_weekly`, `survey_health_summary`, `org_topic_trends` with realistic data for all 100 orgs
- Trigger the backend `crystal-brief.job.ts` scheduler manually
- Monitor CrystalOS concurrency, LLM API latency, and `org_crystal_briefs` upsert rate

**Pass criteria:**
- All 100 briefs complete within 15 minutes
- Zero context-length errors for any org (validates RISK-05 fix)
- `org_crystal_briefs` has a current-week row for all 100 orgs after completion
- CrystalOS process memory does not exceed 2 GB during the run
- P95 brief generation time for large orgs (500 surveys): <120 seconds
- `xperiq_crystal_brief_generation_failed_total` remains at 0

**Fail criteria:** Any context-length error, any org missing a brief after 15 minutes, CrystalOS process OOM.

---

## Appendix: Quick Reference — Key File Locations

| Concern | File/Location |
|---------|---------------|
| WebSocket server | `backend/src/services/org-realtime.service.ts` |
| Crystal brief scheduler | `backend/src/jobs/crystal-brief.job.ts` |
| CrystalOS brief graph | `crystalos/graphs/org_brief_graph.py` |
| Materialized view migrations | `supabase/migrations/20260101000001_org_metrics_daily.sql` through `20260101000006_survey_health_summary.sql` |
| Crystal briefs table | `supabase/migrations/20260101000007_org_crystal_briefs.sql` |
| Health score table | `supabase/migrations/20260101000004_org_health_score.sql` |
| Topic trends table | `supabase/migrations/20260101000003_org_topic_trends.sql` |
| pg_notify trigger | `notify_response_inserted()` function on `survey_responses` INSERT |
| Redis key patterns | See Architecture §Redis Caching Layer |

---

*This review was conducted against the architecture document snapshot dated 2026-06-29. Any changes to `org-realtime.service.ts`, `org_brief_graph.py`, the pg_cron schedule, or the materialized view definitions require a re-review of affected risk items.*

*Architecture changes require sign-off from Dariusz Kowalski and Jordan Whitfield per the architecture document.*
