-- Bug tracking system: structured bug reports with auto-severity, SLAs, and escalation audit trail
-- Phase 6: Bug Tracking at Scale (ENTERPRISE_CRYSTALOS_REDESIGN.md Part XV)

-- Internal event queue for bug alerts and SLA breach notifications
-- Named crystal_event_queue to avoid collision with the existing notification_events table
-- (20240521000003_notification_infrastructure.sql) which has a different schema.
CREATE TABLE IF NOT EXISTS crystal_event_queue (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type         TEXT        NOT NULL,
    payload      JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS crystal_event_queue_type_idx ON crystal_event_queue (type, created_at DESC);
CREATE INDEX IF NOT EXISTS crystal_event_queue_unprocessed_idx ON crystal_event_queue (created_at) WHERE processed_at IS NULL;

-- SLA configuration (per platform default + optional per-brand override)
-- brand_id = '' means platform-wide default; non-empty = brand-specific override
CREATE TABLE IF NOT EXISTS bug_sla_configs (
    brand_id    TEXT        NOT NULL DEFAULT '',
    severity    TEXT        NOT NULL,
    ack_sla_hrs INT         NOT NULL,
    fix_sla_hrs INT,
    PRIMARY KEY (brand_id, severity)
);

-- Platform defaults
INSERT INTO bug_sla_configs (brand_id, severity, ack_sla_hrs, fix_sla_hrs) VALUES
    ('', 'critical', 2,  24),
    ('', 'high',     8,  72),
    ('', 'medium',   24, NULL),
    ('', 'low',      72, NULL)
ON CONFLICT DO NOTHING;

-- Bug reports table (extends crystal_product_signals for bug-specific fields)
CREATE TABLE IF NOT EXISTS bug_reports (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id            UUID        REFERENCES crystal_product_signals(id) ON DELETE SET NULL,
    cluster_id           UUID,       -- forward reference to product_signal_clusters (migration 20260623000006)
    title                TEXT        NOT NULL,
    description          TEXT        NOT NULL,
    affects_feature      TEXT        NOT NULL,
    reproduction_steps   TEXT,
    conversation_excerpt TEXT,
    thread_id            TEXT,
    auto_severity        TEXT        NOT NULL CHECK (auto_severity IN ('low', 'medium', 'high', 'critical')),
    reported_severity    TEXT        CHECK (reported_severity IN ('low', 'medium', 'high', 'critical')),
    effective_severity   TEXT        GENERATED ALWAYS AS (
                             CASE
                                 WHEN auto_severity = 'critical'     THEN 'critical'
                                 WHEN reported_severity = 'critical' THEN 'critical'
                                 ELSE COALESCE(auto_severity, reported_severity, 'medium')
                             END
                         ) STORED,
    affected_org_count   INT         NOT NULL DEFAULT 1,
    affected_brand_count INT         NOT NULL DEFAULT 1,
    routing              TEXT        NOT NULL CHECK (routing IN ('platform', 'brand')),
    assigned_team        TEXT,
    status               TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    acknowledged_at      TIMESTAMPTZ,
    resolved_at          TIMESTAMPTZ,
    sla_deadline         TIMESTAMPTZ,
    sla_breached         BOOL        NOT NULL DEFAULT false,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bug_reports_status_severity_idx ON bug_reports (status, effective_severity);
CREATE INDEX IF NOT EXISTS bug_reports_sla_idx ON bug_reports (sla_deadline) WHERE sla_breached = false AND status != 'resolved';
CREATE INDEX IF NOT EXISTS bug_reports_team_idx ON bug_reports (assigned_team, status);

-- Track which orgs/brands have reported the same bug
CREATE TABLE IF NOT EXISTS bug_report_affected (
    bug_id      UUID        NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
    org_id      TEXT        NOT NULL,
    brand_id    TEXT,
    user_id     TEXT        NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bug_id, org_id)
);

CREATE INDEX IF NOT EXISTS bug_report_affected_org_idx ON bug_report_affected (org_id);

-- Escalation audit trail
CREATE TABLE IF NOT EXISTS bug_escalations (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    bug_id       UUID        NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
    from_sev     TEXT,
    to_sev       TEXT        NOT NULL,
    reason       TEXT        NOT NULL,
    triggered_by TEXT        NOT NULL,  -- 'auto' | user_id
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bug_escalations_bug_idx ON bug_escalations (bug_id, created_at DESC);
