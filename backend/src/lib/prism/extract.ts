/**
 * Prism EXTRACT — append RawRecords to the lossless landing zone.
 *
 * One append-only raw log (`prism_raw_records`); bulk migration and continuous
 * sync are the SAME consumer at different offsets (ADR-022). Writes are
 * idempotent on UNIQUE (org_id, connection_id, record_type, source_record_id):
 * a webhook and a poll that observe the same source record collapse to one row.
 * The writer is HASH-AWARE — a re-observed but unchanged record is a no-op (we
 * only touch payload/hash/extracted_at when the hash actually changed), so
 * re-extraction never churns downstream change-detection (architecture §3, §5;
 * operations-runbook.md §2.8).
 *
 * Sets provenance: `ingress` (how it arrived), `source_observed_at` (the §4
 * monotonicity guard input), and `poison` (quarantine flag, default false).
 */
import type { RawRecord } from '../../types/prism';
import { query, pool } from '../db';
import logger from '../logger';
import { hashPayload } from './helpers';

export interface ExtractResult {
  inserted: number;   // brand-new raw rows
  updated: number;    // existing rows whose hash changed
  unchanged: number;  // hash-equal no-ops
}

const INSERT_RAW = `
  INSERT INTO prism_raw_records
    (org_id, job_id, connection_id, source_platform, record_type,
     source_record_id, payload, payload_hash, ingress, poison, source_observed_at, extracted_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11, now())
  ON CONFLICT (org_id, connection_id, record_type, source_record_id)
  DO UPDATE SET
    payload            = EXCLUDED.payload,
    payload_hash       = EXCLUDED.payload_hash,
    ingress            = EXCLUDED.ingress,
    source_observed_at = EXCLUDED.source_observed_at,
    extracted_at       = now()
  -- Only touch on a REAL change → unchanged re-observations are pure no-ops.
  WHERE prism_raw_records.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash
  RETURNING (xmax = 0) AS inserted
`;

/**
 * Idempotently append a batch of raw records. Each record must already carry
 * org_id / job_id / connection_id (the connector stamps these). `payload_hash`
 * is recomputed defensively so a connector can't desync it from `payload`.
 *
 * Runs in a single transaction (batch = unit of retry; ≤500 recommended).
 */
export async function appendRawRecords(records: RawRecord[]): Promise<ExtractResult> {
  if (records.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const rec of records) {
      const hash = hashPayload(rec.payload);
      const result = await client.query<{ inserted: boolean }>(INSERT_RAW, [
        rec.org_id,
        rec.job_id,
        rec.connection_id,
        rec.source_platform,
        rec.record_type,
        rec.source_record_id,
        JSON.stringify(rec.payload),
        hash,
        rec.ingress,
        rec.poison ?? false,
        rec.source_observed_at ?? null,
      ]);
      // No row returned → the WHERE guard suppressed the UPDATE (hash-equal no-op).
      if (result.rowCount && result.rows[0]) {
        if (result.rows[0].inserted) inserted++; else updated++;
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error(
      { err: (err as Error).message, count: records.length },
      'prism:extract appendRawRecords failed — batch rolled back',
    );
    throw err;
  } finally {
    client.release();
  }

  const unchanged = records.length - inserted - updated;
  logger.info(
    { inserted, updated, unchanged, batch: records.length },
    'prism:extract appended raw records',
  );
  return { inserted, updated, unchanged };
}

/**
 * Mark a raw record as poison (quarantine): excluded from TRANSFORM, surfaced in
 * the DLQ / dry-run, counted toward `partial`. The verbatim payload is retained
 * so a poison record is never lost — it is isolated, counted, and replayable
 * (architecture §4 "Poison-record handling").
 */
export async function markPoison(
  orgId: string,
  connectionId: string,
  recordType: string,
  sourceRecordId: string,
): Promise<void> {
  await query(
    `UPDATE prism_raw_records
        SET poison = true
      WHERE org_id = $1 AND connection_id = $2 AND record_type = $3 AND source_record_id = $4`,
    [orgId, connectionId, recordType, sourceRecordId],
  );
}

/**
 * Clear poison flags so records re-flow through TRANSFORM after a connector fix
 * or mapping edit — replay from raw, NO source re-hit (architecture §4 Recovery).
 */
export async function clearPoison(orgId: string, jobId: string, sourceRecordIds?: string[]): Promise<number> {
  const params: unknown[] = [orgId, jobId];
  let sql = `UPDATE prism_raw_records SET poison = false WHERE org_id = $1 AND job_id = $2 AND poison`;
  if (sourceRecordIds && sourceRecordIds.length) {
    params.push(sourceRecordIds);
    sql += ` AND source_record_id = ANY($3::text[])`;
  }
  const res = await query(sql, params);
  return res.rowCount ?? 0;
}
