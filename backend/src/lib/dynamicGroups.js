// Dynamic group rule engine + materialization.
//
// Dynamic groups store a JSONB rule set; membership is materialized into
// user_group_members so permission lookups stay O(1). Rules are compiled to
// PARAMETERIZED SQL against a strict field whitelist — values are never
// interpolated, and unknown fields/operators are rejected (fail-closed).
const db = require('./db');

// Whitelisted filterable fields → SQL expression. Anything else is rejected.
const FIELD_MAP = {
  email: 'up.email',
  first_name: 'up.first_name',
  last_name: 'up.last_name',
  display_name: 'up.display_name',
  job_title: 'up.job_title',
  department_id: 'up.department_id::text',
  department_name: 'd.name',
  manager_user_id: 'up.manager_user_id',
  cost_center: 'up.cost_center',
  location: 'up.location',
  is_active: 'up.is_active',
  employee_id: 'up.employee_id',
};

const OPERATORS = new Set(['eq', 'neq', 'contains', 'starts_with', 'gt', 'lt', 'in', 'not_in']);

// Resolve a rule's field to a safe SQL expression (or throw).
function resolveField(field) {
  if (FIELD_MAP[field]) return FIELD_MAP[field];
  // custom_attributes.<key> — key must be a safe identifier.
  const m = /^custom_attributes\.([a-zA-Z0-9_]+)$/.exec(field);
  if (m) return `(up.custom_attributes->>'${m[1]}')`;
  throw new Error(`Unsupported dynamic-group field: ${field}`);
}

/**
 * Compile a rule set to { sql, params }. The query selects matching user_ids
 * for the given org. $1 is always orgId.
 */
function buildDynamicGroupSQL(ruleSet, orgId) {
  const operator = (ruleSet?.operator || 'AND').toUpperCase();
  if (operator !== 'AND' && operator !== 'OR') throw new Error('operator must be AND or OR');
  const rules = Array.isArray(ruleSet?.rules) ? ruleSet.rules : [];

  const params = [orgId];
  const conditions = [];

  for (const rule of rules) {
    const expr = resolveField(rule.field);
    const op = String(rule.op);
    if (!OPERATORS.has(op)) throw new Error(`Unsupported operator: ${op}`);

    switch (op) {
      case 'eq':   params.push(rule.value); conditions.push(`${expr} = $${params.length}`); break;
      case 'neq':  params.push(rule.value); conditions.push(`${expr} <> $${params.length}`); break;
      case 'gt':   params.push(rule.value); conditions.push(`${expr} > $${params.length}`); break;
      case 'lt':   params.push(rule.value); conditions.push(`${expr} < $${params.length}`); break;
      case 'contains':
        params.push(`%${rule.value}%`); conditions.push(`${expr} ILIKE $${params.length}`); break;
      case 'starts_with':
        params.push(`${rule.value}%`); conditions.push(`${expr} ILIKE $${params.length}`); break;
      case 'in':
        params.push(Array.isArray(rule.value) ? rule.value : [rule.value]);
        conditions.push(`${expr} = ANY($${params.length})`); break;
      case 'not_in':
        params.push(Array.isArray(rule.value) ? rule.value : [rule.value]);
        conditions.push(`NOT (${expr} = ANY($${params.length}))`); break;
    }
  }

  const where = conditions.length ? ` AND (${conditions.join(` ${operator} `)})` : '';
  const sql =
    `SELECT up.user_id
       FROM user_profiles up
       LEFT JOIN departments d ON d.id = up.department_id
      WHERE up.org_id = $1 AND up.is_active = TRUE AND up.deprovisioned_at IS NULL${where}`;
  return { sql, params };
}

/** Materialize one dynamic group: diff matching users against current members. */
async function evaluateDynamicGroup(groupId, orgId) {
  const { rows: [group] } = await db.query(
    'SELECT group_type, dynamic_rules FROM user_groups WHERE id = $1 AND org_id = $2',
    [groupId, orgId]
  );
  if (!group || group.group_type !== 'dynamic' || !group.dynamic_rules) return { added: 0, removed: 0 };

  const { sql, params } = buildDynamicGroupSQL(group.dynamic_rules, orgId);
  const { rows: matching } = await db.query(sql, params);
  const matchingIds = new Set(matching.map((r) => r.user_id));

  const { rows: current } = await db.query(
    'SELECT user_id FROM user_group_members WHERE group_id = $1', [groupId]
  );
  const currentIds = new Set(current.map((m) => m.user_id));

  const toAdd = [...matchingIds].filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !matchingIds.has(id));

  if (toAdd.length) {
    const values = toAdd.map((_, i) => `($1, $${i + 2}, $${toAdd.length + 2})`).join(',');
    await db.query(
      `INSERT INTO user_group_members (group_id, user_id, org_id) VALUES ${values}
       ON CONFLICT DO NOTHING`,
      [groupId, ...toAdd, orgId]
    );
  }
  if (toRemove.length) {
    await db.query(
      'DELETE FROM user_group_members WHERE group_id = $1 AND user_id = ANY($2)',
      [groupId, toRemove]
    );
  }
  return { added: toAdd.length, removed: toRemove.length };
}

/** Re-evaluate every dynamic group in an org (used by cron + after profile changes). */
async function evaluateDynamicGroupsForOrg(orgId) {
  const { rows } = await db.query(
    `SELECT id FROM user_groups WHERE org_id = $1 AND group_type = 'dynamic' AND is_active = TRUE`,
    [orgId]
  );
  for (const { id } of rows) {
    try { await evaluateDynamicGroup(id, orgId); }
    catch (err) {
      try { require('./logger').warn({ event: 'dynamic_group_eval_failed', groupId: id, err: err.message }); }
      catch { /* logger not ready */ }
    }
  }
  return rows.length;
}

module.exports = {
  buildDynamicGroupSQL,
  evaluateDynamicGroup,
  evaluateDynamicGroupsForOrg,
  FIELD_MAP,
  OPERATORS,
};
