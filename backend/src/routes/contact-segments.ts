import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission, evaluatePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';
import { createSegmentSchema, updateSegmentSchema, addMemberSchema } from '../schemas/contact-segments';
import { evaluateSegment, refreshSegmentMembership } from '../lib/segmentEvaluator';

const router = express.Router();
router.use(requireAuth);

// GET / — list segments for org
router.get('/', requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT id, name, description, color, is_dynamic, filter_def, contact_count, last_evaluated_at, created_at, updated_at
       FROM contact_segments WHERE org_id = $1 ORDER BY created_at DESC`,
      [req.orgId]
    );
    res.json({ segments: rows });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /preview — ad-hoc preview while building (must be before /:id routes)
router.post('/preview', requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  const { filter_def } = req.body as { filter_def?: unknown };
  if (!filter_def) { clientError(res, 400, 'filter_def required'); return; }
  try {
    const result = await evaluateSegment(filter_def as Parameters<typeof evaluateSegment>[0], req.orgId);
    res.json(result);
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST / — create segment
router.post('/', requirePermission('contacts:segment:manage'), validate(createSegmentSchema), async (req: Request, res: Response): Promise<void> => {
  const { name, description, color, is_dynamic, filter_def } = req.body as {
    name: string;
    description?: string;
    color?: string;
    is_dynamic?: boolean;
    filter_def: Parameters<typeof evaluateSegment>[0];
  };
  try {
    const { rows } = await query(
      `INSERT INTO contact_segments (org_id, name, description, color, is_dynamic, filter_def, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.orgId, name, description ?? null, color ?? '#2a4bd9', is_dynamic ?? true, JSON.stringify(filter_def), req.userId]
    );
    const seg = rows[0];
    // Auto-refresh dynamic segments
    if (seg.is_dynamic && seg.filter_def.conditions?.length > 0) {
      refreshSegmentMembership(seg.id, seg.filter_def, req.orgId).catch(() => {});
    }
    res.status(201).json({ segment: seg });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique')) { clientError(res, 409, 'A segment with that name already exists'); return; }
    serverError(res, err instanceof Error ? err : new Error(msg));
  }
});

// PUT /:id — update segment
router.put('/:id', requirePermission('contacts:segment:manage'), validate(updateSegmentSchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updates = req.body as {
    name?: string;
    description?: string;
    color?: string;
    is_dynamic?: boolean;
    filter_def?: Parameters<typeof evaluateSegment>[0];
  };
  try {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [req.orgId, id];
    let p = 3;
    if (updates.name !== undefined) { setClauses.push(`name = $${p++}`); params.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push(`description = $${p++}`); params.push(updates.description); }
    if (updates.color !== undefined) { setClauses.push(`color = $${p++}`); params.push(updates.color); }
    if (updates.is_dynamic !== undefined) { setClauses.push(`is_dynamic = $${p++}`); params.push(updates.is_dynamic); }
    if (updates.filter_def !== undefined) { setClauses.push(`filter_def = $${p++}`); params.push(JSON.stringify(updates.filter_def)); }

    const { rows } = await query(
      `UPDATE contact_segments SET ${setClauses.join(', ')} WHERE org_id = $1 AND id = $2 RETURNING *`,
      params
    );
    if (!rows[0]) { clientError(res, 404, 'Segment not found'); return; }
    const seg = rows[0];
    if (updates.filter_def && seg.is_dynamic) {
      refreshSegmentMembership(seg.id, seg.filter_def, req.orgId).catch(() => {});
    }
    res.json({ segment: seg });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// DELETE /:id — delete segment
router.delete('/:id', requirePermission('contacts:segment:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rowCount } = await query(
      `DELETE FROM contact_segments WHERE org_id = $1 AND id = $2`, [req.orgId, req.params.id]
    );
    if (!rowCount) { clientError(res, 404, 'Segment not found'); return; }
    res.json({ success: true });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /:id/evaluate — dry-run count + preview
router.post('/:id/evaluate', requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT filter_def FROM contact_segments WHERE org_id = $1 AND id = $2`, [req.orgId, req.params.id]
    );
    if (!rows[0]) { clientError(res, 404, 'Segment not found'); return; }
    const result = await evaluateSegment(rows[0].filter_def, req.orgId);
    res.json(result);
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /:id/refresh — re-materialize membership
router.post('/:id/refresh', requirePermission('contacts:segment:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      `SELECT filter_def, is_dynamic FROM contact_segments WHERE org_id = $1 AND id = $2`,
      [req.orgId, req.params.id]
    );
    if (!rows[0]) { clientError(res, 404, 'Segment not found'); return; }
    if (!rows[0].is_dynamic) { clientError(res, 400, 'Only dynamic segments can be refreshed'); return; }
    const count = await refreshSegmentMembership(req.params.id, rows[0].filter_def, req.orgId);
    res.json({ success: true, contact_count: count });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// GET /:id/members — paginated member list
router.get('/:id/members', requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);
  const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
  const offset = (page - 1) * limit;
  try {
    // Check PII permission to determine whether to mask name/email fields
    const piiScope = await evaluatePermission(req.userId!, req.orgId!, 'contacts', 'org', 'contacts:pii:read');
    const hasPii = piiScope;

    const [membersRes, countRes] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.email, c.account_name, c.consent_given, c.segment_attrs, csm.added_at, csm.is_manual
         FROM contact_segment_members csm
         JOIN contacts c ON c.id = csm.contact_id
         WHERE csm.segment_id = $1 AND c.org_id = $2
         ORDER BY csm.added_at DESC LIMIT $3 OFFSET $4`,
        [req.params.id, req.orgId, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM contact_segment_members csm JOIN contacts c ON c.id = csm.contact_id
         WHERE csm.segment_id = $1 AND c.org_id = $2`,
        [req.params.id, req.orgId]
      ),
    ]);

    const members = hasPii
      ? membersRes.rows
      : membersRes.rows.map((m) => ({ ...m, name: null, email: null }));

    res.json({ members, total: parseInt(countRes.rows[0]?.count ?? '0', 10), page, limit });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// POST /:id/members — add manual member
router.post('/:id/members', requirePermission('contacts:segment:manage'), validate(addMemberSchema), async (req: Request, res: Response): Promise<void> => {
  const { contact_id } = req.body as { contact_id: string };
  try {
    // Verify contact belongs to org
    const { rows: [c] } = await query(`SELECT id FROM contacts WHERE id = $1 AND org_id = $2`, [contact_id, req.orgId]);
    if (!c) { clientError(res, 404, 'Contact not found'); return; }
    await query(
      `INSERT INTO contact_segment_members (segment_id, contact_id, is_manual) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING`,
      [req.params.id, contact_id]
    );
    res.status(201).json({ success: true });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// DELETE /:id/members/:contactId — remove member
router.delete('/:id/members/:contactId', requirePermission('contacts:segment:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    await query(
      `DELETE FROM contact_segment_members WHERE segment_id = $1 AND contact_id = $2 AND EXISTS (SELECT 1 FROM contact_segments WHERE id = $1 AND org_id = $3)`,
      [req.params.id, req.params.contactId, req.orgId]
    );
    res.json({ success: true });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

export default router;
