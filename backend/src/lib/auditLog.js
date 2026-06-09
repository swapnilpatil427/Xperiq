// Append-only compliance audit log writer.
//
// This table is append-only by contract: there is no UPDATE/DELETE code path.
// In production, also REVOKE UPDATE, DELETE ON user_audit_log FROM the app DB
// role (SOC 2 hard requirement) — see migration notes / deploy handoff.
//
// auditLog() never throws into the request path — a logging failure must never
// crash the operation being audited.
const db = require('./db');

/**
 * Write one immutable audit event.
 *
 * @param {object}  e
 * @param {string}  e.orgId
 * @param {string} [e.actorUserId]        Clerk user ID of the actor (null = system/scim)
 * @param {string} [e.actorType]          'user' | 'scim' | 'system' | 'clerk_webhook'
 * @param {string} [e.targetUserId]
 * @param {string} [e.targetResourceType] 'user' | 'role' | 'survey' | 'group' | 'scim_token' ...
 * @param {string} [e.targetResourceId]
 * @param {string}  e.eventType           e.g. 'user.role_changed', 'permission.denied'
 * @param {object} [e.beforeState]
 * @param {object} [e.afterState]
 * @param {string} [e.ipAddress]
 * @param {string} [e.userAgent]
 * @param {string} [e.requestId]
 * @returns {Promise<void>}
 */
async function auditLog({
  orgId,
  actorUserId = null,
  actorType = 'user',
  targetUserId = null,
  targetResourceType = null,
  targetResourceId = null,
  eventType,
  beforeState = null,
  afterState = null,
  ipAddress = null,
  userAgent = null,
  requestId = null,
}) {
  // Truncate user_agent to bound row size / prevent log-injection abuse.
  const safeUserAgent = userAgent ? String(userAgent).slice(0, 500) : null;
  // INET column rejects malformed input — guard so a weird X-Forwarded-For
  // header can never blow up the insert (and thus the audited operation).
  const safeIp = isLikelyIp(ipAddress) ? ipAddress : null;

  return db
    .query(
      `INSERT INTO user_audit_log (
         org_id, actor_user_id, actor_type, target_user_id,
         target_resource_type, target_resource_id, event_type,
         before_state, after_state, ip_address, user_agent, request_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        orgId, actorUserId, actorType, targetUserId,
        targetResourceType, targetResourceId, eventType,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null,
        safeIp, safeUserAgent, requestId,
      ]
    )
    .then(() => {})
    .catch((err) => {
      // Never propagate — but do make persistent failures visible.
      try {
        require('./logger').error(
          { event: 'audit_log_write_failed', eventType, orgId, err: err.message },
          'AUDIT LOG WRITE FAILED'
        );
      } catch {
        console.error('AUDIT LOG WRITE FAILED:', err.message, { eventType, orgId });
      }
    });
}

// Lightweight IPv4/IPv6 sniff — Postgres INET does the real validation; this just
// avoids handing it obviously non-IP values (e.g. comma-joined forwarded lists).
function isLikelyIp(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.includes(',')) return false; // proxy chain, not a single address
  return /^[0-9a-fA-F:.]+$/.test(value);
}

module.exports = { auditLog };
