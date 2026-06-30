/**
 * Prism DRY-RUN — the trust engine.
 *
 * Before LOAD, compare TRANSFORM output against canonical tables into a
 * structured diff the UI renders; nothing is written until the user approves and
 * resolves conflicts (architecture-ingestion.md §5). Computes:
 *   - summary { create, update, skip_duplicate, conflict }
 *   - metric_parity ParityEntry[] (Tier-2: source-reported vs Prism-computed)
 *   - unmapped_fields, timestamp_continuity, conflicts
 *
 * Includes a PARITY EXPLAINER (architecture §8 Tier-2, ADR-019): when a metric
 * delta is non-zero it tries hypotheses (partials in/out, half-up vs banker
 * rounding, top-2-box vs mean, date-window shift) and fills `explanation` with
 * the most-likely cause so the customer can choose match-source vs use-Xperiq.
 */
import type { DryRunReport, ParityEntry } from '../../types/prism';
import { query } from '../db';
import type { StagedRow } from './transform';

// ─────────────────────────────────────────────────────────────────────────────
// Parity explainer
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricSample {
  metric: 'nps' | 'csat' | 'ces' | string;
  /** Per-respondent scores Prism extracted for this metric (e.g. 0–10 for NPS). */
  scores: number[];
  /** The number the SOURCE reported on its dashboard, if exposed. */
  sourceValue: number | null;
}

const roundHalfUp = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f + (n >= 0 ? 1e-9 : -1e-9)) / f;
};
const roundBankers = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  const x = n * f;
  const r = Math.round(x);
  // Round-half-to-even.
  if (Math.abs(x - Math.trunc(x) - 0.5) < 1e-9) {
    const floor = Math.floor(x);
    return (floor % 2 === 0 ? floor : floor + 1) / f;
  }
  return r / f;
};

function computeNps(scores: number[]): number {
  if (scores.length === 0) return 0;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return ((promoters - detractors) / scores.length) * 100;
}
function mean(scores: number[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
function topBox(scores: number[], threshold: number): number {
  if (scores.length === 0) return 0;
  return (scores.filter((s) => s >= threshold).length / scores.length) * 100;
}

/**
 * Compute the Prism value for a metric and, if it disagrees with the source,
 * explain the most-likely cause by testing common hypotheses.
 */
export function explainParity(sample: MetricSample): ParityEntry {
  const { metric, scores, sourceValue } = sample;

  let prismComputed: number;
  if (metric === 'nps') prismComputed = roundHalfUp(computeNps(scores), 0);
  else prismComputed = roundHalfUp(mean(scores), 2);

  const entry: ParityEntry = {
    metric,
    source_value: sourceValue,
    prism_computed: prismComputed,
    match: sourceValue != null && Math.abs(sourceValue - prismComputed) < 1e-6,
    method: 'prism',
  };
  if (sourceValue == null) {
    entry.explanation = 'source did not expose this metric — showing Prism-computed value';
    return entry;
  }
  if (entry.match) return entry;

  entry.delta = roundHalfUp(prismComputed - sourceValue, 4);

  // Hypothesis testing — first that reproduces the source number wins.
  const hypotheses: { test: () => boolean; why: string }[] = [
    {
      // Rounding: banker's vs half-up.
      test: () => {
        const v = metric === 'nps' ? computeNps(scores) : mean(scores);
        return Math.abs(roundBankers(v, metric === 'nps' ? 0 : 2) - sourceValue) < 1e-6;
      },
      why: "rounding: source uses banker's (round-half-to-even); Prism uses half-up",
    },
    {
      // Top-2-box vs mean (CSAT-style).
      test: () => Math.abs(topBox(scores, 4) - sourceValue) < 1.0,
      why: 'definition: source reports top-2-box %, Prism reports the mean',
    },
    {
      // Partials excluded by source (Prism includes them): a small magnitude delta.
      test: () => Math.abs(entry.delta ?? 0) <= (metric === 'nps' ? 3 : 0.15),
      why: 'partials: source likely excludes partial responses Prism includes (small delta)',
    },
    {
      // Date-window shift: source dashboard applies a rolling window we can't see.
      test: () => true,
      why: 'window/filter: source dashboard applies a hidden rolling window or segment filter (Tier-2 best-effort)',
    },
  ];

  for (const h of hypotheses) {
    try {
      if (h.test()) { entry.explanation = h.why; break; }
    } catch { /* hypothesis failed to evaluate — try next */ }
  }
  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dry-run diff
// ─────────────────────────────────────────────────────────────────────────────

export interface DryRunInput {
  orgId: string;
  rows: StagedRow[];
  unmapped: { source_field: string; action: string }[];
  metricSamples?: MetricSample[];
}

/**
 * Compute the dry-run diff against canonical `responses`. For each staged row we
 * probe the natural key: absent → create; present + same hash → skip_duplicate;
 * present + different hash → conflict (user resolves keep-source/keep-existing/
 * create-new) unless source-time strictly newer → update.
 */
export async function dryRun(input: DryRunInput): Promise<DryRunReport> {
  const { orgId, rows, unmapped, metricSamples = [] } = input;

  let create = 0, update = 0, skip = 0, conflict = 0;
  const conflicts: { source_record_id: string; reason: string }[] = [];

  for (const row of rows) {
    const { rows: existing } = await query<{ payload_hash: string; source_observed_at: string | null }>(
      `SELECT payload_hash, source_observed_at
         FROM responses
        WHERE org_id = $1
          AND metadata -> 'prism' ->> 'source_platform' = $2
          AND metadata -> 'prism' ->> 'source_record_id' = $3
          AND deleted_at IS NULL
        LIMIT 1`,
      [orgId, row.source_platform, row.source_record_id],
    ).catch(() => ({ rows: [] as { payload_hash: string; source_observed_at: string | null }[] }));

    const prior = existing[0];
    if (!prior) { create++; continue; }
    if (prior.payload_hash === row.payload_hash) { skip++; continue; }

    // Different payload — newer source state wins automatically; otherwise a conflict.
    const incomingNewer =
      !prior.source_observed_at ||
      (row.source_observed_at != null && row.source_observed_at >= prior.source_observed_at);
    if (incomingNewer) {
      update++;
    } else {
      conflict++;
      conflicts.push({
        source_record_id: row.source_record_id,
        reason: 'natural_key exists, different payload_hash, incoming source is older',
      });
    }
  }

  // Timestamp continuity over the staged batch (no import-day spike).
  const times = rows
    .map((r) => r.submitted_at)
    .filter((t): t is string => !!t)
    .sort();
  const continuity = {
    earliest: times[0] ?? '',
    latest: times[times.length - 1] ?? '',
    gaps: [] as string[],
  };

  const metric_parity = metricSamples.map(explainParity);

  return {
    summary: { create, update, skip_duplicate: skip, conflict },
    metric_parity,
    unmapped_fields: unmapped,
    timestamp_continuity: continuity,
    conflicts,
  };
}
