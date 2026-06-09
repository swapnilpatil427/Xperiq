// Compliance audit log API. Mounted at /api/audit-logs. Read-only (the table is
// append-only). Supports filtering + CSV export for compliance review.
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { serverError } = require('../lib/httpError');

const router = express.Router();

router.get('/', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions = ['ual.org_id = $1'];
    const params = [req.orgId];
    let p = 2;
    if (req.query.event_type)     { conditions.push(`ual.event_type = $${p++}`); params.push(req.query.event_type); }
    if (req.query.actor_user_id)  { conditions.push(`ual.actor_user_id = $${p++}`); params.push(req.query.actor_user_id); }
    if (req.query.target_user_id) { conditions.push(`ual.target_user_id = $${p++}`); params.push(req.query.target_user_id); }
    if (req.query.start_date)     { conditions.push(`ual.occurred_at >= $${p++}`); params.push(req.query.start_date); }
    if (req.query.end_date)       { conditions.push(`ual.occurred_at <= $${p++}`); params.push(req.query.end_date); }
    const where = conditions.join(' AND ');

    const [{ rows: events }, { rows: [{ count }] }] = await Promise.all([
      db.query(
        `SELECT ual.*,
                a.display_name AS actor_name, a.email AS actor_email,
                tg.display_name AS target_name, tg.email AS target_email
           FROM user_audit_log ual
           LEFT JOIN user_profiles a  ON a.user_id = ual.actor_user_id  AND a.org_id = $1
           LEFT JOIN user_profiles tg ON tg.user_id = ual.target_user_id AND tg.org_id = $1
          WHERE ${where}
          ORDER BY ual.occurred_at DESC
          LIMIT $${p++} OFFSET $${p}`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*)::int AS count FROM user_audit_log ual WHERE ${where}`, params),
    ]);

    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
      const header = 'timestamp,actor,actor_email,event_type,target,target_email,ip_address\n';
      const body = events.map((e) => [
        e.occurred_at, csv(e.actor_name || 'system'), csv(e.actor_email || ''),
        csv(e.event_type), csv(e.target_name || ''), csv(e.target_email || ''), csv(e.ip_address || ''),
      ].join(',')).join('\n');
      return res.send(header + body);
    }

    res.json({
      events: events.map(serialize),
      total: count, page, limit, pages: Math.ceil(count / limit),
    });
  } catch (err) {
    serverError(res, err);
  }
});

function csv(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function serialize(e) {
  return {
    id: e.id,
    eventType: e.event_type,
    actorUserId: e.actor_user_id,
    actorName: e.actor_name,
    actorEmail: e.actor_email,
    actorType: e.actor_type,
    targetUserId: e.target_user_id,
    targetName: e.target_name,
    targetResourceType: e.target_resource_type,
    targetResourceId: e.target_resource_id,
    beforeState: e.before_state,
    afterState: e.after_state,
    ipAddress: e.ip_address,
    occurredAt: e.occurred_at,
  };
}

module.exports = router;
