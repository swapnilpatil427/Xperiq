const express = require('express');
const { db } = require('../lib/admin');
const router = express.Router();

// Fetch a survey by publishToken — no auth, returns only public fields
router.get('/surveys/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const snap = await db
      .collectionGroup('surveys')
      .where('publishToken', '==', token)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: 'Survey not found or not active' });
    }

    const doc  = snap.docs[0];
    const data = doc.data();

    res.json({
      survey: {
        id:          doc.id,
        title:       data.title,
        description: data.description || null,
        questions: (data.questions || []).map((q) => ({
          id:       q.id,
          type:     q.type,
          question: q.question,
          options:  q.options || undefined,
          required: q.required ?? true,
        })),
      },
    });
  } catch (err) {
    console.error('Public survey fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load survey' });
  }
});

module.exports = router;
