const { createClerkClient } = require('@clerk/backend');

// Role hierarchy: viewer < analyst < admin
const ROLE_RANK = {
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
function requireRole(minRole) {
  const minRoleKey = `org:${minRole}`;
  const minRank = ROLE_RANK[minRoleKey] ?? 0;

  return async function (req, res, next) {
    if (process.env.SKIP_AUTH === 'true') return next();

    try {
      const token = req.headers.authorization?.slice(7);
      if (!token) return res.status(401).json({ error: 'Missing token' });

      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const payload = await clerk.verifyToken(token);

      const orgRole = payload.org_role ?? null;
      const rank = orgRole ? (ROLE_RANK[orgRole] ?? 0) : 0;

      if (rank < minRank) {
        return res.status(403).json({
          error: 'Insufficient role',
          required: minRoleKey,
          current: orgRole,
        });
      }

      req.orgRole = orgRole;
      next();
    } catch (err) {
      console.error('requireRole error:', err.message);
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

module.exports = { requireRole };
