-- survey_metric_snapshots: one row per pipeline run capturing the survey's KPIs at that moment.
-- Powers NPS trend charts, velocity tracking, and anomaly detection in the dashboard.
CREATE TABLE IF NOT EXISTS survey_metric_snapshots (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id            UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id               TEXT        NOT NULL,
    run_id               UUID        REFERENCES agent_runs(id) ON DELETE SET NULL,
    captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_count       INT,
    nps                  FLOAT,
    nps_ci_low           FLOAT,
    nps_ci_high          FLOAT,
    nps_n                INT,
    promoter_pct         FLOAT,
    detractor_pct        FLOAT,
    passive_pct          FLOAT,
    csat                 FLOAT,
    completion_rate      FLOAT,
    effort_score         FLOAT,
    response_velocity_7d FLOAT,
    anomaly_flag         BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS survey_metric_snapshots_survey_time_idx
    ON survey_metric_snapshots (survey_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS survey_metric_snapshots_org_idx
    ON survey_metric_snapshots (org_id, captured_at DESC);

-- org_metric_snapshots: one row per scheduler tick, aggregated across all surveys in an org.
-- Powers the org-level overview dashboard (active surveys, total responses, avg NPS trend).
CREATE TABLE IF NOT EXISTS org_metric_snapshots (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               TEXT        NOT NULL,
    captured_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_survey_count  INT,
    total_responses      INT,
    avg_nps              FLOAT,
    avg_csat             FLOAT,
    avg_completion_rate  FLOAT,
    top_urgent_topic     TEXT,
    top_driver_topic     TEXT
);

CREATE INDEX IF NOT EXISTS org_metric_snapshots_org_time_idx
    ON org_metric_snapshots (org_id, captured_at DESC);
