// Chart annotations — Crystal anomaly markers for trend charts (docs/visual-ai +
// dashboard "anomaly markers on all charts"). Flags points that deviate from their
// trailing baseline by a Z-score threshold. Deterministic + dependency-free.

export interface AnomalyPoint {
  index: number;
  value: number;
  z: number;
  direction: 'up' | 'down';
}

export interface MeanStdResult {
  mean: number;
  std: number;
}

export function meanStd(xs: number[]): MeanStdResult {
  const n = xs.length;
  if (n === 0) return { mean: 0, std: 0 };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Flag anomalous points in a series using a trailing-window Z-score.
 * @param series   ordered values (oldest → newest)
 * @param opts
 * @param opts.z          threshold (default 2.5)
 * @param opts.window     trailing baseline size (default 8)
 * @param opts.minPoints  minimum baseline before flagging (default 4)
 */
export function anomalyPoints(
  series: number[],
  { z = 2.5, window = 8, minPoints = 4 }: { z?: number; window?: number; minPoints?: number } = {}
): AnomalyPoint[] {
  const xs = (series || []).map(Number).filter((v) => Number.isFinite(v));
  const out: AnomalyPoint[] = [];
  for (let i = minPoints; i < xs.length; i++) {
    const baseline = xs.slice(Math.max(0, i - window), i);
    if (baseline.length < minPoints) continue;
    const { mean, std } = meanStd(baseline);
    if (std === 0) continue;
    const score = (xs[i] - mean) / std;
    if (Math.abs(score) >= z) {
      out.push({ index: i, value: xs[i], z: Math.round(score * 100) / 100, direction: score > 0 ? 'up' : 'down' });
    }
  }
  return out;
}
