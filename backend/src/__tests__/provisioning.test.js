import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

const PROV_PATH         = _require.resolve(resolve(__dirname, '../lib/provisioning'));
const DB_PATH           = _require.resolve(resolve(__dirname, '../lib/db'));
const USERPROFILES_PATH = _require.resolve(resolve(__dirname, '../lib/userProfiles'));
const RBAC_PATH         = _require.resolve(resolve(__dirname, '../lib/rbac'));
const LOGGER_PATH       = _require.resolve(resolve(__dirname, '../lib/logger'));
const CLERK_PATH        = _require.resolve('@clerk/backend');

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

let mocks;

function loadProvisioning() {
  mocks = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    ensureBuiltinRoles: vi.fn().mockResolvedValue(undefined),
    getRoleIdByBuiltinKey: vi.fn().mockResolvedValue('role-id-1'),
    upsertProfileFromClerk: vi.fn().mockResolvedValue({}),
    getUser: vi.fn().mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'alice@co.com' },
      firstName: 'Alice', lastName: 'N', imageUrl: null,
    }),
    error: vi.fn(),
  };

  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: mocks.query, default: { query: mocks.query } });
  _require.cache[USERPROFILES_PATH] = fakeMod(USERPROFILES_PATH, {
    ensureBuiltinRoles: mocks.ensureBuiltinRoles,
    getRoleIdByBuiltinKey: mocks.getRoleIdByBuiltinKey,
    upsertProfileFromClerk: mocks.upsertProfileFromClerk,
  });
  _require.cache[RBAC_PATH] = fakeMod(RBAC_PATH, {
    clerkRoleToBuiltinKey: (r) => (r === 'org:admin' ? 'org:admin' : r === 'org:analyst' ? 'org:analyst' : 'org:member'),
  });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, { default: { error: mocks.error }, error: mocks.error });
  _require.cache[CLERK_PATH] = fakeMod(CLERK_PATH, {
    createClerkClient: vi.fn(() => ({ users: { getUser: mocks.getUser } })),
  });

  delete _require.cache[PROV_PATH];
  return _require(PROV_PATH);
}

let origClerkSecret;

beforeEach(() => {
  origClerkSecret = process.env.CLERK_SECRET_KEY;
  process.env.CLERK_SECRET_KEY = 'sk_test_fake';
});

afterEach(() => {
  // Restore env so this file never leaks CLERK_SECRET_KEY into other test files
  // (which would flip their DEV_MODE and break SKIP_AUTH/dev-bypass assertions).
  if (origClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = origClerkSecret;
  delete _require.cache[PROV_PATH];
  delete _require.cache[DB_PATH];
  delete _require.cache[USERPROFILES_PATH];
  delete _require.cache[RBAC_PATH];
  delete _require.cache[LOGGER_PATH];
  delete _require.cache[CLERK_PATH];
  vi.clearAllMocks();
});

describe('ensureProvisioned', () => {
  it('creates org, roles, and user profile from the Clerk claims', async () => {
    const { ensureProvisioned } = loadProvisioning();
    await ensureProvisioned('org_1', 'user_1', 'org:admin');

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO org_profiles'),
      ['org_1'],
    );
    expect(mocks.ensureBuiltinRoles).toHaveBeenCalledWith('org_1');
    expect(mocks.getRoleIdByBuiltinKey).toHaveBeenCalledWith('org_1', 'org:admin');
    expect(mocks.upsertProfileFromClerk).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1', orgId: 'org_1', email: 'alice@co.com', roleId: 'role-id-1',
      }),
    );
  });

  it('caches per (org,user) — a second call does no extra work', async () => {
    const { ensureProvisioned } = loadProvisioning();
    await ensureProvisioned('org_1', 'user_1', 'org:admin');
    await ensureProvisioned('org_1', 'user_1', 'org:admin');
    expect(mocks.upsertProfileFromClerk).toHaveBeenCalledTimes(1);
  });

  it('skips when there is no active org (orgId === userId)', async () => {
    const { ensureProvisioned } = loadProvisioning();
    await ensureProvisioned('user_1', 'user_1', undefined);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.upsertProfileFromClerk).not.toHaveBeenCalled();
  });

  it('is non-fatal and retryable when the DB throws', async () => {
    const mod = loadProvisioning();
    mocks.query.mockRejectedValueOnce(new Error('db down'));

    await expect(mod.ensureProvisioned('org_1', 'user_1', 'org:admin')).resolves.toBeUndefined();
    expect(mocks.error).toHaveBeenCalled();

    // cache cleared on failure → a subsequent call retries (query called again)
    await mod.ensureProvisioned('org_1', 'user_1', 'org:admin');
    expect(mocks.query.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
