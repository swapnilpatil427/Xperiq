import { describe, it, expect } from 'vitest';
import { NPS, RATING, SENTIMENT, SURVEYS, INSIGHTS } from '../../constants/thresholds';

// ── NPS ───────────────────────────────────────────────────────────────────────

describe('NPS', () => {
  it('SCALE_MIN is 0', () => {
    expect(NPS.SCALE_MIN).toBe(0);
  });

  it('SCALE_MAX is 10', () => {
    expect(NPS.SCALE_MAX).toBe(10);
  });

  it('POSITIVE_MIN is 70', () => {
    expect(NPS.POSITIVE_MIN).toBe(70);
  });

  it('NEUTRAL_MIN is 40', () => {
    expect(NPS.NEUTRAL_MIN).toBe(40);
  });

  it('SCALE_MIN is less than SCALE_MAX', () => {
    expect(NPS.SCALE_MIN).toBeLessThan(NPS.SCALE_MAX);
  });

  it('NEUTRAL_MIN is less than POSITIVE_MIN — ordering is correct', () => {
    expect(NPS.NEUTRAL_MIN).toBeLessThan(NPS.POSITIVE_MIN);
  });

  it('all values are non-negative numbers', () => {
    [NPS.SCALE_MIN, NPS.SCALE_MAX, NPS.POSITIVE_MIN, NPS.NEUTRAL_MIN].forEach((v) => {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    });
  });

  it('thresholds define three bands — red [0–39], orange [40–69], green [70+]', () => {
    const redMax = NPS.NEUTRAL_MIN - 1;      // 39
    const orangeMax = NPS.POSITIVE_MIN - 1;  // 69
    expect(redMax).toBe(39);
    expect(orangeMax).toBe(69);
    expect(NPS.POSITIVE_MIN).toBe(70);
  });

  it('SCALE_MAX is within a standard 0–10 NPS range', () => {
    expect(NPS.SCALE_MAX).toBeLessThanOrEqual(10);
  });
});

// ── RATING ────────────────────────────────────────────────────────────────────

describe('RATING', () => {
  it('SCALE_MIN is 1', () => {
    expect(RATING.SCALE_MIN).toBe(1);
  });

  it('SCALE_MAX is 5', () => {
    expect(RATING.SCALE_MAX).toBe(5);
  });

  it('SCALE_MIN is less than SCALE_MAX', () => {
    expect(RATING.SCALE_MIN).toBeLessThan(RATING.SCALE_MAX);
  });

  it('both values are positive numbers', () => {
    expect(RATING.SCALE_MIN).toBeGreaterThan(0);
    expect(RATING.SCALE_MAX).toBeGreaterThan(0);
  });

  it('covers exactly 5 possible values (1 through 5)', () => {
    const count = RATING.SCALE_MAX - RATING.SCALE_MIN + 1;
    expect(count).toBe(5);
  });
});

// ── SENTIMENT ─────────────────────────────────────────────────────────────────

describe('SENTIMENT', () => {
  it('has a DEFAULT object', () => {
    expect(SENTIMENT.DEFAULT).toBeDefined();
    expect(typeof SENTIMENT.DEFAULT).toBe('object');
  });

  it('DEFAULT has a positive field that is a number', () => {
    expect(typeof SENTIMENT.DEFAULT.positive).toBe('number');
  });

  it('DEFAULT has a neutral field that is a number', () => {
    expect(typeof SENTIMENT.DEFAULT.neutral).toBe('number');
  });

  it('DEFAULT has a negative field that is a number', () => {
    expect(typeof SENTIMENT.DEFAULT.negative).toBe('number');
  });

  it('DEFAULT values are all non-negative', () => {
    expect(SENTIMENT.DEFAULT.positive).toBeGreaterThanOrEqual(0);
    expect(SENTIMENT.DEFAULT.neutral).toBeGreaterThanOrEqual(0);
    expect(SENTIMENT.DEFAULT.negative).toBeGreaterThanOrEqual(0);
  });

  it('DEFAULT positive + neutral + negative sums to 100', () => {
    const total = SENTIMENT.DEFAULT.positive + SENTIMENT.DEFAULT.neutral + SENTIMENT.DEFAULT.negative;
    expect(total).toBe(100);
  });
});

// ── SURVEYS ───────────────────────────────────────────────────────────────────

describe('SURVEYS', () => {
  it('LIST_LIMIT is a positive number', () => {
    expect(typeof SURVEYS.LIST_LIMIT).toBe('number');
    expect(SURVEYS.LIST_LIMIT).toBeGreaterThan(0);
  });

  it('RESPONSES_LIMIT is a positive number', () => {
    expect(typeof SURVEYS.RESPONSES_LIMIT).toBe('number');
    expect(SURVEYS.RESPONSES_LIMIT).toBeGreaterThan(0);
  });

  it('RESPONSES_LIMIT is greater than or equal to LIST_LIMIT', () => {
    expect(SURVEYS.RESPONSES_LIMIT).toBeGreaterThanOrEqual(SURVEYS.LIST_LIMIT);
  });
});

// ── INSIGHTS ──────────────────────────────────────────────────────────────────

describe('INSIGHTS', () => {
  it('AI_CONFIDENCE is a number', () => {
    expect(typeof INSIGHTS.AI_CONFIDENCE).toBe('number');
  });

  it('AI_CONFIDENCE is between 0 and 100 inclusive', () => {
    expect(INSIGHTS.AI_CONFIDENCE).toBeGreaterThanOrEqual(0);
    expect(INSIGHTS.AI_CONFIDENCE).toBeLessThanOrEqual(100);
  });
});
