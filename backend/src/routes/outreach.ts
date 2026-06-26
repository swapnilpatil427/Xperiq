/**
 * Outreach Broadcast routes (Tier 3 Phase J: Broadcast Approval Queue)
 *
 *   GET    /api/outreach/broadcasts/stats   — { pending, approved, sent, rejected } counts
 *   GET    /api/outreach/broadcasts         — list (query: status, page, limit)
 *   POST   /api/outreach/broadcasts         — create broadcast
 *   GET    /api/outreach/broadcasts/:id     — get one + audit log
 *   POST   /api/outreach/broadcasts/:id/approve — approve (requirePermission('outreach:approve'))
 *   POST   /api/outreach/broadcasts/:id/reject  — reject with reason
 *   DELETE /api/outreach/broadcasts/:id     — cancel if pending_approval
 *   POST   /api/outreach/broadcasts/:id/send    — trigger after approval
 */
import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';
import logger from '../lib/logger';
import { debitCredits } from '../lib/creditLedger';
import { CREDIT_COSTS } from '../lib/creditPlans';
import {
  createBroadcast,
  notifyApprovers,
  approveBroadcast,
  rejectBroadcast,
  listBroadcasts,
  getBroadcastAudit,
} from '../lib/broadcastEngine';

const router = express.Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createBroadcastSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  segmentId: z.string().uuid().optional(),
  contactIds: z.array(z.string().uuid()).max(10000).optional(),
  workflowId: z.string().optional(),
  channels: z.array(z.enum(['email', 'sms', 'push', 'in_app'])).min(1).optional(),
  payload: z.object({
    surveyTitle: z.string().optional(),
    surveyUrl: z.string().url().optional(),
    subject: z.string().max(200).optional(),
    body: z.string().max(5000).optional(),
    ctaLabel: z.string().max(100).optional(),
    ctaUrl: z.string().url().optional(),
    senderName: z.string().max(100).optional(),
  }),
}).refine((d) => d.segmentId || (d.contactIds && d.contactIds.length > 0), {
  message: 'Either segmentId or contactIds is required',
});

const rejectBroadcastSchema = z.object({
  reason: z.string().min(1).max(1000),
});

// ── GET /api/outreach/broadcasts/stats — must be before /:id ─────────────────

router.get('/broadcasts/stats', requireAuth, requirePermission('outreach:logs:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query<{
      pending: string;
      approved: string;
      sent: string;
      rejected: string;
      sending: string;
      failed: string;
      expired: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending_approval')::text AS pending,
         COUNT(*) FILTER (WHERE status = 'approved')::text AS approved,
         COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
         COUNT(*) FILTER (WHERE status = 'rejected')::text AS rejected,
         COUNT(*) FILTER (WHERE status = 'sending')::text AS sending,
         COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
         COUNT(*) FILTER (WHERE status = 'expired')::text AS expired
       FROM outreach_broadcasts
       WHERE org_id = $1`,
      [req.orgId]
    );

    const r = rows[0] ?? {};
    res.json({
      pending:  parseInt(r.pending  ?? '0', 10),
      approved: parseInt(r.approved ?? '0', 10),
      sent:     parseInt(r.sent     ?? '0', 10),
      rejected: parseInt(r.rejected ?? '0', 10),
      sending:  parseInt(r.sending  ?? '0', 10),
      failed:   parseInt(r.failed   ?? '0', 10),
      expired:  parseInt(r.expired  ?? '0', 10),
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') {
      res.json({ pending: 0, approved: 0, sent: 0, rejected: 0, sending: 0, failed: 0, expired: 0 });
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/outreach/broadcasts ──────────────────────────────────────────────

router.get('/broadcasts', requireAuth, requirePermission('outreach:logs:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page   = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));

    const result = await listBroadcasts(req.orgId!, status, page, limit);
    res.json({ ...result, page, limit });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ broadcasts: [], total: 0, page: 1, limit: 20 }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/outreach/broadcasts ─────────────────────────────────────────────

router.post(
  '/broadcasts',
  requireAuth,
  requirePermission('outreach:broadcast'),
  validate(createBroadcastSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as z.infer<typeof createBroadcastSchema>;

      const broadcast = await createBroadcast({
        name:        body.name,
        description: body.description,
        segmentId:   body.segmentId,
        contactIds:  body.contactIds,
        workflowId:  body.workflowId,
        channels:    body.channels,
        payload:     body.payload,
        orgId:       req.orgId!,
        createdBy:   req.userId!,
      });

      logger.info({ broadcastId: broadcast.id, orgId: req.orgId, actor: req.userId }, 'outreach:broadcast:created');

      // Notify approvers asynchronously — don't block the response
      void notifyApprovers(req.orgId!, broadcast);

      res.status(201).json({ broadcast });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === '42P01') {
        clientError(res, 503, 'Broadcasts feature not yet migrated — run pending migrations');
        return;
      }
      serverError(res, err instanceof Error ? err : new Error(String(err)));
    }
  }
);

// ── GET /api/outreach/broadcasts/:id ─────────────────────────────────────────

router.get('/broadcasts/:id', requireAuth, requirePermission('outreach:logs:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT ob.*,
              cs.name AS segment_name
         FROM outreach_broadcasts ob
         LEFT JOIN contact_segments cs ON cs.id = ob.segment_id
        WHERE ob.id = $1 AND ob.org_id = $2`,
      [req.params.id, req.orgId]
    );

    if (!rows[0]) {
      clientError(res, 404, 'Broadcast not found');
      return;
    }

    const auditLog = await getBroadcastAudit(req.params.id, req.orgId!);
    res.json({ broadcast: rows[0], auditLog });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/outreach/broadcasts/:id/approve ─────────────────────────────────

router.post(
  '/broadcasts/:id/approve',
  requireAuth,
  requirePermission('outreach:approve'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const broadcast = await approveBroadcast(req.params.id, req.orgId!, req.userId!);
      logger.info({ broadcastId: req.params.id, approver: req.userId }, 'outreach:broadcast:approved');
      res.json({ broadcast });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('not found or not in pending_approval')) {
        clientError(res, 409, err.message);
        return;
      }
      serverError(res, err instanceof Error ? err : new Error(String(err)));
    }
  }
);

// ── POST /api/outreach/broadcasts/:id/reject ──────────────────────────────────

router.post(
  '/broadcasts/:id/reject',
  requireAuth,
  requirePermission('outreach:approve'),
  validate(rejectBroadcastSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { reason } = req.body as { reason: string };
      await rejectBroadcast(req.params.id, req.orgId!, req.userId!, reason);
      logger.info({ broadcastId: req.params.id, rejector: req.userId }, 'outreach:broadcast:rejected');
      res.json({ success: true });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('not in pending_approval')) {
        clientError(res, 409, err.message);
        return;
      }
      serverError(res, err instanceof Error ? err : new Error(String(err)));
    }
  }
);

// ── DELETE /api/outreach/broadcasts/:id ──────────────────────────────────────

router.delete(
  '/broadcasts/:id',
  requireAuth,
  requirePermission('outreach:broadcast'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { rows } = await query(
        `DELETE FROM outreach_broadcasts
         WHERE id = $1 AND org_id = $2 AND status = 'pending_approval'
         RETURNING id`,
        [req.params.id, req.orgId]
      );

      if (!rows[0]) {
        clientError(res, 409, 'Broadcast cannot be cancelled — it is not in pending_approval state, or does not exist');
        return;
      }

      logger.info({ broadcastId: req.params.id, actor: req.userId }, 'outreach:broadcast:cancelled');
      res.json({ success: true });
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)));
    }
  }
);

// ── POST /api/outreach/broadcasts/:id/send ────────────────────────────────────

router.post('/broadcasts/:id/send', requireAuth, requirePermission('outreach:broadcast'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const orgId = req.orgId!;
  const userId = req.userId!;

  try {
    // Atomic CAS: transition approved → sending in one query to prevent double-send race condition
    const { rows: casRows } = await query<Record<string, unknown>>(
      `UPDATE outreach_broadcasts
       SET status = 'sending', updated_at = NOW()
       WHERE id = $1 AND org_id = $2 AND status = 'approved'
       RETURNING *`,
      [id, orgId]
    );
    if (casRows.length === 0) {
      res.status(409).json({ error: 'Broadcast is not in approved state or already being sent' });
      return;
    }
    const broadcast = casRows[0];

    // Check expiry
    if (broadcast.expires_at && new Date(broadcast.expires_at as string) < new Date()) {
      // Roll back to approved — it was never really sent
      await query(
        `UPDATE outreach_broadcasts SET status = 'approved', updated_at = NOW() WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      clientError(res, 409, 'Broadcast has expired');
      return;
    }

    await query(
      `INSERT INTO broadcast_audit_log (broadcast_id, actor_user_id, action, note) VALUES ($1,$2,$3,$4)`,
      [id, userId, 'sent', null]
    );

    res.json({ success: true, status: 'sending', message: 'Broadcast is being sent' });

    // Async: resolve contacts and trigger Novu workflows
    setImmediate(async () => {
      try {
        const { triggerWorkflowBulk, upsertNovuSubscriber } = await import('../lib/novu/client');

        // Resolve subscribers from segment or contact_ids
        let subscribers: Array<{ subscriberId: string; email?: string; phone?: string }> = [];

        if (broadcast.segment_id) {
          const { rows: contacts } = await query<{ id: string; email?: string; phone?: string; display_name?: string }>(
            `SELECT c.id, c.email, c.phone, c.display_name
             FROM contacts c
             JOIN contact_segment_members csm ON csm.contact_id = c.id
             WHERE csm.segment_id = $1 AND c.org_id = $2 AND c.consent_given = TRUE AND c.anonymized_at IS NULL`,
            [broadcast.segment_id, orgId]
          );
          subscribers = contacts.map((c) => ({
            subscriberId: c.id,
            email: c.email ?? undefined,
            phone: c.phone ?? undefined,
          }));
          // Upsert subscribers in Novu (batch of 50)
          for (let i = 0; i < contacts.length; i += 50) {
            await Promise.allSettled(
              contacts.slice(i, i + 50).map((c) =>
                upsertNovuSubscriber(c.id, {
                  email: c.email,
                  phone: c.phone,
                  firstName: c.display_name?.split(' ')[0],
                })
              )
            );
          }
        } else if (broadcast.contact_ids) {
          const ids = (broadcast.contact_ids as string[]).filter(Boolean);
          if (ids.length) {
            const { rows: contacts } = await query<{ id: string; email?: string; phone?: string }>(
              `SELECT id, email, phone FROM contacts
               WHERE id = ANY($1::uuid[]) AND org_id = $2 AND consent_given = TRUE AND anonymized_at IS NULL`,
              [ids, orgId]
            );
            subscribers = contacts.map((c) => ({
              subscriberId: c.id,
              email: c.email ?? undefined,
              phone: c.phone ?? undefined,
            }));
          }
        }

        if (subscribers.length === 0) {
          await query(
            `UPDATE outreach_broadcasts SET status = 'failed', updated_at = NOW(),
             novu_job_id = $1 WHERE id = $2 AND org_id = $3`,
            ['no_eligible_contacts', id, orgId]
          );
          return;
        }

        // Trigger Novu workflow for all resolved subscribers
        await triggerWorkflowBulk(
          (broadcast.workflow_id as string) || 'transactional-outreach',
          subscribers,
          (broadcast.payload as Record<string, unknown>) || {}
        );

        // Update broadcast stats
        await query(
          `UPDATE outreach_broadcasts
           SET status = 'sent', sent_count = $1, sent_at = NOW(), updated_at = NOW()
           WHERE id = $2 AND org_id = $3`,
          [subscribers.length, id, orgId]
        );

        // Credit metering — broadcasts are pass-through (cost-plus). Best-effort: an
        // already-sent broadcast is never clawed back, so a debit shortfall is logged, not thrown.
        const channels = Array.isArray(broadcast.channels) ? (broadcast.channels as string[]) : [];
        for (const ch of channels) {
          if (ch !== 'email' && ch !== 'sms') continue; // in_app/push are bundled
          const unit = ch === 'email' ? CREDIT_COSTS.broadcast_email : CREDIT_COSTS.broadcast_sms;
          const total = unit * subscribers.length;
          if (total > 0) {
            await debitCredits(orgId, {
              actionType: ch === 'email' ? 'broadcast_email' : 'broadcast_sms',
              credits:    total,
              userId,
              actionRef:  id,
              note:       `Broadcast ${ch} ×${subscribers.length}`,
            }).catch((e: unknown) => logger.warn({ err: (e as Error).message, broadcastId: id }, 'broadcast:debit_failed'));
          }
        }

        logger.info({ broadcastId: id, recipientCount: subscribers.length }, 'broadcast:sent');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg, broadcastId: id }, 'broadcast:send:failed');
        await query(
          `UPDATE outreach_broadcasts SET status = 'failed', updated_at = NOW() WHERE id = $1 AND org_id = $2`,
          [id, orgId]
        ).catch(() => {});
        await query(
          `INSERT INTO broadcast_audit_log (broadcast_id, actor_user_id, action, note) VALUES ($1,$2,$3,$4)`,
          [id, 'system', 'failed', msg]
        ).catch(() => {});
      }
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
