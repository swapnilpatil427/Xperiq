/**
 * Tests for the scheduler service (src/scheduler/*).
 * Verifies due-job selection, per-job run isolation (success/failure), and the
 * expire-stale-broadcasts job. DB + logger are injected; metrics use the real registry.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

const DB_PATH       = _require.resolve(resolve(__dirname, '../lib/db'));
const LOGGER_PATH   = _require.resolve(resolve(__dirname, '../lib/logger'));
const RUNNER_PATH   = _require.resolve(resolve(__dirname, '../scheduler/runner'));
const LEADER_PATH   = _require.resolve(resolve(__dirname, '../scheduler/leader'));
const EXPIRE_PATH   = _require.resolve(resolve(__dirname, '../scheduler/jobs/expireStaleBroadcasts'));
const RECON_PATH    = _require.resolve(resolve(__dirname, '../scheduler/jobs/reconciliation'));
const COSTDOWN_PATH = _require.resolve(resolve(__dirname, '../scheduler/jobs/costDownDividend'));
const LEDGER_MAINT_PATH = _require.resolve(resolve(__dirname, '../scheduler/jobs/creditLedgerMaintenance'));
const CRED_HEALTH_PATH  = _require.resolve(resolve(__dirname, '../scheduler/jobs/credentialHealth'));
const PAYMENTS_PATH     = _require.resolve(resolve(__dirname, '../lib/payments'));
const REGISTRY_PATH = _require.resolve(resolve(__dirname, '../scheduler/registry'));

function fakeMod(id, exports) { return { id, filename: id, loaded: true, exports, children: [] }; }

let dbQuery, clientQuery;

function injectDeps() {
  const client = { query: (...a) => clientQuery(...a), release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) };
  _require.cache[DB_PATH] = fakeMod(DB_PATH, { query: dbQuery, pool, default: { query: dbQuery, pool } });
  _require.cache[LOGGER_PATH] = fakeMod(LOGGER_PATH, {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  });
}

function loadRunner()  { injectDeps(); delete _require.cache[RUNNER_PATH];   return _require(RUNNER_PATH); }
function loadLeader()  { injectDeps(); delete _require.cache[LEADER_PATH];   return _require(LEADER_PATH); }
function loadExpire()  { injectDeps(); delete _require.cache[EXPIRE_PATH];   return _require(EXPIRE_PATH); }
function loadRecon()   { injectDeps(); delete _require.cache[RECON_PATH];    return _require(RECON_PATH); }
function loadCostDown(){ injectDeps(); delete _require.cache[COSTDOWN_PATH]; return _require(COSTDOWN_PATH); }
function loadLedgerMaint(){ injectDeps(); delete _require.cache[LEDGER_MAINT_PATH]; return _require(LEDGER_MAINT_PATH); }
function loadCredHealth(){ injectDeps(); delete _require.cache[CRED_HEALTH_PATH]; return _require(CRED_HEALTH_PATH); }

beforeEach(() => {
  dbQuery = vi.fn(async () => ({ rows: [] }));
  clientQuery = vi.fn(async () => ({ rows: [{ locked: false }] }));
});
afterAll(() => {
  for (const p of [DB_PATH, LOGGER_PATH, RUNNER_PATH, LEADER_PATH, EXPIRE_PATH, RECON_PATH, COSTDOWN_PATH, LEDGER_MAINT_PATH, CRED_HEALTH_PATH, PAYMENTS_PATH, REGISTRY_PATH]) {
    delete _require.cache[p];
  }
});

describe('dueJobs', () => {
  it('selects enabled jobs whose interval has elapsed', () => {
    const { dueJobs } = loadRunner();
    const jobs = [
      { name: 'a', enabled: true,  intervalSec: 60, handler: async () => {} },
      { name: 'b', enabled: false, intervalSec: 60, handler: async () => {} },
      { name: 'c', enabled: true,  intervalSec: 60, handler: async () => {} },
    ];
    const now = 1_000_000;
    const last = { a: now - 61_000, c: now - 10_000 }; // a due, c not due, b disabled
    const due = dueJobs(jobs, last, now).map((j) => j.name);
    expect(due).toEqual(['a']);
  });

  it('treats a never-run job as due', () => {
    const { dueJobs } = loadRunner();
    const jobs = [{ name: 'x', enabled: true, intervalSec: 300, handler: async () => {} }];
    expect(dueJobs(jobs, {}, Date.now()).map((j) => j.name)).toEqual(['x']);
  });
});

describe('runJob', () => {
  it('returns success when the handler resolves', async () => {
    const { runJob } = loadRunner();
    const handler = vi.fn(async () => ({ affected: 2 }));
    const result = await runJob({ name: 'ok-job', enabled: true, intervalSec: 60, handler });
    expect(result).toBe('success');
    expect(handler).toHaveBeenCalled();
  });

  it('isolates failures — returns failure, does not throw', async () => {
    const { runJob } = loadRunner();
    const handler = vi.fn(async () => { throw new Error('boom'); });
    const result = await runJob({ name: 'bad-job', enabled: true, intervalSec: 60, handler });
    expect(result).toBe('failure');
  });
});

describe('expireStaleBroadcasts', () => {
  it('calls the DB function and returns the affected count', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ expire_stale_broadcasts: 3 }] }));
    const { expireStaleBroadcasts } = loadExpire();
    const res = await expireStaleBroadcasts();
    expect(res).toEqual({ affected: 3 });
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining('expire_stale_broadcasts()'));
  });

  it('defaults to 0 when the function returns nothing', async () => {
    dbQuery = vi.fn(async () => ({ rows: [] }));
    const { expireStaleBroadcasts } = loadExpire();
    expect(await expireStaleBroadcasts()).toEqual({ affected: 0 });
  });
});

describe('leader election', () => {
  it('becomes leader when it acquires the advisory lock', async () => {
    clientQuery = vi.fn(async () => ({ rows: [{ locked: true }] }));
    const { ensureLeadership } = loadLeader();
    expect(await ensureLeadership()).toBe(true);
  });

  it('stands by when another instance holds the lock', async () => {
    clientQuery = vi.fn(async () => ({ rows: [{ locked: false }] }));
    const { ensureLeadership, currentlyLeader } = loadLeader();
    expect(await ensureLeadership()).toBe(false);
    expect(currentlyLeader()).toBe(false);
  });
});

describe('reconciliation job', () => {
  it('reports zero violations on a clean ledger', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ neg_allowance: '0', neg_pack: '0', over_allowance: '0', neg_overage: '0', total: '12' }] }));
    const { reconciliation } = loadRecon();
    const res = await reconciliation();
    expect(res.affected).toBe(0);
  });

  it('counts invariant violations', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ neg_allowance: '1', neg_pack: '0', over_allowance: '2', neg_overage: '0', total: '12' }] }));
    const { reconciliation } = loadRecon();
    const res = await reconciliation();
    expect(res.affected).toBe(3);
  });
});

describe('cost-down-dividend job', () => {
  it('computes COGS per credit and stays in dry-run', async () => {
    dbQuery = vi.fn(async () => ({ rows: [{ cost_usd: '10', credits: '1000' }] }));
    const { costDownDividend } = loadCostDown();
    const res = await costDownDividend();
    expect(res.note).toContain('cogs_per_credit=0.010000');
    expect(res.note).toContain('dry_run=true');
  });

  it('handles missing ai_operation_logs gracefully (0 COGS)', async () => {
    dbQuery = vi.fn(async () => { throw new Error('relation "ai_operation_logs" does not exist'); });
    const { costDownDividend } = loadCostDown();
    const res = await costDownDividend();
    expect(res.note).toContain('cogs_per_credit=0.000000');
  });
});

describe('credit-ledger-maintenance job', () => {
  it('provisions partitions ahead and applies retention', async () => {
    const calls = [];
    dbQuery = vi.fn(async (sql, params) => {
      calls.push(String(sql));
      if (String(sql).includes('drop_old_credit_ledger_partitions')) return { rows: [{ dropped: 2 }] };
      return { rows: [{}] };
    });
    const { creditLedgerMaintenance } = loadLedgerMaint();
    const res = await creditLedgerMaintenance();
    expect(res.affected).toBe(2);
    // three create_credit_ledger_partition calls + one retention call
    expect(calls.filter((s) => s.includes('create_credit_ledger_partition'))).toHaveLength(3);
    expect(calls.some((s) => s.includes('drop_old_credit_ledger_partitions'))).toBe(true);
  });
});

describe('credential-health job', () => {
  const probe = (integration, configured, result) => ({
    integration,
    configured: () => configured,
    check: typeof result === 'function' ? result : async () => result,
  });

  it('no-ops when no integrations are configured', async () => {
    const { credentialHealth } = loadCredHealth();
    const res = await credentialHealth([
      probe('stripe', false, { status: 'ok' }),
      probe('openrouter', false, { status: 'ok' }),
    ]);
    expect(res.affected).toBe(0);
    expect(res.note).toContain('no configured integrations');
  });

  it('counts only configured probes and reports invalid ones', async () => {
    const { credentialHealth } = loadCredHealth();
    const res = await credentialHealth([
      probe('stripe', true, { status: 'ok' }),
      probe('openrouter', true, { status: 'invalid', detail: 'HTTP 401' }),
      probe('clerk', false, { status: 'ok' }), // not configured → skipped
    ]);
    expect(res.affected).toBe(1);
    expect(res.note).toContain('probed 2 integration(s)');
  });

  it('treats a thrown probe (network error) as invalid', async () => {
    const { credentialHealth } = loadCredHealth();
    const res = await credentialHealth([
      probe('stripe', true, async () => { throw new Error('ECONNRESET'); }),
    ]);
    expect(res.affected).toBe(1);
  });

  it('counts provider errors (non-200, non-auth) as affected', async () => {
    const { credentialHealth } = loadCredHealth();
    const res = await credentialHealth([
      probe('openrouter', true, { status: 'error', detail: 'HTTP 503' }),
      probe('stripe', true, { status: 'ok' }),
    ]);
    expect(res.affected).toBe(1);
    expect(res.note).toContain('probed 2 integration(s)');
  });

  it('records days-to-expiry without counting a valid key as invalid', async () => {
    const { credentialHealth } = loadCredHealth();
    const soon = new Date(Date.now() + 3 * 86_400_000); // expires in 3 days
    const res = await credentialHealth([
      probe('stripe', true, { status: 'ok', expiresAt: soon }),
    ]);
    expect(res.affected).toBe(0); // valid even though expiring soon (alert fires off the gauge)
  });

  it('DEFAULT_PROBES skips stripe when the payments rail is not operational', () => {
    injectDeps();
    _require.cache[PAYMENTS_PATH] = fakeMod(PAYMENTS_PATH, { isStripeConfigured: () => false });
    delete _require.cache[CRED_HEALTH_PATH];
    const { DEFAULT_PROBES } = _require(CRED_HEALTH_PATH);
    const stripe = DEFAULT_PROBES.find((p) => p.integration === 'stripe');
    expect(stripe.configured()).toBe(false);
    delete _require.cache[PAYMENTS_PATH];
    delete _require.cache[CRED_HEALTH_PATH];
  });
});
