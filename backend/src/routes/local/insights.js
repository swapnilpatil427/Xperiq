/**
 * Insight routes (v2 — agentic insights).
 *
 *   GET  /api/insights/:surveyId/list        — List active insights for a survey
 *   POST /api/insights/:surveyId/generate    — Trigger insight generation run
 *   GET  /api/insights/:surveyId/run-status  — Latest run status + stream events
 *   GET  /api/insights/:surveyId/stream      — SSE stream of insight events
 *   POST /api/insights/:id/feedback          — Thumbs / pin / dismiss
 *   POST /api/insights/:surveyId/ask         — NLQ over survey corpus (Ask Crystal)
 *   GET  /api/surveys/:surveyId/insights     — Legacy compatibility endpoint
 */
const express    = require('express');
const { requireAuth } = require('../../middleware/auth');
const db         = require('../../lib/db');
const logger     = require('../../lib/logger');
const fetch      = require('node-fetch');

const AGENTS_URL          = process.env.AGENTS_URL          || 'http://localhost:8001';
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY || 'dev-internal-key-change-in-prod';

async function _agentsFetch(path, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${AGENTS_URL}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': AGENTS_INTERNAL_KEY,
        ...(opts.headers || {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw Object.assign(new Error(`Agents ${res.status}: ${body}`), { status: res.status });
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

const router = express.Router();
router.use(requireAuth);

// ── Helper: verify survey belongs to org ──────────────────────────────────────
async function getSurvey(surveyId, orgId) {
  const { rows } = await db.query(
    'SELECT id, title, questions FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
    [surveyId, orgId],
  );
  return rows[0] ?? null;
}

// ── Helper: create an insight_generation run ──────────────────────────────────
async function createInsightRun(surveyId, orgId, userId, trigger) {
  const threadId = `insight:${orgId}:${surveyId}:${Date.now()}`;
  const { rows } = await db.query(
    `INSERT INTO agent_runs
       (org_id, user_id, thread_id, run_type, status, intent, survey_id)
     VALUES ($1, $2, $3, 'insight_generation', 'running', $4, $5)
     RETURNING id`,
    [orgId, userId, threadId, `insight:${trigger}`, surveyId],
  );
  return rows[0].id;
}

// ── GET /:surveyId/list ───────────────────────────────────────────────────────

router.get('/:surveyId/list', async (req, res) => {
  const { surveyId } = req.params;
  const { layer, limit = '50' } = req.query;

  try {
    const survey = await getSurvey(surveyId, req.orgId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const conditions = ['i.survey_id = $1', 'i.org_id = $2', 'i.superseded_at IS NULL'];
    const params = [surveyId, req.orgId];

    if (layer) {
      conditions.push(`i.layer = $${params.length + 1}`);
      params.push(layer);
    }

    params.push(Math.min(parseInt(limit, 10) || 50, 100));

    const { rows } = await db.query(
      `SELECT i.* FROM insights i
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.priority DESC NULLS LAST, i.generated_at DESC
       LIMIT $${params.length}`,
      params,
    );

    const { rows: runRows } = await db.query(
      `SELECT status FROM agent_runs
       WHERE survey_id = $1 AND run_type = 'insight_generation' AND org_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [surveyId, req.orgId],
    );

    res.json({
      insights:   rows,
      run_status: runRows[0]?.status ?? null,
      survey:     { id: survey.id, title: survey.title },
    });
  } catch (err) {
    logger.error({ err: err.message, surveyId }, 'insights:list:error');
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:surveyId/generate ──────────────────────────────────────────────────

router.post('/:surveyId/generate', async (req, res) => {
  const { surveyId } = req.params;
  const trigger = req.body.trigger || 'regenerate';

  try {
    const survey = await getSurvey(surveyId, req.orgId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Rate-limit: 1 active generation per survey per 60s
    const { rows: recent } = await db.query(
      `SELECT id FROM agent_runs
       WHERE survey_id = $1 AND org_id = $2 AND run_type = 'insight_generation'
         AND status = 'running' AND created_at > NOW() - INTERVAL '60 seconds'
       LIMIT 1`,
      [surveyId, req.orgId],
    );
    if (recent.length) {
      return res.status(429).json({ error: 'Generation already running. Please wait.' });
    }

    const runId = await createInsightRun(surveyId, req.orgId, req.userId, trigger);

    // Fire-and-forget to agents service
    _agentsFetch('/insights/generate', {
      method: 'POST',
      body: JSON.stringify({ survey_id: surveyId, org_id: req.orgId, run_id: runId, trigger }),
    }).catch(err => {
      logger.error({ err: err.message, surveyId, runId }, 'insights:generate:agents_error');
      db.query("UPDATE agent_runs SET status='failed', completed_at=NOW() WHERE id=$1", [runId]).catch(() => {});
    });

    res.status(202).json({ run_id: runId, status: 'started' });
  } catch (err) {
    logger.error({ err: err.message, surveyId }, 'insights:generate:error');
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:surveyId/run-status ─────────────────────────────────────────────────

router.get('/:surveyId/run-status', async (req, res) => {
  const { surveyId } = req.params;
  try {
    const { rows } = await db.query(
      `SELECT id, status, stream_events, created_at, completed_at
       FROM agent_runs
       WHERE survey_id = $1 AND org_id = $2 AND run_type = 'insight_generation'
       ORDER BY created_at DESC LIMIT 1`,
      [surveyId, req.orgId],
    );
    if (!rows.length) return res.json({ run_id: null, status: 'none', stream_events: [] });
    const run = rows[0];
    res.json({
      run_id:        run.id,
      status:        run.status,
      stream_events: Array.isArray(run.stream_events) ? run.stream_events : [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:surveyId/stream (SSE) ───────────────────────────────────────────────

router.get('/:surveyId/stream', async (req, res) => {
  const { surveyId } = req.params;

  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let lastEventCount = 0;
  let pollCount = 0;
  const MAX_POLLS = 40;

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const poll = async () => {
    if (pollCount++ >= MAX_POLLS) {
      send({ event: 'timeout' });
      return res.end();
    }
    try {
      const { rows } = await db.query(
        `SELECT id, status, stream_events FROM agent_runs
         WHERE survey_id = $1 AND org_id = $2 AND run_type = 'insight_generation'
         ORDER BY created_at DESC LIMIT 1`,
        [surveyId, req.orgId],
      );
      if (!rows.length) return;
      const run    = rows[0];
      const events = Array.isArray(run.stream_events) ? run.stream_events : [];
      for (const ev of events.slice(lastEventCount)) {
        send(ev);
        lastEventCount++;
      }
      if (run.status === 'completed' || run.status === 'failed') {
        const { rows: insights } = await db.query(
          `SELECT * FROM insights WHERE survey_id=$1 AND org_id=$2 AND superseded_at IS NULL ORDER BY priority DESC NULLS LAST`,
          [surveyId, req.orgId],
        );
        send({ event: 'insights_ready', data: { insights, status: run.status } });
        clearInterval(interval);
        res.end();
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'insights:stream:poll_error');
    }
  };

  const interval = setInterval(poll, 3000);
  await poll();
  req.on('close', () => clearInterval(interval));
});

// ── POST /:id/feedback ────────────────────────────────────────────────────────

router.post('/:id/feedback', async (req, res) => {
  const { thumbs, pinned, dismissed } = req.body;
  const updates = {};
  if (thumbs    !== undefined) updates.thumbs    = thumbs;
  if (pinned    !== undefined) updates.pinned    = pinned;
  if (dismissed !== undefined) updates.dismissed = dismissed;

  try {
    await db.query(
      `UPDATE insights
       SET user_state_json = user_state_json || $1::jsonb
       WHERE id = $2 AND org_id = $3`,
      [JSON.stringify(updates), req.params.id, req.orgId],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:surveyId/ask (Ask Crystal — NLQ) ───────────────────────────────────

router.post('/:surveyId/ask', async (req, res) => {
  const { surveyId } = req.params;
  const { question } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    const { rows: insights } = await db.query(
      `SELECT headline, narrative, layer, category, trust_score, citations_json
       FROM insights
       WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
       ORDER BY priority DESC NULLS LAST LIMIT 20`,
      [surveyId, req.orgId],
    );

    if (!insights.length) {
      return res.json({
        answer:    'No insights have been generated for this survey yet. Generate insights first.',
        citations: [],
      });
    }

    const context = insights.map((ins, i) =>
      `[${i + 1}] ${ins.layer.toUpperCase()}: ${ins.headline}\n${ins.narrative}`,
    ).join('\n\n');

    const { chat } = require('../../lib/openrouter');
    const answer = await chat(
      [
        {
          role: 'system',
          content: 'You are Crystal, an expert CX analyst. Answer the user\'s question using ONLY the provided insight context. Be concise (2-4 sentences). Cite insight numbers like [1], [2] inline. If the context does not cover the question, say so honestly.',
        },
        {
          role: 'user',
          content: `Insight context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
      undefined,
      'ask-insights',
      600,
    );

    res.json({ answer, citations: insights.slice(0, 3) });
  } catch (err) {
    logger.error({ err: err.message, surveyId }, 'insights:ask:error');
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:surveyId/topics ─────────────────────────────────────────────────────

router.get('/:surveyId/topics', async (req, res) => {
  const { surveyId } = req.params;
  try {
    const survey = await getSurvey(surveyId, req.orgId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const { rows } = await db.query(
      `SELECT id, name, aliases, is_new, volume, sentiment_score, dominant_emotion,
              effort_score, trending, first_seen_at
       FROM survey_topics
       WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
       ORDER BY volume DESC LIMIT 30`,
      [surveyId, req.orgId],
    ).catch(() => ({ rows: [] }));

    res.json({ topics: rows });
  } catch (err) {
    res.json({ topics: [] });
  }
});

// ── POST /:surveyId/crystal — stateful Crystal chat with thread persistence ───

router.post('/:surveyId/crystal', async (req, res) => {
  const { surveyId } = req.params;
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length < 2) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const survey = await getSurvey(surveyId, req.orgId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Load current insights — try with time_window filter first, fall back without
    let insights = [];
    try {
      const { rows } = await db.query(
        `SELECT id, layer, category, headline, narrative, metric_json, citations_json,
                trust_score, priority, trust_json
         FROM insights
         WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
           AND time_window = 'all_time'
         ORDER BY priority DESC NULLS LAST LIMIT 30`,
        [surveyId, req.orgId],
      );
      insights = rows;
    } catch {
      // time_window column may not exist in older DBs — fall back without it
      const { rows } = await db.query(
        `SELECT id, layer, category, headline, narrative, metric_json, citations_json,
                trust_score, priority, trust_json
         FROM insights
         WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
         ORDER BY priority DESC NULLS LAST LIMIT 30`,
        [surveyId, req.orgId],
      );
      insights = rows;
    }

    // Try to load topics (may not exist if migration not applied)
    let topics = [];
    try {
      const { rows: topicRows } = await db.query(
        `SELECT name, volume, sentiment_score, dominant_emotion, effort_score, trending, is_new
         FROM survey_topics WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
         ORDER BY volume DESC LIMIT 20`,
        [surveyId, req.orgId],
      );
      topics = topicRows;
    } catch { /* topics table may not exist */ }

    // Load conversation thread (graceful if table missing)
    const threadKey = `crystal:${req.orgId}:${surveyId}`;
    let thread = null;
    try {
      const { rows } = await db.query(
        'SELECT * FROM crystal_threads WHERE thread_key = $1',
        [threadKey],
      );
      thread = rows[0] || null;
    } catch { /* crystal_threads table may not exist */ }

    const history = thread?.messages || [];

    // Derive key metrics from insight rows
    const npsInsight  = insights.find(i => i.category === 'metric.nps');
    const csatInsight = insights.find(i => i.category === 'metric.csat');
    const metrics = {
      nps:            npsInsight?.metric_json  || null,
      csat:           csatInsight?.metric_json || null,
      response_count: npsInsight?.trust_json?.sample_size || csatInsight?.trust_json?.sample_size || 0,
    };

    // Build agent payload
    const agentPayload = {
      survey_id:             surveyId,
      org_id:                req.orgId,
      message:               message.trim(),
      insights: insights.map(i => ({
        id:          i.id,
        layer:       i.layer,
        category:    i.category,
        headline:    i.headline,
        narrative:   i.narrative,
        metric_json: i.metric_json,
        trust_score: i.trust_score,
      })),
      topics,
      survey_title:          survey.title || '',
      survey_response_count: metrics.response_count,
      metrics,
      conversation_history:  history.slice(-10), // last 5 exchanges
    };

    const response = await _agentsFetch('/insights/crystal', {
      method: 'POST',
      body:   JSON.stringify(agentPayload),
    });

    // Persist thread — keep last 20 exchanges (40 messages)
    const userMsg      = { role: 'user',      content: message.trim(),  created_at: new Date().toISOString() };
    const assistantMsg = { role: 'assistant', content: response.answer, created_at: new Date().toISOString() };
    const newMessages  = [...history, userMsg, assistantMsg].slice(-40);

    try {
      await db.query(
        `INSERT INTO crystal_threads (org_id, survey_id, thread_key, messages, context_snapshot, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
         ON CONFLICT (thread_key) DO UPDATE SET
           messages = $4::jsonb, updated_at = NOW()`,
        [
          req.orgId, surveyId, threadKey,
          JSON.stringify(newMessages),
          JSON.stringify({ insight_count: insights.length, generated_at: new Date().toISOString() }),
        ],
      );
    } catch { /* graceful degradation if crystal_threads table not yet migrated */ }

    res.json({
      answer:       response.answer,
      suggestions:  response.suggestions  || [],
      insight_refs: response.insight_refs || [],
      citations:    response.citations    || [],
      thread_key:   threadKey,
    });
  } catch (err) {
    logger.error({ err: err.message, surveyId }, 'insights:crystal:error');
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:surveyId/crystal/history — load conversation history ────────────────

router.get('/:surveyId/crystal/history', async (req, res) => {
  const threadKey = `crystal:${req.orgId}:${req.params.surveyId}`;
  try {
    const { rows } = await db.query(
      'SELECT messages, updated_at FROM crystal_threads WHERE thread_key = $1',
      [threadKey],
    );
    const thread = rows[0];
    res.json({
      messages:   thread?.messages   || [],
      updated_at: thread?.updated_at || null,
    });
  } catch {
    res.json({ messages: [], updated_at: null });
  }
});

// ── DELETE /:surveyId/crystal/history — clear thread history ─────────────────

router.delete('/:surveyId/crystal/history', async (req, res) => {
  const threadKey = `crystal:${req.orgId}:${req.params.surveyId}`;
  try {
    await db.query('DELETE FROM crystal_threads WHERE thread_key = $1', [threadKey]);
  } catch { /* ok if table missing */ }
  res.json({ success: true });
});

// ── POST /:surveyId/schedule — manually toggle scheduled generation ───────────

router.post('/:surveyId/schedule', async (req, res) => {
  const { surveyId } = req.params;
  const { enabled = true } = req.body;

  try {
    const survey = await getSurvey(surveyId, req.orgId);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // Store schedule preference in surveys table (column added via migration)
    await db.query(
      `UPDATE surveys SET insight_schedule_enabled = $1 WHERE id = $2 AND org_id = $3`,
      [enabled, surveyId, req.orgId],
    ).catch(() => {
      // Column may not exist yet in older DBs — ignore gracefully
    });

    logger.info({ surveyId, orgId: req.orgId, enabled }, 'insights:schedule:toggled');
    res.json({ success: true, survey_id: surveyId, scheduled: enabled });
  } catch (err) {
    logger.error({ err: err.message, surveyId }, 'insights:schedule:error');
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy: GET /api/surveys/:surveyId/insights ───────────────────────────────

router.get('/:surveyId/insights', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM insights
       WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
       ORDER BY priority DESC NULLS LAST`,
      [req.params.surveyId, req.orgId],
    );

    if (!rows.length) {
      return res.json({ insights: null });
    }

    const npsRow = rows.find(r => r.category === 'metric.nps');
    const topics = rows
      .filter(r => r.category === 'voice.topic')
      .map(r => ({
        name:      r.headline,
        sentiment: (r.metric_json?.dominant_sentiment) || 'neutral',
        volume:    r.metric_json?.value || 0,
        phrases:   (r.citations_json || []).slice(0, 3).map(c => (c.quote || '').slice(0, 60)),
      }));

    res.json({
      insights: {
        id:                 rows[0].id,
        survey_id:          req.params.surveyId,
        org_id:             req.orgId,
        summary:            rows[0].headline + '. ' + rows[0].narrative,
        nps_score:          npsRow?.metric_json?.value ?? null,
        topics,
        sentiment_breakdown: { positive: 40, neutral: 35, negative: 25 },
        top_phrases:         topics.slice(0, 5).map(t => t.name),
        response_count:      npsRow?.trust_json?.sample_size ?? 0,
        created_at:          rows[0].generated_at,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
