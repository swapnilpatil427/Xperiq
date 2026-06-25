-- Tier 3 Phase B: CX Case Management + SLA Engine
-- Accountable, trackable units of work for closed-loop XM actions.
-- Crystal proposes → user confirms → case created → SLA clocked → outcome recorded.
-- See docs/agent-framework/TIER3_XO_LEGENDARY_DESIGN.md §System 2 + §System 3

-- ── CX SLA Configuration ─────────────────────────────────────────────────────
-- Per-org SLA overrides; '' org_id = platform defaults (installed below).
-- Pattern mirrors bug_sla_configs from 20260623000005_bug_tracking.sql.
CREATE TABLE IF NOT EXISTS cx_sla_configs (
    org_id          TEXT        NOT NULL DEFAULT '',  -- '' = platform default
    category        TEXT        NOT NULL DEFAULT 'cx'
                        CHECK (category IN ('cx', 'esat', 'product', 'compliance')),
    severity        TEXT        NOT NULL
                        CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    ack_sla_hrs     INT         NOT NULL,             -- hours to acknowledge
    resolve_sla_hrs INT,                              -- hours to resolve (NULL = no deadline)
    PRIMARY KEY (org_id, category, severity)
);

-- Platform defaults (all categories)
INSERT INTO cx_sla_configs (org_id, category, severity, ack_sla_hrs, resolve_sla_hrs) VALUES
    ('', 'cx',         'critical', 2,  24),
    ('', 'cx',         'high',     8,  72),
    ('', 'cx',         'medium',   24, NULL),
    ('', 'cx',         'low',      72, NULL),
    ('', 'esat',       'critical', 2,  24),
    ('', 'esat',       'high',     8,  72),
    ('', 'esat',       'medium',   24, NULL),
    ('', 'esat',       'low',      72, NULL),
    ('', 'product',    'critical', 1,  48),
    ('', 'product',    'high',     4,  96),
    ('', 'product',    'medium',   24, NULL),
    ('', 'product',    'low',      72, NULL),
    ('', 'compliance', 'critical', 1,  8),
    ('', 'compliance', 'high',     2,  24),
    ('', 'compliance', 'medium',   8,  72),
    ('', 'compliance', 'low',      24, NULL)
ON CONFLICT DO NOTHING;


-- ── CX Cases ─────────────────────────────────────────────────────────────────
-- The accountable unit of work. Created from Crystal action proposals.
-- Every case is linked to: a contact (who), a response (what triggered it),
-- an insight/driver (why Crystal recommended), and a proposal (how it was created).
CREATE TABLE IF NOT EXISTS cx_cases (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL,

    -- Linked entities
    contact_id      UUID        REFERENCES contacts(id) ON DELETE SET NULL,
    response_id     UUID        REFERENCES responses(id) ON DELETE SET NULL,
    survey_id       UUID        REFERENCES surveys(id) ON DELETE SET NULL,
    insight_id      UUID,                            -- soft ref to insights table (no FK, different retention)
    driver_ref      TEXT,                            -- topic/driver label (e.g. "Wait Time")
    proposal_id     UUID        REFERENCES crystal_action_proposals(id) ON DELETE SET NULL,

    -- Case content
    title           TEXT        NOT NULL,
    description     TEXT,
    category        TEXT        NOT NULL DEFAULT 'cx'
                        CHECK (category IN ('cx', 'esat', 'product', 'compliance')),

    -- Lifecycle status
    status          TEXT        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'escalated', 'resolved', 'closed')),

    -- Severity (drives SLA calculation)
    severity        TEXT        NOT NULL DEFAULT 'medium'
                        CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- Ownership (resolved from ownership_routes at case creation)
    owner_user_id   TEXT,                            -- Clerk user_id
    owner_label     TEXT,                            -- display name (cached from Clerk)
    owner_role      TEXT,                            -- fallback role label if no user resolved

    -- SLA tracking
    ack_due_at      TIMESTAMPTZ,                     -- acknowledge SLA deadline
    resolve_due_at  TIMESTAMPTZ,                     -- resolve SLA deadline (NULL if no deadline)
    acked_at        TIMESTAMPTZ,                     -- when case was acknowledged (moved off 'open')
    sla_breached    BOOL        NOT NULL DEFAULT false,
    escalation_tier INT         NOT NULL DEFAULT 0,  -- increments on each breach

    -- External system references (sync targets, not sources of truth)
    external_refs   JSONB       NOT NULL DEFAULT '{}',
    -- Structure: {slack_ts: "...", jira_key: "...", sf_case_id: "...", servicenow_number: "..."}

    -- Resolution
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,

    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT        NOT NULL,             -- Clerk user_id who confirmed the proposal

    -- Append-only audit log (never update existing entries)
    -- Structure: [{ts, actor, action, from_status, to_status, note, metadata}]
    audit_log       JSONB       NOT NULL DEFAULT '[]'
);

-- Query indexes
CREATE INDEX IF NOT EXISTS cx_cases_org_status_idx ON cx_cases (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cx_cases_org_severity_idx ON cx_cases (org_id, severity, status);
CREATE INDEX IF NOT EXISTS cx_cases_contact_idx ON cx_cases (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cx_cases_survey_idx ON cx_cases (survey_id) WHERE survey_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cx_cases_owner_idx ON cx_cases (org_id, owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cx_cases_response_idx ON cx_cases (response_id) WHERE response_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cx_cases_proposal_idx ON cx_cases (proposal_id) WHERE proposal_id IS NOT NULL;

-- SLA monitoring index: find all cases nearing or past deadline efficiently
CREATE INDEX IF NOT EXISTS cx_cases_sla_monitor_idx ON cx_cases (resolve_due_at)
    WHERE sla_breached = false AND status NOT IN ('resolved', 'closed') AND resolve_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_cases_ack_monitor_idx ON cx_cases (ack_due_at)
    WHERE acked_at IS NULL AND status = 'open' AND ack_due_at IS NOT NULL;

COMMENT ON TABLE  cx_cases                IS 'CX case management. Created from Crystal proposals; tracks lifecycle, owner, SLA, and outcomes.';
COMMENT ON COLUMN cx_cases.audit_log      IS 'Append-only event log: [{ts, actor, action, from_status, to_status, note}]. Never mutate existing entries.';
COMMENT ON COLUMN cx_cases.external_refs  IS 'Sync target IDs. Case is Experient''s source of truth; external systems are mirrors.';
COMMENT ON COLUMN cx_cases.escalation_tier IS 'Increments on SLA breach. 0=assigned, 1=first escalation, 2+=escalation chain.';
COMMENT ON COLUMN cx_cases.driver_ref     IS 'XM driver/topic label that triggered Crystal''s recommendation (e.g. "Wait Time").';


-- ── Escalation Audit ─────────────────────────────────────────────────────────
-- Separate table for escalation history (high-write, separate from case audit_log JSONB)
CREATE TABLE IF NOT EXISTS cx_case_escalations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID        NOT NULL REFERENCES cx_cases(id) ON DELETE CASCADE,
    escalation_tier INT         NOT NULL,
    from_owner_id   TEXT,
    to_owner_id     TEXT,
    reason          TEXT        NOT NULL,
    triggered_by    TEXT        NOT NULL DEFAULT 'system', -- 'system' | user_id
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cx_case_escalations_case_idx ON cx_case_escalations (case_id, created_at DESC);
