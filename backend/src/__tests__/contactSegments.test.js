/**
 * Integration tests for routes/contact-segments.ts
 *
 * Mounted at /api/contacts/segments in production.
 *
 *   GET    /api/contacts/segments              — list segments
 *   POST   /api/contacts/segments              — create segment
 *   DELETE /api/contacts/segments/:id/members/:contactId — remove member (org-scoped)
 *   GET    /api/contacts/segments/:id/members  — paginated members (PII masking)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH      = _require.resolve(resolve(__dirname, '../middleware/auth'));
const PERM_PATH      = _require.resolve(resolve(__dirname, '../middleware/requirePermission'));
const DB_PATH        = _require.resolve(resolve(__dirname, '../lib/db'));
const EVALUATOR_PATH = _require.resolve(resolve(__dirname, '../lib/segmentEvaluator'));
const ROUTER_PATH    = _require.resolve(resolve(__dirname, '../routes/contact-segments'));

let dbQuery;
let evaluatePermissionMock;
let refreshSegmentMembershipMock;

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

function buildApp({ permMiddleware, evaluatePerm } = {}) {
  const defaultPerm = () => (req, res, next) => next();
  const perm = permMiddleware ?? defaultPerm;
  evaluatePermissionMock = evaluatePerm ?? vi.fn(async () => true);

  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => {
      req.orgId = 'o1';
      req.userId = 'u1';
      next();
    },
    DEV_MODE: false, // set to false so PII permission check is actually evaluated
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: perm,
    evaluatePermission: evaluatePermissionMock,
    invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    query: dbQuery,
    default: { query: dbQuery },
  });
  refreshSegmentMembershipMock = vi.fn(async () => 0);
  _require.cache[EVALUATOR_PATH] = fakeMod(EVALUATOR_PATH, {
    evaluateSegment: vi.fn(async () => ({ count: 0, preview: [] })),
    refreshSegmentMembership: refreshSegmentMembershipMock,
  });

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use(express.json());
  app.use('/api/contacts/segments', router.default || router);
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

const sampleSegment = {
  id: 'seg-1',
  org_id: 'o1',
  name: 'Enterprise Accounts',
  description: 'All enterprise customers',
  color: '#2a4bd9',
  is_dynamic: true,
  filter_def: { logic: 'AND', conditions: [] },
  contact_count: 42,
  last_evaluated_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const validCreateBody = {
  name: 'Enterprise Accounts',
  is_dynamic: true,
  filter_def: {
    logic: 'AND',
    conditions: [{ field: 'account_name', operator: 'contains', value: 'enterprise' }],
  },
};

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
});

// ── GET /api/contacts/segments ────────────────────────────────────────────────

describe('GET /api/contacts/segments', () => {
  it('returns segments for the org with member_count (contact_count)', async () => {
    dbQuery = vi.fn(async () => ({
      rows: [sampleSegment, { ...sampleSegment, id: 'seg-2', name: 'SMB Accounts' }],
    }));
    const { status, body } = await api(buildApp(), 'GET', '/api/contacts/segments');
    expect(status).toBe(200);
    expect(body.segments).toHaveLength(2);
    expect(body.segments[0]).toMatchObject({ id: 'seg-1', name: 'Enterprise Accounts' });
  });

  it('returns empty array when no segments exist', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status, body } = await api(buildApp(), 'GET', '/api/contacts/segments');
    expect(status).toBe(200);
    expect(body.segments).toEqual([]);
  });

  it('returns 403 when caller lacks contacts:read permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'GET', '/api/contacts/segments');
    expect(status).toBe(403);
  });
});

// ── POST /api/contacts/segments ───────────────────────────────────────────────

describe('POST /api/contacts/segments', () => {
  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.startsWith('INSERT INTO contact_segments')) {
        return {
          rows: [{
            ...sampleSegment,
            is_dynamic: true,
            filter_def: { logic: 'AND', conditions: [{ field: 'account_name', operator: 'contains', value: 'enterprise' }] },
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('creates a segment with is_dynamic and conditions', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/contacts/segments', validCreateBody);
    expect(status).toBe(201);
    expect(body.segment).toMatchObject({ id: 'seg-1', is_dynamic: true });
  });

  it('returns 400 when name is missing', async () => {
    const { name: _omit, ...bodyWithout } = validCreateBody;
    const { status } = await api(buildApp(), 'POST', '/api/contacts/segments', bodyWithout);
    expect(status).toBe(400);
  });

  it('returns 400 when filter_def is missing', async () => {
    const { filter_def: _omit, ...bodyWithout } = validCreateBody;
    const { status } = await api(buildApp(), 'POST', '/api/contacts/segments', bodyWithout);
    expect(status).toBe(400);
  });

  it('returns 403 when caller lacks contacts:segment:manage permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'POST', '/api/contacts/segments', validCreateBody);
    expect(status).toBe(403);
  });

  it('triggers refreshSegmentMembership for dynamic segments with conditions', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.startsWith('INSERT INTO contact_segments')) {
        return {
          rows: [{
            ...sampleSegment,
            is_dynamic: true,
            filter_def: { logic: 'AND', conditions: [{ field: 'account_name', operator: 'contains', value: 'enterprise' }] },
          }],
        };
      }
      return { rows: [] };
    });
    const app = buildApp();
    await api(app, 'POST', '/api/contacts/segments', validCreateBody);
    // Allow async refresh to be called
    await new Promise((r) => setTimeout(r, 10));
    expect(refreshSegmentMembershipMock).toHaveBeenCalled();
  });
});

// ── DELETE /api/contacts/segments/:id/members/:contactId ──────────────────────

describe('DELETE /api/contacts/segments/:id/members/:contactId', () => {
  it('returns 200 on successful delete', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const { status, body } = await api(
      buildApp(),
      'DELETE',
      '/api/contacts/segments/seg-1/members/contact-1'
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('uses org-scoped DELETE (EXISTS subquery checks org_id)', async () => {
    let capturedSql;
    let capturedParams;
    dbQuery = vi.fn(async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [], rowCount: 1 };
    });
    await api(buildApp(), 'DELETE', '/api/contacts/segments/seg-1/members/contact-1');
    expect(capturedSql).toMatch(/EXISTS/);
    expect(capturedSql).toMatch(/org_id/);
    expect(capturedParams).toContain('o1');
  });

  it('returns 403 when caller lacks contacts:segment:manage permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const res = await inject(buildApp({ permMiddleware: denyPerm }), {
      method: 'DELETE',
      url: '/api/contacts/segments/seg-1/members/contact-1',
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── GET /api/contacts/segments/:id/members ────────────────────────────────────

describe('GET /api/contacts/segments/:id/members', () => {
  const memberRows = [
    { id: 'c1', name: 'Alice Smith', email: 'alice@example.com', account_name: 'Acme', consent_given: true, segment_attrs: {}, added_at: new Date().toISOString(), is_manual: false },
    { id: 'c2', name: 'Bob Jones', email: 'bob@example.com', account_name: 'Globex', consent_given: true, segment_attrs: {}, added_at: new Date().toISOString(), is_manual: false },
  ];

  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '2' }] };
      if (sql.includes('FROM contact_segment_members csm')) return { rows: memberRows };
      return { rows: [] };
    });
  });

  it('returns member list with name and email when caller has contacts:pii:read', async () => {
    const hasPiiPerm = vi.fn(async () => true); // evaluatePermission returns true (has PII access)
    const { status, body } = await api(buildApp({ evaluatePerm: hasPiiPerm }), 'GET', '/api/contacts/segments/seg-1/members');
    expect(status).toBe(200);
    expect(body.members).toHaveLength(2);
    expect(body.members[0].name).toBe('Alice Smith');
    expect(body.members[0].email).toBe('alice@example.com');
  });

  it('masks name and email when caller lacks contacts:pii:read (evaluatePermission returns falsy)', async () => {
    const noPiiPerm = vi.fn(async () => false); // evaluatePermission returns false (no PII access)
    const { status, body } = await api(buildApp({ evaluatePerm: noPiiPerm }), 'GET', '/api/contacts/segments/seg-1/members');
    expect(status).toBe(200);
    expect(body.members).toHaveLength(2);
    expect(body.members[0].name).toBeNull();
    expect(body.members[0].email).toBeNull();
    // Non-PII fields should still be present
    expect(body.members[0].id).toBe('c1');
    expect(body.members[0].account_name).toBe('Acme');
  });

  it('returns correct pagination metadata', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/contacts/segments/seg-1/members?page=1&limit=10');
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
  });

  it('returns 403 when caller lacks contacts:read permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'GET', '/api/contacts/segments/seg-1/members');
    expect(status).toBe(403);
  });
});
