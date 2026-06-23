-- Notifications v2 — evolve the existing `notifications` table (from
-- 20240514000000_agents.sql) for the richer taxonomy in docs/notifications.
--
-- NOTE: the design doc proposed a NEW notifications table with
-- organizations(id)/users(id) FKs — those tables do not exist (org_id/user_id are
-- Clerk TEXT IDs everywhere). So we evolve the existing table additively and keep
-- full backward compatibility (the `read` boolean + `payload` stay).

-- The old CHECK limited type to 5 UPPER_SNAKE values; the new taxonomy uses dotted
-- lowercase types (survey.milestone, crystal.insight_ready, …). Drop the CHECK.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS priority     TEXT NOT NULL DEFAULT 'info'
    CHECK (priority IN ('critical','warning','info','success','digest')),
  ADD COLUMN IF NOT EXISTS action_url   TEXT,
  ADD COLUMN IF NOT EXISTS entity_type  TEXT,
  ADD COLUMN IF NOT EXISTS entity_id    TEXT,
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_v2
  ON notifications(user_id, created_at DESC)
  WHERE read = FALSE AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_priority
  ON notifications(user_id, priority, created_at DESC)
  WHERE read = FALSE AND dismissed_at IS NULL;

-- Deduplication log — prevents duplicate notifications for the same event within a window.
CREATE TABLE IF NOT EXISTS notification_dedup (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  entity_id     TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_notif_dedup UNIQUE (org_id, event_type, entity_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_notif_dedup_expiry ON notification_dedup(expires_at);

-- Per-type channel preferences (replaces the legacy channel-row model for the new API).
CREATE TABLE IF NOT EXISTS notification_type_preferences (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT        NOT NULL,
  user_id           TEXT        NOT NULL,
  notification_type TEXT        NOT NULL,
  in_app_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  email_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  slack_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  threshold_config  JSONB       NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notif_type_pref UNIQUE (org_id, user_id, notification_type)
);
CREATE INDEX IF NOT EXISTS idx_notif_type_pref_user ON notification_type_preferences(org_id, user_id);
