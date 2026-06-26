/**
 * Stripe webhook — raw body, mounted before express.json() (signature needs the raw bytes).
 * Activates only when Stripe is configured; otherwise returns 503. On checkout.session.completed
 * it grants the purchased credit pack to the org named in the session metadata.
 */
import express from 'express';
import type { Request, Response } from 'express';
import logger from '../../lib/logger';
import { parseStripeWebhook, fulfillPurchase } from '../../lib/payments';
import { creditWebhookTotal } from '../../lib/metrics';

const router = express.Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const signature = req.header('stripe-signature') ?? '';
  // req.body is a Buffer here (express.raw mounted upstream).
  const event = parseStripeWebhook(req.body as Buffer, signature);
  if (!event) {
    creditWebhookTotal.inc({ result: 'unconfigured' });
    res.status(503).json({ error: 'payments_not_configured_or_invalid_signature' });
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Record<string, unknown>;
      const metadata = (session.metadata as Record<string, string> | undefined) ?? {};
      const orgId  = metadata.org_id;
      const packId = metadata.pack_id;
      if (orgId && packId) {
        await fulfillPurchase(orgId, packId, String(session.id ?? ''));
        creditWebhookTotal.inc({ result: 'fulfilled' });
      } else {
        creditWebhookTotal.inc({ result: 'error' });
        logger.warn({ sessionId: session.id }, 'stripe webhook: checkout completed without org/pack metadata');
      }
    }
    res.json({ received: true });
  } catch (err) {
    creditWebhookTotal.inc({ result: 'error' });
    logger.error({ err: (err as Error).message, type: event.type }, 'stripe webhook handler error');
    // 200 so Stripe doesn't retry indefinitely on a non-recoverable handler error; we logged it.
    res.json({ received: true, handled: false });
  }
});

export default router;
