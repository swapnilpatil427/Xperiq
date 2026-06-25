-- Tier 3 Phase J: Broadcast Approval Queue
-- Mass outreach to contact segments requires approval before Novu triggers.
-- Broadcasts enter 'pending_approval', then transition to 'approved' → 'sending' → 'sent'
-- or 'rejected'. Pending broadcasts auto-expire after 72 hours.

CREATE TABLE IF NOT EXISTS outreach_broadcasts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    -- Who created it and their intent
    created_by          TEXT        NOT NULL,
    description         TEXT,

    -- Target: either a segment_id or a list of contact_ids (JSON array of UUIDs)
    segment_id          UUID        REFERENCES contact_segments(id) ON DELETE SET NULL,
    contact_ids         JSONB,      -- ['uuid1', 'uuid2'] — for ad-hoc lists
    estimated_count     INTEGER     NOT NULL DEFAULT 0,

    -- Channel mix: which Novu workflow + channels to use
    workflow_id         TEXT        NOT NULL DEFAULT 'transactional-outreach',
    channels            TEXT[]      NOT NULL DEFAULT ARRAY['email'],
    -- Payload passed to the Novu workflow trigger
    payload             JSONB       NOT NULL DEFAULT '{}',

    -- Status machine: pending_approval → approved/rejected → sending → sent/failed
    status              TEXT        NOT NULL DEFAULT 'pending_approval'
                            CHECK (status IN ('pending_approval','approved','rejected','sending','sent','failed','expired')),

    -- Approval tracking
    approved_by         TEXT,
    approved_at         TIMESTAMPTZ,
    rejected_by         TEXT,
    rejected_at         TIMESTAMPTZ,
    rejection_reason    TEXT,
    expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),

    -- Delivery stats (populated as Novu webhooks come in)
    sent_count          INTEGER     NOT NULL DEFAULT 0,
    delivered_count     INTEGER     NOT NULL DEFAULT 0,
    failed_count        INTEGER     NOT NULL DEFAULT 0,
    open_count          INTEGER     NOT NULL DEFAULT 0,
    click_count         INTEGER     NOT NULL DEFAULT 0,

    -- Audit
    sent_at             TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    novu_job_id         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval audit trail (every approve/reject action is logged)
CREATE TABLE IF NOT EXISTS broadcast_audit_log (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id    UUID        NOT NULL REFERENCES outreach_broadcasts(id) ON DELETE CASCADE,
    actor_user_id   TEXT        NOT NULL,
    action          TEXT        NOT NULL CHECK (action IN ('created','submitted','approved','rejected','sent','failed','expired')),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_org_status ON outreach_broadcasts (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_segment ON outreach_broadcasts (segment_id) WHERE segment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_broadcast_audit ON broadcast_audit_log (broadcast_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_pending_expires
    ON outreach_broadcasts (expires_at)
    WHERE status = 'pending_approval';

-- Auto-expire broadcasts older than 72h (run periodically)
CREATE OR REPLACE FUNCTION expire_stale_broadcasts() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE outreach_broadcasts
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'pending_approval' AND expires_at < NOW()
        RETURNING id
    ), logged AS (
        INSERT INTO broadcast_audit_log (broadcast_id, actor_user_id, action, note)
        SELECT id, 'system', 'expired', 'Auto-expired after 72 hours' FROM expired
        RETURNING broadcast_id
    )
    SELECT COUNT(*) INTO expired_count FROM logged;
    RETURN expired_count;
END;
$$;

COMMENT ON TABLE outreach_broadcasts IS 'Mass outreach campaigns requiring admin approval. Audiences are contact segments or ad-hoc lists.';
COMMENT ON TABLE broadcast_audit_log IS 'Full audit trail of every state transition on a broadcast.';
COMMENT ON COLUMN outreach_broadcasts.expires_at IS 'Pending broadcasts auto-expire after 72h to prevent stale approvals.';
