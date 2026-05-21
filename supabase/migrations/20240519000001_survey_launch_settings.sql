-- Sprint: Survey launch settings + agent call traces
-- Adds: max_responses, auto_close_at, allow_multiple_responses to surveys
-- Adds: agent_call_traces table for LLM call-level observability

-- ── Survey launch settings ─────────────────────────────────────────────────────

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS max_responses        INT;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS auto_close_at        TIMESTAMPTZ;
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS allow_multiple_responses BOOLEAN NOT NULL DEFAULT true;

-- Index: scheduler queries surveys with auto_close_at set
CREATE INDEX IF NOT EXISTS surveys_auto_close ON surveys(auto_close_at)
  WHERE auto_close_at IS NOT NULL AND status IN ('active', 'paused');

-- ── Agent call traces ──────────────────────────────────────────────────────────
-- One row per LLM API call (not per pipeline run). Used for investigation,
-- cost attribution, and ticketing system integration.

CREATE TABLE IF NOT EXISTS agent_call_traces (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        TEXT,
  org_id        TEXT        NOT NULL,
  trace_id      TEXT,
  agent_name    TEXT        NOT NULL,
  model         TEXT        NOT NULL,
  input_tokens  INT         NOT NULL DEFAULT 0,
  output_tokens INT         NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10, 8) NOT NULL DEFAULT 0,
  duration_ms   INT         NOT NULL DEFAULT 0,
  status        TEXT        NOT NULL DEFAULT 'success'
                            CHECK (status IN ('success', 'error', 'budget_exceeded')),
  error_msg     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_call_traces_run_id  ON agent_call_traces(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agent_call_traces_org_id  ON agent_call_traces(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_call_traces_created ON agent_call_traces(created_at DESC);
