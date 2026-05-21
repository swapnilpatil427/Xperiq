const express = require('express');
const crypto  = require('crypto');
const db = require('../lib/db');
const { serverError } = require('../lib/httpError');
const logger = require('../lib/logger');
const router = express.Router();

function checkPassword(plain, stored) {
  const [salt, hash] = stored.split(':');
  try {
    const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

router.get('/surveys/:token', async (req, res) => {
  try {
    const { rows: [survey] } = await db.query(
      `SELECT id, title, description, questions, thank_you_message, status,
              password_protected
       FROM surveys WHERE publish_token = $1 LIMIT 1`,
      [req.params.token]
    );
    if (!survey) return res.status(404).json({ error: 'survey_not_found' });

    if (survey.status !== 'active') {
      const code = survey.status === 'closed' ? 'survey_closed'
                 : survey.status === 'paused' ? 'survey_paused'
                 : 'survey_not_active';
      return res.status(403).json({ error: code });
    }

    res.json({
      survey: {
        id:                 survey.id,
        title:              survey.title,
        description:        survey.description || null,
        thank_you_message:  survey.thank_you_message || null,
        questions:          (survey.questions || []),
        password_protected: survey.password_protected || false,
      },
    });
  } catch (err) {
    serverError(res, err, { route: 'GET /public/surveys/:token' });
  }
});

// Verify password for a password-protected survey.
// POST /api/public/surveys/:token/verify-password
// Body: { password: string }
// Returns: { valid: boolean }
router.post('/surveys/:token/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });

    const { rows: [survey] } = await db.query(
      `SELECT password_protected, password_hash
       FROM surveys WHERE publish_token = $1 AND status = 'active' LIMIT 1`,
      [req.params.token]
    );
    if (!survey) return res.status(404).json({ error: 'survey_not_found' });

    if (!survey.password_protected || !survey.password_hash) {
      return res.json({ valid: true });
    }

    const valid = checkPassword(password, survey.password_hash);
    res.json({ valid });
  } catch (err) {
    serverError(res, err, { route: 'POST /public/surveys/:token/verify-password' });
  }
});

module.exports = router;
