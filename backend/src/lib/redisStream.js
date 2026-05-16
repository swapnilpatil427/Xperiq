// Redis Streams wrapper for insight events.
// Falls back gracefully if Redis is not available — the callers must never crash.
const { getRedisClient } = require('./redis');

const STREAM_KEY = 'insight_events';
const MAX_LEN = 10000; // keep last 10k events

/**
 * Publish a response-submitted event to the insight_events stream.
 * Fire-and-forget: never throws. Returns silently when Redis is not configured.
 *
 * @param {{ surveyId: string, orgId: string, responseId: string }} params
 */
async function publishResponseEvent({ surveyId, orgId, responseId }) {
  try {
    const client = getRedisClient();
    if (!client) return; // Redis not configured — fall back to maybeAutoAnalyze
    await client.xadd(
      STREAM_KEY,
      'MAXLEN', '~', MAX_LEN,
      '*',
      'survey_id',   String(surveyId),
      'org_id',      String(orgId),
      'response_id', String(responseId),
      'ts',          String(Date.now()),
    );
  } catch (err) {
    // Never crash the response handler — Redis is best-effort
    console.warn('[redisStream] publish failed:', err.message);
  }
}

module.exports = { publishResponseEvent, STREAM_KEY };
