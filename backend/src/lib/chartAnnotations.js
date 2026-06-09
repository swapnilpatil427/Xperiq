// Chart annotations — Crystal anomaly markers for trend charts (docs/visual-ai +
// dashboard "anomaly markers on all charts"). Flags points that deviate from their
// trailing baseline by a Z-score threshold. Deterministic + dependency-free.

function meanStd(xs) {
  const n = xs.length;
  if (n === 0) return { mean: 0, std: 0 };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Flag anomalous points in a series using a trailing-window Z-score.
 * @param {number[]} series   ordered values (oldest → newest)
 * @param {object} [opts]
 * @param {number} [opts.z=2.5]        threshold
 * @param {number} [opts.window=8]     trailing baseline size
 * @param {number} [opts.minPoints=4]  minimum baseline before flagging
 * @returns {Array<{index:number, value:number, z:number, direction:'up'|'down'}>}
 */
function anomalyPoints(series, { z = 2.5, window = 8, minPoints = 4 } = {}) {
  const xs = (series || []).map(Number).filter((v) => Number.isFinite(v));
  const out = [];
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

module.exports = { anomalyPoints, meanStd };
