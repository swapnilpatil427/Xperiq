import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

const AUTH_PATH  = _require.resolve(resolve(__dirname, '../middleware/auth'));
const PERM_PATH  = _require.resolve(resolve(__dirname, '../middleware/requirePermission'));
const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const AUDIT_PATH = _require.resolve(resolve(__dirname, '../lib/auditLog'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/departments'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; req.id = 'r1'; next(); },
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: () => (req, res, next) => next(), invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[AUDIT_PATH] = fakeMod(AUDIT_PATH, { auditLog: vi.fn() });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/departments', router.default || router);
  return app;
}
async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [] })); });

describe('GET /api/departments', () => {
  it('builds a nested tree and rolls up subtree counts', async () => {
    dbQuery = vi.fn(async () => ({ rows: [
      { id: 'd1', name: 'Engineering', parent_department_id: null, depth: 0, path: ['d1'], direct_member_count: 2 },
      { id: 'd2', name: 'Platform', parent_department_id: 'd1', depth: 1, path: ['d1', 'd2'], direct_member_count: 3 },
    ] }));
    const { status, body } = await api(buildApp(), 'GET', '/api/departments');
    expect(status).toBe(200);
    expect(body.tree).toHaveLength(1);
    expect(body.tree[0].name).toBe('Engineering');
    expect(body.tree[0].children[0].name).toBe('Platform');
    expect(body.tree[0].totalMemberCount).toBe(5); // 2 + 3
  });
});

describe('POST /api/departments', () => {
  it('creates a top-level department', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO departments')) {
        return { rows: [{ id: 'd9', name: 'Sales', parent_department_id: null, depth: 0, path: ['d9'], direct_member_count: 0 }] };
      }
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/departments', { name: 'Sales' });
    expect(status).toBe(201);
    expect(body.department.name).toBe('Sales');
  });

  it('400s for a missing name', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/departments', { description: 'x' });
    expect(status).toBe(400);
  });

  it('blocks re-parenting a department under its own descendant', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT * FROM departments')) return { rows: [{ id: 'd1', name: 'Eng' }] };
      if (text.includes('path @>')) return { rows: [{ ['?column?']: 1 }] }; // parent is a descendant
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'PATCH', '/api/departments/d1', { parentDepartmentId: '11111111-1111-4111-8111-111111111111' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/descendant/);
  });
});
