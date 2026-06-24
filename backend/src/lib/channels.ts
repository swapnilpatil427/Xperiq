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
import { query } from './db';

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

/**
 * Dispatch a persisted notification to the user's enabled non-in-app channels.
 * Best-effort: never throws into the caller.
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
