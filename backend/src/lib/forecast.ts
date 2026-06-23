// Lightweight predictive forecast — ordinary least-squares linear regression over
// a metric series, projecting the next N periods. Deterministic + dependency-free,
// so it's testable and cheap; powers the dashboard's "predictive overlay" on trend
// charts. (A richer model — Holt-Winters / leading indicators — can replace this
// behind the same shape.)

export interface ForecastResult {
  slope: number;
  intercept: number;
  points: number[];
  direction: 'up' | 'down' | 'flat';
  r2: number;
}

/**
 * @param series  ordered metric values (oldest → newest)
 * @param periods how many future points to project
 */
export function linearForecast(series: number[], periods = 7): ForecastResult | null {
  const ys = series.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const n = ys.length;
  if (n < 3) return null; // not enough signal to project

  const xs = ys.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² (goodness of fit) for a confidence hint.
  const meanY = sumY / n;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * i + intercept)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const points: number[] = [];
  for (let k = 1; k <= periods; k++) {
    points.push(round(slope * (n - 1 + k) + intercept));
  }
  const direction: 'up' | 'down' | 'flat' = slope > 0.05 ? 'up' : slope < -0.05 ? 'down' : 'flat';
  return { slope: round(slope), intercept: round(intercept), points, direction, r2: round(r2) };
}

function round(n: number): number { return Math.round(n * 100) / 100; }
