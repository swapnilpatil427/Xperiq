import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const _require   = createRequire(import.meta.url);

const AUTH_PATH          = _require.resolve(resolve(__dirname, '../middleware/auth'));
const REQUIRE_ROLE_PATH  = _require.resolve(resolve(__dirname, '../middleware/requireRole'));
const DB_PATH            = _require.resolve(resolve(__dirname, '../lib/db'));
const LOGGER_PATH        = _require.resolve(resolve(__dirname, '../lib/logger'));
const METRICS_PATH       = _require.resolve(resolve(__dirname, '../lib/metrics'));
const AGENTS_PATH        = _require.resolve(resolve(__dirname, '../lib/agentsClient'));
const REDIS_STREAM_PATH  = _require.resolve(resolve(__dirname, '../lib/redisStream'));
const AUTO_ANALYZE_PATH  = _require.resolve(resolve(__dirname, '../triggers/autoAnalyze'));
const SURVEYS_ROUTER     = _require.resolve(resolve(__dirname, '../routes/surveys'));
const ORGS_ROUTER        = _require.resolve(resolve(__dirname, '../routes/orgs'));

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

let mockQuery;

// Surveys router has an `ensureColumns()` call at module-load time whose async
// queries fire concurrently with the first test. Using SQL-content routing in
// the mock implementation keeps test expectations independent of call order.
function makeSurveyQueryMock(overrides = {}) {
  return vi.fn().mockImplementation(async (sql) => {
    const s = sql || '';
    // ensureColumns: ALTER TABLE / DO $$ — safe to ignore
    if (s.includes('ALTER TABLE') || s.includes('DO $$')) return { rows: [] };
    // daily series (check BEFORE aggregate — both have COUNT + FROM responses)
    if (s.includes("INTERVAL '30 days'") && s.includes('survey_id')) {
      return overrides.daily ?? { rows: [] };
    }
    // ownership check
    if (s.includes('FROM surveys WHERE id =') || s.includes('FROM surveys WHERE s.id =')) {
      return overrides.ownership ?? { rows: [] };
    }
    // aggregate stats
    if (s.includes('COUNT(') && s.includes('FROM responses') && s.includes('survey_id')) {
      return overrides.agg ?? { rows: [{ total_responses: 0, avg_nps: null, promoters: 0, passives: 0, detractors: 0 }] };
    }
    return { rows: [] };
  });
}

function makeOrgQueryMock(overrides = {}) {
  return vi.fn().mockImplementation(async (sql) => {
    const s = sql || '';
    // totals query
    if (s.includes('COUNT(DISTINCT s.id)')) {
      return overrides.totals ?? { rows: [{ total_surveys: 0, active_surveys: 0, total_responses: 0, avg_nps: null }] };
    }
    // org daily series
    if (s.includes("INTERVAL '30 days'") && !s.includes('survey_id')) {
      return overrides.daily ?? { rows: [] };
    }
    // top surveys
    if (s.includes('ORDER BY response_count DESC')) {
      return overrides.topSurveys ?? { rows: [] };
    }
    return { rows: [] };
  });
}

function buildSurveysApp(overrides = {}) {
  mockQuery = makeSurveyQueryMock(overrides);

  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'org-1'; req.userId = 'u-1'; next(); },
  });
  _require.cache[REQUIRE_ROLE_PATH] = fakeMod(REQUIRE_ROLE_PATH, {
    requireRole: () => (req, res, next) => next(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    default: { query: mockQuery },
    query:   mockQuery,
  });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(),
  });
  _require.cache[METRICS_PATH] = fakeMod(METRICS_PATH, {
    surveysCreated: { inc: vi.fn() },
  });
  _require.cache[AGENTS_PATH] = fakeMod(AGENTS_PATH, {
    triggerInsightGeneration: vi.fn().mockResolvedValue({}),
  });
  _require.cache[REDIS_STREAM_PATH] = fakeMod(REDIS_STREAM_PATH, {
    publishResponseEvent: vi.fn().mockResolvedValue(undefined),
  });
  _require.cache[AUTO_ANALYZE_PATH] = fakeMod(AUTO_ANALYZE_PATH, {
    maybeAutoAnalyze: vi.fn().mockResolvedValue(undefined),
  });

  delete _require.cache[SURVEYS_ROUTER];
  const router = _require(SURVEYS_ROUTER);

  const app = express();
  app.use(express.json());
  app.use('/api/surveys', router);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}

function buildOrgsApp(overrides = {}) {
  mockQuery = makeOrgQueryMock(overrides);

  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'org-1'; req.userId = 'u-1'; next(); },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    default: { query: mockQuery },
    query:   mockQuery,
  });

  delete _require.cache[ORGS_ROUTER];
  const router = _require(ORGS_ROUTER);

  const app = express();
  app.use(express.json());
  app.use('/api/orgs', router);
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

afterEach(() => {
  delete _require.cache[SURVEYS_ROUTER];
  delete _require.cache[ORGS_ROUTER];
  vi.clearAllMocks();
});

// ── Survey analytics ──────────────────────────────────────────────────────────

describe('GET /api/surveys/:id/analytics', () => {
  it('returns 404 when survey not found or wrong org', async () => {
    const app = buildSurveysApp({ ownership: { rows: [] } });
    const { status, body } = await api(app, 'GET', '/api/surveys/survey-99/analytics');
    expect(status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 200 with correct shape when survey exists', async () => {
    const app = buildSurveysApp({
      ownership: { rows: [{ id: 'survey-1', title: 'Test' }] },
      agg:       { rows: [{ total_responses: 100, avg_nps: '52.5', promoters: 50, passives: 30, detractors: 20, completed_responses: 100 }] },
      daily:     { rows: [{ day: '2024-01-01', count: 10 }, { day: '2024-01-02', count: 15 }] },
    });
    const { status, body } = await api(app, 'GET', '/api/surveys/survey-1/analytics');
    expect(status).toBe(200);
    expect(body.total_responses).toBe(100);
    expect(body.avg_nps).toBeCloseTo(52.5);
    expect(body.completion_rate).toBe(100);
    expect(body.nps_distribution).toEqual({ promoters: 50, passives: 30, detractors: 20 });
    expect(body.responses_by_day).toHaveLength(2);
  });

  it('returns avg_nps as null when no NPS responses', async () => {
    const app = buildSurveysApp({
      ownership: { rows: [{ id: 's', title: 'T' }] },
      agg:       { rows: [{ total_responses: 5, avg_nps: null, promoters: 0, passives: 0, detractors: 0 }] },
    });
    const { status, body } = await api(app, 'GET', '/api/surveys/s/analytics');
    expect(status).toBe(200);
    expect(body.avg_nps).toBeNull();
    expect(body.total_responses).toBe(5);
  });

  it('returns completion_rate 0 and nps_distribution zeros when no responses', async () => {
    const app = buildSurveysApp({
      ownership: { rows: [{ id: 's', title: 'T' }] },
      agg:       { rows: [{ total_responses: 0, avg_nps: null, promoters: 0, passives: 0, detractors: 0 }] },
    });
    const { status, body } = await api(app, 'GET', '/api/surveys/s/analytics');
    expect(status).toBe(200);
    expect(body.total_responses).toBe(0);
    expect(body.completion_rate).toBe(0);
    expect(body.nps_distribution).toEqual({ promoters: 0, passives: 0, detractors: 0 });
  });

  it('returns 500 when DB throws on the ownership check', async () => {
    const app = buildSurveysApp();
    // Override with an error implementation just for ownership
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('ALTER TABLE') || sql.includes('DO $$')) return { rows: [] };
      throw new Error('DB down');
    });
    const { status } = await api(app, 'GET', '/api/surveys/survey-1/analytics');
    expect(status).toBe(500);
  });
});

// ── Org analytics ─────────────────────────────────────────────────────────────

describe('GET /api/orgs/me/analytics', () => {
  it('returns 200 with correct shape', async () => {
    const app = buildOrgsApp({
      totals:     { rows: [{ total_surveys: 10, active_surveys: 3, total_responses: 500, avg_nps: '61.0' }] },
      daily:      { rows: [{ day: '2024-01-01', count: 20 }] },
      topSurveys: { rows: [{ id: 's1', title: 'Survey A', response_count: 300 }] },
    });
    const { status, body } = await api(app, 'GET', '/api/orgs/me/analytics');
    expect(status).toBe(200);
    expect(body.total_surveys).toBe(10);
    expect(body.active_surveys).toBe(3);
    expect(body.total_responses).toBe(500);
    expect(body.avg_nps).toBeCloseTo(61.0);
    expect(body.responses_by_day).toHaveLength(1);
    expect(body.top_surveys).toHaveLength(1);
    expect(body.top_surveys[0].title).toBe('Survey A');
  });

  it('returns zeros when org has no data', async () => {
    const app = buildOrgsApp({
      totals: { rows: [{ total_surveys: 0, active_surveys: 0, total_responses: 0, avg_nps: null }] },
    });
    const { status, body } = await api(app, 'GET', '/api/orgs/me/analytics');
    expect(status).toBe(200);
    expect(body.total_surveys).toBe(0);
    expect(body.avg_nps).toBeNull();
    expect(body.responses_by_day).toHaveLength(0);
    expect(body.top_surveys).toHaveLength(0);
  });

  it('returns 500 when DB throws', async () => {
    const app = buildOrgsApp();
    mockQuery.mockImplementation(async () => { throw new Error('connection refused'); });
    const { status } = await api(app, 'GET', '/api/orgs/me/analytics');
    expect(status).toBe(500);
  });
});
