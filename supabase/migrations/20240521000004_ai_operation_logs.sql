-- AI operation cost and performance logging
-- Consider partitioning by month at scale (e.g. PARTITION BY RANGE (created_at))
CREATE TABLE IF NOT EXISTS ai_operation_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        TEXT NOT NULL,
    run_id        UUID,
    operation     TEXT NOT NULL,
    model         TEXT NOT NULL,
    provider      TEXT NOT NULL,
    input_tokens  INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    cost_usd      NUMERIC(10, 6) NOT NULL DEFAULT 0,
    latency_ms    INT NOT NULL DEFAULT 0,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_op_logs_org_created
    ON ai_operation_logs (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_op_logs_run
    ON ai_operation_logs (run_id)
    WHERE run_id IS NOT NULL;
