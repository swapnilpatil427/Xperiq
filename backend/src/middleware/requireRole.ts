import type { Request, Response, NextFunction } from 'express';
import { createClerkClient } from '@clerk/backend';

// Role hierarchy: viewer < analyst < admin
const ROLE_RANK: Record<string, number> = {
  'org:admin':   3,
  'org:analyst': 2,
  'org:viewer':  1,
};

/**
 * requireRole('analyst') — blocks requests where the caller's org role is below the minimum.
 * Must run after requireAuth (needs req.userId + req.orgId + Authorization header).
 *
 * In SKIP_AUTH mode, all roles are granted (dev-only convenience).
 */
export function requireRole(minRole: string): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const minRoleKey = `org:${minRole}`;
  const minRank = ROLE_RANK[minRoleKey] ?? 0;

  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    if (process.env.SKIP_AUTH === 'true') return next();

    try {
      const token = req.headers.authorization?.slice(7);
      if (!token) {
        res.status(401).json({ error: 'Missing token' });
        return;
      }

      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const payload = await clerk.verifyToken(token);

      const orgRole = (payload.org_role as string | undefined) ?? null;
      const rank = orgRole ? (ROLE_RANK[orgRole] ?? 0) : 0;

      if (rank < minRank) {
        res.status(403).json({
          error: 'Insufficient role',
          required: minRoleKey,
          current: orgRole,
        });
        return;
      }

      req.orgRole = orgRole;
      next();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('requireRole error:', message);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}
