const express = require('express');
const { db } = require('../lib/admin');
const { requireAuth } = require('../middleware/auth');
const router = express.Router({ mergeParams: true });

// Submit response — public (no auth required)
router.post('/', async (req, res) => {
  try {
    const { surveyId } = req.params;
    const { answers, publishToken } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers array is required' });
    }

    // Find the org for this survey via publishToken
    const surveysQuery = await db
      .collectionGroup('surveys')
      .where('publishToken', '==', publishToken)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (surveysQuery.empty) {
      return res.status(404).json({ error: 'Survey not found or not active' });
    }

    const surveyDoc = surveysQuery.docs[0];
    const orgId = surveyDoc.data().orgId;

    // Extract NPS score if present
    const npsAnswer = answers.find((a) => a.type === 'nps');
    const npsScore = npsAnswer ? parseInt(npsAnswer.value, 10) : null;

    const response = {
      surveyId,
      orgId,
      answers,
      npsScore,
      submittedAt: new Date(),
      respondentId: null,
    };

    await db
      .collection('orgs').doc(orgId)
      .collection('surveys').doc(surveyDoc.id)
      .collection('responses')
      .add(response);

    res.status(201).json({ success: true, message: 'Response submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get responses for survey — authenticated
router.get('/', requireAuth, async (req, res) => {
  try {
    const { surveyId } = req.params;
    const snap = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(surveyId)
      .collection('responses')
      .orderBy('submittedAt', 'desc')
      .limit(100)
      .get();

    const responses = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      submittedAt: doc.data().submittedAt?.toDate?.()?.toISOString(),
    }));

    res.json({ responses, total: responses.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
