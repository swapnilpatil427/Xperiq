-- Tier 3 Phase K: Frequency Capping + Suppression List
-- Prevents over-contacting customers and manages unsubscribes/bounces.

-- ── Frequency cap rules ──────────────────────────────────────────────────────
-- Org-level rules: e.g., "max 2 emails per contact per 7 days"
CREATE TABLE IF NOT EXISTS notification_frequency_caps (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT        NOT NULL,
    channel     TEXT        NOT NULL CHECK (channel IN ('email','sms','push','in_app','slack','all')),
    max_count   INTEGER     NOT NULL CHECK (max_count > 0),
    window_hours INTEGER    NOT NULL CHECK (window_hours > 0),  -- rolling window
    is_active   BOOL        NOT NULL DEFAULT TRUE,
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, channel)
);

-- Per-contact send log (lightweight — purged after max window_hours)
CREATE TABLE IF NOT EXISTS contact_send_log (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT        NOT NULL,
    contact_id  UUID        REFERENCES contacts(id) ON DELETE CASCADE,
    user_id     TEXT,       -- for internal user notifications (not contact)
    channel     TEXT        NOT NULL,
    workflow_id TEXT,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast frequency checks
CREATE INDEX IF NOT EXISTS idx_send_log_contact_channel ON contact_send_log (org_id, contact_id, channel, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_send_log_user_channel ON contact_send_log (org_id, user_id, channel, sent_at DESC) WHERE user_id IS NOT NULL;
-- Cleanup index: delete rows older than 30 days (run by scheduler)
CREATE INDEX IF NOT EXISTS idx_send_log_cleanup ON contact_send_log (sent_at);

-- ── Suppression list ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_suppressions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL,
    -- Target: either email address OR contact_id (not both required)
    email           TEXT,
    contact_id      UUID        REFERENCES contacts(id) ON DELETE CASCADE,
    -- Suppression scope
    channel         TEXT        NOT NULL DEFAULT 'all' CHECK (channel IN ('email','sms','push','in_app','slack','all')),
    reason          TEXT        NOT NULL CHECK (reason IN ('unsubscribe','bounce','spam_complaint','gdpr_request','admin','invalid')),
    suppressed_by   TEXT,       -- user_id who added it, or 'system' for bounces
    notes           TEXT,
    -- For time-limited suppressions (null = permanent)
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppressions_email_channel ON notification_suppressions (org_id, email, channel) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppressions_contact_channel ON notification_suppressions (org_id, contact_id, channel) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppressions_email ON notification_suppressions (org_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppressions_contact ON notification_suppressions (org_id, contact_id) WHERE contact_id IS NOT NULL;

-- ── Delivery analytics events ─────────────────────────────────────────────────
-- Novu webhook events land here for delivery tracking
CREATE TABLE IF NOT EXISTS notification_delivery_events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT,
    novu_message_id TEXT,
    workflow_id     TEXT,
    subscriber_id   TEXT,
    channel         TEXT,
    event_type      TEXT        NOT NULL CHECK (event_type IN ('sent','delivered','opened','clicked','bounced','failed','unsubscribed')),
    metadata        JSONB       DEFAULT '{}',
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_org ON notification_delivery_events (org_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_events_workflow ON notification_delivery_events (org_id, workflow_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_events_subscriber ON notification_delivery_events (subscriber_id, occurred_at DESC);

-- Default frequency caps for new orgs (inserted by app logic, not migration)
COMMENT ON TABLE notification_frequency_caps IS 'Org-level rules: max N messages per contact per channel per rolling window.';
COMMENT ON TABLE contact_send_log IS 'Per-send log for frequency cap evaluation. Rows older than max window_hours are pruned.';
COMMENT ON TABLE notification_suppressions IS 'Permanent or time-limited suppression by email or contact_id. Reason tracks unsubscribes, bounces, GDPR requests.';
COMMENT ON TABLE notification_delivery_events IS 'Novu webhook delivery events: sent, delivered, opened, clicked, bounced, etc.';
