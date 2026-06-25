/**
 * Crystal ↔ Novu Connect bridge.
 *
 * Novu Connect ACI (Agent Communication Infrastructure) posts to this endpoint
 * when a user messages Crystal on Slack, Teams, WhatsApp, Telegram, or email.
 * We verify the signature, check the 'crystal:converse' permission, then proxy
 * to CrystalOS which processes through Crystal and replies via Novu.
 *
 * Route: POST /api/crystal-novu/message
 */
import express from 'express';
import type { Request, Response } from 'express';
import { createHmac } from 'crypto';
import logger from '../lib/logger';
import { serverError, clientError } from '../lib/httpError';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

const AGENTS_URL = process.env.AGENTS_URL ?? 'http://localhost:8001';
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY ?? 'dev-internal-key-change-in-prod';
const NOVU_SECRET_KEY = process.env.NOVU_SECRET_KEY ?? '';

function verifyNovuSignature(body: Buffer, signature: string | undefined): boolean {
  if (!NOVU_SECRET_KEY) {
    // Allow in dev/test; fail closed in production (misconfigured key = reject all)
    return process.env.NODE_ENV !== 'production';
  }
  if (!signature) return false;
  const expected = 'sha256=' + createHmac('sha256', NOVU_SECRET_KEY).update(body).digest('hex');
  return signature === expected;
}

/**
 * POST /api/crystal-novu/message
 *
 * Novu posts inbound ACI messages here. We:
 * 1. Verify HMAC signature
 * 2. Resolve org_id from subscriber_id (look up user_profiles)
 * 3. Check crystal:converse permission for org's plan
 * 4. Forward to CrystalOS /novu/message
 * 5. Return 200 immediately (Crystal replies async via Novu)
 */
router.post('/message', express.raw({ type: '*/*' }), async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['novu-signature'] as string | undefined;
  const body = req.body as Buffer;

  if (!verifyNovuSignature(body, signature)) {
    res.status(401).json({ error: 'Invalid Novu signature' });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body.toString());
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const subscriberId = payload.subscriberId as string | undefined;
  if (!subscriberId) {
    res.status(400).json({ error: 'Missing subscriberId' });
    return;
  }

  // Resolve org_id from user_profiles
  let orgId = payload.orgId as string | undefined;
  let userId = subscriberId;
  if (!orgId) {
    const { rows: [profile] } = await query(
      'SELECT org_id, user_id FROM user_profiles WHERE user_id = $1 AND is_active = TRUE LIMIT 1',
      [subscriberId]
    ).catch(() => ({ rows: [] as unknown[] }));
    const p = profile as { org_id?: string; user_id?: string } | undefined;
    orgId = p?.org_id ?? 'unknown';
    userId = p?.user_id ?? subscriberId;
  }

  // Check if org has Crystal Novu Connect enabled (enterprise plan)
  const { rows: [plan] } = await query(
    'SELECT plan_tier FROM org_profiles WHERE org_id = $1', [orgId]
  ).catch(() => ({ rows: [] as unknown[] }));
  const tier = (plan as { plan_tier?: string } | undefined)?.plan_tier;
  if (tier && tier !== 'enterprise' && tier !== 'growth') {
    res.status(200).json({ received: true, skipped: 'Crystal Novu Connect requires Enterprise plan' });
    return;
  }

  // Forward to CrystalOS — fire and forget, respond immediately
  res.status(200).json({ received: true });

  // Async forward
  setImmediate(async () => {
    try {
      const crystalPayload = {
        subscriberId,
        channel: payload.channel || 'in_app',
        message: payload.message || payload.text || '',
        orgId,
        userId,
        threadId: payload.threadId,
        metadata: payload.metadata || {},
      };

      const crystalRes = await fetch(`${AGENTS_URL}/novu/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': AGENTS_INTERNAL_KEY },
        body: JSON.stringify(crystalPayload),
      });

      if (!crystalRes.ok) {
        logger.warn({ status: crystalRes.status, subscriberId }, 'crystal-novu:forward:failed');
      } else {
        logger.info({ subscriberId, channel: payload.channel }, 'crystal-novu:processed');
      }
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err), subscriberId }, 'crystal-novu:forward:error');
    }
  });
});

/**
 * GET /api/crystal-novu/subscriber-hash
 * Returns an HMAC-SHA256 hash of the authenticated user's ID for Novu inbox security.
 * Falls back to an empty string when NOVU_SECRET_KEY is not configured (dev mode).
 */
router.get('/subscriber-hash', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const secret = process.env.NOVU_SECRET_KEY;
  if (!secret) {
    // Not configured — return empty hash (inbox works without it in dev)
    res.json({ hash: '' });
    return;
  }
  const hash = createHmac('sha256', secret).update(userId).digest('hex');
  res.json({ hash });
});

/**
 * POST /api/crystal-novu/subscribe
 * Register a user as a Novu subscriber (call on login/profile update).
 */
router.post('/subscribe', express.json(), requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { email, phone, firstName, orgId } = req.body;
  const userId = req.userId!; // Always use the authenticated user's ID, never trust body.userId
  if (!userId) { clientError(res, 401, 'Authentication required'); return; }
  try {
    const { upsertNovuSubscriber } = await import('../lib/novu/client');
    await upsertNovuSubscriber(userId, { email, phone, firstName, orgId });
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
