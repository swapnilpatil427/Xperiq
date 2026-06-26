// Local-mode equivalent of the Firebase onNewResponse trigger.
// Called fire-and-forget from routes/local/responses.js after each insert.
import { z } from 'zod';
import { query as dbQuery } from '../lib/db';
import { analyzeInsights } from '../lib/openrouter';
import { getRedisClient } from '../lib/redis';
import logger from '../lib/logger';

const THRESHOLDS = [10, 50, 100, 500];

const InsightsResponseSchema = z.object({
  summary: z.string().optional().nullable(),
  npsScore: z.number().nullable().optional(),
  topics: z.array(z.unknown()).optional().nullable(),
  sentimentBreakdown: z.unknown().optional().nullable(),
  topPhrases: z.array(z.unknown()).optional().nullable(),
}).passthrough();

export async function maybeAutoAnalyze(surveyId: string, orgId: string): Promise<void> {
  const { rows: [{ count }] } = await dbQuery<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM responses WHERE survey_id = $1',
    [surveyId]
  );
  if (!THRESHOLDS.includes(count)) return;

  // Distributed lock: prevents duplicate analysis when multiple responses arrive
  // simultaneously and all pass the same threshold check before any run is created.
  const redis = getRedisClient();
  const lockKey = `auto_analyze_lock:${surveyId}:${count}`;
  if (redis) {
    const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (!acquired) return;
  }

  const { rows: [survey] } = await dbQuery(
    'SELECT * FROM surveys WHERE id = $1', [surveyId]
  );
  if (!survey) return;

  const { rows: responses } = await dbQuery(
    `SELECT answers, nps_score FROM responses
     WHERE survey_id = $1 ORDER BY submitted_at DESC LIMIT 200`,
    [surveyId]
  );

  const rawInsights = await analyzeInsights(survey.title as string, responses);
  const parseResult = InsightsResponseSchema.safeParse(rawInsights);
  if (!parseResult.success) {
    logger.warn({ surveyId, issues: parseResult.error.issues }, 'auto_analyze:invalid_ai_response');
    return;
  }
  const insights = parseResult.data;

  await dbQuery(
    `INSERT INTO insights
       (survey_id, org_id, summary, nps_score, topics, sentiment_breakdown, top_phrases, response_count, triggered_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'auto')`,
    [surveyId, orgId, insights.summary, insights.npsScore,
     JSON.stringify(insights.topics), JSON.stringify(insights.sentimentBreakdown),
     JSON.stringify(insights.topPhrases), count]
  );

  if (insights.npsScore != null) {
    await dbQuery('UPDATE surveys SET nps_score = $1 WHERE id = $2', [insights.npsScore, surveyId]);
  }

  logger.info({ surveyId, count }, 'auto_analyze:complete');
}
