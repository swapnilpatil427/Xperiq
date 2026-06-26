/**
 * Ownership Intelligence routes (Tier 3 Closed-Loop Action Platform)
 *
 * Maps segment/account/touchpoint/driver → real Clerk user identity.
 * Crystal uses these routes to resolve owners before emitting case proposals.
 *
 *   GET    /api/ownership-routes           — List rules for org
 *   POST   /api/ownership-routes           — Create rule (upsert on dimension+value)
 *   PUT    /api/ownership-routes/:id       — Update rule
 *   DELETE /api/ownership-routes/:id       — Delete rule
 *   GET    /api/ownership-routes/resolve   — Resolve owner for dimension+value (query)
 *   POST   /api/ownership-routes/resolve   — Resolve owner for dimension+value (body)
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../lib/validate';
import {
  createOwnershipRouteSchema,
  updateOwnershipRouteSchema,
} from '../schemas/cases';
import { query } from '../lib/db';
import { serverError, clientError } from '../lib/httpError';

const router = express.Router();

interface OwnershipRoute {
  id: string;
  org_id: string;
  dimension: string;
  match_value: string;
  match_type: string;
  owner_user_id: string;
  owner_label: string | null;
  owner_email: string | null;
  escalation_user_id: string | null;
  escalation_label: string | null;
  priority: number;
  role_label: string | null;
  created_at: string;
}

function matchesRule(rule: OwnershipRoute, value: string): boolean {
  const mv = rule.match_value;
  switch (rule.match_type) {
    case 'exact':    return mv === value;
    case 'prefix':   return value.startsWith(mv);
    case 'contains': return value.includes(mv);
    case 'regex': {
      try {
        return new RegExp(mv).test(value);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

async function handleResolve(
  req: Request,
  res: Response,
  dimension: string | null,
  value: string | null,
): Promise<void> {
  if (!dimension || !value) {
    clientError(res, 400, 'dimension and value are required');
    return;
  }

  const { rows } = await query<OwnershipRoute>(
    `SELECT * FROM ownership_routes
     WHERE org_id = $1 AND dimension = $2
     ORDER BY priority ASC`,
    [req.orgId, dimension]
  );

  for (const rule of rows) {
    if (matchesRule(rule, value)) {
      res.json({ matched: true, route: rule });
      return;
    }
  }

  res.json({ matched: false, route: null });
}

// ── GET/POST /api/ownership-routes/resolve — before /:id ─────────────────────

router.get('/resolve', requireAuth, requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const dimension = typeof req.query.dimension === 'string' ? req.query.dimension : null;
    const value     = typeof req.query.value     === 'string' ? req.query.value     : null;
    await handleResolve(req, res, dimension, value);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ matched: false, route: null }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

router.post('/resolve', requireAuth, requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { dimension?: string; value?: string };
    await handleResolve(req, res, body.dimension ?? null, body.value ?? null);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ matched: false, route: null }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── GET /api/ownership-routes ────────────────────────────────────────────────

router.get('/', requireAuth, requirePermission('contacts:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const dimension = typeof req.query.dimension === 'string' ? req.query.dimension : null;
    const params: unknown[] = [req.orgId];
    let where = 'org_id = $1';

    if (dimension) {
      params.push(dimension);
      where += ` AND dimension = $${params.length}`;
    }

    const { rows } = await query<OwnershipRoute>(
      `SELECT * FROM ownership_routes WHERE ${where} ORDER BY dimension, priority ASC`,
      params
    );
    res.json({ routes: rows });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '42P01') { res.json({ routes: [] }); return; }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── POST /api/ownership-routes ───────────────────────────────────────────────

router.post('/', requireAuth, requirePermission('workflows:manage'), validate(createOwnershipRouteSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      dimension: string;
      match_value: string;
      match_type?: string;
      owner_user_id: string;
      owner_label?: string;
      owner_email?: string;
      escalation_user_id?: string;
      escalation_label?: string;
      priority?: number;
      role_label?: string;
    };

    const { rows } = await query<OwnershipRoute>(
      `INSERT INTO ownership_routes
         (org_id, dimension, match_value, match_type,
          owner_user_id, owner_label, owner_email,
          escalation_user_id, escalation_label,
          priority, role_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (org_id, dimension, match_value) DO UPDATE
         SET match_type          = EXCLUDED.match_type,
             owner_user_id       = EXCLUDED.owner_user_id,
             owner_label         = EXCLUDED.owner_label,
             owner_email         = EXCLUDED.owner_email,
             escalation_user_id  = EXCLUDED.escalation_user_id,
             escalation_label    = EXCLUDED.escalation_label,
             priority            = EXCLUDED.priority,
             role_label          = EXCLUDED.role_label
       RETURNING *`,
      [
        req.orgId,
        body.dimension,
        body.match_value,
        body.match_type ?? 'exact',
        body.owner_user_id,
        body.owner_label ?? null,
        body.owner_email ?? null,
        body.escalation_user_id ?? null,
        body.escalation_label ?? null,
        body.priority ?? 0,
        body.role_label ?? null,
      ]
    );
    res.status(201).json({ route: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── PUT /api/ownership-routes/:id ────────────────────────────────────────────

router.put('/:id', requireAuth, requirePermission('workflows:manage'), validate(updateOwnershipRouteSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      dimension?: string;
      match_value?: string;
      match_type?: string;
      owner_user_id?: string;
      owner_label?: string;
      owner_email?: string;
      escalation_user_id?: string;
      escalation_label?: string;
      priority?: number;
      role_label?: string;
    };

    const { rows: existing } = await query<{ id: string }>(
      'SELECT id FROM ownership_routes WHERE id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );
    if (!existing[0]) {
      clientError(res, 404, 'Ownership route not found');
      return;
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    const fieldMap: Record<string, unknown> = {
      dimension:          body.dimension,
      match_value:        body.match_value,
      match_type:         body.match_type,
      owner_user_id:      body.owner_user_id,
      owner_label:        body.owner_label,
      owner_email:        body.owner_email,
      escalation_user_id: body.escalation_user_id,
      escalation_label:   body.escalation_label,
      priority:           body.priority,
      role_label:         body.role_label,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val === undefined) continue;
      params.push(val);
      setClauses.push(`${col} = $${params.length}`);
    }

    if (setClauses.length === 0) {
      clientError(res, 400, 'No fields to update');
      return;
    }

    params.push(req.params.id, req.orgId);
    const { rows } = await query<OwnershipRoute>(
      `UPDATE ownership_routes SET ${setClauses.join(', ')}
       WHERE id = $${params.length - 1} AND org_id = $${params.length}
       RETURNING *`,
      params
    );

    res.json({ route: rows[0] });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') {
      clientError(res, 409, 'A route with this dimension and match_value already exists');
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── DELETE /api/ownership-routes/:id ─────────────────────────────────────────

router.delete('/:id', requireAuth, requirePermission('workflows:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rowCount } = await query(
      'DELETE FROM ownership_routes WHERE id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );

    if (!rowCount) {
      clientError(res, 404, 'Ownership route not found');
      return;
    }

    res.status(204).end();
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
