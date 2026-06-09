// Seat licensing API. Mounted at /api/seats.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { serverError } = require('../lib/httpError');
const { seatBreakdown } = require('../lib/seats');

const router = express.Router();

// GET /api/seats/breakdown — usage by role + plan limit + grace status
router.get('/breakdown', requireAuth, requirePermission('users:manage'), async (req, res) => {
  try {
    res.json(await seatBreakdown(req.orgId));
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
