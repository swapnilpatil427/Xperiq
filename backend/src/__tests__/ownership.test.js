/**
 * Integration tests for routes/ownership.ts
 *
 * Mounted at /api/ownership-routes in production.
 *
 *   GET    /api/ownership-routes           — list routing rules
 *   POST   /api/ownership-routes           — create rule
 *   PUT    /api/ownership-routes/:id       — update rule
 *   DELETE /api/ownership-routes/:id       — delete rule
 *   GET    /api/ownership-routes/resolve   — test-tool endpoint
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
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/ownership'));

let dbQuery;

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

function buildApp({ permMiddleware } = {}) {
  const defaultPerm = () => (req, res, next) => next();
  const perm = permMiddleware ?? defaultPerm;

  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => {
      req.orgId = 'o1';
      req.userId = 'u1';
      next();
    },
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: perm,
    invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    query: dbQuery,
    default: { query: dbQuery },
  });

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use(express.json());
  app.use('/api/ownership-routes', router.default || router);
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

const sampleRoute = {
  id: 'r1',
  org_id: 'o1',
  dimension: 'segment',
  match_value: 'enterprise',
  match_type: 'exact',
  owner_user_id: 'user-owner-1',
  owner_label: 'Sarah',
  owner_email: 'sarah@example.com',
  escalation_user_id: null,
  escalation_label: null,
  priority: 0,
  role_label: null,
  created_at: new Date().toISOString(),
};

const validCreateBody = {
  dimension: 'segment',
  match_value: 'enterprise',
  match_type: 'exact',
  owner_user_id: 'user-owner-1',
  owner_label: 'Sarah',
};

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
});

// ── GET /api/ownership-routes ──────────────────────────────────────

describe('GET /api/ownership-routes', () => {
  it('returns list of routing rules for the org', async () => {
    dbQuery = vi.fn(async () => ({ rows: [sampleRoute, { ...sampleRoute, id: 'r2' }] }));
    const { status, body } = await api(buildApp(), 'GET', '/api/ownership-routes');
    expect(status).toBe(200);
    expect(body.routes).toHaveLength(2);
    expect(body.routes[0]).toMatchObject({ id: 'r1', dimension: 'segment' });
  });

  it('returns empty array when no rules exist', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status, body } = await api(buildApp(), 'GET', '/api/ownership-routes');
    expect(status).toBe(200);
    expect(body.routes).toEqual([]);
  });

  it('returns 403 when caller lacks contacts:read permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'GET', '/api/ownership-routes');
    expect(status).toBe(403);
  });

  it('filters by dimension when query param provided', async () => {
    let capturedParams;
    dbQuery = vi.fn(async (sql, params) => {
      capturedParams = params;
      return { rows: [sampleRoute] };
    });
    const { status } = await api(buildApp(), 'GET', '/api/ownership-routes?dimension=segment');
    expect(status).toBe(200);
    expect(capturedParams).toContain('segment');
  });
});

// ── POST /api/ownership-routes ─────────────────────────────────────

describe('POST /api/ownership-routes', () => {
  beforeEach(() => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.startsWith('INSERT INTO ownership_routes')) {
        return { rows: [{ ...sampleRoute, org_id: 'o1' }] };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  it('creates a routing rule and returns it with org_id set', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/ownership-routes', validCreateBody);
    expect(status).toBe(201);
    expect(body.route).toMatchObject({ org_id: 'o1', dimension: 'segment' });
  });

  it('returns 400 when match_value is missing', async () => {
    const { match_value: _omit, ...bodyWithout } = validCreateBody;
    const { status } = await api(buildApp(), 'POST', '/api/ownership-routes', bodyWithout);
    expect(status).toBe(400);
  });

  it('returns 400 when dimension is invalid enum value', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/ownership-routes', {
      ...validCreateBody,
      dimension: 'not_a_valid_dimension',
    });
    expect(status).toBe(400);
  });

  it('returns 400 when owner_user_id is missing', async () => {
    const { owner_user_id: _omit, ...bodyWithout } = validCreateBody;
    const { status } = await api(buildApp(), 'POST', '/api/ownership-routes', bodyWithout);
    expect(status).toBe(400);
  });

  it('returns 403 when caller lacks workflows:manage permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'POST', '/api/ownership-routes', validCreateBody);
    expect(status).toBe(403);
  });
});

// ── PUT /api/ownership-routes/:id ───────────────────────────────────

describe('PUT /api/ownership-routes/:id', () => {
  it('updates the rule and returns the updated record', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('SELECT id FROM ownership_routes')) {
        return { rows: [{ id: 'r1' }] };
      }
      if (sql.startsWith('UPDATE ownership_routes')) {
        return { rows: [{ ...sampleRoute, owner_label: 'Bob' }] };
      }
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'PUT', '/api/ownership-routes/r1', {
      owner_label: 'Bob',
    });
    expect(status).toBe(200);
    expect(body.route).toMatchObject({ owner_label: 'Bob' });
  });

  it('returns 404 when rule not found (SELECT returns 0 rows)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await api(buildApp(), 'PUT', '/api/ownership-routes/missing', {
      owner_label: 'Bob',
    });
    expect(status).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    const { status } = await api(buildApp(), 'PUT', '/api/ownership-routes/r1', {});
    expect(status).toBe(400);
  });

  it('returns 403 when caller lacks workflows:manage permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'PUT', '/api/ownership-routes/r1', {
      owner_label: 'Bob',
    });
    expect(status).toBe(403);
  });

  it('uses org-scoped WHERE clause (UPDATE WHERE id=? AND org_id=?)', async () => {
    let capturedSql;
    let capturedParams;
    dbQuery = vi.fn(async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      if (sql.includes('SELECT id FROM ownership_routes')) return { rows: [{ id: 'r1' }] };
      if (sql.startsWith('UPDATE')) return { rows: [sampleRoute] };
      return { rows: [] };
    });
    await api(buildApp(), 'PUT', '/api/ownership-routes/r1', { owner_label: 'Bob' });
    expect(capturedSql).toMatch(/org_id/);
    expect(capturedParams).toContain('o1');
  });
});

// ── DELETE /api/ownership-routes/:id ────────────────────────────────

describe('DELETE /api/ownership-routes/:id', () => {
  it('deletes the rule (returns 204)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const res = await inject(buildApp(), { method: 'DELETE', url: '/api/ownership-routes/r1' });
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when rule not found (rowCount = 0)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await api(buildApp(), 'DELETE', '/api/ownership-routes/missing');
    expect(status).toBe(404);
  });

  it('returns 403 when caller lacks workflows:manage permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const res = await inject(buildApp({ permMiddleware: denyPerm }), {
      method: 'DELETE',
      url: '/api/ownership-routes/r1',
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── GET /api/ownership-routes/resolve ───────────────────────────────

describe('GET /api/ownership-routes/resolve', () => {
  it('returns { matched: true, route } when a rule matches', async () => {
    dbQuery = vi.fn(async () => ({
      rows: [{ ...sampleRoute, match_type: 'exact', match_value: 'enterprise' }],
    }));
    const { status, body } = await api(
      buildApp(),
      'GET',
      '/api/ownership-routes/resolve?dimension=segment&value=enterprise'
    );
    expect(status).toBe(200);
    expect(body.matched).toBe(true);
    expect(body.route).toMatchObject({ match_value: 'enterprise' });
  });

  it('returns { matched: false } when no rule matches', async () => {
    dbQuery = vi.fn(async () => ({
      rows: [{ ...sampleRoute, match_type: 'exact', match_value: 'enterprise' }],
    }));
    const { status, body } = await api(
      buildApp(),
      'GET',
      '/api/ownership-routes/resolve?dimension=segment&value=smb'
    );
    expect(status).toBe(200);
    expect(body.matched).toBe(false);
    expect(body.route).toBeNull();
  });

  it('returns { matched: false } when no rules exist for the dimension', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status, body } = await api(
      buildApp(),
      'GET',
      '/api/ownership-routes/resolve?dimension=account&value=acme'
    );
    expect(status).toBe(200);
    expect(body.matched).toBe(false);
  });

  it('returns 400 when dimension query param is missing', async () => {
    const { status } = await api(buildApp(), 'GET', '/api/ownership-routes/resolve?value=enterprise');
    expect(status).toBe(400);
  });

  it('returns 400 when value query param is missing', async () => {
    const { status } = await api(buildApp(), 'GET', '/api/ownership-routes/resolve?dimension=segment');
    expect(status).toBe(400);
  });

  it('does not require write permission (read-only endpoint)', async () => {
    // read permission granted via default perm mock (calls next())
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status } = await api(
      buildApp(),
      'GET',
      '/api/ownership-routes/resolve?dimension=segment&value=test'
    );
    expect(status).toBe(200);
  });

  it('matches prefix rules correctly', async () => {
    dbQuery = vi.fn(async () => ({
      rows: [{ ...sampleRoute, match_type: 'prefix', match_value: 'ent' }],
    }));
    const { status, body } = await api(
      buildApp(),
      'GET',
      '/api/ownership-routes/resolve?dimension=segment&value=enterprise'
    );
    expect(status).toBe(200);
    expect(body.matched).toBe(true);
  });
});
