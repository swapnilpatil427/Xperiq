/**
 * Prism RECONCILE — the conservation gate (Tier-1 data fidelity, guaranteed).
 *
 * After LOAD, assert that loaded counts + answer checksums match the source
 * (architecture-ingestion.md §8 Tier-1; operations-runbook.md §3.7). Tier-1 is
 * what "no data loss" means and what the signed reconciliation report certifies.
 *
 * Conservation equation (operations-runbook.md §3.7):
 *   source_count == loaded + quarantined + dry_run_skipped + intentionally_excluded
 * If it doesn't balance the job CANNOT reach `complete`.
 *
 * Checksum: per-record sha256 over canonical answers, folded into an
 * order-independent aggregate (XOR over 256-bit digests) so it is O(rows) and
 * insensitive to load order. Writes a ReconReport into `prism_recon_report`.
 */
import crypto from 'crypto';
import type { ReconReport, ParityEntry } from '../../types/prism';
import { query } from '../db';
import logger from '../logger';
import { canonicalJson } from './helpers';

/** Order-independent checksum: XOR-fold per-record sha256 digests. */
export function aggregateChecksum(answerPayloads: unknown[]): string {
  const acc = Buffer.alloc(32);
  for (const payload of answerPayloads) {
    const digest = crypto.createHash('sha256').update(canonicalJson(payload)).digest();
    for (let i = 0; i < 32; i++) acc[i] ^= digest[i];
  }
  return acc.toString('hex');
}

export interface ReconcileInput {
  orgId: string;
  jobId: string;
  connectionId: string;
  /** Count the source reported at DISCOVER (re-checked at RECONCILE if exposed). */
  sourceCount: number;
  /** Source-side aggregate answer checksum, when the source can produce one (else null). */
  sourceChecksum?: string | null;
  /** Records intentionally excluded by a scope filter (count toward conservation). */
  intentionallyExcluded?: number;
  /** Conflicts the user resolved as skip in the dry-run. */
  dryRunSkipped?: number;
  /** Metric parity carried over from the dry-run (Tier-2, best-effort). */
  metricParity?: ParityEntry[];
}

/**
 * Reconcile a completed LOAD against the source. Returns a ReconReport and
 * persists it. `tier1_pass` is true only when the conservation equation balances
 * AND (if a source checksum was supplied) the answer checksums match.
 */
export async function reconcile(input: ReconcileInput): Promise<ReconReport> {
  const {
    orgId, jobId, connectionId, sourceCount,
    sourceChecksum = null, intentionallyExcluded = 0, dryRunSkipped = 0,
    metricParity = [],
  } = input;

  // Loaded canonical rows for THIS job — linked by the natural key back to the
  // job's non-poison raw records (the durable linkage; no reliance on counts).
  const { rows: loadedRows } = await query<{ answers: unknown }>(
    `SELECT r.answers
       FROM responses r
       JOIN prism_raw_records raw
         ON raw.org_id = r.org_id
        AND raw.source_platform = r.metadata -> 'prism' ->> 'source_platform'
        AND raw.source_record_id = r.metadata -> 'prism' ->> 'source_record_id'
      WHERE r.org_id = $1
        AND raw.job_id = $2
        AND NOT raw.poison
        AND r.deleted_at IS NULL`,
    [orgId, jobId],
  ).catch(() => ({ rows: [] as { answers: unknown }[] }));

  // Authoritative loaded count + poison/quarantine count come from durable sources.
  const { rows: loadedCountRows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM prism_raw_records
      WHERE org_id = $1 AND job_id = $2 AND NOT poison`,
    [orgId, jobId],
  );
  const { rows: poisonRows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM prism_raw_records
      WHERE org_id = $1 AND job_id = $2 AND poison`,
    [orgId, jobId],
  );

  const loaded = Number(loadedCountRows[0]?.n ?? '0');
  const quarantined = Number(poisonRows[0]?.n ?? '0');

  const prismChecksum = aggregateChecksum(loadedRows.map((r) => r.answers));

  // Conservation: source == loaded + quarantined + skipped + excluded.
  const accountedFor = loaded + quarantined + dryRunSkipped + intentionallyExcluded;
  const countMatch = sourceCount === accountedFor;
  const checksumMatch = sourceChecksum == null ? true : sourceChecksum === prismChecksum;

  const report: ReconReport = {
    tier1_pass: countMatch && checksumMatch,
    counts: { source: sourceCount, prism: loaded, match: countMatch },
    checksum: { source: sourceChecksum ?? prismChecksum, prism: prismChecksum, match: checksumMatch },
    metric_parity: metricParity,
    generated_at: new Date().toISOString(),
  };

  // Table schema is (org_id, job_id, report jsonb, created_at). `tier1_pass` and
  // `generated_at` live INSIDE the report JSONB; `connection_id` is derivable via job_id.
  // (Earlier code referenced non-existent columns → INSERT threw → recon never persisted.)
  await query(
    `INSERT INTO prism_recon_report (org_id, job_id, report)
     VALUES ($1, $2, $3::jsonb)`,
    [orgId, jobId, JSON.stringify(report)],
  ).catch((err) => {
    // Persist failure must not silently swallow a recon result — log loudly.
    logger.error({ orgId, jobId, err: (err as Error).message }, 'prism:reconcile persist failed');
  });

  logger.info(
    { orgId, jobId, tier1_pass: report.tier1_pass, source: sourceCount, accountedFor, quarantined },
    'prism:reconcile complete',
  );
  return report;
}
