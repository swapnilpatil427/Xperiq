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

// ── Crystal context loader ───────────────────────────────────────────────────
// Shared by the REST fallback and any future endpoints.
// scope is derived from whether a survey_id is present — no hardcoding needed.
// New data sources (support tickets, product usage, etc.) can be added here
// by loading additional rows and appending them to insights/topics.
async function loadCrystalContext(surveyId, orgId) {
  // citationMap: insight_id → { headline, survey_title, survey_id, layer, category }
  // Returned alongside context so the frontend can render rich source cards
  // without additional round-trips.
  const ctx = { insights: [], topics: [], metrics: {}, survey_title: '', response_count: 0, citationMap: {} };

  if (surveyId) {
    // ── Survey context ───────────────────────────────────────────────────────
    ctx.scope = 'survey';
    try {
      const { rows: insightRows } = await db.query(
        `SELECT id, layer, category, headline, narrative, metric_json,
                citations_json, trust_score, priority, trust_json
         FROM insights
         WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
         ORDER BY priority DESC NULLS LAST LIMIT 30`,
        [surveyId, orgId],
      );
      // Tag insights with survey_id so agents can include it in system context
      ctx.insights = insightRows.map(i => ({ ...i, survey_id: surveyId }));
      // Build citationMap — include first 3 verbatims and topic_name for response navigation
      insightRows.forEach(i => {
        if (!i.id) return;
        let verbatims = [];
        try {
          const raw = typeof i.citations_json === 'string' ? JSON.parse(i.citations_json) : (i.citations_json || []);
          // Extract topic_name early so verbatims can be tagged with it
          let _topic = null;
          try {
            const mj0 = typeof i.metric_json === 'string' ? JSON.parse(i.metric_json) : (i.metric_json || {});
            _topic = mj0.topic || mj0.theme || mj0.topic_name || null;
          } catch { /* ignore */ }
          verbatims = raw.slice(0, 3).map(v => ({
            response_id: v.response_id || v.id || '',
            quote:       v.quote || '',
            sentiment:   v.sentiment || 'neutral',
            topic:       _topic || null,   // topic this verbatim belongs to
          })).filter(v => v.quote);
        } catch { /* malformed citations_json */ }
        let topic_name = null;
        try {
          const mj = typeof i.metric_json === 'string' ? JSON.parse(i.metric_json) : (i.metric_json || {});
          topic_name = mj.topic || mj.theme || mj.topic_name || null;
        } catch { /* ignore */ }
        ctx.citationMap[i.id] = {
          headline: i.headline, survey_title: ctx.survey_title || '', survey_id: surveyId,
          layer: i.layer, category: i.category, verbatims, topic_name,
        };
      });
    } catch { /* no insights yet */ }

    try {
      const { rows: topicRows } = await db.query(
        `SELECT name, volume, sentiment_score, dominant_emotion, effort_score,
                trending, nps_avg, positive_pct, negative_pct, urgency_score
         FROM survey_topics WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
         ORDER BY volume DESC LIMIT 25`,
        [surveyId, orgId],
      );
      ctx.topics = topicRows;
    } catch { /* no topics yet */ }

    try {
      const { rows: [snap] } = await db.query(
        `SELECT nps, csat FROM survey_metric_snapshots WHERE survey_id = $1 ORDER BY captured_at DESC LIMIT 1`,
        [surveyId],
      );
      if (snap) ctx.metrics = { nps: { score: snap.nps }, csat: { score: snap.csat } };
    } catch { /* no metrics yet */ }

    try {
      const { rows: [s] } = await db.query(
        `SELECT title, (SELECT COUNT(*)::int FROM responses r WHERE r.survey_id = s.id) AS rc FROM surveys s WHERE id = $1`,
        [surveyId],
      );
      if (s) {
        ctx.survey_title = s.title;
        ctx.response_count = s.rc || 0;
        // Backfill survey_title into citationMap now that we have it
        Object.values(ctx.citationMap).forEach(c => { if (c.survey_id === surveyId) c.survey_title = s.title; });
      }
    } catch { /* ignore */ }

  } else {
    // ── Org / portfolio context ──────────────────────────────────────────────
    ctx.scope = 'org';
    const { rows: surveys } = await db.query(
      `SELECT s.id, s.title, (SELECT COUNT(*)::int FROM responses r WHERE r.survey_id = s.id) AS rc,
              m.nps AS nps_score, m.csat AS csat_score
       FROM surveys s
       LEFT JOIN LATERAL (SELECT nps, csat FROM survey_metric_snapshots WHERE survey_id = s.id ORDER BY captured_at DESC LIMIT 1) m ON true
       WHERE s.org_id = $1 AND s.status IN ('active','paused') AND s.deleted_at IS NULL
       ORDER BY rc DESC NULLS LAST LIMIT 8`,
      [orgId],
    ).catch(() => ({ rows: [] }));

    ctx.response_count = surveys.reduce((n, s) => n + (s.rc || 0), 0);

    // Collect latest insights + topics from every active survey
    await Promise.all(surveys.map(async (s) => {
      try {
        const { rows: ins } = await db.query(
          `SELECT id, layer, category, headline, narrative, metric_json, citations_json, trust_score, priority
           FROM insights WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
           ORDER BY CASE layer WHEN 'prescriptive' THEN 0 WHEN 'diagnostic' THEN 1 ELSE 2 END, priority DESC NULLS LAST LIMIT 5`,
          [s.id, orgId],
        );
        ins.forEach(i => {
          ctx.insights.push({ ...i, _survey_title: s.title, survey_id: s.id });
          if (!i.id) return;
          let verbatims = [];
          try {
            let _tn = null;
            try { const mj0 = typeof i.metric_json === 'string' ? JSON.parse(i.metric_json) : (i.metric_json || {}); _tn = mj0.topic || mj0.theme || mj0.topic_name || null; } catch {}
            const raw = typeof i.citations_json === 'string' ? JSON.parse(i.citations_json) : (i.citations_json || []);
            verbatims = raw.slice(0, 3).map(v => ({
              response_id: v.response_id || v.id || '',
              quote:       v.quote || '',
              sentiment:   v.sentiment || 'neutral',
              topic:       _tn || null,
            })).filter(v => v.quote);
          } catch { /* ignore */ }
          let topic_name = null;
          try {
            const mj = typeof i.metric_json === 'string' ? JSON.parse(i.metric_json) : (i.metric_json || {});
            topic_name = mj.topic || mj.theme || mj.topic_name || null;
          } catch { /* ignore */ }
          ctx.citationMap[i.id] = {
            headline: i.headline, survey_title: s.title, survey_id: s.id,
            layer: i.layer, category: i.category, verbatims, topic_name,
          };
        });

        const { rows: tp } = await db.query(
          `SELECT name, volume, sentiment_score, urgency_score, nps_impact, dominant_emotion, trending
           FROM survey_topics WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
           ORDER BY volume DESC LIMIT 5`,
          [s.id, orgId],
        );
        tp.forEach(t => ctx.topics.push({ ...t, _survey_title: s.title }));
      } catch { /* no data yet for this survey */ }
    }));

    ctx.metrics = {
      portfolio: surveys.map(s => ({
        title: s.title, response_count: s.rc,
        nps_score: s.nps_score, csat_score: s.csat_score,
      })),
    };
  }

  return ctx;
}

// crystalHandler — single implementation used by both /crystal and /org/crystal.
// Scope is auto-detected from survey_id presence — no hardcoded "org agent vs survey agent".
// To add new data sources (support, product usage, etc.): extend loadCrystalContext().
// Zero route changes needed.
async function crystalHandler(req, res) {
  const { orgId, userId } = req;
  const { message, conversation_history = [], survey_id, focused_topic } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length < 2) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const ctx = await loadCrystalContext(survey_id || '', orgId);

    // Build a rich fallback message that embeds all loaded context so the LLM
    // can answer meaningfully even without tool calls.
    const contextLines = [];
    if (ctx.scope === 'survey' && ctx.survey_title) {
      contextLines.push(`[SURVEY: ${ctx.survey_title} — ${ctx.response_count} responses]`);
    }
    if (ctx.scope === 'org' && ctx.metrics.portfolio?.length) {
      const portfolio = ctx.metrics.portfolio.map(s =>
        `• ${s.title}: NPS ${s.nps_score != null ? Math.round(Number(s.nps_score)) : 'N/A'}, ${(s.response_count || 0).toLocaleString()} responses`,
      ).join('\n');
      contextLines.push(`[ACTIVE SURVEYS]\n${portfolio}`);
    }
    if (ctx.insights.length) {
      const insightLines = ctx.insights.slice(0, 15).map(i =>
        `${i._survey_title ? `[${i._survey_title}] ` : ''}${i.layer?.toUpperCase()}: ${i.headline}`,
      ).join('\n');
      contextLines.push(`[LATEST INSIGHTS]\n${insightLines}`);
    }
    if (ctx.topics.length) {
      const topicLines = ctx.topics.slice(0, 20).map(t =>
        `${t._survey_title ? `[${t._survey_title}] ` : ''}${t.name} — ${t.volume} mentions, urgency ${Math.round(t.urgency_score || 0)}%`,
      ).join('\n');
      contextLines.push(`[TOPICS]\n${topicLines}`);
    }
    const enrichedMessage = contextLines.length
      ? `${message.trim()}\n\n${contextLines.join('\n\n')}`
      : message.trim();

    const agentBody = {
      survey_id:             survey_id || '',
      org_id:                orgId,
      user_id:               userId,
      message:               message.trim(),
      scope:                 ctx.scope,
      insights:              ctx.insights,
      topics:                ctx.topics,
      metrics:               ctx.metrics,
      conversation_history,
      survey_response_count: ctx.response_count,
      survey_title:          ctx.survey_title || '',
      ...(focused_topic ? { focused_topic } : {}),
    };

    // Try streaming first (Crystal's tool loop gives richer, data-driven answers)
    try {
      const streamRes = await fetch(`${AGENTS_URL}/insights/crystal/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': AGENTS_INTERNAL_KEY },
        body: JSON.stringify(agentBody),
      });
      if (streamRes.ok) {
        let answer = '', suggestions = [], citations = [];
        let buffer = '';
        for await (const chunk of streamRes.body) {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const ev = JSON.parse(data);
              if (ev.type === 'answer') { answer = ev.answer ?? ''; suggestions = ev.suggestions ?? []; citations = ev.citations ?? []; }
            } catch { /* skip */ }
          }
        }
        if (answer) {
          // Pass citations as both insight_refs AND citations so the frontend
          // can find IDs regardless of which field it reads from.
          return res.json({ answer, suggestions, insight_refs: citations, citations, citation_map: ctx.citationMap });
        }
      }
    } catch (streamErr) {
      logger.warn({ err: streamErr.message, orgId }, 'experience:crystal:stream_fallback');
    }

    // Direct LLM with full context embedded in the message
    const directRes = await fetch(`${AGENTS_URL}/insights/crystal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': AGENTS_INTERNAL_KEY },
      body: JSON.stringify({ ...agentBody, message: enrichedMessage }),
    });
    if (!directRes.ok) return res.status(502).json({ error: 'Agents service error' });
    const data = await directRes.json();
    res.json({
      answer:       data.answer ?? '',
      suggestions:  data.suggestions ?? [],
      insight_refs: data.insight_refs ?? [],
      citations:    data.citations ?? [],
      citation_map: ctx.citationMap,     // ← rich source metadata for the frontend
    });
  } catch (err) {
    serverError(res, err, { endpoint: 'crystal', orgId });
  }
}

// Unified endpoint — scope auto-detected from body
router.post('/crystal',     requireAuth, crystalHandler);
// Backward-compat alias — callers that haven't migrated yet will still work
router.post('/org/crystal', requireAuth, crystalHandler);

// POST /api/experience/:scope/crystal/stream — Crystal SSE proxy
// Enriches the stream with a citation_context event so the frontend can render
// rich source cards (survey name, headline, navigation path) for every cited ID.
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

  // Build citation map from body insights so we can emit it before [DONE]
  const citationMap = {};
  const bodyInsights = Array.isArray(body.insights) ? body.insights : [];
  bodyInsights.forEach(i => {
    if (i.id) citationMap[i.id] = {
      headline:     i.headline || '',
      survey_title: i._survey_title || body.survey_title || '',
      survey_id:    i.survey_id || body.survey_id || '',
      layer:        i.layer || '',
      category:     i.category || '',
    };
  });

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

    // Proxy the agents stream, intercepting [DONE] to inject citation_context first
    let buffer = '';
    for await (const chunk of agentRes.body) {
      if (res.writableEnded) break;
      const text = chunk.toString('utf8');
      buffer += text;
      // Check if [DONE] is in this chunk — inject citation_context before it
      if (buffer.includes('data: [DONE]')) {
        const parts = buffer.split('data: [DONE]');
        if (parts[0]) res.write(parts[0]);
        // Emit citation context so frontend can render rich source cards
        if (Object.keys(citationMap).length > 0) {
          res.write(`data: ${JSON.stringify({ type: 'citation_context', map: citationMap })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        if (parts[1]) res.write(parts[1]);
        buffer = '';
      } else {
        res.write(text);
        buffer = '';
      }
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
