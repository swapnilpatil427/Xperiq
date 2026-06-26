-- Support System migration
-- Tables: support_docs, support_doc_sections, support_changelog,
--         support_known_issues, support_tickets, support_doc_gaps,
--         support_pipeline_events, support_admin_sessions

-- Enable pgvector (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- ── support_docs ──────────────────────────────────────────────────────────────
CREATE TABLE support_docs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                TEXT        NOT NULL,
  key                   TEXT        NOT NULL,
  title                 TEXT        NOT NULL,
  content               TEXT        NOT NULL,
  content_html          TEXT,
  embedding             vector(1536),
  category              TEXT        NOT NULL,
    -- 'guide' | 'api' | 'crystal' | 'feature' | 'changelog'
  source_type           TEXT        NOT NULL,
    -- 'manual' | 'route-extract' | 'skill-extract' | 'changelog' | 'tracker'
  source_ref            TEXT,
  quality_score         FLOAT,
  pipeline_status       TEXT        NOT NULL DEFAULT 'queued',
    -- queued|extracting|drafting|quality_check|auto_approved|pending_review|
    -- requires_annotation|rejected|publishing|live|stale
  reviewed_by           TEXT,
  reviewed_at           TIMESTAMPTZ,
  human_edited          BOOLEAN     NOT NULL DEFAULT FALSE,
  auto_approve_deadline TIMESTAMPTZ,
  published_at          TIMESTAMPTZ,
  stale_detected_at     TIMESTAMPTZ,
  version               INTEGER     NOT NULL DEFAULT 1,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(key, org_id)
);

-- HNSW index for fast ANN search
CREATE INDEX support_docs_embedding_idx
  ON support_docs USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX support_docs_pipeline_status_idx ON support_docs(pipeline_status) WHERE deleted_at IS NULL;
CREATE INDEX support_docs_category_idx ON support_docs(category) WHERE deleted_at IS NULL;

-- ── support_doc_sections ──────────────────────────────────────────────────────
CREATE TABLE support_doc_sections (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       UUID        NOT NULL REFERENCES support_docs(id) ON DELETE CASCADE,
  section_key  TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  human_locked BOOLEAN     NOT NULL DEFAULT FALSE,
  locked_by    TEXT,
  locked_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(doc_id, section_key)
);

-- ── support_changelog ─────────────────────────────────────────────────────────
CREATE TABLE support_changelog (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version     TEXT        NOT NULL,
  released_at TIMESTAMPTZ NOT NULL,
  summary     TEXT        NOT NULL,
  changes     JSONB       NOT NULL DEFAULT '[]',
  source_sha  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX support_changelog_version_idx ON support_changelog(version);

-- ── support_known_issues ──────────────────────────────────────────────────────
CREATE TABLE support_known_issues (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  severity          TEXT        NOT NULL DEFAULT 'medium',
    -- 'critical' | 'high' | 'medium' | 'low'
  status            TEXT        NOT NULL DEFAULT 'investigating',
    -- 'investigating' | 'identified' | 'monitoring' | 'resolved'
  affected_features TEXT[]      NOT NULL DEFAULT '{}',
  workaround        TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── support_tickets ───────────────────────────────────────────────────────────
CREATE TABLE support_tickets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT        NOT NULL,
  user_id          TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  description      TEXT        NOT NULL,
  crystal_context  JSONB       NOT NULL DEFAULT '{}',
  intent           TEXT,
  severity         TEXT        NOT NULL DEFAULT 'medium',
  status           TEXT        NOT NULL DEFAULT 'open',
    -- 'open' | 'in_progress' | 'resolved' | 'closed'
  resolution       TEXT,
  assigned_to      TEXT,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX support_tickets_org_idx    ON support_tickets(org_id);
CREATE INDEX support_tickets_status_idx ON support_tickets(status);

-- ── support_doc_gaps ──────────────────────────────────────────────────────────
CREATE TABLE support_doc_gaps (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT,
  user_id         TEXT,
  doc_id          UUID        REFERENCES support_docs(id),
  query           TEXT        NOT NULL,
  feedback_type   TEXT        NOT NULL,
    -- 'thumbs_down' | 'no_result' | 'manual'
  crystal_intent  TEXT,
  resolution      TEXT,
    -- 'doc_created' | 'doc_updated' | 'linked' | 'wont_fix'
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX support_doc_gaps_resolution_idx ON support_doc_gaps(resolution) WHERE resolved_at IS NULL;

-- ── support_pipeline_events ───────────────────────────────────────────────────
CREATE TABLE support_pipeline_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id     UUID        NOT NULL REFERENCES support_docs(id) ON DELETE CASCADE,
  event_type TEXT        NOT NULL,
    -- queued|extracting_started|draft_ready|quality_scored|auto_approved|
    -- submitted_for_review|requires_annotation|rejected|admin_approved|
    -- admin_edited|admin_rejected|published|stale_detected|regeneration_queued
  actor_type TEXT        NOT NULL DEFAULT 'system',
    -- 'system' | 'admin' | 'crystal'
  actor_id   TEXT,
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX support_pipeline_events_doc_idx
  ON support_pipeline_events(doc_id, created_at DESC);

-- ── support_admin_sessions ────────────────────────────────────────────────────
CREATE TABLE support_admin_sessions (
  user_id      TEXT        PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER support_docs_updated_at
  BEFORE UPDATE ON support_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER support_doc_sections_updated_at
  BEFORE UPDATE ON support_doc_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER support_known_issues_updated_at
  BEFORE UPDATE ON support_known_issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
