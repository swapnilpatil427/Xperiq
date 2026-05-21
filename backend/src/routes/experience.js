/**
 * Experience Intelligence routes — org portfolio, survey deep-dive, topics, trends
 *
 *   GET  /api/experience/org/overview       — Org portfolio summary
 *   POST /api/experience/:scope/crystal/stream — Crystal SSE streaming
 *   GET  /api/experience/:id/topics/signals  — Topic analysis hub
 *   GET  /api/experience/:id/topics/:topicId — Topic deep dive
 *   GET  /api/experience/:id/trends          — Survey trend analysis
 */
const express       = require('express');
const { requireAuth } = require('../middleware/auth');
const db            = require('../lib/db');
const logger        = require('../lib/logger');
const { serverError, clientError } = require('../lib/httpError');
const fetch         = require('node-fetch');

const AGENTS_URL = process.env.AGENTS_URL || 'http://localhost:8001';
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY
  || (process.env.NODE_ENV !== 'production'
    ? 'dev-internal-key-change-in-prod'
    : (() => { throw new Error('AGENTS_INTERNAL_KEY must be set in production'); })());

const router = express.Router();

// GET /api/experience/org/overview
router.get('/org/overview', requireAuth, async (req, res) => {
  const { orgId } = req;
  try {
    const { rows: surveys } = await db.query(
      `SELECT s.id, s.title, s.status,
              (SELECT COUNT(*)::int FROM responses WHERE survey_id = s.id) AS response_count,
              m.nps AS nps_score, m.csat AS csat_score, m.captured_at as metrics_at
       FROM surveys s
       LEFT JOIN LATERAL (
         SELECT nps, csat, captured_at
         FROM survey_metric_snapshots
         WHERE survey_id = s.id
         ORDER BY captured_at DESC LIMIT 1
       ) m ON true
       WHERE s.org_id = $1 AND s.status = 'active' AND s.deleted_at IS NULL
       ORDER BY response_count DESC NULLS LAST
       LIMIT 20`,
      [orgId]
    );

    const { rows: orgSnap } = await db.query(
      `SELECT avg_nps AS nps_score, avg_csat AS csat_score,
              total_responses AS response_count, active_survey_count AS survey_count,
              captured_at
       FROM org_metric_snapshots
       WHERE org_id = $1
       ORDER BY captured_at DESC LIMIT 1`,
      [orgId]
    ).catch(() => ({ rows: [] }));

    res.json({
      surveys,
      portfolio_metrics: orgSnap[0] || null,
      active_survey_count: surveys.length,
    });
  } catch (err) {
    serverError(res, err, { endpoint: 'org_overview', orgId });
  }
});

// POST /api/experience/:scope/crystal/stream — Crystal SSE proxy
router.post('/:scope/crystal/stream', requireAuth, async (req, res) => {
  const { scope } = req.params;
  const { orgId, userId } = req;
  const body = req.body;

  if (!['survey', 'org'].includes(scope)) {
    return clientError(res, 400, 'invalid_scope');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const agentRes = await fetch(`${AGENTS_URL}/insights/crystal/stream`, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': AGENTS_INTERNAL_KEY,
      },
      body: JSON.stringify({
        ...body,
        org_id:   orgId,
        user_id:  userId,
        scope,
      }),
      signal: controller.signal,
    });

    if (!agentRes.ok) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Agent service error' })}\n\n`);
      return res.end();
    }

    for await (const chunk of agentRes.body) {
      if (res.writableEnded) break;
      res.write(chunk);
    }
  } catch (err) {
    if (err.name !== 'AbortError' && !res.writableEnded) {
      logger.error({ err: err.message }, 'crystal_stream_proxy_error');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// GET /api/experience/:id/topics/signals
router.get('/:id/topics/signals', requireAuth, async (req, res) => {
  const { id: surveyId } = req.params;
  const { orgId } = req;
  try {
    const { rows } = await db.query(
      `SELECT id, name, aliases, volume, sentiment_score, dominant_emotion,
              effort_score, trending, nps_avg, positive_pct, negative_pct,
              first_seen_at, last_seen_at, parent_topic_id, is_new
       FROM survey_topics
       WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
       ORDER BY volume DESC NULLS LAST`,
      [surveyId, orgId]
    );
    res.json({ topics: rows, count: rows.length });
  } catch (err) {
    serverError(res, err, { endpoint: 'topic_signals', surveyId });
  }
});

// GET /api/experience/:id/topics/:topicId
router.get('/:id/topics/:topicId', requireAuth, async (req, res) => {
  const { id: surveyId, topicId } = req.params;
  const { orgId } = req;
  try {
    const { rows: topicRows } = await db.query(
      `SELECT * FROM survey_topics
       WHERE id = $1 AND survey_id = $2 AND org_id = $3`,
      [topicId, surveyId, orgId]
    );
    if (!topicRows.length) return clientError(res, 404, 'topic_not_found');

    // Get verbatims
    const topicName = topicRows[0].name;
    const { rows: verbatims } = await db.query(
      `SELECT answers, ai_sentiment, ai_sentiment_score, submitted_at
       FROM responses
       WHERE survey_id = $1 AND ai_topics::text ILIKE $2
       ORDER BY submitted_at DESC LIMIT 15`,
      [surveyId, `%${topicName}%`]
    ).catch(() => ({ rows: [] }));

    res.json({
      topic: topicRows[0],
      verbatims: verbatims.map(r => ({
        answers: r.answers,
        sentiment: r.ai_sentiment,
        score: r.ai_sentiment_score,
        submitted_at: r.submitted_at,
      })),
    });
  } catch (err) {
    serverError(res, err, { endpoint: 'topic_deep_dive', surveyId, topicId });
  }
});

// GET /api/experience/:id/trends
router.get('/:id/trends', requireAuth, async (req, res) => {
  const { id: surveyId } = req.params;
  const { orgId } = req;
  const days = Math.min(parseInt(req.query.days || '90', 10), 365);
  try {
    const { rows: snapshots } = await db.query(
      `SELECT nps AS nps_score, csat AS csat_score, effort_score AS ces_score,
              response_count, captured_at
       FROM survey_metric_snapshots
       WHERE survey_id = $1 AND org_id = $2
         AND captured_at > NOW() - ($3 || ' days')::interval
       ORDER BY captured_at ASC`,
      [surveyId, orgId, days]
    );

    const { rows: checkpoints } = await db.query(
      `SELECT checkpoint_number, response_count_at_checkpoint, nps_at_checkpoint, created_at
       FROM survey_insight_checkpoints
       WHERE survey_id = $1 AND org_id = $2
       ORDER BY created_at ASC`,
      [surveyId, orgId]
    ).catch(() => ({ rows: [] }));

    res.json({ snapshots, checkpoints, days });
  } catch (err) {
    serverError(res, err, { endpoint: 'survey_trends', surveyId });
  }
});

module.exports = router;
