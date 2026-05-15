-- Experient Agentic Framework — Sprint 7A
-- Tables: agent_runs, notifications
-- Compatible with: Postgres 14+, pgcrypto (already loaded by initial migration)

-- ── Agent Runs ────────────────────────────────────────────────────────────────
-- One row per orchestrator invocation. Tracks state, credit consumption, and
-- the full event log so the frontend can reconstruct progress without a live
-- SSE connection.

CREATE TABLE agent_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  -- thread_id = orgId:sessionId — used as LangGraph checkpoint key
  thread_id       TEXT        NOT NULL UNIQUE,
  run_type        TEXT        NOT NULL DEFAULT 'survey_creation'
                              CHECK (run_type IN ('survey_creation')),
  status          TEXT        NOT NULL DEFAULT 'running'
                              CHECK (status IN ('running','waiting_approval','completed','failed','cancelled')),
  -- Input
  intent          TEXT,
  survey_type_id  TEXT,
  -- Output: the final approved survey questions (JSONB array)
  result_questions JSONB      DEFAULT NULL,
  -- QC score and recommendations from the run
  qc_score        NUMERIC(4,2),
  qc_issues       JSONB       DEFAULT '[]',
  recommendations JSONB       DEFAULT '[]',
  -- Credit tracking: array of CreditEntry objects
  credit_log      JSONB       NOT NULL DEFAULT '[]',
  total_tokens    INTEGER     NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,
  revision_count  INTEGER     NOT NULL DEFAULT 0,
  -- Stream events: array of StreamEvent objects polled by the frontend
  stream_events   JSONB       NOT NULL DEFAULT '[]',
  -- Error details for failed runs
  error_log       JSONB       NOT NULL DEFAULT '[]',
  -- Survey created from this run (set after user approves)
  survey_id       UUID        REFERENCES surveys(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  -- Idempotency: same org+intent+session within 5 minutes returns existing run
  CONSTRAINT agent_runs_thread_id_unique UNIQUE (thread_id)
);

CREATE INDEX agent_runs_org_id       ON agent_runs(org_id, created_at DESC);
CREATE INDEX agent_runs_user_id      ON agent_runs(user_id, created_at DESC);
CREATE INDEX agent_runs_status       ON agent_runs(status) WHERE status IN ('running','waiting_approval');
CREATE INDEX agent_runs_survey_id    ON agent_runs(survey_id) WHERE survey_id IS NOT NULL;

-- ── Notifications ─────────────────────────────────────────────────────────────
-- In-app notification feed. Phase 1: written by agents service on run completion.
-- Phase 2: email/Slack delivery added as separate columns.

CREATE TABLE notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  type        TEXT        NOT NULL
              CHECK (type IN (
                'SURVEY_CREATED',
                'RECOMMENDATION_READY',
                'RUN_FAILED',
                'RUN_APPROVAL_NEEDED',
                'SURVEY_SAVED'
              )),
  title       TEXT        NOT NULL,
  body        TEXT,
  -- Structured data for the frontend to render rich notifications
  payload     JSONB       DEFAULT '{}',
  -- Links back to the run that generated this notification
  run_id      UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_user_unread ON notifications(user_id, read, created_at DESC);
CREATE INDEX notifications_run_id      ON notifications(run_id) WHERE run_id IS NOT NULL;

-- ── Copilot Sessions ──────────────────────────────────────────────────────────
-- Persists Copilot conversation history per user so context survives page refresh.
-- Copilot is the flagship Experient product — sessions are first-class data.

CREATE TABLE copilot_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT        NOT NULL,
  user_id     TEXT        NOT NULL,
  -- Full message history: [{ role, content, agentCard?, timestamp }]
  messages    JSONB       NOT NULL DEFAULT '[]',
  -- Latest run_id associated with this session
  last_run_id UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX copilot_sessions_user ON copilot_sessions(user_id, updated_at DESC);

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER copilot_sessions_touch
  BEFORE UPDATE ON copilot_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
