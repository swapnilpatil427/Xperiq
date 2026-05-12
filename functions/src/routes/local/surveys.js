const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const db = require('../../lib/db');
const { surveysCreated } = require('../../lib/metrics');
const router = express.Router();

// List surveys — single query with response count
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, COUNT(r.id)::int AS response_count
       FROM surveys s
       LEFT JOIN responses r ON r.survey_id = s.id
       WHERE s.org_id = $1
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [req.orgId]
    );
    res.json({ surveys: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get single survey
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, COUNT(r.id)::int AS response_count
       FROM surveys s
       LEFT JOIN responses r ON r.survey_id = s.id
       WHERE s.id = $1 AND s.org_id = $2
       GROUP BY s.id`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Survey not found' });
    res.json({ survey: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create survey
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, questions = [], survey_type_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });

    const { rows } = await db.query(
      `INSERT INTO surveys (org_id, title, status, questions, created_by, survey_type_id)
       VALUES ($1, $2, 'draft', $3, $4, $5)
       RETURNING *`,
      [req.orgId, title, JSON.stringify(questions), req.userId, survey_type_id || null]
    );
    surveysCreated.inc({ type: survey_type_id || 'untyped' });
    res.status(201).json({ survey: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update survey
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { title, status, questions, description } = req.body;
    const sets = ['updated_at = NOW()'];
    const vals = [];
    let i = 1;
    if (title       !== undefined) { sets.push(`title = $${i++}`);       vals.push(title); }
    if (status      !== undefined) { sets.push(`status = $${i++}`);      vals.push(status); }
    if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description); }
    if (questions   !== undefined) { sets.push(`questions = $${i++}`);   vals.push(JSON.stringify(questions)); }

    vals.push(req.params.id, req.orgId);
    const { rowCount } = await db.query(
      `UPDATE surveys SET ${sets.join(', ')} WHERE id = $${i++} AND org_id = $${i}`,
      vals
    );
    if (!rowCount) return res.status(404).json({ error: 'Survey not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete survey
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM surveys WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Publish survey
router.post('/:id/publish', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE surveys SET status = 'active', updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING publish_token`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Survey not found' });
    res.json({ publishToken: rows[0].publish_token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
