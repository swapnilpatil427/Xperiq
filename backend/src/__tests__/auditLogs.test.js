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
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/auditLogs'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; next(); },
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: () => (req, res, next) => next(), invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/audit-logs', router.default || router);
  return app;
}
async function api(app, url) {
  const res = await inject(app, { method: 'GET', url });
  return { status: res.statusCode, body: res.payload, json: res.headers['content-type']?.includes('json') ? res.json() : null };
}

const eventRow = {
  id: 'e1', event_type: 'user.role_changed', actor_user_id: 'admin', actor_name: 'Admin',
  actor_email: 'admin@x.io', target_user_id: 'u2', target_name: 'Bob', occurred_at: '2026-06-01T00:00:00Z',
};

beforeEach(() => {
  dbQuery = vi.fn(async (text) => {
    if (text.includes('COUNT(*)')) return { rows: [{ count: 1 }] };
    return { rows: [eventRow] };
  });
});

describe('GET /api/audit-logs', () => {
  it('returns paginated, serialized events', async () => {
    const { status, json } = await api(buildApp(), '/api/audit-logs?page=1&limit=50');
    expect(status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.events[0]).toMatchObject({ eventType: 'user.role_changed', actorName: 'Admin' });
  });

  it('exports CSV when format=csv', async () => {
    const { status, body } = await api(buildApp(), '/api/audit-logs?format=csv');
    expect(status).toBe(200);
    expect(body).toContain('timestamp,actor,actor_email,event_type');
    expect(body).toContain('user.role_changed');
  });

  it('applies an event_type filter', async () => {
    const seen = [];
    dbQuery = vi.fn(async (text, params) => {
      seen.push({ text, params });
      if (text.includes('COUNT(*)')) return { rows: [{ count: 0 }] };
      return { rows: [] };
    });
    await api(buildApp(), '/api/audit-logs?event_type=user.deprovisioned');
    expect(seen.some((q) => (q.params || []).includes('user.deprovisioned'))).toBe(true);
  });
});
