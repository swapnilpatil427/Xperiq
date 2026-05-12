const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const db = require('../../lib/db');
const { maybeAutoAnalyze } = require('../../triggers/autoAnalyze');
const { responsesSubmitted } = require('../../lib/metrics');
const router = express.Router();

// Submit response — public (no auth)
router.post('/:surveyId/responses', async (req, res) => {
  try {
    const { surveyId } = req.params;
    const { answers, publishToken } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers array is required' });
    }

    const { rows: [survey] } = await db.query(
      `SELECT id, org_id FROM surveys WHERE id = $1 AND publish_token = $2 AND status = 'active'`,
      [surveyId, publishToken]
    );
    if (!survey) return res.status(404).json({ error: 'Survey not found or not active' });

    const npsAnswer = answers.find((a) => a.type === 'nps');
    const npsScore  = npsAnswer ? parseInt(npsAnswer.value, 10) : null;

    const { rows: [response] } = await db.query(
      `INSERT INTO responses (survey_id, org_id, answers, nps_score)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [survey.id, survey.org_id, JSON.stringify(answers), npsScore]
    );

    responsesSubmitted.inc();
    maybeAutoAnalyze(survey.id, survey.org_id).catch(() => {});

    res.status(201).json({ success: true, id: response.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get responses — authenticated
router.get('/:surveyId/responses', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM responses
       WHERE survey_id = $1 AND org_id = $2
       ORDER BY submitted_at DESC
       LIMIT 100`,
      [req.params.surveyId, req.orgId]
    );
    res.json({ responses: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
