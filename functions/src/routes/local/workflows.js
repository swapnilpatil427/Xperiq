const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const db = require('../../lib/db');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM workflows WHERE org_id = $1 ORDER BY created_at DESC',
      [req.orgId]
    );
    res.json({ workflows: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, condition, action } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await db.query(
      `INSERT INTO workflows (org_id, name, condition, action, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.orgId, name, JSON.stringify(condition || {}), JSON.stringify(action || {}), req.userId]
    );
    res.status(201).json({ workflow: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, condition, action, status } = req.body;
    const sets = ['updated_at = NOW()'];
    const vals = [];
    let i = 1;
    if (name      !== undefined) { sets.push(`name = $${i++}`);      vals.push(name); }
    if (condition !== undefined) { sets.push(`condition = $${i++}`); vals.push(JSON.stringify(condition)); }
    if (action    !== undefined) { sets.push(`action = $${i++}`);    vals.push(JSON.stringify(action)); }
    if (status    !== undefined) { sets.push(`status = $${i++}`);    vals.push(status); }

    vals.push(req.params.id, req.orgId);
    await db.query(
      `UPDATE workflows SET ${sets.join(', ')} WHERE id = $${i++} AND org_id = $${i}`,
      vals
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM workflows WHERE id = $1 AND org_id = $2', [req.params.id, req.orgId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE workflows
       SET status = CASE WHEN status = 'active' THEN 'paused' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $1 AND org_id = $2
       RETURNING status`,
      [req.params.id, req.orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ status: rows[0].status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
