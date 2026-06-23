import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _require = createRequire(import.meta.url);

const DB_PATH  = _require.resolve(resolve(__dirname, '../lib/db'));
const MOD_PATH = _require.resolve(resolve(__dirname, '../lib/dynamicGroups'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function load() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [] })); });

describe('buildDynamicGroupSQL', () => {
  it('compiles an AND ruleset with parameterized values ($1 = orgId)', () => {
    const { buildDynamicGroupSQL } = load();
    const { sql, params } = buildDynamicGroupSQL({
      operator: 'AND',
      rules: [
        { field: 'department_name', op: 'contains', value: 'Sales' },
        { field: 'location', op: 'eq', value: 'APAC' },
      ],
    }, 'org-1');
    expect(params[0]).toBe('org-1');
    expect(params).toContain('%Sales%');      // contains wraps in %…%
    expect(params).toContain('APAC');
    expect(sql).toContain('d.name ILIKE $2');
    expect(sql).toContain('up.location = $3');
    expect(sql).toContain(' AND ');
    expect(sql).toContain('up.org_id = $1');
  });

  it('supports custom_attributes paths safely', () => {
    const { buildDynamicGroupSQL } = load();
    const { sql } = buildDynamicGroupSQL({
      operator: 'OR', rules: [{ field: 'custom_attributes.region', op: 'eq', value: 'EMEA' }],
    }, 'o1');
    expect(sql).toContain("up.custom_attributes->>'region'");
  });

  it('compiles `in` to = ANY() with an array param', () => {
    const { buildDynamicGroupSQL } = load();
    const { sql, params } = buildDynamicGroupSQL({
      operator: 'AND', rules: [{ field: 'job_title', op: 'in', value: ['SE', 'PM'] }],
    }, 'o1');
    expect(sql).toContain('= ANY($2)');
    expect(params[1]).toEqual(['SE', 'PM']);
  });

  it('rejects unknown fields (anti-injection)', () => {
    const { buildDynamicGroupSQL } = load();
    expect(() => buildDynamicGroupSQL({ rules: [{ field: 'email; DROP TABLE', op: 'eq', value: 'x' }] }, 'o1'))
      .toThrow(/Unsupported dynamic-group field/);
  });

  it('rejects unknown operators', () => {
    const { buildDynamicGroupSQL } = load();
    expect(() => buildDynamicGroupSQL({ rules: [{ field: 'email', op: 'regex', value: '.*' }] }, 'o1'))
      .toThrow(/Unsupported operator/);
  });
});

describe('evaluateDynamicGroup', () => {
  it('adds matching users and removes stale members', async () => {
    const inserted = []; const deleted = [];
    dbQuery = vi.fn(async (text, params) => {
      if (text.includes('SELECT group_type, dynamic_rules')) {
        return { rows: [{ group_type: 'dynamic', dynamic_rules: { operator: 'AND', rules: [{ field: 'location', op: 'eq', value: 'NYC' }] } }] };
      }
      if (text.includes('FROM user_profiles up')) return { rows: [{ user_id: 'u1' }, { user_id: 'u2' }] };
      if (text.includes('SELECT user_id FROM user_group_members')) return { rows: [{ user_id: 'u2' }, { user_id: 'u3' }] };
      if (text.startsWith('INSERT INTO user_group_members')) { inserted.push(params); return { rows: [] }; }
      if (text.startsWith('DELETE FROM user_group_members')) { deleted.push(params); return { rows: [] }; }
      return { rows: [] };
    });
    const { evaluateDynamicGroup } = load();
    const res = await evaluateDynamicGroup('g1', 'o1');
    expect(res).toEqual({ added: 1, removed: 1 });   // add u1, remove u3
    expect(inserted[0]).toContain('u1');
    expect(deleted[0][1]).toEqual(['u3']);
  });

  it('no-ops for non-dynamic groups', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ group_type: 'static', dynamic_rules: null }] }));
    const { evaluateDynamicGroup } = load();
    expect(await evaluateDynamicGroup('g1', 'o1')).toEqual({ added: 0, removed: 0 });
  });
});
