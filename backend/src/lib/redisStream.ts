// Redis Streams wrapper for insight events.
// Falls back gracefully if Redis is not available — the callers must never crash.
import { getRedisClient } from './redis';

const STREAM_KEY = 'insight_events';
const MAX_LEN = 10000; // keep last 10k events

/**
 * Publish a response-submitted event to the insight_events stream.
 * Fire-and-forget: never throws. Returns silently when Redis is not configured.
 *
 * @param {{ surveyId: string, orgId: string, responseId: string }} params
 */
async function publishResponseEvent({ surveyId, orgId, responseId }: {
  surveyId: string;
  orgId: string;
  responseId: string;
}): Promise<void> {
  try {
    const client = getRedisClient();
    // Skip when Redis is not configured or not yet connected. The client is created
    // with enableOfflineQueue:false, so commands sent before 'ready' are rejected
    // immediately. Checking status here avoids that error during startup and
    // reconnect windows — events dropped during those windows are acceptable for
    // this fire-and-forget stream.
    if (!client || client.status !== 'ready') return;
    await client.xadd(
      STREAM_KEY,
      'MAXLEN', '~', MAX_LEN,
      '*',
      'survey_id',   String(surveyId),
      'org_id',      String(orgId),
      'response_id', String(responseId),
      'ts',          String(Date.now()),
    );
  } catch (err: unknown) {
    // Never crash the response handler — Redis is best-effort
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[redisStream] publish failed:', message);
  }
}

export { publishResponseEvent, STREAM_KEY };
