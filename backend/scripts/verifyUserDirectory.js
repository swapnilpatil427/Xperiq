#!/usr/bin/env node
// Post-migration smoke check for the User Directory schema (Increment 1).
//   node backend/scripts/verifyUserDirectory.js
// Verifies the core tables exist, built-in roles are seeded, and the dev-org
// sample profiles are present. Read-only.
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

let Client;
try { ({ Client } = require('pg')); }
catch { ({ Client } = require('../node_modules/pg')); }

const DB_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/experient';

const EXPECTED_TABLES = [
  // User Directory (migrations 10, 12, 13)
  'user_profiles', 'org_roles', 'user_resource_permissions', 'departments',
  'user_groups', 'user_group_members', 'user_group_resource_permissions',
  'org_custom_fields', 'user_audit_log', 'scim_tokens', 'seat_usage',
  'sso_attribute_mappings',
  // Notifications (migrations 14, 15)
  'notification_dedup', 'notification_type_preferences', 'notification_channels',
  // Alerts (migration 16)
  'alert_rules', 'alert_events', 'alert_subscriptions', 'alert_thresholds', 'alert_history',
];

async function main() {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  let ok = true;

  console.log('\n── User Directory schema verification ──');

  for (const t of EXPECTED_TABLES) {
    const { rows } = await c.query('SELECT to_regclass($1) AS r', [`public.${t}`]);
    const present = !!rows[0].r;
    ok = ok && present;
    console.log(`  ${present ? '✓' : '✗'} table ${t}`);
  }

  const { rows: planCols } = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='org_profiles' AND column_name IN ('plan_tier','seat_limit','grace_period_end')`
  );
  console.log(`  ${planCols.length === 3 ? '✓' : '✗'} org_profiles plan fields (${planCols.length}/3)`);
  ok = ok && planCols.length === 3;

  const { rows: [{ n: roleCount }] } = await c.query(
    `SELECT COUNT(*)::int n FROM org_roles WHERE org_id='dev-org' AND is_builtin=TRUE`
  );
  console.log(`  ${roleCount === 7 ? '✓' : '✗'} dev-org built-in roles (${roleCount}/7)`);
  ok = ok && roleCount === 7;

  const { rows: [{ n: profileCount }] } = await c.query(
    `SELECT COUNT(*)::int n FROM user_profiles WHERE org_id='dev-org'`
  );
  console.log(`  ${profileCount >= 1 ? '✓' : '✗'} dev-org sample profiles (${profileCount})`);

  const { rows: [{ tier }] } = await c.query(
    `SELECT plan_tier AS tier FROM org_profiles WHERE org_id='dev-org'`
  );
  console.log(`  ${tier === 'enterprise' ? '✓' : '✗'} dev-org plan_tier = ${tier}`);

  // Notifications v2: the evolved notifications table columns.
  const { rows: notifCols } = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='notifications' AND column_name IN ('priority','action_url','read_at','delivered_channels')`
  );
  console.log(`  ${notifCols.length === 4 ? '✓' : '✗'} notifications v2 columns (${notifCols.length}/4)`);
  ok = ok && notifCols.length === 4;

  await c.end();
  console.log(ok ? '\n✅ User Directory schema looks correct.\n' : '\n❌ Schema verification found problems (see ✗ above).\n');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error('verify failed:', err.message); process.exit(1); });
