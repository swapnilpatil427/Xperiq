import { query, pool } from './db';
import logger from './logger';
import { sendSlackWebhook } from './slack';

// Types
export interface BroadcastPayload {
  surveyTitle?: string;
  surveyUrl?: string;
  subject?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  senderName?: string;
}

export interface CreateBroadcastInput {
  name: string;
  description?: string;
  segmentId?: string;
  contactIds?: string[];
  workflowId?: string;
  channels?: string[];
  payload: BroadcastPayload;
  orgId: string;
  createdBy: string;
}

/** Create a broadcast in pending_approval state. Returns the broadcast row. */
export async function createBroadcast(input: CreateBroadcastInput): Promise<Record<string, unknown>> {
  const { name, description, segmentId, contactIds, workflowId, channels, payload, orgId, createdBy } = input;

  // Estimate contact count
  let estimatedCount = 0;
  if (segmentId) {
    const { rows: [seg] } = await query<{ contact_count: number }>(
      'SELECT contact_count FROM contact_segments WHERE id = $1 AND org_id = $2', [segmentId, orgId]
    );
    estimatedCount = seg?.contact_count ?? 0;
  } else if (contactIds?.length) {
    estimatedCount = contactIds.length;
  }

  // Wrap the broadcast INSERT + audit log INSERT in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [broadcast] } = await client.query(
      `INSERT INTO outreach_broadcasts
         (org_id, name, description, created_by, segment_id, contact_ids, estimated_count,
          workflow_id, channels, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING *`,
      [orgId, name, description ?? null, createdBy, segmentId ?? null,
       contactIds ? JSON.stringify(contactIds) : null,
       estimatedCount, workflowId ?? 'transactional-outreach',
       channels ?? ['email'], JSON.stringify(payload)]
    );

    // Audit
    await client.query(
      'INSERT INTO broadcast_audit_log (broadcast_id, actor_user_id, action) VALUES ($1,$2,$3)',
      [broadcast.id, createdBy, 'created']
    );

    await client.query('COMMIT');
    return broadcast;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Notify all super_admins/admins in the org about a pending broadcast via Slack. */
export async function notifyApprovers(orgId: string, broadcast: Record<string, unknown>): Promise<void> {
  try {
    // Get org Slack webhook
    const { rows: [channel] } = await query(
      `SELECT config FROM notification_channels
       WHERE org_id = $1 AND channel_type = 'slack' AND is_active = TRUE AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [orgId]
    );
    const webhookUrl = (channel?.config as Record<string, string> | undefined)?.webhook_url;
    if (!webhookUrl) return;

    await sendSlackWebhook(webhookUrl, {
      text: `:rotating_light: *Broadcast Approval Required*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:rotating_light: *Broadcast Approval Required*\n*"${broadcast.name}"*\n${broadcast.description || ''}\n*Recipients:* ~${broadcast.estimated_count} contacts\n*Channels:* ${(broadcast.channels as string[]).join(', ')}\n*Expires:* 72 hours`,
          },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `Review and approve in Experient: */app/broadcasts/approval*` },
        },
      ],
    });
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), broadcastId: broadcast.id }, 'broadcast:approverNotify:failed');
  }
}

/** Approve a broadcast. Status → 'approved'. Does NOT trigger — just marks approved. */
export async function approveBroadcast(broadcastId: string, orgId: string, approverId: string): Promise<Record<string, unknown>> {
  const { rows: [broadcast] } = await query(
    `UPDATE outreach_broadcasts
     SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND org_id = $3 AND status = 'pending_approval' AND expires_at > NOW()
     RETURNING *`,
    [approverId, broadcastId, orgId]
  );
  if (!broadcast) throw new Error('Broadcast not found or not in pending_approval state');

  await query(
    'INSERT INTO broadcast_audit_log (broadcast_id, actor_user_id, action, note) VALUES ($1,$2,$3,$4)',
    [broadcastId, approverId, 'approved', null]
  );
  return broadcast;
}

/** Reject a broadcast with a reason. */
export async function rejectBroadcast(broadcastId: string, orgId: string, rejectorId: string, reason: string): Promise<void> {
  const { rows } = await query(
    `UPDATE outreach_broadcasts
     SET status = 'rejected', rejected_by = $1, rejected_at = NOW(), rejection_reason = $2, updated_at = NOW()
     WHERE id = $3 AND org_id = $4 AND status = 'pending_approval'
     RETURNING id`,
    [rejectorId, reason, broadcastId, orgId]
  );
  if (rows.length === 0) {
    throw new Error('Broadcast not in pending_approval state');
  }
  await query(
    'INSERT INTO broadcast_audit_log (broadcast_id, actor_user_id, action, note) VALUES ($1,$2,$3,$4)',
    [broadcastId, rejectorId, 'rejected', reason]
  );
}

/** List broadcasts for org with pagination. */
export async function listBroadcasts(
  orgId: string,
  status?: string,
  page = 1,
  limit = 20
): Promise<{ broadcasts: Record<string, unknown>[]; total: number }> {
  const offset = (page - 1) * limit;
  const conditions = ['org_id = $1'];
  const params: unknown[] = [orgId];
  let p = 2;
  if (status) { conditions.push(`status = $${p++}`); params.push(status); }
  const where = conditions.join(' AND ');

  const [{ rows }, { rows: [{ count }] }] = await Promise.all([
    query(`SELECT * FROM outreach_broadcasts WHERE ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`, [...params, limit, offset]),
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM outreach_broadcasts WHERE ${where}`, params),
  ]);
  return { broadcasts: rows, total: parseInt(count, 10) };
}

/** Get audit trail for a broadcast. */
export async function getBroadcastAudit(broadcastId: string, orgId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await query(
    `SELECT bal.*, up.display_name AS actor_name
     FROM broadcast_audit_log bal
     LEFT JOIN user_profiles up ON up.user_id = bal.actor_user_id AND up.org_id = $2
     WHERE bal.broadcast_id = $1 ORDER BY bal.created_at ASC`,
    [broadcastId, orgId]
  );
  return rows;
}
