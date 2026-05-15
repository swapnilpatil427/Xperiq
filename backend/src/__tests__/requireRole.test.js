import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

const CLERK_PATH      = _require.resolve('@clerk/backend');
const MIDDLEWARE_PATH = _require.resolve(resolve(__dirname, '../middleware/requireRole'));

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

// Shared mock state — all verifyToken calls read this
let mockVerifyTokenFn;

function setupMiddleware() {
  _require.cache[CLERK_PATH] = fakeMod(CLERK_PATH, {
    createClerkClient: () => ({ verifyToken: (...args) => mockVerifyTokenFn(...args) }),
  });
  delete _require.cache[MIDDLEWARE_PATH];
  return _require(MIDDLEWARE_PATH).requireRole;
}

function makeReqRes(authHeader = 'Bearer test-token') {
  const req = { headers: { authorization: authHeader } };
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('requireRole middleware', () => {
  let requireRole;
  const origSkipAuth = process.env.SKIP_AUTH;

  beforeEach(() => {
    delete process.env.SKIP_AUTH;
    mockVerifyTokenFn = vi.fn();
    requireRole = setupMiddleware();
  });

  afterEach(() => {
    if (origSkipAuth !== undefined) process.env.SKIP_AUTH = origSkipAuth;
    else delete process.env.SKIP_AUTH;
    delete _require.cache[MIDDLEWARE_PATH];
    delete _require.cache[CLERK_PATH];
  });

  it('passes through when SKIP_AUTH=true regardless of role', async () => {
    process.env.SKIP_AUTH = 'true';
    const { req, res, next } = makeReqRes();
    await requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  it('returns 401 when no Authorization header', async () => {
    const { req, res, next } = makeReqRes();
    req.headers = {};
    await requireRole('viewer')(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows org:admin when admin required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_id: 'org-1', org_role: 'org:admin' });
    const { req, res, next } = makeReqRes();
    await requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.orgRole).toBe('org:admin');
  });

  it('blocks org:analyst when admin required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_id: 'org-1', org_role: 'org:analyst' });
    const { req, res, next } = makeReqRes();
    await requireRole('admin')(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.required).toBe('org:admin');
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks org:viewer when admin required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_role: 'org:viewer' });
    const { req, res, next } = makeReqRes();
    await requireRole('admin')(req, res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows org:admin when analyst required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_role: 'org:admin' });
    const { req, res, next } = makeReqRes();
    await requireRole('analyst')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows org:analyst when analyst required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_role: 'org:analyst' });
    const { req, res, next } = makeReqRes();
    await requireRole('analyst')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks org:viewer when analyst required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_role: 'org:viewer' });
    const { req, res, next } = makeReqRes();
    await requireRole('analyst')(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.current).toBe('org:viewer');
    expect(next).not.toHaveBeenCalled();
  });

  it('allows org:admin when viewer required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_role: 'org:admin' });
    const { req, res, next } = makeReqRes();
    await requireRole('viewer')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows org:viewer when viewer required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1', org_role: 'org:viewer' });
    const { req, res, next } = makeReqRes();
    await requireRole('viewer')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks user with no org_role when analyst required', async () => {
    mockVerifyTokenFn.mockResolvedValue({ sub: 'u-1' }); // no org_role
    const { req, res, next } = makeReqRes();
    await requireRole('analyst')(req, res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when verifyToken throws', async () => {
    mockVerifyTokenFn.mockRejectedValue(new Error('bad token'));
    const { req, res, next } = makeReqRes();
    await requireRole('admin')(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
