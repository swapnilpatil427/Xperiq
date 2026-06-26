/**
 * Pipeline state machine for support doc ingestion.
 *
 * States:
 *   queued -> extracting -> drafting -> quality_check ->
 *   { auto_approved | pending_review | requires_annotation | rejected } ->
 *   publishing -> live -> stale -> queued (loop)
 *
 * Every transition is validated against ALLOWED_TRANSITIONS, atomically
 * written to support_docs, and logged to support_pipeline_events.
 */

import { query } from './db';
import { supportDocsPipelineTransitionsTotal } from './metrics';
import logger from './logger';

// ── Allowed transitions ───────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  queued:               ['extracting'],
  extracting:           ['drafting'],
  drafting:             ['quality_check'],
  quality_check:        ['auto_approved', 'pending_review', 'requires_annotation', 'rejected'],
  auto_approved:        ['publishing'],
  pending_review:       ['publishing', 'rejected'],
  requires_annotation:  ['pending_review', 'rejected'],
  rejected:             ['queued'],
  publishing:           ['live'],
  live:                 ['stale'],
  stale:                ['queued'],
};

// ── Score routing ─────────────────────────────────────────────────────────────

/**
 * Map a quality score (0-1) to the appropriate post-quality_check pipeline status.
 */
function scoreToStatus(score: number): 'auto_approved' | 'pending_review' | 'requires_annotation' | 'rejected' {
  if (score >= 0.90) return 'auto_approved';
  if (score >= 0.75) return 'pending_review';
  if (score >= 0.65) return 'requires_annotation';
  return 'rejected';
}

// ── Deadline helper ───────────────────────────────────────────────────────────

/**
 * Calculate the auto-approve deadline for a given status.
 * Only `pending_review` gets a 2-hour window; all others return null.
 */
function calcAutoApproveDeadline(status: string): Date | null {
  return status === 'pending_review'
    ? new Date(Date.now() + 2 * 60 * 60 * 1000)
    : null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * Get the current pipeline_status of a doc.
 * Accepts an optional pool/client with a `.query()` method for testability.
 */
async function getDocStatus(docId: string, poolOrClient?: { query: QueryFn }): Promise<string | null> {
  const queryFn = poolOrClient ? poolOrClient.query.bind(poolOrClient) : query;
  const { rows } = await (queryFn as typeof query)<{ pipeline_status: string }>(
    `SELECT pipeline_status FROM support_docs WHERE id = $1 AND deleted_at IS NULL`,
    [docId],
  );
  return rows[0]?.pipeline_status ?? null;
}

// ── Custom error ──────────────────────────────────────────────────────────────

class InvalidTransitionError extends Error {
  code: string;
  constructor(from: string, to: string) {
    super(`Pipeline transition not allowed: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
    this.code = 'INVALID_PIPELINE_TRANSITION';
  }
}

// ── Core transition ───────────────────────────────────────────────────────────

interface TransitionOptions {
  actorType?: 'system' | 'admin' | 'crystal';
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  pool?: { query: QueryFn };
}

/**
 * Validate and apply a pipeline status transition.
 *
 * 1. Read current status from DB.
 * 2. Verify the transition is in ALLOWED_TRANSITIONS.
 * 3. UPDATE support_docs (pipeline_status, updated_at, auto_approve_deadline).
 * 4. INSERT into support_pipeline_events.
 * 5. Emit Prometheus counter.
 */
async function transitionDoc(docId: string, toStatus: string, options: TransitionOptions = {}): Promise<void> {
  const { actorType = 'system', actorId = null, metadata = {}, pool: poolOverride } = options;

  const queryFn = poolOverride ? (poolOverride.query.bind(poolOverride) as typeof query) : query;

  const currentStatus = await getDocStatus(docId, poolOverride);

  if (currentStatus === null) {
    throw new Error(`support_docs row not found: ${docId}`);
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new InvalidTransitionError(currentStatus, toStatus);
  }

  const deadline = calcAutoApproveDeadline(toStatus);

  // Atomically update the doc row
  await queryFn(
    `UPDATE support_docs
        SET pipeline_status       = $1,
            updated_at            = NOW(),
            auto_approve_deadline = $2
      WHERE id = $3
        AND deleted_at IS NULL`,
    [toStatus, deadline, docId],
  );

  // Append an audit event
  await queryFn(
    `INSERT INTO support_pipeline_events
       (doc_id, from_status, to_status, actor_type, actor_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
    [
      docId,
      currentStatus,
      toStatus,
      actorType,
      actorId,
      JSON.stringify(metadata),
    ],
  );

  // Prometheus counter
  supportDocsPipelineTransitionsTotal.inc({
    from_status: currentStatus,
    to_status:   toStatus,
    actor_type:  actorType,
  });

  logger.info(
    { docId, from: currentStatus, to: toStatus, actorType, actorId },
    'pipeline: transition applied',
  );
}

export {
  ALLOWED_TRANSITIONS,
  scoreToStatus,
  calcAutoApproveDeadline,
  getDocStatus,
  transitionDoc,
  InvalidTransitionError,
};
