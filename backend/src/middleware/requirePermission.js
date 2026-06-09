// Two-layer RBAC enforcement point.
//
// requirePermission(action, getResourceId?) is Express middleware that runs after
// requireAuth. evaluatePermission() implements the strict deny-by-default algorithm
// (doc §2/§12). Decisions are Redis-cached for 5 minutes and invalidated on any
// role/permission/group change for the affected user.
//
// Fail closed: any error in evaluation denies access (never fail open).
const db = require('../lib/db');
const { getRedisClient } = require('../lib/redis');
const { auditLog } = require('../lib/auditLog');

const CACHE_TTL_SECONDS = 300; // 5 minutes

// Resource types whose ownership we can resolve today. `dashboard` is intentionally
// absent — the dashboards table does not exist yet, so OWNED dashboard checks fall
// through to deny rather than erroring on a missing table.
const OWNERSHIP_TABLES = {
  survey: 'surveys',
  workflow: 'workflows',
};

/**
 * requirePermission(action, getResourceId?)
 *
 *   router.get('/api/users', requireAuth, requirePermission('users:manage'), handler)
 *   router.get('/api/surveys/:id', requireAuth,
 *     requirePermission('survey:read', (req) => req.params.id), handler)
 */
function requirePermission(action, getResourceId = null) {
  const resourceType = action.split(':')[0]; // 'survey' | 'dashboard' | 'users' | ...

  return async function permissionMiddleware(req, res, next) {
    if (process.env.SKIP_AUTH === 'true') return next();

    const { userId, orgId } = req;
    if (!userId || !orgId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const resourceId = getResourceId ? getResourceId(req) : 'org';

    try {
      const allowed = await evaluatePermission(userId, orgId, resourceType, resourceId, action);

      if (!allowed) {
        // Record denied attempts for security monitoring (best-effort).
        auditLog({
          orgId,
          actorUserId: userId,
          actorType: 'user',
          eventType: 'permission.denied',
          targetResourceType: resourceType,
          targetResourceId: resourceId,
          afterState: { action, result: 'denied' },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          requestId: req.id || req.headers['x-request-id'] || null,
        });

        return res.status(403).json({
          error: 'Insufficient permissions',
          required: action,
          resource: resourceId !== 'org' ? `${resourceType}:${resourceId}` : resourceType,
        });
      }

      req.permissionAction = action;
      req.permissionResourceId = resourceId;
      next();
    } catch (err) {
      try {
        require('../lib/logger').error(
          { event: 'permission_check_error', action, err: err.message },
          'requirePermission error'
        );
      } catch {
        console.error('requirePermission error:', err.message);
      }
      // Fail closed.
      res.status(403).json({ error: 'Permission check failed' });
    }
  };
}

/**
 * Cached permission evaluation. Returns true (allow) / false (deny).
 */
async function evaluatePermission(userId, orgId, resourceType, resourceId, action) {
  const redis = getRedisClient();
  const cacheKey = `perm:${userId}:${resourceType}:${resourceId}:${action}`;

  if (redis && redis.status === 'ready') {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null && cached !== undefined) return cached === '1';
    } catch { /* cache miss is non-fatal */ }
  }

  const result = await _evaluatePermissionUncached(userId, orgId, resourceType, resourceId, action);

  if (redis && redis.status === 'ready') {
    try {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, result ? '1' : '0');
    } catch { /* cache write failure is non-fatal */ }
  }

  return result;
}

/**
 * Strict deny-by-default evaluation (stops at first definitive result):
 *   1. No profile / inactive / deprovisioned → DENY
 *   2. super_admin → ALLOW
 *   3. resource-level override: explicit DENY beats explicit ALLOW
 *   4. group-level permission for this resource: DENY beats ALLOW
 *   5. org-role default + scope (ALL / OWNED / SHARED / NONE)
 *   6. default → DENY
 */
async function _evaluatePermissionUncached(userId, orgId, resourceType, resourceId, action) {
  // STEP 1: load profile + role in one query
  const { rows: [profile] } = await db.query(
    `SELECT up.is_active, up.deprovisioned_at, up.role_id,
            r.builtin_key AS role_key, r.default_permissions
       FROM user_profiles up
       LEFT JOIN org_roles r ON r.id = up.role_id
      WHERE up.user_id = $1 AND up.org_id = $2`,
    [userId, orgId]
  );

  if (!profile) return false;                                   // not in this org's directory
  if (!profile.is_active || profile.deprovisioned_at) return false;
  if (profile.role_key === 'org:super_admin') return true;      // unconditional bypass

  // STEPS 3 & 4 only apply to a concrete resource
  if (resourceId && resourceId !== 'org') {
    // STEP 3: user resource-level overrides (deny wins)
    const { rows: overrides } = await db.query(
      `SELECT effect FROM user_resource_permissions
        WHERE user_id = $1 AND org_id = $2
          AND resource_type = $3 AND resource_id = $4 AND action = $5
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, orgId, resourceType, resourceId, action]
    );
    if (overrides.some((o) => o.effect === 'deny')) return false;
    if (overrides.some((o) => o.effect === 'allow')) return true;

    // STEP 4: group-level permissions (deny wins)
    const { rows: groupPerms } = await db.query(
      `SELECT gp.effect
         FROM user_group_members ugm
         JOIN user_group_resource_permissions gp ON gp.group_id = ugm.group_id
        WHERE ugm.user_id = $1 AND ugm.org_id = $2
          AND gp.resource_type = $3 AND gp.resource_id = $4 AND gp.action = $5`,
      [userId, orgId, resourceType, resourceId, action]
    );
    if (groupPerms.some((p) => p.effect === 'deny')) return false;
    if (groupPerms.some((p) => p.effect === 'allow')) return true;
  }

  // STEP 5: org-role default permission + scope
  const perms = profile.default_permissions;
  if (!perms) return false;

  const scope = perms[action];
  if (!scope || scope === 'NONE') return false;
  if (scope === 'ALL') return true;

  if (scope === 'OWNED') {
    return checkResourceOwnership(userId, orgId, resourceType, resourceId);
  }

  if (scope === 'SHARED') {
    if (resourceId && resourceId !== 'org') {
      const { rows: shared } = await db.query(
        `SELECT 1 FROM user_resource_permissions
          WHERE user_id = $1 AND org_id = $2
            AND resource_type = $3 AND resource_id = $4
            AND effect = 'allow'
            AND (expires_at IS NULL OR expires_at > NOW())
          LIMIT 1`,
        [userId, orgId, resourceType, resourceId]
      );
      if (shared.length > 0) return true;
    }
    return false;
  }

  // STEP 6: default deny
  return false;
}

async function checkResourceOwnership(userId, orgId, resourceType, resourceId) {
  const table = OWNERSHIP_TABLES[resourceType];
  if (!table || !resourceId || resourceId === 'org') return false;

  const { rows } = await db.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND org_id = $2 AND created_by = $3 LIMIT 1`,
    [resourceId, orgId, userId]
  );
  return rows.length > 0;
}

/**
 * Invalidate cached permissions for a user. Call after any role change,
 * resource-permission grant/revoke, or group membership change.
 */
async function invalidatePermissionCache(userId, specificKey = null) {
  const redis = getRedisClient();
  if (!redis || redis.status !== 'ready') return;

  try {
    if (specificKey) {
      await redis.del(specificKey);
      return;
    }
    // Scan rather than KEYS to avoid blocking Redis on large keyspaces.
    const pattern = `perm:${userId}:*`;
    const toDelete = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (batch.length) toDelete.push(...batch);
    } while (cursor !== '0');
    if (toDelete.length) await redis.del(...toDelete);
  } catch (err) {
    try {
      require('../lib/logger').warn(
        { event: 'perm_cache_invalidation_failed', userId, err: err.message },
        'permission cache invalidation error'
      );
    } catch {
      console.error('Permission cache invalidation error:', err.message);
    }
  }
}

module.exports = {
  requirePermission,
  evaluatePermission,
  _evaluatePermissionUncached,
  checkResourceOwnership,
  invalidatePermissionCache,
};
