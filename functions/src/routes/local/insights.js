const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const db = require('../../lib/db');
const router = express.Router();

router.get('/:surveyId/insights', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM insights
       WHERE survey_id = $1 AND org_id = $2
       ORDER BY generated_at DESC
       LIMIT 1`,
      [req.params.surveyId, req.orgId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No insights yet — run analysis first.' });
    }
    res.json({ insights: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
