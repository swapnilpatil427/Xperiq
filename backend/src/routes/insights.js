const express = require('express');
const { db } = require('../lib/admin');
const { requireAuth } = require('../middleware/auth');
const router = express.Router({ mergeParams: true });

// Get latest insights for a survey
router.get('/', requireAuth, async (req, res) => {
  try {
    const { surveyId } = req.params;
    const snap = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(surveyId)
      .collection('insights')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: 'No insights yet. Run analysis first.' });
    }

    const doc = snap.docs[0];
    res.json({
      insights: {
        id: doc.id,
        ...doc.data(),
        generatedAt: doc.data().generatedAt?.toDate?.()?.toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
