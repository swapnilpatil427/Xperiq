/**
 * Tests for the Crystal action proposal outcome-tracking routes in routes/insights.ts
 *
 *   POST /api/insights/:surveyId/crystal/proposals  — UPSERT proposal outcome
 *   GET  /api/insights/:surveyId/crystal/proposals  — list recent proposals
 *
 * Uses the fakeMod/cache-injection pattern (see survey-groups.test.js) so no real
 * DB or agents service connection is needed. The router is mounted at /api/insights
 * per index.ts convention.
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
const DB_PATH     = _require.resolve(resolve(__dirname, '../lib/db'));
const AGENTS_PATH = _require.resolve(resolve(__dirname, '../lib/agentsClient'));
const LOGGER_PATH = _require.resolve(resolve(__dirname, '../lib/logger'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/insights'));

let dbQuery;

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => {
      req.orgId  = 'o1';
      req.userId = 'u1';
      next();
    },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    query: dbQuery,
    default: { query: dbQuery },
  });
  _require.cache[AGENTS_PATH] = fakeMod(AGENTS_PATH, {
    triggerInsightGeneration: vi.fn(async () => {}),
    default: { triggerInsightGeneration: vi.fn(async () => {}) },
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
  app.use('/api/insights', router.default || router);
  return app;
}

describe('POST /api/insights/:surveyId/crystal/proposals', () => {
  beforeEach(() => {
    dbQuery = vi.fn();
  });

  it('inserts a new proposal then updates the same proposalKey (upsert path)', async () => {
    // First call: INSERT (no conflict) → status emitted
    // Second call: same proposalKey → DO UPDATE → status succeeded
    // The insights router runs ensureTopicsTables() CREATE/ALTER statements on
    // import, so the shared mock receives unrelated calls too. Count only the
    // proposal upserts to assert the insert→update path.
    const upserts = [];
    dbQuery = vi.fn(async (sql, params) => {
      if (!sql.includes('crystal_action_proposals')) return { rows: [] };
      expect(sql).toContain('INSERT INTO crystal_action_proposals');
      expect(sql).toContain('ON CONFLICT (org_id, proposal_key)');
      // org_id is always param $1
      expect(params[0]).toBe('o1');
      upserts.push(params);
      if (upserts.length === 1) {
        return { rows: [{ id: 'p-1', proposal_key: 'pk-1', status: 'emitted', outcome_ref: null }] };
      }
      return { rows: [{ id: 'p-1', proposal_key: 'pk-1', status: 'succeeded', outcome_ref: 'wf-9' }] };
    });

    const app = buildApp();

    const res1 = await inject(app, {
      method: 'POST',
      url: '/api/insights/s1/crystal/proposals',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proposalKey: 'pk-1',
        type: 'create_workflow',
        params: { foo: 'bar' },
        priority: 'high',
        businessRationale: 'Reduce churn',
        confidence: 0.8,
        status: 'emitted',
      }),
    });

    expect(res1.statusCode).toBe(200);
    expect(res1.json()).toMatchObject({ id: 'p-1', status: 'emitted' });

    const res2 = await inject(app, {
      method: 'POST',
      url: '/api/insights/s1/crystal/proposals',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proposalKey: 'pk-1',
        type: 'create_workflow',
        status: 'succeeded',
        outcomeRef: 'wf-9',
      }),
    });

    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toMatchObject({ id: 'p-1', status: 'succeeded', outcome_ref: 'wf-9' });
    expect(upserts).toHaveLength(2);
    // Second call carries the updated status + outcome ref (params order: ...status@$10, outcome_ref@$11)
    expect(upserts[1][9]).toBe('succeeded');
    expect(upserts[1][10]).toBe('wf-9');
  });

  it('returns 400 when type is missing', async () => {
    const proposalCalls = [];
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('crystal_action_proposals')) proposalCalls.push(sql);
      return { rows: [] };
    });
    const res = await inject(buildApp(), {
      method: 'POST',
      url: '/api/insights/s1/crystal/proposals',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalKey: 'pk-1', status: 'emitted' }),
    });
    expect(res.statusCode).toBe(400);
    // Validation rejects before touching the DB
    expect(proposalCalls).toHaveLength(0);
  });

  it('returns 400 when status is missing', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const res = await inject(buildApp(), {
      method: 'POST',
      url: '/api/insights/s1/crystal/proposals',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalKey: 'pk-1', type: 'create_workflow' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on a DB error', async () => {
    dbQuery = vi.fn(async () => { throw new Error('db down'); });
    const res = await inject(buildApp(), {
      method: 'POST',
      url: '/api/insights/s1/crystal/proposals',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalKey: 'pk-1', type: 'create_workflow', status: 'emitted' }),
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /api/insights/:surveyId/crystal/proposals', () => {
  beforeEach(() => {
    dbQuery = vi.fn();
  });

  it('lists proposals scoped to the org', async () => {
    dbQuery = vi.fn(async (sql, params) => {
      if (!sql.includes('crystal_action_proposals')) return { rows: [] };
      expect(sql).toContain('FROM crystal_action_proposals');
      expect(sql).toContain('WHERE org_id = $1');
      expect(sql).toContain('AND survey_id = $2');
      expect(params).toEqual(['o1', 's1']);
      return { rows: [{ id: 'p-1', status: 'emitted' }, { id: 'p-2', status: 'succeeded' }] };
    });

    const res = await inject(buildApp(), {
      method: 'GET',
      url: '/api/insights/s1/crystal/proposals',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().proposals).toHaveLength(2);
  });

  it('filters by status when provided', async () => {
    dbQuery = vi.fn(async (sql, params) => {
      if (!sql.includes('crystal_action_proposals')) return { rows: [] };
      expect(sql).toContain('AND status = $3');
      expect(params).toEqual(['o1', 's1', 'succeeded']);
      return { rows: [{ id: 'p-2', status: 'succeeded' }] };
    });

    const res = await inject(buildApp(), {
      method: 'GET',
      url: '/api/insights/s1/crystal/proposals?status=succeeded',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().proposals).toHaveLength(1);
  });

  it('returns an empty list on a DB error (graceful fallback)', async () => {
    dbQuery = vi.fn(async () => { throw new Error('boom'); });
    const res = await inject(buildApp(), {
      method: 'GET',
      url: '/api/insights/s1/crystal/proposals',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposals).toEqual([]);
  });
});
