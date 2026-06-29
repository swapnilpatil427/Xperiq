-- ── Migration: insight_reports (Phase 1+) ───────────────────────────────────────
-- Manual insight documents (expert / quick). See §5.
-- org_id TEXT (no FK); surveys(id) ON DELETE CASCADE; agent_runs(id);
-- checkpoint_id references insight_checkpoints_v2(id) for trail. Depends on the
-- insight_run_mode enum (created in 20240523000000_insight_checkpoints_v2.sql).

CREATE TABLE IF NOT EXISTS insight_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id         UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id            TEXT NOT NULL,
  run_id            UUID NOT NULL REFERENCES agent_runs(id),

  run_mode          insight_run_mode NOT NULL CHECK (run_mode IN ('manual_expert', 'manual_quick')),
  label             TEXT,
  window_start      TIMESTAMPTZ NOT NULL,
  window_end        TIMESTAMPTZ NOT NULL,

  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status            TEXT NOT NULL DEFAULT 'generating'
                    CHECK (status IN ('generating', 'ready', 'failed')),
  blob_ref          TEXT,
  citations_manifest_ref TEXT,

  summary_headline  TEXT,
  trust_score_avg   NUMERIC(4,1),

  checkpoint_id     UUID REFERENCES insight_checkpoints_v2(id),

  UNIQUE (run_id)
);

CREATE INDEX IF NOT EXISTS idx_insight_reports_survey
  ON insight_reports (survey_id, org_id, created_at DESC);
