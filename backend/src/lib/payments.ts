/**
 * Payment provider seam — the money rail on top of the credit ledger.
 *
 * Stripe is loaded lazily and only activates when STRIPE_SECRET_KEY is set AND the `stripe`
 * package is installed (`npm i stripe`). Until then the platform runs fully on the internal
 * ledger: admins top up via POST /api/billing/grant (the manual fallback). Dropping in keys +
 * the package enables Checkout + webhook fulfilment with no other code changes.
 *
 * Catalog + flow per docs/pricing/CREDIT_SYSTEM.md (Part 3 credit packs, Part 9 billing infra).
 */
import { grantCredits, grantExists } from './creditLedger';
import logger from './logger';

// require is provided by the tsx CJS runtime (same pattern as lib/db.ts lazy logger require).
declare const require: (m: string) => unknown;

export interface CreditPack { id: string; label: string; credits: number; price_usd: number; }

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'insight_bundle', label: 'Insight Bundle', credits: 5_000,  price_usd: 49 },
  { id: 'crystal_pack',   label: 'Crystal Pack',   credits: 7_500,  price_usd: 59 },
  { id: 'campaign_pack',  label: 'Campaign Pack',  credits: 25_000, price_usd: 199 },
];

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

// ── Minimal structural types for the bits of the Stripe SDK we touch ─────────
interface StripeCheckoutSession { url: string | null; }
interface StripeEvent { type: string; data: { object: Record<string, unknown> }; }
interface StripeLike {
  checkout: { sessions: { create: (args: Record<string, unknown>) => Promise<StripeCheckoutSession> } };
  webhooks: { constructEvent: (body: Buffer, sig: string, secret: string) => StripeEvent };
}

const STRIPE_KEY            = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

let _stripe: StripeLike | null = null;
function getStripe(): StripeLike | null {
  if (!STRIPE_KEY) return null;
  if (_stripe) return _stripe;
  try {
    const Stripe = require('stripe') as new (key: string) => StripeLike;
    _stripe = new Stripe(STRIPE_KEY);
    return _stripe;
  } catch {
    logger.warn({}, 'payments: STRIPE_SECRET_KEY is set but the `stripe` package is not installed');
    return null;
  }
}

export function isStripeConfigured(): boolean {
  return getStripe() !== null;
}

export class PaymentsNotConfiguredError extends Error {
  readonly code = 'PAYMENTS_NOT_CONFIGURED';
  constructor() { super('Payments are not configured. Use a manual grant or set STRIPE_SECRET_KEY.'); }
}

export interface CheckoutResult { url: string; }

export async function createCheckoutSession(opts: {
  orgId: string; packId: string; successUrl: string; cancelUrl: string;
}): Promise<CheckoutResult> {
  const pack = getPack(opts.packId);
  if (!pack) throw new Error('unknown_pack');
  const stripe = getStripe();
  if (!stripe) throw new PaymentsNotConfiguredError();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `${pack.label} — ${pack.credits.toLocaleString()} credits` },
        unit_amount: Math.round(pack.price_usd * 100),
      },
      quantity: 1,
    }],
    success_url: opts.successUrl,
    cancel_url:  opts.cancelUrl,
    metadata:    { org_id: opts.orgId, pack_id: pack.id, credits: String(pack.credits) },
  });
  if (!session.url) throw new Error('stripe_session_no_url');
  return { url: session.url };
}

/**
 * Grant the purchased credits. Idempotent: a duplicate webhook carrying the same payment
 * reference (Stripe can deliver the same event more than once) is ignored.
 */
export async function fulfillPurchase(orgId: string, packId: string, paymentRef?: string): Promise<void> {
  const pack = getPack(packId);
  if (!pack) { logger.warn({ orgId, packId }, 'payments: cannot fulfil unknown pack'); return; }
  if (paymentRef && await grantExists(orgId, paymentRef)) {
    logger.info({ orgId, packId, paymentRef }, 'payments: duplicate webhook ignored (already fulfilled)');
    return;
  }
  await grantCredits(orgId, pack.credits, {
    source:    'pack',
    actionRef: paymentRef ?? null,
    note:      `Purchased ${pack.label}${paymentRef ? ` (${paymentRef})` : ''}`,
  });
  logger.info({ orgId, packId, credits: pack.credits }, 'payments: purchase fulfilled');
}

/** Verify + parse a Stripe webhook. Returns null when not configured or signature invalid. */
export function parseStripeWebhook(rawBody: Buffer, signature: string): StripeEvent | null {
  const stripe = getStripe();
  if (!stripe || !STRIPE_WEBHOOK_SECRET) return null;
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'payments: webhook signature verification failed');
    return null;
  }
}
