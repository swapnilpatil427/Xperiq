-- Tier 3 Phase E: Action Outcomes & Outcome Learning Loop
-- Empirical outcome tracking that feeds Crystal's skill confidence over time.
-- The platform gets smarter from every resolved case — no human curation required.
-- See docs/agent-framework/TIER3_XO_LEGENDARY_DESIGN.md §"The Outcome Learning Loop"

-- ── Action Outcomes ───────────────────────────────────────────────────────────
-- Measures the actual impact of a confirmed proposal after a case resolves.
-- Written by scheduler._outcome_measurement_sweep() 7 days after case resolution.
-- Feeds into skill_examples bank to calibrate future business_rationale estimates.
CREATE TABLE IF NOT EXISTS action_outcomes (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id         UUID        NOT NULL REFERENCES crystal_action_proposals(id) ON DELETE CASCADE,
    case_id             UUID        REFERENCES cx_cases(id) ON DELETE SET NULL,
    org_id              TEXT        NOT NULL,
    skill_name          TEXT,                            -- which skill produced the proposal

    -- Metric tracked (what was measured to assess outcome)
    metric              TEXT        NOT NULL
                            CHECK (metric IN (
                                'nps', 'csat', 'ces',
                                'case_resolution_days',
                                'detractor_recovery_rate',
                                'segment_nps_delta',
                                'response_volume',
                                'custom'
                            )),
    metric_label        TEXT,                            -- human-readable for custom metrics

    -- Measured values (baseline = at proposal time; post = at measurement time)
    baseline            NUMERIC,
    post_value          NUMERIC,
    delta               NUMERIC GENERATED ALWAYS AS (post_value - baseline) STORED,
    delta_pct           NUMERIC GENERATED ALWAYS AS (
                            CASE WHEN baseline IS NOT NULL AND baseline <> 0
                            THEN ROUND(((post_value - baseline) / ABS(baseline)) * 100, 2)
                            ELSE NULL END
                        ) STORED,

    -- When measured
    measured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Days between the action and this measurement. Populated by the caller at
    -- write time (cannot be GENERATED — it depends on the originating action's date).
    measurement_lag_days INT,

    -- Was this a positive outcome? (used to update skill confidence)
    is_positive         BOOL,                            -- true=improved, false=worsened, NULL=neutral

    -- Context for skill learning
    context_json        JSONB       NOT NULL DEFAULT '{}',
    -- Structure: {segment, account, driver, survey_type, case_severity, days_to_resolve,
    --             skill_confidence_at_proposal, owner_role, channel}

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_outcomes_proposal_idx ON action_outcomes (proposal_id);
CREATE INDEX IF NOT EXISTS action_outcomes_org_metric_idx ON action_outcomes (org_id, metric, measured_at DESC);
CREATE INDEX IF NOT EXISTS action_outcomes_skill_idx ON action_outcomes (skill_name, is_positive) WHERE skill_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS action_outcomes_case_idx ON action_outcomes (case_id) WHERE case_id IS NOT NULL;

COMMENT ON TABLE  action_outcomes            IS 'Empirical outcome measurement for Crystal proposals. Feeds skill confidence and example bank.';
COMMENT ON COLUMN action_outcomes.delta      IS 'post_value - baseline. Positive = improvement. NULL if either value is NULL.';
COMMENT ON COLUMN action_outcomes.is_positive IS 'Simplified signal for skill learning: did the proposal produce a positive outcome?';
COMMENT ON COLUMN action_outcomes.context_json IS 'Context at proposal time for skill retrieval: segment, severity, driver, skill confidence.';


-- ── Skill Confidence Cache ────────────────────────────────────────────────────
-- Aggregated empirical confidence per skill per proposal type per context cluster.
-- Written by scheduler; read by Crystal skill system to calibrate business_rationale.
-- Separate from skill_examples (which stores raw examples); this is the aggregate signal.
CREATE TABLE IF NOT EXISTS skill_confidence_cache (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL DEFAULT '',   -- '' = platform-wide aggregate
    skill_name      TEXT        NOT NULL,
    proposal_type   TEXT        NOT NULL,              -- 'create_case' | 'create_workflow' | etc.

    -- Context cluster (what situation this confidence applies to)
    dimension       TEXT,                              -- 'segment' | 'account' | 'driver'
    context_value   TEXT,                              -- e.g. 'Enterprise' | 'Wait Time'
    metric          TEXT,                              -- 'nps' | 'csat' | 'ces'

    -- Aggregated outcome signal
    outcome_count   INT         NOT NULL DEFAULT 0,
    positive_count  INT         NOT NULL DEFAULT 0,
    avg_delta       NUMERIC,                           -- average metric improvement
    p50_delta       NUMERIC,                           -- median improvement
    p90_delta       NUMERIC,                           -- 90th percentile improvement

    -- Derived confidence (0–1)
    empirical_confidence NUMERIC GENERATED ALWAYS AS (
        CASE WHEN outcome_count >= 3
        THEN LEAST(1.0, ROUND(positive_count::NUMERIC / outcome_count, 3))
        ELSE NULL END
    ) STORED,

    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expression-based uniqueness (NULL parts treated as '') requires a unique index —
-- Postgres does not allow expressions in an inline table UNIQUE constraint.
CREATE UNIQUE INDEX IF NOT EXISTS skill_confidence_uniq_idx
    ON skill_confidence_cache (org_id, skill_name, proposal_type, COALESCE(dimension, ''), COALESCE(context_value, ''), COALESCE(metric, ''));

CREATE INDEX IF NOT EXISTS skill_confidence_skill_idx ON skill_confidence_cache (skill_name, proposal_type);
CREATE INDEX IF NOT EXISTS skill_confidence_org_idx ON skill_confidence_cache (org_id, skill_name);

COMMENT ON TABLE  skill_confidence_cache IS 'Aggregated empirical confidence per skill/proposal/context. Crystal reads this to calibrate business_rationale.';
COMMENT ON COLUMN skill_confidence_cache.empirical_confidence IS 'NULL until >= 3 outcomes measured (prevents premature convergence on small samples).';
