/**
 * Integration tests for routes/outreach.ts
 *
 *   GET  /api/outreach/broadcasts         — list broadcasts for org
 *   POST /api/outreach/broadcasts         — create broadcast
 *   POST /api/outreach/broadcasts/:id/approve — approve broadcast
 *   POST /api/outreach/broadcasts/:id/reject  — reject broadcast
 *   POST /api/outreach/broadcasts/:id/send    — send (idempotency via CAS)
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
const ENGINE_PATH = _require.resolve(resolve(__dirname, '../lib/broadcastEngine'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/outreach'));

let dbQuery;
let engineMocks;

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
    evaluatePermission: vi.fn(async () => true),
    invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    query: dbQuery,
    pool: { connect: vi.fn(async () => ({
      query: dbQuery,
      release: vi.fn(),
    })) },
    default: { query: dbQuery },
  });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
  _require.cache[ENGINE_PATH] = fakeMod(ENGINE_PATH, {
    ...engineMocks,
    default: { ...engineMocks },
  });

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use(express.json());
  app.use('/api/outreach', router.default || router);
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

const validBroadcastBody = {
  name: 'Test Broadcast',
  segmentId: '123e4567-e89b-12d3-a456-426614174000',
  channels: ['email'],
  payload: { subject: 'Hello', body: 'World' },
};

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
  engineMocks = {
    createBroadcast: vi.fn(async () => ({
      id: 'b1',
      name: 'Test Broadcast',
      status: 'pending_approval',
      org_id: 'o1',
    })),
    notifyApprovers: vi.fn(async () => {}),
    approveBroadcast: vi.fn(async () => ({
      id: 'b1',
      status: 'approved',
    })),
    rejectBroadcast: vi.fn(async () => {}),
    listBroadcasts: vi.fn(async () => ({ broadcasts: [], total: 0 })),
    getBroadcastAudit: vi.fn(async () => []),
  };
});

// ── GET /api/outreach/broadcasts ──────────────────────────────────────────────

describe('GET /api/outreach/broadcasts', () => {
  it('returns list of broadcasts for the org', async () => {
    engineMocks.listBroadcasts = vi.fn(async () => ({
      broadcasts: [
        { id: 'b1', name: 'Broadcast 1', status: 'pending_approval' },
        { id: 'b2', name: 'Broadcast 2', status: 'approved' },
      ],
      total: 2,
    }));
    const { status, body } = await api(buildApp(), 'GET', '/api/outreach/broadcasts');
    expect(status).toBe(200);
    expect(body.broadcasts).toHaveLength(2);
    expect(body.broadcasts[0]).toMatchObject({ id: 'b1', status: 'pending_approval' });
  });

  it('returns empty array when no broadcasts exist', async () => {
    engineMocks.listBroadcasts = vi.fn(async () => ({ broadcasts: [], total: 0 }));
    const { status, body } = await api(buildApp(), 'GET', '/api/outreach/broadcasts');
    expect(status).toBe(200);
    expect(body.broadcasts).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns 403 when caller lacks outreach:logs:read permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status, body } = await api(buildApp({ permMiddleware: denyPerm }), 'GET', '/api/outreach/broadcasts');
    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });
});

// ── POST /api/outreach/broadcasts ─────────────────────────────────────────────

describe('POST /api/outreach/broadcasts', () => {
  it('returns 201 with created broadcast when all required fields provided', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/outreach/broadcasts', validBroadcastBody);
    expect(status).toBe(201);
    expect(body.broadcast).toMatchObject({ id: 'b1', status: 'pending_approval' });
    expect(engineMocks.createBroadcast).toHaveBeenCalled();
  });

  it('created broadcast has status pending_approval', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/outreach/broadcasts', validBroadcastBody);
    expect(status).toBe(201);
    expect(body.broadcast.status).toBe('pending_approval');
  });

  it('returns 400 when name is missing', async () => {
    const { name: _omit, ...bodyWithoutName } = validBroadcastBody;
    const { status } = await api(buildApp(), 'POST', '/api/outreach/broadcasts', bodyWithoutName);
    expect(status).toBe(400);
    expect(engineMocks.createBroadcast).not.toHaveBeenCalled();
  });

  it('returns 400 when channels is an empty array', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/outreach/broadcasts', {
      ...validBroadcastBody,
      channels: [],
    });
    expect(status).toBe(400);
  });

  it('returns 400 when neither segmentId nor contactIds are provided', async () => {
    const { segmentId: _omit, ...bodyWithout } = validBroadcastBody;
    const { status } = await api(buildApp(), 'POST', '/api/outreach/broadcasts', bodyWithout);
    expect(status).toBe(400);
  });

  it('returns 403 when caller lacks outreach:broadcast permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'POST', '/api/outreach/broadcasts', validBroadcastBody);
    expect(status).toBe(403);
  });
});

// ── POST /api/outreach/broadcasts/:id/approve ─────────────────────────────────

describe('POST /api/outreach/broadcasts/:id/approve', () => {
  it('returns 200 with approved broadcast', async () => {
    engineMocks.approveBroadcast = vi.fn(async () => ({ id: 'b1', status: 'approved' }));
    const { status, body } = await api(buildApp(), 'POST', '/api/outreach/broadcasts/b1/approve');
    expect(status).toBe(200);
    expect(body.broadcast).toMatchObject({ id: 'b1', status: 'approved' });
  });

  it('returns 403 when caller lacks outreach:approve permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status, body } = await api(buildApp({ permMiddleware: denyPerm }), 'POST', '/api/outreach/broadcasts/b1/approve');
    expect(status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 409 when broadcast does not exist or is not pending_approval', async () => {
    engineMocks.approveBroadcast = vi.fn(async () => {
      throw new Error('Broadcast not found or not in pending_approval state');
    });
    const { status } = await api(buildApp(), 'POST', '/api/outreach/broadcasts/b-missing/approve');
    expect(status).toBe(409);
  });
});

// ── POST /api/outreach/broadcasts/:id/reject ──────────────────────────────────

describe('POST /api/outreach/broadcasts/:id/reject', () => {
  it('returns 200 on valid rejection with reason', async () => {
    engineMocks.rejectBroadcast = vi.fn(async () => {});
    const { status, body } = await api(buildApp(), 'POST', '/api/outreach/broadcasts/b1/reject', {
      reason: 'Not approved by compliance',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 when reason is missing', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/outreach/broadcasts/b1/reject', {});
    expect(status).toBe(400);
    expect(engineMocks.rejectBroadcast).not.toHaveBeenCalled();
  });

  it('returns 409 when broadcast is not in pending_approval state', async () => {
    engineMocks.rejectBroadcast = vi.fn(async () => {
      throw new Error('Broadcast not in pending_approval state');
    });
    const { status } = await api(buildApp(), 'POST', '/api/outreach/broadcasts/b1/reject', {
      reason: 'reason',
    });
    expect(status).toBe(409);
  });
});

// ── POST /api/outreach/broadcasts/:id/send ────────────────────────────────────

describe('POST /api/outreach/broadcasts/:id/send', () => {
  it('returns 200 when broadcast is in approved state (CAS succeeds)', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes("status = 'approved'")) {
        // CAS update: broadcast is approved → transitions to sending
        return { rows: [{ id: 'b1', status: 'sending', org_id: 'o1', expires_at: null, segment_id: null, contact_ids: null, payload: {} }], rowCount: 1 };
      }
      // audit log insert or other queries
      return { rows: [], rowCount: 1 };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/outreach/broadcasts/b1/send');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe('sending');
  });

  it('returns 409 when broadcast is NOT in approved state (CAS returns 0 rows)', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes("status = 'approved'")) {
        // CAS update: broadcast is not approved → 0 rows
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/outreach/broadcasts/b1/send');
    expect(status).toBe(409);
    expect(body.error).toMatch(/not in approved/);
  });

  it('prevents double-send: second CAS on same broadcast returns 409', async () => {
    let sendCount = 0;
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes("status = 'approved'")) {
        sendCount++;
        if (sendCount === 1) {
          return { rows: [{ id: 'b1', status: 'sending', org_id: 'o1', expires_at: null, segment_id: null, contact_ids: null, payload: {} }], rowCount: 1 };
        }
        // Second send: already in 'sending' state, CAS fails
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });

    const app = buildApp();
    const res1 = await api(app, 'POST', '/api/outreach/broadcasts/b1/send');
    const res2 = await api(app, 'POST', '/api/outreach/broadcasts/b1/send');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(409);
  });

  it('returns 403 when caller lacks outreach:broadcast permission', async () => {
    const denyPerm = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: denyPerm }), 'POST', '/api/outreach/broadcasts/b1/send');
    expect(status).toBe(403);
  });
});
