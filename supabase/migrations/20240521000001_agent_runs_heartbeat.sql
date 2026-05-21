-- Add heartbeat and retry columns to agent_runs for zombie detection
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS max_run_duration_minutes INT NOT NULL DEFAULT 30;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_of UUID REFERENCES agent_runs(id);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS response_count_at_run INT;

-- Partial index for zombie sweep query (only looks at running runs)
CREATE INDEX IF NOT EXISTS idx_agent_runs_heartbeat_running
    ON agent_runs (last_heartbeat_at)
    WHERE status = 'running';
