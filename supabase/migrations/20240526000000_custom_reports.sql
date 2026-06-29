-- ── Migration: custom_reports + custom_report_insights (Phase 1+) ───────────────
-- Custom Analysis surface — fully isolated from the main insight pipeline. Rows
-- here NEVER appear in the insights table. See §10 / §11.
-- org_id TEXT (no FK); surveys(id) ON DELETE CASCADE; agent_runs(id).

CREATE TABLE IF NOT EXISTS custom_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT        NOT NULL,
  survey_id        UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  created_by       TEXT        NOT NULL,
  name             TEXT        NOT NULL,

  -- Filter spec: the exact parameters that produced this analysis
  filter_spec      JSONB       NOT NULL,

  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  run_id           UUID        REFERENCES agent_runs(id),

  -- Output
  blob_ref         TEXT,
  output_url       TEXT,
  slug             TEXT        UNIQUE,

  -- Quality metadata
  credit_cost          INT         NOT NULL DEFAULT 0,
  corpus_coverage_pct  NUMERIC(5,2),
  sample_size          INT,
  trust_score_avg      NUMERIC(4,1),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_custom_reports_org_survey
  ON custom_reports (org_id, survey_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_reports_run
  ON custom_reports (run_id);

-- ── custom_report_insights (§11) ─────────────────────────────────────────────────
-- Parallel to insights, scoped to a custom_report_id. Immutable; never superseded.
CREATE TABLE IF NOT EXISTS custom_report_insights (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_report_id UUID        NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
  org_id           TEXT        NOT NULL,
  survey_id        UUID        NOT NULL,

  -- Same schema as insights table (mirrors layer/category/headline contract)
  layer            TEXT        NOT NULL CHECK (layer IN ('descriptive','diagnostic','predictive','prescriptive')),
  category         TEXT        NOT NULL,
  headline         TEXT        NOT NULL,
  narrative        TEXT,
  metric_json      JSONB       NOT NULL DEFAULT '{}',
  citations_json   JSONB       NOT NULL DEFAULT '[]',
  trust_score      INT         NOT NULL DEFAULT 50,
  trust_json       JSONB       NOT NULL DEFAULT '{}',
  priority         NUMERIC(4,3),

  -- Filter context (always label insights with the filter that produced them)
  filter_label     TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_report_insights_report
  ON custom_report_insights (custom_report_id, priority DESC NULLS LAST);
