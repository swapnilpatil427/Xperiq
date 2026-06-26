-- Skill Quality: example bank for few-shot learning and quality tracking
-- skill_quality_metrics is defined in 20260623000002_crystal_telemetry.sql
-- This migration adds the skill_examples table for the few-shot example bank.

-- Few-shot examples from production (high-quality skill outputs)
-- Written by skill_runtime.py when eval_score >= SKILL_EXAMPLE_WRITE_THRESHOLD
CREATE TABLE skill_examples (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name    TEXT NOT NULL,
    skill_version TEXT NOT NULL DEFAULT '1.0.0',
    org_id        TEXT,
    eval_score    DECIMAL(4,3) NOT NULL,
    input_json    JSONB NOT NULL,
    output_json   JSONB NOT NULL,
    embedding     vector(1536),        -- pgvector for diversity-controlled dedup
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON skill_examples (skill_name, eval_score DESC);
CREATE INDEX ON skill_examples (skill_name, org_id);

-- Prune function: keep top-N examples per skill ordered by eval_score DESC
-- Called after each new example insert to enforce SKILL_EXAMPLE_MAX_PER_SKILL
CREATE OR REPLACE FUNCTION prune_skill_examples(
    p_skill_name TEXT,
    p_max_count  INT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM skill_examples
    WHERE skill_name = p_skill_name
      AND id NOT IN (
          SELECT id FROM skill_examples
          WHERE skill_name = p_skill_name
          ORDER BY eval_score DESC, created_at DESC
          LIMIT p_max_count
      );
END;
$$;

COMMENT ON TABLE skill_examples IS 'High-quality few-shot examples from production skill executions';
COMMENT ON COLUMN skill_examples.embedding IS 'For diversity-controlled dedup: near-duplicate examples are skipped';
