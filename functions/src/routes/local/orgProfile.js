const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const db = require('../../lib/db');
const router = express.Router();

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS org_profiles (
      id                SERIAL PRIMARY KEY,
      org_id            TEXT UNIQUE NOT NULL,
      industry          TEXT,
      company_size      TEXT,
      use_case          TEXT,
      target_audience   TEXT,
      website           TEXT,
      brand_description TEXT,
      brand_name        TEXT,
      brand_colors      JSONB DEFAULT '{}',
      brand_fonts       JSONB DEFAULT '{}',
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
ensureTable().catch(console.error);

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM org_profiles WHERE org_id = $1', [req.orgId]);
    res.json({ profile: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const {
      industry, company_size, use_case, target_audience,
      website, brand_description, brand_name, brand_colors, brand_fonts,
    } = req.body;
    const { rows } = await db.query(
      `INSERT INTO org_profiles
         (org_id, industry, company_size, use_case, target_audience,
          website, brand_description, brand_name, brand_colors, brand_fonts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (org_id) DO UPDATE SET
         industry          = EXCLUDED.industry,
         company_size      = EXCLUDED.company_size,
         use_case          = EXCLUDED.use_case,
         target_audience   = EXCLUDED.target_audience,
         website           = EXCLUDED.website,
         brand_description = EXCLUDED.brand_description,
         brand_name        = EXCLUDED.brand_name,
         brand_colors      = EXCLUDED.brand_colors,
         brand_fonts       = EXCLUDED.brand_fonts,
         updated_at        = NOW()
       RETURNING *`,
      [
        req.orgId,
        industry || null,
        company_size || null,
        use_case || null,
        target_audience || null,
        website || null,
        brand_description || null,
        brand_name || null,
        JSON.stringify(brand_colors || {}),
        JSON.stringify(brand_fonts || {}),
      ]
    );
    res.json({ profile: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
