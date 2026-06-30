// Prism TRANSFORM — survey_id stamping on staged rows (the import → survey seam).
//
// transform() is a pure function (no DB), so it loads directly via the tsx hook.
// These tests assert that response rows carry the materialized survey_id from the
// transform context (so LOAD can satisfy responses.survey_id NOT NULL) and that
// signal rows never carry one.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const { transform } = _require(resolve(__dirname, '../../lib/prism/transform'));

function raw(overrides = {}) {
  return {
    org_id: 'o1',
    job_id: 'j1',
    connection_id: 'c1',
    source_platform: 'file',
    record_type: 'response',
    source_record_id: 'R_1',
    payload: { q1: 9, q2: 'great' },
    payload_hash: 'h',
    ingress: 'file',
    source_observed_at: null,
    ...overrides,
  };
}

const mapping = {
  org_id: 'o1',
  connection_id: 'c1',
  schema_shape_hash: 'shape',
  mapping_version: 1,
  mappings: [
    { source_field: 'q1', target: 'nps', metric: 'nps', confidence: 1, origin: 'deterministic' },
    { source_field: 'q2', target: 'open_text', confidence: 1, origin: 'deterministic' },
  ],
};

describe('transform — stamps the materialized survey_id on response rows', () => {
  it('stamps ctx.surveyId on every response staged row', () => {
    const { rows } = transform([raw(), raw({ source_record_id: 'R_2' })], mapping, {
      importBatchId: 'b1',
      mappingVersion: 1,
      surveyId: 'survey-xyz',
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === 'response')).toBe(true);
    expect(rows.every((r) => r.survey_id === 'survey-xyz')).toBe(true);
  });

  it('defaults survey_id to null when ctx.surveyId is absent (LOAD falls back to the batch id)', () => {
    const { rows } = transform([raw()], mapping, { importBatchId: 'b1', mappingVersion: 1 });
    expect(rows[0].survey_id).toBeNull();
  });

  it('signal rows never carry a survey_id', () => {
    const { rows } = transform([raw({ record_type: 'review' })], mapping, {
      importBatchId: 'b1',
      mappingVersion: 1,
      surveyId: 'survey-xyz',
    });
    expect(rows[0].kind).toBe('signal');
    expect(rows[0].survey_id).toBeNull();
  });
});
