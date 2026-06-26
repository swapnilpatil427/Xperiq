import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const DB_PATH = _require.resolve(resolve(__dirname, '../lib/channels')); // resolve sibling for cache key base
const CH_PATH = _require.resolve(resolve(__dirname, '../lib/channels'));
const DB_MOD  = _require.resolve(resolve(__dirname, '../lib/db'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function load() {
  _require.cache[DB_MOD] = fakeMod(DB_MOD, { query: dbQuery, default: { query: dbQuery } });
  delete _require.cache[CH_PATH];
  return _require(CH_PATH);
}

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [] })); });
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SENDGRID_API_KEY;
  delete process.env.NOTIFICATION_FROM_EMAIL;
});

const notif = { id: 'n1', type: 'score.nps_drop', title: 'NPS dropped', body: 'Down 8 pts', priority: 'critical', actionUrl: '/app/alerts' };

describe('sendEmail (SendGrid)', () => {
  it('no-ops gracefully when unconfigured', async () => {
    const { sendEmail } = load();
    const r = await sendEmail('o1', 'u1', notif);
    expect(r).toEqual({ channel: 'email', delivered: false, reason: 'not_configured' });
  });

  it('posts to SendGrid with the recipient email when configured', async () => {
    process.env.SENDGRID_API_KEY = 'sg-test';
    process.env.NOTIFICATION_FROM_EMAIL = 'crystal@experient.ai';
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM user_profiles')) return { rows: [{ email: 'bob@x.io' }] };
      return { rows: [] };
    });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sendEmail } = load();
    const r = await sendEmail('o1', 'u1', notif);
    expect(r.delivered).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('api.sendgrid.com');
    expect(opts.headers.Authorization).toBe('Bearer sg-test');
    expect(opts.body).toContain('bob@x.io');
  });

  it('reports not delivered when the recipient has no email', async () => {
    process.env.SENDGRID_API_KEY = 'sg-test';
    process.env.NOTIFICATION_FROM_EMAIL = 'crystal@experient.ai';
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { sendEmail } = load();
    const r = await sendEmail('o1', 'u1', notif);
    expect(r).toMatchObject({ delivered: false, reason: 'no_recipient' });
  });
});

describe('sendSlack (webhook)', () => {
  it('no-ops when no webhook is configured', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { sendSlack } = load();
    const r = await sendSlack('o1', 'u1', notif);
    expect(r).toEqual({ channel: 'slack', delivered: false, reason: 'not_configured' });
  });

  it('posts a Block Kit message to the configured webhook', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM notification_channels')) return { rows: [{ config: { webhook_url: 'https://hooks.slack.com/services/T/B/x' } }] };
      return { rows: [] };
    });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { sendSlack } = load();
    const r = await sendSlack('o1', 'u1', notif);
    expect(r.delivered).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('hooks.slack.com');
    expect(opts.body).toContain('NPS dropped');
    expect(opts.body).toContain('blocks');
  });
});
