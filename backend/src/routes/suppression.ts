/**
 * Suppression list routes.
 * Mount point: /api/outreach/suppression
 *
 * GET    /                — list suppressions (query: channel, reason, page, limit)
 * POST   /                — add suppression
 * DELETE /:id             — remove suppression (admin only)
 * POST   /check           — check if email/contactId is suppressed
 * GET    /stats           — counts by reason and channel
 * POST   /import          — bulk import email list
 */
import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { clientError, serverError } from '../lib/httpError';
import logger from '../lib/logger';
import {
  isSuppressed,
  addSuppression,
  removeSuppression,
  listSuppressions,
  type SuppressionReason,
} from '../lib/suppressionList';
import { query } from '../lib/db';

const router = express.Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CHANNELS = ['email', 'sms', 'push', 'in_app', 'slack', 'all'] as const;
const REASONS = ['unsubscribe', 'bounce', 'spam_complaint', 'gdpr_request', 'admin', 'invalid'] as const;

const addSuppressionSchema = z.object({
  email:     z.string().email().optional(),
  contactId: z.string().uuid().optional(),
  channel:   z.enum(CHANNELS).default('all'),
  reason:    z.enum(REASONS),
  notes:     z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
}).refine((d) => d.email || d.contactId, {
  message: 'Either email or contactId is required',
});

const checkSchema = z.object({
  email:     z.string().email().optional(),
  contactId: z.string().uuid().optional(),
  channel:   z.enum(CHANNELS),
}).refine((d) => d.email || d.contactId, {
  message: 'Either email or contactId is required',
});

const importSchema = z.object({
  emails:  z.array(z.string().email()).min(1).max(10_000),
  channel: z.enum(CHANNELS).default('email'),
  reason:  z.enum(REASONS),
});

// ── GET / — list suppressions ─────────────────────────────────────────────────
router.get(
  '/',
  requireAuth,
  requirePermission('outreach:logs:read'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page    = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1);
      const limit   = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      const channel = req.query.channel as string | undefined;
      const reason  = req.query.reason  as string | undefined;

      const result = await listSuppressions(req.orgId, { channel, reason, page, limit });
      res.json(result);
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /suppression' });
    }
  }
);

// ── POST / — add suppression ──────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requirePermission('outreach:suppress'),
  validate(addSuppressionSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, contactId, channel, reason, notes, expiresAt } = req.body as z.infer<typeof addSuppressionSchema>;

      await addSuppression(req.orgId, channel, reason as SuppressionReason, req.userId, {
        email,
        contactId,
        notes,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      logger.info({ orgId: req.orgId, channel, reason, email, contactId }, 'suppression:added');
      res.status(201).json({ ok: true });
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /suppression' });
    }
  }
);

// ── DELETE /:id — remove suppression ─────────────────────────────────────────
router.delete(
  '/:id',
  requireAuth,
  requirePermission('outreach:suppress'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      await removeSuppression(req.orgId, id);
      logger.info({ orgId: req.orgId, suppressionId: id }, 'suppression:removed');
      res.json({ ok: true });
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'DELETE /suppression/:id' });
    }
  }
);

// ── POST /check — check suppression status ────────────────────────────────────
router.post(
  '/check',
  requireAuth,
  requirePermission('outreach:logs:read'),
  validate(checkSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, contactId, channel } = req.body as z.infer<typeof checkSchema>;
      const suppressed = await isSuppressed(req.orgId, channel, { email, contactId });
      res.json({ suppressed });
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /suppression/check' });
    }
  }
);

// ── GET /stats — suppression counts by reason and channel ────────────────────
router.get(
  '/stats',
  requireAuth,
  requirePermission('outreach:logs:read'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [{ rows: byReason }, { rows: byChannel }, { rows: [{ total }] }] = await Promise.all([
        query<{ reason: string; count: string }>(
          `SELECT reason, COUNT(*) AS count FROM notification_suppressions WHERE org_id = $1 GROUP BY reason`,
          [req.orgId]
        ),
        query<{ channel: string; count: string }>(
          `SELECT channel, COUNT(*) AS count FROM notification_suppressions WHERE org_id = $1 GROUP BY channel`,
          [req.orgId]
        ),
        query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM notification_suppressions WHERE org_id = $1`,
          [req.orgId]
        ),
      ]);

      const byReasonMap: Record<string, number> = {};
      for (const r of byReason) { byReasonMap[r.reason] = parseInt(r.count, 10); }

      const byChannelMap: Record<string, number> = {};
      for (const r of byChannel) { byChannelMap[r.channel] = parseInt(r.count, 10); }

      res.json({ total: parseInt(total, 10), byReason: byReasonMap, byChannel: byChannelMap });
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /suppression/stats' });
    }
  }
);

// ── POST /import — bulk import email suppressions ─────────────────────────────
router.post(
  '/import',
  requireAuth,
  requirePermission('outreach:suppress'),
  validate(importSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { emails, channel, reason } = req.body as z.infer<typeof importSchema>;

      // Deduplicate
      const unique = [...new Set(emails.map((e: string) => e.toLowerCase()))];

      // Batch insert via unnest for efficiency
      await query(
        `INSERT INTO notification_suppressions (org_id, email, channel, reason, suppressed_by)
         SELECT $1, unnest($2::text[]), $3, $4, $5
         ON CONFLICT (org_id, email, channel) WHERE email IS NOT NULL
         DO UPDATE SET reason = EXCLUDED.reason`,
        [req.orgId, unique, channel, reason, req.userId]
      );

      logger.info({ orgId: req.orgId, count: unique.length, channel, reason }, 'suppression:bulk_import');
      res.status(201).json({ ok: true, imported: unique.length });
    } catch (err: unknown) {
      serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /suppression/import' });
    }
  }
);

export default router;
