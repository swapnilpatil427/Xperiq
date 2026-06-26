/**
 * CX Case Management routes (Tier 3 Closed-Loop Action Platform)
 *
 *   POST   /api/cases              — Create case (from Crystal proposal)
 *   GET    /api/cases              — List cases (filter by status/severity/owner/survey)
 *   GET    /api/cases/sla-dashboard — SLA health aggregate
 *   GET    /api/cases/:id          — Get case + contact + escalations
 *   PUT    /api/cases/:id          — Update case fields (audit-logged)
 *   POST   /api/cases/:id/events   — Append event to audit_log
 *   GET    /api/cases/sla-configs — Get SLA config (org + platform defaults merged)
 *   PUT    /api/cases/sla-configs — Upsert org SLA config entries
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth, DEV_MODE } from '../middleware/auth';
import { requirePermission, evaluatePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import {
  createCaseSchema,
  updateCaseSchema,
  appendEventSchema,
  upsertSlaConfigsSchema,
} from '../schemas/cases';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';
import logger from '../lib/logger';
import { calcSlaDueDates, getSlaStatus } from '../lib/sla';
import type { SlaRow } from '../lib/sla';

const router = express.Router();

// ── PII helper ────────────────────────────────────────────────────────────────

async function hasPiiPermission(req: Request): Promise<boolean> {
  if (DEV_MODE) return true;
  try {
    return await evaluatePermission(req.userId!, req.orgId!, 'data', 'org', 'data:pii');
  } catch {
    return false;
  }
}

function maskContactPii<T extends { email?: string | null; name?: string | null; phone?: string | null } | null | undefined>(
  contact: T,
  hasPii: boolean
): T {
  if (!contact || hasPii) return contact;
  return { ...contact, email: null, name: null, phone: null };
}

// ── GET /api/cases/sla-dashboard — must be before /:id ────────────────────────

router.get('/sla-dashboard', requireAuth, requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query<{
      open_count: string;
      at_risk_count: string;
      breached_count: string;
      critical_count: string;
      high_count: string;
      medium_count: string;
      low_count: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed'))::text AS open_count,
         COUNT(*) FILTER (
           WHERE status NOT IN ('resolved','closed')
             AND sla_breached = false
             AND acked_at IS NULL
             AND ack_due_at IS NOT NULL
             AND ack_due_at < NOW() + INTERVAL '2 hours'
             AND ack_due_at > NOW()
         )::text AS at_risk_count,
         COUNT(*) FILTER (WHERE sla_breached = true)::text AS breached_count,
         COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('resolved','closed'))::text AS critical_count,
         COUNT(*) FILTER (WHERE severity = 'high'     AND status NOT IN ('resolved','closed'))::text AS high_count,
         COUNT(*) FILTER (WHERE severity = 'medium'   AND status NOT IN ('resolved','closed'))::text AS medium_count,
         COUNT(*) FILTER (WHERE severity = 'low'      AND status NOT IN ('resolved','closed'))::text AS low_count
       FROM cx_cases
       WHERE org_id = $1`,
      [req.orgId]
    );

    const r = rows[0] ?? {};
    res.json({
      open_count:    parseInt(r.open_count    ?? '0', 10),
      at_risk_count: parseInt(r.at_risk_count ?? '0', 10),
      breached_count: parseInt(r.breached_count ?? '0', 10),
      by_severity: {
        critical: parseInt(r.critical_count ?? '0', 10),
        high:     parseInt(r.high_count     ?? '0', 10),
        medium:   parseInt(r.medium_count   ?? '0', 10),
        low:      parseInt(r.low_count      ?? '0', 10),
      },
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') {
      res.json({ open_count: 0, at_risk_count: 0, breached_count: 0, by_severity: { critical: 0, high: 0, medium: 0, low: 0 } });
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

function mergeConfigs(platform: SlaRow[], orgOverrides: SlaRow[]): SlaRow[] {
  const map = new Map<string, SlaRow>();
  for (const row of platform) {
    map.set(`${row.category}:${row.severity}`, row);
  }
  for (const row of orgOverrides) {
    map.set(`${row.category}:${row.severity}`, row);
  }
  return Array.from(map.values());
}

// ── GET /api/cases/sla-configs — before /:id ───────────────────────────────────

router.get('/sla-configs', requireAuth, requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query<SlaRow>(
      `SELECT org_id, category, severity, ack_sla_hrs, resolve_sla_hrs
         FROM cx_sla_configs
        WHERE org_id IN ($1, '')
        ORDER BY org_id DESC, category, severity`,
      [req.orgId]
    );

    const platformDefaults = rows.filter((r) => r.org_id === '');
    const orgOverrides     = rows.filter((r) => r.org_id === req.orgId);

    res.json({
      platform_defaults: platformDefaults,
      org_overrides:     orgOverrides,
      merged:            mergeConfigs(platformDefaults, orgOverrides),
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ platform_defaults: [], org_overrides: [], merged: [] }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── PUT /api/cases/sla-configs ─────────────────────────────────────────────────

router.put('/sla-configs', requireAuth, requirePermission('workflows:manage'), validate(upsertSlaConfigsSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { configs } = req.body as {
      configs: Array<{
        category: string;
        severity: string;
        ack_sla_hrs: number;
        resolve_sla_hrs?: number | null;
      }>;
    };

    for (const cfg of configs) {
      await query(
        `INSERT INTO cx_sla_configs (org_id, category, severity, ack_sla_hrs, resolve_sla_hrs)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (org_id, category, severity) DO UPDATE
           SET ack_sla_hrs     = EXCLUDED.ack_sla_hrs,
               resolve_sla_hrs = EXCLUDED.resolve_sla_hrs`,
        [req.orgId, cfg.category, cfg.severity, cfg.ack_sla_hrs, cfg.resolve_sla_hrs ?? null]
      );
    }

    const { rows } = await query<SlaRow>(
      'SELECT * FROM cx_sla_configs WHERE org_id = $1 ORDER BY category, severity',
      [req.orgId]
    );
    res.json({ configs: rows });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/cases ─────────────────────────────────────────────────────────────

router.post('/', requireAuth, requirePermission('contacts:write'), validate(createCaseSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      contact_id?: string;
      response_id?: string;
      survey_id?: string;
      insight_id?: string;
      title: string;
      description?: string;
      category?: string;
      severity?: string;
      driver_ref?: string;
      proposal_id?: string;
      owner_user_id?: string;
      owner_label?: string;
    };

    const severity = body.severity ?? 'medium';
    const category = body.category ?? 'cx';

    // Load SLA configs to compute deadlines
    const { rows: slaConfigs } = await query<SlaRow>(
      `SELECT org_id, category, severity, ack_sla_hrs, resolve_sla_hrs
         FROM cx_sla_configs
        WHERE org_id IN ($1, '')`,
      [req.orgId]
    );

    const { ackDueAt, resolveDueAt } = calcSlaDueDates(severity, category, slaConfigs);

    const initialAuditEntry = {
      ts: new Date().toISOString(),
      actor: req.userId,
      action: 'created',
      note: body.proposal_id
        ? `Case created from Crystal proposal ${body.proposal_id}`
        : 'Case created',
    };

    const { rows } = await query(
      `INSERT INTO cx_cases
         (org_id, contact_id, response_id, survey_id, insight_id, title, description, category, severity,
          driver_ref, proposal_id, owner_user_id, owner_label,
          ack_due_at, resolve_due_at,
          audit_log, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               jsonb_build_array($16::jsonb), $17, 'open')
       RETURNING *`,
      [
        req.orgId,
        body.contact_id ?? null,
        body.response_id ?? null,
        body.survey_id ?? null,
        body.insight_id ?? null,
        body.title,
        body.description ?? null,
        category,
        severity,
        body.driver_ref ?? null,
        body.proposal_id ?? null,
        body.owner_user_id ?? null,
        body.owner_label ?? null,
        ackDueAt.toISOString(),
        resolveDueAt?.toISOString() ?? null,
        JSON.stringify(initialAuditEntry),
        req.userId,
      ]
    );

    logger.info({ caseId: rows[0].id, orgId: req.orgId, actor: req.userId }, 'cx case created');
    res.status(201).json({ case: rows[0] });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') {
      clientError(res, 503, 'Cases feature not yet migrated — run pending migrations');
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/cx/cases ─────────────────────────────────────────────────────────

router.get('/', requireAuth, requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const hasPii = await hasPiiPermission(req);
    const status        = typeof req.query.status         === 'string' ? req.query.status         : null;
    const severity      = typeof req.query.severity       === 'string' ? req.query.severity       : null;
    const ownerUserId   = typeof req.query.owner_user_id  === 'string' ? req.query.owner_user_id  : null;
    const surveyId      = typeof req.query.survey_id      === 'string' ? req.query.survey_id      : null;
    const search        = typeof req.query.search         === 'string' ? req.query.search         : null;
    const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset = (page - 1) * limit;

    const params: unknown[] = [req.orgId];
    const conditions: string[] = ['c.org_id = $1'];

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (severity) {
      params.push(severity);
      conditions.push(`c.severity = $${params.length}`);
    }
    if (ownerUserId) {
      params.push(ownerUserId);
      conditions.push(`c.owner_user_id = $${params.length}`);
    }
    if (surveyId) {
      params.push(surveyId);
      conditions.push(`c.response_id IN (SELECT id FROM responses WHERE survey_id = $${params.length} AND org_id = $1)`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`c.title ILIKE $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const { rows: countRows } = await query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM cx_cases c WHERE ${where}`,
      params
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT c.*,
              con.email AS contact_email,
              con.name  AS contact_name,
              con.account_name AS contact_account_name
         FROM cx_cases c
         LEFT JOIN contacts con ON con.id = c.contact_id
        WHERE ${where}
        ORDER BY
          CASE c.severity
            WHEN 'critical' THEN 1
            WHEN 'high'     THEN 2
            WHEN 'medium'   THEN 3
            WHEN 'low'      THEN 4
            ELSE 5
          END,
          c.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const maskedRows = rows.map((r) => {
      const { contact_email, contact_name, contact_account_name, ...caseData } = r as Record<string, unknown>;
      return {
        ...caseData,
        contact: maskContactPii(
          {
            email:        contact_email as string | null,
            name:         contact_name as string | null,
            account_name: contact_account_name as string | null,
          },
          hasPii
        ),
        sla_status: getSlaStatus({
          ack_due_at:     (caseData.ack_due_at     as string | null) ?? null,
          resolve_due_at: (caseData.resolve_due_at as string | null) ?? null,
          acked_at:       (caseData.acked_at       as string | null) ?? null,
          sla_breached:   (caseData.sla_breached as boolean | null) ?? null,
          resolved_at:    (caseData.resolved_at  as string | null) ?? null,
        }),
      };
    });

    res.json({ cases: maskedRows, total, page, limit });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ cases: [], total: 0, page: 1, limit: 50 }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/cx/cases/:id ─────────────────────────────────────────────────────

router.get('/:id', requireAuth, requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const hasPii = await hasPiiPermission(req);

    const { rows } = await query(
      `SELECT c.*,
              con.email        AS contact_email,
              con.name         AS contact_name,
              con.phone        AS contact_phone,
              con.account_name AS contact_account_name,
              con.segment_attrs AS contact_segment_attrs
         FROM cx_cases c
         LEFT JOIN contacts con ON con.id = c.contact_id
        WHERE c.id = $1 AND c.org_id = $2`,
      [req.params.id, req.orgId]
    );

    if (!rows[0]) {
      clientError(res, 404, 'Case not found');
      return;
    }

    const { contact_email, contact_name, contact_phone, contact_account_name, contact_segment_attrs, ...caseData } = rows[0] as Record<string, unknown>;

    const contact = contact_email !== undefined || contact_name !== undefined
      ? maskContactPii(
          { email: contact_email as string | null, name: contact_name as string | null, phone: contact_phone as string | null, account_name: contact_account_name, segment_attrs: contact_segment_attrs },
          hasPii
        )
      : null;

    res.json({
      case: {
        ...caseData,
        sla_status: getSlaStatus({
          ack_due_at:     (caseData.ack_due_at     as string | null) ?? null,
          resolve_due_at: (caseData.resolve_due_at as string | null) ?? null,
          acked_at:       (caseData.acked_at       as string | null) ?? null,
          sla_breached:   (caseData.sla_breached as boolean | null) ?? null,
          resolved_at:    (caseData.resolved_at   as string | null) ?? null,
        }),
      },
      contact,
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── PUT /api/cx/cases/:id ─────────────────────────────────────────────────────

router.put('/:id', requireAuth, requirePermission('contacts:write'), validate(updateCaseSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      status?: string;
      severity?: string;
      owner_user_id?: string;
      owner_label?: string;
      description?: string;
      note?: string;
    };

    // Fetch current state for audit log
    const { rows: current } = await query<{
      status: string;
      owner_user_id: string | null;
      audit_log: unknown[];
      acked_at: string | null;
      resolved_at: string | null;
    }>(
      'SELECT status, owner_user_id, audit_log, acked_at, resolved_at FROM cx_cases WHERE id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );

    if (!current[0]) {
      clientError(res, 404, 'Case not found');
      return;
    }

    const prev = current[0];
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    const auditEntries: unknown[] = [];
    const now = new Date().toISOString();

    if (body.status !== undefined && body.status !== prev.status) {
      params.push(body.status);
      setClauses.push(`status = $${params.length}`);

      auditEntries.push({
        ts: now, actor: req.userId, action: 'status_changed',
        from_status: prev.status, to_status: body.status, note: body.note ?? null,
      });

      // Set acked_at on first transition away from 'open'
      if (prev.status === 'open' && body.status !== 'open' && !prev.acked_at) {
        setClauses.push('acked_at = NOW()');
      }

      // Set resolved_at on resolved/closed
      if (['resolved', 'closed'].includes(body.status) && !prev.resolved_at) {
        setClauses.push('resolved_at = NOW()');
      }
    }

    if (body.owner_user_id !== undefined && body.owner_user_id !== prev.owner_user_id) {
      params.push(body.owner_user_id);
      setClauses.push(`owner_user_id = $${params.length}`);

      auditEntries.push({
        ts: now, actor: req.userId, action: 'owner_changed',
        from_owner: prev.owner_user_id, to_owner: body.owner_user_id, note: body.note ?? null,
      });
    }

    if (body.owner_label !== undefined) {
      params.push(body.owner_label);
      setClauses.push(`owner_label = $${params.length}`);
    }
    if (body.description !== undefined) {
      params.push(body.description);
      setClauses.push(`description = $${params.length}`);
    }
    if (body.severity !== undefined) {
      params.push(body.severity);
      setClauses.push(`severity = $${params.length}`);
    }

    // Append audit entries
    if (auditEntries.length > 0) {
      params.push(JSON.stringify(auditEntries));
      setClauses.push(`audit_log = audit_log || $${params.length}::jsonb`);
    }

    params.push(req.params.id, req.orgId);
    const { rows } = await query(
      `UPDATE cx_cases SET ${setClauses.join(', ')}
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );

    if (!rows[0]) { res.status(404).json({ error: 'Case not found' }); return; }
    res.json({ case: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/cx/cases/:id/events ─────────────────────────────────────────────

router.post('/:id/events', requireAuth, requirePermission('contacts:write'), validate(appendEventSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, note } = req.body as { action: string; note?: string };

    const entry = {
      ts: new Date().toISOString(),
      actor: req.userId,
      action,
      note: note ?? null,
    };

    const { rows } = await query<{ audit_log: unknown[] }>(
      `UPDATE cx_cases
       SET audit_log  = audit_log || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND org_id = $3
       RETURNING audit_log`,
      [JSON.stringify([entry]), req.params.id, req.orgId]
    );

    if (!rows[0]) {
      clientError(res, 404, 'Case not found');
      return;
    }

    res.json({ audit_log: rows[0].audit_log });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
