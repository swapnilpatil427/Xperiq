import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH  = _require.resolve(resolve(__dirname, '../middleware/auth'));
const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const NARR_PATH  = _require.resolve(resolve(__dirname, '../lib/dashboardNarrative'));
const FORECAST_PATH = _require.resolve(resolve(__dirname, '../lib/forecast'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/dashboard'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; next(); },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/dashboard', router.default || router);
  return app;
}

describe('buildNarrative', () => {
  beforeEach(() => { delete _require.cache[NARR_PATH]; });
  it('writes a positive briefing when NPS rises', () => {
    const { buildNarrative } = _require(NARR_PATH);
    const n = buildNarrative({ nps: 45, npsDelta: 7, responses: 320, responsesDelta: 40, csat: 4.2, csatDelta: 0.1, activeSurveys: 5 });
    expect(n.sentiment).toBe('positive');
    expect(n.headline).toMatch(/positive/i);
    expect(n.paragraphs[0]).toMatch(/rose to 45/);
    expect(n.paragraphs.join(' ')).toMatch(/320 responses/);
  });
  it('flags attention when NPS falls', () => {
    const { buildNarrative } = _require(NARR_PATH);
    const n = buildNarrative({ nps: 30, npsDelta: -8, responses: 100, responsesDelta: -20, activeSurveys: 3 });
    expect(n.sentiment).toBe('negative');
    expect(n.headline).toMatch(/attention/i);
  });
  it('includes the top mover when present', () => {
    const { buildNarrative } = _require(NARR_PATH);
    const n = buildNarrative({ nps: 40, npsDelta: 0, responses: 50, responsesDelta: 0, activeSurveys: 2 },
      { topMover: { title: 'Q4 NPS', npsDelta: -12 } });
    expect(n.paragraphs.join(' ')).toMatch(/Q4 NPS/);
  });
});

describe('linearForecast', () => {
  beforeEach(() => { delete _require.cache[FORECAST_PATH]; });
  it('projects an upward trend', () => {
    const { linearForecast } = _require(FORECAST_PATH);
    const f = linearForecast([10, 20, 30, 40, 50], 3);
    expect(f.direction).toBe('up');
    expect(f.slope).toBeCloseTo(10, 1);
    expect(f.points[0]).toBeCloseTo(60, 0);
    expect(f.r2).toBeCloseTo(1, 1);
  });
  it('returns null for too-short series', () => {
    const { linearForecast } = _require(FORECAST_PATH);
    expect(linearForecast([5], 3)).toBeNull();
  });
});

describe('GET /api/dashboard/summary', () => {
  beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [{}] })); });
  it('returns KPIs with deltas + a narrative + a forecast', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM responses')) return { rows: [{ current: 320, prior: 280 }] };
      if (text.includes('active_surveys')) return { rows: [{ active_surveys: 5 }] };
      if (text.includes('FROM surveys s')) return { rows: [{ title: 'Q4 NPS', nps_now: 30, nps_then: 42 }] };
      if (text.includes('ORDER BY captured_at ASC')) return { rows: [{ avg_nps: 30 }, { avg_nps: 35 }, { avg_nps: 40 }, { avg_nps: 45 }] };
      if (text.includes('FROM org_metric_snapshots') && text.includes('captured_at <=')) return { rows: [{ avg_nps: 38, avg_csat: 4.1 }] };
      if (text.includes('FROM org_metric_snapshots')) return { rows: [{ avg_nps: 45, avg_csat: 4.2, captured_at: 't' }] };
      return { rows: [{}] };
    });
    const res = await inject(buildApp(), { method: 'GET', url: '/api/dashboard/summary' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kpis).toMatchObject({ nps: 45, npsDelta: 7, responses: 320, responsesDelta: 40, activeSurveys: 5 });
    expect(body.topMover).toMatchObject({ title: 'Q4 NPS' });
    expect(body.narrative.paragraphs.length).toBeGreaterThan(0);
    expect(body.forecast.direction).toBe('up');
    expect(Array.isArray(body.anomalies)).toBe(true);
  });
});

describe('GET /api/dashboard/insights', () => {
  it('returns an action board from open alerts + recent activity + discovery count', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM alert_events')) return { rows: [{ id: 'a1', alert_type: 'S-01', severity: 'critical', title: 'NPS drop', description: 'd', triggered_at: 't' }] };
      if (text.includes('FROM notifications')) return { rows: [{ id: 'n1', type: 'crystal.insight_ready', priority: 'info', title: 'Insights ready', created_at: 't' }] };
      if (text.includes('FROM insights')) return { rows: [{ discovery_count: 7 }] };
      return { rows: [{}] };
    });
    const res = await inject(buildApp(), { method: 'GET', url: '/api/dashboard/insights' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.actionItems[0]).toMatchObject({ severity: 'critical', alertType: 'S-01' });
    expect(body.recentActivity[0]).toMatchObject({ type: 'crystal.insight_ready' });
    expect(body.discoveryCount).toBe(7);
  });
});

describe('GET /api/dashboard/summary?days=90', () => {
  it('honors the time-range param in the narrative', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM responses')) return { rows: [{ current: 100, prior: 90 }] };
      if (text.includes('active_surveys')) return { rows: [{ active_surveys: 2 }] };
      if (text.includes('FROM surveys s')) return { rows: [] };
      if (text.includes('ORDER BY captured_at ASC')) return { rows: [] };
      if (text.includes('FROM org_metric_snapshots') && text.includes('captured_at <=')) return { rows: [] };
      if (text.includes('FROM org_metric_snapshots')) return { rows: [{ avg_nps: 40, avg_csat: 4 }] };
      return { rows: [{}] };
    });
    const res = await inject(buildApp(), { method: 'GET', url: '/api/dashboard/summary?days=90' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.days).toBe(90);
    expect(body.narrative.paragraphs.join(' ')).toMatch(/last 90 days/);
  });
});

describe('GET /api/dashboard/operations', () => {
  it('returns a survey health matrix with freshness + anomalies', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM surveys s')) return { rows: [
        { id: 's1', title: 'NPS', status: 'active', response_count: 120, last_response_at: new Date().toISOString(), nps: 40, csat: 4.1, captured_at: 't' },
      ] };
      if (text.includes('FROM alert_events')) return { rows: [{ id: 'a1', alert_type: 'S-01', severity: 'critical', title: 'NPS drop', triggered_at: 't' }] };
      return { rows: [] };
    });
    const res = await inject(buildApp(), { method: 'GET', url: '/api/dashboard/operations' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.surveys[0]).toMatchObject({ id: 's1', responseCount: 120, freshness: 'fresh' });
    expect(body.anomalies[0]).toMatchObject({ alertType: 'S-01', severity: 'critical' });
  });
});
