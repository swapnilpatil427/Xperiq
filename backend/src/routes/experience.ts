/**
 * Experience Intelligence routes — org portfolio, survey deep-dive, topics, trends
 *
 *   GET  /api/experience/org/overview             — Org portfolio summary
 *   POST /api/experience/crystal                  — Crystal chat (scope auto-detected)
 *   POST /api/experience/org/crystal              — Crystal chat (org scope alias)
 *   POST /api/experience/:scope/crystal/stream    — Crystal SSE streaming
 *   GET  /api/experience/:id/topics/signals       — Topic analysis hub
 *   GET  /api/experience/:id/topics/:topicId      — Topic deep dive
 *   GET  /api/experience/:id/trends               — Survey trend analysis
 */
import express from 'express';
import type { Request, Response } from 'express';
import fetch from 'node-fetch';
import { requireAuth } from '../middleware/auth';
import { query } from '../lib/db';
import logger from '../lib/logger';
import { serverError, clientError } from '../lib/httpError';

const AGENTS_URL = process.env.AGENTS_URL ?? 'http://localhost:8001';
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY
  ?? (process.env.NODE_ENV !== 'production'
    ? 'dev-internal-key-change-in-prod'
    : (() => { throw new Error('AGENTS_INTERNAL_KEY must be set in production'); })());

const router = express.Router();

// ── Crystal context loader ───────────────────────────────────────────────────
// Shared by the REST fallback and any future endpoints.
// scope is derived from whether a survey_id is present — no hardcoding needed.

interface CitationEntry {
  headline: string;
  survey_title: string;
  survey_id: string;
  layer: string;
  category: string;
  verbatims: { response_id: string; quote: string; sentiment: string; topic: string | null }[];
  topic_name: string | null;
}

interface CrystalContext {
  insights: Record<string, unknown>[];
  topics: Record<string, unknown>[];
  metrics: Record<string, unknown>;
  survey_title: string;
  response_count: number;
  citationMap: Record<string, CitationEntry>;
  scope?: string;
}

async function loadCrystalContext(surveyId: string, orgId: string): Promise<CrystalContext> {
  // citationMap: insight_id → { headline, survey_title, survey_id, layer, category }
  // Returned alongside context so the frontend can render rich source cards
  // without additional round-trips.
  const ctx: CrystalContext = {
    insights: [], topics: [], metrics: {}, survey_title: '', response_count: 0, citationMap: {},
  };

  if (surveyId) {
    // ── Survey context ───────────────────────────────────────────────────────
    ctx.scope = 'survey';
    try {
      const { rows: insightRows } = await query(
        `SELECT id, layer, category, headline, narrative, metric_json,
                citations_json, trust_score, priority, trust_json
         FROM insights
         WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
         ORDER BY priority DESC NULLS LAST LIMIT 30`,
        [surveyId, orgId],
      );
      // Tag insights with survey_id so agents can include it in system context
      ctx.insights = (insightRows as Record<string, unknown>[]).map(i => ({ ...i, survey_id: surveyId }));
      // Build citationMap — include first 3 verbatims and topic_name for response navigation
      (insightRows as Record<string, unknown>[]).forEach(i => {
        if (!i.id) return;
        let verbatims: { response_id: string; quote: string; sentiment: string; topic: string | null }[] = [];
        try {
          const raw = typeof i.citations_json === 'string'
            ? JSON.parse(i.citations_json as string)
            : (i.citations_json || []) as unknown[];
          // Extract topic_name early so verbatims can be tagged with it
          let _topic: string | null = null;
          try {
            const mj0 = typeof i.metric_json === 'string'
              ? JSON.parse(i.metric_json as string)
              : (i.metric_json || {}) as Record<string, unknown>;
            _topic = (mj0.topic || mj0.theme || mj0.topic_name || null) as string | null;
          } catch { /* ignore */ }
          verbatims = (raw as Record<string, unknown>[]).slice(0, 3).map(v => ({
            response_id: (v.response_id || v.id || '') as string,
            quote:       (v.quote || '') as string,
            sentiment:   (v.sentiment || 'neutral') as string,
            topic:       _topic,
          })).filter(v => v.quote);
        } catch { /* malformed citations_json */ }
        let topic_name: string | null = null;
        try {
          const mj = typeof i.metric_json === 'string'
            ? JSON.parse(i.metric_json as string)
            : (i.metric_json || {}) as Record<string, unknown>;
          topic_name = (mj.topic || mj.theme || mj.topic_name || null) as string | null;
        } catch { /* ignore */ }
        ctx.citationMap[i.id as string] = {
          headline: i.headline as string,
          survey_title: ctx.survey_title || '',
          survey_id: surveyId,
          layer: i.layer as string,
          category: i.category as string,
          verbatims,
          topic_name,
        };
      });
    } catch { /* no insights yet */ }

    try {
      const { rows: topicRows } = await query(
        `SELECT name, volume, sentiment_score, dominant_emotion, effort_score,
                trending, nps_avg, positive_pct, negative_pct, urgency_score
         FROM survey_topics WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
         ORDER BY volume DESC LIMIT 25`,
        [surveyId, orgId],
      );
      ctx.topics = topicRows as Record<string, unknown>[];
    } catch { /* no topics yet */ }

    try {
      const { rows: [snap] } = await query(
        `SELECT nps, csat FROM survey_metric_snapshots WHERE survey_id = $1 ORDER BY captured_at DESC LIMIT 1`,
        [surveyId],
      );
      if (snap) {
        const s = snap as { nps: unknown; csat: unknown };
        ctx.metrics = { nps: { score: s.nps }, csat: { score: s.csat } };
      }
    } catch { /* no metrics yet */ }

    try {
      const { rows: [s] } = await query(
        `SELECT title, (SELECT COUNT(*)::int FROM responses r WHERE r.survey_id = s.id) AS rc FROM surveys s WHERE id = $1`,
        [surveyId],
      );
      if (s) {
        const sv = s as { title: string; rc: number };
        ctx.survey_title = sv.title;
        ctx.response_count = sv.rc || 0;
        // Backfill survey_title into citationMap now that we have it
        Object.values(ctx.citationMap).forEach(c => { if (c.survey_id === surveyId) c.survey_title = sv.title; });
      }
    } catch { /* ignore */ }

  } else {
    // ── Org / portfolio context ──────────────────────────────────────────────
    ctx.scope = 'org';
    const { rows: surveys } = await query(
      `SELECT s.id, s.title, (SELECT COUNT(*)::int FROM responses r WHERE r.survey_id = s.id) AS rc,
              m.nps AS nps_score, m.csat AS csat_score
       FROM surveys s
       LEFT JOIN LATERAL (SELECT nps, csat FROM survey_metric_snapshots WHERE survey_id = s.id ORDER BY captured_at DESC LIMIT 1) m ON true
       WHERE s.org_id = $1 AND s.status IN ('active','paused') AND s.deleted_at IS NULL
       ORDER BY rc DESC NULLS LAST LIMIT 8`,
      [orgId],
    ).catch(() => ({ rows: [] }));

    const surveyRows = surveys as { id: string; title: string; rc: number; nps_score: unknown; csat_score: unknown }[];
    ctx.response_count = surveyRows.reduce((n, s) => n + (s.rc || 0), 0);

    // Collect latest insights + topics from every active survey
    await Promise.all(surveyRows.map(async (s) => {
      try {
        const { rows: ins } = await query(
          `SELECT id, layer, category, headline, narrative, metric_json, citations_json, trust_score, priority
           FROM insights WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL
           ORDER BY CASE layer WHEN 'prescriptive' THEN 0 WHEN 'diagnostic' THEN 1 ELSE 2 END, priority DESC NULLS LAST LIMIT 5`,
          [s.id, orgId],
        );
        (ins as Record<string, unknown>[]).forEach(i => {
          ctx.insights.push({ ...i, _survey_title: s.title, survey_id: s.id });
          if (!i.id) return;
          let verbatims: { response_id: string; quote: string; sentiment: string; topic: string | null }[] = [];
          try {
            let _tn: string | null = null;
            try {
              const mj0 = typeof i.metric_json === 'string'
                ? JSON.parse(i.metric_json as string)
                : (i.metric_json || {}) as Record<string, unknown>;
              _tn = (mj0.topic || mj0.theme || mj0.topic_name || null) as string | null;
            } catch { /* ignore */ }
            const raw = typeof i.citations_json === 'string'
              ? JSON.parse(i.citations_json as string)
              : (i.citations_json || []) as unknown[];
            verbatims = (raw as Record<string, unknown>[]).slice(0, 3).map(v => ({
              response_id: (v.response_id || v.id || '') as string,
              quote:       (v.quote || '') as string,
              sentiment:   (v.sentiment || 'neutral') as string,
              topic:       _tn,
            })).filter(v => v.quote);
          } catch { /* ignore */ }
          let topic_name: string | null = null;
          try {
            const mj = typeof i.metric_json === 'string'
              ? JSON.parse(i.metric_json as string)
              : (i.metric_json || {}) as Record<string, unknown>;
            topic_name = (mj.topic || mj.theme || mj.topic_name || null) as string | null;
          } catch { /* ignore */ }
          ctx.citationMap[i.id as string] = {
            headline: i.headline as string,
            survey_title: s.title,
            survey_id: s.id,
            layer: i.layer as string,
            category: i.category as string,
            verbatims,
            topic_name,
          };
        });

        const { rows: tp } = await query(
          `SELECT name, volume, sentiment_score, urgency_score, nps_impact, dominant_emotion, trending
           FROM survey_topics WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
           ORDER BY volume DESC LIMIT 5`,
          [s.id, orgId],
        );
        (tp as Record<string, unknown>[]).forEach(t => ctx.topics.push({ ...t, _survey_title: s.title }));
      } catch { /* no data yet for this survey */ }
    }));

    ctx.metrics = {
      portfolio: surveyRows.map(s => ({
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
async function crystalHandler(req: Request, res: Response): Promise<void> {
  const orgId = req.orgId;
  const userId = req.userId;
  const { message, conversation_history = [], survey_id, focused_topic } = req.body as Record<string, unknown>;

  if (!message || typeof message !== 'string' || (message as string).trim().length < 2) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const ctx = await loadCrystalContext((survey_id as string) || '', orgId);

    // Build a rich fallback message that embeds all loaded context so the LLM
    // can answer meaningfully even without tool calls.
    const contextLines: string[] = [];
    if (ctx.scope === 'survey' && ctx.survey_title) {
      contextLines.push(`[SURVEY: ${ctx.survey_title} — ${ctx.response_count} responses]`);
    }
    const portfolio = (ctx.metrics as Record<string, unknown>).portfolio as { title: string; nps_score: unknown; response_count: unknown }[] | undefined;
    if (ctx.scope === 'org' && portfolio?.length) {
      const portfolioLines = portfolio.map(s =>
        `• ${s.title}: NPS ${s.nps_score != null ? Math.round(Number(s.nps_score)) : 'N/A'}, ${((s.response_count as number) || 0).toLocaleString()} responses`,
      ).join('\n');
      contextLines.push(`[ACTIVE SURVEYS]\n${portfolioLines}`);
    }
    if (ctx.insights.length) {
      const insightLines = ctx.insights.slice(0, 15).map(i => {
        const survTitle = i._survey_title as string | undefined;
        return `${survTitle ? `[${survTitle}] ` : ''}${(i.layer as string)?.toUpperCase()}: ${i.headline}`;
      }).join('\n');
      contextLines.push(`[LATEST INSIGHTS]\n${insightLines}`);
    }
    if (ctx.topics.length) {
      const topicLines = ctx.topics.slice(0, 20).map(t => {
        const survTitle = t._survey_title as string | undefined;
        return `${survTitle ? `[${survTitle}] ` : ''}${t.name} — ${t.volume} mentions, urgency ${Math.round((t.urgency_score as number) || 0)}%`;
      }).join('\n');
      contextLines.push(`[TOPICS]\n${topicLines}`);
    }
    const enrichedMessage = contextLines.length
      ? `${(message as string).trim()}\n\n${contextLines.join('\n\n')}`
      : (message as string).trim();

    const agentBody: Record<string, unknown> = {
      survey_id:             (survey_id as string) || '',
      org_id:                orgId,
      user_id:               userId,
      message:               (message as string).trim(),
      scope:                 ctx.scope,
      insights:              ctx.insights,
      topics:                ctx.topics,
      metrics:               ctx.metrics,
      conversation_history:  Array.isArray(conversation_history) ? conversation_history : [],
      survey_response_count: ctx.response_count,
      survey_title:          ctx.survey_title || '',
    };
    if (focused_topic) agentBody.focused_topic = focused_topic;

    // Try streaming first (Crystal's tool loop gives richer, data-driven answers)
    try {
      const streamRes = await fetch(`${AGENTS_URL}/insights/crystal/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': AGENTS_INTERNAL_KEY },
        body: JSON.stringify(agentBody),
      });
      if (streamRes.ok) {
        let answer = '', suggestions: unknown[] = [], citations: unknown[] = [];
        let buffer = '';
        for await (const chunk of streamRes.body) {
          buffer += (chunk as Buffer).toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const ev = JSON.parse(data) as Record<string, unknown>;
              if (ev.type === 'answer') {
                answer = (ev.answer as string) ?? '';
                suggestions = (ev.suggestions as unknown[]) ?? [];
                citations = (ev.citations as unknown[]) ?? [];
              }
            } catch { /* skip */ }
          }
        }
        if (answer) {
          // Pass citations as both insight_refs AND citations so the frontend
          // can find IDs regardless of which field it reads from.
          res.json({ answer, suggestions, insight_refs: citations, citations, citation_map: ctx.citationMap });
          return;
        }
      }
    } catch (streamErr: unknown) {
      logger.warn({ err: (streamErr as Error).message, orgId }, 'experience:crystal:stream_fallback');
    }

    // Direct LLM with full context embedded in the message
    const directRes = await fetch(`${AGENTS_URL}/insights/crystal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': AGENTS_INTERNAL_KEY },
      body: JSON.stringify({ ...agentBody, message: enrichedMessage }),
    });
    if (!directRes.ok) { res.status(502).json({ error: 'Agents service error' }); return; }
    const data = await directRes.json() as Record<string, unknown>;
    res.json({
      answer:       (data.answer as string) ?? '',
      suggestions:  (data.suggestions as unknown[]) ?? [],
      insight_refs: (data.insight_refs as unknown[]) ?? [],
      citations:    (data.citations as unknown[]) ?? [],
      citation_map: ctx.citationMap,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'crystal', orgId });
  }
}

// GET /api/experience/org/overview
router.get('/org/overview', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    const { rows: surveys } = await query(
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

    const { rows: orgSnap } = await query(
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
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'org_overview', orgId });
  }
});

// Unified endpoint — scope auto-detected from body
router.post('/crystal',     requireAuth, crystalHandler);
// Backward-compat alias — callers that haven't migrated yet will still work
router.post('/org/crystal', requireAuth, crystalHandler);

// POST /api/experience/:scope/crystal/stream — Crystal SSE proxy
// Enriches the stream with a citation_context event so the frontend can render
// rich source cards (survey name, headline, navigation path) for every cited ID.
router.post('/:scope/crystal/stream', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { scope } = req.params;
  const orgId = req.orgId;
  const userId = req.userId;
  const body = req.body as Record<string, unknown>;

  if (!['survey', 'org'].includes(scope)) {
    clientError(res, 400, 'invalid_scope');
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const surveyIdForCtx = scope === 'survey' ? String(body.survey_id || '') : '';
  let citationMap: Record<string, Record<string, unknown>> = {};
  let agentBody: Record<string, unknown> = { ...body, org_id: orgId, user_id: userId, scope };

  try {
    const ctx = await loadCrystalContext(surveyIdForCtx, orgId!);
    citationMap = ctx.citationMap as Record<string, Record<string, unknown>>;
    const bodyInsights = Array.isArray(body.insights) ? (body.insights as Record<string, unknown>[]) : [];
    agentBody = {
      ...body,
      org_id: orgId,
      user_id: userId,
      scope,
      insights: bodyInsights.length > 0 ? bodyInsights : ctx.insights,
      topics: Array.isArray(body.topics) && (body.topics as unknown[]).length > 0
        ? body.topics
        : ctx.topics,
      metrics: body.metrics && Object.keys(body.metrics as object).length > 0
        ? body.metrics
        : ctx.metrics,
      survey_title: (body.survey_title as string) || ctx.survey_title || '',
      survey_response_count: body.survey_response_count ?? ctx.response_count,
    };
  } catch (ctxErr: unknown) {
    logger.warn({ err: (ctxErr as Error).message, orgId }, 'crystal_stream_context_load_failed');
    const bodyInsights = Array.isArray(body.insights) ? (body.insights as Record<string, unknown>[]) : [];
    bodyInsights.forEach(i => {
      if (i.id) citationMap[String(i.id)] = {
        headline:     (i.headline as string) || '',
        survey_title: (i._survey_title as string) || (body.survey_title as string) || '',
        survey_id:    (i.survey_id as string) || (body.survey_id as string) || '',
        layer:        (i.layer as string) || '',
        category:     (i.category as string) || '',
      };
    });
  }

  // Emit citation context first so the frontend can enrich sources before/at answer time.
  if (Object.keys(citationMap).length > 0) {
    res.write(`data: ${JSON.stringify({ type: 'citation_context', map: citationMap })}\n\n`);
  }

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const agentRes = await fetch(`${AGENTS_URL}/insights/crystal/stream`, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': AGENTS_INTERNAL_KEY,
      },
      body: JSON.stringify(agentBody),
      signal: controller.signal,
    });

    if (!agentRes.ok) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Agent service error' })}\n\n`);
      res.end();
      return;
    }

    // Proxy the agents stream to the client
    for await (const chunk of agentRes.body) {
      if (res.writableEnded) break;
      res.write(chunk as Buffer);
    }
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e.name !== 'AbortError' && !res.writableEnded) {
      logger.error({ err: e.message }, 'crystal_stream_proxy_error');
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`);
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// GET /api/experience/:id/topics/signals
router.get('/:id/topics/signals', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const surveyId = req.params.id;
  const orgId = req.orgId;
  try {
    const { rows } = await query(
      `SELECT id, name, aliases, volume, sentiment_score, dominant_emotion,
              effort_score, trending, nps_avg, positive_pct, negative_pct,
              first_seen_at, last_seen_at, parent_topic_id, is_new
       FROM survey_topics
       WHERE survey_id = $1 AND org_id = $2 AND time_window = 'all_time'
       ORDER BY volume DESC NULLS LAST`,
      [surveyId, orgId]
    );
    res.json({ topics: rows, count: rows.length });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'topic_signals', surveyId });
  }
});

// GET /api/experience/:id/topics/:topicId
router.get('/:id/topics/:topicId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const surveyId = req.params.id;
  const { topicId } = req.params;
  const orgId = req.orgId;
  try {
    const { rows: topicRows } = await query(
      `SELECT * FROM survey_topics
       WHERE id = $1 AND survey_id = $2 AND org_id = $3`,
      [topicId, surveyId, orgId]
    );
    if (!topicRows.length) { clientError(res, 404, 'topic_not_found'); return; }

    // Get verbatims
    const topicName = (topicRows[0] as { name: string }).name;
    const { rows: verbatims } = await query(
      `SELECT answers, ai_sentiment, ai_sentiment_score, submitted_at
       FROM responses
       WHERE survey_id = $1 AND ai_topics::text ILIKE $2
       ORDER BY submitted_at DESC LIMIT 15`,
      [surveyId, `%${topicName}%`]
    ).catch(() => ({ rows: [] }));

    res.json({
      topic: topicRows[0],
      verbatims: (verbatims as { answers: unknown; ai_sentiment: string; ai_sentiment_score: number; submitted_at: string }[]).map(r => ({
        answers:      r.answers,
        sentiment:    r.ai_sentiment,
        score:        r.ai_sentiment_score,
        submitted_at: r.submitted_at,
      })),
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'topic_deep_dive', surveyId, topicId });
  }
});

// GET /api/experience/:id/trends
router.get('/:id/trends', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const surveyId = req.params.id;
  const orgId = req.orgId;
  const days = Math.min(parseInt((req.query.days as string) || '90', 10), 365);
  try {
    const { rows: snapshots } = await query(
      `SELECT nps AS nps_score, csat AS csat_score, effort_score AS ces_score,
              response_count, captured_at
       FROM survey_metric_snapshots
       WHERE survey_id = $1 AND org_id = $2
         AND captured_at > NOW() - ($3 || ' days')::interval
       ORDER BY captured_at ASC`,
      [surveyId, orgId, days]
    );

    const { rows: checkpoints } = await query(
      `SELECT checkpoint_number, response_count_at_checkpoint, nps_at_checkpoint, created_at
       FROM survey_insight_checkpoints
       WHERE survey_id = $1 AND org_id = $2
       ORDER BY created_at ASC`,
      [surveyId, orgId]
    ).catch(() => ({ rows: [] }));

    res.json({ snapshots, checkpoints, days });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'survey_trends', surveyId });
  }
});

export default router;
