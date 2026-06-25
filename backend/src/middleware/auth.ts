import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { ensureProvisioned } from '../lib/provisioning';
import { getOrgClaims } from '../lib/clerkClaims';

// Dev mode: when CLERK_SECRET_KEY is absent the backend runs as dev-user/dev-org.
// No SKIP_AUTH env var needed — key presence is the signal.
export const DEV_MODE = !process.env.CLERK_SECRET_KEY;

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (DEV_MODE) {
    req.userId = 'dev-user';
    req.orgId  = 'dev-org';
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' });
      return;
    }
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const { orgId, orgRole } = getOrgClaims(payload);
    req.userId = payload.sub;
    req.orgId  = orgId || payload.sub;
    // Auto-provision the org/user into the directory on first request (webhook-free).
    // Best-effort + cached; never blocks auth on failure.
    await ensureProvisioned(orgId ?? undefined, payload.sub, orgRole ?? undefined);
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Auth error:', message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
