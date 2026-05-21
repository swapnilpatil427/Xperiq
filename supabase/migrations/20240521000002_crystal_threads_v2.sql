-- Reconcile crystal_threads with doc spec: TTL columns, message count, unique constraint
-- Adds user_id and scope (required for UPSERT semantics) plus TTL/counter columns.
ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'survey';
ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS storage_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days';
ALTER TABLE crystal_threads ADD COLUMN IF NOT EXISTS message_count INT NOT NULL DEFAULT 0;

-- Unique constraint for UPSERT semantics
ALTER TABLE crystal_threads
    DROP CONSTRAINT IF EXISTS uq_crystal_threads_scope;
ALTER TABLE crystal_threads
    ADD CONSTRAINT uq_crystal_threads_scope
    UNIQUE (org_id, user_id, survey_id, scope);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_crystal_threads_lookup
    ON crystal_threads (org_id, user_id, survey_id, scope);
