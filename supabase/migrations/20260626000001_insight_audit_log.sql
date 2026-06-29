-- Insight audit log — per-insight LLM run audit trail.
-- Enables GDPR right-to-explanation and SOC2 audit compliance.
-- Referenced from ARCHITECTURE.md §3.3 and PIPELINE_SPEC.md §13.
-- This is a cold-storage table — write-once, read-rarely.
--
-- Replaces the Sprint-8 schema (insight_id PK, prompt_text blobs) from
-- 20240516000000_insights.sql — incompatible column layout, safe to drop.
DROP TABLE IF EXISTS insight_audit_log CASCADE;

CREATE TABLE insight_audit_log (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insight_id            UUID REFERENCES insights(id) ON DELETE CASCADE,
    run_id                TEXT,                    -- agent_runs.id (loosely typed for flexibility)
    survey_id             UUID NOT NULL,
    org_id                TEXT NOT NULL,
    checkpoint_id         UUID,                    -- insight_checkpoints_v2.id or NULL for custom
    model                 TEXT,
    temperature           NUMERIC(3,2),
    prompt_hash           TEXT,                    -- sha256(system_prompt + user_prompt)
    verifier_pass         BOOLEAN,
    verifier_score        NUMERIC(5,2),            -- 0–1 normalized
    verifier_notes        JSONB,                   -- array of issue strings
    hallucination_score   NUMERIC(5,2),            -- 0–1 (lower is better)
    citation_count        INT DEFAULT 0,
    citation_valid_count  INT DEFAULT 0,           -- for citation validity SLO tracking
    run_mode              TEXT,                    -- automated_incremental | manual_expert | etc.
    retrieved_context_ref TEXT,                    -- cold blob ref for full prompt+context (large)
    schema_version        INT NOT NULL DEFAULT 1,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by insight (GDPR right-to-explanation: given an insight, get its audit trail)
CREATE INDEX IF NOT EXISTS idx_insight_audit_insight_id
    ON insight_audit_log (insight_id);

-- Fast org-level SLO queries (citation_valid_count / citation_count over time)
CREATE INDEX IF NOT EXISTS idx_insight_audit_org_created
    ON insight_audit_log (org_id, created_at DESC);

-- Verifier pass rate queries for SLO dashboard
CREATE INDEX IF NOT EXISTS idx_insight_audit_verifier_pass
    ON insight_audit_log (verifier_pass, created_at DESC);

-- Run-level lookup (all insights from one pipeline run)
CREATE INDEX IF NOT EXISTS idx_insight_audit_run_id
    ON insight_audit_log (run_id);
