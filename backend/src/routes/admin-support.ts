/**
 * Support Admin routes — pipeline review, editorial controls, analytics.
 * All routes require Clerk auth (enforced at mount point in index.js).
 *
 *   GET  /api/admin-support/queue       — docs needing attention
 *   GET  /api/admin-support/feed        — pipeline events since last admin session
 *   GET  /api/admin-support/docs/:id    — single doc with sections + event history
 *   POST /api/admin-support/approve     — approve doc → publishing → live
 *   POST /api/admin-support/reject      — reject doc + create gap entry
 *   PUT  /api/admin-support/sections    — edit / lock doc sections
 *   GET  /api/admin-support/gaps        — list unresolved doc gaps
 *   GET  /api/admin-support/stats       — pipeline statistics
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../lib/validate';
import { serverError } from '../lib/httpError';
import { query } from '../lib/db';
import {
  AdminApproveSchema,
  AdminRejectSchema,
  AdminEditSectionsSchema,
} from '../schemas/support';

const router = express.Router();

// ── GET /queue ────────────────────────────────────────────────────────────────
// Docs in pending_review, requires_annotation, or auto_approved with live countdown.
router.get('/queue', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, key, title, category, pipeline_status, quality_score,
              auto_approve_deadline, source_type, source_ref, created_at, updated_at
         FROM support_docs
        WHERE deleted_at IS NULL
          AND (
            pipeline_status IN ('pending_review', 'requires_annotation')
            OR (
              pipeline_status = 'auto_approved'
              AND auto_approve_deadline > NOW()
            )
          )
        ORDER BY quality_score ASC NULLS LAST, created_at ASC`
    );
    res.json({ queue: rows });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/admin-support/queue' });
  }
});

// ── GET /feed ─────────────────────────────────────────────────────────────────
// Returns pipeline events since this admin's last session, then updates last_seen_at.
router.get('/feed', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    const { rows: sessionRows } = await query<{ last_seen_at: string }>(
      `SELECT last_seen_at FROM support_admin_sessions WHERE user_id = $1`,
      [userId]
    );
    const previousLastSeen = sessionRows[0]?.last_seen_at ?? null;

    await query(
      `INSERT INTO support_admin_sessions (user_id, last_seen_at)
       VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_seen_at = NOW()`,
      [userId]
    );

    const since = previousLastSeen ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const { rows } = await query(
      `SELECT pe.id, pe.event_type, pe.actor_type, pe.actor_id, pe.metadata, pe.created_at,
              sd.id AS doc_id, sd.title AS doc_title, sd.key AS doc_key, sd.pipeline_status
         FROM support_pipeline_events pe
         JOIN support_docs sd ON sd.id = pe.doc_id
        WHERE pe.created_at > $1
        ORDER BY pe.created_at DESC
        LIMIT 100`,
      [since]
    );

    res.json({ events: rows, since });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/admin-support/feed', userId: req.userId });
  }
});

// ── GET /docs/:id ─────────────────────────────────────────────────────────────
// Full doc view: doc record + sections + event history.
router.get('/docs/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const docId = req.params.id;

    const [docResult, sectionsResult, eventsResult] = await Promise.all([
      query(
        `SELECT * FROM support_docs WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [docId]
      ),
      query(
        `SELECT id, section_key, content, human_locked, locked_by, locked_at, updated_at
           FROM support_doc_sections
          WHERE doc_id = $1
          ORDER BY section_key`,
        [docId]
      ),
      query(
        `SELECT id, event_type, actor_type, actor_id, metadata, created_at
           FROM support_pipeline_events
          WHERE doc_id = $1
          ORDER BY created_at DESC
          LIMIT 50`,
        [docId]
      ),
    ]);

    if (!docResult.rows[0]) {
      res.status(404).json({ error: 'Doc not found' });
      return;
    }

    res.json({ doc: docResult.rows[0], sections: sectionsResult.rows, events: eventsResult.rows });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/admin-support/docs/:id' });
  }
});

// ── POST /approve ─────────────────────────────────────────────────────────────
// Approve: set status=publishing, log admin_approved, immediately transition to live.
router.post('/approve', requireAuth, validate(AdminApproveSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { docId } = req.body as { docId: string };
    const userId    = req.userId;

    const { rows } = await query<{ id: string; key: string }>(
      `UPDATE support_docs
          SET pipeline_status = 'publishing',
              reviewed_by     = $2,
              reviewed_at     = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id, key`,
      [docId, userId]
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'Doc not found' });
      return;
    }

    await query(
      `INSERT INTO support_pipeline_events (doc_id, event_type, actor_type, actor_id)
       VALUES ($1, 'admin_approved', 'admin', $2)`,
      [docId, userId]
    );

    // Immediately transition to live
    await query(
      `UPDATE support_docs
          SET pipeline_status = 'live',
              published_at    = NOW()
        WHERE id = $1`,
      [docId]
    );
    await query(
      `INSERT INTO support_pipeline_events (doc_id, event_type, actor_type, actor_id)
       VALUES ($1, 'published', 'admin', $2)`,
      [docId, userId]
    );

    res.json({ approved: true, docId });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/admin-support/approve', userId: req.userId });
  }
});

// ── POST /reject ──────────────────────────────────────────────────────────────
// Reject: set status=rejected, log event, create a gap entry for re-generation.
router.post('/reject', requireAuth, validate(AdminRejectSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { docId, reason } = req.body as { docId: string; reason: string };
    const userId = req.userId;

    const { rows } = await query<{ id: string; key: string; org_id: string }>(
      `UPDATE support_docs
          SET pipeline_status = 'rejected',
              reviewed_by     = $2,
              reviewed_at     = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id, key, org_id`,
      [docId, userId]
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'Doc not found' });
      return;
    }

    const doc = rows[0];

    await query(
      `INSERT INTO support_pipeline_events
         (doc_id, event_type, actor_type, actor_id, metadata)
       VALUES ($1, 'admin_rejected', 'admin', $2, $3::jsonb)`,
      [docId, userId, JSON.stringify({ reason })]
    );

    await query(
      `INSERT INTO support_doc_gaps
         (org_id, user_id, doc_id, query, feedback_type, crystal_intent)
       VALUES ($1, $2, $3, $4, 'manual', 'admin_rejection')`,
      [doc.org_id, userId, docId, reason]
    );

    res.json({ rejected: true, docId });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /api/admin-support/reject', userId: req.userId });
  }
});

// ── PUT /sections ─────────────────────────────────────────────────────────────
// Upsert sections with optional locking; marks doc as human_edited.
router.put('/sections', requireAuth, validate(AdminEditSectionsSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { docId, sections } = req.body as {
      docId: string;
      sections: Array<{ sectionKey: string; content: string; lock: boolean }>;
    };
    const userId = req.userId;

    const { rows: docRows } = await query(
      `SELECT id FROM support_docs WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [docId]
    );
    if (!docRows[0]) {
      res.status(404).json({ error: 'Doc not found' });
      return;
    }

    for (const section of sections) {
      await query(
        `INSERT INTO support_doc_sections
           (doc_id, section_key, content, human_locked, locked_by, locked_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 THEN NOW() ELSE NULL END)
         ON CONFLICT (doc_id, section_key) DO UPDATE
           SET content      = EXCLUDED.content,
               human_locked = EXCLUDED.human_locked,
               locked_by    = CASE WHEN EXCLUDED.human_locked THEN EXCLUDED.locked_by ELSE support_doc_sections.locked_by END,
               locked_at    = CASE WHEN EXCLUDED.human_locked THEN NOW() ELSE support_doc_sections.locked_at END,
               updated_at   = NOW()`,
        [docId, section.sectionKey, section.content, section.lock, userId]
      );
    }

    await query(
      `UPDATE support_docs SET human_edited = TRUE, updated_at = NOW() WHERE id = $1`,
      [docId]
    );

    await query(
      `INSERT INTO support_pipeline_events
         (doc_id, event_type, actor_type, actor_id, metadata)
       VALUES ($1, 'admin_edited', 'admin', $2, $3::jsonb)`,
      [docId, userId, JSON.stringify({ sectionsEdited: sections.map((s) => s.sectionKey) })]
    );

    res.json({ updated: true, docId, sectionCount: sections.length });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'PUT /api/admin-support/sections', userId: req.userId });
  }
});

// ── GET /gaps ─────────────────────────────────────────────────────────────────
router.get('/gaps', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const page   = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT g.id, g.org_id, g.user_id, g.doc_id, g.query, g.feedback_type,
                g.crystal_intent, g.created_at,
                sd.key AS doc_key, sd.title AS doc_title
           FROM support_doc_gaps g
           LEFT JOIN support_docs sd ON sd.id = g.doc_id
          WHERE g.resolved_at IS NULL
          ORDER BY g.created_at DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM support_doc_gaps WHERE resolved_at IS NULL`
      ),
    ]);

    res.json({ gaps: rows, total: Number(countRows[0]?.total ?? 0), page, limit });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/admin-support/gaps' });
  }
});

// ── GET /stats ────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [statusResult, qualityResult, last24hResult, totalLiveResult, gapsResult] = await Promise.all([
      query<{ pipeline_status: string; count: string }>(
        `SELECT pipeline_status, COUNT(*)::text AS count
           FROM support_docs
          WHERE deleted_at IS NULL
          GROUP BY pipeline_status`
      ),
      query<{ avg_quality: string | null }>(
        `SELECT AVG(quality_score)::text AS avg_quality
           FROM support_docs
          WHERE deleted_at IS NULL AND quality_score IS NOT NULL`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM support_docs
          WHERE pipeline_status = 'live'
            AND published_at >= NOW() - INTERVAL '24 hours'`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM support_docs
          WHERE pipeline_status = 'live' AND deleted_at IS NULL`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM support_doc_gaps
          WHERE resolved_at IS NULL`
      ),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusResult.rows) {
      byStatus[row.pipeline_status] = Number(row.count);
    }

    const avgQualityRaw = qualityResult.rows[0]?.avg_quality;

    res.json({
      byStatus,
      avgQualityScore:  avgQualityRaw != null ? Number(avgQualityRaw) : null,
      last24hPublished: Number(last24hResult.rows[0]?.count ?? 0),
      totalLive:        Number(totalLiveResult.rows[0]?.count ?? 0),
      totalGaps:        Number(gapsResult.rows[0]?.count ?? 0),
    });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /api/admin-support/stats' });
  }
});

export default router;
