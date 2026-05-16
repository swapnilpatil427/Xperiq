const crypto  = require('crypto');
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { validate } = require('../../lib/validate');
const { generateSurveySchema, analyzeInsightsSchema, refineSurveySchema } = require('../../schemas/ai');
const { generateSurveyQuestions, analyzeInsights, refineSurveyQuestions } = require('../../lib/openrouter');
const db = require('../../lib/db');
const { insightsGenerated } = require('../../lib/metrics');
const logger = require('../../lib/logger');
const router = express.Router();

// Mirrors the agents/_publish_one hash so insights produced by both paths
// share the same idempotency key format.
function _insightHash(surveyId, category, headline, timeWindow = 'all_time') {
  const canonical = JSON.stringify({ category, headline, survey_id: surveyId, time_window: timeWindow });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

router.post('/generate-survey', requireAuth, validate(generateSurveySchema), async (req, res) => {
  const { intent, surveyTypeId } = req.body;
  try {
    const questions = await generateSurveyQuestions(intent, surveyTypeId);
    res.json({ questions });
  } catch (err) {
    logger.error({ event: 'ai_generate_survey_error', err: err.message }, 'AI generate-survey error');
    res.json({ questions: getMockQuestions(intent), note: 'Generated from template (AI unavailable)' });
  }
});

router.post('/analyze-insights', requireAuth, validate(analyzeInsightsSchema), async (req, res) => {
  try {
    const { surveyId } = req.body;

    const { rows: [survey] } = await db.query(
      'SELECT * FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [surveyId, req.orgId]
    );
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    const { rows: responses } = await db.query(
      `SELECT answers, nps_score FROM responses
       WHERE survey_id = $1 AND org_id = $2 ORDER BY submitted_at DESC LIMIT 200`,
      [surveyId, req.orgId]
    );
    if (!responses.length) return res.status(400).json({ error: 'No responses to analyze' });

    const analysis = await analyzeInsights(survey.title, responses);

    // Supersede all current active insights so stale topics don't linger.
    // Same approach as node_publish in agents/graphs/insights.py.
    await db.query(
      `UPDATE insights SET superseded_at = NOW()
       WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL`,
      [surveyId, req.orgId]
    );

    const insertedRows = [];

    // Upsert a single insight row using the v2 schema.
    // ON CONFLICT reactivates superseded rows that share the same hash.
    async function upsert(layer, category, headline, narrative, metricJson, citationsJson, trustScore, trustJson, priority) {
      const hash = _insightHash(surveyId, category, headline);
      const { rows: [row] } = await db.query(
        `INSERT INTO insights
           (survey_id, org_id, layer, category, headline, narrative,
            metric_json, citations_json, trust_score, trust_json, priority,
            insight_hash, time_window)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'all_time')
         ON CONFLICT (survey_id, insight_hash, time_window) DO UPDATE SET
           headline       = EXCLUDED.headline,
           narrative      = EXCLUDED.narrative,
           metric_json    = EXCLUDED.metric_json,
           citations_json = EXCLUDED.citations_json,
           trust_score    = EXCLUDED.trust_score,
           trust_json     = EXCLUDED.trust_json,
           priority       = EXCLUDED.priority,
           superseded_at  = NULL,
           generated_at   = NOW()
         RETURNING *`,
        [
          surveyId, req.orgId, layer, category, headline, narrative,
          JSON.stringify(metricJson  ?? null),
          JSON.stringify(citationsJson ?? []),
          trustScore,
          JSON.stringify(trustJson   ?? {}),
          priority,
          hash,
        ]
      );
      insertedRows.push(row);
      return row;
    }

    // 1. Overview insight — summary + sentiment
    const overviewRow = await upsert(
      'descriptive', 'overview',
      analysis.summary.slice(0, 120),
      analysis.summary,
      { sentiment: analysis.sentimentBreakdown },
      [],
      75, { sample_size: responses.length }, 0.9
    );

    // 2. NPS metric insight
    if (analysis.npsScore != null) {
      await upsert(
        'descriptive', 'metric.nps',
        `NPS Score: ${analysis.npsScore}`,
        `Survey NPS is ${analysis.npsScore} based on ${responses.length} responses.`,
        { name: 'NPS', value: analysis.npsScore },
        [],
        80, { sample_size: responses.length }, 0.95
      );
      await db.query(
        'UPDATE surveys SET nps_score = $1 WHERE id = $2 AND org_id = $3',
        [analysis.npsScore, surveyId, req.orgId]
      );
    }

    // 3. One insight per topic
    const maxVol = Math.max(...(analysis.topics || []).map(t => t.volume || 0), 1);
    for (const topic of (analysis.topics || [])) {
      const priority = parseFloat(Math.min((topic.volume || 0) / maxVol, 1.0).toFixed(4));
      await upsert(
        'diagnostic', 'voice.topic',
        topic.name,
        `${topic.name}: ${(topic.phrases || []).join(', ')}`,
        { dominant_sentiment: topic.sentiment, value: topic.volume },
        (topic.phrases || []).map(p => ({ quote: p, response_id: '' })),
        70, { sample_size: responses.length }, priority
      );
    }

    insightsGenerated.inc({ trigger: 'manual' });

    // Build the legacy Insight shape that useInsights / CrystalPanel expect
    const npsRow    = insertedRows.find(r => r.category === 'metric.nps');
    const topicRows = insertedRows.filter(r => r.category === 'voice.topic');

    res.json({
      insights: {
        id:                 overviewRow.id,
        survey_id:          surveyId,
        org_id:             req.orgId,
        summary:            analysis.summary,
        nps_score:          analysis.npsScore ?? null,
        topics:             topicRows.map(t => ({
          name:      t.headline,
          sentiment: t.metric_json?.dominant_sentiment || 'neutral',
          volume:    t.metric_json?.value || 0,
          phrases:   (t.citations_json || []).map(c => c.quote),
        })),
        sentiment_breakdown: analysis.sentimentBreakdown,
        top_phrases:         analysis.topPhrases,
        response_count:      responses.length,
        created_at:          overviewRow.generated_at,
      },
    });
  } catch (err) {
    logger.error({ event: 'ai_analyze_insights_error', err: err.message }, 'AI analyze-insights error');
    res.status(500).json({ error: 'Failed to analyze insights. Please try again.' });
  }
});

router.post('/refine-survey', requireAuth, validate(refineSurveySchema), async (req, res) => {
  try {
    const { questions, message, context } = req.body;

    const result = await refineSurveyQuestions(questions, message.trim(), context || {});
    res.json(result);
  } catch (err) {
    logger.error({ event: 'ai_refine_survey_error', err: err.message }, 'AI refine-survey error');
    const { questions } = req.body;
    res.json({ questions, explanation: 'I had trouble with that request — please try rephrasing.' });
  }
});

function getMockQuestions(intent) {
  return [
    { id: 'q1', type: 'nps',             question: 'How likely are you to recommend us to a colleague?', required: true },
    { id: 'q2', type: 'multiple_choice', question: 'Which area needs the most improvement?', options: ['Onboarding','Performance','Features','Support'], required: true },
    { id: 'q3', type: 'rating',          question: 'Rate your overall experience (1–5)', required: true },
    { id: 'q4', type: 'open_text',       question: `What specific friction did you encounter? (Intent: ${intent?.slice(0,60)})`, required: false },
    { id: 'q5', type: 'open_text',       question: 'What one change would make you a promoter?', required: false },
  ];
}

module.exports = router;
