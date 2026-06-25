/**
 * Contact Identity & Consent routes (Tier 3 Closed-Loop Action Platform)
 *
 *   POST   /api/contacts                         — Create contact
 *   GET    /api/contacts                         — List org contacts (paginated, PII-masked)
 *   GET    /api/contacts/:id                     — Get contact + linked responses
 *   PUT    /api/contacts/:id                     — Update contact (PII fields require data:pii)
 *   DELETE /api/contacts/:id                     — GDPR anonymization (null-out PII, retain row)
 *   POST   /api/contacts/import                  — CSV bulk import (upsert)
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireContactsPermission, contactsPiiAllowed } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import {
  createContactSchema,
  updateContactSchema,
  importContactsSchema,
} from '../schemas/contacts';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';
import logger from '../lib/logger';

const router = express.Router();

// ── PII helpers ───────────────────────────────────────────────────────────────

interface ContactRow {
  id: string;
  org_id: string;
  external_id: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  account_id: string | null;
  account_name: string | null;
  segment_attrs: Record<string, unknown>;
  consent_given: boolean;
  consent_at: string | null;
  anonymized_at: string | null;
  data_region: string;
  import_source: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Mask PII fields (email/name/phone) with null when the caller lacks data:pii.
 * Returns a new object — does not mutate in place.
 */
function maskPii<T extends { email?: string | null; name?: string | null; phone?: string | null }>(
  contact: T,
  hasPii: boolean
): T {
  if (hasPii) return contact;
  return { ...contact, email: null, name: null, phone: null };
}

// ── POST /api/contacts ────────────────────────────────────────────────────────

router.post('/', requireAuth, requireContactsPermission('contacts:write'), validate(createContactSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const hasPii = contactsPiiAllowed(req);
    const body = req.body as {
      external_id?: string;
      email?: string;
      name?: string;
      phone?: string;
      account_id?: string;
      account_name?: string;
      segment_attrs?: Record<string, unknown>;
      consent_given?: boolean;
      data_region?: string;
    };

    // Require data:pii to write PII fields
    if (!hasPii && (body.email || body.name || body.phone)) {
      clientError(res, 403, 'data:pii permission required to write email, name, or phone');
      return;
    }

    const { rows } = await query<ContactRow>(
      `INSERT INTO contacts
         (org_id, external_id, email, name, phone, account_id, account_name,
          segment_attrs, consent_given, consent_at, data_region, import_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               CASE WHEN $9 THEN NOW() ELSE NULL END,
               $10, 'api')
       RETURNING *`,
      [
        req.orgId,
        body.external_id ?? null,
        body.email ?? null,
        body.name ?? null,
        body.phone ?? null,
        body.account_id ?? null,
        body.account_name ?? null,
        JSON.stringify(body.segment_attrs ?? {}),
        body.consent_given ?? false,
        body.data_region ?? 'us',
      ]
    );
    res.status(201).json({ contact: maskPii(rows[0], hasPii) });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') {
      clientError(res, 409, 'A contact with this external_id or email already exists in this org');
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/contacts ─────────────────────────────────────────────────────────

router.get('/', requireAuth, requireContactsPermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const hasPii = contactsPiiAllowed(req);
    const search     = typeof req.query.search === 'string' ? req.query.search : null;
    const accountId  = typeof req.query.account_id === 'string' ? req.query.account_id : null;
    const consent    = typeof req.query.consent === 'string' ? req.query.consent : null;
    const page       = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
    const limit      = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset     = (page - 1) * limit;

    const params: unknown[] = [req.orgId];
    const conditions: string[] = ['org_id = $1', 'anonymized_at IS NULL'];

    if (accountId) {
      params.push(accountId);
      conditions.push(`account_id = $${params.length}`);
    }

    if (consent === 'true' || consent === 'false') {
      params.push(consent === 'true');
      conditions.push(`consent_given = $${params.length}`);
    }

    // PII-aware search: only search by name/email when caller has data:pii
    if (search) {
      if (hasPii) {
        params.push(`%${search}%`);
        conditions.push(`(email ILIKE $${params.length} OR name ILIKE $${params.length} OR external_id ILIKE $${params.length} OR account_name ILIKE $${params.length})`);
      } else {
        params.push(`%${search}%`);
        conditions.push(`(external_id ILIKE $${params.length} OR account_name ILIKE $${params.length})`);
      }
    }

    const where = conditions.join(' AND ');

    const { rows: countRows } = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM contacts WHERE ${where}`,
      params
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    params.push(limit, offset);
    const { rows } = await query<ContactRow>(
      `SELECT * FROM contacts WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      contacts: rows.map((c) => maskPii(c, hasPii)),
      total,
      page,
      limit,
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ contacts: [], total: 0, page: 1, limit: 50 }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/contacts/:id ─────────────────────────────────────────────────────

router.get('/:id', requireAuth, requireContactsPermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const hasPii = contactsPiiAllowed(req);
    const { rows } = await query<ContactRow>(
      'SELECT * FROM contacts WHERE id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );

    if (!rows[0]) {
      clientError(res, 404, 'Contact not found');
      return;
    }

    // Fetch linked responses
    const { rows: responses } = await query(
      `SELECT r.id, r.survey_id, r.submitted_at, r.distribution_token,
              s.title AS survey_title
         FROM responses r
         LEFT JOIN surveys s ON s.id = r.survey_id::uuid
        WHERE r.contact_id = $1
        ORDER BY r.submitted_at DESC
        LIMIT 50`,
      [req.params.id]
    );

    res.json({
      contact: maskPii(rows[0], hasPii),
      responses,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── PUT /api/contacts/:id ─────────────────────────────────────────────────────

router.put('/:id', requireAuth, requireContactsPermission('contacts:write'), validate(updateContactSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const hasPii = contactsPiiAllowed(req);
    const body = req.body as {
      external_id?: string;
      email?: string;
      name?: string;
      phone?: string;
      account_id?: string;
      account_name?: string;
      segment_attrs?: Record<string, unknown>;
      consent_given?: boolean;
      data_region?: string;
    };

    if (!hasPii && (body.email !== undefined || body.name !== undefined || body.phone !== undefined)) {
      clientError(res, 403, 'data:pii permission required to update email, name, or phone');
      return;
    }

    // Verify ownership
    const { rows: existing } = await query<{ id: string }>(
      'SELECT id FROM contacts WHERE id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );
    if (!existing[0]) {
      clientError(res, 404, 'Contact not found');
      return;
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];

    const fieldMap: Record<string, unknown> = {
      external_id:   body.external_id,
      email:         body.email,
      name:          body.name,
      phone:         body.phone,
      account_id:    body.account_id,
      account_name:  body.account_name,
      segment_attrs: body.segment_attrs !== undefined ? JSON.stringify(body.segment_attrs) : undefined,
      consent_given: body.consent_given,
      data_region:   body.data_region,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val === undefined) continue;
      params.push(val);
      setClauses.push(`${col} = $${params.length}`);
      if (col === 'consent_given' && val === true) {
        setClauses.push('consent_at = NOW()');
      }
    }

    params.push(req.params.id, req.orgId);
    const { rows } = await query<ContactRow>(
      `UPDATE contacts SET ${setClauses.join(', ')}
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );

    res.json({ contact: maskPii(rows[0], hasPii) });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') {
      clientError(res, 409, 'Duplicate external_id or email for this org');
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── DELETE /api/contacts/:id — GDPR anonymization ────────────────────────────

router.delete('/:id', requireAuth, requireContactsPermission('contacts:anonymize'), async (req: Request, res: Response): Promise<void> => {
  try {
    // Require data:pii to perform erasure (it touches PII fields)
    const hasPii = contactsPiiAllowed(req);
    if (!hasPii) {
      clientError(res, 403, 'data:pii permission required to anonymize contacts');
      return;
    }

    const { rowCount } = await query(
      `UPDATE contacts
       SET anonymized_at = NOW(),
           email         = NULL,
           name          = NULL,
           phone         = NULL,
           updated_at    = NOW()
       WHERE id = $1 AND org_id = $2 AND anonymized_at IS NULL`,
      [req.params.id, req.orgId]
    );

    if (!rowCount) {
      clientError(res, 404, 'Contact not found or already anonymized');
      return;
    }

    logger.info({ contactId: req.params.id, actor: req.userId }, 'contact anonymized (GDPR)');
    res.status(204).end();
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/contacts/import — bulk upsert ────────────────────────────────────

router.post('/import', requireAuth, requireContactsPermission('contacts:import'), validate(importContactsSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const hasPii = contactsPiiAllowed(req);
    const { contacts } = req.body as {
      contacts: Array<{
        external_id?: string;
        email?: string;
        name?: string;
        phone?: string;
        account_id?: string;
        account_name?: string;
        segment_attrs?: Record<string, unknown>;
        consent_given?: boolean;
      }>;
    };

    let created = 0;
    let updated = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];

      if (!hasPii && (c.email || c.name || c.phone)) {
        errors.push({ index: i, message: 'data:pii permission required to import email, name, or phone' });
        continue;
      }

      try {
        // Upsert by (org_id, external_id) if external_id present, else (org_id, email)
        let sql: string;
        let params: unknown[];

        if (c.external_id) {
          sql = `INSERT INTO contacts
                   (org_id, external_id, email, name, phone, account_id, account_name,
                    segment_attrs, consent_given, consent_at, import_source)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                         CASE WHEN $9 THEN NOW() ELSE NULL END, 'csv')
                 ON CONFLICT (org_id, external_id) DO UPDATE
                   SET email         = EXCLUDED.email,
                       name          = EXCLUDED.name,
                       phone         = EXCLUDED.phone,
                       account_id    = EXCLUDED.account_id,
                       account_name  = EXCLUDED.account_name,
                       segment_attrs = EXCLUDED.segment_attrs,
                       consent_given = EXCLUDED.consent_given,
                       consent_at    = CASE WHEN EXCLUDED.consent_given AND contacts.consent_at IS NULL
                                            THEN NOW() ELSE contacts.consent_at END,
                       updated_at    = NOW()
                 RETURNING (xmax = 0) AS was_inserted`;
          params = [
            req.orgId, c.external_id, c.email ?? null, c.name ?? null, c.phone ?? null,
            c.account_id ?? null, c.account_name ?? null,
            JSON.stringify(c.segment_attrs ?? {}), c.consent_given ?? false,
          ];
        } else {
          // Upsert by email (non-null guaranteed by schema refine).
          // ON CONFLICT predicate must match contacts_org_email_active_uniq exactly.
          sql = `INSERT INTO contacts
                   (org_id, email, name, phone, account_id, account_name,
                    segment_attrs, consent_given, consent_at, import_source)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                         CASE WHEN $8 THEN NOW() ELSE NULL END, 'csv')
                 ON CONFLICT (org_id, email) WHERE anonymized_at IS NULL AND email IS NOT NULL DO UPDATE
                   SET name          = EXCLUDED.name,
                       phone         = EXCLUDED.phone,
                       account_id    = EXCLUDED.account_id,
                       account_name  = EXCLUDED.account_name,
                       segment_attrs = EXCLUDED.segment_attrs,
                       consent_given = EXCLUDED.consent_given,
                       consent_at    = CASE WHEN EXCLUDED.consent_given AND contacts.consent_at IS NULL
                                            THEN NOW() ELSE contacts.consent_at END,
                       updated_at    = NOW()
                 RETURNING (xmax = 0) AS was_inserted`;
          params = [
            req.orgId, c.email!, c.name ?? null, c.phone ?? null, c.account_id ?? null,
            c.account_name ?? null,
            JSON.stringify(c.segment_attrs ?? {}), c.consent_given ?? false,
          ];
        }

        const { rows } = await query<{ was_inserted: boolean }>(sql, params);
        if (rows[0]?.was_inserted) {
          created++;
        } else {
          updated++;
        }
      } catch (itemErr: unknown) {
        const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
        errors.push({ index: i, message: msg });
      }
    }

    res.json({ created, updated, errors });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/contacts/:id/activity — full activity timeline ──────────────────

router.get('/:id/activity', requireAuth, requireContactsPermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const { rows: [contact] } = await query(
      `SELECT id FROM contacts WHERE id = $1 AND org_id = $2 AND anonymized_at IS NULL`,
      [id, req.orgId]
    );
    if (!contact) { clientError(res, 404, 'Contact not found'); return; }

    // Check PII permission — answers field in responses contains raw survey data
    const hasPii = contactsPiiAllowed(req);

    // Linked responses (via distribution token OR contact_response_links)
    const { rows: tokenResponses } = await query(
      `SELECT r.id, r.survey_id, s.title AS survey_title, r.submitted_at, r.answers
       FROM responses r
       JOIN surveys s ON s.id = r.survey_id
       WHERE r.contact_id = $1 AND s.org_id = $2
       ORDER BY r.submitted_at DESC LIMIT 25`,
      [id, req.orgId]
    );

    const { rows: linkedResponses } = await query(
      `SELECT r.id, r.survey_id, s.title AS survey_title, r.submitted_at, crl.linked_at, crl.linked_by
       FROM contact_response_links crl
       JOIN responses r ON r.id = crl.response_id
       JOIN surveys s ON s.id = r.survey_id
       WHERE crl.contact_id = $1 AND s.org_id = $2
       ORDER BY r.submitted_at DESC LIMIT 25`,
      [id, req.orgId]
    );

    // Cases
    const { rows: cases } = await query(
      `SELECT id, title, status, severity, created_at, resolved_at
       FROM cx_cases WHERE contact_id = $1 AND org_id = $2
       ORDER BY created_at DESC LIMIT 10`,
      [id, req.orgId]
    );

    // Segment memberships
    const { rows: segments } = await query(
      `SELECT cs.id, cs.name, cs.color, csm.added_at
       FROM contact_segment_members csm
       JOIN contact_segments cs ON cs.id = csm.segment_id
       WHERE csm.contact_id = $1 AND cs.org_id = $2
       ORDER BY csm.added_at DESC`,
      [id, req.orgId]
    );

    // Strip answers when caller lacks PII permission
    const sanitizeResponse = (r: Record<string, unknown>) =>
      hasPii ? r : { ...r, answers: null };

    // Merge and sort activity timeline
    const timeline = [
      ...tokenResponses.map((r) => ({ type: 'response', source: 'token', linked_by: 'token', ts: r.submitted_at, ...sanitizeResponse(r as Record<string, unknown>) })),
      ...linkedResponses.map((r) => ({ type: 'response', source: r.linked_by, linked_by: r.linked_by, ts: r.submitted_at, ...sanitizeResponse(r as Record<string, unknown>) })),
      ...cases.map((c) => ({ type: 'case', ts: c.created_at, ...c })),
    ].sort((a, b) => new Date(b.ts as string).getTime() - new Date(a.ts as string).getTime());

    res.json({ timeline, segments });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// ── POST /api/contacts/link-responses — bulk backfill auto-linking ────────────

router.post('/link-responses', requireAuth, requireContactsPermission('contacts:write'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { backfillResponseLinks } = await import('../lib/contactLinker');
    const limit = Math.min(parseInt(String((req.body as { limit?: unknown })?.limit ?? '500'), 10) || 500, 2000);
    const result = await backfillResponseLinks(req.orgId, limit);
    res.json(result);
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

// ── POST /api/contacts/:id/link-response — manually link one response ─────────

router.post('/:id/link-response', requireAuth, requireContactsPermission('contacts:write'), async (req: Request, res: Response): Promise<void> => {
  const { response_id } = req.body as { response_id?: unknown };
  if (!response_id || typeof response_id !== 'string') {
    clientError(res, 400, 'response_id required'); return;
  }
  try {
    const { rows: [contact] } = await query(
      `SELECT id FROM contacts WHERE id = $1 AND org_id = $2`, [req.params.id, req.orgId]
    );
    if (!contact) { clientError(res, 404, 'Contact not found'); return; }
    const { rows: [resp] } = await query(
      `SELECT r.id, r.survey_id FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE r.id = $1 AND s.org_id = $2`,
      [response_id, req.orgId]
    );
    if (!resp) { clientError(res, 404, 'Response not found'); return; }
    await query(
      `INSERT INTO contact_response_links (contact_id, response_id, survey_id, linked_by)
       VALUES ($1,$2,$3,'manual') ON CONFLICT DO NOTHING`,
      [req.params.id, response_id, resp.survey_id]
    );
    res.json({ success: true });
  } catch (err) { serverError(res, err instanceof Error ? err : new Error(String(err))); }
});

export default router;
