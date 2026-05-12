const express = require('express');
const db = require('../../lib/db');
const router = express.Router();

router.get('/surveys/:token', async (req, res) => {
  try {
    const { rows: [survey] } = await db.query(
      `SELECT id, title, description, questions
       FROM surveys WHERE publish_token = $1 AND status = 'active' LIMIT 1`,
      [req.params.token]
    );
    if (!survey) return res.status(404).json({ error: 'Survey not found or not active' });

    res.json({
      survey: {
        id:          survey.id,
        title:       survey.title,
        description: survey.description || null,
        questions: (survey.questions || []).map((q) => ({
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
