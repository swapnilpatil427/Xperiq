// Seat licensing API. Mounted at /api/seats.
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { serverError } from '../lib/httpError';
import { seatBreakdown } from '../lib/seats';

const router = express.Router();

// GET /api/seats/breakdown — usage by role + plan limit + grace status
router.get('/breakdown', requireAuth, requirePermission('users:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await seatBreakdown(req.orgId));
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
