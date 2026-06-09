import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { cronMatches } = createRequire(import.meta.url)(resolve(__dirname, '../lib/cron'));

// A fixed reference: Monday 2026-06-08 08:00. getDay() Monday = 1.
const mon0800 = new Date(2026, 5, 8, 8, 0, 0);

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
});
