// Prism EXTRACT — idempotent appendRawRecords + poison marking unit tests.
//
// Tests are .js loading .ts source via the tsx CJS hook (src/test/setup.cjs).
// lib/db is mocked by injecting into require.cache (backend mock pattern):
// appendRawRecords uses pool.connect() (a transactional client) and markPoison
// uses the top-level query(). Both are faked — no live DB.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);
const DB_PATH = _require.resolve(resolve(__dirname, '../../lib/db'));
const EXTRACT_PATH = _require.resolve(resolve(__dirname, '../../lib/prism/extract'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

let clientQuery, topQuery, releaseSpy;
function loadExtract() {
  const client = { query: clientQuery, release: releaseSpy };
  const pool = { connect: vi.fn(async () => client) };
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: topQuery, pool, default: { query: topQuery, pool } });
  delete _require.cache[EXTRACT_PATH];
  return _require(EXTRACT_PATH);
}

function rawRecord(overrides = {}) {
  return {
    org_id: 'o1',
    job_id: 'j1',
    connection_id: 'c1',
    source_platform: 'qualtrics',
    record_type: 'response',
    source_record_id: 'R_1',
    payload: { score: 9 },
    payload_hash: 'ignored-recomputed',
    ingress: 'poll',
    source_observed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  releaseSpy = vi.fn();
  // Default: BEGIN/COMMIT pass; the INSERT returns a brand-new insert.
  topQuery = vi.fn(async () => ({ rows: [], rowCount: 1 }));
});

describe('appendRawRecords — idempotent UPSERT on the natural key', () => {
  it('no-ops on an empty batch', async () => {
    clientQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const { appendRawRecords } = loadExtract();
    const out = await appendRawRecords([]);
    expect(out).toEqual({ inserted: 0, updated: 0, unchanged: 0 });
  });

  it('counts a brand-new row as inserted (xmax = 0 → inserted: true)', async () => {
    clientQuery = vi.fn(async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [], rowCount: 0 };
      return { rows: [{ inserted: true }], rowCount: 1 };
    });
    const { appendRawRecords } = loadExtract();
    const out = await appendRawRecords([rawRecord()]);
    expect(out).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    // Goes through a single transaction.
    const calls = clientQuery.mock.calls.map((c) => c[0]);
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('COMMIT');
    // The write is an ON CONFLICT UPSERT (idempotent on the natural key) — never a raw INSERT-only.
    const upsert = calls.find((t) => /INSERT INTO prism_raw_records/.test(t));
    expect(upsert).toMatch(/ON CONFLICT/);
    expect(upsert).toMatch(/payload_hash IS DISTINCT FROM EXCLUDED\.payload_hash/);
  });

  it('hash-equal re-observation is a pure no-op (UPDATE guard suppresses the row → unchanged)', async () => {
    // The WHERE guard suppresses the UPDATE; pg returns no row (rowCount 0).
    clientQuery = vi.fn(async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const { appendRawRecords } = loadExtract();
    const out = await appendRawRecords([rawRecord(), rawRecord({ source_record_id: 'R_2' })]);
    expect(out).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
  });

  it('counts a changed-hash re-observation as updated (xmax != 0 → inserted: false)', async () => {
    clientQuery = vi.fn(async (text) => {
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [], rowCount: 0 };
      return { rows: [{ inserted: false }], rowCount: 1 };
    });
    const { appendRawRecords } = loadExtract();
    const out = await appendRawRecords([rawRecord()]);
    expect(out).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
  });

  it('recomputes payload_hash defensively (a desynced connector hash is ignored)', async () => {
    let sentHash;
    clientQuery = vi.fn(async (text, params) => {
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [], rowCount: 0 };
      sentHash = params[7]; // payload_hash positional param
      return { rows: [{ inserted: true }], rowCount: 1 };
    });
    const { appendRawRecords } = loadExtract();
    await appendRawRecords([rawRecord({ payload_hash: 'LIES' })]);
    expect(sentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sentHash).not.toBe('LIES');
  });

  it('rolls back and rethrows when a record write fails', async () => {
    const order = [];
    clientQuery = vi.fn(async (text) => {
      order.push(text === 'BEGIN' || text === 'ROLLBACK' || text === 'COMMIT' ? text : 'INSERT');
      if (text === 'BEGIN') return { rows: [], rowCount: 0 };
      if (text === 'ROLLBACK') return { rows: [], rowCount: 0 };
      throw new Error('boom');
    });
    const { appendRawRecords } = loadExtract();
    await expect(appendRawRecords([rawRecord()])).rejects.toThrow('boom');
    expect(order).toContain('ROLLBACK');
    expect(releaseSpy).toHaveBeenCalled();
  });
});

describe('markPoison — quarantine flag on a bad record', () => {
  it('sets poison = true keyed on the natural key', async () => {
    let seen;
    topQuery = vi.fn(async (text, params) => { seen = { text, params }; return { rows: [], rowCount: 1 }; });
    const { markPoison } = loadExtract();
    await markPoison('o1', 'c1', 'response', 'R_bad');
    expect(seen.text).toMatch(/UPDATE prism_raw_records/);
    expect(seen.text).toMatch(/SET poison = true/);
    expect(seen.params).toEqual(['o1', 'c1', 'response', 'R_bad']);
  });
});
