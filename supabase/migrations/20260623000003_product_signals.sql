-- Product Signals: feature requests and bug reports captured from Crystal conversations
-- These are automatically extracted from conversations and routed to the appropriate team.

CREATE TABLE crystal_product_signals (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type      TEXT NOT NULL CHECK (signal_type IN ('feature_request', 'bug', 'complaint', 'praise')),
    org_id           TEXT NOT NULL,
    brand_id         TEXT,
    user_id          TEXT NOT NULL,
    survey_id        TEXT,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL,
    affects_feature  TEXT,                   -- which product area this affects
    severity         TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    routing          TEXT NOT NULL CHECK (routing IN ('platform', 'brand')),
    brand_ticket_url TEXT,                   -- URL if routed to brand's own support system
    status           TEXT DEFAULT 'open',    -- open | in_progress | resolved | closed
    vote_count       INT DEFAULT 1,          -- incremented when same signal is submitted again
    semantic_hash    TEXT,                   -- SHA256(title:affects_feature) for dedup
    raw_query        TEXT,                   -- original user query that triggered this signal
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON crystal_product_signals (brand_id, status, signal_type);
CREATE INDEX ON crystal_product_signals (semantic_hash);
CREATE INDEX ON crystal_product_signals (org_id, created_at DESC);
CREATE INDEX ON crystal_product_signals (routing, status, signal_type);

COMMENT ON TABLE crystal_product_signals IS 'Feature requests and bugs extracted from Crystal conversations';
COMMENT ON COLUMN crystal_product_signals.routing IS 'platform = goes to Experient PM; brand = goes to brand support system';
COMMENT ON COLUMN crystal_product_signals.semantic_hash IS 'SHA256 prefix for deduplication — same hash increments vote_count';
