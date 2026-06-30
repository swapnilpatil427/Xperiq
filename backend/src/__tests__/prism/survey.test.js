// Prism import → Survey materialization (ensureImportSurvey) unit tests.
//
// An import has no pre-existing survey but responses.survey_id is NOT NULL, so an
// import MATERIALIZES a survey. These tests verify: idempotent reuse via the job
// cursor, question synthesis from confirmed mappings (embedded_data → not a question),
// building from a survey_def when present, title derivation, and the atomic
// row-create + cursor-stamp.
//
// Tests are .js loading .ts source via the tsx CJS hook (src/test/setup.cjs).
// lib/db is mocked by injecting into require.cache (backend mock pattern):
// ensureImportSurvey reads via top-level query() and writes via pool.connect() txn.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);
const DB_PATH = _require.resolve(resolve(__dirname, '../../lib/db'));
const SURVEY_PATH = _require.resolve(resolve(__dirname, '../../lib/prism/survey'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

let clientQuery, topQuery, releaseSpy;
function loadSurvey() {
  const client = { query: clientQuery, release: releaseSpy };
  const pool = { connect: vi.fn(async () => client) };
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: topQuery, pool, default: { query: topQuery, pool } });
  delete _require.cache[SURVEY_PATH];
  return _require(SURVEY_PATH);
}

function job(overrides = {}) {
  return {
    id: 'j1',
    org_id: 'o1',
    connection_id: 'c1',
    kind: 'migration',
    stage: 'map',
    status: 'awaiting_input',
    cursor: {},
    counts: {},
    error: null,
    triggered_by: 'user',
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

const conn = { id: 'c1', platform: 'csv', label: 'csv', config: {} };

beforeEach(() => {
  releaseSpy = vi.fn();
  topQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
});

describe('ensureImportSurvey — materialize one survey per import job', () => {
  it('creates an active survey and stamps survey_id on the job cursor (atomically)', async () => {
    const calls = [];
    clientQuery = vi.fn(async (text, params) => {
      calls.push({ text, params });
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [], rowCount: 0 };
      if (/INSERT INTO surveys/.test(text)) return { rows: [{ id: 'survey-123' }], rowCount: 1 };
      return { rows: [], rowCount: 1 }; // the cursor UPDATE
    });
    const { ensureImportSurvey } = loadSurvey();
    const mappings = [
      { source_field: 'q1', target: 'nps', metric: 'nps', confidence: 1, origin: 'deterministic' },
      { source_field: 'q2', target: 'open_text', confidence: 1, origin: 'deterministic' },
    ];
    const id = await ensureImportSurvey({ orgId: 'o1', job: job(), connection: conn, mappings });
    expect(id).toBe('survey-123');

    const insert = calls.find((c) => /INSERT INTO surveys/.test(c.text));
    expect(insert.text).toMatch(/'active'/);                 // status active → visible in Surveys list
    expect(insert.params[0]).toBe('o1');                     // org_id scoping
    const questions = JSON.parse(insert.params[3]);          // questions JSONB
    expect(questions.map((q) => q.type)).toEqual(['nps', 'open_text']);
    expect(questions[0].metric).toBe('nps');

    // The cursor was stamped with the new survey_id in the SAME transaction.
    const update = calls.find((c) => /UPDATE prism_jobs/.test(c.text));
    expect(JSON.parse(update.params[2])).toEqual({ survey_id: 'survey-123' });
    expect(calls.map((c) => c.text)).toContain('COMMIT');
  });

  it('embedded_data / preserve / display_text fields become embedded data, NOT questions', async () => {
    let insertParams;
    clientQuery = vi.fn(async (text, params) => {
      if (/INSERT INTO surveys/.test(text)) { insertParams = params; return { rows: [{ id: 's1' }], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    });
    const { ensureImportSurvey } = loadSurvey();
    const mappings = [
      { source_field: 'score', target: 'csat', metric: 'csat', confidence: 1, origin: 'deterministic' },
      { source_field: 'email', target: 'embedded_data', confidence: 0.2, origin: 'llm' },
      { source_field: 'note', target: 'preserve', confidence: 0.2, origin: 'llm' },
    ];
    await ensureImportSurvey({ orgId: 'o1', job: job(), connection: conn, mappings });
    const questions = JSON.parse(insertParams[3]);
    const metadata = JSON.parse(insertParams[5]);
    expect(questions.map((q) => q.source_field)).toEqual(['score']); // only the real question
    expect(metadata.prism.embedded_data.map((e) => e.source_field).sort()).toEqual(['email', 'note']);
  });

  it('reuses the existing survey_id from the cursor (idempotent on re-run)', async () => {
    // Cursor already points at a live survey → the SELECT returns it, no INSERT.
    topQuery = vi.fn(async (text) => {
      if (/SELECT id FROM surveys/.test(text)) return { rows: [{ id: 'existing-s' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    clientQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const { ensureImportSurvey } = loadSurvey();
    const id = await ensureImportSurvey({
      orgId: 'o1',
      job: job({ cursor: { survey_id: 'existing-s' } }),
      connection: conn,
      mappings: [{ source_field: 'q1', target: 'nps', confidence: 1, origin: 'deterministic' }],
    });
    expect(id).toBe('existing-s');
    // No new survey was inserted.
    const inserted = clientQuery.mock.calls.some((c) => /INSERT INTO surveys/.test(c[0]));
    expect(inserted).toBe(false);
  });

  it('re-materializes when the cursor points at a missing/deleted survey', async () => {
    topQuery = vi.fn(async (text) => {
      if (/SELECT id FROM surveys/.test(text)) return { rows: [], rowCount: 0 }; // gone
      return { rows: [], rowCount: 0 };
    });
    clientQuery = vi.fn(async (text) => {
      if (/INSERT INTO surveys/.test(text)) return { rows: [{ id: 'fresh-s' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const { ensureImportSurvey } = loadSurvey();
    const id = await ensureImportSurvey({
      orgId: 'o1',
      job: job({ cursor: { survey_id: 'stale-s' } }),
      connection: conn,
      mappings: [{ source_field: 'q1', target: 'nps', confidence: 1, origin: 'deterministic' }],
    });
    expect(id).toBe('fresh-s');
  });

  it('builds the survey FROM a survey_def payload when present (title + questions)', async () => {
    let insertParams;
    clientQuery = vi.fn(async (text, params) => {
      if (/INSERT INTO surveys/.test(text)) { insertParams = params; return { rows: [{ id: 's1' }], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    });
    const { ensureImportSurvey } = loadSurvey();
    const surveyDef = {
      name: 'NPS Relational 2026',
      questions: {
        QID1: { questionText: 'How likely to recommend?', questionType: { type: 'nps' } },
        QID2: { questionText: 'Why?', questionType: { type: 'open_text' } },
      },
    };
    await ensureImportSurvey({
      orgId: 'o1',
      job: job(),
      connection: { id: 'c1', platform: 'qualtrics', label: 'Qualtrics', config: {} },
      mappings: [{ source_field: 'QID1', target: 'embedded_data', confidence: 0.2, origin: 'llm' }],
      surveyDef,
    });
    expect(insertParams[1]).toBe('NPS Relational 2026'); // title from the def name
    const questions = JSON.parse(insertParams[3]);
    expect(questions.map((q) => q.id).sort()).toEqual(['QID1', 'QID2']); // built from the def, not the mapping
  });

  it('rolls back on a failed write', async () => {
    const order = [];
    clientQuery = vi.fn(async (text) => {
      order.push(text === 'BEGIN' || text === 'ROLLBACK' || text === 'COMMIT' ? text : 'WRITE');
      if (text === 'BEGIN' || text === 'ROLLBACK') return { rows: [], rowCount: 0 };
      throw new Error('insert boom');
    });
    const { ensureImportSurvey } = loadSurvey();
    await expect(
      ensureImportSurvey({ orgId: 'o1', job: job(), connection: conn, mappings: [{ source_field: 'q', target: 'nps', confidence: 1, origin: 'deterministic' }] }),
    ).rejects.toThrow('insert boom');
    expect(order).toContain('ROLLBACK');
    expect(releaseSpy).toHaveBeenCalled();
  });
});
