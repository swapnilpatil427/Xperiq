import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH    = _require.resolve(resolve(__dirname, '../lib/db'));
const REDIS_PATH = _require.resolve(resolve(__dirname, '../lib/redis'));
const EVENTS_PATH = _require.resolve(resolve(__dirname, '../lib/notificationEvents'));
const MOD_PATH   = _require.resolve(resolve(__dirname, '../lib/alertEngine'));

let dbQuery, redisClient, publishMock;
function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }
function load() {
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, default: { query: dbQuery } });
  _require.cache[REDIS_PATH] = fakeMod(REDIS_PATH, { getRedisClient: () => redisClient });
  _require.cache[EVENTS_PATH] = fakeMod(EVENTS_PATH, { publishNotificationEvent: publishMock });
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [] }));
  redisClient = null;
  publishMock = vi.fn(async () => '1-0');
});

describe('statistics', () => {
  it('computes mean + std', () => {
    const { stats } = load();
    const s = stats([10, 12, 14, 16, 18]);
    expect(s.mean).toBe(14);
    expect(s.std).toBeCloseTo(3.162, 2);
  });

  it('flags a Z-score anomaly beyond threshold', () => {
    const { detectAnomaly } = load();
    const baseline = [10, 11, 9, 10, 12, 11, 10];
    expect(detectAnomaly(baseline, 40, { z: 3 }).isAnomaly).toBe(true);
    expect(detectAnomaly(baseline, 11, { z: 3 }).isAnomaly).toBe(false);
  });

  it('needs enough baseline points before flagging', () => {
    const { detectAnomaly } = load();
    expect(detectAnomaly([10, 50], 999, { z: 3, minPoints: 5 }).isAnomaly).toBe(false);
  });

  it('computes NPS as %promoters − %detractors', () => {
    const { computeNps } = load();
    // 2 promoters (9,10), 1 detractor (3), 1 passive (7) → (2-1)/4 = 25
    expect(computeNps([{ nps_score: 9 }, { nps_score: 10 }, { nps_score: 3 }, { nps_score: 7 }])).toBe(25);
    expect(computeNps([])).toBeNull();
  });
});

describe('fireAlert', () => {
  const rule = { id: 'r1', alert_type: 'S-01' };

  it('inserts an event + history and publishes an alert.fired notification', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.startsWith('INSERT INTO alert_events')) return { rows: [{ id: 'ev1', severity: 'critical' }] };
      if (text.includes('FROM alert_subscriptions')) return { rows: [{ user_id: 'u1' }] };
      return { rows: [] };
    });
    const { fireAlert } = load();
    const ev = await fireAlert(rule, { orgId: 'o1', surveyId: 's1', severity: 'critical', title: 'NPS drop', description: 'down' });
    expect(ev.id).toBe('ev1');
    expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'alert.fired', priority: 'critical', targetUserIds: ['u1'], entityType: 'alert',
    }));
  });

  it('suppresses a duplicate within the dedup window', async () => {
    redisClient = { status: 'ready', set: vi.fn(async () => null) }; // NX returns null → already set
    const { fireAlert } = load();
    const ev = await fireAlert(rule, { orgId: 'o1', surveyId: 's1', severity: 'critical', title: 't', description: 'd' });
    expect(ev).toBeNull();
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe('evalNpsDrop', () => {
  // Route by param count: current window = 3 params, prior window = 4 params.
  function npsMock({ currentRows, priorRows, onInsert }) {
    return vi.fn(async (text, params) => {
      if (text.startsWith('INSERT INTO alert_events')) { onInsert?.(); return { rows: [{ id: 'ev2' }] }; }
      if (text.includes('FROM responses')) return { rows: (params || []).length === 4 ? priorRows : currentRows };
      return { rows: [] };
    });
  }

  it('fires when NPS falls at least minDrop points', async () => {
    const rule = { id: 'r1', alert_type: 'S-01', severity: 'critical', threshold_config: { minDrop: 5, windowDays: 7 } };
    let inserted = false;
    dbQuery = npsMock({
      currentRows: [{ nps_score: 3 }, { nps_score: 3 }, { nps_score: 9 }], // -33
      priorRows:   [{ nps_score: 9 }, { nps_score: 10 }, { nps_score: 9 }], // 100
      onInsert: () => { inserted = true; },
    });
    const { evalNpsDrop } = load();
    const ev = await evalNpsDrop(rule, 'o1', 's1');
    expect(inserted).toBe(true);
    expect(ev).toBeTruthy();
  });

  it('does not fire when the drop is below threshold', async () => {
    const rule = { id: 'r1', alert_type: 'S-01', severity: 'critical', threshold_config: { minDrop: 50, windowDays: 7 } };
    dbQuery = npsMock({
      currentRows: [{ nps_score: 9 }, { nps_score: 10 }], // 100 (current higher → negative drop)
      priorRows:   [{ nps_score: 9 }, { nps_score: 7 }],  // 50
    });
    const { evalNpsDrop } = load();
    expect(await evalNpsDrop(rule, 'o1', 's1')).toBeNull();
  });
});

describe('evalNpsRise', () => {
  function npsMock({ currentRows, priorRows, onInsert }) {
    return vi.fn(async (text, params) => {
      if (text.startsWith('INSERT INTO alert_events')) { onInsert?.(); return { rows: [{ id: 'ev3' }] }; }
      if (text.includes('FROM responses')) return { rows: (params || []).length === 4 ? priorRows : currentRows };
      return { rows: [] };
    });
  }
  it('fires when NPS rises at least minRise points', async () => {
    const rule = { id: 'r2', alert_type: 'S-02', severity: 'success', threshold_config: { minRise: 5, windowDays: 7 } };
    let inserted = false;
    dbQuery = npsMock({
      currentRows: [{ nps_score: 9 }, { nps_score: 10 }], // 100
      priorRows:   [{ nps_score: 9 }, { nps_score: 7 }],  // 50 → rise +50
      onInsert: () => { inserted = true; },
    });
    const { evalNpsRise } = load();
    expect(await evalNpsRise(rule, 'o1', 's1')).toBeTruthy();
    expect(inserted).toBe(true);
  });
});

describe('evalPredictiveNps (S-08)', () => {
  const rule = { id: 'rp', alert_type: 'S-08', severity: 'warning', threshold_config: { below: 30, horizon: 7 } };

  it('fires when NPS is above the floor but projected to fall below it', async () => {
    let inserted = false;
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM survey_metric_snapshots')) {
        return { rows: [{ nps: 50 }, { nps: 45 }, { nps: 40 }, { nps: 38 }, { nps: 35 }, { nps: 32 }] }; // falling, now 32 (>30)
      }
      if (text.startsWith('INSERT INTO alert_events')) { inserted = true; return { rows: [{ id: 'evp' }] }; }
      return { rows: [] };
    });
    const { evalPredictiveNps } = load();
    const ev = await evalPredictiveNps(rule, 'o1', 's1');
    expect(ev).toBeTruthy();
    expect(inserted).toBe(true);
  });

  it('does not fire when the trend is flat/rising', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM survey_metric_snapshots')) {
        return { rows: [{ nps: 40 }, { nps: 42 }, { nps: 44 }, { nps: 46 }] }; // rising
      }
      return { rows: [] };
    });
    const { evalPredictiveNps } = load();
    expect(await evalPredictiveNps(rule, 'o1', 's1')).toBeNull();
  });

  it('does not fire when NPS is already below the floor (S-03 territory)', async () => {
    dbQuery = vi.fn(async (text) => {
      if (text.includes('FROM survey_metric_snapshots')) {
        return { rows: [{ nps: 28 }, { nps: 26 }, { nps: 24 }] }; // already below 30
      }
      return { rows: [] };
    });
    const { evalPredictiveNps } = load();
    expect(await evalPredictiveNps(rule, 'o1', 's1')).toBeNull();
  });
});

describe('transitionAlert', () => {
  it('acknowledges an active alert and writes history', async () => {
    const calls = [];
    dbQuery = vi.fn(async (text, params) => {
      calls.push(text);
      if (text.startsWith('SELECT status')) return { rows: [{ status: 'active' }] };
      if (text.startsWith('UPDATE alert_events')) return { rows: [{ id: 'ev1', status: 'acknowledged' }] };
      return { rows: [] };
    });
    const { transitionAlert } = load();
    const ev = await transitionAlert('ev1', 'o1', 'acknowledge', 'u1');
    expect(ev.status).toBe('acknowledged');
    expect(calls.some((c) => c.startsWith('INSERT INTO alert_history'))).toBe(true);
  });

  it('404-style null when the alert is absent', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { transitionAlert } = load();
    expect(await transitionAlert('missing', 'o1', 'resolve', 'u1')).toBeNull();
  });
});
