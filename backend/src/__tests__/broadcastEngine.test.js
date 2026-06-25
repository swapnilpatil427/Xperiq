/**
 * Tests for lib/broadcastEngine.ts
 *
 * Manages the lifecycle of outreach broadcasts:
 *   createBroadcast() — INSERT + audit log in a DB transaction (BEGIN/COMMIT/ROLLBACK)
 *   notifyApprovers() — posts to Slack webhook when configured; never throws
 *   approveBroadcast() — transitions status to 'approved', writes audit log
 *   rejectBroadcast()  — transitions status to 'rejected', writes audit log; throws on wrong state
 *
 * Uses a pool.connect() / client pattern for transactions; regular query() for
 * single-statement calls. sendSlackWebhook is imported from lib/slack.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH     = _require.resolve(resolve(__dirname, '../lib/db'));
const SLACK_PATH  = _require.resolve(resolve(__dirname, '../lib/slack'));
const LOGGER_PATH = _require.resolve(resolve(__dirname, '../lib/logger'));
const MOD_PATH    = _require.resolve(resolve(__dirname, '../lib/broadcastEngine'));

let dbQuery, poolClient, sendSlackWebhookMock;

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function load() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    query: dbQuery,
    pool: { connect: vi.fn(async () => poolClient) },
    default: { query: dbQuery },
  });
  _require.cache[SLACK_PATH] = fakeMod(SLACK_PATH, {
    sendSlackWebhook: sendSlackWebhookMock,
  });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

const BROADCAST_INPUT = {
  name: 'Q2 NPS Campaign',
  description: 'Quarterly NPS outreach',
  contactIds: ['c1', 'c2'],
  channels: ['email'],
  payload: { subject: 'How are we doing?', body: 'Please take our survey' },
  orgId: 'org1',
  createdBy: 'u1',
};

describe('createBroadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendSlackWebhookMock = vi.fn(async () => {});

    poolClient = {
      query: vi.fn(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('INSERT INTO outreach_broadcasts')) {
          return { rows: [{ id: 'b1', name: 'Q2 NPS Campaign', status: 'pending_approval', estimated_count: 2, channels: ['email'] }] };
        }
        if (sql.includes('broadcast_audit_log')) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    dbQuery = vi.fn(async () => ({ rows: [] }));
  });

  it('inserts broadcast row and audit log, wrapping both in a transaction', async () => {
    const { createBroadcast } = load();
    const result = await createBroadcast(BROADCAST_INPUT);

    const calls = poolClient.query.mock.calls.map(([sql]) => sql);
    expect(calls[0]).toBe('BEGIN');
    expect(calls.some((sql) => sql.includes('INSERT INTO outreach_broadcasts'))).toBe(true);
    expect(calls.some((sql) => sql.includes('broadcast_audit_log'))).toBe(true);
    expect(calls).toContain('COMMIT');
    expect(result.id).toBe('b1');
    expect(poolClient.release).toHaveBeenCalled();
  });

  it('returns the created broadcast with expected fields', async () => {
    const { createBroadcast } = load();
    const result = await createBroadcast(BROADCAST_INPUT);
    expect(result).toMatchObject({ id: 'b1', status: 'pending_approval', estimated_count: 2 });
  });

  it('rolls back and throws on DB error during broadcast INSERT', async () => {
    poolClient.query = vi.fn(async (sql) => {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql.includes('INSERT INTO outreach_broadcasts')) throw new Error('constraint violation');
      return { rows: [] };
    });
    const { createBroadcast } = load();
    await expect(createBroadcast(BROADCAST_INPUT)).rejects.toThrow('constraint violation');

    const calls = poolClient.query.mock.calls.map(([sql]) => sql);
    expect(calls).toContain('ROLLBACK');
    expect(poolClient.release).toHaveBeenCalled();
  });

  it('estimates contact count from segmentId when provided', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('contact_segments')) return { rows: [{ contact_count: 150 }] };
      return { rows: [] };
    });
    const { createBroadcast } = load();
    await createBroadcast({ ...BROADCAST_INPUT, segmentId: 'seg1', contactIds: undefined });
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining('contact_segments'),
      expect.arrayContaining(['seg1', 'org1'])
    );
  });
});

describe('notifyApprovers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendSlackWebhookMock = vi.fn(async () => {});
    poolClient = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
    dbQuery = vi.fn(async () => ({ rows: [] }));
  });

  const broadcast = { id: 'b1', name: 'Q2 Campaign', description: '', estimated_count: 100, channels: ['email'] };

  it('calls sendSlackWebhook when a Slack channel with webhook_url is configured', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('notification_channels')) {
        return { rows: [{ config: { webhook_url: 'https://hooks.slack.com/test' } }] };
      }
      return { rows: [] };
    });
    const { notifyApprovers } = load();
    await notifyApprovers('org1', broadcast);
    expect(sendSlackWebhookMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({ text: expect.any(String) })
    );
  });

  it('does not throw when sendSlackWebhook fails (non-blocking)', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('notification_channels')) {
        return { rows: [{ config: { webhook_url: 'https://hooks.slack.com/test' } }] };
      }
      return { rows: [] };
    });
    sendSlackWebhookMock = vi.fn(async () => { throw new Error('Slack down'); });
    const { notifyApprovers } = load();
    await expect(notifyApprovers('org1', broadcast)).resolves.toBeUndefined();
  });

  it('does not throw when no Slack channel is configured', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] })); // no channel found
    const { notifyApprovers } = load();
    await expect(notifyApprovers('org1', broadcast)).resolves.toBeUndefined();
    expect(sendSlackWebhookMock).not.toHaveBeenCalled();
  });
});

describe('rejectBroadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendSlackWebhookMock = vi.fn(async () => {});
    poolClient = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  });

  it('throws when broadcast is not in pending_approval state (UPDATE returns 0 rows)', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('UPDATE outreach_broadcasts')) return { rows: [] }; // no rows updated
      return { rows: [] };
    });
    const { rejectBroadcast } = load();
    await expect(rejectBroadcast('b1', 'org1', 'u2', 'Not relevant')).rejects.toThrow(
      'pending_approval'
    );
  });

  it('inserts audit log on successful rejection', async () => {
    const auditCalls = [];
    dbQuery = vi.fn(async (sql, params) => {
      if (sql.includes('UPDATE outreach_broadcasts')) return { rows: [{ id: 'b1' }] };
      if (sql.includes('broadcast_audit_log')) { auditCalls.push(params); return { rows: [] }; }
      return { rows: [] };
    });
    const { rejectBroadcast } = load();
    await rejectBroadcast('b1', 'org1', 'u2', 'Not enough budget');
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    const auditParams = auditCalls[0];
    expect(auditParams).toContain('rejected');
    expect(auditParams).toContain('Not enough budget');
  });
});

describe('approveBroadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendSlackWebhookMock = vi.fn(async () => {});
    poolClient = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  });

  it('throws when broadcast is not in pending_approval state', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('UPDATE outreach_broadcasts')) return { rows: [] }; // 0 rows
      return { rows: [] };
    });
    const { approveBroadcast } = load();
    await expect(approveBroadcast('b1', 'org1', 'approver1')).rejects.toThrow(
      'pending_approval'
    );
  });

  it('records approval in audit log with actor userId', async () => {
    const auditCalls = [];
    dbQuery = vi.fn(async (sql, params) => {
      if (sql.includes('UPDATE outreach_broadcasts')) {
        return { rows: [{ id: 'b1', status: 'approved', approved_by: 'approver1' }] };
      }
      if (sql.includes('broadcast_audit_log')) {
        auditCalls.push(params);
        return { rows: [] };
      }
      return { rows: [] };
    });
    const { approveBroadcast } = load();
    const result = await approveBroadcast('b1', 'org1', 'approver1');
    expect(result).toMatchObject({ id: 'b1', status: 'approved' });
    expect(auditCalls.length).toBeGreaterThanOrEqual(1);
    expect(auditCalls[0]).toContain('approver1');
    expect(auditCalls[0]).toContain('approved');
  });

  it('only transitions broadcast in pending_approval state (SQL WHERE check)', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.includes('UPDATE outreach_broadcasts')) {
        expect(sql).toContain("status = 'pending_approval'");
        return { rows: [{ id: 'b1', status: 'approved' }] };
      }
      return { rows: [] };
    });
    const { approveBroadcast } = load();
    await approveBroadcast('b1', 'org1', 'approver1');
    expect(dbQuery).toHaveBeenCalled();
  });
});
