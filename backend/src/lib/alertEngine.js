// Alert evaluation engine.
//
// Increment 1 covers deterministic evaluators (threshold + Z-score anomaly) for
// score/volume alerts, plus firing (Redis dedup → persist alert_event + history →
// publish an `alert.fired` notification event through the Event Engine) and the
// state machine (acknowledge / snooze / resolve). PELT changepoint + LLM narration
// (Crystal) land in a later increment.
const db = require('./db');
const { getRedisClient } = require('./redis');
const { publishNotificationEvent } = require('./notificationEvents');
const { linearForecast } = require('./forecast');

// Dedup window per severity (ms) — prevents the same condition re-firing.
const DEDUP_TTL_MS = { critical: 24 * 3600e3, warning: 6 * 3600e3, info: 1 * 3600e3, success: 1 * 3600e3 };

// ── Statistics ──────────────────────────────────────────────────────────────

/** Mean + sample standard deviation of a numeric series. */
function stats(series) {
  const xs = series.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return { n: 0, mean: 0, std: 0 };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, std: Math.sqrt(variance) };
}

/** Z-score of `value` against a baseline `series`. */
function zScore(series, value) {
  const { mean, std } = stats(series);
  if (std === 0) return 0;
  return (value - mean) / std;
}

/** Anomaly when |z| >= threshold (default 3) and there is enough baseline. */
function detectAnomaly(series, value, { z = 3, minPoints = 5 } = {}) {
  const s = stats(series);
  if (s.n < minPoints) return { isAnomaly: false, z: 0, ...s };
  const score = zScore(series, value);
  return { isAnomaly: Math.abs(score) >= z, z: score, ...s };
}

/** NPS from an array of {nps_score} rows: %promoters − %detractors. */
function computeNps(rows) {
  const scored = rows.filter((r) => r.nps_score != null);
  if (scored.length === 0) return null;
  const promoters = scored.filter((r) => r.nps_score >= 9).length;
  const detractors = scored.filter((r) => r.nps_score <= 6).length;
  return Math.round(((promoters - detractors) / scored.length) * 100);
}

// ── Firing ────────────────────────────────────────────────────────────────--

async function isDuplicate(orgId, ruleId, entityId, severity) {
  const redis = getRedisClient();
  if (!redis || redis.status !== 'ready') return false;
  const ttl = DEDUP_TTL_MS[severity] || DEDUP_TTL_MS.info;
  const windowKey = Math.floor(Date.now() / ttl);
  const key = `alert:dedup:${orgId}:${ruleId}:${entityId || 'org'}:${windowKey}`;
  // SET NX: returns 'OK' if newly set, null if already present.
  const set = await redis.set(key, '1', 'PX', ttl, 'NX');
  return set === null;
}

async function resolveSubscribers(orgId, rule) {
  const { rows } = await db.query(
    `SELECT DISTINCT user_id FROM alert_subscriptions
      WHERE org_id = $1 AND user_id IS NOT NULL AND in_app_enabled = TRUE
        AND (rule_id = $2 OR (rule_id IS NULL AND (alert_type = $3 OR alert_type IS NULL)))`,
    [orgId, rule.id, rule.alert_type]
  );
  return rows.map((r) => r.user_id);
}

/**
 * Fire an alert: dedup, persist alert_event + history, publish notification.
 * @returns {Promise<object|null>} the alert_event row, or null if deduped.
 */
async function fireAlert(rule, {
  orgId, surveyId = null, severity, title, description,
  metricValue = null, metricBaseline = null, metricChange = null, evidence = {},
  crystalNarration = null, crystalAction = null,
}) {
  if (await isDuplicate(orgId, rule.id, surveyId, severity)) return null;

  const { rows: [event] } = await db.query(
    `INSERT INTO alert_events
       (org_id, rule_id, survey_id, alert_type, severity, title, description,
        crystal_narration, crystal_action, metric_value, metric_baseline, metric_change, evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
     RETURNING *`,
    [orgId, rule.id, surveyId, rule.alert_type, severity, title, description,
     crystalNarration, crystalAction, metricValue, metricBaseline, metricChange, JSON.stringify(evidence)]
  );

  await db.query(
    `INSERT INTO alert_history (alert_event_id, user_id, action, from_status, to_status)
     VALUES ($1, NULL, 'triggered', NULL, 'active')`,
    [event.id]
  );

  // Deliver via the Notification Service (Event Engine). Empty recipients → org admins.
  const targetUserIds = await resolveSubscribers(orgId, rule);
  await publishNotificationEvent({
    type: 'alert.fired', orgId, priority: severity,
    targetUserIds, entityType: 'alert', entityId: event.id,
    title, body: crystalNarration || description,
    actionUrl: '/app/alerts',
    payload: { alertType: rule.alert_type, ruleId: rule.id, surveyId, metricValue, metricChange },
  }).catch(() => {});

  return event;
}

// ── State machine ─────────────────────────────────────────────────────────--

const TRANSITIONS = {
  acknowledge: { to: 'acknowledged', stamp: 'acknowledged' },
  resolve:     { to: 'resolved',     stamp: 'resolved' },
  snooze:      { to: 'snoozed',      stamp: null },
};

async function transitionAlert(eventId, orgId, action, userId, { snoozeUntil = null } = {}) {
  const t = TRANSITIONS[action];
  if (!t) throw new Error(`Unknown alert action: ${action}`);

  const { rows: [current] } = await db.query(
    'SELECT status FROM alert_events WHERE id = $1 AND org_id = $2', [eventId, orgId]
  );
  if (!current) return null;

  const sets = ['status = $3'];
  const params = [eventId, orgId, t.to];
  let p = 4;
  if (t.stamp) {
    sets.push(`${t.stamp}_at = NOW()`, `${t.stamp}_by = $${p++}`);
    params.push(userId);
  }
  if (action === 'snooze') {
    sets.push(`snoozed_until = $${p++}`, `snoozed_by = $${p++}`);
    params.push(snoozeUntil, userId);
  }
  const { rows: [updated] } = await db.query(
    `UPDATE alert_events SET ${sets.join(', ')} WHERE id = $1 AND org_id = $2 RETURNING *`, params
  );

  await db.query(
    `INSERT INTO alert_history (alert_event_id, user_id, action, from_status, to_status)
     VALUES ($1,$2,$3,$4,$5)`,
    [eventId, userId, action, current.status, t.to]
  );
  return updated;
}

// ── Scheduled evaluation (deterministic alert types) ─────────────────────────

/** Evaluate active rules for one survey: S-01 (NPS drop) + V-03 (volume anomaly). */
async function evaluateSurveyAlerts(orgId, surveyId) {
  const { rows: rules } = await db.query(
    `SELECT * FROM alert_rules
      WHERE org_id = $1 AND is_active = TRUE AND deleted_at IS NULL
        AND (survey_id = $2 OR survey_id IS NULL)`,
    [orgId, surveyId]
  );
  const fired = [];
  for (const rule of rules) {
    let event = null;
    if (rule.alert_type === 'S-01') event = await evalNpsDrop(rule, orgId, surveyId);
    else if (rule.alert_type === 'S-02') event = await evalNpsRise(rule, orgId, surveyId);
    else if (rule.alert_type === 'S-08') event = await evalPredictiveNps(rule, orgId, surveyId);
    else if (rule.alert_type === 'V-03') event = await evalVolumeAnomaly(rule, orgId, surveyId);
    if (event) fired.push(event);
  }
  return fired;
}

// Shared current-vs-prior NPS computation over a window.
async function npsWindows(orgId, surveyId, windowDays) {
  const { rows: current } = await db.query(
    `SELECT nps_score FROM responses
      WHERE survey_id = $1 AND org_id = $2 AND submitted_at >= NOW() - ($3 || ' days')::interval`,
    [surveyId, orgId, String(windowDays)]
  );
  const { rows: prior } = await db.query(
    `SELECT nps_score FROM responses
      WHERE survey_id = $1 AND org_id = $2
        AND submitted_at >= NOW() - ($3 || ' days')::interval
        AND submitted_at <  NOW() - ($4 || ' days')::interval`,
    [surveyId, orgId, String(windowDays * 2), String(windowDays)]
  );
  return { cur: computeNps(current), base: computeNps(prior) };
}

async function evalNpsRise(rule, orgId, surveyId) {
  const cfg = rule.threshold_config || {};
  const windowDays = cfg.windowDays || 7;
  const minRise = cfg.minRise ?? 5;
  const { cur, base } = await npsWindows(orgId, surveyId, windowDays);
  if (cur == null || base == null) return null;
  const rise = cur - base;
  if (rise < minRise) return null;
  return fireAlert(rule, {
    orgId, surveyId, severity: rule.severity || 'success',
    title: `NPS rose ${rise} points`,
    description: `NPS climbed from ${base} to ${cur} over the last ${windowDays} days.`,
    metricValue: cur, metricBaseline: base, metricChange: rise,
  });
}

async function evalNpsDrop(rule, orgId, surveyId) {
  const cfg = rule.threshold_config || {};
  const windowDays = cfg.windowDays || 7;
  const minDrop = cfg.minDrop ?? 5;

  const { rows: current } = await db.query(
    `SELECT nps_score FROM responses
      WHERE survey_id = $1 AND org_id = $2 AND submitted_at >= NOW() - ($3 || ' days')::interval`,
    [surveyId, orgId, String(windowDays)]
  );
  const { rows: prior } = await db.query(
    `SELECT nps_score FROM responses
      WHERE survey_id = $1 AND org_id = $2
        AND submitted_at >= NOW() - ($3 || ' days')::interval
        AND submitted_at <  NOW() - ($4 || ' days')::interval`,
    [surveyId, orgId, String(windowDays * 2), String(windowDays)]
  );
  const cur = computeNps(current);
  const base = computeNps(prior);
  if (cur == null || base == null) return null;
  const drop = base - cur;
  if (drop < minDrop) return null;

  return fireAlert(rule, {
    orgId, surveyId, severity: rule.severity || 'critical',
    title: `NPS dropped ${drop} points`,
    description: `NPS fell from ${base} to ${cur} over the last ${windowDays} days.`,
    metricValue: cur, metricBaseline: base, metricChange: -drop,
  });
}

async function evalVolumeAnomaly(rule, orgId, surveyId) {
  const cfg = rule.threshold_config || {};
  const { rows } = await db.query(
    `SELECT TO_CHAR(DATE_TRUNC('day', submitted_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
       FROM responses WHERE survey_id = $1 AND org_id = $2
        AND submitted_at >= NOW() - INTERVAL '14 days'
      GROUP BY 1 ORDER BY 1`,
    [surveyId, orgId]
  );
  if (rows.length < 6) return null;
  const series = rows.slice(0, -1).map((r) => r.n);
  const today = rows[rows.length - 1].n;
  const { isAnomaly, z, mean } = detectAnomaly(series, today, { z: cfg.z || 3 });
  if (!isAnomaly) return null;

  return fireAlert(rule, {
    orgId, surveyId, severity: rule.severity || 'warning',
    title: `Response volume ${z > 0 ? 'spike' : 'drop'} detected`,
    description: `Today's volume (${today}) is ${z.toFixed(1)}σ from the ~${mean.toFixed(0)}/day baseline.`,
    metricValue: today, metricBaseline: Math.round(mean), metricChange: today - Math.round(mean),
  });
}

// Predictive alert (S-08): fire BEFORE the threshold is crossed. Uses the trend
// forecast — if NPS is currently above the floor but projected to fall below it
// within the horizon, raise a warning with the projected value + ETA.
async function evalPredictiveNps(rule, orgId, surveyId) {
  const cfg = rule.threshold_config || {};
  const floor = cfg.below ?? 30;
  const horizon = cfg.horizon ?? 7;

  const { rows } = await db.query(
    `SELECT nps FROM survey_metric_snapshots
      WHERE survey_id = $1 AND org_id = $2 AND nps IS NOT NULL
      ORDER BY captured_at ASC LIMIT 60`,
    [surveyId, orgId]
  );
  const series = rows.map((r) => Number(r.nps));
  if (series.length < 3) return null;

  const current = series[series.length - 1];
  if (current < floor) return null; // already below — that's S-03's job, not predictive

  const fc = linearForecast(series, horizon);
  if (!fc || fc.direction !== 'down') return null;

  // First projected period that dips below the floor.
  const crossIdx = fc.points.findIndex((p) => p < floor);
  if (crossIdx === -1) return null;

  return fireAlert(rule, {
    orgId, surveyId, severity: rule.severity || 'warning',
    title: `NPS projected to fall below ${floor}`,
    description: `Crystal predicts NPS will dip below ${floor} in ~${crossIdx + 1} period(s) (now ${Math.round(current)}, trend falling).`,
    metricValue: current, metricBaseline: floor, metricChange: fc.points[crossIdx] - current,
    evidence: { forecast: fc.points, r2: fc.r2 },
  });
}

// Sweep all surveys that have active rules (called on the Event Engine schedule).
async function runScheduledEvaluation() {
  const { rows } = await db.query(
    `SELECT DISTINCT org_id, survey_id FROM alert_rules
      WHERE is_active = TRUE AND deleted_at IS NULL AND survey_id IS NOT NULL`
  );
  let fired = 0;
  for (const r of rows) {
    try { fired += (await evaluateSurveyAlerts(r.org_id, r.survey_id)).length; }
    catch { /* one survey's failure must not abort the sweep */ }
  }
  return fired;
}

module.exports = {
  stats, zScore, detectAnomaly, computeNps,
  fireAlert, transitionAlert, resolveSubscribers,
  evaluateSurveyAlerts, evalNpsDrop, evalNpsRise, evalVolumeAnomaly, evalPredictiveNps, runScheduledEvaluation, DEDUP_TTL_MS,
};
