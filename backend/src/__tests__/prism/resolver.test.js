// Prism mapping resolver — deterministic L1/L2 + schema-shape-hash unit tests.
//
// Tests are .js loading .ts source via the tsx CJS hook (src/test/setup.cjs).
// The DB (lib/db) and agentsClient are mocked by injecting into require.cache
// (the backend mock pattern — see backend/CLAUDE.md "Testing"). No live DB/HTTP.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);
const DB_PATH = _require.resolve(resolve(__dirname, '../../lib/db'));
const AGENTS_PATH = _require.resolve(resolve(__dirname, '../../lib/agentsClient'));
const RESOLVER_PATH = _require.resolve(resolve(__dirname, '../../lib/prism/mapping/resolver'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

let dbQuery;
function loadResolver() {
  // Inject DB + agentsClient (no proposeMapping export → L3 degrades to
  // preserve-as-embedded, the deterministic safe default we assert on).
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[AGENTS_PATH] = fakeMod(AGENTS_PATH, { default: {} });
  delete _require.cache[RESOLVER_PATH];
  return _require(RESOLVER_PATH);
}

// A Qualtrics profile: one NPS metric field + one open-text + one unknown field.
const npsProfile = {
  fields: [
    { name: 'Q1', type: 'NPS' },
    { name: 'Q2', type: 'TE:SL' },
    { name: 'Q9', type: 'SomethingNovel' },
  ],
  shapeHash: '',
};

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [] }));
});

describe('schemaShapeHash', () => {
  it('is stable + order-independent (sorted field signature)', () => {
    const { schemaShapeHash } = loadResolver();
    const a = schemaShapeHash({ fields: [{ name: 'A', type: 'NPS' }, { name: 'B', type: 'TE:SL' }], shapeHash: '' });
    const b = schemaShapeHash({ fields: [{ name: 'B', type: 'TE:SL' }, { name: 'A', type: 'NPS' }], shapeHash: '' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b); // reorder does not change the hash
  });

  it('is collision-safe: different shapes hash differently', () => {
    const { schemaShapeHash } = loadResolver();
    const a = schemaShapeHash({ fields: [{ name: 'A', type: 'NPS' }], shapeHash: '' });
    const b = schemaShapeHash({ fields: [{ name: 'A', type: 'TE:SL' }], shapeHash: '' });
    expect(a).not.toBe(b);
  });
});

describe('resolve — L1 deterministic + residual handling', () => {
  it('maps a Qualtrics NPS field to nps with the metric tag (deterministic origin)', async () => {
    const { resolve: resolveFn } = loadResolver();
    const res = await resolveFn('o1', 'c1', 'qualtrics', npsProfile);
    const nps = res.mappings.find((m) => m.source_field === 'Q1');
    expect(nps).toMatchObject({
      target: 'nps',
      metric: 'nps',
      origin: 'deterministic',
      confidence: 1,
    });
    expect(res.fromMemory).toBe(false);
  });

  it('preserves an unmapped residual field as embedded_data (no source loss, low confidence)', async () => {
    const { resolve: resolveFn } = loadResolver();
    const res = await resolveFn('o1', 'c1', 'qualtrics', npsProfile);
    const residual = res.mappings.find((m) => m.source_field === 'Q9');
    expect(residual).toMatchObject({ target: 'embedded_data', origin: 'llm' });
    expect(residual.confidence).toBeLessThan(0.5);
  });
});

describe('resolve — L2 memory auto-apply on identical shape', () => {
  it('auto-applies the confirmed org mapping when the field-set matches exactly', async () => {
    const { resolve: resolveFn, schemaShapeHash } = loadResolver();
    const shapeHash = schemaShapeHash(npsProfile);
    // Memory mapping whose field-set (source_field::source_type) matches the profile exactly.
    const memMappings = [
      { source_field: 'Q1', source_type: 'NPS', target: 'nps', metric: 'nps', confidence: 1, origin: 'deterministic' },
      { source_field: 'Q2', source_type: 'TE:SL', target: 'short_text', confidence: 1, origin: 'deterministic' },
      { source_field: 'Q9', source_type: 'SomethingNovel', target: 'embedded_data', confidence: 1, origin: 'template' },
    ];
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM prism_mappings') && text.includes('schema_shape_hash')) {
        return { rows: [{ id: 'm1', org_id: 'o1', connection_id: 'c1', schema_shape_hash: shapeHash, mapping_version: 3, mappings: memMappings }] };
      }
      return { rows: [] };
    });
    // Reload resolver so it re-reads the new dbQuery via require.cache.
    delete _require.cache[RESOLVER_PATH];
    const reloaded = loadResolver();
    const res = await reloaded.resolve('o1', 'c1', 'qualtrics', npsProfile);
    expect(res.fromMemory).toBe(true);
    expect(res.baseVersion).toBe(3);
    expect(res.mappings).toEqual(memMappings);
    expect(res.driftFields).toEqual([]);
  });

  it('treats a hash hit with a field-set mismatch as a new shape (no auto-apply)', async () => {
    const { schemaShapeHash } = loadResolver();
    const shapeHash = schemaShapeHash(npsProfile);
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM prism_mappings') && text.includes('schema_shape_hash')) {
        // Same hash bucket but a DIFFERENT field-set → must NOT auto-apply.
        return { rows: [{ id: 'm1', org_id: 'o1', connection_id: 'c1', schema_shape_hash: shapeHash, mapping_version: 1, mappings: [{ source_field: 'OTHER', source_type: 'NPS', target: 'nps', confidence: 1, origin: 'deterministic' }] }] };
      }
      return { rows: [] };
    });
    delete _require.cache[RESOLVER_PATH];
    const reloaded = loadResolver();
    const res = await reloaded.resolve('o1', 'c1', 'qualtrics', npsProfile);
    expect(res.fromMemory).toBe(false);
    // Re-resolved deterministically: NPS still maps.
    expect(res.mappings.find((m) => m.source_field === 'Q1')).toMatchObject({ target: 'nps' });
  });
});
