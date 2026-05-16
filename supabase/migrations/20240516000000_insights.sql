-- Experient AI Insights — Sprint 8
-- Tables: response_embeddings, insights (v2), insight_audit_log
-- Extends: agent_runs (adds insight_generation run_type)
-- Compatible with: Postgres 14+ with pgvector extension

-- ── pgvector extension ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Extend agent_runs run_type ────────────────────────────────────────────────
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_run_type_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_run_type_check
  CHECK (run_type IN ('survey_creation', 'insight_generation'));

-- ── Extend notifications type ─────────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'SURVEY_CREATED',
    'RECOMMENDATION_READY',
    'RUN_FAILED',
    'RUN_APPROVAL_NEEDED',
    'SURVEY_SAVED',
    'INSIGHTS_READY',
    'INSIGHT_ANOMALY'
  ));

-- ── Response embeddings ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS response_embeddings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID        NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  survey_id   UUID        NOT NULL REFERENCES surveys(id)   ON DELETE CASCADE,
  org_id      TEXT        NOT NULL,
  question_id TEXT        NOT NULL,
  text        TEXT        NOT NULL,
  embedding   vector(1536),                        -- text-embedding-3-large (or 3-small at 1536)
  language    TEXT        NOT NULL DEFAULT 'en',
  emotion     TEXT,                                -- GoEmotions label, precomputed
  aspect      TEXT,                                -- ABSA aspect, nullable
  sentiment   NUMERIC(3,2),                        -- -1.0 to 1.0, precomputed
  model       TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS response_embeddings_org_survey_idx
  ON response_embeddings(org_id, survey_id);
CREATE INDEX IF NOT EXISTS response_embeddings_emotion_idx
  ON response_embeddings(org_id, emotion) WHERE emotion IS NOT NULL;
-- IVFFlat index for ANN search (upgrade to HNSW at 10M+ vectors)
CREATE INDEX IF NOT EXISTS response_embeddings_embedding_idx
  ON response_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Drop old insights table (keeping data via soft-delete approach) ────────────
-- The original insights table had a simple schema; we replace it.
-- In production: migrate any existing rows to the new table first.
DROP TABLE IF EXISTS insights CASCADE;

-- ── Insights (v2) ─────────────────────────────────────────────────────────────

CREATE TABLE insights (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id        TEXT        NOT NULL,
  run_id        UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,

  -- Classification
  layer         TEXT        NOT NULL
                CHECK (layer IN ('descriptive','diagnostic','predictive','prescriptive')),
  category      TEXT        NOT NULL,              -- e.g. 'metric.nps', 'voice.topic', 'driver.key'
  question_type TEXT,                              -- nullable for cross-question insights
  segment_json  JSONB,                             -- nullable; segment selector

  -- The claim
  headline      TEXT        NOT NULL,
  narrative     TEXT        NOT NULL,              -- with [rXXXX] citation markers
  recommended_action JSONB,                        -- nullable; L4 only: {type, label, target}

  -- The numbers
  metric_json   JSONB,                             -- {name, value, ci_low, ci_high, unit, scale, ...}

  -- Grounding
  citations_json JSONB      NOT NULL DEFAULT '[]', -- [{response_id, quote, sentiment, relevance, emotion}]

  -- Trust
  trust_score   INT         NOT NULL
                CHECK (trust_score BETWEEN 0 AND 100),
  trust_json    JSONB       NOT NULL DEFAULT '{}', -- {statistical, coverage, consistency, grounding, sample_size, below_minimum_sample}
  priority      NUMERIC(6,4),                      -- 0..1, higher = more important

  -- Reproducibility / audit
  insight_hash  TEXT        NOT NULL,              -- sha256(survey_id+category+headline)[:32]
  audit_json    JSONB       NOT NULL DEFAULT '{}', -- {model, embedding_model, temperature, seed, verifier_pass, run_id, ...}

  -- User state (per-org, mutable)
  user_state_json JSONB     NOT NULL DEFAULT '{}', -- {pinned, dismissed, thumbs, notes}

  -- Lifecycle
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_by UUID        REFERENCES insights(id),
  superseded_at TIMESTAMPTZ
);

-- Active insights index (most reads)
CREATE INDEX insights_survey_active_idx
  ON insights(survey_id, priority DESC NULLS LAST, generated_at DESC)
  WHERE superseded_at IS NULL;

-- Org-level priority feed
CREATE INDEX insights_org_priority_idx
  ON insights(org_id, priority DESC NULLS LAST)
  WHERE superseded_at IS NULL;

-- Category filtering
CREATE INDEX insights_category_idx
  ON insights(org_id, category)
  WHERE superseded_at IS NULL;

-- Idempotency: same hash per survey = upsert, not insert
CREATE UNIQUE INDEX insights_hash_idx
  ON insights(survey_id, insight_hash);

-- ── Insight audit log (cold tier — long-form blobs) ───────────────────────────

CREATE TABLE insight_audit_log (
  insight_id        UUID    PRIMARY KEY REFERENCES insights(id) ON DELETE CASCADE,
  prompt_text       TEXT    NOT NULL,
  retrieved_context JSONB   NOT NULL DEFAULT '[]',
  llm_samples       JSONB   NOT NULL DEFAULT '[]',
  verifier_pass     BOOLEAN NOT NULL DEFAULT TRUE,
  verifier_notes    TEXT,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Insight job queue (Redis-backed in prod; Postgres fallback for local dev) ──

CREATE TABLE IF NOT EXISTS insight_jobs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id        TEXT        NOT NULL,
  trigger       TEXT        NOT NULL DEFAULT 'schedule'
                CHECK (trigger IN ('new_response', 'regenerate', 'schedule', 'stream')),
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  idempotency_key TEXT      UNIQUE,               -- sha256(survey_id+trigger+window)
  run_id        UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
  error_message TEXT,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

CREATE INDEX insight_jobs_pending_idx
  ON insight_jobs(scheduled_at) WHERE status = 'pending';
CREATE INDEX insight_jobs_org_idx
  ON insight_jobs(org_id, scheduled_at DESC);
