import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH    = _require.resolve(resolve(__dirname, '../middleware/auth'));
const DB_PATH      = _require.resolve(resolve(__dirname, '../lib/db'));
const LEDGER_PATH  = _require.resolve(resolve(__dirname, '../lib/creditLedger'));
const AGENTS_PATH  = _require.resolve(resolve(__dirname, '../lib/agentsClient'));
const INSIGHTS_ROUTER = _require.resolve(resolve(__dirname, '../routes/insights'));

let dbQuery;
let checkCreditsImpl;
let triggerManualSpy;

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function injectMocks() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    DEV_MODE: true,
    requireAuth: (req, _res, next) => { req.orgId = 'o1'; req.userId = 'u1'; next(); },
  });
  _require.cache[LEDGER_PATH] = fakeMod(LEDGER_PATH, {
    checkCredits: vi.fn(async (...a) => checkCreditsImpl(...a)),
    debitCredits: vi.fn(async () => ({})),
  });
  triggerManualSpy = vi.fn(async () => ({ ok: true }));
  _require.cache[AGENTS_PATH] = fakeMod(AGENTS_PATH, {
    triggerManualInsightRun: triggerManualSpy,
    getCheckpointBlob: vi.fn(async () => ({})),
    getCheckpointReadUrl: vi.fn(async () => 'https://blob'),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
}

function buildApp() {
  injectMocks();
  delete _require.cache[INSIGHTS_ROUTER];
  const insights = _require(INSIGHTS_ROUTER);
  const app = express();
  app.use(express.json());
  app.use('/api/insights', insights.default || insights);
  return app;
}

async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  let parsed = null;
  try { parsed = res.json(); } catch { parsed = res.payload; }
  return { status: res.statusCode, body: parsed };
}

const SURVEY_ROW = { id: 's1', title: 'S1', questions: [], org_id: 'o1', status: 'active', created_by: 'u1', response_count: 50 };

beforeEach(() => {
  checkCreditsImpl = async () => ({ ok: true, available: 1000, required: 40 });
  dbQuery = vi.fn(async (text) => {
    if (text.includes('FROM surveys')) return { rows: [SURVEY_ROW] };
    if (text.includes('FROM survey_insight_settings')) return { rows: [] };
    if (text.includes('FROM org_insight_defaults')) return { rows: [] };
    if (text.includes('COUNT(*)::int AS run_count')) return { rows: [{ run_count: 0 }] };
    if (text.startsWith('INSERT INTO agent_runs')) return { rows: [{ id: 'run-1' }] };
    return { rows: [] };
  });
});

describe('POST /api/insights/:surveyId/runs', () => {
  it('202 happy path returns run_id + status started and calls CrystalOS', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/insights/s1/runs', { mode: 'expert' });
    expect(status).toBe(202);
    expect(body.run_id).toBe('run-1');
    expect(body.status).toBe('started');
    expect(triggerManualSpy).toHaveBeenCalledTimes(1);
    expect(triggerManualSpy.mock.calls[0][0].mode).toBe('expert');
    expect(triggerManualSpy.mock.calls[0][0].runId).toBe('run-1');
  });

  it('402 when credits insufficient', async () => {
    checkCreditsImpl = async () => ({ ok: false, available: 1, required: 40 });
    const { status, body } = await api(buildApp(), 'POST', '/api/insights/s1/runs', { mode: 'expert' });
    expect(status).toBe(402);
    expect(body.code).toBe('INSUFFICIENT_CREDITS');
    expect(triggerManualSpy).not.toHaveBeenCalled();
  });

  it('429 when over daily limit', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM surveys')) return { rows: [SURVEY_ROW] };
      if (text.includes('COUNT(*)::int AS run_count')) return { rows: [{ run_count: 99 }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/insights/s1/runs', { mode: 'quick' });
    expect(status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
  });

  it('400 on invalid mode (validation)', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/insights/s1/runs', { mode: 'bogus' });
    expect(status).toBe(400);
  });

  it('400 when window_end is before window_start', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/insights/s1/runs', {
      mode: 'expert', window_start: '2026-06-10T00:00:00Z', window_end: '2026-06-01T00:00:00Z',
    });
    expect(status).toBe(400);
  });

  it('404 when survey not found', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status } = await api(buildApp(), 'POST', '/api/insights/missing/runs', { mode: 'quick' });
    expect(status).toBe(404);
  });
});

describe('POST /api/insights/:surveyId/runs/preview', () => {
  it('returns cost + corpus + sample size with no debit', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM surveys')) return { rows: [SURVEY_ROW] };
      if (text.includes('COUNT(*)::int AS corpus_size')) return { rows: [{ corpus_size: 300 }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/insights/s1/runs/preview', { mode: 'quick' });
    expect(status).toBe(200);
    expect(body.corpus_size).toBe(300);
    // quick sample cap default = 150 → min(300, 150)
    expect(body.sample_size).toBe(150);
    expect(typeof body.estimated_cost).toBe('number');
    expect(typeof body.estimated_duration_label).toBe('string');
  });
});
