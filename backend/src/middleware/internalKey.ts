/**
 * requireInternalKey — gate for service-to-service calls (CrystalOS, future services,
 * a public-API gateway) into internal APIs such as the metering service. Verifies the
 * shared X-Internal-Key against AGENTS_INTERNAL_KEY using a constant-time comparison.
 *
 * This is the seam that lets metering behave like a standalone service: any service can
 * call /api/internal/metering/* with the shared key, exactly as it would a remote service.
 */
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

const INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY ?? 'dev-internal-key-change-in-prod';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.header('X-Internal-Key') ?? '';
  if (!provided || !safeEqual(provided, INTERNAL_KEY)) {
    res.status(401).json({ error: 'invalid_internal_key' });
    return;
  }
  next();
}
