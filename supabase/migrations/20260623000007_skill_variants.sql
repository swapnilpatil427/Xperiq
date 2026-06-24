-- Skill A/B testing support: variant tracking columns

-- Add skill_variant to crystal_turn_events
ALTER TABLE crystal_turn_events
    ADD COLUMN IF NOT EXISTS skill_variant TEXT;

-- Add variant columns to skill_quality_metrics (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'skill_quality_metrics') THEN
        ALTER TABLE skill_quality_metrics ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'default';
        ALTER TABLE skill_quality_metrics ADD COLUMN IF NOT EXISTS rollout_pct INT DEFAULT 100;
    END IF;
END
$$;

-- Add embedding column to skill_examples for diversity control
ALTER TABLE skill_examples
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS skill_examples_embedding_hnsw_idx
    ON skill_examples USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Skill example refresh log
CREATE TABLE IF NOT EXISTS skill_example_refreshes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name      TEXT NOT NULL,
    examples_before INT  NOT NULL DEFAULT 0,
    examples_after  INT  NOT NULL DEFAULT 0,
    removed_count   INT  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skill_example_refreshes_skill_idx ON skill_example_refreshes (skill_name, created_at DESC);

-- Feedback hourly rollups (created by 20260623000006; re-declared here as IF NOT EXISTS for safety)
CREATE TABLE IF NOT EXISTS feedback_hourly_rollups (
    hour            TIMESTAMPTZ NOT NULL,
    org_id          TEXT        NOT NULL,
    brand_id        TEXT        NOT NULL DEFAULT '',
    skill_name      TEXT        NOT NULL DEFAULT '',
    total_turns     INT         NOT NULL DEFAULT 0,
    positive_count  INT         NOT NULL DEFAULT 0,
    negative_count  INT         NOT NULL DEFAULT 0,
    avg_eval_score  DECIMAL(4,3),
    p50_latency_ms  INT,
    PRIMARY KEY (hour, org_id, brand_id, skill_name)
);

CREATE INDEX IF NOT EXISTS feedback_hourly_rollups_hour_idx ON feedback_hourly_rollups (hour DESC);

-- Quality SLA configuration
CREATE TABLE IF NOT EXISTS quality_sla_configs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id            TEXT        NOT NULL UNIQUE,
    positive_rate_min   DECIMAL(4,3) NOT NULL DEFAULT 0.700,
    avg_eval_score_min  DECIMAL(4,3) NOT NULL DEFAULT 0.750,
    measurement_window  INTERVAL    NOT NULL DEFAULT '7 days',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quality SLA breaches
CREATE TABLE IF NOT EXISTS quality_sla_breaches (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        TEXT        NOT NULL,
    breach_type     TEXT        NOT NULL, -- 'positive_rate' | 'eval_score'
    measured_value  DECIMAL(4,3),
    threshold_value DECIMAL(4,3),
    window_start    TIMESTAMPTZ,
    window_end      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quality_sla_breaches_brand_idx ON quality_sla_breaches (brand_id, created_at DESC);

-- Crystal debug traces
CREATE TABLE IF NOT EXISTS crystal_debug_traces (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_event_id   UUID,
    org_id          TEXT,
    brand_id        TEXT,
    trace           JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crystal_debug_traces_org_idx ON crystal_debug_traces (org_id, created_at DESC);
