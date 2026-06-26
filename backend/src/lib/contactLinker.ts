import { query } from './db';
import logger from './logger';

/**
 * Auto-link a response to a contact based on email fields in the response data.
 * Called after response submission when no distribution token was present.
 * Only links if contact with matching email exists AND has consent_given = true.
 */
export async function autoLinkResponse(
  responseId: string,
  surveyId: string,
  orgId: string,
  answersJson: unknown
): Promise<void> {
  try {
    // Check if already audited
    const { rows: [existing] } = await query(
      `SELECT response_id FROM contact_link_audit WHERE response_id = $1`, [responseId]
    );
    if (existing) return;

    // Extract email from answers (look for 'email' key anywhere in answers)
    const email = extractEmail(answersJson);
    if (!email) {
      await query(
        `INSERT INTO contact_link_audit (response_id, result) VALUES ($1, 'no_email') ON CONFLICT DO NOTHING`,
        [responseId]
      );
      return;
    }

    // Find consented contact with this email in same org
    const { rows: [contact] } = await query(
      `SELECT id FROM contacts WHERE org_id = $1 AND email = $2 AND consent_given = TRUE AND anonymized_at IS NULL`,
      [orgId, email.toLowerCase()]
    );

    if (!contact) {
      await query(
        `INSERT INTO contact_link_audit (response_id, result) VALUES ($1, 'no_match') ON CONFLICT DO NOTHING`,
        [responseId]
      );
      return;
    }

    // Insert link
    await query(
      `INSERT INTO contact_response_links (contact_id, response_id, survey_id, linked_by)
       VALUES ($1, $2, $3, 'auto') ON CONFLICT DO NOTHING`,
      [contact.id, responseId, surveyId]
    );

    await query(
      `INSERT INTO contact_link_audit (response_id, result, contact_id)
       VALUES ($1, 'linked', $2) ON CONFLICT DO NOTHING`,
      [responseId, contact.id]
    );

    logger.info({ responseId, contactId: contact.id, email }, 'response:autoLinked');
  } catch (err: unknown) {
    logger.error({ err: err instanceof Error ? err.message : String(err), responseId }, 'contactLinker:error');
    await query(
      `INSERT INTO contact_link_audit (response_id, result) VALUES ($1, 'error') ON CONFLICT DO NOTHING`,
      [responseId]
    ).catch(() => {});
  }
}

function extractEmail(answers: unknown): string | null {
  if (!answers || typeof answers !== 'object') return null;
  const search = (obj: unknown): string | null => {
    if (typeof obj === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj)) return obj;
    if (Array.isArray(obj)) {
      for (const item of obj) { const r = search(item); if (r) return r; }
    }
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (key.toLowerCase().includes('email')) {
          const val = (obj as Record<string, unknown>)[key];
          if (typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return val;
        }
        const r = search((obj as Record<string, unknown>)[key]);
        if (r) return r;
      }
    }
    return null;
  };
  return search(answers);
}

/**
 * Bulk backfill: scan responses without a contact_id, attempt to link by email.
 * Respects the audit table to skip already-processed responses.
 * Returns counts of processed/linked/skipped.
 */
export async function backfillResponseLinks(
  orgId: string,
  limit = 500
): Promise<{ processed: number; linked: number; skipped: number }> {
  // Get unaudited responses for this org
  const { rows: responses } = await query<{ id: string; survey_id: string; answers: unknown }>(
    `SELECT r.id, r.survey_id, r.answers
     FROM responses r
     LEFT JOIN contact_link_audit a ON a.response_id = r.id
     JOIN surveys s ON s.id = r.survey_id
     WHERE s.org_id = $1 AND r.contact_id IS NULL AND a.response_id IS NULL
     LIMIT $2`,
    [orgId, limit]
  );

  let linked = 0;
  let skipped = 0;
  for (const r of responses) {
    await autoLinkResponse(r.id, r.survey_id, orgId, r.answers);
    // Check if it was linked
    const { rows: [audit] } = await query(
      `SELECT result FROM contact_link_audit WHERE response_id = $1`, [r.id]
    );
    if (audit?.result === 'linked') linked++;
    else skipped++;
  }

  return { processed: responses.length, linked, skipped };
}
