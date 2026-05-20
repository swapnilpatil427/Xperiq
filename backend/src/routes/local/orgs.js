const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { requireAuth } = require('../../middleware/auth');
const { validate }    = require('../../lib/validate');
const { createOrgSchema, updateOrgSchema } = require('../../schemas/orgs');
const db = require('../../lib/db');
const router = express.Router();

const BACKEND = process.env.BACKEND || 'firebase';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// POST /api/orgs — upsert org row
router.post('/', requireAuth, validate(createOrgSchema), async (req, res) => {
  try {
    const { name } = req.body;
    const { rows } = await db.query(
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orgs/me — get current org
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT org_id, brand_name, logo_url, industry, company_size, use_case, target_audience, website, brand_description, brand_colors, brand_fonts FROM org_profiles WHERE org_id = $1',
      [req.orgId]
    );
    if (!rows[0]) {
      return res.json({ org: { orgId: req.orgId, name: null, logoUrl: null } });
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orgs/me — update org name + logo URL
router.put('/me', requireAuth, validate(updateOrgSchema), async (req, res) => {
  try {
    const { name, logoUrl } = req.body;

    const { rows } = await db.query(
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
    if (process.env.SKIP_AUTH !== 'true' && name && process.env.CLERK_SECRET_KEY) {
      try {
        const { createClerkClient } = require('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        await clerk.organizations.updateOrganization(req.orgId, { name });
      } catch { /* non-fatal — log but don't fail the request */ }
    }

    res.json({ org: { orgId: row.org_id, name: row.brand_name, logoUrl: row.logo_url } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orgs/me/logo — upload logo
router.post('/me/logo', requireAuth, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    let logoUrl;

    if (BACKEND === 'firebase') {
      const { storage } = require('../../lib/admin');
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Org analytics rollup ──────────────────────────────────────────────────────

router.get('/me/analytics', requireAuth, async (req, res) => {
  try {
    // Survey + response totals
    const { rows: [totals] } = await db.query(
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
    const { rows: dailySeries } = await db.query(
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
    const { rows: bySurvey } = await db.query(
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch org analytics' });
  }
});

module.exports = router;
