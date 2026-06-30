/**
 * Prism — `/api/prism/*` router (ingestion engine API surface).
 *
 * Implements the contract in docs/otherplatforms/migration/engineering-plan.md §2:
 *   connections CRUD (+ discover), jobs create/list/get (+ pause/resume/cancel),
 *   continuous-sync register/status, mapping GET/PUT, dryrun GET + approve,
 *   reconciliation GET + report.
 *
 * Boundary (root CLAUDE.md "three layers"): this router is the BRIDGE + system of record.
 * It validates (Zod `.strict()`), enforces org scope, persists to Postgres, and drives the
 * engine (`../lib/prism/engine`) + connector registry. CrystalOS only PROPOSES (mapping /
 * parity); the backend executes on confirm and records outcomes.
 *
 * Security (security-compliance.md §2.4, §3.3):
 *  - `org_id` ALWAYS from `req.orgId` (Clerk token). NEVER from body/query/header.
 *  - Every lookup is composite `(id, org_id)`; a cross-org miss returns 404 (no oracle), not 403.
 *  - Soft-delete (`deleted_at`); parameterized queries only.
 *  - Secrets go to the secret manager; `credential_ref`/`status`/`org_id` are server-set,
 *    never returned to the client as raw secrets.
 *  - NUMERIC-safe JSON: Postgres NUMERIC/bigint come back as strings; `num()` coerces them.
 *
 * NOTE: the engine (`../lib/prism/engine`) and connector registry are built in PARALLEL
 * (engineering-plan.md §1). Calls into them are annotated `// TODO(verify)` where the final
 * signature is not yet pinned; until the engine lands these handlers surface a clear 502.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../lib/validate';
import { query } from '../lib/db';
import logger from '../lib/logger';
import { serverError, clientError } from '../lib/httpError';
import {
  createConnectionSchema,
  createJobSchema,
  confirmMappingSchema,
  approveSchema,
  registerSyncSchema,
} from '../schemas/prism';
import { secretManager } from '../lib/prism/secretManager';
import { prismRecordsTotal } from '../lib/prism/metrics';

// ── Engine + connector registry (built in parallel — engineering-plan.md §1) ──
// TODO(verify): finalize these import paths + signatures against the engine module when it
// lands. Sensible signatures assumed from architecture-ingestion.md §3 (stages) + §7 (SDK).
import * as engine from '../lib/prism/engine';
import * as registry from '../lib/prism/connectors';
import type { PrismConnector } from '../types/prism';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Connector catalog (gallery)
// GET /api/prism/connectors → { connectors: ConnectorMeta[] }  (non-secret metas)
// Powers the FE source gallery; the FE falls back to its bundled catalog if absent.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/connectors', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const connectors = typeof registry.listConnectorMetas === 'function' ? registry.listConnectorMetas() : [];
    res.json({ connectors });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'prism:list_connectors' });
  }
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Coerce a Postgres NUMERIC/bigint (returned as string) to a number; null-safe. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Deep-coerce known NUMERIC-ish fields inside a counts/stats blob. */
function coerceCounts(counts: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (counts && typeof counts === 'object') {
    for (const [k, v] of Object.entries(counts as Record<string, unknown>)) {
      const n = num(v);
      if (n !== null) out[k] = n;
    }
  }
  return out;
}

/** 502 helper when the engine/registry hasn't landed or rejected an engine call. */
function engineUnavailable(res: Response, err: unknown, ctx: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ ...ctx, err: message }, 'prism:engine_unavailable');
  res.status(502).json({ error: 'Prism engine is not available. Please try again shortly.' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Connections
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/prism/connections — verify creds (connector.authenticate), store credential_ref.
router.post('/connections', requireAuth, requireRole('analyst'), validate(createConnectionSchema), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { platform, authKind, mode, history_window, credentials, oauthCode, fileRef } =
      req.body as import('../schemas/prism').CreateConnectionInput;

    // Resolve the connector from the registry (legal posture, auth flow, manifest).
    let connector: unknown;
    try {
      // TODO(verify): registry.getConnector(platform) → PrismConnector
      connector = registry.getConnector(platform);
    } catch (regErr) {
      clientError(res, 400, `Unknown or unavailable platform: ${platform}`);
      logger.warn({ orgId, platform, err: (regErr as Error).message }, 'prism:unknown_connector');
      return;
    }
    if (!connector) { clientError(res, 400, `Unknown or unavailable platform: ${platform}`); return; }

    // Create the connection row first (pending_auth) so we have a connection_id for the
    // secret path (prism/{org}/conn/{connection_id}) and AAD binding.
    const { rows: [conn] } = await query<{ id: string }>(
      `INSERT INTO prism_connections
         (org_id, platform, label, auth_kind, status, mode, history_window, config, stats, created_by)
       VALUES ($1,$2,$3,$4,'pending_auth',$5,$6,'{}'::jsonb,'{}'::jsonb,$7)
       RETURNING id`,
      [orgId, platform, platform, authKind, mode, history_window ?? 3, req.userId],
    );
    const connectionId = conn.id;

    // Authenticate via the connector (CONNECT stage). The engine/connector exchanges the
    // OAuth code or validates the API key and returns the raw secret material to store —
    // the secret is NEVER persisted in Postgres nor returned to the client.
    let secretToStore: string | null = null;
    let connStatus = 'active';
    try {
      secretToStore = await (connector as PrismConnector).authenticate({
        orgId,
        authKind,
        apiKey:             credentials?.apiKey,
        serviceAccountJson: credentials?.serviceAccountJson,
        oauthCode,
        fileRef,
        extra:              credentials?.extra,
      });
    } catch (authErr) {
      // Mark the connection in error and surface a clean failure (no secret leakage).
      await query(
        `UPDATE prism_connections SET status='error', updated_at=NOW()
         WHERE id=$1 AND org_id=$2`,
        [connectionId, orgId],
      ).catch(() => {});
      engineUnavailable(res, authErr, { orgId, platform, op: 'authenticate' });
      return;
    }

    let credentialRef: string | null = null;
    if (secretToStore) {
      credentialRef = await secretManager.putSecret({ orgId, connectionId, secret: secretToStore });
    }

    await query(
      `UPDATE prism_connections
       SET credential_ref=$3, status=$4, updated_at=NOW()
       WHERE id=$1 AND org_id=$2`,
      [connectionId, orgId, credentialRef, connStatus],
    );

    // Canonical CreateConnectionResponse: return the full row as { connection } so the
    // FE has `connection.id` (+ status/mode/...). credential_ref is intentionally NOT
    // selected — the secret ref is never exposed to the client.
    const { rows: [connection] } = await query(
      `SELECT id, org_id, platform, label, auth_kind, status, mode, history_window,
              config, stats, created_by, created_at, updated_at, deleted_at
       FROM prism_connections WHERE id=$1 AND org_id=$2`,
      [connectionId, orgId],
    );
    res.status(201).json({ connection: connection ?? { id: connectionId } });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:create_connection' });
  }
});

// GET /api/prism/connections — list active connections (no secrets).
router.get('/connections', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, platform, label, auth_kind, status, mode, history_window, stats, created_at, updated_at
       FROM prism_connections
       WHERE org_id=$1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [req.orgId],
    );
    // credential_ref is intentionally NOT selected — never exposed to the client.
    res.json({ connections: rows });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId: req.orgId, route: 'prism:list_connections' });
  }
});

// DELETE /api/prism/connections/:id — revoke secret + soft-delete + cancel queued jobs.
router.delete('/connections/:id', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { rows: [conn] } = await query<{ id: string; credential_ref: string | null }>(
      `SELECT id, credential_ref FROM prism_connections
       WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

    // Revoke the secret (one-click revoke → in-flight stages fail closed on next resolve).
    if (conn.credential_ref) {
      await secretManager.deleteSecret(orgId, conn.credential_ref).catch((err: unknown) => {
        logger.warn({ orgId, connectionId: conn.id, err: (err as Error).message }, 'prism:secret_revoke_failed');
      });
    }

    // Soft-delete the connection + cancel its queued/running jobs (engine cancels in-flight).
    await query(
      `UPDATE prism_connections SET status='disconnected', deleted_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND org_id=$2`,
      [req.params.id, orgId],
    );
    await query(
      `UPDATE prism_jobs SET status='failed', updated_at=NOW()
       WHERE connection_id=$1 AND org_id=$2 AND deleted_at IS NULL
         AND status IN ('queued','running','awaiting_input','paused')`,
      [req.params.id, orgId],
    ).catch(() => {});

    // TODO(verify): engine.cancelConnectionJobs(orgId, connectionId) — stop live workers.
    try { await engine.cancelConnectionJobs?.(orgId, req.params.id); } catch { /* best-effort */ }

    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:delete_connection' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/prism/connections/:id/resources — enumerate what exists at source (DISCOVER).
router.get('/connections/:id/resources', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { rows: [conn] } = await query<{ id: string }>(
      `SELECT id FROM prism_connections WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

    let resources: unknown[];
    try {
      // TODO(verify): engine.discoverResources(orgId, connectionId) → DiscoveredResource[]
      resources = await engine.discoverResources(orgId, req.params.id) as unknown[];
    } catch (discErr) {
      engineUnavailable(res, discErr, { orgId, connectionId: req.params.id, op: 'discover' });
      return;
    }
    res.json({ resources });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:discover' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Jobs (the pipeline)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/prism/jobs — create a job (enqueues DISCOVER/EXTRACT).
router.post('/jobs', requireAuth, requireRole('analyst'), validate(createJobSchema), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { connectionId, kind, resources, options } =
      req.body as import('../schemas/prism').CreateJobInput;

    // Verify the connection belongs to this org (composite (id, org_id) → 404 on miss).
    const { rows: [conn] } = await query<{ id: string }>(
      `SELECT id FROM prism_connections WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [connectionId, orgId],
    );
    if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

    try {
      const { jobId } = await engine.enqueueJob(orgId, req.userId ?? 'unknown', {
        connectionId,
        kind,
        resources,
        options,
      });
      // Canonical CreateJobResponse: return the full job row as { job } (same shape as
      // GET /jobs/:id) so the FE can `job.id` + drive the wizard off a single response.
      const { rows: [job] } = await query(
        `SELECT j.*, c.platform
         FROM prism_jobs j
         JOIN prism_connections c ON c.id = j.connection_id
         WHERE j.id=$1 AND j.org_id=$2 AND j.deleted_at IS NULL`,
        [jobId, orgId],
      );
      if (job) {
        const jj = job as Record<string, unknown>;
        jj.counts = coerceCounts(jj.counts);
        res.status(201).json({ job: jj });
      } else {
        // Engine enqueued but the row isn't visible yet — return a minimal job so the
        // FE still gets `job.id` and can poll GET /jobs/:id.
        res.status(201).json({ job: { id: jobId, connection_id: connectionId, kind, status: 'queued', stage: 'connect', counts: {} } });
      }
    } catch (enqErr) {
      logger.error({ orgId, err: (enqErr as Error).message }, 'prism:enqueue_failed');
      engineUnavailable(res, enqErr, { orgId, connectionId, op: 'create_job' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:create_job' });
  }
});

// GET /api/prism/jobs — list jobs (with platform from the joined connection).
router.get('/jobs', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT j.id, c.platform, j.connection_id, j.kind, j.stage, j.status, j.counts,
              j.triggered_by, j.created_at, j.updated_at
       FROM prism_jobs j
       JOIN prism_connections c ON c.id = j.connection_id
       WHERE j.org_id=$1 AND j.deleted_at IS NULL
       ORDER BY j.created_at DESC`,
      [req.orgId],
    );
    const jobs = (rows as Record<string, unknown>[]).map((j) => ({ ...j, counts: coerceCounts(j.counts) }));
    res.json({ jobs });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId: req.orgId, route: 'prism:list_jobs' });
  }
});

// GET /api/prism/jobs/:id — full job (UI polls this).
router.get('/jobs/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [job] } = await query(
      `SELECT j.*, c.platform
       FROM prism_jobs j
       JOIN prism_connections c ON c.id = j.connection_id
       WHERE j.id=$1 AND j.org_id=$2 AND j.deleted_at IS NULL`,
      [req.params.id, req.orgId],
    );
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    const j = job as Record<string, unknown>;
    j.counts = coerceCounts(j.counts);
    res.json({ job: j });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId: req.orgId, route: 'prism:get_job' });
  }
});

// POST /api/prism/jobs/:id/(pause|resume|cancel) — lifecycle transitions.
const JOB_ACTION_STATUS: Record<string, string> = { pause: 'paused', resume: 'running', cancel: 'failed' };

for (const action of ['pause', 'resume', 'cancel'] as const) {
  router.post(`/jobs/:id/${action}`, requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
    const orgId = req.orgId;
    try {
      const { rows: [job] } = await query<{ id: string; status: string }>(
        `SELECT id, status FROM prism_jobs WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
        [req.params.id, orgId],
      );
      if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

      const nextStatus = JOB_ACTION_STATUS[action];
      await query(
        `UPDATE prism_jobs SET status=$3, updated_at=NOW() WHERE id=$1 AND org_id=$2`,
        [req.params.id, orgId, nextStatus],
      );

      // Signal the engine to actually pause/resume/cancel the live worker.
      try {
        // TODO(verify): engine.controlJob(orgId, jobId, action) — pause|resume|cancel the worker.
        await engine.controlJob?.(orgId, req.params.id, action);
      } catch (ctrlErr) {
        logger.warn({ orgId, jobId: req.params.id, action, err: (ctrlErr as Error).message }, 'prism:control_job_failed');
      }

      // Canonical JobActionResponse: return the full updated job row as { job } so the FE
      // can `setJob(job)` straight from the action response (no extra GET round-trip).
      const { rows: [updated] } = await query(
        `SELECT j.*, c.platform
         FROM prism_jobs j
         JOIN prism_connections c ON c.id = j.connection_id
         WHERE j.id=$1 AND j.org_id=$2 AND j.deleted_at IS NULL`,
        [req.params.id, orgId],
      );
      if (updated) {
        const jj = updated as Record<string, unknown>;
        jj.counts = coerceCounts(jj.counts);
        res.json({ job: jj });
      } else {
        res.json({ job: { id: req.params.id, status: nextStatus, counts: {} } });
      }
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: `prism:job_${action}` });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Continuous sync (I1 — CDC)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/prism/connections/:id/sync — register an ongoing delta sync.
router.post('/connections/:id/sync', requireAuth, requireRole('analyst'), validate(registerSyncSchema), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { mode, cursor } = req.body as import('../schemas/prism').RegisterSyncInput;
    const { rows: [conn] } = await query<{ id: string }>(
      `SELECT id FROM prism_connections WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

    try {
      await engine.registerSync(orgId, req.params.id, {});
      const state = await engine.getSync(orgId, req.params.id);
      res.status(201).json({ sync: state, mode, cursor: cursor ?? null });
    } catch (syncErr) {
      engineUnavailable(res, syncErr, { orgId, connectionId: req.params.id, op: 'register_sync' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:register_sync' });
  }
});

// GET /api/prism/connections/:id/sync — sync status (mode, lastCursor, lastRunAt, lag).
router.get('/connections/:id/sync', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [conn] } = await query<{ id: string }>(
      `SELECT id FROM prism_connections WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, req.orgId],
    );
    if (!conn) { res.status(404).json({ error: 'Connection not found' }); return; }

    const { rows } = await query(
      `SELECT connection_id, record_type, capture_mode, cursor, last_event_at, last_synced_at,
              lag_seconds, freshness_slo_s, poll_cadence_s, consecutive_fail, paused
       FROM prism_sync_state
       WHERE connection_id=$1 AND org_id=$2`,
      [req.params.id, req.orgId],
    );
    const sync = (rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      lag_seconds:      num(r.lag_seconds),
      freshness_slo_s:  num(r.freshness_slo_s),
      poll_cadence_s:   num(r.poll_cadence_s),
      consecutive_fail: num(r.consecutive_fail),
    }));
    res.json({ sync });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId: req.orgId, route: 'prism:get_sync' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Mapping (CrystalOS proposes, user confirms; I2 deterministic-first)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/prism/jobs/:id/mapping — suggestions (deterministic rules first, skill gap-fill).
router.get('/jobs/:id/mapping', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { rows: [job] } = await query<{ id: string }>(
      `SELECT id FROM prism_jobs WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    try {
      // TODO(verify): engine.getMappingSuggestions(orgId, jobId) → { suggestions: FieldMapping[], mapping_version?, schema_shape_hash? }
      // Canonical MappingResponse uses the key `mappings`. The engine historically returns
      // `suggestions`; normalize here so the FE always sees `mappings` (tolerant of either).
      const result = (await engine.getMappingSuggestions(orgId, req.params.id)) as
        Record<string, unknown> | null | undefined;
      const r = result ?? {};
      const mappings = (r.mappings ?? r.suggestions ?? []) as unknown[];
      res.json({
        mappings,
        mapping_version:   r.mapping_version,
        schema_shape_hash: r.schema_shape_hash,
      });
    } catch (mapErr) {
      engineUnavailable(res, mapErr, { orgId, jobId: req.params.id, op: 'mapping_suggestions' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:get_mapping' });
  }
});

// PUT /api/prism/jobs/:id/mapping — confirm/edit mapping → prism_mappings, advances TRANSFORM.
router.put('/jobs/:id/mapping', requireAuth, requireRole('analyst'), validate(confirmMappingSchema), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { mappings } = req.body as import('../schemas/prism').ConfirmMappingInput;
    const { rows: [job] } = await query<{ id: string }>(
      `SELECT id FROM prism_jobs WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    try {
      await engine.confirmMapping(orgId, req.params.id, mappings);
      res.json({ success: true });
    } catch (mapErr) {
      engineUnavailable(res, mapErr, { orgId, jobId: req.params.id, op: 'confirm_mapping' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:put_mapping' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Dry-run + approve (I3 two-tier parity)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/prism/jobs/:id/dryrun — DryRunReport (diff + two-tier parity + continuity).
router.get('/jobs/:id/dryrun', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { rows: [job] } = await query<{ id: string }>(
      `SELECT id FROM prism_jobs WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    try {
      // TODO(verify): engine.getDryRunReport(orgId, jobId) → DryRunReport
      // Canonical DryRunResponse is the report UNWRAPPED (FE reads top-level fields).
      const report = await engine.getDryRunReport(orgId, req.params.id);
      res.json(report);
    } catch (drErr) {
      engineUnavailable(res, drErr, { orgId, jobId: req.params.id, op: 'dryrun' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:get_dryrun' });
  }
});

// POST /api/prism/jobs/:id/approve — resolve conflicts + metric methods → LOAD.
router.post('/jobs/:id/approve', requireAuth, requireRole('analyst'), validate(approveSchema), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { conflictResolutions, metricMethods } = req.body as import('../schemas/prism').ApproveInput;
    const { rows: [job] } = await query<{ id: string }>(
      `SELECT id FROM prism_jobs WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    try {
      await engine.approveAndLoad(orgId, req.params.id, {
        conflictResolutions: conflictResolutions ?? [],
        metricMethods:       metricMethods ?? {},
      });
      // Canonical ApproveResponse: return the full job row as { job } (status advances to
      // loading via the engine). 202 = accepted, load runs asynchronously.
      const { rows: [loaded] } = await query(
        `SELECT j.*, c.platform
         FROM prism_jobs j
         JOIN prism_connections c ON c.id = j.connection_id
         WHERE j.id=$1 AND j.org_id=$2 AND j.deleted_at IS NULL`,
        [req.params.id, orgId],
      );
      if (loaded) {
        const jj = loaded as Record<string, unknown>;
        jj.counts = coerceCounts(jj.counts);
        res.status(202).json({ job: jj });
      } else {
        res.status(202).json({ job: { id: req.params.id, status: 'loading', counts: {} } });
      }
    } catch (apErr) {
      engineUnavailable(res, apErr, { orgId, jobId: req.params.id, op: 'approve' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:approve' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation + report
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/prism/jobs/:id/reconciliation — ReconReport (counts + checksums vs source).
router.get('/jobs/:id/reconciliation', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { rows: [job] } = await query<{ id: string }>(
      `SELECT id FROM prism_jobs WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    try {
      // TODO(verify): engine.getReconReport(orgId, jobId) → ReconReport
      // Canonical ReconResponse is the report UNWRAPPED (FE reads top-level fields).
      const report = await engine.getReconReport(orgId, req.params.id);
      res.json(report);
    } catch (recErr) {
      engineUnavailable(res, recErr, { orgId, jobId: req.params.id, op: 'reconciliation' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:get_recon' });
  }
});

// GET /api/prism/jobs/:id/report.pdf — signed reconciliation / fidelity-cert artifact.
router.get('/jobs/:id/report.pdf', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { rows: [job] } = await query<{ id: string }>(
      `SELECT id FROM prism_jobs WHERE id=$1 AND org_id=$2 AND deleted_at IS NULL`,
      [req.params.id, orgId],
    );
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    try {
      const pdf = await engine.getReconReportPdf(orgId, req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="prism-recon-${req.params.id}.pdf"`);
      res.send(pdf);
    } catch (pdfErr) {
      engineUnavailable(res, pdfErr, { orgId, jobId: req.params.id, op: 'report_pdf' });
    }
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:report_pdf' });
  }
});

// Keep the imported metric referenced (engine increments per-stage at runtime); a no-op
// guard here documents the wiring without affecting behavior.
void prismRecordsTotal;

export default router;
