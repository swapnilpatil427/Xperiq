-- XOS Skill Examples Bank (G17 fix: replaces flat EXAMPLES.md)
-- Concurrent pipeline runs write examples safely without file corruption.
-- embedding_model column (G18 fix): ensures cosine search uses matching embedding space.

CREATE TABLE IF NOT EXISTS skill_examples (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name      TEXT NOT NULL,
    skill_version   TEXT NOT NULL,
    eval_score      FLOAT NOT NULL CHECK (eval_score >= 0 AND eval_score <= 1),
    input_json      JSONB NOT NULL,
    output_json     JSONB NOT NULL,
    -- G18: always store the model name alongside the embedding
    input_embedding vector(1536),                    -- NULL until embedding service wired
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    run_id          TEXT,
    org_id          UUID,                            -- NULL = shared across orgs
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_examples_skill_score
    ON skill_examples (skill_name, eval_score DESC);

CREATE INDEX IF NOT EXISTS idx_skill_examples_created
    ON skill_examples (created_at DESC);

-- Prune: keep top max_count rows per skill by eval_score DESC, then recency.
-- Called by skill_runtime after every successful write.
CREATE OR REPLACE FUNCTION prune_skill_examples(
    p_skill_name TEXT,
    max_count    INT DEFAULT 50
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM skill_examples
    WHERE skill_name = p_skill_name
      AND id NOT IN (
          SELECT id
          FROM skill_examples
          WHERE skill_name = p_skill_name
          ORDER BY eval_score DESC, created_at DESC
          LIMIT max_count
      );
END;
$$;

COMMENT ON TABLE skill_examples IS
    'Few-shot example bank for XOS skills. Replaces flat EXAMPLES.md (G17 fix). '
    'Runtime reads top-3 most similar examples per skill at inference time. '
    'Writes happen after every skill execution with eval_score >= SKILL_EXAMPLE_WRITE_THRESHOLD.';
