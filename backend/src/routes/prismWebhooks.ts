/**
 * Prism — CDC webhook ingress: `/webhooks/prism/:connectionId`.
 *
 * The ONLY inbound write path not behind Clerk (security-compliance.md §3.6) — hardened
 * accordingly. Mounted with `express.raw()` (wildcard MIME) BEFORE `express.json()` in
 * index.ts so the raw bytes survive for HMAC verification (Clerk/Stripe pattern).
 *
 * Controls (security-compliance.md §3.6):
 *  - HMAC-SHA-256 over the RAW request bytes; `crypto.timingSafeEqual` (length-checked first).
 *  - PER-TENANT key binding: the signing secret is selected by `connection_id` from the URL,
 *    resolved server-side to its `org_id` — a signature valid for one tenant is invalid for
 *    another. The `org_id` is NEVER trusted from the payload.
 *  - Timestamp tolerance (±300s) + nonce replay reject (engine; Redis-backed) before enqueue.
 *  - The webhook body only ENQUEUES an extraction job keyed by `connection_id`; payload
 *    values never become a fetch URL/host (no SSRF via content).
 *
 * Verification + enqueue are delegated to the engine's `sync/webhook` path
 * (`../lib/prism/engine`), built in parallel — calls are `// TODO(verify)`.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { query } from '../lib/db';
import logger from '../lib/logger';
import { secretManager } from '../lib/prism/secretManager';
import { prismRecordsTotal } from '../lib/prism/metrics';
import * as engine from '../lib/prism/engine';
import { toRawRecord } from '../lib/prism/helpers';
import type { RawRecord } from '../types/prism';

const router = express.Router();

/** Constant-time signature compare (length-checked first; never `===` on signatures). */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

// POST /webhooks/prism/:connectionId — verify HMAC on raw body, then enqueue (CDC ingress).
router.post('/:connectionId', async (req: Request, res: Response): Promise<void> => {
  const connectionId = req.params.connectionId;
  // req.body is a Buffer (express.raw). Never parse before verifying.
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

  try {
    // Resolve connection → org_id + webhook secret ref SERVER-SIDE (never from payload).
    const { rows: [conn] } = await query<{ org_id: string; webhook_secret_ref: string | null; platform: string }>(
      `SELECT s.org_id, s.webhook_secret_ref, c.platform
       FROM prism_sync_state s
       JOIN prism_connections c ON c.id = s.connection_id
       WHERE s.connection_id=$1 AND c.deleted_at IS NULL
       LIMIT 1`,
      [connectionId],
    );

    // Unknown/deleted connection → 404 (no oracle; do not reveal tenant existence).
    if (!conn) { res.status(404).end(); return; }
    const orgId = conn.org_id;

    // Per-tenant signing secret (envelope-stored, referenced by webhook_secret_ref).
    if (!conn.webhook_secret_ref) {
      logger.warn({ connectionId }, 'prism:webhook:no_secret_configured');
      res.status(404).end();
      return;
    }
    let signingSecret: string;
    try {
      signingSecret = await secretManager.getSecret(orgId, conn.webhook_secret_ref);
    } catch (secErr) {
      logger.error({ connectionId, err: (secErr as Error).message }, 'prism:webhook:secret_resolve_failed');
      res.status(401).end();
      return;
    }

    // HMAC-SHA-256 over the raw bytes; signature from a provider header.
    const provided = (req.headers['x-prism-signature']
      ?? req.headers['x-hub-signature-256']
      ?? req.headers['x-signature']) as string | undefined;
    if (!provided) { res.status(401).end(); return; }

    const expected = createHmac('sha256', signingSecret).update(rawBody).digest('hex');
    // Accept either bare hex or `sha256=<hex>` shapes; compare constant-time.
    const providedHex = provided.startsWith('sha256=') ? provided.slice(7) : provided;
    if (!safeEqualHex(providedHex, expected)) {
      logger.warn({ connectionId }, 'prism:webhook:bad_signature');
      res.status(401).end();
      return;
    }

    // Verified. Hand off to the engine for timestamp-tolerance + nonce-replay dedupe +
    // enqueue onto the per-connection extract queue (ingress = 'webhook').
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString('utf8'));
      } catch {
        parsed = { raw: rawBody.toString('utf8') };
      }
      const envelope = (parsed && typeof parsed === 'object' ? parsed : { payload: parsed }) as Record<string, unknown>;
      const sourceRecordId = String(
        envelope.id ?? envelope.event_id ?? envelope.record_id
          ?? createHash('sha256').update(rawBody).digest('hex').slice(0, 32),
      );
      const records: RawRecord[] = [
        toRawRecord({
          org_id: orgId,
          job_id: '',
          connection_id: connectionId,
          source_platform: conn.platform,
          record_type: 'response',
          source_record_id: sourceRecordId,
          payload: parsed,
          ingress: 'webhook',
          poison: false,
          source_observed_at: typeof envelope.timestamp === 'string' ? envelope.timestamp : null,
        }),
      ];
      await engine.handleWebhook(orgId, connectionId, records);
      prismRecordsTotal.inc({ stage: 'extract', source: conn.platform, org: orgId }, records.length);
    } catch (engErr) {
      // Verified-but-engine-unavailable: 503 so the provider retries (at-least-once capture;
      // EXTRACT dedupe makes the retry safe).
      logger.error({ connectionId, orgId, err: (engErr as Error).message }, 'prism:webhook:enqueue_failed');
      res.status(503).end();
      return;
    }

    // Idempotent 200 (a replayed/duplicate webhook is acknowledged without re-enqueue).
    res.status(200).json({ received: true });
  } catch (err: unknown) {
    logger.error({ connectionId, err: (err as Error).message }, 'prism:webhook:error');
    res.status(400).end();
  }
});

export default router;
