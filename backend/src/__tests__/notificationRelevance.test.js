import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { relevanceScore, shouldSuppress } = createRequire(import.meta.url)(resolve(__dirname, '../lib/notificationRelevance'));

describe('relevanceScore', () => {
  it('scores critical higher than info', () => {
    expect(relevanceScore({ priority: 'critical', magnitude: 0.5, recencyHours: 0 }))
      .toBeGreaterThan(relevanceScore({ priority: 'info', magnitude: 0.5, recencyHours: 0 }));
  });
  it('fresh + high-magnitude scores higher than stale + low', () => {
    expect(relevanceScore({ priority: 'warning', magnitude: 1, recencyHours: 0 }))
      .toBeGreaterThan(relevanceScore({ priority: 'warning', magnitude: 0, recencyHours: 200 }));
  });
});

describe('shouldSuppress', () => {
  it('never suppresses critical', () => {
    expect(shouldSuppress({ priority: 'critical', magnitude: 0, recencyHours: 999 }).suppress).toBe(false);
  });
  it('suppresses low-relevance digest noise', () => {
    expect(shouldSuppress({ priority: 'digest', magnitude: 0, recencyHours: 200 }).suppress).toBe(true);
  });
  it('keeps a fresh high-magnitude warning', () => {
    expect(shouldSuppress({ priority: 'warning', magnitude: 0.9, recencyHours: 0 }).suppress).toBe(false);
  });
  it('suppresses a 4th unread info for the same entity (fatigue)', () => {
    const r = shouldSuppress({ priority: 'info', magnitude: 1, recencyHours: 0, unreadSameEntityInfo: 3 });
    expect(r.suppress).toBe(true);
    expect(r.reason).toBe('info_fatigue');
  });
  it('allows info when under the fatigue cap and relevant', () => {
    expect(shouldSuppress({ priority: 'info', magnitude: 1, recencyHours: 0, unreadSameEntityInfo: 0 }).suppress).toBe(false);
  });
});
