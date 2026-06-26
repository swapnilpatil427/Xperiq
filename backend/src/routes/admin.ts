/**
 * Admin proxy — forwards /api/admin/* to the CrystalOS agents service.
 *
 * All routes require Clerk auth. The proxy adds the internal service key
 * before forwarding so CrystalOS can verify the request is from the backend.
 */
import express from 'express';
import type { Request, Response } from 'express';
import fetch from 'node-fetch';
import { requireAuth } from '../middleware/auth';
import { serverError } from '../lib/httpError';
import logger from '../lib/logger';

const router = express.Router();

const AGENTS_URL = process.env.AGENTS_URL ?? 'http://localhost:8001';
const AGENTS_INTERNAL_KEY = process.env.AGENTS_INTERNAL_KEY
  ?? (process.env.NODE_ENV !== 'production'
    ? 'dev-internal-key-change-in-prod'
    : (() => { throw new Error('AGENTS_INTERNAL_KEY must be set in production'); })());

const TIMEOUT_MS = 15_000;

async function proxyToAgents(req: Request, res: Response, method: string): Promise<void> {
  const path = req.path === '/' ? '' : req.path;
  const qs   = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const url  = `${AGENTS_URL}/api/admin${path}${qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const fetchOpts: Parameters<typeof fetch>[1] = {
      method,
      signal: controller.signal as never,
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': AGENTS_INTERNAL_KEY,
      },
    };
    if (method !== 'GET' && method !== 'HEAD' && req.body) {
      (fetchOpts as Record<string, unknown>).body = JSON.stringify(req.body);
    }

    const upstream = await fetch(url, fetchOpts);
    clearTimeout(timer);

    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(body);
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('timeout')) {
      res.status(504).json({ error: 'Agents service timed out' });
      return;
    }
    logger.error({ err, url }, 'admin_proxy_error');
    serverError(res, err instanceof Error ? err : new Error(msg));
  }
}

router.use(requireAuth);

router.get('/*',    (req, res) => proxyToAgents(req, res, 'GET'));
router.post('/*',   (req, res) => proxyToAgents(req, res, 'POST'));
router.delete('/*', (req, res) => proxyToAgents(req, res, 'DELETE'));
router.patch('/*',  (req, res) => proxyToAgents(req, res, 'PATCH'));
router.put('/*',    (req, res) => proxyToAgents(req, res, 'PUT'));

export default router;
