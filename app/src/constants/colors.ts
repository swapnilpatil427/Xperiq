// Design token colors — single source of truth.
// Use these instead of hardcoded hex strings in inline styles.
// The same values are also exposed as CSS custom properties in index.css.

export const COLORS = {
  // Brand primary
  primary:       '#2a4bd9',
  primaryDim:    '#173dcd',
  primaryLight:  '#879aff',

  // Indigo variant (used in InsightsDashboardPage)
  indigo:        '#4338ca',
  indigoDim:     '#3730a3',

  // Teal
  teal:          '#00647c',
  tealDim:       '#00576c',
  tealLight:     '#82deff',

  // Purple
  purple:        '#8329c8',
  purpleLight:   '#d299ff',

  // Semantic — success
  success:       '#059669',
  successMid:    '#047857',
  successLight:  '#10b981',
  successLighter:'#6ee7b7',

  // Semantic — warning
  warning:       '#d97706',
  warningLight:  '#f59e0b',
  warningLighter:'#fbbf24',

  // Semantic — error / critical
  error:         '#b41340',
  errorLight:    '#f74b6d',

  // Text scale
  textDark:      '#2c2f31',
  textDarkAlt:   '#1a1f36',
  textDarkAlt2:  '#1f2937',
  textMedium:    '#595c5e',
  textMediumAlt: '#4b5563',
  textLight:     '#9a9d9f',
  textLightAlt:  '#94a3b8',

  // Surface / background scale
  bgPage:        '#f5f7f9',
  bgPageAlt:     '#f9fafb',
  bgCard:        '#ffffff',
  bgSubtle:      '#eef1f3',
  bgMuted:       '#e5e9eb',
  bgBorder:      '#dfe3e6',
  bgBorderAlt:   '#e5e7eb',
  bgDark:        '#2c2f31',
  bgDarkDeep:    '#0f172a',

  // Border alphas (use as strings in style props)
  borderLight:   'rgba(171,173,175,0.1)',
  borderMedium:  'rgba(171,173,175,0.3)',
};

export const GRADIENTS = {
  primary:      'linear-gradient(135deg, #2a4bd9, #8329c8)',
  primaryLight: 'linear-gradient(135deg, #2a4bd9, #879aff)',
  primaryDim:   'linear-gradient(135deg, #2a4bd9, #173dcd)',
  indigo:       'linear-gradient(135deg, #4338ca, #3730a3)',
  purple:       'linear-gradient(135deg, #8329c8, #d299ff)',
  teal:         'linear-gradient(135deg, #00647c, #00576c)',
  success:      'linear-gradient(135deg, #059669, #047857)',
  warning:      'linear-gradient(135deg, #d97706, #fbbf24)',
  dark:         'linear-gradient(135deg, #1e2b7a, #0f172a)',
  nav:          'linear-gradient(to bottom, #f5f7f9, #eef1f3)',
};

// Paired badge/container styles — background + foreground color
export const BADGES = {
  primary: { bg: '#e0e7ff', color: '#2a4bd9' },
  success: { bg: '#d1fae5', color: '#059669' },
  warning: { bg: '#fef3c7', color: '#d97706' },
  purple:  { bg: '#f3e8ff', color: '#8329c8' },
  error:   { bg: '#ffe0e6', color: '#b41340' },
  teal:    { bg: '#f0fdfa', color: '#00647c' },
  neutral: { bg: '#e5e9eb', color: '#595c5e' },
};

// Sentiment dot colors
export const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral:  '#f59e0b',
  negative: '#b41340',
};
