/**
 * Billing & Credits API.
 *
 *   GET  /api/billing/credits      — current balance (any authenticated user)
 *   GET  /api/billing/config       — credit cost table + plan allowances (for UI / pricing screen)
 *   GET  /api/billing/usage        — spend summary by action for the period   [billing:manage]
 *   GET  /api/billing/ledger       — paginated credit ledger                  [billing:manage]
 *   PUT  /api/billing/spend-cap    — toggle overage + ceiling                 [billing:manage]
 *   POST /api/billing/plan         — change plan tier                         [billing:manage]
 *   POST /api/billing/grant        — add credits (manual top-up / purchase)   [billing:manage]
 *
 * org_id is taken from the verified token, never the body. Credits are the financial
 * backbone — see docs/pricing/CREDIT_SYSTEM.md.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { clientError, serverError } from '../lib/httpError';
import {
  getBalance, getUsageSummary, listLedger, setOverage, setPlan, grantCredits,
} from '../lib/creditLedger';
import {
  CREDIT_COSTS, PLAN_MONTHLY_ALLOWANCE, PLAN_PRICE_USD, CREDIT_USD, PLAN_PERIOD_DAYS, FREE_LIFETIME_GRANT,
} from '../lib/creditPlans';
import type { PlanInput, SpendCapInput, GrantInput } from '../schemas/billing';
import { planSchema, spendCapSchema, grantSchema, checkoutSchema } from '../schemas/billing';
import {
  CREDIT_PACKS, createCheckoutSession, isStripeConfigured, PaymentsNotConfiguredError,
} from '../lib/payments';

const router = express.Router();
router.use(requireAuth);

const appBaseUrl = (req: Request): string =>
  process.env.APP_URL || req.header('origin') || 'http://localhost:5173';

// ── Balance (open to any authed user — drives the credits chip) ──────────────
router.get('/credits', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getBalance(req.orgId as string));
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/billing/credits', orgId: req.orgId });
  }
});

// ── Static config: cost table + plan allowances (drives pricing/upgrade UI) ──
router.get('/config', (_req: Request, res: Response): void => {
  res.json({
    credit_usd:        CREDIT_USD,
    period_days:       PLAN_PERIOD_DAYS,
    costs:             CREDIT_COSTS,
    plan_allowances:   PLAN_MONTHLY_ALLOWANCE,
    plan_prices:       PLAN_PRICE_USD,
    free_lifetime_grant: FREE_LIFETIME_GRANT,
  });
});

// ── Usage summary (period) ───────────────────────────────────────────────────
router.get('/usage', requirePermission('billing:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || PLAN_PERIOD_DAYS));
    const [summary, balance] = await Promise.all([
      getUsageSummary(req.orgId as string, days),
      getBalance(req.orgId as string),
    ]);
    res.json({ summary, balance, days });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/billing/usage', orgId: req.orgId });
  }
});

// ── Ledger (paginated) ───────────────────────────────────────────────────────
router.get('/ledger', requirePermission('billing:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const limit  = Number(req.query.limit)  || 50;
    const offset = Number(req.query.offset) || 0;
    res.json(await listLedger(req.orgId as string, limit, offset));
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/billing/ledger', orgId: req.orgId });
  }
});

// ── Spend cap (overage toggle + ceiling) ─────────────────────────────────────
router.put('/spend-cap', requirePermission('billing:manage'), validate(spendCapSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as SpendCapInput;
    const ceiling = body.overage_ceiling ?? null;
    res.json(await setOverage(req.orgId as string, body.overage_enabled, ceiling));
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'PUT /api/billing/spend-cap', orgId: req.orgId });
  }
});

// ── Plan change (internal / stand-in for Stripe subscription) ────────────────
router.post('/plan', requirePermission('billing:manage'), validate(planSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as PlanInput;
    res.json(await setPlan(req.orgId as string, body.plan_tier, req.userId));
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/billing/plan', orgId: req.orgId });
  }
});

// ── Manual credit grant / top-up (stand-in for Stripe purchase) ──────────────
router.post('/grant', requirePermission('billing:manage'), validate(grantSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as GrantInput;
    if (body.credits <= 0) { clientError(res, 400, 'credits must be positive'); return; }
    res.json(await grantCredits(req.orgId as string, body.credits, { note: body.note, userId: req.userId }));
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/billing/grant', orgId: req.orgId });
  }
});

// ── Credit packs catalog (drives the upgrade / marketing screen) ─────────────
router.get('/packs', (_req: Request, res: Response): void => {
  res.json({ packs: CREDIT_PACKS, stripe_enabled: isStripeConfigured() });
});

// ── Checkout — start a credit-pack purchase (Stripe when configured) ─────────
router.post('/checkout', requirePermission('billing:manage'), validate(checkoutSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { pack_id } = req.body as { pack_id: string };
    const base = appBaseUrl(req);
    const result = await createCheckoutSession({
      orgId:      req.orgId as string,
      packId:     pack_id,
      successUrl: `${base}/app/settings/billing?purchase=success`,
      cancelUrl:  `${base}/app/settings/billing?purchase=cancel`,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) {
      res.status(501).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof Error && err.message === 'unknown_pack') {
      clientError(res, 400, 'unknown_pack');
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/billing/checkout', orgId: req.orgId });
  }
});

export default router;
