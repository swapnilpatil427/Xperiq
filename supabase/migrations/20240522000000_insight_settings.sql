-- ── Migration: insight settings (Phase 1) ──────────────────────────────────────
-- Per-survey insight configuration (§2) and org-level defaults (§13).
-- org_id is plain TEXT with NO foreign key (no orgs table). survey_id references
-- surveys(id) ON DELETE CASCADE. All CHECK constraints on credit_cost_* preserved.
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS.

-- ── survey_insight_settings (§2) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_insight_settings (
  survey_id                       UUID PRIMARY KEY REFERENCES surveys(id) ON DELETE CASCADE,
  org_id                          TEXT NOT NULL,

  -- Automated incremental
  automated_insights_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  automated_report_generation_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  stream_response_threshold               INT NOT NULL DEFAULT 10,
  report_regen_threshold                  INT NOT NULL DEFAULT 25,
  prior_checkpoint_lookback               INT NOT NULL DEFAULT 5,
  prior_checkpoint_max_age_days           INT NOT NULL DEFAULT 90,
  full_checkpoint_response_threshold      INT NOT NULL DEFAULT 200,
  meaningful_delta_nps_points             NUMERIC(4,1) NOT NULL DEFAULT 2.0,
  meaningful_delta_topic_pct              NUMERIC(4,1) NOT NULL DEFAULT 10.0,

  -- Refresh (user-initiated from Intelligence page)
  refresh_lookback_days                   INT NOT NULL DEFAULT 30,
  refresh_min_response_count              INT NOT NULL DEFAULT 25,
  refresh_daily_limit                     INT NOT NULL DEFAULT 5,

  -- Manual
  manual_expert_checkpoint_lookback       INT NOT NULL DEFAULT 3,
  manual_expert_max_corpus                INT NOT NULL DEFAULT 2000,
  manual_expert_full_corpus_cap           INT NOT NULL DEFAULT 500,
  manual_expert_snapshot_count            INT NOT NULL DEFAULT 5,
  manual_quick_sample_cap                 INT NOT NULL DEFAULT 150,
  manual_quick_snapshot_count             INT NOT NULL DEFAULT 2,
  manual_quick_default_window_days        INT NOT NULL DEFAULT 14,
  manual_daily_run_limit                  INT NOT NULL DEFAULT 10,

  -- Custom Analysis (separate surface)
  custom_analysis_enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
  custom_analysis_daily_limit             INT NOT NULL DEFAULT 3,
  custom_analysis_max_corpus              INT NOT NULL DEFAULT 5000,
  custom_analysis_min_n_for_nps           INT NOT NULL DEFAULT 30,

  -- Credits (per-run cost overrides; NULL = use platform defaults from CREDIT_COSTS)
  credit_cost_automated_checkpoint        INT CHECK (credit_cost_automated_checkpoint IS NULL OR (credit_cost_automated_checkpoint >= 1 AND credit_cost_automated_checkpoint <= 500)),
  credit_cost_automated_report            INT CHECK (credit_cost_automated_report IS NULL OR (credit_cost_automated_report >= 1 AND credit_cost_automated_report <= 500)),
  credit_cost_refresh                     INT CHECK (credit_cost_refresh IS NULL OR (credit_cost_refresh >= 1 AND credit_cost_refresh <= 500)),
  credit_cost_manual_quick                INT CHECK (credit_cost_manual_quick IS NULL OR (credit_cost_manual_quick >= 1 AND credit_cost_manual_quick <= 500)),
  credit_cost_manual_expert               INT CHECK (credit_cost_manual_expert IS NULL OR (credit_cost_manual_expert >= 1 AND credit_cost_manual_expert <= 500)),

  -- Retention
  automated_checkpoint_retention_days     INT NOT NULL DEFAULT 365,
  manual_report_retention_days            INT NOT NULL DEFAULT 730,
  collapse_similar_checkpoints            BOOLEAN NOT NULL DEFAULT TRUE,

  config_version                          INT NOT NULL DEFAULT 1,
  updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                              TEXT
);

CREATE INDEX IF NOT EXISTS idx_insight_settings_org
  ON survey_insight_settings (org_id);

-- ── org_insight_defaults (§13) ──────────────────────────────────────────────────
-- org_id PK as plain TEXT (no FK — there is no orgs table). All fields NULLABLE;
-- NULL means "use platform constant".
CREATE TABLE IF NOT EXISTS org_insight_defaults (
  org_id                          TEXT PRIMARY KEY,

  -- Automated
  automated_insights_enabled              BOOLEAN,
  automated_report_generation_enabled     BOOLEAN,
  stream_response_threshold               INT,
  prior_checkpoint_lookback               INT,

  -- Refresh
  refresh_lookback_days                   INT,
  refresh_min_response_count              INT,
  refresh_daily_limit                     INT,

  -- Manual
  manual_daily_run_limit                  INT,
  manual_expert_checkpoint_lookback       INT,
  manual_expert_full_corpus_cap           INT,
  manual_expert_max_corpus                INT,

  -- Custom Analysis
  custom_analysis_enabled                 BOOLEAN,
  custom_analysis_daily_limit             INT,

  -- Credit costs (per-org billing overrides)
  credit_cost_automated_checkpoint        INT CHECK (credit_cost_automated_checkpoint IS NULL OR (credit_cost_automated_checkpoint >= 1 AND credit_cost_automated_checkpoint <= 500)),
  credit_cost_automated_report            INT CHECK (credit_cost_automated_report IS NULL OR (credit_cost_automated_report >= 1 AND credit_cost_automated_report <= 500)),
  credit_cost_refresh                     INT CHECK (credit_cost_refresh IS NULL OR (credit_cost_refresh >= 1 AND credit_cost_refresh <= 500)),
  credit_cost_manual_quick                INT CHECK (credit_cost_manual_quick IS NULL OR (credit_cost_manual_quick >= 1 AND credit_cost_manual_quick <= 500)),
  credit_cost_manual_expert               INT CHECK (credit_cost_manual_expert IS NULL OR (credit_cost_manual_expert >= 1 AND credit_cost_manual_expert <= 500)),

  updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                              TEXT
);
