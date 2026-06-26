/**
 * Integration tests for routes/internal-metering.ts — the credit ledger as a callable
 * service (X-Internal-Key auth). Verifies key gating, action→cost resolution, and the
 * 402 mapping for InsufficientCreditsError.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import inject from 'light-my-request';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const LEDGER_PATH = _require.resolve(resolve(__dirname, '../lib/creditLedger'));
const LOGGER_PATH = _require.resolve(resolve(__dirname, '../lib/logger'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/internal-metering'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

// Hermetic: drop the mocked creditLedger from the shared require cache after this file.
afterAll(() => {
  delete _require.cache[LEDGER_PATH];
  delete _require.cache[ROUTER_PATH];
});

const KEY = process.env.AGENTS_INTERNAL_KEY || 'dev-internal-key-change-in-prod';

class InsufficientCreditsError extends Error {
  constructor(required, available) { super('insufficient'); this.code = 'INSUFFICIENT_CREDITS'; this.required = required; this.available = available; }
}

let ledger;

function buildApp() {
  _require.cache[LEDGER_PATH] = fakeMod(LEDGER_PATH, { ...ledger, InsufficientCreditsError });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express();
  app.use('/api/internal/metering', router.default || router);
  return app;
}

async function call(app, method, url, body, key) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-internal-key'] = key;
  const res = await inject(app, { method, url, payload: body ? JSON.stringify(body) : undefined, headers });
  let parsed; try { parsed = JSON.parse(res.payload); } catch { parsed = res.payload; }
  return { status: res.statusCode, body: parsed };
}

beforeEach(() => {
  ledger = {
    checkCredits: vi.fn(async () => ({ ok: true, available: 100, required: 15, via: 'balance' })),
    debitCredits: vi.fn(async () => ({ available: 85, allowance_remaining: 85, pack_balance: 0 })),
    getBalance:   vi.fn(async () => ({ available: 100 })),
  };
});

it('rejects calls without the internal key', async () => {
  const { status } = await call(buildApp(), 'POST', '/api/internal/metering/check', { org_id: 'o1', action: 'crystal_turn' });
  expect(status).toBe(401);
});

it('checks affordability by action', async () => {
  const { status, body } = await call(buildApp(), 'POST', '/api/internal/metering/check', { org_id: 'o1', action: 'crystal_turn' }, KEY);
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  expect(ledger.checkCredits).toHaveBeenCalledWith('o1', 15, 'crystal_turn');
});

it('debits by action', async () => {
  const { status, body } = await call(buildApp(), 'POST', '/api/internal/metering/debit', { org_id: 'o1', action: 'insight_run', ref: 'run-1' }, KEY);
  expect(status).toBe(200);
  expect(body.available).toBe(85);
  expect(ledger.debitCredits).toHaveBeenCalled();
});

it('maps InsufficientCreditsError to 402', async () => {
  ledger.debitCredits = vi.fn(async () => { throw new InsufficientCreditsError(200, 10); });
  const { status, body } = await call(buildApp(), 'POST', '/api/internal/metering/debit', { org_id: 'o1', action: 'xo_fusion' }, KEY);
  expect(status).toBe(402);
  expect(body.code).toBe('INSUFFICIENT_CREDITS');
});

it('400 on unknown action', async () => {
  const { status } = await call(buildApp(), 'POST', '/api/internal/metering/check', { org_id: 'o1', action: 'nope' }, KEY);
  expect(status).toBe(400);
});

it('returns balance by org', async () => {
  const { status, body } = await call(buildApp(), 'GET', '/api/internal/metering/balance/o1', null, KEY);
  expect(status).toBe(200);
  expect(body.available).toBe(100);
});
