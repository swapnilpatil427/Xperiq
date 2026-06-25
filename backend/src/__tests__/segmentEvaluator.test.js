/**
 * Tests for lib/segmentEvaluator.ts
 *
 * Builds parameterized SQL WHERE clauses from segment filter definitions (FilterDef),
 * then queries contacts to evaluate/preview matching members.
 *
 * buildWhereClause(filterDef, orgId):
 *   Converts condition objects {field, operator, value} into SQL fragments.
 *   Guards against SQL injection via ALLOWED_SEGMENT_FIELDS allowlist and
 *   ALLOWED_JSONB_KEY regex. Returns FALSE clause for unknown/unsafe fields.
 *
 * evaluateSegment(filterDef, orgId):
 *   Runs COUNT + preview SELECT against contacts table. Returns {count, preview}.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH  = _require.resolve(resolve(__dirname, '../lib/db'));
const MOD_PATH = _require.resolve(resolve(__dirname, '../lib/segmentEvaluator'));

// segmentEvaluator imports from schemas/contact-segments — resolve it so it
// loads correctly through the tsx hook without any extra mocking.
const SCHEMA_PATH = _require.resolve(resolve(__dirname, '../schemas/contact-segments'));

let dbQuery;

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

function load() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  // schema is pure Zod — let it load normally; only clear the module under test
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

describe('buildWhereClause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbQuery = vi.fn(async () => ({ rows: [] }));
  });

  it('returns base org + anonymized_at clauses for empty conditions', () => {
    const { buildWhereClause } = load();
    const filterDef = { logic: 'AND', conditions: [] };
    const [where, params] = buildWhereClause(filterDef, 'org1');
    expect(where).toContain('org_id = $1');
    expect(where).toContain('anonymized_at IS NULL');
    expect(params[0]).toBe('org1');
  });

  it('correctly handles email contains → ILIKE with % wrapping', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: 'email', operator: 'contains', value: 'acme' }],
    };
    const [where, params] = buildWhereClause(filterDef, 'org1');
    expect(where).toMatch(/email ILIKE \$\d+/);
    const ilikeParam = params.find((p) => typeof p === 'string' && p.includes('acme'));
    expect(ilikeParam).toBe('%acme%');
  });

  it('correctly handles account_name equals → = with exact value', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: 'account_name', operator: 'eq', value: 'Acme Corp' }],
    };
    const [where, params] = buildWhereClause(filterDef, 'org1');
    expect(where).toMatch(/account_name = \$\d+/);
    expect(params).toContain('Acme Corp');
  });

  it('correctly handles segment_attrs.tier equals → JSONB arrow operator', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: 'segment_attrs.tier', operator: 'eq', value: 'gold' }],
    };
    const [where, params] = buildWhereClause(filterDef, 'org1');
    expect(where).toContain("segment_attrs->>'tier'");
    expect(where).toMatch(/= \$\d+/);
    expect(params).toContain('gold');
  });

  it('SQL injection guard: unknown field with SQL in name returns FALSE clause', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: "email'; DROP TABLE contacts; --", operator: 'eq', value: 'x' }],
    };
    const [where] = buildWhereClause(filterDef, 'org1');
    // The injected field is not in ALLOWED_SEGMENT_FIELDS, so it should produce FALSE
    expect(where).toContain('FALSE');
  });

  it('JSONB injection guard: key with special chars returns FALSE clause', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: "segment_attrs.x' OR '1'='1", operator: 'eq', value: 'y' }],
    };
    const [where] = buildWhereClause(filterDef, 'org1');
    // ALLOWED_JSONB_KEY regex rejects the key
    expect(where).toContain('FALSE');
  });

  it('unknown field not in ALLOWED_SEGMENT_FIELDS returns FALSE clause', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: 'internal_notes', operator: 'eq', value: 'secret' }],
    };
    const [where] = buildWhereClause(filterDef, 'org1');
    expect(where).toContain('FALSE');
  });

  it('handles multiple conditions joined with AND logic', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [
        { field: 'email', operator: 'contains', value: 'acme' },
        { field: 'account_name', operator: 'eq', value: 'Acme Corp' },
      ],
    };
    const [where, params] = buildWhereClause(filterDef, 'org1');
    expect(where).toMatch(/email ILIKE \$\d+/);
    expect(where).toMatch(/account_name = \$\d+/);
    // Params include orgId + both values
    expect(params).toContain('%acme%');
    expect(params).toContain('Acme Corp');
  });

  it('handles OR logic joining user conditions', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'OR',
      conditions: [
        { field: 'email', operator: 'contains', value: 'acme' },
        { field: 'account_name', operator: 'eq', value: 'OtherCorp' },
      ],
    };
    const [where] = buildWhereClause(filterDef, 'org1');
    // User conditions should be OR'd
    expect(where).toContain(' OR ');
  });

  it('handles segment_attrs contains → ILIKE with % wrapping', () => {
    const { buildWhereClause } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: 'segment_attrs.plan', operator: 'contains', value: 'enterprise' }],
    };
    const [where, params] = buildWhereClause(filterDef, 'org1');
    expect(where).toMatch(/segment_attrs->>'plan' ILIKE \$\d+/);
    expect(params).toContain('%enterprise%');
  });
});

describe('evaluateSegment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls DB with WHERE clause and returns count and preview', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.startsWith('SELECT COUNT')) return { rows: [{ count: '42' }] };
      if (sql.startsWith('SELECT id')) return { rows: [{ id: 'c1', name: 'Alice', email: 'alice@acme.com', account_name: 'Acme' }] };
      return { rows: [] };
    });
    const { evaluateSegment } = load();
    const filterDef = {
      logic: 'AND',
      conditions: [{ field: 'email', operator: 'contains', value: 'acme' }],
    };
    const result = await evaluateSegment(filterDef, 'org1');
    expect(result.count).toBe(42);
    expect(result.preview).toHaveLength(1);
    expect(result.preview[0]).toMatchObject({ id: 'c1', email: 'alice@acme.com' });
    // Both queries should include 'contacts' table
    expect(dbQuery).toHaveBeenCalledTimes(2);
    const sqlCalls = dbQuery.mock.calls.map(([sql]) => sql);
    expect(sqlCalls.every((s) => s.includes('contacts'))).toBe(true);
  });

  it('passes org_id param to queries to scope contacts to the org', async () => {
    dbQuery = vi.fn(async (sql) => {
      if (sql.startsWith('SELECT COUNT')) return { rows: [{ count: '0' }] };
      return { rows: [] };
    });
    const { evaluateSegment } = load();
    const filterDef = { logic: 'AND', conditions: [] };
    await evaluateSegment(filterDef, 'org1');
    const params = dbQuery.mock.calls[0][1];
    expect(params[0]).toBe('org1');
  });
});
