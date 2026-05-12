const express = require('express');
const { db } = require('../lib/admin');
const { requireAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// List surveys for org
router.get('/', requireAuth, async (req, res) => {
  try {
    const snap = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const surveys = await Promise.all(
      snap.docs.map(async (doc) => {
        const data = doc.data();
        const respSnap = await db
          .collection('orgs').doc(req.orgId)
          .collection('surveys').doc(doc.id)
          .collection('responses')
          .count()
          .get();
        return {
          id: doc.id,
          ...data,
          responseCount: respSnap.data().count,
          createdAt: data.createdAt?.toDate?.()?.toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
        };
      })
    );

    res.json({ surveys });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get single survey
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(req.params.id)
      .get();
    if (!doc.exists) return res.status(404).json({ error: 'Survey not found' });
    res.json({ survey: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create survey
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, questions = [], survey_type_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const survey = {
      title,
      status: 'draft',
      questions,
      surveyTypeId: survey_type_id || null,
      orgId: req.orgId,
      createdBy: req.userId,
      publishToken: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ref = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys')
      .add(survey);

    res.status(201).json({ survey: { id: ref.id, ...survey } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update survey
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { title, status, questions, description } = req.body;
    const update = { updatedAt: new Date() };
    if (title       !== undefined) update.title       = title;
    if (status      !== undefined) update.status      = status;
    if (description !== undefined) update.description = description;
    if (questions   !== undefined) update.questions   = questions;

    await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(req.params.id)
      .update(update);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete survey
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(req.params.id)
      .delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish survey
router.post('/:id/publish', requireAuth, async (req, res) => {
  try {
    await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(req.params.id)
      .update({ status: 'active', updatedAt: new Date() });

    const doc = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(req.params.id)
      .get();

    res.json({ publishToken: doc.data().publishToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
