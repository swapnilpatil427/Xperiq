import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const AUTH_PATH  = _require.resolve(resolve(__dirname, '../middleware/auth'));
const CH_PATH    = _require.resolve(resolve(__dirname, '../lib/channels'));
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/notifications'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function loadChannels() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  delete _require.cache[CH_PATH];
  return _require(CH_PATH);
}
function buildApp() {
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => { req.orgId = 'test-org'; req.userId = 'test-user'; next(); },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/api/notifications', router);
  return app;
}

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [] })); });

describe('dispatchExternalChannels', () => {
  it('dispatches to email + slack when enabled', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM notification_type_preferences')) {
        return { rows: [{ email_enabled: true, slack_enabled: true }] };
      }
      return { rows: [] };
    });
    const { dispatchExternalChannels } = loadChannels();
    const attempted = await dispatchExternalChannels('o1', 'u1', { id: 'n1', type: 'score.nps_drop', title: 'Drop' });
    expect(attempted).toEqual(['email', 'slack']);
  });

  it('does nothing when the user has no preference row (in-app only)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { dispatchExternalChannels } = loadChannels();
    expect(await dispatchExternalChannels('o1', 'u1', { id: 'n1', type: 'x', title: 't' })).toEqual([]);
  });

  it('dispatches only the enabled channels', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM notification_type_preferences')) return { rows: [{ email_enabled: false, slack_enabled: true }] };
      return { rows: [] };
    });
    const { dispatchExternalChannels } = loadChannels();
    expect(await dispatchExternalChannels('o1', 'u1', { id: 'n1', type: 'x', title: 't' })).toEqual(['slack']);
  });
});

describe('GET /api/notifications/digest', () => {
  it('aggregates counts by priority + type and top items', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('GROUP BY priority')) return { rows: [{ priority: 'critical', n: 1 }, { priority: 'info', n: 3 }] };
      if (text.includes('GROUP BY type'))     return { rows: [{ type: 'score.nps_drop', n: 1 }] };
      return { rows: [{ id: 'n1', type: 'score.nps_drop', priority: 'critical', title: 'Drop', read: false, created_at: 't', payload: {} }] };
    });
    const res = await inject(buildApp(), { method: 'GET', url: '/api/notifications/digest?period=week' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.period).toBe('week');
    expect(body.total).toBe(4);
    expect(body.byPriority).toEqual({ critical: 1, info: 3 });
    expect(body.topItems[0].priority).toBe('critical');
  });
});
