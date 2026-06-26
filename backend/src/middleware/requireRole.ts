import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';
import { DEV_MODE } from './auth';
import { getOrgClaims } from '../lib/clerkClaims';

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
 * In DEV_MODE (no CLERK_SECRET_KEY), all roles are granted.
 */
export function requireRole(minRole: string): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const minRoleKey = `org:${minRole}`;
  const minRank = ROLE_RANK[minRoleKey] ?? 0;

  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    if (DEV_MODE) return next();

    try {
      const token = req.headers.authorization?.slice(7);
      if (!token) {
        res.status(401).json({ error: 'Missing token' });
        return;
      }

      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });

      const { orgRole } = getOrgClaims(payload);
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
