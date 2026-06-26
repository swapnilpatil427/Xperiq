/**
 * Internal Metering API — the credit ledger exposed as a service.
 *
 * Service-to-service only (X-Internal-Key). Any service — CrystalOS, a future public-API
 * gateway, another microservice — meters credits here exactly as if the ledger were a
 * standalone deployable. Today it runs in-process with the rest of the backend (one
 * source of truth, atomic debits, no network tax); it can be lifted into its own service
 * later with no change to callers, since they already go through this API/SDK.
 *
 *   POST /api/internal/metering/check   { org_id, action }            → { ok, available, required }
 *   POST /api/internal/metering/debit   { org_id, action, ref?, ... } → balance | 402 INSUFFICIENT_CREDITS
 *   GET  /api/internal/metering/balance/:orgId                        → balance
 *
 * `action` is a key in CREDIT_COSTS (insight_run | crystal_turn | xo_fusion | ...), or
 * pass an explicit `credits` amount.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireInternalKey } from '../middleware/internalKey';
import { clientError, serverError } from '../lib/httpError';
import { checkCredits, debitCredits, getBalance, InsufficientCreditsError } from '../lib/creditLedger';
import { CREDIT_COSTS, type MeteredAction } from '../lib/creditPlans';

const router = express.Router();
router.use(express.json());
router.use(requireInternalKey);

function resolveCost(body: Record<string, unknown>): number | null {
  if (typeof body.credits === 'number' && Number.isFinite(body.credits)) return Math.max(0, Math.trunc(body.credits));
  const action = body.action as string | undefined;
  if (action && action in CREDIT_COSTS) return CREDIT_COSTS[action as MeteredAction];
  return null;
}

router.post('/check', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const orgId = body.org_id as string;
    if (!orgId) { clientError(res, 400, 'org_id required'); return; }
    const cost = resolveCost(body);
    if (cost == null) { clientError(res, 400, 'unknown action / missing credits'); return; }
    res.json(await checkCredits(orgId, cost, (body.action as string) || 'unknown'));
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'internal-metering:check' });
  }
});

router.post('/debit', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const orgId = body.org_id as string;
    if (!orgId) { clientError(res, 400, 'org_id required'); return; }
    const cost = resolveCost(body);
    if (cost == null) { clientError(res, 400, 'unknown action / missing credits'); return; }
    const balance = await debitCredits(orgId, {
      actionType: (body.action as string) || 'adjustment',
      credits:    cost,
      userId:     (body.user_id as string) ?? null,
      actionRef:  (body.ref as string) ?? null,
      unitCostUsd: typeof body.unit_cost_usd === 'number' ? body.unit_cost_usd : null,
      note:       (body.note as string) ?? null,
    });
    res.json(balance);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      res.status(402).json({ error: err.message, code: err.code, required: err.required, available: err.available });
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'internal-metering:debit' });
  }
});

router.get('/balance/:orgId', async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getBalance(req.params.orgId));
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'internal-metering:balance' });
  }
});

export default router;
