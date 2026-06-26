// AI chart generation — natural language → chart spec.
//
// "Show me NPS by region as a bar chart" → { chartType:'bar', x:'region', y:'nps', ... }.
// Deterministic keyword parser (testable, free); an LLM pass can refine ambiguous
// requests later behind the same {chartType, x, y, aggregate, title, rationale} shape.
// Output maps cleanly onto Recharts on the frontend (the installed lib; the doc
// referenced Vega-Lite, but we render with Recharts to avoid a new dependency).

const CHART_KEYWORDS: Array<{ type: string; words: string[] }> = [
  { type: 'line',    words: ['trend', 'over time', 'line', 'timeline', 'history', 'trajectory'] },
  { type: 'area',    words: ['area', 'volume over', 'cumulative'] },
  { type: 'pie',     words: ['pie', 'breakdown', 'distribution', 'share', 'proportion', 'split'] },
  { type: 'scatter', words: ['scatter', 'correlation', 'vs ', 'versus', 'relationship'] },
  { type: 'bar',     words: ['bar', 'by ', 'compare', 'comparison', 'ranking', 'top '] },
];

// Known metrics (y) and dimensions (x) we can recognise from a request.
const METRICS = ['nps', 'csat', 'ces', 'sentiment', 'responses', 'completion', 'effort'];
const DIMENSIONS: Record<string, string[]> = {
  region: ['region', 'geography', 'country', 'location'],
  segment: ['segment', 'cohort', 'group'],
  department: ['department', 'team', 'division'],
  survey: ['survey', 'surveys'],
  topic: ['topic', 'theme', 'driver'],
  day: ['day', 'daily', 'date', 'time', 'week', 'month'],
};

export interface ChartField {
  key: string;
  label?: string;
  kind: 'metric' | 'dimension';
}

export interface ChartSpec {
  chartType: string;
  x: string;
  y: string;
  aggregate: string;
  title: string;
  rationale: string;
  encoding: {
    x: { field: string; type: string };
    y: { field: string; type: string; aggregate: string };
  };
}

export function detectChartType(text: string): string {
  for (const { type, words } of CHART_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return type;
  }
  return 'bar';
}

export function detectMetric(text: string, fields: ChartField[]): string {
  const m = METRICS.find((k) => text.includes(k));
  if (m) return m;
  // Fall back to the first numeric field offered, else 'responses'.
  const numericField = (fields || []).find((f) => f.kind === 'metric');
  return numericField ? numericField.key : 'responses';
}

export function detectDimension(text: string): string | null {
  for (const [dim, words] of Object.entries(DIMENSIONS)) {
    if (words.some((w) => text.includes(w))) return dim;
  }
  return null;
}

/**
 * @param request  natural-language chart request
 * @param fields   optional field definitions
 */
export function generateChartSpec(request: string, fields: ChartField[] = []): ChartSpec {
  const text = String(request || '').toLowerCase();
  let chartType = detectChartType(text);
  const y = detectMetric(text, fields);
  let x = detectDimension(text);

  // Time-series intent → line over day even if "bar" wasn't said.
  if (!x && (text.includes('over time') || text.includes('trend'))) x = 'day';
  if (x === 'day' && chartType === 'bar') chartType = 'line';
  // A distribution of a single metric with no dimension → pie of its buckets.
  if (!x && chartType === 'pie') x = `${y}_bucket`;
  if (!x) x = 'survey'; // sensible default grouping

  const aggregate = ['responses', 'completion'].includes(y) ? 'count' : 'avg';
  const title = buildTitle(y, x, chartType);

  return {
    chartType,
    x,
    y,
    aggregate,
    title,
    rationale: `Detected a ${chartType} chart of ${y} by ${x} (${aggregate}).`,
    encoding: { x: { field: x, type: x === 'day' ? 'temporal' : 'nominal' }, y: { field: y, type: 'quantitative', aggregate } },
  };
}

function buildTitle(y: string, x: string, chartType: string): string {
  const yl = y.toUpperCase();
  if (chartType === 'pie') return `${yl} distribution`;
  if (x === 'day') return `${yl} over time`;
  return `${yl} by ${x}`;
}
