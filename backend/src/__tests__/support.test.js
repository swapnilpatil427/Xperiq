/**
 * Integration tests for routes/support.js — the Support System API.
 * DB pool is mocked via fakeMod; HTTP calls go through light-my-request.
 * Internal routes require X-Internal-Key header.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import inject from 'light-my-request';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const _require   = createRequire(import.meta.url);

const AUTH_PATH    = _require.resolve(resolve(__dirname, '../middleware/auth'));
const DB_PATH      = _require.resolve(resolve(__dirname, '../lib/db'));
const LOGGER_PATH  = _require.resolve(resolve(__dirname, '../lib/logger'));
const ROUTER_PATH  = _require.resolve(resolve(__dirname, '../routes/support'));

const INTERNAL_KEY = 'dev-internal-key-change-in-prod';

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

// Hermetic: drop mocked modules so they never leak into other test files.
afterAll(() => {
  delete _require.cache[AUTH_PATH];
  delete _require.cache[DB_PATH];
  delete _require.cache[LOGGER_PATH];
  delete _require.cache[ROUTER_PATH];
});

// mockQuery is assigned in beforeEach; buildApp() injects whatever is current at call time.
let mockQuery;

function buildApp({ orgId = 'o1', userId = 'u1' } = {}) {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => {
      req.orgId  = orgId;
      req.userId = userId;
      next();
    },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    query:   mockQuery,
    default: { query: mockQuery },
  });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);

  const app = express();
  app.use(express.json());
  app.use('/api/support', router.default || router);
  return app;
}

async function api(app, method, url, body = null, headers = {}) {
  const opts = { method, url, headers };
  if (body !== null) {
    opts.payload = JSON.stringify(body);
    opts.headers = { ...opts.headers, 'content-type': 'application/json' };
  }
  const res = await inject(app, opts);
  let parsed;
  try { parsed = JSON.parse(res.payload); } catch { parsed = res.payload; }
  return { status: res.statusCode, body: parsed };
}

// Sample data fixtures
const sampleDoc = {
  id: 'doc-1', key: 'getting-started', title: 'Getting Started',
  pipeline_status: 'live', updated_at: new Date().toISOString(),
};
const sampleTicket   = { id: 'tkt-1', status: 'open', created_at: new Date().toISOString() };
const sampleFeedback = { id: 'fb-1', created_at: new Date().toISOString() };

beforeEach(() => {
  // Default: empty result set; individual tests override per-call.
  mockQuery = vi.fn(async () => ({ rows: [] }));
});

// ── GET /api/support/docs ─────────────────────────────────────────────────────

describe('GET /api/support/docs', () => {
  it('returns a paginated docs list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleDoc] })    // docs SELECT
      .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // count SELECT
    const { status, body } = await api(buildApp(), 'GET', '/api/support/docs');
    expect(status).toBe(200);
    expect(body.docs).toHaveLength(1);
    expect(body.docs[0].key).toBe('getting-started');
    expect(body.total).toBe(1);
  });

  it('returns empty list when no docs exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/docs');
    expect(status).toBe(200);
    expect(body.docs).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('returns 500 when DB throws', async () => {
    mockQuery = vi.fn(async () => { throw new Error('db down'); });
    const { status } = await api(buildApp(), 'GET', '/api/support/docs');
    expect(status).toBe(500);
  });
});

// ── GET /api/support/docs/:key ────────────────────────────────────────────────

describe('GET /api/support/docs/:key', () => {
  it('returns the doc when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleDoc] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/docs/getting-started');
    expect(status).toBe(200);
    expect(body.doc.key).toBe('getting-started');
  });

  it('returns 404 when doc does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/docs/missing-slug');
    expect(status).toBe(404);
    expect(body.error).toBe('doc_not_found');
  });

  it('returns 500 when DB throws', async () => {
    mockQuery = vi.fn(async () => { throw new Error('db error'); });
    const { status } = await api(buildApp(), 'GET', '/api/support/docs/some-key');
    expect(status).toBe(500);
  });
});

// ── GET /api/support/changelog ────────────────────────────────────────────────

describe('GET /api/support/changelog', () => {
  it('returns release notes list', async () => {
    const entry = { id: 'cl-1', version: '2.1.0', title: 'Summer release', released_at: new Date().toISOString() };
    mockQuery.mockResolvedValueOnce({ rows: [entry] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/changelog');
    expect(status).toBe(200);
    expect(body.entries[0].version).toBe('2.1.0');
  });

  it('returns empty list when no changelog entries', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/changelog');
    expect(status).toBe(200);
    expect(body.entries).toHaveLength(0);
  });
});

// ── GET /api/support/known-issues ─────────────────────────────────────────────

describe('GET /api/support/known-issues', () => {
  it('returns active issues', async () => {
    const issue = { id: 'ki-1', title: 'Slow exports', severity: 'medium', status: 'investigating' };
    mockQuery.mockResolvedValueOnce({ rows: [issue] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/known-issues');
    expect(status).toBe(200);
    expect(body.issues[0].title).toBe('Slow exports');
  });

  it('returns empty list when no active issues', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/known-issues');
    expect(status).toBe(200);
    expect(body.issues).toHaveLength(0);
  });
});

// ── GET /api/support/status ───────────────────────────────────────────────────

describe('GET /api/support/status', () => {
  it('returns operational status when DB is reachable', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/status');
    expect(status).toBe(200);
    expect(body.status).toBe('operational');
    expect(body.components.database).toBe('operational');
  });

  it('returns degraded status when DB query fails', async () => {
    mockQuery = vi.fn(async () => { throw new Error('connection refused'); });
    const { status, body } = await api(buildApp(), 'GET', '/api/support/status');
    expect(status).toBe(200); // the endpoint itself still responds
    expect(body.status).toBe('degraded');
    expect(body.components.database).toBe('degraded');
  });
});

// ── POST /api/support/tickets ─────────────────────────────────────────────────

describe('POST /api/support/tickets', () => {
  it('creates a ticket for an authed user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleTicket] });
    const { status, body } = await api(
      buildApp(), 'POST', '/api/support/tickets',
      { subject: 'Login broken', body: 'Cannot log in after SSO migration.' },
    );
    expect(status).toBe(201);
    expect(body.ticket.status).toBe('open');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_tickets'),
      expect.arrayContaining(['o1', 'u1', 'Login broken']),
    );
  });

  it('returns 400 when subject is missing', async () => {
    const { status, body } = await api(
      buildApp(), 'POST', '/api/support/tickets',
      { body: 'Some description.' },
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/subject/i);
  });

  it('returns 400 when body is missing', async () => {
    const { status } = await api(
      buildApp(), 'POST', '/api/support/tickets',
      { subject: 'A subject' },
    );
    expect(status).toBe(400);
  });

  it('returns 500 when DB throws', async () => {
    mockQuery = vi.fn(async () => { throw new Error('insert failed'); });
    const { status } = await api(
      buildApp(), 'POST', '/api/support/tickets',
      { subject: 'Test', body: 'Testing.' },
    );
    expect(status).toBe(500);
  });
});

// ── POST /api/support/feedback ────────────────────────────────────────────────

describe('POST /api/support/feedback', () => {
  it('creates a doc gap feedback record', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleFeedback] });
    const { status, body } = await api(
      buildApp(), 'POST', '/api/support/feedback',
      { doc_key: 'getting-started', type: 'gap', comment: 'Missing OAuth section.' },
    );
    expect(status).toBe(201);
    expect(body.feedback.id).toBe('fb-1');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_doc_feedback'),
      expect.arrayContaining(['o1', 'u1', 'getting-started']),
    );
  });

  it('returns 400 when doc_key is missing', async () => {
    const { status, body } = await api(
      buildApp(), 'POST', '/api/support/feedback',
      { comment: 'Great doc' },
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/doc_key/i);
  });
});

// ── POST /api/support/internal/refresh-doc ────────────────────────────────────

describe('POST /api/support/internal/refresh-doc', () => {
  it('requires X-Internal-Key — 401 without it', async () => {
    const { status } = await api(
      buildApp(), 'POST', '/api/support/internal/refresh-doc',
      { key: 'doc-1', title: 'Doc 1' },
    );
    expect(status).toBe(401);
  });

  it('upserts a doc when internal key is correct', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleDoc] });
    const { status, body } = await api(
      buildApp(), 'POST', '/api/support/internal/refresh-doc',
      { key: 'getting-started', title: 'Getting Started', pipeline_status: 'queued' },
      { 'X-Internal-Key': INTERNAL_KEY },
    );
    expect(status).toBe(200);
    expect(body.doc.key).toBe('getting-started');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (key) DO UPDATE'),
      expect.arrayContaining(['getting-started', 'Getting Started']),
    );
  });

  it('returns 400 when key is missing', async () => {
    const { status } = await api(
      buildApp(), 'POST', '/api/support/internal/refresh-doc',
      { title: 'No Key Doc' },
      { 'X-Internal-Key': INTERNAL_KEY },
    );
    expect(status).toBe(400);
  });

  it('returns 500 when DB throws', async () => {
    mockQuery = vi.fn(async () => { throw new Error('upsert failed'); });
    const { status } = await api(
      buildApp(), 'POST', '/api/support/internal/refresh-doc',
      { key: 'doc-x', title: 'Doc X' },
      { 'X-Internal-Key': INTERNAL_KEY },
    );
    expect(status).toBe(500);
  });
});

// ── POST /api/support/internal/ingest-changelog ───────────────────────────────

describe('POST /api/support/internal/ingest-changelog', () => {
  it('requires X-Internal-Key — 401 without it', async () => {
    const { status } = await api(
      buildApp(), 'POST', '/api/support/internal/ingest-changelog',
      { version: '2.0.0', title: 'Release' },
    );
    expect(status).toBe(401);
  });

  it('upserts a changelog entry with correct key', async () => {
    const entry = { id: 'cl-2', version: '2.0.0', released_at: new Date().toISOString() };
    mockQuery.mockResolvedValueOnce({ rows: [entry] });
    const { status, body } = await api(
      buildApp(), 'POST', '/api/support/internal/ingest-changelog',
      { version: '2.0.0', title: 'Spring release', body: 'Bug fixes.' },
      { 'X-Internal-Key': INTERNAL_KEY },
    );
    expect(status).toBe(200);
    expect(body.entry.version).toBe('2.0.0');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (version) DO UPDATE'),
      expect.arrayContaining(['2.0.0', 'Spring release']),
    );
  });

  it('returns 400 when version is missing', async () => {
    const { status } = await api(
      buildApp(), 'POST', '/api/support/internal/ingest-changelog',
      { title: 'No Version' },
      { 'X-Internal-Key': INTERNAL_KEY },
    );
    expect(status).toBe(400);
  });
});
