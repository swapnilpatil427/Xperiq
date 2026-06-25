import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const REDIS_PATH = _require.resolve(resolve(__dirname, '../lib/redis'));
const AUDIT_PATH = _require.resolve(resolve(__dirname, '../lib/auditLog'));
const MOD_PATH   = _require.resolve(resolve(__dirname, '../middleware/requirePermission'));

let dbQuery;          // vi.fn()
let redisClient;      // null or { status, get, setex, scan, del }
let auditMock;        // vi.fn()

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

// Build a db.query mock that routes by SQL fragment so test setup reads naturally.
function routeQuery({ profile, overrides = [], groupPerms = [], owned = false, shared = false }) {
  return vi.fn(async (text) => {
    if (text.includes('FROM user_profiles up')) return { rows: profile ? [profile] : [] };
    if (text.includes('user_resource_permissions') && text.includes("effect = 'allow'")) {
      return { rows: shared ? [{ x: 1 }] : [] };           // SHARED lookup
    }
    if (text.includes('FROM user_resource_permissions')) return { rows: overrides };
    if (text.includes('user_group_members')) return { rows: groupPerms };
    if (text.includes('FROM surveys') || text.includes('FROM workflows')) {
      return { rows: owned ? [{ x: 1 }] : [] };
    }
    return { rows: [] };
  });
}

function loadModule() {
  dbQuery = dbQuery || vi.fn(async () => ({ rows: [] }));
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[REDIS_PATH] = fakeMod(REDIS_PATH, { getRedisClient: () => redisClient });
  _require.cache[AUDIT_PATH] = fakeMod(AUDIT_PATH, { auditLog: auditMock });
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

const ALL_ADMIN = {
  is_active: true, deprovisioned_at: null, role_id: 'r1', role_key: 'org:admin',
  default_permissions: { 'users:manage': 'ALL', 'survey:read': 'ALL' },
};

describe('evaluatePermission — deny-by-default algorithm', () => {
  beforeEach(() => { redisClient = null; auditMock = vi.fn(); dbQuery = null; });

  it('denies when no profile exists', async () => {
    dbQuery = routeQuery({ profile: null });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage')).toBe(false);
  });

  it('denies inactive users', async () => {
    dbQuery = routeQuery({ profile: { ...ALL_ADMIN, is_active: false } });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage')).toBe(false);
  });

  it('denies deprovisioned users', async () => {
    dbQuery = routeQuery({ profile: { ...ALL_ADMIN, deprovisioned_at: new Date().toISOString() } });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage')).toBe(false);
  });

  it('allows super_admin unconditionally', async () => {
    dbQuery = routeQuery({
      profile: { is_active: true, deprovisioned_at: null, role_id: 'r0', role_key: 'org:super_admin', default_permissions: {} },
    });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:delete')).toBe(true);
  });

  it('allows org-wide action when role scope is ALL', async () => {
    dbQuery = routeQuery({ profile: ALL_ADMIN });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage')).toBe(true);
  });

  it('denies when role scope is NONE', async () => {
    dbQuery = routeQuery({
      profile: { is_active: true, deprovisioned_at: null, role_id: 'r2', role_key: 'org:member',
        default_permissions: { 'survey:read': 'NONE' } },
    });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:read')).toBe(false);
  });

  it('resource-level DENY override beats role ALL', async () => {
    dbQuery = routeQuery({ profile: { ...ALL_ADMIN, default_permissions: { 'survey:read': 'ALL' } },
      overrides: [{ effect: 'deny' }] });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:read')).toBe(false);
  });

  it('resource-level ALLOW override grants access despite role NONE', async () => {
    dbQuery = routeQuery({
      profile: { is_active: true, deprovisioned_at: null, role_id: 'r2', role_key: 'org:member',
        default_permissions: { 'survey:read': 'NONE' } },
      overrides: [{ effect: 'allow' }],
    });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:read')).toBe(true);
  });

  it('group ALLOW grants access despite role NONE', async () => {
    dbQuery = routeQuery({
      profile: { is_active: true, deprovisioned_at: null, role_id: 'r2', role_key: 'org:member',
        default_permissions: { 'survey:read': 'NONE' } },
      groupPerms: [{ effect: 'allow' }],
    });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:read')).toBe(true);
  });

  it('OWNED scope allows when the resource is owned', async () => {
    dbQuery = routeQuery({
      profile: { is_active: true, deprovisioned_at: null, role_id: 'r3', role_key: 'org:survey_creator',
        default_permissions: { 'survey:write': 'OWNED' } },
      owned: true,
    });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:write')).toBe(true);
  });

  it('OWNED scope denies when the resource is not owned', async () => {
    dbQuery = routeQuery({
      profile: { is_active: true, deprovisioned_at: null, role_id: 'r3', role_key: 'org:survey_creator',
        default_permissions: { 'survey:write': 'OWNED' } },
      owned: false,
    });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:write')).toBe(false);
  });

  it('SHARED scope allows only with an explicit share grant', async () => {
    dbQuery = routeQuery({
      profile: { is_active: true, deprovisioned_at: null, role_id: 'r4', role_key: 'org:report_viewer',
        default_permissions: { 'survey:read': 'SHARED' } },
      shared: true,
    });
    const { evaluatePermission } = loadModule();
    expect(await evaluatePermission('u1', 'o1', 'survey', 's1', 'survey:read')).toBe(true);
  });
});

describe('evaluatePermission — Redis caching', () => {
  beforeEach(() => { auditMock = vi.fn(); dbQuery = null; });

  it('returns cached decision without hitting the DB', async () => {
    // Cache key format: perm:${orgId}:${userId}:${resourceType}:${resourceId}:${action}
    redisClient = { status: 'ready', get: vi.fn(async () => '1'), setex: vi.fn() };
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { evaluatePermission } = loadModule();
    const result = await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage');
    expect(result).toBe(true);
    expect(redisClient.get).toHaveBeenCalledWith('perm:o1:u1:users:org:users:manage');
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('writes the decision to cache on a miss', async () => {
    redisClient = { status: 'ready', get: vi.fn(async () => null), setex: vi.fn() };
    dbQuery = routeQuery({ profile: ALL_ADMIN });
    const { evaluatePermission } = loadModule();
    await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage');
    expect(redisClient.setex).toHaveBeenCalledWith('perm:o1:u1:users:org:users:manage', 300, '1');
  });
});

describe('evaluatePermission — org-scoped cache keys', () => {
  beforeEach(() => { auditMock = vi.fn(); dbQuery = null; });

  it('cache key starts with perm:${orgId}:${userId}:', async () => {
    let writtenKey;
    redisClient = {
      status: 'ready',
      get: vi.fn(async () => null),
      setex: vi.fn(async (key) => { writtenKey = key; }),
    };
    dbQuery = routeQuery({ profile: ALL_ADMIN });
    const { evaluatePermission } = loadModule();
    await evaluatePermission('u1', 'org-a', 'users', 'org', 'users:manage');
    expect(writtenKey).toMatch(/^perm:org-a:u1:/);
  });

  it('different orgId causes a cache miss (no shared cached result between orgs)', async () => {
    // Both calls should hit the DB since they have different orgIds
    const getKeys = [];
    redisClient = {
      status: 'ready',
      get: vi.fn(async (key) => { getKeys.push(key); return null; }),
      setex: vi.fn(),
    };
    dbQuery = routeQuery({ profile: ALL_ADMIN });
    const { evaluatePermission } = loadModule();
    await evaluatePermission('u1', 'org-a', 'users', 'org', 'users:manage');
    await evaluatePermission('u1', 'org-b', 'users', 'org', 'users:manage');
    // Both keys were looked up — they are different
    expect(getKeys).toHaveLength(2);
    expect(getKeys[0]).toContain('org-a');
    expect(getKeys[1]).toContain('org-b');
    // DB was called for both since both were cache misses
    expect(dbQuery).toHaveBeenCalledTimes(2);
  });

  it('cache hit on same (orgId, userId, action) does NOT call the DB again', async () => {
    // First call: miss → hits DB. Second call: hit → skips DB.
    let callCount = 0;
    redisClient = {
      status: 'ready',
      get: vi.fn(async () => {
        callCount++;
        return callCount === 1 ? null : '1'; // miss on first, hit on second
      }),
      setex: vi.fn(),
    };
    dbQuery = routeQuery({ profile: ALL_ADMIN });
    const { evaluatePermission } = loadModule();
    await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage');
    // DB was called once for the miss
    const dbCallsAfterFirst = dbQuery.mock.calls.length;
    await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage');
    // DB should NOT have been called again
    expect(dbQuery.mock.calls.length).toBe(dbCallsAfterFirst);
  });

  it('gracefully falls back to DB evaluation when Redis throws', async () => {
    redisClient = {
      status: 'ready',
      get: vi.fn(async () => { throw new Error('Redis connection lost'); }),
      setex: vi.fn(async () => { throw new Error('Redis connection lost'); }),
    };
    dbQuery = routeQuery({ profile: ALL_ADMIN });
    const { evaluatePermission } = loadModule();
    // Should not throw — falls back to DB
    const result = await evaluatePermission('u1', 'o1', 'users', 'org', 'users:manage');
    expect(result).toBe(true);
    expect(dbQuery).toHaveBeenCalled();
  });
});
