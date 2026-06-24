import type { Request, Response, NextFunction } from 'express';
import { createClerkClient } from '@clerk/backend';

// Dev bypass: set SKIP_AUTH=true in .env to skip token verification.
// req.userId = 'dev-user', req.orgId = 'dev-org'
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.SKIP_AUTH === 'true') {
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
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const payload = await clerk.verifyToken(token);
    req.userId = payload.sub;
    req.orgId  = payload.org_id || payload.sub;
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Auth error:', message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
