-- Notification preferences per user/org/survey/channel
CREATE TABLE IF NOT EXISTS notification_preferences (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    survey_id   UUID REFERENCES surveys(id) ON DELETE CASCADE,
    channel     TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
    event_type  TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
    ON notification_preferences (org_id, user_id);

-- Notification delivery events
CREATE TABLE IF NOT EXISTS notification_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    survey_id    UUID REFERENCES surveys(id) ON DELETE SET NULL,
    event_type   TEXT NOT NULL,
    payload      JSONB NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'skipped')) DEFAULT 'pending',
    channel      TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- Fast query for pending in-app notifications
CREATE INDEX IF NOT EXISTS idx_notification_events_pending
    ON notification_events (org_id, user_id, status, created_at)
    WHERE status = 'pending';
