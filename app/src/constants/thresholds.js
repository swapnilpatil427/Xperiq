// Scoring thresholds and scale definitions.
// Centralised so that color-coding and filtering logic stay in sync across pages.

export const NPS = {
  SCALE_MIN:    0,
  SCALE_MAX:    10,
  POSITIVE_MIN: 70,  // score >= 70 → green
  NEUTRAL_MIN:  40,  // score 40–69 → orange, < 40 → red
};

export const RATING = {
  SCALE_MIN: 1,
  SCALE_MAX: 5,
};

export const SENTIMENT = {
  // Fallback breakdown when hook data is absent
  DEFAULT: { positive: 15, neutral: 25, negative: 60 },
};

export const SURVEYS = {
  LIST_LIMIT:  50,
  RESPONSES_LIMIT: 200,
};

export const INSIGHTS = {
  AI_CONFIDENCE: 98,
};
