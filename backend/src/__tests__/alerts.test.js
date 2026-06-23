import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH  = _require.resolve(resolve(__dirname, '../middleware/auth'));
const PERM_PATH  = _require.resolve(resolve(__dirname, '../middleware/requirePermission'));
const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const ENGINE_PATH = _require.resolve(resolve(__dirname, '../lib/alertEngine'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/alerts'));

let dbQuery, engineMock;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; next(); },
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: () => (req, res, next) => next(), invalidatePermissionCache: vi.fn(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[ENGINE_PATH] = fakeMod(ENGINE_PATH, engineMock);
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/alerts', router.default || router);
  return app;
}
async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [] }));
  engineMock = { evaluateSurveyAlerts: vi.fn(async () => []), transitionAlert: vi.fn(async () => null) };
});

describe('alert rules', () => {
  it('POST / creates a rule', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO alert_rules')) return { rows: [{ id: 'r1', org_id: 'test-org', alert_type: 'S-01', name: 'NPS drop', severity: 'critical', is_active: true, threshold_config: {} }] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/api/alerts', { alertType: 'S-01', name: 'NPS drop', severity: 'critical' });
    expect(status).toBe(201);
    expect(body.rule).toMatchObject({ alertType: 'S-01', severity: 'critical' });
  });

  it('POST / 400s without required fields', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/alerts', { name: 'x' });
    expect(status).toBe(400);
  });

  it('GET /events filters by status', async () => {
    const seen = [];
    dbQuery = vi.fn(async (text, params) => { seen.push({ text, params }); return { rows: [] }; });
    await api(buildApp(), 'GET', '/api/alerts/events?status=active&severity=critical');
    const q = seen.find((s) => s.text.includes('FROM alert_events'));
    expect(q.params).toContain('active');
    expect(q.params).toContain('critical');
  });
});

describe('alert state actions', () => {
  it('acknowledges an event', async () => {
    engineMock.transitionAlert = vi.fn(async () => ({ id: 'ev1', status: 'acknowledged', severity: 'critical', triggered_at: 't' }));
    const { status, body } = await api(buildApp(), 'POST', '/api/alerts/events/ev1/acknowledge');
    expect(status).toBe(200);
    expect(body.event.status).toBe('acknowledged');
    expect(engineMock.transitionAlert).toHaveBeenCalledWith('ev1', 'test-org', 'acknowledge', 'test-user', {});
  });

  it('404s when the event is missing', async () => {
    engineMock.transitionAlert = vi.fn(async () => null);
    const { status } = await api(buildApp(), 'POST', '/api/alerts/events/x/resolve');
    expect(status).toBe(404);
  });

  it('snooze computes an until from hours', async () => {
    engineMock.transitionAlert = vi.fn(async () => ({ id: 'ev1', status: 'snoozed', severity: 'warning', triggered_at: 't' }));
    const { status } = await api(buildApp(), 'POST', '/api/alerts/events/ev1/snooze', { hours: 12 });
    expect(status).toBe(200);
    const extra = engineMock.transitionAlert.mock.calls[0][4];
    expect(extra.snoozeUntil).toBeInstanceOf(Date);
  });
});

describe('GET /api/alerts/types', () => {
  it('returns the full 36-type catalog grouped by category', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/alerts/types');
    expect(status).toBe(200);
    expect(body.types.length).toBe(37); // 36 taxonomy + S-08 predictive
    expect(body.types.find((t) => t.code === 'S-01')).toMatchObject({ category: 'S', evaluator: true });
  });
});

describe('PUT /api/alerts/subscriptions', () => {
  it('inserts a new subscription when none exists', async () => {
    const calls = [];
    dbQuery = vi.fn(async (text) => { calls.push(text); return { rows: [], rowCount: text.startsWith('UPDATE') ? 0 : 1 }; });
    const { status } = await api(buildApp(), 'PUT', '/api/alerts/subscriptions', { alertType: 'S-01', emailEnabled: true });
    expect(status).toBe(200);
    expect(calls.some((c) => c.startsWith('INSERT INTO alert_subscriptions'))).toBe(true);
  });

  it('400s without alertType', async () => {
    const { status } = await api(buildApp(), 'PUT', '/api/alerts/subscriptions', {});
    expect(status).toBe(400);
  });
});

describe('manual evaluate', () => {
  it('runs evaluation for a survey', async () => {
    engineMock.evaluateSurveyAlerts = vi.fn(async () => [{ id: 'ev1', severity: 'critical', status: 'active', triggered_at: 't' }]);
    const { status, body } = await api(buildApp(), 'POST', '/api/alerts/evaluate/survey-1');
    expect(status).toBe(200);
    expect(body.fired).toBe(1);
    expect(engineMock.evaluateSurveyAlerts).toHaveBeenCalledWith('test-org', 'survey-1');
  });
});
