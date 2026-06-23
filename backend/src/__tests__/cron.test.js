import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { cronMatches, parseField } = createRequire(import.meta.url)(resolve(__dirname, '../lib/cron'));

// A fixed reference: Monday 2026-06-08 08:00. getDay() Monday = 1.
const mon0800 = new Date(2026, 5, 8, 8, 0, 0);

// ── cronMatches ───────────────────────────────────────────────────────────────

describe('cronMatches', () => {
  it('matches "every minute" *', () => {
    expect(cronMatches('* * * * *', mon0800)).toBe(true);
  });

  it('matches a specific minute+hour', () => {
    expect(cronMatches('0 8 * * *', mon0800)).toBe(true);
    expect(cronMatches('30 8 * * *', mon0800)).toBe(false);
    expect(cronMatches('0 9 * * *', mon0800)).toBe(false);
  });

  it('matches day-of-week (Mon = 1)', () => {
    expect(cronMatches('0 8 * * 1', mon0800)).toBe(true);  // Monday 8am — Weekly Digest
    expect(cronMatches('0 8 * * 2', mon0800)).toBe(false); // Tuesday
  });

  it('supports lists and ranges', () => {
    expect(cronMatches('0 8,9 * * *', mon0800)).toBe(true);
    expect(cronMatches('0 6-9 * * *', mon0800)).toBe(true);
    expect(cronMatches('0 6-7 * * *', mon0800)).toBe(false);
  });

  it('supports step values', () => {
    expect(cronMatches('*/15 8 * * *', mon0800)).toBe(true);  // minute 0 divisible by 15
    expect(cronMatches('*/15 8 * * *', new Date(2026, 5, 8, 8, 7))).toBe(false);
  });

  it('treats dow 7 as Sunday', () => {
    const sun = new Date(2026, 5, 7, 8, 0); // 2026-06-07 is a Sunday
    expect(cronMatches('0 8 * * 7', sun)).toBe(true);
    expect(cronMatches('0 8 * * 0', sun)).toBe(true);
  });

  it('rejects malformed expressions', () => {
    expect(cronMatches('bad', mon0800)).toBe(false);
    expect(cronMatches('* * *', mon0800)).toBe(false);
  });

  // ── new cases ──────────────────────────────────────────────────────────────

  it('matches specific day-of-month', () => {
    // mon0800 is June 8, so DOM = 8
    expect(cronMatches('0 8 8 * *', mon0800)).toBe(true);
    expect(cronMatches('0 8 9 * *', mon0800)).toBe(false);
  });

  it('matches specific month', () => {
    // mon0800 is in June (month 6)
    expect(cronMatches('0 8 * 6 *', mon0800)).toBe(true);
    expect(cronMatches('0 8 * 7 *', mon0800)).toBe(false);
  });

  it('matches step on hours field', () => {
    // */2 on hours: matches even hours (0, 2, 4, 6, 8, ...)
    expect(cronMatches('0 */2 * * *', mon0800)).toBe(true);   // 8 is even
    expect(cronMatches('0 */2 * * *', new Date(2026, 5, 8, 7, 0))).toBe(false); // 7 is odd
  });

  it('matches comma-separated minutes', () => {
    // "0,30 8 * * *" → minute 0 or 30, hour 8
    expect(cronMatches('0,30 8 * * *', mon0800)).toBe(true);
    expect(cronMatches('0,30 8 * * *', new Date(2026, 5, 8, 8, 30))).toBe(true);
    expect(cronMatches('0,30 8 * * *', new Date(2026, 5, 8, 8, 15))).toBe(false);
  });

  it('matches comma-separated days of week', () => {
    // "0 8 * * 1,3,5" → Mon, Wed, Fri at 8:00
    expect(cronMatches('0 8 * * 1,3,5', mon0800)).toBe(true);  // Monday
    expect(cronMatches('0 8 * * 2,4,6', mon0800)).toBe(false); // not Tue/Thu/Sat
  });

  it('standard DOM/DOW union: when both restricted, either match suffices', () => {
    // DOM = 8 (matches), DOW = 2 (Tue, does NOT match Monday)
    // Standard cron: domRestricted && dowRestricted → dom OR dow
    expect(cronMatches('0 8 8 * 2', mon0800)).toBe(true);  // DOM matches
    // DOM = 9 (no match), DOW = 1 (Mon, matches)
    expect(cronMatches('0 8 9 * 1', mon0800)).toBe(true);  // DOW matches
    // DOM = 9 (no match), DOW = 2 (no match) → false
    expect(cronMatches('0 8 9 * 2', mon0800)).toBe(false);
  });

  it('returns false for an empty string expression', () => {
    expect(cronMatches('', mon0800)).toBe(false);
  });

  it('returns false for a 6-field expression (too many fields)', () => {
    expect(cronMatches('0 8 * * * *', mon0800)).toBe(false);
  });

  it('matches minute range with step (e.g. 0-30/10)', () => {
    // 0-30/10 → 0, 10, 20, 30
    expect(cronMatches('0-30/10 8 * * *', mon0800)).toBe(true);  // minute 0
    expect(cronMatches('0-30/10 8 * * *', new Date(2026, 5, 8, 8, 10))).toBe(true);
    expect(cronMatches('0-30/10 8 * * *', new Date(2026, 5, 8, 8, 5))).toBe(false);
  });

  it('handles DOW range (Mon-Fri = 1-5)', () => {
    const fri = new Date(2026, 5, 12, 8, 0); // 2026-06-12 is a Friday
    expect(cronMatches('0 8 * * 1-5', mon0800)).toBe(true); // Monday in range
    expect(cronMatches('0 8 * * 1-5', fri)).toBe(true);     // Friday in range
    const sat = new Date(2026, 5, 13, 8, 0); // Saturday
    expect(cronMatches('0 8 * * 1-5', sat)).toBe(false);
  });

  it('matches at midnight (0 0 * * *)', () => {
    const midnight = new Date(2026, 5, 8, 0, 0, 0);
    expect(cronMatches('0 0 * * *', midnight)).toBe(true);
    expect(cronMatches('0 0 * * *', mon0800)).toBe(false);
  });

  it('matches the last valid minute (59) correctly', () => {
    const lastMin = new Date(2026, 5, 8, 23, 59, 0);
    expect(cronMatches('59 23 * * *', lastMin)).toBe(true);
    expect(cronMatches('59 22 * * *', lastMin)).toBe(false);
  });
});

// ── parseField ────────────────────────────────────────────────────────────────

describe('parseField', () => {
  it('wildcard * includes all values in range', () => {
    const s = parseField('*', 0, 5);
    expect([...s]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('single numeric value produces a single-element set', () => {
    const s = parseField('3', 0, 59);
    expect(s.size).toBe(1);
    expect(s.has(3)).toBe(true);
  });

  it('range a-b produces all integers from a to b inclusive', () => {
    const s = parseField('2-5', 0, 59);
    expect([...s]).toEqual([2, 3, 4, 5]);
  });

  it('step */n produces multiples of n starting from min', () => {
    const s = parseField('*/15', 0, 59);
    expect([...s]).toEqual([0, 15, 30, 45]);
  });

  it('step on range a-b/n produces values from a to b step n', () => {
    const s = parseField('0-30/10', 0, 59);
    expect([...s]).toEqual([0, 10, 20, 30]);
  });

  it('comma-separated list includes all listed values', () => {
    const s = parseField('1,3,5', 0, 7);
    expect([...s].sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it('comma-separated list can mix ranges and single values', () => {
    const s = parseField('1,3-5', 0, 7);
    expect([...s].sort((a, b) => a - b)).toEqual([1, 3, 4, 5]);
  });

  it('returns empty set for NaN input', () => {
    const s = parseField('abc', 0, 59);
    expect(s.size).toBe(0);
  });

  it('step of 1 on wildcard is equivalent to plain wildcard', () => {
    const step1 = parseField('*/1', 0, 5);
    const plain = parseField('*', 0, 5);
    expect([...step1].sort()).toEqual([...plain].sort());
  });

  it('single value at boundary min is included', () => {
    const s = parseField('0', 0, 59);
    expect(s.has(0)).toBe(true);
  });

  it('single value at boundary max is included', () => {
    const s = parseField('59', 0, 59);
    expect(s.has(59)).toBe(true);
  });

  it('wildcard on dow (0-7) includes all day values', () => {
    const s = parseField('*', 0, 7);
    for (let i = 0; i <= 7; i++) {
      expect(s.has(i)).toBe(true);
    }
  });
});
