const express = require('express');
const { db } = require('../lib/admin');
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const SYSTEM_TEMPLATES = require('../data/systemTemplates');
const router = express.Router();

// GET /api/templates — merge system templates + org templates
router.get('/', requireAuth, async (req, res) => {
  try {
    const snap = await db
      .collection('orgs').doc(req.orgId)
      .collection('templates')
      .where('status', '!=', 'archived')
      .orderBy('status')
      .orderBy('createdAt', 'desc')
      .get();

    const orgTemplates = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
      };
    });

    res.json({ templates: [...SYSTEM_TEMPLATES, ...orgTemplates] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    // Check system templates first
    const sys = SYSTEM_TEMPLATES.find((t) => t.id === req.params.id);
    if (sys) return res.json({ template: sys });

    const doc = await db
      .collection('orgs').doc(req.orgId)
      .collection('templates').doc(req.params.id)
      .get();

    if (!doc.exists) return res.status(404).json({ error: 'Template not found' });

    const data = doc.data();
    res.json({
      template: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates — create org template
router.post('/', requireAuth, async (req, res) => {
  try {
    const { label, shortLabel, description, category, icon, color, bg, metrics, tags,
            estimatedMinutes, questionCount, questions, scoring, intelligence, clonedFromId } = req.body;

    if (!label) return res.status(400).json({ error: 'label is required' });

    const template = {
      label,
      shortLabel: shortLabel || label,
      description: description || '',
      category: category || 'cx',
      icon: icon || 'quiz',
      color: color || '#2a4bd9',
      bg: bg || '#e0e7ff',
      metrics: metrics || [],
      tags: tags || [],
      recommended: false,
      estimatedMinutes: estimatedMinutes || 0,
      questionCount: questionCount || String((questions || []).length),
      questions: questions || [],
      scoring: scoring || null,
      intelligence: intelligence || null,
      isSystem: false,
      orgId: req.orgId,
      status: 'active',
      createdBy: req.userId,
      clonedFromId: clonedFromId || null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ref = await db
      .collection('orgs').doc(req.orgId)
      .collection('templates')
      .add(template);

    res.status(201).json({
      template: {
        id: ref.id,
        ...template,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id — update org template (system templates are immutable)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const isSystem = SYSTEM_TEMPLATES.some((t) => t.id === req.params.id);
    if (isSystem) return res.status(403).json({ error: 'System templates cannot be modified' });

    const allowed = ['label', 'shortLabel', 'description', 'category', 'icon', 'color', 'bg',
                     'metrics', 'tags', 'estimatedMinutes', 'questionCount', 'questions', 'scoring', 'intelligence', 'status'];
    const update = { updatedAt: new Date() };
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });

    await db
      .collection('orgs').doc(req.orgId)
      .collection('templates').doc(req.params.id)
      .update(update);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id — soft-archive org template
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const isSystem = SYSTEM_TEMPLATES.some((t) => t.id === req.params.id);
    if (isSystem) return res.status(403).json({ error: 'System templates cannot be deleted' });

    await db
      .collection('orgs').doc(req.orgId)
      .collection('templates').doc(req.params.id)
      .update({ status: 'archived', updatedAt: new Date() });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/:id/clone — clone system template into org library
router.post('/:id/clone', requireAuth, async (req, res) => {
  try {
    const source = SYSTEM_TEMPLATES.find((t) => t.id === req.params.id);
    if (!source) {
      // Clone org template
      const doc = await db
        .collection('orgs').doc(req.orgId)
        .collection('templates').doc(req.params.id)
        .get();
      if (!doc.exists) return res.status(404).json({ error: 'Template not found' });
      const data = doc.data();
      const clone = {
        ...data,
        label: `${data.label} (Copy)`,
        isSystem: false,
        orgId: req.orgId,
        status: 'active',
        createdBy: req.userId,
        clonedFromId: req.params.id,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ref = await db
        .collection('orgs').doc(req.orgId)
        .collection('templates')
        .add(clone);
      return res.status(201).json({ template: { id: ref.id, ...clone } });
    }

    const clone = {
      ...source,
      label: `${source.label} (Copy)`,
      isSystem: false,
      orgId: req.orgId,
      status: 'active',
      createdBy: req.userId,
      clonedFromId: source.id,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Remove system-only fields
    delete clone.id;

    const ref = await db
      .collection('orgs').doc(req.orgId)
      .collection('templates')
      .add(clone);

    res.status(201).json({
      template: {
        id: ref.id,
        ...clone,
        createdAt: clone.createdAt.toISOString(),
        updatedAt: clone.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
