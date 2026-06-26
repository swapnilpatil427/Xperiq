// Notification channel dispatcher.
//
// in_app is delivered by createNotification (DB row + live SSE publish). This
// module fans a persisted notification out to the user's OTHER enabled channels.
//
// Email (SendGrid HTTP API) and Slack (incoming webhook) are REAL integrations
// using built-in fetch (no new dependency). They degrade gracefully to a no-op
// when unconfigured (no API key / no webhook), so dev works with zero setup and
// production just needs the env/config. Actual delivery is exercised at deploy
// time with real credentials; here it's covered by mocked-fetch tests.
//
// Novu integration (Sprint 4): when NOVU_API_KEY is set, dispatchExternalChannels
// delegates to Novu's response-alert workflow for unified multi-channel delivery.
// Falls back to direct SendGrid/Slack when Novu is not configured — zero behavior
// change in dev mode.
import { query } from './db';
import { triggerWorkflow } from './novu/client';
import { isAllowed as frequencyIsAllowed } from './frequencyCapper';
import { isSuppressed } from './suppressionList';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, obj: Record<string, unknown>, msg: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./logger') as Record<string, (obj: unknown, msg: string) => void>)[level](obj, msg);
  } catch { console.log(`[channels] ${msg}`, obj); }
}

export interface ChannelResult {
  channel: string;
  delivered: boolean;
  reason?: string;
}

export interface DispatchableNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  priority?: string | null;
  actionUrl?: string | null;
}

// ── Email (SendGrid) ──────────────────────────────────────────────────────────
export async function sendEmail(orgId: string, userId: string, notification: DispatchableNotification): Promise<ChannelResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return { channel: 'email', delivered: false, reason: 'not_configured' };

  // Resolve the recipient's email from their profile.
  const { rows } = await query(
    'SELECT email FROM user_profiles WHERE user_id = $1 AND org_id = $2', [userId, orgId]
  );
  const to = (rows[0] as { email?: string } | undefined)?.email;
  if (!to) return { channel: 'email', delivered: false, reason: 'no_recipient' };

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'Experient' },
        subject: notification.title,
        content: [{ type: 'text/plain', value: `${notification.body || notification.title}\n\n${notification.actionUrl ? `Open: ${notification.actionUrl}` : ''}` }],
      }),
    });
    const delivered = res.ok;
    if (!delivered) log('warn', { event: 'email_send_failed', status: res.status }, 'SendGrid send failed');
    return { channel: 'email', delivered };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', { event: 'email_send_error', err: msg }, 'SendGrid send error');
    return { channel: 'email', delivered: false, reason: 'error' };
  }
}

// ── Slack (incoming webhook) ──────────────────────────────────────────────────
export async function sendSlack(orgId: string, userId: string | null, notification: DispatchableNotification): Promise<ChannelResult> {
  const { rows } = await query(
    `SELECT config FROM notification_channels
      WHERE org_id = $1 AND channel_type = 'slack' AND is_active = TRUE AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  ).catch(() => ({ rows: [] as unknown[] }));
  const webhookUrl = (rows[0] as { config?: { webhook_url?: string } } | undefined)?.config?.webhook_url;
  if (!webhookUrl) return { channel: 'slack', delivered: false, reason: 'not_configured' };

  const emojiMap: Record<string, string> = { critical: ':rotating_light:', warning: ':warning:', success: ':white_check_mark:' };
  const emoji = emojiMap[notification.priority ?? ''] || ':bell:';
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *${notification.title}*`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *${notification.title}*\n${notification.body || ''}` } },
          ...(notification.actionUrl ? [{ type: 'section', text: { type: 'mrkdwn', text: `<${notification.actionUrl}|View in Experient>` } }] : []),
        ],
      }),
    });
    return { channel: 'slack', delivered: res.ok };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', { event: 'slack_send_error', err: msg }, 'Slack send error');
    return { channel: 'slack', delivered: false, reason: 'error' };
  }
}

type SenderFn = (orgId: string, userId: string, notification: DispatchableNotification) => Promise<ChannelResult>;

export const SENDERS: Record<string, SenderFn> = { email: sendEmail, slack: sendSlack };

// ── Novu dispatch ─────────────────────────────────────────────────────────────
/**
 * Dispatch a notification via Novu's response-alert workflow.
 * Returns true if Novu was configured and the trigger was attempted.
 * Returns false if Novu is not configured (caller falls back to direct dispatch).
 */
export async function dispatchViaNovu(
  orgId: string,
  userId: string,
  notification: DispatchableNotification,
  pref: { email_enabled?: boolean; slack_enabled?: boolean }
): Promise<boolean> {
  if (!process.env.NOVU_API_KEY) return false;

  const result = await triggerWorkflow(
    'response-alert',
    userId,
    {
      surveyTitle: notification.title,
      alertSummary: notification.body || notification.title,
      responseUrl: notification.actionUrl || undefined,
      sendToSlack: pref.slack_enabled ?? false,
      // Map priority to sentiment label for the Novu payload
      sentiment: notification.priority ?? 'info',
    }
  );

  // triggerWorkflow returns null on failure — treat null as "not delivered via Novu"
  return result !== null;
}

/**
 * Dispatch a persisted notification to the user's enabled non-in-app channels.
 * Best-effort: never throws into the caller.
 *
 * When NOVU_API_KEY is set: delegates to Novu's response-alert workflow which
 * handles email + Slack + in-app through Novu's unified delivery layer.
 * Fallback: direct SendGrid email + Slack webhook (original behavior).
 *
 * @returns channels attempted
 */
export async function dispatchExternalChannels(orgId: string, userId: string, notification: DispatchableNotification): Promise<string[]> {
  try {
    const { rows } = await query(
      `SELECT email_enabled, slack_enabled FROM notification_type_preferences
        WHERE org_id = $1 AND user_id = $2 AND notification_type = $3`,
      [orgId, userId, notification.type]
    );
    const pref = rows[0] as { email_enabled?: boolean; slack_enabled?: boolean } | undefined;
    if (!pref) return []; // default: in-app only

    const attempted: string[] = [];

    // Staff notifications: resolve email from user_profiles (not notification_type_preferences).
    const { rows: profileRows } = await query<{ email: string | null }>(
      'SELECT email FROM user_profiles WHERE user_id = $1 AND org_id = $2',
      [userId, orgId]
    ).catch(() => ({ rows: [] }));
    const recipientEmail = profileRows[0]?.email ?? undefined;
    const contactId: string | null = null; // frequency caps apply to CRM contacts, not org users

    // Suppression check — always runs before frequency check
    if (recipientEmail) {
      const emailSuppressed = await isSuppressed(orgId, 'email', { email: recipientEmail });
      if (emailSuppressed) {
        log('info', { userId, orgId }, 'notify:suppressed:skipped');
        return [];
      }
    }

    // Novu path: when configured, delegate to Novu workflow for unified delivery
    if (process.env.NOVU_API_KEY) {
      // Frequency cap — pass contactId (UUID) not userId (Clerk string)
      const emailAllowed = pref.email_enabled
        ? await frequencyIsAllowed(contactId, orgId, 'email')
        : false;
      const slackAllowed = pref.slack_enabled
        ? await frequencyIsAllowed(contactId, orgId, 'slack')
        : false;

      const novuPref = {
        email_enabled: emailAllowed,
        slack_enabled: slackAllowed,
      };

      const sentViaNovu = await dispatchViaNovu(orgId, userId, notification, novuPref);
      if (sentViaNovu) {
        if (novuPref.email_enabled) attempted.push('email');
        if (novuPref.slack_enabled) attempted.push('slack');
        if (attempted.length) {
          await query('UPDATE notifications SET delivered_channels = $1 WHERE id = $2',
            [['in_app', ...attempted], notification.id]).catch(() => {});
        }
        return attempted;
      }
      // If Novu trigger returned null (transient failure), fall through to direct dispatch
      log('warn', { event: 'novu_dispatch_fallback', notifId: notification.id }, 'Novu trigger failed — falling back to direct dispatch');
    }

    // Direct dispatch fallback (original behavior, also used when NOVU_API_KEY absent)
    if (pref.email_enabled) { await SENDERS.email(orgId, userId, notification); attempted.push('email'); }
    if (pref.slack_enabled) { await SENDERS.slack(orgId, userId, notification); attempted.push('slack'); }

    if (attempted.length) {
      await query('UPDATE notifications SET delivered_channels = $1 WHERE id = $2',
        [['in_app', ...attempted], notification.id]).catch(() => {});
    }
    return attempted;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', { event: 'channel_dispatch_failed', err: msg }, 'channel dispatch failed');
    return [];
  }
}

// ── Novu workflow trigger helpers (used by other routes) ─────────────────────

/** Trigger the survey-invite Novu workflow for a subscriber. No-op when Novu is unconfigured. */
export async function triggerSurveyInvite(
  subscriberId: string,
  payload: {
    surveyTitle: string;
    surveyUrl: string;
    contactName?: string;
    customMessage?: string;
    emailHtml?: string;
    estimatedMinutes?: number;
    reminderDelayDays?: number;
    sendSmsReminder?: boolean;
    contactEmail?: string;
    contactId?: string;
    orgId: string;
  }
): Promise<void> {
  const { orgId, contactEmail, contactId, ...workflowPayload } = payload;
  const channel = 'email';
  // Suppression check — honour unsubscribes and GDPR requests before sending
  if (contactEmail || contactId) {
    const suppressed = await isSuppressed(orgId, channel, {
      email: contactEmail,
      contactId: contactId,
    });
    if (suppressed) {
      log('info', { channel, orgId }, 'notify:suppressed:skipped');
      return;
    }
  }
  await triggerWorkflow('survey-invite', subscriberId, workflowPayload as Record<string, unknown>);
}

/** Trigger the close-the-loop Novu workflow for a subscriber. No-op when Novu is unconfigured. */
export async function triggerCloseTheLoop(
  subscriberId: string,
  payload: {
    contactName?: string;
    acknowledgment?: string;
    actionTaken?: string;
    ctaUrl?: string;
    senderName?: string;
    senderAvatar?: string;
    emailHtml?: string;
    contactEmail?: string;
    contactId?: string;
    orgId: string;
  }
): Promise<void> {
  const { orgId, contactEmail, contactId, ...workflowPayload } = payload;
  const channel = 'email';
  // Suppression check — honour unsubscribes and GDPR requests before sending
  if (contactEmail || contactId) {
    const suppressed = await isSuppressed(orgId, channel, {
      email: contactEmail,
      contactId: contactId,
    });
    if (suppressed) {
      log('info', { channel, orgId }, 'notify:suppressed:skipped');
      return;
    }
  }
  await triggerWorkflow('close-the-loop', subscriberId, workflowPayload as Record<string, unknown>);
}

/** Trigger the insight-ready Novu workflow for a subscriber. No-op when Novu is unconfigured. */
export async function triggerInsightReady(
  subscriberId: string,
  payload: {
    surveyTitle: string;
    insightCount: number;
    responseCount?: number;
    narrativeSummary?: string;
    topDriver?: string;
    insightsUrl?: string;
    sendEmail?: boolean;
    contactEmail?: string;
    contactId?: string;
    orgId: string;
  }
): Promise<void> {
  const { orgId, contactEmail, contactId, ...workflowPayload } = payload;
  const channel = 'email';
  // Suppression check — honour unsubscribes and GDPR requests before sending
  if (contactEmail || contactId) {
    const suppressed = await isSuppressed(orgId, channel, {
      email: contactEmail,
      contactId: contactId,
    });
    if (suppressed) {
      log('info', { channel, orgId }, 'notify:suppressed:skipped');
      return;
    }
  }
  await triggerWorkflow('insight-ready', subscriberId, workflowPayload as Record<string, unknown>);
}

/** Trigger the sla-breach Novu workflow for a subscriber. No-op when Novu is unconfigured. */
export async function triggerSlaAlert(
  subscriberId: string,
  payload: {
    caseTitle: string;
    tier: string;
    overdueBy: string;
    escalatedTo: string;
    caseUrl?: string;
    sendSms?: boolean;
    sendToSlack?: boolean;
    contactEmail?: string;
    contactId?: string;
    orgId: string;
  }
): Promise<void> {
  const { orgId, contactEmail, contactId, ...workflowPayload } = payload;
  const channel = 'email';
  // Suppression check — honour unsubscribes and GDPR requests before sending
  if (contactEmail || contactId) {
    const suppressed = await isSuppressed(orgId, channel, {
      email: contactEmail,
      contactId: contactId,
    });
    if (suppressed) {
      log('info', { channel, orgId }, 'notify:suppressed:skipped');
      return;
    }
  }
  await triggerWorkflow('sla-breach', subscriberId, workflowPayload as Record<string, unknown>);
}
