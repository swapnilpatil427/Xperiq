-- Migration: surveys_v2
-- Adds all columns managed by backend/src/routes/local/surveys.js ensureColumns()
-- plus insight_schedule_enabled, so GCP migrations stay complete.
-- All additions use IF NOT EXISTS for idempotency.

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS template_id               TEXT,
  ADD COLUMN IF NOT EXISTS intent                    TEXT,
  ADD COLUMN IF NOT EXISTS thank_you_message         TEXT,
  ADD COLUMN IF NOT EXISTS updated_by                TEXT,
  ADD COLUMN IF NOT EXISTS published_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insight_schedule_enabled  BOOLEAN NOT NULL DEFAULT TRUE;

-- Expand status CHECK constraint to include 'closed'.
DO $$
BEGIN
  ALTER TABLE surveys DROP CONSTRAINT IF EXISTS surveys_status_check;
  ALTER TABLE surveys ADD CONSTRAINT surveys_status_check
    CHECK (status IN ('draft','active','paused','closed'));
EXCEPTION WHEN others THEN NULL;
END$$;

-- Partial index to speed up soft-delete filtering.
CREATE INDEX IF NOT EXISTS surveys_deleted_at ON surveys(deleted_at) WHERE deleted_at IS NULL;
