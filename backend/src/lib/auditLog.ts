// Append-only compliance audit log writer.
//
// This table is append-only by contract: there is no UPDATE/DELETE code path.
// In production, also REVOKE UPDATE, DELETE ON user_audit_log FROM the app DB
// role (SOC 2 hard requirement) — see migration notes / deploy handoff.
//
// auditLog() never throws into the request path — a logging failure must never
// crash the operation being audited.
import { query } from './db';

interface AuditLogParams {
  orgId: string;
  actorUserId?: string | null;
  actorType?: string;
  targetUserId?: string | null;
  targetResourceType?: string | null;
  targetResourceId?: string | null;
  eventType: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Write one immutable audit event.
 */
export async function auditLog({
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
}: AuditLogParams): Promise<void> {
  // Truncate user_agent to bound row size / prevent log-injection abuse.
  const safeUserAgent = userAgent ? String(userAgent).slice(0, 500) : null;
  // INET column rejects malformed input — guard so a weird X-Forwarded-For
  // header can never blow up the insert (and thus the audited operation).
  const safeIp = isLikelyIp(ipAddress) ? ipAddress : null;

  return query(
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
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // Never propagate — but do make persistent failures visible.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./logger').error(
          { event: 'audit_log_write_failed', eventType, orgId, err: msg },
          'AUDIT LOG WRITE FAILED'
        );
      } catch {
        console.error('AUDIT LOG WRITE FAILED:', msg, { eventType, orgId });
      }
    });
}

// Lightweight IPv4/IPv6 sniff — Postgres INET does the real validation; this just
// avoids handing it obviously non-IP values (e.g. comma-joined forwarded lists).
function isLikelyIp(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.includes(',')) return false; // proxy chain, not a single address
  return /^[0-9a-fA-F:.]+$/.test(value);
}
