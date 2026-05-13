const express = require('express');
const { db } = require('../lib/admin');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** Single doc per org — same field names as Postgres org_profiles (snake_case). */
function profileRef(orgId) {
  return db.collection('orgs').doc(orgId).collection('internal').doc('orgProfile');
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const snap = await profileRef(req.orgId).get();
    if (!snap.exists) return res.json({ profile: null });
    const data = snap.data();
    res.json({
      profile: {
        id:               data.id ?? null,
        org_id:           req.orgId,
        industry:         data.industry ?? null,
        company_size:     data.company_size ?? null,
        use_case:         data.use_case ?? null,
        target_audience:  data.target_audience ?? null,
        website:          data.website ?? null,
        brand_description: data.brand_description ?? null,
        brand_name:       data.brand_name ?? null,
        brand_colors:     data.brand_colors || {},
        brand_fonts:      data.brand_fonts || {},
        created_at:       data.created_at?.toDate?.()?.toISOString?.() ?? null,
        updated_at:       data.updated_at?.toDate?.()?.toISOString?.() ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const {
      industry, company_size, use_case, target_audience,
      website, brand_description, brand_name, brand_colors, brand_fonts,
    } = req.body;
    const ref = profileRef(req.orgId);
    const snap = await ref.get();
    const now = new Date();
    const base = snap.exists ? snap.data() : {};
    const next = {
      ...base,
      org_id:           req.orgId,
      industry:         industry !== undefined ? industry : base.industry ?? null,
      company_size:     company_size !== undefined ? company_size : base.company_size ?? null,
      use_case:         use_case !== undefined ? use_case : base.use_case ?? null,
      target_audience:  target_audience !== undefined ? target_audience : base.target_audience ?? null,
      website:          website !== undefined ? website : base.website ?? null,
      brand_description: brand_description !== undefined ? brand_description : base.brand_description ?? null,
      brand_name:       brand_name !== undefined ? brand_name : base.brand_name ?? null,
      brand_colors:     brand_colors !== undefined ? brand_colors : base.brand_colors || {},
      brand_fonts:      brand_fonts !== undefined ? brand_fonts : base.brand_fonts || {},
      updated_at:       now,
    };
    if (!snap.exists) next.created_at = now;
    await ref.set(next, { merge: true });
    const out = (await ref.get()).data();
    res.json({
      profile: {
        id:               out.id ?? null,
        org_id:           req.orgId,
        industry:         out.industry ?? null,
        company_size:     out.company_size ?? null,
        use_case:         out.use_case ?? null,
        target_audience:  out.target_audience ?? null,
        website:          out.website ?? null,
        brand_description: out.brand_description ?? null,
        brand_name:       out.brand_name ?? null,
        brand_colors:     out.brand_colors || {},
        brand_fonts:      out.brand_fonts || {},
        created_at:       out.created_at?.toDate?.()?.toISOString?.() ?? null,
        updated_at:       out.updated_at?.toDate?.()?.toISOString?.() ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
