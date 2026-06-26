/**
 * Unit tests for lib/payments.ts — the payment provider seam.
 * Stripe is not configured in tests, so we verify the catalog, the not-configured guard,
 * and that fulfilment grants the right number of credits.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const LEDGER_PATH   = _require.resolve(resolve(__dirname, '../lib/creditLedger'));
const LOGGER_PATH   = _require.resolve(resolve(__dirname, '../lib/logger'));
const PAYMENTS_PATH = _require.resolve(resolve(__dirname, '../lib/payments'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

// Hermetic: drop mocked modules from the shared require cache after this file.
afterAll(() => {
  delete _require.cache[LEDGER_PATH];
  delete _require.cache[PAYMENTS_PATH];
});

let grantCredits, grantExistsMock;

function loadPayments(alreadyFulfilled = false) {
  grantCredits = vi.fn(async () => ({}));
  grantExistsMock = vi.fn(async () => alreadyFulfilled);
  _require.cache[LEDGER_PATH] = fakeMod(LEDGER_PATH, { grantCredits, grantExists: grantExistsMock });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
  delete _require.cache[PAYMENTS_PATH];
  return _require(PAYMENTS_PATH);
}

beforeEach(() => { delete process.env.STRIPE_SECRET_KEY; });

it('exposes a credit pack catalog', () => {
  const p = loadPayments();
  expect(p.CREDIT_PACKS.length).toBeGreaterThan(0);
  expect(p.getPack('insight_bundle')).toBeTruthy();
  expect(p.getPack('nope')).toBeUndefined();
});

it('reports Stripe disabled without a key', () => {
  const p = loadPayments();
  expect(p.isStripeConfigured()).toBe(false);
});

it('throws PaymentsNotConfiguredError on checkout when Stripe is off', async () => {
  const p = loadPayments();
  await expect(p.createCheckoutSession({ orgId: 'o1', packId: 'insight_bundle', successUrl: 'x', cancelUrl: 'y' }))
    .rejects.toMatchObject({ code: 'PAYMENTS_NOT_CONFIGURED' });
});

it('fulfilment grants the pack credits', async () => {
  const p = loadPayments();
  await p.fulfillPurchase('o1', 'insight_bundle', 'cs_test_1');
  expect(grantCredits).toHaveBeenCalledWith('o1', 5000, expect.objectContaining({ source: 'pack' }));
});

it('fulfilment of an unknown pack is a safe no-op', async () => {
  const p = loadPayments();
  await p.fulfillPurchase('o1', 'ghost');
  expect(grantCredits).not.toHaveBeenCalled();
});

it('fulfilment is idempotent — a duplicate webhook does not double-grant', async () => {
  const p = loadPayments(true); // grantExists → already fulfilled
  await p.fulfillPurchase('o1', 'insight_bundle', 'cs_test_dup');
  expect(grantExistsMock).toHaveBeenCalledWith('o1', 'cs_test_dup');
  expect(grantCredits).not.toHaveBeenCalled();
});
