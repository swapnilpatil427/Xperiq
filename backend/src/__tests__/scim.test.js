import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import inject from 'light-my-request';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const SCIMAUTH_PATH = _require.resolve(resolve(__dirname, '../middleware/scimAuth'));
const DB_PATH       = _require.resolve(resolve(__dirname, '../lib/db'));
const AUDIT_PATH    = _require.resolve(resolve(__dirname, '../lib/auditLog'));
const PROFILE_PATH  = _require.resolve(resolve(__dirname, '../lib/userProfiles'));
const ROUTER_PATH   = _require.resolve(resolve(__dirname, '../routes/scim'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function buildApp() {
  // Real scimError, but scimAuth replaced with a pass-through that sets context.
  const realScimError = (res, status, detail) => res.status(status).json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: String(status), detail });
  _require.cache[SCIMAUTH_PATH] = fakeMod(SCIMAUTH_PATH, {
    scimAuth: (req, res, next) => { req.scimOrgId = 'test-org'; req.scimTokenId = 'tok-1'; next(); },
    scimError: realScimError,
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[AUDIT_PATH] = fakeMod(AUDIT_PATH, { auditLog: vi.fn() });
  _require.cache[PROFILE_PATH] = fakeMod(PROFILE_PATH, {
    getRoleIdByBuiltinKey: vi.fn(async () => 'role-member'),
  });
  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);
  const app = express(); app.use(express.json()); app.use('/scim/v2', router.default || router);
  return app;
}
async function api(app, method, url, body = null) {
  const opts = { method, url };
  if (body !== null) { opts.payload = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  const res = await inject(app, opts);
  return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
}

const profileRow = {
  user_id: 'scim:ext-1', org_id: 'test-org', email: 'sam@x.io', first_name: 'Sam', last_name: 'Lee',
  display_name: 'Sam Lee', is_active: true, deprovisioned_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
  scim_external_id: 'ext-1',
};

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [] })); });

describe('SCIM discovery', () => {
  it('serves ServiceProviderConfig with patch + filter support', async () => {
    const { status, body } = await api(buildApp(), 'GET', '/scim/v2/ServiceProviderConfig');
    expect(status).toBe(200);
    expect(body.patch.supported).toBe(true);
    expect(body.filter.supported).toBe(true);
  });
});

describe('POST /scim/v2/Users', () => {
  it('provisions a user and returns a SCIM resource', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO user_profiles')) return { rows: [profileRow] };
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'POST', '/scim/v2/Users', {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'sam@x.io', externalId: 'ext-1',
      name: { givenName: 'Sam', familyName: 'Lee' },
      emails: [{ value: 'sam@x.io', primary: true }], active: true,
    });
    expect(status).toBe(201);
    expect(body.id).toBe('scim:ext-1');
    expect(body.userName).toBe('sam@x.io');
    expect(body.active).toBe(true);
  });

  it('400s without a userName/email', async () => {
    const { status } = await api(buildApp(), 'POST', '/scim/v2/Users', { schemas: [] });
    expect(status).toBe(400);
  });
});

describe('PATCH /scim/v2/Users/:id — deprovision', () => {
  it('deactivates on active=false', async () => {
    let captured = '';
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('UPDATE user_profiles')) { captured = text; return { rows: [{ ...profileRow, is_active: false }] }; }
      return { rows: [] };
    });
    const { status, body } = await api(buildApp(), 'PATCH', '/scim/v2/Users/scim:ext-1', {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', value: { active: false } }],
    });
    expect(status).toBe(200);
    expect(body.active).toBe(false);
    expect(captured).toContain('deprovisioned_at = NOW()');
  });
});

describe('GET /scim/v2/Users/:id', () => {
  it('404s for an unknown user', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { status, body } = await api(buildApp(), 'GET', '/scim/v2/Users/nope');
    expect(status).toBe(404);
    expect(body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
  });
});
