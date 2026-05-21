const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { submitResponseSchema } = require('../schemas/responses');
const { responseSubmitLimiter } = require('../middleware/rateLimiter');
const db = require('../lib/db');
const { serverError } = require('../lib/httpError');
const { maybeAutoAnalyze } = require('../triggers/autoAnalyze');
const { responsesSubmitted } = require('../lib/metrics');
const { publishResponseEvent } = require('../lib/redisStream');
const { triggerInsightGeneration } = require('../lib/agentsClient');
const logger = require('../lib/logger');
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
ensureIndexes().catch(err => logger.error({ err: err.message }, 'responses:ensureIndexes failed'));

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
  const { surveyId } = req.params;
  const { answers, publishToken, started_at } = req.body;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the survey row for the duration of the transaction so concurrent submissions
    // can't both pass the max_responses check and both insert.
    const { rows: [survey] } = await client.query(
      `SELECT id, org_id, max_responses, auto_close_at, allow_multiple_responses
       FROM surveys
       WHERE id = $1 AND publish_token = $2 AND status = 'active'
       FOR UPDATE`,
      [surveyId, publishToken]
    );
    if (!survey) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Survey not found or not active' });
    }

    // Check auto_close_at
    if (survey.auto_close_at && new Date(survey.auto_close_at) < new Date()) {
      await client.query(`UPDATE surveys SET status='closed', closed_at=NOW() WHERE id=$1`, [survey.id]);
      await client.query('COMMIT');
      return res.status(410).json({ error: 'This survey has closed.' });
    }

    // Check max_responses — count inside the same transaction so the lock is honoured
    if (survey.max_responses) {
      const { rows: [{ count }] } = await client.query(
        'SELECT COUNT(*)::int AS count FROM responses WHERE survey_id = $1',
        [surveyId]
      );
      if (count >= survey.max_responses) {
        await client.query(`UPDATE surveys SET status='closed', closed_at=NOW() WHERE id=$1`, [survey.id]);
        await client.query('COMMIT');
        return res.status(410).json({ error: 'This survey has reached its response limit.' });
      }
    }

    const npsAnswer = answers.find((a) => a.type === 'nps');
    const npsScore  = npsAnswer ? parseInt(npsAnswer.value, 10) : null;

    const ip        = _getIp(req);
    const userAgent = req.headers['user-agent'] || null;
    const country   = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || null;
    const city      = req.headers['cf-ipcity']    || null;
    const referrer  = (req.headers['referer'] || req.headers['referrer'] || null);
    const { device_type, browser, os } = _parseDevice(userAgent);
    const completionTimeS = started_at
      ? Math.max(0, Math.round((Date.now() - new Date(started_at).getTime()) / 1000))
      : null;

    const { rows: [response] } = await client.query(
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

    await client.query('COMMIT');
    responsesSubmitted.inc();

    if (process.env.REDIS_URL) {
      publishResponseEvent({ surveyId: survey.id, orgId: survey.org_id, responseId: response.id })
        .catch(() => {});
    } else {
      maybeAutoAnalyze(survey.id, survey.org_id).catch(() => {});
    }

    res.status(201).json({ success: true, id: response.id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    serverError(res, err, { route: 'POST /surveys/:surveyId/responses' });
  } finally {
    client.release();
  }
});

// ── POST /:surveyId/responses/bulk ─────────────────────────────────────────────
// Authenticated endpoint for importing multiple responses at once.
// Inserts all rows in a single DB transaction, then triggers insight generation once.
// Body: { responses: [{ answers, nps_score?, started_at? }] }
// Returns: { inserted, skipped, run_id }

router.post('/:surveyId/responses/bulk', requireAuth, async (req, res) => {
  try {
    const { surveyId } = req.params;
    const incoming = req.body.responses;

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ error: '`responses` must be a non-empty array' });
    }
    if (incoming.length > 5000) {
      return res.status(400).json({ error: 'Maximum 5000 responses per bulk import' });
    }

    const { rows: [survey] } = await db.query(
      `SELECT id, org_id FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [surveyId, req.orgId],
    );
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const client = await db.pool.connect();
    let inserted = 0;
    let skipped  = 0;
    try {
      await client.query('BEGIN');
      for (const item of incoming) {
        const { answers, nps_score, started_at } = item;
        if (!Array.isArray(answers)) { skipped++; continue; }

        const npsAnswer = answers.find(a => a.type === 'nps');
        const npsScore  = nps_score != null ? parseInt(nps_score, 10) : (npsAnswer ? parseInt(npsAnswer.value, 10) : null);
        const completionTimeS = started_at
          ? Math.max(0, Math.round((Date.now() - new Date(started_at).getTime()) / 1000))
          : null;

        await client.query(
          `INSERT INTO responses (survey_id, org_id, answers, nps_score, completion_time_s)
           VALUES ($1, $2, $3, $4, $5)`,
          [survey.id, survey.org_id, JSON.stringify(answers), npsScore, completionTimeS],
        );
        inserted++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    responsesSubmitted.inc(inserted);

    // Trigger insight generation once for the whole batch.
    // Abandon any stale run first (same logic as POST /api/insights/:id/generate?force=true).
    let runId = null;
    try {
      await db.query(
        `UPDATE agent_runs SET status='cancelled', completed_at=NOW()
         WHERE survey_id=$1 AND org_id=$2 AND run_type='insight_generation'
           AND status='running'`,
        [surveyId, survey.org_id],
      );
      const threadId = `insight:${survey.org_id}:${surveyId}:bulk:${Date.now()}`;
      const { rows } = await db.query(
        `INSERT INTO agent_runs
           (org_id, user_id, thread_id, run_type, status, intent, survey_id)
         VALUES ($1,$2,$3,'insight_generation','running','insight:bulk_import',$4)
         RETURNING id`,
        [survey.org_id, req.userId, threadId, surveyId],
      );
      runId = rows[0].id;
      triggerInsightGeneration({ surveyId, orgId: survey.org_id, runId, trigger: 'bulk_import' })
        .catch(() => {
          db.query("UPDATE agent_runs SET status='failed', completed_at=NOW() WHERE id=$1", [runId]).catch(() => {});
        });
    } catch (_) {
      // Insight trigger is best-effort — bulk insert already succeeded
    }

    res.status(201).json({ inserted, skipped, run_id: runId });
  } catch (err) {    serverError(res, err);
  }
});

// ── Get responses — authenticated, paginated with search/filter ──────────────
// Query params: ?limit=50&offset=0&search=text&sentiment=positive&nps_min=0&nps_max=10&date_from=...&date_to=...
router.get('/:surveyId/responses', requireAuth, async (req, res) => {
  try {
    const limit   = Math.min(Math.max(1, parseInt(req.query.limit  || DEFAULT_PAGE_SIZE, 10)), MAX_PAGE_SIZE);
    const offset  = Math.max(0, parseInt(req.query.offset || '0', 10));
    const search    = (req.query.search    || '').trim();
    const sentiment = (req.query.sentiment || '').trim();
    const emotion   = (req.query.emotion   || '').trim();
    const npsMin    = req.query.nps_min !== undefined ? parseInt(req.query.nps_min, 10) : null;
    const npsMax    = req.query.nps_max !== undefined ? parseInt(req.query.nps_max, 10) : null;
    const dateFrom  = (req.query.date_from || '').trim();
    const dateTo    = (req.query.date_to   || '').trim();

    // Build parameterized WHERE — shared by count and data queries
    const filterParams = [req.params.surveyId, req.orgId];
    let where = 'WHERE survey_id = $1 AND org_id = $2';

    if (search) {
      filterParams.push(`%${search}%`);
      where += ` AND answers::text ILIKE $${filterParams.length}`;
    }
    if (sentiment) {
      filterParams.push(sentiment);
      where += ` AND ai_sentiment = $${filterParams.length}`;
    }
    if (emotion) {
      filterParams.push(emotion);
      where += ` AND ai_emotion = $${filterParams.length}`;
    }
    if (npsMin !== null && !isNaN(npsMin)) {
      filterParams.push(npsMin);
      where += ` AND nps_score >= $${filterParams.length}`;
    }
    if (npsMax !== null && !isNaN(npsMax)) {
      filterParams.push(npsMax);
      where += ` AND nps_score <= $${filterParams.length}`;
    }
    if (dateFrom) {
      filterParams.push(dateFrom);
      where += ` AND submitted_at >= $${filterParams.length}`;
    }
    if (dateTo) {
      filterParams.push(dateTo);
      where += ` AND submitted_at <= $${filterParams.length}`;
    }

    const limitIdx  = filterParams.length + 1;
    const offsetIdx = filterParams.length + 2;

    const [countRes, rowsRes] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS total FROM responses ${where}`,
        filterParams
      ),
      db.query(
        `SELECT * FROM responses ${where} ORDER BY submitted_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...filterParams, limit, offset]
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
    serverError(res, err);
  }
});

module.exports = router;
