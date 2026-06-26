/**
 * Credit system configuration — the single source of truth for plan allowances and
 * per-action credit costs. Everything is overridable via env so pricing can change
 * without a code deploy (see docs/pricing/PRICING_PROPOSAL.md "Configurable parameters").
 *
 * 1 credit = $0.01. Only the expensive analytical AI is metered; core usage and Copilot
 * survey authoring are bundled (never debited). See docs/pricing/METERING_AND_USAGE.md.
 */

export type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise' | 'platform';

export const PLAN_TIERS: PlanTier[] = ['free', 'starter', 'growth', 'enterprise', 'platform'];

const envInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/**
 * Monthly AI-credit allowance per plan. `free` is a one-time lifetime grant (monthly
 * allowance 0 — it does not reset), granted into pack_balance at account creation.
 */
export const PLAN_MONTHLY_ALLOWANCE: Record<PlanTier, number> = {
  free:       envInt('CREDIT_ALLOWANCE_FREE', 0),
  starter:    envInt('CREDIT_ALLOWANCE_STARTER', 1_500),
  growth:     envInt('CREDIT_ALLOWANCE_GROWTH', 12_000),
  enterprise: envInt('CREDIT_ALLOWANCE_ENTERPRISE', 80_000),
  platform:   envInt('CREDIT_ALLOWANCE_PLATFORM', 500_000),
};

/** One-time lifetime credits granted to a brand-new free account (≈3 insight runs + 5 Crystal turns). */
export const FREE_LIFETIME_GRANT = envInt('CREDIT_FREE_LIFETIME_GRANT', 225);

/** Monthly list price (USD) per plan — single source of truth for the pricing/upgrade UI. */
export const PLAN_PRICE_USD: Record<PlanTier, number> = {
  free:       0,
  starter:    envInt('CREDIT_PRICE_STARTER', 49),
  growth:     envInt('CREDIT_PRICE_GROWTH', 299),
  enterprise: envInt('CREDIT_PRICE_ENTERPRISE', 1_499),
  platform:   envInt('CREDIT_PRICE_PLATFORM', 0),
};

/** Per-action credit cost. Only metered (expensive AI + pass-through comms) actions appear here. */
export const CREDIT_COSTS = {
  insight_run:     envInt('CREDIT_COST_INSIGHT_RUN', 50),
  crystal_turn:    envInt('CREDIT_COST_CRYSTAL_TURN', 15),
  xo_fusion:       envInt('CREDIT_COST_XO_FUSION', 200),
  broadcast_email: envInt('CREDIT_COST_BROADCAST_EMAIL', 2),
  broadcast_sms:   envInt('CREDIT_COST_BROADCAST_SMS', 8),
} as const;

export type MeteredAction = keyof typeof CREDIT_COSTS;

export const METERED_ACTIONS = Object.keys(CREDIT_COSTS) as MeteredAction[];

/** Dollar value of one credit (display only). */
export const CREDIT_USD = 0.01;

export function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === 'string' && (PLAN_TIERS as string[]).includes(v);
}

export function costFor(action: MeteredAction): number {
  return CREDIT_COSTS[action];
}

/** Plan period length in days (monthly). Configurable for testing/annual experiments. */
export const PLAN_PERIOD_DAYS = envInt('CREDIT_PERIOD_DAYS', 30);

/**
 * Plan assigned to a brand-new account when org_profiles has no plan_tier. Defaults to 'free'
 * (correct for production). Set CREDIT_DEFAULT_PLAN=enterprise in a dev/demo env to avoid
 * hitting the free lifetime cap while testing.
 */
export const DEFAULT_PLAN: PlanTier = (() => {
  const raw = process.env.CREDIT_DEFAULT_PLAN;
  return isPlanTier(raw) ? raw : 'free';
})();
