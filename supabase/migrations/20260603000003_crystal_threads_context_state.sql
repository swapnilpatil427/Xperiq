-- L2 Thread Compression support columns for crystal_threads
-- G4 fix: context_state replaces full message history in LLM context (5k tokens → ~200 tokens)
-- G8 fix: turn_count enables compression trigger logic
-- G15 fix: decision supersession logic lives in MemoryManager._compress_messages()
-- G23 fix: context injection order is enforced by MemoryManager.build_context_blocks()

ALTER TABLE crystal_threads
    ADD COLUMN IF NOT EXISTS context_state            JSONB,
    ADD COLUMN IF NOT EXISTS context_state_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS turn_count               INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_active_at           TIMESTAMPTZ DEFAULT now();

-- Index for background sweep (G16 fix: sweep finds stale threads)
CREATE INDEX IF NOT EXISTS idx_crystal_threads_last_active
    ON crystal_threads (last_active_at DESC);

-- Index for org-level queries (sweep needs to find threads by org)
CREATE INDEX IF NOT EXISTS idx_crystal_threads_org_last_active
    ON crystal_threads (org_id, last_active_at DESC)
    WHERE last_active_at IS NOT NULL;

COMMENT ON COLUMN crystal_threads.context_state IS
    'L2 compressed context: structured JSON with decisions, data_retrieved, user_preferences. '
    'Schema version 2. Compression runs at turn 5, every 3 turns after. '
    'Full messages array kept for audit; context_state used for LLM injection.';

COMMENT ON COLUMN crystal_threads.turn_count IS
    'Number of complete turns (1 user + 1 assistant = 1 turn). '
    'Used by MemoryManager.should_compress() to trigger L2 compression.';

COMMENT ON COLUMN crystal_threads.last_active_at IS
    'Timestamp of last Crystal interaction in this thread. '
    'Used by L4 background sweep to find inactive threads for org memory extraction. '
    'G16 fix: replaces the write-on-disconnect approach (no disconnect event in HTTP/SSE).';
