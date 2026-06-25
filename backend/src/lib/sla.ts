/**
 * SLA calculation utilities for CX case management.
 *
 * cx_sla_configs table schema:
 *   org_id          TEXT NOT NULL DEFAULT '',  -- '' = platform default
 *   category        TEXT NOT NULL DEFAULT 'cx',
 *   severity        TEXT NOT NULL,
 *   ack_sla_hrs     INT NOT NULL,
 *   resolve_sla_hrs INT,                       -- NULL = no resolve SLA
 *   PRIMARY KEY (org_id, category, severity)
 */

export interface SlaRow {
  org_id: string;
  category: string;
  severity: string;
  ack_sla_hrs: number;
  resolve_sla_hrs: number | null;
}

export interface SlaConfig {
  ack_sla_hrs: number;
  resolve_sla_hrs: number | null;
}

// Hardcoded platform fallbacks used when no DB row is found.
const FALLBACK_DEFAULTS: Record<string, SlaConfig> = {
  critical: { ack_sla_hrs: 2,  resolve_sla_hrs: 24 },
  high:     { ack_sla_hrs: 8,  resolve_sla_hrs: 72 },
  medium:   { ack_sla_hrs: 24, resolve_sla_hrs: null },
  low:      { ack_sla_hrs: 72, resolve_sla_hrs: null },
};

const FALLBACK_DEFAULT: SlaConfig = { ack_sla_hrs: 48, resolve_sla_hrs: null };

/**
 * Returns org-specific SLA config if found, falls back to platform default (org_id='').
 * Falls back to hardcoded defaults if nothing is in the DB.
 *
 * Lookup priority:
 *   1. org-specific row  (org_id != '', matching severity + category)
 *   2. platform default  (org_id = '', matching severity + category)
 *   3. hardcoded default by severity
 *   4. catch-all default (ack=48 h, no resolve SLA)
 */
export function getSlaConfig(severity: string, category: string, configs: SlaRow[]): SlaConfig {
  const orgRow = configs.find(
    (r) => r.org_id !== '' && r.severity === severity && r.category === category
  );
  if (orgRow) {
    return { ack_sla_hrs: orgRow.ack_sla_hrs, resolve_sla_hrs: orgRow.resolve_sla_hrs };
  }

  const platformRow = configs.find(
    (r) => r.org_id === '' && r.severity === severity && r.category === category
  );
  if (platformRow) {
    return { ack_sla_hrs: platformRow.ack_sla_hrs, resolve_sla_hrs: platformRow.resolve_sla_hrs };
  }

  return FALLBACK_DEFAULTS[severity] ?? FALLBACK_DEFAULT;
}

/**
 * Computes deadline timestamps from base date + SLA hours.
 * fromDate defaults to new Date() (now).
 */
export function calcSlaDueDates(
  severity: string,
  category: string,
  configs: SlaRow[],
  fromDate?: Date
): { ackDueAt: Date; resolveDueAt: Date | null } {
  const config = getSlaConfig(severity, category, configs);
  const base = fromDate ?? new Date();
  const MS_PER_HOUR = 3_600_000;

  return {
    ackDueAt:     new Date(base.getTime() + config.ack_sla_hrs * MS_PER_HOUR),
    resolveDueAt: config.resolve_sla_hrs !== null
      ? new Date(base.getTime() + config.resolve_sla_hrs * MS_PER_HOUR)
      : null,
  };
}

/**
 * Returns risk level based on current time vs SLA deadlines:
 *   - 'breached' = sla_breached flag set, OR past the sla_due_at deadline
 *   - 'at_risk'  = sla_due_at within 2 hours (conservative approximation of 25% window)
 *   - 'ok'       = healthy
 *
 * Accepts both the simplified schema (sla_due_at + sla_breached) and the
 * extended schema (ack_due_at + resolve_due_at for granular deadline tracking).
 */
export function getSlaStatus(case_: {
  sla_due_at?: string | null;
  sla_breached?: boolean | null;
  ack_due_at?: string | null;
  resolve_due_at?: string | null;
  acked_at?: string | null;
  resolved_at?: string | null;
}): 'ok' | 'at_risk' | 'breached' {
  const now = Date.now();

  // Fast path: explicit breach flag set by the scheduler sweep
  if (case_.sla_breached === true) return 'breached';

  // Primary SLA deadline (ack deadline — always present after case creation)
  const ackDue = case_.ack_due_at ?? case_.sla_due_at ?? null;
  if (ackDue !== null && (case_.acked_at ?? null) === null) {
    const due = new Date(ackDue).getTime();
    const remaining = due - now;
    if (remaining <= 0)               return 'breached';
    if (remaining <= 2 * 3_600_000)  return 'at_risk';   // within 2 h
  }

  // Resolve deadline (optional — only present when sla config has resolve_sla_hrs)
  if (case_.resolve_due_at !== null && case_.resolve_due_at !== undefined && (case_.resolved_at ?? null) === null) {
    const due = new Date(case_.resolve_due_at).getTime();
    const remaining = due - now;
    if (remaining <= 0)               return 'breached';
    if (remaining <= 6 * 3_600_000)  return 'at_risk';   // within 6 h
  }

  return 'ok';
}
