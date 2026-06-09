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
const DG_PATH    = _require.resolve(resolve(__dirname, '../lib/dynamicGroups'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/groups'));

let dbQuery, evalDynamic;
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
  _require.cache[DG_PATH] = fakeMod(DG_PATH, {
    evaluateDynamicGroup: evalDynamic,
    // schemas/groups.js imports these from dynamicGroups — provide them
    OPERATORS: new Set(['eq', 'neq', 'contains', 'starts_with', 'gt', 'lt', 'in', 'not_in']),
    FIELD_MAP: { department_name: 'd.name', location: 'up.location', job_title: 'up.job_title', is_active: 'up.is_active' },
  });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/groups', router);
  return app;
}
async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [] })); evalDynamic = vi.fn(async () => ({ added: 0, removed: 0 })); });

describe('POST /api/groups', () => {
  it('creates a static group', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO user_groups')) {
        return { rows: [{ id: 'g1', name: 'Pilot', group_type: 'static', member_count: 0 }] };
      }
      if (text.includes('SELECT * FROM user_groups')) {
        return { rows: [{ id: 'g1', name: 'Pilot', group_type: 'static', member_count: 0 }] };
      }
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/groups', { name: 'Pilot', groupType: 'static' });
    expect(status).toBe(201);
    expect(body.group.groupType).toBe('static');
    expect(evalDynamic).not.toHaveBeenCalled();
  });

  it('materializes a dynamic group on creation', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO user_groups')) return { rows: [{ id: 'g2', name: 'APAC SEs', group_type: 'dynamic' }] };
      if (text.includes('SELECT * FROM user_groups')) return { rows: [{ id: 'g2', name: 'APAC SEs', group_type: 'dynamic', member_count: 4 }] };
      return { rows: [] };
    });
    const { status } = await api(buildApp(), 'POST', '/api/groups', {
      name: 'APAC SEs', groupType: 'dynamic',
      dynamicRules: { operator: 'AND', rules: [{ field: 'location', op: 'eq', value: 'APAC' }] },
    });
    expect(status).toBe(201);
    expect(evalDynamic).toHaveBeenCalledWith('g2', 'test-org');
  });

  it('400s when a dynamic group omits rules', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/groups', { name: 'Bad', groupType: 'dynamic' });
    expect(status).toBe(400);
  });
});

describe('POST /api/groups/:id/members', () => {
  it('rejects manual member adds on dynamic groups', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT group_type FROM user_groups')) return { rows: [{ group_type: 'dynamic' }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/groups/g2/members', { userId: 'u1' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/managed automatically/);
  });

  it('adds a member to a static group', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT group_type FROM user_groups')) return { rows: [{ group_type: 'static' }] };
      return { rows: [] };
    });
    const { status } = await api(buildApp(), 'POST', '/api/groups/g1/members', { userId: 'u1' });
    expect(status).toBe(201);
  });
});
