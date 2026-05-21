-- Crystal Intelligence checkpoint blobs for point-in-time report snapshots
CREATE TABLE IF NOT EXISTS survey_insight_checkpoints (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id                   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    org_id                      TEXT NOT NULL,
    checkpoint_number           INT NOT NULL DEFAULT 1,
    trigger                     TEXT NOT NULL CHECK (trigger IN ('responses', 'days', 'manual', 'stream')),
    response_count_at_checkpoint INT NOT NULL DEFAULT 0,
    nps_at_checkpoint           NUMERIC(5,1),
    csat_at_checkpoint          NUMERIC(5,1),
    ces_at_checkpoint           NUMERIC(5,1),
    topic_fingerprint           TEXT,
    delta_from_prior            JSONB,
    report_url                  TEXT,
    schema_version              INT NOT NULL DEFAULT 1,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_survey_org_number
    ON survey_insight_checkpoints (survey_id, org_id, checkpoint_number DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoints_org_survey_created
    ON survey_insight_checkpoints (org_id, survey_id, created_at DESC);
