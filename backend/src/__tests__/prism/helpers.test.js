// Prism SDK helpers — pure-logic unit tests (no DB / live server).
//
// Tests are .js and load the .ts source via the tsx CJS hook registered in
// src/test/setup.cjs (see backend/CLAUDE.md "Testing"). We use createRequire so
// require() resolves .ts. guardedFetch is exercised against a stubbed global
// fetch (no real network egress).
import { createRequire } from 'module';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireTs = createRequire(import.meta.url);
const HELPERS_PATH = path.resolve(__dirname, '../../lib/prism/helpers/index.ts');
const helpers = requireTs(HELPERS_PATH);
const { guardedFetch, isRetryable, withRetry, toRawRecord, parseFile, sha256, hashPayload } = helpers;

const ALLOW = ['api.qualtrics.com'];

describe('guardedFetch — SSRF egress guard', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  it('rejects the cloud-metadata IP (169.254.169.254) even if allowlisted', async () => {
    await expect(
      guardedFetch('http://169.254.169.254/latest/meta-data/', {}, ['169.254.169.254']),
    ).rejects.toThrow(/blocked range/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects RFC-1918 private ranges (10/8, 172.16/12, 192.168/16)', async () => {
    for (const host of ['10.0.0.5', '172.16.4.4', '192.168.1.1']) {
      await expect(
        guardedFetch(`http://${host}/`, {}, [host]),
      ).rejects.toThrow(/blocked range/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects loopback (127.0.0.1 and localhost)', async () => {
    await expect(guardedFetch('http://127.0.0.1/', {}, ['127.0.0.1'])).rejects.toThrow(/blocked range/);
    await expect(guardedFetch('http://localhost/', {}, ['localhost'])).rejects.toThrow(/blocked range/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-allowlisted host before any fetch', async () => {
    await expect(
      guardedFetch('https://evil.example.com/data', {}, ALLOW),
    ).rejects.toThrow(/not in allowlist/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an allowlisted public host and returns the response', async () => {
    const res = { status: 200, headers: { get: () => null } };
    fetchMock.mockResolvedValue(res);
    const out = await guardedFetch('https://api.qualtrics.com/v3/surveys', {}, ALLOW);
    expect(out).toBe(res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-guards on redirect — a 302 to a blocked target is rejected', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 302,
      headers: { get: (k) => (k === 'location' ? 'http://169.254.169.254/' : null) },
    });
    await expect(
      guardedFetch('https://api.qualtrics.com/redir', {}, ALLOW),
    ).rejects.toThrow(/blocked range|not in allowlist/);
    // First hop fetched; the blocked redirect target is never fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to an allowlisted host (re-guard passes)', async () => {
    const final = { status: 200, headers: { get: () => null } };
    fetchMock
      .mockResolvedValueOnce({
        status: 301,
        headers: { get: (k) => (k === 'location' ? 'https://api.qualtrics.com/v3/final' : null) },
      })
      .mockResolvedValueOnce(final);
    const out = await guardedFetch('https://api.qualtrics.com/start', {}, ALLOW);
    expect(out).toBe(final);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a non-http(s) protocol', async () => {
    await expect(guardedFetch('ftp://api.qualtrics.com/x', {}, ALLOW)).rejects.toThrow(/protocol/);
  });
});

describe('isRetryable — retry classifier', () => {
  it('classifies 429 and 5xx as retryable', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ statusCode: 502 })).toBe(true);
  });

  it('classifies other 4xx as NOT retryable (caller faults)', () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);
  });

  it('treats transient network error codes as retryable', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']) {
      expect(isRetryable({ code })).toBe(true);
    }
    expect(isRetryable({ message: 'socket hang up' })).toBe(true);
  });
});

describe('withRetry — backoff wrapper', () => {
  it('retries a retryable failure then succeeds (honoring Retry-After=0)', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw { status: 429, retryAfter: 0 };
      return 'ok';
    });
    const out = await withRetry(fn);
    expect(out).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable error — throws immediately', async () => {
    const fn = vi.fn(async () => { throw { status: 400 }; });
    await expect(withRetry(fn)).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('toRawRecord / sha256 — stable provenance hashing', () => {
  it('produces a stable sha256 payload_hash', () => {
    const rec = toRawRecord({
      org_id: 'o1',
      job_id: 'j1',
      connection_id: 'c1',
      source_platform: 'qualtrics',
      record_type: 'response',
      source_record_id: 'R_123',
      payload: { b: 2, a: 1 },
      ingress: 'poll',
      source_observed_at: null,
    });
    expect(rec.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    // Key order does not change the hash (canonical JSON).
    const reordered = toRawRecord({ ...rec, payload: { a: 1, b: 2 } });
    expect(reordered.payload_hash).toBe(rec.payload_hash);
  });

  it('different payloads hash differently', () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  it('sha256 matches the known digest of a fixed input', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('parseFile — CSV → RawRecords with provenance', () => {
  let tmpFile;
  afterEach(async () => {
    if (tmpFile) {
      const fs = requireTs('fs').promises;
      await fs.rm(tmpFile, { force: true }).catch(() => {});
      tmpFile = undefined;
    }
  });

  it('parses a small CSV into RawRecords stamped via toRecords', async () => {
    const { putUpload } = requireTs('../../lib/prism/uploads.ts');
    const fileRef = await putUpload('o1', 'helpers-test.csv', Buffer.from('name,score\nAlice,9\nBob,3\n', 'utf8'));

    const toRecord = (row, idx) =>
      toRawRecord({
        org_id: 'o1',
        job_id: 'j1',
        connection_id: 'c1',
        source_platform: 'csv',
        record_type: 'response',
        source_record_id: `row-${idx}`,
        payload: row,
        ingress: 'file',
        source_observed_at: null,
      });

    const collected = [];
    for await (const chunk of parseFile({ fileRef, format: 'csv', toRecords: toRecord })) {
      collected.push(...chunk.records);
    }

    expect(collected).toHaveLength(2);
    expect(collected[0].payload).toEqual({ name: 'Alice', score: '9' });
    expect(collected[1].payload).toEqual({ name: 'Bob', score: '3' });
    expect(collected[0].source_record_id).toBe('row-0');
    expect(collected[0].payload_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws a typed not-implemented error for unsupported formats', async () => {
    const iter = parseFile({ fileRef: '/nope.xlsx', format: 'xlsx', toRecords: () => ({}) });
    await expect(iter.next()).rejects.toThrow(/not implemented/);
  });
});
