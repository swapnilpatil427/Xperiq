import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../lib/db';
import { serverError } from '../lib/httpError';
import logger from '../lib/logger';

const router = express.Router();

function checkPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  try {
    const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

router.get('/surveys/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: [survey] } = await query(
      `SELECT id, title, description, questions, thank_you_message, status,
              password_protected
       FROM surveys WHERE publish_token = $1 LIMIT 1`,
      [req.params.token]
    );
    if (!survey) { res.status(404).json({ error: 'survey_not_found' }); return; }

    const s = survey as { id: string; title: string; description: string | null; questions: unknown; thank_you_message: string | null; status: string; password_protected: boolean };

    if (s.status !== 'active') {
      const code = s.status === 'closed' ? 'survey_closed'
                 : s.status === 'paused' ? 'survey_paused'
                 : 'survey_not_active';
      res.status(403).json({ error: code });
      return;
    }

    res.json({
      survey: {
        id:                 s.id,
        title:              s.title,
        description:        s.description || null,
        thank_you_message:  s.thank_you_message || null,
        questions:          (s.questions || []),
        password_protected: s.password_protected || false,
      },
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'GET /public/surveys/:token' });
  }
});

// Verify password for a password-protected survey.
// POST /api/public/surveys/:token/verify-password
// Body: { password: string }
// Returns: { valid: boolean }
router.post('/surveys/:token/verify-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body as { password?: string };
    if (!password) { res.status(400).json({ error: 'password required' }); return; }

    const { rows: [survey] } = await query(
      `SELECT password_protected, password_hash
       FROM surveys WHERE publish_token = $1 AND status = 'active' LIMIT 1`,
      [req.params.token]
    );
    if (!survey) { res.status(404).json({ error: 'survey_not_found' }); return; }

    const s = survey as { password_protected: boolean; password_hash: string | null };
    if (!s.password_protected || !s.password_hash) {
      res.json({ valid: true });
      return;
    }

    const valid = checkPassword(password, s.password_hash);
    res.json({ valid });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)), { route: 'POST /public/surveys/:token/verify-password' });
  }
});

export default router;
