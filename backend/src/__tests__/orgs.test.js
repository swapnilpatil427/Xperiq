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
const AUTH_PATH   = _require.resolve(resolve(__dirname, '../middleware/auth'));
const DB_PATH     = _require.resolve(resolve(__dirname, '../lib/db'));
const ADMIN_PATH  = _require.resolve(resolve(__dirname, '../lib/admin'));
const CLERK_PATH  = _require.resolve('@clerk/backend');
const ROUTER_PATH = _require.resolve(resolve(__dirname, '../routes/local/orgs'));

// Module-scoped mocks referenced by lazy closures inside route handlers
let mockQuery;
let mockBucketFile;
let mockBucket;
let mockStorage;

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

function setupAndBuildApp() {
  mockQuery = vi.fn();
  mockBucketFile = {
    save: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockResolvedValue([{ mediaLink: 'https://storage.googleapis.com/bucket/logo.png' }]),
  };
  mockBucket = { name: 'test-bucket', file: vi.fn(() => mockBucketFile) };
  mockStorage = { bucket: vi.fn(() => mockBucket) };

  _require.cache[AUTH_PATH] = fakeMod(AUTH_PATH, {
    requireAuth: (req, res, next) => {
      req.orgId = 'test-org';
      req.userId = 'test-user';
      next();
    },
  });
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    default: { query: mockQuery },
    query: mockQuery,
  });
  _require.cache[ADMIN_PATH] = fakeMod(ADMIN_PATH, {
    storage: mockStorage,
    db: {},
    admin: {},
  });
  _require.cache[CLERK_PATH] = fakeMod(CLERK_PATH, {
    createClerkClient: vi.fn(() => ({
      organizations: { updateOrganization: vi.fn().mockResolvedValue({}) },
      verifyToken: vi.fn().mockResolvedValue({ sub: 'test-user', org_id: 'test-org' }),
    })),
  });

  delete _require.cache[ROUTER_PATH];
  const router = _require(ROUTER_PATH);

  const app = express();
  app.use(express.json());
  app.use('/api/orgs', router);
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

function multipartUpload(app, url, fieldName, buffer, filename, contentType) {
  const boundary = '----TestBoundary' + Date.now();
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return inject(app, {
    method: 'POST', url,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  }).then(res => ({ status: res.statusCode, body: res.json() }));
}

// ── GET /api/orgs/me ──────────────────────────────────────────────────────────

describe('GET /api/orgs/me', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); app = setupAndBuildApp(); });

  it('returns org data when row exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        org_id: 'test-org', brand_name: 'Acme', logo_url: 'https://logo.png',
        industry: 'tech', company_size: null, use_case: null,
        target_audience: null, website: null, brand_description: null,
        brand_colors: null, brand_fonts: null,
      }],
    });
    const { status, body } = await api(app, 'GET', '/api/orgs/me');
    expect(status).toBe(200);
    expect(body.org.orgId).toBe('test-org');
    expect(body.org.name).toBe('Acme');
    expect(body.org.logoUrl).toBe('https://logo.png');
    expect(body.org.industry).toBe('tech');
  });

  it('returns empty org stub when no row found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { status, body } = await api(app, 'GET', '/api/orgs/me');
    expect(status).toBe(200);
    expect(body.org).toEqual({ orgId: 'test-org', name: null, logoUrl: null });
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const { status, body } = await api(app, 'GET', '/api/orgs/me');
    expect(status).toBe(500);
    expect(body.error).toBe('connection refused');
  });
});

// ── POST /api/orgs ────────────────────────────────────────────────────────────

describe('POST /api/orgs', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); app = setupAndBuildApp(); });

  it('upserts org and returns it', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ org_id: 'test-org', brand_name: 'Acme Corp', logo_url: null }],
    });
    const { status, body } = await api(app, 'POST', '/api/orgs', { name: 'Acme Corp' });
    expect(status).toBe(200);
    expect(body.org.name).toBe('Acme Corp');
    expect(body.org.orgId).toBe('test-org');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO org_profiles'),
      ['test-org', 'Acme Corp']
    );
  });

  it('accepts empty body and passes null name to DB', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ org_id: 'test-org', brand_name: null, logo_url: null }],
    });
    const { status } = await api(app, 'POST', '/api/orgs', {});
    expect(status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO org_profiles'),
      ['test-org', null]
    );
  });

  it('returns 400 when name exceeds 200 characters', async () => {
    const { status, body } = await api(app, 'POST', '/api/orgs', { name: 'x'.repeat(201) });
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

// ── PUT /api/orgs/me ──────────────────────────────────────────────────────────

describe('PUT /api/orgs/me', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); process.env.SKIP_AUTH = 'true'; app = setupAndBuildApp(); });
  afterEach(() => delete process.env.SKIP_AUTH);

  it('updates name and logoUrl', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ org_id: 'test-org', brand_name: 'New Name', logo_url: 'https://new.png' }],
    });
    const { status, body } = await api(app, 'PUT', '/api/orgs/me', {
      name: 'New Name', logoUrl: 'https://new.png',
    });
    expect(status).toBe(200);
    expect(body.org.name).toBe('New Name');
    expect(body.org.logoUrl).toBe('https://new.png');
  });

  it('passes null for omitted fields', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ org_id: 'test-org', brand_name: 'Unchanged', logo_url: null }],
    });
    const { status } = await api(app, 'PUT', '/api/orgs/me', {});
    expect(status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO org_profiles'),
      ['test-org', null, null]
    );
  });

  it('returns 400 for non-string name', async () => {
    const { status } = await api(app, 'PUT', '/api/orgs/me', { name: 42 });
    expect(status).toBe(400);
  });

  it('returns 400 when logoUrl exceeds 2000 characters', async () => {
    const { status } = await api(app, 'PUT', '/api/orgs/me', {
      logoUrl: 'https://x.com/' + 'a'.repeat(1990),
    });
    expect(status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB unavailable'));
    const { status, body } = await api(app, 'PUT', '/api/orgs/me', { name: 'Fail Corp' });
    expect(status).toBe(500);
    expect(body.error).toBe('DB unavailable');
  });
});

// ── POST /api/orgs/me/logo ────────────────────────────────────────────────────

describe('POST /api/orgs/me/logo', () => {
  let app;
  beforeEach(() => { vi.clearAllMocks(); app = setupAndBuildApp(); });

  it('returns 400 when no file is attached', async () => {
    const { status, body } = await api(app, 'POST', '/api/orgs/me/logo');
    expect(status).toBe(400);
    expect(body.error).toBe('No file provided');
  });

  it('returns a logoUrl on successful upload', async () => {
    const { status, body } = await multipartUpload(
      app, '/api/orgs/me/logo', 'logo',
      Buffer.from('fake-png-data'), 'logo.png', 'image/png'
    );
    expect(status).toBe(200);
    expect(typeof body.logoUrl).toBe('string');
    expect(body.logoUrl.length).toBeGreaterThan(0);
  });

  it('rejects non-image files with an error', async () => {
    const { status } = await multipartUpload(
      app, '/api/orgs/me/logo', 'logo',
      Buffer.from('not-an-image'), 'data.csv', 'text/csv'
    );
    expect(status).toBe(500);
  });
});
