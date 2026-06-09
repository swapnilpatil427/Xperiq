import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const { generateChartSpec } = _require(resolve(__dirname, '../lib/chartSpec'));
const { buildReportHtml } = _require(resolve(__dirname, '../lib/visualReport'));

const AUTH_PATH = _require.resolve(resolve(__dirname, '../middleware/auth'));
const DB_PATH = _require.resolve(resolve(__dirname, '../lib/db'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/visual'));
let dbQuery = null;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'o1'; req.userId = 'u1'; next(); },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery || (async () => ({ rows: [] })), default: { query: dbQuery || (async () => ({ rows: [] })) } });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/visual', router);
  return app;
}

describe('generateChartSpec', () => {
  it('builds a bar chart of NPS by region', () => {
    const s = generateChartSpec('Show me NPS by region as a bar chart');
    expect(s.chartType).toBe('bar');
    expect(s.y).toBe('nps');
    expect(s.x).toBe('region');
    expect(s.aggregate).toBe('avg');
    expect(s.title).toMatch(/NPS by region/i);
  });

  it('infers a line chart for trend/over-time requests', () => {
    const s = generateChartSpec('How has CSAT trended over time?');
    expect(s.chartType).toBe('line');
    expect(s.y).toBe('csat');
    expect(s.x).toBe('day');
  });

  it('infers a pie chart for distribution requests', () => {
    const s = generateChartSpec('Give me the sentiment distribution as a pie');
    expect(s.chartType).toBe('pie');
    expect(s.y).toBe('sentiment');
  });

  it('counts for volume metrics', () => {
    const s = generateChartSpec('responses by survey');
    expect(s.y).toBe('responses');
    expect(s.aggregate).toBe('count');
  });

  it('falls back sensibly for a vague request', () => {
    const s = generateChartSpec('show me something');
    expect(s.chartType).toBeDefined();
    expect(s.x).toBe('survey');
  });
});

describe('POST /api/visual/chart-spec', () => {
  it('returns a spec for a NL request', async () => {
    const res = await inject(buildApp(), {
      method: 'POST', url: '/api/visual/chart-spec',
      payload: JSON.stringify({ request: 'NPS by region bar chart' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().spec).toMatchObject({ chartType: 'bar', y: 'nps', x: 'region' });
  });

  it('400s on an empty request', async () => {
    const res = await inject(buildApp(), {
      method: 'POST', url: '/api/visual/chart-spec',
      payload: JSON.stringify({ request: '' }), headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('buildReportHtml', () => {
  it('builds a self-contained HTML report with KPIs + topics', () => {
    const html = buildReportHtml({
      survey: { title: 'Q4 NPS' },
      metrics: { nps: 42, csat: 4.1, responseCount: 300 },
      topics: [{ name: 'Shipping', sentiment: 'negative', volume: 40 }],
      summary: 'NPS is healthy.',
    });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Q4 NPS');
    expect(html).toContain('42');
    expect(html).toContain('Shipping');
    expect(html).toContain('NPS is healthy.');
  });
  it('escapes HTML in survey titles (no injection)', () => {
    const html = buildReportHtml({ survey: { title: '<script>x</script>' }, metrics: {}, topics: [] });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('GET /api/visual/report/:surveyId', () => {
  it('returns an HTML report for a survey', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM surveys')) return { rows: [{ id: 's1', title: 'My Survey' }] };
      if (text.includes('survey_metric_snapshots')) return { rows: [{ nps: 50, csat: 4.2, response_count: 120 }] };
      if (text.includes('survey_topics')) return { rows: [{ name: 'Support', sentiment: 'positive', volume: 30 }] };
      return { rows: [] };
    });
    const res = await inject(buildApp(), { method: 'GET', url: '/api/visual/report/s1' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.payload).toContain('My Survey');
    expect(res.payload).toContain('Support');
    dbQuery = null;
  });

  it('404s for an unknown survey', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const res = await inject(buildApp(), { method: 'GET', url: '/api/visual/report/nope' });
    expect(res.statusCode).toBe(404);
    dbQuery = null;
  });
});
