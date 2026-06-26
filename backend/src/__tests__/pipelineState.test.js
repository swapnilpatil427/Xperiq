/**
 * Tests for lib/pipelineStateMachine.js
 *
 * Coverage:
 *   - scoreToStatus: each threshold boundary
 *   - calcAutoApproveDeadline: pending_review returns ~2hr future; others null
 *   - getDocStatus: returns status or null when not found
 *   - transitionDoc: valid transitions succeed; invalid transitions throw
 *   - runDocAutoApproveJob: mock pool, verify expired docs get transitioned
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const _require   = createRequire(import.meta.url);

const METRICS_PATH  = _require.resolve(resolve(__dirname, '../lib/metrics'));
const LOGGER_PATH   = _require.resolve(resolve(__dirname, '../lib/logger'));
const SM_PATH       = _require.resolve(resolve(__dirname, '../lib/pipelineStateMachine'));
const JOB_PATH      = _require.resolve(resolve(__dirname, '../scheduler/docAutoApprove'));
const DB_PATH       = _require.resolve(resolve(__dirname, '../lib/db'));

function fakeMod(id, exports) {
  return { id, filename: id, loaded: true, exports, children: [] };
}

let mockTransitionCounter;
let mockAutoApprovedCounter;

function injectDeps() {
  mockTransitionCounter = { inc: vi.fn() };
  mockAutoApprovedCounter = { inc: vi.fn() };
  _require.cache[METRICS_PATH] = fakeMod(METRICS_PATH, {
    supportDocsPipelineTransitionsTotal: mockTransitionCounter,
    supportDocsAutoApprovedTotal:        mockAutoApprovedCounter,
  });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
}

function loadStateMachine() {
  injectDeps();
  delete _require.cache[SM_PATH];
  return _require(SM_PATH);
}

function loadJob(smExports) {
  injectDeps();
  delete _require.cache[SM_PATH];
  _require.cache[SM_PATH] = fakeMod(SM_PATH, smExports);
  // Provide a no-op pool so the job's module-level require of db doesn't fail
  _require.cache[DB_PATH] = fakeMod(DB_PATH, {
    pool:    { connect: vi.fn(), query: vi.fn() },
    query:   vi.fn(),
    default: { pool: { connect: vi.fn() }, query: vi.fn() },
  });
  delete _require.cache[JOB_PATH];
  return _require(JOB_PATH);
}

afterAll(() => {
  for (const p of [METRICS_PATH, LOGGER_PATH, SM_PATH, JOB_PATH, DB_PATH]) {
    delete _require.cache[p];
  }
});

// ── scoreToStatus ─────────────────────────────────────────────────────────────

describe('scoreToStatus', () => {
  it('returns auto_approved for score >= 0.90', () => {
    const { scoreToStatus } = loadStateMachine();
    expect(scoreToStatus(1.0)).toBe('auto_approved');
    expect(scoreToStatus(0.90)).toBe('auto_approved');
  });

  it('returns pending_review for score >= 0.75 and < 0.90', () => {
    const { scoreToStatus } = loadStateMachine();
    expect(scoreToStatus(0.89)).toBe('pending_review');
    expect(scoreToStatus(0.75)).toBe('pending_review');
  });

  it('returns requires_annotation for score >= 0.65 and < 0.75', () => {
    const { scoreToStatus } = loadStateMachine();
    expect(scoreToStatus(0.74)).toBe('requires_annotation');
    expect(scoreToStatus(0.65)).toBe('requires_annotation');
  });

  it('returns rejected for score < 0.65', () => {
    const { scoreToStatus } = loadStateMachine();
    expect(scoreToStatus(0.64)).toBe('rejected');
    expect(scoreToStatus(0.0)).toBe('rejected');
  });
});

// ── calcAutoApproveDeadline ───────────────────────────────────────────────────

describe('calcAutoApproveDeadline', () => {
  it('returns a Date ~2 hours in the future for pending_review', () => {
    const { calcAutoApproveDeadline } = loadStateMachine();
    const before = Date.now();
    const deadline = calcAutoApproveDeadline('pending_review');
    const after  = Date.now();
    expect(deadline).toBeInstanceOf(Date);
    // Should be between 2h and 2h+1s from now
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    expect(deadline.getTime()).toBeGreaterThanOrEqual(before + TWO_HOURS);
    expect(deadline.getTime()).toBeLessThanOrEqual(after  + TWO_HOURS + 1000);
  });

  it('returns null for all other statuses', () => {
    const { calcAutoApproveDeadline } = loadStateMachine();
    for (const s of ['queued', 'extracting', 'drafting', 'quality_check', 'auto_approved',
                     'requires_annotation', 'rejected', 'publishing', 'live', 'stale']) {
      expect(calcAutoApproveDeadline(s)).toBeNull();
    }
  });
});

// ── getDocStatus ──────────────────────────────────────────────────────────────

describe('getDocStatus', () => {
  it('returns the current status when the doc exists', async () => {
    const { getDocStatus } = loadStateMachine();
    const pool = { query: vi.fn(async () => ({ rows: [{ pipeline_status: 'live' }] })) };
    expect(await getDocStatus('doc-1', pool)).toBe('live');
  });

  it('returns null when the doc does not exist', async () => {
    const { getDocStatus } = loadStateMachine();
    const pool = { query: vi.fn(async () => ({ rows: [] })) };
    expect(await getDocStatus('missing', pool)).toBeNull();
  });
});

// ── ALLOWED_TRANSITIONS ───────────────────────────────────────────────────────

describe('ALLOWED_TRANSITIONS completeness', () => {
  it('covers all PipelineStatus values and contains only valid states', () => {
    const { ALLOWED_TRANSITIONS } = loadStateMachine();
    const allStates = new Set(Object.keys(ALLOWED_TRANSITIONS));
    for (const targets of Object.values(ALLOWED_TRANSITIONS)) {
      for (const t of targets) {
        expect(allStates.has(t)).toBe(true);
      }
    }
  });
});

// ── transitionDoc ─────────────────────────────────────────────────────────────

describe('transitionDoc', () => {
  function makePool(currentStatus) {
    let callCount = 0;
    return {
      query: vi.fn(async (sql) => {
        // First call: SELECT pipeline_status
        if (callCount++ === 0) {
          return { rows: currentStatus ? [{ pipeline_status: currentStatus }] : [] };
        }
        // Subsequent calls: UPDATE + INSERT
        return { rows: [] };
      }),
    };
  }

  it('applies a valid transition (queued -> extracting)', async () => {
    const { transitionDoc } = loadStateMachine();
    const pool = makePool('queued');
    await expect(transitionDoc('doc-1', 'extracting', { pool })).resolves.toBeUndefined();
    // Should call SELECT, UPDATE, INSERT = 3 queries
    expect(pool.query).toHaveBeenCalledTimes(3);
    // Prometheus counter emitted
    expect(mockTransitionCounter.inc).toHaveBeenCalledWith({
      from_status: 'queued',
      to_status:   'extracting',
      actor_type:  'system',
    });
  });

  it('applies quality_check -> auto_approved', async () => {
    const { transitionDoc } = loadStateMachine();
    const pool = makePool('quality_check');
    await expect(transitionDoc('doc-2', 'auto_approved', { pool, actorType: 'crystal' })).resolves.toBeUndefined();
    expect(mockTransitionCounter.inc).toHaveBeenCalledWith(
      expect.objectContaining({ from_status: 'quality_check', to_status: 'auto_approved', actor_type: 'crystal' }),
    );
  });

  it('throws InvalidTransitionError for a disallowed transition (live -> queued directly)', async () => {
    const { transitionDoc, InvalidTransitionError } = loadStateMachine();
    const pool = makePool('live');
    await expect(
      transitionDoc('doc-3', 'queued', { pool }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('throws when the doc is not found', async () => {
    const { transitionDoc } = loadStateMachine();
    const pool = makePool(null); // no row returned
    await expect(
      transitionDoc('missing', 'extracting', { pool }),
    ).rejects.toThrow('support_docs row not found');
  });

  it('throws InvalidTransitionError for a completely invalid jump (queued -> live)', async () => {
    const { transitionDoc, InvalidTransitionError } = loadStateMachine();
    const pool = makePool('queued');
    await expect(
      transitionDoc('doc-4', 'live', { pool }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    // Code is set
    try {
      await transitionDoc('doc-4', 'live', { pool: makePool('queued') });
    } catch (err) {
      expect(err.code).toBe('INVALID_PIPELINE_TRANSITION');
    }
  });

  it('sets auto_approve_deadline for pending_review transitions', async () => {
    const { transitionDoc } = loadStateMachine();
    const pool = makePool('quality_check');
    await transitionDoc('doc-5', 'pending_review', { pool });
    // The UPDATE call should have a non-null deadline arg
    const updateCall = pool.query.mock.calls.find((c) => c[0].includes('UPDATE support_docs'));
    expect(updateCall).toBeDefined();
    expect(updateCall[1][1]).toBeInstanceOf(Date); // deadline is the 2nd param
  });

  it('passes null deadline for non-pending_review transitions', async () => {
    const { transitionDoc } = loadStateMachine();
    const pool = makePool('queued');
    await transitionDoc('doc-6', 'extracting', { pool });
    const updateCall = pool.query.mock.calls.find((c) => c[0].includes('UPDATE support_docs'));
    expect(updateCall[1][1]).toBeNull();
  });
});

// ── runDocAutoApproveJob ──────────────────────────────────────────────────────

describe('runDocAutoApproveJob', () => {
  it('returns 0 when no docs have expired deadlines', async () => {
    const smMock = {
      transitionDoc: vi.fn(),
      ALLOWED_TRANSITIONS: {},
      scoreToStatus: vi.fn(),
      calcAutoApproveDeadline: vi.fn(() => null),
      getDocStatus: vi.fn(),
      InvalidTransitionError: class extends Error {},
    };
    const { runDocAutoApproveJob } = loadJob(smMock);

    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };
        return { rows: [] }; // no expired docs
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    const count = await runDocAutoApproveJob(pool);
    expect(count).toBe(0);
    expect(smMock.transitionDoc).not.toHaveBeenCalled();
  });

  it('auto-approves docs with expired deadlines', async () => {
    const smMock = {
      transitionDoc: vi.fn(async () => {}),
      InvalidTransitionError: class extends Error {},
    };
    const { runDocAutoApproveJob } = loadJob(smMock);

    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };
        // Return 2 expired docs from the SELECT
        return { rows: [{ id: 'doc-a' }, { id: 'doc-b' }] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    const count = await runDocAutoApproveJob(pool);
    expect(count).toBe(2);
    // Each doc gets 2 transitionDoc calls: pending_review->publishing, publishing->live
    expect(smMock.transitionDoc).toHaveBeenCalledTimes(4);
    expect(smMock.transitionDoc).toHaveBeenCalledWith('doc-a', 'publishing', expect.objectContaining({ actorType: 'system' }));
    expect(smMock.transitionDoc).toHaveBeenCalledWith('doc-a', 'live',       expect.objectContaining({ actorType: 'system' }));
    // Prometheus counter emitted per approved doc
    expect(mockAutoApprovedCounter.inc).toHaveBeenCalledTimes(2);
  });

  it('does not let one doc failure kill the batch', async () => {
    const smMock = {
      transitionDoc: vi.fn()
        .mockRejectedValueOnce(new Error('transition failed for doc-a'))  // doc-a fails
        .mockResolvedValue(undefined),                                      // doc-b succeeds
      InvalidTransitionError: class extends Error {},
    };
    const { runDocAutoApproveJob } = loadJob(smMock);

    const client = {
      query: vi.fn(async (sql) => {
        if (sql.includes('BEGIN') || sql.includes('COMMIT')) return { rows: [] };
        return { rows: [{ id: 'doc-a' }, { id: 'doc-b' }] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    const count = await runDocAutoApproveJob(pool);
    // doc-a fails (count not incremented), doc-b succeeds
    expect(count).toBe(1);
    expect(mockAutoApprovedCounter.inc).toHaveBeenCalledTimes(1);
  });

  it('uses FOR UPDATE SKIP LOCKED in the SELECT query', async () => {
    const smMock = { transitionDoc: vi.fn(), InvalidTransitionError: class extends Error {} };
    const { runDocAutoApproveJob } = loadJob(smMock);

    const queries = [];
    const client = {
      query: vi.fn(async (sql) => {
        queries.push(String(sql));
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    await runDocAutoApproveJob(pool);
    const selectSql = queries.find((q) => q.includes('pending_review'));
    expect(selectSql).toContain('FOR UPDATE SKIP LOCKED');
    expect(selectSql).toContain('auto_approve_deadline');
  });
});
