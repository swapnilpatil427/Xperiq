-- Sprint 7A extension: add compliance and validation columns to agent_runs
-- These columns store the output of the new Compliance agent and post-LLM
-- validation errors from the QC and Creator agents.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS compliance_risk_level TEXT
    CHECK (compliance_risk_level IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS compliance_findings JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS compliance_blocks_dist BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qc_validation_errors JSONB NOT NULL DEFAULT '[]';

-- Index for compliance queries (e.g. "show me all high-risk surveys")
CREATE INDEX IF NOT EXISTS idx_agent_runs_compliance_risk
  ON agent_runs(org_id, compliance_risk_level)
  WHERE compliance_risk_level IS NOT NULL;
