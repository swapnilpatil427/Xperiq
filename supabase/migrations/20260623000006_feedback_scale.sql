-- Feedback tracking at scale: hourly rollups, quality SLAs, cross-org learning, signal clustering
-- Phase 6: Feedback Tracking at Scale (ENTERPRISE_CRYSTALOS_REDESIGN.md Part XVI)

-- pgvector extension (idempotent — already enabled for survey_topic_centroids)
CREATE EXTENSION IF NOT EXISTS vector;

-- Hourly feedback rollups (partitioned by range on hour column)
-- Note: partitioned tables require explicit partition creation; this sets up the parent.
-- brand_id='' and skill_name='' serve as null sentinels so we can use a plain composite PK.
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
) PARTITION BY RANGE (hour);

-- Create a default catch-all partition covering the range from 2026 onwards
-- (monthly partitions should be auto-created by the scheduler in production)
CREATE TABLE IF NOT EXISTS feedback_hourly_rollups_2026
    PARTITION OF feedback_hourly_rollups
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE INDEX IF NOT EXISTS fhr_org_hour_idx ON feedback_hourly_rollups (org_id, hour DESC);
CREATE INDEX IF NOT EXISTS fhr_brand_idx    ON feedback_hourly_rollups (brand_id, hour DESC) WHERE brand_id != '';

-- Quality SLA configs per brand
CREATE TABLE IF NOT EXISTS quality_sla_configs (
    brand_id            TEXT         PRIMARY KEY,
    positive_rate_min   DECIMAL(4,3) NOT NULL DEFAULT 0.70,
    avg_eval_score_min  DECIMAL(4,3) NOT NULL DEFAULT 0.72,
    measurement_window  INTERVAL     NOT NULL DEFAULT '7 days',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Quality SLA breach log
CREATE TABLE IF NOT EXISTS quality_sla_breaches (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        TEXT        NOT NULL,
    breach_type     TEXT        NOT NULL,
    measured_value  DECIMAL(4,3),
    threshold_value DECIMAL(4,3),
    window_start    TIMESTAMPTZ,
    window_end      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quality_sla_breaches_brand_idx ON quality_sla_breaches (brand_id, created_at DESC);

-- Product signal clusters (semantic grouping of similar signals)
-- cluster_embedding: vector(384) for sentence-transformer models (smaller + faster than 1536)
CREATE TABLE IF NOT EXISTS product_signal_clusters (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type      TEXT         NOT NULL CHECK (signal_type IN ('feature_request', 'bug', 'complaint', 'praise')),
    brand_id         TEXT,
    centroid_label   TEXT         NOT NULL,
    cluster_embedding vector(384),
    signal_count     INT          NOT NULL DEFAULT 0,
    vote_total       INT          NOT NULL DEFAULT 0,
    top_affects      TEXT,        -- most-cited affects_feature in this cluster
    status           TEXT         NOT NULL DEFAULT 'open',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS psc_signal_type_idx ON product_signal_clusters (signal_type, status);
CREATE INDEX IF NOT EXISTS psc_brand_idx        ON product_signal_clusters (brand_id) WHERE brand_id IS NOT NULL;
-- HNSW index for nearest-neighbour cluster lookup
CREATE INDEX IF NOT EXISTS psc_hnsw_idx
    ON product_signal_clusters USING hnsw (cluster_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE cluster_embedding IS NOT NULL;

-- Which signals belong to which cluster
CREATE TABLE IF NOT EXISTS product_signal_cluster_members (
    cluster_id UUID NOT NULL REFERENCES product_signal_clusters(id) ON DELETE CASCADE,
    signal_id  UUID NOT NULL REFERENCES crystal_product_signals(id) ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cluster_id, signal_id)
);

-- Users watching a signal cluster for updates
CREATE TABLE IF NOT EXISTS product_signal_watchers (
    cluster_id UUID NOT NULL REFERENCES product_signal_clusters(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    org_id     TEXT NOT NULL,
    watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cluster_id, user_id)
);

-- Webhook configs for external notification when a signal cluster is updated
CREATE TABLE IF NOT EXISTS product_signal_webhook_configs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id   TEXT        NOT NULL,
    url        TEXT        NOT NULL,
    secret     TEXT,
    events     TEXT[]      NOT NULL DEFAULT '{"cluster_updated","cluster_resolved"}',
    active     BOOL        NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pswc_brand_idx ON product_signal_webhook_configs (brand_id) WHERE active = true;

-- Anonymized global skill examples (cross-org learning with privacy)
CREATE TABLE IF NOT EXISTS skill_examples_global (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name   TEXT         NOT NULL,
    org_id_hash  TEXT         NOT NULL,  -- sha256 of org_id — one-way, cannot be reversed
    input        TEXT         NOT NULL,
    output       TEXT         NOT NULL,
    eval_score   DECIMAL(4,3),
    embedding    vector(1536),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seg_skill_idx ON skill_examples_global (skill_name);
CREATE INDEX IF NOT EXISTS seg_hnsw_idx
    ON skill_examples_global USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;
