-- L4 Org Memory: cross-session facts for Crystal Intelligence
-- G24 fix: user_id + scope columns separate user-scoped from org-scoped preferences.
--          User A's "bullet points" preference no longer applies to User B.
-- G18 fix: embedding_model column prevents silent corruption when embedding model is upgraded.

CREATE TABLE IF NOT EXISTS crystal_org_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL,
    user_id         UUID,              -- NULL = org-scoped fact; set = user-scoped fact
    scope           TEXT NOT NULL DEFAULT 'org'
                        CHECK (scope IN ('org', 'user')),
    memory_type     TEXT NOT NULL
                        CHECK (memory_type IN ('preference', 'decision', 'context', 'survey_link')),
    fact            TEXT NOT NULL,
    source_thread   TEXT,              -- crystal_threads.id that created this fact
    -- G18: embedding model stored alongside vector to detect model drift on upgrade
    embedding       vector(1536),      -- NULL until embedding service wired; pgvector optional
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    confidence      FLOAT NOT NULL DEFAULT 1.0
                        CHECK (confidence >= 0 AND confidence <= 1),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ        -- NULL = permanent; set for time-sensitive facts
);

-- Primary lookup: by org + user + scope
CREATE INDEX IF NOT EXISTS idx_crystal_org_memory_org_user
    ON crystal_org_memory (org_id, user_id, scope);

-- TTL sweep: find and prune expired facts
CREATE INDEX IF NOT EXISTS idx_crystal_org_memory_expires
    ON crystal_org_memory (expires_at)
    WHERE expires_at IS NOT NULL;

-- Note: pgvector HNSW/IVFFlat index is added separately after pgvector extension confirmed.
-- The memory layer gracefully degrades to recency-based lookup if pgvector is unavailable.

COMMENT ON TABLE crystal_org_memory IS
    'L4 org memory layer for Crystal Intelligence. Persists facts across sessions '
    'per org and per user. G16 fix: written by background sweep (not on disconnect). '
    'G24 fix: user_id + scope separates user preferences from org-level decisions.';

COMMENT ON COLUMN crystal_org_memory.user_id IS
    'NULL = org-scoped fact (applies to all users). '
    'Set = user-scoped fact (applies only to this user in this org).';
