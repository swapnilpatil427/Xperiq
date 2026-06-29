import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH      = _require.resolve(resolve(__dirname, '../middleware/auth'));
const DB_PATH        = _require.resolve(resolve(__dirname, '../lib/db'));
const LEDGER_PATH    = _require.resolve(resolve(__dirname, '../lib/creditLedger'));
const AGENTS_PATH    = _require.resolve(resolve(__dirname, '../lib/agentsClient'));
const REPORTS_ROUTER = _require.resolve(resolve(__dirname, '../routes/reports'));

let dbQuery;
let checkCreditsImpl;
let triggerCustomSpy;

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
  triggerCustomSpy = vi.fn(async () => ({ ok: true }));
  _require.cache[AGENTS_PATH] = fakeMod(AGENTS_PATH, {
    triggerCustomAnalysis: triggerCustomSpy,
    getCheckpointBlob: vi.fn(async () => ({ schema_version: 2, executive_summary: 'hi' })),
    getCheckpointReadUrl: vi.fn(async () => 'https://blob'),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
}

function buildApp() {
  injectMocks();
  delete _require.cache[REPORTS_ROUTER];
  const reports = _require(REPORTS_ROUTER);
  const app = express();
  app.use(express.json());
  app.use('/api/reports', reports.default || reports);
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

const SURVEY_ROW = { id: 's1', title: 'S1', org_id: 'o1', status: 'active', created_by: 'u1' };

beforeEach(() => {
  checkCreditsImpl = async () => ({ ok: true, available: 1000, required: 25 });
  dbQuery = vi.fn(async (text) => {
    if (text.includes('FROM surveys')) return { rows: [SURVEY_ROW] };
    if (text.includes('FROM survey_insight_settings')) return { rows: [] };
    if (text.includes('FROM org_insight_defaults')) return { rows: [] };
    if (text.includes('AS corpus_size')) return { rows: [{ corpus_size: 120 }] };
    if (text.includes('AS run_count')) return { rows: [{ run_count: 0 }] };
    if (text.startsWith('INSERT INTO agent_runs')) return { rows: [{ id: 'run-1' }] };
    if (text.startsWith('INSERT INTO custom_reports')) return { rows: [{ id: 'rep-1', slug: 'my-report-abc123', status: 'pending' }] };
    return { rows: [] };
  });
});

describe('POST /api/reports/custom', () => {
  it('202 happy path returns report_id + run_id + pending + slug and calls CrystalOS', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/reports/custom', {
      survey_id: 's1', name: 'My Report', filter_spec: { narrative_depth: 'summary' },
    });
    expect(status).toBe(202);
    expect(body.report_id).toBe('rep-1');
    expect(body.run_id).toBe('run-1');
    expect(body.status).toBe('pending');
    expect(body.slug).toBe('my-report-abc123');
    expect(triggerCustomSpy).toHaveBeenCalledTimes(1);
    expect(triggerCustomSpy.mock.calls[0][0].reportId).toBe('rep-1');
    expect(triggerCustomSpy.mock.calls[0][0].runId).toBe('run-1');
  });

  it('402 when credits insufficient', async () => {
    checkCreditsImpl = async () => ({ ok: false, available: 1, required: 25 });
    const { status, body } = await api(buildApp(), 'POST', '/api/reports/custom', {
      survey_id: 's1', name: 'My Report', filter_spec: {},
    });
    expect(status).toBe(402);
    expect(body.code).toBe('INSUFFICIENT_CREDITS');
    expect(triggerCustomSpy).not.toHaveBeenCalled();
  });

  it('429 when over the daily Custom Analysis limit', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM surveys')) return { rows: [SURVEY_ROW] };
      if (text.includes('AS corpus_size')) return { rows: [{ corpus_size: 120 }] };
      if (text.includes('AS run_count')) return { rows: [{ run_count: 3 }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/reports/custom', {
      survey_id: 's1', name: 'My Report', filter_spec: {},
    });
    expect(status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
    expect(triggerCustomSpy).not.toHaveBeenCalled();
  });

  it('400 when name is missing (validation)', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/reports/custom', {
      survey_id: 's1', filter_spec: {},
    });
    expect(status).toBe(400);
  });

  it('400 when date_to is before date_from', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/reports/custom', {
      survey_id: 's1', name: 'R',
      filter_spec: { date_from: '2026-06-10T00:00:00Z', date_to: '2026-06-01T00:00:00Z' },
    });
    expect(status).toBe(400);
  });

  it('404 when survey not found', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status } = await api(buildApp(), 'POST', '/api/reports/custom', {
      survey_id: 'missing', name: 'R', filter_spec: {},
    });
    expect(status).toBe(404);
  });
});

describe('POST /api/reports/custom/preview', () => {
  it('returns cost + corpus + sample size with low_confidence flag and no debit', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM surveys')) return { rows: [SURVEY_ROW] };
      if (text.includes('AS corpus_size')) return { rows: [{ corpus_size: 12 }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/reports/custom/preview', {
      survey_id: 's1', filter_spec: {},
    });
    expect(status).toBe(200);
    expect(body.corpus_size).toBe(12);
    expect(body.sample_size).toBe(12);
    // corpus 12 < 30 (default min_n_for_nps) → low_confidence true
    expect(body.low_confidence).toBe(true);
    // 12 responses ≤ 500 → base cost (default 25)
    expect(body.estimated_cost).toBe(25);
  });

  it('cost scales up by corpus tier', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM surveys')) return { rows: [SURVEY_ROW] };
      if (text.includes('AS corpus_size')) return { rows: [{ corpus_size: 1500 }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/reports/custom/preview', {
      survey_id: 's1', filter_spec: {},
    });
    expect(status).toBe(200);
    // 1500 responses → ≤2000 tier → 50 credits, and ≥30 → not low confidence
    expect(body.estimated_cost).toBe(50);
    expect(body.low_confidence).toBe(false);
  });
});

describe('GET /api/reports/custom', () => {
  it('lists reports for the org', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM custom_reports')) {
        return { rows: [
          { id: 'rep-1', name: 'A', status: 'completed', trust_score_avg: '72.5', corpus_coverage_pct: '88.0' },
          { id: 'rep-2', name: 'B', status: 'pending', trust_score_avg: null, corpus_coverage_pct: null },
        ] };
      }
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/reports/custom?survey_id=s1');
    expect(status).toBe(200);
    expect(body.reports).toHaveLength(2);
    expect(body.reports[0].trust_score_avg).toBe(72.5);
  });
});

describe('GET /api/reports/custom/:reportId', () => {
  it('returns report + ISOLATED custom_report_insights only (never insights table) + document', async () => {
    let insightsQueryText = null;
    dbQuery = vi.fn(async (text, params) => {
      if (text.includes('FROM custom_reports')) {
        return { rows: [{ id: 'rep-1', name: 'A', status: 'completed', blob_ref: 'blob://x', trust_score_avg: '70.0' }] };
      }
      if (text.includes('FROM custom_report_insights')) {
        insightsQueryText = text;
        return { rows: [{ id: 'ci-1', custom_report_id: 'rep-1', headline: 'H', priority: '0.900' }] };
      }
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'GET', '/api/reports/custom/rep-1');
    expect(status).toBe(200);
    expect(body.report.id).toBe('rep-1');
    expect(body.insights).toHaveLength(1);
    expect(body.insights[0].priority).toBe(0.9);
    // Isolation assertion: detail insights come from custom_report_insights, NOT insights.
    expect(insightsQueryText).toContain('FROM custom_report_insights');
    expect(insightsQueryText).not.toMatch(/FROM insights\b/);
    // Non-prod: blob inlined as `document`.
    expect(body.document).toEqual({ schema_version: 2, executive_summary: 'hi' });
  });

  it('404 when report not found', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status } = await api(buildApp(), 'GET', '/api/reports/custom/missing');
    expect(status).toBe(404);
  });
});
