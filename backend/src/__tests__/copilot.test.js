import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const _require   = createRequire(import.meta.url);

const AUTH_PATH    = _require.resolve(resolve(__dirname, '../middleware/auth'));
const DB_PATH      = _require.resolve(resolve(__dirname, '../lib/db'));
const AGENTS_PATH  = _require.resolve(resolve(__dirname, '../lib/agentsClient'));
const LOGGER_PATH  = _require.resolve(resolve(__dirname, '../lib/logger'));
const ROUTER_PATH  = _require.resolve(resolve(__dirname, '../routes/local/copilot'));

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

let mockQuery;
let mockAgents;

function buildApp({ userId = 'u-owner', orgId = 'org-1', skipAuth = false } = {}) {
  mockQuery  = vi.fn();
  mockAgents = {
    getRunStatus:         vi.fn().mockResolvedValue({ status: 'completed', questions: [] }),
    refineRun:            vi.fn().mockResolvedValue({ questions: [], explanation: 'ok', changes: [], suggestions: [], recommendations: [] }),
    addSkipLogic:         vi.fn().mockResolvedValue({ questions: [], message: 'done', changes: [] }),
    addQuestion:          vi.fn().mockResolvedValue({ questions: [], message: 'added', changes: [] }),
    removeQuestion:       vi.fn().mockResolvedValue({ questions: [], message: 'removed', changes: [] }),
    patchQuestion:        vi.fn().mockResolvedValue({ questions: [], message: 'patched', changes: [] }),
    reorderQuestions:     vi.fn().mockResolvedValue({ questions: [], message: 'reordered', changes: [] }),
    applyRecommendation:  vi.fn().mockResolvedValue({ questions: [], message: 'applied', changes: [] }),
    getAgentRegistry:     vi.fn().mockResolvedValue([]),
  };

  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => {
      req.orgId  = orgId;
      req.userId = userId;
      next();
    },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    default: { query: mockQuery },
    query:   mockQuery,
  });
  _require.cache[AGENTS_PATH] = fakeMod(AGENTS_PATH, mockAgents);
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info:  vi.fn(),
    error: vi.fn(),
    warn:  vi.fn(),
    debug: vi.fn(),
  });

  if (skipAuth) {
    process.env.SKIP_AUTH = 'true';
  } else {
    delete process.env.SKIP_AUTH;
  }

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);

  const app = express();
  app.use(express.json());
  app.use('/api/copilot', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}

function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) {
    opts.payload = JSON.stringify(body);
    opts.headers = { 'content-type': 'application/json' };
  }
  return inject(app, opts).then(r => ({ status: r.statusCode, body: r.json() }));
}

// Simulate DB returning a matching run (owner access)
function mockRunFound()    { mockQuery.mockResolvedValueOnce({ rows: [{ id: 'run-1' }] }); }
// Simulate DB returning no matching run (wrong user or wrong org)
function mockRunNotFound() { mockQuery.mockResolvedValueOnce({ rows: [] }); }

afterEach(() => {
  delete process.env.SKIP_AUTH;
  // Clean up cached modules so each test gets a fresh router
  delete _require.cache[ROUTER_PATH];
});


// ── Ownership guard: owner passes, non-owner/wrong-org blocked ────────────────

describe('run ownership guard', () => {
  it('allows owner to GET /runs/:runId/status', async () => {
    const app = buildApp();
    mockRunFound();
    const { status } = await api(app, 'GET', '/api/copilot/runs/run-1/status');
    expect(status).toBe(200);
    expect(mockAgents.getRunStatus).toHaveBeenCalledWith('run-1', 'org-1');
  });

  it('blocks wrong user on GET /runs/:runId/status with 403', async () => {
    const app = buildApp({ userId: 'u-intruder' });
    mockRunNotFound();
    const { status, body } = await api(app, 'GET', '/api/copilot/runs/run-1/status');
    expect(status).toBe(403);
    expect(body.error).toMatch(/access denied/i);
    expect(mockAgents.getRunStatus).not.toHaveBeenCalled();
  });

  it('blocks non-existent run on GET status with 403', async () => {
    const app = buildApp();
    mockRunNotFound();
    const { status } = await api(app, 'GET', '/api/copilot/runs/ghost-id/status');
    expect(status).toBe(403);
  });

  it('allows owner to POST /runs/:runId/refine', async () => {
    const app = buildApp();
    mockRunFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/refine', {
      message: 'make it better',
    });
    expect(status).toBe(200);
    expect(mockAgents.refineRun).toHaveBeenCalled();
  });

  it('blocks wrong user on POST /runs/:runId/refine with 403', async () => {
    const app = buildApp({ userId: 'u-intruder' });
    mockRunNotFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/refine', {
      message: 'make it better',
    });
    expect(status).toBe(403);
    expect(mockAgents.refineRun).not.toHaveBeenCalled();
  });

  it('allows owner to POST /runs/:runId/skip-logic', async () => {
    const app = buildApp();
    mockRunFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/skip-logic', {
      request: 'if q1 < 5 skip q3',
    });
    expect(status).toBe(200);
  });

  it('blocks non-owner on POST /runs/:runId/skip-logic', async () => {
    const app = buildApp({ userId: 'u-intruder' });
    mockRunNotFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/skip-logic', {
      request: 'if q1 < 5 skip q3',
    });
    expect(status).toBe(403);
  });

  it('allows owner to POST /runs/:runId/questions', async () => {
    const app = buildApp();
    mockRunFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/questions', {});
    expect(status).toBe(200);
  });

  it('blocks non-owner on POST /runs/:runId/questions', async () => {
    const app = buildApp({ userId: 'u-intruder' });
    mockRunNotFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/questions', {});
    expect(status).toBe(403);
  });

  it('allows owner to DELETE /runs/:runId/questions/:qId', async () => {
    const app = buildApp();
    mockRunFound();
    const { status } = await api(app, 'DELETE', '/api/copilot/runs/run-1/questions/q1');
    expect(status).toBe(200);
  });

  it('blocks non-owner on DELETE /runs/:runId/questions/:qId', async () => {
    const app = buildApp({ userId: 'u-intruder' });
    mockRunNotFound();
    const { status } = await api(app, 'DELETE', '/api/copilot/runs/run-1/questions/q1');
    expect(status).toBe(403);
  });

  it('allows owner to POST /runs/:runId/reorder', async () => {
    const app = buildApp();
    mockRunFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/reorder', {
      order: ['q1', 'q2'],
    });
    expect(status).toBe(200);
  });

  it('blocks non-owner on POST /runs/:runId/reorder', async () => {
    const app = buildApp({ userId: 'u-intruder' });
    mockRunNotFound();
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/reorder', {
      order: ['q1', 'q2'],
    });
    expect(status).toBe(403);
  });

  it('allows owner to POST apply-recommendation', async () => {
    const app = buildApp();
    mockRunFound();
    const { status } = await api(
      app, 'POST',
      '/api/copilot/runs/run-1/apply-recommendation/add_skip_logic',
      {},
    );
    expect(status).toBe(200);
  });

  it('blocks non-owner on POST apply-recommendation', async () => {
    const app = buildApp({ userId: 'u-intruder' });
    mockRunNotFound();
    const { status } = await api(
      app, 'POST',
      '/api/copilot/runs/run-1/apply-recommendation/add_skip_logic',
      {},
    );
    expect(status).toBe(403);
  });
});


// ── SKIP_AUTH mode ────────────────────────────────────────────────────────────

describe('SKIP_AUTH bypasses ownership check', () => {
  it('allows any runId when SKIP_AUTH=true', async () => {
    const app = buildApp({ skipAuth: true });
    // No DB call expected — ownership guard is skipped entirely
    const { status } = await api(app, 'POST', '/api/copilot/runs/any-run/refine', {
      message: 'update it',
    });
    expect(status).toBe(200);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});


// ── DB error path ─────────────────────────────────────────────────────────────

describe('DB error during ownership check', () => {
  it('returns 500 when DB throws', async () => {
    const app = buildApp();
    mockQuery.mockRejectedValueOnce(new Error('db conn lost'));
    const { status } = await api(app, 'POST', '/api/copilot/runs/run-1/refine', {
      message: 'change it',
    });
    expect(status).toBe(500);
    expect(mockAgents.refineRun).not.toHaveBeenCalled();
  });
});
