const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { validate } = require('../../lib/validate');
const { submitResponseSchema } = require('../../schemas/responses');
const { responseSubmitLimiter } = require('../../middleware/rateLimiter');
const db = require('../../lib/db');
const { maybeAutoAnalyze } = require('../../triggers/autoAnalyze');
const { responsesSubmitted } = require('../../lib/metrics');
const { publishResponseEvent } = require('../../lib/redisStream');
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

// ── Device / metadata helpers (no external packages) ─────────────────────────

function _getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || null;
}

function _parseDevice(ua) {
  if (!ua) return { device_type: null, browser: null, os: null };
  const s = ua.toLowerCase();

  let device_type = 'desktop';
  if (/\b(tablet|ipad)\b/.test(s))                         device_type = 'tablet';
  else if (/\b(mobile|android|iphone|ipod|blackberry|windows phone)\b/.test(s)) device_type = 'mobile';
  else if (/\bbot|crawl|spider|slurp|facebookexternalhit\b/.test(s)) device_type = 'bot';

  let browser = 'Other';
  if (/edg\//.test(s))          browser = 'Edge';
  else if (/opr\/|opera/.test(s)) browser = 'Opera';
  else if (/chrome\//.test(s))  browser = 'Chrome';
  else if (/firefox\//.test(s)) browser = 'Firefox';
  else if (/safari\//.test(s))  browser = 'Safari';

  let os = 'Other';
  if (/windows nt/.test(s))    os = 'Windows';
  else if (/mac os x/.test(s)) os = 'macOS';
  else if (/android/.test(s))  os = 'Android';
  else if (/iphone|ipad|ipod/.test(s)) os = 'iOS';
  else if (/linux/.test(s))    os = 'Linux';

  return { device_type, browser, os };
}

router.post('/:surveyId/responses', responseSubmitLimiter, validate(submitResponseSchema), async (req, res) => {
  try {
    const { surveyId } = req.params;
    const { answers, publishToken, started_at } = req.body;

    const { rows: [survey] } = await db.query(
      `SELECT id, org_id FROM surveys WHERE id = $1 AND publish_token = $2 AND status = 'active'`,
      [surveyId, publishToken]
    );
    if (!survey) return res.status(404).json({ error: 'Survey not found or not active' });

    const npsAnswer = answers.find((a) => a.type === 'nps');
    const npsScore  = npsAnswer ? parseInt(npsAnswer.value, 10) : null;

    // ── Capture submission metadata ───────────────────────────────────────────
    const ip        = _getIp(req);
    const userAgent = req.headers['user-agent'] || null;
    const country   = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || null;
    const city      = req.headers['cf-ipcity']    || null;
    const referrer  = (req.headers['referer'] || req.headers['referrer'] || null);
    const { device_type, browser, os } = _parseDevice(userAgent);
    const completionTimeS = started_at
      ? Math.max(0, Math.round((Date.now() - new Date(started_at).getTime()) / 1000))
      : null;

    const { rows: [response] } = await db.query(
      `INSERT INTO responses
         (survey_id, org_id, answers, nps_score,
          ip_address, user_agent, country, city, device_type, browser, os, referrer, completion_time_s)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        survey.id, survey.org_id, JSON.stringify(answers), npsScore,
        ip, userAgent, country, city, device_type, browser, os, referrer, completionTimeS,
      ]
    );

    responsesSubmitted.inc();

    if (process.env.REDIS_URL) {
      publishResponseEvent({ surveyId: survey.id, orgId: survey.org_id, responseId: response.id })
        .catch(() => {});
    } else {
      maybeAutoAnalyze(survey.id, survey.org_id).catch(() => {});
    }

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
