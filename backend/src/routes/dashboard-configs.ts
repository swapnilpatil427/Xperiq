// Dashboard config API. Mounted at /api/dashboard-configs.
// Stores one configurable widget dashboard per org (widgets + filters + name).
import express from 'express';
import type { Request, Response } from 'express';
import { query } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { serverError } from '../lib/httpError';

const router = express.Router();

// GET /api/dashboard-configs — load org's saved dashboard config
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      'SELECT * FROM dashboard_configs WHERE org_id = $1',
      [req.orgId]
    );
    res.json({ config: rows[0] || null });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'dashboard_configs_get' });
  }
});

// PUT /api/dashboard-configs — upsert org's dashboard config
router.put('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, widgets, filters } = req.body as {
      name?: string;
      widgets: unknown[];
      filters: unknown;
    };
    const { rows } = await query(
      `INSERT INTO dashboard_configs (org_id, name, widgets, filters, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (org_id) DO UPDATE SET
         name       = EXCLUDED.name,
         widgets    = EXCLUDED.widgets,
         filters    = EXCLUDED.filters,
         updated_at = NOW()
       RETURNING *`,
      [req.orgId, name || 'My Dashboard', JSON.stringify(widgets), JSON.stringify(filters), req.userId]
    );
    res.json({ config: rows[0] });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { endpoint: 'dashboard_configs_put' });
  }
});

export default router;
