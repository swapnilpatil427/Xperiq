/**
 * Prism file-dialect framework tests.
 *
 * Covers the new generic + Qualtrics CSV parsing path: the RFC-4180 tokenizer, dialect
 * detection/selection, header resolution (incl. the Qualtrics 3-row shape with ImportId
 * metadata), defensive edge cases, and the connector profile() type inference.
 *
 * Tests are `.js` and load `.ts` source via the tsx CJS hook (src/test/setup.cjs).
 */
import { createRequire } from 'module';
import assert from 'assert';
import { describe, it } from 'vitest';
import { fileURLToPath } from 'url';

const req = createRequire(fileURLToPath(import.meta.url));

const csv = req('../lib/prism/parsing/csv.ts');
const dialects = req('../lib/prism/parsing/dialects.ts');
const profile = req('../lib/prism/parsing/profile.ts');
const helpers = req('../lib/prism/helpers/index.ts');
const { fileConnector } = req('../lib/prism/connectors/file.ts');

// ── Tokenizer ─────────────────────────────────────────────────────────────────

describe('tokenizeCsv', () => {
  it('parses quoted fields with embedded commas and newlines', () => {
    const text = 'a,b\n"x,y","line1\nline2"\n';
    const { rows } = csv.tokenizeCsv(text);
    assert.deepStrictEqual(rows, [['a', 'b'], ['x,y', 'line1\nline2']]);
  });

  it('handles escaped quotes ("")', () => {
    const { rows } = csv.tokenizeCsv('h\n"she said ""hi"""\n');
    assert.deepStrictEqual(rows, [['h'], ['she said "hi"']]);
  });

  it('strips a UTF-8 BOM', () => {
    const { rows } = csv.tokenizeCsv('﻿a,b\n1,2');
    assert.deepStrictEqual(rows[0], ['a', 'b']);
  });

  it('honors a leading sep= hint', () => {
    const { rows, delimiter, sepHint } = csv.tokenizeCsv('sep=;\na;b\n1;2');
    assert.strictEqual(sepHint, true);
    assert.strictEqual(delimiter, ';');
    assert.deepStrictEqual(rows, [['a', 'b'], ['1', '2']]);
  });

  it('auto-sniffs a tab delimiter when no hint', () => {
    const { rows, delimiter } = csv.tokenizeCsv('a\tb\tc\n1\t2\t3');
    assert.strictEqual(delimiter, '\t');
    assert.deepStrictEqual(rows[1], ['1', '2', '3']);
  });

  it('tolerates CRLF line endings', () => {
    const { rows } = csv.tokenizeCsv('a,b\r\n1,2\r\n');
    assert.deepStrictEqual(rows, [['a', 'b'], ['1', '2']]);
  });

  it('returns [] for empty input', () => {
    assert.deepStrictEqual(csv.tokenizeCsv('').rows, []);
  });
});

// ── Dialect detection + header resolution ───────────────────────────────────────

const QUALTRICS_CSV = [
  'StartDate,EndDate,Status,ResponseId,Q1,Q2',
  '"Start Date","End Date","Response Type","Response ID","How likely are you to recommend us?","Any comments?"',
  '"{""ImportId"":""startDate"",""timeZone"":""America/Denver""}","{""ImportId"":""endDate"",""timeZone"":""America/Denver""}","{""ImportId"":""status""}","{""ImportId"":""_recordId""}","{""ImportId"":""QID1""}","{""ImportId"":""QID2_TEXT""}"',
  '2025-08-19 22:00:00,2025-08-19 22:05:00,IP Address,R_abc123,9,"Great product, loved it"',
  '2025-08-19 22:10:00,2025-08-19 22:14:00,IP Address,R_def456,3,"Too slow"',
].join('\n');

describe('selectDialect', () => {
  it('detects the Qualtrics CSV dialect via the ImportId metadata row', () => {
    const { rows } = csv.tokenizeCsv(QUALTRICS_CSV);
    const d = dialects.selectDialect(rows, { filename: 'export.csv', platform: 'qualtrics' });
    assert.strictEqual(d.id, 'qualtrics_csv');
  });

  it('falls back to generic_csv for a plain single-header CSV', () => {
    const { rows } = csv.tokenizeCsv('name,score\nAlice,9\nBob,3');
    const d = dialects.selectDialect(rows, { filename: 'plain.csv' });
    assert.strictEqual(d.id, 'generic_csv');
  });

  it('never throws and always returns a dialect for garbage', () => {
    const { rows } = csv.tokenizeCsv('@@@@\n!!!!');
    const d = dialects.selectDialect(rows, { filename: 'weird.csv' });
    assert.ok(d && typeof d.id === 'string');
  });
});

describe('qualtrics_csv resolveHeader', () => {
  it('uses ImportId as the stable field id and question text as the label', () => {
    const { rows } = csv.tokenizeCsv(QUALTRICS_CSV);
    const d = dialects.selectDialect(rows, { filename: 'export.csv', platform: 'qualtrics' });
    const { fields, dataStartRow } = d.resolveHeader(rows);
    assert.strictEqual(dataStartRow, 3); // data begins AFTER the metadata row
    const ids = fields.map((f) => f.id);
    assert.deepStrictEqual(ids, ['startDate', 'endDate', 'status', '_recordId', 'QID1', 'QID2_TEXT']);
    // The richer of row-1/row-2 becomes the human label.
    const q1 = fields.find((f) => f.id === 'QID1');
    assert.strictEqual(q1.label, 'How likely are you to recommend us?');
  });
});

describe('disambiguate', () => {
  it('disambiguates duplicate and empty headers', () => {
    assert.deepStrictEqual(
      dialects.disambiguate(['a', 'a', '', 'b', 'a']),
      ['a', 'a__2', 'col_3', 'b', 'a__3'],
    );
  });
});

// ── parseCsv end-to-end through the dialect framework ───────────────────────────

describe('parseCsv', () => {
  it('parses a Qualtrics export into rows keyed by ImportId, skipping the 3 header rows', () => {
    const out = helpers.parseCsv(QUALTRICS_CSV, { filename: 'export.csv', platform: 'qualtrics' });
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].QID1, '9');
    assert.strictEqual(out[0]._recordId, 'R_abc123');
    assert.strictEqual(out[0].QID2_TEXT, 'Great product, loved it');
    assert.strictEqual(out[1].QID1, '3');
  });

  it('parses a generic CSV with a single header row', () => {
    const out = helpers.parseCsv('name,score\nAlice,9\nBob,3');
    assert.deepStrictEqual(out, [
      { name: 'Alice', score: '9' },
      { name: 'Bob', score: '3' },
    ]);
  });

  it('pads short/ragged rows with null', () => {
    const out = helpers.parseCsv('a,b,c\n1,2\n4,5,6');
    assert.deepStrictEqual(out[0], { a: '1', b: '2', c: null });
  });

  it('returns [] for empty and header-only input', () => {
    assert.deepStrictEqual(helpers.parseCsv(''), []);
    assert.deepStrictEqual(helpers.parseCsv('a,b,c'), []);
  });
});

// ── Type inference (shared profiler) ────────────────────────────────────────────

describe('inferColumnType', () => {
  it('classifies common shapes', () => {
    assert.strictEqual(profile.inferColumnType(['9', '10', '0', '7']), 'nps');
    assert.strictEqual(profile.inferColumnType(['1', '2', '5']), 'scale');
    assert.strictEqual(profile.inferColumnType(['12.5', '300', '-4']), 'number');
    assert.strictEqual(profile.inferColumnType(['2025-08-19 22:00:00', '2025-01-01']), 'date');
    assert.strictEqual(profile.inferColumnType(['a@b.com', 'c@d.org']), 'email');
    assert.strictEqual(profile.inferColumnType(['yes', 'no', 'yes']), 'boolean');
    assert.strictEqual(
      profile.inferColumnType(['a long free-text answer that goes on and on and on and beyond']),
      'text',
    );
    assert.strictEqual(profile.inferColumnType(['', '  ']), 'null');
  });
});

// ── Connector profile() over keyed payloads ─────────────────────────────────────

describe('fileConnector.profile', () => {
  it('infers types and keeps ImportId field names as the mapping key', () => {
    const out = helpers.parseCsv(QUALTRICS_CSV, { filename: 'export.csv', platform: 'qualtrics' });
    const raw = out.map((row, i) => ({
      org_id: 'o1', job_id: '', connection_id: 'c1', source_platform: 'file',
      record_type: 'response', source_record_id: `r${i}`, payload: row, payload_hash: 'h',
      ingress: 'file', source_observed_at: null,
    }));
    const prof = fileConnector.profile(raw);
    const names = prof.fields.map((f) => f.name);
    assert.ok(names.includes('QID1'));
    assert.ok(names.includes('_recordId'));
    const q1 = prof.fields.find((f) => f.name === 'QID1');
    assert.strictEqual(q1.type, 'nps'); // values 9, 3 → 0..10 integers
    assert.ok(typeof prof.shapeHash === 'string' && prof.shapeHash.length > 0);
  });
});
