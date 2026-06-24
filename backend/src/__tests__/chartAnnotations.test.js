import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { anomalyPoints } = createRequire(import.meta.url)(resolve(__dirname, '../lib/chartAnnotations'));

describe('anomalyPoints', () => {
  it('flags a clear spike against the trailing baseline', () => {
    const series = [40, 41, 39, 40, 42, 41, 40, 80]; // last point is a spike
    const pts = anomalyPoints(series, { z: 2.5 });
    expect(pts.length).toBe(1);
    expect(pts[0].index).toBe(7);
    expect(pts[0].direction).toBe('up');
  });

  it('returns no anomalies for a stable series', () => {
    expect(anomalyPoints([40, 41, 39, 40, 42, 41, 40, 41], { z: 2.5 })).toEqual([]);
  });

  it('flags a downward anomaly', () => {
    const pts = anomalyPoints([50, 51, 49, 50, 52, 51, 50, 10], { z: 2.5 });
    expect(pts[0].direction).toBe('down');
  });

  it('needs enough baseline before flagging', () => {
    expect(anomalyPoints([10, 99], { z: 2 })).toEqual([]);
  });
});
