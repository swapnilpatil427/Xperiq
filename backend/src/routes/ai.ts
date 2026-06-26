import crypto from 'crypto';
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../lib/validate';
import { generateSurveySchema, analyzeInsightsSchema, refineSurveySchema } from '../schemas/ai';
import { generateSurveyQuestions, analyzeInsights, refineSurveyQuestions } from '../lib/openrouter';
import { query } from '../lib/db';
import { insightsGenerated } from '../lib/metrics';
import logger from '../lib/logger';
import { serverError } from '../lib/httpError';

const router = express.Router();

// Mirrors the agents/_publish_one hash so insights produced by both paths
// share the same idempotency key format.
function _insightHash(surveyId: string, category: string, headline: string, timeWindow = 'all_time'): string {
  const canonical = JSON.stringify({ category, headline, survey_id: surveyId, time_window: timeWindow });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

router.post('/generate-survey', requireAuth, validate(generateSurveySchema), async (req: Request, res: Response): Promise<void> => {
  const { intent, surveyTypeId } = req.body as { intent: string; surveyTypeId?: string };
  try {
    const questions = await generateSurveyQuestions(intent, surveyTypeId);
    res.json({ questions });
  } catch (err: unknown) {
    logger.error({ event: 'ai_generate_survey_error', err: (err as Error).message }, 'AI generate-survey error');
    res.json({ questions: getMockQuestions(intent), note: 'Generated from template (AI unavailable)' });
  }
});

router.post('/analyze-insights', requireAuth, validate(analyzeInsightsSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { surveyId } = req.body as { surveyId: string };

    const { rows: [survey] } = await query(
      'SELECT * FROM surveys WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL',
      [surveyId, req.orgId]
    );
    if (!survey) { res.status(404).json({ error: 'Survey not found' }); return; }

    const { rows: responses } = await query(
      `SELECT answers, nps_score FROM responses
       WHERE survey_id = $1 AND org_id = $2 ORDER BY submitted_at DESC LIMIT 200`,
      [surveyId, req.orgId]
    );
    if (!responses.length) { res.status(400).json({ error: 'No responses to analyze' }); return; }

    const surveyRow = survey as { title: string };
    const analysis = await analyzeInsights(surveyRow.title, responses as Record<string, unknown>[]);

    // Supersede all current active insights so stale topics don't linger.
    await query(
      `UPDATE insights SET superseded_at = NOW()
       WHERE survey_id = $1 AND org_id = $2 AND superseded_at IS NULL`,
      [surveyId, req.orgId]
    );

    const insertedRows: Record<string, unknown>[] = [];

    // Upsert a single insight row using the v2 schema.
    async function upsert(
      layer: string, category: string, headline: string, narrative: string,
      metricJson: unknown, citationsJson: unknown, trustScore: number,
      trustJson: unknown, priority: number
    ): Promise<Record<string, unknown>> {
      const hash = _insightHash(surveyId, category, headline);
      const { rows: [row] } = await query(
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
      insertedRows.push(row as Record<string, unknown>);
      return row as Record<string, unknown>;
    }

    const analysisResult = analysis as {
      summary: string;
      sentimentBreakdown: Record<string, unknown>;
      npsScore?: number | null;
      topics?: { name: string; sentiment: string; volume: number; phrases?: string[] }[];
      topPhrases?: string[];
    };

    // 1. Overview insight — summary + sentiment
    const overviewRow = await upsert(
      'descriptive', 'overview',
      analysisResult.summary.slice(0, 120),
      analysisResult.summary,
      { sentiment: analysisResult.sentimentBreakdown },
      [],
      75, { sample_size: responses.length }, 0.9
    );

    // 2. NPS metric insight
    if (analysisResult.npsScore != null) {
      await upsert(
        'descriptive', 'metric.nps',
        `NPS Score: ${analysisResult.npsScore}`,
        `Survey NPS is ${analysisResult.npsScore} based on ${responses.length} responses.`,
        { name: 'NPS', value: analysisResult.npsScore },
        [],
        80, { sample_size: responses.length }, 0.95
      );
      await query(
        'UPDATE surveys SET nps_score = $1 WHERE id = $2 AND org_id = $3',
        [analysisResult.npsScore, surveyId, req.orgId]
      );
    }

    // 3. One insight per topic
    const maxVol = Math.max(...(analysisResult.topics || []).map(t => t.volume || 0), 1);
    for (const topic of (analysisResult.topics || [])) {
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
        summary:            analysisResult.summary,
        nps_score:          analysisResult.npsScore ?? null,
        topics:             topicRows.map(t => ({
          name:      t.headline,
          sentiment: (t.metric_json as Record<string, unknown>)?.dominant_sentiment || 'neutral',
          volume:    (t.metric_json as Record<string, unknown>)?.value || 0,
          phrases:   ((t.citations_json as { quote: string }[] || []).map(c => c.quote)),
        })),
        sentiment_breakdown: analysisResult.sentimentBreakdown,
        top_phrases:         analysisResult.topPhrases,
        response_count:      responses.length,
        created_at:          overviewRow.generated_at,
      },
    });
  } catch (err: unknown) {
    logger.error({ event: 'ai_analyze_insights_error', err: (err as Error).message }, 'AI analyze-insights error');
    res.status(500).json({ error: 'Failed to analyze insights. Please try again.' });
  }
});

router.post('/refine-survey', requireAuth, validate(refineSurveySchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { questions, message, context } = req.body as { questions: unknown[]; message: string; context?: Record<string, unknown> };

    const result = await refineSurveyQuestions(questions, message.trim(), context || {});
    res.json(result);
  } catch (err: unknown) {
    logger.error({ event: 'ai_refine_survey_error', err: (err as Error).message }, 'AI refine-survey error');
    const { questions } = req.body as { questions: unknown };
    res.json({ questions, explanation: 'I had trouble with that request — please try rephrasing.' });
  }
});

function getMockQuestions(intent?: string): Record<string, unknown>[] {
  return [
    { id: 'q1', type: 'nps',             question: 'How likely are you to recommend us to a colleague?', required: true },
    { id: 'q2', type: 'multiple_choice', question: 'Which area needs the most improvement?', options: ['Onboarding','Performance','Features','Support'], required: true },
    { id: 'q3', type: 'rating',          question: 'Rate your overall experience (1–5)', required: true },
    { id: 'q4', type: 'open_text',       question: `What specific friction did you encounter? (Intent: ${intent?.slice(0,60)})`, required: false },
    { id: 'q5', type: 'open_text',       question: 'What one change would make you a promoter?', required: false },
  ];
}

export default router;
