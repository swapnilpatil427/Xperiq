/**
 * Tests for lib/suppressionList.ts
 *
 * Manages a permanent suppression list (unsubscribes, bounces, GDPR requests, etc.)
 * that gates all outreach before frequency caps are applied.
 *
 * isSuppressed():
 *   Checks Redis cache keys (supp:{orgId}:{channel}:contact:{id} and
 *   supp:{orgId}:{channel}:email:{email}), falling back to Postgres.
 *   Caches both positive and negative results. Fails open on error.
 *
 * addSuppression():
 *   Inserts one row per identifier (email OR contactId) with ON CONFLICT upsert.
 *   Invalidates both Redis cache keys after insert.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const REDIS_PATH = _require.resolve(resolve(__dirname, '../lib/redis'));
const LOGGER_PATH = _require.resolve(resolve(__dirname, '../lib/logger'));
const MOD_PATH   = _require.resolve(resolve(__dirname, '../lib/suppressionList'));

let dbQuery, redisClient;

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function load() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[REDIS_PATH] = fakeMod(REDIS_PATH, { getRedisClient: () => redisClient });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

describe('isSuppressed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQuery = vi.fn(async () => ({ rows: [] }));
    // Default: Redis not available
    redisClient = null;
  });

  it('returns false when no identifiers are provided', async () => {
    const { isSuppressed } = load();
    const result = await isSuppressed('org1', 'email', {});
    expect(result).toBe(false);
    // Should not hit DB when no identifiers
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('returns false on cache miss and DB returns empty (not suppressed)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { isSuppressed } = load();
    const result = await isSuppressed('org1', 'email', { contactId: 'c1' });
    expect(result).toBe(false);
    expect(dbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain('notification_suppressions');
    expect(params).toContain('org1');
    expect(params).toContain('email');
  });

  it('returns true when Redis contact key hits with value "1"', async () => {
    redisClient = {
      status: 'ready',
      get: vi.fn(async (key) => {
        if (key === 'supp:org1:email:contact:c1') return '1';
        return null;
      }),
      setex: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    };
    const { isSuppressed } = load();
    const result = await isSuppressed('org1', 'email', { contactId: 'c1' });
    expect(result).toBe(true);
    // DB should not be called since cache hit returned true
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('returns true when Redis email key hits with value "1"', async () => {
    redisClient = {
      status: 'ready',
      get: vi.fn(async (key) => {
        if (key === 'supp:org1:email:email:user@acme.com') return '1';
        return null;
      }),
      setex: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    };
    const { isSuppressed } = load();
    const result = await isSuppressed('org1', 'email', { email: 'user@acme.com' });
    expect(result).toBe(true);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('returns true when DB finds a suppression with no cache (then caches the result)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ id: 's1' }] }));
    const setexMock = vi.fn(async () => 'OK');
    redisClient = {
      status: 'ready',
      get: vi.fn(async () => null), // cache miss
      setex: setexMock,
      del: vi.fn(async () => 1),
    };
    const { isSuppressed } = load();
    const result = await isSuppressed('org1', 'email', { contactId: 'c1' });
    expect(result).toBe(true);
    expect(dbQuery).toHaveBeenCalledTimes(1);
    // Should cache the positive result
    expect(setexMock).toHaveBeenCalledWith(
      'supp:org1:email:contact:c1',
      600,
      '1'
    );
  });

  it('returns false (fail-open) on Redis error during get', async () => {
    dbQuery = vi.fn(async () => { throw new Error('db down'); });
    redisClient = {
      status: 'ready',
      get: vi.fn(async () => { throw new Error('redis error'); }),
      setex: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    };
    const { isSuppressed } = load();
    const result = await isSuppressed('org1', 'email', { email: 'x@acme.com' });
    // Fail open: should return false on error
    expect(result).toBe(false);
  });

  it('checks both contact and email keys when both identifiers are provided', async () => {
    const getMock = vi.fn(async () => null); // all cache misses
    redisClient = {
      status: 'ready',
      get: getMock,
      setex: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    };
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { isSuppressed } = load();
    await isSuppressed('org1', 'sms', { contactId: 'c1', email: 'user@acme.com' });

    // Should have attempted to read both cache keys
    const keys = getMock.mock.calls.map(([k]) => k);
    expect(keys.some((k) => k.includes('contact:c1'))).toBe(true);
    expect(keys.some((k) => k.includes('email:user@acme.com'))).toBe(true);
  });
});

describe('addSuppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQuery = vi.fn(async () => ({ rows: [] }));
    redisClient = null;
  });

  it('calls DB INSERT when only email is provided', async () => {
    const { addSuppression } = load();
    await addSuppression('org1', 'email', 'unsubscribe', 'admin1', { email: 'user@acme.com' });
    expect(dbQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO notification_suppressions');
    expect(params).toContain('user@acme.com');
  });

  it('calls DB INSERT when only contactId is provided', async () => {
    const { addSuppression } = load();
    await addSuppression('org1', 'email', 'bounce', 'admin1', { contactId: 'c1' });
    expect(dbQuery).toHaveBeenCalled();
    const calls = dbQuery.mock.calls.filter(([sql]) => sql.includes('notification_suppressions'));
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const [, params] = calls[0];
    expect(params).toContain('c1');
  });

  it('calls BOTH DB INSERTs when both email and contactId are provided', async () => {
    const { addSuppression } = load();
    await addSuppression('org1', 'email', 'gdpr_request', 'admin1', {
      email: 'user@acme.com',
      contactId: 'c1',
    });
    const suppressionInserts = dbQuery.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO notification_suppressions')
    );
    expect(suppressionInserts.length).toBe(2);
  });

  it('invalidates both Redis cache keys after insert', async () => {
    const delMock = vi.fn(async () => 2);
    redisClient = {
      status: 'ready',
      get: vi.fn(async () => null),
      setex: vi.fn(async () => 'OK'),
      del: delMock,
    };
    const { addSuppression } = load();
    await addSuppression('org1', 'email', 'unsubscribe', 'admin1', {
      email: 'user@acme.com',
      contactId: 'c1',
    });
    // Redis.del should have been called to invalidate both keys
    expect(delMock).toHaveBeenCalled();
    const args = delMock.mock.calls[0];
    const allKeys = args.flat();
    expect(allKeys.some((k) => k.includes('email:user@acme.com'))).toBe(true);
    expect(allKeys.some((k) => k.includes('contact:c1'))).toBe(true);
  });

  it('does nothing when neither email nor contactId is provided', async () => {
    const { addSuppression } = load();
    await addSuppression('org1', 'email', 'admin', 'admin1', {});
    expect(dbQuery).not.toHaveBeenCalled();
  });
});
