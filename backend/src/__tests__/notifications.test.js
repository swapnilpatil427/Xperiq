import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const REDIS_PATH = _require.resolve(resolve(__dirname, '../lib/redis'));
const AUTH_PATH  = _require.resolve(resolve(__dirname, '../middleware/auth'));
const LIB_PATH   = _require.resolve(resolve(__dirname, '../lib/notifications'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/notifications'));

let dbQuery, redisClient;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function loadLib() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[REDIS_PATH] = fakeMod(REDIS_PATH, { getRedisClient: () => redisClient });
  delete _require.cache[LIB_PATH];
  return _require(LIB_PATH);
}
function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; next(); },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[REDIS_PATH] = fakeMod(REDIS_PATH, { getRedisClient: () => redisClient });
  delete _require.cache[LIB_PATH];
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/notifications', router);
  return app;
}
async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 })); redisClient = null; });

describe('createNotification (lib)', () => {
  it('inserts and returns the row (default-on preference)', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM notification_type_preferences')) return { rows: [] }; // no override → default on
      if (text.startsWith('INSERT INTO notifications')) return { rows: [{ id: 'n1', type: 'survey.milestone', priority: 'success', title: 'Hi', read: false, created_at: 't' }] };
      return { rows: [] };
    });
    const { createNotification } = loadLib();
    const row = await createNotification({ orgId: 'o1', userId: 'u1', type: 'survey.milestone', title: 'Hi' });
    expect(row.id).toBe('n1');
  });

  it('suppresses when the user disabled the type in-app', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM notification_type_preferences')) return { rows: [{ in_app_enabled: false }] };
      return { rows: [] };
    });
    const { createNotification } = loadLib();
    const row = await createNotification({ orgId: 'o1', userId: 'u1', type: 'score.nps_drop', title: 'Drop' });
    expect(row).toBeNull();
  });

  it('suppresses a duplicate within the dedup window', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO notification_dedup')) return { rows: [], rowCount: 0 }; // conflict → dup
      return { rows: [] };
    });
    const { createNotification } = loadLib();
    const row = await createNotification({
      orgId: 'o1', userId: 'u1', type: 'score.nps_drop', title: 'Drop',
      entityId: 'survey-1', dedupWindowMs: 3600000,
    });
    expect(row).toBeNull();
  });

  it('derives priority from the type when not provided', async () => {
    let insertedPriority;
    dbQuery = vi.fn(async (text, params) => {
      if (text.includes('FROM notification_type_preferences')) return { rows: [] };
      if (text.startsWith('INSERT INTO notifications')) { insertedPriority = params[3]; return { rows: [{ id: 'n2' }] }; }
      return { rows: [] };
    });
    const { createNotification } = loadLib();
    await createNotification({ orgId: 'o1', userId: 'u1', type: 'system.pipeline_error', title: 'Boom' });
    expect(insertedPriority).toBe('critical');
  });
});

describe('notification routes', () => {
  it('GET / returns paginated notifications', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('COUNT(*)')) return { rows: [{ count: 1 }] };
      return { rows: [{ id: 'n1', type: 'crystal.insight_ready', priority: 'info', title: 'Ready', read: false, created_at: 't', payload: {} }] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/notifications?limit=20');
    expect(status).toBe(200);
    expect(body.notifications[0]).toMatchObject({ id: 'n1', priority: 'info' });
    expect(body.pagination.total).toBe(1);
  });

  it('GET /count returns unread + critical', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ unread: 5, critical: 2 }] }));
    const { status, body } = await api(buildApp(), 'GET', '/api/notifications/count');
    expect(status).toBe(200);
    expect(body).toEqual({ unread: 5, critical: 2 });
  });

  it('POST /:id/read 404s when nothing matched', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const { status } = await api(buildApp(), 'POST', '/api/notifications/x/read');
    expect(status).toBe(404);
  });

  it('DELETE /:id dismisses', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const { status, body } = await api(buildApp(), 'DELETE', '/api/notifications/n1');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT /preferences upserts a batch', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const { status, body } = await api(buildApp(), 'PUT', '/api/notifications/preferences', {
      preferences: [{ notificationType: 'score.nps_drop', inAppEnabled: true, emailEnabled: true }],
    });
    expect(status).toBe(200);
    expect(body.updated).toBe(1);
  });

  it('PUT /preferences 400s on empty batch', async () => {
    const { status } = await api(buildApp(), 'PUT', '/api/notifications/preferences', { preferences: [] });
    expect(status).toBe(400);
  });
});
