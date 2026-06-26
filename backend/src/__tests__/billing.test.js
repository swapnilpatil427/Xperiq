/**
 * Integration tests for routes/billing.ts — the Billing & Credits API.
 * The credit ledger and payments libs are mocked; these tests verify route wiring,
 * permission gating, validation, and error mapping.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import inject from 'light-my-request';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const AUTH_PATH     = _require.resolve(resolve(__dirname, '../middleware/auth'));
const PERM_PATH     = _require.resolve(resolve(__dirname, '../middleware/requirePermission'));
const LEDGER_PATH   = _require.resolve(resolve(__dirname, '../lib/creditLedger'));
const PAYMENTS_PATH = _require.resolve(resolve(__dirname, '../lib/payments'));
const LOGGER_PATH   = _require.resolve(resolve(__dirname, '../lib/logger'));
const ROUTER_PATH   = _require.resolve(resolve(__dirname, '../routes/billing'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

// Hermetic: drop the mocked modules from the shared require cache so they never leak into
// other test files (e.g. outreach.test.js, which imports the REAL creditLedger).
afterAll(() => {
  delete _require.cache[LEDGER_PATH];
  delete _require.cache[PAYMENTS_PATH];
  delete _require.cache[ROUTER_PATH];
});

let ledger, payments;

class PaymentsNotConfiguredError extends Error { constructor() { super('not configured'); this.code = 'PAYMENTS_NOT_CONFIGURED'; } }

function buildApp({ permMiddleware } = {}) {
  const perm = permMiddleware ?? (() => (req, res, next) => next());
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'o1'; req.userId = 'u1'; next(); },
    DEV_MODE: true,
  });
  _require.cache[PERM_PATH] = fakeMod(PERM_PATH, {
    requirePermission: perm,
    evaluatePermission: vi.fn(async () => true),
    invalidatePermissionCache: vi.fn(),
  });
  _require.cache[LEDGER_PATH]   = fakeMod(LEDGER_PATH, ledger);
  _require.cache[PAYMENTS_PATH] = fakeMod(PAYMENTS_PATH, payments);
  _require.cache[LOGGER_PATH]   = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use(express.json());
  app.use('/api/billing', router.default || router);
  return app;
}

async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  let parsed; try { parsed = JSON.parse(res.payload); } catch { parsed = res.payload; }
  return { status: res.statusCode, body: parsed };
}

const sampleBalance = {
  plan_tier: 'growth', monthly_allowance: 12000, allowance_remaining: 8000, pack_balance: 0,
  available: 8000, overage_enabled: false, overage_ceiling: null, overage_used: 0,
  overage_remaining: 0, period_start: new Date().toISOString(), period_days: 30,
};

beforeEach(() => {
  ledger = {
    getBalance:      vi.fn(async () => sampleBalance),
    getUsageSummary: vi.fn(async () => [{ action_type: 'crystal_turn', total_credits: 300, event_count: 20, total_cost_usd: 0 }]),
    listLedger:      vi.fn(async () => ({ entries: [], total: 0 })),
    setOverage:      vi.fn(async () => ({ ...sampleBalance, overage_enabled: true, overage_ceiling: 5000 })),
    setPlan:         vi.fn(async () => ({ ...sampleBalance, plan_tier: 'enterprise' })),
    grantCredits:    vi.fn(async () => ({ ...sampleBalance, pack_balance: 5000 })),
  };
  payments = {
    CREDIT_PACKS: [{ id: 'insight_bundle', label: 'Insight Bundle', credits: 5000, price_usd: 49 }],
    isStripeConfigured: vi.fn(() => false),
    createCheckoutSession: vi.fn(async () => { throw new PaymentsNotConfiguredError(); }),
    PaymentsNotConfiguredError,
  };
});

describe('GET /api/billing/credits', () => {
  it('returns the balance for any authed user', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/billing/credits');
    expect(status).toBe(200);
    expect(body.available).toBe(8000);
    expect(ledger.getBalance).toHaveBeenCalledWith('o1');
  });
});

describe('GET /api/billing/config', () => {
  it('returns the cost table + plan allowances', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/billing/config');
    expect(status).toBe(200);
    expect(body.costs.insight_run).toBeGreaterThan(0);
    expect(body.plan_allowances.growth).toBeGreaterThan(0);
  });
});

describe('GET /api/billing/usage', () => {
  it('returns usage summary (billing:manage)', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/billing/usage');
    expect(status).toBe(200);
    expect(body.summary[0].action_type).toBe('crystal_turn');
  });
  it('403 when caller lacks billing:manage', async () => {
    const deny = () => (req, res) => res.status(403).json({ error: 'Forbidden' });
    const { status } = await api(buildApp({ permMiddleware: deny }), 'GET', '/api/billing/usage');
    expect(status).toBe(403);
  });
});

describe('PUT /api/billing/spend-cap', () => {
  it('updates overage settings', async () => {
    const { status, body } = await api(buildApp(), 'PUT', '/api/billing/spend-cap', { overage_enabled: true, overage_ceiling: 5000 });
    expect(status).toBe(200);
    expect(body.overage_enabled).toBe(true);
    expect(ledger.setOverage).toHaveBeenCalledWith('o1', true, 5000);
  });
  it('400 on invalid body', async () => {
    const { status } = await api(buildApp(), 'PUT', '/api/billing/spend-cap', { overage_enabled: 'yes' });
    expect(status).toBe(400);
  });
});

describe('POST /api/billing/plan', () => {
  it('changes the plan', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/billing/plan', { plan_tier: 'enterprise' });
    expect(status).toBe(200);
    expect(body.plan_tier).toBe('enterprise');
    expect(ledger.setPlan).toHaveBeenCalledWith('o1', 'enterprise', 'u1');
  });
  it('400 on unknown plan tier', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/billing/plan', { plan_tier: 'platinum' });
    expect(status).toBe(400);
  });
});

describe('POST /api/billing/grant', () => {
  it('grants credits', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/billing/grant', { credits: 5000, note: 'top-up' });
    expect(status).toBe(200);
    expect(body.pack_balance).toBe(5000);
    expect(ledger.grantCredits).toHaveBeenCalled();
  });
  it('400 on non-positive credits', async () => {
    const { status } = await api(buildApp(), 'POST', '/api/billing/grant', { credits: 0 });
    expect(status).toBe(400);
  });
});

describe('credit packs & checkout', () => {
  it('lists packs + stripe status', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/api/billing/packs');
    expect(status).toBe(200);
    expect(body.packs).toHaveLength(1);
    expect(body.stripe_enabled).toBe(false);
  });
  it('501 when payments not configured', async () => {
    const { status, body } = await api(buildApp(), 'POST', '/api/billing/checkout', { pack_id: 'insight_bundle' });
    expect(status).toBe(501);
    expect(body.code).toBe('PAYMENTS_NOT_CONFIGURED');
  });
});
