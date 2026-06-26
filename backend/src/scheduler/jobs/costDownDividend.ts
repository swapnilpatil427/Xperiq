import { query } from '../../lib/db';
import logger from '../../lib/logger';
import { cogsPerCredit } from '../../lib/metrics';

/**
 * Cost-Down Dividend feed (measurement live; allowance changes deliberately gated).
 *
 * Computes trailing-30d true COGS per consumed credit = SUM(ai_operation_logs.cost_usd) /
 * SUM(credits debited), and emits `credit_cogs_per_credit_usd`. This is the metric that drives
 * the "our prices only go down" policy (docs/pricing/PRICING_PROPOSAL.md).
 *
 * Applying the dividend (raising allowances as COGS falls) mutates billing, so it is **dry-run by
 * default** — set COST_DOWN_DRY_RUN=false to enable automated application once trusted. Measuring
 * is always safe; the apply step is intentionally opt-in.
 */
const DRY_RUN = process.env.COST_DOWN_DRY_RUN !== 'false';

export async function costDownDividend(): Promise<{ note: string }> {
  // ai_operation_logs is a CrystalOS table; tolerate its absence (returns 0 → metric 0).
  const { rows } = await query<{ cost_usd: string; credits: string }>(`
    SELECT
      (SELECT COALESCE(SUM(cost_usd), 0) FROM ai_operation_logs
        WHERE created_at > NOW() - INTERVAL '30 days')                      AS cost_usd,
      (SELECT COALESCE(SUM(-credits), 0) FROM credit_ledger
        WHERE credits < 0 AND created_at > NOW() - INTERVAL '30 days')      AS credits
  `).catch((err: unknown) => {
    logger.warn({ err: (err as Error).message }, 'cost-down-dividend: COGS query unavailable');
    return { rows: [{ cost_usd: '0', credits: '0' }] };
  });

  const cost = Number(rows[0]?.cost_usd ?? 0);
  const credits = Number(rows[0]?.credits ?? 0);
  const cpc = credits > 0 ? cost / credits : 0;

  cogsPerCredit.set(cpc);
  logger.info(
    { cost_usd: cost, credits, cogs_per_credit_usd: cpc, dry_run: DRY_RUN },
    'cost-down-dividend: computed COGS/credit',
  );

  // Deliberate, gated apply step lives here once enabled (raise allowances per the 50/50 rule).
  return { note: `cogs_per_credit=${cpc.toFixed(6)} dry_run=${DRY_RUN}` };
}
