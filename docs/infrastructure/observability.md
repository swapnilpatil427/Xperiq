# Observability — metrics, health, machine monitoring

How Experient is monitored for **availability, speed, and machine health**, what's
collected, and how to view it.

## The stack (local + self-hosted)

`docker-compose up` brings up the monitoring plane:

| Service | Port | Role |
|---|---|---|
| Prometheus | :9090 | Scrapes metrics every 15s, evaluates alert rules |
| Alertmanager | :9093 | Routes/groups/dedups alerts → receivers (add Slack/PagerDuty in `monitoring/alertmanager.yml`) |
| Grafana | :3030 | Dashboards (anonymous viewer enabled; admin/admin) |
| Loki | :3100 | Log aggregation |
| node-exporter | (internal) | **Host** CPU / memory / disk / network |
| cadvisor | (internal) | **Per-container** cpu/mem/io |

In production on **Fly.io**, host/VM metrics come from Fly's built-in Prometheus
(`fly-metrics`); node-exporter/cadvisor are for local + self-hosted hosts.

## What Prometheus scrapes (`monitoring/prometheus.yml`)

- `experient-api` — backend `:3001/api/metrics`
- `crystalos` — agents `:8001/metrics` (LLM cost/tokens, tool calls, pipeline) — **newly wired**
- `node-exporter` — host machine health — **newly wired**
- `cadvisor` — per-container resources — **newly wired**
- `scheduler` — scheduler service `:8090/metrics` (heartbeat + per-job metrics) — **newly wired**

## Metrics collected

**Backend app** (`backend/src/lib/metrics.ts`): Node process (cpu/mem/event-loop),
`http_request_duration_seconds` + `http_requests_total` (rate/error/latency),
`ai_request_*` + `ai_tokens_total`, `db_query_duration_seconds`, business counters
(surveys/responses/insights).

**Credit system** (newly added):
| Metric | Type | Labels | Use |
|---|---|---|---|
| `credit_consumed_total` | counter | action, source | credits/sec burned per action; cost trend |
| `credit_granted_total` | counter | source | top-ups / resets / free grants |
| `credit_decisions_total` | counter | action, result(allowed\|denied) | **denial rate = customers hitting credit walls** |
| `credit_webhook_total` | counter | result(fulfilled\|duplicate\|unconfigured\|error) | Stripe fulfilment health |
| `credential_valid` | gauge | integration | 1=key authenticates, 0=invalid/revoked/expired (drives `CredentialInvalid`) |
| `credential_last_check_timestamp` | gauge | integration | last credential-health probe time (staleness = job not running) |
| `credential_days_to_expiry` | gauge | integration | days until key expiry when the provider exposes one (drives `CredentialExpiringSoon`) |

**CrystalOS** (`crystalos/lib/metrics.py`): `agent_calls_total`, `agent_duration_seconds`,
`agent_tokens_total`, `agent_cost_usd_total`, `orchestration_*`, `crystal_tool_calls_total`,
`scheduler_heartbeat_timestamp{component="crystalos_scheduler"}`.

**Schedulers** (`backend/src/lib/metrics.ts`, emitted by the Event Engine, scheduler service, and
CrystalOS): `scheduler_heartbeat_timestamp{component}` (liveness), `scheduler_is_leader` (HA),
`scheduler_job_runs_total{job,result}`, `scheduler_job_duration_seconds{job}`,
`scheduler_job_last_success_timestamp{job}`, plus `credit_invariant_violations` (ledger integrity)
and `credit_cogs_per_credit_usd` (Cost-Down Dividend feed). See `docs/infrastructure/scheduled-jobs.md`.

## Health endpoints (HA)

- `GET /api/health/live` — **liveness**: process is up; never touches dependencies (a DB blip won't trigger a restart loop).
- `GET /api/health` and `GET /api/health/ready` — **readiness**: Postgres is the hard dependency (503 if down → load balancer stops routing). Redis is reported but soft (the app fails open without it), so a Redis outage doesn't pull the instance.

## Alerts (`docker/prometheus/rules/`)

- `slo.yml`:
  - **availability** — `BackendDown` (crit), `CrystalOSDown` (warn)
  - **slo** — `HighHTTPErrorRate` (>5% 5xx), `HighRequestLatencyP95` (>1s p95)
  - **credits** — `CreditDenialSpike` (customers hitting walls), `StripeWebhookErrors`, `CreditInvariantViolation`
  - **credentials** — `CredentialInvalid` (key revoked/expired at runtime, crit), `CredentialExpiringSoon` (<14d, warn)
  - **host** — `HostHighCPU`, `HostLowMemory`, `HostDiskFillingUp`
  - **schedulers** — `SchedulerDown`, `SchedulerHeartbeatStale`, `CrystalSchedulerHeartbeatStale`
    (a forgotten/dead scheduler pages instead of silently stopping — see `scheduled-jobs.md`)
- `zombie_runs.yml` — stuck agent runs.

Rules are evaluated by Prometheus. To **route** alerts (Slack/email/PagerDuty), add an
Alertmanager service + receivers — not yet wired (alerts currently fire to Prometheus' own UI).

## Viewing it

```bash
docker-compose up -d
open http://localhost:9090        # Prometheus (targets, alerts, ad-hoc queries)
open http://localhost:3030        # Grafana (Experient dashboard)
curl http://localhost:3001/api/health | jq      # db + redis status
curl -s http://localhost:3001/api/metrics | grep credit_   # credit metrics
```

## Gaps / follow-ups

- **Grafana panels for credits** — the four `credit_*` metrics are scraped and queryable; add a
  "Credits" row to `monitoring/grafana/dashboards/experient.json` (or build in the UI).
- **Alertmanager** — wire receivers to actually notify.
- **CrystalOS COGS → Cost-Down Dividend** — `agent_cost_usd_total` is the COGS-per-credit feed;
  the periodic policy job that turns it into allowance increases is still TODO.
- **Distributed tracing** — metrics + logs exist; no trace propagation across backend↔CrystalOS yet.
