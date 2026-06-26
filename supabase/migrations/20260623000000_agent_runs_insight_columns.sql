-- Add insight-pipeline columns to agent_runs.
-- These were referenced by the insight pipeline but never had a migration,
-- causing the "column does not exist" error in node_narrate_anchor_load.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS trigger_type           TEXT        DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'new_response', 'regenerate', 'schedule', 'stream')),
  ADD COLUMN IF NOT EXISTS new_response_count     INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sampled_response_ids   JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS sampled_response_count INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prior_context_run_id   UUID        REFERENCES agent_runs(id) ON DELETE SET NULL;

COMMENT ON COLUMN agent_runs.trigger_type IS
  'What triggered this run: manual | new_response | regenerate | schedule | stream';
COMMENT ON COLUMN agent_runs.new_response_count IS
  'Number of responses that were new (unseen) at the start of this run';
COMMENT ON COLUMN agent_runs.sampled_response_ids IS
  'JSON array of response UUIDs sampled during this run (audit trail)';
COMMENT ON COLUMN agent_runs.prior_context_run_id IS
  'The anchor run whose insights were used as prior context for narrative generation';

CREATE INDEX IF NOT EXISTS idx_agent_runs_trigger_type
  ON agent_runs(survey_id, org_id, trigger_type, completed_at DESC)
  WHERE status = 'completed';
