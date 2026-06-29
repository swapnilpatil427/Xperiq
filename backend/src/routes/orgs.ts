import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth, DEV_MODE } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../lib/validate';
import { createOrgSchema, updateOrgSchema } from '../schemas/orgs';
import { updateOrgInsightDefaultsSchema, ORG_INSIGHT_DEFAULT_KEYS } from '../schemas/insightSettings';
import { query } from '../lib/db';
import logger from '../lib/logger';
import { serverError } from '../lib/httpError';

const router = express.Router();

const BACKEND = process.env.BACKEND ?? 'firebase';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// POST /api/orgs — upsert org row
router.post('/', requireAuth, validate(createOrgSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    const { rows } = await query(
      `INSERT INTO org_profiles (org_id, brand_name)
       VALUES ($1, $2)
       ON CONFLICT (org_id) DO UPDATE SET
         brand_name = COALESCE(EXCLUDED.brand_name, org_profiles.brand_name),
         updated_at = NOW()
       RETURNING org_id, brand_name, logo_url`,
      [req.orgId, name || null]
    );
    const row = rows[0];
    res.json({ org: { orgId: row.org_id, name: row.brand_name, logoUrl: row.logo_url } });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// GET /api/orgs/me — get current org
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await query(
      'SELECT org_id, brand_name, logo_url, industry, company_size, use_case, target_audience, website, brand_description, brand_colors, brand_fonts FROM org_profiles WHERE org_id = $1',
      [req.orgId]
    );
    if (!rows[0]) {
      res.json({ org: { orgId: req.orgId, name: null, logoUrl: null } });
      return;
    }
    const row = rows[0];
    res.json({
      org: {
        orgId:            row.org_id,
        name:             row.brand_name,
        logoUrl:          row.logo_url,
        industry:         row.industry,
        company_size:     row.company_size,
        use_case:         row.use_case,
        target_audience:  row.target_audience,
        website:          row.website,
        brand_description: row.brand_description,
        brand_colors:     row.brand_colors,
        brand_fonts:      row.brand_fonts,
      },
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PUT /api/orgs/me — update org name + logo URL
router.put('/me', requireAuth, validate(updateOrgSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, logoUrl } = req.body;

    const { rows } = await query(
      `INSERT INTO org_profiles (org_id, brand_name, logo_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id) DO UPDATE SET
         brand_name = COALESCE(EXCLUDED.brand_name, org_profiles.brand_name),
         logo_url   = COALESCE(EXCLUDED.logo_url,   org_profiles.logo_url),
         updated_at = NOW()
       RETURNING org_id, brand_name, logo_url`,
      [req.orgId, name || null, logoUrl || null]
    );
    const row = rows[0];

    // Sync name to Clerk when not in dev-bypass mode
    if (!DEV_MODE && name) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createClerkClient } = require('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        await clerk.organizations.updateOrganization(req.orgId, { name });
      } catch { /* non-fatal — log but don't fail the request */ }
    }

    res.json({ org: { orgId: row.org_id, name: row.brand_name, logoUrl: row.logo_url } });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/orgs/me/logo — upload logo
router.post('/me/logo', requireAuth, upload.single('logo'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file provided' }); return; }

    let logoUrl: string;

    if (BACKEND === 'firebase') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { storage } = require('../lib/admin');
      const ext = path.extname(req.file.originalname) || '.png';
      const filePath = `orgs/${req.orgId}/logo${ext}`;
      const bucket = storage.bucket();
      const fileRef = bucket.file(filePath);
      await fileRef.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        public: true,
      });
      const [metadata] = await fileRef.getMetadata();
      logoUrl = metadata.mediaLink || `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    } else {
      // Dev mode: base64 data URL so the logo preview works without cloud storage
      logoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    res.json({ logoUrl });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// ── Org analytics rollup ──────────────────────────────────────────────────────

router.get('/me/analytics', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Survey + response totals
    const { rows: [totals] } = await query(
      `SELECT
         COUNT(DISTINCT s.id)::int                                          AS total_surveys,
         COUNT(DISTINCT CASE WHEN s.status = 'active' THEN s.id END)::int  AS active_surveys,
         COUNT(r.id)::int                                                   AS total_responses,
         ROUND(AVG(s.nps_score)::numeric, 1)                               AS avg_nps
       FROM surveys s
       LEFT JOIN responses r ON r.survey_id = s.id AND r.org_id = $1
       WHERE s.org_id = $1 AND s.deleted_at IS NULL`,
      [req.orgId],
    );

    // Org-wide responses per day — last 30 days
    const { rows: dailySeries } = await query(
      `SELECT
         TO_CHAR(DATE_TRUNC('day', submitted_at), 'YYYY-MM-DD') AS day,
         COUNT(*)::int AS count
       FROM responses
       WHERE org_id = $1 AND submitted_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE_TRUNC('day', submitted_at)
       ORDER BY DATE_TRUNC('day', submitted_at)`,
      [req.orgId],
    );

    // Response volume per survey (top 5)
    const { rows: bySurvey } = await query(
      `SELECT s.id, s.title, COUNT(r.id)::int AS response_count
       FROM surveys s
       LEFT JOIN responses r ON r.survey_id = s.id AND r.org_id = $1
       WHERE s.org_id = $1 AND s.deleted_at IS NULL
       GROUP BY s.id, s.title
       ORDER BY response_count DESC
       LIMIT 5`,
      [req.orgId],
    );

    res.json({
      total_surveys:    totals.total_surveys    || 0,
      active_surveys:   totals.active_surveys   || 0,
      total_responses:  totals.total_responses  || 0,
      avg_nps:          totals.avg_nps != null ? parseFloat(totals.avg_nps) : null,
      responses_by_day: dailySeries,
      top_surveys:      bySurvey,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch org analytics' });
  }
});

// ── Org-level insight defaults (Phase 1) ──────────────────────────────────────

// GET /api/orgs/:orgId/insight-defaults — any member of that org.
router.get('/:orgId/insight-defaults', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;
  // Tenancy: a caller may only read their own org's defaults.
  if (orgId !== req.orgId) {
    res.status(403).json({ error: 'Cannot read another org\'s insight defaults' });
    return;
  }
  try {
    let row: Record<string, unknown> = {};
    try {
      const { rows } = await query('SELECT * FROM org_insight_defaults WHERE org_id = $1', [orgId]);
      row = (rows[0] as Record<string, unknown>) ?? {};
    } catch (e: unknown) {
      // org_insight_defaults not migrated yet — return nulls.
      logger.warn({ err: (e as Error).message, orgId }, 'orgs:insight-defaults:get:table_unavailable');
    }

    const defaults: Record<string, unknown> = {};
    for (const key of ORG_INSIGHT_DEFAULT_KEYS) {
      defaults[key] = row[key] ?? null;
    }
    res.json({ org_id: orgId, defaults, updated_at: row.updated_at ?? null, updated_by: row.updated_by ?? null });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PATCH /api/orgs/:orgId/insight-defaults — brand_admin only.
router.patch(
  '/:orgId/insight-defaults',
  requireAuth,
  requireRole('admin'),
  validate(updateOrgInsightDefaultsSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { orgId } = req.params;
    if (orgId !== req.orgId) {
      res.status(403).json({ error: 'Cannot modify another org\'s insight defaults' });
      return;
    }
    try {
      const patch = req.body as Record<string, unknown>;
      const keys = Object.keys(patch);
      if (keys.length === 0) {
        res.status(400).json({ error: 'No defaults provided' });
        return;
      }

      const insertCols = ['org_id', ...keys, 'updated_by'];
      const insertParams: unknown[] = [orgId, ...keys.map(k => patch[k]), req.userId];
      const placeholders = insertParams.map((_, i) => `$${i + 1}`);
      const updateAssignments = keys.map(k => `${k} = EXCLUDED.${k}`);
      updateAssignments.push('updated_by = EXCLUDED.updated_by');
      updateAssignments.push('updated_at = NOW()');

      const { rows } = await query(
        `INSERT INTO org_insight_defaults (${insertCols.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT (org_id) DO UPDATE SET
           ${updateAssignments.join(',\n           ')}
         RETURNING *`,
        insertParams,
      );

      const row = (rows[0] as Record<string, unknown>) ?? {};
      const defaults: Record<string, unknown> = {};
      for (const key of ORG_INSIGHT_DEFAULT_KEYS) {
        defaults[key] = row[key] ?? null;
      }
      logger.info({ orgId, keys, by: req.userId }, 'orgs:insight-defaults:patched');
      res.json({ org_id: orgId, defaults, updated_at: row.updated_at ?? null, updated_by: row.updated_by ?? null });
    } catch (err: unknown) {
      logger.error({ err: (err as Error).message, orgId }, 'orgs:insight-defaults:patch:error');
      serverError(res, err instanceof Error ? err : new Error(String(err)));
    }
  },
);

export default router;
