/**
 * Outreach analytics + frequency cap management endpoints.
 * Mount point: /api/outreach/analytics (analytics) and /api/outreach/frequency-caps
 * Called by NotificationAnalyticsPage.
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { clientError, serverError } from '../lib/httpError';
import { query } from '../lib/db';
import { getOrgCapRules, upsertCapRule } from '../lib/frequencyCapper';
import { z } from 'zod';

const router = express.Router();

function periodToDays(period: string): number {
  switch (period) {
    case '7d':  return 7;
    case '90d': return 90;
    default:    return 30;
  }
}

/** GET /analytics/summary?period=7d|30d|90d */
router.get('/summary', requireAuth, requirePermission('outreach:logs:read'), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId!;
  const days = periodToDays((req.query.period as string) || '30d');
  try {
    const { rows: [summary] } = await query<{
      total: string; delivered: string; opened: string; clicked: string; bounced: string; failed: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'sent')      AS total,
         COUNT(*) FILTER (WHERE event_type = 'delivered') AS delivered,
         COUNT(*) FILTER (WHERE event_type = 'opened')    AS opened,
         COUNT(*) FILTER (WHERE event_type = 'clicked')   AS clicked,
         COUNT(*) FILTER (WHERE event_type = 'bounced')   AS bounced,
         COUNT(*) FILTER (WHERE event_type = 'failed')    AS failed
       FROM notification_delivery_events
       WHERE org_id = $1 AND occurred_at > NOW() - ($2 || ' days')::interval`,
      [orgId, days]
    );
    const total = parseInt(summary?.total || '0', 10);
    const delivered = parseInt(summary?.delivered || '0', 10);
    const opened = parseInt(summary?.opened || '0', 10);
    const clicked = parseInt(summary?.clicked || '0', 10);
    const bounced = parseInt(summary?.bounced || '0', 10);
    const failed = parseInt(summary?.failed || '0', 10);

    const { rows: [suppRow] } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notification_suppressions WHERE org_id = $1`,
      [orgId]
    );

    res.json({
      sent: total,
      delivered,
      opened,
      clicked,
      bounced,
      failed,
      suppressed: parseInt(suppRow?.count || '0', 10),
      deliveredRate: total > 0 ? +((delivered / total) * 100).toFixed(1) : 0,
      openRate:      delivered > 0 ? +((opened / delivered) * 100).toFixed(1) : 0,
      clickRate:     opened > 0 ? +((clicked / opened) * 100).toFixed(1) : 0,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

/** GET /analytics/channels?period=7d|30d|90d */
router.get('/channels', requireAuth, requirePermission('outreach:logs:read'), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId!;
  const days = periodToDays((req.query.period as string) || '30d');
  try {
    const { rows } = await query<{
      channel: string; sent: string; delivered: string; opened: string; clicked: string;
    }>(
      `SELECT
         channel,
         COUNT(*) FILTER (WHERE event_type = 'sent')      AS sent,
         COUNT(*) FILTER (WHERE event_type = 'delivered') AS delivered,
         COUNT(*) FILTER (WHERE event_type = 'opened')    AS opened,
         COUNT(*) FILTER (WHERE event_type = 'clicked')   AS clicked
       FROM notification_delivery_events
       WHERE org_id = $1 AND occurred_at > NOW() - ($2 || ' days')::interval
       GROUP BY channel ORDER BY sent DESC`,
      [orgId, days]
    );
    res.json(rows.map((r) => ({
      channel: r.channel,
      sent:      parseInt(r.sent, 10),
      delivered: parseInt(r.delivered, 10),
      opened:    parseInt(r.opened, 10),
      clicked:   parseInt(r.clicked, 10),
      deliveredRate: parseInt(r.sent, 10) > 0 ? +((parseInt(r.delivered, 10) / parseInt(r.sent, 10)) * 100).toFixed(1) : 0,
      openRate:      parseInt(r.delivered, 10) > 0 ? +((parseInt(r.opened, 10) / parseInt(r.delivered, 10)) * 100).toFixed(1) : 0,
      clickRate:     parseInt(r.opened, 10) > 0 ? +((parseInt(r.clicked, 10) / parseInt(r.opened, 10)) * 100).toFixed(1) : 0,
    })));
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

/** GET /analytics/workflows?period=7d|30d|90d */
router.get('/workflows', requireAuth, requirePermission('outreach:logs:read'), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId!;
  const days = periodToDays((req.query.period as string) || '30d');
  try {
    const { rows } = await query<{ workflow_id: string; sent: string; delivered: string }>(
      `SELECT
         workflow_id,
         COUNT(*) FILTER (WHERE event_type = 'sent')      AS sent,
         COUNT(*) FILTER (WHERE event_type = 'delivered') AS delivered
       FROM notification_delivery_events
       WHERE org_id = $1 AND workflow_id IS NOT NULL
         AND occurred_at > NOW() - ($2 || ' days')::interval
       GROUP BY workflow_id ORDER BY sent DESC LIMIT 10`,
      [orgId, days]
    );
    res.json(rows.map((r) => ({
      workflowId: r.workflow_id,
      sent:      parseInt(r.sent, 10),
      delivered: parseInt(r.delivered, 10),
      deliveredRate: parseInt(r.sent, 10) > 0 ? +((parseInt(r.delivered, 10) / parseInt(r.sent, 10)) * 100).toFixed(1) : 0,
    })));
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

/** GET /frequency-caps — get org cap rules */
const getFrequencyCaps = async (req: Request, res: Response): Promise<void> => {
  try {
    const rules = await getOrgCapRules(req.orgId!);
    res.json(rules);
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
};

const upsertCapSchema = z.object({
  channel: z.enum(['email', 'sms', 'push', 'in_app', 'slack', 'all']),
  maxCount: z.number().int().min(1).max(10000),
  windowHours: z.number().int().min(1).max(8760),
});

/** POST /frequency-caps — upsert a cap rule */
const postFrequencyCap = async (req: Request, res: Response): Promise<void> => {
  const parsed = upsertCapSchema.safeParse(req.body);
  if (!parsed.success) { clientError(res, 400, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }
  try {
    await upsertCapRule(req.orgId!, parsed.data.channel, parsed.data.maxCount, parsed.data.windowHours, req.userId!);
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
};

/** DELETE /frequency-caps/:channel — remove a cap rule */
const deleteFrequencyCap = async (req: Request, res: Response): Promise<void> => {
  const { channel } = req.params;
  try {
    await query(
      `UPDATE notification_frequency_caps SET is_active = FALSE, updated_at = NOW()
       WHERE org_id = $1 AND channel = $2`,
      [req.orgId!, channel]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
};

router.get('/frequency-caps', requireAuth, requirePermission('outreach:configure'), getFrequencyCaps);
router.post('/frequency-caps', requireAuth, requirePermission('outreach:configure'), postFrequencyCap);
router.delete('/frequency-caps/:channel', requireAuth, requirePermission('outreach:configure'), deleteFrequencyCap);

export const frequencyCapsRouter = express.Router();
frequencyCapsRouter.get('/', requireAuth, requirePermission('outreach:configure'), getFrequencyCaps);
frequencyCapsRouter.post('/', requireAuth, requirePermission('outreach:configure'), postFrequencyCap);
frequencyCapsRouter.delete('/:channel', requireAuth, requirePermission('outreach:configure'), deleteFrequencyCap);

export default router;
