-- ── Migration: insight_checkpoints_v2 (Phase 1+) ────────────────────────────────
-- Append-only, linked-list checkpoint table that replaces survey_insight_checkpoints.
-- See docs/insights/new_design/03_DATA_MODEL.md §3a.
--
-- Conventions: org_id TEXT (no FK); surveys(id) ON DELETE CASCADE; agent_runs(id);
-- self-FK on parent_checkpoint_id; gen_random_uuid(); IF NOT EXISTS everywhere.
-- Enums created idempotently via DO blocks.

-- ── Enums ────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_run_mode') THEN
    CREATE TYPE insight_run_mode AS ENUM (
      'automated_incremental',
      'manual_expert',
      'manual_quick'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'insight_lane') THEN
    CREATE TYPE insight_lane AS ENUM ('automated', 'manual');
  END IF;
END $$;

-- ── Table ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insight_checkpoints_v2 (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id                       UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id                          TEXT NOT NULL,

  -- Linked list
  checkpoint_number               INT NOT NULL,
  parent_checkpoint_id            UUID REFERENCES insight_checkpoints_v2(id),
  lane                            insight_lane NOT NULL,

  -- Run identity
  run_id                          UUID NOT NULL REFERENCES agent_runs(id),
  run_mode                        insight_run_mode NOT NULL,
  trigger                         TEXT NOT NULL CHECK (trigger IN (
                                    'stream', 'scheduler', 'manual', 'milestone', 'api', 'days', 'responses'
                                  )),

  -- Actor
  created_by                      TEXT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Watermarks (automated)
  response_count_at_checkpoint    INT NOT NULL DEFAULT 0,
  response_high_watermark         TIMESTAMPTZ,
  new_response_count              INT NOT NULL DEFAULT 0,

  -- Metrics at checkpoint (denormalized for list UI)
  nps_at_checkpoint               NUMERIC(5,1),
  csat_at_checkpoint              NUMERIC(5,1),
  ces_at_checkpoint               NUMERIC(5,1),
  topic_fingerprint               TEXT,

  -- Delta (code-computed)
  delta_from_prior                JSONB,
  meaningful_delta                BOOLEAN NOT NULL DEFAULT FALSE,

  -- Lineage
  lineage_json                    JSONB NOT NULL DEFAULT '{}',

  -- Credits
  credits_debited                 INT NOT NULL DEFAULT 0,
  credit_ledger_tx_id             TEXT,

  -- Storage
  report_blob_ref                 TEXT,
  citations_manifest_ref          TEXT,
  schema_version                  INT NOT NULL DEFAULT 2,

  -- Manual window (nullable for automated)
  window_start                    TIMESTAMPTZ,
  window_end                      TIMESTAMPTZ,
  report_label                    TEXT,

  UNIQUE (survey_id, org_id, checkpoint_number)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ckpt_v2_survey_lane_num
  ON insight_checkpoints_v2 (survey_id, org_id, lane, checkpoint_number DESC);

CREATE INDEX IF NOT EXISTS idx_ckpt_v2_parent
  ON insight_checkpoints_v2 (parent_checkpoint_id);

CREATE INDEX IF NOT EXISTS idx_ckpt_v2_survey_created
  ON insight_checkpoints_v2 (survey_id, org_id, created_at DESC);
