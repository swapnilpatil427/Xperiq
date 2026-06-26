import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

// Pre-resolve all module paths to absolute paths
const AUTH_PATH        = _require.resolve(resolve(__dirname, '../middleware/auth'));
const REQUIRE_ROLE_PATH = _require.resolve(resolve(__dirname, '../middleware/requireRole'));
const DB_PATH          = _require.resolve(resolve(__dirname, '../lib/db'));
const ADMIN_PATH       = _require.resolve(resolve(__dirname, '../lib/admin'));
const CLERK_PATH       = _require.resolve('@clerk/backend');
const ROUTER_PATH      = _require.resolve(resolve(__dirname, '../routes/members'));

// Module-scoped mock state — closure in createClerkClient reads this at call time
let mockClerkOrgs;

function freshClerkOrgs() {
  return {
    getOrganizationMembershipList: vi.fn(),
    createOrganizationInvitation: vi.fn(),
    deleteOrganizationMembership: vi.fn(),
    updateOrganizationMembership: vi.fn(),
  };
}

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

function setupAndBuildApp() {
  const authExports = {
    requireAuth: (req, res, next) => {
      req.orgId = 'test-org';
      req.userId = 'test-user';
      next();
    },
  };
  // The dev bypass now keys on DEV_MODE (no CLERK_SECRET_KEY), not SKIP_AUTH. These tests
  // toggle process.env.SKIP_AUTH per-test, so expose DEV_MODE as a live getter over it.
  Object.defineProperty(authExports, 'DEV_MODE', {
    get: () => process.env.SKIP_AUTH === 'true',
    enumerable: true,
  });
  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, authExports);
  // requireRole is tested separately — bypass it in member route tests
  _require.cache[REQUIRE_ROLE_PATH] = fakeMod(REQUIRE_ROLE_PATH, {
    requireRole: () => (req, res, next) => next(),
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    default: { query: vi.fn() },
    query: vi.fn(),
  });
  _require.cache[ADMIN_PATH] = fakeMod(ADMIN_PATH, {
    storage: {}, db: {}, admin: {},
  });
  // createClerkClient reads mockClerkOrgs at call time (lazy closure)
  _require.cache[CLERK_PATH] = fakeMod(CLERK_PATH, {
    createClerkClient: vi.fn(() => ({
      organizations: mockClerkOrgs,
      verifyToken: vi.fn().mockResolvedValue({ sub: 'test-user', org_id: 'test-org' }),
    })),
  });

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);

  const app = express();
  app.use(express.json());
  app.use('/api/orgs/me', router.default || router);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  return app;
}

async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) {
    opts.payload = JSON.stringify(body);
    opts.headers = { 'content-type': 'application/json' };
  }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.json() };
}

// ── GET /api/orgs/me/members ──────────────────────────────────────────────────

describe('GET /api/orgs/me/members', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); mockClerkOrgs = freshClerkOrgs(); app = setupAndBuildApp(); });
  afterEach(() => delete process.env.SKIP_AUTH);

  it('returns empty list when SKIP_AUTH=true', async () => {
    process.env.SKIP_AUTH = 'true';
    const { status, body } = await api(app, 'GET', '/api/orgs/me/members');
    expect(status).toBe(200);
    expect(body).toEqual({ members: [], total: 0 });
  });

  it('returns mapped members from Clerk', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.getOrganizationMembershipList.mockResolvedValueOnce({
      data: [
        {
          publicUserData: { userId: 'u1', identifier: 'alice@acme.com', firstName: 'Alice', lastName: 'Smith' },
          role: 'org:admin',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          publicUserData: { userId: 'u2', identifier: 'bob@acme.com', firstName: 'Bob', lastName: null },
          role: 'org:member',
          createdAt: '2024-02-01T00:00:00Z',
        },
      ],
    });
    const { status, body } = await api(app, 'GET', '/api/orgs/me/members');
    expect(status).toBe(200);
    expect(body.members).toHaveLength(2);
    expect(body.members[0]).toMatchObject({
      userId: 'u1',
      identifier: 'alice@acme.com',
      firstName: 'Alice',
      lastName: 'Smith',
      role: 'org:admin',
    });
    expect(body.total).toBe(2);
    expect(mockClerkOrgs.getOrganizationMembershipList).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'test-org', limit: 100 })
    );
  });

  it('returns 500 on Clerk error', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.getOrganizationMembershipList.mockRejectedValueOnce(new Error('Clerk unavailable'));
    const { status, body } = await api(app, 'GET', '/api/orgs/me/members');
    expect(status).toBe(500);
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});

// ── POST /api/orgs/me/invitations ─────────────────────────────────────────────

describe('POST /api/orgs/me/invitations', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); mockClerkOrgs = freshClerkOrgs(); app = setupAndBuildApp(); });
  afterEach(() => delete process.env.SKIP_AUTH);

  it('returns success when SKIP_AUTH=true', async () => {
    process.env.SKIP_AUTH = 'true';
    const { status, body } = await api(app, 'POST', '/api/orgs/me/invitations', {
      email: 'bob@acme.com', role: 'org:member',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('creates invitation via Clerk and returns invitation details', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.createOrganizationInvitation.mockResolvedValueOnce({
      id: 'inv_123', emailAddress: 'bob@acme.com', status: 'pending',
    });
    const { status, body } = await api(app, 'POST', '/api/orgs/me/invitations', {
      email: 'bob@acme.com', role: 'org:member',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.invitation).toMatchObject({
      id: 'inv_123', emailAddress: 'bob@acme.com', status: 'pending',
    });
    expect(mockClerkOrgs.createOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'test-org',
        emailAddress: 'bob@acme.com',
        role: 'org:member',
        inviterUserId: 'test-user',
      })
    );
  });

  it('defaults role to org:member when not provided', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.createOrganizationInvitation.mockResolvedValueOnce({
      id: 'inv_456', emailAddress: 'carol@acme.com', status: 'pending',
    });
    await api(app, 'POST', '/api/orgs/me/invitations', { email: 'carol@acme.com' });
    expect(mockClerkOrgs.createOrganizationInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'org:member' })
    );
  });

  it('returns 400 for invalid email', async () => {
    const { status, body } = await api(app, 'POST', '/api/orgs/me/invitations', {
      email: 'not-an-email',
    });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when email is missing', async () => {
    const { status } = await api(app, 'POST', '/api/orgs/me/invitations', {
      role: 'org:member',
    });
    expect(status).toBe(400);
  });

  it('returns 500 on Clerk error', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.createOrganizationInvitation.mockRejectedValueOnce(new Error('invite failed'));
    const { status, body } = await api(app, 'POST', '/api/orgs/me/invitations', {
      email: 'bob@acme.com',
    });
    expect(status).toBe(500);
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});

// ── DELETE /api/orgs/me/members/:userId ───────────────────────────────────────

describe('DELETE /api/orgs/me/members/:userId', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); mockClerkOrgs = freshClerkOrgs(); app = setupAndBuildApp(); });
  afterEach(() => delete process.env.SKIP_AUTH);

  it('returns success when SKIP_AUTH=true', async () => {
    process.env.SKIP_AUTH = 'true';
    const { status, body } = await api(app, 'DELETE', '/api/orgs/me/members/u1');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('removes membership via Clerk', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.deleteOrganizationMembership.mockResolvedValueOnce({});
    const { status, body } = await api(app, 'DELETE', '/api/orgs/me/members/u1');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockClerkOrgs.deleteOrganizationMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'test-org', userId: 'u1' })
    );
  });

  it('returns 500 on Clerk error', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.deleteOrganizationMembership.mockRejectedValueOnce(new Error('user not a member'));
    const { status, body } = await api(app, 'DELETE', '/api/orgs/me/members/u1');
    expect(status).toBe(500);
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});

// ── PUT /api/orgs/me/members/:userId/role ─────────────────────────────────────

describe('PUT /api/orgs/me/members/:userId/role', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); mockClerkOrgs = freshClerkOrgs(); app = setupAndBuildApp(); });
  afterEach(() => delete process.env.SKIP_AUTH);

  it('returns success when SKIP_AUTH=true', async () => {
    process.env.SKIP_AUTH = 'true';
    const { status, body } = await api(app, 'PUT', '/api/orgs/me/members/u1/role', {
      role: 'org:admin',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('updates member role via Clerk', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.updateOrganizationMembership.mockResolvedValueOnce({});
    const { status, body } = await api(app, 'PUT', '/api/orgs/me/members/u1/role', {
      role: 'org:admin',
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockClerkOrgs.updateOrganizationMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'test-org', userId: 'u1', role: 'org:admin' })
    );
  });

  it('returns 400 when role is missing', async () => {
    const { status, body } = await api(app, 'PUT', '/api/orgs/me/members/u1/role', {});
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns 500 on Clerk error', async () => {
    process.env.SKIP_AUTH = 'false';
    mockClerkOrgs.updateOrganizationMembership.mockRejectedValueOnce(new Error('user not found'));
    const { status, body } = await api(app, 'PUT', '/api/orgs/me/members/u1/role', {
      role: 'org:viewer',
    });
    expect(status).toBe(500);
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});
