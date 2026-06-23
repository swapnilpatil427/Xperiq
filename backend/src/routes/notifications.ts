/**
 * Notification routes (v2). Mounted at /api/notifications.
 *
 *   GET    /api/notifications              — paginated list (filters: unread, priority, type)
 *   GET    /api/notifications/count        — { unread, critical }
 *   POST   /api/notifications/:id/read     — mark one read
 *   POST   /api/notifications/read-all     — mark all read
 *   DELETE /api/notifications/:id          — dismiss (soft)
 *   GET    /api/notifications/preferences  — per-type channel preferences
 *   PUT    /api/notifications/preferences  — upsert preferences
 *   GET    /api/notifications/pending      — (legacy) notification_events drain
 */
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../lib/db';
import { getRedisClient } from '../lib/redis';
import { serverError } from '../lib/httpError';
import { validate } from '../lib/validate';
import { serialize, PRIORITIES } from '../lib/notifications';
import { buildDigest } from '../lib/digest';
import { updatePreferencesSchema } from '../schemas/notifications';

const router = express.Router();

interface PgError extends Error {
  code?: string;
}

// Auth for the SSE stream. EventSource can't set headers, so the token may arrive
// as a ?token= query param. SKIP_AUTH dev mode bypasses to dev-user.
async function streamAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.SKIP_AUTH === 'true') { req.userId = 'dev-user'; req.orgId = 'dev-org'; next(); return; }
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : req.query.token as string | undefined;
  if (!token) { res.status(401).end(); return; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const payload = await clerk.verifyToken(token);
    req.userId = payload.sub;
    req.orgId = payload.org_id || payload.sub;
    next();
  } catch {
    res.status(401).end();
  }
}

// GET /api/notifications/stream — Server-Sent Events for real-time delivery.
// (SSE chosen over Socket.IO: dependency-free, and the codebase already uses SSE
// for Crystal. Server→client push is exactly what notifications need.)
router.get('/stream', streamAuth, async (req: Request, res: Response): Promise<void> => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: {"ok":true}\n\n`);

  const redis = getRedisClient();
  let sub: ReturnType<typeof redis.duplicate> | null = null;
  if (redis) {
    sub = redis.duplicate();
    const channel = `notifications:live:${req.userId}`;
    sub.on('message', (_ch: string, message: string) => {
      res.write(`event: notification\ndata: ${message}\n\n`);
    });
    sub.subscribe(channel).catch(() => {});
  }

  // Heartbeat keeps proxies from closing the idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (sub) { try { sub.disconnect(); } catch { /* ignore */ } }
    res.end();
  });
});

// Gracefully no-op if the table isn't migrated yet (mirrors prior behavior).
function missingTable(err: unknown, res: Response, fallback: unknown): boolean {
  const pgErr = err as PgError;
  if (pgErr.code === '42P01') { res.json(fallback); return true; }
  return false;
}

// GET /api/notifications
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? ''), 10) || 20, 100);
    const page = Math.max(parseInt(String(req.query.page ?? ''), 10) || 1, 1);
    const offset = (page - 1) * limit;

    const conditions = ['org_id = $1', 'user_id = $2', 'dismissed_at IS NULL'];
    const params: unknown[] = [orgId, userId];
    let p = 3;
    if (req.query.unread === 'true') conditions.push('read = FALSE');
    if (req.query.priority && PRIORITIES.includes(req.query.priority as string)) {
      conditions.push(`priority = $${p++}`); params.push(req.query.priority);
    }
    if (req.query.type) { conditions.push(`type = $${p++}`); params.push(req.query.type); }
    const where = conditions.join(' AND ');

    const [{ rows }, { rows: [{ count }] }] = await Promise.all([
      query(
        `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS count FROM notifications WHERE ${where}`, params),
    ]);

    res.json({
      notifications: rows.map(serialize),
      pagination: { page, limit, total: count, hasMore: offset + rows.length < count },
    });
  } catch (err: unknown) {
    if (missingTable(err, res, { notifications: [], pagination: { page: 1, limit: 20, total: 0, hasMore: false } })) return;
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notifications_list' });
  }
});

// GET /api/notifications/digest?period=day|week
router.get('/digest', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const period = req.query.period === 'week' ? 'week' : 'day';
    res.json(await buildDigest(orgId, userId, period));
  } catch (err: unknown) {
    if (missingTable(err, res, { period: 'day', total: 0, byPriority: {}, byType: [], topItems: [] })) return;
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notifications_digest' });
  }
});

// GET /api/notifications/count
router.get('/count', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const { rows: [row] } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE read = FALSE)::int AS unread,
         COUNT(*) FILTER (WHERE read = FALSE AND priority = 'critical')::int AS critical
       FROM notifications
       WHERE org_id = $1 AND user_id = $2 AND dismissed_at IS NULL`,
      [orgId, userId]
    );
    res.json({ unread: row.unread, critical: row.critical });
  } catch (err: unknown) {
    if (missingTable(err, res, { unread: 0, critical: 0 })) return;
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notifications_count' });
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const { rowCount } = await query(
      `UPDATE notifications SET read = TRUE, read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND org_id = $2 AND user_id = $3`,
      [req.params.id, orgId, userId]
    );
    if (rowCount === 0) { res.status(404).json({ error: 'Notification not found' }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notifications_read' });
  }
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const { rowCount } = await query(
      `UPDATE notifications SET read = TRUE, read_at = COALESCE(read_at, NOW())
        WHERE org_id = $1 AND user_id = $2 AND read = FALSE`,
      [orgId, userId]
    );
    res.json({ success: true, updated: rowCount });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notifications_read_all' });
  }
});

// DELETE /api/notifications/:id — dismiss (soft)
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const { rowCount } = await query(
      `UPDATE notifications SET dismissed_at = NOW()
        WHERE id = $1 AND org_id = $2 AND user_id = $3 AND dismissed_at IS NULL`,
      [req.params.id, orgId, userId]
    );
    if (rowCount === 0) { res.status(404).json({ error: 'Notification not found' }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notifications_dismiss' });
  }
});

// GET /api/notifications/preferences — per-type channel preferences
router.get('/preferences', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const { rows } = await query(
      `SELECT notification_type, in_app_enabled, email_enabled, slack_enabled, threshold_config
         FROM notification_type_preferences WHERE org_id = $1 AND user_id = $2
        ORDER BY notification_type`,
      [orgId, userId]
    );
    res.json({
      preferences: rows.map((r: Record<string, unknown>) => ({
        notificationType: r.notification_type,
        inAppEnabled: r.in_app_enabled,
        emailEnabled: r.email_enabled,
        slackEnabled: r.slack_enabled,
        thresholdConfig: r.threshold_config,
      })),
    });
  } catch (err: unknown) {
    if (missingTable(err, res, { preferences: [] })) return;
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notification_preferences_get' });
  }
});

// PUT /api/notifications/preferences — upsert a batch of per-type preferences
router.put('/preferences', requireAuth, validate(updatePreferencesSchema), async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    for (const pref of req.body.preferences) {
      await query(
        `INSERT INTO notification_type_preferences
           (org_id, user_id, notification_type, in_app_enabled, email_enabled, slack_enabled, threshold_config)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT (org_id, user_id, notification_type) DO UPDATE SET
           in_app_enabled = EXCLUDED.in_app_enabled,
           email_enabled  = EXCLUDED.email_enabled,
           slack_enabled  = EXCLUDED.slack_enabled,
           threshold_config = EXCLUDED.threshold_config,
           updated_at = NOW()`,
        [orgId, userId, pref.notificationType,
         pref.inAppEnabled ?? true, pref.emailEnabled ?? false, pref.slackEnabled ?? false,
         JSON.stringify(pref.thresholdConfig || {})]
      );
    }
    res.json({ success: true, updated: req.body.preferences.length });
  } catch (err: unknown) {
    if (missingTable(err, res, { success: true, updated: 0 })) return;
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notification_preferences_put' });
  }
});

// GET /api/notifications/pending — (legacy) drain notification_events
router.get('/pending', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId, userId } = req;
  try {
    const { rows } = await query(
      `WITH pending AS (
         SELECT id, event_type, payload, created_at
         FROM notification_events
         WHERE org_id = $1 AND user_id = $2 AND status = 'pending' AND channel = 'in_app'
         ORDER BY created_at DESC LIMIT 20
       )
       UPDATE notification_events SET status = 'delivered', delivered_at = NOW()
       WHERE id IN (SELECT id FROM pending)
       RETURNING id, event_type, payload, created_at`,
      [orgId, userId]
    );
    res.json({ notifications: rows, count: rows.length });
  } catch (err: unknown) {
    if (missingTable(err, res, { notifications: [], count: 0 })) return;
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'notifications_pending' });
  }
});

export default router;
