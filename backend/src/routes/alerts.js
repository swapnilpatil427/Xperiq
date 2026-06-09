// Alerts API. Mounted at /api/alerts.
//   Rules:  GET / · POST / · PATCH /rules/:id · DELETE /rules/:id
//   Events: GET /events · POST /events/:id/acknowledge · /snooze · /resolve
//   Eval:   POST /evaluate/:surveyId  (manual trigger; also runs on a schedule)
const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { validate } = require('../lib/validate');
const { serverError, clientError } = require('../lib/httpError');
const { createRuleSchema, updateRuleSchema, snoozeSchema } = require('../schemas/alerts');
const { evaluateSurveyAlerts, transitionAlert } = require('../lib/alertEngine');
const { catalog } = require('../lib/alertTypes');

const router = express.Router();

// GET /api/alerts/types — the alert taxonomy catalog (powers the setup wizard).
router.get('/types', requireAuth, requirePermission('alerts:manage'), (req, res) => {
  res.json({ types: catalog() });
});

// GET /api/alerts/subscriptions — who receives which alerts.
router.get('/subscriptions', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, user_id, role, rule_id, alert_type, in_app_enabled, email_enabled, slack_enabled
         FROM alert_subscriptions WHERE org_id = $1`,
      [req.orgId]
    );
    res.json({ subscriptions: rows.map((r) => ({
      id: r.id, userId: r.user_id, role: r.role, ruleId: r.rule_id, alertType: r.alert_type,
      inAppEnabled: r.in_app_enabled, emailEnabled: r.email_enabled, slackEnabled: r.slack_enabled,
    })) });
  } catch (err) { serverError(res, err); }
});

// PUT /api/alerts/subscriptions — upsert one subscription (by alertType).
router.put('/subscriptions', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  try {
    const { alertType, inAppEnabled = true, emailEnabled = false, slackEnabled = false } = req.body || {};
    if (!alertType) return clientError(res, 400, 'alertType required');
    // Manual upsert by (org_id, user_id, alert_type) — the table's unique key is on
    // rule_id (NULL here), so ON CONFLICT can't arbitrate type-level subscriptions.
    const { rowCount } = await db.query(
      `UPDATE alert_subscriptions
          SET in_app_enabled = $4, email_enabled = $5, slack_enabled = $6
        WHERE org_id = $1 AND user_id = $2 AND alert_type = $3 AND rule_id IS NULL`,
      [req.orgId, req.userId, alertType, inAppEnabled, emailEnabled, slackEnabled]
    );
    if (rowCount === 0) {
      await db.query(
        `INSERT INTO alert_subscriptions (org_id, user_id, alert_type, in_app_enabled, email_enabled, slack_enabled)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.orgId, req.userId, alertType, inAppEnabled, emailEnabled, slackEnabled]
      );
    }
    res.json({ success: true });
  } catch (err) { serverError(res, err); }
});

// ── Rules ─────────────────────────────────────────────────────────────────--
router.get('/', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM alert_rules WHERE org_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [req.orgId]
    );
    res.json({ rules: rows.map(serializeRule) });
  } catch (err) { serverError(res, err); }
});

router.post('/', requireAuth, requirePermission('alerts:manage'), validate(createRuleSchema), async (req, res) => {
  try {
    const b = req.body;
    const { rows: [rule] } = await db.query(
      `INSERT INTO alert_rules (org_id, survey_id, alert_type, name, description, severity, threshold_config, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
      [req.orgId, b.surveyId || null, b.alertType, b.name, b.description || null,
       b.severity || 'warning', JSON.stringify(b.thresholdConfig || {}), b.isActive ?? true, req.userId]
    );
    res.status(201).json({ rule: serializeRule(rule) });
  } catch (err) { serverError(res, err); }
});

router.patch('/rules/:id', requireAuth, requirePermission('alerts:manage'), validate(updateRuleSchema), async (req, res) => {
  try {
    const map = { name: 'name', description: 'description', severity: 'severity', isActive: 'is_active' };
    const sets = []; const params = []; let p = 1;
    for (const [k, col] of Object.entries(map)) {
      if (k in req.body) { sets.push(`${col} = $${p++}`); params.push(req.body[k]); }
    }
    if ('thresholdConfig' in req.body) { sets.push(`threshold_config = $${p++}::jsonb`); params.push(JSON.stringify(req.body.thresholdConfig)); }
    if (sets.length === 0) return clientError(res, 400, 'No fields to update');
    params.push(req.params.id, req.orgId);
    const { rows: [rule] } = await db.query(
      `UPDATE alert_rules SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${p++} AND org_id = $${p} AND deleted_at IS NULL RETURNING *`, params
    );
    if (!rule) return clientError(res, 404, 'Rule not found');
    res.json({ rule: serializeRule(rule) });
  } catch (err) { serverError(res, err); }
});

router.delete('/rules/:id', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  try {
    const { rows: [r] } = await db.query(
      `UPDATE alert_rules SET deleted_at = NOW() WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.params.id, req.orgId]
    );
    if (!r) return clientError(res, 404, 'Rule not found');
    res.json({ success: true });
  } catch (err) { serverError(res, err); }
});

// ── Events ────────────────────────────────────────────────────────────────--
router.get('/events', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  try {
    const conditions = ['org_id = $1'];
    const params = [req.orgId];
    let p = 2;
    if (req.query.status) { conditions.push(`status = $${p++}`); params.push(req.query.status); }
    if (req.query.severity) { conditions.push(`severity = $${p++}`); params.push(req.query.severity); }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const { rows } = await db.query(
      `SELECT * FROM alert_events WHERE ${conditions.join(' AND ')}
        ORDER BY triggered_at DESC LIMIT $${p}`,
      [...params, limit]
    );
    res.json({ events: rows.map(serializeEvent) });
  } catch (err) { serverError(res, err); }
});

router.post('/events/:id/acknowledge', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  await doTransition(req, res, 'acknowledge');
});
router.post('/events/:id/resolve', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  await doTransition(req, res, 'resolve');
});
router.post('/events/:id/snooze', requireAuth, requirePermission('alerts:manage'), validate(snoozeSchema), async (req, res) => {
  const until = req.body.until
    ? new Date(req.body.until)
    : new Date(Date.now() + (req.body.hours || 24) * 3600e3);
  await doTransition(req, res, 'snooze', { snoozeUntil: until });
});

async function doTransition(req, res, action, extra = {}) {
  try {
    const updated = await transitionAlert(req.params.id, req.orgId, action, req.userId, extra);
    if (!updated) return clientError(res, 404, 'Alert not found');
    res.json({ event: serializeEvent(updated) });
  } catch (err) { serverError(res, err); }
}

// ── Manual evaluation (also runs on the Event Engine schedule) ───────────────
router.post('/evaluate/:surveyId', requireAuth, requirePermission('alerts:manage'), async (req, res) => {
  try {
    const fired = await evaluateSurveyAlerts(req.orgId, req.params.surveyId);
    res.json({ fired: fired.length, events: fired.map(serializeEvent) });
  } catch (err) { serverError(res, err); }
});

function serializeRule(r) {
  return {
    id: r.id, orgId: r.org_id, surveyId: r.survey_id, alertType: r.alert_type,
    name: r.name, description: r.description, isActive: r.is_active, isSystem: r.is_system,
    severity: r.severity, thresholdConfig: r.threshold_config, createdAt: r.created_at,
  };
}
function serializeEvent(e) {
  return {
    id: e.id, orgId: e.org_id, ruleId: e.rule_id, surveyId: e.survey_id, alertType: e.alert_type,
    severity: e.severity, title: e.title, description: e.description,
    crystalNarration: e.crystal_narration, crystalAction: e.crystal_action,
    metricValue: e.metric_value != null ? Number(e.metric_value) : null,
    metricBaseline: e.metric_baseline != null ? Number(e.metric_baseline) : null,
    metricChange: e.metric_change != null ? Number(e.metric_change) : null,
    evidence: e.evidence, status: e.status, triggeredAt: e.triggered_at,
    acknowledgedAt: e.acknowledged_at, resolvedAt: e.resolved_at, snoozedUntil: e.snoozed_until,
  };
}

module.exports = router;
