const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { validate } = require('../../lib/validate');
const { generateSurveySchema, analyzeInsightsSchema, refineSurveySchema } = require('../../schemas/ai');
const { generateSurveyQuestions, analyzeInsights, refineSurveyQuestions } = require('../../lib/openrouter');
const db = require('../../lib/db');
const { insightsGenerated } = require('../../lib/metrics');
const logger = require('../../lib/logger');
const router = express.Router();

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

    const insights = await analyzeInsights(survey.title, responses);

    const { rows: [saved] } = await db.query(
      `INSERT INTO insights (survey_id, org_id, summary, nps_score, topics, sentiment_breakdown, top_phrases, response_count, triggered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual') RETURNING *`,
      [surveyId, req.orgId, insights.summary, insights.npsScore,
       JSON.stringify(insights.topics), JSON.stringify(insights.sentimentBreakdown),
       JSON.stringify(insights.topPhrases), responses.length]
    );

    insightsGenerated.inc({ trigger: 'manual' });
    if (insights.npsScore != null) {
      await db.query(
        'UPDATE surveys SET nps_score = $1 WHERE id = $2 AND org_id = $3',
        [insights.npsScore, surveyId, req.orgId]
      );
    }

    res.json({ insights: saved });
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
