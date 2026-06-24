-- Crystal Telemetry: structured turn events, user feedback, capability gaps, debug traces
-- Every Crystal interaction is structured data that powers the quality improvement pipeline.

-- Every Crystal turn — structured for quality analysis and improvement
CREATE TABLE crystal_turn_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT NOT NULL,
    brand_id        TEXT,
    user_id         TEXT NOT NULL,
    survey_id       TEXT,
    thread_id       TEXT NOT NULL,
    turn_index      INT NOT NULL,
    query           TEXT NOT NULL,
    response_tokens INT,
    tools_called    JSONB DEFAULT '[]',      -- [{tool, latency_ms, success}]
    tool_errors     JSONB DEFAULT '[]',      -- [{tool, code, message}]
    eval_score      DECIMAL(4,3),
    model_used      TEXT,
    tokens_in       INT,
    tokens_out      INT,
    latency_ms      INT,
    quality_signal  TEXT CHECK (quality_signal IN ('positive', 'negative', 'neutral')),
    specialist_used TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON crystal_turn_events (org_id, brand_id, created_at DESC);
CREATE INDEX ON crystal_turn_events (quality_signal) WHERE quality_signal IS NOT NULL;
CREATE INDEX ON crystal_turn_events (thread_id, turn_index);

-- User-submitted feedback (thumbs up/down on Crystal responses)
CREATE TABLE crystal_feedback (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_event_id  UUID REFERENCES crystal_turn_events(id) ON DELETE SET NULL,
    org_id         TEXT NOT NULL,
    brand_id       TEXT,
    user_id        TEXT NOT NULL,
    signal         SMALLINT NOT NULL CHECK (signal IN (-1, 1)),  -- -1=negative, 1=positive
    reason_code    TEXT,   -- "wrong_data", "not_actionable", "off_topic", "great"
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON crystal_feedback (org_id, signal, created_at DESC);
CREATE INDEX ON crystal_feedback (turn_event_id);

-- Skill quality aggregation — updated nightly by background job
CREATE TABLE skill_quality_metrics (
    skill_name          TEXT NOT NULL,
    org_id              TEXT NOT NULL,
    brand_id            TEXT,
    total_runs          INT DEFAULT 0,
    pass_count          INT DEFAULT 0,
    avg_eval_score      DECIMAL(4,3),
    positive_signals    INT DEFAULT 0,
    negative_signals    INT DEFAULT 0,
    p50_latency_ms      INT,
    p99_latency_ms      INT,
    last_updated        TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (skill_name, org_id, brand_id)
);

CREATE INDEX ON skill_quality_metrics (brand_id, avg_eval_score);

-- Queries Crystal couldn't answer — used for skill gap analysis and new skill development
CREATE TABLE crystal_capability_gaps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT NOT NULL,
    brand_id    TEXT,
    user_id     TEXT NOT NULL,
    query       TEXT NOT NULL,
    embedding   vector(1536),        -- pgvector for semantic clustering of gaps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON crystal_capability_gaps (org_id, created_at DESC);

-- Debug traces for post-hoc analysis (7-day retention)
CREATE TABLE crystal_debug_traces (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_event_id UUID REFERENCES crystal_turn_events(id) ON DELETE SET NULL,
    org_id        TEXT NOT NULL,
    brand_id      TEXT,
    trace         JSONB NOT NULL,    -- full debug trace payload (routing, context, eval)
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON crystal_debug_traces (org_id, created_at DESC);

COMMENT ON TABLE crystal_turn_events IS 'Structured record of every Crystal conversation turn for quality analysis';
COMMENT ON TABLE crystal_feedback IS 'Explicit thumbs up/down feedback from users on Crystal responses';
COMMENT ON TABLE skill_quality_metrics IS 'Aggregated quality metrics per skill, updated nightly';
COMMENT ON TABLE crystal_capability_gaps IS 'Queries Crystal could not answer — drives new skill development';
COMMENT ON TABLE crystal_debug_traces IS 'Full routing+eval traces for debugging; 7-day retention';
