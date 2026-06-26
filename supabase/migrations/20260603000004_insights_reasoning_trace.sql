-- G26: AI Decision Audit Trail for insights
-- GDPR right to explanation + SOC2 compliance.
-- Stores the 3-5 decision-relevant fields per insight (NOT full pipeline state).

-- Handle both possible table names (insights vs insight_records)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'insights'
    ) THEN
        ALTER TABLE insights
            ADD COLUMN IF NOT EXISTS reasoning_trace JSONB;

        COMMENT ON COLUMN insights.reasoning_trace IS
            'AI decision audit trail per insight. Schema v1: '
            '{supporting_tool_results: string[], hallucination_score: float, '
            'eval_score: float, eval_issues: string[], model: string, schema_version: int}. '
            'Written by node_publish during pipeline run.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'insight_records'
    ) THEN
        ALTER TABLE insight_records
            ADD COLUMN IF NOT EXISTS reasoning_trace JSONB;

        COMMENT ON COLUMN insight_records.reasoning_trace IS
            'AI decision audit trail per insight. Schema v1: '
            '{supporting_tool_results: string[], hallucination_score: float, '
            'eval_score: float, eval_issues: string[], model: string, schema_version: int}. '
            'Written by node_publish during pipeline run.';
    END IF;
END $$;
