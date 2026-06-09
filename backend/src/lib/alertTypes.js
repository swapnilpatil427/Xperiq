// Alert taxonomy catalog — the 36 alert types across 7 categories (docs/alerts §2).
// Powers the alert setup wizard (GET /api/alerts/types) and documents which types
// have a live evaluator wired today vs. catalog-only (planned / Crystal-driven).

const CATEGORIES = {
  S: 'Score & Metrics',
  V: 'Volume & Response',
  T: 'Topics & Verbatims',
  AI: 'Crystal AI',
  O: 'Operational',
  B: 'Benchmarking',
  C: 'Compliance',
};

// code, name, defaultSeverity, category, evaluator (true = wired in alertEngine now),
// thresholds (config keys the wizard renders).
const ALERT_TYPES = [
  { code: 'S-01', name: 'NPS Drop', severity: 'critical', evaluator: true,  thresholds: { minDrop: 5, windowDays: 7 } },
  { code: 'S-02', name: 'NPS Rise', severity: 'success',  evaluator: true,  thresholds: { minRise: 5, windowDays: 7 } },
  { code: 'S-03', name: 'NPS Threshold Breach', severity: 'critical', evaluator: false, thresholds: { below: 30 } },
  { code: 'S-04', name: 'CSAT Score Drop', severity: 'warning', evaluator: false, thresholds: { below: 3.5 } },
  { code: 'S-05', name: 'CES Score Spike', severity: 'warning', evaluator: false, thresholds: { above: 5 } },
  { code: 'S-06', name: 'Segment Score Divergence', severity: 'warning', evaluator: false, thresholds: { minGap: 15 } },
  { code: 'S-07', name: 'Industry Percentile Alert', severity: 'info', evaluator: false, thresholds: {} },
  { code: 'S-08', name: 'Predictive NPS Drop', severity: 'warning', evaluator: true, thresholds: { below: 30, horizon: 7 } },
  { code: 'V-01', name: 'Response Rate Drop', severity: 'warning', evaluator: false, thresholds: { minRate: 20 } },
  { code: 'V-02', name: 'Completion Rate Drop', severity: 'warning', evaluator: false, thresholds: { minRate: 50 } },
  { code: 'V-03', name: 'Response Volume Spike', severity: 'warning', evaluator: true,  thresholds: { z: 3 } },
  { code: 'V-04', name: 'Response Volume Cliff', severity: 'warning', evaluator: false, thresholds: { z: 3 } },
  { code: 'V-05', name: 'Quota Milestone', severity: 'success', evaluator: false, thresholds: { milestone: 100 } },
  { code: 'V-06', name: 'Survey Expiry Warning', severity: 'warning', evaluator: false, thresholds: { hoursBefore: 48 } },
  { code: 'T-01', name: 'Topic Sentiment Shift', severity: 'warning', evaluator: false, thresholds: {} },
  { code: 'T-02', name: 'Emerging Topic Alert', severity: 'info', evaluator: false, thresholds: {} },
  { code: 'T-03', name: 'Topic Volume Spike', severity: 'warning', evaluator: false, thresholds: {} },
  { code: 'T-04', name: 'Negative Keyword Cluster', severity: 'warning', evaluator: false, thresholds: { keywords: [] } },
  { code: 'T-05', name: 'Competitor Mention Spike', severity: 'info', evaluator: false, thresholds: {} },
  { code: 'T-06', name: 'Feature Request Cluster', severity: 'info', evaluator: false, thresholds: {} },
  { code: 'T-07', name: 'Verbatim Escalation', severity: 'critical', evaluator: false, thresholds: {} },
  { code: 'AI-01', name: 'New Insight Generated', severity: 'info', evaluator: 'crystal', thresholds: {} },
  { code: 'AI-02', name: 'Confidence Threshold Crossed', severity: 'info', evaluator: 'crystal', thresholds: {} },
  { code: 'AI-03', name: 'Statistical Anomaly Detected', severity: 'warning', evaluator: 'crystal', thresholds: {} },
  { code: 'AI-04', name: 'Predictive Churn Signal', severity: 'warning', evaluator: 'crystal', thresholds: {} },
  { code: 'AI-05', name: 'Cross-Survey Correlation', severity: 'info', evaluator: 'crystal', thresholds: {} },
  { code: 'AI-06', name: 'Cohort Divergence', severity: 'warning', evaluator: 'crystal', thresholds: {} },
  { code: 'O-01', name: 'Data Pipeline Failure', severity: 'critical', evaluator: false, thresholds: {} },
  { code: 'O-02', name: 'Integration Sync Failure', severity: 'warning', evaluator: false, thresholds: {} },
  { code: 'O-03', name: 'AI Credits Low', severity: 'warning', evaluator: false, thresholds: { remainingPct: 20 } },
  { code: 'O-04', name: 'Export/Report Completed', severity: 'info', evaluator: false, thresholds: {} },
  { code: 'O-05', name: 'Survey Close-Date Approaching', severity: 'warning', evaluator: false, thresholds: { hoursBefore: 48 } },
  { code: 'B-01', name: 'Below Industry Benchmark', severity: 'warning', evaluator: false, thresholds: {} },
  { code: 'B-02', name: 'Above Industry Benchmark', severity: 'success', evaluator: false, thresholds: {} },
  { code: 'B-03', name: 'Year-Over-Year Significant Change', severity: 'info', evaluator: false, thresholds: {} },
  { code: 'C-01', name: 'PII Detected in Verbatims', severity: 'critical', evaluator: false, thresholds: {} },
  { code: 'C-02', name: 'Data Retention Limit Approaching', severity: 'warning', evaluator: false, thresholds: {} },
];

function categoryOf(code) { return code.split('-')[0]; }

function catalog() {
  return ALERT_TYPES.map((t) => ({
    ...t,
    category: categoryOf(t.code),
    categoryName: CATEGORIES[categoryOf(t.code)],
  }));
}

const VALID_CODES = new Set(ALERT_TYPES.map((t) => t.code));

module.exports = { ALERT_TYPES, CATEGORIES, catalog, categoryOf, VALID_CODES };
