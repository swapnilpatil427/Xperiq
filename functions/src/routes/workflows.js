const express = require('express');
const { db } = require('../lib/admin');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const snap = await db
      .collection('orgs').doc(req.orgId)
      .collection('workflows')
      .orderBy('createdAt', 'desc')
      .get();
    const workflows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString(),
    }));
    res.json({ workflows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { condition, action, name } = req.body;
    const wf = {
      name,
      condition,
      action,
      status: 'active',
      triggerCount: 0,
      orgId: req.orgId,
      createdBy: req.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ref = await db.collection('orgs').doc(req.orgId).collection('workflows').add(wf);
    res.status(201).json({ workflow: { id: ref.id, ...wf } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { condition, action, name, status } = req.body;
    const update = { updatedAt: new Date() };
    if (name) update.name = name;
    if (condition) update.condition = condition;
    if (action) update.action = action;
    if (status) update.status = status;
    await db
      .collection('orgs').doc(req.orgId)
      .collection('workflows').doc(req.params.id)
      .update(update);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db
      .collection('orgs').doc(req.orgId)
      .collection('workflows').doc(req.params.id)
      .delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const doc = await db
      .collection('orgs').doc(req.orgId)
      .collection('workflows').doc(req.params.id)
      .get();
    const current = doc.data().status;
    const next = current === 'active' ? 'paused' : 'active';
    await doc.ref.update({ status: next, updatedAt: new Date() });
    res.json({ status: next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
