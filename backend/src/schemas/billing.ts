import { z } from 'zod';

// Plan tiers kept in sync with lib/creditPlans.ts PLAN_TIERS.
export const planSchema = z.object({
  plan_tier: z.enum(['free', 'starter', 'growth', 'enterprise', 'platform']),
});

export const spendCapSchema = z.object({
  overage_enabled: z.boolean(),
  overage_ceiling: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

export const grantSchema = z.object({
  credits: z.number().int().min(1).max(100_000_000),
  note:    z.string().max(500).optional(),
});

export const checkoutSchema = z.object({
  pack_id: z.string().min(1).max(64),
});

export type PlanInput     = z.infer<typeof planSchema>;
export type SpendCapInput  = z.infer<typeof spendCapSchema>;
export type GrantInput     = z.infer<typeof grantSchema>;
