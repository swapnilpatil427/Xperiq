/**
 * Prism — Prometheus metrics.
 *
 * Registers Prism pipeline metrics on the repo's SHARED prom-client registry
 * (`../../metrics` → `register`) so `/api/metrics` scrapes them alongside HTTP/AI/DB
 * metrics. Follows the metrics.ts pattern exactly: `new client.X({ ..., registers: [register] })`.
 *
 * Label discipline (security-compliance.md §1, §10): labels carry ONLY `operational`
 * data — `stage`, `source` (source_platform), `org` (org_id), `result`. NEVER content/PII.
 * `org` is bounded by tenant count; do not add unbounded labels (record ids, urls, …).
 *
 * Metric set per architecture-ingestion.md §10 ("Observability"):
 *   prism_records_total{stage,source,org}     — records processed per stage
 *   prism_stage_duration_seconds{stage,source}— time-in-stage
 *   prism_source_429_total{source,org}        — source rate-limit hits (sustained-429 alert)
 *   prism_recon_mismatch_total{source,org}    — reconciliation mismatches (Tier-1 fidelity)
 *   prism_enrich_lag_seconds{source}          — re-enrichment lag (gauge)
 *   prism_queue_depth{stage,org}              — per-stage queue depth (gauge; backpressure)
 */
import * as client from 'prom-client';
import { register } from '../metrics';

// Records processed, partitioned by pipeline stage + source platform + tenant.
export const prismRecordsTotal = new client.Counter({
  name: 'prism_records_total',
  help: 'Prism records processed, by pipeline stage',
  labelNames: ['stage', 'source', 'org'] as const,
  registers: [register],
});

// Time-in-stage (extract/transform/load/…) — drives the "stuck job > SLO" alert.
export const prismStageDurationSeconds = new client.Histogram({
  name: 'prism_stage_duration_seconds',
  help: 'Prism per-stage processing duration in seconds',
  labelNames: ['stage', 'source'] as const,
  buckets: [0.1, 0.5, 1, 5, 15, 60, 300, 900, 3600],
  registers: [register],
});

// Source-side HTTP 429s — sustained rate → SourceRateLimited alert (§7 token bucket).
export const prismSource429Total = new client.Counter({
  name: 'prism_source_429_total',
  help: 'Count of HTTP 429 (rate-limit) responses from a source platform',
  labelNames: ['source', 'org'] as const,
  registers: [register],
});

// Reconciliation mismatches — Tier-1 data-fidelity failures (the hard GA gate, §8).
export const prismReconMismatchTotal = new client.Counter({
  name: 'prism_recon_mismatch_total',
  help: 'Count of reconciliation mismatches (counts/checksums vs source)',
  labelNames: ['source', 'org'] as const,
  registers: [register],
});

// Re-enrichment lag — how far ENRICH trails LOAD (decoupled enrichment tier, I5).
export const prismEnrichLagSeconds = new client.Gauge({
  name: 'prism_enrich_lag_seconds',
  help: 'Lag in seconds between a record being loaded and re-enriched',
  labelNames: ['source'] as const,
  registers: [register],
});

// Per-stage queue depth — backpressure signal (§10 high/low watermark hysteresis).
export const prismQueueDepth = new client.Gauge({
  name: 'prism_queue_depth',
  help: 'Current depth of a Prism per-stage work queue',
  labelNames: ['stage', 'org'] as const,
  registers: [register],
});
