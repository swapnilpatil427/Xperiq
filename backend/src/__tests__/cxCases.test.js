/**
 * Integration tests for routes/cx-cases.ts
 *
 *   POST /api/cases              — create case
 *   GET  /api/cases              — list cases (with filter)
 *   PUT  /api/cases/:id          — update case (audit-logged on status change)
 *   POST /api/cases/:id/events   — append audit event
 *   GET  /api/cases/sla-configs  — get SLA configs
 *   PUT  /api/cases/sla-configs  — upsert SLA configs (requires workflows:manage)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH   = _require.resolve(resolve(__dirname, '../middleware/auth'));
const PERM_PATH   = _require.resolve(resolve(__dirname, '../middleware/requirePermission'));
const DB_PATH     = _require.resolve(resolve(__dirname, '../lib/db'));
const LOGGER_PATH = _require.resolve(resolve(__dirname, '../lib/logger'));
const SLA_PATH    = _require.resolve(resolve(__dirname, '../lib/sla'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/cx-cases'));

let dbQuery;

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

function buildApp({ permMiddleware, devMode = true } = {}) {
  const defaultPerm = () => (req, res, next) => next();
  const perm = permMiddleware ?? defaultPerm;

  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => {
      req.orgId = 'o1';
      req.userId = 'u1';
      next();
    },
    // DEV_MODE=true so hasPiiPermission returns true by default in happy-path tests
    DEV_MODE: devMode,
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: perm,
    evaluatePermission: vi.fn(async () => true),
    invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    query: dbQuery,
    default: { query: dbQuery },
  });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
  // SLA lib: use real implementation (pure functions, no DB)
  delete _require.cache[SLA_PATH];

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use(express.json());
  app.use('/api/cases', router.default || router);
  return app;
}

async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) {
    opts.payload = JSON.stringify(body);
    opts.headers = { 'content-type': 'application/json' };
  }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

const sampleCase = {
  id: 'case-1',
  org_id: 'o1',
  title: 'Test Case',
  status: 'open',
  severity: 'medium',
  category: 'cx',
  contact_id: null,
  audit_log: [],
  ack_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  resolve_due_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  sla_breached: false,
  resolved_at: null,
  created_by: 'u1',
};

// ── POST /api/cases ────────────────────────────────────────────────────────

describe('POST /api/cases', () => {
  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('cx_sla_configs')) return { rows: [] }; // empty → use hardcoded defaults
      if (sql.startsWith('INSERT INTO cx_cases')) return { rows: [{ ...sampleCase }] };
      return { rows: [], rowCount: 0 };
    });
  });

  it('creates a case with status open', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/cases', {
      title: 'Detractor follow-up',
      severity: 'high',
    });
    expect(status).toBe(201);
    expect(body.case).toMatchObject({ id: 'case-1', status: 'open' });
  });

  it('returns 400 when title is missing', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/cases', {
      severity: 'high',
    });
    expect(status).toBe(400);
  });

  it('uses medium severity by default when not provided', async () => {
    let capturedSeverity;
    dbQuery = vi.fn(async (sql, params) => {
      if (sql.includes('cx_sla_configs')) return { rows: [] };
      if (sql.startsWith('INSERT INTO cx_cases')) {
        // severity is at index 8 (0-based) in the params array
        // (org,contact,response,survey,insight,title,description,category,severity,...)
        capturedSeverity = params[8];
        return { rows: [{ ...sampleCase, severity: params[8] }] };
      }
      return { rows: [], rowCount: 0 };
    });
    const { status } = await api(buildApp(), 'POST', '/api/cases', { title: 'No severity' });
    expect(status).toBe(201);
    expect(capturedSeverity).toBe('medium');
  });

  it('assigns SLA due date based on severity', async () => {
    let insertedSlaAt;
    dbQuery = vi.fn(async (sql, params) => {
      if (sql.includes('cx_sla_configs')) return { rows: [] };
      if (sql.startsWith('INSERT INTO cx_cases')) {
        insertedSlaAt = params[13]; // ack_due_at is at index 13 (after survey_id/insight_id added)
        return { rows: [{ ...sampleCase }] };
      }
      return { rows: [] };
    });
    const now = Date.now();
    await api(buildApp(), 'POST', '/api/cases', { title: 'Critical case', severity: 'critical' });
    // For critical severity: ack_sla_hrs = 2, so due in ~2 hours
    const dueAt = new Date(insertedSlaAt).getTime();
    expect(dueAt).toBeGreaterThan(now + 1 * 3600 * 1000);
    expect(dueAt).toBeLessThan(now + 3 * 3600 * 1000);
  });

  it('returns 403 when caller lacks contacts:write permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'POST', '/api/cases', {
      title: 'Test',
    });
    expect(status).toBe(403);
  });

  it('persists survey_id and insight_id provenance refs in the INSERT', async () => {
    let capturedSurveyId, capturedInsightId;
    dbQuery = vi.fn(async (sql, params) => {
      if (sql.includes('cx_sla_configs')) return { rows: [] };
      if (sql.startsWith('INSERT INTO cx_cases')) {
        // survey_id at index 3, insight_id at index 4 (after org/contact/response)
        capturedSurveyId = params[3];
        capturedInsightId = params[4];
        return { rows: [{ ...sampleCase }] };
      }
      return { rows: [] };
    });
    const sid = '11111111-1111-4111-8111-111111111111';
    const iid = '22222222-2222-4222-9222-222222222222';
    const { status } = await api(buildApp(), 'POST', '/api/cases', {
      title: 'From Crystal insight', survey_id: sid, insight_id: iid,
    });
    expect(status).toBe(201);
    expect(capturedSurveyId).toBe(sid);
    expect(capturedInsightId).toBe(iid);
  });
});

// ── GET /api/cases ─────────────────────────────────────────────────────────

describe('GET /api/cases', () => {
  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '2' }] };
      if (sql.includes('FROM cx_cases')) {
        return {
          rows: [
            { ...sampleCase, id: 'case-1', contact_email: null, contact_name: null, contact_account_name: null },
            { ...sampleCase, id: 'case-2', contact_email: null, contact_name: null, contact_account_name: null },
          ],
        };
      }
      return { rows: [] };
    });
  });

  it('returns paginated cases list for the org', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/cases');
    expect(status).toBe(200);
    expect(body.cases).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('filters by status query param when provided', async () => {
    let capturedSql;
    dbQuery = vi.fn(async (sql) => {
      capturedSql = sql;
      if (sql.includes('COUNT(*)')) return { rows: [{ total: '1' }] };
      return { rows: [{ ...sampleCase, contact_email: null, contact_name: null, contact_account_name: null }] };
    });
    const { status } = await api(buildApp(), 'GET', '/api/cases?status=open');
    expect(status).toBe(200);
    // The query should include a status condition
    expect(capturedSql).toMatch(/status/);
  });

  it('returns 403 when caller lacks contacts:read permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'GET', '/api/cases');
    expect(status).toBe(403);
  });

  it('returns each case with a sla_status field', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/cases');
    expect(status).toBe(200);
    expect(body.cases[0]).toHaveProperty('sla_status');
  });
});

// ── PUT /api/cases/:id ─────────────────────────────────────────────────────

describe('PUT /api/cases/:id', () => {
  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('SELECT status, owner_user_id')) {
        return { rows: [{ status: 'open', owner_user_id: null, audit_log: [], acked_at: null, resolved_at: null }] };
      }
      if (sql.startsWith('UPDATE cx_cases')) {
        return { rows: [{ ...sampleCase, status: 'in_progress' }] };
      }
      return { rows: [] };
    });
  });

  it('updates status and returns updated case', async () => {
    const { status, body } = await api(buildApp(), 'PUT', '/api/cases/case-1', {
      status: 'in_progress',
    });
    expect(status).toBe(200);
    expect(body.case).toMatchObject({ id: 'case-1', status: 'in_progress' });
  });

  it('records audit event on status change', async () => {
    let capturedParams;
    dbQuery = vi.fn(async (sql, params) => {
      if (sql.includes('SELECT status, owner_user_id')) {
        return { rows: [{ status: 'open', owner_user_id: null, audit_log: [], acked_at: null, resolved_at: null }] };
      }
      if (sql.startsWith('UPDATE cx_cases')) {
        capturedParams = params;
        return { rows: [{ ...sampleCase, status: 'in_progress' }] };
      }
      return { rows: [] };
    });
    await api(buildApp(), 'PUT', '/api/cases/case-1', { status: 'in_progress' });
    // The params array should include a JSON blob containing the audit entry
    const auditParam = capturedParams.find((p) => typeof p === 'string' && p.includes('status_changed'));
    expect(auditParam).toBeDefined();
  });

  it('returns 404 when case not found (SELECT returns 0 rows)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await api(buildApp(), 'PUT', '/api/cases/missing', {
      status: 'resolved',
    });
    expect(status).toBe(404);
  });

  it('returns 400 when no fields provided (schema validation)', async () => {
    const { status } = await api(buildApp(), 'PUT', '/api/cases/case-1', {});
    expect(status).toBe(400);
  });

  it('returns 403 when caller lacks contacts:write permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'PUT', '/api/cases/case-1', {
      status: 'in_progress',
    });
    expect(status).toBe(403);
  });
});

// ── POST /api/cases/:id/events ─────────────────────────────────────────────

describe('POST /api/cases/:id/events', () => {
  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.startsWith('UPDATE cx_cases')) {
        return { rows: [{ audit_log: [{ ts: 'now', actor: 'u1', action: 'note', note: 'test' }] }] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('appends an audit event to the case', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/cases/case-1/events', {
      action: 'note',
      note: 'Called customer',
    });
    expect(status).toBe(200);
    expect(body.audit_log).toHaveLength(1);
    expect(body.audit_log[0]).toMatchObject({ action: 'note' });
  });

  it('returns 404 when case not found', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await api(buildApp(), 'POST', '/api/cases/missing/events', {
      action: 'note',
    });
    expect(status).toBe(404);
  });

  it('returns 400 when action is missing', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/cases/case-1/events', {
      note: 'note without action',
    });
    expect(status).toBe(400);
  });

  it('requires contacts:write permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'POST', '/api/cases/case-1/events', {
      action: 'note',
    });
    expect(status).toBe(403);
  });
});

// ── GET /api/cases/sla-configs ───────────────────────────────────────────────────

describe('GET /api/cases/sla-configs', () => {
  it('returns org SLA config (platform defaults merged with org overrides)', async () => {
    dbQuery = vi.fn(async () => ({
      rows: [
        { org_id: '', category: 'cx', severity: 'high', ack_sla_hrs: 8, resolve_sla_hrs: 72 },
        { org_id: 'o1', category: 'cx', severity: 'high', ack_sla_hrs: 4, resolve_sla_hrs: 48 },
      ],
    }));
    const { status, body } = await api(buildApp(), 'GET', '/api/cases/sla-configs');
    expect(status).toBe(200);
    expect(body).toHaveProperty('platform_defaults');
    expect(body).toHaveProperty('org_overrides');
    expect(body).toHaveProperty('merged');
    // Org override wins in merged
    const mergedHighCx = body.merged.find((m) => m.severity === 'high' && m.category === 'cx');
    expect(mergedHighCx.ack_sla_hrs).toBe(4);
  });

  it('returns 403 when caller lacks contacts:read permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'GET', '/api/cases/sla-configs');
    expect(status).toBe(403);
  });
});

// ── PUT /api/cases/sla-configs ───────────────────────────────────────────────────

describe('PUT /api/cases/sla-configs', () => {
  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.startsWith('INSERT INTO cx_sla_configs')) return { rows: [], rowCount: 1 };
      if (sql.includes('SELECT * FROM cx_sla_configs')) {
        return {
          rows: [{ org_id: 'o1', category: 'cx', severity: 'high', ack_sla_hrs: 4, resolve_sla_hrs: 48 }],
        };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('upserts org SLA config and returns updated configs', async () => {
    const { status, body } = await api(buildApp(), 'PUT', '/api/cases/sla-configs', {
      configs: [{ category: 'cx', severity: 'high', ack_sla_hrs: 4, resolve_sla_hrs: 48 }],
    });
    expect(status).toBe(200);
    expect(body.configs).toHaveLength(1);
    expect(body.configs[0]).toMatchObject({ severity: 'high', ack_sla_hrs: 4 });
  });

  it('returns 403 when caller lacks workflows:manage permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'PUT', '/api/cases/sla-configs', {
      configs: [{ category: 'cx', severity: 'high', ack_sla_hrs: 4 }],
    });
    expect(status).toBe(403);
  });

  it('returns 400 when configs array is empty', async () => {
    const { status } = await api(buildApp(), 'PUT', '/api/cases/sla-configs', { configs: [] });
    expect(status).toBe(400);
  });

  it('returns 400 when ack_sla_hrs is missing', async () => {
    const { status } = await api(buildApp(), 'PUT', '/api/cases/sla-configs', {
      configs: [{ category: 'cx', severity: 'high' }],
    });
    expect(status).toBe(400);
  });
});
