const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { generateSurveyQuestions, analyzeInsights, refineSurveyQuestions } = require('../lib/openrouter');
const { db } = require('../lib/admin');
const router = express.Router();

// Generate survey from natural language intent
router.post('/generate-survey', requireAuth, async (req, res) => {
  try {
    const { intent, surveyTypeId } = req.body;
    if (!intent) return res.status(400).json({ error: 'intent is required' });

    const questions = await generateSurveyQuestions(intent, surveyTypeId);
    res.json({ questions });
  } catch (err) {
    console.error('AI generate-survey error:', err.message);
    res.json({
      questions: getMockQuestions(intent),
      note: 'Generated from template (AI unavailable)',
    });
  }
});

// Analyze responses and generate insights
router.post('/analyze-insights', requireAuth, async (req, res) => {
  try {
    const { surveyId } = req.body;
    if (!surveyId) return res.status(400).json({ error: 'surveyId is required' });

    const surveyDoc = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(surveyId)
      .get();

    if (!surveyDoc.exists) return res.status(404).json({ error: 'Survey not found' });

    const snap = await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(surveyId)
      .collection('responses')
      .orderBy('submittedAt', 'desc')
      .limit(200)
      .get();

    const responses = snap.docs.map((d) => d.data());
    if (!responses.length) {
      return res.status(400).json({ error: 'No responses to analyze' });
    }

    const insights = await analyzeInsights(surveyDoc.data().title, responses);

    await db
      .collection('orgs').doc(req.orgId)
      .collection('surveys').doc(surveyId)
      .collection('insights')
      .add({
        ...insights,
        surveyId,
        responseCount: responses.length,
        generatedAt: new Date(),
      });

    res.json({ insights });
  } catch (err) {
    console.error('AI analyze-insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/refine-survey', requireAuth, async (req, res) => {
  try {
    const { questions, message, context } = req.body;
    if (!Array.isArray(questions)) return res.status(400).json({ error: 'questions array required' });
    if (!message?.trim())          return res.status(400).json({ error: 'message required' });

    const result = await refineSurveyQuestions(questions, message.trim(), context || {});
    res.json(result);
  } catch (err) {
    console.error('AI refine-survey error:', err.message);
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
