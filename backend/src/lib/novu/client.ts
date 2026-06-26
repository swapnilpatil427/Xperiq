import { Novu } from '@novu/node';
import logger from '../logger';

// Singleton Novu client. Returns null when NOVU_API_KEY is not set (dev mode).
// All callers must handle the null case by falling back to direct channel dispatch.
let _client: Novu | null = null;

export function getNovuClient(): Novu | null {
  if (!process.env.NOVU_API_KEY) return null;
  if (!_client) _client = new Novu(process.env.NOVU_API_KEY);
  return _client;
}

export const NOVU_APP_ID = process.env.NOVU_APP_ID ?? '';

/**
 * Upsert a Novu subscriber. Call this when a user logs in or their profile changes.
 * Safe to call without await — failure is non-fatal.
 */
export async function upsertNovuSubscriber(subscriberId: string, profile: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  orgId?: string;
}): Promise<void> {
  const novu = getNovuClient();
  if (!novu) return;
  try {
    await novu.subscribers.identify(subscriberId, {
      email: profile.email,
      phone: profile.phone,
      firstName: profile.firstName,
      lastName: profile.lastName,
      avatar: profile.avatar,
      data: { orgId: profile.orgId },
    });
  } catch (err: unknown) {
    // Non-fatal: log but don't throw
    console.warn('[novu] upsertSubscriber failed:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Trigger a Novu workflow. Returns the triggerResponse or null on failure/unconfigured.
 * workflowId: the workflow identifier string (e.g., 'survey-invite')
 * to: subscriber ID (userId) or { subscriberId, email, phone } for ad-hoc
 * payload: workflow-specific data
 */
export async function triggerWorkflow(
  workflowId: string,
  to: string | { subscriberId: string; email?: string; phone?: string },
  payload: Record<string, unknown>,
  overrides?: Record<string, unknown>
): Promise<unknown> {
  const novu = getNovuClient();
  if (!novu) return null;
  try {
    return await novu.trigger(workflowId, {
      to: typeof to === 'string' ? { subscriberId: to } : to,
      payload,
      overrides,
    });
  } catch (err: unknown) {
    console.warn('[novu] trigger failed:', workflowId, err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Trigger a workflow for multiple subscribers (broadcast).
 * Uses Novu's bulk trigger for up to 100 subscribers at once.
 */
export async function triggerWorkflowBulk(
  workflowId: string,
  subscribers: Array<{ subscriberId: string; email?: string; phone?: string }>,
  payload: Record<string, unknown>
): Promise<void> {
  const novu = getNovuClient();
  if (!novu || subscribers.length === 0) return;

  const BATCH = 100;
  for (let i = 0; i < subscribers.length; i += BATCH) {
    const batch = subscribers.slice(i, i + BATCH);
    try {
      // Use bulkTrigger if available (v0.22+), fall back to parallel individual triggers
      const events = batch.map((sub) => ({
        name: workflowId,
        to: { subscriberId: sub.subscriberId, email: sub.email, phone: sub.phone },
        payload,
      }));
      // @novu/node exposes bulkTrigger on newer versions
      if (typeof (novu as unknown as { bulkTrigger?: unknown }).bulkTrigger === 'function') {
        await (novu as unknown as { bulkTrigger: (events: unknown[]) => Promise<unknown> }).bulkTrigger(events);
      } else {
        // Fallback: staggered individual triggers with concurrency limit
        await Promise.all(
          batch.map((sub) =>
            novu.trigger(workflowId, { to: { subscriberId: sub.subscriberId }, payload })
          )
        );
      }
    } catch (err: unknown) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), workflowId, batchStart: i },
        'novu:bulkTrigger:batch_failed'
      );
    }
  }
}
