-- Incremental topic clustering — pgvector-based centroid registry
--
-- Replaces the O(n²) Python greedy cosine loop with:
--   1. survey_topic_centroids  — running-mean embedding per topic (Welford update)
--   2. topic_candidates        — buffer of unassigned responses that may form new topics
--   3. topic_windows           — weekly rolling health metrics per topic
--
-- Prerequisites: pgvector extension (already enabled in 20240516000000_insights.sql)

CREATE EXTENSION IF NOT EXISTS vector;

-- ── survey_topic_centroids ────────────────────────────────────────────────────
-- One row per canonical topic per survey. Stores the running-mean centroid so
-- every incremental run does one ANN lookup per new response instead of
-- re-clustering all responses from scratch.
CREATE TABLE IF NOT EXISTS survey_topic_centroids (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id          TEXT         NOT NULL,
    topic_id        UUID         REFERENCES survey_topics(id) ON DELETE SET NULL,
    topic_name      TEXT         NOT NULL,
    centroid        vector(1536) NOT NULL,
    response_count  INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (survey_id, topic_name)
);

-- Exact lookup when updating centroids
CREATE INDEX IF NOT EXISTS survey_topic_centroids_survey_idx
    ON survey_topic_centroids (survey_id);

-- HNSW ANN index — works efficiently at any table size (IVFFlat requires
-- 390+ rows for lists=10; most surveys have 5–20 topics and would fall back
-- to a sequential scan). m=16/ef_construction=64 is the standard balanced preset.
DROP INDEX IF EXISTS survey_topic_centroids_ivfflat_idx;
CREATE INDEX IF NOT EXISTS survey_topic_centroids_hnsw_idx
    ON survey_topic_centroids USING hnsw (centroid vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ── topic_candidates ──────────────────────────────────────────────────────────
-- Buffer for new responses that didn't match any existing topic centroid closely
-- enough (cosine similarity < 0.72). When the buffer for a survey reaches the
-- flush threshold (max(5, total_responses × 0.03)), mini-clustering fires on
-- the candidates only to detect new emerging topics.
CREATE TABLE IF NOT EXISTS topic_candidates (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id   UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id      TEXT         NOT NULL,
    response_id UUID         NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    embedding   vector(1536) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (survey_id, response_id)
);

CREATE INDEX IF NOT EXISTS topic_candidates_survey_idx
    ON topic_candidates (survey_id, created_at);

-- ── topic_windows ──────────────────────────────────────────────────────────────
-- Rolling weekly health snapshots per topic. The agent writes one row per topic
-- per calendar week so the frontend can show trend signals (emerging / growing /
-- worsening / fading / stable) without running analytics queries at read time.
CREATE TABLE IF NOT EXISTS topic_windows (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id           UUID        NOT NULL,
    org_id              TEXT        NOT NULL,
    topic_id            UUID        NOT NULL REFERENCES survey_topics(id) ON DELETE CASCADE,
    window_start        TIMESTAMPTZ NOT NULL,
    window_end          TIMESTAMPTZ NOT NULL,
    response_count      INTEGER     NOT NULL DEFAULT 0,
    avg_sentiment_score FLOAT,
    avg_nps             FLOAT,
    health_label        TEXT        CHECK (health_label IN ('emerging','growing','worsening','fading','stable')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS topic_windows_topic_window_idx
    ON topic_windows (topic_id, window_start);

CREATE INDEX IF NOT EXISTS topic_windows_survey_idx
    ON topic_windows (survey_id, topic_id, window_start DESC);

-- ── health_label on survey_topics ─────────────────────────────────────────────
-- Denormalized convenience column — updated from topic_windows by the pipeline.
-- Lets the API return health labels without a join.
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS health_label TEXT
    CHECK (health_label IN ('emerging','growing','worsening','fading','stable'));

-- ── Unique constraint for ON CONFLICT upsert ──────────────────────────────────
-- Required by upsert_survey_topics() INSERT ... ON CONFLICT (survey_id, name, time_window).
-- Without this index the ON CONFLICT clause raises "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification".
CREATE UNIQUE INDEX IF NOT EXISTS survey_topics_survey_name_window_unique
    ON survey_topics (survey_id, name, time_window);
