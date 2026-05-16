-- ── Migration: insights_v2 ─────────────────────────────────────────────────────
-- Adds time-windowed insights, survey topic registry, Crystal threads,
-- Redis stream offset tracking, and response embedding metadata.
-- All changes are idempotent (IF NOT EXISTS).

-- 1. Add time_window to insights table
ALTER TABLE insights ADD COLUMN IF NOT EXISTS time_window TEXT NOT NULL DEFAULT 'all_time';

-- Drop the old unique index (included only survey_id + insight_hash)
-- and replace with one that includes time_window.
-- Use a new name so we can drop the old one regardless of its current name.
DROP INDEX IF EXISTS insights_hash_idx;
DROP INDEX IF EXISTS insights_hash_unique;
CREATE UNIQUE INDEX IF NOT EXISTS insights_hash_window_unique
  ON insights(survey_id, insight_hash, time_window);

-- 2. Survey topic registry — canonical topics per survey per run
CREATE TABLE IF NOT EXISTS survey_topics (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id        UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id           TEXT        NOT NULL,
  run_id           UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
  time_window      TEXT        NOT NULL DEFAULT 'all_time',
  name             TEXT        NOT NULL,
  aliases          TEXT[]      NOT NULL DEFAULT '{}',
  is_new           BOOLEAN     NOT NULL DEFAULT FALSE,
  volume           INT         NOT NULL DEFAULT 0,
  sentiment_score  NUMERIC(4,3),          -- -1.000 to 1.000
  dominant_emotion TEXT,
  effort_score     NUMERIC(4,2),          -- 1.00 to 7.00 (like CES)
  trending         TEXT        CHECK (trending IN ('up','down','stable','new')),
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS survey_topics_survey_org
  ON survey_topics(survey_id, org_id);
CREATE INDEX IF NOT EXISTS survey_topics_org_window
  ON survey_topics(org_id, time_window);

-- 3. Crystal AI conversation threads
CREATE TABLE IF NOT EXISTS crystal_threads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT        NOT NULL,
  survey_id        UUID        REFERENCES surveys(id) ON DELETE CASCADE,
  thread_key       TEXT        NOT NULL,
  messages         JSONB       NOT NULL DEFAULT '[]',
  context_snapshot JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS crystal_threads_key
  ON crystal_threads(thread_key);
CREATE INDEX IF NOT EXISTS crystal_threads_org
  ON crystal_threads(org_id);

-- 4. Redis stream consumer offsets (for recovery after restart)
CREATE TABLE IF NOT EXISTS insight_stream_offsets (
  consumer_name TEXT        PRIMARY KEY,
  last_id       TEXT        NOT NULL DEFAULT '0-0',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Enrich response_embeddings with embedding timestamp
ALTER TABLE response_embeddings ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ DEFAULT NOW();

-- 6. Add effort_score and response_trend to agent_runs (for analytics)
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS insight_window TEXT DEFAULT 'all_time';

-- 7. Ensure pgvector extension (may already exist)
CREATE EXTENSION IF NOT EXISTS vector;

-- 8. Ensure IVFFlat index on response_embeddings (may already exist, safe to recreate)
CREATE INDEX IF NOT EXISTS response_embeddings_embedding_ivfflat
  ON response_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
