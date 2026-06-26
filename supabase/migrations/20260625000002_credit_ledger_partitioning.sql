-- ============================================================================
-- Credit ledger partitioning + retention (super-scale data growth)
-- ----------------------------------------------------------------------------
-- credit_ledger is append-only and grows with every metered AI action. Convert it to
-- monthly RANGE partitions so old data can be dropped in O(1) (DROP TABLE partition) instead
-- of expensive DELETEs, and queries prune to the relevant month(s).
--
-- Safe conversion: only auto-converts when the table is EMPTY (true pre-deploy). A populated
-- table is left alone with a NOTICE — convert it in a maintenance window.
--
-- A DEFAULT partition is the catch-all so an INSERT can never fail even if a monthly
-- partition is missing. The scheduler job `credit-ledger-maintenance` keeps months ahead
-- provisioned and applies retention.
-- ============================================================================

-- Create a monthly partition for the month containing p_month (idempotent; no-op if the
-- table isn't partitioned, e.g. conversion was skipped).
CREATE OR REPLACE FUNCTION create_credit_ledger_partition(p_month DATE)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  start_date DATE := date_trunc('month', p_month)::date;
  end_date   DATE := (date_trunc('month', p_month) + INTERVAL '1 month')::date;
  part_name  TEXT := 'credit_ledger_' || to_char(start_date, 'YYYY_MM');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'credit_ledger'
  ) THEN
    RETURN NULL;  -- not partitioned; nothing to do
  END IF;

  IF to_regclass('public.' || part_name) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF credit_ledger FOR VALUES FROM (%L) TO (%L)',
      part_name, start_date, end_date
    );
  END IF;
  RETURN part_name;
END;
$$;

-- Drop monthly partitions older than keep_months (retention). Returns the count dropped.
-- The DEFAULT partition is never dropped.
CREATE OR REPLACE FUNCTION drop_old_credit_ledger_partitions(keep_months INT DEFAULT 18)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  cutoff  DATE := (date_trunc('month', NOW()) - (keep_months || ' months')::interval)::date;
  r       RECORD;
  dropped INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'credit_ledger'
      AND c.relname ~ '^credit_ledger_[0-9]{4}_[0-9]{2}$'
  LOOP
    IF to_date(substring(r.name FROM 'credit_ledger_(\d{4}_\d{2})'), 'YYYY_MM') < cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS %I', r.name);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END;
$$;

-- Convert credit_ledger to partitioned — only when empty (safe).
DO $$
DECLARE
  already_partitioned BOOL;
  row_count           BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'credit_ledger'
  ) INTO already_partitioned;

  IF already_partitioned THEN
    RAISE NOTICE 'credit_ledger already partitioned — skipping';
    RETURN;
  END IF;

  IF to_regclass('public.credit_ledger') IS NULL THEN
    RAISE NOTICE 'credit_ledger does not exist — skipping (run 20260625000001 first)';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM credit_ledger' INTO row_count;
  IF row_count > 0 THEN
    RAISE NOTICE 'credit_ledger has % rows — skipping auto-conversion; convert in a maintenance window', row_count;
    RETURN;
  END IF;

  -- Empty → safe to recreate as partitioned. PK must include the partition key (created_at).
  DROP TABLE credit_ledger;
  CREATE TABLE credit_ledger (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id        TEXT        NOT NULL,
    user_id       TEXT,
    action_type   TEXT        NOT NULL,
    credits       INT         NOT NULL,
    source        TEXT        NOT NULL DEFAULT 'system'
                      CHECK (source IN ('allowance', 'pack', 'overage', 'grant', 'system')),
    action_ref    TEXT,
    balance_after INT         NOT NULL DEFAULT 0,
    unit_cost_usd NUMERIC(12, 6),
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
  ) PARTITION BY RANGE (created_at);

  CREATE INDEX credit_ledger_org_time_idx   ON credit_ledger (org_id, created_at DESC);
  CREATE INDEX credit_ledger_org_action_idx ON credit_ledger (org_id, action_type, created_at DESC);

  -- Catch-all so an INSERT never fails if a monthly partition is missing.
  CREATE TABLE IF NOT EXISTS credit_ledger_default PARTITION OF credit_ledger DEFAULT;
END $$;

-- Pre-create the current + next two months.
SELECT create_credit_ledger_partition(CURRENT_DATE);
SELECT create_credit_ledger_partition((CURRENT_DATE + INTERVAL '1 month')::date);
SELECT create_credit_ledger_partition((CURRENT_DATE + INTERVAL '2 months')::date);
