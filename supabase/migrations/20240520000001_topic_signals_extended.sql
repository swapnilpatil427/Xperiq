-- XM-grade per-topic signal columns
-- Adds extended analytics fingerprint to survey_topics and topic_windows.
-- All columns are nullable (safe to add to existing rows).

-- survey_topics additions
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS net_sentiment        FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS nps_impact           FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS promoter_pct         FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS detractor_pct        FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS passive_pct          FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS urgency_score        FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS driver_score         FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS velocity_pct         FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS avg_csat             FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS csat_impact          FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS confidence_level     TEXT CHECK (confidence_level IN ('low','medium','high'));
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS avg_effort_score     FLOAT;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS top_verbatims        JSONB DEFAULT '[]'::jsonb;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS emotion_distribution JSONB DEFAULT '{}'::jsonb;

-- topic_windows additions
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS net_sentiment        FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS nps_impact           FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS promoter_pct         FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS detractor_pct        FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS passive_pct          FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS urgency_score        FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS driver_score         FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS velocity_pct         FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS avg_csat             FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS csat_impact          FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS avg_effort_score     FLOAT;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS emotion_distribution JSONB DEFAULT '{}'::jsonb;
ALTER TABLE topic_windows ADD COLUMN IF NOT EXISTS top_verbatims        JSONB DEFAULT '[]'::jsonb;
