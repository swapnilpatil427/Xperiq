/**
 * Tests for lib/sla.ts
 *
 * Pure-logic SLA calculation utilities for CX case management.
 * No DB or Redis — all functions are synchronous.
 *
 * getSlaConfig(severity, category, configs):
 *   Priority: org-specific row → platform default (org_id='') → hardcoded fallback.
 *
 * calcSlaDueDates(severity, category, configs, fromDate):
 *   Computes ackDueAt and resolveDueAt timestamps from the SLA config + base date.
 *
 * getSlaStatus(case_):
 *   Returns 'ok' | 'at_risk' | 'breached' based on SLA deadlines and flags.
 *   - 'breached'  if sla_breached flag set, or past ack/resolve deadline
 *   - 'at_risk'   if within 2h of ack deadline or 6h of resolve deadline
 *   - 'ok'        otherwise
 *   Acknowledged/resolved cases skip the relevant deadline check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const MOD_PATH = _require.resolve(resolve(__dirname, '../lib/sla'));

function load() {
  delete _require.cache[MOD_PATH];
  return _require(MOD_PATH);
}

// Helper: return an ISO string N milliseconds from now
function msFromNow(ms) {
  return new Date(Date.now() + ms).toISOString();
}
function msAgo(ms) {
  return new Date(Date.now() - ms).toISOString();
}

const HOUR_MS = 3_600_000;

describe('getSlaConfig', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const orgRow   = { org_id: 'org1', category: 'cx', severity: 'critical', ack_sla_hrs: 1,  resolve_sla_hrs: 12 };
  const platRow  = { org_id: '',     category: 'cx', severity: 'critical', ack_sla_hrs: 2,  resolve_sla_hrs: 24 };
  const highRow  = { org_id: '',     category: 'cx', severity: 'high',     ack_sla_hrs: 8,  resolve_sla_hrs: 72 };

  it('returns org-specific row when it exists', () => {
    const { getSlaConfig } = load();
    const cfg = getSlaConfig('critical', 'cx', [orgRow, platRow]);
    expect(cfg.ack_sla_hrs).toBe(1);
    expect(cfg.resolve_sla_hrs).toBe(12);
  });

  it('falls back to platform default (org_id="") when no org-specific row', () => {
    const { getSlaConfig } = load();
    const cfg = getSlaConfig('critical', 'cx', [platRow, highRow]);
    expect(cfg.ack_sla_hrs).toBe(2);
    expect(cfg.resolve_sla_hrs).toBe(24);
  });

  it('falls back to hardcoded defaults when no DB row exists', () => {
    const { getSlaConfig } = load();
    // No rows at all → hardcoded critical: ack=2h, resolve=24h
    const cfg = getSlaConfig('critical', 'cx', []);
    expect(cfg.ack_sla_hrs).toBe(2);
    expect(cfg.resolve_sla_hrs).toBe(24);
  });

  it('falls back to catch-all default (48h ack, no resolve) for unknown severity', () => {
    const { getSlaConfig } = load();
    const cfg = getSlaConfig('unknown_severity', 'cx', []);
    expect(cfg.ack_sla_hrs).toBe(48);
    expect(cfg.resolve_sla_hrs).toBeNull();
  });

  it('does not match an org row for a different category', () => {
    const { getSlaConfig } = load();
    const wrongCatRow = { org_id: 'org1', category: 'nps', severity: 'critical', ack_sla_hrs: 1, resolve_sla_hrs: 12 };
    const cfg = getSlaConfig('critical', 'cx', [wrongCatRow, platRow]);
    // Should skip wrongCatRow and use platform default
    expect(cfg.ack_sla_hrs).toBe(2);
  });
});

describe('calcSlaDueDates', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('computes ackDueAt as fromDate + ack_sla_hrs', () => {
    const { calcSlaDueDates } = load();
    const base = new Date('2025-01-01T00:00:00.000Z');
    const { ackDueAt } = calcSlaDueDates('high', 'cx', [], base);
    // Hardcoded high: ack=8h
    const expectedMs = base.getTime() + 8 * HOUR_MS;
    expect(ackDueAt.getTime()).toBe(expectedMs);
  });

  it('computes resolveDueAt when resolve_sla_hrs is set', () => {
    const { calcSlaDueDates } = load();
    const base = new Date('2025-01-01T00:00:00.000Z');
    const { resolveDueAt } = calcSlaDueDates('high', 'cx', [], base);
    // Hardcoded high: resolve=72h
    const expectedMs = base.getTime() + 72 * HOUR_MS;
    expect(resolveDueAt).not.toBeNull();
    expect(resolveDueAt.getTime()).toBe(expectedMs);
  });

  it('returns resolveDueAt as null when resolve_sla_hrs is null', () => {
    const { calcSlaDueDates } = load();
    const base = new Date('2025-01-01T00:00:00.000Z');
    // medium has resolve_sla_hrs: null
    const { resolveDueAt } = calcSlaDueDates('medium', 'cx', [], base);
    expect(resolveDueAt).toBeNull();
  });

  it('defaults fromDate to now when not provided', () => {
    const { calcSlaDueDates } = load();
    const before = Date.now();
    const { ackDueAt } = calcSlaDueDates('low', 'cx', []);
    const after = Date.now();
    // Hardcoded low: ack=72h; result should be within the before–after window + 72h
    expect(ackDueAt.getTime()).toBeGreaterThanOrEqual(before + 72 * HOUR_MS);
    expect(ackDueAt.getTime()).toBeLessThanOrEqual(after + 72 * HOUR_MS);
  });
});

describe('getSlaStatus', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns "ok" when within the SLA window', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      ack_due_at: msFromNow(5 * HOUR_MS), // 5 hours away — well within window
      acked_at: null,
    });
    expect(result).toBe('ok');
  });

  it('returns "at_risk" when within 2 hours of ack deadline', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      ack_due_at: msFromNow(30 * 60 * 1000), // 30 minutes away
      acked_at: null,
    });
    expect(result).toBe('at_risk');
  });

  it('returns "breached" when past the ack deadline and not acknowledged', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      ack_due_at: msAgo(1 * HOUR_MS), // 1 hour ago
      acked_at: null,
    });
    expect(result).toBe('breached');
  });

  it('returns "ok" when past the ack deadline but already acknowledged', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      ack_due_at: msAgo(1 * HOUR_MS),
      acked_at: msAgo(2 * HOUR_MS), // acknowledged before breach time
    });
    // acked_at is set → ack deadline check is skipped
    expect(result).not.toBe('breached');
  });

  it('returns "breached" immediately when sla_breached flag is true', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      sla_breached: true,
      ack_due_at: msFromNow(10 * HOUR_MS), // deadline not yet passed, but flag is set
      acked_at: null,
    });
    expect(result).toBe('breached');
  });

  it('returns "ok" when no deadlines are set', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({});
    expect(result).toBe('ok');
  });

  it('returns "breached" when past resolve deadline and not resolved', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      ack_due_at: msFromNow(5 * HOUR_MS),
      acked_at: msAgo(1 * HOUR_MS), // already acknowledged
      resolve_due_at: msAgo(2 * HOUR_MS), // resolve deadline has passed
      resolved_at: null,
    });
    expect(result).toBe('breached');
  });

  it('returns "at_risk" when within 6 hours of resolve deadline', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      ack_due_at: msFromNow(10 * HOUR_MS),
      acked_at: msAgo(1 * HOUR_MS),
      resolve_due_at: msFromNow(3 * HOUR_MS), // 3h away → within 6h at_risk window
      resolved_at: null,
    });
    expect(result).toBe('at_risk');
  });

  it('returns "ok" when resolve deadline is set but already resolved', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      ack_due_at: msFromNow(5 * HOUR_MS),
      acked_at: msAgo(3 * HOUR_MS),
      resolve_due_at: msAgo(1 * HOUR_MS), // deadline passed
      resolved_at: msAgo(2 * HOUR_MS),   // but already resolved
    });
    // resolved_at is set → resolve deadline check skipped
    expect(result).toBe('ok');
  });

  it('falls back to sla_due_at when ack_due_at is absent', () => {
    const { getSlaStatus } = load();
    const result = getSlaStatus({
      sla_due_at: msAgo(1 * HOUR_MS), // past due
      acked_at: null,
    });
    expect(result).toBe('breached');
  });
});
