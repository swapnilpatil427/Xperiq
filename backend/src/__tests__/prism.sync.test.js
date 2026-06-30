// Unit tests for the Prism continuous-sync (CDC) ingest primitives that make Prism
// RECEIVE NEW RESPONSES — the scheduler/webhook → raw → LOAD+ENRICH seam.
//
// We pin the four engine-side primitives the scheduler + webhook path depend on:
//   - ensureLiveSyncJob  — get-or-create the parked kind='sync' anchor (FK for raw rows)
//   - triggerIngest      — advance the live sync job to TRANSFORM (hands new rows to the worker)
//   - trimAugmentBuffer  — Augment rolling-buffer retention (no-op for ingest/migrate)
//   - applyCircuitBreaker — auto-pause a stream after sustained failures
//
// Same mock boilerplate as prism.test.js: inject a fake `db`/`redis`/`logger` into
// require.cache, match SQL by text.includes(...), assert the queries issued.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH      = _require.resolve(resolve(__dirname, '../lib/db'));
const REDIS_PATH   = _require.resolve(resolve(__dirname, '../lib/redis'));
const LOGGER_PATH  = _require.resolve(resolve(__dirname, '../lib/logger'));
const SYNC_ENGINE_PATH = _require.resolve(resolve(__dirname, '../lib/prism/sync/engine'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

let dbQuery;

const noopLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** (Re)load sync/engine with db/redis/logger + the lazily-imported engine mocked. */
function loadSyncEngine() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, pool: {}, default: { query: dbQuery, pool: {} } });
  _require.cache[REDIS_PATH] = fakeMod(REDIS_PATH, { getRedisClient: () => null, getRedisBlockingClient: () => null });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, { ...noopLogger, default: noopLogger });
  delete _require.cache[SYNC_ENGINE_PATH];
  return _require(SYNC_ENGINE_PATH);
}

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
  vi.clearAllMocks();
});

describe('ensureLiveSyncJob', () => {
  it('reuses an existing PARKED (paused/extract) sync job — no insert', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT id FROM prism_jobs')) return { rows: [{ id: 'sync-job-1' }] };
      return { rows: [] };
    });
    const sync = loadSyncEngine();
    const id = await sync.ensureLiveSyncJob('org-1', 'conn-1', 'webhook');
    expect(id).toBe('sync-job-1');
    // It must NOT insert a new job when an anchor already exists.
    const insertCalls = dbQuery.mock.calls.filter(([t]) => t.includes('INSERT INTO prism_jobs'));
    expect(insertCalls.length).toBe(0);
  });

  it('creates a PARKED kind=sync job when none exists', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT id FROM prism_jobs')) return { rows: [] };
      if (text.includes('INSERT INTO prism_jobs')) return { rows: [{ id: 'sync-job-new' }] };
      return { rows: [] };
    });
    const sync = loadSyncEngine();
    const id = await sync.ensureLiveSyncJob('org-1', 'conn-1', 'schedule');
    expect(id).toBe('sync-job-new');
    const [text, params] = dbQuery.mock.calls.find(([t]) => t.includes('INSERT INTO prism_jobs'));
    // Created as kind='sync', stage='extract', status='paused' (worker won't drag it
    // through the interactive bulk gates until triggerIngest releases it).
    expect(text).toContain("'sync'");
    expect(text).toContain("'extract'");
    expect(text).toContain("'paused'");
    expect(params).toEqual(['org-1', 'conn-1', 'schedule']);
  });
});

describe('triggerIngest', () => {
  it('advances the live sync job to TRANSFORM/running', async () => {
    const sync = loadSyncEngine();
    // enqueueStage is loaded via dynamic import('../engine') — may reject when sync/engine
    // is require()-loaded in unit tests; the UPDATE is the behavior we pin here.
    await sync.triggerIngest('conn-1', 'sync-job-1').catch(() => {});
    const [text, params] = dbQuery.mock.calls.find(([t]) => t.startsWith('\n    UPDATE prism_jobs') || t.includes('UPDATE prism_jobs'));
    expect(text).toContain("SET stage = 'transform'");
    expect(text).toContain("status = 'running'");
    expect(text).toContain("stage IN ('connect', 'discover', 'extract', 'profile')");
    expect(params).toEqual(['sync-job-1', 'conn-1']);
  });

  it('is a no-op for an empty job id (never hits the DB)', async () => {
    const sync = loadSyncEngine();
    await sync.triggerIngest('conn-1', '');
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe('trimAugmentBuffer', () => {
  it('deletes old raw rows for an augment connection', async () => {
    dbQuery = vi.fn(async () => ({ rows: [], rowCount: 7 }));
    const sync = loadSyncEngine();
    const trimmed = await sync.trimAugmentBuffer('org-1', 'conn-1', 'response', 'augment');
    expect(trimmed).toBe(7);
    const [text, params] = dbQuery.mock.calls.find(([t]) => t.includes('DELETE FROM prism_raw_records'));
    expect(text).toContain('COALESCE(source_observed_at, extracted_at)');
    expect(params[0]).toBe('org-1');
    expect(params[1]).toBe('conn-1');
    expect(params[2]).toBe('response');
  });

  it('is a no-op for ingest/migrate (history retained, never trimmed)', async () => {
    const sync = loadSyncEngine();
    const trimmed = await sync.trimAugmentBuffer('org-1', 'conn-1', 'response', 'ingest');
    expect(trimmed).toBe(0);
    expect(dbQuery).not.toHaveBeenCalled();
  });
});

describe('applyCircuitBreaker', () => {
  it('pauses the stream once consecutive_fail crosses the threshold', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT consecutive_fail')) return { rows: [{ consecutive_fail: 6, paused: false }] };
      return { rows: [], rowCount: 1 };
    });
    const sync = loadSyncEngine();
    const tripped = await sync.applyCircuitBreaker('org-1', 'conn-1', 'response');
    expect(tripped).toBe(true);
    const pauseCall = dbQuery.mock.calls.find(([t]) => t.includes('SET paused = $4'));
    expect(pauseCall).toBeTruthy();
    expect(pauseCall[1]).toEqual(['org-1', 'conn-1', 'response', true]);
  });

  it('does not pause below the threshold', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT consecutive_fail')) return { rows: [{ consecutive_fail: 2, paused: false }] };
      return { rows: [], rowCount: 1 };
    });
    const sync = loadSyncEngine();
    const tripped = await sync.applyCircuitBreaker('org-1', 'conn-1', 'response');
    expect(tripped).toBe(false);
    const pauseCall = dbQuery.mock.calls.find(([t]) => t.includes('SET paused = $4'));
    expect(pauseCall).toBeFalsy();
  });

  it('does not re-pause an already-paused stream', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('SELECT consecutive_fail')) return { rows: [{ consecutive_fail: 99, paused: true }] };
      return { rows: [], rowCount: 1 };
    });
    const sync = loadSyncEngine();
    const tripped = await sync.applyCircuitBreaker('org-1', 'conn-1', 'response');
    expect(tripped).toBe(false);
  });
});

describe('negotiateCaptureMode (capability negotiation)', () => {
  it('maps a push connector to push_verified (push always carries a poll backstop)', async () => {
    const sync = loadSyncEngine();
    expect(sync.negotiateCaptureMode({ captureModes: { response: 'push' } }, 'response')).toBe('push_verified');
  });
  it('defaults to poll when the connector declares nothing', async () => {
    const sync = loadSyncEngine();
    expect(sync.negotiateCaptureMode({}, 'response')).toBe('poll');
  });
});
