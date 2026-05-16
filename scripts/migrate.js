#!/usr/bin/env node
/**
 * Incremental migration runner for local dev.
 *
 * Tracks applied migrations in a schema_migrations table.
 * Safe to run repeatedly — skips already-applied files.
 * Handles first-run: if the DB was bootstrapped by Docker (surveys table
 * exists but schema_migrations doesn't), pre-marks the Dockerfile migrations
 * as applied so they are not re-run destructively.
 */
'use strict';

// pg lives in backend/node_modules; fall back to root node_modules if installed there
let Client;
try { ({ Client } = require('pg')); }
catch { ({ Client } = require('../backend/node_modules/pg')); }
const fs         = require('fs');
const path       = require('path');

const DB_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/experient';

// Migrations that Docker applies on a fresh DB via docker-entrypoint-initdb.d.
// Pre-mark these as done when we detect an existing bootstrapped DB.
const DOCKER_BOOTSTRAPPED = [
  '20240101000000_initial',
  '20240514000000_agents',
  '20240515000000_agents_compliance',
];

// For migrations that may have been applied outside the runner (manually, or via
// a previous Docker image), check a fingerprint query. If the query returns a row,
// the migration was already applied — mark it done without re-running it.
const FINGERPRINTS = {
  '20240516000000_insights':
    `SELECT to_regclass('public.insight_audit_log') AS exists`,
  '20240517000000_surveys_v2':
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='surveys' AND column_name='insight_schedule_enabled' LIMIT 1`,
  '20240518000000_insights_v2':
    `SELECT to_regclass('public.survey_topics') AS exists`,
};

async function connectWithRetry(retries = 15, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    const client = new Client({ connectionString: DB_URL });
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      if (i === retries) throw err;
      process.stdout.write(`[migrate] waiting for postgres (${i}/${retries})…\r`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const client = await connectWithRetry();

  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Detect Docker-bootstrapped DB: surveys exists but tracking table was just created
    const { rows: surveyRows } = await client.query(`
      SELECT to_regclass('public.surveys') AS t
    `);
    const { rows: migRows } = await client.query(
      'SELECT COUNT(*)::int AS n FROM schema_migrations'
    );
    if (surveyRows[0].t && migRows[0].n === 0) {
      // Fresh schema_migrations on an already-bootstrapped DB — pre-mark Docker migrations
      for (const v of DOCKER_BOOTSTRAPPED) {
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [v]
        );
      }
    }

    // Determine applied set
    const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
    const done = new Set(applied.map(r => r.version));

    // Collect and sort migration files
    const migrationsDir = path.join(__dirname, '../supabase/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      const version = path.basename(file, '.sql');
      if (done.has(version)) continue;

      // Check fingerprint — if the objects this migration creates already exist,
      // the migration was applied outside the runner. Mark it done and skip.
      if (FINGERPRINTS[version]) {
        const { rows } = await client.query(FINGERPRINTS[version]);
        if (rows.length > 0 && (rows[0].exists || rows[0].column_name)) {
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
            [version]
          );
          console.log(`[migrate] ✓ ${file} (already applied — fingerprinted)`);
          continue;
        }
      }

      process.stdout.write(`[migrate] → ${file}\n`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    if (ran === 0) console.log('[migrate] ✓ already up to date');
    else          console.log(`[migrate] ✓ applied ${ran} migration(s)`);

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(`[migrate] ✗ ${err.message}`);
  process.exit(1);
});
