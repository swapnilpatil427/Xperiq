// Local-mode equivalent of the Firebase onNewResponse trigger.
// Called fire-and-forget from routes/local/responses.js after each insert.
const db = require('../lib/db');
const { analyzeInsights } = require('../lib/openrouter');

const THRESHOLDS = [10, 50, 100, 500];

async function maybeAutoAnalyze(surveyId, orgId) {
  const { rows: [{ count }] } = await db.query(
    'SELECT COUNT(*)::int AS count FROM responses WHERE survey_id = $1',
    [surveyId]
  );
  if (!THRESHOLDS.includes(count)) return;

  const { rows: [survey] } = await db.query(
    'SELECT * FROM surveys WHERE id = $1', [surveyId]
  );
  if (!survey) return;

  const { rows: responses } = await db.query(
    `SELECT answers, nps_score FROM responses
     WHERE survey_id = $1 ORDER BY submitted_at DESC LIMIT 200`,
    [surveyId]
  );

  const insights = await analyzeInsights(survey.title, responses);

  await db.query(
    `INSERT INTO insights
       (survey_id, org_id, summary, nps_score, topics, sentiment_breakdown, top_phrases, response_count, triggered_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'auto')`,
    [surveyId, orgId, insights.summary, insights.npsScore,
     JSON.stringify(insights.topics), JSON.stringify(insights.sentimentBreakdown),
     JSON.stringify(insights.topPhrases), count]
  );

  if (insights.npsScore != null) {
    await db.query('UPDATE surveys SET nps_score = $1 WHERE id = $2', [insights.npsScore, surveyId]);
  }

  console.log(`[auto-analyze] survey ${surveyId} at ${count} responses`);
}

module.exports = { maybeAutoAnalyze };
