const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { validate } = require('../../lib/validate');
const { createTemplateSchema, updateTemplateSchema } = require('../../schemas/templates');
const db = require('../../lib/db');
const SYSTEM_TEMPLATES = require('../../data/systemTemplates');
const router = express.Router();

// Postgres returns snake_case columns — normalize to camelCase for frontend
function normalize(row) {
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
async function ensureTable() {
  await db.query(`
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
router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureTable();
    const { rows } = await db.query(
      `SELECT * FROM org_templates WHERE org_id = $1 AND status != 'archived' ORDER BY created_at DESC`,
      [req.orgId]
    );
    res.json({ templates: [...SYSTEM_TEMPLATES, ...rows.map(normalize)] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const sys = SYSTEM_TEMPLATES.find((t) => t.id === req.params.id);
    if (sys) return res.json({ template: sys });

    await ensureTable();
    const { rows } = await db.query(
      `SELECT * FROM org_templates WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json({ template: normalize(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates
router.post('/', requireAuth, validate(createTemplateSchema), async (req, res) => {
  try {
    await ensureTable();
    const { label, shortLabel, description, category, icon, color, bg, metrics, tags,
            estimatedMinutes, questionCount, questions, scoring, intelligence, clonedFromId } = req.body;

    const { rows } = await db.query(
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
        estimatedMinutes || 0, questionCount || String((questions || []).length),
        JSON.stringify(questions || []), scoring ? JSON.stringify(scoring) : null,
        intelligence ? JSON.stringify(intelligence) : null,
        req.userId, clonedFromId || null,
      ]
    );
    res.status(201).json({ template: normalize(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id
router.put('/:id', requireAuth, validate(updateTemplateSchema), async (req, res) => {
  try {
    const isSystem = SYSTEM_TEMPLATES.some((t) => t.id === req.params.id);
    if (isSystem) return res.status(403).json({ error: 'System templates cannot be modified' });

    await ensureTable();
    const sets = ['updated_at = NOW()'];
    const vals = [];
    let i = 1;

    const fieldMap = {
      label: 'label', shortLabel: 'short_label', description: 'description',
      category: 'category', icon: 'icon', color: 'color', bg: 'bg',
      estimatedMinutes: 'estimated_minutes', questionCount: 'question_count', status: 'status',
    };
    const jsonFields = { metrics: 'metrics', tags: 'tags', questions: 'questions', scoring: 'scoring', intelligence: 'intelligence' };

    Object.entries(fieldMap).forEach(([key, col]) => {
      if (req.body[key] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(req.body[key]); }
    });
    Object.entries(jsonFields).forEach(([key, col]) => {
      if (req.body[key] !== undefined) { sets.push(`${col} = $${i++}`); vals.push(JSON.stringify(req.body[key])); }
    });

    vals.push(req.params.id, req.orgId);
    const { rowCount } = await db.query(
      `UPDATE org_templates SET ${sets.join(', ')} WHERE id = $${i++} AND org_id = $${i}`,
      vals
    );
    if (!rowCount) return res.status(404).json({ error: 'Template not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id — soft-archive
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const isSystem = SYSTEM_TEMPLATES.some((t) => t.id === req.params.id);
    if (isSystem) return res.status(403).json({ error: 'System templates cannot be deleted' });

    await ensureTable();
    await db.query(
      `UPDATE org_templates SET status = 'archived', updated_at = NOW() WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/:id/clone
router.post('/:id/clone', requireAuth, async (req, res) => {
  try {
    await ensureTable();
    const source = SYSTEM_TEMPLATES.find((t) => t.id === req.params.id);
    if (source) {
      const { rows } = await db.query(
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
      return res.status(201).json({ template: normalize(rows[0]) });
    }

    const { rows: src } = await db.query(
      `SELECT * FROM org_templates WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    if (!src.length) return res.status(404).json({ error: 'Template not found' });
    const s = src[0];

    const { rows } = await db.query(
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
    res.status(201).json({ template: normalize(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
