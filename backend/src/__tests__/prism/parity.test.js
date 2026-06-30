// Prism DRY-RUN parity explainer — pure-logic unit tests (no DB).
//
// explainParity() is a pure function: given per-respondent scores + the source's
// reported value, it computes the Prism value and, on a mismatch, picks the
// most-likely cause from an ordered hypothesis list. Loaded via the tsx CJS hook.
import { createRequire } from 'module';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireTs = createRequire(import.meta.url);
const { explainParity } = requireTs(path.resolve(__dirname, '../../lib/prism/dryrun.ts'));

describe('explainParity', () => {
  it('matches when source equals the Prism-computed NPS', () => {
    // 3 promoters (>=9), 1 detractor (<=6), 1 passive → (3-1)/5*100 = 40.
    const entry = explainParity({ metric: 'nps', scores: [10, 9, 9, 7, 3], sourceValue: 40 });
    expect(entry.match).toBe(true);
    expect(entry.prism_computed).toBe(40);
    expect(entry.method).toBe('prism');
  });

  it('identifies a half-up vs banker rounding gap', () => {
    // mean = 2.5 → Prism half-up rounds to 2.5 already; use a 2-dp case that
    // diverges: scores averaging x.xx5 where half-up and banker differ.
    // mean of [1, 2] over 2dp won't diverge; construct a mean ending in ...5 at 2dp.
    // scores: [3.125, 3.125] -> mean 3.125; at 2dp half-up=3.13, banker=3.12.
    const entry = explainParity({ metric: 'csat', scores: [3.125, 3.125], sourceValue: 3.12 });
    expect(entry.match).toBe(false);
    expect(entry.prism_computed).toBe(3.13); // half-up
    expect(entry.explanation).toMatch(/banker|round-half-to-even/i);
    expect(entry.delta).toBeDefined();
  });

  it('identifies a top-2-box vs mean definition gap (CSAT)', () => {
    // scores on a 1-5 scale; top-2-box (>=4) = 60%, mean = 3.4.
    // Source reports 60 (the top-2-box %), Prism computes the mean (3.4) → mismatch
    // explained as a top-2-box vs mean definition difference.
    const entry = explainParity({ metric: 'csat', scores: [5, 5, 4, 2, 1], sourceValue: 60 });
    expect(entry.match).toBe(false);
    expect(entry.prism_computed).toBe(3.4);
    expect(entry.explanation).toMatch(/top-2-box|definition/i);
  });

  it('falls back to "source did not expose this metric" when sourceValue is null', () => {
    const entry = explainParity({ metric: 'nps', scores: [10, 9, 0], sourceValue: null });
    expect(entry.source_value).toBeNull();
    expect(entry.explanation).toMatch(/did not expose/i);
    expect(entry.match).toBe(false);
  });

  it('always emits an explanation + method on a non-zero delta (window fallback)', () => {
    // A large, unexplained gap should still get the best-effort window/filter cause.
    const entry = explainParity({ metric: 'nps', scores: [10, 10, 10], sourceValue: -100 });
    expect(entry.match).toBe(false);
    expect(entry.explanation).toBeTruthy();
    expect(entry.method).toBe('prism');
    expect(entry.delta).toBeDefined();
  });
});
