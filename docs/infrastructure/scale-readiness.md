# Scale Readiness

How Experient scales — what's in place now, and the path to "super scale." Pairs with
`observability.md` (metrics/health) and `scheduled-jobs.md` (background work).

## Topology — what runs, and how it scales

| Component | Stateless? | Scale model | Notes |
|---|---|---|---|
| **Backend API** (`:3001`) | Yes | Horizontal — N replicas behind a LB | Health: `/api/health/live` (liveness) + `/api/health/ready` (DB-gated readiness). No sticky sessions. |
| **CrystalOS** (`:8001`) | Yes (per request) | Horizontal — N replicas | LLM work; scale on CPU/latency. Scraped at `/metrics`. |
| **Event Engine** | Single (stream consumer + cron) | 1 instance (or in-process) | Notification stream + scheduled workflows/alerts. Not leader-elected → run one. |
| **Scheduler** (`:8090`) | **Now HA** | **N replicas, leader-elected** | Postgres advisory lock → exactly one runs jobs; standby takes over on failover. |
| **Postgres** | — | Vertical → pooling → read replicas | The shared system of record; the scaling pressure point (below). |
| **Redis** | — | Vertical → cluster | Rate limits, caches, streams, **credit balance cache**. |

## The credit hot path is now off Postgres

Every Crystal turn and every credits-chip render used to do 2–3 Postgres queries
(`checkCredits` → `getBalance`). At super scale that's the bottleneck. Now:

- `getBalance` reads a **Redis cache** (`credits:{org}`, 10s TTL, fail-open). Misses fall back
  to Postgres and repopulate. `CREDIT_BALANCE_CACHE_TTL=0` disables it.
- **Correctness is preserved:** debits never read the cache — `debitCredits` uses
  `SELECT … FOR UPDATE` and re-checks authoritatively, so a stale cached pre-check can never
  cause an incorrect charge. Every mutation (debit/grant/plan/overage/reset) invalidates the key.
- Net effect: the read-heavy path scales on Redis (O(1), in-memory) instead of Postgres.

## Postgres at super scale (the main pressure point)

1. **Connection pooling.** Many API + CrystalOS + scheduler replicas × pool size will exhaust
   Postgres connections. Put **PgBouncer** (transaction pooling) in front; point `DATABASE_URL`
   at it. On Supabase, use the pooled connection string.
2. **Credit ledger growth — DONE.** `credit_ledger` is now **monthly range-partitioned** by
   `created_at` (migration `20260625000002`), with a DEFAULT catch-all so inserts never fail.
   The scheduler's `credit-ledger-maintenance` job provisions 3 months ahead and drops partitions
   older than `CREDIT_LEDGER_RETENTION_MONTHS` (default 18) in O(1) via `DROP TABLE` — no expensive
   DELETEs, and queries prune to the relevant month(s). (Conversion auto-runs only on an empty
   table; a populated table is left alone with a NOTICE — convert it in a maintenance window.)
3. **Read replicas.** Route heavy read-only analytics (usage summaries, dashboards) to a replica;
   keep writes + `FOR UPDATE` debits on the primary.
4. **Hot-row contention.** Per-org debit uses a row lock (`FOR UPDATE`) — fine (per-org, not
   global). A single org doing thousands of concurrent debits/sec would serialize; acceptable,
   and the cache absorbs the reads.

## Background work scales via leader election

The scheduler can now run as **multiple replicas** for HA: one holds a Postgres advisory lock and
runs jobs; the rest stand by and take over automatically if the leader dies (the lock releases on
connection close — no split-brain, no double-runs). `scheduler_is_leader` + the `SchedulerNoLeader`
alert make leadership observable. To scale a single job's *throughput*, parallelize within the job
rather than adding leaders. Disable election (single instance) with `SCHEDULER_LEADER_ELECTION=false`.

## Observability at scale

- All services scraped (api, crystalos, scheduler, node-exporter, cadvisor) → Prometheus → Grafana.
- **Alertmanager** wired (`:9093`) for routing/grouping/dedup/inhibition — drop in a Slack/PagerDuty
  receiver in `monitoring/alertmanager.yml`.
- **Heartbeats** on every scheduler (`scheduler_heartbeat_timestamp{component}`) → a dead/forgotten
  scheduler pages instead of silently stopping.
- **Metric cardinality is bounded** — credit/scheduler metrics label only on small enums
  (action, source, result, component, job), never on org/user — safe at any tenant count.
- **Ledger integrity** continuously checked (`credit_invariant_violations` + alert) and **COGS/credit**
  tracked (`credit_cogs_per_credit_usd`) — the Cost-Down Dividend feed.

## Rate limiting / abuse

Per-org API (`apiLimiter`, 500/15m) and AI (`aiLimiter`, 30/15m) limits are Redis-backed; multi-
instance correct as long as `REDIS_URL` is set (in-memory fallback is single-instance only). Credit
spend caps + the new-account daily cap bound runaway AI cost.

## Status

**Done:** stateless web tier, readiness/liveness split, scheduler HA via leader election, credit
balance cache, bounded metrics, Alertmanager wiring, ledger-integrity + COGS reconciliation jobs.

**Next for super scale (documented, not yet built):**
- PgBouncer in front of Postgres; pooled `DATABASE_URL`.
- Read replica routing for analytics reads.
- Alertmanager receivers (Slack/PagerDuty) — wiring done, destination TODO.
- Autoscaling policies (Fly.io) for API + CrystalOS on CPU/latency.
- Move credit-pack billing fully onto a billing platform (Lago/Metronome) when volume warrants.
