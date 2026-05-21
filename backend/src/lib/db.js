const { Pool } = require('pg');
const { dbDuration } = require('./metrics');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  // Imported lazily to avoid circular dep at startup
  try { require('./logger').error({ err: err.message }, 'Postgres pool error'); }
  catch { console.error('[db] pool error:', err.message); }
});

// Wrapped query — adds duration metrics + structured logging for slow queries
async function query(text, params) {
  const start = process.hrtime.bigint();
  const op    = text.trim().split(/\s+/)[0].toLowerCase(); // select|insert|update|delete

  try {
    const result  = await pool.query(text, params);
    const durationS = Number(process.hrtime.bigint() - start) / 1e9;
    dbDuration.observe({ operation: op }, durationS);

    if (durationS > 0.5) {
      try { require('./logger').warn({ op, ms: Math.round(durationS * 1000), query: text.slice(0, 80) }, 'slow query'); }
      catch { /* logger not ready */ }
    }
    return result;
  } catch (err) {
    dbDuration.observe({ operation: op }, Number(process.hrtime.bigint() - start) / 1e9);
    throw err;
  }
}

module.exports = { query, pool };
