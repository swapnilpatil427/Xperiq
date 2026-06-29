-- ── Migration: indexes for Crystal tools (Phase 1+) ─────────────────────────────
-- Supports "responses since watermark" reads (get_checkpoint_chain / incremental
-- ingest). See §14.
--
-- NOTE on column choice: §14 in the data-model doc writes this index against
-- responses(survey_id, created_at) WHERE deleted_at IS NULL. The actual responses
-- table (migrations 20240101000000_initial.sql / 20240519000000_response_enrichment.sql)
-- has NEITHER a created_at NOR a deleted_at column. The submission timestamp column
-- is submitted_at, and responses are hard-deleted via ON DELETE CASCADE from
-- surveys (no soft-delete flag). The index therefore uses submitted_at and omits
-- the deleted_at predicate so the migration applies cleanly.

CREATE INDEX IF NOT EXISTS idx_responses_survey_created
  ON responses (survey_id, submitted_at);
