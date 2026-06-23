import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

const AUTH_PATH    = _require.resolve(resolve(__dirname, '../middleware/auth'));
const PERM_PATH    = _require.resolve(resolve(__dirname, '../middleware/requirePermission'));
const DB_PATH      = _require.resolve(resolve(__dirname, '../lib/db'));
const AUDIT_PATH   = _require.resolve(resolve(__dirname, '../lib/auditLog'));
const PROFILE_PATH = _require.resolve(resolve(__dirname, '../lib/userProfiles'));
const ROUTER_PATH  = _require.resolve(resolve(__dirname, '../routes/users'));

let dbQuery, invalidateCache, auditMock, upsertMock, getRoleIdMock;

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; req.id = 'req-1'; next(); },
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: () => (req, res, next) => next(),
    invalidatePermissionCache: invalidateCache,
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[AUDIT_PATH] = fakeMod(AUDIT_PATH, { auditLog: auditMock });
  _require.cache[PROFILE_PATH] = fakeMod(PROFILE_PATH, {
    getRoleIdByBuiltinKey: getRoleIdMock,
    upsertProfileFromClerk: upsertMock,
    ensureBuiltinRoles: vi.fn(),
  });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use(express.json());
  app.use('/api/users', router.default || router);
  return app;
}

async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

const sampleRow = {
  user_id: 'u1', org_id: 'test-org', email: 'a@x.io', display_name: 'Alice',
  role_id: 'r1', role_key: 'org:analyst', role_name: 'Analyst', seat_weight: '1.0',
  is_active: true, deprovisioned_at: null, custom_attributes: {}, survey_segments: [],
};

beforeEach(() => {
  invalidateCache = vi.fn(); auditMock = vi.fn();
  upsertMock = vi.fn(async () => ({ ...sampleRow, user_id: 'invite:a@x.io', email: 'a@x.io' }));
  getRoleIdMock = vi.fn(async () => 'role-member');
});
afterEach(() => { delete process.env.SKIP_AUTH; });

describe('GET /api/users', () => {
  it('returns serialized, paginated users', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('COUNT(*)')) return { rows: [{ count: 1 }] };
      return { rows: [sampleRow] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/users?limit=10');
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.users[0]).toMatchObject({ userId: 'u1', roleKey: 'org:analyst', status: 'active' });
  });

  it('applies a search filter parameter', async () => {
    const seen = [];
    dbQuery = vi.fn(async (text, params) => {
      seen.push({ text, params });
      if (text.includes('COUNT(*)')) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });
    await api(buildApp(), 'GET', '/api/users?search=ali');
    const select = seen.find((q) => q.text.includes('ORDER BY'));
    expect(select.params).toContain('%ali%');
  });
});

describe('GET /api/users/:id', () => {
  it('404s when the user is absent', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status, body } = await api(buildApp(), 'GET', '/api/users/missing');
    expect(status).toBe(404);
    expect(body.error).toBe('User not found');
  });
});

describe('PATCH /api/users/:id', () => {
  it('updates a profile and flushes the permission cache on role change', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('UPDATE user_profiles')) return { rows: [{ ...sampleRow, role_id: 'r2' }] };
      if (text.includes('FROM org_roles')) return { rows: [{ id: 'r2' }] };
      if (text.includes('FROM user_profiles up')) return { rows: [{ ...sampleRow, role_id: 'r2' }] };
      if (text.includes('FROM user_profiles')) return { rows: [{ ...sampleRow }] }; // before
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'PATCH', '/api/users/u1', { roleId: '11111111-1111-4111-8111-111111111111' });
    expect(status).toBe(200);
    expect(body.user.userId).toBe('u1');
    expect(invalidateCache).toHaveBeenCalledWith('u1');
    expect(auditMock).toHaveBeenCalled();
  });

  it('404s when updating a missing user', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status } = await api(buildApp(), 'PATCH', '/api/users/u1', { jobTitle: 'X' });
    expect(status).toBe(404);
  });

  it('400s on an empty update payload', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ ...sampleRow }] }));
    const { status } = await api(buildApp(), 'PATCH', '/api/users/u1', {});
    expect(status).toBe(400);
  });
});

describe('POST /api/users/invite', () => {
  it('creates a pending profile (dev bypass, no Clerk)', async () => {
    process.env.SKIP_AUTH = 'true';
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status, body } = await api(buildApp(), 'POST', '/api/users/invite', { email: 'a@x.io' });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.user.status).toBe('pending');
    expect(getRoleIdMock).toHaveBeenCalledWith('test-org', 'org:member');
    expect(upsertMock).toHaveBeenCalled();
  });

  it('400s on an invalid email', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status } = await api(buildApp(), 'POST', '/api/users/invite', { email: 'nope' });
    expect(status).toBe(400);
  });
});

describe('DELETE /api/users/:id', () => {
  it('soft-deprovisions a user', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ user_id: 'u2' }] }));
    const { status, body } = await api(buildApp(), 'DELETE', '/api/users/u2');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(invalidateCache).toHaveBeenCalledWith('u2');
  });

  it('refuses self-deprovision', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status, body } = await api(buildApp(), 'DELETE', '/api/users/test-user');
    expect(status).toBe(400);
    expect(body.error).toMatch(/yourself/);
  });
});
