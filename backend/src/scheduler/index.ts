/**
 * Experient Scheduler service — the deployable home for cross-cutting / DB periodic jobs and
 * the scheduler observability hub.
 *
 *   node src/scheduler/index.js        (or: npm run start:scheduler)
 *
 * Runs as its own container (separately scalable), reusing the backend's library code and deps
 * (DATABASE_URL, lib/db, lib/metrics, lib/logger) — no separate node_modules. Exposes:
 *   GET /health        — readiness (DB reachable)
 *   GET /health/live   — liveness
 *   GET /health/ready  — readiness
 *   GET /metrics       — Prometheus (heartbeat + per-job metrics)
 *
 * Owns jobs that belong to neither the API nor CrystalOS (e.g. expire_stale_broadcasts,
 * future reconciliation / cost-down dividend). The API Event Engine and CrystalOS scheduler
 * keep their own jobs — this service does not duplicate them.
 */
import '../env';

import express from 'express';
import type { Request, Response } from 'express';
import { register } from '../lib/metrics';
import { query } from '../lib/db';
import logger from '../lib/logger';
import { start as startRunner, stop as stopRunner } from './runner';
import { releaseLeadership } from './leader';

const PORT = Number(process.env.SCHEDULER_PORT) || 8090;

const app = express();

app.get('/health/live', (_req: Request, res: Response) => { res.json({ status: 'ok', service: 'scheduler' }); });

async function readiness(): Promise<Record<string, string>> {
  const h: Record<string, string> = { status: 'ok', service: 'scheduler' };
  try { await query('SELECT 1'); h.db = 'ok'; }
  catch { h.db = 'error'; h.status = 'degraded'; }
  return h;
}

app.get('/health', async (_req: Request, res: Response) => {
  const h = await readiness();
  res.status(h.status === 'ok' ? 200 : 503).json(h);
});
app.get('/health/ready', async (_req: Request, res: Response) => {
  const h = await readiness();
  res.status(h.status === 'ok' ? 200 : 503).json(h);
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const server = app.listen(PORT, () => logger.info({ port: PORT }, 'scheduler: http listening'));
const handle = startRunner();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    logger.info({}, 'scheduler: shutting down');
    stopRunner();
    clearInterval(handle);
    void releaseLeadership();   // let a standby take over immediately
    server.close();
    setTimeout(() => process.exit(0), 500);
  });
}
