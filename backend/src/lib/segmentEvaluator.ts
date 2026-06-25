import type { FilterDef } from '../schemas/contact-segments';
import { query } from './db';

const ALLOWED_SEGMENT_FIELDS = new Set(['account_name', 'email', 'name', 'phone', 'data_region', 'consent_given', 'created_at', 'import_source']);
const ALLOWED_JSONB_KEY = /^[A-Za-z0-9_]+$/;

/** Build parameterized SQL for a single condition. Returns [clause, params] */
function buildCondition(
  cond: FilterDef['conditions'][number],
  paramOffset: number
): [string, unknown[]] {
  const { field, operator, value } = cond;
  const p = `$${paramOffset}`;

  // Handle segment_attrs.key dot notation → JSONB
  if (field.startsWith('segment_attrs.')) {
    const key = field.slice('segment_attrs.'.length);
    if (!ALLOWED_JSONB_KEY.test(key)) return ['FALSE', []];
    switch (operator) {
      case 'eq':       return [`segment_attrs->>'${key}' = ${p}`, [value]];
      case 'neq':      return [`segment_attrs->>'${key}' != ${p}`, [value]];
      case 'contains': return [`segment_attrs->>'${key}' ILIKE ${p}`, [`%${value}%`]];
      default:         return [`segment_attrs->>'${key}' = ${p}`, [value]];
    }
  }

  // email_domain derived field
  if (field === 'email_domain') {
    switch (operator) {
      case 'eq':         return [`split_part(email, '@', 2) = ${p}`, [value]];
      case 'ends_with':  return [`split_part(email, '@', 2) ILIKE ${p}`, [`%${value}`]];
      default:           return [`split_part(email, '@', 2) = ${p}`, [value]];
    }
  }

  // created_at temporal operators
  if (field === 'created_at') {
    switch (operator) {
      case 'before':      return [`created_at < ${p}`, [value]];
      case 'after':       return [`created_at > ${p}`, [value]];
      case 'within_days': return [`created_at > NOW() - (${p}::int || ' days')::interval`, [parseInt(value, 10)]];
      default:            return [`created_at = ${p}`, [value]];
    }
  }

  // Boolean fields
  if (field === 'consent_given') {
    const boolVal = value === 'true';
    return operator === 'neq'
      ? [`consent_given != ${p}`, [boolVal]]
      : [`consent_given = ${p}`, [boolVal]];
  }

  // Text fields: account_name, account_id, data_region
  if (!ALLOWED_SEGMENT_FIELDS.has(field)) return ['FALSE', []];
  switch (operator) {
    case 'eq':          return [`${field} = ${p}`, [value]];
    case 'neq':         return [`${field} != ${p}`, [value]];
    case 'contains':    return [`${field} ILIKE ${p}`, [`%${value}%`]];
    case 'starts_with': return [`${field} ILIKE ${p}`, [`${value}%`]];
    case 'ends_with':   return [`${field} ILIKE ${p}`, [`%${value}`]];
    case 'in': {
      const vals = value.split(',').map((v) => v.trim());
      const placeholders = vals.map((_, i) => `$${paramOffset + i}`).join(', ');
      return [`${field} IN (${placeholders})`, vals];
    }
    default:            return [`${field} = ${p}`, [value]];
  }
}

/** Build a full WHERE clause from a filter_def */
export function buildWhereClause(
  filterDef: FilterDef,
  orgId: string
): [string, unknown[]] {
  const baseParams: unknown[] = [orgId];
  const clauses: string[] = ['org_id = $1', 'anonymized_at IS NULL'];
  let offset = 2;

  for (const cond of filterDef.conditions) {
    const [clause, params] = buildCondition(cond, offset);
    clauses.push(clause);
    baseParams.push(...params);
    offset += params.length;
  }

  const logic = filterDef.logic === 'OR' ? ' OR ' : ' AND ';
  // First 2 clauses (org_id + anonymized) always AND; user conditions use chosen logic
  const userClauses = clauses.slice(2);
  const where = userClauses.length > 0
    ? `(${clauses.slice(0, 2).join(' AND ')}) AND (${userClauses.join(logic)})`
    : clauses.join(' AND ');

  return [where, baseParams];
}

/** Evaluate a filter_def: return count and a preview of up to 5 contacts */
export async function evaluateSegment(
  filterDef: FilterDef,
  orgId: string
): Promise<{ count: number; preview: unknown[] }> {
  const [where, params] = buildWhereClause(filterDef, orgId);
  const [countRes, previewRes] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM contacts WHERE ${where}`, params),
    query<Record<string, unknown>>(`SELECT id, name, email, account_name FROM contacts WHERE ${where} LIMIT 5`, params),
  ]);
  return {
    count: parseInt(countRes.rows[0]?.count ?? '0', 10),
    preview: previewRes.rows,
  };
}

/** Materialize segment membership — deletes old dynamic members, inserts matching */
export async function refreshSegmentMembership(
  segmentId: string,
  filterDef: FilterDef,
  orgId: string
): Promise<number> {
  const [where, params] = buildWhereClause(filterDef, orgId);
  // Delete existing dynamic members
  await query(
    `DELETE FROM contact_segment_members WHERE segment_id = $1 AND is_manual = FALSE`,
    [segmentId]
  );
  // Insert matching contacts
  const insertParams = [segmentId, ...params];
  const adjusted = where.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + 1}`);
  const { rowCount } = await query(
    `INSERT INTO contact_segment_members (segment_id, contact_id, is_manual)
     SELECT $1, id, FALSE FROM contacts WHERE ${adjusted}
     ON CONFLICT DO NOTHING`,
    insertParams
  );
  // Sync contact_count
  await query(
    `UPDATE contact_segments SET contact_count = $1, last_evaluated_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [rowCount ?? 0, segmentId]
  );
  return rowCount ?? 0;
}
