import { Pool, QueryResult, QueryResultRow } from 'pg';
import { dbDuration } from './metrics';

const DEFAULT_URL = 'postgresql://postgres:postgres@localhost:5432/xperiq';
const connectionTimeoutMillis = (() => {
  const n = Number(process.env.DB_CONNECTION_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
})();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? DEFAULT_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis,
});

pool.on('error', (err: Error) => {
  // Imported lazily to avoid circular dep at startup
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const logger = require('./logger') as { error: (obj: Record<string, unknown>, msg: string) => void };
    logger.error({ err: err.message }, 'Postgres pool error');
  } catch { console.error('[db] pool error:', err.message); }
});

// Wrapped query — adds duration metrics + structured logging for slow queries
async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = process.hrtime.bigint();
  const op    = text.trim().split(/\s+/)[0].toLowerCase(); // select|insert|update|delete

  try {
    const result  = await pool.query<T>(text, params);
    const durationS = Number(process.hrtime.bigint() - start) / 1e9;
    dbDuration.observe({ operation: op }, durationS);

    if (durationS > 0.5) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const logger = require('./logger') as { warn: (obj: Record<string, unknown>, msg: string) => void };
        logger.warn({ op, ms: Math.round(durationS * 1000), query: text.slice(0, 80) }, 'slow query');
      } catch { /* logger not ready */ }
    }
    return result;
  } catch (err: unknown) {
    dbDuration.observe({ operation: op }, Number(process.hrtime.bigint() - start) / 1e9);
    throw err;
  }
}

/** Block until Postgres accepts a connection (startup / docker-compose race guard). */
async function waitForDb(opts: { attempts?: number; delayMs?: number } = {}): Promise<void> {
  const attempts = opts.attempts ?? 15;
  const delayMs = opts.delayMs ?? 1_000;
  let lastErr: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr ?? new Error('Postgres unavailable');
}

// export= matches legacy `module.exports = { query, pool }` so every import style works:
//   import db from './db'  |  import { query } from './db'  |  import * as db from './db'
const db = { query, pool, waitForDb };
export = db;
