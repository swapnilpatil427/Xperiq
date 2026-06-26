# Experient Docs Admin Pipeline — Implementation Guide

**Status:** Ready for implementation  
**Owner:** Engineering  
**Companion to:** [ARCHITECTURE.md](../ARCHITECTURE.md)  
**Route:** `/app/admin/support/pipeline`

---

## Overview

The Docs Admin Pipeline is a dedicated admin section at `/app/admin/support/pipeline`
that lets admins review, approve, reject, and inline-edit Crystal-generated support docs
before they go live. It sits on top of the existing support system (see
`docs/support/ARCHITECTURE.md`) and follows the same closed-loop pattern as the rest
of the platform: Crystal proposes, the admin confirms, the backend persists.

### Architecture Fit

```
CI push
  └─▶ /api/internal/support/refresh-doc (X-Internal-Key)
        └─▶ CrystalOS doc-writer skill → quality eval
              └─▶ support_docs row (pipeline_status = 'pending_review')
                    └─▶ Novu: doc_review_requested → admin inbox
                          └─▶ Admin reviews at /app/admin/support/pipeline
                                └─▶ Approve / Reject / Edit
                                      └─▶ pipelineStateMachine transition
                                            └─▶ /api/support/docs/:key live
```

---

## 1. Database Extensions

Add to the existing `supabase/migrations/` directory as a new versioned migration
file (e.g. `20260625_admin_pipeline.sql`).

### 1a. New Columns on `support_docs`

```sql
ALTER TABLE support_docs
  ADD COLUMN pipeline_status TEXT NOT NULL DEFAULT 'live',
  ADD COLUMN reviewed_by TEXT,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_notes TEXT,
  ADD COLUMN rejection_reason TEXT,
  ADD COLUMN human_edited BOOLEAN DEFAULT false,
  ADD COLUMN auto_approve_deadline TIMESTAMPTZ,
  ADD COLUMN notify_subscribers BOOLEAN DEFAULT false;

-- Constrain to known states
ALTER TABLE support_docs
  ADD CONSTRAINT support_docs_pipeline_status_check
  CHECK (pipeline_status IN (
    'queued', 'extracting', 'drafting', 'quality_check',
    'pending_review', 'requires_annotation',
    'auto_approved', 'approved', 'rejected',
    'publishing', 'live', 'stale'
  ));

-- Index for the queue query (pending_review + auto-approve sweep)
CREATE INDEX idx_support_docs_pipeline_status ON support_docs(pipeline_status);
CREATE INDEX idx_support_docs_auto_approve    ON support_docs(auto_approve_deadline)
  WHERE pipeline_status = 'pending_review';
```

### 1b. New Table: `support_doc_sections`

Section-level edit locks survive Crystal regeneration. When `human_locked = true`,
the pipeline state machine refuses to overwrite that section even on a new draft.

```sql
CREATE TABLE support_doc_sections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id           UUID NOT NULL REFERENCES support_docs(id) ON DELETE CASCADE,
  section_key      TEXT NOT NULL,   -- 'params-table' | 'overview' | 'code-examples' | etc.
  section_content  TEXT NOT NULL,
  human_locked     BOOLEAN NOT NULL DEFAULT false,
  locked_by        TEXT,            -- Clerk user_id
  locked_at        TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doc_id, section_key)
);

CREATE INDEX idx_doc_sections_doc_id ON support_doc_sections(doc_id);
```

### 1c. New Table: `support_pipeline_events`

Full audit trail for every state transition and notable action.

```sql
CREATE TABLE support_pipeline_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       UUID NOT NULL REFERENCES support_docs(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,   -- 'queued' | 'drafted' | 'quality_checked' | 'approved' |
                                --  'rejected' | 'published' | 'stale' | 'section_locked'
  triggered_by TEXT NOT NULL,   -- 'ci' | 'crystal' | 'admin:<user_id>' | 'timeout'
  metadata     JSONB,           -- free-form payload: quality_score, rejection_reason, etc.
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipeline_events_doc_id    ON support_pipeline_events(doc_id);
CREATE INDEX idx_pipeline_events_created   ON support_pipeline_events(created_at DESC);
```

### 1d. New Table: `support_admin_sessions`

Tracks each admin's last visit so the activity feed can show "new since last login".

```sql
CREATE TABLE support_admin_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
```

---

## 2. Backend Routes

Create `backend/src/routes/admin-support.ts`. Register it in `backend/src/index.ts`
as `/api/admin/support` **after** the existing `/api/admin` proxy mount, gated by
`requireAuth` and `requireRole('admin')`.

```typescript
/**
 * Admin Support Pipeline routes
 * All routes: requireAuth + requireRole('admin')
 * Mount: /api/admin/support
 */
import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { query } from '../lib/db';
import { serverError } from '../lib/httpError';
import { transitionPipeline } from '../lib/pipelineStateMachine';
import { triggerWorkflow } from '../lib/novu/client';
import logger from '../lib/logger';

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('admin'));

// ── Schemas ──────────────────────────────────────────────────────────────────

const ApproveSchema = z.object({
  note: z.string().max(2000).optional(),
  notify_subscribers: z.boolean().default(false),
});

const RejectSchema = z.object({
  reason: z.string().min(10).max(2000),
  create_gap: z.boolean().default(true),
});

const EditSchema = z.object({
  body_markdown: z.string().min(1),
  section_key: z.string().optional(),   // if present, also upserts support_doc_sections
  lock_section: z.boolean().default(false),
});

const LockSectionSchema = z.object({
  section_key: z.string().min(1),
  section_content: z.string().min(1),
  lock: z.boolean().default(true),
});

const PipelineQuerySchema = z.object({
  status: z.string().optional(),
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(25),
});

// ── Route: GET /api/admin/support/pipeline ────────────────────────────────
// Queue of docs in review-relevant states + recent activity feed

router.get('/pipeline', async (req: Request, res: Response) => {
  try {
    const { status, page, limit } = PipelineQuerySchema.parse(req.query);
    const offset = (page - 1) * limit;

    const statusFilter = status
      ? "AND sd.pipeline_status = $3"
      : "AND sd.pipeline_status IN ('pending_review','requires_annotation','rejected')";

    const params: unknown[] = status
      ? [req.orgId, limit, status, offset]
      : [req.orgId, limit, offset];

    const offsetIdx = status ? '$4' : '$3';

    const { rows: queue } = await query(`
      SELECT sd.id, sd.doc_key, sd.title, sd.category, sd.pipeline_status,
             sd.quality_score, sd.crystal_draft, sd.human_edited,
             sd.auto_approve_deadline, sd.updated_at, sd.reviewed_by,
             sd.rejection_reason,
             COUNT(*) OVER() AS total_count
      FROM support_docs sd
      WHERE (sd.org_id IS NULL OR sd.org_id = $1)
        ${statusFilter}
      ORDER BY sd.updated_at DESC
      LIMIT $2 OFFSET ${offsetIdx}
    `, params);

    // Recent activity feed (last 50 pipeline events, any status)
    const { rows: activity } = await query(`
      SELECT spe.id, spe.doc_id, spe.event_type, spe.triggered_by,
             spe.metadata, spe.created_at, sd.title, sd.doc_key
      FROM support_pipeline_events spe
      JOIN support_docs sd ON sd.id = spe.doc_id
      WHERE sd.org_id IS NULL OR sd.org_id = $1
      ORDER BY spe.created_at DESC
      LIMIT 50
    `, [req.orgId]);

    // Bump admin last_seen_at
    await query(`
      INSERT INTO support_admin_sessions (user_id, last_seen_at)
      VALUES ($1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET last_seen_at = NOW()
    `, [req.userId]);

    const total = Number(queue[0]?.total_count ?? 0);
    res.json({
      queue: queue.map(r => ({ ...r, total_count: undefined })),
      activity,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Route: GET /api/admin/support/pipeline/doc/:id ────────────────────────
// Single doc with live vs draft diff payload + quality breakdown

router.get('/pipeline/doc/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await query(`
      SELECT sd.*,
        (
          SELECT json_agg(sds ORDER BY sds.section_key)
          FROM support_doc_sections sds WHERE sds.doc_id = sd.id
        ) AS sections,
        (
          SELECT json_agg(spe ORDER BY spe.created_at DESC)
          FROM support_pipeline_events spe WHERE spe.doc_id = sd.id
        ) AS events
      FROM support_docs sd
      WHERE sd.id = $1
        AND (sd.org_id IS NULL OR sd.org_id = $2)
    `, [id, req.orgId]);

    if (!rows.length) {
      res.status(404).json({ error: 'Doc not found' });
      return;
    }

    const doc = rows[0];

    // Fetch the current live version of the same doc_key for diffing
    const { rows: liveRows } = await query(`
      SELECT body_markdown, updated_at
      FROM support_docs
      WHERE doc_key = $1
        AND pipeline_status = 'live'
        AND (org_id IS NULL OR org_id = $2)
      ORDER BY updated_at DESC
      LIMIT 1
    `, [doc.doc_key, req.orgId]);

    res.json({ doc, live_doc: liveRows[0] ?? null });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Route: POST /api/admin/support/pipeline/doc/:id/approve ──────────────

router.post('/pipeline/doc/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = ApproveSchema.parse(req.body);

    const { rows } = await query(
      'SELECT * FROM support_docs WHERE id = $1 AND (org_id IS NULL OR org_id = $2)',
      [id, req.orgId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Doc not found' }); return; }

    const doc = rows[0];
    const { newStatus, sideEffects } = transitionPipeline(doc, 'admin_approved', `admin:${req.userId}`);

    await query(`
      UPDATE support_docs
      SET pipeline_status = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          review_notes = $3,
          notify_subscribers = $4,
          updated_at = NOW()
      WHERE id = $5
    `, [newStatus, req.userId, body.note ?? null, body.notify_subscribers, id]);

    await query(`
      INSERT INTO support_pipeline_events (doc_id, event_type, triggered_by, metadata)
      VALUES ($1, 'approved', $2, $3)
    `, [id, `admin:${req.userId}`, JSON.stringify({ note: body.note })]);

    if (sideEffects.includes('notify')) {
      await triggerWorkflow('doc_review_completed', {
        to: { subscriberId: req.userId },
        payload: { doc_key: doc.doc_key, title: doc.title, action: 'approved' },
      });
    }

    logger.info({ docId: id, userId: req.userId }, 'pipeline:approved');
    res.json({ ok: true, newStatus });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Route: POST /api/admin/support/pipeline/doc/:id/reject ───────────────

router.post('/pipeline/doc/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = RejectSchema.parse(req.body);

    const { rows } = await query(
      'SELECT * FROM support_docs WHERE id = $1 AND (org_id IS NULL OR org_id = $2)',
      [id, req.orgId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Doc not found' }); return; }

    const doc = rows[0];
    const { newStatus } = transitionPipeline(doc, 'admin_rejected', `admin:${req.userId}`);

    await query(`
      UPDATE support_docs
      SET pipeline_status = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          rejection_reason = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [newStatus, req.userId, body.reason, id]);

    await query(`
      INSERT INTO support_pipeline_events (doc_id, event_type, triggered_by, metadata)
      VALUES ($1, 'rejected', $2, $3)
    `, [id, `admin:${req.userId}`, JSON.stringify({ reason: body.reason })]);

    if (body.create_gap) {
      await query(`
        INSERT INTO support_doc_gaps
          (query_text, gap_category, suggested_doc_key, suggested_title, auto_created)
        VALUES ($1, 'unclear-doc', $2, $3, true)
      `, [body.reason, doc.doc_key, doc.title]);
    }

    logger.info({ docId: id, userId: req.userId }, 'pipeline:rejected');
    res.json({ ok: true, newStatus });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Route: PATCH /api/admin/support/pipeline/doc/:id ─────────────────────
// Inline edit — sets human_edited = true; optionally locks a section

router.patch('/pipeline/doc/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = EditSchema.parse(req.body);

    await query(`
      UPDATE support_docs
      SET body_markdown = $1,
          human_edited = true,
          updated_at = NOW()
      WHERE id = $2
        AND (org_id IS NULL OR org_id = $3)
    `, [body.body_markdown, id, req.orgId]);

    if (body.section_key) {
      await query(`
        INSERT INTO support_doc_sections
          (doc_id, section_key, section_content, human_locked, locked_by, locked_at)
        VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 THEN NOW() ELSE NULL END)
        ON CONFLICT (doc_id, section_key) DO UPDATE
          SET section_content = EXCLUDED.section_content,
              human_locked    = EXCLUDED.human_locked,
              locked_by       = CASE WHEN EXCLUDED.human_locked THEN EXCLUDED.locked_by ELSE NULL END,
              locked_at       = CASE WHEN EXCLUDED.human_locked THEN NOW() ELSE NULL END,
              updated_at      = NOW()
      `, [id, body.section_key, body.body_markdown, body.lock_section, req.userId]);
    }

    await query(`
      INSERT INTO support_pipeline_events (doc_id, event_type, triggered_by, metadata)
      VALUES ($1, 'edited', $2, $3)
    `, [id, `admin:${req.userId}`, JSON.stringify({ section_key: body.section_key })]);

    res.json({ ok: true });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Route: POST /api/admin/support/pipeline/doc/:id/lock-section ─────────

router.post('/pipeline/doc/:id/lock-section', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = LockSectionSchema.parse(req.body);

    await query(`
      INSERT INTO support_doc_sections
        (doc_id, section_key, section_content, human_locked, locked_by, locked_at)
      VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 THEN NOW() ELSE NULL END)
      ON CONFLICT (doc_id, section_key) DO UPDATE
        SET human_locked = EXCLUDED.human_locked,
            locked_by    = CASE WHEN EXCLUDED.human_locked THEN EXCLUDED.locked_by ELSE NULL END,
            locked_at    = CASE WHEN EXCLUDED.human_locked THEN NOW() ELSE NULL END,
            updated_at   = NOW()
    `, [id, body.section_key, body.section_content, body.lock, req.userId]);

    await query(`
      INSERT INTO support_pipeline_events (doc_id, event_type, triggered_by, metadata)
      VALUES ($1, 'section_locked', $2, $3)
    `, [id, `admin:${req.userId}`, JSON.stringify({ section_key: body.section_key, lock: body.lock })]);

    res.json({ ok: true, locked: body.lock });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Route: GET /api/admin/support/pipeline/stats ─────────────────────────

router.get('/pipeline/stats', async (req: Request, res: Response) => {
  try {
    const { rows: byStatus } = await query(`
      SELECT pipeline_status, COUNT(*) AS count
      FROM support_docs
      WHERE org_id IS NULL OR org_id = $1
      GROUP BY pipeline_status
    `, [req.orgId]);

    const { rows: throughput } = await query(`
      SELECT DATE_TRUNC('day', created_at) AS day,
             event_type,
             COUNT(*) AS count
      FROM support_pipeline_events spe
      JOIN support_docs sd ON sd.id = spe.doc_id
      WHERE (sd.org_id IS NULL OR sd.org_id = $1)
        AND spe.created_at > NOW() - INTERVAL '30 days'
        AND spe.event_type IN ('approved','rejected','published')
      GROUP BY 1, 2
      ORDER BY 1
    `, [req.orgId]);

    const { rows: avgQuality } = await query(`
      SELECT ROUND(AVG(quality_score)::numeric, 3) AS avg_quality_score,
             COUNT(*) FILTER (WHERE quality_score >= 0.8) AS high_quality,
             COUNT(*) FILTER (WHERE quality_score < 0.6) AS low_quality
      FROM support_docs
      WHERE (org_id IS NULL OR org_id = $1)
        AND quality_score IS NOT NULL
    `, [req.orgId]);

    res.json({ byStatus, throughput, quality: avgQuality[0] });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Route: GET /api/admin/support/pipeline/gaps ──────────────────────────

router.get('/pipeline/gaps', async (req: Request, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT sdg.*, st.title AS ticket_title, st.category AS ticket_category
      FROM support_doc_gaps sdg
      LEFT JOIN support_tickets st ON st.id = sdg.ticket_id
      WHERE sdg.status = 'open'
      ORDER BY sdg.created_at DESC
      LIMIT 100
    `);
    res.json({ gaps: rows });
  } catch (err) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
```

Register in `backend/src/index.ts` (add after the existing `/api/admin` mount):

```typescript
import adminSupportRouter from './routes/admin-support';
// ...
app.use('/api/admin/support', adminSupportRouter);
```

---

## 3. Pipeline State Machine

Create `backend/src/lib/pipelineStateMachine.ts`.

```typescript
/**
 * Pure state machine for the support doc pipeline.
 * No I/O — all side effects are declared; callers execute them.
 */

export type PipelineStatus =
  | 'queued' | 'extracting' | 'drafting' | 'quality_check'
  | 'pending_review' | 'requires_annotation'
  | 'auto_approved' | 'approved' | 'rejected'
  | 'publishing' | 'live' | 'stale';

export type PipelineEvent =
  | 'ci_queued'
  | 'extraction_complete'
  | 'draft_ready'
  | 'eval_complete'
  | 'admin_approved'
  | 'admin_rejected'
  | 'timeout_expired'
  | 'publish_complete'
  | 'source_changed';

export type SideEffect =
  | 'emit_notification'
  | 'create_audit_event'
  | 'trigger_publish'
  | 'create_gap'
  | 'set_auto_approve_deadline'
  | 'clear_auto_approve_deadline';

export interface TransitionResult {
  newStatus: PipelineStatus;
  sideEffects: SideEffect[];
  /** Human-readable description of why this transition fired */
  reason: string;
}

/** Minimal doc shape the state machine needs */
interface PipelineDoc {
  pipeline_status: PipelineStatus;
  quality_score?: number | null;
  crystal_draft?: boolean;
}

// Transition table: [from, event] -> TransitionResult
type TransitionKey = `${PipelineStatus}:${PipelineEvent}`;

const TRANSITIONS: Record<TransitionKey, (doc: PipelineDoc) => TransitionResult> = {
  'queued:extraction_complete': () => ({
    newStatus: 'extracting',
    sideEffects: ['create_audit_event'],
    reason: 'Artifact extraction completed',
  }),
  'extracting:draft_ready': () => ({
    newStatus: 'drafting',
    sideEffects: ['create_audit_event'],
    reason: 'Crystal draft generated',
  }),
  'drafting:eval_complete': (doc) => {
    const score = doc.quality_score ?? 0;
    if (score >= 0.85) {
      return {
        newStatus: 'pending_review',
        sideEffects: ['emit_notification', 'set_auto_approve_deadline', 'create_audit_event'],
        reason: `Quality score ${score} passed threshold — queued for review with optimistic window`,
      };
    }
    return {
      newStatus: 'requires_annotation',
      sideEffects: ['emit_notification', 'create_audit_event'],
      reason: `Quality score ${score} below threshold — requires human annotation`,
    };
  },
  'quality_check:eval_complete': (doc) => {
    const score = doc.quality_score ?? 0;
    if (score >= 0.85) {
      return {
        newStatus: 'pending_review',
        sideEffects: ['emit_notification', 'set_auto_approve_deadline', 'create_audit_event'],
        reason: 'Re-eval passed threshold',
      };
    }
    return {
      newStatus: 'requires_annotation',
      sideEffects: ['emit_notification', 'create_audit_event'],
      reason: 'Re-eval still below threshold',
    };
  },
  'requires_annotation:eval_complete': (doc) => {
    const score = doc.quality_score ?? 0;
    if (score >= 0.85) {
      return {
        newStatus: 'pending_review',
        sideEffects: ['emit_notification', 'set_auto_approve_deadline', 'create_audit_event'],
        reason: 'Annotation improved score to passing',
      };
    }
    return {
      newStatus: 'requires_annotation',
      sideEffects: ['create_audit_event'],
      reason: 'Still below threshold after annotation',
    };
  },
  'pending_review:admin_approved': () => ({
    newStatus: 'publishing',
    sideEffects: ['trigger_publish', 'clear_auto_approve_deadline', 'create_audit_event'],
    reason: 'Admin approved',
  }),
  'pending_review:admin_rejected': () => ({
    newStatus: 'rejected',
    sideEffects: ['create_gap', 'clear_auto_approve_deadline', 'create_audit_event'],
    reason: 'Admin rejected',
  }),
  'pending_review:timeout_expired': () => ({
    newStatus: 'auto_approved',
    sideEffects: ['trigger_publish', 'emit_notification', 'create_audit_event'],
    reason: 'Optimistic 2h window expired — auto-approved',
  }),
  'auto_approved:publish_complete': () => ({
    newStatus: 'live',
    sideEffects: ['emit_notification', 'create_audit_event'],
    reason: 'Published after auto-approval',
  }),
  'publishing:publish_complete': () => ({
    newStatus: 'live',
    sideEffects: ['emit_notification', 'create_audit_event'],
    reason: 'Published successfully',
  }),
  'live:source_changed': () => ({
    newStatus: 'queued',
    sideEffects: ['create_audit_event'],
    reason: 'Source file changed — re-queued for new draft',
  }),
  'live:ci_queued': () => ({
    newStatus: 'queued',
    sideEffects: ['create_audit_event'],
    reason: 'CI triggered a re-generation',
  }),
  'rejected:ci_queued': () => ({
    newStatus: 'queued',
    sideEffects: ['create_audit_event'],
    reason: 'CI re-queued previously rejected doc',
  }),
  'stale:ci_queued': () => ({
    newStatus: 'queued',
    sideEffects: ['create_audit_event'],
    reason: 'Stale doc re-queued by CI',
  }),
  // Any live doc can go stale when source changes fail validation
  'live:eval_complete': (doc) => {
    if ((doc.quality_score ?? 1) < 0.4) {
      return {
        newStatus: 'stale',
        sideEffects: ['create_audit_event'],
        reason: 'Re-eval score dropped below stale threshold — flagged',
      };
    }
    return {
      newStatus: 'live',
      sideEffects: [],
      reason: 'Re-eval score acceptable — doc remains live',
    };
  },
};

/**
 * transitionPipeline — pure function, no side effects executed here.
 *
 * @param doc     The current doc (only pipeline_status + quality_score needed)
 * @param event   The event being applied
 * @param actor   Who triggered this: 'ci' | 'crystal' | 'admin:<user_id>' | 'timeout'
 * @returns TransitionResult with new status + declared side effects
 * @throws Error on invalid transitions
 */
export function transitionPipeline(
  doc: PipelineDoc,
  event: PipelineEvent,
  actor: string,
): TransitionResult {
  const key: TransitionKey = `${doc.pipeline_status}:${event}`;
  const handler = TRANSITIONS[key];

  if (!handler) {
    throw new Error(
      `Invalid pipeline transition: status="${doc.pipeline_status}" event="${event}" actor="${actor}"`,
    );
  }

  return handler(doc);
}
```

### Testing the State Machine

Unit tests go in `backend/src/__tests__/pipelineStateMachine.test.js`:

```javascript
const { transitionPipeline } = require('../lib/pipelineStateMachine');

describe('transitionPipeline', () => {
  it('queues for review when eval passes threshold', () => {
    const result = transitionPipeline(
      { pipeline_status: 'drafting', quality_score: 0.92 },
      'eval_complete',
      'crystal',
    );
    expect(result.newStatus).toBe('pending_review');
    expect(result.sideEffects).toContain('set_auto_approve_deadline');
    expect(result.sideEffects).toContain('emit_notification');
  });

  it('requires annotation when eval fails threshold', () => {
    const result = transitionPipeline(
      { pipeline_status: 'drafting', quality_score: 0.55 },
      'eval_complete',
      'crystal',
    );
    expect(result.newStatus).toBe('requires_annotation');
  });

  it('auto-approves on timeout', () => {
    const result = transitionPipeline(
      { pipeline_status: 'pending_review', quality_score: 0.88 },
      'timeout_expired',
      'timeout',
    );
    expect(result.newStatus).toBe('auto_approved');
    expect(result.sideEffects).toContain('trigger_publish');
  });

  it('throws on invalid transition', () => {
    expect(() =>
      transitionPipeline({ pipeline_status: 'live' }, 'admin_approved', 'admin:u1')
    ).toThrow('Invalid pipeline transition');
  });

  it('creates gap on reject', () => {
    const result = transitionPipeline(
      { pipeline_status: 'pending_review' },
      'admin_rejected',
      'admin:u1',
    );
    expect(result.newStatus).toBe('rejected');
    expect(result.sideEffects).toContain('create_gap');
  });
});
```

---

## 4. Auto-Approve Worker

Create `backend/src/scheduler/jobs/docAutoApprove.ts` and register it in
`backend/src/scheduler/registry.ts`.

```typescript
/**
 * docAutoApprove — scheduled every 5 minutes.
 * Docs in pending_review past their auto_approve_deadline transition to
 * auto_approved, fire publish, and send an admin notification.
 */
import { query } from '../../lib/db';
import { transitionPipeline } from '../../lib/pipelineStateMachine';
import { triggerWorkflow } from '../../lib/novu/client';
import type { JobResult } from '../registry';
import logger from '../../lib/logger';

const REFRESH_DOC_URL = process.env.INTERNAL_API_URL
  ? `${process.env.INTERNAL_API_URL}/api/internal/support/refresh-doc`
  : 'http://localhost:3001/api/internal/support/refresh-doc';

const INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY ?? 'dev-internal-key-change-in-prod';

export async function docAutoApprove(): Promise<JobResult> {
  const { rows: expiredDocs } = await query<{
    id: string;
    doc_key: string;
    title: string;
    quality_score: number;
    pipeline_status: string;
  }>(`
    SELECT id, doc_key, title, quality_score, pipeline_status
    FROM support_docs
    WHERE pipeline_status = 'pending_review'
      AND auto_approve_deadline < NOW()
    FOR UPDATE SKIP LOCKED
    LIMIT 50
  `);

  if (!expiredDocs.length) return { affected: 0, note: 'No expired docs' };

  let affected = 0;
  const approvedTitles: string[] = [];

  for (const doc of expiredDocs) {
    try {
      const { newStatus } = transitionPipeline(
        { pipeline_status: doc.pipeline_status as never, quality_score: doc.quality_score },
        'timeout_expired',
        'timeout',
      );

      await query(`
        UPDATE support_docs
        SET pipeline_status = $1,
            reviewed_by = 'system:timeout',
            reviewed_at = NOW(),
            auto_approve_deadline = NULL,
            updated_at = NOW()
        WHERE id = $2
      `, [newStatus, doc.id]);

      await query(`
        INSERT INTO support_pipeline_events (doc_id, event_type, triggered_by, metadata)
        VALUES ($1, 'auto_approved', 'timeout', $2)
      `, [doc.id, JSON.stringify({ reason: 'optimistic_timeout' })]);

      // Trigger publish via the internal refresh-doc endpoint
      await fetch(REFRESH_DOC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': INTERNAL_KEY,
        },
        body: JSON.stringify({ doc_id: doc.id, action: 'publish' }),
      });

      approvedTitles.push(doc.title);
      affected++;
    } catch (err) {
      logger.error({ err, docId: doc.id }, 'docAutoApprove:transition_failed');
    }
  }

  // Send a single batched Novu notification to all admins
  if (approvedTitles.length) {
    await triggerWorkflow('doc_auto_approved', {
      to: { subscriberId: 'admin-broadcast' },
      payload: {
        count: approvedTitles.length,
        titles: approvedTitles.slice(0, 5),    // first 5 for preview
        total: approvedTitles.length,
      },
    }).catch(err =>
      logger.warn({ err }, 'docAutoApprove:novu_notify_failed'),
    );
  }

  logger.info({ affected }, 'docAutoApprove:complete');
  return { affected, note: `Auto-approved: ${approvedTitles.join(', ')}` };
}
```

Register in `backend/src/scheduler/registry.ts`:

```typescript
import { docAutoApprove } from './jobs/docAutoApprove';

// Add to JOBS array:
{
  name: 'doc-auto-approve',
  description: 'Auto-approve support docs past their optimistic review deadline.',
  intervalSec: intSec('JOB_DOC_AUTO_APPROVE_SEC', 300),   // 5 min
  enabled: flag('JOB_DOC_AUTO_APPROVE', true),
  handler: docAutoApprove,
},
```

Also add `doc-auto-approve` to `docs/infrastructure/scheduled-jobs.md` per the
scheduler CLAUDE.md convention.

---

## 5. React Pages and Components

### Routes to Add in `app/src/constants/routes.ts`

```typescript
// Admin — Support Pipeline (add after ADMIN_CRYSTAL_DLQ)
ADMIN_DOC_PIPELINE:       '/app/admin/support/pipeline',
ADMIN_DOC_REVIEW:         '/app/admin/support/pipeline/:docId',
ADMIN_DOC_EDITOR:         '/app/admin/support/pipeline/:docId/edit',
ADMIN_DOC_GAPS:           '/app/admin/support/gaps',
ADMIN_PIPELINE_STATS:     '/app/admin/support/stats',
```

### Pages

#### `app/src/pages/admin/DocPipelinePage.tsx`

Main dashboard. Shows queue by status, KPI summary row, activity feed sidebar.

```typescript
interface DocPipelinePageProps {}

// Key state:
// queue: PipelineDocSummary[]
// activity: PipelineEvent[]
// stats: PipelineStats
// Uses useSetPageTitle, PageHeader, PipelineQueueRow, PipelineEventFeed
```

#### `app/src/pages/admin/DocReviewPage.tsx`

Single-doc review. Loads doc + live version, renders `DocDiffViewer`,
`QualityScoreBreakdown`, approve/reject action buttons. On mobile: bottom drawer
with swipe-right = approve, swipe-left = reject.

```typescript
interface DocReviewPageProps {}
// Route param: docId from useParams()
// Key state: doc, liveDoc, isApproving, isRejecting, rejectReason
```

#### `app/src/pages/admin/DocEditorPage.tsx`

Inline editor. Loads doc, renders a `<textarea>` (or markdown-aware editor),
section lock toggles, save button. On save: `PATCH /api/admin/support/pipeline/doc/:id`.

```typescript
interface DocEditorPageProps {}
// Route param: docId from useParams()
// Key state: draftMarkdown, lockedSections, isSaving, isDirty
```

#### `app/src/pages/admin/DocGapsPage.tsx`

Gap queue. Shows `DocGapCard` for each open gap, filter by category, assign/close actions.

```typescript
interface DocGapsPageProps {}
// Key state: gaps: DocGap[], filter: string
```

#### `app/src/pages/admin/PipelineStatsPage.tsx`

Analytics. KPI cards + throughput chart (Recharts LineChart) + quality histogram.

```typescript
interface PipelineStatsPageProps {}
// Key state: stats: PipelineStatsData (from GET /api/admin/support/pipeline/stats)
```

### Components and Props Interfaces

#### `app/src/components/admin/PipelineQueueRow.tsx`

```typescript
interface PipelineQueueRowProps {
  doc: {
    id: string;
    doc_key: string;
    title: string;
    category: string;
    pipeline_status: PipelineStatus;
    quality_score: number | null;
    crystal_draft: boolean;
    human_edited: boolean;
    auto_approve_deadline: string | null;   // ISO timestamp
    updated_at: string;
  };
  onApprove: (docId: string) => void;
  onReject: (docId: string) => void;
  onView: (docId: string) => void;
}
```

Renders: status badge, quality score chip, doc title, time-to-auto-approve countdown
(when deadline is set), three action buttons.

#### `app/src/components/admin/DocDiffViewer.tsx`

```typescript
interface DiffSection {
  key: string;
  title: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  humanLocked: boolean;
  diffHunks: Array<{
    type: 'add' | 'remove' | 'context';
    lines: string[];
  }>;
}

interface DocDiffViewerProps {
  sections: DiffSection[];
  onLockSection: (sectionKey: string, content: string) => Promise<void>;
  readOnly?: boolean;
}
```

Renders each section with a collapse toggle, lock icon for `humanLocked` sections,
and inline diff highlighting (green for additions, red for removals, using
`bg-green-50` / `bg-red-50` Tailwind classes on diff lines).

#### `app/src/components/admin/QualityScoreBreakdown.tsx`

```typescript
interface QualityDimension {
  name: string;              // e.g. 'Completeness', 'Accuracy', 'Clarity', 'Examples'
  score: number;             // 0.0 – 1.0
  weight: number;            // contribution to final score
  feedback: string;          // from crystal-eval
}

interface QualityScoreBreakdownProps {
  overallScore: number;
  dimensions: QualityDimension[];
  crystalDraft: boolean;
}
```

Renders: circular score indicator (large, colored by tier: ≥0.85 emerald / 0.6–0.84
amber / <0.6 red), dimension breakdown as horizontal progress bars, crystal-draft badge.

#### `app/src/components/admin/PipelineEventFeed.tsx`

```typescript
interface PipelineEventItem {
  id: string;
  doc_id: string;
  event_type: string;
  triggered_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
  title: string;          // joined from support_docs
  doc_key: string;
}

interface PipelineEventFeedProps {
  events: PipelineEventItem[];
  lastSeenAt: string | null;   // ISO timestamp — events after this get a "new" badge
  maxItems?: number;
}
```

Renders: timeline with icon per event type, "new" badge for events since last admin
login, relative timestamps, links to the doc review page.

#### `app/src/components/admin/DocGapCard.tsx`

```typescript
interface DocGap {
  id: string;
  query_text: string;
  gap_category: 'missing-doc' | 'unclear-doc' | 'missing-feature' | 'known-bug';
  suggested_doc_key: string | null;
  suggested_title: string | null;
  ticket_title: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
}

interface DocGapCardProps {
  gap: DocGap;
  onAssign: (gapId: string) => void;
  onClose: (gapId: string) => void;
  onCreateDoc: (gap: DocGap) => void;
}
```

#### `app/src/components/admin/PipelineStats.tsx`

```typescript
interface PipelineKPI {
  label: string;
  value: number | string;
  trend?: number;           // positive = up, negative = down
  trendLabel?: string;
}

interface ThroughputDataPoint {
  day: string;
  approved: number;
  rejected: number;
  published: number;
}

interface PipelineStatsProps {
  kpis: PipelineKPI[];
  throughput: ThroughputDataPoint[];
  avgQualityScore: number;
  highQualityCount: number;
  lowQualityCount: number;
}
```

Uses Recharts `LineChart` for throughput over 30 days, `RadialBarChart` for quality
distribution. Recharts is already in the Experient deps (`vendor-charts` chunk).

---

## 6. SideNav Integration

In `app/src/components/SideNav.tsx`, add the following after the `SETTINGS_EXTRA_ITEMS`
declaration and before the `SideNav` component function:

```typescript
const ADMIN_ITEMS = [
  { key: 'admin.docPipeline',   icon: 'edit_document', path: ROUTES.ADMIN_DOC_PIPELINE },
  { key: 'admin.docGaps',       icon: 'warning',       path: ROUTES.ADMIN_DOC_GAPS },
  { key: 'admin.pipelineStats', icon: 'analytics',     path: ROUTES.ADMIN_PIPELINE_STATS },
];
```

Inside the `SideNav` component, after `const visibleExtraItems = ...`:

```typescript
const isAdmin = permissions.isAdmin;
```

Inside the `<nav>` element, insert a new block **after** the Settings extra items
block and **before** the Settings item:

```typescript
{/* Admin section — only visible to admins */}
{isAdmin && (
  <>
    <div className={`my-2 ${isExpanded ? 'mx-2' : 'mx-1'} divider-gradient`} />
    {isExpanded && (
      <div className="px-3 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">
          {t('admin.section')}
        </span>
      </div>
    )}
    {ADMIN_ITEMS.map((item) => {
      const active = isActive(item.path);
      if (!isExpanded) {
        return (
          <Tooltip key={item.path}>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate(item.path)}
                className={`sidenav-item-collapsed${active ? ' active' : ''}`}
                aria-label={t(item.key)}
              >
                <Icon name={item.icon} fill={active ? 1 : 0} size={20} />
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-r-full bg-gradient-to-b from-primary to-tertiary" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-semibold text-xs">
              {t(item.key)}
            </TooltipContent>
          </Tooltip>
        );
      }
      return (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          className={`sidenav-item${active ? ' active active-bar' : ''}`}
        >
          <Icon name={item.icon} fill={active ? 1 : 0} size={20} />
          <span className="truncate">{t(item.key)}</span>
          {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
        </button>
      );
    })}
  </>
)}
```

Add the following keys to `app/src/locales/en.ts` under a new `admin` namespace:

```typescript
admin: {
  section:          'Admin',
  docPipeline:      'Doc Pipeline',
  docGaps:          'Doc Gaps',
  pipelineStats:    'Pipeline Stats',
},
```

---

## 7. Section-Level Diff Algorithm

Create `app/src/lib/docDiff.ts`.

```typescript
/**
 * Section-level diff between a live doc and a Crystal draft.
 * Uses the `diff` npm package (already a transitive dep via Vite) for hunk computation.
 * Falls back to full-body diff if the `diff` package is unavailable.
 */
import { diffLines } from 'diff';

export type SectionStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffHunk {
  type: 'add' | 'remove' | 'context';
  lines: string[];
}

export interface DiffSection {
  key: string;        // slugified heading: 'params-table', 'overview', 'code-examples'
  title: string;      // raw heading text, e.g. '## Parameters'
  status: SectionStatus;
  humanLocked: boolean;
  diffHunks: DiffHunk[];
}

export interface DocDiffResult {
  sections: DiffSection[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
  unchangedCount: number;
}

function slugify(heading: string): string {
  return heading
    .replace(/^#+\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseSections(markdown: string): Map<string, { title: string; body: string }> {
  const sections = new Map<string, { title: string; body: string }>();
  const lines = markdown.split('\n');
  let currentKey = '__preamble__';
  let currentTitle = '';
  let buffer: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (buffer.length || currentTitle) {
        sections.set(currentKey, { title: currentTitle, body: buffer.join('\n') });
      }
      currentTitle = line;
      currentKey = slugify(line);
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  // flush last section
  sections.set(currentKey, { title: currentTitle, body: buffer.join('\n') });

  return sections;
}

/**
 * computeDocDiff — compare live doc against new Crystal draft at section level.
 *
 * @param liveMarkdown      body_markdown from the current live doc (may be null if new)
 * @param draftMarkdown     body_markdown from the pending_review draft
 * @param lockedSections    Set of section_key strings that are human-locked
 */
export function computeDocDiff(
  liveMarkdown: string | null,
  draftMarkdown: string,
  lockedSections: Set<string> = new Set(),
): DocDiffResult {
  const liveSections  = parseSections(liveMarkdown ?? '');
  const draftSections = parseSections(draftMarkdown);

  const allKeys = new Set([...liveSections.keys(), ...draftSections.keys()]);
  const result: DiffSection[] = [];

  let addedCount    = 0;
  let removedCount  = 0;
  let changedCount  = 0;
  let unchangedCount = 0;

  for (const key of allKeys) {
    const live  = liveSections.get(key);
    const draft = draftSections.get(key);
    const humanLocked = lockedSections.has(key);

    let status: SectionStatus;
    let hunks: DiffHunk[] = [];

    if (!live && draft) {
      status = 'added';
      addedCount++;
      hunks = [{ type: 'add', lines: draft.body.split('\n') }];
    } else if (live && !draft) {
      status = 'removed';
      removedCount++;
      hunks = [{ type: 'remove', lines: live.body.split('\n') }];
    } else if (live && draft) {
      if (live.body === draft.body) {
        status = 'unchanged';
        unchangedCount++;
        hunks = [];
      } else {
        status = 'changed';
        changedCount++;
        // Compute line-level diff within the section
        const changes = diffLines(live.body, draft.body);
        for (const change of changes) {
          if (change.added) {
            hunks.push({ type: 'add', lines: (change.value ?? '').split('\n').filter(Boolean) });
          } else if (change.removed) {
            hunks.push({ type: 'remove', lines: (change.value ?? '').split('\n').filter(Boolean) });
          } else {
            // Show up to 3 context lines around changes
            const contextLines = (change.value ?? '').split('\n').filter(Boolean).slice(0, 3);
            if (contextLines.length) {
              hunks.push({ type: 'context', lines: contextLines });
            }
          }
        }
      }
    } else {
      // Should not happen — skip
      continue;
    }

    result.push({
      key,
      title: draft?.title ?? live?.title ?? key,
      status,
      humanLocked,
      diffHunks: hunks,
    });
  }

  // Order: changed first, then added, then removed, then unchanged
  const ORDER: Record<SectionStatus, number> = {
    changed: 0, added: 1, removed: 2, unchanged: 3,
  };
  result.sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return { sections: result, addedCount, removedCount, changedCount, unchangedCount };
}
```

**Important:** The diff algorithm must respect `humanLocked` sections. When
regenerating content in CrystalOS, the backend must pass locked section keys to the
doc-writer skill. The skill must skip those sections entirely and preserve the locked
content verbatim. Implement this by passing `locked_sections: string[]` in the
`POST /agents/support-doc-writer` body.

---

## 8. Sprint Plan

### Sprint A1 — Foundation (Weeks 1–2)

| Task | Owner | Notes |
|------|-------|-------|
| DB migration — new columns + 3 tables | Backend | `supabase/migrations/20260625_admin_pipeline.sql` |
| State machine + unit tests | Backend | `lib/pipelineStateMachine.ts` + `__tests__/pipelineStateMachine.test.js` |
| All 8 backend routes (`admin-support.ts`) | Backend | Include Zod validation for each route body |
| Mount router in `index.ts` | Backend | After existing `/api/admin` mount |
| Auto-approve worker + registry entry | Backend | `scheduler/jobs/docAutoApprove.ts` |
| `docAutoApprove.test.js` | Backend | Mock DB + Novu; assert affected count + event rows |
| `ROUTES` additions + SideNav integration | Frontend | 5 new route constants + admin nav section |
| `locales/en.ts` additions (`admin.*`) | Frontend | All new i18n keys for admin section |
| `app/src/lib/docDiff.ts` + tests | Frontend | Unit-test all four section statuses |

### Sprint A2 — UI and Polish (Weeks 3–4)

| Task | Owner | Notes |
|------|-------|-------|
| `DocPipelinePage.tsx` | Frontend | Queue + activity feed + KPI summary |
| `DocReviewPage.tsx` | Frontend | Diff viewer + approve/reject |
| `DocEditorPage.tsx` | Frontend | Inline markdown edit + section lock toggles |
| `DocGapsPage.tsx` | Frontend | Gap queue with filter + assign |
| `PipelineStatsPage.tsx` | Frontend | Recharts throughput chart + quality histogram |
| `PipelineQueueRow.tsx` | Frontend | Includes countdown timer for auto-approve deadline |
| `DocDiffViewer.tsx` | Frontend | Section collapse, lock icon, green/red line diff |
| `QualityScoreBreakdown.tsx` | Frontend | Radial score + dimension progress bars |
| `PipelineEventFeed.tsx` | Frontend | "New since last login" badge using `last_seen_at` |
| `DocGapCard.tsx` | Frontend | Gap item with category badge + actions |
| `PipelineStats.tsx` | Frontend | Recharts `LineChart` + `RadialBarChart` |
| Novu workflow templates (4 new) | Backend | See Section 9 |
| Mobile swipe gestures on `DocReviewPage` | Frontend | `useDrag` from Framer Motion or `touch` events |
| Route wiring in `App.tsx` | Frontend | Add 5 new admin routes under `AdminCrystalNav` or new layout |

---

## 9. Novu Notification Templates

All four workflows must be created in the Novu dashboard and their IDs added to
`backend/src/lib/novu/workflows/` following the existing pattern.

### `doc_review_requested`

Sent when a doc transitions to `pending_review`.

```typescript
{
  workflowId: 'doc_review_requested',
  to: { subscriberId: '<admin_user_id>' },  // all admin subscribers or a topic
  payload: {
    doc_key: string,          // 'api.surveys.create'
    title: string,            // doc title
    quality_score: number,    // 0.0–1.0
    auto_approve_at: string,  // ISO timestamp — "will auto-approve at X"
    review_url: string,       // deep link to /app/admin/support/pipeline/<doc_id>
  },
}
// Subject:  "New doc ready for review: {{title}}"
// Body:     "Crystal drafted {{title}} with a quality score of {{quality_score}}.
//            Review it now or it will auto-publish at {{auto_approve_at}}."
// CTA:      "Review Doc" → {{review_url}}
```

### `doc_auto_approved`

Sent when the auto-approve worker fires (batched).

```typescript
{
  workflowId: 'doc_auto_approved',
  to: { subscriberId: 'admin-broadcast' },
  payload: {
    count: number,           // how many docs auto-published this run
    titles: string[],        // first 5 doc titles for preview
    stats_url: string,       // deep link to /app/admin/support/stats
  },
}
// Subject:  "{{count}} doc(s) auto-published (optimistic timeout)"
// Body:     "The following docs passed their 2h review window and have gone live:
//            {{titles}}. See pipeline stats for details."
// CTA:      "View Stats" → {{stats_url}}
```

### `doc_gap_created`

Sent to the doc-eng team when a rejection creates a gap (or Crystal detects a gap).

```typescript
{
  workflowId: 'doc_gap_created',
  to: { subscriberId: 'doc-eng-team' },  // Novu topic or specific subscribers
  payload: {
    gap_category: string,          // 'missing-doc' | 'unclear-doc' | ...
    query_text: string,            // what the rejection or gap query was
    suggested_doc_key: string,     // if Crystal suggested a doc key
    suggested_title: string,
    gaps_url: string,              // deep link to /app/admin/support/gaps
  },
}
// Subject:  "New doc gap: {{suggested_title || gap_category}}"
// Body:     "A new {{gap_category}} gap was created. Query: '{{query_text}}'.
//            Suggested doc: {{suggested_doc_key}}."
// CTA:      "View Gaps" → {{gaps_url}}
```

### `doc_published`

Sent to opted-in subscribers when a doc goes live.

```typescript
{
  workflowId: 'doc_published',
  to: { subscriberId: '<subscriber_user_id>' },
  payload: {
    doc_key: string,
    title: string,
    category: string,
    doc_url: string,         // public support site URL for the doc
    change_summary: string,  // brief diff summary, e.g. "Updated params table, new code examples"
  },
}
// Subject:  "Doc updated: {{title}}"
// Body:     "{{title}} has been updated. {{change_summary}}"
// CTA:      "Read Doc" → {{doc_url}}
```

All four workflows should be added to `backend/src/lib/novu/workflows/` as typed
constants following the existing `crystal-support` workflow pattern.

---

## 10. Acceptance Criteria

### AC-1: Admin sees correct queue count on dashboard

**Given** 3 docs are in `pending_review` and 1 is in `requires_annotation`  
**When** an admin navigates to `/app/admin/support/pipeline`  
**Then** the queue displays exactly 4 rows, the KPI card shows "4 pending" and the
status badges match the `pipeline_status` of each row.

### AC-2: Optimistic timeout auto-publishes after 2 hours

**Given** a doc enters `pending_review` at T=0 with `auto_approve_deadline = T+2h`  
**When** the `doc-auto-approve` scheduler job runs at T+2h+5min  
**Then** the doc's `pipeline_status` is `auto_approved`, a `support_pipeline_events`
row exists with `event_type = 'auto_approved'` and `triggered_by = 'timeout'`, the
doc appears on the support site, and a `doc_auto_approved` Novu notification was sent.

### AC-3: Human-locked section survives Crystal regeneration

**Given** an admin locks the `params-table` section of doc `api.surveys.create`  
**When** CI pushes a source change and CrystalOS generates a new draft  
**Then** the new draft's `params-table` section body equals the admin-locked version,
the `support_doc_sections` row has `human_locked = true`, and the diff viewer marks
that section with a lock icon.

### AC-4: Reject with reason creates `doc_gap`

**Given** an admin rejects doc ID `<x>` with reason "Missing rate limit table"
and `create_gap = true`  
**When** `POST /api/admin/support/pipeline/doc/<x>/reject` is called  
**Then** a `support_doc_gaps` row exists with `gap_category = 'unclear-doc'` and
`query_text = 'Missing rate limit table'`, a `doc_gap_created` Novu notification was
sent to the doc-eng team, and the doc's `pipeline_status` is `rejected`.

### AC-5: Mobile swipe-right approves doc

**Given** an admin opens `DocReviewPage` on a mobile viewport  
**When** the admin swipes right (drag distance > 100px)  
**Then** the approve confirmation sheet appears (same as tapping the Approve button),
and on confirmation `POST /api/admin/support/pipeline/doc/:id/approve` is called.

### AC-6: Stats show correct throughput numbers

**Given** 5 docs were approved and 2 were rejected in the last 7 days  
**When** an admin visits `/app/admin/support/stats`  
**Then** the throughput chart shows 5 approved and 2 rejected events in that window,
matching the `support_pipeline_events` count for those `event_type` values.

### AC-7: Activity feed shows events since last login

**Given** admin A last visited at T=yesterday and 3 pipeline events occurred since then  
**When** admin A opens the activity feed on the pipeline dashboard  
**Then** those 3 events display a "New" badge, events before T=yesterday do not.
The `support_admin_sessions` row for admin A is updated to NOW() after load.

### AC-8: Diff view correctly highlights changed sections

**Given** the live version of `api.surveys.create` has a `## Parameters` section
with 10 rows, and the Crystal draft has that section with 11 rows (one added)  
**When** the admin opens `DocReviewPage` for the draft  
**Then** `DocDiffViewer` shows `status = 'changed'` for `params-table`, the new
row appears with a green background hunk, and the diff summary shows `changedCount = 1`.

### AC-9: Section lock prevents Crystal overwrite

**Given** an admin calls `POST /api/admin/support/pipeline/doc/:id/lock-section`
for `section_key = 'overview'`  
**When** `transitionPipeline` is called with `event = 'draft_ready'`  
**Then** the `support_doc_sections` row has `human_locked = true`, and when the
doc-writer skill receives the refresh-doc request, the `locked_sections` array in
the CrystalOS payload includes `'overview'`, causing CrystalOS to preserve that
section verbatim.

### AC-10: Quality score breakdown matches eval output

**Given** CrystalOS `crystal-eval` skill returns `{ completeness: 0.9, accuracy: 0.85,
clarity: 0.78, examples: 0.95 }` for a draft  
**When** the admin opens `DocReviewPage` for that draft  
**Then** `QualityScoreBreakdown` renders four dimension bars with values matching
the eval output, the overall score equals the weighted average used by the state
machine (must match `quality_score` stored in `support_docs`), and the overall score
chip is colored emerald (≥0.85 threshold).

---

## Cross-Cutting Concerns

### Permissions

All backend routes use `requireAuth + requireRole('admin')`. The frontend pages must
also gate rendering via `usePermissions().isAdmin` and redirect to `/app/dashboard`
if the user is not an admin — use the existing `PermissionGate` component.

### Localisation

Every user-visible string in new pages and components must use `t()`. Add all keys
to `app/src/locales/en.ts` under the `admin` namespace before opening a PR.

### DataBus Invalidation

After approve, reject, or edit actions that change `pipeline_status`:

```typescript
import { invalidate } from '../lib/dataBus';
invalidate('support-docs');   // invalidates any hook subscribed to 'support-docs'
```

Register a `useInvalidation('support-docs', reload)` call in `DocPipelinePage` so
it refetches after Crystal or CI makes a change while the admin has the page open.

### Error States

All pages must handle:
- Empty queue state (no docs in review) — show a "Nothing to review" empty state illustration
- Network error — use the existing `ErrorBoundary` wrapping pattern
- Stale doc (source changed while admin is reviewing) — show a warning banner if
  the doc's `updated_at` changes between page load and action submission

### Observability

Add Prometheus counters to the new scheduler job and backend routes following the
existing `prom-client` pattern in `backend/src/lib/metrics.ts`:

```typescript
export const pipelineApprovedTotal  = new Counter({ name: 'pipeline_approved_total',  help: 'Docs approved by admin' });
export const pipelineRejectedTotal  = new Counter({ name: 'pipeline_rejected_total',  help: 'Docs rejected by admin' });
export const pipelineAutoApprovedTotal = new Counter({ name: 'pipeline_auto_approved_total', help: 'Docs auto-approved by timeout' });
export const pipelineReviewLatencySeconds = new Histogram({
  name: 'pipeline_review_latency_seconds',
  help: 'Time from pending_review to approved/rejected',
  buckets: [300, 900, 1800, 3600, 7200],
});
```

Add alerting rules to `docker/prometheus/rules/slo.yml`:
- `pipeline_auto_approved_total > 20` in 24h → alert to doc-eng (too many bypassing review)
- `pipeline_review_latency_seconds p95 > 86400` → alert (docs sitting unreviewed > 24h)
