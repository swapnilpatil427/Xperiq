// Regression tests for the Prism `/api/prism/*` response-shape contract.
//
// These pin the canonical response DTOs (backend/src/types/prism.ts) so the
// frontend (app/src/lib/api.ts + pages/hooks) never crashes on a shape mismatch
// again. The bug that motivated this: POST /connections returned { connectionId }
// while the FE read `connection.id` → "Cannot read properties of undefined
// (reading 'id')". We now return the full row as { connection } (and { job } for
// jobs), unwrap dry-run/reconciliation, and key mapping under `mappings`.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH     = _require.resolve(resolve(__dirname, '../middleware/auth'));
const ROLE_PATH     = _require.resolve(resolve(__dirname, '../middleware/requireRole'));
const VALIDATE_PATH = _require.resolve(resolve(__dirname, '../lib/validate'));
const DB_PATH       = _require.resolve(resolve(__dirname, '../lib/db'));
const ENGINE_PATH   = _require.resolve(resolve(__dirname, '../lib/prism/engine'));
const REGISTRY_PATH = _require.resolve(resolve(__dirname, '../lib/prism/connectors'));
const SECRET_PATH   = _require.resolve(resolve(__dirname, '../lib/prism/secretManager'));
const METRICS_PATH  = _require.resolve(resolve(__dirname, '../lib/prism/metrics'));
const ROUTER_PATH   = _require.resolve(resolve(__dirname, '../routes/prism'));

let dbQuery, engineMock, registryMock, secretMock;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; next(); },
  });
  _require.cache[ROLE_PATH] = fakeMod(ROLE_PATH, { requireRole: () => (req, res, next) => next() });
  // validate(schema) → passthrough middleware (shape contract, not validation, is under test).
  _require.cache[VALIDATE_PATH] = fakeMod(VALIDATE_PATH, { validate: () => (req, res, next) => next() });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[ENGINE_PATH] = fakeMod(ENGINE_PATH, engineMock);
  _require.cache[REGISTRY_PATH] = fakeMod(REGISTRY_PATH, registryMock);
  _require.cache[SECRET_PATH] = fakeMod(SECRET_PATH, { secretManager: secretMock });
  _require.cache[METRICS_PATH] = fakeMod(METRICS_PATH, { prismRecordsTotal: { inc: vi.fn() } });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/prism', router.default || router);
  return app;
}

async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  let parsed = null;
  try { parsed = res.json(); } catch { parsed = res.payload; }
  return { status: res.statusCode, body: parsed };
}

/** A full prism_connections row (as Postgres would return it). */
const CONN_ROW = {
  id: 'conn-1', org_id: 'test-org', platform: 'qualtrics', label: 'qualtrics',
  auth_kind: 'api_key', status: 'active', mode: 'ingest', history_window: 3,
  config: {}, stats: {}, created_by: 'test-user',
  created_at: 't', updated_at: 't', deleted_at: null,
};
/** A full prism_jobs row joined with platform. */
const JOB_ROW = {
  id: 'job-1', org_id: 'test-org', connection_id: 'conn-1', kind: 'sync',
  stage: 'discover', status: 'queued', cursor: null, counts: { discovered: '5' },
  error: null, triggered_by: 'user', created_by: 'test-user',
  created_at: 't', updated_at: 't', deleted_at: null, platform: 'qualtrics',
};

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [] }));
  engineMock = {
    enqueueJob:            vi.fn(async () => ({ jobId: 'job-1' })),
    discoverResources:     vi.fn(async () => []),
    controlJob:            vi.fn(async () => {}),
    cancelConnectionJobs:  vi.fn(async () => {}),
    getMappingSuggestions: vi.fn(async () => ({ suggestions: [], schema_shape_hash: 'h1' })),
    confirmMapping:        vi.fn(async () => {}),
    getDryRunReport:       vi.fn(async () => ({ summary: { create: 1, update: 0, skip_duplicate: 0, conflict: 0 }, metric_parity: [], unmapped_fields: [], timestamp_continuity: { earliest: '', latest: '', gaps: [] }, conflicts: [] })),
    approveAndLoad:        vi.fn(async () => {}),
    getReconReport:        vi.fn(async () => ({ tier1_pass: true, counts: { source: 5, prism: 5, match: true }, checksum: { source: 'a', prism: 'a', match: true }, metric_parity: [], generated_at: 't' })),
  };
  registryMock = { getConnector: vi.fn(() => ({ authenticate: vi.fn(async () => 'secret-material') })) };
  secretMock = { putSecret: vi.fn(async () => 'cred-ref'), deleteSecret: vi.fn(async () => {}) };
});

describe('POST /api/prism/connections — CreateConnectionResponse', () => {
  it('returns the full connection row as { connection } with connection.id (regression: was { connectionId })', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('INSERT INTO prism_connections')) return { rows: [{ id: 'conn-1' }] };
      if (text.includes('SELECT id, org_id, platform')) return { rows: [CONN_ROW] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/prism/connections', {
      platform: 'qualtrics', authKind: 'api_key', mode: 'ingest',
    });
    expect(status).toBe(201);
    expect(body.connection).toBeTruthy();
    expect(body.connection.id).toBe('conn-1');     // the field the FE reads → no crash
    expect(body.connectionId).toBeUndefined();      // legacy shape removed
    expect(body.connection.credential_ref).toBeUndefined(); // secret ref never exposed
  });
});

describe('POST /api/prism/jobs — CreateJobResponse', () => {
  it('returns the full job row as { job } with job.id (regression: was { jobId })', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM prism_connections')) return { rows: [{ id: 'conn-1' }] };
      if (text.includes('FROM prism_jobs')) return { rows: [JOB_ROW] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/prism/jobs', {
      connectionId: 'conn-1', kind: 'sync', resources: [{ kind: 'response', id: 'r1' }],
    });
    expect(status).toBe(201);
    expect(body.job).toBeTruthy();
    expect(body.job.id).toBe('job-1');             // the field the FE reads → no crash
    expect(body.jobId).toBeUndefined();
    expect(body.job.counts.discovered).toBe(5);    // NUMERIC string coerced to number
  });
});

describe('POST /api/prism/jobs/:id/(pause|resume|cancel) — JobActionResponse', () => {
  it('returns the updated job as { job } (regression: was { success, status })', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT id, status FROM prism_jobs')) return { rows: [{ id: 'job-1', status: 'running' }] };
      if (text.startsWith('UPDATE prism_jobs')) return { rows: [] };
      if (text.includes('FROM prism_jobs')) return { rows: [{ ...JOB_ROW, status: 'paused' }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/prism/jobs/job-1/pause');
    expect(status).toBe(200);
    expect(body.job).toBeTruthy();
    expect(body.job.id).toBe('job-1');
    expect(body.job.status).toBe('paused');
  });
});

describe('POST /api/prism/jobs/:id/approve — ApproveResponse', () => {
  it('returns the job as { job } at 202 (regression: was { jobId, status })', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT id FROM prism_jobs')) return { rows: [{ id: 'job-1' }] };
      if (text.includes('FROM prism_jobs')) return { rows: [{ ...JOB_ROW, stage: 'load', status: 'running' }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/prism/jobs/job-1/approve', {});
    expect(status).toBe(202);
    expect(body.job).toBeTruthy();
    expect(body.job.id).toBe('job-1');
    expect(body.jobId).toBeUndefined();
  });
});

describe('GET /api/prism/jobs/:id/mapping — MappingResponse', () => {
  it('keys suggestions under `mappings` (FE reads res.data.mappings)', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT id FROM prism_jobs')) return { rows: [{ id: 'job-1' }] };
      return { rows: [] };
    });
    engineMock.getMappingSuggestions = vi.fn(async () => ({
      suggestions: [{ source_field: 'q1', target: 'nps', confidence: 0.9, origin: 'deterministic' }],
      schema_shape_hash: 'h1',
    }));
    const { status, body } = await api(buildApp(), 'GET', '/api/prism/jobs/job-1/mapping');
    expect(status).toBe(200);
    expect(Array.isArray(body.mappings)).toBe(true);
    expect(body.mappings[0].source_field).toBe('q1');
    expect(body.schema_shape_hash).toBe('h1');
    expect(body.suggestions).toBeUndefined();      // normalized away
  });
});

describe('GET /api/prism/jobs/:id/dryrun — DryRunResponse (UNWRAPPED)', () => {
  it('returns the report at the top level, not under { report }', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT id FROM prism_jobs')) return { rows: [{ id: 'job-1' }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/prism/jobs/job-1/dryrun');
    expect(status).toBe(200);
    expect(body.report).toBeUndefined();            // not wrapped
    expect(body.summary.create).toBe(1);            // flat fields the FE reads
    expect(Array.isArray(body.metric_parity)).toBe(true);
  });
});

describe('GET /api/prism/jobs/:id/reconciliation — ReconResponse (UNWRAPPED)', () => {
  it('returns the report at the top level, not under { report }', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT id FROM prism_jobs')) return { rows: [{ id: 'job-1' }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/prism/jobs/job-1/reconciliation');
    expect(status).toBe(200);
    expect(body.report).toBeUndefined();
    expect(body.tier1_pass).toBe(true);
    expect(body.counts.source).toBe(5);
  });
});

describe('GET /api/prism/jobs/:id — GetJobResponse', () => {
  it('returns the job as { job } (unchanged contract, guarded)', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM prism_jobs')) return { rows: [JOB_ROW] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/prism/jobs/job-1');
    expect(status).toBe(200);
    expect(body.job.id).toBe('job-1');
    expect(body.job.counts.discovered).toBe(5);     // NUMERIC coercion preserved
  });
});
