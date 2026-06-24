// Dashboard API. Mounted at /api/dashboard.
// GET /summary — org KPIs (current vs prior 30 days) + a Crystal narrative.
// Reuses the responses table + org_metric_snapshots (no new tables needed).
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { serverError } from '../lib/httpError';
import { buildNarrative } from '../lib/dashboardNarrative';
import { linearForecast } from '../lib/forecast';
import { anomalyPoints } from '../lib/chartAnnotations';

const router = express.Router();

router.get('/summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req;
  try {
    // Time range (days) drives the period-over-period comparison. Default 30.
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? ''), 10) || 30, 7), 365);
    const cur = String(days);
    const dbl = String(days * 2);

    // Response volume: current window vs prior window (deterministic from responses).
    const { rows: [vol] } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE submitted_at >= NOW() - ($2 || ' days')::interval)::int AS current,
         COUNT(*) FILTER (WHERE submitted_at >= NOW() - ($3 || ' days')::interval
                            AND submitted_at <  NOW() - ($2 || ' days')::interval)::int AS prior
       FROM responses WHERE org_id = $1`,
      [orgId, cur, dbl]
    );

    const { rows: [{ active_surveys }] } = await query(
      `SELECT COUNT(*)::int AS active_surveys FROM surveys
        WHERE org_id = $1 AND status = 'active' AND deleted_at IS NULL`,
      [orgId]
    );

    // NPS/CSAT: latest org snapshot vs the one nearest `days` ago.
    const { rows: [latest] } = await query(
      `SELECT avg_nps, avg_csat, captured_at FROM org_metric_snapshots
        WHERE org_id = $1 ORDER BY captured_at DESC LIMIT 1`,
      [orgId]
    );
    const { rows: [prior] } = await query(
      `SELECT avg_nps, avg_csat FROM org_metric_snapshots
        WHERE org_id = $1 AND captured_at <= NOW() - ($2 || ' days')::interval
        ORDER BY captured_at DESC LIMIT 1`,
      [orgId, cur]
    );

    // Top mover among active surveys (largest |NPS| swing vs its prior snapshot).
    const { rows: movers } = await query(
      `SELECT s.title,
              (SELECT nps FROM survey_metric_snapshots m WHERE m.survey_id = s.id ORDER BY captured_at DESC LIMIT 1) AS nps_now,
              (SELECT nps FROM survey_metric_snapshots m WHERE m.survey_id = s.id AND m.captured_at <= NOW() - ($2 || ' days')::interval ORDER BY captured_at DESC LIMIT 1) AS nps_then
         FROM surveys s
        WHERE s.org_id = $1 AND s.status = 'active' AND s.deleted_at IS NULL
        LIMIT 50`,
      [orgId, cur]
    );
    let topMover: { title: string; npsDelta: number } | null = null;
    for (const m of movers) {
      if (m.nps_now == null || m.nps_then == null) continue;
      const d = Number(m.nps_now) - Number(m.nps_then);
      if (!topMover || Math.abs(d) > Math.abs(topMover.npsDelta)) topMover = { title: m.title, npsDelta: d };
    }

    const num = (v: unknown) => (v == null ? null : Number(v));
    const delta = (a: unknown, b: unknown) => (a == null || b == null ? null : Number(a) - Number(b));

    const kpis = {
      nps: num(latest?.avg_nps),
      npsDelta: delta(latest?.avg_nps, prior?.avg_nps),
      csat: num(latest?.avg_csat),
      csatDelta: delta(latest?.avg_csat, prior?.avg_csat),
      responses: vol.current,
      responsesDelta: vol.current - vol.prior,
      activeSurveys: active_surveys,
    };

    // Predictive overlay: project NPS from the org snapshot history.
    const { rows: hist } = await query(
      `SELECT avg_nps FROM org_metric_snapshots
        WHERE org_id = $1 AND avg_nps IS NOT NULL
        ORDER BY captured_at ASC LIMIT 90`,
      [orgId]
    );
    const npsSeries = hist.map((h: Record<string, unknown>) => Number(h.avg_nps));
    const forecast = linearForecast(npsSeries, 7);
    const anomalies = anomalyPoints(npsSeries);

    const narrative = buildNarrative(kpis, { topMover, period: `the last ${days} days` });
    res.json({ kpis, topMover, narrative, forecast, anomalies, days });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'dashboard_summary' });
  }
});

// GET /api/dashboard/operations — survey health matrix + recent anomaly alerts.
router.get('/operations', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req;
  try {
    const { rows: surveys } = await query(
      `SELECT s.id, s.title, s.status,
              (SELECT COUNT(*)::int FROM responses r WHERE r.survey_id = s.id) AS response_count,
              (SELECT MAX(submitted_at) FROM responses r WHERE r.survey_id = s.id) AS last_response_at,
              m.nps, m.csat, m.captured_at AS metrics_at
         FROM surveys s
         LEFT JOIN LATERAL (
           SELECT nps, csat, captured_at FROM survey_metric_snapshots
            WHERE survey_id = s.id ORDER BY captured_at DESC LIMIT 1
         ) m ON TRUE
        WHERE s.org_id = $1 AND s.deleted_at IS NULL
        ORDER BY s.status = 'active' DESC, response_count DESC
        LIMIT 100`,
      [orgId]
    );

    const { rows: alerts } = await query(
      `SELECT id, alert_type, severity, title, triggered_at
         FROM alert_events
        WHERE org_id = $1 AND status = 'active'
        ORDER BY triggered_at DESC LIMIT 15`,
      [orgId]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const num = (v: unknown) => (v == null ? null : Number(v));
    res.json({
      surveys: surveys.map((s: Record<string, unknown>) => ({
        id: s.id, title: s.title, status: s.status,
        responseCount: s.response_count, lastResponseAt: s.last_response_at,
        nps: num(s.nps), csat: num(s.csat), metricsAt: s.metrics_at,
        freshness: s.last_response_at
          ? (Date.now() - new Date(s.last_response_at as string).getTime() < 7 * 86400e3 ? 'fresh' : 'stale')
          : 'none',
      })),
      anomalies: alerts.map((a: Record<string, unknown>) => ({
        id: a.id, alertType: a.alert_type, severity: a.severity, title: a.title, triggeredAt: a.triggered_at,
      })),
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'dashboard_operations' });
  }
});

// GET /api/dashboard/insights — action board (open alerts) + recent activity.
router.get('/insights', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const { rows: actionItems } = await query(
      `SELECT id, alert_type, severity, title, description, triggered_at
         FROM alert_events
        WHERE org_id = $1 AND status = 'active' AND severity IN ('critical','warning')
        ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, triggered_at DESC
        LIMIT 10`,
      [orgId]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const { rows: recent } = await query(
      `SELECT id, type, priority, title, created_at
         FROM notifications
        WHERE org_id = $1 AND user_id = $2 AND dismissed_at IS NULL
        ORDER BY created_at DESC LIMIT 10`,
      [orgId, userId]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const { rows: [{ discovery_count }] } = await query(
      `SELECT COUNT(*)::int AS discovery_count FROM insights
        WHERE org_id = $1 AND generated_at >= NOW() - INTERVAL '30 days'`,
      [orgId]
    ).catch(() => ({ rows: [{ discovery_count: 0 }] }));

    res.json({
      actionItems: actionItems.map((a: Record<string, unknown>) => ({
        id: a.id, alertType: a.alert_type, severity: a.severity, title: a.title,
        description: a.description, triggeredAt: a.triggered_at,
      })),
      recentActivity: recent.map((n: Record<string, unknown>) => ({
        id: n.id, type: n.type, priority: n.priority, title: n.title, createdAt: n.created_at,
      })),
      discoveryCount: discovery_count,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'dashboard_insights' });
  }
});

export default router;
