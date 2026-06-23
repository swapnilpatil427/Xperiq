import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);
const DB_PATH  = _require.resolve(resolve(__dirname, '../lib/db'));
const MOD_PATH = _require.resolve(resolve(__dirname, '../lib/seats'));

let dbQuery;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function load() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

beforeEach(() => { dbQuery = vi.fn(async () => ({ rows: [] })); });

describe('checkSeatLimit', () => {
  it('always allows enterprise orgs (unlimited)', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ plan_tier: 'enterprise', seat_limit: 5 }] }));
    const { checkSeatLimit } = load();
    expect(await checkSeatLimit('o1', 1)).toMatchObject({ allowed: true, unlimited: true });
  });

  it('allows when projected usage is within the limit', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('plan_tier')) return { rows: [{ plan_tier: 'growth', seat_limit: 25, grace_period_end: null }] };
      if (text.includes('SUM(r.seat_weight)')) return { rows: [{ current: '10' }] };
      return { rows: [] };
    });
    const { checkSeatLimit } = load();
    expect(await checkSeatLimit('o1', 1)).toMatchObject({ allowed: true, current: 10, limit: 25 });
  });

  it('enters a grace period when just over the limit', async () => {
    let graceSet = false;
    dbQuery = vi.fn(async (text) => {
      if (text.includes('plan_tier')) return { rows: [{ plan_tier: 'starter', seat_limit: 5, grace_period_end: null }] };
      if (text.includes('SUM(r.seat_weight)')) return { rows: [{ current: '5' }] };
      if (text.startsWith('UPDATE org_profiles SET grace_period_end')) { graceSet = true; return { rows: [] }; }
      return { rows: [] };
    });
    const { checkSeatLimit } = load();
    const res = await checkSeatLimit('o1', 0.5); // 5.5 vs limit 5, grace 5.5 → allowed in grace
    expect(res.allowed).toBe(true);
    expect(res.inGracePeriod).toBe(true);
    expect(graceSet).toBe(true);
  });

  it('blocks when over the grace limit', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('plan_tier')) return { rows: [{ plan_tier: 'starter', seat_limit: 5, grace_period_end: null }] };
      if (text.includes('SUM(r.seat_weight)')) return { rows: [{ current: '5' }] };
      return { rows: [] };
    });
    const { checkSeatLimit } = load();
    const res = await checkSeatLimit('o1', 2); // 7 vs grace limit 5.5 → blocked
    expect(res.allowed).toBe(false);
  });
});

describe('seatBreakdown', () => {
  it('summarizes usage by role with available seats', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('plan_tier')) return { rows: [{ plan_tier: 'growth', seat_limit: 25, grace_period_end: null }] };
      if (text.includes('GROUP BY r.id')) return { rows: [
        { role_name: 'Admin', builtin_key: 'org:admin', seat_weight: '1.0', active_users: 2, billable: '2.0' },
        { role_name: 'Member', builtin_key: 'org:member', seat_weight: '0.0', active_users: 10, billable: '0.0' },
      ] };
      if (text.includes('SUM(r.seat_weight)')) return { rows: [{ current: '2' }] };
      return { rows: [] };
    });
    const { seatBreakdown } = load();
    const res = await seatBreakdown('o1');
    expect(res.billableSeats).toBe(2);
    expect(res.available).toBe(23);
    expect(res.byRole).toHaveLength(2);
  });
});
