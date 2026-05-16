-- Response enrichment: metadata capture + per-response AI signals + topic hierarchy
-- All changes are idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)

-- ── Response metadata (captured at submission time) ───────────────────────────
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ip_address         TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS user_agent         TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS country            TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS city               TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS device_type        TEXT;   -- 'mobile' | 'tablet' | 'desktop' | 'bot'
ALTER TABLE responses ADD COLUMN IF NOT EXISTS browser            TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS os                 TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS referrer           TEXT;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS completion_time_s  INT;    -- seconds from survey open to submit

-- ── Per-response AI signals (written by insight pipeline; zero extra LLM cost) ─
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ai_sentiment        TEXT;           -- 'positive' | 'negative' | 'neutral'
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ai_sentiment_score  NUMERIC(3,2);   -- -1.00 to 1.00
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ai_emotion          TEXT;           -- GoEmotions label
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ai_effort_score     NUMERIC(3,1);   -- 1.0 – 7.0
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ai_topics           JSONB;          -- ["Topic A", "Topic B"]
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ai_enriched_at      TIMESTAMPTZ;

-- Indexes for dashboard cross-filter queries
CREATE INDEX IF NOT EXISTS responses_country_idx    ON responses(survey_id, country)      WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS responses_device_idx     ON responses(survey_id, device_type)  WHERE device_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS responses_sentiment_idx  ON responses(survey_id, ai_sentiment) WHERE ai_sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS responses_ai_topics_idx  ON responses USING GIN (ai_topics)    WHERE ai_topics IS NOT NULL;

-- ── Topic hierarchy columns ───────────────────────────────────────────────────
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS parent_topic_id  UUID REFERENCES survey_topics(id) ON DELETE SET NULL;
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS hierarchy_level   INT  NOT NULL DEFAULT 0;  -- 0=root, 1=sub-topic
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS sub_topic_count   INT  NOT NULL DEFAULT 0;

-- ── Per-topic signal breakdown (computed during pipeline write-back) ───────────
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS nps_avg            NUMERIC(5,1);  -- avg NPS of responses in topic
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS positive_pct       NUMERIC(5,2);  -- % positive sentiment
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS negative_pct       NUMERIC(5,2);  -- % negative sentiment
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS neutral_pct        NUMERIC(5,2);  -- % neutral sentiment
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS avg_response_len   INT;           -- avg word count of texts
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS emotion_breakdown  JSONB;         -- {"joy": 12, "frustration": 8, ...}
ALTER TABLE survey_topics ADD COLUMN IF NOT EXISTS sample_response_ids JSONB;        -- first 5 response UUIDs

-- Hierarchy indexes
CREATE INDEX IF NOT EXISTS survey_topics_parent_idx    ON survey_topics(parent_topic_id) WHERE parent_topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS survey_topics_hierarchy_idx ON survey_topics(survey_id, hierarchy_level);
