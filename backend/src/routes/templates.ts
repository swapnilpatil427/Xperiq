import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../lib/validate';
import { createTemplateSchema, updateTemplateSchema } from '../schemas/templates';
import { query } from '../lib/db';
import SYSTEM_TEMPLATES from '../data/systemTemplates';
import { serverError } from '../lib/httpError';

const router = express.Router();

interface TemplateRow {
  id: string;
  org_id: string;
  label: string;
  short_label?: string | null;
  description?: string | null;
  category?: string | null;
  icon?: string | null;
  color?: string | null;
  bg?: string | null;
  metrics?: unknown[] | null;
  tags?: unknown[] | null;
  recommended?: boolean | null;
  estimated_minutes?: number | null;
  question_count?: string | null;
  questions?: unknown[] | null;
  scoring?: unknown | null;
  intelligence?: unknown | null;
  is_system?: boolean | null;
  status?: string | null;
  created_by?: string | null;
  cloned_from_id?: string | null;
  version?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// Postgres returns snake_case columns — normalize to camelCase for frontend
function normalize(row: TemplateRow | null): Record<string, unknown> | null {
  if (!row) return row;
  return {
    id:               row.id,
    orgId:            row.org_id,
    label:            row.label,
    shortLabel:       row.short_label,
    description:      row.description,
    category:         row.category,
    icon:             row.icon,
    color:            row.color,
    bg:               row.bg,
    metrics:          row.metrics || [],
    tags:             row.tags || [],
    recommended:      row.recommended,
    estimatedMinutes: row.estimated_minutes,
    questionCount:    row.question_count,
    questions:        row.questions || [],
    scoring:          row.scoring || null,
    intelligence:     row.intelligence || null,
    isSystem:         row.is_system,
    status:           row.status,
    createdBy:        row.created_by,
    clonedFromId:     row.cloned_from_id,
    version:          row.version,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

// Ensure table exists on first use
async function ensureTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS org_templates (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id      TEXT NOT NULL,
      label       TEXT NOT NULL,
      short_label TEXT,
      description TEXT,
      category    TEXT DEFAULT 'cx',
      icon        TEXT DEFAULT 'quiz',
      color       TEXT DEFAULT '#2a4bd9',
      bg          TEXT DEFAULT '#e0e7ff',
      metrics     JSONB DEFAULT '[]',
      tags        JSONB DEFAULT '[]',
      recommended BOOLEAN DEFAULT FALSE,
      estimated_minutes INT DEFAULT 0,
      question_count TEXT DEFAULT '0',
      questions   JSONB DEFAULT '[]',
      scoring     JSONB,
      intelligence JSONB,
      is_system   BOOLEAN DEFAULT FALSE,
      status      TEXT DEFAULT 'active',
      created_by  TEXT,
      cloned_from_id TEXT,
      version     INT DEFAULT 1,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// GET /api/templates
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTable();
    const { rows } = await query(
      `SELECT * FROM org_templates WHERE org_id = $1 AND status != 'archived' ORDER BY created_at DESC`,
      [req.orgId]
    );
    res.json({ templates: [...SYSTEM_TEMPLATES, ...(rows as TemplateRow[]).map(normalize)] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// GET /api/templates/:id
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const sys = (SYSTEM_TEMPLATES as { id: string }[]).find((t) => t.id === req.params.id);
    if (sys) { res.json({ template: sys }); return; }

    await ensureTable();
    const { rows } = await query(
      `SELECT * FROM org_templates WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ template: normalize(rows[0] as TemplateRow) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/templates
router.post('/', requireAuth, validate(createTemplateSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTable();
    const { label, shortLabel, description, category, icon, color, bg, metrics, tags,
            estimatedMinutes, questionCount, questions, scoring, intelligence, clonedFromId } = req.body as Record<string, unknown>;

    const { rows } = await query(
      `INSERT INTO org_templates
        (org_id, label, short_label, description, category, icon, color, bg,
         metrics, tags, estimated_minutes, question_count, questions, scoring, intelligence,
         is_system, status, created_by, cloned_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,FALSE,'active',$16,$17)
       RETURNING *`,
      [
        req.orgId, label, shortLabel || label, description || '',
        category || 'cx', icon || 'quiz', color || '#2a4bd9', bg || '#e0e7ff',
        JSON.stringify(metrics || []), JSON.stringify(tags || []),
        estimatedMinutes || 0, questionCount || String(((questions as unknown[]) || []).length),
        JSON.stringify(questions || []), scoring ? JSON.stringify(scoring) : null,
        intelligence ? JSON.stringify(intelligence) : null,
        req.userId, clonedFromId || null,
      ]
    );
    res.status(201).json({ template: normalize(rows[0] as TemplateRow) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PUT /api/templates/:id
router.put('/:id', requireAuth, validate(updateTemplateSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const isSystem = (SYSTEM_TEMPLATES as { id: string }[]).some((t) => t.id === req.params.id);
    if (isSystem) { res.status(403).json({ error: 'System templates cannot be modified' }); return; }

    await ensureTable();
    const sets: string[] = ['updated_at = NOW()'];
    const vals: unknown[] = [];
    let i = 1;

    const fieldMap: Record<string, string> = {
      label: 'label', shortLabel: 'short_label', description: 'description',
      category: 'category', icon: 'icon', color: 'color', bg: 'bg',
      estimatedMinutes: 'estimated_minutes', questionCount: 'question_count', status: 'status',
    };
    const jsonFields: Record<string, string> = { metrics: 'metrics', tags: 'tags', questions: 'questions', scoring: 'scoring', intelligence: 'intelligence' };

    const body = req.body as Record<string, unknown>;
    Object.entries(fieldMap).forEach(([key, col]) => {
      if (body[key] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(body[key]); }
    });
    Object.entries(jsonFields).forEach(([key, col]) => {
      if (body[key] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(JSON.stringify(body[key])); }
    });

    vals.push(req.params.id, req.orgId);
    const { rowCount } = await query(
      `UPDATE org_templates SET ${sets.join(', ')} WHERE id = $${i++} AND org_id = $${i}`,
      vals
    );
    if (!rowCount) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// DELETE /api/templates/:id — soft-archive
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const isSystem = (SYSTEM_TEMPLATES as { id: string }[]).some((t) => t.id === req.params.id);
    if (isSystem) { res.status(403).json({ error: 'System templates cannot be deleted' }); return; }

    await ensureTable();
    await query(
      `UPDATE org_templates SET status = 'archived', updated_at = NOW() WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/templates/:id/clone
router.post('/:id/clone', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureTable();
    const source = (SYSTEM_TEMPLATES as Record<string, unknown>[]).find((t) => t.id === req.params.id);
    if (source) {
      const { rows } = await query(
        `INSERT INTO org_templates
          (org_id, label, short_label, description, category, icon, color, bg,
           metrics, tags, recommended, estimated_minutes, question_count,
           questions, scoring, intelligence, is_system, status, created_by, cloned_from_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13,$14,$15,FALSE,'active',$16,$17)
         RETURNING *`,
        [
          req.orgId, `${source.label} (Copy)`, source.shortLabel, source.description,
          source.category, source.icon, source.color, source.bg,
          JSON.stringify(source.metrics), JSON.stringify(source.tags),
          source.estimatedMinutes, source.questionCount,
          JSON.stringify(source.questions),
          source.scoring ? JSON.stringify(source.scoring) : null,
          source.intelligence ? JSON.stringify(source.intelligence) : null,
          req.userId, source.id,
        ]
      );
      res.status(201).json({ template: normalize(rows[0] as TemplateRow) });
      return;
    }

    const { rows: src } = await query(
      `SELECT * FROM org_templates WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    if (!src.length) { res.status(404).json({ error: 'Template not found' }); return; }
    const s = src[0] as TemplateRow;

    const { rows } = await query(
      `INSERT INTO org_templates
        (org_id, label, short_label, description, category, icon, color, bg,
         metrics, tags, recommended, estimated_minutes, question_count,
         questions, scoring, intelligence, is_system, status, created_by, cloned_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13,$14,$15,FALSE,'active',$16,$17)
       RETURNING *`,
      [
        req.orgId, `${s.label} (Copy)`, s.short_label, s.description,
        s.category, s.icon, s.color, s.bg,
        JSON.stringify(s.metrics), JSON.stringify(s.tags),
        s.estimated_minutes, s.question_count,
        JSON.stringify(s.questions),
        s.scoring ? JSON.stringify(s.scoring) : null,
        s.intelligence ? JSON.stringify(s.intelligence) : null,
        req.userId, s.id,
      ]
    );
    res.status(201).json({ template: normalize(rows[0] as TemplateRow) });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
