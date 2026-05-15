"""Prometheus metrics for the agents service.

Exposes /metrics endpoint (scraped by the existing docker-compose Prometheus).
Tracks per-agent latency, token consumption, cost, and error rates.
"""
from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry

registry = CollectorRegistry(auto_describe=True)

# ── Per-agent call metrics ─────────────────────────────────────────────────────
agent_calls_total = Counter(
    "agent_calls_total",
    "Total agent invocations by agent name, model, and status",
    ["agent", "model", "status"],       # status: success | error | timeout | budget_exceeded
    registry=registry,
)

agent_duration_seconds = Histogram(
    "agent_duration_seconds",
    "Agent call duration in seconds",
    ["agent", "model"],
    buckets=[0.5, 1, 2, 5, 10, 20, 30, 60],
    registry=registry,
)

agent_tokens_total = Counter(
    "agent_tokens_total",
    "Total tokens consumed by direction (input/output) and agent",
    ["agent", "model", "direction"],    # direction: input | output
    registry=registry,
)

agent_cost_usd_total = Counter(
    "agent_cost_usd_total",
    "Cumulative USD cost of all agent LLM calls",
    ["agent", "model"],
    registry=registry,
)

# ── Orchestration run metrics ──────────────────────────────────────────────────
orchestration_runs_total = Counter(
    "orchestration_runs_total",
    "Total orchestration runs by type and final status",
    ["run_type", "status"],
    registry=registry,
)

orchestration_revision_count = Histogram(
    "orchestration_revision_count",
    "Number of Creator→QC revision loops per run",
    ["run_type"],
    buckets=[0, 1, 2],
    registry=registry,
)

orchestration_qc_score = Histogram(
    "orchestration_qc_score",
    "QC score distribution (0–10)",
    ["run_type"],
    buckets=[0, 2, 4, 5, 6, 7, 8, 9, 10],
    registry=registry,
)

# ── Circuit breaker state ──────────────────────────────────────────────────────
circuit_breaker_state = Gauge(
    "circuit_breaker_state",
    "Circuit breaker state: 0=closed, 1=open, 2=half-open",
    ["name"],
    registry=registry,
)
