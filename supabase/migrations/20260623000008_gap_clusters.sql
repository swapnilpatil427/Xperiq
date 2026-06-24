CREATE TABLE IF NOT EXISTS capability_gap_clusters (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_label   TEXT    NOT NULL,
    query_count     INT     DEFAULT 0,
    sample_queries  TEXT[]  DEFAULT '{}',
    best_match_skill TEXT,
    best_match_score DECIMAL(4,3),
    week            DATE    NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS capability_gap_clusters_week_idx ON capability_gap_clusters (week DESC);
