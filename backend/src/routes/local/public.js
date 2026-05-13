const express = require('express');
const db = require('../../lib/db');
const router = express.Router();

router.get('/surveys/:token', async (req, res) => {
  try {
    const { rows: [survey] } = await db.query(
      `SELECT id, title, description, questions, thank_you_message, status
       FROM surveys WHERE publish_token = $1 LIMIT 1`,
      [req.params.token]
    );
    if (!survey) return res.status(404).json({ error: 'survey_not_found' });

    if (survey.status !== 'active') {
      const code = survey.status === 'closed' ? 'survey_closed'
                 : survey.status === 'paused' ? 'survey_paused'
                 : 'survey_not_active';
      return res.status(403).json({ error: code });
    }

    res.json({
      survey: {
        id:                survey.id,
        title:             survey.title,
        description:       survey.description || null,
        thank_you_message: survey.thank_you_message || null,
        questions:         (survey.questions || []),
      },
    });
  } catch (err) {
    console.error('Public survey fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load survey' });
  }
});

module.exports = router;
