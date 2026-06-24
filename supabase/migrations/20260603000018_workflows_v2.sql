-- Workflow System — evolve the existing workflows table into a graph engine.
-- TEXT ids (doc's organizations/users FKs dropped). Existing condition/action
-- columns are kept for backward compatibility with the legacy automation rows.

-- Relax the legacy status CHECK (was active|paused) to the full lifecycle.
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_status_check;
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS nodes         JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS edges         JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS trigger_type  TEXT,
  ADD COLUMN IF NOT EXISTS run_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status   VARCHAR(16),
  ADD COLUMN IF NOT EXISTS template_id   UUID,
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;
ALTER TABLE workflows
  ADD CONSTRAINT workflows_status_check
  CHECK (status IN ('draft', 'active', 'paused', 'archived', 'error'));
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON workflows(org_id, trigger_type)
  WHERE status = 'active' AND deleted_at IS NULL;

-- Execution records.
CREATE TABLE IF NOT EXISTS workflow_executions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id          TEXT        NOT NULL,
  trigger_type    TEXT        NOT NULL,
  trigger_payload JSONB       NOT NULL DEFAULT '{}',
  status          VARCHAR(16) NOT NULL DEFAULT 'triggered'
                  CHECK (status IN ('triggered','evaluating','executing','waiting','completed','failed','skipped','timed_out')),
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER,
  error_message   TEXT,
  output          JSONB       DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow ON workflow_executions(workflow_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_exec_org ON workflow_executions(org_id, triggered_at DESC);

-- Per-step results.
CREATE TABLE IF NOT EXISTS workflow_step_executions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  UUID        NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  node_id       TEXT        NOT NULL,
  node_type     VARCHAR(64) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','running','completed','failed','skipped')),
  input         JSONB       DEFAULT '{}',
  output        JSONB       DEFAULT '{}',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wf_step_exec ON workflow_step_executions(execution_id, created_at);

-- Pre-built templates (global; not org-scoped).
CREATE TABLE IF NOT EXISTS workflow_templates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT        UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   TEXT        NOT NULL,
  category      VARCHAR(64),
  trigger_type  TEXT,
  nodes         JSONB       NOT NULL DEFAULT '[]',
  edges         JSONB       NOT NULL DEFAULT '[]',
  is_featured   BOOLEAN     DEFAULT FALSE,
  use_count     INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a few XM templates (idempotent).
INSERT INTO workflow_templates (slug, name, description, category, trigger_type, nodes, edges, is_featured)
VALUES
  ('nps-recovery', 'NPS Recovery', 'When a detractor responds, notify the CX lead and alert Slack so the team can close the loop.', 'closed_loop', 'survey.response_filtered',
   '[{"id":"t","type":"trigger","trigger":"survey.response_filtered"},{"id":"c","type":"condition","conditions":{"operator":"AND","rules":[{"field":"nps","op":"lte","value":6}]}},{"id":"a1","type":"action","action":"notify.in_app","config":{"priority":"warning","title":"Detractor response received"}},{"id":"a2","type":"action","action":"notify.slack","config":{}}]',
   '[{"from":"t","to":"c"},{"from":"c","to":"a1"},{"from":"a1","to":"a2"}]', TRUE),
  ('weekly-digest', 'Weekly Digest', 'Every Monday, Crystal summarizes the week and notifies the team.', 'reporting', 'time.schedule',
   '[{"id":"t","type":"trigger","trigger":"time.schedule","config":{"cron":"0 8 * * 1"}},{"id":"a1","type":"action","action":"crystal.summarize"},{"id":"a2","type":"action","action":"notify.in_app","config":{"priority":"digest","title":"Your weekly digest is ready"}}]',
   '[{"from":"t","to":"a1"},{"from":"a1","to":"a2"}]', TRUE),
  ('verbatim-escalation', 'Verbatim Escalation', 'When Crystal flags an urgent verbatim, create a critical notification and post to Slack.', 'escalation', 'crystal.verbatim_escalation',
   '[{"id":"t","type":"trigger","trigger":"crystal.verbatim_escalation"},{"id":"a1","type":"action","action":"notify.in_app","config":{"priority":"critical","title":"Urgent verbatim flagged"}},{"id":"a2","type":"action","action":"notify.slack","config":{}}]',
   '[{"from":"t","to":"a1"},{"from":"a1","to":"a2"}]', FALSE)
ON CONFLICT (slug) DO NOTHING;
