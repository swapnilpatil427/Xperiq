import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const {
  relevanceScore,
  shouldSuppress,
  SUPPRESS_THRESHOLD,
  PRIORITY_WEIGHT,
} = createRequire(import.meta.url)(resolve(__dirname, '../lib/notificationRelevance'));

// ── relevanceScore ────────────────────────────────────────────────────────────

describe('relevanceScore', () => {
  it('scores critical higher than info', () => {
    expect(relevanceScore({ priority: 'critical', magnitude: 0.5, recencyHours: 0 }))
      .toBeGreaterThan(relevanceScore({ priority: 'info', magnitude: 0.5, recencyHours: 0 }));
  });

  it('fresh + high-magnitude scores higher than stale + low', () => {
    expect(relevanceScore({ priority: 'warning', magnitude: 1, recencyHours: 0 }))
      .toBeGreaterThan(relevanceScore({ priority: 'warning', magnitude: 0, recencyHours: 200 }));
  });

  // ── new cases ──────────────────────────────────────────────────────────────

  it('scores warning higher than success for same magnitude and recency', () => {
    const w = relevanceScore({ priority: 'warning', magnitude: 0.5, recencyHours: 0 });
    const s = relevanceScore({ priority: 'success', magnitude: 0.5, recencyHours: 0 });
    expect(w).toBeGreaterThan(s);
  });

  it('scores success higher than info for same magnitude and recency', () => {
    const s = relevanceScore({ priority: 'success', magnitude: 0.5, recencyHours: 0 });
    const i = relevanceScore({ priority: 'info', magnitude: 0.5, recencyHours: 0 });
    expect(s).toBeGreaterThan(i);
  });

  it('scores info higher than digest for same magnitude and recency', () => {
    const i = relevanceScore({ priority: 'info', magnitude: 0.5, recencyHours: 0 });
    const d = relevanceScore({ priority: 'digest', magnitude: 0.5, recencyHours: 0 });
    expect(i).toBeGreaterThan(d);
  });

  it('returns a number rounded to 2 decimal places', () => {
    const score = relevanceScore({ priority: 'warning', magnitude: 0.333, recencyHours: 12 });
    const str = String(score);
    // At most 2 decimal places
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it('result is always in 0..1 range', () => {
    const combos = [
      { priority: 'critical', magnitude: 1, recencyHours: 0 },
      { priority: 'digest', magnitude: 0, recencyHours: 999 },
      { priority: 'warning', magnitude: 0.5, recencyHours: 50 },
      { priority: 'unknown_priority', magnitude: 0.5, recencyHours: 0 },
    ];
    for (const params of combos) {
      const score = relevanceScore(params);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('recency decays after 24 hours and reaches near-zero by a week', () => {
    const fresh = relevanceScore({ priority: 'warning', magnitude: 0.5, recencyHours: 0 });
    const dayOld = relevanceScore({ priority: 'warning', magnitude: 0.5, recencyHours: 24 });
    const weekOld = relevanceScore({ priority: 'warning', magnitude: 0.5, recencyHours: 168 });
    // Fresh and 24-hour old should be equal (full recency weight for <= 24h)
    expect(fresh).toBe(dayOld);
    // Week-old should be lower than fresh
    expect(weekOld).toBeLessThan(fresh);
  });

  it('recency is fully decayed (0) beyond 6 days past the 24h boundary', () => {
    // recencyHours = 24 + 6*24 = 168 — at the boundary, recency component hits 0
    const almostGone = relevanceScore({ priority: 'info', magnitude: 0, recencyHours: 168 });
    const moreThanGone = relevanceScore({ priority: 'info', magnitude: 0, recencyHours: 300 });
    // Both should be the same since recency floored at 0
    expect(almostGone).toBe(moreThanGone);
  });

  it('clamps magnitude to 0 if negative', () => {
    const normal = relevanceScore({ priority: 'info', magnitude: 0, recencyHours: 0 });
    const negative = relevanceScore({ priority: 'info', magnitude: -5, recencyHours: 0 });
    expect(negative).toBe(normal);
  });

  it('clamps magnitude to 1 if greater than 1', () => {
    const normal = relevanceScore({ priority: 'info', magnitude: 1, recencyHours: 0 });
    const huge = relevanceScore({ priority: 'info', magnitude: 100, recencyHours: 0 });
    expect(huge).toBe(normal);
  });

  it('uses info as default priority when priority is omitted', () => {
    const defaultScore = relevanceScore({ magnitude: 0.5, recencyHours: 0 });
    const explicitInfo = relevanceScore({ priority: 'info', magnitude: 0.5, recencyHours: 0 });
    expect(defaultScore).toBe(explicitInfo);
  });

  it('uses 0.5 as default magnitude when omitted', () => {
    const defaultScore = relevanceScore({ priority: 'warning', recencyHours: 0 });
    const explicitMag = relevanceScore({ priority: 'warning', magnitude: 0.5, recencyHours: 0 });
    expect(defaultScore).toBe(explicitMag);
  });

  it('uses 0 recencyHours when omitted (maximum freshness)', () => {
    const defaultScore = relevanceScore({ priority: 'info', magnitude: 0.5 });
    const fresh = relevanceScore({ priority: 'info', magnitude: 0.5, recencyHours: 0 });
    expect(defaultScore).toBe(fresh);
  });

  it('matches manual weighted blend formula for a known input', () => {
    // critical: base=1.0, mag=0.8, recency=1 (fresh)
    // score = 0.55*1 + 0.30*0.8 + 0.15*1 = 0.55 + 0.24 + 0.15 = 0.94
    const score = relevanceScore({ priority: 'critical', magnitude: 0.8, recencyHours: 0 });
    expect(score).toBeCloseTo(0.94, 2);
  });

  it('falls back to base 0.4 for unknown priority', () => {
    // unknown priority: PRIORITY_WEIGHT[x] ?? 0.4, mag=0.5, recencyHours=0
    // score = 0.55*0.4 + 0.30*0.5 + 0.15*1 = 0.22 + 0.15 + 0.15 = 0.52
    const score = relevanceScore({ priority: 'not-a-real-priority', magnitude: 0.5, recencyHours: 0 });
    expect(score).toBeCloseTo(0.52, 2);
  });
});

// ── shouldSuppress ────────────────────────────────────────────────────────────

describe('shouldSuppress', () => {
  it('never suppresses critical', () => {
    expect(shouldSuppress({ priority: 'critical', magnitude: 0, recencyHours: 999 }).suppress).toBe(false);
  });

  it('suppresses low-relevance digest noise', () => {
    expect(shouldSuppress({ priority: 'digest', magnitude: 0, recencyHours: 200 }).suppress).toBe(true);
  });

  it('keeps a fresh high-magnitude warning', () => {
    expect(shouldSuppress({ priority: 'warning', magnitude: 0.9, recencyHours: 0 }).suppress).toBe(false);
  });

  it('suppresses a 4th unread info for the same entity (fatigue)', () => {
    const r = shouldSuppress({ priority: 'info', magnitude: 1, recencyHours: 0, unreadSameEntityInfo: 3 });
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('info_fatigue');
  });

  it('allows info when under the fatigue cap and relevant', () => {
    expect(shouldSuppress({ priority: 'info', magnitude: 1, recencyHours: 0, unreadSameEntityInfo: 0 }).suppress).toBe(false);
  });

  // ── new cases ──────────────────────────────────────────────────────────────

  it('critical always returns score 1 and no reason', () => {
    const r = shouldSuppress({ priority: 'critical', magnitude: 0, recencyHours: 999 });
    expect(r.score).toBe(1);
    expect(r.reason).toBeNull();
  });

  it('suppresses when score is below the SUPPRESS_THRESHOLD constant', () => {
    // digest with zero magnitude and stale (guaranteed low score)
    const r = shouldSuppress({ priority: 'digest', magnitude: 0, recencyHours: 300 });
    expect(r.suppress).toBe(true);
    expect(r.score).toBeLessThan(SUPPRESS_THRESHOLD);
    expect(r.reason).toBe('low_relevance');
  });

  it('does not suppress when score meets or exceeds SUPPRESS_THRESHOLD', () => {
    // warning + high magnitude + fresh — score well above threshold
    const r = shouldSuppress({ priority: 'warning', magnitude: 1, recencyHours: 0 });
    expect(r.suppress).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(SUPPRESS_THRESHOLD);
    expect(r.reason).toBeNull();
  });

  it('info_fatigue fires at exactly unreadSameEntityInfo === 3', () => {
    const at3 = shouldSuppress({ priority: 'info', magnitude: 1, recencyHours: 0, unreadSameEntityInfo: 3 });
    expect(at3.suppress).toBe(true);
    expect(at3.reason).toBe('info_fatigue');
  });

  it('info_fatigue does not fire at unreadSameEntityInfo === 2', () => {
    const at2 = shouldSuppress({ priority: 'info', magnitude: 1, recencyHours: 0, unreadSameEntityInfo: 2 });
    // Should not be suppressed due to fatigue (may still not be suppressed for other reasons)
    expect(at2.reason).not.toBe('info_fatigue');
  });

  it('info_fatigue fires even when magnitude and recency are at their maximum', () => {
    // Even with max relevance, 3+ unread same-entity info triggers fatigue suppression
    const r = shouldSuppress({ priority: 'info', magnitude: 1, recencyHours: 0, unreadSameEntityInfo: 5 });
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('info_fatigue');
    expect(r.score).toBe(0);
  });

  it('returns the computed score in the result', () => {
    const r = shouldSuppress({ priority: 'warning', magnitude: 0.5, recencyHours: 0 });
    // The score should match what relevanceScore returns for the same params
    const expected = relevanceScore({ priority: 'warning', magnitude: 0.5, recencyHours: 0 });
    expect(r.score).toBe(expected);
  });

  it('suppresses stale info with low magnitude', () => {
    // info + zero magnitude + stale → very low score, should suppress
    const r = shouldSuppress({ priority: 'info', magnitude: 0, recencyHours: 200 });
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('low_relevance');
  });

  it('success priority with good freshness and magnitude is not suppressed', () => {
    const r = shouldSuppress({ priority: 'success', magnitude: 0.8, recencyHours: 0 });
    expect(r.suppress).toBe(false);
  });

  it('SUPPRESS_THRESHOLD is exported and equals 0.4', () => {
    expect(SUPPRESS_THRESHOLD).toBe(0.4);
  });

  it('PRIORITY_WEIGHT maps all five priority levels', () => {
    expect(PRIORITY_WEIGHT).toMatchObject({
      critical: 1.0,
      warning:  0.8,
      success:  0.55,
      info:     0.4,
      digest:   0.2,
    });
  });
});
