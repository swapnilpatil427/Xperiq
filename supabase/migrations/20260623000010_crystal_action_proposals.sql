-- Outcome tracking for Crystal action proposals
-- Tier 2 item 8: CRYSTAL_ACTION_SYSTEM_REDESIGN.md
-- Records whether Crystal recommendations are accepted / succeeded / failed / dismissed
-- so the system can learn from acted-on proposals and surface analytics.

CREATE TABLE IF NOT EXISTS crystal_action_proposals (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             TEXT        NOT NULL,
    brand_id           TEXT,
    survey_id          TEXT,
    proposal_key       TEXT,                              -- client-side proposal id (for idempotent upsert)
    type               TEXT        NOT NULL,
    params             JSONB       DEFAULT '{}',
    priority           TEXT        DEFAULT 'medium',
    business_rationale TEXT,
    confidence         REAL,
    status             TEXT        NOT NULL DEFAULT 'emitted',  -- emitted|accepted|dismissed|succeeded|failed
    outcome_ref        TEXT,                              -- id of created entity (workflow/alert/run)
    error_detail       TEXT,
    emitted_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crystal_action_proposals_org_status_idx
    ON crystal_action_proposals (org_id, status);

-- Unique per (org, proposal_key) so the outcome endpoint can UPSERT idempotently.
-- Partial index — rows without a proposal_key are not deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS crystal_action_proposals_org_key_uniq
    ON crystal_action_proposals (org_id, proposal_key)
    WHERE proposal_key IS NOT NULL;

COMMENT ON TABLE  crystal_action_proposals               IS 'Outcome tracking for Crystal action proposals (emitted/accepted/dismissed/succeeded/failed)';
COMMENT ON COLUMN crystal_action_proposals.proposal_key  IS 'Client-side proposal id used as the idempotency key for upserts (unique per org)';
COMMENT ON COLUMN crystal_action_proposals.type          IS 'Proposal action type (e.g. create_workflow, create_alert, trigger_run)';
COMMENT ON COLUMN crystal_action_proposals.status        IS 'Lifecycle status: emitted|accepted|dismissed|succeeded|failed';
COMMENT ON COLUMN crystal_action_proposals.outcome_ref   IS 'Id of the entity created when the proposal was acted on (workflow/alert/run)';
COMMENT ON COLUMN crystal_action_proposals.error_detail  IS 'Failure detail when status = failed';
