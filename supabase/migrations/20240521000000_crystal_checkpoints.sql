-- Crystal Intelligence checkpoint blobs for point-in-time report snapshots
CREATE TABLE IF NOT EXISTS survey_insight_checkpoints (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id                   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id                      TEXT NOT NULL,
    checkpoint_number           INT NOT NULL DEFAULT 1,
    trigger                     TEXT NOT NULL CHECK (trigger IN ('responses', 'days', 'manual', 'stream')),
    response_count_at_checkpoint INT NOT NULL DEFAULT 0,
    nps_at_checkpoint           NUMERIC(5,1),
    csat_at_checkpoint          NUMERIC(5,1),
    ces_at_checkpoint           NUMERIC(5,1),
    topic_fingerprint           TEXT,
    delta_from_prior            JSONB,
    report_url                  TEXT,
    schema_version              INT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_survey_org_number
    ON survey_insight_checkpoints (survey_id, org_id, checkpoint_number DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoints_org_survey_created
    ON survey_insight_checkpoints (org_id, survey_id, created_at DESC);

-- ── Phase 0.5 additions ─────────────────────────────────────────────────────────
-- node_delta_compute writes delta_from_prior (already present above); node_publish
-- writes meaningful_delta. Both guarded with IF NOT EXISTS so this file remains
-- idempotent across DBs that already have the base table.
ALTER TABLE survey_insight_checkpoints
    ADD COLUMN IF NOT EXISTS delta_from_prior JSONB;
ALTER TABLE survey_insight_checkpoints
    ADD COLUMN IF NOT EXISTS meaningful_delta BOOLEAN NOT NULL DEFAULT FALSE;

-- Widen the trigger CHECK to allow scheduler + milestone triggers. The base
-- constraint was created inline (NOT NULL CHECK (...)). Drop the auto-named
-- constraint and re-add a deterministically-named one so this is re-runnable.
ALTER TABLE survey_insight_checkpoints
    DROP CONSTRAINT IF EXISTS survey_insight_checkpoints_trigger_check;
ALTER TABLE survey_insight_checkpoints
    ADD CONSTRAINT survey_insight_checkpoints_trigger_check
    CHECK (trigger IN ('responses', 'days', 'manual', 'stream', 'scheduler', 'milestone'));

-- One checkpoint per number per (survey, org). The earlier index above is
-- non-unique (it includes a DESC sort for list reads); this adds the uniqueness
-- invariant the v2 backfill relies on.
CREATE UNIQUE INDEX IF NOT EXISTS survey_insight_checkpoints_survey_num_unique
    ON survey_insight_checkpoints (survey_id, org_id, checkpoint_number);

-- ── Insight Pipeline v2 — Phase 4 (insight_checkpoints_v2) ─────────────────────
-- Linked-list checkpoint store with parent chain, lane separation, and full
-- lineage JSON. Supersedes survey_insight_checkpoints for new pipeline runs;
-- legacy table kept for backward-compat reads.
CREATE TABLE IF NOT EXISTS insight_checkpoints_v2 (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id                   UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id                      TEXT        NOT NULL,
    run_id                      UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
    checkpoint_number           INT         NOT NULL DEFAULT 1,
    parent_checkpoint_id        UUID        REFERENCES insight_checkpoints_v2(id) ON DELETE SET NULL,
    lane                        TEXT        NOT NULL DEFAULT 'automated',
    run_mode                    TEXT,
    trigger                     TEXT,
    created_by                  TEXT,
    response_count_at_checkpoint INT        NOT NULL DEFAULT 0,
    response_high_watermark     TIMESTAMPTZ,
    new_response_count          INT         NOT NULL DEFAULT 0,
    nps_at_checkpoint           NUMERIC(5,1),
    csat_at_checkpoint          NUMERIC(5,1),
    ces_at_checkpoint           NUMERIC(5,1),
    topic_fingerprint           TEXT,
    delta_from_prior            JSONB,
    meaningful_delta            BOOLEAN     NOT NULL DEFAULT FALSE,
    lineage_json                JSONB,
    report_blob_ref             TEXT,
    citations_manifest_ref      TEXT,
    schema_version              INT         NOT NULL DEFAULT 2,
    window_start                TIMESTAMPTZ,
    window_end                  TIMESTAMPTZ,
    report_label                TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS insight_checkpoints_v2_survey_org
    ON insight_checkpoints_v2 (survey_id, org_id, checkpoint_number DESC);

CREATE INDEX IF NOT EXISTS insight_checkpoints_v2_parent
    ON insight_checkpoints_v2 (parent_checkpoint_id) WHERE parent_checkpoint_id IS NOT NULL;

-- ── Insight Pipeline v2 — Phase 3 (insight_reports) ────────────────────────────
-- Manual insight run documents. Never supersede automated insights.
CREATE TABLE IF NOT EXISTS insight_reports (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id                UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id                   TEXT        NOT NULL,
    run_id                   UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
    run_mode                 TEXT,
    label                    TEXT,
    status                   TEXT        NOT NULL DEFAULT 'generating',
    window_start             TIMESTAMPTZ,
    window_end               TIMESTAMPTZ,
    blob_ref                 TEXT,
    citations_manifest_ref   TEXT,
    summary_headline         TEXT,
    trust_score_avg          NUMERIC(5,2),
    checkpoint_id            UUID,
    created_by               TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS insight_reports_survey_org
    ON insight_reports (survey_id, org_id, created_at DESC);

-- ── Custom Analysis — Phase 6 (custom_reports + custom_report_insights) ─────────
-- Fully isolated from the main insights pipeline. Never writes to the insights table.
CREATE TABLE IF NOT EXISTS custom_reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id           UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id              TEXT        NOT NULL,
    run_id              UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
    name                TEXT,
    filter_spec         JSONB,
    status              TEXT        NOT NULL DEFAULT 'pending',
    blob_ref            TEXT,
    output_url          TEXT,
    slug                TEXT,
    credit_cost         INT,
    trust_score_avg     NUMERIC(5,2),
    corpus_coverage_pct NUMERIC(5,2),
    sample_size         INT,
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS custom_reports_survey_org
    ON custom_reports (survey_id, org_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS custom_reports_slug_unique
    ON custom_reports (org_id, slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS custom_report_insights (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    custom_report_id UUID        NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
    survey_id        UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id           TEXT        NOT NULL,
    layer            TEXT,
    category         TEXT,
    headline         TEXT        NOT NULL DEFAULT '',
    narrative        TEXT,
    metric_json      JSONB,
    citations_json   JSONB       NOT NULL DEFAULT '[]',
    trust_score      NUMERIC(5,2),
    trust_json       JSONB,
    priority         INT,
    filter_label     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_report_insights_report
    ON custom_report_insights (custom_report_id);

-- ── Idempotent fixup: ensure correct column names after any earlier schema runs ──
-- custom_reports: rename report_blob_ref → blob_ref, add missing cols
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='custom_reports' AND column_name='report_blob_ref'
    ) THEN
        ALTER TABLE custom_reports RENAME COLUMN report_blob_ref TO blob_ref;
    END IF;
END $$;
ALTER TABLE custom_reports ADD COLUMN IF NOT EXISTS blob_ref TEXT;
ALTER TABLE custom_reports ADD COLUMN IF NOT EXISTS output_url TEXT;
ALTER TABLE custom_reports ADD COLUMN IF NOT EXISTS credit_cost INT;
ALTER TABLE custom_reports ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- insight_reports: rename report_blob_ref → blob_ref
-- Handles the case where the table was created before this rename was applied.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='insight_reports' AND column_name='report_blob_ref'
    ) THEN
        ALTER TABLE insight_reports RENAME COLUMN report_blob_ref TO blob_ref;
    END IF;
END $$;
ALTER TABLE insight_reports ADD COLUMN IF NOT EXISTS citations_manifest_ref TEXT;
ALTER TABLE insight_reports ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
