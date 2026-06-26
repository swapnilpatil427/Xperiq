-- Workflow approval steps — a flow.approval node pauses execution ('waiting')
-- until a human approves/rejects, then the engine resumes from resume_index.

ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS resume_index INT;

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  UUID        NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  org_id        TEXT        NOT NULL,
  workflow_id   UUID        NOT NULL,
  node_id       TEXT,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  reason        TEXT
);
CREATE INDEX IF NOT EXISTS idx_wf_approvals_pending ON workflow_approvals(org_id, status, requested_at DESC)
  WHERE status = 'pending';
