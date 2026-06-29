import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AUTOMATED_CHECKPOINT_CREDIT_COST,
  triggerLabelKey,
  relativeAgo,
  isRecentCheckpoint,
  resolveTrendDirection,
  deltaArrow,
  formatDeltaMagnitude,
  deltaChipClasses,
} from '../../../components/insights/trajectory';
import type { CheckpointDelta } from '../../../types';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── AUTOMATED_CHECKPOINT_CREDIT_COST ─────────────────────────────────────────

describe('AUTOMATED_CHECKPOINT_CREDIT_COST', () => {
  it('is 5', () => {
    expect(AUTOMATED_CHECKPOINT_CREDIT_COST).toBe(5);
  });
});

// ── triggerLabelKey ──────────────────────────────────────────────────────────

describe('triggerLabelKey', () => {
  it.each([
    ['stream', 'surveyInsights.investigation.triggerStream'],
    ['responses', 'surveyInsights.investigation.triggerStream'],
    ['scheduler', 'surveyInsights.investigation.triggerScheduler'],
    ['days', 'surveyInsights.investigation.triggerScheduler'],
    ['milestone', 'surveyInsights.investigation.triggerMilestone'],
    ['manual', 'surveyInsights.investigation.triggerRefresh'],
    ['refresh', 'surveyInsights.investigation.triggerRefresh'],
    ['manual_expert', 'surveyInsights.investigation.triggerManualExpert'],
    ['manual_quick', 'surveyInsights.investigation.triggerManualQuick'],
    ['api', 'surveyInsights.investigation.triggerApi'],
  ])('maps %s → %s', (trigger, expected) => {
    expect(triggerLabelKey(trigger)).toBe(expected);
  });

  it('returns null for unknown triggers', () => {
    expect(triggerLabelKey('unknown_mode')).toBeNull();
    expect(triggerLabelKey(null)).toBeNull();
    expect(triggerLabelKey(undefined)).toBeNull();
  });
});

// ── relativeAgo ──────────────────────────────────────────────────────────────

describe('relativeAgo — no translation function (English fallback)', () => {
  it('returns empty string for null/undefined', () => {
    expect(relativeAgo(null)).toBe('');
    expect(relativeAgo(undefined)).toBe('');
  });

  it('returns empty string for an invalid ISO string', () => {
    expect(relativeAgo('not-a-date')).toBe('');
  });

  it('returns "just now" for < 60 seconds ago', () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(relativeAgo(iso)).toBe('just now');
  });

  it('returns "Xm" for < 60 minutes ago', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeAgo(iso)).toBe('5m');
  });

  it('returns "Xh" for < 24 hours ago', () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(relativeAgo(iso)).toBe('3h');
  });

  it('returns "Xd" for < 30 days ago', () => {
    const iso = new Date(Date.now() - 10 * 86_400_000).toISOString();
    expect(relativeAgo(iso)).toBe('10d');
  });

  it('returns "Xmo" for >= 30 days ago', () => {
    const iso = new Date(Date.now() - 60 * 86_400_000).toISOString();
    expect(relativeAgo(iso)).toBe('2mo');
  });
});

describe('relativeAgo — with translation function (i18n path)', () => {
  const t = vi.fn((key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key,
  );

  it('calls justNow key for < 60 seconds', () => {
    const iso = new Date(Date.now() - 10_000).toISOString();
    const result = relativeAgo(iso, t);
    expect(result).toBe('surveyInsights.trail.relativeAgo.justNow');
  });

  it('calls minutes key with count for < 60 min', () => {
    const iso = new Date(Date.now() - 7 * 60_000).toISOString();
    const result = relativeAgo(iso, t);
    expect(result).toContain('surveyInsights.trail.relativeAgo.minutes');
    expect(result).toContain('"count":7');
  });

  it('calls hours key with h for < 24 hours', () => {
    const iso = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const result = relativeAgo(iso, t);
    expect(result).toContain('surveyInsights.trail.relativeAgo.hours');
    expect(result).toContain('"h":2');
  });

  it('calls days key with d for < 30 days', () => {
    const iso = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const result = relativeAgo(iso, t);
    expect(result).toContain('surveyInsights.trail.relativeAgo.days');
    expect(result).toContain('"d":5');
  });

  it('calls months key with mo for >= 30 days', () => {
    const iso = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const result = relativeAgo(iso, t);
    expect(result).toContain('surveyInsights.trail.relativeAgo.months');
    expect(result).toContain('"mo":3');
  });
});

// ── isRecentCheckpoint ───────────────────────────────────────────────────────

describe('isRecentCheckpoint', () => {
  it('returns false for null/undefined', () => {
    expect(isRecentCheckpoint(null)).toBe(false);
    expect(isRecentCheckpoint(undefined)).toBe(false);
  });

  it('returns true for a timestamp < 5 min ago', () => {
    const iso = new Date(Date.now() - 2 * 60_000).toISOString();
    expect(isRecentCheckpoint(iso)).toBe(true);
  });

  it('returns false for a timestamp > 5 min ago', () => {
    const iso = new Date(Date.now() - 6 * 60_000).toISOString();
    expect(isRecentCheckpoint(iso)).toBe(false);
  });

  it('returns false for invalid date string', () => {
    expect(isRecentCheckpoint('bad-date')).toBe(false);
  });
});

// ── resolveTrendDirection ────────────────────────────────────────────────────

describe('resolveTrendDirection', () => {
  it('returns stable for null delta', () => {
    expect(resolveTrendDirection(null)).toBe('stable');
  });

  it('prefers explicit trend_direction field', () => {
    const delta = { trend_direction: 'up' } as CheckpointDelta;
    expect(resolveTrendDirection(delta)).toBe('up');
  });

  it('returns stable when nps_delta is within ±2', () => {
    const delta = { nps_delta: 1.5 } as CheckpointDelta;
    expect(resolveTrendDirection(delta)).toBe('stable');
  });

  it('returns up when nps_delta > 2', () => {
    const delta = { nps_delta: 5 } as CheckpointDelta;
    expect(resolveTrendDirection(delta)).toBe('up');
  });

  it('returns down when nps_delta < -2', () => {
    const delta = { nps_delta: -3 } as CheckpointDelta;
    expect(resolveTrendDirection(delta)).toBe('down');
  });

  it('returns stable when nps_delta is null and trend_direction absent', () => {
    const delta = { nps_delta: null } as CheckpointDelta;
    expect(resolveTrendDirection(delta)).toBe('stable');
  });
});

// ── deltaArrow ────────────────────────────────────────────────────────────────

describe('deltaArrow', () => {
  it('returns empty string for null/undefined', () => {
    expect(deltaArrow(null)).toBe('');
    expect(deltaArrow(undefined)).toBe('');
  });

  it('returns empty string for near-zero delta', () => {
    expect(deltaArrow(0.04)).toBe('');
    expect(deltaArrow(-0.04)).toBe('');
  });

  it('returns ↑ for positive delta', () => {
    expect(deltaArrow(3)).toBe('↑');
  });

  it('returns ↓ for negative delta', () => {
    expect(deltaArrow(-3)).toBe('↓');
  });
});

// ── formatDeltaMagnitude ──────────────────────────────────────────────────────

describe('formatDeltaMagnitude', () => {
  it('returns "0" for null/undefined', () => {
    expect(formatDeltaMagnitude(null)).toBe('0');
    expect(formatDeltaMagnitude(undefined)).toBe('0');
  });

  it('returns absolute value to one decimal', () => {
    expect(formatDeltaMagnitude(3.456)).toBe('3.5');
    expect(formatDeltaMagnitude(-2.1)).toBe('2.1');
  });
});

// ── deltaChipClasses ──────────────────────────────────────────────────────────

describe('deltaChipClasses', () => {
  it('returns neutral classes for null', () => {
    expect(deltaChipClasses(null)).toContain('zinc');
  });

  it('returns rose classes for delta < -2', () => {
    expect(deltaChipClasses(-3)).toContain('rose');
  });

  it('returns emerald classes for delta > 2', () => {
    expect(deltaChipClasses(5)).toContain('emerald');
  });

  it('returns zinc classes for delta within ±2', () => {
    const cls = deltaChipClasses(1);
    expect(cls).toContain('zinc');
    expect(cls).not.toContain('rose');
    expect(cls).not.toContain('emerald');
  });
});
