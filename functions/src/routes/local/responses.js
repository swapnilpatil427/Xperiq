const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { responseSubmitLimiter } = require('../../middleware/rateLimiter');
const db = require('../../lib/db');
const { maybeAutoAnalyze } = require('../../triggers/autoAnalyze');
const { responsesSubmitted } = require('../../lib/metrics');
const router = express.Router();

// Pagination defaults — adjust here if org-level settings are added later.
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

// Ensure a composite index exists for efficient paginated queries.
// Runs once on startup; safe to call repeatedly (IF NOT EXISTS).
async function ensureIndexes() {
  await db.query(`
    CREATE INDEX IF NOT EXISTS responses_survey_submitted
      ON responses (survey_id, submitted_at DESC)
  `).catch(() => {});
}
ensureIndexes().catch(console.error);

// ── Submit response — public, rate-limited ────────────────────────────────────
router.post('/:surveyId/responses', responseSubmitLimiter, async (req, res) => {
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

// ── Get responses — authenticated, paginated ──────────────────────────────────
// Query params: ?limit=50&offset=0
// Returns: { responses, total, limit, offset, hasMore }
router.get('/:surveyId/responses', requireAuth, async (req, res) => {
  try {
    const limit  = Math.min(Math.max(1, parseInt(req.query.limit  || DEFAULT_PAGE_SIZE, 10)), MAX_PAGE_SIZE);
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));

    const [countRes, rowsRes] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS total
         FROM responses
         WHERE survey_id = $1 AND org_id = $2`,
        [req.params.surveyId, req.orgId]
      ),
      db.query(
        `SELECT *
         FROM responses
         WHERE survey_id = $1 AND org_id = $2
         ORDER BY submitted_at DESC
         LIMIT $3 OFFSET $4`,
        [req.params.surveyId, req.orgId, limit, offset]
      ),
    ]);

    const total = countRes.rows[0].total;
    res.json({
      responses: rowsRes.rows,
      total,
      limit,
      offset,
      hasMore: offset + rowsRes.rows.length < total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
