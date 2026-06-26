import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { ensureProvisioned } from '../lib/provisioning';
import { getOrgClaims } from '../lib/clerkClaims';
import { resolveClerkSecretKey } from '../lib/clerkKeys';

// Dev mode: when no valid CLERK_SECRET_KEY the backend runs as dev-user/dev-org.
export const DEV_MODE = !resolveClerkSecretKey();

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
    const secretKey = resolveClerkSecretKey()!;
    const payload = await verifyToken(token, { secretKey });
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
