/**
 * Slack webhook utilities for case notifications.
 * Uses Node.js native fetch (Node 18+).
 * 5-second timeout enforced via AbortController.
 */

export interface SlackMessage {
  text: string;
  blocks?: unknown[];  // Slack Block Kit blocks
}

/**
 * POST to webhookUrl with JSON body. Throws on non-200. 5s timeout.
 */
export async function sendSlackWebhook(webhookUrl: string, message: SlackMessage): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Slack webhook request failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let body = '';
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(
      `Slack webhook returned ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`
    );
  }
}

// ── Severity badge map ────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high:     '🟠',
  medium:   '🟡',
  low:      '🟢',
};

function severityEmoji(severity: string): string {
  return SEVERITY_EMOJI[severity] ?? '⚪';
}

// ── Block Kit helpers ─────────────────────────────────────────────────────────

interface SectionBlock {
  type: 'section';
  text: { type: 'mrkdwn'; text: string };
}

function section(text: string): SectionBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

// ── Public message builders ───────────────────────────────────────────────────

/**
 * Nicely formatted Block Kit message for case creation events.
 * Includes severity badge (emoji), title, owner, optional survey title and driver.
 */
export function buildCaseCreatedBlock(caseData: {
  title: string;
  severity: string;
  owner_label: string;
  survey_title?: string;
  driver_ref?: string;
}): SlackMessage {
  const emoji = severityEmoji(caseData.severity);
  const severityLabel = caseData.severity.charAt(0).toUpperCase() + caseData.severity.slice(1);

  const lines: string[] = [
    `${emoji} *New ${severityLabel} Case: ${caseData.title}*`,
    `*Assigned to:* ${caseData.owner_label}`,
  ];

  if (caseData.survey_title) {
    lines.push(`*Survey:* ${caseData.survey_title}`);
  }
  if (caseData.driver_ref) {
    lines.push(`*Driver:* ${caseData.driver_ref}`);
  }

  const blocks: SectionBlock[] = [section(lines.join('\n'))];

  const textFallback =
    `${emoji} New ${severityLabel} Case: ${caseData.title} — Assigned to: ${caseData.owner_label}`;

  return { text: textFallback, blocks };
}

/**
 * Escalation notification block.
 */
export function buildCaseEscalatedBlock(caseData: {
  title: string;
  escalation_tier: number;
  new_owner_label: string;
}): SlackMessage {
  const tierLabel = `Tier ${caseData.escalation_tier}`;

  const body = [
    `🔔 *Case Escalated — ${tierLabel}*`,
    `*Case:* ${caseData.title}`,
    `*Now assigned to:* ${caseData.new_owner_label}`,
  ].join('\n');

  const blocks: SectionBlock[] = [section(body)];

  const textFallback =
    `Case escalated (${tierLabel}): ${caseData.title} — Now assigned to: ${caseData.new_owner_label}`;

  return { text: textFallback, blocks };
}
