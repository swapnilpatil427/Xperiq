import { describe, it, expect, vi, beforeEach } from 'vitest';
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
const ROUTER_PATH  = _require.resolve(resolve(__dirname, '../routes/roles'));

let dbQuery, auditMock;

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; req.id = 'req-1'; next(); },
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: () => (req, res, next) => next(),
    invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[AUDIT_PATH] = fakeMod(AUDIT_PATH, { auditLog: auditMock });
  _require.cache[PROFILE_PATH] = fakeMod(PROFILE_PATH, { ensureBuiltinRoles: vi.fn() });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use(express.json());
  app.use('/api/roles', router.default || router);
  return app;
}

async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

const builtinRow = {
  id: 'r1', org_id: 'test-org', name: 'Analyst', description: 'Read all',
  is_builtin: true, builtin_key: 'org:analyst', default_permissions: { 'survey:read': 'ALL' },
  seat_weight: '1.0', assigned_count: 2,
};

beforeEach(() => { auditMock = vi.fn(); });

const validPerms = {
  'survey:read': 'ALL', 'survey:write': 'OWNED', 'survey:distribute': 'NONE',
  'survey:insights:read': 'OWNED', 'survey:insights:generate': 'NONE',
  'survey:responses:export': 'NONE', 'survey:delete': 'OWNED', 'dashboard:read': 'OWNED',
  'alerts:manage': 'NONE', 'workflows:manage': 'NONE', 'users:manage': 'NONE', 'billing:manage': 'NONE',
};

describe('GET /api/roles', () => {
  it('lists roles with assignment counts', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('LIMIT 1')) return { rows: [{ x: 1 }] };  // existing roles check
      return { rows: [builtinRow] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/roles');
    expect(status).toBe(200);
    expect(body.roles[0]).toMatchObject({ builtinKey: 'org:analyst', isBuiltin: true, assignedCount: 2 });
  });
});

describe('POST /api/roles', () => {
  it('creates a custom role on an enterprise org', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('plan_tier')) return { rows: [{ plan_tier: 'enterprise' }] };
      if (text.startsWith('INSERT INTO org_roles')) {
        return { rows: [{ id: 'rc1', org_id: 'test-org', name: 'HR Lead', is_builtin: false,
          builtin_key: null, default_permissions: validPerms, seat_weight: '1.0' }] };
      }
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/roles',
      { name: 'HR Lead', permissions: validPerms });
    expect(status).toBe(201);
    expect(body.role).toMatchObject({ name: 'HR Lead', isBuiltin: false });
    expect(auditMock).toHaveBeenCalled();
  });

  it('blocks custom roles on non-enterprise plans', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('plan_tier')) return { rows: [{ plan_tier: 'growth' }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/roles',
      { name: 'HR Lead', permissions: validPerms });
    expect(status).toBe(403);
    expect(body.error).toMatch(/Enterprise/);
  });

  it('400s on an unknown permission action', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ plan_tier: 'enterprise' }] }));
    const { status } = await api(buildApp(), 'POST', '/api/roles',
      { name: 'Bad', permissions: { 'made:up': 'ALL' } });
    expect(status).toBe(400);
  });
});

describe('PATCH /api/roles/:id', () => {
  it('refuses to modify built-in roles', async () => {
    dbQuery = vi.fn(async () => ({ rows: [builtinRow] }));
    const { status, body } = await api(buildApp(), 'PATCH', '/api/roles/r1', { name: 'X' });
    expect(status).toBe(403);
    expect(body.error).toMatch(/Built-in/);
  });
});

describe('DELETE /api/roles/:id', () => {
  it('refuses to delete built-in roles', async () => {
    dbQuery = vi.fn(async () => ({ rows: [builtinRow] }));
    const { status } = await api(buildApp(), 'DELETE', '/api/roles/r1');
    expect(status).toBe(403);
  });

  it('blocks deletion of a custom role that is still assigned', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('COUNT(*)')) return { rows: [{ count: 3 }] };
      return { rows: [{ ...builtinRow, is_builtin: false, builtin_key: null }] };
    });
    const { status, body } = await api(buildApp(), 'DELETE', '/api/roles/rc1');
    expect(status).toBe(409);
    expect(body.error).toMatch(/assigned/);
  });
});
